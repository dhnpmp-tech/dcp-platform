'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useLanguage, LanguageToggle } from '../lib/i18n'

const API = '/api'
const REFRESH_MS = 30_000
const HISTORY_MAX = 720

const SERVICE_ORDER = [
  'api',
  'gpu_network',
  'job_execution',
  'payments',
  'sync_bridge',
  'fallback_recovery',
] as const

type ServiceKey = (typeof SERVICE_ORDER)[number]
type ServiceStatus = 'operational' | 'degraded' | 'down' | 'checking'

interface ServiceCheck {
  key: ServiceKey
  titleKey: string
  descKey: string
  status: ServiceStatus
  detail: string
  latencyMs: number | null
  lastOkAt: string | null
}

interface IncidentRecord {
  id: string
  serviceKey: ServiceKey
  startedAt: string
  resolvedAt: string | null
  severity: 'degraded' | 'down'
}

type ServiceHistory = Record<ServiceKey, ServiceStatus[]>

type ServiceStatusMap = Record<ServiceKey, ServiceStatus>

type ServiceResult = {
  status: ServiceStatus
  detail: string
  latencyMs: number | null
  lastOkAt?: string | null
}

function statusColor(status: ServiceStatus) {
  switch (status) {
    case 'operational':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-400'
    case 'down':
      return 'bg-red-500'
    default:
      return 'bg-dc1-surface-l3 animate-pulse'
  }
}

function statusTextColor(status: ServiceStatus) {
  switch (status) {
    case 'operational':
      return 'text-emerald-400'
    case 'degraded':
      return 'text-amber-400'
    case 'down':
      return 'text-red-400'
    default:
      return 'text-dc1-text-muted'
  }
}

function toStatusLabel(status: ServiceStatus, t: (key: string) => string) {
  if (status === 'checking') return t('status.checking')
  if (status === 'operational') return t('status.operational')
  if (status === 'degraded') return t('status.degraded_service')
  return t('status.down')
}

function historyScore(status: ServiceStatus): number | null {
  if (status === 'operational') return 1
  if (status === 'degraded') return 0.5
  if (status === 'down') return 0
  return null
}

function availabilityPercent(samples: ServiceStatus[]) {
  if (samples.length === 0) return null
  const scored = samples.map(historyScore).filter((v): v is number => v !== null)
  if (scored.length === 0) return null
  const avg = scored.reduce((sum, v) => sum + v, 0) / scored.length
  return Math.round(avg * 10000) / 100
}

function formatDuration(minutes: number, t: (key: string) => string) {
  if (minutes < 60) return `${minutes} ${t('status.minutes')}`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return `${hours} ${t('status.hours')}`
  return `${hours} ${t('status.hours')} ${rem} ${t('status.minutes')}`
}

function formatStatusTime(iso: string | null, t: (key: string) => string) {
  if (!iso) return t('status.na')
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return t('status.na')
  return date.toLocaleString()
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return <span className={`inline-block h-3 w-3 flex-shrink-0 rounded-full ${statusColor(status)}`} aria-hidden="true" />
}

function OverallBanner({
  services,
  t,
}: {
  services: ServiceCheck[]
  t: (k: string) => string
}) {
  const statuses = services.map((s) => s.status)
  const hasDown = statuses.includes('down')
  const hasDegraded = statuses.includes('degraded')
  const allChecking = statuses.every((s) => s === 'checking')

  let bg = 'bg-emerald-500/10 border-emerald-500/30'
  let dot = 'bg-emerald-500'
  let label = t('status.all_operational')

  if (allChecking) {
    bg = 'bg-dc1-surface-l2 border-dc1-border'
    dot = 'bg-dc1-surface-l3 animate-pulse'
    label = t('status.checking')
  } else if (hasDown) {
    bg = 'bg-red-500/10 border-red-500/30'
    dot = 'bg-red-500'
    label = t('status.outage')
  } else if (hasDegraded) {
    bg = 'bg-amber-400/10 border-amber-400/30'
    dot = 'bg-amber-400'
    label = t('status.degraded')
  }

  return (
    <div className={`mb-8 flex items-center gap-3 rounded-xl border px-6 py-4 ${bg}`}>
      <span className={`h-4 w-4 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="text-lg font-semibold text-dc1-text-primary">{label}</span>
    </div>
  )
}

function ServiceRow({ svc, t }: { svc: ServiceCheck; t: (k: string) => string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dc1-border px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <StatusDot status={svc.status} />
          <p className="text-sm font-medium text-dc1-text-primary">{t(svc.titleKey)}</p>
        </div>
        <p className="mt-1 text-xs text-dc1-text-secondary">{t(svc.descKey)}</p>
        {svc.detail ? <p className="mt-1 text-xs text-dc1-text-muted">{svc.detail}</p> : null}
        {svc.lastOkAt ? (
          <p className="mt-1 text-xs text-dc1-text-muted">
            {t('status.last_ok')}: {formatStatusTime(svc.lastOkAt, t)}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <div className={`text-xs font-semibold ${statusTextColor(svc.status)}`}>{toStatusLabel(svc.status, t)}</div>
        <div className="mt-1 text-xs text-dc1-text-muted">
          {svc.latencyMs != null ? `${svc.latencyMs}ms` : t('status.na')}
        </div>
      </div>
    </div>
  )
}

function ScoreCard({
  title,
  value,
  caption,
}: {
  title: string
  value: string
  caption: string
}) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-dc1-text-muted">{title}</p>
      <p className="mt-2 text-2xl font-bold text-dc1-text-primary">{value}</p>
      <p className="mt-1 text-xs text-dc1-text-secondary">{caption}</p>
    </div>
  )
}

function IncidentCard({ incident, t }: { incident: IncidentRecord; t: (k: string) => string }) {
  const started = new Date(incident.startedAt)
  const resolved = incident.resolvedAt ? new Date(incident.resolvedAt) : null
  const isOpen = !resolved
  const end = resolved ?? new Date()
  const durationMins = Math.max(1, Math.round((end.getTime() - started.getTime()) / 60000))

  return (
    <div className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-dc1-text-primary">{t(`status.${incident.serviceKey}`)}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOpen ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
          {isOpen ? t('status.incident_open') : t('status.incident_resolved')}
        </span>
      </div>
      <p className="mt-2 text-xs text-dc1-text-secondary">
        {incident.severity === 'down' ? t('status.incident_major') : t('status.incident_minor')}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-dc1-text-muted sm:grid-cols-3">
        <p>
          {t('status.started')}: {formatStatusTime(incident.startedAt, t)}
        </p>
        <p>
          {t('status.ended')}: {isOpen ? t('status.in_progress') : formatStatusTime(incident.resolvedAt, t)}
        </p>
        <p>
          {t('status.duration')}: {formatDuration(durationMins, t)}
        </p>
      </div>
    </div>
  )
}

export default function StatusPage() {
  const { t, dir } = useLanguage()

  const initialServices = useMemo<ServiceCheck[]>(
    () => [
      { key: 'api', titleKey: 'status.api', descKey: 'status.api_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      { key: 'gpu_network', titleKey: 'status.gpu_network', descKey: 'status.gpu_network_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      { key: 'job_execution', titleKey: 'status.job_execution', descKey: 'status.job_execution_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      { key: 'payments', titleKey: 'status.payments', descKey: 'status.payments_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      { key: 'sync_bridge', titleKey: 'status.sync_bridge', descKey: 'status.sync_bridge_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      { key: 'fallback_recovery', titleKey: 'status.fallback_recovery', descKey: 'status.fallback_recovery_desc', status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
    ],
    []
  )

  const emptyHistory: ServiceHistory = {
    api: [],
    gpu_network: [],
    job_execution: [],
    payments: [],
    sync_bridge: [],
    fallback_recovery: [],
  }

  const [services, setServices] = useState<ServiceCheck[]>(initialServices)
  const [history, setHistory] = useState<ServiceHistory>(emptyHistory)
  const [incidents, setIncidents] = useState<IncidentRecord[]>([])
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [platformMetrics, setPlatformMetrics] = useState<{
    providers: { registered: number; online: number }
    jobs: { queued: number; running: number; completed_24h: number; failed_24h: number }
    models: { catalog_count: number }
    templates: { count: number }
    timestamp: string
  } | null>(null)

  const statusRef = useRef<ServiceStatusMap>({
    api: 'checking',
    gpu_network: 'checking',
    job_execution: 'checking',
    payments: 'checking',
    sync_bridge: 'checking',
    fallback_recovery: 'checking',
  })

  const activeIncidentRef = useRef<Partial<Record<ServiceKey, string>>>({})

  const checkEndpoint = useCallback(async <T,>(path: string): Promise<{ ok: boolean; data: T | null; statusCode: number | null; latencyMs: number | null }> => {
    const start = Date.now()
    try {
      const res = await fetch(`${API}${path}`, { cache: 'no-store' })
      const latencyMs = Date.now() - start
      if (!res.ok) {
        return { ok: false, data: null, statusCode: res.status, latencyMs }
      }
      const data = await res.json().catch(() => null)
      return { ok: true, data, statusCode: res.status, latencyMs }
    } catch {
      return { ok: false, data: null, statusCode: null, latencyMs: Date.now() - start }
    }
  }, [])

  const runChecks = useCallback(async () => {
    setIsRefreshing(true)
    const nowIso = new Date().toISOString()

    const [healthRes, providersRes, syncRes, fallbackRes] = await Promise.all([
      checkEndpoint<Record<string, unknown>>('/health'),
      checkEndpoint<Record<string, unknown> | unknown[]>('/providers/available'),
      checkEndpoint<Record<string, unknown>>('/sync/status'),
      checkEndpoint<Record<string, unknown>>('/fallback/status'),
    ])

    const results: Record<ServiceKey, ServiceResult> = {
      api: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      gpu_network: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      job_execution: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      payments: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      sync_bridge: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
      fallback_recovery: { status: 'checking', detail: '', latencyMs: null, lastOkAt: null },
    }

    if (healthRes.ok) {
      const h = (healthRes.data || {}) as Record<string, unknown>
      const providers = (h.providers || {}) as Record<string, unknown>
      const jobs = (h.jobs || {}) as Record<string, unknown>
      const online = Number(providers.online || 0)
      const queued = Number(jobs.queued || 0)
      const running = Number(jobs.running || 0)

      results.api = {
        status: 'operational',
        detail: `${t('status.providers_online_count')}: ${online} | ${t('status.jobs_running_count')}: ${running} | ${t('status.jobs_queued_count')}: ${queued}`,
        latencyMs: healthRes.latencyMs,
        lastOkAt: nowIso,
      }

      results.job_execution = {
        status: queued > 40 ? 'degraded' : 'operational',
        detail: queued > 40 ? t('status.job_execution_queue_high') : t('status.job_execution_normal'),
        latencyMs: healthRes.latencyMs,
        lastOkAt: nowIso,
      }

      results.payments = {
        status: 'operational',
        detail: t('status.payments_inferred'),
        latencyMs: healthRes.latencyMs,
        lastOkAt: nowIso,
      }
    } else {
      const apiDetail = healthRes.statusCode ? `HTTP ${healthRes.statusCode}` : t('status.endpoint_unreachable')
      results.api = {
        status: 'down',
        detail: apiDetail,
        latencyMs: healthRes.latencyMs,
        lastOkAt: null,
      }
      results.job_execution = {
        status: 'down',
        detail: t('status.job_execution_api_down'),
        latencyMs: healthRes.latencyMs,
        lastOkAt: null,
      }
      results.payments = {
        status: 'degraded',
        detail: t('status.payments_api_down'),
        latencyMs: healthRes.latencyMs,
        lastOkAt: null,
      }
    }

    if (providersRes.ok) {
      const providerPayload = providersRes.data
      const providers = Array.isArray(providerPayload)
        ? providerPayload
        : Array.isArray((providerPayload as Record<string, unknown>)?.providers)
          ? ((providerPayload as Record<string, unknown>).providers as unknown[])
          : []

      const onlineCount = providers.filter((row) => {
        const provider = row as Record<string, unknown>
        return provider.status === 'online' || provider.is_live === true || provider.online === true
      }).length

      const degradedCount = providers.filter((row) => {
        const provider = row as Record<string, unknown>
        return provider.status === 'degraded'
      }).length

      const status: ServiceStatus = onlineCount > 0 ? (degradedCount > 0 ? 'degraded' : 'operational') : 'degraded'
      results.gpu_network = {
        status,
        detail: `${t('status.providers_online_count')}: ${onlineCount}${degradedCount > 0 ? ` | ${t('status.providers_degraded_count')}: ${degradedCount}` : ''}`,
        latencyMs: providersRes.latencyMs,
        lastOkAt: onlineCount > 0 ? nowIso : null,
      }
    } else {
      results.gpu_network = {
        status: 'down',
        detail: providersRes.statusCode ? `HTTP ${providersRes.statusCode}` : t('status.endpoint_unreachable'),
        latencyMs: providersRes.latencyMs,
        lastOkAt: null,
      }
    }

    if (syncRes.ok) {
      const s = (syncRes.data || {}) as Record<string, unknown>
      const running = s.running === true
      const errorCount = Number((s.stats as Record<string, unknown> | undefined)?.errors || 0)
      results.sync_bridge = {
        status: running ? (errorCount > 0 ? 'degraded' : 'operational') : 'degraded',
        detail: running ? `${t('status.sync_errors')}: ${errorCount}` : t('status.sync_disabled'),
        latencyMs: syncRes.latencyMs,
        lastOkAt: running ? nowIso : null,
      }
    } else {
      results.sync_bridge = {
        status: 'down',
        detail: syncRes.statusCode ? `HTTP ${syncRes.statusCode}` : t('status.endpoint_unreachable'),
        latencyMs: syncRes.latencyMs,
        lastOkAt: null,
      }
    }

    if (fallbackRes.ok) {
      const f = (fallbackRes.data || {}) as Record<string, unknown>
      const running = f.running === true
      const eventsToday = Number(f.eventsToday || 0)
      results.fallback_recovery = {
        status: running ? (eventsToday > 20 ? 'degraded' : 'operational') : 'degraded',
        detail: `${t('status.events_today')}: ${eventsToday}`,
        latencyMs: fallbackRes.latencyMs,
        lastOkAt: running ? nowIso : null,
      }
    } else {
      results.fallback_recovery = {
        status: 'down',
        detail: fallbackRes.statusCode ? `HTTP ${fallbackRes.statusCode}` : t('status.endpoint_unreachable'),
        latencyMs: fallbackRes.latencyMs,
        lastOkAt: null,
      }
    }

    const nextServices = initialServices.map((svc) => {
      const update = results[svc.key]
      const prev = services.find((row) => row.key === svc.key)
      return {
        ...svc,
        status: update.status,
        detail: update.detail,
        latencyMs: update.latencyMs,
        lastOkAt: update.lastOkAt || prev?.lastOkAt || null,
      }
    })

    const previousStatuses = statusRef.current

    setIncidents((prev) => {
      let next = [...prev]

      for (const key of SERVICE_ORDER) {
        const previous = previousStatuses[key]
        const current = results[key].status
        const activeId = activeIncidentRef.current[key]

        const enteringIncident =
          (current === 'degraded' || current === 'down') &&
          (previous === 'operational' || previous === 'checking')

        const recovering =
          current === 'operational' &&
          (previous === 'degraded' || previous === 'down')

        if (enteringIncident) {
          const incidentId = `${key}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
          const severity: IncidentRecord['severity'] = current === 'down' ? 'down' : 'degraded'
          activeIncidentRef.current[key] = incidentId
          next = [
            {
              id: incidentId,
              serviceKey: key,
              startedAt: nowIso,
              resolvedAt: null,
              severity,
            },
            ...next,
          ].slice(0, 25)
        } else if (recovering && activeId) {
          next = next.map((incident) =>
            incident.id === activeId ? { ...incident, resolvedAt: nowIso } : incident
          )
          delete activeIncidentRef.current[key]
        }
      }

      return next
    })

    setServices(nextServices)

    setHistory((prev) => {
      const next: ServiceHistory = { ...prev }
      for (const key of SERVICE_ORDER) {
        const samples = [...(prev[key] || []), results[key].status]
        next[key] = samples.slice(-HISTORY_MAX)
      }
      return next
    })

    statusRef.current = {
      api: results.api.status,
      gpu_network: results.gpu_network.status,
      job_execution: results.job_execution.status,
      payments: results.payments.status,
      sync_bridge: results.sync_bridge.status,
      fallback_recovery: results.fallback_recovery.status,
    }

    setLastChecked(new Date())
    setIsRefreshing(false)
  }, [checkEndpoint, initialServices, services, t])

  useEffect(() => {
    runChecks()
    const id = setInterval(runChecks, REFRESH_MS)
    return () => clearInterval(id)
  }, [runChecks])

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API}/health/detailed`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setPlatformMetrics(data)
      } catch { /* silently keep last value */ }
    }
    fetchMetrics()
    const id = setInterval(fetchMetrics, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const scoreGlobal = availabilityPercent(SERVICE_ORDER.flatMap((key) => history[key]))
  const scoreApi = availabilityPercent(history.api)
  const scoreCompute = availabilityPercent([...history.gpu_network, ...history.job_execution])
  const scoreBilling = availabilityPercent(history.payments)

  const scoreLabel = (value: number | null) => (value == null ? t('status.na') : `${value.toFixed(2)}%`)

  return (
    <div className="min-h-screen bg-dc1-void text-dc1-text-primary" dir={dir}>
      <nav className="border-b border-dc1-border bg-dc1-surface-l1">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/dcp-logo-primary.png" alt="DCP" className="h-8 w-auto" />
            <span className="font-bold text-dc1-text-primary">DCP.</span>
          </Link>
          <LanguageToggle />
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-dc1-text-primary sm:text-3xl">{t('status.title')}</h1>
          <p className="mt-2 text-sm text-dc1-text-secondary">{t('status.subtitle')}</p>
        </div>

        <OverallBanner services={services} t={t} />

        {/* Platform Metrics — live data from health/detailed */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(() => {
            const pm = platformMetrics
            const providerStatus = pm
              ? pm.providers.online > 0 ? 'text-emerald-400' : 'text-dc1-text-muted'
              : 'text-dc1-text-muted'
            return (
              <>
                <div className="card p-4">
                  <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Providers</p>
                  <p className={`mt-2 text-2xl font-bold tabular-nums ${providerStatus}`}>
                    {pm ? pm.providers.online : '—'}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">
                    {pm ? `${pm.providers.registered} registered` : 'loading…'}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Job Queue</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-dc1-text-primary">
                    {pm ? pm.jobs.queued : '—'}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">
                    {pm ? `${pm.jobs.running} running` : 'loading…'}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Models</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-dc1-text-primary">
                    {pm ? pm.models.catalog_count : '—'}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">in catalog</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Templates</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-dc1-text-primary">
                    {pm ? pm.templates.count : '—'}
                  </p>
                  <p className="mt-1 text-xs text-dc1-text-secondary">
                    {pm ? `updated ${new Date(pm.timestamp).toLocaleTimeString()}` : 'loading…'}
                  </p>
                </div>
              </>
            )
          })()}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ScoreCard title={t('status.score_global')} value={scoreLabel(scoreGlobal)} caption={t('status.score_global_desc')} />
          <ScoreCard title={t('status.score_api')} value={scoreLabel(scoreApi)} caption={t('status.score_api_desc')} />
          <ScoreCard title={t('status.score_compute')} value={scoreLabel(scoreCompute)} caption={t('status.score_compute_desc')} />
          <ScoreCard title={t('status.score_billing')} value={scoreLabel(scoreBilling)} caption={t('status.score_billing_desc')} />
        </div>

        <div className="card mb-8 overflow-hidden p-0">
          <div className="border-b border-dc1-border bg-dc1-surface-l2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
            {t('status.live_checks')}
          </div>
          {services.map((svc) => (
            <ServiceRow key={svc.key} svc={svc} t={t} />
          ))}
        </div>

        <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-dc1-border bg-dc1-surface-l1 px-4 py-3 text-xs text-dc1-text-muted sm:flex-row sm:items-center">
          <span>
            {lastChecked
              ? `${t('status.last_checked')}: ${lastChecked.toLocaleTimeString()}`
              : t('status.checking')}
          </span>
          <button
            onClick={runChecks}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-dc1-border px-3 py-1.5 transition-colors hover:border-dc1-amber hover:text-dc1-amber disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('status.refresh')}
          </button>
        </div>

        <div className="mb-8">
          <h2 className="mb-4 text-base font-semibold text-dc1-text-primary">{t('status.incident_history')}</h2>
          {incidents.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-dc1-text-secondary">{t('status.no_incidents')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} t={t} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link href="/renter/marketplace" className="card p-5 transition-colors hover:border-dc1-amber">
            <p className="text-sm font-semibold text-dc1-text-primary">{t('status.view_marketplace')}</p>
            <p className="mt-1 text-xs text-dc1-text-secondary">{t('status.marketplace_desc')}</p>
          </Link>
          <Link href="/docs/api" className="card p-5 transition-colors hover:border-dc1-amber">
            <p className="text-sm font-semibold text-dc1-text-primary">{t('status.view_api_docs')}</p>
            <p className="mt-1 text-xs text-dc1-text-secondary">{t('status.api_docs_desc')}</p>
          </Link>
        </div>
      </main>

      <footer className="mt-16 border-t border-dc1-border">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-dc1-text-muted sm:px-6">
          &copy; {new Date().getFullYear()} DC Power Solutions Company. dcp.sa
        </div>
      </footer>
    </div>
  )
}
