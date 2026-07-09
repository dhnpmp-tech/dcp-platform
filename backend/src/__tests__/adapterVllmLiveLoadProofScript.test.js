'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  buildUrl,
  findReadinessBlockers,
  redactSecret,
  runAdapterVllmLiveLoadProof,
} = require('../../tests/adapter-vllm-live-load-proof');

function jsonResponse(body, { status = 200, requestId = 'req-test' } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });
}

function readinessBody(overrides = {}) {
  return {
    object: 'lora_readiness',
    version: 'dcp.lora_readiness.v1',
    generated_at: '2026-07-09T00:05:00.000Z',
    current_mode: 'metadata_and_artifact_proof_only',
    endpoints: {
      readiness: 'GET /api/lora/readiness',
      adapter_registry: 'GET/POST /api/adapters',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
    },
    adapter_registry: {
      status: 'metadata_registry',
      api_available: true,
      public_upload_enabled: true,
      serving_enabled: false,
      route_traffic: false,
      checksum_required: true,
      next: 'register_adapter_only_after_artifact_checksum_proof',
    },
    adapter_deployments: {
      status: 'load_proof_required',
      api_available: true,
      modes: ['serverless', 'dedicated'],
      serving_enabled: false,
      route_traffic: false,
      load_proof_required: true,
      next: 'attach_vllm_adapter_load_proof_before_any_routing',
    },
    claim_guards: {
      public_training_enabled: false,
      public_serving_enabled: false,
      route_traffic: false,
      quality_claims: false,
      tinker_compatible: false,
      discounts_enabled: false,
    },
    ...overrides,
  };
}

describe('adapter vLLM live load proof script', () => {
  test('refuses live adapter checks by default and writes artifacts', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-live-blocked-'));
    const fetchImpl = jest.fn();
    const ensurePrincipal = jest.fn();

    const { report, exitCode } = await runAdapterVllmLiveLoadProof({
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.contract).toBe(CONTRACT);
    expect(report.failure).toMatchObject({
      code: 'LIVE_PROOF_NOT_ENABLED',
      severity: 'blocking',
    });
    expect(report.claims).toMatchObject({
      verifies_real_vllm_load: false,
      routes_adapter_traffic: false,
      endpoint_smoke_passed: false,
      bills_adapter_inference: false,
      changes_routing_or_billing: false,
      creates_adapter_in_blocked_mode: false,
      creates_deployment_in_blocked_mode: false,
    });
    expect(report.adapter_flow).toMatchObject({
      attempted_adapter_create: false,
      attempted_deployment_create: false,
      attempted_internal_load_proof: false,
      attempted_endpoint_smoke: false,
      attempted_billing_probe: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ensurePrincipal).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(outputDir, 'adapter-vllm-live-load-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-vllm-live-load-proof-latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-vllm-live-load-proof-latest.log'))).toBe(true);
  });

  test('records blocked readiness without creating an adapter deployment when live load is disabled', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-live-readiness-'));
    const fixtureCredential = ['fixture', 'adapter', 'live', 'value'].join('-');
    const calls = [];
    const fetchImpl = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      return jsonResponse(readinessBody(), { requestId: 'req-adapter-readiness' });
    });
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 10,
      renterEmail: 'adapter-proof@example.test',
      balanceHalala: 10000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_adapter_live',
      inferenceKeyLabel: 'adapter-live-proof',
      inferenceKeyExpiresAt: '2026-07-09T05:00:00.000Z',
    }));

    const { report, exitCode } = await runAdapterVllmLiveLoadProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test/api',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.principal).toMatchObject({
      renter_id: 10,
      key_hint: 'fixture-...alue',
    });
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(report.readiness).toMatchObject({
      current_mode: 'metadata_and_artifact_proof_only',
      adapter_registry: {
        api_available: true,
        public_upload_enabled: true,
        serving_enabled: false,
        route_traffic: false,
        checksum_required: true,
      },
      adapter_deployments: {
        api_available: true,
        serving_enabled: false,
        route_traffic: false,
        load_proof_required: true,
      },
      claim_guards: {
        public_serving_enabled: false,
        route_traffic: false,
        quality_claims: false,
        tinker_compatible: false,
      },
    });
    expect(report.failure).toMatchObject({
      code: 'ADAPTER_VLLM_LOAD_NOT_ENABLED',
      details: {
        blockers: expect.arrayContaining([
          'adapter_registry.serving_enabled',
          'adapter_deployments.serving_enabled',
          'adapter_deployments.route_traffic',
          'adapter_deployments.load_proof_required',
          'claim_guards.public_serving_enabled',
        ]),
      },
    });
    expect(report.adapter_flow.attempted_adapter_create).toBe(false);
    expect(report.adapter_flow.attempted_deployment_create).toBe(false);
    expect(report.adapter_flow.attempted_internal_load_proof).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(ensurePrincipal).toHaveBeenCalledWith({ baseUrl: 'https://api.example.test/api' });
    expect(calls[0].url).toBe('https://api.example.test/api/lora/readiness');
    expect(calls[0].options.headers.authorization).toBe(`Bearer ${fixtureCredential}`);
    expect(calls[0].options.headers['x-renter-key']).toBe(fixtureCredential);
  });

  test('normalizes URLs, redacts key hints, and identifies missing live blockers', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/v1/chat/completions')).toBe('https://api.dcp.sa/v1/chat/completions');
    expect(buildUrl('https://api.dcp.sa/api', '/api/lora/readiness')).toBe('https://api.dcp.sa/api/lora/readiness');
    expect(redactSecret('short')).toBe('shor...');
    expect(redactSecret(['fixture', 'adapter', 'live', 'value'].join('-'))).toBe('fixture-...alue');
    expect(findReadinessBlockers(readinessBody())).toEqual(expect.arrayContaining([
      'adapter_registry.serving_enabled',
      'adapter_registry.route_traffic',
      'adapter_deployments.serving_enabled',
      'adapter_deployments.load_proof_required',
      'claim_guards.route_traffic',
    ]));
  });
});
