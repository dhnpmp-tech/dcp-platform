'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorResultEndpointDisabledResponse,
} = require('../services/evaluatorResultEndpointGate');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
} = require('../services/evaluatorJobs');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../services/evaluatorJobSchema');
const { createEvalsRouter } = require('../routes/evals');

const SHA = 'e'.repeat(64);

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
    eval_job_id: 'evaljob_result001',
    name: 'Arabic QA result endpoint smoke',
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

function markSucceededWithPrivateManifest(db, evalJobId = 'evaljob_result001') {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE evaluator_jobs
       SET status = 'succeeded',
           result_manifest_json = ?,
           completed_at = ?,
           updated_at = ?
     WHERE eval_job_id = ?
  `).run(JSON.stringify({
    eval_job_id: evalJobId,
    storage_key: `eval-results/renter-1/${evalJobId}/result-manifest.json`,
    signed_url: 'https://object-store.example/private-signed-url',
    summary_sha256: 'f'.repeat(64),
  }), now, now, evalJobId);
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

describe('evaluator disabled result endpoint gate', () => {
  test('builds a disabled response without manifest artifact or signed URL fields', () => {
    const response = buildEvaluatorResultEndpointDisabledResponse({
      eval_job_id: 'evaljob_result001',
      renter_id: 1,
      status: 'succeeded',
      result_available: true,
      result_manifest: {
        storage_key: 'eval-results/renter-1/evaljob_result001/result-manifest.json',
        signed_url: 'https://object-store.example/private-signed-url',
      },
    }, new Date('2026-07-09T05:35:00.000Z'));
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      object: 'evaluator_result_endpoint_disabled',
      version: 'dcp.evaluator_result_endpoint_disabled.v1',
      eval_job_id: 'evaljob_result001',
      renter_id: 1,
      job_status: 'succeeded',
      result_available: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      download_url_signed: false,
      denial_code: 'evaluator_result_endpoint_disabled',
      endpoints: {
        result_endpoint: 'GET /api/evals/jobs/:id/results',
        result_access_readiness: 'GET /api/evals/results/access/readiness',
      },
      claim_guards: {
        renter_auth_required: true,
        renter_owner_scope_enforced: true,
        exposes_disabled_result_endpoint: true,
        result_endpoint_live: false,
        exposes_result_manifest: false,
        exposes_artifact_storage_key: false,
        exposes_live_result_endpoint: false,
        signs_download_url: false,
        bills_eval_jobs: false,
      },
    });
    expect(serialized).not.toContain('"result_manifest":');
    expect(serialized).not.toContain('"storage_key":');
    expect(serialized).not.toContain('eval-results/renter-1/');
    expect(serialized).not.toContain('signed_url');
    expect(serialized).not.toContain('object-store.example');
  });

  test('route is renter scoped and disabled even when a private manifest exists', async () => {
    const db = makeDb();
    createEvaluatorJob(db, 1, payload(), { idempotencyKey: 'result-route-1' });
    markSucceededWithPrivateManifest(db);
    const app = buildApp(db);

    const own = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '1');
    const otherRenter = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '2');
    const unauthenticated = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '0');

    expect(own.status).toBe(409);
    expect(own.body).toMatchObject({
      object: 'evaluator_result_endpoint_disabled',
      eval_job_id: 'evaljob_result001',
      renter_id: 1,
      job_status: 'succeeded',
      result_available: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      denial_code: 'evaluator_result_endpoint_disabled',
    });
    expect(JSON.stringify(own.body)).not.toContain('"result_manifest":');
    expect(JSON.stringify(own.body)).not.toContain('"storage_key":');
    expect(JSON.stringify(own.body)).not.toContain('eval-results/renter-1/');
    expect(JSON.stringify(own.body)).not.toContain('signed_url');
    expect(JSON.stringify(own.body)).not.toContain('object-store.example');
    expect(otherRenter.status).toBe(404);
    expect(unauthenticated.status).toBe(401);
  });

  test('readiness and schema link the disabled route while live results remain off', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T05:35:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T05:35:00.000Z'));

    expect(readiness.endpoints.disabled_result_endpoint).toBe('GET /api/evals/jobs/:id/results');
    expect(readiness.features.eval_job_api).toMatchObject({
      disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      result_endpoint: null,
      result_endpoint_live: false,
    });
    expect(readiness.features.eval_result_access_policy).toMatchObject({
      disabled_result_endpoint_live: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
    });
    expect(schema.endpoints.disabled_result_endpoint).toBe('GET /api/evals/jobs/:id/results');
    expect(schema.claim_guards).toMatchObject({
      disabled_result_endpoint_live: true,
      result_endpoint_live: false,
      worker_enabled: false,
      bills_eval_jobs: false,
    });
  });
});
