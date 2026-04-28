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

module.exports = {
  safeErrorPayload,
  // exported for tests
  _isProduction: isProduction,
};
