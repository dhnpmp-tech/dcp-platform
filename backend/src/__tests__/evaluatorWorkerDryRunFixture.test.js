'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildEvaluatorWorkerDryRunFixtureContract,
  createEvaluatorWorkerDryRunFixture,
} = require('../services/evaluatorWorkerDryRunFixture');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');

const DATASET_SHA = 'b2'.repeat(32);

function evalJob(overrides = {}) {
  return {
    eval_job_id: 'evaljob_fixture001',
    status: 'draft',
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

describe('evaluator worker dry-run fixture', () => {
  test('builds a command-ready fixture contract without worker claims', () => {
    const contract = buildEvaluatorWorkerDryRunFixtureContract(new Date('2026-07-09T04:30:00.000Z'));

    expect(contract).toMatchObject({
      object: 'evaluator_worker_dry_run_fixture_contract',
      version: 'dcp.evaluator_worker_dry_run_fixture.v1',
      current_mode: 'simulated_queue_fixture_only',
      command: 'npm run proof:evaluator-worker-dry-run-fixture',
      source: {
        eval_job_status: 'draft',
        dispatches_real_queue: false,
        starts_runtime_worker: false,
        mutates_eval_job_status: false,
      },
      result_writer: {
        mode: 'dry_run_temp_artifact_only',
        writes_temp_manifest_only: true,
        writes_production_artifact: false,
      },
      claim_guards: {
        queues_eval_job: false,
        starts_worker: false,
        mutates_eval_job_status: false,
        writes_production_artifact: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('runs a draft metadata job through the dry-run writer without mutation', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-worker-fixture-'));
    const result = createEvaluatorWorkerDryRunFixture({
      eval_job: evalJob(),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, {
      now: new Date('2026-07-09T04:30:00.000Z'),
      outputDir,
    });

    expect(result).toMatchObject({
      object: 'evaluator_worker_dry_run_fixture',
      version: 'dcp.evaluator_worker_dry_run_fixture.v1',
      current_mode: 'simulated_queue_fixture_only',
      worker_enabled: false,
      queue_dispatch_enabled: false,
      runtime_worker_started: false,
      billing_hook_enabled: false,
      queue_item: {
        simulated: true,
        source_eval_job_id: 'evaljob_fixture001',
        source_status: 'draft',
        dispatches_real_queue: false,
      },
      job_status: {
        before: 'draft',
        after: 'draft',
        mutates_status: false,
        database_write_expected: false,
      },
      result_writer: {
        dry_run: true,
        result_endpoint_live: false,
        production_writer_enabled: false,
        artifact_store_enabled: false,
        manifest: {
          eval_job_id: 'evaljob_fixture001',
          dataset_sha256: DATASET_SHA,
        },
      },
      production_effects: {
        queues_eval_job: false,
        starts_worker: false,
        mutates_eval_job_status: false,
        writes_result_manifest_to_database: false,
        writes_production_artifact: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
      },
    });
    expect(fs.existsSync(result.result_writer.temp_artifact.path)).toBe(true);
    const artifact = JSON.parse(fs.readFileSync(result.result_writer.temp_artifact.path, 'utf8'));
    expect(artifact).toMatchObject({
      eval_job_id: 'evaljob_fixture001',
      summary_sha256: result.result_writer.summary_sha256,
    });
    expect(artifact.raw_prompts).toBeUndefined();
    expect(artifact.rows).toBeUndefined();
  });

  test('rejects non-draft jobs and raw summaries before writing fixture output', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-worker-fixture-reject-'));

    expect(() => createEvaluatorWorkerDryRunFixture({
      eval_job: evalJob({ status: 'running' }),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, { outputDir })).toThrow(/only accepts draft/i);

    expect(() => createEvaluatorWorkerDryRunFixture({
      eval_job: evalJob(),
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary({ raw_completions: ['secret'] }),
    }, { outputDir })).toThrow(/raw customer data/i);
  });

  test('links readiness and worker gate to the fixture command while keeping worker disabled', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T04:30:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T04:30:00.000Z'));

    expect(readiness.features.eval_worker).toMatchObject({
      available: false,
      worker_enabled: false,
      queue_dispatch_enabled: false,
      result_writer_enabled: false,
      dry_run_fixture_available: true,
      dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
    });
    expect(readiness.claim_guards).toMatchObject({
      eval_worker_live: false,
      eval_worker_dry_run_fixture_live: true,
      bills_eval_jobs: false,
    });
    expect(workerGate.worker).toMatchObject({
      enabled: false,
      dry_run_fixture_available: true,
      dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
    });
    expect(workerGate.dry_run_fixture).toMatchObject({
      current_mode: 'simulated_queue_fixture_only',
      command: 'npm run proof:evaluator-worker-dry-run-fixture',
      claim_guards: {
        queues_eval_job: false,
        starts_worker: false,
        writes_production_artifact: false,
        bills_eval_jobs: false,
      },
    });
  });
});
