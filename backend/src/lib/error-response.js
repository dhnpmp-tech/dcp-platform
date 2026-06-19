'use strict';

/**
 * Audit L2 — generify 5xx error payloads in production.
 *
 * Returns a JSON-safe payload that exposes the raw error message in
 * non-production environments (where you actually want to debug) and a
 * generic fallback in production (so we don't ship stack traces, internal
 * SQL strings, or third-party API error bodies to anonymous callers).
 *
 * Always log the full error server-side via console.error before calling
 * this — `safeErrorPayload` does not log.
 *
 * Usage:
 *   try {
 *     ...
 *   } catch (err) {
 *     console.error('[my-route] failed:', err);
 *     return res.status(500).json(safeErrorPayload(err, 'Operation failed'));
 *   }
 */

function isProduction() {
  // We treat anything that isn't explicitly 'development' / 'test' as prod.
  // PM2 on the VPS runs without NODE_ENV set in some configurations, and we
  // would rather default to the safer behaviour there.
  const env = (process.env.NODE_ENV || '').toLowerCase();
  return env !== 'development' && env !== 'test';
}

function safeErrorPayload(err, fallback) {
  const safeFallback = typeof fallback === 'string' && fallback ? fallback : 'Internal server error';
  if (isProduction()) {
    return { error: safeFallback };
  }
  const detail = err && (err.message || err.toString && err.toString());
  return detail ? { error: safeFallback, details: String(detail) } : { error: safeFallback };
}

// Where an agent funds its prepaid wallet. Overridable for the V2 wallet route
// without touching every call site.
const TOPUP_URL = process.env.DCP_TOPUP_URL || 'https://dcp.sa/renter/wallet';

/**
 * Agent-first HTTP 402 body for "the prepaid wallet can't cover this quote".
 *
 * Shaped to satisfy the OpenAPI `PaymentRequiredError` schema
 * (error / message / currency / required_halala / balance_halala / topup_url)
 * AND the machine-readable contract an autonomous agent retries against
 * (error + code 'insufficient_balance', required_sar / balance_sar).
 *
 * It ALSO keeps the legacy nested `error` object that the pre-existing
 * pods/volumes handlers returned, so any caller already keying off
 * `body.error.code === 'insufficient_balance'` keeps working. Top-level
 * `error` is the documented string 'insufficient_balance'; the legacy nested
 * object moves to `error_detail`.
 *
 * @param {object} args
 * @param {number} args.requiredHalala  Quote the wallet must cover, in halala.
 * @param {number} args.balanceHalala   Current wallet balance, in halala.
 * @param {string} [args.message]       Human-readable, agent-facing explanation.
 * @returns {object} 402 JSON body.
 */
function paymentRequiredPayload({ requiredHalala, balanceHalala, message } = {}) {
  const reqHalala = Math.max(0, Math.round(Number(requiredHalala) || 0));
  const balHalala = Math.max(0, Math.round(Number(balanceHalala) || 0));
  const requiredSar = Number((reqHalala / 100).toFixed(2));
  const balanceSar = Number((balHalala / 100).toFixed(2));
  const humanMessage = typeof message === 'string' && message
    ? message
    : `Wallet balance ${balanceSar} SAR is below the ${requiredSar} SAR estimate for this request. Top up and retry.`;

  return {
    // Documented (OpenAPI) + machine-readable agent contract.
    error: 'insufficient_balance',
    code: 'insufficient_balance',
    message: humanMessage,
    currency: 'SAR',
    required_sar: requiredSar,
    balance_sar: balanceSar,
    required_halala: reqHalala,
    balance_halala: balHalala,
    topup_url: TOPUP_URL,
    retryable: true, // an agent CAN retry once funded — distinct from a hard 4xx
    // Back-compat: the shape the old handlers returned under `error` (which was
    // an object). Preserved here so existing callers don't break on the string.
    error_detail: {
      message: humanMessage,
      type: 'insufficient_balance',
      code: 'insufficient_balance',
      status: 402,
      retryable: true,
    },
  };
}

module.exports = {
  safeErrorPayload,
  paymentRequiredPayload,
  TOPUP_URL,
  // exported for tests
  _isProduction: isProduction,
};
