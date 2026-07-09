'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorWorkerDryRunFixtureProof,
} = require('../../tests/evaluator-worker-dry-run-fixture-proof');

describe('evaluator worker dry-run fixture proof script', () => {
  test('writes a CI-safe worker fixture report and temp manifest artifact', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-worker-fixture-proof-'));
    const report = runEvaluatorWorkerDryRunFixtureProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      mutates_production_db: false,
      queues_eval_job: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      writes_temp_manifest: true,
      writes_result_manifest_to_database: false,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      stores_raw_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.fixture_contract).toMatchObject({
      command: 'npm run proof:evaluator-worker-dry-run-fixture',
      source: {
        dispatches_real_queue: false,
        starts_runtime_worker: false,
        mutates_eval_job_status: false,
      },
      result_writer: {
        writes_temp_manifest_only: true,
        writes_production_artifact: false,
      },
      claim_guards: {
        queues_eval_job: false,
        starts_worker: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.dry_run_fixture).toMatchObject({
      eval_job_id: 'evaljob_worker001',
      current_mode: 'simulated_queue_fixture_only',
      queue_item: {
        simulated: true,
        dispatches_real_queue: false,
      },
      job_status: {
        before: 'draft',
        after: 'draft',
        mutates_status: false,
      },
      manifest: {
        eval_job_id: 'evaljob_worker001',
        dataset_sha256: 'b2'.repeat(32),
      },
      temp_artifact: {
        exists: true,
      },
      production_effects: {
        queues_eval_job: false,
        starts_worker: false,
        writes_production_artifact: false,
      },
    });
    expect(report.job_state).toMatchObject({
      before: {
        status: 'draft',
        result_available: false,
        result_manifest: null,
      },
      after: {
        status: 'draft',
        result_available: false,
        result_manifest: null,
        queued_at: null,
        started_at: null,
        completed_at: null,
      },
    });
    expect(report.invalid_cases).toMatchObject({
      non_draft_job: { rejected: true, code: 'worker_dry_run_requires_draft_job' },
      raw_summary: { rejected: true, code: 'raw_summary_field_forbidden' },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'worker dry-run fixture contract is command-ready and disabled-by-default',
      'fixture simulates a queue item and writes only a temporary manifest',
      'metadata job remains draft with no result database mutation',
      'non-draft jobs and raw summaries are rejected before fixture output',
      'readiness and worker gate expose fixture command without enabling queue or billing',
      'proof performs no production runtime result or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-worker-dry-run-fixture-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-worker-dry-run-fixture-proof-latest.md'))).toBe(true);
  });
});
