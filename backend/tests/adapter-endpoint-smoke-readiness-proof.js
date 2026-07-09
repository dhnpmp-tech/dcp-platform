#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION,
  buildAdapterEndpointSmokeReadiness,
  evaluateAdapterEndpointSmoke,
} = require('../src/services/adapterEndpointSmokeReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-endpoint-smoke-readiness-proof';
const CONTRACT = 'dcp.adapter_endpoint_smoke_readiness_proof.v1';

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
    deployment_id: 'adpl_smokeproof1',
    renter_id: 42,
    adapter_id: 'adpt_smokeproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_smokeproof1',
      adapter_id: 'adpt_smokeproof',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
      provider_id: 'provider-adapter-smoke-1',
    },
    ...overrides,
  };
}

function buildSmoke(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_smokeproof1',
    adapter_id: 'adpt_smokeproof',
    endpoint_id: 'arabic-support-prod',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    artifact_checksum_sha256: 'e'.repeat(64),
    provider_id: 'provider-adapter-smoke-1',
    request_id: 'req-adapter-smoke-proof-1',
    status_code: 200,
    latency_ms: 842,
    response_checksum_sha256: 'f'.repeat(64),
    prompt_tokens: 24,
    completion_tokens: 12,
    total_tokens: 36,
    finish_reason: 'stop',
    adapter_trace: {
      routed_through_adapter: true,
      deployment_id: 'adpl_smokeproof1',
      adapter_id: 'adpt_smokeproof',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
    },
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Endpoint Smoke Readiness Proof');
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
    readiness: report.readiness,
    complete_smoke: report.complete_smoke,
    missing_load_proof: report.missing_load_proof,
    endpoint_mismatch: report.endpoint_mismatch,
    bad_usage: report.bad_usage,
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
  lines.push('inference, record smoke results, attach load proof, route traffic,');
  lines.push('record usage, mutate balances, create invoices, or settle payouts.');
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

function runAdapterEndpointSmokeReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_ENDPOINT_SMOKE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-endpoint-smoke',
    mode: 'ci_safe_adapter_endpoint_smoke_contract_only',
    claims: {
      readiness_contract_live: true,
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
    readiness: {},
    complete_smoke: {},
    missing_load_proof: {},
    endpoint_mismatch: {},
    bad_usage: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildAdapterEndpointSmokeReadiness(new Date('2026-07-09T07:45:00.000Z'));
    const completeSmoke = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke(),
      funded_smoke_principal: true,
    });
    const missingLoadProof = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      smoke_result: buildSmoke(),
      funded_smoke_principal: true,
    });
    const endpointMismatch = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ endpoint_id: 'wrong-endpoint' }),
      funded_smoke_principal: true,
    });
    const badUsage = evaluateAdapterEndpointSmoke({
      deployment: buildDeployment(),
      smoke_result: buildSmoke({ total_tokens: 35 }),
      funded_smoke_principal: true,
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.complete_smoke = completeSmoke;
    report.missing_load_proof = missingLoadProof;
    report.endpoint_mismatch = endpointMismatch;
    report.bad_usage = badUsage;

    record(
      'adapter endpoint smoke readiness is public and contract-only',
      readiness.object === 'adapter_endpoint_smoke_readiness'
        && readiness.version === ADAPTER_ENDPOINT_SMOKE_READINESS_VERSION
        && readiness.endpoints.endpoint_smoke_readiness === 'GET /api/adapters/endpoints/smoke/readiness'
        && readiness.policy.endpoint_smoke_recording_enabled === false
        && readiness.policy.adapter_endpoint_routing_enabled === false
        && readiness.claim_guards.records_smoke_result === false
        && readiness.claim_guards.routes_adapter_traffic === false,
      'The readiness packet is visible without dispatching inference, recording smoke, or routing traffic.',
    );

    record(
      'complete endpoint smoke remains disabled until smoke recording is enabled',
      completeSmoke.would_pass_if_enabled === true
        && completeSmoke.endpoint_smoke_recording_enabled === false
        && completeSmoke.passed === false
        && completeSmoke.denial_code_while_disabled === 'adapter_endpoint_smoke_disabled'
        && completeSmoke.blockers.length === 0,
      'A complete smoke result only reaches would-pass-if-enabled.',
    );

    record(
      'missing strict load proof blocks endpoint smoke',
      missingLoadProof.would_pass_if_enabled === false
        && missingLoadProof.denial_code_while_disabled === 'adapter_endpoint_smoke_load_proof_required'
        && missingLoadProof.blockers.includes('strict_load_proof_match'),
      'Endpoint smoke cannot pass from deployment intent alone.',
    );

    record(
      'endpoint attribution drift blocks endpoint smoke',
      endpointMismatch.would_pass_if_enabled === false
        && endpointMismatch.denial_code_while_disabled === 'adapter_endpoint_smoke_request_required'
        && endpointMismatch.blockers.includes('smoke_request_attribution'),
      'Smoke request evidence must match deployment, adapter, endpoint, base model, and checksum.',
    );

    record(
      'token totals must be coherent before endpoint smoke can pass',
      badUsage.would_pass_if_enabled === false
        && badUsage.denial_code_while_disabled === 'adapter_endpoint_smoke_usage_required'
        && badUsage.blockers.includes('smoke_usage_tokens'),
      'Prompt/completion/total token fields must be coherent before usage attribution or billing.',
    );

    record(
      'proof performs no adapter traffic smoke usage or money mutation',
      report.claims.endpoint_smoke_recording_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.records_smoke_result === false
        && report.claims.attaches_load_proof === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false,
      'All smoke, traffic, usage, billing, and settlement side effects stay disabled.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_endpoint_smoke_readiness_proof_failed',
      message: error.message,
      details: error.details || {},
      stack: process.env.CI ? undefined : error.stack,
    };
    report.verdict = 'FAIL';
  }

  writeReport(report, outputDir);
  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure ? report.failure.message : 'adapter endpoint smoke readiness proof failed');
    error.report = report;
    throw error;
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runAdapterEndpointSmokeReadinessProof();
    console.log(`[adapter-endpoint-smoke-readiness-proof] PASS ${JSON.stringify(report.artifacts)}`);
  } catch (error) {
    const report = error.report;
    console.error('[adapter-endpoint-smoke-readiness-proof] FAIL', report ? JSON.stringify(report.failure, null, 2) : error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runAdapterEndpointSmokeReadinessProof,
  buildDeployment,
  buildSmoke,
};
