'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './earnings.css'

interface NavItem {
  k: string
  ic: string
  label: string
  labelAr: string
  href: string
  bd?: string
}

interface NavSection {
  sec: string
  secAr: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    sec: 'Operate',
    secAr: 'التشغيل',
    items: [
      { k: 'dash', ic: '⌂', label: 'Dashboard', labelAr: 'لوحة التحكم', href: '/v2/provider/dashboard' },
      { k: 'rigs', ic: '☷', label: 'Rigs', labelAr: 'الأجهزة', href: '/v2/provider/rigs' },
      { k: 'earnings', ic: '△', label: 'Earnings', labelAr: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', label: 'Payouts', labelAr: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف الشخصي', href: '/v2/provider/profile' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'وثائق المزوّد', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'earnings'
const HALALA_PER_SAR = 100

type RangeOpt = 7 | 30 | 90
type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface EarnPoint {
  date: Date
  sar: number
}

interface Breakdown {
  name: string
  width: string
  sar: number
}

interface Payout {
  period: string
  mode: string
  sar: number
  status: string
  statClass: 'accruing' | 'paid'
  date: string
  inv: string | null
}

interface ProviderEarnings {
  total_earned_sar?: number
  available_sar?: number
  pending_withdrawal_sar?: number
  withdrawn_sar?: number
  total_jobs?: number
}

interface ProviderMe {
  id?: string | number
  name?: string
  email?: string
  status?: string
  payout_iban?: string | null
  today_earnings_halala?: number
  week_earnings_halala?: number
  month_earnings_halala?: number
  total_earnings_halala?: number
  claimable_earnings_halala?: number
  total_jobs?: number
}

interface ApiRecentJob {
  job_id?: string
  id?: string
  job_type?: string
  model?: string
  status?: string
  provider_earned_halala?: number
  earnings_halala?: number
  completed_at?: string
  submitted_at?: string
}

interface ProviderMeResponse {
  provider?: ProviderMe
  recent_jobs?: ApiRecentJob[]
}

interface MetricsResponse {
  recent_jobs?: ApiRecentJob[]
}

interface EarningsHistoryRow {
  date?: string
  day?: string
  earnings_halala?: number
  earned_halala?: number
  jobs_completed?: number
}

interface Withdrawal {
  id: string | number
  amount_halala: number
  status: string
  iban?: string | null
  created_at: string
  processed_at?: string | null
}

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function halalaToSar(halala: number | undefined): number | null {
  return typeof halala === 'number' ? halala / HALALA_PER_SAR : null
}

function fmtSar(n: number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  if (opts.precise) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }
  return numFmt.format(n)
}

function fmtPayoutDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusToClass(status: string): 'accruing' | 'paid' {
  return status === 'paid' ? 'paid' : 'accruing'
}

function maskIban(iban: string | null | undefined): string {
  const tail = (iban || '').replace(/\s+/g, '').slice(-4)
  return tail ? `SAR · IBAN ••${tail}` : 'SAR · IBAN'
}

function payoutIbanLabel(iban: string | null): string {
  const tail = (iban || '').replace(/\s+/g, '').slice(-4)
  return tail ? `••${tail}` : 'No payout IBAN on file'
}

function toPayoutRows(withdrawals: Withdrawal[]): Payout[] {
  return withdrawals.map((w) => ({
    period: fmtPayoutDate(w.created_at),
    mode: maskIban(w.iban),
    sar: Number(w.amount_halala || 0) / HALALA_PER_SAR,
    status: w.status || 'pending',
    statClass: statusToClass(w.status),
    date: w.status === 'paid' ? fmtPayoutDate(w.processed_at) : '—',
    inv: null,
  }))
}

function historyToEarn(rows: EarningsHistoryRow[]): EarnPoint[] {
  return rows
    .map((r) => {
      const date = new Date(r.date || r.day || '')
      const halala = Number(r.earnings_halala ?? r.earned_halala ?? 0)
      return { date, sar: halala / HALALA_PER_SAR }
    })
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

function modelBreakdown(jobs: ApiRecentJob[]): Breakdown[] {
  const totals = new Map<string, number>()
  for (const job of jobs) {
    const halala = Number(job.provider_earned_halala ?? job.earnings_halala ?? 0)
    if (halala <= 0) continue
    const name = String(job.model || job.job_type || 'inference')
    totals.set(name, (totals.get(name) || 0) + halala / HALALA_PER_SAR)
  }
  const rows = Array.from(totals.entries())
    .map(([name, sar]) => ({ name, sar }))
    .sort((a, b) => b.sar - a.sar)
  const max = Math.max(...rows.map((r) => r.sar), 0)
  return rows.map((r) => ({
    ...r,
    width: max > 0 ? `${Math.max(8, Math.round((r.sar / max) * 100))}%` : '0%',
  }))
}

function buildRigBreakdown(providerName: string, monthSar: number | null): Breakdown[] {
  if (monthSar == null || monthSar <= 0) return []
  return [{ name: providerName || 'Provider rig', sar: monthSar, width: '100%' }]
}

function buildChart(earn: EarnPoint[], rangeDays: number) {
  const W = 600
  const H = 300
  const padL = 56
  const padR = 8
  const padT = 16
  const padB = 22
  const days = earn.slice(-rangeDays)
  if (days.length === 0) {
    return { W, H, padL, padR, line: '', area: '', grid: [], axisL: [], axisB: [], hasData: false }
  }

  const max = Math.max(...days.map((d) => d.sar), 1) * 1.1
  const min = Math.min(...days.map((d) => d.sar), 0) * 0.85
  const range = Math.max(max - min, 1)
  const x = (i: number) => padL + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - padL - padR))
  const y = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB)

  let line = ''
  days.forEach((d, i) => {
    line += (i === 0 ? 'M ' : ' L ') + x(i).toFixed(1) + ' ' + y(d.sar).toFixed(1)
  })
  const area = `${line} L ${x(days.length - 1).toFixed(1)} ${H - padB} L ${x(0).toFixed(1)} ${H - padB} Z`

  const grid: number[] = []
  for (let i = 0; i <= 4; i++) grid.push(padT + (i / 4) * (H - padT - padB))

  const axisL: string[] = []
  for (let i = 0; i <= 4; i++) axisL.push(`SAR ${numFmt.format(max - (i / 4) * range)}`)

  const labelEvery = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 5 : 15
  const axisB = days
    .filter((_, i) => i % labelEvery === 0 || i === days.length - 1)
    .map((d) => d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))

  return { W, H, padL, padR, line, area, grid, axisL, axisB, hasData: true }
}

export default function ProviderEarningsPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [range, setRange] = useState<RangeOpt>(30)
  const [earn, setEarn] = useState<EarnPoint[]>([])
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [dataState, setDataState] = useState<LoadState>('loading')
  const [dataError, setDataError] = useState('')
  const [providerName, setProviderName] = useState('')
  const [providerEmail, setProviderEmail] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [payoutIban, setPayoutIban] = useState<string | null>(null)
  const [todaySar, setTodaySar] = useState<number | null>(null)
  const [weekSar, setWeekSar] = useState<number | null>(null)
  const [monthSar, setMonthSar] = useState<number | null>(null)
  const [lifetimeSar, setLifetimeSar] = useState<number | null>(null)
  const [claimableSar, setClaimableSar] = useState<number | null>(null)
  const [totalJobs, setTotalJobs] = useState<number | null>(null)
  const [byRig, setByRig] = useState<Breakdown[]>([])
  const [byModel, setByModel] = useState<Breakdown[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) {
      setDataState('missing-key')
      return
    }

    let cancelled = false
    const base = getApiBase()
    const headers = { 'x-provider-key': key }
    setDataState('loading')
    setDataError('')

    ;(async () => {
      try {
        const [meRes, eRes, wRes, mRes] = await Promise.all([
          fetch(`${base}/providers/me?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/providers/earnings?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/providers/me/withdrawals?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/providers/me/metrics?key=${encodeURIComponent(key)}`, { headers }),
        ])
        if (cancelled) return

        const meData = (await meRes.json().catch(() => ({}))) as ProviderMeResponse & { error?: string }
        if (!meRes.ok) throw new Error(meData.error || 'Failed to load provider earnings.')

        const provider = meData.provider || {}
        const providerMonth = halalaToSar(provider.month_earnings_halala)
        const providerTotal = halalaToSar(provider.total_earnings_halala)
        const providerClaimable = halalaToSar(provider.claimable_earnings_halala)

        setProviderName(provider.name || '')
        setProviderEmail(provider.email || '')
        setProviderStatus(provider.status || '')
        setPayoutIban(provider.payout_iban || null)
        setTodaySar(halalaToSar(provider.today_earnings_halala))
        setWeekSar(halalaToSar(provider.week_earnings_halala))
        setMonthSar(providerMonth)
        setLifetimeSar(providerTotal)
        setClaimableSar(providerClaimable)
        setTotalJobs(typeof provider.total_jobs === 'number' ? provider.total_jobs : null)
        setByRig(buildRigBreakdown(provider.name || '', providerMonth))

        if (eRes.ok) {
          const e = (await eRes.json()) as ProviderEarnings
          if (!cancelled) {
            setEarnings(e)
            setClaimableSar(typeof e.available_sar === 'number' ? e.available_sar : providerClaimable)
            setLifetimeSar(typeof e.total_earned_sar === 'number' ? e.total_earned_sar : providerTotal)
            setTotalJobs(typeof e.total_jobs === 'number' ? e.total_jobs : typeof provider.total_jobs === 'number' ? provider.total_jobs : null)
          }
        }

        if (wRes.ok) {
          const w = (await wRes.json()) as { withdrawals?: Withdrawal[] }
          if (!cancelled) setPayouts(toPayoutRows(w.withdrawals || []))
        } else {
          setPayouts([])
        }

        const metricJobs = mRes.ok ? ((await mRes.json()) as MetricsResponse).recent_jobs || [] : meData.recent_jobs || []
        if (!cancelled) {
          setByModel(modelBreakdown(metricJobs))
          setDataState('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setDataState('error')
          setDataError(err instanceof Error ? err.message : 'Failed to load provider earnings.')
          setPayouts([])
          setByRig([])
          setByModel([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    let cancelled = false
    const period = `${range}d`
    const base = getApiBase()

    ;(async () => {
      try {
        const res = await fetch(`${base}/providers/me/earnings/history?key=${encodeURIComponent(key)}&period=${period}`, {
          headers: { 'x-provider-key': key },
        })
        if (cancelled) return
        if (!res.ok) {
          setEarn([])
          return
        }
        const rows = (await res.json()) as EarningsHistoryRow[]
        if (!cancelled) setEarn(historyToEarn(Array.isArray(rows) ? rows : []))
      } catch {
        if (!cancelled) setEarn([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [range])

  const chart = useMemo(() => buildChart(earn, range), [earn, range])
  const ranges: RangeOpt[] = [7, 30, 90]
  const displayName = providerName || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = providerEmail || providerStatus || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const statusLabel = providerStatus || (dataState === 'missing-key' ? 'missing key' : dataState)
  const availableSar = claimableSar ?? earnings?.available_sar ?? null
  const resolvedLifetimeSar = lifetimeSar ?? earnings?.total_earned_sar ?? null
  const payoutLabel = payoutIbanLabel(payoutIban)

  return (
    <div className="pv-app">
      <aside className={`pv-sb${navOpen ? ' on' : ''}`} id="pv-sb" data-page="earnings">
        <div className="pv-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Provider" ar="مزوّد" />
          </span>
        </div>

        <div className="pv-status">
          <div className="k">
            <Bi en="Earning today" ar="أرباح اليوم" />
          </div>
          <div className="v">
            {todaySar != null ? (
              <>
                SAR {fmtSar(todaySar)}
                <span className="u">
                  <Bi en="so far" ar="حتى الآن" />
                </span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="live">
            <span className="d" /> {statusLabel}
          </div>
          <div className="row">
            <span>
              <Bi en="This week" ar="هذا الأسبوع" />
            </span>
            <b>{weekSar != null ? `SAR ${fmtSar(weekSar)}` : '—'}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>{monthSar != null ? `SAR ${fmtSar(monthSar)}` : '—'}</b>
          </div>
        </div>

        <nav className="pv-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => {
                const active = it.k === CURRENT_PAGE
                return (
                  <Link
                    key={it.k}
                    href={it.href}
                    className={active ? 'on' : ''}
                    aria-current={active ? 'page' : undefined}
                  >
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

        <div className="pv-sb-foot">
          <div className="av">{displayName.charAt(0).toUpperCase() || 'P'}</div>
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
            onClick={() => {
              localStorage.removeItem('dc1_provider_key')
              window.location.href = '/v2/auth?role=provider'
            }}
          >
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`pv-backdrop${navOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        <header className="pv-tb" id="pv-tb" data-crumb="Earnings">
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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Earnings" ar="الأرباح" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> {statusLabel}
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span
              style={{
                background: lang === 'en' ? 'var(--ink)' : 'transparent',
                color: lang === 'en' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              EN
            </span>
            <span
              style={{
                background: lang === 'ar' ? 'var(--ink)' : 'transparent',
                color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              ع
            </span>
          </button>
          <button
            className="kill"
            title="Pause all rigs"
            type="button"
            onClick={async () => {
              const key = getProviderKey()
              if (!key) {
                window.location.href = '/v2/auth?role=provider&redirect=/v2/provider/earnings'
                return
              }
              if (!window.confirm(lang === 'ar' ? 'إيقاف كل الأجهزة عن استقبال المهام؟' : 'Pause all rigs from accepting jobs?')) {
                return
              }
              try {
                const res = await fetch(`${getApiBase()}/providers/pause`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ key }),
                })
                if (!res.ok) {
                  const body = (await res.json().catch(() => ({}))) as { error?: string }
                  throw new Error(body.error || 'Pause failed')
                }
                window.location.reload()
              } catch (err) {
                window.alert(err instanceof Error ? err.message : 'Pause failed')
              }
            }}
          >
            ◉ <Bi en="Kill switch" ar="إيقاف الكل" />
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en="Your " ar="أرباحك " />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
              <Bi en="earnings." ar="بالكامل." />
            </em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="Paid out weekly · Saudi Riyal" ar="تُدفع أسبوعياً · ريال سعودي" />
            </span>
            <span>
              <Bi en="Available " ar="المتاح " />
              <b>{availableSar != null ? `SAR ${fmtSar(availableSar, { precise: true })}` : '—'}</b>
            </span>
            <span>
              <Bi en="Lifetime " ar="الإجمالي " />
              <b>{resolvedLifetimeSar != null ? `SAR ${fmtSar(resolvedLifetimeSar)}` : '—'}</b>
            </span>
            <span>
              <Bi en="Jobs " ar="المهام " />
              <b>{totalJobs != null ? totalJobs.toLocaleString('en-US') : '—'}</b>
            </span>
          </div>

          {dataState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load live earnings and payout data." ar="سجّل الدخول بمفتاح مزوّد لتحميل الأرباح والمدفوعات الحية." />{' '}
              <Link href="/v2/auth?role=provider&method=apikey&redirect=/v2/provider/earnings">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {dataState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {dataError}
            </div>
          )}

          <div className="panel" style={{ marginTop: 36 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Daily earnings" ar="الأرباح اليومية" />
                </h3>
              </div>
              <div className="seg" id="range">
                {ranges.map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-r={r}
                    className={range === r ? 'on' : ''}
                    onClick={() => setRange(r)}
                  >
                    {r}D
                  </button>
                ))}
              </div>
            </div>
            <div className="earn-chart" id="chart">
              {chart.hasData ? (
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
                  <svg id="chart-svg" viewBox="0 0 600 300" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="earnArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ee7a3c" stopOpacity=".45" />
                        <stop offset="1" stopColor="#ee7a3c" stopOpacity="0" />
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
                <span className="empty-row">
                  <Bi en="No daily earnings yet." ar="لا توجد أرباح يومية بعد." />
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 22,
              marginTop: 28,
            }}
          >
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Estimated by rig · last 30 days" ar="تقديري حسب الجهاز · آخر ٣٠ يوم" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {byRig.length > 0 ? (
                  byRig.map((r) => (
                    <div className="brk-row" key={r.name}>
                      <span className="brk-name">{r.name}</span>
                      <div className="brk-bar">
                        <span style={{ width: r.width }} />
                      </div>
                      <span className="brk-v">SAR {fmtSar(r.sar, { precise: true })}</span>
                    </div>
                  ))
                ) : (
                  <span className="empty-row">
                    <Bi en="No rig earnings breakdown yet." ar="لا يوجد تفصيل أرباح حسب الجهاز بعد." />
                  </span>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By model · last 30 days" ar="حسب النموذج · آخر ٣٠ يوم" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {byModel.length > 0 ? (
                  byModel.map((m) => (
                    <div className="brk-row" key={m.name}>
                      <span className="brk-name">{m.name}</span>
                      <div className="brk-bar">
                        <span style={{ width: m.width }} />
                      </div>
                      <span className="brk-v">SAR {fmtSar(m.sar, { precise: true })}</span>
                    </div>
                  ))
                ) : (
                  <span className="empty-row">
                    <Bi en="No model earnings breakdown yet." ar="لا يوجد تفصيل أرباح حسب النموذج بعد." />
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payouts" ar="المدفوعات" />
                </h3>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                    marginTop: 6,
                  }}
                >
                  <Bi en="Weekly · SAR to IBAN " ar="أسبوعياً · ريال إلى الآيبان " />
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{payoutLabel}</b>
                </div>
              </div>
              <Link
                href="/v2/provider/payouts"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  borderBottom: '1px solid var(--ink)',
                  paddingBottom: '2px',
                  textDecoration: 'none',
                }}
              >
                <Bi en="Manage payouts →" ar="إدارة المدفوعات ←" />
              </Link>
            </div>
            <table className="payouts-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Period" ar="الفترة" />
                  </th>
                  <th>
                    <Bi en="Method" ar="الطريقة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Amount" ar="المبلغ" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Paid" ar="تاريخ الدفع" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Invoice" ar="الفاتورة" />
                  </th>
                </tr>
              </thead>
              <tbody id="payouts">
                {payouts.length > 0 ? (
                  payouts.map((p, i) => (
                    <tr key={`${p.period}-${i}`}>
                      <td>
                        <span className="period">{p.period}</span>
                      </td>
                      <td>
                        <span className="mode">{p.mode}</span>
                      </td>
                      <td>
                        <span className="amount">
                          {fmtSar(p.sar, { precise: true })}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className={`stat ${p.statClass}`}>{p.status}</span>
                      </td>
                      <td>
                        <span className="when">{p.date}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        {p.inv ? (
                          <span className="inv">{p.inv}</span>
                        ) : (
                          <span className="when">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <span className="empty-row">
                        <Bi en="No payout requests yet." ar="لا توجد طلبات دفع بعد." />
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
