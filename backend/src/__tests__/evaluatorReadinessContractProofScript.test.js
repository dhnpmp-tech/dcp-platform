'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorReadinessContractProof,
} = require('../../tests/evaluator-readiness-contract-proof');

describe('evaluator readiness contract proof script', () => {
  test('writes a CI-safe proof report for evaluator job gates', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-readiness-proof-'));
    const report = runEvaluatorReadinessContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.evaluator_readiness_version).toBe('dcp.evaluator_readiness.v1');
    expect(report.claims).toMatchObject({
      creates_eval_jobs: false,
      stores_customer_datasets: false,
      runs_model_comparisons: false,
      enables_arabic_quality_claims: false,
      enables_public_rankings: false,
      mutates_billing_or_settlement: false,
    });
    expect(report.readiness).toMatchObject({
      object: 'evaluator_readiness',
      version: 'dcp.evaluator_readiness.v1',
      current_mode: 'readiness_contract_only',
      endpoints: {
        readiness: 'GET /api/evals/readiness',
        job_schema: 'GET /api/evals/jobs/schema',
        benchmark_readiness: 'GET /api/models/benchmarks/readiness',
        product_page: 'GET /benchmarks',
      },
      features: {
        eval_job_schema: {
          status: 'schema_contract_only',
          available: true,
          schema_endpoint: 'GET /api/evals/jobs/schema',
          creates_metadata_only: true,
        },
        eval_job_api: {
          status: 'metadata_records_live_worker_blocked',
          available: true,
          create_endpoint: 'POST /api/evals/jobs',
          list_endpoint: 'GET /api/evals/jobs',
          read_endpoint: 'GET /api/evals/jobs/:id',
          result_endpoint: null,
        },
        public_reports: {
          available: false,
          case_study_allowed: false,
          ranking_allowed: false,
        },
        billing_policy: {
          available: false,
          bills_eval_jobs: false,
        },
      },
      claim_guards: {
        eval_jobs_live: false,
        arabic_quality_claim_allowed: false,
        customer_case_study_allowed: false,
        model_ranking_allowed: false,
        frontier_model_comparison_allowed: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'readiness contract is public, versioned, and linked to benchmark/schema surfaces',
      'evaluator job metadata API is visible while worker/result APIs remain unavailable',
      'evaluator result and worker APIs remain unavailable until artifact proof exists',
      'dataset, baseline, report, and billing gates stay closed',
      'public benchmark and quality claims remain false',
      'proof itself performs no runtime or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-readiness-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-readiness-contract-proof-latest.md'))).toBe(true);
  });
});
