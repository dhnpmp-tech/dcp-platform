'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────
interface DailySpend {
  day: string
  total_halala: number
  job_count: number
}

interface StatusCount {
  status: string
  count: number
}

interface TopGpu {
  gpu_model: string
  job_count: number
  total_halala: number
}

interface AnalyticsData {
  period: string
  daily_spend: DailySpend[]
  status_counts: StatusCount[]
  avg_duration_minutes: number | null
  completed_job_count: number
  top_gpus: TopGpu[]
}

type Period = '7d' | '30d' | '90d'

// ── Nav Icons ──────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)

// ── SVG Donut Chart ────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#F5A524',
  pending: '#6b7280',
}

function DonutChart({ counts }: { counts: StatusCount[] }) {
  const total = counts.reduce((s, c) => s + c.count, 0)
  if (total === 0) return <p className="text-dc1-text-muted text-sm">No jobs yet.</p>

  const r = 54
  const cx = 70
  const cy = 70
  const circ = 2 * Math.PI * r

  let offset = 0
  const slices = counts.map(c => {
    const pct = c.count / total
    const dash = pct * circ
    const slice = { ...c, dash, offset, pct }
    offset += dash
    return slice
  })

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width="140" height="140" role="img" aria-label="Job status donut chart">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth="20" />
        {slices.map(s => (
          <circle
            key={s.status}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={STATUS_COLORS[s.status] ?? '#6b7280'}
            strokeWidth="20"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset + circ * 0.25}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#f5f5f5" fontSize="20" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#888" fontSize="10">jobs</text>
      </svg>
      <ul className="space-y-2 min-w-[140px]" aria-label="Job status legend">
        {slices.map(s => (
          <li key={s.status} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: STATUS_COLORS[s.status] ?? '#6b7280' }}
              aria-hidden="true"
            />
            <span className="text-sm text-dc1-text-primary capitalize">{s.status}</span>
            <span className="text-sm text-dc1-text-muted ml-auto">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Spend Bar Chart ────────────────────────────────────────────────
function SpendBarChart({ data, period }: { data: DailySpend[], period: Period }) {
  if (!data.length) return <p className="text-dc1-text-muted text-sm">No spend data for this period.</p>

  const maxHalala = Math.max(...data.map(d => d.total_halala), 1)
  const CHART_H = 120

  const formatLabel = (day: string) => {
    const d = new Date(day + 'T00:00:00')
    if (period === '7d') return d.toLocaleDateString('en-US', { weekday: 'short' })
    if (period === '30d') return String(d.getDate())
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // For 90d, group into weeks to avoid clutter
  const displayData = period === '90d'
    ? (() => {
        const weeks: { label: string; total_halala: number; job_count: number }[] = []
        for (let i = 0; i < data.length; i += 7) {
          const chunk = data.slice(i, i + 7)
          const start = new Date(chunk[0].day + 'T00:00:00')
          weeks.push({
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            total_halala: chunk.reduce((s, d) => s + d.total_halala, 0),
            job_count: chunk.reduce((s, d) => s + d.job_count, 0),
          })
        }
        return weeks
      })()
    : data.map(d => ({ label: formatLabel(d.day), total_halala: d.total_halala, job_count: d.job_count }))

  const maxVal = Math.max(...displayData.map(d => d.total_halala), 1)

  return (
    <div className="overflow-x-auto">
      <div
        className="flex items-end gap-1 min-w-0"
        style={{ height: CHART_H + 36 }}
        role="img"
        aria-label={`Spend bar chart for last ${period}`}
      >
        {displayData.map((d, i) => {
          const barH = Math.max(3, (d.total_halala / maxVal) * CHART_H)
          const sar = (d.total_halala / 100).toFixed(2)
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 group min-w-[18px]">
              {d.total_halala > 0 && (
                <span className="text-[9px] text-dc1-amber opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {sar}
                </span>
              )}
              <div
                className="w-full rounded-t bg-gradient-to-t from-amber-600/70 to-amber-400 transition-all group-hover:from-amber-500/90 group-hover:to-amber-300"
                style={{ height: barH }}
                title={`${sar} SAR — ${d.job_count} job${d.job_count !== 1 ? 's' : ''}`}
              />
              <span className="text-[9px] text-dc1-text-muted mt-1 truncate w-full text-center">
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── GPU Horizontal Bar Chart ───────────────────────────────────────
function GpuChart({ gpus }: { gpus: TopGpu[] }) {
  if (!gpus.length) return <p className="text-dc1-text-muted text-sm">No GPU usage data yet.</p>

  const max = Math.max(...gpus.map(g => g.job_count), 1)

  return (
    <ul className="space-y-3" aria-label="Top GPU models">
      {gpus.map(g => {
        const pct = (g.job_count / max) * 100
        const sar = (g.total_halala / 100).toFixed(2)
        return (
          <li key={g.gpu_model}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-dc1-text-primary truncate max-w-[60%]">{g.gpu_model}</span>
              <span className="text-xs text-dc1-text-muted">
                {g.job_count} job{g.job_count !== 1 ? 's' : ''} — {sar} SAR
              </span>
            </div>
            <div className="h-2 bg-dc1-surface-l2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={g.job_count} aria-valuemax={max}>
              <div
                className="h-full bg-amber-400/80 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function RenterAnalyticsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [renterName, setRenterName] = useState('')
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]

  const fetchAnalytics = useCallback(async (key: string, p: Period) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/renters/me/analytics?key=${encodeURIComponent(key)}&period=${p}`)
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch analytics')
      const data = await res.json()
      setAnalytics(data)
    } catch {
      setError('Failed to load analytics data.')
    } finally {
      setLoading(false)
    }
  }, [router])

  // Also fetch renter name for sidebar
  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.renter?.name) setRenterName(d.renter.name) })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    fetchAnalytics(key, period)
  }, [period, fetchAnalytics, router])

  // ── Derived Stats ────────────────────────────────────────────────
  const totalSpentHalala = analytics?.daily_spend.reduce((s, d) => s + d.total_halala, 0) ?? 0
  const totalJobs = analytics?.daily_spend.reduce((s, d) => s + d.job_count, 0) ?? 0
  const completedCount = analytics?.status_counts.find(s => s.status === 'completed')?.count ?? 0
  const allCount = analytics?.status_counts.reduce((s, c) => s + c.count, 0) ?? 0
  const successRate = allCount > 0 ? Math.round((completedCount / allCount) * 100) : 0
  const avgDurMin = analytics?.avg_duration_minutes

  const formatDuration = (mins: number | null) => {
    if (mins == null) return '—'
    if (mins < 1) return '<1 min'
    if (mins < 60) return `${mins} min`
    return `${(mins / 60).toFixed(1)} hr`
  }

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterName || 'Renter'}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">{t('renter.analytics.title')}</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">{t('renter.analytics.subtitle')}</p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Time period">
            {(['7d', '30d', '90d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-dc1-amber text-dc1-void'
                    : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
                aria-pressed={period === p}
              >
                {p === '7d' ? t('provider.period_7d') : p === '30d' ? t('provider.period_30d') : t('provider.period_90d')}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && analytics && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={`Spend (${period})`}
                value={`${(totalSpentHalala / 100).toFixed(2)} SAR`}
                accent="amber"
              />
              <StatCard
                label={`Jobs (${period})`}
                value={String(totalJobs)}
                accent="default"
              />
              <StatCard
                label={t('renter.analytics.success_rate')}
                value={allCount > 0 ? `${successRate}%` : '—'}
                accent="success"
              />
              <StatCard
                label={t('renter.analytics.avg_duration')}
                value={formatDuration(avgDurMin ?? null)}
                accent="info"
              />
            </div>

            {/* Spend Chart */}
            <div className="card">
              <h2 className="text-base font-semibold text-dc1-text-primary mb-4">
                {t('renter.analytics.spend_history')}
              </h2>
              <SpendBarChart data={analytics.daily_spend} period={period} />
            </div>

            {/* Status + GPU row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Job Status Donut */}
              <div className="card">
                <h2 className="text-base font-semibold text-dc1-text-primary mb-4">{t('renter.analytics.jobs_by_status')}</h2>
                <DonutChart counts={analytics.status_counts} />
              </div>

              {/* Top GPUs */}
              <div className="card">
                <h2 className="text-base font-semibold text-dc1-text-primary mb-4">{t('renter.analytics.top_gpu_models')}</h2>
                <GpuChart gpus={analytics.top_gpus} />
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
