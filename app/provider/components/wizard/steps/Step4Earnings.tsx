'use client'

// Step 4: Earnings Preview + Configuration.
// Uses the hourlyUsd from /provider/gpu-profile (set in Step 3) to render
// live-updating earnings estimates as the provider drags the availability
// slider and tweaks schedule/power config. On Continue we POST to
// /v1/provider/config.

import { useMemo, useState } from 'react'
import {
  ErrorBox, PrimaryButton, SecondaryButton, v1Fetch, V1Error,
} from '../primitives'
import { estimateEarnings, formatUsd } from '../gpu-catalog'
import type { DetectedOS } from '../os-detect'
import type { WizardConfig } from '../types'

interface Step4Props {
  apiKey: string
  os: DetectedOS
  hourlyUsd: number
  initialHrsPerDay: number
  initialConfig: WizardConfig
  onSaved: (config: WizardConfig, hrsPerDay: number) => void
  onBack: () => void
}

export function Step4Earnings({
  apiKey, os, hourlyUsd, initialHrsPerDay, initialConfig, onSaved, onBack,
}: Step4Props) {
  const [hrsPerDay, setHrsPerDay] = useState(initialHrsPerDay)
  const [config, setConfig] = useState<WizardConfig>(initialConfig)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const earnings = useMemo(() => estimateEarnings(hourlyUsd, hrsPerDay), [hourlyUsd, hrsPerDay])

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await v1Fetch('/provider/config', {
        method: 'POST',
        apiKey,
        body: {
          schedule: config.schedule,
          gpu_load_max_pct: config.gpuLoadMaxPct,
          vram_max_pct: config.vramMaxPct,
          power_limit: config.powerLimit,
          timezone: config.timezone,
        },
      })
      onSaved(config, hrsPerDay)
    } catch (e) {
      setError(e instanceof V1Error ? e.message : 'Could not save configuration.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">Your Estimated Earnings</h2>
        <p className="mt-1 text-sm text-dc1-text-secondary">
          Estimates based on current network demand. Actual earnings vary with utilisation.
        </p>
      </div>

      {/* Availability slider */}
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-dc1-text-primary">Availability</span>
          <span className="text-dc1-amber">{hrsPerDay} hrs/day</span>
        </div>
        <input
          type="range"
          min={1}
          max={24}
          value={hrsPerDay}
          onChange={(e) => setHrsPerDay(Number(e.target.value))}
          className="w-full accent-dc1-amber"
        />
        <div className="mt-1 flex justify-between text-[10px] text-dc1-text-muted">
          <span>1 hr</span>
          <span>12 hrs</span>
          <span>24/7</span>
        </div>
      </div>

      {/* Earnings card */}
      <div className="rounded-xl border border-dc1-amber/40 bg-gradient-to-br from-dc1-amber/10 to-dc1-surface-l2 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-dc1-amber">
          Earnings preview
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-dc1-text-muted">Hourly</dt>
            <dd className="text-lg font-bold text-dc1-text-primary">{formatUsd(earnings.hourly)}</dd>
          </div>
          <div>
            <dt className="text-dc1-text-muted">Daily ({hrsPerDay}h)</dt>
            <dd className="text-lg font-bold text-dc1-text-primary">{formatUsd(earnings.daily)}</dd>
          </div>
          <div>
            <dt className="text-dc1-text-muted">Monthly (est.)</dt>
            <dd className="text-lg font-bold text-status-success">{formatUsd(earnings.monthly)}</dd>
          </div>
          <div>
            <dt className="text-dc1-text-muted">If 24/7</dt>
            <dd className="text-lg font-bold text-status-success">{formatUsd(earnings.monthly24x7)}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-dc1-border pt-2 text-xs text-dc1-text-muted">
          In SAR: ~ {earnings.monthlySar.toFixed(0)} ﷼/month (at 3.75 SAR/USD)
        </p>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
          Configuration
        </p>

        <label className="block">
          <span className="text-sm text-dc1-text-primary">Schedule</span>
          <select
            value={config.schedule}
            onChange={(e) => setConfig({ ...config, schedule: e.target.value as WizardConfig['schedule'] })}
            className="mt-1 block w-full rounded-md border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-primary focus:border-dc1-amber focus:outline-none"
          >
            <option value="always_on">Always On — daemon runs whenever machine is on</option>
            <option value="smart_hours">Smart Hours — only during peak demand (~6pm-2am)</option>
            <option value="custom">Custom — set your own hours (post-install)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-dc1-text-primary">Max GPU load</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={config.gpuLoadMaxPct}
                onChange={(e) => setConfig({ ...config, gpuLoadMaxPct: Number(e.target.value) })}
                className="flex-1 accent-dc1-amber"
              />
              <span className="w-10 text-right text-xs text-dc1-text-muted">{config.gpuLoadMaxPct}%</span>
            </div>
          </label>
          <label className="block">
            <span className="text-sm text-dc1-text-primary">Max VRAM</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={config.vramMaxPct}
                onChange={(e) => setConfig({ ...config, vramMaxPct: Number(e.target.value) })}
                className="flex-1 accent-dc1-amber"
              />
              <span className="w-10 text-right text-xs text-dc1-text-muted">{config.vramMaxPct}%</span>
            </div>
          </label>
        </div>

        {os !== 'macos' && (
          <label className="block">
            <span className="text-sm text-dc1-text-primary">
              Power limit <span className="text-xs text-dc1-text-muted">(NVIDIA)</span>
            </span>
            <select
              value={config.powerLimit}
              onChange={(e) => setConfig({ ...config, powerLimit: e.target.value as WizardConfig['powerLimit'] })}
              className="mt-1 block w-full rounded-md border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-primary"
            >
              <option value="default">Default — no limit</option>
              <option value="250w">250W — reduces heat</option>
              <option value="200w">200W — significant heat reduction, ~5% perf loss</option>
              <option value="eco">Eco (150W) — laptops / hot climates</option>
            </select>
          </label>
        )}

        <p className="text-xs text-dc1-text-muted">
          💡 Smart Hours aligns the daemon with peak demand and typically earns more.
        </p>
      </div>

      {error && <ErrorBox message={error} onRetry={submit} />}

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton onClick={submit} loading={busy}>
          Save & continue →
        </PrimaryButton>
      </div>
    </div>
  )
}
