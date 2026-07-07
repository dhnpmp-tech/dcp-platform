# DCP System Map - 2026-07-07

Snapshot from the local repo, GitHub, production VPS checks, and the July 7
Tareq/LoRA handovers.

## Repository Identity

- Local working tree: `/Users/pp/DC1-Platform/dc1-platform`
- GitHub origin: `https://github.com/dhnpmp-tech/dcp-platform.git`
- Confirmed head after July 7 deploy/audit refresh: `237b77949a64f43359d96bc649e21f93de533283`
- Production VPS checkout: `/root/dc1-platform`, same tracked head after audit refresh.
- DCP org repos also found: `DCP-SA/dcp-desktop`, `DCP-SA/dcp-contracts`, `DCP-SA/dcp-agent`.

Known untracked items at audit time:

- Local: `.verify/`, `ops/dcp-deploy-watch.sh`
- VPS: runtime/build artifacts, provider logs, reports, binaries, VSIX packages,
  plus cron-installed helper copies under `/usr/local/bin`.
- The deploy watcher reads runtime secrets from the VPS watchdog env file.
- The low-balance watcher drift found on 2026-07-07 is tracked in
  `docs/architecture/dcp-codebase-production-audit-2026-07-07.md`.

## Product Surfaces

DCP is currently two products sharing one money/account/provider backend:

1. OpenAI-compatible AI inference at `https://api.dcp.sa/v1`.
2. GPU pods at `https://dcp.sa/renter/pods`, billed prepaid by GPU-second with
   early-stop refunds.

Supporting surfaces:

- Public website and renter UI: Next.js app under `app/`.
- Backend API: Express app under `backend/src/`.
- Provider fleet: SQLite-backed provider registry, heartbeat mesh, WireGuard,
  provider installers, and pod launch templates.
- Payments: Moyasar top-up and payout plumbing, plus internal credit ledger.
- Admin/operator UI: v2/admin routes and backend admin APIs.

## Deployment Model

- Frontend: Vercel, public site at `https://dcp.sa`.
- Backend: production VPS, API at `https://api.dcp.sa`, local backend port `8083`.
- Runtime process observed: `dc1-provider-onboarding` online under pm2.
- Production health check observed healthy on `/api/health`.

Tracked code parity goal:

- `local main == origin/main == VPS checkout`
- Any local or VPS-only runtime scripts must be consciously promoted to GitHub,
  ignored, or archived. They should not stay ambiguous.

## Backend Entry Points

Main server:

- `backend/src/server.js`

Important mounted route families:

- `/api/providers`: provider registration, heartbeat, jobs, earnings.
- `/api/admin`: admin/operator APIs.
- `/api/jobs`: queued batch/container jobs.
- `/api/pods`: interactive GPU pods.
- `/api/renters`: renter account, balance, provider discovery.
- `/api/payments`: Moyasar/bank-transfer top-ups and webhooks.
- `/api/pricing`: pricing data.
- `/api/subscriptions`: subscription and credit plan surfaces.
- `/v1`: OpenAI-compatible inference API.
- `/anthropic`: Anthropic-compatible API surface.
- `/v1/cli`: CLI-oriented API helpers.

Backend rule from `backend/OVERVIEW.md`: money/routing changes are production
critical and require targeted backend tests plus OpenAPI/contracts review.

## Pod Billing Path

Primary file:

- `backend/src/routes/pods.js`

Current behavior:

- Interactive pods are stored as `jobs` with `job_type = 'interactive_pod'`.
- Launch requires renter authentication with compute scope.
- Quote is computed from requested duration, provider rate, and GPU count.
- The renter balance is atomically debited before job insertion.
- Stop/reap refunds unused prepaid time.
- Burst launch failure refunds exactly once.
- Extend duration atomically debits the additional quote.

Provider selection:

- Explicit provider selection can target native or burst providers.
- Auto-pick currently excludes burst/on-demand providers, so default launches do
  not silently spend external cloud money.
- GPU type resolution can see both native NVIDIA providers and burst synthetic
  rows. Apple Silicon is excluded from pod launch resolution even if visible in
  discovery.

Burst/on-demand:

- Burst providers are synthetic external-cloud rows.
- Burst launch/teardown goes through `/root/dcp-burst/burst.py` on production.
- Vendor identity is intended to stay hidden from renters.

## Renter and Wallet Path

Primary file:

- `backend/src/routes/renters.js`

Important current behavior:

- `POST /api/renters/agent-register` mints a real API key and gives 20 SAR
  starter credit through `trial_grant_halala = 2000`.
- `GET /api/renters/available-providers` returns native provider rows plus
  burst/on-demand rows, then maps them through a renter-safe view.
- The response contains GPU model, VRAM, availability, and SAR/hour pricing, but
  should not expose cloud vendor identity.
- `GET /api/renters/balance` returns halala and SAR representations of balance,
  held balance, available balance, and total spent.

Frontend wallet:

- `app/(site)/renter/wallet/page.tsx`
- Current language is wallet/SAR-heavy. Tareq wants renter-facing balance to read
  as "Credit", with SAR equivalents only where withdrawal/accounting needs them.

## Inference Billing Path

Primary files:

- `backend/src/routes/v1.js`
- `backend/src/services/billingService.js`
- `backend/src/services/creditService.js`

Current behavior:

- `/v1` uses OpenAI-compatible request shapes.
- Billing settlement debits renter credit and credits providers around token
  usage events.
- Subscription credits and PAYG balance are already part of the inference path.

## Burst Pricing

Primary file:

- `backend/src/services/burstPricingService.js`

Current transform:

- External USD/hour price -> SAR/hour at 3.75 FX -> cost-plus markup -> halala
  per GPU-second.
- The service exposes helpers for SAR/hour display and internal halala-second
  rates.

## Data Store Notes

Primary database:

- SQLite in production.

Important production columns observed:

- `providers.is_burst`
- `providers.burst_gpu_type_id`
- `providers.stock_available`
- `renters.trial_grant_halala`
- `renters.max_active_pods`

Important warning:

- The local `backend/data/providers.db` was stale during audit and did not include
  several production columns used by current code. Do not use that local DB as the
  migration source of truth for pricing, burst, or trial work.

Migration hygiene risk:

- The repo has burst-grid migration content that assumes burst columns already
  exist. The schema-alter migration that introduced those columns was not obvious
  in the repo scan. Before adding new supply-tier or credit split columns, audit
  migrations against production schema and backfill history.

## Live Production Facts Observed

Provider pool during audit:

- Total providers: low 20s.
- Burst/on-demand rows: 11.
- Native rows: 11.
- Online rows: 13.
- Approved rows: 15.

Available pod list observed from production included:

- Native RTX 3090 around 2.5 SAR/hour.
- Apple M2 around 9 SAR/hour, visible in discovery but not launchable through the
  current pod GPU resolver.
- Burst/on-demand GPUs including B200, H200, H100, A100, L40S, RTX 5090,
  RTX 4090, RTX PRO 6000, RTX PRO 4500, and H100 NVL.

Future LoRA/GEO pages observed missing:

- `/models/allam`
- `/lora-fine-tuning`

## Highest-Risk Areas

- Money movement and prepaid refunds in `backend/src/routes/pods.js`.
- Provider selection and burst/on-demand visibility boundaries.
- Trial credit vs paid credit separation.
- Database migrations that must match production SQLite reality.
- Frontend wallet language and pod gating must not leak cloud-vendor internals.
- Template image changes must be tested on provider GPU hosts, not only laptop/VPS.

## Recommended Operating Rule

Any change touching pod launch, pricing, trial credit, on-demand access, provider
selection, or wallet display should ship as a narrow PR with:

- A schema/migration note if data shape changes.
- Backend unit/static tests for policy gates.
- At least one live-safe smoke command against staging or production read-only
  endpoints.
- A rollback note for money or launch behavior.
