#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildEvaluatorResultAccessPolicyReadiness,
  evaluateEvaluatorResultAccessPolicy,
} = require('../src/services/evaluatorResultAccessPolicy');
const { buildEvaluatorReadiness } = require('../src/services/evaluatorReadiness');
const { buildEvaluatorWorkerGate } = require('../src/services/evaluatorWorkerGate');
const { buildEvaluatorResultManifestContract } = require('../src/services/evaluatorResultManifest');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../src/services/evaluatorResultWriterDryRun');
const { buildEvaluatorArtifactStoragePolicyReadiness } = require('../src/services/evaluatorArtifactStoragePolicy');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'evaluator-result-access-policy-proof';
const CONTRACT = 'dcp.evaluator_result_access_policy_proof.v1';

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
  lines.push('# Evaluator Result Access Policy Proof');
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
    readiness: report.result_access_readiness,
    valid_access: report.valid_access,
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
  lines.push('This proof is CI-safe. It validates evaluator result authorization');
  lines.push('policy in memory only. It does not expose a result endpoint, sign');
  lines.push('download URLs, configure object storage, write production artifacts,');
  lines.push('bill, settle, publish reports, rank models, or assert Arabic quality.');
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

function runEvaluatorResultAccessPolicyProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_EVALUATOR_RESULT_ACCESS_POLICY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:evaluator-result-access-policy',
    mode: 'ci_safe_authorization_policy_contract_only',
    claims: {
      policy_contract_live: true,
      exposes_result_endpoint: false,
      signs_download_url: false,
      allows_cross_renter_access: false,
      configures_object_store: false,
      writes_production_artifact: false,
      stores_raw_customer_datasets: false,
      stores_raw_prompts_or_completions: false,
      mutates_billing_or_settlement: false,
      publishes_public_report: false,
      enables_model_ranking: false,
      enables_arabic_quality_claims: false,
    },
    invariants: [],
    result_access_readiness: {},
    valid_access: {},
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
    const now = new Date('2026-07-09T05:00:00.000Z');
    const readiness = buildEvaluatorResultAccessPolicyReadiness(now);
    const valid = evaluateEvaluatorResultAccessPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
      content_type: 'application/json',
    });
    const invalidWrongOwner = captureInvalid(() => evaluateEvaluatorResultAccessPolicy({
      requesting_renter_id: 41,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const invalidUnavailable = captureInvalid(() => evaluateEvaluatorResultAccessPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: false,
      storage_key: 'eval-results/renter-42/evaljob_access001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const invalidArtifactScope = captureInvalid(() => evaluateEvaluatorResultAccessPolicy({
      requesting_renter_id: 42,
      job_renter_id: 42,
      eval_job_id: 'evaljob_access001',
      result_available: true,
      storage_key: 'eval-results/renter-42/evaljob_other001/result-manifest.json',
      checksum_sha256: 'd'.repeat(64),
    }));
    const evalReadiness = buildEvaluatorReadiness(now);
    const workerGate = buildEvaluatorWorkerGate(now);
    const manifestContract = buildEvaluatorResultManifestContract(now);
    const writerReadiness = buildEvaluatorResultWriterDryRunReadiness(now);
    const artifactReadiness = buildEvaluatorArtifactStoragePolicyReadiness(now);

    report.result_access_readiness = {
      endpoints: readiness.endpoints,
      access_policy: readiness.access_policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.valid_access = valid;
    report.invalid_cases = {
      wrong_owner: invalidWrongOwner,
      result_unavailable: invalidUnavailable,
      invalid_artifact_scope: invalidArtifactScope,
    };
    report.linked_contracts = {
      evaluator_readiness: {
        endpoint: evalReadiness.endpoints.result_access_readiness,
        feature: evalReadiness.features.eval_result_access_policy,
        claim_guard: evalReadiness.claim_guards.eval_result_access_policy_live,
      },
      worker_gate: {
        endpoint: workerGate.endpoints.result_access_readiness,
        result_policy_endpoint: workerGate.result_policy.result_access_readiness_endpoint,
      },
      result_manifest: {
        endpoint: manifestContract.endpoints.result_access_readiness,
      },
      result_writer: {
        endpoint: writerReadiness.endpoints.result_access_readiness,
        policy_endpoint: writerReadiness.writer.result_access_policy_endpoint,
      },
      artifact_storage: {
        endpoint: artifactReadiness.endpoints.result_access_readiness,
      },
    };

    record(
      'result access readiness is public and policy-only',
      readiness.object === 'evaluator_result_access_policy_readiness'
        && readiness.current_mode === 'authorization_policy_contract_only'
        && readiness.endpoints.result_access_readiness === 'GET /api/evals/results/access/readiness'
        && readiness.access_policy.policy_available === true
        && readiness.access_policy.result_endpoint_live === false
        && readiness.access_policy.signed_downloads_enabled === false
        && readiness.access_policy.renter_auth_required === true
        && readiness.access_policy.renter_owner_match_required === true
        && readiness.access_policy.result_available_required === true
        && readiness.access_policy.artifact_policy_required === true,
      'The policy is visible without enabling result endpoints, signed downloads, or public reports.',
    );

    record(
      'owned available result would authorize only if endpoint were enabled',
      valid.valid === true
        && valid.eval_job_id === 'evaljob_access001'
        && valid.renter_id === 42
        && valid.would_authorize_if_endpoint_enabled === true
        && valid.result_endpoint_live === false
        && valid.signed_downloads_enabled === false
        && valid.download_url_signed === false
        && valid.denial_code_while_disabled === 'evaluator_result_endpoint_disabled'
        && valid.artifact_policy.storage_key === 'eval-results/renter-42/evaljob_access001/result-manifest.json'
        && valid.artifact_policy.production_writes_enabled === false
        && valid.artifact_policy.signed_downloads_enabled === false,
      'The owner match and artifact policy pass, but the endpoint and download stay disabled.',
    );

    record(
      'wrong owner unavailable result and invalid artifact are rejected',
      invalidWrongOwner.rejected === true
        && invalidWrongOwner.code === 'evaluator_result_owner_mismatch'
        && invalidUnavailable.rejected === true
        && invalidUnavailable.code === 'evaluator_result_not_available'
        && invalidArtifactScope.rejected === true
        && invalidArtifactScope.code === 'evaluator_artifact_storage_key_scope_invalid',
      'Access policy blocks cross-renter reads, missing results, and unscoped artifacts before downloads exist.',
    );

    record(
      'readiness writer manifest worker and artifact policy contracts link the access endpoint',
      evalReadiness.endpoints.result_access_readiness === 'GET /api/evals/results/access/readiness'
        && evalReadiness.features.eval_result_access_policy.available === true
        && evalReadiness.features.eval_result_access_policy.result_endpoint_live === false
        && evalReadiness.claim_guards.eval_result_access_policy_live === true
        && workerGate.result_policy.result_access_readiness_endpoint === 'GET /api/evals/results/access/readiness'
        && manifestContract.endpoints.result_access_readiness === 'GET /api/evals/results/access/readiness'
        && writerReadiness.writer.result_access_policy_endpoint === 'GET /api/evals/results/access/readiness'
        && artifactReadiness.endpoints.result_access_readiness === 'GET /api/evals/results/access/readiness',
      'All evaluator result contracts point to the access policy while production result access remains false.',
    );

    record(
      'proof exposes no result endpoint download or money mutation',
      report.claims.policy_contract_live === true
        && report.claims.exposes_result_endpoint === false
        && report.claims.signs_download_url === false
        && report.claims.allows_cross_renter_access === false
        && report.claims.configures_object_store === false
        && report.claims.writes_production_artifact === false
        && report.claims.stores_raw_customer_datasets === false
        && report.claims.mutates_billing_or_settlement === false
        && report.claims.publishes_public_report === false
        && report.claims.enables_model_ranking === false
        && report.claims.enables_arabic_quality_claims === false,
      'The proof validates authorization policy only and does not touch storage, result endpoints, or money.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'evaluator_result_access_policy_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runEvaluatorResultAccessPolicyProof();
  console.log(`Evaluator result access policy proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Evaluator result access policy proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runEvaluatorResultAccessPolicyProof,
};
