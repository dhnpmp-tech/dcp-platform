# DCP Security Review — 2026-07-22

**Codebase:** `/home/tareqa/dc1-platform` (main @ `d1a59de1`)
**Prior reviews:** `DCP-SECURITY-REVIEW-2026-06-23.md`, `DCP-SECURITY-REVIEW-2026-06-28.md`
**Method:** Parallel review of auth/session, secret distribution, and admin/billing/injection surfaces, plus dependency audit and direct code verification of each finding.

**Overall risk: CRITICAL** — three P0 authentication/financial-exposure issues remain live from prior reviews; one new fully-unauthenticated financial endpoint identified.

---

## Delta since 2026-06-28

**Fixed (genuine progress):**
- Provider `/login-email` disabled → HTTP 410 (DCP-896)
- Provider keys migrated to SHA-256 hashing + `timingSafeEqual` (`apiKeyService.js`)
- Admin RBAC middleware expanded (`requireAdminRbac`); heartbeat HMAC enforcement gate added
- CORS locked to explicit allowlist; auth/OTP endpoints rate-limited
- No SQL / command / path-traversal injection found anywhere in backend routes

**Still live (unchanged from June):** C1 renter login, C2 session cookie, C3 HMAC leak, C4 hardcoded key, renter plaintext keys.

---

## CRITICAL

### C1 — Renter `/login-email` returns full API key with only an email
`backend/src/routes/renters.js:1051-1077` — **LIVE**
Endpoint accepts only `email` and returns `renter.api_key`, which carries full `admin` scope (`getRenterAuthContext:199`). No OTP. Anyone who knows/guesses a renter email gets a fully-privileged key (balance drain, `/v1/chat/completions`, job history, webhook registration).
The provider equivalent was fixed (410, `providers.js:632-637`); the fix was never mirrored to renters, even though a proper OTP flow already exists (`/send-otp` + `/verify-otp`, `renters.js:986-1049`).
**Fix:** replicate the provider 410 stub. Rotate any keys ever obtained via this path.

### C2 — Reconciliation endpoints fully unauthenticated (NEW this review)
`backend/src/routes/reconciliation.js:11-81`, mounted at `/api/reconciliation` (`server.js:506`) — **LIVE**
All 5 endpoints have zero auth middleware, exposing platform financials to any caller:
- `GET /summary` — `totalCollectedHalala`, `totalPaidHalala`, `dc1MarginHalala` (full revenue + margin)
- `GET /jobs`, `GET /discrepancies`, `GET /report` — per-job billing breakdown
- `POST /verify/:job_id` — state/verification trigger
Sibling routes gate correctly (`admin.js:59 router.use(requireAdminRbac)`), so this is an omission.
**Fix:** add `router.use(requireAdminRbac)` (or `requireAdminAuth`) at the top of the file.

### C3 — Global shared HMAC secret injected into every daemon download
`backend/src/routes/providers.js:3534-3538` (Python daemon route) — **LIVE**
```js
const hmacSecret = process.env.DC1_HMAC_SECRET || '';
let injected = script
    .replace('HMAC_SECRET = "{{HMAC_SECRET}}"', `HMAC_SECRET = "${hmacSecret}"`)
```
Every provider who hits `GET /api/providers/download/daemon` receives the **same** global secret. The server uses that same secret to validate heartbeats (`providers.js:87-105`) and task-spec signatures — so any provider can forge signed heartbeats/task-specs for any other provider. Architecture flaw (needs per-provider derived keys), not just exposure.
Note: the shell `/setup` route (`providers.js:1578`) injects only the provider's own API key — it is not affected. C3 is via the Python daemon route only.
**Fix:** derive a per-provider HMAC key (e.g. HKDF of a master secret + provider id) so a leaked provider key cannot forge for others.

### C4 — Hardcoded live renter API key committed
`dc1-renter-03ab6169e4a205e7e98bfff9206b49fb` — **LIVE**, in:
- `scripts/benchmark-provider-faq.py:14`
- `scripts/benchmark-openrouter-spec.py:14`
- `scripts/benchmark-investor-pitch.py:14`
- `scripts/gate0-loadtest.py:16`
Flagged in both June reviews; still not rotated. Also echoed in the review docs themselves.
**Fix:** rotate the key immediately, then replace with an env var in the scripts.

---

## HIGH

### H1 — Client-forgeable `__dc1_session` cookie + unauthenticated session set
`app/api/session/route.ts:25`, `middleware.ts:26` — **LIVE**
`POST /api/session` requires no proof of auth — it accepts any JSON `{role}` in `{provider,renter,admin}` and sets the cookie. The cookie value is the raw, unsigned role string; middleware trusts it verbatim. A client can `POST {"role":"admin"}` or send `Cookie: __dc1_session=admin` directly (`httpOnly` blocks JS reads, not crafted requests). Defeats the entire frontend authz layer for `/admin/*`, `/provider/*`, `/renter/*`. Blast radius limited because backend APIs still require API keys.
**Fix:** set the cookie only after verifying a real credential; sign it (HMAC/JWT) or use a server-side session lookup; verify the signature in middleware.

### H2 — Renter API keys stored and queried in plaintext
`backend/src/routes/renters.js:379-385` (master), `1168-1174` (sub-keys) — **LIVE**
Keys generated and stored raw; looked up with non-timing-safe SQL equality (`WHERE api_key = ?`); echoed back on login. Any DB read (SQL injection, backup leak, the `dcp.db` file on the VPS) yields every renter's usable credential. Providers were migrated to hashing; renters were not. Compounds C1.
**Fix:** hash renter keys (mirror `apiKeyService.js`): store SHA-256 + plaintext prefix for lookup, verify with `timingSafeEqual`, return raw key once at issuance.

### H3 — Best-effort, silently-skippable inference debit
`backend/src/routes/v1.js:1265-1270` (and non-proxy path at `1699`) — **LIVE**
```js
const debitRenterSafe = (costHalala) => {
  try {
    db.prepare('UPDATE renters SET balance_halala = balance_halala - ? ... WHERE id = ? AND balance_halala >= ?')
      .run(costHalala, ..., req.renter.id, costHalala);
  } catch (_) { /* best-effort */ }
};
```
(a) The `WHERE balance_halala >= ?` guard makes the `UPDATE` match 0 rows when cost exceeds balance — but the inference was already served, so the renter is **not billed** (free inference on any overrun). (b) `catch(_){}` swallows DB errors, so a failed debit still returns success. No rowcount check.
**Fix:** check `changes` on the update; if 0, treat as a billing failure (reject/flag), don't serve-then-drop.

### H4 — TOCTOU on balance check vs debit
`backend/src/routes/v1.js:1296` (check) vs `1267`/`1699` (debit) — **LIVE**
Pre-flight check reads the stale balance snapshot loaded at auth time (`v1.js:148/177`) and compares against `estimatedCostHalala` (fallback per-minute rate), while the actual debit bills at token rate. Concurrent requests for one renter all pass the same stale check; the atomic `>= ?` guard then silently drops the debits that would go negative (see H3) = unbilled concurrent usage. Provider/renter total-spend updates (`1401-1408`, `1571-1578`) run outside the atomic debit and can diverge.
**Fix:** perform the balance check and debit atomically on the same amount inside one transaction; reserve/hold on the freshly-read balance.

### H5 — Vulnerable dependencies
`npm audit` (production): **backend** 1 critical + 3 high, **root** 2 high.
- CRITICAL `protobufjs` — arbitrary code execution / prototype pollution
- HIGH `ws` — uninitialized memory disclosure, DoS
- HIGH `sharp`/libvips — CVE-2026-33327/33328/35590/35591
- HIGH `@grpc/grpc-js` — malformed-request crash
**Fix:** `npm audit fix` where non-breaking; pin/upgrade protobufjs, ws, sharp, grpc-js.

---

## MEDIUM

- **M1 — `recovery.js:194`** `POST /resolve/:event_id` (state-changing) and info GETs unauthenticated (`/api/recovery`). Add admin gate.
- **M2 — Plaintext HTTP bare-IP defaults** — `next.config.js:2` (`http://76.13.179.86:8083`), `.env.example` (`BACKEND_URL`, `NEXT_PUBLIC_DC1_API`, `NEXT_PUBLIC_MC_URL`). Default to `https://api.dcp.sa`.

## LOW

- **L1 — `fallback.js:8-41`** `/status`, `/bottlenecks`, `/disconnects`, `POST /simulate` unauthenticated (info disclosure + simulate trigger).
- **L2 — `standup.js:143`** `GET /latest` unauthenticated internal data (POST /run is MC_TOKEN-gated).
- **L3 — Expired reactivation JWT** committed in `docs/reports/reliability/dcp-578-reactivation-proof-20260404T093916Z.json:4` (expired, low risk).
- **L4 — Legacy plaintext provider column** — `providers.js:614` still returns `provider.api_key` from the legacy `providers.api_key` column in `/verify-otp`, coexisting with the hashed `apiKeyService`.

---

## Verified clean

- **SQL injection:** none — all dynamic SQL uses `?` placeholders or integer-validated interpolation; dynamic `WHERE`/`SET` clauses built from code-controlled literals with bound values.
- **Command injection:** none — only `spawn(execPath, [args], ...)` with an argument array (no shell) in `p2p-discovery.js:405`.
- **Path traversal:** none — no `sendFile`/`download`/`createReadStream` driven by request input; static serving is a fixed dir.
- **CORS:** locked to explicit allowlist; localhost only in non-production; origin-less (server-to-server) allowed by design.
- **Rate limiting:** OTP/login/registration/admin/payments/heartbeat/job-submit all limited.

---

## Prioritized remediation

| # | Action | Effort |
|---|--------|--------|
| 1 | Disable renter `/login-email` (410) + rotate exposed renter keys (C1) | trivial |
| 2 | Add `requireAdminRbac` to `reconciliation.js` (C2) | trivial |
| 3 | Rotate `dc1-renter-03ab...` and env-var the 4 scripts (C4) | trivial |
| 4 | Per-provider derived HMAC keys; stop shipping global secret (C3) | medium |
| 5 | Fix v1 debit: rowcount check + atomic check-and-debit (H3, H4) | medium |
| 6 | Sign/verify `__dc1_session`; auth-gate `POST /api/session` (H1) | medium |
| 7 | Hash renter keys (mirror apiKeyService) (H2) | medium |
| 8 | `npm audit fix` + upgrade protobufjs/ws/sharp/grpc-js (H5) | low |
| 9 | Auth-gate recovery/fallback/standup; HTTPS defaults (M1, M2, L1, L2) | low |

*Note: no files were modified during this review. Nothing was deployed or changed on the production VPS.*
