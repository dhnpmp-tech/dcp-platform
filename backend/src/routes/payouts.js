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
  processPayoutViaMoyasar,
  syncPayoutStatus,
} = require('../services/payoutService');
const moyasarPayout = require('../services/moyasarPayoutService');
const { buildProviderSettlementPreview } = require('../services/payoutBatchService');
const { sendWithdrawalApprovedEmail, sendWithdrawalRejectedEmail } = require('../services/emailService');
const { sendAlert } = require('../services/notifications');
const { refundPayment } = require('../services/moyasarPaymentRefundService');

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

function logPaymentRefundAuditOnce(req, rawDb, action, requestId, details) {
  if (req._paymentRefundAuditLogged === true) return;
  req._paymentRefundAuditLogged = true;
  logAdminAction(
    rawDb,
    req.adminUser?.id || 'unknown',
    action,
    'payment_refund_request',
    String(requestId),
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

// ── GET /api/admin/payments/audit ────────────────────────────────────────────
//
// Combined audit feed for the new payment surfaces (PR #426-#429):
//   - payout_requests with full Moyasar status (status, moyasar_payout_id,
//     moyasar_status, failure_reason)
//   - billing_attempts (idempotency log from settleInferenceOnce)
//   - auto_topup_attempts (one row per renter recharge attempt)
//   - payment_refund_requests (renter refund requests awaiting admin review)
//
// Default limit 50 per section. Query:
//   ?limit=50 — cap per section (1..200)
//   ?status=pending|processing|paid|rejected — filter payouts
//
// Single roundtrip for the /admin/payments UI.
router.get('/admin/payments/audit', requireAdminRbac, (req, res) => {
  try {
    const raw = db._db || db;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : null;
    const validStatus = ['pending', 'processing', 'paid', 'rejected'].includes(status);

    const payoutsSql = `
      SELECT
        pr.id              AS payout_id,
        pr.provider_id,
        pr.amount_halala,
        pr.status,
        pr.moyasar_payout_id,
        pr.moyasar_status,
        pr.failure_reason,
        pr.requested_at,
        pr.processed_at,
        pr.payment_ref,
        p.name             AS provider_name,
        p.email            AS provider_email
      FROM payout_requests pr
      LEFT JOIN providers p ON p.id = pr.provider_id
      ${validStatus ? 'WHERE pr.status = ?' : ''}
      ORDER BY pr.requested_at DESC
      LIMIT ?
    `;
    const payouts = (
      validStatus
        ? raw.prepare(payoutsSql).all(status, limit)
        : raw.prepare(payoutsSql).all(limit)
    ).map((r) => ({
      payout_id:         r.payout_id,
      provider_id:       r.provider_id,
      provider_name:     r.provider_name,
      provider_email:    r.provider_email,
      amount_sar:        Number((r.amount_halala / 100).toFixed(2)),
      amount_halala:     r.amount_halala,
      status:            r.status,
      moyasar_payout_id: r.moyasar_payout_id,
      moyasar_status:    r.moyasar_status,
      failure_reason:    r.failure_reason,
      requested_at:      r.requested_at,
      processed_at:      r.processed_at,
      payment_ref:       r.payment_ref,
    }));

    // billing_attempts is created on the first /v1 inference per request_id.
    const billing = raw.prepare(`
      SELECT ba.request_id, ba.renter_id, ba.provider_id, ba.cost_halala,
             ba.provider_earned_halala, ba.status, ba.error_code, ba.settled_at,
             r.name AS renter_name, r.email AS renter_email
        FROM billing_attempts ba
        LEFT JOIN renters r ON r.id = ba.renter_id
       ORDER BY ba.settled_at DESC
       LIMIT ?
    `).all(limit).map((row) => ({
      request_id:              row.request_id,
      renter_id:               row.renter_id,
      renter_name:             row.renter_name,
      renter_email:            row.renter_email,
      provider_id:             row.provider_id,
      cost_sar:                Number((row.cost_halala / 100).toFixed(2)),
      provider_earned_sar:     Number((row.provider_earned_halala / 100).toFixed(2)),
      status:                  row.status,
      error_code:              row.error_code,
      settled_at:              row.settled_at,
    }));

    const autoTopups = raw.prepare(`
      SELECT ata.id, ata.renter_id, ata.amount_halala, ata.status,
             ata.moyasar_payment_id, ata.trigger_reason, ata.balance_before_halala,
             ata.balance_after_halala, ata.error_code, ata.error_message,
             ata.created_at, ata.completed_at,
             r.name AS renter_name, r.email AS renter_email
        FROM auto_topup_attempts ata
        LEFT JOIN renters r ON r.id = ata.renter_id
       ORDER BY ata.created_at DESC
       LIMIT ?
    `).all(limit).map((row) => ({
      attempt_id:            row.id,
      renter_id:             row.renter_id,
      renter_name:           row.renter_name,
      renter_email:          row.renter_email,
      amount_sar:            Number((row.amount_halala / 100).toFixed(2)),
      status:                row.status,
      moyasar_payment_id:    row.moyasar_payment_id,
      trigger_reason:        row.trigger_reason,
      balance_before_sar:    row.balance_before_halala != null ? Number((row.balance_before_halala / 100).toFixed(2)) : null,
      balance_after_sar:     row.balance_after_halala != null ? Number((row.balance_after_halala / 100).toFixed(2)) : null,
      error_code:            row.error_code,
      error_message:         row.error_message,
      created_at:            row.created_at,
      completed_at:          row.completed_at,
    }));

    const refundRequests = raw.prepare(`
      SELECT prr.id, prr.payment_id, prr.renter_id, prr.amount_halala,
             prr.reason, prr.status, prr.requested_at, prr.reviewed_at,
             prr.reviewed_by, prr.admin_note, prr.moyasar_refund_id,
             p.moyasar_id, p.amount_halala AS payment_amount_halala,
             p.status AS payment_status, p.created_at AS payment_created_at,
             r.name AS renter_name, r.email AS renter_email
        FROM payment_refund_requests prr
        JOIN payments p ON p.payment_id = prr.payment_id
        LEFT JOIN renters r ON r.id = prr.renter_id
       ORDER BY
         CASE prr.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
         prr.requested_at DESC
       LIMIT ?
    `).all(limit).map((row) => ({
      request_id:             row.id,
      payment_id:             row.payment_id,
      moyasar_id:             row.moyasar_id,
      renter_id:              row.renter_id,
      renter_name:            row.renter_name,
      renter_email:           row.renter_email,
      amount_sar:             Number((row.amount_halala / 100).toFixed(2)),
      amount_halala:          row.amount_halala,
      reason:                 row.reason,
      status:                 row.status,
      requested_at:           row.requested_at,
      reviewed_at:            row.reviewed_at,
      reviewed_by:            row.reviewed_by,
      admin_note:             row.admin_note,
      moyasar_refund_id:      row.moyasar_refund_id,
      payment_amount_sar:     Number((row.payment_amount_halala / 100).toFixed(2)),
      payment_status:         row.payment_status,
      payment_created_at:     row.payment_created_at,
    }));

    // Summary counts surface the health of each surface at a glance.
    const summary = {
      payouts: raw.prepare(`
        SELECT status, COUNT(*) AS n FROM payout_requests GROUP BY status
      `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
      billing_attempts: raw.prepare(`
        SELECT status, COUNT(*) AS n FROM billing_attempts GROUP BY status
      `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
      auto_topup: raw.prepare(`
        SELECT status, COUNT(*) AS n FROM auto_topup_attempts GROUP BY status
      `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
      refund_requests: raw.prepare(`
        SELECT status, COUNT(*) AS n FROM payment_refund_requests GROUP BY status
      `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
    };

    return res.json({ payouts, billing, auto_topup: autoTopups, refund_requests: refundRequests, summary });
  } catch (err) {
    console.error('[payments-audit] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/payments/refund-requests/:id/approve ────────────────────
//
// Approve a renter-created refund request. Live Moyasar payments use the
// Moyasar refund endpoint; sandbox/no-key records use the same internal refund
// semantics as the legacy admin refund route.
router.post('/admin/payments/refund-requests/:id/approve', skipAutomaticAdminAudit, requireAdminRbac, async (req, res) => {
  const raw = db._db || db;
  const requestId = req.params.id;
  const adminNote = typeof req.body?.admin_note === 'string' ? req.body.admin_note.trim().slice(0, 1000) : null;
  const adminId = req.adminUser?.id || 'unknown';

  try {
    const row = raw.prepare(`
      SELECT prr.*, p.moyasar_id, p.amount_halala AS payment_amount_halala,
             p.status AS payment_status, p.refunded_at, p.renter_id AS payment_renter_id
        FROM payment_refund_requests prr
        JOIN payments p ON p.payment_id = prr.payment_id
       WHERE prr.id = ?
    `).get(requestId);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Refund request not found' });
    if (row.status !== 'pending') {
      return res.status(409).json({ error: 'NOT_APPROVABLE', message: `Cannot approve refund request with status '${row.status}'` });
    }
    if (row.payment_status !== 'paid' || row.refunded_at) {
      return res.status(409).json({ error: 'PAYMENT_NOT_REFUNDABLE', message: 'Payment is not currently refundable' });
    }

    const now = new Date().toISOString();
    const claimed = raw.prepare(`
      UPDATE payment_refund_requests
         SET status = 'processing', reviewed_at = ?, reviewed_by = ?, admin_note = ?
       WHERE id = ? AND status = 'pending'
    `).run(now, adminId, adminNote, requestId);
    if (!claimed.changes) {
      return res.status(409).json({ error: 'ALREADY_CLAIMED', message: 'Refund request is already being processed' });
    }

    const externalPaymentId = row.moyasar_id;
    const shouldCallMoyasar = !!process.env.MOYASAR_SECRET_KEY && !!externalPaymentId && !String(row.payment_id).startsWith('sandbox-');
    let channel = 'manual';
    let gatewayResponse = { type: 'manual', reason: shouldCallMoyasar ? 'missing_moyasar_id' : 'moyasar_unconfigured_or_sandbox' };
    if (shouldCallMoyasar) {
      try {
        gatewayResponse = await refundPayment({
          paymentId: externalPaymentId,
          amountHalala: row.amount_halala,
        });
        channel = 'moyasar';
      } catch (err) {
        raw.prepare(`
          UPDATE payment_refund_requests
             SET status = 'pending',
                 admin_note = ?,
                 gateway_response = ?
           WHERE id = ?
        `).run(
          [adminNote, `Moyasar refund failed: ${err.message}`].filter(Boolean).join('\n'),
          JSON.stringify(err.moyasarError || { error: err.message, statusCode: err.statusCode || null }),
          requestId
        );
        return res.status(502).json({ error: 'MOYASAR_REFUND_FAILED', message: err.message, details: err.moyasarError || null });
      }
    }

    const finish = raw.transaction(() => {
      const paymentUpdate = raw.prepare(`
        UPDATE payments
           SET status = 'refunded',
               refunded_at = ?,
               refund_amount_halala = ?,
               gateway_response = ?
         WHERE payment_id = ?
           AND status = 'paid'
           AND refunded_at IS NULL
      `).run(now, row.amount_halala, JSON.stringify(gatewayResponse), row.payment_id);
      if (!paymentUpdate.changes) {
        throw new Error('Payment was already refunded or is no longer paid');
      }
      raw.prepare(`
        UPDATE renters
           SET balance_halala = MAX(0, balance_halala - ?),
               updated_at = ?
         WHERE id = ?
      `).run(row.amount_halala, now, row.renter_id);
      raw.prepare(`
        UPDATE payment_refund_requests
           SET status = 'approved',
               reviewed_at = ?,
               reviewed_by = ?,
               admin_note = ?,
               moyasar_refund_id = ?,
               gateway_response = ?
         WHERE id = ?
      `).run(
        now,
        adminId,
        adminNote,
        gatewayResponse.id || gatewayResponse.refund_id || null,
        JSON.stringify(gatewayResponse),
        requestId
      );
    });
    finish();

    logPaymentRefundAuditOnce(req, raw, 'payment_refund_approved', requestId, {
      payment_id: row.payment_id,
      renter_id: row.renter_id,
      amount_halala: row.amount_halala,
      channel,
    });

    return res.json({
      success: true,
      request_id: requestId,
      payment_id: row.payment_id,
      refunded_halala: row.amount_halala,
      refunded_sar: row.amount_halala / 100,
      channel,
    });
  } catch (err) {
    console.error('[payment-refund] approve error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/payments/refund-requests/:id/reject ─────────────────────
router.post('/admin/payments/refund-requests/:id/reject', skipAutomaticAdminAudit, requireAdminRbac, (req, res) => {
  const raw = db._db || db;
  const requestId = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
  if (reason.length < 3) {
    return res.status(400).json({ error: 'reason must be at least 3 characters' });
  }

  try {
    const row = raw.prepare('SELECT * FROM payment_refund_requests WHERE id = ?').get(requestId);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Refund request not found' });
    if (row.status !== 'pending') {
      return res.status(409).json({ error: 'NOT_REJECTABLE', message: `Cannot reject refund request with status '${row.status}'` });
    }
    const now = new Date().toISOString();
    raw.prepare(`
      UPDATE payment_refund_requests
         SET status = 'rejected',
             reviewed_at = ?,
             reviewed_by = ?,
             admin_note = ?
       WHERE id = ? AND status = 'pending'
    `).run(now, req.adminUser?.id || 'unknown', reason, requestId);

    logPaymentRefundAuditOnce(req, raw, 'payment_refund_rejected', requestId, {
      payment_id: row.payment_id,
      renter_id: row.renter_id,
      amount_halala: row.amount_halala,
      reason,
    });

    return res.json({ success: true, request_id: requestId, status: 'rejected' });
  } catch (err) {
    console.error('[payment-refund] reject error:', err);
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
    const { payment_ref, force_manual } = req.body || {};

    const row = raw_db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payout request not found' });
    if (row.status !== 'pending') {
      return res.status(409).json({
        error: 'NOT_APPROVABLE',
        message: `Cannot approve a payout with status '${row.status}'`,
      });
    }

    // Route via Moyasar when both the funding source and a provider IBAN are configured.
    // force_manual=true keeps the legacy bank-transfer flow for ops-only overrides.
    const moyasarConfigured = !!process.env.MOYASAR_SECRET_KEY && !!process.env.MOYASAR_PAYOUT_SOURCE_ID;
    let provider;
    try {
      provider = raw_db.prepare(
        'SELECT id, name, email, payout_iban, payout_holder_name FROM providers WHERE id = ?'
      ).get(row.provider_id);
    } catch (_) {
      // Older DB/test fixtures may not have Moyasar payout columns yet.
      provider = raw_db.prepare('SELECT id, name, email FROM providers WHERE id = ?').get(row.provider_id);
    }
    const hasProviderIban = !!(provider && provider.payout_iban && provider.payout_holder_name);

    if (moyasarConfigured && hasProviderIban && !force_manual) {
      const moyResult = await processPayoutViaMoyasar(raw_db, req.params.id);
      if (moyResult.error) {
        const statusMap = {
          NOT_FOUND: 404,
          NOT_PENDING: 409,
          PROVIDER_NOT_FOUND: 404,
          NO_PAYOUT_ACCOUNT: 412,
          MOYASAR_ERROR: 502,
        };
        return res.status(statusMap[moyResult.error] || 400).json(moyResult);
      }
      const updated = raw_db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(req.params.id);
      const USD_TO_SAR = 3.75;
      const HALALA_PER_SAR = 100;
      const amountSar = Number((row.amount_halala / HALALA_PER_SAR).toFixed(2));

      sendAlert('withdrawal_pending', [
        '✅ Payout APPROVED (Moyasar)',
        `Provider: ${provider?.name || row.provider_id} (${provider?.email || 'no email'})`,
        `Amount: ${amountSar} SAR`,
        `Payout ID: ${req.params.id}`,
        `Moyasar ID: ${moyResult.moyasarPayoutId}`,
        `Moyasar status: ${moyResult.moyasarStatus}`,
      ].join('\n'))
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
          moyasar_payout_id: moyResult.moyasarPayoutId,
          moyasar_status: moyResult.moyasarStatus,
          channel: 'moyasar',
        }
      );

      console.log(`[payout] moyasar approved payout_id=${req.params.id} provider_id=${row.provider_id} amount_sar=${amountSar} moyasar=${moyResult.moyasarPayoutId}`);
      return res.json({ ...updated, moyasar_payout_id: moyResult.moyasarPayoutId, moyasar_status: moyResult.moyasarStatus });
    }

    // Legacy / manual bank-transfer fallback.
    const now = new Date().toISOString();
    raw_db.prepare(`
      UPDATE payout_requests
      SET status = 'processing', processed_at = ?, payment_ref = ?
      WHERE id = ?
    `).run(now, payment_ref || null, req.params.id);

    const updated = raw_db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(req.params.id);

    const USD_TO_SAR = 3.75;
    const HALALA_PER_SAR = 100;
    const amountSar = Number((row.amount_halala / HALALA_PER_SAR).toFixed(2));

    if (provider?.email) {
      sendWithdrawalApprovedEmail(provider.email, amountSar)
        .catch((e) => console.error('[payouts] approve email failed:', e.message));
    }

    sendAlert('withdrawal_pending', [
      '✅ Payout APPROVED (manual)',
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

// ── POST /api/providers/:id/payout-account ───────────────────────────────────
//
// Provider registers their bank IBAN for Moyasar payouts. Stores the IBAN
// locally (providers.payout_iban + payout_holder_name) and registers an
// account with Moyasar if MOYASAR_SECRET_KEY is configured.
//
// Body: { iban: string, holder_name: string, mobile?: string }
// Auth: provider auth (same as /providers/:id/payouts).
router.post('/providers/:id/payout-account', requireProviderAuth, async (req, res) => {
  try {
    const provider = req.provider;
    const { iban, holder_name, mobile } = req.body || {};

    const normalizedIban = typeof iban === 'string' ? iban.replace(/\s+/g, '').toUpperCase() : '';
    if (!/^SA\d{22}$/.test(normalizedIban)) {
      return res.status(400).json({
        error: 'INVALID_IBAN',
        message: 'iban must be a valid Saudi IBAN (SA followed by 22 digits)',
      });
    }
    if (!holder_name || typeof holder_name !== 'string' || holder_name.trim().length < 2) {
      return res.status(400).json({
        error: 'INVALID_HOLDER_NAME',
        message: 'holder_name is required',
      });
    }

    const rawDb = db._db || db;
    const now = new Date().toISOString();

    // Try to register with Moyasar when keys are configured. Failure is non-fatal —
    // the IBAN is still stored so the provider can retry registration later.
    let moyasarAccountId = null;
    let moyasarError = null;
    if (process.env.MOYASAR_SECRET_KEY) {
      try {
        const resp = await moyasarPayout.createPayoutAccount({
          accountType: 'bank',
          properties: { iban: normalizedIban },
          credentials: {},
        });
        moyasarAccountId = resp.id || null;
      } catch (err) {
        moyasarError = err.moyasarError || err.message;
        console.error('[payouts] moyasar createPayoutAccount failed:', err.message);
      }
    }

    rawDb.prepare(`
      UPDATE providers
         SET payout_iban = ?,
             payout_holder_name = ?,
             moyasar_payout_account_id = COALESCE(?, moyasar_payout_account_id),
             payout_account_registered_at = ?
       WHERE id = ?
    `).run(normalizedIban, holder_name.trim(), moyasarAccountId, now, provider.id);

    const updated = rawDb.prepare(
      'SELECT id, payout_iban, payout_holder_name, moyasar_payout_account_id, payout_account_registered_at FROM providers WHERE id = ?'
    ).get(provider.id);

    return res.json({
      provider_id: updated.id,
      payout_iban: updated.payout_iban,
      payout_holder_name: updated.payout_holder_name,
      moyasar_payout_account_id: updated.moyasar_payout_account_id,
      registered_at: updated.payout_account_registered_at,
      moyasar_error: moyasarError,
    });
  } catch (err) {
    console.error('[payouts] POST /providers/:id/payout-account error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/payouts/:id/sync ─────────────────────────────────────────
//
// Manually refresh a Moyasar payout's status. Promotes 'processing' rows to
// 'paid' or 'rejected' on terminal Moyasar status. Used as a fallback when
// webhook delivery is delayed or disabled.
router.post('/admin/payouts/:id/sync', skipAutomaticAdminAudit, requireAdminRbac, async (req, res) => {
  try {
    const rawDb = db._db || db;
    const result = await syncPayoutStatus(rawDb, req.params.id);
    if (result.error) {
      const statusMap = { NOT_FOUND: 404, NO_MOYASAR_ID: 409, MOYASAR_ERROR: 502 };
      return res.status(statusMap[result.error] || 400).json(result);
    }
    if (result.transitioned) {
      logPayoutMutationAuditOnce(
        req,
        rawDb,
        result.status === 'paid' ? 'payout_marked_paid' : 'payout_rejected',
        req.params.id,
        {
          channel: 'moyasar_sync',
          status_to: result.status,
          moyasar_status: result.moyasarStatus,
        }
      );
    }
    return res.json(result);
  } catch (err) {
    console.error('[payouts] POST /admin/payouts/:id/sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
