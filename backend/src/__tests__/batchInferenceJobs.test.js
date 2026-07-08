'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createBatchInferenceJob,
  ensureBatchInferenceJobSchema,
  getBatchInferenceJob,
  listBatchInferenceJobs,
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

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/batches', createBatchesRouter({
    db,
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
    ]));
  });

  test('creates, lists, and reads a validated batch record without enabling execution', () => {
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
    });
    expect(result.batch.input_checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.batch.input_storage_key).toBe('batch-inputs/renter-1/batch_alpha001/input.jsonl');

    expect(getBatchInferenceJob(db, 1, 'batch_alpha001')).toMatchObject({ batch_id: 'batch_alpha001' });
    expect(listBatchInferenceJobs(db, 1).batches.map((batch) => batch.batch_id)).toEqual(['batch_alpha001']);
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

    await request(app)
      .get('/api/batches/batch_route001')
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
