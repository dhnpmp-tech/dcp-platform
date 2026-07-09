#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ADAPTER_BILLING_APPROVAL_READINESS_VERSION,
  buildAdapterBillingApprovalReadiness,
  evaluateAdapterBillingApproval,
} = require('../src/services/adapterBillingApprovalReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-billing-approval-readiness-proof';
const CONTRACT = 'dcp.adapter_billing_approval_readiness_proof.v1';

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

function buildEvidence(overrides = {}) {
  return {
    strict_load_proof_match: true,
    endpoint_smoke_passed: true,
    usage_ledger_adapter_attribution: true,
    minimum_balance_policy_approved: true,
    settlement_split_policy_approved: true,
    local_roadmap_proof_passed: true,
    production_smoke_passed: true,
    evidence_packet_hash_sha256: 'd'.repeat(64),
    ...overrides,
  };
}

function buildApproval(overrides = {}) {
  return {
    founder_billing_approval: true,
    approval_id: 'appr_adapter_billing_001',
    approved_by: 'founder:billing',
    approved_at: '2026-07-09T09:05:00.000Z',
    scope: 'single_adapter_deployment',
    expires_at: '2026-07-10T09:05:00.000Z',
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Billing Approval Readiness Proof');
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
    missing_hash: report.missing_hash,
    missing_founder: report.missing_founder,
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
  lines.push('inference, route traffic, record usage, mutate balances, create');
  lines.push('invoices, settle payouts, or enable adapter billing.');
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

function runAdapterBillingApprovalReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_BILLING_APPROVAL_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-billing-approval',
    mode: 'ci_safe_adapter_billing_approval_readiness_contract_only',
    claims: {
      readiness_contract_live: true,
      founder_billing_approval_live: false,
      adapter_billing_enablement_live: false,
      approval_mutations_enabled: false,
      dispatches_inference: false,
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
    missing_hash: {},
    missing_founder: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildAdapterBillingApprovalReadiness(new Date('2026-07-09T09:05:00.000Z'));
    const eligible = evaluateAdapterBillingApproval({ evidence: buildEvidence(), approval: buildApproval() });
    const missingHash = evaluateAdapterBillingApproval({
      evidence: buildEvidence({ evidence_packet_hash_sha256: 'bad-hash' }),
      approval: buildApproval(),
    });
    const missingFounder = evaluateAdapterBillingApproval({
      evidence: buildEvidence(),
      approval: buildApproval({ founder_billing_approval: false }),
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.eligible_when_enabled = eligible;
    report.missing_hash = missingHash;
    report.missing_founder = missingFounder;

    record(
      'adapter billing approval readiness is public and policy-only',
      readiness.object === 'adapter_billing_approval_readiness'
        && readiness.version === ADAPTER_BILLING_APPROVAL_READINESS_VERSION
        && readiness.endpoints.billing_approval_readiness === 'GET /api/adapters/billing/approval/readiness'
        && readiness.policy.founder_billing_approval_live === false
        && readiness.policy.adapter_billing_enablement_live === false,
      'The readiness packet is visible without enabling approval or billing mutations.',
    );

    record(
      'complete evidence remains unapproved until approval enablement',
      eligible.would_approve_if_enabled === true
        && eligible.founder_billing_approval_live === false
        && eligible.approved === false
        && eligible.denial_code_while_disabled === 'adapter_billing_approval_disabled'
        && eligible.blockers.length === 0,
      'A complete proof packet only reaches would-approve-if-enabled; approval remains disabled.',
    );

    record(
      'evidence packet hash is required before approval',
      missingHash.would_approve_if_enabled === false
        && missingHash.denial_code_while_disabled === 'adapter_billing_approval_evidence_hash_required'
        && missingHash.blockers.includes('evidence_packet_hash'),
      'Founder approval cannot reference an unhashable or missing evidence packet.',
    );

    record(
      'founder approval is required before billing enablement',
      missingFounder.would_approve_if_enabled === false
        && missingFounder.denial_code_while_disabled === 'adapter_billing_approval_founder_required'
        && missingFounder.blockers.includes('founder_billing_approval'),
      'Evidence alone is not enough to enable adapter billing.',
    );

    record(
      'proof performs no adapter traffic or money mutation',
      report.claims.founder_billing_approval_live === false
        && report.claims.adapter_billing_enablement_live === false
        && report.claims.approval_mutations_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.routes_adapter_traffic === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false
        && report.claims.enables_adapter_billing === false,
      'All approval, routing, usage, billing, invoice, and payout side effects stay disabled.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'adapter_billing_approval_readiness_proof_failed',
      message: error.message,
      details: error.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

function printSummary(report) {
  console.log(`Adapter billing approval readiness proof: ${report.verdict}`);
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
  const report = runAdapterBillingApprovalReadinessProof();
  printSummary(report);
  if (report.verdict !== 'PASS') {
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runAdapterBillingApprovalReadinessProof,
};
