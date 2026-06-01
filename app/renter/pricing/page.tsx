'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'
import { getApiBase } from '../../../lib/api'
import ModelRateCard from '../../components/pricing/ModelRateCard'

// ── SVG Icons ────────────────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
const PricingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
)
const GpuCompareIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
)

// ── Pricing Data (from backend/src/config/pricing.js, March 2026) ──────────
interface GpuTier {
  gpu: string
  vram: string
  vastTypical: number
  runpodCommunity: number
  dcpFloor: number
  discountVsVast: number
  vramGb: number
  category: 'consumer' | 'prosumer' | 'datacenter'
}

const GPU_TIERS: GpuTier[] = [
  { gpu: 'RTX 3090',  vram: '24 GB', vastTypical: 0.17, runpodCommunity: 0.22, dcpFloor: 0.105, discountVsVast: -38.0, vramGb: 24,  category: 'consumer' },
  { gpu: 'RTX 4080',  vram: '16 GB', vastTypical: 0.19, runpodCommunity: 0.34, dcpFloor: 0.131, discountVsVast: -31.1, vramGb: 16,  category: 'consumer' },
  { gpu: 'RTX 4090',  vram: '24 GB', vastTypical: 0.35, runpodCommunity: 0.34, dcpFloor: 0.267, discountVsVast: -23.7, vramGb: 24,  category: 'prosumer' },
  { gpu: 'RTX 5090',  vram: '32 GB', vastTypical: 0.50, runpodCommunity: 0.69, dcpFloor: 0.394, discountVsVast: -21.2, vramGb: 32,  category: 'prosumer' },
  { gpu: 'A100 SXM',  vram: '80 GB', vastTypical: 0.86, runpodCommunity: 1.39, dcpFloor: 0.786, discountVsVast: -8.6,  vramGb: 80,  category: 'datacenter' },
  { gpu: 'H100 SXM',  vram: '80 GB', vastTypical: 1.55, runpodCommunity: 2.69, dcpFloor: 1.421, discountVsVast: -8.3,  vramGb: 80,  category: 'datacenter' },
]

// Job templates with GPU tier recommendations
interface JobTemplate {
  id: string
  name: string
  description: string
  jobType: string
  recommendedGpu: string
  estimatedHours: number
  tags: string[]
  href: string
}

const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: 'llm-chat',
    name: 'LLM Chat Inference',
    description: 'Single-turn completions with Mistral-7B. Great for Q&A and text generation.',
    jobType: 'llm-inference',
    recommendedGpu: 'RTX 4090',
    estimatedHours: 0.033,
    tags: ['LLM', 'Chat'],
    href: '/renter/templates',
  },
  {
    id: 'image-gen',
    name: 'Image Generation',
    description: 'Stable Diffusion XL text-to-image generation. High-quality creative output.',
    jobType: 'image-generation',
    recommendedGpu: 'RTX 4080',
    estimatedHours: 0.05,
    tags: ['Image', 'Diffusion'],
    href: '/renter/templates',
  },
  {
    id: 'embedding',
    name: 'Text Embedding Batch',
    description: 'Generate high-dimensional embeddings for semantic search or RAG pipelines.',
    jobType: 'embedding',
    recommendedGpu: 'RTX 3090',
    estimatedHours: 0.025,
    tags: ['Embedding', 'RAG'],
    href: '/renter/templates',
  },
  {
    id: 'fine-tune',
    name: 'LoRA Fine-tuning',
    description: 'Efficient fine-tuning with LoRA adapters on consumer GPUs.',
    jobType: 'training',
    recommendedGpu: 'RTX 5090',
    estimatedHours: 2.0,
    tags: ['Training', 'LoRA'],
    href: '/renter/templates',
  },
  {
    id: 'nemotron-70b',
    name: 'Nemotron-70B Inference',
    description: 'Run NVIDIA Nemotron-70B for advanced reasoning and code tasks.',
    jobType: 'llm-inference',
    recommendedGpu: 'H100 SXM',
    estimatedHours: 0.1,
    tags: ['LLM', 'Reasoning', 'Code'],
    href: '/renter/templates',
  },
  {
    id: 'a100-batch',
    name: 'Batch Processing Pipeline',
    description: 'High-throughput batch inference for production workloads.',
    jobType: 'llm-inference',
    recommendedGpu: 'A100 SXM',
    estimatedHours: 4.0,
    tags: ['Batch', 'Production'],
    href: '/renter/templates',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  return `$${n.toFixed(3)}`
}

function discountColor(discount: number): string {
  if (discount <= -30) return 'text-status-success font-bold'
  if (discount <= -20) return 'text-status-success'
  return 'text-dc1-amber'
}

function discountBadgeClass(discount: number): string {
  if (discount <= -30) return 'bg-status-success/15 text-status-success'
  if (discount <= -20) return 'bg-status-success/10 text-status-success'
  return 'bg-dc1-amber/15 text-dc1-amber'
}

function savingsPerMonth(dcpFloor: number, vastTypical: number): number {
  // 720 hours/month at 70% utilization = 504 hours
  const utilHours = 504
  return (vastTypical - dcpFloor) * utilHours
}

type FilterCategory = 'all' | 'consumer' | 'prosumer' | 'datacenter'

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const { t } = useLanguage()
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [highlightRow, setHighlightRow] = useState<string | null>(null)
  const [gpuTiers, setGpuTiers] = useState<GpuTier[]>(GPU_TIERS)
  const [priceLoading, setPriceLoading] = useState(true)
  const [priceError, setPriceError] = useState<string | null>(null)

  // Fetch pricing data from API on mount
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        setPriceLoading(true)
        const apiBase = getApiBase()
        const res = await fetch(`${apiBase}/renters/pricing`)

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`)
        }

        const data = await res.json()

        if (data.success && data.pricing && Array.isArray(data.pricing)) {
          // Map API prices back to GPU_TIERS format
          // Update DCP floor price from API
          const updatedTiers = GPU_TIERS.map(tier => {
            const apiPrice = data.pricing.find(
              (p: { gpu_model: string; rate_halala_per_hour: number }) => p.gpu_model === tier.gpu
            )
            if (apiPrice) {
// Convert internal rate units to USD/hour for display
              // DB stores rates as USD × 100,000 (e.g. $0.105 = 10500)
              const dcpFloorUsd = apiPrice.rate_halala_per_hour / 100000
              return {
                ...tier,
                dcpFloor: dcpFloorUsd,
// Negative = DCP is cheaper (matches hardcoded sign convention)
                discountVsVast: parseFloat((((dcpFloorUsd - tier.vastTypical) / tier.vastTypical) * 100).toFixed(1)),
              }
            }
            return tier
          })

          setGpuTiers(updatedTiers)
          setPriceError(null)
        }
      } catch (err) {
        console.warn('Failed to fetch pricing from API, using cached data:', err)
        setPriceError('Using cached pricing. API unavailable.')
        setGpuTiers(GPU_TIERS)
      } finally {
        setPriceLoading(false)
      }
    }

    fetchPricing()
  }, [])

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

  const filtered = gpuTiers.filter(g => filterCategory === 'all' || g.category === filterCategory)

  return (
    <DashboardLayout navItems={navItems} role="renter" userName="Renter">
      <div className="space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary">Inference Pricing</h1>
          <p className="text-dc1-text-secondary mt-1">
            Per-token rates for every model — input and output priced separately, settled in real time.
          </p>
          {priceError && (
            <p className="text-xs text-dc1-text-muted mt-2 font-medium">{priceError}</p>
          )}
        </div>

        {/* Value-prop banner */}
        <div className="card border-dc1-amber/30 bg-dc1-amber/5">
          <div className="flex flex-wrap gap-6 items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-dc1-amber uppercase tracking-wide">Why DCP is cheaper</p>
              <p className="text-dc1-text-primary mt-1 max-w-xl">
                Saudi industrial electricity costs <strong>$0.048–0.053/kWh</strong> — 3–5× cheaper than EU/UK.
                That structural advantage is passed directly to renters, not extracted as margin.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 min-w-max">
              <span className="text-3xl font-bold text-status-success">8–38%</span>
              <span className="text-sm text-dc1-text-secondary">below any competitor</span>
            </div>
          </div>
        </div>

        {/* GPU Tier Comparison Table */}
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="section-heading">GPU Floor Prices (March 2026)</h2>
            <div className="flex gap-1 bg-dc1-surface-l2 p-1 rounded-lg">
              {([
                { key: 'all' as FilterCategory, label: 'All' },
                { key: 'consumer' as FilterCategory, label: 'Consumer' },
                { key: 'prosumer' as FilterCategory, label: 'Prosumer' },
                { key: 'datacenter' as FilterCategory, label: 'Data Center' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterCategory(key)}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                    filterCategory === key
                      ? 'bg-dc1-amber text-dc1-void'
                      : 'text-dc1-text-secondary hover:text-dc1-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dc1-border">
                  <th className="text-left py-3 pr-4 text-dc1-text-muted font-medium">GPU</th>
                  <th className="text-left py-3 px-4 text-dc1-text-muted font-medium">VRAM</th>
                  <th className="text-right py-3 px-4 text-dc1-text-muted font-medium">Vast.ai</th>
                  <th className="text-right py-3 px-4 text-dc1-text-muted font-medium">RunPod</th>
                  <th className="text-right py-3 px-4 text-dc1-amber font-semibold">DCP Floor</th>
                  <th className="text-right py-3 pl-4 text-dc1-text-muted font-medium">You Save</th>
                  <th className="text-right py-3 pl-4 text-dc1-text-muted font-medium">vs Vast/mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dc1-border">
                {filtered.map(tier => {
                  const isHighlighted = highlightRow === tier.gpu
                  const monthlySavings = savingsPerMonth(tier.dcpFloor, tier.vastTypical)
                  return (
                    <tr
                      key={tier.gpu}
                      onMouseEnter={() => setHighlightRow(tier.gpu)}
                      onMouseLeave={() => setHighlightRow(null)}
                      className={`transition-colors ${isHighlighted ? 'bg-dc1-surface-l2/60' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-dc1-text-primary">{tier.gpu}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] rounded capitalize font-medium ${
                            tier.category === 'datacenter'
                              ? 'bg-purple-500/15 text-purple-400'
                              : tier.category === 'prosumer'
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-dc1-surface-l3 text-dc1-text-muted'
                          }`}>
                            {tier.category}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 text-xs bg-dc1-amber/10 text-dc1-amber rounded-full font-medium">
                          {tier.vram}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-dc1-text-secondary">
                        {fmtUSD(tier.vastTypical)}/hr
                      </td>
                      <td className="py-3 px-4 text-right text-dc1-text-secondary">
                        {fmtUSD(tier.runpodCommunity)}/hr
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-dc1-amber font-bold text-base">
                          {fmtUSD(tier.dcpFloor)}/hr
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${discountBadgeClass(tier.discountVsVast)}`}>
                          {tier.discountVsVast.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <span className={`text-sm font-medium ${discountColor(tier.discountVsVast)}`}>
                          ${monthlySavings.toFixed(0)}/mo
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-dc1-text-muted mt-4">
            Monthly savings estimated at 70% utilization (504 hrs/mo). Prices as of March 2026.
            Vast.ai typical market rate used as baseline.
          </p>
        </div>

        {/* Visual price bars */}
        <div className="card">
          <h2 className="section-heading mb-6">Price Comparison at a Glance</h2>
          <div className="space-y-5">
            {filtered.map(tier => {
              const maxPrice = Math.max(tier.vastTypical, tier.runpodCommunity) * 1.05
              const dcpPct = (tier.dcpFloor / maxPrice) * 100
              const vastPct = (tier.vastTypical / maxPrice) * 100
              const runpodPct = (tier.runpodCommunity / maxPrice) * 100
              return (
                <div key={tier.gpu}>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="font-semibold text-dc1-text-primary text-sm">{tier.gpu}</span>
                    <span className="text-xs text-dc1-text-muted">{tier.vram}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-20 text-dc1-text-muted text-right">DCP</span>
                      <div className="flex-1 h-5 bg-dc1-surface-l2 rounded overflow-hidden">
                        <div
                          className="h-full bg-dc1-amber rounded flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${dcpPct}%` }}
                        >
                          <span className="text-[10px] font-bold text-dc1-void">{fmtUSD(tier.dcpFloor)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-20 text-dc1-text-muted text-right">Vast.ai</span>
                      <div className="flex-1 h-5 bg-dc1-surface-l2 rounded overflow-hidden">
                        <div
                          className="h-full bg-dc1-surface-l3 rounded flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${vastPct}%` }}
                        >
                          <span className="text-[10px] text-dc1-text-muted">{fmtUSD(tier.vastTypical)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-20 text-dc1-text-muted text-right">RunPod</span>
                      <div className="flex-1 h-5 bg-dc1-surface-l2 rounded overflow-hidden">
                        <div
                          className="h-full bg-dc1-surface-l3/70 rounded flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${runpodPct}%` }}
                        >
                          <span className="text-[10px] text-dc1-text-muted">{fmtUSD(tier.runpodCommunity)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Template catalog with pricing */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-heading">Job Templates — Estimated Cost</h2>
            <Link
              href="/renter/templates"
              className="text-sm text-dc1-amber hover:text-dc1-amber/80 transition-colors"
            >
              Browse all templates →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {JOB_TEMPLATES.map(tmpl => {
              const tier = gpuTiers.find(g => g.gpu === tmpl.recommendedGpu)
              const estimatedCost = tier ? tier.dcpFloor * tmpl.estimatedHours : 0
              const marketCost = tier ? tier.vastTypical * tmpl.estimatedHours : 0
              const saving = marketCost - estimatedCost
              return (
                <Link
                  key={tmpl.id}
                  href={tmpl.href}
                  className="card hover:border-dc1-amber/40 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-dc1-text-primary group-hover:text-dc1-amber transition-colors">
                      {tmpl.name}
                    </h3>
                    {saving > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-status-success/15 text-status-success rounded-full ml-2 flex-shrink-0">
                        save ${saving.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-dc1-text-secondary mb-3 leading-relaxed">
                    {tmpl.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {tmpl.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-dc1-surface-l2 text-dc1-text-muted rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="border-t border-dc1-border pt-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-dc1-text-muted">Recommended GPU</p>
                      <p className="text-sm font-semibold text-dc1-text-primary">{tmpl.recommendedGpu}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-dc1-text-muted">Est. cost</p>
                      <p className="text-sm font-bold text-dc1-amber">
                        ${estimatedCost.toFixed(3)}
                      </p>
                      {marketCost > 0 && (
                        <p className="text-[10px] text-dc1-text-muted line-through">
                          ${marketCost.toFixed(3)} on Vast
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Per-Model Rate Card (DRAFT P1) */}
        <ModelRateCard variant="full" />

        {/* Per-Token Inference API Pricing */}
        <div className="card border-dc1-amber/20">
          <div className="mb-6">
            <h2 className="section-heading">Per-Token Inference API Pricing</h2>
            <p className="text-sm text-dc1-text-secondary mt-1">
              OpenAI-compatible API. Pay per token. No GPU management required.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🤖</span>
                <h3 className="font-bold text-dc1-text-primary">Arabic LLMs</h3>
              </div>
              <p className="text-xs text-dc1-text-secondary mb-4">
                ALLaM, JAIS, Falcon — built for Arabic NLP tasks
              </p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Input</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.0015 / 1K tokens</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Output</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.0045 / 1K tokens</span>
                </div>
              </div>
              <p className="text-[10px] text-dc1-text-muted mt-3">33–51% below AWS Bedrock</p>
            </div>

            <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🌐</span>
                <h3 className="font-bold text-dc1-text-primary">Global Models</h3>
              </div>
              <p className="text-xs text-dc1-text-secondary mb-4">
                Llama, Mistral, Qwen — via OpenAI-compatible API
              </p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Input</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.001 / 1K tokens</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Output</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.003 / 1K tokens</span>
                </div>
              </div>
              <p className="text-[10px] text-dc1-text-muted mt-3">23% below Vast.ai</p>
            </div>

            <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🔍</span>
                <h3 className="font-bold text-dc1-text-primary">Embeddings & RAG</h3>
              </div>
              <p className="text-xs text-dc1-text-secondary mb-4">
                BGE-M3, Arabic reranker — for document retrieval
              </p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Embedding</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.0003 / 1K tokens</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dc1-text-muted">Rerank</span>
                  <span className="text-sm font-bold text-dc1-amber">SAR 0.001 / 1K tokens</span>
                </div>
              </div>
              <p className="text-[10px] text-dc1-text-muted mt-3">PDPL-compliant Saudi data residency</p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-dc1-amber/5 border border-dc1-amber/20 rounded-xl">
            <p className="text-sm text-dc1-text-secondary">
              <span className="font-semibold text-dc1-amber">OpenAI-Compatible:</span> Switch base URL to <code className="bg-dc1-void px-1.5 py-0.5 rounded text-xs">https://api.dcp.sa/v1</code> and use your existing code. Saudi data residency included.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="card border-dc1-amber/20 text-center py-8">
          <h2 className="text-xl font-bold text-dc1-text-primary mb-2">Ready to run?</h2>
          <p className="text-dc1-text-secondary mb-6 max-w-md mx-auto">
            Browse live providers on the marketplace and launch a job in minutes, or call the Inference API directly.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/renter/marketplace"
              className="px-6 py-2.5 bg-dc1-amber text-dc1-void font-semibold rounded-lg hover:bg-dc1-amber/90 transition-colors text-sm"
            >
              Browse Marketplace
            </Link>
            <Link
              href="/renter/templates"
              className="px-6 py-2.5 bg-dc1-surface-l2 text-dc1-text-primary font-semibold rounded-lg hover:bg-dc1-surface-l3 transition-colors text-sm"
            >
              Use a Template
            </Link>
            <Link
              href="/api-keys"
              className="px-6 py-2.5 bg-dc1-surface-l2 text-dc1-text-primary font-semibold rounded-lg hover:bg-dc1-surface-l3 transition-colors text-sm"
            >
              Get API Key
            </Link>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
