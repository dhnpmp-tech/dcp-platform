#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { TINKER_LOOP_PRIMITIVES } = require('../src/services/loraTrainingContract');
const { buildLoraReadiness } = require('../src/routes/lora');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'tinker-loop-readiness-contract-proof';
const CONTRACT = 'dcp.tinker_loop_readiness_contract_proof.v1';

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

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Tinker Loop Readiness Contract Proof');
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
  lines.push('## Contract Snapshot');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    readiness: report.readiness,
    tinker_loop: report.tinker_loop,
    claim_guards: report.claim_guards,
    claims: report.claims,
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe. It reads the LoRA readiness contract in process and');
  lines.push('verifies that Tinker-style local-loop primitives are visible only as disabled');
  lines.push('readiness gates. It does not create sessions, run GPU training, perform');
  lines.push('forward/backward passes, save adapter weights, route adapter traffic, bill');
  lines.push('training steps, or claim compatibility with the Tinker API.');
  lines.push('');
  if (report.failure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- message: ${report.failure.message}`);
    lines.push('');
  }
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

async function runTinkerLoopReadinessContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_TINKER_LOOP_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const readiness = buildLoraReadiness(new Date('2026-07-09T02:30:00.000Z'));
  const tinkerLoop = readiness.tinker_loop || {};
  const claimGuards = readiness.claim_guards || {};
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:tinker-loop-readiness',
    mode: 'ci_safe_in_process_contract',
    readiness: {
      object: readiness.object,
      version: readiness.version,
      current_mode: readiness.current_mode,
      endpoint: readiness.endpoints?.readiness || null,
    },
    tinker_loop: tinkerLoop,
    claim_guards: claimGuards,
    claims: {
      creates_tinker_session: false,
      runs_remote_training_loop: false,
      exposes_forward_backward_api: false,
      saves_adapter_weights: false,
      routes_adapter_traffic: false,
      bills_training_steps: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    record(
      'LoRA readiness remains the source contract',
      readiness.object === 'lora_readiness'
        && readiness.version === 'dcp.lora_readiness.v1'
        && readiness.endpoints?.readiness === 'GET /api/lora/readiness',
      'Tinker-style loop status is embedded in the existing LoRA readiness source.',
    );

    record(
      'Tinker loop is visible but not available',
      tinkerLoop.status === 'contract_only'
        && tinkerLoop.available === false
        && tinkerLoop.api_available === false
        && tinkerLoop.compatibility_claim_allowed === false
        && tinkerLoop.tinker_api_compatible === false,
      'The contract publishes the future rail without claiming compatibility or API availability.',
    );

    const primitives = tinkerLoop.primitives || {};
    const primitiveNames = Object.keys(primitives);
    const allPrimitivesBlocked = TINKER_LOOP_PRIMITIVES.every((primitive) => {
      const entry = primitives[primitive] || {};
      return entry.status === 'not_enabled'
        && entry.available === false
        && entry.endpoint === null
        && entry.mutates_training_state === false
        && Array.isArray(entry.requires_before_enablement)
        && entry.requires_before_enablement.includes('GPU-host proof');
    });
    record(
      'low-level loop primitives have no enabled endpoint',
      primitiveNames.join(',') === TINKER_LOOP_PRIMITIVES.join(',') && allPrimitivesBlocked,
      'create_lora, forward_backward, optimizer_step, save_weights, sample, and evaluate are all gated.',
    );

    record(
      'proof prerequisites name GPU, artifact, billing, and deployment gates',
      Array.isArray(tinkerLoop.required_before_enablement)
        && tinkerLoop.required_before_enablement.includes('GPU-host executor proof for forward/backward/optimizer/save')
        && tinkerLoop.required_before_enablement.includes('adapter checkpoint checksum and model-card manifest')
        && tinkerLoop.required_before_enablement.includes('billing or no-billing policy for training steps')
        && tinkerLoop.required_before_enablement.includes('adapter registry link and vLLM load-proof handoff'),
      'The next work is explicit before any local-loop API is advertised.',
    );

    record(
      'claim guards stay false for Tinker and money mutations',
      claimGuards.tinker_compatible === false
        && claimGuards.tinker_style_loop_enabled === false
        && claimGuards.tinker_low_level_api_enabled === false
        && claimGuards.public_training_enabled === false
        && claimGuards.public_serving_enabled === false
        && tinkerLoop.safety?.runs_remote_gpu_loop === false
        && tinkerLoop.safety?.creates_training_job === false
        && tinkerLoop.safety?.writes_adapter_weights === false
        && tinkerLoop.safety?.bills_training_steps === false
        && tinkerLoop.safety?.claims_tinker_compatibility === false,
      'No training, serving, billing, or compatibility claim is enabled by this contract.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'tinker_loop_readiness_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  } finally {
    writeReport(report, outputDir);
  }

  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure?.message || 'Tinker loop readiness contract proof failed');
    error.report = report;
    throw error;
  }

  return report;
}

if (require.main === module) {
  runTinkerLoopReadinessContractProof()
    .then((report) => {
      console.log('Tinker loop readiness contract proof: PASS');
      console.log(`JSON report: ${report.artifacts.json}`);
      console.log(`Markdown report: ${report.artifacts.markdown}`);
    })
    .catch((error) => {
      const report = error.report;
      console.error('Tinker loop readiness contract proof: FAIL');
      if (report?.failure) console.error(`${report.failure.code}: ${report.failure.message}`);
      else console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  CONTRACT,
  runTinkerLoopReadinessContractProof,
};
