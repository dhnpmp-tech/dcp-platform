'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  CONTRACT,
  buildUrl,
  findMissingBatchLiveAcceptanceEvidence,
  findReadinessBlockers,
  redactSecret,
  runBatchLiveExecutionProof,
} = require('../../tests/batch-live-execution-proof');

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
    readiness: {
      object: 'batch_inference_readiness',
      version: 'dcp.batch_inference_readiness.v1',
      current_mode: 'metadata_validation_only',
      public_execution_enabled: false,
      request_creation_enabled: true,
      supported_urls: ['/v1/chat/completions', '/v1/complete'],
      limits: {
        max_requests: 50000,
        max_bytes: 104857600,
        completion_windows: ['24h'],
      },
      features: {
        result_downloads: {
          status: 'not_configured',
          configured: false,
          enabled_for_completed_results: false,
        },
        worker_execution: {
          status: 'disabled',
          env_flag_enabled: false,
          public_enabled: false,
        },
        settlement: {
          status: 'disabled',
          env_flag_enabled: false,
          public_enabled: false,
        },
        discounts: {
          status: 'not_enabled',
          enabled: false,
        },
        model_capability_flag: {
          status: 'false_until_execution_and_settlement_proof',
          enabled: false,
        },
      },
      claims: {
        batch_execution_live: false,
        batch_discount_live: false,
        model_batch_capability_live: false,
        result_downloads_depend_on_completed_result_proof: true,
      },
      next: 'connect_worker_to_live_v1_executor_after_gpu_billing_and_result_smoke',
      ...overrides,
    },
  };
}

function liveReadyBody() {
  return readinessBody({
    current_mode: 'live_execution_discount_ready',
    public_execution_enabled: true,
    request_creation_enabled: true,
    features: {
      result_downloads: {
        status: 'configured_after_result_proof',
        configured: true,
        enabled_for_completed_results: true,
      },
      worker_execution: {
        status: 'public_executor_ready',
        env_flag_enabled: true,
        public_enabled: true,
      },
      settlement: {
        status: 'public_settlement_ready',
        env_flag_enabled: true,
        public_enabled: true,
      },
      discounts: {
        status: 'enabled',
        enabled: true,
      },
      model_capability_flag: {
        status: 'enabled_after_live_proof',
        enabled: true,
      },
    },
    claims: {
      batch_execution_live: true,
      batch_discount_live: true,
      model_batch_capability_live: true,
      result_downloads_depend_on_completed_result_proof: true,
    },
  });
}

describe('batch live execution proof script', () => {
  test('refuses live checks by default and writes artifacts', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-live-blocked-'));
    const fetchImpl = jest.fn();
    const ensurePrincipal = jest.fn();

    const { report, exitCode } = await runBatchLiveExecutionProof({
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.contract).toBe(CONTRACT);
    expect(report.acceptance_contract).toMatchObject({
      contract: BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
      gate: 'batch_live_execution_discount_smoke',
      command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
    });
    expect(report.acceptance_contract.required_evidence.map((item) => item.id)).toEqual([
      'readiness_live_claims_verified',
      'batch_create_verified',
      'batch_poll_completed',
      'result_manifest_verified',
      'result_download_verified',
      'line_execution_proof_verified',
      'discounted_settlement_proof_verified',
      'model_capability_flag_verified',
    ]);
    expect(report.failure).toMatchObject({
      code: 'LIVE_PROOF_NOT_ENABLED',
      severity: 'blocking',
    });
    expect(report.claims).toMatchObject({
      batch_execution_live: false,
      batch_discount_enabled: false,
      model_batch_capability_enabled: false,
      changes_billing_or_settlement: false,
      creates_batch_in_blocked_mode: false,
    });
    expect(report.batch).toMatchObject({
      attempted_creation: false,
      attempted_execution: false,
      attempted_download: false,
      attempted_settlement: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ensurePrincipal).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(outputDir, 'batch-live-execution-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'batch-live-execution-proof-latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'batch-live-execution-proof-latest.log'))).toBe(true);
  });

  test('records blocked readiness without creating a batch when live execution is disabled', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-live-readiness-'));
    const fixtureCredential = ['fixture', 'batch', 'live', 'value'].join('-');
    const calls = [];
    const fetchImpl = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      return jsonResponse(readinessBody(), { requestId: 'req-readiness' });
    });
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 8,
      renterEmail: 'batch-proof@example.test',
      balanceHalala: 10000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_batch_live',
      inferenceKeyLabel: 'batch-live-proof',
      inferenceKeyExpiresAt: '2026-07-09T04:00:00.000Z',
    }));

    const { report, exitCode } = await runBatchLiveExecutionProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test/api',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.principal).toMatchObject({
      renter_id: 8,
      key_hint: 'fixture-...alue',
    });
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(report.readiness).toMatchObject({
      current_mode: 'metadata_validation_only',
      request_creation_enabled: true,
      public_execution_enabled: false,
      features: {
        worker_execution: {
          public_enabled: false,
        },
        settlement: {
          public_enabled: false,
        },
        discounts: {
          enabled: false,
        },
      },
      claims: {
        batch_execution_live: false,
        batch_discount_live: false,
        model_batch_capability_live: false,
      },
    });
    expect(report.failure).toMatchObject({
      code: 'BATCH_EXECUTION_NOT_ENABLED',
      details: {
        blockers: expect.arrayContaining([
          'readiness.public_execution_enabled',
          'features.worker_execution.public_enabled',
          'features.discounts.enabled',
          'claims.batch_execution_live',
        ]),
      },
    });
    expect(report.batch.attempted_creation).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(ensurePrincipal).toHaveBeenCalledWith({ baseUrl: 'https://api.example.test/api' });
    expect(calls[0].url).toBe('https://api.example.test/api/batches/readiness');
    expect(calls[0].options.headers.authorization).toBe(`Bearer ${fixtureCredential}`);
    expect(calls[0].options.headers['x-renter-key']).toBe(fixtureCredential);
  });

  test('normalizes URLs, redacts key hints, and identifies missing live blockers', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/v1/chat/completions')).toBe('https://api.dcp.sa/v1/chat/completions');
    expect(buildUrl('https://api.dcp.sa/api', '/api/batches/readiness')).toBe('https://api.dcp.sa/api/batches/readiness');
    expect(redactSecret('short')).toBe('shor...');
    expect(redactSecret(['fixture', 'batch', 'live', 'value'].join('-'))).toBe('fixture-...alue');
    expect(findReadinessBlockers(readinessBody().readiness)).toEqual(expect.arrayContaining([
      'readiness.public_execution_enabled',
      'features.result_downloads.enabled_for_completed_results',
      'features.settlement.public_enabled',
      'claims.batch_discount_live',
    ]));
    expect(findMissingBatchLiveAcceptanceEvidence({
      readiness_live_claims_verified: true,
    })).toEqual([
      'batch_create_verified',
      'batch_poll_completed',
      'result_manifest_verified',
      'result_download_verified',
      'line_execution_proof_verified',
      'discounted_settlement_proof_verified',
      'model_capability_flag_verified',
    ]);
  });

  test('fails if readiness claims live batch execution before evidence exists', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-live-missing-evidence-'));
    const fixtureCredential = ['fixture', 'batch', 'live', 'ready'].join('-');
    const fetchImpl = jest.fn(async () => jsonResponse(liveReadyBody(), { requestId: 'req-live-ready' }));
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 9,
      renterEmail: 'batch-ready-proof@example.test',
      balanceHalala: 50000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_batch_ready',
      inferenceKeyLabel: 'batch-live-ready-proof',
      inferenceKeyExpiresAt: '2026-07-09T04:00:00.000Z',
    }));

    const { report, exitCode } = await runBatchLiveExecutionProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test',
    });

    expect(exitCode).toBe(1);
    expect(report.verdict).toBe('FAIL');
    expect(report.acceptance_evidence.readiness_live_claims_verified).toBe(true);
    expect(report.batch).toMatchObject({
      attempted_creation: false,
      attempted_execution: false,
      attempted_download: false,
      attempted_settlement: false,
    });
    expect(report.failure).toMatchObject({
      code: 'BATCH_LIVE_ACCEPTANCE_EVIDENCE_MISSING',
      details: {
        acceptance_contract: BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
        gate: 'batch_live_execution_discount_smoke',
        missing_evidence: expect.arrayContaining([
          'batch_create_verified',
          'batch_poll_completed',
          'result_download_verified',
          'discounted_settlement_proof_verified',
          'model_capability_flag_verified',
        ]),
      },
    });
    expect(report.failure.details.missing_evidence).not.toContain('readiness_live_claims_verified');
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
