import { expect, test } from '@playwright/test';

const modelCatalog = {
  object: 'list',
  data: [
    {
      id: 'ALLaM-AI/ALLaM-7B-Instruct-preview',
      name: 'ALLaM 7B Instruct',
      available: false,
      status: 'no_providers',
      provider_count: 0,
      context_length: 8192,
      pricing: {
        sar_per_1m_input_tokens: '0.8000',
        sar_per_1m_output_tokens: '1.5000',
        source: 'model_registry',
      },
      feature_readiness: {
        version: 'dcp.model_feature_readiness.v1',
        prompt_caching: { status: 'measurement_only', available: false, next: 'validate_hit_measurement_before_discount' },
        batch: { status: 'api_metadata_only', available: false, next: 'enable_worker_result_artifact_and_settlement' },
        lora: { status: 'metadata_only', available: false, next: 'run_gpu_training_proof_then_enable_adapter_serving' },
        dedicated_deployment: { status: 'gated', available: false, next: 'create_deployment_then_attach_vllm_load_proof' },
      },
    },
    {
      id: 'qwen2.5:7b',
      name: 'Qwen 2.5 7B',
      available: true,
      status: 'available',
      provider_count: 1,
      context_length: 32768,
      max_output_tokens: 4096,
      pricing: {
        sar_per_1m_input_tokens: '0.3000',
        sar_per_1m_output_tokens: '0.6000',
        source: 'model_registry',
      },
      capability_flags: {
        streaming: true,
        multilingual: true,
        code_generation: true,
      },
      feature_readiness: {
        version: 'dcp.model_feature_readiness.v1',
        prompt_caching: { status: 'measurement_only', available: false, next: 'validate_hit_measurement_before_discount' },
        batch: { status: 'api_metadata_only', available: false, next: 'enable_worker_result_artifact_and_settlement' },
        lora: { status: 'metadata_only', available: false, next: 'run_gpu_training_proof_then_enable_adapter_serving' },
        dedicated_deployment: { status: 'gated', available: false, next: 'create_deployment_then_attach_vllm_load_proof' },
      },
    },
    {
      id: 'qwen3:30b-a3b',
      name: 'Qwen 3 30B-A3B',
      available: true,
      status: 'available',
      provider_count: 2,
      context_length: 131072,
      pricing: {
        sar_per_1m_input_tokens: '0.8000',
        sar_per_1m_output_tokens: '1.5000',
        source: 'model_registry',
      },
      capability_flags: {
        streaming: true,
        reasoning: true,
        multilingual: true,
      },
      feature_readiness: {
        version: 'dcp.model_feature_readiness.v1',
        prompt_caching: { status: 'measurement_only', available: false, next: 'validate_hit_measurement_before_discount' },
        batch: { status: 'api_metadata_only', available: false, next: 'enable_worker_result_artifact_and_settlement' },
        lora: { status: 'metadata_only', available: false, next: 'run_gpu_training_proof_then_enable_adapter_serving' },
        dedicated_deployment: { status: 'gated', available: false, next: 'create_deployment_then_attach_vllm_load_proof' },
      },
    },
    {
      id: 'qwen3.6-35b',
      name: 'Qwen 3.6 35B',
      available: false,
      status: 'no_providers',
      provider_count: 0,
      context_length: 131072,
      pricing: {
        sar_per_1m_input_tokens: '0.8000',
        sar_per_1m_output_tokens: '1.5000',
      },
      feature_readiness: {
        version: 'dcp.model_feature_readiness.v1',
        prompt_caching: { status: 'measurement_only', available: false },
        batch: { status: 'api_metadata_only', available: false },
        lora: { status: 'metadata_only', available: false },
        dedicated_deployment: { status: 'gated', available: false },
      },
    },
  ],
};

const benchmarkReadiness = {
  object: 'benchmark_readiness',
  version: 'dcp.benchmark_readiness.v1',
  benchmark_suite: 'saudi-arabic-v1',
  summary: {
    live_measured_models: 0,
    live_quality_rows: 0,
    launch_ready_models: 0,
    public_quality_claim_allowed: false,
  },
  claim_guards: {
    arabic_quality_claim_allowed: false,
    public_ranking_allowed: false,
    customer_case_study_allowed: false,
    frontier_model_comparison_allowed: false,
  },
  next_actions: [
    'Promote a reproducible Saudi customer-support eval harness before any quality claim.',
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/models', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(modelCatalog),
  }));
  await page.route('**/api/models/benchmarks/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(benchmarkReadiness),
  }));
});

test('ALLaM page separates catalog-only state from live availability', async ({ page }) => {
  await page.goto('/models/allam');

  await expect(page.getByRole('heading', { name: /ALLaM for Saudi Arabic workloads/i })).toBeVisible();
  await expect(page.getByLabel('Model page evidence sources')).toContainText('/v1/models');
  await expect(page.getByLabel('Model page evidence sources')).toContainText('/api/models/benchmarks/readiness');

  const liveStatus = page.getByLabel('Model family live catalog status');
  await expect(liveStatus).toContainText('1');
  await expect(liveStatus).toContainText('0');
  await expect(liveStatus).toContainText('Catalog-only');
  await expect(liveStatus).toContainText('gated');

  const cards = page.locator('.model-row-grid');
  await expect(cards).toContainText('ALLaM 7B Instruct');
  await expect(cards).toContainText('catalog-only');
  await expect(cards).toContainText('SAR 0.80');
  await expect(page.getByLabel('Advanced model readiness')).toContainText('Prompt cache');
  await expect(page.getByLabel('Advanced model readiness')).toContainText('measurement only');
  await expect(page.getByLabel('Benchmark claim guards')).toContainText('arabic_quality_claim_allowed');
  await expect(page.getByLabel('Benchmark claim guards')).toContainText('false');
  await expect(page.getByLabel('Model API snippet')).toContainText('MODEL_ID_FROM_V1_MODELS');
});

test('Qwen Arabic page shows live served rows and keeps Arabic claims gated', async ({ page }) => {
  await page.goto('/models/qwen-arabic');

  await expect(page.getByRole('heading', { name: /Qwen-family models for Arabic and coding workloads/i })).toBeVisible();

  const liveStatus = page.getByLabel('Model family live catalog status');
  await expect(liveStatus).toContainText('3');
  await expect(liveStatus).toContainText('2');
  await expect(liveStatus).toContainText('1');
  await expect(liveStatus).toContainText('gated');

  const cards = page.locator('.model-row-grid');
  await expect(cards).toContainText('Qwen 2.5 7B');
  await expect(cards).toContainText('serveable now');
  await expect(cards).toContainText('1 live providers');
  await expect(cards).toContainText('SAR 0.30');
  await expect(cards).toContainText('Qwen 3 30B-A3B');
  await expect(cards).not.toContainText('Qwen 3.6 35B');
  await expect(page.getByLabel('Advanced model readiness')).toContainText('LoRA adapters');
  await expect(page.getByLabel('Advanced model readiness')).toContainText('metadata only');
  await expect(page.getByLabel('Benchmark claim guards')).toContainText('saudi-arabic-v1');
  await expect(page.getByLabel('Model API snippet')).toContainText('model="qwen2.5:7b"');
});
