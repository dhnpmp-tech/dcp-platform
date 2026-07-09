'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorResultAccessPolicyProof,
} = require('../../tests/evaluator-result-access-policy-proof');

describe('evaluator result access policy proof script', () => {
  test('writes a CI-safe access report without result endpoint or download side effects', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-access-policy-proof-'));
    const report = runEvaluatorResultAccessPolicyProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      policy_contract_live: true,
      exposes_result_endpoint: false,
      signs_download_url: false,
      allows_cross_renter_access: false,
      configures_object_store: false,
      writes_production_artifact: false,
      stores_raw_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.result_access_readiness).toMatchObject({
      endpoints: {
        result_access_readiness: 'GET /api/evals/results/access/readiness',
      },
      access_policy: {
        policy_available: true,
        result_endpoint_live: false,
        signed_downloads_enabled: false,
        renter_auth_required: true,
        renter_owner_match_required: true,
        result_available_required: true,
        artifact_policy_required: true,
      },
      claim_guards: {
        policy_contract_live: true,
        exposes_result_endpoint: false,
        signs_download_url: false,
        allows_cross_renter_access: false,
        bills_eval_jobs: false,
      },
    });
    expect(report.valid_access).toMatchObject({
      valid: true,
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
    expect(report.invalid_cases).toMatchObject({
      wrong_owner: { rejected: true, code: 'evaluator_result_owner_mismatch' },
      result_unavailable: { rejected: true, code: 'evaluator_result_not_available' },
      invalid_artifact_scope: { rejected: true, code: 'evaluator_artifact_storage_key_scope_invalid' },
    });
    expect(report.linked_contracts).toMatchObject({
      evaluator_readiness: {
        endpoint: 'GET /api/evals/results/access/readiness',
        claim_guard: true,
      },
      worker_gate: {
        endpoint: 'GET /api/evals/results/access/readiness',
        result_policy_endpoint: 'GET /api/evals/results/access/readiness',
      },
      result_manifest: {
        endpoint: 'GET /api/evals/results/access/readiness',
      },
      result_writer: {
        endpoint: 'GET /api/evals/results/access/readiness',
        policy_endpoint: 'GET /api/evals/results/access/readiness',
      },
      artifact_storage: {
        endpoint: 'GET /api/evals/results/access/readiness',
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'result access readiness is public and policy-only',
      'owned available result would authorize only if endpoint were enabled',
      'wrong owner unavailable result and invalid artifact are rejected',
      'readiness writer manifest worker and artifact policy contracts link the access endpoint',
      'proof exposes no result endpoint download or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-access-policy-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-access-policy-proof-latest.md'))).toBe(true);
  });
});
