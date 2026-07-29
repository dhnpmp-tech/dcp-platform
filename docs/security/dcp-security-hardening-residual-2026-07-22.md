# DCP Security Hardening — Residual vs origin/main (2026-07-22)

## Context

Branch `security/dcp-hardening-2026-07-22` originally landed commit `041129ff`
against a stale local `main` (~466 commits behind `origin/main`).

This document records the **review of that commit against current `origin/main`**
and the **residual fixes** that still needed to land.

## Review of 041129ff vs origin/main

| Finding | 041129ff change | Status on origin/main | Residual action |
|---------|-----------------|----------------------|-----------------|
| C1 renter `/login-email` | 410 stub | **Already fixed** (DCP-896 410 + dead code after) | None |
| C2 reconciliation unauth | `requireAdminRbac` | **Already fixed** (`requireAdminAuth` on router) | None |
| C4 hardcoded renter key | env `DCP_RENTER_KEY` | **Already fixed** | Rotate key server-side if not done |
| H1 session forgeable | HMAC + credential gate | **Partial** — cookie already HMAC-signed (`role.exp.sig`), but `POST /api/session` still minted any role with no credential | **Fixed in this PR** — require + validate apiKey |
| H3/H4 v1 debit silent/TOCTOU | rowcount + fresh balance | **Superseded** by `billingService.settleInferenceOnce` atomic path | None (do not re-apply old patch) |
| M1 recovery unauth | router admin gate | **Partial** — only `POST /resolve` gated; GETs open | **Fixed in this PR** — `router.use(requireAdminAuth)` |
| M2 bare-IP HTTP defaults | `https://api.dcp.sa` | **Already fixed** | None |
| L1 fallback unauth | router admin gate | **Partial** — only `POST /simulate` gated | **Fixed in this PR** — `router.use(requireAdminAuth)` |
| L2 standup `/latest` | admin gate | **Already fixed** | None |

## Deferred (still open, not in this PR)

- **C3** per-provider HMAC derivation (daemon download still injects global secret)
- **H2** renter API key hashing (DB migration; providers already hashed)
- **H5** dependency upgrades (protobufjs / ws / sharp / grpc-js)

## This PR changes

1. `app/api/session/route.ts` — require `apiKey` and validate against backend before minting signed cookie
2. `app/lib/auth.ts` — send stored role key with session mint
3. `backend/src/routes/fallback.js` — admin-gate entire router
4. `backend/src/routes/recovery.js` — admin-gate entire router

## Deploy notes

- Merging to main does **not** auto-deploy backend. VPS PM2 restart requires founder approval.
- Frontend (Vercel) will pick up session changes after main deploy.
- Ensure `DC1_SESSION_SECRET` is set in Vercel + any Next host (already required for HMAC).
