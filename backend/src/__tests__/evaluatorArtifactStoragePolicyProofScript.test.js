'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorArtifactStoragePolicyProof,
} = require('../../tests/evaluator-artifact-storage-policy-proof');

describe('evaluator artifact storage policy proof script', () => {
  test('writes a CI-safe policy report without storage or download side effects', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-artifact-policy-proof-'));
    const report = runEvaluatorArtifactStoragePolicyProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      policy_contract_live: true,
      configures_object_store: false,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      signs_download_url: false,
      stores_raw_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.artifact_storage_readiness).toMatchObject({
      endpoints: {
        artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      },
      storage_policy: {
        policy_available: true,
        production_artifact_store_enabled: false,
        production_writes_enabled: false,
        signed_downloads_enabled: false,
      },
      claim_guards: {
        policy_contract_live: true,
        production_writes_enabled: false,
        exposes_result_endpoint: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.valid_policy).toMatchObject({
      valid: true,
      storage_key: 'eval-results/renter-42/evaljob_artifact001/result-manifest.json',
      checksum_sha256: 'c'.repeat(64),
      production_writes_enabled: false,
      signed_downloads_enabled: false,
      result_endpoint_live: false,
    });
    expect(report.invalid_cases).toMatchObject({
      wrong_renter: { rejected: true, code: 'evaluator_artifact_storage_key_scope_invalid' },
      wrong_eval_job: { rejected: true, code: 'evaluator_artifact_storage_key_scope_invalid' },
      path_traversal: { rejected: true, code: 'invalid_evaluator_artifact_storage_key' },
      invalid_checksum: { rejected: true, code: 'invalid_evaluator_artifact_checksum' },
    });
    expect(report.linked_contracts).toMatchObject({
      evaluator_readiness: {
        endpoint: 'GET /api/evals/results/artifacts/readiness',
        claim_guard: true,
      },
      worker_gate: {
        endpoint: 'GET /api/evals/results/artifacts/readiness',
        result_policy_endpoint: 'GET /api/evals/results/artifacts/readiness',
      },
      result_manifest: {
        endpoint: 'GET /api/evals/results/artifacts/readiness',
      },
      result_writer: {
        endpoint: 'GET /api/evals/results/artifacts/readiness',
        policy_endpoint: 'GET /api/evals/results/artifacts/readiness',
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'artifact storage readiness is public and policy-only',
      'valid artifact policy requires renter job checksum and manifest filename scope',
      'unscoped traversal and invalid checksum cases are rejected',
      'readiness writer manifest and worker contracts link the policy endpoint',
      'proof performs no production artifact download or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-artifact-storage-policy-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-artifact-storage-policy-proof-latest.md'))).toBe(true);
  });
});
