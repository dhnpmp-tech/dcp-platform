'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

interface Job {
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
}

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
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
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

export default function ProviderJobsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [providerName, setProviderName] = useState('Provider')
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, earned: 0 })
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
        // Fetch provider info
        const meRes = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)
        if (!meRes.ok) {
          localStorage.removeItem('dc1_provider_key')
          router.push('/login')
          return
        }
        const meData = await meRes.json()
        setProviderName(meData.provider?.name || 'Provider')

        // Fetch job history
        const jobsRes = await fetch(`${API_BASE}/providers/job-history?key=${encodeURIComponent(apiKey)}&limit=100`)
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json()
          setJobs(jobsData.jobs || [])
          setStats({
            total: jobsData.total_jobs || 0,
            completed: jobsData.completed_jobs || 0,
            failed: jobsData.failed_jobs || 0,
            earned: parseFloat(jobsData.total_earned_sar || '0'),
          })
        }
      } catch (err) {
        console.error('Failed to load jobs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

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
      <div className="space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">{t('provider.jobs.history_title')}</h1>

        <div className="rounded-xl border border-dc1-amber/20 bg-dc1-surface-l2 p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">{t('register.provider.next_action_title')}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <Link href="/setup" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              1. {t('register.provider.install_title')}
            </Link>
            <Link href="/provider/download" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              2. {t('register.provider.state.heartbeat.label')}
            </Link>
            <span className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 px-3 py-2 text-dc1-amber">
              3. {t('register.provider.state.ready.label')}
            </span>
            <Link href="/provider/earnings" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              4. {t('nav.earnings')}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">{t('provider.jobs.total_jobs')}</p>
            <p className="text-2xl font-bold text-dc1-text-primary">{stats.total}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">{t('table.completed')}</p>
            <p className="text-2xl font-bold text-status-success">{stats.completed}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">{t('provider.jobs.failed')}</p>
            <p className="text-2xl font-bold text-status-error">{stats.failed}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">{t('provider.jobs.total_earned')}</p>
            <p className="text-2xl font-bold text-dc1-amber">{stats.earned.toFixed(2)} SAR</p>
          </div>
        </div>

        {/* Jobs Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('provider.jobs.time')}</th>
                <th>{t('table.type')}</th>
                <th>{t('provider.jobs.renter')}</th>
                <th>{t('table.duration')}</th>
                <th>{t('table.status')}</th>
                <th>{t('table.earnings')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length > 0 ? (
                jobs.map(j => (
                  <tr key={j.id}>
                    <td className="text-sm text-dc1-text-secondary">
                      <Link href={`/provider/jobs/${j.id}`} className="hover:text-dc1-amber transition">
                        {j.completed_at
                          ? new Date(j.completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : j.submitted_at
                          ? new Date(j.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : t('provider.jobs.na')}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/provider/jobs/${j.id}`} className="text-sm hover:text-dc1-amber transition">{(j.job_type || '').replace(/_/g, ' ')}</Link>
                    </td>
                    <td className="text-sm text-dc1-text-secondary">{j.renter_name || t('provider.jobs.na')}</td>
                    <td className="text-sm text-dc1-text-secondary">
                      {j.actual_duration_minutes ? `${j.actual_duration_minutes} ${t('common.min')}` : t('provider.jobs.na')}
                    </td>
                    <td>
                      <StatusBadge status={j.status as any} />
                      {j.error && (
                        <p className="text-xs text-status-error mt-1 truncate max-w-[200px]">{j.error}</p>
                      )}
                    </td>
                    <td className="text-dc1-amber font-semibold">
                      {j.status === 'completed' && j.provider_earned_halala
                        ? `${(j.provider_earned_halala / 100).toFixed(2)} SAR`
                        : t('provider.jobs.na')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-dc1-text-secondary">
                    {t('provider.jobs.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
