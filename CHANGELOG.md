# Changelog

This is the canonical public changelog for the `dhnpmp-tech/dcp-platform`
repository.

Format:
- newest entries first
- timestamps are UTC merge times
- every entry links to the GitHub PR
- each entry lists what was included, not just a feature headline

Internal handoffs, private operations notes, generated reports, and launch
checklists do not belong in this public changelog.

## [Unreleased]

### 2026-06-30 06:40 UTC — `feat(pricing): reconcile pricing sources — port cost-plus logic into tested backend service, kill the mis-named gpu_pricing price path (ROADMAP 1.4/1.5)`

The cost-plus repricing that sets the REAL billed price (`providers.cost_per_gpu_second_halala`) for burst GPUs lived **only in an untracked, unaudited VPS cron script** (`/root/dcp-burst/stock-refresh.py`), and the public `GET /api/renters/pricing` endpoint read a *different* legacy table (`gpu_pricing.rate_halala`) whose column actually stored USD × 100,000 (a mis-named pre-launch artifact) — 2–5× below the real billed rate. Two wrong sources, one right source, zero in-repo audit. This lands the canonical formula in the repo and points the public price list at the real number.

**Included:**

- **New tested service** `backend/src/services/burstPricingService.js` — pure, I/O-free port of the stock-refresh.py cost-plus formula: `computeCostPerGpuSecondHalala(usdPerHour, opts)` returns `usd/hr ÷ 3600 × 3.75 (USD→SAR) × 100 (SAR→halala) × 1.40 (+40% margin)`. Constants (`USD_TO_SAR`, `SAR_TO_HALALA`, `MARKUP`) are exported so the VPS script and any future in-backend refresh cron import the exact same values instead of re-declaring and drifting. Returns the **raw float**, not a rounded integer — byte-identical to stock-refresh.py, because per-GPU-second halala is fractional (e.g. $2.49/hr upstream → 0.363 halala/sec) and rounding per-second would zero any sub-$3.50/hr GPU; settlement rounds once at the final charge. Null contract preserved: `null/undefined/0/negative/NaN/string/Infinity → null` (matches the script's "no live price → leave existing price UNCHANGED, never zero it" rule). Also exports `halalaPerSecondToSarPerHour(h)` (×36) for the displayed SAR/hr. **INVISIBILITY-safe**: never names the upstream broker or the markup % — the module is a pure numeric transform.
- **New jest test** `backend/src/__tests__/burstPricingService.test.js` — asserts byte-for-byte parity with the stock-refresh.py raw float for a realistic H100 secure price ($2.49/hr → 0.363125 halala/sec → 13.07 SAR/hr round-trip), the 40% markup ratio, the null-never-zeroes contract, option overrides (custom markup/FX), and the halala→SAR/hr ×36 conversion. 6/6 assertion groups verified standalone (no `node_modules` locally — same harness constraint as prior tasks).
- **Reconciled** `GET /api/renters/pricing` (`backend/src/routes/renters.js`) — now derives the per-model price from `providers.cost_per_gpu_second_halala` (cheapest across providers of each model, `GROUP BY gpu_model, MIN(h)`), the **same canonical billed source** `GET /available-providers` already uses, instead of the legacy `gpu_pricing.rate_halala` (USD × 100,000) lie. Response now returns real `rate_halala_per_hour` (integer halala/hr), `rate_sar_per_hour` (the SAR/hr shown to renters), and `rate_usd_per_hour` (SAR ÷ 3.75, display only). The public price list and the launch quote/bill now agree. Verified against three reference GPUs: RTX 4090 $0.34/hr → 1.78 SAR/hr, A100 $1.20/hr → 6.30 SAR/hr, H100 $2.49/hr → 13.07 SAR/hr (all = upstream USD × 3.75 × 1.40, as expected).
- **Deferred (tracked follow-up, NOT shipped here):** `pricingService.estimateCost` / `getRate` still uses `GPU_RATE_TABLE` USD *floor* prices and still returns `competitor_prices` / `savings_pct` (vs Vast.ai) — called from 5 sites (models, templates, jobs, arabic-rag, v1-wizard) and used as a pre-launch *estimate*, not settlement (settlement bills against the real `cost_per_gpu_second_halala`, which is correct). Fully re-architecting it across all 5 call sites without a running test suite is out of scope for this no-questions sprint; `GPU_RATE_TABLE`/`competitor_prices` are low-pri dead data to strip (Peter 2026-06-24: DCP does not compete on price). Left as a documented ROADMAP 1.5 item. `gpu_pricing` table left in place (read-only, now unused) pending a separate drop migration.
- **No prod deploy** — `security/staged-rollouts` is still prod's branch; this lands on `main` only and ships to prod via a deliberate smoke-tested release.

**State changes:** `gpu_pricing` → read-only/deprecated (no code path reads it anymore); `GET /api/renters/pricing` source-of-truth flipped from `gpu_pricing.rate_halala` (USD×100000) → `providers.cost_per_gpu_second_halala` (real halala/sec). `DC1_REQUIRE_HEARTBEAT_HMAC` untouched (still `0`; C3 rollout).

---

### 2026-06-30 06:33 UTC — `feat(analytics): revenue funnel stages — topup_initiated / pod_launched / first_inference + client view beacon (ROADMAP 1.1-1.3)`

Closes the gap between the baseline funnel (`view → register → first_action → first_success`) and the actual revenue path. **Bug fix included:** `conversionFunnelService.VALID_STAGES` only listed the four baseline stages, so the `payment_success`, `agent_self_serve`, and `pending_email_verification` `trackStage` call sites that landed in the staged→main merge (commit `0135afd`) were being **silently rejected** (`{inserted:false, error:'invalid_stage'}`) — they now record.

- **`backend/src/services/conversionFunnelService.js`:** `VALID_STAGES` expanded to `view, register, first_action, first_success, topup_initiated, payment_success, pod_launched, first_inference, agent_self_serve, pending_email_verification`. The service dedupes per `(journey, stage, actor)` via `dedupe_key`, so each `first_*` / `*_launched` / `*_initiated` / `payment_success` stage records **once per renter/provider** even though the call sites fire on every relevant transaction.
- **`topup_initiated`** — `routes/payments.js` `POST /api/payments/topup`: fires once before the bank-transfer/Moyasar branch so both paths are covered. Metadata: `{amount_halala, payment_method}`.
- **`pod_launched`** — `routes/pods.js` launch endpoint: fires at the `201 starting` response (renter committed to a launch). Native and burst pods both covered; the async `pulling→running` transition has no renter req context and stays on the existing job-status analytics. Metadata: `{job_id, provider_id, duration_minutes, is_burst, quoted_cost_halala}`. Added `conversionFunnel` require to `pods.js`.
- **`first_inference`** — `routes/v1.js`: fires after `billingService.settleInferenceOnce` returns `status:'settled'` (the moment the money loop closed for a new renter). Guarded by `result?.status === 'settled'` so idempotent replays and unbilled settlements don't fire. Metadata: `{model_id, cost_halala, prompt_tokens, completion_tokens}`. Added `conversionFunnel` require to `v1.js`.
- **Client-side view beacon (ROADMAP 1.3):** new public `POST /api/funnel/view` endpoint (`routes/funnel.js`, mounted at `/api/funnel` in `server.js`) — records a `view` stage from the client. Anonymous visitors (no renter key) → `actor_type='anonymous'` with a client-generated `anonymous_id`; logged-in renters (`x-renter-key` header) → `actor_type='renter'` deduped to first view. Rate-limited (30/min/IP). Returns `204` so `sendBeacon` can fire on page unload.
  - **`app/lib/funnel.ts`:** `trackView(surface)` + `surfaceForPathname()` — `sendBeacon` with `fetch` fallback, persists `anonymous_id` in `localStorage` (1y TTL, `crypto.randomUUID`).
  - **`app/(site)/components/FunnelViewBeacon.tsx`:** mounted once in `app/(site)/layout.tsx`; fires on mount + pathname change **only for marketing surfaces** (`/`, `/marketplace`, `/containers`, `/pricing`, `/docs`, register pages) — internal routes (renter/provider consoles, `/admin`, `/api`, `/v1`) are skipped so app-internal traffic doesn't pollute the funnel.
- **Verification:** `node --check` on all 5 backend files + the funnel router pass; TS files syntax-reviewed (`node_modules` not installed locally, same constraint as C1/H7). The 3 previously-rejected stages now validate; existing baseline stages unchanged.
- **State change:** revenue funnel now records topup → payment → pod launch → first inference end-to-end; marketing-page views are independently beaconed (not just inferred from `register`). No prod impact (prod runs `security/staged-rollouts`); lands when main next smoke-deploys.

### 2026-06-30 06:25 UTC — `feat(security): H7 — heartbeat HMAC enforcement gate on /heartbeat + /wg/register + daemon-side signing (C3 prep)`

Nexus/Tito audit item H7 — heartbeat / WireGuard-register requests were authenticated only by the provider API key. A leaked/observed key could spoof provider liveness (`POST /api/providers/heartbeat`) or register rogue WireGuard peers (`POST /api/providers/wg/register`). `verifyHeartbeatHmac` + `DC1_HMAC_SECRET` existed but were warn-only, and `/wg/register` had an open `// TODO: enforce once DC1_HMAC_SECRET is set to a real value`.

- **`DC1_HMAC_SECRET` is already set on prod** (verified in the prior session via the VPS env) and is in `REQUIRED_SECRETS` in `server.js`. **`DC1_REQUIRE_HEARTBEAT_HMAC` stays `'0'` / unset on prod** — flipping it to `'1'` now would 401 every heartbeat because the shell-based daemons don't sign yet, severing the provider mesh. It is gated behind the **C3 per-provider `task_spec` signing rollout**.
- **Refactor for testability:** lifted `verifyHeartbeatHmac` + the gate logic out of `routes/providers.js` into **`backend/src/middleware/heartbeatHmac.js`** exporting `verifyHeartbeatHmac` + a single `enforceHeartbeatHmac(req,res,next)` route middleware (mirrors the `middleware/queryKeyReject.js` extraction from C1). `providers.js` now `require('../middleware/heartbeatHmac')` and mounts `enforceHeartbeatHmac` as route middleware on **both** `POST /api/providers/heartbeat` and `POST /api/providers/wg/register` — the inline gate blocks were removed, the warn-only `// TODO` on `/wg/register` is closed.
- **Gate contract:** `DC1_REQUIRE_HEARTBEAT_HMAC !== '1'` → warn + pass through (backward-compatible). `'1'` → 401 unsigned / bad-signature with an `X-DC1-Signature: sha256=<hex>` hint. Constant-time compare via `crypto.timingSafeEqual`.
- **`server.js`:** added the matching `express.raw` + `req.rawBody` capture for `/api/providers/wg/register` (heartbeat already had one) — without it `verifyHeartbeatHmac` would return `Raw body unavailable` and enforcement would 401 even valid signatures on `/wg/register` once the flag flips.
- **Daemon-side signing (C3 prep):**
  - **`sdk/python/dc1_provider/_http.py`** — when `DC1_HMAC_SECRET` is in the daemon's env, every request now carries `X-DC1-Signature: sha256=HMAC-SHA256(rawBody, secret)` (signs the exact on-wire bytes; empty body → `b""` so GETs/bodyless POSTs are covered). Safe: backend ignores the signature while the flag is off; primes telemetry so daemons show as "signing" the moment the flag flips.
  - **`backend/installers/dcp_daemon.py::http_post`** — the production Python daemon's transport now signs too. Pre-serializes the body **once** and sends `data=<bytes>` with `Content-Type: application/json` on both the `requests` and `urllib` paths, guaranteeing the signature covers the exact wire bytes (previously `requests` re-serialized via `json=`, which could diverge from the signed bytes).
- **Test:** **`backend/src/__tests__/heartbeatHmac.test.js`** — `verifyHeartbeatHmac` (valid / missing-header / wrong-secret / malformed / unset-secret) + `enforceHeartbeatHmac` route middleware (warn-only pass-through with flag off; 401 with flag on; valid-sig pass; `/wg/register` rejects unsigned under same gate). Verified logic standalone (12/12 pass); jest file syntax-checked (`node_modules` not installed locally, same constraint as C1).
- **Residual / C3 rollout (documented, out of scope here):** the **shell-based `daemon.sh` / `heartbeat.sh`** (curl) senders do NOT sign — they remain warn-only and will need a signing shim (or migration to the Python daemon) before `DC1_REQUIRE_HEARTBEAT_HMAC` can be flipped to `'1'`. The flag flip itself must be a deliberate smoke-tested prod release, not an auto-deploy.
- **State change:** `/wg/register` warn-only `TODO` → real (but dormant) enforcement gate; both daemon transports now emit signatures; prod behavior unchanged (flag off). No prod impact; lands when main next smoke-deploys.

### 2026-06-30 06:18 UTC — `feat(security): C1 phase-2 — reject query-param API keys on /api/renters/me/*`

Nexus/Tito audit item C1 — `?key=` / `?renter_key=` / `?provider_key=` / `?api_key=` leak credentials into browser history, server access logs, referrer headers, and proxy logs. Phase 1 (Deprecation/Sunset/Link headers + telemetry) shipped earlier; this is **phase 2: enforcement**.

- **Backend (`server.js`):** uncommented `app.use('/api/renters/me', rejectRenterQueryParamKey)` — `?key=` / `?renter_key=` on `/api/renters/me/*` now return **400** with a `Set the "X-Renter-Key" header` hint. The `/api/renters/analytics` + `/api/renters/export` mounts are left commented (those exact routes don't exist — verified `grep` of `routes/renters.js`; placeholders only).
- **Refactor for testability:** extracted `detectQueryParamKeys` + `rejectRenterQueryParamKey` from `server.js` into **`backend/src/middleware/queryKeyReject.js`** (matches the existing `middleware/auth.js` pattern) so the contract is unit-testable without booting the whole app. `server.js` requires them.
- **Test:** **`backend/src/__tests__/queryKeyReject.test.js`** — 9 cases (rejects `?key=` / `?renter_key=` on `/me` and `/me/analytics` prefix mount → 400; passes header-auth + `?provider_key=` through). Verified logic standalone (8/8 pass) since `node_modules` isn't installed locally; jest file syntax-checked.
- **Frontend migration (DCP-712):** all `/api/renters/me/*` fetch call sites moved off `?key=` → `X-Renter-Key` header. Most already sent the header (the `?key=` was redundant leftover); 3 didn't (`auth/page.tsx`, `JobSubmitForm.tsx`, `setup/page.tsx` had header; `auth` + `JobSubmitForm` now add it). Files: `renter/{usage,settings,playground,keys,pods}/page.tsx`, `auth/page.tsx`, `setup/page.tsx`, `components/jobs/JobSubmitForm.tsx`.
- **CSV export blocker solved:** `renter/usage/page.tsx`'s `<a href="?key=…&format=csv">` (browser navigation — can't set headers) converted to a `downloadUsageCsv()` blob-download (fetch with `x-renter-key` header → `URL.createObjectURL` → synthetic `<a>` click), matching the existing `renter/invoices/page.tsx` pattern.
- **Verification:** `grep "renters/me.*?key=" app/ components/` → **zero** remaining. `node --check` on `server.js` + new module pass.
- **Scope / residual blockers (documented):** (1) Tauri installer download URLs (`/api/providers/download?key=`) are baked into already-shipped `.exe`/`.dmg` binaries — intentionally NOT covered; needs a signed-URL mechanism. (2) Provider-side `?key=` call sites are NOT enforced (no `rejectProviderQueryParamKey` middleware exists) — they remain on phase-1 deprecation headers. (3) `/v1/*` query-key rejection is the separate H2 item (env-gated), untouched here.
- **State change:** `?key=` on `/api/renters/me/*` is now refused at the backend. No prod impact yet (prod runs `security/staged-rollouts`, not `main`); lands when main next smoke-deploys.

### 2026-06-30 06:05 UTC — `investigate(ops): openclaw-gateway + agents-auth health — verdict: both non-DCP, no action`

Investigation (no code change, no prod mutation):
- **openclaw-gateway-1** was unhealthy (EACCES on `/home/node/.openclaw/openclaw.json` — root-owned file, container runs as uid 1000). Fixed earlier this session with `chown 1000:1000 /root/.openclaw/openclaw.json` + restart → now `Up (healthy)`. **However Peter confirmed this container is DEPRECATED** ("it's the old nexus, we switched to Hermes") — the fix was cosmetic only; no further investment warranted. Left running (no blast-radius evidence either way; not touched further).
- **agents-auth** (compose project `agents-platform`, image `agents-auth:local`, port `127.0.0.1:8201`) is `Up (unhealthy)`: its `/health` healthcheck (`wget` → `http://127.0.0.1:8201/health`, exit -1 = timeout) hangs because the stack's `agents-postgres` container **exited (127) ~20h ago** — the Node `src/server.js` process (pid 5973) is alive but starved on its DB pool. Root cause = dead DB, not a DCP code defect.
- **Scope verdict:** the entire `agents-platform` stack lives at `/opt/agents-platform` (a separate voice/persona-agent repo — ElevenLabs, agent-templates; not DCP, not Hermes). `grep -rE "8201|agents-auth|agents-net"` across `backend/ ops/ integrations/` returns **zero** real references (one coincidental `renterId = 8201` in a test). It is an orphaned side-project stack with no DCP dependents and no alerts in 20h of downtime.
- **Action:** none taken. Stopping another project's stack is Peter's call, not a DCP-platform task. Recorded so future sessions don't re-investigate.

### 2026-06-30 05:52 UTC — [commit `0e48bf2`](https://github.com/dhnpmp-tech/dcp-platform/commit/0e48bf2) — `chore(ops): commit load-bearing ops scripts + gitignore secrets/backups`

Included:
- **Ops scripts committed to main:** `ops/e2e-smoke.sh`, `ops/morning-digest.sh`, `safe-reload.sh` — these were untracked on prod (`/root/dc1-platform`) but cron + the docker-proxy watchdog depend on them; a clean re-deploy was silently losing them. Verified no hardcoded secrets (they read `TG_TOKEN`/`TG_DEV_BOT_TOKEN` from the env file).
- **`.gitignore` hardened:** now excludes `ops/.watchdog-env` (live TG bot token + renter master key — was sitting untracked in the repo working tree), `*.bak` / `*.bak.*` / `*.bak-*` / `.hotpatch-backups/` / `*.env.bak*` (hot-patch backup clutter), and `*.prepared` (inert feature stubs).
- **Prod filesystem cleaned:** 78 hot-patch `.bak` files + the `.hotpatch-backups/` dir deleted from prod (75 code backups + 3 secret-bearing `.env.bak*`). 5 `providers.db.bak*` database snapshots **kept** (no confirmed alternate backup — conservative). Prod `git status` noise dropped from 80+ untracked files to build artifacts only.
- **State change:** prod `.gitignore` synced to the new rules; `.watchdog-env` no longer appears in `git status`. No secrets committed.

### 2026-06-30 05:46 UTC — [merge `189dae6`](https://github.com/dhnpmp-tech/dcp-platform/commit/189dae6) + [`87aa7fa`](https://github.com/dhnpmp-tech/dcp-platform/commit/87aa7fa) — `chore(reconcile): merge security/staged-rollouts into main`

Included:
- Reconciles prod's `security/staged-rollouts` branch into `main` so deploy-from-main no longer regresses production. Prod had been running 10 commits ahead of main (hand-managed on the security branch); this brings those 10 commits into main as an explicit (non-fast-forward) merge commit, then integrates PR #663 on top. Deploy-from-main is now safe — the time-bomb (main lacking the staged funnel/security/invisibility work) is defused. Production itself is unchanged by the merge (it was already running the staged content).
- **Commits brought in (oldest→newest):** `2174dda` security staged-rollout runbooks + corrected dep overrides; `0f4129f` consolidate security tracker under `docs/security/` + `/dcp-security-audit` skill; `6949d01` AI-agent + unauth-API findings fixed live; `f623ed6` correct DCP-API-01 framing (latent, not realized); `28408cc` gate `/api/standup/latest` (DCP-API-02 partial); `d11dc9b` renter sees GPU TYPE only, never the provider machine name/id; `fb9e733` burst pod lifecycle (launch/stop/extend/sweep + teardown) + `is_burst` guards; `aa24192` zero-human renter signup + 402 wallet flow; `170b747` auth/dashboard URL fixes in job + digest email templates; `0135afd` track agent-register + add `payment_success` funnel stage.
- **Conflict resolution:** `backend/src/lib/renter-job-view.js` (add/add — both branches had the vendor-scrub; took the prod-proven staged version, all 7 scrub functions present) and `backend/src/routes/pods.js` (content — staged is a strict superset of main's: adds the `POST /notify-me` back-in-stock waitlist route + burst `is_burst` guards on top of main's launch route; verified main had zero lines unique to it, took staged wholesale).
- **State change:** `main` HEAD `6965817` → `87aa7fa`. No prod deploy performed (prod already runs the equivalent staged content; shipping main's 63 ahead-commits — analytics UI, GPU selector, hero — to prod is a separate smoke-tested release).

### 2026-06-17 09:00 UTC — [PR #617](https://github.com/dhnpmp-tech/dcp-platform/pull/617) — `fix(pods): honest workspace-persistence signalling (stop silent data loss)`

Included:
- `workspace_persisted` was hardcoded `true` (launch response + `toPodView`) with a "files are saved" note even for ephemeral pods — a live renter lost a workspace trusting it. Now derived from the HMAC-signed `task_spec` (`workspace_volume` present ⇔ paid volume), with a loud ⚠️ EPHEMERAL warning + the `POST /api/volumes` upsell surfaced on launch, status, and stop. No change to the paid-persistence gating — only to what the renter is told.

### 2026-06-17 08:52 UTC — [PR #616](https://github.com/dhnpmp-tech/dcp-platform/pull/616) — `fix(pods): reaper enforces backend's CURRENT deadline, not stale launch label (extend bug)`

Included:
- An extended pod (1h → 3h) was killed at the original 1h: `reap_expired_pod_containers` enforced the immutable `dcp.deadline` docker label stamped at launch, which extend cannot change. The reaper now queries the backend first and, for a live job, enforces `started_at + current max_duration_seconds (+grace)` — extend-aware; the launch label / hard-cap are used only as a fallback when the backend is unreachable. Mirrors the in-process hold-loop's existing re-read.

### 2026-06-15 15:17 UTC — [PR #615](https://github.com/dhnpmp-tech/dcp-platform/pull/615) — `docs(node3): correct board — ProArt can't do x4x4x4x4, use ASRock Taichi`

Included:
- Corrected the Node 3 build spec: the ASUS ProArt X870E-Creator bifurcates only x16 / x8/x8 / x8/x4/x4 (NOT x4x4x4x4), so the x16→4×x4 splitter plan fails on it. Replaced with the ASRock X670E Taichi Carrara (AED 2,512, Amazon.ae) / X870E Taichi Lite for KSA (SAR 1,991); added the x4-per-card AM5 16-lane limitation and a BIOS bench-test caveat.

### 2026-06-15 15:06 UTC — [PR #614](https://github.com/dhnpmp-tech/dcp-platform/pull/614) — `docs: Node 3 (4× RTX 3090) build spec — verified UAE/KSA sourcing`

Included:
- `docs/strategy/2026-06-15-node3-build-spec.md`: cheap-path build for the 4 acceptance-passed Palit GameRock 3090s with live-verified UAE (Amazon.ae) + KSA sourcing. Option B (new AM5 board + bifurcation splitter → 4× PCIe x4, ~AED 9–9.7k) vs Option A (used HEDT X399/X299, 64 native lanes). Rules from our own Gen-1 data: x4/card is fine, no x1 USB mining risers; power-limit each card to 285 W to run all four on a single AX1600i at 240 V.

### 2026-06-12 08:16 UTC — [PR #613](https://github.com/dhnpmp-tech/dcp-platform/pull/613) — `feat(benchmark): Arabic customer-service task benchmark (harness + dataset + baseline)`

Included:
- `docs/benchmarks/arabic-customer-service/`: 10 fixed Saudi CS tasks with per-task rubrics + a runnable harness (`run.mjs`) recording quality (LLM-judge), latency, and cost per candidate; honest by design (records DCP latency/outputs even without a judge key, never fabricates scores).
- Baseline (DCP qwen2.5:7b raw, 2026-06-12): 10/10 completed, ~7.8s avg latency; already caught a real failure (cs-01 drifted into machine-translated Chinese mid-reply), validating the fine-tune thesis. No public quality claims until judged vs a frontier model.

### 2026-06-12 08:15 UTC — [PR #612](https://github.com/dhnpmp-tech/dcp-platform/pull/612) — agentic access layer: MCP server + agent discoverability *(merged under a mislabeled "rename" squash title)*

Included:
- Official Model Context Protocol server `integrations/dcp-mcp` (`index.js`, `package.json`, `README.md`) exposing 9 tools — `list_models, chat, create_pod, get_pod, extend_pod, stop_pod, rent_volume, get_volume, get_balance` — so an MCP-capable agent (Claude, Cursor, custom) can run inference, rent GPUs, and manage storage via native tool calls.
- Agent discoverability files served at dcp.sa: `public/llms.txt` + `public/.well-known/ai-plugin.json`.
- `/v2/docs`: new bilingual "Persistent volumes" and "Used by agents/software" sections documenting the volume rent flow and the MCP/discovery path.

### 2026-06-12 08:02 UTC — [PR #611](https://github.com/dhnpmp-tech/dcp-platform/pull/611) — paid-only workspace persistence gating + monthly volume billing *(merged under a mislabeled "rename" squash title)*

Included:
- Pod launch attaches the stable `dcp-ws-r<id>` workspace volume + S3 coordinates ONLY when the renter holds an active rented volume (`activeVolumeForRenter`); without one the pod is ephemeral — persistence became a paid feature/upsell.
- `billRenterVolumes` monthly billing sweep in `jobSweep.js`: volumes billed monthly in advance (first month at rent time), a 7-day suspend grace on lapse that stops serving the volume to new pods but KEEPS the data, with `current_period_end` as the lapse marker.

### 2026-06-12 04:51 UTC — [PR #610](https://github.com/dhnpmp-tech/dcp-platform/pull/610) — `docs(strategy): rename to 'Answers from the Engine Room'`

Included:
- Renamed the defensible-position doc to `docs/strategy/2026-06-12-dcp-answers-from-the-engine-room.md`.

### 2026-06-12 04:41 UTC — [PR #609](https://github.com/dhnpmp-tech/dcp-platform/pull/609) — `docs(strategy): DCP defensible position — canonical answers to third-party feedback`

Included:
- `docs/strategy/2026-06-12-dcp-defensible-position.md`: four canonical answers (infrastructure thesis incl. three tiers + Apple-Silicon supply + time-to-GPU; Groq differentiation incl. developer-as-channel + CLOUD Act; Arabic-performance honesty; layered moat incl. SMB hardware flywheel), customer-facing founding reasons, per-persona reasons, a one-paragraph position, and a claims-discipline list.

### 2026-06-11 15:05 UTC — [PR #608](https://github.com/dhnpmp-tech/dcp-platform/pull/608) — `feat(volumes): rentable persistent storage on the Node-2 MinIO store`

Included:
- Paid, exclusive, in-Kingdom persistent volumes (10/20/30 GB at $0.05/GB/mo = 18.75 halala/GB/mo): `renter_volumes` table; `POST /api/volumes/rent`, `GET /api/volumes/me`, `DELETE /api/volumes`; per-renter MinIO bucket with a hard quota provisioned over the mesh; 100 GB pool ceiling; atomic first-month debit + refund-on-provision-failure.
- Pod launch injects the renter's S3 coords into `task_spec` when they hold an active volume; daemon `_pod_ws_sync()` mc-mirrors `/workspace` ↔ the renter's bucket (restore on launch, snapshot on teardown — cross-provider persistence, best-effort, never blocks launch/teardown).
- Frontend rent-a-volume panel (tiers + SAR price, pool availability, usage, release). All storage routed through `volume-store.js` → S3, so a future managed-KSA store swap is endpoint+creds only.

### 2026-06-11 12:21 UTC — [PR #607](https://github.com/dhnpmp-tech/dcp-platform/pull/607) — `feat(pods): renter-extendable pods — +30m/+1h/+2h, no restart`

Included:
- `POST /api/pods/:id/extend`: validates wallet, debits the incremental quote at the same per-GPU-second rate, pushes `max_duration_seconds` + `cost_halala` (reuses the prepaid path; early-stop refund still works); 24h hard ceiling.
- Daemon hold-loop re-reads `max_duration_seconds` each 7s poll (backend authoritative; the launch-time docker label is only the restart fallback), so an extended pod keeps running.
- Frontend +30m/+1h/+2h buttons on the rental countdown with charge feedback; same workspace + Jupyter token, zero interruption.

### 2026-06-10 21:20 UTC — [PR #606](https://github.com/dhnpmp-tech/dcp-platform/pull/606) — `fix(pods): stale-queued sweep must not cancel a pod the daemon already started`

Included:
- A live 8-hour training pod was cancelled mid-session: it had a running container but hadn't flipped to `running` yet (slow relay / daemon restart), so the 15-min stale-queued sweep treated it as abandoned and cancelled+refunded it. The sweep now skips any pod with `jupyter_host_port`/`access_url` set (relay up ⇒ container live) and the stale window widened 15 → 25 min for slow pickup / large image pulls.

### 2026-06-10 21:09 UTC — [PR #605](https://github.com/dhnpmp-tech/dcp-platform/pull/605) — `feat(pods): persistent /workspace reattach + rental countdown/warning + faster teardown`

Included:
- Persistent workspace (first pass): backend sends a stable `dcp-ws-r<id>` volume name; the daemon mounts it (create-on-first-use) and never removes it on teardown, so `/workspace` reattaches across the renter's pods; pod responses expose `workspace_persisted`.
- v2 pods console shows a live "rental ends in MM:SS" countdown and an amber <5-min warning.
- Daemon pod hold-loop polls every 7s (was 30s) so a renter stop / deadline frees the GPU + restores inference within ~7s.

### 2026-06-10 20:49 UTC — [PR #604](https://github.com/dhnpmp-tech/dcp-platform/pull/604) — `fix(pods): GET returns ends_at/seconds_remaining; DELETE no longer 500s`

Included:
- PR #601's edit put the rental-clock fields in the wrong handler: GET (where they belong) never returned them, and DELETE referenced an out-of-scope `endsAt` → ReferenceError → 500 *after* the settlement committed (money correct, response errored). Clock fields now computed in `toPodView` (GET source of truth); removed the dead/misplaced computation + out-of-scope fields from DELETE.

### 2026-06-10 20:29 UTC — [PR #603](https://github.com/dhnpmp-tech/dcp-platform/pull/603) — `fix(payments): card top-up uses Moyasar hosted invoice (was failing validation)`

Included:
- The v2 wallet posted `/payments` with `source:{type:'creditcard'}` and no card fields → Moyasar rejected every card top-up before a payment page ever showed. Top-up now creates a Moyasar hosted invoice (card + 3DS on checkout.moyasar.com, no PAN touches us, returns a hosted URL to redirect to).
- Webhook crediting fallback matches the renter's pending top-up by `renter_id + amount` and binds the real payment id (idempotent on retries). Removed a duplicate Moyasar webhook.

### 2026-06-10 20:12 UTC — [PR #602](https://github.com/dhnpmp-tech/dcp-platform/pull/602) — `chore: rebuild — bake NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY into the frontend`

Included:
- Card top-up went live: backend payment flags green (`payments_secret_ready` + `payments_webhook_ready`), webhook registered with Moyasar; this deploy embedded the publishable key for browser-side tokenization/3DS.

### 2026-06-10 19:50 UTC — [PR #601](https://github.com/dhnpmp-tech/dcp-platform/pull/601) — `fix(pods): findings from the first live renter test (Tareq, 2026-06-10)`

Included:
- VRAM theft: providers with an active pod are now excluded from the verification probe, v1 routing (legacy + engine lookup), and new-pod scheduling — the probe was re-warming Ollama (~10 GB) on the renter's dedicated card, invisible from inside the container.
- Overcharge clamp: daemon job-result settlement clamped at the prepaid quote for pods (live test had settled 251 on a 250 quote).
- Rental clock: `GET /api/pods/:id` returns `ends_at` + `seconds_remaining`; the launch response states duration (the reported "Jupyter crash" was a 60-min rental ending on schedule, unannounced).

### 2026-06-10 18:39 UTC — [PR #600](https://github.com/dhnpmp-tech/dcp-platform/pull/600) — `feat(landing): replace 6-stage HIW flow with a sovereignty boundary; move plumbing to /v2/architecture`

Included:
- The "How it works" 6-stage diagram (it read as a translation pipeline and gave skeptics ammunition — flagged by Tareq + Nexus) replaced with a sovereignty-boundary visual: prompt → verified Saudi GPU → answer inside a dashed KSA border, with AWS/Azure/OpenRouter shown severed outside. The real 6-stage lifecycle (incl. the honest frontier opt-in) moved to a new `/v2/architecture` page for technical/procurement buyers; sitemap updated.

### 2026-06-10 15:31 UTC — [PR #598](https://github.com/dhnpmp-tech/dcp-platform/pull/598) — `feat(provider): self-serve GPU pod pricing in the dashboard`

Included:
- Providers can now set what renters pay for their whole-GPU pods: a "GPU pod price" field (SAR per GPU-hour) on the provider settings page, saved via `POST /providers/preferences` as `pod_rate_sar_per_hour` (0.10–50; empty resets to the platform default of 1.20 SAR/hr) and stored as `cost_per_gpu_second_halala`.
- `GET /providers/me` now echoes the rate. Previously the rate existed only as a hardcoded schema default (0.25 halala/gpu-second = 9 SAR/hr) that no provider ever chose and nothing could change.
- New provider registrations default to NULL (= platform rate) instead of the legacy 0.25; existing providers keep their current value and can change it themselves.

### 2026-06-10 11:56 UTC — [PR #597](https://github.com/dhnpmp-tech/dcp-platform/pull/597) — `feat(email): on-brand editorial redesign for all 15 transactional emails + key removed from welcome`

Included:
- All 15 outgoing transactional emails (magic link, renter/provider welcome, job queued/started/completed/failed, withdrawal approved/rejected, node offline + 24h reminder, auto-top-up paid/declined/3DS, PDPL data export, daily digest) rebuilt through one shared branded shell (`emailLayout.js` + `emailTemplates.js`): editorial dark, serif headlines, mono fact-row cards, ghost-outline CTAs, bilingual EN + proper `dir="rtl"` Arabic, hidden preheaders, and an honest why-you-got-this footer. Outlook-safe (inline styles, presentation tables, 600px).
- Security: welcome emails no longer contain the plaintext API key — replaced with a sign-in button; all call sites updated and the dead legacy `services/email.js` (which also embedded keys) deleted.

### 2026-06-10 11:34 UTC — [PR #596](https://github.com/dhnpmp-tech/dcp-platform/pull/596) — `feat(phase0): pod billing on the prepaid contract + money-loop hardening`

Included:
- **Interactive GPU pods are now billed.** Launch pre-debits the full-duration SAR quote (402 with exact amounts when balance is short; debit compensated if the insert fails); stopping a pod settles transactionally — actual GPU-seconds charged (clamped at the quote), 75% credited to the provider, the rest refunded to the renter. Never-started pods cancel with a full refund. Live-verified on production: 30-min pod quoted 4.50 SAR → stopped at 40s → 0.10 SAR charged, 0.07 to the provider, 4.40 refunded, conservation exact.
- New `settleExpiredPods` sweep settles deadline-reached pods at the full quote, credits the provider, and tears down the VPS relay (also fixing the socat public-port leak on daemon-side expiry); stale queued pods cancel + refund after 15 minutes. Pods are excluded from the generic timeout-retry sweep — a rental deadline is a normal end, not a timeout.
- Concurrent-pod quota (default 2 active per renter, `DCP_MAX_ACTIVE_PODS`). Pod ids are no longer enumerable (renter folded into the lookup; 404 for both unknown and foreign ids).
- Providers heartbeating in `pending` state are now auto-approved on first verified heartbeat (`DCP_AUTO_APPROVE_PROVIDERS=0` restores manual review) — previously a provider showed "connected" in the wizard while silently excluded from routing, earning nothing.
- Closed a free-balance leak: v1 chat/completions queued-fallback jobs are settled exclusively by the idempotent v1 settlement; the generic job-result path no longer double-credits providers or refunds renter money that was never debited.
- The `?key=` deprecation `Sunset` header is pinned to 2026-07-15 (was a rolling now+30d that never arrived). The 402 top-up hint is now honest about whether card top-up is configured. Explicit `interactive_pod` platform rate: 2 halala/min ≈ 1.20 SAR/hr/GPU.

### 2026-06-10 08:53 UTC — [PR #595](https://github.com/dhnpmp-tech/dcp-platform/pull/595) — `docs(strategy): the path to the next level — 2026-06-10 audit synthesis`

Included:
- `docs/strategy/2026-06-10-path-to-next-level.md`: synthesis of a four-track production audit (live renter signup, three-persona provider funnel, code-gap sweep, sourced market research) into a persona seamlessness map, a three-phase plan with measurable gates, five quick wins with proof metrics, a prioritized defect backlog, and the investor story.

### 2026-06-10 08:50 UTC — [PR #594](https://github.com/dhnpmp-tech/dcp-platform/pull/594) — `fix(provider-funnel): unblock onboarding for all three OS personas + renter quickstart`

Included:
- **The provider install path worked again for the first time since the v2 flip.** `GET /api/providers/download/setup` read `dc1-setup-*` template filenames where only `dcp-setup-*` exist — the wizard's only actionable install command 404'd for Windows, macOS, and Linux alike. One-line fix; verified 200 for all three OSes with a real provider key. (Server-side, the companion 403 on `install.sh` was fixed by removing a stale nginx alias block.)
- Wizard OS cards stopped advertising artifacts that don't exist (`.msi`, `.dmg`); labels are honest and the Windows selection links the real signed `.exe`.
- `dcp.sa/setup` — hard-linked from the desktop app — redirected to the *renter* wizard; now routes to `/v2/provider-setup`.
- Renter quickstart and dashboard code samples used `allam-7b` (0 providers — the new user's first documented API call was a guaranteed 503); swapped to a verified-serving model.
- Streaming rate limit raised 5 → 30/min per renter: 5/min punished exactly the paying behavior (chat UIs, agent loops). Stale limiter test expectations aligned with actual limits.

### 2026-06-10 08:32 UTC — [PR #593](https://github.com/dhnpmp-tech/dcp-platform/pull/593) — `fix(landing): marketplace gates rewritten for humans`

Included:
- The three §01 capacity gates now lead with a human headline ("We can reach it / It really answers / It serves what it claims") with the code token kept as a small chip signature; plain-language intro paragraph; body text bumped to a readable size and measure. The gates are the literal listing conditions — they now read as a promise instead of a SQL WHERE clause.

### 2026-06-10 08:24 UTC — [PR #592](https://github.com/dhnpmp-tech/dcp-platform/pull/592) — `fix(landing): door copy — RTX-class instead of hardcoded 24 GB`

Included:
- The hero's "Rent a whole GPU" door pinned today's fleet spec (24 GB) into permanent copy; the pod scheduler places on any verified machine ≥8 GB, so the line goes stale the day the fleet changes. Now "A whole RTX-class GPU, dedicated to you" (EN + AR).

### 2026-06-10 08:04 UTC — [PR #591](https://github.com/dhnpmp-tech/dcp-platform/pull/591) — `fix(landing): ship the CSS for the three doors, hero demo, and vision section`

Included:
- PR #590's components referenced `.door-grid` / `.demo-box` / `.vision-*` classes whose stylesheet block was lost behind a failed patch chain — they rendered as unstyled text. Pure CSS addition restoring the intended three-door cards, demo widget, and vision stat strip.

### 2026-06-10 07:05 UTC — [PR #590](https://github.com/dhnpmp-tech/dcp-platform/pull/590) — `feat(landing): three doors + live hero demo + SAR pricing + vision section`

Included:
- Hero rebuilt around one plain sentence ("Saudi Arabia's open GPU cloud") and three self-selection doors: Use AI models → playground, Rent a whole GPU → containers, Earn with your GPU → provider path.
- **"Proof you can touch":** a hero widget that sends one prompt to a real verified Saudi GPU via the new rate-limited `POST /api/public/demo/chat` (6/min + 40/day per IP, 280-char cap, server-held internal key, honest 503 when no capacity is serving) and renders the answer with a verification-chain receipt line.
- Marketplace prices now display **SAR** (converted at the same 3.75 peg the backend uses) — never USD; a compute-twin strip under the model table points at whole-GPU rental.
- New unnumbered Vision section: live mesh numbers labeled as this-minute truth plus a NOW / NEXT / THEN roadmap with no invented dates.

### 2026-06-09 21:15 UTC — [PR #589](https://github.com/dhnpmp-tech/dcp-platform/pull/589) — `feat(web): /v2/containers — GPU Pods product page in the app shell, static one-pager retired`

Included:
- New `/v2/containers` page with proper v2 chrome (docs-style header, home design system, EN/AR, live capacity from `/api/health/detailed`): hero with live proof → the 60-second path with the real CLI → customer-voice value cards → honest "what runs well on 24 GB" framing → a "promised today / not promised yet" honesty section (host-pinned, Docker-not-gVisor, small fleet).
- `public/gpu-containers.html` deleted; `/containers`, `/gpu-containers`, and the old shared `/gpu-containers.html` all redirect to the new page; sitemap updated; landing §02 brief CTA repointed.

### 2026-06-09 20:53 UTC — [PR #588](https://github.com/dhnpmp-tech/dcp-platform/pull/588) — `fix(landing): §02 pod cards rewritten in customer voice + technical dog-whistles`

Included:
- The four pod cards described implementation (`whole_gpu`, `jupyter_tls_ssh`) instead of buyer benefits. Each now leads with the customer outcome ("From idea to training in a minute", "The whole card is yours", "It ends when you said it ends", "Verified Saudi machines only") while the mono key-line carries the infrastructure credibility signal (`--gpus all · pinned driver`, `hard deadline · restart-proof reaper`). Containers brief repositioned as forwardable collateral.

### 2026-06-09 20:40 UTC — [PR #587](https://github.com/dhnpmp-tech/dcp-platform/pull/587) — `feat(landing): §02 Raw compute — GPU pods as the second product + honest provider_count`

Included:
- New §02 landing section presenting GPU pods as DCP's second product (whole-GPU pods, deadline-enforced, with CTAs to the console and the containers brief); sections renumbered §02–09 → §03–10 in EN and AR; GPU Pods added to the header nav, mobile menu, and footer; the §01 callout reframed ("Tokens for answers — or the whole GPU for control").
- `fix(catalog)`: `deduplicateModelAliases` folded alias rows by **summing** `provider_count`, double-counting the same physical provider once per alias form (a lone provider showed `provider_count: 2` for `qwen3:8b`). Folding is now by max; 43 catalog tests updated and green.

### 2026-06-09 20:20 UTC — [PR #586](https://github.com/dhnpmp-tech/dcp-platform/pull/586) — `feat(landing): real live marketplace in §01 — earned-online models from /v1/models`

Included:
- The §01 marketplace section now renders the actual live catalog — every model with an earned-online `available=true` verdict from `/v1/models` (name, context, quantization, price, provider count), refreshed every 60s — with an honest empty state routing to `/status` when nothing serves.
- The capacity bar's hardcoded `/4` denominator replaced with real `serving / online`; same-origin `/v1/models` rewrite added. The older `/api/models` endpoint was deliberately not used: it claims availability for models the verification layer says have no providers.

### 2026-06-09 20:08 UTC — [PR #585](https://github.com/dhnpmp-tech/dcp-platform/pull/585) — `fix(security): rotate leaked funded renter master key, purge from repo`

Included:
- The funded benchmark renter's master API key (~100M SAR balance) was committed in `docs/dcp-renter-experience.sh` and referenced in two test docs. Key rotated in production (old key rejected, new key verified); the script now requires `DCP_RENTER_KEY` from the environment; old key redacted from the docs.

### 2026-06-09 19:33 UTC — [PR #584](https://github.com/dhnpmp-tech/dcp-platform/pull/584) — `fix(audit-gaps final): renter-console honesty + PROV-9 provider-key hashing (backward-compat)`

Included:
- Renter console honesty batch (RENT-6/10/11/18/19): invoice CSV download no longer leaks the renter API key in the URL querystring; the dead "Switch workspace" control removed from keys/usage/PodShell; keys-page wallet rail labels and API pill fixed for data honesty.
- PROV-9 foundation: provider API-key hashing with a hash-first lookup and a live-fleet-safe plaintext fallback (heartbeat + `GET /me` converted; plaintext column intentionally retained for daemon back-compat during migration).

### 2026-06-09 19:17 UTC — [PR #583](https://github.com/dhnpmp-tech/dcp-platform/pull/583) — `fix(audit-gaps): close workable security + honesty gaps (SITE-6/7/8 auth + 16 more)`

Included:
- SITE-6/7/8: the `/v2/renter/*` route-guard bypass closed; the forgeable role cookie replaced with an HMAC-signed session cookie (`DC1_SESSION_SECRET`); the dead renter signup fixed; forged-cookie rejection verified live.
- Renter sub-key scopes enforced on the renter API family; empty over-reasoned completions are no longer billed (SITE-15); the legacy `POST /providers/withdraw` gated behind the admin token; plus 13 further audit fixes across the public site and consoles.

### 2026-06-09 17:17 UTC — [PR #582](https://github.com/dhnpmp-tech/dcp-platform/pull/582) — `feat(daemon-health): accepting_jobs heartbeat gate (shadow mode) — the zombie-provider cure`

Included:
- The daemon's `accepting_jobs` health signal ("an engine answers right now") is ingested and persisted from every heartbeat and logged in SHADOW mode — divergences are recorded ("under enforcement this would be NON-ROUTABLE") without affecting routing yet, so the flip can be made on evidence once fleet daemons report the field.

### 2026-06-09 16:39 UTC — [PR #581](https://github.com/dhnpmp-tech/dcp-platform/pull/581) — `feat(pods): restart-proof lifecycle (reaper+deadline) + HTTPS Jupyter + compute-scope gate`

Included:
- Closed the "pod runs forever" failure class (a real pod had run 29h past its rental after a daemon restart orphaned it): pods now carry a self-enforced deadline stamped as docker labels (`dcp.pod`, `dcp.job_id`, `dcp.deadline`), hard-capped at 24h, and a restart-proof reaper scans real docker state every poll cycle and at daemon startup.
- The public Jupyter relay now terminates TLS using the `api.dcp.sa` certificate — the notebook token no longer crosses the internet in cleartext; pod `access_url` flipped to `https://`.

### 2026-06-09 14:45 UTC — [PR #580](https://github.com/dhnpmp-tech/dcp-platform/pull/580) — `fix(docs+web): real CLI install ('pip install dc1' was broken — not on PyPI)`

Included:
- The containers one-pager and renter quickstart instructed `pip install dc1`, which does not exist on PyPI. Replaced with the working tarball install (`curl -sL …/dc1-sdk.tar.gz | tar xz`).

### 2026-06-08 18:49 UTC — [PR #579](https://github.com/dhnpmp-tech/dcp-platform/pull/579) — `fix(web): containers page — precise failover claim (pods are host-pinned)`

Included:
- Removed the implied failover claim from the containers page: pods live and die with their host machine; copy now states host-pinning honestly.

### 2026-06-08 18:45 UTC — [PR #578](https://github.com/dhnpmp-tech/dcp-platform/pull/578) — `feat(web): containers page — add reliability/trust section`

Included:
- Trust section on the GPU containers page: health-gated scheduling, server-measured billing, health-checked hosts — claims matched to what the code enforces.

### 2026-06-08 17:32 UTC — [PR #577](https://github.com/dhnpmp-tech/dcp-platform/pull/577) — `fix(site): public-surface honesty — catalog filter, false-claim strip, legal + auth polish`

Included:
- Public catalog and marketing surfaces aligned with verifiable reality: fabricated benchmark numbers and ZATCA/SLA/PDPL overclaims stripped; the public model catalog filtered to what the verification layer can defend; quickstarts pinned to served models; legal and auth-page polish.

### 2026-06-08 16:37 UTC — [PR #576](https://github.com/dhnpmp-tech/dcp-platform/pull/576) — `fix(provider): audit batch — dead controls, earnings cap, route shadow, honest copy`

Included:
- Provider console dead controls wired (kill switch, sign-out, pause/resume); the gpu-seconds/gpu-count earnings-inflation hole capped (self-reported values clamped to the registered profile and server wall-clock); a shadowing route fixed; provider-facing copy made honest about what is and isn't enforced on the node.

### 2026-06-08 15:25 UTC — [PR #575](https://github.com/dhnpmp-tech/dcp-platform/pull/575) — `feat(web): GPU Containers shareable page + /renter/pods → v2 redirect`

Included:
- Shareable GPU Containers one-pager published (later replaced by the in-app `/v2/containers` page in PR #589); `/renter/pods` now 307-redirects to the v2 pods console.

### 2026-06-08 14:55 UTC — [PR #574](https://github.com/dhnpmp-tech/dcp-platform/pull/574) — `fix(email): don't over-claim requeue in the node-offline email`

Included:
- The node-offline email claimed jobs would be requeued in cases where they aren't; the claim now matches actual requeue behavior.

### 2026-06-08 14:37 UTC — [PR #573](https://github.com/dhnpmp-tech/dcp-platform/pull/573) — `fix(renter-dashboard): audit batch — security, scopes, honest data, dead controls`

Included:
- 12-file renter dashboard batch: header-based auth (closing the `?key=` URL-leak vector client-side), a new `compute` scope with pod-launch enforcement, honest spend/usage/invoice data (fabricated VAT/ZATCA artifacts stripped), real SAR cost metering including synthetic usage for streams without provider usage blocks, account-wide budget cap via `PUT /me/budget`, and dead controls removed.

### 2026-06-08 12:16 UTC — [PR #572](https://github.com/dhnpmp-tech/dcp-platform/pull/572) — `fix(invoices): legacy renter-id route was shadowing /me/invoices (every renter's invoices 400'd)`

Included:
- A legacy route registered ahead of `/me/invoices` swallowed the path and returned 400 for every renter's invoice list. Route ordering fixed; verified live on production.

### 2026-06-08 11:46 UTC — [PR #571](https://github.com/dhnpmp-tech/dcp-platform/pull/571) — `fix(renter): wire the dead sign-out button across the dashboard`

Included:
- The sign-out control across the renter dashboard pages did nothing; it now clears the session (key + signed cookie) and routes to the auth page on all renter pages.

### 11:00 UTC — [PR #570](https://github.com/dhnpmp-tech/dcp-platform/pull/570) — `fix(renters): API key management accepts master or admin-scoped keys`

Included:
- Fixed the renter API-keys page where a renter logged in with a scoped sub-key got `Invalid or inactive master API key` on every key operation. The `GET/POST/DELETE /api/renters/me/keys` handlers used a master-key-only lookup while login and the rest of the renter API already accept scoped sub-keys via `resolveRenterIdByKey`. All three handlers now resolve via the existing `getRenterAuthContext()` (master or active scoped key): list works for any valid renter key; create/revoke require the master key or an `admin`-scoped key, with a clear actionable error instead of an opaque 403.
- Removed the hard-coded "3" sidebar badge on the API-keys nav item (keys / dashboard / invoices) and drove it from the real active-key count on the keys page. Key secrets remain show-once (industry standard); the list shows metadata + a masked prefix.

### 10:24 UTC — [PR #569](https://github.com/dhnpmp-tech/dcp-platform/pull/569) — `feat(compute): interactive GPU pods (Vast.ai-style) + driver-auto-update resilience`

Included:
- Renter-launchable **interactive GPU pods** on the existing job rails (`interactive_pod` job type): a pod is a container with full GPU passthrough, root SSH + JupyterLab, reachable over the WireGuard mesh via a socat relay. Launchable via CLI, raw API (`GET/POST/DELETE /api/pods`), and the v2 web console.
- Renter image choice: pre-baked `pytorch | vllm | cuda | ubuntu` images (boot in seconds) or any Docker reference (sshd injected on the fly); `dcp pod create --image`.
- Inference↔compute mutex: a compute pod preempts the provider's own inference (drains llama.cpp / vLLM / Ollama and restores it on teardown via a liveness-gated reaper), so a renter gets the whole GPU and the provider's models come back automatically.
- Scheduler hardening: `resolvePodProvider` only schedules onto providers the daemon reports as `docker` + `cuda_available` + `gpu_healthy` with enough VRAM, excluding non-CUDA / Apple-Silicon and GPUs broken by a driver mismatch.
- Driver-auto-update resilience: pin the NVIDIA driver at install time, a `gpu_nvml_healthy()` heartbeat probe with a critical alert when the kernel module and userspace library diverge, and a scheduler guard that skips unhealthy GPUs — closing the unattended-upgrade failure mode that silently broke a provider's GPU.
- `dc1` Python SDK + `dcp` CLI (`pod create/list/get/stop`), stdlib-only, served at `/installers/dc1-sdk.tar.gz`; v2 GPU Pods console page; renter quickstart + verification docs.

### 13:02 UTC — [PR #557](https://github.com/dhnpmp-tech/dcp-platform/pull/557) — `feat(v1): engine-keyed reasoning control + response normalizer + playground toggle`

Included:
- Replaced the fragile endpoint-string guess + single `think:false` knob (which backfires on Ollama — reasoning leaks into `content` or the response empties) with engine-keyed reasoning control: resolve the engine type (`ollama`/`vllm`/`llamacpp`) from `provider_engines`, inject the model-native `/no_think` directive for Qwen-family models, set `chat_template_kwargs.enable_thinking:false` for vLLM, and never send Ollama `think:false`.
- Added a response normalizer on both the non-stream and streaming paths that strips `<think>` blocks and the separated reasoning field (`reasoning`/`reasoning_content`/`thinking`) out of renter-visible `content`, with a stateful streaming `<think>` stripper that survives tags split across SSE chunks.
- Captured `provider_engines.engine_version` in the heartbeat (nullable, back-compat) for version-sensitive knob decisions.
- Added a "Show reasoning" toggle to the v2 renter playground (default off) that sends `enable_thinking` and renders a separated reasoning panel; answer and reasoning are never merged.
- Added 25 unit tests (engine resolution, `/no_think` immutability, field canonicalization, cross-chunk stream stripper) and extended the playground static regression. Verified live against an Ollama provider.

### 10:00 UTC — [PR #556](https://github.com/dhnpmp-tech/dcp-platform/pull/556) — `fix(health): report live catalog and v1 usage counts`

Included:
- Updated `/api/health/detailed` so `models.catalog_count` reads active `model_registry` rows, matching the public `/api/models` catalog source instead of optional Arabic portfolio metadata.
- Updated detailed health metering to read the canonical `usage_events` ledger written by `/v1/chat/completions`, with the older `serve_sessions` table retained only as a fallback.
- Added static regressions so health cannot drift back to a missing portfolio file or miss v1 usage tokens again.

### 09:46 UTC — [PR #555](https://github.com/dhnpmp-tech/dcp-platform/pull/555) — `fix(providers): verify served model from live endpoint`

Included:
- Updated earned-provider verification to probe a model returned by the provider's live `/v1/models` response instead of blindly using the first cached DB model when the cached list is stale.
- Kept the cached-model preference only when `/v1/models` confirms that cached id is actually served, so healthy providers are not failed by old catalog metadata.
- Added focused regressions for stale cached model selection, confirmed cached model selection, and the no-reported-model fallback.

### 09:26 UTC — [PR #554](https://github.com/dhnpmp-tech/dcp-platform/pull/554) — `fix(v1): restore engine-backed model coverage`

Included:
- Updated `/v1/models` provider counting to include reachable `provider_engines` rows when multi-engine routing is enabled, de-duplicated by provider ID so engine-backed providers are visible without inflating capacity.
- Added a guarded compatibility bridge for legacy provider daemons that still report `cached_models` or `vllm_models` but do not yet send the newer `engines` heartbeat payload.
- The bridge only writes legacy `providers.cached_models` when the provider has no existing `provider_engines` rows, so engine-aware providers keep the newer engine table as source of truth.
- Preserved existing `vllm_models` unless the heartbeat supplies a `vllm_models` list, and kept bridge failures warn-only so heartbeats cannot fail over catalog coverage bookkeeping.
- Added targeted regressions for engine-backed catalog counts and the legacy bridge guardrails.

### 09:09 UTC — [PR #553](https://github.com/dhnpmp-tech/dcp-platform/pull/553) — `feat(v2): add admin earned-serving proof hint`

Included:
- Added backend-provided, non-mutating operator probe hints to `/api/admin/fleet/probe-evidence` so founders and agents can distinguish reachable endpoints from missing earned inference proof.
- Added a copy-ready proof command packet to `/v2/admin` Serving recovery that uses `DCP_API_BASE`, `DCP_MODEL_ID`, and `DCP_RENTER_API_KEY` placeholders instead of embedding secrets.
- Made the next serving exit criteria explicit in the admin workflow: `/v1/models` must show `provider_count > 0`, a one-token completion must succeed, and metering must record the request before public capacity language changes.
- Added static regressions for the proof-command contract and the v2 admin rendering/styling.

### 08:58 UTC — [PR #552](https://github.com/dhnpmp-tech/dcp-platform/pull/552) — `fix(v1): keep stale providers out of model counts`

Included:
- Tightened `/v1/models` provider counts so stale-heartbeat providers do not inflate `provider_count`, even when their cached model list matches a catalog model.
- Kept existing catalog alias matching intact, including BGE-M3 and HF-style model IDs, so a fresh verified provider can still make the renter playground discoverable.
- Made the provider-count scan conservative if provider rows cannot be read: the model catalog stays available, but provider counts fall back to zero instead of throwing.
- Added a focused `/v1/models` regression for alias-matched cached models and stale-heartbeat exclusion.

### 08:50 UTC — [PR #551](https://github.com/dhnpmp-tech/dcp-platform/pull/551) — `fix(v2): remove playground demo wording`

Included:
- Removed the remaining demo-labeled sample prompt from the v2 renter playground so the console no longer suggests a mock/demo flow.
- Added a static regression that fails if demo wording is reintroduced to the v2 renter playground.
- Kept the real catalog and inference behavior unchanged: model options still require `provider_count > 0`, and inference still requires a real renter key.

### 08:45 UTC — [PR #550](https://github.com/dhnpmp-tech/dcp-platform/pull/550) — `feat(v2): surface admin serving blocker reason`

Included:
- Added the same serving-capacity counters and machine-readable capacity reason to the protected `/api/admin/health` endpoint that public health already exposes.
- Added a Live capacity reason packet to `/v2/admin` Launch readiness so founders and agents can see whether the blocker is fresh heartbeat, endpoint reachability, earned inference, or model coverage.
- Kept public capacity changes gated behind all four serving gates and continued to keep provider repair, routing, daemon, WireGuard, and marketplace-copy mutations outside the v2 packet.
- Added static regressions for the admin health capacity contract, v2 capacity reason rendering, and capacity gate styling.

### 08:28 UTC — [PR #549](https://github.com/dhnpmp-tech/dcp-platform/pull/549) — `fix(v2): remove stale provider setup proof claims`

Included:
- Removed the hard-coded provider setup throughput claim and replaced it with proof-gated copy that only promises measured tokens per second after daemon and backend verification.
- Replaced tier-language that implied reliability changes the provider payout split with copy that keeps reliability separate from the published 85/15 split.
- Stopped the provider setup OS selector from claiming a browser-detected device and changed it to a plain selected installer target.
- Replaced the auto-playing installer success sequence with a pending installer plan so the page no longer claims hardware scan, engine install, model download, or tunnel success before the daemon reports back.
- Added static regressions for stale throughput, fake device detection, fake installer progress, and payout-split wording.

### 08:15 UTC — [PR #548](https://github.com/dhnpmp-tech/dcp-platform/pull/548) — `feat(v2): add admin finance handoff packet`

Included:
- Added a read-only Money review handoff inside `/v2/admin` so founders, operators, and agents can see the human owner, verified payments console, agent summary role, evidence note, and stop rule for the highest-priority finance blocker.
- Derived the handoff from existing finance evidence already loaded by v2 admin: refund requests, provider payouts, billing exceptions, auto-top-up issues, reconciliation drift, and pending withdrawals.
- Included a copy-ready finance evidence note that summarizes the queue type, subject, amount, status, reference, and current review detail before a human uses the verified payments console.
- Kept money mutation boundaries explicit: no refund approval/rejection, payout sync, balance edit, credit grant, payment confirmation, or auto-top-up retry happens from the v2 handoff packet.
- Added static regressions for the finance handoff model, verified-console label, copy-ready evidence note, mutation boundary language, and responsive styling.

### 08:02 UTC — [PR #547](https://github.com/dhnpmp-tech/dcp-platform/pull/547) — `feat(v2): add admin serving handoff packet`

Included:
- Added a read-only Provider recovery handoff inside `/v2/admin` so founders, operators, and agents can see the owner, verified console, agent role, evidence note, and stop rule for the selected serving proof target.
- Derived the handoff from canonical `/admin/fleet/probe-evidence` rows already loaded by the Serving proof packet; no new backend route or write path was added.
- Included a copy-ready mission evidence note that summarizes provider id, provider label, recovery focus, route/inference/model/publication gate states, and the next recommended action.
- Kept recovery mutation boundaries explicit: no daemon restart, WireGuard edit, endpoint edit, routing change, or public marketplace language change happens from the v2 handoff packet.
- Added static regressions for the handoff model, copy-ready evidence note, verified-console label, mutation boundary language, and responsive styling.

### 07:51 UTC — [PR #546](https://github.com/dhnpmp-tech/dcp-platform/pull/546) — `feat(v2): add admin action ledger`

Included:
- Added a read-only Action ledger to `/v2/admin` that combines recent admin audit rows with the 24-hour mission pulse.
- Summarized admin writes, mission changes, and agent touches so founders can see who changed what before opening the raw audit feed.
- Kept the ledger evidence-only from `/admin/audit` and `/mission/pulse`; it does not replay writes, approve providers, send notifications, move money, or repair providers.
- Added static regressions for the ledger data model, evidence-source contract, mutation boundary language, rail entry, and responsive styling.

### 07:39 UTC — [PR #545](https://github.com/dhnpmp-tech/dcp-platform/pull/545) — `feat(v2): add provider approval decision envelopes`

Included:
- Upgraded the `/v2/admin` provider approval desk from a static decision-envelope note into explicit approve/reject decision envelopes.
- Each provider approval envelope now shows the guarded backend route, human-approval gate, evidence requirement, audit result, and readiness state before the operator acts.
- The reject envelope mirrors the existing button guard and stays in a watch state until a rejection reason has at least 8 characters.
- Kept provider approval behavior on the existing audited `PATCH /admin/providers/:id/approval-decision` route; no new provider repair, routing, payment, or control-plane actions were added.

### 07:30 UTC — [PR #544](https://github.com/dhnpmp-tech/dcp-platform/pull/544) — `feat(v2): add admin mission action envelopes`

Included:
- Added a mission action-envelope preview to `/v2/admin` before guarded task writes so founders, operators, and agents can see the route, permission gate, evidence requirement, audit output, and readiness state before acting.
- Derived separate envelopes for status moves, reassignment, and admin notes from the selected task, target status, target assignee, evidence note, and strict-vs-legacy write posture.
- Kept the existing guarded mission routes and write boundaries intact; no new create/delete, payment, provider repair, or control-plane actions were added.
- Added static regressions for the envelope model, strict/legacy permission labeling, evidence readiness language, and responsive envelope styling.

### 07:20 UTC — [PR #543](https://github.com/dhnpmp-tech/dcp-platform/pull/543) — `fix(v2): keep admin actions in the v2 workspace`

Included:
- Kept `/v2/admin` primary task, readiness, finance, support, incident, fleet, and lane actions anchored inside the v2 command center instead of sending operators to legacy `/admin/*` pages.
- Removed the muted rail shortcut to the legacy admin console and the provider-detail escape hatch that had no v2 route equivalent yet.
- Preserved the existing verified backend reads and guarded mission/provider writes; this change only adjusts visible navigation and operator workflow flow.
- Added static regressions that forbid visible legacy admin links, generated legacy action links, and legacy prefetch handling inside the v2 admin surface.

### 07:01 UTC — [PR #542](https://github.com/dhnpmp-tech/dcp-platform/pull/542) — `feat(v2): add admin session lock`

Included:
- Added a visible Lock action to `/v2/admin` so operators can clear the local admin key from a shared or agent-assisted browser session.
- The lock action removes `dc1_admin_token`, returns the command center to the missing-key state, and routes back to the existing v2 admin sign-in flow.
- In-flight admin loads are now generation-gated so a stale dashboard refresh cannot restore the ready view after Lock clears the token.
- Kept the control local-only: no backend session mutation, provider action, payment action, or operational write is triggered.
- Added static regressions for token clearing, missing-key state transition, sign-in redirect reuse, and scoped lock-button styling.

### 06:52 UTC — [PR #541](https://github.com/dhnpmp-tech/dcp-platform/pull/541) — `feat(v2): add admin operator brief`

Included:
- Added a read-only Operator brief near the top of `/v2/admin` that turns loaded admin evidence into a daily operating posture for founders and agents.
- Prioritized serving proof, money queue, support evidence, mission ownership, and incident watch into owner-labeled next actions.
- Elevated serving proof as the sprint blocker while public capacity is not ready, with direct links back to the evidence sections instead of unsafe actions.
- Kept the brief as prioritization only; repairs, money movement, provider actions, and public capacity changes remain in verified consoles.
- Added static regressions for operator-brief evidence derivation, highest-priority selection, read-only policy copy, and scoped styling.

### 06:42 UTC — [PR #540](https://github.com/dhnpmp-tech/dcp-platform/pull/540) — `feat(v2): add admin serving proof packet`

Included:
- Added a read-only Serving proof packet to `/v2/admin` so founders and agents can see the next provider target from canonical probe evidence.
- Split serving readiness into route proof, inference proof, model proof, and publication proof so endpoint reachability can no longer be confused with usable inference capacity.
- Added concrete exit criteria before public capacity language changes: `verified_online=1`, `provider_count > 0`, and one metered inference proof.
- Kept the workflow evidence-only and linked back to the verified fleet console; no provider repair, routing, endpoint, catalog, or daemon mutation actions were added.
- Added static regressions for proof-target selection, proof checklist copy, exit criteria, and scoped styling.

### 06:28 UTC — [PR #539](https://github.com/dhnpmp-tech/dcp-platform/pull/539) — `feat(v2): add admin probe evidence`

Included:
- Added a protected read-only `/api/admin/fleet/probe-evidence` endpoint that exposes canonical provider probe gates for serving recovery.
- Merged endpoint reachability, endpoint probe failures, earned-online verifier state, cached-model evidence, WireGuard freshness, and heartbeat age into one bounded admin evidence feed.
- Wired the v2 admin Serving recovery workflow to the new probe-evidence feed, with fallback to the existing fleet-health feed when canonical evidence is unavailable.
- Added summary counters for endpoint-route blockers, earned-inference blockers, inference timeouts, model coverage gaps, ready providers, and recovery focus groups.
- Kept the endpoint evidence-only: no live probes, provider repairs, endpoint edits, routing flips, or catalog state mutations run from this v2 surface.
- Added static regressions for the backend evidence contract, v2 admin wiring, bounded preview rendering, evidence timestamp copy, and unsafe mutation boundaries.

### 06:14 UTC — [PR #538](https://github.com/dhnpmp-tech/dcp-platform/pull/538) — `feat(v2): add admin serving recovery`

Included:
- Added a read-only v2 admin serving recovery workflow for the zero verified-serving provider state.
- Derived recovery focus from fleet evidence: endpoint reachability, earned-online inference probes, timeout errors, model coverage, WireGuard freshness, heartbeat freshness, and job/runtime stability.
- Added a recovery playbook for proving `/v1/models`, one-token inference, and model alias coverage before changing catalog or public capacity language.
- Kept daemon restarts, tunnel changes, endpoint edits, routing changes, and public capacity flips outside v2 until audited recovery actions exist.
- Added static regressions for recovery queue wiring, mutation boundaries, and scoped serving-recovery styling.

### 06:02 UTC — [PR #537](https://github.com/dhnpmp-tech/dcp-platform/pull/537) — `feat(v2): add admin support operations`

Included:
- Added a protected read-only `/api/admin/support/contacts` endpoint for saved public support submissions, with bounded pagination, category summary, and recent-24h counts.
- Added a v2 admin support desk that correlates contact submissions with bounded renter, job, and payment evidence for customer triage.
- Kept support actions read-only in v2 admin; suspensions, credits, balance edits, job cancel/requeue, refunds, and key rotation stay in verified consoles until an audited action envelope exists.
- Removed the remaining prototype-style "Demo" label from the v2 home mobile menu and replaced it with a concrete quickstart label.
- Added static regressions for support-contact read contracts, v2 support UI wiring, mutation boundaries, and public demo-language cleanup.

### 05:45 UTC — [PR #536](https://github.com/dhnpmp-tech/dcp-platform/pull/536) — `fix(public): clarify serving capacity and remove stale savings claims`

Included:
- Added explicit heartbeating, endpoint-reachable, and verified-serving provider counts to `/api/health` and `/api/health/detailed` so operators can distinguish daemon heartbeat from usable inference capacity.
- Added a machine-readable health capacity reason and serving gates for zero-capacity states instead of implying WireGuard alone explains every empty marketplace state.
- Removed the remaining unsourced competitor-savings claims and fixed comparison table from the legacy model catalog page.
- Replaced the shared footer's stale "50+ models" claim with non-numeric catalog readiness copy.
- Reworded the v2 enterprise classification bullet so the public homepage does not imply a specific NDMO compliance artifact before that pack exists.
- Added static regressions for public honesty copy and health capacity wording.

### 05:29 UTC — [PR #535](https://github.com/dhnpmp-tech/dcp-platform/pull/535) — `feat(v2): add admin runbook queue`

Included:
- Added a read-only founder runbook queue to `/v2/admin` that translates launch, fleet, finance, incident, access, and mission signals into owner-specific next actions.
- Derived runbook evidence from the already-loaded admin feeds instead of adding a new backend endpoint or static operating checklist.
- Labeled each runbook with owner, evidence, severity, and agent permission class so humans and agents can coordinate without guessing who should act next.
- Kept repairs, money movement, deploys, provider actions, notification sends, and control-plane writes out of the runbook surface; verified consoles remain the action boundary.
- Added static regressions for runbook presence, public-capacity gating, finance/incident/access runbooks, no unsafe mutation endpoints, and scoped runbook styling.

### 05:21 UTC — [PR #534](https://github.com/dhnpmp-tech/dcp-platform/pull/534) — `feat(v2): add admin launch readiness`

Included:
- Added a first-class founder go/no-go launch readiness section to `/v2/admin` for public-capacity, system-health, finance, security, queue, demand, and incident blockers.
- Wired the section to existing read-only admin evidence feeds, including `/api/admin/metrics` and `/api/admin/demand`, without adding new mutation routes.
- Made public capacity readiness depend on earned serving capacity, endpoint/model readiness, and fleet evidence before the team can safely claim marketplace availability.
- Kept provider repair, payment actions, deploys, and control-plane runs out of this v2 surface; the section is decision support only.
- Added static regressions for launch readiness wiring, public-capacity honesty copy, read-only policy copy, no unsafe mutation endpoints, and scoped launch styling.

### 05:10 UTC — [PR #533](https://github.com/dhnpmp-tech/dcp-platform/pull/533) — `feat(v2): add admin incident command`

Included:
- Added a first-class read-only incident command section to `/v2/admin` for merged incident timeline rows, recent daemon/job errors, and control-plane capacity signals.
- Wired the section to the existing `/api/admin/incidents/feed`, `/api/admin/errors`, and `/api/admin/control-plane/signals` feeds without adding new operational mutation paths.
- Added severity summaries, row-level incident evidence, control-plane recommendation context, and links back to the verified incidents/fleet consoles for safe follow-up.
- Kept control-plane snapshots, prewarm runs, run-cycle triggers, and daemon repair out of v2 admin until each action has explicit owner, approval, audit, and rollback rules.
- Added static regressions for incident feed wiring, row normalization, read-only policy copy, no control-plane mutation endpoints, and scoped incident styling.

### 04:59 UTC — [PR #532](https://github.com/dhnpmp-tech/dcp-platform/pull/532) — `feat(v2): add admin fleet readiness blockers`

Included:
- Added a first-class fleet readiness section to `/v2/admin` for inference-serving blockers from the existing `/api/admin/fleet/health` and `/api/admin/fleet/alerts` feeds.
- Surfaced row-level provider evidence for earned-online verification, endpoint reachability, WireGuard freshness, heartbeat freshness, cached model coverage, running jobs, and restart risk.
- Added fleet readiness navigation, summary gates, blocked-provider cards, alert evidence, and a link back to the verified fleet console for safe action.
- Kept provider pause/resume, endpoint edits, WireGuard repair, and routing changes out of v2 admin until v2 fleet actions have explicit audit and rollback rules.

### 04:49 UTC — [PR #531](https://github.com/dhnpmp-tech/dcp-platform/pull/531) — `feat(v2): add admin finance review`

Included:
- Added a first-class finance review section to `/v2/admin` for refund requests, provider payouts, billing exceptions, and auto-top-up issues from the existing `/api/admin/payments/audit` feed.
- Added finance review navigation, queue counters, row-level evidence, and links to the verified payments and withdrawals consoles for safe human action.
- Kept refund approval/rejection, payout sync, and balance-changing actions out of v2 admin until the v2 money-action envelope is separately audited.
- Added static regressions for finance row wiring, review-only policy copy, no direct payment mutation endpoints, and scoped finance styling.

### 04:35 UTC — [PR #530](https://github.com/dhnpmp-tech/dcp-platform/pull/530) — `feat(v2): add admin mission action desk`

Included:
- Added a guarded mission action desk to `/v2/admin` so founding-team operators can move task status, reassign work, and record evidence notes without leaving the v2 surface.
- Reused the existing mission backend write routes (`PATCH /api/mission/tasks/:id`, `POST /api/mission/tasks/:id/reassign`, and `POST /api/mission/tasks/:id/comments`) instead of introducing a new experimental admin mutation API.
- Kept mission task creation and deletion out of v2 admin; the action desk only supports bounded operational updates through the current admin token and mission write gate.
- Added static regressions for mission action wiring, strict-vs-legacy write posture copy, no delete/create controls, and action-desk styling.

### 04:26 UTC — [PR #529](https://github.com/dhnpmp-tech/dcp-platform/pull/529) — `feat(v2): add admin audit trail`

Included:
- Added a read-only recent audit trail to `/v2/admin` so founding-team operators can see the latest guarded admin actions without leaving the v2 surface.
- Wired the panel to `/api/admin/audit?limit=8`, supporting both the current `entries` response and the older `audit_log` shape.
- Kept full audit pagination in the current admin security console while v2 shows the latest evidence cards for quick accountability checks.
- Added static regressions for audit endpoint wiring, payload normalization, empty-state copy, and audit-trail styling.

### 04:19 UTC — [PR #528](https://github.com/dhnpmp-tech/dcp-platform/pull/528) — `feat(v2): add admin notification posture`

Included:
- Added an admin-only `/api/admin/notifications/posture` endpoint for safe alert-channel readiness without returning raw webhook URLs, Telegram bot tokens, or Telegram chat IDs.
- Added a v2 admin notification-routing panel so founders can see whether human and agent alerts have active channels, redacted destinations, and an explicit agent notify policy.
- Kept notification test sends and channel edits out of v2 admin; the panel is read-only until event allowlists, approval notes, and audit envelopes are explicit.
- Added static regressions for safe notification posture redaction, v2 posture wiring, notification panel styling, and avoiding the raw legacy notification config payload.

### 04:12 UTC — [PR #527](https://github.com/dhnpmp-tech/dcp-platform/pull/527) — `fix(mission): add strict write auth gate`

Included:
- Added a dormant `DCP_MISSION_STRICT_WRITE_AUTH` guard for mission mutations so task, comment, milestone, and goal writes can be hardened to admin token or `x-mission-agent-key` without changing default production behavior.
- Kept read endpoints and the read-only `/mission/pr-state` proxy on the existing authenticated-read path.
- Switched mission-agent-key comparison to a timing-safe helper and added a stable `mission_write_forbidden` response for strict-mode write denials.
- Added static regressions to keep every mission mutation on `requireWriteAuth` while preserving the read-only PR-state proxy behavior.

### 04:04 UTC — [PR #526](https://github.com/dhnpmp-tech/dcp-platform/pull/526) — `feat(v2): expose admin access governance`

Included:
- Added an admin-only `/api/admin/access/policy` posture endpoint that reports admin token/IP allowlist configuration, mission write mode, mission-agent-key presence, and agent permission readiness without returning secret values.
- Added a v2 admin access-governance panel so founders can see whether mission writes are still on the legacy authenticated-write path or hardened behind the strict admin/agent gate.
- Kept v2 admin task mutation controls out of the interface; guarded agent writes remain blocked until `DCP_MISSION_STRICT_WRITE_AUTH` is enabled and audited.
- Added static regressions for the backend policy route, secret non-disclosure, v2 access cards, access ladder, and strict-vs-legacy mission write labels.

### 03:50 UTC — [PR #525](https://github.com/dhnpmp-tech/dcp-platform/pull/525) — `feat(v2): add admin mission control mirror`

Included:
- Added a read-only mission-control layer to `/v2/admin` so founders can see open work, blocked tasks, active goals, shipped-in-24h pulse, and the human/agent roster without leaving the v2 admin surface.
- Wired the section to real `/api/mission/*` endpoints using the existing admin token: overview, open tasks, assignees, goals, and 24h pulse.
- Kept task writes out of v2 admin for now; the section links to `/mission` for the full board while role delegation, agent write keys, and audit approval rules remain separate hardening work.
- Added static regressions for the mission API dependencies, read-only mission policy, roster/task ownership copy, and mission-control styling.

### 03:38 UTC — [PR #524](https://github.com/dhnpmp-tech/dcp-platform/pull/524) — `fix(v2): remove stale homepage capacity table`

Included:
- Removed the remaining illustrative GPU-class marketplace table from `/v2/home` so the public site no longer looks like it has static provider inventory.
- Replaced the table with an explicit capacity truth panel that names the real publication gates: endpoint reachability, earned-online verification, and model coverage.
- Kept the zero-capacity meter and `/status` link as the correct public state while providers or WireGuard tunnels are not serving verified inference.
- Added static regressions to prevent hard-coded GPU classes, token-metered inventory rows, and old marketplace-table markup from returning.

### 03:30 UTC — [PR #523](https://github.com/dhnpmp-tech/dcp-platform/pull/523) — `fix(v2): close public website gaps`

Included:
- Made the v2 homepage capacity meter render as zero until live endpoint, model-coverage, and earned-online checks pass, and routed visitors to `/status` for live availability.
- Reworded v2 provider setup requirements so static minimums are not presented as browser-detected hardware telemetry before the daemon runs.
- Removed the decorative docs search input and its unused styles from `/v2/docs`.
- Added `robots.txt` and a Next.js sitemap route so `/robots.txt` and `/sitemap.xml` no longer 404.
- Added static regressions for homepage capacity honesty, provider setup wording, docs anchors/search chrome, and site index files.

### 03:11 UTC — [PR #522](https://github.com/dhnpmp-tech/dcp-platform/pull/522) — `feat(v2): add guarded provider approval desk`

Included:
- Added a v2-native provider approval desk to `/v2/admin` so founding-team operators can review pending providers without dropping into the legacy provider table first.
- Wired approve/reject actions to the audited `/api/admin/providers/:id/approval-decision` route instead of the older legacy shortcut endpoints.
- Kept the workflow one-provider-at-a-time, labeled as a guarded write, and required a clear rejection reason before sending a reject decision.
- Surfaced SLA age, queued time, audit-envelope language, and a legacy detail link beside each pending provider decision.
- Added static regressions for the approval desk, audited PATCH route, rejection reason guard, and approval desk styling.

### 02:53 UTC — [PR #521](https://github.com/dhnpmp-tech/dcp-platform/pull/521) — `feat(v2): expand admin operational dashboard`

Included:
- Expanded `/v2/admin` from a first command-center shell into a broader read-only operations surface for founding-team workflows.
- Added v2 admin reads for provider approvals, earned fleet health, fleet alerts, finance reconciliation, recent errors, and control-plane signals.
- Added a launch-readiness board that treats verified serving capacity, fleet alerts, money queues, reconciliation, incidents, and control-plane signals as first-class operating checks.
- Added fleet, finance, and incident/control-plane lanes so humans and future agents can see the current risk areas without jumping through multiple legacy pages.
- Kept provider/payment/fleet mutations out of v2 admin for now; guarded writes still route to the existing admin console until explicit v2 approval flows are built.
- Added static regressions for the new admin API dependencies, read-only policy, readiness board, and operational lane styling.

### 02:41 UTC — [PR #520](https://github.com/dhnpmp-tech/dcp-platform/pull/520) — `fix: align provider online truth and retire stale brand docs`

Included:
- Fixed `/api/providers/online` so the public provider list no longer treats heartbeat-only daemon claims as live marketplace capacity.
- Required a fresh backend endpoint reachability verdict before a provider can appear as public `is_live`, then applied the existing earned-routing policy so stale positive probes and freshly failed verification probes are excluded.
- Removed the retired public brand-guideline HTML artifact and iframe wrapper page from the deployed app.
- Redirected stale `/docs/DCP-BRAND-GUIDELINES-v3.html` and `/docs/brand` traffic to the current v2 docs surface.
- Added regressions for heartbeat-only provider false positives, freshly failed earned probes, and retired public brand-doc artifacts.

### 01:47 UTC — [PR #519](https://github.com/dhnpmp-tech/dcp-platform/pull/519) — `fix(v2): retire public prototypes and align catalog honesty`

Included:
- Removed the retired v2 design handoff/prototype files from `public/dcp-v2` so mockup HTML, demo pages, and design-reference README content are no longer deployed as public production URLs.
- Redirected stale `/dcp-v2/*` requests to the real `/v2/home` surface.
- Redirected retired `/models` traffic to the v2 renter playground instead of the legacy marketplace.
- Tightened `/v2/home` copy so it no longer promises an immediate working inference call or hard-coded token-throughput range when no verified serving model is present.
- Aligned `/api/models` and `/api/models/catalog` availability with the inference path by requiring a reachable endpoint, fresh heartbeat, inference support, earned-routing policy, and a cached model/alias match before a provider counts as available.
- Made `/api/models/:model_id/deploy` return `409 model_unavailable` instead of a ready deploy handoff when no verified provider can currently serve the model.
- Removed stale `DC1`, fixed-percent revenue, and fixed model-count claims from provider/renter welcome email copy.
- Added regressions for retired public prototypes, v2 redirect hygiene, and model-catalog honesty.

### 21:37 UTC — [PR #518](https://github.com/dhnpmp-tech/dcp-platform/pull/518) — `fix(v2): keep public CTAs on honest v2 surfaces`

Included:
- Kept `/v2/home` public CTAs inside v2 routes for renter setup, provider setup, and the model playground instead of sending visitors through legacy marketplace/setup pages.
- Replaced the fabricated homepage provider marketplace table and randomized live metrics with honest verified-capacity policy copy.
- Removed the animated fake provider counter from `/v2/provider-setup`.
- Aligned visible provider-share copy and the provider setup estimator to the 85/15 provider/platform split.
- Added static regressions for v2 public link hygiene, fake provider names, simulated live telemetry, fake counters, and stale rev-share copy.

### 21:30 UTC — [PR #517](https://github.com/dhnpmp-tech/dcp-platform/pull/517) — `fix(v2): stop prefetching legacy admin links`

Included:
- Disabled Next.js prefetching on legacy `/admin` fallback links from `/v2/admin` so the live command center does not emit harmless RSC fallback console errors.
- Kept the legacy admin console reachable for guarded operations while leaving v2-native links on normal navigation behavior.
- Added a static regression to keep legacy admin links classified and non-prefetching.

### 21:08 UTC — [PR #516](https://github.com/dhnpmp-tech/dcp-platform/pull/516) — `feat(v2): add admin command center`

Included:
- Added `/v2/admin` as the first v2-style admin command center for founding-team operations and future agent participation.
- Synthesized a human-readable Ops Inbox from verified admin APIs: dashboard stats, payments audit, system health, security summary, and provider supply context.
- Added an agent permission ladder and task envelope model so agents can read, notify, and propose by default while guarded writes remain human-approved.
- Updated v2 admin auth to land operators on `/v2/admin` while keeping the existing `/admin` console linked as the proven operations fallback.
- Added static regressions for the v2 admin route, API dependencies, auth guard, and agent-aware workflow model.

### 20:28 UTC — [PR #515](https://github.com/dhnpmp-tech/dcp-platform/pull/515) — `fix(v2): keep admin sign-in on v2 auth`

Included:
- Kept the `/v2/auth` "Need admin access?" path inside the v2 auth design instead of sending operators through the old `/login` page.
- Added a v2-styled admin API-key form that validates against `/api/admin/dashboard`, stores `dc1_admin_token`, creates the shared admin session, and opens the existing `/admin` console.
- Added a static regression so v2 auth cannot reintroduce the old admin-login detour.

### 20:14 UTC — [PR #514](https://github.com/dhnpmp-tech/dcp-platform/pull/514) — `fix(v2): gate setup console shortcut on auth`

Included:
- Changed the `/setup` top-right action so clean browsers are sent to renter auth instead of seeing a misleading console shortcut.
- Kept the console shortcut available only after the stored renter key is verified against `/api/renters/me`.
- Added a static regression test for the authenticated setup action.

## 2026-06-02

### 12:37 UTC — [PR #493](https://github.com/dhnpmp-tech/dcp-platform/pull/493) — `fix: dedupe explicit admin audit mutations`

Included:
- Skipped generic admin audit rows for payout and payment-refund mutation routes that already write explicit audit rows.
- Added production mount-order regression tests for refund approve/reject so the `/api/admin` middleware cannot duplicate those audit records again.
- Verified with focused backend syntax checks, refund-request tests, payout audit-dedupe tests, and `git diff --check`.

### 12:34 UTC — [PR #492](https://github.com/dhnpmp-tech/dcp-platform/pull/492) — `fix: polish admin refund audit table`

Included:
- Showed Moyasar payment IDs and original payment amount beside refund-request amounts on `/admin/payments`.
- Fixed refund action success copy so reject actions render `rejected`, not `rejectd`.
- Made refund requests the default payments audit tab and updated the page intro.
- Verified with `npm run build`, standalone TypeScript check after Next type generation, and `git diff --check`.

### 12:31 UTC — [PR #491](https://github.com/dhnpmp-tech/dcp-platform/pull/491) — `docs: sync public openapi spec`

Included:
- Synced `public/docs/openapi.yaml` from the maintained `docs/openapi.yaml`.
- Ensured the deployed `/docs/openapi.yaml` link includes refund-request API documentation.
- Left `backend/openapi/dcp.yaml` unchanged because it is the narrower vendored `dcp-contracts` response-validation spec.
- Verified YAML parsing for all OpenAPI specs, byte identity between maintained and public specs, refund-route presence, and `git diff --check`.

### 12:28 UTC — [PR #490](https://github.com/dhnpmp-tech/dcp-platform/pull/490) — `fix: share model alias routing matcher`

Included:
- Moved alias-aware model matching into `backend/src/lib/model-aliases.js` as a shared helper.
- Used the shared matcher for multi-engine `provider_engines.served_models`, legacy `cached_models` routing, and `/api/providers/model-catalog` provider counts.
- Added regressions for Qwen2.5-VL, BGE, ALLaM, and Llama aliases.
- Verified syntax checks, 69 focused backend tests, and `git diff --check`.

### 12:20 UTC — [PR #489](https://github.com/dhnpmp-tech/dcp-platform/pull/489) — `chore: remove stale horizontal logo asset`

Included:
- Removed unused `public/dcp-logo-horizontal.webp`.
- Confirmed the removed file was actually a 128x128 PNG with a `.webp` extension.
- Kept `README.md` on the crisp SVG logo.
- Closed [issue #480](https://github.com/dhnpmp-tech/dcp-platform/issues/480).
- Verified no remaining source references and `git diff --check`.

### 12:17 UTC — [PR #488](https://github.com/dhnpmp-tech/dcp-platform/pull/488) — `docs: document refund request payment APIs`

Included:
- Added OpenAPI coverage for renter-created payment refund requests.
- Documented `/api/admin/payments/audit` refund queue output and admin refund approve/reject actions.
- Added the `PaymentRefundRequest` schema.
- Folded duplicate `/api/renters/me` and `/api/providers/me` path entries so `docs/openapi.yaml` strict-parses cleanly.
- Verified strict YAML parsing, duplicate path scan, refund-request backend tests, and `git diff --check`.

### 11:52 UTC — [PR #487](https://github.com/dhnpmp-tech/dcp-platform/pull/487) — `fix: make WireGuard registration rollback on persistence failure`

Included:
- Hardened `/api/providers/wg/register` and `/api/providers/wg/install-config`.
- Removed live `wg` peer additions when provider DB persistence fails.
- Kept old peers in place until new WireGuard key/IP state is persisted, then removed stale peers best-effort.
- Replaced WireGuard shell command strings with `execFileSync` argument arrays.
- Added regression coverage for [issue #358](https://github.com/dhnpmp-tech/dcp-platform/issues/358).
- Verified provider WG tests, WG diagnostics tests, hardcoded infra/security tests, syntax checks, and `git diff --check`.

### 11:13 UTC — [PR #486](https://github.com/dhnpmp-tech/dcp-platform/pull/486) — `docs: refresh changelog follow-up note`

Included:
- Updated the changelog follow-up note so it no longer listed refund requests or pricing refresh as future work after those PRs merged.
- Verified with `git diff --check`.

### 10:58 UTC — [PR #485](https://github.com/dhnpmp-tech/dcp-platform/pull/485) — `feat: refresh public pricing page`

Included:
- Replaced the stacked pricing page with a denser editorial pricing surface using existing DCP dark tokens and Instrument Serif display heading.
- Exposed auto-top-up behavior, the `402 insufficient_balance` pre-flight gate, starter credit order, and refund/admin review path.
- Added per-model-class token-rate table, subscription discount math, and GPU-hour floor table.
- Verified with `npm run build`, Playwright desktop/mobile visual checks, and `git diff --check`.

### 10:51 UTC — [PR #484](https://github.com/dhnpmp-tech/dcp-platform/pull/484) — `feat: add payment refund request workflow`

Included:
- Added `POST /api/payments/:id/refund-request` for renter-created refund requests on paid top-ups.
- Added migration 023 and inline schema for `payment_refund_requests`.
- Added the one-open-request-per-payment guard.
- Added refund requests to the admin payments audit screen with approve/reject actions.
- Added a Moyasar payment refund helper for live Moyasar refunds, with internal/manual semantics for sandbox, no-key, and bank-transfer records.
- Verified refund-request tests, payout audit-dedupe tests, backend syntax checks, `npm run build`, and `git diff --check`.

### 10:44 UTC — [PR #483](https://github.com/dhnpmp-tech/dcp-platform/pull/483) — `fix: require backend liveness verdict for routing`

Included:
- Required catalog, legacy routing, and multi-engine routing to have a positive backend endpoint probe verdict before treating a provider as serviceable.
- Persisted consecutive provider probe failures in `providers.endpoint_probe_failures`.
- Added tests for probe persistence and heartbeat-only routing exclusion.
- Verified provider-probe tests, multi-engine routing tests, backend syntax checks, and `git diff --check`.

### 10:37 UTC — [PR #482](https://github.com/dhnpmp-tech/dcp-platform/pull/482) — `ci: reclaim disk before sd worker build`

Included:
- Added an extra Docker/Buildx prune between instant LLM and SD worker image builds.
- Reduced the chance that the SD worker build starts with insufficient GitHub runner disk after the large vLLM image build.

### 10:35 UTC — [PR #481](https://github.com/dhnpmp-tech/dcp-platform/pull/481) — `ci: warn on skipped sentinel inference`

Included:
- Changed sentinel inference monitoring so skipped inference is a warning/alert condition, not a silent pass.
- Added auto-selection of an online model for the sentinel smoke request.
- Added a guard for long-running missing sentinel renter key configuration.

### 09:51 UTC — [PR #479](https://github.com/dhnpmp-tech/dcp-platform/pull/479) — `ci: add worker image disk cleanup`

Included:
- Added disk cleanup before scheduled worker-image Docker builds.
- Gave heavyweight vLLM/SDXL layers more GitHub runner headroom.

### 09:47 UTC — [PR #478](https://github.com/dhnpmp-tech/dcp-platform/pull/478) — `docs: sanitize dotenv changelog wording`

Included:
- Sanitized public changelog wording around dotenv and missing secrets.
- Kept the operational lesson without exposing sensitive implementation detail.

### 00:17 UTC — [PR #477](https://github.com/dhnpmp-tech/dcp-platform/pull/477) — `fix: settle queued v1 inference once`

Included:
- Removed the legacy queued-job pre-debit in `/v1/chat/completions`.
- Routed queued inference completion through the same `settleInferenceOnce` settlement path as direct provider proxying.
- Reduced double-charge and unreconciled-debit risk for queued inference.

### 00:12 UTC — [PR #476](https://github.com/dhnpmp-tech/dcp-platform/pull/476) — `fix(catalog): add bge and qwen alias discovery`

Included:
- Added BGE and Qwen alias discovery coverage.
- Improved catalog provider-count matching for cached `bge-m3` and Qwen2.5-VL variants.

### 00:07 UTC — [PR #473](https://github.com/dhnpmp-tech/dcp-platform/pull/473) — `security: scrub hardcoded secrets/infra from source + tighten secret scan`

Included:
- Removed hardcoded production Telegram fallback token/chat values from heartbeat channel code.
- Moved WireGuard server endpoint use to required environment configuration.
- Sanitized sensitive public changelog wording.
- Added a Telegram bot token gitleaks rule.
- Expanded hardcoded production infra/security regression tests.

## 2026-06-01

### 22:37 UTC — [PR #472](https://github.com/dhnpmp-tech/dcp-platform/pull/472) — `docs: remove obsolete OpenAPI duplicates`

Included:
- Removed obsolete duplicate OpenAPI YAML files.
- Retargeted API guide links to the maintained `docs/openapi.yaml` spec.

### 22:32 UTC — [PR #471](https://github.com/dhnpmp-tech/dcp-platform/pull/471) — `chore: clean public repo surface`

Included:
- Cleaned the public repository surface for the renamed `dcp-platform` repo.
- Removed internal coordination notes, agent handoffs, private planning docs, generated reports, stale workflow files, disabled source copies, and build artifacts from the tracked tree.
- Added public repository orientation through `README.md`, `REPO_MAP.md`, folder `OVERVIEW.md` files, and a pull request template.
- Updated GitHub repository metadata with public description, homepage, and topics.
- Added ignore rules for local/private docs, generated installer outputs, local agent state, build artifacts, and runtime data.

## Backfill Notes

- PRs before #471 are not yet fully backfilled into this root changelog.
- Older deep engineering notes remain in [`docs/CHANGELOG.md`](docs/CHANGELOG.md) until they are converted into this PR-based format.
