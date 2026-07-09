'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterEndpointSmokeStatusDisabledProof,
} = require('../../tests/adapter-endpoint-smoke-status-disabled-proof');

describe('adapter endpoint smoke status disabled proof script', () => {
  test('writes a CI-safe proof report for disabled adapter endpoint smoke status', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-endpoint-smoke-status-disabled-proof-'));
    const report = runAdapterEndpointSmokeStatusDisabledProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      disabled_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      returns_recorded_smoke: false,
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
    expect(report.strict_load_status).toMatchObject({
      object: 'adapter_endpoint_smoke_status_disabled',
      endpoint_smoke_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      endpoint_smoke_recorded: false,
      latest_smoke_result: null,
      readiness: {
        strict_load_proof_match: true,
      },
    });
    expect(report.pending_load_status).toMatchObject({
      endpoint_smoke_recording_enabled: false,
      endpoint_smoke_recorded: false,
      readiness: {
        strict_load_proof_match: false,
        missing_before_recording: expect.arrayContaining(['strict_load_proof_match']),
      },
    });
    expect(report.raw_payload_guard).toMatchObject({
      serialized_contains_raw_prompt: false,
      serialized_contains_raw_response: false,
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'strict load proof status remains no-record while recording is disabled',
      'missing load proof is visible without recording smoke',
      'status contract never exposes raw prompt or response content',
      'proof performs no smoke usage route or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-status-disabled-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-status-disabled-proof-latest.md'))).toBe(true);
  });
});
