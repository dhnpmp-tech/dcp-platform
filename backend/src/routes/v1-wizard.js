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
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');
const { sendOtp } = require('../services/auth-otp');
const { reconcileRenterByEmailFromSupabase } = require('../services/renter-identity-reconciliation');
const { findActiveAccountByEmail, buildConflictResponse } = require('../services/cross-role-uniqueness');
const { GPU_RATE_TABLE, SAR_USD_RATE } = require('../config/pricing');
const { looksLikeRenterKey } = require('../middleware/auth');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

    // Cross-role guard: a single email may only hold one role on DCP.
    // See backend/migrations/006_fadi_cross_role_cleanup.sql for the
    // historical incident that motivated this check.
    const conflict = findActiveAccountByEmail(db, email);
    if (conflict && conflict.role !== role) {
      const err = buildConflictResponse(conflict.role, role);
      return wizardError(res, 409, err.code, err.message);
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

    const sent = await sendOtp(email);
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

    const sent = await sendOtp(email);
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
// Exchanges a Supabase access_token (received by the browser after the
// magic-link click) for a DCP api_key. Delegates to the same lookup
// logic as /api/auth/magic-link-exchange.

router.post('/auth/session', async (req, res) => {
  try {
    const accessToken = typeof req.body?.access_token === 'string'
      ? req.body.access_token.trim()
      : null;
    if (!accessToken) {
      return wizardError(res, 400, 'missing_access_token', 'access_token is required');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return wizardError(res, 503, 'auth_unconfigured', 'Supabase auth is not configured on this server');
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabaseClient.auth.getUser(accessToken);
    if (error || !data?.user?.email) {
      return wizardError(res, 401, 'invalid_session', 'Invalid or expired sign-in link');
    }

    const email = data.user.email.toLowerCase().trim();

    let renter = db.get(
      'SELECT * FROM renters WHERE LOWER(email) = LOWER(?) AND status = ?',
      email, 'active',
    );
    if (!renter) {
      try {
        const reconcile = await reconcileRenterByEmailFromSupabase({ db, email });
        if (reconcile.reconciled && reconcile.renter?.status === 'active') {
          renter = reconcile.renter;
        }
      } catch (reconcileErr) {
        console.warn('[V1-WIZARD] renter reconciliation failed:', reconcileErr.message);
      }
    }

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
  if (tokenRow.consumed_at) {
    return wizardError(res, 409, 'token_consumed', 'install_token already used');
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return wizardError(res, 410, 'token_expired', 'install_token expired');
  }

  const provider = db.get('SELECT * FROM providers WHERE id = ?', tokenRow.provider_id);
  if (!provider) {
    return wizardError(res, 500, 'provider_missing', 'token references unknown provider');
  }

  // Mark token consumed.
  db.run(
    `UPDATE wizard_install_tokens SET consumed_at = datetime('now') WHERE token = ?`,
    token,
  );

  // Mint a fresh long-lived daemon api_key. The bootstrap key used to
  // authenticate install-token minting is rotated out on first-run handshake
  // so the daemon holds a distinct, persistent credential.
  const apiKey = `dcpk_${crypto.randomBytes(24).toString('hex')}`;

  const hostname = typeof body.hostname === 'string' ? body.hostname.slice(0, 200) : null;
  const os = typeof body.os === 'string' ? body.os.toLowerCase().slice(0, 32) : provider.os;
  const detected = Array.isArray(body.gpu_detected) && body.gpu_detected.length ? body.gpu_detected[0] : null;
  const vramMb = Number(detected?.vram_mb) || null;
  const gpuModelDetected = detected
    ? `${detected.vendor || ''} ${detected.model || ''}`.trim()
    : null;

  db.run(
    `UPDATE providers
     SET status = CASE WHEN status IN ('pending','registered') THEN 'active' ELSE status END,
         api_key = ?,
         os = COALESCE(?, os),
         gpu_model = COALESCE(?, gpu_model),
         vram_mb = COALESCE(?, vram_mb),
         notes = COALESCE(notes, '') || ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    apiKey, os, gpuModelDetected, vramMb,
    hostname ? `\n[wizard] registered hostname=${hostname} daemon=${body.daemon_version || '?'}` : '',
    provider.id,
  );

  return res.status(201).json({
    node_id: `node_${provider.id}`,
    api_key: apiKey,
    status: 'active',
    websocket_url: `wss://api.dcp.sa/v1/ws/node_${provider.id}`,
  });
});

// ── GET /v1/provider/node-status ──────────────────────────────────
// Polled by wizard Step 6. Reports whether the daemon has phoned home.

router.get('/provider/node-status', requireProvider, (req, res) => {
  const p = req.provider;
  const connected = p.status === 'active';
  return res.json({
    connected,
    node_id: connected ? `node_${p.id}` : null,
    status: p.status || 'pending',
    gpu_model: p.gpu_model,
    vram_gb: p.vram_gb,
    os: p.os,
    last_seen: p.updated_at,
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
