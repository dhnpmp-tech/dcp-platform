# DCP Security Remediation — Tito Audit (2026-06-24)

Response to the Croc/Tito security review. Status of **every** finding below.
Backend fixes are **live on prod** (VPS, pod-aware `safe-reload`, verified) and in this branch.
Frontend fixes are in this branch → **Vercel preview** (promote to prod via merge after preview smoke).

## CRITICAL
| # | Finding | Status | Notes |
|---|---------|--------|-------|
| C1 | Renter `/login-email` returns master key for an email alone | ✅ **FIXED LIVE** | Now returns **410** (mirrors provider DCP-896). Verified: `POST /api/renters/login-email` → 410. |
| C2 | Forgeable session cookie | ✅ **FIXED** (core was already fixed) | Session already mints an **HMAC-signed httpOnly cookie** verified constant-time in middleware (prior pass). Added CSRF residual: cookie **SameSite=lax→strict**. (Frontend → preview.) |
| C3 | Global `DC1_HMAC_SECRET` injected into every daemon download | ⏳ **STAGED — design corrected** | The auto-generated patch was **rejected in review**: that injected secret is the **task_spec verification key** (must equal the backend signing key) — a per-provider swap would make every daemon **reject every job**. Correct fix = coordinated per-provider task_spec signing on both ends; scheduled, not a hot patch. |
| C4 | Live renter API key hardcoded in 4 repo scripts | ✅ **FIXED LIVE** | Key **rotated dead** in DB (0 rows); scripts now read `DC1_RENTER_KEY` env. (Git-history scrub = follow-up.) |

## HIGH
| # | Finding | Status | Notes |
|---|---------|--------|-------|
| H1 | Plaintext API keys at rest | ⏳ **STAGED** | Dual-path hash groundwork authored + reviewed; **deferred** because it's additive (plaintext retained → doesn't close the finding) and touches the auth hot path. Full closure = migrate ~30 lookup sites + drop plaintext + test. Scheduled. |
| H2 | API keys in query params (`?key=`) | ✅ **CONTROL SHIPPED LIVE** | Rejection middleware wired on `/v1/*` behind `DC1_REJECT_QUERY_KEYS` (defaults **OFF** + logs a deprecation warning) so live SDK clients don't break; flip to enforce after SDK migration. |
| H3 | API keys in browser localStorage | ⏳ **STAGED** | 88-file architectural migration (the localStorage key *is* the bearer credential; needs a server-side key-exchange/vault). Not a scriptable edit — scheduled. |
| H4 | v1 billing TOCTOU / silent debit failure | ✅ **ALREADY FIXED** | Migration 021: `billingService.settleInferenceOnce()` is an atomic, rowcount-guarded debit in a transaction; throws `InsufficientBalanceError` (rollback) instead of silent pass. Tito's line numbers were stale. |
| H5 | Unauth financial reconciliation API | ✅ **FIXED LIVE** | `router.use(requireAdminAuth)` on the reconciliation router. Verified: `/api/reconciliation/summary` → 401. |
| H6 | Hardcoded MC token fallback | ✅ **ALREADY CLEAN** (source) | Token only survives in gitignored `.next` build artifacts; all source already env-reads. Action: **rotate the MC token** (ops follow-up). |
| H7 | Heartbeat HMAC enforcement off by default | ⏳ **STAGED (correctly)** | Enabling it instantly 401s every daemon (they don't sign heartbeats) — **proven + reverted**. Gated behind C3 (signing daemons) before it can be turned on. |
| H8 | HTTP/bare-IP backend defaults | ✅ **FIXED** (frontend → preview) | bare-IP default was already gone; repointed `security`/`intelligence` API routes to `https://api.dcp.sa` + added a **production build guard** that fails the build on a plaintext non-localhost backend. |
| H9 | Dependency CVEs (backend 31 / frontend 9) | ⏳ **STAGED** | `overrides` for ws/qs/protobufjs/grpc-js staged in package.json; the actual `npm audit fix` must run in a **maintenance window** (running it on the live tree mid-traffic risks a crash loop). Frontend Next already resolves to patched 14.2.35. |

## MEDIUM
| # | Finding | Status |
|---|---------|--------|
| M1 | CORS allows no-Origin | ✅ Already env-gated (`DCP_ALLOW_LOOPBACK_CORS`, prod hard-stops loopback) |
| M2 | Swagger UI from unpkg CDN | ✅ **FIXED LIVE** — pinned `@5.17.14` + sha384 **SRI** + crossorigin |
| M3 | `curl\|bash` installer overridable API base | ✅ **FIXED LIVE** — `API_BASE` hard-pinned to `https://api.dcp.sa`, overrides ignored unless `--dev` |
| M4 | Installers served static | ✅ Accepted (open-source model) |
| M5 | Admin dashboard proxy unauth sub-fetches | ✅ **FIXED** (frontend → preview) — now forwards `x-admin-token` |
| M6 | Supabase anon key in `.env.example` | ✅ No real key present (placeholder); anon keys are public-by-design w/ RLS |
| M7 | `GET /v1/models` unauthenticated | ✅ **FIXED LIVE** — added `modelCatalogLimiter` (100/min/IP); endpoint stays public-by-design |
| M8 | Payment verify on poll | ✅ Accepted (Moyasar-ownership-gated, by design) |

## LOW
L1 cookie-secure (already correct) · L2 admin MFA (accepted/follow-up) · L3 PDPL residency (documented) · L4 50mb body (**already 2mb** global + scoped 10mb exception) · L5 test rate-limit disable (tests only) · L6 localStorage doc · L7 P2P IP in example (**already redacted**).

---
### Live-on-prod now (verified)
C1, C4, H5, H2, M2, M3, M7 — plus already-remediated H4, H6, M1, M6, M8, L4, L7.
### In this branch → Vercel preview (promote via merge after preview smoke)
C2 (CSRF), M5, H8.
### Scheduled (with rationale above)
C3/H7 (coordinated per-provider task_spec signing), H1 (full plaintext migration), H3 (localStorage→server-side session), H9 (`npm audit fix` in a maintenance window), + rotate the MC token & scrub git history of the old keys.

Every "live" item was verified by HTTP probe + a fleet-health check (heartbeats accepted, 0 rejected) after each deploy.


## 2026-06-24 (later) — KB-applied audit: AI/agent + multi-tenant + supply layer
Applied the Anthropic-Cybersecurity-Skills KB (ATLAS/ATT&CK-mapped) to the DCP-unique surfaces the
web/backend baseline missed. 4 crit / 9 high / 4 med confirmed (adversarially verified live).
### Fixed live now (HTTP-verified + fleet heartbeats 0-rejected)
- DCP-API-01 (high, denial-of-wallet LATENT — NOT a realized incident; the MiniMax “plan exhausted”
  was non-payment, not an attack, and the keyless calls were our own audit probes): agent-gateway
  key-presence gate (`DC1_GATEWAY_REQUIRE_KEY=1`) + 60/min/IP limiter — keyless=401, keyed unaffected,
  Nexus not a caller. Gated regardless because the proxy can route to a metered upstream (unbounded).
- DCP-API-03 (high): requireAdminAuth on the two unauth DB-writes (recovery/resolve, fallback/simulate).
- AI-1 (crit): Nexus tirith scanner re-enabled fail_closed at the correct path (had regressed to OFF).
- AI-3 (high): Nexus memory.write_approval:true (stops one-shot-injection -> persistent poisoning).
- AI-4 (high): Spark tirith fail_open:false + correct path (guardrail no longer fails open).
### Needs human
- AI-2: ROTATE the OpenRouter key (leaked verbatim) — OpenRouter dashboard.
### Staged -> runbooks/ai-agent-and-pod-isolation-hardening.md
POD-1..6 (pod isolation, daemon-fleet + soak), SC1 (daemon code-signing), SC3 (mesh/bind),
DCP-API-02/04 (enumeration), DCP-API-05 (folds into H1), AI-5 (promptfoo red-team in CI).

## 2026-06-24 (later) — doable-now sweep (adversarial workflow)
- DCP-API-02 (standup): GATED `/api/standup/latest` with requireAdminAuth (per-route; POST /run keeps its
  Bearer; cron calls generateStandupData directly) — unauth=401, fleet 0-rejected. Verifier could not refute.
- DCP-API-02 (network/p2p): STAGED — real identity leak (peer_id/name/addrs) but they are the P2P discovery
  fallback; branch-scoped sanitize + daemon-read verify required first (runbook).
- DCP-API-04 (containers/registry): ACCEPTED by design — intentional public image allowlist.
- H1: full 39-site inventory done; blocked on the DC1_KEY_PEPPER decision (rec: no pepper, match providers);
  Phase 0 ready but run attended (touches key-minting).