#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'local-roadmap-proof-suite';
const CONTRACT = 'dcp.local_roadmap_proof_suite.v1';

const CI_SAFE_GATES = Object.freeze([
  {
    id: 'template_catalog_validity',
    command: 'npm run templates:validate',
  },
  {
    id: 'workspace_pod_contracts',
    command: 'npm run workspace-pods:verify-contracts',
  },
  {
    id: 'pod_image_contracts',
    command: 'npm run pod-images:verify-contracts',
  },
  {
    id: 'provider_nsight_contract',
    command: 'npm run provider:nsight:verify',
  },
  {
    id: 'live_acceptance_status',
    command: 'npm run proof:live-acceptance-status',
    outputEnv: 'DCP_LIVE_ACCEPTANCE_STATUS_OUTPUT_DIR',
  },
  {
    id: 'router_policy_contract',
    command: 'npm run proof:router-policy-contract',
    outputEnv: 'DCP_ROUTER_POLICY_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_readiness_contract',
    command: 'npm run proof:evaluator-readiness-contract',
    outputEnv: 'DCP_EVALUATOR_READINESS_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_job_schema_contract',
    command: 'npm run proof:evaluator-job-schema-contract',
    outputEnv: 'DCP_EVALUATOR_JOB_SCHEMA_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_job_metadata_contract',
    command: 'npm run proof:evaluator-job-metadata-contract',
    outputEnv: 'DCP_EVALUATOR_JOB_METADATA_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_worker_gate_contract',
    command: 'npm run proof:evaluator-worker-gate-contract',
    outputEnv: 'DCP_EVALUATOR_WORKER_GATE_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_result_manifest_contract',
    command: 'npm run proof:evaluator-result-manifest-contract',
    outputEnv: 'DCP_EVALUATOR_RESULT_MANIFEST_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_result_writer_dry_run',
    command: 'npm run proof:evaluator-result-writer-dry-run',
    outputEnv: 'DCP_EVALUATOR_RESULT_WRITER_DRY_RUN_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_worker_dry_run_fixture',
    command: 'npm run proof:evaluator-worker-dry-run-fixture',
    outputEnv: 'DCP_EVALUATOR_WORKER_DRY_RUN_FIXTURE_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_artifact_storage_policy',
    command: 'npm run proof:evaluator-artifact-storage-policy',
    outputEnv: 'DCP_EVALUATOR_ARTIFACT_STORAGE_POLICY_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_result_access_policy',
    command: 'npm run proof:evaluator-result-access-policy',
    outputEnv: 'DCP_EVALUATOR_RESULT_ACCESS_POLICY_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_result_endpoint_disabled',
    command: 'npm run proof:evaluator-result-endpoint-disabled',
    outputEnv: 'DCP_EVALUATOR_RESULT_ENDPOINT_DISABLED_PROOF_OUTPUT_DIR',
  },
  {
    id: 'evaluator_signed_download_policy',
    command: 'npm run proof:evaluator-signed-download-policy',
    outputEnv: 'DCP_EVALUATOR_SIGNED_DOWNLOAD_POLICY_PROOF_OUTPUT_DIR',
  },
  {
    id: 'minimum_balance_readiness_contract',
    command: 'npm run proof:minimum-balance-readiness',
    outputEnv: 'DCP_MINIMUM_BALANCE_PROOF_OUTPUT_DIR',
  },
  {
    id: 'prompt_cache_contract',
    command: 'npm run proof:prompt-cache-contract',
    outputEnv: 'DCP_PROMPT_CACHE_PROOF_OUTPUT_DIR',
  },
  {
    id: 'batch_inference_contract',
    command: 'npm run proof:batch-inference-contract',
    outputEnv: 'DCP_BATCH_INFERENCE_PROOF_OUTPUT_DIR',
  },
  {
    id: 'lora_training_contract',
    command: 'npm run proof:lora-training-contract',
    outputEnv: 'DCP_LORA_TRAINING_PROOF_OUTPUT_DIR',
  },
  {
    id: 'tinker_loop_readiness_contract',
    command: 'npm run proof:tinker-loop-readiness',
    outputEnv: 'DCP_TINKER_LOOP_PROOF_OUTPUT_DIR',
  },
  {
    id: 'adapter_artifact_policy',
    command: 'npm run proof:adapter-artifact-policy',
    outputEnv: 'DCP_ADAPTER_ARTIFACT_POLICY_PROOF_OUTPUT_DIR',
  },
  {
    id: 'adapter_deployment_contract',
    command: 'npm run proof:adapter-deployment-contract',
    outputEnv: 'DCP_ADAPTER_DEPLOYMENT_PROOF_OUTPUT_DIR',
  },
]);

const EXTERNAL_GATES = Object.freeze([
  {
    id: 'workspace_pod_live_launch',
    command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
    blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
  },
  {
    id: 'lora_pod_image_provider_host',
    command: 'npm run proof:lora-pod-image',
    blocked_on: ['provider GPU host', 'Docker/NVIDIA runtime', 'built dcp-compute:lora image'],
  },
  {
    id: 'anthropic_sse_live',
    command: 'DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse',
    blocked_on: ['funded inference smoke principal', 'compatible vLLM provider capacity'],
  },
  {
    id: 'prompt_cache_live_settlement',
    command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
    blocked_on: ['provider cache-hit evidence', 'funded smoke principal', 'settlement discount policy approval'],
  },
  {
    id: 'batch_live_execution',
    command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
    blocked_on: ['funded smoke principal', 'object-store result path', 'live provider execution capacity', 'discount policy approval'],
  },
  {
    id: 'lora_training_live_artifact',
    command: 'DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact',
    blocked_on: ['provider GPU host or pod', 'approved dataset fixture', 'artifact storage key', 'training budget window'],
  },
  {
    id: 'adapter_vllm_live_load',
    command: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
    blocked_on: ['real adapter artifact checksum', 'vLLM host with LoRA enabled', 'dedicated endpoint capacity', 'funded smoke principal'],
  },
  {
    id: 'dcp_agent_reconciliation',
    command: 'DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation',
    blocked_on: ['controlled maintenance window', 'installer artifact decision', 'owner approval for production artifact cleanup'],
  },
]);

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function relative(target) {
  return path.relative(REPO_ROOT, target);
}

function runGate(gate, paths) {
  const startedAt = Date.now();
  const env = { ...process.env };
  if (gate.outputEnv) {
    env[gate.outputEnv] = path.join(paths.subproofDir, gate.id);
    ensureDir(env[gate.outputEnv]);
  }

  const result = spawnSync(gate.command, {
    cwd: REPO_ROOT,
    env,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const logPath = path.join(paths.logsDir, `${sanitize(gate.id)}.log`);
  fs.writeFileSync(logPath, output);
  const durationMs = Date.now() - startedAt;

  return {
    id: gate.id,
    command: gate.command,
    status: result.status === 0 ? 'pass' : 'fail',
    exit_code: result.status ?? 1,
    duration_ms: durationMs,
    output_env: gate.outputEnv || null,
    output_dir: gate.outputEnv ? relative(env[gate.outputEnv]) : null,
    log: relative(logPath),
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Local Roadmap Proof Suite');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push(`- passed: ${report.summary.passed}/${report.summary.total}`);
  lines.push('');
  lines.push('## CI-Safe Gates');
  lines.push('');
  lines.push('| gate | status | duration ms | log |');
  lines.push('|---|---:|---:|---|');
  for (const gate of report.gates) {
    lines.push(`| ${gate.id} | ${gate.status} | ${gate.duration_ms} | \`${gate.log}\` |`);
  }
  lines.push('');
  lines.push('## External Gates');
  lines.push('');
  lines.push('These gates are intentionally excluded from this local suite and remain Blocked until their external inputs exist.');
  lines.push('');
  lines.push('| gate | command | blocked on |');
  lines.push('|---|---|---|');
  for (const gate of report.external_gates) {
    lines.push(`| ${gate.id} | \`${gate.command}\` | ${gate.blocked_on.join(', ')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir) {
  ensureDir(outputDir);
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  report.artifacts = {
    json: relative(jsonPath),
    markdown: relative(markdownPath),
    latest_json: relative(latestJsonPath),
    latest_markdown: relative(latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.artifacts;
}

function runLocalRoadmapProofSuite(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_LOCAL_ROADMAP_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const runId = toStamp();
  const paths = {
    outputDir,
    logsDir: path.join(outputDir, `${PROOF_PREFIX}-logs`, runId),
    subproofDir: path.join(outputDir, `${PROOF_PREFIX}-subproofs`, runId),
  };
  ensureDir(paths.logsDir);
  ensureDir(paths.subproofDir);

  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:local-roadmap',
    mode: 'ci_safe_local',
    summary: {
      total: CI_SAFE_GATES.length,
      passed: 0,
      failed: 0,
    },
    gates: [],
    external_gates: EXTERNAL_GATES.map((gate) => ({ ...gate })),
    artifacts: {},
  };

  for (const gate of CI_SAFE_GATES) {
    const gateResult = runGate(gate, paths);
    report.gates.push(gateResult);
    if (gateResult.status === 'pass') report.summary.passed += 1;
    else report.summary.failed += 1;
  }

  report.verdict = report.summary.failed === 0 ? 'PASS' : 'FAIL';
  writeReport(report, outputDir);
  return report;
}

function printSummary(report) {
  console.log(`Local roadmap proof suite: ${report.verdict}`);
  console.log(`Passed: ${report.summary.passed}/${report.summary.total}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const gate of report.gates) {
    console.log(`${gate.status.toUpperCase()} ${gate.id} (${gate.duration_ms}ms)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runLocalRoadmapProofSuite();
  printSummary(report);
  if (report.verdict !== 'PASS') {
    process.exit(1);
  }
}

export {
  CONTRACT,
  CI_SAFE_GATES,
  EXTERNAL_GATES,
  runLocalRoadmapProofSuite,
};
