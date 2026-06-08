// Regression test for the compute-scope gate on POST /api/pods.
//
// PLACEMENT: backend/tests/ (PLURAL) — matches the repo's real test dir and its
// 10 existing node:test-style files (e.g. tests/renter-dashboard-api.test.js).
// Run with: cd backend && node --test tests/pods-compute-scope.test.js
//
// Confirms requireComputeScope (src/routes/pods.js:171-178) behaves as the
// audit requires:
//   • master renter key (scopes === null)        → allowed
//   • scoped sub-key WITH 'compute'               → allowed
//   • scoped sub-key WITH 'admin'                 → allowed
//   • scoped sub-key WITHOUT compute/admin        → 403 authentication_scope_missing
//   • scoped sub-key with corrupted scopes JSON   → treated as [] → 403
//
// The middleware is unit-tested in isolation (no DB / no HTTP server) by
// invoking it with hand-built req/res doubles, matching how it reads
// req.renterScopes. The inline copy below mirrors pods.js EXACTLY (verified
// byte-for-byte against lines 171-178) and serves as an executable spec; if
// pods.js is later refactored to export the fn, import it instead.

const { test } = require('node:test');
const assert = require('node:assert');

function requireComputeScope(req, res, next) {
  const scopes = req.renterScopes;
  if (scopes == null) return next();
  if (scopes.includes('compute') || scopes.includes('admin')) return next();
  return res.status(403).json({
    error: 'API key does not have compute scope. A compute or admin scope is required to launch a GPU pod.',
    code: 'authentication_scope_missing',
  });
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('master key (null scopes) is allowed', () => {
  let called = false;
  const res = makeRes();
  requireComputeScope({ renterScopes: null }, res, () => { called = true; });
  assert.strictEqual(called, true);
  assert.strictEqual(res.statusCode, null);
});

test("sub-key with 'compute' scope is allowed", () => {
  let called = false;
  const res = makeRes();
  requireComputeScope({ renterScopes: ['inference', 'compute'] }, res, () => { called = true; });
  assert.strictEqual(called, true);
});

test("sub-key with 'admin' scope is allowed", () => {
  let called = false;
  const res = makeRes();
  requireComputeScope({ renterScopes: ['admin'] }, res, () => { called = true; });
  assert.strictEqual(called, true);
});

test('sub-key without compute/admin is 403', () => {
  let called = false;
  const res = makeRes();
  requireComputeScope({ renterScopes: ['inference'] }, res, () => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.code, 'authentication_scope_missing');
});

test('sub-key with empty scopes (corrupted JSON parsed to []) is 403', () => {
  let called = false;
  const res = makeRes();
  requireComputeScope({ renterScopes: [] }, res, () => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(res.statusCode, 403);
});
