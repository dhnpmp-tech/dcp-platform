'use client'

// WizardShell — orchestrates the 6-step provider onboarding flow.
//
// Top-level responsibilities:
//   1. Hydrate wizard session from sessionStorage (survives refresh)
//   2. Drive step transitions + keep session in sync
//   3. Mount the correct step component and pass it typed callbacks
//   4. Handle the auth handoff: if credentials are passed in via URL/session
//      we skip Step 1; if they're absent we show Step 1 (magic-link email).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  loadSession, saveSession, WizardProgress,
} from './primitives'
import {
  STEP_LABELS, defaultSession,
  type WizardSession, type Credentials, type StepId, type GpuSelection,
  type WizardConfig,
} from './types'
import { detectOS, type DetectedOS } from './os-detect'
import type { ProbeReport } from './hardware-probe'
import { Step1Auth } from './steps/Step1Auth'
import { Step2Requirements } from './steps/Step2Requirements'
import { Step3GpuProfile } from './steps/Step3GpuProfile'
import { Step4Earnings } from './steps/Step4Earnings'
import { Step5Install } from './steps/Step5Install'
import { Step6Verify } from './steps/Step6Verify'

const SESSION_KEY = 'dcp_wizard_v1_session'

interface WizardShellProps {
  initialCredentials: Credentials | null
  onComplete: () => void
}

export function WizardShell({ initialCredentials, onComplete }: WizardShellProps) {
  const router = useRouter()
  const [session, setSession] = useState<WizardSession>(() => {
    const base = loadSession<WizardSession>(SESSION_KEY, defaultSession())
    // If we were handed fresh credentials via URL / sessionStorage, use them
    // and advance past Step 1 if we were still sitting there.
    if (initialCredentials) {
      const step = base.currentStep < 2 ? 2 : base.currentStep
      return { ...base, credentials: initialCredentials, currentStep: step as StepId }
    }
    return base
  })
  const [os, setOs] = useState<DetectedOS>(() => detectOS())

  useEffect(() => { saveSession(SESSION_KEY, session) }, [session])

  const setStep = useCallback((n: StepId) => {
    setSession((prev) => ({ ...prev, currentStep: n }))
  }, [])

  // ── Step callbacks ──────────────────────────────────────────────────────
  const handleEmailSent = useCallback(() => {
    // Step 1's work is done — the user now has to click the magic link. We
    // leave them on Step 1's "check your email" confirmation; when they come
    // back via /auth/callback the shell re-mounts with initialCredentials
    // and advances automatically.
  }, [])

  const handleRequirementsContinue = useCallback((pickedOs: DetectedOS, report: ProbeReport | null) => {
    setOs(pickedOs)
    setSession((prev) => ({
      ...prev,
      requirementsAck: true,
      probeReport: report,
      currentStep: 3,
    }))
  }, [])

  const handleGpuSaved = useCallback((gpus: GpuSelection[], hourlyUsd: number) => {
    setSession((prev) => ({ ...prev, gpus, hourlyUsd, currentStep: 4 }))
  }, [])

  const handleConfigSaved = useCallback((config: WizardConfig, hrsPerDay: number) => {
    setSession((prev) => ({ ...prev, config, hrsPerDay, currentStep: 5 }))
  }, [])

  const handleTokenReady = useCallback((token: string, expiresAt: string) => {
    setSession((prev) => ({ ...prev, installToken: token, installTokenExpires: expiresAt }))
  }, [])

  const handleInstallContinue = useCallback(() => setStep(6), [setStep])

  const handleDone = useCallback(() => {
    saveSession(SESSION_KEY, defaultSession())
    onComplete()
    router.push('/provider/dashboard?activated=1')
  }, [onComplete, router])

  // ── Render ──────────────────────────────────────────────────────────────
  const apiKey = session.credentials?.apiKey

  return (
    <div className="space-y-6">
      <WizardProgress currentStep={session.currentStep} steps={STEP_LABELS} />

      {session.currentStep === 1 && (
        <Step1Auth onEmailSent={handleEmailSent} />
      )}

      {session.currentStep === 2 && apiKey && (
        <Step2Requirements
          initialOs={os}
          initialReport={session.probeReport}
          onContinue={handleRequirementsContinue}
          onBack={() => setStep(1)}
        />
      )}

      {session.currentStep === 3 && apiKey && (
        <Step3GpuProfile
          apiKey={apiKey}
          os={os}
          probeReport={session.probeReport}
          initialGpus={session.gpus}
          onSaved={handleGpuSaved}
          onBack={() => setStep(2)}
        />
      )}

      {session.currentStep === 4 && apiKey && session.hourlyUsd !== null && (
        <Step4Earnings
          apiKey={apiKey}
          os={os}
          hourlyUsd={session.hourlyUsd}
          initialHrsPerDay={session.hrsPerDay}
          initialConfig={session.config}
          onSaved={handleConfigSaved}
          onBack={() => setStep(3)}
        />
      )}

      {session.currentStep === 5 && apiKey && (
        <Step5Install
          apiKey={apiKey}
          os={os}
          initialToken={session.installToken}
          initialExpires={session.installTokenExpires}
          onTokenReady={handleTokenReady}
          onContinue={handleInstallContinue}
          onBack={() => setStep(4)}
        />
      )}

      {session.currentStep === 6 && apiKey && (
        <Step6Verify
          apiKey={apiKey}
          onBack={() => setStep(5)}
          onDone={handleDone}
        />
      )}

      {/* Guard: if somehow we're on a gated step without credentials, bounce to Step 1. */}
      {session.currentStep > 1 && !apiKey && (
        <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 text-center">
          <p className="text-sm text-dc1-text-secondary">
            Your session expired. Please sign in again.
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-3 text-sm text-dc1-amber hover:underline"
          >
            Back to sign in →
          </button>
        </div>
      )}
    </div>
  )
}
