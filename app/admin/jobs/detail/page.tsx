'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import DashboardLayout from '../../../components/layout/DashboardLayout'
import StatusBadge from '../../../components/ui/StatusBadge'
import StatCard from '../../../components/ui/StatCard'
import { useLanguage } from '../../../lib/i18n'

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

function statusToBadge(status: string): 'online' | 'offline' | 'active' | 'inactive' | 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'warning' {
  switch (status) {
    case 'completed': return 'completed'
    case 'failed': return 'failed'
    case 'running': return 'running'
    case 'assigned':
    case 'pending':
    case 'queued': return 'pending'
    case 'cancelled': return 'inactive'
    default: return 'offline'
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

function parseTaskSpec(taskSpecRaw: unknown) {
  if (typeof taskSpecRaw !== 'string' || !taskSpecRaw.trim()) return null
  try {
    const parsed = JSON.parse(taskSpecRaw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
  } catch (_e) {}
  return null
}

function parseJsonlLogs(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line)
        if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
      } catch (_e) {
        return { line }
      }
      return { line }
    })
}

export default function AdminJobDetailFallbackPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [jobId, setJobId] = useState('')
  const [queryReady, setQueryReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [job, setJob] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [requeueLoading, setRequeueLoading] = useState(false)

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

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  useEffect(() => {
    const idFromQuery = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id') || ''
      : ''
    setJobId(idFromQuery)
    setQueryReady(true)
  }, [])

  const fetchJobDetail = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`${API_BASE}/admin/jobs/${encodeURIComponent(jobId)}`, {
        headers: { 'x-admin-token': token || '' },
      })
      const body = await res.json()
      if (res.status === 401) {
        localStorage.removeItem('dc1_admin_token')
        router.push('/login')
        return
      }
      if (!res.ok) {
        setError(body?.error || t('admin.job_detail_fallback.load_failed'))
        return
      }
      setJob(body.job || null)
      setProvider(body.provider || null)
    } catch (_e) {
      setError(t('admin.job_detail_fallback.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [jobId, router, t, token])

  useEffect(() => {
    if (!queryReady) return
    if (!token) {
      router.push('/login')
      return
    }
    if (!jobId) {
      setError(t('admin.job_detail_fallback.missing_job_id'))
      setLoading(false)
      return
    }
    void fetchJobDetail()
  }, [fetchJobDetail, jobId, queryReady, refreshTick, router, t, token])

  const handleCancel = async () => {
    if (!job?.id || !confirm(t('admin.job_detail_fallback.confirm_cancel'))) return
    setCancelLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/jobs/${encodeURIComponent(job.id)}/cancel`, {
        method: 'POST',
        headers: { 'x-admin-token': token || '' },
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || t('admin.job_detail_fallback.cancel_failed'))
      } else {
        setRefreshTick((prev) => prev + 1)
      }
    } catch (_e) {
      setError(t('admin.job_detail_fallback.cancel_failed'))
    } finally {
      setCancelLoading(false)
    }
  }

  const handleRequeue = async () => {
    if (!job?.id || !confirm(t('admin.job_detail_fallback.confirm_requeue'))) return
    setRequeueLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/jobs/${encodeURIComponent(job.id)}/requeue`, {
        method: 'POST',
        headers: { 'x-admin-token': token || '' },
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || t('admin.job_detail_fallback.requeue_failed'))
      } else {
        setRefreshTick((prev) => prev + 1)
      }
    } catch (_e) {
      setError(t('admin.job_detail_fallback.requeue_failed'))
    } finally {
      setRequeueLoading(false)
    }
  }

  const totalHalala = (job?.actual_cost_halala ?? job?.cost_halala ?? 0) || 0
  const providerHalala = job?.provider_earned_halala ?? Math.floor(totalHalala * 0.75)
  const dcpFeeHalala = job?.dc1_fee_halala ?? (totalHalala - providerHalala)
  const taskSpec = parseTaskSpec(job?.task_spec)
  const promptPreview = typeof taskSpec?.prompt === 'string' ? taskSpec.prompt.slice(0, 220) : '—'
  const maxTokensValue = typeof taskSpec?.max_tokens === 'number' ? String(taskSpec.max_tokens) : '—'

  const timeline = useMemo(() => {
    if (!job) return []
    return [
      { key: 'submitted', label: t('admin.job_detail_fallback.submitted'), at: job.submitted_at || job.created_at || null, done: Boolean(job.submitted_at || job.created_at) },
      { key: 'assigned', label: t('admin.job_detail_fallback.assigned'), at: job.assigned_at || job.picked_up_at || job.started_at || null, done: Boolean(job.assigned_at || job.picked_up_at || job.started_at) },
      { key: 'running', label: t('admin.job_detail_fallback.running'), at: job.started_at || null, done: ['running', 'completed', 'failed', 'cancelled'].includes(job.status) || Boolean(job.started_at) },
      { key: 'finished', label: job.status === 'failed' ? t('admin.job_detail_fallback.failed') : t('admin.job_detail_fallback.completed'), at: job.completed_at || null, done: ['completed', 'failed', 'cancelled'].includes(job.status) },
    ]
  }, [job, t])

  const logEntries = parseJsonlLogs(job?.logs_jsonl)
  const canCancel = job?.status === 'running' || job?.status === 'assigned'
  const canRequeue = job?.status === 'failed'

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="mb-6">
        <Link href="/admin/jobs" className="text-sm text-dc1-text-secondary hover:text-dc1-amber">
          &larr; {t('admin.job_detail_fallback.back_to_jobs')}
        </Link>
      </div>

      {loading && <div className="text-dc1-text-secondary">{t('admin.job_detail_fallback.loading')}</div>}

      {!loading && (error || !job) && (
        <div className="card">
          <p className="text-red-400">{error || t('admin.job_detail_fallback.not_found')}</p>
        </div>
      )}

      {!loading && !error && job && (
        <>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="mb-2 text-2xl sm:text-3xl font-bold text-dc1-text-primary font-mono">{job.job_id || `Job #${job.id}`}</h1>
              <p className="text-dc1-text-secondary">
                {t('admin.job_detail_fallback.renter')}: {job.renter_id || '—'} · {t('admin.job_detail_fallback.provider')}: {provider?.name || job.provider_id || '—'} · {t('admin.job_detail_fallback.gpu')}: {provider?.gpu_name_detected || provider?.gpu_model || t('admin.job_detail_fallback.unknown')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={statusToBadge(job.status)} label={job.status} />
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="rounded bg-red-600/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                >
                  {cancelLoading ? t('admin.job_detail_fallback.cancelling') : t('admin.job_detail_fallback.cancel')}
                </button>
              )}
              {canRequeue && (
                <button
                  onClick={handleRequeue}
                  disabled={requeueLoading}
                  className="rounded bg-dc1-amber/20 px-3 py-1.5 text-sm text-dc1-amber hover:bg-dc1-amber/30 disabled:opacity-50"
                >
                  {requeueLoading ? t('admin.job_detail_fallback.requeueing') : t('admin.job_detail_fallback.requeue')}
                </button>
              )}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={t('admin.job_detail_fallback.total_cost')} value={`${(totalHalala / 100).toFixed(2)} ${t('common.sar')}`} accent="amber" />
            <StatCard label={t('admin.job_detail_fallback.dcp_fee')} value={`${(dcpFeeHalala / 100).toFixed(2)} ${t('common.sar')}`} accent="info" />
            <StatCard label={t('admin.job_detail_fallback.provider_earned')} value={`${(providerHalala / 100).toFixed(2)} ${t('common.sar')}`} accent="success" />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-dc1-text-primary">{t('admin.job_detail_fallback.lifecycle_timeline')}</h2>
              <div className="space-y-3">
                {timeline.map((step) => (
                  <div key={step.key} className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${step.done ? 'bg-dc1-amber' : 'bg-dc1-text-muted'}`} />
                    <div>
                      <p className="text-sm font-medium text-dc1-text-primary">{step.label}</p>
                      <p className="text-xs text-dc1-text-secondary">{formatDateTime(step.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-dc1-text-primary">{t('admin.job_detail_fallback.job_parameters')}</h2>
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div><span className="text-dc1-text-muted">{t('admin.job_detail_fallback.model')}</span><div className="text-dc1-text-primary">{job.model || '—'}</div></div>
                <div><span className="text-dc1-text-muted">{t('admin.job_detail_fallback.max_tokens')}</span><div className="text-dc1-text-primary">{maxTokensValue}</div></div>
                <div><span className="text-dc1-text-muted">{t('admin.job_detail_fallback.prompt_preview')}</span><div className="text-dc1-text-primary break-words">{promptPreview}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold text-dc1-text-primary">{t('admin.job_detail_fallback.log_viewer')}</h2>
            {logEntries.length === 0 ? (
              <p className="text-sm text-dc1-text-secondary">{t('admin.job_detail_fallback.no_logs')}</p>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded bg-dc1-dark p-3">
                {logEntries.map((entry, idx) => {
                  const line = typeof entry.line === 'string' ? entry.line : JSON.stringify(entry)
                  const level = typeof entry.level === 'string' ? entry.level.toUpperCase() : t('admin.job_detail_fallback.info')
                  return (
                    <div key={idx} className="mb-1 font-mono text-xs text-dc1-text-secondary">
                      <span className="text-dc1-amber">[{level}]</span> {line}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
