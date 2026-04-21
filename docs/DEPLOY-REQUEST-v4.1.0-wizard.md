# DEPLOY REQUEST: v4.1.0 daemon + web wizard (Tracks 1-4 + C)

**Author:** Peter (setup@oida.ae)
**Branch:** main (all work already merged)
**Date drafted:** 2026-04-21

This document describes EXACTLY what needs to be deployed and which commands
to run. **Founder approval is required before any of the backend deploy steps
are executed** — the frontend auto-deploys via Vercel on merge to `main`.

---

## Scope

Five bundled tracks, all merged to `main`:

| Track | Merge commit | Summary |
|-------|--------------|---------|
| 2 — Catalog hygiene | `0a7a717` | dedupe colon/dash model aliases in `/v1/models` + pricing-audit doc |
| 3 — v1 API surface  | `8d51d4f` | auth bridge (register/login/session) + 6 provider wizard endpoints |
| 4 — Binary signing plan | `78a1cb9` | docs-only: BINARY-SIGNING.md (no runtime impact) |
| C — Wizard frontend | `6ad074f` | 6-step provider onboarding UI mounted at `/setup`, wired to `/v1` |
| — (bug fix)       | in f7711d1  | register-node now mints fresh `dcpk_` key (rotates bootstrap key out) |

**Code diff vs previous prod tip (`0a7a717^`):**
- Backend: 1,439 insertions across `backend/src/routes/`, `backend/src/services/`, `backend/tests/`
- Frontend: 1,847 insertions across `app/provider/components/wizard/`, `app/setup/`, `app/auth/callback/page.tsx`

**Test status (local, backend):** 36/36 `/v1/*` tests green (22 provider + 14 auth bridge)
**Build status (local, frontend):** `next build` clean, `/setup` prerendered at 11.3 kB

---

## Deployment targets

### 1. Frontend → Vercel (dcp.sa)

Vercel auto-deploys from `main`. No manual action required.

**Verify after Vercel build completes:**
- `curl -sSLI https://dcp.sa/setup | head -5` → HTTP 200
- Visit `https://dcp.sa/setup` → wizard loads, Step 1 (Sign In) visible
- Visit `https://dcp.sa/provider` → existing dashboard still works (no regression)

### 2. Backend → VPS 76.13.179.86 (api.dcp.sa)

PM2 service: `dc1-provider-onboarding` on port 8083.

**Pre-flight (read-only, safe to run):**
```bash
ssh node@76.13.179.86
cd /home/node/dc1-platform
git fetch origin
git log --oneline HEAD..origin/main | head -20     # review incoming commits
pm2 describe dc1-provider-onboarding | grep -E 'status|uptime'
```

**Deploy steps (require founder approval before running):**
```bash
# 1. Pull merged work
cd /home/node/dc1-platform
git pull origin main

# 2. Install any new backend deps (no new ones expected, verify)
cd backend
npm ci --omit=dev

# 3. Run /v1 tests in-place against the real SQLite DB snapshot if desired
#    (optional — already green locally)
# npx jest tests/v1/

# 4. Reload PM2 service (zero-downtime)
pm2 reload dc1-provider-onboarding

# 5. Verify
curl -sS http://localhost:8083/health
curl -sS https://api.dcp.sa/v1/models | jq '.models | length'
```

**Verify after reload:**
- `GET https://api.dcp.sa/v1/models` → 200, deduped aliases
- `POST https://api.dcp.sa/v1/auth/register {"email":"test@example.com"}` → 200 + magic-link sent
- `GET https://api.dcp.sa/v1/provider/eligibility` with valid key → 200
- PM2 log tail shows no startup errors: `pm2 logs dc1-provider-onboarding --lines 50 --nostream`

---

## Rollback

If any verification fails:

```bash
# Roll backend back to pre-deploy tip
cd /home/node/dc1-platform
git log --oneline -10        # find the pre-deploy SHA (before this pull)
git checkout <pre-deploy-sha> -- backend/
pm2 reload dc1-provider-onboarding
```

Frontend rollback: revert the Vercel deployment from the Vercel dashboard
(Deployments → previous successful build → Promote to Production).

---

## Environment / config changes

**None.** All new endpoints are additive. No schema migrations. No new env vars.
Supabase magic-link redirect URL (`SITE_URL`) already configured.

---

## What this unblocks

- New `/setup` wizard is the canonical provider onboarding URL
  (`provider.dcp.sa/setup` per `web-wizard-spec.md`; same wizard mounts on `dcp.sa/setup`)
- Daemon v4.1.0 install one-liner can now be copied from the wizard and pasted
  directly — install-token mint, single-use consumption, and node registration all
  wired end-to-end
- Enables the 43 registered providers to complete onboarding without founder-side
  hand-holding (per Sprint 27 priority #6)

## What this does NOT include

- Daemon v4.1.0 binary signing pipeline (Track 4 is a plan doc only; no code yet)
- Dashboard cutover from legacy `ProviderOnboardingWizard` — both flows coexist
  until we confirm `/setup` is healthy in prod
- Arabic translation (deferred)
- Playwright E2E tests (deferred)

---

## Waiting for founder approval before:

1. Any `ssh node@76.13.179.86` that mutates state
2. Any `pm2 reload` / `pm2 restart`
3. Any `git pull` on the VPS

Peter (setup@oida.ae) is the single approver. Approval form: a "GO" reply on
this PR or in direct chat is sufficient — no external ticket system.
