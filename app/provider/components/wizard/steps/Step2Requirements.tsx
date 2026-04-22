'use client'

// Step 2: System Requirements Check — hybrid autodetect.
//
// Design honesty: Tito's spec says the wizard "can't probe the machine"
// (web-wizard-spec.md:144). The browser really can't see GPU model, VRAM,
// driver version, free disk, upload speed, Apple chip, or Linux distro.
//
// What we CAN probe we auto-verify (OS, CPU cores, GPU vendor via WebGPU,
// network class). What we can't, we surface as self-ack checkboxes — the
// daemon confirms everything for real on first-run handshake (Step 6).

import { useEffect, useMemo, useRef, useState } from 'react'
import { PrimaryButton, SecondaryButton } from '../primitives'
import { OS_PROFILES, type DetectedOS } from '../os-detect'
import { OSGlyph } from '../os-icons'
import {
  runAllProbes,
  type ProbeReport,
  type ProbeStatus,
  type GpuVendorGuess,
} from '../hardware-probe'

interface Step2Props {
  initialOs?: DetectedOS
  initialReport?: ProbeReport | null
  onContinue: (os: DetectedOS, report: ProbeReport | null) => void
  onBack: () => void
}

const OS_CHOICES: DetectedOS[] = ['windows', 'macos', 'linux']

// Ack items live on the UI only — the server never sees them; they're just
// gates to keep the provider honest about the floors we can't verify.
interface AckItem {
  key: string
  label: string
  hint?: string
}

function buildAckItems(os: DetectedOS): AckItem[] {
  const common: AckItem[] = [
    { key: 'disk', label: 'I have at least 50 GB of free disk space.' },
    { key: 'upload', label: 'My upload speed is at least 5 Mbps.', hint: 'Browsers only measure download — you know your upload better than we do.' },
  ]
  if (os === 'windows') {
    return [
      { key: 'gpu', label: 'I have an NVIDIA GPU (GTX 1060 6 GB or newer).' },
      { key: 'driver', label: 'NVIDIA driver 525 or newer is installed.' },
      { key: 'ram', label: 'I have 16 GB RAM or more.' },
      { key: 'os_version', label: 'My Windows is 10 or 11 (64-bit).' },
      ...common,
    ]
  }
  if (os === 'macos') {
    return [
      { key: 'chip', label: 'My Mac has Apple Silicon (M1, M2, M3 or M4).' },
      { key: 'ram', label: 'I have 16 GB of unified memory or more.' },
      { key: 'os_version', label: 'macOS 13 Ventura or later.' },
      ...common,
    ]
  }
  if (os === 'linux') {
    return [
      { key: 'gpu', label: 'I have a compatible GPU (NVIDIA 525+ driver, AMD ROCm 5.4+, or Apple Silicon via Asahi).' },
      { key: 'ram', label: 'I have 16 GB RAM or more.' },
      { key: 'os_version', label: 'Ubuntu 20.04+, Debian 11+, or RHEL 8+.' },
      ...common,
    ]
  }
  // unknown
  return [
    { key: 'gpu', label: 'I have a modern discrete GPU.' },
    { key: 'ram', label: 'I have 16 GB RAM or more.' },
    ...common,
  ]
}

// Human labels for a detected GPU vendor.
function vendorPrettyName(v: GpuVendorGuess): string {
  switch (v) {
    case 'nvidia': return 'NVIDIA GPU'
    case 'amd': return 'AMD GPU'
    case 'apple': return 'Apple GPU'
    case 'intel': return 'Intel GPU'
    default: return 'GPU'
  }
}

export function Step2Requirements({ initialOs, initialReport, onContinue, onBack }: Step2Props) {
  // OS — start with whatever detectOS() gave the shell, allow override.
  const [os, setOs] = useState<DetectedOS>(initialOs ?? 'unknown')

  // Probe state
  const [report, setReport] = useState<ProbeReport | null>(initialReport ?? null)
  const [probing, setProbing] = useState<boolean>(!initialReport)
  const [showDetectHint, setShowDetectHint] = useState(false)
  const probedOnce = useRef(false)

  useEffect(() => {
    if (probedOnce.current || initialReport) {
      probedOnce.current = true
      return
    }
    probedOnce.current = true
    let cancelled = false
    runAllProbes()
      .then((r) => {
        if (cancelled) return
        setReport(r)
        // If the probe gave us a non-unknown OS, use it — but don't clobber
        // an explicit override the provider may have made between mount and
        // probe resolution.
        setOs((cur) => (cur !== 'unknown' ? cur : r.os.os))
        setProbing(false)
      })
      .catch(() => {
        if (cancelled) return
        setProbing(false)
      })
    return () => { cancelled = true }
  }, [initialReport])

  const effectiveOs = os === 'unknown' ? (report?.os.os ?? 'windows') : os
  const profile = OS_PROFILES[effectiveOs] ?? OS_PROFILES.windows
  const ackItems = useMemo(() => buildAckItems(effectiveOs), [effectiveOs])

  // Ack checkboxes — one per row we can't verify.
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  useEffect(() => {
    // Reset acks when OS changes — the rows aren't the same.
    setAcks({})
  }, [effectiveOs])

  // A row is "auto-cleared" only if a matching probe gave a reliable value.
  function isAutoCleared(key: string): boolean {
    if (!report) return false
    if (key === 'gpu' && effectiveOs !== 'macos') {
      // Linux / Windows: require NVIDIA or AMD vendor
      return report.gpu.status === 'detected' &&
        (report.gpu.vendorGuess === 'nvidia' || report.gpu.vendorGuess === 'amd')
    }
    if (key === 'chip' && effectiveOs === 'macos') {
      return report.gpu.status === 'detected' && report.gpu.vendorGuess === 'apple'
    }
    // Everything else (RAM, disk, upload, driver, OS version) — browser
    // cannot confirm. Leave as manual ack.
    return false
  }

  const autoAcknowledgedKeys = useMemo(
    () => new Set(ackItems.filter((r) => isAutoCleared(r.key)).map((r) => r.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ackItems, report, effectiveOs],
  )

  const allAcked = ackItems.every(
    (r) => autoAcknowledgedKeys.has(r.key) || acks[r.key],
  )

  function toggleAck(key: string) {
    setAcks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-dc1-border bg-dc1-surface-l1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-dc1-amber/10 via-dc1-amber/[0.03] to-transparent"
      />

      <div className="relative space-y-7 p-6 md:p-9">
        {/* Header */}
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dc1-amber/80">
            Pre-flight check
          </p>
          <h2 className="text-2xl font-bold leading-tight text-dc1-text-primary md:text-[28px]">
            Can your machine run DCP?
          </h2>
          <p className="max-w-xl text-sm text-dc1-text-secondary">
            We checked what your browser lets us see. A few things only your OS knows —
            please confirm those below. The daemon verifies everything for real on first run.
          </p>
        </header>

        {/* OS selector */}
        <section aria-labelledby="os-label" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p id="os-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-text-muted">
              Operating system
            </p>
            {report?.os.status === 'detected' && (
              <p className="text-[11px] text-dc1-text-muted">
                Auto-detected: <span className="text-dc1-text-secondary">{OS_PROFILES[report.os.os].label}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {OS_CHOICES.map((k) => {
              const p = OS_PROFILES[k]
              const active = effectiveOs === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOs(k)}
                  aria-pressed={active}
                  className={`group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? 'border-dc1-amber bg-dc1-amber/[0.06]'
                      : 'border-dc1-border bg-dc1-surface-l2 hover:-translate-y-[1px] hover:border-dc1-text-muted/40 hover:bg-dc1-surface-l2/80'
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                      active
                        ? 'border-dc1-amber/40 bg-dc1-amber/10 text-dc1-amber'
                        : 'border-dc1-border bg-dc1-surface-l1 text-dc1-text-secondary group-hover:text-dc1-text-primary'
                    }`}
                  >
                    <OSGlyph os={k} className="h-6 w-6" />
                  </div>

                  <div className="space-y-0.5">
                    <p className={`text-sm font-semibold ${active ? 'text-dc1-amber' : 'text-dc1-text-primary'}`}>
                      {p.label}
                    </p>
                    <p className="text-xs leading-snug text-dc1-text-muted">{p.tagline}</p>
                  </div>

                  {active && (
                    <span
                      aria-hidden
                      className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-dc1-amber text-dc1-void"
                    >
                      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
                      </svg>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Detected on this machine */}
        <section
          aria-labelledby="detected-label"
          className="rounded-xl border border-dc1-border bg-dc1-surface-l2/60"
        >
          <div className="flex items-center justify-between gap-3 border-b border-dc1-border/60 px-5 py-3">
            <p id="detected-label" className="text-sm font-semibold text-dc1-text-primary">
              Detected on this machine
            </p>
            <p className="hidden text-[11px] uppercase tracking-[0.14em] text-dc1-text-muted sm:block">
              {probing ? 'Scanning…' : 'Browser only'}
            </p>
          </div>

          <ul className="divide-y divide-dc1-border/60">
            <ProbeRow
              label="Operating system"
              status={report?.os.status ?? (probing ? 'scanning' : 'unsupported')}
              value={report ? OS_PROFILES[report.os.os].label + (report.os.is64bit ? ' (64-bit)' : '') : '—'}
            />
            <ProbeRow
              label="GPU vendor"
              status={report?.gpu.status ?? (probing ? 'scanning' : 'unsupported')}
              value={
                report
                  ? report.gpu.vendorGuess === 'unknown'
                    ? 'Hidden by browser — confirm below'
                    : vendorPrettyName(report.gpu.vendorGuess) +
                      (report.gpu.architecture ? ` (${report.gpu.architecture})` : '') +
                      (report.gpu.source === 'webgl' ? ' · via WebGL' : '')
                  : '—'
              }
              footnote={
                report && (report.gpu.status === 'unsupported' || report.gpu.vendorGuess === 'unknown')
                  ? "Safari and Firefox hide the GPU — we'll confirm on first run."
                  : undefined
              }
            />
            <ProbeRow
              label="CPU cores"
              status={report?.cpu.status ?? (probing ? 'scanning' : 'unsupported')}
              value={report?.cpu.cores ? `${report.cpu.cores} logical cores` : '—'}
            />
            <ProbeRow
              label="System memory"
              status={report?.memory.status ?? (probing ? 'scanning' : 'unsupported')}
              value={
                report?.memory.gbReported
                  ? report.memory.gbReported >= 8
                    ? `≥ ${report.memory.gbReported} GB (browser-capped)`
                    : `${report.memory.gbReported} GB`
                  : '—'
              }
              footnote="The browser caps RAM reporting at 8 GB for privacy — please confirm 16 GB below."
            />
            <ProbeRow
              label="Network"
              status={report?.network.status ?? (probing ? 'scanning' : 'unsupported')}
              value={
                report
                  ? [
                      report.network.effectiveType ? report.network.effectiveType.toUpperCase() : null,
                      report.network.downlinkMbps ? `${report.network.downlinkMbps} Mbps down` : null,
                    ].filter(Boolean).join(' · ') || '—'
                  : '—'
              }
              footnote="Browsers never measure upload — please confirm 5 Mbps up below."
            />
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-dc1-border/60 px-5 py-3">
            <p className="text-xs text-dc1-text-muted">Not sure about your GPU?</p>
            <button
              type="button"
              onClick={() => setShowDetectHint(!showDetectHint)}
              className="text-xs font-semibold text-dc1-amber hover:underline"
              aria-expanded={showDetectHint}
            >
              {showDetectHint ? 'Hide hint' : 'Show hint'}
            </button>
          </div>

          {showDetectHint && (
            <div className="border-t border-dc1-border/60 bg-dc1-surface-l1/60 px-5 py-3">
              <p className="text-xs leading-relaxed text-dc1-text-secondary">{profile.gpuDetectHint}</p>
            </div>
          )}
        </section>

        {/* Ack list — only items the browser cannot confirm */}
        <section aria-labelledby="confirm-label" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p id="confirm-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-text-muted">
              Please confirm
            </p>
            <p className="text-[11px] text-dc1-text-muted">
              {ackItems.length - autoAcknowledgedKeys.size} of {ackItems.length} need your confirmation
            </p>
          </div>

          <ul className="space-y-2">
            {ackItems.map((row) => {
              const auto = autoAcknowledgedKeys.has(row.key)
              const checked = auto || !!acks[row.key]
              return (
                <li key={row.key}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      auto
                        ? 'border-status-success/30 bg-status-success/[0.06] cursor-default'
                        : checked
                          ? 'border-dc1-amber/60 bg-dc1-amber/[0.05]'
                          : 'border-dc1-border bg-dc1-surface-l2/60 hover:bg-dc1-surface-l2'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        auto
                          ? 'border-status-success/40 bg-status-success/20 text-status-success'
                          : checked
                            ? 'border-dc1-amber bg-dc1-amber text-dc1-void'
                            : 'border-dc1-text-muted/50 bg-dc1-surface-l1'
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={auto}
                      onChange={() => toggleAck(row.key)}
                      className="sr-only"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className={`text-sm ${auto ? 'text-status-success' : 'text-dc1-text-primary'}`}>
                        {row.label}
                        {auto && <span className="ml-2 text-[11px] uppercase tracking-[0.1em] text-status-success/80">Auto-verified</span>}
                      </p>
                      {row.hint && !auto && (
                        <p className="text-xs leading-snug text-dc1-text-muted">{row.hint}</p>
                      )}
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
          <PrimaryButton onClick={() => onContinue(effectiveOs, report)} disabled={!allAcked || probing}>
            Continue
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10h10m0 0-4-4m4 4-4 4" />
            </svg>
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Probe row presentation
// ──────────────────────────────────────────────────────────────────────

type RowStatus = ProbeStatus | 'scanning'

function ProbeRow({
  label, status, value, footnote,
}: {
  label: string
  status: RowStatus
  value: string
  footnote?: string
}) {
  const { icon, tone } = iconFor(status)
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.border} ${tone.text}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm text-dc1-text-secondary">{label}</p>
          <p className={`text-sm ${tone.valueText}`}>{value}</p>
        </div>
        {footnote && (
          <p className="mt-1 text-xs leading-snug text-dc1-text-muted">{footnote}</p>
        )}
      </div>
    </li>
  )
}

function iconFor(status: RowStatus): {
  icon: React.ReactNode
  tone: { bg: string; border: string; text: string; valueText: string }
} {
  if (status === 'detected') {
    return {
      icon: (
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
        </svg>
      ),
      tone: {
        bg: 'bg-status-success/10',
        border: 'border border-status-success/30',
        text: 'text-status-success',
        valueText: 'text-dc1-text-primary',
      },
    }
  }
  if (status === 'detected_fuzzy') {
    return {
      icon: (
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6v4m0 3v.01" />
        </svg>
      ),
      tone: {
        bg: 'bg-dc1-amber/10',
        border: 'border border-dc1-amber/30',
        text: 'text-dc1-amber',
        valueText: 'text-dc1-text-primary',
      },
    }
  }
  if (status === 'scanning') {
    return {
      icon: (
        <svg viewBox="0 0 20 20" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M10 3v3m0 8v3m7-7h-3m-8 0H3m12.1-4.9-2.1 2.1M7 13l-2.1 2.1m0-10.2L7 7m6 6 2.1 2.1" />
        </svg>
      ),
      tone: {
        bg: 'bg-dc1-surface-l1',
        border: 'border border-dc1-border',
        text: 'text-dc1-text-muted',
        valueText: 'text-dc1-text-muted',
      },
    }
  }
  // unsupported / unavailable — muted dash
  return {
    icon: (
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" d="M5 10h10" />
      </svg>
    ),
    tone: {
      bg: 'bg-dc1-surface-l1',
      border: 'border border-dc1-border',
      text: 'text-dc1-text-muted',
      valueText: 'text-dc1-text-muted',
    },
  }
}
