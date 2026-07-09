'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
  getEvaluatorJob,
  listEvaluatorJobs,
} = require('../services/evaluatorJobs');
const { createEvalsRouter } = require('../routes/evals');

const SHA = 'a'.repeat(64);

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
  ensureEvaluatorJobSchema(raw);
  return raw;
}

function payload(overrides = {}) {
  return {
    eval_job_id: 'evaljob_test0001',
    name: 'Arabic QA smoke eval',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/arabic-qa.jsonl',
      sha256: SHA,
      format: 'jsonl',
      example_count: 25,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity', 'p95_latency_ms'],
    max_examples: 25,
    cost_budget_halala: 0,
    metadata: { source: 'jest' },
    ...overrides,
  };
}

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/evals', createEvalsRouter({
    db,
    requireRenter: (req, res, next) => {
      const renterId = Number(req.header('x-test-renter-id') || 1);
      if (renterId === 0) return res.status(401).json({ error: 'Renter API key required' });
      req.renter = { id: renterId };
      return next();
    },
  }));
  return app;
}

describe('evaluator job metadata records', () => {
  test('creates, replays, lists, and reads metadata-only evaluator jobs', () => {
    const db = makeDb();
    const first = createEvaluatorJob(db, 1, payload(), { idempotencyKey: 'eval-idem-1' });
    const replay = createEvaluatorJob(db, 1, payload({ name: 'Ignored replay body' }), { idempotencyKey: 'eval-idem-1' });

    expect(first.idempotent_replay).toBe(false);
    expect(replay.idempotent_replay).toBe(true);
    expect(replay.eval_job.eval_job_id).toBe(first.eval_job.eval_job_id);
    expect(first.eval_job).toMatchObject({
      object: 'evaluator_job',
      version: 'dcp.evaluator_job_record.v1',
      eval_job_id: 'evaljob_test0001',
      renter_id: 1,
      status: 'draft',
      worker_enabled: false,
      billing_enabled: false,
      result_available: false,
      dataset: {
        sha256: SHA,
        raw_publication_allowed: false,
      },
      metrics: ['exact_match', 'semantic_similarity', 'p95_latency_ms'],
      next: 'evaluator_worker_and_result_artifact_not_enabled',
    });

    const list = listEvaluatorJobs(db, 1);
    expect(list.eval_jobs).toHaveLength(1);
    expect(getEvaluatorJob(db, 1, 'evaljob_test0001')).toMatchObject({
      eval_job_id: 'evaljob_test0001',
      candidate_model: 'qwen/qwen3-coder',
    });
    expect(getEvaluatorJob(db, 2, 'evaljob_test0001')).toBeNull();
  });

  test('rejects unsafe evaluator metadata inputs before record creation', () => {
    const db = makeDb();

    expect(() => createEvaluatorJob(db, 1, payload({ dataset: { ref: 'x', sha256: 'bad', format: 'jsonl', example_count: 1 } })))
      .toThrow(/SHA-256/);
    expect(() => createEvaluatorJob(db, 1, payload({ dataset: { ref: 'x', sha256: SHA, format: 'jsonl', example_count: 0 } })))
      .toThrow(/dataset.example_count/);
    expect(() => createEvaluatorJob(db, 1, payload({ max_examples: 0 })))
      .toThrow(/max_examples/);
    expect(() => createEvaluatorJob(db, 1, payload({ metrics: ['made_up_metric'] })))
      .toThrow(/Unsupported evaluator metric/);
    expect(() => createEvaluatorJob(db, 1, payload({ task: 'frontier_ranking' })))
      .toThrow(/Unsupported evaluator task/);
  });

  test('routes expose renter-scoped metadata APIs without worker or billing', async () => {
    const db = makeDb();
    const app = buildApp(db);

    const created = await request(app)
      .post('/api/evals/jobs')
      .set('x-test-renter-id', '1')
      .set('idempotency-key', 'route-eval-1')
      .send(payload({ eval_job_id: 'evaljob_route001' }));

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      idempotent_replay: false,
      worker_enabled: false,
      billing_enabled: false,
      eval_job: {
        eval_job_id: 'evaljob_route001',
        status: 'draft',
        worker_enabled: false,
        billing_enabled: false,
      },
    });

    const replay = await request(app)
      .post('/api/evals/jobs')
      .set('x-test-renter-id', '1')
      .set('idempotency-key', 'route-eval-1')
      .send(payload({ eval_job_id: 'evaljob_other001' }));
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.eval_job.eval_job_id).toBe('evaljob_route001');

    const list = await request(app).get('/api/evals/jobs').set('x-test-renter-id', '1');
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      object: 'list',
      count: 1,
      worker_enabled: false,
      billing_enabled: false,
    });

    const read = await request(app).get('/api/evals/jobs/evaljob_route001').set('x-test-renter-id', '1');
    expect(read.status).toBe(200);
    expect(read.body.eval_job.eval_job_id).toBe('evaljob_route001');

    const otherRenter = await request(app).get('/api/evals/jobs/evaljob_route001').set('x-test-renter-id', '2');
    expect(otherRenter.status).toBe(404);
  });
});
