#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  EVALUATOR_READINESS_VERSION,
  buildEvaluatorReadiness,
} = require('../src/services/evaluatorReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-readiness-contract-proof';
const CONTRACT = 'dcp.evaluator_readiness_contract_proof.v1';

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

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Readiness Contract Proof');
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
    readiness: report.readiness,
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
  lines.push('This proof is CI-safe and validates only the evaluator readiness');
  lines.push('contract. It does not create evaluator jobs, store datasets, run model');
  lines.push('comparisons, mutate billing, publish case studies, or enable Arabic-quality');
  lines.push('claims.');
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

function runEvaluatorReadinessContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_READINESS_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    evaluator_readiness_version: EVALUATOR_READINESS_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-readiness-contract',
    mode: 'ci_safe_readiness_contract',
    claims: {
      creates_eval_jobs: false,
      stores_customer_datasets: false,
      runs_model_comparisons: false,
      enables_arabic_quality_claims: false,
      enables_public_rankings: false,
      mutates_billing_or_settlement: false,
    },
    invariants: [],
    readiness: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T02:15:00.000Z'));
    report.readiness = readiness;

    record(
      'readiness contract is public, versioned, and linked to benchmark/schema surfaces',
      readiness.object === 'evaluator_readiness'
        && readiness.version === EVALUATOR_READINESS_VERSION
        && readiness.endpoints.readiness === 'GET /api/evals/readiness'
        && readiness.endpoints.job_schema === 'GET /api/evals/jobs/schema'
        && readiness.endpoints.benchmark_readiness === 'GET /api/models/benchmarks/readiness'
        && readiness.endpoints.product_page === 'GET /benchmarks',
      'The evaluator readiness contract is discoverable without implying job execution.',
    );

    record(
      'evaluator job metadata API is visible while worker/result APIs remain unavailable',
      readiness.features.eval_job_schema.available === true
        && readiness.features.eval_job_schema.schema_endpoint === 'GET /api/evals/jobs/schema'
        && readiness.features.eval_job_schema.creates_metadata_only === true
        && readiness.features.eval_job_schema.runs_worker === false
        && readiness.features.eval_job_api.status === 'metadata_records_live_worker_blocked'
        && readiness.features.eval_job_api.available === true
        && readiness.features.eval_job_api.create_endpoint === 'POST /api/evals/jobs'
        && readiness.features.eval_job_api.list_endpoint === 'GET /api/evals/jobs'
        && readiness.features.eval_job_api.read_endpoint === 'GET /api/evals/jobs/:id'
        && readiness.features.eval_job_api.result_endpoint === null,
      'Metadata create/list/read endpoints are live, but no worker or result endpoint is exposed.',
    );

    record(
      'evaluator result and worker execution remain unavailable while artifact policy is read-only',
      readiness.features.eval_job_api.result_endpoint === null
        && readiness.features.eval_job_api.required_before_enablement.includes('worker disabled-by-default guard')
        && readiness.features.eval_result_artifact_storage.available === true
        && readiness.features.eval_result_artifact_storage.production_writes_enabled === false
        && readiness.features.eval_result_artifact_storage.signed_downloads_enabled === false,
      'Metadata and policy endpoints are live, but result downloads, artifact writes, and worker execution remain disabled.',
    );

    record(
      'dataset, baseline, report, and billing gates stay closed',
      readiness.features.dataset_artifacts.available === false
        && readiness.features.dataset_artifacts.raw_dataset_publication === false
        && readiness.features.baseline_comparison.frontier_model_comparison_allowed === false
        && readiness.features.public_reports.case_study_allowed === false
        && readiness.features.public_reports.ranking_allowed === false
        && readiness.features.billing_policy.bills_eval_jobs === false,
      'Evaluator artifacts, comparisons, reports, rankings, and billing remain blocked.',
    );

    record(
      'public benchmark and quality claims remain false',
      readiness.claim_guards.eval_jobs_live === false
        && readiness.claim_guards.arabic_quality_claim_allowed === false
        && readiness.claim_guards.customer_case_study_allowed === false
        && readiness.claim_guards.model_ranking_allowed === false
        && readiness.claim_guards.frontier_model_comparison_allowed === false
        && readiness.claim_guards.bills_eval_jobs === false,
      'Readiness metadata cannot be interpreted as a live eval or quality claim.',
    );

    record(
      'proof itself performs no runtime or money mutation',
      report.claims.creates_eval_jobs === false
        && report.claims.stores_customer_datasets === false
        && report.claims.runs_model_comparisons === false
        && report.claims.enables_arabic_quality_claims === false
        && report.claims.enables_public_rankings === false
        && report.claims.mutates_billing_or_settlement === false,
      'The proof is a pure contract check.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_readiness_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorReadinessContractProof();
  console.log(`Evaluator readiness contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator readiness contract proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorReadinessContractProof,
};
