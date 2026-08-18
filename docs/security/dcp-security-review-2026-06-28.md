# DCP.sa Security Review — Follow-up (2026-06-28)

**Review date:** 2026-06-28  
**Codebase:** `/home/tareqa/dc1-platform` (dc1-platform monorepo powering dcp.sa GPU marketplace)  
**Prior review:** DCP-SECURITY-REVIEW-2026-06-23.md (5 days ago)

**Overall risk rating: CRITICAL** (unchanged; several P0 issues remain live)

The platform has made **targeted progress** in provider credential handling (hashed keys via apiKeyService, expanded admin RBAC) and container isolation. However, **core authentication bypasses and secret distribution problems identified previously remain unaddressed** for the renter path and global platform secrets. Live production keys and global HMAC are still at risk of trivial exfiltration.

---

## Status of Prior Critical Findings

| Prior ID | Finding | Current Status (2026-06-28) |
|----------|---------|-----------------------------|
| C1 | Renter `/login-email` returns full API key with email only | **STILL CRITICAL** — endpoint fully functional, returns `api_key` (see `backend/src/routes/renters.js:1050-1087`) |
| C1 (provider) | Provider `/login-email` | Fixed (returns 410) — good |
| C2 | Client-forgeable `__dc1_session` cookie (raw role) | **STILL CRITICAL** — `app/api/session/route.ts` + `middleware.ts` unchanged |
| C3 | Global `DC1_HMAC_SECRET` injected into every daemon download | **STILL CRITICAL** — `providers.js:3534-3539` still does the replace for HMAC_SECRET |
| C4 | Hardcoded live renter key in scripts | **STILL CRITICAL** — `dc1-renter-03ab6169e4a205e7e98bfff9206b49fb` present in 4 benchmark/load scripts |

---

## Executive Summary

| Area | Status | Delta since 06-23 |
|------|--------|-------------------|
| Auth / session (renter) | **Critical** | No change |
| API keys (renters + scoped) | **High** | Providers improved (hashed + prefix lookup); renters + renter_api_keys remain plaintext |
| Session / dashboard | **Critical** | Unchanged |
| Payments / Moyasar | Medium | HMAC good |
| Billing / v1 inference | **High** | Minor wrapper but TOCTOU + best-effort debit persists |
| Admin / reconciliation | **High** | Admin routes mostly protected now; reconciliation.js still fully open |
| Provider daemon trust | **Critical** | HMAC secret still leaked on download |
| Infrastructure / defaults | **High** | Bare IP + HTTP defaults still in .env.example, next.config, lib |
| Dependencies | **High** | High-severity issues remain (grpc crash, glob cmd injection in build chain, Next.js-related) |
| Isolation (containers) | Good | Verified network:none + seccomp + allowlists + pinned digest option |

**New/improved positives:**
- Provider keys: `dcp_prov_*` now issued via `apiKeyService.js` with SHA-256 hashes, prefix indexing, revocation.
- Admin middleware expanded (`adminAuth.js` + RBAC stubs, `requireAdminRbac`).
- More security tests (heartbeat-hmac, auth-hardening, adminAuth.test, payouts tests).
- Docker job launcher: securityOpt, image allowlist, optional digest pinning, no-network default.
- Scoped sub-keys (renter/provider) introduced for least-privilege.

---

## Critical Findings (Current)

### C1 — Renter email login still returns master API key (no OTP required)
**Files:** `backend/src/routes/renters.js:1050-1087` (and callers in scripts/verify-renter-login-email.js, tests)

The endpoint accepts only `email` and replies with the full `api_key`. The proper OTP paths (`/send-otp` + `/verify-otp`) exist and are used by the login UI, but `/login-email` was never disabled for renters (unlike providers).

**Impact:** Any attacker who can guess or enumerate renter emails (common from support tickets, marketing, leaks) obtains a fully privileged renter key. Can be used for `/v1/chat/completions`, balance drain, job history, webhook registration, scoped key creation, etc.

**Remediation (unchanged):**
- Return 410 (mirror provider fix at `providers.js:629-637`).
- Audit/rotate any keys ever obtained via this path.
- Add regression test that explicitly asserts 410.

### C2 — Session role cookie is arbitrary client-controlled value
**Files:** `app/api/session/route.ts:11-32`, `middleware.ts:26-40`, `app/lib/auth.ts:20-27`

`POST /api/session { "role": "admin" }` (or "provider"/"renter") sets an httpOnly cookie that the Next.js middleware trusts verbatim for all route guards. No server-side binding to a verified identity, no signature, no CSRF.

Combined with localStorage-stored real API keys/tokens, any site that can induce the victim to visit a page that sets the cookie can bypass UI route protection and exfiltrate keys.

**Remediation:**
- Replace role cookie with a signed, short-lived session token bound to verified login (Supabase session or verified API key exchange).
- Add SameSite=Strict + CSRF token for the session setter.
- Middleware must validate signature + map to actual identity.

### C3 — Global `DC1_HMAC_SECRET` distributed to every provider daemon
**File:** `backend/src/routes/providers.js:3531-3540` (and `installers/dcp_daemon.py` template)

Daemon download endpoint injects the single platform-wide secret used for heartbeat, task_spec, and job HMAC signatures.

One compromised or malicious provider key → download → extract secret → forge provider heartbeats, manipulate marketplace presence, or tamper with billing proofs.

**Remediation:**
- Stop embedding global secret.
- Per-provider signing keys (or switch to asymmetric: server signs jobs with private key; daemons verify with public).
- Immediate rotation of `DC1_HMAC_SECRET` if any provider key was ever exposed.

### C4 — Live production renter API key committed in repository
**Files:**
- `scripts/benchmark-openrouter-spec.py:14`
- `scripts/gate0-loadtest.py:16`
- `scripts/benchmark-investor-pitch.py:14`
- `scripts/benchmark-provider-faq.py:14`

Same key as reported 5 days ago.

**Remediation:**
- Delete/rotate immediately.
- Replace all with env-driven keys or throw on missing.
- Add pre-commit / CI secret scan (gitleaks/trufflehog) + ban this pattern.

---

## High Findings (Current)

### H1 — Renter master + scoped keys stored in plaintext (providers improved)
- Master keys: `renters.api_key` column, direct equality lookup.
- Scoped: `renter_api_keys.key` stored + selected in plaintext (v1.js:149, renters.js:1171).
- Provider side now uses `provider_api_keys.key_hash` + prefix + SHA-256 (good).

Compromise of DB/backup/SQLite file (backups/ dir contains historical .db.gz) yields all renter credentials.

**Remediation:** Hash renter keys at rest (same pattern as providers). Rotate on migration.

### H2 — API keys accepted via query parameters on multiple paths
`getRenterKey` in v1.js still falls back to `req.query.key`. Multiple scripts and even some components (`JobSubmitForm.tsx`) continue to use `?key=`.

Access logs, proxies, browser history, Referer leaks.

**Remediation:** Enforce header-only for production; deprecate query support with clear errors; update all SDKs/clients/docs.

### H3 — Credentials in browser localStorage
`lib/api.ts`, `app/lib/auth.ts`, dashboard pages, provider/renter UIs continue to persist `dc1_renter_key`, `dc1_provider_key`, `dc1_admin_token` in localStorage.

Any XSS on dcp.sa (or subdomain) or malicious extension gives full account takeover + spending power.

**Remediation:** Prefer httpOnly session cookies for UI; use short-lived JWTs or one-time exchange tokens for dashboard operations. Keep long-lived keys out of JS-accessible storage.

### H4 — v1 billing pre-check + debit remains non-atomic / best-effort
- Pre-check uses stale `req.renter.balance_halala` snapshot (line ~1296).
- `debitRenterSafe` (1265) performs UPDATE with guard but ignores row count and runs in best-effort try/catch.
- Concurrent low-balance requests can both pass check → over-spend or negative.

Also seen at ~1699.

**Remediation:** Hold/reserve credits in a DB transaction before dispatching inference; fail the request if the UPDATE affected 0 rows; re-validate inside tx.

### H5 — Reconciliation endpoints remain unauthenticated
`backend/src/routes/reconciliation.js` (summary, jobs, discrepancies, report, verify) — no `requireAdminAuth`, no key checks.

Publicly exposes revenue, margins, per-job provider payouts, discrepancies.

**Remediation:** Mount under admin auth (like `intelligence.js`).

### H6 — Mission Control token with public fallback + committed defaults
`lib/api.ts:30`, `orchestration/failover/*.py`, multiple READMEs, `app/api/security/route.ts` still default to or document `dc1-mc-gate0-2026`.

**Remediation:** Remove all fallbacks; fail hard if unset; rotate token; treat as secret.

### H7 — Heartbeat HMAC enforcement still opt-in
`providers.js:783`: `const requireHmac = process.env.DC1_REQUIRE_HEARTBEAT_HMAC === '1';` — else only warn.

Fake GPU availability / spoof status possible with a valid provider key alone.

**Remediation:** Default to `=1` in production; keep opt-out only for very short migration windows.

### H8 — Default configuration points at bare VPS IP over HTTP
`.env.example`, `next.config.js`, `lib/api.ts`, many docs and scripts default `BACKEND_URL` / `NEXT_PUBLIC_DC1_API` / proxy to `http://76.13.179.86:8083`.

Keys and tokens traverse in cleartext if envs not overridden.

**Remediation:** Default to `https://api.dcp.sa`; fail hard or warn loudly on HTTP in non-dev; update all examples.

### H9 — Outdated / vulnerable dependencies
Backend (npm audit): high-severity `@grpc/grpc-js` (crash), multiple jest-related, protobuf transitive risks.  
Frontend: high in `eslint-config-next` / glob (command injection in tooling), brace-expansion DoS.

Next.js 14.x series carries known RSC/middleware issues.

**Remediation:** `npm audit fix` + targeted upgrades; pin grpc >=1.14.4+; upgrade Next.js to current stable after compatibility testing (consider 15/16); add SCA in CI.

---

## Medium / Informational (selected)

- CORS still allows missing Origin (necessary for daemons but increases risk surface).
- Swagger UI still loads from unpkg CDN.
- `curl | bash` installer still accepts second positional arg as API_BASE override.
- Installers served statically (expected for self-serve, increases reverse-engineering surface).
- Supabase anon key appears in committed `.env.example` (verify RLS is strict on prod project).
- `GET /v1/models` unauthenticated (low risk).
- Many docs and AGENT_LOG / handover files still contain example IPs, tokens, and curl commands with placeholders.
- New scoped key issuance still uses plaintext storage and master-key auth to list/create (acceptable short term but compounds H1).

---

## Positive Controls (reconfirmed + new)

- Startup guard on `DC1_ADMIN_TOKEN` / `DC1_HMAC_SECRET` placeholders.
- `timingSafeEqual` for admin + Moyasar webhook.
- Tiered rate limiters on login/registration/heartbeat/job submit.
- Security headers + trust-proxy hardening in server.js.
- Webhook SSRF validation middleware.
- Provider login-email disabled.
- OTP flow via Supabase for UI.
- Parameterized SQL everywhere.
- Container launch: NetworkMode none, security opts, image allowlist + optional digest pin.
- Provider credential hashing + revocation support (new since prior review).
- Expanded admin audit + RBAC scaffolding.
- PDPL breach procedure documented in SECURITY.md.

---

## Prioritized Remediation (Updated for 06-28)

### P0 — Immediate (today / this weekend)

1. **Disable** `POST /api/renters/login-email` (return 410 + instructions, exactly like providers).
2. **Rotate** the committed renter key + any keys obtained via login-email.
3. **Rotate** `DC1_HMAC_SECRET` (and MC token) after fixing daemon injection.
4. **Stop injecting** global HMAC into `download/daemon`; implement per-provider or asymmetric signing.
5. **Add `requireAdminAuth`** (or `isAdminRequest`) to all routes in `reconciliation.js`.
6. **Set** `DC1_REQUIRE_HEARTBEAT_HMAC=1` on the production VPS + daemons.
7. Remove or guard the 4 scripts containing the live renter key (env var + CI fail).

### P1 — This week

1. Hash renter master keys + `renter_api_keys.key` at rest + migration + rotate.
2. Make billing debit fully transactional + fail closed (check affected rows inside tx).
3. Remove `?key=` fallback from `getRenterKey` (v1 + rag) after client migration; reject in production.
4. Remove all `dc1-mc-gate0-2026` and IP fallbacks; fail fast on missing secrets.
5. Default `BACKEND_URL` etc. to `https://api.dcp.sa`; add build-time/production guard against HTTP.
6. Upgrade critical deps (grpc, Next tooling, etc.); schedule full Next.js upgrade.
7. Move dashboard auth away from localStorage + raw role cookie (httpOnly signed sessions).
8. Pin `API_BASE` inside install.sh + add checksums for daemon downloads.
9. Add secret scanning (gitleaks) + banlist for known bad keys in CI.

### P2 — Next sprint / Q3 items

- MFA / short-lived admin tokens.
- Self-host Swagger assets.
- Enforce image digest pinning by default.
- Saudi residency migration (PDPL data location).
- Full pen-test focused on concurrent billing + provider spoofing.
- Renter key hashing migration complete + key rotation policy.
- WAF / geo + rate rules for admin surface.

---

## Verification Recommendations

- Controlled test: `curl -X POST https://api.dcp.sa/api/renters/login-email -d '{"email":"..."}'` should return 410.
- Confirm reconciliation endpoints now 401 without admin token.
- Confirm daemon download no longer contains the real `DC1_HMAC_SECRET`.
- Run `grep -r 'dc1-renter-03ab6169' . --include='*.py' --include='*.js'` in clean checkout.
- Load test concurrent low-balance `/v1/chat/completions` and verify no over-spend.
- `npm audit` after upgrades; gate on high+.

---

**Note:** Production VPS reportedly lagged the source tree in the prior review (code ~March). Re-verify live behavior with non-destructive tests only after the above P0 patches.

If desired, I can implement the P0 code changes (disable renter login-email, protect reconciliation, remove the hardcoded key usage, harden session setter) in a follow-up.

Report generated by automated + manual code + config review of current workspace state.