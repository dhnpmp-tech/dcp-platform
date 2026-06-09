import { NextRequest, NextResponse } from 'next/server'

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

  const role = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)

  // SITE-6: the /v2 console tree mirrors the /provider|/renter|/admin paths.
  // Strip a single leading /v2 segment so /v2/admin is gated exactly like /admin.
  const gatedPath = pathname.startsWith('/v2/')
    ? pathname.slice('/v2'.length)
    : pathname

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

  return NextResponse.next()
}

function buildLoginRedirect(request: NextRequest, expectedRole: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('role', expectedRole)
  url.searchParams.set('reason', 'missing_credentials')
  url.searchParams.set('redirect', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/provider/:path*',
    '/provider-onboarding/:path*',
    '/provider-onboarding',
    '/renter/:path*',
    '/admin/:path*',
    // SITE-6: the /v2 console tree was bypassing the guard entirely.
    '/v2/provider/:path*',
    '/v2/renter/:path*',
    '/v2/admin/:path*',
  ],
}
