'use strict';

const ROUTING_POLICY_CONTRACT_VERSION = 'dcp.inference_routing_policies.v1';

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
  ];

  return {
    object: 'list',
    version: ROUTING_POLICY_CONTRACT_VERSION,
    default_policy: 'balanced',
    request_policy_parameter: null,
    request_selectable: false,
    generated_at: new Date().toISOString(),
    data: policies,
  };
}

module.exports = {
  ROUTING_POLICY_CONTRACT_VERSION,
  buildInferenceRoutingPolicies,
  normalizeEarnedMode,
};
