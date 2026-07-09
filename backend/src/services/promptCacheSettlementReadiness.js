'use strict';

const PROMPT_CACHE_SETTLEMENT_READINESS_VERSION = 'dcp.prompt_cache_settlement_readiness.v1';

function buildPromptCacheSettlementReadiness(now = new Date()) {
  return {
    object: 'prompt_cache_settlement_readiness',
    version: PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'settlement_policy_contract_only',
    endpoints: {
      settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
      prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
      chat_completions: 'POST /v1/chat/completions',
      usage_export: 'GET /api/renters/me/usage/export',
      live_settlement_proof: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
    },
    policy: {
      readiness_available: true,
      cached_input_discounts_enabled: false,
      provider_kv_cache_control_enabled: false,
      settlement_discounts_enabled: false,
      settlement_mutations_enabled: false,
      discount_start_event: 'provider_cache_hit_evidence_after_settlement_policy_approval',
      required_before_discount: [
        'hash_only_measurement',
        'live_provider_cache_hit_evidence',
        'funded_smoke_principal',
        'cached_input_token_attribution',
        'settlement_discount_policy_approved',
        'founder_discount_approval',
      ],
      required_usage_fields: [
        'renter_id',
        'request_id',
        'model',
        'cache_key',
        'cache_key_sha256',
        'session_id_hash',
        'prompt_tokens',
        'cached_input_tokens',
        'billable_input_tokens',
        'undiscounted_input_cost_halala',
        'prompt_cache_discount_halala',
        'discounted_input_cost_halala',
        'settlement_status',
      ],
      discount_policy: {
        status: 'policy_pending',
        discount_bps_live: 0,
        requires_cost_sum_match: true,
        allows_negative_cost: false,
        notes: 'Cached-input discounts remain disabled until live provider hit evidence and settlement policy approval exist.',
      },
      provider_cache_hit_evidence: {
        status: 'blocked_external',
        required: true,
        notes: 'Provider-side cache-hit metadata must match DCP hash-only cache key evidence before discounts can affect settlement.',
      },
    },
    denial_codes: [
      'prompt_cache_discount_disabled',
      'prompt_cache_hash_measurement_required',
      'prompt_cache_provider_hit_required',
      'prompt_cache_funded_principal_required',
      'prompt_cache_usage_attribution_required',
      'prompt_cache_settlement_policy_required',
      'prompt_cache_founder_approval_required',
      'prompt_cache_discount_math_mismatch',
    ],
    claim_guards: {
      readiness_contract_live: true,
      cached_input_discounts_enabled: false,
      provider_kv_cache_control_enabled: false,
      settlement_discounts_enabled: false,
      settlement_mutations_enabled: false,
      mutates_balance: false,
      records_usage_event: false,
      dispatches_inference: false,
      creates_invoice: false,
      settles_provider_payout: false,
      stores_raw_prompt: false,
      stores_static_prefix: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run the opt-in live settlement proof with a funded smoke principal and repeated static prefix.',
      'Capture provider cache-hit evidence that matches DCP hash-only cache key measurement.',
      'Approve discount and settlement math before enabling cached-input discounts.',
    ],
  };
}

function evaluatePromptCacheSettlementPolicy(input = {}) {
  const measurement = input.measurement || {};
  const providerHit = input.provider_cache_hit_evidence || {};
  const usage = input.usage_event || {};
  const quote = input.settlement_quote || {};

  const hashOnlyMeasurement = measurement.hash_only === true
    && measurement.stores_raw_prompt === false
    && measurement.stores_static_prefix === false
    && measurement.eligible === true
    && nonEmpty(measurement.cache_key)
    && isSha256(measurement.cache_key_sha256);

  const providerCacheHitEvidence = providerHit.hit === true
    && same(providerHit.cache_key, measurement.cache_key)
    && same(providerHit.cache_key_sha256, measurement.cache_key_sha256)
    && nonEmpty(providerHit.provider_response_id)
    && nonEmpty(providerHit.provider_id);

  const cachedInputAttributionReady = same(usage.cache_key, measurement.cache_key)
    && same(usage.cache_key_sha256, measurement.cache_key_sha256)
    && nonEmpty(usage.renter_id)
    && nonEmpty(usage.request_id)
    && nonEmpty(usage.model)
    && integerAtLeast(usage.prompt_tokens, 1)
    && integerAtLeast(usage.cached_input_tokens, 1)
    && integerAtLeast(usage.billable_input_tokens, 0)
    && usage.cached_input_tokens <= usage.prompt_tokens
    && usage.billable_input_tokens <= usage.prompt_tokens
    && same(usage.settlement_status, 'pending');

  const discountMathMatches = integerAtLeast(quote.undiscounted_input_cost_halala, 1)
    && integerAtLeast(quote.prompt_cache_discount_halala, 0)
    && integerAtLeast(quote.discounted_input_cost_halala, 0)
    && quote.prompt_cache_discount_halala <= quote.undiscounted_input_cost_halala
    && quote.discounted_input_cost_halala + quote.prompt_cache_discount_halala === quote.undiscounted_input_cost_halala;

  const checks = {
    hash_only_measurement: hashOnlyMeasurement,
    live_provider_cache_hit_evidence: providerCacheHitEvidence,
    funded_smoke_principal: input.funded_smoke_principal === true,
    cached_input_token_attribution: cachedInputAttributionReady,
    settlement_discount_policy_approved: input.settlement_discount_policy_approved === true,
    founder_discount_approval: input.founder_discount_approval === true,
    discount_math_matches_cost: discountMathMatches,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldDiscountIfEnabled = blockers.length === 0;

  return {
    object: 'prompt_cache_settlement_policy_evaluation',
    version: PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
    discount_enabled: false,
    settlement_discount_enabled: false,
    discountable: false,
    would_discount_if_enabled: wouldDiscountIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldDiscountIfEnabled
      ? 'prompt_cache_discount_disabled'
      : denialCodeForBlocker(blockers[0]),
    attribution: {
      renter_id: usage.renter_id || null,
      request_id: usage.request_id || null,
      model: usage.model || null,
      cache_key: usage.cache_key || null,
      provider_id: providerHit.provider_id || null,
      provider_response_id: providerHit.provider_response_id || null,
      prompt_tokens: numberOrNull(usage.prompt_tokens),
      cached_input_tokens: numberOrNull(usage.cached_input_tokens),
      billable_input_tokens: numberOrNull(usage.billable_input_tokens),
      settlement_status: usage.settlement_status || null,
    },
    settlement_quote: {
      undiscounted_input_cost_halala: numberOrNull(quote.undiscounted_input_cost_halala),
      prompt_cache_discount_halala: numberOrNull(quote.prompt_cache_discount_halala),
      discounted_input_cost_halala: numberOrNull(quote.discounted_input_cost_halala),
    },
  };
}

function denialCodeForBlocker(blocker) {
  const map = {
    hash_only_measurement: 'prompt_cache_hash_measurement_required',
    live_provider_cache_hit_evidence: 'prompt_cache_provider_hit_required',
    funded_smoke_principal: 'prompt_cache_funded_principal_required',
    cached_input_token_attribution: 'prompt_cache_usage_attribution_required',
    settlement_discount_policy_approved: 'prompt_cache_settlement_policy_required',
    founder_discount_approval: 'prompt_cache_founder_approval_required',
    discount_math_matches_cost: 'prompt_cache_discount_math_mismatch',
  };
  return map[blocker] || 'prompt_cache_discount_disabled';
}

function same(a, b) {
  return String(a || '') === String(b || '');
}

function nonEmpty(value) {
  return typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && value.trim().length > 0;
}

function integerAtLeast(value, min) {
  return Number.isInteger(value) && value >= min;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

module.exports = {
  PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
  buildPromptCacheSettlementReadiness,
  evaluatePromptCacheSettlementPolicy,
};
