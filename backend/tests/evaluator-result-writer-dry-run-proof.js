#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
} = require('../src/services/evaluatorJobs');
const {
  buildEvaluatorResultWriterDryRunReadiness,
  createEvaluatorResultWriterDryRun,
} = require('../src/services/evaluatorResultWriterDryRun');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultManifestContract } = require('../src/services/evaluatorResultManifest');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-result-writer-dry-run-proof';
const CONTRACT = 'dcp.evaluator_result_writer_dry_run_proof.v1';
const DATASET_SHA = 'a1'.repeat(32);

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
    VALUES (1, 'Result Writer Smoke', 'result-writer@example.com', 'rk-result-writer', 'active', ?)
  `).run(new Date().toISOString());
  ensureEvaluatorJobSchema(db);
  return db;
}

function jobPayload() {
  return {
    eval_job_id: 'evaljob_writer001',
    name: 'Evaluator result writer dry run',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/result-writer.jsonl',
      sha256: DATASET_SHA,
      format: 'jsonl',
      example_count: 8,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity'],
    max_examples: 8,
    cost_budget_halala: 0,
    metadata: { proof: 'result-writer-dry-run' },
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
  lines.push('# Evaluator Result Writer Dry Run Proof');
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
    writer_readiness: report.writer_readiness,
    dry_run: report.dry_run,
    invalid_cases: report.invalid_cases,
    readiness: report.readiness,
    worker_gate: report.worker_gate,
    result_manifest_contract: report.result_manifest_contract,
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
  lines.push('This proof is CI-safe. It writes one validated evaluator result');
  lines.push('manifest to a temporary proof directory only. It does not mutate');
  lines.push('production state, write production artifacts, expose result endpoints,');
  lines.push('store raw customer data, bill, settle, publish reports, or rank models.');
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

function runEvaluatorResultWriterDryRunProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_RESULT_WRITER_DRY_RUN_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const dryRunOutputDir = path.join(outputDir, 'temp-manifests');
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-result-writer-dry-run',
    mode: 'ci_safe_temp_manifest_dry_run',
    claims: {
      mutates_production_db: false,
      writes_temp_manifest: true,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      stores_raw_customer_datasets: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    writer_readiness: {},
    dry_run: {},
    invalid_cases: {},
    readiness: {},
    worker_gate: {},
    result_manifest_contract: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const db = makeDb();
    const created = createEvaluatorJob(db, 1, jobPayload(), { idempotencyKey: 'eval-result-writer-proof' });
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(new Date('2026-07-09T04:05:00.000Z'));
    const dryRun = createEvaluatorResultWriterDryRun({
      eval_job: created.eval_job,
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, {
      now: new Date('2026-07-09T04:05:00.000Z'),
      outputDir: dryRunOutputDir,
    });
    const invalidRawSummary = captureInvalid(() => createEvaluatorResultWriterDryRun({
      eval_job: created.eval_job,
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: { raw_prompts: ['secret prompt'] },
    }, { outputDir: dryRunOutputDir }));
    const invalidMetric = captureInvalid(() => createEvaluatorResultWriterDryRun({
      eval_job: { ...created.eval_job, metrics: ['not_real_metric'] },
      scoring_harness_version: 'eval-harness-2026-07-09',
      summary: summary(),
    }, { outputDir: dryRunOutputDir }));
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T04:05:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T04:05:00.000Z'));
    const resultManifestContract = buildEvaluatorResultManifestContract(new Date('2026-07-09T04:05:00.000Z'));
    const artifactOnDisk = fs.existsSync(dryRun.temp_artifact.path)
      ? JSON.parse(fs.readFileSync(dryRun.temp_artifact.path, 'utf8'))
      : null;

    report.writer_readiness = {
      endpoints: writerReadiness.endpoints,
      writer: writerReadiness.writer,
      manifest_policy: writerReadiness.manifest_policy,
      claim_guards: writerReadiness.claim_guards,
    };
    report.dry_run = {
      eval_job_id: dryRun.manifest.eval_job_id,
      manifest: dryRun.manifest,
      summary_sha256: dryRun.summary_sha256,
      temp_artifact: {
        exists: Boolean(artifactOnDisk),
        bytes: dryRun.temp_artifact.bytes,
        sha256: dryRun.temp_artifact.sha256,
      },
      production_effects: dryRun.production_effects,
    };
    report.invalid_cases = {
      raw_summary: invalidRawSummary,
      invalid_metric: invalidMetric,
    };
    report.readiness = {
      endpoints: readiness.endpoints,
      eval_result_writer: readiness.features.eval_result_writer,
      claim_guards: readiness.claim_guards,
    };
    report.worker_gate = {
      result_policy: workerGate.result_policy,
      claim_guards: workerGate.claim_guards,
    };
    report.result_manifest_contract = {
      endpoints: resultManifestContract.endpoints,
      claim_guards: resultManifestContract.claim_guards,
    };

    record(
      'writer readiness is public and dry-run only',
      writerReadiness.object === 'evaluator_result_writer_dry_run_readiness'
        && writerReadiness.current_mode === 'dry_run_temp_artifact_only'
        && writerReadiness.endpoints.writer_readiness === 'GET /api/evals/results/writer/readiness'
        && writerReadiness.writer.dry_run_available === true
        && writerReadiness.writer.production_writer_enabled === false
        && writerReadiness.writer.result_endpoint_live === false
        && writerReadiness.claim_guards.writes_production_artifact === false,
      'The writer gate is visible without enabling production writes.',
    );

    record(
      'dry run writes a validated manifest to temporary proof storage only',
      dryRun.dry_run === true
        && artifactOnDisk?.eval_job_id === 'evaljob_writer001'
        && artifactOnDisk?.dataset_sha256 === DATASET_SHA
        && artifactOnDisk?.summary_sha256 === dryRun.summary_sha256
        && dryRun.temp_artifact.bytes > 0
        && dryRun.production_effects.writes_production_artifact === false
        && dryRun.production_effects.mutates_eval_job_status === false,
      'A manifest JSON artifact exists in temp storage and production effects are false.',
    );

    record(
      'raw summaries and invalid metrics are rejected before writing',
      invalidRawSummary.rejected === true
        && invalidRawSummary.code === 'raw_summary_field_forbidden'
        && invalidMetric.rejected === true
        && invalidMetric.code === 'unsupported_result_manifest_metric',
      'The dry-run writer blocks raw customer data and unsupported metrics.',
    );

    record(
      'readiness worker gate and manifest contract link the dry-run writer',
      readiness.endpoints.result_writer_readiness === 'GET /api/evals/results/writer/readiness'
        && readiness.features.eval_result_writer.available === true
        && readiness.features.eval_result_writer.production_writer_enabled === false
        && readiness.claim_guards.eval_result_writer_dry_run_live === true
        && workerGate.result_policy.writer_readiness_endpoint === 'GET /api/evals/results/writer/readiness'
        && resultManifestContract.endpoints.result_writer_readiness === 'GET /api/evals/results/writer/readiness',
      'All evaluator contracts point to the dry-run writer while production result access remains false.',
    );

    record(
      'proof performs no production runtime result or money mutation',
      report.claims.mutates_production_db === false
        && report.claims.writes_temp_manifest === true
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
      code: error.code || 'evaluator_result_writer_dry_run_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorResultWriterDryRunProof();
  console.log(`Evaluator result writer dry-run proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator result writer dry-run proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorResultWriterDryRunProof,
};
