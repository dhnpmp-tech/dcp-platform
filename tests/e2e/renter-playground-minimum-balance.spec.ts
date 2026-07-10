import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-playground-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function mockPlaygroundApis(page: Page) {
  await page.route('**/v1/models', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'qwen/qwen3-coder',
          name: 'Qwen 3 Coder',
          available: true,
          provider_count: 2,
          context_length: 32768,
          max_output_tokens: 4096,
          pricing: {
            sar_per_1m_input_tokens: '0.3000',
            sar_per_1m_output_tokens: '0.6000',
            source: 'catalog',
          },
          capability_flags: {
            chat_completions: true,
            streaming: true,
            tool_calling: true,
            code_generation: true,
            multilingual: true,
          },
          feature_readiness: {
            prompt_caching: { status: 'measurement_only', available: false },
            batch: { status: 'metadata_only', available: false },
            lora: { status: 'registry_only', available: false },
            dedicated_deployment: { status: 'load_proof_required', available: false },
          },
          status: 'available',
        },
      ],
    }),
  }));

  await page.route('**/v1/router/policies', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      version: 'dcp.inference_routing_policies.v1',
      default_policy: 'balanced',
      request_selectable: false,
      proof_contract: {
        command: 'npm run proof:router-policy-contract',
        mode: 'ci_safe_service_contract',
        live_smoke_required_before_selectable: true,
        required_before_future_policy_selectable: [
          'policy_specific_route_tests',
          'funded_policy_live_smoke',
          'pricing_or_residency_or_classifier_evidence_for_specialized_policies',
        ],
      },
      claim_guards: {
        changes_provider_selection: false,
        enables_future_policy_selection: false,
        enables_price_optimized_routing: false,
        enables_geo_residency_routing: false,
        enables_coding_or_arabic_classifier_routing: false,
        changes_billing_or_settlement: false,
        proves_live_latency_ordering: false,
        proves_tinker_compatibility: false,
      },
      data: [
        {
          id: 'balanced',
          label: 'Balanced',
          status: 'available',
          available: true,
          default: true,
          request_selectable: false,
          selection_guard: 'accepted_noop_only',
          proof_gates: [
            { id: 'balanced_noop_contract', label: 'Balanced no-op contract', status: 'ci_safe', required: true },
            { id: 'future_policy_fail_closed', label: 'Future policy fail-closed', status: 'ci_safe', required: true },
          ],
        },
        {
          id: 'cheapest',
          label: 'Cheapest',
          status: 'not_enabled',
          available: false,
          request_selectable: false,
          selection_guard: 'not_request_selectable_until_policy_specific_proof',
          proof_gates: [
            { id: 'settlement_math_reconciliation', label: 'Settlement math reconciliation', status: 'required', required: true },
            { id: 'cost_aware_route_tests', label: 'Cost-aware route tests', status: 'required', required: true },
            { id: 'funded_policy_live_smoke', label: 'Funded policy live smoke', status: 'blocked_external', required: true },
          ],
        },
      ],
    }),
  }));

  await page.route('**/v1/prompt-cache/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'prompt_cache_readiness',
      version: 'dcp.prompt_cache.v1',
      current_mode: 'measurement_only_no_discount',
      status: 'available_measurement_only',
      measurement: {
        hash_only: true,
        stores_raw_prompt: false,
        stores_static_prefix: false,
      },
      billing: {
        discounts_enabled: false,
        settlement_discount_enabled: false,
      },
      claims: {
        prompt_cache_discount: false,
        provider_kv_cache_control: false,
        tinker_compatible: false,
      },
    }),
  }));

  await page.route('**/v1/prompt-cache/settlement/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'prompt_cache_settlement_readiness',
      version: 'dcp.prompt_cache_settlement_readiness.v1',
      current_mode: 'settlement_policy_contract_only',
      endpoints: {
        settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
        prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
      },
      policy: {
        cached_input_discounts_enabled: false,
        settlement_discounts_enabled: false,
        settlement_mutations_enabled: false,
        provider_cache_hit_evidence: { status: 'blocked_external', required: true },
        discount_policy: { status: 'policy_pending', discount_bps_live: 0 },
      },
      denial_codes: ['prompt_cache_discount_disabled', 'prompt_cache_provider_hit_required'],
      claim_guards: {
        mutates_balance: false,
        records_usage_event: false,
        dispatches_inference: false,
        stores_raw_prompt: false,
      },
    }),
  }));

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          renter: {
            name: 'Inference Renter',
            email: 'inference@example.test',
            organization: 'DCP Test Lab',
            balance_halala: 25000,
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
          total_spent_halala: 8400,
          total_spent_sar: 84,
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
            balance_sar: 250,
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            paid_available_halala: 3800,
            paid_available_sar: 38,
            v1_remaining_cap_halala: 14000,
            v1_remaining_cap_sar: 140,
          },
          credit_policy: {
            current_mode: 'grant_credit_provenance_plus_paid_credit_gate',
            source_contract: 'GET /api/pods/trial-routing/readiness',
            explicit_trial_account_tag_live: false,
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
          rails: {
            v1_inference: {
              status: 'live_estimate_preflight',
              enforcement_live: true,
              monthly_cap_remaining_halala: 14000,
            },
            prompt_cache_discount: { status: 'measurement_only', enforcement_live: false },
            batch_inference: { status: 'contract_only', enforcement_live: false },
            lora_training: { status: 'metadata_and_artifact_proof_only', enforcement_live: false },
            adapter_deployments: { status: 'load_and_billing_policy_required', enforcement_live: false },
            evaluators: { status: 'readiness_contract_only', enforcement_live: false },
          },
          claim_guards: {
            mutates_balance: false,
            creates_payment: false,
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
        }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled mock route ${path}` }),
    });
  });
}

test('renter playground exposes inference minimum-balance preflight', async ({ page, context }) => {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: buildSessionCookie('renter'),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  await context.addInitScript((key) => {
    window.localStorage.setItem('dc1_renter_key', key);
  }, RENTER_KEY);
  await mockPlaygroundApis(page);

  await page.goto('/renter/playground');

  const preflight = page.getByLabel('Inference credit preflight');
  await expect(preflight).toContainText('Credit preflight');
  await expect(preflight).toContainText('synced read-only');
  await expect(preflight).toContainText('dcp.minimum_balance_readiness.v1');
  await expect(preflight).toContainText('Credit policy');
  await expect(preflight).toContainText('credit policy synced');
  await expect(preflight).toContainText('v1 requests: estimate preflight');
  await expect(preflight).toContainText('live estimate preflight');
  await expect(preflight).toContainText('Paid available');
  await expect(preflight).toContainText('SAR 38.00');
  await expect(preflight).toContainText('Trial grant');
  await expect(preflight).toContainText('SAR 20.00');
  await expect(preflight).toContainText('High-demand gate');
  await expect(preflight).toContainText('paid credit only');
  await expect(preflight).toContainText('Monthly cap remaining');
  await expect(preflight).toContainText('SAR 140.00');
  await expect(preflight).toContainText('Prompt-cache discounts');
  await expect(preflight).toContainText('measurement only');
  await expect(preflight).toContainText('Future billing rails blocked');
  await expect(preflight).toContainText('5');
  await expect(preflight).toContainText('Policy guards');
  await expect(preflight).toContainText('no trial/paid-credit change');
  await expect(preflight).toContainText('/api/renters/me/minimum-balances');

  const promptCachePanel = page.locator('.prompt-cache-panel');
  await expect(promptCachePanel).toContainText('Prompt cache');
  await expect(promptCachePanel).toContainText('Hash-only measurement');
  await expect(promptCachePanel).toContainText('Cached-input discounts');
  await expect(promptCachePanel).toContainText('Settlement discount policy');
  await expect(promptCachePanel).toContainText('Provider cache-hit evidence');
  await expect(promptCachePanel).toContainText('/v1/prompt-cache/settlement/readiness');

  const routerPanel = page.locator('.router-panel').filter({ hasText: 'Routing' }).first();
  await expect(routerPanel).toContainText('Balanced no-op contract');
  await expect(routerPanel).toContainText('Settlement math reconciliation');
  await expect(routerPanel).toContainText('Proof before selectable');
  await expect(routerPanel).toContainText('npm run proof:router-policy-contract');
  await expect(routerPanel).toContainText('live smoke required');
});
