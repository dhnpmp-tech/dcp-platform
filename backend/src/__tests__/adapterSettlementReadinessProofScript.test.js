'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterSettlementReadinessProof,
} = require('../../tests/adapter-settlement-readiness-proof');

describe('adapter settlement readiness proof script', () => {
  test('writes a CI-safe proof report for disabled adapter settlement policy', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-settlement-readiness-proof-'));
    const report = runAdapterSettlementReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      readiness_contract_live: true,
      adapter_settlement_enabled: false,
      provider_payouts_enabled: false,
      platform_revenue_split_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    });
    expect(report.readiness).toMatchObject({
      endpoints: {
        settlement_readiness: 'GET /api/adapters/settlement/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      },
      policy: {
        adapter_settlement_enabled: false,
        provider_payouts_enabled: false,
        platform_revenue_split_enabled: false,
        settlement_mutations_enabled: false,
        split_policy: {
          status: 'policy_pending',
          requires_cost_sum_match: true,
          provider_share_live: false,
          platform_share_live: false,
        },
      },
      claim_guards: {
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
      },
    });
    expect(report.eligible_when_enabled).toMatchObject({
      settlement_enabled: false,
      settled: false,
      would_settle_if_enabled: true,
      denial_code_while_disabled: 'adapter_settlement_disabled',
      blockers: [],
    });
    expect(report.split_mismatch).toMatchObject({
      would_settle_if_enabled: false,
      denial_code_while_disabled: 'adapter_settlement_split_mismatch',
    });
    expect(report.usage_mismatch).toMatchObject({
      would_settle_if_enabled: false,
      denial_code_while_disabled: 'adapter_settlement_usage_attribution_required',
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter settlement readiness is public and policy-only',
      'fully attributed adapter usage remains unsettled until policy enablement',
      'provider and platform shares must sum to adapter cost',
      'usage ledger attribution must match adapter proof before settlement',
      'proof performs no adapter traffic or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-settlement-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-settlement-readiness-proof-latest.md'))).toBe(true);
  });
});
