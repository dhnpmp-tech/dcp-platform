import { expect, test } from '@playwright/test';

test('pricing page surfaces live model feature-readiness gates', async ({ page }) => {
  await page.route('**/v1/models', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'qwen/qwen3-coder',
          name: 'Qwen 3 Coder',
          available: true,
          status: 'available',
          provider_count: 2,
          context_length: 32768,
          max_output_tokens: 4096,
          pricing: {
            sar_per_1m_input_tokens: '0.3000',
            sar_per_1m_output_tokens: '0.6000',
            source: 'model_registry',
          },
          capability_flags: {
            streaming: true,
            tool_calling: true,
            code_generation: true,
            multilingual: true,
          },
          feature_readiness: {
            version: 'dcp.model_feature_readiness.v1',
            prompt_caching: {
              status: 'measurement_only',
              available: false,
              next: 'validate_hit_measurement_before_discount',
            },
            batch: {
              status: 'api_metadata_only',
              available: false,
              next: 'enable_worker_result_artifact_and_settlement',
            },
            lora: {
              status: 'metadata_only',
              available: false,
              next: 'run_gpu_training_proof_then_enable_adapter_serving',
            },
            dedicated_deployment: {
              status: 'gated',
              available: false,
              next: 'create_deployment_then_attach_vllm_load_proof',
            },
          },
        },
        {
          id: 'deepseek/deepseek-v3',
          name: 'DeepSeek V3',
          available: true,
          status: 'available',
          provider_count: 1,
          context_length: 65536,
          max_output_tokens: 8192,
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
            prompt_caching: {
              status: 'measurement_only',
              available: false,
              next: 'validate_hit_measurement_before_discount',
            },
            batch: {
              status: 'api_metadata_only',
              available: false,
              next: 'enable_worker_result_artifact_and_settlement',
            },
            lora: {
              status: 'metadata_only',
              available: false,
              next: 'run_gpu_training_proof_then_enable_adapter_serving',
            },
            dedicated_deployment: {
              status: 'gated',
              available: false,
              next: 'create_deployment_then_attach_vllm_load_proof',
            },
          },
        },
        {
          id: 'future/model',
          name: 'Future Model',
          available: false,
          status: 'no_providers',
          provider_count: 0,
          context_length: 131072,
          pricing: {
            sar_per_1m_input_tokens: '2.0000',
            sar_per_1m_output_tokens: '4.0000',
            source: 'model_registry',
          },
          feature_readiness: {
            version: 'dcp.model_feature_readiness.v1',
            prompt_caching: { status: 'not_applicable', available: false },
            batch: { status: 'not_applicable', available: false },
            lora: { status: 'not_applicable', available: false },
            dedicated_deployment: { status: 'not_applicable', available: false },
          },
        },
      ],
    }),
  }));

  await page.goto('/pricing');

  const catalog = page.locator('.pricing-live-catalog');
  await expect(catalog).toContainText('Live API catalog');
  await expect(catalog).toContainText('/v1/models');
  await expect(catalog).toContainText('2 serveable models');
  await expect(catalog).toContainText('Qwen 3 Coder');
  await expect(catalog).toContainText('2 live');
  await expect(catalog).toContainText('SAR 0.30');
  await expect(catalog).toContainText('SAR 0.60');
  await expect(catalog).toContainText('DeepSeek V3');
  await expect(catalog).not.toContainText('Future Model');

  const readiness = page.getByLabel('Advanced model feature readiness');
  await expect(readiness).toContainText('Advanced readiness');
  await expect(readiness).toContainText('/v1/models feature_readiness');
  await expect(readiness).toContainText('dcp.model_feature_readiness.v1');
  await expect(readiness).toContainText('Rates are live; advanced economics stay gated until proof closes');
  await expect(readiness).toContainText('Prompt cache');
  await expect(readiness).toContainText('measurement only');
  await expect(readiness).toContainText('2 serveable models covered');
  await expect(readiness).toContainText('Discounts gated');
  await expect(readiness).toContainText('validate_hit_measurement_before_discount');
  await expect(readiness).toContainText('Batch API');
  await expect(readiness).toContainText('api metadata only');
  await expect(readiness).toContainText('Execution gated');
  await expect(readiness).toContainText('enable_worker_result_artifact_and_settlement');
  await expect(readiness).toContainText('LoRA');
  await expect(readiness).toContainText('metadata only');
  await expect(readiness).toContainText('Serving gated');
  await expect(readiness).toContainText('run_gpu_training_proof_then_enable_adapter_serving');
  await expect(readiness).toContainText('Dedicated deployments');
  await expect(readiness).toContainText('gated');
  await expect(readiness).toContainText('Load proof required');
  await expect(readiness).toContainText('create_deployment_then_attach_vllm_load_proof');
});
