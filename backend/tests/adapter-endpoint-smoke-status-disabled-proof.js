#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
  buildAdapterEndpointSmokeStatusDisabledResponse,
} = require('../src/services/adapterEndpointSmokeReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-endpoint-smoke-status-disabled-proof';
const CONTRACT = 'dcp.adapter_endpoint_smoke_status_disabled_proof.v1';

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

function buildDeployment(overrides = {}) {
  return {
    deployment_id: 'adpl_smokestatus',
    renter_id: 42,
    adapter_id: 'adpt_smokestatus',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'endpoint-smoke-status-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_smokestatus',
      adapter_id: 'adpt_smokestatus',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'endpoint-smoke-status-prod',
      artifact_checksum_sha256: 'a'.repeat(64),
      provider_id: 'provider-smoke-status-1',
    },
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Endpoint Smoke Status Disabled Proof');
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
    strict_load_status: report.strict_load_status,
    pending_load_status: report.pending_load_status,
    raw_payload_guard: report.raw_payload_guard,
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
  lines.push('This proof is CI-safe and read-only. It does not dispatch adapter');
  lines.push('inference, record endpoint smoke, attach load proof, route traffic,');
  lines.push('write usage rows, mutate balances, create invoices, settle payouts,');
  lines.push('or expose raw prompt/response content.');
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

function runAdapterEndpointSmokeStatusDisabledProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_ENDPOINT_SMOKE_STATUS_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-endpoint-smoke-status',
    mode: 'ci_safe_adapter_endpoint_smoke_status_disabled',
    claims: {
      disabled_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      returns_recorded_smoke: false,
      dispatches_inference: false,
      records_smoke_result: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      exposes_raw_prompt: false,
      exposes_raw_response: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    strict_load_status: {},
    pending_load_status: {},
    raw_payload_guard: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const strictLoadStatus = buildAdapterEndpointSmokeStatusDisabledResponse({
      deployment: buildDeployment(),
    }, new Date('2026-07-09T08:45:00.000Z'));
    const pendingLoadStatus = buildAdapterEndpointSmokeStatusDisabledResponse({
      deployment: buildDeployment({
        route_traffic: false,
        serving_load_proof: null,
      }),
    }, new Date('2026-07-09T08:45:00.000Z'));
    const rawPayloadStatus = buildAdapterEndpointSmokeStatusDisabledResponse({
      deployment: buildDeployment({
        raw_prompt: 'raw prompt must not appear',
        raw_response: 'raw response must not appear',
      }),
    }, new Date('2026-07-09T08:45:00.000Z'));

    report.strict_load_status = strictLoadStatus;
    report.pending_load_status = pendingLoadStatus;
    report.raw_payload_guard = {
      serialized_contains_raw_prompt: JSON.stringify(rawPayloadStatus).includes('raw prompt must not appear'),
      serialized_contains_raw_response: JSON.stringify(rawPayloadStatus).includes('raw response must not appear'),
      response: rawPayloadStatus,
    };

    record(
      'strict load proof status remains no-record while recording is disabled',
      strictLoadStatus.object === 'adapter_endpoint_smoke_status_disabled'
        && strictLoadStatus.version === ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION
        && strictLoadStatus.endpoint_smoke_status_endpoint_live === true
        && strictLoadStatus.endpoint_smoke_recording_enabled === false
        && strictLoadStatus.endpoint_smoke_recorded === false
        && strictLoadStatus.latest_smoke_result === null
        && strictLoadStatus.readiness.strict_load_proof_match === true,
      'A strict load proof can make status ready for a future smoke, but cannot create recorded smoke.',
    );

    record(
      'missing load proof is visible without recording smoke',
      pendingLoadStatus.endpoint_smoke_recording_enabled === false
        && pendingLoadStatus.endpoint_smoke_recorded === false
        && pendingLoadStatus.readiness.strict_load_proof_match === false
        && pendingLoadStatus.readiness.missing_before_recording.includes('strict_load_proof_match'),
      'The status route names the missing proof input and remains read-only.',
    );

    record(
      'status contract never exposes raw prompt or response content',
      report.raw_payload_guard.serialized_contains_raw_prompt === false
        && report.raw_payload_guard.serialized_contains_raw_response === false
        && rawPayloadStatus.claim_guards.exposes_raw_prompt === false
        && rawPayloadStatus.claim_guards.exposes_raw_response === false,
      'Status returns deployment attribution and gates only, never raw request/response payloads.',
    );

    record(
      'proof performs no smoke usage route or money mutation',
      report.claims.endpoint_smoke_recording_enabled === false
        && report.claims.returns_recorded_smoke === false
        && report.claims.dispatches_inference === false
        && report.claims.records_smoke_result === false
        && report.claims.attaches_load_proof === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false,
      'All smoke, routing, usage, billing, and settlement side effects stay disabled.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_endpoint_smoke_status_disabled_proof_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

function printSummary(report) {
  console.log(`Adapter endpoint smoke status disabled proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  for (const invariant of report.invariants) {
    console.log(`${invariant.passed ? 'PASS' : 'FAIL'} ${invariant.name}`);
  }
  if (report.failure) {
    console.error(`${report.failure.code}: ${report.failure.message}`);
  }
}

if (require.main === module) {
  const report = runAdapterEndpointSmokeStatusDisabledProof();
  printSummary(report);
  if (report.verdict !== 'PASS') {
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runAdapterEndpointSmokeStatusDisabledProof,
};
