'use strict';

const Database = require('better-sqlite3');
const {
  createLoraTrainingJob,
  ensureLoraTrainingJobsSchema,
  getLoraTrainingJob,
} = require('../services/loraTrainingJobs');
const { ensureAdapterRegistrySchema, getAdapter } = require('../services/adapterRegistry');
const {
  buildLoraArtifactStorageKey,
  buildLoraModelCardStorageKey,
  runLoraTrainingWorkerOnce,
} = require('../workers/loraTrainingWorker');

function makeDb() {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  raw.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, created_at)
    VALUES (1, 'Renter One', 'one@example.com', 'rk-one', 'active', ?),
           (2, 'Renter Two', 'two@example.com', 'rk-two', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureAdapterRegistrySchema(raw);
  ensureLoraTrainingJobsSchema(raw);
  return raw;
}

function datasetJsonl() {
  return [
    { prompt: 'Translate hello', completion: 'marhaba' },
    { prompt: 'Translate thanks', completion: 'shukran' },
  ].map((row) => JSON.stringify(row)).join('\n');
}

function trainingInput(overrides = {}) {
  return {
    training_job_id: 'lora_job_worker01',
    recipe: 'qlora-sft',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    dataset_storage_key: '/datasets/r1/support.jsonl',
    dataset_jsonl: datasetJsonl(),
    output_adapter_name: 'support-arabic',
    output_adapter_id: 'adpt_worker001',
    hyperparameters: {
      rank: 16,
      learning_rate: 0.0002,
    },
    ...overrides,
  };
}

describe('LoRA training worker scaffold', () => {
  test('stays disabled by default and does not mutate created jobs', async () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput());

    const result = await runLoraTrainingWorkerOnce(db);
    expect(result).toMatchObject({
      enabled: false,
      scanned: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(getLoraTrainingJob(db, 1, 'lora_job_worker01')).toMatchObject({
      status: 'created',
      artifact_storage_key: null,
      adapter_registered: false,
    });
  });

  test('does not mutate jobs when enabled without an executor', async () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput());

    const result = await runLoraTrainingWorkerOnce(db, { enabled: true });
    expect(result.note).toMatch(/no executor/);
    expect(getLoraTrainingJob(db, 1, 'lora_job_worker01').status).toBe('created');
  });

  test('completes created jobs with injected artifact proof without auto-registering by default', async () => {
    const db = makeDb();
    const created = createLoraTrainingJob(db, 2, trainingInput({
      training_job_id: 'lora_job_execute1',
      output_adapter_id: 'adpt_worker002',
      dataset_storage_key: '/datasets/r2/support.jsonl',
    })).job;

    expect(buildLoraArtifactStorageKey(created)).toBe('adapters/renter-2/adpt_worker002/adapter.safetensors');
    expect(buildLoraModelCardStorageKey(created)).toBe('adapters/renter-2/adpt_worker002/model-card.json');

    const result = await runLoraTrainingWorkerOnce(db, {
      enabled: true,
      limit: 10,
      executor: async (job) => ({
        artifact_storage_key: buildLoraArtifactStorageKey(job),
        artifact_checksum_sha256: 'd'.repeat(64),
        model_card_storage_key: buildLoraModelCardStorageKey(job),
      }),
    });

    expect(result).toMatchObject({
      enabled: true,
      scanned: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      jobs: [{
        training_job_id: 'lora_job_execute1',
        status: 'succeeded',
        artifact_storage_key: 'adapters/renter-2/adpt_worker002/adapter.safetensors',
        artifact_checksum_sha256: 'd'.repeat(64),
        adapter_registered: false,
        adapter_id: null,
      }],
    });
    expect(getLoraTrainingJob(db, 2, 'lora_job_execute1')).toMatchObject({
      status: 'succeeded',
      artifact_storage_key: 'adapters/renter-2/adpt_worker002/adapter.safetensors',
      artifact_checksum_sha256: 'd'.repeat(64),
      model_card_storage_key: 'adapters/renter-2/adpt_worker002/model-card.json',
      adapter_registered: false,
    });
  });

  test('can explicitly auto-register an adapter after artifact proof succeeds', async () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_register1',
      output_adapter_id: 'adpt_worker003',
    }));

    const result = await runLoraTrainingWorkerOnce(db, {
      enabled: true,
      autoRegisterAdapter: true,
      executor: async () => ({
        artifact_checksum_sha256: 'e'.repeat(64),
      }),
    });

    expect(result.jobs[0]).toMatchObject({
      training_job_id: 'lora_job_register1',
      status: 'succeeded',
      adapter_registered: true,
      adapter_id: 'adpt_worker003',
    });
    expect(getLoraTrainingJob(db, 1, 'lora_job_register1').adapter_registered).toBe(true);
    expect(getAdapter(db, 1, 'adpt_worker003')).toMatchObject({
      adapter_id: 'adpt_worker003',
      status: 'ready',
    });
  });

  test('marks a job failed when executor or artifact proof fails', async () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_fail001',
      output_adapter_id: 'adpt_worker004',
    }));

    const result = await runLoraTrainingWorkerOnce(db, {
      enabled: true,
      executor: async () => {
        throw new Error('trainer unavailable');
      },
    });

    expect(result.failed).toBe(1);
    expect(result.jobs[0]).toMatchObject({
      training_job_id: 'lora_job_fail001',
      status: 'failed',
      error: 'trainer unavailable',
    });
    expect(getLoraTrainingJob(db, 1, 'lora_job_fail001')).toMatchObject({
      status: 'failed',
      failure_reason: 'trainer unavailable',
    });
  });
});
