'use client'

// Ported from the v2 renter console source design (Overview).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./dashboard.css.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './dashboard.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/v2/renter/usage' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/v2/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/v2/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'dash'

interface SpendPoint {
  date: Date
  sar: number
  jobs?: number
}

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// ── Chart geometry (from prototype render()) ────────────────────────────
function buildChart(spend: SpendPoint[], rd: number) {
  const W = 600
  const H = 220
  const padL = 56
  const padR = 8
  const padT = 16
  const padB = 22
  const days = spend.slice(-rd)
  const max = Math.max(...days.map((d) => d.sar), 1) * 1.1
  const min = Math.min(...days.map((d) => d.sar), 0) * 0.85
  const range = Math.max(max - min, 1)
  const x = (i: number) => padL + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - padL - padR))
  const y = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB)

  let line = ''
  days.forEach((d, i) => {
    line += (i === 0 ? 'M ' : ' L ') + x(i).toFixed(1) + ' ' + y(d.sar).toFixed(1)
  })
  const area = `${line} L ${x(days.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z`

  const grid: number[] = []
  for (let i = 0; i <= 4; i++) grid.push(padT + (i / 4) * (H - padT - padB))

  const axisL: string[] = []
  for (let i = 0; i <= 4; i++) axisL.push(`SAR ${numFmt.format(max - (i / 4) * range)}`)

  const e = rd <= 7 ? 1 : rd <= 30 ? 5 : 15
  const axisB = days
    .filter((_, i) => i % e === 0 || i === days.length - 1)
    .map((d) => d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))

  return { W, H, padL, padR, line, area, grid, axisL, axisB }
}

type RangeOpt = 7 | 30 | 90
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

interface DailySpendRow {
  day: string
  total_halala: number
  job_count: number
}

interface AnalyticsResp {
  daily_spend?: DailySpendRow[]
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

export default function RenterDashboardPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [range, setRange] = useState<RangeOpt>(30)
  const [qsTab, setQsTab] = useState<QsTab>('curl')

  const [spend, setSpend] = useState<SpendPoint[]>([])

  const chart = useMemo(() => (spend.length > 0 ? buildChart(spend, range) : null), [spend, range])

  // ── Live data (balance / 30D spend series / live jobs). No mock fallback:
  // failed or missing auth renders explicit empty/error states.
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [dataError, setDataError] = useState('')
  const [renterName, setRenterName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [balanceSar, setBalanceSar] = useState<number | null>(null)
  const [spentTodaySar, setSpentTodaySar] = useState<number | null>(null)
  const [totalSpentSar, setTotalSpentSar] = useState<number | null>(null)
  const [totalJobs, setTotalJobs] = useState<number | null>(null)
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([])

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
        const [meRes, analyticsRes, liveRes] = await Promise.all([
          fetch(`${base}/renters/me?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/renters/me/analytics?key=${encodeURIComponent(key)}&period=30d`, { headers }),
          fetch(`${base}/renters/me/live?key=${encodeURIComponent(key)}`, { headers }),
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
        if (typeof renter?.total_spent_halala === 'number') setTotalSpentSar(halToSar(renter.total_spent_halala))
        if (typeof renter?.total_jobs === 'number') setTotalJobs(renter.total_jobs)

        if (analyticsRes.ok) {
          const analytics = (await analyticsRes.json()) as AnalyticsResp
          const series: SpendPoint[] = (analytics.daily_spend ?? []).map((row) => ({
            date: new Date(row.day + 'T00:00:00'),
            sar: halToSar(row.total_halala),
            jobs: row.job_count,
          }))
          if (!cancelled) {
            setSpend(series)
            const last = analytics.daily_spend?.[analytics.daily_spend.length - 1]
            const today = new Date().toISOString().slice(0, 10)
            setSpentTodaySar(last && last.day === today ? halToSar(last.total_halala) : 0)
          }
        }

        if (liveRes.ok) {
          const live = (await liveRes.json()) as LiveResp
          if (!cancelled) setLiveJobs([...(live.active ?? []), ...(live.recent ?? [])])
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

  const ranges: RangeOpt[] = [7, 30, 90]
  const displayName = renterName || (lang === 'ar' ? 'المستأجر' : 'Renter')
  const displayWorkspace = workspaceName || (lang === 'ar' ? 'مساحة العمل' : 'Workspace')
  const streamingCount = liveJobs.filter((j) => j.status === 'streaming').length

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
          <button className="rt-ws-btn" title="Switch workspace" type="button">
            <span className="av">N</span>
            <span className="body">
              <span className="nm">{displayWorkspace}</span>
              <span className="sub">
                <Bi en="Live renter account" ar="حساب مستأجر حي" />
              </span>
            </span>
            <span className="chev">⌄</span>
          </button>
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
            <b>—</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Burn · last 7 days" ar="الصرف · آخر ٧ أيام" />
            </span>
            <b>{totalSpentSar != null ? `SAR ${totalSpentSar.toFixed(2)}` : '—'}</b>
          </div>
          <button className="topup" type="button">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </button>
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
          <div className="av">F</div>
          <div className="who">
            {displayName}
            <span className="e">
              <Bi en="Renter account" ar="حساب مستأجر" />
            </span>
          </div>
          <span className="out" title="Sign out">
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
            <span className="d" /> <Bi en="API live" ar="الواجهة تعمل" />
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
          <Link className="keys" href="/v2/renter/keys">
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
              <Bi en={`${liveJobs.length} jobs visible now`} ar={`${liveJobs.length} مهام ظاهرة الآن`} />
            </span>
            <span>
              <Bi en="Spend today" ar="إنفاق اليوم" />{' '}
              <b>{spentTodaySar != null ? `SAR ${spentTodaySar.toFixed(2)}` : '—'}</b>
            </span>
            <span>
              <Bi en="Scoped keys live on the keys page" ar="المفاتيح محددة النطاق في صفحة المفاتيح" />
            </span>
          </div>

          {dataState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi
                en="Sign in with a renter key to load balance, spend, and live jobs."
                ar="سجّل الدخول بمفتاح مستأجر لتحميل الرصيد والإنفاق والمهام الحية."
              />{' '}
              <Link href="/v2/auth?role=renter&method=apikey&redirect=/v2/renter/dashboard">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {dataState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {dataError}
            </div>
          )}

          {/* KPI row */}
          <div className="kpi-row" style={{ marginTop: 36 }}>
            <div className="kpi featured">
              <span className="k">
                <Bi en="Today · so far" ar="اليوم · حتى الآن" />
              </span>
              <span className="v">
                {spentTodaySar != null ? (
                  <>
                    SAR {numFmt.format(Math.floor(spentTodaySar))}
                    <span className="u">.{(spentTodaySar % 1).toFixed(2).slice(2)}</span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d up">
                <Bi en="From live analytics" ar="من التحليلات الحية" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This week" ar="هذا الأسبوع" />
              </span>
              <span className="v">{totalSpentSar != null ? `SAR ${totalSpentSar.toFixed(2)}` : '—'}</span>
              <span className="d flat">
                — <Bi en="Total settled spend" ar="إجمالي الإنفاق المسجل" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This month" ar="هذا الشهر" />
              </span>
              <span className="v">{totalSpentSar != null ? `SAR ${totalSpentSar.toFixed(2)}` : '—'}</span>
              <span className="d up">
                <Bi en="Total settled spend" ar="إجمالي الإنفاق المسجل" />
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
                <Bi en="Counted from renter account" ar="محسوبة من حساب المستأجر" />
              </span>
            </div>
          </div>

          {/* Spend chart + Live jobs */}
          <div className="two-col" style={{ marginTop: 28 }}>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Spend" ar="الإنفاق" />
                  </h3>
                </div>
                <div className="seg" id="range">
                  {ranges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={range === r ? 'on' : ''}
                      onClick={() => setRange(r)}
                    >
                      {r}D
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart" id="chart">
                {chart ? (
                  <>
                    <div className="axis-l" id="ax-l">
                      {chart.axisL.map((label, i) => (
                        <span key={i}>{label}</span>
                      ))}
                    </div>
                    <div className="axis-b" id="ax-b">
                      {chart.axisB.map((label, i) => (
                        <span key={i}>{label}</span>
                      ))}
                    </div>
                    <svg id="chart-svg" viewBox="0 0 600 220" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#2dd4b6" stopOpacity=".45" />
                          <stop offset="1" stopColor="#2dd4b6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <g className="grid" id="grid">
                        {chart.grid.map((gy, i) => (
                          <line key={i} x1={chart.padL} y1={gy} x2={chart.W - chart.padR} y2={gy} />
                        ))}
                      </g>
                      <path className="area" id="area" d={chart.area} />
                      <path className="line" id="line" d={chart.line} />
                    </svg>
                  </>
                ) : (
                  <div className="empty-row">
                    <Bi en="No spend data for this period." ar="لا توجد بيانات إنفاق لهذه الفترة." />
                  </div>
                )}
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
                    color: 'var(--teal)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--teal)',
                      marginInlineEnd: '6px',
                      animation: 'pulse 1.4s infinite',
                    }}
                  />{' '}
                  <Bi en={`${streamingCount} streaming`} ar={`${streamingCount} قيد البث`} />
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
                  href="/v2/renter/usage"
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
                  {'\'{"model":"allam-7b","messages":[{"role":"user","content":"اشرح لي زكاة المال"}]}\''}
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
                {'\n    '}model=<span className="s">&quot;allam-7b&quot;</span>,
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
                {'\n  '}model: <span className="s">&quot;allam-7b&quot;</span>,
                {'\n  '}messages: [{'{'} role: <span className="s">&quot;user&quot;</span>, content:{' '}
                <span className="s">&quot;اشرح لي زكاة المال&quot;</span> {'}'}],
                {'\n'}
                {'}'});
              </pre>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn-pri" href="/v2/renter/playground">
                <Bi en="Open Playground →" ar="افتح البيئة التجريبية ←" />
              </Link>
              <Link className="btn-sec" href="/v2/renter/keys">
                <Bi en="Get an API key" ar="احصل على مفتاح API" />
              </Link>
              <Link className="btn-sec" href="/v2/docs">
                <Bi en="Read the docs" ar="اقرأ التوثيق" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
