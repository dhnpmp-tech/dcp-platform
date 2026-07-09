'use strict';

const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorResultAccessPolicyReadiness,
  evaluateEvaluatorResultAccessPolicy,
} = require('../services/evaluatorResultAccessPolicy');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../services/evaluatorResultWriterDryRun');
const { buildEvaluatorResultManifestContract } = require('../services/evaluatorResultManifest');
const { buildEvaluatorArtifactStoragePolicyReadiness } = require('../services/evaluatorArtifactStoragePolicy');
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

function captureCode(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
}

describe('evaluator result access policy', () => {
  test('builds public policy-only readiness without result endpoint claims', () => {
    const readiness = buildEvaluatorResultAccessPolicyReadiness(new Date('2026-07-09T05:00:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'evaluator_result_access_policy_readiness',
      version: 'dcp.evaluator_result_access_policy.v1',
      current_mode: 'authorization_policy_contract_only',
      endpoints: {
        result_access_readiness: 'GET /api/evals/results/access/readiness',
        artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      },
      access_policy: {
        policy_available: true,
        result_endpoint_live: false,
        signed_downloads_enabled: false,
        renter_auth_required: true,
        renter_owner_match_required: true,
        result_available_required: true,
        artifact_policy_required: true,
        admin_override_enabled: false,
      },
      claim_guards: {
        policy_contract_live: true,
        result_endpoint_live: false,
        signed_downloads_enabled: false,
        exposes_result_endpoint: false,
        signs_download_url: false,
        allows_cross_renter_access: false,
        allows_public_report_access: false,
        bills_eval_jobs: false,
        publishes_public_report: false,
        model_ranking_allowed: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('evaluates owner matched completed result as policy-authorizable while endpoint stays disabled', () => {
    const result = evaluateEvaluatorResultAccessPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    });

    expect(result).toMatchObject({
      valid: true,
      version: 'dcp.evaluator_result_access_policy.v1',
      eval_job_id: 'evaljob_access001',
      renter_id: 42,
      would_authorize_if_endpoint_enabled: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      download_url_signed: false,
      denial_code_while_disabled: 'evaluator_result_endpoint_disabled',
      artifact_policy: {
        storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
        checksum_sha256: 'd'.repeat(64),
        production_writes_enabled: false,
        signed_downloads_enabled: false,
      },
    });
  });

  test('rejects cross-renter unavailable and invalid artifact access with exact codes', () => {
    const base = {
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    };

    expect(captureCode(() => evaluateEvaluatorResultAccessPolicy({
      ...base,
      requesting_renter_id: 41,
    }))).toBe('evaluator_result_owner_mismatch');

    expect(captureCode(() => evaluateEvaluatorResultAccessPolicy({
      ...base,
      result_available: false,
    }))).toBe('evaluator_result_not_available');

    expect(captureCode(() => evaluateEvaluatorResultAccessPolicy({
      ...base,
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
    }))).toBe('evaluator_artifact_storage_key_scope_invalid');
  });

  test('links aggregate readiness and result contracts to access policy without enabling results', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T05:00:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T05:00:00.000Z'));
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T05:00:00.000Z'));
    const manifestContract = buildEvaluatorResultManifestContract(new Date('2026-07-09T05:00:00.000Z'));
    const artifactReadiness = buildEvaluatorArtifactStoragePolicyReadiness(new Date('2026-07-09T05:00:00.000Z'));

    expect(readiness.endpoints.result_access_readiness).toBe('GET /api/evals/results/access/readiness');
    expect(readiness.features.eval_result_access_policy).toMatchObject({
      status: 'authorization_policy_contract_only',
      available: true,
      version: 'dcp.evaluator_result_access_policy.v1',
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      renter_auth_required: true,
      renter_owner_match_required: true,
    });
    expect(readiness.claim_guards).toMatchObject({
      eval_result_access_policy_live: true,
      bills_eval_jobs: false,
    });
    expect(workerGate.endpoints.result_access_readiness).toBe('GET /api/evals/results/access/readiness');
    expect(workerGate.result_policy.result_access_readiness_endpoint).toBe('GET /api/evals/results/access/readiness');
    expect(writerReadiness.endpoints.result_access_readiness).toBe('GET /api/evals/results/access/readiness');
    expect(writerReadiness.writer.result_access_policy_endpoint).toBe('GET /api/evals/results/access/readiness');
    expect(manifestContract.endpoints.result_access_readiness).toBe('GET /api/evals/results/access/readiness');
    expect(artifactReadiness.endpoints.result_access_readiness).toBe('GET /api/evals/results/access/readiness');
  });

  test('exposes result access readiness through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/results/access/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_result_access_policy_readiness',
      current_mode: 'authorization_policy_contract_only',
      access_policy: {
        policy_available: true,
        result_endpoint_live: false,
        signed_downloads_enabled: false,
      },
      claim_guards: {
        policy_contract_live: true,
        exposes_result_endpoint: false,
        signs_download_url: false,
      },
    });
  });
});
