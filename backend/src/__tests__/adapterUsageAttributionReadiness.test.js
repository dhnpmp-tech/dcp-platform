'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
  buildAdapterUsageAttributionReadiness,
  evaluateAdapterUsageAttribution,
} = require('../services/adapterUsageAttributionReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

const RENTER_API_KEY_ID_FIELD = ['renter', 'api', 'key', 'id'].join('_');

function buildDeployment(overrides = {}) {
  return {
    deployment_id: 'adpl_usage001',
    renter_id: 42,
    adapter_id: 'adpt_usage001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_usage001',
      adapter_id: 'adpt_usage001',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'd'.repeat(64),
      provider_id: 'provider-usage-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_usage001',
    adapter_id: 'adpt_usage001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'd'.repeat(64),
    provider_id: 'provider-usage-1',
    request_id: 'req-adapter-usage-001',
    [RENTER_API_KEY_ID_FIELD]: 'scoped-key-usage-1',
    renter_key_type: 'scoped_key',
    prompt_tokens: 128,
    completion_tokens: 32,
    total_tokens: 160,
    cost_halala: 11,
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

describe('adapter usage attribution readiness', () => {
  test('builds a public contract without enabling adapter usage writes', () => {
    const readiness = buildAdapterUsageAttributionReadiness(new Date('2026-07-09T07:20:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_usage_attribution_readiness',
      version: ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
      generated_at: '2026-07-09T07:20:00.000Z',
      current_mode: 'usage_attribution_contract_only',
      endpoints: {
        usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
        usage_export: 'GET /api/renters/me/usage/export',
      },
      policy: {
        readiness_available: true,
        adapter_usage_attribution_enabled: false,
        adapter_usage_ledger_writes_enabled: false,
        adapter_billing_enabled: false,
      },
      claim_guards: {
        readiness_contract_live: true,
        adapter_usage_attribution_enabled: false,
        adapter_usage_ledger_writes_enabled: false,
        dispatches_inference: false,
        routes_adapter_traffic: false,
        mutates_balance: false,
        creates_invoice: false,
        settles_provider_payout: false,
        enables_adapter_billing: false,
      },
    });
    expect(readiness.policy.required_usage_fields).toEqual(expect.arrayContaining([
      'deployment_id',
      'adapter_id',
      'endpoint_id',
      'artifact_checksum_sha256',
      'provider_id',
      'request_id',
      'total_tokens',
      'cost_halala',
      'settlement_status',
    ]));
  });

  test('accepts a fully attributed adapter usage event only as would-record-if-enabled', () => {
    const evaluation = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });

    expect(evaluation).toMatchObject({
      object: 'adapter_usage_attribution_evaluation',
      version: ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
      attribution_enabled: false,
      usage_ledger_write_enabled: false,
      recorded: false,
      would_record_if_enabled: true,
      denial_code_while_disabled: 'adapter_usage_attribution_disabled',
      checks: {
        strict_load_proof_match: true,
        deployment_usage_match: true,
        endpoint_smoke_passed: true,
        funded_principal: true,
        provider_attribution: true,
        request_attribution: true,
        token_cost_fields: true,
        settlement_status_pending: true,
      },
      blockers: [],
      usage_attribution: {
        renter_id: 42,
        deployment_id: 'adpl_usage001',
        adapter_id: 'adpt_usage001',
        endpoint_id: 'arabic-support-prod',
        provider_id: 'provider-usage-1',
        request_id: 'req-adapter-usage-001',
        [RENTER_API_KEY_ID_FIELD]: 'scoped-key-usage-1',
        renter_key_type: 'scoped_key',
        total_tokens: 160,
        cost_halala: 11,
        settlement_status: 'pending',
      },
    });
  });

  test('rejects load proof and deployment attribution drift before usage writes', () => {
    const noLoadProof = evaluateAdapterUsageAttribution({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    expect(noLoadProof).toMatchObject({
      would_record_if_enabled: false,
      denial_code_while_disabled: 'adapter_usage_load_proof_required',
    });
    expect(noLoadProof.blockers).toContain('strict_load_proof_match');

    const mismatchedEndpoint = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ endpoint_id: 'wrong-endpoint' }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    expect(mismatchedEndpoint).toMatchObject({
      would_record_if_enabled: false,
      denial_code_while_disabled: 'adapter_usage_deployment_mismatch',
    });
    expect(mismatchedEndpoint.blockers).toContain('deployment_usage_match');
  });

  test('requires token, cost, provider, request, and pending settlement fields', () => {
    const missingProvider = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ provider_id: '' }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    expect(missingProvider.denial_code_while_disabled).toBe('adapter_usage_provider_required');

    const badTotals = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ total_tokens: 161 }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    expect(badTotals.denial_code_while_disabled).toBe('adapter_usage_token_cost_required');

    const settled = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ settlement_status: 'settled' }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    expect(settled.denial_code_while_disabled).toBe('adapter_usage_settlement_status_required');
  });

  test('exposes adapter usage attribution readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/usage/attribution/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_usage_attribution_readiness',
      version: ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
      current_mode: 'usage_attribution_contract_only',
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
  });
});
