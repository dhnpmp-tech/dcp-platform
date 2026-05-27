'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'

interface ProviderWizardProps {
  providerId: string
  apiKey: string
  onComplete: () => void
  onDismiss: () => void
  onHeartbeatDetected?: () => void
}

type Platform = 'windows' | 'linux' | 'macos'

const WIZARD_STORAGE_KEY = 'wizard_completed'

const platformOptions: Array<{ id: Platform; label: string }> = [
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'macos', label: 'macOS' },
]

export default function ProviderWizard({
  providerId,
  apiKey,
  onComplete,
  onDismiss,
  onHeartbeatDetected,
}: ProviderWizardProps) {
  const { t } = useLanguage()
  const [step, setStep] = useState(1)
  const [platform, setPlatform] = useState<Platform>('windows')
  const [copied, setCopied] = useState(false)
  const [heartbeatDetected, setHeartbeatDetected] = useState(false)

  // Payout IBAN registration (wizard step 4, before completion)
  const [iban, setIban] = useState('')
  const [holderName, setHolderName] = useState('')
  const [ibanSaving, setIbanSaving] = useState(false)
  const [ibanSaved, setIbanSaved] = useState(false)
  const [ibanError, setIbanError] = useState('')

  const submitPayoutAccount = async (): Promise<boolean> => {
    setIbanError('')
    const normalizedIban = iban.trim().toUpperCase().replace(/\s+/g, '')
    if (!/^SA\d{22}$/.test(normalizedIban)) {
      setIbanError('IBAN must be Saudi format: SA followed by 22 digits.')
      return false
    }
    if (!holderName.trim() || holderName.trim().length < 2) {
      setIbanError('Account holder name is required.')
      return false
    }
    setIbanSaving(true)
    try {
      const res = await fetch(`/api/providers/${providerId}/payout-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-provider-key': apiKey },
        body: JSON.stringify({ iban: normalizedIban, holder_name: holderName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setIbanError(body.message || 'Could not register payout account')
        return false
      }
      setIbanSaved(true)
      return true
    } catch {
      setIbanError('Network error — try again or skip and finish in Settings.')
      return false
    } finally {
      setIbanSaving(false)
    }
  }

  const isWindows = platform === 'windows'
  const installCommand = useMemo(() => {
    if (isWindows) {
      return `Download the DCP Provider app from https://api.dcp.sa/download/windows`
    }
    return `curl -sSL https://api.dcp.sa/install | bash -s -- ${apiKey}`
  }, [apiKey, isWindows])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (step !== 2 || heartbeatDetected || !apiKey) return

    let cancelled = false
    const API_BASE = '/api'

    const pollHeartbeat = async () => {
      try {
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)
        if (!res.ok) return
        const data = await res.json()
        const provider = data?.provider || {}
        const lastHeartbeat =
          provider.last_heartbeat ||
          provider.last_heartbeat_at ||
          provider.lastHeartbeat ||
          null

        if (!cancelled && lastHeartbeat) {
          setHeartbeatDetected(true)
          onHeartbeatDetected?.()
          setTimeout(() => {
            if (!cancelled) {
              setStep(3)
            }
          }, 900)
        }
      } catch {
        // keep polling; transient failures are expected on first-run setup
      }
    }

    pollHeartbeat()
    const interval = setInterval(pollHeartbeat, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [apiKey, heartbeatDetected, onHeartbeatDetected, step])

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const finishWizard = () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, 'true')
    onComplete()
  }

  const closeWizard = () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, 'true')
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-3xl rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 shadow-2xl">
        <button
          type="button"
          onClick={closeWizard}
          className="absolute right-4 top-4 text-dc1-text-muted hover:text-dc1-text-primary"
          aria-label={t('provider.wizard.dismiss')}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-dc1-text-primary">{t('provider.wizard.title')}</h2>
          <span className="rounded-full bg-dc1-amber/20 px-3 py-1 text-xs font-semibold text-dc1-amber">
            {t('provider.wizard.step_count').replace('{current}', String(step)).replace('{total}', '4')}
          </span>
        </div>

        <div className="mb-6 h-2 overflow-hidden rounded-full bg-dc1-surface-l3">
          <div
            className="h-full bg-gradient-to-r from-dc1-amber to-status-success transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-dc1-text-primary">{t('provider.wizard.step1.title')}</h3>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('provider.wizard.step1.desc')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {platformOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlatform(item.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    platform === item.id
                      ? 'border-dc1-amber bg-dc1-amber/20 text-dc1-amber'
                      : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {isWindows ? (
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-dc1-text-muted">{t('provider.wizard.install_command')}</p>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Download and run the DCP Provider installer on your Windows machine.
                </p>
                <a
                  href="https://api.dcp.sa/download/windows"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download DCP Provider (.exe)
                </a>
              </div>
            ) : (
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-dc1-text-muted">{t('provider.wizard.install_command')}</p>
                <code className="block whitespace-pre-wrap break-all text-sm text-dc1-text-primary">{installCommand}</code>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {!isWindows && (
                <button
                  type="button"
                  onClick={copyInstallCommand}
                  className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3"
                >
                  {copied ? t('provider.wizard.copied') : t('provider.wizard.copy')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
              >
                {t('provider.wizard.next')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-dc1-text-primary">{t('provider.wizard.step2.title')}</h3>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('provider.wizard.step2.desc')}</p>
            </div>

            {!heartbeatDetected ? (
              <div className="flex items-center gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent" />
                <p className="text-sm text-dc1-text-secondary">{t('provider.wizard.step2.waiting')}</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-status-success/40 bg-status-success/10 p-4">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-status-success text-black">✓</span>
                <p className="text-sm font-semibold text-status-success">{t('provider.wizard.step2.connected')}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3"
              >
                {t('provider.wizard.back')}
              </button>
              {heartbeatDetected && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
                >
                  {t('provider.wizard.next')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-dc1-text-primary">{t('provider.wizard.step3.title')}</h3>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('provider.wizard.step3.desc')}</p>
            </div>

            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-dc1-text-muted">{t('provider.wizard.test_command')}</p>
              <code className="block text-sm text-dc1-text-primary">dcp-provider test</code>
            </div>

            <a
              href="/renter/playground"
              className="inline-flex text-sm font-semibold text-dc1-amber hover:underline"
            >
              {t('provider.wizard.step3.link')}
            </a>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3"
              >
                {t('provider.wizard.back')}
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
              >
                {t('provider.wizard.next')}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-dc1-text-primary">Register payout account</h3>
              <p className="mt-1 text-sm text-dc1-text-secondary">
                Your earnings (75% of every job) accumulate in DCP. Register a Saudi IBAN now so we can
                send payouts via Moyasar without admin handholding. You can also do this later in Settings.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-dc1-text-muted mb-1">
                  Saudi IBAN
                </label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="SA00 0000 0000 0000 0000 0000"
                  maxLength={32}
                  className="w-full px-3 py-2 rounded border border-dc1-border bg-dc1-surface-l2 text-sm font-mono text-dc1-text-primary tracking-wider"
                />
                <p className="mt-1 text-xs text-dc1-text-muted">SA followed by 22 digits. Spaces stripped automatically.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-dc1-text-muted mb-1">
                  Account holder name
                </label>
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="Full name as on the bank account"
                  maxLength={140}
                  className="w-full px-3 py-2 rounded border border-dc1-border bg-dc1-surface-l2 text-sm text-dc1-text-primary"
                />
              </div>
            </div>

            {ibanError && <p className="text-sm text-status-error">{ibanError}</p>}
            {ibanSaved && <p className="text-sm text-status-success">Payout account registered ✓</p>}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3"
                disabled={ibanSaving}
              >
                {t('provider.wizard.back')}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm text-dc1-text-secondary hover:text-dc1-text-primary"
                  disabled={ibanSaving}
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await submitPayoutAccount()
                    if (ok) setStep(5)
                  }}
                  className="rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
                  disabled={ibanSaving}
                >
                  {ibanSaving ? 'Saving…' : 'Save & continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="relative overflow-hidden rounded-xl border border-status-success/40 bg-status-success/10 p-5">
            <div className="absolute inset-x-0 top-0 h-20 confetti-strip" />
            <h3 className="text-lg font-semibold text-dc1-text-primary">{t('provider.wizard.step4.title')}</h3>
            <p className="mt-1 text-sm text-dc1-text-secondary">{t('provider.wizard.step4.desc')}</p>
            <p className="mt-3 break-all rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-sm text-dc1-text-primary">
              dcp.sa/earn?ref={providerId}
            </p>
            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={finishWizard}
                className="rounded-lg bg-dc1-amber px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
              >
                {t('provider.wizard.go_dashboard')}
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .confetti-strip {
          background:
            radial-gradient(circle at 10% 40%, #f5a524 4px, transparent 5px),
            radial-gradient(circle at 30% 65%, #22c55e 4px, transparent 5px),
            radial-gradient(circle at 50% 35%, #38bdf8 4px, transparent 5px),
            radial-gradient(circle at 70% 60%, #f43f5e 4px, transparent 5px),
            radial-gradient(circle at 90% 30%, #f5a524 4px, transparent 5px);
          animation: confettiDrop 1.8s ease-in-out infinite;
          opacity: 0.9;
        }

        @keyframes confettiDrop {
          0% {
            transform: translateY(-8px);
            opacity: 0;
          }
          35% {
            opacity: 1;
          }
          100% {
            transform: translateY(20px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
