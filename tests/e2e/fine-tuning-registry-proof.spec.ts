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
        body: JSON.stringify({ object: 'list', data: [], count: 0, limit: 50, offset: 0 }),
      });
    }

    if (path === '/api/adapters/deployments') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: 'list', data: [], count: 0, limit: 50, offset: 0 }),
      });
    }

    if (path === '/api/lora/training-jobs') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: 'list', data: [], count: 0, limit: 50, offset: 0 }),
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
  await expect(page.locator('.ft-supported')).toContainText('training off');
  await expect(page.locator('.ft-supported')).toContainText('routes off');
});
