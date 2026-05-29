'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import { useLanguage } from './lib/i18n'
import { persistRoleIntent, readRoleIntent, RoleIntent, trackRoleIntentApplied } from './lib/role-intent'
import { usePublicMetricsContract } from './lib/usePublicMetricsContract'

function formatReliabilityTimestamp(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

interface DetailedHealth {
  providers: { registered: number | null; online: number | null }
}

function LaunchBanner({ health }: { health: DetailedHealth | null }) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('dcp-launch-banner-dismissed') === '1') {
      setDismissed(true)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('dcp-launch-banner-dismissed', '1')
    }
  }

  const registered = health?.providers?.registered ?? 0
  const online = health?.providers?.online ?? 0
  const showBanner = !dismissed && online === 0 && registered >= 40

  if (!showBanner) return null

  return (
    <div className="relative bg-dc1-amber/10 border-b border-dc1-amber/30 px-4 py-3 text-center">
      <p className="text-sm text-dc1-text-primary">
        <span className="font-semibold text-dc1-amber">DCP Phase 1 is live</span>
        {' — '}
        {registered} providers joining. Be first to deploy Arabic AI in-Kingdom.{' '}
        <Link href="/marketplace/models" className="font-semibold text-dc1-amber underline hover:text-dc1-amber/80">
          Start Building →
        </Link>
      </p>
      <button
        onClick={dismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-dc1-text-muted hover:text-dc1-text-primary"
        aria-label="Dismiss banner"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function ProviderCountWidget({
  health,
  unavailableLabel,
}: {
  health: DetailedHealth | null
  unavailableLabel: string
}) {
  const { t } = useLanguage()
  const online = health?.providers?.online ?? null
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={`inline-block h-2 w-2 rounded-full transition-colors ${
          online === null ? 'bg-dc1-text-muted/40 animate-pulse' : online > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-dc1-text-muted/40'
        }`}
      />
      <span className={`font-bold tabular-nums transition-all ${online !== null && online > 0 ? 'text-emerald-400' : 'text-dc1-text-muted'}`}>
        {online !== null ? online.toLocaleString() : unavailableLabel}
      </span>
      <span className="text-dc1-text-secondary">{t('landing.stat_gpus_online')}</span>
    </span>
  )
}

export default function HomePage() {
  const { t } = useLanguage()
  const { snapshot } = usePublicMetricsContract()
  const [selectedIntent, setSelectedIntent] = useState<RoleIntent>('renter')
  const billingExplainerRef = useRef<HTMLDivElement | null>(null)
  const hasTrackedBillingExplainerView = useRef(false)
  const liveProviderCount = snapshot?.providersOnline ?? null
  const registeredProviderCount = snapshot?.providersRegistered ?? null
  const reliabilityUpdatedAt = snapshot?.snapshotAt ? new Date(snapshot.snapshotAt) : null
  const detailedHealth: DetailedHealth | null = snapshot
    ? {
        providers: {
          registered: snapshot.providersRegistered,
          online: snapshot.providersOnline,
        },
      }
    : null
  const unavailableLabel = t('landing.metric_unavailable_neutral')

  const trackLandingEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = {
      event,
      source_page: 'landing',
      role_intent: selectedIntent,
      surface: 'landing_page',
      destination: 'none',
      step: 'view',
      ...payload,
    }
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
    const win = window as typeof window & {
      dataLayer?: Array<Record<string, unknown>>
      gtag?: (...args: unknown[]) => void
    }
    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(detail)
    }
    if (typeof win.gtag === 'function') {
      win.gtag('event', event, detail)
    }
  }, [selectedIntent])

  const updateIntent = (intent: RoleIntent, source: string, selectionType: string) => {
    const previousIntent = selectedIntent
    setSelectedIntent(intent)
    persistRoleIntent(intent, {
      source,
      previousIntent,
      reason: previousIntent && previousIntent !== intent ? 'overridden' : 'persisted',
    })
    trackLandingEvent('landing_path_selected', {
      role_intent: intent,
      surface: source,
      destination: 'intent_selection',
      step: selectionType,
    })
  }

  const features = [
    {
      title: t('landing.feat_payg_title'),
      description: t('landing.feat_payg_desc'),
      cta: t('landing.feat_payg_cta'),
      href: '/renter/register',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: t('landing.feat_pdpl_title'),
      description: t('landing.feat_pdpl_desc'),
      cta: t('landing.feat_pdpl_cta'),
      href: '/privacy',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      title: 'OpenAI-Compatible API',
      description: 'Drop-in replacement for OpenAI API. Use your existing code with Arabic AI models hosted in Saudi Arabia.',
      cta: t('landing.feat_vllm_cta'),
      href: '/docs',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
  ]

  useEffect(() => {
    const storedIntent = readRoleIntent()
    if (storedIntent) {
      setSelectedIntent(storedIntent)
      trackRoleIntentApplied(storedIntent, { source: 'landing', destination: 'hero_paths' })
    }
  }, [])

  useEffect(() => {
    const node = billingExplainerRef.current
    if (!node || hasTrackedBillingExplainerView.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (hasTrackedBillingExplainerView.current) return
        if (entries.some((entry) => entry.isIntersecting)) {
          hasTrackedBillingExplainerView.current = true
          trackLandingEvent('billing_explainer_viewed', {
            surface: 'billing_explainer',
            destination: 'onscreen',
            step: 'view',
          })
          observer.disconnect()
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [trackLandingEvent])

  const liveStats = [
    {
      value: liveProviderCount !== null ? liveProviderCount.toLocaleString() : unavailableLabel,
      label: t('landing.stat_gpus_online'),
      live: liveProviderCount !== null,
    },
    {
      value: registeredProviderCount !== null ? registeredProviderCount.toLocaleString() : unavailableLabel,
      label: t('landing.stat_providers_registered'),
      live: registeredProviderCount !== null,
    },
    {
      value: reliabilityUpdatedAt ? formatReliabilityTimestamp(reliabilityUpdatedAt) : unavailableLabel,
      label: t('landing.live_stat_last_updated'),
      live: reliabilityUpdatedAt !== null,
    },
  ]

  const trustPolicies = [
    {
      title: t('landing.trust_settlement_title'),
      description: t('landing.trust_settlement_desc'),
    },
    {
      title: t('landing.trust_execution_title'),
      description: t('landing.trust_execution_desc'),
    },
    {
      title: t('landing.trust_models_title'),
      description: t('landing.trust_models_desc'),
    },
  ]
  const segmentProofItems = [
    t('proof.segment.item_energy'),
    t('proof.segment.item_models'),
    t('proof.segment.item_execution'),
  ]
  const modeStripItems = [
    { key: 'marketplace', label: t('mode.label.marketplace'), description: t('mode.desc.marketplace'), href: '/renter/marketplace' },
    { key: 'playground', label: t('mode.label.playground'), description: t('mode.desc.playground'), href: '/renter/playground?starter=1' },
    { key: 'docs_api', label: t('mode.label.docs_api'), description: t('mode.desc.docs_api'), href: '/docs/api/openrouter-60s-quickstart' },
    { key: 'enterprise_support', label: t('mode.label.enterprise_support'), description: t('mode.desc.enterprise_support'), href: '/support?category=enterprise&source=landing-mode-strip' },
  ]
  const pathChooserLanes = [
    {
      key: 'self_serve_renter',
      label: t('path_chooser.self_serve.label'),
      description: t('path_chooser.self_serve.desc'),
      href: '/renter/register?source=landing_path_chooser&lane=self_serve_renter',
    },
    {
      key: 'provider_onboarding',
      label: t('path_chooser.provider.label'),
      description: t('path_chooser.provider.desc'),
      href: '/setup?source=landing_path_chooser&lane=provider_onboarding',
    },
    {
      key: 'enterprise_intake',
      label: t('path_chooser.enterprise.label'),
      description: t('path_chooser.enterprise.desc'),
      href: '/support?category=enterprise&source=landing_path_chooser&lane=enterprise_intake#contact-form',
    },
    {
      key: 'arabic_model_docs',
      label: t('path_chooser.arabic.label'),
      description: t('path_chooser.arabic.desc'),
      href: '/docs?source=landing_path_chooser&lane=arabic_model_docs',
    },
  ]
  const howDcpWorksSteps = [
    {
      key: 'choose_model',
      title: 'Choose Model',
      description: 'Select from Arabic AI models (ALLaM, JAIS, Falcon) or global models via OpenAI-compatible API.',
    },
    {
      key: 'call_inference_api',
      title: 'Call Inference API',
      description: 'Send requests to your model endpoint. Saudi data residency, per-token billing, zero ops.',
    },
    {
      key: 'settle_usage',
      title: 'Track & Settle',
      description: 'Monitor usage and costs in real-time. Pay per token with SAR billing.',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <LaunchBanner health={detailedHealth} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-dc1-amber/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-sm font-medium mb-6">
              <span className="w-2 h-2 bg-dc1-amber rounded-full animate-pulse" />
              {t('landing.hero_eyebrow')}
            </div>
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight mb-6 text-dc1-amber">
              {t('landing.hero_title')}
            </h1>
            <p className="text-lg sm:text-xl text-dc1-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
              {t('landing.hero_desc')}
            </p>
            <p className="text-sm text-dc1-text-muted mb-6 max-w-xl mx-auto">
              {t('landing.hero_install_targets')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <Link
                href="/renter/register?source=landing_first_fold&intent=renter"
                onClick={() => {
                  updateIntent('renter', 'landing_first_fold', 'primary_cta')
                  trackLandingEvent('landing_primary_cta_clicked', {
                    role_intent: 'renter',
                    surface: 'hero_primary_cta',
                    destination: '/renter/register?source=landing_first_fold&intent=renter',
                    step: 'primary_cta',
                  })
                }}
                className="btn btn-primary btn-lg w-full sm:w-auto min-w-[240px]"
              >
                {t('landing.cta_renter')}
              </Link>
              <Link
                href="/setup?source=landing_first_fold&intent=provider"
                onClick={() => {
                  updateIntent('provider', 'landing_first_fold', 'primary_cta')
                  trackLandingEvent('landing_primary_cta_clicked', {
                    role_intent: 'provider',
                    surface: 'hero_primary_cta',
                    destination: '/setup?source=landing_first_fold&intent=provider',
                    step: 'primary_cta',
                  })
                }}
                className="btn btn-secondary btn-lg w-full sm:w-auto min-w-[240px]"
              >
                {t('landing.cta_provider')}
              </Link>
            </div>
            <p className="text-xs text-dc1-text-muted mb-3">
              {t('landing.cta_alt_prefix')}{' '}
              <Link href="/support?category=enterprise&source=landing-first-fold" className="text-dc1-amber hover:text-dc1-amber/80 font-semibold">
                {t('landing.cta_enterprise')}
              </Link>
            </p>
            <div className="mb-8 flex justify-center">
              <ProviderCountWidget health={detailedHealth} unavailableLabel={unavailableLabel} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-left">
              <div className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 p-3">
                <p className="text-xs font-semibold text-dc1-amber mb-1">{t('landing.diff_energy_title')}</p>
                <p className="text-xs text-dc1-text-secondary">{t('landing.diff_energy_desc')}</p>
              </div>
              <div className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 p-3">
                <p className="text-xs font-semibold text-dc1-amber mb-1">{t('landing.diff_models_title')}</p>
                <p className="text-xs text-dc1-text-secondary">{t('landing.diff_models_desc')}</p>
              </div>
              <div className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 p-3">
                <p className="text-xs font-semibold text-dc1-amber mb-1">{t('landing.diff_provider_title')}</p>
                <p className="text-xs text-dc1-text-secondary">{t('landing.diff_provider_desc')}</p>
              </div>
            </div>
            <div className="mb-8 rounded-xl border border-dc1-amber/30 bg-dc1-surface-l1/80 p-4 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-amber">
                {t('landing.how_dcp_works_label')}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {howDcpWorksSteps.map((item, index) => (
                  <div key={item.key} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-3">
                    <p className="text-xs font-semibold text-dc1-amber">{index + 1}. {item.title}</p>
                    <p className="mt-1 text-xs text-dc1-text-secondary leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <details className="max-w-4xl mx-auto w-full mb-4 rounded-xl border border-dc1-border bg-dc1-surface-l1/70 p-4 text-left">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">
                {t('landing.explore_paths_summary')}
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-amber">
                    {t('mode.strip.title')}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">{t('mode.strip.subtitle')}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {modeStripItems.map((item) => (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() =>
                          trackLandingEvent('mode_strip_clicked', {
                            surface: 'mode_strip',
                            destination: item.href,
                            step: 'mode_click',
                            mode_key: item.key,
                            mode_label: item.label,
                          })
                        }
                        className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 transition-colors hover:border-dc1-amber"
                      >
                        <p className="text-sm font-semibold text-dc1-text-primary">{item.label}</p>
                        <p className="mt-1 text-xs text-dc1-text-secondary">{item.description}</p>
                      </Link>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-amber">
                    {t('path_chooser.title')}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">{t('path_chooser.subtitle')}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {pathChooserLanes.map((lane) => (
                      <Link key={lane.key} href={lane.href} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 transition-colors hover:border-dc1-amber">
                        <p className="text-sm font-semibold text-dc1-text-primary">{lane.label}</p>
                        <p className="mt-1 text-xs text-dc1-text-secondary">{lane.description}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </details>
            <div className="w-full rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 px-4 py-2 text-xs text-dc1-text-secondary text-center">
              {t('landing.hero_settlement_proof')}
            </div>
            {/* Billing details in dedicated section below */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 text-sm font-medium text-dc1-amber hover:text-dc1-amber/80 transition-colors"
              >
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                {t('landing.browse_live')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/earn"
                className="inline-flex items-center gap-2 text-sm font-medium text-dc1-text-secondary hover:text-dc1-amber transition-colors"
              >
                {t('landing.earn_calc')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="mt-5 mx-auto max-w-3xl rounded-xl border border-dc1-border bg-dc1-surface-l2/80 px-4 py-3 text-left">
              <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
                {t('landing.platform_status_label')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-dc1-text-secondary">
                <p>
                  <span className="text-dc1-text-primary font-semibold">{registeredProviderCount !== null && registeredProviderCount > 0 ? registeredProviderCount.toLocaleString() : '40+'}</span> providers registered
                </p>
                <p>
                  <span className="text-dc1-text-primary font-semibold">3</span> platforms supported (Win/Mac/Linux)
                </p>
                <p>
                  <span className="text-dc1-text-primary font-semibold">100-270</span> tok/s on consumer GPUs
                </p>
              </div>
            </div>
            <div className="mt-4 mx-auto max-w-3xl rounded-xl border border-dc1-amber/30 bg-dc1-amber/10 px-4 py-3 text-left">
              <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
                {t('proof.segment.title')}
              </p>
              <ul className="list-disc ps-5 space-y-1 text-sm text-dc1-text-secondary">
                {segmentProofItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="text-dc1-text-secondary text-sm mt-6">
              {t('landing.already_account')}{' '}
              <Link href="/login" className="text-dc1-amber hover:text-dc1-amber/80 font-semibold underline underline-offset-2">
                {t('landing.sign_in_here')}
              </Link>
            </p>
          </div>
        </div>
      </section>



      {/* Live telemetry */}
      <section className="border-y border-dc1-border bg-dc1-surface-l1/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {liveStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-2xl sm:text-3xl font-bold text-dc1-amber">{stat.value}</p>
                  {stat.live && (
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" title={t('landing.live_metric_badge')} />
                  )}
                </div>
                <p className="text-sm text-dc1-text-secondary mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust policy module */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1/70 p-6">
          <h2 className="text-xl font-semibold text-dc1-text-primary mb-2">{t('landing.trust_module_title')}</h2>
          <p className="text-sm text-dc1-text-secondary mb-4">{t('landing.trust_module_intro')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trustPolicies.map((item) => (
              <div key={item.title} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 text-left">
                <p className="text-sm font-semibold text-dc1-text-primary mb-1">{item.title}</p>
                <p className="text-xs text-dc1-text-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Billing transparency */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div ref={billingExplainerRef} className="rounded-xl border border-dc1-amber/25 bg-dc1-amber/5 p-6">
          <h2 className="text-xl font-semibold text-dc1-text-primary mb-3">{t('billing.explainer.title')}</h2>
          <ul className="space-y-2 text-sm text-dc1-text-secondary">
            <li>{t('billing.explainer.step1')}</li>
            <li>{t('billing.explainer.step2')}</li>
            <li>{t('billing.explainer.step3')}</li>
          </ul>
          <p className="mt-3 text-xs text-dc1-text-muted">{t('billing.explainer.note')}</p>
          <p className="mt-2 text-xs text-dc1-text-muted">{t('billing.explainer.rail_status')}</p>
        </div>
      </section>

      {/* Supported Models – scrolling marquee */}
      <section className="py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dc1-amber text-center">
            {t('landing.model_marquee_title')}
          </p>
        </div>
        <div className="relative w-full">
          <div className="absolute left-0 top-0 bottom-0 w-24 sm:w-40 bg-gradient-to-r from-[#0d1117] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 sm:w-40 bg-gradient-to-l from-[#0d1117] to-transparent z-10 pointer-events-none" />
          <div className="flex animate-marquee">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-14 sm:gap-20 px-7 sm:px-10 shrink-0">
                {[
                  { src: '/logos/meta-text.png', alt: 'Meta' },
                  { src: '/logos/falcon-purple.svg', alt: 'Falcon LLM' },
                  { src: '/logos/mistral-text.png', alt: 'Mistral AI' },
                  { src: '/logos/inception-full.png', alt: 'Inception' },
                  { src: '/logos/qwen-text.png', alt: 'Qwen' },
                  { src: '/logos/tii-text.png', alt: 'TII' },
                  { src: '/logos/stability-text.png', alt: 'Stability AI' },
                  { src: '/logos/microsoft-text.png', alt: 'Microsoft' },
                  { src: '/logos/huggingface-text.png', alt: 'Hugging Face' },
                  { src: '/arabic-ai-logos/allam-humain.png', alt: 'ALLaM' },
                ].map((logo, i) => (
                  <Image
                    key={`${copy}-${i}`}
                    src={logo.src}
                    alt={logo.alt}
                    width={160}
                    height={36}
                    className="h-7 sm:h-9 w-auto object-contain brightness-0 invert opacity-50 hover:opacity-90 transition-opacity duration-300 shrink-0"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
          <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1/90 p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-dc1-amber font-semibold text-sm">{t('landing.diff_energy_title')}</p>
                <p className="text-xs text-dc1-text-secondary mt-1">{t('landing.diff_energy_desc')}</p>
              </div>
              <div className="text-center">
                <p className="text-dc1-amber font-semibold text-sm">{t('landing.diff_models_title')}</p>
                <p className="text-xs text-dc1-text-secondary mt-1">{t('landing.diff_models_desc')}</p>
              </div>
              <div className="text-center">
                <p className="text-dc1-amber font-semibold text-sm">{t('landing.diff_provider_title')}</p>
                <p className="text-xs text-dc1-text-secondary mt-1">{t('landing.diff_provider_desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Pricing — dual SKU teaser (finalized 2026-05-20) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20" aria-labelledby="landing-pricing-heading">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-dc1-amber mb-2">PRICING</p>
          <h2 id="landing-pricing-heading" className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            Two SKUs. One balance. 100 SAR free to start.
          </h2>
          <p className="text-dc1-text-secondary max-w-2xl mx-auto">
            Pay-as-you-go per million tokens, or upgrade to a monthly tier and get the same tokens at a discount.
            Every signup gets <span className="font-semibold text-dc1-text-primary">100 SAR starter credit</span> —
            no card, no commitment.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mb-10">
          {/* PAYG card */}
          <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold text-dc1-text-primary">Pay-as-you-go</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-dc1-text-muted">DEFAULT</span>
            </div>
            <p className="mt-3 font-mono text-3xl tabular-nums text-dc1-text-primary">
              from <span className="text-dc1-amber">$0.04</span>
              <span className="text-sm text-dc1-text-muted"> /M tokens</span>
            </p>
            <p className="mt-1 text-xs text-dc1-text-secondary">No commitment. Top-ups never expire.</p>
            <ul className="mt-5 space-y-2 text-sm text-dc1-text-secondary">
              <li>Tiny models: $0.04/M</li>
              <li>Small models: $0.08/M</li>
              <li>Medium (Qwen 3.6-27B): $0.40/M</li>
              <li>Embeddings: $0.013/M</li>
            </ul>
            <a href="/renter/register" className="btn btn-secondary btn-md mt-6 w-full">Start with 100 SAR credit</a>
          </div>

          {/* Starter */}
          <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
            <h3 className="text-lg font-semibold text-dc1-text-primary">Starter</h3>
            <p className="mt-3 font-mono text-3xl tabular-nums text-dc1-text-primary">375 <span className="text-base text-dc1-text-muted">SAR/mo</span></p>
            <p className="mt-1 text-xs text-dc1-text-secondary">15% off every model · 375 SAR credit/mo</p>
            <ul className="mt-5 space-y-2 text-sm text-dc1-text-secondary">
              <li>Indie devs &amp; small Saudi apps</li>
              <li>30-day rollover on unused credit</li>
              <li>Overage continues at PAYG</li>
            </ul>
            <a href="/renter/register?intent=subscribe&tier=starter" className="btn btn-secondary btn-md mt-6 w-full">Pick Starter</a>
          </div>

          {/* Growth — recommended */}
          <div className="rounded-2xl border border-dc1-amber bg-dc1-surface-l2 p-6 shadow-[0_0_0_1px_var(--dc1-amber-soft)]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold text-dc1-text-primary">Growth</h3>
              <span className="rounded-full bg-dc1-amber px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dc1-void">
                Popular
              </span>
            </div>
            <p className="mt-3 font-mono text-3xl tabular-nums text-dc1-text-primary">1,500 <span className="text-base text-dc1-text-muted">SAR/mo</span></p>
            <p className="mt-1 text-xs text-dc1-text-secondary">22% off every model · 1,500 SAR credit/mo</p>
            <ul className="mt-5 space-y-2 text-sm text-dc1-text-secondary">
              <li>Saudi SMBs in production</li>
              <li>Medium models at $0.31/M (vs OpenRouter $0.45/M)</li>
              <li>30-day rollover · PDPL-resident</li>
            </ul>
            <a href="/renter/register?intent=subscribe&tier=growth" className="btn btn-primary btn-md mt-6 w-full">Pick Growth</a>
          </div>

          {/* Scale */}
          <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
            <h3 className="text-lg font-semibold text-dc1-text-primary">Scale</h3>
            <p className="mt-3 font-mono text-3xl tabular-nums text-dc1-text-primary">5,625 <span className="text-base text-dc1-text-muted">SAR/mo</span></p>
            <p className="mt-1 text-xs text-dc1-text-secondary">30% off every model · 5,625 SAR credit/mo</p>
            <ul className="mt-5 space-y-2 text-sm text-dc1-text-secondary">
              <li>Heavy production workloads</li>
              <li>Medium models at $0.28/M</li>
              <li>Above Scale → custom contract</li>
            </ul>
            <a href="/renter/register?intent=subscribe&tier=scale" className="btn btn-secondary btn-md mt-6 w-full">Pick Scale</a>
          </div>
        </div>

        <div className="text-center">
          <a href="/pricing" className="text-sm text-dc1-amber hover:underline">
            See the full rate card and discount maths →
          </a>
        </div>
      </section>


      {/* Instant API Access */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            {t('landing.instant_api_title')}
          </h2>
          <p className="text-dc1-text-secondary max-w-2xl mx-auto">
            {t('landing.instant_api_desc')}
          </p>
        </div>
        <div className="max-w-3xl mx-auto">
          <div className="bg-dc1-void rounded-xl border border-dc1-border p-6 font-mono text-sm overflow-x-auto" dir="ltr">
            <div className="text-dc1-text-muted mb-2 text-xs">{t('landing.instant_api_comment')}</div>
            <div><span className="text-purple-400">from</span> <span className="text-dc1-amber">openai</span> <span className="text-purple-400">import</span> OpenAI</div>
            <div className="mt-2"><span className="text-blue-400">client</span> = OpenAI(</div>
            <div className="ml-4"><span className="text-green-400">base_url</span>=<span className="text-yellow-300">&quot;https://api.dcp.sa/v1&quot;</span>,</div>
            <div className="ml-4"><span className="text-green-400">api_key</span>=<span className="text-yellow-300">&quot;your-key&quot;</span></div>
            <div>)</div>
          </div>
          <div className="mt-6 flex justify-center gap-4">
            <a href="/renter/register" className="btn btn-primary">{t('landing.instant_api_get_key')}</a>
            <a href="/docs/api" className="btn btn-secondary">{t('landing.instant_api_view_docs')}</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            {t('landing.features_title')}
          </h2>
          <p className="text-dc1-text-secondary max-w-2xl mx-auto">
            {t('landing.features_desc')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div key={feature.title} className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-6 transition-all duration-200 hover:border-dc1-border-light hover:shadow-md hover:-translate-y-0.5 group">
              <div className="w-12 h-12 rounded-lg bg-dc1-amber/10 flex items-center justify-center text-dc1-amber mb-4 group-hover:bg-dc1-amber/20 transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-dc1-text-primary mb-2">{feature.title}</h3>
              <p className="text-sm text-dc1-text-secondary mb-4 leading-relaxed">{feature.description}</p>
              <Link
                href={feature.href}
                className="inline-flex items-center gap-1 text-sm font-medium text-dc1-amber hover:text-dc1-amber-hover transition-colors"
              >
                {feature.cta}
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-dc1-surface-l1 border-y border-dc1-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-3xl font-bold text-dc1-text-primary text-center mb-16">{t('landing.how_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: t('landing.how_step1_title'), desc: t('landing.how_step1_desc') },
              { step: '02', title: t('landing.how_step2_title'), desc: t('landing.how_step2_desc') },
              { step: '03', title: t('landing.how_step3_title'), desc: t('landing.how_step3_desc') },
              { step: '04', title: t('landing.how_step4_title'), desc: t('landing.how_step4_desc') },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-dc1-amber/10 border border-dc1-amber/30 flex items-center justify-center text-dc1-amber font-bold text-sm mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-dc1-text-primary mb-2">{item.title}</h3>
                <p className="text-sm text-dc1-text-secondary">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Provider Setup Demo */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            {t('landing.earn_section_title')}
          </h2>
          <p className="text-dc1-text-secondary max-w-2xl mx-auto">
            4 MB desktop app. Auto-detects your GPU, installs the inference engine (Ollama or MLX), downloads the AI model, and connects to DCP. Zero config.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div className="rounded-xl border border-dc1-amber/30 bg-dc1-amber/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber mb-3">Why providers choose DCP</p>
              <ul className="space-y-2.5 text-sm text-dc1-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">{t('landing.provider_os_strong')}</strong> — works on the hardware you already own</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">4 MB desktop app</strong> — not 180 MB like Electron competitors</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">Auto-detects GPU</strong>, auto-installs inference engine (Ollama/MLX), auto-downloads AI model</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">100-270 tok/s</strong> on consumer GPUs (RTX 3060 Ti to RTX 5090) — benchmark-proven</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">MoE models</strong> (30B parameters, only 3B active) = enterprise quality at consumer hardware speed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">Auto NAT traversal</strong> via Cloudflare Tunnel — no port forwarding needed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-dc1-amber mt-0.5 flex-shrink-0">{'>'}</span>
                  <span><strong className="text-dc1-text-primary">Real-time dashboard</strong> with GPU temp, utilization, live earnings, and job feed</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="card border-dc1-amber/20">
              <p className="text-xs text-dc1-text-muted mb-3 font-mono uppercase tracking-wider">Windows</p>
              <a
                href="https://api.dcp.sa/download/windows"
                className="btn btn-primary w-full text-center"
              >
                {t('landing.download_provider_button')}
              </a>
              <p className="text-xs text-dc1-text-muted mt-2 text-center">4 MB installer — Windows 10/11, RTX GPUs</p>
            </div>
            <div className="card border-dc1-amber/20">
              <p className="text-xs text-dc1-text-muted mb-3 font-mono uppercase tracking-wider">macOS / Linux</p>
              <pre className="bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-xs text-dc1-amber font-mono overflow-x-auto max-w-full whitespace-pre-wrap break-all">curl -sSL https://api.dcp.sa/install | bash -s -- YOUR_KEY</pre>
              <p className="text-xs text-dc1-text-muted mt-2">macOS: Apple Silicon M1-M4 (MLX) | Linux: NVIDIA RTX GPUs (Ollama)</p>
            </div>
            <div className="card border-dc1-border">
              <p className="text-xs text-dc1-text-muted mb-2">After install, your dashboard shows:</p>
              <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap break-words max-w-full">{`✓ GPU detected: RTX 4090 (24 GB)
✓ Ollama installed, model downloaded
✓ Cloudflare Tunnel active — no port forwarding needed
✓ Connected to DCP — earning SAR on inference jobs`}</pre>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            {t('landing.run_title')}
          </h2>
          <p className="text-dc1-text-secondary max-w-2xl mx-auto">
            {t('landing.run_desc')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: t('landing.run_llm_title'),
              desc: t('landing.run_llm_desc'),
              tags: ['ALLaM', 'Falcon', 'Llama 3', 'JAIS'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              ),
            },
            {
              title: t('landing.run_sd_title'),
              desc: t('landing.run_sd_desc'),
              tags: ['SDXL', 'ControlNet', 'DreamBooth'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
            },
            {
              title: t('landing.run_pytorch_title'),
              desc: t('landing.run_pytorch_desc'),
              tags: ['LoRA', 'QLoRA', 'PyTorch'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ),
            },
            {
              title: t('landing.run_jupyter_title'),
              desc: t('landing.run_jupyter_desc'),
              tags: ['ALLaM 7B', 'Falcon H1', 'JAIS 13B', 'BGE-M3'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              ),
            },
            {
              title: t('landing.run_docker_title'),
              desc: t('landing.run_docker_desc'),
              tags: ['Docker', 'CUDA', 'Custom'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              ),
            },
            {
              title: t('landing.run_cuda_title'),
              desc: t('landing.run_cuda_desc'),
              tags: ['CUDA', 'Batch', 'HPC'],
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div key={item.title} className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-6 transition-all duration-200 hover:border-dc1-border-light hover:shadow-md hover:-translate-y-0.5 group">
              <div className="w-10 h-10 rounded-lg bg-dc1-amber/10 flex items-center justify-center text-dc1-amber mb-4 group-hover:bg-dc1-amber/20 transition-colors">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{item.title}</h3>
              <p className="text-sm text-dc1-text-secondary mb-4 leading-relaxed">{item.desc}</p>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-xs font-mono bg-dc1-surface-l2 text-dc1-text-muted border border-dc1-border">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Official SDKs */}
      <section className="bg-dc1-surface-l1 border-y border-dc1-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-sm font-medium mb-6">
                {t('landing.vscode_badge')}
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-6">
                {t('landing.vscode_title')}
              </h2>
              <p className="text-dc1-text-secondary mb-6 leading-relaxed">
                {t('landing.vscode_desc')}
              </p>
              <ul className="space-y-3 text-sm text-dc1-text-secondary mb-8">
                {[
                  t('landing.vscode_feature1'),
                  t('landing.vscode_feature2'),
                  t('landing.vscode_feature3'),
                  t('landing.vscode_feature4'),
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-dc1-amber/10 border border-dc1-amber/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-dc1-amber" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/docs" className="inline-flex items-center gap-2 btn btn-secondary btn-sm">
                {t('landing.vscode_docs')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="card border-dc1-amber/20 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="text-xs text-dc1-text-muted font-mono ml-2">terminal</span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-dc1-text-muted font-mono mb-1"># Python — provider SDK</p>
                  <pre className="bg-dc1-surface-l2 rounded px-3 py-2 border border-dc1-border text-xs text-dc1-amber font-mono max-w-full overflow-x-auto whitespace-pre-wrap"># Check the latest SDK package name in /docs/sdk-guides</pre>
                </div>
                <div>
                  <p className="text-xs text-dc1-text-muted font-mono mb-1"># Node.js — renter SDK</p>
                  <pre className="bg-dc1-surface-l2 rounded px-3 py-2 border border-dc1-border text-xs text-dc1-amber font-mono max-w-full overflow-x-auto whitespace-pre-wrap"># Check the latest SDK package name in /docs/sdk-guides</pre>
                </div>
              </div>
              <div className="border-t border-dc1-border pt-4">
                <p className="text-xs text-dc1-text-muted font-mono mb-2">Quick start:</p>
                <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap">{`from dcp_provider import DCPProvider

provider = DCPProvider(api_key="your-key")
provider.register_gpu()
provider.start()  # initialize, heartbeat, and serve inference workloads`}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programmatic Integration */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-sm font-medium mb-6">
              {t('landing.api_badge')}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-6">
              {t('landing.api_title')}
            </h2>
            <p className="text-dc1-text-secondary mb-6 leading-relaxed">
              {t('landing.api_desc')}
            </p>
            <ul className="space-y-3 text-sm text-dc1-text-secondary">
              {[
                t('landing.api_feature1'),
                t('landing.api_feature2'),
                t('landing.api_feature3'),
                t('landing.api_feature4'),
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-dc1-amber/10 border border-dc1-amber/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-dc1-amber" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card border-dc1-amber/20">
            <p className="text-xs text-dc1-text-muted mb-3 font-mono uppercase tracking-wider">Submit a job</p>
            <pre className="text-xs text-dc1-amber font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{`curl -X POST https://api.dcp.sa/api/jobs/submit \\
  -H "Content-Type: application/json" \\
  -H "x-renter-key: dcp-renter-..." \\
  -d '{
    "provider_id": 26,
    "job_type": "llm_inference",
    "duration_minutes": 5,
    "container_spec": {
      "image_type": "vllm-serve"
    },
    "params": {
      "model": "ALLaM-7B-Instruct",
      "prompt": "Hello world"
    }
  }'`}</pre>
            <div className="mt-4 pt-4 border-t border-dc1-border">
              <p className="text-xs text-dc1-text-muted mb-2">Response:</p>
              <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap break-words max-w-full">{`{
  "job_id": "job-abc123",
  "status": "queued",
  "status_detail": "queued"
}`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="card border-dc1-amber/20 text-center py-12 px-8 glow-amber">
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-4">
            {t('landing.cta_title')}
          </h2>
          <p className="text-dc1-text-secondary max-w-xl mx-auto mb-8">
            {t('landing.cta_desc')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/renter/register" className="btn btn-primary btn-lg w-full sm:w-auto">
              {t('landing.cta_register_renter')}
            </Link>
            <Link href="/setup" className="btn btn-secondary btn-lg w-full sm:w-auto">
              {t('landing.cta_register_provider')}
            </Link>
          </div>
          <div className="mt-6">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors"
            >
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              {t('landing.cta_browse')}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
