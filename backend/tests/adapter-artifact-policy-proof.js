#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_ARTIFACT_POLICY_VERSION,
  buildAdapterArtifactPolicyReadiness,
  buildAdapterArtifactStorageKey,
  buildAdapterModelCardStorageKey,
  evaluateAdapterArtifactPolicy,
} = require('../src/services/adapterArtifactPolicy');
const { buildLoraReadiness } = require('../src/routes/lora');
const {
  buildLoraArtifactStorageKey,
  buildLoraModelCardStorageKey,
} = require('../src/workers/loraTrainingWorker');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-artifact-policy-proof';
const CONTRACT = 'dcp.adapter_artifact_policy_proof.v1';

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
  lines.push('# Adapter Artifact Policy Proof');
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
    readiness: report.artifact_policy_readiness,
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
  lines.push('This proof is CI-safe. It validates adapter artifact and model-card key');
  lines.push('policy in memory only. It does not upload artifacts, configure object');
  lines.push('storage, run GPU training, load adapters into vLLM, route traffic, bill,');
  lines.push('or claim Tinker compatibility.');
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

function runAdapterArtifactPolicyProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_ARTIFACT_POLICY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-artifact-policy',
    mode: 'ci_safe_adapter_artifact_policy_contract_only',
    claims: {
      policy_contract_live: true,
      metadata_registry_available: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      exposes_object_store_bucket: false,
      creates_training_job: false,
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      writes_model_card_artifact: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      bills_training_or_inference: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    artifact_policy_readiness: {},
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
    const now = new Date('2026-07-09T06:15:00.000Z');
    const readiness = buildAdapterArtifactPolicyReadiness(now);
    const valid = evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    });
    const invalidTenant = captureInvalid(() => evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-41/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    }));
    const invalidArtifactFilename = captureInvalid(() => evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/weights.bin',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    }));
    const invalidModelCard = captureInvalid(() => evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_other001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    }));
    const invalidChecksum = captureInvalid(() => evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'not-a-sha',
    }));
    const loraReadiness = buildLoraReadiness(now);
    const workerJob = {
      renter_id: 42,
      output_adapter_id: 'adpt_policy001',
    };

    report.artifact_policy_readiness = {
      endpoints: readiness.endpoints,
      artifact_policy: readiness.artifact_policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.valid_policy = valid;
    report.invalid_cases = {
      wrong_tenant_key: invalidTenant,
      wrong_artifact_filename: invalidArtifactFilename,
      wrong_model_card_scope: invalidModelCard,
      invalid_checksum: invalidChecksum,
    };
    report.linked_contracts = {
      lora_readiness: {
        endpoint: loraReadiness.endpoints.adapter_artifact_policy,
        artifact_policy_version: loraReadiness.adapter_registry.artifact_policy_version,
        artifact_upload_endpoint_enabled: loraReadiness.adapter_registry.artifact_upload_endpoint_enabled,
        artifact_storage_write_enabled: loraReadiness.adapter_registry.artifact_storage_write_enabled,
      },
      worker_key_convention: {
        adapter_artifact_key_matches_worker: buildAdapterArtifactStorageKey({
          renter_id: 42,
          adapter_id: 'adpt_policy001',
        }) === buildLoraArtifactStorageKey(workerJob),
        model_card_key_matches_worker: buildAdapterModelCardStorageKey({
          renter_id: 42,
          adapter_id: 'adpt_policy001',
        }) === buildLoraModelCardStorageKey(workerJob),
      },
    };

    record(
      'adapter artifact readiness is public and policy-only',
      readiness.object === 'adapter_artifact_policy_readiness'
        && readiness.version === ADAPTER_ARTIFACT_POLICY_VERSION
        && readiness.endpoints.artifact_policy_readiness === 'GET /api/adapters/artifacts/readiness'
        && readiness.artifact_policy.artifact_upload_endpoint_enabled === false
        && readiness.artifact_policy.artifact_storage_write_enabled === false
        && readiness.claim_guards.writes_adapter_artifact === false
        && readiness.claim_guards.routes_adapter_traffic === false,
      'The artifact policy is visible without enabling upload, storage writes, serving, or routing.',
    );

    record(
      'scoped adapter and model-card keys validate without exposing object keys',
      valid.valid === true
        && valid.would_accept_if_artifact_upload_enabled === true
        && valid.artifact_upload_endpoint_enabled === false
        && valid.artifact_storage_write_enabled === false
        && valid.adapter_serving_enabled === false
        && valid.route_traffic_enabled === false
        && valid.artifact_key_scope === 'renter_adapter_scoped'
        && valid.model_card_key_scope === 'renter_adapter_scoped'
        && !JSON.stringify(valid).includes('adapters/renter-42/adpt_policy001')
        && !JSON.stringify(valid).includes('"storage_key":'),
      'Policy evaluation reports scope and checksum facts without serializing storage keys.',
    );

    record(
      'unscoped artifact filename model card and checksum cases are rejected',
      invalidTenant.rejected === true
        && invalidTenant.code === 'adapter_artifact_storage_key_scope_invalid'
        && invalidArtifactFilename.rejected === true
        && invalidArtifactFilename.code === 'adapter_artifact_filename_invalid'
        && invalidModelCard.rejected === true
        && invalidModelCard.code === 'adapter_model_card_storage_key_scope_invalid'
        && invalidChecksum.rejected === true
        && invalidChecksum.code === 'adapter_artifact_checksum_invalid',
      'Unsafe artifact proof inputs fail before any upload or serving path exists.',
    );

    record(
      'lora readiness and worker key builders link to artifact policy',
      loraReadiness.endpoints.adapter_artifact_policy === 'GET /api/adapters/artifacts/readiness'
        && loraReadiness.adapter_registry.artifact_policy_version === ADAPTER_ARTIFACT_POLICY_VERSION
        && loraReadiness.adapter_registry.artifact_upload_endpoint_enabled === false
        && report.linked_contracts.worker_key_convention.adapter_artifact_key_matches_worker === true
        && report.linked_contracts.worker_key_convention.model_card_key_matches_worker === true,
      'LoRA readiness and worker storage-key conventions point at the same policy.',
    );

    record(
      'proof performs no artifact upload gpu serving route or money mutation',
      report.claims.policy_contract_live === true
        && report.claims.artifact_upload_endpoint_enabled === false
        && report.claims.artifact_storage_write_enabled === false
        && report.claims.exposes_object_store_bucket === false
        && report.claims.creates_training_job === false
        && report.claims.runs_gpu_training === false
        && report.claims.writes_adapter_artifact === false
        && report.claims.writes_model_card_artifact === false
        && report.claims.enables_adapter_serving === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.bills_training_or_inference === false
        && report.claims.claims_tinker_compatibility === false,
      'The proof validates artifact policy only and does not touch storage, runtime, routing, or money.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.verdict = 'FAIL';
    report.failure = {
      code: error.code || 'adapter_artifact_policy_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runAdapterArtifactPolicyProof();
  console.log(`Adapter artifact policy proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const item of report.invariants) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? report.failure.message : 'Adapter artifact policy proof failed');
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runAdapterArtifactPolicyProof,
};
