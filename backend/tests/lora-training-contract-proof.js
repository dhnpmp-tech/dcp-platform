#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureAdapterRegistrySchema, getAdapter } = require('../src/services/adapterRegistry');
const {
  MODEL_CARD_MANIFEST_VERSION,
  createLoraTrainingJob,
  ensureLoraTrainingJobsSchema,
  getLoraTrainingJob,
  listLoraTrainingJobLogs,
  validateLoraTrainingJobDataset,
} = require('../src/services/loraTrainingJobs');
const {
  buildLoraArtifactStorageKey,
  buildLoraModelCardStorageKey,
  runLoraTrainingWorkerOnce,
} = require('../src/workers/loraTrainingWorker');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'lora-training-contract-proof';
const CONTRACT = 'dcp.lora_training_contract_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
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
    VALUES (1, 'LoRA Proof Renter', 'lora-proof@example.com', 'rk-lora-proof', 'active', ?)
  `).run(new Date().toISOString());
  ensureAdapterRegistrySchema(db);
  ensureLoraTrainingJobsSchema(db);
  return db;
}

function datasetJsonl(rows = 12) {
  return Array.from({ length: rows }, (_unused, index) => JSON.stringify({
    prompt: `Translate support phrase ${index + 1}`,
    completion: `translated support phrase ${index + 1}`,
  })).join('\n');
}

function trainingInput(overrides = {}) {
  return {
    training_job_id: 'lora_job_contract1',
    recipe: 'qlora-sft',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    dataset_storage_key: '/datasets/r1/support.jsonl',
    dataset_jsonl: datasetJsonl(),
    output_adapter_name: 'support-arabic',
    output_adapter_id: 'adpt_contract1',
    hyperparameters: {
      rank: 16,
      learning_rate: 0.0002,
      epochs: 1,
    },
    ...overrides,
  };
}

function summarizeJob(job) {
  return {
    training_job_id: job.training_job_id,
    renter_id: job.renter_id,
    recipe: job.recipe,
    base_model: job.base_model,
    dataset_storage_key: job.dataset_storage_key,
    dataset_checksum_sha256: job.dataset_checksum_sha256,
    dataset_format: job.dataset_format,
    dataset_row_count: job.dataset_row_count,
    train_rows: job.train_rows,
    validation_rows: job.validation_rows,
    estimated_tokens: job.estimated_tokens,
    output_adapter_name: job.output_adapter_name,
    output_adapter_id: job.output_adapter_id,
    status: job.status,
    artifact_storage_key: job.artifact_storage_key,
    artifact_checksum_sha256: job.artifact_checksum_sha256,
    model_card_storage_key: job.model_card_storage_key,
    failure_reason: job.failure_reason,
    training_enabled: job.training_enabled,
    adapter_registered: job.adapter_registered,
    model_card_manifest: job.model_card_manifest,
  };
}

function summarizeAdapter(adapter) {
  if (!adapter) return null;
  return {
    adapter_id: adapter.adapter_id,
    name: adapter.name,
    base_model: adapter.base_model,
    storage_key: adapter.storage_key,
    checksum_sha256: adapter.checksum_sha256,
    rank: adapter.rank,
    status: adapter.status,
    deployed_at: adapter.deployed_at,
    metadata: adapter.metadata,
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
  lines.push('# LoRA Training Contract Proof');
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
    dataset: report.dataset,
    metadata_job: report.metadata_job,
    worker: report.worker,
    artifact_failure: report.artifact_failure,
    adapter: report.adapter,
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
  lines.push('executor. It proves LoRA dataset validation, metadata-only job creation,');
  lines.push('disabled worker behavior, adapter artifact checksum requirements, model-card');
  lines.push('manifest claim guards, and non-serving adapter registration. It does not run');
  lines.push('GPU training, write adapter artifacts, load vLLM adapters, route traffic, bill');
  lines.push('training, or prove Tinker compatibility.');
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

async function runLoraTrainingContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_LORA_TRAINING_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    model_card_manifest_version: MODEL_CARD_MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:lora-training-contract',
    mode: 'ci_safe_in_memory',
    claims: {
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      enables_public_training: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      proves_tinker_compatibility: false,
      bills_training: false,
    },
    invariants: [],
    dataset: {},
    metadata_job: {},
    worker: {},
    artifact_failure: {},
    adapter: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  const db = makeDb();
  try {
    const validDataset = validateLoraTrainingJobDataset(datasetJsonl(), {
      validationSplitPct: 10,
    });
    let invalidRejected = false;
    try {
      validateLoraTrainingJobDataset(JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
      }));
    } catch (error) {
      invalidRejected = error && error.code === 'missing_user_or_assistant';
      report.dataset.invalid_error = {
        code: error.code,
        message: error.message,
        line: error.line || null,
      };
    }
    report.dataset.valid = validDataset;
    record(
      'dataset validation returns checksum and split facts without storing rows',
      validDataset.format === 'prompt_completion'
        && validDataset.row_count === 12
        && validDataset.train_rows === 11
        && validDataset.validation_rows === 1
        && /^[a-f0-9]{64}$/.test(validDataset.checksum_sha256)
        && invalidRejected === true,
      'Valid datasets produce checksum/split/token facts; invalid chat rows are rejected before job creation.',
    );

    const created = createLoraTrainingJob(db, 1, trainingInput(), {
      idempotencyKey: 'lora-contract-proof-key',
    });
    const replay = createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_contract2',
      output_adapter_id: 'adpt_contract2',
    }), {
      idempotencyKey: 'lora-contract-proof-key',
    });
    const createdLogs = listLoraTrainingJobLogs(db, 1, created.job.training_job_id).logs;
    report.metadata_job.created = summarizeJob(created.job);
    report.metadata_job.replay = {
      idempotent_replay: replay.idempotent_replay,
      training_job_id: replay.job.training_job_id,
    };
    report.metadata_job.logs = createdLogs.map((log) => ({
      level: log.level,
      event: log.event,
      message: log.message,
      metadata: log.metadata,
    }));
    record(
      'training job create is metadata-only and idempotent',
      created.idempotent_replay === false
        && replay.idempotent_replay === true
        && replay.job.training_job_id === created.job.training_job_id
        && created.job.training_enabled === false
        && created.job.artifact_storage_key === null
        && created.job.model_card_manifest === null
        && createdLogs[0].metadata.training_enabled === false,
      'Public job creation records validated metadata only; it does not launch GPU training.',
    );

    const disabledWorker = await runLoraTrainingWorkerOnce(db);
    const afterDisabled = getLoraTrainingJob(db, 1, created.job.training_job_id);
    const noExecutor = await runLoraTrainingWorkerOnce(db, { enabled: true });
    const afterNoExecutor = getLoraTrainingJob(db, 1, created.job.training_job_id);
    report.worker.disabled = {
      result: disabledWorker,
      job: summarizeJob(afterDisabled),
    };
    report.worker.no_executor = {
      result: noExecutor,
      job: summarizeJob(afterNoExecutor),
    };
    record(
      'worker is disabled by default and enabled mode needs an executor',
      disabledWorker.enabled === false
        && disabledWorker.processed === 0
        && afterDisabled.status === 'created'
        && noExecutor.enabled === true
        && noExecutor.processed === 0
        && /no executor/i.test(noExecutor.note)
        && afterNoExecutor.status === 'created',
      'The worker cannot mutate training jobs unless explicitly enabled with an executor.',
    );

    const successResult = await runLoraTrainingWorkerOnce(db, {
      enabled: true,
      autoRegisterAdapter: true,
      executor: async (job) => ({
        artifact_storage_key: buildLoraArtifactStorageKey(job),
        artifact_checksum_sha256: 'a'.repeat(64),
        model_card_storage_key: buildLoraModelCardStorageKey(job),
      }),
    });
    const succeededJob = getLoraTrainingJob(db, 1, created.job.training_job_id);
    const adapter = getAdapter(db, 1, succeededJob.output_adapter_id);
    report.worker.success = {
      result: successResult,
      job: summarizeJob(succeededJob),
    };
    report.adapter = summarizeAdapter(adapter);
    record(
      'artifact checksum proof is required before success and model-card manifest',
      successResult.succeeded === 1
        && succeededJob.status === 'succeeded'
        && succeededJob.artifact_storage_key === 'adapters/renter-1/adpt_contract1/adapter.safetensors'
        && succeededJob.artifact_checksum_sha256 === 'a'.repeat(64)
        && succeededJob.model_card_storage_key === 'adapters/renter-1/adpt_contract1/model-card.json'
        && succeededJob.model_card_manifest
        && succeededJob.model_card_manifest.status === 'metadata_stub'
        && succeededJob.model_card_manifest.artifact.proof_status === 'checksum_recorded'
        && succeededJob.model_card_manifest.claims.public_training_enabled === false
        && succeededJob.model_card_manifest.claims.serving_enabled === false
        && succeededJob.model_card_manifest.claims.route_traffic === false
        && succeededJob.model_card_manifest.claims.tinker_compatible === false,
      'A succeeded metadata proof includes adapter checksum and model-card guardrails without public claims.',
    );
    record(
      'adapter registration remains non-serving after artifact proof',
      successResult.jobs[0].adapter_registered === true
        && adapter
        && adapter.adapter_id === 'adpt_contract1'
        && adapter.storage_key === succeededJob.artifact_storage_key
        && adapter.checksum_sha256 === succeededJob.artifact_checksum_sha256
        && adapter.status === 'ready'
        && adapter.deployed_at === null
        && adapter.metadata
        && adapter.metadata.safety
        && adapter.metadata.safety.serving_load_proof_required === true
        && adapter.metadata.safety.route_traffic === false,
      'Registering the adapter after checksum proof creates metadata only; serving still requires deployment load proof.',
    );

    createLoraTrainingJob(db, 1, trainingInput({
      training_job_id: 'lora_job_noproof1',
      output_adapter_id: 'adpt_noproof1',
    }));
    const failedResult = await runLoraTrainingWorkerOnce(db, {
      enabled: true,
      executor: async () => ({
        model_card_storage_key: 'adapters/renter-1/adpt_noproof1/model-card.json',
      }),
    });
    const failedJob = getLoraTrainingJob(db, 1, 'lora_job_noproof1');
    report.artifact_failure = {
      result: failedResult,
      job: summarizeJob(failedJob),
    };
    record(
      'missing artifact checksum fails the job instead of registering an adapter',
      failedResult.failed === 1
        && failedJob.status === 'failed'
        && /artifact_checksum_sha256/.test(failedJob.failure_reason || '')
        && getAdapter(db, 1, 'adpt_noproof1') === null,
      'Executor output without a SHA-256 adapter artifact proof cannot mark training succeeded.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'lora_training_contract_failed',
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
  const report = await runLoraTrainingContractProof();
  console.log(`LoRA training contract proof: ${report.verdict}`);
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
  runLoraTrainingContractProof,
  writeReport,
  summarizeJob,
  summarizeAdapter,
};
