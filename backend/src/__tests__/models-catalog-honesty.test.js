'use strict';

const express = require('express');
const request = require('supertest');

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
};

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  publicEndpointLimiter: (_req, _res, next) => next(),
  modelCatalogLimiter: (_req, _res, next) => next(),
  modelDeployLimiter: (_req, _res, next) => next(),
}));
jest.mock('../middleware/auth', () => ({
  looksLikeProviderKey: () => false,
}));
jest.mock('../services/providerVerification', () => ({
  getEarnedRoutingState: jest.fn(() => ({
    active: false,
    servingIds: new Set(),
    deadIds: new Set(),
  })),
}));

const { getEarnedRoutingState } = require('../services/providerVerification');
const modelsRouter = require('../routes/models');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/models', modelsRouter);
  return app;
}

function modelRow(overrides = {}) {
  return {
    model_id: 'BAAI/bge-m3',
    display_name: 'BGE M3',
    family: 'embedding',
    vram_gb: 8,
    quantization: 'q4',
    context_window: 8192,
    use_cases: JSON.stringify(['embed']),
    min_gpu_vram_gb: 4,
    default_price_halala_per_min: 2,
    is_active: 1,
    updated_at: '2026-06-03T00:00:00.000Z',
    benchmark_suite: null,
    latency_p50_ms: null,
    latency_p95_ms: null,
    latency_p99_ms: null,
    arabic_mmlu_score: null,
    arabicaqa_score: null,
    cost_per_1k_tokens_halala: null,
    vram_required_gb: null,
    cold_start_ms: null,
    measured_at: null,
    notes_en: null,
    notes_ar: null,
    providers_online: 0,
    providers_warm: 0,
    avg_price_sar_per_min: 0.02,
    min_price_halala_per_min: 2,
    max_price_halala_per_min: 2,
    ...overrides,
  };
}

function providerRow(overrides = {}) {
  return {
    id: 7,
    status: 'online',
    is_paused: 0,
    last_heartbeat: new Date().toISOString(),
    supported_compute_types: JSON.stringify(['inference']),
    vram_mb: 24 * 1024,
    gpu_vram_mb: null,
    gpu_vram_mib: null,
    vram_gb: null,
    price_per_min_halala: 2,
    model_preload_status: 'ready',
    model_preload_model: 'BAAI/bge-m3',
    cached_models: JSON.stringify(['bge-m3']),
    endpoint_reachable: 1,
    endpoint_probed_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockCatalog({ providers = [providerRow()] } = {}) {
  mockDb.all.mockImplementation((sql) => {
    const query = String(sql);
    if (query.includes('FROM model_registry')) return [modelRow()];
    if (query.includes('FROM providers')) return providers;
    if (query.includes('FROM cost_rates')) return [];
    return [];
  });
}

describe('/api/models catalog honesty', () => {
  beforeEach(() => {
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    getEarnedRoutingState.mockReset();
    getEarnedRoutingState.mockReturnValue({
      active: false,
      servingIds: new Set(),
      deadIds: new Set(),
    });
    modelsRouter.invalidateCatalogCache();
    delete process.env.DCP_ROUTING_EARNED_MODE;
  });

  afterEach(() => {
    delete process.env.DCP_ROUTING_EARNED_MODE;
  });

  test('does not advertise a heartbeat-only provider as available', async () => {
    mockCatalog({
      providers: [providerRow({ endpoint_reachable: 0, endpoint_probed_at: null })],
    });

    const hidden = await request(buildApp()).get('/api/models');
    expect(hidden.status).toBe(200);
    expect(hidden.body).toEqual([]);

    const visible = await request(buildApp()).get('/api/models?include_unavailable=true');
    expect(visible.status).toBe(200);
    expect(visible.body).toHaveLength(1);
    expect(visible.body[0]).toMatchObject({
      model_id: 'BAAI/bge-m3',
      providers_online: 0,
      status: 'no_providers',
    });
  });

  test('requires provider cached_models to match the advertised model or alias', async () => {
    mockCatalog({
      providers: [providerRow({ cached_models: JSON.stringify(['qwen3:8b']) })],
    });

    const response = await request(buildApp()).get('/api/models?include_unavailable=true');

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      model_id: 'BAAI/bge-m3',
      providers_online: 0,
      status: 'no_providers',
    });
  });

  test('counts a reachable provider that advertises a canonical model alias', async () => {
    mockCatalog({
      providers: [providerRow({ cached_models: JSON.stringify(['bge-m3']) })],
    });

    const response = await request(buildApp()).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      model_id: 'BAAI/bge-m3',
      providers_online: 1,
      status: 'available',
    });
  });

  test('drops freshly failed providers from availability when earned routing is active', async () => {
    getEarnedRoutingState.mockReturnValue({
      active: true,
      servingIds: new Set(),
      deadIds: new Set([7]),
    });
    mockCatalog({
      providers: [providerRow()],
    });

    const response = await request(buildApp()).get('/api/models?include_unavailable=true');

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      model_id: 'BAAI/bge-m3',
      providers_online: 0,
      status: 'no_providers',
    });
  });

  test('does not prepare a deploy handoff when no verified provider can serve the model', async () => {
    mockDb.get.mockImplementation((sql) => {
      if (String(sql).includes('FROM renters')) {
        return {
          id: 1,
          api_key: 'dcp-renter-test',
          balance_halala: 10000,
          status: 'active',
        };
      }
      return null;
    });
    mockCatalog({
      providers: [providerRow({ endpoint_reachable: 0, endpoint_probed_at: null })],
    });

    const response = await request(buildApp())
      .post('/api/models/BAAI/bge-m3/deploy')
      .set('x-renter-key', 'dcp-renter-test')
      .send({ duration_minutes: 10 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'model_unavailable',
      error: 'No verified providers are currently serving this model',
    });
  });
});
