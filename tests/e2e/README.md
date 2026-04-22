# DCP Provider Wizard — E2E Tests

End-to-end tests for the provider onboarding wizard at `/setup`.
All backend (`/v1/*`) calls are stubbed via Playwright's `page.route()`, so no live
backend or Supabase account is required.

## Prerequisites

- Node 18+
- `npm install` (installs `@playwright/test`)
- Chromium browser: `npx playwright install chromium` (or `--with-deps` on Linux CI)

## Running locally

```bash
# From the repo root
npm run test:e2e
```

Playwright will automatically start `npm run dev` (Next.js on port 3000) if it is not
already running. To skip the built-in web-server launch (e.g. the app is already
running), set:

```bash
E2E_SKIP_WEBSERVER=1 npm run test:e2e
```

### Interactive / debug mode

```bash
npm run test:e2e:debug   # headed, pauses on first test
npm run test:e2e:ui      # Playwright UI mode
```

## Running in CI

The `playwright.config.ts` sets `webServer.reuseExistingServer: !process.env.CI`.
In CI, start the dev server (or a production build) before running the suite, then:

```bash
E2E_SKIP_WEBSERVER=1 npm run test:e2e
# — or, let Playwright manage the server —
npm run test:e2e        # CI=1 is set automatically by most CI systems
```

Artifacts (screenshots, videos, HTML report) land in `test-results/`.

## Test coverage

| Test | What it checks |
|------|---------------|
| renders step 1 with sign-in form | Page title, email input, mode tabs, step progress (1/6) |
| submitting email advances to "check your email" state | POST /v1/auth/register stubbed → 202 confirmation card |
| simulated magic-link callback seeds localStorage and advances to step 2 | localStorage write + reload → Step 2 (Requirements) |
| eligibility step shows "eligible" when API returns eligible=true | Step 2 OS selector + acknowledgement checkbox flow |
| gpu-profile step: selecting rtx_4090 sends vendor=nvidia, model=rtx_4090 | Captures POST body, asserts vendor/model fields |
| earnings step shows estimated_hourly_rate from gpu-profile response | $0.267/hr from mock → $0.27 rendered in earnings card |
| install-token step reveals a dcpt_ token and a copy-to-clipboard button | Token text visible, Copy button present |
| full happy path from step 1 to step 6 completes | Walks all 6 steps end-to-end with mocked API, finishes on "You're Live" |

## Architecture notes

- The wizard at `app/setup/page.tsx` mounts `WizardShell` which drives 6 steps.
- All API calls go through `v1Fetch()` in `app/provider/components/wizard/primitives.tsx`
  which uses `NEXT_PUBLIC_DCP_API_BASE` (defaults to `/v1`).
- Next.js rewrites `/v1/*` → backend at `BACKEND_URL/v1/*` (see `next.config.js`).
- In tests, `page.route('**/v1/**', ...)` intercepts these requests before they leave
  the browser, so no network traffic ever reaches the real backend.
- Step 1 auth uses `dc1_provider_key` + `dc1_session` in `localStorage` (written by
  `/auth/callback` in production; seeded directly by tests).
