'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

export default function JobsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/jobs`, { headers: { 'x-admin-token': token! } })
      if (res.status === 401) { localStorage.removeItem('dc1_admin_token'); router.push('/login'); return }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }, [router, token])

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    fetchJobs()
    const interval = setInterval(fetchJobs, 5_000) // 5s for real-time job queue updates
    return () => clearInterval(interval)
  }, [fetchJobs, router, token])

  const handleCancel = async (id: string) => {
    setActionLoading(id)
    try {
      await fetch(`${API_BASE}/admin/jobs/${id}/cancel`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
      })
      await fetchJobs()
    } catch (err) { console.error(err) }
    finally { setActionLoading(null) }
  }

  const jobs = data?.jobs || []
  const filtered = jobs.filter((j: any) => {
    if (filter !== 'all' && j.status !== filter) return false
    if (search) {
      const searchLower = search.toLowerCase()
      if (!j.provider_name?.toLowerCase().includes(searchLower) &&
          !j.renter_name?.toLowerCase().includes(searchLower) &&
          !j.job_id?.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    return true
  })

  const getStatusBadgeType = (status: string): 'online' | 'offline' | 'active' | 'inactive' | 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'warning' => {
    switch (status) {
      case 'completed': return 'completed'
      case 'failed': return 'failed'
      case 'running': return 'running'
      case 'pending': return 'pending'
      case 'cancelled': return 'offline'
      case 'assigned': return 'active'
      default: return 'offline'
    }
  }

  const formatTime = (iso: string) => {
    if (!iso) return t('admin.jobs.never')
    return new Date(iso).toLocaleDateString() + ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const truncateId = (id: string) => {
    if (!id) return '—'
    return id.length > 12 ? id.substring(0, 12) + '...' : id
  }

  const canCancel = (status: string) => {
    return status !== 'completed' && status !== 'cancelled'
  }

  const statusLabel = (status: string) => t(`admin.jobs.status.${status}`)

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
  ]

  const stats = [
    { label: t('admin.jobs.total_jobs'), value: String(data?.stats?.total || 0), accent: 'default' as const },
    { label: t('admin.jobs.completed'), value: String(data?.stats?.completed || 0), accent: 'success' as const },
    { label: t('admin.jobs.failed'), value: String(data?.stats?.failed || 0), accent: 'error' as const },
    { label: t('admin.jobs.active'), value: String(data?.stats?.active || 0), accent: 'info' as const },
    { label: t('admin.jobs.total_revenue'), value: `${((data?.stats?.total_revenue_halala || 0) / 100).toFixed(2)} SAR`, accent: 'amber' as const },
  ]

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{t('admin.jobs.title')}</h1>
        <p className="text-dc1-text-secondary">
          {data
            ? t('admin.jobs.total_jobs_count').replace('{count}', String(data.stats?.total || data.jobs?.length || 0))
            : t('common.loading')}
        </p>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <StatCard key={idx} label={stat.label} value={stat.value} accent={stat.accent} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder={t('admin.jobs.search_placeholder')}
            className="input flex-1"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            {['all', 'pending', 'assigned', 'running', 'completed', 'failed', 'cancelled'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-dc1-amber text-black'
                    : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {t(`admin.jobs.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-dc1-text-secondary">{t('admin.jobs.loading')}</div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('table.job_id')}</th>
                  <th>{t('table.type')}</th>
                  <th>{t('table.provider')}</th>
                  <th>{t('admin.jobs.renter')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('admin.jobs.cost_sar')}</th>
                  <th>{t('admin.jobs.created')}</th>
                  <th>{t('admin.jobs.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j: any) => (
                  <tr key={j.job_id}>
                    <td className="font-mono text-sm text-dc1-amber">{truncateId(j.job_id)}</td>
                    <td className="text-sm">{j.job_type || '—'}</td>
                    <td className="text-sm">{j.provider_name || '—'}</td>
                    <td className="text-sm">{j.renter_name || '—'}</td>
                    <td>
                      <StatusBadge status={getStatusBadgeType(j.status)} label={statusLabel(j.status)} />
                    </td>
                    <td className="text-sm">{j.cost_halala ? `${(j.cost_halala / 100).toFixed(2)}` : '—'}</td>
                    <td className="text-xs text-dc1-text-secondary">{formatTime(j.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/jobs/detail?id=${encodeURIComponent(j.job_id || j.id)}`}
                          className="text-xs px-2 py-1 rounded bg-dc1-amber/20 text-dc1-amber hover:bg-dc1-amber/30"
                        >
                          {t('admin.jobs.view')}
                        </Link>
                        {canCancel(j.status) ? (
                          <button
                            onClick={() => handleCancel(j.job_id)}
                            disabled={actionLoading === j.job_id}
                            className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                          >
                            {actionLoading === j.job_id ? '...' : t('admin.jobs.cancel')}
                          </button>
                        ) : (
                          <span className="text-xs text-dc1-text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-dc1-text-muted text-sm text-center">{t('admin.jobs.no_jobs')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
