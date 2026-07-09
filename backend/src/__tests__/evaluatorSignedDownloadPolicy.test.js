'use strict';

const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorSignedDownloadPolicyReadiness,
  evaluateEvaluatorSignedDownloadPolicy,
} = require('../services/evaluatorSignedDownloadPolicy');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../services/evaluatorResultWriterDryRun');
const { buildEvaluatorResultAccessPolicyReadiness } = require('../services/evaluatorResultAccessPolicy');
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

describe('evaluator signed download policy', () => {
  test('builds a public policy-only readiness contract without signing claims', () => {
    const readiness = buildEvaluatorSignedDownloadPolicyReadiness(new Date('2026-07-09T05:50:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'evaluator_signed_download_policy_readiness',
      version: 'dcp.evaluator_signed_download_policy.v1',
      current_mode: 'signed_download_policy_contract_only',
      endpoints: {
        signed_download_readiness: 'GET /api/evals/results/downloads/readiness',
        result_access_readiness: 'GET /api/evals/results/access/readiness',
        disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      },
      signing_policy: {
        policy_available: true,
        signed_downloads_enabled: false,
        result_endpoint_live: false,
        requires_result_access_policy: true,
        requires_artifact_policy: true,
        requires_checksum: true,
        requires_content_type: 'application/json',
        min_expiry_seconds: 60,
        max_expiry_seconds: 900,
        default_expiry_seconds: 300,
        exposes_object_store_bucket: false,
        exposes_storage_key: false,
        exposes_signed_url: false,
      },
      claim_guards: {
        policy_contract_live: true,
        signed_downloads_enabled: false,
        result_endpoint_live: false,
        disabled_result_endpoint_live: true,
        signs_download_url: false,
        exposes_signed_url: false,
        exposes_object_store_bucket: false,
        exposes_artifact_storage_key: false,
        bills_eval_jobs: false,
      },
    });
  });

  test('evaluates owned available result as would-sign while signing stays disabled', () => {
    const result = evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
      content_type: 'application/json',
      expires_in_seconds: 300,
    });

    expect(result).toMatchObject({
      valid: true,
      version: 'dcp.evaluator_signed_download_policy.v1',
      eval_job_id: 'evaljob_access001',
      renter_id: 42,
      would_sign_if_enabled: true,
      expires_in_seconds: 300,
      signed_downloads_enabled: false,
      result_endpoint_live: false,
      download_url_signed: false,
      exposes_signed_url: false,
      exposes_artifact_storage_key: false,
      result_access_policy: {
        version: 'dcp.evaluator_result_access_policy.v1',
        would_authorize_if_endpoint_enabled: true,
      },
      artifact_policy: {
        checksum_sha256: 'd'.repeat(64),
        content_type: 'application/json',
        production_writes_enabled: false,
        signed_downloads_enabled: false,
      },
      denial_code_while_disabled: 'evaluator_signed_downloads_disabled',
    });
    expect(JSON.stringify(result)).not.toContain('https://');
    expect(JSON.stringify(result)).not.toContain('"storage_key":');
  });

  test('rejects unsafe access and expiry cases before signing', () => {
    const base = {
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
      content_type: 'application/json',
    };

    expect(captureCode(() => evaluateEvaluatorSignedDownloadPolicy({
      ...base,
      requesting_renter_id: 41,
    }))).toBe('evaluator_result_owner_mismatch');
    expect(captureCode(() => evaluateEvaluatorSignedDownloadPolicy({
      ...base,
      result_available: false,
    }))).toBe('evaluator_result_not_available');
    expect(captureCode(() => evaluateEvaluatorSignedDownloadPolicy({
      ...base,
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
    }))).toBe('evaluator_artifact_storage_key_scope_invalid');
    expect(captureCode(() => evaluateEvaluatorSignedDownloadPolicy({
      ...base,
      expires_in_seconds: 901,
    }))).toBe('invalid_evaluator_signed_download_expiry');
  });

  test('links aggregate result contracts to signed download readiness', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T05:50:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T05:50:00.000Z'));
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T05:50:00.000Z'));
    const accessReadiness = buildEvaluatorResultAccessPolicyReadiness(new Date('2026-07-09T05:50:00.000Z'));

    expect(readiness.endpoints.signed_download_readiness).toBe('GET /api/evals/results/downloads/readiness');
    expect(readiness.features.eval_signed_download_policy).toMatchObject({
      status: 'signed_download_policy_contract_only',
      available: true,
      version: 'dcp.evaluator_signed_download_policy.v1',
      signed_downloads_enabled: false,
      result_endpoint_live: false,
      exposes_signed_url: false,
    });
    expect(readiness.claim_guards.eval_signed_download_policy_live).toBe(true);
    expect(workerGate.endpoints.signed_download_readiness).toBe('GET /api/evals/results/downloads/readiness');
    expect(workerGate.result_policy.signed_download_readiness_endpoint).toBe('GET /api/evals/results/downloads/readiness');
    expect(writerReadiness.endpoints.signed_download_readiness).toBe('GET /api/evals/results/downloads/readiness');
    expect(writerReadiness.writer.signed_download_policy_endpoint).toBe('GET /api/evals/results/downloads/readiness');
    expect(accessReadiness.endpoints.signed_download_readiness).toBe('GET /api/evals/results/downloads/readiness');
  });

  test('exposes signed download readiness through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/results/downloads/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_signed_download_policy_readiness',
      current_mode: 'signed_download_policy_contract_only',
      signing_policy: {
        policy_available: true,
        signed_downloads_enabled: false,
        exposes_signed_url: false,
      },
      claim_guards: {
        policy_contract_live: true,
        signs_download_url: false,
        exposes_artifact_storage_key: false,
        bills_eval_jobs: false,
      },
    });
  });
});
