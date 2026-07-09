'use strict';

const ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION = 'dcp.adapter_endpoint_smoke_readiness.v1';
const ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION = 'dcp.adapter_endpoint_smoke_status_disabled.v1';
const ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION = 'dcp.adapter_endpoint_smoke_submission_disabled.v1';

function buildAdapterEndpointSmokeReadiness(now = new Date()) {
  return {
    object: 'adapter_endpoint_smoke_readiness',
    version: ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'endpoint_smoke_contract_only',
    endpoints: {
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      endpoint_smoke_status: 'GET /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke',
      endpoint_smoke_submission: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
      adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    },
    policy: {
      readiness_available: true,
      disabled_status_endpoint_available: true,
      disabled_submission_endpoint_available: true,
      endpoint_smoke_recording_enabled: false,
      adapter_endpoint_routing_enabled: false,
      adapter_billing_enabled: false,
      required_before_smoke: [
        'strict_load_proof_match',
        'funded_smoke_principal',
        'deterministic_smoke_request',
      ],
      required_smoke_fields: [
        'renter_id',
        'deployment_id',
        'adapter_id',
        'endpoint_id',
        'base_model',
        'artifact_checksum_sha256',
        'provider_id',
        'request_id',
        'status_code',
        'latency_ms',
        'response_checksum_sha256',
        'prompt_tokens',
        'completion_tokens',
        'total_tokens',
        'finish_reason',
        'adapter_trace',
      ],
      raw_prompt_storage_enabled: false,
      raw_response_storage_enabled: false,
      notes: 'Endpoint smoke is a future proof event. This readiness packet defines what a smoke result must prove before adapter route traffic or billing can be claimed.',
    },
    denial_codes: [
      'adapter_endpoint_smoke_disabled',
      'adapter_endpoint_smoke_load_proof_required',
      'adapter_endpoint_smoke_funded_principal_required',
      'adapter_endpoint_smoke_request_required',
      'adapter_endpoint_smoke_response_required',
      'adapter_endpoint_smoke_latency_required',
      'adapter_endpoint_smoke_usage_required',
      'adapter_endpoint_smoke_adapter_trace_required',
    ],
    claim_guards: {
      readiness_contract_live: true,
      disabled_status_endpoint_live: true,
      disabled_submission_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      dispatches_inference: false,
      records_smoke_result: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run strict adapter load proof against the target vLLM endpoint.',
      'Submit deterministic funded smoke evidence to the disabled smoke endpoint, then enable recording only after review.',
      'Keep route traffic, usage writes, and billing disabled until smoke, usage attribution, settlement, minimum-balance, and founder-approval gates pass.',
    ],
  };
}

function buildAdapterEndpointSmokeStatusDisabledResponse(input = {}, now = new Date()) {
  const deployment = input.deployment || {};
  const strictLoadProofMatch = hasStrictLoadProofMatch(deployment);

  return {
    object: 'adapter_endpoint_smoke_status_disabled',
    version: ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
    generated_at: now.toISOString(),
    renter_id: Number.isInteger(deployment.renter_id) ? deployment.renter_id : null,
    deployment_id: deployment.deployment_id || null,
    adapter_id: deployment.adapter_id || null,
    endpoint_id: deployment.endpoint_id || null,
    base_model: deployment.base_model || null,
    endpoint_smoke_status_endpoint_live: true,
    endpoint_smoke_recording_enabled: false,
    endpoint_smoke_recorded: false,
    latest_smoke_result: null,
    smoke_history: [],
    denial_code: 'adapter_endpoint_smoke_status_unrecorded',
    readiness: {
      strict_load_proof_match: strictLoadProofMatch,
      recording_can_start: false,
      missing_before_recording: [
        ...(strictLoadProofMatch ? [] : ['strict_load_proof_match']),
        'funded_smoke_principal',
        'deterministic_smoke_submission',
        'usage_attribution_policy',
        'settlement_policy',
        'minimum_balance_policy',
        'founder_approval',
      ],
    },
    message: 'No adapter endpoint smoke result is recorded. This status route is owner-scoped and read-only while endpoint smoke recording remains disabled.',
    endpoints: {
      endpoint_smoke_status: 'GET /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke',
      disabled_submission_endpoint: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke',
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
    },
    claim_guards: {
      renter_auth_required: true,
      renter_owner_scope_enforced: true,
      disabled_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      returns_recorded_smoke: false,
      records_smoke_result: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run strict adapter load proof against the target vLLM endpoint.',
      'Submit deterministic smoke evidence to the disabled POST contract to validate shape.',
      'Enable smoke recording only after usage attribution, settlement, minimum-balance, and founder-approval gates pass.',
    ],
  };
}

function buildAdapterEndpointSmokeDisabledResponse(input = {}, now = new Date()) {
  const deployment = input.deployment || {};
  const evaluation = evaluateAdapterEndpointSmoke({
    deployment,
    smoke_result: input.smoke_result || {},
    funded_smoke_principal: input.funded_smoke_principal === true,
  });

  return {
    object: 'adapter_endpoint_smoke_submission_disabled',
    version: ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
    generated_at: now.toISOString(),
    renter_id: Number.isInteger(deployment.renter_id) ? deployment.renter_id : null,
    deployment_id: deployment.deployment_id || null,
    adapter_id: deployment.adapter_id || null,
    endpoint_id: deployment.endpoint_id || null,
    base_model: deployment.base_model || null,
    endpoint_smoke_submission_live: false,
    endpoint_smoke_recording_enabled: false,
    recorded: false,
    would_record_if_enabled: evaluation.would_pass_if_enabled,
    denial_code: evaluation.denial_code_while_disabled,
    message: 'Adapter endpoint smoke recording is disabled until strict load proof, funded principal, deterministic smoke, usage attribution, settlement, minimum-balance, and founder approval gates pass.',
    evaluation,
    endpoints: {
      disabled_submission_endpoint: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke',
      endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
      usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
      adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
    },
    claim_guards: {
      renter_auth_required: true,
      renter_owner_scope_enforced: true,
      disabled_submission_endpoint_live: true,
      endpoint_smoke_submission_live: false,
      endpoint_smoke_recording_enabled: false,
      records_smoke_result: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Use this disabled route to validate future smoke evidence shape only.',
      'Do not persist smoke evidence or rely on it for billing until endpoint smoke recording is explicitly enabled.',
      'Keep raw prompts and raw responses out of this contract; only hashed evidence belongs in future recorded smoke rows.',
    ],
  };
}

function evaluateAdapterEndpointSmoke(input = {}) {
  const deployment = input.deployment || {};
  const proof = deployment.serving_load_proof || {};
  const smoke = input.smoke_result || {};
  const trace = smoke.adapter_trace || {};

  const strictLoadProofMatch = hasStrictLoadProofMatch(deployment);

  const requestReady = positiveInt(smoke.renter_id)
    && smoke.renter_id === deployment.renter_id
    && same(smoke.deployment_id, deployment.deployment_id)
    && same(smoke.adapter_id, deployment.adapter_id)
    && same(smoke.endpoint_id, deployment.endpoint_id)
    && same(smoke.base_model, deployment.base_model)
    && same(smoke.artifact_checksum_sha256, proof.artifact_checksum_sha256)
    && nonEmpty(smoke.provider_id)
    && nonEmpty(smoke.request_id);

  const responseReady = integerBetween(smoke.status_code, 200, 299)
    && isSha256(smoke.response_checksum_sha256)
    && nonEmpty(smoke.finish_reason);

  const latencyReady = integerAtLeast(smoke.latency_ms, 0) && smoke.latency_ms <= 60000;
  const usageReady = integerAtLeast(smoke.prompt_tokens, 0)
    && integerAtLeast(smoke.completion_tokens, 0)
    && integerAtLeast(smoke.total_tokens, 0)
    && smoke.total_tokens === smoke.prompt_tokens + smoke.completion_tokens;

  const adapterTraceReady = trace.routed_through_adapter === true
    && same(trace.deployment_id, deployment.deployment_id)
    && same(trace.adapter_id, deployment.adapter_id)
    && same(trace.endpoint_id, deployment.endpoint_id)
    && same(trace.artifact_checksum_sha256, proof.artifact_checksum_sha256);

  const checks = {
    strict_load_proof_match: strictLoadProofMatch,
    funded_smoke_principal: input.funded_smoke_principal === true,
    smoke_request_attribution: requestReady,
    smoke_response_hash: responseReady,
    smoke_latency_budget: latencyReady,
    smoke_usage_tokens: usageReady,
    adapter_trace_match: adapterTraceReady,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const wouldPassIfEnabled = blockers.length === 0;

  return {
    object: 'adapter_endpoint_smoke_evaluation',
    version: ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
    endpoint_smoke_recording_enabled: false,
    passed: false,
    would_pass_if_enabled: wouldPassIfEnabled,
    checks,
    blockers,
    denial_code_while_disabled: wouldPassIfEnabled
      ? 'adapter_endpoint_smoke_disabled'
      : denialCodeForBlocker(blockers[0]),
    smoke_attribution: {
      renter_id: smoke.renter_id || null,
      deployment_id: smoke.deployment_id || null,
      adapter_id: smoke.adapter_id || null,
      endpoint_id: smoke.endpoint_id || null,
      base_model: smoke.base_model || null,
      artifact_checksum_sha256: smoke.artifact_checksum_sha256 || null,
      provider_id: smoke.provider_id || null,
      request_id: smoke.request_id || null,
      status_code: numberOrNull(smoke.status_code),
      latency_ms: numberOrNull(smoke.latency_ms),
      response_checksum_sha256: smoke.response_checksum_sha256 || null,
      prompt_tokens: numberOrNull(smoke.prompt_tokens),
      completion_tokens: numberOrNull(smoke.completion_tokens),
      total_tokens: numberOrNull(smoke.total_tokens),
      finish_reason: smoke.finish_reason || null,
    },
  };
}

function hasStrictLoadProofMatch(deployment = {}) {
  const proof = deployment.serving_load_proof || {};
  return deployment.route_traffic === true
    && proof.loaded === true
    && same(proof.deployment_id, deployment.deployment_id)
    && same(proof.adapter_id, deployment.adapter_id)
    && same(proof.base_model, deployment.base_model)
    && same(proof.mode, deployment.mode)
    && (!deployment.endpoint_id || same(proof.endpoint_id, deployment.endpoint_id))
    && isSha256(proof.artifact_checksum_sha256);
}

function denialCodeForBlocker(blocker) {
  return {
    strict_load_proof_match: 'adapter_endpoint_smoke_load_proof_required',
    funded_smoke_principal: 'adapter_endpoint_smoke_funded_principal_required',
    smoke_request_attribution: 'adapter_endpoint_smoke_request_required',
    smoke_response_hash: 'adapter_endpoint_smoke_response_required',
    smoke_latency_budget: 'adapter_endpoint_smoke_latency_required',
    smoke_usage_tokens: 'adapter_endpoint_smoke_usage_required',
    adapter_trace_match: 'adapter_endpoint_smoke_adapter_trace_required',
  }[blocker] || 'adapter_endpoint_smoke_disabled';
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

function integerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

module.exports = {
  ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
  ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
  ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
  buildAdapterEndpointSmokeReadiness,
  buildAdapterEndpointSmokeStatusDisabledResponse,
  buildAdapterEndpointSmokeDisabledResponse,
  evaluateAdapterEndpointSmoke,
  hasStrictLoadProofMatch,
};
