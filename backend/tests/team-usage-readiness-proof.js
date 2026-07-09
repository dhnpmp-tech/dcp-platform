#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  TEAM_USAGE_READINESS_VERSION,
  buildTeamUsageReadiness,
} = require('../src/services/teamUsageReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'team-usage-readiness-proof';
const CONTRACT = 'dcp.team_usage_readiness_proof.v1';

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
  lines.push('# Team Usage Readiness Proof');
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
    readiness: report.readiness,
    claims: report.claims,
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe and builds the team-usage readiness contract in');
  lines.push('process. It does not create team members, mutate usage rows, mutate');
  lines.push('budgets, dispatch inference, expose API-key secrets, change billing, or');
  lines.push('claim team-member rollups are live.');
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

function runTeamUsageReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_TEAM_USAGE_READINESS_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const keyCounts = {
    total: 3,
    active: 2,
    revoked: 1,
    admin: 1,
    inference: 1,
    billing: 1,
    compute: 0,
    budgeted: 1,
    monthly_spend_cap_halala: 1500,
    attributed_requests_30d: 9,
    attributed_spend_30d_halala: 640,
    per_key_spend_available: true,
    per_key_budgets_available: true,
  };
  const rollup = {
    rows: [{ id: 'key-inference' }, { id: 'key-billing' }],
    totals: { requests: 9, spend_halala: 640, spend_sar: 6.4 },
    unattributed: { requests: 2, spend_halala: 80, spend_sar: 0.8 },
  };
  const readiness = buildTeamUsageReadiness(keyCounts, rollup);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:team-usage-readiness',
    mode: 'ci_safe_in_process_contract',
    readiness,
    claims: {
      creates_team_members: false,
      mutates_usage: false,
      mutates_budgets: false,
      changes_billing: false,
      dispatches_inference: false,
      exposes_key_secret: false,
      claims_team_member_rollups_live: false,
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
      'team usage readiness contract is versioned and scoped-key-only',
      readiness.object === 'team_usage_readiness'
        && readiness.version === TEAM_USAGE_READINESS_VERSION
        && readiness.current_mode === 'scoped_key_controls_only',
      'Agents and UI can inspect the current team/workspace boundary without a team-member claim.',
    );

    record(
      'live controls only name shipped account and scoped-key controls',
      readiness.live_controls.account_v1_spend_cap === true
        && readiness.live_controls.workspace_usage_export === true
        && readiness.live_controls.scoped_key_spend_attribution === true
        && readiness.live_controls.scoped_key_budget_caps === true,
      'The packet can say scoped-key attribution and caps are live.',
    );

    record(
      'team-member controls remain explicitly gated',
      readiness.gated_controls.team_member_rollups === true
        && readiness.gated_controls.team_member_budget_enforcement === true
        && readiness.gated_controls.org_member_identity_required === true
        && readiness.claim_guards.claims_team_member_rollups_live === false,
      'True member rollups wait for org-member identity.',
    );

    record(
      'counts preserve active, budgeted, attributed, and unattributed state',
      readiness.counts.active_keys === 2
        && readiness.counts.budgeted_keys === 1
        && readiness.counts.attributed_requests_30d === 9
        && readiness.counts.attributed_spend_30d_halala === 640
        && readiness.counts.attributed_spend_30d_sar === 6.4
        && readiness.counts.rollup_rows === 2
        && readiness.counts.unattributed_requests_30d === 2,
      'The UI can render scoped-key usage without inferring member rollups.',
    );

    record(
      'endpoints point to existing renter usage controls',
      readiness.endpoints.usage_export === 'GET /api/renters/me/usage/export'
        && readiness.endpoints.budget_status === 'GET /api/renters/me/budget-status'
        && readiness.endpoints.usage_by_key === 'GET /api/renters/me/usage/by-key',
      'No new mutation endpoint is introduced.',
    );

    record(
      'claim guards prove no team, usage, billing, inference, or key-secret mutation',
      Object.values(readiness.claim_guards).every((value) => value === false),
      'The proof is an inspection gate only.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'team_usage_readiness_contract_failed',
      message: error.message,
      details: error.details || {},
    };
  } finally {
    writeReport(report, outputDir);
  }

  if (report.verdict !== 'PASS') {
    const error = new Error(report.failure?.message || 'Team usage readiness proof failed');
    error.report = report;
    throw error;
  }

  return report;
}

if (require.main === module) {
  try {
    const report = runTeamUsageReadinessProof();
    console.log('Team usage readiness proof: PASS');
    console.log(`JSON report: ${report.artifacts.json}`);
    console.log(`Markdown report: ${report.artifacts.markdown}`);
  } catch (error) {
    const report = error.report;
    console.error('Team usage readiness proof: FAIL');
    if (report?.failure) console.error(`${report.failure.code}: ${report.failure.message}`);
    else console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  CONTRACT,
  runTeamUsageReadinessProof,
};
