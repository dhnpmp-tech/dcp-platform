'use client'

// Ported from the v2 renter console source design (Overview).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./dashboard.css.
//
// Renter mental model = "what's running and how much runway do I have" — NOT "how much
// have I spent". Spend history/analytics live in Usage (/renter/usage) and Wallet
// (/renter/wallet); this Overview leads with runway: balance, active sessions, GPU in
// use, and quick actions.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './dashboard.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'dash'

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

type QsTab = 'curl' | 'py' | 'node'

// ── Fetched API shapes (subset of v1 /renters/* responses) ──────────────
interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
    balance_halala?: number
    total_spent_halala?: number
    total_jobs?: number
  }
}

interface LiveJob {
  requestId: string
  model: string
  status: string
  providerGpu: string
  tokensGenerated: number
  costHalala: number
}

interface LiveResp {
  active?: LiveJob[]
  recent?: LiveJob[]
}

// halala (integer cents) → SAR number
const halToSar = (h: number) => h / 100

// Two-letter avatar initials derived from an account/workspace name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function RenterDashboardPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [qsTab, setQsTab] = useState<QsTab>('curl')

  // ── Live data (balance / live jobs). No mock fallback:
  // failed or missing auth renders explicit empty/error states.
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [dataError, setDataError] = useState('')
  const [renterName, setRenterName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [balanceSar, setBalanceSar] = useState<number | null>(null)
  const [totalJobs, setTotalJobs] = useState<number | null>(null)
  const [activeJobs, setActiveJobs] = useState<LiveJob[]>([])
  const [recentJobs, setRecentJobs] = useState<LiveJob[]>([])

  const liveJobs = useMemo(() => [...activeJobs, ...recentJobs], [activeJobs, recentJobs])
  // Runway view: how much of the balance is currently held by in-flight jobs, and
  // which GPU types are running right now.
  const heldSar = useMemo(
    () => activeJobs.reduce((sum, j) => sum + halToSar(j.costHalala ?? 0), 0),
    [activeJobs],
  )
  const gpusInUse = useMemo(() => {
    const set = new Set(activeJobs.map((j) => j.providerGpu).filter(Boolean))
    return Array.from(set)
  }, [activeJobs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setDataState('missing-key')
      return
    }

    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    let cancelled = false
    setDataState('loading')
    setDataError('')

    ;(async () => {
      try {
        const [meRes, liveRes] = await Promise.all([
          fetch(`${base}/renters/me`, { headers }),
          fetch(`${base}/renters/me/live`, { headers }),
        ])

        if (!meRes.ok) {
          const data = await meRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load renter dashboard.')
        }
        const me = (await meRes.json()) as RenterMe
        if (cancelled) return
        const renter = me.renter
        if (renter?.name) setRenterName(renter.name)
        if (renter?.organization) setWorkspaceName(renter.organization)
        if (typeof renter?.balance_halala === 'number') setBalanceSar(halToSar(renter.balance_halala))
        if (typeof renter?.total_jobs === 'number') setTotalJobs(renter.total_jobs)

        if (liveRes.ok) {
          const live = (await liveRes.json()) as LiveResp
          if (!cancelled) {
            setActiveJobs(live.active ?? [])
            setRecentJobs(live.recent ?? [])
          }
        }
        if (!cancelled) setDataState('ready')
      } catch (err) {
        if (cancelled) return
        setDataState('error')
        setDataError(err instanceof Error ? err.message : 'Failed to load renter dashboard.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Live-jobs poll: refresh active/recent jobs every 2s so the panel's
  // "Updates every 2s" label is honest. Stops on unmount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) return

    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${base}/renters/me/live`, { headers })
        if (!res.ok || cancelled) return
        const live = (await res.json()) as LiveResp
        if (cancelled) return
        setActiveJobs(live.active ?? [])
        setRecentJobs(live.recent ?? [])
      } catch {
        // Transient poll failure: keep the last known live jobs on screen.
      }
    }

    const timer = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const displayName = renterName || (lang === 'ar' ? 'المستأجر' : 'Renter')
  const displayWorkspace = workspaceName || (lang === 'ar' ? 'مساحة العمل' : 'Workspace')
  const wsInitials = initials(workspaceName || renterName || displayWorkspace)
  const userInitials = initials(renterName || workspaceName || displayName)

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="dash">
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <div className="rt-ws-btn">
            <span className="av">{wsInitials}</span>
            <span className="body">
              <span className="nm">{displayWorkspace}</span>
              <span className="sub">
                <Bi en="Live renter account" ar="حساب مستأجر حي" />
              </span>
            </span>
          </div>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            {balanceSar != null ? (
              <>
                SAR {numFmt.format(Math.floor(balanceSar))}
                <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>{activeJobs.length > 0 ? `SAR ${heldSar.toFixed(2)}` : (lang === 'ar' ? 'لا يوجد' : 'n/a')}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Active sessions" ar="الجلسات النشطة" />
            </span>
            <b>{activeJobs.length}</b>
          </div>
          <Link className="topup" href="/renter/wallet#top-up">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </Link>
        </div>

        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => {
                const active = it.k === CURRENT_PAGE
                return (
                  <Link key={it.k} href={it.href} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
                    <span className="ic">{it.ic}</span>
                    <span>
                      <Bi en={it.label} ar={it.labelAr} />
                    </span>
                    <span className="bd">{it.bd || ''}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="rt-sb-foot">
          <div className="av">{userInitials}</div>
          <div className="who">
            {displayName}
            <span className="e">
              <Bi en="Renter account" ar="حساب مستأجر" />
            </span>
          </div>
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/auth' }}>
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`rt-backdrop${navOpen ? ' on' : ''}`}
        id="rt-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        {/* ── Topbar (inlined from renter-shell.js) ────────────────── */}
        <header className="rt-tb" id="rt-tb" data-crumb="Overview">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            type="button"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>{displayWorkspace}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Overview" ar="نظرة عامة" />
            </span>
          </div>
          <span className="pill">
            <span
              className="d"
              style={
                dataState === 'ready'
                  ? undefined
                  : { background: 'var(--mut)', animation: 'none' }
              }
            />{' '}
            {dataState === 'ready' ? (
              <Bi en="API live" ar="الواجهة تعمل" />
            ) : dataState === 'loading' ? (
              <Bi en="API connecting" ar="جارٍ الاتصال" />
            ) : (
              <Bi en="API offline" ar="الواجهة غير متصلة" />
            )}
          </span>
          <button
            className="lang-pill"
            type="button"
            onClick={toggle}
            aria-label="Toggle language"
          >
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="Welcome back, " ar="مرحباً بعودتك، " />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              {displayName}.
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en={`${activeJobs.length} running now`} ar={`${activeJobs.length} قيد التشغيل الآن`} />
            </span>
            <span>
              <Bi en="Balance" ar="الرصيد" />{' '}
              <b>{balanceSar != null ? `SAR ${balanceSar.toFixed(2)}` : '—'}</b>
            </span>
            <span>
              <Bi en="Scoped keys live on the keys page" ar="المفاتيح محددة النطاق في صفحة المفاتيح" />
            </span>
          </div>

          {dataState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi
                en="Sign in with a renter key to load balance, live jobs, and quick actions."
                ar="سجّل الدخول بمفتاح مستأجر لتحميل الرصيد والمهام الحية والإجراءات السريعة."
              />{' '}
              <Link href="/auth?role=renter&method=apikey&redirect=/renter/dashboard">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {dataState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {dataError}
            </div>
          )}

          {/* KPI row — runway, not spend. (Spend history lives in Usage + Wallet.) */}
          <div className="kpi-row" style={{ marginTop: 36 }}>
            <div className="kpi featured">
              <span className="k">
                <Bi en="Balance" ar="الرصيد" />
              </span>
              <span className="v">
                {balanceSar != null ? (
                  <>
                    SAR {numFmt.format(Math.floor(balanceSar))}
                    <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d flat">
                <Bi
                  en={`${activeJobs.length > 0 ? `SAR ${heldSar.toFixed(2)} held` : 'Nothing held'} · your runway`}
                  ar={`${activeJobs.length > 0 ? `محجوز SAR ${heldSar.toFixed(2)}` : 'لا شيء محجوز'} · رصيدك`}
                />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Active sessions" ar="الجلسات النشطة" />
              </span>
              <span className="v">{activeJobs.length}</span>
              <span className="d flat">
                <Bi en={`${liveJobs.length} visible total`} ar={`${liveJobs.length} ظاهرة إجمالاً`} />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="GPU in use" ar="المعالج المستخدم" />
              </span>
              <span className="v" style={{ fontSize: gpusInUse.length > 0 ? '1.4rem' : undefined }}>
                {gpusInUse.length > 0 ? (
                  <>
                    {gpusInUse[0]}
                    {gpusInUse.length > 1 && <span className="u"> +{gpusInUse.length - 1}</span>}
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d flat">
                <Bi en={gpusInUse.length > 0 ? 'serving now' : 'idle'} ar={gpusInUse.length > 0 ? 'يخدم الآن' : 'خامل'} />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Jobs · account" ar="المهام · الحساب" />
              </span>
              <span className="v">
                {totalJobs != null ? totalJobs.toLocaleString('en-US') : '—'}
                <span className="u">jobs</span>
              </span>
              <span className="d flat">
                <Link href="/renter/wallet" style={{ color: 'var(--mut)', textDecoration: 'none', borderBottom: '1px solid var(--hair)' }}>
                  <Bi en="Spend & invoices → Wallet" ar="الإنفاق والفواتير ← المحفظة" />
                </Link>
              </span>
            </div>
          </div>

          {/* Quick actions + Live jobs */}
          <div className="two-col" style={{ marginTop: 28 }}>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Quick actions" ar="إجراءات سريعة" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                <Link className="btn-pri" href="/renter/pods" style={{ textAlign: 'center' }}>
                  <Bi en="▦ Launch a GPU pod" ar="▦ تشغيل حاوية GPU" />
                </Link>
                <Link className="btn-sec" href="/renter/pods" style={{ textAlign: 'center' }}>
                  <Bi en="Manage pods · extend · stop" ar="إدارة الحاويات · تمديد · إيقاف" />
                </Link>
                <Link className="btn-sec" href="/renter/playground" style={{ textAlign: 'center' }}>
                  <Bi en="▷ Open Playground" ar="▷ افتح البيئة التجريبية" />
                </Link>
                <Link className="btn-sec" href="/renter/wallet#top-up" style={{ textAlign: 'center' }}>
                  <Bi en="₪ Top up balance" ar="₪ شحن الرصيد" />
                </Link>
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--hair)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--mut)',
                }}
              >
                <Bi
                  en="What's running and how much runway you have — at a glance."
                  ar="ما الذي يعمل وكم لديك من رصيد — في لمحة."
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Live jobs" ar="المهام الحية" />
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                  }}
                >
                  <Bi en={`${activeJobs.length} active`} ar={`${activeJobs.length} نشطة`} />
                </span>
              </div>
              <div className="live-jobs" id="live">
                {liveJobs.length > 0 ? (
                  liveJobs.map((j) => (
                    <div className="lj-row" key={j.requestId}>
                      <div className="body">
                        <div className="nm">{j.model}</div>
                        <div className="sub">
                          {j.providerGpu} ·{' '}
                          <span className={`stat ${j.status}`}>{j.status}</span> ·{' '}
                          {(j.tokensGenerated ?? 0).toLocaleString()} tok
                        </div>
                      </div>
                      <div className="right">
                        <div className="sar">SAR {halToSar(j.costHalala ?? 0).toFixed(2)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-row">
                    <Bi en="No active or recent inference jobs for this renter key." ar="لا توجد مهام استدلال نشطة أو حديثة لهذا المفتاح." />
                  </div>
                )}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--hair)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--mut)',
                }}
              >
                <span>
                  <Bi en="Updates every 2s" ar="يتحدّث كل ثانيتين" />
                </span>
                <Link
                  href="/renter/usage"
                  style={{
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink)',
                    paddingBottom: '2px',
                    textDecoration: 'none',
                  }}
                >
                  <Bi en="Full usage →" ar="الاستخدام الكامل ←" />
                </Link>
              </div>
            </div>
          </div>

          {/* Quick start */}
          <div className="quickstart">
            <h3>
              <Bi en="Quick start · ship in 3 lines" ar="بداية سريعة · انطلق في ٣ أسطر" />
            </h3>
            <div className="qs-tabs">
              <button type="button" className={qsTab === 'curl' ? 'on' : ''} onClick={() => setQsTab('curl')}>
                cURL
              </button>
              <button type="button" className={qsTab === 'py' ? 'on' : ''} onClick={() => setQsTab('py')}>
                Python
              </button>
              <button type="button" className={qsTab === 'node' ? 'on' : ''} onClick={() => setQsTab('node')}>
                Node
              </button>
            </div>

            <div className={`qs-body${qsTab === 'curl' ? ' on' : ''}`} data-t="curl">
              <pre className="code">
                <span className="c"># Chat completion · in-Kingdom · pay per token</span>
                {'\n'}$ <span className="k">curl</span>{' '}
                <span className="s">https://api.dcp.sa/v1/chat/completions</span> \{'\n'}
                {'   '}
                <span className="k">-H</span>{' '}
                <span className="s">&quot;Authorization: Bearer $DCP_KEY&quot;</span> \{'\n'}
                {'   '}
                <span className="k">-d</span>{' '}
                <span className="s">
                  {'\'{"model":"qwen2.5:7b","messages":[{"role":"user","content":"اشرح لي زكاة المال"}]}\''}
                </span>
              </pre>
            </div>

            <div className={`qs-body${qsTab === 'py' ? ' on' : ''}`} data-t="py">
              <pre className="code">
                <span className="k">import</span> os
                {'\n'}<span className="k">from</span> openai <span className="k">import</span> OpenAI
                {'\n\n'}client = <span className="n">OpenAI</span>(
                {'\n    '}base_url=<span className="s">&quot;https://api.dcp.sa/v1&quot;</span>,
                {'\n    '}api_key=<span className="s">os.environ[&quot;DCP_KEY&quot;]</span>,
                {'\n'})
                {'\n\n'}resp = client.chat.completions.create(
                {'\n    '}model=<span className="s">&quot;qwen2.5:7b&quot;</span>,
                {'\n    '}messages=[{'{'}
                <span className="s">&quot;role&quot;</span>: <span className="s">&quot;user&quot;</span>,{' '}
                <span className="s">&quot;content&quot;</span>:{' '}
                <span className="s">&quot;اشرح لي زكاة المال&quot;</span>
                {'}'}],
                {'\n'})
                {'\n'}
                <span className="n">print</span>(resp.choices[<span className="k">0</span>].message.content)
              </pre>
            </div>

            <div className={`qs-body${qsTab === 'node' ? ' on' : ''}`} data-t="node">
              <pre className="code">
                <span className="k">import</span> OpenAI <span className="k">from</span>{' '}
                <span className="s">&quot;openai&quot;</span>;
                {'\n\n'}
                <span className="k">const</span> client = <span className="k">new</span>{' '}
                <span className="n">OpenAI</span>({'{'}
                {'\n  '}baseURL: <span className="s">&quot;https://api.dcp.sa/v1&quot;</span>,
                {'\n  '}apiKey: process.env.DCP_KEY,
                {'\n'}
                {'}'});
                {'\n\n'}
                <span className="k">const</span> resp = <span className="k">await</span>{' '}
                client.chat.completions.create({'{'}
                {'\n  '}model: <span className="s">&quot;qwen2.5:7b&quot;</span>,
                {'\n  '}messages: [{'{'} role: <span className="s">&quot;user&quot;</span>, content:{' '}
                <span className="s">&quot;اشرح لي زكاة المال&quot;</span> {'}'}],
                {'\n'}
                {'}'});
              </pre>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn-pri" href="/renter/playground">
                <Bi en="Open Playground →" ar="افتح البيئة التجريبية ←" />
              </Link>
              <Link className="btn-sec" href="/renter/keys">
                <Bi en="Get an API key" ar="احصل على مفتاح API" />
              </Link>
              <Link className="btn-sec" href="/docs">
                <Bi en="Read the docs" ar="اقرأ التوثيق" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
