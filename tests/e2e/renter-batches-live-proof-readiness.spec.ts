import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-batch-smoke-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function mockBatchApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ renter: { name: 'Batch Renter', email: 'batch@example.test' } }),
      });
    }

    if (path === '/api/batches') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: 'list', data: [] }),
      });
    }

    if (path === '/api/batches/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          readiness: {
            object: 'batch_inference_readiness',
            version: 'dcp.batch_inference_readiness.v1',
            current_mode: 'metadata_validation_only',
            public_execution_enabled: false,
            request_creation_enabled: true,
            supported_urls: ['/v1/chat/completions', '/v1/complete'],
            limits: {
              max_requests: 1000,
              max_bytes: 10485760,
              completion_windows: ['24h'],
            },
            endpoints: {
              create: '/api/batches',
              list: '/api/batches',
              detail: '/api/batches/{batch_id}',
              lines: '/api/batches/{batch_id}/lines',
              results: '/api/batches/{batch_id}/results',
            },
            features: {
              jsonl_validation: { status: 'available', enabled: true },
              line_ledger: { status: 'available', enabled: true },
              result_manifest: { status: 'available_after_result_proof', enabled: true },
              result_downloads: { status: 'not_configured', configured: false, enabled_for_completed_results: false },
              worker_execution: { status: 'disabled', env_flag_enabled: false, public_enabled: false },
              settlement: { status: 'disabled', env_flag_enabled: false, public_enabled: false },
              discounts: { status: 'not_enabled', enabled: false },
              model_capability_flag: { status: 'false_until_execution_and_settlement_proof', enabled: false },
            },
            live_acceptance: {
              execution_discount_smoke: {
                status: 'blocked_external',
                command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
                live_acceptance_gate: 'batch_live_execution_discount_smoke',
                blocked_on: [
                  'funded renter key',
                  'live provider execution capacity',
                  'object-store result path',
                  'discount policy approval',
                ],
                verifies: [
                  'renter-authenticated readiness',
                  'batch create guard',
                  'result manifest/download prerequisites',
                  'discount remains disabled until approved',
                ],
              },
            },
            claims: {
              batch_execution_live: false,
              batch_discount_live: false,
              model_batch_capability_live: false,
              result_downloads_depend_on_completed_result_proof: true,
            },
            next: 'connect_worker_to_live_v1_executor_after_gpu_billing_and_result_smoke',
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
            v1_inference: { status: 'live_estimate_preflight', enforcement_live: true },
            prompt_cache_discount: { status: 'measurement_only', enforcement_live: false },
            lora_training: { status: 'metadata_and_artifact_proof_only', enforcement_live: false },
            adapter_deployments: { status: 'load_and_billing_policy_required', enforcement_live: false },
            evaluators: { status: 'readiness_contract_only', enforcement_live: false },
          },
          claim_guards: {
            mutates_balance: false,
            dispatches_inference: false,
            creates_batch: false,
            enables_discount: false,
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

test('renter batch console renders live proof gate from readiness contract', async ({ page, context }) => {
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
  await mockBatchApis(page);

  await page.goto('/renter/batches');

  await expect(page.getByLabel('Batch readiness')).toContainText('metadata validation only');
  await expect(page.getByLabel('Batch readiness')).toContainText('Execute');
  await expect(page.getByLabel('Batch readiness')).toContainText('gated');
  const creditGate = page.getByLabel('Batch credit preflight');
  await expect(creditGate).toContainText('minimum balance synced');
  await expect(creditGate).toContainText('Batch settlement');
  await expect(creditGate).toContainText('contract only');
  await expect(creditGate).toContainText('Paid available');
  await expect(creditGate).toContainText('SAR 38.00');
  await expect(creditGate).toContainText('v1 cap remaining');
  await expect(creditGate).toContainText('SAR 140.00');
  await expect(creditGate).toContainText('Blocked billing rails');
  await expect(creditGate).toContainText('5');
  const liveGate = page.getByLabel('Batch live proof gate');
  await expect(liveGate).toContainText('batch live execution discount smoke');
  await expect(liveGate).toContainText('DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution');
  await expect(liveGate).toContainText('blocked external');
  await expect(liveGate).toContainText('funded renter key');
  await expect(liveGate).toContainText('live provider execution capacity');
  await expect(liveGate).toContainText('object-store result path');
  await expect(liveGate).toContainText('discount policy approval');
  await expect(liveGate).toContainText('renter-authenticated readiness');
  await expect(liveGate).toContainText('batch create guard');
});
