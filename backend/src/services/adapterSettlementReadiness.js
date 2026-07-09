'use strict';

const ADAPTER_SETTLEMENT_READINESS_VERSION = 'dcp.adapter_settlement_readiness.v1';

function buildAdapterSettlementReadiness(now = new Date()) {
  return {
    object: 'adapter_settlement_readiness',
    version: ADAPTER_SETTLEMENT_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'settlement_policy_contract_only',
    endpoints: {
      settlement_readiness: 'GET /api/adapters/settlement/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      minimum_balance_readiness: 'GET /api/renters/me/minimum-balances',
      usage_export: 'GET /api/renters/me/usage/export',
      adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    },
    policy: {
      readiness_available: true,
      adapter_settlement_enabled: false,
      provider_payouts_enabled: false,
      platform_revenue_split_enabled: false,
      settlement_mutations_enabled: false,
      settlement_start_event: 'adapter_usage_row_after_endpoint_smoke_and_founder_approval',
      required_before_settlement: [
        'strict_load_proof_match',
        'endpoint_smoke_passed',
        'usage_ledger_adapter_attribution',
        'minimum_balance_policy_approved',
        'settlement_split_policy_approved',
        'founder_settlement_approval',
      ],
      required_settlement_fields: [
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
        'provider_share_halala',
        'platform_share_halala',
        'settlement_status',
      ],
      accepted_settlement_statuses_while_pending_policy: ['pending'],
      split_policy: {
        status: 'policy_pending',
        requires_cost_sum_match: true,
        provider_share_live: false,
        platform_share_live: false,
        notes: 'Provider/platform split rows must sum to adapter inference cost before settlement or payout can be enabled.',
      },
      notes: 'Adapter settlement is a policy contract only. It does not create invoices, mutate balances, settle provider payouts, or alter existing v1 inference settlement.',
    },
    denial_codes: [
      'adapter_settlement_disabled',
      'adapter_settlement_load_proof_required',
      'adapter_settlement_endpoint_smoke_required',
      'adapter_settlement_usage_attribution_required',
      'adapter_settlement_minimum_balance_policy_required',
      'adapter_settlement_split_policy_required',
      'adapter_settlement_founder_approval_required',
      'adapter_settlement_split_mismatch',
    ],
    claim_guards: {
      readiness_contract_live: true,
      adapter_settlement_enabled: false,
      provider_payouts_enabled: false,
      platform_revenue_split_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      changes_budget_cap: false,
      changes_minimum_balance_enforcement: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Approve provider/platform split policy for adapter endpoint traffic.',
      'Require adapter usage rows with strict deployment, adapter, endpoint, checksum, provider, request, scoped-key, token, cost, and pending-settlement attribution.',
      'Keep provider payout and platform revenue split mutations disabled until live endpoint smoke, usage attribution, minimum-balance policy, and founder settlement approval pass.',
    ],
  };
}

function evaluateAdapterSettlementPolicy(input = {}) {
  const deployment = input.deployment || {};
  const proof = deployment.serving_load_proof || {};
  const usage = input.usage_event || {};
  const quote = input.settlement_quote || {};

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

  const splitMatchesCost = integerAtLeast(quote.provider_share_halala, 0)
    && integerAtLeast(quote.platform_share_halala, 0)
    && integerAtLeast(usage.cost_halala, 1)
    && quote.provider_share_halala + quote.platform_share_halala === usage.cost_halala;

  const checks = {
    strict_load_proof_match: strictLoadProofMatch,
    endpoint_smoke_passed: input.endpoint_smoke_passed === true,
    usage_ledger_adapter_attribution: usageAttributionReady,
    minimum_balance_policy_approved: input.minimum_balance_policy_approved === true,
    settlement_split_policy_approved: input.settlement_split_policy_approved === true,
    founder_settlement_approval: input.founder_settlement_approval === true,
    settlement_split_matches_cost: splitMatchesCost,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldSettleIfEnabled = blockers.length === 0;

  return {
    object: 'adapter_settlement_policy_evaluation',
    version: ADAPTER_SETTLEMENT_READINESS_VERSION,
    settlement_enabled: false,
    settled: false,
    would_settle_if_enabled: wouldSettleIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldSettleIfEnabled
      ? 'adapter_settlement_disabled'
      : denialCodeForBlocker(blockers[0]),
    settlement_attribution: {
      renter_id: usage.renter_id || null,
      deployment_id: usage.deployment_id || null,
      adapter_id: usage.adapter_id || null,
      endpoint_id: usage.endpoint_id || null,
      provider_id: usage.provider_id || null,
      request_id: usage.request_id || null,
      renter_api_key_id: usage.renter_api_key_id || null,
      renter_key_type: usage.renter_key_type || null,
      total_tokens: numberOrNull(usage.total_tokens),
      cost_halala: numberOrNull(usage.cost_halala),
      provider_share_halala: numberOrNull(quote.provider_share_halala),
      platform_share_halala: numberOrNull(quote.platform_share_halala),
      settlement_status: usage.settlement_status || null,
    },
  };
}

function denialCodeForBlocker(blocker) {
  return {
    strict_load_proof_match: 'adapter_settlement_load_proof_required',
    endpoint_smoke_passed: 'adapter_settlement_endpoint_smoke_required',
    usage_ledger_adapter_attribution: 'adapter_settlement_usage_attribution_required',
    minimum_balance_policy_approved: 'adapter_settlement_minimum_balance_policy_required',
    settlement_split_policy_approved: 'adapter_settlement_split_policy_required',
    founder_settlement_approval: 'adapter_settlement_founder_approval_required',
    settlement_split_matches_cost: 'adapter_settlement_split_mismatch',
  }[blocker] || 'adapter_settlement_disabled';
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
  ADAPTER_SETTLEMENT_READINESS_VERSION,
  buildAdapterSettlementReadiness,
  evaluateAdapterSettlementPolicy,
};
