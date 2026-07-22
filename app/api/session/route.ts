import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SESSION_COOKIE = '__dc1_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

const VALID_ROLES = new Set(['provider', 'renter', 'admin'])

// HMAC secret for the route-guard cookie. MUST be set in production
// (e.g. `openssl rand -hex 32` -> DC1_SESSION_SECRET in Vercel/PM2 env).
// The fallback is dev-only and MUST match the identical literal in middleware.ts,
// otherwise minted signatures will never verify. If this constant ever changes,
// change it in BOTH files in the same commit.
const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'

if (!process.env.DC1_SESSION_SECRET && process.env.NODE_ENV === 'production') {
  // Surfaced once per cold start; do not throw (throwing would block all logins).
  console.warn('[session] DC1_SESSION_SECRET is not set — using insecure dev fallback')
}

function base64url(bytes: ArrayBuffer): string {
  const b = Buffer.from(bytes).toString('base64')
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Signs the cookie payload as `role.exp.sig`, where
 * sig = base64url(HMAC-SHA256(`${role}.${exp}`, SESSION_SECRET)).
 * Uses Web Crypto (crypto.subtle) so the same algorithm verifies in Edge middleware.
 */
async function signSession(role: string, expSeconds: number): Promise<string> {
  const payload = `${role}.${expSeconds}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${base64url(sig)}`
}

const BACKEND_URL =
  process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa'

/**
 * SECURITY: cookie is HMAC-signed, but that alone does not prove identity —
 * anyone could POST {role:"admin"} and receive a valid signed cookie.
 * Validate a real credential against the backend before minting.
 */
async function validateCredential(role: string, apiKey: string): Promise<boolean> {
  if (!apiKey) return false
  try {
    if (role === 'admin') {
      const res = await fetch(`${BACKEND_URL}/api/admin/dashboard`, {
        headers: { 'x-admin-token': apiKey },
        cache: 'no-store',
      })
      return res.ok
    }
    if (role === 'provider') {
      const res = await fetch(
        `${BACKEND_URL}/api/providers/me?key=${encodeURIComponent(apiKey)}`,
        { cache: 'no-store' },
      )
      return res.ok
    }
    // renter - Bearer preferred; ?key= still accepted by backend
    const res = await fetch(`${BACKEND_URL}/api/renters/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

/** POST /api/session — sets the session cookie after verifying the credential */
export async function POST(request: NextRequest) {
  let body: { role?: string; apiKey?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role, apiKey } = body
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'Missing credential' }, { status: 401 })
  }

  const ok = await validateCredential(role, apiKey)
  if (!ok) {
    return NextResponse.json({ error: 'Credential validation failed' }, { status: 401 })
  }

  const expSeconds = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE
  const signedValue = await signSession(role, expSeconds)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, signedValue, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}

/** DELETE /api/session — clears the session cookie on logout */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}
