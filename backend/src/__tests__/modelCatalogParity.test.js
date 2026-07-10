'use strict';

const express = require('express');
const request = require('supertest');

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
  prepare: jest.fn(() => ({ run: jest.fn() })),
};
const mockGetEarnedRoutingState = jest.fn();
const mockRecordOpenRouterUsage = jest.fn(() => ({ id: 'oru_test' }));

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  publicEndpointLimiter: (_req, _res, next) => next(),
  modelCatalogLimiter: (_req, _res, next) => next(),
  modelDeployLimiter: (_req, _res, next) => next(),
  vllmCompleteLimiter: (_req, _res, next) => next(),
  vllmStreamLimiter: (_req, _res, next) => next(),
}));
jest.mock('../middleware/auth', () => ({
  looksLikeProviderKey: () => false,
}));
jest.mock('../services/providerVerification', () => ({
  getEarnedRoutingState: (...args) => mockGetEarnedRoutingState(...args),
}));
jest.mock('../services/openrouterSettlementService', () => ({
  recordOpenRouterUsage: (...args) => mockRecordOpenRouterUsage(...args),
}));
jest.mock('../services/billingService', () => ({
  estimateInferenceCost: jest.fn(() => 1),
  checkBalanceGate: jest.fn(() => ({
    ok: true,
    balanceHalala: 5000,
    subCreditsHalala: 0,
    totalAvailableHalala: 5000,
    estimateHalala: 1,
  })),
  checkBudgetCap: jest.fn(() => ({ capped: false, ok: true })),
  settleInferenceOnce: jest.fn(() => ({ status: 'settled' })),
}));

const MODEL_ID = 'qwen/qwen3-32b';
const NOW = '2026-07-08T19:55:00.000Z';

function registryRow(overrides = {}) {
  return {
    id: 101,
    model_id: MODEL_ID,
    display_name: 'Qwen 3 32B',
    family: 'qwen',
    vram_gb: 24,
    quantization: 'fp16',
    context_window: 32768,
    use_cases: JSON.stringify(['chat', 'reasoning', 'tool calling', 'arabic']),
    min_gpu_vram_gb: 16,
    default_price_halala_per_min: 15,
    price_in_halala_per_1m_tok: 80,
    price_out_halala_per_1m_tok: 150,
    is_active: 1,
    updated_at: NOW,
    parameter_count: '32B',
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
    providers_online: 1,
    providers_warm: 1,
    avg_price_sar_per_min: 0.15,
    min_price_halala_per_min: 15,
    max_price_halala_per_min: 15,
    ...overrides,
  };
}

function providerRow(overrides = {}) {
  return {
    id: 77,
    status: 'online',
    is_paused: 0,
    last_heartbeat: new Date().toISOString(),
    supported_compute_types: JSON.stringify(['inference']),
    vram_mb: 24 * 1024,
    gpu_vram_mb: null,
    gpu_vram_mib: null,
    vram_gb: null,
    price_per_min_halala: 15,
    model_preload_status: 'ready',
    model_preload_model: MODEL_ID,
    cached_models: JSON.stringify([MODEL_ID]),
    endpoint_reachable: 1,
    endpoint_probed_at: NOW,
    ...overrides,
  };
}

function tableInfoRows() {
  return [
    'model_id',
    'display_name',
    'family',
    'created_at',
    'context_window',
    'quantization',
    'vram_gb',
    'default_price_halala_per_min',
    'price_in_halala_per_1m_tok',
    'price_out_halala_per_1m_tok',
    'parameter_count',
    'min_gpu_vram_gb',
    'use_cases',
    'is_active',
  ].map((name) => ({ name }));
}

function installCatalogMock() {
  const model = registryRow();
  const provider = providerRow();
  const costRates = [
    { model: MODEL_ID, token_rate_halala: 999, model_class: 'llm' },
    { model: '__default__', token_rate_halala: 19, model_class: 'default' },
  ];

  mockDb.all.mockImplementation((sql) => {
    const query = String(sql);
    if (query.includes('PRAGMA table_info(model_registry)')) return tableInfoRows();
    if (query.includes('FROM provider_engines')) return [];
    if (query.includes('FROM model_registry')) return [model];
    if (query.includes('FROM providers')) return [provider];
    if (query.includes('FROM cost_rates')) return costRates;
    return [];
  });
}

function buildApp() {
  jest.resetModules();
  const v1Router = require('../routes/v1');
  const modelsRouter = require('../routes/models');
  if (typeof modelsRouter.invalidateCatalogCache === 'function') {
    modelsRouter.invalidateCatalogCache();
  }

  const app = express();
  app.use(express.json());
  app.use('/v1', v1Router);
  app.use('/api/models', modelsRouter);
  return app;
}

describe('model catalog contract parity', () => {
  beforeEach(() => {
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    mockRecordOpenRouterUsage.mockReset();
    mockGetEarnedRoutingState.mockReset();
    mockGetEarnedRoutingState.mockReturnValue({
      active: false,
      servingIds: new Set(),
      deadIds: new Set(),
    });
    installCatalogMock();
    delete process.env.DCP_ROUTING_EARNED_MODE;
  });

  afterEach(() => {
    delete process.env.DCP_ROUTING_EARNED_MODE;
  });

  test('keeps pricing, capability flags, readiness, and provider count aligned across model surfaces', async () => {
    const app = buildApp();

    const [v1Response, legacyResponse, catalogResponse] = await Promise.all([
      request(app).get('/v1/models'),
      request(app).get('/api/models'),
      request(app).get('/api/models/catalog'),
    ]);

    expect(v1Response.status).toBe(200);
    expect(legacyResponse.status).toBe(200);
    expect(catalogResponse.status).toBe(200);

    const v1Model = v1Response.body.data.find((model) => model.id === MODEL_ID);
    const legacyModel = legacyResponse.body.find((model) => model.model_id === MODEL_ID);
    const catalogModel = catalogResponse.body.models.find((model) => model.model_id === MODEL_ID);

    expect(v1Model).toBeTruthy();
    expect(legacyModel).toBeTruthy();
    expect(catalogModel).toBeTruthy();

    const expectedPricing = {
      halala_per_1m_input_tokens: 80,
      halala_per_1m_output_tokens: 150,
      sar_per_1m_input_tokens: '0.8000',
      sar_per_1m_output_tokens: '1.5000',
      usd_per_1m_input_tokens: '0.213333',
      usd_per_1m_output_tokens: '0.400000',
      billing_unit: 'per_1m_tokens',
      source: 'model_registry',
      contract: {
        version: 'dcp.model_token_pricing.v1',
        currency: 'SAR',
        billing_unit: 'per_1m_tokens',
        source: 'model_registry',
        source_contract: 'model_registry.price_in_halala_per_1m_tok/price_out_halala_per_1m_tok',
        usd_display_only: true,
        settlement_path: 'POST /v1/chat/completions usage.pricing',
        claim_guards: {
          changes_billing: false,
          changes_settlement: false,
          changes_provider_selection: false,
          changes_request_routing: false,
        },
      },
    };

    expect(v1Model.pricing).toMatchObject(expectedPricing);
    expect(legacyModel.token_pricing).toMatchObject({
      ...expectedPricing,
      model_class: 'llm',
    });
    expect(catalogModel.pricing.token_pricing).toEqual(legacyModel.token_pricing);

    expect(v1Model.provider_count).toBe(1);
    expect(legacyModel.provider_count).toBe(1);
    expect(catalogModel.provider_count).toBe(1);
    expect(v1Model.available).toBe(true);
    expect(legacyModel.available).toBe(true);
    expect(catalogModel.available).toBe(true);

    const expectedCapabilityFlags = {
      chat_completions: true,
      streaming: true,
      reasoning: true,
      tool_calling: true,
      multilingual: true,
      prompt_caching: false,
      batch: false,
      lora: false,
      dedicated_deployment: false,
    };
    expect(v1Model.capability_flags).toMatchObject(expectedCapabilityFlags);
    expect(legacyModel.capability_flags).toEqual(v1Model.capability_flags);
    expect(catalogModel.capability_flags).toEqual(v1Model.capability_flags);
    expect(v1Model.capabilities).toEqual(v1Model.capability_flags);
    expect(legacyModel.capabilities).toEqual(legacyModel.capability_flags);
    expect(catalogModel.capabilities).toEqual(catalogModel.capability_flags);
    expect(v1Model.capability_contract).toMatchObject({
      version: 'dcp.model_capability_contract.v1',
      source: 'model_registry.use_cases',
      source_fields: {
        supported_features: 'supported_features',
        live_flags: 'capability_flags',
        gated_products: 'feature_readiness',
      },
      supported_features: ['chat.completions', 'multilingual', 'reasoning', 'tool_calling'],
      live_capability_flags: {
        chat_completions: true,
        streaming: true,
        tool_calling: true,
        reasoning: true,
        multilingual: true,
      },
      gated_product_flags: {
        prompt_caching: {
          flag: false,
          readiness_field: 'feature_readiness.prompt_caching',
          status: 'measurement_only',
          available: false,
          next: 'validate_hit_measurement_before_discount',
        },
        batch: {
          flag: false,
          readiness_field: 'feature_readiness.batch',
          status: 'api_metadata_only',
          available: false,
          next: 'enable_worker_result_artifact_and_settlement',
        },
        lora: {
          flag: false,
          readiness_field: 'feature_readiness.lora',
          status: 'metadata_only',
          available: false,
          next: 'run_gpu_training_proof_then_enable_adapter_serving',
        },
        dedicated_deployment: {
          flag: false,
          readiness_field: 'feature_readiness.dedicated_deployment',
          status: 'gated',
          available: false,
          next: 'create_deployment_then_attach_vllm_load_proof',
        },
      },
      claim_guards: {
        capability_flags_are_metadata_only: true,
        use_feature_readiness_for_gated_products: true,
        changes_model_availability: false,
        changes_provider_selection: false,
        changes_request_routing: false,
        enables_prompt_cache_discount: false,
        enables_batch_execution: false,
        enables_lora_serving: false,
        enables_dedicated_deployment_routing: false,
      },
    });
    expect(legacyModel.capability_contract).toEqual(v1Model.capability_contract);
    expect(catalogModel.capability_contract).toEqual(v1Model.capability_contract);

    expect(v1Model.feature_readiness).toMatchObject({
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
    expect(legacyModel.feature_readiness).toEqual(v1Model.feature_readiness);
    expect(catalogModel.feature_readiness).toEqual(v1Model.feature_readiness);

    expect(catalogModel.modalities).toEqual(v1Model.modalities);
    expect(legacyModel.modalities).toEqual(v1Model.modalities);
    expect(catalogModel.max_output_tokens).toEqual(v1Model.max_output_tokens);
    expect(legacyModel.max_output_tokens).toEqual(v1Model.max_output_tokens);
  });
});
