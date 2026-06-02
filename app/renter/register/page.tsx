'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// 2026-05-09: register now returns 202 + {next:'check_email', email, message}
// (no api_key). The user clicks the magic link in their inbox; that flow
// finalizes the row and lands them on /renter/marketplace.
interface RegistrationResult {
  renter_id?: number
  next: 'check_email'
  email: string
  message: string
}

export default function RenterRegisterPage() {
  const { t, language } = useLanguage()
  const isRTL = language === 'ar'
  const billingExplainerRef = useRef<HTMLDivElement | null>(null)
  const hasTrackedBillingExplainerView = useRef(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    useCase: 'AI Training',
    phone: '',
    pdplConsent: false,
  })

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  // Resend-with-cooldown for the magic-link success state. Mirrors the pattern
  // in app/login/page.tsx: a 60s countdown gates re-requests, and the backend
  // handles /renters/register resends idempotently.
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState('')
  const [resent, setResent] = useState(false)

  const trackRegisterEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = {
      event,
      source_page: 'renter_register',
      role_intent: 'renter',
      surface: 'registration',
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
  }, [])

  const useCaseOptions = [
    'AI Training',
    'Inference',
    'Image Generation',
    'Scientific Computing',
    'Other',
  ]
  const modelDocsHref = language === 'ar' ? '/docs/ar/models' : '/docs/models'
  const firstWorkloadActions = useMemo(
    () => [
      {
        title: t('conversion.first_workload.step1_title'),
        description: t('conversion.first_workload.step1_desc'),
        href: '/renter/marketplace?source=renter_register_first_workload&step=browse_marketplace',
      },
      {
        title: t('conversion.first_workload.step2_title'),
        description: t('conversion.first_workload.step2_desc'),
        href: '/renter/playground?source=renter_register_first_workload&step=submit_job',
      },
      {
        title: t('conversion.first_workload.step3_title'),
        description: t('conversion.first_workload.step3_desc'),
        href: '/docs/quickstart?source=renter_register_first_workload&step=quickstart_docs',
      },
    ],
    [t]
  )
  const modeChecklist = useMemo(
    () => [
      { label: t('mode.label.marketplace'), detail: t('mode.desc.marketplace'), href: '/renter/marketplace' },
      { label: t('mode.label.playground'), detail: t('mode.desc.playground'), href: '/renter/playground?starter=1' },
      { label: t('mode.label.docs_api'), detail: t('mode.desc.docs_api'), href: '/docs/api-reference' },
      { label: t('mode.label.enterprise_support'), detail: t('mode.desc.enterprise_support'), href: '/support?category=enterprise&source=renter_register_success#contact-form' },
    ],
    [t]
  )
  const pathChooserLanes = useMemo(
    () => [
      {
        key: 'self_serve_renter',
        label: t('path_chooser.self_serve.label'),
        description: t('path_chooser.self_serve.desc'),
        href: '/renter/register?source=renter_register_path_chooser&lane=self_serve_renter',
      },
      {
        key: 'provider_onboarding',
        label: t('path_chooser.provider.label'),
        description: t('path_chooser.provider.desc'),
        href: '/earn?source=renter_register_path_chooser&lane=provider_onboarding',
      },
      {
        key: 'enterprise_intake',
        label: t('path_chooser.enterprise.label'),
        description: t('path_chooser.enterprise.desc'),
        href: '/support?category=enterprise&source=renter_register_path_chooser&lane=enterprise_intake#contact-form',
      },
      {
        key: 'arabic_model_docs',
        label: t('path_chooser.arabic.label'),
        description: t('path_chooser.arabic.desc'),
        href: '/docs?source=renter_register_path_chooser&lane=arabic_model_docs',
      },
    ],
    [t]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!formData.pdplConsent) {
      setError(t('register.renter.pdpl_error'))
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_BASE}/renters/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          organization: formData.organization.trim() || undefined,
          use_case: formData.useCase.trim() || undefined,
          phone: formData.phone.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Registration failed')
      }

      const data = await res.json()
      setResult({
        renter_id: data.renter_id,
        next: 'check_email',
        email: data.email || formData.email.trim(),
        message: data.message || `We sent a sign-in link to ${formData.email.trim()}. Click it to finish creating your account.`,
      })
      setSuccess(true)
      setResendCountdown(60)
      // Persist the role intent so /auth/verify lands the user on
      // /renter/marketplace when they click the magic link.
      try {
        sessionStorage.setItem('dcp_login_prefer_role', 'renter')
      } catch {
        /* ignore — Safari private mode etc. */
      }
      trackRegisterEvent('renter_register_link_sent', {
        surface: 'registration_form',
        destination: '/api/renters/register',
        step: 'magic_link_sent',
      })
    } catch (err) {
      trackRegisterEvent('renter_register_failed', {
        surface: 'registration_form',
        destination: '/api/renters/register',
        step: 'submit_failure',
        error: err instanceof Error ? err.message : 'unknown_error',
      })
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // The api_key is no longer surfaced in the registration response (2026-05-09
  // — magic-link verification gates account activation), so the inline copy /
  // direct-login affordances were removed. `copied` state is preserved as a
  // no-op to avoid unrelated changes to the unused-state lint surface.
  void copied
  void setCopied

  useEffect(() => {
    const node = billingExplainerRef.current
    if (!node || hasTrackedBillingExplainerView.current || success) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (hasTrackedBillingExplainerView.current) return
        if (entries.some((entry) => entry.isIntersecting)) {
          hasTrackedBillingExplainerView.current = true
          trackRegisterEvent('billing_explainer_viewed', {
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
  }, [success, trackRegisterEvent])

  // Tick down the resend cooldown once per second while it is active.
  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  // Re-request the sign-in link. The backend treats /renters/register as an
  // idempotent resend for an already-staged email, so we re-POST the same
  // payload and restart the cooldown.
  const handleResendLink = async () => {
    if (resendCountdown > 0 || resending || !result) return
    setResending(true)
    setResendError('')
    setResent(false)
    try {
      const res = await fetch(`${API_BASE}/renters/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: result.email,
          organization: formData.organization.trim() || undefined,
          use_case: formData.useCase.trim() || undefined,
          phone: formData.phone.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not resend the link. Try again shortly.')
      }
      setResent(true)
      setResendCountdown(60)
      trackRegisterEvent('renter_register_link_resent', {
        surface: 'registration_success',
        destination: '/api/renters/register',
        step: 'magic_link_resent',
      })
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Could not resend the link.')
    } finally {
      setResending(false)
    }
  }

  if (success && result) {
    const firstDeployFastLaneHref = '/renter/marketplace/templates?source=renter_register_success_fast_lane'
    const supportRoutes = [
      {
        label: t('conversion.support.route.billing'),
        descriptor: t('conversion.support.route.billing_desc'),
        href: '/support?category=billing&source=renter_register_success#contact-form',
      },
      {
        label: t('conversion.support.route.job'),
        descriptor: t('conversion.support.route.job_desc'),
        href: '/support?category=bug&source=renter_register_success#contact-form',
      },
      {
        label: t('conversion.support.route.account'),
        descriptor: t('conversion.support.route.account_desc'),
        href: '/support?category=renter&source=renter_register_success#contact-form',
      },
    ]

    return (
      <>
        <Header />
        <main className="min-h-screen bg-dc1-void flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl">
            <div className="card bg-dc1-surface-l1 border border-dc1-border rounded-lg p-8 text-center">
              {/* Magic-link sent state — mirrors /login post-send UI. The user's
                  account is staged but not active until they click the link. */}
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2/60 p-6 text-center mb-6">
                <svg className="w-12 h-12 mx-auto text-dc1-amber mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h2 className="text-2xl font-bold text-dc1-text-primary mb-1">Check your email</h2>
                <p className="text-sm text-dc1-text-secondary mb-2">
                  We sent a sign-in link to
                </p>
                <p className="text-base text-dc1-amber font-mono mb-4 break-all">{result.email}</p>
                <p className="text-xs text-dc1-text-secondary mb-4">
                  Open the email and click <span className="text-dc1-text-primary font-semibold">Sign In to DCP</span>.
                  The link expires in 15 minutes and can only be used once.
                </p>

                {resent && (
                  <p className="text-xs text-emerald-400 mb-2">
                    New link sent — check your inbox again.
                  </p>
                )}
                {resendError && (
                  <p className="text-xs text-status-error mb-2">{resendError}</p>
                )}

                <div className="flex flex-col items-center gap-2">
                  {resendCountdown > 0 ? (
                    <span className="text-xs text-dc1-text-secondary">
                      You can request a new link in {resendCountdown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendLink}
                      disabled={resending}
                      className="text-sm font-medium text-dc1-amber hover:text-dc1-amber/80 disabled:opacity-60"
                    >
                      {resending ? 'Resending…' : 'Resend link'}
                    </button>
                  )}
                  <span className="text-xs text-dc1-text-muted">
                    Didn&apos;t get it? Check your spam folder, or{' '}
                    <a href="/renter/register" className="text-dc1-amber hover:underline">use a different email</a>.
                  </span>
                </div>
              </div>

              <div className={`rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 p-5 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-amber mb-2">
                  First deploy fast lane
                </p>
                <h3 className="text-lg font-semibold text-dc1-text-primary mb-2">{t('conversion.first_workload.title')}</h3>
                <p className="text-sm text-dc1-text-secondary mb-4">{t('conversion.first_workload.subtitle')}</p>
                <a
                  href={firstDeployFastLaneHref}
                  onClick={() =>
                    trackRegisterEvent('register_success_fast_lane_cta_clicked', {
                      source_page: 'renter_register_success',
                      surface: 'fast_lane_primary',
                      destination: firstDeployFastLaneHref,
                      step: 'launch_first_deploy',
                      cta_type: 'first_deploy_fast_lane',
                    })
                  }
                  className="btn btn-primary w-full sm:w-auto"
                >
                  {t('conversion.first_workload.primary_cta')}
                </a>
              </div>

              <div className={`bg-dc1-surface-l2 border border-dc1-border rounded-lg p-5 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-base font-semibold text-dc1-text-primary mb-3">
                  {t('conversion.first_job.title')}
                </h3>
                <ol className="space-y-2 text-sm text-dc1-text-secondary">
                  {modeChecklist.map((item, index) => (
                    <li key={item.href} className={`flex items-center justify-between gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l3 px-3 py-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className={isRTL ? 'text-right' : 'text-left'}>
                        <span className="font-medium text-dc1-text-primary">{index + 1}. {item.label}</span>
                        <span className="block text-xs text-dc1-text-secondary mt-0.5">{item.detail}</span>
                      </span>
                      <a
                        href={item.href}
                        onClick={() =>
                          trackRegisterEvent('first_job_checklist_step_clicked', {
                            source_page: 'renter_register_success',
                            surface: 'first_job_checklist',
                            destination: item.href,
                            step: index + 1,
                            step_label: item.label,
                          })
                        }
                        className="text-xs font-medium text-dc1-amber hover:underline"
                      >
                        {t('common.open')}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>

              <div className={`rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{t('conversion.support.title')}</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">{t('conversion.support.subtitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {supportRoutes.map((route) => (
                    <a
                      key={route.href}
                      href={route.href}
                      onClick={() =>
                        trackRegisterEvent('renter_support_route_clicked', {
                          source_page: 'renter_register_success',
                          surface: 'support_routes',
                          destination: route.href,
                          step: 'route_click',
                        })
                      }
                      className={`rounded-md border border-dc1-border bg-dc1-surface-l3 px-3 py-2 text-xs font-medium text-dc1-text-primary hover:border-dc1-amber hover:text-dc1-amber transition-colors ${isRTL ? 'text-right' : 'text-left'}`}
                    >
                      <span className="block text-dc1-text-primary">
                        {route.label} {t('conversion.support.cta')}
                      </span>
                      <span className="mt-1 block text-[11px] font-normal leading-relaxed text-dc1-text-secondary">
                        {route.descriptor}
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              <div className={`rounded-lg border border-dc1-amber/25 bg-dc1-amber/5 p-4 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-sm font-semibold text-dc1-text-primary mb-2">{t('billing.explainer.title')}</h3>
                <ul className="space-y-1 text-xs text-dc1-text-secondary">
                  <li>{t('billing.explainer.step1')}</li>
                  <li>{t('billing.explainer.step2')}</li>
                  <li>{t('billing.explainer.step3')}</li>
                </ul>
                <p className="mt-2 text-xs text-dc1-text-muted">{t('billing.explainer.note')}</p>
              </div>

              <p className="text-sm text-dc1-text-secondary mb-3">
                {t('conversion.first_job.first_result_guidance')}
              </p>

              <div className={`rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{t('conversion.arabic_models.title')}</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">{t('conversion.arabic_models.subtitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a
                    href={modelDocsHref}
                    onClick={() =>
                      trackRegisterEvent('register_success_arabic_models_docs_clicked', {
                        source_page: 'renter_register_success',
                        surface: 'arabic_model_discovery',
                        destination: modelDocsHref,
                        step: 'open_model_library',
                      })
                    }
                    className="btn btn-secondary text-sm"
                  >
                    {t('conversion.arabic_models.docs_cta')}
                  </a>
                  <a
                    href="/renter/marketplace"
                    onClick={() =>
                      trackRegisterEvent('register_success_arabic_models_marketplace_clicked', {
                        source_page: 'renter_register_success',
                        surface: 'arabic_model_discovery',
                        destination: '/renter/marketplace',
                        step: 'browse_model_ready_gpus',
                      })
                    }
                    className="btn btn-secondary text-sm"
                  >
                    {t('conversion.arabic_models.marketplace_cta')}
                  </a>
                </div>
                <p className="mt-3 text-xs text-dc1-text-muted">{t('conversion.arabic_models.note')}</p>
              </div>

              <div className={`flex flex-wrap items-center gap-3 text-sm ${isRTL ? 'justify-end' : 'justify-start'}`}>
                <a
                  href="/renter/playground?starter=1&source=renter_register_success_secondary"
                  onClick={() =>
                    trackRegisterEvent('register_success_secondary_cta_clicked', {
                      source_page: 'renter_register_success',
                      surface: 'success_secondary_actions',
                      destination: '/renter/playground?starter=1&source=renter_register_success_secondary',
                      step: 'open_playground',
                    })
                  }
                  className="text-dc1-amber hover:underline"
                >
                  {t('nav.playground')}
                </a>
                <span className="text-dc1-text-muted">•</span>
                <a
                  href="/renter/marketplace?source=renter_register_success_secondary"
                  onClick={() =>
                    trackRegisterEvent('register_success_secondary_cta_clicked', {
                      source_page: 'renter_register_success',
                      surface: 'success_secondary_actions',
                      destination: '/renter/marketplace?source=renter_register_success_secondary',
                      step: 'open_marketplace',
                    })
                  }
                  className="text-dc1-amber hover:underline"
                >
                  {t('nav.marketplace')}
                </a>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-dc1-void py-12">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-dc1-text-primary mb-4">
              {t('register.renter.title')}
            </h1>
            <p className="text-xl text-dc1-text-secondary max-w-2xl mx-auto">
              {t('register.renter.subtitle_main')}
            </p>
          </div>
        </section>

        {/* Billing transparency */}
        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div ref={billingExplainerRef} className="rounded-xl border border-dc1-amber/25 bg-dc1-amber/5 p-6">
            <h2 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('billing.explainer.title')}</h2>
            <ul className="space-y-2 text-sm text-dc1-text-secondary">
              <li>{t('billing.explainer.step1')}</li>
              <li>{t('billing.explainer.step2')}</li>
              <li>{t('billing.explainer.step3')}</li>
            </ul>
            <p className="mt-3 text-xs text-dc1-text-muted">{t('billing.explainer.note')}</p>
            <p className="mt-2 text-xs text-dc1-text-muted">{t('billing.explainer.rail_status')}</p>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className={`rounded-xl border border-dc1-amber/25 bg-dc1-amber/5 p-5 ${isRTL ? 'text-right' : 'text-left'}`}>
            <h2 className="text-base font-semibold text-dc1-text-primary mb-1">{t('conversion.first_workload.title')}</h2>
            <p className="text-xs text-dc1-text-secondary mb-3">{t('conversion.first_workload.subtitle')}</p>
            <a
              href="/renter/playground?source=renter_register_first_workload&step=submit_job"
              className="btn btn-primary btn-sm w-full sm:w-auto mb-4"
            >
              {t('conversion.first_workload.primary_cta')}
            </a>
            <div className="grid grid-cols-1 gap-2">
              {firstWorkloadActions.map((item) => (
                <a key={item.href} href={item.href} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 hover:border-dc1-amber transition-colors">
                  <p className="text-sm font-semibold text-dc1-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">{item.description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className={`rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 ${isRTL ? 'text-right' : 'text-left'}`}>
            <h2 className="text-base font-semibold text-dc1-text-primary mb-1">{t('path_chooser.title')}</h2>
            <p className="text-xs text-dc1-text-secondary mb-3">{t('path_chooser.subtitle')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pathChooserLanes.map((lane) => (
                <a key={lane.key} href={lane.href} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 hover:border-dc1-amber transition-colors">
                  <p className="text-sm font-semibold text-dc1-text-primary">{lane.label}</p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">{lane.description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className={`rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 ${isRTL ? 'text-right' : 'text-left'}`}>
            <h2 className="text-base font-semibold text-dc1-text-primary mb-3">{t('conversion.first_job.title')}</h2>
            <ol className="space-y-2 text-sm text-dc1-text-secondary">
              {modeChecklist.map((item, index) => (
                <li key={item.href} className={`flex items-center justify-between gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className={isRTL ? 'text-right' : 'text-left'}>
                    <span className="font-medium text-dc1-text-primary">{index + 1}. {item.label}</span>
                    <span className="block text-xs text-dc1-text-secondary mt-0.5">{item.detail}</span>
                  </span>
                  <a href={item.href} className="text-xs font-medium text-dc1-amber hover:underline">
                    {t('common.open')}
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-dc1-text-muted">{t('conversion.first_job.first_result_guidance')}</p>
          </div>
        </section>

        {/* Registration Form */}
        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="card bg-dc1-surface-l1 border border-dc1-border rounded-lg p-8">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-6">{t('register.renter.form_title')}</h2>

            {error && (
              <div className="alert-error mb-6">
                <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div>
                <label htmlFor="name" className="label">
                  {t('register.renter.full_name')} <span className="text-status-error">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder={t('register.renter.full_name_placeholder')}
                  className="input"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="label">
                  {t('register.renter.email')} <span className="text-status-error">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder={t('register.renter.email_placeholder')}
                  className="input"
                />
              </div>

              {/* Company/Organization */}
              <div>
                <label htmlFor="organization" className="label">
                  {t('register.renter.organization')}
                </label>
                <input
                  type="text"
                  id="organization"
                  name="organization"
                  value={formData.organization}
                  onChange={handleChange}
                  placeholder={t('register.renter.org_placeholder_text')}
                  className="input"
                />
              </div>

              {/* Use Case */}
              <div>
                <label htmlFor="useCase" className="label">
                  {t('register.renter.use_case')} <span className="text-status-error">*</span>
                </label>
                <select
                  id="useCase"
                  name="useCase"
                  value={formData.useCase}
                  onChange={handleChange}
                  required
                  className="input"
                >
                  {useCaseOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="label">
                  {t('register.renter.phone')} <span className="text-dc1-text-muted">{t('register.renter.optional')}</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder={t('register.renter.phone_placeholder')}
                  className="input"
                />
              </div>

              {/* PDPL Consent */}
              <div className="p-4 rounded-lg bg-dc1-surface-l2 border border-dc1-border">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="pdplConsent"
                    checked={formData.pdplConsent}
                    onChange={(e) => setFormData(prev => ({ ...prev, pdplConsent: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-dc1-border accent-dc1-amber flex-shrink-0"
                    required
                  />
                  <span className="text-sm text-dc1-text-secondary">
                    {t('register.renter.pdpl_text')}{' '}
                    <a href="/privacy" className="text-dc1-amber hover:underline">{t('register.renter.privacy_policy')}</a>.
                    {' '}{t('register.renter.pdpl_text2')}{' '}
                    <a href="/terms" className="text-dc1-amber hover:underline">{t('register.renter.terms')}</a>.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? t('register.renter.submitting') : t('register.renter.submit')}
              </button>
              <p className="text-xs text-dc1-text-muted text-center">
                Jobs run in NVIDIA containerized runtime paths and settle by measured usage.
              </p>

              <p className="text-center text-sm text-dc1-text-secondary">
                {t('register.renter.already_registered')}{' '}
                <a href="/renter" className="text-dc1-amber hover:underline">
                  {t('register.renter.sign_in')}
                </a>
              </p>
            </form>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <h3 className="section-heading mb-8">{t('register.renter.what_you_can_do')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Browse Marketplace */}
            <div className="card-hover">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-dc1-amber/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-dc1-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              </div>
              <h4 className="text-lg font-semibold text-dc1-text-primary mb-2">{t('register.renter.browse_title')}</h4>
              <p className="text-sm text-dc1-text-secondary">
                {t('register.renter.browse_desc')}
              </p>
            </div>

            {/* Card 2: Submit Jobs */}
            <div className="card-hover">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-dc1-amber/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-dc1-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <h4 className="text-lg font-semibold text-dc1-text-primary mb-2">{t('register.renter.submit_title')}</h4>
              <p className="text-sm text-dc1-text-secondary">
                {t('register.renter.submit_desc')}
              </p>
            </div>

            {/* Card 3: Pay Per Use */}
            <div className="card-hover">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-dc1-amber/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-dc1-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h4 className="text-lg font-semibold text-dc1-text-primary mb-2">{t('register.renter.pay_title')}</h4>
              <p className="text-sm text-dc1-text-secondary">
                {t('register.renter.pay_desc')}
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
