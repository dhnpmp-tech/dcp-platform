#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  ensureAdapterRegistrySchema,
  createAdapter,
} = require('../src/services/adapterRegistry');
const {
  ensureAdapterDeploymentSchema,
  createAdapterDeployment,
  attachDeploymentLoadProof,
  listAllAdapterDeployments,
  updateDeploymentStatus,
} = require('../src/services/adapterDeploymentLifecycle');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-deployment-contract-proof';
const CONTRACT = 'dcp.adapter_deployment_contract_proof.v1';

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
    VALUES (1, 'Adapter Proof Renter', 'adapter-proof@example.com', 'rk-adapter-proof', 'active', ?)
  `).run(new Date().toISOString());
  ensureAdapterRegistrySchema(db);
  ensureAdapterDeploymentSchema(db);
  return db;
}

function adapterInput(overrides = {}) {
  return {
    adapter_id: 'adpt_contractproof',
    name: 'Contract Proof Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: 'adapters/r1/contract-proof/adapter.safetensors',
    checksum_sha256: 'a'.repeat(64),
    rank: 16,
    metadata: {
      recipe: 'qlora-sft',
      source: 'adapter_deployment_contract_proof',
    },
    status: 'ready',
    ...overrides,
  };
}

function summarizeDeployment(deployment) {
  return {
    deployment_id: deployment.deployment_id,
    adapter_id: deployment.adapter_id,
    base_model: deployment.base_model,
    mode: deployment.mode,
    endpoint_id: deployment.endpoint_id,
    status: deployment.status,
    route_traffic: deployment.route_traffic,
    failure_reason: deployment.failure_reason,
    stopped_at: deployment.stopped_at || null,
    serving_load_proof: deployment.serving_load_proof
      ? {
          loaded: deployment.serving_load_proof.loaded,
          deployment_id: deployment.serving_load_proof.deployment_id || null,
          adapter_id: deployment.serving_load_proof.adapter_id,
          base_model: deployment.serving_load_proof.base_model,
          mode: deployment.serving_load_proof.mode || null,
          endpoint_id: deployment.serving_load_proof.endpoint_id || null,
          artifact_checksum_sha256: deployment.serving_load_proof.artifact_checksum_sha256 || null,
          loaded_at: deployment.serving_load_proof.loaded_at || null,
          provider_id: deployment.serving_load_proof.provider_id || null,
        }
      : null,
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
  lines.push('# Adapter Deployment Contract Proof');
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
  lines.push('## Deployment States');
  lines.push('');
  for (const [name, deployment] of Object.entries(report.deployments)) {
    lines.push(`### ${name}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(deployment, null, 2));
    lines.push('```');
    lines.push('');
  }
  if (report.failure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- message: ${report.failure.message}`);
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe and uses an in-memory database. It proves the adapter');
  lines.push('deployment lifecycle contract; it does not prove a real vLLM process loaded');
  lines.push('an adapter, does not route production traffic, and does not bill inference.');
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

function runAdapterDeploymentContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_DEPLOYMENT_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-deployment-contract',
    mode: 'ci_safe_in_memory',
    claims: {
      routes_production_traffic: false,
      verifies_real_vllm_load: false,
      bills_adapter_inference: false,
    },
    invariants: [],
    deployments: {},
    list: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  const db = makeDb();
  try {
    const adapter = createAdapter(db, 1, adapterInput());
    report.adapter = {
      adapter_id: adapter.adapter_id,
      base_model: adapter.base_model,
      status: adapter.status,
      checksum_sha256: adapter.checksum_sha256,
      rank: adapter.rank,
    };

    const pending = createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_contract01',
      adapter_id: adapter.adapter_id,
      endpoint_id: 'adapter-proof-endpoint',
      serving_load_proof: {
        loaded: true,
        deployment_id: 'adpl_contract01',
        adapter_id: adapter.adapter_id,
        base_model: adapter.base_model,
        mode: 'single_adapter_live_merge',
        endpoint_id: 'adapter-proof-endpoint',
        artifact_checksum_sha256: adapter.checksum_sha256,
        provider_id: 'spoofed-public-proof',
      },
    });
    report.deployments.pending_public_request = summarizeDeployment(pending);
    record(
      'public deployment request cannot attach load proof',
      pending.status === 'pending' && pending.route_traffic === false && pending.serving_load_proof === null,
      'Public create accepted intent only and discarded spoofed serving_load_proof.',
    );

    const mismatched = attachDeploymentLoadProof(db, 1, pending.deployment_id, {
      loaded: true,
      deployment_id: pending.deployment_id,
      adapter_id: 'adpt_otherproof',
      base_model: adapter.base_model,
      mode: pending.mode,
      endpoint_id: pending.endpoint_id,
      artifact_checksum_sha256: adapter.checksum_sha256,
      loaded_at: '2026-07-09T00:00:00.000Z',
      provider_id: 'provider-contract-proof',
    });
    report.deployments.mismatched_load_proof = summarizeDeployment(mismatched);
    record(
      'mismatched load proof cannot route traffic',
      mismatched.status === 'degraded'
        && mismatched.route_traffic === false
        && mismatched.failure_reason === 'serving_load_proof_mismatch',
      'Mismatched adapter id degraded the deployment and left route_traffic=false.',
    );

    const checksumMismatch = attachDeploymentLoadProof(db, 1, pending.deployment_id, {
      loaded: true,
      deployment_id: pending.deployment_id,
      adapter_id: adapter.adapter_id,
      base_model: adapter.base_model,
      mode: pending.mode,
      endpoint_id: pending.endpoint_id,
      artifact_checksum_sha256: 'e'.repeat(64),
      loaded_at: '2026-07-09T00:00:30.000Z',
      provider_id: 'provider-contract-proof',
    });
    report.deployments.checksum_mismatch_load_proof = summarizeDeployment(checksumMismatch);
    record(
      'artifact checksum mismatch cannot route traffic',
      checksumMismatch.status === 'degraded'
        && checksumMismatch.route_traffic === false
        && checksumMismatch.failure_reason === 'serving_load_proof_mismatch',
      'Mismatched adapter artifact checksum degraded the deployment and left route_traffic=false.',
    );

    const verified = attachDeploymentLoadProof(db, 1, pending.deployment_id, {
      loaded: true,
      deployment_id: pending.deployment_id,
      adapter_id: adapter.adapter_id,
      base_model: adapter.base_model,
      mode: pending.mode,
      endpoint_id: pending.endpoint_id,
      artifact_checksum_sha256: adapter.checksum_sha256,
      loaded_at: '2026-07-09T00:01:00.000Z',
      provider_id: 'provider-contract-proof',
    });
    report.deployments.matching_load_proof = summarizeDeployment(verified);
    record(
      'matching load proof is required before route traffic',
      verified.status === 'running'
        && verified.route_traffic === true
        && verified.failure_reason === null
        && verified.serving_load_proof
        && verified.serving_load_proof.deployment_id === pending.deployment_id
        && verified.serving_load_proof.adapter_id === adapter.adapter_id
        && verified.serving_load_proof.base_model === adapter.base_model
        && verified.serving_load_proof.mode === pending.mode
        && verified.serving_load_proof.endpoint_id === pending.endpoint_id
        && verified.serving_load_proof.artifact_checksum_sha256 === adapter.checksum_sha256,
      'Only matching deployment/adapter/base_model/mode/endpoint/checksum load proof transitioned the record to running.',
    );

    const listed = listAllAdapterDeployments(db, 1, {
      adapter_id: adapter.adapter_id,
      status: 'running',
    });
    report.list = {
      count: listed.deployments.length,
      deployment_ids: listed.deployments.map((deployment) => deployment.deployment_id),
      status_filter: 'running',
    };
    record(
      'renter deployment list exposes verified running record',
      listed.deployments.length === 1 && listed.deployments[0].deployment_id === pending.deployment_id,
      'Aggregate deployment list can be used by dashboards/agents after load proof.',
    );

    const stopped = updateDeploymentStatus(db, 1, pending.deployment_id, 'stopped');
    report.deployments.renter_stopped_intent = summarizeDeployment(stopped);
    record(
      'renter stop disables route traffic without load-proof privileges',
      stopped.status === 'stopped'
        && stopped.route_traffic === false
        && stopped.stopped_at
        && stopped.serving_load_proof
        && stopped.serving_load_proof.deployment_id === pending.deployment_id,
      'Renter-scoped stop moves the deployment to stopped and clears route_traffic without attaching or changing load proof.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_deployment_contract_failed',
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

function main() {
  const report = runAdapterDeploymentContractProof();
  console.log(`Adapter deployment contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? `${report.failure.code}: ${report.failure.message}` : 'proof failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runAdapterDeploymentContractProof,
  writeReport,
  summarizeDeployment,
};
