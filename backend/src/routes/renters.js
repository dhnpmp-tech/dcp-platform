const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db');
const { COST_RATES } = require('./jobs');
const { sendDataExportReady } = require('../services/emailService');
const { renterAccountDeletionLimiter, renterDataExportLimiter, registerLimiter, agentRegisterLimiter } = require('../middleware/rateLimiter');
const {
  getDiscoveryStatus,
  resolveProviders,
  listProviders,
  buildShadowCycleSummary,
} = require('../services/p2p-discovery');
const { reconcileRenterByEmailFromSupabase } = require('../services/renter-identity-reconciliation');
const { findActiveAccountByEmail, buildConflictResponse } = require('../services/cross-role-uniqueness');
const { sendOtp: sendOtpAtRegister } = require('../services/auth-otp');
const { isPublicWebhookUrl } = require('../lib/webhook-security');
const { toRfc3339 } = require('../lib/iso-datetime');
const { validateWebhookUrl, validateWebhookUrlValue } = require('../middleware/validateWebhookUrl');
const { validateBody } = require('../middleware/validate');
const { renterRegisterSchema, renterTopupSchema, renterAgentRegisterSchema } = require('../schemas/topup.schema');
const { getBearerToken, isAdminRequest, looksLikeRenterKey } = require('../middleware/auth');
const { toRenterProviderView, toRenterJobView } = require('../lib/renter-job-view');
const analytics = require('../services/analyticsService');
const conversionFunnel = require('../services/conversionFunnelService');
const { getRenterPaidCreditState } = require('../services/podAccessPolicy');
const {
  buildMinimumBalanceReadiness,
} = require('../services/minimumBalanceReadiness');
const {
  buildTeamUsageReadiness,
} = require('../services/teamUsageReadiness');

function flattenRunParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
  return db.prepare(sql).run(...flattenRunParams(params));
}

const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
}

function normalizeEmail(value) {
  const normalized = normalizeString(value, { maxLen: 254 })?.toLowerCase() || null;
  if (!normalized || !EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

// DCP-885: enforce HTTPS-only (http:// rejected to prevent SSRF via plaintext HTTP channels)
function normalizeWebhookUrl(value) {
  if (value == null) return null;
  const normalized = normalizeString(value, { maxLen: 500 });
  if (!normalized) return null;
  if (!isPublicWebhookUrl(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function toFiniteNumber(value, { min = null, max = null } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toFiniteInt(value, { min = null, max = null } = {}) {
  const num = toFiniteNumber(value, { min, max });
  if (num == null || !Number.isInteger(num)) return null;
  return num;
}

function parseDiscoveryMode(rawMode) {
  const normalized = String(rawMode || '').toLowerCase();
  if (normalized === 'sqlite' || normalized === 'shadow' || normalized === 'p2p-primary') {
    return normalized;
  }
  return null;
}

function parseBoolLike(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseCachedModels(rawCachedModels) {
  if (!rawCachedModels) return [];
  if (Array.isArray(rawCachedModels)) {
    return rawCachedModels
      .map((entry) => normalizeString(entry, { maxLen: 200 }))
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(rawCachedModels);
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalizeString(entry, { maxLen: 200 })).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

const ORG_ROLES = ['owner', 'admin', 'member', 'read-only'];
const ORG_ROLE_RANK = new Map(ORG_ROLES.map((role, idx) => [role, idx]));

function deriveOrgId(renter) {
  const orgName = normalizeString(renter?.organization, { maxLen: 160 })?.toLowerCase();
  if (orgName) {
    const slug = orgName
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    if (slug) return `org:${slug}`;
  }
  return `renter:${renter?.id || 'unknown'}`;
}

function parseScopes(rawScopes) {
  if (Array.isArray(rawScopes)) return rawScopes.filter(Boolean);
  if (typeof rawScopes !== 'string') return [];
  try {
    const parsed = JSON.parse(rawScopes);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeOrgRole(rawRole) {
  const role = normalizeString(rawRole, { maxLen: 16 })?.toLowerCase() || null;
  return role && ORG_ROLE_RANK.has(role) ? role : null;
}

function inferRoleFromScopes(scopes) {
  const scoped = Array.isArray(scopes) ? scopes : [];
  if (scoped.includes('admin')) return 'admin';
  const readOnlyScopes = new Set(['billing', 'balance.read', 'jobs.read']);
  if (scoped.length > 0 && scoped.every((scope) => readOnlyScopes.has(scope))) return 'read-only';
  return 'member';
}

// RENT-3: make scoped sub-keys actually enforce their scopes on read endpoints.
// Master keys (renters.api_key) resolve via getRenterAuthContext with
// actorType:'master_key' and scopes:['admin'], so they bypass every check below.
// For scoped sub-keys we require the key to hold at least one scope from `allowed`;
// a key that only holds an unrelated scope (e.g. a default/inference key hitting a
// billing-only read) is rejected with 403. This turns the "billing" checkbox into a
// real privilege instead of a no-op.
function hasReadScope(authCtx, allowed) {
  if (!authCtx) return false;
  if (authCtx.actorType === 'master_key') return true;
  const scopes = Array.isArray(authCtx.scopes) ? authCtx.scopes : [];
  if (scopes.includes('admin')) return true;
  return scopes.some((scope) => allowed.includes(scope));
}

function recordOrgAudit(entry) {
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO org_audit_log
       (org_id, actor_type, actor_id, actor_role, renter_id, action, resource_type, resource_id, outcome, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.org_id || 'org:unknown',
      entry.actor_type || 'unknown',
      entry.actor_id || null,
      entry.actor_role || 'unknown',
      entry.renter_id || null,
      entry.action,
      entry.resource_type || 'renter',
      entry.resource_id || null,
      entry.outcome,
      entry.reason || null,
      entry.metadata_json || null,
      now
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[org-audit] Failed to write audit record:', err?.message || err);
    }
  }
}

function getRenterAuthContext(rawKey) {
  if (!rawKey) return null;

  const master = db.get(
    `SELECT id, organization
     FROM renters
     WHERE api_key = ? AND status = 'active'`,
    rawKey
  );
  if (master) {
    return {
      renter: master,
      actorType: 'master_key',
      actorId: `renter:${master.id}`,
      keyId: null,
      role: 'owner',
      orgId: deriveOrgId(master),
      scopes: ['admin'],
    };
  }

  const scoped = db.get(
    `SELECT k.id, k.scopes, k.org_id, k.org_role, r.id AS renter_id, r.organization
     FROM renter_api_keys k
     JOIN renters r ON r.id = k.renter_id
     WHERE k.key = ?
       AND k.revoked_at IS NULL
       AND (k.expires_at IS NULL OR k.expires_at > ?)
       AND r.status = 'active'`,
    rawKey,
    new Date().toISOString()
  );
  if (!scoped) return null;

  const scopes = parseScopes(scoped.scopes);
  return {
    renter: { id: scoped.renter_id, organization: scoped.organization },
    actorType: 'scoped_key',
    actorId: scoped.id,
    keyId: scoped.id,
    role: normalizeOrgRole(scoped.org_role) || inferRoleFromScopes(scopes),
    orgId: scoped.org_id || deriveOrgId({ id: scoped.renter_id, organization: scoped.organization }),
    scopes,
  };
}

function buildProviderShapeFromSQLiteRow(row, now) {
  const heartbeatAge = row.last_heartbeat
    ? Math.floor((now - new Date(row.last_heartbeat).getTime()) / 1000)
    : null;

  return {
    id: row.id,
    peer_id: row.p2p_peer_id || null,
    name: row.name,
    gpu_model: row.gpu_name_detected || row.gpu_model,
    vram_gb: row.gpu_vram_mib ? Math.round(row.gpu_vram_mib / 1024) : null,
    vram_mib: row.gpu_vram_mib,
    gpu_count: row.gpu_count_reported || 1,
    driver_version: row.gpu_driver,
    compute_capability: row.gpu_compute_capability,
    cuda_version: row.gpu_cuda_version,
    status: row.status,
    is_live: heartbeatAge !== null && heartbeatAge < 120,
    location: row.location,
    reliability_score: row.reliability_score,
    cached_models: parseCachedModels(row.cached_models),
    discovery_source: 'sqlite',
    discovered_at: null,
    stale: false,
  };
}

function buildProviderShapeFromDHT(row, resolution, now) {
  const env = resolution?.environment || {};
  const providerRecord = resolution?.provider || {};
  const envVramMb = env.vram_gb != null ? Math.round(Number(env.vram_gb) * 1024) : null;
  const cachedModels = Array.isArray(env.tags) && env.tags.length > 0
    ? env.tags
    : parseCachedModels(row.cached_models);
  const heartbeatAge = row.last_heartbeat
    ? Math.floor((now - new Date(row.last_heartbeat).getTime()) / 1000)
    : null;
  const heartbeatLive = heartbeatAge !== null && heartbeatAge < 120;
  const dhtStale = Boolean(resolution?.stale);

  return {
    id: row.id,
    peer_id: row.p2p_peer_id || null,
    name: row.name,
    gpu_model: env.gpu_model || row.gpu_name_detected || row.gpu_model,
    vram_gb: env.vram_gb != null ? env.vram_gb : (row.gpu_vram_mib ? Math.round(row.gpu_vram_mib / 1024) : null),
    vram_mib: envVramMb != null ? envVramMb : row.gpu_vram_mib,
    gpu_count: env.available_slots || row.gpu_count_reported || 1,
    driver_version: env.driver_version || row.gpu_driver,
    compute_capability: env.compute_capability || row.gpu_compute_capability || null,
    cuda_version: env.cuda_version || row.gpu_cuda_version || null,
    status: dhtStale ? 'degraded' : row.status || 'online',
    is_live: heartbeatLive && !dhtStale,
    location: env.region || row.location,
    reliability_score: Number(env.reliability_score ?? row.reliability_score ?? 0),
    cached_models: cachedModels,
    discovery_source: 'dht',
    discovered_at: providerRecord.announced_at || null,
    addrs: providerRecord.addrs || [],
    stale: dhtStale,
  };
}

function buildProviderShapeFromDHTRecord(resolution) {
  const envEnvelope = resolution?.environment || {};
  const providerRecord = resolution?.provider || {};
  const env = envEnvelope.env || {};
  const envVramMb = env.vram_gb != null ? Math.round(Number(env.vram_gb) * 1024) : null;
  const cachedModels = Array.isArray(env.tags) && env.tags.length > 0
    ? env.tags
    : [];
  const dhtStale = Boolean(resolution?.stale);

  return {
    id: null,
    peer_id: providerRecord.peer_id || null,
    name: null,
    gpu_model: env.gpu_model || null,
    vram_gb: env.vram_gb != null ? env.vram_gb : null,
    vram_mib: envVramMb,
    gpu_count: env.available_slots || 1,
    driver_version: env.driver_version || null,
    compute_capability: env.compute_capability || null,
    cuda_version: env.cuda_version || null,
    status: dhtStale ? 'degraded' : 'online',
    is_live: !dhtStale,
    location: env.region || null,
    reliability_score: Number(env.reliability_score || 0),
    cached_models: cachedModels,
    discovery_source: 'dht',
    discovered_at: providerRecord.announced_at || null,
    addrs: providerRecord.addrs || [],
    stale: dhtStale,
  };
}

const ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ROTATIONS_PER_WINDOW = 3;

function isRotationRateLimited(accountType, accountId) {
  const cutoff = new Date(Date.now() - ROTATION_WINDOW_MS).toISOString();
  const row = db.get(
    `SELECT COUNT(*) AS rotation_count
     FROM api_key_rotations
     WHERE account_type = ? AND account_id = ? AND rotated_at >= ?`,
    accountType,
    accountId,
    cutoff
  );
  return Number(row?.rotation_count || 0) >= MAX_ROTATIONS_PER_WINDOW;
}

function recordRotationEvent(accountType, accountId, rotatedAt) {
  runStatement(
    'INSERT INTO api_key_rotations (account_type, account_id, rotated_at) VALUES (?, ?, ?)',
    accountType,
    accountId,
    rotatedAt
  );
}

function csvField(value) {
  const stringValue = value == null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function hashedDeletedEmail(rawEmail, accountId) {
  const isTestRuntime = Boolean(process.env.JEST_WORKER_ID) || process.env.DC1_DB_PATH === ':memory:';
  if (isTestRuntime) {
    return `deleted_${accountId}@deleted.dcp.sa`;
  }
  const normalized = normalizeEmail(rawEmail) || `deleted-renter-${accountId}@dcp.sa`;
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  return `deleted_${digest}@deleted.dcp.sa`;
}

// POST /api/renters/register
//
// Two-step magic-link flow (DCP onboarding bundle 2026-05-09).
// ─────────────────────────────────────────────────────────────────────────
// Before: this endpoint synchronously inserted a renter row with status='active',
//   minted an api_key, granted the 1000-halala starter balance, and returned
//   the api_key in the response body. This let *anyone* with any (typoed,
//   throwaway, abusive) email farm credits without proving ownership.
//
// After: we pre-stage the row with status='pending' (no api_key, no balance),
//   then send a magic-link sign-in email via auth-otp.sendOtp(). When the
//   user clicks the link, /auth/verify → POST /api/auth/magic-link finalizes
//   the row: mints the api_key, flips status='active', credits 1000 halala
//   on the *first* magic-link click, and fires the welcome email there.
//
//   The finalization is idempotent — clicking the link twice (or a stale
//   link landing after the row is already active) returns the same api_key
//   without double-crediting the balance. See routes/auth.js.
router.post('/register', registerLimiter, validateBody(renterRegisterSchema), async (req, res) => {
  try {
    const { name, email, organization, use_case, useCase, phone } = req.body;
    const cleanName = normalizeString(name, { maxLen: 120 });
    const cleanEmail = normalizeEmail(email);
    const cleanOrg = normalizeString(organization, { maxLen: 160 });
    // Keep frontend labels and persisted payload aligned: both `use_case` and legacy `useCase` are accepted.
    const cleanUseCase = normalizeString(use_case ?? useCase, { maxLen: 120 });
    const cleanPhone = normalizeString(phone, { maxLen: 40 });

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ error: 'Missing required fields: name, email' });
    }

    // Dual-role allowed: the historical hard block (see migration 006) was
    // softened on 2026-05-09 because real users (Tareq, Fadi) hit it during
    // onboarding. The same email can now hold both a provider and a renter
    // row. We log cross-role state for visibility.
    const conflict = findActiveAccountByEmail(db, cleanEmail);
    if (conflict && conflict.role !== 'renter') {
      console.log(`[renters/register] dual-role onboarding: ${cleanEmail} already has ${conflict.role} (id=${conflict.id})`);
    }

    const now = new Date().toISOString();
    const existing = db.get(
      'SELECT id, status, api_key FROM renters WHERE LOWER(email) = LOWER(?)',
      cleanEmail
    );

    let renterId;
    if (existing) {
      if (existing.status === 'active' && existing.api_key) {
        // Already verified — don't leak the api_key, but resend a magic link
        // so they can sign back in. This avoids the 409 dead-end that real
        // users hit when they re-submit the form.
        console.log(`[renters/register] resend magic link for already-active ${cleanEmail}`);
        renterId = existing.id;
      } else if (existing.status === 'pending') {
        // Refresh the staged row's profile fields — user may have corrected a typo.
        runStatement(
          `UPDATE renters
              SET name = ?, organization = ?, use_case = ?, phone = ?, updated_at = ?
            WHERE id = ?`,
          cleanName, cleanOrg || null, cleanUseCase || null, cleanPhone || null, now, existing.id
        );
        renterId = existing.id;
      } else {
        // Other states (e.g. soft-deleted) — surface the legacy duplicate path.
        return res.status(409).json({ error: 'A renter with this email already exists' });
      }
    } else {
      // Pre-stage: status='pending', NO api_key, NO starter balance.
      // The api_key column is UNIQUE NOT NULL, so we satisfy it with a
      // disposable placeholder that is rotated to a real `dcp-renter-…`
      // key during magic-link finalization. Placeholder is namespaced so
      // it can never be confused with a real key by route auth handlers.
      const pendingPlaceholder = 'pending-renter-' + crypto.randomBytes(16).toString('hex');
      const result = runStatement(
        `INSERT INTO renters (name, email, api_key, organization, use_case, phone, status, balance_halala, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        cleanName, cleanEmail, pendingPlaceholder, cleanOrg || null, cleanUseCase || null, cleanPhone || null, now
      );
      renterId = result.lastInsertRowid;
    }

    // Send the magic link. Even if email delivery fails we don't roll the row
    // back — the user can retry by re-submitting the form (we resend above).
    const otpResult = await sendOtpAtRegister(cleanEmail, { requestedRole: 'renter' });
    if (!otpResult || otpResult.success !== true) {
      console.error('[renters.register] sendOtp failed:', otpResult && otpResult.error);
      return res.status(502).json({
        error: (otpResult && otpResult.error) || 'Could not send sign-in email. Try again in a moment.',
      });
    }

    // 202 Accepted — the renter is staged, but not yet active until they
    // click the link in their email.
    res.status(202).json({
      success: true,
      next: 'check_email',
      email: cleanEmail,
      renter_id: renterId,
      message: `We sent a sign-in link to ${cleanEmail}. Click it to finish creating your account.`,
    });

    // Fire-and-forget: register-stage analytics. The welcome email is
    // deliberately deferred to magic-link finalization (in routes/auth.js)
    // so unverified emails don't receive credentials.
    analytics.renter.signupComplete(renterId, {
      organization: cleanOrg || null,
      use_case: cleanUseCase || null,
      stage: 'pending_email_verification',
    }).catch(() => {});
    conversionFunnel.trackStage({
      journey: 'renter',
      stage: 'register',
      actorType: 'renter',
      actorId: renterId,
      req,
      inferViewOnRegister: true,
      metadata: {
        organization: cleanOrg || null,
        use_case: cleanUseCase || null,
        verification_state: 'pending',
      },
    });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A renter with this email already exists' });
    }
    console.error('Renter registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/renters/agent-register — programmatic zero-human renter signup.
//
// Motivation: the human flow (/register) pre-stages a PENDING row and requires
// a magic-link email click to mint the real key. An autonomous AI agent has no
// inbox to click, so that step is a hard wall. This endpoint mints a REAL,
// immediately-usable `dcp-renter-…` key + a MODEST trial credit in ONE call so
// an agent can go zero→list_gpus→create_pod with no human in the loop.
//
// It does NOT touch the human magic-link flow — that path still pre-stages
// pending rows and finalizes on email click. This is an additive, parallel
// door, clearly tagged source='agent' for audit/revocation.
//
// Abuse posture (this auto-mints keys + money — designed defensively):
//   • Per-IP rate limit (agentRegisterLimiter: 3/IP/hour) is the primary brake.
//   • MODEST trial — 20 SAR (2000 halala), not the human 100 SAR. Rationale: it
//     is enough to prove the loop (list_gpus → a short cheap pod → stop) and run
//     real inference, but small enough that farming N keys across rotating IPs
//     yields little; the bigger 100 SAR grant stays gated behind email proof.
//   • Email OPTIONAL — captured for recovery/audit when given, never required.
//   • Provenance recorded: source='agent', signup_ip, created_at, and the exact
//     trial_grant_halala, so any agent account can be found, audited, revoked.
//   • Reuses the cross-role conflict check; an email already held by a PROVIDER
//     is rejected (no silent dual-role minting on the machine path).
//   • Idempotent on a supplied email: a second call with the same email returns
//     the SAME key without re-crediting the trial (no double-spend).
// ─────────────────────────────────────────────────────────────────────────

// Agent trial: 20 SAR. Deliberately smaller than the human RENTER_STARTER
// (100 SAR / 10000 halala) because this path skips email verification.
const AGENT_TRIAL_HALALA = 2000;

router.post('/agent-register', agentRegisterLimiter, validateBody(renterAgentRegisterSchema), async (req, res) => {
  try {
    const cleanEmail = req.body.email ? normalizeEmail(req.body.email) : null;
    const cleanLabel = normalizeString(req.body.label, { maxLen: 120 });
    const cleanOrg = normalizeString(req.body.organization, { maxLen: 160 });
    const cleanUseCase = normalizeString(req.body.use_case, { maxLen: 120 });
    // req.ip is resolved via the app's hardened `trust proxy` hop count.
    const signupIp = normalizeString(req.ip, { maxLen: 64 }) || null;
    const now = new Date().toISOString();

    // If an email was supplied and it already belongs to a PROVIDER, refuse —
    // we never auto-mint a renter key onto a provider's email on this path.
    if (cleanEmail) {
      const conflict = findActiveAccountByEmail(db, cleanEmail);
      if (conflict && conflict.role === 'provider') {
        return res.status(409).json({
          error: 'This email is already registered as a provider. Use a different email or omit it.',
          code: 'EMAIL_BELONGS_TO_PROVIDER',
        });
      }
      // Idempotent: existing ACTIVE renter for this email → return its key,
      // do NOT re-credit. (Pending rows from the human flow are also returned
      // active after we activate+mint below only if they have no real key yet.)
      const existing = db.get(
        'SELECT id, status, api_key, balance_halala FROM renters WHERE LOWER(email) = LOWER(?)',
        cleanEmail
      );
      if (existing && existing.status === 'active' && looksLikeRenterKey(existing.api_key)) {
        return res.status(200).json({
          success: true,
          already_registered: true,
          api_key: existing.api_key,
          renter_id: existing.id,
          balance_halala: existing.balance_halala,
          balance_sar: Number((existing.balance_halala / 100).toFixed(2)),
          message: 'An account already exists for this email; returning its key. No new trial granted.',
        });
      }
    }

    const apiKey = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
    const name = cleanLabel || (cleanEmail ? cleanEmail.split('@')[0] : null) || 'agent';
    // Synthetic unique email when none supplied — the column is UNIQUE NOT NULL.
    // The `agent+…@agents.dcp.sa` shape is reserved/non-deliverable so it can
    // never collide with a real human signup and is obvious in an audit.
    const emailForRow = cleanEmail || `agent+${crypto.randomBytes(8).toString('hex')}@agents.dcp.sa`;

    let renterId;
    try {
      const result = runStatement(
        `INSERT INTO renters
           (name, email, api_key, organization, use_case, status,
            balance_halala, source, signup_ip, trial_grant_halala, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, 'agent', ?, ?, ?, ?)`,
        name, emailForRow, apiKey, cleanOrg || null, cleanUseCase || null,
        AGENT_TRIAL_HALALA, signupIp, AGENT_TRIAL_HALALA, now, now
      );
      renterId = result.lastInsertRowid;
    } catch (insErr) {
      // UNIQUE(email) race: a concurrent agent-register with the same email
      // already minted the row. Return that row's key (no double-credit).
      if (cleanEmail && /UNIQUE constraint/i.test(insErr.message || '')) {
        const raced = db.get('SELECT id, api_key, balance_halala FROM renters WHERE LOWER(email) = LOWER(?)', cleanEmail);
        if (raced && looksLikeRenterKey(raced.api_key)) {
          return res.status(200).json({
            success: true,
            already_registered: true,
            api_key: raced.api_key,
            renter_id: raced.id,
            balance_halala: raced.balance_halala,
            balance_sar: Number((raced.balance_halala / 100).toFixed(2)),
            message: 'An account already exists for this email; returning its key. No new trial granted.',
          });
        }
      }
      throw insErr;
    }

    // Immutable audit trail of the trial grant (same table the admin credit
    // path uses), so the trial is reconcilable independent of balance drift.
    try {
      runStatement(
        `INSERT INTO credit_grants (renter_id, amount_halala, reason, granted_by, created_at)
         VALUES (?, ?, ?, 'agent-register', ?)`,
        renterId, AGENT_TRIAL_HALALA, 'agent self-serve trial credit', now
      );
    } catch (grantErr) {
      console.error('[renters/agent-register] credit_grants audit insert failed (non-fatal):', grantErr.message);
    }

    console.log(`[renters/agent-register] minted agent renter id=${renterId} ip=${signupIp || 'unknown'} trial=${AGENT_TRIAL_HALALA}h email=${cleanEmail ? cleanEmail : '(none)'}`);

    res.status(201).json({
      success: true,
      api_key: apiKey,
      renter_id: renterId,
      trial_credit_halala: AGENT_TRIAL_HALALA,
      trial_credit_sar: Number((AGENT_TRIAL_HALALA / 100).toFixed(2)),
      balance_halala: AGENT_TRIAL_HALALA,
      balance_sar: Number((AGENT_TRIAL_HALALA / 100).toFixed(2)),
      next: 'Use this api_key as Authorization: Bearer (or x-renter-key). Call GET /api/renters/available-providers to list GPU types, then POST /api/pods to launch one.',
      message: 'Agent account ready. Real key minted with a 20 SAR trial — no email verification required.',
    });

    // Fire-and-forget analytics; never block the response on it.
    try {
      analytics.renter.signupComplete(renterId, {
        organization: cleanOrg || null,
        use_case: cleanUseCase || null,
        stage: 'agent_self_serve',
        source: 'agent',
      }).catch(() => {});
    } catch (_) { /* analytics best-effort */ }
    try {
      conversionFunnel.trackStage({
        journey: 'renter',
        stage: 'register',
        actorType: 'renter',
        actorId: renterId,
        req,
        inferViewOnRegister: true,
        metadata: { source: 'agent', organization: cleanOrg || null, use_case: cleanUseCase || null },
      });
    } catch (_) { /* funnel best-effort */ }
  } catch (error) {
    console.error('[renters/agent-register] error:', error);
    res.status(500).json({ error: 'Agent registration failed' });
  }
});

// GET /api/renters/me?key=API_KEY
router.get('/me', (req, res) => {
  try {
    // Accept Authorization: Bearer <key> in addition to ?key= / x-renter-key,
    // for parity with /v1/* and /api/pods. (agent-readiness fix)
    const key = req.query.key || req.headers['x-renter-key'] || getBearerToken(req);
    if (!key) return res.status(400).json({ error: 'API key required. Pass via Authorization: Bearer <key>, the x-renter-key header, or ?key=.' });

    // Accept either the legacy renters.api_key column or any active sub-key
    // in renter_api_keys (dcp- prefixed keys minted via /me/keys live there).
    // RENT-3: resolve through getRenterAuthContext so scopes are enforced. /me
    // returns profile + balance + usage, so any read-capable scope may read it
    // (inference keys need to see their own balance/usage); a key that holds
    // neither inference nor billing is rejected. Master keys bypass.
    const authCtx = getRenterAuthContext(key);
    if (!authCtx) return res.status(404).json({ error: 'Renter not found' });
    if (!hasReadScope(authCtx, ['inference', 'billing'])) {
      return res.status(403).json({ error: 'This API key does not have permission to read renter data. Use your master key or a key with the inference, billing, or admin scope.' });
    }
    const renter = db.get('SELECT * FROM renters WHERE id = ? AND status = ?', authCtx.renter.id, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    // Get recent jobs
    const recentJobs = db.all(
      `SELECT id, job_id, job_type, status, submitted_at, completed_at, actual_cost_halala
       FROM jobs WHERE renter_id = ? ORDER BY submitted_at DESC LIMIT 20`,
      renter.id
    );

    res.json({
      renter: {
        id: renter.id,
        name: renter.name,
        email: renter.email,
        organization: renter.organization,
        use_case: renter.use_case || null,
        phone: renter.phone || null,
        webhook_url: renter.webhook_url || null,
        balance_halala: renter.balance_halala,
        total_spent_halala: renter.total_spent_halala,
        total_jobs: renter.total_jobs,
        // Contract conformance (#12): the spec types created_at as
        // format:date-time (RFC 3339). Legacy rows may hold SQLite text
        // ("2026-05-30 23:15:00"); normalize so the response always conforms.
        created_at: toRfc3339(renter.created_at),
        // Renter's optional monthly inference spend cap (#20). 0 = unlimited.
        monthly_spend_cap_halala: renter.monthly_spend_cap_halala || 0
      },
      recent_jobs: recentJobs
      ,v1_usage_summary: db.get(        `SELECT COUNT(*) as total_requests,                COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,                COALESCE(SUM(completion_tokens), 0) as completion_tokens,                COALESCE(SUM(total_tokens), 0) as total_tokens,                COALESCE(SUM(cost_halala), 0) as total_cost_halala         FROM openrouter_usage_ledger WHERE renter_id = ?`,        renter.id      )
    });
  } catch (error) {
    console.error('Renter me error:', error);
    res.status(500).json({ error: 'Failed to fetch renter data' });
  }
});

// ─── Monthly spend cap (#20) ────────────────────────────────────────────
// A renter's optional self-imposed inference budget ceiling (0 = unlimited),
// enforced at the /v1 pre-dispatch gate (billingService.checkBudgetCap). The
// current cap is also returned by GET /api/renters/me.
router.put('/me/budget', (req, res) => {
  try {
    const key = req.query.key || req.headers['x-renter-key'];
    if (!key) return res.status(400).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(key);
    const renter = renterId
      ? db.get('SELECT id FROM renters WHERE id = ? AND status = ?', renterId, 'active')
      : null;
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    // Accept halala (integer) or sar (number); halala wins if both present.
    const body = req.body || {};
    let capHalala;
    if (body.monthly_spend_cap_halala != null) {
      capHalala = Number(body.monthly_spend_cap_halala);
    } else if (body.monthly_spend_cap_sar != null) {
      capHalala = Math.round(Number(body.monthly_spend_cap_sar) * 100);
    } else {
      return res.status(400).json({ error: 'Provide monthly_spend_cap_halala (integer) or monthly_spend_cap_sar (number). 0 = unlimited.' });
    }
    if (!Number.isFinite(capHalala) || capHalala < 0 || !Number.isInteger(capHalala)) {
      return res.status(400).json({ error: 'monthly_spend_cap_halala must be a non-negative integer (0 = unlimited).' });
    }
    const MAX_CAP_HALALA = 100_000_000; // 1,000,000 SAR sanity ceiling
    if (capHalala > MAX_CAP_HALALA) {
      return res.status(400).json({ error: 'Cap exceeds the maximum allowed (1,000,000 SAR).' });
    }

    db.run('UPDATE renters SET monthly_spend_cap_halala = ? WHERE id = ?', capHalala, renter.id);
    return res.json({
      ok: true,
      monthly_spend_cap_halala: capHalala,
      monthly_spend_cap_sar: Number((capHalala / 100).toFixed(2)),
      unlimited: capHalala === 0,
    });
  } catch (error) {
    console.error('Renter budget set error:', error);
    return res.status(500).json({ error: 'Failed to update budget cap' });
  }
});

// ─── In-dashboard notifications (Notifications V2) ──────────────────────
// Replaces per-job completion emails. The dailyDigest service rolls these
// into one email/day. See backend/src/services/notificationsV2.js.

const NOTIF_LIST_LIMIT_MAX = 100;
const NOTIF_LIST_LIMIT_DEFAULT = 50;

function parseNotifLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return NOTIF_LIST_LIMIT_DEFAULT;
  return Math.min(parsed, NOTIF_LIST_LIMIT_MAX);
}

function safeParseNotifPayload(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch (_err) { return null; }
}

// GET /api/renters/me/notifications?unread=true&limit=50
router.get('/me/notifications', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });

    const unreadOnly = String(req.query.unread || '').toLowerCase() === 'true';
    const limit = parseNotifLimit(req.query.limit);

    const baseSql = `SELECT id, kind, job_id, payload, read_at, created_at
                       FROM renter_notifications
                      WHERE renter_id = ?`;
    const tailSql = ' ORDER BY created_at DESC, id DESC LIMIT ?';
    const rows = unreadOnly
      ? db.all(`${baseSql} AND read_at IS NULL${tailSql}`, renterId, limit)
      : db.all(`${baseSql}${tailSql}`, renterId, limit);

    const totalRow = db.get('SELECT COUNT(*) AS c FROM renter_notifications WHERE renter_id = ?', renterId);
    const unreadRow = db.get('SELECT COUNT(*) AS c FROM renter_notifications WHERE renter_id = ? AND read_at IS NULL', renterId);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        job_id: r.job_id,
        payload: safeParseNotifPayload(r.payload),
        read_at: r.read_at,
        created_at: r.created_at,
      })),
      total: Number(totalRow?.c || 0),
      unread_count: Number(unreadRow?.c || 0),
    });
  } catch (error) {
    console.error('Renter notifications list error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/renters/me/notifications/:id/read
router.post('/me/notifications/:id/read', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });

    const notifId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(notifId) || notifId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    const result = runStatement(
      `UPDATE renter_notifications
          SET read_at = datetime('now')
        WHERE id = ? AND renter_id = ? AND read_at IS NULL`,
      notifId,
      renterId
    );

    res.json({ ok: true, updated: Number(result?.changes || 0) });
  } catch (error) {
    console.error('Renter notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/renters/me/notifications/read-all
router.post('/me/notifications/read-all', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });

    const result = runStatement(
      `UPDATE renter_notifications
          SET read_at = datetime('now')
        WHERE renter_id = ? AND read_at IS NULL`,
      renterId
    );

    res.json({ ok: true, updated: Number(result?.changes || 0) });
  } catch (error) {
    console.error('Renter notification read-all error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// GET /api/renters/me/payments?key=API_KEY
router.get('/me/payments', (req, res) => {
  try {
    // Accept header auth like every sibling /me route — this was the last
    // query-string-only holdout and it 400'd the entire v2 wallet page
    // (found in Tareq's live renter test, 2026-06-10).
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const payments = db.all(
      `SELECT payment_id, moyasar_id, amount_halala, status, created_at
       FROM payments
       WHERE renter_id = ?
       ORDER BY created_at DESC`,
      renter.id
    );

    res.json({
      payments: payments.map((payment) => ({
        id: payment.payment_id,
        amount_halala: payment.amount_halala,
        status: payment.status,
        created_at: payment.created_at,
        moyasar_id: payment.moyasar_id || null,
      })),
    });
  } catch (error) {
    console.error('Renter payment history error:', error);
    res.status(500).json({ error: 'Failed to fetch renter payment history' });
  }
});

// PATCH /api/renters/settings — update renter settings
router.patch('/settings', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required (x-renter-key header or key query)' });

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const hasWebhookField = Object.prototype.hasOwnProperty.call(req.body || {}, 'webhook_url');
    if (!hasWebhookField) {
      return res.status(400).json({ error: 'No supported settings provided. Use webhook_url.' });
    }

    const rawWebhookUrl = req.body.webhook_url;
    const clearWebhook = rawWebhookUrl === null || rawWebhookUrl === undefined || String(rawWebhookUrl).trim() === '';
    const webhookUrl = clearWebhook ? null : normalizeWebhookUrl(rawWebhookUrl);
    if (!clearWebhook && !webhookUrl) {
      return res.status(400).json({ error: 'webhook_url must be a valid HTTPS URL pointing to a public host' });
    }

    runStatement(
      'UPDATE renters SET webhook_url = ?, updated_at = ? WHERE id = ?',
      webhookUrl,
      new Date().toISOString(),
      renter.id
    );

    return res.json({
      success: true,
      settings: {
        webhook_url: webhookUrl,
      },
    });
  } catch (error) {
    console.error('Renter settings update error:', error);
    return res.status(500).json({ error: 'Failed to update renter settings' });
  }
});

// GET /api/renters/me/invoices?page=1&limit=20  (auth via x-renter-key header or ?key=)
router.get('/me/invoices', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const renter = { id: renterId };

    const pageRaw = Number.parseInt(req.query.page, 10);
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const perPageRaw = Number.parseInt(req.query.per_page, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limitCandidate = Number.isFinite(limitRaw) && limitRaw > 0
      ? limitRaw
      : (Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : 20);
    const limit = Math.min(limitCandidate, 100);
    const offset = (page - 1) * limit;

    const totalRow = db.get(
      `SELECT COUNT(*) as total
       FROM jobs
       WHERE renter_id = ?`,
      renter.id
    );

    const totalSpentRow = db.get(
      `SELECT COALESCE(SUM(
          CASE
            WHEN status = 'completed' THEN COALESCE(actual_cost_halala, cost_halala, 0)
            ELSE 0
          END
        ), 0) as total_spent_halala
       FROM jobs
       WHERE renter_id = ?`,
      renter.id
    );

    const rows = db.all(
      `SELECT j.id, j.job_id, j.job_type, j.status, j.created_at,
              COALESCE(j.completed_at, j.submitted_at, j.created_at) AS invoice_at,
              j.duration_minutes, j.actual_duration_minutes,
              j.cost_halala, j.actual_cost_halala, j.dc1_fee_halala,
              p.name as provider_name, p.gpu_model
       FROM jobs j
       LEFT JOIN providers p ON p.id = j.provider_id
       WHERE j.renter_id = ?
       ORDER BY COALESCE(j.completed_at, j.submitted_at, j.created_at) DESC
       LIMIT ? OFFSET ?`,
      renter.id, limit, offset
    );

    const invoices = rows.map((row) => {
      const durationMinutes = row.actual_duration_minutes || row.duration_minutes || 0;
      const ratePerMinute = COST_RATES[row.job_type] || COST_RATES.default || 10;
      const fallbackCostHalala = Math.max(0, Math.round(durationMinutes * ratePerMinute));
      const totalHalala = row.actual_cost_halala ?? row.cost_halala ?? fallbackCostHalala;
      const feeHalala = row.dc1_fee_halala ?? Math.round(totalHalala * 0.25);

      return {
        id: row.id,
        job_id: row.job_id,
        amount_halala: totalHalala,
        amount_sar: Number((totalHalala / 100).toFixed(2)),
        // INVISIBILITY: never expose provider machine name. GPU TYPE only.
        gpu_model: row.gpu_model || null,
        job_type: row.job_type,
        duration_minutes: durationMinutes,
        fee_halala: feeHalala,
        fee_sar: Number((feeHalala / 100).toFixed(2)),
        price_sar: Number((totalHalala / 100).toFixed(2)),
        total_sar: Number((totalHalala / 100).toFixed(2)),
        status: row.status,
        created_at: row.created_at,
        invoice_at: row.invoice_at
      };
    });

    res.json({
      invoices,
      total_spent_halala: Number(totalSpentRow.total_spent_halala || 0),
      total_spent_sar: Number(((totalSpentRow.total_spent_halala || 0) / 100).toFixed(2)),
      pagination: {
        page,
        limit,
        per_page: limit,
        total: totalRow.total || 0
      }
    });
  } catch (error) {
    console.error('Renter invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch renter invoices' });
  }
});

// GET /api/renters/me/invoices/:id/csv?key=API_KEY
router.get('/me/invoices/:id/csv', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required (x-renter-key header or key query)' });

    const invoiceId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ error: 'Invalid invoice id' });
    }

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const row = db.get(
      `SELECT j.id, j.job_id, j.job_type, j.status,
              COALESCE(j.completed_at, j.submitted_at, j.created_at) AS invoice_at,
              j.duration_minutes, j.actual_duration_minutes,
              j.cost_halala, j.actual_cost_halala, j.dc1_fee_halala,
              p.name AS provider_name, p.gpu_model
       FROM jobs j
       LEFT JOIN providers p ON p.id = j.provider_id
       WHERE j.id = ? AND j.renter_id = ?`,
      invoiceId,
      renter.id
    );
    if (!row) return res.status(404).json({ error: 'Invoice not found' });

    const durationMinutes = row.actual_duration_minutes || row.duration_minutes || 0;
    const ratePerMinute = COST_RATES[row.job_type] || COST_RATES.default || 10;
    const fallbackCostHalala = Math.max(0, Math.round(durationMinutes * ratePerMinute));
    const amountHalala = row.actual_cost_halala ?? row.cost_halala ?? fallbackCostHalala;
    const feeHalala = row.dc1_fee_halala ?? Math.round(amountHalala * 0.25);

    // INVISIBILITY: provider_name (machine/host name) removed from the renter CSV.
    const headers = [
      'invoice_id',
      'job_id',
      'status',
      'job_type',
      'gpu_model',
      'duration_minutes',
      'amount_halala',
      'amount_sar',
      'fee_halala',
      'fee_sar',
      'invoice_at',
    ];
    const values = [
      row.id,
      row.job_id,
      row.status,
      row.job_type,
      row.gpu_model || '',
      durationMinutes,
      amountHalala,
      (amountHalala / 100).toFixed(2),
      feeHalala,
      (feeHalala / 100).toFixed(2),
      row.invoice_at || '',
    ];
    const csv = `${headers.join(',')}\n${values.map(csvField).join(',')}\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${row.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Renter invoice CSV error:', error);
    res.status(500).json({ error: 'Failed to generate invoice CSV' });
  }
});

// GET /api/renters/available-providers
// Public-ish endpoint for renters to see what GPUs are available
router.get('/available-providers', async (req, res) => {
  try {
    const discoveryStatus = getDiscoveryStatus();
    const requestedMode = parseDiscoveryMode(req.query.discovery || req.query.discovery_mode);
    const effectiveMode = requestedMode || discoveryStatus.mode;
    const strictP2pMode = effectiveMode === 'p2p-primary';
    const includeP2p = effectiveMode !== 'sqlite';
    const allowStale = parseBoolLike(req.query.allow_stale);
    const maxAgeMs = toFiniteInt(req.query.max_age_ms, { min: 1, max: 6 * 60 * 60 * 1000 }) || 120000;

    // Real per-GPU-type price = what a pod is ACTUALLY billed (providers.cost_per_gpu_second_halala
    // = upstream cost + DCP premium), taken as the cheapest across providers of that type, in SAR/hr.
    // Single source of truth the renter pays — never a marketing floor, never "price on request".
    // INVISIBILITY-safe: this is OUR price; no vendor/source is exposed.
    const priceRows = db.all(
      `SELECT gpu_model, gpu_name_detected, cost_per_gpu_second_halala AS h
         FROM providers
        WHERE cost_per_gpu_second_halala IS NOT NULL AND cost_per_gpu_second_halala > 0`
    );
    const priceByModel = {};
    for (const r of priceRows) {
      const sar = Math.round(r.h * 3600) / 100;
      for (const key of [r.gpu_name_detected, r.gpu_model]) {
        if (!key) continue;
        if (priceByModel[key] == null || sar < priceByModel[key]) priceByModel[key] = sar;
      }
    }
    const priceFor = (p) => (p && p.gpu_model && priceByModel[p.gpu_model] != null) ? priceByModel[p.gpu_model] : null;

    if (strictP2pMode) {
      const resolvedProviders = await listProviders({
        allowStale,
        maxAgeMs,
      });
      // INVISIBILITY: strip name / peer_id / provider_id / addrs (raw IPs) etc.
      // via the shared allowlist — a renter sees only GPU TYPE + VRAM + availability.
      const safeProviders = resolvedProviders
        .filter((entry) => entry?.found)
        .map((entry) => toRenterProviderView(buildProviderShapeFromDHTRecord(entry)));
      return res.json({
        providers: safeProviders.map((p) => ({ ...p, sar_per_hour: priceFor(p) })),
        total: safeProviders.length,
        discovery_mode: effectiveMode,
        discovery_health: {
          mode: discoveryStatus.mode,
          enabled: includeP2p,
          announcement_enabled: discoveryStatus.announcement_enabled,
          bootstrap_configured: discoveryStatus.bootstrap_configured,
        },
      });
    }

    // BUG #1 (node list vanished): do NOT trust the stale `status` column — the health
    // worker lags ~5 min and stamps 'degraded'/'offline' on a live, heartbeating node,
    // hiding it from the only renter-facing list (Tareq couldn't see Fadi's Node 1).
    // Mirror /api/providers/available: select non-paused, approved, ever-heartbeated
    // providers and compute liveness from heartbeat age below; exclude only explicit
    // admin/security disables. BUG #4 (booked shown as available): exclude providers
    // already running an active interactive pod.
    // NATIVE (physical) providers only — heartbeat-gated. Burst/on-demand rows
    // are handled separately below (they have no daemon, so they never
    // heartbeat and must NOT be filtered by heartbeat age).
    let providers = db.all(
      `SELECT id, name, gpu_model, gpu_name_detected, gpu_vram_mib, gpu_driver,
              gpu_compute_capability, gpu_cuda_version, gpu_count_reported,
              status, location, run_mode, reliability_score, cached_models, last_heartbeat, p2p_peer_id
       FROM providers
       WHERE is_paused = 0
         AND COALESCE(is_burst, 0) = 0
         AND last_heartbeat IS NOT NULL
         AND COALESCE(approval_status, 'pending') = 'approved'
         AND COALESCE(status, 'online') NOT IN ('suspended','flagged','rejected','banned','disabled')
         AND id NOT IN (
           SELECT provider_id FROM jobs
           WHERE job_type = 'interactive_pod'
             AND status IN ('queued','assigned','pulling','running')
             AND provider_id IS NOT NULL
         )
       ORDER BY gpu_vram_mib DESC NULLS LAST`
    );
    // Liveness from heartbeat age (not the lagging status column): drop nodes silent > 5 min.
    const OFFLINE_AGE_S = 300;
    providers = providers.filter((p) => {
      if (!p.last_heartbeat) return false;
      const ageS = Math.floor((Date.now() - new Date(p.last_heartbeat).getTime()) / 1000);
      return ageS < OFFLINE_AGE_S;
    });

    // ON-DEMAND (burst) GPU TYPES — ALWAYS available. We spin one up on click,
    // so these read "Available" identical to live native nodes regardless of
    // heartbeat. INVISIBILITY: the response must NOT reveal that these are
    // burst-backed or who the vendor is — we surface only GPU TYPE + vram and a
    // neutral `available: true`. No is_burst, no peer_id, no vendor, no name
    // beyond the GPU-type label.
    const burstRows = db.all(
      `SELECT id, name, gpu_model, gpu_name_detected, gpu_vram_mib, vram_gb,
              gpu_compute_capability, gpu_cuda_version, location, cached_models,
              stock_available
       FROM providers
       WHERE COALESCE(is_burst, 0) = 1
         AND is_paused = 0
         AND COALESCE(approval_status, 'pending') = 'approved'
         AND COALESCE(status, 'online') NOT IN ('suspended','flagged','rejected','banned','disabled')
       ORDER BY COALESCE(vram_gb, gpu_vram_mib / 1024) DESC`
    );
    const burstProviders = burstRows.map((row) => {
      const vramGb = (row.vram_gb != null && row.vram_gb > 0)
        ? row.vram_gb
        : (row.gpu_vram_mib ? Math.round(row.gpu_vram_mib / 1024) : null);
      return {
        id: row.id,
        peer_id: null,
        gpu_model: row.gpu_name_detected || row.gpu_model || null,
        vram_gb: vramGb,
        vram_mib: vramGb != null ? vramGb * 1024 : (row.gpu_vram_mib || null),
        gpu_count: 1,
        compute_capability: row.gpu_compute_capability || null,
        cuda_version: row.gpu_cuda_version || null,
        // Honest availability: reflect REAL RunPod secure-cloud stock (refreshed by
        // /root/dcp-burst/stock-refresh.py cron). We ALWAYS advertise all 6 types,
        // but an out-of-stock type reads available:false so a launch can't surprise-fail.
        status: (row.stock_available === 0 ? 'offline' : 'online'),
        is_live: row.stock_available !== 0,
        available: row.stock_available !== 0,
        on_demand: true,
        location: row.location || null,
        cached_models: parseCachedModels(row.cached_models),
        discovery_source: 'on_demand',
        stale: false,
      };
    });

    let discoveryByPeerId = new Map();
    let discoveryLookupLatencyMs = null;
    let trackedPeerIds = [];
    if (includeP2p) {
      const peerIds = providers
        .map((provider) => normalizeString(provider.p2p_peer_id, { maxLen: 200 }))
        .filter(Boolean);
      trackedPeerIds = peerIds;
      if (peerIds.length > 0) {
        const lookupStartedAt = Date.now();
        const resolvedProviders = await resolveProviders(peerIds, {
          allowStale,
          maxAgeMs,
        });
        discoveryLookupLatencyMs = Date.now() - lookupStartedAt;
        for (const item of resolvedProviders) {
          if (!item?.peer_id) continue;
          discoveryByPeerId.set(String(item.peer_id), item);
        }
      }
    }

    const now = Date.now();
    const nativeProviders = providers.map((provider) => {
      const discovery = discoveryByPeerId.get(String(provider.p2p_peer_id || ''));
      const shape = (includeP2p && discovery?.found && discovery.provider)
        ? buildProviderShapeFromDHT(provider, discovery, now)
        : buildProviderShapeFromSQLiteRow(provider, now);
      // Native nodes that survived the heartbeat filter are live & rentable.
      // Add a neutral `available` flag so the frontend grid can use ONE field
      // across native + on-demand rows. on_demand:false distinguishes physical.
      return { ...shape, available: shape.is_live !== false, on_demand: false };
    });
    // On-demand GPU TYPES are appended AFTER native nodes (already vram-sorted
    // within each group). All 6 burst types always appear as available.
    // INVISIBILITY: both native + burst rows flow through the shared allowlist
    // so neither machine name (providers.name), peer_id, provider_id, addrs
    // (raw IPs), driver_version nor any vendor field can ride out to a renter.
    const allProviders = [...nativeProviders, ...burstProviders].map(toRenterProviderView).map((p) => ({ ...p, sar_per_hour: priceFor(p) }));
    res.json({
      providers: allProviders,
      total: allProviders.length,
      discovery_mode: effectiveMode,
      discovery_health: {
        mode: discoveryStatus.mode,
        enabled: includeP2p,
        announcement_enabled: discoveryStatus.announcement_enabled,
        bootstrap_configured: discoveryStatus.bootstrap_configured,
        ...(effectiveMode === 'shadow' ? {
          shadow_cycle: buildShadowCycleSummary({
            trackedPeerIds,
            resolvedProviders: Array.from(discoveryByPeerId.values()),
            lookupLatencyMs: discoveryLookupLatencyMs,
          }),
        } : {}),
      },
    });
  } catch (error) {
    console.error('Available providers error:', error);
    res.status(500).json({ error: 'Failed to fetch available providers' });
  }
});

// === GET /api/renters/pricing - Public GPU pricing ===
// Returns the REAL DCP price per GPU model — what a renter is actually billed —
// derived from providers.cost_per_gpu_second_halala (the live cost-plus value
// written by the burst stock refresher: upstream secure USD/hr × 3.75 × 100 ×
// 1.40). No authentication required.
//
// RECONCILIATION (ROADMAP 1.4, 2026-06-30): this endpoint previously read the
// legacy `gpu_pricing` table, whose `rate_halala` column stored USD × 100,000
// (a mis-named pre-launch artifact) and was 2-5× BELOW the real billed rate.
// It now mirrors the same canonical source as /available-providers so the
// public price list and the launch quote/bill agree. The `gpu_pricing` table
// is left in place (read-only, unused) pending a separate drop migration.
//
// INVISIBILITY-safe: this is OUR price. No vendor, broker, or markup % is
// exposed to the renter — the displayed number is just "DCP SAR/hr".
router.get('/pricing', (req, res) => {
  try {
    // Cheapest cost_per_gpu_second_halala per gpu_model — same source of truth
    // the launcher bills against. h = halala per GPU-second (real, fractional).
    const rows = db.prepare(
      `SELECT gpu_model,
              MIN(cost_per_gpu_second_halala) AS h,
              MAX(updated_at)                AS updated_at
         FROM providers
        WHERE cost_per_gpu_second_halala IS NOT NULL
          AND cost_per_gpu_second_halala > 0
        GROUP BY gpu_model
        ORDER BY h ASC`
    ).all();

    if (!rows || rows.length === 0) {
      return res.status(503).json({
        error: 'Pricing data not available',
        message: 'No live GPU pricing yet. Contact admin or browse /available-providers.',
      });
    }

    const pricing = rows.map(r => {
      const halalaPerSecond = r.h;
      const rate_halala_per_hour = Math.round(halalaPerSecond * 3600); // halala/hr (integer)
      const rate_sar_per_hour = Number((halalaPerSecond * 3600 / 100).toFixed(2)); // SAR/hr shown to renter
      const rate_usd_per_hour = Number((rate_sar_per_hour / 3.75).toFixed(3)); // SAR ÷ FX, for display only
      return {
        gpu_model: r.gpu_model,
        rate_halala_per_hour,
        rate_sar_per_hour,
        rate_usd_per_hour,
        updated_at: r.updated_at,
      };
    });

    res.json({
      success: true,
      pricing,
      count: pricing.length,
      timestamp: new Date().toISOString(),
      note: 'DCP live price per GPU — billed per second in SAR',
    });
  } catch (error) {
    console.error('Pricing API error:', error);
    res.status(500).json({ error: 'Failed to fetch GPU pricing' });
  }
});

// POST /api/renters/topup — Add balance to renter account
// In production this would be connected to a payment gateway (Stripe/Tap).
// For Gate 1 we accept direct top-up with amount_halala.
router.post('/topup', validateBody(renterTopupSchema), (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SANDBOX_TOPUP !== 'true') {
      return res.status(403).json({ error: 'Direct top-up disabled in production. Use payment flow.' });
    }

    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required (x-renter-key header or key query)' });

    const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const { amount_halala, amount_sar } = req.body;
    // Accept either halala or SAR (convert SAR → halala)
    const topupFromHalala = toFiniteInt(amount_halala, { min: 1, max: 100000 });
    const amountSar = toFiniteNumber(amount_sar, { min: 0.01, max: 1000 });
    const topup = topupFromHalala != null
      ? topupFromHalala
      : (amountSar != null ? Math.round(amountSar * 100) : 0);

    if (!topup || topup <= 0) {
      return res.status(400).json({ error: 'Provide amount_halala (int) or amount_sar (float), must be > 0' });
    }

    if (topup > 100000) { // max 1000 SAR per top-up
      return res.status(400).json({ error: 'Max top-up is 1000 SAR (100000 halala) per transaction' });
    }

    const now = new Date().toISOString();
    runStatement(
      `UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ? WHERE id = ?`,
      topup, now, renter.id
    );

    const updated = db.get('SELECT balance_halala FROM renters WHERE id = ?', renter.id);

    res.json({
      success: true,
      topped_up_halala: topup,
      topped_up_sar: topup / 100,
      new_balance_halala: updated.balance_halala,
      new_balance_sar: updated.balance_halala / 100
    });
  } catch (error) {
    console.error('Renter topup error:', error);
    res.status(500).json({ error: 'Top-up failed' });
  }
});

// GET /api/renters/balance — Quick balance check
router.get('/balance', (req, res) => {
  try {
    // Accept Authorization: Bearer <key> in addition to x-renter-key / ?key=.
    // /v1/* and /api/pods already accept Bearer (see middleware/auth getApiKeyFromReq);
    // balance previously ignored it, so a pure-Bearer MCP/OpenAI-style agent got
    // "API key required" here while pods + inference worked. (agent-readiness fix)
    const key = req.headers['x-renter-key'] || req.query.key || getBearerToken(req);
    if (!key) return res.status(400).json({ error: 'API key required. Pass via Authorization: Bearer <key>, the x-renter-key header, or ?key=.' });

    // RENT-3: balance is billing data. Previously this matched only renters.api_key
    // (master key) and silently 404'd every sub-key, so the "billing" scope was never
    // exercised. Resolve through getRenterAuthContext and require a billing/admin
    // (or master) key: a billing-scoped sub-key can now read balance, while
    // inference/compute/default-only keys are rejected with 403.
    const authCtx = getRenterAuthContext(key);
    if (!authCtx) return res.status(404).json({ error: 'Renter not found' });
    if (!hasReadScope(authCtx, ['billing'])) {
      return res.status(403).json({ error: 'This API key does not have permission to read billing data. Use your master key or a key with the billing or admin scope.' });
    }
    const renter = db.get('SELECT id, balance_halala, total_spent_halala, total_jobs FROM renters WHERE id = ? AND status = ?', authCtx.renter.id, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    // Calculate held amount (running jobs estimated cost)
    const held = db.get(
      `SELECT COALESCE(SUM(cost_halala), 0) as held_halala FROM jobs WHERE renter_id = ? AND status = 'running'`,
      renter.id
    );

    res.json({
      balance_halala: renter.balance_halala,
      balance_sar: renter.balance_halala / 100,
      held_halala: held.held_halala,
      held_sar: held.held_halala / 100,
      available_halala: renter.balance_halala,  // held already deducted at submit
      total_spent_halala: renter.total_spent_halala,
      total_spent_sar: renter.total_spent_halala / 100,
      total_jobs: renter.total_jobs
    });
  } catch (error) {
    console.error('Renter balance error:', error);
    res.status(500).json({ error: 'Balance check failed' });
  }
});

// GET /api/renters/jobs — Renter job history with pagination and status filter (DCP-892)
// Auth: Bearer <api_key> | X-Renter-Key header | ?key= query param
// Query: ?page=1&limit=20&status=completed|failed|running
router.get('/jobs', (req, res) => {
  try {
    const key = getBearerToken(req) || req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(401).json({ error: 'API key required' });

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(401).json({ error: 'Invalid or inactive API key' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const ALLOWED_STATUSES = new Set(['completed', 'failed', 'running', 'pending', 'cancelled']);
    const statusFilter = req.query.status;
    const useStatusFilter = statusFilter && ALLOWED_STATUSES.has(statusFilter);

    const whereClause = useStatusFilter
      ? 'WHERE j.renter_id = ? AND j.status = ?'
      : 'WHERE j.renter_id = ?';
    const queryParams = useStatusFilter ? [renter.id, statusFilter] : [renter.id];

    const total = db.get(
      `SELECT COUNT(*) AS cnt FROM jobs j ${whereClause}`,
      ...queryParams
    );

    const jobs = db.all(
      `SELECT j.job_id,
              j.template_id,
              j.provider_id,
              j.status,
              j.started_at,
              j.completed_at,
              COALESCE(j.actual_cost_halala, j.cost_halala, 0) AS cost_halala,
              COALESCE(ss.total_tokens, 0) AS output_tokens,
              NULL AS input_tokens
       FROM jobs j
       LEFT JOIN serve_sessions ss ON ss.job_id = j.job_id
       ${whereClause}
       ORDER BY j.submitted_at DESC
       LIMIT ? OFFSET ?`,
      ...queryParams, limit, offset
    );

    return res.json({
      jobs,
      total: total.cnt,
      page,
      limit,
      pages: Math.ceil(total.cnt / limit),
    });
  } catch (error) {
    console.error('[renters/jobs]', error);
    return res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

// POST /api/renters/login-email — Login with email instead of API key

// --- SUPABASE AUTH OTP (Real Magic Link) ---
const { sendOtp, verifyOtp } = require('../services/auth-otp');

// POST /api/renters/send-otp - Send magic link OTP code via Supabase Auth
router.post('/send-otp', loginEmailLimiter, async (req, res) => {
  try {
    const { email, desktop_callback } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return res.status(400).json({ error: 'Valid email is required' });

    // See providers.js /send-otp for the desktop_callback contract.
    const result = await sendOtp(cleanEmail, {
      requestedRole: 'renter',
      desktopCallback: typeof desktop_callback === 'string' ? desktop_callback : null,
    });
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send verification code' });
    }

    res.json({ success: true, message: 'Sign-in link sent to your email' });
  } catch (error) {
    console.error('Renter OTP send error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// POST /api/renters/verify-otp - Verify OTP code and return API key
router.post('/verify-otp', loginEmailLimiter, async (req, res) => {
  try {
    const { email, token } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return res.status(400).json({ error: 'Valid email is required' });
    if (!token) return res.status(400).json({ error: 'Verification code is required' });

    const otpResult = await verifyOtp(cleanEmail, token);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.error || 'Invalid or expired verification code' });
    }

    // OTP verified via Supabase Auth - now find the renter in SQLite
    let renter = db.get('SELECT * FROM renters WHERE LOWER(email) = LOWER(?) AND status = ?', cleanEmail, 'active');

    if (!renter) {
      const reconciliation = await reconcileRenterByEmailFromSupabase({ db, email: cleanEmail });
      if (reconciliation.reconciled && reconciliation.renter && reconciliation.renter.status === 'active') {
        renter = reconciliation.renter;
      }
    }

    if (!renter) {
      return res.status(404).json({ error: 'No renter account found with this email. Register first at /renter/register' });
    }

    res.json({
      success: true,
      api_key: renter.api_key,
      renter: {
        id: renter.id,
        name: renter.name,
        email: renter.email,
        organization: renter.organization,
        balance_halala: renter.balance_halala,
        total_spent_halala: renter.total_spent_halala,
        total_jobs: renter.total_jobs,
      }
    });
    analytics.renter.login(renter.id, { method: 'otp' }).catch(() => {});
  } catch (error) {
    console.error('Renter OTP verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/login-email', loginEmailLimiter, async (req, res) => {
  // DCP-896 SECURITY FIX (renter): disabled — previously returned the full API key for an email alone (no OTP/password).
  return res.status(410).json({ error: 'This endpoint has been disabled for security. Use OTP login (/send-otp + /verify-otp).', code: 'LOGIN_EMAIL_DISABLED' });
  // eslint-disable-next-line no-unreachable
  try {
    const { email } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return res.status(400).json({ error: 'Valid email is required' });

    let renter = db.get('SELECT * FROM renters WHERE email = ? AND status = ?', cleanEmail, 'active');
    if (!renter) {
      // Also try case-insensitive
      renter = db.get('SELECT * FROM renters WHERE LOWER(email) = LOWER(?) AND status = ?', cleanEmail, 'active');
    }

    // Runtime self-heal for Supabase-origin renters missing in SQLite.
    if (!renter) {
      const reconciliation = await reconcileRenterByEmailFromSupabase({ db, email: cleanEmail });
      if (reconciliation.reconciled && reconciliation.renter?.status === 'active') {
        renter = reconciliation.renter;
      }
    }

    if (!renter) {
      return res.status(404).json({ error: 'No renter account found with this email. Register first at /renter/register' });
    }

    res.json({
      success: true,
      api_key: renter.api_key,
      renter: {
        id: renter.id,
        name: renter.name,
        email: renter.email,
        organization: renter.organization,
        balance_halala: renter.balance_halala,
        total_spent_halala: renter.total_spent_halala,
        total_jobs: renter.total_jobs,
      }
    });
  } catch (error) {
    console.error('Renter email login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/renters/me/rotate-key — Rotate API key (renter self-service)
// Backwards-compatible alias retained: /api/renters/rotate-key
router.post(['/me/rotate-key', '/rotate-key'], (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'Current API key required (x-renter-key header or key query)' });

    const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    if (isRotationRateLimited('renter', renter.id)) {
      return res.status(429).json({ error: 'Rate limit exceeded: max 3 key rotations per 24 hours' });
    }

    const newKey = `dcp-renter-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    runStatement(
      'UPDATE renters SET api_key = ?, rotated_at = ?, updated_at = ? WHERE id = ?',
      newKey,
      nowIso,
      nowIso,
      renter.id
    );
    recordRotationEvent('renter', renter.id, nowIso);

    res.json({
      success: true,
      message: 'API key rotated. Save the new key — the old one is now invalid.',
      new_key: newKey,
      api_key: newKey,
      renter_id: renter.id
    });
  } catch (error) {
    console.error('Renter key rotation error:', error);
    res.status(500).json({ error: 'Key rotation failed' });
  }
});

// ─── SCOPED API KEY MANAGEMENT — Sprint 25 Gap 2 ─────────────────────────────
// Master key (renters.api_key) always has full access.
// Sub-keys in renter_api_keys have explicit scope grants.
// Valid scopes: "inference" (submit vLLM jobs), "billing" (view balance), "compute" (rent GPU pods), "admin" (all)
const VALID_KEY_SCOPES = new Set(['inference', 'billing', 'admin', 'compute']);
const MAX_SCOPED_KEYS_PER_RENTER = 20;
const MAX_MONTHLY_SPEND_CAP_HALALA = 100_000_000; // 1,000,000 SAR sanity ceiling

function normalizeMonthlySpendCapInput(body = {}, { required = true } = {}) {
  let capHalala;
  if (body.monthly_spend_cap_halala != null) {
    capHalala = Number(body.monthly_spend_cap_halala);
  } else if (body.monthly_spend_cap_sar != null) {
    capHalala = Math.round(Number(body.monthly_spend_cap_sar) * 100);
  } else if (!required) {
    return { capHalala: 0 };
  } else {
    return { error: 'Provide monthly_spend_cap_halala (integer) or monthly_spend_cap_sar (number). 0 = unlimited.' };
  }
  if (!Number.isFinite(capHalala) || capHalala < 0 || !Number.isInteger(capHalala)) {
    return { error: 'monthly_spend_cap_halala must be a non-negative integer (0 = unlimited).' };
  }
  if (capHalala > MAX_MONTHLY_SPEND_CAP_HALALA) {
    return { error: 'Cap exceeds the maximum allowed (1,000,000 SAR).' };
  }
  return { capHalala };
}

// POST /api/renters/me/keys — create a scoped sub-key
router.post('/me/keys', (req, res) => {
  try {
    const rawKey = req.headers['x-renter-key'] || req.query.key;
    if (!rawKey) return res.status(401).json({ error: 'API key required' });
    const authCtx = getRenterAuthContext(rawKey);
    if (!authCtx) return res.status(403).json({ error: 'Invalid or inactive API key' });
    if (authCtx.actorType !== 'master_key' && !authCtx.scopes.includes('admin')) {
      return res.status(403).json({ error: 'Creating API keys requires your master key or an admin-scoped key. Log in with your master key (email magic link) to manage keys.' });
    }
    const renter = authCtx.renter;

    const rawScopes = req.body?.scopes;
    const scopes = Array.isArray(rawScopes) ? rawScopes.filter(s => VALID_KEY_SCOPES.has(s)) : ['inference'];
    if (scopes.length === 0) {
      return res.status(400).json({ error: `Invalid scopes. Valid values: ${[...VALID_KEY_SCOPES].join(', ')}` });
    }

    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 80) : null;
    const rawExpiry = req.body?.expires_at;
    const expiresAt = rawExpiry && !isNaN(Date.parse(rawExpiry)) ? new Date(rawExpiry).toISOString() : null;
    const orgId = deriveOrgId(renter);
    const orgRole = normalizeOrgRole(req.body?.org_role) || inferRoleFromScopes(scopes);
    const capInput = normalizeMonthlySpendCapInput(req.body || {}, { required: false });
    if (capInput.error) return res.status(400).json({ error: capInput.error });
    const monthlySpendCapHalala = capInput.capHalala;

    const activeCount = db.get(
      'SELECT COUNT(*) AS c FROM renter_api_keys WHERE renter_id = ? AND revoked_at IS NULL',
      renter.id
    );
    if (Number(activeCount?.c || 0) >= MAX_SCOPED_KEYS_PER_RENTER) {
      return res.status(429).json({ error: `Maximum ${MAX_SCOPED_KEYS_PER_RENTER} active sub-keys per account` });
    }

    const id = crypto.randomUUID();
    const key = `dc1-sk-${crypto.randomBytes(20).toString('hex')}`;
    const now = new Date().toISOString();
    runStatement(
      `INSERT INTO renter_api_keys
       (id, renter_id, key, label, scopes, org_id, org_role, monthly_spend_cap_halala, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, renter.id, key, label, JSON.stringify(scopes), orgId, orgRole, monthlySpendCapHalala, expiresAt, now
    );

    return res.status(201).json({
      id,
      key,
      label,
      scopes,
      org_id: orgId,
      org_role: orgRole,
      monthly_spend_cap_halala: monthlySpendCapHalala,
      monthly_spend_cap_sar: sarFromHalala(monthlySpendCapHalala),
      monthly_spend_cap_unlimited: monthlySpendCapHalala === 0,
      expires_at: expiresAt,
      created_at: now,
    });
  } catch (error) {
    console.error('Scoped key create error:', error);
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

// GET /api/renters/me/keys — list active scoped sub-keys
router.get('/me/keys', (req, res) => {
  try {
    const rawKey = req.headers['x-renter-key'] || req.query.key;
    if (!rawKey) return res.status(401).json({ error: 'API key required' });
    const authCtx = getRenterAuthContext(rawKey);
    if (!authCtx) return res.status(403).json({ error: 'Invalid or inactive API key' });
    // RENT-3: listing API keys exposes key metadata (labels, scopes, org roles) and
    // is a billing/account-management surface. Require billing/admin (or master);
    // an inference/compute/default-only sub-key must not enumerate the account's keys.
    if (!hasReadScope(authCtx, ['billing'])) {
      return res.status(403).json({ error: 'This API key does not have permission to list API keys. Use your master key or a key with the billing or admin scope.' });
    }
    const renter = authCtx.renter;
    const usage30d = getScopedKeyUsageMap(
      renter.id,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    const keys = db.all(
      `SELECT id, label, scopes, org_id, org_role,
              ${renterApiKeysHasColumn('monthly_spend_cap_halala') ? 'monthly_spend_cap_halala' : '0 AS monthly_spend_cap_halala'},
              expires_at, last_used_at, created_at,
              CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END AS revoked
       FROM renter_api_keys
       WHERE renter_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      renter.id
    ).map(k => {
      const attributed = usage30d.usageByKey.get(k.id) || {};
      const spendHalala = Number(attributed.spend_30d_halala || 0);
      const monthlySpendCapHalala = Number(k.monthly_spend_cap_halala || 0);
      return {
        id: k.id,
        label: k.label,
        scopes: (() => { try { return JSON.parse(k.scopes); } catch (_) { return []; } })(),
        org_id: k.org_id,
        org_role: k.org_role || 'member',
        expires_at: k.expires_at,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
        revoked: Boolean(k.revoked),
        monthly_spend_cap_halala: monthlySpendCapHalala,
        monthly_spend_cap_sar: sarFromHalala(monthlySpendCapHalala),
        monthly_spend_cap_unlimited: monthlySpendCapHalala === 0,
        spend_attribution_available: usage30d.available,
        requests_30d: Number(attributed.requests_30d || 0),
        spend_30d_halala: spendHalala,
        spend_30d_sar: sarFromHalala(spendHalala),
      };
    });

    return res.json({ keys });
  } catch (error) {
    console.error('Scoped key list error:', error);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// PUT /api/renters/me/keys/:keyId/budget — set or remove a scoped key cap
router.put('/me/keys/:keyId/budget', (req, res) => {
  try {
    const rawKey = req.headers['x-renter-key'] || req.query.key;
    if (!rawKey) return res.status(401).json({ error: 'API key required' });
    const authCtx = getRenterAuthContext(rawKey);
    if (!authCtx) return res.status(403).json({ error: 'Invalid or inactive API key' });
    if (authCtx.actorType !== 'master_key' && !authCtx.scopes.includes('admin')) {
      return res.status(403).json({ error: 'Changing API key budgets requires your master key or an admin-scoped key.' });
    }
    if (!renterApiKeysHasColumn('monthly_spend_cap_halala')) {
      return res.status(503).json({ error: 'Scoped key budgets are not available on this database yet.' });
    }

    const renter = authCtx.renter;
    const keyId = req.params.keyId;
    if (!keyId) return res.status(400).json({ error: 'Key ID required' });
    const capInput = normalizeMonthlySpendCapInput(req.body || {});
    if (capInput.error) return res.status(400).json({ error: capInput.error });

    const existing = db.get(
      `SELECT id, label
       FROM renter_api_keys
       WHERE id = ? AND renter_id = ? AND revoked_at IS NULL`,
      keyId, renter.id
    );
    if (!existing) return res.status(404).json({ error: 'Key not found or already revoked' });

    runStatement(
      'UPDATE renter_api_keys SET monthly_spend_cap_halala = ? WHERE id = ? AND renter_id = ? AND revoked_at IS NULL',
      capInput.capHalala, keyId, renter.id
    );
    return res.json({
      ok: true,
      id: keyId,
      label: existing.label || null,
      monthly_spend_cap_halala: capInput.capHalala,
      monthly_spend_cap_sar: sarFromHalala(capInput.capHalala),
      monthly_spend_cap_unlimited: capInput.capHalala === 0,
      per_key_budgets_enforced: true,
    });
  } catch (error) {
    console.error('Scoped key budget update error:', error);
    return res.status(500).json({ error: 'Failed to update API key budget' });
  }
});

// DELETE /api/renters/me/keys/:keyId — revoke a scoped sub-key
router.delete('/me/keys/:keyId', (req, res) => {
  try {
    const rawKey = req.headers['x-renter-key'] || req.query.key;
    if (!rawKey) return res.status(401).json({ error: 'API key required' });
    const authCtx = getRenterAuthContext(rawKey);
    if (!authCtx) return res.status(403).json({ error: 'Invalid or inactive API key' });
    if (authCtx.actorType !== 'master_key' && !authCtx.scopes.includes('admin')) {
      return res.status(403).json({ error: 'Revoking API keys requires your master key or an admin-scoped key.' });
    }
    const renter = authCtx.renter;

    const keyId = req.params.keyId;
    if (!keyId) return res.status(400).json({ error: 'Key ID required' });

    const now = new Date().toISOString();
    const result = runStatement(
      'UPDATE renter_api_keys SET revoked_at = ? WHERE id = ? AND renter_id = ? AND revoked_at IS NULL',
      now, keyId, renter.id
    );
    if ((result?.changes || 0) === 0) {
      return res.status(404).json({ error: 'Key not found or already revoked' });
    }
    return res.json({ success: true, revoked_at: now });
  } catch (error) {
    console.error('Scoped key revoke error:', error);
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================================================
// Renter API Key Management — /api/renters/:id/keys
// Generates dcp_-prefixed sub-keys usable as Bearer tokens on inference endpoints.
// Auth: master API key via x-renter-key header (must match :id).
// ============================================================================

const RENTER_KEY_PERMISSIONS = new Set(['inference', 'jobs.read', 'balance.read']);
const MAX_DCP_KEYS_PER_RENTER = 20;

// POST /api/renters/:id/keys — create a dcp_ API key
router.post('/:id/keys', requireRenterAdmin, (req, res) => {
  try {
    const renter = req.renter;

    const rawPerms = req.body?.permissions;
    const permissions = Array.isArray(rawPerms)
      ? rawPerms.filter(p => RENTER_KEY_PERMISSIONS.has(p))
      : ['inference'];
    if (permissions.length === 0) {
      return res.status(400).json({
        error: `Invalid permissions. Valid values: ${[...RENTER_KEY_PERMISSIONS].join(', ')}`,
      });
    }

    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 80) : null;
    const orgRole = normalizeOrgRole(req.body?.org_role) || inferRoleFromScopes(permissions);
    const orgId = req.rbac.orgId || deriveOrgId(renter);

    const activeCount = db.get(
      `SELECT COUNT(*) AS c FROM renter_api_keys WHERE renter_id = ? AND revoked_at IS NULL AND key LIKE 'dcp_%'`,
      renter.id
    );
    if (Number(activeCount?.c || 0) >= MAX_DCP_KEYS_PER_RENTER) {
      return res.status(429).json({ error: `Maximum ${MAX_DCP_KEYS_PER_RENTER} active API keys per account` });
    }

    const keyId = crypto.randomUUID();
    const key = `dcp_${crypto.randomBytes(32).toString('hex')}`;
    const now = new Date().toISOString();

    runStatement(
      `INSERT INTO renter_api_keys
       (id, renter_id, key, label, scopes, org_id, org_role, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      keyId, renter.id, key, label, JSON.stringify(permissions), orgId, orgRole, null, now
    );

    return res.status(201).json({ keyId, key, label, permissions, org_id: orgId, org_role: orgRole, created_at: now });
  } catch (error) {
    console.error('DCP key create error:', error);
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

// GET /api/renters/:id/keys — list dcp_ API keys (secret never returned; shows last 4 chars)
router.get('/:id/keys', requireRenterReadOnly, (req, res) => {
  try {
    const renter = req.renter;

    const keys = db.all(
      `SELECT id, label, scopes, key, org_id, org_role, expires_at, last_used_at, created_at,
              CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END AS revoked
       FROM renter_api_keys
       WHERE renter_id = ? AND key LIKE 'dcp_%'
       ORDER BY created_at DESC
       LIMIT 100`,
      renter.id
    ).map(k => ({
      keyId: k.id,
      label: k.label,
      permissions: (() => { try { return JSON.parse(k.scopes); } catch (_) { return []; } })(),
      org_id: k.org_id,
      org_role: k.org_role || 'member',
      key_hint: `dcp_...${k.key.slice(-4)}`,
      expires_at: k.expires_at,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
      revoked: Boolean(k.revoked),
    }));

    return res.json({ keys });
  } catch (error) {
    console.error('DCP key list error:', error);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// DELETE /api/renters/:id/keys/:keyId — revoke a dcp_ API key
router.delete('/:id/keys/:keyId', requireRenterAdmin, (req, res) => {
  try {
    const renter = req.renter;
    const keyId = req.params.keyId;
    if (!keyId) return res.status(400).json({ error: 'Key ID required' });

    const now = new Date().toISOString();
    const result = runStatement(
      `UPDATE renter_api_keys SET revoked_at = ?
       WHERE id = ? AND renter_id = ? AND revoked_at IS NULL AND key LIKE 'dcp_%'`,
      now, keyId, renter.id
    );
    if ((result?.changes || 0) === 0) {
      return res.status(404).json({ error: 'Key not found or already revoked' });
    }
    return res.json({ success: true, revoked_at: now });
  } catch (error) {
    console.error('DCP key revoke error:', error);
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// GET /api/renters/me/data-export — PDPL right to access/export
// Alias kept for backwards compatibility: /api/renters/me/export
router.get(['/me/data-export', '/me/export'], renterDataExportLimiter, (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required (x-renter-key header or key query)' });

    const renter = db.get(
      `SELECT id, name, email, organization, status, balance_halala, total_spent_halala, total_jobs, created_at, updated_at
       FROM renters WHERE api_key = ?`,
      key
    );
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const jobs = db.all(
      `SELECT id, job_id, job_type, status, model, provider_id,
              cost_halala, actual_cost_halala, duration_minutes, actual_duration_minutes,
              submitted_at, started_at, completed_at, created_at, updated_at,
              container_spec, gpu_requirements, notes
       FROM jobs
       WHERE renter_id = ?
       ORDER BY COALESCE(completed_at, submitted_at, created_at) DESC`,
      renter.id
    );

    const payments = db.all(
      `SELECT payment_id, amount_sar, amount_halala, status, source_type, description,
              created_at, confirmed_at, refunded_at, refund_amount_halala
       FROM payments
       WHERE renter_id = ?
       ORDER BY created_at DESC`,
      renter.id
    );

    const analytics = {
      status_counts: db.all(
        `SELECT status, COUNT(*) AS count
         FROM jobs
         WHERE renter_id = ?
         GROUP BY status
         ORDER BY count DESC`,
        renter.id
      ),
      daily_spend_last_30d: db.all(
        `SELECT DATE(COALESCE(completed_at, submitted_at, created_at)) AS day,
                COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) AS total_halala,
                COUNT(*) AS job_count
         FROM jobs
         WHERE renter_id = ?
           AND DATE(COALESCE(completed_at, submitted_at, created_at)) >= DATE('now', '-30 day')
         GROUP BY DATE(COALESCE(completed_at, submitted_at, created_at))
         ORDER BY day DESC`,
        renter.id
      ),
      top_gpus: db.all(
        `SELECT COALESCE(p.gpu_model, 'Unknown GPU') AS gpu_model, COUNT(*) AS job_count
         FROM jobs j
         LEFT JOIN providers p ON p.id = j.provider_id
         WHERE j.renter_id = ?
         GROUP BY COALESCE(p.gpu_model, 'Unknown GPU')
         ORDER BY job_count DESC
         LIMIT 10`,
        renter.id
      ),
    };

    const nowIso = new Date().toISOString();
    runStatement(
      `INSERT INTO pdpl_request_log (account_type, account_id, request_type, requested_at, metadata_json)
       VALUES ('renter', ?, 'export', ?, ?)`,
      renter.id,
      nowIso,
      JSON.stringify({ mode: 'direct_json', endpoint: '/api/renters/me/export' })
    );

    sendDataExportReady(renter.email, {
      accountType: 'renter',
      requestedAt: nowIso,
      deliveryMode: 'direct',
    }).catch((e) => console.error('[renters.export] data export email failed:', e.message));

    return res.json({
      exported_at: nowIso,
      account: {
        id: renter.id,
        name: renter.name,
        email: renter.email,
        organization: renter.organization,
        status: renter.status,
        created_at: renter.created_at,
        updated_at: renter.updated_at || null,
        balance_halala: renter.balance_halala,
        total_spent_halala: renter.total_spent_halala,
        total_jobs: renter.total_jobs,
      },
      jobs,
      payments,
      withdrawals: [],
      analytics,
    });
  } catch (error) {
    console.error('Renter export error:', error);
    return res.status(500).json({ error: 'Failed to export renter data' });
  }
});

// DELETE /api/renters/me — PDPL right to erasure
// Soft-deletes and anonymizes renter account (audit trail preserved).
// Auth: x-renter-key header or key query param.
router.delete('/me', renterAccountDeletionLimiter, (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required (x-renter-key header or key query)' });

    const renter = db.get('SELECT id, status, email FROM renters WHERE api_key = ?', key);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });
    if (renter.status === 'deleted') return res.status(410).json({ error: 'Account already deleted' });

    const now = new Date().toISOString();
    const deletionScheduledFor = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
    const anonymizedEmail = hashedDeletedEmail(renter.email, renter.id);
    const tombstoneApiKey = `deleted-renter-${renter.id}-${crypto.randomUUID()}`;

    const cancelledJobs = runStatement(
      `UPDATE jobs SET
         status = 'cancelled',
         error = COALESCE(error, 'Cancelled: renter account deleted by PDPL request'),
         completed_at = COALESCE(completed_at, ?),
         updated_at = ?
       WHERE renter_id = ?
         AND status IN ('queued', 'pending', 'running', 'paused')`,
      now,
      now,
      renter.id
    );

    // Keep operational/audit records but remove renter-auth linkage.
    runStatement(
      `UPDATE jobs SET
         model = NULL,
         task_spec = NULL,
         updated_at = ?
       WHERE renter_id = ?`,
      now,
      renter.id
    );

    // Remove linkage from escrow holds that store renter API key.
    runStatement(
      `UPDATE escrow_holds SET renter_api_key = ? WHERE renter_api_key = ?`,
      `deleted-renter-${renter.id}`,
      key
    );

    // Remove user-generated templates/prompts and mutable quota rows.
    runStatement('DELETE FROM job_templates WHERE renter_id = ?', renter.id);
    runStatement('DELETE FROM renter_quota WHERE renter_id = ?', renter.id);
    runStatement('DELETE FROM quota_log WHERE renter_id = ?', renter.id);

    const updated = runStatement(
      `UPDATE renters SET
         name = '[deleted]',
         email = ?,
         organization = NULL,
         webhook_url = NULL,
         status = 'deleted',
         deleted_at = ?,
         deletion_scheduled_for = ?,
         api_key = ?,
         updated_at = ?
       WHERE id = ?`,
      anonymizedEmail,
      now,
      deletionScheduledFor,
      tombstoneApiKey,
      now,
      renter.id
    );
    if (!updated.changes) return res.status(500).json({ error: 'Account deletion failed' });

    runStatement(
      `INSERT INTO pdpl_request_log (account_type, account_id, request_type, requested_at, metadata_json)
       VALUES ('renter', ?, 'delete', ?, ?)`,
      renter.id,
      now,
      JSON.stringify({ cancelled_jobs: cancelledJobs.changes || 0, deletion_scheduled_for: deletionScheduledFor })
    );

    return res.status(200).json({
      cancelled_jobs: cancelledJobs.changes || 0,
      deletion_scheduled_for: deletionScheduledFor,
      message: 'Account scheduled for deletion in 30 days. Contact support to cancel.',
    });
  } catch (error) {
    console.error('Renter delete error:', error);
    return res.status(500).json({ error: 'Account deletion failed' });
  }
});

// GET /api/renters/me/jobs?key=API_KEY&page=0&limit=20&status= (DCP-695)
router.get('/me/jobs', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(401).json({ error: 'Invalid API key' });
    const renter = { id: renterId };

    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = page * limit;
    const statusFilter = req.query.status;
    const period = req.query.period;

    const conditions = ['j.renter_id = ?'];
    const params = [renter.id];

    if (statusFilter && ['completed', 'failed', 'running', 'pending', 'queued'].includes(statusFilter)) {
      conditions.push('j.status = ?');
      params.push(statusFilter);
    }

    if (period && ['7d', '30d', '90d'].includes(period)) {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      conditions.push('COALESCE(j.created_at, j.submitted_at) >= ?');
      params.push(cutoff);
    }

    const where = conditions.join(' AND ');

    const total = db.get(`SELECT COUNT(*) as count FROM jobs j WHERE ${where}`, ...params);
    const jobs = db.all(
      `SELECT j.id, j.job_id, j.job_type, j.model, j.status,
              COALESCE(j.actual_cost_halala, j.cost_halala, 0) as cost_halala,
              j.submitted_at, j.started_at, j.completed_at,
              COALESCE(j.actual_duration_minutes, j.duration_minutes) as duration_minutes,
              p.gpu_model as provider_gpu
       FROM jobs j
       LEFT JOIN providers p ON p.id = j.provider_id
       WHERE ${where}
       ORDER BY COALESCE(j.created_at, j.submitted_at) DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );

    res.json({
      jobs: jobs.map(j => ({
        ...j,
        cost_sar: (j.cost_halala / 100).toFixed(4),
      })),
      pagination: {
        page,
        limit,
        total: total?.count || 0,
        pages: Math.ceil((total?.count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Renter jobs list error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/renters/me/jobs/export?key=&format=csv&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&status=
router.get('/me/jobs/export', (req, res) => {
  try {
    const { key, from_date, to_date, status: statusFilter } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const conditions = ['j.renter_id = ?'];
    const params = [renter.id];

    if (from_date && /^\d{4}-\d{2}-\d{2}$/.test(from_date)) {
      conditions.push("DATE(COALESCE(j.submitted_at, j.created_at)) >= ?");
      params.push(from_date);
    }
    if (to_date && /^\d{4}-\d{2}-\d{2}$/.test(to_date)) {
      conditions.push("DATE(COALESCE(j.submitted_at, j.created_at)) <= ?");
      params.push(to_date);
    }
    if (statusFilter && ['completed', 'failed', 'running', 'pending'].includes(statusFilter)) {
      conditions.push('j.status = ?');
      params.push(statusFilter);
    }

    const rows = db.all(
      `SELECT j.id, j.job_id, j.job_type, j.status,
              j.actual_cost_halala, j.cost_halala,
              j.provider_id, j.submitted_at, j.completed_at
       FROM jobs j
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(j.submitted_at, j.created_at) DESC
       LIMIT 1000`,
      ...params
    );

    const headers = ['job_id', 'model', 'status', 'cost_halala', 'cost_sar', 'provider_id', 'started_at', 'completed_at', 'duration_seconds'];
    const csvRows = rows.map(r => {
      const costHalala = r.actual_cost_halala ?? r.cost_halala ?? 0;
      const startedAt = r.submitted_at || '';
      const completedAt = r.completed_at || '';
      const durationSec = (startedAt && completedAt)
        ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : '';
      return [
        r.job_id || r.id,
        r.job_type || '',
        r.status || '',
        costHalala,
        (costHalala / 100).toFixed(2),
        r.provider_id || '',
        startedAt,
        completedAt,
        durationSec,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\r\n');
    const today = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=dcp-jobs-${today}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Renter CSV export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── DCP-917: Renter dashboard API ──────────────────────────────────────────

// GET /api/renters/me/jobs/:jobId — single job detail with billing record
router.get('/me/jobs/:jobId', (req, res) => {
  try {
    const renterKey = req.headers['x-renter-key'] || req.query.key;
    if (!renterKey) return res.status(401).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(renterKey);
    if (!renterId) return res.status(401).json({ error: 'Invalid API key' });
    const renter = { id: renterId };

    const { jobId } = req.params;
    // INVISIBILITY: do NOT select p.name (machine/host name). The renter only
    // ever sees GPU TYPE (p.gpu_model) + renter-relevant billing fields.
    const job = db.get(`
      SELECT j.*,
             p.gpu_model       AS provider_gpu_model,
             p.gpu_vram_mib    AS provider_gpu_vram_mib,
             br.gross_cost_halala,
             br.platform_fee_halala,
             br.provider_earning_halala,
             br.currency,
             br.status         AS billing_status,
             br.token_count,
             br.duration_ms
      FROM jobs j
      LEFT JOIN providers p  ON p.id = j.provider_id
      LEFT JOIN billing_records br ON br.job_id = j.job_id
      WHERE (j.job_id = ? OR CAST(j.id AS TEXT) = ?) AND j.renter_id = ?
    `, jobId, jobId, renter.id);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Strict renter allowlist: drops task_spec / container_spec / burst_external_id
    // / endpoint_url / *_host_port etc. Billing fields are renter-relevant and
    // passed via `extra` (the BANNED_KEYS guard still blocks any infra key).
    const safeJob = toRenterJobView(job, {
      gpu: {
        gpu_model: job.provider_gpu_model || null,
        vram_gb: job.provider_gpu_vram_mib ? Math.round(job.provider_gpu_vram_mib / 1024) : null,
      },
      extra: {
        gross_cost_halala: job.gross_cost_halala ?? null,
        platform_fee_halala: job.platform_fee_halala ?? null,
        provider_earning_halala: job.provider_earning_halala ?? null,
        currency: job.currency ?? null,
        billing_status: job.billing_status ?? null,
        token_count: job.token_count ?? null,
        duration_ms: job.duration_ms ?? null,
      },
    });
    return res.json({ job: safeJob });
  } catch (error) {
    console.error('[renters/me/jobs/:jobId]', error);
    return res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// GET /api/renters/me/spending — monthly totals + 30-day daily breakdown
router.get('/me/spending', (req, res) => {
  try {
    const renterKey = req.headers['x-renter-key'] || req.query.key;
    if (!renterKey) return res.status(401).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(renterKey);
    if (!renterId) return res.status(401).json({ error: 'Invalid API key' });
    const renter = { id: renterId };

    const monthly = db.all(`
      SELECT
        strftime('%Y-%m', j.created_at)          AS month,
        COUNT(*)                                  AS jobs,
        COALESCE(SUM(
          COALESCE(br.gross_cost_halala, j.actual_cost_halala, j.cost_halala, 0)
        ), 0)                                     AS total_halala
      FROM jobs j
      LEFT JOIN billing_records br ON br.job_id = j.job_id
      WHERE j.renter_id = ?
        AND j.status = 'completed'
      GROUP BY strftime('%Y-%m', j.created_at)
      ORDER BY month DESC
      LIMIT 12
    `, renter.id);

    const daily = db.all(`
      SELECT
        DATE(j.created_at)                        AS date,
        COUNT(*)                                  AS jobs,
        COALESCE(SUM(
          COALESCE(br.gross_cost_halala, j.actual_cost_halala, j.cost_halala, 0)
        ), 0)                                     AS total_halala
      FROM jobs j
      LEFT JOIN billing_records br ON br.job_id = j.job_id
      WHERE j.renter_id = ?
        AND j.status = 'completed'
        AND j.created_at >= DATE('now', '-30 days')
      GROUP BY DATE(j.created_at)
      ORDER BY date DESC
    `, renter.id);

    const allTime = db.get(`
      SELECT
        COUNT(*)                                  AS total_jobs,
        COALESCE(SUM(
          COALESCE(br.gross_cost_halala, j.actual_cost_halala, j.cost_halala, 0)
        ), 0)                                     AS total_halala
      FROM jobs j
      LEFT JOIN billing_records br ON br.job_id = j.job_id
      WHERE j.renter_id = ?
        AND j.status = 'completed'
    `, renter.id);

    return res.json({
      all_time: {
        total_jobs:   allTime.total_jobs   || 0,
        total_halala: allTime.total_halala || 0,
        total_sar:    (allTime.total_halala || 0) / 100,
      },
      monthly,
      last_30_days: daily,
    });
  } catch (error) {
    console.error('[renters/me/spending]', error);
    return res.status(500).json({ error: 'Failed to fetch spending' });
  }
});

// ─── JOB TEMPLATES ─── (DCP-304)

// Resolve renter id from either the legacy renters.api_key column or the
// renter_api_keys multi-key table (dcp- prefixed keys live there).
function resolveRenterIdByKey(key) {
  if (!key) return null;
  const direct = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
  if (direct) return direct.id;
  const ak = db.get('SELECT renter_id FROM renter_api_keys WHERE key = ? AND revoked_at IS NULL', key);
  if (!ak) return null;
  const linked = db.get('SELECT id FROM renters WHERE id = ? AND status = ?', ak.renter_id, 'active');
  return linked ? linked.id : null;
}

const RENTER_USAGE_PERIODS = new Map([
  ['7d', 7],
  ['30d', 30],
  ['90d', 90],
]);
const USAGE_EXPORT_MAX_ROWS = 5000;
const OPENROUTER_USAGE_COLUMN_CACHE = new Map();
const RENTER_API_KEYS_COLUMN_CACHE = new Map();

function normalizeRenterUsagePeriod(rawPeriod) {
  const period = RENTER_USAGE_PERIODS.has(String(rawPeriod || '')) ? String(rawPeriod) : '30d';
  const days = RENTER_USAGE_PERIODS.get(period);
  return {
    period,
    days,
    cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function normalizeUsageExportLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return USAGE_EXPORT_MAX_ROWS;
  return Math.min(parsed, USAGE_EXPORT_MAX_ROWS);
}

function readRenterKeyFromRequest(req) {
  return req.headers['x-renter-key'] || req.query.key || getBearerToken(req);
}

function requireRenterBillingRead(req) {
  const rawKey = readRenterKeyFromRequest(req);
  if (!rawKey) {
    return {
      error: {
        status: 401,
        body: { error: 'API key required. Use Authorization: Bearer <key> or x-renter-key.' },
      },
    };
  }
  const authCtx = getRenterAuthContext(rawKey);
  if (!authCtx) {
    return { error: { status: 403, body: { error: 'Invalid or inactive API key' } } };
  }
  if (!hasReadScope(authCtx, ['billing'])) {
    return {
      error: {
        status: 403,
        body: { error: 'This API key does not have permission to read usage or budget data. Use your master key or a key with the billing or admin scope.' },
      },
    };
  }
  return { authCtx };
}

function sarFromHalala(halala) {
  return Number((Number(halala || 0) / 100).toFixed(2));
}

function openrouterUsageHasColumn(columnName) {
  const safeName = String(columnName || '');
  if (!safeName) return false;
  if (OPENROUTER_USAGE_COLUMN_CACHE.has(safeName)) return OPENROUTER_USAGE_COLUMN_CACHE.get(safeName);
  try {
    const rows = db.all('PRAGMA table_info(openrouter_usage_ledger)');
    const hasColumn = rows.some((row) => row?.name === safeName);
    OPENROUTER_USAGE_COLUMN_CACHE.set(safeName, hasColumn);
    return hasColumn;
  } catch (_) {
    OPENROUTER_USAGE_COLUMN_CACHE.set(safeName, false);
    return false;
  }
}

function renterApiKeysHasColumn(columnName) {
  const safeName = String(columnName || '');
  if (!safeName) return false;
  if (RENTER_API_KEYS_COLUMN_CACHE.has(safeName)) return RENTER_API_KEYS_COLUMN_CACHE.get(safeName);
  try {
    const rows = db.all('PRAGMA table_info(renter_api_keys)');
    const hasColumn = rows.some((row) => row?.name === safeName);
    RENTER_API_KEYS_COLUMN_CACHE.set(safeName, hasColumn);
    return hasColumn;
  } catch (_) {
    RENTER_API_KEYS_COLUMN_CACHE.set(safeName, false);
    return false;
  }
}

function queryRenterUsageRows(renterId, cutoff, limit) {
  const keyAttributionColumns = [
    openrouterUsageHasColumn('renter_api_key_id') ? 'renter_api_key_id' : 'NULL AS renter_api_key_id',
    openrouterUsageHasColumn('renter_key_type') ? 'renter_key_type' : 'NULL AS renter_key_type',
  ].join(', ');
  return db.all(
    `SELECT id, request_id, provider_response_id, job_id, request_path, model, source,
            ${keyAttributionColumns},
            prompt_tokens, completion_tokens, total_tokens,
            prompt_cost_halala, completion_cost_halala, token_rate_halala,
            cost_halala, currency, created_at, provider_id, usd_prompt,
            usd_completion, usd_total, settlement_status, settlement_id
     FROM openrouter_usage_ledger
     WHERE renter_id = ? AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT ?`,
    renterId, cutoff, limit
  );
}

function queryRenterUsageTotals(renterId, cutoff) {
  return db.get(
    `SELECT COUNT(*) AS total_requests,
            COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(prompt_cost_halala), 0) AS total_prompt_cost_halala,
            COALESCE(SUM(completion_cost_halala), 0) AS total_completion_cost_halala,
            COALESCE(SUM(cost_halala), 0) AS total_cost_halala
     FROM openrouter_usage_ledger
     WHERE renter_id = ? AND created_at >= ?`,
    renterId, cutoff
  ) || {};
}

function serializeUsageExportRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    request_id: row.request_id || null,
    provider_response_id: row.provider_response_id || null,
    job_id: row.job_id || null,
    request_path: row.request_path || null,
    renter_api_key_id: row.renter_api_key_id || null,
    renter_key_type: row.renter_key_type || null,
    model: row.model,
    source: row.source || 'v1',
    prompt_tokens: row.prompt_tokens || 0,
    completion_tokens: row.completion_tokens || 0,
    total_tokens: row.total_tokens || 0,
    prompt_cost_halala: row.prompt_cost_halala || 0,
    completion_cost_halala: row.completion_cost_halala || 0,
    token_rate_halala: row.token_rate_halala ?? null,
    cost_halala: row.cost_halala || 0,
    cost_sar: sarFromHalala(row.cost_halala),
    currency: row.currency || 'SAR',
    created_at: row.created_at,
    provider_id: row.provider_id ?? null,
    usd_prompt: row.usd_prompt ?? null,
    usd_completion: row.usd_completion ?? null,
    usd_total: row.usd_total ?? null,
    settlement_status: row.settlement_status || 'pending',
    settlement_id: row.settlement_id || null,
  }));
}

function usageExportCsv(rows) {
  const headers = [
    'created_at',
    'request_id',
    'renter_api_key_id',
    'renter_key_type',
    'model',
    'source',
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'prompt_cost_halala',
    'completion_cost_halala',
    'cost_halala',
    'cost_sar',
    'currency',
    'settlement_status',
    'provider_id',
    'request_path',
    'job_id',
  ];
  const lines = rows.map((row) => headers.map((key) => csvField(row[key])).join(','));
  return [headers.join(','), ...lines].join('\r\n') + '\r\n';
}

function getScopedKeyUsageMap(renterId, cutoff) {
  const available = openrouterUsageHasColumn('renter_api_key_id');
  const usageByKey = new Map();
  if (!available) return { available, usageByKey };
  const rows = db.all(
    `SELECT renter_api_key_id AS key_id,
            COUNT(*) AS requests_30d,
            COALESCE(SUM(cost_halala), 0) AS spend_30d_halala
     FROM openrouter_usage_ledger
     WHERE renter_id = ?
       AND created_at >= ?
       AND renter_api_key_id IS NOT NULL
     GROUP BY renter_api_key_id`,
    renterId, cutoff
  );
  for (const row of rows) {
    if (!row?.key_id) continue;
    usageByKey.set(row.key_id, {
      requests_30d: Number(row.requests_30d || 0),
      spend_30d_halala: Number(row.spend_30d_halala || 0),
    });
  }
  return { available, usageByKey };
}

function queryRenterUsageByKey(renterId, cutoff) {
  const keyBudgetExpr = renterApiKeysHasColumn('monthly_spend_cap_halala')
    ? 'k.monthly_spend_cap_halala'
    : '0 AS monthly_spend_cap_halala';
  const rows = db.all(
    `WITH keyed_usage AS (
       SELECT renter_api_key_id AS key_id,
              COUNT(*) AS requests,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost_halala), 0) AS spend_halala
       FROM openrouter_usage_ledger
       WHERE renter_id = ?
         AND created_at >= ?
         AND renter_api_key_id IS NOT NULL
       GROUP BY renter_api_key_id
     )
     SELECT k.id, k.label, k.scopes, k.org_id, k.org_role, k.revoked_at,
            ${keyBudgetExpr},
            COALESCE(u.requests, 0) AS requests,
            COALESCE(u.prompt_tokens, 0) AS prompt_tokens,
            COALESCE(u.completion_tokens, 0) AS completion_tokens,
            COALESCE(u.total_tokens, 0) AS total_tokens,
            COALESCE(u.spend_halala, 0) AS spend_halala
     FROM renter_api_keys k
     LEFT JOIN keyed_usage u ON u.key_id = k.id
     WHERE k.renter_id = ?
     ORDER BY spend_halala DESC, requests DESC, k.created_at DESC
     LIMIT 100`,
    renterId, cutoff, renterId
  ).map((row) => {
    const capHalala = Number(row.monthly_spend_cap_halala || 0);
    const spendHalala = Number(row.spend_halala || 0);
    return {
      id: row.id,
      label: row.label || null,
      scopes: parseScopes(row.scopes),
      org_id: row.org_id || null,
      org_role: row.org_role || 'member',
      revoked: Boolean(row.revoked_at),
      requests: Number(row.requests || 0),
      prompt_tokens: Number(row.prompt_tokens || 0),
      completion_tokens: Number(row.completion_tokens || 0),
      total_tokens: Number(row.total_tokens || 0),
      spend_halala: spendHalala,
      spend_sar: sarFromHalala(spendHalala),
      monthly_spend_cap_halala: capHalala,
      monthly_spend_cap_sar: sarFromHalala(capHalala),
      monthly_spend_cap_unlimited: capHalala === 0,
      cap_utilization_pct: capHalala > 0
        ? Math.min(100, Math.round((spendHalala / capHalala) * 10000) / 100)
        : null,
    };
  });

  const unattributed = db.get(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost_halala), 0) AS spend_halala
     FROM openrouter_usage_ledger
     WHERE renter_id = ?
       AND created_at >= ?
       AND renter_api_key_id IS NULL`,
    renterId, cutoff
  ) || {};
  const unattributedSpendHalala = Number(unattributed.spend_halala || 0);
  const keyedSpendHalala = rows.reduce((sum, row) => sum + row.spend_halala, 0);
  const keyedRequests = rows.reduce((sum, row) => sum + row.requests, 0);
  return {
    rows,
    unattributed: {
      requests: Number(unattributed.requests || 0),
      prompt_tokens: Number(unattributed.prompt_tokens || 0),
      completion_tokens: Number(unattributed.completion_tokens || 0),
      total_tokens: Number(unattributed.total_tokens || 0),
      spend_halala: unattributedSpendHalala,
      spend_sar: sarFromHalala(unattributedSpendHalala),
    },
    totals: {
      keys: rows.length,
      requests: keyedRequests + Number(unattributed.requests || 0),
      spend_halala: keyedSpendHalala + unattributedSpendHalala,
      spend_sar: sarFromHalala(keyedSpendHalala + unattributedSpendHalala),
    },
  };
}

function summarizeScopedKeys(renterId, cutoff) {
  const hasKeyBudgetColumn = renterApiKeysHasColumn('monthly_spend_cap_halala');
  const keys = db.all(
    `SELECT scopes, revoked_at,
            ${hasKeyBudgetColumn ? 'monthly_spend_cap_halala' : '0 AS monthly_spend_cap_halala'}
     FROM renter_api_keys
     WHERE renter_id = ?`,
    renterId
  );
  const counts = {
    total: keys.length,
    active: 0,
    revoked: 0,
    admin: 0,
    inference: 0,
    billing: 0,
    compute: 0,
    budgeted: 0,
    monthly_spend_cap_halala: 0,
    attributed_requests_30d: 0,
    attributed_spend_30d_halala: 0,
    per_key_spend_available: openrouterUsageHasColumn('renter_api_key_id'),
    per_key_budgets_available: hasKeyBudgetColumn,
  };
  for (const key of keys) {
    const revoked = Boolean(key.revoked_at);
    if (revoked) {
      counts.revoked += 1;
      continue;
    }
    counts.active += 1;
    const scopes = parseScopes(key.scopes);
    if (scopes.includes('admin')) counts.admin += 1;
    if (scopes.includes('inference')) counts.inference += 1;
    if (scopes.includes('billing')) counts.billing += 1;
    if (scopes.includes('compute')) counts.compute += 1;
    const capHalala = Number(key.monthly_spend_cap_halala || 0);
    if (capHalala > 0) {
      counts.budgeted += 1;
      counts.monthly_spend_cap_halala += capHalala;
    }
  }
  if (counts.per_key_spend_available && cutoff) {
    const usage = getScopedKeyUsageMap(renterId, cutoff);
    for (const row of usage.usageByKey.values()) {
      counts.attributed_requests_30d += row.requests_30d;
      counts.attributed_spend_30d_halala += row.spend_30d_halala;
    }
  }
  return counts;
}

function buildRenterBudgetStatus(authCtx, periodInfo) {
  const renter = db.get(
    `SELECT id, organization, balance_halala, total_spent_halala, total_jobs,
            monthly_spend_cap_halala
     FROM renters
     WHERE id = ? AND status = 'active'`,
    authCtx.renter.id
  );
  if (!renter) return null;

  const usageTotals = queryRenterUsageTotals(renter.id, periodInfo.cutoff);
  const jobTotals = db.get(
    `SELECT COUNT(*) AS total_jobs,
            COALESCE(SUM(COALESCE(br.gross_cost_halala, j.actual_cost_halala, j.cost_halala, 0)), 0) AS total_cost_halala
     FROM jobs j
     LEFT JOIN billing_records br ON br.job_id = j.job_id
     WHERE j.renter_id = ?
       AND COALESCE(j.created_at, j.submitted_at) >= ?
       AND j.status = 'completed'`,
    renter.id, periodInfo.cutoff
  ) || {};
  const quota = db.get(
    `SELECT daily_jobs_limit, monthly_spend_limit_halala, created_at, updated_at
     FROM renter_quota
     WHERE renter_id = ?`,
    renter.id
  );
  const keyCounts = summarizeScopedKeys(renter.id, periodInfo.cutoff);
  const v1CapHalala = Number(renter.monthly_spend_cap_halala || 0);
  const v1SpendHalala = Number(usageTotals.total_cost_halala || 0);
  const v1RemainingHalala = v1CapHalala > 0 ? Math.max(v1CapHalala - v1SpendHalala, 0) : null;
  const v1UtilizationPct = v1CapHalala > 0
    ? Math.min(100, Math.round((v1SpendHalala / v1CapHalala) * 10000) / 100)
    : null;

  return {
    object: 'renter_budget_status',
    version: 'dcp.renter_budget_status.v1',
    generated_at: new Date().toISOString(),
    period: periodInfo.period,
    window: {
      days: periodInfo.days,
      cutoff: periodInfo.cutoff,
    },
    renter: {
      id: renter.id,
      org_id: authCtx.orgId || deriveOrgId(renter),
      organization: renter.organization || null,
      balance_halala: renter.balance_halala || 0,
      balance_sar: sarFromHalala(renter.balance_halala),
      lifetime_spent_halala: renter.total_spent_halala || 0,
      lifetime_spent_sar: sarFromHalala(renter.total_spent_halala),
      lifetime_jobs: renter.total_jobs || 0,
    },
    v1_inference: {
      requests: Number(usageTotals.total_requests || 0),
      prompt_tokens: Number(usageTotals.total_prompt_tokens || 0),
      completion_tokens: Number(usageTotals.total_completion_tokens || 0),
      total_tokens: Number(usageTotals.total_tokens || 0),
      spend_halala: v1SpendHalala,
      spend_sar: sarFromHalala(v1SpendHalala),
      monthly_spend_cap_halala: v1CapHalala,
      monthly_spend_cap_sar: sarFromHalala(v1CapHalala),
      monthly_spend_cap_unlimited: v1CapHalala === 0,
      remaining_cap_halala: v1RemainingHalala,
      remaining_cap_sar: v1RemainingHalala == null ? null : sarFromHalala(v1RemainingHalala),
      cap_utilization_pct: v1UtilizationPct,
    },
    jobs: {
      completed: Number(jobTotals.total_jobs || 0),
      spend_halala: Number(jobTotals.total_cost_halala || 0),
      spend_sar: sarFromHalala(jobTotals.total_cost_halala),
    },
    quota: {
      source: quota ? 'renter_quota' : 'defaults',
      daily_jobs_limit: Number(quota?.daily_jobs_limit || 100),
      monthly_spend_limit_halala: Number(quota?.monthly_spend_limit_halala || 10000),
      monthly_spend_limit_sar: sarFromHalala(quota?.monthly_spend_limit_halala || 10000),
      created_at: quota?.created_at || null,
      updated_at: quota?.updated_at || null,
    },
    api_keys: {
      ...keyCounts,
    },
    team_usage_readiness: buildTeamUsageReadiness(keyCounts),
    claims: {
      v1_account_spend_cap_gate_live: true,
      workspace_usage_export_live: true,
      per_key_spend_attribution_live: keyCounts.per_key_spend_available,
      per_key_budgets_enforced: keyCounts.per_key_budgets_available,
      team_member_budgets_enforced: false,
      prompt_cache_discount_applied: false,
    },
  };
}

function buildRenterMinimumBalanceReadiness(authCtx, periodInfo) {
  const renter = db.get(
    `SELECT id, organization, balance_halala, total_spent_halala, total_jobs,
            monthly_spend_cap_halala, trial_grant_halala
     FROM renters
     WHERE id = ? AND status = 'active'`,
    authCtx.renter.id
  );
  if (!renter) return null;
  const budgetStatus = buildRenterBudgetStatus(authCtx, periodInfo);
  const paidCreditState = getRenterPaidCreditState(db, renter);
  return buildMinimumBalanceReadiness({
    renter,
    paidCreditState,
    budgetStatus,
  });
}

// GET /api/renters/me/templates?key=
router.get('/me/templates', (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const templates = db.all(
      'SELECT id, name, job_type, model, system_prompt, max_tokens, resource_spec_json, created_at FROM job_templates WHERE renter_id = ? ORDER BY created_at DESC',
      renterId
    );
    res.json({ templates });
  } catch (error) {
    console.error('Template list error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/renters/me/templates?key=
router.post('/me/templates', (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });

    const { name, job_type, model, system_prompt, max_tokens, resource_spec_json } = req.body;
    const cleanName = normalizeString(name, { maxLen: 120 });
    const cleanJobType = normalizeString(job_type, { maxLen: 60 });
    const cleanModel = normalizeString(model, { maxLen: 200 });
    if (!cleanName || !cleanJobType || !cleanModel) {
      return res.status(400).json({ error: 'name, job_type and model are required' });
    }

    // Cap templates per renter at 50
    const count = db.get('SELECT COUNT(*) AS n FROM job_templates WHERE renter_id = ?', renterId);
    if (count && count.n >= 50) {
      return res.status(409).json({ error: 'Template limit reached (50). Delete one to save more.' });
    }

    const now = new Date().toISOString();
    const result = runStatement(
      `INSERT INTO job_templates (renter_id, name, job_type, model, system_prompt, max_tokens, resource_spec_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      renterId, cleanName, cleanJobType, cleanModel,
      normalizeString(system_prompt, { maxLen: 2000 }) || null,
      toFiniteInt(max_tokens, { min: 1, max: 16384 }) || null,
      normalizeString(resource_spec_json, { maxLen: 2000 }) || null,
      now
    );
    res.status(201).json({ success: true, template_id: result.lastInsertRowid });
  } catch (error) {
    console.error('Template save error:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// DELETE /api/renters/me/templates/:id?key=
router.delete('/me/templates/:id', (req, res) => {
  try {
    const { key } = req.query;
    const { id } = req.params;
    if (!key) return res.status(400).json({ error: 'API key required' });
    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const templateId = toFiniteInt(id, { min: 1 });
    if (!templateId) return res.status(400).json({ error: 'Invalid template ID' });
    const result = runStatement(
      'DELETE FROM job_templates WHERE id = ? AND renter_id = ?',
      templateId, renterId
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Template delete error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});


// ============================================================================
// GET /api/renters/me/live — Real-time inference dashboard (RunPod-style)
// Returns active requests, recent completed, session stats with tok/s + ETA
// ============================================================================
router.get('/me/live', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const renter = db.get('SELECT id, name, email, balance_halala FROM renters WHERE id = ?', renterId);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const inferenceTracker = require('../services/inferenceTracker');
    const dashboard = inferenceTracker.getLiveDashboard(renter.id);

    res.json({
      renter: {
        id: renter.id,
        name: renter.name,
        balanceHalala: renter.balance_halala,
        balanceSar: ((renter.balance_halala || 0) / 100).toFixed(2),
      },
      ...dashboard,
      _ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch live dashboard' });
  }
});

// ============================================================================
// GET /api/renters/me/budget-status — Fireworks-style usage/budget state
// ============================================================================
router.get('/me/budget-status', (req, res) => {
  try {
    const auth = requireRenterBillingRead(req);
    if (auth.error) return res.status(auth.error.status).json(auth.error.body);

    const periodInfo = normalizeRenterUsagePeriod(req.query.period);
    const status = buildRenterBudgetStatus(auth.authCtx, periodInfo);
    if (!status) return res.status(404).json({ error: 'Renter not found' });
    return res.json(status);
  } catch (error) {
    console.error('Renter budget status error:', error);
    return res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

// ============================================================================
// GET /api/renters/me/minimum-balances — read-only balance gate contract
// ============================================================================
router.get('/me/minimum-balances', (req, res) => {
  try {
    const auth = requireRenterBillingRead(req);
    if (auth.error) return res.status(auth.error.status).json(auth.error.body);

    const periodInfo = normalizeRenterUsagePeriod(req.query.period);
    const readiness = buildRenterMinimumBalanceReadiness(auth.authCtx, periodInfo);
    if (!readiness) return res.status(404).json({ error: 'Renter not found' });
    return res.json(readiness);
  } catch (error) {
    console.error('Renter minimum balance readiness error:', error);
    return res.status(500).json({ error: 'Failed to fetch minimum balance readiness' });
  }
});

// ============================================================================
// GET /api/renters/me/usage/by-key — scoped key usage rollup
// ============================================================================
router.get('/me/usage/by-key', (req, res) => {
  try {
    const auth = requireRenterBillingRead(req);
    if (auth.error) return res.status(auth.error.status).json(auth.error.body);

    const periodInfo = normalizeRenterUsagePeriod(req.query.period);
    const rollup = queryRenterUsageByKey(auth.authCtx.renter.id, periodInfo.cutoff);
    const keyCounts = summarizeScopedKeys(auth.authCtx.renter.id, periodInfo.cutoff);
    return res.json({
      object: 'renter_usage_by_key',
      version: 'dcp.renter_usage_by_key.v1',
      generated_at: new Date().toISOString(),
      period: periodInfo.period,
      window: {
        days: periodInfo.days,
        cutoff: periodInfo.cutoff,
      },
      renter: {
        id: auth.authCtx.renter.id,
        org_id: auth.authCtx.orgId || deriveOrgId(auth.authCtx.renter),
      },
      ...rollup,
      team_usage_readiness: buildTeamUsageReadiness(keyCounts, rollup),
      claims: {
        per_key_spend_attribution_live: keyCounts.per_key_spend_available,
        per_key_budgets_enforced: keyCounts.per_key_budgets_available,
        team_member_rollups_live: false,
      },
    });
  } catch (error) {
    console.error('Renter usage by key error:', error);
    return res.status(500).json({ error: 'Failed to fetch key usage rollup' });
  }
});

// ============================================================================
// GET /api/renters/me/usage/export — v1 usage export as JSON or CSV
// ============================================================================
router.get('/me/usage/export', (req, res) => {
  try {
    const auth = requireRenterBillingRead(req);
    if (auth.error) return res.status(auth.error.status).json(auth.error.body);

    const periodInfo = normalizeRenterUsagePeriod(req.query.period);
    const limit = normalizeUsageExportLimit(req.query.limit);
    const format = String(req.query.format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
    const rows = serializeUsageExportRows(queryRenterUsageRows(auth.authCtx.renter.id, periodInfo.cutoff, limit));
    const totals = queryRenterUsageTotals(auth.authCtx.renter.id, periodInfo.cutoff);
    const payload = {
      object: 'renter_usage_export',
      version: 'dcp.renter_usage_export.v1',
      generated_at: new Date().toISOString(),
      period: periodInfo.period,
      window: {
        days: periodInfo.days,
        cutoff: periodInfo.cutoff,
      },
      renter: {
        id: auth.authCtx.renter.id,
        org_id: auth.authCtx.orgId || deriveOrgId(auth.authCtx.renter),
      },
      totals: {
        ...totals,
        total_cost_sar: sarFromHalala(totals.total_cost_halala),
      },
      rows,
      limit,
      truncated: rows.length >= limit,
      claims: {
        per_key_spend_attribution_live: openrouterUsageHasColumn('renter_api_key_id'),
        prompt_cache_discount_applied: false,
      },
    };

    if (format === 'json') return res.json(payload);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=dcp-v1-usage-${periodInfo.period}.csv`);
    return res.send(usageExportCsv(rows));
  } catch (error) {
    console.error('Renter usage export error:', error);
    return res.status(500).json({ error: 'Usage export failed' });
  }
});

// ============================================================================
// GET /api/renters/me/usage — v1 API usage history (inference calls via /v1/chat/completions)
// ============================================================================
router.get('/me/usage', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    const { limit: rawLimit, offset: rawOffset, period = '30d' } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const renter = { id: renterId };

    const limit = Math.min(Math.max(parseInt(rawLimit) || 50, 1), 200);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const usage = db.all(
      `SELECT id, request_id, model, source, prompt_tokens, completion_tokens, total_tokens,
              cost_halala, currency, created_at, provider_id, usd_prompt, usd_completion, usd_total,
              settlement_status
       FROM openrouter_usage_ledger
       WHERE renter_id = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      renter.id, cutoff, limit, offset
    );

    const totals = db.get(
      `SELECT COUNT(*) as total_requests,
              COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
              COALESCE(SUM(total_tokens), 0) as total_tokens,
              COALESCE(SUM(cost_halala), 0) as total_cost_halala
       FROM openrouter_usage_ledger
       WHERE renter_id = ? AND created_at >= ?`,
      renter.id, cutoff
    );

    res.json({
      usage,
      totals: {
        ...totals,
        total_cost_sar: ((totals?.total_cost_halala || 0) / 100).toFixed(2),
      },
      pagination: { limit, offset, has_more: usage.length === limit },
    });
  } catch (error) {
    console.error('Usage history error:', error);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// GET /api/renters/me/analytics?period=30d  (auth via x-renter-key header or ?key=)
router.get('/me/analytics', (req, res) => {
  try {
    const key = req.headers['x-renter-key'] || req.query.key;
    const { period = '30d' } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const renterId = resolveRenterIdByKey(key);
    if (!renterId) return res.status(404).json({ error: 'Renter not found' });
    const renter = { id: renterId };

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Daily spend for the period
    const dailySpend = db.all(
      `SELECT date(submitted_at) AS day,
              COALESCE(SUM(cost_halala), 0) AS total_halala,
              COUNT(*) AS job_count
       FROM jobs
       WHERE renter_id = ? AND submitted_at >= ?
       GROUP BY date(submitted_at)
       ORDER BY day ASC`,
      renter.id, cutoff
    );

    // Job counts by status (period-scoped; exclude 'stopped' from the success-rate denominator)
    const statusCounts = db.all(
      `SELECT status, COUNT(*) AS count
       FROM jobs
       WHERE renter_id = ? AND submitted_at >= ? AND status != 'stopped'
       GROUP BY status`,
      renter.id, cutoff
    );

    // Average job duration (completed jobs only, period-scoped)
    const durationRow = db.get(
      `SELECT ROUND(AVG(duration_minutes), 1) AS avg_duration,
              COUNT(*) AS completed_count
       FROM jobs
       WHERE renter_id = ? AND submitted_at >= ? AND status = 'completed' AND duration_minutes IS NOT NULL`,
      renter.id, cutoff
    );

    // Top GPU models used
    const topGpus = db.all(
      `SELECT p.gpu_model,
              COUNT(j.id) AS job_count,
              COALESCE(SUM(j.cost_halala), 0) AS total_halala
       FROM jobs j
       JOIN providers p ON j.provider_id = p.id
       WHERE j.renter_id = ? AND p.gpu_model IS NOT NULL
       GROUP BY p.gpu_model
       ORDER BY job_count DESC
       LIMIT 5`,
      renter.id
    );

    res.json({
      period: `${days}d`,
      daily_spend: dailySpend,
      status_counts: statusCounts,
      avg_duration_minutes: durationRow?.avg_duration ?? null,
      completed_job_count: durationRow?.completed_count ?? 0,
      top_gpus: topGpus,

      // v1 API usage (inference calls via /v1/chat/completions)      v1_usage: (() => {        const v1Daily = db.all(          `SELECT date(created_at) AS day,                  COALESCE(SUM(cost_halala), 0) AS total_halala,                  COUNT(*) AS request_count,                  COALESCE(SUM(total_tokens), 0) AS total_tokens           FROM openrouter_usage_ledger           WHERE renter_id = ? AND created_at >= ?           GROUP BY date(created_at)           ORDER BY day ASC`,          renter.id, cutoff        );        const v1Totals = db.get(          `SELECT COUNT(*) as total_requests,                  COALESCE(SUM(total_tokens), 0) as total_tokens,                  COALESCE(SUM(cost_halala), 0) as total_cost_halala           FROM openrouter_usage_ledger           WHERE renter_id = ? AND created_at >= ?`,          renter.id, cutoff        );        return { daily: v1Daily, totals: v1Totals };      })(),
    });
  } catch (error) {
    console.error('Renter analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── RENTER-FACING TOPUP, BALANCE & TRANSACTIONS — DCP-861 ──────────────────
// Renter-owned endpoints. Auth: x-renter-key must match the :id renter.
// These mirror the admin /:id/balance + /:id/topup routes but allow
// renters to self-serve without admin token.

const { VALID_EVENTS: WEBHOOK_VALID_EVENTS } = require('../services/renterWebhookService');

/**
 * Middleware factory: authenticate renter key, enforce org-scoped RBAC role,
 * and emit immutable org audit entries for each access decision.
 */
function requireRenterRole(minRole) {
  return function renterRoleGuard(req, res, next) {
    const rawHeaderKey = req.headers['x-renter-key'];
    const key = rawHeaderKey || req.query.key || getBearerToken(req);
    const action = `${req.method.toUpperCase()} ${req.baseUrl}${req.path}`;

    if (!key) {
      recordOrgAudit({
        org_id: 'org:unknown',
        actor_type: 'unknown',
        actor_role: 'unknown',
        action,
        resource_type: 'renter',
        resource_id: req.params?.id || null,
        outcome: 'deny',
        reason: 'missing_key',
      });
      return res.status(401).json({ error: 'x-renter-key header required' });
    }

    const auth = getRenterAuthContext(key);
    if (!auth) {
      recordOrgAudit({
        org_id: 'org:unknown',
        actor_type: 'unknown',
        actor_role: 'unknown',
        action,
        resource_type: 'renter',
        resource_id: req.params?.id || null,
        outcome: 'deny',
        reason: 'invalid_or_revoked_key',
      });
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const paramId = parseInt(req.params.id, 10);
    if (!Number.isInteger(paramId) || auth.renter.id !== paramId) {
      recordOrgAudit({
        org_id: auth.orgId,
        actor_type: auth.actorType,
        actor_id: auth.actorId,
        actor_role: auth.role,
        renter_id: auth.renter.id,
        action,
        resource_type: 'renter',
        resource_id: String(req.params?.id || ''),
        outcome: 'deny',
        reason: 'renter_mismatch',
      });
      return res.status(403).json({ error: 'Forbidden: key does not match renter id' });
    }

    const actorRank = ORG_ROLE_RANK.get(auth.role) ?? Number.MAX_SAFE_INTEGER;
    const requiredRank = ORG_ROLE_RANK.get(minRole) ?? -1;
    if (actorRank > requiredRank) {
      recordOrgAudit({
        org_id: auth.orgId,
        actor_type: auth.actorType,
        actor_id: auth.actorId,
        actor_role: auth.role,
        renter_id: auth.renter.id,
        action,
        resource_type: 'renter',
        resource_id: String(paramId),
        outcome: 'deny',
        reason: `requires_${minRole}`,
        metadata_json: JSON.stringify({ key_id: auth.keyId, required_role: minRole }),
      });
      return res.status(403).json({ error: `Forbidden: ${minRole} role required` });
    }

    req.renter = db.get('SELECT * FROM renters WHERE id = ? AND status = ?', auth.renter.id, 'active');
    if (!req.renter) {
      return res.status(404).json({ error: 'Renter not found' });
    }
    req.rbac = {
      orgId: auth.orgId,
      role: auth.role,
      actorType: auth.actorType,
      actorId: auth.actorId,
      keyId: auth.keyId,
    };

    recordOrgAudit({
      org_id: auth.orgId,
      actor_type: auth.actorType,
      actor_id: auth.actorId,
      actor_role: auth.role,
      renter_id: auth.renter.id,
      action,
      resource_type: 'renter',
      resource_id: String(paramId),
      outcome: 'allow',
      reason: `min_role_${minRole}`,
      metadata_json: JSON.stringify({ key_id: auth.keyId, required_role: minRole }),
    });

    return next();
  };
}

function requireRenterAdmin(req, res, next) {
  return requireRenterRole('admin')(req, res, next);
}

function requireRenterAdminOrAdminFallback(req, res, next) {
  // This path is intentionally shared with the admin top-up route below.
  // If a valid admin token is present, defer to the later admin handler.
  if (isAdminRequest(req)) return next('route');
  return requireRenterAdmin(req, res, next);
}

function requireRenterMember(req, res, next) {
  return requireRenterRole('member')(req, res, next);
}

function requireRenterReadOnly(req, res, next) {
  return requireRenterRole('read-only')(req, res, next);
}

/**
 * POST /api/renters/:id/topup
 * Self-serve renter credit top-up (placeholder payment — no gateway yet).
 * Body: { amount_sar: number, payment_ref?: string }
 *
 * SECURITY (DCP-885): This endpoint adds balance without payment gateway verification.
 * It MUST only be enabled in non-production environments. Gate: ALLOW_SANDBOX_TOPUP=true.
 * In production, renters must top up via the Moyasar payment flow (/api/payments/topup).
 */
router.post('/:id/topup', requireRenterAdminOrAdminFallback, (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SANDBOX_TOPUP !== 'true') {
    return res.status(403).json({ error: 'Direct top-up disabled in production. Use the payment flow.' });
  }

  const { amount_sar, payment_ref } = req.body || {};
  const renter = req.renter;

  const amountSar = typeof amount_sar === 'number' ? amount_sar : Number(amount_sar);
  if (!Number.isFinite(amountSar) || amountSar <= 0) {
    return res.status(400).json({ error: 'amount_sar must be a positive number' });
  }
  if (amountSar > 10000) {
    return res.status(400).json({ error: 'amount_sar exceeds maximum of 10,000 SAR per transaction' });
  }

  const amountHalala = Math.round(amountSar * 100);
  const paymentRef = (typeof payment_ref === 'string' && payment_ref.trim()) ? payment_ref.trim().slice(0, 200) : null;

  try {
    const { getRenterBalance: _getRenterBalance, addCredits: _addCredits } = require('../services/creditService');
    const result = _addCredits(db, renter.id, amountHalala, 'topup', {
      paymentRef,
      note: paymentRef ? `Self-serve topup via ref ${paymentRef}` : 'Self-serve topup',
    });
    res.json({
      success: true,
      transaction_id: result.ledger_id,
      amount_sar: amountSar,
      amount_halala: amountHalala,
      new_balance_sar: result.new_balance_sar,
      new_balance_halala: result.new_balance_halala,
      payment_ref: paymentRef,
    });
  } catch (err) {
    console.error('POST /:id/topup (renter) error:', err);
    res.status(500).json({ error: 'Top-up failed' });
  }
});

/**
 * GET /api/renters/:id/balance
 * Renter-facing balance check — returns balance_sar + last 5 transactions.
 */
router.get('/:id/balance', requireRenterReadOnly, (req, res) => {
  try {
    const { getRenterBalance: _getRenterBalance, getLedger: _getLedger } = require('../services/creditService');
    const balance = _getRenterBalance(db, req.renter.id);
    if (!balance) return res.status(404).json({ error: 'Renter not found' });

    const recent = _getLedger(db, req.renter.id, { limit: 5, offset: 0 });

    res.json({
      balance_sar: balance.balance_sar,
      balance_halala: balance.balance_halala,
      balance_usd: balance.balance_usd,
      last_topup_at: balance.last_topup_at,
      total_spent_sar: balance.total_spent_sar,
      recent_transactions: recent.entries,
    });
  } catch (err) {
    console.error('GET /:id/balance (renter) error:', err);
    res.status(500).json({ error: 'Balance check failed' });
  }
});

/**
 * GET /api/renters/:id/transactions
 * Paginated credit/debit transaction history for the renter.
 * Query: limit (max 50, default 20), offset (default 0), direction (credit|debit)
 */
router.get('/:id/transactions', requireRenterReadOnly, (req, res) => {
  const rawLimit = parseInt(req.query.limit, 10);
  const rawOffset = parseInt(req.query.offset, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const { direction } = req.query;

  try {
    const { getLedger: _getLedger } = require('../services/creditService');
    const ledger = _getLedger(db, req.renter.id, { limit, offset, direction });
    res.json(ledger);
  } catch (err) {
    console.error('GET /:id/transactions error:', err);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
});

/**
 * POST /api/renters/:id/webhooks
 * Register a webhook endpoint for job lifecycle events.
 * Body: { url: string (https only, port 443, public IP), secret: string (16+ chars), events?: string[] }
 *
 * SSRF prevention: validateWebhookUrl middleware enforces HTTPS-only, port 443,
 * blocks RFC-1918/loopback/link-local addresses, and performs a live DNS resolution check.
 */
router.post('/:id/webhooks', requireRenterAdmin, validateWebhookUrl('url'), (req, res) => {
  const { url, secret, events } = req.body || {};
  const renter = req.renter;

  // URL is pre-validated by validateWebhookUrl middleware (SSRF-safe HTTPS URL on port 443)
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  // Use the middleware-normalised URL (trimmed, canonical) when available
  const parsedUrl = req.validatedWebhookUrl ? new URL(req.validatedWebhookUrl) : new URL(url.trim());

  // Validate secret — must be 16+ chars
  if (typeof secret !== 'string' || secret.length < 16) {
    return res.status(400).json({ error: 'secret must be at least 16 characters' });
  }

  // Validate events list — defaults to all valid events
  const DEFAULT_EVENTS = ['job.completed', 'job.failed', 'balance.low'];
  let eventList = DEFAULT_EVENTS;
  if (events != null) {
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }
    const invalid = events.filter(e => !WEBHOOK_VALID_EVENTS.has(e));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Invalid event(s): ${invalid.join(', ')}. Valid: ${[...WEBHOOK_VALID_EVENTS].join(', ')}`,
      });
    }
    eventList = [...new Set(events)]; // dedupe
  }

  // Limit: max 5 active webhooks per renter
  const existingCount = db.get(
    `SELECT COUNT(*) as n FROM renter_webhooks WHERE renter_id = ? AND active = 1`,
    renter.id
  );
  if (existingCount && existingCount.n >= 5) {
    return res.status(422).json({ error: 'Maximum 5 active webhooks per renter' });
  }

  try {
    const { randomUUID } = require('crypto');
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO renter_webhooks (id, renter_id, url, secret, events, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(id, renter.id, parsedUrl.toString(), secret, eventList.join(','), now);

    res.status(201).json({
      id,
      url: parsedUrl.toString(),
      events: eventList,
      active: true,
      created_at: now,
    });
  } catch (err) {
    console.error('POST /:id/webhooks error:', err);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

/**
 * GET /api/renters/:id/webhooks
 * List all active webhooks for the renter (secret is masked).
 */
router.get('/:id/webhooks', requireRenterReadOnly, (req, res) => {
  try {
    const webhooks = db.all(
      `SELECT id, url, events, active, created_at
       FROM renter_webhooks WHERE renter_id = ? ORDER BY created_at DESC`,
      req.renter.id
    );
    res.json({
      webhooks: webhooks.map(w => ({
        ...w,
        events: w.events.split(','),
        active: !!w.active,
      })),
    });
  } catch (err) {
    console.error('GET /:id/webhooks error:', err);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

/**
 * DELETE /api/renters/:id/webhooks/:webhookId
 * Deactivate a webhook (soft-delete).
 */
router.delete('/:id/webhooks/:webhookId', requireRenterAdmin, (req, res) => {
  const { webhookId } = req.params;
  try {
    const webhook = db.get(
      `SELECT id FROM renter_webhooks WHERE id = ? AND renter_id = ?`,
      webhookId, req.renter.id
    );
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    db.prepare(
      `UPDATE renter_webhooks SET active = 0, updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), webhookId);

    res.json({ success: true, id: webhookId, active: false });
  } catch (err) {
    console.error('DELETE /:id/webhooks/:webhookId error:', err);
    res.status(500).json({ error: 'Failed to deactivate webhook' });
  }
});

// ─── CREDIT BALANCE & LEDGER — DCP-755 ──────────────────────────────────────
// Admin-facing endpoints that operate on a renter by numeric :id.
// All require DC1_ADMIN_TOKEN (x-admin-token header).

const { requireAdminAuth } = require('../middleware/auth');
const { getRenterBalance, addCredits, getLedger } = require('../services/creditService');

/**
 * GET /api/renters/:id/balance
 * Current credit balance for a renter (admin only).
 */
router.get('/:id/balance', requireAdminAuth, (req, res) => {
  const renterId = parseInt(req.params.id, 10);
  if (!renterId || renterId <= 0) return res.status(400).json({ error: 'Invalid renter id' });

  try {
    const result = getRenterBalance(db, renterId);
    if (!result) return res.status(404).json({ error: 'Renter not found' });
    res.json(result);
  } catch (err) {
    console.error('GET /:id/balance error:', err);
    res.status(500).json({ error: 'Failed to retrieve balance' });
  }
});

/**
 * POST /api/renters/:id/topup
 * Record a manual credit top-up for a renter (admin only).
 *
 * Body: { amount_halala?: number, amount_sar?: number, payment_ref?: string, note?: string }
 */
router.post('/:id/topup', requireAdminAuth, (req, res) => {
  const renterId = parseInt(req.params.id, 10);
  if (!renterId || renterId <= 0) return res.status(400).json({ error: 'Invalid renter id' });

  const renter = db.get('SELECT id, status FROM renters WHERE id = ?', renterId);
  if (!renter) return res.status(404).json({ error: 'Renter not found' });

  const { amount_halala, amount_sar, payment_ref, note } = req.body;

  let amountHalala = null;
  if (Number.isFinite(amount_halala) && amount_halala > 0) {
    amountHalala = Math.round(amount_halala);
  } else if (Number.isFinite(amount_sar) && amount_sar > 0) {
    amountHalala = Math.round(amount_sar * 100);
  }

  if (!amountHalala || amountHalala <= 0) {
    return res.status(400).json({ error: 'Provide amount_halala (integer) or amount_sar (float), must be > 0' });
  }
  if (amountHalala > 1_000_000) {
    return res.status(400).json({ error: 'Max top-up is 10,000 SAR (1,000,000 halala) per transaction' });
  }

  try {
    const result = addCredits(db, renterId, amountHalala, 'topup', {
      paymentRef: payment_ref || null,
      note: note || null,
    });
    res.json(result);
  } catch (err) {
    console.error('POST /:id/topup error:', err);
    res.status(500).json({ error: 'Top-up failed' });
  }
});

/**
 * GET /api/renters/:id/ledger
 * Paginated credit/debit transaction history (admin only).
 *
 * Query params: limit (max 200, default 50), offset (default 0), direction (credit|debit)
 */
router.get('/:id/ledger', requireAdminAuth, (req, res) => {
  const renterId = parseInt(req.params.id, 10);
  if (!renterId || renterId <= 0) return res.status(400).json({ error: 'Invalid renter id' });

  const renter = db.get('SELECT id FROM renters WHERE id = ?', renterId);
  if (!renter) return res.status(404).json({ error: 'Renter not found' });

  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const { direction } = req.query;

  try {
    const ledger = getLedger(db, renterId, { limit, offset, direction });
    res.json(ledger);
  } catch (err) {
    console.error('GET /:id/ledger error:', err);
    res.status(500).json({ error: 'Failed to retrieve ledger' });
  }
});

// NOTE (DCP-885): The duplicate POST /:id/webhooks route that was added in DCP-863 has been
// removed. Express uses the first registered route handler for a given path; the route above
// at line ~1737 (with requireRenterOwner + validateWebhookUrl) is the canonical handler.
// The DCP-863 version was dead code that could never be reached. SSRF protection is now
// applied to the existing route via the validateWebhookUrl middleware added in DCP-885.

module.exports = router;
