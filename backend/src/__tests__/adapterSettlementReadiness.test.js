'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_SETTLEMENT_READINESS_VERSION,
  buildAdapterSettlementReadiness,
  evaluateAdapterSettlementPolicy,
} = require('../services/adapterSettlementReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

function buildDeployment(overrides = {}) {
  return {
    deployment_id: 'adpl_settle001',
    renter_id: 42,
    adapter_id: 'adpt_settle001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_settle001',
      adapter_id: 'adpt_settle001',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
      provider_id: 'provider-settle-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_settle001',
    adapter_id: 'adpt_settle001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'c'.repeat(64),
    provider_id: 'provider-settle-1',
    request_id: 'req-adapter-settle-001',
    renter_api_key_id: 'scoped-key-settle-1',
    renter_key_type: 'scoped_key',
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
    cost_halala: 10,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildQuote(overrides = {}) {
  return {
    provider_share_halala: 7,
    platform_share_halala: 3,
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

describe('adapter settlement readiness policy', () => {
  test('builds a public settlement readiness contract without enabling payouts', () => {
    const readiness = buildAdapterSettlementReadiness(new Date('2026-07-09T08:55:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_settlement_readiness',
      version: ADAPTER_SETTLEMENT_READINESS_VERSION,
      generated_at: '2026-07-09T08:55:00.000Z',
      current_mode: 'settlement_policy_contract_only',
      endpoints: {
        settlement_readiness: 'GET /api/adapters/settlement/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      },
      policy: {
        readiness_available: true,
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
        readiness_contract_live: true,
        adapter_settlement_enabled: false,
        provider_payouts_enabled: false,
        platform_revenue_split_enabled: false,
        records_usage_event: false,
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
      },
    });
  });

  test('keeps attributed adapter settlement disabled until policy enablement', () => {
    const evaluation = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });

    expect(evaluation).toMatchObject({
      object: 'adapter_settlement_policy_evaluation',
      version: ADAPTER_SETTLEMENT_READINESS_VERSION,
      settlement_enabled: false,
      settled: false,
      would_settle_if_enabled: true,
      denial_code_while_disabled: 'adapter_settlement_disabled',
      checks: {
        strict_load_proof_match: true,
        endpoint_smoke_passed: true,
        usage_ledger_adapter_attribution: true,
        minimum_balance_policy_approved: true,
        settlement_split_policy_approved: true,
        founder_settlement_approval: true,
        settlement_split_matches_cost: true,
      },
      blockers: [],
      settlement_attribution: {
        renter_id: 42,
        deployment_id: 'adpl_settle001',
        adapter_id: 'adpt_settle001',
        endpoint_id: 'arabic-support-prod',
        provider_id: 'provider-settle-1',
        request_id: 'req-adapter-settle-001',
        renter_api_key_id: 'scoped-key-settle-1',
        provider_share_halala: 7,
        platform_share_halala: 3,
        settlement_status: 'pending',
      },
    });
  });

  test('blocks settlement when split math or usage attribution is incomplete', () => {
    const splitMismatch = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote({ provider_share_halala: 8, platform_share_halala: 3 }),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });
    expect(splitMismatch).toMatchObject({
      would_settle_if_enabled: false,
      denial_code_while_disabled: 'adapter_settlement_split_mismatch',
    });
    expect(splitMismatch.blockers).toContain('settlement_split_matches_cost');

    const usageMismatch = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage({ artifact_checksum_sha256: 'd'.repeat(64) }),
      settlement_quote: buildQuote(),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });
    expect(usageMismatch).toMatchObject({
      would_settle_if_enabled: false,
      denial_code_while_disabled: 'adapter_settlement_usage_attribution_required',
    });
    expect(usageMismatch.blockers).toContain('usage_ledger_adapter_attribution');
  });

  test('exposes adapter settlement readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/settlement/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_settlement_readiness',
      version: ADAPTER_SETTLEMENT_READINESS_VERSION,
      current_mode: 'settlement_policy_contract_only',
      policy: {
        adapter_settlement_enabled: false,
        provider_payouts_enabled: false,
        settlement_mutations_enabled: false,
      },
      claim_guards: {
        records_usage_event: false,
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
      },
    });
  });
});
