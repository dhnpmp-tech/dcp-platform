#!/usr/bin/env node
'use strict';

// ── One-shot contract-drift probe (NOT a test) ─────────────────────────────
// Boots the full src/server.js in test env (so the #11a drift gate is mounted),
// seeds a renter + provider in the in-memory DB, then hits the documented
// endpoints so the response-validation gate can observe real backend payloads
// and report spec↔backend drift. Prints the aggregated drift report.
//
// Run:  NODE_ENV=test node scripts/contract-drift-probe.js
//
// This is a developer tool used to PRODUCE backend/openapi/CONFORMANCE-REPORT.md.
// It is intentionally outside the jest suite (it must not affect pass/fail).

process.env.NODE_ENV = 'test';
process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';
process.env.DC1_HMAC_SECRET = process.env.DC1_HMAC_SECRET || 'test-hmac-secret-jest-fixed-32-byte-key-!!';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'test';
process.env.SUPABASE_SERVICE_KEY = 'test';
process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT = '1';

const crypto = require('crypto');
const request = require('supertest');

// Silence the chatty cron loops by neutralising setInterval before requiring.
const _origSetInterval = global.setInterval;
global.setInterval = () => 0;

const db = require('../src/db');
const app = require('../src/server');
const gate = require('../src/middleware/contractDriftGate');

const ADMIN = process.env.DC1_ADMIN_TOKEN;

function seed() {
  const renterKey = `dcp-renter-${crypto.randomBytes(8).toString('hex')}`;
  const providerKey = `dcp-provider-${crypto.randomBytes(8).toString('hex')}`;
  db.run(
    `INSERT INTO renters (name, email, api_key, status, balance_halala, total_spent_halala, total_jobs, created_at)
     VALUES (?, ?, ?, 'active', 5000000, 0, 0, datetime('now'))`,
    'Probe Renter', 'probe-renter@dcp.test', renterKey
  );
  const r = db.get(`SELECT id FROM renters WHERE api_key = ?`, renterKey);
  db.run(
    `INSERT INTO providers (name, email, api_key, gpu_model, vram_gb, gpu_vram_mib, vram_mb,
       approval_status, status, supported_compute_types, vllm_endpoint_url, last_heartbeat, created_at, updated_at)
     VALUES (?, ?, ?, 'RTX 4090', 24, 24576, 24576, 'approved', 'online', 'llm_inference', 'http://127.0.0.1:1/v1', datetime('now'), datetime('now'), datetime('now'))`,
    'Probe Provider', 'probe-provider@dcp.test', providerKey
  );
  const p = db.get(`SELECT id FROM providers WHERE api_key = ?`, providerKey);
  return { renterKey, providerKey, renterId: r && r.id, providerId: p && p.id };
}

async function hit(label, fn) {
  try {
    const res = await fn();
    console.log(`  ${label} -> HTTP ${res.status}`);
  } catch (e) {
    console.log(`  ${label} -> probe error: ${e.message}`);
  }
}

async function main() {
  gate.resetDriftReport();
  let seeded;
  try {
    seeded = seed();
  } catch (e) {
    console.log('seed failed (schema drift in fixtures):', e.message);
    seeded = {};
  }
  const { renterKey, providerKey, renterId, providerId } = seeded;
  // Backend renter/provider routes accept Bearer OR x-renter-key/x-provider-key
  // (or ?key=). Send all so auth succeeds and the gate sees 2xx bodies. (The
  // spec only declares bearerAuth — that auth-scheme gap is itself recorded.)
  const rAuth = renterKey
    ? { Authorization: `Bearer ${renterKey}`, 'X-Renter-Key': renterKey }
    : {};
  const pAuth = providerKey
    ? { Authorization: `Bearer ${providerKey}`, 'X-Provider-Key': providerKey }
    : {};

  console.log('Probing documented endpoints through the full server (gate observing)...');

  await hit('GET /v1/models', () => request(app).get('/v1/models').set(rAuth));
  await hit('GET /api/renters/me', () => request(app).get('/api/renters/me').set(rAuth));
  await hit('GET /api/renters/balance', () => request(app).get('/api/renters/balance').set(rAuth));
  await hit('GET /api/renters/me/spending', () => request(app).get('/api/renters/me/spending').set(rAuth));
  await hit('GET /api/renters/me/keys', () => request(app).get('/api/renters/me/keys').set(rAuth));
  await hit('GET /api/renters/jobs', () => request(app).get('/api/renters/jobs').set(rAuth));
  if (renterId) {
    await hit(`GET /api/renters/${renterId}/balance`, () => request(app).get(`/api/renters/${renterId}/balance`).set(rAuth));
    await hit(`GET /api/renters/${renterId}/transactions`, () => request(app).get(`/api/renters/${renterId}/transactions`).set(rAuth));
    await hit(`GET /api/renters/${renterId}/webhooks`, () => request(app).get(`/api/renters/${renterId}/webhooks`).set(rAuth));
  }
  await hit('GET /api/providers/me', () => request(app).get('/api/providers/me').set(pAuth));
  await hit('GET /api/providers/me/metrics', () => request(app).get('/api/providers/me/metrics').set(pAuth));
  if (providerId) {
    await hit(`GET /api/providers/${providerId}/liveness`, () => request(app).get(`/api/providers/${providerId}/liveness`).set(pAuth));
    await hit(`GET /api/providers/${providerId}/metrics`, () => request(app).get(`/api/providers/${providerId}/metrics`).set(pAuth));
  }
  // Heartbeat (the known tasks/pending_tasks drift). The backend reads api_key
  // from the JSON BODY (no header), so include it there.
  await hit('POST /api/providers/heartbeat', () =>
    request(app).post('/api/providers/heartbeat').set(pAuth).send({
      api_key: providerKey, gpu_utilization: 10, vram_used_mib: 1024, status: 'idle',
    }));
  await hit('GET /api/jobs', () => request(app).get('/api/jobs').set(rAuth));
  await hit('GET /agent/manifest.json', () => request(app).get('/agent/manifest.json'));

  const report = gate.getDriftReport();
  console.log(`\n=== DRIFT REPORT (${report.length} endpoints) ===`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error('probe fatal:', e); process.exit(1); });
