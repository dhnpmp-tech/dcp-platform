'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runEvaluatorResultWriterDryRunProof,
} = require('../../tests/evaluator-result-writer-dry-run-proof');

describe('evaluator result writer dry-run proof script', () => {
  test('writes a CI-safe proof report and temp manifest artifact', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-result-writer-proof-'));
    const report = runEvaluatorResultWriterDryRunProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      mutates_production_db: false,
      writes_temp_manifest: true,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      stores_raw_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    });
    expect(report.writer_readiness).toMatchObject({
      endpoints: {
        writer_readiness: 'GET /api/evals/results/writer/readiness',
      },
      writer: {
        dry_run_available: true,
        production_writer_enabled: false,
        result_endpoint_live: false,
      },
      claim_guards: {
        writes_temp_artifact: true,
        writes_production_artifact: false,
      },
    });
    expect(report.dry_run).toMatchObject({
      eval_job_id: 'evaljob_writer001',
      manifest: {
        eval_job_id: 'evaljob_writer001',
        dataset_sha256: 'a1'.repeat(32),
      },
      temp_artifact: {
        exists: true,
      },
      production_effects: {
        writes_production_artifact: false,
        mutates_eval_job_status: false,
      },
    });
    expect(report.invalid_cases).toMatchObject({
      raw_summary: { rejected: true, code: 'raw_summary_field_forbidden' },
      invalid_metric: { rejected: true, code: 'unsupported_result_manifest_metric' },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'writer readiness is public and dry-run only',
      'dry run writes a validated manifest to temporary proof storage only',
      'raw summaries and invalid metrics are rejected before writing',
      'readiness worker gate and manifest contract link the dry-run writer',
      'proof performs no production runtime result or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-writer-dry-run-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'evaluator-result-writer-dry-run-proof-latest.md'))).toBe(true);
  });
});
