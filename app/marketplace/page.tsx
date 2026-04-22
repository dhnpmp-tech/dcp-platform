'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { useLanguage } from '../lib/i18n'
import FeaturedArabicModels from '../components/marketplace/FeaturedArabicModels'

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
  gpu_count: number
  status: string
  is_live: boolean
  heartbeat_age_seconds: number | null
  location: string | null
  reliability_score: number | null
  reputation_score: number
  uptime_percent: number | null
  total_jobs_completed: number | null
  cached_models: string[]
  compute_capability: string | null
  cuda_version: string | null
  cost_rates_halala_per_min: CostRates | null
  supported_compute_types?: string[]
}

// Shape returned by /providers/public
interface PublicProvider {
  gpu_model: string
  vram_mb: number | null
  gpu_count: number
  supported_compute_types: string[]
  cost_per_hour_sar: number
  jobs_completed: number
  online: true
}

// ── Normalization ──────────────────────────────────────────────────
function normalizePublic(p: PublicProvider, idx: number): Provider {
  const halalaPerMin = Math.round((p.cost_per_hour_sar * 100) / 60)
  return {
    id: idx,
    name: p.gpu_model,
    gpu_model: p.gpu_model,
    vram_gb: p.vram_mb !== null ? Math.round((p.vram_mb / 1024) * 10) / 10 : null,
    gpu_count: p.gpu_count,
    status: 'online',
    is_live: true,
    heartbeat_age_seconds: null,
    location: null,
    reliability_score: null,
    reputation_score: 0,
    uptime_percent: null,
    total_jobs_completed: p.jobs_completed,
    cached_models: [],
    compute_capability: null,
    cuda_version: null,
    cost_rates_halala_per_min: {
      'llm-inference': halalaPerMin,
      default: halalaPerMin,
    },
    supported_compute_types: p.supported_compute_types,
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function getDefaultRate(rates: CostRates | null): number {
  if (!rates) return 15
  return rates['llm-inference'] ?? rates.llm_inference ?? rates.default ?? 15
}

function halalaPriceToSarMin(halalPerMin: number): string {
  return (halalPerMin / 100).toFixed(2)
}

function halalaPriceToSarHr(halalPerMin: number): string {
  return ((halalPerMin * 60) / 100).toFixed(2)
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}

function getHeartbeatInterpretationKey(seconds: number | null): string {
  if (seconds === null) return 'marketplace.trust_heartbeat_unknown'
  if (seconds <= 60) return 'marketplace.trust_heartbeat_fresh'
  if (seconds <= 300) return 'marketplace.trust_heartbeat_recent'
  return 'marketplace.trust_heartbeat_stale'
}

function getReliabilityInterpretationKey(uptime: number | null): string {
  if (uptime === null) return 'marketplace.trust_reliability_unknown'
  if (uptime >= 90) return 'marketplace.trust_reliability_high'
  if (uptime >= 75) return 'marketplace.trust_reliability_medium'
  return 'marketplace.trust_reliability_low'
}

// ── Sign-up Overlay ────────────────────────────────────────────────
function SignUpOverlay({ gpu, onClose }: { gpu: Provider; onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dc1-void/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dc1-surface-l2 border border-dc1-amber/30 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-dc1-amber/10 border border-dc1-amber/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-dc1-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-dc1-text-primary mb-1">{gpu.gpu_model}</h3>
          <p className="text-dc1-text-muted text-sm">{t('marketplace.sign_up_to_start')}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/renter/register" className="btn btn-primary w-full text-center">
            {t('marketplace.create_renter')}
          </Link>
          <button onClick={onClose} className="btn btn-secondary w-full">
            {t('marketplace.clear_search')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Provider Card ──────────────────────────────────────────────────
function ProviderCard({ provider, onClick }: { provider: Provider; onClick: () => void }) {
  const { t } = useLanguage()
  const rate = getDefaultRate(provider.cost_rates_halala_per_min)
  const vram = provider.vram_gb ?? null
  const uptime = provider.uptime_percent ?? provider.reliability_score ?? null
  const computeTypes = provider.supported_compute_types ?? []

  return (
    <article
      className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-4 hover:border-dc1-amber/30 hover:shadow-amber transition-all duration-200 group cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-dc1-text-primary leading-tight truncate group-hover:text-dc1-amber transition-colors">
            {provider.gpu_model || t('marketplace.unknown')}
          </h3>
          {provider.name !== provider.gpu_model && (
            <p className="text-xs text-dc1-text-muted mt-0.5 truncate">{provider.name}</p>
          )}
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-success/10 text-status-success border border-status-success/20">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
          {t('marketplace.online')}
        </span>
      </div>

      {/* Specs */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {vram !== null && (
          <div>
            <dt className="text-dc1-text-muted text-xs uppercase tracking-wide">{t('marketplace.vram_label')}</dt>
            <dd className="text-dc1-text-primary font-semibold mt-0.5">{vram} GB</dd>
          </div>
        )}
        {provider.gpu_count > 0 && (
          <div>
            <dt className="text-dc1-text-muted text-xs uppercase tracking-wide">{t('marketplace.gpu_count')}</dt>
            <dd className="text-dc1-text-primary font-semibold mt-0.5">{provider.gpu_count}×</dd>
          </div>
        )}
        {uptime !== null && (
          <div>
            <dt className="text-dc1-text-muted text-xs uppercase tracking-wide">{t('marketplace.uptime_label')}</dt>
            <dd className={`font-semibold mt-0.5 ${uptime >= 90 ? 'text-status-success' : uptime >= 70 ? 'text-dc1-amber' : 'text-status-error'}`}>
              {uptime.toFixed(1)}%
            </dd>
          </div>
        )}
        {provider.total_jobs_completed !== null && provider.total_jobs_completed > 0 && (
          <div>
            <dt className="text-dc1-text-muted text-xs uppercase tracking-wide">{t('marketplace.jobs_completed')}</dt>
            <dd className="text-dc1-text-primary font-semibold mt-0.5">{provider.total_jobs_completed}</dd>
          </div>
        )}
        {provider.location && (
          <div className="col-span-2">
            <dt className="text-dc1-text-muted text-xs uppercase tracking-wide">{t('marketplace.region_label')}</dt>
            <dd className="text-dc1-text-primary font-semibold mt-0.5 truncate">{provider.location}</dd>
          </div>
        )}
      </dl>

      {/* Compute type badges */}
      {computeTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {computeTypes.map((ct, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-dc1-surface-l3 text-dc1-text-secondary border border-dc1-border">
              {ct.replace(/-/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Pricing */}
      <div className="bg-dc1-surface-l1 rounded-lg px-4 py-3 flex items-center justify-between mt-auto">
        <div>
          <p className="text-xs text-dc1-text-muted mb-0.5">{t('marketplace.price_llm')}</p>
          <p className="text-lg font-extrabold text-dc1-amber">
            {halalaPriceToSarMin(rate)} <span className="text-xs font-normal text-dc1-text-secondary">{t('marketplace.sar_min')}</span>
          </p>
          <p className="text-xs text-dc1-text-muted">{halalaPriceToSarHr(rate)} {t('marketplace.sar_hr')}</p>
        </div>
        {provider.heartbeat_age_seconds !== null && (
          <p className="text-xs text-dc1-text-muted">{t('marketplace.last_seen')}: {formatAge(provider.heartbeat_age_seconds)}</p>
        )}
      </div>

      <div className="rounded-md border border-dc1-border bg-dc1-surface-l1 px-3 py-2 space-y-1">
        <p className="text-xs text-dc1-text-secondary">{t(getHeartbeatInterpretationKey(provider.heartbeat_age_seconds))}</p>
        <p className="text-xs text-dc1-text-secondary">{t(getReliabilityInterpretationKey(uptime))}</p>
      </div>
      <p className="text-[11px] text-dc1-text-muted">{t('marketplace.runtime_settlement_reminder')}</p>

      {/* Cached models */}
      {provider.cached_models && provider.cached_models.length > 0 && (
        <div>
          <p className="text-xs text-dc1-text-muted mb-1.5">{t('marketplace.cached_models_label')}</p>
          <div className="flex flex-wrap gap-1">
            {provider.cached_models.slice(0, 3).map((m, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded bg-dc1-amber/5 text-dc1-amber border border-dc1-amber/20">
                {m.split('/').pop()}
              </span>
            ))}
            {provider.cached_models.length > 3 && (
              <span className="text-xs px-2 py-0.5 rounded bg-dc1-surface-l3 text-dc1-text-muted">
                +{provider.cached_models.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

// ── Skeleton Card ──────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="h-4 bg-dc1-surface-l3 rounded w-3/4" />
          <div className="h-3 bg-dc1-surface-l3 rounded w-1/2 mt-2" />
        </div>
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-16" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="h-3 bg-dc1-surface-l3 rounded w-1/2 mb-1" />
            <div className="h-4 bg-dc1-surface-l3 rounded w-3/4" />
          </div>
        ))}
      </div>
      <div className="bg-dc1-surface-l1 rounded-lg h-16" />
    </div>
  )
}

// ── Market Rates Summary ───────────────────────────────────────────
function MarketRates({ providers }: { providers: Provider[] }) {
  const { t } = useLanguage()
  const live = providers.filter(p => p.is_live)
  if (live.length === 0) return null

  const rates = live.map(p => getDefaultRate(p.cost_rates_halala_per_min))
  const minRate = Math.min(...rates)
  const maxRate = Math.max(...rates)
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length

  return (
    <section className="bg-dc1-surface-l1/50 border-b border-dc1-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wider">{t('marketplace.market_rates')}</span>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-dc1-text-muted">{t('marketplace.market_min')}</span>
              <span className="text-sm font-bold text-status-success">{halalaPriceToSarHr(minRate)} {t('marketplace.sar_hr')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-dc1-text-muted">{t('marketplace.market_avg')}</span>
              <span className="text-sm font-bold text-dc1-amber">{halalaPriceToSarHr(avgRate)} {t('marketplace.sar_hr')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-dc1-text-muted">{t('marketplace.market_max')}</span>
              <span className="text-sm font-bold text-dc1-text-secondary">{halalaPriceToSarHr(maxRate)} {t('marketplace.sar_hr')}</span>
            </div>
          </div>
          <div className="ms-auto text-xs text-dc1-text-muted">{live.length} {t('marketplace.live_gpus_online')}</div>
        </div>
      </div>
    </section>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MarketplacePage() {
  const { t, dir } = useLanguage()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'price-asc' | 'vram-desc' | 'availability'>('availability')
  const [filterComputeType, setFilterComputeType] = useState<string>('all')
  const [filterMinVram, setFilterMinVram] = useState<string>('')
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>('')
  const [selectedGpu, setSelectedGpu] = useState<Provider | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      // Try /providers/public first (no auth, 30s cached), then fall back
      let res = await fetch('/api/dc1/providers/public')
      if (res.ok) {
        const data: PublicProvider[] = await res.json()
        if (Array.isArray(data)) {
          setProviders(data.map((p, i) => normalizePublic(p, i)))
          setLastUpdated(new Date())
          setError(false)
          return
        }
      }

      // Fallback to /providers/marketplace then /providers/available
      res = await fetch('/api/dc1/providers/marketplace')
      if (!res.ok) res = await fetch('/api/dc1/providers/available')
      if (res.ok) {
        const data = await res.json()
        const list: Provider[] = Array.isArray(data)
          ? data
          : data.providers ?? data.data ?? []
        setProviders(list)
        setLastUpdated(new Date())
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
    const interval = setInterval(fetchProviders, 30_000)
    return () => clearInterval(interval)
  }, [fetchProviders])

  // Filter
  const filtered = providers.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const nameMatch = (p.gpu_model ?? '').toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q)
      if (!nameMatch) return false
    }
    if (filterComputeType !== 'all' && p.supported_compute_types) {
      const has = p.supported_compute_types.some(ct =>
        ct.toLowerCase().includes(filterComputeType.toLowerCase())
      )
      if (!has) return false
    }
    if (filterMinVram !== '') {
      const minVram = parseFloat(filterMinVram)
      if (!isNaN(minVram) && (p.vram_gb ?? 0) < minVram) return false
    }
    if (filterMaxPrice !== '') {
      const maxPrice = parseFloat(filterMaxPrice)
      const rateHr = parseFloat(halalaPriceToSarHr(getDefaultRate(p.cost_rates_halala_per_min)))
      if (!isNaN(maxPrice) && rateHr > maxPrice) return false
    }
    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'availability') {
      if (a.is_live !== b.is_live) return a.is_live ? -1 : 1
      return (b.reputation_score ?? 0) - (a.reputation_score ?? 0)
    }
    if (sortBy === 'price-asc') {
      return getDefaultRate(a.cost_rates_halala_per_min) - getDefaultRate(b.cost_rates_halala_per_min)
    }
    if (sortBy === 'vram-desc') {
      return (b.vram_gb ?? 0) - (a.vram_gb ?? 0)
    }
    return 0
  })

  const onlineCount = providers.filter(p => p.is_live).length
  const pathChooserLanes = [
    {
      key: 'self_serve_renter',
      label: t('path_chooser.self_serve.label'),
      description: t('path_chooser.self_serve.desc'),
      href: '/renter/register?source=public_marketplace_path_chooser&lane=self_serve_renter',
    },
    {
      key: 'provider_onboarding',
      label: t('path_chooser.provider.label'),
      description: t('path_chooser.provider.desc'),
      href: '/setup?source=public_marketplace_path_chooser&lane=provider_onboarding',
    },
    {
      key: 'enterprise_intake',
      label: t('path_chooser.enterprise.label'),
      description: t('path_chooser.enterprise.desc'),
      href: '/support?category=enterprise&source=public_marketplace_path_chooser&lane=enterprise_intake#contact-form',
    },
    {
      key: 'arabic_model_docs',
      label: t('path_chooser.arabic.label'),
      description: t('path_chooser.arabic.desc'),
      href: '/docs?source=public_marketplace_path_chooser&lane=arabic_model_docs',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-dc1-border bg-gradient-to-b from-dc1-amber/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-xs font-medium mb-5">
                <span className="w-1.5 h-1.5 bg-status-success rounded-full animate-pulse" />
                {onlineCount > 0 ? `${onlineCount} ${t('marketplace.live_gpus_online')}` : t('marketplace.live_badge')}
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-dc1-text-primary mb-4 leading-tight">
                {t('marketplace.hero_title')}<br />
                <span className="text-dc1-amber">{t('marketplace.hero_on_demand')}</span>
              </h1>
              <p className="text-dc1-text-secondary text-lg mb-8 leading-relaxed">
                {t('marketplace.hero_desc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/renter/register" className="btn btn-primary btn-lg">
                  {t('marketplace.get_started')}
                </Link>
                <Link href="/docs" className="btn btn-secondary btn-lg">
                  {t('marketplace.view_docs')}
                </Link>
              </div>
              <div className="mt-5 rounded-xl border border-dc1-border bg-dc1-surface-l1/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-1">
                  {t('path_chooser.title')}
                </p>
                <p className="text-xs text-dc1-text-secondary mb-3">{t('path_chooser.subtitle')}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {pathChooserLanes.map((lane) => (
                    <Link key={lane.key} href={lane.href} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 transition-colors hover:border-dc1-amber">
                      <p className="text-sm font-semibold text-dc1-text-primary">{lane.label}</p>
                      <p className="mt-1 text-xs text-dc1-text-secondary">{lane.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-dc1-border bg-dc1-surface-l1/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
                  {t('marketplace.reliability_strip_label')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-dc1-text-secondary">
                  <p>
                    <span className="text-dc1-text-primary font-semibold">{t('marketplace.filter_gpu_model')}</span>
                    {' + '}
                    <span className="text-dc1-text-primary font-semibold">{t('marketplace.filter_min_vram')}</span>
                    {' + '}
                    <span className="text-dc1-text-primary font-semibold">{t('marketplace.filter_compute_type')}</span>
                  </p>
                  <p>
                    <span className="text-dc1-text-primary font-semibold">{t('marketplace.updated')}</span>
                    {' '}
                    {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </p>
                  <p>
                    <Link href="/renter/register" className="text-dc1-amber hover:underline">
                      {t('marketplace.get_started')}
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sub-nav: GPU Marketplace | Templates | Models */}
        <section className="border-b border-dc1-border bg-dc1-surface-l1/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-1 overflow-x-auto py-2">
              <span className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium bg-dc1-amber text-white border border-dc1-amber">
                GPU Marketplace
              </span>
              <Link href="/marketplace/templates" className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium text-dc1-text-secondary border border-dc1-border hover:border-dc1-amber/40 hover:text-dc1-text-primary transition-colors">
                🚀 Templates
              </Link>
              <Link href="/marketplace/models" className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium text-dc1-text-secondary border border-dc1-border hover:border-dc1-amber/40 hover:text-dc1-text-primary transition-colors">
                🌙 Arabic Models
              </Link>
            </div>
          </div>
        </section>

        {/* Featured Arabic Models */}
        <FeaturedArabicModels />

        {/* Market rates bar */}
        {!loading && !error && <MarketRates providers={providers} />}

        {/* Search + Filter bar */}
        <section className="border-b border-dc1-border bg-dc1-surface-l1/50 sticky top-0 z-10 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-3 items-center flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48 w-full sm:w-auto">
              <svg
                className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc1-text-muted pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={t('marketplace.search_placeholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input ps-9 w-full text-sm"
                aria-label={t('marketplace.search_placeholder')}
              />
            </div>

            {/* Compute type filter */}
            <select
              value={filterComputeType}
              onChange={e => setFilterComputeType(e.target.value)}
              className="input text-sm w-full sm:w-auto"
              aria-label={t('marketplace.filter_compute_type')}
            >
              <option value="all">{t('marketplace.all_types')}</option>
              <option value="inference">{t('marketplace.compute_inference')}</option>
              <option value="training">{t('marketplace.compute_training')}</option>
              <option value="rendering">{t('marketplace.compute_rendering')}</option>
            </select>

            {/* Min VRAM filter */}
            <input
              type="number"
              min="0"
              step="4"
              placeholder={t('marketplace.filter_vram')}
              value={filterMinVram}
              onChange={e => setFilterMinVram(e.target.value)}
              className="input text-sm w-full sm:w-36"
              aria-label={t('marketplace.filter_vram')}
            />

            {/* Max price filter */}
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder={t('marketplace.filter_price')}
              value={filterMaxPrice}
              onChange={e => setFilterMaxPrice(e.target.value)}
              className="input text-sm w-full sm:w-40"
              aria-label={t('marketplace.filter_price')}
            />

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="input text-sm w-full sm:w-auto"
              aria-label={t('common.sort_reputation')}
            >
              <option value="availability">{t('marketplace.sort_online')}</option>
              <option value="price-asc">{t('marketplace.sort_price')}</option>
              <option value="vram-desc">{t('marketplace.sort_vram')}</option>
            </select>

            <p className="text-xs text-dc1-text-muted whitespace-nowrap">
              {loading ? t('common.loading') : `${sorted.length} / ${providers.length} ${t('marketplace.providers_count')}`}
            </p>
          </div>
        </section>

        {/* Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-dc1-text-secondary mb-2">{t('marketplace.error_msg')}</p>
              <button onClick={fetchProviders} className="btn btn-secondary btn-sm mt-4">
                {t('marketplace.try_again')}
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-dc1-text-secondary mb-1">
                {providers.length === 0
                  ? t('marketplace.no_gpus_online')
                  : t('marketplace.no_match_search')}
              </p>
              <p className="text-sm text-dc1-text-muted">
                {providers.length === 0
                  ? t('marketplace.check_back')
                  : t('marketplace.try_different')}
              </p>
              {(search || filterComputeType !== 'all' || filterMinVram || filterMaxPrice) && (
                <button
                  onClick={() => { setSearch(''); setFilterComputeType('all'); setFilterMinVram(''); setFilterMaxPrice('') }}
                  className="btn btn-outline btn-sm mt-4"
                >
                  {t('marketplace.clear_search')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {sorted.map((p, i) => (
                <ProviderCard key={`${p.id}-${i}`} provider={p} onClick={() => setSelectedGpu(p)} />
              ))}
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        {!loading && !error && providers.length > 0 && (
          <section className="border-t border-dc1-border bg-dc1-surface-l1">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-3">
                {t('marketplace.cta_title')}
              </h2>
              <p className="text-dc1-text-secondary mb-8 max-w-xl mx-auto">
                {t('marketplace.cta_desc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/renter/register" className="btn btn-primary btn-lg">
                  {t('marketplace.create_renter')}
                </Link>
                <Link href="/setup" className="btn btn-secondary btn-lg">
                  {t('marketplace.become_provider')}
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />

      {/* Sign-up overlay */}
      {selectedGpu && (
        <SignUpOverlay gpu={selectedGpu} onClose={() => setSelectedGpu(null)} />
      )}
    </div>
  )
}
