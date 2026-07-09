import { expect, test } from '@playwright/test';

test('public batch page renders sanitized live readiness gates', async ({ page }) => {
  await page.route('**/api/batches/public/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      readiness: {
        object: 'batch_inference_readiness',
        version: 'dcp.batch_inference_readiness.v1',
        public_view: true,
        current_mode: 'metadata_validation_only',
        public_execution_enabled: false,
        request_creation_enabled: true,
        supported_urls: ['/v1/chat/completions', '/v1/complete'],
        limits: { completion_windows: ['24h'] },
        features: {
          jsonl_validation: { status: 'available', enabled: true },
          line_ledger: { status: 'available', enabled: true },
          result_downloads: { status: 'not_configured', configured: false, enabled_for_completed_results: false },
          worker_execution: { status: 'disabled', public_enabled: false },
          settlement: { status: 'disabled', public_enabled: false },
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
            ],
          },
        },
        claims: {
          batch_execution_live: false,
          batch_discount_live: false,
          model_batch_capability_live: false,
        },
        next: 'connect_worker_to_live_v1_executor_after_gpu_billing_and_result_smoke',
      },
    }),
  }));

  await page.goto('/batch');

  const readiness = page.getByLabel('Public batch readiness');
  await expect(readiness).toContainText('Live Batch readiness');
  await expect(readiness).toContainText('dcp.batch_inference_readiness.v1');
  await expect(readiness).toContainText('metadata validation only');
  await expect(readiness).toContainText('Create');
  await expect(readiness).toContainText('available');
  await expect(readiness).toContainText('Execute');
  await expect(readiness).toContainText('gated');
  await expect(readiness).toContainText('Worker execution');
  await expect(readiness).toContainText('Result downloads');
  await expect(readiness).toContainText('Batch discounts');
  await expect(readiness).toContainText('funded renter key');
  await expect(readiness).toContainText('DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution');
  await expect(readiness).toContainText('GET /api/batches/public/readiness');
  await expect(readiness).not.toContainText('BATCH_RESULTS_S3_SECRET');
  await expect(readiness).not.toContainText('env_flag_enabled');
});
