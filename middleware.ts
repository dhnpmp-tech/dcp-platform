import { NextRequest, NextResponse } from 'next/server'
import { ROUTES, buildAuthHref } from '@/app/lib/routes'

const SESSION_COOKIE = '__dc1_session'

// MUST match the identical literal + algorithm in app/api/session/route.ts.
// If DC1_SESSION_SECRET is unset, the dev-only fallback is used in BOTH files so
// signatures still verify locally. In production, set DC1_SESSION_SECRET.
const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'

function base64url(bytes: ArrayBuffer): string {
  let binary = ''
  const view = new Uint8Array(bytes)
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verifies a `role.exp.sig` cookie minted by /api/session.
 * Returns the role iff the HMAC matches and the cookie has not expired.
 * Any malformed / legacy-unsigned / tampered / expired cookie returns null
 * (treated as unauthenticated → user is bounced to /login to re-authenticate).
 * Uses Web Crypto (crypto.subtle) — a global on the Edge middleware runtime;
 * node:crypto is NOT available here and would crash middleware for every request.
 */
async function verifySession(value: string | undefined): Promise<string | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [role, expRaw, presentedSig] = parts
  if (!role || !expRaw || !presentedSig) return null

  const expSeconds = Number(expRaw)
  if (!Number.isFinite(expSeconds)) return null
  if (Math.floor(Date.now() / 1000) >= expSeconds) return null // expired

  const payload = `${role}.${expRaw}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expectedSigBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  )
  const expectedSig = base64url(expectedSigBytes)

  // Constant-time compare of the two base64url signatures.
  if (expectedSig.length !== presentedSig.length) return null
  let mismatch = 0
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ presentedSig.charCodeAt(i)
  }
  return mismatch === 0 ? role : null
}

/**
 * Route protection rules:
 *   /provider/* — requires session role "provider"  (register excluded)
 *   /renter/*   — requires session role "renter"    (register excluded)
 *   /admin/*    — requires session role "admin"
 *
 * On missing/wrong session → redirect to /login with reason + role + redirect params.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Legacy wizard/onboard/register routes → /earn (preserve query string).
  // Must run before the auth gate, otherwise unauthenticated visitors are
  // bounced to /login with a stale redirect target. /provider-onboarding is
  // the even-older path that used to client-side-redirect to /provider/register.
  if (
    pathname === '/provider/wizard' ||
    pathname === '/provider/onboard' ||
    pathname === '/provider/register' ||
    pathname.startsWith('/provider/register/') ||
    pathname === '/provider-onboarding' ||
    pathname.startsWith('/provider-onboarding/')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/earn'
    // search is preserved automatically via clone()
    return NextResponse.redirect(url, 308)
  }

  // Public sub-paths that don't require auth
  if (
    pathname === '/renter/register' ||
    pathname.startsWith('/renter/register/')
  ) {
    return NextResponse.next()
  }

  // Legacy /login cutover (ROOT CAUSE of the "RENT lands on the old login" bug).
  // The legacy /login surface is retired in favour of the redesigned auth page,
  // which now lives at the canonical root /auth (ROUTES.auth) and mints renter,
  // provider, AND admin sessions on the same /api contracts. Permanently redirect
  // any direct /login hit (bookmarks, transactional-email links, residual
  // hardcoded refs) to /auth, preserving role/redirect/method query so the
  // post-auth return target survives.
  if (pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = ROUTES.auth
    // search (role, redirect, reason, method, new) is preserved via clone()
    return NextResponse.redirect(url, 308)
  }

  // The redesigned renter/provider/admin consoles now live in the app/(site)
  // route group and serve from the CANONICAL ROOT paths (/renter/*, /provider/*).
  // There is no longer a /v2 surface to forward to — gating runs directly on the
  // real pathname. (Legacy /v2/* URLs are 308'd back to root in next.config.js.)
  const role = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)

  const gatedPath = pathname

  if (gatedPath.startsWith('/provider')) {
    if (role !== 'provider') {
      return buildLoginRedirect(request, 'provider')
    }
  } else if (gatedPath.startsWith('/renter')) {
    if (role !== 'renter') {
      return buildLoginRedirect(request, 'renter')
    }
  } else if (gatedPath.startsWith('/admin')) {
    if (role !== 'admin') {
      return buildLoginRedirect(request, 'admin')
    }
  }

  // BUG #3 (Back shows the logged-out account page): gated/authenticated pages must not be
  // cached or kept in the browser bfcache, or pressing Back after logout replays the old
  // logged-in page. Force revalidation on every gated response (the matcher only matches
  // gated paths, so this never touches public/marketing pages).
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  res.headers.set('Vary', 'Cookie')
  return res
}

function buildLoginRedirect(
  request: NextRequest,
  expectedRole: 'renter' | 'provider' | 'admin',
): NextResponse {
  // Bounce unauthenticated visitors to the redesigned auth surface at /auth
  // (NOT the retired v1 /login). Preserve the role and the originally-requested
  // path so /auth returns the user to e.g. the pod launch console after sign-in.
  const url = request.nextUrl.clone()
  const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const href = buildAuthHref({
    role: expectedRole,
    reason: 'missing_credentials',
    redirect: redirectTarget,
  })
  const [authPath, authQuery = ''] = href.split('?')
  url.pathname = authPath
  url.search = authQuery
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // Legacy /login cutover: route any direct /login hit through the middleware
    // so it is permanently redirected to /auth (ROUTES.auth).
    '/login',
    // The redesigned consoles now live at these canonical ROOT paths (served by
    // the app/(site) route group). Gate them directly — there is no /v2 surface.
    // NOTE: '/provider/:path*' matches /provider/dashboard etc. but NOT the
    // public /provider-setup signup funnel (no slash after "provider"), so the
    // funnel stays ungated. Same for '/renter/:path*' vs /renter/register.
    '/provider/:path*',
    '/provider-onboarding/:path*',
    '/provider-onboarding',
    '/renter/:path*',
    '/admin/:path*',
  ],
}
