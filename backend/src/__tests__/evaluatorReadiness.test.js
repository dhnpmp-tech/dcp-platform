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
        benchmark_readiness: 'GET /api/models/benchmarks/readiness',
        benchmark_feed: 'GET /api/models/benchmarks',
        product_page: 'GET /benchmarks',
      },
      features: {
        eval_job_api: {
          status: 'coming_next',
          available: false,
          create_endpoint: null,
          list_endpoint: null,
          result_endpoint: null,
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
        eval_job_api: {
          available: false,
          create_endpoint: null,
        },
        public_reports: {
          available: false,
          ranking_allowed: false,
        },
      },
      claim_guards: {
        eval_jobs_live: false,
        arabic_quality_claim_allowed: false,
        bills_eval_jobs: false,
      },
    });
  });
});
