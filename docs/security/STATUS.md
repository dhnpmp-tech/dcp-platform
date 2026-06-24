# DCP Security — STATUS (single source of truth)

> Update this file at the END of every audit/fix. Run `/dcp-security-audit` to re-audit.
> **Last audit:** 2026-06-23 (Tito/Croc baseline) · **Last updated:** 2026-06-24 · **Overall posture:** all exploitable-today findings CLOSED + verified live; remainder STAGED with runbooks.

## Legend
✅ FIXED-LIVE (verified) · 🟢 ALREADY-FIXED (was stale in audit) · 🟡 STAGED (runbook, phased) · 🔴 OPEN · ⚪ ACCEPTED-RISK

## Dashboard
| ID | Sev | Title | Status | Where / verified |
|----|-----|-------|--------|------------------|
| C1 | crit | Renter `/login-email` returns master key | ✅ | renters.js → 410; `POST /api/renters/login-email`=410 (2026-06-24) |
| C2 | crit | Forgeable session cookie | ✅ | core already HMAC-signed; +SameSite=strict; live dcp.sa `__dc1_session` signed+strict (2026-06-24) |
| C3 | crit | Global HMAC secret in every daemon | 🟡 | runbooks/per-provider-taskspec…md — 6-phase, fleet-critical, multi-day. NOT started. |
| C4 | crit | Live renter key hardcoded in scripts | ✅ | key rotated dead (0 rows); scripts env-read (2026-06-24) |
| H1 | high | Plaintext API keys at rest | 🟡 | runbooks/…key-at-rest-hashing.md — phases 0-3 ok, Phase-4 drop hard-blocked |
| H2 | high | API keys in `?key=` | ✅ | gated reject behind `DC1_REJECT_QUERY_KEYS` (OFF; control wired) (2026-06-24) |
| H3 | high | API keys in localStorage | 🟡 | runbooks/frontend-localstorage…md — sealed-cookie proxy; frontend branch+preview |
| H4 | high | v1 billing TOCTOU / silent debit | 🟢 | already fixed by migration 021 (`billingService.settleInferenceOnce` atomic) |
| H5 | high | Unauth reconciliation API | ✅ | `router.use(requireAdminAuth)`; `/api/reconciliation/summary`=401 (2026-06-24) |
| H6 | high | Hardcoded MC token fallback | 🟢 | source already env-reads; token only in gitignored .next (rotate = ops) |
| H7 | high | Heartbeat HMAC enforcement off | 🟡 | tied to C3; enabling now = fleet 401 (proven+reverted). Enforce LAST. |
| H8 | high | HTTP/bare-IP backend defaults | ✅ | https defaults + prod build-guard; live on dcp.sa (2026-06-24) |
| H9 | high | Dependency CVEs | 🟡 | overrides staged in package.json; install = maintenance window (blue-green runbook) |
| M2 | med | Swagger UI from unpkg CDN | ✅ | pinned @5.17.14 + sha384 SRI (2026-06-24) |
| M3 | med | `curl\|bash` installer overridable base | ✅ | API_BASE pinned https://api.dcp.sa (2026-06-24) |
| M5 | med | Admin dashboard unauth sub-fetches | ✅ | forwards x-admin-token; live on dcp.sa (2026-06-24) |
| M7 | med | `/v1/models` unauthenticated | ✅ | + modelCatalogLimiter 100/min/IP (2026-06-24) |
| M1 | med | CORS no-Origin | 🟢 | env-gated (DCP_ALLOW_LOOPBACK_CORS) |
| M6 | med | Supabase anon key in .env.example | 🟢 | placeholder only; anon keys public-by-design w/ RLS |
| M8 | med | Payment verify on poll | ⚪ | Moyasar-ownership-gated, by design |
| L1-L7 | low | (cookie-secure, MFA, PDPL, body-limit, test-ratelimit, ls-doc, p2p-ip) | 🟢/⚪ | L4 body-limit already 2mb; L7 already redacted; L2 admin-MFA = staged (ops runbook) |

## Open / next actions (priority order)
1. 🟡 **C3+H7** per-provider task_spec re-key — `runbooks/per-provider-taskspec-signing-and-heartbeat-hmac-enforcement.md`. Reviewer fix required: also re-sign in `providers.js buildNextPendingJob()`. Multi-day (daemon adoption). Needs a GO.
2. 🟡 **H9** deps — run the blue-green install in a maintenance window (`runbooks/backend-dep-cve-bluegreen-runbook.md`). Overrides already staged.
3. 🟡 **H1** key-at-rest hashing — phases 0-3 (`runbooks/renter-provider-key-at-rest-hashing.md`); Phase-4 plaintext-drop stays blocked until all sites migrated + soaked.
4. 🟡 **H3** localStorage→sealed-cookie — frontend branch + Vercel preview (`runbooks/frontend-localstorage-key-exfil-to-sealed-cookie-proxy.md`).
5. 🔵 **Ops** — rotate MC token + git-history scrub of exposed secrets (incl. the PAT in the git remote) + admin MFA (`runbooks/ops-closures-…md`). Needs team coordination.

## Requirements / prerequisites
- A maintenance/low-traffic window for H9 (dep install) and the C3 signing cutover.
- Tareq/team coordination for: git-history scrub (force-push + re-clone), MC-token rotation, PAT rotation.
- `DC1_KEY_PEPPER` decided ONCE before H1 backfill (pepper-version strategy in the runbook).
- ~24h+ daemon self-update soak before the C3 per-provider signing flip.
