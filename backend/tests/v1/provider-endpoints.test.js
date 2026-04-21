/**
 * Tests for the 6 wizard provider endpoints.
 *
 * Covers: eligibility, gpu-profile, config, install-token, register-node,
 * node-status, earnings. Runs against an in-memory SQLite (via jest-setup).
 */

// Mock @supabase/supabase-js because auth-otp.js (a transitive require
// of the wizard router) creates a real client at import time. We don't
// need Supabase for any provider endpoint; keeping this inert prevents
// spurious network/SDK init during tests.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOtp: jest.fn(), getUser: jest.fn() } })),
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/db');
const v1WizardRouter = require('../../src/routes/v1-wizard');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1', v1WizardRouter);
  return app;
}

function createProvider({ email = 'p@e.com', apiKey = 'k_test', status = 'active', ...extras } = {}) {
  db.run(
    `INSERT INTO providers (email, name, status, api_key, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    email, extras.name || 'Test Provider', status, apiKey,
  );
  return db.get('SELECT * FROM providers WHERE email = ?', email);
}

beforeEach(() => {
  // Delete children before parents — wizard_install_tokens + wizard_configs
  // have FOREIGN KEY (provider_id) REFERENCES providers(id), and PRAGMA
  // foreign_keys is ON (set in src/db.js).
  try { db.run('DELETE FROM wizard_install_tokens'); } catch (_) { /* table may not exist yet */ }
  try { db.run('DELETE FROM wizard_configs'); } catch (_) { /* table may not exist yet */ }
  try { db.run('DELETE FROM providers'); } catch (_) { /* table may not exist yet */ }
});

describe('Auth middleware (requireProvider)', () => {
  test('401 without Authorization header', async () => {
    const res = await request(buildApp()).get('/v1/provider/eligibility');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('missing_token');
  });
  test('401 for unknown token', async () => {
    const res = await request(buildApp())
      .get('/v1/provider/eligibility')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });
});

describe('GET /v1/provider/eligibility', () => {
  test('active provider is eligible', async () => {
    const p = createProvider({ apiKey: 'k_active' });
    const res = await request(buildApp())
      .get('/v1/provider/eligibility')
      .set('Authorization', 'Bearer k_active');
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.account_status).toBe('active');
    expect(res.body.region).toBeDefined();
  });
  test('suspended provider is not eligible', async () => {
    createProvider({ apiKey: 'k_sus', status: 'suspended' });
    const res = await request(buildApp())
      .get('/v1/provider/eligibility')
      .set('Authorization', 'Bearer k_sus');
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toMatch(/suspended/i);
  });
});

describe('POST /v1/provider/gpu-profile', () => {
  test('400 with empty gpus', async () => {
    createProvider({ apiKey: 'k_gp' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_gp')
      .send({ gpus: [] });
    expect(res.status).toBe(400);
  });

  test('known NVIDIA GPU → estimated rate matches pricing table', async () => {
    createProvider({ apiKey: 'k_4090' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_4090')
      .send({
        gpus: [{ vendor: 'nvidia', model: 'rtx 4090', vram_gb: 24, count: 1 }],
        ram_gb: 64, os: 'windows', detected_by: 'manual_web',
      });
    expect(res.status).toBe(201);
    expect(res.body.profile_id).toMatch(/^gpu_prof_/);
    expect(res.body.estimated_hourly_rate).toBe(0.267);
    // 0.267 * 24 * 30 = 192.24
    expect(res.body.estimated_monthly_rate).toBeCloseTo(192.24, 2);
    expect(Array.isArray(res.body.supported_models)).toBe(true);
    expect(res.body.unknown_gpu).toBe(false);
  });

  test('wizard-style underscored model ids match pricing (rtx_4090 → 0.267)', async () => {
    // The wizard's gpu-catalog.ts ships ids like 'rtx_4090', 'm3_max'.
    // Regression guard for the QA bug where every catalog pick resolved to $0.
    createProvider({ apiKey: 'k_underscore' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_underscore')
      .send({
        gpus: [{ vendor: 'nvidia', model: 'rtx_4090', vram_gb: 24, count: 1 }],
        os: 'linux', detected_by: 'manual_web',
      });
    expect(res.status).toBe(201);
    expect(res.body.estimated_hourly_rate).toBe(0.267);
    expect(res.body.unknown_gpu).toBe(false);
  });

  test('wizard-style underscored Apple ids match pricing (m3_max → 0.35)', async () => {
    createProvider({ apiKey: 'k_apple_underscore' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_apple_underscore')
      .send({
        gpus: [{ vendor: 'apple', model: 'm3_max', vram_gb: 96, count: 1 }],
        os: 'macos',
      });
    expect(res.status).toBe(201);
    expect(res.body.estimated_hourly_rate).toBe(0.35);
    expect(res.body.bandwidth_gbps).toBe(400);
  });

  test('Apple Silicon is recognised with bandwidth', async () => {
    createProvider({ apiKey: 'k_m3' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_m3')
      .send({
        gpus: [{ vendor: 'apple', model: 'm3 max', vram_gb: 96, count: 1 }],
        os: 'macos',
      });
    expect(res.status).toBe(201);
    expect(res.body.estimated_hourly_rate).toBe(0.35);
    expect(res.body.bandwidth_gbps).toBe(400);
  });

  test('unknown model marks unknown_gpu=true but still 201', async () => {
    createProvider({ apiKey: 'k_unknown' });
    const res = await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_unknown')
      .send({
        gpus: [{ vendor: 'amd', model: 'mi300x', vram_gb: 192, count: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.unknown_gpu).toBe(true);
    expect(res.body.estimated_hourly_rate).toBe(0);
  });

  test('writes gpu fields back to provider row', async () => {
    createProvider({ apiKey: 'k_write' });
    await request(buildApp())
      .post('/v1/provider/gpu-profile')
      .set('Authorization', 'Bearer k_write')
      .send({
        gpus: [
          { vendor: 'nvidia', model: 'rtx 4090', vram_gb: 24, count: 2 },
        ],
        os: 'linux',
      });
    const updated = db.get('SELECT * FROM providers WHERE api_key = ?', 'k_write');
    expect(updated.gpu_count).toBe(2);
    expect(updated.vram_gb).toBe(48);
    expect(updated.os).toBe('linux');
    expect(updated.gpu_profile_source).toBe('manual_web');
  });
});

describe('POST /v1/provider/config', () => {
  test('saves defaults with minimal body', async () => {
    const p = createProvider({ apiKey: 'k_cfg' });
    const res = await request(buildApp())
      .post('/v1/provider/config')
      .set('Authorization', 'Bearer k_cfg')
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.config_id).toMatch(/^cfg_/);
    const row = db.get('SELECT * FROM wizard_configs WHERE provider_id = ?', p.id);
    expect(row.schedule).toBe('always_on');
    expect(row.gpu_load_max_pct).toBe(100);
    expect(row.power_limit).toBe('default');
  });

  test('upserts on repeat calls', async () => {
    const p = createProvider({ apiKey: 'k_cfg2' });
    await request(buildApp())
      .post('/v1/provider/config')
      .set('Authorization', 'Bearer k_cfg2')
      .send({ schedule: 'smart_hours', gpu_load_max_pct: 80 });
    await request(buildApp())
      .post('/v1/provider/config')
      .set('Authorization', 'Bearer k_cfg2')
      .send({ schedule: 'custom', gpu_load_max_pct: 60, power_limit: 'eco' });
    const rows = db.all('SELECT * FROM wizard_configs WHERE provider_id = ?', p.id);
    expect(rows.length).toBe(1);
    expect(rows[0].schedule).toBe('custom');
    expect(rows[0].gpu_load_max_pct).toBe(60);
    expect(rows[0].power_limit).toBe('eco');
  });

  test('invalid schedule falls back to always_on', async () => {
    createProvider({ apiKey: 'k_cfg3' });
    const res = await request(buildApp())
      .post('/v1/provider/config')
      .set('Authorization', 'Bearer k_cfg3')
      .send({ schedule: 'weird', gpu_load_max_pct: 999 });
    expect(res.status).toBe(201);
    const row = db.get('SELECT * FROM wizard_configs');
    expect(row.schedule).toBe('always_on');
    expect(row.gpu_load_max_pct).toBe(100);
  });
});

describe('POST /v1/provider/install-token', () => {
  test('returns dcpt_ prefixed token with 24h expiry', async () => {
    const p = createProvider({ apiKey: 'k_inst' });
    const res = await request(buildApp())
      .post('/v1/provider/install-token')
      .set('Authorization', 'Bearer k_inst')
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.install_token).toMatch(/^dcpt_[a-f0-9]{24}$/);
    const expiresMs = new Date(res.body.expires_at).getTime();
    const delta = expiresMs - Date.now();
    expect(delta).toBeGreaterThan(23 * 3600 * 1000);
    expect(delta).toBeLessThanOrEqual(24 * 3600 * 1000 + 5000);
    const stored = db.get('SELECT * FROM wizard_install_tokens WHERE token = ?', res.body.install_token);
    expect(stored.provider_id).toBe(p.id);
    expect(stored.consumed_at).toBeNull();
  });
});

describe('POST /v1/provider/register-node', () => {
  async function mintToken(apiKey) {
    const res = await request(buildApp())
      .post('/v1/provider/install-token')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({});
    return res.body.install_token;
  }

  test('400 without install_token', async () => {
    const res = await request(buildApp())
      .post('/v1/provider/register-node')
      .send({});
    expect(res.status).toBe(400);
  });

  test('404 for unknown install_token', async () => {
    const res = await request(buildApp())
      .post('/v1/provider/register-node')
      .send({ install_token: 'dcpt_nope' });
    expect(res.status).toBe(404);
  });

  test('201 on valid token, returns api_key + node_id and consumes token', async () => {
    const p = createProvider({ apiKey: 'k_reg', status: 'pending' });
    const token = await mintToken('k_reg');
    const res = await request(buildApp())
      .post('/v1/provider/register-node')
      .send({
        install_token: token,
        hostname: 'AHMAD-PC',
        os: 'windows',
        gpu_detected: [{ vendor: 'NVIDIA', model: 'RTX 4090', vram_mb: 24576, driver_version: '535.104.05' }],
        daemon_version: '4.1.0',
      });
    expect(res.status).toBe(201);
    expect(res.body.node_id).toBe(`node_${p.id}`);
    expect(res.body.api_key).toMatch(/^dcpk_[a-f0-9]{48}$/);
    expect(res.body.status).toBe('active');

    const updated = db.get('SELECT * FROM providers WHERE id = ?', p.id);
    expect(updated.status).toBe('active');
    expect(updated.api_key).toBe(res.body.api_key);

    const tokenRow = db.get('SELECT * FROM wizard_install_tokens WHERE token = ?', token);
    expect(tokenRow.consumed_at).toBeTruthy();
  });

  test('409 when replaying a consumed token', async () => {
    createProvider({ apiKey: 'k_replay', status: 'pending' });
    const token = await mintToken('k_replay');
    await request(buildApp())
      .post('/v1/provider/register-node')
      .send({ install_token: token, hostname: 'A' });
    const second = await request(buildApp())
      .post('/v1/provider/register-node')
      .send({ install_token: token, hostname: 'A' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('token_consumed');
  });

  test('410 when token expired', async () => {
    const p = createProvider({ apiKey: 'k_exp', status: 'pending' });
    const token = `dcpt_${require('crypto').randomBytes(12).toString('hex')}`;
    db.run(
      `INSERT INTO wizard_install_tokens (token, provider_id, expires_at)
       VALUES (?, ?, datetime('now', '-1 hour'))`,
      token, p.id,
    );
    const res = await request(buildApp())
      .post('/v1/provider/register-node')
      .send({ install_token: token });
    expect(res.status).toBe(410);
  });
});

describe('GET /v1/provider/node-status', () => {
  test('reports connected=false for pending provider', async () => {
    createProvider({ apiKey: 'k_pend', status: 'pending' });
    const res = await request(buildApp())
      .get('/v1/provider/node-status')
      .set('Authorization', 'Bearer k_pend');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.node_id).toBe(null);
  });

  test('reports connected=true for active provider', async () => {
    const p = createProvider({ apiKey: 'k_act', status: 'active' });
    db.run('UPDATE providers SET gpu_model = ?, os = ? WHERE id = ?', 'NVIDIA RTX 4090', 'windows', p.id);
    const res = await request(buildApp())
      .get('/v1/provider/node-status')
      .set('Authorization', 'Bearer k_act');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.node_id).toBe(`node_${p.id}`);
    expect(res.body.gpu_model).toBe('NVIDIA RTX 4090');
  });
});

describe('GET /v1/provider/earnings', () => {
  test('returns zero-earnings shape for new provider', async () => {
    createProvider({ apiKey: 'k_earn' });
    const res = await request(buildApp())
      .get('/v1/provider/earnings')
      .set('Authorization', 'Bearer k_earn');
    expect(res.status).toBe(200);
    expect(res.body.total_sar).toBe(0);
    expect(res.body.claimable_sar).toBe(0);
    expect(res.body.today_sar).toBe(0);
    expect(res.body.week_sar).toBe(0);
    expect(res.body.month_sar).toBe(0);
    expect(typeof res.body.sar_usd_rate).toBe('number');
  });

  test('converts total_earnings_halala → total_sar', async () => {
    const p = createProvider({ apiKey: 'k_money' });
    db.run(
      `UPDATE providers SET total_earnings_halala = ?, claimable_earnings_halala = ?, total_jobs = ? WHERE id = ?`,
      12345, 6789, 17, p.id,
    );
    const res = await request(buildApp())
      .get('/v1/provider/earnings')
      .set('Authorization', 'Bearer k_money');
    expect(res.status).toBe(200);
    expect(res.body.total_sar).toBe(123.45);
    expect(res.body.claimable_sar).toBe(67.89);
    expect(res.body.total_jobs).toBe(17);
  });
});
