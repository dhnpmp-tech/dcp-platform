'use client'

import { useEffect, useState, useMemo } from 'react'
import { useLanguage } from '../../lib/i18n'

interface Model {
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
  tier?: string
  arabic_capability?: boolean
  cold_start_ms?: number
}

interface ModelCardFeed {
  model_id: string
  summary?: {
    en?: string
    ar?: string
  }
  metrics?: {
    vram_required_gb?: number
    latency_ms?: {
      p50?: number
      p95?: number
      p99?: number
    }
    arabic_quality?: {
      arabic_mmlu_score?: number
      arabicaqa_score?: number
    }
    cost_per_1k_tokens_sar?: number
    cold_start_ms?: number
  }
}

interface Filters {
  tier: string | null
  arabicCapability: boolean
  minVram: number
  computeType: string | null
}

type SortOption = 'price-asc' | 'price-desc' | 'latency-asc' | 'launch-priority' | 'availability'

interface ModelBrowsingProps {
  onSelectModel?: (model: Model) => void
}

const COMPUTE_TYPE_FALLBACKS: Record<string, string> = {
  inference: 'Inference',
  training: 'Training',
  rendering: 'Rendering',
}

export default function ModelBrowsing({ onSelectModel }: ModelBrowsingProps) {
  const { language, t, dir } = useLanguage()
  const [models, setModels] = useState<Model[]>([])
  const [modelCards, setModelCards] = useState<Map<string, ModelCardFeed>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filters, setFilters] = useState<Filters>({
    tier: null,
    arabicCapability: false,
    minVram: 0,
    computeType: null,
  })

  const [sortBy, setSortBy] = useState<SortOption>('availability')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catalogRes, cardsRes] = await Promise.all([
          fetch('/api/models/catalog'),
          fetch('/api/models/cards'),
        ])

        if (!catalogRes.ok) throw new Error('Failed to fetch model catalog')

        const catalogData = await catalogRes.json()
        setModels(catalogData.models || [])

        if (cardsRes.ok) {
          const cardsData = await cardsRes.json()
          const cardsMap = new Map<string, ModelCardFeed>()
          if (Array.isArray(cardsData.cards)) {
            cardsData.cards.forEach((card: ModelCardFeed) => {
              cardsMap.set(card.model_id, card)
            })
          }
          setModelCards(cardsMap)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const filteredAndSorted = useMemo(() => {
    let result = [...models]

    // Apply filters
    if (filters.tier) {
      result = result.filter(m => m.tier === filters.tier)
    }
    if (filters.arabicCapability) {
      result = result.filter(m => m.arabic_capability === true)
    }
    if (filters.minVram > 0) {
      result = result.filter(m => m.min_gpu_vram_gb >= filters.minVram)
    }
    if (filters.computeType) {
      result = result.filter(m =>
        m.use_cases && m.use_cases.includes(filters.computeType!)
      )
    }

    // Apply sorting
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.avg_price_sar_per_min - b.avg_price_sar_per_min)
        break
      case 'price-desc':
        result.sort((a, b) => b.avg_price_sar_per_min - a.avg_price_sar_per_min)
        break
      case 'latency-asc':
        result.sort((a, b) => {
          const aLatency = modelCards.get(a.model_id)?.metrics?.latency_ms?.p95 ?? Infinity
          const bLatency = modelCards.get(b.model_id)?.metrics?.latency_ms?.p95 ?? Infinity
          return aLatency - bLatency
        })
        break
      case 'launch-priority':
        result.sort((a, b) => {
          const aTier = ['tier_a', 'tier_b', 'tier_c'].indexOf(a.tier || 'tier_c')
          const bTier = ['tier_a', 'tier_b', 'tier_c'].indexOf(b.tier || 'tier_c')
          return aTier - bTier
        })
        break
      case 'availability':
      default:
        result.sort((a, b) => b.providers_online - a.providers_online)
    }

    return result
  }, [models, filters, sortBy, modelCards])

  const handleSelectModel = (model: Model) => {
    if (onSelectModel) {
      onSelectModel(model)
    }
  }

  const getModelSummary = (modelId: string): string => {
    const card = modelCards.get(modelId)
    const summary = card?.summary?.[language === 'ar' ? 'ar' : 'en']
    return summary || ''
  }

  const vramOptions = [0, 8, 16, 24, 80]
  const computeTypes = ['inference', 'training', 'rendering']
  const label = (key: string, fallback: string) => {
    const translated = t(key)
    return translated === key ? fallback : translated
  }
  const tierLabel = (tier: string) => label(`marketplace.${tier}`, tier.replace('_', ' ').toUpperCase())
  const computeTypeLabel = (type: string) => label(`marketplace.compute_${type}`, COMPUTE_TYPE_FALLBACKS[type] ?? type)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">{label('marketplace.loading', 'Loading models...')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error">
        {label('marketplace.error_loading_models', 'Error loading models:')} {error}
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={dir}>
      {/* Filters and Sort */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tier Filter */}
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
            {label('marketplace.tier', 'Tier')}
          </label>
          <select
            value={filters.tier || ''}
            onChange={e => setFilters({ ...filters, tier: e.target.value || null })}
            className="input w-full text-sm"
          >
            <option value="">{label('marketplace.all', 'All')}</option>
            <option value="tier_a">{tierLabel('tier_a')}</option>
            <option value="tier_b">{tierLabel('tier_b')}</option>
            <option value="tier_c">{tierLabel('tier_c')}</option>
          </select>
        </div>

        {/* Min VRAM Filter */}
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
            {label('marketplace.min_vram', 'Min VRAM (GB)')}
          </label>
          <select
            value={filters.minVram}
            onChange={e => setFilters({ ...filters, minVram: parseInt(e.target.value) })}
            className="input w-full text-sm"
          >
            {vramOptions.map(vram => (
              <option key={vram} value={vram}>
                {vram === 0 ? label('marketplace.any', 'Any') : `${vram} GB`}
              </option>
            ))}
          </select>
        </div>

        {/* Compute Type Filter */}
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
            {label('marketplace.compute_type', 'Compute Type')}
          </label>
          <select
            value={filters.computeType || ''}
            onChange={e => setFilters({ ...filters, computeType: e.target.value || null })}
            className="input w-full text-sm"
          >
            <option value="">{label('marketplace.all', 'All')}</option>
            {computeTypes.map(type => (
              <option key={type} value={type}>
                {computeTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        {/* Arabic Capability */}
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
            {label('marketplace.language', 'Language')}
          </label>
          <button
            onClick={() => setFilters({ ...filters, arabicCapability: !filters.arabicCapability })}
            className={`btn w-full text-sm ${
              filters.arabicCapability
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
          >
            {label('marketplace.arabic_only', 'Arabic')}
          </button>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
            {label('marketplace.sort_by', 'Sort By')}
          </label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="input w-full text-sm"
          >
            <option value="availability">{label('marketplace.sort_availability', 'Availability')}</option>
            <option value="price-asc">{label('marketplace.sort_price_low', 'Price (Low)')}</option>
            <option value="price-desc">{label('marketplace.sort_price_high', 'Price (High)')}</option>
            <option value="latency-asc">{label('marketplace.sort_latency', 'Latency')}</option>
            <option value="launch-priority">{label('marketplace.sort_priority', 'Priority')}</option>
          </select>
        </div>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAndSorted.map(model => (
          <div
            key={model.model_id}
            className="p-4 border border-dc1-border rounded-lg hover:shadow-lg transition hover:border-dc1-amber/30"
          >
            {/* Header */}
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">{model.display_name}</h3>
              <p className="text-xs text-gray-500 mt-1">{model.family}</p>
            </div>

            {/* Summary */}
            {getModelSummary(model.model_id) && (
              <p className="text-sm text-gray-600 mb-3">{getModelSummary(model.model_id)}</p>
            )}

            {/* Metadata */}
            <div className="space-y-2 mb-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">{label('marketplace.vram', 'VRAM')}:</span>
                <span className="font-medium">{model.vram_gb} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{label('marketplace.price_per_min', 'Price/min')}:</span>
                <span className="font-medium text-green-600">
                  SAR {model.avg_price_sar_per_min.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{label('marketplace.context_window', 'Context')}:</span>
                <span className="font-medium">{model.context_window} {label('marketplace.tokens', 'tokens')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{label('marketplace.providers_online', 'Providers')}</span>
                <span className={`font-medium ${model.providers_online > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {model.providers_online}
                </span>
              </div>
            </div>

            {/* Use Cases */}
            {model.use_cases && model.use_cases.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {model.use_cases.map(useCase => (
                  <span
                    key={useCase}
                    className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                  >
                    {computeTypeLabel(useCase)}
                  </span>
                ))}
              </div>
            )}

            {/* Status */}
            <div className="mb-3">
              {model.status === 'available' ? (
                <span className="inline-block px-2 py-1 bg-status-success/10 text-status-success border border-status-success/20 rounded text-xs font-medium">
                  {label('marketplace.available', 'Available')}
                </span>
              ) : (
                <span className="inline-block px-2 py-1 bg-status-error/10 text-status-error border border-status-error/20 rounded text-xs font-medium">
                  {label('marketplace.no_providers', 'No Providers')}
                </span>
              )}
            </div>

            {/* Deploy Button */}
            <button
              onClick={() => handleSelectModel(model)}
              disabled={model.status !== 'available'}
              className="btn btn-primary w-full text-sm disabled:cursor-not-allowed"
            >
              {label('marketplace.deploy_model', 'Deploy Model')}
            </button>
          </div>
        ))}
      </div>

      {filteredAndSorted.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">{label('marketplace.no_models', 'No models found')}</p>
        </div>
      )}

      {/* Results Count */}
      <div className="text-sm text-gray-600 text-center">
        {label('marketplace.showing', 'Showing')} {filteredAndSorted.length} {label('marketplace.of', 'of')} {models.length} {label('marketplace.models', 'models')}
      </div>
    </div>
  )
}
