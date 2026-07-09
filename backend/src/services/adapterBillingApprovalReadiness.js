'use strict';

const ADAPTER_BILLING_APPROVAL_READINESS_VERSION = 'dcp.adapter_billing_approval_readiness.v1';

function buildAdapterBillingApprovalReadiness(now = new Date()) {
  return {
    object: 'adapter_billing_approval_readiness',
    version: ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'approval_policy_contract_only',
    endpoints: {
      billing_approval_readiness: 'GET /api/adapters/billing/approval/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      settlement_readiness: 'GET /api/adapters/settlement/readiness',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      minimum_balance_readiness: 'GET /api/renters/me/minimum-balances',
      local_roadmap_proof: 'npm run proof:local-roadmap',
    },
    policy: {
      readiness_available: true,
      founder_billing_approval_required: true,
      founder_billing_approval_live: false,
      adapter_billing_enablement_live: false,
      approval_mutations_enabled: false,
      required_evidence_before_approval: [
        'strict_load_proof_match',
        'endpoint_smoke_passed',
        'usage_ledger_adapter_attribution',
        'minimum_balance_policy_approved',
        'settlement_split_policy_approved',
        'local_roadmap_proof_passed',
        'production_smoke_passed',
        'evidence_packet_hash',
      ],
      required_approval_fields: [
        'approval_id',
        'approved_by',
        'approved_at',
        'evidence_packet_hash_sha256',
        'scope',
        'expires_at',
      ],
      allowed_scopes: [
        'single_adapter_deployment',
        'adapter_billing_policy_window',
      ],
      notes: 'Founder billing approval is a readiness contract only. It does not enable adapter billing, route traffic, settlement, invoices, payouts, or balance mutations.',
    },
    denial_codes: [
      'adapter_billing_approval_disabled',
      'adapter_billing_approval_load_proof_required',
      'adapter_billing_approval_endpoint_smoke_required',
      'adapter_billing_approval_usage_attribution_required',
      'adapter_billing_approval_minimum_balance_policy_required',
      'adapter_billing_approval_settlement_policy_required',
      'adapter_billing_approval_local_roadmap_required',
      'adapter_billing_approval_production_smoke_required',
      'adapter_billing_approval_evidence_hash_required',
      'adapter_billing_approval_founder_required',
    ],
    claim_guards: {
      readiness_contract_live: true,
      founder_billing_approval_live: false,
      adapter_billing_enablement_live: false,
      approval_mutations_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      enables_adapter_billing: false,
      changes_minimum_balance_enforcement: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Package strict load proof, endpoint smoke, usage attribution, settlement, minimum-balance, local-roadmap, and production-smoke evidence into a signed approval packet.',
      'Keep founder approval read-only until a controlled enablement window exists.',
      'Do not enable adapter billing or payouts from approval metadata alone.',
    ],
  };
}

function evaluateAdapterBillingApproval(input = {}) {
  const evidence = input.evidence || {};
  const approval = input.approval || {};

  const checks = {
    strict_load_proof_match: evidence.strict_load_proof_match === true,
    endpoint_smoke_passed: evidence.endpoint_smoke_passed === true,
    usage_ledger_adapter_attribution: evidence.usage_ledger_adapter_attribution === true,
    minimum_balance_policy_approved: evidence.minimum_balance_policy_approved === true,
    settlement_split_policy_approved: evidence.settlement_split_policy_approved === true,
    local_roadmap_proof_passed: evidence.local_roadmap_proof_passed === true,
    production_smoke_passed: evidence.production_smoke_passed === true,
    evidence_packet_hash: isSha256(evidence.evidence_packet_hash_sha256),
    founder_billing_approval: approval.founder_billing_approval === true
      && nonEmpty(approval.approved_by)
      && nonEmpty(approval.approval_id)
      && nonEmpty(approval.scope),
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldApproveIfEnabled = blockers.length === 0;

  return {
    object: 'adapter_billing_approval_evaluation',
    version: ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
    founder_billing_approval_live: false,
    approved: false,
    would_approve_if_enabled: wouldApproveIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldApproveIfEnabled
      ? 'adapter_billing_approval_disabled'
      : denialCodeForBlocker(blockers[0]),
    approval_packet: {
      approval_id: approval.approval_id || null,
      approved_by: approval.approved_by || null,
      approved_at: approval.approved_at || null,
      scope: approval.scope || null,
      expires_at: approval.expires_at || null,
      evidence_packet_hash_sha256: evidence.evidence_packet_hash_sha256 || null,
    },
  };
}

function denialCodeForBlocker(blocker) {
  return {
    strict_load_proof_match: 'adapter_billing_approval_load_proof_required',
    endpoint_smoke_passed: 'adapter_billing_approval_endpoint_smoke_required',
    usage_ledger_adapter_attribution: 'adapter_billing_approval_usage_attribution_required',
    minimum_balance_policy_approved: 'adapter_billing_approval_minimum_balance_policy_required',
    settlement_split_policy_approved: 'adapter_billing_approval_settlement_policy_required',
    local_roadmap_proof_passed: 'adapter_billing_approval_local_roadmap_required',
    production_smoke_passed: 'adapter_billing_approval_production_smoke_required',
    evidence_packet_hash: 'adapter_billing_approval_evidence_hash_required',
    founder_billing_approval: 'adapter_billing_approval_founder_required',
  }[blocker] || 'adapter_billing_approval_disabled';
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

module.exports = {
  ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
  buildAdapterBillingApprovalReadiness,
  evaluateAdapterBillingApproval,
};
