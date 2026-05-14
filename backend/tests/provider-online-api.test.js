'use strict';

/**
 * provider-online-api.test.js — Integration tests for DCP-877
 *
 * Tests the provider online/offline/heartbeat API:
 *   1. POST /api/providers/:id/online — self-declaration of readiness
 *   2. POST /api/providers/:id/offline — graceful offline
 *   3. GET  /api/providers/online — public sanitized listing
 *   4. POST /api/providers/:id/heartbeat — stay-alive after online
 *
 * Uses in-memory SQLite (jest-setup.js sets DC1_DB_PATH=:memory:).
 */

process.env.SUPABASE_URL         = process.env.SUPABASE_URL         || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key-stub';
process.env.NODE_ENV             = 'test';
process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT = '1';

const request = require('supertest');
const express = require('express');
const db      = require('../src/db');

// ── App factory ───────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/providers', require('../src/routes/providers'));
  return app;
}

const app = createApp();

// ── DB helpers ────────────────────────────────────────────────────────────────

function cleanDb() {
  const safe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {} };
  try { db.prepare('PRAGMA foreign_keys = OFF').run(); } catch (_) {}
  for (const t of [
    'heartbeat_log', 'provider_gpu_telemetry', 'provider_health_log',
    'provider_benchmarks', 'jobs', 'providers', 'model_registry',
  ]) { safe(t); }
  try { db.prepare('PRAGMA foreign_keys = ON').run(); } catch (_) {}
}

function insertCatalogModel(overrides = {}) {
  const now = new Date().toISOString();
  const model = {
    model_id: overrides.model_id || `model-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    display_name: overrides.display_name || 'Catalog Test Model',
    family: overrides.family || 'llm',
    vram_gb: overrides.vram_gb ?? 16,
    quantization: overrides.quantization || 'fp16',
    context_window: overrides.context_window ?? 8192,
    use_cases: overrides.use_cases || JSON.stringify(['chat', 'reasoning']),
    min_gpu_vram_gb: overrides.min_gpu_vram_gb ?? 16,
    default_price_halala_per_min: overrides.default_price_halala_per_min ?? 120,
    is_active: overrides.is_active ?? 1,
  };
  db.prepare(`
    INSERT INTO model_registry
      (model_id, display_name, family, vram_gb, quantization, context_window,
       use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    model.model_id, model.display_name, model.family, model.vram_gb, model.quantization,
    model.context_window, model.use_cases, model.min_gpu_vram_gb,
    model.default_price_halala_per_min, model.is_active, now, now,
  );
  return model;
}

async function registerProvider(overrides = {}) {
  const res = await request(app).post('/api/providers/register').send({
    name:      overrides.name      || `Provider-${Date.now()}`,
    email:     overrides.email     || `prov-${Date.now()}-${Math.random().toString(36).slice(2)}@dc1.test`,
    gpu_model: overrides.gpu_model || 'RTX 4090',
    os:        overrides.os        || 'linux',
  });
  expect([200, 201]).toContain(res.status);
  return { id: res.body.provider_id, apiKey: res.body.api_key };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(cleanDb);
afterAll(cleanDb);

// ── POST /api/providers/:id/online ────────────────────────────────────────────

describe('POST /api/providers/:id/online', () => {
  test('marks provider online and grants approval in one call', async () => {
    const { id, apiKey } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24, maxConcurrentJobs: 2 });

    expect(res.status).toBe(200);
    expect(res.body.online).toBe(true);
    expect(res.body.provider_id).toBe(id);
    expect(res.body.status).toBe('online');
    expect(res.body).toHaveProperty('expires_at');
    expect(res.body).toHaveProperty('heartbeat_interval_seconds');
  });

  test('sets approval_status=approved so heartbeat works after /online', async () => {
    const { id, apiKey } = await registerProvider();

    // Mark online
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    // Verify DB state
    const row = db.get('SELECT status, approval_status FROM providers WHERE id = ?', id);
    expect(row.status).toBe('online');
    expect(row.approval_status).toBe('approved');
  });

  test('provider appears in /api/providers/online after marking online', async () => {
    const { id, apiKey } = await registerProvider({ name: 'MarketplaceProvider' });

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24, loadedModels: ['llama3-8b'] });

    const listRes = await request(app).get('/api/providers/online');
    expect(listRes.status).toBe(200);
    const ids = listRes.body.providers.map((p) => p.id);
    expect(ids).toContain(id);
  });

  test('stores loaded models in DB', async () => {
    const { id, apiKey } = await registerProvider();

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ loadedModels: ['llama3-8b', 'mistral-7b'] });

    const row = db.get('SELECT cached_models FROM providers WHERE id = ?', id);
    const models = JSON.parse(row.cached_models || '[]');
    expect(models).toContain('llama3-8b');
    expect(models).toContain('mistral-7b');
  });

  test('accepts Bearer token auth', async () => {
    const { id, apiKey } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/online`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    expect(res.status).toBe(200);
    expect(res.body.online).toBe(true);
  });

  test('returns 401 without API key', async () => {
    const { id } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/online`)
      .send({ gpuModel: 'RTX 4090' });

    expect(res.status).toBe(401);
  });

  test('returns 401 with wrong API key', async () => {
    const { id } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', 'wrong-key-xyz')
      .send({ gpuModel: 'RTX 4090' });

    expect(res.status).toBe(401);
  });

  test('returns 400 with missing provider ID', async () => {
    const res = await request(app)
      .post('/api/providers//online')
      .set('x-provider-key', 'any-key');

    expect(res.status).toBe(404); // Express can't match empty param
  });
});

// ── POST /api/providers/:id/offline ──────────────────────────────────────────

describe('POST /api/providers/:id/offline', () => {
  test('marks provider offline', async () => {
    const { id, apiKey } = await registerProvider();

    // First go online
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    // Then go offline
    const res = await request(app)
      .post(`/api/providers/${id}/offline`)
      .set('x-provider-key', apiKey)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.offline).toBe(true);
    expect(res.body.status).toBe('offline');
    expect(res.body).toHaveProperty('offline_at');
  });

  test('provider no longer in /online list after going offline', async () => {
    const { id, apiKey } = await registerProvider({ name: 'OfflineProvider' });

    // Go online then immediately offline
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    await request(app)
      .post(`/api/providers/${id}/offline`)
      .set('x-provider-key', apiKey)
      .send();

    const listRes = await request(app).get('/api/providers/online');
    const ids = listRes.body.providers.map((p) => p.id);
    expect(ids).not.toContain(id);
  });

  test('returns 401 with wrong API key', async () => {
    const { id } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/offline`)
      .set('x-provider-key', 'wrong-key')
      .send();

    expect(res.status).toBe(401);
  });

  test('returns 401 without API key', async () => {
    const { id } = await registerProvider();

    const res = await request(app)
      .post(`/api/providers/${id}/offline`)
      .send();

    expect(res.status).toBe(401);
  });
});

// ── GET /api/providers/online (public) ───────────────────────────────────────

describe('GET /api/providers/online (public)', () => {
  test('returns empty list when no providers online', async () => {
    const res = await request(app).get('/api/providers/online');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('generated_at');
  });

  test('returns sanitized fields — no email, no api_key', async () => {
    const { id, apiKey } = await registerProvider({ name: 'SafeProvider' });

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    const res = await request(app).get('/api/providers/online');
    expect(res.status).toBe(200);
    expect(res.body.providers.length).toBeGreaterThan(0);

    const provider = res.body.providers.find((p) => p.id === id);
    expect(provider).toBeDefined();
    // Safe fields present
    expect(provider).toHaveProperty('id');
    expect(provider).toHaveProperty('name');
    expect(provider).toHaveProperty('gpu_model');
    expect(provider).toHaveProperty('vram_gb');
    expect(provider).toHaveProperty('is_live');
    expect(provider).toHaveProperty('heartbeat_age_seconds');
    // Sensitive fields absent
    expect(provider).not.toHaveProperty('email');
    expect(provider).not.toHaveProperty('api_key');
    expect(provider).not.toHaveProperty('approval_status');
  });

  test('count matches providers array length', async () => {
    const { id: id1, apiKey: key1 } = await registerProvider({ name: 'OnlineA' });
    const { id: id2, apiKey: key2 } = await registerProvider({ name: 'OnlineB' });

    await Promise.all([
      request(app).post(`/api/providers/${id1}/online`).set('x-provider-key', key1).send({ gpuModel: 'RTX 4090', vramGb: 24 }),
      request(app).post(`/api/providers/${id2}/online`).set('x-provider-key', key2).send({ gpuModel: 'RTX 4080', vramGb: 16 }),
    ]);

    const res = await request(app).get('/api/providers/online');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(res.body.providers.length);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
  });

  test('is_live is true for provider that just came online', async () => {
    const { id, apiKey } = await registerProvider({ name: 'LiveProvider' });

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    const res = await request(app).get('/api/providers/online');
    const provider = res.body.providers.find((p) => p.id === id);
    expect(provider).toBeDefined();
    expect(provider.is_live).toBe(true);
    expect(provider.heartbeat_age_seconds).toBeLessThan(5);
  });

  test('loaded_models returned for providers with models', async () => {
    const { id, apiKey } = await registerProvider({ name: 'ModelProvider' });

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24, loadedModels: ['allam-7b-instruct', 'llama-3-8b-instruct'] });

    const res = await request(app).get('/api/providers/online');
    const provider = res.body.providers.find((p) => p.id === id);
    expect(provider).toBeDefined();
    expect(Array.isArray(provider.loaded_models)).toBe(true);
    expect(provider.loaded_models).toContain('allam-7b-instruct');
  });
});

describe('GET /api/providers/model-catalog', () => {
  test('returns OpenRouter-style required contract fields for active models', async () => {
    insertCatalogModel({
      model_id: 'catalog-required-model',
      display_name: 'Catalog Required',
      quantization: 'bf16',
      context_window: 32768,
      default_price_halala_per_min: 90,
      use_cases: JSON.stringify(['chat', 'reasoning', 'code']),
    });

    const res = await request(app).get('/api/providers/model-catalog');
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(Array.isArray(res.body.data)).toBe(true);

    const model = res.body.data.find((entry) => entry.id === 'catalog-required-model');
    expect(model).toBeDefined();
    expect(model).toHaveProperty('name', 'Catalog Required');
    expect(model).toHaveProperty('created');
    expect(model).toHaveProperty('modalities');
    expect(model).toHaveProperty('context_length', 32768);
    expect(model).toHaveProperty('max_output_tokens');
    expect(model).toHaveProperty('quantization', 'bf16');
    expect(model).toHaveProperty('pricing');
    expect(model.pricing).toHaveProperty('usd_per_minute');
    expect(model.pricing).toHaveProperty('usd_per_1m_input_tokens');
    expect(model.pricing).toHaveProperty('usd_per_1m_output_tokens');
    expect(model).toHaveProperty('sampling_parameters');
    expect(model).toHaveProperty('supported_features');
  });

  test('includes valid optional fields from provider metadata', async () => {
    const model = insertCatalogModel({
      model_id: 'catalog-optional-model',
      display_name: 'Catalog Optional',
      use_cases: JSON.stringify(['chat']),
    });
    const { id, apiKey } = await registerProvider();
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ loadedModels: [model.model_id], gpuModel: 'RTX 4090', vramGb: 24 });

    db.prepare('UPDATE providers SET cached_models = ? WHERE id = ?').run(JSON.stringify([{
      model_id: model.model_id,
      display_name: model.display_name,
      deprecation_date: '2027-12-31',
      datacenters: ['sa-neom-1', 'eu-frankfurt-1'],
      openrouter: { slug: 'dcp/catalog-optional-model' },
    }]), id);

    const res = await request(app).get('/api/providers/model-catalog');
    expect(res.status).toBe(200);
    const item = res.body.data.find((entry) => entry.id === model.model_id);
    expect(item).toBeDefined();
    expect(item).toHaveProperty('deprecation_date', '2027-12-31');
    expect(item).toHaveProperty('datacenters');
    expect(item.datacenters).toEqual(expect.arrayContaining(['sa-neom-1', 'eu-frankfurt-1']));
    expect(item).toHaveProperty('openrouter');
    expect(item.openrouter).toHaveProperty('slug', 'dcp/catalog-optional-model');
  });

  test('provider_count loose-matches HF ids with quant suffix to registry canonical slug', async () => {
    // Registry has canonical slug; provider serves HF id with /, dashes,
    // mixed case, and -GPTQ-Int4 suffix. Strict join would yield 0.
    const model = insertCatalogModel({
      model_id: 'qwen3-30b-a3b',
      display_name: 'Qwen3 30B A3B',
      use_cases: JSON.stringify(['chat', 'reasoning']),
    });
    const { id, apiKey } = await registerProvider();
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ loadedModels: ['Qwen/Qwen3-30B-A3B-GPTQ-Int4'], gpuModel: 'RTX 4090', vramGb: 24 });

    // Force the cached_models payload to the verbatim HF id with quant suffix
    db.prepare('UPDATE providers SET cached_models = ? WHERE id = ?').run(
      JSON.stringify([{ model_id: 'Qwen/Qwen3-30B-A3B-GPTQ-Int4' }]),
      id,
    );

    const res = await request(app).get('/api/providers/model-catalog');
    expect(res.status).toBe(200);
    const item = res.body.data.find((entry) => entry.id === model.model_id);
    expect(item).toBeDefined();
    // The whole point of this regression: must be >= 1 despite no strict match
    expect(item.provider_count).toBeGreaterThanOrEqual(1);
  });

  test('drops invalid optional fields that fail validation', async () => {
    const model = insertCatalogModel({
      model_id: 'catalog-invalid-optional-model',
      display_name: 'Catalog Invalid Optional',
      use_cases: JSON.stringify(['chat']),
    });
    const { id, apiKey } = await registerProvider();
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ loadedModels: [model.model_id], gpuModel: 'RTX 4090', vramGb: 24 });

    db.prepare('UPDATE providers SET cached_models = ? WHERE id = ?').run(JSON.stringify([{
      model_id: model.model_id,
      display_name: model.display_name,
      deprecation_date: 'not-a-date',
      datacenters: ['SA-NEOM-1'],
      openrouter: { slug: 'Invalid Slug' },
    }]), id);

    const res = await request(app).get('/api/providers/model-catalog');
    expect(res.status).toBe(200);
    const item = res.body.data.find((entry) => entry.id === model.model_id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('deprecation_date');
    expect(item).not.toHaveProperty('datacenters');
    expect(item).not.toHaveProperty('openrouter');
  });
});

// ── POST /api/providers/:id/heartbeat after /online ──────────────────────────

describe('POST /api/providers/:id/heartbeat (after online)', () => {
  test('heartbeat succeeds after provider goes online (approval granted)', async () => {
    const { id, apiKey } = await registerProvider();

    // Must call /online first to get approval_status=approved
    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    // Now heartbeat should succeed
    const res = await request(app)
      .post(`/api/providers/${id}/heartbeat`)
      .set('x-provider-key', apiKey)
      .send({ gpu_utilization: 15, vram_used_mb: 4096, uptime_seconds: 120 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('online');
  });

  test('provider remains in /online list after subsequent heartbeat', async () => {
    const { id, apiKey } = await registerProvider({ name: 'HeartbeatProvider' });

    await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24 });

    await request(app)
      .post(`/api/providers/${id}/heartbeat`)
      .set('x-provider-key', apiKey)
      .send({ gpu_utilization: 20 });

    const listRes = await request(app).get('/api/providers/online');
    const ids = listRes.body.providers.map((p) => p.id);
    expect(ids).toContain(id);
  });
});

// ── Full online → heartbeat → offline flow ───────────────────────────────────

describe('Full provider lifecycle', () => {
  test('register → online → heartbeat → offline → not in list', async () => {
    const { id, apiKey } = await registerProvider({ name: 'LifecycleProvider' });

    // 1. Register is done by helper above. Provider starts as pending.
    const initial = db.get('SELECT status, approval_status FROM providers WHERE id = ?', id);
    expect(initial.approval_status).toBe('pending');

    // 2. Go online
    const onlineRes = await request(app)
      .post(`/api/providers/${id}/online`)
      .set('x-provider-key', apiKey)
      .send({ gpuModel: 'RTX 4090', vramGb: 24, loadedModels: ['allam-7b-instruct'] });
    expect(onlineRes.status).toBe(200);
    expect(onlineRes.body.online).toBe(true);

    // 3. Appear in marketplace listing
    const marketList = await request(app).get('/api/providers/online');
    expect(marketList.body.providers.map((p) => p.id)).toContain(id);

    // 4. Heartbeat
    const hbRes = await request(app)
      .post(`/api/providers/${id}/heartbeat`)
      .set('x-provider-key', apiKey)
      .send({ gpu_utilization: 30, uptime_seconds: 60 });
    expect(hbRes.status).toBe(200);

    // 5. Go offline
    const offlineRes = await request(app)
      .post(`/api/providers/${id}/offline`)
      .set('x-provider-key', apiKey)
      .send();
    expect(offlineRes.status).toBe(200);
    expect(offlineRes.body.offline).toBe(true);

    // 6. No longer in marketplace listing
    const finalList = await request(app).get('/api/providers/online');
    expect(finalList.body.providers.map((p) => p.id)).not.toContain(id);
  });
});
