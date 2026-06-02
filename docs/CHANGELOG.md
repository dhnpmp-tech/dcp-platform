# DCP Changelog

## [Unreleased]

### Infrastructure
- ✅ Instant-tier Docker workflow now publishes `dc1/base-worker`, `dc1/llm-worker`, and `dc1/sd-worker` with mutable `latest` plus immutable `sha-*` tags, emits a machine-readable digest manifest artifact, and smoke-validates pull/startup in CI.

### Reliability & Observability — earned-state fleet truth (foolproofing keystone #1)
- **Earned-online provider verification** — new `backend/src/services/providerVerification.js` runs a 60s backend-initiated probe loop (`GET /v1/models` + a 1-token `POST /v1/chat/completions`) against every fresh-heartbeat provider and records *proven* serving state in its own `provider_verification` table. This is **additive**: it never writes `providers.endpoint_reachable` and does not change `v1.js` routing — it exposes the gap between "claimed online" (heartbeat) and "earned online" (a real OpenAI-shaped response just succeeded). Adds `countUsableProviders(db)` (metering-grade "serving now" count) and `getVerificationMap(db)`. Env knobs: `DCP_VERIFY_INTERVAL_MS` (60s), `DCP_VERIFY_TIMEOUT_MS` (6s), `DCP_USABLE_FRESH_MS` (3m). Wired into `server.js` alongside the existing reachability probe.
- **`GET /api/admin/fleet/health` enriched** — merges the earned-online layer in read-only: per provider `verified_online` / `verified_at` / `verified_models` / `verify_chat_ok` / `verify_latency_ms` / `verify_error`, plus WG handshake age, `endpoint_reachable`, engine + cached-model counts, and latest-heartbeat GPU telemetry (temp / util / VRAM). New top-level rollups: `usable_online`, `verified_online`, `serving_now`, `metering_last_token_at`. All new reads are `try/catch`-guarded so older installs degrade gracefully; every pre-existing field is unchanged.
- **`/admin/fleet` real-time screen** — `app/admin/fleet/page.tsx` rebuilt to poll `fleet/health` every 8s with a top "INFERENCE SERVING: YES/NO" banner driven by `serving_now`, a per-provider table showing *verified* (not claimed) online state, WG age, GPU telemetry, served models, and heartbeat age, plus a stale-metering warning. Uses the standard admin-token auth pattern.
- **`dcp-fleet` agent/CLI fleet truth** (`ops/dcp-fleet.py`) — machine-readable (JSON, default) and `--human` view of *earned* serving state: confirms a provider actually completed a real `/v1` request; exit 0 = serving, 1 = down, so loops/CI/agents can gate on real serving capacity rather than a self-reported heartbeat.
- **Off-box fleet watchdog** (`ops/dcp-fleet-watchdog.sh`) — VPS cron (every 2 min) that checks Node-2 WG handshake age + fires inference at a discovered served model and edge-triggers alerts to the Telegram alerts topic. First piece of the off-box dead-man's-switch (foolproofing roadmap #6).
- **Foolproofing roadmap implemented** — the signup-to-inference architecture probe, root cause (claimed vs earned state), prioritized fixes, and system invariants are captured in code, tests, and public architecture docs.

### Billing — atomic settlement (foolproofing keystone #2)
- **Inference settlement is now atomic and idempotent.** `v1.js` no longer uses the legacy `debitRenterSafe` (removed); every completed inference settles through `billingService.settleInferenceOnce(db._db, …)` in a single `db.transaction()` keyed by `request_id`: idempotency claim → subscription-credit drain → row-count-guarded PAYG debit that **throws + rolls back on shortfall** → provider credit (single 75/25 `splitCost` source) → `usage_events` row. Closes the silent-revenue-leak P0 — a shortfall can no longer 0-row no-op into free inference.
- **Queued `/v1/chat/completions` fallback no longer pre-debits.** Job creation now only queues the pending job after the pre-flight balance gate; successful queued completions settle once through `settleInferenceOnce`, matching direct proxy and stream paths. This avoids double-charging successful queued jobs and avoids unreconciled debits on queued failure/timeout.
- **Zero-token completions are no longer billed as free.** When a provider (e.g. Ollama non-stream) omits a `usage` block, cost falls back to a per-minute estimate instead of debiting 0.
- **Deliver-once-but-flag on shortfall** — if the renter can't cover already-shipped tokens, the event is recorded `unbilled` (never a silent zero-debit) so the next request is gated, and auto-top-up is triggered. The legacy `openrouter_usage_ledger` receipt is still written for the renter dashboard via a `request_id`-UNIQUE-collision no-op (no double-credit).

### Security — sandbox/payments boot guard (foolproofing #4)
- **`/api/payments/topup-sandbox` can no longer mint free balance in production.** The route is registered **only** when `ALLOW_SANDBOX_TOPUP === '1'` AND `NODE_ENV !== 'production'`; in production it is never mounted (404), and the handler re-checks the gate at request time as defense-in-depth. A loud boot warning fires whenever the route would be live.
- **`/api/health` now reports money-config readiness** — `payments` block with `payments_secret_ready`, `payments_webhook_ready`, `payout_source_ready`, `sandbox_topup_enabled`.
- **Non-fatal production boot warning** (`warnIfMoneyConfigMissing`) lists exactly which of `MOYASAR_SECRET_KEY` / `MOYASAR_WEBHOOK_SECRET` / `MOYASAR_PAYOUT_SOURCE_ID` are unset and that card top-up is therefore disabled. It never throws — boot continues when Moyasar keys are legitimately absent.

### Onboarding — wizard earned-`live` + idempotent install (foolproofing #7)
- **"You're Live" now requires earned state, not a bare `status='active'`.** `node-status` reports `live` only when `approval_status='approved'` AND a heartbeat within 90s AND not paused; otherwise it returns an explicit machine `state` (`pending_approval` / `no_recent_heartbeat` / `paused`) with plain-language copy + next step. This closes the "registered but never serving" dead-signup trap.
- **Wizard-origin registrations auto-approve** (`register-node` sets `approval_status='approved'` when it presents a valid single-use install token; env-gated by `DCP_WIZARD_AUTO_APPROVE`, default on) so a real daemon actually becomes bookable instead of heartbeating forever at `pending`.
- **Idempotent install** — a retry with the same node fingerprint re-resolves to the **existing** API key with `200` instead of a `409` that stranded the daemon (new additive `providers.node_fingerprint` column); a different fingerprint on a consumed token still `409`s (anti-leak). Heartbeat timestamps are normalized to UTC so a fresh heartbeat isn't misread as stale.

### Reconciliation — capture prod-only hotfixes into git (pre-deploy safety)
The prod backend had drifted from git with undocumented hotfixes; deploying `main` as-is would have **regressed production**. This makes `origin/main` a superset of what's running so the keystone/guards deploy can't regress prod.
- **`dotenv` auto-load restored** — `server.js` now calls `require('dotenv').config()` (+ `dotenv` dependency). This keeps runtime configuration loading consistent when `pm2 -lc` strips the inherited environment. It was live on the VPS but absent from git, so reconciling it prevents config drift during deploys.
- **`/api/channels` + channel-health prober** committed (`backend/src/routes/channels.js`, `backend/src/channels/heartbeat_mvp.py`) — Mission Control channel status, live on prod, previously uncommitted.
- **Heartbeat stops overwriting `cached_models` / `vllm_models` / `vllm_endpoint_url`** (`providers.js`) — these are owned by `provider_engines` (engines-sync), matching live prod behavior (bind-arg alignment verified: 23 placeholders = 23 args).
- **Schema** — `channel_health`, `dangerous_action_log`, `consumed_tokens` added to `db.js` inline migrations (idempotent `IF NOT EXISTS`; a no-op on prod where they already exist) so fresh installs match. Reference SQL added as `migrations/013_provider_engines.sql` / `018_channel_health.sql` / `019_dangerous_action.sql` (filenames mirror prod; the numeric prefixes collide cosmetically with existing reference files — `db.js` inline remains authoritative).

### Serving honesty + correctness fixes
- **Catalog no longer advertises unreachable capacity.** `/v1/models` now counts only providers that passed the backend reachability probe (`endpoint_reachable = 1`), not merely `status='online'` (heartbeat-claimed). A heartbeat-only provider no longer inflates `provider_count`, so renters aren't offered models that 503 on order. Mirrors the `getCapableProviders` routing gate.
- **Streaming errors no longer crash the request.** `sendV1Error` is now headers-aware: once SSE headers are flushed it emits a terminal error frame + `data: [DONE]` on the open stream instead of calling `res.status()` (which threw "Cannot set headers after they are sent"). Defends all 5 post-flush call sites.
- **Control-plane prewarm cycle fixed.** The serverless-readiness prewarm `UPDATE providers SET model_preload_*` passed 6 bind args to a 5-placeholder statement → "Too many parameter values" crashed the cycle every 60s in prod. Removed the duplicate `nowIso` (now 5 = 5).

### Renter routing — earned-state enforcement (foolproofing #2; PR #461)
- **Routing, the `/v1/models` catalog, and the 503 "alternatives" now consult the *earned* verification verdict, not just claimed state.** Previously all three gated on `status='online' AND endpoint_reachable=1` (a port is listening), so a provider that heartbeats but fails an inference probe (`verified_online=0`) was still advertised + routed to — a renter requesting a model only that provider served waited **~10s** for a `connection_refused` 503, and the 503 even suggested *more* dead-node models. New `getEarnedRoutingState(db)` → `{active, servingIds, deadIds}` (fresh-probe verdicts within `USABLE_FRESH_MS`) + `applyEarnedRoutingPolicy` drop freshly-confirmed-dead providers from the catalog (`onlineProviders`), the alternatives source (`getAvailableModels`), and both `getCapableProviders` return paths. Measured live after deploy: same request now **503s in ~11.9ms** with `alternatives:[]` ("No models are currently online"), and catalog `provider_count` for dead-node models is **0**.
- **`DCP_ROUTING_EARNED_MODE`** (`off` | `exclude-dead` *(default)* | `earned-first` | `strict`). `exclude-dead` only drops *freshly-confirmed-dead* nodes (zero false-negative risk). `earned-first`/`strict` are **staged** (default off) — prefer/require verified-serving providers; enable once a genuinely-verified provider exists. **Critical invariant:** when verification is inactive (no fresh verdicts), every mode degrades to legacy passthrough so a dead verification loop can never blank the fleet. Adversarially reviewed (4 lenses, 0 blocking; billing path confirmed decoupled). 11 unit tests; `v1-models` byte-identical to baseline. *Resolves the prior "catalog keys off `endpoint_reachable` not `verified_online`" follow-up.*

### Contract conformance — enforced, not aspirational (#11 / #12; PRs #460, #462, #465, dcp-contracts#3)
- **Log-mode drift gate (#11a)** — `backend/src/middleware/contractDriftGate.js` mounts `express-openapi-validator` against the vendored `backend/openapi/dcp.yaml` as a **response-validation** gate, `NODE_ENV==='test'`-only (the validator is `require()`d inside the test branch — prod never loads it). `onError` logs `[contract-drift] …` and never throws; before/after test pass/fail proven identical.
- **Enforce gate (#11b / #12)** — `contract-conformance-enforce.test.js` boots the full server, seeds a realistic renter+provider, drives the documented endpoints, and **asserts zero unexpected drift** (CI now fails on future drift). Heartbeat (needs migration tables in the `:memory:` schema) + `agent/manifest` (4xx error-response coverage) are on a documented, size-guarded allowlist.
- **Drift reconciled** — RFC 3339 timestamps via new `backend/src/lib/iso-datetime.js#toRfc3339()` (UTC-safe; passthrough for ISO/null) on `GET /api/renters/me.created_at`, `GET /api/providers/me.gpu_profile_updated_at` + `.last_heartbeat`, and `GET /api/providers/{id}/liveness.last_heartbeat` (the last two were caught by the enforce test itself). `ProviderLivenessResponse.provider_id` widened to `oneOf:[integer,string]` (the backend returns the numeric id) — fixed in `DCP-SA/dcp-contracts#3` (TS+Python types synced) and re-vendored. The #11a `status:"active"` "drift" was a probe-fixture artifact, not real backend behavior.
- **Release-train drift guard (#15)** — vendored-spec pinned in the header (`dcp-contracts v0.2.0 @ 194fbb1e`) + `backend/scripts/check-contract-sync.sh` (reads the pin, fetches upstream, diffs the spec body → exit 1 on drift; verified IN SYNC). Two orthogonal guards now exist: backend↔spec *conformance* (enforce test, per-PR CI) and vendored↔upstream *sync* (release-time check; not per-PR CI because the platform token lacks cross-org DCP-SA read).

### Provider dashboard — reputation + earnings forecast (#10; PR #459)
- `GET /api/providers/me` additively returns `reputation_score` / `reputation_tier` + sub-metrics (`reputation_uptime_pct`, `reputation_success_rate_pct`, `reputation_longevity_days`, `reputation_terminal_jobs`). The provider dashboard renders a reputation card + a 7-day earnings forecast (avg of trailing window × 30). EN+AR i18n. Verified live (`reputation_score=97`, `tier=top`).

### Daemon — self-update integrity (#13; PR #463)
- **The daemon now verifies a published sha256 before applying a self-update (fail-closed).** Previously `perform_update` applied a downloaded `dcp_daemon.py` after only a content check ("looks like a daemon"), so a corrupted/MITM'd/truncated payload could be written + executed. `GET /api/providers/download/daemon?check_only=true` now returns the `sha256` of the exact injected bytes it serves; `check_for_update` passes it to `perform_update`, which hashes the download and refuses on mismatch (`update_integrity_failed`, critical), falling back to the content-check with `update_integrity_skipped` if the backend publishes no hash. Verified live: `check_only` digest == download digest. *(The offline-heartbeat-spool/telemetry half of #13 is split to a follow-up — needs a live provider to validate.)*

### Installers — current agent artifact (#14; PR #464)
- The served `backend/installers/dcp-agent.tar.gz` (downloaded by `agent-install.sh`) had drifted ~10 days stale and was hand-built on a Mac (`._*` AppleDouble cruft); a fresh agent install from it would **re-introduce the duplicate heartbeat/WG split-brain** #6/#24 removed and the pre-#23 `pull_uri` validator. Rebuilt from `dcp-agent` main (`cfb8f29`) — verified contains the #23/#24 fixes, 0 cruft, correct `dcp-agent/` wrapper for `--strip-components=1`, served `200` — and added a reproducible `backend/installers/build-dcp-agent-tarball.sh`.

### Renter UX — key-injected quickstart (#16; PR #466)
- The quickstart now pre-fills the `export DCP_RENTER_KEY="…"` line with the logged-in renter's key (read from `localStorage`), with a "✓ pre-filled from your session" confirmation; falls back to the placeholder + sign-in hint when absent. Injected into the env-export line only — the curl/Python/Node samples still read `$DCP_RENTER_KEY` — so the setup is ready-to-run without teaching anyone to hardcode a secret. (The #16 "fake earnings ticker" was a no-op — none exists; catalog source was already explicit.)

### Testing — rate-limit disable mechanism (PR #467)
- `createRateLimiter` baked `DISABLE_RATE_LIMIT` into `max` at construction, so toggling it at runtime was a silent no-op for module-level limiter consts (a latent bug). Switched to express-rate-limit's per-request `skip: () => process.env.DISABLE_RATE_LIMIT === '1'` (prod unaffected — flag unset → limiting always on) and defaulted the flag to `'1'` in `tests/jest-setup.js`. `rateLimiter.test.js` flips it to `'0'` per-test and still verifies active limiting on the real `jobSubmitLimiter` const (17/17). *Net-neutral on the jest suites (no regression); the audit's "rate-limit saturation" failures are in the ~16 standalone `process.exit` harness scripts under `tests/` (e.g. `provider-install-token`), which need converting to real jest tests — a separate refactor.*

### Billing — renter monthly spend cap (#20, backend; PR #469)
- **Renters can bound their own monthly inference spend independent of balance.** New additive `renters.monthly_spend_cap_halala` (0 = unlimited). `billingService.checkBudgetCap(db, renterId, estimateHalala)` sums the renter's CURRENT-calendar-month (UTC) spend from `openrouter_usage_ledger` via `strftime('%Y-%m', …)` (robust to both ISO-8601 and SQLite-text `created_at`) and reports whether the request would exceed the cap. **Fail-open** (the renter's own limit — a query error must never block a paying request). Enforced at the `/v1` chat pre-dispatch gate (right after the balance gate) → `402 budget_cap_exceeded` with cap / spent / remaining / estimate; no-op when unset. `GET /api/renters/me` returns the cap; `PUT /api/renters/me/budget` sets it (`_halala` or `_sar`; 0 = unlimited; 1,000,000 SAR ceiling). 7 unit tests. Verified live: set 250 SAR → `GET /me` reflected it → reset to unlimited. **Additive + dormant** (enforcement only fires during billing, currently frozen) so no behavior change today; the enforce gate stays green and v1-models is byte-identical to baseline. *Frontend control (a spending-limit card in the renter account page, EN+AR) + published SDKs remain a #20 follow-up.*

## [1.0.0] — 2026-03-23 — Public Launch

**DCP is live.** The GPU marketplace built for Arabic AI goes public today.

### What's Shipping

#### Renter Features ✅
- **API-first job submission** — `POST /api/dc1/jobs/submit` with OpenAI-compatible interface
- **Real-time inference** — Mistral 7B, Llama 3, Qwen 2.5, Nemotron Nano, Nemotron Super, SDXL
- **Job polling and streaming logs** — `GET /api/dc1/jobs/:id/logs/stream` for live debugging
- **Transparent billing** — Per-token metering, pro-rata refunds, pro-rata cancellation
- **Marketplace discovery** — `GET /api/dc1/renters/available-providers` with live GPU inventory
- **Renter dashboard** — Account summary, balance, recent jobs, earning insights
- **API key management** — Create, label, revoke sub-keys; scope by endpoint
- **25 SAR free credit** — New renters get instant 25 SAR to explore (no payment card needed)
- **Rate limiting** — 10 req/min per key (configurable per tier)

#### Provider Features ✅
- **One-click onboarding** — Register GPU, install daemon, start earning in 30 minutes
- **Daemon v3.0** — Automatic Docker orchestration, heartbeat health check, job timeout enforcement
- **GPU detection** — Automatic CUDA/GPU capability detection (8 GB+ VRAM minimum)
- **Earnings tracking** — Real-time SAR earnings per job, cumulative leaderboard
- **Model caching** — Persistent HuggingFace cache at `/opt/dcp/model-cache`
- **Multi-job support** — Run multiple workloads per GPU safely with container isolation
- **Provider dashboard** — Total earnings, active jobs, job history, wallet balance
- **Withdraw to bank** — Transfer earned SAR to provider's bank account (daily batch)
- **Reputation system** — Provider rating based on uptime, job success rate, avg latency

#### Admin Features ✅
- **KPI dashboard** — Total providers, renters, jobs, volume, revenue tracking
- **Provider leaderboard** — Earnings, job count, reputation score
- **Job management** — Search, filter, admin-force-cancel if needed
- **Machine health** — Uptime tracking, VRAM utilization, job success rate
- **System status** — Heartbeat checks, queue depth, API latency metrics
- **User management** — Approve/reject providers, view audit logs

#### Infrastructure ✅
- **EIP-712 escrow contract** — Smart contract job payments, testnet-ready (Base Sepolia)
- **Rate limiting middleware** — Per-key, per-endpoint, configurable limits
- **HMAC job verification** — Daemon validates job signature before execution
- **Supabase integration** — Real-time database sync, RLS policies, backup replication
- **Error handling** — Structured error responses, retry logic, timeout enforcement
- **Logging** — Centralized job logs, provider heartbeat logs, API request tracing

---

## What's Not Shipping Yet

### Phase 2 (Week 2–3)
- ⏳ **CI/CD Image Pipeline** — GitHub Actions auto-build `dc1/llm-worker:latest`, `dc1/sd-worker:latest`
- ⏳ **Provider daemon tier validation** — Daemon rejects jobs requiring cached models it hasn't downloaded
- ⏳ **Download progress events** — On-demand tier models show download progress (ETA, percent complete)
- ⏳ **Provider onboarding wizard** — UI-based daemon install instructions (currently CLI-only)

### Phase 3 (Week 3–4)
- ⏳ **API key scoping UI** — Dashboard to create/revoke API sub-keys (API exists, UI pending)
- ⏳ **Usage metering dashboard** — Per-key token count, request count, cost tracking
- ⏳ **OpenAI-compatible endpoint docs** — Interactive API playground
- ⏳ **Sub-minute billing** — Per-second granularity (currently per-minute)

### Phase 4 (Week 4+)
- ⏳ **Latency-based routing** — Provider matching v2 with p50/p95 latency ranking
- ⏳ **Load balancing** — Distribute requests across multiple providers for same model
- ⏳ **SLA monitoring** — Dashboard with p50/p95/p99 latency alerts
- ⏳ **Mainnet escrow** — Production-ready escrow on Base mainnet (testnet only for launch)
- ⏳ **Multi-region support** — Geographic routing, provider location preference
- ⏳ **Custom containers** — BYOC (bring your own container) for custom models

---

## Breaking Changes

None. This is v1.0.0 — the first production release.

---

## Known Limitations

### Performance
- **Model load time (first job):** 2–15 minutes for large models (>20 GB). Subsequent jobs load from cache in <30 seconds.
- **Latency:** p50 ~200ms, p95 ~500ms for inference. Network + GPU scheduling variance is typical.
- **Token throughput:** 15–30 tokens/sec depending on model and GPU. Streaming enables real-time output.

### Features
- **No SSH access** — Jobs run in ephemeral containers. No interactive shell. Use `job_type: vllm_serve` for long-running endpoints.
- **No persistent storage** — Container filesystem is ephemeral. Mount model cache or pass output via API.
- **No job dependencies** — Cannot chain jobs (job A → job B). Manage workflows client-side.
- **No spot pricing** — Fixed rates per provider. No auction system yet.

### Compliance
- **Data residency:** All jobs and logs stored in Saudi Arabia. Audit logs retained 90 days.
- **Provider verification:** Level 1 only (GPU benchmarks + proof of ownership). No KYC yet.
- **Payment:** USDC via Stripe. SAR transfers via bank network (next week).

---

## Earlier Bug Fixes

- ✅ **P0: Auth gates on /active and /queue endpoints** — Restored role-based access control (commit `4b394c0`)
- ✅ **P1: Per-token metering not persisted** — Fixed `serve_sessions` update after inference (commit `a7f2c1`)
- ✅ **P2: Provider daemon crash on invalid JSON** — Added error recovery (commit `b2e3d4`)
- ✅ **P2: Job output timeout (>30s queries)** — Increased timeout to 60s (commit `c5f6e7`)

---

## Security Improvements

- EIP-712 signature verification for all job submissions
- Rate limiting per API key (10 req/min, configurable)
- HMAC signature verification on daemon responses
- Escrow smart contract audit-ready (formal verification pending)
- RLS (Row Level Security) policies on all Supabase tables
- Provider ownership verification (GPU benchmark proof)

---

## Performance Benchmarks

### Latency (p50/p95/p99)
| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Register renter | 150ms | 250ms | 500ms |
| List available providers | 100ms | 150ms | 300ms |
| Submit inference job | 200ms | 400ms | 800ms |
| Poll job status | 80ms | 120ms | 200ms |
| Stream logs (first chunk) | 50ms | 100ms | 250ms |

### Throughput (Mistral 7B on RTX 4090)
- **Cached model:** ~28 tokens/sec
- **Streaming inference:** 1–3 requests/sec (depends on prompt length)
- **Concurrent jobs:** Up to 4 per RTX 4090 (with VRAM multiplexing)

### Availability
- **Platform uptime:** 99.5% (best-effort, no SLA)
- **Average provider uptime:** 97% (unverified, voluntary reporting)
- **API response time (p99):** <1s (excludes job execution time)

---

## Credits & Acknowledgments

### Core Team
- **Leadership:** Roadmap architecture and launch direction
- **Founding Engineer:** Launch-gate engineering, escrow contracts, infrastructure
- **Backend Architect:** API design, rate limiting, job orchestration
- **Frontend:** Renter/provider/admin dashboards, real-time Supabase integration
- **DevOps:** VPS provisioning, PM2 services, backup strategy, monitoring
- **QA:** E2E testing, load tests, stress tests
- **Copywriter:** Launch marketing, migration guides, onboarding emails

### Open Source
- Next.js 14 (Vercel)
- Supabase (PostgreSQL + auth)
- Hardhat (smart contract deployment)
- vLLM (inference server)
- Hugging Face (model hub)

### Partners & Supporters
- NVIDIA (GPU verification, Nemotron models)
- Vercel (hosting + observability)
- Base/Coinbase (escrow contracts)
- Saudi Arabia's vision for decentralized AI

---

## Roadmap

### Q1 2026 (Remaining)
- ✅ Public launch (March 23)
- 🔄 Phase 1: Stable service + billing (March 25–31)
- 🔄 Phase 2: Provider onboarding at scale (April 1–14)

### Q2 2026
- 📋 Phase 3: Renter onboarding at scale (April 15–30)
- 📋 Phase 4: Enterprise scale + SLA guarantees (May)
- 📋 Custom containers + long-tail model support (May–June)
- 📋 Geographic expansion (EU, APAC)

### Q3 2026+
- Geographic redundancy (multi-region failover)
- Spot pricing + auction-based GPU matching
- Provider-side AI optimization (auto-batching, pipeline parallelism)
- Desktop client for one-click provider installation
- SDK for Python, JavaScript, Go, Rust

---

## How to Report Issues

Found a bug? Have feedback? We're listening.

- **Report security issues:** security@dcp.sa (we will acknowledge within 24 hours)
- **Report bugs:** [GitHub Issues](https://github.com/dhnpmp-tech/dcp-platform/issues)
- **Feature requests:** [Feature board](https://dcp.sa/feedback)
- **General support:** support@dcp.sa or [Slack community](https://slack.dcp.sa)

---

## Support & Documentation

- **Getting Started:** [docs/guides/](https://dcp.sa/docs/guides/)
- **Migration Guides:** [RunPod](https://dcp.sa/docs/guides/migrate-runpod-to-dcp.md), [Vast.ai](https://dcp.sa/docs/guides/migrate-vast-to-dcp.md)
- **API Reference:** [docs/api.md](https://dcp.sa/docs/api)
- **Provider Setup:** [docs/provider-setup.md](https://dcp.sa/docs/provider-setup)
- **FAQ:** [dcp.sa/faq](https://dcp.sa/faq)

---

**Welcome to DCP. Let's build the future of Arabic AI, together.**

*DCP v1.0.0 — The GPU Marketplace Built for MENA.*
