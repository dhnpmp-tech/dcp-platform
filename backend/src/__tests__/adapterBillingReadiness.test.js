'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_BILLING_READINESS_VERSION,
  buildAdapterBillingReadiness,
  evaluateAdapterBillingPolicy,
} = require('../services/adapterBillingReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

function buildDeployment(overrides = {}) {
  return {
    deployment_id: 'adpl_bill001',
    renter_id: 42,
    adapter_id: 'adpt_bill001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_bill001',
      adapter_id: 'adpt_bill001',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'b'.repeat(64),
      provider_id: 'provider-bill-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_bill001',
    adapter_id: 'adpt_bill001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'b'.repeat(64),
    provider_id: 'provider-bill-1',
    request_id: 'req-adapter-bill-001',
    prompt_tokens: 120,
    completion_tokens: 30,
    cost_halala: 9,
    settlement_status: 'pending',
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

describe('adapter billing readiness policy', () => {
  test('builds a public billing readiness contract without enabling money or routing', () => {
    const readiness = buildAdapterBillingReadiness(new Date('2026-07-09T06:45:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_billing_readiness',
      version: ADAPTER_BILLING_READINESS_VERSION,
      current_mode: 'billing_policy_contract_only',
      endpoints: {
        billing_readiness: 'GET /api/adapters/billing/readiness',
        adapter_vllm_live_load_proof: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
      },
      policy: {
        readiness_available: true,
        adapter_inference_billing_enabled: false,
        bills_adapter_inference: false,
        billing_start_event: 'first_successful_endpoint_smoke_after_strict_load_proof',
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
        readiness_contract_live: true,
        adapter_billing_enabled: false,
        mutates_balance: false,
        dispatches_inference: false,
        attaches_load_proof: false,
        enables_adapter_serving: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        creates_invoice: false,
        settles_provider_payout: false,
      },
    });
  });

  test('keeps fully attributed adapter usage non-billable while billing is disabled', () => {
    const evaluation = evaluateAdapterBillingPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });

    expect(evaluation).toMatchObject({
      object: 'adapter_billing_policy_evaluation',
      version: ADAPTER_BILLING_READINESS_VERSION,
      billing_enabled: false,
      billable: false,
      would_bill_if_enabled: true,
      denial_code_while_disabled: 'adapter_billing_disabled',
      checks: {
        strict_load_proof_match: true,
        endpoint_smoke_passed: true,
        funded_smoke_principal: true,
        minimum_balance_policy_approved: true,
        usage_ledger_adapter_attribution: true,
        settlement_split_policy_approved: true,
        founder_billing_approval: true,
      },
      blockers: [],
      usage_attribution: {
        renter_id: 42,
        deployment_id: 'adpl_bill001',
        adapter_id: 'adpt_bill001',
        endpoint_id: 'arabic-support-prod',
        provider_id: 'provider-bill-1',
        request_id: 'req-adapter-bill-001',
        settlement_status: 'pending',
      },
    });
  });

  test('blocks adapter billing when load proof or usage attribution is incomplete', () => {
    const noLoadProof = evaluateAdapterBillingPolicy({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });
    expect(noLoadProof).toMatchObject({
      would_bill_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_load_proof_required',
    });
    expect(noLoadProof.blockers).toContain('strict_load_proof_match');

    const mismatchedUsage = evaluateAdapterBillingPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage({ adapter_id: 'adpt_wrong001' }),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });
    expect(mismatchedUsage).toMatchObject({
      would_bill_if_enabled: false,
      denial_code_while_disabled: 'adapter_billing_usage_attribution_required',
    });
    expect(mismatchedUsage.blockers).toContain('usage_ledger_adapter_attribution');
  });

  test('exposes adapter billing readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/billing/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_billing_readiness',
      version: ADAPTER_BILLING_READINESS_VERSION,
      current_mode: 'billing_policy_contract_only',
      policy: {
        adapter_inference_billing_enabled: false,
        bills_adapter_inference: false,
      },
      claim_guards: {
        mutates_balance: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        creates_invoice: false,
      },
    });
  });
});
