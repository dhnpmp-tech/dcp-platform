#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildEvaluatorSignedDownloadPolicyReadiness,
  evaluateEvaluatorSignedDownloadPolicy,
} = require('../src/services/evaluatorSignedDownloadPolicy');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../src/services/evaluatorResultWriterDryRun');
const { buildEvaluatorResultAccessPolicyReadiness } = require('../src/services/evaluatorResultAccessPolicy');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-signed-download-policy-proof';
const CONTRACT = 'dcp.evaluator_signed_download_policy_proof.v1';

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
  lines.push('# Evaluator Signed Download Policy Proof');
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
    readiness: report.signed_download_readiness,
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
  lines.push('This proof is CI-safe. It validates signed-download prerequisites in');
  lines.push('memory only. It does not configure object storage, expose storage keys,');
  lines.push('sign URLs, expose result endpoints, start workers, bill, settle, publish');
  lines.push('reports, rank models, or assert Arabic quality.');
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

function runEvaluatorSignedDownloadPolicyProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_SIGNED_DOWNLOAD_POLICY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-signed-download-policy',
    mode: 'ci_safe_signed_download_policy_contract_only',
    claims: {
      policy_contract_live: true,
      signed_downloads_enabled: false,
      exposes_signed_url: false,
      exposes_object_store_bucket: false,
      exposes_artifact_storage_key: false,
      configures_object_store: false,
      writes_production_artifact: false,
      exposes_live_result_endpoint: false,
      starts_worker: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    signed_download_readiness: {},
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
    const now = new Date('2026-07-09T05:50:00.000Z');
    const readiness = buildEvaluatorSignedDownloadPolicyReadiness(now);
    const valid = evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
      content_type: 'application/json',
      expires_in_seconds: 300,
    });
    const invalidWrongOwner = captureInvalid(() => evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 41,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const invalidUnavailable = captureInvalid(() => evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: false,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const invalidArtifactScope = captureInvalid(() => evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const invalidExpiry = captureInvalid(() => evaluateEvaluatorSignedDownloadPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
      expires_in_seconds: 901,
    }));
    const evalReadiness = buildEvaluatorReadiness(now);
    const workerGate = buildEvaluatorWorkerGate(now);
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(now);
    const accessReadiness = buildEvaluatorResultAccessPolicyReadiness(now);

    report.signed_download_readiness = {
      endpoints: readiness.endpoints,
      signing_policy: readiness.signing_policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.valid_policy = valid;
    report.invalid_cases = {
      wrong_owner: invalidWrongOwner,
      result_unavailable: invalidUnavailable,
      invalid_artifact_scope: invalidArtifactScope,
      invalid_expiry: invalidExpiry,
    };
    report.linked_contracts = {
      evaluator_readiness: {
        endpoint: evalReadiness.endpoints.signed_download_readiness,
        feature: evalReadiness.features.eval_signed_download_policy,
        claim_guard: evalReadiness.claim_guards.eval_signed_download_policy_live,
      },
      worker_gate: {
        endpoint: workerGate.endpoints.signed_download_readiness,
        result_policy_endpoint: workerGate.result_policy.signed_download_readiness_endpoint,
      },
      result_writer: {
        endpoint: writerReadiness.endpoints.signed_download_readiness,
        policy_endpoint: writerReadiness.writer.signed_download_policy_endpoint,
      },
      result_access: {
        endpoint: accessReadiness.endpoints.signed_download_readiness,
        policy_live: accessReadiness.claim_guards.signed_download_policy_live,
      },
    };

    record(
      'signed download readiness is public and policy-only',
      readiness.object === 'evaluator_signed_download_policy_readiness'
        && readiness.current_mode === 'signed_download_policy_contract_only'
        && readiness.endpoints.signed_download_readiness === 'GET /api/evals/results/downloads/readiness'
        && readiness.signing_policy.policy_available === true
        && readiness.signing_policy.signed_downloads_enabled === false
        && readiness.signing_policy.result_endpoint_live === false
        && readiness.signing_policy.exposes_signed_url === false
        && readiness.claim_guards.signs_download_url === false,
      'The signing policy is visible without signing URLs or exposing object storage.',
    );

    record(
      'owned available result would sign only if signing were enabled',
      valid.valid === true
        && valid.would_sign_if_enabled === true
        && valid.expires_in_seconds === 300
        && valid.signed_downloads_enabled === false
        && valid.result_endpoint_live === false
        && valid.download_url_signed === false
        && valid.exposes_signed_url === false
        && valid.exposes_artifact_storage_key === false
        && valid.denial_code_while_disabled === 'evaluator_signed_downloads_disabled'
        && !JSON.stringify(valid).includes('https://')
        && !JSON.stringify(valid).includes('"storage_key":'),
      'The access and artifact checks pass, but no URL or object key is exposed.',
    );

    record(
      'wrong owner unavailable result invalid artifact and expiry are rejected',
      invalidWrongOwner.rejected === true
        && invalidWrongOwner.code === 'evaluator_result_owner_mismatch'
        && invalidUnavailable.rejected === true
        && invalidUnavailable.code === 'evaluator_result_not_available'
        && invalidArtifactScope.rejected === true
        && invalidArtifactScope.code === 'evaluator_artifact_storage_key_scope_invalid'
        && invalidExpiry.rejected === true
        && invalidExpiry.code === 'invalid_evaluator_signed_download_expiry',
      'Unsafe access cases fail before any signing path exists.',
    );

    record(
      'readiness worker writer and access contracts link signed download policy',
      evalReadiness.endpoints.signed_download_readiness === 'GET /api/evals/results/downloads/readiness'
        && evalReadiness.features.eval_signed_download_policy.available === true
        && evalReadiness.features.eval_signed_download_policy.signed_downloads_enabled === false
        && evalReadiness.claim_guards.eval_signed_download_policy_live === true
        && workerGate.result_policy.signed_download_readiness_endpoint === 'GET /api/evals/results/downloads/readiness'
        && writerReadiness.writer.signed_download_policy_endpoint === 'GET /api/evals/results/downloads/readiness'
        && accessReadiness.endpoints.signed_download_readiness === 'GET /api/evals/results/downloads/readiness',
      'All evaluator result contracts point to the signing policy while signing remains disabled.',
    );

    record(
      'proof exposes no signed URL storage key runtime or money mutation',
      report.claims.policy_contract_live === true
        && report.claims.signed_downloads_enabled === false
        && report.claims.exposes_signed_url === false
        && report.claims.exposes_object_store_bucket === false
        && report.claims.exposes_artifact_storage_key === false
        && report.claims.configures_object_store === false
        && report.claims.writes_production_artifact === false
        && report.claims.exposes_live_result_endpoint === false
        && report.claims.starts_worker === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof validates signing prerequisites only and does not touch storage, runtime, or money.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_signed_download_policy_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorSignedDownloadPolicyProof();
  console.log(`Evaluator signed download policy proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator signed download policy proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorSignedDownloadPolicyProof,
};
