'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'
import {
  buildProviderTroubleshootingHref,
  getProviderOnboardingStep,
  ProviderNextActionState,
} from '../../lib/provider-install'
import {
  buildInstallCommand,
  HARDWARE_REQUIREMENT_ROWS,
} from '../../lib/provider-onboarding'
import { trackProviderInstallEvent } from '../../lib/provider-install-telemetry'

const DAEMON_VERSION = 'v4.0'

type OS = 'windows' | 'linux' | 'macos'

// Icons keyed off the shared requirement rows (backlog #8 — single hardware
// matrix; no more RTX-2060-vs-GTX-1060 contradiction).
const REQUIREMENT_ICONS: Record<string, string> = {
  gpu: '🎮',
  python: '🐍',
  os: '💻',
  ram: '🧠',
  internet: '🌐',
}
const REQUIREMENTS = HARDWARE_REQUIREMENT_ROWS.map((row) => ({
  icon: REQUIREMENT_ICONS[row.key] ?? '✅',
  label: row.label,
  detail: row.detail,
}))

export default function ProviderDownloadPage() {
  const { t, language } = useLanguage()
  const [copied, setCopied] = useState<OS | null>(null)
  // Single-use install token (replaces the deprecated long-lived provider key
  // in the install command — backlog #8). Optional here; minted in the /setup
  // wizard. We keep the state name `providerKey` to avoid churning the
  // telemetry payloads below.
  const [providerKey, setProviderKey] = useState('')
  const [copyError, setCopyError] = useState('')
  const [nextActionState, setNextActionState] = useState<ProviderNextActionState>('waiting')
  // The next-action state selector below is a developer-only affordance for
  // previewing each onboarding state. It must never ship to real users — in
  // production the state is driven by the backend heartbeat, not a dropdown.
  const isDevStateSelectorEnabled = process.env.NODE_ENV === 'development'
  // Auto-detect user's OS
  const detectedOs: OS = useMemo(() => {
    if (typeof navigator === 'undefined') return 'windows'
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('win')) return 'windows'
    if (ua.includes('mac')) return 'macos'
    return 'linux'
  }, [])

  // Desktop app is the recommended default on Windows/Mac; Linux uses the
  // canonical headless curl one-liner.
  const osCards: {
    id: OS
    label: string
    icon: string
    primaryLabel: string
    description: string
    downloadUrl?: string
  }[] = useMemo(
    () => [
      {
        id: 'windows',
        label: 'Windows',
        icon: '⊞',
        primaryLabel: 'Download DCP Provider (.exe)',
        description: 'Recommended. One-click installer for Windows 10/11. Includes inference engine, auto GPU detection, and system tray.',
        downloadUrl: 'https://dcp.sa/download/windows',
      },
      {
        id: 'macos',
        label: 'macOS',
        icon: '🍎',
        primaryLabel: 'Download DCP Provider (.dmg)',
        description: 'Recommended. Apple Silicon (M1-M4) with MLX engine. Guided GUI installer — no terminal required.',
        downloadUrl: 'https://dcp.sa/download/mac',
      },
      {
        id: 'linux',
        label: 'Linux',
        icon: '🐧',
        primaryLabel: t('register.provider.copy_install_command'),
        description: 'Headless. Ubuntu 20.04+ with NVIDIA GPU. Auto-installs the inference engine based on VRAM.',
      },
    ],
    [t]
  )
  const installCommands: Record<OS, string> = useMemo(
    () => ({
      windows: buildInstallCommand({ os: 'windows', token: providerKey }),
      linux: buildInstallCommand({ os: 'linux', token: providerKey }),
      macos: buildInstallCommand({ os: 'macos', token: providerKey }),
    }),
    [providerKey]
  )
  const nextActionMap: Record<
    ProviderNextActionState,
    { label: string; desc: string; cta: string; href: string }
  > = {
    waiting: {
      label: t('register.provider.state.waiting.label'),
      desc: t('register.provider.state.waiting.desc'),
      cta: t('register.provider.state.waiting.cta'),
      href: '/docs/provider-guide',
    },
    heartbeat: {
      label: t('register.provider.state.heartbeat.label'),
      desc: t('register.provider.state.heartbeat.desc'),
      cta: t('register.provider.state.heartbeat.cta'),
      href: '/provider',
    },
    ready: {
      label: t('register.provider.state.ready.label'),
      desc: t('register.provider.state.ready.desc'),
      cta: t('register.provider.state.ready.cta'),
      href: '/provider',
    },
    paused: {
      label: t('register.provider.state.paused.label'),
      desc: t('register.provider.state.paused.desc'),
      cta: t('register.provider.state.paused.cta'),
      href: '/provider',
    },
    stale: {
      label: t('register.provider.state.stale.label'),
      desc: t('register.provider.state.stale.desc'),
      cta: t('register.provider.state.stale.cta'),
      href: '/docs/provider-guide',
    },
  }
  const nextAction = nextActionMap[nextActionState]
  const troubleshootingHref = buildProviderTroubleshootingHref(nextActionState)
  const supportHref = `/support?category=provider_install&source=provider_download&state=${nextActionState}#contact-form`
  const stateOptions: ProviderNextActionState[] = ['waiting', 'heartbeat', 'ready', 'paused', 'stale']

  async function handleCopy(os: OS, text: string) {
    // The install command needs a single-use token. Without one we'd only copy
    // a placeholder, so nudge the provider to paste their token (minted in the
    // /setup wizard) first.
    if (!providerKey.trim()) {
      const nextError = t('provider.download.error_missing_key')
      setCopyError(nextError)
      trackProviderInstallEvent('provider_install_copy_blocked', {
        source_page: 'provider_download',
        surface: 'install_command',
        destination: `copy:${os}`,
        locale: language,
        cta_tier: 'primary',
        next_action_state: nextActionState,
        os_target: os,
        has_provider_key: false,
        error_state: 'missing_install_token',
        step: getProviderOnboardingStep(nextActionState),
      })
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopyError('')
      setCopied(os)
      trackProviderInstallEvent('provider_install_copy_clicked', {
        source_page: 'provider_download',
        surface: 'install_command',
        destination: `copy:${os}`,
        locale: language,
        cta_tier: 'primary',
        next_action_state: nextActionState,
        os_target: os,
        has_provider_key: true,
        step: getProviderOnboardingStep(nextActionState),
      })
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopyError(t('provider.download.error_copy_failed'))
      trackProviderInstallEvent('provider_install_copy_failed', {
        source_page: 'provider_download',
        surface: 'install_command',
        destination: `copy:${os}`,
        locale: language,
        cta_tier: 'primary',
        next_action_state: nextActionState,
        os_target: os,
        has_provider_key: true,
        error_state: 'clipboard_write_failed',
        step: getProviderOnboardingStep(nextActionState),
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#07070E', color: '#F0F0F0' }}>
      <Header />

      <main className="flex-1 px-4 py-16 max-w-4xl mx-auto w-full">
        {/* Hero */}
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{ background: 'rgba(245,165,36,0.12)', color: '#F5A524', border: '1px solid rgba(245,165,36,0.25)' }}
          >
            {t('provider.download.current_version')} {DAEMON_VERSION}
          </div>
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#F0F0F0' }}>
            {t('provider.download.title')}
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: '#94A3B8' }}>
            {t('provider.download.subtitle')}
          </p>
          <p className="text-sm max-w-2xl mx-auto mt-3" style={{ color: '#94A3B8' }}>
            {t('provider.trust.runtime')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
            <div className="rounded-lg p-3" style={{ background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.22)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#F5A524' }}>{t('landing.diff_energy_title')}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{t('landing.diff_energy_desc')}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.22)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#F5A524' }}>{t('landing.diff_models_title')}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{t('landing.diff_models_desc')}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.22)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#F5A524' }}>{t('landing.diff_container_title')}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{t('landing.diff_container_desc')}</p>
            </div>
          </div>
        </div>

        {/* Install token — single-use, minted in the /setup wizard. Replaces
            the deprecated long-lived provider key in the install command. */}
        <section className="mb-8">
          <div className="rounded-xl p-5" style={{ background: '#0D0D1A', border: '1px solid rgba(245,165,36,0.22)' }}>
            <label className="block text-sm font-semibold mb-2" style={{ color: '#F0F0F0' }}>
              Install token
            </label>
            <input
              value={providerKey}
              onChange={(event) => {
                setProviderKey(event.target.value)
                if (copyError) setCopyError('')
              }}
              placeholder="paste your single-use install token"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: '#07070E', color: '#F0F0F0', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
              Generate a single-use install token in the{' '}
              <Link href="/setup" className="font-semibold" style={{ color: '#F5A524' }}>
                setup wizard
              </Link>
              , then paste it here to fill the install command below.
            </p>
          </div>
        </section>

        {isDevStateSelectorEnabled && (
          <section className="mb-8">
            <div className="rounded-xl p-5" style={{ background: '#0D0D1A', border: '1px solid rgba(245,165,36,0.22)' }}>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#F0F0F0' }}>
                {t('provider.download.state_selector_label')}
              </label>
              <select
                value={nextActionState}
                onChange={(event) => setNextActionState(event.target.value as ProviderNextActionState)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#07070E', color: '#F0F0F0', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {nextActionMap[state].label}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
                {t('provider.download.state_selector_hint')}
              </p>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {osCards.map((card) => {
            const isDetected = card.id === detectedOs
            return (
              <div
                key={card.id}
                className="rounded-xl p-6 flex flex-col gap-5 relative"
                style={{
                  background: '#0D0D1A',
                  border: isDetected ? '2px solid rgba(0,229,200,0.5)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {isDetected && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(0,229,200,0.15)', color: '#00E5C8', border: '1px solid rgba(0,229,200,0.3)' }}
                  >
                    Your system
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-hidden="true">{card.icon}</span>
                  <span className="text-lg font-semibold" style={{ color: '#F0F0F0' }}>{card.label}</span>
                </div>

                {/* Windows: Download button. Mac/Linux: curl command */}
                {card.downloadUrl ? (
                  <>
                    <p className="text-sm" style={{ color: '#94A3B8' }}>{card.description}</p>
                    <a
                      href={card.downloadUrl}
                      download
                      className="mt-auto py-3 px-4 rounded-lg font-semibold text-sm text-center transition-all hover:opacity-90"
                      style={{
                        background: 'linear-gradient(135deg, #00E5C8, #00B4A0)',
                        color: '#07070E',
                      }}
                      onClick={() =>
                        trackProviderInstallEvent('provider_install_cta_clicked', {
                          source_page: 'provider_download',
                          surface: 'download_button',
                          destination: card.downloadUrl!,
                          locale: language,
                          cta_tier: 'primary',
                          next_action_state: nextActionState,
                          os_target: card.id,
                          has_provider_key: Boolean(providerKey.trim()),
                          step: getProviderOnboardingStep(nextActionState),
                        })
                      }
                    >
                      {card.primaryLabel}
                    </a>
                    <p className="text-xs text-center" style={{ color: '#64748B' }}>
                      4 MB &middot; No admin required &middot; v{DAEMON_VERSION}
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      className="rounded-lg px-3 py-3 font-mono text-xs break-all"
                      style={{ background: '#07070E', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {installCommands[card.id]}
                    </div>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{card.description}</p>
                    <button
                      onClick={() => handleCopy(card.id, installCommands[card.id])}
                      className="mt-auto py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors"
                      style={{
                        background: copied === card.id ? 'rgba(34,197,94,0.15)' : 'rgba(245,165,36,0.12)',
                        color: copied === card.id ? '#22C55E' : '#F5A524',
                        border: copied === card.id ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(245,165,36,0.25)',
                      }}
                      aria-label={`Copy install command for ${card.label}`}
                    >
                      {copied === card.id ? t('provider.download.copied') : card.primaryLabel}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {copyError && (
          <section className="mb-10">
            <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-4">
              <p className="text-sm font-semibold text-status-warning">{copyError}</p>
              <p className="text-xs mt-2 text-dc1-text-secondary">{t('provider.download.error_help')}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={troubleshootingHref}
                  className="text-xs font-semibold text-dc1-amber hover:underline"
                  onClick={() =>
                    trackProviderInstallEvent('provider_install_help_clicked', {
                      source_page: 'provider_download',
                      surface: 'copy_error',
                      destination: troubleshootingHref,
                      locale: language,
                      cta_tier: 'secondary',
                      next_action_state: nextActionState,
                      has_provider_key: Boolean(providerKey.trim()),
                      step: getProviderOnboardingStep(nextActionState),
                    })
                  }
                >
                  {t('register.provider.status_matrix.guide_cta')}
                </Link>
                <Link
                  href={supportHref}
                  className="text-xs font-semibold text-dc1-amber hover:underline"
                  onClick={() =>
                    trackProviderInstallEvent('provider_install_help_clicked', {
                      source_page: 'provider_download',
                      surface: 'copy_error',
                      destination: supportHref,
                      locale: language,
                      cta_tier: 'secondary',
                      next_action_state: nextActionState,
                      has_provider_key: Boolean(providerKey.trim()),
                      step: getProviderOnboardingStep(nextActionState),
                    })
                  }
                >
                  {t('register.provider.next_action_support_cta')}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Removed old standalone Windows installer link — now integrated into OS cards above */}

        <section className="mb-14">
          <div className="rounded-xl p-6" style={{ background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.22)' }}>
            <h2 className="text-lg font-semibold mb-3" style={{ color: '#F0F0F0' }}>
              {t('billing.explainer.title')}
            </h2>
            <ul className="space-y-2 text-sm" style={{ color: '#94A3B8' }}>
              <li>{t('billing.explainer.step1')}</li>
              <li>{t('billing.explainer.step2')}</li>
              <li>{t('billing.explainer.step3')}</li>
            </ul>
            <p className="mt-3 text-xs" style={{ color: '#64748B' }}>{t('billing.explainer.note')}</p>
            <p className="mt-2 text-xs" style={{ color: '#64748B' }}>{t('billing.explainer.rail_status')}</p>
          </div>
        </section>

        <section className="mb-14">
          <div className="rounded-xl p-6" style={{ background: '#0D0D1A', border: '1px solid rgba(245,165,36,0.22)' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: '#F5A524' }}>{t('register.provider.next_action_title')}</p>
            <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(245,165,36,0.3)', background: 'rgba(245,165,36,0.12)' }}>
              <p className="text-sm font-semibold" style={{ color: '#F5A524' }}>{nextAction.label}</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{nextAction.desc}</p>
              <Link
                href={nextAction.href}
                className="inline-flex mt-3 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(245,165,36,0.18)', color: '#F5A524', border: '1px solid rgba(245,165,36,0.35)' }}
                onClick={() =>
                  trackProviderInstallEvent('provider_install_cta_clicked', {
                    source_page: 'provider_download',
                    surface: 'next_action',
                    destination: nextAction.href,
                    locale: language,
                    cta_tier: 'primary',
                    next_action_state: nextActionState,
                    has_provider_key: Boolean(providerKey.trim()),
                    step: getProviderOnboardingStep(nextActionState),
                  })
                }
              >
                {nextAction.cta}
              </Link>
              <Link
                href={troubleshootingHref}
                className="inline-flex mt-3 ms-0 sm:ms-3 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(148,163,184,0.12)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.35)' }}
                onClick={() =>
                  trackProviderInstallEvent('provider_install_cta_clicked', {
                    source_page: 'provider_download',
                    surface: 'next_action',
                    destination: troubleshootingHref,
                    locale: language,
                    cta_tier: 'secondary',
                    next_action_state: nextActionState,
                    has_provider_key: Boolean(providerKey.trim()),
                    step: getProviderOnboardingStep(nextActionState),
                  })
                }
              >
                {t('register.provider.status_matrix.guide_cta')}
              </Link>
            </div>
          </div>
        </section>

        {/* System Requirements */}
        <section aria-labelledby="requirements-heading" className="mb-14">
          <h2
            id="requirements-heading"
            className="text-xl font-semibold mb-6"
            style={{ color: '#F0F0F0' }}
          >
            {t('provider.download.requirements')}
          </h2>
          <div
            className="rounded-xl divide-y"
            style={{ background: '#0D0D1A', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {REQUIREMENTS.map((req) => (
              <div
                key={req.label}
                className="flex items-start gap-4 px-6 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-xl flex-shrink-0 mt-0.5" role="img" aria-hidden="true">{req.icon}</span>
                <div>
                  <p className="font-medium text-sm mb-0.5" style={{ color: '#F0F0F0' }}>{req.label}</p>
                  <p className="text-sm" style={{ color: '#64748B' }}>{req.detail}</p>
                </div>
                <span
                  className="ml-auto flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}
                  aria-hidden="true"
                >
                  ✓
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Help */}
        <div
          className="rounded-xl px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ background: 'rgba(245,165,36,0.06)', border: '1px solid rgba(245,165,36,0.18)' }}
        >
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: '#F5A524' }}>{t('provider.download.help_title')}</p>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              {t('provider.download.help_desc')}
            </p>
          </div>
          <a
            href={supportHref}
            className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: '#F5A524', color: '#07070E' }}
            onClick={() =>
              trackProviderInstallEvent('provider_install_cta_clicked', {
                source_page: 'provider_download',
                surface: 'help_module',
                destination: supportHref,
                locale: language,
                cta_tier: 'secondary',
                next_action_state: nextActionState,
                has_provider_key: Boolean(providerKey.trim()),
                step: getProviderOnboardingStep(nextActionState),
              })
            }
          >
            {t('provider.download.get_support')}
          </a>
        </div>
      </main>

      <Footer />
    </div>
  )
}
