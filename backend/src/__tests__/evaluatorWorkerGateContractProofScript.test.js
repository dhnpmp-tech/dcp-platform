'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorWorkerGateContractProof,
} = require('../../tests/evaluator-worker-gate-contract-proof');

describe('evaluator worker gate contract proof script', () => {
  test('writes a CI-safe proof report for the disabled evaluator worker gate', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-worker-gate-proof-'));
    const report = runEvaluatorWorkerGateContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      mutates_production_db: false,
      creates_metadata_records_only: true,
      queues_eval_job: false,
      runs_eval_worker: false,
      writes_result_manifest: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.created).toMatchObject({
      read_found: true,
      eval_job: {
        eval_job_id: 'evaljob_workgate001',
        status: 'draft',
        worker_enabled: false,
        billing_enabled: false,
      },
    });
    expect(report.worker_gate).toMatchObject({
      current_mode: 'worker_disabled_by_default',
      worker: {
        enabled: false,
        queue_dispatch_enabled: false,
        result_writer_enabled: false,
        billing_hook_enabled: false,
      },
      job_status_policy: {
        api_can_queue_jobs: false,
        api_can_start_jobs: false,
      },
      result_policy: {
        endpoint_live: false,
      },
      claim_guards: {
        mutates_eval_job_status: false,
        queues_eval_job: false,
        starts_worker: false,
        writes_result_manifest: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.readiness).toMatchObject({
      eval_worker: {
        available: false,
        worker_enabled: false,
        readiness_endpoint: 'GET /api/evals/worker/readiness',
      },
      claim_guards: {
        eval_worker_live: false,
        eval_jobs_live: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'worker gate is public, versioned, and disabled by default',
      'metadata jobs remain draft and cannot be queued by this API slice',
      'result manifest and billing hooks remain unavailable',
      'readiness and schema expose the worker gate without worker claims',
      'proof performs no production runtime or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-worker-gate-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-worker-gate-contract-proof-latest.md'))).toBe(true);
  });
});
