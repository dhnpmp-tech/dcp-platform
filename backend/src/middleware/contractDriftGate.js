'use strict';

// ── Contract-conformance drift gate (backlog #11a) ─────────────────────────
//
// Mounts express-openapi-validator against the vendored dcp-contracts spec
// (backend/openapi/dcp.yaml) as a RESPONSE-VALIDATION drift gate, in SAFE
// log/report mode.
//
// WHY: the platform did not consume dcp-contracts at all, so spec↔backend
// drift (e.g. the heartbeat tasks/pending_tasks mismatch) was invisible. This
// gate surfaces every response that diverges from the contract WITHOUT
// changing behaviour:
//
//   • validateRequests:  false  — never reject/transform inbound requests.
//   • validateResponses: log via onError, NEVER throw — the original response
//                                 body returns unchanged, so the test suite
//                                 pass/fail is identical with the gate on.
//   • validateSecurity:  false  — auth is handled by the app's own middleware.
//   • ignoreUndocumented:true   — endpoints absent from the contract (admin,
//                                 cron, static files, installers) pass through.
//
// Flipping to ENFORCE (throw on mismatch) is a deliberate FOLLOW-UP (#11b)
// AFTER the spec is reconciled against the drift report this gate produces.
//
// GATED to NODE_ENV==='test' by the caller (server.js) so production is
// untouched — zero prod latency / risk.

const path = require('path');
const { middleware: openApiValidatorMiddleware } = require('express-openapi-validator');

const SPEC_PATH = path.join(__dirname, '..', '..', 'openapi', 'dcp.yaml');

// In-memory collector of unique drift signatures observed this process.
// Keyed by `${method} ${routePath}` so repeated hits of the same endpoint
// collapse to one entry (with a hit counter) — keeps the report readable.
const driftByEndpoint = new Map();

function recordDrift(method, routePath, message) {
  const key = `${method} ${routePath}`;
  const existing = driftByEndpoint.get(key);
  if (existing) {
    existing.count += 1;
    // Keep the set of distinct messages small but representative.
    if (existing.messages.size < 8) existing.messages.add(message);
    return;
  }
  driftByEndpoint.set(key, {
    method,
    routePath,
    count: 1,
    messages: new Set([message]),
  });
}

// Returns a plain, sorted snapshot of collected drift for reporting/asserting.
function getDriftReport() {
  return Array.from(driftByEndpoint.values())
    .map((e) => ({
      method: e.method,
      routePath: e.routePath,
      count: e.count,
      messages: Array.from(e.messages),
    }))
    .sort((a, b) => `${a.method} ${a.routePath}`.localeCompare(`${b.method} ${b.routePath}`));
}

function resetDriftReport() {
  driftByEndpoint.clear();
}

// onError is invoked by express-openapi-validator's response validator ONLY
// when a response fails schema validation AND we supplied this hook. Critically
// (see node_modules/.../openapi.response.validator.js), when onError is present
// the library does NOT re-throw — it returns the original body untouched. So
// logging here is side-effect-only: the real response still goes out, the test
// still sees its expected status/body, and the drift is merely surfaced.
function onResponseValidationError(err, body, req) {
  const method = (req && req.method) || 'UNKNOWN';
  // Prefer the matched express route (e.g. /api/renters/:id/balance) over the
  // raw URL so the report aggregates by endpoint rather than by id.
  const routePath =
    (req && req.openapi && req.openapi.expressRoute) ||
    (req && (req.route && req.route.path)) ||
    (req && (req.originalUrl || req.url)) ||
    'unknown';
  const message = (err && err.message) || 'response did not match contract';

  recordDrift(method, routePath, message);
  // Structured, greppable single line. Stays as console.warn so it never
  // looks like a thrown error and never participates in pass/fail.
  // eslint-disable-next-line no-console
  console.warn(`[contract-drift] ${method} ${routePath}: ${message}`);
}

// Builds the array of express-openapi-validator middlewares to app.use(...).
// Mount AFTER body parsers / rate limiters and BEFORE the route handlers, so
// the library can wrap res.json on the routes it documents.
function buildContractDriftGate() {
  return openApiValidatorMiddleware({
    apiSpec: SPEC_PATH,
    // Do not validate the spec itself at boot — a malformed contract must never
    // crash the backend/test process. (We separately smoke-loaded it; the gate
    // tolerates an imperfect spec because that is exactly what it measures.)
    validateApiSpec: false,
    validateRequests: false,
    validateSecurity: false,
    ignoreUndocumented: true,
    validateResponses: {
      onError: onResponseValidationError,
    },
  });
}

module.exports = {
  SPEC_PATH,
  buildContractDriftGate,
  getDriftReport,
  resetDriftReport,
  // exported for unit testing of the aggregation logic
  _recordDrift: recordDrift,
};
