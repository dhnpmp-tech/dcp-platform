'use strict';

const express = require('express');
const request = require('supertest');
const {
  buildEvaluatorArtifactStoragePolicyReadiness,
  buildEvaluatorResultArtifactStorageKey,
  validateEvaluatorArtifactStoragePolicy,
} = require('../services/evaluatorArtifactStoragePolicy');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../services/evaluatorResultWriterDryRun');
const { buildEvaluatorResultManifestContract } = require('../services/evaluatorResultManifest');
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

describe('evaluator artifact storage policy', () => {
  test('builds a public policy-only readiness contract without storage claims', () => {
    const readiness = buildEvaluatorArtifactStoragePolicyReadiness(new Date('2026-07-09T04:45:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'evaluator_artifact_storage_policy_readiness',
      version: 'dcp.evaluator_artifact_storage_policy.v1',
      current_mode: 'policy_contract_only',
      endpoints: {
        artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
        result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      },
      storage_policy: {
        policy_available: true,
        production_artifact_store_enabled: false,
        signed_downloads_enabled: false,
        production_writes_enabled: false,
        default_key_template: 'eval-results/renter-{renter_id}/{eval_job_id}/result-manifest.json',
        requires_renter_scope: true,
        requires_eval_job_scope: true,
        requires_sha256: true,
        raw_dataset_storage_allowed: false,
      },
      claim_guards: {
        policy_contract_live: true,
        production_artifact_store_enabled: false,
        production_writes_enabled: false,
        signed_downloads_enabled: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
        arabic_quality_claim_allowed: false,
      },
    });
  });

  test('builds and validates a renter/job-scoped result manifest key', () => {
    const storageKey = buildEvaluatorResultArtifactStorageKey({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
    });
    const validation = validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: storageKey,
      checksum_sha256: 'c'.repeat(64),
      content_type: 'application/json',
    });

    expect(storageKey).toBe('eval-results/renter-42/evaljob_artifact001/result-manifest.json');
    expect(validation).toMatchObject({
      valid: true,
      version: 'dcp.evaluator_artifact_storage_policy.v1',
      artifact_kind: 'result_manifest',
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: 'eval-results/renter-42/evaljob_artifact001/result-manifest.json',
      checksum_sha256: 'c'.repeat(64),
      content_type: 'application/json',
      required_prefix: 'eval-results/renter-42/evaljob_artifact001/',
      production_artifact_store_enabled: false,
      production_writes_enabled: false,
      signed_downloads_enabled: false,
      raw_storage_allowed: false,
      result_endpoint_live: false,
    });
  });

  test('rejects unscoped keys path traversal wrong filenames and invalid checksums', () => {
    const base = {
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      checksum_sha256: 'c'.repeat(64),
    };

    expect(() => validateEvaluatorArtifactStoragePolicy({
      ...base,
      storage_key: 'eval-results/renter-43/evaljob_artifact001/result-manifest.json',
    })).toThrow(/scoped/);

    expect(() => validateEvaluatorArtifactStoragePolicy({
      ...base,
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
    })).toThrow(/scoped/);

    expect(() => validateEvaluatorArtifactStoragePolicy({
      ...base,
      storage_key: '../eval-results/renter-42/evaljob_artifact001/result-manifest.json',
    })).toThrow(/relative object key/);

    expect(() => validateEvaluatorArtifactStoragePolicy({
      ...base,
      storage_key: 'eval-results/renter-42/evaljob_artifact001/report.json',
    })).toThrow(/approved manifest filename/);

    expect(() => validateEvaluatorArtifactStoragePolicy({
      ...base,
      checksum_sha256: 'nope',
    })).toThrow(/SHA-256/);
  });

  test('links aggregate readiness writer manifest and worker gate to the artifact policy', () => {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T04:45:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T04:45:00.000Z'));
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T04:45:00.000Z'));
    const manifestContract = buildEvaluatorResultManifestContract(new Date('2026-07-09T04:45:00.000Z'));

    expect(readiness.endpoints.result_artifact_storage_readiness).toBe('GET /api/evals/results/artifacts/readiness');
    expect(readiness.features.eval_result_artifact_storage).toMatchObject({
      status: 'policy_contract_only',
      available: true,
      version: 'dcp.evaluator_artifact_storage_policy.v1',
      production_artifact_store_enabled: false,
      production_writes_enabled: false,
      signed_downloads_enabled: false,
    });
    expect(readiness.claim_guards.eval_result_artifact_storage_policy_live).toBe(true);
    expect(workerGate.endpoints.artifact_storage_readiness).toBe('GET /api/evals/results/artifacts/readiness');
    expect(workerGate.result_policy.artifact_storage_readiness_endpoint).toBe('GET /api/evals/results/artifacts/readiness');
    expect(writerReadiness.endpoints.artifact_storage_readiness).toBe('GET /api/evals/results/artifacts/readiness');
    expect(writerReadiness.writer.artifact_storage_policy_endpoint).toBe('GET /api/evals/results/artifacts/readiness');
    expect(manifestContract.endpoints.artifact_storage_readiness).toBe('GET /api/evals/results/artifacts/readiness');
  });

  test('exposes artifact storage readiness through a public read-only route', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/evals/results/artifacts/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'evaluator_artifact_storage_policy_readiness',
      current_mode: 'policy_contract_only',
      storage_policy: {
        policy_available: true,
        production_artifact_store_enabled: false,
        signed_downloads_enabled: false,
      },
      claim_guards: {
        policy_contract_live: true,
        production_writes_enabled: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
      },
    });
  });
});
