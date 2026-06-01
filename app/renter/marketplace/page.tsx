'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import { useLanguage } from '../../lib/i18n'
import {
  buildRenterLoginRedirect,
  buildRenterPlaygroundPath,
  setPendingRenterAuthIntent,
  type RenterAuthIntent,
} from '../../lib/renter-auth-intent'

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

interface Filters {
  minVram: number
  maxPriceSar: number
  gpuModels: string[]
  region: string
}

type SortOption = 'price-asc' | 'vram-desc' | 'availability' | 'reputation'
type MarketplaceTab = 'gpus' | 'models'

interface ModelRegistryEntry {
  model_id: string
  display_name: string
  family: string
  vram_gb: number
  quantization: string
  context_window: number
  use_cases: string[]
  min_gpu_vram_gb: number
  providers_online: number
  avg_price_sar_per_min: number
  status: 'available' | 'no_providers'
}

interface ModelCardFeedEntry {
  model_id: string
  summary?: {
    en?: string
    ar?: string
  }
  metrics?: {
    vram_required_gb?: number | null
    latency_ms?: {
      p50?: number | null
      p95?: number | null
      p99?: number | null
    }
    arabic_quality?: {
      arabic_mmlu_score?: number | null
      arabicaqa_score?: number | null
    }
    cost_per_1k_tokens_sar?: number | null
    cold_start_ms?: number | null
  }
}

interface TemplateCatalogEntry {
  id: string
  name: string
  model_name: string
  description: string
  startup_tier: string
  startup_seconds: number | null
  p95_latency_ms: number | null
}

// ── Constants ──────────────────────────────────────────────────────
const GPU_MODEL_OPTIONS = ['RTX 3090', 'RTX 4090', 'A100', 'H100', 'Other']
const REGION_OPTIONS = ['All Regions', 'KSA', 'UAE', 'Other']
const POLL_INTERVAL_MS = 30_000

// ── Helpers ────────────────────────────────────────────────────────
function halalaPriceToSarHr(halalPerMin: number): string {
  return ((halalPerMin * 60) / 100).toFixed(2)
}

function getDefaultRate(rates: CostRates | null): number {
  if (!rates) return 15
  return rates['llm-inference'] ?? rates.llm_inference ?? rates.default ?? 15
}

function getDefaultRateSarHr(rates: CostRates | null): number {
  return (getDefaultRate(rates) * 60) / 100
}

// GPU tier A/B/C: A = datacenter (H100/A100), B = prosumer (RTX 4090/L40), C = consumer
function getGpuTier(gpuModel: string | null): 'A' | 'B' | 'C' {
  if (!gpuModel) return 'C'
  const m = gpuModel.toUpperCase()
  if (m.includes('H200') || m.includes('H100') || m.includes('A100')) return 'A'
  if (m.includes('RTX 4090') || m.includes('RTX4090') || m.includes('L40') || m.includes('A6000')) return 'B'
  return 'C'
}

function gpuTierBadgeClass(tier: 'A' | 'B' | 'C'): string {
  if (tier === 'A') return 'bg-dc1-amber/20 text-dc1-amber border-dc1-amber/40'
  if (tier === 'B') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return 'bg-dc1-surface-l2 text-dc1-text-secondary border-dc1-border'
}

function formatAge(seconds: number | null, t: (key: string) => string): string {
  if (seconds === null) return t('marketplace.unknown')
  if (seconds < 60) return `${seconds}s ${t('marketplace.ago')}`
  return `${Math.floor(seconds / 60)}m ${t('marketplace.ago')}`
}

function getHeartbeatInterpretationKey(seconds: number | null): string {
  if (seconds === null) return 'marketplace.trust_heartbeat_unknown'
  if (seconds <= 60) return 'marketplace.trust_heartbeat_fresh'
  if (seconds <= 300) return 'marketplace.trust_heartbeat_recent'
  return 'marketplace.trust_heartbeat_stale'
}

function getReliabilityInterpretationKey(uptime: number, successRate: number): string {
  const composite = (uptime + successRate) / 2
  if (composite >= 90) return 'marketplace.trust_reliability_high'
  if (composite >= 75) return 'marketplace.trust_reliability_medium'
  return 'marketplace.trust_reliability_low'
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatReliabilityTimestamp(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
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

function extractGpuFamily(gpuModel: string | null | undefined): string {
  const model = String(gpuModel || '').toUpperCase()
  if (!model) return 'Unknown'
  if (model.includes('H200')) return 'H200'
  if (model.includes('H100')) return 'H100'
  if (model.includes('A100')) return 'A100'
  if (model.includes('A40')) return 'A40'
  if (model.includes('L40')) return 'L40'
  if (model.includes('4090')) return 'RTX 4090'
  if (model.includes('3090')) return 'RTX 3090'
  if (model.includes('A6000')) return 'RTX A6000'
  if (model.includes('A5000')) return 'RTX A5000'
  if (model.includes('RTX')) return 'RTX'
  return model.split(/[\s/-]+/).slice(0, 2).join(' ') || 'Unknown'
}

function matchesGpuModelFilter(gpuModel: string, selected: string[]): boolean {
  if (selected.length === 0) return true
  const m = gpuModel?.toUpperCase() ?? ''
  for (const opt of selected) {
    if (opt === 'RTX 3090' && m.includes('3090')) return true
    if (opt === 'RTX 4090' && m.includes('4090')) return true
    if (opt === 'A100' && m.includes('A100')) return true
    if (opt === 'H100' && m.includes('H100')) return true
    if (opt === 'Other') {
      const isKnown = m.includes('3090') || m.includes('4090') || m.includes('A100') || m.includes('H100')
      if (!isKnown) return true
    }
  }
  return false
}

function matchesRegion(location: string | null, region: string): boolean {
  if (region === 'All Regions' || !region) return true
  if (!location) return region === 'Other'
  const loc = location.toUpperCase()
  if (region === 'KSA') return loc.includes('KSA') || loc.includes('SAUDI') || loc.includes('RIYADH') || loc.includes('JEDDAH') || loc.includes('MECCA') || loc.includes('DAMMAM')
  if (region === 'UAE') return loc.includes('UAE') || loc.includes('DUBAI') || loc.includes('ABU DHABI') || loc.includes('SHARJAH')
  // Other: not KSA and not UAE
  const isKSA = loc.includes('KSA') || loc.includes('SAUDI') || loc.includes('RIYADH') || loc.includes('JEDDAH')
  const isUAE = loc.includes('UAE') || loc.includes('DUBAI') || loc.includes('ABU DHABI')
  return !isKSA && !isUAE
}

function reputationTierRank(tier: Provider['reputation_tier']): number {
  if (tier === 'top') return 3
  if (tier === 'reliable') return 2
  return 1
}

function reputationTierBadgeClass(tier: Provider['reputation_tier']): string {
  if (tier === 'top') return 'bg-dc1-amber/20 text-dc1-amber border-dc1-amber/30'
  if (tier === 'reliable') return 'bg-status-success/15 text-status-success border-status-success/30'
  return 'bg-dc1-surface-l2 text-dc1-text-muted border-dc1-border'
}

function reputationTierLabel(tier: Provider['reputation_tier'], t: (key: string) => string): string {
  if (tier === 'top') return t('marketplace.reputation_top')
  if (tier === 'reliable') return t('marketplace.reputation_reliable')
  return t('marketplace.reputation_new')
}

function normalizeTag(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
}

function splitModelUseCases(useCases: string[]): { taskTypes: string[]; languages: string[] } {
  const languageSet = new Set<string>()
  const taskSet = new Set<string>()

  for (const raw of useCases || []) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    if (tag.includes('arabic')) {
      languageSet.add('arabic')
      continue
    }
    if (tag.includes('english')) {
      languageSet.add('english')
      continue
    }
    if (tag.includes('multilingual')) {
      languageSet.add('multilingual')
      continue
    }
    taskSet.add(tag)
  }

  if (languageSet.size === 0) {
    languageSet.add('multilingual')
  }

  return { taskTypes: [...taskSet], languages: [...languageSet] }
}

function prettyTag(value: string): string {
  return value
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatMilliseconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function calculatePricingComparison(dcPriceSarPerMin: number): {
  vastaiComparison: { marketRange: string; savings: string; savingsPercent: number }
  runpodComparison: { marketRange: string; savings: string; savingsPercent: number }
} {
  // Market data from platform pricing model
  // Vast.ai: $0.10-$2.50/hr = 0.0017-0.0417 SAR/min (at 1 USD = 3.75 SAR)
  // RunPod: $0.20-$3.50/hr = 0.0033-0.0583 SAR/min

  const vastaiLowSarPerMin = 0.10 * 3.75 / 60  // ~0.006 SAR/min
  const vastaiHighSarPerMin = 2.50 * 3.75 / 60 // ~0.156 SAR/min
  const runpodLowSarPerMin = 0.20 * 3.75 / 60  // ~0.0125 SAR/min
  const runpodHighSarPerMin = 3.50 * 3.75 / 60 // ~0.219 SAR/min

  const vastaiMidpoint = (vastaiLowSarPerMin + vastaiHighSarPerMin) / 2
  const runpodMidpoint = (runpodLowSarPerMin + runpodHighSarPerMin) / 2

  const vastaiSavingsPercent = Math.round(((vastaiMidpoint - dcPriceSarPerMin) / vastaiMidpoint) * 100)
  const runpodSavingsPercent = Math.round(((runpodMidpoint - dcPriceSarPerMin) / runpodMidpoint) * 100)

  return {
    vastaiComparison: {
      marketRange: `$${(vastaiLowSarPerMin * 60 / 3.75).toFixed(2)}-${(vastaiHighSarPerMin * 60 / 3.75).toFixed(2)}/hr`,
      savings: `${(vastaiMidpoint - dcPriceSarPerMin).toFixed(3)} SAR/min`,
      savingsPercent: Math.max(0, vastaiSavingsPercent),
    },
    runpodComparison: {
      marketRange: `$${(runpodLowSarPerMin * 60 / 3.75).toFixed(2)}-${(runpodHighSarPerMin * 60 / 3.75).toFixed(2)}/hr`,
      savings: `${(runpodMidpoint - dcPriceSarPerMin).toFixed(3)} SAR/min`,
      savingsPercent: Math.max(0, runpodSavingsPercent),
    },
  }
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
const FilterIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
)
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

// ── Filter Sidebar ─────────────────────────────────────────────────
function FilterSidebar({
  filters,
  onChange,
  matchCount,
  t,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  matchCount: number
  t: (key: string) => string
}) {
  function toggleGpuModel(model: string) {
    const next = filters.gpuModels.includes(model)
      ? filters.gpuModels.filter(m => m !== model)
      : [...filters.gpuModels, model]
    onChange({ ...filters, gpuModels: next })
  }

  function resetFilters() {
    onChange({ minVram: 0, maxPriceSar: 50, gpuModels: [], region: 'All Regions' })
  }

  const hasActiveFilters =
    filters.minVram > 0 ||
    filters.maxPriceSar < 50 ||
    filters.gpuModels.length > 0 ||
    filters.region !== 'All Regions'

  return (
    <aside className="flex flex-col gap-5" aria-label={t('marketplace.filters_aria')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-dc1-text-primary uppercase tracking-wide">{t('marketplace.filters_title')}</h2>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-dc1-amber hover:underline"
          >
            {t('marketplace.filters_reset')}
          </button>
        )}
      </div>

      {/* Match count */}
      <p className="text-xs text-dc1-text-muted -mt-2">
        {matchCount} {matchCount === 1 ? t('marketplace.provider_match_singular') : t('marketplace.provider_match_plural')}
      </p>

      {/* Min VRAM */}
      <div>
        <label className="block text-xs font-medium text-dc1-text-secondary mb-2">
          {t('marketplace.filter_min_vram')} — <span className="text-dc1-amber font-semibold">{filters.minVram === 0 ? t('marketplace.any') : `${filters.minVram} GB`}</span>
        </label>
        <input
          type="range"
          min={0}
          max={80}
          step={4}
          value={filters.minVram}
          onChange={e => onChange({ ...filters, minVram: Number(e.target.value) })}
          className="w-full accent-dc1-amber"
          aria-label={t('marketplace.filter_min_vram')}
        />
        <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
          <span>{t('marketplace.any')}</span>
          <span>80 GB</span>
        </div>
      </div>

      {/* Max Price */}
      <div>
        <label className="block text-xs font-medium text-dc1-text-secondary mb-2">
          {t('marketplace.filter_max_price')} — <span className="text-dc1-amber font-semibold">{filters.maxPriceSar >= 50 ? t('marketplace.any') : `${filters.maxPriceSar} ${t('marketplace.sar_hr')}`}</span>
        </label>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={filters.maxPriceSar}
          onChange={e => onChange({ ...filters, maxPriceSar: Number(e.target.value) })}
          className="w-full accent-dc1-amber"
          aria-label={t('marketplace.filter_max_price')}
        />
        <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
          <span>0 {t('common.sar')}</span>
          <span>50+ {t('common.sar')}</span>
        </div>
      </div>

      {/* GPU Model */}
      <div>
        <p className="text-xs font-medium text-dc1-text-secondary mb-2">{t('marketplace.filter_gpu_model')}</p>
        <div className="space-y-1.5">
          {GPU_MODEL_OPTIONS.map(model => (
            <label key={model} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.gpuModels.includes(model)}
                onChange={() => toggleGpuModel(model)}
                className="accent-dc1-amber w-3.5 h-3.5 rounded"
              />
              <span className="text-sm text-dc1-text-secondary group-hover:text-dc1-text-primary transition-colors">
                {model === 'Other' ? t('marketplace.gpu_model_other') : model}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Region */}
      <div>
        <label className="block text-xs font-medium text-dc1-text-secondary mb-2" htmlFor="region-select">
          {t('marketplace.region_label')}
        </label>
        <select
          id="region-select"
          value={filters.region}
          onChange={e => onChange({ ...filters, region: e.target.value })}
          className="input w-full text-sm"
        >
          {REGION_OPTIONS.map(r => (
            <option key={r} value={r}>
              {r === 'All Regions' ? t('marketplace.region_all') : r === 'Other' ? t('marketplace.region_other') : r}
            </option>
          ))}
        </select>
      </div>
    </aside>
  )
}

// ── Deploy Cost Preview Modal ───────────────────────────────────────
function DeployCostModal({
  provider,
  t,
  onClose,
  onConfirm,
}: {
  provider: Provider
  t: (key: string) => string
  onClose: () => void
  onConfirm: () => void
}) {
  const [hours, setHours] = useState(1)
  const tier = getGpuTier(provider.gpu_model)
  const llmRate = provider.cost_rates_halala_per_min?.['llm-inference']
    ?? provider.cost_rates_halala_per_min?.llm_inference
    ?? 15
  const ratePerMin = llmRate / 100 // SAR per minute
  const estimatedCost = (ratePerMin * hours * 60).toFixed(2)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dc1-void/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-dc1-surface-l1 border border-dc1-border rounded-2xl p-6 max-w-sm w-full shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-dc1-text-primary">{provider.gpu_model || t('marketplace.unknown')}</h3>
            <p className="text-xs text-dc1-text-muted mt-0.5">{provider.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${gpuTierBadgeClass(tier)}`}>
              Tier {tier}
            </span>
            <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary text-lg leading-none">×</button>
          </div>
        </div>

        {/* Tier explanation */}
        <div className="mb-4 rounded-lg bg-dc1-surface-l2 px-3 py-2 text-xs text-dc1-text-secondary">
          {tier === 'A' && 'Tier A — Datacenter GPU (H100/A100). Highest performance, suitable for large model inference and training.'}
          {tier === 'B' && 'Tier B — Prosumer GPU (RTX 4090/L40). Great price-performance for mid-size model inference.'}
          {tier === 'C' && 'Tier C — Consumer GPU. Cost-effective for smaller models and development workloads.'}
        </div>

        {/* Rate */}
        <div className="mb-4 rounded-lg bg-dc1-surface-l2 px-3 py-2.5 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-dc1-text-secondary">Rate</span>
            <span className="text-dc1-amber font-semibold">{halalaPriceToSarHr(llmRate)} SAR/hr</span>
          </div>
          {provider.vram_gb && (
            <div className="flex justify-between">
              <span className="text-dc1-text-secondary">VRAM</span>
              <span className="text-dc1-text-primary">{provider.vram_gb} GB</span>
            </div>
          )}
        </div>

        {/* Duration picker */}
        <div className="mb-4">
          <label className="block text-xs text-dc1-text-muted mb-1.5">Estimated duration</label>
          <div className="flex items-center gap-2">
            {[1, 2, 4, 8].map(h => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`flex-1 py-1.5 rounded text-sm font-medium border transition-colors ${
                  hours === h
                    ? 'bg-dc1-amber text-dc1-void border-dc1-amber'
                    : 'bg-dc1-surface-l2 text-dc1-text-secondary border-dc1-border hover:border-dc1-amber/40'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Estimated cost */}
        <div className="mb-5 rounded-xl border border-dc1-amber/30 bg-dc1-amber/5 px-4 py-3 text-center">
          <p className="text-xs text-dc1-text-muted mb-0.5">Estimated cost for {hours}h</p>
          <p className="text-2xl font-bold text-dc1-amber">{estimatedCost} <span className="text-base font-normal">SAR</span></p>
          <p className="text-[11px] text-dc1-text-muted mt-1">Billed per minute — you only pay for actual runtime</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary text-sm">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:bg-dc1-amber/90 transition-colors"
          >
            Confirm &amp; Deploy
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GPU Card ───────────────────────────────────────────────────────
function GPUCard({
  provider,
  t,
  onCtaClick,
}: {
  provider: Provider
  t: (key: string) => string
  onCtaClick: (payload: { surface: string; destination: string; step: string }) => void
}) {
  const [showDeployModal, setShowDeployModal] = useState(false)
  const llmRate = provider.cost_rates_halala_per_min?.['llm-inference']
    ?? provider.cost_rates_halala_per_min?.llm_inference
    ?? 15
  const imgRate = provider.cost_rates_halala_per_min?.image_generation ?? 20
  const trainRate = provider.cost_rates_halala_per_min?.training ?? 25
  const uptime = provider.uptime_pct ?? provider.uptime_percent ?? 0
  const successRate = provider.job_success_rate ?? 0
  const gpuTier = getGpuTier(provider.gpu_model)

  return (
    <>
    <article
      className="card hover:border-dc1-amber/30 transition-colors flex flex-col"
      aria-label={`${t('marketplace.gpu_count')}: ${provider.gpu_model}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1 mr-2">
          <h3 className="text-base font-semibold text-dc1-text-primary leading-tight truncate">
            {provider.gpu_model || t('marketplace.unknown')}
          </h3>
          <p className="text-xs text-dc1-text-muted mt-0.5 truncate">{provider.name}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`inline-flex text-[10px] font-bold tracking-wide px-2 py-0.5 rounded border ${reputationTierBadgeClass(provider.reputation_tier)}`}>
              {reputationTierLabel(provider.reputation_tier, t)}
            </span>
            <span className={`inline-flex text-[10px] font-bold tracking-wide px-2 py-0.5 rounded border ${gpuTierBadgeClass(gpuTier)}`}>
              Tier {gpuTier}
            </span>
          </div>
        </div>
        <StatusBadge status={getProviderHealthStatus(provider)} size="sm" pulse={true} />
      </div>

      {/* Specs grid */}
      <dl className="space-y-1.5 text-sm text-dc1-text-secondary mb-4 flex-1">
        {provider.vram_gb != null && provider.vram_gb > 0 && (
          <div className="flex justify-between">
            <dt>{t('marketplace.vram_label')}</dt>
            <dd className="text-dc1-text-primary font-medium">{provider.vram_gb} GB</dd>
          </div>
        )}
        {provider.gpu_count > 1 && (
          <div className="flex justify-between">
            <dt>{t('marketplace.gpus_label')}</dt>
            <dd className="text-dc1-text-primary font-medium">{provider.gpu_count}×</dd>
          </div>
        )}
        {provider.compute_capability && (
          <div className="flex justify-between">
            <dt>{t('marketplace.compute')}</dt>
            <dd className="text-dc1-text-primary">{provider.compute_capability}</dd>
          </div>
        )}
        {provider.cuda_version && (
          <div className="flex justify-between">
            <dt>{t('marketplace.cuda')}</dt>
            <dd className="text-dc1-text-primary">{provider.cuda_version}</dd>
          </div>
        )}
        {provider.location && (
          <div className="flex justify-between">
            <dt>{t('marketplace.location')}</dt>
            <dd className="text-dc1-text-primary">{provider.location}</dd>
          </div>
        )}
        {provider.reliability_score != null && provider.reliability_score > 0 && (
          <div className="flex justify-between">
            <dt>{t('marketplace.reliability')}</dt>
            <dd className={`font-medium ${
              provider.reliability_score >= 90
                ? 'text-status-success'
                : provider.reliability_score >= 70
                ? 'text-dc1-amber'
                : 'text-status-error'
            }`}>
              {provider.reliability_score}%
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>{t('marketplace.uptime')}</dt>
          <dd className="text-dc1-text-primary font-medium">{uptime.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.success_rate')}</dt>
          <dd className="text-dc1-text-primary font-medium">{successRate.toFixed(1)}%</dd>
        </div>
        {provider.heartbeat_age_seconds !== null && (
          <div className="flex justify-between">
            <dt>{t('marketplace.last_seen')}</dt>
            <dd className="text-dc1-text-muted text-xs">{formatAge(provider.heartbeat_age_seconds, t)}</dd>
          </div>
        )}
      </dl>

      <div className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-3 py-2 mb-3 space-y-1">
        <p className="text-xs text-dc1-text-secondary">{t(getHeartbeatInterpretationKey(provider.heartbeat_age_seconds))}</p>
        <p className="text-xs text-dc1-text-secondary">{t(getReliabilityInterpretationKey(uptime, successRate))}</p>
      </div>

      {/* Pricing */}
      <div className="bg-dc1-surface-l2 rounded-md p-3 mb-3 space-y-1 text-sm">
        <p className="text-xs text-dc1-text-muted uppercase tracking-wide mb-2 font-semibold">{t('marketplace.pricing')}</p>
        <div className="flex justify-between">
          <span className="text-dc1-text-secondary">{t('marketplace.llm_inference')}</span>
          <span className="text-dc1-amber font-semibold">{halalaPriceToSarHr(llmRate)} {t('marketplace.sar_hr')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dc1-text-secondary">{t('marketplace.image_gen')}</span>
          <span className="text-dc1-amber font-semibold">{halalaPriceToSarHr(imgRate)} {t('marketplace.sar_hr')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dc1-text-secondary">{t('marketplace.training')}</span>
          <span className="text-dc1-amber font-semibold">{halalaPriceToSarHr(trainRate)} {t('marketplace.sar_hr')}</span>
        </div>
      </div>

      {/* Cached models */}
      {provider.cached_models && provider.cached_models.length > 0 && (
        <div className="mb-3 pt-2 border-t border-dc1-border/50">
          <p className="text-xs text-dc1-text-muted mb-1.5">{t('marketplace.cached_models')}</p>
          <div className="flex flex-wrap gap-1">
            {provider.cached_models.slice(0, 4).map((m, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded bg-status-success/10 text-status-success border border-status-success/20"
              >
                {m.split('/').pop()}
              </span>
            ))}
            {provider.cached_models.length > 4 && (
                <span className="text-xs px-2 py-0.5 rounded bg-dc1-surface-l2 text-dc1-text-muted">
                +{provider.cached_models.length - 4} {t('marketplace.more')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex gap-2 mt-auto">
        <Link
          href={`/renter/marketplace/providers/${provider.id}`}
          onClick={() =>
            onCtaClick({
              surface: 'gpu_card',
              destination: `/renter/marketplace/providers/${provider.id}`,
              step: 'view_profile',
            })
          }
          className="btn text-sm flex-1 text-center bg-dc1-surface-l2 text-dc1-text-primary hover:bg-dc1-surface-l3 border border-dc1-border"
        >
          {t('marketplace.view_profile')}
        </Link>
        <button
          onClick={() => {
            onCtaClick({
              surface: 'gpu_card',
              destination: `/renter/playground?provider=${provider.id}&source=renter_marketplace_gpu_card`,
              step: 'rent_now',
            })
            setShowDeployModal(true)
          }}
          className="btn btn-primary text-sm flex-1 text-center"
        >
          {t('marketplace.rent_now')}
        </button>
      </div>
      <p className="text-[11px] text-dc1-text-muted mt-2">{t('marketplace.runtime_settlement_reminder')}</p>
    </article>
    {showDeployModal && (
      <DeployCostModal
        provider={provider}
        t={t}
        onClose={() => setShowDeployModal(false)}
        onConfirm={() => {
          setShowDeployModal(false)
          window.location.href = `/renter/playground?provider=${provider.id}&source=renter_marketplace_gpu_card`
        }}
      />
    )}
    </>
  )
}

function ModelCard({
  model,
  benchmark,
  compared,
  onToggleCompare,
  onCtaClick,
  t,
}: {
  model: ModelRegistryEntry
  benchmark: ModelCardFeedEntry | undefined
  compared: boolean
  onToggleCompare: (modelId: string) => void
  onCtaClick: (payload: { surface: string; destination: string; step: string }) => void
  t: (key: string) => string
}) {
  const meta = splitModelUseCases(model.use_cases)
  const hasArabicSupport = meta.languages.includes('arabic')
  const coldStartMs = benchmark?.metrics?.cold_start_ms ?? null
  const latencyP95 = benchmark?.metrics?.latency_ms?.p95 ?? null
  const mmlu = benchmark?.metrics?.arabic_quality?.arabic_mmlu_score ?? null
  const aqa = benchmark?.metrics?.arabic_quality?.arabicaqa_score ?? null
  const benchmarkSummary = benchmark?.summary?.en

  return (
    <article className="card hover:border-dc1-amber/30 transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-dc1-text-primary">{model.display_name}</h3>
          <p className="text-xs text-dc1-text-muted mt-1">{model.model_id}</p>
        </div>
        <StatusBadge status={model.status === 'available' ? 'online' : 'offline'} size="sm" pulse={model.status === 'available'} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {hasArabicSupport && (
          <span className="inline-flex w-fit text-xs px-2 py-1 rounded border border-dc1-amber/30 bg-dc1-amber/10 text-dc1-amber font-medium">
            {t('marketplace.arabic_support')}
          </span>
        )}
        {meta.languages.map((language) => (
          <span key={language} className="inline-flex w-fit text-xs px-2 py-1 rounded border border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary">
            {prettyTag(language)}
          </span>
        ))}
      </div>

      <dl className="mt-4 space-y-1.5 text-sm text-dc1-text-secondary flex-1">
        <div className="flex justify-between">
          <dt>{t('marketplace.min_vram')}</dt>
          <dd className="text-dc1-text-primary font-medium">{model.min_gpu_vram_gb} GB</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.quantization')}</dt>
          <dd className="text-dc1-text-primary font-medium">{model.quantization}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.context_window')}</dt>
          <dd className="text-dc1-text-primary font-medium">{model.context_window.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.providers_online')}</dt>
          <dd className={`font-medium ${model.providers_online > 0 ? 'text-status-success' : 'text-dc1-text-muted'}`}>
            {model.providers_online}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.avg_price')}</dt>
          <dd className="text-dc1-amber font-semibold">{model.avg_price_sar_per_min.toFixed(3)} {t('marketplace.sar_min')}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('marketplace.cold_start')}</dt>
          <dd className="text-dc1-text-primary font-medium">{formatMilliseconds(coldStartMs)}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-md border border-dc1-border bg-dc1-surface-l2 p-3 text-xs">
        <p className="text-dc1-text-primary font-semibold mb-2">{t('marketplace.benchmark_snapshot')}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-dc1-text-secondary">
          <span>{t('marketplace.p95_latency')}</span>
          <span className="text-dc1-text-primary text-right">{formatMilliseconds(latencyP95)}</span>
          <span>{t('marketplace.arabic_mmlu')}</span>
          <span className="text-dc1-text-primary text-right">{mmlu == null ? '—' : `${mmlu}%`}</span>
          <span>{t('marketplace.arabic_qa')}</span>
          <span className="text-dc1-text-primary text-right">{aqa == null ? '—' : `${aqa}%`}</span>
          <span>{t('marketplace.cost_1k_tokens')}</span>
          <span className="text-dc1-text-primary text-right">
            {benchmark?.metrics?.cost_per_1k_tokens_sar == null ? '—' : `${benchmark.metrics.cost_per_1k_tokens_sar.toFixed(2)} ${t('common.sar')}`}
          </span>
        </div>
        {benchmarkSummary && (
          <p className="mt-2 text-dc1-text-muted leading-relaxed">
            {benchmarkSummary}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-status-success/20 bg-status-success/5 p-3 text-xs">
        <p className="text-status-success font-semibold mb-2">Pricing Advantage</p>
        <div className="space-y-1.5 text-dc1-text-secondary">
          <div className="flex justify-between">
            <span>vs Vast.ai</span>
            <span className="text-status-success font-medium">
              {(() => {
                const comp = calculatePricingComparison(model.avg_price_sar_per_min)
                return comp.vastaiComparison.savingsPercent > 0
                  ? `${comp.vastaiComparison.savingsPercent}% lower`
                  : 'Competitive'
              })()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>vs RunPod</span>
            <span className="text-status-success font-medium">
              {(() => {
                const comp = calculatePricingComparison(model.avg_price_sar_per_min)
                return comp.runpodComparison.savingsPercent > 0
                  ? `${comp.runpodComparison.savingsPercent}% lower`
                  : 'Competitive'
              })()}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 mb-4 flex flex-wrap gap-1">
        {model.use_cases.map(useCase => (
          <span key={useCase} className="text-xs px-2 py-0.5 rounded bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border">
            {useCase}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onToggleCompare(model.model_id)}
        className={`w-full text-sm rounded-md py-2 border transition-colors mb-2 ${
          compared
            ? 'border-dc1-amber/40 bg-dc1-amber/10 text-dc1-amber'
            : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
        }`}
      >
        {compared ? t('marketplace.remove_compare') : t('marketplace.add_compare')}
      </button>

      {model.providers_online > 0 ? (
        <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Link
            href={`/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=llm_inference&source=renter_marketplace_model_card`}
            onClick={() =>
              onCtaClick({
                surface: 'model_card',
                destination: `/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=llm_inference&source=renter_marketplace_model_card`,
                step: 'use_playground',
              })
            }
            className="btn text-center text-sm bg-dc1-surface-l2 text-dc1-text-primary hover:bg-dc1-surface-l3 border border-dc1-border"
          >
            {t('marketplace.use_playground')}
          </Link>
          <Link
            href={`/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=vllm_serve&source=renter_marketplace_model_card`}
            onClick={() =>
              onCtaClick({
                surface: 'model_card',
                destination: `/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=vllm_serve&source=renter_marketplace_model_card`,
                step: 'one_click_deploy',
              })
            }
            className="btn btn-primary text-center text-sm"
          >
            {t('marketplace.one_click_deploy')}
          </Link>
        </div>
      ) : (
        <div className="mt-auto rounded-md border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-muted">
          {t('marketplace.no_providers_for_model')}
        </div>
      )}
    </article>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MarketplacePage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const modelDocsHref = language === 'ar' ? '/docs/ar/models' : '/docs/models'
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
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('gpus')
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<ModelRegistryEntry[]>([])
  const [modelCards, setModelCards] = useState<Record<string, ModelCardFeedEntry>>({})
  const [loading, setLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [renterName, setRenterName] = useState(t('renter.settings.user_name_fallback'))
  const [hasRenterKey, setHasRenterKey] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('reputation')
  const [filters, setFilters] = useState<Filters>({
    minVram: 0,
    maxPriceSar: 50,
    gpuModels: [],
    region: 'All Regions',
  })
  const [modelSearch, setModelSearch] = useState('')
  const [modelTaskFilter, setModelTaskFilter] = useState('all')
  const [modelLanguageFilter, setModelLanguageFilter] = useState('all')
  const [modelMaxVram, setModelMaxVram] = useState(80)
  const [modelMaxPrice, setModelMaxPrice] = useState(10)
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [templateCatalog, setTemplateCatalog] = useState<TemplateCatalogEntry[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState('')
  const countdownRef = useRef<number>(POLL_INTERVAL_MS / 1000)
  const catalogTrackedRef = useRef(false)
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000)
  const segmentProofItems = [
    t('proof.segment.item_energy'),
    t('proof.segment.item_models'),
    t('proof.segment.item_execution'),
  ]
  const pathChooserLanes = [
    {
      key: 'self_serve_renter',
      label: t('path_chooser.self_serve.label'),
      description: t('path_chooser.self_serve.desc'),
      href: '/renter/register?source=renter_marketplace_path_chooser&lane=self_serve_renter',
    },
    {
      key: 'provider_onboarding',
      label: t('path_chooser.provider.label'),
      description: t('path_chooser.provider.desc'),
      href: '/setup?source=renter_marketplace_path_chooser&lane=provider_onboarding',
    },
    {
      key: 'enterprise_intake',
      label: t('path_chooser.enterprise.label'),
      description: t('path_chooser.enterprise.desc'),
      href: '/support?category=enterprise&source=renter_marketplace_path_chooser&lane=enterprise_intake#contact-form',
    },
    {
      key: 'arabic_model_docs',
      label: t('path_chooser.arabic.label'),
      description: t('path_chooser.arabic.desc'),
      href: '/docs?source=renter_marketplace_path_chooser&lane=arabic_model_docs',
    },
  ]

  const trackMarketplaceEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = {
      event,
      source_page: 'renter_marketplace',
      role_intent: 'renter',
      surface: 'marketplace',
      destination: 'none',
      step: 'view',
      ...payload,
    }
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
    const win = window as typeof window & {
      dataLayer?: Array<Record<string, unknown>>
      gtag?: (...args: unknown[]) => void
    }
    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(detail)
    }
    if (typeof win.gtag === 'function') {
      win.gtag('event', event, detail)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/providers/available`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers || [])
        setLastUpdated(new Date())
      }
    } catch (err) {
      console.error('Failed to load providers:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, cardsRes] = await Promise.all([
        fetch(`${API_BASE}/models`),
        fetch(`${API_BASE}/models/cards`),
      ])

      if (modelsRes.ok) {
        const data = await modelsRes.json()
        setModels(Array.isArray(data) ? data : [])
      }

      if (cardsRes.ok) {
        const cardsPayload = await cardsRes.json()
        const nextCards: Record<string, ModelCardFeedEntry> = {}
        for (const card of Array.isArray(cardsPayload?.cards) ? cardsPayload.cards : []) {
          if (card?.model_id) nextCards[card.model_id] = card
        }
        setModelCards(nextCards)
      }
    } catch (err) {
      console.error('Failed to load model registry:', err)
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const fetchTemplateCatalog = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplatesError('')
    try {
      const res = await fetch(`${API_BASE}/templates/catalog`)
      if (!res.ok) {
        throw new Error(`catalog_http_${res.status}`)
      }
      const payload = await res.json()
      const list = Array.isArray(payload?.templates) ? payload.templates : []
      const normalized = list
        .map((raw: Record<string, unknown>): TemplateCatalogEntry => {
          const startupTierRaw = raw?.tier_hint && typeof raw.tier_hint === 'object'
            ? (raw.tier_hint as Record<string, unknown>).tier
            : raw.startup_tier
          const startupSecondsRaw = raw?.tier_hint && typeof raw.tier_hint === 'object'
            ? (raw.tier_hint as Record<string, unknown>).startup_seconds
            : raw.startup_seconds
          const p95Raw = raw?.metrics && typeof raw.metrics === 'object'
            ? ((raw.metrics as Record<string, unknown>).latency_ms as Record<string, unknown> | undefined)?.p95
            : null
          return {
            id: String(raw.id || raw.template_id || ''),
            name: String(raw.name || raw.display_name || raw.model_name || raw.id || 'Template'),
            model_name: String(raw.model_name || raw.model || raw.id || ''),
            description: String(raw.description || ''),
            startup_tier: String(startupTierRaw || 'standard'),
            startup_seconds: Number.isFinite(Number(startupSecondsRaw)) ? Number(startupSecondsRaw) : null,
            p95_latency_ms: Number.isFinite(Number(p95Raw)) ? Number(p95Raw) : null,
          }
        })
        .filter((entry: TemplateCatalogEntry) => Boolean(entry.id))
      setTemplateCatalog(normalized)
    } catch (err) {
      console.error('Failed to load template catalog:', err)
      setTemplateCatalog([])
      setTemplatesError('template_catalog_failed')
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  // Auth — get renter name
  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (key) {
      setHasRenterKey(true)
      fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.renter?.name) setRenterName(d.renter.name) })
        .catch(() => {})
    } else {
      setHasRenterKey(false)
    }
  }, [])

  // Poll every 30s + countdown ticker
  useEffect(() => {
    fetchProviders()
    fetchModels()
    fetchTemplateCatalog()

    const pollInterval = setInterval(() => {
      fetchProviders()
      fetchModels()
      fetchTemplateCatalog()
      countdownRef.current = POLL_INTERVAL_MS / 1000
    }, POLL_INTERVAL_MS)

    const tickInterval = setInterval(() => {
      countdownRef.current = Math.max(0, countdownRef.current - 1)
      setCountdown(countdownRef.current)
    }, 1000)

    return () => {
      clearInterval(pollInterval)
      clearInterval(tickInterval)
    }
  }, [fetchProviders, fetchModels, fetchTemplateCatalog])

  // ── Filter + Sort ────────────────────────────────────────────────
  const filtered = providers.filter(p => {
    const vramOk = filters.minVram === 0 || (p.vram_gb ?? 0) >= filters.minVram
    const priceSarHr = getDefaultRateSarHr(p.cost_rates_halala_per_min)
    const priceOk = filters.maxPriceSar >= 50 || priceSarHr <= filters.maxPriceSar
    const modelOk = matchesGpuModelFilter(p.gpu_model ?? '', filters.gpuModels)
    const regionOk = matchesRegion(p.location, filters.region)
    return vramOk && priceOk && modelOk && regionOk
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'reputation') {
      const tierDelta = reputationTierRank(b.reputation_tier) - reputationTierRank(a.reputation_tier)
      if (tierDelta !== 0) return tierDelta
      if (a.is_live !== b.is_live) return a.is_live ? -1 : 1
      return (b.reputation_score ?? 0) - (a.reputation_score ?? 0)
    }
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
  const hasLiveFlag = providers.some((p) => typeof p.is_live === 'boolean')
  const reliabilityProviderCount = hasLiveFlag ? onlineCount : providers.length
  const reliabilityGpuFamilyCoverage = new Set(
    providers
      .map((p) => extractGpuFamily(p.gpu_model))
      .filter((family) => family !== 'Unknown')
  ).size

  const taskTypeOptions = Array.from(new Set(models.flatMap(model => splitModelUseCases(model.use_cases).taskTypes))).sort((a, b) => a.localeCompare(b))
  const languageOptions = Array.from(new Set(models.flatMap(model => splitModelUseCases(model.use_cases).languages))).sort((a, b) => a.localeCompare(b))

  const filteredModels = models.filter((model) => {
    const query = modelSearch.trim().toLowerCase()
    const meta = splitModelUseCases(model.use_cases)
    const modelText = `${model.display_name} ${model.model_id} ${model.family}`.toLowerCase()
    const queryOk = !query || modelText.includes(query)
    const taskOk = modelTaskFilter === 'all' || meta.taskTypes.includes(modelTaskFilter)
    const languageOk = modelLanguageFilter === 'all' || meta.languages.includes(modelLanguageFilter)
    const vramOk = model.min_gpu_vram_gb <= modelMaxVram
    const priceOk = model.avg_price_sar_per_min <= modelMaxPrice
    return queryOk && taskOk && languageOk && vramOk && priceOk
  })

  const comparedModels = compareModelIds
    .map((modelId) => filteredModels.find((m) => m.model_id === modelId) || models.find((m) => m.model_id === modelId))
    .filter((model): model is ModelRegistryEntry => Boolean(model))

  function toggleCompareModel(modelId: string) {
    setCompareModelIds((prev) => {
      if (prev.includes(modelId)) return prev.filter((id) => id !== modelId)
      if (prev.length >= 4) return prev
      return [...prev, modelId]
    })
  }

  const featuredTemplateCards = useMemo(() => {
    const priority = ['allam', 'jais', 'falcon']
    const selected: TemplateCatalogEntry[] = []
    for (const key of priority) {
      const match = templateCatalog.find((item) => {
        const hay = `${item.id} ${item.name} ${item.model_name}`.toLowerCase()
        return hay.includes(key)
      })
      if (match && !selected.some((existing) => existing.id === match.id)) {
        selected.push(match)
      }
    }
    if (selected.length < 3) {
      for (const item of templateCatalog) {
        if (selected.some((existing) => existing.id === item.id)) continue
        selected.push(item)
        if (selected.length >= 3) break
      }
    }
    return selected.slice(0, 3)
  }, [templateCatalog])

  useEffect(() => {
    if (catalogTrackedRef.current) return
    if (templatesLoading || featuredTemplateCards.length === 0) return
    trackMarketplaceEvent('catalog_view', {
      surface: 'template_catalog',
      destination: '/renter/marketplace',
      step: 'loaded',
      template_count: featuredTemplateCards.length,
      template_ids: featuredTemplateCards.map((item) => item.id).join(','),
    })
    catalogTrackedRef.current = true
  }, [featuredTemplateCards, templatesLoading, trackMarketplaceEvent])

  const handleTemplateDeploy = useCallback((template: TemplateCatalogEntry) => {
    trackMarketplaceEvent('template_select', {
      surface: 'template_catalog',
      destination: '/renter/marketplace',
      step: 'selected',
      template_id: template.id,
    })
    const model = template.model_name || template.id
    const intent: RenterAuthIntent = {
      template: template.id,
      model,
      mode: 'llm_inference',
      jobType: 'llm_inference',
      source: 'renter_marketplace_template_catalog',
    }
    const deployPath = buildRenterPlaygroundPath(intent)
    trackMarketplaceEvent('deploy_click', {
      surface: 'template_catalog',
      destination: deployPath,
      step: 'one_click_deploy',
      template_id: template.id,
    })
    const renterKey = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key')
    if (!renterKey) {
      setPendingRenterAuthIntent(intent)
      router.push(buildRenterLoginRedirect('/renter/playground', 'renter_marketplace_template_catalog'))
      return
    }
    router.push(deployPath)
  }, [router, trackMarketplaceEvent])

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterName}>
      <div className="space-y-5">
        {/* ── Page Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">{t('marketplace.title')}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {activeTab === 'gpus' ? (
                <span className="text-sm text-dc1-text-secondary">
                  <span className="text-status-success font-semibold">{onlineCount}</span> {t('marketplace.online')}
                  {' · '}
                  <span className="text-dc1-text-muted">{providers.length} {t('marketplace.total')}</span>
                </span>
              ) : (
                <span className="text-sm text-dc1-text-secondary">
                  <span className="text-status-success font-semibold">{filteredModels.filter(m => m.status === 'available').length}</span> {t('marketplace.available')}
                  {' · '}
                  <span className="text-dc1-text-muted">{filteredModels.length}/{models.length} {t('marketplace.models_tab')}</span>
                </span>
              )}
              {lastUpdated && (
                <span className="text-xs text-dc1-text-muted flex items-center gap-1">
                  <RefreshIcon />
                  {t('marketplace.updated')} {formatLastUpdated(lastUpdated)}
                  {countdown > 0 && <span className="ml-1">({t('marketplace.next_in')} {countdown}s)</span>}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${activeTab === 'gpus' ? 'border-dc1-amber/40 bg-dc1-amber/10 text-dc1-amber' : 'border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary'}`}
              onClick={() => setActiveTab('gpus')}
            >
              {t('marketplace.gpu_count')}
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${activeTab === 'models' ? 'border-dc1-amber/40 bg-dc1-amber/10 text-dc1-amber' : 'border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary'}`}
              onClick={() => setActiveTab('models')}
            >
              {t('marketplace.models_tab')}
            </button>
            <Link
              href="/renter/marketplace/templates"
              className="px-3 py-1.5 rounded-lg text-sm border border-dc1-border text-dc1-text-secondary hover:text-dc1-amber hover:border-dc1-amber/40 transition-colors flex items-center gap-1"
            >
              🗂️ Templates
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'gpus' && (
              <>
                {/* Mobile filter toggle */}
                <button
                  className="btn btn-outline text-sm flex items-center gap-1.5 sm:hidden"
                  onClick={() => setFiltersOpen(prev => !prev)}
                  aria-expanded={filtersOpen}
                  aria-controls="filter-panel"
                >
                  <FilterIcon />
                  {t('marketplace.filters_title')}
                  {(filters.gpuModels.length > 0 || filters.minVram > 0 || filters.maxPriceSar < 50 || filters.region !== 'All Regions') && (
                    <span className="ml-1 bg-dc1-amber text-dc1-void text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      !
                    </span>
                  )}
                </button>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                  className="input text-sm"
                  aria-label={t('marketplace.sort_gpus')}
                >
                  <option value="reputation">{t('marketplace.sort_reputation')}</option>
                  <option value="availability">{t('marketplace.sort_online')}</option>
                  <option value="price-asc">{t('marketplace.sort_price')}</option>
                  <option value="vram-desc">{t('marketplace.sort_vram')}</option>
                </select>
              </>
            )}
            {activeTab === 'models' && compareModelIds.length > 0 && (
              <button
                type="button"
                onClick={() => setCompareModelIds([])}
                className="px-3 py-1.5 rounded-lg text-sm border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
              >
                {t('marketplace.clear_compare')} ({compareModelIds.length})
              </button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l2/80 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
            {t('marketplace.reliability_strip_label')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-dc1-text-secondary">
            <p>
              <span className="text-dc1-text-primary font-semibold">{reliabilityProviderCount}</span> {t('marketplace.reliability_live_providers')}
            </p>
            <p>
              <span className="text-dc1-text-primary font-semibold">{reliabilityGpuFamilyCoverage}</span> {t('marketplace.reliability_gpu_families')}
            </p>
            <p>
              <span className="text-dc1-text-primary font-semibold">
                {lastUpdated ? formatReliabilityTimestamp(lastUpdated) : t('marketplace.reliability_unavailable')}
              </span>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l2/60 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
            Quick intent actions
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('models')
                setModelLanguageFilter('arabic')
                trackMarketplaceEvent('marketplace_quick_intent_clicked', {
                  surface: 'quick_intent_chips',
                  destination: '/renter/marketplace#models',
                  step: 'arabic_model_ready',
                  intent: 'arabic_model_ready',
                })
              }}
              className="rounded-full border border-dc1-amber/40 bg-dc1-amber/10 px-3 py-1.5 text-xs font-semibold text-dc1-amber hover:bg-dc1-amber/20 transition-colors"
            >
              Arabic model ready
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('models')
                setModelTaskFilter('inference')
                trackMarketplaceEvent('marketplace_quick_intent_clicked', {
                  surface: 'quick_intent_chips',
                  destination: '/renter/marketplace#models',
                  step: 'inference',
                  intent: 'inference',
                })
              }}
              className="rounded-full border border-dc1-border bg-dc1-surface-l1 px-3 py-1.5 text-xs font-semibold text-dc1-text-primary hover:border-dc1-amber transition-colors"
            >
              Inference
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('models')
                setModelTaskFilter('training')
                trackMarketplaceEvent('marketplace_quick_intent_clicked', {
                  surface: 'quick_intent_chips',
                  destination: '/renter/marketplace#models',
                  step: 'training',
                  intent: 'training',
                })
              }}
              className="rounded-full border border-dc1-border bg-dc1-surface-l1 px-3 py-1.5 text-xs font-semibold text-dc1-text-primary hover:border-dc1-amber transition-colors"
            >
              Training
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('gpus')
                setSortBy('price-asc')
                trackMarketplaceEvent('marketplace_quick_intent_clicked', {
                  surface: 'quick_intent_chips',
                  destination: '/renter/marketplace#gpus',
                  step: 'lowest_sar_hr',
                  intent: 'lowest_sar_hr',
                })
              }}
              className="rounded-full border border-dc1-border bg-dc1-surface-l1 px-3 py-1.5 text-xs font-semibold text-dc1-text-primary hover:border-dc1-amber transition-colors"
            >
              Lowest SAR/hr
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-dc1-amber/30 bg-dc1-surface-l2/70 px-4 py-4">
          <h2 className="text-sm font-semibold text-dc1-text-primary">Start here</h2>
          <p className="mt-1 text-sm text-dc1-text-secondary">
            {hasRenterKey
              ? 'You are signed in. Pick a provider, then launch your first run in Playground.'
              : 'Sign in with your renter key first, then return to launch your first workload.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasRenterKey ? (
              <>
                <Link
                  href="/renter/playground?starter=1&source=renter_marketplace_start_here"
                  onClick={() =>
                    trackMarketplaceEvent('marketplace_start_here_clicked', {
                      surface: 'start_here_panel',
                      destination: '/renter/playground?starter=1&source=renter_marketplace_start_here',
                      step: 'launch_first_run',
                      auth_state: 'signed_in',
                    })
                  }
                  className="btn btn-primary btn-sm"
                >
                  Launch first run
                </Link>
                <Link
                  href="/renter/playground?source=renter_marketplace_start_here&entry=cta_open_submit"
                  onClick={() =>
                    trackMarketplaceEvent('marketplace_start_here_clicked', {
                      surface: 'start_here_panel',
                      destination: '/renter/playground?source=renter_marketplace_start_here&entry=cta_open_submit',
                      step: 'open_playground',
                      auth_state: 'signed_in',
                    })
                  }
                  className="btn btn-secondary btn-sm"
                >
                  Open renter playground
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login?role=renter&source=renter_marketplace_start_here"
                  onClick={() =>
                    trackMarketplaceEvent('marketplace_start_here_clicked', {
                      surface: 'start_here_panel',
                      destination: '/login?role=renter&source=renter_marketplace_start_here',
                      step: 'open_login',
                      auth_state: 'signed_out',
                    })
                  }
                  className="btn btn-primary btn-sm"
                >
                  Sign in with renter key
                </Link>
                <Link
                  href="/renter/register?source=renter_marketplace_start_here"
                  onClick={() =>
                    trackMarketplaceEvent('marketplace_start_here_clicked', {
                      surface: 'start_here_panel',
                      destination: '/renter/register?source=renter_marketplace_start_here',
                      step: 'open_register',
                      auth_state: 'signed_out',
                    })
                  }
                  className="btn btn-secondary btn-sm"
                >
                  Create renter account
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l2/60 px-4 py-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-dc1-text-secondary">
            <p>
              <span className="text-dc1-text-primary font-semibold">{t('marketplace.filter_gpu_model')}</span>
              {' + '}
              <span className="text-dc1-text-primary font-semibold">{t('marketplace.filter_min_vram')}</span>
              {' + '}
              <span className="text-dc1-text-primary font-semibold">{t('marketplace.task_type')}</span>
            </p>
            <p>
              <span className="text-dc1-text-primary font-semibold">{t('marketplace.last_seen')}</span>
              {' '}
              {lastUpdated ? formatReliabilityTimestamp(lastUpdated) : t('marketplace.reliability_unavailable')}
            </p>
            <p>
              <Link
                href="/renter/playground?starter=1"
                onClick={() =>
                  trackMarketplaceEvent('marketplace_use_playground_clicked', {
                    surface: 'reliability_strip',
                    destination: '/renter/playground?starter=1',
                    step: 'open_playground',
                  })
                }
                className="text-dc1-amber hover:underline"
              >
                {t('marketplace.use_playground')}
              </Link>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l2/60 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-1">
            {t('path_chooser.title')}
          </p>
          <p className="text-xs text-dc1-text-secondary mb-3">{t('path_chooser.subtitle')}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {pathChooserLanes.map((lane) => (
              <Link key={lane.key} href={lane.href} className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 transition-colors hover:border-dc1-amber">
                <p className="text-sm font-semibold text-dc1-text-primary">{lane.label}</p>
                <p className="mt-1 text-xs text-dc1-text-secondary">{lane.description}</p>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l2/70 px-4 py-4">
          <h2 className="text-sm font-semibold text-dc1-text-primary">{t('marketplace.arabic_bridge.title')}</h2>
          <p className="mt-1 text-sm text-dc1-text-secondary">{t('marketplace.arabic_bridge.subtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={modelDocsHref}
              onClick={() =>
                trackMarketplaceEvent('marketplace_arabic_model_docs_clicked', {
                  surface: 'trust_strip',
                  destination: modelDocsHref,
                  step: 'open_model_library',
                })
              }
              className="btn btn-secondary btn-sm"
            >
              {t('marketplace.arabic_bridge.docs_cta')}
            </Link>
            <button
              type="button"
              onClick={() => {
                setActiveTab('models')
                trackMarketplaceEvent('marketplace_arabic_model_catalog_clicked', {
                  surface: 'trust_strip',
                  destination: '/renter/marketplace#models',
                  step: 'open_model_catalog',
                })
              }}
              className="btn btn-secondary btn-sm"
            >
              {t('marketplace.arabic_bridge.models_cta')}
            </button>
          </div>
          <p className="mt-2 text-xs text-dc1-text-muted">{t('marketplace.arabic_bridge.note')}</p>
        </div>
        <div className="rounded-xl border border-dc1-amber/30 bg-dc1-amber/10 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">
            {t('proof.segment.title')}
          </p>
          <ul className="list-disc ps-5 space-y-1 text-sm text-dc1-text-secondary">
            {segmentProofItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {/* ── Layout: sidebar + cards ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Filter sidebar — desktop: always visible, mobile: toggle */}
          {activeTab === 'gpus' && (
            <div
              id="filter-panel"
              className={`
                w-full sm:w-56 sm:flex-shrink-0
                sm:block
                ${filtersOpen ? 'block' : 'hidden'}
                card p-4
              `}
            >
              <FilterSidebar
                filters={filters}
                onChange={setFilters}
                matchCount={filtered.length}
                t={t}
              />
            </div>
          )}

          {/* GPU cards / model cards */}
          <div className="flex-1 min-w-0">
            {activeTab === 'models' && (
              <section className="card mb-4">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <h2 className="text-sm font-semibold text-dc1-text-primary">
                      {language === 'ar' ? 'قوالب الاستدلال الجاهزة' : 'Inference Template Catalog'}
                    </h2>
                    <p className="text-xs text-dc1-text-muted">
                      {language === 'ar'
                        ? 'نشر سريع لنماذج ALLaM وJAIS وFalcon مع بيانات الطبقة وزمن الإقلاع.'
                        : 'One-click launcher for ALLaM, JAIS, and Falcon templates with startup tier and latency metadata.'}
                    </p>
                  </div>
                  <Link
                    href="/renter/marketplace/templates"
                    className="text-xs text-dc1-amber hover:underline"
                  >
                    {language === 'ar' ? 'عرض كل القوالب' : 'View full template catalog'}
                  </Link>
                </div>
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-dc1-amber border-t-transparent rounded-full" />
                  </div>
                ) : templatesError ? (
                  <p className="text-sm text-status-error">
                    {language === 'ar' ? 'تعذر تحميل القوالب حالياً.' : 'Failed to load template catalog right now.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {featuredTemplateCards.map((template) => (
                      <article key={template.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-3 flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-dc1-text-primary">{template.name}</h3>
                        <p className="text-[11px] text-dc1-text-muted font-mono break-all">{template.model_name}</p>
                        {template.description && (
                          <p className="text-xs text-dc1-text-secondary line-clamp-2">{template.description}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5">
                            <p className="text-dc1-text-muted">Tier</p>
                            <p className="text-dc1-text-primary font-semibold capitalize">{template.startup_tier}</p>
                          </div>
                          <div className="rounded border border-dc1-border bg-dc1-surface-l2 px-2 py-1.5">
                            <p className="text-dc1-text-muted">P95 latency</p>
                            <p className="text-dc1-text-primary font-semibold">
                              {template.p95_latency_ms != null ? formatMilliseconds(template.p95_latency_ms) : '—'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-dc1-text-muted">
                          {language === 'ar' ? 'زمن الإقلاع:' : 'Startup:'}{' '}
                          {template.startup_seconds != null ? `${template.startup_seconds}s` : '—'}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTemplateDeploy(template)}
                          className="btn btn-primary btn-sm mt-1"
                        >
                          {language === 'ar' ? 'نشر الآن' : 'Deploy now'}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'models' && (
              <div className="card mb-4">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1.5">{t('marketplace.search_model')}</label>
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={t('marketplace.search_model_placeholder')}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1.5">{t('marketplace.task_type')}</label>
                    <select
                      value={modelTaskFilter}
                      onChange={(e) => setModelTaskFilter(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="all">{t('marketplace.all_tasks')}</option>
                      {taskTypeOptions.map((taskType) => (
                        <option key={taskType} value={taskType}>{prettyTag(taskType)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1.5">{t('marketplace.language')}</label>
                    <select
                      value={modelLanguageFilter}
                      onChange={(e) => setModelLanguageFilter(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="all">{t('marketplace.all_languages')}</option>
                      {languageOptions.map((language) => (
                        <option key={language} value={language}>{prettyTag(language)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1.5">
                      {t('marketplace.max_vram_requirement')}
                    </label>
                    <div className="input text-sm flex items-center justify-between gap-3">
                      <span>{modelMaxVram} GB</span>
                      <input
                        type="range"
                        min={4}
                        max={80}
                        step={4}
                        value={modelMaxVram}
                        onChange={(e) => setModelMaxVram(Number(e.target.value))}
                        className="w-28 accent-dc1-amber"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1.5">
                      {t('marketplace.max_price')}
                    </label>
                    <div className="input text-sm flex items-center justify-between gap-3">
                      <span>{modelMaxPrice.toFixed(2)} {t('marketplace.sar_min')}</span>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={0.25}
                        value={modelMaxPrice}
                        onChange={(e) => setModelMaxPrice(Number(e.target.value))}
                        className="w-48 accent-dc1-amber"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-dc1-text-muted">
                    {filteredModels.length} {filteredModels.length === 1 ? t('marketplace.matching_model_singular') : t('marketplace.matching_model_plural')}
                    {' · '}
                    {comparedModels.length} {t('marketplace.selected_compare')}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'models' && comparedModels.length >= 2 && (
              <div className="card mb-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-dc1-text-primary mb-3">{t('marketplace.model_comparison')}</h3>
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="border-b border-dc1-border">
                      <th className="text-left py-2 pr-3 text-dc1-text-muted">{t('marketplace.metric')}</th>
                      {comparedModels.map((model) => (
                        <th key={model.model_id} className="text-left py-2 px-3 text-dc1-text-primary font-semibold">
                          {model.display_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dc1-border">
                    {[
                      { label: t('marketplace.task_type'), value: (model: ModelRegistryEntry) => splitModelUseCases(model.use_cases).taskTypes.map(prettyTag).join(', ') || t('marketplace.general') },
                      { label: t('marketplace.language'), value: (model: ModelRegistryEntry) => splitModelUseCases(model.use_cases).languages.map(prettyTag).join(', ') },
                      { label: t('marketplace.min_vram'), value: (model: ModelRegistryEntry) => `${model.min_gpu_vram_gb} GB` },
                      { label: t('marketplace.avg_price'), value: (model: ModelRegistryEntry) => `${model.avg_price_sar_per_min.toFixed(2)} ${t('marketplace.sar_min')}` },
                      { label: t('marketplace.providers_online'), value: (model: ModelRegistryEntry) => String(model.providers_online) },
                      { label: t('marketplace.p95_latency'), value: (model: ModelRegistryEntry) => formatMilliseconds(modelCards[model.model_id]?.metrics?.latency_ms?.p95 ?? null) },
                      { label: t('marketplace.cold_start'), value: (model: ModelRegistryEntry) => formatMilliseconds(modelCards[model.model_id]?.metrics?.cold_start_ms ?? null) },
                      { label: t('marketplace.arabic_mmlu'), value: (model: ModelRegistryEntry) => {
                        const score = modelCards[model.model_id]?.metrics?.arabic_quality?.arabic_mmlu_score
                        return score == null ? '—' : `${score}%`
                      } },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td className="py-2 pr-3 text-dc1-text-muted">{row.label}</td>
                        {comparedModels.map((model) => (
                          <td key={model.model_id} className="py-2 px-3 text-dc1-text-primary">
                            {row.value(model)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 pr-3 text-dc1-text-muted">{t('marketplace.actions')}</td>
                      {comparedModels.map((model) => (
                        <td key={model.model_id} className="py-2 px-3">
                          <div className="flex gap-2">
                            <Link
                              href={`/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=llm_inference&source=renter_marketplace_compare`}
                              className="px-2.5 py-1 text-xs rounded border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary"
                            >
                              {t('nav.playground')}
                            </Link>
                            <Link
                              href={`/renter/playground?model=${encodeURIComponent(model.model_id)}&mode=vllm_serve&source=renter_marketplace_compare`}
                              className="px-2.5 py-1 text-xs rounded bg-dc1-amber text-dc1-void font-medium"
                            >
                              {t('marketplace.deploy')}
                            </Link>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'gpus' && loading ? (
              <div className="flex items-center justify-center py-20">
                <div
                  className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full"
                  aria-label={t('marketplace.loading_gpus')}
                  role="status"
                />
              </div>
            ) : activeTab === 'gpus' && sorted.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-dc1-text-secondary mb-2">
                  {providers.length === 0
                    ? t('marketplace.no_gpus_online')
                    : t('marketplace.no_match')}
                </p>
                <p className="text-sm text-dc1-text-muted">
                  {providers.length === 0
                    ? t('marketplace.check_back')
                    : t('marketplace.try_relax_filters')}
                </p>
              </div>
            ) : activeTab === 'gpus' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sorted.map(p => (
                  <GPUCard
                    key={p.id}
                    provider={p}
                    t={t}
                    onCtaClick={({ surface, destination, step }) =>
                      trackMarketplaceEvent('marketplace_gpu_cta_clicked', {
                        surface,
                        destination,
                        step,
                      })
                    }
                  />
                ))}
              </div>
            ) : modelsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div
                  className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full"
                  aria-label={t('marketplace.loading_models')}
                  role="status"
                />
              </div>
            ) : models.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-dc1-text-secondary mb-2">{t('marketplace.no_providers_for_model')}</p>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-dc1-text-secondary mb-2">{t('marketplace.no_models_match')}</p>
                <p className="text-sm text-dc1-text-muted">{t('marketplace.broaden_filters')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredModels.map(model => (
                  <ModelCard
                    key={model.model_id}
                    model={model}
                    benchmark={modelCards[model.model_id]}
                    compared={compareModelIds.includes(model.model_id)}
                    onToggleCompare={toggleCompareModel}
                    onCtaClick={({ surface, destination, step }) =>
                      trackMarketplaceEvent('marketplace_model_cta_clicked', {
                        surface,
                        destination,
                        step,
                        model_id: model.model_id,
                      })
                    }
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
