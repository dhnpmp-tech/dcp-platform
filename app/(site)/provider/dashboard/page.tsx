'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/(site)/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './dashboard.css'

interface EarnPoint {
  date: Date
  sar: number
}

interface Job {
  id: string
  rig: string
  model: string
  renter: string
  tok: number | null
  sar: number
  status: 'settled' | 'failed'
  when: string
}

interface Rig {
  name: string
  gpu: string
  vram: string
  status: 'earning' | 'idle' | 'paused' | 'offline'
  util: number | null
  temp: number | null
  jobs: number | null
}

/* ════════ API response shapes (v1 provider endpoints) ════════ */
interface ApiProvider {
  name?: string
  email?: string
  status?: string
  gpu_model?: string
  gpu_vram_mib?: number
  gpu_count_reported?: number
  gpu_count?: number
  vram_mb?: number
  is_paused?: boolean
  created_at?: string
  location?: string
  uptime_percent?: number
  total_jobs?: number
  today_earnings_halala?: number
  week_earnings_halala?: number
  month_earnings_halala?: number
  total_earnings_halala?: number
  gpu_metrics?: {
    utilization_pct?: number
    vram_used_mib?: number
    temperature_c?: number
  }
}
interface ApiMeResponse {
  provider?: ApiProvider
  recent_jobs?: ApiRecentJob[]
}
interface ApiRecentJob {
  job_id?: string
  id?: string
  job_type?: string
  model?: string
  status?: string
  tokens_generated?: number
  actual_cost_halala?: number
  provider_earned_halala?: number
  earnings_halala?: number
  submitted_at?: string
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
    const earnedHalala = Number(j.provider_earned_halala ?? j.earnings_halala ?? 0)
    return {
      id: String(j.job_id || j.id || ''),
      rig: '—',
      model: String(j.model || j.job_type || 'inference'),
      renter: '—',
      tok: typeof j.tokens_generated === 'number' ? j.tokens_generated : null,
      sar: earnedHalala / 100,
      status,
      when: relTime(String(j.completed_at || j.submitted_at || '')),
    }
  })
}

function mapRig(provider: ApiProvider): Rig {
  const status = provider.is_paused
    ? 'paused'
    : provider.status === 'online'
      ? 'earning'
      : provider.status === 'connected' || provider.status === 'idle'
        ? 'idle'
        : 'offline'
  const vramMib = provider.gpu_vram_mib || provider.vram_mb || 0
  const util = provider.gpu_metrics?.utilization_pct
  const temp = provider.gpu_metrics?.temperature_c
  return {
    name: provider.name || 'Provider rig',
    gpu: provider.gpu_model || 'GPU pending daemon report',
    vram: vramMib > 0 ? `${Math.round(vramMib / 1024)} GB` : 'VRAM pending',
    status,
    util: typeof util === 'number' ? util : null,
    temp: typeof temp === 'number' ? temp : null,
    jobs: typeof provider.total_jobs === 'number' ? provider.total_jobs : null,
  }
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
      { k: 'dash', ic: '⌂', enLabel: 'Dashboard', arLabel: 'لوحة التحكم', href: '/provider/dashboard' },
      { k: 'rigs', ic: '☷', enLabel: 'Rigs', arLabel: 'الأجهزة', href: '/provider/rigs' },
      { k: 'earnings', ic: '△', enLabel: 'Earnings', arLabel: 'الأرباح', href: '/provider/earnings' },
      { k: 'payouts', ic: '₪', enLabel: 'Payouts', arLabel: 'المدفوعات', href: '/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    arSec: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', enLabel: 'Profile', arLabel: 'الملف الشخصي', href: '/provider/profile' },
      { k: 'settings', ic: '⚙', enLabel: 'Settings', arLabel: 'الإعدادات', href: '/provider/settings' },
      { k: 'docs', ic: '?', enLabel: 'Provider docs', arLabel: 'دليل المزود', href: '/docs', bd: '↗' },
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

  const [earn, setEarn] = useState<EarnPoint[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [rigs, setRigs] = useState<Rig[]>([])
  const [rangeDays, setRangeDays] = useState(30)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [dataState, setDataState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [dataError, setDataError] = useState('')
  const [providerName, setProviderName] = useState('')
  const [providerEmail, setProviderEmail] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [todaySar, setTodaySar] = useState<number | null>(null)
  const [weekSar, setWeekSar] = useState<number | null>(null)
  const [monthSar, setMonthSar] = useState<number | null>(null)
  const [lifetimeSar, setLifetimeSar] = useState<number | null>(null)
  const [totalJobs, setTotalJobs] = useState<number | null>(null)
  const [uptimePct, setUptimePct] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  // Kill-switch action state + a tick that re-runs the loader (range change / post-pause refetch).
  const [pauseBusy, setPauseBusy] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  // ── Wire primary data: KPIs, 30D earnings series, recent jobs ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) {
      setDataState('missing-key')
      return
    }

    let cancelled = false
    const base = getApiBase()
    const q = `key=${encodeURIComponent(key)}`
    const headers = { 'x-provider-key': key }
    setDataState('loading')
    setDataError('')

    ;(async () => {
      try {
        const [meRes, metricsRes, dailyRes] = await Promise.all([
          fetch(`${base}/providers/me?${q}`, { headers }),
          fetch(`${base}/providers/me/metrics?${q}`, { headers }),
          fetch(`${base}/providers/earnings-daily?${q}&days=${rangeDays}`, { headers }),
        ])
        if (cancelled) return

        if (!meRes.ok) {
          const data = await meRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load provider dashboard.')
        }

        const me = (await meRes.json()) as ApiMeResponse
        const p = me.provider || {}
        if (!cancelled) {
          setProviderName(p.name || '')
          setProviderEmail(p.email || '')
          setProviderStatus(p.status || '')
          setTodaySar(typeof p.today_earnings_halala === 'number' ? p.today_earnings_halala / 100 : null)
          setWeekSar(typeof p.week_earnings_halala === 'number' ? p.week_earnings_halala / 100 : null)
          setMonthSar(typeof p.month_earnings_halala === 'number' ? p.month_earnings_halala / 100 : null)
          setLifetimeSar(typeof p.total_earnings_halala === 'number' ? p.total_earnings_halala / 100 : null)
          setTotalJobs(typeof p.total_jobs === 'number' ? p.total_jobs : null)
          setUptimePct(typeof p.uptime_percent === 'number' ? p.uptime_percent : null)
          setIsPaused(p.is_paused === true)
          setRigs([mapRig(p)])
          const fromMe = mapJobs(me.recent_jobs || [])
          if (fromMe.length > 0) setJobs(fromMe)
        }

        if (metricsRes.ok && !cancelled) {
          const m = (await metricsRes.json()) as ApiMetricsResponse
          const mapped = mapJobs(m.recent_jobs || [])
          if (!cancelled) setJobs(mapped)
        }

        if (dailyRes.ok && !cancelled) {
          const d = (await dailyRes.json()) as ApiDailyResponse
          const mapped = mapDaily(d.daily || [])
          if (!cancelled) setEarn(mapped)
        }
        if (!cancelled) setDataState('ready')
      } catch (err) {
        if (!cancelled) {
          setDataState('error')
          setDataError(err instanceof Error ? err.message : 'Failed to load provider dashboard.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rangeDays, reloadTick])

  // ── chart math ──
  const days = useMemo(() => earn.slice(-rangeDays), [earn, rangeDays])
  const chart = useMemo(() => {
    if (days.length === 0) {
      return { linePath: '', areaPath: '', gridYs: [], axisLeft: [], axisBottom: [], xs: [], ys: [] }
    }
    const maxV = Math.max(...days.map((d) => d.sar), 1) * 1.1
    const minV = Math.min(...days.map((d) => d.sar), 0) * 0.85
    const span = Math.max(maxV - minV, 1)
    const x = (i: number) => PAD_L + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - PAD_L - PAD_R))
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
  const { linePath, areaPath, gridYs, axisLeft, axisBottom, xs, ys } = chart

  // ── chart hover ──
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<{ idx: number; left: number; top: number } | null>(null)

  const onChartMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || xs.length === 0) return
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
  const displayName = providerName || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = providerEmail || providerStatus || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const earningCount = rigs.filter((r) => r.status === 'earning').length
  const activeRigText = `${earningCount} / ${rigs.length} ${lang === 'ar' ? 'نشط' : 'earning'}`
  const statusLabel = isPaused
    ? lang === 'ar' ? 'موقوف' : 'paused'
    : providerStatus || (dataState === 'missing-key' ? 'missing key' : dataState)

  // Avatar initial derived from the real provider name (was a hardcoded 'Y').
  const avatarInitial = (providerName.trim()[0] || 'P').toUpperCase()

  // Time-of-day greeting derived from the local clock (was a hardcoded 'Good morning').
  const greetHour = new Date().getHours()
  const greeting =
    greetHour < 12
      ? { en: 'Good morning, ', ar: 'صباح الخير، ' }
      : greetHour < 18
        ? { en: 'Good afternoon, ', ar: 'مساء الخير، ' }
        : { en: 'Good evening, ', ar: 'مساء الخير، ' }

  // Yesterday's earnings derived from the real daily series (second-to-last point).
  const yesterdaySar = earn.length >= 2 ? earn[earn.length - 2].sar : null

  // Sign out: clear the provider key and bounce to the provider auth screen.
  const signOut = () => {
    localStorage.removeItem('dc1_provider_key')
    window.location.href = '/auth?role=provider'
  }

  // Kill switch: pause/resume all rigs via the backend, then refetch /me to reflect is_paused.
  const toggleKill = async () => {
    const key = getProviderKey()
    if (!key || pauseBusy) return
    const next = !isPaused
    const confirmMsg = next
      ? lang === 'ar'
        ? 'إيقاف كل الأجهزة وإيقاف قبول المهام؟'
        : 'Pause all rigs and stop accepting jobs?'
      : lang === 'ar'
        ? 'استئناف الأجهزة واستئناف قبول المهام؟'
        : 'Resume rigs and start accepting jobs again?'
    if (!window.confirm(confirmMsg)) return
    setPauseBusy(true)
    try {
      const res = await fetch(`${getApiBase()}/providers/${next ? 'pause' : 'resume'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (res.ok) {
        setIsPaused(next)
        setReloadTick((t) => t + 1)
      }
    } catch {
      /* leave UI unchanged; the next /me refetch will reconcile state */
    } finally {
      setPauseBusy(false)
    }
  }

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
            {todaySar != null ? (
              <>
                SAR {fmtSAR(todaySar)}
                <span className="u">
                  <Bi en="so far" ar="حتى الآن" />
                </span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="live">
            <span className="d" /> {activeRigText}
          </div>
          <div className="row">
            <span>
              <Bi en="Yesterday" ar="أمس" />
            </span>
            <b>{yesterdaySar != null ? `SAR ${fmtSAR(yesterdaySar)}` : '—'}</b>
          </div>
          <div className="row" style={{ marginTop: '8px', paddingTop: 0, border: 0 }}>
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>{monthSar != null ? `SAR ${fmtSAR(monthSar)}` : '—'}</b>
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
                  target={it.href === '/docs' ? '_blank' : undefined}
                  rel={it.href === '/docs' ? 'noopener noreferrer' : undefined}
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
          <div className="av">{avatarInitial}</div>
          <div className="who">
            {displayName}
            <span className="e">{displayScope}</span>
          </div>
          <span
            className="out"
            title="Sign out"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={signOut}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') signOut()
            }}
          >
            ↱
          </span>
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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Dashboard" ar="لوحة التحكم" />
            </span>
          </div>
          <span className={`pill${isPaused ? ' paused' : ''}`}>
            <span className="d" /> {statusLabel}
          </span>
          <button
            className="lang"
            onClick={toggle}
            title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
          >
            {lang === 'en' ? 'ع' : 'EN'}
          </button>
          <button
            type="button"
            className={`kill${isPaused ? ' on' : ''}`}
            onClick={toggleKill}
            disabled={pauseBusy || dataState === 'missing-key'}
            title={
              isPaused
                ? lang === 'en' ? 'Resume all rigs' : 'استئناف كل الأجهزة'
                : lang === 'en' ? 'Pause all rigs' : 'إيقاف كل الأجهزة'
            }
          >
            ◉{' '}
            {pauseBusy ? (
              <Bi en="Working…" ar="جارٍ…" />
            ) : isPaused ? (
              <Bi en="Resume rigs" ar="استئناف" />
            ) : (
              <Bi en="Kill switch" ar="إيقاف طارئ" />
            )}
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en={greeting.en} ar={greeting.ar} />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>{displayName}.</em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              {activeRigText}
            </span>
            <span>
              <Bi en="Uptime " ar="وقت التشغيل " />
              <b>{uptimePct != null ? `${uptimePct.toFixed(1)}%` : '—'}</b>
            </span>
            <span>
              <Bi en="Jobs " ar="المهام " />
              <b>{totalJobs != null ? totalJobs.toLocaleString('en-US') : '—'}</b>
            </span>
          </div>

          {dataState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load live rig, earnings, and job data." ar="سجّل الدخول بمفتاح مزوّد لتحميل بيانات الجهاز والأرباح والمهام الحية." />{' '}
              <Link href="/auth?role=provider&method=apikey&redirect=/provider/dashboard">
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
          <div className="kpi-row">
            <div className="kpi featured">
              <span className="k">
                <Bi en="Today · so far" ar="اليوم · حتى الآن" />
              </span>
              <span className="v">
                {todaySar != null ? (
                  <>
                    SAR {fmtSAR(todaySar)}
                    <span className="u">
                      <Bi en="/ Riyal" ar="/ ريال" />
                    </span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d up">
                <Bi en="From live provider account" ar="من حساب المزوّد الحي" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This week" ar="هذا الأسبوع" />
              </span>
              <span className="v">
                {weekSar != null ? (
                  <>
                    SAR {fmtSAR(weekSar)}
                    <span className="u">
                      <Bi en="/ Riyal" ar="/ ريال" />
                    </span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d up">
                <Bi en="Settled earnings" ar="الأرباح المسوّاة" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="This month" ar="هذا الشهر" />
              </span>
              <span className="v">
                {monthSar != null ? (
                  <>
                    SAR {fmtSAR(monthSar)}
                    <span className="u">
                      <Bi en="/ Riyal" ar="/ ريال" />
                    </span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d up">
                <Bi en="Settled earnings" ar="الأرباح المسوّاة" />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Lifetime" ar="الإجمالي" />
              </span>
              <span className="v">
                {lifetimeSar != null ? (
                  <>
                    SAR {fmtSAR(lifetimeSar)}
                    <span className="u">
                      <Bi en="/ Riyal" ar="/ ريال" />
                    </span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d" style={{ color: 'var(--mut)' }}>
                <Bi en="All-time provider earnings" ar="إجمالي أرباح المزوّد" />
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
                {days.length > 0 ? (
                  <>
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
                  </>
                ) : (
                  <div className="empty-row">
                    <Bi en="No earnings series yet. The chart appears after settled jobs are recorded." ar="لا توجد سلسلة أرباح بعد. يظهر الرسم بعد تسجيل مهام مسوّاة." />
                  </div>
                )}
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
                  {rigs.length > 0 ? activeRigText : <Bi en="No rig loaded" ar="لم يتم تحميل جهاز" />}
                </div>
              </div>
              <div className="rigs">
                {rigs.length > 0 ? (
                  rigs.map((rig) => (
                    <div className={`rig ${rig.status}`} key={rig.name}>
                      <span className="pip" />
                      <div>
                        <div className="name">{rig.name}</div>
                        <div className="meta">
                          <span>
                            {rig.gpu} · <b>{rig.vram}</b>
                          </span>{' '}
                          <span>
                            {rig.util != null ? `${Math.round(rig.util)}% util` : <Bi en="util pending" ar="الاستخدام قيد الانتظار" />}
                          </span>{' '}
                          <span>{rig.temp != null ? `${Math.round(rig.temp)}°C` : '—'}</span>
                        </div>
                      </div>
                      <div className="util">
                        {rig.util != null ? (
                          <>
                            {Math.round(rig.util)}<span className="u">%</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-row">
                    <Bi en="No provider rig data yet. Install the daemon or sign in with a provider key." ar="لا توجد بيانات جهاز بعد. ثبّت الخادم المحلي أو سجّل الدخول بمفتاح مزوّد." />
                  </div>
                )}
              </div>
              <div className="rig-foot">
                <span>
                  <Bi en="Updated from provider account" ar="محدّث من حساب المزوّد" />
                </span>
                <Link href="/provider/rigs">
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
                href="/provider/earnings"
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
                <Bi en="View earnings →" ar="عرض الأرباح →" />
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
                {jobs.length > 0 ? (
                  jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <span className="jid">{j.id || '—'}</span>
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
                        <span className="tok">{j.tok != null ? j.tok.toLocaleString() : '—'}</span>
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
                        <span className="when">{j.when || '—'}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <span className="empty-row">
                        <Bi en="No settled provider jobs yet." ar="لا توجد مهام مزوّد مسوّاة بعد." />
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
