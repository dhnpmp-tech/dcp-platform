'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { useLanguage, LanguageToggle } from '../lib/i18n'
import { buildInstallCommand } from '../lib/provider-onboarding'
import { trackProviderInstallEvent } from '../lib/provider-install-telemetry'
import { ROUTES } from '../lib/routes'

// GPU pricing in halala/hr (matches backend gpu_pricing seed data)
const GPU_RATES = [
  { model: 'RTX 3060 Ti', rate_halala: 500 },
  { model: 'RTX 3080',    rate_halala: 800 },
  { model: 'RTX 4090',    rate_halala: 1200 },
  { model: 'Apple M2 Pro (16 GB)', rate_halala: 400 },
  { model: 'Apple M3 Max (36 GB)', rate_halala: 700 },
  { model: 'Apple M4 Max (48 GB)', rate_halala: 900 },
  { model: 'A100',        rate_halala: 2200 },
]

const FAQ_KEYS = [
  { q: 'earn.faq_q1', a: 'earn.faq_a1' },
  { q: 'earn.faq_q2', a: 'earn.faq_a2' },
  { q: 'earn.faq_q3', a: 'earn.faq_a3' },
  { q: 'earn.faq_q4', a: 'earn.faq_a4' },
  { q: 'earn.faq_q5', a: 'earn.faq_a5' },
]

const TRUST_BULLET_KEYS = [
  'provider.trust.heartbeat',
  'provider.trust.polling',
  'provider.trust.pause_resume',
  'provider.trust.runtime',
]

// ── INTERIM agentic-demand section content ────────────────────────────────
// NOTE: This bilingual copy is inlined (not in the i18n dictionary) on purpose:
// it is an INTERIM addition to the legacy /earn page, pending the full /earn
// redesign + merge into the /provider-setup wizard. When that lands, port these
// strings into the proper i18n keys (or the wizard's <Bi> primitive) and delete
// this block. Frames DCP's agent-first demand as what a provider's GPU serves.
const AGENTIC_CARDS: { title: { en: string; ar: string }; body: { en: string; ar: string } }[] = [
  {
    title: { en: 'MCP connector', ar: 'موصّل MCP' },
    body: {
      en: 'Agents plug DCP straight into their toolchain — npx -y github:dhnpmp-tech/dcp-mcp, listed in the official MCP registry. Your GPU becomes a tool an agent can call.',
      ar: 'يربط الوكلاء DCP مباشرة بسلسلة أدواتهم عبر npx -y github:dhnpmp-tech/dcp-mcp، المدرج في سجل MCP الرسمي. يصبح معالجك أداة يستدعيها الوكيل.',
    },
  },
  {
    title: { en: 'Agent self-serve onboarding', ar: 'تسجيل ذاتي للوكلاء' },
    body: {
      en: 'An agent gets its own key and trial with no human in the loop — it signs up, rents, and runs inference automatically. Demand arrives 24/7, not just office hours.',
      ar: 'يحصل الوكيل على مفتاحه وتجربته دون أي تدخل بشري — يسجّل ويستأجر ويشغّل الاستدلال تلقائياً. الطلب يصل على مدار الساعة، لا في أوقات العمل فقط.',
    },
  },
  {
    title: { en: 'OpenAI-compatible API', ar: 'واجهة متوافقة مع OpenAI' },
    body: {
      en: 'Renters and agents hit api.dcp.sa/v1 with the OpenAI SDK they already use — zero rewrites. Every call that lands routes real, paid inference work to a rig like yours.',
      ar: 'يستخدم المستأجرون والوكلاء api.dcp.sa/v1 بحزمة OpenAI التي يملكونها أصلاً — دون أي إعادة كتابة. كل طلب يصل يوجّه عملاً استدلالياً مدفوعاً إلى جهاز مثل جهازك.',
    },
  },
]

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-dc1-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left bg-dc1-surface-l2 hover:bg-dc1-surface-l3 transition-colors focus:outline-none"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-dc1-text-primary pr-4">{question}</span>
        <svg
          className={`w-5 h-5 text-dc1-amber flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 py-4 bg-dc1-surface-l1 border-t border-dc1-border">
          <p className="text-sm text-dc1-text-secondary leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

export default function EarnPage() {
  const { t, dir, isRTL, language } = useLanguage()
  const isAr = language === 'ar'

  const [selectedGpu, setSelectedGpu] = useState(GPU_RATES[2]) // RTX 4090 default
  const [hours, setHours]             = useState(8)
  const [utilPct, setUtilPct]         = useState(50)
  // Public teaser — no minted token yet, so render the canonical command with
  // its placeholder token (real token is minted in the /setup wizard).
  const quickInstallCommand = useMemo(
    () => buildInstallCommand({ os: 'linux', token: null }),
    []
  )

  // Formula: gpu_rate_halala * hours_per_day * (util/100) * 30 days * 0.75 provider_share / 100 halala→SAR
  const grossHalala = selectedGpu.rate_halala * hours * (utilPct / 100) * 30
  const feeHalala   = Math.round(grossHalala * 0.25)
  const netHalala   = Math.round(grossHalala * 0.75)
  const grossSar    = Math.round(grossHalala / 100)
  const feeSar      = Math.round(feeHalala / 100)
  const netSar      = Math.round(netHalala / 100)

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-dc1-amber/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-sm font-medium mb-6">
              <span className="w-2 h-2 bg-dc1-amber rounded-full animate-pulse" />
              {t('earn.badge')}
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-dc1-amber">
              {t('earn.hero_title')}
            </h1>
            <p className="text-lg sm:text-xl text-dc1-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
              {t('earn.hero_subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Provider CTA → the PROVIDER wizard. /setup is now RENTER signup;
                  every provider call-to-action here must land on ROUTES.providerSetup. */}
              <Link href={ROUTES.providerSetup} className="btn btn-primary btn-lg w-full sm:w-auto">
                {t('earn.cta_primary')}
              </Link>
              <Link href="/marketplace" className="btn btn-secondary btn-lg w-full sm:w-auto">
                {t('earn.cta_secondary')}
              </Link>
            </div>
            <p className="text-xs text-dc1-text-muted mt-4">
              {t('earn.scenario_disclaimer')}
            </p>
            <div className={`flex justify-center mt-6 ${isRTL ? '' : ''}`}>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </section>

      {/* Provider value section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-4">
            {t('earn.value_title')}
          </h2>
          <p className="text-dc1-text-secondary leading-relaxed mb-6">
            {t('earn.value_body')}
          </p>
          <ul className="space-y-3">
            {[t('earn.value_bullet_1'), t('earn.value_bullet_2'), t('earn.value_bullet_3')].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-dc1-text-secondary">
                <span className="w-1.5 h-1.5 bg-dc1-amber rounded-full flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── INTERIM: agentic-demand section ────────────────────────────────
          Added to the legacy /earn page pending the full redesign + merge into
          the /provider-setup wizard. Frames DCP's agent-first capabilities (MCP
          connector, agent self-serve onboarding, OpenAI-compatible API) as the
          DEMAND a provider's GPU serves — not a generic feature list. Bilingual
          copy is inlined in AGENTIC_CARDS (see note there) until i18n keys exist. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        <div className="rounded-2xl border border-dc1-amber/20 bg-dc1-surface-l1 p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-xs font-medium mb-5">
            <span className="w-1.5 h-1.5 bg-dc1-amber rounded-full" />
            {isAr ? 'مدعوم بالوكلاء' : 'Agent-first demand'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-4">
            {isAr ? 'جهازك يخدم أحمال الوكلاء' : 'Your GPU serves agent-driven workloads'}
          </h2>
          <p className="text-dc1-text-secondary leading-relaxed mb-8 max-w-3xl">
            {isAr
              ? 'DCP منصة وكلاء أولاً. لا ينتظر الطلب بشراً يضغط زراً — يستأجر الوكلاء المعالجات ويشغّلون الاستدلال تلقائياً عبر هذه المسارات. هذا هو العمل المدفوع الذي يُوجَّه إلى جهازك.'
              : 'DCP is agent-first. Demand does not wait for a human to click a button — agents rent GPUs and run inference automatically through the rails below. That is the paid work routed to your rig.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {AGENTIC_CARDS.map((card) => (
              <div
                key={card.title.en}
                className="rounded-xl border border-dc1-border bg-dc1-surface-l2 p-5 hover:border-dc1-amber/40 transition-colors"
              >
                <h3 className="text-sm font-bold text-dc1-amber mb-2">
                  {isAr ? card.title.ar : card.title.en}
                </h3>
                <p className="text-sm text-dc1-text-secondary leading-relaxed">
                  {isAr ? card.body.ar : card.body.en}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Provider trust module */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        <div className="rounded-2xl border border-dc1-amber/20 bg-dc1-surface-l1 p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-4">
            {t('provider.trust.title')}
          </h2>
          <p className="text-dc1-text-secondary leading-relaxed mb-6">
            {t('provider.trust.description')}
          </p>
          <ul className="space-y-3">
            {TRUST_BULLET_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3 text-sm text-dc1-text-secondary">
                <span className="w-1.5 h-1.5 bg-dc1-amber rounded-full mt-2 flex-shrink-0" />
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-dc1-text-muted mt-4">
            {t('provider.trust.earnings_estimate')} {t('earn.trust_note')}
          </p>
        </div>
      </section>

      {/* Prerequisites */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-4">
            {t('pg.req_title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: t('pg.req_gpu'), desc: t('pg.req_gpu_desc') },
              { title: t('pg.req_os'), desc: t('pg.req_os_desc') },
              { title: t('pg.req_internet'), desc: t('pg.req_internet_desc') },
              { title: t('pg.req_account'), desc: t('pg.req_account_desc') },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="text-sm font-semibold text-dc1-text-primary mb-2">{item.title}</p>
                <p className="text-sm text-dc1-text-secondary">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings Calculator */}
      <section className="bg-dc1-surface-l1 border-y border-dc1-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
              {t('earn.calc_title')}
            </h2>
            <p className="text-dc1-text-secondary max-w-2xl mx-auto">
              {t('earn.calc_subtitle')}
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-8 space-y-8">

              {/* GPU Model */}
              <div>
                <label className="block text-sm font-medium text-dc1-text-primary mb-2">
                  {t('earn.calc_gpu_label')}
                </label>
                <select
                  value={selectedGpu.model}
                  onChange={e => setSelectedGpu(GPU_RATES.find(g => g.model === e.target.value) ?? GPU_RATES[2])}
                  className="w-full bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-dc1-text-primary text-sm focus:outline-none focus:border-dc1-amber/50 transition-colors"
                >
                  {GPU_RATES.map(g => (
                    <option key={g.model} value={g.model}>
                      {g.model} — {(g.rate_halala / 100).toFixed(2)} SAR/hr
                    </option>
                  ))}
                </select>
              </div>

              {/* Hours per day */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-dc1-text-primary">
                    {t('earn.calc_hours_label')}
                  </label>
                  <span className="text-sm font-bold text-dc1-amber">{hours}h</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={hours}
                  onChange={e => setHours(Number(e.target.value))}
                  className="w-full accent-dc1-amber"
                />
                <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
                  <span>4h</span>
                  <span>24h</span>
                </div>
              </div>

              {/* Utilisation rate */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-dc1-text-primary">
                    {t('earn.calc_util_label')}
                  </label>
                  <span className="text-sm font-bold text-dc1-amber">{utilPct}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={utilPct}
                  onChange={e => setUtilPct(Number(e.target.value))}
                  className="w-full accent-dc1-amber"
                />
                <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
                  <span>20%</span>
                  <span>80%</span>
                </div>
              </div>

              {/* Results */}
              <div className="border-t border-dc1-border pt-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-secondary">{t('earn.calc_gross')}</span>
                  <span className="text-base font-semibold text-dc1-text-primary">{grossSar.toLocaleString()} SAR</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-secondary">{t('earn.calc_fee')}</span>
                  <span className="text-sm text-red-400">−{feeSar.toLocaleString()} SAR</span>
                </div>
                <div className="flex justify-between items-center bg-dc1-amber/5 border border-dc1-amber/20 rounded-lg px-4 py-3">
                  <span className="text-sm font-semibold text-dc1-amber">► {t('earn.calc_you_keep')}</span>
                  <span className="text-2xl font-extrabold text-dc1-amber">{netSar.toLocaleString()} SAR/mo</span>
                </div>
              </div>

              <Link href={ROUTES.providerSetup} className="btn btn-primary btn-lg w-full text-center block">
                {t('earn.cta_primary')} →
              </Link>
            </div>
            <p className="text-xs text-dc1-text-muted text-center mt-4">
              {t('earn.calc_disclaimer')}
            </p>
            <p className="text-xs text-dc1-text-muted text-center mt-2">
              {t('earn.scenario_short')}
            </p>
          </div>
        </div>
      </section>

      {/* Quick Install */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="rounded-2xl border border-dc1-amber/30 bg-dc1-surface-l1 p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-2">
            {t('earn.quick_install.title')}
          </h2>
          <p className="text-dc1-text-secondary text-sm mb-6">
            {t('earn.quick_install.subtitle')}
          </p>
          <div className="bg-dc1-void rounded-xl border border-dc1-border p-4 font-mono text-sm overflow-x-auto">
            <span className="text-dc1-text-primary">{quickInstallCommand}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <a
              href="https://api.dcp.sa/download/windows"
              className="btn btn-primary btn-sm inline-flex items-center gap-2"
              onClick={() =>
                trackProviderInstallEvent('provider_install_cta_clicked', {
                  source_page: 'earn',
                  surface: 'quick_install',
                  destination: 'https://api.dcp.sa/download/windows',
                  locale: language,
                  cta_tier: 'primary',
                  next_action_state: 'waiting',
                  os_target: 'windows',
                  has_provider_key: false,
                  step: 'download_windows',
                })
              }
            >
              Download for Windows (~4 MB)
            </a>
          </div>
          <p className="text-xs text-dc1-text-muted mt-3">
            {t('earn.quick_install.note')}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <Link
              href="/provider/download"
              className="btn btn-primary btn-sm"
              onClick={() =>
                trackProviderInstallEvent('provider_install_cta_clicked', {
                  source_page: 'earn',
                  surface: 'quick_install',
                  destination: '/provider/download',
                  locale: language,
                  cta_tier: 'primary',
                  next_action_state: 'waiting',
                  os_target: 'linux',
                  has_provider_key: false,
                  step: 'open_download',
                })
              }
            >
              {t('earn.quick_install.primary_cta')}
            </Link>
            <Link
              href="/docs/provider-guide#status-waiting-install-daemon"
              className="text-sm text-dc1-amber hover:underline"
              onClick={() =>
                trackProviderInstallEvent('provider_install_cta_clicked', {
                  source_page: 'earn',
                  surface: 'quick_install',
                  destination: '/docs/provider-guide#status-waiting-install-daemon',
                  locale: language,
                  cta_tier: 'secondary',
                  next_action_state: 'waiting',
                  os_target: 'linux',
                  has_provider_key: false,
                  step: 'open_docs',
                })
              }
            >
              {t('earn.quick_install.secondary_cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
            {t('earn.how_title')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '1', titleKey: 'earn.how_step1_title', descKey: 'earn.how_step1_desc' },
            { step: '2', titleKey: 'earn.how_step2_title', descKey: 'earn.how_step2_desc' },
            { step: '3', titleKey: 'earn.how_step3_title', descKey: 'earn.how_step3_desc' },
          ].map(item => (
            <div key={item.step} className="text-center bg-dc1-surface-l2 border border-dc1-border rounded-xl p-8">
              <div className="w-12 h-12 rounded-full bg-dc1-amber flex items-center justify-center text-dc1-void font-bold text-lg mx-auto mb-6">
                {item.step}
              </div>
              <h3 className="text-lg font-bold text-dc1-text-primary mb-3">{t(item.titleKey)}</h3>
              <p className="text-sm text-dc1-text-secondary leading-relaxed">{t(item.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-dc1-surface-l1 border-y border-dc1-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-dc1-text-primary mb-4">
              {t('earn.faq_title')}
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ_KEYS.map(faq => (
              <FaqItem
                key={faq.q}
                question={t(faq.q)}
                answer={t(faq.a)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-4">
          {t('earn.cta_title')}
        </h2>
        <p className="text-dc1-text-secondary max-w-xl mx-auto mb-8 leading-relaxed">
          {t('earn.cta_desc')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {/* Provider register CTA → the PROVIDER wizard (was /setup, now renter signup). */}
          <Link href={ROUTES.providerSetup} className="btn btn-primary btn-lg w-full sm:w-auto">
            {t('earn.cta_register')}
          </Link>
          {/* Sign-in stays a generic auth entry; /login 308s to /auth. */}
          <Link href="/login" className="btn btn-secondary btn-lg w-full sm:w-auto">
            {t('earn.cta_signin')}
          </Link>
        </div>
        <p className="text-xs text-dc1-text-muted mt-4">
          {t('earn.payout_disclaimer')}
        </p>
        <p className="text-xs text-dc1-text-muted mt-2">
          {t('earn.payout_status')}
        </p>
      </section>

      <Footer />
    </div>
  )
}
