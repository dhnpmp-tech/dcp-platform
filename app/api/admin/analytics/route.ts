export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy to the self-hosted Umami instance. Umami credentials NEVER
// reach the browser — the admin's existing session token (x-admin-token) gates
// access, validated against the backend (single source of truth), and this route
// holds the Umami login creds from Vercel env.
const BACKEND_URL = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa'
const UMAMI_URL = process.env.UMAMI_URL || 'https://analytics.76.13.179.86.nip.io'
const UMAMI_USERNAME = process.env.UMAMI_USERNAME || 'admin'
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || ''
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || ''

interface UmamiStats {
  pageviews: number
  visitors: number
  visits: number
  bounces: number
  totaltime: number
}

interface MetricRow {
  x: string | null
  y: number
}

// Cache the Umami bearer token across invocations (warm lambda) to avoid a
// login round-trip on every request. Umami tokens are long-lived.
let cachedToken: { value: string; expiresAt: number } | null = null

async function umamiLogin(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: UMAMI_USERNAME, password: UMAMI_PASSWORD }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Umami login failed (${res.status})`)
  const data = (await res.json()) as { token: string }
  cachedToken = { value: data.token, expiresAt: Date.now() + 6 * 60 * 60 * 1000 }
  return data.token
}

async function umamiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${UMAMI_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Umami ${path} -> ${res.status}`)
  return (await res.json()) as T
}

// Validate the caller's admin token against the backend (source of truth).
async function isValidAdmin(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/metrics`, {
      headers: { 'x-admin-token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const callerToken = request.headers.get('x-admin-token')
  if (!callerToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isValidAdmin(callerToken))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UMAMI_PASSWORD || !UMAMI_WEBSITE_ID) {
    return NextResponse.json(
      { error: 'Umami not configured (set UMAMI_PASSWORD + UMAMI_WEBSITE_ID in Vercel env)' },
      { status: 503 },
    )
  }

  const range = request.nextUrl.searchParams.get('range') === '24h' ? 1 : 30
  const endAt = Date.now()
  const startAt = endAt - range * 24 * 60 * 60 * 1000
  const w = UMAMI_WEBSITE_ID
  const q = `startAt=${startAt}&endAt=${endAt}`

  try {
    const token = await umamiLogin()
    const [stats, active, referrers, pages, countries, browsers] = await Promise.all([
      umamiGet<UmamiStats>(`/api/websites/${w}/stats?${q}`, token),
      umamiGet<Array<{ x: number }>>(`/api/websites/${w}/active`, token).catch(() => [] as Array<{ x: number }>),
      umamiGet<MetricRow[]>(`/api/websites/${w}/metrics?type=referrer&${q}&limit=8`, token).catch(() => []),
      umamiGet<MetricRow[]>(`/api/websites/${w}/metrics?type=url&${q}&limit=8`, token).catch(() => []),
      umamiGet<MetricRow[]>(`/api/websites/${w}/metrics?type=country&${q}&limit=8`, token).catch(() => []),
      umamiGet<MetricRow[]>(`/api/websites/${w}/metrics?type=browser&${q}&limit=6`, token).catch(() => []),
    ])

    const activeVisitors = Array.isArray(active) && active.length > 0 ? Number(active[0]?.x ?? 0) : 0
    const avgDurationSeconds = stats.visits > 0 ? Math.round(stats.totaltime / stats.visits) : 0
    const bounceRate = stats.visits > 0 ? Math.round((stats.bounces / stats.visits) * 100) : 0

    return NextResponse.json({
      range_days: range,
      stats: {
        visitors: stats.visitors,
        pageviews: stats.pageviews,
        visits: stats.visits,
        avg_duration_seconds: avgDurationSeconds,
        bounce_rate_pct: bounceRate,
        active_visitors: activeVisitors,
      },
      sources: referrers,
      top_pages: pages,
      countries,
      browsers,
      dashboard_url: `${UMAMI_URL}`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Umami fetch failed' },
      { status: 502 },
    )
  }
}
