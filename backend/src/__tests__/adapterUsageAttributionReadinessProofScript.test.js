'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterUsageAttributionReadinessProof,
} = require('../../tests/adapter-usage-attribution-readiness-proof');

describe('adapter usage attribution readiness proof script', () => {
  test('writes a CI-safe proof report for disabled adapter usage attribution', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-usage-attribution-readiness-proof-'));
    const report = runAdapterUsageAttributionReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      readiness_contract_live: true,
      adapter_usage_attribution_enabled: false,
      adapter_usage_ledger_writes_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      changes_budget_cap: false,
      settles_provider_payout: false,
      claims_tinker_compatibility: false,
    });
    expect(report.readiness).toMatchObject({
      endpoints: {
        usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
        usage_export: 'GET /api/renters/me/usage/export',
      },
      policy: {
        adapter_usage_attribution_enabled: false,
        adapter_usage_ledger_writes_enabled: false,
        adapter_billing_enabled: false,
      },
      claim_guards: {
        adapter_usage_ledger_writes_enabled: false,
        routes_adapter_traffic: false,
        mutates_balance: false,
        enables_adapter_billing: false,
      },
    });
    expect(report.complete_usage).toMatchObject({
      attribution_enabled: false,
      usage_ledger_write_enabled: false,
      recorded: false,
      would_record_if_enabled: true,
      denial_code_while_disabled: 'adapter_usage_attribution_disabled',
      blockers: [],
    });
    expect(report.missing_load_proof).toMatchObject({
      would_record_if_enabled: false,
      denial_code_while_disabled: 'adapter_usage_load_proof_required',
    });
    expect(report.endpoint_mismatch).toMatchObject({
      would_record_if_enabled: false,
      denial_code_while_disabled: 'adapter_usage_deployment_mismatch',
    });
    expect(report.bad_token_totals).toMatchObject({
      would_record_if_enabled: false,
      denial_code_while_disabled: 'adapter_usage_token_cost_required',
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter usage attribution readiness is public and contract-only',
      'complete adapter usage attribution remains disabled until writes are enabled',
      'missing strict load proof blocks adapter usage attribution',
      'endpoint or checksum drift blocks adapter usage attribution',
      'token and cost totals are required before adapter usage writes',
      'proof performs no adapter traffic usage or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-usage-attribution-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-usage-attribution-readiness-proof-latest.md'))).toBe(true);
  });
});
