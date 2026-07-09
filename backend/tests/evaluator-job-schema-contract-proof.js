#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  EVALUATOR_JOB_SCHEMA_VERSION,
  buildEvaluatorJobSchema,
} = require('../src/services/evaluatorJobSchema');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-job-schema-contract-proof';
const CONTRACT = 'dcp.evaluator_job_schema_contract_proof.v1';

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
  lines.push('# Evaluator Job Schema Contract Proof');
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
    schema: report.schema,
    readiness_link: report.readiness_link,
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
  lines.push('This proof is CI-safe. It validates the public evaluator job schema');
  lines.push('contract and the link from evaluator readiness to that schema. It does');
  lines.push('not create eval jobs, store datasets, run workers, compare models, mutate');
  lines.push('billing, publish reports, or enable Arabic-quality claims.');
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

function runEvaluatorJobSchemaContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_JOB_SCHEMA_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    evaluator_job_schema_version: EVALUATOR_JOB_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-job-schema-contract',
    mode: 'ci_safe_schema_contract',
    claims: {
      creates_eval_jobs: false,
      stores_customer_datasets: false,
      runs_eval_worker: false,
      runs_model_comparisons: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    schema: {},
    readiness_link: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:05:00.000Z'));
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:05:00.000Z'));
    report.schema = schema;
    report.readiness_link = {
      readiness_endpoint: readiness.endpoints?.readiness || null,
      schema_endpoint: readiness.endpoints?.job_schema || null,
      schema_feature: readiness.features?.eval_job_schema || null,
      eval_job_api: readiness.features?.eval_job_api || null,
    };

    record(
      'schema contract is public, versioned, and linked from readiness',
      schema.object === 'evaluator_job_schema_contract'
        && schema.version === EVALUATOR_JOB_SCHEMA_VERSION
        && schema.current_mode === 'schema_contract_only'
        && schema.endpoints.schema === 'GET /api/evals/jobs/schema'
        && readiness.endpoints.job_schema === 'GET /api/evals/jobs/schema'
        && readiness.features.eval_job_schema.available === true
        && readiness.features.eval_job_schema.creates_metadata_only === true,
      'The schema is discoverable without implying evaluator job creation.',
    );

    record(
      'request schema has tenant-safe dataset and scoring requirements',
      schema.request_schema.required.includes('dataset.sha256')
        && schema.request_schema.required.includes('candidate_model')
        && schema.request_schema.required.includes('metrics')
        && schema.request_schema.fields.dataset.raw_publication_allowed === false
        && schema.request_schema.fields.dataset.redaction_review_required === true
        && schema.scoring_harness.version_required === true
        && schema.scoring_harness.deterministic_seed_required === true,
      'Eval jobs require checksummed datasets, model identity, metrics, harness version, and redaction review.',
    );

    record(
      'metadata endpoints are live while worker result endpoint remains non-live',
      readiness.features.eval_job_api.available === true
        && readiness.features.eval_job_api.create_endpoint === 'POST /api/evals/jobs'
        && readiness.features.eval_job_api.list_endpoint === 'GET /api/evals/jobs'
        && readiness.features.eval_job_api.read_endpoint === 'GET /api/evals/jobs/:id'
        && readiness.features.eval_job_api.result_endpoint === null
        && schema.claim_guards.create_endpoint_live === true
        && schema.claim_guards.list_endpoint_live === true
        && schema.claim_guards.read_endpoint_live === true
        && schema.claim_guards.metadata_only === true
        && schema.claim_guards.result_endpoint_live === false,
      'The schema exposes metadata APIs without exposing result artifacts or workers.',
    );

    record(
      'worker, billing, reports, and quality claims remain blocked',
      schema.scoring_harness.worker_enabled === false
        && schema.billing_policy.bills_eval_jobs === false
        && schema.claim_guards.worker_enabled === false
        && schema.claim_guards.bills_eval_jobs === false
        && schema.claim_guards.public_report_allowed === false
        && schema.claim_guards.arabic_quality_claim_allowed === false
        && schema.claim_guards.model_ranking_allowed === false
        && schema.claim_guards.frontier_model_comparison_allowed === false,
      'No worker execution, billing, reports, rankings, or public comparison claims are enabled.',
    );

    record(
      'proof performs no runtime or money mutation',
      report.claims.creates_eval_jobs === false
        && report.claims.stores_customer_datasets === false
        && report.claims.runs_eval_worker === false
        && report.claims.runs_model_comparisons === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof is a pure schema/readiness check.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_job_schema_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorJobSchemaContractProof();
  console.log(`Evaluator job schema contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator job schema contract proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorJobSchemaContractProof,
};
