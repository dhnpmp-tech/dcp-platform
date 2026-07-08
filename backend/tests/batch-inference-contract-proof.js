#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  BATCH_READINESS_CONTRACT_VERSION,
  buildBatchInferenceReadiness,
  createBatchInferenceJob,
  ensureBatchInferenceJobSchema,
  getBatchInferenceJob,
  getBatchInferenceJobLine,
  getBatchInferenceResultManifest,
  listBatchInferenceJobLines,
} = require('../src/services/batchInferenceJobs');
const {
  buildBatchResultStorageKey,
  runBatchInferenceWorkerOnce,
} = require('../src/workers/batchInferenceWorker');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'batch-inference-contract-proof';
const CONTRACT = 'dcp.batch_inference_contract_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
      balance_halala INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  db.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, balance_halala, created_at)
    VALUES (1, 'Batch Proof Renter', 'batch-proof@example.com', 'rk-batch-proof', 'active', 5, ?)
  `).run(new Date().toISOString());
  ensureBatchInferenceJobSchema(db);
  return db;
}

function batchJsonl(lines = defaultBatchLines()) {
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

function defaultBatchLines() {
  return [
    {
      custom_id: 'chat-ok',
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: 'qwen/qwen3-coder',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    {
      custom_id: 'complete-fail',
      method: 'POST',
      url: '/v1/complete',
      body: {
        model: 'mistral',
        prompt: 'hello',
      },
    },
  ];
}

function resultJsonl() {
  return [
    {
      custom_id: 'chat-ok',
      response: {
        status_code: 200,
        body: {
          id: 'chatcmpl-batch-proof',
          object: 'chat.completion',
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
        },
      },
    },
    {
      custom_id: 'complete-fail',
      error: {
        code: 'provider_unavailable',
        message: 'No provider capacity',
      },
    },
  ].map((line) => JSON.stringify(line)).join('\n') + '\n';
}

function summarizeBatch(batch) {
  return {
    batch_id: batch.batch_id,
    renter_id: batch.renter_id,
    status: batch.status,
    request_count: batch.request_count,
    input_checksum_sha256: batch.input_checksum_sha256,
    result_storage_key: batch.result_storage_key,
    result_checksum_sha256: batch.result_checksum_sha256,
    result_normalized_bytes: batch.result_normalized_bytes,
    completed_count: batch.completed_count,
    failed_count: batch.failed_count,
    total_cost_halala: batch.total_cost_halala,
    execution_enabled: batch.execution_enabled,
    results_available: batch.results_available,
  };
}

function summarizeLine(line) {
  return {
    custom_id: line.custom_id,
    status: line.status,
    status_code: line.status_code,
    model_id: line.model_id,
    response_checksum_sha256: line.response_checksum_sha256,
    response_normalized_bytes: line.response_normalized_bytes,
    provider_id: line.provider_id,
    usage: line.usage,
    cost_halala: line.cost_halala,
    request_id: line.request_id,
    provider_response_id: line.provider_response_id,
    settlement_status: line.settlement_status,
    settlement_request_id: line.settlement_request_id,
    settlement_error_code: line.settlement_error_code,
  };
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
  lines.push('# Batch Inference Contract Proof');
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
    validation: report.validation,
    primary_batch: report.primary_batch,
    settlement_preflight: report.settlement_preflight,
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
  lines.push('This proof is CI-safe and uses an in-memory database with an injected');
  lines.push('executor. It proves validation, idempotency, disabled-by-default execution,');
  lines.push('result checksum requirements, line-ledger proof, and minimum-balance');
  lines.push('preflight behavior. It does not prove production batch execution, object-store');
  lines.push('downloads, discounted settlement, provider capacity, or public model batch');
  lines.push('capability flags.');
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

async function runBatchInferenceContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_BATCH_INFERENCE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    readiness_contract: BATCH_READINESS_CONTRACT_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:batch-inference-contract',
    mode: 'ci_safe_in_memory',
    claims: {
      runs_production_batch_execution: false,
      enables_batch_discounts: false,
      bills_without_balance_preflight: false,
      exposes_model_batch_capability: false,
      writes_result_objects: false,
    },
    invariants: [],
    readiness: {},
    validation: {},
    primary_batch: {},
    settlement_preflight: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  const db = makeDb();
  try {
    const readiness = buildBatchInferenceReadiness({});
    report.readiness = {
      current_mode: readiness.current_mode,
      request_creation_enabled: readiness.request_creation_enabled,
      public_execution_enabled: readiness.public_execution_enabled,
      worker_public_enabled: readiness.features.worker_execution.public_enabled,
      settlement_public_enabled: readiness.features.settlement.public_enabled,
      discounts_enabled: readiness.features.discounts.enabled,
      model_batch_capability_live: readiness.claims.model_batch_capability_live,
    };
    record(
      'readiness keeps public execution and discounts gated',
      readiness.current_mode === 'metadata_validation_only'
        && readiness.public_execution_enabled === false
        && readiness.claims.batch_execution_live === false
        && readiness.claims.batch_discount_live === false
        && readiness.claims.model_batch_capability_live === false,
      'Batch readiness remains validation-only until live execution, settlement, and discount proof exist.',
    );

    let invalidRejected = false;
    try {
      createBatchInferenceJob(db, 1, {
        batch_id: 'batch_invalidproof',
        input_jsonl: batchJsonl([
          {
            custom_id: 'bad-url',
            method: 'POST',
            url: '/v1/unsupported',
            body: { model: 'mistral', prompt: 'hello' },
          },
        ]),
      });
    } catch (error) {
      invalidRejected = error && error.code === 'unsupported_url';
      report.validation.invalid_error = {
        code: error.code,
        message: error.message,
      };
    }
    record(
      'invalid JSONL request is rejected before job creation',
      invalidRejected,
      'Unsupported batch URLs fail contract validation and do not create executable work.',
    );

    const created = createBatchInferenceJob(db, 1, {
      batch_id: 'batch_contract1',
      input_jsonl: batchJsonl(),
      completion_window: '24h',
      metadata: { purpose: 'contract-proof' },
    }, {
      idempotencyKey: 'batch-contract-proof-key',
    });
    const replay = createBatchInferenceJob(db, 1, {
      batch_id: 'batch_contract2',
      input_jsonl: batchJsonl(),
    }, {
      idempotencyKey: 'batch-contract-proof-key',
    });
    report.validation.created = summarizeBatch(created.batch);
    report.validation.replay = {
      idempotent_replay: replay.idempotent_replay,
      batch_id: replay.batch.batch_id,
    };
    record(
      'idempotency key replays the existing batch',
      replay.idempotent_replay === true && replay.batch.batch_id === created.batch.batch_id,
      'Duplicate create requests with the same key return the first tenant-scoped batch record.',
    );

    const initialLines = listBatchInferenceJobLines(db, 1, created.batch.batch_id);
    report.primary_batch.initial_lines = initialLines.lines.map(summarizeLine);
    record(
      'line ledger preserves every input request without raw prompt output',
      initialLines.lines.length === 2
        && initialLines.lines.every((line) => line.status === 'pending' && /^[a-f0-9]{64}$/.test(line.request_checksum_sha256)),
      'Each line has stable checksum metadata and pending status before execution.',
    );

    const disabledWorker = await runBatchInferenceWorkerOnce(db);
    const afterDisabled = getBatchInferenceJob(db, 1, created.batch.batch_id);
    report.primary_batch.disabled_worker = {
      worker: disabledWorker,
      batch: summarizeBatch(afterDisabled),
    };
    record(
      'worker is disabled by default and does not mutate jobs',
      disabledWorker.enabled === false
        && disabledWorker.processed === 0
        && afterDisabled.status === 'created'
        && afterDisabled.result_storage_key === null,
      'Default worker mode leaves created batches untouched.',
    );

    const resultPayload = resultJsonl();
    const workerResult = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: sha256(resultPayload),
        result_normalized_bytes: Buffer.byteLength(resultPayload, 'utf8'),
        lines: [
          {
            custom_id: 'chat-ok',
            status_code: 200,
            response_checksum_sha256: sha256('chat-ok-response'),
            response_normalized_bytes: 256,
            provider_id: 7,
            usage: {
              prompt_tokens: 12,
              completion_tokens: 5,
            },
            cost_halala: 4,
            request_id: 'batch_contract1:chat-ok',
            provider_response_id: 'resp-batch-proof-ok',
          },
          {
            custom_id: 'complete-fail',
            status_code: 503,
            error_code: 'provider_unavailable',
            error_message: 'No provider capacity',
            cost_halala: 0,
            request_id: 'batch_contract1:complete-fail',
          },
        ],
      }),
    });
    const completed = getBatchInferenceJob(db, 1, created.batch.batch_id);
    const completedLines = listBatchInferenceJobLines(db, 1, created.batch.batch_id);
    const manifest = getBatchInferenceResultManifest(db, 1, created.batch.batch_id);
    report.primary_batch.enabled_worker = workerResult;
    report.primary_batch.completed = summarizeBatch(completed);
    report.primary_batch.completed_lines = completedLines.lines.map(summarizeLine);
    report.primary_batch.result_manifest = manifest;
    record(
      'injected executor must attach result checksum proof before completion',
      workerResult.completed === 1
        && completed.status === 'completed'
        && completed.results_available === true
        && completed.result_checksum_sha256 === sha256(resultPayload)
        && manifest.results_available === true,
      'Completed batches require result key plus SHA-256 proof before result metadata is available.',
    );
    record(
      'line proof derives success, failure, usage, and cost totals',
      completed.completed_count === 1
        && completed.failed_count === 1
        && completed.total_cost_halala === 4
        && getBatchInferenceJobLine(db, 1, created.batch.batch_id, 'chat-ok').settlement_status === 'unsettled'
        && getBatchInferenceJobLine(db, 1, created.batch.batch_id, 'complete-fail').status === 'failed',
      'Per-line execution proof drives aggregate counts and leaves settlement separate.',
    );

    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_minbal1',
      input_jsonl: batchJsonl([
        {
          custom_id: 'bill-1',
          method: 'POST',
          url: '/v1/complete',
          body: { model: 'mistral', prompt: 'balance check' },
        },
      ]),
    });
    let settlementCalls = 0;
    const settlementResult = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      settlementEnabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: sha256('minimum-balance-result\n'),
        result_normalized_bytes: Buffer.byteLength('minimum-balance-result\n', 'utf8'),
        lines: [
          {
            custom_id: 'bill-1',
            status_code: 200,
            response_checksum_sha256: sha256('bill-1-response'),
            provider_id: 7,
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
            },
            cost_halala: 9,
          },
        ],
      }),
      checkBalanceGate: () => ({ ok: false, deficitHalala: 4 }),
      settleInferenceOnce: () => {
        settlementCalls += 1;
        return { status: 'settled' };
      },
    });
    const shortBalanceBatch = getBatchInferenceJob(db, 1, 'batch_minbal1');
    const shortBalanceLine = getBatchInferenceJobLine(db, 1, 'batch_minbal1', 'bill-1');
    const renterBalance = db.prepare('SELECT balance_halala, total_spent_halala, total_jobs FROM renters WHERE id = 1').get();
    report.settlement_preflight = {
      worker: settlementResult,
      batch: summarizeBatch(shortBalanceBatch),
      line: summarizeLine(shortBalanceLine),
      settlement_calls: settlementCalls,
      renter_balance: renterBalance,
    };
    record(
      'minimum balance preflight blocks partial batch billing',
      settlementResult.failed === 1
        && settlementCalls === 0
        && shortBalanceBatch.status === 'failed'
        && shortBalanceLine.settlement_status === 'failed'
        && shortBalanceLine.settlement_error_code === 'insufficient_balance'
        && renterBalance.balance_halala === 5
        && renterBalance.total_spent_halala === 0
        && renterBalance.total_jobs === 0,
      'Insufficient balance marks the line settlement failed before any billing call or renter debit.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'batch_inference_contract_failed',
      message: error.message,
      details: error.details || null,
    };
    report.verdict = 'FAIL';
  } finally {
    writeReport(report, outputDir);
    db.close();
  }

  return report;
}

async function main() {
  const report = await runBatchInferenceContractProof();
  console.log(`Batch inference contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? `${report.failure.code}: ${report.failure.message}` : 'proof failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runBatchInferenceContractProof,
  writeReport,
  summarizeBatch,
  summarizeLine,
};
