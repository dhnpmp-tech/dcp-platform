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

// ─────────────────────────────────────────────────────────────────────────
// displayGpuType — DISPLAY-ONLY short label for a card title.
//
// The grid shows VRAM on its own line directly under the name, so the title
// must NOT repeat it. Long vendor strings (e.g. "NVIDIA RTX PRO 6000 Blackwell
// Server Edition") also wrap to 3 lines and break row alignment. This mapper
// produces clean, consistent, mostly-≤2-line labels:
//   - strips vendor noise ("NVIDIA ", "GeForce ", "Server Edition")
//   - drops the redundant standalone VRAM token ("80GB", "48 GB", …) — it is
//     shown on the GB line below
//   - keeps the meaningful variant suffix (SXM / PCIe / NVL / Blackwell)
//
// IMPORTANT: this is a *label* only. It must never be fed back into the RENT
// action — that uses the raw `gpu_type` string. Display ≠ identity.
//
// Special, irregular vendor strings get an explicit override (exact, after a
// light normalize) so they always read clean; everything else — including a
// brand-new future GPU — falls through to the rule-based path and still comes
// out tidy.
// ─────────────────────────────────────────────────────────────────────────

// Light normalize for override-map lookup only: collapse whitespace + lower.
function normalizeForOverride(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Explicit overrides for irregular vendor strings where the generic rules
// can't infer the right short form (e.g. an 80GB HBM3 card we brand "SXM",
// or the dash-packed "A100-SXM4-80GB" SKU). Keyed by normalized raw string.
const GPU_LABEL_OVERRIDES: Record<string, string> = {
  'nvidia rtx pro 6000 blackwell server edition': 'RTX PRO 6000 Blackwell',
  'nvidia h100 80gb hbm3': 'H100 SXM',
  'nvidia a100-sxm4-80gb': 'A100 SXM',
  'apple silicon (apple m2)': 'Apple M2',
}

export function displayGpuType(raw: string): string {
  const normalized = normalizeForOverride(raw)
  const override = GPU_LABEL_OVERRIDES[normalized]
  if (override) return override

  let label = raw
    // Drop vendor / brand prefixes — never part of a clean type name.
    .replace(/^NVIDIA\s+GeForce\s+/i, '')
    .replace(/^NVIDIA\s+/i, '')
    .replace(/^GeForce\s+/i, '')
    // Drop marketing suffix that adds no information to the card.
    .replace(/\s+Server\s+Edition\b/i, '')

  // Normalize the dash-packed A100 SXM SKU shape generically:
  // "A100-SXM4-80GB" -> "A100 SXM" (covers SXM4/SXM5 variants too).
  label = label.replace(/\bA100-SXM\d*-\d+GB\b/i, 'A100 SXM')

  // Drop a redundant standalone VRAM token (e.g. "80GB", "48 GB", "80GB HBM3").
  // The VRAM is shown on its own line right below the name. Only strip it when
  // it stands as its own word so we never mangle a model number.
  label = label
    .replace(/\b\d+\s*GB(?:\s+HBM\d*[a-z]?)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return label
}
