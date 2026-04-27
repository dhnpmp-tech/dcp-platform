'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../../components/layout/DashboardLayout'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useLanguage } from '../../../../lib/i18n'

const API_BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────
interface CostRates {
  'llm-inference'?: number
  llm_inference?: number
  training?: number
  rendering?: number
  image_generation?: number
  vllm_serve?: number
  default?: number
  [key: string]: number | undefined
}

interface Provider {
  id: number
  name: string
  gpu_model: string
  vram_gb: number | null
  vram_mib: number | null
  gpu_count: number
  status: string
  is_live: boolean
  heartbeat_age_seconds: number | null
  location: string | null
  run_mode: string | null
  reliability_score: number | null
  reputation_score: number
  uptime_percent: number | null
  uptime_pct: number | null
  job_success_rate: number | null
  total_jobs_completed: number | null
  reputation_tier: 'new' | 'reliable' | 'top'
  cached_models: string[]
  driver_version: string | null
  compute_capability: string | null
  cuda_version: string | null
  cost_rates_halala_per_min: CostRates | null
}

// ── Helpers ────────────────────────────────────────────────────────
function halalaPriceToSarHr(halalPerMin: number): string {
  return ((halalPerMin * 60) / 100).toFixed(2)
}

function getDefaultRate(rates: CostRates | null): number {
  if (!rates) return 15
  return rates['llm-inference'] ?? rates.llm_inference ?? rates.default ?? 15
}

function getUptime(p: Provider): number {
  return p.uptime_pct ?? p.uptime_percent ?? 0
}

function reputationBadgeClass(tier: Provider['reputation_tier']): string {
  if (tier === 'top') return 'bg-dc1-amber/20 text-dc1-amber border-dc1-amber/30'
  if (tier === 'reliable') return 'bg-status-success/15 text-status-success border-status-success/30'
  return 'bg-dc1-surface-l2 text-dc1-text-muted border-dc1-border'
}

function reputationLabel(tier: Provider['reputation_tier']): string {
  if (tier === 'top') return 'Top Provider'
  if (tier === 'reliable') return 'Reliable'
  return 'New Provider'
}

function getProviderHealthStatus(provider: Provider): 'online' | 'degraded' | 'offline' {
  if (!provider.is_live) return 'offline'

  // Check heartbeat staleness (>5 min indicates degradation)
  if (provider.heartbeat_age_seconds && provider.heartbeat_age_seconds > 300) {
    return 'degraded'
  }

  // Check job success rate (below 75% is degraded)
  if (provider.job_success_rate !== null && provider.job_success_rate < 75) {
    return 'degraded'
  }

  // Check uptime (below 80% indicates issues)
  const uptime = provider.uptime_pct ?? provider.uptime_percent ?? 100
  if (uptime < 80) {
    return 'degraded'
  }

  return 'online'
}

// ── Icons ──────────────────────────────────────────────────────────
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
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.11 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)
const GpuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
  </svg>
)
const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

// ── Nav ────────────────────────────────────────────────────────────
// ── Stat Card ──────────────────────────────────────────────────────
function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-dc1-surface-l2 rounded-lg p-4 flex flex-col gap-1">
      <p className="text-xs text-dc1-text-muted uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold text-dc1-text-primary">{value}</p>
      {sub && <p className="text-xs text-dc1-text-muted">{sub}</p>}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function ProviderProfilePage() {
  const params = useParams()
  const { t } = useLanguage()
  const providerId = Number(params.id)

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
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
    if (!providerId || isNaN(providerId)) {
      setNotFound(true)
      setLoading(false)
      return
    }

    fetch(`${API_BASE}/providers/available`)
      .then(r => r.json())
      .then(data => {
        const list: Provider[] = data.providers || data || []
        const found = list.find(p => p.id === providerId)
        if (found) {
          setProvider(found)
        } else {
          setNotFound(true)
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [providerId])

  // ── Loading ──
  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="renter">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-dc1-amber border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-dc1-text-muted text-sm">{t('renter.provider_profile.loading')}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // ── Not found ──
  if (notFound || !provider) {
    return (
      <DashboardLayout navItems={navItems} role="renter">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <GpuIcon />
          <h1 className="text-xl font-semibold text-dc1-text-primary">{t('renter.provider_profile.not_found')}</h1>
          <p className="text-dc1-text-muted text-sm">{t('renter.provider_profile.not_found_hint')}</p>
          <Link href="/renter/marketplace" className="btn btn-primary text-sm">
            {t('renter.provider_profile.back_to_marketplace')}
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const uptime = getUptime(provider)
  const defaultRate = getDefaultRate(provider.cost_rates_halala_per_min)
  const priceSarHr = halalaPriceToSarHr(defaultRate)
  const llmRate = provider.cost_rates_halala_per_min?.['llm-inference'] ?? provider.cost_rates_halala_per_min?.llm_inference ?? 15
  const imgRate = provider.cost_rates_halala_per_min?.image_generation ?? 20
  const trainRate = provider.cost_rates_halala_per_min?.training ?? 25

  return (
    <DashboardLayout navItems={navItems} role="renter">
      {/* Back nav */}
      <div className="mb-6">
        <Link
          href="/renter/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-dc1-text-muted hover:text-dc1-text-primary transition-colors"
        >
          <ArrowLeftIcon />
          {t('renter.provider_profile.back_to_marketplace')}
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-dc1-text-primary">
              {provider.gpu_model || 'Unknown GPU'}
            </h1>
            <StatusBadge
              status={getProviderHealthStatus(provider)}
              size="sm"
              pulse={true}
            />
            {provider.is_live && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-status-success/15 text-status-success border border-status-success/30">
                {t('renter.provider_profile.available_now')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {provider.name && (
              <span className="text-sm text-dc1-text-muted">{provider.name}</span>
            )}
            <span className={`inline-flex text-[10px] font-bold tracking-wide px-2 py-0.5 rounded border ${reputationBadgeClass(provider.reputation_tier)}`}>
              {reputationLabel(provider.reputation_tier)}
            </span>
            {provider.location && (
              <span className="text-xs text-dc1-text-muted">{provider.location}</span>
            )}
          </div>
        </div>

        <Link
          href={`/renter/playground?provider=${provider.id}`}
          className="btn btn-primary px-6 py-2.5 text-sm font-semibold whitespace-nowrap"
        >
          {t('marketplace.rent_now')}
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatBlock
          label="Price"
          value={`${priceSarHr} SAR`}
          sub="per hour (LLM inference)"
        />
        <StatBlock
          label="VRAM"
          value={provider.vram_gb != null ? `${provider.vram_gb} GB` : '—'}
          sub={provider.gpu_count > 1 ? `${provider.gpu_count} GPUs` : undefined}
        />
        <StatBlock
          label="Uptime"
          value={`${uptime.toFixed(1)}%`}
          sub="7-day rolling average"
        />
        <StatBlock
          label="Jobs Completed"
          value={(provider.total_jobs_completed ?? 0).toLocaleString()}
          sub={provider.job_success_rate != null ? `${provider.job_success_rate.toFixed(1)}% success rate` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Specs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hardware */}
          <section className="card">
            <h2 className="text-sm font-semibold text-dc1-text-secondary uppercase tracking-wide mb-4">Hardware Specs</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-dc1-text-secondary">GPU Model</dt>
                <dd className="text-dc1-text-primary font-medium">{provider.gpu_model || '—'}</dd>
              </div>
              {provider.vram_gb != null && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">VRAM</dt>
                  <dd className="text-dc1-text-primary font-medium">{provider.vram_gb} GB</dd>
                </div>
              )}
              {provider.gpu_count > 1 && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">GPU Count</dt>
                  <dd className="text-dc1-text-primary font-medium">{provider.gpu_count}×</dd>
                </div>
              )}
              {provider.compute_capability && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">Compute Capability</dt>
                  <dd className="text-dc1-text-primary">{provider.compute_capability}</dd>
                </div>
              )}
              {provider.cuda_version && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">CUDA Version</dt>
                  <dd className="text-dc1-text-primary">{provider.cuda_version}</dd>
                </div>
              )}
              {provider.driver_version && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">Driver Version</dt>
                  <dd className="text-dc1-text-primary">{provider.driver_version}</dd>
                </div>
              )}
              {provider.location && (
                <div className="flex justify-between">
                  <dt className="text-dc1-text-secondary">Location</dt>
                  <dd className="text-dc1-text-primary">{provider.location}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Cached models */}
          {provider.cached_models && provider.cached_models.length > 0 && (
            <section className="card">
              <h2 className="text-sm font-semibold text-dc1-text-secondary uppercase tracking-wide mb-4">
                Cached Models
                <span className="ml-2 text-xs font-normal text-status-success normal-case">(instant start)</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {provider.cached_models.map((m, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded bg-status-success/10 text-status-success border border-status-success/20 font-medium"
                  >
                    {m.split('/').pop()}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Pricing + reliability sidebar */}
        <div className="space-y-6">
          {/* Pricing */}
          <section className="card">
            <h2 className="text-sm font-semibold text-dc1-text-secondary uppercase tracking-wide mb-4">Pricing (SAR/hr)</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-dc1-text-secondary">LLM Inference</dt>
                <dd className="text-dc1-amber font-bold">{halalaPriceToSarHr(llmRate)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-dc1-text-secondary">Image Gen</dt>
                <dd className="text-dc1-amber font-bold">{halalaPriceToSarHr(imgRate)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-dc1-text-secondary">Training</dt>
                <dd className="text-dc1-amber font-bold">{halalaPriceToSarHr(trainRate)}</dd>
              </div>
            </dl>
            <Link
              href={`/renter/playground?provider=${provider.id}`}
              className="btn btn-primary w-full text-center text-sm mt-5"
            >
              Rent GPU
            </Link>
            <Link
              href={`/renter/jobs`}
              className="btn w-full text-center text-sm mt-2 bg-dc1-surface-l2 text-dc1-text-primary hover:bg-dc1-surface-l3 border border-dc1-border"
            >
              Submit Job
            </Link>
          </section>

          {/* Reliability */}
          <section className="card">
            <h2 className="text-sm font-semibold text-dc1-text-secondary uppercase tracking-wide mb-4">Reliability</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-dc1-text-secondary">Uptime</dt>
                <dd className={`font-semibold ${uptime >= 95 ? 'text-status-success' : uptime >= 80 ? 'text-dc1-amber' : 'text-status-error'}`}>
                  {uptime.toFixed(1)}%
                </dd>
              </div>
              {provider.job_success_rate != null && (
                <div className="flex justify-between items-center">
                  <dt className="text-dc1-text-secondary">Success Rate</dt>
                  <dd className={`font-semibold ${provider.job_success_rate >= 95 ? 'text-status-success' : provider.job_success_rate >= 70 ? 'text-dc1-amber' : 'text-status-error'}`}>
                    {provider.job_success_rate.toFixed(1)}%
                  </dd>
                </div>
              )}
              {provider.reliability_score != null && (
                <div className="flex justify-between items-center">
                  <dt className="text-dc1-text-secondary">Reliability Score</dt>
                  <dd className={`font-semibold ${provider.reliability_score >= 90 ? 'text-status-success' : provider.reliability_score >= 70 ? 'text-dc1-amber' : 'text-status-error'}`}>
                    {provider.reliability_score}%
                  </dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-dc1-text-secondary">Jobs Completed</dt>
                <dd className="text-dc1-text-primary font-medium">{(provider.total_jobs_completed ?? 0).toLocaleString()}</dd>
              </div>
              {provider.heartbeat_age_seconds !== null && (
                <div className="flex justify-between items-center">
                  <dt className="text-dc1-text-secondary">Last Seen</dt>
                  <dd className="text-dc1-text-muted text-xs">
                    {provider.heartbeat_age_seconds < 60
                      ? `${provider.heartbeat_age_seconds}s ago`
                      : `${Math.floor(provider.heartbeat_age_seconds / 60)}m ago`}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </DashboardLayout>
  )
}
