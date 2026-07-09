import { expect, test, type Page } from '@playwright/test';

const READINESS_PACKETS: Record<string, unknown> = {
  '/api/adapters/artifacts/readiness': {
    object: 'adapter_artifact_policy_readiness',
    version: 'dcp.adapter_artifact_policy.v1',
    current_mode: 'artifact_policy_contract_only',
    artifact_policy: {
      policy_available: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      adapter_serving_enabled: false,
      route_traffic_enabled: false,
    },
    claim_guards: {
      policy_contract_live: true,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      bills_adapter_inference: false,
    },
    next_actions: [
      'Run the LoRA GPU training artifact proof on a provider host.',
    ],
  },
  '/api/adapters/endpoints/smoke/readiness': {
    object: 'adapter_endpoint_smoke_readiness',
    version: 'dcp.adapter_endpoint_smoke_readiness.v1',
    current_mode: 'endpoint_smoke_contract_only',
    policy: {
      readiness_available: true,
      endpoint_smoke_recording_enabled: false,
      adapter_endpoint_routing_enabled: false,
      adapter_billing_enabled: false,
    },
    claim_guards: {
      readiness_contract_live: true,
      routes_adapter_traffic: false,
      enables_adapter_billing: false,
      records_smoke_result: false,
    },
    next_actions: [
      'Run strict adapter load proof against the target vLLM endpoint.',
    ],
  },
  '/api/adapters/usage/attribution/readiness': {
    object: 'adapter_usage_attribution_readiness',
    version: 'dcp.adapter_usage_attribution_readiness.v1',
    current_mode: 'usage_attribution_contract_only',
    policy: {
      readiness_available: true,
      adapter_usage_attribution_enabled: false,
      adapter_usage_ledger_writes_enabled: false,
      adapter_billing_enabled: false,
    },
    claim_guards: {
      readiness_contract_live: true,
      routes_adapter_traffic: false,
      enables_adapter_billing: false,
      records_usage_event: false,
    },
  },
  '/api/adapters/settlement/readiness': {
    object: 'adapter_settlement_readiness',
    version: 'dcp.adapter_settlement_readiness.v1',
    current_mode: 'settlement_policy_contract_only',
    policy: {
      readiness_available: true,
      adapter_settlement_enabled: false,
      provider_payouts_enabled: false,
    },
    claim_guards: {
      readiness_contract_live: true,
      routes_adapter_traffic: false,
      enables_adapter_billing: false,
      settles_provider_payout: false,
    },
  },
  '/api/adapters/billing/approval/readiness': {
    object: 'adapter_billing_approval_readiness',
    version: 'dcp.adapter_billing_approval_readiness.v1',
    current_mode: 'approval_policy_contract_only',
    policy: {
      readiness_available: true,
      founder_billing_approval_live: false,
      adapter_billing_enablement_live: false,
    },
    claim_guards: {
      readiness_contract_live: true,
      routes_adapter_traffic: false,
      enables_adapter_billing: false,
      mutates_balance: false,
    },
  },
  '/api/adapters/billing/readiness': {
    object: 'adapter_billing_readiness',
    version: 'dcp.adapter_billing_readiness.v1',
    current_mode: 'billing_policy_contract_only',
    policy: {
      readiness_available: true,
      adapter_billing_enabled: false,
      adapter_inference_billing_enabled: false,
    },
    claim_guards: {
      readiness_contract_live: true,
      routes_adapter_traffic: false,
      enables_adapter_serving: false,
      enables_adapter_billing: false,
      bills_adapter_inference: false,
    },
    next_actions: [
      'Run strict adapter vLLM load proof against a real serving endpoint.',
    ],
  },
};

async function mockAdapterReadiness(page: Page) {
  await page.route('**/api/adapters/**/readiness', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const packet = READINESS_PACKETS[path];
    if (!packet) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Unhandled mocked route: ${path}` }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(packet),
    });
  });
}

test('public dedicated deployments page renders adapter readiness contracts', async ({ page }) => {
  await mockAdapterReadiness(page);
  await page.goto('/dedicated-deployments');

  const readiness = page.locator('.dedicated-readiness-live');
  await expect(readiness).toContainText('Adapter readiness contracts');
  await expect(readiness).toContainText('GET /api/adapters/*/readiness');
  await expect(readiness).toContainText('Contracts live');
  await expect(readiness).toContainText('6/6');
  await expect(readiness).toContainText('Traffic gates blocked');
  await expect(readiness).toContainText('Billing gates blocked');
  await expect(readiness).toContainText('Artifact policy');
  await expect(readiness).toContainText('artifact policy contract only');
  await expect(readiness).toContainText('Endpoint smoke');
  await expect(readiness).toContainText('endpoint smoke contract only');
  await expect(readiness).toContainText('Usage attribution');
  await expect(readiness).toContainText('usage attribution contract only');
  await expect(readiness).toContainText('Settlement');
  await expect(readiness).toContainText('settlement policy contract only');
  await expect(readiness).toContainText('Founder approval');
  await expect(readiness).toContainText('approval policy contract only');
  await expect(readiness).toContainText('Adapter billing');
  await expect(readiness).toContainText('billing policy contract only');
  await expect(readiness).toContainText('dcp.adapter_billing_readiness.v1');
  await expect(readiness).toContainText('Run strict adapter vLLM load proof against a real serving endpoint.');
});

test('public dedicated deployments readiness rail stays usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockAdapterReadiness(page);

  await page.goto('/dedicated-deployments');

  const readiness = page.locator('.dedicated-readiness-live');
  await expect(readiness).toContainText('Contracts live');
  await expect(readiness).toContainText('Adapter billing');
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
