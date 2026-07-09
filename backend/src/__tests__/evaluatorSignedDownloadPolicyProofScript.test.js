'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorSignedDownloadPolicyProof,
} = require('../../tests/evaluator-signed-download-policy-proof');

describe('evaluator signed download policy proof script', () => {
  test('writes a CI-safe signing policy report without URL or storage side effects', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-signed-download-policy-proof-'));
    const report = runEvaluatorSignedDownloadPolicyProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      policy_contract_live: true,
      signed_downloads_enabled: false,
      exposes_signed_url: false,
      exposes_object_store_bucket: false,
      exposes_artifact_storage_key: false,
      configures_object_store: false,
      writes_production_artifact: false,
      exposes_live_result_endpoint: false,
      starts_worker: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.signed_download_readiness).toMatchObject({
      endpoints: {
        signed_download_readiness: 'GET /api/evals/results/downloads/readiness',
      },
      signing_policy: {
        policy_available: true,
        signed_downloads_enabled: false,
        result_endpoint_live: false,
        requires_result_access_policy: true,
        requires_artifact_policy: true,
        requires_checksum: true,
        exposes_signed_url: false,
      },
      claim_guards: {
        policy_contract_live: true,
        signed_downloads_enabled: false,
        signs_download_url: false,
        exposes_artifact_storage_key: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.valid_policy).toMatchObject({
      valid: true,
      would_sign_if_enabled: true,
      expires_in_seconds: 300,
      signed_downloads_enabled: false,
      result_endpoint_live: false,
      download_url_signed: false,
      exposes_signed_url: false,
      exposes_artifact_storage_key: false,
      denial_code_while_disabled: 'evaluator_signed_downloads_disabled',
    });
    expect(JSON.stringify(report.valid_policy)).not.toContain('https://');
    expect(JSON.stringify(report.valid_policy)).not.toContain('"storage_key":');
    expect(report.invalid_cases).toMatchObject({
      wrong_owner: { rejected: true, code: 'evaluator_result_owner_mismatch' },
      result_unavailable: { rejected: true, code: 'evaluator_result_not_available' },
      invalid_artifact_scope: { rejected: true, code: 'evaluator_artifact_storage_key_scope_invalid' },
      invalid_expiry: { rejected: true, code: 'invalid_evaluator_signed_download_expiry' },
    });
    expect(report.linked_contracts).toMatchObject({
      evaluator_readiness: {
        endpoint: 'GET /api/evals/results/downloads/readiness',
        claim_guard: true,
      },
      worker_gate: {
        result_policy_endpoint: 'GET /api/evals/results/downloads/readiness',
      },
      result_writer: {
        policy_endpoint: 'GET /api/evals/results/downloads/readiness',
      },
      result_access: {
        endpoint: 'GET /api/evals/results/downloads/readiness',
        policy_live: true,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'signed download readiness is public and policy-only',
      'owned available result would sign only if signing were enabled',
      'wrong owner unavailable result invalid artifact and expiry are rejected',
      'readiness worker writer and access contracts link signed download policy',
      'proof exposes no signed URL storage key runtime or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-signed-download-policy-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-signed-download-policy-proof-latest.md'))).toBe(true);
  });
});
