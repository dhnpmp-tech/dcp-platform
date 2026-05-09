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
const db = require('../db');
const { verifyMagicToken } = require('../services/auth-otp');

const router = express.Router();

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
    const prefer = req.body?.prefer === 'renter' ? 'renter' : 'provider';

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const verification = verifyMagicToken(token);
    if (!verification.success) {
      return res.status(401).json({ error: verification.error || 'Invalid or expired link.' });
    }

    const email = verification.user.email.toLowerCase().trim();
    console.log(`[AUTH] Magic-link verified for ${email} (prefer=${prefer})`);

    const providerRow = db.get(
      'SELECT * FROM providers WHERE LOWER(email) = LOWER(?)',
      email
    );
    const renterRow = db.get(
      "SELECT * FROM renters WHERE LOWER(email) = LOWER(?) AND status = 'active'",
      email
    );

    // Apply preference when both exist; otherwise return whichever is found.
    const preferProvider = prefer === 'provider';
    const chosen = preferProvider
      ? (providerRow || renterRow)
      : (renterRow || providerRow);

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
      api_key: renterRow.api_key,
      renter: {
        id: renterRow.id,
        name: renterRow.name,
        email: renterRow.email,
        organization: renterRow.organization,
        balance_halala: renterRow.balance_halala,
        total_spent_halala: renterRow.total_spent_halala,
        total_jobs: renterRow.total_jobs,
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
