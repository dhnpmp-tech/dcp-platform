import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-ui-smoke-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function mockPodsApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/templates/catalog') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 'dcp.test.templates.v1',
          templates: [
            { id: 'pytorch-single-gpu', model_name: 'PyTorch', min_vram_gb: 8, deploy_defaults: { duration_minutes: 60 } },
            { id: 'lora-finetune', model_name: 'LoRA SFT', min_vram_gb: 16, deploy_defaults: { duration_minutes: 240 } },
            { id: 'qlora-finetune', model_name: 'QLoRA SFT', min_vram_gb: 12, deploy_defaults: { duration_minutes: 240 } },
            { id: 'vllm-serve', model_name: 'vLLM', min_vram_gb: 24, deploy_defaults: { duration_minutes: 120 } },
            { id: 'arabic-embeddings', model_name: 'Arabic embeddings', min_vram_gb: 8, deploy_defaults: { duration_minutes: 120 } },
            { id: 'arabic-reranker', model_name: 'Arabic reranker', min_vram_gb: 8, deploy_defaults: { duration_minutes: 120 } },
            { id: 'whisper-large-v3', model_name: 'Whisper Large-v3', min_vram_gb: 8, deploy_defaults: { duration_minutes: 60 } },
          ],
        }),
      });
    }

    if (path === '/api/pods') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pods: [] }),
      });
    }

    if (path === '/api/pods/trial-routing/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'pod_trial_routing_readiness',
          version: 'dcp.pod_trial_routing_readiness.v1',
          routing_policy: {
            trial_capacity_copy: 'Trial credit: native/community GPUs',
            high_demand_capacity_copy: 'High-demand capacity: paid credit only',
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
            exposes_vendor_or_provider: false,
          },
        }),
      });
    }

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ renter: { name: 'Tareq Trial', email: 'tareq@example.test' } }),
      });
    }

    if (path === '/api/renters/available-providers') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            { id: 1, gpu_model: 'NVIDIA GeForce RTX 4090', vram_gb: 24, available: true, sar_per_hour: 12 },
            { id: 2, gpu_model: 'NVIDIA H100 80GB HBM3', vram_gb: 80, available: true, sar_per_hour: 48 },
          ],
        }),
      });
    }

    if (path === '/api/workspace/volumes/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          volume: {
            id: 'vol_test',
            size_gb: 20,
            used_gb: 4.5,
            used_pct: 22.5,
            price_sar_per_month: 20,
          },
          options: [],
        }),
      });
    }

    if (path === '/api/workspace/files') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [
            { key: 'datasets/train.jsonl', size: 1200, last_modified: '2026-07-09T08:00:00Z' },
            { key: 'datasets/valid.jsonl', size: 800, last_modified: '2026-07-09T08:01:00Z' },
            { key: 'notebooks/demo.ipynb', size: 2048, last_modified: '2026-07-09T08:02:00Z' },
            { key: 'checkpoints/epoch-1.bin', size: 4096, last_modified: '2026-07-09T08:03:00Z' },
            { key: 'readme.md', size: 400, last_modified: '2026-07-09T08:04:00Z' },
          ],
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

test('renter pods launch keeps workspace compact and compute selection explicit', async ({ page, context }) => {
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
  await mockPodsApis(page);

  await page.goto('/renter/pods');

  await expect(page.getByText('Stage 1')).toBeVisible();
  await expect(page.getByText('Stage 2')).toBeVisible();
  await expect(page.getByText('Stage 3')).toBeVisible();
  await expect(page.getByText('Staged files')).toBeVisible();
  await expect(page.getByText('datasets/ · 2')).toBeVisible();
  await expect(page.getByText('checkpoints/ · 1')).toBeVisible();
  await expect(page.getByText('datasets/train.jsonl')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByText('datasets/train.jsonl')).toBeVisible();
  await expect(page.getByRole('button', { name: /datasets\/.*2/ })).toBeVisible();

  const computeSummary = page.locator('.pod-compute-summary');
  await expect(computeSummary).toContainText('Selected compute');
  await expect(computeSummary).toContainText('Auto-pick at launch');
  await expect(computeSummary).toContainText('Credit policy: synced');
  await expect(computeSummary).toContainText('Trial credit: native/community GPUs');
  await expect(computeSummary).toContainText('High-demand capacity: paid credit only');

  await page.getByRole('radio', { name: /RTX 4090/ }).click();
  await expect(computeSummary).toContainText('RTX 4090');
  await expect(computeSummary).toContainText('24 GB VRAM');
  await expect(computeSummary).toContainText('Quote: ~SAR');
  await expect(page.getByRole('button', { name: 'Use auto-pick' })).toBeVisible();
});
