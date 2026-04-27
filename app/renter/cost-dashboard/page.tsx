'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'
import QuickRedeployModal from '../../components/modals/QuickRedeployModal'
import WalletTopUpModal from '../../components/modals/WalletTopUpModal'

const API_BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────

interface RenterData {
  renter: {
    name: string
    balance_halala: number
    total_spent_halala: number
    total_jobs: number
  }
}

interface Job {
  id: number
  job_id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  submitted_at: string
  started_at?: string
  completed_at?: string
  actual_cost_halala: number
  actual_duration_minutes?: number
  params?: string | null
  container_spec?: string | null
}

interface JobsResponse {
  jobs: Job[]
  total?: number
}

interface DailySpend {
  day: string
  total_halala: number
  job_count: number
}

// ── Helpers ────────────────────────────────────────────────────────

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(2)
}

function formatDuration(mins?: number): string {
  if (!mins) return '—'
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${Math.round(mins)} min`
  return `${(mins / 60).toFixed(1)} hr`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getModelLabel(job: Job): string {
  if (job.params) {
    try {
      const p = JSON.parse(job.params)
      if (p.model) return p.model
      if (p.gpu_model) return p.gpu_model
    } catch { /* noop */ }
  }
  if (job.container_spec) {
    try {
      const c = JSON.parse(job.container_spec)
      if (c.image) return c.image.split('/').pop()?.split(':')[0] ?? job.job_type
    } catch { /* noop */ }
  }
  return job.job_type ?? 'GPU Job'
}

// ── SVG Icons ──────────────────────────────────────────────────────

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
const CostIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// ── Status Badge ───────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-status-success/15 text-status-success',
  failed:    'bg-status-error/15 text-status-error',
  running:   'bg-dc1-amber/15 text-dc1-amber',
  pending:   'bg-dc1-text-muted/15 text-dc1-text-muted',
  cancelled: 'bg-dc1-text-muted/15 text-dc1-text-muted',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[status] ?? 'bg-dc1-surface-l3 text-dc1-text-secondary'}`}>
      {status}
    </span>
  )
}

// ── WalletBalanceCard ──────────────────────────────────────────────

interface WalletBalanceCardProps {
  balanceHalala: number
  totalSpentHalala: number
  onTopUp: () => void
}

function WalletBalanceCard({ balanceHalala, totalSpentHalala, onTopUp }: WalletBalanceCardProps) {
  const isLow = balanceHalala < 1000 // < 10 SAR
  const isCritical = balanceHalala < 200 // < 2 SAR

  return (
    <div className={`bg-dc1-surface-l1 border rounded-lg p-6 transition-all ${
      isCritical ? 'border-status-error/50' : isLow ? 'border-status-warning/50' : 'border-dc1-border hover:border-dc1-border-light'
    }`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-dc1-text-secondary mb-1">Wallet Balance</p>
          <p className={`text-3xl font-bold ${isCritical ? 'text-status-error' : isLow ? 'text-status-warning' : 'text-dc1-amber'}`}>
            {formatSAR(balanceHalala)} SAR
          </p>
          {isLow && (
            <p className={`text-xs mt-1 ${isCritical ? 'text-status-error' : 'text-status-warning'}`}>
              {isCritical ? '⚠ Critical: balance very low' : '⚠ Balance running low'}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-dc1-text-secondary mb-1">Total Spent</p>
          <p className="text-xl font-semibold text-dc1-text-primary">{formatSAR(totalSpentHalala)} SAR</p>
        </div>
      </div>
      <div className="mt-4">
        <button
          onClick={onTopUp}
          className="btn btn-primary inline-flex items-center gap-2 text-sm py-2 px-4"
          aria-label="Top up wallet"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Top Up
        </button>
      </div>
    </div>
  )
}

// ── CostBreakdownChart ─────────────────────────────────────────────

function CostBreakdownChart({ data }: { data: DailySpend[] }) {
  if (!data.length || data.every(d => d.total_halala === 0)) {
    return (
      <div className="flex items-center justify-center h-32 text-dc1-text-muted text-sm">
        No spend data for this period.
      </div>
    )
  }

  const CHART_H = 120
  const maxVal = Math.max(...data.map(d => d.total_halala), 1)

  // Show last 30 days; for longer periods group into weeks
  const displayData = data.length > 35
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
    : data.map(d => {
        const date = new Date(d.day + 'T00:00:00')
        return {
          label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          total_halala: d.total_halala,
          job_count: d.job_count,
        }
      })

  const maxDisplayVal = Math.max(...displayData.map(d => d.total_halala), 1)

  return (
    <div className="overflow-x-auto">
      <div
        className="flex items-end gap-1 min-w-0"
        style={{ height: CHART_H + 36 }}
        role="img"
        aria-label="Daily spend bar chart"
      >
        {displayData.map((d, i) => {
          const barH = Math.max(3, (d.total_halala / maxDisplayVal) * CHART_H)
          const sar = formatSAR(d.total_halala)
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-0.5 group min-w-[18px]"
            >
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

// ── JobHistoryItem ─────────────────────────────────────────────────

interface JobHistoryItemProps {
  job: Job
  onRedeploy: (job: Job) => void
}

function JobHistoryItem({ job, onRedeploy }: JobHistoryItemProps) {
  const model = getModelLabel(job)
  const costSAR = formatSAR(job.actual_cost_halala ?? 0)
  const duration = formatDuration(job.actual_duration_minutes)
  const submitted = formatDate(job.submitted_at)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-dc1-surface-l2 border border-dc1-border rounded-lg hover:border-dc1-border-light transition-all group">
      {/* Status + Model */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <StatusPill status={job.status} />
          <span className="text-sm font-medium text-dc1-text-primary truncate">{model}</span>
        </div>
        <p className="text-xs text-dc1-text-muted">{submitted}</p>
      </div>

      {/* Duration + Cost */}
      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-right sm:text-center">
          <p className="text-xs text-dc1-text-muted">Duration</p>
          <p className="text-sm font-medium text-dc1-text-primary">{duration}</p>
        </div>
        <div className="text-right sm:text-center min-w-[72px]">
          <p className="text-xs text-dc1-text-muted">Cost</p>
          <p className="text-sm font-semibold text-dc1-amber">{costSAR} SAR</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/renter/jobs/${job.job_id}`}
          className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary transition-colors underline-offset-2 hover:underline"
          aria-label={`View job ${job.job_id} details`}
        >
          Details
        </Link>
        {(job.status === 'completed' || job.status === 'failed') && job.params && (
          <button
            onClick={() => onRedeploy(job)}
            className="text-xs px-3 py-1.5 rounded bg-dc1-surface-l3 text-dc1-text-primary hover:bg-dc1-amber/10 hover:text-dc1-amber border border-dc1-border hover:border-dc1-amber/40 transition-all"
            aria-label={`Redeploy job ${job.job_id}`}
          >
            Redeploy
          </button>
        )}
      </div>
    </div>
  )
}

// ── JobHistoryList ─────────────────────────────────────────────────

type StatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'pending'

interface JobHistoryListProps {
  jobs: Job[]
  loading: boolean
  onRedeploy: (job: Job) => void
}

function JobHistoryList({ jobs, loading, onRedeploy }: JobHistoryListProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)
  const filters: StatusFilter[] = ['all', 'completed', 'failed', 'running', 'pending']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading jobs" />
      </div>
    )
  }

  return (
    <div>
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by status">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-dc1-amber text-dc1-void'
                : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary border border-dc1-border'
            }`}
            aria-pressed={filter === f}
          >
            {f}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">
                ({jobs.filter(j => j.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-dc1-text-muted text-sm">
            {jobs.length === 0
              ? 'No jobs yet. Deploy a model to get started.'
              : `No ${filter} jobs.`}
          </p>
          {jobs.length === 0 && (
            <Link href="/renter/marketplace" className="btn btn-primary inline-flex mt-4 text-sm py-2 px-4">
              Browse Marketplace
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => (
            <JobHistoryItem key={job.job_id} job={job} onRedeploy={onRedeploy} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── CostDashboardPage ──────────────────────────────────────────────

export default function CostDashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [renterData, setRenterData] = useState<RenterData['renter'] | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [dailySpend, setDailySpend] = useState<DailySpend[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [error, setError] = useState('')
  const [redeployJob, setRedeployJob] = useState<Job | null>(null)
  const [showTopUpModal, setShowTopUpModal] = useState(false)

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

  const fetchData = useCallback(async (key: string) => {
    const authHeaders = { 'X-Renter-Key': key }

    // Profile + balance
    setLoadingProfile(true)
    try {
      const res = await fetch(`${API_BASE}/renters/me`, { headers: authHeaders })
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch profile')
      const data: RenterData = await res.json()
      setRenterData(data.renter)
    } catch {
      setError('Failed to load account data.')
    } finally {
      setLoadingProfile(false)
    }

    // Job history
    setLoadingJobs(true)
    try {
      const res = await fetch(`${API_BASE}/jobs/history`, { headers: authHeaders })
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const data: JobsResponse = await res.json()
      setJobs(data.jobs ?? [])
    } catch {
      // non-fatal: show empty list
      setJobs([])
    } finally {
      setLoadingJobs(false)
    }

    // Daily spend for chart
    try {
      const res = await fetch(`${API_BASE}/renters/me/analytics?period=30d`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setDailySpend(data.daily_spend ?? [])
      }
    } catch { /* non-fatal */ }
  }, [router])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    fetchData(key)
  }, [fetchData, router])

  // ── Redeploy handler ─────────────────────────────────────────────

  const handleRedeploy = useCallback((job: Job) => {
    setRedeployJob(job)
  }, [])

  // ── Derived stats ────────────────────────────────────────────────

  const completedJobs = jobs.filter(j => j.status === 'completed').length
  const totalJobsCount = jobs.length
  const successRate = totalJobsCount > 0
    ? Math.round((completedJobs / totalJobsCount) * 100)
    : null

  const avgCostHalala = completedJobs > 0
    ? jobs.filter(j => j.status === 'completed').reduce((s, j) => s + (j.actual_cost_halala ?? 0), 0) / completedJobs
    : null

  if (error && !renterData) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName="Renter">
        <div className="card p-8 text-center">
          <p className="text-status-error">{error}</p>
          <button
            onClick={() => {
              const key = localStorage.getItem('dc1_renter_key')
              if (key) fetchData(key)
            }}
            className="btn btn-primary mt-4 text-sm py-2 px-4"
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterData?.name ?? 'Renter'}>
      <div className="space-y-8">

        {/* ── Page Header ─────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-dc1-text-primary">Cost History</h1>
          <p className="text-dc1-text-secondary text-sm mt-1">
            Track your spending and review past deployments.
          </p>
        </div>

        {/* ── Loading skeleton ─────────────────────────────────────── */}
        {loadingProfile && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading" />
          </div>
        )}

        {!loadingProfile && renterData && (
          <>
            {/* ── Wallet Balance Card ───────────────────────────────── */}
            <WalletBalanceCard
              balanceHalala={renterData.balance_halala ?? 0}
              totalSpentHalala={renterData.total_spent_halala ?? 0}
              onTopUp={() => setShowTopUpModal(true)}
            />

            {/* ── Summary Stat Cards ────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Jobs"
                value={String(totalJobsCount)}
                accent="default"
              />
              <StatCard
                label="Completed"
                value={String(completedJobs)}
                accent="success"
              />
              <StatCard
                label="Success Rate"
                value={successRate !== null ? `${successRate}%` : '—'}
                accent="info"
              />
              <StatCard
                label="Avg Job Cost"
                value={avgCostHalala !== null ? `${formatSAR(avgCostHalala)} SAR` : '—'}
                accent="amber"
              />
            </div>

            {/* ── Spend Chart (30d) ─────────────────────────────────── */}
            <div className="card">
              <h2 className="text-base font-semibold text-dc1-text-primary mb-4">
                Spend (Last 30 Days)
              </h2>
              <CostBreakdownChart data={dailySpend} />
            </div>

            {/* ── Job History ───────────────────────────────────────── */}
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-base font-semibold text-dc1-text-primary">Job History</h2>
                <button
                  onClick={async () => {
                    const key = localStorage.getItem('dc1_renter_key')
                    if (!key) return
                    const res = await fetch(`${API_BASE}/renters/me/jobs/export`, {
                      headers: { 'X-Renter-Key': key },
                    })
                    if (!res.ok) return
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'jobs.csv'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary transition-colors underline-offset-2 hover:underline"
                  aria-label="Download job history as CSV"
                >
                  Export CSV
                </button>
              </div>
              <JobHistoryList
                jobs={jobs}
                loading={loadingJobs}
                onRedeploy={handleRedeploy}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Quick-Redeploy Modal (Phase 2.0) ─────────────────────── */}
      {redeployJob && (
        <QuickRedeployModal
          job={redeployJob}
          onClose={() => setRedeployJob(null)}
          onSuccess={() => {
            const key = localStorage.getItem('dc1_renter_key')
            if (key) fetchData(key)
          }}
        />
      )}
    </DashboardLayout>
  )
}
