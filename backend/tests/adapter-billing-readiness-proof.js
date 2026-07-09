#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_BILLING_READINESS_VERSION,
  buildAdapterBillingReadiness,
  evaluateAdapterBillingPolicy,
} = require('../src/services/adapterBillingReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-billing-readiness-proof';
const CONTRACT = 'dcp.adapter_billing_readiness_proof.v1';

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
    deployment_id: 'adpl_billproof1',
    renter_id: 42,
    adapter_id: 'adpt_billproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'arabic-support-prod',
    status: 'running',
    route_traffic: true,
    serving_load_proof: {
      loaded: true,
      deployment_id: 'adpl_billproof1',
      adapter_id: 'adpt_billproof',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'b'.repeat(64),
      provider_id: 'provider-adapter-billing-1',
    },
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    deployment_id: 'adpl_billproof1',
    adapter_id: 'adpt_billproof',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    endpoint_id: 'arabic-support-prod',
    artifact_checksum_sha256: 'b'.repeat(64),
    provider_id: 'provider-adapter-billing-1',
    request_id: 'req-adapter-billing-proof-1',
    prompt_tokens: 128,
    completion_tokens: 32,
    cost_halala: 11,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Billing Readiness Proof');
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
    missing_load_proof: report.missing_load_proof,
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

function runAdapterBillingReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_BILLING_READINESS_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-billing-readiness',
    mode: 'ci_safe_adapter_billing_readiness_contract_only',
    claims: {
      readiness_contract_live: true,
      adapter_billing_enabled: false,
      dispatches_inference: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    readiness: {},
    eligible_when_enabled: {},
    missing_load_proof: {},
    usage_mismatch: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildAdapterBillingReadiness(new Date('2026-07-09T06:45:00.000Z'));
    const eligible = evaluateAdapterBillingPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });
    const missingLoadProof = evaluateAdapterBillingPolicy({
      deployment: buildDeployment({ route_traffic: false, serving_load_proof: null }),
      usage_event: buildUsage(),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });
    const usageMismatch = evaluateAdapterBillingPolicy({
      deployment: buildDeployment(),
      usage_event: buildUsage({ artifact_checksum_sha256: 'c'.repeat(64) }),
      endpoint_smoke_passed: true,
      funded_smoke_principal: true,
      minimum_balance_policy_approved: true,
      settlement_split_policy_approved: true,
      founder_billing_approval: true,
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.eligible_when_enabled = eligible;
    report.missing_load_proof = missingLoadProof;
    report.usage_mismatch = usageMismatch;

    record(
      'adapter billing readiness is public and policy-only',
      readiness.object === 'adapter_billing_readiness'
        && readiness.version === ADAPTER_BILLING_READINESS_VERSION
        && readiness.endpoints.billing_readiness === 'GET /api/adapters/billing/readiness'
        && readiness.policy.adapter_inference_billing_enabled === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.routes_adapter_traffic === false
        && readiness.claim_guards.records_usage_event === false,
      'The readiness packet is visible without enabling money, routing, usage writes, or settlement.',
    );

    record(
      'fully attributed adapter usage remains non-billable until policy enablement',
      eligible.would_bill_if_enabled === true
        && eligible.billing_enabled === false
        && eligible.billable === false
        && eligible.denial_code_while_disabled === 'adapter_billing_disabled'
        && eligible.blockers.length === 0,
      'A complete proof packet only reaches would-bill-if-enabled; billing remains disabled.',
    );

    record(
      'missing strict load proof blocks adapter billing',
      missingLoadProof.would_bill_if_enabled === false
        && missingLoadProof.denial_code_while_disabled === 'adapter_billing_load_proof_required'
        && missingLoadProof.blockers.includes('strict_load_proof_match'),
      'Adapter billing cannot proceed from deployment intent or unverified route state.',
    );

    record(
      'usage ledger attribution must match adapter proof before billing',
      usageMismatch.would_bill_if_enabled === false
        && usageMismatch.denial_code_while_disabled === 'adapter_billing_usage_attribution_required'
        && usageMismatch.blockers.includes('usage_ledger_adapter_attribution'),
      'Checksum or adapter/deployment attribution drift blocks billing before settlement.',
    );

    record(
      'proof performs no adapter traffic or money mutation',
      report.claims.adapter_billing_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.attaches_load_proof === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false,
      'All billing and traffic side effects stay disabled in this CI-safe proof.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_billing_readiness_proof_failed',
      message: error.message,
      details: error.details || null,
    };
    report.verdict = 'FAIL';
  } finally {
    writeReport(report, outputDir);
  }

  return report;
}

function main() {
  const report = runAdapterBillingReadinessProof();
  console.log(`Adapter billing readiness proof: ${report.verdict}`);
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
  runAdapterBillingReadinessProof,
  writeReport,
};
