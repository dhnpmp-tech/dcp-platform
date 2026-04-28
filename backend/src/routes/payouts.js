'use strict';

/**
 * Payout Routes — DCP-763 / DCP-862
 *
 * Off-chain payout request queue for provider earnings withdrawal.
 * DCP admin processes payouts manually via bank transfer.
 *
 * Routes (mounted at /api):
 *   POST  /providers/:id/payouts      — request payout (provider auth)
 *   GET   /providers/:id/payouts      — payout history (provider auth)
 *   GET   /providers/:id/earnings     — balance summary (provider auth)
 *   PATCH /admin/payouts/:id          — mark paid or reject (admin token, legacy)
 *
 *   GET   /admin/payouts/pending      — list pending payout requests (DCP-862)
 *   POST  /admin/payouts/:id/approve  — approve → processing + notify provider (DCP-862)
 *   POST  /admin/payouts/:id/reject   — reject + return funds + notify provider (DCP-862)
 *
 * Provider auth: x-provider-key header, ?key query param, or Bearer dcp_prov_* token.
 * Admin auth: DC1_ADMIN_TOKEN via X-Admin-Token header or Bearer token.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth, getBearerToken } = require('../middleware/auth');
const { requireAdminRbac, logAdminAction } = require('../middleware/adminAuth');
const { verifyProviderKey } = require('../services/apiKeyService');
const { withFinancialIdempotency } = require('../lib/financial-idempotency');
const {
  requestPayout,
  getPayoutHistory,
  getEarningsSummary,
  markPayoutPaid,
  rejectPayout,
} = require('../services/payoutService');
const { buildProviderSettlementPreview } = require('../services/payoutBatchService');
const { sendWithdrawalApprovedEmail, sendWithdrawalRejectedEmail } = require('../services/emailService');
const { sendAlert } = require('../services/notifications');

function skipAutomaticAdminAudit(req, _res, next) {
  // Approve/reject/patch payout routes emit one explicit payout_* audit row via
  // logAdminAction after mutation result is known. Skip middleware audit so one
  // request cannot write duplicate admin security-audit rows.
  req.skipAdminAuditLog = true;
  next();
}

function logPayoutMutationAuditOnce(req, rawDb, action, payoutId, details) {
  // Hard guard for one-request/one-audit semantics on payout admin mutations.
  // If a handler path is refactored and calls this twice, only the first insert is kept.
  if (req._payoutMutationAuditLogged === true) return;
  req._payoutMutationAuditLogged = true;
  logAdminAction(
    rawDb,
    req.adminUser?.id || 'unknown',
    action,
    'payout',
    String(payoutId),
    details
  );
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Resolve the authenticated provider from the request.
 *
 * Accepts (in priority order):
 *   1. Bearer dcp_prov_* token  (new hashed API keys — DCP-760)
 *   2. X-Provider-Key header    (legacy plain api_key)
 *   3. ?key query parameter     (legacy plain api_key)
 */
function resolveProvider(req) {
  const bearer = getBearerToken(req);
  if (bearer && bearer.startsWith('dcp_prov_')) {
    const providerId = verifyProviderKey(bearer);
    if (!providerId) return null;
    return db.get('SELECT * FROM providers WHERE id = ? AND deleted_at IS NULL', [providerId]);
  }

  const legacyKey = req.headers['x-provider-key'] || req.query.key;
  if (!legacyKey) return null;
  return db.get('SELECT * FROM providers WHERE api_key = ? AND deleted_at IS NULL', [legacyKey]);
}

// Resolve+attach provider, gating downstream middleware/handlers behind auth.
// Required so the financial-idempotency cache cannot replay a 2xx response
// to an unauthenticated caller who guesses the (provider_id, key) tuple.
function requireProviderAuth(req, res, next) {
  const provider = resolveProvider(req);
  if (!provider) return res.status(401).json({ error: 'Provider authentication required' });
  if (String(provider.id) !== String(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden: cannot request payout for another provider' });
  }
  req.provider = provider;
  next();
}

// ── POST /api/providers/:id/payouts ──────────────────────────────────────────
router.post('/providers/:id/payouts', requireProviderAuth, withFinancialIdempotency({
  subjectType: 'provider',
  subjectId: (req) => req.provider.id,
}), (req, res) => {
  try {
    const provider = req.provider;

    const amountUsd = parseFloat(req.body.amount_usd);
    if (!isFinite(amountUsd)) {
      return res.status(400).json({ error: 'amount_usd is required and must be a positive number' });
    }

    const result = requestPayout(db._db || db, provider.id, amountUsd);

    if (result.error) {
      const statusMap = {
        INVALID_AMOUNT:       400,
        BELOW_MINIMUM:        400,
        PROVIDER_NOT_FOUND:   404,
        INSUFFICIENT_BALANCE: 402,
      };
      return res.status(statusMap[result.error] || 400).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('[payouts] POST /providers/:id/payouts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/providers/:id/payouts ───────────────────────────────────────────
router.get('/providers/:id/payouts', (req, res) => {
  try {
    const provider = resolveProvider(req);
    if (!provider) {
      return res.status(401).json({ error: 'Provider authentication required' });
    }
    if (String(provider.id) !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { limit, offset } = req.query;
    const result = getPayoutHistory(db._db || db, provider.id, { limit, offset });
    return res.json(result);
  } catch (err) {
    console.error('[payouts] GET /providers/:id/payouts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/providers/:id/earnings ──────────────────────────────────────────
router.get('/providers/:id/earnings', (req, res) => {
  try {
    const provider = resolveProvider(req);
    if (!provider) {
      return res.status(401).json({ error: 'Provider authentication required' });
    }
    if (String(provider.id) !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const summary = getEarningsSummary(db._db || db, provider.id);
    if (!summary) return res.status(404).json({ error: 'Provider not found' });
    return res.json(summary);
  } catch (err) {
    console.error('[payouts] GET /providers/:id/earnings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/payouts/pending ───────────────────────────────────────────
//
// List all payout requests with status 'pending', newest first.
// Returns: { payouts: [...], total: N }
// Fields per payout: payout_id, provider_id, provider_name, provider_email,
//   amount_sar, amount_usd, amount_eth_est, requested_at, status
//
// DCP-862: requireAdminRbac = token auth + RBAC role check + audit log
router.get('/admin/payouts/pending', requireAdminRbac, (req, res) => {
  try {
    const raw_db = db._db || db;
    const ETH_USD = Number(process.env.ETH_USD_RATE) || 3200; // fallback spot rate
    const USD_TO_SAR = 3.75;
    const HALALA_PER_SAR = 100;

    const rows = raw_db.prepare(`
      SELECT
        pr.id            AS payout_id,
        pr.provider_id,
        pr.amount_halala,
        pr.status,
        pr.requested_at,
        p.name           AS provider_name,
        p.email          AS provider_email
      FROM payout_requests pr
      LEFT JOIN providers p ON p.id = pr.provider_id
      WHERE pr.status = 'pending'
      ORDER BY pr.requested_at DESC
    `).all();

    const total = rows.length;
    const payouts = rows.map((r) => {
      const amountSar = Number((r.amount_halala / HALALA_PER_SAR).toFixed(2));
      const amountUsd = Number((amountSar / USD_TO_SAR).toFixed(2));
      const amountEthEst = Number((amountUsd / ETH_USD).toFixed(6));
      return {
        payout_id:      r.payout_id,
        provider_id:    r.provider_id,
        provider_name:  r.provider_name || null,
        provider_email: r.provider_email || null,
        amount_sar:     amountSar,
        amount_usd:     amountUsd,
        amount_eth_est: amountEthEst,
        requested_at:   r.requested_at,
        status:         r.status,
      };
    });

    return res.json({ payouts, total });
  } catch (err) {
    console.error('[payouts] GET /admin/payouts/pending error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/payouts/settlement-preview ───────────────────────────────
//
// Read-only finance preview for a settlement window.
// Query: window_start, window_end (ISO; required), provider_id (optional)
//
// Returns:
// {
//   settlement_window,
//   providers: [{ provider_id, settled_jobs, gross_*, platform_fee_*, provider_net_*, reconciliation_ok }],
//   totals: { ...aggregate sums... },
//   reconciliation: { gross_equals_split, delta_halala }
// }
router.get('/admin/payouts/settlement-preview', requireAdminRbac, (req, res) => {
  try {
    const windowStart = req.query.window_start || req.query.windowStart;
    const windowEnd = req.query.window_end || req.query.windowEnd;
    if (!windowStart || !windowEnd) {
      return res.status(400).json({
        error: 'window_start and window_end are required ISO timestamps',
      });
    }

    let providerId = null;
    if (req.query.provider_id != null && req.query.provider_id !== '') {
      providerId = Number(req.query.provider_id);
      if (!Number.isInteger(providerId) || providerId <= 0) {
        return res.status(400).json({ error: 'provider_id must be a positive integer' });
      }
    }

    const preview = buildProviderSettlementPreview(db._db || db, {
      windowStart,
      windowEnd,
      providerId,
    });

    return res.json(preview);
  } catch (err) {
    if (err?.message && /windowStart|windowEnd/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[payouts] GET /admin/payouts/settlement-preview error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/payouts/:id/approve ──────────────────────────────────────
//
// Approve a pending payout: transitions status pending → processing.
// Sends email + Telegram notification to the provider.
// Body: { payment_ref?: string }
//
// DCP-862
router.post('/admin/payouts/:id/approve', skipAutomaticAdminAudit, requireAdminRbac, async (req, res) => {
  try {
    const raw_db = db._db || db;
    const { payment_ref } = req.body || {};

    const row = raw_db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payout request not found' });
    if (row.status !== 'pending') {
      return res.status(409).json({
        error: 'NOT_APPROVABLE',
        message: `Cannot approve a payout with status '${row.status}'`,
      });
    }

    const now = new Date().toISOString();
    raw_db.prepare(`
      UPDATE payout_requests
      SET status = 'processing', processed_at = ?, payment_ref = ?
      WHERE id = ?
    `).run(now, payment_ref || null, req.params.id);

    const updated = raw_db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(req.params.id);

    const provider = raw_db.prepare('SELECT id, name, email FROM providers WHERE id = ?').get(row.provider_id);
    const USD_TO_SAR = 3.75;
    const HALALA_PER_SAR = 100;
    const amountSar = Number((row.amount_halala / HALALA_PER_SAR).toFixed(2));

    if (provider?.email) {
      sendWithdrawalApprovedEmail(provider.email, amountSar)
        .catch((e) => console.error('[payouts] approve email failed:', e.message));
    }

    sendAlert('withdrawal_pending', [
      '✅ Payout APPROVED',
      `Provider: ${provider?.name || row.provider_id} (${provider?.email || 'no email'})`,
      `Amount: ${amountSar} SAR`,
      `Payout ID: ${req.params.id}`,
      payment_ref ? `Ref: ${payment_ref}` : null,
    ].filter(Boolean).join('\n'))
      .catch((e) => console.error('[payouts] approve alert failed:', e.message));

    logPayoutMutationAuditOnce(
      req,
      raw_db,
      'payout_approved',
      req.params.id,
      {
        provider_id: row.provider_id,
        amount_halala: row.amount_halala,
        status_from: row.status,
        status_to: 'processing',
        payment_ref: payment_ref || null,
      }
    );

    console.log(`[payout] approved payout_id=${req.params.id} provider_id=${row.provider_id} amount_sar=${amountSar} ref=${payment_ref}`);
    return res.json(updated);
  } catch (err) {
    console.error('[payouts] POST /admin/payouts/:id/approve error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/payouts/:id/reject ───────────────────────────────────────
//
// Reject a pending/processing payout: returns held funds to provider balance.
// Sends Telegram notification to admin + logs rejection reason.
// Body: { reason?: string }
//
// DCP-862
router.post('/admin/payouts/:id/reject', skipAutomaticAdminAudit, requireAdminRbac, async (req, res) => {
  try {
    const raw_db = db._db || db;
    const { reason } = req.body || {};

    const result = rejectPayout(raw_db, req.params.id, reason || null);
    if (result.error) {
      const statusMap = { NOT_FOUND: 404, NOT_REJECTABLE: 409 };
      return res.status(statusMap[result.error] || 400).json(result);
    }

    const provider = raw_db.prepare('SELECT id, name, email FROM providers WHERE id = ?').get(result.provider_id);
    const USD_TO_SAR = 3.75;
    const HALALA_PER_SAR = 100;
    const amountSar = Number((result.amount_halala / HALALA_PER_SAR).toFixed(2));

    sendAlert('critical_error', [
      '❌ Payout REJECTED',
      `Provider: ${provider?.name || result.provider_id} (${provider?.email || 'no email'})`,
      `Amount: ${amountSar} SAR (funds returned to balance)`,
      `Payout ID: ${req.params.id}`,
      reason ? `Reason: ${reason}` : 'Reason: not specified',
    ].join('\n'))
      .catch((e) => console.error('[payouts] reject alert failed:', e.message));

    console.log(`[payout] rejected payout_id=${req.params.id} provider_id=${result.provider_id} reason="${reason}" amount_sar=${amountSar}`);
    if (provider?.email) {
      sendWithdrawalRejectedEmail(provider.email, amountSar, reason || null)
        .catch((e) => console.error('[payouts] reject email failed:', e.message));
    }

    logPayoutMutationAuditOnce(
      req,
      raw_db,
      'payout_rejected',
      req.params.id,
      {
        provider_id: result.provider_id,
        amount_halala: result.amount_halala,
        status_to: 'rejected',
        reason: reason || null,
      }
    );

    return res.json(result);
  } catch (err) {
    console.error('[payouts] POST /admin/payouts/:id/reject error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/payouts/:id ─────────────────────────────────────────────
//
// Admin marks a payout as paid (default) or rejects it.
// Body: { action?: 'paid'|'reject', payment_ref?: string, reason?: string }
//
// DCP-768: requireAdminRbac = token auth + RBAC role check + audit log
router.patch('/admin/payouts/:id', skipAutomaticAdminAudit, requireAdminRbac, (req, res) => {
  try {
    const { action = 'paid', payment_ref, reason } = req.body;
    const rawDb = db._db || db;

    if (action === 'reject') {
      const result = rejectPayout(rawDb, req.params.id, reason || null);
      if (result.error) {
        const statusMap = { NOT_FOUND: 404, NOT_REJECTABLE: 409 };
        return res.status(statusMap[result.error] || 400).json(result);
      }
      logPayoutMutationAuditOnce(
        req,
        rawDb,
        'payout_rejected',
        req.params.id,
        {
          provider_id: result.provider_id,
          amount_halala: result.amount_halala,
          status_to: 'rejected',
          reason: reason || null,
        }
      );
      return res.json(result);
    }

    const result = markPayoutPaid(rawDb, req.params.id, payment_ref || null);
    if (result.error) {
      const statusMap = { NOT_FOUND: 404, ALREADY_PAID: 409, REJECTED: 409 };
      return res.status(statusMap[result.error] || 400).json(result);
    }
    logPayoutMutationAuditOnce(
      req,
      rawDb,
      'payout_marked_paid',
      req.params.id,
      {
        provider_id: result.provider_id,
        amount_halala: result.amount_halala,
        status_to: 'paid',
        payment_ref: payment_ref || null,
      }
    );
    return res.json(result);
  } catch (err) {
    console.error('[payouts] PATCH /admin/payouts/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
