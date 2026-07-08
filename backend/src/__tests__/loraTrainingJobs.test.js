'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createLoraTrainingJob,
  ensureLoraTrainingJobsSchema,
  getLoraTrainingJob,
  listLoraTrainingJobs,
  registerLoraTrainingJobAdapter,
  updateLoraTrainingJobStatus,
} = require('../services/loraTrainingJobs');
const { ensureAdapterRegistrySchema, getAdapter } = require('../services/adapterRegistry');
const { createLoraRouter } = require('../routes/lora');

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
    training_job_id: 'lora_job_alpha01',
    recipe: 'qlora-sft',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    dataset_storage_key: '/datasets/r1/support.jsonl',
    dataset_jsonl: datasetJsonl(),
    output_adapter_name: 'support-arabic',
    output_adapter_id: 'adpt_lorajob01',
    hyperparameters: {
      rank: 16,
      learning_rate: 0.0002,
    },
    ...overrides,
  };
}

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/lora', createLoraRouter({
    db,
    requireRenter: (req, _res, next) => {
      req.renter = { id: Number(req.header('x-test-renter-id') || 1) };
      next();
    },
  }));
  return app;
}

function wrapDb(raw) {
  return {
    run: (sql, ...params) => raw.prepare(sql).run(...params),
    get: (sql, ...params) => raw.prepare(sql).get(...params),
    all: (sql, ...params) => raw.prepare(sql).all(...params),
    prepare: (sql) => raw.prepare(sql),
    _db: raw,
  };
}

describe('LoRA training job foundation', () => {
  test('schema creation is idempotent and includes lifecycle columns', () => {
    const db = makeDb();
    expect(() => ensureLoraTrainingJobsSchema(db)).not.toThrow();

    const columns = db.prepare('PRAGMA table_info(lora_training_jobs)').all().map((row) => row.name);
    expect(columns).toEqual(expect.arrayContaining([
      'training_job_id',
      'renter_id',
      'recipe',
      'base_model',
      'dataset_storage_key',
      'dataset_checksum_sha256',
      'dataset_format',
      'dataset_row_count',
      'output_adapter_name',
      'output_adapter_id',
      'training_spec_json',
      'dataset_validation_json',
      'status',
      'artifact_storage_key',
      'artifact_checksum_sha256',
      'model_card_storage_key',
      'idempotency_key',
      'created_at',
      'updated_at',
    ]));
  });

  test('creates, lists, and reads a validated LoRA training job without enabling training', () => {
    const db = makeDb();
    const result = createLoraTrainingJob(db, 1, trainingInput(), {
      idempotencyKey: 'lora-idem-1',
    });

    expect(result.idempotent_replay).toBe(false);
    expect(result.job).toMatchObject({
      training_job_id: 'lora_job_alpha01',
      renter_id: 1,
      recipe: 'qlora_sft',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      dataset_storage_key: 'datasets/r1/support.jsonl',
      dataset_format: 'prompt_completion',
      dataset_row_count: 2,
      output_adapter_name: 'support-arabic',
      output_adapter_id: 'adpt_lorajob01',
      status: 'created',
      training_enabled: false,
      adapter_registered: false,
      idempotency_key: 'lora-idem-1',
    });
    expect(result.job.dataset_checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.job.training_spec.hyperparameters.rank).toBe(16);

    expect(getLoraTrainingJob(db, 1, 'lora_job_alpha01')).toMatchObject({ training_job_id: 'lora_job_alpha01' });
    expect(listLoraTrainingJobs(db, 1).jobs.map((job) => job.training_job_id)).toEqual(['lora_job_alpha01']);
  });

  test('idempotency key replays the existing job instead of inserting another row', () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput({ training_job_id: 'lora_job_first1' }), {
      idempotencyKey: 'lora-idem-repeat',
    });
    const replay = createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_second',
      output_adapter_id: 'adpt_lorajob02',
    }), {
      idempotencyKey: 'lora-idem-repeat',
    });

    expect(replay.idempotent_replay).toBe(true);
    expect(replay.job.training_job_id).toBe('lora_job_first1');
    expect(listLoraTrainingJobs(db, 1).jobs).toHaveLength(1);
  });

  test('keeps renter boundaries when listing and reading training jobs', () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput({ training_job_id: 'lora_job_owner1' }));
    createLoraTrainingJob(db, 2, trainingInput({
      training_job_id: 'lora_job_owner2',
      output_adapter_id: 'adpt_lorajob02',
    }));

    expect(listLoraTrainingJobs(db, 1).jobs.map((job) => job.training_job_id)).toEqual(['lora_job_owner1']);
    expect(getLoraTrainingJob(db, 1, 'lora_job_owner2')).toBeNull();
  });

  test('records artifact metadata only through an explicit status update', () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput());

    const succeeded = updateLoraTrainingJobStatus(db, 1, 'lora_job_alpha01', 'succeeded', {
      artifact_storage_key: 'adapters/r1/support/adapter.safetensors',
      artifact_checksum_sha256: 'a'.repeat(64),
      model_card_storage_key: 'adapters/r1/support/model-card.json',
    });

    expect(succeeded).toMatchObject({
      status: 'succeeded',
      artifact_storage_key: 'adapters/r1/support/adapter.safetensors',
      artifact_checksum_sha256: 'a'.repeat(64),
      model_card_storage_key: 'adapters/r1/support/model-card.json',
      adapter_registered: false,
    });
  });

  test('registers an adapter only after succeeded artifact proof exists', () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput());

    expect(() => registerLoraTrainingJobAdapter(db, 1, 'lora_job_alpha01')).toThrow(/must be succeeded/);

    updateLoraTrainingJobStatus(db, 1, 'lora_job_alpha01', 'succeeded', {
      artifact_storage_key: 'adapters/r1/support/adapter.safetensors',
      artifact_checksum_sha256: 'b'.repeat(64),
      model_card_storage_key: 'adapters/r1/support/model-card.json',
    });

    const registered = registerLoraTrainingJobAdapter(db, 1, 'lora_job_alpha01');
    expect(registered).toMatchObject({
      adapter_registered: true,
      idempotent_replay: false,
      serving_enabled: false,
      next: 'create_adapter_deployment_after_vllm_load_proof',
      job: {
        training_job_id: 'lora_job_alpha01',
        adapter_registered: true,
      },
      adapter: {
        adapter_id: 'adpt_lorajob01',
        status: 'ready',
        base_model: 'meta-llama/Llama-3.1-8B-Instruct',
        storage_key: 'adapters/r1/support/adapter.safetensors',
        checksum_sha256: 'b'.repeat(64),
        rank: 16,
        metadata: {
          source: 'lora_training_job',
          training_job_id: 'lora_job_alpha01',
          recipe: 'qlora_sft',
          safety: {
            route_traffic: false,
            serving_load_proof_required: true,
            trainer_artifact_required: true,
          },
        },
      },
    });
    expect(getLoraTrainingJob(db, 1, 'lora_job_alpha01').adapter_registered).toBe(true);
    expect(listLoraTrainingJobs(db, 1).jobs[0].adapter_registered).toBe(true);
    expect(getAdapter(db, 1, 'adpt_lorajob01')).toMatchObject({
      adapter_id: 'adpt_lorajob01',
      status: 'ready',
    });

    const replay = registerLoraTrainingJobAdapter(db, 1, 'lora_job_alpha01');
    expect(replay.idempotent_replay).toBe(true);
    expect(replay.adapter.adapter_id).toBe('adpt_lorajob01');
  });

  test('blocks adapter registration when succeeded job lacks artifact checksum proof', () => {
    const db = makeDb();
    createLoraTrainingJob(db, 1, trainingInput({ training_job_id: 'lora_job_noproof' }));
    updateLoraTrainingJobStatus(db, 1, 'lora_job_noproof', 'succeeded');

    expect(() => registerLoraTrainingJobAdapter(db, 1, 'lora_job_noproof')).toThrow(/missing adapter artifact proof/);
    expect(getLoraTrainingJob(db, 1, 'lora_job_noproof').adapter_registered).toBe(false);
  });

  test('rejects invalid dataset JSONL with contract details', () => {
    const db = makeDb();
    expect(() => createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_bad001',
      dataset_jsonl: '{"prompt":',
    }))).toThrow(/valid JSON/);
  });

  test('routes create, replay, list, read, and reject invalid dataset bodies', async () => {
    const db = makeDb();
    const app = buildApp(db);

    const created = await request(app)
      .post('/api/lora/training-jobs')
      .set('idempotency-key', 'route-lora-idem')
      .send(trainingInput({ training_job_id: 'lora_job_route1' }))
      .expect(201);
    expect(created.body.training_job).toMatchObject({
      training_job_id: 'lora_job_route1',
      status: 'created',
      training_enabled: false,
      adapter_registered: false,
    });
    expect(created.body.next).toBe('launch_lora_trainer_worker_after_gpu_host_proof');

    const replay = await request(app)
      .post('/api/lora/training-jobs')
      .set('idempotency-key', 'route-lora-idem')
      .send(trainingInput({
        training_job_id: 'lora_job_route2',
        output_adapter_id: 'adpt_lorajob03',
      }))
      .expect(200);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.training_job.training_job_id).toBe('lora_job_route1');

    const list = await request(app).get('/api/lora/training-jobs').expect(200);
    expect(list.body.data.map((job) => job.training_job_id)).toEqual(['lora_job_route1']);

    const detail = await request(app).get('/api/lora/training-jobs/lora_job_route1').expect(200);
    expect(detail.body.training_job.training_job_id).toBe('lora_job_route1');

    await request(app)
      .get('/api/lora/training-jobs/lora_job_route1')
      .set('x-test-renter-id', '2')
      .expect(404);

    const invalid = await request(app)
      .post('/api/lora/training-jobs')
      .send(trainingInput({
        training_job_id: 'lora_job_bad002',
        dataset_jsonl: '{"prompt":',
      }))
      .expect(400);
    expect(invalid.body).toMatchObject({
      code: 'invalid_json',
      details: { line: 1 },
    });
  });

  test('route registers a succeeded training job artifact into adapter registry idempotently', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createLoraTrainingJob(db, 1, trainingInput({ training_job_id: 'lora_job_route_register' }));

    const blocked = await request(app)
      .post('/api/lora/training-jobs/lora_job_route_register/register-adapter')
      .expect(409);
    expect(blocked.body.code).toBe('training_job_not_succeeded');

    updateLoraTrainingJobStatus(db, 1, 'lora_job_route_register', 'succeeded', {
      artifact_storage_key: 'adapters/r1/support/adapter.safetensors',
      artifact_checksum_sha256: 'c'.repeat(64),
      model_card_storage_key: 'adapters/r1/support/model-card.json',
    });

    const registered = await request(app)
      .post('/api/lora/training-jobs/lora_job_route_register/register-adapter')
      .expect(201);
    expect(registered.body).toMatchObject({
      adapter_registered: true,
      idempotent_replay: false,
      serving_enabled: false,
      adapter: {
        adapter_id: 'adpt_lorajob01',
        status: 'ready',
      },
      job: {
        training_job_id: 'lora_job_route_register',
        adapter_registered: true,
      },
    });

    const replay = await request(app)
      .post('/api/lora/training-jobs/lora_job_route_register/register-adapter')
      .expect(200);
    expect(replay.body).toMatchObject({
      adapter_registered: true,
      idempotent_replay: true,
      adapter: {
        adapter_id: 'adpt_lorajob01',
      },
    });

    const detail = await request(app).get('/api/lora/training-jobs/lora_job_route_register').expect(200);
    expect(detail.body.training_job.adapter_registered).toBe(true);
  });

  test('route factory accepts the production db wrapper shape', async () => {
    const db = makeDb();
    const app = buildApp(wrapDb(db));

    const res = await request(app)
      .post('/api/lora/training-jobs')
      .send(trainingInput({ training_job_id: 'lora_job_wrap01' }))
      .expect(201);

    expect(res.body.training_job).toMatchObject({
      training_job_id: 'lora_job_wrap01',
      training_enabled: false,
    });
  });
});
