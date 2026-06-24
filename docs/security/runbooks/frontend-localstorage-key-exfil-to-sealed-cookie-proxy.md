# frontend-localstorage-key-exfil-to-sealed-cookie-proxy

**risk:** risky · **deploy_target:** frontend-vercel
**reviewer:** go_no_go=go-with-changes rollout_safe=False breaks_fleet_or_auth=False

## Design
Today lib/api.ts getRenterKey/getProviderKey/getAdminToken read the RAW backend bearer key out of localStorage, and ~16 console pages inject it client-side three different ways (x-renter-key/x-provider-key header, ?key=/&key= query, Authorization: Bearer, x-admin-token). Any XSS = full key theft. There is already a route-gate cookie __dc1_session (role.exp.HMAC, minted by app/api/session/route.ts, verified in middleware.ts) — but it does NOT hold the key. Vercel is serverless/multi-region with no KV/Redis dependency in package.json, so an in-process session->key map cannot survive across lambdas; the design must be STATELESS. Solution: a new exchange route app/api/auth/exchange that takes the key ONCE, validates it against the backend (renters/me | providers/me | admin/dashboard), and on success seals the raw key into a SECOND httpOnly+secure+SameSite=Lax+__Host- cookie (__Host-dc1_kc) using AES-256-GCM under a server-only secret (DC1_KEY_CIPHER_SECRET), plus mints the existing __dc1_session role cookie. A new authenticated server proxy app/api/secure/[...path] reads the role from __dc1_session, decrypts __Host-dc1_kc per-request (no store), strips any client-sent credential, and re-injects the real key upstream in EVERY form the backend accepts before forwarding to api.dcp.sa. lib/api.ts getApiBase() flips to /api/secure and the getters return a non-secret SENTINEL so existing call-site code (header/query/Bearer construction) compiles and runs unchanged while the real key lives only server-side. Because next.config.js rewrites are afterFiles, file routes win and /api/secure/* is never shadowed; /api/renters/* and /api/admin/* rewrites stay intact during migration so un-migrated pages keep working (dual-path). This is purely frontend/Vercel — zero backend, zero daemon, zero HMAC/heartbeat impact, so the fleet/auth hard-constraints are untouched.

## Phases (honor each GATE before proceeding)
PHASE 0 — Vercel env + collision audit (no code path change). Set DC1_KEY_CIPHER_SECRET (openssl rand -hex 32) and confirm DC1_SESSION_SECRET are present in Vercel Project Settings -> Environment Variables for Production AND Preview (Preview must have them or preview deploys 500 on exchange). VERIFY GATE: `vercel env ls` shows both in production+preview; build of current main still green. No behavior changes yet.

PHASE 1 — Land server primitives DARK (additive, nothing calls them). Add app/api/auth/exchange/route.ts, app/api/secure/[...path]/route.ts, and app/lib/keySeal.ts (AES-GCM seal/unseal + cookie name constants). Do NOT yet change lib/api.ts or any page. These routes are unreferenced so they cannot break any live page. Deploy to a PREVIEW URL only. VERIFY GATE (on preview): node --check / tsc passes on all 3 new files; curl preview /api/auth/exchange with a known-good TEST renter key returns 200 + Set-Cookie __Host-dc1_kc + __dc1_session; curl preview /api/secure/renters/me with those cookies returns the same JSON as /api/renters/me. If anything fails, nothing in prod is affected (routes are unreferenced). Promote to prod only after preview passes — still dark.

PHASE 2 — Switch the MINT sites to also seal the key (writers first, readers unchanged). Edit app/(site)/auth/page.tsx (loginWithApiKey renter+provider, loginWithAdminKey), app/(site)/auth/verify/page.tsx (magic-link renter+provider), app/(site)/provider-setup/page.tsx, app/components/RenterOnboardingFlow.tsx, app/lib/auth.ts setSession/clearSession: after a successful validate, POST the key to /api/auth/exchange (which seals __Host-dc1_kc AND mints __dc1_session) INSTEAD OF calling /api/session separately. KEEP the existing localStorage.setItem for now (dual-write) so already-open sessions and un-migrated reader pages still work. VERIFY GATE (preview then prod): log in fresh as renter/provider/admin on preview -> Application tab shows __Host-dc1_kc + __dc1_session cookies set, AND localStorage still has the key (dual-write), AND every dashboard still loads. Promote.

PHASE 3 — Flip readers to the sealed proxy. (3a) In lib/api.ts flip getApiBase() to return /api/secure and make the three getters return the SENTINEL '__dc1_cookie_session__'. Because the proxy ignores/overwrites whatever credential the client sends and injects the real sealed key, all existing call sites (x-renter-key header, ?key=SENTINEL query, Bearer SENTINEL) transparently work cookie-backed. (3b) Single PREVIEW deploy; smoke EVERY console group on that one preview before promoting (getApiBase is global, so the flip routes all consoles at once). Smoke order to validate: provider/dashboard, provider/earnings, provider/payouts, provider/profile, provider/rigs, provider/settings; then renter/dashboard, renter/wallet, renter/usage, renter/invoices, renter/keys, renter/playground, renter/pods, setup; then admin/* pages. Each page must load real data with NO real key in any outbound request (Network tab: only the cookie authenticates; any ?key= value is the literal sentinel). If incremental cutover is preferred over single-flip, first gate getApiBase behind a per-call override and migrate file-by-file — but single-preview-then-promote is recommended given the proxy makes all three transports cookie-backed simultaneously. Promote only after the full smoke passes.

PHASE 4 — Stop persisting the raw key (drop localStorage writes) + harden. After Phase 3 has been live and smoke-clean for >=24h: remove every localStorage.setItem('dc1_renter_key'|'dc1_provider_key'|'dc1_admin_token', ...) writer; keep removeItem on logout (defensive cleanup of stale values) and ensure clearSession also DELETEs /api/auth/exchange to clear __Host-dc1_kc. VERIFY GATE: fresh login then `localStorage` in console shows NO dc1_*_key/token entries; pages still load; logout clears both cookies and any residual localStorage. This is the phase that actually closes the XSS-theft hole.

PHASE 5 — Optional cleanup: shrink the now-redundant ?key= sentinel from URLs and the x-*-key headers in call sites for tidiness (no security value left since the proxy already ignores them), and add a CSP/no-store header check. Pure hygiene; can be deferred.

ROLLBACK at any phase: redeploy the previous Vercel build (instant). Because every phase keeps localStorage dual-write until Phase 4, rolling back to Phase <=3 immediately restores the localStorage-key path. Do NOT start Phase 4 until you are willing to forward-fix rather than roll back to localStorage.

## Verification
PHASE 0 (env):
  vercel env ls | grep -E 'DC1_KEY_CIPHER_SECRET|DC1_SESSION_SECRET'   # expect both in production AND preview
  # if missing: vercel env add DC1_KEY_CIPHER_SECRET production  (paste `openssl rand -hex 32`); repeat for preview

PHASE 1 (primitives dark, on PREVIEW url $PREVIEW; use a TEST renter key, never a prod admin key in shell history):
  ( cd $REPO && npx tsc --noEmit app/lib/keySeal.ts "app/api/auth/exchange/route.ts" "app/api/secure/[...path]/route.ts" )
  curl -i -s -c /tmp/c.txt -X POST "$PREVIEW/api/auth/exchange" -H 'content-type: application/json' \
    -d '{"role":"renter","key":"'"$TEST_RENTER_KEY"'"}' | grep -E 'HTTP/|set-cookie: __Host-dc1_kc|set-cookie: __dc1_session'
  curl -s -b /tmp/c.txt "$PREVIEW/api/secure/renters/me" | head -c 200          # proxy result
  curl -s -H "x-renter-key: $TEST_RENTER_KEY" "$PREVIEW/api/renters/me" | head -c 200   # must match
  curl -s -o /dev/null -w '%{http_code}\n' "$PREVIEW/api/secure/renters/me"     # no cookie -> expect 401

PHASE 2 (mint sites, PREVIEW then prod) — browser checks:
  # log in fresh (api-key + magic-link) as renter/provider/admin:
  #   DevTools > Application > Cookies: __Host-dc1_kc AND __dc1_session present
  #   DevTools > Application > Local Storage: dc1_*_key STILL present (dual-write intact)
  #   every dashboard still loads (no regression)

PHASE 3 (reader flip, single PREVIEW, smoke ALL groups before promote):
  ( cd $REPO && npx tsc --noEmit )      # whole-app type-check clean
  ( cd $REPO && npm run build )         # prod build green
  # For each provider/* , renter/* , admin/* page on $PREVIEW:
  #   - loads real data
  #   - Network tab: outbound goes to /api/secure/*; the ONLY auth is the cookie;
  #     any ?key= value in the URL is the literal sentinel '__dc1_cookie_session__' (NOT a real key)
  #   - no request carries a real dcp_* key in header/query/body
  grep -rn "getApiBase()" $REPO/app/\(site\)/renter $REPO/app/\(site\)/provider $REPO/app/\(site\)/admin | wc -l   # informational

PHASE 4 (de-persist):
  # browser fresh login, then in console:
  #   Object.keys(localStorage).filter(k=>/dc1_(renter|provider)_key|dc1_admin_token/.test(k))  -> []  (empty)
  # logout clears the sealed cookie:
  curl -i -s -b /tmp/c.txt -X DELETE "$PREVIEW/api/auth/exchange" | grep -E 'set-cookie: __Host-dc1_kc=;|Max-Age=0'
  ( cd $REPO && npm run build )         # final green build

ROLLBACK (any phase): redeploy the previous Vercel build. Phases <=3 keep localStorage dual-write so rollback fully restores prior behavior.

## Reviewer — gaps / required changes BEFORE executing
**Gaps:** VERIFIED against actual repo at /Users/pp/DC1-Platform/dc1-platform and backend over SSH. The design's core premise and fleet/auth hard-constraints hold: this is frontend-Vercel-only; backend api.dcp.sa, the daemon heartbeat (backend/src/routes/providers.js:1108 + /:id/heartbeat), and task_spec/job execution are structurally untouched — no daemon rejects task_specs, no heartbeat 401s, no HMAC change. The existing __dc1_session HMAC cookie (app/api/session/route.ts + middleware.ts Edge Web Crypto) is unchanged. Backend validation endpoints the exchange depends on all exist (GET /api/renters/me, /api/providers/me, /api/admin/dashboard) and the backend reads keys from req.query.key AND x-*-key headers AND Bearer (renters.js:670) — confirming the proxy MUST re-inject in all three forms.

BUT four under-stated gaps make the rollout NOT safe as written, all in PHASE 3/4 (the localStorage->cookie reader flip), NOT phases 0-2:

1. BLOCKER — app/components/JobCard.tsx:6 hardcodes `const API_BASE = '/api'` and does NOT call getApiBase(). Flipping getApiBase() to /api/secure does not migrate the live job SSE stream (line 97: `${API_BASE}/jobs/{id}/stream?key=${renterKey}`). EventSource also can't carry the proxy's header-injection. After Phase 4 drops localStorage writes, getRenterKey() returns the SENTINEL, so the stream URL carries the literal sentinel through the un-secured /api/* rewrite -> backend 401 -> live job streaming silently breaks. Phase 3 'page loads real data' smoke will NOT catch this (stream isn't exercised on load).

2. BLOCKER — provider installer download links are hardcoded `/api/providers/download/setup?key=...` (provider-setup/page.tsx:184; rigs/page.tsx:274,282), browser-navigated via anchor href (not fetch, not getApiBase()). Cookies+proxy don't apply; post-Phase-4 the SENTINEL leaks as the key -> download 401s. rigs has a partial setup-token fallback (line 272); provider-setup does NOT. Page-load smoke won't catch a button nobody clicks.

3. RISK/UNVERIFIED — the /api/secure proxy MUST rewrite the ?key= query param across ~45 call sites (e.g. renters/me?key=, providers/earnings?key=, usage export, withdraw), not merely strip+inject headers, because ?key= is a first-class backend auth form. The patch excerpt was truncated before the proxy body, so the single most security-critical and breakage-critical file is unreviewed. Query rewriting + streaming response handling in that proxy is the real risk surface.

4. GAP — auth/verify desktop_callback branch (page.tsx ~line 100-118) intentionally POSTs the raw data.api_key to a localhost loopback for the DCP Provider desktop daemon. The Phase 2 edit list says only 'magic-link renter+provider' and a blanket localStorage/key rewrite could break provider desktop onboarding. Must be explicitly preserved.

Verification gates: Phase 0/1 (dark) gates are sound and prod-safe (routes unreferenced). Phase 2 dual-write gate is fine. Phase 3 gate ('each page loads real data, only-cookie auth') is INSUFFICIENT — it does not exercise SSE job streaming or download/installer anchors, so it passes while leaving #1 and #2 latent until Phase 4 makes them fail with no localStorage fallback. Required changes before proceeding: (a) migrate JobCard.tsx API_BASE and the hardcoded /api/providers/download/* links to /api/secure (or give them their own cookie-backed proxy path) and add SSE + download-click to the Phase 3 smoke; (b) publish + review the full /api/secure/[...path] proxy body, confirming it rewrites ?key= query AND streams responses; (c) explicitly preserve the desktop_callback raw-key path in Phase 2; (d) note __Host-dc1_kc + SameSite=Lax is fine for same-origin fetch but EventSource cross-path must be same-origin (it is, /api/secure) — verify cookie reaches the stream route. With these, the staged plan's rollback-via-redeploy + dual-write-until-Phase-4 design is otherwise correct and the fleet/auth constraints remain untouched. rollout_safe=false only because Phases 3-4 as written will break live streaming + installer downloads; breaks_fleet_or_auth=false because no daemon/heartbeat/backend-auth path is affected.

**Required changes:** 

## Caveats
SCOPE: frontend/Vercel only. ZERO backend, daemon, HMAC_SECRET, TASK_SPEC-signing, or DC1_REQUIRE_HEARTBEAT_HMAC impact — the fleet/auth hard-constraints are not touched by this item. The backend key-auth contract (x-renter-key/x-provider-key/?key=/Bearer/x-admin-token) is unchanged; the proxy just injects those server-side.
PREREQUISITES: DC1_KEY_CIPHER_SECRET (>=32-byte hex) and DC1_SESSION_SECRET MUST be set in BOTH Vercel Production AND Preview before Phase 1 promotes; a Preview missing them will 500 on /api/auth/exchange (sealKey throws) and 401 on /api/secure. The exchange + secure routes pin runtime='nodejs' because they need node:crypto — they must NOT become Edge (Edge crashes on node:crypto, exactly like middleware would).
COOKIE SIZE: sealed key is small (raw key + 28B framing, base64url) — well under the 4KB cookie limit. __Host- prefix requires Secure + Path=/ + no Domain; fine on the single dcp.sa host. Local dev over http: the __dc1_session cookie drops Secure when NODE_ENV!=production, but __Host-dc1_kc always sets Secure — acceptable because local dev keeps the localStorage dual-write path through Phase 3 (the sealed cookie just won't set over plain http locally; test the cookie path on the https preview).
NON-CONSOLE WRITERS: auth/verify also has a desktop_callback branch that POSTs the key to a local desktop app — leave it untouched; it is not a browser-storage path. RenterOnboardingFlow.tsx and provider-setup also write keys and are included in the Phase 2/4 lists.
SINGLE-FLIP RISK (Phase 3): getApiBase() is global, so flipping it routes ALL console auth through /api/secure at once. Mitigation = one Preview deploy with every console group smoke-tested before promote, plus instant Vercel rollback (localStorage still dual-written until Phase 4). For true file-by-file incrementality, first gate getApiBase via a per-call arg — but that enlarges the diff.
401 BEHAVIOR: pages currently treat 401 by clearing localStorage and bouncing to /login (which middleware 308s to /auth). With the proxy, an expired/forged cookie yields 401 from /api/secure and the same handlers fire — good. Confirm no page treats the sentinel string as a real token anywhere it is displayed (it is harmless but shouldn't be shown).
OUT OF SCOPE: MC token (NEXT_PUBLIC_MC_TOKEN) and /api/mc, the /v1 OpenAI-compat proxy, and CSP hardening (Phase 5). The existing /api/session route is left in place for compatibility (exchange supersedes its use). Do NOT begin Phase 4 until Phase 3 has been live and smoke-clean for >=24h, because Phase 4 removes the localStorage fallback that makes earlier rollbacks safe.

## Patch scripts (apply per-phase, central + tested)
```
All scripts target the FRONTEND repo (Vercel-deployed, git). Set REPO at top. They are idempotent (backup-once, marker-guarded) and run a TS-aware syntax gate (tsc --noEmit on changed files). Apply locally, commit, push to a PREVIEW branch, promote per phases. These write to a working tree, NOT to /root/dc1-platform — this item is frontend/Vercel; the backend VPS is untouched.

############################################################
# PHASE 1 — primitives (dark): app/lib/keySeal.ts + exchange + secure proxy
############################################################
#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-/Users/pp/DC1-Platform/dc1-platform}"
TS="$(date +%Y%m%d-%H%M%S)"

# --- app/lib/keySeal.ts (Node-runtime AES-256-GCM seal/unseal) ---
mkdir -p "$REPO/app/lib"
cat > "$REPO/app/lib/keySeal.ts" <<'EOF'
import crypto from 'node:crypto'

// __Host- prefix forces Secure + Path=/ + no Domain — strongest cookie scoping.
export const KEY_CIPHER_COOKIE = '__Host-dc1_kc'
export const SESSION_COOKIE = '__dc1_session'
// Sentinel returned by lib/api.ts getters post-migration. Never a real key.
export const KEY_SENTINEL = '__dc1_cookie_session__'

const ALG = 'aes-256-gcm'

function secret(): Buffer {
  const hex = process.env.DC1_KEY_CIPHER_SECRET
  if (!hex || hex.length < 32) {
    throw new Error('DC1_KEY_CIPHER_SECRET missing/short (need 32-byte hex)')
  }
  return crypto.createHash('sha256').update(hex).digest() // stable 32-byte key
}

/** Seals a raw key -> base64url(iv.tag.ciphertext). */
export function sealKey(raw: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALG, secret(), iv)
  const ct = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

/** Unseals; returns null on any tamper/format error (never throws to caller). */
export function unsealKey(sealed: string | undefined): string | null {
  if (!sealed) return null
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < 12 + 16 + 1) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const d = crypto.createDecipheriv(ALG, secret(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
EOF

# --- app/api/auth/exchange/route.ts ---
mkdir -p "$REPO/app/api/auth/exchange"
cat > "$REPO/app/api/auth/exchange/route.ts" <<'EOF'
import { NextRequest, NextResponse } from 'next/server'
import { sealKey, KEY_CIPHER_COOKIE, SESSION_COOKIE } from '@/app/lib/keySeal'

export const runtime = 'nodejs'        // needs node:crypto (NOT edge)
export const dynamic = 'force-dynamic'

const BACKEND = 'https://api.dcp.sa'
const MAX_AGE = 60 * 60 * 24 * 7       // 7d, matches __dc1_session
const VALID = new Set(['renter', 'provider', 'admin'])

const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'
function b64url(b: ArrayBuffer): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function signSession(role: string, exp: number): Promise<string> {
  const payload = `${role}.${exp}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${b64url(sig)}`
}

/** Validate the raw key against the backend for the claimed role. */
async function validate(role: string, key: string): Promise<boolean> {
  try {
    if (role === 'renter') {
      return (await fetch(`${BACKEND}/api/renters/me`, { headers: { 'x-renter-key': key }, cache: 'no-store' })).ok
    }
    if (role === 'provider') {
      return (await fetch(`${BACKEND}/api/providers/me`, { headers: { 'x-provider-key': key }, cache: 'no-store' })).ok
    }
    return (await fetch(`${BACKEND}/api/admin/dashboard`, { headers: { 'x-admin-token': key }, cache: 'no-store' })).ok
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  let body: { role?: string; key?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const role = body.role
  const key = (body.key || '').trim()
  if (!role || !VALID.has(role)) return NextResponse.json({ error: 'bad role' }, { status: 400 })
  if (!key || key.length > 256) return NextResponse.json({ error: 'bad key' }, { status: 400 })

  if (!(await validate(role, key))) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const sealed = sealKey(key)
  const session = await signSession(role, exp)
  const prod = process.env.NODE_ENV === 'production'

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set(KEY_CIPHER_COOKIE, sealed, {            // sealed raw key, server-only
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  })
  res.cookies.set(SESSION_COOKIE, session, {              // role gate cookie (middleware verifies)
    httpOnly: true, secure: prod, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  })
  return res
}

/** DELETE — logout: clear both cookies. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(KEY_CIPHER_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
EOF

# --- app/api/secure/[...path]/route.ts (authenticated proxy) ---
mkdir -p "$REPO/app/api/secure/[...path]"
cat > "$REPO/app/api/secure/[...path]/route.ts" <<'EOF'
import { NextRequest, NextResponse } from 'next/server'
import { unsealKey, KEY_CIPHER_COOKIE, SESSION_COOKIE } from '@/app/lib/keySeal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND = 'https://api.dcp.sa'

const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'
function b64url(b: ArrayBuffer): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function roleFromSession(value: string | undefined): Promise<string | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [role, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) >= exp) return null
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${role}.${expRaw}`)))
  if (expected.length !== sig.length) return null
  let m = 0
  for (let i = 0; i < expected.length; i++) m |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return m === 0 ? role : null
}

function buildUrl(path: string[], search: string): string {
  const safe = path.map((s) => encodeURIComponent(s)).join('/')
  return `${BACKEND}/api/${safe}${search}`
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const role = await roleFromSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!role) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const rawKey = unsealKey(req.cookies.get(KEY_CIPHER_COOKIE)?.value)
  if (!rawKey) return NextResponse.json({ error: 'session expired' }, { status: 401 })

  // Inject the real key in every form the backend accepts; strip anything the
  // client sent so a sentinel/forged value can never reach upstream.
  const url = new URL(buildUrl(path, req.nextUrl.search))
  if (url.searchParams.has('key')) url.searchParams.set('key', rawKey) // keep ?key= callers working

  const headers = new Headers(req.headers)
  headers.delete('host'); headers.delete('content-length')
  headers.delete('x-renter-key'); headers.delete('x-provider-key'); headers.delete('x-admin-token')
  headers.delete('authorization'); headers.delete('cookie')
  if (role === 'renter') { headers.set('x-renter-key', rawKey); headers.set('authorization', `Bearer ${rawKey}`) }
  else if (role === 'provider') { headers.set('x-provider-key', rawKey); headers.set('authorization', `Bearer ${rawKey}`) }
  else if (role === 'admin') { headers.set('x-admin-token', rawKey) }

  const method = req.method.toUpperCase()
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text()
  const upstream = await fetch(url.toString(), { method, headers, body, redirect: 'manual', cache: 'no-store' })

  const out = new Headers(upstream.headers)
  out.delete('content-encoding'); out.delete('transfer-encoding')
  return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: out })
}

type Ctx = { params: Promise<{ path: string[] }> }
export async function GET(r: NextRequest, c: Ctx)    { return proxy(r, (await c.params).path) }
export async function POST(r: NextRequest, c: Ctx)   { return proxy(r, (await c.params).path) }
export async function PUT(r: NextRequest, c: Ctx)    { return proxy(r, (await c.params).path) }
export async function PATCH(r: NextRequest, c: Ctx)  { return proxy(r, (await c.params).path) }
export async function DELETE(r: NextRequest, c: Ctx) { return proxy(r, (await c.params).path) }
EOF

# syntax gate (TS-aware)
( cd "$REPO" && npx --no-install tsc --noEmit --pretty false \
    app/lib/keySeal.ts "app/api/auth/exchange/route.ts" "app/api/secure/[...path]/route.ts" 2>&1 | head -40 ) \
  || echo "[warn] tsc found issues — review before deploy"
echo "PHASE 1 staged under $REPO. Deploy to PREVIEW only."

############################################################
# PHASE 2 — mint sites call /api/auth/exchange (dual-write kept)
#   Patches app/lib/auth.ts: adds sealKeyExchange() + clearSession seal-clear.
#   Page-level swaps (auth/page.tsx, auth/verify, provider-setup,
#   RenterOnboardingFlow) are 1-line additions listed below — apply with Edit.
############################################################
#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-/Users/pp/DC1-Platform/dc1-platform}"
TS="$(date +%Y%m%d-%H%M%S)"
F="$REPO/app/lib/auth.ts"
[ ! -f "$F.bak-keyseal-$TS" ] && cp "$F" "$F.bak-keyseal-$TS"
if ! grep -q 'sealKeyExchange' "$F"; then
node - "$F" <<'NODE'
const fs=require('fs');const p=process.argv[2];let s=fs.readFileSync(p,'utf8');
const helper=`
/** Seals the raw key into the httpOnly cookie via /api/auth/exchange AND mints
 *  the role cookie. Supersedes the old /api/session-only call. */
export async function sealKeyExchange(role: AuthRole, key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, key }),
    })
    return res.ok
  } catch {
    return false
  }
}
`;
s=s.replace(/export async function clearSession/, helper+"\nexport async function clearSession");
s=s.replace(/await fetch\('\/api\/session', \{ method: 'DELETE' \}\)\.catch\(\(\) => \{\}\)/,
  "await fetch('/api/session', { method: 'DELETE' }).catch(() => {})\n  await fetch('/api/auth/exchange', { method: 'DELETE' }).catch(() => {})");
fs.writeFileSync(p,s);
console.log('patched app/lib/auth.ts: sealKeyExchange + clearSession seal-clear');
NODE
else echo "auth.ts already patched"; fi
( cd "$REPO" && npx --no-install tsc --noEmit --pretty false app/lib/auth.ts 2>&1 | head -20 ) || true

# Per-file Edit swaps for Phase 2 (keep the existing localStorage.setItem next to each):
#  app/(site)/auth/page.tsx  (+ import { sealKeyExchange } from '@/app/lib/auth')
#     renter branch  : after localStorage.setItem('dc1_renter_key', key)   add: await sealKeyExchange('renter', key)
#     provider branch: after localStorage.setItem('dc1_provider_key', key) add: await sealKeyExchange('provider', key)
#     loginWithAdminKey: after localStorage.setItem('dc1_admin_token', key) add: await sealKeyExchange('admin', key)
#  app/(site)/auth/verify/page.tsx (magic-link): after each setItem add await sealKeyExchange(data.role, data.api_key)
#  app/(site)/provider-setup/page.tsx (~L111): after setItem('dc1_provider_key', clean) add await sealKeyExchange('provider', clean)
#  app/components/RenterOnboardingFlow.tsx (~L674): after setItem('dc1_renter_key', token) add await sealKeyExchange('renter', token)
echo "PHASE 2 helper staged. Apply per-file swaps, then PREVIEW deploy."

############################################################
# PHASE 3 — flip lib/api.ts to the sealed proxy + sentinel getters
############################################################
#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-/Users/pp/DC1-Platform/dc1-platform}"
TS="$(date +%Y%m%d-%H%M%S)"
F="$REPO/lib/api.ts"
[ ! -f "$F.bak-keyseal-$TS" ] && cp "$F" "$F.bak-keyseal-$TS"
cat > "$F" <<'EOF'
/**
 * DCP Platform API utilities — POST-SEAL.
 *
 * Auth no longer rides localStorage. getApiBase() points at the authenticated
 * server proxy /api/secure, which reads the httpOnly role cookie + sealed-key
 * cookie and injects the REAL backend key upstream. The getters return a
 * non-secret SENTINEL so existing call sites that build x-*-key headers,
 * ?key=… query params, or Authorization: Bearer keep compiling and running —
 * the proxy overwrites whatever they send. The raw key is never in JS again.
 */
import { KEY_SENTINEL } from '@/app/lib/keySeal'

const SECURE_PROXY_PATH = '/api/secure'

/** Authenticated, cookie-backed proxy base. Was '/api'. */
export function getApiBase(): string {
  return SECURE_PROXY_PATH
}

export function getMcBase(): string {
  return '/api/mc'
}
export function getMcToken(): string {
  return process.env.NEXT_PUBLIC_MC_TOKEN || 'YOUR_MC_API_TOKEN'
}

// Sentinel — NOT a credential. The /api/secure proxy ignores it and injects the
// sealed key server-side. Returned (instead of null) so call sites that guard on
// "no key -> missing-key" still proceed; if the cookie is gone the proxy 401s and
// the page's existing 401 handler bounces to /auth.
export function getAdminToken(): string { return KEY_SENTINEL }
export function getProviderKey(): string { return KEY_SENTINEL }
export function getRenterKey(): string { return KEY_SENTINEL }
EOF
( cd "$REPO" && npx --no-install tsc --noEmit --pretty false lib/api.ts 2>&1 | head -20 ) || echo "[warn] review tsc"
echo "PHASE 3 staged. Single PREVIEW, smoke ALL console groups, then promote."

############################################################
# PHASE 4 — stop persisting raw key (comment out setItem writers; keep removeItem)
############################################################
#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-/Users/pp/DC1-Platform/dc1-platform}"
TS="$(date +%Y%m%d-%H%M%S)"
grep -rl "localStorage.setItem('dc1_renter_key'\|localStorage.setItem('dc1_provider_key'\|localStorage.setItem('dc1_admin_token'" "$REPO/app" | while read -r f; do
  [ ! -f "$f.bak-keyseal-$TS" ] && cp "$f" "$f.bak-keyseal-$TS"
  perl -0pi -e "s/(\blocalStorage\.setItem\(\s*'dc1_(?:renter_key|provider_key|admin_token)'[^\n;]*;?)/\/* SEALED: raw-key persistence removed -> \/api\/auth\/exchange *\/ \/\/ \$1/g" "$f"
  echo "phase4 patched $f"
done
( cd "$REPO" && npx --no-install tsc --noEmit 2>&1 | head -20 ) || echo "[warn] review tsc"
echo "PHASE 4 staged. Verify localStorage has NO dc1_*_key after fresh login."
```
