'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterEndpointSmokeSubmissionDisabledProof,
} = require('../../tests/adapter-endpoint-smoke-submission-disabled-proof');

describe('adapter endpoint smoke submission disabled proof script', () => {
  test('writes a CI-safe proof report for disabled adapter endpoint smoke submission', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-endpoint-smoke-submission-disabled-proof-'));
    const report = runAdapterEndpointSmokeSubmissionDisabledProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      disabled_submission_endpoint_live: true,
      endpoint_smoke_submission_live: false,
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
    expect(report.complete_submission).toMatchObject({
      object: 'adapter_endpoint_smoke_submission_disabled',
      endpoint_smoke_submission_live: false,
      endpoint_smoke_recording_enabled: false,
      recorded: false,
      would_record_if_enabled: true,
      denial_code: 'adapter_endpoint_smoke_disabled',
      evaluation: {
        would_pass_if_enabled: true,
        blockers: [],
      },
    });
    expect(report.endpoint_mismatch).toMatchObject({
      recorded: false,
      would_record_if_enabled: false,
      denial_code: 'adapter_endpoint_smoke_request_required',
      evaluation: {
        blockers: ['smoke_request_attribution'],
      },
    });
    expect(report.raw_payload_guard).toMatchObject({
      serialized_contains_raw_prompt: false,
      serialized_contains_raw_response: false,
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'complete endpoint smoke submission remains disabled',
      'endpoint drift blocks disabled smoke submission',
      'disabled smoke submission never exposes raw prompt or response content',
      'proof performs no smoke usage route or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-submission-disabled-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-endpoint-smoke-submission-disabled-proof-latest.md'))).toBe(true);
  });
});
