import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-ft-proof-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function mockFineTuningApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ renter: { name: 'Registry Proof Renter', email: 'proof@example.test' } }),
      });
    }

    if (path === '/api/adapters') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'list',
          data: [
            {
              adapter_id: 'adpt_support_arabic',
              name: 'support-arabic-lora',
              base_model: 'Qwen/Qwen2.5-7B-Instruct',
              storage_key: 'adapters/support-arabic/adapter.safetensors',
              checksum_sha256: 'b'.repeat(64),
              rank: 16,
              status: 'ready',
              created_at: '2026-07-09T12:30:00Z',
              updated_at: '2026-07-09T12:30:00Z',
              deployed_at: null,
            },
          ],
          count: 1,
          limit: 50,
          offset: 0,
        }),
      });
    }

    if (path === '/api/adapters/deployments') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: 'list', data: [], count: 0, limit: 50, offset: 0 }),
      });
    }

    if (path === '/api/adapters/adpt_support_arabic/deployments' && route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          deployment: {
            deployment_id: 'adpl_mockintent',
            renter_id: 1,
            adapter_id: 'adpt_support_arabic',
            base_model: 'Qwen/Qwen2.5-7B-Instruct',
            mode: 'single_adapter_live_merge',
            endpoint_id: null,
            status: 'pending',
            route_traffic: false,
            serving_load_proof: null,
            failure_reason: null,
            created_at: '2026-07-09T12:40:00Z',
            updated_at: '2026-07-09T12:40:00Z',
            started_at: null,
            stopped_at: null,
          },
          serving_enabled: false,
          next: 'attach_serving_load_proof_internal',
        }),
      });
    }

    if (path === '/api/adapters/adpt_support_arabic/deployments/adpl_mockintent/stop' && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          deployment: {
            deployment_id: 'adpl_mockintent',
            renter_id: 1,
            adapter_id: 'adpt_support_arabic',
            base_model: 'Qwen/Qwen2.5-7B-Instruct',
            mode: 'single_adapter_live_merge',
            endpoint_id: null,
            status: 'stopped',
            route_traffic: false,
            serving_load_proof: null,
            failure_reason: null,
            created_at: '2026-07-09T12:40:00Z',
            updated_at: '2026-07-09T12:45:00Z',
            started_at: null,
            stopped_at: '2026-07-09T12:45:00Z',
          },
          serving_enabled: false,
          next: 'deployment_stopped_by_renter',
        }),
      });
    }

    if (path === '/api/lora/training-jobs') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'list',
          data: [
            {
              training_job_id: 'lora_job_dataset_001',
              recipe: 'lora_sft',
              base_model: 'Qwen/Qwen2.5-7B-Instruct',
              dataset_storage_key: 'datasets/support/train.jsonl',
              dataset_checksum_sha256: 'a'.repeat(64),
              dataset_format: 'jsonl_prompt_completion',
              dataset_row_count: 1280,
              train_rows: 1152,
              validation_rows: 128,
              estimated_tokens: 184320,
              output_adapter_name: 'support-arabic-lora',
              output_adapter_id: 'adpt_support_arabic',
              status: 'queued',
              artifact_storage_key: null,
              artifact_checksum_sha256: null,
              model_card_storage_key: null,
              model_card_manifest: null,
              failure_reason: null,
              training_enabled: false,
              adapter_registered: false,
              created_at: '2026-07-09T12:00:00Z',
              updated_at: '2026-07-09T12:00:00Z',
            },
          ],
          count: 1,
          limit: 50,
          offset: 0,
        }),
      });
    }

    if (path === '/api/lora/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'lora_readiness',
          version: 'dcp.lora_readiness.v1',
          current_mode: 'metadata_and_artifact_proof_only',
          dataset_validation: { status: 'available', available: true },
          training_jobs: { status: 'metadata_only', public_training_enabled: false, worker_execution_enabled: false },
          model_cards: { status: 'metadata_stub' },
          adapter_registry: {
            status: 'metadata_registry',
            registry_contract_proof: {
              status: 'ci_safe',
              command: 'npm run proof:adapter-registry-contract',
              local_roadmap_gate: 'adapter_registry_contract',
            },
            serving_enabled: false,
            route_traffic: false,
          },
          adapter_deployments: {
            status: 'load_proof_required',
            deployment_contract_proof: {
              status: 'ci_safe',
              command: 'npm run proof:adapter-deployment-contract',
              local_roadmap_gate: 'adapter_deployment_contract',
            },
            route_traffic: false,
          },
          claim_guards: {
            public_training_enabled: false,
            public_serving_enabled: false,
            route_traffic: false,
            quality_claims: false,
            tinker_compatible: false,
            discounts_enabled: false,
          },
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
            paid_available_halala: 3800,
            paid_available_sar: 38,
            v1_remaining_cap_halala: 14000,
            v1_remaining_cap_sar: 140,
          },
          rails: {
            batch_inference: { status: 'contract_only', enforcement_live: false },
            prompt_cache_discount: { status: 'measurement_only', enforcement_live: false },
            lora_training: { status: 'metadata_and_artifact_proof_only', enforcement_live: false },
            adapter_deployments: { status: 'load_and_billing_policy_required', enforcement_live: false },
            evaluators: { status: 'readiness_contract_only', enforcement_live: false },
          },
          claim_guards: {
            mutates_balance: false,
            creates_lora_training_job: false,
            creates_adapter_deployment: false,
            changes_enforcement: false,
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

test('public Fine-Tuning page exposes the adapter registry proof command', async ({ page }) => {
  await page.goto('/fine-tuning');

  await expect(page.getByText(/registry contract proof is now part of the local roadmap suite/i)).toBeVisible();
  await expect(page.getByText('npm run proof:adapter-registry-contract')).toBeVisible();
  await expect(page.getByText(/adapter_registry\.registry_contract_proof/)).toBeVisible();
  await expect(page.getByText(/deployment lifecycle contract proof is part of the local roadmap suite/i)).toBeVisible();
  await expect(page.getByText('npm run proof:adapter-deployment-contract')).toBeVisible();
  await expect(page.getByText(/adapter_deployments\.deployment_contract_proof/)).toBeVisible();
  await expect(page.getByText('Intent control loop')).toBeVisible();
  await expect(page.getByText('create/stop live · routes off')).toBeVisible();
  await expect(page.getByText(/ready adapters can create and stop gated deployment intent rows/i)).toBeVisible();
  await expect(page.getByText('https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/stop')).toBeVisible();
  await expect(page.getByText('-X POST').last()).toBeVisible();
  await expect(page.getByText('intent_control')).toBeVisible();
});

test('renter Fine-Tuning readiness shows registry proof status', async ({ page, context }) => {
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
  await mockFineTuningApis(page);

  await page.goto('/renter/fine-tuning');

  const readinessGrid = page.locator('.ft-readiness-grid');
  await expect(readinessGrid).toContainText('Registry');
  await expect(readinessGrid).toContainText('metadata registry · ci safe');
  await expect(readinessGrid).toContainText('Deployments');
  await expect(readinessGrid).toContainText('load proof required · ci safe');
  const creditPreflight = page.getByLabel('Fine-tuning credit preflight');
  await expect(creditPreflight).toContainText('minimum balance synced');
  await expect(creditPreflight).toContainText('LoRA training');
  await expect(creditPreflight).toContainText('metadata and artifact proof only');
  await expect(creditPreflight).toContainText('Adapter deployments');
  await expect(creditPreflight).toContainText('load and billing policy required');
  await expect(creditPreflight).toContainText('Paid available');
  await expect(creditPreflight).toContainText('SAR 38.00');
  await expect(creditPreflight).toContainText('Blocked billing rails');
  await expect(creditPreflight).toContainText('5');
  await expect(creditPreflight).toContainText('Read-only: no enforcement change');
  const datasetPolicy = page.getByLabel('LoRA dataset policy');
  await expect(datasetPolicy).toContainText('Validation');
  await expect(datasetPolicy).toContainText('available');
  await expect(datasetPolicy).toContainText('Raw rows');
  await expect(datasetPolicy).toContainText('not persisted');
  await expect(datasetPolicy).toContainText('Training job');
  await expect(datasetPolicy).toContainText('metadata only');
  await expect(datasetPolicy).toContainText('GPU worker');
  await expect(datasetPolicy).toContainText('off');
  await expect(page.getByText('Validated datasets')).toBeVisible();
  const datasetTable = page.locator('.ft-dataset-table');
  await expect(datasetTable).toContainText('datasets/support/train.jsonl');
  await expect(datasetTable).toContainText('1,280 rows');
  await expect(datasetTable).toContainText('jsonl_prompt_completion · train 1,152 · val 128');
  await expect(datasetTable).toContainText('184,320');
  await expect(datasetTable).toContainText('Qwen/Qwen2.5-7B-Instruct');
  await expect(datasetTable).toContainText('raw rows not stored');
  await expect(datasetTable).toContainText('trainer off');
  const deploymentPlanner = page.getByLabel('Adapter deployment summary');
  await expect(deploymentPlanner).toContainText('Ready adapters');
  await expect(deploymentPlanner).toContainText('1');
  await expect(deploymentPlanner).toContainText('Active intents');
  await expect(deploymentPlanner).toContainText('0');
  await expect(page.getByText('Adapter serving path')).toBeVisible();
  await expect(page.getByText('support-arabic-lora').first()).toBeVisible();
  await expect(page.getByText('Create gated intent')).toBeVisible();
  await page.getByText('Create gated intent').click();
  await expect(page.getByText('Intent adpl_mockintent created. Serving remains disabled until load proof.')).toBeVisible();
  await expect(page.getByText('Stop intent')).toBeVisible();
  await expect(page.getByLabel('Adapter serving path').getByText('load proof pending')).toBeVisible();
  await page.getByText('Stop intent').click();
  await expect(page.getByText('Intent adpl_mockintent stopped. Route traffic is off.')).toBeVisible();
  await expect(page.getByText('Create gated intent')).toBeVisible();
  await expect(page.locator('.ft-supported')).toContainText('training off');
  await expect(page.locator('.ft-supported')).toContainText('routes off');
});
