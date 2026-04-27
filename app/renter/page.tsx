'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../components/layout/DashboardLayout'
import StatCard from '../components/ui/StatCard'
import StatusBadge from '../components/ui/StatusBadge'
import { useLanguage } from '../lib/i18n'
import { clearSession } from '../lib/auth'
import OnboardingWizard, { isOnboarded } from '../components/OnboardingWizard'
import JobCard, { Job as JobCardJob } from '../components/JobCard'

const API_BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────
interface V1UsageSummary {
  total_requests: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  total_cost_halala: number
}

interface RenterInfo {
  id: number
  name: string
  email: string
  organization: string
  balance_halala: number
  api_key: string
  total_spent_halala?: number
  total_jobs?: number
  v1_usage_summary?: V1UsageSummary
}

interface GPU {
  id: number
  provider_id: number
  provider_name: string
  gpu_model: string
  vram_gb: number
  status: 'online' | 'offline'
  cached_models: string[]
}


// ── SVG Icon Components ────────────────────────────────────────────
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

const LiveIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
)

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.11 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const LOW_BALANCE_THRESHOLD_HALALA = 500

// ── Main Component ─────────────────────────────────────────────────
export default function RenterDashboard() {
  const { t } = useLanguage()
  const router = useRouter()
  const [renter, setRenter] = useState<RenterInfo | null>(null)
  const [gpus, setGpus] = useState<GPU[]>([])
  const [jobs, setJobs] = useState<JobCardJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [authChecking, setAuthChecking] = useState(true)
  const [authReason, setAuthReason] = useState<'missing_credentials' | 'invalid_credentials' | 'expired_session' | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBannerDismissed(!!sessionStorage.getItem('dcp_low_balance_dismissed'))
      if (!isOnboarded()) setShowOnboarding(true)
    }
  }, [])

  const dismissBanner = () => {
    sessionStorage.setItem('dcp_low_balance_dismissed', '1')
    setBannerDismissed(true)
  }

  const isLowBalance = !!renter && renter.balance_halala < LOW_BALANCE_THRESHOLD_HALALA

  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon />, badge: isLowBalance },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: 'Live Monitor', href: '/renter/live', icon: <LiveIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]

  // ── Auth + Auto-refresh ──────────────────────────────────────────
  const verifyKey = useCallback(async (key: string) => {
    setAuthChecking(true)
    setAuthReason(null)
    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.renter) {
          setRenter(data.renter)
          setApiKey(key)
          localStorage.setItem('dc1_renter_key', key)
          fetchGPUs()
          fetchJobs(key)
        } else {
          setRenter(null)
          localStorage.removeItem('dc1_renter_key')
          setAuthReason('invalid_credentials')
        }
      } else {
        const payload = await res.json().catch(() => ({}))
        const rawError = String(payload?.error || '').toLowerCase()
        setRenter(null)
        localStorage.removeItem('dc1_renter_key')
        if (res.status === 401 || res.status === 403) {
          if (rawError.includes('expired') || rawError.includes('session')) {
            setAuthReason('expired_session')
          } else {
            setAuthReason('invalid_credentials')
          }
        } else {
          setAuthReason('invalid_credentials')
        }
      }
    } catch (err) {
      console.error('Auth error:', err)
      setRenter(null)
      setAuthReason('invalid_credentials')
    } finally {
      setAuthChecking(false)
    }
  }, [])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (key) {
      setAuthReason(null)
      verifyKey(key)
      const interval = setInterval(() => {
        verifyKey(key)
      }, 30000)
      return () => clearInterval(interval)
    } else {
      setAuthReason('missing_credentials')
      setAuthChecking(false)
    }
  }, [verifyKey])

  useEffect(() => {
    if (authChecking || renter) return
    const params = new URLSearchParams({
      role: 'renter',
      redirect: '/renter',
    })
    if (authReason) params.set('reason', authReason)
    router.replace(`/login?${params.toString()}`)
  }, [authChecking, renter, authReason, router])

  const fetchGPUs = async () => {
    try {
      const res = await fetch(`${API_BASE}/renters/available-providers`)
      if (res.ok) {
        const data = await res.json()
        const gpusData = data.providers?.map((p: any) => ({
          id: p.id,
          provider_id: p.id,
          provider_name: p.name,
          gpu_model: p.gpu_model,
          vram_gb: p.vram_gb,
          status: 'online' as const,
          cached_models: Array.isArray(p.cached_models) ? p.cached_models : [],
        })) || []
        setGpus(gpusData)
      }
    } catch (err) {
      console.error('Failed to fetch GPUs:', err)
    }
  }

  const fetchJobs = async (key: string) => {
    setJobsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
      if (res.ok) {
        const data = await res.json()
        const jobsData: JobCardJob[] = (data.recent_jobs || []).map((j: any) => ({
          id: j.id,
          job_id: j.job_id || String(j.id),
          job_type: j.job_type || 'gpu_job',
          status: j.status,
          submitted_at: j.submitted_at,
          started_at: j.started_at,
          completed_at: j.completed_at,
          actual_cost_halala: j.actual_cost_halala || 0,
          actual_duration_minutes: j.actual_duration_minutes,
          price_per_hour_halala: j.price_per_hour_halala,
          params: j.params ?? null,
          container_spec: j.container_spec ?? null,
          gpu_type: j.gpu_model ?? null,
        }))
        setJobs(jobsData)
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      setJobsLoading(false)
    }
  }

  const handleLogout = async () => {
    await clearSession()
    setRenter(null)
    setAuthReason('missing_credentials')
    window.location.href = '/'
  }

  // ── Loading state ────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div className="min-h-screen bg-dc1-void flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
      </div>
    )
  }

  // ── Login gate ───────────────────────────────────────────────────
  if (!renter) {
    return (
      <div className="min-h-screen bg-dc1-void flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-dc1-text-secondary">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const balance = renter.balance_halala / 100
  const totalSpent = (renter.total_spent_halala || 0) / 100
  const totalJobs = renter.total_jobs || 0
  const onlineGPUs = gpus.filter(g => g.status === 'online').length

  // ── Main Dashboard ───────────────────────────────────────────────
  return (
    <>
    {showOnboarding && (
      <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
    )}
    <DashboardLayout navItems={navItems} role="renter" userName={renter.name}>
      <div className="space-y-8">
        {/* Low Balance Banner */}
        {isLowBalance && !bannerDismissed && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-dc1-amber/10 border border-dc1-amber/30 text-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <svg className="w-5 h-5 text-dc1-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span className="text-dc1-amber font-medium">
                {t('renter.low_balance_warning').replace('{balance}', balance.toFixed(2))}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/renter/billing"
                className="px-3 py-1.5 bg-dc1-amber text-dc1-void text-xs font-semibold rounded-md hover:bg-dc1-amber/90 transition-colors min-h-[44px] flex items-center"
              >
                {t('renter.top_up_now')}
              </Link>
              <button
                onClick={dismissBanner}
                aria-label="Dismiss"
                className="p-1.5 text-dc1-amber/60 hover:text-dc1-amber transition-colors min-h-[44px] flex items-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">{t('renter.dashboard')}</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">{t('dashboard.welcome')}, {renter.name}</p>
          </div>
          <button onClick={handleLogout} className="btn btn-outline text-sm">
            {t('common.sign_out')}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t('dashboard.balance')} value={`${balance.toFixed(2)} ${t('common.sar')}`} accent="amber" />
          <StatCard label={t('dashboard.total_spent')} value={`${totalSpent.toFixed(2)} ${t('common.sar')}`} accent="default" />
          <StatCard label={t('dashboard.jobs_run')} value={totalJobs.toString()} accent="default" />
          <StatCard label={t('dashboard.online_gpus')} value={onlineGPUs.toString()} accent="success" />
        </div>

        {/* Available GPUs */}
        <section>
          <h2 className="section-heading mb-4">{t('common.available_gpus')}</h2>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('table.provider')}</th>
                  <th>{t('table.gpu_model')}</th>
                  <th>{t('table.vram')}</th>
                  <th>Cached Models</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {gpus.length > 0 ? (
                  gpus.map(gpu => (
                    <tr key={gpu.id}>
                      <td className="font-medium">{gpu.provider_name}</td>
                      <td>{gpu.gpu_model}</td>
                      <td>{gpu.vram_gb} GB</td>
                      <td>
                        {gpu.cached_models.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {gpu.cached_models.slice(0, 3).map((model) => {
                              const shortName = model.split('/').pop() || model;
                              return (
                                <span
                                  key={model}
                                  title={model}
                                  className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-dc1-amber/10 text-dc1-amber border border-dc1-amber/20 rounded"
                                >
                                  {shortName}
                                </span>
                              );
                            })}
                            {gpu.cached_models.length > 3 && (
                              <span
                                title={gpu.cached_models.slice(3).join(', ')}
                                className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-dc1-surface-l3 text-dc1-text-muted rounded"
                              >
                                +{gpu.cached_models.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-dc1-text-muted">None</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={gpu.status} />
                      </td>
                      <td>
                        <Link
                          href={`/renter/playground?provider=${gpu.id}`}
                          className="text-dc1-amber hover:underline text-sm font-medium"
                        >
                          {t('renter.use_gpu')}
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-dc1-text-secondary">
                      {t('renter.no_gpus')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-heading">{t('common.recent_jobs')}</h2>
            <Link href="/renter/jobs" className="text-dc1-amber text-sm hover:underline">
              {t('common.view_all')}
            </Link>
          </div>
          {jobsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse card flex items-center gap-4 p-4">
                  <div className="h-8 w-8 rounded-full bg-dc1-surface-l3 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-dc1-surface-l3 rounded w-1/2" />
                    <div className="h-3 bg-dc1-surface-l3 rounded w-1/3" />
                  </div>
                  <div className="h-6 bg-dc1-surface-l3 rounded-full w-20 shrink-0" />
                </div>
              ))}
            </div>
          ) : jobs.length > 0 ? (
            <div className="space-y-3">
              {jobs.slice(0, 3).map(job => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  renterKey={apiKey}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="card py-10 text-center space-y-3">
              <p className="text-dc1-text-secondary">No jobs yet.</p>
              <p className="text-dc1-text-muted text-sm">Browse templates to get started.</p>
              <Link href="/marketplace/templates" className="inline-block btn btn-primary px-6 py-2.5 text-sm mt-2">
                Browse Templates →
              </Link>
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="section-heading mb-4">{t('common.quick_actions')}</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/renter/playground" className="btn btn-primary flex-1 text-center">
              {t('renter.open_playground')}
            </Link>
            <Link href="/renter/marketplace" className="btn btn-secondary flex-1 text-center">
              {t('renter.browse_marketplace')}
            </Link>
            <Link href="/renter/billing" className="btn btn-outline flex-1 text-center">
              {t('renter.manage_billing')}
            </Link>
          </div>
        </section>
      </div>
    </DashboardLayout>
    </>
  )
}
