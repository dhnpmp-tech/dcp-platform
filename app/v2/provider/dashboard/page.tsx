'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './dashboard.css'

/* ════════ Inline operator data (illustrative MOCK) ════════ */
interface EarnPoint {
  date: Date
  sar: number
}

interface Job {
  id: string
  rig: string
  model: string
  renter: string
  tok: number
  sar: number
  status: 'settled' | 'failed'
  when: string
}

/* ════════ API response shapes (v1 provider endpoints) ════════ */
interface ApiProvider {
  today_earnings_halala?: number
  month_earnings_halala?: number
  total_earnings_halala?: number
}
interface ApiMeResponse {
  provider?: ApiProvider
}
interface ApiRecentJob {
  job_id?: string
  id?: string
  job_type?: string
  status?: string
  earnings_halala?: number
  completed_at?: string
}
interface ApiMetricsResponse {
  recent_jobs?: ApiRecentJob[]
}
interface ApiDailyPoint {
  day?: string
  date?: string
  earned_halala?: number
  earnings_halala?: number
}
interface ApiDailyResponse {
  daily?: ApiDailyPoint[]
}

const JOBS: Job[] = [
  { id: 'j_ac81', rig: 'studio-main', model: 'allam-7b', renter: 'NextWave Commerce', tok: 412, sar: 0.34, status: 'settled', when: '2m ago' },
  { id: 'j_ac7f', rig: 'studio-bench', model: 'jais-13b', renter: 'Musbah Legal', tok: 1824, sar: 1.92, status: 'settled', when: '6m ago' },
  { id: 'j_ac7e', rig: 'studio-main', model: 'allam-7b', renter: "Qira'a Learning", tok: 208, sar: 0.18, status: 'settled', when: '8m ago' },
  { id: 'j_ac7c', rig: 'studio-main', model: 'bge-m3', renter: 'NextWave Commerce', tok: 64, sar: 0.02, status: 'settled', when: '11m ago' },
  { id: 'j_ac7a', rig: 'studio-bench', model: 'allam-7b', renter: 'Haya Therapy', tok: 928, sar: 0.91, status: 'settled', when: '14m ago' },
  { id: 'j_ac78', rig: 'office-mac', model: 'falcon-h1', renter: 'Najdi Heritage', tok: 2104, sar: 2.48, status: 'settled', when: '18m ago' },
  { id: 'j_ac76', rig: 'studio-main', model: 'allam-7b', renter: 'NextWave Commerce', tok: 512, sar: 0.41, status: 'settled', when: '22m ago' },
  { id: 'j_ac74', rig: 'studio-bench', model: 'jais-13b', renter: 'Musbah Legal', tok: 624, sar: 0.0, status: 'failed', when: '26m ago' },
  { id: 'j_ac72', rig: 'studio-main', model: 'allam-7b', renter: "Qira'a Learning", tok: 288, sar: 0.24, status: 'settled', when: '29m ago' },
]

// 30 days of earnings (chronological, oldest first)
function buildEarn(): EarnPoint[] {
  const out: EarnPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const base = 180 + Math.sin((29 - i) / 3) * 40 + (i < 9 ? 60 : 0)
    const jitter = (((29 - i) * 7) % 13) - 6
    out.push({ date: d, sar: Math.round(base + jitter) })
  }
  return out
}

function fmtSAR(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

// Human "Xm ago" / "Xh ago" from an ISO timestamp (for live job rows).
function relTime(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Map a v1 earnings-daily payload onto the chart's EarnPoint[] (oldest first).
function mapDaily(daily: ApiDailyPoint[]): EarnPoint[] {
  return daily
    .map((d) => {
      const iso = d.day || d.date || ''
      const date = iso ? new Date(iso) : new Date(NaN)
      const halala = Number(d.earned_halala ?? d.earnings_halala ?? 0)
      return { date, sar: Math.round(halala / 100) }
    })
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

// Map a v1 recent_jobs payload onto the table's Job[] shape.
function mapJobs(jobs: ApiRecentJob[]): Job[] {
  return jobs.map((j) => {
    const status = j.status === 'failed' || j.status === 'error' ? 'failed' : 'settled'
    return {
      id: String(j.job_id || j.id || ''),
      rig: '—',
      model: String(j.job_type || 'inference'),
      renter: '—',
      tok: 0,
      sar: Number(j.earnings_halala ?? 0) / 100,
      status,
      when: relTime(String(j.completed_at || '')),
    }
  })
}

// ── Nav model (derived from provider-shell.js, mapped to /v2 routes) ──
interface NavItem {
  k: string
  ic: string
  enLabel: string
  arLabel: string
  href: string
  bd?: string
}
interface NavSection {
  sec: string
  arSec: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    sec: 'Operate',
    arSec: 'التشغيل',
    items: [
      { k: 'dash', ic: '⌂', enLabel: 'Dashboard', arLabel: 'لوحة التحكم', href: '/v2/provider/dashboard' },
      { k: 'rigs', ic: '☷', enLabel: 'Rigs', arLabel: 'الأجهزة', href: '/v2/provider/rigs', bd: '4' },
      { k: 'earnings', ic: '△', enLabel: 'Earnings', arLabel: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', enLabel: 'Payouts', arLabel: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    arSec: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', enLabel: 'Profile', arLabel: 'الملف الشخصي', href: '/v2/provider/profile', bd: 'Silver' },
      { k: 'settings', ic: '⚙', enLabel: 'Settings', arLabel: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', enLabel: 'Provider docs', arLabel: 'دليل المزود', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_NAV = 'dash'

// chart geometry constants
const W = 600
const H = 220
const PAD_L = 50
const PAD_R = 8
const PAD_T = 12
const PAD_B = 22

export default function ProviderDashboardPage() {
  const { lang, toggle } = useV2()

  // Earnings series + jobs default to the inline MOCK; real data replaces them on fetch.
  const mockEarn = useMemo(() => buildEarn(), [])
  const [earn, setEarn] = useState<EarnPoint[]>(mockEarn)
  const [jobs, setJobs] = useState<Job[]>(JOBS)
  const [rangeDays, setRangeDays] = useState(30)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // KPI state — inline mock values are the fallback until a fetch lands.
  const [todaySar, setTodaySar] = useState(218)
  const [monthSar, setMonthSar] = useState(5826)
  const [lifetimeSar, setLifetimeSar] = useState(42180)

  // Once real data loads, stop the cosmetic jitter so it doesn't fight live numbers.
  const [liveLoaded, setLiveLoaded] = useState(false)

  // ── Wire primary data: KPIs, 30D earnings series, recent jobs ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    let cancelled = false
    const base = getApiBase()
    const q = `key=${encodeURIComponent(key)}`

    ;(async () => {
      try {
        const [meRes, metricsRes, dailyRes] = await Promise.all([
          fetch(`${base}/providers/me?${q}`),
          fetch(`${base}/providers/me/metrics?${q}`),
          fetch(`${base}/providers/earnings-daily?${q}&days=30`),
        ])
        if (cancelled) return

        if (meRes.ok) {
          const me = (await meRes.json()) as ApiMeResponse
          const p = me.provider || {}
          if (!cancelled) {
            if (typeof p.today_earnings_halala === 'number') setTodaySar(p.today_earnings_halala / 100)
            if (typeof p.month_earnings_halala === 'number') setMonthSar(p.month_earnings_halala / 100)
            if (typeof p.total_earnings_halala === 'number') setLifetimeSar(p.total_earnings_halala / 100)
            setLiveLoaded(true)
          }
        }

        if (metricsRes.ok && !cancelled) {
          const m = (await metricsRes.json()) as ApiMetricsResponse
          const mapped = mapJobs(m.recent_jobs || [])
          if (!cancelled && mapped.length > 0) setJobs(mapped)
        }

        if (dailyRes.ok && !cancelled) {
          const d = (await dailyRes.json()) as ApiDailyResponse
          const mapped = mapDaily(d.daily || [])
          if (!cancelled && mapped.length > 1) setEarn(mapped)
        }
      } catch {
        /* keep mock fallback on any network/parse failure */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // live KPI jitter (cosmetic; gated by reduced-motion + suspended once live data lands)
  useEffect(() => {
    if (liveLoaded) return
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    let v = 218
    const id = window.setInterval(() => {
      if (Math.random() > 0.6) {
        v += Math.random() * 1.2
        setTodaySar(v)
      }
    }, 2600)
    return () => window.clearInterval(id)
  }, [liveLoaded])

  // ── chart math ──
  const days = useMemo(() => earn.slice(-rangeDays), [earn, rangeDays])
  const { linePath, areaPath, gridYs, axisLeft, axisBottom, xs, ys } = useMemo(() => {
    const maxV = Math.max(...days.map((d) => d.sar)) * 1.1
    const minV = Math.min(...days.map((d) => d.sar)) * 0.85
    const span = maxV - minV
    const x = (i: number) => PAD_L + (i / (days.length - 1)) * (W - PAD_L - PAD_R)
    const y = (v: number) => PAD_T + (1 - (v - minV) / span) * (H - PAD_T - PAD_B)

    let line = ''
    days.forEach((d, i) => {
      line += (i === 0 ? 'M ' : ' L ') + x(i).toFixed(1) + ' ' + y(d.sar).toFixed(1)
    })
    const area = `${line} L ${x(days.length - 1).toFixed(1)} ${H - PAD_B} L ${x(0).toFixed(1)} ${H - PAD_B} Z`

    const grid: number[] = []
    for (let i = 0; i <= 4; i++) grid.push(PAD_T + (i / 4) * (H - PAD_T - PAD_B))

    const axL: string[] = []
    for (let i = 0; i <= 4; i++) axL.push(`SAR ${fmtSAR(maxV - (i / 4) * span)}`)

    const labelEvery = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 5 : 15
    const axB = days
      .filter((_, i) => i % labelEvery === 0 || i === days.length - 1)
      .map((d) => d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))

    const xPts = days.map((_, i) => x(i))
    const yPts = days.map((d) => y(d.sar))

    return { linePath: line, areaPath: area, gridYs: grid, axisLeft: axL, axisBottom: axB, xs: xPts, ys: yPts }
  }, [days, rangeDays])

  // ── chart hover ──
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<{ idx: number; left: number; top: number } | null>(null)

  const onChartMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = e.clientX - rect.left
    const sx = (px / rect.width) * W
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - sx)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    const dx = xs[nearest]
    const dy = ys[nearest]
    setHover({ idx: nearest, left: (dx / W) * rect.width, top: (dy / H) * rect.height })
  }

  const hoverDx = hover ? xs[hover.idx] : 0
  const hoverDy = hover ? ys[hover.idx] : 0

  const ranges: ReadonlyArray<{ r: number; label: string }> = [
    { r: 7, label: '7D' },
    { r: 30, label: '30D' },
    { r: 90, label: '90D' },
  ]

  return (
    <div className="pv-app">
      {/* ═══════════ SIDEBAR ═══════════ */}
      <aside className={`pv-sb${drawerOpen ? ' on' : ''}`} id="pv-sb">
        <div className="pv-sb-brand">
          <span className="wm">DCP<i>∞</i></span>
          <span className="ctx">
            <Bi en="Provider" ar="مزود" />
          </span>
        </div>

        <div className="pv-status">
          <div className="k">
            <Bi en="Earning today" ar="أرباح اليوم" />
          </div>
          <div className="v" id="sb-today">
            SAR {fmtSAR(todaySar)}
            <span className="u">
              <Bi en="so far" ar="حتى الآن" />
            </span>
          </div>
          <div className="live">
            <span className="d" /> <Bi en="2 of 4 rigs earning" ar="جهازان من 4 يكسبان" />
          </div>
          <div className="row">
            <span>
              <Bi en="Yesterday" ar="أمس" />
            </span>
            <b>SAR 194</b>
          </div>
          <div className="row" style={{ marginTop: '8px', paddingTop: 0, border: 0 }}>
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>SAR {fmtSAR(monthSar)}</b>
          </div>
        </div>

        <nav className="pv-nav">
          {NAV.map((section) => (
            <div key={section.sec} style={{ display: 'contents' }}>
              <div className="sec">
                <Bi en={section.sec} ar={section.arSec} />
              </div>
              {section.items.map((it) => (
                <Link
                  key={it.k}
                  href={it.href}
                  className={it.k === CURRENT_NAV ? 'on' : undefined}
                  aria-current={it.k === CURRENT_NAV ? 'page' : undefined}
                >
                  <span className="ic">{it.ic}</span>
                  <span>
                    <Bi en={it.enLabel} ar={it.arLabel} />
                  </span>
                  <span className="bd">{it.bd || ''}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="pv-sb-foot">
          <div className="av">Y</div>
          <div className="who">
            Yazeed Al-Qahtani
            <span className="e">riyadh-studio-01 · Silver</span>
          </div>
          <span className="out" title="Sign out">↱</span>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      <div
        className={`pv-backdrop${drawerOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

      {/* ═══════════ MAIN ═══════════ */}
      <div>
        <header className="pv-tb">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            onClick={() => setDrawerOpen((o) => !o)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>riyadh-studio-01</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Dashboard" ar="لوحة التحكم" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="Live · earning" ar="مباشر · يكسب" />
          </span>
          <button
            className="lang"
            onClick={toggle}
            title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
          >
            {lang === 'en' ? 'ع' : 'EN'}
          </button>
          <button className="kill" title={lang === 'en' ? 'Pause all rigs' : 'إيقاف كل الأجهزة'}>
            ◉ <Bi en="Kill switch" ar="إيقاف طارئ" />
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en="Good morning, " ar="صباح الخير، " />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>Yazeed.</em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="2 of 4 rigs earning" ar="جهازان من 4 يكسبان" />
            </span>
            <span>
              <Bi en="Uptime " ar="وقت التشغيل " />
              <b>99.4%</b> · 7d
            </span>
            <span>
              <Bi en="Next payout " ar="الدفعة القادمة " />
              <b>
                <Bi en="Mon · SAR 428" ar="الإثنين · 428 ريال" />
              </b>
            </span>
            <span>
              <Bi en="Trust " ar="الثقة " />
              <b>92</b>
            </span>
          </div>

          {/* KPI row */}
          <div className="kpi-row">
            <div className="kpi featured">
              <span className="k">
                <Bi en="Today · so far" ar="اليوم · حتى الآن" />
              </span>
              <span className="v">
                SAR {fmtSAR(todaySar)}
                <span className="u">
                  <Bi en="/ Riyal" ar="/ ريال" />
                </span>
              </span>
              <span className="d up">
                ▲ <Bi en="12% vs yesterday at this hour" ar="12% مقارنة بأمس في هذه الساعة" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This week" ar="هذا الأسبوع" />
              </span>
              <span className="v">
                SAR 1,424
                <span className="u">
                  <Bi en="/ Riyal" ar="/ ريال" />
                </span>
              </span>
              <span className="d up">
                ▲ <Bi en="8% vs last week" ar="8% مقارنة بالأسبوع الماضي" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This month" ar="هذا الشهر" />
              </span>
              <span className="v">
                SAR {fmtSAR(monthSar)}
                <span className="u">
                  <Bi en="/ Riyal" ar="/ ريال" />
                </span>
              </span>
              <span className="d up">
                ▲ <Bi en="14% vs last month" ar="14% مقارنة بالشهر الماضي" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Lifetime" ar="الإجمالي" />
              </span>
              <span className="v">
                SAR {fmtSAR(lifetimeSar)}
                <span className="u">
                  <Bi en="/ Riyal" ar="/ ريال" />
                </span>
              </span>
              <span className="d" style={{ color: 'var(--mut)' }}>
                <Bi en="Since Aug 2024 · 16 months" ar="منذ أغسطس 2024 · 16 شهرًا" />
              </span>
            </div>
          </div>

          {/* Earnings chart + Rigs */}
          <div className="two-col">
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Earnings" ar="الأرباح" />
                  </h3>
                  <div className="meta" style={{ marginTop: '4px' }} />
                </div>
                <div className="seg" id="chart-range">
                  {ranges.map((rg) => (
                    <button
                      key={rg.r}
                      data-r={rg.r}
                      className={rangeDays === rg.r ? 'on' : undefined}
                      onClick={() => setRangeDays(rg.r)}
                    >
                      {rg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart" id="chart">
                <div className="axis-l" id="ax-l">
                  {axisLeft.map((label, i) => (
                    <span key={`axl-${i}`}>{label}</span>
                  ))}
                </div>
                <div className="axis-b" id="ax-b">
                  {axisBottom.map((label, i) => (
                    <span key={`axb-${i}`}>{label}</span>
                  ))}
                </div>
                <svg
                  ref={svgRef}
                  id="chart-svg"
                  viewBox="0 0 600 220"
                  preserveAspectRatio="none"
                  onMouseMove={onChartMove}
                  onMouseLeave={() => setHover(null)}
                >
                  <defs>
                    <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ee7a3c" stopOpacity=".45" />
                      <stop offset="1" stopColor="#ee7a3c" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g className="grid" id="chart-grid">
                    {gridYs.map((gy, i) => (
                      <line key={`grid-${i}`} x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} />
                    ))}
                  </g>
                  <path className="area" id="chart-area" d={areaPath} />
                  <path className="line" id="chart-line" d={linePath} />
                  <line
                    className="hover-line"
                    id="chart-hover-line"
                    x1={hoverDx}
                    x2={hoverDx}
                    y1={PAD_T}
                    y2={H - PAD_B}
                    style={{ opacity: hover ? 1 : 0 }}
                  />
                  <circle
                    className="hover-dot"
                    id="chart-hover-dot"
                    r={4}
                    cx={hoverDx}
                    cy={hoverDy}
                    style={{ opacity: hover ? 1 : 0 }}
                  />
                </svg>
                <div
                  className="chart-tip"
                  id="chart-tip"
                  style={
                    hover
                      ? { left: `${hover.left}px`, top: `${hover.top}px`, opacity: 1 }
                      : { opacity: 0 }
                  }
                >
                  {hover ? (
                    <>
                      {days[hover.idx].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ·{' '}
                      <span className="v">SAR {fmtSAR(days[hover.idx].sar)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Your rigs" ar="أجهزتك" />
                  </h3>
                </div>
                <div
                  className="meta"
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                  }}
                >
                  <Bi en="2 earning · 1 idle · 1 paused" ar="2 يكسب · 1 خامل · 1 متوقف" />
                </div>
              </div>
              <div className="rigs">
                <div className="rig earning">
                  <span className="pip" />
                  <div>
                    <div className="name">studio-main</div>
                    <div className="meta">
                      <span>
                        RTX 4090 · <b>24 GB</b>
                      </span>{' '}
                      <span>
                        <Bi en="78% util" ar="78% استخدام" />
                      </span>{' '}
                      <span>62°C</span>
                    </div>
                  </div>
                  <div className="util">
                    78<span className="u">%</span>
                  </div>
                </div>
                <div className="rig earning">
                  <span className="pip" />
                  <div>
                    <div className="name">studio-bench</div>
                    <div className="meta">
                      <span>
                        RTX 4080 · <b>16 GB</b>
                      </span>{' '}
                      <span>
                        <Bi en="54% util" ar="54% استخدام" />
                      </span>{' '}
                      <span>58°C</span>
                    </div>
                  </div>
                  <div className="util">
                    54<span className="u">%</span>
                  </div>
                </div>
                <div className="rig idle">
                  <span className="pip" />
                  <div>
                    <div className="name">office-mac</div>
                    <div className="meta">
                      <span>
                        M3 Max · <b>64 GB</b>
                      </span>{' '}
                      <span>
                        <Bi en="idle · no jobs queued" ar="خامل · لا مهام في الطابور" />
                      </span>
                    </div>
                  </div>
                  <div className="util">—</div>
                </div>
                <div className="rig paused">
                  <span className="pip" />
                  <div>
                    <div className="name">garage-3090</div>
                    <div className="meta">
                      <span>
                        RTX 3090 · <b>24 GB</b>
                      </span>{' '}
                      <span>
                        <Bi en="paused · maintenance" ar="متوقف · صيانة" />
                      </span>
                    </div>
                  </div>
                  <div className="util">—</div>
                </div>
              </div>
              <div className="rig-foot">
                <span>
                  <Bi en="Last updated 8s ago" ar="آخر تحديث قبل 8 ثوانٍ" />
                </span>
                <Link href="/v2/provider/rigs">
                  <Bi en="Manage fleet →" ar="إدارة الأسطول →" />
                </Link>
              </div>
            </div>
          </div>

          {/* Jobs panel */}
          <div className="panel jobs-panel">
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Recent jobs" ar="المهام الأخيرة" />
                </h3>
                <div
                  className="meta"
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                    marginTop: '4px',
                  }}
                >
                  <Bi en="Settlement is per-second · paid out weekly" ar="التسوية لكل ثانية · يُدفع أسبوعيًا" />
                </div>
              </div>
              <Link
                href="/v2/provider/jobs"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  borderBottom: '1px solid var(--ink)',
                  paddingBottom: '2px',
                }}
              >
                <Bi en="View all 63 today →" ar="عرض الكل 63 اليوم →" />
              </Link>
            </div>
            <table className="jobs-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Job" ar="المهمة" />
                  </th>
                  <th>
                    <Bi en="Rig" ar="الجهاز" />
                  </th>
                  <th>
                    <Bi en="Model" ar="النموذج" />
                  </th>
                  <th>
                    <Bi en="Renter" ar="المستأجر" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Tokens" ar="الرموز" />
                  </th>
                  <th style={{ textAlign: 'end' }}>SAR</th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="When" ar="الوقت" />
                  </th>
                </tr>
              </thead>
              <tbody id="jobs-body">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <span className="jid">{j.id}</span>
                    </td>
                    <td>
                      <span className="rig">{j.rig}</span>
                    </td>
                    <td>
                      <span className="model">{j.model}</span>
                    </td>
                    <td>
                      <span className="renter">{j.renter}</span>
                    </td>
                    <td>
                      <span className="tok">{j.tok.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sar">
                        {j.sar.toFixed(2)}
                        <span className="u">SAR</span>
                      </span>
                    </td>
                    <td>
                      <span className={`stat ${j.status}`}>
                        {j.status === 'settled' ? (
                          <Bi en="settled" ar="مُسوّاة" />
                        ) : (
                          <Bi en="failed" ar="فشلت" />
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="when">{j.when}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
