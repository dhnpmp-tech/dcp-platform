import { expect, test } from '@playwright/test';

test('public inference page renders live model catalog metadata', async ({ page }) => {
  await page.route('**/v1/router/policies', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      version: 'dcp.inference_routing_policies.v1',
      default_policy: 'balanced',
      request_selectable: false,
      data: [
        {
          id: 'balanced',
          label: 'Balanced',
          status: 'available',
          available: true,
          default: true,
          request_selectable: false,
        },
      ],
    }),
  }));

  await page.route('**/v1/prompt-cache/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'prompt_cache_readiness',
      version: 'dcp.prompt_cache.v1',
      current_mode: 'measurement_only_no_discount',
      status: 'available_measurement_only',
      measurement: {
        hash_only: true,
        stores_raw_prompt: false,
        stores_static_prefix: false,
      },
      billing: {
        discounts_enabled: false,
        settlement_discount_enabled: false,
      },
      claims: {
        prompt_cache_discount: false,
        provider_kv_cache_control: false,
        tinker_compatible: false,
      },
      live_acceptance: {
        provider_discount_smoke: {
          status: 'blocked_external',
          command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
          live_acceptance_gate: 'prompt_cache_provider_discount_smoke',
          blocked_on: ['funded smoke principal', 'provider cache-hit evidence', 'settlement discount policy approval'],
          verifies: ['live hit metadata', 'no discount while disabled', 'settlement discount policy remains disabled'],
        },
      },
    }),
  }));

  await page.route('**/v1/prompt-cache/settlement/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'prompt_cache_settlement_readiness',
      version: 'dcp.prompt_cache_settlement_readiness.v1',
      current_mode: 'settlement_policy_contract_only',
      endpoints: {
        settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
        prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
        live_settlement_proof: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
      },
      policy: {
        cached_input_discounts_enabled: false,
        settlement_discounts_enabled: false,
        settlement_mutations_enabled: false,
        required_before_discount: ['hash_only_measurement', 'live_provider_cache_hit_evidence'],
        provider_cache_hit_evidence: { status: 'blocked_external', required: true },
        discount_policy: { status: 'policy_pending', discount_bps_live: 0 },
      },
      denial_codes: ['prompt_cache_discount_disabled', 'prompt_cache_provider_hit_required'],
      claim_guards: {
        mutates_balance: false,
        records_usage_event: false,
        dispatches_inference: false,
        stores_raw_prompt: false,
        claims_tinker_compatibility: false,
      },
    }),
  }));

  await page.route('**/v1/models', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'qwen2.5:7b',
          name: 'Qwen 2.5 7B',
          available: true,
          provider_count: 1,
          context_length: 32768,
          pricing: {
            sar_per_1m_input_tokens: '0.3000',
            sar_per_1m_output_tokens: '0.6000',
            source: 'model_registry',
            contract: {
              version: 'dcp.model_token_pricing.v1',
              source_contract: 'model_registry.price_in_halala_per_1m_tok/price_out_halala_per_1m_tok',
              usd_display_only: true,
            },
          },
          capability_flags: { streaming: true },
        },
        {
          id: 'future/model',
          name: 'Future Model',
          available: false,
          provider_count: 0,
          context_length: 131072,
          pricing: {
            sar_per_1m_input_tokens: '2.0000',
            sar_per_1m_output_tokens: '4.0000',
            source: 'model_registry',
            contract: {
              version: 'dcp.model_token_pricing.v1',
              source_contract: 'model_registry.price_in_halala_per_1m_tok/price_out_halala_per_1m_tok',
              usd_display_only: true,
            },
          },
          status: 'no_providers',
          capability_flags: { vision: true, lora: true },
        },
      ],
    }),
  }));

  await page.goto('/inference');

  const catalogRail = page.locator('.inference-model-live');
  await expect(catalogRail).toContainText('Live model catalog');
  await expect(catalogRail).toContainText('GET /v1/models');
  await expect(catalogRail).toContainText('Serving models');
  await expect(catalogRail).toContainText('1/2');
  await expect(catalogRail).toContainText('Provider-backed');
  await expect(catalogRail).toContainText('Max context');
  await expect(catalogRail).toContainText('128K');
  await expect(catalogRail).toContainText('Pricing contract');
  await expect(catalogRail).toContainText('dcp.model_token_pricing.v1');
  await expect(catalogRail).toContainText('Qwen 2.5 7B');
  await expect(catalogRail).toContainText('SAR 0.30 in / SAR 0.60 out');
  await expect(catalogRail).toContainText('model_registry');
  await expect(catalogRail).toContainText('serving');
  await expect(catalogRail).toContainText('Future Model');
  await expect(catalogRail).toContainText('no providers');
  await expect(catalogRail).toContainText('Rows with zero providers stay visible as catalog metadata');

  const promptCacheRail = page.locator('.inference-prompt-cache-live');
  await expect(promptCacheRail).toContainText('Prompt-cache settlement gates');
  await expect(promptCacheRail).toContainText('dcp.prompt_cache_settlement_readiness.v1');
  await expect(promptCacheRail).toContainText('measurement only no discount');
  await expect(promptCacheRail).toContainText('blocked external');
  await expect(promptCacheRail).toContainText('gated');
  await expect(promptCacheRail).toContainText('settlement policy contract only');
  await expect(promptCacheRail).toContainText('funded smoke principal');
  await expect(promptCacheRail).toContainText('provider cache-hit evidence');
  await expect(promptCacheRail).toContainText('Read-only settlement proof');
  await expect(promptCacheRail).toContainText('npm run proof:prompt-cache-settlement-readiness');
  await expect(promptCacheRail).toContainText('DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement');
});
