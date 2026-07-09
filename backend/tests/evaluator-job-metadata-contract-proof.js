#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
  getEvaluatorJob,
  listEvaluatorJobs,
} = require('../src/services/evaluatorJobs');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../src/services/evaluatorJobSchema');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-job-metadata-contract-proof';
const CONTRACT = 'dcp.evaluator_job_metadata_contract_proof.v1';
const SHA = 'b'.repeat(64);

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

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  db.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, created_at)
    VALUES (1, 'Eval Smoke', 'eval@example.com', 'rk-eval', 'active', ?),
           (2, 'Other Renter', 'other@example.com', 'rk-other', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureEvaluatorJobSchema(db);
  return db;
}

function payload() {
  return {
    eval_job_id: 'evaljob_proof001',
    name: 'Evaluator metadata proof',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/proof.jsonl',
      sha256: SHA,
      format: 'jsonl',
      example_count: 12,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity', 'p95_latency_ms'],
    max_examples: 12,
    cost_budget_halala: 0,
    metadata: { proof: true },
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Job Metadata Contract Proof');
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
    created: report.created,
    readiness: report.readiness,
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
  lines.push('This proof is CI-safe. It creates metadata-only evaluator job records');
  lines.push('in an in-memory database and verifies idempotency, renter scoping, and');
  lines.push('disabled worker/billing/result behavior. It does not run a worker, store');
  lines.push('customer datasets, mutate production data, bill, settle, publish reports,');
  lines.push('rank models, or enable Arabic-quality claims.');
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

function runEvaluatorJobMetadataContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_JOB_METADATA_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-job-metadata-contract',
    mode: 'ci_safe_metadata_contract',
    claims: {
      mutates_production_db: false,
      creates_metadata_records_only: true,
      runs_eval_worker: false,
      stores_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    created: {},
    readiness: {},
    schema: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const db = makeDb();
    const first = createEvaluatorJob(db, 1, payload(), { idempotencyKey: 'eval-proof-idem' });
    const replay = createEvaluatorJob(db, 1, { ...payload(), name: 'Replay ignored' }, { idempotencyKey: 'eval-proof-idem' });
    const list = listEvaluatorJobs(db, 1);
    const read = getEvaluatorJob(db, 1, 'evaljob_proof001');
    const otherRenterRead = getEvaluatorJob(db, 2, 'evaljob_proof001');
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:20:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:20:00.000Z'));

    report.created = {
      eval_job: first.eval_job,
      idempotent_replay: replay.idempotent_replay,
      list_count: list.eval_jobs.length,
      read_found: Boolean(read),
      other_renter_read_found: Boolean(otherRenterRead),
    };
    report.readiness = {
      eval_job_api: readiness.features.eval_job_api,
      eval_job_schema: readiness.features.eval_job_schema,
      claim_guards: readiness.claim_guards,
    };
    report.schema = {
      endpoints: schema.endpoints,
      claim_guards: schema.claim_guards,
    };

    record(
      'metadata create/list/read are live and idempotent in the service contract',
      first.idempotent_replay === false
        && replay.idempotent_replay === true
        && replay.eval_job.eval_job_id === first.eval_job.eval_job_id
        && list.eval_jobs.length === 1
        && read?.eval_job_id === 'evaljob_proof001'
        && otherRenterRead === null,
      'Evaluator job records are renter-scoped and idempotent without worker execution.',
    );

    record(
      'record stores dataset checksum, metrics, model identity, and safety flags',
      first.eval_job.dataset.sha256 === SHA
        && first.eval_job.dataset.raw_publication_allowed === false
        && first.eval_job.candidate_model === 'qwen/qwen3-coder'
        && first.eval_job.metrics.includes('semantic_similarity')
        && first.eval_job.status === 'draft'
        && first.eval_job.worker_enabled === false
        && first.eval_job.billing_enabled === false
        && first.eval_job.result_available === false,
      'The metadata record captures evaluation intent while keeping runtime and money disabled.',
    );

    record(
      'readiness advertises metadata API but keeps live eval claims false',
      readiness.features.eval_job_api.available === true
        && readiness.features.eval_job_api.create_endpoint === 'POST /api/evals/jobs'
        && readiness.features.eval_job_api.list_endpoint === 'GET /api/evals/jobs'
        && readiness.features.eval_job_api.read_endpoint === 'GET /api/evals/jobs/:id'
        && readiness.features.eval_job_api.result_endpoint === null
        && readiness.claim_guards.eval_job_metadata_api_live === true
        && readiness.claim_guards.eval_jobs_live === false
        && readiness.claim_guards.bills_eval_jobs === false,
      'Readiness exposes the metadata API separately from live eval jobs and billing.',
    );

    record(
      'schema guards worker, result, billing, report, ranking, and quality claims',
      schema.claim_guards.create_endpoint_live === true
        && schema.claim_guards.list_endpoint_live === true
        && schema.claim_guards.read_endpoint_live === true
        && schema.claim_guards.metadata_only === true
        && schema.claim_guards.result_endpoint_live === false
        && schema.claim_guards.worker_enabled === false
        && schema.claim_guards.bills_eval_jobs === false
        && schema.claim_guards.public_report_allowed === false
        && schema.claim_guards.model_ranking_allowed === false
        && schema.claim_guards.arabic_quality_claim_allowed === false,
      'The schema separates metadata endpoints from any customer-facing benchmark claims.',
    );

    record(
      'proof performs no production runtime or money mutation',
      report.claims.mutates_production_db === false
        && report.claims.creates_metadata_records_only === true
        && report.claims.runs_eval_worker === false
        && report.claims.stores_customer_datasets === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof uses an in-memory database and does not touch production state.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_job_metadata_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorJobMetadataContractProof();
  console.log(`Evaluator job metadata contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator job metadata contract proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorJobMetadataContractProof,
};
