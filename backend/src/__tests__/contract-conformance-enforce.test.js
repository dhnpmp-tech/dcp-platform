/**
 * Contract-conformance ENFORCE gate (backlog #11b / #12).
 *
 * This is the step that makes dcp-contracts *enforced, not aspirational*: it
 * boots the full src/server.js in test env (so the #11a response-validation
 * drift gate is mounted), seeds a realistic renter + provider, drives the
 * documented endpoints through the real server, and ASSERTS that none of the
 * core documented endpoints drift from the spec. A future change that makes a
 * response diverge from backend/openapi/dcp.yaml fails CI here.
 *
 * Scope: the gate validates whatever STATUS the endpoint actually returns
 * against the spec, so this catches both response-shape drift AND undocumented
 * status codes. We drive the happy path (valid keys + seeded data) so the core
 * endpoints return their documented 2xx.
 *
 * KNOWN-PENDING endpoints are explicitly allowlisted below (driven, but not
 * asserted) so the gap is visible and tracked rather than silently uncovered.
 * The allowlist should shrink as the remaining spec gaps are reconciled.
 */
'use strict';

// Must be set BEFORE requiring db/server (they read env at module load).
process.env.NODE_ENV = 'test';
process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';
process.env.DC1_HMAC_SECRET = process.env.DC1_HMAC_SECRET || 'test-hmac-secret-jest-fixed-32-byte-key-!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';
process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT = '1';

const crypto = require('crypto');
const request = require('supertest');

// Silence the chatty cron loops by neutralising setInterval before requiring
// the server (mirrors scripts/contract-drift-probe.js). Restored in afterAll.
const _origSetInterval = global.setInterval;
global.setInterval = () => 0;

const db = require('../db');
const app = require('../server');
const gate = require('../middleware/contractDriftGate');

// Endpoints known to still drift, with the reason + tracking. Driven for
// coverage but excluded from the failing assertion. KEEP THIS LIST SHRINKING.
//   key form: `${method} ${routePath}` as recorded by the gate (express route).
const KNOWN_PENDING = new Map([
  // Heartbeat 500s in the :memory: schema because migration 008's
  // `pending_provider_tasks` table isn't created by the inline test schema.
  // Seeding the full migration set to validate the heartbeat 2xx body is a
  // tracked #12 coverage item.
  ['POST /api/providers/heartbeat', 'heartbeat needs migration tables seeded (#12 coverage)'],
  ['POST /api/providers/:provider_id/heartbeat', 'heartbeat needs migration tables seeded (#12 coverage)'],
  // The spec documents only the manifest success body; the auth-gated 401 (and
  // 4xx error responses generally) are undocumented — error-response coverage
  // is deferred to a follow-up spec pass.
  ['GET /agent/manifest.json', '401/4xx error responses undocumented (deferred spec coverage)'],
  ['GET /agent/manifest', '401/4xx error responses undocumented (deferred spec coverage)'],
]);

let seeded = {};

beforeAll(() => {
  gate.resetDriftReport();
  const renterKey = `dcp-renter-${crypto.randomBytes(8).toString('hex')}`;
  const providerKey = `dcp-provider-${crypto.randomBytes(8).toString('hex')}`;
  db.run(
    `INSERT INTO renters (name, email, api_key, status, balance_halala, total_spent_halala, total_jobs, created_at)
     VALUES (?, ?, ?, 'active', 5000000, 0, 0, datetime('now'))`,
    'Enforce Renter', 'enforce-renter@dcp.test', renterKey
  );
  const r = db.get('SELECT id FROM renters WHERE api_key = ?', renterKey);
  db.run(
    `INSERT INTO providers (name, email, api_key, gpu_model, vram_gb, gpu_vram_mib, vram_mb,
       approval_status, status, supported_compute_types, vllm_endpoint_url, last_heartbeat, created_at, updated_at)
     VALUES (?, ?, ?, 'RTX 4090', 24, 24576, 24576, 'approved', 'online', 'llm_inference', 'http://127.0.0.1:1/v1', datetime('now'), datetime('now'), datetime('now'))`,
    'Enforce Provider', 'enforce-provider@dcp.test', providerKey
  );
  const p = db.get('SELECT id FROM providers WHERE api_key = ?', providerKey);
  seeded = { renterKey, providerKey, renterId: r && r.id, providerId: p && p.id };
});

afterAll(() => {
  global.setInterval = _origSetInterval;
});

describe('contract conformance — documented endpoints do not drift from dcp.yaml', () => {
  // Send Bearer AND x-*-key so auth succeeds regardless of per-route scheme.
  const rAuth = () => ({ Authorization: `Bearer ${seeded.renterKey}`, 'X-Renter-Key': seeded.renterKey });
  const pAuth = () => ({ Authorization: `Bearer ${seeded.providerKey}`, 'X-Provider-Key': seeded.providerKey });

  it('drives the documented surface and asserts zero unexpected drift', async () => {
    const { renterId, providerId, providerKey } = seeded;
    expect(renterId).toBeTruthy();
    expect(providerId).toBeTruthy();

    // ── Core documented endpoints (must conform) ──
    await request(app).get('/v1/models').set(rAuth());
    await request(app).get('/api/renters/me').set(rAuth());
    await request(app).get('/api/renters/balance').set(rAuth());
    await request(app).get('/api/renters/me/spending').set(rAuth());
    await request(app).get('/api/renters/me/keys').set(rAuth());
    await request(app).get('/api/renters/jobs').set(rAuth());
    await request(app).get(`/api/renters/${renterId}/balance`).set(rAuth());
    await request(app).get(`/api/renters/${renterId}/transactions`).set(rAuth());
    await request(app).get(`/api/renters/${renterId}/webhooks`).set(rAuth());
    await request(app).get('/api/providers/me').set(pAuth());
    await request(app).get('/api/providers/me/metrics').set(pAuth());
    await request(app).get(`/api/providers/${providerId}/liveness`).set(pAuth());
    await request(app).get(`/api/providers/${providerId}/metrics`).set(pAuth());
    await request(app).get('/api/jobs').set(rAuth());

    // ── Known-pending endpoints (driven for coverage, excluded from assertion) ──
    await request(app).post('/api/providers/heartbeat').set(pAuth()).send({
      api_key: providerKey, gpu_utilization: 10, vram_used_mib: 1024, status: 'idle',
    });
    await request(app).get('/agent/manifest.json');

    const report = gate.getDriftReport();
    const unexpected = report.filter((e) => !KNOWN_PENDING.has(`${e.method} ${e.routePath}`));

    if (unexpected.length > 0) {
      // Surface the exact drift so a failure is actionable.
      // eslint-disable-next-line no-console
      console.error('Unexpected contract drift:\n' + JSON.stringify(unexpected, null, 2));
    }
    expect(unexpected).toEqual([]);
  });

  it('the known-pending allowlist is documented and not silently growing', () => {
    // Guardrail: every allowlisted entry must carry a reason, and the list is
    // small + intentional. Bump this number only with a deliberate decision.
    expect(KNOWN_PENDING.size).toBeLessThanOrEqual(4);
    for (const [key, reason] of KNOWN_PENDING) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(10);
      expect(key).toMatch(/^[A-Z]+ \//);
    }
  });
});
