'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
  buildAdapterEndpointSmokeReadiness,
  evaluateAdapterEndpointSmoke,
} = require('../services/adapterEndpointSmokeReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

function buildDeployment(overrides = {}) {
  return {
    deployment_id: 'adpl_smoke001',
    renter_id: 42,
    adapter_id: 'adpt_smoke001',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_smoke001',
      adapter_id: 'adpt_smoke001',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
      provider_id: 'provider-smoke-1',
    },
    ...overrides,
  };
}

function buildSmoke(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_smoke001',
    adapter_id: 'adpt_smoke001',
    endpoint_id: 'arabic-support-prod',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    artifact_checksum_sha256: 'e'.repeat(64),
    provider_id: 'provider-smoke-1',
    request_id: 'req-adapter-smoke-001',
    status_code: 200,
    latency_ms: 842,
    response_checksum_sha256: 'f'.repeat(64),
    prompt_tokens: 24,
    completion_tokens: 12,
    total_tokens: 36,
    finish_reason: 'stop',
    adapter_trace: {
      routed_through_adapter: true,
      deployment_id: 'adpl_smoke001',
      adapter_id: 'adpt_smoke001',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
    },
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

describe('adapter endpoint smoke readiness', () => {
  test('builds a public contract without enabling smoke recording or traffic', () => {
    const readiness = buildAdapterEndpointSmokeReadiness(new Date('2026-07-09T07:45:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_endpoint_smoke_readiness',
      version: ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
      generated_at: '2026-07-09T07:45:00.000Z',
      current_mode: 'endpoint_smoke_contract_only',
      endpoints: {
        endpoint_smoke_readiness: 'GET /api/adapters/endpoints/smoke/readiness',
        usage_attribution_readiness: 'GET /api/adapters/usage/attribution/readiness',
        adapter_billing_readiness: 'GET /api/adapters/billing/readiness',
      },
      policy: {
        readiness_available: true,
        endpoint_smoke_recording_enabled: false,
        adapter_endpoint_routing_enabled: false,
        adapter_billing_enabled: false,
        raw_prompt_storage_enabled: false,
        raw_response_storage_enabled: false,
      },
      claim_guards: {
        readiness_contract_live: true,
        endpoint_smoke_recording_enabled: false,
        dispatches_inference: false,
        records_smoke_result: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        mutates_balance: false,
        enables_adapter_billing: false,
      },
    });
    expect(readiness.policy.required_smoke_fields).toEqual(expect.arrayContaining([
      'deployment_id',
      'adapter_id',
      'endpoint_id',
      'artifact_checksum_sha256',
      'provider_id',
      'request_id',
      'response_checksum_sha256',
      'latency_ms',
      'adapter_trace',
    ]));
  });

  test('accepts a complete endpoint smoke only as would-pass-if-enabled', () => {
    const evaluation = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke(),
      funded_smoke_principal: true,
    });

    expect(evaluation).toMatchObject({
      object: 'adapter_endpoint_smoke_evaluation',
      version: ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
      endpoint_smoke_recording_enabled: false,
      passed: false,
      would_pass_if_enabled: true,
      denial_code_while_disabled: 'adapter_endpoint_smoke_disabled',
      checks: {
        strict_load_proof_match: true,
        funded_smoke_principal: true,
        smoke_request_attribution: true,
        smoke_response_hash: true,
        smoke_latency_budget: true,
        smoke_usage_tokens: true,
        adapter_trace_match: true,
      },
      blockers: [],
      smoke_attribution: {
        renter_id: 42,
        deployment_id: 'adpl_smoke001',
        adapter_id: 'adpt_smoke001',
        endpoint_id: 'arabic-support-prod',
        provider_id: 'provider-smoke-1',
        request_id: 'req-adapter-smoke-001',
        status_code: 200,
        latency_ms: 842,
        total_tokens: 36,
        finish_reason: 'stop',
      },
    });
  });

  test('blocks missing load proof request drift and bad response evidence', () => {
    const noLoadProof = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      smoke_result: buildSmoke(),
      funded_smoke_principal: true,
    });
    expect(noLoadProof).toMatchObject({
      would_pass_if_enabled: false,
      denial_code_while_disabled: 'adapter_endpoint_smoke_load_proof_required',
    });

    const endpointDrift = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ endpoint_id: 'wrong-endpoint' }),
      funded_smoke_principal: true,
    });
    expect(endpointDrift.denial_code_while_disabled).toBe('adapter_endpoint_smoke_request_required');

    const badResponse = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ status_code: 500 }),
      funded_smoke_principal: true,
    });
    expect(badResponse.denial_code_while_disabled).toBe('adapter_endpoint_smoke_response_required');
  });

  test('requires coherent latency usage and adapter trace fields', () => {
    const slowSmoke = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ latency_ms: 60001 }),
      funded_smoke_principal: true,
    });
    expect(slowSmoke.denial_code_while_disabled).toBe('adapter_endpoint_smoke_latency_required');

    const badUsage = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ total_tokens: 35 }),
      funded_smoke_principal: true,
    });
    expect(badUsage.denial_code_while_disabled).toBe('adapter_endpoint_smoke_usage_required');

    const badTrace = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({
        adapter_trace: {
          routed_through_adapter: false,
          deployment_id: 'adpl_smoke001',
          adapter_id: 'adpt_smoke001',
          endpoint_id: 'arabic-support-prod',
          artifact_checksum_sha256: 'e'.repeat(64),
        },
      }),
      funded_smoke_principal: true,
    });
    expect(badTrace.denial_code_while_disabled).toBe('adapter_endpoint_smoke_adapter_trace_required');
  });

  test('exposes adapter endpoint smoke readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/endpoints/smoke/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_endpoint_smoke_readiness',
      version: ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
      current_mode: 'endpoint_smoke_contract_only',
      policy: {
        endpoint_smoke_recording_enabled: false,
        adapter_endpoint_routing_enabled: false,
        adapter_billing_enabled: false,
      },
      claim_guards: {
        dispatches_inference: false,
        records_smoke_result: false,
        routes_adapter_traffic: false,
        enables_adapter_billing: false,
      },
    });
  });
});
