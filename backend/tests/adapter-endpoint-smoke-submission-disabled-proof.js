#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
  buildAdapterEndpointSmokeDisabledResponse,
} = require('../src/services/adapterEndpointSmokeReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-endpoint-smoke-submission-disabled-proof';
const CONTRACT = 'dcp.adapter_endpoint_smoke_submission_disabled_proof.v1';

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
    deployment_id: 'adpl_smokesubmit',
    renter_id: 42,
    adapter_id: 'adpt_smokesubmit',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'endpoint-smoke-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_smokesubmit',
      adapter_id: 'adpt_smokesubmit',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'endpoint-smoke-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
      provider_id: 'provider-smoke-submit-1',
    },
    ...overrides,
  };
}

function buildSmoke(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_smokesubmit',
    adapter_id: 'adpt_smokesubmit',
    endpoint_id: 'endpoint-smoke-prod',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    artifact_checksum_sha256: 'e'.repeat(64),
    provider_id: 'provider-smoke-submit-1',
    request_id: 'req-adapter-smoke-submit-1',
    status_code: 200,
    latency_ms: 875,
    response_checksum_sha256: 'f'.repeat(64),
    prompt_tokens: 28,
    completion_tokens: 12,
    total_tokens: 40,
    finish_reason: 'stop',
    adapter_trace: {
      routed_through_adapter: true,
      deployment_id: 'adpl_smokesubmit',
      adapter_id: 'adpt_smokesubmit',
      endpoint_id: 'endpoint-smoke-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
    },
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Endpoint Smoke Submission Disabled Proof');
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
    complete_submission: report.complete_submission,
    endpoint_mismatch: report.endpoint_mismatch,
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

function runAdapterEndpointSmokeSubmissionDisabledProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_ENDPOINT_SMOKE_SUBMISSION_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-endpoint-smoke-submission',
    mode: 'ci_safe_adapter_endpoint_smoke_submission_disabled',
    claims: {
      disabled_submission_endpoint_live: true,
      endpoint_smoke_submission_live: false,
      endpoint_smoke_recording_enabled: false,
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
    complete_submission: {},
    endpoint_mismatch: {},
    raw_payload_guard: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const completeSubmission = buildAdapterEndpointSmokeDisabledResponse({
      deployment: buildDeployment(),
      smoke_result: buildSmoke(),
      funded_smoke_principal: true,
    }, new Date('2026-07-09T08:30:00.000Z'));
    const endpointMismatch = buildAdapterEndpointSmokeDisabledResponse({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ endpoint_id: 'wrong-endpoint' }),
      funded_smoke_principal: true,
    }, new Date('2026-07-09T08:30:00.000Z'));
    const rawPayloadGuard = buildAdapterEndpointSmokeDisabledResponse({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({
        raw_prompt: 'raw prompt must not be echoed',
        raw_response: 'raw response must not be echoed',
      }),
      funded_smoke_principal: true,
    }, new Date('2026-07-09T08:30:00.000Z'));

    report.complete_submission = completeSubmission;
    report.endpoint_mismatch = endpointMismatch;
    report.raw_payload_guard = {
      serialized_contains_raw_prompt: JSON.stringify(rawPayloadGuard).includes('raw prompt must not be echoed'),
      serialized_contains_raw_response: JSON.stringify(rawPayloadGuard).includes('raw response must not be echoed'),
      response: rawPayloadGuard,
    };

    record(
      'complete endpoint smoke submission remains disabled',
      completeSubmission.object === 'adapter_endpoint_smoke_submission_disabled'
        && completeSubmission.version === ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION
        && completeSubmission.endpoint_smoke_submission_live === false
        && completeSubmission.endpoint_smoke_recording_enabled === false
        && completeSubmission.recorded === false
        && completeSubmission.would_record_if_enabled === true
        && completeSubmission.denial_code === 'adapter_endpoint_smoke_disabled',
      'A valid smoke payload is accepted only as would-record-if-enabled and is not persisted.',
    );

    record(
      'endpoint drift blocks disabled smoke submission',
      endpointMismatch.recorded === false
        && endpointMismatch.would_record_if_enabled === false
        && endpointMismatch.denial_code === 'adapter_endpoint_smoke_request_required'
        && endpointMismatch.evaluation.blockers.includes('smoke_request_attribution'),
      'Disabled submission still evaluates attribution blockers before future recording.',
    );

    record(
      'disabled smoke submission never exposes raw prompt or response content',
      report.raw_payload_guard.serialized_contains_raw_prompt === false
        && report.raw_payload_guard.serialized_contains_raw_response === false
        && rawPayloadGuard.claim_guards.exposes_raw_prompt === false
        && rawPayloadGuard.claim_guards.exposes_raw_response === false,
      'Only hashed smoke evidence is allowed in the disabled contract.',
    );

    record(
      'proof performs no smoke usage route or money mutation',
      report.claims.endpoint_smoke_submission_live === false
        && report.claims.endpoint_smoke_recording_enabled === false
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
      code: error.code || 'adapter_endpoint_smoke_submission_disabled_proof_failed',
      message: error.message,
      details: error.details || {},
      stack: process.env.CI ? undefined : error.stack,
    };
    report.verdict = 'FAIL';
  }

  writeReport(report, outputDir);
  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure ? report.failure.message : 'adapter endpoint smoke submission disabled proof failed');
    error.report = report;
    throw error;
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runAdapterEndpointSmokeSubmissionDisabledProof();
    console.log(`[adapter-endpoint-smoke-submission-disabled-proof] PASS ${JSON.stringify(report.artifacts)}`);
  } catch (error) {
    const report = error.report;
    console.error('[adapter-endpoint-smoke-submission-disabled-proof] FAIL', report ? JSON.stringify(report.failure, null, 2) : error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runAdapterEndpointSmokeSubmissionDisabledProof,
  buildDeployment,
  buildSmoke,
};
