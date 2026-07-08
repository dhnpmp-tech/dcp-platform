'use strict';

const {
  ROUTING_POLICY_CONTRACT_VERSION,
  buildInferenceRoutingPolicies,
  normalizeEarnedMode,
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
      runtime: {
        earned_routing_mode: 'strict',
        latency_gate_enabled: true,
      },
    });
    expect(contract.data.find((policy) => policy.id === 'lowest_latency')).toMatchObject({
      status: 'telemetry_gate_only',
      available: false,
      request_selectable: false,
    });
    expect(contract.data.find((policy) => policy.id === 'coding')).toMatchObject({
      status: 'catalog_only',
      available: false,
    });
  });

  test('marks latency policy gated when latency gate is disabled', () => {
    const contract = buildInferenceRoutingPolicies({
      V1_LATENCY_GATE_ENABLED: '0',
    });

    expect(contract.data.find((policy) => policy.id === 'lowest_latency')).toMatchObject({
      status: 'gated',
      current_behavior: 'latency gate disabled by environment',
    });
  });
});
