'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runLoraTrainingContractProof,
} = require('../../tests/lora-training-contract-proof');

describe('LoRA training contract proof script', () => {
  test('writes a CI-safe proof report for dataset, worker, artifact, and adapter gates', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lora-training-proof-'));
    const report = await runLoraTrainingContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      enables_public_training: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      proves_tinker_compatibility: false,
      bills_training: false,
    });
    expect(report.dataset.valid).toMatchObject({
      format: 'prompt_completion',
      row_count: 12,
      train_rows: 11,
      validation_rows: 1,
    });
    expect(report.dataset.valid.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.dataset.invalid_error).toMatchObject({
      code: 'missing_user_or_assistant',
    });
    expect(report.metadata_job.created).toMatchObject({
      training_job_id: 'lora_job_contract1',
      status: 'created',
      training_enabled: false,
      artifact_storage_key: null,
      model_card_manifest: null,
    });
    expect(report.metadata_job.replay).toMatchObject({
      idempotent_replay: true,
      training_job_id: 'lora_job_contract1',
    });
    expect(report.worker.disabled.job).toMatchObject({
      status: 'created',
      adapter_registered: false,
    });
    expect(report.worker.no_executor.result.note).toMatch(/no executor/i);
    expect(report.worker.success).toMatchObject({
      result: {
        succeeded: 1,
        jobs: [expect.objectContaining({
          training_job_id: 'lora_job_contract1',
          status: 'succeeded',
          adapter_registered: true,
          adapter_id: 'adpt_contract1',
        })],
      },
      job: {
        status: 'succeeded',
        artifact_storage_key: 'adapters/renter-1/adpt_contract1/adapter.safetensors',
        artifact_checksum_sha256: 'a'.repeat(64),
        model_card_storage_key: 'adapters/renter-1/adpt_contract1/model-card.json',
        adapter_registered: true,
        model_card_manifest: {
          status: 'metadata_stub',
          claims: {
            public_training_enabled: false,
            serving_enabled: false,
            route_traffic: false,
            tinker_compatible: false,
          },
        },
      },
    });
    expect(report.adapter).toMatchObject({
      adapter_id: 'adpt_contract1',
      status: 'ready',
      deployed_at: null,
      metadata: {
        safety: {
          serving_load_proof_required: true,
          route_traffic: false,
        },
      },
    });
    expect(report.artifact_failure).toMatchObject({
      result: {
        failed: 1,
      },
      job: {
        status: 'failed',
      },
    });
    expect(report.artifact_failure.job.failure_reason).toMatch(/artifact_checksum_sha256/);
    expect(report.invariants.map((item) => item.name)).toEqual([
      'dataset validation returns checksum and split facts without storing rows',
      'training job create is metadata-only and idempotent',
      'worker is disabled by default and enabled mode needs an executor',
      'artifact checksum proof is required before success and model-card manifest',
      'adapter registration remains non-serving after artifact proof',
      'missing artifact checksum fails the job instead of registering an adapter',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'lora-training-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'lora-training-contract-proof-latest.md'))).toBe(true);
  });
});
