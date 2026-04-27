'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import { getProviderActivationNarrative } from '../../lib/provider-activation-narrative'

const API_BASE = '/api'

/**
 * ProviderActivationCard — 3-screen provider activation onboarding flow
 *
 * Screen 1: Dashboard CTA card   — "Activate your GPU — earn $X/mo"
 * Screen 2: 3-step install wizard — OS select → install command → paste API key
 * Screen 3: Connected confirmation — celebrates first heartbeat
 *
 * DCP-679 UX spec / DCP-792 implementation
 */

interface ProviderActivationCardProps {
  providerId: string
  apiKey: string
  /** Called when the provider completes onboarding and wants to go to the dashboard */
  onComplete: () => void
}

type Platform = 'windows' | 'linux' | 'macos'
type WizardStep = 1 | 2 | 3

const PLATFORM_OPTIONS: Array<{ id: Platform; label: string; emoji: string }> = [
  { id: 'linux',   label: 'Linux',   emoji: '🐧' },
  { id: 'windows', label: 'Windows', emoji: '🪟' },
  { id: 'macos',   label: 'macOS',   emoji: '🍎' },
]

// Monthly earnings estimates at 70% utilisation (SAR)
const EARNINGS_ESTIMATES = [
  { label: 'RTX 4090',  sarPerMonth: '4,500 – 7,875' },
  { label: 'H100',      sarPerMonth: '10,500 – 15,750' },
  { label: 'A100 40GB', sarPerMonth: '7,500 – 11,250' },
]

const ACTIVATION_CARD_DISMISSED_KEY = 'provider_activation_dismissed'
const ACTIVATION_COMPLETE_KEY = 'provider_activation_complete'

// ── Screen 1: CTA card ────────────────────────────────────────────────────────
function ActivationCTACard({
  onStart,
  onDismiss,
  isRTL,
}: {
  onStart: () => void
  onDismiss: () => void
  isRTL: boolean
}) {
  const narrative = getProviderActivationNarrative(isRTL)

  return (
    <div className="rounded-xl border border-dc1-amber/30 bg-gradient-to-br from-dc1-amber/5 to-transparent p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-dc1-amber/10 border border-dc1-amber/20">
          <svg className="h-7 w-7 text-dc1-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold text-dc1-text-primary mb-1">
            {narrative.headline}
          </h3>
          <p className="text-sm text-dc1-text-secondary mb-4">
            {narrative.subheadline}
          </p>
          <ul className="mb-4 space-y-1 text-xs text-dc1-text-secondary">
            {narrative.valuePoints.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <span className="mt-0.5 text-dc1-amber">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onStart}
              className="rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-dc1-void hover:brightness-110 transition-all min-h-[44px]"
            >
              {isRTL ? 'ابدأ التفعيل الآن →' : 'Activate now →'}
            </button>
            <Link
              href="/provider-onboarding"
              className="rounded-lg border border-dc1-amber/40 bg-dc1-amber/10 px-5 py-2.5 text-sm font-semibold text-dc1-amber hover:bg-dc1-amber/20 transition-colors min-h-[44px] inline-flex items-center"
            >
              {isRTL ? 'فتح الإعداد الإرشادي' : 'Open guided onboarding'}
            </Link>
            <button
              onClick={onDismiss}
              className="rounded-lg border border-dc1-border px-5 py-2.5 text-sm font-semibold text-dc1-text-secondary hover:text-dc1-text-primary hover:border-dc1-amber/40 transition-colors min-h-[44px]"
            >
              {isRTL ? 'ذكرني لاحقًا' : 'Remind me later'}
            </button>
          </div>
        </div>
      </div>

      {/* Earnings preview */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 border-t border-dc1-border">
        {EARNINGS_ESTIMATES.map(tier => (
          <div key={tier.label} className="rounded-lg bg-dc1-surface-l2 border border-dc1-border px-4 py-3">
            <p className="text-xs text-dc1-text-muted">{tier.label}</p>
            <p className="text-sm font-bold text-dc1-amber mt-0.5">{tier.sarPerMonth} SAR</p>
            <p className="text-[10px] text-dc1-text-muted mt-0.5">est. / month · 70% utilisation</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
        <p className="text-xs font-semibold text-dc1-text-primary mb-2">{narrative.assumptionsTitle}</p>
        <ul className="space-y-1 text-xs text-dc1-text-muted">
          {narrative.assumptions.map((assumption) => (
            <li key={assumption}>• {assumption}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Screen 2: 3-step install wizard (modal overlay) ───────────────────────────
function ActivationWizard({
  providerId,
  apiKey,
  onComplete,
  onBack,
}: {
  providerId: string
  apiKey: string
  onComplete: () => void
  onBack: () => void
}) {
  const [step, setStep] = useState<WizardStep>(1)
  const [platform, setPlatform] = useState<Platform>('linux')
  const [copied, setCopied] = useState(false)
  const [heartbeatDetected, setHeartbeatDetected] = useState(false)

  const isWindows = platform === 'windows'
  const installCommand = useMemo(() => {
    if (isWindows) {
      return `Download the DCP Provider app from https://api.dcp.sa/download/windows`
    }
    return `curl -sSL https://api.dcp.sa/install | bash -s -- ${apiKey}`
  }, [apiKey, isWindows])

  // Poll for first heartbeat while on step 2
  useEffect(() => {
    if (step !== 2 || heartbeatDetected || !apiKey) return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)
        if (!res.ok) return
        const data = await res.json()
        const provider = data?.provider || {}
        const lastHeartbeat = provider.last_heartbeat || provider.last_heartbeat_at || null
        if (!cancelled && lastHeartbeat) {
          setHeartbeatDetected(true)
          setTimeout(() => {
            if (!cancelled) setStep(3)
          }, 900)
        }
      } catch {
        // transient errors expected during first-run setup
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [apiKey, heartbeatDetected, step])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const STEP_LABELS = ['Select OS', 'Install & Connect', 'Verify']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onBack}
          className="absolute right-4 top-4 text-dc1-text-muted hover:text-dc1-text-primary"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-dc1-text-primary">Activate your GPU node</h2>
          <p className="text-sm text-dc1-text-secondary mt-1">
            Step {step} of 3 — {STEP_LABELS[step - 1]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-dc1-surface-l3">
          <div
            className="h-full bg-gradient-to-r from-dc1-amber to-status-success transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Step 1: OS selection + install command */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-dc1-text-primary mb-1">Choose your operating system</h3>
              <p className="text-sm text-dc1-text-secondary">
                Run the install command on the machine with your GPU attached.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPlatform(opt.id)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                    platform === opt.id
                      ? 'border-dc1-amber bg-dc1-amber/20 text-dc1-amber'
                      : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                  }`}
                >
                  <span>{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>

            {isWindows ? (
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-dc1-text-muted">Windows installer</p>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Download and run the DCP Provider installer on your Windows machine.
                </p>
                <a
                  href="https://api.dcp.sa/download/windows"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 min-h-[44px] transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download DCP Provider (.exe)
                </a>
              </div>
            ) : (
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-dc1-text-muted">Install command</p>
                <code className="block whitespace-pre-wrap break-all text-sm text-dc1-text-primary font-mono leading-relaxed">
                  {installCommand}
                </code>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {!isWindows && (
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex items-center gap-2 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2.5 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3 min-h-[44px] transition-colors"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy command
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 min-h-[44px] transition-all"
              >
                {isWindows ? 'I installed the app →' : 'I ran the command →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Waiting for connection */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-dc1-text-primary mb-1">Waiting for your GPU to connect</h3>
              <p className="text-sm text-dc1-text-secondary">
                The daemon will send its first heartbeat automatically. This usually takes 30–60 seconds after installation.
              </p>
            </div>

            {!heartbeatDetected ? (
              <div className="flex items-center gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent shrink-0" />
                <p className="text-sm text-dc1-text-secondary">Listening for heartbeat…</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-status-success/40 bg-status-success/10 p-4">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-status-success text-black text-xs font-bold">✓</span>
                <p className="text-sm font-semibold text-status-success">Heartbeat received! Your GPU is online.</p>
              </div>
            )}

            <p className="text-xs text-dc1-text-muted">
              Your API key: <code className="font-mono bg-dc1-surface-l3 px-1.5 py-0.5 rounded text-dc1-text-secondary">{apiKey.slice(0, 8)}…</code>
            </p>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2.5 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3 min-h-[44px] transition-colors"
              >
                ← Back
              </button>
              {heartbeatDetected && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 min-h-[44px] transition-all"
                >
                  Continue →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-status-success/40 bg-status-success/10 p-5 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h3 className="text-lg font-bold text-dc1-text-primary mb-2">Your GPU is live!</h3>
              <p className="text-sm text-dc1-text-secondary">
                Your node is now active and accepting jobs from the DCP marketplace.
                You will start earning as soon as a renter submits a matching workload.
              </p>
            </div>

            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
              <p className="text-xs text-dc1-text-muted mb-2 uppercase tracking-wide">Share your referral link</p>
              <p className="text-sm font-mono text-dc1-text-primary break-all">
                dcp.sa/earn?ref={providerId}
              </p>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onComplete}
                className="rounded-lg bg-dc1-amber px-6 py-2.5 text-sm font-semibold text-black hover:brightness-110 min-h-[44px] transition-all"
              >
                Go to dashboard →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export: orchestrates the 3-screen flow ───────────────────────────────
export default function ProviderActivationCard({ providerId, apiKey, onComplete }: ProviderActivationCardProps) {
  const { isRTL } = useLanguage()
  const [screen, setScreen] = useState<'cta' | 'wizard' | 'hidden'>(() => {
    if (typeof window === 'undefined') return 'cta'
    if (localStorage.getItem(ACTIVATION_COMPLETE_KEY) === 'true') return 'hidden'
    if (localStorage.getItem(ACTIVATION_CARD_DISMISSED_KEY) === 'true') return 'hidden'
    return 'cta'
  })

  const handleDismiss = () => {
    localStorage.setItem(ACTIVATION_CARD_DISMISSED_KEY, 'true')
    setScreen('hidden')
  }

  const handleComplete = () => {
    localStorage.setItem(ACTIVATION_COMPLETE_KEY, 'true')
    setScreen('hidden')
    onComplete()
  }

  if (screen === 'hidden') return null

  return (
    <>
      {screen === 'cta' && (
        <ActivationCTACard
          onStart={() => setScreen('wizard')}
          onDismiss={handleDismiss}
          isRTL={isRTL}
        />
      )}
      {screen === 'wizard' && (
        <ActivationWizard
          providerId={providerId}
          apiKey={apiKey}
          onComplete={handleComplete}
          onBack={() => setScreen('cta')}
        />
      )}
    </>
  )
}
