'use strict';

const {
  ROUTING_POLICY_CONTRACT_VERSION,
  buildInferenceRoutingPolicies,
  normalizeEarnedMode,
  resolveRequestedRoutingPolicy,
} = require('../services/inferenceRoutingPolicies');

describe('inference routing policy catalog', () => {
  test('normalizes earned routing modes with exclude-dead fallback', () => {
    expect(normalizeEarnedMode('strict')).toBe('strict');
    expect(normalizeEarnedMode('earned-first')).toBe('earned-first');
    expect(normalizeEarnedMode('nonsense')).toBe('exclude-dead');
    expect(normalizeEarnedMode('')).toBe('exclude-dead');
  });

  test('returns a read-only customer-facing policy contract', () => {
    const contract = buildInferenceRoutingPolicies({
      DCP_ROUTING_EARNED_MODE: 'strict',
      V1_LATENCY_GATE_ENABLED: '1',
    });

    expect(contract).toMatchObject({
      object: 'list',
      version: ROUTING_POLICY_CONTRACT_VERSION,
      default_policy: 'balanced',
      request_policy_parameter: null,
      request_selectable: false,
      proof_contract: {
        command: 'npm run proof:router-policy-contract',
        live_smoke_required_before_selectable: true,
      },
      claim_guards: {
        changes_provider_selection: false,
        enables_future_policy_selection: false,
        enables_price_optimized_routing: false,
        enables_geo_residency_routing: false,
        enables_coding_or_arabic_classifier_routing: false,
        changes_billing_or_settlement: false,
        proves_live_latency_ordering: false,
        proves_tinker_compatibility: false,
      },
    });
    expect(contract.data.map((policy) => policy.id)).toEqual([
      'balanced',
      'lowest_latency',
      'cheapest',
      'saudi_only',
      'coding',
      'arabic',
    ]);
    expect(contract.data.find((policy) => policy.id === 'balanced')).toMatchObject({
      status: 'available',
      available: true,
      default: true,
      request_selectable: false,
      selection_guard: 'accepted_noop_only',
      runtime: {
        earned_routing_mode: 'strict',
        latency_gate_enabled: true,
      },
    });
    expect(contract.data.find((policy) => policy.id === 'balanced').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'balanced_noop_contract', status: 'ci_safe' }),
      expect.objectContaining({ id: 'future_policy_fail_closed', status: 'ci_safe' }),
    ]));
    expect(contract.data.find((policy) => policy.id === 'lowest_latency')).toMatchObject({
      status: 'telemetry_gate_only',
      available: false,
      request_selectable: false,
      selection_guard: 'not_request_selectable_until_policy_specific_proof',
    });
    expect(contract.data.find((policy) => policy.id === 'lowest_latency').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'latency_telemetry_visibility', status: 'telemetry_gate_only' }),
      expect.objectContaining({ id: 'policy_specific_route_tests', status: 'required' }),
      expect.objectContaining({ id: 'funded_policy_live_smoke', status: 'blocked_external' }),
    ]));
    expect(contract.data.find((policy) => policy.id === 'cheapest').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'settlement_math_reconciliation', status: 'required' }),
    ]));
    expect(contract.data.find((policy) => policy.id === 'coding')).toMatchObject({
      status: 'catalog_only',
      available: false,
      selection_guard: 'not_request_selectable_until_policy_specific_proof',
    });
    expect(contract.data.find((policy) => policy.id === 'coding').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent_path_smoke', status: 'required' }),
    ]));
    expect(contract.data.find((policy) => policy.id === 'arabic').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'arabic_benchmark_freshness', status: 'required' }),
    ]));
  });

  test('marks latency policy gated when latency gate is disabled', () => {
    const contract = buildInferenceRoutingPolicies({
      V1_LATENCY_GATE_ENABLED: '0',
    });

    expect(contract.data.find((policy) => policy.id === 'lowest_latency')).toMatchObject({
      status: 'gated',
      current_behavior: 'latency gate disabled by environment',
    });
    expect(contract.data.find((policy) => policy.id === 'lowest_latency').proof_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'latency_telemetry_visibility', status: 'gated_by_env' }),
    ]));
  });

  test('allows explicit balanced policy and rejects staged policies', () => {
    const allowed = resolveRequestedRoutingPolicy({ routing_policy: 'balanced' });
    expect(allowed).toMatchObject({
      ok: true,
      explicit: true,
      policy: {
        id: 'balanced',
        available: true,
      },
    });

    const unavailable = resolveRequestedRoutingPolicy({ routing: { policy: 'cheapest' } });
    expect(unavailable).toMatchObject({
      ok: false,
      httpStatus: 400,
      code: 'routing_policy_not_selectable',
      requested_policy: 'cheapest',
      policy: {
        id: 'cheapest',
        status: 'not_enabled',
      },
    });

    const unknown = resolveRequestedRoutingPolicy({ route_policy: 'moonshot' });
    expect(unknown).toMatchObject({
      ok: false,
      code: 'unknown_routing_policy',
      requested_policy: 'moonshot',
    });
  });
});
