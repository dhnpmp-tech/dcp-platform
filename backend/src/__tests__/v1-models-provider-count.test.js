const express = require('express');
const request = require('supertest');

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
  prepare: jest.fn(() => ({ run: jest.fn() })),
};

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  vllmCompleteLimiter: (req, res, next) => next(),
  vllmStreamLimiter: (req, res, next) => next(),
  modelCatalogLimiter: (req, res, next) => next(),
}));
jest.mock('../services/openrouterSettlementService', () => ({
  recordOpenRouterUsage: jest.fn(),
}));
jest.mock('../services/providerVerification', () => ({
  getEarnedRoutingState: jest.fn(() => ({
    active: false,
    servingIds: new Set(),
    deadIds: new Set(),
  })),
}));

function buildApp({ providers, engineProviders = [] }) {
  jest.resetModules();
  mockDb.all.mockReset();
  mockDb.get.mockReset();

  mockDb.all.mockImplementation((sql) => {
    const query = String(sql);
    if (query.includes('PRAGMA table_info(model_registry)')) {
      return [
        { name: 'model_id' },
        { name: 'display_name' },
        { name: 'family' },
        { name: 'created_at' },
        { name: 'context_window' },
        { name: 'quantization' },
        { name: 'vram_gb' },
        { name: 'default_price_halala_per_min' },
        { name: 'parameter_count' },
        { name: 'min_gpu_vram_gb' },
        { name: 'use_cases' },
        { name: 'is_active' },
      ];
    }
    if (query.includes('FROM model_registry')) {
      return [{
        model_id: 'BAAI/bge-m3',
        display_name: 'BGE-M3',
        family: 'embedding',
        created_at: '2026-01-01T00:00:00.000Z',
        context_window: 8192,
        quantization: 'fp16',
        vram_gb: 8,
        default_price_halala_per_min: 2,
        parameter_count: null,
        min_gpu_vram_gb: 8,
        use_cases: '["embedding"]',
      }];
    }
    if (query.includes('FROM cost_rates')) {
      return [{ model: '__default__', token_rate_halala: 19 }];
    }
    if (query.includes('FROM provider_engines')) {
      return engineProviders;
    }
    if (query.includes('FROM providers')) {
      return providers;
    }
    return [];
  });

  const router = require('../routes/v1');
  const app = express();
  app.use(express.json());
  app.use('/v1', router);
  return app;
}

describe('/v1/models provider_count honesty', () => {
  afterEach(() => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
  });

  test('counts fresh providers whose cached model matches a catalog alias', async () => {
    const app = buildApp({
      providers: [{
        id: 1,
        cached_models: JSON.stringify(['bge-m3']),
        vram_mb: 24576,
        last_heartbeat: new Date().toISOString(),
      }],
    });

    const res = await request(app).get('/v1/models');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'BAAI/bge-m3',
      provider_count: 1,
    });
  });

  test('counts fresh multi-engine providers whose served model matches a catalog alias', async () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    const app = buildApp({
      providers: [],
      engineProviders: [{
        id: 3,
        engine_served_models: JSON.stringify(['bge-m3']),
        last_heartbeat: new Date().toISOString(),
      }],
    });

    const res = await request(app).get('/v1/models');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'BAAI/bge-m3',
      provider_count: 1,
    });
  });

  test('does not double count the same provider across cached_models and provider_engines', async () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    const app = buildApp({
      providers: [{
        id: 4,
        cached_models: JSON.stringify(['bge-m3']),
        vram_mb: 24576,
        last_heartbeat: new Date().toISOString(),
      }],
      engineProviders: [{
        id: 4,
        engine_served_models: JSON.stringify(['BAAI/bge-m3']),
        last_heartbeat: new Date().toISOString(),
      }],
    });

    const res = await request(app).get('/v1/models');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'BAAI/bge-m3',
      provider_count: 1,
    });
  });

  test('does not count stale-heartbeat providers even when cached_models match', async () => {
    const staleHeartbeat = new Date(Date.now() - (11 * 60 * 1000)).toISOString();
    const app = buildApp({
      providers: [{
        id: 2,
        cached_models: JSON.stringify(['bge-m3']),
        vram_mb: 24576,
        last_heartbeat: staleHeartbeat,
      }],
    });

    const res = await request(app).get('/v1/models');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'BAAI/bge-m3',
      provider_count: 0,
    });
  });
});
