'use client'

// Client-side conversion-funnel beacon.
//
// trackView(surface) POSTs to /api/funnel/view (same-origin proxy → backend
// routes/funnel.js). Fire-and-forget via navigator.sendBeacon where available
// (survives page unload) with a fetch fallback. Anonymous by default on the
// marketing surfaces; a logged-in renter console can pass its renter key via
// opts.renterKey to record an actor_type='renter' view (deduped to first view).
//
// The anonymous_id is generated once and persisted in localStorage so a
// visitor's views stitch together across sessions until they register.

const ANON_KEY = 'dcp_anonymous_id'
const ANON_TTL_MS = 1000 * 60 * 60 * 24 * 365 // 1 year

type TrackViewOpts = {
  renterKey?: string
  session_id?: string
}

function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(ANON_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; ts: number }
      if (parsed?.id && Date.now() - parsed.ts < ANON_TTL_MS) return parsed.id
    }
    const id =
      (globalThis.crypto?.randomUUID?.() as string | undefined) ||
      'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    window.localStorage.setItem(ANON_KEY, JSON.stringify({ id, ts: Date.now() }))
    return id
  } catch {
    return ''
  }
}

export type FunnelSurface =
  | 'home'
  | 'marketplace'
  | 'containers'
  | 'pricing'
  | 'docs'
  | 'provider_register_page'
  | 'renter_register_page'

export function trackView(surface: FunnelSurface, opts: TrackViewOpts = {}): void {
  if (typeof window === 'undefined') return
  const anonymous_id = getOrCreateAnonymousId()
  const payload = JSON.stringify({
    surface,
    anonymous_id,
    session_id: opts.session_id ?? null,
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.renterKey) headers['x-renter-key'] = opts.renterKey

  // sendBeacon can't set custom headers → fall back to fetch for the renter-key
  // case so the view is attributed to the logged-in renter.
  if (opts.renterKey || typeof navigator === 'undefined' || !navigator.sendBeacon) {
    void fetch('/api/funnel/view', {
      method: 'POST',
      headers,
      body: payload,
      keepalive: true,
    }).catch(() => {})
    return
  }
  try {
    navigator.sendBeacon('/api/funnel/view', payload)
  } catch {
    /* best-effort */
  }
}

// Map a pathname to a funnel surface. Returns null for non-marketing routes
// (renter/provider consoles, /admin, /api, /v1/*, auth) so we don't beacon
// internal app traffic.
export function surfaceForPathname(pathname: string): FunnelSurface | null {
  if (!pathname) return null
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/' || p === '') return 'home'
  if (p === '/marketplace' || p.startsWith('/marketplace/')) return 'marketplace'
  if (p === '/containers' || p.startsWith('/containers/')) return 'containers'
  if (p === '/pricing' || p.startsWith('/pricing/')) return 'pricing'
  if (p === '/docs' || p.startsWith('/docs/')) return 'docs'
  if (p === '/provider/register') return 'provider_register_page'
  if (p === '/renter/register') return 'renter_register_page'
  return null
}