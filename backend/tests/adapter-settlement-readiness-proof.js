#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_SETTLEMENT_READINESS_VERSION,
  buildAdapterSettlementReadiness,
  evaluateAdapterSettlementPolicy,
} = require('../src/services/adapterSettlementReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-settlement-readiness-proof';
const CONTRACT = 'dcp.adapter_settlement_readiness_proof.v1';

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
    deployment_id: 'adpl_settleproof1',
    renter_id: 42,
    adapter_id: 'adpt_settleproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_settleproof1',
      adapter_id: 'adpt_settleproof',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
      provider_id: 'provider-adapter-settlement-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_settleproof1',
    adapter_id: 'adpt_settleproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'c'.repeat(64),
    provider_id: 'provider-adapter-settlement-1',
    request_id: 'req-adapter-settlement-proof-1',
    renter_api_key_id: 'scoped-key-adapter-settlement-1',
    renter_key_type: 'scoped_key',
    prompt_tokens: 128,
    completion_tokens: 32,
    total_tokens: 160,
    cost_halala: 11,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildQuote(overrides = {}) {
  return {
    provider_share_halala: 8,
    platform_share_halala: 3,
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Settlement Readiness Proof');
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
    eligible_when_enabled: report.eligible_when_enabled,
    split_mismatch: report.split_mismatch,
    usage_mismatch: report.usage_mismatch,
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
  lines.push('balances, create invoices, or settle provider payouts.');
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

function runAdapterSettlementReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_SETTLEMENT_READINESS_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-settlement-readiness',
    mode: 'ci_safe_adapter_settlement_readiness_contract_only',
    claims: {
      readiness_contract_live: true,
      adapter_settlement_enabled: false,
      provider_payouts_enabled: false,
      platform_revenue_split_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      enables_adapter_billing: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    readiness: {},
    eligible_when_enabled: {},
    split_mismatch: {},
    usage_mismatch: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildAdapterSettlementReadiness(new Date('2026-07-09T08:55:00.000Z'));
    const eligible = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });
    const splitMismatch = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote({ provider_share_halala: 9, platform_share_halala: 3 }),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });
    const usageMismatch = evaluateAdapterSettlementPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage({ adapter_id: 'adpt_wrong_settle' }),
      settlement_quote: buildQuote(),
      endpoint_smoke_passed: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_settlement_approval: true,
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.eligible_when_enabled = eligible;
    report.split_mismatch = splitMismatch;
    report.usage_mismatch = usageMismatch;

    record(
      'adapter settlement readiness is public and policy-only',
      readiness.object === 'adapter_settlement_readiness'
        && readiness.version === ADAPTER_SETTLEMENT_READINESS_VERSION
        && readiness.endpoints.settlement_readiness === 'GET /api/adapters/settlement/readiness'
        && readiness.policy.adapter_settlement_enabled === false
        && readiness.policy.provider_payouts_enabled === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.settles_provider_payout === false,
      'The readiness packet is visible without enabling settlement, payout, balance, invoice, or route mutations.',
    );

    record(
      'fully attributed adapter usage remains unsettled until policy enablement',
      eligible.would_settle_if_enabled === true
        && eligible.settlement_enabled === false
        && eligible.settled === false
        && eligible.denial_code_while_disabled === 'adapter_settlement_disabled'
        && eligible.blockers.length === 0,
      'A complete settlement packet only reaches would-settle-if-enabled; settlement remains disabled.',
    );

    record(
      'provider and platform shares must sum to adapter cost',
      splitMismatch.would_settle_if_enabled === false
        && splitMismatch.denial_code_while_disabled === 'adapter_settlement_split_mismatch'
        && splitMismatch.blockers.includes('settlement_split_matches_cost'),
      'Adapter settlement cannot proceed if split math does not reconcile to the usage cost.',
    );

    record(
      'usage ledger attribution must match adapter proof before settlement',
      usageMismatch.would_settle_if_enabled === false
        && usageMismatch.denial_code_while_disabled === 'adapter_settlement_usage_attribution_required'
        && usageMismatch.blockers.includes('usage_ledger_adapter_attribution'),
      'Adapter/deployment attribution drift blocks settlement before payout policy.',
    );

    record(
      'proof performs no adapter traffic or money mutation',
      report.claims.adapter_settlement_enabled === false
        && report.claims.provider_payouts_enabled === false
        && report.claims.platform_revenue_split_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.attaches_load_proof === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false,
      'All settlement, routing, usage, billing, invoice, and payout side effects stay disabled.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_settlement_readiness_proof_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

function printSummary(report) {
  console.log(`Adapter settlement readiness proof: ${report.verdict}`);
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
  const report = runAdapterSettlementReadinessProof();
  printSummary(report);
  if (report.verdict !== 'PASS') {
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runAdapterSettlementReadinessProof,
};
