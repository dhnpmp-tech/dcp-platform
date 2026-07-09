'use strict';

const express = require('express');
const request = require('supertest');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { createEvalsRouter } = require('../routes/evals');

jest.mock('../middleware/rateLimiter', () => ({
  publicEndpointLimiter: (_req, _res, next) => next(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/evals', createEvalsRouter());
  return app;
}

describe('evaluator readiness contract', () => {
  test('keeps evaluator jobs and public benchmark claims gated', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T02:10:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'evaluator_readiness',
      version: 'dcp.evaluator_readiness.v1',
      generated_at: '2026-07-09T02:10:00.000Z',
      current_mode: 'readiness_contract_only',
      endpoints: {
        readiness: 'GET /api/evals/readiness',
        job_schema: 'GET /api/evals/jobs/schema',
        benchmark_readiness: 'GET /api/models/benchmarks/readiness',
        benchmark_feed: 'GET /api/models/benchmarks',
        product_page: 'GET /benchmarks',
      },
      features: {
        eval_job_schema: {
          status: 'schema_contract_only',
          available: true,
          version: 'dcp.evaluator_job_schema.v1',
          schema_endpoint: 'GET /api/evals/jobs/schema',
          creates_jobs: true,
          creates_metadata_only: true,
          runs_worker: false,
        },
        eval_job_api: {
          status: 'metadata_records_live_worker_blocked',
          available: true,
          create_endpoint: 'POST /api/evals/jobs',
          list_endpoint: 'GET /api/evals/jobs',
          read_endpoint: 'GET /api/evals/jobs/:id',
          result_endpoint: null,
        },
        eval_worker: {
          status: 'disabled_by_default_contract',
          available: false,
          version: 'dcp.evaluator_worker_gate.v1',
          readiness_endpoint: 'GET /api/evals/worker/readiness',
          worker_enabled: false,
          queue_dispatch_enabled: false,
          result_writer_enabled: false,
          billing_hook_enabled: false,
          dry_run_fixture_available: true,
          dry_run_fixture_version: 'dcp.evaluator_worker_dry_run_fixture.v1',
          dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
        },
        dataset_artifacts: {
          status: 'gated_storage_policy',
          available: false,
          raw_dataset_publication: false,
        },
        baseline_comparison: {
          status: 'gated_baseline_policy',
          available: false,
          frontier_model_comparison_allowed: false,
        },
        public_reports: {
          status: 'blocked_until_artifacts',
          available: false,
          case_study_allowed: false,
          ranking_allowed: false,
        },
        billing_policy: {
          status: 'not_enabled',
          available: false,
          bills_eval_jobs: false,
        },
      },
      claim_guards: {
        eval_jobs_live: false,
        eval_job_metadata_api_live: true,
        eval_worker_live: false,
        eval_worker_dry_run_fixture_live: true,
        arabic_quality_claim_allowed: false,
        customer_case_study_allowed: false,
        model_ranking_allowed: false,
        frontier_model_comparison_allowed: false,
        raw_customer_dataset_published: false,
        bills_eval_jobs: false,
      },
    });
  });

  test('exposes the readiness contract through a public read-only route', async () => {
    const response = await request(buildApp()).get('/api/evals/readiness');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      object: 'evaluator_readiness',
      version: 'dcp.evaluator_readiness.v1',
      current_mode: 'readiness_contract_only',
      features: {
        eval_job_schema: {
          available: true,
          schema_endpoint: 'GET /api/evals/jobs/schema',
          creates_metadata_only: true,
        },
        eval_job_api: {
          available: true,
          create_endpoint: 'POST /api/evals/jobs',
          result_endpoint: null,
        },
        eval_worker: {
          available: false,
          queue_dispatch_enabled: false,
          dry_run_fixture_available: true,
          dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
        },
        public_reports: {
          available: false,
          ranking_allowed: false,
        },
      },
      claim_guards: {
        eval_jobs_live: false,
        eval_worker_live: false,
        eval_worker_dry_run_fixture_live: true,
        arabic_quality_claim_allowed: false,
        bills_eval_jobs: false,
      },
    });
  });

  test('exposes a public read-only evaluator job schema contract', async () => {
    const response = await request(buildApp()).get('/api/evals/jobs/schema');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
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
        required: [
          'name',
          'task',
          'dataset.ref',
          'dataset.sha256',
          'candidate_model',
          'metrics',
        ],
        fields: {
          task: {
            allowed_values: expect.arrayContaining(['arabic_qa', 'arabic_safety', 'latency_cost']),
          },
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
        minimum_balance_endpoint: 'GET /api/renters/me/minimum-balances',
      },
      claim_guards: {
        create_endpoint_live: true,
        list_endpoint_live: true,
        read_endpoint_live: true,
        metadata_only: true,
        worker_enabled: false,
        stores_raw_customer_dataset: false,
        bills_eval_jobs: false,
        public_report_allowed: false,
        arabic_quality_claim_allowed: false,
        model_ranking_allowed: false,
      },
    });
  });
});
