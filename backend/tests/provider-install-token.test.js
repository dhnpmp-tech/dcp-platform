/**
 * POST /v1/provider/install-token — PDPL compliance validation + persistence.
 *
 * Covers the 7 scenarios from the provider-flow-migration plan:
 *   1. empty body + unconsented → 400 pdpl_consent_required
 *   2. empty body + consented   → 201, no compliance columns touched
 *   3. partial compliance body  → 400 missing_fields
 *   4. invalid phone            → 400 invalid_phone
 *   5. pdplConsent=false        → 400 consent_required
 *   6. happy path               → 201, row persisted, pdpl_consented_at set
 *   7. re-consent               → 201, full_name updated, pdpl_consented_at unchanged
 *
 * Also covers GET /v1/provider/me:
 *   a. unconsented provider returns nulls
 *   b. reflects full_name + pdpl_consented_at after consent
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

process.env.DC1_DB_PATH = ':memory:';
process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT = '1';
process.env.DC1_ADMIN_TOKEN = 'test-admin-pdpl';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

const db = require('../src/db');

// Ensure compliance columns exist on the in-memory DB. The core schema
// creates the providers table; migration 005 is additive DDL.
try {
  db._db.exec(`
    ALTER TABLE providers ADD COLUMN full_name TEXT;
    ALTER TABLE providers ADD COLUMN phone TEXT;
    ALTER TABLE providers ADD COLUMN city TEXT;
    ALTER TABLE providers ADD COLUMN country TEXT;
    ALTER TABLE providers ADD COLUMN pdpl_consented_at TIMESTAMP;
  `);
} catch (e) {
  // Columns may already exist if the base schema was updated; ignore.
}

const express = require('express');
const v1WizardRouter = require('../src/routes/v1-wizard');

const app = express();
app.use(express.json());
app.use('/v1', v1WizardRouter);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    if (process.env.VERBOSE) console.error(e);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function request(server, method, path, body, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, path, method, headers: { ...headers } };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch { /* non-json */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let nextProviderId = 1;
function seedProvider({ pdpl_consented_at = null, full_name = null } = {}) {
  const apiKey = `dcpk_test_${crypto.randomBytes(6).toString('hex')}`;
  const email = `p${nextProviderId++}@test.local`;
  db.run(
    `INSERT INTO providers (name, email, api_key, status, full_name, pdpl_consented_at)
     VALUES (?, ?, ?, 'approved', ?, ?)`,
    email, email, apiKey, full_name, pdpl_consented_at,
  );
  const row = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
  return { apiKey, providerId: row.id };
}

function bearer(apiKey) { return { Authorization: `Bearer ${apiKey}` }; }

const VALID = {
  fullName: 'Peter Test',
  phone: '+966501234567',
  city: 'Riyadh',
  country: 'SA',
  pdplConsent: true,
};

async function run() {
  const server = app.listen(0);

  await test('empty body + unconsented → 400 pdpl_consent_required', async () => {
    const { apiKey } = seedProvider({ pdpl_consented_at: null });
    const res = await request(server, 'POST', '/v1/provider/install-token', {}, bearer(apiKey));
    assertEqual(res.status, 400);
    assertEqual(res.body.error.code, 'pdpl_consent_required');
  });

  await test('empty body + already-consented → 201, compliance columns untouched', async () => {
    const ts = '2026-04-20 00:00:00';
    const { apiKey, providerId } = seedProvider({ pdpl_consented_at: ts, full_name: 'Original' });
    const res = await request(server, 'POST', '/v1/provider/install-token', {}, bearer(apiKey));
    assertEqual(res.status, 201);
    assert(/^dcpt_/.test(res.body.install_token), 'token prefix');
    const row = db.get('SELECT full_name, pdpl_consented_at FROM providers WHERE id = ?', providerId);
    assertEqual(row.full_name, 'Original');
    assertEqual(row.pdpl_consented_at, ts);
  });

  await test('partial compliance body → 400 missing_fields', async () => {
    const { apiKey } = seedProvider({ pdpl_consented_at: null });
    const res = await request(server, 'POST', '/v1/provider/install-token',
      { fullName: 'P', phone: '+966501234567', pdplConsent: true }, bearer(apiKey));
    assertEqual(res.status, 400);
    assertEqual(res.body.error.code, 'missing_fields');
    assert(Array.isArray(res.body.error.fields) && res.body.error.fields.includes('city'),
      'fields includes city');
  });

  await test('invalid phone → 400 invalid_phone', async () => {
    const { apiKey } = seedProvider({ pdpl_consented_at: null });
    const res = await request(server, 'POST', '/v1/provider/install-token',
      { ...VALID, phone: 'notaphone' }, bearer(apiKey));
    assertEqual(res.status, 400);
    assertEqual(res.body.error.code, 'invalid_phone');
  });

  await test('pdplConsent=false → 400 consent_required', async () => {
    const { apiKey } = seedProvider({ pdpl_consented_at: null });
    const res = await request(server, 'POST', '/v1/provider/install-token',
      { ...VALID, pdplConsent: false }, bearer(apiKey));
    assertEqual(res.status, 400);
    assertEqual(res.body.error.code, 'consent_required');
  });

  await test('happy path → 201, row persisted, pdpl_consented_at recent', async () => {
    const { apiKey, providerId } = seedProvider({ pdpl_consented_at: null });
    const t0 = Date.now();
    const res = await request(server, 'POST', '/v1/provider/install-token', VALID, bearer(apiKey));
    assertEqual(res.status, 201);
    const row = db.get('SELECT * FROM providers WHERE id = ?', providerId);
    assertEqual(row.full_name, 'Peter Test');
    assertEqual(row.phone, '+966501234567');
    assertEqual(row.city, 'Riyadh');
    assertEqual(row.country, 'SA');
    assert(row.pdpl_consented_at, 'pdpl_consented_at set');
    // SQLite datetime('now') is UTC 'YYYY-MM-DD HH:MM:SS'; verify within 5 s.
    const consentMs = new Date(row.pdpl_consented_at.replace(' ', 'T') + 'Z').getTime();
    assert(Math.abs(consentMs - t0) < 5000, `pdpl_consented_at within 5s of t0 (delta=${consentMs - t0}ms)`);
  });

  await test('re-consent preserves pdpl_consented_at (audit immutability)', async () => {
    const originalTs = '2026-04-20 00:00:00';
    const { apiKey, providerId } = seedProvider({ pdpl_consented_at: originalTs, full_name: 'Old' });
    const res = await request(server, 'POST', '/v1/provider/install-token', VALID, bearer(apiKey));
    assertEqual(res.status, 201);
    const row = db.get('SELECT full_name, pdpl_consented_at FROM providers WHERE id = ?', providerId);
    assertEqual(row.full_name, 'Peter Test');          // overwritten
    assertEqual(row.pdpl_consented_at, originalTs);   // unchanged
  });

  await test('GET /v1/provider/me — unconsented → null fields', async () => {
    const { apiKey, providerId } = seedProvider({ pdpl_consented_at: null });
    const res = await request(server, 'GET', '/v1/provider/me', null, bearer(apiKey));
    assertEqual(res.status, 200);
    assertEqual(res.body.provider_id, providerId);
    assertEqual(res.body.pdpl_consented_at, null);
    assertEqual(res.body.full_name, null);
  });

  await test('GET /v1/provider/me — reflects consent after install-token', async () => {
    const { apiKey } = seedProvider({ pdpl_consented_at: null });
    const postRes = await request(server, 'POST', '/v1/provider/install-token', VALID, bearer(apiKey));
    assertEqual(postRes.status, 201);
    const me = await request(server, 'GET', '/v1/provider/me', null, bearer(apiKey));
    assertEqual(me.status, 200);
    assert(me.body.pdpl_consented_at, 'pdpl_consented_at populated');
    assertEqual(me.body.full_name, 'Peter Test');
    assertEqual(me.body.country, 'SA');
  });

  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
