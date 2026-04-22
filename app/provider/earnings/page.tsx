'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import StatusBadge from '../../components/ui/StatusBadge'
import EarningsProjections from '../components/EarningsProjections'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api/dc1'

interface TrendPoint {
  date: string
  earnings_halala: number
  jobs_completed: number
}

type TrendPeriod = '7d' | '30d' | '90d'

interface EarningsData {
  total_earned_sar: number
  pending_withdrawal_sar: number
  withdrawn_sar: number
  available_sar: number
  total_jobs: number
}

interface DailyEarning {
  day: string
  jobs: number
  completed: number
  failed: number
  earned_halala: number
  earned_sar: string
  total_minutes: number
}

interface HistoryJob {
  id: number
  job_id: string
  job_type: string
  status: string
  submitted_at: string
  started_at: string
  completed_at: string
  error: string | null
  provider_earned_halala: number
  dc1_fee_halala: number
  actual_cost_halala: number
  actual_duration_minutes: number
  earned_sar: string
  cost_sar: string
  renter_name: string
}

interface JobStats {
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
  total_earned_sar: string
  success_rate: number
}

interface Withdrawal {
  id: string
  amount_halala: number
  status: 'pending' | 'processing' | 'paid' | 'failed'
  iban: string
  admin_note: string | null
  created_at: string
  processed_at: string | null
}

interface DaemonInfo {
  version: string
  hostname: string
  os: string
  python: string
  last_seen?: string
  gpu_name?: string
  gpu_vram_mib?: number
  free_vram_mib?: number
  gpu_temp_c?: number
  gpu_util_pct?: number
  driver_version?: string
  provider_status?: string
  last_heartbeat?: string
}

interface DaemonEvent {
  id: number
  event_type: string
  severity: string
  daemon_version: string
  job_id: string | null
  hostname: string
  details: string
  event_timestamp: string
}

// SVG Icon components (matching provider nav)
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 5v14a1 1 0 001 1h12a1 1 0 001-1V5m-9 9h4" />
  </svg>
)
const LightningIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const CurrencyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const GpuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6M9 8h6" />
  </svg>
)

const FleetIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

// ── Earnings Trend Chart (pure SVG, no external deps) ────────────────────────
const W = 600
const H = 160
const PAD = { top: 10, right: 10, bottom: 30, left: 44 }
const CHART_W = W - PAD.left - PAD.right
const CHART_H = H - PAD.top - PAD.bottom

function EarningsTrendChart({ data, isRTL }: { data: TrendPoint[]; isRTL: boolean }) {
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null)

  const display = isRTL ? [...data].slice().reverse() : data
  const maxVal = Math.max(...display.map(d => d.earnings_halala), 1)
  const n = display.length

  function barX(i: number) {
    return PAD.left + (i / n) * CHART_W
  }
  const barW = Math.max(4, Math.min(28, CHART_W / Math.max(n, 1) - 2))

  // Y-axis ticks (0, mid, max) in SAR
  const maxSar = maxVal / 100
  const midSar = maxSar / 2
  const yTicks = [
    { label: `${maxSar.toFixed(1)}`, y: PAD.top },
    { label: `${midSar.toFixed(1)}`, y: PAD.top + CHART_H / 2 },
    { label: '0', y: PAD.top + CHART_H },
  ]

  // Date labels: show first, middle, last
  const labelIdxs = n <= 1 ? [0] : [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y-axis ticks */}
        {yTicks.map(tick => (
          <g key={tick.label}>
            <line x1={PAD.left - 4} y1={tick.y} x2={PAD.left + CHART_W} y2={tick.y}
              stroke="#ffffff10" strokeWidth="1" />
            <text x={PAD.left - 6} y={tick.y + 4} textAnchor="end"
              fontSize="10" fill="#9ca3af">{tick.label}</text>
          </g>
        ))}

        {/* Bars */}
        {display.map((d, i) => {
          const barH = Math.max((d.earnings_halala / maxVal) * CHART_H, d.earnings_halala > 0 ? 2 : 0)
          const x = barX(i) + (CHART_W / n - barW) / 2
          const y = PAD.top + CHART_H - barH
          return (
            <g key={d.date}
              onMouseEnter={() => setTooltip({ i, x: barX(i) + CHART_W / n / 2, y })}
              style={{ cursor: 'default' }}
            >
              {/* Hover area */}
              <rect x={barX(i)} y={PAD.top} width={CHART_W / n} height={CHART_H}
                fill="transparent" />
              {/* Actual bar */}
              <rect x={x} y={y} width={barW} height={barH}
                fill="#F5A524" rx="2" opacity={tooltip?.i === i ? 1 : 0.8} />
            </g>
          )
        })}

        {/* X-axis date labels */}
        {labelIdxs.map(i => {
          if (i >= display.length) return null
          const d = display[i]
          const x = barX(i) + CHART_W / n / 2
          const dateLabel = new Date(d.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return (
            <text key={d.date} x={x} y={H - 4} textAnchor="middle"
              fontSize="10" fill="#9ca3af">{dateLabel}</text>
          )
        })}

        {/* Tooltip box */}
        {tooltip && tooltip.i < display.length && (() => {
          const d = display[tooltip.i]
          const sar = (d.earnings_halala / 100).toFixed(2)
          const dateStr = new Date(d.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const bx = Math.min(Math.max(tooltip.x - 55, 2), W - 112)
          const by = Math.max(tooltip.y - 56, 4)
          return (
            <g>
              <rect x={bx} y={by} width={110} height={50} rx="6"
                fill="#1a1a2e" stroke="#F5A524" strokeWidth="1" opacity="0.95" />
              <text x={bx + 55} y={by + 16} textAnchor="middle"
                fontSize="11" fill="#F5A524" fontWeight="600">{dateStr}</text>
              <text x={bx + 55} y={by + 31} textAnchor="middle"
                fontSize="11" fill="#e5e7eb">{sar} SAR</text>
              <text x={bx + 55} y={by + 45} textAnchor="middle"
                fontSize="10" fill="#9ca3af">{d.jobs_completed} jobs</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-dc1-text-muted text-sm">{label}</span>
      <span className="text-dc1-text-primary font-mono text-xs">{value}</span>
    </div>
  )
}

function maskIban(iban: string): string {
  const clean = (iban || '').toUpperCase().replace(/\s+/g, '')
  if (clean.length <= 8) return clean
  return `${clean.slice(0, 4)}${'*'.repeat(Math.max(clean.length - 8, 4))}${clean.slice(-4)}`
}

function statusBadgeClass(status: Withdrawal['status']): string {
  if (status === 'pending') return 'bg-dc1-amber/10 text-dc1-amber border-dc1-amber/30'
  if (status === 'processing') return 'bg-status-info/10 text-status-info border-status-info/30'
  if (status === 'paid') return 'bg-status-success/10 text-status-success border-status-success/30'
  return 'bg-status-error/10 text-status-error border-status-error/30'
}

function statusLabel(status: Withdrawal['status']): string {
  if (status === 'pending') return 'Pending'
  if (status === 'processing') return 'Processing'
  if (status === 'paid') return 'Paid'
  return 'Failed'
}

function trackProviderEarningsTrustEvent(event: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const detail = { event, source_page: 'provider_earnings', ...payload }
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

export default function EarningsPage() {
  const router = useRouter()
  const { t, isRTL, language } = useLanguage()
  const navItems = [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]
  const [providerName, setProviderName] = useState('Provider')
  const [tab, setTab] = useState<'overview' | 'jobs' | 'daemon' | 'withdrawals'>('overview')
  const [earnings, setEarnings] = useState<EarningsData | null>(null)
  const [daily, setDaily] = useState<DailyEarning[]>([])
  const [jobs, setJobs] = useState<HistoryJob[]>([])
  const [jobStats, setJobStats] = useState<JobStats | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [daemonInfo, setDaemonInfo] = useState<DaemonInfo | null>(null)
  const [daemonEvents, setDaemonEvents] = useState<DaemonEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawSuccess, setWithdrawSuccess] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawAmountSar, setWithdrawAmountSar] = useState('')
  const [withdrawIban, setWithdrawIban] = useState('')
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('30d')
  const [trendLoading, setTrendLoading] = useState(false)
  const hasTrackedTrustView = useRef(false)

  const fetchAll = useCallback(async () => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key) {
      router.push('/login')
      return
    }

    setLoading(true)
    try {
      // Get provider name
      const meRes = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(key)}`)
      if (!meRes.ok) {
        localStorage.removeItem('dc1_provider_key')
        router.push('/login')
        return
      }
      const meData = await meRes.json()
      setProviderName(meData.provider?.name || 'Provider')

      const [eRes, dRes, jRes, wRes, logRes] = await Promise.all([
        fetch(`${API_BASE}/providers/earnings?key=${encodeURIComponent(key)}`),
        fetch(`${API_BASE}/providers/earnings-daily?key=${encodeURIComponent(key)}&days=30`),
        fetch(`${API_BASE}/providers/job-history?key=${encodeURIComponent(key)}&limit=50`),
        fetch(`${API_BASE}/providers/me/withdrawals?key=${encodeURIComponent(key)}`),
        fetch(`${API_BASE}/providers/daemon-logs?key=${encodeURIComponent(key)}&limit=30`),
      ])
      if (eRes.ok) setEarnings(await eRes.json())
      if (dRes.ok) { const d = await dRes.json(); setDaily(d.daily || []) }
      if (jRes.ok) {
        const j = await jRes.json()
        setJobs(j.jobs || [])
        setJobStats({ total_jobs: j.total_jobs, completed_jobs: j.completed_jobs, failed_jobs: j.failed_jobs, total_earned_sar: j.total_earned_sar, success_rate: j.success_rate })
      }
      if (wRes.ok) { const w = await wRes.json(); setWithdrawals(w.withdrawals || []) }
      if (logRes.ok) {
        const l = await logRes.json()
        setDaemonInfo(l.daemon_info || null)
        setDaemonEvents(l.events || [])
      }
    } catch (err) {
      console.error('Fetch error:', err)
    }
    setLoading(false)
  }, [router])

  const handleWithdraw = useCallback(async () => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key || !earnings) return

    const amountSar = Number(withdrawAmountSar)
    if (!Number.isFinite(amountSar) || amountSar < 10) {
      setWithdrawError('Minimum withdrawal is 10 SAR.')
      return
    }

    const amountHalala = Math.round(amountSar * 100)
    if (amountHalala > Math.round(earnings.available_sar * 100)) {
      setWithdrawError('Requested amount exceeds available balance.')
      return
    }

    const normalizedIban = withdrawIban.trim().toUpperCase().replace(/\s+/g, '')
    if (!/^SA\d{22}$/.test(normalizedIban)) {
      setWithdrawError('IBAN must be Saudi format: SA followed by 22 digits.')
      return
    }

    setWithdrawLoading(true)
    setWithdrawError(null)
    try {
      const res = await fetch(`${API_BASE}/providers/me/withdraw?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_halala: amountHalala,
          iban: normalizedIban,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Request failed (${res.status})`)
      }
      setShowWithdrawModal(false)
      setWithdrawAmountSar('')
      setWithdrawIban('')
      setWithdrawSuccess(true)
      setTimeout(() => setWithdrawSuccess(false), 6000)
      await fetchAll()
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal request failed.')
    }
    setWithdrawLoading(false)
  }, [earnings, fetchAll, withdrawAmountSar, withdrawIban])

  const fetchTrend = useCallback(async (period: TrendPeriod) => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key) return
    setTrendLoading(true)
    try {
      const res = await fetch(`${API_BASE}/providers/me/earnings/history?key=${encodeURIComponent(key)}&period=${period}`)
      if (res.ok) setTrendData(await res.json())
    } catch (err) {
      console.error('Trend fetch error:', err)
    }
    setTrendLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  useEffect(() => {
    fetchTrend(trendPeriod)
  }, [fetchTrend, trendPeriod])

  const trustMetrics = useMemo(() => {
    const settledSar = earnings ? Number((earnings.available_sar + earnings.withdrawn_sar).toFixed(2)) : 0
    const pendingSar = earnings ? Number((earnings.pending_withdrawal_sar || 0).toFixed(2)) : 0
    const estimatedSar = earnings
      ? Number(Math.max((earnings.total_earned_sar || 0) - settledSar - pendingSar, 0).toFixed(2))
      : 0

    const nowMs = Date.now()
    const heartbeatMs = daemonInfo?.last_heartbeat ? new Date(daemonInfo.last_heartbeat).getTime() : 0
    const heartbeatAgeMinutes = heartbeatMs ? Math.max(0, (nowMs - heartbeatMs) / 60000) : Infinity

    const syncState = !Number.isFinite(heartbeatAgeMinutes)
      ? 'uncertain'
      : heartbeatAgeMinutes <= 5
        ? 'fresh'
        : heartbeatAgeMinutes <= 30
          ? 'delayed'
          : 'stale'

    const uptimeConfidence = !daemonInfo?.last_heartbeat
      ? 'uncertain'
      : heartbeatAgeMinutes <= 2
        ? 'high'
        : heartbeatAgeMinutes <= 10
          ? 'medium'
          : 'low'

    const hasPartialData = !earnings || !jobStats || !daemonInfo

    return {
      settledSar,
      pendingSar,
      estimatedSar,
      heartbeatAgeMinutes,
      syncState,
      uptimeConfidence,
      hasPartialData,
    }
  }, [daemonInfo, earnings, jobStats])

  useEffect(() => {
    if (hasTrackedTrustView.current || loading) return
    hasTrackedTrustView.current = true
    trackProviderEarningsTrustEvent('provider_earnings_trust_surface_seen', {
      locale: language,
      sync_state: trustMetrics.syncState,
      uptime_confidence: trustMetrics.uptimeConfidence,
      has_partial_data: trustMetrics.hasPartialData,
      pending_sar: trustMetrics.pendingSar,
      estimated_sar: trustMetrics.estimatedSar,
    })
  }, [language, loading, trustMetrics])

  const maxDailyEarning = Math.max(...daily.map(d => d.earned_halala), 1)

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="provider" userName={providerName}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">{t('provider.earnings_history_title')}</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">{t('provider.earnings_history_desc')}</p>
          </div>
          <button onClick={fetchAll} className="btn btn-secondary text-sm">
            {t('provider.refresh')}
          </button>
        </div>

        <div className="rounded-xl border border-dc1-amber/20 bg-dc1-surface-l2 p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">{t('register.provider.next_action_title')}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <Link href="/setup" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              1. {t('register.provider.install_title')}
            </Link>
            <Link href="/provider/download" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              2. {t('register.provider.state.heartbeat.label')}
            </Link>
            <Link href="/provider/jobs" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              3. {t('register.provider.state.ready.label')}
            </Link>
            <span className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 px-3 py-2 text-dc1-amber">
              4. {t('nav.earnings')}
            </span>
          </div>
        </div>

        {(trustMetrics.syncState === 'delayed' || trustMetrics.syncState === 'stale' || trustMetrics.hasPartialData) && (
          <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-4">
            <p className="text-sm font-semibold text-status-warning">
              {trustMetrics.syncState === 'stale'
                ? t('provider.earnings_trust.sync_stale_title')
                : trustMetrics.syncState === 'delayed'
                  ? t('provider.earnings_trust.sync_delayed_title')
                  : t('provider.earnings_trust.sync_partial_title')}
            </p>
            <p className="text-xs text-dc1-text-secondary mt-1">
              {trustMetrics.syncState === 'stale'
                ? t('provider.earnings_trust.sync_stale_desc')
                : trustMetrics.syncState === 'delayed'
                  ? t('provider.earnings_trust.sync_delayed_desc')
                  : t('provider.earnings_trust.sync_partial_desc')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card border border-dc1-amber/25">
            <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-3">{t('provider.earnings_trust.split_title')}</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">
                <span className="text-dc1-text-secondary">{t('provider.earnings_trust.settled')}</span>
                <span className="font-semibold text-status-success">{trustMetrics.settledSar.toFixed(2)} SAR</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">
                <span className="text-dc1-text-secondary">{t('provider.earnings_trust.pending')}</span>
                <span className="font-semibold text-status-warning">{trustMetrics.pendingSar.toFixed(2)} SAR</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">
                <span className="text-dc1-text-secondary">{t('provider.earnings_trust.estimated')}</span>
                <span className="font-semibold text-dc1-amber">{trustMetrics.estimatedSar.toFixed(2)} SAR</span>
              </div>
            </div>
            <p className="text-xs text-dc1-text-muted mt-3">{t('provider.earnings_trust.split_note')}</p>
          </div>

          <div className="card border border-dc1-border">
            <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-3">{t('provider.earnings_trust.uptime_title')}</p>
            <div className={`rounded-lg border px-3 py-3 ${
              trustMetrics.uptimeConfidence === 'high'
                ? 'border-status-success/30 bg-status-success/10'
                : trustMetrics.uptimeConfidence === 'medium'
                  ? 'border-status-warning/30 bg-status-warning/10'
                  : 'border-status-error/30 bg-status-error/10'
            }`}>
              <p className="text-sm font-semibold text-dc1-text-primary">
                {t(`provider.earnings_trust.uptime_${trustMetrics.uptimeConfidence}`)}
              </p>
              <p className="text-xs text-dc1-text-secondary mt-1">
                {Number.isFinite(trustMetrics.heartbeatAgeMinutes)
                  ? t('provider.earnings_trust.uptime_heartbeat_age').replace('{minutes}', String(Math.round(trustMetrics.heartbeatAgeMinutes)))
                  : t('provider.earnings_trust.uptime_no_heartbeat')}
              </p>
            </div>
            <p className="text-xs text-dc1-text-muted mt-3">{t('provider.earnings_trust.uptime_note')}</p>
          </div>

          <div className="card border border-dc1-border">
            <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-3">{t('provider.earnings_trust.payout_title')}</p>
            <ol className="space-y-2 text-xs text-dc1-text-secondary">
              <li className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">{t('provider.earnings_trust.payout_step_settle')}</li>
              <li className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">{t('provider.earnings_trust.payout_step_request')}</li>
              <li className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">{t('provider.earnings_trust.payout_step_process')}</li>
              <li className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2">{t('provider.earnings_trust.payout_step_paid')}</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setTab('withdrawals')
                  trackProviderEarningsTrustEvent('provider_earnings_trust_cta_clicked', {
                    locale: language,
                    surface: 'payout_timeline',
                    destination: 'tab:withdrawals',
                    cta_tier: 'primary',
                    sync_state: trustMetrics.syncState,
                  })
                }}
                className="btn btn-primary btn-sm"
              >
                {t('provider.earnings_trust.payout_primary_cta')}
              </button>
              <Link
                href={trustMetrics.syncState === 'stale' ? '/docs/provider-guide#status-stale-restart-daemon' : '/support?category=billing&source=provider_earnings_trust#contact-form'}
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  trackProviderEarningsTrustEvent('provider_earnings_trust_cta_clicked', {
                    locale: language,
                    surface: 'payout_timeline',
                    destination: trustMetrics.syncState === 'stale'
                      ? '/docs/provider-guide#status-stale-restart-daemon'
                      : '/support?category=billing&source=provider_earnings_trust#contact-form',
                    cta_tier: 'secondary',
                    sync_state: trustMetrics.syncState,
                  })
                }
              >
                {trustMetrics.syncState === 'stale'
                  ? t('register.provider.status_matrix.guide_cta')
                  : t('register.provider.next_action_support_cta')}
              </Link>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {earnings && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t('provider.available')} value={`${earnings.available_sar.toFixed(2)} SAR`} accent="amber" />
            <StatCard label={t('provider.total_earnings')} value={`${earnings.total_earned_sar.toFixed(2)} SAR`} accent="success" />
            <StatCard label={t('provider.withdrawn')} value={`${earnings.withdrawn_sar.toFixed(2)} SAR`} accent="default" />
            <StatCard label={t('provider.jobs_completed')} value={String(earnings.total_jobs)} accent="info" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-dc1-surface-l2 rounded-xl p-1">
          {(['overview', 'jobs', 'daemon', 'withdrawals'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                tab === tabKey ? 'bg-dc1-amber/10 text-dc1-amber' : 'text-dc1-text-muted hover:text-dc1-text-secondary'
              }`}
            >
              {tabKey === 'overview'
                ? t('provider.tab_earnings')
                : tabKey === 'jobs'
                  ? t('provider.tab_job_history')
                  : tabKey === 'daemon'
                    ? t('provider.tab_daemon')
                    : t('provider.tab_withdrawals')}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Earnings Trend Chart */}
            <div className="card">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h3 className="text-sm font-semibold text-dc1-text-secondary">{t('provider.earnings_trend')}</h3>
                <div className="flex gap-1 bg-dc1-surface-l2 rounded-lg p-0.5">
                  {(['7d', '30d', '90d'] as TrendPeriod[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setTrendPeriod(p)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                        trendPeriod === p
                          ? 'bg-dc1-amber/10 text-dc1-amber'
                          : 'text-dc1-text-muted hover:text-dc1-text-secondary'
                      }`}
                    >
                      {t(`provider.period_${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              {trendLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" />
                </div>
              ) : trendData.length === 0 ? (
                <p className="text-dc1-text-muted text-sm py-8 text-center">No earnings data for this period.</p>
              ) : (
                <>
                  <EarningsTrendChart data={trendData} isRTL={isRTL} />
                  {/* Summary line */}
                  {(() => {
                    const totalHalala = trendData.reduce((s, d) => s + d.earnings_halala, 0)
                    const totalSar = (totalHalala / 100).toFixed(2)
                    const days = trendPeriod === '7d' ? 7 : trendPeriod === '30d' ? 30 : 90
                    const avgSar = (totalHalala / 100 / days).toFixed(2)
                    return (
                      <p className="text-xs text-dc1-text-muted mt-3">
                        Total: <span className="text-dc1-amber font-semibold">{totalSar} SAR</span>{' '}
                        over {days} days — avg <span className="text-dc1-text-secondary">{avgSar} SAR/day</span>
                      </p>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Daily chart */}
            <div className="card">
              <h3 className="text-sm text-dc1-text-secondary mb-4">Daily Earnings (Last 30 Days)</h3>
              {daily.length === 0 ? (
                <p className="text-dc1-text-muted text-sm">No earnings data yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {daily.slice(0, 14).map(d => (
                    <div key={d.day} className="flex items-center gap-3 text-xs">
                      <span className="text-dc1-text-muted w-20 shrink-0">{new Date(d.day + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <div className="flex-1 h-5 bg-dc1-surface-l2 rounded overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-dc1-amber/80 to-dc1-amber rounded"
                          style={{ width: `${Math.max(2, (d.earned_halala / maxDailyEarning) * 100)}%` }}
                        />
                      </div>
                      <span className="text-dc1-amber w-16 text-right">{d.earned_sar} SAR</span>
                      <span className="text-dc1-text-muted w-12 text-right">{d.completed}j</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            {jobStats && (
              <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                  <div className="text-2xl font-bold text-status-success">{jobStats.success_rate}%</div>
                  <div className="text-xs text-dc1-text-muted mt-1">Success Rate</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-status-info">{jobStats.completed_jobs}</div>
                  <div className="text-xs text-dc1-text-muted mt-1">Completed</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-status-error">{jobStats.failed_jobs}</div>
                  <div className="text-xs text-dc1-text-muted mt-1">Failed</div>
                </div>
              </div>
            )}

            {/* Earnings Projections */}
            <div className="card">
              <EarningsProjections />
            </div>
          </div>
        )}

        {/* Tab: Job History */}
        {tab === 'jobs' && (
          <div className="table-container">
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-dc1-text-muted">No jobs yet.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Renter</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>You Earned</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.id}>
                      <td className="text-sm text-dc1-text-secondary">
                        {j.completed_at ? new Date(j.completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="text-sm text-status-info">{(j.job_type || '').replace(/_/g, ' ')}</td>
                      <td className="text-sm text-dc1-text-secondary">{j.renter_name || '—'}</td>
                      <td className="text-sm text-dc1-text-secondary">{j.actual_duration_minutes ? `${j.actual_duration_minutes} min` : '—'}</td>
                      <td>
                        <StatusBadge status={j.status as any} size="sm" />
                        {j.error && <p className="text-xs text-status-error mt-1 truncate max-w-[150px]">{j.error}</p>}
                      </td>
                      <td className="text-dc1-amber font-semibold">
                        {j.status === 'completed' ? `${j.earned_sar} SAR` : '—'}
                      </td>
                      <td className="text-sm text-dc1-text-muted">{j.cost_sar} SAR</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab: Daemon */}
        {tab === 'daemon' && (
          <div className="space-y-4">
            {/* Live Daemon Info Card */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-heading">Daemon Information</h3>
                {daemonInfo?.provider_status && (
                  <StatusBadge status={daemonInfo.provider_status as any} size="sm" />
                )}
              </div>
              {daemonInfo ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Daemon Version" value={daemonInfo.version || '—'} />
                    <InfoRow label="Hostname" value={daemonInfo.hostname || '—'} />
                    <InfoRow label="OS" value={daemonInfo.os || '—'} />
                    <InfoRow label="Python" value={daemonInfo.python || '—'} />
                    <InfoRow label="Last Heartbeat" value={daemonInfo.last_heartbeat ? new Date(daemonInfo.last_heartbeat).toLocaleString() : '—'} />
                    <InfoRow label="GPU Driver" value={daemonInfo.driver_version || '—'} />
                  </div>
                  {/* GPU stats from live heartbeat */}
                  {daemonInfo.gpu_name && (
                    <div className="border-t border-dc1-border pt-3">
                      <h4 className="text-xs text-dc1-amber/60 mb-2">GPU Status (Live)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <InfoRow label="GPU" value={daemonInfo.gpu_name} />
                        <InfoRow label="VRAM" value={daemonInfo.gpu_vram_mib ? `${daemonInfo.free_vram_mib || 0} / ${daemonInfo.gpu_vram_mib} MiB free` : '—'} />
                        <InfoRow label="Temperature" value={daemonInfo.gpu_temp_c != null ? `${daemonInfo.gpu_temp_c}°C` : '—'} />
                        <InfoRow label="Utilization" value={daemonInfo.gpu_util_pct != null ? `${daemonInfo.gpu_util_pct}%` : '—'} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-dc1-text-muted text-sm">No heartbeat received yet. Start the daemon to see info here.</p>
              )}
            </div>

            {/* Event Log */}
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-dc1-border">
                <h3 className="section-heading">Recent Daemon Events</h3>
              </div>
              {daemonEvents.length === 0 ? (
                <div className="p-6 text-center text-dc1-text-muted text-sm">No events logged yet.</div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {daemonEvents.map(ev => (
                    <div key={ev.id} className="px-6 py-3 border-b border-dc1-border/50 hover:bg-dc1-surface-l2 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          ev.severity === 'error' || ev.severity === 'critical' ? 'bg-status-error' :
                          ev.severity === 'warning' ? 'bg-status-warning' : 'bg-status-success'
                        }`} />
                        <span className="text-xs font-medium text-dc1-text-primary">{ev.event_type}</span>
                        <StatusBadge status={ev.severity === 'error' || ev.severity === 'critical' ? 'failed' : ev.severity === 'warning' ? 'paused' : 'online'} size="sm" />
                        {ev.daemon_version && <span className="text-[10px] text-dc1-text-muted">v{ev.daemon_version}</span>}
                        <span className="text-[10px] text-dc1-text-muted ml-auto">{ev.event_timestamp ? new Date(ev.event_timestamp).toLocaleString() : ''}</span>
                      </div>
                      {ev.details && (
                        <pre className="text-[11px] text-dc1-text-muted mt-1 whitespace-pre-wrap break-words max-h-16 overflow-hidden">{ev.details.substring(0, 300)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Withdrawals */}
        {tab === 'withdrawals' && (
          <div className="space-y-4">
            {/* Success banner */}
            {withdrawSuccess && (
              <div className="rounded-xl px-4 py-3 bg-status-success/10 border border-status-success/30 text-status-success text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('provider.withdraw.success')}
              </div>
            )}

            {/* Balance card */}
            {earnings && (
              <div className="card bg-gradient-to-r from-dc1-amber/10 to-transparent border-dc1-amber/20">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-dc1-text-secondary text-sm">{t('provider.withdraw')}</div>
                    <div className="text-3xl font-bold text-dc1-amber mt-1">{earnings.available_sar.toFixed(2)} SAR</div>
                    <div className="text-xs text-dc1-text-muted mt-1">Min withdrawal: 10 SAR</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {earnings.pending_withdrawal_sar > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-status-warning">
                          {t('provider.withdrawal_pending').replace('{amount}', earnings.pending_withdrawal_sar.toFixed(2))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setWithdrawError(null)
                        setWithdrawAmountSar(earnings.available_sar >= 10 ? earnings.available_sar.toFixed(2) : '')
                        setShowWithdrawModal(true)
                      }}
                      disabled={earnings.available_sar < 10}
                      className="btn btn-primary text-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('provider.withdraw')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Withdrawal request form */}
            <div className="card space-y-4">
              <h3 className="section-heading">{t('provider.withdraw')}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-dc1-text-secondary">Amount (SAR)</span>
                  <input
                    type="number"
                    min={10}
                    step={0.01}
                    max={earnings ? earnings.available_sar : undefined}
                    value={withdrawAmountSar}
                    onChange={(e) => setWithdrawAmountSar(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-primary focus:outline-none focus:ring-2 focus:ring-dc1-amber/40"
                    placeholder="10.00"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-dc1-text-secondary">{t('provider.iban')}</span>
                  <input
                    type="text"
                    value={withdrawIban}
                    onChange={(e) => setWithdrawIban(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-primary uppercase focus:outline-none focus:ring-2 focus:ring-dc1-amber/40"
                    placeholder="SA0000000000000000000000"
                  />
                </label>
              </div>
              {withdrawError && (
                <div className="rounded-lg px-3 py-2 bg-status-error/10 border border-status-error/30 text-status-error text-xs">
                  {withdrawError}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={!earnings || earnings.available_sar < 10 || withdrawLoading}
                  className="btn btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('provider.withdraw')}
                </button>
              </div>
            </div>

            {/* Withdrawal History */}
            <div className="table-container">
              <div className="px-4 py-3 border-b border-dc1-border">
                <h3 className="section-heading">{t('provider.withdrawal_history')}</h3>
              </div>
              {withdrawals.length === 0 ? (
                <div className="p-6 text-center text-dc1-text-muted text-sm">No withdrawals yet.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>{t('provider.iban')}</th>
                      <th>Status</th>
                      <th>Admin Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map(w => (
                      <tr key={w.id}>
                        <td className="text-sm text-dc1-text-secondary">{new Date(w.created_at).toLocaleDateString()}</td>
                        <td className="text-dc1-amber font-semibold">{(w.amount_halala / 100).toFixed(2)} SAR</td>
                        <td className="text-sm text-dc1-text-secondary font-mono">{maskIban(w.iban)}</td>
                        <td>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(w.status)}`}>
                            {statusLabel(w.status)}
                          </span>
                        </td>
                        <td className="text-sm text-dc1-text-secondary">{w.admin_note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Withdrawal confirmation modal */}
        {showWithdrawModal && earnings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-dc1-surface-l1 border border-dc1-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <h2 className="text-lg font-bold text-dc1-text-primary mb-2">Confirm Withdrawal</h2>
              <p className="text-dc1-text-secondary text-sm mb-6">
                {t('provider.withdraw.confirm').replace('{amount}', withdrawAmountSar || '0')}
              </p>
              <div className="mb-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="font-semibold text-dc1-text-primary">{withdrawAmountSar || '0.00'} SAR</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('provider.iban')}</span>
                  <span className="font-mono text-dc1-text-primary">{withdrawIban.trim() ? maskIban(withdrawIban) : '—'}</span>
                </div>
              </div>
              {withdrawError && (
                <div className="mb-4 rounded-lg px-3 py-2 bg-status-error/10 border border-status-error/30 text-status-error text-xs">
                  {withdrawError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={withdrawLoading}
                  className="btn btn-secondary flex-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawLoading}
                  className="btn btn-primary flex-1 text-sm"
                >
                  {withdrawLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      Processing…
                    </span>
                  ) : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
