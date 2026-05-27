'use strict';

/**
 * autoTopupService.js — automatic balance recharge via saved Moyasar card.
 *
 * Industry pattern (AWS / OpenAI / Twilio):
 *   renter sets:
 *     - threshold:    "if my balance drops below X SAR..."
 *     - amount:       "...charge my saved card Y SAR..."
 *     - monthly cap:  "...but never more than Z SAR in a calendar month."
 *
 * Trigger: called by billingService.settleInferenceOnce after every debit,
 *          fire-and-forget. Cheap when disabled (one DB read).
 *
 * Tokenization model: renter saves a card via Moyasar's /v1/tokens flow on
 * the frontend (publishable key). Token id + brand + last4 are POSTed to
 * /api/payments/save-card-token. We then store and reuse the token in
 * POST /v1/payments with source: { type: 'token', token: 'token_xxx' }.
 *
 * Mada cards always require 3DS; the first save handles that. Subsequent
 * token charges MAY require step-up auth depending on issuer policy. If
 * Moyasar returns 3ds_required, the auto-topup attempt is recorded with
 * that status and the user is notified to re-authenticate.
 *
 * Failure handling:
 *   - Soft circuit-breaker: 3 consecutive failures → pause for 24h.
 *   - Monthly cap: tracked in renters.auto_topup_monthly_used_halala; reset
 *     when the renters.auto_topup_monthly_reset_at timestamp crosses the
 *     start of the current calendar month.
 */

const crypto = require('crypto');
const https = require('https');

const MOYASAR_BASE = 'https://api.moyasar.com/v1';
const MAX_CONSECUTIVE_FAILURES = 3;
const PAUSE_AFTER_FAILURES_HOURS = 24;

function getMoyasarSecret() {
  return process.env.MOYASAR_SECRET_KEY || '';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function moyasarPaymentRequest(body) {
  return new Promise((resolve, reject) => {
    const secret = getMoyasarSecret();
    if (!secret) return reject(new Error('MOYASAR_SECRET_KEY not configured'));
    const url = new URL(MOYASAR_BASE + '/payments');
    const bodyStr = JSON.stringify(body);
    const auth = Buffer.from(`${secret}:`).toString('base64');
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || parsed.type || 'Moyasar API error');
            err.statusCode = res.statusCode;
            err.moyasarError = parsed;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid Moyasar response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfCurrentMonthIso(nowIso = new Date().toISOString()) {
  const d = new Date(nowIso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function shouldResetMonthly(renterRow, nowIso) {
  if (!renterRow.auto_topup_monthly_reset_at) return true;
  return new Date(renterRow.auto_topup_monthly_reset_at) < new Date(startOfCurrentMonthIso(nowIso));
}

function isPaused(renterRow, nowIso) {
  if (!renterRow.auto_topup_paused_until) return false;
  return new Date(renterRow.auto_topup_paused_until) > new Date(nowIso);
}

/**
 * Persist renter card token + display fields. Called from the
 * /api/payments/save-card-token route after the frontend has tokenized the
 * card via Moyasar's publishable key.
 */
function saveCardToken(db, renterId, { token, brand, last4, holderName }) {
  if (!token) throw new Error('saveCardToken: token required');
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE renters
       SET moyasar_card_token = ?,
           moyasar_card_brand = ?,
           moyasar_card_last4 = ?,
           moyasar_card_saved_at = ?,
           auto_topup_consecutive_failures = 0,
           auto_topup_paused_until = NULL
     WHERE id = ?
  `).run(token, brand || null, last4 || null, now, renterId);
  return db.prepare(
    'SELECT id, moyasar_card_token, moyasar_card_brand, moyasar_card_last4, moyasar_card_saved_at FROM renters WHERE id = ?'
  ).get(renterId);
}

function readSettings(db, renterId) {
  const r = db.prepare(`
    SELECT id, name, email, balance_halala,
           auto_topup_enabled, auto_topup_threshold_halala,
           auto_topup_amount_halala, auto_topup_monthly_cap_halala,
           auto_topup_monthly_used_halala, auto_topup_monthly_reset_at,
           auto_topup_consecutive_failures, auto_topup_paused_until,
           auto_topup_last_attempt_at,
           moyasar_card_token, moyasar_card_brand, moyasar_card_last4, moyasar_card_saved_at
      FROM renters
     WHERE id = ?
  `).get(renterId);
  return r || null;
}

/**
 * Configure auto-top-up. Validates that amount > threshold (no-op recharge
 * would loop forever) and monthly cap >= amount (caller can't lock
 * themselves out of even one recharge).
 */
function updateSettings(db, renterId, {
  enabled,
  thresholdHalala,
  amountHalala,
  monthlyCapHalala,
}) {
  const t = Math.max(0, Math.floor(Number(thresholdHalala) || 0));
  const a = Math.max(0, Math.floor(Number(amountHalala) || 0));
  const cap = Math.max(0, Math.floor(Number(monthlyCapHalala) || 0));
  const en = enabled ? 1 : 0;
  if (en && a <= 0) return { error: 'INVALID_AMOUNT', message: 'auto_topup_amount must be > 0 when enabled' };
  if (en && t <= 0) return { error: 'INVALID_THRESHOLD', message: 'auto_topup_threshold must be > 0 when enabled' };
  if (en && cap > 0 && cap < a) return { error: 'CAP_BELOW_AMOUNT', message: 'monthly_cap cannot be below single recharge amount' };
  if (en) {
    const r = db.prepare('SELECT moyasar_card_token FROM renters WHERE id = ?').get(renterId);
    if (!r || !r.moyasar_card_token) {
      return { error: 'NO_CARD_ON_FILE', message: 'Save a card via /api/payments/save-card-token before enabling auto-top-up' };
    }
  }
  db.prepare(`
    UPDATE renters
       SET auto_topup_enabled = ?,
           auto_topup_threshold_halala = ?,
           auto_topup_amount_halala = ?,
           auto_topup_monthly_cap_halala = ?
     WHERE id = ?
  `).run(en, t, a, cap, renterId);
  return readSettings(db, renterId);
}

// ── Trigger ──────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget check after a debit. Inspects state, decides whether to
 * trigger a recharge, and (if so) calls Moyasar.
 *
 * Returns one of:
 *   { triggered: false, reason: '<why not>' }
 *   { triggered: true,  status: 'paid'|'failed'|'3ds_required'|'initiated', attemptId, ... }
 *
 * The caller should NEVER await this in a way that blocks the inference
 * response. v1.js fires it after settleInferenceOnce returns.
 */
async function maybeTrigger(db, renterId, { nowIso = new Date().toISOString(), triggerReason = 'post_debit' } = {}) {
  const r = readSettings(db, renterId);
  if (!r) return { triggered: false, reason: 'renter_not_found' };
  if (!r.auto_topup_enabled) return { triggered: false, reason: 'not_enabled' };
  if (!r.moyasar_card_token) return { triggered: false, reason: 'no_card_on_file' };
  if (!r.auto_topup_amount_halala || r.auto_topup_amount_halala <= 0) return { triggered: false, reason: 'no_amount' };
  if (Number(r.balance_halala || 0) >= Number(r.auto_topup_threshold_halala || 0)) {
    return { triggered: false, reason: 'above_threshold' };
  }
  if (isPaused(r, nowIso)) return { triggered: false, reason: 'paused', pausedUntil: r.auto_topup_paused_until };

  // Roll the monthly window forward if the calendar month flipped.
  if (shouldResetMonthly(r, nowIso)) {
    db.prepare(`
      UPDATE renters SET auto_topup_monthly_used_halala = 0,
                         auto_topup_monthly_reset_at = ?
       WHERE id = ?
    `).run(startOfCurrentMonthIso(nowIso), renterId);
    r.auto_topup_monthly_used_halala = 0;
    r.auto_topup_monthly_reset_at = startOfCurrentMonthIso(nowIso);
  }

  // Monthly cap (0 = unlimited).
  if (r.auto_topup_monthly_cap_halala > 0) {
    const remaining = r.auto_topup_monthly_cap_halala - (r.auto_topup_monthly_used_halala || 0);
    if (remaining < r.auto_topup_amount_halala) {
      recordAttempt(db, renterId, {
        amountHalala: r.auto_topup_amount_halala,
        status: 'capped',
        triggerReason,
        balanceBefore: r.balance_halala,
        balanceAfter: r.balance_halala,
        errorMessage: 'Monthly cap reached',
        nowIso,
      });
      return { triggered: false, reason: 'monthly_cap_reached', monthlyUsed: r.auto_topup_monthly_used_halala, monthlyCap: r.auto_topup_monthly_cap_halala };
    }
  }

  // Stamp last_attempt_at NOW so concurrent debits don't race the recharge.
  // (Two near-simultaneous debits could each see balance<threshold and both
  // try to charge. We accept that risk with a 60s soft lock: if last_attempt_at
  // is within 60s, skip.)
  if (r.auto_topup_last_attempt_at) {
    const since = (new Date(nowIso).getTime() - new Date(r.auto_topup_last_attempt_at).getTime()) / 1000;
    if (since < 60) return { triggered: false, reason: 'soft_lock_in_window', secondsSince: since };
  }
  db.prepare('UPDATE renters SET auto_topup_last_attempt_at = ? WHERE id = ?').run(nowIso, renterId);

  const attemptId = `at_${crypto.randomBytes(12).toString('hex')}`;
  const amount = r.auto_topup_amount_halala;

  // Pre-record the attempt as 'initiated' so we never lose it even if the
  // process dies mid-Moyasar-call.
  db.prepare(`
    INSERT INTO auto_topup_attempts
      (id, renter_id, amount_halala, status, trigger_reason, balance_before_halala, created_at)
    VALUES (?, ?, ?, 'initiated', ?, ?, ?)
  `).run(attemptId, renterId, amount, triggerReason, r.balance_halala, nowIso);

  // Build the Moyasar payment.
  const body = {
    amount,
    currency: 'SAR',
    description: `DCP auto-recharge — ${r.name || 'renter'} (${r.email || renterId})`,
    source: { type: 'token', token: r.moyasar_card_token },
    metadata: {
      auto_topup: 'true',
      renter_id: String(renterId),
      auto_topup_attempt_id: attemptId,
      trigger_reason: triggerReason,
    },
  };

  let resp;
  try {
    // Call via module.exports so tests can substitute the network helper.
    resp = await module.exports._moyasarPaymentRequest(body);
  } catch (err) {
    return finalizeFailure(db, renterId, attemptId, amount, err, nowIso);
  }

  const moyasarStatus = String(resp.status || '').toLowerCase();
  if (moyasarStatus === 'paid') {
    return finalizePaid(db, renterId, attemptId, amount, resp, nowIso);
  }
  if (moyasarStatus === 'initiated') {
    // 3DS step-up. Mark the attempt and surface the verification URL so the
    // renter can complete it (notification system handles the email/push).
    db.prepare(`
      UPDATE auto_topup_attempts
         SET status = '3ds_required',
             moyasar_payment_id = ?,
             gateway_response = ?,
             completed_at = ?,
             error_message = ?
       WHERE id = ?
    `).run(resp.id, JSON.stringify(resp), nowIso, '3DS verification required', attemptId);
    return {
      triggered: true,
      status: '3ds_required',
      attemptId,
      moyasarPaymentId: resp.id,
      verificationUrl: resp.source?.transaction_url || null,
    };
  }
  if (moyasarStatus === 'failed') {
    const err = new Error(resp.source?.message || 'Moyasar reported failed');
    err.moyasarError = resp;
    return finalizeFailure(db, renterId, attemptId, amount, err, nowIso);
  }
  // Unknown terminal — record but don't credit. Surface to ops.
  db.prepare(`
    UPDATE auto_topup_attempts
       SET status = 'failed',
           moyasar_payment_id = ?,
           gateway_response = ?,
           completed_at = ?,
           error_message = ?
     WHERE id = ?
  `).run(resp.id || null, JSON.stringify(resp), nowIso, `unexpected_status:${moyasarStatus}`, attemptId);
  return { triggered: true, status: 'failed', attemptId, moyasarStatus, reason: 'unexpected_status' };
}

function finalizePaid(db, renterId, attemptId, amount, resp, nowIso) {
  const tx = db.transaction(() => {
    // Credit balance.
    db.prepare(
      'UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ?, auto_topup_consecutive_failures = 0, auto_topup_paused_until = NULL WHERE id = ?'
    ).run(amount, nowIso, renterId);
    // Track monthly cap usage.
    db.prepare(
      'UPDATE renters SET auto_topup_monthly_used_halala = COALESCE(auto_topup_monthly_used_halala,0) + ? WHERE id = ?'
    ).run(amount, renterId);
    // Mark attempt paid.
    const after = db.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    db.prepare(`
      UPDATE auto_topup_attempts
         SET status = 'paid',
             moyasar_payment_id = ?,
             gateway_response = ?,
             balance_after_halala = ?,
             completed_at = ?
       WHERE id = ?
    `).run(resp.id, JSON.stringify(resp), after?.balance_halala || 0, nowIso, attemptId);
    // Also write a payments row so existing /history endpoints surface it
    // alongside manual top-ups.
    try {
      db.prepare(`
        INSERT OR IGNORE INTO payments
          (payment_id, moyasar_id, renter_id, amount_sar, amount_halala, status,
           source_type, payment_method, description, gateway_response, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, 'paid', 'auto_topup', 'token',
                'Auto-recharge', ?, ?, ?)
      `).run(`pay_at_${attemptId.slice(3)}`, resp.id, renterId,
             amount / 100, amount, JSON.stringify(resp), nowIso, nowIso);
    } catch (_) { /* payments table mirror is best-effort */ }
  });
  tx();
  return {
    triggered: true,
    status: 'paid',
    attemptId,
    moyasarPaymentId: resp.id,
    amountHalala: amount,
  };
}

function finalizeFailure(db, renterId, attemptId, amount, err, nowIso) {
  const errorCode = err.statusCode ? `http_${err.statusCode}` : 'network';
  const errorMessage = String(err.message || 'unknown').slice(0, 500);
  const gatewayResponse = err.moyasarError ? JSON.stringify(err.moyasarError) : null;
  const tx = db.transaction(() => {
    // Increment failure counter; pause if threshold reached.
    const r = db.prepare(
      'SELECT auto_topup_consecutive_failures FROM renters WHERE id = ?'
    ).get(renterId);
    const newFailures = (r?.auto_topup_consecutive_failures || 0) + 1;
    let pausedUntil = null;
    if (newFailures >= MAX_CONSECUTIVE_FAILURES) {
      pausedUntil = new Date(new Date(nowIso).getTime() + PAUSE_AFTER_FAILURES_HOURS * 3600 * 1000).toISOString();
    }
    db.prepare(
      'UPDATE renters SET auto_topup_consecutive_failures = ?, auto_topup_paused_until = ? WHERE id = ?'
    ).run(newFailures, pausedUntil, renterId);
    db.prepare(`
      UPDATE auto_topup_attempts
         SET status = 'failed',
             error_code = ?,
             error_message = ?,
             gateway_response = ?,
             completed_at = ?
       WHERE id = ?
    `).run(errorCode, errorMessage, gatewayResponse, nowIso, attemptId);
  });
  tx();
  return {
    triggered: true,
    status: 'failed',
    attemptId,
    errorCode,
    errorMessage,
  };
}

function recordAttempt(db, renterId, { amountHalala, status, triggerReason, balanceBefore, balanceAfter, errorMessage, nowIso }) {
  const id = `at_${crypto.randomBytes(12).toString('hex')}`;
  db.prepare(`
    INSERT INTO auto_topup_attempts
      (id, renter_id, amount_halala, status, trigger_reason,
       balance_before_halala, balance_after_halala, error_message, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, renterId, amountHalala, status, triggerReason,
    balanceBefore, balanceAfter, errorMessage || null, nowIso, nowIso
  );
  return id;
}

module.exports = {
  maybeTrigger,
  readSettings,
  updateSettings,
  saveCardToken,
  // Exposed for tests.
  _moyasarPaymentRequest: moyasarPaymentRequest,
};
