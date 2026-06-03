const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'src/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');

assert(server.includes('countUsableProviders'), 'health endpoints should use earned serving capacity, not only provider status');
assert(server.includes('getProviderCapacitySnapshot'), 'server should centralize provider capacity counters for public health payloads');
assert(server.includes('heartbeating'), 'health payloads should expose heartbeat-claimed providers explicitly');
assert(server.includes('endpoint_reachable'), 'health payloads should expose endpoint reachability explicitly');
assert(server.includes('serving'), 'health payloads should expose verified serving capacity explicitly');
assert(server.includes('capacity_reason'), 'health payloads should include a machine-readable capacity reason');
assert(server.includes('no_verified_serving_provider'), 'health payloads should explain the zero-capacity state without implying WireGuard alone');
assert(server.includes('verified_serving_capacity'), 'health payloads should identify the positive serving state');
assert(server.includes("gates: ['fresh_heartbeat', 'endpoint_reachable', 'verified_online', 'model_coverage']"), 'health payloads should document the serving-capacity gates');
assert(admin.includes('getAdminCapacitySnapshot'), 'admin health should centralize provider capacity counters for operators');
assert(admin.includes('capacity_reason'), 'admin health should expose the machine-readable capacity reason');
assert(admin.includes('no_verified_serving_provider'), 'admin health should preserve the zero-serving-capacity reason');
assert(admin.includes("gates: ['fresh_heartbeat', 'endpoint_reachable', 'verified_online', 'model_coverage']"), 'admin health should expose the serving-capacity gates');

console.log('health capacity static checks passed');
