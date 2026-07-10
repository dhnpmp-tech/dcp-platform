'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  CONTRACT,
  buildUrl,
  findMissingAdapterVllmLiveAcceptanceEvidence,
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

function liveReadyBody() {
  return readinessBody({
    current_mode: 'adapter_serving_live_claimed',
    adapter_registry: {
      status: 'serving_ready',
      api_available: true,
      public_upload_enabled: true,
      serving_enabled: true,
      route_traffic: true,
      checksum_required: true,
      next: 'run_live_acceptance_evidence',
    },
    adapter_deployments: {
      status: 'serving_ready',
      api_available: true,
      modes: ['single_adapter_live_merge', 'multi_lora'],
      serving_enabled: true,
      route_traffic: true,
      load_proof_required: false,
      next: 'run_endpoint_smoke_and_billing_evidence',
    },
    claim_guards: {
      public_training_enabled: false,
      public_serving_enabled: true,
      route_traffic: true,
      quality_claims: false,
      tinker_compatible: false,
      discounts_enabled: false,
    },
  });
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
    expect(report.acceptance_contract).toMatchObject({
      contract: ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION,
      gate: 'adapter_vllm_load_billing_smoke',
      command: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    });
    expect(report.acceptance_contract.required_evidence.map((item) => item.id)).toEqual([
      'readiness_serving_claims_verified',
      'funded_smoke_principal_verified',
      'adapter_artifact_checksum_verified',
      'deployment_intent_verified',
      'strict_vllm_load_proof_verified',
      'endpoint_smoke_verified',
      'usage_attribution_verified',
      'billing_policy_verified',
      'claim_boundary_verified',
    ]);
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
    expect(findMissingAdapterVllmLiveAcceptanceEvidence({
      readiness_serving_claims_verified: true,
      funded_smoke_principal_verified: true,
      claim_boundary_verified: true,
    })).toEqual([
      'adapter_artifact_checksum_verified',
      'deployment_intent_verified',
      'strict_vllm_load_proof_verified',
      'endpoint_smoke_verified',
      'usage_attribution_verified',
      'billing_policy_verified',
    ]);
  });

  test('fails if readiness claims adapter serving before live evidence exists', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-live-missing-evidence-'));
    const fixtureCredential = ['fixture', 'adapter', 'live', 'ready'].join('-');
    const fetchImpl = jest.fn(async () => jsonResponse(liveReadyBody(), { requestId: 'req-adapter-live-ready' }));
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 11,
      renterEmail: 'adapter-ready-proof@example.test',
      balanceHalala: 50000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_adapter_ready',
      inferenceKeyLabel: 'adapter-ready-proof',
      inferenceKeyExpiresAt: '2026-07-09T05:00:00.000Z',
    }));

    const { report, exitCode } = await runAdapterVllmLiveLoadProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test',
    });

    expect(exitCode).toBe(1);
    expect(report.verdict).toBe('FAIL');
    expect(report.acceptance_evidence).toMatchObject({
      readiness_serving_claims_verified: true,
      funded_smoke_principal_verified: true,
      claim_boundary_verified: true,
    });
    expect(report.adapter_flow).toMatchObject({
      attempted_adapter_create: false,
      attempted_deployment_create: false,
      attempted_internal_load_proof: false,
      attempted_endpoint_smoke: false,
      attempted_billing_probe: false,
    });
    expect(report.failure).toMatchObject({
      code: 'ADAPTER_VLLM_ACCEPTANCE_EVIDENCE_MISSING',
      details: {
        acceptance_contract: ADAPTER_VLLM_LIVE_ACCEPTANCE_CONTRACT_VERSION,
        gate: 'adapter_vllm_load_billing_smoke',
        missing_evidence: expect.arrayContaining([
          'adapter_artifact_checksum_verified',
          'strict_vllm_load_proof_verified',
          'endpoint_smoke_verified',
          'usage_attribution_verified',
          'billing_policy_verified',
        ]),
      },
    });
    expect(report.failure.details.missing_evidence).not.toContain('readiness_serving_claims_verified');
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
