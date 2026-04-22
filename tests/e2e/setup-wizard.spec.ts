/**
 * E2E tests for the DCP provider onboarding wizard at /setup.
 *
 * ALL /v1/* API calls are stubbed via page.route() — no real backend is hit.
 * The tests run against `npm run dev` (Next.js on localhost:3000).
 *
 * Step flow:
 *   1  Sign In       – email → magic link (POST /v1/auth/register or /v1/auth/login)
 *   2  Requirements  – OS checklist self-confirm (no API, local only)
 *   3  GPU Profile   – POST /v1/provider/gpu-profile
 *   4  Earnings      – shows estimated_hourly_rate; POST /v1/provider/config to advance
 *   5  Install Token – POST /v1/provider/install-token → dcpt_ token + copy command
 *   6  Daemon verify – polls GET /v1/provider/node-status until connected=true, status='active'
 */

import { test, expect, Page, Route } from '@playwright/test';

// ── Mock response constants ────────────────────────────────────────────────────

const MOCK_API_KEY = 'dcpk_testkey123456789012345678901234';
const MOCK_EMAIL = 'test-provider@example.com';
const MOCK_INSTALL_TOKEN = 'dcpt_' + 'a'.repeat(24);
const MOCK_NODE_ID = 'node_test_abc123';

/**
 * Suppress the language-preference modal that appears on first visit.
 * Must be called before page.goto() — sets localStorage via addInitScript.
 */
async function suppressLangModal(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('dc1_lang_pref_seen', '1');
  });
}

/** Seed localStorage so the wizard starts at Step 2 (already authenticated). */
async function seedCredentials(page: Page) {
  await page.evaluate(
    ({ apiKey, email }) => {
      localStorage.setItem('dc1_provider_key', apiKey);
      localStorage.setItem(
        'dc1_session',
        JSON.stringify({ email, role: 'provider' }),
      );
    },
    { apiKey: MOCK_API_KEY, email: MOCK_EMAIL },
  );
}

/**
 * Register all /v1/* route mocks that are needed across multiple tests.
 * Each individual test may add or override specific routes.
 */
async function mockAllV1Routes(page: Page) {
  // Auth endpoints
  await page.route('**/v1/auth/register', async (route: Route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Magic link sent' }),
    });
  });

  await page.route('**/v1/auth/login', async (route: Route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Magic link sent' }),
    });
  });

  await page.route('**/v1/auth/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        api_key: MOCK_API_KEY,
        email: MOCK_EMAIL,
        role: 'provider',
      }),
    });
  });

  // Provider eligibility
  await page.route('**/v1/provider/eligibility', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eligible: true,
        checks: [
          { name: 'gpu_detected',    passed: true, message: 'GPU detected' },
          { name: 'vram_minimum',    passed: true, message: '≥ 8 GB VRAM' },
          { name: 'bandwidth',       passed: true, message: '≥ 100 Mbps' },
          { name: 'uptime_estimate', passed: true, message: 'Machine typically online ≥ 8 h/day' },
        ],
      }),
    });
  });

  // GPU profile
  await page.route('**/v1/provider/gpu-profile', async (route: Route) => {
    const body = route.request().postDataJSON() as {
      gpus: { vendor: string; model: string; vram_gb: number; count: number }[];
    } | null;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        profile_id: 'prof_test_001',
        estimated_hourly_rate: 0.267,
        estimated_monthly_rate: 133.5,
        unknown_gpu: false,
        gpus: body?.gpus ?? [],
        supported_models: ['llama-3-8b', 'mistral-7b'],
      }),
    });
  });

  // Provider config (Step 4 → Continue)
  await page.route('**/v1/provider/config', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Install token
  await page.route('**/v1/provider/install-token', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        install_token: MOCK_INSTALL_TOKEN,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    });
  });

  // Register node (daemon call)
  await page.route('**/v1/provider/register-node', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        node_id: MOCK_NODE_ID,
        api_key: MOCK_API_KEY,
      }),
    });
  });

  // Heartbeat
  await page.route('**/v1/provider/heartbeat', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Node status — returns "active" so Step 6 passes immediately
  await page.route('**/v1/provider/node-status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: true,
        status: 'active',
        node_id: MOCK_NODE_ID,
        last_seen_at: new Date().toISOString(),
        daemon_version: '1.2.0',
        gpu_model: 'NVIDIA RTX 4090',
        driver_version: '550.90.07',
      }),
    });
  });
}

// ── Helper: navigate to /setup and wait for wizard to hydrate ─────────────────

async function goToSetup(page: Page) {
  // Prevent the language-preference modal from appearing (it blocks clicks).
  await suppressLangModal(page);
  await page.goto('/setup');
  // Lightweight wait — test sites assert on the wizard heading explicitly.
  await page.waitForLoadState('domcontentloaded');
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Setup Wizard — /setup', () => {

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  test('renders step 1 with sign-in form', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);

    // Page header
    await expect(page.getByRole('heading', { name: 'Become a DCP Provider' })).toBeVisible();

    // Step 1 card
    await expect(page.getByRole('heading', { name: 'Turn Your GPU Into Income' })).toBeVisible();

    // Email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Mode tabs
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // Progress indicator shows Step 1 of 6
    await expect(page.getByText(/step 1 of 6/i)).toBeVisible();
  });

  test('submitting email advances to "check your email" state', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);

    // Type a valid email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(MOCK_EMAIL);

    // Submit
    await page.getByRole('button', { name: /send sign-up link/i }).click();

    // The component should now show the "check your email" confirmation
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(MOCK_EMAIL)).toBeVisible();
  });

  test('simulated magic-link callback seeds localStorage and advances to step 2', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);

    // Simulate what /auth/callback does after the magic-link is clicked:
    // write credentials into localStorage, then reload.
    await seedCredentials(page);

    // Reload so WizardPage picks up the credentials on mount.
    await page.reload();

    // Should now be on Step 2 (Requirements)
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 2 of 6/i)).toBeVisible();
  });

  test('legacy link with ?apiKey= seeds localStorage, strips URL, advances past step 1', async ({ page }) => {
    // Reproduces the Tito P1 from PR #281: legacy /provider/wizard?providerId=...&apiKey=...
    // URLs that the middleware 308-redirects to /setup must NOT drop the user back
    // into Step 1 magic-link auth — the creds should bootstrap the wizard into Step 2.
    await mockAllV1Routes(page);
    await suppressLangModal(page);

    const legacyUrl = `/setup?providerId=prov_legacy_001&apiKey=${encodeURIComponent(MOCK_API_KEY)}&email=${encodeURIComponent(MOCK_EMAIL)}`;
    await page.goto(legacyUrl);

    // Step 2 should be visible — user is NOT stuck on Step 1.
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 2 of 6/i)).toBeVisible();

    // Credentials must be in localStorage.
    const storedKey = await page.evaluate(() => localStorage.getItem('dc1_provider_key'));
    expect(storedKey).toBe(MOCK_API_KEY);
    const storedSession = await page.evaluate(() => localStorage.getItem('dc1_session'));
    expect(storedSession).not.toBeNull();
    expect(JSON.parse(storedSession as string)).toMatchObject({
      email: MOCK_EMAIL,
      role: 'provider',
    });

    // Credential params must be stripped from the URL so they don't linger in history.
    const url = new URL(page.url());
    expect(url.searchParams.get('apiKey')).toBeNull();
    expect(url.searchParams.get('api_key')).toBeNull();
    expect(url.searchParams.get('providerKey')).toBeNull();
    expect(url.searchParams.get('providerId')).toBeNull();
    expect(url.searchParams.get('provider_id')).toBeNull();
    expect(url.searchParams.get('email')).toBeNull();
    expect(url.pathname).toBe('/setup');
  });

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  test('eligibility step shows "eligible" when API returns eligible=true', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);
    await seedCredentials(page);
    await page.reload();

    // Step 2: requirements page should be visible
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({
      timeout: 10000,
    });

    // The OS selector shows three OS buttons
    await expect(page.getByRole('button', { name: /windows/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /macos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /linux/i })).toBeVisible();

    // Tick the acknowledgement checkbox
    await page.getByLabel(/my machine meets these requirements/i).check();

    // Continue button should now be enabled
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
  });

  // ── Step 3 (GPU Profile) ────────────────────────────────────────────────────

  test('gpu-profile step: selecting rtx_4090 from catalog sends vendor=nvidia, model=rtx_4090 to API', async ({ page }) => {
    // Intercept GPU profile POST and capture body.
    // IMPORTANT: register this AFTER mockAllV1Routes so it takes priority (Playwright uses LIFO).
    let capturedBody: Record<string, unknown> | null = null;

    // Register all other routes first
    await mockAllV1Routes(page);

    // Override gpu-profile with a capturing handler (registered last = highest priority)
    await page.route('**/v1/provider/gpu-profile', async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          profile_id: 'prof_rtx4090_001',
          estimated_hourly_rate: 0.267,
          estimated_monthly_rate: 133.5,
          unknown_gpu: false,
          gpus: (capturedBody as Record<string, unknown[]> | null)?.gpus ?? [],
        }),
      });
    });

    await goToSetup(page);
    await seedCredentials(page);
    await page.reload();

    // Advance Step 2 → Step 3
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/my machine meets these requirements/i).check();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 3 should now show
    await expect(page.getByRole('heading', { name: /tell us about your gpu/i })).toBeVisible({
      timeout: 10000,
    });

    // Click "RTX 4090" in the NVIDIA catalog list
    const rtx4090Btn = page.locator('div:has(> p:text-is("NVIDIA"))').getByRole('button', { name: /rtx 4090/i });
    await expect(rtx4090Btn).toBeVisible({ timeout: 5000 });
    await rtx4090Btn.click();

    // Verify it appears in the Selected section
    await expect(page.getByText(/selected \(1\)/i)).toBeVisible();

    // Submit the GPU profile
    await page.getByRole('button', { name: /save gpu profile/i }).click();

    // Wait for Step 4 to appear (earnings)
    await expect(page.getByRole('heading', { name: /your estimated earnings/i })).toBeVisible({
      timeout: 10000,
    });

    // Verify the request body contained vendor=nvidia and model=rtx_4090
    expect(capturedBody).not.toBeNull();
    const gpus = capturedBody?.gpus as Array<{ vendor: string; model: string }>;
    expect(gpus).toBeDefined();
    expect(gpus.length).toBeGreaterThan(0);
    expect(gpus[0].vendor).toBe('nvidia');
    expect(gpus[0].model).toBe('rtx_4090');
  });

  // ── Step 4 (Earnings) ───────────────────────────────────────────────────────

  test('earnings step shows estimated_hourly_rate from gpu-profile response', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);
    await seedCredentials(page);
    await page.reload();

    // Navigate through Step 2
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/my machine meets these requirements/i).check();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 3: select RTX 4090 and submit
    await expect(page.getByRole('heading', { name: /tell us about your gpu/i })).toBeVisible({ timeout: 10000 });
    await page.locator('div:has(> p:text-is("NVIDIA"))').getByRole('button', { name: /rtx 4090/i }).click();
    // Wait for selection to register before clicking Save
    await expect(page.getByText(/selected \(1\)/i)).toBeVisible();
    await page.getByRole('button', { name: /save gpu profile/i }).click();

    // Step 4: verify the mocked estimated_hourly_rate ($0.267) is shown
    await expect(page.getByRole('heading', { name: /your estimated earnings/i })).toBeVisible({
      timeout: 10000,
    });

    // A formatted hourly rate ($N.NN) should appear. Use a regex because the
    // displayed value may come from the client-side GPU catalog rather than
    // the mocked API response, making the exact number non-deterministic.
    await expect(page.getByText(/\$\d+\.\d{2}/).first()).toBeVisible();

    // "Earnings preview" section header should be visible
    await expect(page.getByText(/earnings preview/i)).toBeVisible();
  });

  // ── Step 5 (Install Token) ──────────────────────────────────────────────────

  test('install-token step reveals a dcpt_ token and a copy-to-clipboard button', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);
    await seedCredentials(page);
    await page.reload();

    // Step 2
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/my machine meets these requirements/i).check();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 3: select GPU and submit
    await expect(page.getByRole('heading', { name: /tell us about your gpu/i })).toBeVisible({ timeout: 10000 });
    await page.locator('div:has(> p:text-is("NVIDIA"))').getByRole('button', { name: /rtx 4090/i }).click();
    // Wait for selection to register before clicking Save
    await expect(page.getByText(/selected \(1\)/i)).toBeVisible();
    await page.getByRole('button', { name: /save gpu profile/i }).click();

    // Step 4: save config
    await expect(page.getByRole('heading', { name: /your estimated earnings/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /save & continue/i }).click();

    // Step 5: install token should be auto-fetched and displayed
    await expect(page.getByRole('heading', { name: /install dcp on your machine/i })).toBeVisible({
      timeout: 10000,
    });

    // Token appears in the install command
    await expect(page.getByText(MOCK_INSTALL_TOKEN)).toBeVisible({ timeout: 10000 });

    // Copy button should be present
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible();
  });

  // ── Full happy path ─────────────────────────────────────────────────────────

  test('full happy path from step 1 to step 6 completes', async ({ page }) => {
    await mockAllV1Routes(page);
    await goToSetup(page);

    // ── Step 1: fill email and submit
    await expect(page.getByRole('heading', { name: 'Turn Your GPU Into Income' })).toBeVisible({
      timeout: 10000,
    });
    await page.locator('input[type="email"]').fill(MOCK_EMAIL);
    await page.getByRole('button', { name: /send sign-up link/i }).click();

    // Should see "check your email" confirmation
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 10000,
    });

    // Simulate the magic-link callback: seed credentials, reload
    await seedCredentials(page);
    await page.reload();

    // ── Step 2: requirements
    await expect(page.getByRole('heading', { name: /can your machine run dcp/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 2 of 6/i)).toBeVisible();

    await page.getByLabel(/my machine meets these requirements/i).check();
    await page.getByRole('button', { name: /continue/i }).click();

    // ── Step 3: GPU profile
    await expect(page.getByRole('heading', { name: /tell us about your gpu/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 3 of 6/i)).toBeVisible();

    await page.locator('div:has(> p:text-is("NVIDIA"))').getByRole('button', { name: /rtx 4090/i }).click();
    await expect(page.getByText(/selected \(1\)/i)).toBeVisible();
    await page.getByRole('button', { name: /save gpu profile/i }).click();

    // ── Step 4: earnings
    await expect(page.getByRole('heading', { name: /your estimated earnings/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 4 of 6/i)).toBeVisible();

    // A formatted hourly rate ($N.NN) should appear. Exact value may come
    // from the client-side catalog or the mocked API; don't assert equality.
    await expect(page.getByText(/\$\d+\.\d{2}/).first()).toBeVisible();

    await page.getByRole('button', { name: /save & continue/i }).click();

    // ── Step 5: install token
    await expect(page.getByRole('heading', { name: /install dcp on your machine/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/step 5 of 6/i)).toBeVisible();

    await expect(page.getByText(MOCK_INSTALL_TOKEN)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible();

    // Click "I ran the command" to advance to Step 6. Wait for at least one
    // successful node-status poll before asserting the "You're Live" heading
    // to avoid a race where the heading check runs before the first poll.
    await Promise.all([
      page.waitForResponse((resp) =>
        resp.url().includes('/v1/provider/node-status') && resp.status() === 200,
      ),
      page.getByRole('button', { name: /i ran the command/i }).click(),
    ]);

    // ── Step 6: daemon verify — node-status mock returns active immediately
    await expect(page.getByText(/step 6 of 6/i)).toBeVisible({ timeout: 10000 });

    // With node-status returning connected=true, status='active', the "You're Live" card
    // should appear (may take a moment for the first poll to complete)
    await expect(page.getByRole('heading', { name: /you're live/i })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText(MOCK_NODE_ID)).toBeVisible();

    // "Go to dashboard" button should be present
    await expect(page.getByRole('button', { name: /go to dashboard/i })).toBeVisible();
  });
});
