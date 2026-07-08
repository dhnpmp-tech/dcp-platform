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
    price_in_halala_per_1m_tok: 8,
    price_out_halala_per_1m_tok: 0,
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

function mockCatalog({
  providers = [providerRow()],
  modelOverrides = {},
  costRates = [
    { model: 'BAAI/bge-m3', token_rate_halala: 999, model_class: 'embedding' },
    { model: '__default__', token_rate_halala: 19, model_class: 'default' },
  ],
} = {}) {
  mockDb.all.mockImplementation((sql) => {
    const query = String(sql);
    if (query.includes('FROM model_registry')) return [modelRow(modelOverrides)];
    if (query.includes('FROM providers')) return providers;
    if (query.includes('FROM cost_rates')) return costRates;
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

  test('adds token pricing and proof-gated capability metadata to legacy model list', async () => {
    mockCatalog({
      providers: [providerRow({ cached_models: JSON.stringify(['bge-m3']) })],
    });

    const response = await request(buildApp()).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      model_id: 'BAAI/bge-m3',
      provider_count: 1,
      available: true,
      token_pricing: {
        halala_per_1m_input_tokens: 8,
        halala_per_1m_output_tokens: 0,
        sar_per_1m_input_tokens: '0.0800',
        sar_per_1m_output_tokens: '0.0000',
        billing_unit: 'per_1m_tokens',
        source: 'model_registry',
        model_class: 'embedding',
      },
      capability_flags: {
        chat_completions: false,
        streaming: false,
        embeddings: true,
        reranking: false,
        vision: false,
        dedicated_deployment: false,
        lora: false,
        prompt_caching: false,
        batch: false,
      },
      feature_readiness: {
        version: 'dcp.model_feature_readiness.v1',
        prompt_caching: {
          status: 'not_applicable',
          available: false,
          usage_metadata: false,
          billing_discount: false,
        },
        batch: {
          status: 'not_applicable',
          available: false,
          api_available: false,
          execution_enabled: false,
        },
        lora: {
          status: 'not_applicable',
          adapter_registry_api: false,
          training_job_api: false,
          serving_enabled: false,
        },
        dedicated_deployment: {
          status: 'not_applicable',
          api_available: false,
          serving_enabled: false,
        },
      },
      modalities: ['text'],
      supported_features: ['embeddings'],
    });
    expect(response.body[0].capabilities).toEqual(response.body[0].capability_flags);
  });

  test('adds the same token and capability contract to managed catalog feed', async () => {
    mockCatalog({
      providers: [providerRow({ cached_models: JSON.stringify(['bge-m3']) })],
      modelOverrides: {
        use_cases: JSON.stringify(['chat', 'reasoning', 'tool calling', 'arabic']),
        price_in_halala_per_1m_tok: 80,
        price_out_halala_per_1m_tok: 150,
      },
    });

    const legacyResponse = await request(buildApp()).get('/api/models');
    const response = await request(buildApp()).get('/api/models/catalog');

    expect(legacyResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body.total_models).toBe(1);
    expect(legacyResponse.body[0].token_pricing).toMatchObject({
      prompt_tokens: '0.000000',
      completion_tokens: '0.000000',
      halala_per_1m_input_tokens: 80,
      halala_per_1m_output_tokens: 150,
      sar_per_1m_input_tokens: '0.8000',
      sar_per_1m_output_tokens: '1.5000',
      source: 'model_registry',
      model_class: 'embedding',
    });
    expect(response.body.models[0].pricing.token_pricing).toMatchObject({
      halala_per_1m_input_tokens: 80,
      halala_per_1m_output_tokens: 150,
      sar_per_1m_input_tokens: '0.8000',
      sar_per_1m_output_tokens: '1.5000',
      source: 'model_registry',
    });
    expect(response.body.models[0].pricing.token_pricing).toEqual(legacyResponse.body[0].token_pricing);
    expect(response.body.models[0].capability_flags).toMatchObject({
      chat_completions: true,
      streaming: true,
      reasoning: true,
      tool_calling: true,
      multilingual: true,
      batch: false,
      prompt_caching: false,
      lora: false,
    });
    expect(response.body.models[0].feature_readiness).toMatchObject({
      version: 'dcp.model_feature_readiness.v1',
      prompt_caching: {
        status: 'measurement_only',
        available: false,
        usage_metadata: true,
        billing_discount: false,
        settlement_enabled: false,
      },
      batch: {
        status: 'api_metadata_only',
        available: false,
        api_available: true,
        execution_enabled: false,
        discount_enabled: false,
      },
      lora: {
        status: 'metadata_only',
        available: false,
        adapter_registry_api: true,
        training_job_api: true,
        serving_enabled: false,
      },
      dedicated_deployment: {
        status: 'gated',
        available: false,
        api_available: true,
        serving_enabled: false,
        route_traffic: false,
      },
    });
    expect(response.body.models[0].feature_readiness).toEqual(legacyResponse.body[0].feature_readiness);
    expect(response.body.models[0].capabilities).toEqual(response.body.models[0].capability_flags);
  });

  test('falls back to active cost_rates for token pricing when registry token rates are absent', async () => {
    mockCatalog({
      providers: [providerRow({ cached_models: JSON.stringify(['bge-m3']) })],
      modelOverrides: {
        price_in_halala_per_1m_tok: null,
        price_out_halala_per_1m_tok: null,
      },
      costRates: [
        { model: '__default__', token_rate_halala: 42, model_class: 'default' },
      ],
    });

    const response = await request(buildApp()).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body[0].token_pricing).toMatchObject({
      halala_per_1m_input_tokens: 42,
      halala_per_1m_output_tokens: 42,
      sar_per_1m_input_tokens: '0.4200',
      sar_per_1m_output_tokens: '0.4200',
      source: 'cost_rates',
      model_class: 'default',
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
