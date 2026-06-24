import { NextRequest, NextResponse } from 'next/server'
import { sealKey, KEY_CIPHER_COOKIE, SESSION_COOKIE } from '@/app/lib/keySeal'

export const runtime = 'nodejs' // needs node:crypto (NOT edge)
export const dynamic = 'force-dynamic'

const BACKEND = 'https://api.dcp.sa'
const MAX_AGE = 60 * 60 * 24 * 7 // 7d, matches __dc1_session
const VALID = new Set(['renter', 'provider', 'admin'])

// MUST match the identical literal + algorithm in app/api/session/route.ts and
// middleware.ts. The fallback is dev-only and MUST match those files so the
// minted __dc1_session signature verifies in the Edge middleware route-gate.
const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'

function b64url(b: ArrayBuffer): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signSession(role: string, exp: number): Promise<string> {
  const payload = `${role}.${exp}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
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
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
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
  // Sealed raw key — server-only. __Host- prefix mandates Secure + Path=/ + no Domain.
  res.cookies.set(KEY_CIPHER_COOKIE, sealed, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
  // Role gate cookie (middleware verifies). sameSite:'strict' matches /api/session.
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: prod,
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE,
  })
  return res
}

/** DELETE — logout: clear both cookies. */
export async function DELETE() {
  const prod = process.env.NODE_ENV === 'production'
  const res = NextResponse.json({ ok: true })
  res.cookies.set(KEY_CIPHER_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: prod, sameSite: 'strict', path: '/', maxAge: 0 })
  return res
}
