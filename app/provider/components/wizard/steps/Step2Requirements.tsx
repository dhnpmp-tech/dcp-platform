'use client'

// Step 2: System Requirements Check (informational).
// The wizard can't probe the provider's hardware, so this step shows an
// OS-specific checklist and asks the provider to self-confirm.

import { useState } from 'react'
import { PrimaryButton, SecondaryButton } from '../primitives'
import { detectOS, OS_PROFILES, type DetectedOS } from '../os-detect'
import { OSGlyph } from '../os-icons'

interface Step2Props {
  initialOs?: DetectedOS
  onContinue: (os: DetectedOS) => void
  onBack: () => void
}

const OS_CHOICES: DetectedOS[] = ['windows', 'macos', 'linux']

export function Step2Requirements({ initialOs, onContinue, onBack }: Step2Props) {
  const [os, setOs] = useState<DetectedOS>(initialOs ?? detectOS())
  const [ack, setAck] = useState(false)
  const [showDetect, setShowDetect] = useState(false)
  const profile = OS_PROFILES[os === 'unknown' ? 'windows' : os]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-dc1-border bg-dc1-surface-l1">
      {/* subtle top glow — matches the amber accent used across DCP */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-dc1-amber/10 via-dc1-amber/[0.03] to-transparent"
      />

      <div className="relative space-y-8 p-6 md:p-9">
        {/* Header */}
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dc1-amber/80">
            Pre-flight check
          </p>
          <h2 className="text-2xl font-bold leading-tight text-dc1-text-primary md:text-[28px]">
            Can your machine run DCP?
          </h2>
          <p className="max-w-xl text-sm text-dc1-text-secondary">
            Pick your operating system — we&apos;ll show the exact floor you need. The daemon
            re-verifies everything automatically after install, so nothing here is binding.
          </p>
        </header>

        {/* OS selector */}
        <section aria-labelledby="os-label" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p id="os-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-text-muted">
              Operating system
            </p>
            {os === 'unknown' && (
              <p className="text-[11px] text-dc1-text-muted">Not auto-detected — pick one below.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {OS_CHOICES.map((k) => {
              const p = OS_PROFILES[k]
              const active = os === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOs(k)}
                  aria-pressed={active}
                  className={`group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? 'border-dc1-amber bg-dc1-amber/[0.06] shadow-[0_0_0_1px_rgba(0,0,0,0)]'
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

        {/* Requirements */}
        <section
          aria-labelledby="reqs-label"
          className="rounded-xl border border-dc1-border bg-dc1-surface-l2/60"
        >
          <div className="flex items-center justify-between gap-3 border-b border-dc1-border/60 px-5 py-3">
            <p id="reqs-label" className="text-sm font-semibold text-dc1-text-primary">
              What {profile.label} needs
            </p>
            <p className="hidden text-[11px] uppercase tracking-[0.14em] text-dc1-text-muted sm:block">
              Minimum floor
            </p>
          </div>

          <ul className="divide-y divide-dc1-border/60">
            {profile.minReqs.map((req) => (
              <li key={req} className="flex items-center gap-3 px-5 py-3">
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-status-success/30 bg-status-success/10 text-status-success"
                >
                  <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
                  </svg>
                </span>
                <span className="text-sm text-dc1-text-secondary">{req}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-dc1-border/60 px-5 py-3">
            <p className="text-xs text-dc1-text-muted">Not sure about your GPU?</p>
            <button
              type="button"
              onClick={() => setShowDetect(!showDetect)}
              className="text-xs font-semibold text-dc1-amber hover:underline"
              aria-expanded={showDetect}
            >
              {showDetect ? 'Hide hint' : 'Show hint'}
            </button>
          </div>

          {showDetect && (
            <div className="border-t border-dc1-border/60 bg-dc1-surface-l1/60 px-5 py-3">
              <p className="text-xs leading-relaxed text-dc1-text-secondary">{profile.gpuDetectHint}</p>
            </div>
          )}
        </section>

        {/* Acknowledgement */}
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
            ack
              ? 'border-dc1-amber/60 bg-dc1-amber/[0.05]'
              : 'border-dc1-border bg-dc1-surface-l2/60 hover:bg-dc1-surface-l2'
          }`}
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
              ack
                ? 'border-dc1-amber bg-dc1-amber text-dc1-void'
                : 'border-dc1-text-muted/50 bg-dc1-surface-l1'
            }`}
          >
            {ack && (
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 10.5 3.5 3.5L15 6.5" />
              </svg>
            )}
          </span>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="sr-only"
          />
          <span className="text-sm text-dc1-text-primary">
            My machine meets these requirements.
          </span>
        </label>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
          <PrimaryButton onClick={() => onContinue(os)} disabled={!ack}>
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
