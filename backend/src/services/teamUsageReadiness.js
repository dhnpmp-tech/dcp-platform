'use strict';

const TEAM_USAGE_READINESS_VERSION = 'dcp.team_usage_readiness.v1';

function sarFromHalala(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function buildTeamUsageReadiness(keyCounts = {}, rollup = null) {
  const attributedSpendHalala = Number(keyCounts.attributed_spend_30d_halala || 0);
  const rollupRequests = Number(rollup?.totals?.requests || 0);
  const rollupSpendHalala = Number(rollup?.totals?.spend_halala || 0);
  return {
    object: 'team_usage_readiness',
    version: TEAM_USAGE_READINESS_VERSION,
    current_mode: 'scoped_key_controls_only',
    summary: 'Scoped-key attribution and per-key caps are live; true team-member rollups require org member identity before they can be claimed.',
    live_controls: {
      account_v1_spend_cap: true,
      workspace_usage_export: true,
      scoped_key_spend_attribution: Boolean(keyCounts.per_key_spend_available),
      scoped_key_budget_caps: Boolean(keyCounts.per_key_budgets_available),
    },
    gated_controls: {
      team_member_rollups: true,
      team_member_budget_enforcement: true,
      org_member_identity_required: true,
    },
    counts: {
      active_keys: Number(keyCounts.active || 0),
      budgeted_keys: Number(keyCounts.budgeted || 0),
      attributed_requests_30d: Number(keyCounts.attributed_requests_30d || rollupRequests || 0),
      attributed_spend_30d_halala: attributedSpendHalala || rollupSpendHalala,
      attributed_spend_30d_sar: sarFromHalala(attributedSpendHalala || rollupSpendHalala),
      rollup_rows: Number(rollup?.rows?.length || keyCounts.total || 0),
      unattributed_requests_30d: Number(rollup?.unattributed?.requests || 0),
    },
    endpoints: {
      usage_export: 'GET /api/renters/me/usage/export',
      budget_status: 'GET /api/renters/me/budget-status',
      usage_by_key: 'GET /api/renters/me/usage/by-key',
    },
    next_step: 'Add org member identity, then promote scoped-key rollups into member/team rollups.',
    claim_guards: {
      creates_team_members: false,
      mutates_usage: false,
      mutates_budgets: false,
      changes_billing: false,
      dispatches_inference: false,
      exposes_key_secret: false,
      claims_team_member_rollups_live: false,
    },
  };
}

module.exports = {
  TEAM_USAGE_READINESS_VERSION,
  buildTeamUsageReadiness,
};
