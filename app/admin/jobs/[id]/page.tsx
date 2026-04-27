'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/layout/DashboardLayout'
import StatCard from '../../../components/ui/StatCard'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLanguage } from '../../../lib/i18n'

const API_BASE = '/api'

const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

const getStatusType = (status: string) => {
  switch (status) {
    case 'completed': return 'completed'
    case 'running': return 'running'
    case 'pending':
    case 'queued': return 'pending'
    case 'failed': return 'failed'
    case 'cancelled': return 'inactive'
    default: return 'offline'
  }
}

export default function JobDetailPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const navItems = useMemo(() => ([
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
  ]), [t])

  const [job, setJob] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [billing, setBilling] = useState<any>(null)
  const [recoveryEvents, setRecoveryEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelLoading, setCancelLoading] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/admin/jobs/${id}`, { headers: { 'x-admin-token': token || '' } })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      setJob(data.job)
      setProvider(data.provider)
      setBilling(data.billing)
      setRecoveryEvents(data.recovery_events || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [id, router, token])

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    void fetchData()
  }, [fetchData, router, token])

  const handleCancel = async () => {
    if (!confirm(t('admin.job_detail.confirm_cancel_refund'))) return
    setCancelLoading(true)
    try {
      await fetch(`${API_BASE}/admin/jobs/${id}/cancel`, {
        method: 'POST', headers: { 'x-admin-token': token || '' },
      })
      void fetchData()
    } catch (err) { console.error(err) }
    finally { setCancelLoading(false) }
  }

  const fmt = (iso: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString() + ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (loading) return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="text-dc1-text-secondary">{t('admin.job_detail.loading')}</div>
    </DashboardLayout>
  )

  if (!job) return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="text-red-400">{t('admin.job_detail.not_found')}</div>
    </DashboardLayout>
  )

  const canCancel = !['completed', 'cancelled', 'failed'].includes(job.status)

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/admin/jobs" className="text-dc1-text-secondary text-sm hover:text-dc1-amber mb-2 inline-block">&larr; {t('provider.job_detail.back_to_jobs')}</Link>
          <h1 className="text-2xl font-bold text-dc1-text-primary font-mono">{job.job_id || `Job #${job.id}`}</h1>
          <p className="text-dc1-text-secondary">
            {job.job_type} · {t('table.provider')}: {provider?.name || t('marketplace.unknown')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={getStatusType(job.status)} label={t(`admin.jobs.status.${job.status}`)} />
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelLoading}
              className="px-3 py-1.5 rounded text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
            >
              {cancelLoading ? '...' : t('admin.job_detail.force_cancel_refund')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('admin.job_detail.total_cost')} value={`${billing?.cost_sar || '0.00'} ${t('common.sar')}`} accent="amber" />
        <StatCard label={t('admin.job_detail.provider_earned')} value={`${((billing?.provider_cut_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`} accent="success" />
        <StatCard label={t('admin.job_detail.platform_fee')} value={`${((billing?.dc1_cut_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`} accent="info" />
        <StatCard label={t('table.duration')} value={`${billing?.duration_minutes || 0} ${t('common.min')}`} accent="default" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('provider.job_detail.info')}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-dc1-text-muted">ID</span><br /><span className="text-dc1-text-primary">{job.id}</span></div>
            <div><span className="text-dc1-text-muted">{t('table.job_id')}</span><br /><span className="text-dc1-text-primary font-mono text-xs">{job.job_id}</span></div>
            <div><span className="text-dc1-text-muted">{t('table.type')}</span><br /><span className="text-dc1-text-primary">{job.job_type}</span></div>
            <div><span className="text-dc1-text-muted">{t('table.status')}</span><br /><StatusBadge status={getStatusType(job.status)} label={t(`admin.jobs.status.${job.status}`)} /></div>
            <div><span className="text-dc1-text-muted">{t('provider.job_detail.submitted')}</span><br /><span className="text-dc1-text-primary">{fmt(job.submitted_at)}</span></div>
            <div><span className="text-dc1-text-muted">{t('provider.job_detail.started')}</span><br /><span className="text-dc1-text-primary">{fmt(job.started_at)}</span></div>
            <div><span className="text-dc1-text-muted">{t('table.completed')}</span><br /><span className="text-dc1-text-primary">{fmt(job.completed_at)}</span></div>
            <div><span className="text-dc1-text-muted">{t('admin.job_detail.timeout_at')}</span><br /><span className="text-dc1-text-primary">{fmt(job.timeout_at)}</span></div>
            <div><span className="text-dc1-text-muted">{t('admin.job_detail.progress_phase')}</span><br /><span className="text-dc1-text-primary">{job.progress_phase || '—'}</span></div>
            <div><span className="text-dc1-text-muted">{t('admin.job_detail.refunded')}</span><br /><span className={job.refunded_at ? 'text-yellow-400' : 'text-dc1-text-primary'}>{job.refunded_at ? fmt(job.refunded_at) : t('common.no')}</span></div>
            {job.error && (
              <div className="col-span-2"><span className="text-dc1-text-muted">{t('common.error')}</span><br /><span className="text-red-400">{job.error}</span></div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('table.provider')}</h3>
          {provider ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-dc1-text-muted">{t('table.name')}</span><br />
                <Link href={`/admin/providers/${provider.id}`} className="text-dc1-amber hover:underline">{provider.name}</Link>
              </div>
              <div><span className="text-dc1-text-muted">{t('table.email')}</span><br /><span className="text-dc1-text-primary">{provider.email}</span></div>
              <div><span className="text-dc1-text-muted">{t('table.gpu')}</span><br /><span className="text-dc1-text-primary">{provider.gpu_name_detected || provider.gpu_model || '—'}</span></div>
              <div><span className="text-dc1-text-muted">{t('table.vram')}</span><br /><span className="text-dc1-text-primary">{provider.gpu_vram_mib ? `${(provider.gpu_vram_mib / 1024).toFixed(1)} GB` : provider.vram_gb ? `${provider.vram_gb} GB` : '—'}</span></div>
              <div><span className="text-dc1-text-muted">{t('table.hostname')}</span><br /><span className="text-dc1-text-primary">{provider.provider_hostname || '—'}</span></div>
              <div><span className="text-dc1-text-muted">{t('table.ip')}</span><br /><span className="text-dc1-text-primary">{provider.provider_ip || '—'}</span></div>
            </div>
          ) : (
            <p className="text-dc1-text-muted">{t('admin.job_detail.provider_unavailable')}</p>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('provider.job_detail.earnings_breakdown')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div><span className="text-dc1-text-muted">{t('admin.job_detail.estimated_duration')}</span><br /><span className="text-dc1-text-primary">{job.duration_minutes || 0} {t('common.min')}</span></div>
          <div><span className="text-dc1-text-muted">{t('admin.job_detail.actual_duration')}</span><br /><span className="text-dc1-text-primary">{job.actual_duration_minutes || billing?.duration_minutes || '—'} {t('common.min')}</span></div>
          <div><span className="text-dc1-text-muted">{t('admin.job_detail.cost_split')}</span><br /><span className="text-dc1-text-primary">{billing?.cost_halala || 0} {t('admin.finance.na') === '-' ? 'halala' : 'halala'}</span></div>
          <div><span className="text-dc1-text-muted">{t('admin.job_detail.provider_cut')}</span><br /><span className="text-green-400">{billing?.provider_cut_halala || 0} halala</span></div>
          <div><span className="text-dc1-text-muted">{t('admin.job_detail.platform_cut')}</span><br /><span className="text-blue-400">{billing?.dc1_cut_halala || 0} halala</span></div>
        </div>
      </div>

      {job.task_spec && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('admin.job_detail.task_script')}</h3>
          <pre className="bg-dc1-dark p-4 rounded text-xs text-dc1-text-secondary overflow-x-auto max-h-96 overflow-y-auto">
            {job.task_spec}
          </pre>
        </div>
      )}

      {job.result && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('admin.job_detail.result')}</h3>
          <pre className="bg-dc1-dark p-4 rounded text-sm text-dc1-text-primary overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {job.result}
          </pre>
        </div>
      )}

      {recoveryEvents.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-3">{t('admin.job_detail.recovery_events')}</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.security.timestamp')}</th>
                  <th>{t('table.type')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('admin.security.details')}</th>
                </tr>
              </thead>
              <tbody>
                {recoveryEvents.map((e: any, i: number) => (
                  <tr key={i}>
                    <td className="text-sm text-dc1-text-secondary">{fmt(e.timestamp)}</td>
                    <td className="text-sm">{e.event_type}</td>
                    <td className="text-sm">{e.status}</td>
                    <td className="text-sm text-dc1-text-secondary">{e.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
