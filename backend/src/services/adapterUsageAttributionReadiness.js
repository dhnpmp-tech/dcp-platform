'use strict';

const ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION = 'dcp.adapter_usage_attribution_readiness.v1';

function buildAdapterUsageAttributionReadiness(now = new Date()) {
  return {
    object: 'adapter_usage_attribution_readiness',
    version: ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'usage_attribution_contract_only',
    endpoints: {
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      minimum_balance_readiness: 'GET /api/renters/me/minimum-balances',
      usage_export: 'GET /api/renters/me/usage/export',
      budget_status: 'GET /api/renters/me/budget-status',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
      adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    },
    policy: {
      readiness_available: true,
      adapter_usage_attribution_enabled: false,
      adapter_usage_ledger_writes_enabled: false,
      adapter_billing_enabled: false,
      intended_sources: [
        'strict_adapter_load_proof',
        'dedicated_endpoint_smoke',
        'adapter_inference_metering',
        'renter_usage_export',
      ],
      required_context: [
        'deployment_intent',
        'strict_load_proof_match',
        'endpoint_smoke_passed',
        'funded_principal',
      ],
      required_usage_fields: [
        'renter_id',
        'deployment_id',
        'adapter_id',
        'endpoint_id',
        'base_model',
        'artifact_checksum_sha256',
        'provider_id',
        'request_id',
        'renter_api_key_id',
        'renter_key_type',
        'prompt_tokens',
        'completion_tokens',
        'total_tokens',
        'cost_halala',
        'settlement_status',
      ],
      accepted_settlement_statuses_while_pending_policy: ['pending'],
      notes: 'Adapter usage attribution is a contract only. Existing v1 usage metering remains separate until dedicated adapter endpoint routing and billing are approved.',
    },
    denial_codes: [
      'adapter_usage_attribution_disabled',
      'adapter_usage_load_proof_required',
      'adapter_usage_deployment_mismatch',
      'adapter_usage_endpoint_smoke_required',
      'adapter_usage_funded_principal_required',
      'adapter_usage_provider_required',
      'adapter_usage_request_required',
      'adapter_usage_token_cost_required',
      'adapter_usage_settlement_status_required',
    ],
    claim_guards: {
      readiness_contract_live: true,
      adapter_usage_attribution_enabled: false,
      adapter_usage_ledger_writes_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      changes_budget_cap: false,
      exposes_raw_prompt: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run strict adapter load proof and endpoint smoke on a funded principal.',
      'Thread deployment, adapter, endpoint, checksum, provider, request, scoped-key, token, cost, and pending-settlement fields into adapter usage rows.',
      'Keep adapter billing disabled until usage attribution, settlement split policy, minimum-balance policy, and founder approval are proven.',
    ],
  };
}

function evaluateAdapterUsageAttribution(input = {}) {
  const deployment = input.deployment || {};
  const proof = deployment.serving_load_proof || {};
  const usage = input.usage_event || {};

  const strictLoadProofMatch = deployment.route_traffic === true
    && proof.loaded === true
    && same(proof.deployment_id, deployment.deployment_id)
    && same(proof.adapter_id, deployment.adapter_id)
    && same(proof.base_model, deployment.base_model)
    && same(proof.mode, deployment.mode)
    && (!deployment.endpoint_id || same(proof.endpoint_id, deployment.endpoint_id))
    && isSha256(proof.artifact_checksum_sha256);

  const deploymentMatch = positiveInt(usage.renter_id)
    && usage.renter_id === deployment.renter_id
    && same(usage.deployment_id, deployment.deployment_id)
    && same(usage.adapter_id, deployment.adapter_id)
    && same(usage.base_model, deployment.base_model)
    && (!deployment.endpoint_id || same(usage.endpoint_id, deployment.endpoint_id))
    && same(usage.artifact_checksum_sha256, proof.artifact_checksum_sha256);

  const providerPresent = nonEmpty(usage.provider_id);
  const requestPresent = nonEmpty(usage.request_id);
  const tokenCostFields = integerAtLeast(usage.prompt_tokens, 0)
    && integerAtLeast(usage.completion_tokens, 0)
    && integerAtLeast(usage.total_tokens, 0)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && integerAtLeast(usage.cost_halala, 1);
  const settlementPending = same(usage.settlement_status, 'pending');

  const checks = {
    strict_load_proof_match: strictLoadProofMatch,
    deployment_usage_match: deploymentMatch,
    endpoint_smoke_passed: input.endpoint_smoke_passed === true,
    funded_principal: input.funded_principal === true,
    provider_attribution: providerPresent,
    request_attribution: requestPresent,
    token_cost_fields: tokenCostFields,
    settlement_status_pending: settlementPending,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldRecordIfEnabled = blockers.length === 0;

  return {
    object: 'adapter_usage_attribution_evaluation',
    version: ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
    attribution_enabled: false,
    usage_ledger_write_enabled: false,
    recorded: false,
    would_record_if_enabled: wouldRecordIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldRecordIfEnabled
      ? 'adapter_usage_attribution_disabled'
      : denialCodeForBlocker(blockers[0]),
    usage_attribution: {
      renter_id: usage.renter_id || null,
      deployment_id: usage.deployment_id || null,
      adapter_id: usage.adapter_id || null,
      endpoint_id: usage.endpoint_id || null,
      base_model: usage.base_model || null,
      artifact_checksum_sha256: usage.artifact_checksum_sha256 || null,
      provider_id: usage.provider_id || null,
      request_id: usage.request_id || null,
      renter_api_key_id: usage.renter_api_key_id || null,
      renter_key_type: usage.renter_key_type || null,
      prompt_tokens: numberOrNull(usage.prompt_tokens),
      completion_tokens: numberOrNull(usage.completion_tokens),
      total_tokens: numberOrNull(usage.total_tokens),
      cost_halala: numberOrNull(usage.cost_halala),
      settlement_status: usage.settlement_status || null,
    },
  };
}

function denialCodeForBlocker(blocker) {
  return {
    strict_load_proof_match: 'adapter_usage_load_proof_required',
    deployment_usage_match: 'adapter_usage_deployment_mismatch',
    endpoint_smoke_passed: 'adapter_usage_endpoint_smoke_required',
    funded_principal: 'adapter_usage_funded_principal_required',
    provider_attribution: 'adapter_usage_provider_required',
    request_attribution: 'adapter_usage_request_required',
    token_cost_fields: 'adapter_usage_token_cost_required',
    settlement_status_pending: 'adapter_usage_settlement_status_required',
  }[blocker] || 'adapter_usage_attribution_disabled';
}

function same(left, right) {
  return String(left || '') === String(right || '');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function integerAtLeast(value, min) {
  return Number.isInteger(value) && value >= min;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

module.exports = {
  ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
  buildAdapterUsageAttributionReadiness,
  evaluateAdapterUsageAttribution,
};
