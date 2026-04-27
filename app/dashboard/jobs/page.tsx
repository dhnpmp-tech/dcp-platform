'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import DashboardLayout from '../../components/layout/DashboardLayout'
import { type Job } from '../../components/JobCard'

// NOTE: Backend should implement GET /api/renters/jobs returning provider_name,
// template_id, and enriched fields per DCP-889. Falling back to /api/jobs/history.
const API_BASE = '/api'
const PAGE_SIZE = 20

interface JobWithProvider extends Job {
  provider_name?: string
}

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
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getModelLabel(job: Job): string {
  if (job.params) {
    try {
      const p = JSON.parse(job.params)
      if (p.model) return p.model
      if (p.template_id) return p.template_id
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

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-status-success/15 text-status-success',
  failed:    'bg-status-error/15 text-status-error',
  running:   'bg-dc1-amber/15 text-dc1-amber',
  queued:    'bg-dc1-text-muted/15 text-dc1-text-muted',
  pending:   'bg-dc1-text-muted/15 text-dc1-text-muted',
  cancelled: 'bg-dc1-text-muted/15 text-dc1-text-muted',
}

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled'

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

export default function JobHistoryPage() {
  const router = useRouter()
  const [renterKey, setRenterKey] = useState('')
  const [jobs, setJobs] = useState<JobWithProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: <HomeIcon /> },
    { label: 'Marketplace', href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Playground', href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: 'Jobs', href: '/dashboard/jobs', icon: <JobsIcon /> },
    { label: 'Billing', href: '/renter/billing', icon: <BillingIcon /> },
    { label: 'Analytics', href: '/renter/analytics', icon: <ChartIcon /> },
    { label: 'Settings', href: '/renter/settings', icon: <GearIcon /> },
  ]

  const fetchJobs = useCallback(async (key: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/jobs/history`, {
        headers: { 'X-Renter-Key': key },
      })
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs ?? [])
      }
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [router])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    setRenterKey(key)
    fetchJobs(key)
  }, [fetchJobs, router])

  // Poll for active job status updates
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued' || j.status === 'pending')
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

  const filtered = statusFilter === 'all' ? jobs : jobs.filter(j => j.status === statusFilter)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const filterCounts: Partial<Record<StatusFilter, number>> = {
    running:   jobs.filter(j => j.status === 'running').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed:    jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">Job History</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">
              All past and active GPU jobs for your account.
            </p>
          </div>
          <Link href="/renter/marketplace" className="btn btn-primary text-sm py-2 px-4 flex-shrink-0">
            + New Deployment
          </Link>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter jobs by status">
          {(['all', 'running', 'completed', 'failed', 'cancelled'] as StatusFilter[]).map(f => (
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
              {f !== 'all' && filterCounts[f] != null && filterCounts[f]! > 0 && (
                <span className="ms-1 opacity-70">({filterCounts[f]})</span>
              )}
            </button>
          ))}
        </div>

        {/* Job table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin h-7 w-7 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading jobs" />
            </div>
          ) : paged.length === 0 ? (
            <div className="p-10 text-center text-dc1-text-muted text-sm">
              {jobs.length === 0 ? (
                <>
                  No jobs yet.{' '}
                  <Link href="/renter/marketplace" className="text-dc1-amber hover:underline">
                    Browse models →
                  </Link>
                </>
              ) : (
                `No ${statusFilter} jobs found.`
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dc1-border bg-dc1-surface-l2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Job ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Template / Model</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">GPU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Provider</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Duration</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Cost</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dc1-border">
                  {paged.map(job => (
                    <tr
                      key={job.job_id}
                      onClick={() => router.push(`/renter/jobs/${job.job_id}`)}
                      className="hover:bg-dc1-surface-l2 cursor-pointer transition-colors group"
                      role="link"
                      aria-label={`View details for job ${job.job_id}`}
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') router.push(`/renter/jobs/${job.job_id}`) }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-dc1-amber group-hover:text-amber-300 transition-colors">
                          {job.job_id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3 text-dc1-text-primary max-w-[180px] truncate">
                        {getModelLabel(job)}
                      </td>
                      <td className="px-4 py-3 text-dc1-text-secondary whitespace-nowrap">
                        {job.gpu_type ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-dc1-text-secondary whitespace-nowrap">
                        {job.provider_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[job.status] ?? 'bg-dc1-surface-l3 text-dc1-text-secondary'}`}>
                          {job.status === 'running' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-dc1-amber me-1.5 animate-pulse" />
                          )}
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-dc1-text-secondary whitespace-nowrap">
                        {formatDuration(job.actual_duration_minutes)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-dc1-text-primary whitespace-nowrap">
                        {job.actual_cost_halala > 0
                          ? <>{formatSAR(job.actual_cost_halala)} SAR</>
                          : <span className="text-dc1-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-dc1-text-muted text-xs whitespace-nowrap">
                        {formatDate(job.submitted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded text-xs bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border hover:text-dc1-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-dc1-text-muted">
              Page {page} of {totalPages} &middot; {filtered.length} jobs
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded text-xs bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border hover:text-dc1-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
