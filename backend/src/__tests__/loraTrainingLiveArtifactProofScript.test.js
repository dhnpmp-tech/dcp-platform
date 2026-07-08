'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  buildUrl,
  findReadinessBlockers,
  redactSecret,
  runLoraTrainingLiveArtifactProof,
} = require('../../tests/lora-training-live-artifact-proof');

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
    generated_at: '2026-07-09T03:48:00.000Z',
    current_mode: 'metadata_and_artifact_proof_only',
    dataset_validation: {
      status: 'available',
      available: true,
      raw_dataset_persistence: false,
      raw_dataset_not_embedded: true,
    },
    training_jobs: {
      status: 'metadata_only',
      api_available: true,
      public_training_enabled: false,
      worker_execution_enabled: false,
      gpu_host_proof_required: true,
      next: 'run_lora_training_worker_on_gpu_host_and_record_artifact_proof',
    },
    model_cards: {
      status: 'metadata_stub',
      api_available: true,
      manifest_version: 'dcp.lora_model_card_manifest.v1',
      model_card_artifact_writer_enabled: false,
      next: 'write_model_card_artifact_after_gpu_host_training_proof',
    },
    adapter_registry: {
      status: 'metadata_registry',
      api_available: true,
      serving_enabled: false,
      route_traffic: false,
      checksum_required: true,
    },
    adapter_deployments: {
      status: 'load_proof_required',
      api_available: true,
      serving_enabled: false,
      route_traffic: false,
      load_proof_required: true,
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

describe('LoRA training live artifact proof script', () => {
  test('refuses live artifact checks by default and writes artifacts', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lora-live-blocked-'));
    const fetchImpl = jest.fn();
    const ensurePrincipal = jest.fn();

    const { report, exitCode } = await runLoraTrainingLiveArtifactProof({
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
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      enables_public_training: false,
      proves_tinker_compatibility: false,
      creates_training_job_in_blocked_mode: false,
    });
    expect(report.training).toMatchObject({
      attempted_job_creation: false,
      attempted_gpu_execution: false,
      attempted_artifact_write: false,
      attempted_model_card_write: false,
      attempted_adapter_registration: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ensurePrincipal).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(outputDir, 'lora-training-live-artifact-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'lora-training-live-artifact-proof-latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'lora-training-live-artifact-proof-latest.log'))).toBe(true);
  });

  test('records blocked readiness without creating a training job when GPU proof is disabled', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lora-live-readiness-'));
    const fixtureCredential = ['fixture', 'lora', 'live', 'value'].join('-');
    const calls = [];
    const fetchImpl = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      return jsonResponse(readinessBody(), { requestId: 'req-lora-readiness' });
    });
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 9,
      renterEmail: 'lora-proof@example.test',
      balanceHalala: 10000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_lora_live',
      inferenceKeyLabel: 'lora-live-proof',
      inferenceKeyExpiresAt: '2026-07-09T04:30:00.000Z',
    }));

    const { report, exitCode } = await runLoraTrainingLiveArtifactProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test/api',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.principal).toMatchObject({
      renter_id: 9,
      key_hint: 'fixture-...alue',
    });
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(report.readiness).toMatchObject({
      current_mode: 'metadata_and_artifact_proof_only',
      dataset_validation: {
        available: true,
        raw_dataset_persistence: false,
      },
      training_jobs: {
        api_available: true,
        public_training_enabled: false,
        worker_execution_enabled: false,
        gpu_host_proof_required: true,
      },
      model_cards: {
        model_card_artifact_writer_enabled: false,
      },
      claim_guards: {
        quality_claims: false,
        tinker_compatible: false,
      },
    });
    expect(report.failure).toMatchObject({
      code: 'LORA_GPU_TRAINING_NOT_ENABLED',
      details: {
        blockers: expect.arrayContaining([
          'training_jobs.worker_execution_enabled',
          'training_jobs.gpu_host_proof_required',
          'model_cards.model_card_artifact_writer_enabled',
        ]),
      },
    });
    expect(report.training.attempted_job_creation).toBe(false);
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
    expect(redactSecret(['fixture', 'lora', 'live', 'value'].join('-'))).toBe('fixture-...alue');
    expect(findReadinessBlockers(readinessBody())).toEqual(expect.arrayContaining([
      'training_jobs.worker_execution_enabled',
      'training_jobs.gpu_host_proof_required',
      'model_cards.model_card_artifact_writer_enabled',
    ]));
  });
});
