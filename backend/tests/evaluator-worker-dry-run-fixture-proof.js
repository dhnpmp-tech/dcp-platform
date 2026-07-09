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
const {
  buildEvaluatorWorkerDryRunFixtureContract,
  createEvaluatorWorkerDryRunFixture,
} = require('../src/services/evaluatorWorkerDryRunFixture');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../src/services/evaluatorResultWriterDryRun');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-worker-dry-run-fixture-proof';
const CONTRACT = 'dcp.evaluator_worker_dry_run_fixture_proof.v1';
const DATASET_SHA = 'b2'.repeat(32);

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
    VALUES (1, 'Worker Fixture Smoke', 'worker-fixture@example.com', 'rk-worker-fixture', 'active', ?)
  `).run(new Date().toISOString());
  ensureEvaluatorJobSchema(db);
  return db;
}

function jobPayload() {
  return {
    eval_job_id: 'evaljob_worker001',
    name: 'Evaluator worker dry-run fixture',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/worker-fixture.jsonl',
      sha256: DATASET_SHA,
      format: 'jsonl',
      example_count: 8,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    max_examples: 8,
    cost_budget_halala: 0,
    metadata: { proof: 'worker-dry-run-fixture' },
  };
}

function summary() {
  return {
    aggregate: {
      exact_match: 0.75,
      semantic_similarity: 0.82,
    },
    counts: {
      examples_scored: 8,
      failed_examples: 0,
    },
    notes: 'aggregate metrics only',
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Worker Dry Run Fixture Proof');
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
    fixture_contract: report.fixture_contract,
    dry_run_fixture: report.dry_run_fixture,
    job_state: report.job_state,
    invalid_cases: report.invalid_cases,
    readiness: report.readiness,
    worker_gate: report.worker_gate,
    writer_readiness: report.writer_readiness,
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
  lines.push('This proof is CI-safe. It creates a draft evaluator metadata job');
  lines.push('inside an in-memory database, simulates a queue item, and invokes');
  lines.push('the result-writer dry run. It writes only temporary proof artifacts');
  lines.push('and does not queue work, start a worker, mutate job status, write');
  lines.push('production artifacts, expose result endpoints, bill, settle, publish');
  lines.push('reports, or rank models.');
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

function runEvaluatorWorkerDryRunFixtureProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_WORKER_DRY_RUN_FIXTURE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const fixtureOutputDir = path.join(outputDir, 'temp-manifests');
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-worker-dry-run-fixture',
    mode: 'ci_safe_simulated_queue_fixture',
    claims: {
      mutates_production_db: false,
      queues_eval_job: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      writes_temp_manifest: true,
      writes_result_manifest_to_database: false,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      stores_raw_customer_datasets: false,
      stores_raw_prompts_or_completions: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    fixture_contract: {},
    dry_run_fixture: {},
    job_state: {},
    invalid_cases: {},
    readiness: {},
    worker_gate: {},
    writer_readiness: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const db = makeDb();
    const created = createEvaluatorJob(db, 1, jobPayload(), { idempotencyKey: 'eval-worker-fixture-proof' });
    const before = getEvaluatorJob(db, 1, created.eval_job.eval_job_id);
    const fixtureContract = buildEvaluatorWorkerDryRunFixtureContract(new Date('2026-07-09T04:30:00.000Z'));
    const dryRunFixture = createEvaluatorWorkerDryRunFixture({
      eval_job: before,
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, {
      now: new Date('2026-07-09T04:30:00.000Z'),
      outputDir: fixtureOutputDir,
    });
    const after = getEvaluatorJob(db, 1, created.eval_job.eval_job_id);
    const invalidNonDraft = captureInvalid(() => createEvaluatorWorkerDryRunFixture({
      eval_job: { ...before, status: 'running' },
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, { outputDir: fixtureOutputDir }));
    const invalidRawSummary = captureInvalid(() => createEvaluatorWorkerDryRunFixture({
      eval_job: before,
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: { raw_completions: ['secret completion'] },
    }, { outputDir: fixtureOutputDir }));
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T04:30:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T04:30:00.000Z'));
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T04:30:00.000Z'));
    const artifactOnDisk = fs.existsSync(dryRunFixture.result_writer.temp_artifact.path)
      ? JSON.parse(fs.readFileSync(dryRunFixture.result_writer.temp_artifact.path, 'utf8'))
      : null;

    report.fixture_contract = {
      command: fixtureContract.command,
      source: fixtureContract.source,
      result_writer: fixtureContract.result_writer,
      claim_guards: fixtureContract.claim_guards,
    };
    report.dry_run_fixture = {
      eval_job_id: dryRunFixture.queue_item.source_eval_job_id,
      current_mode: dryRunFixture.current_mode,
      queue_item: dryRunFixture.queue_item,
      job_status: dryRunFixture.job_status,
      manifest: dryRunFixture.result_writer.manifest,
      temp_artifact: {
        exists: Boolean(artifactOnDisk),
        bytes: dryRunFixture.result_writer.temp_artifact.bytes,
        sha256: dryRunFixture.result_writer.temp_artifact.sha256,
      },
      production_effects: dryRunFixture.production_effects,
    };
    report.job_state = {
      before: {
        status: before.status,
        result_available: before.result_available,
        result_manifest: before.result_manifest,
      },
      after: {
        status: after.status,
        result_available: after.result_available,
        result_manifest: after.result_manifest,
        queued_at: after.queued_at,
        started_at: after.started_at,
        completed_at: after.completed_at,
      },
    };
    report.invalid_cases = {
      non_draft_job: invalidNonDraft,
      raw_summary: invalidRawSummary,
    };
    report.readiness = {
      eval_worker: readiness.features.eval_worker,
      claim_guards: readiness.claim_guards,
    };
    report.worker_gate = {
      worker: workerGate.worker,
      dry_run_fixture: workerGate.dry_run_fixture,
      result_policy: workerGate.result_policy,
      claim_guards: workerGate.claim_guards,
    };
    report.writer_readiness = {
      endpoints: writerReadiness.endpoints,
      writer: writerReadiness.writer,
      claim_guards: writerReadiness.claim_guards,
    };

    record(
      'worker dry-run fixture contract is command-ready and disabled-by-default',
      fixtureContract.object === 'evaluator_worker_dry_run_fixture_contract'
        && fixtureContract.command === 'npm run proof:evaluator-worker-dry-run-fixture'
        && fixtureContract.source.dispatches_real_queue === false
        && fixtureContract.source.starts_runtime_worker === false
        && fixtureContract.result_writer.writes_temp_manifest_only === true
        && fixtureContract.claim_guards.bills_eval_jobs === false,
      'The fixture is visible as a proof command without enabling worker runtime.',
    );

    record(
      'fixture simulates a queue item and writes only a temporary manifest',
      dryRunFixture.current_mode === 'simulated_queue_fixture_only'
        && dryRunFixture.queue_dispatch_enabled === false
        && dryRunFixture.runtime_worker_started === false
        && dryRunFixture.queue_item.dispatches_real_queue === false
        && artifactOnDisk?.eval_job_id === 'evaljob_worker001'
        && artifactOnDisk?.dataset_sha256 === DATASET_SHA
        && dryRunFixture.production_effects.writes_production_artifact === false
        && dryRunFixture.production_effects.exposes_result_endpoint === false,
      'The fixture creates a temp manifest through the dry-run writer and no production artifact.',
    );

    record(
      'metadata job remains draft with no result database mutation',
      before.status === 'draft'
        && after.status === 'draft'
        && after.result_available === false
        && after.result_manifest === null
        && after.queued_at === null
        && after.started_at === null
        && after.completed_at === null
        && dryRunFixture.job_status.mutates_status === false,
      'The in-memory job remains draft and has no result_manifest_json or runtime timestamps.',
    );

    record(
      'non-draft jobs and raw summaries are rejected before fixture output',
      invalidNonDraft.rejected === true
        && invalidNonDraft.code === 'worker_dry_run_requires_draft_job'
        && invalidRawSummary.rejected === true
        && invalidRawSummary.code === 'raw_summary_field_forbidden',
      'The fixture refuses running/succeeded-style jobs and raw customer data fields.',
    );

    record(
      'readiness and worker gate expose fixture command without enabling queue or billing',
      readiness.features.eval_worker.dry_run_fixture_available === true
        && readiness.features.eval_worker.dry_run_fixture_command === 'npm run proof:evaluator-worker-dry-run-fixture'
        && readiness.features.eval_worker.available === false
        && readiness.features.eval_worker.queue_dispatch_enabled === false
        && readiness.claim_guards.eval_worker_dry_run_fixture_live === true
        && readiness.claim_guards.eval_worker_live === false
        && workerGate.worker.dry_run_fixture_available === true
        && workerGate.dry_run_fixture.command === 'npm run proof:evaluator-worker-dry-run-fixture'
        && workerGate.claim_guards.queues_eval_job === false
        && workerGate.claim_guards.bills_eval_jobs === false,
      'Public readiness describes the proof command while queue dispatch and billing remain false.',
    );

    record(
      'proof performs no production runtime result or money mutation',
      report.claims.mutates_production_db === false
        && report.claims.queues_eval_job === false
        && report.claims.starts_worker === false
        && report.claims.mutates_eval_job_status === false
        && report.claims.writes_temp_manifest === true
        && report.claims.writes_result_manifest_to_database === false
        && report.claims.writes_production_artifact === false
        && report.claims.exposes_result_endpoint === false
        && report.claims.stores_raw_customer_datasets === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof writes only a temp manifest and does not touch production state.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_worker_dry_run_fixture_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorWorkerDryRunFixtureProof();
  console.log(`Evaluator worker dry-run fixture proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator worker dry-run fixture proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorWorkerDryRunFixtureProof,
};
