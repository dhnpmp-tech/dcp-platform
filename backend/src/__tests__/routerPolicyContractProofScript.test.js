'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runRouterPolicyContractProof,
} = require('../../tests/router-policy-contract-proof');

describe('router policy contract proof script', () => {
  test('writes a CI-safe proof report for router policy readiness gates', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-policy-proof-'));
    const report = runRouterPolicyContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.routing_policy_contract_version).toBe('dcp.inference_routing_policies.v1');
    expect(report.claims).toMatchObject({
      changes_provider_selection: false,
      enables_future_policy_selection: false,
      enables_price_optimized_routing: false,
      enables_geo_residency_routing: false,
      enables_coding_or_arabic_classifier_routing: false,
      changes_billing_or_settlement: false,
      proves_live_latency_ordering: false,
      proves_tinker_compatibility: false,
    });
    expect(report.catalog).toMatchObject({
      object: 'list',
      version: 'dcp.inference_routing_policies.v1',
      default_policy: 'balanced',
      request_policy_parameter: null,
      request_selectable: false,
      policy_ids: [
        'balanced',
        'lowest_latency',
        'cheapest',
        'saudi_only',
        'coding',
        'arabic',
      ],
    });
    expect(report.catalog.policies.find((policy) => policy.id === 'balanced')).toMatchObject({
      status: 'available',
      available: true,
      default: true,
      request_selectable: false,
      runtime: {
        earned_routing_mode: 'strict',
        latency_gate_enabled: true,
      },
    });
    expect(report.catalog.policies.filter((policy) => policy.id !== 'balanced')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'lowest_latency', available: false, request_selectable: false }),
      expect.objectContaining({ id: 'cheapest', status: 'not_enabled', available: false }),
      expect.objectContaining({ id: 'saudi_only', status: 'gated', available: false }),
      expect.objectContaining({ id: 'coding', status: 'catalog_only', available: false }),
      expect.objectContaining({ id: 'arabic', status: 'catalog_only', available: false }),
    ]));
    expect(report.env_variants).toMatchObject({
      strict_latency_on: {
        earned_mode: 'strict',
        latency_gate_enabled: true,
        lowest_latency_status: 'telemetry_gate_only',
      },
      invalid_mode_latency_off: {
        normalized_earned_mode: 'exclude-dead',
        earned_mode: 'exclude-dead',
        latency_gate_enabled: false,
        lowest_latency_status: 'gated',
        lowest_latency_available: false,
      },
    });
    expect(report.request_resolution).toMatchObject({
      normalized_lowest_latency: 'lowest_latency',
      implicit: {
        ok: true,
        explicit: false,
        policy_id: 'balanced',
      },
      explicit_snake: {
        ok: true,
        explicit: true,
        policy_id: 'balanced',
      },
      explicit_alias: {
        ok: true,
        explicit: true,
        policy_id: 'balanced',
      },
      explicit_nested: {
        ok: true,
        explicit: true,
        policy_id: 'balanced',
      },
    });
    for (const id of ['lowest_latency', 'cheapest', 'saudi_only', 'coding', 'arabic']) {
      expect(report.future_policy_rejections.staged[id]).toMatchObject({
        ok: false,
        httpStatus: 400,
        code: 'routing_policy_not_selectable',
        requested_policy: id,
        policy_available: false,
        policy_request_selectable: false,
      });
    }
    expect(report.future_policy_rejections.unknown).toMatchObject({
      ok: false,
      httpStatus: 400,
      code: 'unknown_routing_policy',
      requested_policy: 'moonshot',
    });
    expect(report.future_policy_rejections.invalid).toMatchObject({
      ok: false,
      httpStatus: 400,
      code: 'invalid_routing_policy',
      requested_policy: null,
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'catalog is read-only with balanced as the only available default',
      'environment toggles only affect readiness metadata, not selectable policies',
      'explicit balanced policy is an accepted no-op across supported request shapes',
      'future, unknown, and invalid policies fail closed before routing',
      'specialized policy claims remain gated until policy-specific tests and smokes exist',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'router-policy-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'router-policy-contract-proof-latest.md'))).toBe(true);
  });
});
