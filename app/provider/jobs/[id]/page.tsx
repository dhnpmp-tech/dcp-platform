'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/layout/DashboardLayout'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../lib/i18n'

const API_BASE = '/api'

interface JobDetail {
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
  renter_name: string
  progress_phase: string
  result: string | null
  params: string | null
  container_id: string | null
  retry_count: number
}

interface LatestExecution {
  attempt_number: number
  started_at: string | null
  ended_at: string | null
  exit_code: number | null
  gpu_seconds_used: number
  cost_halala: number
}

// Nav icons
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

function DetailRow({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-dc1-border/50 last:border-0">
      <span className="text-dc1-text-muted text-sm">{label}</span>
      <span className={`text-sm ${highlight ? 'text-dc1-amber font-semibold' : 'text-dc1-text-primary'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

export default function ProviderJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t } = useLanguage()
  const jobId = params.id as string
  const [job, setJob] = useState<JobDetail | null>(null)
  const [latestExec, setLatestExec] = useState<LatestExecution | null>(null)
  const [loading, setLoading] = useState(true)
  const [providerName, setProviderName] = useState('Provider')
  const [error, setError] = useState('')
  const navItems = [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]

  useEffect(() => {
    const apiKey = localStorage.getItem('dc1_provider_key')
    if (!apiKey) {
      router.push('/login')
      return
    }

    const fetchData = async () => {
      try {
        // Fetch provider name
        const meRes = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)
        if (!meRes.ok) {
          localStorage.removeItem('dc1_provider_key')
          router.push('/login')
          return
        }
        const meData = await meRes.json()
        setProviderName(meData.provider?.name || 'Provider')

        // Fetch job detail
        const jobRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
          headers: { 'x-provider-key': apiKey },
        })
        if (!jobRes.ok) {
          setError(t('provider.job_detail.not_found_or_denied'))
          return
        }
        const jobData = await jobRes.json()
        setJob(jobData.job || null)

        // Fetch execution stats (latest attempt)
        try {
          const execRes = await fetch(`${API_BASE}/jobs/${jobId}/executions`, {
            headers: { 'x-provider-key': apiKey },
          })
          if (execRes.ok) {
            const execData = await execRes.json()
            const execs: LatestExecution[] = execData.executions || []
            if (execs.length > 0) {
              setLatestExec(execs[execs.length - 1])
            }
          }
        } catch { /* executions endpoint may not have data */ }
      } catch (err) {
        console.error('Failed to load job:', err)
        setError(t('provider.job_detail.load_failed'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Auto-refresh for running jobs
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [jobId, router, t])

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !job) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName={providerName}>
        <div className="space-y-4">
          <Link href="/provider/jobs" className="text-dc1-amber text-sm hover:underline">&larr; {t('provider.job_detail.back_to_jobs')}</Link>
          <div className="card p-8 text-center">
            <p className="text-dc1-text-secondary">{error || t('provider.job_detail.not_found')}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const earned = (job.provider_earned_halala || 0) / 100
  const fee = (job.dc1_fee_halala || 0) / 100
  const totalCost = (job.actual_cost_halala || 0) / 100

  let parsedParams: Record<string, unknown> | null = null
  try {
    if (job.params) parsedParams = JSON.parse(job.params)
  } catch { /* ignore */ }

  return (
    <DashboardLayout navItems={navItems} role="provider" userName={providerName}>
      <div className="space-y-6 max-w-3xl">
        {/* Back link */}
        <Link href="/provider/jobs" className="text-dc1-amber text-sm hover:underline">&larr; {t('provider.job_detail.back_to_jobs')}</Link>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">{t('provider.job_detail.title')}</h1>
            <p className="text-dc1-text-muted text-sm font-mono mt-1">{job.job_id || `#${job.id}`}</p>
          </div>
          <StatusBadge status={job.status as any} />
        </div>

        {/* Job Info */}
        <div className="card">
          <h2 className="section-heading mb-4">{t('provider.job_detail.info')}</h2>
          <DetailRow label={t('table.job_type')} value={(job.job_type || '').replace(/_/g, ' ')} />
          <DetailRow label={t('provider.job_detail.renter')} value={job.renter_name || t('provider.job_detail.anonymous')} />
          <DetailRow label={t('table.status')} value={job.status} />
          {job.progress_phase && <DetailRow label={t('provider.job_detail.progress')} value={job.progress_phase.replace(/_/g, ' ')} />}
          <DetailRow label={t('provider.job_detail.submitted')} value={job.submitted_at ? new Date(job.submitted_at).toLocaleString() : t('provider.jobs.na')} />
          <DetailRow label={t('provider.job_detail.started')} value={job.started_at ? new Date(job.started_at).toLocaleString() : t('provider.jobs.na')} />
          <DetailRow label={t('table.completed')} value={job.completed_at ? new Date(job.completed_at).toLocaleString() : t('provider.jobs.na')} />
          <DetailRow label={t('table.duration')} value={job.actual_duration_minutes ? `${job.actual_duration_minutes} ${t('common.min')}` : t('provider.jobs.na')} />
        </div>

        {/* Earnings Breakdown */}
        <div className="card">
          <h2 className="section-heading mb-4">{t('provider.job_detail.earnings_breakdown')}</h2>
          <DetailRow label={t('provider.job_detail.total_job_cost')} value={`${totalCost.toFixed(2)} SAR`} />
          <DetailRow label={t('provider.job_detail.your_earnings')} value={`${earned.toFixed(2)} SAR`} highlight />
          <DetailRow label={t('provider.job_detail.dcp_fee')} value={`${fee.toFixed(2)} SAR`} />
        </div>

        {/* Job Parameters */}
        {parsedParams && (
          <div className="card">
            <h2 className="section-heading mb-4">{t('provider.job_detail.params')}</h2>
            {Object.entries(parsedParams).map(([key, value]) => (
              <DetailRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} mono />
            ))}
          </div>
        )}

        {/* Container Stats */}
        {(latestExec || job.container_id) && (
          <div className="card">
            <h2 className="section-heading mb-4">{t('provider.job_detail.container_stats')}</h2>
            {job.container_id && (
              <DetailRow label={t('provider.job_detail.container_id')} value={job.container_id.slice(0, 12)} mono />
            )}
            {latestExec && (
              <>
                <DetailRow
                  label={t('provider.job_detail.exit_code')}
                  value={latestExec.exit_code != null ? String(latestExec.exit_code) : t('provider.jobs.na')}
                />
                <DetailRow
                  label={t('provider.job_detail.gpu_seconds')}
                  value={latestExec.gpu_seconds_used ? `${latestExec.gpu_seconds_used.toFixed(2)}s` : t('provider.jobs.na')}
                />
                {latestExec.started_at && latestExec.ended_at && (
                  <DetailRow
                    label={t('provider.job_detail.container_duration')}
                    value={`${Math.round((new Date(latestExec.ended_at).getTime() - new Date(latestExec.started_at).getTime()) / 1000)}s`}
                  />
                )}
                <DetailRow
                  label={t('provider.job_detail.attempt')}
                  value={String(latestExec.attempt_number)}
                />
              </>
            )}
            {job.retry_count > 0 && (
              <DetailRow label={t('provider.job_detail.total_retries')} value={String(job.retry_count)} />
            )}
          </div>
        )}

        {/* Error */}
        {job.error && (
          <div className="card border-status-error/30 bg-status-error/5">
            <h2 className="section-heading text-status-error mb-2">{t('common.error')}</h2>
            <pre className="text-sm text-dc1-text-secondary whitespace-pre-wrap break-words">{job.error}</pre>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
