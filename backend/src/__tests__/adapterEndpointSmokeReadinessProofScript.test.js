'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterEndpointSmokeReadinessProof,
} = require('../../tests/adapter-endpoint-smoke-readiness-proof');

describe('adapter endpoint smoke readiness proof script', () => {
  test('writes a CI-safe proof report for disabled adapter endpoint smoke recording', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-endpoint-smoke-readiness-proof-'));
    const report = runAdapterEndpointSmokeReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      readiness_contract_live: true,
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
    });
    expect(report.readiness).toMatchObject({
      endpoints: {
        endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
        usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      },
      policy: {
        endpoint_smoke_recording_enabled: false,
        adapter_endpoint_routing_enabled: false,
        adapter_billing_enabled: false,
        raw_prompt_storage_enabled: false,
        raw_response_storage_enabled: false,
      },
      claim_guards: {
        endpoint_smoke_recording_enabled: false,
        dispatches_inference: false,
        records_smoke_result: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        mutates_balance: false,
        enables_adapter_billing: false,
      },
    });
    expect(report.complete_smoke).toMatchObject({
      endpoint_smoke_recording_enabled: false,
      passed: false,
      would_pass_if_enabled: true,
      denial_code_while_disabled: 'adapter_endpoint_smoke_disabled',
      blockers: [],
    });
    expect(report.missing_load_proof).toMatchObject({
      would_pass_if_enabled: false,
      denial_code_while_disabled: 'adapter_endpoint_smoke_load_proof_required',
    });
    expect(report.endpoint_mismatch).toMatchObject({
      would_pass_if_enabled: false,
      denial_code_while_disabled: 'adapter_endpoint_smoke_request_required',
    });
    expect(report.bad_usage).toMatchObject({
      would_pass_if_enabled: false,
      denial_code_while_disabled: 'adapter_endpoint_smoke_usage_required',
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter endpoint smoke readiness is public and contract-only',
      'complete endpoint smoke remains disabled until smoke recording is enabled',
      'missing strict load proof blocks endpoint smoke',
      'endpoint attribution drift blocks endpoint smoke',
      'token totals must be coherent before endpoint smoke can pass',
      'proof performs no adapter traffic smoke usage or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-readiness-proof-latest.md'))).toBe(true);
  });
});
