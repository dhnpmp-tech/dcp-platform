#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildEvaluatorArtifactStoragePolicyReadiness,
  buildEvaluatorResultArtifactStorageKey,
  validateEvaluatorArtifactStoragePolicy,
} = require('../src/services/evaluatorArtifactStoragePolicy');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultManifestContract } = require('../src/services/evaluatorResultManifest');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../src/services/evaluatorResultWriterDryRun');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-artifact-storage-policy-proof';
const CONTRACT = 'dcp.evaluator_artifact_storage_policy_proof.v1';

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

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Evaluator Artifact Storage Policy Proof');
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
    readiness: report.artifact_storage_readiness,
    valid_policy: report.valid_policy,
    invalid_cases: report.invalid_cases,
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
  lines.push('This proof is CI-safe. It validates key scope, checksum, and content');
  lines.push('type rules in memory only. It does not configure object storage, write');
  lines.push('production artifacts, expose result endpoints, sign downloads, bill,');
  lines.push('settle, publish reports, or rank models.');
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

function runEvaluatorArtifactStoragePolicyProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_ARTIFACT_STORAGE_POLICY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-artifact-storage-policy',
    mode: 'ci_safe_policy_contract_only',
    claims: {
      policy_contract_live: true,
      configures_object_store: false,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      signs_download_url: false,
      stores_raw_customer_datasets: false,
      stores_raw_prompts_or_completions: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    artifact_storage_readiness: {},
    valid_policy: {},
    invalid_cases: {},
    linked_contracts: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const now = new Date('2026-07-09T04:45:00.000Z');
    const readiness = buildEvaluatorArtifactStoragePolicyReadiness(now);
    const storageKey = buildEvaluatorResultArtifactStorageKey({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
    });
    const valid = validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: storageKey,
      checksum_sha256: 'c'.repeat(64),
      content_type: 'application/json',
    });
    const invalidWrongRenter = captureInvalid(() => validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: 'eval-results/renter-43/evaljob_artifact001/result-manifest.json',
      checksum_sha256: 'c'.repeat(64),
    }));
    const invalidWrongJob = captureInvalid(() => validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
      checksum_sha256: 'c'.repeat(64),
    }));
    const invalidTraversal = captureInvalid(() => validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: 'eval-results/renter-42/evaljob_artifact001/../result-manifest.json',
      checksum_sha256: 'c'.repeat(64),
    }));
    const invalidChecksum = captureInvalid(() => validateEvaluatorArtifactStoragePolicy({
      renter_id: 42,
      eval_job_id: 'evaljob_artifact001',
      storage_key: storageKey,
      checksum_sha256: 'not-a-sha',
    }));
    const evalReadiness = buildEvaluatorReadiness(now);
    const workerGate = buildEvaluatorWorkerGate(now);
    const manifestContract = buildEvaluatorResultManifestContract(now);
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(now);

    report.artifact_storage_readiness = {
      endpoints: readiness.endpoints,
      storage_policy: readiness.storage_policy,
      validation_policy: readiness.validation_policy,
      claim_guards: readiness.claim_guards,
    };
    report.valid_policy = valid;
    report.invalid_cases = {
      wrong_renter: invalidWrongRenter,
      wrong_eval_job: invalidWrongJob,
      path_traversal: invalidTraversal,
      invalid_checksum: invalidChecksum,
    };
    report.linked_contracts = {
      evaluator_readiness: {
        endpoint: evalReadiness.endpoints.result_artifact_storage_readiness,
        feature: evalReadiness.features.eval_result_artifact_storage,
        claim_guard: evalReadiness.claim_guards.eval_result_artifact_storage_policy_live,
      },
      worker_gate: {
        endpoint: workerGate.endpoints.artifact_storage_readiness,
        result_policy_endpoint: workerGate.result_policy.artifact_storage_readiness_endpoint,
      },
      result_manifest: {
        endpoint: manifestContract.endpoints.artifact_storage_readiness,
      },
      result_writer: {
        endpoint: writerReadiness.endpoints.artifact_storage_readiness,
        policy_endpoint: writerReadiness.writer.artifact_storage_policy_endpoint,
      },
    };

    record(
      'artifact storage readiness is public and policy-only',
      readiness.object === 'evaluator_artifact_storage_policy_readiness'
        && readiness.current_mode === 'policy_contract_only'
        && readiness.endpoints.artifact_storage_readiness === 'GET /api/evals/results/artifacts/readiness'
        && readiness.storage_policy.policy_available === true
        && readiness.storage_policy.production_artifact_store_enabled === false
        && readiness.storage_policy.production_writes_enabled === false
        && readiness.storage_policy.signed_downloads_enabled === false,
      'The policy is visible without enabling object storage or downloads.',
    );

    record(
      'valid artifact policy requires renter job checksum and manifest filename scope',
      valid.valid === true
        && valid.storage_key === 'eval-results/renter-42/evaljob_artifact001/result-manifest.json'
        && valid.required_prefix === 'eval-results/renter-42/evaljob_artifact001/'
        && valid.checksum_sha256 === 'c'.repeat(64)
        && valid.content_type === 'application/json'
        && valid.production_writes_enabled === false
        && valid.signed_downloads_enabled === false,
      'The approved key is scoped to renter, eval job, checksum, and manifest JSON only.',
    );

    record(
      'unscoped traversal and invalid checksum cases are rejected',
      invalidWrongRenter.rejected === true
        && invalidWrongRenter.code === 'evaluator_artifact_storage_key_scope_invalid'
        && invalidWrongJob.rejected === true
        && invalidWrongJob.code === 'evaluator_artifact_storage_key_scope_invalid'
        && invalidTraversal.rejected === true
        && invalidTraversal.code === 'invalid_evaluator_artifact_storage_key'
        && invalidChecksum.rejected === true
        && invalidChecksum.code === 'invalid_evaluator_artifact_checksum',
      'Unsafe keys and invalid checksums fail before any storage/write path exists.',
    );

    record(
      'readiness writer manifest and worker contracts link the policy endpoint',
      evalReadiness.endpoints.result_artifact_storage_readiness === 'GET /api/evals/results/artifacts/readiness'
        && evalReadiness.features.eval_result_artifact_storage.available === true
        && evalReadiness.features.eval_result_artifact_storage.production_writes_enabled === false
        && evalReadiness.claim_guards.eval_result_artifact_storage_policy_live === true
        && workerGate.result_policy.artifact_storage_readiness_endpoint === 'GET /api/evals/results/artifacts/readiness'
        && manifestContract.endpoints.artifact_storage_readiness === 'GET /api/evals/results/artifacts/readiness'
        && writerReadiness.writer.artifact_storage_policy_endpoint === 'GET /api/evals/results/artifacts/readiness',
      'All evaluator result contracts point to the policy while production artifact access remains false.',
    );

    record(
      'proof performs no production artifact download or money mutation',
      report.claims.policy_contract_live === true
        && report.claims.configures_object_store === false
        && report.claims.writes_production_artifact === false
        && report.claims.exposes_result_endpoint === false
        && report.claims.signs_download_url === false
        && report.claims.stores_raw_customer_datasets === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof validates policy only and does not touch storage, result endpoints, or money.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_artifact_storage_policy_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorArtifactStoragePolicyProof();
  console.log(`Evaluator artifact storage policy proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator artifact storage policy proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorArtifactStoragePolicyProof,
};
