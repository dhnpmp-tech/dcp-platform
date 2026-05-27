'use strict';

/**
 * Payout Service — DCP-763
 *
 * Off-chain payout request queue for provider earnings withdrawal.
 * Providers accumulate earnings in claimable_earnings_halala (halala = 1/100 SAR).
 * Payout requests are queued and processed manually by DCP admin via bank transfer.
 *
 * Minimum payout: $50 USD
 * USD/SAR: 3.75 (SAR is pegged to USD)
 *
 * Lifecycle:
 *   requestPayout  → pending    (amount reserved from claimable balance)
 *   markPayoutPaid → paid       (no further balance change — already reserved)
 *   rejectPayout   → rejected   (reserved amount returned to claimable balance)
 */

const crypto = require('crypto');
const moyasarPayout = require('./moyasarPayoutService');

const MIN_PAYOUT_USD = 50;
const USD_TO_SAR = 3.75;
const HALALA_PER_SAR = 100;
const payoutHistoryEscrowColumnCache = new WeakMap();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return how many halala are currently on hold in pending/processing requests.
 */
function pendingHoldsHalala(db, providerId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_halala), 0) AS on_hold
    FROM payout_requests
    WHERE provider_id = ? AND status IN ('pending', 'processing')
  `).get(providerId);
  return row ? Number(row.on_hold) : 0;
}

function hasPayoutEscrowTxHashColumn(db) {
  if (payoutHistoryEscrowColumnCache.has(db)) {
    return payoutHistoryEscrowColumnCache.get(db);
  }

  const columns = db.prepare('PRAGMA table_info(payout_requests)').all();
  const hasColumn = columns.some((column) => column.name === 'escrow_tx_hash');
  payoutHistoryEscrowColumnCache.set(db, hasColumn);
  return hasColumn;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request a payout.
 *
 * Validates the amount, checks available balance, and creates a payout_requests
 * record. The amount is deducted from claimable_earnings_halala immediately as
 * a hold so the provider cannot double-spend.
 *
 * @param {object} db          - better-sqlite3 db handle (or the dc1 db wrapper)
 * @param {number} providerId
 * @param {number} amountUsd   - requested payout in USD
 * @returns {object} result — on success: { requestId, status, amountUsd, amountSar }
 *                          — on failure: { error: ERROR_CODE, message, ...details }
 */
function requestPayout(db, providerId, amountUsd) {
  if (typeof amountUsd !== 'number' || !isFinite(amountUsd) || amountUsd <= 0) {
    return { error: 'INVALID_AMOUNT', message: 'amount_usd must be a positive number' };
  }

  if (amountUsd < MIN_PAYOUT_USD) {
    return {
      error: 'BELOW_MINIMUM',
      message: `Minimum payout is $${MIN_PAYOUT_USD} USD (${(MIN_PAYOUT_USD * USD_TO_SAR).toFixed(2)} SAR)`,
      minimumUsd: MIN_PAYOUT_USD,
      minimumSar: MIN_PAYOUT_USD * USD_TO_SAR,
    };
  }

  const amountSar = Number((amountUsd * USD_TO_SAR).toFixed(2));
  const amountHalala = Math.round(amountUsd * USD_TO_SAR * HALALA_PER_SAR);

  const provider = db.prepare(
    'SELECT id, claimable_earnings_halala FROM providers WHERE id = ? AND deleted_at IS NULL'
  ).get(providerId);
  if (!provider) {
    return { error: 'PROVIDER_NOT_FOUND', message: 'Provider not found' };
  }

  const claimableHalala = Number(provider.claimable_earnings_halala || 0);
  const onHoldHalala = pendingHoldsHalala(db, providerId);
  const availableHalala = Math.max(0, claimableHalala - onHoldHalala);

  if (amountHalala > availableHalala) {
    return {
      error: 'INSUFFICIENT_BALANCE',
      message: 'Requested amount exceeds available balance',
      availableHalala,
      availableSar: Number((availableHalala / HALALA_PER_SAR).toFixed(2)),
      availableUsd: Number((availableHalala / (HALALA_PER_SAR * USD_TO_SAR)).toFixed(2)),
      requestedHalala: amountHalala,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Reserve amount from claimable balance
  db.prepare(
    'UPDATE providers SET claimable_earnings_halala = claimable_earnings_halala - ? WHERE id = ?'
  ).run(amountHalala, providerId);

  db.prepare(`
    INSERT INTO payout_requests
      (id, provider_id, amount_usd, amount_sar, amount_halala, status, requested_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, providerId, amountUsd, amountSar, amountHalala, now);

  // Email notification hook — log only, no actual email sending yet
  console.log(`[payout] requested provider_id=${providerId} amount_usd=${amountUsd} timestamp=${now}`);

  const row = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
  return {
    requestId: row.id,
    status: row.status,
    amountUsd: row.amount_usd,
    amountSar: row.amount_sar,
    amountHalala: row.amount_halala,
    requestedAt: row.requested_at,
  };
}

/**
 * Get paginated payout history for a provider.
 *
 * @param {object} db
 * @param {number} providerId
 * @param {object} [opts]
 * @param {number} [opts.limit]   default 20, max 100
 * @param {number} [opts.offset]  default 0
 */
function getPayoutHistory(db, providerId, { limit = 20, offset = 0 } = {}) {
  const safeLimit  = Math.min(Number(limit)  || 20, 100);
  const safeOffset = Math.max(Number(offset) || 0,  0);
  const escrowTxHashSelect = hasPayoutEscrowTxHashColumn(db)
    ? 'escrow_tx_hash'
    : 'NULL AS escrow_tx_hash';

  const rows = db.prepare(`
    SELECT id, provider_id, amount_usd, amount_sar, amount_halala,
           status, requested_at, processed_at, payment_ref, ${escrowTxHashSelect}
    FROM payout_requests
    WHERE provider_id = ?
    ORDER BY requested_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(providerId, safeLimit, safeOffset);

  const count = db.prepare(
    'SELECT COUNT(*) AS total FROM payout_requests WHERE provider_id = ?'
  ).get(providerId);

  return {
    payouts: rows,
    pagination: { limit: safeLimit, offset: safeOffset, total: count ? count.total : 0 },
  };
}

/**
 * Get earnings summary: available balance, pending payouts, total paid.
 *
 * @param {object} db
 * @param {number} providerId
 * @returns {object|null} summary or null if provider not found
 */
function getEarningsSummary(db, providerId) {
  const provider = db.prepare(
    'SELECT id, claimable_earnings_halala FROM providers WHERE id = ? AND deleted_at IS NULL'
  ).get(providerId);
  if (!provider) return null;

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('pending','processing') THEN amount_halala ELSE 0 END), 0) AS pending_halala,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_halala ELSE 0 END), 0)                   AS paid_halala
    FROM payout_requests WHERE provider_id = ?
  `).get(providerId);

  const claimableHalala = Number(provider.claimable_earnings_halala || 0);
  const pendingHalala   = totals ? Number(totals.pending_halala) : 0;
  const paidHalala      = totals ? Number(totals.paid_halala)    : 0;
  // Available = claimable minus currently on hold (not yet processed)
  const availableHalala = Math.max(0, claimableHalala - pendingHalala);

  function toSar(halala) { return Number((halala / HALALA_PER_SAR).toFixed(2)); }
  function toUsd(halala) { return Number((halala / (HALALA_PER_SAR * USD_TO_SAR)).toFixed(2)); }

  return {
    providerId,
    availableHalala,
    availableSar: toSar(availableHalala),
    availableUsd: toUsd(availableHalala),
    pendingHalala,
    pendingSar: toSar(pendingHalala),
    pendingUsd: toUsd(pendingHalala),
    paidHalala,
    paidSar: toSar(paidHalala),
    paidUsd: toUsd(paidHalala),
    minimumPayoutUsd: MIN_PAYOUT_USD,
    minimumPayoutSar: MIN_PAYOUT_USD * USD_TO_SAR,
  };
}

/**
 * Admin: mark a payout request as paid.
 *
 * @param {object} db
 * @param {string} payoutId
 * @param {string} [paymentRef]  - reference ID from bank / transfer system
 * @returns {object} updated row or error object
 */
function markPayoutPaid(db, payoutId, paymentRef = null) {
  const row = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
  if (!row) return { error: 'NOT_FOUND', message: 'Payout request not found' };
  if (row.status === 'paid')     return { error: 'ALREADY_PAID', message: 'Payout already marked as paid' };
  if (row.status === 'rejected') return { error: 'REJECTED',     message: 'Cannot mark a rejected payout as paid' };

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE payout_requests
    SET status = 'paid', processed_at = ?, payment_ref = ?
    WHERE id = ?
  `).run(now, paymentRef || null, payoutId);

  // Email notification hook — log only, no actual email sending yet
  console.log(`[payout] processed payout_id=${payoutId} provider_id=${row.provider_id} payment_ref=${paymentRef} timestamp=${now}`);

  return db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
}

/**
 * Admin: reject a payout request.
 *
 * Returns the held funds to the provider's claimable balance.
 *
 * @param {object} db
 * @param {string} payoutId
 * @param {string} [reason]
 * @returns {object} updated row or error object
 */
function rejectPayout(db, payoutId, reason = null) {
  const row = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
  if (!row) return { error: 'NOT_FOUND', message: 'Payout request not found' };
  if (row.status !== 'pending' && row.status !== 'processing') {
    return { error: 'NOT_REJECTABLE', message: `Cannot reject a payout with status '${row.status}'` };
  }

  const now = new Date().toISOString();

  // Return held funds to claimable balance
  db.prepare(
    'UPDATE providers SET claimable_earnings_halala = claimable_earnings_halala + ? WHERE id = ?'
  ).run(row.amount_halala, row.provider_id);

  db.prepare(`
    UPDATE payout_requests
    SET status = 'rejected', processed_at = ?, payment_ref = ?
    WHERE id = ?
  `).run(now, reason ? `REJECTED: ${reason}` : 'REJECTED', payoutId);

  return db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
}

/**
 * Admin: initiate a Moyasar payout for a pending payout_request.
 *
 * Flow:
 *   1. Verify request is 'pending'.
 *   2. Verify provider has payout_iban + payout_holder_name registered.
 *   3. Call moyasar POST /v1/payouts with destination = provider IBAN.
 *   4. Move request to 'processing', store moyasar_payout_id + raw response.
 *
 * Terminal status (paid|failed) is set later by:
 *   - the payout webhook (if enabled in Moyasar dashboard), OR
 *   - syncPayoutStatus() polling.
 *
 * @returns success: { requestId, moyasarPayoutId, moyasarStatus }
 *          failure: { error: CODE, message, details? }
 */
async function processPayoutViaMoyasar(db, payoutId) {
  const row = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
  if (!row) return { error: 'NOT_FOUND', message: 'Payout request not found' };
  if (row.status !== 'pending') {
    return { error: 'NOT_PENDING', message: `Payout has status '${row.status}'; expected 'pending'` };
  }

  const provider = db.prepare(
    'SELECT id, name, payout_iban, payout_holder_name FROM providers WHERE id = ?'
  ).get(row.provider_id);
  if (!provider) return { error: 'PROVIDER_NOT_FOUND', message: 'Provider not found' };
  if (!provider.payout_iban || !provider.payout_holder_name) {
    return {
      error: 'NO_PAYOUT_ACCOUNT',
      message: 'Provider has no registered payout IBAN. POST /api/providers/payout-account first.',
    };
  }

  // Atomic CAS claim — prevents two concurrent admins (or retries) from
  // double-firing Moyasar disbursements for the same payout_request row.
  // We move 'pending' -> 'processing' BEFORE the Moyasar call; on Moyasar
  // failure we revert back to 'pending' so the next attempt can retry.
  // (Codex P1, PR #426 review)
  const now = new Date().toISOString();
  const claim = db.prepare(`
    UPDATE payout_requests
       SET status = 'processing',
           processed_at = ?
     WHERE id = ?
       AND status = 'pending'
  `).run(now, payoutId);
  if (claim.changes === 0) {
    const fresh = db.prepare('SELECT status FROM payout_requests WHERE id = ?').get(payoutId);
    return {
      error: 'NOT_PENDING',
      message: `Payout has status '${fresh?.status}'; another approver claimed it first`,
    };
  }

  let resp;
  try {
    resp = await moyasarPayout.createPayout({
      amountHalala: row.amount_halala,
      iban: provider.payout_iban,
      beneficiaryName: provider.payout_holder_name,
      comment: `DCP provider payout — request ${row.id}`,
      metadata: {
        dcp_payout_request_id: row.id,
        dcp_provider_id: String(provider.id),
      },
    });
  } catch (err) {
    // Moyasar didn't accept the disbursement — release the claim so an
    // admin (or retry) can try again from 'pending'.
    db.prepare(`
      UPDATE payout_requests
         SET status = 'pending',
             processed_at = NULL
       WHERE id = ?
         AND status = 'processing'
         AND moyasar_payout_id IS NULL
    `).run(payoutId);
    return {
      error: 'MOYASAR_ERROR',
      message: err.message,
      statusCode: err.statusCode || null,
      details: err.moyasarError || null,
    };
  }

  // Moyasar accepted — persist the disbursement id + raw response.
  db.prepare(`
    UPDATE payout_requests
       SET moyasar_payout_id = ?,
           moyasar_status = ?,
           gateway_response = ?
     WHERE id = ?
  `).run(resp.id, resp.status, JSON.stringify(resp), payoutId);

  console.log(`[payout] moyasar created id=${resp.id} status=${resp.status} for payout_request=${payoutId}`);

  return {
    requestId: payoutId,
    moyasarPayoutId: resp.id,
    moyasarStatus: resp.status,
    sequenceNumber: resp.sequence_number,
  };
}

/**
 * Sync a single payout_request against Moyasar's GET /v1/payouts/:id.
 * Promotes 'processing' to 'paid' or 'rejected' on terminal status.
 *
 * Called by:
 *   - admin "refresh" button,
 *   - cron poller (every ~5min),
 *   - webhook handler (when Moyasar emits payout events).
 *
 * @returns { status, moyasarStatus, transitioned: boolean }
 */
async function syncPayoutStatus(db, payoutId) {
  const row = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
  if (!row) return { error: 'NOT_FOUND', message: 'Payout request not found' };
  if (!row.moyasar_payout_id) {
    return { error: 'NO_MOYASAR_ID', message: 'Payout not yet sent to Moyasar' };
  }
  if (row.status === 'paid' || row.status === 'rejected') {
    return { status: row.status, moyasarStatus: row.moyasar_status, transitioned: false };
  }

  let resp;
  try {
    resp = await moyasarPayout.fetchPayout(row.moyasar_payout_id);
  } catch (err) {
    return {
      error: 'MOYASAR_ERROR',
      message: err.message,
      statusCode: err.statusCode || null,
    };
  }

  const now = new Date().toISOString();

  if (moyasarPayout.isTerminalSuccess(resp.status)) {
    // Conditional CAS — only transition from non-terminal states. Prevents the
    // webhook + admin-sync race from overwriting an already-finalized row.
    const r = db.prepare(`
      UPDATE payout_requests
         SET status = 'paid',
             moyasar_status = ?,
             gateway_response = ?,
             processed_at = ?,
             payment_ref = COALESCE(payment_ref, ?)
       WHERE id = ?
         AND status NOT IN ('paid','rejected')
    `).run(resp.status, JSON.stringify(resp), now, resp.sequence_number || resp.id, payoutId);
    if (r.changes === 0) {
      const fresh = db.prepare('SELECT status, moyasar_status FROM payout_requests WHERE id = ?').get(payoutId);
      return { status: fresh?.status, moyasarStatus: fresh?.moyasar_status, transitioned: false };
    }
    console.log(`[payout] sync ${payoutId} -> paid (moyasar ${resp.status})`);
    return { status: 'paid', moyasarStatus: resp.status, transitioned: true };
  }

  if (moyasarPayout.isTerminalFailure(resp.status)) {
    // Codex P1 fix: order matters. Transition the payout row FIRST with a
    // conditional UPDATE; only refund the provider's claimable balance if
    // changes>0 (i.e. WE were the writer that flipped non-terminal->rejected).
    // A concurrent webhook+sync would race on the unconditional refund and
    // double-credit the provider.
    const tx = db.transaction(() => {
      const r = db.prepare(`
        UPDATE payout_requests
           SET status = 'rejected',
               moyasar_status = ?,
               failure_reason = ?,
               gateway_response = ?,
               processed_at = ?
         WHERE id = ?
           AND status NOT IN ('paid','rejected')
      `).run(
        resp.status,
        resp.failure_reason || resp.message || `moyasar status=${resp.status}`,
        JSON.stringify(resp),
        now,
        payoutId
      );
      if (r.changes === 0) {
        // Already terminalized by a peer — don't double-refund.
        return { transitioned: false };
      }
      db.prepare(
        'UPDATE providers SET claimable_earnings_halala = claimable_earnings_halala + ? WHERE id = ?'
      ).run(row.amount_halala, row.provider_id);
      return { transitioned: true };
    });
    const txResult = tx();
    if (!txResult.transitioned) {
      const fresh = db.prepare('SELECT status, moyasar_status FROM payout_requests WHERE id = ?').get(payoutId);
      return { status: fresh?.status, moyasarStatus: fresh?.moyasar_status, transitioned: false };
    }
    console.log(`[payout] sync ${payoutId} -> rejected (moyasar ${resp.status}) — funds returned`);
    return { status: 'rejected', moyasarStatus: resp.status, transitioned: true };
  }

  // Still in flight — update raw status only.
  db.prepare('UPDATE payout_requests SET moyasar_status = ?, gateway_response = ? WHERE id = ?')
    .run(resp.status, JSON.stringify(resp), payoutId);
  return { status: row.status, moyasarStatus: resp.status, transitioned: false };
}

/**
 * Reconciliation sweep — find payouts that have been 'processing' (sent to
 * Moyasar) for longer than minAgeMinutes without a webhook-driven terminal
 * transition. Pings Moyasar's /v1/payouts/:id for each and applies the
 * terminal status via syncPayoutStatus (which is itself idempotent).
 *
 * Called every ~15 minutes from server.js. Idle when no rows match.
 *
 * Returns { swept, transitioned, errors } for ops visibility.
 */
async function reconcileProcessingPayouts(db, { minAgeMinutes = 15, limit = 50, nowIso = new Date().toISOString() } = {}) {
  const cutoff = new Date(new Date(nowIso).getTime() - minAgeMinutes * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT id
      FROM payout_requests
     WHERE status = 'processing'
       AND moyasar_payout_id IS NOT NULL
       AND (processed_at IS NULL OR processed_at < ?)
     ORDER BY requested_at ASC
     LIMIT ?
  `).all(cutoff, limit);

  let transitioned = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const result = await syncPayoutStatus(db, row.id);
      if (result && result.transitioned) transitioned += 1;
    } catch (e) {
      errors += 1;
      console.warn(`[payout.reconcile] ${row.id} sync failed:`, e?.message || e);
    }
  }
  return { swept: rows.length, transitioned, errors };
}

module.exports = {
  requestPayout,
  getPayoutHistory,
  getEarningsSummary,
  markPayoutPaid,
  rejectPayout,
  processPayoutViaMoyasar,
  syncPayoutStatus,
  reconcileProcessingPayouts,
  MIN_PAYOUT_USD,
  USD_TO_SAR,
};
