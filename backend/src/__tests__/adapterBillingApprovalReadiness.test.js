'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
  buildAdapterBillingApprovalReadiness,
  evaluateAdapterBillingApproval,
} = require('../services/adapterBillingApprovalReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

function buildEvidence(overrides = {}) {
  return {
    strict_load_proof_match: true,
    endpoint_smoke_passed: true,
    usage_ledger_adapter_attribution: true,
    minimum_balance_policy_approved: true,
    settlement_split_policy_approved: true,
    local_roadmap_proof_passed: true,
    production_smoke_passed: true,
    evidence_packet_hash_sha256: 'd'.repeat(64),
    ...overrides,
  };
}

function buildApproval(overrides = {}) {
  return {
    founder_billing_approval: true,
    approval_id: 'appr_adapter_billing_001',
    approved_by: 'founder:billing',
    approved_at: '2026-07-09T09:05:00.000Z',
    scope: 'single_adapter_deployment',
    expires_at: '2026-07-10T09:05:00.000Z',
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use('/api/adapters', createAdaptersRouter({
    db: {
      exec: () => {},
      prepare: () => {
        throw new Error('protected adapter registry route should not be reached');
      },
    },
    requireRenter: (_req, res) => res.status(401).json({ error: 'Renter API key required' }),
  }));
  return app;
}

describe('adapter billing approval readiness policy', () => {
  test('builds a public approval readiness contract without enabling billing', () => {
    const readiness = buildAdapterBillingApprovalReadiness(new Date('2026-07-09T09:05:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_billing_approval_readiness',
      version: ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
      generated_at: '2026-07-09T09:05:00.000Z',
      current_mode: 'approval_policy_contract_only',
      endpoints: {
        billing_approval_readiness: 'GET /api/adapters/billing/approval/readiness',
        local_roadmap_proof: 'npm run proof:local-roadmap',
      },
      policy: {
        founder_billing_approval_required: true,
        founder_billing_approval_live: false,
        adapter_billing_enablement_live: false,
        approval_mutations_enabled: false,
      },
      claim_guards: {
        readiness_contract_live: true,
        founder_billing_approval_live: false,
        adapter_billing_enablement_live: false,
        approval_mutations_enabled: false,
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
        enables_adapter_billing: false,
      },
    });
  });

  test('keeps complete approval evidence disabled until approval enablement', () => {
    const evaluation = evaluateAdapterBillingApproval({
      evidence: buildEvidence(),
      approval: buildApproval(),
    });

    expect(evaluation).toMatchObject({
      object: 'adapter_billing_approval_evaluation',
      version: ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
      founder_billing_approval_live: false,
      approved: false,
      would_approve_if_enabled: true,
      denial_code_while_disabled: 'adapter_billing_approval_disabled',
      blockers: [],
      approval_packet: {
        approval_id: 'appr_adapter_billing_001',
        approved_by: 'founder:billing',
        evidence_packet_hash_sha256: 'd'.repeat(64),
      },
    });
  });

  test('blocks approval when evidence hash or founder approval is missing', () => {
    const missingHash = evaluateAdapterBillingApproval({
      evidence: buildEvidence({ evidence_packet_hash_sha256: 'not-a-sha' }),
      approval: buildApproval(),
    });
    expect(missingHash).toMatchObject({
      would_approve_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_approval_evidence_hash_required',
    });
    expect(missingHash.blockers).toContain('evidence_packet_hash');

    const missingFounder = evaluateAdapterBillingApproval({
      evidence: buildEvidence(),
      approval: buildApproval({ founder_billing_approval: false }),
    });
    expect(missingFounder).toMatchObject({
      would_approve_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_approval_founder_required',
    });
    expect(missingFounder.blockers).toContain('founder_billing_approval');
  });

  test('exposes adapter billing approval readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/billing/approval/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_billing_approval_readiness',
      version: ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
      current_mode: 'approval_policy_contract_only',
      policy: {
        founder_billing_approval_live: false,
        adapter_billing_enablement_live: false,
      },
      claim_guards: {
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
        enables_adapter_billing: false,
      },
    });
  });
});
