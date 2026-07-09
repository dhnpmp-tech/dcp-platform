import { expect, test } from '@playwright/test';

test('public inference page renders live router policy readiness', async ({ page }) => {
  await page.route('**/v1/models', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'qwen2.5:7b',
          name: 'Qwen 2.5 7B',
          available: true,
          provider_count: 1,
          context_length: 32768,
          pricing: {
            sar_per_1m_input_tokens: '0.3000',
            sar_per_1m_output_tokens: '0.6000',
          },
          capability_flags: { streaming: true },
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
      data: [
        {
          id: 'balanced',
          label: 'Balanced',
          status: 'available',
          available: true,
          default: true,
          request_selectable: false,
        },
        {
          id: 'lowest_latency',
          label: 'Lowest latency',
          status: 'telemetry_gate_only',
          available: false,
          request_selectable: false,
        },
        {
          id: 'arabic',
          label: 'Arabic',
          status: 'catalog_only',
          available: false,
          request_selectable: false,
        },
      ],
    }),
  }));

  await page.goto('/inference');

  const policyRail = page.locator('.inference-policy-live');
  await expect(policyRail).toContainText('Router policy catalog');
  await expect(policyRail).toContainText('dcp.inference_routing_policies.v1');
  await expect(policyRail).toContainText('Default');
  await expect(policyRail).toContainText('Balanced');
  await expect(policyRail).toContainText('Available');
  await expect(policyRail).toContainText('1/3');
  await expect(policyRail).toContainText('Gated policies');
  await expect(policyRail).toContainText('2');
  await expect(policyRail).toContainText('Lowest latency');
  await expect(policyRail).toContainText('telemetry gate only');
  await expect(policyRail).toContainText('not selectable');
});
