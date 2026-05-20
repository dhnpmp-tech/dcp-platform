'use client'

/**
 * Public /status — live per-model availability + latency.
 *
 * Data sources:
 *   - GET /v1/models         → currently-served model catalog + provider_count
 *   - GET /api/models/benchmarks → per-model p50/p95 latency (when seeded)
 *   - GET /api/health/detailed   → platform-wide queue/provider counters
 *
 * Refreshes every 30s on the client. Incidents and a subscribe-to-updates
 * form are kept as static affordances pointing at email — a real incidents
 * table and a /api/status-subscribers endpoint are TODOs flagged in the PR
 * body.
 *
 * Notes on what was deliberately left out:
 *   - Multi-window p50 (1h / 24h / 7d) — the benchmark table only stores
 *     the most recent p50 per model. Showing three time windows would
 *     mean making them up.
 *   - Recent incidents — no incidents table exists in the schema today.
 *     Per spec, the section is omitted gracefully rather than fabricated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'

const REFRESH_MS = 30_000

type ModelStatus = 'live' | 'degraded' | 'down'

interface CatalogModel {
  id: string
  name?: string
  provider_count?: number
  context_length?: number
  modalities?: string[]
  max_vram_gb?: number
}

interface BenchmarkRow {
  model_id?: string
  latency_p50_ms?: number | null
  latency_p95_ms?: number | null
  measured_at?: string | null
}

interface ModelRow {
  id: string
  name: string
  providerCount: number
  status: ModelStatus
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  modalities: string[]
  contextLength: number | null
}

interface PlatformMetrics {
  providers?: { registered?: number; online?: number }
  jobs?: { queued?: number; running?: number; completed_24h?: number; failed_24h?: number }
}

const STATUS_LABEL: Record<ModelStatus, string> = {
  live: 'Live',
  degraded: 'Degraded',
  down: 'Down',
}

const STATUS_DOT: Record<ModelStatus, string> = {
  live: 'bg-emerald-500',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
}

const STATUS_TEXT: Record<ModelStatus, string> = {
  live: 'text-emerald-300',
  degraded: 'text-amber-300',
  down: 'text-red-300',
}

function classifyModel(providerCount: number, latencyP95Ms: number | null): ModelStatus {
  if (providerCount <= 0) return 'down'
  if (latencyP95Ms != null && latencyP95Ms > 3000) return 'degraded'
  return 'live'
}

function formatLatency(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${Math.round(ms)} ms`
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function StatusBanner({ models }: { models: ModelRow[] }) {
  if (models.length === 0) {
    return (
      <div className="mb-8 flex items-center gap-3 rounded-xl border border-dc1-border bg-dc1-surface-l2 px-6 py-4">
        <span className="h-4 w-4 animate-pulse rounded-full bg-dc1-surface-l3" aria-hidden="true" />
        <span className="text-lg font-semibold text-dc1-text-primary">Loading status…</span>
      </div>
    )
  }

  const anyDown = models.some((m) => m.status === 'down')
  const anyDegraded = models.some((m) => m.status === 'degraded')

  if (anyDown) {
    return (
      <div className="mb-8 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4">
        <span className="h-4 w-4 rounded-full bg-red-500" aria-hidden="true" />
        <span className="text-lg font-semibold text-dc1-text-primary">One or more models are down</span>
      </div>
    )
  }
  if (anyDegraded) {
    return (
      <div className="mb-8 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-6 py-4">
        <span className="h-4 w-4 rounded-full bg-amber-400" aria-hidden="true" />
        <span className="text-lg font-semibold text-dc1-text-primary">Partial degradation</span>
      </div>
    )
  }
  return (
    <div className="mb-8 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4">
      <span className="h-4 w-4 rounded-full bg-emerald-500" aria-hidden="true" />
      <span className="text-lg font-semibold text-dc1-text-primary">All models live</span>
    </div>
  )
}

function MetricsRow({
  models,
  metrics,
  lastChecked,
}: {
  models: ModelRow[]
  metrics: PlatformMetrics | null
  lastChecked: Date | null
}) {
  const liveModels = models.filter((m) => m.status === 'live').length
  const totalProviders = models.reduce((acc, m) => acc + m.providerCount, 0)
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4">
        <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Models live</p>
        <p className="mt-2 font-mono text-2xl tabular-nums text-emerald-300">
          {models.length === 0 ? '—' : liveModels}
        </p>
        <p className="mt-1 text-xs text-dc1-text-secondary">of {models.length} listed</p>
      </div>
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4">
        <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Providers online</p>
        <p className="mt-2 font-mono text-2xl tabular-nums text-dc1-text-primary">
          {metrics?.providers?.online ?? totalProviders ?? '—'}
        </p>
        <p className="mt-1 text-xs text-dc1-text-secondary">
          {metrics?.providers?.registered != null
            ? `${metrics.providers.registered} registered`
            : 'across all models'}
        </p>
      </div>
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4">
        <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Active jobs</p>
        <p className="mt-2 font-mono text-2xl tabular-nums text-dc1-text-primary">
          {metrics?.jobs?.running ?? '—'}
        </p>
        <p className="mt-1 text-xs text-dc1-text-secondary">
          {metrics?.jobs?.queued != null ? `${metrics.jobs.queued} queued` : 'running now'}
        </p>
      </div>
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4">
        <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Last refresh</p>
        <p className="mt-2 font-mono text-base tabular-nums text-dc1-text-primary">
          {lastChecked ? lastChecked.toLocaleTimeString() : '—'}
        </p>
        <p className="mt-1 text-xs text-dc1-text-secondary">refreshes every 30s</p>
      </div>
    </div>
  )
}

function ModelTable({ models }: { models: ModelRow[] }) {
  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-8 text-center text-sm text-dc1-text-secondary">
        Waiting for the catalog…
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-dc1-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-dc1-surface-l2 text-xs uppercase tracking-wider text-dc1-text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Model</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 font-semibold">Providers</th>
            <th scope="col" className="px-4 py-3 font-semibold">p50 latency</th>
            <th scope="col" className="px-4 py-3 font-semibold">p95 latency</th>
            <th scope="col" className="px-4 py-3 font-semibold">Modalities</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border bg-dc1-surface-l1">
          {models.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-dc1-text-primary">{row.name}</div>
                <div className="text-xs text-dc1-text-muted">{row.id}</div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[row.status]}`} aria-hidden="true" />
                  <span className={`text-xs font-semibold ${STATUS_TEXT[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                </span>
              </td>
              <td className="px-4 py-3 font-mono tabular-nums text-dc1-text-secondary">{row.providerCount}</td>
              <td className="px-4 py-3 font-mono tabular-nums text-dc1-text-secondary">
                {formatLatency(row.latencyP50Ms)}
              </td>
              <td className="px-4 py-3 font-mono tabular-nums text-dc1-text-secondary">
                {formatLatency(row.latencyP95Ms)}
              </td>
              <td className="px-4 py-3 text-xs text-dc1-text-muted">{row.modalities.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubscribeForm() {
  // The backend endpoint /api/status-subscribers does not exist yet. Until
  // it does, this form just opens the user's mail client. Doing it this
  // way (instead of POSTing to a dead URL) keeps the form honest.
  return (
    <form
      action="mailto:status@dcp.sa"
      method="post"
      encType="text/plain"
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <label htmlFor="status-subscribe-email" className="sr-only">
        Email address
      </label>
      <input
        id="status-subscribe-email"
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        className="flex-1 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-primary placeholder:text-dc1-text-muted focus:border-dc1-amber focus:outline-none"
      />
      <button type="submit" className="btn btn-primary btn-md">
        Subscribe to updates
      </button>
    </form>
  )
}

export default function StatusPage() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setLoadError(null)

    const [catalogRaw, benchRaw, healthRaw] = await Promise.all([
      fetchJson<{ data?: CatalogModel[] }>('/v1/models'),
      fetchJson<{ benchmarks?: BenchmarkRow[] }>('/api/models/benchmarks'),
      fetchJson<PlatformMetrics>('/api/health/detailed'),
    ])

    if (!catalogRaw) {
      setLoadError('Model catalog is unreachable.')
      setIsRefreshing(false)
      return
    }

    const catalog = Array.isArray(catalogRaw.data) ? catalogRaw.data : []

    const benchByModel = new Map<string, BenchmarkRow>()
    const benchmarks = Array.isArray(benchRaw?.benchmarks) ? benchRaw.benchmarks : []
    for (const row of benchmarks) {
      if (!row?.model_id) continue
      const existing = benchByModel.get(row.model_id)
      const existingMeasured = existing?.measured_at ? new Date(existing.measured_at).getTime() : 0
      const incomingMeasured = row.measured_at ? new Date(row.measured_at).getTime() : 0
      if (!existing || incomingMeasured >= existingMeasured) {
        benchByModel.set(row.model_id, row)
      }
    }

    const rows: ModelRow[] = catalog.map((m) => {
      const providerCount = Number(m.provider_count || 0)
      const bench = benchByModel.get(m.id)
      const latencyP50Ms = bench?.latency_p50_ms != null ? Number(bench.latency_p50_ms) : null
      const latencyP95Ms = bench?.latency_p95_ms != null ? Number(bench.latency_p95_ms) : null
      return {
        id: m.id,
        name: m.name || m.id,
        providerCount,
        status: classifyModel(providerCount, latencyP95Ms),
        latencyP50Ms,
        latencyP95Ms,
        modalities: Array.isArray(m.modalities) ? m.modalities : [],
        contextLength: m.context_length != null ? Number(m.context_length) : null,
      }
    })

    rows.sort((a, b) => {
      // Live models first, then by provider count desc, then by id.
      const statusRank: Record<ModelStatus, number> = { live: 0, degraded: 1, down: 2 }
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
      if (a.providerCount !== b.providerCount) return b.providerCount - a.providerCount
      return a.id.localeCompare(b.id)
    })

    setModels(rows)
    setMetrics(healthRaw)
    setLastChecked(new Date())
    setIsRefreshing(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const summary = useMemo(() => {
    const totalProviders = models.reduce((acc, m) => acc + m.providerCount, 0)
    return { totalProviders, modelCount: models.length }
  }, [models])

  return (
    <div className="min-h-screen bg-dc1-void" dir="ltr">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero */}
        <section aria-labelledby="status-heading" className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-dc1-amber">STATUS</p>
          <h1 id="status-heading" className="mt-2 text-4xl font-bold text-dc1-text-primary sm:text-5xl">
            Live model availability
          </h1>
          <p className="mt-3 max-w-2xl text-base text-dc1-text-secondary">
            {summary.modelCount > 0
              ? `${summary.modelCount} models in catalog, ${summary.totalProviders} provider slot${summary.totalProviders === 1 ? '' : 's'} live across DCP.`
              : 'Checking the live catalog…'}
          </p>
        </section>

        <StatusBanner models={models} />

        <MetricsRow models={models} metrics={metrics} lastChecked={lastChecked} />

        {loadError ? (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {loadError} Retrying every 30 seconds.
          </div>
        ) : null}

        <section aria-labelledby="models-table-heading" className="mb-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="models-table-heading" className="text-xl font-semibold text-dc1-text-primary">
              Per-model status
            </h2>
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-dc1-border px-3 py-1.5 text-xs text-dc1-text-secondary transition hover:border-dc1-amber hover:text-dc1-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
          <ModelTable models={models} />
          <p className="mt-3 text-xs text-dc1-text-muted">
            Latency figures are sourced from the most recent benchmark suite per model (
            <code>model_benchmarks</code> table). Multi-window p50 (1h / 24h / 7d) will land with the real-time
            telemetry rollout — surfacing fabricated windows today would be worse than waiting.
          </p>
        </section>

        {/* Subscribe */}
        <section aria-labelledby="subscribe-heading" className="mb-12 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
          <h2 id="subscribe-heading" className="text-lg font-semibold text-dc1-text-primary">
            Stay notified
          </h2>
          <p className="mt-2 text-sm text-dc1-text-secondary">
            Drop your email and we'll let you know when there's an availability incident. The dedicated subscribe
            endpoint is on the way; until then submissions open your mail client to{' '}
            <a href="mailto:status@dcp.sa" className="text-dc1-amber hover:underline">
              status@dcp.sa
            </a>
            .
          </p>
          <div className="mt-4">
            <SubscribeForm />
          </div>
        </section>

        {/* Helpful links */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/quickstart" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 transition hover:border-dc1-amber">
            <p className="text-sm font-semibold text-dc1-text-primary">Read the quickstart</p>
            <p className="mt-1 text-xs text-dc1-text-secondary">
              First call in under two minutes. curl, Python, Node.js.
            </p>
          </Link>
          <Link href="/pricing" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 transition hover:border-dc1-amber">
            <p className="text-sm font-semibold text-dc1-text-primary">See pricing</p>
            <p className="mt-1 text-xs text-dc1-text-secondary">
              SAR per GPU-hour. 50 SAR starter credit on signup.
            </p>
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  )
}
