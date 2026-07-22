# DCP.sa Security Review — `/home/tareqa/dc1-platform`

**Overall risk rating: CRITICAL**

The platform has solid security intent in several backend layers (rate limiting, Moyasar webhook HMAC, parameterized SQL, CORS allowlist), but multiple **authentication bypasses** and **secret exposure** paths are still live in source. The highest-risk issues can lead to full account takeover, unauthorized dashboard access, and platform-wide cryptographic secret leakage.

---

## Executive Summary

| Area | Status |
|------|--------|
| Auth / session | **Critical** — email-only renter login, forgeable session cookie |
| API keys | **High** — plaintext in DB, query params, localStorage |
| Payments | **Medium** — webhook handling is sound; some financial endpoints unauthenticated |
| v1 inference / billing | **High** — TOCTOU balance checks, silent debit failures |
| Infrastructure | **High** — VPS IP/HTTP defaults, hardcoded tokens in repo |
| Provider daemon | **Critical** — global `DC1_HMAC_SECRET` injected into every daemon download |
| Dependencies | **High** — Next.js + backend transitive CVEs |

**Positive:** Provider `/login-email` was disabled (DCP-896). Renter login UI uses OTP. Moyasar webhooks verify HMAC. Backend startup fails on placeholder secrets. Admin auth uses `timingSafeEqual`.

---

## Critical Findings

### C1 — Renter email login returns full API key without verification
**File:** `backend/src/routes/renters.js:1051-1087`

```1051:1087:backend/src/routes/renters.js
router.post('/login-email', loginEmailLimiter, async (req, res) => {
  // ...
  res.json({
    success: true,
    api_key: renter.api_key,
    renter: { /* ... */ }
  });
});
```

**Description:** `POST /api/renters/login-email` returns the master API key when given only an email. No OTP, password, or Supabase verification.

**Exploit:** Provider path was fixed in DCP-896 (`providers.js:632-637` returns 410). Renter path was not:

```bash
curl -X POST https://api.dcp.sa/api/renters/login-email \
  -H "Content-Type: application/json" \
  -d '{"email":"victim@company.com"}'
# → full dc1-renter-* key → wallet drain, inference abuse, data export
```

**Remediation:** Disable like providers (return 410). Force `/send-otp` + `/verify-otp` only. Rotate all keys for accounts ever using this endpoint.

---

### C2 — Session cookie is client-forgeable (no server-side auth binding)
**Files:** `app/api/session/route.ts:11-32`, `middleware.ts:26-40`, `app/lib/auth.ts:19-24`

```11:32:app/api/session/route.ts
export async function POST(request: NextRequest) {
  const { role } = body
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  response.cookies.set(SESSION_COOKIE, role, { httpOnly: true, ... })
}
```

```26:40:middleware.ts
const role = request.cookies.get(SESSION_COOKIE)?.value
if (pathname.startsWith('/admin')) {
  if (role !== 'admin') { return buildLoginRedirect(request, 'admin') }
}
```

**Description:** Any client can `POST /api/session` with `{ "role": "admin" }` — no credential check, no CSRF token. Middleware trusts the cookie alone.

**Exploit:**
1. Victim visits attacker page that POSTs to `https://dcp.sa/api/session` with `role: "provider"`.
2. Victim navigates to `/provider/*` → middleware allows access.
3. Admin UI also checks `localStorage` token (`app/admin/page.tsx:143-144`), but middleware still exposes protected route shells and any page that skips token checks.

**Remediation:**
- Bind session to verified backend auth (signed JWT with renter/provider/admin ID).
- Require server-side proof before setting cookie (OTP exchange, API key validation).
- Add CSRF protection (SameSite=Strict + CSRF token for POST).
- Middleware should validate session signature, not raw role string.

---

### C3 — Platform HMAC secret embedded in every provider daemon download
**File:** `backend/src/routes/providers.js:3531-3540`

```3531:3540:backend/src/routes/providers.js
const hmacSecret = process.env.DC1_HMAC_SECRET || '';
let injected = script
    .replace('API_KEY = "{{API_KEY}}"', `API_KEY = "${cleanKey}"`)
    .replace('HMAC_SECRET = "{{HMAC_SECRET}}"', `HMAC_SECRET = "${hmacSecret}"`)
```

**Description:** `GET /api/providers/download/daemon?key=<provider_key>` injects the **global** `DC1_HMAC_SECRET` into Python served to every provider. One compromised provider key leaks the platform-wide signing secret.

**Exploit:** Provider downloads daemon → extracts `HMAC_SECRET` → forges heartbeat signatures, job `task_spec` HMACs, or other HMAC-gated operations platform-wide.

**Remediation:**
- Never distribute global secrets to providers.
- Use per-provider HMAC keys stored hashed server-side.
- Sign jobs with asymmetric crypto (server private key, daemon public key).
- Rotate `DC1_HMAC_SECRET` immediately if any provider key was exposed.

---

### C4 — Hardcoded live renter API key in repository scripts
**Files:** `scripts/benchmark-openrouter-spec.py:14`, `scripts/gate0-loadtest.py:16`, `scripts/benchmark-investor-pitch.py:14`, `scripts/benchmark-provider-faq.py:14`

```14:14:scripts/benchmark-openrouter-spec.py
API_KEY = "dc1-renter-03ab6169e4a205e7e98bfff9206b49fb"
```

**Exploit:** Anyone with repo access (or if public) can use this key against production `/v1/chat/completions` and drain balance.

**Remediation:** Remove keys, use env vars, rotate the exposed key immediately, scan git history.

---

## High Findings

### H1 — Plaintext API key storage in SQLite
**File:** `backend/src/routes/renters.js:379-385`

```379:385:backend/src/routes/renters.js
const api_key = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
// INSERT INTO renters (..., api_key, ...)
```

Keys stored and compared in plaintext (`renters.api_key`, `renter_api_keys.key`). DB backup/SQLite file compromise = full credential exposure.

**Remediation:** Store `SHA-256(key + pepper)`; show key once at creation; use constant-time compare.

---

### H2 — API keys in URL query parameters (logged, cached, referrered)
**Files:** `backend/src/routes/v1.js:67-76`, `backend/src/server.js:232-236`, widespread frontend usage

```67:76:backend/src/routes/v1.js
const query = normalizeString(req.query.key, { maxLen: 128, trim: false });
return header || query || null;
```

Query-param rejection is **commented out** in `server.js:232-236`. Keys appear in access logs, browser history, Referer headers.

**Remediation:** Re-enable `rejectRenterQueryParamKey` after frontend migration; reject `?key=` on `/v1/*`; migrate SDK (`sdk/node/src/http.ts` documents query-param requirement).

---

### H3 — API keys in browser localStorage (XSS = full account compromise)
**Files:** `lib/api.ts:36-51`, `app/login/page.tsx:133-170`, 30+ admin/provider/renter pages

```36:51:lib/api.ts
export function getAdminToken(): string | null {
  return localStorage.getItem('dc1_admin_token')
}
export function getRenterKey(): string | null {
  return localStorage.getItem('dc1_renter_key')
}
```

Any XSS on `dcp.sa` exfiltrates renter, provider, and admin credentials.

**Remediation:** httpOnly cookies for dashboard sessions; keep API keys out of localStorage; short-lived tokens for UI.

---

### H4 — v1 inference billing TOCTOU / silent debit failure
**File:** `backend/src/routes/v1.js:1296-1304, 1265-1270, 1699-1700`

```1296:1304:backend/src/routes/v1.js
if (Number(req.renter.balance_halala || 0) < estimatedCostHalala) {
  return sendV1Error(res, { status: 402, ... });
}
```

```1265:1270:backend/src/routes/v1.js
const debitRenterSafe = (costHalala) => {
  try {
    db.prepare('UPDATE renters SET balance_halala = balance_halala - ? ... AND balance_halala >= ?')
      .run(costHalala, ..., req.renter.id, costHalala);
  } catch (_) { /* best-effort */ }
};
```

**Issues:**
1. Balance checked from stale `req.renter.balance_halala` at auth time.
2. `debitRenterSafe` ignores whether UPDATE affected rows.
3. Concurrent requests can both pass pre-check → negative balance / free inference.

**Exploit:** Parallel `/v1/chat/completions` with low balance; some complete without successful debit.

**Remediation:** Atomic `debitCredits()` in transaction; fail request if `changes === 0`; re-read balance inside transaction; hold credits before inference.

---

### H5 — Unauthenticated financial reconciliation endpoints
**File:** `backend/src/routes/reconciliation.js:11-80`

All routes lack `requireAdminAuth`:
- `GET /api/reconciliation/summary` — revenue, margins, discrepancies
- `GET /api/reconciliation/jobs` — all completed job billing
- `GET /api/reconciliation/report` — full report

**Exploit:** `curl https://api.dcp.sa/api/reconciliation/summary` exposes business financials.

**Remediation:** Add `requireAdminAuth` to entire router (compare `intelligence.js:6` which does this correctly).

---

### H6 — Hardcoded Mission Control token with public fallback
**File:** `lib/api.ts:29-30`

```29:30:lib/api.ts
export function getMcToken(): string {
  return process.env.NEXT_PUBLIC_MC_TOKEN || 'dc1-mc-gate0-2026';
}
```

Also in `orchestration/failover/controller.py:25`, `orchestration/setup/daemon.sh:19`, multiple READMEs.

**Exploit:** Default token may authenticate to MC API on `76.13.179.86:8084`.

**Remediation:** Remove fallback; fail if unset; rotate token; never use `NEXT_PUBLIC_*` for secrets.

---

### H7 — Heartbeat HMAC enforcement disabled by default
**File:** `backend/src/routes/providers.js:783-792`

```783:792:backend/src/routes/providers.js
const requireHmac = process.env.DC1_REQUIRE_HEARTBEAT_HMAC === '1';
if (!hmacResult.valid) {
  if (requireHmac) { return res.status(401)... }
  console.warn(`[providers/heartbeat] HMAC warning (enforcement disabled)`);
}
```

Valid provider API key alone can spoof GPU telemetry, fake online status, manipulate marketplace.

**Remediation:** Set `DC1_REQUIRE_HEARTBEAT_HMAC=1` in production; reject heartbeats without valid signature.

---

### H8 — Infrastructure defaults expose raw VPS over HTTP
**Files:** `next.config.js:2`, `.env.example:10-16`, `app/api/dc1/[...path]/route.ts:3`

```2:2:next.config.js
const backendUrl = process.env.BACKEND_URL || 'http://76.13.179.86:8083';
```

Default backend is bare IP + HTTP. API keys and admin tokens traverse unencrypted if env vars unset.

**Remediation:** Default to `https://api.dcp.sa`; fail build if `BACKEND_URL` is HTTP in production.

---

### H9 — Dependency vulnerabilities (verified via `npm audit`)
**Frontend** (`package.json`): Next.js 14.2.x — multiple **high** CVEs (RSC DoS, rewrite smuggling, middleware cache poisoning). 9 total vulns.

**Backend**: **31** vulns including **critical** `protobufjs` (arbitrary code execution), high `ws`, `form-data`, `qs`.

**Remediation:** Upgrade Next.js to ≥15.5.16 (or 16.x after testing); backend `npm audit fix`; pin/upgrade protobufjs chain.

---

## Medium Findings

### M1 — CORS allows requests with no `Origin` header
**File:** `backend/src/server.js:109-111`

```109:111:backend/src/server.js
if (!origin) return callback(null, true);
```

Server-to-server/curl bypasses CORS — expected for daemons, but enables CSRF-like attacks from non-browser clients without origin checks.

---

### M2 — Swagger UI loads scripts from unpkg CDN
**File:** `backend/src/server.js:812-850`

Serves HTML loading `unpkg.com/swagger-ui-dist@5`. Supply-chain risk if CDN compromised.

---

### M3 — `curl | bash` installer with overridable API base
**File:** `backend/public/install.sh:45-47`

```45:47:backend/public/install.sh
if [ -n "${2:-}" ]; then
  API_BASE="${2}"
fi
```

Combined with `curl dcp.sa/install | bash`, MITM or malicious mirror can redirect providers to attacker-controlled API and harvest registration credentials.

**Remediation:** Pin `API_BASE` to `https://api.dcp.sa`; verify TLS; distribute checksums.

---

### M4 — Installers served as static files
**File:** `backend/src/server.js:383`

`app.use('/installers', express.static(...))` — public access to daemon source (expected for open-source model, but aids reverse-engineering of security controls).

---

### M5 — Admin dashboard proxy fetches some endpoints without auth
**File:** `app/api/admin/dashboard/route.ts:34-42, 71-75`

`safeFetch` hits `/api/reconciliation/summary` and `/api/intelligence/fleet` without forwarding admin token. Reconciliation works unauthenticated (H5); intelligence correctly requires auth and returns null.

---

### M6 — Supabase anon key in `.env.example`
**File:** `.env.example:6-7`

```
NEXT_PUBLIC_SUPABASE_URL=https://fvvxqp-qqjszv6vweybvjfpc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_fQ3SU27BygDby6WzWkjRtA_lQ3C994x
```

If this is a real project key, it is committed. Verify RLS policies are strict.

---

### M7 — `GET /v1/models` is unauthenticated
**File:** `backend/src/routes/v1.js:441`

Public model catalog + pricing metadata. Low direct risk; aids reconnaissance.

---

### M8 — Payment verify endpoint can credit balance on poll (by design)
**File:** `backend/src/routes/payments.js:618-629`

`/api/payments/verify/:paymentId` syncs paid status from Moyasar. Protected by renter key ownership — acceptable if Moyasar is trusted source.

---

## Low / Informational

| ID | Finding | Location |
|----|---------|----------|
| L1 | Session cookie `secure` only in production (`route.ts:30`) — correct | `app/api/session/route.ts` |
| L2 | No MFA for admin token (acknowledged in `SECURITY.md:91`) | `SECURITY.md` |
| L3 | VPS outside Saudi Arabia (PDPL residency risk, documented) | `SECURITY.md:92` |
| L4 | `express.json({ limit: '50mb' })` — large body DoS vector | `server.js:141` |
| L5 | Test scripts disable rate limiting (`security.test.js:9`) | Tests only |
| L6 | Privacy page acknowledges localStorage API key storage | `app/privacy/page.tsx:153` |
| L7 | P2P bootstrap IP in `.env.example` comments | `backend/.env.example:27-28` |

---

## Positive Security Controls Already in Place

1. **Startup secret guard** — exits if `DC1_ADMIN_TOKEN` / `DC1_HMAC_SECRET` are placeholders (`server.js:28-38`)
2. **Admin auth** — `timingSafeEqual` comparison (`middleware/auth.js:31-37`)
3. **Moyasar webhook HMAC** — `timingSafeEqual`, idempotent payment crediting (`payments.js:134-176`)
4. **Rate limiting** — tiered per-key/IP, login limits 10/15min (`server.js:255-370`)
5. **Security headers on API** — HSTS, CSP, CORP, COOP (`server.js:145-168`)
6. **Webhook SSRF protection** — `validateWebhookUrl` middleware on renter webhooks (`renters.js:2254`)
7. **Provider login-email disabled** — DCP-896 fix (`providers.js:632-637`)
8. **OTP login flow** — Supabase OTP for renters/providers in UI (`app/login/page.tsx:95-144`)
9. **Sandbox topup gated** — production returns 403 (`payments.js:378-383`, `renters.js:842-844`)
10. **Parameterized SQL** — consistent `db.prepare()` usage
11. **Trust proxy hardening** — explicit hop count (`server.js:42-49`)
12. **VS Code extension** — SecretStorage for keys (`vscode-extension/README.md:76-77`)
13. **PDPL procedures** — documented breach response (`SECURITY.md:30-55`)

---

## Prioritized Remediation Roadmap

### P0 — Immediate (today)

| # | Action | Owner |
|---|--------|-------|
| 1 | **Disable** `POST /api/renters/login-email` (mirror DCP-896) | Backend |
| 2 | **Rotate** exposed key `dc1-renter-03ab6169...` and audit usage | Ops |
| 3 | **Rotate** `DC1_HMAC_SECRET` + `dc1-mc-gate0-2026` if ever used in prod | Ops |
| 4 | **Stop injecting** global HMAC into daemon downloads; deploy per-provider keys | Backend |
| 5 | **Fix session auth** — require verified login before setting `__dc1_session` | Frontend + Backend |
| 6 | **Add `requireAdminAuth`** to `reconciliation.js` router | Backend |
| 7 | **Set** `DC1_REQUIRE_HEARTBEAT_HMAC=1` on VPS | DevOps |

### P1 — This sprint

| # | Action |
|---|--------|
| 1 | Hash API keys at rest; migration for existing keys |
| 2 | Fix v1 billing atomicity (transactional debit + fail on `changes===0`) |
| 3 | Remove `?key=` support on `/v1/*` and re-enable query-param rejection |
| 4 | Remove hardcoded MC token fallback from `lib/api.ts` |
| 5 | Default `BACKEND_URL` to HTTPS domain; remove IP from `next.config.js` default |
| 6 | Upgrade Next.js + run backend `npm audit fix` |
| 7 | Move dashboard credentials from localStorage to httpOnly session |
| 8 | Pin install.sh `API_BASE`; add checksum verification for daemon downloads |

### P2 — Next sprint

| # | Action |
|---|--------|
| 1 | MFA for admin operations |
| 2 | Self-host Swagger UI assets (no unpkg CDN) |
| 3 | Saudi data residency migration (PDPL) |
| 4 | WAF / IP allowlist for admin API |
| 5 | Security regression tests for login-email + session forgery |
| 6 | Penetration test of `/v1/chat/completions` billing under concurrency |
| 7 | Review Supabase RLS + rotate anon key if `.env.example` values are real |

---

## Verification Notes

- Provider `/login-email` bypass: **fixed** (returns 410).
- Renter `/login-email` bypass: **still active** in current source.
- Frontend login page uses OTP, but endpoint remains callable directly.
- Production VPS reportedly runs **~2026-03-14 code** per `2026-03-19-deployment-status.md` — some fixes may not be deployed; verify live with controlled tests only.

If you want, I can implement the P0 fixes (disable renter `login-email`, add reconciliation auth, harden session route) in a follow-up patch.