'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorResultManifestContractProof,
} = require('../../tests/evaluator-result-manifest-contract-proof');

describe('evaluator result manifest contract proof script', () => {
  test('writes a CI-safe proof report for result manifest checksums', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-manifest-proof-'));
    const report = runEvaluatorResultManifestContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      mutates_production_db: false,
      writes_result_manifest: false,
      exposes_result_endpoint: false,
      stores_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.result_manifest_contract).toMatchObject({
      endpoints: {
        result_manifest_schema: 'GET /api/evals/results/schema',
      },
      checksum_policy: {
        digest: 'sha256_hex',
      },
      claim_guards: {
        result_endpoint_live: false,
        validates_manifest_only: true,
        writes_result_manifest: false,
      },
    });
    expect(report.valid_manifest).toMatchObject({
      valid: true,
      raw_publication_allowed: false,
      public_report_allowed: false,
      manifest: {
        eval_job_id: 'evaljob_manifest001',
        dataset_sha256: 'e'.repeat(64),
        summary_sha256: 'f'.repeat(64),
      },
    });
    expect(report.invalid_cases).toMatchObject({
      invalid_checksum: { rejected: true, code: 'invalid_result_manifest_sha256' },
      raw_field: { rejected: true, code: 'raw_customer_data_field_forbidden' },
      expected_mismatch: { rejected: true, code: 'result_manifest_expected_field_mismatch' },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'result manifest contract is public and checksum-scoped',
      'valid manifest normalizes required fields and stays non-public',
      'invalid checksums raw fields and metadata mismatches are rejected',
      'readiness schema and worker gate link the manifest contract without result endpoint',
      'proof performs no production runtime result or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-manifest-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-manifest-contract-proof-latest.md'))).toBe(true);
  });
});
