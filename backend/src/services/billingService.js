'use strict';

/**
 * billingService.js — atomic per-request settlement for /v1 inference.
 *
 * Replaces the scattered debit/credit logic in v1.js with a single
 * transactional helper. One row in billing_attempts per request makes
 * settlement idempotent under retry (process crash, sweep, webhook replay).
 *
 * Contract:
 *   - Caller pre-flights balance with checkBalanceGate() before dispatching
 *     work to the provider. Inference is rejected (402) if balance + active
 *     sub credits cannot cover the estimate.
 *   - After inference completes, caller calls settleInferenceOnce() with
 *     the actual cost. The function:
 *       1. Inserts billing_attempts(request_id) — IF this fails on UNIQUE,
 *          the request was already settled and we return 'already_settled'.
 *       2. Drains subscription credits (oldest-expiring first).
 *       3. Debits remaining PAYG balance.
 *       4. Credits provider claimable + totals.
 *       5. Writes usage_events + jobs row.
 *       6. Increments renter totals.
 *     All in one db.transaction(). Throws on insufficient balance — caller
 *     decides whether to refund the inference or not.
 *
 * Splits are computed via services/reconciliation-engine.splitCost (75/25).
 */

const subscriptionService = require('./subscriptionService');
const { splitCost } = require('./reconciliation-engine');

class InsufficientBalanceError extends Error {
  constructor(renterId, deficitHalala, balanceHalala) {
    super(`Insufficient balance for renter ${renterId}: deficit ${deficitHalala} halala`);
    this.code = 'INSUFFICIENT_BALANCE';
    this.renterId = renterId;
    this.deficitHalala = deficitHalala;
    this.balanceHalala = balanceHalala;
  }
}

/**
 * Compute the effective available balance for a renter: PAYG balance plus
 * the sum of unspent subscription credits whose expiry is in the future.
 *
 * @returns {{ balanceHalala, subCreditsHalala, totalAvailableHalala }}
 */
function getEffectiveBalance(db, renterId, nowIso = new Date().toISOString()) {
  const renter = db.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
  const balanceHalala = renter ? Number(renter.balance_halala || 0) : 0;
  const subRows = subscriptionService.getAvailableCredits(db, renterId, nowIso);
  const subCreditsHalala = subRows.reduce(
    (sum, g) => sum + Math.max(0, Number(g.amount_halala || 0) - Number(g.consumed_halala || 0)),
    0
  );
  return {
    balanceHalala,
    subCreditsHalala,
    totalAvailableHalala: balanceHalala + subCreditsHalala,
  };
}

/**
 * Pre-flight gate. Returns { ok: true } if total available covers estimate,
 * otherwise { ok: false, balanceHalala, deficitHalala, estimateHalala }.
 *
 * Caller is expected to translate { ok: false } into a 402 response and
 * never dispatch the request to a provider.
 */
function checkBalanceGate(db, renterId, estimateHalala) {
  const est = Math.max(0, Math.ceil(Number(estimateHalala) || 0));
  const { balanceHalala, subCreditsHalala, totalAvailableHalala } = getEffectiveBalance(db, renterId);
  if (totalAvailableHalala >= est) {
    return {
      ok: true,
      balanceHalala,
      subCreditsHalala,
      totalAvailableHalala,
      estimateHalala: est,
    };
  }
  return {
    ok: false,
    balanceHalala,
    subCreditsHalala,
    totalAvailableHalala,
    estimateHalala: est,
    deficitHalala: est - totalAvailableHalala,
  };
}

/**
 * Estimate the cost of an inference request in halala.
 *
 * Strategy:
 *   - actual prompt tokens × in_rate_halala_per_1m_tok + max_tokens × out_rate
 *   - if rates are not known, fall back to (prompt + max_tokens) × tokenRateHalala
 *   - if neither, fall back to per-minute rate × 1 minute floor
 *
 * Returns a non-negative integer. Caller wraps in checkBalanceGate.
 */
function estimateInferenceCost({
  promptTokens = 0,
  maxCompletionTokens = 0,
  tokenRateHalala = 0,
  inRateHalalaPer1m = 0,
  outRateHalalaPer1m = 0,
  fallbackRateHalalaPerMin = 0,
}) {
  const p = Math.max(0, Math.floor(Number(promptTokens) || 0));
  const c = Math.max(0, Math.floor(Number(maxCompletionTokens) || 0));
  if (inRateHalalaPer1m > 0 || outRateHalalaPer1m > 0) {
    const inCost = Math.ceil((p * inRateHalalaPer1m) / 1_000_000);
    const outCost = Math.ceil((c * outRateHalalaPer1m) / 1_000_000);
    return Math.max(1, inCost + outCost);
  }
  if (tokenRateHalala > 0) {
    // Codex P1 fix (PR #427): tokenRateHalala is halala per 1,000,000 tokens
    // — same TOKEN_RATE_BILLING_UNIT_TOKENS divisor used in v1.js
    // computeTokenCostHalala. Multiplying without the /1M divide overestimates
    // by 1,000,000x and 402-rejects every realistic request.
    return Math.max(1, Math.ceil(((p + c) * tokenRateHalala) / 1_000_000));
  }
  if (fallbackRateHalalaPerMin > 0) {
    return Math.max(1, Math.ceil(fallbackRateHalalaPerMin));
  }
  return 1;
}

/**
 * Atomic settlement. Idempotent on request_id.
 *
 * @returns {object}
 *   - { status: 'settled', costHalala, providerEarnedHalala, balanceAfterHalala }
 *   - { status: 'already_settled', ... }
 *   - throws InsufficientBalanceError on shortfall
 *
 * @param {object} args
 * @param {string} args.requestId      unique per /v1 request (e.g. meteringRequestId)
 * @param {number} args.renterId
 * @param {number|null} args.providerId
 * @param {number} args.costHalala     actual cost (post-inference)
 * @param {string} args.modelId
 * @param {object} args.usageEventRow  optional fields for usage_events row
 * @param {object} args.jobRow         optional fields for jobs row
 * @param {string} args.nowIso         injected for testability
 */
function settleInferenceOnce(db, args) {
  const {
    requestId,
    renterId,
    providerId,
    costHalala,
    modelId,
    usageEventRow = null,
    jobRow = null,
    nowIso = new Date().toISOString(),
  } = args;

  if (!requestId) throw new Error('settleInferenceOnce: requestId required');
  if (typeof renterId !== 'number' && typeof renterId !== 'string') {
    throw new Error('settleInferenceOnce: renterId required');
  }
  const cost = Math.max(0, Math.ceil(Number(costHalala) || 0));
  const providerEarned = providerId ? splitCost(cost).provider : 0;

  // db here is the better-sqlite3 raw handle (db._db or db). Wrap the entire
  // operation in a transaction so a partial write is impossible.
  const tx = db.transaction(() => {
    // Step 1 — idempotency claim.
    const claim = db.prepare(
      `INSERT OR IGNORE INTO billing_attempts
         (request_id, renter_id, provider_id, cost_halala, provider_earned_halala, status, settled_at)
       VALUES (?, ?, ?, ?, ?, 'settled', ?)`
    ).run(requestId, renterId, providerId || null, cost, providerEarned, nowIso);
    if (claim.changes === 0) {
      const existing = db.prepare('SELECT * FROM billing_attempts WHERE request_id = ?').get(requestId);
      return {
        status: 'already_settled',
        existing,
      };
    }

    // Step 2 — drain sub credits, compute PAYG shortfall.
    const subResult = subscriptionService.debitSubscriptionCredits(db, {
      renterId,
      costHalala: cost,
      nowIso,
    });
    const paygShortfall = subResult.shortfall;

    // Step 3 — PAYG debit, rowcount-guarded.
    if (paygShortfall > 0) {
      const r = db.prepare(
        `UPDATE renters
            SET balance_halala = balance_halala - ?,
                updated_at = ?
          WHERE id = ?
            AND balance_halala >= ?`
      ).run(paygShortfall, nowIso, renterId, paygShortfall);
      if (r.changes === 0) {
        // Forget the idempotency claim AND any sub-credit drains so the
        // pre-flight gate or auto-top-up can be re-tried cleanly.
        const renterRow = db.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
        const balance = renterRow ? Number(renterRow.balance_halala || 0) : 0;
        // Throwing inside db.transaction() automatically rolls back the
        // INSERT into billing_attempts AND the sub-credit consumed_halala
        // updates from debitSubscriptionCredits — exactly what we want.
        throw new InsufficientBalanceError(renterId, paygShortfall - balance, balance);
      }
    }

    // Step 4 — provider credit (same transaction).
    if (providerId && providerEarned > 0) {
      db.prepare(
        `UPDATE providers
            SET claimable_earnings_halala = claimable_earnings_halala + ?,
                total_earnings = total_earnings + ?,
                total_earnings_halala = COALESCE(total_earnings_halala, 0) + ?,
                total_jobs = total_jobs + 1
          WHERE id = ?`
      ).run(providerEarned, providerEarned / 100, providerEarned, providerId);
    }

    // Step 5 — usage_events row (writes are best-effort idempotent via the
    // UNIQUE constraint on request_id). settlement_status='settled' instead
    // of the old 'pending' since billing now succeeds atomically.
    if (usageEventRow) {
      try {
        db.prepare(`
          INSERT INTO usage_events (
            renter_id, provider_id, model_id,
            prompt_tokens, completion_tokens,
            prompt_cost_halala, completion_cost_halala, cost_halala,
            provider_payout_halala, dcp_take_halala,
            price_in_halala_per_1m_tok, price_out_halala_per_1m_tok,
            occurred_at, request_id, source, settlement_status
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          renterId,
          providerId || null,
          modelId,
          usageEventRow.promptTokens || 0,
          usageEventRow.completionTokens || 0,
          usageEventRow.promptCostHalala || 0,
          usageEventRow.completionCostHalala || 0,
          cost,
          providerEarned,
          cost - providerEarned,
          usageEventRow.inRateHalalaPer1m || 0,
          usageEventRow.outRateHalalaPer1m || 0,
          nowIso,
          requestId,
          usageEventRow.source || 'v1/chat',
          'settled'
        );
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (!/UNIQUE constraint failed.*usage_events/i.test(msg)) throw err;
        // Already inserted on a prior retry — that's fine.
      }
    }

    // Step 6 — jobs row (INSERT OR IGNORE so retry is a no-op).
    if (jobRow && jobRow.jobId) {
      db.prepare(`
        INSERT OR IGNORE INTO jobs (
          job_id, provider_id, renter_id, job_type, model, status,
          submitted_at, started_at, completed_at,
          duration_minutes, duration_seconds,
          cost_halala, actual_cost_halala, provider_earned_halala,
          prompt_tokens, completion_tokens, result,
          notes, created_at, updated_at, priority
        ) VALUES (?, ?, ?, 'inference', ?, 'completed',
                  ?, ?, ?,
                  0, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?, 8)
      `).run(
        jobRow.jobId, providerId || null, renterId, modelId,
        jobRow.submittedAt || nowIso, jobRow.startedAt || nowIso, jobRow.completedAt || nowIso,
        jobRow.durationSeconds || 0,
        cost, cost, providerEarned,
        usageEventRow?.promptTokens || 0, usageEventRow?.completionTokens || 0, jobRow.result || null,
        jobRow.notes || 'v1:billingService.settleInferenceOnce', nowIso, nowIso
      );
    }

    // Step 7 — renter totals.
    db.prepare(
      `UPDATE renters
          SET total_spent_halala = total_spent_halala + ?,
              total_jobs = total_jobs + 1
        WHERE id = ?`
    ).run(cost, renterId);

    // Final balance for caller (used by autoTopupService to decide trigger).
    const after = db.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    return {
      status: 'settled',
      costHalala: cost,
      providerEarnedHalala: providerEarned,
      paygShortfallHalala: paygShortfall,
      subCreditsDrainedHalala: subResult.drained,
      balanceAfterHalala: after ? Number(after.balance_halala || 0) : 0,
    };
  });

  return tx();
}

module.exports = {
  InsufficientBalanceError,
  checkBalanceGate,
  estimateInferenceCost,
  getEffectiveBalance,
  settleInferenceOnce,
};
