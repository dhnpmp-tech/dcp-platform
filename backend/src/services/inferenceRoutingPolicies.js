'use strict';

const ROUTING_POLICY_CONTRACT_VERSION = 'dcp.inference_routing_policies.v1';

const ROUTING_POLICY_CLAIM_GUARDS = Object.freeze({
  changes_provider_selection: false,
  enables_future_policy_selection: false,
  enables_price_optimized_routing: false,
  enables_geo_residency_routing: false,
  enables_coding_or_arabic_classifier_routing: false,
  changes_billing_or_settlement: false,
  proves_live_latency_ordering: false,
  proves_tinker_compatibility: false,
});

const ROUTING_POLICY_PROOF_CONTRACT = Object.freeze({
  command: 'npm run proof:router-policy-contract',
  mode: 'ci_safe_service_contract',
  live_smoke_required_before_selectable: true,
  required_before_future_policy_selectable: [
    'policy_specific_route_tests',
    'funded_policy_live_smoke',
    'pricing_or_residency_or_classifier_evidence_for_specialized_policies',
  ],
});

function gate(id, label, status, next, required = true) {
  return { id, label, status, required, next };
}

function policyProofGates(policyId, latencyGateEnabled) {
  switch (policyId) {
    case 'balanced':
      return [
        gate(
          'balanced_noop_contract',
          'Balanced no-op contract',
          'ci_safe',
          'keep explicit routing_policy=balanced equivalent to default routing',
        ),
        gate(
          'future_policy_fail_closed',
          'Future policy fail-closed tests',
          'ci_safe',
          'reject staged policy ids before they can affect provider selection',
        ),
      ];
    case 'lowest_latency':
      return [
        gate(
          'latency_telemetry_visibility',
          'Latency telemetry visibility',
          latencyGateEnabled ? 'telemetry_gate_only' : 'gated_by_env',
          'prove p50/p95 telemetry exists before strict latency ordering',
        ),
        gate(
          'policy_specific_route_tests',
          'Policy-specific route tests',
          'required',
          'add deterministic tests proving lowest-latency candidate ordering',
        ),
        gate(
          'funded_policy_live_smoke',
          'Funded policy live smoke',
          'blocked_external',
          'run a funded live request proving lowest-latency behavior before selection',
        ),
      ];
    case 'cheapest':
      return [
        gate(
          'cost_aware_route_tests',
          'Cost-aware route tests',
          'required',
          'prove cheapest candidate ordering without breaking model compatibility',
        ),
        gate(
          'settlement_math_reconciliation',
          'Settlement math reconciliation',
          'required',
          'reconcile route-estimated cost with billing and provider settlement math',
        ),
        gate(
          'funded_policy_live_smoke',
          'Funded policy live smoke',
          'blocked_external',
          'run a funded live request proving cost-first behavior before selection',
        ),
      ];
    case 'saudi_only':
      return [
        gate(
          'provider_geo_audit',
          'Provider geography audit',
          'required',
          'make provider geography auditable before hard residency filters',
        ),
        gate(
          'residency_policy_approval',
          'Residency policy approval',
          'policy_required',
          'approve the customer-facing residency claim before request selection',
        ),
        gate(
          'funded_policy_live_smoke',
          'Funded policy live smoke',
          'blocked_external',
          'run a funded live request proving geography-filtered routing',
        ),
      ];
    case 'coding':
      return [
        gate(
          'agent_path_smoke',
          'Agent-path smoke',
          'required',
          'prove Anthropic-compatible and coding catalog paths before router selection',
        ),
        gate(
          'classifier_route_tests',
          'Classifier route tests',
          'required',
          'prove coding request classifier hints do not misroute general chat',
        ),
        gate(
          'funded_policy_live_smoke',
          'Funded policy live smoke',
          'blocked_external',
          'run a funded live request proving coding policy behavior',
        ),
      ];
    case 'arabic':
      return [
        gate(
          'arabic_benchmark_freshness',
          'Arabic benchmark freshness',
          'required',
          'refresh Arabic benchmark evidence before language-specific routing claims',
        ),
        gate(
          'language_classifier_tests',
          'Language classifier tests',
          'required',
          'prove Arabic language hints route safely without overclaiming quality',
        ),
        gate(
          'funded_policy_live_smoke',
          'Funded policy live smoke',
          'blocked_external',
          'run a funded live request proving Arabic policy behavior',
        ),
      ];
    default:
      return [];
  }
}

function selectionGuard(policyId) {
  return policyId === 'balanced'
    ? 'accepted_noop_only'
    : 'not_request_selectable_until_policy_specific_proof';
}

function normalizeEarnedMode(value) {
  const mode = String(value || 'exclude-dead').trim().toLowerCase();
  return ['off', 'exclude-dead', 'earned-first', 'strict'].includes(mode) ? mode : 'exclude-dead';
}

function toBool(value, fallback = true) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function buildInferenceRoutingPolicies(env = process.env) {
  const earnedMode = normalizeEarnedMode(env.DCP_ROUTING_EARNED_MODE);
  const latencyGateEnabled = toBool(env.V1_LATENCY_GATE_ENABLED, true);
  const policies = [
    {
      id: 'balanced',
      label: 'Balanced',
      status: 'available',
      available: true,
      default: true,
      request_selectable: false,
      current_behavior: 'earned-state safety filter, latency/stream health gate, then low GPU utilization fallback',
      signals: [
        'earned_state',
        'endpoint_reachability',
        'model_cache_match',
        'latency_gate',
        'stream_failure_rate',
        'gpu_utilization',
      ],
      runtime: {
        earned_routing_mode: earnedMode,
        latency_gate_enabled: latencyGateEnabled,
      },
      next: 'expose_request_selectable_policy_after_policy_audit',
    },
    {
      id: 'lowest_latency',
      label: 'Lowest latency',
      status: latencyGateEnabled ? 'telemetry_gate_only' : 'gated',
      available: false,
      request_selectable: false,
      current_behavior: latencyGateEnabled
        ? 'latency telemetry filters unhealthy providers but does not yet sort strictly by lowest latency'
        : 'latency gate disabled by environment',
      signals: ['latency_ms_p50', 'latency_ms_p95', 'stream_failure_rate'],
      next: 'add_latency_sorted_candidate_order_with_route_tests',
    },
    {
      id: 'cheapest',
      label: 'Cheapest',
      status: 'not_enabled',
      available: false,
      request_selectable: false,
      current_behavior: 'pricing metadata is exposed, but provider selection does not yet optimize for lowest estimated cost',
      signals: ['model_token_pricing', 'provider_cost_per_gpu_second'],
      next: 'define_cost_aware_router_without_breaking settlement',
    },
    {
      id: 'saudi_only',
      label: 'Saudi only',
      status: 'gated',
      available: false,
      request_selectable: false,
      current_behavior: 'DCP markets Saudi/GCC compute, but provider geography is not yet a hard request-level routing filter',
      signals: ['provider_country', 'provider_region', 'data_residency_policy'],
      next: 'make provider geography auditable before enabling hard residency filters',
    },
    {
      id: 'coding',
      label: 'Coding',
      status: 'catalog_only',
      available: false,
      request_selectable: false,
      current_behavior: 'coding models are curated through /v1/coding/models and Anthropic-compatible agent routes, not a general router policy selector',
      signals: ['curated_coding_catalog', 'request_classifier_code_score'],
      next: 'connect classifier hints to explicit router policy after agent-path smoke tests',
    },
    {
      id: 'arabic',
      label: 'Arabic',
      status: 'catalog_only',
      available: false,
      request_selectable: false,
      current_behavior: 'Arabic model metadata and portfolio tiers exist, but request-level Arabic routing policy is not enabled',
      signals: ['model_supported_features_multilingual', 'arabic_portfolio_tier', 'request_classifier_language_hint'],
      next: 'add Arabic policy only after benchmark and model-selection proofs are current',
    },
  ].map((policy) => ({
    ...policy,
    selection_guard: selectionGuard(policy.id),
    proof_gates: policyProofGates(policy.id, latencyGateEnabled),
  }));

  return {
    object: 'list',
    version: ROUTING_POLICY_CONTRACT_VERSION,
    default_policy: 'balanced',
    request_policy_parameter: null,
    request_selectable: false,
    proof_contract: ROUTING_POLICY_PROOF_CONTRACT,
    claim_guards: ROUTING_POLICY_CLAIM_GUARDS,
    generated_at: new Date().toISOString(),
    data: policies,
  };
}

function normalizeRequestedRoutingPolicy(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase().replace(/-/g, '_');
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(normalized)) return 'invalid';
  return normalized;
}

function extractRequestedRoutingPolicy(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.prototype.hasOwnProperty.call(body, 'routing_policy')) {
    return normalizeRequestedRoutingPolicy(body.routing_policy);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'route_policy')) {
    return normalizeRequestedRoutingPolicy(body.route_policy);
  }
  const routing = body.routing;
  if (routing && typeof routing === 'object' && !Array.isArray(routing)
    && Object.prototype.hasOwnProperty.call(routing, 'policy')) {
    return normalizeRequestedRoutingPolicy(routing.policy);
  }
  return null;
}

function resolveRequestedRoutingPolicy(body = {}, env = process.env) {
  const contract = buildInferenceRoutingPolicies(env);
  const requested = extractRequestedRoutingPolicy(body);
  const defaultPolicy = contract.data.find((policy) => policy.id === contract.default_policy);
  if (requested == null) {
    return {
      ok: true,
      explicit: false,
      policy: defaultPolicy,
      contract,
    };
  }
  if (requested === 'invalid') {
    return {
      ok: false,
      httpStatus: 400,
      code: 'invalid_routing_policy',
      message: 'routing_policy must be a lowercase policy id such as balanced',
      requested_policy: null,
      contract,
    };
  }
  const policy = contract.data.find((entry) => entry.id === requested);
  if (!policy) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'unknown_routing_policy',
      message: `Unknown routing_policy '${requested}'`,
      requested_policy: requested,
      contract,
    };
  }
  if (policy.id !== contract.default_policy || policy.request_selectable !== false || policy.available !== true) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'routing_policy_not_selectable',
      message: `routing_policy '${policy.id}' is not request-selectable yet`,
      requested_policy: policy.id,
      policy,
      contract,
    };
  }
  return {
    ok: true,
    explicit: true,
    policy,
    contract,
  };
}

module.exports = {
  ROUTING_POLICY_CLAIM_GUARDS,
  ROUTING_POLICY_PROOF_CONTRACT,
  ROUTING_POLICY_CONTRACT_VERSION,
  buildInferenceRoutingPolicies,
  extractRequestedRoutingPolicy,
  normalizeEarnedMode,
  normalizeRequestedRoutingPolicy,
  resolveRequestedRoutingPolicy,
};
