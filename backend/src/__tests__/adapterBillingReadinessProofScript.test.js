'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterBillingReadinessProof,
} = require('../../tests/adapter-billing-readiness-proof');

describe('adapter billing readiness proof script', () => {
  test('writes a CI-safe proof report for disabled adapter billing policy', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-billing-readiness-proof-'));
    const report = runAdapterBillingReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      readiness_contract_live: true,
      adapter_billing_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      claims_tinker_compatibility: false,
    });
    expect(report.readiness).toMatchObject({
      endpoints: {
        billing_readiness: 'GET /api/adapters/billing/readiness',
        adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
      },
      policy: {
        adapter_inference_billing_enabled: false,
        bills_adapter_inference: false,
        minimum_balance: {
          status: 'policy_pending',
          enforcement_live: false,
        },
        settlement: {
          status: 'policy_pending',
          provider_split_live: false,
          platform_split_live: false,
        },
      },
      claim_guards: {
        mutates_balance: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        creates_invoice: false,
      },
    });
    expect(report.eligible_when_enabled).toMatchObject({
      billing_enabled: false,
      billable: false,
      would_bill_if_enabled: true,
      denial_code_while_disabled: 'adapter_billing_disabled',
      blockers: [],
    });
    expect(report.missing_load_proof).toMatchObject({
      would_bill_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_load_proof_required',
    });
    expect(report.usage_mismatch).toMatchObject({
      would_bill_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_usage_attribution_required',
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter billing readiness is public and policy-only',
      'fully attributed adapter usage remains non-billable until policy enablement',
      'missing strict load proof blocks adapter billing',
      'usage ledger attribution must match adapter proof before billing',
      'proof performs no adapter traffic or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-billing-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-billing-readiness-proof-latest.md'))).toBe(true);
  });
});
