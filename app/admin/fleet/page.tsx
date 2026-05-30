'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'
const POLL_INTERVAL_MS = 8000
// A provider's "served models" / metering signal is treated as stale past this.
const METERING_STALE_SECONDS = 15 * 60 // 15 min — no real inference token in this window = suspicious
const HANDSHAKE_STALE_SECONDS = 180 // WG considered stale past 3 min (matches backend wg-diag threshold)
const HEARTBEAT_STALE_SECONDS = 5 * 60 // claimed-heartbeat warning threshold

// ─── Nav (mirrors the other admin pages) ───────────────────────────────────────
const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: <HomeIcon /> },
  { label: 'Providers', href: '/admin/providers', icon: <ServerIcon /> },
  { label: 'Renters', href: '/admin/renters', icon: <UsersIcon /> },
  { label: 'Jobs', href: '/admin/jobs', icon: <BriefcaseIcon /> },
  { label: 'Finance', href: '/admin/finance', icon: <CurrencyIcon /> },
  { label: 'Withdrawals', href: '/admin/withdrawals', icon: <WalletIcon /> },
  { label: 'Security', href: '/admin/security', icon: <ShieldIcon /> },
  { label: 'Fleet', href: '/admin/fleet', icon: <CpuIcon /> },
  { label: 'Containers', href: '/admin/containers', icon: <ContainerIcon /> },
]

// ─── Response shape (defensive: every enhanced field is optional) ───────────────
// This screen consumes the enhanced GET /api/admin/fleet/health that the fleet
// verify step augments with real verified-online + serving signals. Until that
// step lands, every enhanced field may be absent, so we treat them as optional
// and derive sensible fallbacks from the base fields that already exist today.
interface FleetEngine {
  engine_type?: string | null
  served_models?: string[] | null
  reachable?: boolean | number | null
  last_seen_at?: string | null
}

interface FleetProvider {
  id: number
  email?: string | null
  name?: string | null
  gpu_model?: string | null
  gpu_name?: string | null
  status?: string | null // claimed status / heartbeat-derived bucket
  // Real, server-verified reachability — NOT the daemon's self-reported heartbeat.
  verified_online?: boolean | null
  // WireGuard handshake age in seconds (null = never handshook).
  wg_handshake_age_s?: number | null
  // GPU telemetry (latest sample).
  gpu_temp_c?: number | null
  gpu_util_pct?: number | null
  gpu_utilization_pct?: number | null
  vram_used_gb?: number | null
  vram_total_gb?: number | null
  vram_mb?: number | null
  // Heartbeat.
  last_heartbeat?: string | null
  heartbeat_age_seconds?: number | null
  // Serving.
  engines?: FleetEngine[] | null
  served_models?: string[] | null
  served_models_count?: number | null
  // Per-provider metering freshness (last real inference token).
  last_token_record_at?: string | null
  last_inference_at?: string | null
}

interface FleetMetering {
  last_token_record_at?: string | null
  last_token_age_seconds?: number | null
  total_tokens_24h?: number | null
}

interface FleetHealthResponse {
  serving_now?: boolean | null
  total_providers?: number | null
  online?: number | null
  offline?: number | null
  degraded?: number | null
  // Providers that are actually usable for serving (verified online + reachable engine).
  usable_online?: number | null
  // Distinct models currently served across the usable fleet.
  served_models?: string[] | null
  served_models_count?: number | null
  metering?: FleetMetering | null
  providers?: FleetProvider[] | null
  generated_at?: string | null
}

// ─── Time / value helpers ───────────────────────────────────────────────────────
function ageSecondsFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, (Date.now() - ms) / 1000)
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'never'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

// Resolve real verified-online for a provider. Prefers the explicit
// `verified_online` boolean from the enhanced endpoint; otherwise falls back to
// a conservative derivation (fresh WG handshake AND a reachable engine) so the
// column is still meaningful before the verify step ships. We deliberately do
// NOT trust the daemon's claimed heartbeat/status here.
function isVerifiedOnline(p: FleetProvider): boolean {
  if (typeof p.verified_online === 'boolean') return p.verified_online
  const handshake = p.wg_handshake_age_s
  const handshakeFresh = handshake != null && handshake >= 0 && handshake < HANDSHAKE_STALE_SECONDS
  const engines = Array.isArray(p.engines) ? p.engines : []
  const hasReachableEngine = engines.some((e) => e && (e.reachable === true || e.reachable === 1))
  return handshakeFresh && hasReachableEngine
}

function providerServedModels(p: FleetProvider): string[] {
  if (Array.isArray(p.served_models)) return p.served_models
  const engines = Array.isArray(p.engines) ? p.engines : []
  const models = new Set<string>()
  for (const e of engines) {
    if (!e || !Array.isArray(e.served_models)) continue
    for (const m of e.served_models) if (m) models.add(m)
  }
  return Array.from(models)
}

function providerGpuUtil(p: FleetProvider): number | null {
  const v = p.gpu_util_pct ?? p.gpu_utilization_pct
  return v == null || !Number.isFinite(v) ? null : Number(v)
}

function providerLastTokenAge(p: FleetProvider): number | null {
  return ageSecondsFromIso(p.last_token_record_at ?? p.last_inference_at)
}

// ─── Small presentational helpers ──────────────────────────────────────────────
function OnlineDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={`inline-block rounded-full ${on ? 'w-2 h-2 bg-status-success animate-pulse' : 'w-2 h-2 bg-status-error'}`}
        aria-hidden
      />
      <span className={`text-xs font-semibold ${on ? 'text-status-success' : 'text-status-error'}`}>{label}</span>
    </span>
  )
}

export default function FleetOverviewPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [data, setData] = useState<FleetHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Wall-clock of the last successful fetch — drives "updated Ns ago".
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  // Re-render tick so the "updated Ns ago" counter advances between polls.
  const [, setTick] = useState(0)
  const tokenRef = useRef<string | null>(null)

  if (tokenRef.current === null && typeof window !== 'undefined') {
    tokenRef.current = localStorage.getItem('dc1_admin_token')
  }

  const fetchFleet = useCallback(async () => {
    const token = tokenRef.current
    if (!token) { router.push('/login'); return }
    try {
      const res = await fetch(`${API_BASE}/admin/fleet/health`, {
        headers: { 'x-admin-token': token },
        cache: 'no-store',
      })
      if (res.status === 401) {
        localStorage.removeItem('dc1_admin_token')
        router.push('/login')
        return
      }
      if (!res.ok) {
        setError(`Fleet health request failed (HTTP ${res.status})`)
        return
      }
      const json: FleetHealthResponse = await res.json()
      setData(json)
      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      console.error('Failed to fetch fleet health:', err)
      setError('Network error — could not reach the fleet-health endpoint.')
    } finally {
      setLoading(false)
    }
  }, [router])

  // Poll the enhanced fleet-health endpoint every ~8s.
  useEffect(() => {
    if (!tokenRef.current) { router.push('/login'); return }
    fetchFleet()
    const poll = setInterval(fetchFleet, POLL_INTERVAL_MS)
    // Separate 1s ticker keeps the "updated Ns ago" label live without re-fetching.
    const ticker = setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000)
    return () => { clearInterval(poll); clearInterval(ticker) }
  }, [fetchFleet, router])

  const providers: FleetProvider[] = Array.isArray(data?.providers) ? data!.providers! : []

  // ── Derive top-level signals (prefer server-computed, else derive locally) ──
  const usableProviders = providers.filter(isVerifiedOnline)
  const usableOnline = data?.usable_online ?? usableProviders.length
  const totalProviders = data?.total_providers ?? providers.length

  const servingNow =
    typeof data?.serving_now === 'boolean'
      ? data.serving_now
      // Fallback: at least one verified-online provider serving at least one model.
      : usableProviders.some((p) => providerServedModels(p).length > 0)

  // Distinct models served across the (usable) fleet.
  const servedModelsSet = new Set<string>()
  if (Array.isArray(data?.served_models)) {
    for (const m of data!.served_models!) if (m) servedModelsSet.add(m)
  } else {
    for (const p of usableProviders) for (const m of providerServedModels(p)) servedModelsSet.add(m)
  }
  const servedModelsCount = data?.served_models_count ?? servedModelsSet.size

  // Metering: last real inference token across the platform.
  const meteringLastTokenAge =
    data?.metering?.last_token_age_seconds ??
    ageSecondsFromIso(data?.metering?.last_token_record_at)
  const meteringStale = meteringLastTokenAge == null || meteringLastTokenAge > METERING_STALE_SECONDS

  const updatedAgo =
    lastUpdated == null ? null : Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))

  // Sort: verified-online first, then by served-model count desc, then id.
  const sortedProviders = [...providers].sort((a, b) => {
    const av = isVerifiedOnline(a) ? 0 : 1
    const bv = isVerifiedOnline(b) ? 0 : 1
    if (av !== bv) return av - bv
    const am = providerServedModels(a).length
    const bm = providerServedModels(b).length
    if (am !== bm) return bm - am
    return a.id - b.id
  })

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      {/* Header + live refresh indicator */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary mb-1">Fleet Overview</h1>
          <p className="text-dc1-text-secondary text-sm">
            Real-time view of which providers can actually serve inference — verified, not self-reported.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-dc1-text-muted">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${error ? 'bg-status-error' : 'bg-status-success animate-pulse'}`}
            aria-hidden
          />
          <span>
            {error
              ? 'refresh failed'
              : updatedAgo == null
                ? 'updating…'
                : `updated ${updatedAgo}s ago`}
            {' · auto every 8s'}
          </span>
        </div>
      </div>

      {/* Error banner (non-blocking — stale data still shows below) */}
      {error && (
        <div className="card mb-6 border-l-4 border-l-status-error">
          <p className="text-sm text-status-error font-medium">{error}</p>
          {data && (
            <p className="text-xs text-dc1-text-muted mt-1">
              Showing last good snapshot from {updatedAgo != null ? `${updatedAgo}s ago` : 'earlier'}.
            </p>
          )}
        </div>
      )}

      {/* Initial loading state */}
      {loading && !data ? (
        <div className="card">
          <div className="flex items-center gap-3 text-dc1-text-secondary">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-dc1-amber border-t-transparent animate-spin" />
            Loading fleet status…
          </div>
        </div>
      ) : (
        <>
          {/* ── Big serving banner ───────────────────────────────────────── */}
          <div
            className={`rounded-xl border p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
              servingNow
                ? 'border-status-success/40 bg-status-success/5'
                : 'border-status-error/50 bg-status-error/5'
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-4">
              <span
                className={`inline-block w-4 h-4 rounded-full ${
                  servingNow ? 'bg-status-success animate-pulse' : 'bg-status-error'
                }`}
                aria-hidden
              />
              <div>
                <div className="text-xs uppercase tracking-wider text-dc1-text-muted mb-1">Inference Serving</div>
                <div
                  className={`text-3xl sm:text-4xl font-extrabold leading-none ${
                    servingNow ? 'text-status-success' : 'text-status-error'
                  }`}
                >
                  {servingNow ? '🟢 YES' : '🔴 NO'}
                </div>
              </div>
            </div>
            <div className="text-sm text-dc1-text-secondary sm:text-right">
              {servingNow ? (
                <>
                  <span className="font-semibold text-dc1-text-primary">{usableOnline}</span> usable provider
                  {usableOnline === 1 ? '' : 's'} serving{' '}
                  <span className="font-semibold text-dc1-text-primary">{servedModelsCount}</span> model
                  {servedModelsCount === 1 ? '' : 's'}.
                </>
              ) : (
                <span className="text-status-error font-medium">
                  No verified-online provider is serving any model right now.
                </span>
              )}
            </div>
          </div>

          {/* ── Strip: usable vs total / served models / metering freshness ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <div className="text-xs text-dc1-text-secondary mb-1">Usable / Total providers</div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${usableOnline > 0 ? 'text-status-success' : 'text-status-error'}`}
                >
                  {usableOnline}
                </span>
                <span className="text-lg text-dc1-text-muted">/ {totalProviders}</span>
              </div>
              <div className="text-[11px] text-dc1-text-muted mt-1">verified-online, NOT claimed heartbeat</div>
            </div>

            <div className="card">
              <div className="text-xs text-dc1-text-secondary mb-1">Models served</div>
              <div className={`text-2xl font-bold ${servedModelsCount > 0 ? 'text-dc1-text-primary' : 'text-status-error'}`}>
                {servedModelsCount}
              </div>
              <div className="text-[11px] text-dc1-text-muted mt-1 truncate">
                {servedModelsSet.size > 0 ? Array.from(servedModelsSet).slice(0, 4).join(', ') : 'no models reachable'}
                {servedModelsSet.size > 4 ? ` +${servedModelsSet.size - 4}` : ''}
              </div>
            </div>

            <div className={`card ${meteringStale ? 'border-l-4 border-l-status-error' : ''}`}>
              <div className="text-xs text-dc1-text-secondary mb-1">Last metered token</div>
              <div className={`text-2xl font-bold ${meteringStale ? 'text-status-error' : 'text-status-success'}`}>
                {formatAge(meteringLastTokenAge)}
              </div>
              <div className="text-[11px] text-dc1-text-muted mt-1">
                {meteringStale
                  ? `stale — no real inference token in > ${Math.round(METERING_STALE_SECONDS / 60)}m`
                  : `${(data?.metering?.total_tokens_24h ?? 0).toLocaleString()} tokens / 24h`}
              </div>
            </div>
          </div>

          {/* ── Per-provider table ───────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-dc1-text-primary">Providers</h2>
              <span className="text-xs text-dc1-text-muted">
                {providers.length} registered · {usableOnline} usable
              </span>
            </div>

            {providers.length === 0 ? (
              <p className="text-dc1-text-secondary text-sm">No providers registered.</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Verified online</th>
                      <th>WG handshake</th>
                      <th>Engines / models</th>
                      <th>GPU temp</th>
                      <th>GPU util</th>
                      <th>VRAM</th>
                      <th>Last heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProviders.map((p) => {
                      const verified = isVerifiedOnline(p)
                      const handshake = p.wg_handshake_age_s
                      const handshakeStale =
                        handshake == null || handshake < 0 || handshake >= HANDSHAKE_STALE_SECONDS
                      const models = providerServedModels(p)
                      const engines = Array.isArray(p.engines) ? p.engines : []
                      const reachableEngines = engines.filter((e) => e && (e.reachable === true || e.reachable === 1)).length
                      const util = providerGpuUtil(p)
                      const temp = p.gpu_temp_c
                      const tempHot = temp != null && temp >= 85
                      const tempWarm = temp != null && temp >= 75 && temp < 85
                      const vramUsed = p.vram_used_gb
                      const vramTotal =
                        p.vram_total_gb ?? (p.vram_mb != null ? Number((p.vram_mb / 1024).toFixed(1)) : null)
                      const hbAge = p.heartbeat_age_seconds ?? ageSecondsFromIso(p.last_heartbeat)
                      const hbStale = hbAge == null || hbAge > HEARTBEAT_STALE_SECONDS
                      const label = p.email || p.name || `#${p.id}`
                      return (
                        <tr key={p.id}>
                          <td className="text-sm">
                            <div className="font-medium text-dc1-text-primary truncate max-w-[200px]">{label}</div>
                            <div className="text-[11px] text-dc1-text-muted truncate max-w-[200px]">
                              {p.gpu_model || p.gpu_name || '—'}
                            </div>
                          </td>
                          <td>
                            <OnlineDot on={verified} label={verified ? 'ONLINE' : 'OFFLINE'} />
                          </td>
                          <td className="text-xs">
                            {handshake == null ? (
                              <span className="text-status-error">never</span>
                            ) : (
                              <span className={handshakeStale ? 'text-status-error font-medium' : 'text-status-success'}>
                                {formatDuration(handshake)}
                              </span>
                            )}
                          </td>
                          <td className="text-xs">
                            {models.length === 0 ? (
                              <span className="text-status-error">none reachable</span>
                            ) : (
                              <div>
                                <div className="text-dc1-text-primary">
                                  {reachableEngines > 0 ? `${reachableEngines} engine${reachableEngines === 1 ? '' : 's'} · ` : ''}
                                  {models.length} model{models.length === 1 ? '' : 's'}
                                </div>
                                <div className="text-[11px] text-dc1-text-muted truncate max-w-[220px]">
                                  {models.slice(0, 3).join(', ')}
                                  {models.length > 3 ? ` +${models.length - 3}` : ''}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="text-xs">
                            {temp == null ? (
                              <span className="text-dc1-text-muted">—</span>
                            ) : (
                              <span
                                className={
                                  tempHot ? 'text-status-error font-medium' : tempWarm ? 'text-status-warning' : 'text-dc1-text-secondary'
                                }
                              >
                                {Math.round(temp)}°C
                              </span>
                            )}
                          </td>
                          <td className="text-xs">
                            {util == null ? (
                              <span className="text-dc1-text-muted">—</span>
                            ) : (
                              <span className="text-dc1-text-secondary">{util.toFixed(0)}%</span>
                            )}
                          </td>
                          <td className="text-xs text-dc1-text-secondary">
                            {vramUsed != null && vramTotal != null
                              ? `${vramUsed.toFixed(1)} / ${vramTotal} GB`
                              : vramTotal != null
                                ? `${vramTotal} GB`
                                : '—'}
                          </td>
                          <td className="text-xs">
                            <span className={hbStale ? 'text-status-warning' : 'text-dc1-text-secondary'}>
                              {formatAge(hbAge)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-dc1-text-muted mt-3">
              &ldquo;Verified online&rdquo; reflects real server-side reachability (WireGuard handshake + reachable engine),
              not the daemon&rsquo;s self-reported heartbeat.
            </p>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
