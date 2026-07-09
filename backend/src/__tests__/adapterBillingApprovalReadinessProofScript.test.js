'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterBillingApprovalReadinessProof,
} = require('../../tests/adapter-billing-approval-readiness-proof');

describe('adapter billing approval readiness proof script', () => {
  test('writes a CI-safe proof report for disabled adapter billing approval policy', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-billing-approval-readiness-proof-'));
    const report = runAdapterBillingApprovalReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      readiness_contract_live: true,
      founder_billing_approval_live: false,
      adapter_billing_enablement_live: false,
      approval_mutations_enabled: false,
      dispatches_inference: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    });
    expect(report.eligible_when_enabled).toMatchObject({
      founder_billing_approval_live: false,
      approved: false,
      would_approve_if_enabled: true,
      denial_code_while_disabled: 'adapter_billing_approval_disabled',
      blockers: [],
    });
    expect(report.missing_hash).toMatchObject({
      would_approve_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_approval_evidence_hash_required',
    });
    expect(report.missing_founder).toMatchObject({
      would_approve_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_approval_founder_required',
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter billing approval readiness is public and policy-only',
      'complete evidence remains unapproved until approval enablement',
      'evidence packet hash is required before approval',
      'founder approval is required before billing enablement',
      'proof performs no adapter traffic or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-billing-approval-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-billing-approval-readiness-proof-latest.md'))).toBe(true);
  });
});
