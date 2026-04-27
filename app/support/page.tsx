'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { useLanguage } from '../lib/i18n'
import { intentSupportCategory, persistRoleIntent, readRoleIntent, RoleIntent, trackRoleIntentApplied } from '../lib/role-intent'

type ProviderState = 'waiting' | 'heartbeat' | 'ready' | 'paused' | 'stale'

function supportCategoryToRoleIntent(category: string): RoleIntent {
  if (category === 'provider') return 'provider'
  if (category === 'enterprise') return 'enterprise'
  return 'renter'
}

function trackSupportEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const detail = {
    event,
    source_page: 'support',
    role_intent: 'renter',
    surface: 'support_page',
    destination: 'none',
    step: 'view',
    ...payload,
  }
  window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
  const win = window as typeof window & { dataLayer?: Array<Record<string, unknown>>; gtag?: (...args: unknown[]) => void }
  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push(detail)
  }
  if (typeof win.gtag === 'function') {
    win.gtag('event', event, detail)
  }
}

function ContactForm({
  t,
  initialCategory,
  initialMessage,
  source,
  providerState,
}: {
  t: (key: string) => string
  initialCategory: string
  initialMessage: string
  source: string
  providerState: ProviderState | null
}) {
  const [form, setForm] = useState({ name: '', email: '', category: initialCategory || 'general', message: initialMessage || '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent_api' | 'sent_fallback'>('idle');
  const [fallbackMailto, setFallbackMailto] = useState('');

  const buildMailtoUrl = (payload: typeof form) =>
    `mailto:support@dcp.sa?subject=[${payload.category}] Support Request from ${payload.name}&body=${encodeURIComponent(payload.message)}`;

  const categoryOptions = useMemo(
    () => [
      { value: 'general', label: t('support.form.category.general') },
      { value: 'account', label: t('support.form.category.account') },
      { value: 'billing', label: t('support.form.category.billing') },
      { value: 'provider', label: t('support.form.category.provider') },
      { value: 'renter', label: t('support.form.category.renter') },
      { value: 'bug', label: t('support.form.category.bug') },
      { value: 'enterprise', label: t('support.form.category.enterprise') },
    ],
    [t]
  )

  useEffect(() => {
    const hasCategory = categoryOptions.some((option) => option.value === initialCategory)
    const nextCategory = hasCategory ? initialCategory : 'general'
    setForm((prev) => ({
      ...prev,
      category: nextCategory,
      message: initialMessage || prev.message,
    }))
  }, [initialCategory, initialMessage, categoryOptions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setFallbackMailto('');
    try {
      const API = '/api';
      const res = await fetch(`${API}/support/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source,
          provider_state: providerState ?? null,
        }),
      });
      if (res.ok) {
        setStatus('sent_api');
        setForm({ name: '', email: '', category: 'general', message: '' });
        trackSupportEvent('support_contact_api_success', {
          role_intent: supportCategoryToRoleIntent(form.category),
          category: form.category,
          surface: 'contact_form',
          destination: '/api/support/contact',
          step: 'submit_success',
          source,
          provider_state: providerState ?? 'none',
        })
        trackSupportEvent('support_contact_submitted', {
          role_intent: supportCategoryToRoleIntent(form.category),
          category: form.category,
          surface: 'contact_form',
          destination: '/api/support/contact',
          step: 'submit',
          source,
          provider_state: providerState ?? 'none',
          transport: 'api',
        })
      } else {
        let apiError = `Request failed with status ${res.status}`
        try {
          const payload = await res.json()
          if (payload?.error && typeof payload.error === 'string') {
            apiError = payload.error
          }
        } catch (_) {}

        const fallbackUrl = buildMailtoUrl(form)
        setFallbackMailto(fallbackUrl)
        setStatus('sent_fallback');
        trackSupportEvent('support_contact_api_failure', {
          role_intent: supportCategoryToRoleIntent(form.category),
          category: form.category,
          surface: 'contact_form',
          destination: '/api/support/contact',
          step: 'submit_failure',
          source,
          provider_state: providerState ?? 'none',
          failure_type: 'http_error',
          status_code: res.status,
          error: apiError,
        })
      }
    } catch (error) {
      const fallbackUrl = buildMailtoUrl(form)
      setFallbackMailto(fallbackUrl)
      setStatus('sent_fallback');
      trackSupportEvent('support_contact_api_failure', {
        role_intent: supportCategoryToRoleIntent(form.category),
        category: form.category,
        surface: 'contact_form',
        destination: '/api/support/contact',
        step: 'submit_failure',
        source,
        provider_state: providerState ?? 'none',
        failure_type: 'network_error',
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  };

  return (
    <div id="contact-form" className="mb-12 scroll-mt-24">
      <h2 className="text-2xl font-bold text-dc1-text-primary mb-6">{t('support.form.title')}</h2>
      {status === 'sent_api' ? (
        <div className="card text-center py-8">
          <div className="text-3xl mb-3">✅</div>
          <p className="text-dc1-text-primary font-semibold mb-1">{t('support.form.sent_api_title')}</p>
          <p className="text-sm text-dc1-text-secondary">{t('support.form.sent_api_subtitle')}</p>
          <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-dc1-amber hover:underline">{t('support.form.send_another')}</button>
        </div>
      ) : status === 'sent_fallback' ? (
        <div className="card text-center py-8">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-dc1-text-primary font-semibold mb-1">{t('support.form.sent_fallback_title')}</p>
          <p className="text-sm text-dc1-text-secondary">{t('support.form.sent_fallback_subtitle')}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a
              href={fallbackMailto}
              onClick={() =>
                trackSupportEvent('support_contact_fallback_launched', {
                  role_intent: supportCategoryToRoleIntent(form.category),
                  category: form.category,
                  surface: 'contact_form',
                  destination: 'mailto:support@dcp.sa',
                  step: 'fallback_opened',
                  source,
                  provider_state: providerState ?? 'none',
                })
              }
              className="bg-dc1-amber text-dc1-void px-4 py-2 rounded-lg font-semibold text-sm hover:bg-dc1-amber/90 transition-colors"
            >
              {t('support.form.open_email_fallback')}
            </a>
            <button onClick={() => setStatus('idle')} className="text-sm text-dc1-amber hover:underline">
              {t('support.form.retry_api_submit')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-dc1-text-secondary mb-1">{t('support.form.name')}</label>
              <input
                type="text" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-lg px-3 py-2 text-sm text-dc1-text-primary placeholder-dc1-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-dc1-amber"
                placeholder={t('support.form.name_placeholder')}
              />
            </div>
            <div>
              <label className="block text-sm text-dc1-text-secondary mb-1">{t('support.form.email')}</label>
              <input
                type="email" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-lg px-3 py-2 text-sm text-dc1-text-primary placeholder-dc1-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-dc1-amber"
                placeholder={t('support.form.email_placeholder')}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-dc1-text-secondary mb-1">{t('support.form.category')}</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-lg px-3 py-2 text-sm text-dc1-text-primary focus:outline-none focus:ring-1 focus:ring-dc1-amber"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dc1-text-secondary mb-1">{t('support.form.message')}</label>
            <textarea
              required value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={5}
              className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-lg px-3 py-2 text-sm text-dc1-text-primary placeholder-dc1-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-dc1-amber resize-none"
              placeholder={t('support.form.message_placeholder')}
            />
          </div>
          {form.category === 'enterprise' && (
            <div className="rounded-lg border border-dc1-amber/40 bg-dc1-amber/10 px-4 py-3">
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.form.enterprise_helper_title')}</p>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('support.form.enterprise_helper_scope_intro')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dc1-text-secondary">
                <li>{t('support.form.enterprise_helper_scope_procurement')}</li>
                <li>{t('support.form.enterprise_helper_scope_security')}</li>
                <li>{t('support.form.enterprise_helper_scope_rollout')}</li>
              </ul>
              <p className="mt-2 text-sm text-dc1-text-secondary">{t('support.form.enterprise_helper_response')}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="bg-dc1-amber text-dc1-void px-6 py-2 rounded-lg font-semibold text-sm hover:bg-dc1-amber/90 transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? t('support.form.sending') : t('support.form.submit')}
          </button>
        </form>
      )}
    </div>
  );
}

function SupportPageInner() {
  const { t, isRTL } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [storedIntent, setStoredIntent] = useState<RoleIntent | null>(null)
  const requestedCategory = (searchParams.get('category') || '').toLowerCase()
  const supportSource = searchParams.get('source') || 'direct'
  const supportFlow = searchParams.get('flow') || ''
  const providerStateParam = (searchParams.get('provider_state') || '').toLowerCase()
  const providerId = searchParams.get('provider_id') || ''
  const validCategoryValues = ['general', 'account', 'billing', 'provider', 'renter', 'bug', 'enterprise'] as const
  const validProviderStates = ['waiting', 'heartbeat', 'ready', 'paused', 'stale'] as const
  type SupportCategory = (typeof validCategoryValues)[number]
  const isSupportCategory = (value: string): value is SupportCategory =>
    validCategoryValues.includes(value as SupportCategory)
  const isProviderState = (value: string): value is ProviderState =>
    validProviderStates.includes(value as ProviderState)
  const prefilledCategoryFromIntent = storedIntent ? intentSupportCategory(storedIntent) : 'general'
  const prefilledCategory: SupportCategory = isSupportCategory(requestedCategory)
    ? requestedCategory
    : (prefilledCategoryFromIntent as SupportCategory)
  const prefilledProviderState: ProviderState | null = isProviderState(providerStateParam) ? providerStateParam : null
  const providerMessageMap: Record<ProviderState, string> = {
    waiting: t('support.prefill.provider_state.waiting'),
    heartbeat: t('support.prefill.provider_state.heartbeat'),
    ready: t('support.prefill.provider_state.ready'),
    paused: t('support.prefill.provider_state.paused'),
    stale: t('support.prefill.provider_state.stale'),
  }
  const providerStateLabelMap: Record<ProviderState, string> = {
    waiting: t('register.provider.state.waiting.label'),
    heartbeat: t('register.provider.state.heartbeat.label'),
    ready: t('register.provider.state.ready.label'),
    paused: t('register.provider.state.paused.label'),
    stale: t('register.provider.state.stale.label'),
  }
  const prefilledMessage =
    supportFlow === 'onboarding' && prefilledProviderState
      ? `${providerMessageMap[prefilledProviderState]}${providerId ? `\n${t('support.prefill.provider_id_label')} ${providerId}` : ''}\n${t(
          'support.prefill.provider_steps_hint'
        )}`
      : ''

  useEffect(() => {
    const intent = readRoleIntent()
    if (!intent) return
    setStoredIntent(intent)

    if (!requestedCategory) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('category', intentSupportCategory(intent))
      if (!params.get('source')) {
        params.set('source', 'role-intent')
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      trackRoleIntentApplied(intent, { source: 'support', destination: 'category_prefill' })
    }
  }, [pathname, requestedCategory, router, searchParams])

  useEffect(() => {
    if (prefilledCategory === 'general' && !prefilledProviderState) return
    trackSupportEvent('support_prefill_loaded', {
      role_intent: supportCategoryToRoleIntent(prefilledCategory),
      surface: 'prefill',
      destination: 'contact_form',
      step: 'prefill_loaded',
      source: supportSource,
      flow: supportFlow || 'none',
      category: prefilledCategory,
      provider_state: prefilledProviderState ?? 'none',
    })
    if (prefilledCategory === 'enterprise') {
      trackSupportEvent('support_enterprise_prefill_loaded', {
        role_intent: 'enterprise',
        surface: 'prefill',
        destination: 'contact_form',
        step: 'enterprise_prefill_loaded',
        source: supportSource,
        category: 'enterprise',
      })
    }
  }, [prefilledCategory, prefilledProviderState, supportFlow, supportSource])

  const supportChannels = [
    { title: t('support.channels.email.title'), description: t('support.channels.email.desc'), contact: 'support@dcp.sa', icon: '✉' },
    { title: t('support.channels.abuse.title'), description: t('support.channels.abuse.desc'), contact: 'abuse@dcp.sa', icon: '⚠' },
    { title: t('support.channels.privacy.title'), description: t('support.channels.privacy.desc'), contact: 'privacy@dcp.sa', icon: '🔒' },
  ]

  const faqs = [
    { q: t('support.faq.q1'), a: t('support.faq.a1') },
    { q: t('support.faq.q2'), a: t('support.faq.a2') },
    { q: t('support.faq.q3'), a: t('support.faq.a3') },
    { q: t('support.faq.q4'), a: t('support.faq.a4') },
    { q: t('support.faq.q5'), a: t('support.faq.a5') },
  ]

  const scenarioTiles: Array<{ key: string; category: SupportCategory }> = [
    {
      key: 'provider_install',
      category: 'provider',
    },
    {
      key: 'job_failed',
      category: 'bug',
    },
    {
      key: 'billing_credits',
      category: 'billing',
    },
    {
      key: 'enterprise_onboarding',
      category: 'enterprise',
    },
  ]
  const segmentProofItems = [
    t('proof.segment.item_energy'),
    t('proof.segment.item_models'),
    t('proof.segment.item_execution'),
  ]

  const trackScenarioClick = (category: SupportCategory) => {
    const mappedIntent: RoleIntent =
      category === 'provider' ? 'provider' : category === 'enterprise' ? 'enterprise' : 'renter'
    const destination = `/support?category=${category}&source=support-scenario-${category}#contact-form`
    const previousIntent = readRoleIntent()
    persistRoleIntent(mappedIntent, {
      source: 'support_scenario_tile',
      previousIntent,
      reason: previousIntent && previousIntent !== mappedIntent ? 'overridden' : 'persisted',
    })
    trackSupportEvent('support_scenario_tile_clicked', {
      role_intent: mappedIntent,
      surface: 'scenario_tiles',
      destination,
      step: 'tile_click',
      category,
    })
  }
  const enterpriseDestinations = {
    fastLane: '/support?category=enterprise&source=support-enterprise-fast-lane#contact-form',
    proofCta: '/support?category=enterprise&source=support-enterprise-proof#contact-form',
    categoryTile: '/support?category=enterprise&source=support-category-enterprise#contact-form',
  }

  return (
    <div className="min-h-screen bg-dc1-void" dir={isRTL ? 'rtl' : 'ltr'}>
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{t('support.page_title')}</h1>
        <p className="text-dc1-text-secondary mb-10">{t('support.page_subtitle')}</p>
        <div className={`mb-8 rounded-xl border border-dc1-amber/35 bg-dc1-amber/10 p-4 ${isRTL ? 'text-right' : 'text-left'}`}>
          <p className="text-xs uppercase tracking-[0.12em] text-dc1-amber font-semibold mb-1">
            {t('support.enterprise_intake.badge')}
          </p>
          <p className="text-sm text-dc1-text-secondary mb-3">
            {t('support.enterprise_intake.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Link
              href="/support?category=enterprise&source=support-enterprise-intake&flow=sla#contact-form"
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('enterprise', {
                  source: 'support_enterprise_intake_sla',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_enterprise_intake_route_clicked', {
                  role_intent: 'enterprise',
                  surface: 'enterprise_intake_band',
                  destination: '/support?category=enterprise&source=support-enterprise-intake&flow=sla#contact-form',
                  step: 'sla_route',
                  route: 'sla',
                })
              }}
              className={`rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 hover:border-dc1-amber/40 transition-colors ${isRTL ? 'text-right' : 'text-left'}`}
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.enterprise_intake.route.sla.title')}</p>
              <p className="mt-1 text-xs text-dc1-text-secondary">{t('support.enterprise_intake.route.sla.desc')}</p>
            </Link>
            <Link
              href="/support?category=enterprise&source=support-enterprise-intake&flow=security#contact-form"
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('enterprise', {
                  source: 'support_enterprise_intake_security',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_enterprise_intake_route_clicked', {
                  role_intent: 'enterprise',
                  surface: 'enterprise_intake_band',
                  destination: '/support?category=enterprise&source=support-enterprise-intake&flow=security#contact-form',
                  step: 'security_route',
                  route: 'security',
                })
              }}
              className={`rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 hover:border-dc1-amber/40 transition-colors ${isRTL ? 'text-right' : 'text-left'}`}
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.enterprise_intake.route.security.title')}</p>
              <p className="mt-1 text-xs text-dc1-text-secondary">{t('support.enterprise_intake.route.security.desc')}</p>
            </Link>
            <Link
              href="/support?category=enterprise&source=support-enterprise-intake&flow=onboarding#contact-form"
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('enterprise', {
                  source: 'support_enterprise_intake_onboarding',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_enterprise_intake_route_clicked', {
                  role_intent: 'enterprise',
                  surface: 'enterprise_intake_band',
                  destination: '/support?category=enterprise&source=support-enterprise-intake&flow=onboarding#contact-form',
                  step: 'support_route',
                  route: 'support',
                })
              }}
              className={`rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 hover:border-dc1-amber/40 transition-colors ${isRTL ? 'text-right' : 'text-left'}`}
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.enterprise_intake.route.onboarding.title')}</p>
              <p className="mt-1 text-xs text-dc1-text-secondary">{t('support.enterprise_intake.route.onboarding.desc')}</p>
            </Link>
          </div>
        </div>
        <div className="mb-8 rounded-xl border border-dc1-amber/30 bg-dc1-amber/10 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-dc1-amber font-semibold mb-2">
            {t('proof.segment.title')}
          </p>
          <ul className="list-disc ps-5 space-y-1 text-sm text-dc1-text-secondary">
            {segmentProofItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="mb-8 rounded-xl border border-dc1-amber/30 bg-dc1-amber/10 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-dc1-amber font-semibold mb-1">
            {t('support.enterprise_prefill_label')}
          </p>
          <p className="text-sm text-dc1-text-secondary mb-3">{t('support.enterprise_prefill_desc')}</p>
          <Link
            href={enterpriseDestinations.fastLane}
            onClick={() => {
              const previousIntent = readRoleIntent()
              persistRoleIntent('enterprise', {
                source: 'support_enterprise_fast_lane',
                previousIntent,
                reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
              })
              trackSupportEvent('support_category_tile_clicked', {
                role_intent: 'enterprise',
                surface: 'support_fast_lane',
                destination: enterpriseDestinations.fastLane,
                step: 'tile_click',
                category: 'enterprise',
              })
            }}
            className="inline-flex rounded-lg border border-dc1-amber/40 bg-dc1-amber/20 px-3 py-2 text-xs font-semibold text-dc1-amber hover:bg-dc1-amber/30"
          >
            {t('support.scenario.cta')}
          </Link>
        </div>

        <div className="mb-8 rounded-xl border border-dc1-amber/30 bg-dc1-surface-l1 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-dc1-amber font-semibold mb-2">
            {t('support.enterprise_proof_title')}
          </p>
          <p className="text-sm text-dc1-text-secondary mb-2">{t('support.enterprise_proof_intro')}</p>
          <ul className="list-disc ps-5 space-y-1 text-sm text-dc1-text-secondary mb-3">
            <li>{t('support.enterprise_proof_item_procurement')}</li>
            <li>{t('support.enterprise_proof_item_security')}</li>
            <li>{t('support.enterprise_proof_item_rollout')}</li>
          </ul>
          <Link
            href={enterpriseDestinations.proofCta}
            onClick={() => {
              const previousIntent = readRoleIntent()
              persistRoleIntent('enterprise', {
                source: 'support_enterprise_proof_cta',
                previousIntent,
                reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
              })
              trackSupportEvent('support_enterprise_proof_cta_clicked', {
                role_intent: 'enterprise',
                surface: 'enterprise_proof',
                destination: enterpriseDestinations.proofCta,
                step: 'cta_click',
              })
            }}
            className="inline-flex rounded-lg bg-dc1-amber px-4 py-2 text-xs font-semibold text-dc1-void hover:bg-dc1-amber/90"
          >
            {t('support.enterprise_proof_cta')}
          </Link>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-dc1-text-primary mb-4">{t('support.form.category')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/support?category=provider&source=support-category-provider#contact-form"
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('provider', {
                  source: 'support_category_tile',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'provider' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_category_tile_clicked', {
                  role_intent: 'provider',
                  surface: 'category_tiles',
                  destination: '/support?category=provider&source=support-category-provider#contact-form',
                  step: 'tile_click',
                  category: 'provider',
                })
              }}
              className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4 hover:border-dc1-amber/40 transition-colors"
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.form.category.provider')}</p>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('support.scenario.provider_install.desc')}</p>
              <p className="mt-3 text-xs font-medium text-dc1-amber">{t('support.scenario.cta')}</p>
            </Link>
            <Link
              href="/support?category=renter&source=support-category-renter#contact-form"
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('renter', {
                  source: 'support_category_tile',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'renter' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_category_tile_clicked', {
                  role_intent: 'renter',
                  surface: 'category_tiles',
                  destination: '/support?category=renter&source=support-category-renter#contact-form',
                  step: 'tile_click',
                  category: 'renter',
                })
              }}
              className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4 hover:border-dc1-amber/40 transition-colors"
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.form.category.renter')}</p>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('support.scenario.billing_credits.desc')}</p>
              <p className="mt-3 text-xs font-medium text-dc1-amber">{t('support.scenario.cta')}</p>
            </Link>
            <Link
              href={enterpriseDestinations.categoryTile}
              onClick={() => {
                const previousIntent = readRoleIntent()
                persistRoleIntent('enterprise', {
                  source: 'support_category_tile',
                  previousIntent,
                  reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
                })
                trackSupportEvent('support_category_tile_clicked', {
                  role_intent: 'enterprise',
                  surface: 'category_tiles',
                  destination: enterpriseDestinations.categoryTile,
                  step: 'tile_click',
                  category: 'enterprise',
                })
              }}
              className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4 hover:border-dc1-amber/40 transition-colors"
            >
              <p className="text-sm font-semibold text-dc1-text-primary">{t('support.form.category.enterprise')}</p>
              <p className="mt-1 text-sm text-dc1-text-secondary">{t('support.scenario.enterprise_onboarding.desc')}</p>
              <p className="mt-3 text-xs font-medium text-dc1-amber">{t('support.scenario.cta')}</p>
            </Link>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-dc1-text-primary mb-4">{t('support.scenario.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarioTiles.map((tile) => (
              <Link
                key={tile.key}
                href={`/support?category=${tile.category}&source=support-scenario-${tile.category}#contact-form`}
                onClick={() => trackScenarioClick(tile.category)}
                className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4 hover:border-dc1-amber/40 transition-colors"
              >
                <p className="text-sm font-semibold text-dc1-text-primary">{t(`support.scenario.${tile.key}.title`)}</p>
                <p className="mt-1 text-sm text-dc1-text-secondary">{t(`support.scenario.${tile.key}.desc`)}</p>
                <p className="mt-3 text-xs font-medium text-dc1-amber">{t('support.scenario.cta')}</p>
              </Link>
            ))}
          </div>
        </div>

        {prefilledCategory === 'enterprise' && (
          <div className="mb-8 space-y-3">
            <div className="rounded-xl border border-dc1-amber/30 bg-dc1-amber/10 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-dc1-amber font-semibold mb-1">
                {t('support.enterprise_prefill_label')}
              </p>
              <p className="text-sm text-dc1-text-secondary">{t('support.enterprise_prefill_desc')}</p>
            </div>
            <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4">
              <p className="text-sm font-semibold text-dc1-text-primary mb-2">
                {t('support.enterprise_checklist_title')}
              </p>
              <p className="text-sm text-dc1-text-secondary mb-2">{t('support.enterprise_checklist_intro')}</p>
              <ul className="list-disc text-sm text-dc1-text-secondary ps-5 space-y-1">
                <li>{t('support.enterprise_checklist_item_use_case')}</li>
                <li>{t('support.enterprise_checklist_item_usage_volume')}</li>
                <li>{t('support.enterprise_checklist_item_compliance')}</li>
                <li>{t('support.enterprise_checklist_item_timeline')}</li>
              </ul>
            </div>
          </div>
        )}

        {supportFlow === 'onboarding' && prefilledProviderState && (
          <div className="mb-8 rounded-xl border border-status-info/30 bg-status-info/10 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-status-info font-semibold mb-1">
              {t('support.prefill.onboarding_label')}
            </p>
            <p className="text-sm text-dc1-text-secondary">
              {t('support.prefill.onboarding_desc')}
            </p>
            <p className="text-sm font-semibold text-dc1-text-primary mt-2">
              {t('support.prefill.current_state')}: {providerStateLabelMap[prefilledProviderState]}
            </p>
          </div>
        )}

        {/* Contact channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {supportChannels.map((ch) => (
            <div key={ch.title} className="card">
              <div className="text-2xl mb-3">{ch.icon}</div>
              <h2 className="text-lg font-semibold text-dc1-text-primary mb-2">{ch.title}</h2>
              <p className="text-sm text-dc1-text-secondary mb-3">{ch.description}</p>
              <a href={`mailto:${ch.contact}`} className="text-sm text-dc1-amber hover:underline">{ch.contact}</a>
            </div>
          ))}
        </div>

        {/* Contact Form */}
        <ContactForm
          t={t}
          initialCategory={prefilledCategory}
          initialMessage={prefilledMessage}
          source={supportSource}
          providerState={prefilledProviderState}
        />

        {/* FAQ */}
        <h2 className="text-2xl font-bold text-dc1-text-primary mb-6">{t('support.faq.title')}</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="card">
              <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{faq.q}</h3>
              <p className="text-sm text-dc1-text-secondary">{faq.a}</p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}>
      <SupportPageInner />
    </Suspense>
  )
}
