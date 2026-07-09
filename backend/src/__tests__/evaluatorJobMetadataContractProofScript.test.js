'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorJobMetadataContractProof,
} = require('../../tests/evaluator-job-metadata-contract-proof');

describe('evaluator job metadata contract proof script', () => {
  test('writes a CI-safe proof report for metadata-only eval job APIs', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-job-metadata-proof-'));
    const report = runEvaluatorJobMetadataContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      mutates_production_db: false,
      creates_metadata_records_only: true,
      runs_eval_worker: false,
      stores_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.created).toMatchObject({
      idempotent_replay: true,
      list_count: 1,
      read_found: true,
      other_renter_read_found: false,
      eval_job: {
        eval_job_id: 'evaljob_proof001',
        status: 'draft',
        worker_enabled: false,
        billing_enabled: false,
        result_available: false,
      },
    });
    expect(report.readiness).toMatchObject({
      eval_job_api: {
        available: true,
        create_endpoint: 'POST /api/evals/jobs',
        list_endpoint: 'GET /api/evals/jobs',
        read_endpoint: 'GET /api/evals/jobs/:id',
        result_endpoint: null,
      },
      claim_guards: {
        eval_job_metadata_api_live: true,
        eval_jobs_live: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.schema.claim_guards).toMatchObject({
      create_endpoint_live: true,
      list_endpoint_live: true,
      read_endpoint_live: true,
      metadata_only: true,
      result_endpoint_live: false,
      worker_enabled: false,
      bills_eval_jobs: false,
      public_report_allowed: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'metadata create/list/read are live and idempotent in the service contract',
      'record stores dataset checksum, metrics, model identity, and safety flags',
      'readiness advertises metadata API but keeps live eval claims false',
      'schema guards worker, result, billing, report, ranking, and quality claims',
      'proof performs no production runtime or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-job-metadata-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-job-metadata-contract-proof-latest.md'))).toBe(true);
  });
});
