#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'live-acceptance-gate-status';
const CONTRACT = 'dcp.live_acceptance_gate_status.v1';

const LIVE_ACCEPTANCE_GATES = Object.freeze([
  {
    id: 'workspace_pod_live_launch',
    lane: 'POT/PODS',
    product_area: 'Workspace upload -> pod launch -> /workspace visibility',
    acceptance_state: 'blocked',
    acceptance_command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/workspace-pod-live-proof-*.json',
    blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
    verifies: ['presigned workspace upload', 'pod launch', 'Jupyter /workspace marker visibility', 'default pod cleanup'],
    claim_guard: 'Do not claim workspace-to-pod file visibility accepted until this live proof passes.',
    next_action: 'Run the existing live proof during a funded GPU-capacity window.',
  },
  {
    id: 'lora_pod_image_provider_host',
    lane: 'POT/PODS',
    product_area: 'Fat LoRA pod image imports on provider GPU host',
    acceptance_state: 'blocked',
    acceptance_command: 'npm run proof:lora-pod-image',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/lora-pod-image-proof-*.json',
    blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
    verifies: ['LoRA/QLoRA/vLLM import budget', 'offline SFT scaffold construction', 'GPU-host runtime wiring'],
    claim_guard: 'Do not claim fine-tuning-ready pod images until this provider-host proof passes.',
    next_action: 'Build dcp-compute:lora on a provider host and run the proof there.',
  },
  {
    id: 'anthropic_sse_live',
    lane: 'Inference',
    product_area: 'Anthropic-compatible Messages SSE path',
    acceptance_state: 'blocked',
    acceptance_command: 'DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/anthropic-sse-live-proof-*.json',
    blocked_on: ['funded inference smoke principal', 'compatible vLLM provider capacity'],
    verifies: ['POST /anthropic/v1/messages', 'text/event-stream preservation', 'message_start/message_stop frames'],
    claim_guard: 'Do not claim agent-path Anthropic streaming accepted until a funded live proof passes.',
    next_action: 'Run the live proof when the smoke principal has balance and compatible capacity exists.',
  },
  {
    id: 'prompt_cache_provider_discount_smoke',
    lane: 'Inference',
    product_area: 'Prompt-cache provider hit evidence and discounted settlement',
    acceptance_state: 'blocked',
    acceptance_command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/prompt-cache-live-settlement-proof-*.json',
    blocked_on: ['provider cache-hit evidence', 'funded smoke principal', 'settlement discount policy approval'],
    verifies: ['provider KV-cache hit evidence', 'cached-input discount calculation', 'settlement discount audit trail'],
    claim_guard: 'Keep prompt-cache discounts, provider KV-cache control, and settlement discounts false.',
    next_action: 'Run the opt-in live proof during a funded provider window; discounts remain disabled until policy approval and passing evidence.',
  },
  {
    id: 'batch_live_execution_discount_smoke',
    lane: 'Inference',
    product_area: 'Batch inference live provider execution and discounted settlement',
    acceptance_state: 'blocked',
    acceptance_command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/batch-live-execution-proof-*.json',
    blocked_on: ['funded smoke principal', 'object-store result path', 'live provider execution capacity', 'discount policy approval'],
    verifies: ['async live line execution', 'result artifact download proof', 'discounted settlement ledger'],
    claim_guard: 'Keep batch execution, downloads, model batch flags, and discounts gated.',
    next_action: 'Run the opt-in live proof during a funded provider window; it remains blocked until readiness proves execution, downloads, settlement, and discounts.',
  },
  {
    id: 'lora_gpu_training_artifact_proof',
    lane: 'LoRA',
    product_area: 'GPU LoRA training job produces adapter artifact checksum',
    acceptance_state: 'blocked',
    acceptance_command: 'DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact',
    command_available: true,
    artifact_pattern: 'docs/reports/reliability/lora-training-live-artifact-proof-*.json',
    blocked_on: ['provider GPU host or pod', 'approved dataset fixture', 'artifact storage key', 'training budget window'],
    verifies: ['fixed-recipe SFT execution', 'adapter artifact checksum', 'model-card manifest from real artifact'],
    claim_guard: 'Keep public training, quality, benchmark, and Tinker compatibility claims false.',
    next_action: 'Run the opt-in live artifact proof during a GPU-host training window; it remains blocked until readiness proves worker execution and artifact writing.',
  },
  {
    id: 'adapter_vllm_load_billing_smoke',
    lane: 'LoRA/Dedicated Deployments',
    product_area: 'Adapter vLLM load, route traffic, endpoint smoke, and billing',
    acceptance_state: 'blocked_missing_acceptance_command',
    acceptance_command: null,
    command_available: false,
    artifact_pattern: 'docs/reports/reliability/adapter-vllm-live-load-proof-*.json',
    blocked_on: ['real adapter artifact checksum', 'vLLM host with LoRA enabled', 'dedicated endpoint capacity', 'funded smoke principal'],
    verifies: ['adapter/base-model load proof match', 'route_traffic transition', 'endpoint inference response', 'adapter traffic billing ledger'],
    claim_guard: 'Keep adapter serving, dedicated endpoint traffic, live merge, multi-LoRA, and billing claims gated.',
    next_action: 'Promote a live adapter load and billing proof after a real adapter artifact exists.',
  },
  {
    id: 'dcp_agent_reconciliation',
    lane: 'Ops',
    product_area: 'dcp-agent local/GitHub/VPS reconciliation',
    acceptance_state: 'blocked_maintenance_window',
    acceptance_command: null,
    command_available: false,
    artifact_pattern: 'docs/reports/reliability/dcp-agent-reconciliation-*.json',
    blocked_on: ['controlled maintenance window', 'installer artifact decision', 'owner approval for production artifact cleanup'],
    verifies: ['agent source/artifact parity', 'installer artifact ownership', 'safe cleanup or promotion path'],
    claim_guard: 'Do not delete or overwrite existing production installer artifacts outside the maintenance window.',
    next_action: 'Schedule the controlled dcp-agent reconciliation window and decide artifact ownership.',
  },
]);

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function relative(target) {
  return path.relative(REPO_ROOT, target);
}

function cloneGate(gate) {
  return {
    id: gate.id,
    lane: gate.lane,
    product_area: gate.product_area,
    acceptance_state: gate.acceptance_state,
    acceptance_command: gate.acceptance_command,
    command_available: gate.command_available,
    artifact_pattern: gate.artifact_pattern,
    blocked_on: [...gate.blocked_on],
    verifies: [...gate.verifies],
    claim_guard: gate.claim_guard,
    capability_claim_allowed: false,
    next_action: gate.next_action,
  };
}

function buildSummary(gates) {
  return {
    total: gates.length,
    blocked: gates.filter((gate) => gate.acceptance_state.startsWith('blocked')).length,
    command_available: gates.filter((gate) => gate.command_available).length,
    missing_acceptance_command: gates.filter((gate) => !gate.command_available).length,
    capability_claim_allowed: gates.filter((gate) => gate.capability_claim_allowed).length,
  };
}

function validateReport(report) {
  const failures = [];
  if (report.gates.length === 0) failures.push('no live gates listed');
  for (const gate of report.gates) {
    if (!gate.id || !gate.lane || !gate.product_area) failures.push(`gate metadata incomplete: ${gate.id || 'unknown'}`);
    if (!gate.acceptance_state.startsWith('blocked')) failures.push(`${gate.id} must remain blocked until live evidence exists`);
    if (gate.capability_claim_allowed !== false) failures.push(`${gate.id} must not allow capability claims`);
    if (!Array.isArray(gate.blocked_on) || gate.blocked_on.length === 0) failures.push(`${gate.id} must name blocked inputs`);
    if (gate.command_available && !gate.acceptance_command) failures.push(`${gate.id} marks command available without a command`);
  }
  return failures;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Live Acceptance Gate Status');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push(`- blocked: ${report.summary.blocked}/${report.summary.total}`);
  lines.push(`- command_available: ${report.summary.command_available}/${report.summary.total}`);
  lines.push(`- missing_acceptance_command: ${report.summary.missing_acceptance_command}/${report.summary.total}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  lines.push('| gate | lane | state | command | blocked on | next action |');
  lines.push('|---|---|---|---|---|---|');
  for (const gate of report.gates) {
    const command = gate.acceptance_command ? `\`${gate.acceptance_command}\`` : 'missing';
    lines.push(`| ${gate.id} | ${gate.lane} | ${gate.acceptance_state} | ${command} | ${gate.blocked_on.join(', ')} | ${String(gate.next_action).replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This status packet is CI-safe. It does not run paid compute, make billed');
  lines.push('inference calls, mutate provider routing, remove production artifacts, or');
  lines.push('turn blocked capabilities into product claims. It keeps live acceptance gates');
  lines.push('visible until their own proof commands and external inputs exist.');
  lines.push('');
  if (report.validation_failures.length > 0) {
    lines.push('## Validation Failures');
    lines.push('');
    for (const failure of report.validation_failures) {
      lines.push(`- ${failure}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir = OUTPUT_DIR_DEFAULT) {
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

function runLiveAcceptanceGateStatus(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_LIVE_ACCEPTANCE_STATUS_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const gates = LIVE_ACCEPTANCE_GATES.map(cloneGate);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:live-acceptance-status',
    mode: 'ci_safe_status_packet',
    summary: buildSummary(gates),
    gates,
    validation_failures: [],
    artifacts: {},
  };
  report.validation_failures = validateReport(report);
  report.verdict = report.validation_failures.length === 0 ? 'PASS' : 'FAIL';
  writeReport(report, outputDir);
  return report;
}

function printSummary(report) {
  console.log(`Live acceptance gate status: ${report.verdict}`);
  console.log(`Blocked: ${report.summary.blocked}/${report.summary.total}`);
  console.log(`Command available: ${report.summary.command_available}/${report.summary.total}`);
  console.log(`Missing acceptance command: ${report.summary.missing_acceptance_command}/${report.summary.total}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const gate of report.gates) {
    console.log(`${gate.acceptance_state.toUpperCase()} ${gate.id}`);
  }
}

if (require.main === module) {
  const report = runLiveAcceptanceGateStatus();
  printSummary(report);
  if (report.verdict !== 'PASS') {
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  LIVE_ACCEPTANCE_GATES,
  PROOF_PREFIX,
  buildSummary,
  runLiveAcceptanceGateStatus,
  validateReport,
  writeReport,
};
