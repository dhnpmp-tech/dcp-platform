/**
 * DC1 Backend API — Core Integration Test Suite (DCP-35)
 *
 * Covers: Provider API, Renter API, Admin API
 * Runner: Jest + Supertest (--runInBand, shared SQLite DB)
 * DB: same providers.db used by tests — cleanDb() wipes all test data before each test
 */

'use strict';

// DC1_DB_PATH and DC1_ADMIN_TOKEN are set by tests/jest-setup.js (setupFiles)
// Kept here as a fallback when running this file directly outside Jest
if (!process.env.DC1_DB_PATH) process.env.DC1_DB_PATH = ':memory:';
if (!process.env.DC1_ADMIN_TOKEN) process.env.DC1_ADMIN_TOKEN = 'test-admin-token-jest';
if (!process.env.PROVIDER_REACTIVATION_TOKEN_SECRET) process.env.PROVIDER_REACTIVATION_TOKEN_SECRET = 'test-reactivation-secret';
// This suite validates API contracts, not rate-limit behavior; disable limiter state carry-over.
if (!process.env.DISABLE_RATE_LIMIT) process.env.DISABLE_RATE_LIMIT = '1';

const request = require('supertest');
const express = require('express');
const db = require('../../src/db');

// ── Build a minimal Express app with all routes under test ────────────────────
function createTestApp() {
  const app = express();
  app.use(express.json());

  app.use('/api/providers', require('../../src/routes/providers'));
  app.use('/api/renters',   require('../../src/routes/renters'));
  app.use('/api/admin',     require('../../src/routes/admin'));
  app.use('/api/health',    require('../../src/routes/public-health'));

  return app;
}

const app = createTestApp();
const ADMIN_TOKEN = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanDb() {
  try { db.run('DELETE FROM inference_stream_events'); } catch (_) {}
  try { db.run('DELETE FROM daemon_events'); } catch (_) {}
  try { db.run('DELETE FROM heartbeat_log'); } catch (_) {}
  try { db.run('DELETE FROM jobs'); }         catch (_) {}
  try { db.run('DELETE FROM renters'); }      catch (_) {}
  try { db.run('DELETE FROM providers'); }    catch (_) {}
}

async function registerProvider(overrides = {}) {
  const payload = {
    name:      overrides.name      || 'Test Provider',
    email:     overrides.email     || `prov-${Date.now()}-${Math.random().toString(36).slice(2)}@dc1.test`,
    gpu_model: overrides.gpu_model || 'RTX 4090',
    os:        overrides.os        || 'Linux',
    ...overrides,
  };
  return request(app).post('/api/providers/register').send(payload);
}

async function registerRenter(overrides = {}) {
  const payload = {
    name:  overrides.name  || 'Test Renter',
    email: overrides.email || `renter-${Date.now()}-${Math.random().toString(36).slice(2)}@dc1.test`,
    ...overrides,
  };
  return request(app).post('/api/renters/register').send(payload);
}

// 2026-05-09: register only stages a pending row. To get a usable api_key
// for downstream tests we have to simulate the magic-link finalization that
// runs in routes/auth.js. We bypass the email round-trip by writing the
// finalized state directly via the same logic.
function finalizeRenterForTest(email) {
  const crypto = require('crypto');
  const realKey = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  db.run(
    `UPDATE renters
        SET api_key = ?,
            status = 'active',
            balance_halala = balance_halala + 1000,
            updated_at = ?
      WHERE LOWER(email) = LOWER(?) AND status = 'pending'`,
    realKey, now, email
  );
  return realKey;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => cleanDb());
afterAll(() => cleanDb());

// =============================================================================
// PROVIDER API
// =============================================================================

describe('Provider API — POST /api/providers/register', () => {
  it('returns 200 with api_key and provider_id on success', async () => {
    const res = await registerProvider();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.api_key).toBe('string');
    expect(res.body.api_key).toMatch(/^dc1-provider-/);
    expect(res.body.provider_id).toBeDefined();
  });

  it('returns 409 for duplicate email', async () => {
    const email = `dup-${Date.now()}@dc1.test`;
    await registerProvider({ email });
    const res = await registerProvider({ email });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/providers/register').send({ name: 'No GPU' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/providers/register')
      .send({ name: 'Test', gpu_model: 'RTX 4090', os: 'Linux' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when gpu_model is missing', async () => {
    const res = await request(app)
      .post('/api/providers/register')
      .send({ name: 'Test', email: 'test@dc1.test', os: 'Linux' });
    expect(res.status).toBe(400);
  });

  it('accepts human-readable OS labels and stores canonical OS values', async () => {
    const res = await registerProvider({ os: 'Ubuntu 22.04' });
    expect(res.status).toBe(200);
    const row = db.get('SELECT os FROM providers WHERE id = ?', res.body.provider_id);
    expect(row.os).toBe('linux');
  });

  it('returns installer_url on canonical setup download route that works for lowercase os', async () => {
    const res = await registerProvider({ os: 'linux' });
    expect(res.status).toBe(200);
    expect(res.body.installer_url).toMatch(
      /^\/api\/providers\/download\/setup\?key=dc1-provider-[a-f0-9]+&os=linux$/
    );

    const setupRes = await request(app).get(res.body.installer_url);
    expect(setupRes.status).toBe(200);
    expect(typeof setupRes.text).toBe('string');
    expect(setupRes.text.length).toBeGreaterThan(0);
  });

  it('accepts location_country payload and persists it as location', async () => {
    const res = await registerProvider({ location_country: 'Saudi Arabia' });
    expect(res.status).toBe(200);

    const row = db.get('SELECT location FROM providers WHERE id = ?', res.body.provider_id);
    expect(row.location).toBe('Saudi Arabia');
  });
});

describe('Provider API — GET /api/providers/me', () => {
  it('returns provider data for valid API key', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const res = await request(app).get(`/api/providers/me?key=${apiKey}`);
    expect(res.status).toBe(200);
    expect(res.body.provider).toBeDefined();
    expect(res.body.provider.name).toBe('Test Provider');
    expect(res.body.provider.gpu_model).toBe('RTX 4090');
  });

  it('returns 404 for unknown API key', async () => {
    const res = await request(app).get('/api/providers/me?key=dc1-provider-invalid-key');
    expect(res.status).toBe(404);
  });

  it('returns 400 when key query param is omitted', async () => {
    const res = await request(app).get('/api/providers/me');
    expect(res.status).toBe(400);
  });
});

describe('Provider API — POST /api/providers/heartbeat', () => {
  it('accepts heartbeat and sets provider online', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const res = await request(app).post('/api/providers/heartbeat').send({
      api_key: apiKey,
      gpu_status: { gpu_name: 'RTX 4090', gpu_util_pct: 12, temp_c: 47 },
      uptime: 3600,
      provider_ip: '192.168.1.10',
      provider_hostname: 'test-node',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm last_heartbeat was updated in DB
    const row = db.get('SELECT status, last_heartbeat FROM providers WHERE api_key = ?', apiKey);
    expect(row.status).toBe('online');
    expect(row.last_heartbeat).not.toBeNull();
  });

  it('returns 401 for invalid API key', async () => {
    const res = await request(app).post('/api/providers/heartbeat').send({
      api_key: 'dc1-provider-bogus-key',
      gpu_status: {},
    });
    expect(res.status).toBe(401);
  });

  it('sets daemon update_available flag for outdated daemon version', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const res = await request(app).post('/api/providers/heartbeat').send({
      api_key: apiKey,
      gpu_status: { daemon_version: '1.0.0' },
    });

    expect(res.status).toBe(200);
    expect(res.body.update_available).toBe(true);
  });

  it('returns update_available: false for current daemon version', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const res = await request(app).post('/api/providers/heartbeat').send({
      api_key: apiKey,
      gpu_status: { daemon_version: '3.3.0' },
    });

    expect(res.status).toBe(200);
    expect(res.body.update_available).toBe(false);
  });
});

describe('Provider API — installer/download key validation', () => {
  it('returns 400 on malformed duplicate key query for setup download', async () => {
    const res = await request(app).get('/api/providers/download/setup?key=one&key=two&os=linux');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'API key required' });
  });

  it('returns 400 on malformed duplicate key query for daemon download', async () => {
    const res = await request(app).get('/api/providers/download/daemon?key=one&key=two&check_only=true');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'API key required' });
  });

  it('returns 400 on malformed duplicate key query for script download', async () => {
    const res = await request(app).get('/api/providers/download?key=one&key=two&platform=linux');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'API key required' });
  });

  it('returns 401 for installer request with unknown API key', async () => {
    const res = await request(app).get('/api/providers/installer?key=dc1-provider-invalid&os=Linux');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid API key' });
  });
});

describe('Provider API — reactivation bundle token flow', () => {
  it('issues reactivation token and returns deterministic linux/windows/mac install commands', async () => {
    const reg = await registerProvider({ os: 'linux' });
    const apiKey = reg.body.api_key;

    const tokenRes = await request(app)
      .post('/api/providers/me/reactivation-token')
      .set('x-provider-key', apiKey)
      .send({});

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.success).toBe(true);
    expect(typeof tokenRes.body.reactivation_token).toBe('string');
    expect(tokenRes.body.reactivation_token.length).toBeGreaterThan(20);

    const bundleRes = await request(app).get(
      `/api/providers/reactivation/bundle?token=${encodeURIComponent(tokenRes.body.reactivation_token)}`
    );

    expect(bundleRes.status).toBe(200);
    expect(bundleRes.body.success).toBe(true);
    expect(bundleRes.body.provider_id).toBe(reg.body.provider_id);
    expect(bundleRes.body.reactivation_bundle.daemon_download_url).toContain('/api/providers/download/daemon?key=');
    expect(bundleRes.body.reactivation_bundle.linux.setup_url).toContain('/api/providers/download/setup?key=');
    expect(bundleRes.body.reactivation_bundle.linux.setup_url).toContain('&os=linux');
    expect(bundleRes.body.reactivation_bundle.mac.setup_url).toContain('&os=mac');
    expect(bundleRes.body.reactivation_bundle.windows.setup_url).toContain('&os=windows');
    expect(bundleRes.body.reactivation_bundle.linux.install_command).toContain('curl -fsSL');
    expect(bundleRes.body.reactivation_bundle.windows.install_command).toContain('powershell');
  });

  it('returns 401 JSON error for invalid reactivation token', async () => {
    const res = await request(app).get('/api/providers/reactivation/bundle?token=not-a-valid-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid reactivation token' });
  });

  it('returns 401 JSON error when reactivation token is expired', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const tokenRes = await request(app)
      .post('/api/providers/me/reactivation-token')
      .set('x-provider-key', apiKey)
      .send({ ttl_seconds: 1 });
    expect(tokenRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app).get(
      `/api/providers/reactivation/bundle?token=${encodeURIComponent(tokenRes.body.reactivation_token)}`
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Reactivation token expired' });
  });
});

describe('Provider API — GET /api/providers/:api_key/jobs', () => {
  it('returns null job when no pending jobs assigned', async () => {
    const reg = await registerProvider();
    const apiKey = reg.body.api_key;

    const res = await request(app).get(`/api/providers/${apiKey}/jobs`);
    expect(res.status).toBe(200);
    expect(res.body.job).toBeNull();
  });

  it('returns 401 for unknown provider key', async () => {
    const res = await request(app).get('/api/providers/dc1-provider-invalid/jobs');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// RENTER API
// =============================================================================

describe('Renter API — POST /api/renters/register', () => {
  // 2026-05-09: register now stages a pending row and emails a magic link
  // instead of issuing the api_key inline. The api_key + starter balance
  // are issued on first magic-link click via /api/auth/magic-link.
  it('returns 202 next=check_email, no api_key in response, row staged as pending with 0 balance', async () => {
    const res = await registerRenter();
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.next).toBe('check_email');
    expect(res.body.email).toBeDefined();
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.renter_id).toBeDefined();

    const row = db.get('SELECT status, balance_halala, api_key FROM renters WHERE id = ?', res.body.renter_id);
    expect(row.status).toBe('pending');
    expect(row.balance_halala).toBe(0);
    expect(row.api_key).toMatch(/^pending-renter-/);
  });

  it('re-submitting the same email while pending refreshes profile and re-sends link (no 409)', async () => {
    const email = `dup-renter-${Date.now()}@dc1.test`;
    const first = await registerRenter({ email, name: 'Original Name' });
    expect(first.status).toBe(202);
    const res = await registerRenter({ email, name: 'Corrected Name' });
    expect(res.status).toBe(202);
    expect(res.body.next).toBe('check_email');
    const row = db.get('SELECT name, status FROM renters WHERE LOWER(email) = LOWER(?)', email);
    expect(row.name).toBe('Corrected Name');
    expect(row.status).toBe('pending');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/renters/register')
      .send({ email: 'norname@dc1.test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/renters/register')
      .send({ name: 'No Email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/renters/register')
      .send({ name: 'Bad Email', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('staged renter has 0 balance until magic-link finalization', async () => {
    const res = await registerRenter();
    const row = db.get('SELECT balance_halala, status FROM renters WHERE id = ?', res.body.renter_id);
    expect(row.balance_halala).toBe(0);
    expect(row.status).toBe('pending');
  });
});

describe('Renter API — GET /api/renters/me', () => {
  it('returns renter profile for valid key', async () => {
    const email = `aisha-${Date.now()}@dc1.test`;
    await registerRenter({ name: 'Aisha Al-Farsi', email });
    // Simulate the magic-link click: stage → active, mint api_key, credit balance.
    const apiKey = finalizeRenterForTest(email);

    const res = await request(app).get(`/api/renters/me?key=${apiKey}`);
    expect(res.status).toBe(200);
    expect(res.body.renter).toBeDefined();
    expect(res.body.renter.name).toBe('Aisha Al-Farsi');
    expect(res.body.renter.balance_halala).toBe(1000);
    expect(Array.isArray(res.body.recent_jobs)).toBe(true);
  });

  it('returns 404 for unknown renter key', async () => {
    const res = await request(app).get('/api/renters/me?key=dc1-renter-bogus');
    expect(res.status).toBe(404);
  });

  it('returns 400 when key param is omitted', async () => {
    const res = await request(app).get('/api/renters/me');
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// ADMIN API
// =============================================================================

describe('Admin API — GET /api/admin/dashboard', () => {
  it('returns dashboard stats with valid admin token', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      total_providers: expect.any(Number),
      online_now: expect.any(Number),
      total_jobs: expect.any(Number),
    });
  });

  it('reflects registered providers in dashboard count', async () => {
    await registerProvider({ name: 'Provider A', email: `a-${Date.now()}@dc1.test` });
    await registerProvider({ name: 'Provider B', email: `b-${Date.now()}@dc1.test` });

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.stats.total_providers).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 without admin token', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong admin token', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('x-admin-token', 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('accepts token via Authorization: Bearer header', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
  });
});

describe('Admin API — GET /api/admin/providers', () => {
  it('returns provider list with valid token', async () => {
    await registerProvider();
    const res = await request(app)
      .get('/api/admin/providers')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.providers).toBeDefined();
    expect(Array.isArray(res.body.providers)).toBe(true);
    // api_key must NOT be exposed
    res.body.providers.forEach(p => {
      expect(p.api_key).toBeUndefined();
    });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/providers');
    expect(res.status).toBe(401);
  });
});

describe('Admin API — GET /api/admin/daemon-health', () => {
  it('returns reliability windows with null percentile metrics when no telemetry exists', async () => {
    const res = await request(app)
      .get('/api/admin/daemon-health')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(typeof res.body.generated_at).toBe('string');
    expect(typeof res.body.reliability?.generated_at).toBe('string');
    expect(res.body.reliability?.windows?.['24h']?.latency_ms).toEqual({
      sample_count: 0,
      p50_ms: null,
      p95_ms: null,
    });
    expect(res.body.reliability?.windows?.['7d']?.latency_ms).toEqual({
      sample_count: 0,
      p50_ms: null,
      p95_ms: null,
    });
  });

  it('computes rolling uptime and latency percentile telemetry from persisted metrics', async () => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const twoDaysAgoIso = new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const providerApiKey = `dc1-provider-health-${Date.now()}`;
    const providerEmail = `health-${Date.now()}-${Math.random().toString(36).slice(2)}@dc1.test`;
    const insertProvider = db.prepare(
      `INSERT INTO providers
        (name, email, api_key, gpu_model, os, status, created_at, updated_at, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const providerResult = insertProvider.run(
      'Health Provider',
      providerEmail,
      providerApiKey,
      'RTX 4090',
      'linux',
      'online',
      twoDaysAgoIso,
      nowIso,
      nowIso
    );
    const providerId = Number(providerResult.lastInsertRowid);

    const insertHeartbeat = db.prepare(
      'INSERT INTO heartbeat_log (provider_id, received_at) VALUES (?, ?)'
    );
    for (let i = 0; i < 120; i += 1) {
      insertHeartbeat.run(providerId, new Date(now - (i * 5 * 60 * 1000)).toISOString());
    }

    const insertStream = db.prepare(
      `INSERT INTO inference_stream_events
        (provider_id, model_id, provider_tier, stream_success, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const durationSamples = [80, 95, 100, 130, 200, 210, 260, 400];
    for (const durationMs of durationSamples) {
      insertStream.run(providerId, 'test-model', 'tier_1', 1, durationMs, nowIso);
    }

    const res = await request(app)
      .get('/api/admin/daemon-health')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.reliability?.windows?.['24h']?.uptime?.sample_count).toBeGreaterThan(0);
    expect(res.body.reliability?.windows?.['24h']?.uptime?.pct).not.toBeNull();
    expect(res.body.reliability?.windows?.['24h']?.latency_ms).toEqual({
      sample_count: durationSamples.length,
      p50_ms: 130,
      p95_ms: 400,
    });
    expect(res.body.reliability?.windows?.['24h']?.online_capacity?.providers_seen).toBeGreaterThan(0);
  });
});

describe('Public API — GET /api/health/reliability', () => {
  it('returns public-safe reliability telemetry without admin auth', async () => {
    const res = await request(app).get('/api/health/reliability');

    expect(res.status).toBe(200);
    expect(typeof res.body.generated_at).toBe('string');
    expect(typeof res.body.windows?.['24h']?.generated_at).toBe('string');
    expect(res.body.windows?.['24h']?.uptime?.sample_count).toBe(0);
    expect(res.body.windows?.['24h']?.latency_ms).toEqual({
      sample_count: 0,
      p50_ms: null,
      p95_ms: null,
    });
    expect(typeof res.body.windows?.['24h']?.online_capacity?.online_now).toBe('number');
  });
});
