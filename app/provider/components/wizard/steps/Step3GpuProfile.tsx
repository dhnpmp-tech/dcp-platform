'use client'

// Step 3: GPU Profile. Provider selects one or more GPUs, or manually
// enters hardware the catalog doesn't know about. On Continue we POST to
// /v1/provider/gpu-profile and store the server-returned hourly rate.

import { useMemo, useState } from 'react'
import {
  ErrorBox, PrimaryButton, SecondaryButton, v1Fetch, V1Error,
} from '../primitives'
import {
  NVIDIA_GPUS, APPLE_GPUS, AMD_GPUS, findGpu, formatUsd,
  type GpuOption,
} from '../gpu-catalog'
import type { GpuSelection } from '../types'
import type { DetectedOS } from '../os-detect'
import type { ProbeReport } from '../hardware-probe'

interface Step3Props {
  apiKey: string
  os: DetectedOS
  probeReport?: ProbeReport | null
  initialGpus?: GpuSelection[]
  onSaved: (gpus: GpuSelection[], hourlyUsd: number) => void
  onBack: () => void
}

interface GpuProfileResponse {
  profile_id: string
  estimated_hourly_rate: number
  estimated_monthly_rate: number
  supported_models?: string[]
  bandwidth_gbps?: number
}

// Map catalog group labels back to the vendor guess emitted by the probe.
function groupVendorKey(label: string): 'nvidia' | 'apple' | 'amd' | null {
  if (label === 'NVIDIA') return 'nvidia'
  if (label === 'Apple Silicon') return 'apple'
  if (label.startsWith('AMD')) return 'amd'
  return null
}

export function Step3GpuProfile({ apiKey, os, probeReport, initialGpus, onSaved, onBack }: Step3Props) {
  const [selected, setSelected] = useState<GpuSelection[]>(initialGpus ?? [])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  // If Step 2 got a reliable WebGPU vendor, surface the matching group
  // first so the provider doesn't have to scroll past vendors they don't have.
  const detectedVendor = probeReport?.gpu.status === 'detected' ? probeReport.gpu.vendorGuess : null
  const gpuDetectedViaBrowser = detectedVendor === 'nvidia' || detectedVendor === 'amd' || detectedVendor === 'apple'

  // Default vendor group based on OS: macOS → Apple only; else NVIDIA first.
  const allGroups = os === 'macos'
    ? [{ label: 'Apple Silicon', gpus: APPLE_GPUS }]
    : [
        { label: 'NVIDIA', gpus: NVIDIA_GPUS },
        { label: 'Apple Silicon', gpus: APPLE_GPUS },
        { label: 'AMD (ROCm)', gpus: AMD_GPUS },
      ]

  const groups = detectedVendor && detectedVendor !== 'unknown' && detectedVendor !== 'intel'
    ? [...allGroups].sort((a, b) => {
        const av = groupVendorKey(a.label) === detectedVendor ? -1 : 0
        const bv = groupVendorKey(b.label) === detectedVendor ? -1 : 0
        return av - bv
      })
    : allGroups

  const filtered = useMemo(() => {
    if (!filter.trim()) return groups
    const q = filter.trim().toLowerCase()
    return groups
      .map(g => ({ ...g, gpus: g.gpus.filter(x => x.label.toLowerCase().includes(q)) }))
      .filter(g => g.gpus.length > 0)
  }, [groups, filter])

  function addGpu(g: GpuOption) {
    setSelected((prev) => {
      const existing = prev.find(x => x.id === g.id)
      if (existing) {
        return prev.map(x => x.id === g.id ? { ...x, count: x.count + 1 } : x)
      }
      return [...prev, {
        vendor: g.vendor, id: g.id, label: g.label, vramGb: g.vramGb, count: 1,
      }]
    })
  }

  function removeGpu(id: string) {
    setSelected(prev => prev.filter(x => x.id !== id))
  }

  function setGpuCount(id: string, count: number) {
    setSelected(prev => prev.map(x => x.id === id ? { ...x, count: Math.max(1, count) } : x))
  }

  async function submit() {
    if (selected.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        gpus: selected.map(g => ({
          vendor: g.vendor, model: g.id, vram_gb: g.vramGb, count: g.count,
        })),
        // Tag the detection path so the backend can tell browser-hinted
        // registrations from cold manual ones. 'auto_installer' stays
        // reserved for the Phase 2 native installer handshake.
        detected_by: gpuDetectedViaBrowser ? 'browser_webgpu' as const : 'manual_web' as const,
        os,
      }
      const resp = await v1Fetch<GpuProfileResponse>('/provider/gpu-profile', {
        method: 'POST', apiKey, body,
      })
      onSaved(selected, resp.estimated_hourly_rate)
    } catch (e) {
      setError(e instanceof V1Error ? e.message : 'Could not save GPU profile.')
    } finally {
      setBusy(false)
    }
  }

  const catalogPreviewHourly = selected.reduce((acc, s) => {
    const g = findGpu(s.id)
    return acc + (g ? g.hourlyUsd * s.count : 0)
  }, 0)

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">Tell Us About Your GPU</h2>
        <p className="mt-1 text-sm text-dc1-text-secondary">
          Select your hardware. The daemon will verify these details on first run.
        </p>
        {gpuDetectedViaBrowser && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-status-success/30 bg-status-success/10 px-2.5 py-1 text-xs text-status-success">
            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
            </svg>
            Detected {detectedVendor === 'apple' ? 'Apple GPU' : detectedVendor === 'nvidia' ? 'NVIDIA GPU' : 'AMD GPU'} — pick the exact model below.
          </p>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="🔍 Search (e.g. RTX 4090)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="block w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2.5 text-sm text-dc1-text-primary placeholder:text-dc1-text-muted focus:border-dc1-amber focus:outline-none"
      />

      {/* Catalog */}
      <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
        {filtered.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.gpus.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => addGpu(g)}
                  className="flex w-full items-center justify-between rounded-md border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-left text-sm hover:border-dc1-amber hover:bg-dc1-surface-l3"
                >
                  <span className="text-dc1-text-primary">
                    {g.label} <span className="text-xs text-dc1-text-muted">({g.vramGb} GB)</span>
                  </span>
                  <span className="text-xs text-dc1-amber">≈ {formatUsd(g.hourlyUsd)}/hr</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-dc1-text-muted">No matches. Try manual entry.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setManualOpen(true)}
        className="w-full rounded-md border border-dashed border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-xs text-dc1-text-secondary hover:border-dc1-amber hover:text-dc1-amber"
      >
        + Can&apos;t find it? Enter manually
      </button>

      {manualOpen && (
        <ManualGpuForm
          onAdd={(g) => {
            setSelected(prev => [...prev, g])
            setManualOpen(false)
          }}
          onCancel={() => setManualOpen(false)}
        />
      )}

      {/* Selected list */}
      {selected.length > 0 && (
        <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
            Selected ({selected.length})
          </p>
          <ul className="space-y-2">
            {selected.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-dc1-text-primary">{s.label} <span className="text-xs text-dc1-text-muted">({s.vramGb} GB)</span></span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={s.count}
                    onChange={(e) => setGpuCount(s.id, Number(e.target.value))}
                    className="w-14 rounded-md border border-dc1-border bg-dc1-surface-l1 px-2 py-1 text-center text-xs text-dc1-text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => removeGpu(s.id)}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {catalogPreviewHourly > 0 && (
            <p className="mt-3 text-xs text-dc1-text-muted">
              Catalog estimate: ≈ <span className="text-dc1-amber">{formatUsd(catalogPreviewHourly)}/hr</span> — the server returns the authoritative rate.
            </p>
          )}
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={submit} />}

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton
          onClick={submit}
          disabled={selected.length === 0}
          loading={busy}
        >
          Save GPU profile →
        </PrimaryButton>
      </div>
    </div>
  )
}

function ManualGpuForm({
  onAdd, onCancel,
}: { onAdd: (g: GpuSelection) => void; onCancel: () => void }) {
  const [vendor, setVendor] = useState<'nvidia' | 'amd' | 'apple'>('nvidia')
  const [model, setModel] = useState('')
  const [vramGb, setVramGb] = useState(16)
  const [count, setCount] = useState(1)

  const ok = model.trim().length > 0 && vramGb > 0 && count > 0

  return (
    <div className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/5 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-dc1-amber">
        Manual entry
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={vendor}
          onChange={(e) => setVendor(e.target.value as 'nvidia' | 'amd' | 'apple')}
          className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5 text-xs text-dc1-text-primary"
        >
          <option value="nvidia">NVIDIA</option>
          <option value="amd">AMD</option>
          <option value="apple">Apple</option>
        </select>
        <input
          type="text"
          placeholder="Model (e.g. RTX A6000)"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5 text-xs text-dc1-text-primary"
        />
        <input
          type="number"
          min={1}
          placeholder="VRAM GB"
          value={vramGb}
          onChange={(e) => setVramGb(Number(e.target.value))}
          className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5 text-xs text-dc1-text-primary"
        />
        <input
          type="number"
          min={1}
          max={8}
          placeholder="Count"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5 text-xs text-dc1-text-primary"
        />
      </div>
      <p className="text-xs text-dc1-text-muted">
        ⚠️ Manual entries may affect estimated earnings. The daemon verifies on first run.
      </p>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-dc1-text-muted hover:text-dc1-text-primary">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => ok && onAdd({
            vendor,
            id: `manual_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            label: model,
            vramGb,
            count,
          })}
          disabled={!ok}
          className="rounded-md bg-dc1-amber px-3 py-1 text-xs font-semibold text-dc1-void disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}
