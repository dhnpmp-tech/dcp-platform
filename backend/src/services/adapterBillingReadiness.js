'use strict';

const ADAPTER_BILLING_READINESS_VERSION = 'dcp.adapter_billing_readiness.v1';

function buildAdapterBillingReadiness(now = new Date()) {
  return {
    object: 'adapter_billing_readiness',
    version: ADAPTER_BILLING_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'billing_policy_contract_only',
    endpoints: {
      billing_readiness: 'GET /api/adapters/billing/readiness',
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      artifact_policy_readiness: 'GET /api/adapters/artifacts/readiness',
      lora_readiness: 'GET /api/lora/readiness',
      minimum_balance_readiness: 'GET /api/renters/me/minimum-balances',
      adapter_registry: 'GET/POST /api/adapters',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
      adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    },
    policy: {
      readiness_available: true,
      adapter_inference_billing_enabled: false,
      bills_adapter_inference: false,
      billing_start_event: 'first_successful_endpoint_smoke_after_strict_load_proof',
      metering_scope: [
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
      ],
      required_before_billing: [
        'strict_load_proof_match',
        'endpoint_smoke_passed',
        'funded_smoke_principal',
        'minimum_balance_policy_approved',
        'usage_ledger_adapter_attribution',
        'settlement_split_policy_approved',
        'founder_billing_approval',
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
      minimum_balance: {
        status: 'policy_pending',
        minimum_type: 'estimated_adapter_request_cost',
        enforcement_live: false,
        notes: 'Adapter inference uses normal v1 estimate/preflight until a dedicated endpoint quote and adapter billing policy are approved.',
      },
      settlement: {
        status: 'policy_pending',
        provider_split_live: false,
        platform_split_live: false,
        notes: 'Adapter traffic must carry deployment and adapter attribution before provider settlement or payout can be enabled.',
      },
      usage_attribution: {
        status: 'contract_pending',
        readiness_endpoint: 'GET /api/adapters/usage/attribution/readiness',
        usage_writes_live: false,
        notes: 'Adapter usage rows must carry deployment, adapter, endpoint, checksum, provider, request, token, cost, scoped-key, and pending-settlement fields before billing can be enabled.',
      },
      endpoint_smoke: {
        status: 'contract_pending',
        readiness_endpoint: 'GET /api/adapters/endpoints/smoke/readiness',
        smoke_recording_live: false,
        notes: 'Adapter endpoint smoke must prove strict load proof, funded principal, deterministic request, response hash, latency, token usage, and adapter trace before usage or billing claims.',
      },
    },
    denial_codes: [
      'adapter_billing_disabled',
      'adapter_billing_load_proof_required',
      'adapter_billing_endpoint_smoke_required',
      'adapter_billing_funded_principal_required',
      'adapter_billing_minimum_balance_policy_required',
      'adapter_billing_usage_attribution_required',
      'adapter_billing_settlement_policy_required',
      'adapter_billing_founder_approval_required',
    ],
    claim_guards: {
      readiness_contract_live: true,
      adapter_billing_enabled: false,
      mutates_balance: false,
      dispatches_inference: false,
      creates_adapter_deployment: false,
      attaches_load_proof: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      creates_invoice: false,
      settles_provider_payout: false,
      changes_minimum_balance_enforcement: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run strict adapter vLLM load proof against a real serving endpoint.',
      'Record a successful endpoint smoke with deployment, adapter, endpoint, provider, and checksum attribution.',
      'Approve minimum-balance and settlement policy before enabling adapter inference billing.',
    ],
  };
}

function evaluateAdapterBillingPolicy(input = {}) {
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

  const usageAttributionReady = usage.renter_id === deployment.renter_id
    && same(usage.deployment_id, deployment.deployment_id)
    && same(usage.adapter_id, deployment.adapter_id)
    && same(usage.base_model, deployment.base_model)
    && (!deployment.endpoint_id || same(usage.endpoint_id, deployment.endpoint_id))
    && same(usage.artifact_checksum_sha256, proof.artifact_checksum_sha256)
    && nonEmpty(usage.provider_id)
    && nonEmpty(usage.request_id)
    && nonEmpty(usage.renter_api_key_id)
    && nonEmpty(usage.renter_key_type)
    && integerAtLeast(usage.prompt_tokens, 0)
    && integerAtLeast(usage.completion_tokens, 0)
    && integerAtLeast(usage.total_tokens, 0)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && integerAtLeast(usage.cost_halala, 1)
    && same(usage.settlement_status, 'pending');

  const checks = {
    strict_load_proof_match: strictLoadProofMatch,
    endpoint_smoke_passed: input.endpoint_smoke_passed === true,
    funded_smoke_principal: input.funded_smoke_principal === true,
    minimum_balance_policy_approved: input.minimum_balance_policy_approved === true,
    usage_ledger_adapter_attribution: usageAttributionReady,
    settlement_split_policy_approved: input.settlement_split_policy_approved === true,
    founder_billing_approval: input.founder_billing_approval === true,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldBillIfEnabled = blockers.length === 0;

  return {
    object: 'adapter_billing_policy_evaluation',
    version: ADAPTER_BILLING_READINESS_VERSION,
    billing_enabled: false,
    billable: false,
    would_bill_if_enabled: wouldBillIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldBillIfEnabled
      ? 'adapter_billing_disabled'
      : denialCodeForBlocker(blockers[0]),
    usage_attribution: {
      renter_id: usage.renter_id || null,
      deployment_id: usage.deployment_id || null,
      adapter_id: usage.adapter_id || null,
      endpoint_id: usage.endpoint_id || null,
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
    strict_load_proof_match: 'adapter_billing_load_proof_required',
    endpoint_smoke_passed: 'adapter_billing_endpoint_smoke_required',
    funded_smoke_principal: 'adapter_billing_funded_principal_required',
    minimum_balance_policy_approved: 'adapter_billing_minimum_balance_policy_required',
    usage_ledger_adapter_attribution: 'adapter_billing_usage_attribution_required',
    settlement_split_policy_approved: 'adapter_billing_settlement_policy_required',
    founder_billing_approval: 'adapter_billing_founder_approval_required',
  }[blocker] || 'adapter_billing_disabled';
}

function same(left, right) {
  return String(left || '') === String(right || '');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
  ADAPTER_BILLING_READINESS_VERSION,
  buildAdapterBillingReadiness,
  evaluateAdapterBillingPolicy,
};
