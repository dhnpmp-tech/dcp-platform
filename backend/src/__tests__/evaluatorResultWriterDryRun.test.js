'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorResultWriterDryRunReadiness,
  createEvaluatorResultWriterDryRun,
} = require('../services/evaluatorResultWriterDryRun');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { buildEvaluatorResultManifestContract } = require('../services/evaluatorResultManifest');
const { createEvalsRouter } = require('../routes/evals');

const DATASET_SHA = 'a1'.repeat(32);

function evalJob(overrides = {}) {
  return {
    eval_job_id: 'evaljob_writer001',
    dataset: {
      sha256: DATASET_SHA,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    ...overrides,
  };
}

function summary(overrides = {}) {
  return {
    aggregate: {
      exact_match: 0.75,
      semantic_similarity: 0.82,
    },
    counts: {
      examples_scored: 8,
      failed_examples: 0,
    },
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

describe('evaluator result writer dry run', () => {
  test('builds a public dry-run readiness contract without production writer claims', () => {
    const readiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T04:05:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'evaluator_result_writer_dry_run_readiness',
      version: 'dcp.evaluator_result_writer_dry_run.v1',
      current_mode: 'dry_run_temp_artifact_only',
      endpoints: {
        writer_readiness: 'GET /api/evals/results/writer/readiness',
        result_manifest_schema: 'GET /api/evals/results/schema',
      },
      writer: {
        dry_run_available: true,
        production_writer_enabled: false,
        result_endpoint_live: false,
        artifact_store_enabled: false,
        signed_downloads_enabled: false,
        writes_temp_manifest_only: true,
      },
      claim_guards: {
        writes_temp_artifact: true,
        writes_production_artifact: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('writes a validated manifest to temporary storage only', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-writer-dry-run-'));
    const result = createEvaluatorResultWriterDryRun({
      eval_job: evalJob(),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, {
      now: new Date('2026-07-09T04:05:00.000Z'),
      outputDir,
    });

    expect(result).toMatchObject({
      object: 'evaluator_result_writer_dry_run',
      dry_run: true,
      result_endpoint_live: false,
      production_writer_enabled: false,
      artifact_store_enabled: false,
      manifest: {
        eval_job_id: 'evaljob_writer001',
        dataset_sha256: DATASET_SHA,
        candidate_model: 'qwen/qwen3-coder',
      },
      production_effects: {
        mutates_eval_job_status: false,
        writes_production_artifact: false,
        stores_raw_customer_dataset: false,
        bills_eval_jobs: false,
      },
    });
    expect(fs.existsSync(result.temp_artifact.path)).toBe(true);
    const artifact = JSON.parse(fs.readFileSync(result.temp_artifact.path, 'utf8'));
    expect(artifact).toMatchObject({
      eval_job_id: 'evaljob_writer001',
      dataset_sha256: DATASET_SHA,
      summary_sha256: result.summary_sha256,
    });
    expect(artifact.raw_prompts).toBeUndefined();
    expect(artifact.raw_completions).toBeUndefined();
  });

  test('rejects raw summary fields and invalid metric manifests before writing', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-writer-reject-'));

    expect(() => createEvaluatorResultWriterDryRun({
      eval_job: evalJob(),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary({ raw_prompts: ['secret'] }),
    }, { outputDir })).toThrow(/raw customer data/i);

    expect(() => createEvaluatorResultWriterDryRun({
      eval_job: evalJob({ metrics: ['not_real_metric'] }),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, { outputDir })).toThrow(/unsupported metrics/i);
  });

  test('links evaluator readiness, worker gate, and manifest contract to writer readiness', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T04:05:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T04:05:00.000Z'));
    const resultManifestContract = buildEvaluatorResultManifestContract(new Date('2026-07-09T04:05:00.000Z'));

    expect(readiness.endpoints.result_writer_readiness).toBe('GET /api/evals/results/writer/readiness');
    expect(readiness.features.eval_result_writer).toMatchObject({
      status: 'dry_run_temp_artifact_only',
      available: true,
      production_writer_enabled: false,
      result_endpoint_live: false,
      artifact_store_enabled: false,
    });
    expect(readiness.claim_guards).toMatchObject({
      eval_result_writer_dry_run_live: true,
      eval_worker_live: false,
      bills_eval_jobs: false,
    });
    expect(workerGate.result_policy.writer_readiness_endpoint).toBe('GET /api/evals/results/writer/readiness');
    expect(resultManifestContract.endpoints.result_writer_readiness).toBe('GET /api/evals/results/writer/readiness');
  });

  test('exposes result writer readiness through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/results/writer/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_result_writer_dry_run_readiness',
      current_mode: 'dry_run_temp_artifact_only',
      writer: {
        dry_run_available: true,
        production_writer_enabled: false,
        result_endpoint_live: false,
      },
      claim_guards: {
        writes_temp_artifact: true,
        writes_production_artifact: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
      },
    });
  });
});
