# Audit C1 phase 2 — `?key=` cutover scope

**Status:** scoping doc, not a code change.
**Audit ref:** Nexus/Tito part-2 finding **C1** (API keys in URL query params).
**Phase 1:** shipped in PR #322 — `Deprecation` / `Sunset` / `Link` response
headers + per-path rate-limited stderr telemetry tagged `[c1-deprecation]`.
**This doc:** turn 24 h of phase-1 telemetry into a concrete phase-2 plan.

## TL;DR

A global flag-flip that 400s every `?key=` request would brick every shipped
daemon and Tauri installer in the field. Phase 2 must be a **phased per-path
cutover, gated on a daemon release that uses headers and on frontend page
migrations**.

## Telemetry (24 h, VPS PM2 error log)

```
2837 total [c1-deprecation] hits — all flavor=shared (i.e. bare ?key=)
   0 hits flavor=renter (?renter_key=)
   0 hits flavor=provider (?provider_key=)
```

Top paths (rate-limited to 1 hit / path / minute, so these are floors not
absolute counts):

| hits | method | path |
|------|--------|------|
|  640 | GET    | /api/providers/me |
|  594 | GET    | /api/verification/pending |
|  593 | GET    | /api/jobs/assigned |
|  554 | GET    | /api/providers/me/metrics |
|  312 | GET    | /api/providers/download/daemon |
|  135 | GET    | /api/dc1/providers/download/daemon |
|    4 | GET    | /api/models/catalog |
|    1 | HEAD   | /api/providers/download/daemon/manifest |
|    1 | HEAD   | /api/providers/download/daemon |
|    1 | GET    | /api/providers/download/daemon/manifest |
|    1 | GET    | /favicon.ico |

**Reading the data**

- 99 % of volume is six provider-side daemon endpoints.
- Zero hits on renter-typed query params — the renter-facing frontend is
  already on `X-Renter-Key` / Bearer (DCP-712 work landed earlier).
- The `?key=` traffic is **the daemon polling itself + the Tauri installer
  fetching `download/daemon`**. Both ship with `?key=<API_KEY>` baked into
  request URLs (`backend/installers/dcp_daemon.py:828,839,844,1516,1541,5406,6184`).

## Repo grep — 59 files still emit `?key=`

Top emitters (rough match counts, no semantic filter):

| file | hits |
|------|------|
| backend/src/routes/renters.js | 11 |
| backend/src/routes/providers.js | 10 |
| app/provider/earnings/page.tsx | 8 |
| backend/src/routes/jobs.js | 7 |
| backend/installers/dcp_daemon.py | 7 |
| app/renter/playground/page.tsx | 7 |
| app/provider/fleet/page.tsx | 7 |
| backend/src/server.js | 6 |
| (≈ 50 more frontend pages, vscode-extension, integration tests) | 1–4 each |

Backend already accepts `x-provider-key` / `x-renter-key` / Bearer everywhere
the route accepts `?key=`, so server-side support already exists — the work
is **client-side migration first, server-side reject second**.

## Why phase-2 cannot be one PR

1. **Shipped daemons in the field still send `?key=`.** Every Tier-2 / WG
   provider's `.exe` calls all six hot paths with `?key=`. If we 400 those,
   every provider goes offline.
2. **Tauri installer URL is baked into a `.exe` already in users' hands.**
   `update_daemon` / `install_daemon` Tauri commands fetch
   `${BACKEND}/api/providers/download/daemon?key=...`. We cannot change the
   bytes inside an installed `.exe` — only future installs.
3. **Frontend pages still use `?key=`** (60+ call sites). Those are inside
   our control but each is its own PR-sized migration.

## Cutover plan

### Step 1 — daemon header migration (size: M)

`backend/installers/dcp_daemon.py` — replace every
`f"{API_URL}/...?key={API_KEY}"` with header-based auth on `http_get` /
`req_lib.get`:

```python
HEADERS = {"x-provider-key": API_KEY}  # or "Authorization": f"Bearer {API_KEY}"
req_lib.get(f"{API_URL}/api/providers/me", headers=HEADERS, timeout=10)
```

7 sites in `dcp_daemon.py` (lines 828, 839, 844, 1516, 1541, 5406, 6184).
Bump `DAEMON_VERSION` 4.2.5 → 4.2.6. Auto-update path already exists via
`update_daemon` Tauri command + `/api/providers/download/daemon/manifest`
(G19 sha256-verified).

**Gate:** wait for telemetry on the six hot paths to drop below ~5 % of
current floor before moving to step 2. Estimated rollout window: 1-2
release cycles depending on how aggressively providers update.

### Step 2 — Tauri installer URL migration (size: S)

Two Tauri commands in `dcp-desktop-installer-fix/src-tauri/src/lib.rs`
(`download_daemon`, `update_daemon`) emit
`/api/providers/download/daemon?key={api_key}`. Switch to
`x-provider-key` header on the `reqwest::Client` builder.

**Gate:** ship via Tauri auto-update. The currently-installed `.exe`s will
keep using `?key=` until the user re-runs the installer or auto-update
triggers, so this needs **its own grace window** (separate from the daemon
grace window because it's a different update channel).

### Step 3 — frontend page sweep (size: L)

`app/{provider,renter}/**/*.tsx` and `app/api/**/*.ts` — 30+ files. Replace
`fetch('/api/.../...?key=' + apiKey)` with header-based fetch. Pattern
already established for renter pages on Bearer; finish the provider half
and clean up the few remaining renter holdouts.

This is independent of steps 1-2; can ship in parallel.

### Step 4 — per-path hard reject (size: XS)

In `backend/src/server.js`, uncomment + extend the existing
`rejectRenterQueryParamKey` middleware, and add a parallel
`rejectProviderQueryParamKey` once daemon telemetry is below threshold.
Apply path-by-path, not globally:

```js
// Renter side — already migrated, safe today (low telemetry signal):
app.use('/api/renters/me', rejectRenterQueryParamKey);
app.use('/api/renters/analytics', rejectRenterQueryParamKey);
app.use('/api/renters/export', rejectRenterQueryParamKey);

// Provider side — gate on daemon 4.2.6+ rollout telemetry:
app.use('/api/providers/me', rejectProviderQueryParamKey);
app.use('/api/providers/me/metrics', rejectProviderQueryParamKey);
app.use('/api/jobs/assigned', rejectProviderQueryParamKey);
app.use('/api/verification/pending', rejectProviderQueryParamKey);
// Daemon download stays on ?key= until installer rollout (step 2):
// app.use('/api/providers/download/daemon', rejectProviderQueryParamKey);
```

Each toggle is one-line and reversible. Watch the `[security] ... rejected`
log line for breakage.

### Step 5 — `download/daemon` cutover (size: XS)

Last to flip, only after step 2's grace window. Symmetric to step 4 but on
the download path.

## Decision summary

- **Do not flip globally.** Cost of breakage > cost of staged rollout.
- **Daemon header PR is the tractable blocker.** It's 7 mechanical edits
  + a version bump and unblocks 99 % of telemetry volume.
- **Sunset header from phase 1 is already counting down** (30 d default).
  We can bump `C1_SUNSET_DAYS` if we need more runway.
- **Renter side could move today.** `/api/renters/me`,
  `/api/renters/analytics`, `/api/renters/export` show zero `[c1-deprecation]`
  hits — frontend is already migrated and the rejection middleware is
  already drafted (commented at `server.js:353-355`). This is a free win
  any time we want it.

## What this PR is not

- This PR contains no code changes — it's the scoping artifact for the next
  4-5 small PRs above. Each step lands as its own PR with its own deploy +
  smoke gate.
