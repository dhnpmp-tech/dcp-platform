'use strict';

const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorResultManifestContract,
  validateEvaluatorResultManifest,
} = require('../services/evaluatorResultManifest');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../services/evaluatorJobSchema');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { createEvalsRouter } = require('../routes/evals');

const DATASET_SHA = 'e'.repeat(64);
const SUMMARY_SHA = 'f'.repeat(64);

function manifest(overrides = {}) {
  return {
    eval_job_id: 'evaljob_manifest001',
    dataset_sha256: DATASET_SHA,
    scoring_harness_version: 'eval-harness-2026-07-09',
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    summary_sha256: SUMMARY_SHA,
    created_at: '2026-07-09T03:55:00.000Z',
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use('/api/evals', createEvalsRouter({
    db: {
      exec: () => {},
      prepare: () => {
        throw new Error('protected evaluator job route should not be reached');
      },
    },
    requireRenter: (_req, res) => res.status(401).json({ error: 'Renter API key required' }),
  }));
  return app;
}

describe('evaluator result manifest contract', () => {
  test('builds a public schema contract while result endpoint stays disabled', () => {
    const contract = buildEvaluatorResultManifestContract(new Date('2026-07-09T03:55:00.000Z'));

    expect(contract).toMatchObject({
      object: 'evaluator_result_manifest_contract',
      version: 'dcp.evaluator_result_manifest.v1',
      current_mode: 'schema_and_checksum_contract_only',
      endpoints: {
        result_manifest_schema: 'GET /api/evals/results/schema',
        artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
        future_result_manifest: 'GET /api/evals/jobs/:id/results',
      },
      checksum_policy: {
        digest: 'sha256_hex',
        summary_sha256_required: true,
      },
      publication_policy: {
        raw_prompt_or_completion_publication_allowed: false,
        raw_dataset_publication_allowed: false,
        public_report_requires_human_review: true,
      },
      claim_guards: {
        result_endpoint_live: false,
        validates_manifest_only: true,
        writes_result_manifest: false,
        bills_eval_jobs: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('validates result manifests and rejects unsafe or mismatched data', () => {
    const valid = validateEvaluatorResultManifest(manifest(), {
      eval_job_id: 'evaljob_manifest001',
      dataset_sha256: DATASET_SHA,
      candidate_model: 'qwen/qwen3-coder',
      metrics: ['exact_match', 'semantic_similarity'],
    });

    expect(valid).toMatchObject({
      valid: true,
      version: 'dcp.evaluator_result_manifest.v1',
      raw_publication_allowed: false,
      public_report_allowed: false,
      manifest: {
        eval_job_id: 'evaljob_manifest001',
        dataset_sha256: DATASET_SHA,
        summary_sha256: SUMMARY_SHA,
      },
    });
    expect(() => validateEvaluatorResultManifest(manifest({ summary_sha256: 'bad' })))
      .toThrow(/summary_sha256/);
    expect(() => validateEvaluatorResultManifest(manifest({ raw_prompts: ['secret'] })))
      .toThrow(/raw customer data/i);
    expect(() => validateEvaluatorResultManifest(manifest(), { dataset_sha256: '0'.repeat(64) }))
      .toThrow(/does not match/);
  });

  test('links readiness, schema, and worker gate to the manifest contract', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:55:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:55:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T03:55:00.000Z'));

    expect(readiness.endpoints.result_manifest_schema).toBe('GET /api/evals/results/schema');
    expect(readiness.endpoints.result_artifact_storage_readiness).toBe('GET /api/evals/results/artifacts/readiness');
    expect(readiness.features.eval_result_manifest).toMatchObject({
      status: 'schema_and_checksum_contract_only',
      available: true,
      version: 'dcp.evaluator_result_manifest.v1',
      schema_endpoint: 'GET /api/evals/results/schema',
      result_endpoint_live: false,
      writes_result_manifest: false,
    });
    expect(readiness.claim_guards).toMatchObject({
      eval_result_manifest_schema_live: true,
      eval_worker_live: false,
      bills_eval_jobs: false,
    });
    expect(schema.artifact_policy.manifest_schema_endpoint).toBe('GET /api/evals/results/schema');
    expect(workerGate.result_policy).toMatchObject({
      endpoint_live: false,
      schema_endpoint: 'GET /api/evals/results/schema',
      artifact_storage_readiness_endpoint: 'GET /api/evals/results/artifacts/readiness',
    });
  });

  test('exposes result manifest schema through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/results/schema');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_result_manifest_contract',
      current_mode: 'schema_and_checksum_contract_only',
      endpoints: {
        result_manifest_schema: 'GET /api/evals/results/schema',
        artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      },
      claim_guards: {
        result_endpoint_live: false,
        writes_result_manifest: false,
        bills_eval_jobs: false,
      },
    });
  });
});
