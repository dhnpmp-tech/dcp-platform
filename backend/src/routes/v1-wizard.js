'use strict';

/**
 * Provider-onboarding wizard API surface, mounted under `/v1/`.
 *
 * Covers the 8 endpoints in `docs/technical-specs/web-wizard-spec.md`:
 *   POST /v1/auth/register         - trigger magic-link (new or existing user)
 *   POST /v1/auth/login            - trigger magic-link (existing user)
 *   POST /v1/auth/session          - exchange Supabase access_token for DCP api_key
 *   GET  /v1/provider/eligibility  - provider onboarding eligibility
 *   POST /v1/provider/gpu-profile  - submit detected/declared GPU hardware
 *   POST /v1/provider/config       - save schedule / pricing preferences
 *   POST /v1/provider/install-token - one-time install token for daemon
 *   POST /v1/provider/register-node - daemon first-run handshake (install-token auth)
 *   GET  /v1/provider/node-status  - polled by Step 6 of the wizard
 *   GET  /v1/provider/earnings     - earnings summary
 *
 * Auth model decision (confirmed with Peter): DCP uses Supabase magic-link,
 * not password. The wizard spec reads as a password flow, so register/login
 * here return 202 { next: "check_email" } and the wizard then calls
 * /auth/session with the Supabase access_token it receives after the magic
 * link click. This bridges the wizard to the existing OTP/magic-link
 * infrastructure without introducing password auth.
 *
 * This file intentionally does NOT live inside the large v1.js router
 * (OpenAI-compat /chat/completions, /models) to keep concerns separated:
 * v1.js     = OpenAI-compat inference surface
 * v1-wizard = wizard + provider onboarding surface
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { sendOtp, verifyOtp, verifyMagicToken } = require('../services/auth-otp');
const { findActiveAccountByEmail, buildConflictResponse } = require('../services/cross-role-uniqueness');
const { GPU_RATE_TABLE, SAR_USD_RATE } = require('../config/pricing');
const { looksLikeRenterKey } = require('../middleware/auth');

const router = express.Router();

// ── Schema (idempotent) ─────────────────────────────────────────────
// Wizard-specific tables. Kept narrow to avoid coupling with the
// provider-onboarding flow already served by /api/providers/*.

// db._db is the raw better-sqlite3 instance exposed by the wrapper in
// src/db.js; used here because .exec() is the only way to run a multi-
// statement DDL block without splitting each statement manually.
db._db.exec(`
  CREATE TABLE IF NOT EXISTS wizard_install_tokens (
    token TEXT PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_wizard_install_tokens_provider
    ON wizard_install_tokens(provider_id, consumed_at);

  CREATE TABLE IF NOT EXISTS wizard_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL UNIQUE,
    schedule TEXT NOT NULL DEFAULT 'always_on',
    gpu_load_max_pct INTEGER NOT NULL DEFAULT 100,
    vram_max_pct INTEGER NOT NULL DEFAULT 100,
    power_limit TEXT NOT NULL DEFAULT 'default',
    timezone TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  );
`);

// Additive column: stable per-machine identity captured on first-run handshake
// so a retried register-node (same hardware) re-resolves to the SAME api_key
// instead of stranding the daemon on a single-use-token 409. better-sqlite3
// throws on a duplicate ADD COLUMN, so this is wrapped and idempotent.
try {
  db._db.exec(`ALTER TABLE providers ADD COLUMN node_fingerprint TEXT`);
} catch (_) {
  // Column already exists (re-run or already migrated) — safe to ignore.
}

// ── Wizard activation constants ─────────────────────────────────────
// Live-gate heartbeat freshness window. The wizard's "You're Live" claim is
// stricter than the marketplace bookability window (computeProviderStatus in
// routes/providers.js uses 120s); the wizard promises the user the node is
// serving RIGHT NOW, so it requires a heartbeat inside 90s.
const WIZARD_LIVE_HEARTBEAT_WINDOW_MS = 90 * 1000;

// Auto-approve daemons that complete the wizard-origin first-run handshake.
// Defaults ON. Set DCP_WIZARD_AUTO_APPROVE=0 to fall back to manual approval
// (node-status then reports state='pending_approval' with next steps).
function wizardAutoApproveEnabled() {
  return process.env.DCP_WIZARD_AUTO_APPROVE !== '0';
}

// Derive a stable machine identity from the daemon's first-run payload.
// Prefers an explicit fingerprint/machine-id; falls back to hostname so the
// current installer (which sends hostname, not a fingerprint) is still
// idempotent. Returns null when nothing identifying was sent.
function deriveNodeFingerprint(body) {
  const raw = body.fingerprint || body.machine_id || body.hardware_id || body.hostname;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s ? s.slice(0, 200) : null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@') || trimmed.length > 320) return null;
  return trimmed;
}

function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const r = value.trim().toLowerCase();
  return r === 'provider' || r === 'renter' ? r : null;
}

function normalizeString(value, max = 200) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function wizardError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// ── POST /v1/auth/register ──────────────────────────────────────────
// Bridges wizard "create account" to magic-link. Returns 202 and
// prompts the wizard to show a "check your email" screen.

router.post('/auth/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return wizardError(res, 400, 'invalid_email', 'A valid email is required');
    }
    const role = normalizeRole(req.body?.role) || 'provider';
    const displayName = normalizeString(req.body?.display_name, 120);

    // Note: password field in req.body is deliberately ignored. DCP auth
    // is magic-link only; the wizard spec documents password but the
    // confirmed implementation bridges to OTP/magic-link.

    // Dual-role allowed: the historical hard block (see migration 006) was
    // softened on 2026-05-09 because real users (Tareq, Fadi) hit it during
    // onboarding. We still log the cross-role state so we can monitor for
    // anomalies and offer a role switch in the UI.
    const conflict = findActiveAccountByEmail(db, email);
    if (conflict && conflict.role !== role) {
      console.log(`[v1-wizard/register] dual-role onboarding: ${email} already has ${conflict.role} (id=${conflict.id}), now registering as ${role}`);
    }

    // For new providers we pre-stage a row so verify-otp/magic-link-exchange
    // can find them. Renters are created on first magic-link exchange.
    if (role === 'provider') {
      const existing = db.get('SELECT id FROM providers WHERE LOWER(email) = LOWER(?)', email);
      if (!existing) {
        try {
          db.run(
            `INSERT INTO providers (email, name, status, created_at)
             VALUES (?, ?, 'pending', datetime('now'))`,
            email,
            displayName || email.split('@')[0],
          );
        } catch (insertErr) {
          console.warn('[V1-WIZARD] pre-stage provider insert failed:', insertErr.message);
        }
      }
    }

    const sent = await sendOtp(email, { requestedRole: role });
    if (!sent.success) {
      return wizardError(res, 502, 'email_send_failed', sent.error || 'Failed to send sign-in email');
    }

    return res.status(202).json({
      next: 'check_email',
      email,
      role,
      message: `We sent a sign-in link to ${email}. Click it to complete registration.`,
    });
  } catch (err) {
    console.error('[V1-WIZARD] register error:', err);
    return wizardError(res, 500, 'register_failed', 'Registration failed');
  }
});

// ── POST /v1/auth/login ─────────────────────────────────────────────
// Bridges wizard "sign in" to magic-link.

router.post('/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return wizardError(res, 400, 'invalid_email', 'A valid email is required');
    }

    // Wizard /auth/login is provider-only (the wizard itself is the provider
    // onboarding flow). Tag the otp_codes row so cross-device clicks land
    // on the provider dashboard.
    const sent = await sendOtp(email, { requestedRole: 'provider' });
    if (!sent.success) {
      return wizardError(res, 502, 'email_send_failed', sent.error || 'Failed to send sign-in email');
    }

    return res.status(202).json({
      next: 'check_email',
      email,
      message: `We sent a sign-in link to ${email}. Click it to continue.`,
    });
  } catch (err) {
    console.error('[V1-WIZARD] login error:', err);
    return wizardError(res, 500, 'login_failed', 'Login failed');
  }
});

// ── POST /v1/auth/session ───────────────────────────────────────────
// Accepts either:
//   { magic_token: "..." }  — from clicking the email link
//   { email: "...", code: "..." }  — from entering the 6-digit OTP
// Returns the DCP api_key for the matching provider/renter.

router.post('/auth/session', async (req, res) => {
  try {
    let email = null;

    // Option 1: Magic link token (from clicking the email button)
    const magicToken = typeof req.body?.magic_token === 'string' ? req.body.magic_token.trim() : null;
    // Also accept access_token for backward compat (old frontend may send this)
    const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : null;
    const token = magicToken || accessToken;

    if (token && token.length === 64) {
      // Looks like our magic token (64 hex chars)
      const result = verifyMagicToken(token);
      if (!result.success) {
        return wizardError(res, 401, 'invalid_session', result.error || 'Invalid or expired sign-in link');
      }
      email = result.user.email;
    } else if (req.body?.email && req.body?.code) {
      // Option 2: Email + OTP code
      const cleanEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : null;
      if (!cleanEmail) return wizardError(res, 400, 'invalid_email', 'Valid email is required');
      const otpResult = await verifyOtp(cleanEmail, req.body.code);
      if (!otpResult.success) {
        return wizardError(res, 401, 'invalid_code', otpResult.error || 'Invalid verification code');
      }
      email = cleanEmail;
    } else {
      return wizardError(res, 400, 'missing_credentials', 'Provide magic_token (from email link) or email + code (6-digit OTP)');
    }

    // Look up provider or renter by email
    const renter = db.get(
      'SELECT * FROM renters WHERE LOWER(email) = LOWER(?) AND status = ?',
      email, 'active',
    );
    if (renter) {
      return res.json({
        role: 'renter',
        user_id: renter.id,
        token: renter.api_key,
        user: {
          id: renter.id,
          email: renter.email,
          name: renter.name,
          organization: renter.organization,
        },
      });
    }

    const provider = db.get('SELECT * FROM providers WHERE LOWER(email) = LOWER(?)', email);
    if (provider) {
      return res.json({
        role: 'provider',
        user_id: provider.id,
        token: provider.api_key,
        user: {
          id: provider.id,
          email: provider.email,
          name: provider.name,
          status: provider.status,
        },
      });
    }

    return wizardError(res, 404, 'account_not_found', 'No account found for this email. Please register first.');
  } catch (err) {
    console.error('[V1-WIZARD] session error:', err);
    return wizardError(res, 500, 'session_failed', 'Session exchange failed');
  }
});

// ── Provider auth middleware (Bearer <api_key>) ─────────────────────

function extractBearer(req) {
  const auth = req.headers['authorization'];
  if (typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireProvider(req, res, next) {
  const key = extractBearer(req);
  if (!key) {
    return wizardError(res, 401, 'missing_token', 'Authorization: Bearer <token> required');
  }
  // H1 — reject renter-prefixed keys on a provider-only path.
  if (looksLikeRenterKey(key)) {
    return wizardError(res, 401, 'wrong_key_type', 'Renter key cannot be used on provider endpoint');
  }
  const provider = db.get('SELECT * FROM providers WHERE api_key = ?', key);
  if (!provider) {
    return wizardError(res, 401, 'invalid_token', 'Token does not match a known provider');
  }
  req.provider = provider;
  next();
}

// ── GPU rate lookup helpers ────────────────────────────────────────

// Apple Silicon bandwidth and rate table (spec lines 336-354).
const APPLE_SILICON_RATES = {
  'm1':       { hourly: 0.08, bandwidth_gbps: 68 },
  'm1_pro':   { hourly: 0.15, bandwidth_gbps: 200 },
  'm1_ultra': { hourly: 0.35, bandwidth_gbps: 800 },
  'm2':       { hourly: 0.10, bandwidth_gbps: 100 },
  'm2_pro':   { hourly: 0.16, bandwidth_gbps: 200 },
  'm2_max':   { hourly: 0.28, bandwidth_gbps: 400 },
  'm2_ultra': { hourly: 0.48, bandwidth_gbps: 800 },
  'm3':       { hourly: 0.10, bandwidth_gbps: 100 },
  'm3_pro':   { hourly: 0.18, bandwidth_gbps: 150 },
  'm3_max':   { hourly: 0.35, bandwidth_gbps: 400 },
  'm3_ultra': { hourly: 0.55, bandwidth_gbps: 819 },
  'm4':       { hourly: 0.12, bandwidth_gbps: 120 },
  'm4_pro':   { hourly: 0.22, bandwidth_gbps: 273 },
  'm4_max':   { hourly: 0.40, bandwidth_gbps: 546 },
  'm4_ultra': { hourly: 0.65, bandwidth_gbps: 819 },
};

function lookupGpuRate(vendor, model) {
  const v = (vendor || '').toLowerCase();
  // Normalise separators so callers can send 'rtx 4090', 'rtx-4090', or 'rtx_4090'.
  // The wizard's gpu-catalog.ts ships ids like 'rtx_4090' / 'm3_max' — without
  // the underscore pass here, every catalog pick resolved to unknown_gpu (= $0).
  const m = (model || '').toLowerCase().replace(/[\s\-_]+/g, ' ').trim();

  if (v === 'apple') {
    const key = m.replace(/\s+/g, '_');
    const row = APPLE_SILICON_RATES[key];
    if (row) return { hourly_usd: row.hourly, bandwidth_gbps: row.bandwidth_gbps, display: `Apple ${model}` };
  }
  if (v === 'nvidia' || v === 'amd' || v === '') {
    for (const entry of GPU_RATE_TABLE) {
      const match = entry.models.some((candidate) => m.includes(candidate.toLowerCase()));
      if (match) {
        return {
          hourly_usd: entry.rate_per_hour_usd,
          bandwidth_gbps: null,
          display: entry.display_name,
        };
      }
    }
  }
  return null;
}

function sumGpuRate(gpus) {
  if (!Array.isArray(gpus) || !gpus.length) return { hourly: 0, bandwidth: null, known: false };
  let hourly = 0;
  let bandwidth = 0;
  let allKnown = true;
  for (const g of gpus) {
    const rate = lookupGpuRate(g?.vendor, g?.model);
    if (!rate) { allKnown = false; continue; }
    const count = Math.max(1, Number(g?.count) || 1);
    hourly += rate.hourly_usd * count;
    if (rate.bandwidth_gbps) bandwidth += rate.bandwidth_gbps * count;
  }
  return {
    hourly: Math.round(hourly * 10000) / 10000,
    bandwidth: bandwidth > 0 ? bandwidth : null,
    known: allKnown,
  };
}

// ── GET /v1/provider/eligibility ───────────────────────────────────

router.get('/provider/eligibility', requireProvider, (req, res) => {
  const p = req.provider;
  let eligible = true;
  let reason = null;

  if (p.status === 'suspended') { eligible = false; reason = 'Account suspended — contact support'; }
  else if (p.status === 'rejected') { eligible = false; reason = 'Account rejected'; }
  else if (p.deleted_at) { eligible = false; reason = 'Account deleted'; }

  return res.json({
    eligible,
    reason,
    region: p.location || 'SA',
    account_status: p.status || 'pending',
  });
});

// ── GET /v1/provider/me ────────────────────────────────────────────
// Returns provider identity + PDPL compliance state. Used by Step 5
// of the /setup wizard to decide whether to show the consent modal.

router.get('/provider/me', requireProvider, (req, res) => {
  const p = req.provider;
  return res.json({
    provider_id: p.id,
    email: p.email || null,
    full_name: p.full_name || null,
    phone: p.phone || null,
    city: p.city || null,
    country: p.country || null,
    pdpl_consented_at: p.pdpl_consented_at || null,
  });
});

// ── POST /v1/provider/gpu-profile ──────────────────────────────────

router.post('/provider/gpu-profile', requireProvider, (req, res) => {
  const body = req.body || {};
  const gpus = Array.isArray(body.gpus) ? body.gpus : null;
  if (!gpus || !gpus.length) {
    return wizardError(res, 400, 'invalid_gpus', 'gpus[] is required with at least one entry');
  }
  for (const g of gpus) {
    if (!g || typeof g.vendor !== 'string' || typeof g.model !== 'string') {
      return wizardError(res, 400, 'invalid_gpu_entry', 'each gpu needs vendor and model strings');
    }
  }
  const detectedBy = typeof body.detected_by === 'string' ? body.detected_by : 'manual_web';
  const ramGb = Number(body.ram_gb);
  const os = typeof body.os === 'string' ? body.os.toLowerCase() : 'linux';

  const primary = gpus[0];
  const totalVram = gpus.reduce((acc, g) => acc + (Number(g.vram_gb) || 0) * (Number(g.count) || 1), 0);
  const totalCount = gpus.reduce((acc, g) => acc + (Number(g.count) || 1), 0);

  db.run(
    `UPDATE providers
     SET gpu_model = ?, vram_gb = ?, gpu_count = ?, os = ?,
         gpu_profile_source = ?, gpu_profile_updated_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    `${primary.vendor} ${primary.model}`.trim(),
    totalVram || null,
    totalCount,
    os,
    detectedBy,
    req.provider.id,
  );

  const rate = sumGpuRate(gpus);
  const profileId = `gpu_prof_${crypto.randomBytes(6).toString('hex')}`;

  return res.status(201).json({
    profile_id: profileId,
    estimated_hourly_rate: rate.hourly,
    estimated_monthly_rate: Math.round(rate.hourly * 24 * 30 * 100) / 100,
    bandwidth_gbps: rate.bandwidth,
    supported_models: suggestModelsForVram(totalVram),
    unknown_gpu: !rate.known,
  });
});

function suggestModelsForVram(vramGb) {
  if (!vramGb) return [];
  const tiers = [
    { min: 10,  models: ['gemma-2b', 'phi-3-mini'] },
    { min: 16,  models: ['mistral-7b', 'qwen2.5-7b', 'llama3.1-8b'] },
    { min: 24,  models: ['qwen2.5-14b', 'qwen3-14b', 'mistral-7b', 'llama3.1-8b'] },
    { min: 48,  models: ['qwen3-30b-a3b', 'nemotron-30b-a3b'] },
    { min: 80,  models: ['llama-3.3-70b', 'qwen-72b'] },
    { min: 141, models: ['llama-3.3-70b', 'mixtral-8x22b', 'qwen3.5-35b-a3b'] },
  ];
  let matched = [];
  for (const t of tiers) if (vramGb >= t.min) matched = t.models;
  return matched;
}

// ── POST /v1/provider/config ──────────────────────────────────────

router.post('/provider/config', requireProvider, (req, res) => {
  const body = req.body || {};
  const schedule = ['always_on', 'smart_hours', 'custom'].includes(body.schedule)
    ? body.schedule : 'always_on';
  const gpuLoad = Math.max(10, Math.min(100, Number(body.gpu_load_max_pct) || 100));
  const vramMax = Math.max(10, Math.min(100, Number(body.vram_max_pct) || 100));
  const powerLimit = ['default', '250w', '200w', 'eco'].includes(
    String(body.power_limit || '').toLowerCase()
  ) ? String(body.power_limit).toLowerCase() : 'default';
  const timezone = typeof body.timezone === 'string'
    ? body.timezone.slice(0, 64) : null;

  db.run(
    `INSERT INTO wizard_configs (provider_id, schedule, gpu_load_max_pct, vram_max_pct, power_limit, timezone)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       schedule=excluded.schedule,
       gpu_load_max_pct=excluded.gpu_load_max_pct,
       vram_max_pct=excluded.vram_max_pct,
       power_limit=excluded.power_limit,
       timezone=excluded.timezone,
       updated_at=datetime('now')`,
    req.provider.id, schedule, gpuLoad, vramMax, powerLimit, timezone,
  );

  const row = db.get('SELECT id FROM wizard_configs WHERE provider_id = ?', req.provider.id);
  return res.status(201).json({ config_id: `cfg_${row?.id || '0'}` });
});

// ── POST /v1/provider/install-token ───────────────────────────────
// Generates a single-use token the wizard embeds in the install command.
// The daemon presents it to /provider/register-node on first run.
//
// On first mint for a given provider, also captures PDPL compliance
// fields (fullName, phone, city, country, pdplConsent) and records the
// consent timestamp. Subsequent mints may omit those fields — but only
// if the provider has already consented. pdpl_consented_at is immutable
// once set (audit integrity).

const PHONE_RE = /^[+]?[0-9][0-9\s\-().]{6,19}$/;
const ISO_COUNTRY_RE = /^[A-Z]{2}$/;
const COMPLIANCE_KEYS = ['fullName', 'phone', 'city', 'country', 'pdplConsent'];

function validateCompliance(body) {
  if (body.pdplConsent !== true) {
    return { error: 'consent_required' };
  }
  const missing = [];
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 120) missing.push('fullName');
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) missing.push('phone');
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  if (city.length < 2 || city.length > 80) missing.push('city');
  const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : '';
  if (!ISO_COUNTRY_RE.test(country)) missing.push('country');
  if (missing.length) return { error: 'missing_fields', fields: missing };
  if (!PHONE_RE.test(phone)) return { error: 'invalid_phone' };
  return { ok: true, clean: { fullName, phone, city, country } };
}

router.post('/provider/install-token', requireProvider, (req, res) => {
  const body = req.body || {};
  const hasAnyComplianceField = COMPLIANCE_KEYS.some((k) => k in body);

  if (hasAnyComplianceField) {
    const v = validateCompliance(body);
    if (v.error === 'consent_required') {
      return wizardError(res, 400, 'consent_required', 'PDPL consent required');
    }
    if (v.error === 'missing_fields') {
      return res.status(400).json({
        error: { code: 'missing_fields', message: 'Required compliance fields missing', fields: v.fields },
      });
    }
    if (v.error === 'invalid_phone') {
      return wizardError(res, 400, 'invalid_phone', 'Phone number format not recognised');
    }
    // Upsert identity fields always; set consent timestamp only if currently NULL.
    db.run(
      `UPDATE providers
         SET full_name = ?, phone = ?, city = ?, country = ?,
             pdpl_consented_at = COALESCE(pdpl_consented_at, datetime('now'))
       WHERE id = ?`,
      v.clean.fullName, v.clean.phone, v.clean.city, v.clean.country, req.provider.id,
    );
  } else if (!req.provider.pdpl_consented_at) {
    return wizardError(res, 400, 'pdpl_consent_required',
      'PDPL consent required before minting install token');
  }

  const token = `dcpt_${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.run(
    `INSERT INTO wizard_install_tokens (token, provider_id, expires_at)
     VALUES (?, ?, ?)`,
    token, req.provider.id, expiresAt,
  );
  return res.status(201).json({ install_token: token, expires_at: expiresAt });
});

// ── POST /v1/provider/register-node ───────────────────────────────
// Daemon first-run handshake. Authenticates via install_token in body
// (NOT Bearer), because the daemon doesn't have an api_key yet.

router.post('/provider/register-node', (req, res) => {
  const body = req.body || {};
  const token = typeof body.install_token === 'string' ? body.install_token.trim() : null;
  if (!token) {
    return wizardError(res, 400, 'missing_token', 'install_token is required');
  }
  const tokenRow = db.get(
    `SELECT * FROM wizard_install_tokens WHERE token = ?`, token,
  );
  if (!tokenRow) {
    return wizardError(res, 404, 'invalid_token', 'install_token not recognised');
  }

  const provider = db.get('SELECT * FROM providers WHERE id = ?', tokenRow.provider_id);
  if (!provider) {
    return wizardError(res, 500, 'provider_missing', 'token references unknown provider');
  }

  const fingerprint = deriveNodeFingerprint(body);

  // ── Idempotent replay of an already-consumed token ───────────────
  // The install_token is single-use, but the daemon may retry register-node
  // (network blip, installer re-run, crash before it persisted the key). A
  // flat 409 would strand a real daemon with no credential. So when the SAME
  // machine (same fingerprint) replays the SAME token for a provider that
  // already minted a key, re-resolve to the EXISTING key + 200 instead of 409.
  if (tokenRow.consumed_at) {
    const sameMachine = fingerprint && provider.node_fingerprint
      ? provider.node_fingerprint === fingerprint
      : true; // no fingerprint on either side → trust the token-bound provider
    if (provider.api_key && sameMachine) {
      return res.status(200).json({
        node_id: `node_${provider.id}`,
        api_key: provider.api_key,
        status: provider.status || 'active',
        websocket_url: `wss://api.dcp.sa/v1/ws/node_${provider.id}`,
        idempotent: true,
      });
    }
    // Token consumed by a DIFFERENT machine (or provider never got a key):
    // genuine reuse — keep rejecting so a stolen/leaked token can't onboard.
    return wizardError(res, 409, 'token_consumed', 'install_token already used');
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return wizardError(res, 410, 'token_expired', 'install_token expired');
  }

  // ── Fresh registration ───────────────────────────────────────────
  const hostname = typeof body.hostname === 'string' ? body.hostname.slice(0, 200) : null;
  const os = typeof body.os === 'string' ? body.os.toLowerCase().slice(0, 32) : provider.os;
  const detected = Array.isArray(body.gpu_detected) && body.gpu_detected.length ? body.gpu_detected[0] : null;
  const vramMb = Number(detected?.vram_mb) || null;
  const gpuModelDetected = detected
    ? `${detected.vendor || ''} ${detected.model || ''}`.trim()
    : null;

  // Idempotency on a FRESH token too: if this provider already registered the
  // same machine and holds a key, hand back the existing key rather than
  // rotating it out from under a running daemon. (Still consume the token so
  // it can't be replayed by another machine.)
  if (provider.api_key && fingerprint && provider.node_fingerprint === fingerprint) {
    db.run(
      `UPDATE wizard_install_tokens SET consumed_at = datetime('now') WHERE token = ?`,
      token,
    );
    return res.status(200).json({
      node_id: `node_${provider.id}`,
      api_key: provider.api_key,
      status: provider.status || 'active',
      websocket_url: `wss://api.dcp.sa/v1/ws/node_${provider.id}`,
      idempotent: true,
    });
  }

  // Mark token consumed.
  db.run(
    `UPDATE wizard_install_tokens SET consumed_at = datetime('now') WHERE token = ?`,
    token,
  );

  // ── Key-rotation deadlock fix (wizard go-live) ───────────────────────
  // The wizard authenticates the provider with a BOOTSTRAP api_key minted at
  // magic-link verify, and polls /node-status with it. On a first install the
  // provider's node_fingerprint is null, so neither idempotent branch above
  // fires. Previously this branch ALWAYS minted a fresh dcpk_ key and OVERWROTE
  // providers.api_key — which invalidated the bootstrap key the wizard is still
  // holding, so its /node-status polls 401'd forever and "You're Live" never
  // showed even though the daemon was heartbeating fine.
  //
  // Fix: do NOT rotate the provider's existing api_key on a valid single-use
  // install-token handshake. If the provider already holds a key (always true
  // for the wizard path — the bootstrap key), bind the node_fingerprint to this
  // machine and RETURN THAT EXISTING KEY to the daemon, so daemon and wizard
  // share one credential and the bootstrap key stays valid. Only mint a fresh
  // key when the provider somehow has none (defensive; non-wizard callers).
  //
  // Single-use + anti-leak semantics are preserved: the token is already marked
  // consumed above, and a DIFFERENT fingerprint replaying a consumed token still
  // hits the 409 branch (line ~641) — that path is untouched.
  const reuseExistingKey = Boolean(provider.api_key);
  const apiKey = reuseExistingKey
    ? provider.api_key
    : `dcpk_${crypto.randomBytes(24).toString('hex')}`;

  // Auto-approve wizard-origin registrations (FIX #7, option a). The daemon
  // reached this handshake by presenting a single-use install_token that was
  // itself minted only after a Bearer-authenticated provider passed PDPL
  // consent — an identity-verified, trusted path. Manual approval here would
  // strand a real daemon at status='active' but approval_status='pending',
  // so it heartbeats but is never bookable. Gated by DCP_WIZARD_AUTO_APPROVE
  // (default ON) so ops can revert to manual approval.
  const autoApprove = wizardAutoApproveEnabled();

  db.run(
    `UPDATE providers
     SET status = CASE WHEN status IN ('pending','registered') THEN 'active' ELSE status END,
         approval_status = CASE WHEN ? = 1 AND COALESCE(approval_status, 'pending') != 'approved'
                                THEN 'approved' ELSE approval_status END,
         approved_at = CASE WHEN ? = 1 AND approved_at IS NULL
                            THEN datetime('now') ELSE approved_at END,
         api_key = ?,
         node_fingerprint = COALESCE(?, node_fingerprint),
         os = COALESCE(?, os),
         gpu_model = COALESCE(?, gpu_model),
         vram_mb = COALESCE(?, vram_mb),
         notes = COALESCE(notes, '') || ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    autoApprove ? 1 : 0,
    autoApprove ? 1 : 0,
    apiKey, fingerprint, os, gpuModelDetected, vramMb,
    hostname ? `\n[wizard] registered hostname=${hostname} daemon=${body.daemon_version || '?'}` : '',
    provider.id,
  );

  return res.status(201).json({
    node_id: `node_${provider.id}`,
    api_key: apiKey,
    status: 'active',
    approval_status: autoApprove ? 'approved' : (provider.approval_status || 'pending'),
    websocket_url: `wss://api.dcp.sa/v1/ws/node_${provider.id}`,
    // True when we returned the provider's pre-existing (bootstrap) key instead
    // of minting a new one — see key-rotation deadlock fix above.
    reused_key: reuseExistingKey,
  });
});

// ── GET /v1/provider/node-status ──────────────────────────────────
// Polled by wizard Step 6. Reports whether the node is actually LIVE —
// i.e. earning-eligible — not merely registered.
//
// "You're Live" requires ALL of (EARNED state, not claimed state):
//   1. approval_status === 'approved'  (admin/auto-approved)
//   2. last_heartbeat within 90s       (daemon is actually phoning home)
//   3. NOT is_paused                   (provider hasn't paused the node)
//
// When any check fails we return an explicit machine `state` plus
// plain-language copy + next step, so the wizard never shows a false
// "You're Live". Machine states: live | pending_approval |
// no_recent_heartbeat | paused.

// Parse a last_heartbeat value as UTC epoch ms. Production writes ISO-8601
// with a 'Z' (new Date().toISOString()), which Date parses as UTC. Some paths
// (and tests) write SQLite's datetime('now') format "YYYY-MM-DD HH:MM:SS"
// without a zone — Date would treat that as LOCAL time, making a fresh
// heartbeat look minutes/hours stale and falsely report no_recent_heartbeat.
// Normalise the space-separated zoneless form to UTC before parsing.
function parseHeartbeatMs(value) {
  if (!value) return null;
  let v = String(value);
  if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(v) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v)) {
    v = v.replace(' ', 'T') + 'Z';
  }
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function computeWizardLiveState(p, now) {
  const approved = (String(p.approval_status || 'pending').toLowerCase()) === 'approved';
  const paused = Number(p.is_paused) === 1;
  const lastHbMs = parseHeartbeatMs(p.last_heartbeat);
  const heartbeatAgeMs = lastHbMs != null ? now - lastHbMs : null;
  const heartbeatFresh = heartbeatAgeMs != null && heartbeatAgeMs <= WIZARD_LIVE_HEARTBEAT_WINDOW_MS;

  // Precedence: approval first (nothing serves unapproved), then heartbeat
  // (can't be live if it isn't phoning home), then pause (provider choice).
  if (!approved) {
    return {
      live: false,
      state: 'pending_approval',
      message: 'Your node is registered and waiting for approval before it can take jobs.',
      next_step: 'Approval is usually automatic. If this persists, contact support.',
    };
  }
  if (!heartbeatFresh) {
    return {
      live: false,
      state: 'no_recent_heartbeat',
      message: lastHbMs
        ? 'Your node was approved but we have not heard from the daemon recently.'
        : 'Your node is approved but the daemon has not connected yet.',
      next_step: 'Make sure the DCP daemon is running on your machine, then keep this page open.',
    };
  }
  if (paused) {
    return {
      live: false,
      state: 'paused',
      message: 'Your node is paused, so it is not accepting jobs right now.',
      next_step: 'Resume the node from your dashboard to start earning again.',
    };
  }
  return {
    live: true,
    state: 'live',
    message: 'You’re live! Your node is approved, connected, and accepting jobs.',
    next_step: null,
  };
}

router.get('/provider/node-status', requireProvider, (req, res) => {
  const p = req.provider;
  const now = Date.now();
  const live = computeWizardLiveState(p, now);

  const lastHbMs = parseHeartbeatMs(p.last_heartbeat);
  const heartbeatAgeSeconds = lastHbMs != null ? Math.max(0, Math.floor((now - lastHbMs) / 1000)) : null;

  // `connected` retained for backward compatibility: it means "the daemon has
  // registered and we've seen a recent heartbeat" — NOT "live/earning". Use
  // `live` for the "You're Live" claim.
  const connected = heartbeatAgeSeconds != null && heartbeatAgeSeconds * 1000 <= WIZARD_LIVE_HEARTBEAT_WINDOW_MS;

  return res.json({
    live: live.live,
    state: live.state,
    state_message: live.message,
    next_step: live.next_step,
    connected,
    node_id: p.status === 'active' ? `node_${p.id}` : null,
    status: p.status || 'pending',
    approval_status: p.approval_status || 'pending',
    is_paused: Number(p.is_paused) === 1,
    heartbeat_age_seconds: heartbeatAgeSeconds,
    gpu_model: p.gpu_model,
    vram_gb: p.vram_gb,
    os: p.os,
    last_heartbeat: p.last_heartbeat || null,
    last_seen: p.last_heartbeat || p.updated_at,
  });
});

// ── GET /v1/provider/earnings ─────────────────────────────────────

router.get('/provider/earnings', requireProvider, (req, res) => {
  const p = req.provider;

  // Halala → SAR conversion (100 halala = 1 SAR)
  const totalSar = (Number(p.total_earnings_halala) || 0) / 100;
  const claimableSar = (Number(p.claimable_earnings_halala) || 0) / 100;

  // Rolling windows (best-effort from jobs table).
  const now = Date.now();
  const windows = {
    today: new Date(now - 24 * 3600 * 1000).toISOString(),
    week:  new Date(now - 7 * 24 * 3600 * 1000).toISOString(),
    month: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
  };

  function sumWindow(sinceIso) {
    try {
      const row = db.get(
        `SELECT COALESCE(SUM(cost_halala), 0) AS total
         FROM jobs
         WHERE provider_id = ? AND created_at >= ? AND status = 'completed'`,
        p.id, sinceIso,
      );
      return (Number(row?.total) || 0) / 100;
    } catch (_) {
      return 0;
    }
  }

  return res.json({
    today_sar:     Math.round(sumWindow(windows.today) * 100) / 100,
    week_sar:      Math.round(sumWindow(windows.week)  * 100) / 100,
    month_sar:     Math.round(sumWindow(windows.month) * 100) / 100,
    total_sar:     Math.round(totalSar * 100) / 100,
    claimable_sar: Math.round(claimableSar * 100) / 100,
    total_jobs:    Number(p.total_jobs) || 0,
    sar_usd_rate:  SAR_USD_RATE,
  });
});

module.exports = router;
