'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/layout/DashboardLayout'

const API_BASE = '/api'
const PLATFORM_FEE_RATE = 0.15

interface JobDetail {
  job_id: string
  model_id: string | null
  status: string
  lifecycle_status: string
  created_at: string
  completed_at: string | null
  token_count: number
  cost_halala: number
  cost_sar: number
  provider: {
    name: string | null
    gpu_model: string | null
  }
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-status-success/15 text-status-success',
  failed:    'bg-status-error/15 text-status-error',
  running:   'bg-dc1-amber/15 text-dc1-amber',
  assigned:  'bg-dc1-amber/15 text-dc1-amber',
  queued:    'bg-dc1-text-muted/15 text-dc1-text-muted',
  pending:   'bg-dc1-text-muted/15 text-dc1-text-muted',
  cancelled: 'bg-dc1-text-muted/15 text-dc1-text-muted',
}

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(4)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function getDuration(created: string, completed: string | null): string {
  if (!completed) return 'In progress'
  const ms = new Date(completed).getTime() - new Date(created).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function isWithin24h(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000
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

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams<{ jobId: string }>()
  const jobId = params?.jobId ?? ''

  const [renterKey, setRenterKey] = useState('')
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [disputeSubmitted, setDisputeSubmitted] = useState(false)

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: <HomeIcon /> },
    { label: 'Marketplace', href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Playground', href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: 'Jobs', href: '/dashboard/jobs', icon: <JobsIcon /> },
    { label: 'Billing', href: '/renter/billing', icon: <BillingIcon /> },
    { label: 'Analytics', href: '/renter/analytics', icon: <ChartIcon /> },
    { label: 'Settings', href: '/renter/settings', icon: <GearIcon /> },
  ]

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    setRenterKey(key)

    if (!jobId) return
    setLoading(true)
    fetch(`${API_BASE}/renters/me/jobs/${jobId}`, {
      headers: { 'X-Renter-Key': key },
    }).then(async res => {
      if (res.status === 401 || res.status === 404) {
        if (res.status === 401) {
          localStorage.removeItem('dc1_renter_key')
          router.push('/login')
          return
        }
        setError('Job not found.')
        return
      }
      if (!res.ok) {
        setError('Failed to load job details.')
        return
      }
      const data = await res.json()
      setJob(data)
    }).catch(() => {
      setError('Failed to load job details.')
    }).finally(() => setLoading(false))
  }, [jobId, router])

  const handleDispute = () => {
    // Stub: log dispute intent to console (full implementation in future sprint)
    console.log('[DCP-918] Dispute initiated for job:', jobId, {
      job_id: jobId,
      cost_halala: job?.cost_halala,
      timestamp: new Date().toISOString(),
    })
    setDisputeSubmitted(true)
  }

  // Cost breakdown: gross cost + 15% platform service fee
  const grossHalala = job?.cost_halala ?? 0
  const serviceFeeHalala = Math.round(grossHalala * PLATFORM_FEE_RATE)
  const totalHalala = grossHalala + serviceFeeHalala

  const canDispute =
    job?.status === 'completed' &&
    isWithin24h(job.completed_at) &&
    !disputeSubmitted

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="renter">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" aria-label="Loading job" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !job) {
    return (
      <DashboardLayout navItems={navItems} role="renter">
        <div className="card p-8 text-center">
          <p className="text-status-error mb-4">{error || 'Job not found.'}</p>
          <Link href="/dashboard" className="btn btn-primary text-sm py-2 px-4">
            ← Back to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6 max-w-3xl">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-dc1-text-muted" aria-label="Breadcrumb">
          <Link href="/dashboard" className="hover:text-dc1-text-primary transition-colors">Dashboard</Link>
          <span>/</span>
          <Link href="/dashboard/jobs" className="hover:text-dc1-text-primary transition-colors">Jobs</Link>
          <span>/</span>
          <span className="font-mono text-dc1-text-primary">{job.job_id.slice(0, 12)}…</span>
        </nav>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-dc1-text-primary">Job Details</h1>
            <p className="font-mono text-xs text-dc1-text-muted mt-1">{job.job_id}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_STYLES[job.status] ?? 'bg-dc1-surface-l3 text-dc1-text-secondary'}`}>
            {job.status === 'running' && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
            {job.status}
          </span>
        </div>

        {/* Details card */}
        <div className="card divide-y divide-dc1-border">
          <DetailRow label="Model" value={job.model_id ?? '—'} />
          <DetailRow label="Provider" value={job.provider.name ?? 'DCP Network'} />
          <DetailRow label="GPU" value={job.provider.gpu_model ?? '—'} />
          <DetailRow label="Submitted" value={formatDate(job.created_at)} />
          <DetailRow label="Completed" value={formatDate(job.completed_at)} />
          <DetailRow label="Duration" value={getDuration(job.created_at, job.completed_at)} />
          <DetailRow label="Tokens Processed" value={job.token_count > 0 ? job.token_count.toLocaleString() : '—'} />
          <DetailRow label="Lifecycle Status" value={job.lifecycle_status ?? '—'} mono />
        </div>

        {/* Cost breakdown */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-dc1-text-primary mb-4">Cost Breakdown</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dc1-text-secondary">Compute cost</span>
              <span className="text-dc1-text-primary font-medium">{formatSAR(grossHalala)} SAR</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-dc1-text-secondary">
                Service fee
                <span className="ms-1 text-xs text-dc1-text-muted">({(PLATFORM_FEE_RATE * 100).toFixed(0)}%)</span>
              </span>
              <span className="text-dc1-text-secondary">{formatSAR(serviceFeeHalala)} SAR</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-3 border-t border-dc1-border">
              <span className="font-semibold text-dc1-text-primary">Total charged</span>
              <span className="font-bold text-dc1-amber text-base">{formatSAR(totalHalala)} SAR</span>
            </div>
          </div>
        </div>

        {/* Dispute button */}
        {job.status === 'completed' && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-dc1-text-primary mb-2">Dispute</h2>
            {disputeSubmitted ? (
              <div className="flex items-center gap-2 text-sm text-status-success">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Dispute submitted. Our team will review within 24 hours.
              </div>
            ) : canDispute ? (
              <div>
                <p className="text-xs text-dc1-text-muted mb-3">
                  If you believe there is an error with this job&apos;s charges, you can submit a dispute within 24 hours of completion.
                </p>
                <button
                  onClick={handleDispute}
                  className="px-4 py-2 text-sm font-medium rounded bg-status-error/10 text-status-error border border-status-error/20 hover:bg-status-error/20 transition-colors"
                >
                  Dispute Charges
                </button>
              </div>
            ) : (
              <p className="text-xs text-dc1-text-muted">
                The 24-hour dispute window for this job has closed.
              </p>
            )}
          </div>
        )}

        {/* Back link */}
        <div>
          <Link href="/dashboard" className="text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors">
            ← Back to Dashboard
          </Link>
        </div>

      </div>
    </DashboardLayout>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <span className="text-sm text-dc1-text-muted shrink-0 w-36">{label}</span>
      <span className={`text-sm text-dc1-text-primary text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
