// ============================================================================
// /api/pods — Interactive GPU pod lifecycle (RunPod-style Jupyter + SSH).
//
// A pod is just a JOB with job_type = 'interactive_pod', dispatched through the
// same job-poll path every other job uses (GET /api/providers/jobs/next →
// buildNextPendingJob → daemon execute_job switch → run_interactive_pod). It is
// NOT routed through the dead heartbeat pending_tasks path.
//
// Security model (matches the rest of the job pipeline):
//   • requireRenter — renter API key auth (reused from jobs.js).
//   • task_spec is HMAC-signed with the SAME signTaskSpec() the daemon's
//     verify_task_spec_hmac expects (crypto.createHmac sha256 over the exact
//     stored task_spec JSON string, keyed by DC1_HMAC_SECRET). If the signature
//     scheme drifts, the daemon REJECTS every pod — so we reuse jobs.js's signer
//     verbatim rather than re-deriving it here.
//   • provider_id is PINNED on the row and the job is NOT handed to the
//     scheduler's tryAssign (which would overwrite provider_id) — an interactive
//     pod must land on the provider the renter (or auto-pick) chose.
//
// The provider daemon launches the container, then calls
// POST /api/jobs/:job_id/endpoint-ready (in jobs.js) which invokes pod-relay.sh
// on the VPS to publish the Jupyter + SSH ports and writes access_url /
// ssh_command back onto the job row. GET/DELETE here read/teardown that state.
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const db = require('../db');
const jobsRouter = require('./jobs');
const { getApiKeyFromReq, looksLikeProviderKey } = require('../middleware/auth');
const { invokePodRelay } = require('../lib/pod-relay');
const { COST_RATES } = require('./jobs');

// ── Pod billing ──────────────────────────────────────────────────────────────
// Contract (same as jobs.js /submit): cost_halala on the row IS pre-debited
// renter money. Launch debits the full-duration quote; stop/expiry settles
// against it (refund unused, credit provider 75%). The daemon's job-result
// settle path then no-ops because status has left 'running'.
const MAX_ACTIVE_PODS_PER_RENTER = Math.max(1, Number.parseInt(process.env.DCP_MAX_ACTIVE_PODS || '2', 10) || 2);
const PROVIDER_EARN_SHARE = 0.75; // keep in sync with providers.js job-result split

function resolvePodRate(provider) {
  const providerRate = Number(provider?.cost_per_gpu_second_halala);
  if (Number.isFinite(providerRate) && providerRate >= 0) return providerRate;
  return (COST_RATES['interactive_pod'] || COST_RATES['default']) / 60;
}

function resolvePodGpuCount(provider) {
  const n = Number.parseInt(provider?.gpu_count, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 64) : 1;
}

function computePodQuoteHalala({ durationSeconds, ratePerGpuSecond, gpuCount }) {
  return Math.max(0, Math.ceil(durationSeconds * ratePerGpuSecond * gpuCount));
}

// Pure settlement math for a renter-initiated stop. Charge is clamped at the
// prepaid quote: stopping early refunds the difference; stopping late (clock
// skew) never charges beyond what was debited.
function computePodStopSettlement({ costHalala, startedAtMs, nowMs, ratePerGpuSecond, gpuCount }) {
  const prepaid = Math.max(0, Math.round(Number(costHalala) || 0));
  const elapsedSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);
  const rawCost = Math.ceil(elapsedSeconds * ratePerGpuSecond * gpuCount);
  const actualCostHalala = Math.min(prepaid, Math.max(0, rawCost));
  const providerEarnedHalala = Math.floor(actualCostHalala * PROVIDER_EARN_SHARE);
  return {
    elapsedSeconds: Math.round(elapsedSeconds),
    actualCostHalala,
    providerEarnedHalala,
    dc1FeeHalala: actualCostHalala - providerEarnedHalala,
    refundHalala: prepaid - actualCostHalala,
  };
}

// Reuse the EXACT same HMAC signer the rest of the job pipeline uses. This is
// load-bearing: signTaskSpec === crypto.createHmac('sha256', HMAC_SECRET)
//   .update(taskSpec).digest('hex'), and the daemon recomputes the same hex
// over the same task_spec string. Importing it (instead of re-implementing)
// guarantees the two stay in lock-step across secret-rotation / refactors.
const signTaskSpec = jobsRouter.signTaskSpec;

// Pod defaults / bounds.
const DEFAULT_POD_IMAGE = 'dcp-compute:pytorch';
// Friendly aliases → PRE-BAKED dcp-compute image tags. These ship sshd (and, for
// pytorch, Jupyter) baked in, so the daemon starts them natively without
// injecting SSH (bootstrap=false → fast start). "pytorch" is the default when no
// image is given.
const ALIASES = {
  pytorch: 'dcp-compute:pytorch',
  vllm: 'dcp-compute:vllm',
  cuda: 'dcp-compute:cuda',
  ubuntu: 'dcp-compute:ubuntu',
};
// A safe Docker image reference. The daemon passes this as a single argv element
// (no shell), and it is HMAC-signed into the task_spec, so the real defense is a
// charset+length guard: must start alphanumeric (blocks leading '-' → docker
// flags) and contain only image-ref characters (blocks spaces, ';', '|', '$',
// backticks, quotes). Permissive enough for private registries with ports
// (registry.io:5000/org/img:tag@sha256:...); docker validates the exact structure
// at pull time and fails closed if it's malformed.
const IMAGE_REF_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,255}$/;

// Returns { image, bootstrap } or { error, code }. bootstrap=true means the
// daemon must inject SSH (the image is an ARBITRARY renter-chosen image, not a
// DCP pre-baked one).
//
// Resolution order:
//   • null / no image → default pre-baked pytorch (bootstrap=false).
//   • friendly alias (pytorch|vllm|cuda|ubuntu) → pre-baked dcp-compute:<alias>
//     (bootstrap=false).
//   • any literal dcp-compute:<x> tag → pre-baked DCP image (bootstrap=false).
//   • ANY other valid Docker ref (passes IMAGE_REF_RE, length<=256) → ARBITRARY
//     image, ALLOWED, with bootstrap=true (the daemon injects sshd).
//   • malformed / oversized ref → reject with code INVALID_IMAGE.
function validatePodImage(raw) {
  if (raw == null) return { image: DEFAULT_POD_IMAGE, bootstrap: false };
  if (typeof raw !== 'string' || raw.length > 256 || !IMAGE_REF_RE.test(raw)) {
    return { error: 'image must be a valid Docker image reference, e.g. "pytorch" (alias) or "tensorflow/tensorflow:latest-gpu"', code: 'INVALID_IMAGE' };
  }
  // Friendly alias → pre-baked image, native start (no SSH injection).
  if (Object.prototype.hasOwnProperty.call(ALIASES, raw)) {
    return { image: ALIASES[raw], bootstrap: false };
  }
  // Any literal dcp-compute:<x> tag is a DCP pre-baked image too.
  if (/^dcp-compute:[\w.-]+$/.test(raw)) {
    return { image: raw, bootstrap: false };
  }
  // Otherwise it's an arbitrary, valid image → allowed, daemon injects SSH.
  return { image: raw, bootstrap: true };
}
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 24 * 60; // 24h ceiling for an interactive session
const DEFAULT_DURATION_MINUTES = 60;
const TEN_MINUTES_MS = 10 * 60 * 1000;

// Mirrors the renter VRAM floor for an interactive GPU pod (consumer tier).
const POD_MIN_VRAM_MIB = 8 * 1024;

// Same weak-token policy enforced on Jupyter jobs in jobs.js (DCP-SEC-001).
// A pod hands out a publicly-reachable Jupyter URL; a guessable token is RCE.
const WEAK_TOKENS = new Set(['dc1jupyter', '', 'jupyter', 'password', 'token', 'notebook', 'admin']);

function isWeakToken(token) {
  if (!token || typeof token !== 'string') return true;
  const trimmed = token.trim();
  if (trimmed.length < 16) return true;
  return WEAK_TOKENS.has(trimmed.toLowerCase());
}

// Strong, URL-safe random secret (used for root_password; also a sane default
// jupyter_token if the renter omits one). 32 hex chars = 128 bits.
function generateStrongSecret() {
  return crypto.randomBytes(16).toString('hex');
}

// Renter auth — same contract as jobs.js requireRenter (x-renter-key / renter_key
// / key), with the H1 guard rejecting provider-prefixed keys on a renter path.
function requireRenter(req, res, next) {
  const key = getApiKeyFromReq(req, {
    headerName: 'x-renter-key',
    queryNames: ['renter_key', 'key'],
  });
  if (!key) {
    return res.status(401).json({ error: 'Renter API key required (x-renter-key header or renter_key query)' });
  }
  if (looksLikeProviderKey(key)) {
    return res.status(401).json({ error: 'Wrong key type: provider key cannot be used on renter endpoint', code: 'wrong_key_type' });
  }

  // Scoped sub-key first (same precedence as v1.js): a sub-key carries an
  // explicit scopes array; the master renters.api_key is full-access (scopes
  // left null → treated as "all" by requireComputeScope). req.renterScopes is
  // the JSON-parsed scopes for a sub-key, or null for a master key.
  const now = new Date().toISOString();
  const scopedKey = db.get(
    `SELECT k.id AS key_id, k.scopes, k.expires_at, r.*
       FROM renter_api_keys k
       JOIN renters r ON r.id = k.renter_id
      WHERE k.key = ? AND r.status = 'active' AND k.revoked_at IS NULL`,
    key
  );
  if (scopedKey) {
    if (scopedKey.expires_at && scopedKey.expires_at < now) {
      return res.status(403).json({ error: 'API key has expired', code: 'authentication_key_expired' });
    }
    let scopes = [];
    try {
      scopes = JSON.parse(scopedKey.scopes || '[]');
    } catch (parseErr) {
      console.error('[pods] corrupted scopes JSON for key', scopedKey.key_id, parseErr.message);
    }
    const { key_id: _k, scopes: _s, expires_at: _e, ...renter } = scopedKey;
    req.renter = renter;
    req.renterScopes = scopes;
    return next();
  }

  // Fall back to the master renter key (full access).
  const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
  if (!renter) {
    return res.status(403).json({ error: 'Invalid or inactive renter API key' });
  }
  req.renter = renter;
  req.renterScopes = null;
  next();
}

// Compute-scope gate for pod launch. A master renter key (req.renterScopes ===
// null) is full-access. A scoped sub-key must carry 'compute' or 'admin' to
// launch a GPU pod; otherwise 403. Mounted only on POST /api/pods.
function requireComputeScope(req, res, next) {
  const scopes = req.renterScopes;
  if (scopes == null) return next();
  if (scopes.includes('compute') || scopes.includes('admin')) return next();
  return res.status(403).json({
    error: 'API key does not have compute scope',
    code: 'authentication_scope_missing',
  });
}

function toFiniteInt(value, { min = null, max = null } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

// Resolve the provider this pod must run on. Either the renter pins one
// (validated against the capable-online query — same shape as jobs.js:4692) or
// we auto-pick the freshest, least-busy capable provider.
function resolvePodProvider(requestedProviderId) {
  const tenMinAgo = new Date(Date.now() - TEN_MINUTES_MS).toISOString();

  if (requestedProviderId != null) {
    const provider = db.get(
      `SELECT p.id, p.name, p.gpu_model, p.cost_per_gpu_second_halala, p.gpu_count
         FROM providers p
        WHERE p.id = ?
          AND p.status = 'online'
          AND COALESCE(p.is_paused, 0) = 0
          AND p.last_heartbeat >= ?
          AND COALESCE(NULLIF(p.gpu_vram_mib, 0), NULLIF(p.vram_gb, 0) * 1024,
                     NULLIF(CAST(json_extract(p.readiness_details, '$.vram_gb') AS INTEGER), 0) * 1024, 0) >= ?
          AND COALESCE(json_extract(p.readiness_details, '$.docker'), 0) = 1
          AND COALESCE(json_extract(p.readiness_details, '$.cuda_available'), 0) = 1
          AND COALESCE(json_extract(p.gpu_status, '$.gpu_healthy'), 1) = 1
          AND NOT EXISTS (
            SELECT 1 FROM jobs jp
             WHERE jp.provider_id = p.id
               AND jp.job_type = 'interactive_pod'
               AND jp.status IN ('queued','assigned','pulling','running'))`,
      requestedProviderId, tenMinAgo, POD_MIN_VRAM_MIB
    );
    if (!provider) {
      return { error: 'provider_not_available', message: 'Requested provider is offline, paused, stale, below the pod VRAM floor, or lacks Docker+CUDA capability' };
    }
    return { provider };
  }

  // Auto-pick: freshest capable provider with the fewest active jobs.
  const provider = db.get(
    `SELECT p.id, p.name, p.gpu_model, p.cost_per_gpu_second_halala, p.gpu_count,
            COUNT(CASE WHEN j.status IN ('assigned','pulling','running','pending','queued') THEN 1 END) AS active_jobs
       FROM providers p
  LEFT JOIN jobs j ON j.provider_id = p.id
      WHERE p.status = 'online'
        AND COALESCE(p.is_paused, 0) = 0
        AND p.last_heartbeat >= ?
        AND COALESCE(NULLIF(p.gpu_vram_mib, 0), NULLIF(p.vram_gb, 0) * 1024,
                     NULLIF(CAST(json_extract(p.readiness_details, '$.vram_gb') AS INTEGER), 0) * 1024, 0) >= ?
        AND COALESCE(json_extract(p.readiness_details, '$.docker'), 0) = 1
        AND COALESCE(json_extract(p.readiness_details, '$.cuda_available'), 0) = 1
        AND COALESCE(json_extract(p.gpu_status, '$.gpu_healthy'), 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM jobs jp
           WHERE jp.provider_id = p.id
             AND jp.job_type = 'interactive_pod'
             AND jp.status IN ('queued','assigned','pulling','running'))
      GROUP BY p.id
      ORDER BY active_jobs ASC, p.last_heartbeat DESC
      LIMIT 1`,
    tenMinAgo, POD_MIN_VRAM_MIB
  );
  if (!provider) {
    return { error: 'no_provider_available', message: 'No online provider currently has Docker+CUDA capability and meets the interactive-pod VRAM floor' };
  }
  return { provider };
}

// Workspace durability TIER, derived from the stored, HMAC-signed task_spec:
//   portable  — paid rented volume (workspace_s3): snapshot on stop, restore on ANY provider.
//   provider  — free same-provider volume (workspace_volume only): /workspace stays on THIS
//               provider and reattaches to the renter's next pod there, at zero cost.
//   ephemeral — neither (legacy / pre-volume rows): /workspace dies with the pod.
// Never hardcoded, so the pod view always tells the renter the truth.
function podWorkspaceTier(job) {
  try {
    const spec = job.task_spec ? JSON.parse(job.task_spec) : null;
    if (spec && spec.workspace_s3) return 'portable';
    if (spec && spec.workspace_volume) return 'provider';
    return 'ephemeral';
  } catch {
    return 'ephemeral';
  }
}

// The honest, renter-facing line about workspace durability for a given tier.
function workspaceNote(tier, providerName) {
  const where = providerName || 'this provider';
  switch (tier) {
    case 'portable':
      return 'Files in /workspace are durable: snapshotted to your rented volume on stop and restored to your next pod on ANY provider — survives this provider going offline.';
    case 'provider':
      return `Files in /workspace stay on ${where} for free and reattach to your next pod there when it is online and free. They are NOT copied to other providers — rent a volume (POST /api/volumes) for guaranteed cross-provider durability.`;
    default:
      return '⚠️ EPHEMERAL — everything in /workspace is DELETED when this pod stops. Download anything you need before stopping.';
  }
}

// Shape a job row into the public pod view.
function toPodView(job) {
  const tier = podWorkspaceTier(job);
  return {
    id: job.job_id,
    status: job.status,
    access_url: job.access_url || null,
    ssh_command: job.ssh_command || null,
    provider_id: job.provider_id ?? null,
    provider_name: job.provider_name || null,
    duration_minutes: job.duration_minutes ?? null,
    submitted_at: job.submitted_at || job.created_at || null,
    started_at: job.started_at || null,
    // Rental clock — the #1 surprise in the first live renter test (a pod
    // 'crashing' was just the rental ending). Null until the pod is running.
    ends_at: (job.started_at && job.max_duration_seconds)
      ? new Date(Date.parse(job.started_at) + Number(job.max_duration_seconds) * 1000).toISOString()
      : null,
    seconds_remaining: (job.started_at && job.max_duration_seconds)
      ? Math.max(0, Math.round((Date.parse(job.started_at) + Number(job.max_duration_seconds) * 1000 - Date.now()) / 1000))
      : null,
    workspace_tier: tier,                          // ephemeral | provider (free) | portable (paid)
    workspace_persisted: tier !== 'ephemeral',     // back-compat boolean for #617 consumers
    workspace_note: workspaceNote(tier, job.provider_name),
  };
}

// ── POST /api/pods — launch an interactive GPU pod ──────────────────────────
// Body: { provider_id?, duration_minutes?, params: { NOTEBOOK_TOKEN } }
// ── GET /api/pods — list the renter's pods ──────────────────────────────────
router.get('/', requireRenter, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = db.all(
      `SELECT j.*, p.name AS provider_name
         FROM jobs j
    LEFT JOIN providers p ON p.id = j.provider_id
        WHERE j.renter_id = ? AND j.job_type = 'interactive_pod'
        ORDER BY j.created_at DESC LIMIT ?`,
      req.renter.id, limit
    );
    return res.json({ pods: rows.map(toPodView) });
  } catch (error) {
    console.error('[pods] list error:', error.message);
    return res.status(500).json({ error: 'Failed to list pods' });
  }
});

router.post('/', requireRenter, requireComputeScope, (req, res) => {
  try {
    // Concurrency quota: a renter may hold at most N live pods.
    const activePods = db.get(
      `SELECT COUNT(*) AS n FROM jobs
        WHERE renter_id = ? AND job_type = 'interactive_pod'
          AND status IN ('pending','queued','assigned','pulling','running')`,
      req.renter.id
    );
    if (Number(activePods?.n || 0) >= MAX_ACTIVE_PODS_PER_RENTER) {
      return res.status(409).json({
        error: `Active pod limit reached (${MAX_ACTIVE_PODS_PER_RENTER}). Stop a running pod before launching another.`,
        code: 'POD_QUOTA_EXCEEDED',
      });
    }

    const body = req.body || {};
    const params = body.params && typeof body.params === 'object' ? body.params : {};

    // Duration bounds.
    const durationMinutes = toFiniteInt(body.duration_minutes, {
      min: MIN_DURATION_MINUTES,
      max: MAX_DURATION_MINUTES,
    }) || DEFAULT_DURATION_MINUTES;

    // Reject weak Jupyter tokens (same policy as jobs.js:1238). The token is
    // baked into a publicly-reachable access_url, so a guessable value is RCE.
    const notebookToken = params.NOTEBOOK_TOKEN;
    if (notebookToken != null && isWeakToken(notebookToken)) {
      return res.status(400).json({
        error: 'NOTEBOOK_TOKEN must be a unique, non-default value of at least 16 characters. Generate a random token (e.g. a UUID) and pass it as params.NOTEBOOK_TOKEN.',
        code: 'WEAK_NOTEBOOK_TOKEN',
      });
    }
    const jupyterToken = notebookToken && typeof notebookToken === 'string'
      ? notebookToken.trim()
      : generateStrongSecret();
    const rootPassword = generateStrongSecret();

    // Renter-chosen image (Vast.ai-style). Validated against the allow-list;
    // non-default images get SSH injected by the daemon.
    const imageResult = validatePodImage(body.image);
    if (imageResult.error) {
      return res.status(400).json({ error: imageResult.error, code: imageResult.code });
    }

    // Optional pinned provider — must be a positive integer when provided.
    let requestedProviderId = null;
    if (body.provider_id != null) {
      requestedProviderId = toFiniteInt(body.provider_id, { min: 1 });
      if (requestedProviderId == null) {
        return res.status(400).json({ error: 'provider_id must be a positive integer' });
      }
    }

    const resolution = resolvePodProvider(requestedProviderId);
    if (resolution.error) {
      return res.status(resolution.error === 'provider_not_available' ? 409 : 503).json({
        error: resolution.message,
        code: resolution.error.toUpperCase(),
        retry_after_seconds: 60,
      });
    }
    const provider = resolution.provider;

    // ── Quote + pre-debit (the prepaid contract job-result settles against) ──
    const ratePerGpuSecond = resolvePodRate(provider);
    const quoteGpuCount = resolvePodGpuCount(provider);
    const quoteHalala = computePodQuoteHalala({
      durationSeconds: durationMinutes * 60,
      ratePerGpuSecond,
      gpuCount: quoteGpuCount,
    });
    if (quoteHalala > 0) {
      const debit = db.prepare(
        `UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ?
          WHERE id = ? AND balance_halala >= ?`
      ).run(quoteHalala, new Date().toISOString(), req.renter.id, quoteHalala);
      if (debit.changes !== 1) {
        const row = db.get(`SELECT balance_halala FROM renters WHERE id = ?`, req.renter.id);
        const balanceHalala = Math.max(0, Number(row?.balance_halala || 0));
        return res.status(402).json({
          error: {
            message: `Insufficient balance for this pod. Available: ${(balanceHalala / 100).toFixed(2)} SAR, required: ${(quoteHalala / 100).toFixed(2)} SAR for ${durationMinutes} minutes. Unused time is refunded when you stop the pod early.`,
            type: 'insufficient_balance',
            code: 'insufficient_balance',
            status: 402,
            retryable: false,
          },
          balance_sar: Number((balanceHalala / 100).toFixed(2)),
          required_sar: Number((quoteHalala / 100).toFixed(2)),
        });
      }
    }

    // Build the task_spec EXACTLY as the daemon's run_interactive_pod expects,
    // then sign the serialized string. The stored task_spec string and the
    // signed bytes MUST be identical (the daemon recomputes the HMAC over the
    // task_spec it receives) — so we stringify once and reuse that exact string.
    const taskSpecObj = {
      image: imageResult.image,
      jupyter_token: jupyterToken,
      root_password: rootPassword,
      duration_minutes: durationMinutes,
    };
    // Tell the daemon to inject SSH (the image is not the DCP-baked default).
    if (imageResult.bootstrap) taskSpecObj.bootstrap_ssh = true;

    // Tier 1 (free, ALWAYS): pin a stable per-renter named volume so /workspace
    // persists on the provider and reattaches to the renter's next pod there at
    // zero marginal cost (the daemon reuses the named volume and never deletes it
    // on teardown). renter.id is server-derived (requireRenter) — never from the
    // body — and the whole task_spec is HMAC-signed, so a renter cannot mount
    // another renter's dcp-ws-r<id>.
    taskSpecObj.workspace_volume = `dcp-ws-r${req.renter.id}`;
    let workspaceTier = 'provider';
    try {
      const { activeVolumeForRenter } = require('./volumes');
      const vol = activeVolumeForRenter(req.renter.id);
      if (vol && process.env.WORKSPACE_S3_ENDPOINT && process.env.WORKSPACE_S3_KEY) {
        // Tier 2 (paid, portable): add S3 coordinates so the daemon RESTORES on
        // launch and SNAPSHOTS on teardown — survives this provider going offline
        // and follows the renter to ANY provider.
        taskSpecObj.workspace_s3 = {
          endpoint: process.env.WORKSPACE_S3_ENDPOINT,
          bucket: vol.bucket,
          access_key: process.env.WORKSPACE_S3_KEY,
          secret_key: process.env.WORKSPACE_S3_SECRET,
        };
        workspaceTier = 'portable';
      }
    } catch (volErr) {
      console.error('[pods] volume lookup failed (free same-provider tier still applies):', volErr.message);
    }
    const taskSpecStr = JSON.stringify(taskSpecObj);
    const taskSpecHmac = signTaskSpec(taskSpecStr);

    const job_id = 'pod-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const maxDurationSeconds = durationMinutes * 60;
    const now = new Date().toISOString();
    let insertedOk = false;

    // Insert with provider_id PINNED and status 'queued'. buildNextPendingJob
    // selects status IN ('pending','queued') AND (provider_id = ? OR NULL), so a
    // pinned 'queued' row is delivered to this provider on its next poll. We do
    // NOT call the scheduler's tryAssign, which would overwrite provider_id.
    try {
      db.prepare(
        `INSERT INTO jobs
           (job_id, provider_id, renter_id, job_type, status,
            task_spec, task_spec_hmac, duration_minutes, max_duration_seconds,
            cost_halala, submitted_at, created_at)
         VALUES (?, ?, ?, 'interactive_pod', 'queued', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        job_id,
        provider.id,
        req.renter.id,
        taskSpecStr,
        taskSpecHmac,
        durationMinutes,
        maxDurationSeconds,
        quoteHalala,
        now,
        now
      );
      insertedOk = true;
    } finally {
      // Compensate the pre-debit if the row never landed — never hold money
      // against a pod that does not exist.
      if (!insertedOk && quoteHalala > 0) {
        try {
          db.prepare(`UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`)
            .run(quoteHalala, req.renter.id);
        } catch (refundErr) {
          console.error(`[pods] CRITICAL: failed to refund ${quoteHalala} halala to renter ${req.renter.id} after insert failure:`, refundErr.message);
        }
      }
    }

    console.log(`[pods] Renter ${req.renter.id} launched interactive_pod ${job_id} on provider ${provider.id} (${durationMinutes}m)`);

    return res.status(201).json({
      id: job_id,
      status: 'starting',
      provider_id: provider.id,
      root_password: rootPassword,
      jupyter_token: jupyterToken,
      duration_minutes: durationMinutes,
      ends_at_hint: 'rental clock starts when the pod reaches running; see GET /api/pods/:id for ends_at',
      workspace_tier: workspaceTier,
      workspace_persisted: workspaceTier !== 'ephemeral',
      workspace_note: workspaceNote(workspaceTier, provider.name),
      quoted_cost_halala: quoteHalala,
      quoted_cost_sar: Number((quoteHalala / 100).toFixed(2)),
      rate_halala_per_gpu_second: ratePerGpuSecond,
      gpu_count: quoteGpuCount,
      billing: 'prepaid — unused minutes are refunded when you stop the pod early',
    });
  } catch (error) {
    console.error('[pods] launch error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to launch pod' });
  }
});

// ── GET /api/pods/:id — pod status + access details ─────────────────────────
router.get('/:id', requireRenter, (req, res) => {
  try {
    const job = db.get(
      `SELECT j.*, p.name AS provider_name
         FROM jobs j
    LEFT JOIN providers p ON p.id = j.provider_id
        WHERE (j.job_id = ? OR j.id = ?) AND j.job_type = 'interactive_pod'`,
      req.params.id, req.params.id
    );
    if (!job) {
      return res.status(404).json({ error: 'Pod not found' });
    }
    if (job.renter_id !== req.renter.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(toPodView(job));
  } catch (error) {
    console.error('[pods] status error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch pod' });
  }
});

// ── DELETE /api/pods/:id — stop a pod + tear down its VPS relay ──────────────
router.delete('/:id', requireRenter, (req, res) => {
  try {
    // Renter folded into the lookup: unknown id and someone else's pod are both
    // 404, so pod ids cannot be enumerated.
    const job = db.get(
      `SELECT * FROM jobs
        WHERE (job_id = ? OR id = ?) AND job_type = 'interactive_pod' AND renter_id = ?`,
      req.params.id, req.params.id, req.renter.id
    );
    if (!job) {
      return res.status(404).json({ error: 'Pod not found' });
    }

    // Idempotent: already in a terminal state — report it, settle nothing.
    if (['completed', 'failed', 'stopped', 'cancelled'].includes(job.status)) {
      return res.json({ id: job.job_id, status: job.status });
    }

    const now = new Date().toISOString();
    const nowMs = Date.now();
    let settlement = null;

    // Settle inside one transaction so a crash can never leave the renter
    // debited with no terminal job state (or the provider half-credited).
    db.transaction(() => {
      if (job.status === 'running') {
        const provider = db.get(
          `SELECT cost_per_gpu_second_halala, gpu_count FROM providers WHERE id = ?`,
          job.provider_id
        );
        const startedAtMs = Date.parse(job.started_at || job.submitted_at || now) || nowMs;
        settlement = computePodStopSettlement({
          costHalala: job.cost_halala,
          startedAtMs,
          nowMs,
          ratePerGpuSecond: resolvePodRate(provider),
          gpuCount: resolvePodGpuCount(provider),
        });

        db.prepare(
          `UPDATE jobs SET status = 'stopped', completed_at = ?, duration_seconds = ?,
                  actual_cost_halala = ?, provider_earned_halala = ?, dc1_fee_halala = ?
            WHERE id = ? AND status = 'running'`
        ).run(now, settlement.elapsedSeconds, settlement.actualCostHalala,
          settlement.providerEarnedHalala, settlement.dc1FeeHalala, job.id);

        if (settlement.providerEarnedHalala > 0) {
          db.prepare(
            `UPDATE providers
                SET total_earnings = total_earnings + ?,
                    claimable_earnings_halala = claimable_earnings_halala + ?,
                    total_jobs = total_jobs + 1, current_job_id = NULL
              WHERE id = ?`
          ).run(settlement.providerEarnedHalala / 100, settlement.providerEarnedHalala, job.provider_id);
        }

        db.prepare(
          `UPDATE renters
              SET balance_halala = balance_halala + ?,
                  total_spent_halala = total_spent_halala + ?, total_jobs = total_jobs + 1
            WHERE id = ?`
        ).run(settlement.refundHalala, settlement.actualCostHalala, job.renter_id);
      } else {
        // Never started (pending/queued/assigned/pulling): cancel + full refund.
        db.prepare(
          `UPDATE jobs SET status = 'cancelled', completed_at = ?, refunded_at = ? WHERE id = ?`
        ).run(now, now, job.id);
        const prepaid = Math.max(0, Math.round(Number(job.cost_halala) || 0));
        if (prepaid > 0 && !job.refunded_at) {
          db.prepare(`UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`)
            .run(prepaid, job.renter_id);
        }
        settlement = { actualCostHalala: 0, refundHalala: prepaid, elapsedSeconds: 0 };
      }
    })();

    // Best-effort relay teardown — kill the VPS socat forwarders. The daemon's
    // hold-loop will independently observe the terminal status and stop the
    // container; relay stop just frees the public ports immediately.
    try {
      invokePodRelay(['stop', job.job_id]);
    } catch (relayErr) {
      console.error(`[pods] relay stop failed for ${job.job_id}:`, relayErr.message);
    }

    console.log(`[pods] Renter ${req.renter.id} stopped pod ${job.job_id} — charged ${settlement.actualCostHalala} halala, refunded ${settlement.refundHalala}`);
    return res.json({
      id: job.job_id,
      status: job.status === 'running' ? 'stopped' : 'cancelled',
      charged_halala: settlement.actualCostHalala,
      charged_sar: Number((settlement.actualCostHalala / 100).toFixed(2)),
      refunded_halala: settlement.refundHalala,
      refunded_sar: Number((settlement.refundHalala / 100).toFixed(2)),
      ran_seconds: settlement.elapsedSeconds,
      workspace_note: (() => {
        const t = podWorkspaceTier(job);
        if (t === 'portable') return 'Your /workspace was snapshotted to your rented volume and will restore on your next pod on any provider.';
        if (t === 'provider') return `Your /workspace is kept on ${job.provider_name || 'this provider'} and will reattach to your next pod there.`;
        return 'This pod was ephemeral — /workspace has been deleted.';
      })(),
    });
  } catch (error) {
    console.error('[pods] stop error:', error.message);
    return res.status(500).json({ error: 'Failed to stop pod' });
  }
});

// ── POST /api/pods/:id/extend — add time to a running pod (no restart) ───────
// Charges the incremental quote at the SAME rate, pushes max_duration_seconds.
// The daemon re-reads the deadline on its next hold-loop poll (≤7s), so the
// pod never stops and the renter keeps the same workspace + Jupyter token.
router.post('/:id/extend', requireRenter, (req, res) => {
  try {
    const addMinutes = toFiniteInt(req.body && req.body.extend_minutes, {
      min: MIN_DURATION_MINUTES,
      max: MAX_DURATION_MINUTES,
    });
    if (addMinutes == null) {
      return res.status(400).json({ error: `extend_minutes must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`, code: 'INVALID_EXTEND' });
    }

    const job = db.get(
      `SELECT * FROM jobs
        WHERE (job_id = ? OR id = ?) AND job_type = 'interactive_pod' AND renter_id = ?`,
      req.params.id, req.params.id, req.renter.id
    );
    if (!job) return res.status(404).json({ error: 'Pod not found' });
    if (job.status !== 'running') {
      return res.status(409).json({ error: `Pod is ${job.status}; only a running pod can be extended`, code: 'NOT_RUNNING' });
    }

    // 24h hard ceiling on total rental.
    const currentSeconds = Math.max(0, Number(job.max_duration_seconds) || (Number(job.duration_minutes) || 0) * 60);
    const addSeconds = addMinutes * 60;
    if ((currentSeconds + addSeconds) > MAX_DURATION_MINUTES * 60) {
      const remaining = Math.max(0, MAX_DURATION_MINUTES * 60 - currentSeconds);
      return res.status(409).json({
        error: `Extending by ${addMinutes} min would exceed the 24-hour pod ceiling. You can add at most ${Math.floor(remaining / 60)} more minutes.`,
        code: 'EXCEEDS_MAX',
      });
    }

    // Incremental quote at the provider's current rate (same as launch).
    const provider = db.get(`SELECT cost_per_gpu_second_halala, gpu_count FROM providers WHERE id = ?`, job.provider_id);
    const ratePerGpuSecond = resolvePodRate(provider);
    const gpuCount = resolvePodGpuCount(provider);
    const addQuoteHalala = computePodQuoteHalala({ durationSeconds: addSeconds, ratePerGpuSecond, gpuCount });

    // Atomic debit — refuse if balance can't cover the extension.
    if (addQuoteHalala > 0) {
      const debit = db.prepare(
        `UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ?
          WHERE id = ? AND balance_halala >= ?`
      ).run(addQuoteHalala, new Date().toISOString(), req.renter.id, addQuoteHalala);
      if (debit.changes !== 1) {
        const row = db.get(`SELECT balance_halala FROM renters WHERE id = ?`, req.renter.id);
        const balanceHalala = Math.max(0, Number(row?.balance_halala || 0));
        return res.status(402).json({
          error: {
            message: `Insufficient balance to extend. Available: ${(balanceHalala / 100).toFixed(2)} SAR, needed: ${(addQuoteHalala / 100).toFixed(2)} SAR for ${addMinutes} more minutes.`,
            type: 'insufficient_balance', code: 'insufficient_balance', status: 402, retryable: false,
          },
          balance_sar: Number((balanceHalala / 100).toFixed(2)),
          required_sar: Number((addQuoteHalala / 100).toFixed(2)),
        });
      }
    }

    // Push the deadline + grow the prepaid quote. The daemon picks up the new
    // max_duration_seconds on its next poll; the reaper trusts it over the
    // launch-time docker label.
    const newSeconds = currentSeconds + addSeconds;
    db.prepare(
      `UPDATE jobs SET max_duration_seconds = ?, duration_minutes = ?, cost_halala = COALESCE(cost_halala, 0) + ? WHERE id = ?`
    ).run(newSeconds, Math.round(newSeconds / 60), addQuoteHalala, job.id);

    const endsAt = job.started_at
      ? new Date(Date.parse(job.started_at) + newSeconds * 1000).toISOString()
      : null;
    console.log(`[pods] Renter ${req.renter.id} extended pod ${job.job_id} by ${addMinutes}m (+${addQuoteHalala} halala); new total ${Math.round(newSeconds/60)}m`);
    return res.json({
      id: job.job_id,
      status: 'running',
      added_minutes: addMinutes,
      charged_halala: addQuoteHalala,
      charged_sar: Number((addQuoteHalala / 100).toFixed(2)),
      total_minutes: Math.round(newSeconds / 60),
      ends_at: endsAt,
      seconds_remaining: endsAt ? Math.max(0, Math.round((Date.parse(endsAt) - Date.now()) / 1000)) : null,
      note: 'Pod keeps running — same workspace and Jupyter token. Unused time is refunded if you stop early.',
    });
  } catch (error) {
    console.error('[pods] extend error:', error.message);
    return res.status(500).json({ error: 'Failed to extend pod' });
  }
});

module.exports = router;
module.exports.computePodStopSettlement = computePodStopSettlement;
module.exports.computePodQuoteHalala = computePodQuoteHalala;
module.exports.requireRenter = requireRenter;
