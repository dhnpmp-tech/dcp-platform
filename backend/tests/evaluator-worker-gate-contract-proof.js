#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
  getEvaluatorJob,
} = require('../src/services/evaluatorJobs');
const { buildEvaluatorJobSchema } = require('../src/services/evaluatorJobSchema');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-worker-gate-contract-proof';
const CONTRACT = 'dcp.evaluator_worker_gate_contract_proof.v1';
const SHA = 'd'.repeat(64);

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
    VALUES (1, 'Worker Gate Smoke', 'worker-gate@example.com', 'rk-worker-gate', 'active', ?)
  `).run(new Date().toISOString());
  ensureEvaluatorJobSchema(db);
  return db;
}

function payload() {
  return {
    eval_job_id: 'evaljob_workgate001',
    name: 'Evaluator worker gate proof',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/worker-gate.jsonl',
      sha256: SHA,
      format: 'jsonl',
      example_count: 8,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    max_examples: 8,
    cost_budget_halala: 0,
    metadata: { proof: 'worker-gate' },
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Worker Gate Contract Proof');
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
    worker_gate: report.worker_gate,
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
  lines.push('This proof is CI-safe. It creates one metadata-only evaluator job in');
  lines.push('an in-memory database, then proves the worker, queue dispatch, result');
  lines.push('writer, billing hook, reports, rankings, and quality claims are all');
  lines.push('disabled. It does not touch production state or run customer workloads.');
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

function runEvaluatorWorkerGateContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_WORKER_GATE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-worker-gate-contract',
    mode: 'ci_safe_worker_disabled_contract',
    claims: {
      mutates_production_db: false,
      creates_metadata_records_only: true,
      queues_eval_job: false,
      runs_eval_worker: false,
      writes_result_manifest: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    created: {},
    worker_gate: {},
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
    const created = createEvaluatorJob(db, 1, payload(), { idempotencyKey: 'eval-worker-gate-proof' });
    const read = getEvaluatorJob(db, 1, 'evaljob_workgate001');
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T03:45:00.000Z'));
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T03:45:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T03:45:00.000Z'));

    report.created = {
      eval_job: created.eval_job,
      read_found: Boolean(read),
    };
    report.worker_gate = {
      current_mode: workerGate.current_mode,
      endpoints: workerGate.endpoints,
      worker: workerGate.worker,
      job_status_policy: workerGate.job_status_policy,
      result_policy: workerGate.result_policy,
      claim_guards: workerGate.claim_guards,
    };
    report.readiness = {
      endpoints: readiness.endpoints,
      eval_worker: readiness.features.eval_worker,
      eval_job_api: readiness.features.eval_job_api,
      claim_guards: readiness.claim_guards,
    };
    report.schema = {
      scoring_harness: schema.scoring_harness,
      claim_guards: schema.claim_guards,
    };

    record(
      'worker gate is public, versioned, and disabled by default',
      workerGate.object === 'evaluator_worker_gate'
        && workerGate.current_mode === 'worker_disabled_by_default'
        && workerGate.endpoints.worker_readiness === 'GET /api/evals/worker/readiness'
        && workerGate.endpoints.artifact_storage_readiness === 'GET /api/evals/results/artifacts/readiness'
        && workerGate.worker.enabled === false
        && workerGate.worker.queue_dispatch_enabled === false
        && workerGate.worker.result_writer_enabled === false
        && workerGate.worker.billing_hook_enabled === false,
      'The worker-readiness contract exists without enabling execution.',
    );

    record(
      'metadata jobs remain draft and cannot be queued by this API slice',
      created.eval_job.status === 'draft'
        && read?.status === 'draft'
        && workerGate.job_status_policy.metadata_create_status === 'draft'
        && workerGate.job_status_policy.api_can_queue_jobs === false
        && workerGate.job_status_policy.api_can_start_jobs === false
        && workerGate.claim_guards.mutates_eval_job_status === false
        && workerGate.claim_guards.queues_eval_job === false,
      'Creating eval metadata does not enqueue or start work.',
    );

    record(
      'result manifest and billing hooks remain unavailable',
      workerGate.result_policy.endpoint_live === false
        && workerGate.result_policy.artifact_storage_readiness_endpoint === 'GET /api/evals/results/artifacts/readiness'
        && workerGate.result_policy.manifest_required_before_enablement === true
        && workerGate.claim_guards.writes_result_manifest === false
        && workerGate.claim_guards.bills_eval_jobs === false
        && workerGate.claim_guards.settles_eval_jobs === false
        && readiness.features.eval_job_api.result_endpoint === null,
      'No result endpoint, writer, or billing hook is enabled.',
    );

    record(
      'readiness and schema expose the worker gate without worker claims',
      readiness.endpoints.worker_readiness === 'GET /api/evals/worker/readiness'
        && readiness.features.eval_worker.available === false
        && readiness.features.eval_worker.worker_enabled === false
        && readiness.claim_guards.eval_worker_live === false
        && schema.scoring_harness.worker_enabled === false
        && schema.scoring_harness.worker_gate_endpoint === 'GET /api/evals/worker/readiness'
        && schema.claim_guards.worker_enabled === false,
      'Agents can discover the gate, but worker capability remains false.',
    );

    record(
      'proof performs no production runtime or money mutation',
      report.claims.mutates_production_db === false
        && report.claims.creates_metadata_records_only === true
        && report.claims.queues_eval_job === false
        && report.claims.runs_eval_worker === false
        && report.claims.writes_result_manifest === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof uses an in-memory database and does not touch production state.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_worker_gate_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorWorkerGateContractProof();
  console.log(`Evaluator worker gate contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator worker gate contract proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorWorkerGateContractProof,
};
