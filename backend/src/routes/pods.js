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
  const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
  if (!renter) {
    return res.status(403).json({ error: 'Invalid or inactive renter API key' });
  }
  req.renter = renter;
  next();
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
      `SELECT p.id, p.name, p.gpu_model
         FROM providers p
        WHERE p.id = ?
          AND p.status = 'online'
          AND COALESCE(p.is_paused, 0) = 0
          AND p.last_heartbeat >= ?
          AND COALESCE(NULLIF(p.gpu_vram_mib, 0), NULLIF(p.vram_gb, 0) * 1024,
                     NULLIF(CAST(json_extract(p.readiness_details, '$.vram_gb') AS INTEGER), 0) * 1024, 0) >= ?
          AND COALESCE(json_extract(p.readiness_details, '$.docker'), 0) = 1
          AND COALESCE(json_extract(p.readiness_details, '$.cuda_available'), 0) = 1`,
      requestedProviderId, tenMinAgo, POD_MIN_VRAM_MIB
    );
    if (!provider) {
      return { error: 'provider_not_available', message: 'Requested provider is offline, paused, stale, below the pod VRAM floor, or lacks Docker+CUDA capability' };
    }
    return { provider };
  }

  // Auto-pick: freshest capable provider with the fewest active jobs.
  const provider = db.get(
    `SELECT p.id, p.name, p.gpu_model,
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

// Shape a job row into the public pod view.
function toPodView(job) {
  return {
    id: job.job_id,
    status: job.status,
    access_url: job.access_url || null,
    ssh_command: job.ssh_command || null,
  };
}

// ── POST /api/pods — launch an interactive GPU pod ──────────────────────────
// Body: { provider_id?, duration_minutes?, params: { NOTEBOOK_TOKEN } }
// ── GET /api/pods — list the renter's pods ──────────────────────────────────
router.get('/', requireRenter, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = db.all(
      `SELECT * FROM jobs WHERE renter_id = ? AND job_type = 'interactive_pod' ORDER BY created_at DESC LIMIT ?`,
      req.renter.id, limit
    );
    return res.json({ pods: rows.map(toPodView) });
  } catch (error) {
    console.error('[pods] list error:', error.message);
    return res.status(500).json({ error: 'Failed to list pods' });
  }
});

router.post('/', requireRenter, (req, res) => {
  try {
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
    const taskSpecStr = JSON.stringify(taskSpecObj);
    const taskSpecHmac = signTaskSpec(taskSpecStr);

    const job_id = 'pod-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const maxDurationSeconds = durationMinutes * 60;
    const now = new Date().toISOString();

    // Insert with provider_id PINNED and status 'queued'. buildNextPendingJob
    // selects status IN ('pending','queued') AND (provider_id = ? OR NULL), so a
    // pinned 'queued' row is delivered to this provider on its next poll. We do
    // NOT call the scheduler's tryAssign, which would overwrite provider_id.
    db.prepare(
      `INSERT INTO jobs
         (job_id, provider_id, renter_id, job_type, status,
          task_spec, task_spec_hmac, duration_minutes, max_duration_seconds,
          submitted_at, created_at)
       VALUES (?, ?, ?, 'interactive_pod', 'queued', ?, ?, ?, ?, ?, ?)`
    ).run(
      job_id,
      provider.id,
      req.renter.id,
      taskSpecStr,
      taskSpecHmac,
      durationMinutes,
      maxDurationSeconds,
      now,
      now
    );

    console.log(`[pods] Renter ${req.renter.id} launched interactive_pod ${job_id} on provider ${provider.id} (${durationMinutes}m)`);

    return res.status(201).json({
      id: job_id,
      status: 'starting',
      provider_id: provider.id,
      root_password: rootPassword,
      jupyter_token: jupyterToken,
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
      `SELECT * FROM jobs WHERE (job_id = ? OR id = ?) AND job_type = 'interactive_pod'`,
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
    const job = db.get(
      `SELECT * FROM jobs WHERE (job_id = ? OR id = ?) AND job_type = 'interactive_pod'`,
      req.params.id, req.params.id
    );
    if (!job) {
      return res.status(404).json({ error: 'Pod not found' });
    }
    if (job.renter_id !== req.renter.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE jobs SET status = 'stopped', completed_at = ? WHERE id = ?`
    ).run(now, job.id);

    // Best-effort relay teardown — kill the VPS socat forwarders. The daemon's
    // hold-loop will independently observe status left {running,...} and stop
    // the container; relay stop just frees the public ports immediately.
    try {
      invokePodRelay(['stop', job.job_id]);
    } catch (relayErr) {
      console.error(`[pods] relay stop failed for ${job.job_id}:`, relayErr.message);
    }

    console.log(`[pods] Renter ${req.renter.id} stopped pod ${job.job_id}`);
    return res.json({ id: job.job_id, status: 'stopped' });
  } catch (error) {
    console.error('[pods] stop error:', error.message);
    return res.status(500).json({ error: 'Failed to stop pod' });
  }
});

module.exports = router;
