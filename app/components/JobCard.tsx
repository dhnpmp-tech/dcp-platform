'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const API_BASE = '/api'

const SAR_TO_USD = 1 / 3.75

export interface Job {
  id: number
  job_id: string
  job_type: string
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  submitted_at: string
  started_at?: string
  completed_at?: string
  actual_cost_halala: number
  actual_duration_minutes?: number
  price_per_hour_halala?: number
  params?: string | null
  container_spec?: string | null
  gpu_type?: string | null
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[status] ?? 'bg-dc1-surface-l3 text-dc1-text-secondary'}`}>
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-dc1-amber me-1.5 animate-pulse" />
      )}
      {status}
    </span>
  )
}

interface LiveJobState {
  status: string
  elapsedSec: number
  costUSD: number | null
}

function useLiveJobStream(jobId: string, renterKey: string, isActive: boolean): LiveJobState | null {
  const [live, setLive] = useState<LiveJobState | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!isActive || !renterKey) return

    const url = `${API_BASE}/jobs/${encodeURIComponent(jobId)}/stream?key=${encodeURIComponent(renterKey)}`
    const es = new EventSource(url)
    esRef.current = es

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setLive({
          status: data.status ?? 'running',
          elapsedSec: data.elapsed_sec ?? 0,
          costUSD: typeof data.cost_usd === 'number' ? data.cost_usd : null,
        })
      } catch { /* noop */ }
    }

    const EVENTS = ['job_queued', 'provider_assigned', 'job_starting', 'job_running', 'job_completed', 'job_failed']
    EVENTS.forEach(ev => es.addEventListener(ev, handleEvent))
    es.addEventListener('end', () => es.close())
    es.onerror = () => { es.close(); esRef.current = null }

    return () => { es.close(); esRef.current = null }
  }, [jobId, renterKey, isActive])

  return live
}

interface JobCardProps {
  job: Job
  renterKey: string
  onRedeploy?: (job: Job) => void
  compact?: boolean
}

export default function JobCard({ job, renterKey, onRedeploy, compact = false }: JobCardProps) {
  const isActive = job.status === 'running' || job.status === 'queued' || job.status === 'pending'
  const live = useLiveJobStream(job.job_id, renterKey, isActive)

  const model = getModelLabel(job)
  const submitted = formatDate(job.submitted_at)
  const currentStatus = live?.status ?? job.status

  const durationMins = live?.elapsedSec != null ? live.elapsedSec / 60 : job.actual_duration_minutes
  const duration = formatDuration(durationMins)

  let costDisplay: string
  if (live?.costUSD != null) {
    costDisplay = `$${live.costUSD.toFixed(4)} USD`
  } else if (job.actual_cost_halala) {
    costDisplay = `${formatSAR(job.actual_cost_halala)} SAR`
  } else {
    costDisplay = '—'
  }

  const canRedeploy = (job.status === 'completed' || job.status === 'failed') && !!job.params

  if (compact) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-dc1-surface-l2 border border-dc1-border rounded-lg hover:border-dc1-border-light transition-all group">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={currentStatus} />
            <span className="text-sm font-medium text-dc1-text-primary truncate">{model}</span>
            {job.gpu_type && <span className="text-xs text-dc1-text-muted">{job.gpu_type}</span>}
          </div>
          <p className="text-xs text-dc1-text-muted">{submitted}</p>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right sm:text-center">
            <p className="text-xs text-dc1-text-muted">Duration</p>
            <p className="text-sm font-medium text-dc1-text-primary">{duration}</p>
          </div>
          <div className="text-right sm:text-center min-w-[80px]">
            <p className="text-xs text-dc1-text-muted">Cost</p>
            <p className="text-sm font-semibold text-dc1-amber">{costDisplay}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/renter/jobs/${job.job_id}`}
            className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary underline-offset-2 hover:underline transition-colors"
          >
            Details
          </Link>
          {canRedeploy && onRedeploy && (
            <button
              onClick={() => onRedeploy(job)}
              className="text-xs px-3 py-1.5 rounded bg-dc1-surface-l3 text-dc1-text-primary hover:bg-dc1-amber/10 hover:text-dc1-amber border border-dc1-border hover:border-dc1-amber/40 transition-all"
            >
              Redeploy
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dc1-surface-l1 border border-dc1-amber/30 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={currentStatus} />
            <span className="text-sm font-semibold text-dc1-text-primary truncate">{model}</span>
          </div>
          {job.gpu_type && <p className="text-xs text-dc1-text-muted">{job.gpu_type}</p>}
          <p className="text-xs text-dc1-text-muted mt-0.5">{submitted}</p>
        </div>
        <Link
          href={`/renter/jobs/${job.job_id}`}
          className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary underline-offset-2 hover:underline transition-colors flex-shrink-0"
        >
          View logs →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-dc1-surface-l2 rounded p-3">
          <p className="text-xs text-dc1-text-muted mb-1">Elapsed</p>
          <p className="text-base font-semibold text-dc1-text-primary">{duration}</p>
        </div>
        <div className="bg-dc1-surface-l2 rounded p-3">
          <p className="text-xs text-dc1-text-muted mb-1">{isActive ? 'Live Cost' : 'Final Cost'}</p>
          <p className={`text-base font-semibold ${isActive ? 'text-dc1-amber' : 'text-dc1-text-primary'}`}>{costDisplay}</p>
        </div>
        {job.price_per_hour_halala != null && (
          <div className="bg-dc1-surface-l2 rounded p-3">
            <p className="text-xs text-dc1-text-muted mb-1">Rate</p>
            <p className="text-base font-semibold text-dc1-text-primary">{formatSAR(job.price_per_hour_halala)}/hr SAR</p>
          </div>
        )}
      </div>
      {canRedeploy && onRedeploy && (
        <div className="pt-1">
          <button
            onClick={() => onRedeploy(job)}
            className="text-sm px-4 py-2 rounded bg-dc1-surface-l3 text-dc1-text-primary hover:bg-dc1-amber/10 hover:text-dc1-amber border border-dc1-border hover:border-dc1-amber/40 transition-all"
          >
            Redeploy
          </button>
        </div>
      )}
    </div>
  )
}
