'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import DashboardLayout from '../components/layout/DashboardLayout'
import StatCard from '../components/ui/StatCard'
import SpendingCard from '../components/ui/SpendingCard'
import SpendingAnalyticsCard from '../components/SpendingAnalyticsCard'
import JobCard, { type Job } from '../components/JobCard'
import QuickRedeployModal, { type Job as ModalJob } from '../components/modals/QuickRedeployModal'
import { useLanguage } from '../lib/i18n'

const API_BASE = '/api'

interface RenterProfile {
  name: string
  balance_halala: number
  total_spent_halala: number
  total_jobs: number
}

interface DailySpend {
  day: string
  total_halala: number
  job_count: number
}

// DCP-917 spending summary shape
interface SpendingSummary {
  total_jobs_this_month: number
  total_spent_halala: number
  total_tokens_used: number
  last_30_days: Array<{ date: string; spent_halala: number; job_count: number }>
}

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

type StatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'pending' | 'queued' | 'cancelled'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const ACTIVE_STATUSES = new Set(['pending', 'queued', 'running'])

function getMonthSpend(jobs: Job[]): number {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return jobs
    .filter(j => TERMINAL_STATUSES.has(j.status) && new Date(j.submitted_at) >= startOfMonth)
    .reduce((s, j) => s + (j.actual_cost_halala ?? 0), 0)
}

function projectMonthEnd(monthSpend: number): number {
  const now = new Date()
  const dayOfMonth = now.getDate()
  if (dayOfMonth === 0) return monthSpend
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.round((monthSpend / dayOfMonth) * daysInMonth)
}

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(2)
}

export default function RenterDashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [renterKey, setRenterKey] = useState<string>('')
  const [profile, setProfile] = useState<RenterProfile | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [dailySpend, setDailySpend] = useState<DailySpend[]>([])
  const [spending, setSpending] = useState<SpendingSummary | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [redeployJob, setRedeployJob] = useState<Job | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/dashboard/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]

  const fetchData = useCallback(async (key: string) => {
    setLoadingProfile(true)
    setLoadingJobs(true)

    const [profileRes, jobsRes, analyticsRes, spendingRes] = await Promise.allSettled([
      fetch(`${API_BASE}/renters/me`, { headers: { 'X-Renter-Key': key } }),
      fetch(`${API_BASE}/jobs/history`, { headers: { 'X-Renter-Key': key } }),
      fetch(`${API_BASE}/renters/me/analytics?period=30d`, { headers: { 'X-Renter-Key': key } }),
      fetch(`${API_BASE}/renters/me/spending`, { headers: { 'X-Renter-Key': key } }),
    ])

    if (profileRes.status === 'fulfilled') {
      const res = profileRes.value
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (res.ok) {
        const data = await res.json()
        setProfile(data.renter)
      } else {
        setError('Failed to load account data.')
      }
    }
    setLoadingProfile(false)

    if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {
      const data = await jobsRes.value.json()
      setJobs(data.jobs ?? [])
    }
    setLoadingJobs(false)

    if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
      const data = await analyticsRes.value.json()
      setDailySpend(data.daily_spend ?? [])
    }

    if (spendingRes.status === 'fulfilled' && spendingRes.value.ok) {
      const data = await spendingRes.value.json()
      setSpending(data)
    }
  }, [router])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    setRenterKey(key)
    fetchData(key)
  }, [fetchData, router])

  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE_STATUSES.has(j.status))
    if (!hasActive || !renterKey) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/history`, { headers: { 'X-Renter-Key': renterKey } })
        if (res.ok) {
          const data = await res.json()
          setJobs(data.jobs ?? [])
        }
      } catch { /* non-fatal */ }
    }, 15_000)
    return () => clearInterval(id)
  }, [jobs, renterKey])

  const activeJobs = jobs.filter(j => ACTIVE_STATUSES.has(j.status))
  const historyJobs = jobs.filter(j => TERMINAL_STATUSES.has(j.status))
  const completedCount = jobs.filter(j => j.status === 'completed').length
  const monthSpendHalala = getMonthSpend(jobs)
  const projectedHalala = projectMonthEnd(monthSpendHalala)

  const filteredHistory = statusFilter === 'all' ? historyJobs : historyJobs.filter(j => j.status === statusFilter)
  const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE)
  const pagedHistory = filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const filterCounts: Partial<Record<StatusFilter, number>> = {}
  for (const s of ['completed', 'failed', 'cancelled'] as StatusFilter[]) {
    filterCounts[s] = historyJobs.filter(j => j.status === s).length
  }

  const handleRedeploy = useCallback((job: Job) => setRedeployJob(job), [])

  if (error && !profile) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName="Renter">
        <div className="card p-8 text-center">
          <p className="text-status-error mb-4">{error}</p>
          <button onClick={() => { if (renterKey) fetchData(renterKey) }} className="btn btn-primary text-sm py-2 px-4">
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (loadingProfile) {
    return (
      <DashboardLayout navItems={navItems} role="renter">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading dashboard" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={profile?.name ?? 'Renter'}>
      <div className="space-y-8">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">
              {profile?.name ? `Welcome back, ${profile.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="text-dc1-text-secondary text-sm mt-1">Track your GPU jobs, spending, and account balance.</p>
          </div>
          <Link href="/renter/marketplace" className="btn btn-primary text-sm py-2 px-4 flex-shrink-0">
            + New Deployment
          </Link>
        </div>

        {/* Spending analytics card */}
        {profile && (
          <SpendingAnalyticsCard
            balanceHalala={profile.balance_halala ?? 0}
            monthSpendHalala={monthSpendHalala}
            dailySpend={dailySpend}
          />
        )}

        {/* DCP-918: 30-day spending summary card */}
        {spending && (
          <SpendingCard
            totalSpentHalala={spending.total_spent_halala}
            totalJobs={spending.total_jobs_this_month}
            totalTokens={spending.total_tokens_used}
            last30Days={spending.last_30_days}
          />
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Jobs" value={String(jobs.length)} accent="default" />
          <StatCard label="Completed" value={String(completedCount)} accent="success" />
          <StatCard label="This Month" value={`${formatSAR(monthSpendHalala)} SAR`} accent="amber" />
          <StatCard
            label="Projected"
            value={monthSpendHalala > 0 ? `${formatSAR(projectedHalala)} SAR` : '—'}
            accent="info"
          />
        </div>

        {/* Active jobs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-dc1-text-primary flex items-center gap-2">
              Active Jobs
              {activeJobs.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-dc1-amber text-dc1-void rounded-full">
                  {activeJobs.length}
                </span>
              )}
            </h2>
            {activeJobs.length > 0 && (
              <span className="text-xs text-dc1-text-muted animate-pulse">● Live</span>
            )}
          </div>
          {loadingJobs ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" />
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="card p-6 text-center text-dc1-text-muted text-sm">
              No active jobs.{' '}
              <Link href="/renter/marketplace" className="text-dc1-amber hover:underline">Browse models →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeJobs.map(job => (
                <JobCard key={job.job_id} job={job} renterKey={renterKey} onRedeploy={handleRedeploy} compact={false} />
              ))}
            </div>
          )}
        </section>

        {/* Job history */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold text-dc1-text-primary">Job History</h2>
            <button
              onClick={async () => {
                if (!renterKey) return
                try {
                  const res = await fetch(`${API_BASE}/renters/me/jobs/export`, { headers: { 'X-Renter-Key': renterKey } })
                  if (!res.ok) return
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'jobs.csv'; a.click()
                  URL.revokeObjectURL(url)
                } catch { /* non-fatal */ }
              }}
              className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary underline-offset-2 hover:underline transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by status">
            {(['all', 'completed', 'failed', 'cancelled'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => { setStatusFilter(f); setPage(1) }}
                className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                  statusFilter === f
                    ? 'bg-dc1-amber text-dc1-void'
                    : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary border border-dc1-border'
                }`}
                aria-pressed={statusFilter === f}
              >
                {f}
                {f !== 'all' && filterCounts[f] != null && (
                  <span className="ms-1 opacity-70">({filterCounts[f]})</span>
                )}
              </button>
            ))}
          </div>

          {loadingJobs ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" />
            </div>
          ) : pagedHistory.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-dc1-text-muted text-sm">
                {historyJobs.length === 0
                  ? 'No job history yet. Deploy your first model to get started.'
                  : `No ${statusFilter} jobs.`}
              </p>
              {historyJobs.length === 0 && (
                <Link href="/renter/marketplace" className="btn btn-primary inline-flex mt-4 text-sm py-2 px-4">
                  Browse Marketplace
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pagedHistory.map(job => (
                  <JobCard key={job.job_id} job={job} renterKey={renterKey} onRedeploy={handleRedeploy} compact />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded text-xs bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border hover:text-dc1-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-dc1-text-muted">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded text-xs bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border hover:text-dc1-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </section>

      </div>

      {redeployJob && (
        <QuickRedeployModal
          job={redeployJob as unknown as ModalJob}
          onClose={() => setRedeployJob(null)}
          onSuccess={() => {
            setRedeployJob(null)
            if (renterKey) fetchData(renterKey)
          }}
        />
      )}
    </DashboardLayout>
  )
}
