'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorResultEndpointDisabledProof,
} = require('../../tests/evaluator-result-endpoint-disabled-proof');

describe('evaluator disabled result endpoint proof script', () => {
  test('writes a CI-safe disabled endpoint report without manifest or download side effects', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-endpoint-disabled-proof-'));
    const report = await runEvaluatorResultEndpointDisabledProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      disabled_route_live: true,
      exposes_live_result_endpoint: false,
      exposes_result_manifest: false,
      exposes_artifact_storage_key: false,
      signs_download_url: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.owner_response).toMatchObject({
      status: 409,
      body: {
        object: 'evaluator_result_endpoint_disabled',
        eval_job_id: 'evaljob_result001',
        renter_id: 1,
        job_status: 'succeeded',
        result_available: true,
        result_endpoint_live: false,
        signed_downloads_enabled: false,
        denial_code: 'evaluator_result_endpoint_disabled',
        claim_guards: {
          exposes_disabled_result_endpoint: true,
          exposes_live_result_endpoint: false,
          exposes_result_manifest: false,
          exposes_artifact_storage_key: false,
          signs_download_url: false,
          bills_eval_jobs: false,
        },
      },
    });
    expect(report.owner_response.serialized).not.toContain('"result_manifest":');
    expect(report.owner_response.serialized).not.toContain('"storage_key":');
    expect(report.owner_response.serialized).not.toContain('eval-results/renter-1/');
    expect(report.owner_response.serialized).not.toContain('signed_url');
    expect(report.other_renter_response).toMatchObject({
      status: 404,
      body: {
        code: 'evaluator_job_not_found',
      },
    });
    expect(report.unauthenticated_response.status).toBe(401);
    expect(report.linked_contracts).toMatchObject({
      evaluator_readiness: {
        endpoint: 'GET /api/evals/jobs/:id/results',
        eval_job_api: {
          disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
          result_endpoint: null,
          result_endpoint_live: false,
        },
      },
      job_schema: {
        endpoint: 'GET /api/evals/jobs/:id/results',
        claim_guards: {
          disabled_result_endpoint_live: true,
          result_endpoint_live: false,
        },
      },
      worker_gate: {
        endpoint: 'GET /api/evals/jobs/:id/results',
        disabled_endpoint: 'GET /api/evals/jobs/:id/results',
      },
      access_policy: {
        endpoint: 'GET /api/evals/jobs/:id/results',
        disabled_result_endpoint_live: true,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'owner receives disabled result route without manifest or signed download',
      'private manifest fields are not serialized in disabled endpoint response',
      'other renters and unauthenticated callers cannot inspect result state',
      'readiness schema worker and access contracts link disabled endpoint while live results remain off',
      'proof performs no runtime result download or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-endpoint-disabled-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-endpoint-disabled-proof-latest.md'))).toBe(true);
  });
});
