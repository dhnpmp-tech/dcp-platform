'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '../../lib/i18n'

interface CompetitorPricing {
  provider: string
  price_sar_per_hour: number
}

interface CostEstimatorProps {
  modelId?: string
  vramGb?: number
  onPriceEstimate?: (totalPrice: number) => void
}

interface PricingDisplayProps {
  modelId?: string
  vramGb?: number
  pricePerHour?: number
  onPriceEstimate?: (totalPrice: number) => void
}

// Buyer economics from platform pricing model
const BUYER_ECONOMICS = [
  {
    scenario: 'AI Startup (4x A100)',
    hyperscalerYear: 8640,
    dcpYear: 5772,
    savings: 2868,
    savingsPercent: 33,
  },
  {
    scenario: 'ML Team (8x H100)',
    hyperscalerYear: 42048,
    dcpYear: 25536,
    savings: 16512,
    savingsPercent: 39,
  },
  {
    scenario: 'Enterprise (32x H100)',
    hyperscalerYear: 168192,
    dcpYear: 90680,
    savings: 77512,
    savingsPercent: 46,
  },
  {
    scenario: 'Render Farm (16x RTX 4090)',
    hyperscalerYear: 28032,
    dcpYear: 13824,
    savings: 14208,
    savingsPercent: 51,
  },
]

// Corrected competitive pricing from platform pricing model
// USD → SAR at 1 USD = 3.75 SAR
// RTX 4090: DCP $0.267/hr (23.7% below Vast.ai)
// H100: DCP $1.85/hr vs AWS $4.70/hr (61% cheaper)
const COMPETITIVE_PRICING: { [key: string]: CompetitorPricing[] } = {
  RTX4090: [
    { provider: 'DC1', price_sar_per_hour: 1.00 },
    { provider: 'Vast.ai', price_sar_per_hour: 1.31 },
    { provider: 'RunPod', price_sar_per_hour: 1.50 },
  ],
  A100: [
    { provider: 'DC1', price_sar_per_hour: 4.69 },
    { provider: 'Vast.ai', price_sar_per_hour: 7.88 },
    { provider: 'RunPod', price_sar_per_hour: 9.38 },
    { provider: 'AWS', price_sar_per_hour: 11.63 },
  ],
  H100: [
    { provider: 'DC1', price_sar_per_hour: 6.94 },
    { provider: 'Vast.ai', price_sar_per_hour: 12.00 },
    { provider: 'RunPod', price_sar_per_hour: 14.25 },
    { provider: 'AWS', price_sar_per_hour: 17.63 },
  ],
}

// SAR/hr by GPU class — based on corrected backend rates (DCP-668)
// 6 halala/min economy (RTX 4090), 9 halala/min LLM standard (A100/H100)
const GPU_RATE_SAR_PER_HOUR: { [key: string]: number } = {
  RTX4090: 3.60,  // 6 halala/min × 60 / 100
  A100: 5.40,     // 9 halala/min × 60 / 100
  H100: 5.40,     // 9 halala/min × 60 / 100
}

function getGpuType(vramGb?: number): string {
  if (!vramGb) return 'RTX4090'
  if (vramGb >= 80) return 'H100'
  if (vramGb >= 48) return 'A100'
  return 'RTX4090'
}

function CostEstimator({ modelId, vramGb, onPriceEstimate }: CostEstimatorProps) {
  const { t } = useLanguage()
  const [hours, setHours] = useState(1)
  const [minutes, setMinutes] = useState(0)
  const [tokens, setTokens] = useState(1000)
  const [estimateMode, setEstimateMode] = useState<'duration' | 'tokens'>('duration')

  const gpuType = getGpuType(vramGb)
  const costPerHour = GPU_RATE_SAR_PER_HOUR[gpuType]
  const costPerMin = costPerHour / 60
  // Per-token cost at DCP floor: $0.267/hr RTX4090 → ~SAR 1.65/1M tokens at 45 tok/sec
  const costPer1KTokens = gpuType === 'RTX4090' ? 0.00165 : gpuType === 'A100' ? 0.003 : 0.005

  const totalDurationMinutes = hours * 60 + minutes
  const durationCost = totalDurationMinutes * costPerMin
  const tokenCost = (tokens / 1000) * costPer1KTokens
  const estimatedTotal = estimateMode === 'duration' ? durationCost : tokenCost

  useEffect(() => {
    if (onPriceEstimate) {
      onPriceEstimate(estimatedTotal)
    }
  }, [estimatedTotal, onPriceEstimate])

  return (
    <div className="p-4 border border-dc1-border rounded-lg bg-dc1-surface">
      <h4 className="font-semibold text-dc1-text-primary mb-3">{t('marketplace.cost_estimator') || 'Cost Estimator'}</h4>

      {/* Mode Toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setEstimateMode('duration')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
            estimateMode === 'duration'
              ? 'btn btn-primary'
              : 'btn btn-secondary'
          }`}
        >
          {t('marketplace.by_duration') || 'By Duration'}
        </button>
        <button
          onClick={() => setEstimateMode('tokens')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
            estimateMode === 'tokens'
              ? 'btn btn-primary'
              : 'btn btn-secondary'
          }`}
        >
          {t('marketplace.by_tokens') || 'By Tokens'}
        </button>
      </div>

      {/* Duration Mode */}
      {estimateMode === 'duration' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-dc1-text-secondary mb-1">
              {t('marketplace.hours') || 'Hours'}
            </label>
            <input
              type="number"
              min="0"
              max="168"
              value={hours}
              onChange={e => setHours(Math.max(0, parseInt(e.target.value) || 0))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dc1-text-secondary mb-1">
              {t('marketplace.minutes') || 'Minutes'}
            </label>
            <input
              type="number"
              min="0"
              max="59"
              value={minutes}
              onChange={e => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
              className="input w-full"
            />
          </div>
        </div>
      )}

      {/* Token Mode */}
      {estimateMode === 'tokens' && (
        <div>
          <label className="block text-sm font-medium text-dc1-text-secondary mb-1">
            {t('marketplace.num_tokens') || 'Number of Tokens'}
          </label>
          <input
            type="number"
            min="1"
            max="1000000"
            value={tokens}
            onChange={e => setTokens(Math.max(1, parseInt(e.target.value) || 1000))}
            className="input w-full"
          />
        </div>
      )}

      {/* Breakdown */}
      <div className="mt-3 space-y-2 text-xs">
        {estimateMode === 'duration' && (
          <>
            <div className="flex justify-between text-dc1-text-secondary">
              <span>{t('marketplace.per_hour') || 'Per hour'}:</span>
              <span>SAR {costPerHour.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-dc1-text-secondary">
              <span>{t('marketplace.duration') || 'Duration'}:</span>
              <span>
                {hours > 0 && `${hours}h `}
                {minutes > 0 && `${minutes}m`}
                {hours === 0 && minutes === 0 && '0m'}
              </span>
            </div>
          </>
        )}
        {estimateMode === 'tokens' && (
          <div className="flex justify-between text-dc1-text-secondary">
            <span>{t('marketplace.per_1k_tokens') || 'Per 1K tokens'}:</span>
            <span>SAR {costPer1KTokens.toFixed(5)}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-dc1-border flex justify-between">
        <span className="font-semibold text-dc1-text-primary">{t('marketplace.estimated_total') || 'Estimated Total'}:</span>
        <span className="text-lg font-bold text-status-success">SAR {estimatedTotal.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function PricingDisplay({ modelId, vramGb, pricePerHour, onPriceEstimate }: PricingDisplayProps) {
  const { t } = useLanguage()
  const [estimatedPrice, setEstimatedPrice] = useState(0)

  useEffect(() => {
    if (onPriceEstimate && estimatedPrice > 0) {
      onPriceEstimate(estimatedPrice)
    }
  }, [estimatedPrice, onPriceEstimate])

  const gpuType = getGpuType(vramGb)
  const competitorPrices = COMPETITIVE_PRICING[gpuType] || []
  const dcpPrice = competitorPrices.find(p => p.provider === 'DC1')
  const awsPrice = competitorPrices.find(p => p.provider === 'AWS')
  const vastPrice = competitorPrices.find(p => p.provider === 'Vast.ai')
  const benchmarkPrice = awsPrice || vastPrice
  const savingsVsBenchmark = dcpPrice && benchmarkPrice
    ? Math.round((1 - dcpPrice.price_sar_per_hour / benchmarkPrice.price_sar_per_hour) * 100)
    : null

  return (
    <div className="space-y-6">
      {/* Savings Banner */}
      {savingsVsBenchmark && (
        <div className="p-3 bg-status-success/10 border border-status-success/20 rounded-lg flex items-center gap-3">
          <span className="text-2xl font-black text-status-success">{savingsVsBenchmark}%</span>
          <div>
            <p className="font-semibold text-dc1-text-primary text-sm">
              {t('marketplace.cheaper_than') || 'cheaper than'} {benchmarkPrice?.provider}
            </p>
            <p className="text-xs text-dc1-text-secondary">
              {t('marketplace.in_kingdom_pricing') || 'Per-token pricing — Saudi-hosted, OpenAI-compatible'}
            </p>
          </div>
        </div>
      )}

      {/* Competitive Pricing */}
      {competitorPrices.length > 0 && (
        <div className="p-4 border border-dc1-border rounded-lg">
          <h3 className="font-semibold text-dc1-text-primary mb-4">
            {t('marketplace.competitive_pricing') || 'Market Comparison'} ({gpuType})
          </h3>
          <div className="space-y-2">
            {competitorPrices.map(comp => {
              const isDcp = comp.provider === 'DC1'
              const savingsPct = isDcp && benchmarkPrice
                ? Math.round((1 - comp.price_sar_per_hour / benchmarkPrice.price_sar_per_hour) * 100)
                : null
              return (
                <div
                  key={comp.provider}
                  className={`flex items-center justify-between p-2 rounded ${
                    isDcp ? 'bg-status-success/10 border border-status-success/20' : 'bg-dc1-surface'
                  }`}
                >
                  <span className={`font-medium ${isDcp ? 'text-status-success' : 'text-dc1-text-primary'}`}>
                    {comp.provider}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-dc1-text-primary">
                      SAR {comp.price_sar_per_hour.toFixed(2)}/hr
                    </span>
                    {savingsPct && (
                      <span className="px-2 py-1 bg-status-success/10 text-status-success border border-status-success/20 rounded text-sm font-medium">
                        Save {savingsPct}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cost Estimator */}
      <CostEstimator
        modelId={modelId}
        vramGb={vramGb}
        onPriceEstimate={setEstimatedPrice}
      />

      {/* Buyer Economics */}
      <div className="p-4 border border-dc1-border rounded-lg">
        <h3 className="font-semibold text-dc1-text-primary mb-4">
          {t('marketplace.buyer_economics') || 'Annual Savings Examples'}
        </h3>
        <div className="space-y-3">
          {BUYER_ECONOMICS.map(scenario => (
            <div key={scenario.scenario} className="p-3 bg-dc1-surface rounded-lg border border-dc1-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-dc1-text-primary">{scenario.scenario}</h4>
                <span className="px-2 py-1 bg-status-success/10 text-status-success border border-status-success/20 rounded text-sm font-bold">
                  {scenario.savingsPercent}% {t('marketplace.savings') || 'Save'}
                </span>
              </div>
              <div className="space-y-1 text-xs text-dc1-text-secondary">
                <div className="flex justify-between">
                  <span>{t('marketplace.hyperscaler') || 'Hyperscaler'}: SAR {scenario.hyperscalerYear.toLocaleString()}/yr</span>
                  <span>{t('marketplace.dcp') || 'DC1'}: SAR {scenario.dcpYear.toLocaleString()}/yr</span>
                </div>
                <div className="text-status-success font-medium">
                  {t('marketplace.annual_savings') || 'Annual Savings'}: SAR {scenario.savings.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-dc1-surface border border-dc1-border rounded-lg">
        <p className="text-sm text-dc1-text-secondary">
          {t('marketplace.pricing_info') || 'Per-token rates, input and output priced separately, settled in real time as your requests complete. Saudi-hosted providers compete directly for your traffic.'}
        </p>
      </div>
    </div>
  )
}
