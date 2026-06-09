// ─────────────────────────────────────────────────────────────────────────
// /api/auth/* — Native magic-link authentication.
//
// State-of-the-art passwordless flow (GitHub/Anthropic style):
//   1. User enters email on /login → POST /api/{providers,renters}/send-otp
//      (legacy endpoint name, kept for backward compat) sends a single
//      magic-link email — NO 6-digit code is shown.
//   2. User clicks the link → /auth/verify?token=... in the browser.
//   3. The /auth/verify page POSTs the token here:
//        POST /api/auth/magic-link  { token }
//      We verify the token, look up the matching provider OR renter in
//      SQLite, and return { success, role, api_key, ... }.
//   4. The page stores the api_key + session and redirects to dashboard.
//
// The old Supabase-based /magic-link-exchange endpoint has been replaced;
// auth is now fully self-hosted on SQLite + Resend.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyMagicToken } = require('../services/auth-otp');
const { sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();

// Renter starter balance, granted exactly once when the renter clicks
// their magic-link verification email (DCP onboarding bundle 2026-05-09).
const RENTER_STARTER_BALANCE_HALALA = 10000;

/**
 * Idempotently finalize a pending renter row on first magic-link click.
 *
 * - If status='pending' and api_key starts with 'pending-renter-': mint a real
 *   `dcp-renter-…` key, flip status='active', and credit the starter balance.
 *   Fire-and-forget the welcome email.
 * - If status='active' already: no-op (subsequent clicks return the same key
 *   without double-crediting). Returns the row as-is.
 *
 * Returns the *fresh* renter row (post-update on the first call), or null if
 * the email doesn't have a renter row at all.
 */
function finalizePendingRenter(email) {
  const row = db.get(
    'SELECT * FROM renters WHERE LOWER(email) = LOWER(?)',
    email
  );
  if (!row) return null;
  if (row.status !== 'pending') return row;

  const realKey = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  // Single UPDATE so two concurrent magic-link clicks can't double-mint.
  // The WHERE clause re-checks status='pending' as an optimistic lock; if
  // a racing request already finalized the row, this UPDATE matches 0 rows
  // and we just re-read the now-active row below.
  db.prepare(
    `UPDATE renters
        SET api_key = ?,
            status = 'active',
            balance_halala = balance_halala + ?,
            updated_at = ?
      WHERE id = ? AND status = 'pending'`
  ).run(realKey, RENTER_STARTER_BALANCE_HALALA, now, row.id);

  const finalized = db.get('SELECT * FROM renters WHERE id = ?', row.id);

  // Only send welcome email if *we* finalized (not if the racing request did).
  if (finalized && finalized.api_key === realKey) {
    sendWelcomeEmail(finalized.email, finalized.name, realKey, 'renter')
      .catch((e) => console.error('[auth.magic-link] renter welcome email failed:', e.message));
  }
  return finalized;
}

/**
 * Create-or-return an *active* renter row for a magic-link-verified email
 * that has no renter row yet.
 *
 * The v2 /v2/auth signup tab (and any direct renters/send-otp caller) issues a
 * renter magic link BEFORE a renter row exists — renters/send-otp does NOT
 * pre-stage a row. Without this, finalizePendingRenter() returns null and the
 * handler dead-ends on a 404 "No account found. Please register first."
 *
 * Mirrors finalizePendingProvider: idempotent and safe under concurrent clicks.
 *
 * - No row for this email -> INSERT an active renter, mint a real
 *   `dcp-renter-…` key, credit the starter balance, fire the welcome email,
 *   and return the fresh row.
 * - Row already exists (active OR pending) -> return it unchanged. A pending
 *   row should be finalized via finalizePendingRenter(), not here, so we never
 *   double-mint a key or double-credit the starter balance.
 */
function createActiveRenterFromMagicLink(email) {
  const cleanEmail = email.toLowerCase().trim();
  const existing = db.get('SELECT * FROM renters WHERE LOWER(email) = LOWER(?)', cleanEmail);
  if (existing) return existing;

  const name = cleanEmail.split('@')[0] || 'Renter';
  const apiKey = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO renters
         (name, email, api_key, status, balance_halala, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`
    ).run(name, cleanEmail, apiKey, RENTER_STARTER_BALANCE_HALALA, now, now);
  } catch (err) {
    // UNIQUE(email) race: a concurrent magic-link click already created it.
    console.warn('[auth.magic-link] renter create race/err, re-reading:', err.message);
    return db.get('SELECT * FROM renters WHERE LOWER(email) = LOWER(?)', cleanEmail);
  }

  const created = db.get('SELECT * FROM renters WHERE LOWER(email) = LOWER(?)', cleanEmail);
  // Only we send the welcome email (the row we just minted), never a racer's.
  if (created && created.api_key === apiKey) {
    sendWelcomeEmail(created.email, created.name, apiKey, 'renter')
      .catch((e) => console.error('[auth.magic-link] renter welcome email failed:', e.message));
  }
  return created;
}

/**
 * Create-or-return a provider row for a magic-link-verified email.
 *
 * The v2 provider wizard (/v2/provider-setup) sends a magic link at step 1 —
 * BEFORE any provider account exists. The real GPU profile is reported by the
 * daemon after install, so an email-only provider row is valid at this point.
 * Without this, a first-time provider dead-ends on a 404 "No account found".
 * Mirrors finalizePendingRenter: idempotent and safe under concurrent clicks.
 *
 * - No row for this email → INSERT a registered/pending provider, mint a
 *   `dcp-provider-…` key, fire the welcome email, return the fresh row.
 * - Row already exists → return it unchanged (no second key, no second email).
 */
function finalizePendingProvider(email) {
  const cleanEmail = email.toLowerCase().trim();
  const existing = db.get('SELECT * FROM providers WHERE LOWER(email) = LOWER(?)', cleanEmail);
  if (existing) return existing;

  const name = cleanEmail.split('@')[0] || 'Provider';
  const apiKey = 'dcp-provider-' + crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO providers
         (name, email, api_key, status, approval_status, gpu_profile_source,
          supported_compute_types, created_at)
       VALUES (?, ?, ?, 'registered', 'pending', 'pending_detection', '["inference"]', ?)`
    ).run(name, cleanEmail, apiKey, now);
  } catch (err) {
    // UNIQUE(email) race: a concurrent magic-link click already created it.
    console.warn('[auth.magic-link] provider create race/err, re-reading:', err.message);
    return db.get('SELECT * FROM providers WHERE LOWER(email) = LOWER(?)', cleanEmail);
  }

  const created = db.get('SELECT * FROM providers WHERE LOWER(email) = LOWER(?)', cleanEmail);
  // Only we send the welcome email (the row we just minted), never a racer's.
  if (created && created.api_key === apiKey) {
    sendWelcomeEmail(created.email, created.name, apiKey, 'provider')
      .catch((e) => console.error('[auth.magic-link] provider welcome email failed:', e.message));
  }
  return created;
}

/**
 * POST /api/auth/magic-link
 * Body: { token: string }   (the magic_token from the email URL)
 * Returns: { success, role, api_key, provider|renter }
 *
 * Resolves the token to a single-use email, then looks up the matching
 * provider OR renter row and returns their API key. If both exist (after
 * the dual-role guard was softened), provider takes precedence on the
 * `/provider`-bound login page; renter precedence is configurable via the
 * `prefer` body field.
 */
function handleMagicLink(req, res) {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    // Client-supplied preference (from a sessionStorage breadcrumb on the
    // device that started the flow). May be missing on cross-device clicks
    // — that's why we also persist `requested_role` on the otp_codes row at
    // sendOtp time. Server-side `requested_role` is the strong signal;
    // `clientPrefer` only matters when the row was created without a role.
    const clientPrefer = req.body?.prefer === 'renter' || req.body?.prefer === 'provider'
      ? req.body.prefer : null;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const verification = verifyMagicToken(token);
    if (!verification.success) {
      return res.status(401).json({ error: verification.error || 'Invalid or expired link.' });
    }

    const email = verification.user.email.toLowerCase().trim();
    // Server-side requested_role wins over client-supplied prefer. Falls back
    // to client preference, then to 'provider' as the historical default.
    const prefer = verification.requested_role || clientPrefer || 'provider';
    console.log(`[AUTH] Magic-link verified for ${email} ` +
                `(requested_role=${verification.requested_role}, clientPrefer=${clientPrefer}, prefer=${prefer})`);

    let providerRow = db.get(
      'SELECT * FROM providers WHERE LOWER(email) = LOWER(?)',
      email
    );
    // Finalize a pending renter (registered via the new email-verification
    // flow) on the first click. Idempotent: subsequent clicks just return
    // the active row without double-crediting the starter balance.
    const finalizedRenter = finalizePendingRenter(email);
    const renterRow = finalizedRenter && finalizedRenter.status === 'active' ? finalizedRenter : null;

    // Apply preference when both exist; otherwise return whichever is found.
    const preferProvider = prefer === 'provider';

    // First-time provider onboarding: the v2 wizard issues a provider magic
    // link before any provider row exists. If the verified email has neither a
    // provider nor a renter and the link was for the provider flow, create the
    // provider now (daemon fills the GPU profile post-install) instead of
    // dead-ending on "No account found. Please register first."
    if (!providerRow && !renterRow && preferProvider) {
      providerRow = finalizePendingProvider(email);
    }

    // First-time renter onboarding: the v2 /v2/auth signup tab issues a renter
    // magic link via renters/send-otp, which does NOT pre-stage a renter row.
    // If the verified email has neither a provider nor a renter and the link
    // was for the renter flow, create the renter now (active, starter balance,
    // real `dcp-renter-…` key) instead of dead-ending on "No account found."
    let createdRenterRow = null;
    if (!providerRow && !renterRow && !preferProvider) {
      createdRenterRow = createActiveRenterFromMagicLink(email);
    }
    const effectiveRenterRow = renterRow || createdRenterRow;

    const chosen = preferProvider
      ? (providerRow || effectiveRenterRow)
      : (effectiveRenterRow || providerRow);

    if (!chosen) {
      return res.status(404).json({
        error: 'No account found for this email. Please register first.',
      });
    }

    if (chosen === providerRow) {
      return res.json({
        success: true,
        role: 'provider',
        api_key: providerRow.api_key,
        provider: {
          id: providerRow.id,
          name: providerRow.name,
          email: providerRow.email,
          gpu_model: providerRow.gpu_model,
          status: providerRow.status,
        },
        // Surface dual-role status so the UI can offer a role switch link.
        dual_role: Boolean(providerRow && renterRow),
      });
    }

    return res.json({
      success: true,
      role: 'renter',
      api_key: effectiveRenterRow.api_key,
      renter: {
        id: effectiveRenterRow.id,
        name: effectiveRenterRow.name,
        email: effectiveRenterRow.email,
        organization: effectiveRenterRow.organization,
        balance_halala: effectiveRenterRow.balance_halala,
        total_spent_halala: effectiveRenterRow.total_spent_halala,
        total_jobs: effectiveRenterRow.total_jobs,
      },
      dual_role: Boolean(providerRow && renterRow),
    });
  } catch (err) {
    console.error('[AUTH] Magic-link exchange error:', err);
    res.status(500).json({ error: 'Authentication exchange failed' });
  }
}

router.post('/magic-link', handleMagicLink);

// Deprecated alias — the legacy /auth/callback page in the frontend posts to
// /magic-link-exchange with `access_token`. Accept either field name and
// route to the same handler so in-flight clients keep working.
router.post('/magic-link-exchange', (req, res) => {
  req.body = {
    token: req.body?.token || req.body?.access_token,
    prefer: req.body?.prefer,
  };
  return handleMagicLink(req, res);
});

module.exports = router;
