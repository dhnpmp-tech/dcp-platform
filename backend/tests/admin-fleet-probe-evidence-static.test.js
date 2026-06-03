const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adminRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');
const endpointStart = adminRoute.indexOf("router.get('/fleet/probe-evidence'");
const endpointEnd = adminRoute.indexOf("router.get('/fleet/health'", endpointStart);
assert(endpointStart >= 0, 'admin route should expose a read-only fleet probe evidence endpoint');
assert(endpointEnd > endpointStart, 'fleet probe evidence endpoint should sit before fleet health');
const endpointSource = adminRoute.slice(endpointStart, endpointEnd);

assert(endpointSource.includes("router.get('/fleet/probe-evidence'"), 'admin route should expose a read-only fleet probe evidence endpoint');
assert(endpointSource.includes('ensureProviderVerificationSchema(db)'), 'probe evidence endpoint should initialize provider verification schema best-effort');
assert(endpointSource.includes('getVerificationMap(db)'), 'probe evidence endpoint should merge canonical earned-online verifier state');
assert(endpointSource.includes('parseCachedModelsSafe(row.cached_models)'), 'probe evidence endpoint should parse cached model evidence');
assert(adminRoute.includes('classifyProbeEvidence'), 'probe evidence endpoint should classify provider recovery focus');
assert(endpointSource.includes('endpoint_probe_error'), 'probe evidence endpoint should include endpoint probe errors');
assert(endpointSource.includes('endpoint_probe_failures'), 'probe evidence endpoint should include consecutive endpoint probe failures');
assert(endpointSource.includes('focus_code'), 'probe evidence endpoint should return machine-readable focus codes');
assert(endpointSource.includes('recommended_next_action'), 'probe evidence endpoint should return human/agent next actions');
assert(endpointSource.includes('target_model_hint'), 'probe evidence endpoint should return a target model hint for the next proof');
assert(endpointSource.includes('operator_probe_command'), 'probe evidence endpoint should return a copy-ready non-mutating proof command');
assert(adminRoute.includes('DCP_RENTER_API_KEY'), 'probe evidence command should require a renter key placeholder without embedding secrets');
assert(endpointSource.includes('provider_count > 0'), 'probe evidence endpoint should define the positive serving proof expected before publication');
assert(endpointSource.includes('gates: classification.gates'), 'probe evidence endpoint should return gate-level evidence');
assert(endpointSource.includes('route_blocked'), 'probe evidence summary should count endpoint-route blockers');
assert(endpointSource.includes('inference_blocked'), 'probe evidence summary should count earned-inference blockers');
assert(endpointSource.includes('model_gap'), 'probe evidence summary should count model coverage blockers');
assert(endpointSource.includes('focus_counts'), 'probe evidence summary should count recovery focus groups');
assert(endpointSource.includes('LIMIT ?'), 'probe evidence endpoint should use bounded SQL reads');
assert(endpointSource.includes('Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200)'), 'probe evidence endpoint should clamp the requested limit');

[
  "router.post('/fleet/probe-evidence'",
  "router.patch('/fleet/probe-evidence'",
  "router.put('/fleet/probe-evidence'",
  "router.delete('/fleet/probe-evidence'",
  'runVerificationOnce(',
  'probeProviderEndpoint(',
  'UPDATE providers',
  'UPDATE provider_verification',
  'DELETE FROM providers',
  'DELETE FROM provider_verification',
].forEach((unsafePattern) => {
  assert(!endpointSource.includes(unsafePattern), `probe evidence endpoint should not perform live probes or mutations: ${unsafePattern}`);
});

console.log('admin fleet probe evidence static checks passed');
