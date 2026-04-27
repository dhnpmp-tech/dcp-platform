'use client'

import { useEffect, useState } from 'react'

const PUBLIC_METRICS_POLL_MS = 60_000

interface HealthDetailedResponse {
  status?: string
  timestamp?: string
  providers?: {
    registered?: number
    online?: number
  }
}

export interface PublicMetricsSnapshot {
  providersRegistered: number | null
  providersOnline: number | null
  snapshotAt: string | null
}

export function usePublicMetricsContract() {
  const [snapshot, setSnapshot] = useState<PublicMetricsSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchSnapshot = async () => {
      try {
        const res = await fetch('/api/health/detailed', { cache: 'no-store' })
        if (!res.ok) return

        const payload = (await res.json()) as HealthDetailedResponse
        if (payload.status !== 'ok') return

        if (!cancelled) {
          setSnapshot({
            providersRegistered: typeof payload.providers?.registered === 'number' ? payload.providers.registered : null,
            providersOnline: typeof payload.providers?.online === 'number' ? payload.providers.online : null,
            snapshotAt: typeof payload.timestamp === 'string' ? payload.timestamp : null,
          })
        }
      } catch {
        // Keep the last successful snapshot visible.
      }
    }

    fetchSnapshot()
    const interval = setInterval(fetchSnapshot, PUBLIC_METRICS_POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { snapshot }
}
