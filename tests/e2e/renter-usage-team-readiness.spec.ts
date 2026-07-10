import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-usage-ui-smoke-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function teamUsageReadiness() {
  return {
    object: 'team_usage_readiness',
    version: 'dcp.team_usage_readiness.v1',
    current_mode: 'scoped_key_controls_only',
    summary: 'Scoped-key attribution and per-key caps are live; true team-member rollups require org member identity before they can be claimed.',
    live_controls: {
      account_v1_spend_cap: true,
      workspace_usage_export: true,
      scoped_key_spend_attribution: true,
      scoped_key_budget_caps: true,
    },
    gated_controls: {
      team_member_rollups: true,
      team_member_budget_enforcement: true,
      org_member_identity_required: true,
    },
    counts: {
      active_keys: 2,
      budgeted_keys: 1,
      attributed_requests_30d: 7,
      attributed_spend_30d_halala: 420,
      attributed_spend_30d_sar: 4.2,
      rollup_rows: 2,
      unattributed_requests_30d: 0,
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

async function mockUsageApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          renter: {
            name: 'Usage Operator',
            email: 'usage@example.test',
            organization: 'DCP Usage Lab',
            balance_halala: 25000,
            total_spent_halala: 9000,
            total_jobs: 4,
          },
          v1_usage_summary: {
            total_requests: 7,
            total_tokens: 1200,
            total_cost_halala: 420,
          },
        }),
      });
    }

    if (path === '/api/pods/trial-routing/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'pod_trial_routing_readiness',
          version: 'dcp.pod_trial_routing_readiness.v1',
          account_classification: {
            explicit_trial_account_tag_live: false,
            current_mode: 'derived_from_credit_provenance',
            trial_credit_source: 'renters.trial_grant_halala',
            paid_credit_source: 'payments.status=paid',
            derived_states: {
              trial_grant_active: 'renters.trial_grant_halala > 0',
              no_trial_grant: 'renters.trial_grant_halala = 0',
            },
            analytics_lifecycle_tag_live: false,
            mutates_account_classification: false,
          },
          routing_policy: {
            trial_capacity_copy: 'Trial credit: native/community GPU pool',
            high_demand_capacity_copy: 'High-demand GPUs: paid credit only',
            trial_credit_allowed_supply_tiers: ['dcp_owned', 'provider'],
            paid_credit_required_supply_tiers: ['on_demand'],
            trial_credit_capacity_class: 'dcp_native_and_community_gpu_pool',
            high_demand_capacity_class: 'paid_credit_only',
            provider_visibility: {
              exposes_provider_id_to_renter: false,
              exposes_vendor_to_renter: false,
              exposes_supply_tier_to_renter: false,
            },
          },
          claim_guards: {
            launches_pod: false,
            mutates_balance: false,
            changes_billing: false,
            changes_trial_accounting: false,
            changes_account_classification: false,
            exposes_vendor_or_provider: false,
          },
        }),
      });
    }

    if (path === '/api/renters/balance') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          balance_halala: 25000,
          balance_sar: 250,
          held_halala: 1200,
          held_sar: 12,
          total_spent_halala: 9000,
          total_spent_sar: 90,
          total_jobs: 4,
        }),
      });
    }

    if (path === '/api/renters/me/analytics') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          period: '30d',
          daily_spend: [{ day: '2026-07-09', total_halala: 1200, job_count: 2 }],
          status_counts: [{ status: 'completed', count: 2 }],
          avg_duration_minutes: 42,
          completed_job_count: 2,
          v1_usage: {
            totals: { total_requests: 7, total_tokens: 1200, total_cost_halala: 420 },
          },
        }),
      });
    }

    if (path === '/api/renters/me/jobs') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [
            {
              id: 1,
              job_id: 'job-usage-1',
              job_type: 'batch',
              model: 'ALLaM-AI/ALLaM-7B-Instruct-preview',
              status: 'completed',
              cost_halala: 1200,
              submitted_at: '2026-07-09T08:00:00Z',
              completed_at: '2026-07-09T08:42:00Z',
            },
          ],
          pagination: { page: 0, limit: 50, total: 1, pages: 1 },
        }),
      });
    }

    if (path === '/api/renters/me/usage/by-key') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'renter_usage_by_key',
          version: 'dcp.renter_usage_by_key.v1',
          period: '30d',
          rows: [
            {
              id: 'key-inference',
              label: 'inference',
              scopes: ['inference'],
              org_role: 'member',
              revoked: false,
              requests: 7,
              total_tokens: 1200,
              spend_halala: 420,
              spend_sar: 4.2,
              monthly_spend_cap_halala: 1000,
              monthly_spend_cap_sar: 10,
              monthly_spend_cap_unlimited: false,
            },
            {
              id: 'key-billing',
              label: 'billing',
              scopes: ['billing'],
              org_role: 'read-only',
              revoked: false,
              requests: 0,
              total_tokens: 0,
              spend_halala: 0,
              spend_sar: 0,
              monthly_spend_cap_halala: 0,
              monthly_spend_cap_sar: 0,
              monthly_spend_cap_unlimited: true,
            },
          ],
          unattributed: { requests: 0, total_tokens: 0, spend_halala: 0, spend_sar: 0 },
          totals: { keys: 2, requests: 7, spend_halala: 420, spend_sar: 4.2 },
          team_usage_readiness: teamUsageReadiness(),
          claims: {
            per_key_spend_attribution_live: true,
            per_key_budgets_enforced: true,
            team_member_rollups_live: false,
          },
        }),
      });
    }

    if (path === '/api/renters/me/budget-status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'renter_budget_status',
          version: 'dcp.renter_budget_status.v1',
          period: '30d',
          v1_inference: {
            requests: 7,
            spend_halala: 420,
            monthly_spend_cap_halala: 5000,
            monthly_spend_cap_unlimited: false,
            remaining_cap_halala: 4580,
            cap_utilization_pct: 8.4,
          },
          api_keys: {
            active: 2,
            billing: 1,
            inference: 1,
            per_key_budgets_available: true,
          },
          claims: {
            workspace_usage_export_live: true,
            per_key_budgets_enforced: true,
          },
          team_usage_readiness: teamUsageReadiness(),
        }),
      });
    }

    if (path === '/api/renters/me/minimum-balances') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'minimum_balance_readiness',
          version: 'dcp.minimum_balance_readiness.v1',
          current_mode: 'read_only_policy_contract',
          account: {
            balance_halala: 25000,
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            paid_available_halala: 3800,
            paid_available_sar: 38,
          },
          credit_policy: {
            current_mode: 'grant_credit_provenance_plus_paid_credit_gate',
            source_contract: 'GET /api/pods/trial-routing/readiness',
            explicit_trial_account_tag_live: false,
            derived_trial_account_state: 'trial_grant_active',
            trial_credit_source: 'renters.trial_grant_halala',
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            has_trial_grant: true,
            paid_credit_source: 'payments.status=paid/refunded minus active high-demand pod commitments',
            paid_available_halala: 3800,
            paid_available_sar: 38,
            trial_credit_allowed_capacity: 'DCP/community/provider GPU capacity when normal quote checks pass',
            trial_credit_unlocks_high_demand: false,
            high_demand_requires_paid_credit: true,
          },
          trial_classification: {
            current_mode: 'derived_from_credit_provenance',
            explicit_trial_account_tag_live: false,
            analytics_lifecycle_tag_live: false,
            derived_account_state: 'trial_grant_active',
            has_trial_grant: true,
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            paid_available_halala: 3800,
            paid_available_sar: 38,
            trial_credit_capacity_class: 'dcp_native_and_community_gpu_pool',
            high_demand_capacity_class: 'paid_credit_only',
            mutates_account_classification: false,
          },
          rails: {
            v1_inference: { status: 'live_estimate_preflight', enforcement_live: true },
            gpu_pods_on_demand_supply: { status: 'live_paid_credit_preflight', paid_available_halala: 3800, enforcement_live: true },
            batch_inference: { status: 'contract_only', enforcement_live: false },
            lora_training: { status: 'metadata_and_artifact_proof_only', enforcement_live: false },
            adapter_deployments: { status: 'load_and_billing_policy_required', enforcement_live: false },
            evaluators: { status: 'readiness_contract_only', enforcement_live: false },
          },
          claim_guards: {
            changes_enforcement: false,
            mutates_balance: false,
            creates_pod: false,
            dispatches_inference: false,
            changes_trial_accounting: false,
            changes_account_classification: false,
            changes_paid_credit_policy: false,
          },
        }),
      });
    }

    if (path === '/api/renters/me/usage') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          usage: [
            {
              id: 'usage-1',
              request_id: 'req-usage-1',
              model: 'ALLaM-AI/ALLaM-7B-Instruct-preview',
              source: 'v1',
              prompt_tokens: 900,
              completion_tokens: 300,
              total_tokens: 1200,
              cost_halala: 420,
              created_at: '2026-07-09T08:00:00Z',
              settlement_status: 'settled',
            },
          ],
          totals: {
            total_requests: 7,
            total_tokens: 1200,
            total_cost_halala: 420,
            total_cost_sar: 4.2,
          },
        }),
      });
    }

    if (path === '/api/renters/me/usage/export') {
      expect(route.request().headers()['x-renter-key']).toBe(RENTER_KEY);
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: { 'Content-Disposition': 'attachment; filename="dcp-usage-30d.csv"' },
        body: 'request_id,model,total_tokens,cost_halala\nreq-usage-1,ALLaM-AI/ALLaM-7B-Instruct-preview,1200,420\n',
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled mocked route: ${path}` }),
    });
  });
}

test('renter usage shows scoped-key team readiness without claiming member rollups', async ({ page, context }) => {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: buildSessionCookie('renter'),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  await page.addInitScript((key) => {
    window.localStorage.setItem('dc1_renter_key', key);
  }, RENTER_KEY);
  await mockUsageApis(page);

  await page.goto('/renter/usage');

  const accountControls = page.getByLabel('Account controls packet');
  await expect(accountControls).toBeVisible();
  await expect(accountControls).toContainText('Trial, export, and spend gates in one view');
  await expect(accountControls).toContainText('Credit policy');
  await expect(accountControls).toContainText('Minimum-balance credit policy synced');
  await expect(accountControls).toContainText('Trial mode');
  await expect(accountControls).toContainText('Grant-credit provenance');
  await expect(accountControls).toContainText('Trial tag');
  await expect(accountControls).toContainText('No trial tag live');
  await expect(accountControls).toContainText('Trial grant');
  await expect(accountControls).toContainText('Trial grant SAR 20.00');
  await expect(accountControls).toContainText('Derived state');
  await expect(accountControls).toContainText('Derived trial state: grant active');
  await expect(accountControls).toContainText('Trial route');
  await expect(accountControls).toContainText('Trial credit: native/community GPU pool');
  await expect(accountControls).toContainText('High-demand gate');
  await expect(accountControls).toContainText('High-demand GPUs: paid credit only');
  await expect(accountControls).toContainText('Paid credit');
  await expect(accountControls).toContainText('High-demand paid-credit gate live · SAR 38.00 available');
  await expect(accountControls).toContainText('Usage export');
  await expect(accountControls).toContainText('Header-auth CSV export');
  await expect(accountControls).toContainText('Per-key caps');
  await expect(accountControls).toContainText('Budget caps enforced');
  await expect(accountControls).toContainText('Inference gate');
  await expect(accountControls).toContainText('Estimate preflight live');
  await expect(accountControls).toContainText('Policy mutation');
  await expect(accountControls).toContainText('No trial or paid-credit change');
  await expect(accountControls).toContainText('Read-only packet');
  await expect(accountControls).toContainText('Backend trial-routing contract synced');
  await expect(accountControls).toContainText('Trial source: grant balance');
  await expect(accountControls).toContainText('No trial-accounting or paid-credit policy change');
  await expect(accountControls).toContainText('No balance, billing, pod, or inference mutation');

  const readiness = page.getByLabel('Team usage readiness');
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText('Scoped-key controls');
  await expect(readiness).toContainText('Usage export');
  await expect(readiness).toContainText('Live');
  await expect(readiness).toContainText('Scoped-key spend');
  await expect(readiness).toContainText('Attributed');
  await expect(readiness).toContainText('Per-key caps');
  await expect(readiness).toContainText('Enforced');
  await expect(readiness).toContainText('Member rollups');
  await expect(readiness).toContainText('Gated');
  await expect(readiness).toContainText('Active keys');
  await expect(readiness).toContainText('2');
  await expect(readiness).toContainText('Attributed requests');
  await expect(readiness).toContainText('7');
  await expect(readiness).toContainText('Read-only: no team, usage, billing, or inference mutation');
  await expect(readiness).toContainText('Add org member identity');

  const keyUsage = page.locator('.panel', { has: page.getByRole('heading', { name: 'API key usage' }) });
  await expect(keyUsage).toContainText('Scoped-key rollup');
  await expect(keyUsage).toContainText('inference');
  await expect(keyUsage).toContainText('10.00');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;
  await expect(accountControls).toContainText('CSV ready');
});
