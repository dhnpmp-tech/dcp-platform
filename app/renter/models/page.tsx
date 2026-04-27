'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api/dc1'

// ── Nav icon components ───────────────────────────────────────────────────────
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
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
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
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

// ── Types ─────────────────────────────────────────────────────────────────────
interface ModelListItem {
  model_id: string
  display_name: string
  family?: string
  vram_gb?: number
  min_gpu_vram_gb?: number
  quantization?: string
  context_window?: number
  use_cases?: string[]
  providers_online?: number
  avg_price_sar_per_min?: number
  avg_price_sar_per_hr?: number
  savings_pct?: number
  competitor_price_sar_hr?: number
  competitor_label?: string
  status?: string
  tier?: string | null
  prewarm_class?: string | null
  template_id?: string | null
  arabic_capability?: boolean   // authoritative Arabic flag from DCP-950
  arabic?: boolean              // alias returned by GET /api/models
}

interface DeployState {
  model: ModelListItem | null
  loading: boolean
  error: string
  jobId: string | null
}

type TaskFilter = 'all' | 'chat' | 'embedding' | 'reranking' | 'image'

// ── Pricing comparison (DCP vs Vast.ai, SAR/hr) ───────────────────────────────
// RTX 4090: DCP 1.00 vs Vast.ai 1.31 (24% savings)
// Reference: FOUNDER-STRATEGIC-BRIEF.md — buyer economics table
const VAST_AI_SAR_PER_HR_FALLBACK = 1.31  // RTX 4090 baseline; shown when API has no competitor data

// ── Helpers ───────────────────────────────────────────────────────────────────
function isArabicModel(model: ModelListItem): boolean {
  // Prefer authoritative backend flag (added in DCP-950)
  if (model.arabic_capability != null) return model.arabic_capability
  if (model.arabic != null) return model.arabic
  // Client-side fallback for older API responses
  const id = model.model_id?.toLowerCase() ?? ''
  const family = model.family?.toLowerCase() ?? ''
  return (
    id.includes('allam') || id.includes('jais') || id.includes('arabic') ||
    id.includes('falcon-h1') || id.includes('falcon_h1') ||
    family.includes('arabic') || family.includes('allam') || family.includes('jais') ||
    (model.use_cases ?? []).some(u => u.toLowerCase().includes('arabic'))
  )
}

function getTaskType(model: ModelListItem): string {
  const id = model.model_id?.toLowerCase() ?? ''
  const uses = (model.use_cases ?? []).map(u => u.toLowerCase())
  if (id.includes('embed') || uses.some(u => u.includes('embed'))) return 'embedding'
  if (id.includes('rerank') || uses.some(u => u.includes('rerank'))) return 'reranking'
  if (id.includes('sdxl') || id.includes('stable-diff') || uses.some(u => u.includes('image'))) return 'image'
  return 'chat'
}

function getPriceHr(model: ModelListItem): number | null {
  if (model.avg_price_sar_per_hr) return model.avg_price_sar_per_hr
  if (model.avg_price_sar_per_min) return model.avg_price_sar_per_min * 60
  return null
}

function getSavingsPct(model: ModelListItem): number | null {
  const dcp = getPriceHr(model)
  if (!dcp) return null
  if (model.savings_pct) return Math.round(model.savings_pct)
  if (model.competitor_price_sar_hr) {
    return Math.round((1 - dcp / model.competitor_price_sar_hr) * 100)
  }
  // Fallback: use Vast.ai RTX 4090 baseline
  if (dcp < VAST_AI_SAR_PER_HR_FALLBACK) {
    return Math.round((1 - dcp / VAST_AI_SAR_PER_HR_FALLBACK) * 100)
  }
  return null
}

function getTierBadge(tier?: string | null) {
  if (tier === 'tier_a') return { label: '⭐ Tier A', cls: 'bg-dc1-amber/10 text-dc1-amber border-dc1-amber/30' }
  if (tier === 'tier_b') return { label: '✦ Tier B', cls: 'bg-status-info/10 text-status-info border-status-info/30' }
  return null
}

function getPrewarmBadge(prewarm?: string | null) {
  if (prewarm === 'hot') return { label: '🔥 Hot', cls: 'bg-status-error/10 text-status-error border-status-error/20' }
  if (prewarm === 'warm') return { label: '♨ Warm', cls: 'bg-dc1-amber/10 text-dc1-amber border-dc1-amber/20' }
  return null
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="h-5 bg-dc1-surface-l3 rounded w-3/4" />
      <div className="h-3 bg-dc1-surface-l3 rounded w-1/2" />
      <div className="flex gap-2">
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-16" />
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-12" />
      </div>
      <div className="h-20 bg-dc1-surface-l3 rounded-lg" />
      <div className="h-9 bg-dc1-surface-l3 rounded-md" />
    </div>
  )
}

// ── Deploy Modal ──────────────────────────────────────────────────────────────
function DeployModal({ deploy, onClose, onConfirm, registeredProviderCount }: {
  deploy: DeployState
  onClose: () => void
  onConfirm: () => void
  registeredProviderCount: number | null
}) {
  const router = useRouter()
  const model = deploy.model!
  const priceHr = getPriceHr(model)
  const savingsPct = getSavingsPct(model)
  const competitorLabel = model.competitor_label ?? 'Vast.ai'
  const arabic = isArabicModel(model)
  const isNoProvider = deploy.error.toLowerCase().includes('no provider') || deploy.error.toLowerCase().includes('no available provider')
  const isInsufficientBalance = deploy.error.toLowerCase().includes('insufficient balance')

  useEffect(() => {
    if (!deploy.jobId || deploy.jobId === 'submitted') return
    const timer = setTimeout(() => router.push(`/renter/jobs/${deploy.jobId}`), 1200)
    return () => clearTimeout(timer)
  }, [deploy.jobId, router])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deploy-modal-title"
    >
      <div className="card w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="deploy-modal-title" className="text-lg font-bold text-dc1-text-primary">
              Deploy {model.display_name}
            </h2>
            <p className="text-xs text-dc1-text-muted font-mono mt-0.5">{model.model_id}</p>
          </div>
          <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Model specs summary */}
        <div className="bg-dc1-surface-l2 rounded-lg px-4 py-3 text-xs grid grid-cols-2 gap-2">
          {(model.min_gpu_vram_gb ?? model.vram_gb) && (
            <div>
              <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">VRAM Required</p>
              <p className="font-semibold text-dc1-text-primary">{model.min_gpu_vram_gb ?? model.vram_gb} GB</p>
            </div>
          )}
          {priceHr !== null && (
            <div>
              <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">Estimated Rate</p>
              <p className="font-bold text-dc1-amber">{priceHr.toFixed(2)} SAR/hr</p>
            </div>
          )}
          {arabic && (
            <div className="col-span-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-dc1-amber/10 text-dc1-amber border border-dc1-amber/20 font-medium">
                🌙 Arabic-capable — PDPL-compliant
              </span>
            </div>
          )}
        </div>

        {savingsPct !== null && savingsPct > 0 && (
          <div className="bg-status-success/5 border border-status-success/20 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-dc1-text-muted">vs {competitorLabel}</span>
            <span className="text-status-success font-bold">You save {savingsPct}%</span>
          </div>
        )}

        <p className="text-sm text-dc1-text-secondary">
          Your job will be queued and assigned to an available provider with the required GPU specs.
          Billing starts when the job begins executing.
        </p>

        {isNoProvider && (
          <div className="bg-dc1-amber/5 border border-dc1-amber/30 rounded-lg px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-dc1-amber">No providers online right now</p>
            {registeredProviderCount !== null && registeredProviderCount > 0 ? (
              <p className="text-xs text-dc1-text-secondary">
                <span className="text-dc1-amber font-semibold">{registeredProviderCount} providers</span> are registered and activating — typically online within 4–6 hours.
              </p>
            ) : (
              <p className="text-xs text-dc1-text-secondary">Providers are being onboarded. Check back in a few hours or join the waitlist for a notification.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/renter/waitlist?model=${encodeURIComponent(model.model_id)}`} className="inline-block btn btn-outline btn-sm text-dc1-amber border-dc1-amber/40">
                Join Waitlist →
              </Link>
              <Link href="/provider-onboarding" className="inline-block btn btn-outline btn-sm text-dc1-text-secondary border-dc1-border hover:text-dc1-amber hover:border-dc1-amber/40">
                Register as Provider
              </Link>
            </div>
          </div>
        )}

        {isInsufficientBalance && (
          <div className="bg-status-error/5 border border-status-error/30 rounded-lg px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-status-error">Insufficient balance</p>
            <p className="text-xs text-dc1-text-secondary">Add credits to your wallet to deploy this model.</p>
            <Link href="/renter/billing" className="inline-block btn btn-outline btn-sm text-status-error border-status-error/40">Add Credits →</Link>
          </div>
        )}

        {deploy.error && !isNoProvider && !isInsufficientBalance && (
          <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
            {deploy.error}
          </div>
        )}

        {deploy.jobId && (
          <div className="bg-status-success/10 border border-status-success/30 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-status-success font-semibold">
              <span className="animate-spin h-4 w-4 border-2 border-status-success border-t-transparent rounded-full" />
              Job submitted — redirecting to live status…
            </div>
            {deploy.jobId !== 'submitted' && (
              <Link href={`/renter/jobs/${deploy.jobId}`} className="text-xs text-status-success underline">View Live Status →</Link>
            )}
          </div>
        )}

        {!deploy.jobId && (
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={deploy.loading}
              className="btn btn-secondary min-h-[44px] px-4"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={deploy.loading}
              className="btn btn-primary min-h-[44px] px-5 flex items-center gap-2"
            >
              {deploy.loading && (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {deploy.loading ? 'Submitting…' : 'Deploy Now'}
            </button>
          </div>
        )}

        {deploy.jobId && (
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn btn-secondary min-h-[44px] px-4">Close</button>
            {deploy.jobId !== 'submitted' ? (
              <Link href={`/renter/jobs/${deploy.jobId}`} className="btn btn-primary min-h-[44px] px-5">View Live Status →</Link>
            ) : (
              <Link href="/renter/jobs" className="btn btn-primary min-h-[44px] px-5">View Jobs →</Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Model Card ────────────────────────────────────────────────────────────────
function ModelCard({ model, onDeploy }: { model: ModelListItem; onDeploy: (m: ModelListItem) => void }) {
  const arabic = isArabicModel(model)
  const tierBadge = getTierBadge(model.tier)
  const prewarmBadge = getPrewarmBadge(model.prewarm_class)
  const taskType = getTaskType(model)
  const priceHr = getPriceHr(model)
  const savingsPct = getSavingsPct(model)
  const vram = model.min_gpu_vram_gb ?? model.vram_gb

  return (
    <article className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 hover:border-dc1-amber/30 hover:shadow-amber transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-dc1-text-primary group-hover:text-dc1-amber transition-colors leading-tight truncate">
            {model.display_name}
          </h3>
          <p className="text-xs text-dc1-text-muted font-mono mt-0.5 truncate">{model.model_id}</p>
        </div>
        {arabic && (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium bg-dc1-amber/10 text-dc1-amber border-dc1-amber/20">
            🌙 Arabic
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {tierBadge && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${tierBadge.cls}`}>
            {tierBadge.label}
          </span>
        )}
        {prewarmBadge && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${prewarmBadge.cls}`}>
            {prewarmBadge.label}
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-dc1-surface-l3 text-dc1-text-muted border border-dc1-border capitalize">
          {taskType}
        </span>
        {model.quantization && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-dc1-surface-l3 text-dc1-text-muted border border-dc1-border font-mono">
            {model.quantization}
          </span>
        )}
      </div>

      {/* Use cases */}
      {(model.use_cases ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.use_cases!.slice(0, 3).map((u, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-dc1-amber/5 text-dc1-amber border border-dc1-amber/15">
              {u}
            </span>
          ))}
        </div>
      )}

      {/* Specs + Pricing */}
      <div className="bg-dc1-surface-l1 rounded-lg px-3 py-2.5 grid grid-cols-2 gap-2 text-xs">
        {vram && (
          <div>
            <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">VRAM</p>
            <p className="font-semibold text-dc1-text-primary">{vram} GB</p>
          </div>
        )}
        {model.context_window && (
          <div>
            <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">Context</p>
            <p className="font-semibold text-dc1-text-primary">{(model.context_window / 1000).toFixed(0)}K tokens</p>
          </div>
        )}
        {model.providers_online !== undefined && (
          <div>
            <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">Providers</p>
            {(model.providers_online ?? 0) > 0 ? (
              <p className="font-semibold text-status-success">{model.providers_online} online</p>
            ) : (
              <p className="font-semibold text-dc1-text-muted" title="Providers are registered and activating">
                <span className="text-dc1-amber/70">activating</span>
              </p>
            )}
          </div>
        )}
        {priceHr !== null && (
          <div>
            <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">DCP Price</p>
            <p className="font-extrabold text-dc1-amber">{priceHr.toFixed(2)} <span className="text-[9px] font-normal text-dc1-text-muted">SAR/hr</span></p>
          </div>
        )}
      </div>

      {/* Savings vs competitor */}
      {savingsPct !== null && savingsPct > 0 && (
        <div className="bg-status-success/5 border border-status-success/20 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
          <span className="text-dc1-text-muted">
            vs {model.competitor_label ?? 'Vast.ai'}
          </span>
          <span className="text-status-success font-bold">Save {savingsPct}%</span>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onDeploy(model)}
        className="btn btn-primary w-full text-sm mt-auto min-h-[44px]"
      >
        Deploy Model
      </button>
    </article>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RenterModelsPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [models, setModels] = useState<ModelListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [filterArabic, setFilterArabic] = useState(false)
  const [filterTask, setFilterTask] = useState<TaskFilter>('all')
  const [filterVram, setFilterVram] = useState('')
  const [filterPriceMax, setFilterPriceMax] = useState('')
  const [filterTier, setFilterTier] = useState<'all' | 'tier_a' | 'tier_b'>('all')
  const [deploy, setDeploy] = useState<DeployState>({ model: null, loading: false, error: '', jobId: null })
  const [registeredProviderCount, setRegisteredProviderCount] = useState<number | null>(null)

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
    const key = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key')
    if (!key) {
      router.push('/login?role=renter&reason=missing_credentials')
      return
    }

    fetch(`${API_BASE}/models`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const list: ModelListItem[] = Array.isArray(data) ? data : []
        setModels(list)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    // Fetch registered provider count for empty-state messaging (DCP-963)
    fetch(`${API_BASE}/network`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const total = data?.network_health?.total_registered ?? null
        if (typeof total === 'number') setRegisteredProviderCount(total)
      })
      .catch(() => { /* non-critical — best effort */ })
  }, [router])

  const filtered = useMemo(() => {
    return models.filter(m => {
      if (filterArabic && !isArabicModel(m)) return false
      if (filterTask !== 'all' && getTaskType(m) !== filterTask) return false
      if (filterTier !== 'all' && m.tier !== filterTier) return false
      if (filterVram !== '') {
        const minV = parseInt(filterVram, 10)
        const vram = m.min_gpu_vram_gb ?? m.vram_gb ?? 0
        if (!isNaN(minV) && vram < minV) return false
      }
      if (filterPriceMax !== '') {
        const maxP = parseFloat(filterPriceMax)
        const priceHr = getPriceHr(m)
        if (!isNaN(maxP) && priceHr !== null && priceHr > maxP) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = `${m.model_id} ${m.display_name} ${m.family ?? ''} ${(m.use_cases ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [models, filterArabic, filterTask, filterTier, filterVram, filterPriceMax, search])

  const arabicCount = models.filter(isArabicModel).length
  const tierACount = models.filter(m => m.tier === 'tier_a').length

  const openDeploy = (model: ModelListItem) => {
    setDeploy({ model, loading: false, error: '', jobId: null })
  }

  const closeDeploy = () => {
    setDeploy({ model: null, loading: false, error: '', jobId: null })
  }

  const confirmDeploy = async () => {
    const model = deploy.model
    if (!model) return
    const apiKey = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key') || ''
    setDeploy(d => ({ ...d, loading: true, error: '' }))
    try {
      const res = await fetch(`${API_BASE}/jobs/from-template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify({
          model_id: model.model_id,
          template_id: model.template_id ?? undefined,
        }),
      })
      if (res.status === 404) {
        // Backend endpoint not yet deployed — fall back to job submission page
        router.push(`/renter/playground?model=${encodeURIComponent(model.model_id)}`)
        return
      }
      if (res.status === 402) {
        setDeploy(d => ({ ...d, loading: false, error: 'Insufficient balance. Please top up your wallet before deploying.' }))
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setDeploy(d => ({ ...d, loading: false, error: err.error || 'Failed to submit job. Please try again.' }))
        return
      }
      const data = await res.json()
      const jobId = data.job_id || data.id || 'submitted'
      setDeploy(d => ({ ...d, loading: false, jobId }))
    } catch {
      setDeploy(d => ({ ...d, loading: false, error: 'Network error. Please try again.' }))
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterArabic(false)
    setFilterTask('all')
    setFilterTier('all')
    setFilterVram('')
    setFilterPriceMax('')
  }

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">Arabic AI Model Catalog</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Deploy Arabic-capable LLMs, embeddings, and rerankers on Saudi GPUs.
            </p>
          </div>
          <Link href="/renter/marketplace" className="btn btn-secondary btn-sm self-start sm:self-auto">
            ← Back to Marketplace
          </Link>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
            <span className="text-dc1-amber font-bold">{loading ? '…' : models.length}</span>
            <span className="text-dc1-text-secondary">models available</span>
          </div>
          <div className="flex items-center gap-2 bg-dc1-amber/10 rounded-lg px-3 py-2 border border-dc1-amber/20">
            <span className="text-dc1-amber font-bold">🌙 {loading ? '…' : arabicCount}</span>
            <span className="text-dc1-amber font-medium">Arabic-capable</span>
          </div>
          <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
            <span className="text-dc1-amber font-bold">⭐ {loading ? '…' : tierACount}</span>
            <span className="text-dc1-text-secondary">Tier A (pre-warmed)</span>
          </div>
          {registeredProviderCount !== null && (
            <div className="flex items-center gap-2 bg-status-info/10 rounded-lg px-3 py-2 border border-status-info/20" title="Providers registered and activating on DCP">
              <span className="text-status-info font-bold">{registeredProviderCount}</span>
              <span className="text-dc1-text-secondary">providers registered</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-status-success/10 rounded-lg px-3 py-2 border border-status-success/20">
            <span className="text-status-success font-bold">Save 24–51%</span>
            <span className="text-dc1-text-secondary">vs competitors</span>
          </div>
        </div>

        {/* Arabic RAG callout */}
        {!loading && !error && arabicCount > 0 && (
          <div className="bg-dc1-amber/5 border border-dc1-amber/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="text-3xl">🌙</div>
            <div className="flex-1">
              <h3 className="font-bold text-dc1-text-primary mb-1">One-Click Arabic RAG Pipeline</h3>
              <p className="text-sm text-dc1-text-secondary">
                Bundle BGE-M3 embeddings + BGE reranker + ALLaM/JAIS into a complete PDPL-compliant Arabic document retrieval stack.
              </p>
            </div>
            <Link href="/renter/marketplace?category=embedding" className="btn btn-primary shrink-0 text-sm">
              View Arabic RAG Templates
            </Link>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center p-4 bg-dc1-surface-l1 rounded-xl border border-dc1-border">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc1-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search models…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input ps-9 w-full text-sm"
            />
          </div>
          <select
            value={filterTask}
            onChange={e => setFilterTask(e.target.value as TaskFilter)}
            className="input text-sm w-auto min-h-[44px]"
          >
            <option value="all">All Tasks</option>
            <option value="chat">Chat / Inference</option>
            <option value="embedding">Embeddings</option>
            <option value="reranking">Reranking</option>
            <option value="image">Image Generation</option>
          </select>
          <select
            value={filterTier}
            onChange={e => setFilterTier(e.target.value as 'all' | 'tier_a' | 'tier_b')}
            className="input text-sm w-auto min-h-[44px]"
          >
            <option value="all">All Tiers</option>
            <option value="tier_a">⭐ Tier A</option>
            <option value="tier_b">✦ Tier B</option>
          </select>
          <input
            type="number"
            min="0"
            step="8"
            placeholder="Min VRAM (GB)"
            value={filterVram}
            onChange={e => setFilterVram(e.target.value)}
            className="input text-sm w-36 min-h-[44px]"
          />
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="Max price (SAR/hr)"
            value={filterPriceMax}
            onChange={e => setFilterPriceMax(e.target.value)}
            className="input text-sm w-40 min-h-[44px]"
          />
          <label className="flex items-center gap-2 text-sm text-dc1-text-secondary cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              checked={filterArabic}
              onChange={e => setFilterArabic(e.target.checked)}
              className="rounded"
            />
            🌙 Arabic only
          </label>
          <span className="text-xs text-dc1-text-muted whitespace-nowrap ms-auto">
            {loading ? 'Loading…' : `${filtered.length} of ${models.length} models`}
          </span>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-dc1-text-secondary mb-2">Failed to load model catalog.</p>
            <button onClick={() => window.location.reload()} className="btn btn-secondary btn-sm mt-2">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-dc1-text-secondary mb-1">No models match your filters.</p>
            <button onClick={clearFilters} className="btn btn-outline btn-sm mt-3">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(m => <ModelCard key={m.model_id} model={m} onDeploy={openDeploy} />)}
          </div>
        )}
      </div>

      {/* Deploy modal */}
      {deploy.model && (
        <DeployModal deploy={deploy} onClose={closeDeploy} onConfirm={confirmDeploy} registeredProviderCount={registeredProviderCount} />
      )}
    </DashboardLayout>
  )
}
