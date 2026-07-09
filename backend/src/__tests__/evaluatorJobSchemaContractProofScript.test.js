'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorJobSchemaContractProof,
} = require('../../tests/evaluator-job-schema-contract-proof');

describe('evaluator job schema contract proof script', () => {
  test('writes a CI-safe proof report for evaluator job schema gates', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-job-schema-proof-'));
    const report = runEvaluatorJobSchemaContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.evaluator_job_schema_version).toBe('dcp.evaluator_job_schema.v1');
    expect(report.claims).toMatchObject({
      creates_eval_jobs: false,
      stores_customer_datasets: false,
      runs_eval_worker: false,
      runs_model_comparisons: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.schema).toMatchObject({
      object: 'evaluator_job_schema_contract',
      version: 'dcp.evaluator_job_schema.v1',
      current_mode: 'schema_contract_only',
      endpoints: {
        schema: 'GET /api/evals/jobs/schema',
        create_metadata: 'POST /api/evals/jobs',
        list_metadata: 'GET /api/evals/jobs',
        read_metadata: 'GET /api/evals/jobs/:id',
        future_result_manifest: 'GET /api/evals/jobs/:id/results',
      },
      request_schema: {
        required: expect.arrayContaining([
          'dataset.sha256',
          'candidate_model',
          'metrics',
        ]),
        fields: {
          dataset: {
            raw_publication_allowed: false,
            redaction_review_required: true,
          },
        },
      },
      scoring_harness: {
        worker_enabled: false,
      },
      billing_policy: {
        bills_eval_jobs: false,
      },
      claim_guards: {
        create_endpoint_live: true,
        list_endpoint_live: true,
        read_endpoint_live: true,
        metadata_only: true,
        worker_enabled: false,
        bills_eval_jobs: false,
        public_report_allowed: false,
        arabic_quality_claim_allowed: false,
        model_ranking_allowed: false,
      },
    });
    expect(report.readiness_link).toMatchObject({
      schema_endpoint: 'GET /api/evals/jobs/schema',
      schema_feature: {
        available: true,
        creates_metadata_only: true,
      },
      eval_job_api: {
        available: true,
        create_endpoint: 'POST /api/evals/jobs',
        read_endpoint: 'GET /api/evals/jobs/:id',
        result_endpoint: null,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'schema contract is public, versioned, and linked from readiness',
      'request schema has tenant-safe dataset and scoring requirements',
      'metadata endpoints are live while worker result endpoint remains non-live',
      'worker, billing, reports, and quality claims remain blocked',
      'proof performs no runtime or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-job-schema-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-job-schema-contract-proof-latest.md'))).toBe(true);
  });
});
