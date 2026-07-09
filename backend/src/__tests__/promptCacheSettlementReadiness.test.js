'use strict';

const {
  PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
  buildPromptCacheSettlementReadiness,
  evaluatePromptCacheSettlementPolicy,
} = require('../services/promptCacheSettlementReadiness');

function buildMeasurement(overrides = {}) {
  return {
    hash_only: true,
    stores_raw_prompt: false,
    stores_static_prefix: false,
    eligible: true,
    cache_key: 'pc_' + 'a'.repeat(40),
    cache_key_sha256: 'b'.repeat(64),
    ...overrides,
  };
}

function buildProviderHit(overrides = {}) {
  return {
    hit: true,
    cache_key: 'pc_' + 'a'.repeat(40),
    cache_key_sha256: 'b'.repeat(64),
    provider_id: 'provider-cache-1',
    provider_response_id: 'chatcmpl-cache-hit-1',
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    request_id: 'req-cache-settlement-1',
    model: 'qwen/qwen3-coder',
    cache_key: 'pc_' + 'a'.repeat(40),
    cache_key_sha256: 'b'.repeat(64),
    session_id_hash: 'sessionhash123',
    prompt_tokens: 120,
    cached_input_tokens: 40,
    billable_input_tokens: 120,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildQuote(overrides = {}) {
  return {
    undiscounted_input_cost_halala: 12,
    prompt_cache_discount_halala: 4,
    discounted_input_cost_halala: 8,
    ...overrides,
  };
}

describe('prompt cache settlement readiness', () => {
  test('builds a public policy-only readiness packet without enabling discounts or settlement', () => {
    const readiness = buildPromptCacheSettlementReadiness(new Date('2026-07-09T21:05:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'prompt_cache_settlement_readiness',
      version: PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
      current_mode: 'settlement_policy_contract_only',
      endpoints: {
        settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
        prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
        live_settlement_proof: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
      },
      policy: {
        readiness_available: true,
        cached_input_discounts_enabled: false,
        provider_kv_cache_control_enabled: false,
        settlement_discounts_enabled: false,
        settlement_mutations_enabled: false,
        discount_policy: {
          status: 'policy_pending',
          discount_bps_live: 0,
        },
      },
      claim_guards: {
        readiness_contract_live: true,
        cached_input_discounts_enabled: false,
        provider_kv_cache_control_enabled: false,
        settlement_discounts_enabled: false,
        settlement_mutations_enabled: false,
        mutates_balance: false,
        records_usage_event: false,
        dispatches_inference: false,
        stores_raw_prompt: false,
        stores_static_prefix: false,
      },
    });
  });

  test('keeps a complete cache-hit packet non-discountable while policy is disabled', () => {
    const evaluation = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });

    expect(evaluation).toMatchObject({
      object: 'prompt_cache_settlement_policy_evaluation',
      version: PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
      discount_enabled: false,
      settlement_discount_enabled: false,
      discountable: false,
      would_discount_if_enabled: true,
      blockers: [],
      denial_code_while_disabled: 'prompt_cache_discount_disabled',
      checks: {
        hash_only_measurement: true,
        live_provider_cache_hit_evidence: true,
        funded_smoke_principal: true,
        cached_input_token_attribution: true,
        settlement_discount_policy_approved: true,
        founder_discount_approval: true,
        discount_math_matches_cost: true,
      },
      settlement_quote: {
        undiscounted_input_cost_halala: 12,
        prompt_cache_discount_halala: 4,
        discounted_input_cost_halala: 8,
      },
    });
  });

  test('requires provider cache-hit evidence before future discounts can pass', () => {
    const evaluation = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit({ hit: false }),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });

    expect(evaluation).toMatchObject({
      would_discount_if_enabled: false,
      denial_code_while_disabled: 'prompt_cache_provider_hit_required',
      checks: {
        live_provider_cache_hit_evidence: false,
      },
    });
    expect(evaluation.blockers).toContain('live_provider_cache_hit_evidence');
  });

  test('rejects mismatched discount math before settlement policy can enable', () => {
    const evaluation = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote({ discounted_input_cost_halala: 9 }),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });

    expect(evaluation).toMatchObject({
      would_discount_if_enabled: false,
      denial_code_while_disabled: 'prompt_cache_discount_math_mismatch',
      checks: {
        discount_math_matches_cost: false,
      },
    });
  });
});
