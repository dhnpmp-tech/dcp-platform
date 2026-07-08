'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createBatchInferenceJob,
  ensureBatchInferenceJobSchema,
  getBatchInferenceJob,
  getBatchInferenceJobLine,
  getBatchInferenceResultManifest,
  listBatchInferenceJobLines,
  listBatchInferenceJobs,
  updateBatchInferenceJobLineSettlement,
  updateBatchInferenceJobLineStatus,
  updateBatchInferenceJobStatus,
} = require('../services/batchInferenceJobs');
const { createBatchesRouter } = require('../routes/batches');

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
  ensureBatchInferenceJobSchema(raw);
  return raw;
}

function jsonl(lines = []) {
  const defaults = [
    {
      custom_id: 'chat-1',
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: 'qwen/qwen3-coder',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      custom_id: 'complete-1',
      method: 'POST',
      url: '/v1/complete',
      body: {
        model: 'mistral',
        prompt: 'hello',
      },
    },
  ];
  return (lines.length ? lines : defaults).map((line) => JSON.stringify(line)).join('\n');
}

function buildApp(db, extraDeps = {}) {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/batches', createBatchesRouter({
    db,
    ...extraDeps,
    requireRenter: (req, res, next) => {
      const renterId = Number(req.header('x-test-renter-id') || 1);
      if (renterId === 0) {
        return res.status(401).json({ error: 'Renter API key required' });
      }
      req.renter = { id: renterId };
      return next();
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

describe('batch inference job foundation', () => {
  test('schema creation is idempotent and includes lifecycle columns', () => {
    const db = makeDb();
    expect(() => ensureBatchInferenceJobSchema(db)).not.toThrow();

    const columns = db.prepare('PRAGMA table_info(batch_inference_jobs)').all().map((row) => row.name);
    expect(columns).toEqual(expect.arrayContaining([
      'batch_id',
      'renter_id',
      'input_storage_key',
      'input_checksum_sha256',
      'input_normalized_bytes',
      'request_count',
      'completion_window',
      'result_storage_key',
      'status',
      'completed_count',
      'failed_count',
      'total_cost_halala',
      'idempotency_key',
      'created_at',
      'updated_at',
      'expires_at',
      'result_checksum_sha256',
      'result_normalized_bytes',
    ]));
    const lineColumns = db.prepare('PRAGMA table_info(batch_inference_job_lines)').all().map((row) => row.name);
    expect(lineColumns).toEqual(expect.arrayContaining([
      'batch_id',
      'renter_id',
      'line_index',
      'custom_id',
      'method',
      'url',
      'model_id',
      'request_checksum_sha256',
      'status',
      'status_code',
      'response_checksum_sha256',
      'provider_id',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost_halala',
      'request_id',
      'provider_response_id',
      'settlement_status',
      'settlement_request_id',
      'settlement_error_code',
      'settlement_error_message',
      'settled_at',
    ]));
  });

  test('creates, lists, and reads a validated batch record and line ledger without enabling execution', () => {
    const db = makeDb();
    const result = createBatchInferenceJob(db, 1, {
      batch_id: 'batch_alpha001',
      input_jsonl: jsonl(),
      completion_window: '24h',
      metadata: { purpose: 'nightly-eval' },
    }, {
      idempotencyKey: 'batch-key-1',
    });

    expect(result.idempotent_replay).toBe(false);
    expect(result.batch).toMatchObject({
      batch_id: 'batch_alpha001',
      renter_id: 1,
      status: 'created',
      request_count: 2,
      completion_window: '24h',
      metadata: { purpose: 'nightly-eval' },
      execution_enabled: false,
      results_available: false,
      idempotency_key: 'batch-key-1',
      result_checksum_sha256: null,
      result_normalized_bytes: 0,
    });
    expect(result.batch.input_checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.batch.input_storage_key).toBe('batch-inputs/renter-1/batch_alpha001/input.jsonl');

    const lines = listBatchInferenceJobLines(db, 1, 'batch_alpha001');
    expect(lines).toMatchObject({
      batch: { batch_id: 'batch_alpha001' },
      limit: 50,
      offset: 0,
    });
    expect(lines.lines).toHaveLength(2);
    expect(lines.lines[0]).toMatchObject({
      batch_id: 'batch_alpha001',
      renter_id: 1,
      line_index: 1,
      custom_id: 'chat-1',
      method: 'POST',
      url: '/v1/chat/completions',
      model_id: 'qwen/qwen3-coder',
      status: 'pending',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      cost_halala: 0,
    });
    expect(lines.lines[0].request_checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(lines.lines[0]).not.toHaveProperty('body');

    expect(getBatchInferenceJob(db, 1, 'batch_alpha001')).toMatchObject({ batch_id: 'batch_alpha001' });
    expect(listBatchInferenceJobs(db, 1).batches.map((batch) => batch.batch_id)).toEqual(['batch_alpha001']);
    expect(getBatchInferenceResultManifest(db, 1, 'batch_alpha001')).toMatchObject({
      batch_id: 'batch_alpha001',
      results_available: false,
      download_enabled: false,
      next: 'wait_for_completed_batch_result_key_and_checksum',
    });
  });

  test('requires result checksum proof before marking a completed batch available', () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_result01',
      input_jsonl: jsonl(),
    });

    expect(() => updateBatchInferenceJobStatus(db, 1, 'batch_result01', 'completed', {
      result_storage_key: 'batch-results/renter-1/batch_result01/output.jsonl',
      completed_count: 2,
    })).toThrow(/SHA-256 proof/);

    const completed = updateBatchInferenceJobStatus(db, 1, 'batch_result01', 'completed', {
      result_storage_key: 'batch-results/renter-1/batch_result01/output.jsonl',
      result_checksum_sha256: 'b'.repeat(64),
      result_normalized_bytes: 2048,
      completed_count: 2,
      failed_count: 0,
      total_cost_halala: 18,
    });
    expect(completed).toMatchObject({
      status: 'completed',
      results_available: true,
      result_storage_key: 'batch-results/renter-1/batch_result01/output.jsonl',
      result_checksum_sha256: 'b'.repeat(64),
      result_normalized_bytes: 2048,
    });
    expect(getBatchInferenceResultManifest(db, 1, 'batch_result01')).toMatchObject({
      batch_id: 'batch_result01',
      results_available: true,
      result_checksum_sha256: 'b'.repeat(64),
      result_normalized_bytes: 2048,
      download_enabled: false,
      next: 'sign_result_download_url_after_object_store_bridge',
    });
  });

  test('results route attaches a scoped signed download when signer is configured', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_signed01',
      input_jsonl: jsonl(),
    });
    updateBatchInferenceJobStatus(db, 1, 'batch_signed01', 'completed', {
      result_storage_key: 'batch-results/renter-1/batch_signed01/output.jsonl',
      result_checksum_sha256: 'd'.repeat(64),
      result_normalized_bytes: 4096,
      completed_count: 2,
      failed_count: 0,
      total_cost_halala: 11,
    });

    const signerCalls = [];
    const app = buildApp(db, {
      resultDownloadSigner: async (manifest) => {
        signerCalls.push(manifest);
        return {
          download_enabled: true,
          download_url: 'https://objects.example.test/dcp-batch-results/batch-results/renter-1/batch_signed01/output.jsonl?sig=test',
          download_method: 'GET',
          download_expires_in: 900,
          download_expires_at: '2026-07-08T09:45:00.000Z',
          download_configured: true,
          next: 'download_batch_result_jsonl',
        };
      },
    });

    const res = await request(app)
      .get('/api/batches/batch_signed01/results')
      .expect(200);

    expect(signerCalls).toHaveLength(1);
    expect(signerCalls[0]).toMatchObject({
      batch_id: 'batch_signed01',
      renter_id: 1,
      results_available: true,
      result_checksum_sha256: 'd'.repeat(64),
    });
    expect(res.body.result).toMatchObject({
      batch_id: 'batch_signed01',
      results_available: true,
      result_checksum_sha256: 'd'.repeat(64),
      download_enabled: true,
      download_method: 'GET',
      download_expires_in: 900,
      download_expires_at: '2026-07-08T09:45:00.000Z',
      next: 'download_batch_result_jsonl',
    });
    expect(res.body.result.download_url).toContain('sig=test');
  });

  test('idempotency key replays the existing batch instead of inserting another row', () => {
    const db = makeDb();
    const first = createBatchInferenceJob(db, 1, {
      batch_id: 'batch_first001',
      input_jsonl: jsonl(),
    }, {
      idempotencyKey: 'idem-1',
    });
    const second = createBatchInferenceJob(db, 1, {
      batch_id: 'batch_second01',
      input_jsonl: jsonl([{
        custom_id: 'different',
        method: 'POST',
        url: '/v1/complete',
        body: { model: 'mistral', prompt: 'different' },
      }]),
    }, {
      idempotencyKey: 'idem-1',
    });

    expect(first.batch.batch_id).toBe('batch_first001');
    expect(second.idempotent_replay).toBe(true);
    expect(second.batch.batch_id).toBe('batch_first001');
    expect(listBatchInferenceJobs(db, 1).batches).toHaveLength(1);
  });

  test('keeps renter boundaries when listing and reading batches', () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, { batch_id: 'batch_renter01', input_jsonl: jsonl() });
    createBatchInferenceJob(db, 2, { batch_id: 'batch_renter02', input_jsonl: jsonl() });

    expect(listBatchInferenceJobs(db, 1).batches.map((batch) => batch.batch_id)).toEqual(['batch_renter01']);
    expect(getBatchInferenceJob(db, 1, 'batch_renter02')).toBeNull();
    expect(listBatchInferenceJobLines(db, 1, 'batch_renter02')).toBeNull();
  });

  test('updates one batch line with usage and cost metadata for future settlement proof', () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_lines001',
      input_jsonl: jsonl(),
    });

    const updated = updateBatchInferenceJobLineStatus(db, 1, 'batch_lines001', 'chat-1', 'succeeded', {
      status_code: 200,
      response_checksum_sha256: 'e'.repeat(64),
      response_normalized_bytes: 512,
      usage: {
        prompt_tokens: 20,
        completion_tokens: 7,
      },
      cost_halala: 3,
      provider_id: null,
      settlement_status: 'unsettled',
      settlement_request_id: null,
      request_id: 'batch_lines001:chat-1',
      provider_response_id: 'resp-123',
    });

    expect(updated).toMatchObject({
      custom_id: 'chat-1',
      status: 'succeeded',
      status_code: 200,
      response_checksum_sha256: 'e'.repeat(64),
      response_normalized_bytes: 512,
      usage: {
        prompt_tokens: 20,
        completion_tokens: 7,
        total_tokens: 27,
      },
      cost_halala: 3,
      request_id: 'batch_lines001:chat-1',
      provider_response_id: 'resp-123',
    });
    expect(updated.completed_at).toMatch(/T/);
    expect(getBatchInferenceJobLine(db, 1, 'batch_lines001', 'chat-1')).toMatchObject({
      status: 'succeeded',
      cost_halala: 3,
    });
  });

  test('updates one batch line settlement receipt without touching request proof', () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_settle1',
      input_jsonl: jsonl(),
    });
    updateBatchInferenceJobLineStatus(db, 1, 'batch_settle1', 'chat-1', 'succeeded', {
      status_code: 200,
      response_checksum_sha256: 'e'.repeat(64),
      provider_id: 7,
      usage: { prompt_tokens: 20, completion_tokens: 7 },
      cost_halala: 3,
      request_id: 'batch_settle1:chat-1',
    });

    const settled = updateBatchInferenceJobLineSettlement(db, 1, 'batch_settle1', 'chat-1', 'settled', {
      settlement_request_id: 'batch-line:batch_settle1:chat-1',
      provider_id: 7,
    });

    expect(settled).toMatchObject({
      custom_id: 'chat-1',
      status: 'succeeded',
      provider_id: 7,
      cost_halala: 3,
      request_id: 'batch_settle1:chat-1',
      settlement_status: 'settled',
      settlement_request_id: 'batch-line:batch_settle1:chat-1',
      settlement_error_code: null,
      settlement_error_message: null,
    });
    expect(settled.settled_at).toMatch(/T/);
  });

  test('rejects invalid JSONL with stable contract details', () => {
    const db = makeDb();
    expect(() => createBatchInferenceJob(db, 1, {
      batch_id: 'batch_invalid1',
      input_jsonl: '{"custom_id":',
    })).toThrow(/Invalid JSONL/);
  });

  test('routes create, replay, list, read, and reject invalid batch bodies', async () => {
    const db = makeDb();
    const app = buildApp(db);

    const created = await request(app)
      .post('/api/batches')
      .set('idempotency-key', 'route-idem-1')
      .send({
        batch_id: 'batch_route001',
        input_jsonl: jsonl(),
        metadata: { source: 'route-test' },
      })
      .expect(201);
    expect(created.body.batch).toMatchObject({
      batch_id: 'batch_route001',
      status: 'created',
      execution_enabled: false,
      results_available: false,
      metadata: { source: 'route-test' },
    });
    expect(created.body.next).toBe('batch_worker_and_result_artifact_not_enabled');

    const replay = await request(app)
      .post('/api/batches')
      .set('idempotency-key', 'route-idem-1')
      .send({
        batch_id: 'batch_route002',
        input_jsonl: jsonl(),
      })
      .expect(200);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.batch.batch_id).toBe('batch_route001');

    const list = await request(app).get('/api/batches').expect(200);
    expect(list.body.data.map((batch) => batch.batch_id)).toEqual(['batch_route001']);

    const detail = await request(app).get('/api/batches/batch_route001').expect(200);
    expect(detail.body.batch.batch_id).toBe('batch_route001');

    const lines = await request(app).get('/api/batches/batch_route001/lines').expect(200);
    expect(lines.body).toMatchObject({
      object: 'list',
      batch_id: 'batch_route001',
      status: 'created',
      count: 2,
      limit: 50,
      offset: 0,
    });
    expect(lines.body.data.map((line) => line.custom_id)).toEqual(['chat-1', 'complete-1']);
    expect(lines.body.data[0]).not.toHaveProperty('body');

    const results = await request(app).get('/api/batches/batch_route001/results').expect(200);
    expect(results.body.result).toMatchObject({
      batch_id: 'batch_route001',
      results_available: false,
      download_enabled: false,
      next: 'wait_for_completed_batch_result_key_and_checksum',
    });

    await request(app)
      .get('/api/batches/batch_route001')
      .set('x-test-renter-id', '2')
      .expect(404);

    await request(app)
      .get('/api/batches/batch_route001/results')
      .set('x-test-renter-id', '2')
      .expect(404);

    await request(app)
      .get('/api/batches/batch_route001/lines')
      .set('x-test-renter-id', '2')
      .expect(404);

    const invalid = await request(app)
      .post('/api/batches')
      .send({
        batch_id: 'batch_badjson1',
        input_jsonl: '{"custom_id":',
      })
      .expect(400);
    expect(invalid.body).toMatchObject({
      code: 'invalid_json',
      details: { line: 1 },
    });
  });

  test('route factory accepts the production db wrapper shape', async () => {
    const db = makeDb();
    const app = buildApp(wrapDb(db));

    const res = await request(app)
      .post('/api/batches')
      .send({
        batch_id: 'batch_wrapper1',
        input_jsonl: jsonl(),
      })
      .expect(201);

    expect(res.body.batch).toMatchObject({
      batch_id: 'batch_wrapper1',
      execution_enabled: false,
    });
  });
});
