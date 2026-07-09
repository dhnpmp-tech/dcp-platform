'use strict';

const express = require('express');
const request = require('supertest');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../services/evaluatorJobSchema');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { createEvalsRouter } = require('../routes/evals');

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

describe('evaluator worker gate contract', () => {
  test('builds a disabled-by-default worker gate without runtime claims', () => {
    const gate = buildEvaluatorWorkerGate(new Date('2026-07-09T03:45:00.000Z'));

    expect(gate).toMatchObject({
      object: 'evaluator_worker_gate',
      version: 'dcp.evaluator_worker_gate.v1',
      current_mode: 'worker_disabled_by_default',
      endpoints: {
        worker_readiness: 'GET /api/evals/worker/readiness',
        metadata_jobs: 'POST/GET /api/evals/jobs',
        future_result_manifest: 'GET /api/evals/jobs/:id/results',
      },
      worker: {
        enabled: false,
        queue_dispatch_enabled: false,
        queue_name: null,
        result_writer_enabled: false,
        billing_hook_enabled: false,
        dry_run_fixture_available: true,
        dry_run_fixture_version: 'dcp.evaluator_worker_dry_run_fixture.v1',
        dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
        env_enable_var: 'DCP_EVALUATOR_WORKER_ENABLE',
      },
      job_status_policy: {
        metadata_create_status: 'draft',
        api_can_queue_jobs: false,
        api_can_start_jobs: false,
        running_status_external_mutation_allowed: false,
      },
      result_policy: {
        endpoint_live: false,
        manifest_required_before_enablement: true,
        signed_downloads_enabled: false,
      },
      dry_run_fixture: {
        object: 'evaluator_worker_dry_run_fixture_contract',
        current_mode: 'simulated_queue_fixture_only',
        command: 'npm run proof:evaluator-worker-dry-run-fixture',
        source: {
          dispatches_real_queue: false,
          starts_runtime_worker: false,
          mutates_eval_job_status: false,
        },
      },
      claim_guards: {
        mutates_eval_job_status: false,
        queues_eval_job: false,
        starts_worker: false,
        writes_result_manifest: false,
        bills_eval_jobs: false,
        publishes_public_report: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('links readiness and schema to the worker gate while keeping worker unavailable', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:45:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:45:00.000Z'));

    expect(readiness.endpoints.worker_readiness).toBe('GET /api/evals/worker/readiness');
    expect(readiness.features.eval_worker).toMatchObject({
      status: 'disabled_by_default_contract',
      available: false,
      version: 'dcp.evaluator_worker_gate.v1',
      readiness_endpoint: 'GET /api/evals/worker/readiness',
      worker_enabled: false,
      queue_dispatch_enabled: false,
      result_writer_enabled: false,
      billing_hook_enabled: false,
      dry_run_fixture_available: true,
      dry_run_fixture_command: 'npm run proof:evaluator-worker-dry-run-fixture',
    });
    expect(readiness.claim_guards).toMatchObject({
      eval_worker_live: false,
      eval_worker_dry_run_fixture_live: true,
      eval_jobs_live: false,
      bills_eval_jobs: false,
    });
    expect(schema.scoring_harness).toMatchObject({
      worker_enabled: false,
      worker_gate_endpoint: 'GET /api/evals/worker/readiness',
    });
  });

  test('exposes worker readiness through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/worker/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_worker_gate',
      current_mode: 'worker_disabled_by_default',
      worker: {
        enabled: false,
        queue_dispatch_enabled: false,
        dry_run_fixture_available: true,
      },
      claim_guards: {
        starts_worker: false,
        bills_eval_jobs: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });
});
