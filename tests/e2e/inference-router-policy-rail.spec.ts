import { expect, test } from '@playwright/test';

test('public inference page renders live router policy readiness', async ({ page }) => {
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
          },
          capability_flags: { streaming: true },
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
        {
          id: 'lowest_latency',
          label: 'Lowest latency',
          status: 'telemetry_gate_only',
          available: false,
          request_selectable: false,
        },
        {
          id: 'arabic',
          label: 'Arabic',
          status: 'catalog_only',
          available: false,
          request_selectable: false,
        },
      ],
    }),
  }));

  await page.goto('/inference');

  const policyRail = page.locator('.inference-policy-live');
  await expect(policyRail).toContainText('Router policy catalog');
  await expect(policyRail).toContainText('dcp.inference_routing_policies.v1');
  await expect(policyRail).toContainText('Default');
  await expect(policyRail).toContainText('Balanced');
  await expect(policyRail).toContainText('Available');
  await expect(policyRail).toContainText('1/3');
  await expect(policyRail).toContainText('Gated policies');
  await expect(policyRail).toContainText('2');
  await expect(policyRail).toContainText('Lowest latency');
  await expect(policyRail).toContainText('telemetry gate only');
  await expect(policyRail).toContainText('not selectable');
  const promptCacheRail = page.locator('.inference-prompt-cache-live');
  await expect(promptCacheRail).toContainText('Prompt-cache settlement gates');
  await expect(promptCacheRail).toContainText('prompt_cache_provider_discount_smoke');
  await expect(promptCacheRail).toContainText('Provider cache-hit evidence');
  await expect(promptCacheRail).toContainText('/v1/prompt-cache/settlement/readiness');
});
