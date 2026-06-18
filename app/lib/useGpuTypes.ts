'use client'

// Shared GPU-type availability hook used by every renter-facing surface
// (v2 home, v2 GPU-pods page, v1 marketplace directory). Single source of
// truth so the grid reads identically everywhere.
//
// INVISIBILITY: the backend `gpu_types` field is GPU TYPE + VRAM + available
// only — already deduped, vram-sorted, with NO machine names, NO node/provider
// counts, NO vendor. This hook never derives a count from anything but the
// number of distinct available types, and never surfaces infra detail.
//
// Source: GET /api/health/detailed -> { gpu_types: [{ type, vram_gb, available }] }

import { useEffect, useMemo, useState } from 'react'
import { getApiBase } from '@/lib/api'

const POLL_MS = 60_000

export interface GpuTypeEntry {
  type: string
  vram_gb: number
  available: boolean
}

interface HealthDetailedShape {
  gpu_types?: Array<{ type?: unknown; vram_gb?: unknown; available?: unknown }>
}

// Coerce one raw row, dropping malformed entries.
function toGpuTypeEntry(row: { type?: unknown; vram_gb?: unknown; available?: unknown }): GpuTypeEntry | null {
  const type = typeof row.type === 'string' ? row.type.trim() : ''
  const vram = typeof row.vram_gb === 'number' ? row.vram_gb : Number(row.vram_gb)
  if (!type || !Number.isFinite(vram)) return null
  return {
    type,
    vram_gb: Math.round(vram),
    available: row.available !== false,
  }
}

export interface UseGpuTypesResult {
  // null = still loading; [] = loaded but empty (honest empty state)
  types: GpuTypeEntry[] | null
  errored: boolean
  availableCount: number
}

export function useGpuTypes(): UseGpuTypesResult {
  const [types, setTypes] = useState<GpuTypeEntry[] | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const res = await fetch(`${getApiBase()}/health/detailed`, { cache: 'no-store' })
        if (!res.ok) {
          if (alive) setErrored(true)
          return
        }
        const data = (await res.json()) as HealthDetailedShape
        const rows = Array.isArray(data.gpu_types) ? data.gpu_types : []
        const parsed = rows
          .map(toGpuTypeEntry)
          .filter((entry): entry is GpuTypeEntry => entry !== null)
          .sort((a, b) => b.vram_gb - a.vram_gb)
        if (alive) {
          setTypes(parsed)
          setErrored(false)
        }
      } catch {
        if (alive) setErrored(true)
      }
    }

    load()
    const id = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const availableCount = useMemo(
    () => (types ? types.filter((g) => g.available).length : 0),
    [types],
  )

  return { types, errored, availableCount }
}

// Strip vendor-y prefixes for a clean type label without inventing a machine
// name. e.g. "NVIDIA GeForce RTX 4090" -> "RTX 4090".
export function displayGpuType(raw: string): string {
  return raw
    .replace(/^NVIDIA\s+GeForce\s+/i, '')
    .replace(/^NVIDIA\s+/i, '')
    .trim()
}
