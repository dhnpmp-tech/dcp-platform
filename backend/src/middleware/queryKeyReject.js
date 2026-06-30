'use strict';

// C1 (Nexus/Tito audit) — query-param API key deprecation + rejection.
//
// Background: every endpoint that accepts ?key= / ?renter_key= / ?provider_key=
// / ?api_key= leaks the credential into browser history, server access logs,
// referrer headers, and proxy logs. Phase 1 (server.js) attaches
// Deprecation/Sunset/Link headers + rate-limited telemetry when a query-param
// credential is observed. Phase 2 (rejectRenterQueryParamKey) REFUSES the
// request on routes whose frontend call sites have finished migrating to the
// x-renter-key header.
//
// Extracted from server.js so the rejection contract is unit-testable without
// importing the whole app (which boots the DB + every route).

const RENTER_KEY_QUERY_NAMES = ['renter_key'];
const PROVIDER_KEY_QUERY_NAMES = ['provider_key'];
const SHARED_KEY_QUERY_NAME = 'key';

function detectQueryParamKeys(req) {
  const hasRenterKey = RENTER_KEY_QUERY_NAMES.some(n => req.query[n]);
  const hasProviderKey = PROVIDER_KEY_QUERY_NAMES.some(n => req.query[n]);
  const hasSharedKey = !!req.query[SHARED_KEY_QUERY_NAME];
  return { hasRenterKey, hasProviderKey, hasSharedKey, any: hasRenterKey || hasProviderKey || hasSharedKey };
}

// Reject API keys in query params on renter-facing endpoints where the frontend
// was already fixed (DCP-712). Provider heartbeat/daemon routes are excluded.
function rejectRenterQueryParamKey(req, res, next) {
  const { hasRenterKey, hasSharedKey } = detectQueryParamKeys(req);
  if (hasRenterKey || hasSharedKey) {
    console.warn(
      `[security] API key in URL query params rejected: ${req.method} ${req.path} ip=${req.ip || 'unknown'}`
    );
    return res.status(400).json({
      error: 'API keys must be sent via header (X-Renter-Key), not URL query parameters. This prevents credential exposure in server logs and browser history.',
      hint: 'Set the "X-Renter-Key" request header instead of a ?key= or ?renter_key= query parameter.',
    });
  }
  next();
}

module.exports = {
  RENTER_KEY_QUERY_NAMES,
  PROVIDER_KEY_QUERY_NAMES,
  SHARED_KEY_QUERY_NAME,
  detectQueryParamKeys,
  rejectRenterQueryParamKey,
};