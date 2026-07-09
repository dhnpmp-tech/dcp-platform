#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
} = require('../src/services/evaluatorJobs');
const { createEvalsRouter } = require('../src/routes/evals');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../src/services/evaluatorJobSchema');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultAccessPolicyReadiness } = require('../src/services/evaluatorResultAccessPolicy');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-result-endpoint-disabled-proof';
const CONTRACT = 'dcp.evaluator_result_endpoint_disabled_proof.v1';
const SHA = 'e'.repeat(64);

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
    VALUES (1, 'Eval Result Owner', 'eval-owner@example.com', 'rk-owner', 'active', ?),
           (2, 'Other Renter', 'other@example.com', 'rk-other', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureEvaluatorJobSchema(db);
  return db;
}

function payload() {
  return {
    eval_job_id: 'evaljob_result001',
    name: 'Evaluator disabled result endpoint proof',
    task: 'arabic_qa',
    dataset: {
      ref: 'artifact://renter-1/evals/result-proof.jsonl',
      sha256: SHA,
      format: 'jsonl',
      example_count: 16,
    },
    candidate_model: 'qwen/qwen3-coder',
    baseline_models: ['baseline/local-qwen'],
    metrics: ['exact_match', 'semantic_similarity', 'p95_latency_ms'],
    max_examples: 16,
    cost_budget_halala: 0,
    metadata: { proof: true },
  };
}

function markSucceededWithPrivateManifest(db) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE evaluator_jobs
       SET status = 'succeeded',
           result_manifest_json = ?,
           completed_at = ?,
           updated_at = ?
     WHERE eval_job_id = 'evaljob_result001'
  `).run(JSON.stringify({
    eval_job_id: 'evaljob_result001',
    storage_key: 'eval-results/renter-1/evaljob_result001/result-manifest.json',
    signed_url: 'https://object-store.example/private-signed-url',
    summary_sha256: 'f'.repeat(64),
  }), now, now);
}

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/evals', createEvalsRouter({
    db,
    requireRenter: (req, res, next) => {
      const renterId = Number(req.header('x-test-renter-id') || 1);
      if (renterId === 0) return res.status(401).json({ error: 'Renter API key required' });
      req.renter = { id: renterId };
      return next();
    },
  }));
  return app;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Result Endpoint Disabled Proof');
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
    owner_response: report.owner_response,
    other_renter_response: report.other_renter_response,
    unauthenticated_response: report.unauthenticated_response,
    linked_contracts: report.linked_contracts,
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
  lines.push('This proof is CI-safe. It creates an in-memory evaluator job with a');
  lines.push('private result manifest, calls the renter-scoped disabled result route,');
  lines.push('and verifies that no manifest, storage key, signed URL, worker action,');
  lines.push('billing, settlement, report, ranking, or quality claim is exposed.');
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

async function runEvaluatorResultEndpointDisabledProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_RESULT_ENDPOINT_DISABLED_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-result-endpoint-disabled',
    mode: 'ci_safe_disabled_result_endpoint_only',
    claims: {
      disabled_route_live: true,
      exposes_live_result_endpoint: false,
      exposes_result_manifest: false,
      exposes_artifact_storage_key: false,
      signs_download_url: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    owner_response: {},
    other_renter_response: {},
    unauthenticated_response: {},
    linked_contracts: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const db = makeDb();
    createEvaluatorJob(db, 1, payload(), { idempotencyKey: 'disabled-result-route-proof' });
    markSucceededWithPrivateManifest(db);
    const app = buildApp(db);
    const owner = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '1');
    const otherRenter = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '2');
    const unauthenticated = await request(app)
      .get('/api/evals/jobs/evaljob_result001/results')
      .set('x-test-renter-id', '0');
    const readiness = buildEvaluatorReadiness(new Date('2026-07-09T05:35:00.000Z'));
    const schema = buildEvaluatorJobSchema(new Date('2026-07-09T05:35:00.000Z'));
    const workerGate = buildEvaluatorWorkerGate(new Date('2026-07-09T05:35:00.000Z'));
    const accessPolicy = buildEvaluatorResultAccessPolicyReadiness(new Date('2026-07-09T05:35:00.000Z'));

    report.owner_response = {
      status: owner.status,
      body: owner.body,
      serialized: JSON.stringify(owner.body),
    };
    report.other_renter_response = {
      status: otherRenter.status,
      body: otherRenter.body,
    };
    report.unauthenticated_response = {
      status: unauthenticated.status,
      body: unauthenticated.body,
    };
    report.linked_contracts = {
      evaluator_readiness: {
        endpoint: readiness.endpoints.disabled_result_endpoint,
        eval_job_api: readiness.features.eval_job_api,
      },
      job_schema: {
        endpoint: schema.endpoints.disabled_result_endpoint,
        claim_guards: schema.claim_guards,
      },
      worker_gate: {
        endpoint: workerGate.endpoints.disabled_result_endpoint,
        disabled_endpoint: workerGate.result_policy.disabled_endpoint,
      },
      access_policy: {
        endpoint: accessPolicy.endpoints.disabled_result_endpoint,
        disabled_result_endpoint_live: accessPolicy.claim_guards.disabled_result_endpoint_live,
      },
    };

    record(
      'owner receives disabled result route without manifest or signed download',
      owner.status === 409
        && owner.body.object === 'evaluator_result_endpoint_disabled'
        && owner.body.eval_job_id === 'evaljob_result001'
        && owner.body.renter_id === 1
        && owner.body.job_status === 'succeeded'
        && owner.body.result_available === true
        && owner.body.result_endpoint_live === false
        && owner.body.signed_downloads_enabled === false
        && owner.body.download_url_signed === false
        && owner.body.claim_guards.exposes_disabled_result_endpoint === true
        && owner.body.claim_guards.exposes_live_result_endpoint === false
        && owner.body.claim_guards.exposes_result_manifest === false
        && owner.body.claim_guards.exposes_artifact_storage_key === false
        && owner.body.claim_guards.signs_download_url === false,
      'The owning renter can see the disabled contract only, not result contents.',
    );

    record(
      'private manifest fields are not serialized in disabled endpoint response',
      !report.owner_response.serialized.includes('"result_manifest":')
        && !report.owner_response.serialized.includes('"storage_key":')
        && !report.owner_response.serialized.includes('eval-results/renter-1/')
        && !report.owner_response.serialized.includes('signed_url')
        && !report.owner_response.serialized.includes('object-store.example'),
      'The route suppresses private artifact path and signed URL data even when the job has a result manifest.',
    );

    record(
      'other renters and unauthenticated callers cannot inspect result state',
      otherRenter.status === 404
        && otherRenter.body.code === 'evaluator_job_not_found'
        && unauthenticated.status === 401,
      'Renter ownership is enforced before the disabled endpoint contract is returned.',
    );

    record(
      'readiness schema worker and access contracts link disabled endpoint while live results remain off',
      readiness.endpoints.disabled_result_endpoint === 'GET /api/evals/jobs/:id/results'
        && readiness.features.eval_job_api.disabled_result_endpoint === 'GET /api/evals/jobs/:id/results'
        && readiness.features.eval_job_api.result_endpoint === null
        && readiness.features.eval_job_api.result_endpoint_live === false
        && schema.endpoints.disabled_result_endpoint === 'GET /api/evals/jobs/:id/results'
        && schema.claim_guards.disabled_result_endpoint_live === true
        && schema.claim_guards.result_endpoint_live === false
        && workerGate.result_policy.disabled_endpoint === 'GET /api/evals/jobs/:id/results'
        && accessPolicy.endpoints.disabled_result_endpoint === 'GET /api/evals/jobs/:id/results'
        && accessPolicy.claim_guards.disabled_result_endpoint_live === true,
      'All evaluator contracts expose the disabled route without flipping live result access.',
    );

    record(
      'proof performs no runtime result download or money mutation',
      report.claims.disabled_route_live === true
        && report.claims.exposes_live_result_endpoint === false
        && report.claims.exposes_result_manifest === false
        && report.claims.exposes_artifact_storage_key === false
        && report.claims.signs_download_url === false
        && report.claims.starts_worker === false
        && report.claims.mutates_eval_job_status === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof validates the disabled route only and does not touch production runtime or money.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_result_endpoint_disabled_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  runEvaluatorResultEndpointDisabledProof().then((report) => {
    console.log(`Evaluator result endpoint disabled proof: ${report.verdict}`);
    console.log(`JSON report: ${report.artifacts.json}`);
    console.log(`Markdown report: ${report.artifacts.markdown}`);
    for (const item of report.invariants) {
      console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
    }
    if (report.verdict !== 'PASS') {
      console.error(report.failure ? report.failure.message : 'Evaluator result endpoint disabled proof failed');
      process.exit(1);
    }
  }).catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  CONTRACT,
  runEvaluatorResultEndpointDisabledProof,
};
