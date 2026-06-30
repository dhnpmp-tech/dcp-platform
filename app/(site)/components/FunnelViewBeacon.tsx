'use client'

// Mount once in the (site) layout. Fires a `view` funnel beacon on mount and
// whenever the pathname changes, but ONLY for marketing surfaces (home,
// marketplace, containers, pricing, docs, register pages). Internal routes
// (renter/provider consoles, /admin, /api, /v1) are skipped so we don't
// pollute the funnel with app-internal traffic.
//
// Beacons are anonymous on the marketing surfaces (no renter key in scope);
// the backend records actor_type='anonymous' with the client anonymous_id.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackView, surfaceForPathname } from '../../lib/funnel'

export default function FunnelViewBeacon() {
  const pathname = usePathname()
  useEffect(() => {
    const surface = surfaceForPathname(pathname || '/')
    if (!surface) return
    // Small delay so sendBeacon doesn't race the navigation that triggered it.
    const t = setTimeout(() => trackView(surface), 0)
    return () => clearTimeout(t)
  }, [pathname])
  return null
}