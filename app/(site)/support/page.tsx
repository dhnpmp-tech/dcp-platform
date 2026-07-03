'use client'

// /support — help center + enterprise intake. Redesigned to the Midnight
// editorial-luxury design language (dcp-kit tokens, Instrument Serif headings,
// JetBrains Mono labels, SiteShell chrome). The OLD dc1-* Tailwind palette +
// rounded-card look is gone.
//
// i18n migrated to the (site) V2 i18n (useV2); copy is inlined bilingually.
// Behaviour preserved: role-intent prefill, enterprise intake routes, the
// API-backed contact form with mailto fallback, analytics, scenario tiles,
// contact channels, and FAQ.

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import SiteShell from '../components/chrome/SiteShell'
import { useV2 } from '@/app/(site)/lib/i18n'
import {
  intentSupportCategory,
  persistRoleIntent,
  readRoleIntent,
  RoleIntent,
  trackRoleIntentApplied,
} from '@/app/lib/role-intent'

type Lang = 'en' | 'ar'
type ProviderState = 'waiting' | 'heartbeat' | 'ready' | 'paused' | 'stale'
type SupportCategory = 'general' | 'account' | 'billing' | 'provider' | 'renter' | 'bug' | 'enterprise'

interface BiText {
  en: string
  ar: string
}

const T = (lang: Lang, b: BiText) => (lang === 'ar' ? b.ar : b.en)

const CATEGORY_LABELS: Record<SupportCategory, BiText> = {
  general: { en: 'General', ar: 'عام' },
  account: { en: 'Account', ar: 'الحساب' },
  billing: { en: 'Billing', ar: 'الفوترة' },
  provider: { en: 'Provider (earn with your GPU)', ar: 'مزوّد (اكسب بمعالجك)' },
  renter: { en: 'Renter (use the API)', ar: 'مستأجر (استخدم الواجهة)' },
  bug: { en: 'Bug / a job failed', ar: 'خطأ / فشلت وظيفة' },
  enterprise: { en: 'Enterprise', ar: 'مؤسسات' },
}

const PROVIDER_STATE_MSG: Record<ProviderState, BiText> = {
  waiting: { en: 'My rig is installed but still showing “waiting” — it has not come online yet.', ar: 'جهازي مثبّت لكنه لا يزال في حالة «الانتظار» — لم يتصل بعد.' },
  heartbeat: { en: 'My rig sends a heartbeat but is not receiving any inference work.', ar: 'يرسل جهازي نبضة لكنه لا يستقبل أي عمل استدلال.' },
  ready: { en: 'My rig shows ready — I want to confirm it is earning correctly.', ar: 'يظهر جهازي جاهزاً — أريد التأكد من أنه يكسب بشكل صحيح.' },
  paused: { en: 'My rig is paused and I cannot resume it.', ar: 'جهازي متوقف ولا أستطيع استئنافه.' },
  stale: { en: 'My rig went stale / dropped offline unexpectedly.', ar: 'أصبح جهازي قديماً / فُصل دون توقع.' },
}

const PROVIDER_STATE_LABEL: Record<ProviderState, BiText> = {
  waiting: { en: 'Waiting', ar: 'في الانتظار' },
  heartbeat: { en: 'Heartbeat', ar: 'نبضة' },
  ready: { en: 'Ready', ar: 'جاهز' },
  paused: { en: 'Paused', ar: 'متوقف' },
  stale: { en: 'Stale', ar: 'قديم' },
}

const ENTERPRISE_ROUTES: { flow: string; title: BiText; desc: BiText }[] = [
  {
    flow: 'sla',
    title: { en: 'SLA & uptime', ar: 'اتفاقية الخدمة والتوافر' },
    desc: { en: 'Discuss service levels, uptime targets, and the trust appendix.', ar: 'ناقش مستويات الخدمة وأهداف التوافر وملحق الثقة.' },
  },
  {
    flow: 'security',
    title: { en: 'Security review', ar: 'مراجعة أمنية' },
    desc: { en: 'Network, container, and key-management controls for your audit.', ar: 'ضوابط الشبكة والحاويات وإدارة المفاتيح لتدقيقك.' },
  },
  {
    flow: 'onboarding',
    title: { en: 'Onboarding plan', ar: 'خطة التهيئة' },
    desc: { en: 'A staged rollout for your team, with checkpoints and owners.', ar: 'إطلاق مرحلي لفريقك، مع نقاط مراجعة ومسؤولين.' },
  },
]

const CHANNELS: { title: BiText; desc: BiText; contact: string; glyph: string }[] = [
  {
    title: { en: 'General support', ar: 'الدعم العام' },
    desc: { en: 'Accounts, billing, the API, and anything else.', ar: 'الحسابات والفوترة والواجهة وأي شيء آخر.' },
    contact: 'support@dcp.sa',
    glyph: '✉',
  },
  {
    title: { en: 'Report abuse', ar: 'الإبلاغ عن إساءة' },
    desc: { en: 'Misuse of the platform or a provider rig.', ar: 'إساءة استخدام المنصة أو جهاز مزوّد.' },
    contact: 'abuse@dcp.sa',
    glyph: '⚠',
  },
  {
    title: { en: 'Privacy & data', ar: 'الخصوصية والبيانات' },
    desc: { en: 'PDPL requests, data residency, and retention.', ar: 'طلبات PDPL وإقامة البيانات والاحتفاظ.' },
    contact: 'privacy@dcp.sa',
    glyph: '🔒',
  },
]

const SCENARIOS: { key: string; category: SupportCategory; title: BiText; desc: BiText }[] = [
  {
    key: 'provider_install',
    category: 'provider',
    title: { en: 'My provider install is stuck', ar: 'تثبيت المزوّد متوقف' },
    desc: { en: 'The daemon installed but the rig has not come online.', ar: 'ثُبّت البرنامج الخفي لكن الجهاز لم يتصل.' },
  },
  {
    key: 'job_failed',
    category: 'bug',
    title: { en: 'A job failed or returned an error', ar: 'فشلت وظيفة أو أعادت خطأ' },
    desc: { en: 'An inference request errored and you want it looked at.', ar: 'أخطأ طلب استدلال وتريد فحصه.' },
  },
  {
    key: 'billing_credits',
    category: 'billing',
    title: { en: 'A billing or credits question', ar: 'سؤال عن الفوترة أو الرصيد' },
    desc: { en: 'Top-ups, invoices, the free trial credit, or a charge.', ar: 'الشحن أو الفواتير أو رصيد التجربة المجانية أو خصم.' },
  },
  {
    key: 'enterprise_onboarding',
    category: 'enterprise',
    title: { en: 'Onboard my organisation', ar: 'تهيئة مؤسستي' },
    desc: { en: 'Procurement, security review, and a rollout plan.', ar: 'المشتريات والمراجعة الأمنية وخطة الإطلاق.' },
  },
]

const FAQ: { q: BiText; a: BiText }[] = [
  {
    q: { en: 'How fast will I hear back?', ar: 'متى سأتلقى رداً؟' },
    a: {
      en: 'General requests are answered within a couple of business days. Enterprise intake targets a first contact within one business day.',
      ar: 'يُرد على الطلبات العامة خلال يومي عمل تقريباً. تستهدف مسارات المؤسسات تواصلاً أولياً خلال يوم عمل واحد.',
    },
  },
  {
    q: { en: 'Do you support Arabic?', ar: 'هل تدعمون العربية؟' },
    a: {
      en: 'Yes. The whole product, docs, and support are bilingual Arabic/English, and the platform is Arabic-first.',
      ar: 'نعم. المنتج والتوثيق والدعم كلها بالعربية والإنجليزية، والمنصة عربية أولاً.',
    },
  },
  {
    q: { en: 'Is my data kept in the Kingdom?', ar: 'هل تُحفظ بياناتي داخل المملكة؟' },
    a: {
      en: 'Sovereign requests run on verified Saudi GPUs and never leave the Kingdom. See the trust center and security pages for the controls.',
      ar: 'الطلبات السيادية تعمل على معالجات سعودية متحققة ولا تغادر المملكة. راجع مركز الثقة وصفحة الأمن للاطلاع على الضوابط.',
    },
  },
  {
    q: { en: 'How do I become a provider?', ar: 'كيف أصبح مزوّداً؟' },
    a: {
      en: 'Register on the provider setup, install the daemon, and your rig joins the mesh. The earn page walks through it.',
      ar: 'سجّل في إعداد المزوّد، ثبّت البرنامج الخفي، وينضم جهازك إلى الشبكة. توضّح صفحة الكسب الخطوات.',
    },
  },
  {
    q: { en: 'Where are the API docs?', ar: 'أين توثيق الواجهة؟' },
    a: {
      en: 'The docs cover the OpenAI-compatible endpoints, auth, and SAR billing. They are linked from the header.',
      ar: 'يغطي التوثيق النقاط المتوافقة مع OpenAI والمصادقة والفوترة بالريال. يمكن الوصول إليه من الترويسة.',
    },
  },
]

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
}

function ContactForm({
  lang,
  initialCategory,
  initialMessage,
  source,
  providerState,
}: {
  lang: Lang
  initialCategory: string
  initialMessage: string
  source: string
  providerState: ProviderState | null
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    category: initialCategory || 'general',
    message: initialMessage || '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent_api' | 'sent_fallback'>('idle')
  const [fallbackMailto, setFallbackMailto] = useState('')

  const buildMailtoUrl = (payload: typeof form) =>
    `mailto:support@dcp.sa?subject=[${payload.category}] Support Request from ${payload.name}&body=${encodeURIComponent(
      payload.message
    )}`

  const categoryOptions = useMemo(
    () =>
      (Object.keys(CATEGORY_LABELS) as SupportCategory[]).map((value) => ({
        value,
        label: T(lang, CATEGORY_LABELS[value]),
      })),
    [lang]
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
    e.preventDefault()
    setStatus('sending')
    setFallbackMailto('')
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source, provider_state: providerState ?? null }),
      })
      if (res.ok) {
        setStatus('sent_api')
        setForm({ name: '', email: '', category: 'general', message: '' })
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
        setStatus('sent_fallback')
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
      setStatus('sent_fallback')
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
  }

  if (status === 'sent_api') {
    return (
      <div id="contact-form" className="surface center" style={{ scrollMarginTop: 96, padding: '40px 24px' }}>
        <div className="badge ok" style={{ margin: '0 auto 12px' }}>
          <span className="d" /> {T(lang, { en: 'Sent', ar: 'أُرسل' })}
        </div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 26, margin: '0 0 6px' }}>
          {T(lang, { en: 'Message received', ar: 'تم استلام الرسالة' })}
        </p>
        <p style={{ color: 'var(--ink-2)', fontSize: 14.5 }}>
          {T(lang, { en: 'We will reply to the email you provided. Thank you.', ar: 'سنرد على البريد الذي زودتنا به. شكراً لك.' })}
        </p>
        <button type="button" onClick={() => setStatus('idle')} className="btn ghost small" style={{ marginTop: 16 }}>
          {T(lang, { en: 'Send another', ar: 'إرسال رسالة أخرى' })}
        </button>
      </div>
    )
  }

  if (status === 'sent_fallback') {
    return (
      <div id="contact-form" className="surface center" style={{ scrollMarginTop: 96, padding: '40px 24px' }}>
        <div className="badge warn" style={{ margin: '0 auto 12px' }}>
          <span className="d" /> {T(lang, { en: 'Use email', ar: 'استخدم البريد' })}
        </div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 26, margin: '0 0 6px' }}>
          {T(lang, { en: 'We could not submit the form', ar: 'تعذّر إرسال النموذج' })}
        </p>
        <p style={{ color: 'var(--ink-2)', fontSize: 14.5 }}>
          {T(lang, {
            en: 'Open your email client to send the message directly instead.',
            ar: 'افتح برنامج البريد لإرسال الرسالة مباشرة بدلاً من ذلك.',
          })}
        </p>
        <div className="row center" style={{ justifyContent: 'center', marginTop: 16 }}>
          <a
            href={fallbackMailto}
            className="btn primary"
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
          >
            {T(lang, { en: 'Open email', ar: 'افتح البريد' })}
          </a>
          <button type="button" onClick={() => setStatus('idle')} className="btn ghost">
            {T(lang, { en: 'Try the form again', ar: 'جرّب النموذج مجدداً' })}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form id="contact-form" onSubmit={handleSubmit} className="surface" style={{ scrollMarginTop: 96 }}>
      <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(28px,3.4vw,40px)', margin: '0 0 18px', lineHeight: 1.05 }}>
        {T(lang, { en: 'Send us a message', ar: 'أرسل لنا رسالة' })}
      </h2>
      <div className="grid-2" style={{ gap: 18 }}>
        <label className="field">
          <span className="field-label">{T(lang, { en: 'Name', ar: 'الاسم' })}</span>
          <input
            className="input"
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={T(lang, { en: 'Your name', ar: 'اسمك' })}
          />
        </label>
        <label className="field">
          <span className="field-label">{T(lang, { en: 'Email', ar: 'البريد الإلكتروني' })}</span>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@company.sa"
            dir="ltr"
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">{T(lang, { en: 'Category', ar: 'الفئة' })}</span>
        <select
          className="select"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{T(lang, { en: 'Message', ar: 'الرسالة' })}</span>
        <textarea
          className="textarea"
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder={T(lang, { en: 'How can we help?', ar: 'كيف يمكننا المساعدة؟' })}
        />
      </label>
      {form.category === 'enterprise' && (
        <div className="callout" style={{ marginTop: 0, marginBottom: 18 }}>
          <b>{T(lang, { en: 'Enterprise intake', ar: 'دخول المؤسسات' })}</b>
          <p style={{ margin: '0 0 8px' }}>
            {T(lang, {
              en: 'To speed up the review, include where useful:',
              ar: 'لتسريع المراجعة، أدرج عند الحاجة:',
            })}
          </p>
          <ul style={{ margin: 0, paddingInlineStart: 18, color: 'var(--ink-2)', fontSize: 14 }}>
            <li>{T(lang, { en: 'Procurement & legal contacts', ar: 'جهات المشتريات والشؤون القانونية' })}</li>
            <li>{T(lang, { en: 'Security / compliance scope', ar: 'نطاق الأمن والامتثال' })}</li>
            <li>{T(lang, { en: 'Target rollout timeline', ar: 'الجدول الزمني المستهدف للإطلاق' })}</li>
          </ul>
        </div>
      )}
      <button type="submit" disabled={status === 'sending'} className="btn primary lg">
        {status === 'sending'
          ? T(lang, { en: 'Sending…', ar: 'جارٍ الإرسال…' })
          : T(lang, { en: 'Send message →', ar: 'إرسال الرسالة ←' })}
      </button>
    </form>
  )
}

function SupportPageInner() {
  const { lang } = useV2()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [storedIntent, setStoredIntent] = useState<RoleIntent | null>(null)

  // useSearchParams CSR-bails this subtree during prerender, so the static
  // HTML never contains #contact-form and the browser's native fragment jump
  // finds nothing on first paint. Re-run the jump once the real tree mounts —
  // this is what keeps the /support?…#contact-form deep links from
  // /security and /trust-center working.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [])

  const requestedCategory = (searchParams.get('category') || '').toLowerCase()
  const supportSource = searchParams.get('source') || 'direct'
  const supportFlow = searchParams.get('flow') || ''
  const providerStateParam = (searchParams.get('provider_state') || '').toLowerCase()
  const providerId = searchParams.get('provider_id') || ''

  const validCategoryValues: SupportCategory[] = ['general', 'account', 'billing', 'provider', 'renter', 'bug', 'enterprise']
  const validProviderStates: ProviderState[] = ['waiting', 'heartbeat', 'ready', 'paused', 'stale']
  const isSupportCategory = (value: string): value is SupportCategory =>
    validCategoryValues.includes(value as SupportCategory)
  const isProviderState = (value: string): value is ProviderState =>
    validProviderStates.includes(value as ProviderState)

  const prefilledCategoryFromIntent = storedIntent ? intentSupportCategory(storedIntent) : 'general'
  const prefilledCategory: SupportCategory = isSupportCategory(requestedCategory)
    ? requestedCategory
    : (prefilledCategoryFromIntent as SupportCategory)
  const prefilledProviderState: ProviderState | null = isProviderState(providerStateParam) ? providerStateParam : null

  const prefilledMessage =
    supportFlow === 'onboarding' && prefilledProviderState
      ? `${T(lang, PROVIDER_STATE_MSG[prefilledProviderState])}${
          providerId ? `\n${T(lang, { en: 'Provider ID:', ar: 'معرّف المزوّد:' })} ${providerId}` : ''
        }\n${T(lang, { en: 'Steps already tried: install, restart.', ar: 'خطوات جُرّبت: تثبيت، إعادة تشغيل.' })}`
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

  const persistEnterprise = (source: string) => {
    const previousIntent = readRoleIntent()
    persistRoleIntent('enterprise', {
      source,
      previousIntent,
      reason: previousIntent && previousIntent !== 'enterprise' ? 'overridden' : 'persisted',
    })
  }

  return (
    <SiteShell active="/support">
      <main className="support">
        {/* ── Hero ── */}
        <section className="hero" style={{ borderTop: 0 }}>
          <div className="wrap">
            <div className="hero-meta">
              <span className="left">
                <span className="dot">●</span> {T(lang, { en: 'Support · open', ar: 'الدعم · متاح' })}
              </span>
              <span>{T(lang, { en: 'Bilingual · AR / EN', ar: 'ثنائي اللغة · عربي / إنجليزي' })}</span>
            </div>
            <span className="eyebrow">{T(lang, { en: 'Help & enterprise intake', ar: 'المساعدة ودخول المؤسسات' })}</span>
            <h1 className="hero-h">{T(lang, { en: 'How can we help?', ar: 'كيف يمكننا مساعدتك؟' })}</h1>
            <p className="hero-sub">
              {T(lang, {
                en: 'Pick the path that matches your question — or send a message and the right team will pick it up. Enterprise reviews get a dedicated intake lane.',
                ar: 'اختر المسار المناسب لسؤالك — أو أرسل رسالة وسيتولاها الفريق المناسب. تحصل مراجعات المؤسسات على مسار دخول مخصص.',
              })}
            </p>
            <div className="hero-ctas">
              <a href="#contact-form" className="btn primary lg">
                {T(lang, { en: 'Send a message', ar: 'أرسل رسالة' })}
              </a>
              <a href="#enterprise" className="btn ghost lg">
                {T(lang, { en: 'Enterprise intake', ar: 'دخول المؤسسات' })}
              </a>
            </div>
          </div>
        </section>

        {/* ── Enterprise intake ── */}
        <section id="enterprise">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">01 — {T(lang, { en: 'Enterprise intake', ar: 'دخول المؤسسات' })}</span>
              <span>{T(lang, { en: 'First contact in 1 business day', ar: 'تواصل أولي خلال يوم عمل' })}</span>
            </div>
            <h2 className="st">{T(lang, { en: 'Run a procurement-ready review', ar: 'أجرِ مراجعة جاهزة للمشتريات' })}</h2>
            <p className="ss">
              {T(lang, {
                en: 'Three lanes get your organisation moving. Each routes to the contact form, pre-tagged so the enterprise team has context before they reply.',
                ar: 'ثلاثة مسارات تحرّك مؤسستك. يوجّه كل منها إلى نموذج التواصل، موسوماً مسبقاً ليكون لدى فريق المؤسسات سياق قبل الرد.',
              })}
            </p>
            <div className="grid-3" style={{ marginTop: 36 }}>
              {ENTERPRISE_ROUTES.map((route, i) => {
                const dest = `/support?category=enterprise&source=support-enterprise-intake&flow=${route.flow}#contact-form`
                return (
                  <Link
                    key={route.flow}
                    href={dest}
                    className="m-card"
                    style={{ gridColumn: 'auto' }}
                    onClick={() => {
                      persistEnterprise(`support_enterprise_intake_${route.flow}`)
                      trackSupportEvent('support_enterprise_intake_route_clicked', {
                        role_intent: 'enterprise',
                        surface: 'enterprise_intake_band',
                        destination: dest,
                        step: `${route.flow}_route`,
                        route: route.flow,
                      })
                    }}
                  >
                    <span className="org">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="mname">{T(lang, route.title)}</h3>
                    <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                      {T(lang, route.desc)}
                    </p>
                    <div className="mrow">
                      <span>{T(lang, { en: 'Open intake', ar: 'افتح المسار' })}</span>
                      <b>→</b>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div className="callout" style={{ marginTop: 28 }}>
              <b>{T(lang, { en: 'What enterprise buyers get', ar: 'ما يحصل عليه عملاء المؤسسات' })}</b>
              <p style={{ margin: '0 0 6px' }}>
                {T(lang, {
                  en: 'A review plan with explicit controls, decision checkpoints, and named owners — plus the trust artifacts your procurement and security teams need.',
                  ar: 'خطة مراجعة بضوابط واضحة ونقاط قرار ومسؤولين محددين — إضافة إلى أدلة الثقة التي يحتاجها فريقا المشتريات والأمن.',
                })}
              </p>
              <Link href="/trust-center" className="mono" style={{ color: 'var(--teal)', fontSize: 12.5 }}>
                {T(lang, { en: 'Open the trust center →', ar: 'افتح مركز الثقة ←' })}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Pick a path ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">02 — {T(lang, { en: 'Pick a path', ar: 'اختر مساراً' })}</span>
              <span>{T(lang, { en: 'Prefills the form for you', ar: 'يعبّئ النموذج لك' })}</span>
            </div>
            <div className="grid-2">
              {SCENARIOS.map((tile) => (
                <Link
                  key={tile.key}
                  href={`/support?category=${tile.category}&source=support-scenario-${tile.category}#contact-form`}
                  className="surface"
                  onClick={() => trackScenarioClick(tile.category)}
                >
                  <span className="badge">{T(lang, CATEGORY_LABELS[tile.category])}</span>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '12px 0 6px', lineHeight: 1.15 }}>
                    {T(lang, tile.title)}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{T(lang, tile.desc)}</p>
                  <p className="mono" style={{ marginTop: 14, marginBottom: 0, color: 'var(--teal)', fontSize: 12.5 }}>
                    {T(lang, { en: 'Start here →', ar: 'ابدأ هنا ←' })}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Enterprise prefill checklist (contextual) ── */}
        {prefilledCategory === 'enterprise' && (
          <section>
            <div className="wrap">
              <div className="callout">
                <b>{T(lang, { en: 'Enterprise checklist', ar: 'قائمة المؤسسات' })}</b>
                <p style={{ margin: '0 0 8px' }}>
                  {T(lang, {
                    en: 'Including these in your message gets you a sharper first reply:',
                    ar: 'تضمين هذه في رسالتك يمنحك رداً أولياً أدق:',
                  })}
                </p>
                <ul style={{ margin: 0, paddingInlineStart: 18, color: 'var(--ink-2)', fontSize: 14 }}>
                  <li>{T(lang, { en: 'Primary use case', ar: 'حالة الاستخدام الرئيسية' })}</li>
                  <li>{T(lang, { en: 'Expected usage volume', ar: 'حجم الاستخدام المتوقع' })}</li>
                  <li>{T(lang, { en: 'Compliance requirements', ar: 'متطلبات الامتثال' })}</li>
                  <li>{T(lang, { en: 'Target timeline', ar: 'الجدول الزمني المستهدف' })}</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ── Provider onboarding state (contextual) ── */}
        {supportFlow === 'onboarding' && prefilledProviderState && (
          <section>
            <div className="wrap">
              <div className="callout">
                <b>{T(lang, { en: 'Provider onboarding', ar: 'تهيئة المزوّد' })}</b>
                <p style={{ margin: '0 0 6px' }}>
                  {T(lang, {
                    en: 'We pre-filled your message based on your rig status. Add anything else below.',
                    ar: 'عبّأنا رسالتك مسبقاً بناءً على حالة جهازك. أضف أي تفاصيل أخرى أدناه.',
                  })}
                </p>
                <p style={{ margin: 0, color: 'var(--ink)' }}>
                  {T(lang, { en: 'Current state:', ar: 'الحالة الحالية:' })}{' '}
                  <b className="mono" style={{ color: 'var(--teal)' }}>
                    {T(lang, PROVIDER_STATE_LABEL[prefilledProviderState])}
                  </b>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Contact channels ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">03 — {T(lang, { en: 'Direct channels', ar: 'قنوات مباشرة' })}</span>
              <span>{T(lang, { en: 'Email the right team', ar: 'راسل الفريق المناسب' })}</span>
            </div>
            <div className="grid-3">
              {CHANNELS.map((ch) => (
                <div className="surface" key={ch.contact}>
                  <div style={{ fontSize: 24, marginBottom: 10 }} aria-hidden="true">
                    {ch.glyph}
                  </div>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '0 0 6px', lineHeight: 1.1 }}>
                    {T(lang, ch.title)}
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>{T(lang, ch.desc)}</p>
                  <a href={`mailto:${ch.contact}`} className="mono" style={{ color: 'var(--teal)', fontSize: 13 }} dir="ltr">
                    {ch.contact}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact form ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">04 — {T(lang, { en: 'Contact form', ar: 'نموذج التواصل' })}</span>
              <span>{T(lang, { en: 'Routes to the right team', ar: 'يُوجَّه للفريق المناسب' })}</span>
            </div>
            <ContactForm
              lang={lang}
              initialCategory={prefilledCategory}
              initialMessage={prefilledMessage}
              source={supportSource}
              providerState={prefilledProviderState}
            />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">05 — {T(lang, { en: 'Common questions', ar: 'أسئلة شائعة' })}</span>
              <span>{T(lang, { en: 'Before you write', ar: 'قبل أن تكتب' })}</span>
            </div>
            <div className="grid-2">
              {FAQ.map((f) => (
                <div className="surface" key={f.q.en}>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 21, margin: '0 0 8px', lineHeight: 1.2 }}>
                    {T(lang, f.q)}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' }}>{T(lang, f.a)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  )
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <SupportPageInner />
    </Suspense>
  )
}
