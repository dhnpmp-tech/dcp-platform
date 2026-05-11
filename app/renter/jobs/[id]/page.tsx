'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  provider_id?: number | null
  model?: string | null
  submitted_at: string
  started_at: string
  completed_at: string
  error: string | null
  last_error?: string | null
  actual_cost_halala: number
  cost_halala: number
  actual_duration_minutes: number
  progress_phase: string
  params: string | null
  retry_count: number
  max_retries: number
}

interface JobOutput {
  type: string
  response?: string
  image_base64?: string
  format?: string
  model?: string
  tokens_generated?: number
  tokens_per_second?: number
  gen_time_s?: number
  total_time_s?: number
  device?: string
  width?: number
  height?: number
  steps?: number
  seed?: number
}

interface Execution {
  attempt_number: number
  started_at: string | null
  ended_at: string | null
  exit_code: number | null
  gpu_seconds_used: number
  cost_halala: number
}

interface ExecutionHistory {
  job_id: string
  status: string
  cost_halala: number
  actual_cost_halala: number
  retry_count: number
  executions: Execution[]
}

// Nav icons
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

function normalizeFailureReason(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getFailureMessages(job: Pick<JobDetail, 'error' | 'last_error'>): string[] {
  const messages = [normalizeFailureReason(job.last_error), normalizeFailureReason(job.error)]
  return Array.from(new Set(messages.filter((msg): msg is string => Boolean(msg))))
}

// ── Job State Machine ─────────────────────────────────────────────────────────
type JobPhase = 'queued' | 'assigned' | 'running' | 'completed' | 'failed'

function getJobPhase(status: string, providerId?: number | null): JobPhase {
  if (status === 'completed') return 'completed'
  if (['failed', 'permanently_failed', 'cancelled'].includes(status)) return 'failed'
  if (status === 'running') return 'running'
  if (status === 'pending' && providerId) return 'assigned'
  return 'queued'
}

const JOB_PHASES: { id: JobPhase; label: string }[] = [
  { id: 'queued',    label: 'Queued' },
  { id: 'assigned',  label: 'Assigned' },
  { id: 'running',   label: 'Running' },
  { id: 'completed', label: 'Done' },
]

function JobStateMachine({ status, providerId, providerGpu, failureReason }: {
  status: string
  providerId?: number | null
  providerGpu: string | null
  failureReason?: string | null
}) {
  const phase = getJobPhase(status, providerId)
  const isFailed = phase === 'failed'
  const activeIdx = isFailed
    ? JOB_PHASES.findIndex(p => p.id === 'running')
    : JOB_PHASES.findIndex(p => p.id === phase)
  return (
    <div className="card p-4">
      <div className="flex items-center gap-0">
        {JOB_PHASES.map((p, i) => {
          const done = i < activeIdx
          const active = i === activeIdx && !isFailed
          const failed = isFailed && i === activeIdx
          return (
            <div key={p.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                  failed ? 'border-status-error bg-status-error/20 text-status-error' :
                  done ? 'border-status-success bg-status-success text-white' :
                  active ? 'border-dc1-amber bg-dc1-amber/10 text-dc1-amber animate-pulse' :
                  'border-dc1-border bg-dc1-surface-l2 text-dc1-text-muted'
                }`}>
                  {failed ? '✕' : done ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] whitespace-nowrap font-medium ${
                  failed ? 'text-status-error' : active ? 'text-dc1-amber' : done ? 'text-status-success' : 'text-dc1-text-muted'
                }`}>{p.label}</span>
              </div>
              {i < JOB_PHASES.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-status-success' : 'bg-dc1-border'}`} />}
            </div>
          )
        })}
      </div>
      {isFailed && (
        <p className="text-xs text-status-error mt-2 text-center">
          Job failed{failureReason ? ` — ${failureReason}` : ''}
        </p>
      )}
      {providerGpu && phase === 'running' && <p className="text-xs text-dc1-text-muted mt-2 text-center">Running on {providerGpu}</p>}
    </div>
  )
}

// ── Live Metrics ──────────────────────────────────────────────────────────────
function LiveMetrics({ job }: { job: JobDetail }) {
  const [elapsedSecs, setElapsedSecs] = useState(0)
  useEffect(() => {
    if (job.status !== 'running' || !job.started_at) return
    const start = new Date(job.started_at).getTime()
    const tick = () => setElapsedSecs(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [job.status, job.started_at])
  if (job.status !== 'running') return null
  const hh = Math.floor(elapsedSecs / 3600).toString().padStart(2, '0')
  const mm = Math.floor((elapsedSecs % 3600) / 60).toString().padStart(2, '0')
  const ss = (elapsedSecs % 60).toString().padStart(2, '0')
  const currentCostSar = ((job.actual_cost_halala || 0) / 100).toFixed(4)
  return (
    <div className="bg-dc1-surface-l1 border border-dc1-amber/20 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
        <span className="text-dc1-text-muted uppercase tracking-wide">Running</span>
      </div>
      <div><span className="text-dc1-text-muted">Elapsed </span><span className="font-mono font-bold text-dc1-text-primary">{hh}:{mm}:{ss}</span></div>
      {job.provider_id && <div><span className="text-dc1-text-muted">Provider </span><span className="font-mono font-bold text-dc1-text-primary">#{job.provider_id}</span></div>}
      <div><span className="text-dc1-text-muted">Cost so far </span><span className="font-mono font-bold text-dc1-amber">{currentCostSar} SAR</span></div>
    </div>
  )
}

type StreamStatus = 'connecting' | 'live' | 'completed' | 'failed'
type LogDownloadSurface = 'logs_tab' | 'history_tab'

function LogStream({
  jobId,
  apiKey,
  onLogDownloadClick,
}: {
  jobId: string
  apiKey: string
  onLogDownloadClick: (surface: LogDownloadSurface, blocked: boolean) => void
}) {
  const { t } = useLanguage()
  const [lines, setLines] = useState<string[]>([])
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting')
  const [autoScroll, setAutoScroll] = useState(true)
  const [downloadHint, setDownloadHint] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const closedRef = useRef(false)

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }
    closedRef.current = false
    setStreamStatus('connecting')

    const url = `${API_BASE}/jobs/${encodeURIComponent(jobId)}/logs/stream?key=${encodeURIComponent(apiKey)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'log') {
          setLines(prev => [...prev, data.line])
          setStreamStatus('live')
        } else if (data.type === 'end') {
          setStreamStatus(data.status === 'completed' ? 'completed' : 'failed')
          es.close()
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      if (!closedRef.current) {
        setStreamStatus('failed')
      }
    }
  }, [jobId, apiKey])

  const disconnect = useCallback(() => {
    closedRef.current = true
    esRef.current?.close()
  }, [])

  useEffect(() => {
    if (!apiKey) return
    connect()

    const handleVisibility = () => {
      if (document.hidden) {
        disconnect()
      } else {
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [apiKey, connect, disconnect])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  const statusLabel: Record<StreamStatus, string> = {
    connecting: t('renter.job_detail.logs_status_connecting'),
    live: t('renter.job_detail.logs_status_live'),
    completed: t('renter.job_detail.logs_status_completed'),
    failed: t('renter.job_detail.logs_status_disconnected'),
  }

  const statusColor: Record<StreamStatus, string> = {
    connecting: 'text-dc1-text-muted',
    live: 'text-green-400',
    completed: 'text-dc1-amber',
    failed: 'text-status-error',
  }
  const hasApiKey = Boolean(apiKey)
  const logDownloadUrl = hasApiKey
    ? `${API_BASE}/jobs/${encodeURIComponent(jobId)}/logs?since=0&limit=1000&key=${encodeURIComponent(apiKey)}`
    : ''

  if (!hasApiKey) {
    return (
      <div className="space-y-3">
        <p className="text-dc1-text-muted text-sm">{t('renter.job_detail.auth_required')}</p>
        <div className="text-end">
          <button
            type="button"
            className="text-sm text-dc1-text-muted underline decoration-dotted"
            onClick={() => {
              setDownloadHint(t('renter.job_detail.auth_required'))
              onLogDownloadClick('logs_tab', true)
            }}
          >
            {t('renter.job_detail.logs_download_full')}
          </button>
          {downloadHint && (
            <p className="mt-2 text-xs text-status-error">{downloadHint}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {streamStatus === 'live' && (
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
          )}
          <span className={`text-sm font-medium ${statusColor[streamStatus]}`}>
            {statusLabel[streamStatus]}
          </span>
          {lines.length > 0 && (
            <span className="text-xs text-dc1-text-muted">· {lines.length} {t('renter.job_detail.logs_lines')}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-dc1-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="accent-amber-500 h-4 w-4"
            />
            {t('renter.job_detail.logs_auto_scroll')}
          </label>
          {(streamStatus === 'failed' || streamStatus === 'completed') && (
            <button
              onClick={() => { setLines([]); connect() }}
              className="text-sm text-dc1-amber hover:underline"
            >
              {t('renter.job_detail.logs_reconnect')}
            </button>
          )}
        </div>
      </div>

      {/* Terminal window */}
      <div className="rounded-lg border border-dc1-border overflow-hidden" style={{ background: '#07070e' }}>
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-dc1-border/40" style={{ background: '#0d0d16' }}>
          <span className="h-3 w-3 rounded-full bg-red-500/60" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
          <span className="h-3 w-3 rounded-full bg-green-500/60" />
          <span className="ml-2 text-xs text-dc1-text-muted font-mono">
            {t('renter.job_detail.logs_terminal_prefix')} {jobId} · {t('renter.job_detail.logs_terminal_streams')}
          </span>
        </div>
        <div
          className="h-72 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
          style={{ scrollbarColor: '#F5A524 #07070e' }}
          role="log"
          aria-label={t('renter.job_detail.logs_aria')}
          aria-live="polite"
        >
          {lines.length === 0 ? (
            <span className="text-dc1-text-muted/60 italic">
              {streamStatus === 'connecting'
                ? t('renter.job_detail.logs_connecting_hint')
                : t('renter.job_detail.logs_empty_hint')}
            </span>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="text-green-300/90 whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
          {streamStatus === 'live' && (
            <span
              className="inline-block h-[1em] w-2 bg-dc1-amber animate-pulse align-text-bottom ml-0.5"
              aria-hidden="true"
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Download link */}
      <div className="text-end">
        {hasApiKey ? (
          <a
            href={logDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-dc1-amber hover:underline"
            download={`dcp-job-${jobId}.log`}
            onClick={() => {
              setDownloadHint('')
              onLogDownloadClick('logs_tab', false)
            }}
          >
            {t('renter.job_detail.logs_download_full')}
          </a>
        ) : (
          <button
            type="button"
            className="text-sm text-dc1-text-muted underline decoration-dotted"
            onClick={() => {
              setDownloadHint(t('renter.job_detail.auth_required'))
              onLogDownloadClick('logs_tab', true)
            }}
          >
            {t('renter.job_detail.logs_download_full')}
          </button>
        )}
        {downloadHint && (
          <p className="mt-2 text-xs text-status-error">{downloadHint}</p>
        )}
      </div>
    </div>
  )
}

function HistoryTab({
  jobId,
  apiKey,
  job,
  onLogDownloadClick,
}: {
  jobId: string
  apiKey: string
  job: JobDetail
  onLogDownloadClick: (surface: LogDownloadSurface, blocked: boolean) => void
}) {
  const { t } = useLanguage()
  const [history, setHistory] = useState<ExecutionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloadHint, setDownloadHint] = useState('')

  useEffect(() => {
    if (!apiKey) {
      setLoading(false)
      setHistory(null)
      return
    }
    fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/executions`, {
      headers: { 'x-renter-key': apiKey },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setHistory(data))
      .catch(() => setHistory(null))
      .finally(() => setLoading(false))
  }, [jobId, apiKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" />
      </div>
    )
  }

  const quotedSAR = ((history?.cost_halala || job.cost_halala || 0) / 100).toFixed(2)
  const actualSAR = ((history?.actual_cost_halala || job.actual_cost_halala || 0) / 100).toFixed(2)
  const executions = history?.executions || []
  const hasApiKey = Boolean(apiKey)
  const logDownloadUrl = hasApiKey
    ? `${API_BASE}/jobs/${encodeURIComponent(jobId)}/logs?since=0&limit=1000&key=${encodeURIComponent(apiKey)}`
    : ''

  if (!hasApiKey) {
    return (
      <div className="card">
        <p className="text-dc1-text-muted text-sm">{t('renter.job_detail.auth_required')}</p>
        <div className="text-end mt-3">
          <button
            type="button"
            className="text-xs text-dc1-text-muted underline decoration-dotted"
            onClick={() => {
              setDownloadHint(t('renter.job_detail.auth_required'))
              onLogDownloadClick('history_tab', true)
            }}
          >
            {t('renter.job_detail.history_download_logs')}
          </button>
          {downloadHint && (
            <p className="mt-2 text-xs text-status-error">{downloadHint}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cost breakdown */}
      <div className="card">
        <h2 className="section-heading mb-4">{t('renter.job_detail.history_cost_breakdown')}</h2>
        <DetailRow label={t('renter.job_detail.history_quoted_cost')} value={`${quotedSAR} SAR`} />
        <DetailRow label={t('renter.job_detail.history_actual_cost')} value={`${actualSAR} SAR`} highlight />
        <DetailRow label={t('renter.job_detail.history_retry_attempts')} value={String(job.retry_count || 0)} />
      </div>

      {/* Execution attempts */}
      <div className="card">
        <h2 className="section-heading mb-4">{t('renter.job_detail.history_execution_attempts')}</h2>
        {executions.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-dc1-text-muted text-sm">{t('renter.job_detail.history_empty_title')}</p>
            <p className="text-dc1-text-muted/60 text-xs mt-1">
              {t('renter.job_detail.history_empty_hint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {executions.map((ex) => {
              const duration = ex.started_at && ex.ended_at
                ? Math.round((new Date(ex.ended_at).getTime() - new Date(ex.started_at).getTime()) / 1000)
                : null
              const durationStr = duration != null
                ? duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`
                : '—'
              const costSAR = ((ex.cost_halala || 0) / 100).toFixed(4)

              return (
                <div
                  key={ex.attempt_number}
                  className="bg-dc1-surface-l2 rounded-lg px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-dc1-text-primary">
                      {t('renter.job_detail.history_attempt_label')} #{ex.attempt_number}
                    </span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${ex.exit_code === 0 ? 'bg-status-success/10 text-status-success' : ex.exit_code != null ? 'bg-status-error/10 text-status-error' : 'bg-dc1-surface-l1 text-dc1-text-muted'}`}>
                      {ex.exit_code != null
                        ? `${t('renter.job_detail.history_exit_code_prefix')} ${ex.exit_code}`
                        : t('renter.job_detail.history_pending')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <div className="text-dc1-text-muted">{t('renter.job_detail.history_started')}</div>
                      <div className="text-dc1-text-secondary font-mono">
                        {ex.started_at ? new Date(ex.started_at).toLocaleTimeString() : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-dc1-text-muted">{t('renter.job_detail.history_ended')}</div>
                      <div className="text-dc1-text-secondary font-mono">
                        {ex.ended_at ? new Date(ex.ended_at).toLocaleTimeString() : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-dc1-text-muted">{t('renter.job_detail.history_duration')}</div>
                      <div className="text-dc1-text-secondary">{durationStr}</div>
                    </div>
                    <div>
                      <div className="text-dc1-text-muted">{t('renter.job_detail.history_gpu_seconds')}</div>
                      <div className="text-dc1-text-secondary">
                        {ex.gpu_seconds_used ? ex.gpu_seconds_used.toFixed(1) : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-dc1-text-muted">{t('renter.job_detail.history_cost_prefix')} {costSAR} SAR</span>
                    {hasApiKey ? (
                      <a
                        href={logDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-dc1-amber hover:underline"
                        onClick={() => {
                          setDownloadHint('')
                          onLogDownloadClick('history_tab', false)
                        }}
                      >
                        {t('renter.job_detail.history_download_logs')}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-dc1-text-muted underline decoration-dotted"
                        onClick={() => {
                          setDownloadHint(t('renter.job_detail.auth_required'))
                          onLogDownloadClick('history_tab', true)
                        }}
                      >
                        {t('renter.job_detail.history_download_logs')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {downloadHint && (
          <p className="mt-2 text-xs text-status-error">{downloadHint}</p>
        )}
      </div>
    </div>
  )
}

interface RetryState {
  open: boolean
  loading: boolean
  error: string
  requiredHalala: number | null
}

type TabId = 'overview' | 'logs' | 'history'

const MODEL_VARIANTS: Record<string, string> = {
  'meta-llama/meta-llama-3-8b-instruct': 'google/gemma-2b-it',
  'mistralai/mistral-7b-instruct-v0.2': 'google/gemma-2b-it',
  'qwen/qwen2-7b-instruct': 'google/gemma-2b-it',
  'deepseek-ai/deepseek-r1-distill-qwen-7b': 'google/gemma-2b-it',
  'deepseek-ai/deepseek-r1-distill-llama-8b': 'google/gemma-2b-it',
  'microsoft/phi-3-mini-4k-instruct': 'tinyllama/tinyllama-1.1b-chat-v1.0',
  'google/gemma-2b-it': 'tinyllama/tinyllama-1.1b-chat-v1.0',
}

function selectVariantModel(model: string | null) {
  if (!model) return null
  const key = model.trim().toLowerCase()
  if (!key) return null
  if (MODEL_VARIANTS[key]) return MODEL_VARIANTS[key]
  if (key.includes('stable-diffusion')) return null
  if (key.includes('tinyllama')) return null
  return 'google/gemma-2b-it'
}

function formatJobDuration(job: JobDetail) {
  if (job.completed_at && job.submitted_at) {
    const secs = Math.round((new Date(job.completed_at).getTime() - new Date(job.submitted_at).getTime()) / 1000)
    return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`
  }
  if (job.actual_duration_minutes) {
    return `${job.actual_duration_minutes} min`
  }
  return '—'
}

export default function RenterJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t } = useLanguage()
  const jobId = params.id as string
  const [job, setJob] = useState<JobDetail | null>(null)
  const [output, setOutput] = useState<JobOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [renterName, setRenterName] = useState(t('playground.default_renter_name'))
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState<RetryState>({ open: false, loading: false, error: '', requiredHalala: null })
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [providerGpu, setProviderGpu] = useState<string | null>(null)
  const [exportError, setExportError] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateFeedback, setTemplateFeedback] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const viewedSummaryRef = useRef<string | null>(null)

  const trackJobEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = { event, ...payload }
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
    const win = window as Window & {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    }
    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(detail)
    }
    if (typeof win.gtag === 'function') {
      win.gtag('event', event, payload)
    }
  }, [])
  const trackLogDownloadClick = useCallback((surface: LogDownloadSurface, blocked: boolean) => {
    trackJobEvent(blocked ? 'log_download_auth_missing' : 'log_download_clicked', {
      source: 'job_detail',
      surface,
      job_id: job?.id ?? null,
      status: job?.status ?? null,
    })
  }, [job?.id, job?.status, trackJobEvent])
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

  useEffect(() => {
    const key = localStorage.getItem('dc1_renter_key')
    if (!key) {
      router.push('/login')
      return
    }
    setApiKey(key)

    const fetchData = async () => {
      try {
        const meRes = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
        if (!meRes.ok) {
          localStorage.removeItem('dc1_renter_key')
          router.push('/login')
          return
        }
        const meData = await meRes.json()
        setRenterName(meData.renter?.name || 'Renter')

        const jobRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
          headers: { 'x-renter-key': key },
        })
        if (!jobRes.ok) {
          setError(t('renter.job_detail.not_found_or_denied'))
          return
        }
        const jobData = await jobRes.json()
        setJob(jobData.job || null)

        if (jobData.job?.status === 'completed') {
          try {
            const outRes = await fetch(`${API_BASE}/jobs/${jobData.job.id}/output`, {
              headers: {
                Accept: 'application/json',
                'x-renter-key': key,
              },
            })
            if (outRes.ok) {
              const outData = await outRes.json()
              setOutput(outData)
            }
          } catch { /* output may not exist */ }
        }
      } catch (err) {
        console.error('Failed to load job:', err)
        setError(t('renter.job_detail.load_failed'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [jobId, router, t])

  useEffect(() => {
    if (!job?.provider_id) {
      setProviderGpu(null)
      return
    }
    fetch(`${API_BASE}/renters/available-providers`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const match = (data?.providers || []).find((p: { id: number; gpu_model?: string }) => p.id === job.provider_id)
        setProviderGpu(match?.gpu_model || null)
      })
      .catch(() => setProviderGpu(null))
  }, [job?.provider_id])

  const confirmRetry = async () => {
    if (!job) return
    setRetry(r => ({ ...r, loading: true, error: '' }))

    try {
      const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(job.id))}/retry?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'x-renter-key': apiKey },
      })
      if (res.status === 402) {
        const err = await res.json().catch(() => ({}))
        setRetry(r => ({
          ...r,
          loading: false,
          error: 'insufficient_balance',
          requiredHalala: Number(err.required_halala || r.requiredHalala || 0),
        }))
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRetry(r => ({ ...r, loading: false, error: err.error || t('renter.job_detail.retry_submit_failed') }))
        return
      }
      const data = await res.json()
      const newId = data.job?.id || data.id || null
      trackJobEvent('retry_from_summary', {
        source: 'job_detail',
        job_id: job.id,
        model: job.model || null,
        job_type: job.job_type,
      })
      setRetry({ open: false, loading: false, error: '', requiredHalala: null })
      if (newId) {
        router.push(`/renter/jobs/${newId}`)
      }
    } catch {
      setRetry(r => ({ ...r, loading: false, error: t('renter.job_detail.network_retry') }))
    }
  }

  const cost = job ? (job.actual_cost_halala || 0) / 100 : 0
  const durationStr = job ? formatJobDuration(job) : '—'
  let parsedParams: Record<string, unknown> | null = null
  if (job?.params) {
    try {
      parsedParams = JSON.parse(job.params)
    } catch { /* ignore */ }
  }
  const modelName = job
    ? (output?.model || (typeof parsedParams?.model === 'string' ? parsedParams.model : null) || job.model || '—')
    : '—'
  const providerGpuLabel = providerGpu || t('renter.job_detail.unavailable')
  const variantModel = selectVariantModel(modelName === '—' ? null : String(modelName))
  const canExportOutput = Boolean((output?.type === 'text' && output?.response) || (output?.type === 'image' && output?.image_base64))

  useEffect(() => {
    if (!job || !modelName) return
    if (viewedSummaryRef.current === String(job.id)) return
    trackJobEvent('job_summary_viewed', {
      source: 'job_detail',
      job_id: job.id,
      status: job.status,
      model: modelName,
      provider_gpu: providerGpuLabel,
    })
    viewedSummaryRef.current = String(job.id)
  }, [job, modelName, providerGpuLabel, trackJobEvent])

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName={t('playground.default_renter_name')}>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !job) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName={renterName}>
        <div className="space-y-4">
          <Link href="/renter/jobs" className="text-dc1-amber text-sm hover:underline">&larr; {t('renter.job_detail.back_to_jobs')}</Link>
          <div className="card p-8 text-center space-y-4">
            <p className="text-dc1-text-secondary">{error || t('renter.job_detail.not_found')}</p>
            {error && (
              <button
                onClick={() => { setError(''); setLoading(true); window.location.reload() }}
                className="btn btn-secondary btn-sm"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const goToVariantRun = () => {
    if (!variantModel) return
    const params = new URLSearchParams()
    params.set('mode', job.job_type === 'image_generation' ? 'image_generation' : 'llm_inference')
    params.set('model', variantModel)
    if (job.provider_id) params.set('provider', String(job.provider_id))
    trackJobEvent('variant_run_clicked', {
      source: 'job_detail',
      job_id: job.id,
      from_model: modelName,
      to_model: variantModel,
      job_type: job.job_type,
    })
    router.push(`/renter/playground?${params.toString()}`)
  }

  const exportOutput = () => {
    if (!output) return
    setExportError('')
    if (output.type === 'text' && output.response) {
      const textBlob = new Blob([output.response], { type: 'text/plain;charset=utf-8' })
      const href = URL.createObjectURL(textBlob)
      const link = document.createElement('a')
      link.href = href
      link.download = `dcp-job-${job.id}-output.txt`
      link.click()
      URL.revokeObjectURL(href)
      trackJobEvent('output_exported', { source: 'job_detail', job_id: job.id, format: 'txt', output_type: 'text' })
      return
    }
    if (output.type === 'image' && output.image_base64) {
      const link = document.createElement('a')
      link.href = `data:image/${output.format || 'png'};base64,${output.image_base64}`
      link.download = `dcp-job-${job.id}-output.${output.format || 'png'}`
      link.click()
      trackJobEvent('output_exported', { source: 'job_detail', job_id: job.id, format: output.format || 'png', output_type: 'image' })
      return
    }
    setExportError(t('renter.job_detail.export_unavailable'))
  }

  const copyTextOutput = async () => {
    if (!output?.response) return
    try {
      await navigator.clipboard.writeText(output.response)
      setCopyFeedback(t('renter.job_detail.copy_success'))
    } catch {
      setCopyFeedback(t('renter.job_detail.copy_failed'))
    }
  }

  const saveAsTemplate = async () => {
    if (!job || templateSaving) return
    setTemplateSaving(true)
    setTemplateFeedback('')
    let parsed: Record<string, unknown> = {}
    try {
      if (job.params) parsed = JSON.parse(job.params)
    } catch { /* keep fallback payload */ }
    try {
      const templateDate = new Date().toISOString().slice(0, 10)
      const templateName = `${(job.job_type || 'job').replace(/_/g, ' ')} - ${templateDate}`
      const res = await fetch(`${API_BASE}/renters/me/templates?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          job_type: job.job_type,
          model: parsed.model || job.model || job.job_type,
          resource_spec_json: JSON.stringify(parsed),
        }),
      })
      if (!res.ok) {
        setTemplateFeedback(t('renter.job_detail.template_save_failed'))
        return
      }
      setTemplateFeedback(t('renter.job_detail.template_save_success'))
    } catch {
      setTemplateFeedback(t('renter.job_detail.template_save_failed'))
    } finally {
      setTemplateSaving(false)
    }
  }

  const isTerminal = ['completed', 'failed', 'permanently_failed', 'cancelled'].includes(job.status)
  const isCompleted = job.status === 'completed'
  const isFailed = ['failed', 'permanently_failed'].includes(job.status)
  const failureMessages = isFailed ? getFailureMessages(job) : []
  const primaryFailureReason = failureMessages[0] || null
  const hasTextOutput = Boolean(output?.type === 'text' && output?.response)
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('renter.job_detail.tab_overview') },
    { id: 'logs', label: t('renter.job_detail.tab_logs') },
    { id: 'history', label: t('renter.job_detail.tab_history') },
  ]

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterName}>
      <div className="space-y-6 max-w-3xl">
        {/* Back link */}
        <Link href="/renter/jobs" className="text-dc1-amber text-sm hover:underline">&larr; {t('renter.job_detail.back_to_jobs')}</Link>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">{t('renter.job_detail.title')}</h1>
            <p className="text-dc1-text-muted text-sm font-mono mt-1">{job.job_id || `#${job.id}`}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status as any} />
            {isFailed && (
              <button
                onClick={() => setRetry(r => ({ ...r, open: true, error: '', requiredHalala: Number(job.cost_halala || 0) }))}
                className="btn btn-primary text-sm min-h-[44px] px-4"
                aria-label={t('renter.job_detail.retry_job_aria')}
              >
                {t('renter.retry_job')}
              </button>
            )}
          </div>
        </div>

        <JobStateMachine status={job.status} providerId={job.provider_id} providerGpu={providerGpu} failureReason={primaryFailureReason} />
        <LiveMetrics job={job} />

        {isFailed && (
          <div className="card border-status-error/30 bg-status-error/5">
            <h2 className="section-heading text-status-error mb-2">Failure reason</h2>
            {failureMessages.length > 0 ? (
              <div className="space-y-2">
                {failureMessages.map((message, idx) => (
                  <p key={`${idx}-${message}`} className="text-sm text-status-error break-words">
                    {message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-dc1-text-secondary">No failure reason was recorded for this job.</p>
            )}
          </div>
        )}

        {(isCompleted || isFailed) && (
          <div className={`card ${isFailed ? 'border-status-error/30 bg-status-error/5' : 'border-dc1-amber/30'}`}>
            <h2 className={`section-heading mb-2 ${isFailed ? 'text-status-error' : ''}`}>
              {isFailed ? t('renter.job_detail.next_step_failed_title') : t('renter.job_detail.next_actions_title')}
            </h2>
            <p className="text-sm text-dc1-text-secondary mb-4">
              {isFailed
                ? t('renter.job_detail.next_step_failed_desc')
                : t('renter.job_detail.next_actions_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              {isFailed ? (
                <>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className="btn btn-primary text-sm min-h-[40px] px-4"
                  >
                    {t('renter.job_detail.review_failure_logs')}
                  </button>
                  <button
                    onClick={() => setRetry(r => ({ ...r, open: true, error: '', requiredHalala: Number(job.cost_halala || 0) }))}
                    className="btn btn-secondary text-sm min-h-[40px] px-4"
                  >
                    {t('renter.job_detail.retry_this_job')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setRetry(r => ({ ...r, open: true, error: '', requiredHalala: Number(job.cost_halala || 0) }))}
                    className="btn btn-primary text-sm min-h-[40px] px-4"
                  >
                    {t('renter.job_detail.retry_same_params')}
                  </button>
                  <button
                    onClick={goToVariantRun}
                    className="btn btn-secondary text-sm min-h-[40px] px-4"
                    disabled={!variantModel}
                    title={variantModel ? `${t('renter.job_detail.switch_to_prefix')} ${variantModel}` : t('renter.job_detail.no_variant_available')}
                  >
                    {t('renter.job_detail.run_similar_variant')}
                  </button>
                  <button
                    onClick={saveAsTemplate}
                    className="btn btn-secondary text-sm min-h-[40px] px-4"
                    disabled={templateSaving}
                  >
                    {templateSaving ? t('renter.job_detail.saving') : t('renter.job_detail.save_as_template')}
                  </button>
{modelName && modelName !== '—' && (
                    <Link href={`/renter/models?deploy=${encodeURIComponent(modelName)}`} className="btn btn-secondary text-sm min-h-[40px] px-4">
                      🚀 Re-deploy {modelName.split('/').pop()}
                    </Link>
                  )}
                  <button
                    onClick={hasTextOutput ? copyTextOutput : exportOutput}
                    className="btn btn-secondary text-sm min-h-[40px] px-4"
                    disabled={!canExportOutput}
                    title={canExportOutput ? t('renter.job_detail.copy_or_export') : t('renter.job_detail.output_action_after_completion')}
                  >
                    {hasTextOutput ? t('renter.job_detail.copy_output') : t('renter.job_detail.export_output')}
                  </button>
                </>
              )}
            </div>
            {templateFeedback && <p className="mt-2 text-xs text-dc1-text-muted">{templateFeedback}</p>}
            {copyFeedback && <p className="mt-2 text-xs text-dc1-text-muted">{copyFeedback}</p>}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-dc1-border" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-dc1-amber text-dc1-amber'
                  : 'border-transparent text-dc1-text-muted hover:text-dc1-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="card border-dc1-amber/30">
              <h2 className="section-heading mb-4">{t('renter.job_detail.summary_title')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-dc1-surface-l2 rounded-lg px-3 py-2">
                  <div className="text-dc1-text-muted text-xs">{t('renter.job_detail.summary_status')}</div>
                  <div className="text-dc1-text-primary font-semibold">{job.status}</div>
                </div>
                <div className="bg-dc1-surface-l2 rounded-lg px-3 py-2">
                  <div className="text-dc1-text-muted text-xs">{t('renter.job_detail.summary_duration')}</div>
                  <div className="text-dc1-text-primary font-semibold">{durationStr}</div>
                </div>
                <div className="bg-dc1-surface-l2 rounded-lg px-3 py-2">
                  <div className="text-dc1-text-muted text-xs">{t('renter.job_detail.summary_billed_cost')}</div>
                  <div className="text-dc1-amber font-semibold">{cost > 0 ? `${cost.toFixed(2)} SAR` : '—'}</div>
                </div>
                <div className="bg-dc1-surface-l2 rounded-lg px-3 py-2">
                  <div className="text-dc1-text-muted text-xs">{t('renter.job_detail.summary_model')}</div>
                  <div className="text-dc1-text-primary font-mono text-xs break-all">{modelName}</div>
                </div>
                <div className="bg-dc1-surface-l2 rounded-lg px-3 py-2 sm:col-span-2">
                  <div className="text-dc1-text-muted text-xs">{t('renter.job_detail.summary_provider_gpu')}</div>
                  <div className="text-dc1-text-primary">{providerGpuLabel}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setRetry(r => ({ ...r, open: true, error: '', requiredHalala: Number(job.cost_halala || 0) }))}
                  className="btn btn-primary text-sm min-h-[40px] px-4"
                  disabled={!isTerminal}
                  title={isTerminal ? t('renter.job_detail.retry_same_parameters') : t('renter.job_detail.retry_after_completion')}
                >
                  {t('renter.job_detail.retry_same_params')}
                </button>
                <button
                  onClick={goToVariantRun}
                  className="btn btn-secondary text-sm min-h-[40px] px-4"
                  disabled={!variantModel}
                  title={variantModel ? `${t('renter.job_detail.switch_to_prefix')} ${variantModel}` : t('renter.job_detail.no_variant_available')}
                >
                  {t('renter.job_detail.run_cheaper_faster_variant')}
                </button>
                <button
                  onClick={exportOutput}
                  className="btn btn-secondary text-sm min-h-[40px] px-4"
                  disabled={!canExportOutput}
                  title={canExportOutput ? t('renter.job_detail.export_current_output') : t('renter.job_detail.export_after_completion')}
                >
                  {t('renter.job_detail.export_output')}
                </button>
              </div>
              {exportError && (
                <p className="mt-2 text-xs text-status-error">{exportError}</p>
              )}
              <p className="mt-3 text-xs text-dc1-text-muted">
                {t('renter.job_detail.logs_tab_hint')}
              </p>
            </div>

            {/* Job Info */}
            <div className="card">
              <h2 className="section-heading mb-4">{t('renter.job_detail.info')}</h2>
              <DetailRow label={t('renter.job_detail.info_job_type')} value={(job.job_type || '').replace(/_/g, ' ')} />
              <DetailRow label={t('renter.job_detail.info_status')} value={job.status} />
              {job.progress_phase && <DetailRow label={t('renter.job_detail.info_progress')} value={job.progress_phase.replace(/_/g, ' ')} />}
              <DetailRow label={t('renter.job_detail.info_submitted')} value={job.submitted_at ? new Date(job.submitted_at).toLocaleString() : '—'} />
              <DetailRow label={t('renter.job_detail.info_started')} value={job.started_at ? new Date(job.started_at).toLocaleString() : '—'} />
              <DetailRow label={t('renter.job_detail.info_completed')} value={job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'} />
              <DetailRow label={t('renter.job_detail.info_duration')} value={durationStr} />
              <DetailRow label={t('renter.job_detail.info_cost')} value={cost > 0 ? `${cost.toFixed(2)} SAR` : '—'} highlight />
            </div>

            {/* Job Parameters */}
            {parsedParams && (
              <div className="card">
                <h2 className="section-heading mb-4">{t('renter.job_detail.params')}</h2>
                {Object.entries(parsedParams).map(([key, value]) => (
                  <DetailRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} mono />
                ))}
              </div>
            )}

            {/* Output */}
            {output && (
              <div className="card">
                <h2 className="section-heading mb-4">{t('renter.job_detail.output')}</h2>
                {output.type === 'text' && output.response && (
                  <div className="space-y-3">
                    <div className="bg-dc1-surface-l2 rounded-lg p-4">
                      <pre className="text-sm text-dc1-text-primary whitespace-pre-wrap break-words">{output.response}</pre>
                    </div>
                    {output.tokens_generated && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold">{output.tokens_generated}</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.output_tokens')}</div>
                        </div>
                        {output.tokens_per_second && (
                          <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                            <div className="text-dc1-text-primary font-semibold">{output.tokens_per_second.toFixed(1)}</div>
                            <div className="text-dc1-text-muted">{t('renter.job_detail.output_tokens_per_sec')}</div>
                          </div>
                        )}
                        {output.gen_time_s && (
                          <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                            <div className="text-dc1-text-primary font-semibold">{output.gen_time_s.toFixed(1)}s</div>
                            <div className="text-dc1-text-muted">{t('renter.job_detail.output_gen_time')}</div>
                          </div>
                        )}
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold">{output.model || '—'}</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.summary_model')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {output.type === 'image' && output.image_base64 && (
                  <div className="space-y-3">
                    <img
                      src={`data:image/${output.format || 'png'};base64,${output.image_base64}`}
                      alt={t('renter.job_detail.generated_image_alt')}
                      className="rounded-lg max-w-full border border-dc1-border"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      {output.width && output.height && (
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold">{output.width}x{output.height}</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.output_resolution')}</div>
                        </div>
                      )}
                      {output.steps && (
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold">{output.steps}</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.output_steps')}</div>
                        </div>
                      )}
                      {output.seed != null && (
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold font-mono">{output.seed}</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.output_seed')}</div>
                        </div>
                      )}
                      {output.gen_time_s && (
                        <div className="bg-dc1-surface-l2 rounded p-2 text-center">
                          <div className="text-dc1-text-primary font-semibold">{output.gen_time_s.toFixed(1)}s</div>
                          <div className="text-dc1-text-muted">{t('renter.job_detail.output_gen_time')}</div>
                        </div>
                      )}
                    </div>
                  </div>
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
        )}

        {/* Tab: Live Logs */}
        {activeTab === 'logs' && (
          <div className="card">
            <h2 className="section-heading mb-4">{t('renter.job_detail.live_logs')}</h2>
            <LogStream jobId={String(job.id)} apiKey={apiKey} onLogDownloadClick={trackLogDownloadClick} />
            {isTerminal && (
              <p className="mt-3 text-xs text-dc1-text-muted">
                {t('renter.job_detail.finished_hint')}
              </p>
            )}
          </div>
        )}

        {/* Tab: History */}
        {activeTab === 'history' && (
          <HistoryTab jobId={String(job.id)} apiKey={apiKey} job={job} onLogDownloadClick={trackLogDownloadClick} />
        )}
      </div>

      {/* Retry Confirmation Modal */}
      {retry.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="retry-modal-title"
        >
          <div className="card w-full max-w-md p-6 space-y-5">
            <h2 id="retry-modal-title" className="text-lg font-bold text-dc1-text-primary">
              {t('renter.job_detail.retry_title')}
            </h2>
            <p className="text-dc1-text-secondary text-sm">
              {t('renter.job_detail.retry_confirm_prefix')} {((retry.requiredHalala || 0) / 100).toFixed(2)} SAR {t('renter.job_detail.retry_confirm_suffix')}
            </p>
            <div className="bg-dc1-surface-l2 rounded-lg px-4 py-3 text-sm font-mono text-dc1-text-secondary">
                <span className="text-dc1-text-muted">{t('table.type')}: </span>{(job.job_type || '').replace(/_/g, ' ')}
              <br />
              <span className="text-dc1-text-muted">{t('table.job_id')}: </span>{job.job_id || `#${job.id}`}
            </div>

            {retry.error === 'insufficient_balance' ? (
              <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
                {t('renter.job_detail.insufficient_balance_prefix')}{' '}
                <Link href="/renter/billing" className="underline font-semibold">{t('renter.job_detail.top_up_balance')}</Link>{' '}
                {t('renter.job_detail.insufficient_balance_suffix')}
              </div>
            ) : retry.error ? (
              <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
                {retry.error}
              </div>
            ) : null}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRetry(r => ({ ...r, open: false, error: '' }))}
                disabled={retry.loading}
                className="btn btn-secondary min-h-[44px] px-4"
              >
                {t('admin.pricing.cancelBtn')}
              </button>
              <button
                onClick={confirmRetry}
                disabled={retry.loading}
                className="btn btn-primary min-h-[44px] px-5 flex items-center gap-2"
              >
                {retry.loading && (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                {retry.loading ? t('renter.job_detail.retrying') : t('renter.retry_job')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
