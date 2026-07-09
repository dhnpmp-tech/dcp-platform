#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MINIMUM_BALANCE_READINESS_VERSION,
  buildMinimumBalanceReadiness,
} = require('../src/services/minimumBalanceReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'minimum-balance-readiness-contract-proof';
const CONTRACT = 'dcp.minimum_balance_readiness_contract_proof.v1';

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
  lines.push('# Minimum Balance Readiness Contract Proof');
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
  lines.push('## Readiness Snapshot');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    account: report.readiness.account,
    credit_policy: report.readiness.credit_policy,
    rails: report.readiness.rails,
    claim_guards: report.readiness.claim_guards,
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe and builds the read-only minimum-balance policy');
  lines.push('contract in process. It does not debit a renter, create a payment, launch');
  lines.push('a pod, dispatch inference, create batch/LoRA/adapter/eval work, enable a');
  lines.push('discount, or change any existing 402 enforcement path.');
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

async function runMinimumBalanceReadinessContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_MINIMUM_BALANCE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const readiness = buildMinimumBalanceReadiness({
    now: new Date('2026-07-09T02:45:00.000Z'),
    renter: {
      id: 1,
      balance_halala: 25000,
      trial_grant_halala: 2000,
    },
    paidCreditState: {
      paid_funding_halala: 5000,
      on_demand_committed_halala: 1200,
      paid_available_halala: 3800,
    },
    budgetStatus: {
      v1_inference: {
        monthly_spend_cap_halala: 5000,
        remaining_cap_halala: 4700,
      },
    },
  });
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:minimum-balance-readiness',
    mode: 'ci_safe_in_process_contract',
    readiness,
    claims: {
      mutates_balance: false,
      creates_payment: false,
      launches_pod: false,
      dispatches_inference: false,
      creates_batch: false,
      creates_lora_training_job: false,
      creates_adapter_deployment: false,
      creates_eval_job: false,
      enables_discount: false,
      changes_enforcement: false,
      changes_trial_accounting: false,
      changes_paid_credit_policy: false,
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
      'minimum-balance contract is versioned and read-only',
      readiness.object === 'minimum_balance_readiness'
        && readiness.version === MINIMUM_BALANCE_READINESS_VERSION
        && readiness.current_mode === 'read_only_policy_contract'
        && readiness.endpoints.readiness === 'GET /api/renters/me/minimum-balances',
      'Agents and UI can inspect one stable policy endpoint without creating work.',
    );

    record(
      'account packet exposes balance, paid credit, commitments, and v1 cap',
      readiness.account.balance_halala === 25000
        && readiness.account.trial_grant_halala === 2000
        && readiness.account.paid_funding_halala === 5000
        && readiness.account.on_demand_committed_halala === 1200
        && readiness.account.paid_available_halala === 3800
        && readiness.account.v1_monthly_spend_cap_halala === 5000
        && readiness.account.v1_remaining_cap_halala === 4700,
      'The packet separates paid available credit from total balance for on-demand GPU gates.',
    );

    record(
      'credit policy separates trial grant provenance from paid-credit gates',
      readiness.credit_policy.current_mode === 'grant_credit_provenance_plus_paid_credit_gate'
        && readiness.credit_policy.explicit_trial_account_tag_live === false
        && readiness.credit_policy.trial_credit_source === 'renters.trial_grant_halala'
        && readiness.credit_policy.trial_grant_halala === 2000
        && readiness.credit_policy.paid_available_halala === 3800
        && readiness.credit_policy.trial_credit_unlocks_high_demand === false
        && readiness.credit_policy.high_demand_requires_paid_credit === true,
      'Trial/grant credit and paid credit are visible as separate policy inputs.',
    );

    record(
      'live rails name existing estimate and paid-credit enforcement',
      readiness.rails.v1_inference.status === 'live_estimate_preflight'
        && readiness.rails.v1_inference.enforcement_live === true
        && readiness.rails.gpu_pods_provider_supply.enforcement_live === true
        && readiness.rails.gpu_pods_on_demand_supply.status === 'live_paid_credit_preflight'
        && readiness.rails.gpu_pods_on_demand_supply.paid_available_halala === 3800,
      'The contract describes existing live 402 gates without changing them.',
    );

    record(
      'blocked rails stay blocked until their proof commands pass',
      readiness.rails.batch_inference.enforcement_live === false
        && readiness.rails.prompt_cache_discount.enforcement_live === false
        && readiness.rails.lora_training.enforcement_live === false
        && readiness.rails.adapter_deployments.enforcement_live === false
        && readiness.rails.evaluators.enforcement_live === false,
      'Batch discounts, prompt-cache discounts, LoRA training, adapter serving, and eval billing remain gated.',
    );

    record(
      'claim guards prove no money or workload mutation',
      Object.values(readiness.claim_guards).every((value) => value === false),
      'The route is an inspection contract only.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'minimum_balance_readiness_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  } finally {
    writeReport(report, outputDir);
  }

  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure?.message || 'Minimum balance readiness contract proof failed');
    error.report = report;
    throw error;
  }

  return report;
}

if (require.main === module) {
  runMinimumBalanceReadinessContractProof()
    .then((report) => {
      console.log('Minimum balance readiness contract proof: PASS');
      console.log(`JSON report: ${report.artifacts.json}`);
      console.log(`Markdown report: ${report.artifacts.markdown}`);
    })
    .catch((error) => {
      const report = error.report;
      console.error('Minimum balance readiness contract proof: FAIL');
      if (report?.failure) console.error(`${report.failure.code}: ${report.failure.message}`);
      else console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  CONTRACT,
  runMinimumBalanceReadinessContractProof,
};
