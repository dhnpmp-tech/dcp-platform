/**
 * G47 / Tier 4.16: heartbeat response surfaces providers.is_paused
 *
 * The pause signal must travel backend -> daemon. Backend already toggles
 * providers.is_paused via POST /api/providers/{pause,resume}. The daemon
 * (>= v4.2.6) reads is_paused off the heartbeat response and forces
 * accepting_jobs=false on the next heartbeat tick.
 *
 * Tests:
 *   1. Default (no pause) -> heartbeat response carries is_paused: 0.
 *   2. After toggling is_paused=1 in the row -> heartbeat response carries
 *      is_paused: 1.
 *   3. After toggling back to 0 -> heartbeat response carries is_paused: 0.
 *
 * Backward compat note: the field is always present (0 or 1), never omitted.
 * Daemons older than v4.2.6 ignore unknown response keys, so adding this is
 * a one-way safe change.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

process.env.DC1_DB_PATH = ':memory:';
process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

const db = require('../src/db');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
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

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { ...headers },
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(raw); } catch (_) { json = null; }
        resolve({ status: res.statusCode, body: json, text: raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const PORT = 19947;
let server;
let providerId;
let providerKey;

async function setup() {
  const express = require('express');
  const app = express();

  // Raw body capture for the HMAC heartbeat path (mirrors main app wiring).
  app.use('/api/providers/heartbeat', express.raw({ type: 'application/json' }), (req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
    }
    next();
  });
  app.use(express.json());

  const providersRouter = require('../src/routes/providers');
  app.use('/api/providers', providersRouter);

  await new Promise((resolve) => {
    server = app.listen(PORT, '127.0.0.1', resolve);
  });

  providerKey = 'dcp-prov-g47-' + crypto.randomBytes(8).toString('hex');
  const provResult = db.run(
    `INSERT INTO providers (name, email, api_key, gpu_model, vram_gb, approval_status, status, is_paused, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'approved', 'online', 0, datetime('now'), datetime('now'))`,
    'G47 Test Provider', 'g47@test.com', providerKey, 'RTX 4090', 24
  );
  providerId = provResult.lastInsertRowid;
}

async function teardown() {
  if (server) server.close();
}

function heartbeatBody() {
  return {
    api_key: providerKey,
    gpu_status: { gpu_name: 'RTX 4090', gpu_vram_mib: 24576, gpu_count: 1 },
    provider_ip: '127.0.0.1',
  };
}

async function run() {
  await setup();

  await test('heartbeat response includes is_paused=0 for an unpaused provider', async () => {
    const res = await request('POST', '/api/providers/heartbeat', heartbeatBody());
    assertEqual(res.status, 200, `Expected 200, got ${res.status}: ${res.text}`);
    assert(Object.prototype.hasOwnProperty.call(res.body, 'is_paused'),
      'Response must include is_paused field');
    assertEqual(res.body.is_paused, 0,
      `Expected is_paused=0 for fresh provider, got ${res.body.is_paused}`);
  });

  await test('heartbeat response includes is_paused=1 after pause toggle', async () => {
    db.run('UPDATE providers SET is_paused = 1 WHERE id = ?', providerId);
    const res = await request('POST', '/api/providers/heartbeat', heartbeatBody());
    assertEqual(res.status, 200, `Expected 200, got ${res.status}: ${res.text}`);
    assertEqual(res.body.is_paused, 1,
      `Expected is_paused=1 after pause, got ${res.body.is_paused}`);
  });

  await test('heartbeat response returns is_paused=0 after resume toggle', async () => {
    db.run('UPDATE providers SET is_paused = 0 WHERE id = ?', providerId);
    const res = await request('POST', '/api/providers/heartbeat', heartbeatBody());
    assertEqual(res.status, 200, `Expected 200, got ${res.status}: ${res.text}`);
    assertEqual(res.body.is_paused, 0,
      `Expected is_paused=0 after resume, got ${res.body.is_paused}`);
  });

  await teardown();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
