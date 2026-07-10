'use strict';

const ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION = 'dcp.adapter_vllm_live_acceptance_evidence.v1';
const ADAPTER_VLLM_LIVE_ACCEPTANCE_GATE = 'adapter_vllm_load_billing_smoke';
const ADAPTER_VLLM_LIVE_ACCEPTANCE_COMMAND = 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load';

const ADAPTER_VLLM_LIVE_REQUIRED_EVIDENCE = Object.freeze([
  Object.freeze({
    id: 'readiness_serving_claims_verified',
    label: 'Readiness serving claims are true',
    description: 'GET /api/lora/readiness must explicitly claim adapter registry serving, deployment serving, route traffic, and claim guards are live before the live flow can proceed.',
    required_fields: Object.freeze([
      'adapter_registry.serving_enabled=true',
      'adapter_registry.route_traffic=true',
      'adapter_deployments.serving_enabled=true',
      'adapter_deployments.route_traffic=true',
      'adapter_deployments.load_proof_required=false',
      'claim_guards.public_serving_enabled=true',
      'claim_guards.route_traffic=true',
    ]),
  }),
  Object.freeze({
    id: 'funded_smoke_principal_verified',
    label: 'Funded smoke principal exists',
    description: 'The runner must use a deterministic renter smoke principal with a redacted scoped key and nonzero balance metadata.',
    required_fields: Object.freeze([
      'renter_id',
      'scoped_key_id',
      'key_hint',
      'balance_halala',
    ]),
  }),
  Object.freeze({
    id: 'adapter_artifact_checksum_verified',
    label: 'Adapter artifact checksum is verified',
    description: 'The live run must prove a renter-scoped adapter artifact and model card with matching SHA-256 checksum before load.',
    required_fields: Object.freeze([
      'adapter_id',
      'artifact_storage_key',
      'artifact_checksum_sha256',
      'model_card_checksum_sha256',
      'base_model',
    ]),
  }),
  Object.freeze({
    id: 'deployment_intent_verified',
    label: 'Deployment intent is verified',
    description: 'The created deployment intent must match renter, adapter, base model, mode, endpoint id, and checksum before serving can be claimed.',
    required_fields: Object.freeze([
      'deployment_id',
      'adapter_id',
      'base_model',
      'mode',
      'endpoint_id',
      'artifact_checksum_sha256',
    ]),
  }),
  Object.freeze({
    id: 'strict_vllm_load_proof_verified',
    label: 'Strict vLLM load proof matches deployment',
    description: 'Serving load proof must match deployment id, adapter id, base model, mode, endpoint id, and artifact checksum, and prove the adapter is loaded.',
    required_fields: Object.freeze([
      'loaded=true',
      'deployment_id',
      'adapter_id',
      'base_model',
      'mode',
      'endpoint_id',
      'artifact_checksum_sha256',
      'vllm_host_id',
    ]),
  }),
  Object.freeze({
    id: 'endpoint_smoke_verified',
    label: 'Endpoint smoke is verified',
    description: 'A deterministic funded request must prove response hash, latency, token totals, adapter trace, and no raw prompt/response body in the artifact.',
    required_fields: Object.freeze([
      'request_id',
      'response_hash',
      'latency_ms',
      'usage.total_tokens',
      'adapter_trace.adapter_id',
      'no_raw_prompt_or_response',
    ]),
  }),
  Object.freeze({
    id: 'usage_attribution_verified',
    label: 'Usage attribution is verified',
    description: 'Usage evidence must carry deployment, adapter, endpoint, checksum, provider, request, scoped key, token, cost, and pending-settlement fields.',
    required_fields: Object.freeze([
      'renter_id',
      'deployment_id',
      'adapter_id',
      'endpoint_id',
      'artifact_checksum_sha256',
      'provider_id',
      'request_id',
      'renter_api_key_id',
      'total_tokens',
      'cost_halala',
      'settlement_status=pending',
    ]),
  }),
  Object.freeze({
    id: 'billing_policy_verified',
    label: 'Billing policy is verified',
    description: 'Adapter billing must prove minimum-balance policy, settlement split, founder approval, and no partial billing before money claims change.',
    required_fields: Object.freeze([
      'minimum_balance_policy_approved',
      'settlement_split_policy_approved',
      'founder_billing_approval',
      'no_partial_billing',
    ]),
  }),
  Object.freeze({
    id: 'claim_boundary_verified',
    label: 'Claim boundary is verified',
    description: 'The live report must keep Tinker compatibility, quality, discounts, and multi-LoRA claims false unless separately proven.',
    required_fields: Object.freeze([
      'claim_guards.quality_claims=false',
      'claim_guards.tinker_compatible=false',
      'claim_guards.discounts_enabled=false',
      'multi_lora_claim=false',
    ]),
  }),
]);

function cloneRequiredEvidence() {
  return ADAPTER_VLLM_LIVE_REQUIRED_EVIDENCE.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    required_fields: [...item.required_fields],
  }));
}

function buildEmptyAdapterVllmLiveAcceptanceEvidence() {
  return ADAPTER_VLLM_LIVE_REQUIRED_EVIDENCE.reduce((acc, item) => {
    acc[item.id] = false;
    return acc;
  }, {});
}

function buildAdapterVllmLiveAcceptanceContract() {
  return {
    contract: ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION,
    gate: ADAPTER_VLLM_LIVE_ACCEPTANCE_GATE,
    command: ADAPTER_VLLM_LIVE_ACCEPTANCE_COMMAND,
    pass_condition: 'A PASS report must prove every required_evidence id in one redacted live run before adapter serving, route traffic, endpoint smoke, adapter billing, or dedicated deployment claims can be enabled.',
    required_evidence: cloneRequiredEvidence(),
    claim_unlocks: {
      adapter_serving: [
        'readiness_serving_claims_verified',
        'adapter_artifact_checksum_verified',
        'deployment_intent_verified',
        'strict_vllm_load_proof_verified',
        'endpoint_smoke_verified',
      ],
      adapter_billing: [
        'usage_attribution_verified',
        'billing_policy_verified',
      ],
      route_traffic: [
        'strict_vllm_load_proof_verified',
        'endpoint_smoke_verified',
      ],
      public_claims: [
        'claim_boundary_verified',
      ],
    },
  };
}

function findMissingAdapterVllmLiveAcceptanceEvidence(input = {}) {
  const evidence = input.acceptance_evidence && typeof input.acceptance_evidence === 'object'
    ? input.acceptance_evidence
    : input;
  return ADAPTER_VLLM_LIVE_REQUIRED_EVIDENCE
    .filter((item) => evidence[item.id] !== true)
    .map((item) => item.id);
}

module.exports = {
  ADAPTER_VLLM_LIVE_ACCEPTANCE_COMMAND,
  ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  ADAPTER_VLLM_LIVE_ACCEPTANCE_GATE,
  ADAPTER_VLLM_LIVE_REQUIRED_EVIDENCE,
  buildAdapterVllmLiveAcceptanceContract,
  buildEmptyAdapterVllmLiveAcceptanceEvidence,
  findMissingAdapterVllmLiveAcceptanceEvidence,
};
