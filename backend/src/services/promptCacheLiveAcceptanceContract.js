'use strict';

const PROMPT_CACHE_LIVE_ACCEPTANCE_CONTRACT_VERSION = 'dcp.prompt_cache_live_acceptance_evidence.v1';
const PROMPT_CACHE_LIVE_ACCEPTANCE_GATE = 'prompt_cache_provider_discount_smoke';
const PROMPT_CACHE_LIVE_ACCEPTANCE_COMMAND = 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement';

const PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE = Object.freeze([
  Object.freeze({
    id: 'readiness_measurement_mode_verified',
    label: 'Readiness is measurement-only',
    description: 'GET /v1/prompt-cache/readiness must be measurement_only_no_discount with discounts, settlement discounts, provider KV-cache control, and prompt-cache discount claims false.',
    required_fields: Object.freeze([
      'object=prompt_cache_readiness',
      'version=dcp.prompt_cache.v1',
      'current_mode=measurement_only_no_discount',
      'billing.discounts_enabled=false',
      'billing.settlement_discount_enabled=false',
      'claims.prompt_cache_discount=false',
      'claims.provider_kv_cache_control=false',
    ]),
  }),
  Object.freeze({
    id: 'funded_smoke_principal_verified',
    label: 'Funded smoke principal exists',
    description: 'The live runner must use a deterministic renter smoke principal with a redacted scoped key and nonzero balance metadata.',
    required_fields: Object.freeze([
      'renter_id',
      'scoped_key_id',
      'key_hint',
      'balance_halala',
    ]),
  }),
  Object.freeze({
    id: 'first_measurement_request_verified',
    label: 'First request records a measured miss',
    description: 'The first POST /v1/chat/completions request must return prompt-cache usage metadata with a stable cache key and miss_measured status.',
    required_fields: Object.freeze([
      'first.request_id',
      'first.response_hash',
      'first.prompt_cache.status=miss_measured',
      'first.prompt_cache.cache_key',
      'first.prompt_cache.discount_applied=false',
    ]),
  }),
  Object.freeze({
    id: 'second_hit_measurement_verified',
    label: 'Second request records a measured hit',
    description: 'The second POST /v1/chat/completions request must reuse the same cache key and return hit_measured_no_discount with cached input tokens.',
    required_fields: Object.freeze([
      'second.request_id',
      'second.response_hash',
      'second.prompt_cache.status=hit_measured_no_discount',
      'cache_keys_match=true',
      'second.prompt_cache.cached_input_tokens>0',
    ]),
  }),
  Object.freeze({
    id: 'no_discount_guard_verified',
    label: 'No discount is applied while disabled',
    description: 'Both usage and pricing prompt-cache fields must keep discount_applied=false and discount_bps=0 while settlement discounts are disabled.',
    required_fields: Object.freeze([
      'first.prompt_cache.discount_applied=false',
      'second.prompt_cache.discount_applied=false',
      'first.pricing.prompt_cache_discount_applied=false',
      'second.pricing.prompt_cache_discount_applied=false',
      'discount_bps=0',
    ]),
  }),
  Object.freeze({
    id: 'redacted_artifact_verified',
    label: 'Proof artifact is redacted',
    description: 'The JSON/Markdown/log artifact may contain hashes, request ids, usage summaries, and key hints, but not raw prompts, raw responses, or scoped renter credentials.',
    required_fields: Object.freeze([
      'response_hash',
      'session_id_hash',
      'key_hint',
      'no_raw_prompt',
      'no_scoped_key',
    ]),
  }),
]);

const PROMPT_CACHE_FUTURE_DISCOUNT_EVIDENCE = Object.freeze([
  Object.freeze({
    id: 'provider_kv_cache_control_verified',
    label: 'Provider KV-cache control is proven',
    description: 'Provider-side cache-hit evidence must prove DCP controls the cache path rather than only measuring local hash hits.',
    required_fields: Object.freeze([
      'provider_cache_trace_id',
      'provider_cache_status=hit',
      'provider_id',
      'request_id',
    ]),
  }),
  Object.freeze({
    id: 'discount_policy_approved',
    label: 'Discount policy is approved',
    description: 'A named pricing policy must approve cached-input discount rate, bounds, and rollback behavior before settlement changes.',
    required_fields: Object.freeze([
      'discount_policy_id',
      'discount_bps',
      'approved_by',
      'approved_at',
    ]),
  }),
  Object.freeze({
    id: 'discounted_settlement_proof_verified',
    label: 'Discounted settlement is proven',
    description: 'A funded live request must prove minimum-balance preflight, discounted debit math, settlement request id, and no partial billing.',
    required_fields: Object.freeze([
      'minimum_balance_preflight',
      'settlement_request_id',
      'settlement_status=settled',
      'renter_balance_after',
      'provider_settlement_after',
    ]),
  }),
  Object.freeze({
    id: 'model_pricing_flag_verified',
    label: 'Model pricing flag follows settlement proof',
    description: 'The model catalog must expose cached-input discount availability only after provider cache control and discounted settlement proof pass.',
    required_fields: Object.freeze([
      '/v1/models.data[].feature_readiness.prompt_cache',
      'capability_contract',
      'pricing.prompt_cache_discount',
    ]),
  }),
]);

function cloneEvidence(items) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    required_fields: [...item.required_fields],
  }));
}

function buildEmptyPromptCacheLiveAcceptanceEvidence() {
  return PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE.reduce((acc, item) => {
    acc[item.id] = false;
    return acc;
  }, {});
}

function buildPromptCacheLiveAcceptanceContract() {
  return {
    contract: PROMPT_CACHE_LIVE_ACCEPTANCE_CONTRACT_VERSION,
    gate: PROMPT_CACHE_LIVE_ACCEPTANCE_GATE,
    command: PROMPT_CACHE_LIVE_ACCEPTANCE_COMMAND,
    pass_condition: 'A PASS report proves only live hash-based prompt-cache measurement and no-discount guards; it does not unlock cached-input discounts or provider KV-cache control.',
    required_evidence: cloneEvidence(PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE),
    future_discount_required_evidence: cloneEvidence(PROMPT_CACHE_FUTURE_DISCOUNT_EVIDENCE),
    claim_unlocks: {
      live_hit_measurement: PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE.map((item) => item.id),
      prompt_cache_discount: PROMPT_CACHE_FUTURE_DISCOUNT_EVIDENCE.map((item) => item.id),
      provider_kv_cache_control: ['provider_kv_cache_control_verified'],
      discounted_settlement: [
        'discount_policy_approved',
        'discounted_settlement_proof_verified',
      ],
    },
  };
}

function findMissingPromptCacheLiveAcceptanceEvidence(input = {}) {
  const evidence = input.acceptance_evidence && typeof input.acceptance_evidence === 'object'
    ? input.acceptance_evidence
    : input;
  return PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE
    .filter((item) => evidence[item.id] !== true)
    .map((item) => item.id);
}

module.exports = {
  PROMPT_CACHE_LIVE_ACCEPTANCE_COMMAND,
  PROMPT_CACHE_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  PROMPT_CACHE_LIVE_ACCEPTANCE_GATE,
  PROMPT_CACHE_LIVE_REQUIRED_EVIDENCE,
  PROMPT_CACHE_FUTURE_DISCOUNT_EVIDENCE,
  buildEmptyPromptCacheLiveAcceptanceEvidence,
  buildPromptCacheLiveAcceptanceContract,
  findMissingPromptCacheLiveAcceptanceEvidence,
};
