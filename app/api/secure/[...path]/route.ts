import { NextRequest, NextResponse } from 'next/server'
import { unsealKey, KEY_CIPHER_COOKIE, SESSION_COOKIE } from '@/app/lib/keySeal'

export const runtime = 'nodejs' // needs node:crypto for unseal (NOT edge)
export const dynamic = 'force-dynamic'

const BACKEND = 'https://api.dcp.sa'

// MUST match the identical literal + algorithm in app/api/session/route.ts,
// app/api/auth/exchange/route.ts, and middleware.ts.
const SESSION_SECRET =
  process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me'

function b64url(b: ArrayBuffer): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Verifies the __dc1_session HMAC cookie and returns the role, or null. */
async function roleFromSession(value: string | undefined): Promise<string | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [role, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) >= exp) return null
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
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
  // Rewrite ?key= for the ~45 call sites that pass it (and EventSource streams,
  // which cannot carry headers). Set it even if absent so query-auth callers
  // and stream URLs are always authenticated server-side.
  url.searchParams.set('key', rawKey)

  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.delete('x-renter-key')
  headers.delete('x-provider-key')
  headers.delete('x-admin-token')
  headers.delete('authorization')
  headers.delete('cookie')
  if (role === 'renter') {
    headers.set('x-renter-key', rawKey)
    headers.set('authorization', `Bearer ${rawKey}`)
  } else if (role === 'provider') {
    headers.set('x-provider-key', rawKey)
    headers.set('authorization', `Bearer ${rawKey}`)
  } else if (role === 'admin') {
    headers.set('x-admin-token', rawKey)
  }

  const method = req.method.toUpperCase()
  let body: string | undefined = method === 'GET' || method === 'HEAD' ? undefined : await req.text()
  // Some backend endpoints (e.g. POST /providers/pause, /providers/resume)
  // authenticate via a `key` field in the JSON body rather than header/query.
  // Rewrite that field to the real sealed key so a sentinel body still works.
  if (body && (req.headers.get('content-type') || '').includes('application/json')) {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && 'key' in parsed) {
        parsed.key = rawKey
        body = JSON.stringify(parsed)
      }
    } catch {
      // not JSON / unparseable — forward unchanged
    }
  }
  const upstream = await fetch(url.toString(), {
    method,
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  })

  // Stream the response body straight through. Buffering with arrayBuffer()
  // would break Server-Sent Events (e.g. /jobs/:id/stream) by withholding the
  // body until the stream ends. Passing upstream.body preserves SSE + chunked.
  const out = new Headers(upstream.headers)
  out.delete('content-encoding')
  out.delete('content-length')
  out.delete('transfer-encoding')
  return new NextResponse(upstream.body, { status: upstream.status, headers: out })
}

type Ctx = { params: Promise<{ path: string[] }> }
export async function GET(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
export async function POST(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
export async function PUT(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
export async function PATCH(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
export async function DELETE(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
export async function OPTIONS(r: NextRequest, c: Ctx) {
  return proxy(r, (await c.params).path)
}
