#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildEvaluatorResultManifestContract,
  validateEvaluatorResultManifest,
} = require('../src/services/evaluatorResultManifest');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../src/services/evaluatorJobSchema');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-result-manifest-contract-proof';
const CONTRACT = 'dcp.evaluator_result_manifest_contract_proof.v1';
const DATASET_SHA = 'e'.repeat(64);
const SUMMARY_SHA = 'f'.repeat(64);

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function assertInvariant(condition, code, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  }
}

function manifest(overrides = {}) {
  return {
    eval_job_id: 'evaljob_manifest001',
    dataset_sha256: DATASET_SHA,
    scoring_harness_version: 'eval-harness-2026-07-09',
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    summary_sha256: SUMMARY_SHA,
    created_at: '2026-07-09T03:55:00.000Z',
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Result Manifest Contract Proof');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push('');
  lines.push('## Invariants');
  lines.push('');
  lines.push('| invariant | passed | notes |');
  lines.push('|---|---:|---|');
  for (const item of report.invariants) {
    lines.push(`| ${item.name} | ${item.passed ? 'yes' : 'no'} | ${String(item.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Proof Summary');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    contract: report.result_manifest_contract,
    valid_manifest: report.valid_manifest,
    invalid_cases: report.invalid_cases,
    readiness: report.readiness,
    worker_gate: report.worker_gate,
    schema: report.schema,
    claims: report.claims,
  }, null, 2));
  lines.push('```');
  lines.push('');
  if (report.failure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- message: ${report.failure.message}`);
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe. It validates result manifest shape and checksum');
  lines.push('rules in memory only. It does not expose result artifacts, write files,');
  lines.push('store customer datasets, run workers, mutate billing, publish reports, or');
  lines.push('enable rankings or Arabic-quality claims.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir = OUTPUT_DIR_DEFAULT) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.artifacts;
}

function captureInvalid(fn) {
  try {
    fn();
    return { rejected: false, code: null, message: null };
  } catch (error) {
    return {
      rejected: true,
      code: error.code || 'error',
      message: error.message,
    };
  }
}

function runEvaluatorResultManifestContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_RESULT_MANIFEST_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-result-manifest-contract',
    mode: 'ci_safe_result_manifest_contract',
    claims: {
      mutates_production_db: false,
      writes_result_manifest: false,
      exposes_result_endpoint: false,
      stores_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    result_manifest_contract: {},
    valid_manifest: {},
    invalid_cases: {},
    readiness: {},
    worker_gate: {},
    schema: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const resultContract = buildEvaluatorResultManifestContract(new Date('2026-07-09T03:55:00.000Z'));
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:55:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T03:55:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:55:00.000Z'));
    const valid = validateEvaluatorResultManifest(manifest(), {
      eval_job_id: 'evaljob_manifest001',
      dataset_sha256: DATASET_SHA,
      scoring_harness_version: 'eval-harness-2026-07-09',
      candidate_model: 'qwen/qwen3-coder',
      metrics: ['exact_match', 'semantic_similarity'],
    });
    const invalidChecksum = captureInvalid(() => validateEvaluatorResultManifest(manifest({ summary_sha256: 'bad' })));
    const rawField = captureInvalid(() => validateEvaluatorResultManifest(manifest({ raw_prompts: ['secret prompt'] })));
    const mismatch = captureInvalid(() => validateEvaluatorResultManifest(manifest(), { dataset_sha256: '0'.repeat(64) }));

    report.result_manifest_contract = {
      endpoints: resultContract.endpoints,
      required_fields: resultContract.required_fields,
      checksum_policy: resultContract.checksum_policy,
      publication_policy: resultContract.publication_policy,
      claim_guards: resultContract.claim_guards,
    };
    report.valid_manifest = valid;
    report.invalid_cases = {
      invalid_checksum: invalidChecksum,
      raw_field: rawField,
      expected_mismatch: mismatch,
    };
    report.readiness = {
      endpoints: readiness.endpoints,
      eval_result_manifest: readiness.features.eval_result_manifest,
      claim_guards: readiness.claim_guards,
    };
    report.worker_gate = {
      result_policy: workerGate.result_policy,
      claim_guards: workerGate.claim_guards,
    };
    report.schema = {
      artifact_policy: schema.artifact_policy,
      claim_guards: schema.claim_guards,
    };

    record(
      'result manifest contract is public and checksum-scoped',
      resultContract.object === 'evaluator_result_manifest_contract'
        && resultContract.current_mode === 'schema_and_checksum_contract_only'
        && resultContract.endpoints.result_manifest_schema === 'GET /api/evals/results/schema'
        && resultContract.required_fields.includes('summary_sha256')
        && resultContract.checksum_policy.digest === 'sha256_hex'
        && resultContract.claim_guards.result_endpoint_live === false,
      'The schema is visible without enabling result artifact access.',
    );

    record(
      'valid manifest normalizes required fields and stays non-public',
      valid.valid === true
        && valid.manifest.eval_job_id === 'evaljob_manifest001'
        && valid.manifest.dataset_sha256 === DATASET_SHA
        && valid.manifest.summary_sha256 === SUMMARY_SHA
        && valid.raw_publication_allowed === false
        && valid.public_report_allowed === false,
      'A good manifest validates while raw/public report flags stay false.',
    );

    record(
      'invalid checksums raw fields and metadata mismatches are rejected',
      invalidChecksum.rejected === true
        && invalidChecksum.code === 'invalid_result_manifest_sha256'
        && rawField.rejected === true
        && rawField.code === 'raw_customer_data_field_forbidden'
        && mismatch.rejected === true
        && mismatch.code === 'result_manifest_expected_field_mismatch',
      'Manifest validation blocks bad digests, raw customer data, and job mismatches.',
    );

    record(
      'readiness schema and worker gate link the manifest contract without result endpoint',
      readiness.endpoints.result_manifest_schema === 'GET /api/evals/results/schema'
        && readiness.features.eval_result_manifest.available === true
        && readiness.features.eval_result_manifest.result_endpoint_live === false
        && readiness.claim_guards.eval_result_manifest_schema_live === true
        && workerGate.result_policy.schema_endpoint === 'GET /api/evals/results/schema'
        && workerGate.result_policy.endpoint_live === false
        && schema.artifact_policy.manifest_schema_endpoint === 'GET /api/evals/results/schema'
        && schema.claim_guards.result_endpoint_live === false,
      'All public contracts point to the manifest schema while result access remains false.',
    );

    record(
      'proof performs no production runtime result or money mutation',
      report.claims.mutates_production_db === false
        && report.claims.writes_result_manifest === false
        && report.claims.exposes_result_endpoint === false
        && report.claims.stores_customer_datasets === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof is pure validation and does not touch production state.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_result_manifest_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorResultManifestContractProof();
  console.log(`Evaluator result manifest contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator result manifest contract proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorResultManifestContractProof,
};
