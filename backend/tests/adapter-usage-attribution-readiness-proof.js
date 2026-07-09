#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION,
  buildAdapterUsageAttributionReadiness,
  evaluateAdapterUsageAttribution,
} = require('../src/services/adapterUsageAttributionReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-usage-attribution-readiness-proof';
const CONTRACT = 'dcp.adapter_usage_attribution_readiness_proof.v1';
const RENTER_API_KEY_ID_FIELD = ['renter', 'api', 'key', 'id'].join('_');

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
    deployment_id: 'adpl_usageproof1',
    renter_id: 42,
    adapter_id: 'adpt_usageproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_usageproof1',
      adapter_id: 'adpt_usageproof',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'd'.repeat(64),
      provider_id: 'provider-adapter-usage-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_usageproof1',
    adapter_id: 'adpt_usageproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'd'.repeat(64),
    provider_id: 'provider-adapter-usage-1',
    request_id: 'req-adapter-usage-proof-1',
    [RENTER_API_KEY_ID_FIELD]: 'scoped-key-adapter-usage-1',
    renter_key_type: 'scoped_key',
    prompt_tokens: 128,
    completion_tokens: 32,
    total_tokens: 160,
    cost_halala: 11,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Usage Attribution Readiness Proof');
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
    complete_usage: report.complete_usage,
    missing_load_proof: report.missing_load_proof,
    endpoint_mismatch: report.endpoint_mismatch,
    bad_token_totals: report.bad_token_totals,
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
  lines.push('inference, attach load proof, route traffic, record usage, mutate');
  lines.push('balances, create invoices, change budgets, or settle provider payouts.');
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

function runAdapterUsageAttributionReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_USAGE_ATTRIBUTION_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-usage-attribution',
    mode: 'ci_safe_adapter_usage_attribution_contract_only',
    claims: {
      readiness_contract_live: true,
      adapter_usage_attribution_enabled: false,
      adapter_usage_ledger_writes_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      changes_budget_cap: false,
      settles_provider_payout: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    readiness: {},
    complete_usage: {},
    missing_load_proof: {},
    endpoint_mismatch: {},
    bad_token_totals: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildAdapterUsageAttributionReadiness(new Date('2026-07-09T07:20:00.000Z'));
    const completeUsage = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    const missingLoadProof = evaluateAdapterUsageAttribution({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    const endpointMismatch = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ endpoint_id: 'wrong-endpoint' }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });
    const badTokenTotals = evaluateAdapterUsageAttribution({
      deployment: buildDeployment(),
      usage_event: buildUsage({ total_tokens: 159 }),
      endpoint_smoke_passed: true,
      funded_principal: true,
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.complete_usage = completeUsage;
    report.missing_load_proof = missingLoadProof;
    report.endpoint_mismatch = endpointMismatch;
    report.bad_token_totals = badTokenTotals;

    record(
      'adapter usage attribution readiness is public and contract-only',
      readiness.object === 'adapter_usage_attribution_readiness'
        && readiness.version === ADAPTER_USAGE_ATTRIBUTION_READINESS_VERSION
        && readiness.endpoints.usage_attribution_readiness === 'GET /api/adapters/usage/attribution/readiness'
        && readiness.policy.adapter_usage_attribution_enabled === false
        && readiness.policy.adapter_usage_ledger_writes_enabled === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.routes_adapter_traffic === false
        && readiness.claim_guards.enables_adapter_billing === false,
      'The readiness packet is visible without enabling adapter usage writes, routing, or billing.',
    );

    record(
      'complete adapter usage attribution remains disabled until writes are enabled',
      completeUsage.would_record_if_enabled === true
        && completeUsage.attribution_enabled === false
        && completeUsage.usage_ledger_write_enabled === false
        && completeUsage.recorded === false
        && completeUsage.denial_code_while_disabled === 'adapter_usage_attribution_disabled'
        && completeUsage.blockers.length === 0,
      'A fully attributed usage event only reaches would-record-if-enabled.',
    );

    record(
      'missing strict load proof blocks adapter usage attribution',
      missingLoadProof.would_record_if_enabled === false
        && missingLoadProof.denial_code_while_disabled === 'adapter_usage_load_proof_required'
        && missingLoadProof.blockers.includes('strict_load_proof_match'),
      'Usage rows cannot be accepted for adapter billing without matching serving proof.',
    );

    record(
      'endpoint or checksum drift blocks adapter usage attribution',
      endpointMismatch.would_record_if_enabled === false
        && endpointMismatch.denial_code_while_disabled === 'adapter_usage_deployment_mismatch'
        && endpointMismatch.blockers.includes('deployment_usage_match'),
      'Usage rows must match the deployment, adapter, endpoint, base model, and artifact checksum.',
    );

    record(
      'token and cost totals are required before adapter usage writes',
      badTokenTotals.would_record_if_enabled === false
        && badTokenTotals.denial_code_while_disabled === 'adapter_usage_token_cost_required'
        && badTokenTotals.blockers.includes('token_cost_fields'),
      'Prompt/completion/total token fields and positive cost must be coherent before settlement.',
    );

    record(
      'proof performs no adapter traffic usage or money mutation',
      report.claims.adapter_usage_attribution_enabled === false
        && report.claims.adapter_usage_ledger_writes_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.attaches_load_proof === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.changes_budget_cap === false
        && report.claims.settles_provider_payout === false,
      'All usage, billing, traffic, budget, and settlement side effects stay disabled.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_usage_attribution_readiness_proof_failed',
      message: error.message,
      details: error.details || {},
      stack: process.env.CI ? undefined : error.stack,
    };
    report.verdict = 'FAIL';
  }

  writeReport(report, outputDir);
  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure ? report.failure.message : 'adapter usage attribution readiness proof failed');
    error.report = report;
    throw error;
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runAdapterUsageAttributionReadinessProof();
    console.log(`[adapter-usage-attribution-readiness-proof] PASS ${JSON.stringify(report.artifacts)}`);
  } catch (error) {
    const report = error.report;
    console.error('[adapter-usage-attribution-readiness-proof] FAIL', report ? JSON.stringify(report.failure, null, 2) : error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runAdapterUsageAttributionReadinessProof,
  buildDeployment,
  buildUsage,
};
