import { expect, test } from '@playwright/test';

test('public inference page renders live model catalog metadata', async ({ page }) => {
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
      ],
    }),
  }));

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
        {
          id: 'future/model',
          name: 'Future Model',
          available: false,
          provider_count: 0,
          context_length: 131072,
          pricing: {
            sar_per_1m_input_tokens: '2.0000',
            sar_per_1m_output_tokens: '4.0000',
          },
          status: 'no_providers',
          capability_flags: { vision: true, lora: true },
        },
      ],
    }),
  }));

  await page.goto('/inference');

  const catalogRail = page.locator('.inference-model-live');
  await expect(catalogRail).toContainText('Live model catalog');
  await expect(catalogRail).toContainText('GET /v1/models');
  await expect(catalogRail).toContainText('Serving models');
  await expect(catalogRail).toContainText('1/2');
  await expect(catalogRail).toContainText('Provider-backed');
  await expect(catalogRail).toContainText('Max context');
  await expect(catalogRail).toContainText('128K');
  await expect(catalogRail).toContainText('Qwen 2.5 7B');
  await expect(catalogRail).toContainText('SAR 0.30 in / SAR 0.60 out');
  await expect(catalogRail).toContainText('serving');
  await expect(catalogRail).toContainText('Future Model');
  await expect(catalogRail).toContainText('no providers');
  await expect(catalogRail).toContainText('Rows with zero providers stay visible as catalog metadata');
});
