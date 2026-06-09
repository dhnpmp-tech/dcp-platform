'use client'

/**
 * Public /status — live per-model availability + latency, in the v2 editorial
 * design language (self-contained: own nav/footer + status.css, no v1 chrome).
 *
 * Data sources:
 *   - GET /v1/models             → currently-served catalog + provider_count
 *   - GET /api/models/benchmarks → per-model latency. The payload is
 *       { models: [{ model_id, latency_ms: { p50, p95 }, measured_at }] }.
 *   - GET /api/health/detailed   → platform-wide provider/job counters
 *       (providers.{online,serving,registered}, jobs.{running,queued}).
 *
 * Honesty notes:
 *   - A catalog model with zero providers is "Standby" (available on demand
 *     once a provider warms it), NOT "Down" — "down" implies an outage that
 *     isn't happening. Only a model that is provisioned-but-slow is degraded.
 *   - Latency is shown only when a real benchmark measurement exists
 *     (measured_at present, value > 0); otherwise "—". No fabricated numbers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import './status.css'

const REFRESH_MS = 30_000

type ModelStatus = 'live' | 'degraded' | 'standby'

interface CatalogModel {
  id: string
  name?: string
  provider_count?: number
  context_length?: number
  modalities?: string[]
  max_vram_gb?: number
}

// Mirrors the live /api/models/benchmarks shape: latency is nested under
// latency_ms, not flat latency_p50_ms/p95 fields.
interface BenchmarkRow {
  model_id?: string
  latency_ms?: { p50?: number | null; p95?: number | null; p99?: number | null } | null
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
  providers?: { registered?: number; online?: number; serving?: number }
  jobs?: { queued?: number; running?: number; completed_24h?: number; failed_24h?: number }
}

const STATUS_LABEL: Record<ModelStatus, string> = {
  live: 'Live',
  degraded: 'Degraded',
  standby: 'Standby',
}

function classifyModel(providerCount: number, latencyP95Ms: number | null): ModelStatus {
  if (providerCount <= 0) return 'standby'
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
      <div className="st-banner neutral">
        <span className="bdot" aria-hidden="true" />
        <span className="btxt">Checking live capacity…</span>
      </div>
    )
  }
  const liveCount = models.filter((m) => m.status === 'live').length
  const degraded = models.some((m) => m.status === 'degraded')

  if (liveCount === 0) {
    return (
      <div className="st-banner warn">
        <span className="bdot" aria-hidden="true" />
        <span className="btxt">No models serving right now — capacity returns when a provider comes online.</span>
      </div>
    )
  }
  if (degraded) {
    return (
      <div className="st-banner warn">
        <span className="bdot" aria-hidden="true" />
        <span className="btxt">{liveCount} model{liveCount === 1 ? '' : 's'} serving · partial degradation</span>
      </div>
    )
  }
  return (
    <div className="st-banner ok">
      <span className="bdot" aria-hidden="true" />
      <span className="btxt">Operational — {liveCount} model{liveCount === 1 ? '' : 's'} serving now</span>
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
  const online = metrics?.providers?.online
  const serving = metrics?.providers?.serving
  return (
    <div className="st-metrics">
      <div className="st-stat">
        <p className="k">Models serving</p>
        <p className="v teal">{models.length === 0 ? '—' : liveModels}</p>
        <p className="sub">of {models.length || '—'} in catalog</p>
      </div>
      <div className="st-stat">
        <p className="k">Providers online</p>
        <p className="v">{online ?? '—'}</p>
        <p className="sub">{serving != null ? `${serving} serving now` : 'verified capacity'}</p>
      </div>
      <div className="st-stat">
        <p className="k">Active jobs</p>
        <p className="v">{metrics?.jobs?.running ?? '—'}</p>
        <p className="sub">{metrics?.jobs?.queued != null ? `${metrics.jobs.queued} queued` : 'running now'}</p>
      </div>
      <div className="st-stat">
        <p className="k">Last refresh</p>
        <p className="v sm">{lastChecked ? lastChecked.toLocaleTimeString() : '—'}</p>
        <p className="sub">refreshes every 30s</p>
      </div>
    </div>
  )
}

function ModelTable({ models }: { models: ModelRow[] }) {
  if (models.length === 0) {
    return (
      <div className="st-table-wrap" style={{ padding: '40px 18px', textAlign: 'center' }}>
        <span className="st-note">Waiting for the catalog…</span>
      </div>
    )
  }
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Status</th>
            <th scope="col">Providers</th>
            <th scope="col">p50 latency</th>
            <th scope="col">p95 latency</th>
            <th scope="col">Modalities</th>
          </tr>
        </thead>
        <tbody>
          {models.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="st-mname">{row.name}</div>
                <div className="st-mid">{row.id}</div>
              </td>
              <td>
                <span className="st-scell">
                  <span className={`st-sdot ${row.status}`} aria-hidden="true" />
                  <span className={`st-slabel ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                </span>
              </td>
              <td className="st-mono">{row.providerCount}</td>
              <td className="st-mono">{formatLatency(row.latencyP50Ms)}</td>
              <td className="st-mono">{formatLatency(row.latencyP95Ms)}</td>
              <td style={{ fontSize: 12, color: 'var(--mut)' }}>{row.modalities.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubscribeForm() {
  // No /api/status-subscribers endpoint yet — open the mail client instead of
  // POSTing to a dead URL, which keeps the form honest.
  return (
    <form action="mailto:status@dcp.sa" method="post" encType="text/plain" className="st-form">
      <label htmlFor="status-subscribe-email" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Email address
      </label>
      <input id="status-subscribe-email" type="email" name="email" required placeholder="you@example.com" className="st-input" />
      <button type="submit" className="st-btn">Subscribe →</button>
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
      fetchJson<{ models?: BenchmarkRow[] }>('/api/models/benchmarks'),
      fetchJson<PlatformMetrics>('/api/health/detailed'),
    ])

    if (!catalogRaw) {
      setLoadError('Model catalog is unreachable.')
      setIsRefreshing(false)
      return
    }

    const catalog = Array.isArray(catalogRaw.data) ? catalogRaw.data : []

    const benchByModel = new Map<string, BenchmarkRow>()
    const benchmarks = Array.isArray(benchRaw?.models) ? benchRaw.models : []
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
      // Only trust a measurement that actually happened (measured_at present
      // and a non-zero value); unmeasured models render "—", never 0 ms.
      const measured = bench?.measured_at ? bench : null
      const p50 = measured?.latency_ms?.p50
      const p95 = measured?.latency_ms?.p95
      const latencyP50Ms = p50 != null && Number(p50) > 0 ? Number(p50) : null
      const latencyP95Ms = p95 != null && Number(p95) > 0 ? Number(p95) : null
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
      const statusRank: Record<ModelStatus, number> = { live: 0, degraded: 1, standby: 2 }
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
    const live = models.filter((m) => m.status === 'live').length
    const degraded = models.some((m) => m.status === 'degraded')
    let pill: { label: string; dot: string }
    if (models.length === 0) {
      pill = { label: 'Checking', dot: 'var(--dim)' }
    } else if (live === 0) {
      pill = { label: 'Standby', dot: 'var(--amber)' }
    } else if (degraded) {
      pill = { label: 'Degraded', dot: 'var(--amber)' }
    } else {
      pill = { label: 'Live', dot: 'var(--teal)' }
    }
    return { live, modelCount: models.length, pill }
  }, [models])

  return (
    <div className="status-page" dir="ltr">
      <nav className="st-nav">
        <Link href="/v2/home" className="st-brand">DCP&#8734;</Link>
        <div className="st-nav-right">
          <Link href="/v2/home" className="lnk">Home</Link>
          <Link href="/v2/docs" className="lnk">Docs</Link>
          <Link href="/pricing" className="lnk">Pricing</Link>
          <span className="st-pill"><span className="dot" style={{ background: summary.pill.dot, boxShadow: `0 0 8px ${summary.pill.dot}` }} />{summary.pill.label}</span>
        </div>
      </nav>

      <main className="st-main">
        <section aria-labelledby="status-heading">
          <p className="st-eyebrow">§ System status · KSA-resident</p>
          <h1 id="status-heading" className="st-h1">
            Live model <em>availability</em>
          </h1>
          <p className="st-lede">
            {summary.modelCount > 0
              ? `${summary.modelCount} models in the catalog · ${summary.live} serving live right now. Capacity is published only after a provider passes verification — never simulated.`
              : 'Reading the live catalog…'}
          </p>
        </section>

        <StatusBanner models={models} />
        <MetricsRow models={models} metrics={metrics} lastChecked={lastChecked} />

        {loadError ? (
          <div className="st-error">{loadError} Retrying every 30 seconds.</div>
        ) : null}

        <section className="st-section" aria-labelledby="models-table-heading">
          <div className="st-section-head">
            <h2 id="models-table-heading" className="st-h2">Per-model status</h2>
            <button type="button" onClick={refresh} disabled={isRefreshing} className="st-refresh">
              <svg className={isRefreshing ? 'st-spin' : ''} width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
          <ModelTable models={models} />
          <p className="st-note">
            A model with no provider is <strong>Standby</strong> — available on demand once a provider warms it,
            not an outage. Latency comes from the most recent benchmark per model (<code>model_benchmarks</code>);
            models without a measurement show &ldquo;—&rdquo; rather than a fabricated number.
          </p>
        </section>

        <div className="st-card">
          <h2>Stay notified</h2>
          <p>
            Drop your email and we&apos;ll flag availability incidents. The dedicated subscribe endpoint is on the
            way; until then submissions open your mail client to{' '}
            <a href="mailto:status@dcp.sa">status@dcp.sa</a>.
          </p>
          <SubscribeForm />
        </div>

        <section className="st-links">
          <Link href="/v2/docs" className="st-link-card">
            <p className="t">Read the docs →</p>
            <p className="d">First call in under two minutes. curl, Python, Node.js.</p>
          </Link>
          <Link href="/pricing" className="st-link-card">
            <p className="t">See pricing →</p>
            <p className="d">PAYG per million tokens or a monthly tier. 100 SAR starter credit on signup.</p>
          </Link>
        </section>
      </main>

      <div className="st-foot-wrap">
        <footer className="st-foot">
          <span className="fb">DCP&#8734;</span>
          <span className="fm">KSA-resident GPU compute</span>
          <span>
            <Link href="/v2/home">Home</Link>
            <Link href="/v2/docs">Docs</Link>
            <Link href="/pricing">Pricing</Link>
          </span>
        </footer>
      </div>
    </div>
  )
}
