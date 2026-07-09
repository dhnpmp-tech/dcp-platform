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
          account_classification: {
            explicit_trial_account_tag_live: false,
            trial_credit_source: 'renters.trial_grant_halala',
            paid_credit_source: 'payments.status=paid',
          },
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
            claims_workspace_live_acceptance: false,
            claims_lora_pod_image_gpu_ready: false,
            claims_fine_tuning_ready_pods: false,
          },
          infrastructure_proofs: {
            workspace_pod_contract: {
              status: 'ci_safe',
              command: 'npm run workspace-pods:verify-contracts',
              local_roadmap_gate: 'workspace_pod_contracts',
            },
            workspace_live_acceptance: {
              status: 'blocked_external',
              command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
              live_acceptance_gate: 'workspace_pod_live_launch',
              blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
            },
            lora_pod_image_provider_host: {
              status: 'blocked_external',
              command: 'npm run proof:lora-pod-image',
              live_acceptance_gate: 'lora_pod_image_provider_host',
              blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
            },
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

    if (path === '/api/volumes/me') {
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

  await expect(page.getByRole('navigation', { name: 'Pod launch stages' })).toBeVisible();
  await expect(page.locator('#pod-stage-1 .pod-stage-no')).toHaveText('Stage 1');
  await expect(page.locator('#pod-stage-2 .pod-stage-no')).toHaveText('Stage 2');
  await expect(page.locator('#pod-stage-3 .pod-stage-no')).toHaveText('Stage 3');
  await expect(page.getByRole('link', { name: /Stage 2.*Template \+ GPU request.*Auto-pick/ })).toBeVisible();
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('Stage 1 ready');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('5 files staged');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('20 GB /workspace');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('datasets/');
  await expect(page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Manage files' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to Stage 2' })).toBeVisible();
  await expect(page.getByText('Stage 1 manifest')).toBeHidden();
  await expect(page.getByText('datasets/train.jsonl')).toBeHidden();

  await page.getByRole('link', { name: 'Continue to Stage 2' }).click();
  await expect(page).toHaveURL(/#pod-stage-2$/);
  await page.locator('#pod-stage-1').scrollIntoViewIfNeeded();
  await page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Manage files' }).click();
  await expect(page.getByText('Staged files')).toBeVisible();
  await expect(page.getByText('Stage 1 manifest')).toBeVisible();
  await expect(page.getByText('5 files · 4 groups')).toBeVisible();
  await expect(page.getByText('Review folders')).toBeVisible();
  await expect(page.getByText('datasets/ · 2')).toBeVisible();
  await expect(page.getByText('checkpoints/ · 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open datasets\/ with 2 files/ })).toBeVisible();
  await page.getByRole('button', { name: /Open datasets\/ with 2 files/ }).click();
  await expect(page.getByText('datasets/train.jsonl')).toBeVisible();
  await expect(page.getByText('notebooks/demo.ipynb')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /datasets\/.*2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand all' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('notebooks/demo.ipynb')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByText('datasets/train.jsonl')).toHaveCount(0);

  const computeSummary = page.locator('.pod-compute-summary');
  await expect(computeSummary).toContainText('Stage 2 actual launch GPU');
  await expect(computeSummary).toContainText('Auto-pick at launch · no GPU pinned');
  await expect(computeSummary).toContainText('Launch will auto-pick an available GPU type');
  await expect(computeSummary).toContainText('Request mode: Auto-pick request');
  await expect(computeSummary).toContainText('Credit policy: synced');
  await expect(computeSummary).toContainText('Trial credit: native/community GPUs');
  await expect(computeSummary).toContainText('High-demand capacity: paid credit only');
  await expect(computeSummary).toContainText('Trial accounts: credit provenance');
  await expect(computeSummary.getByRole('button', { name: 'Auto-pick', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(computeSummary.getByRole('button', { name: 'Fixed GPU', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial is handled by credit provenance');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Backend policy: synced');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial accounts: credit provenance');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial route: native/community GPUs');
  await expect(page.getByLabel('Trial routing policy')).toContainText('High-demand route: paid credit');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Provider identity hidden');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace and LoRA image evidence');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace contract: CI safe');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace live: provider window');
  await expect(page.getByLabel('Pod proof gates')).toContainText('LoRA image: GPU-host proof');

  const gpuSelectionStrip = page.locator('.gpu-selection-strip');
  await expect(gpuSelectionStrip).toContainText('Actual launch GPU request');
  await expect(gpuSelectionStrip).toContainText('Auto-pick: no fixed GPU');
  await expect(gpuSelectionStrip).toContainText('Request: auto-pick');
  await expect(gpuSelectionStrip).toContainText('Any VRAM');
  await expect(gpuSelectionStrip).toContainText('2 shown');
  await expect(page.getByText('Browse-only VRAM filter')).toBeVisible();
  await page.getByRole('button', { name: '80 GB+', exact: true }).click();
  await expect(gpuSelectionStrip).toContainText('Browse filter 80 GB+');
  await expect(gpuSelectionStrip).toContainText('1 shown');
  await expect(computeSummary).toContainText('Auto-pick at launch');
  await expect(computeSummary).toContainText('Filter only; not the launch GPU');
  await gpuSelectionStrip.getByRole('button', { name: 'Clear filters' }).click();
  await expect(gpuSelectionStrip).toContainText('Any VRAM');
  await expect(gpuSelectionStrip).toContainText('2 shown');
  await expect(page.getByLabel('Launch review')).toContainText('Stage 2');
  await expect(page.getByLabel('Launch review')).toContainText('Auto-pick GPU');
  await expect(page.getByLabel('Launch review')).toContainText('Trial via credit provenance');

  await page.getByRole('radio', { name: /RTX 4090/ }).click();
  await expect(computeSummary).toContainText('RTX 4090');
  await expect(computeSummary).toContainText('Request mode: Fixed GPU request');
  await expect(computeSummary).toContainText('24 GB VRAM');
  await expect(computeSummary).toContainText('Quote: ~SAR');
  await expect(computeSummary.getByRole('button', { name: 'Auto-pick', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(computeSummary.getByRole('button', { name: 'Fixed GPU', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Launch review')).toContainText('RTX 4090');
  await expect(gpuSelectionStrip).toContainText('RTX 4090');
  await expect(gpuSelectionStrip).toContainText('SAR 12.00/hr');
  await expect(gpuSelectionStrip.getByRole('button', { name: 'Back to auto-pick' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use auto-pick' })).toBeVisible();
});
