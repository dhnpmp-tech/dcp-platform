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
            paid_available_halala: 3800,
            paid_available_sar: 38,
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
});
