'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '../../lib/i18n'

interface CostEstimatorProps {
  modelId?: string
  vramGb?: number
  pricePerHour?: number
  onPriceEstimate?: (totalPrice: number) => void
}

interface PricingDisplayProps {
  modelId?: string
  vramGb?: number
  pricePerHour?: number
  onPriceEstimate?: (totalPrice: number) => void
}

// SAR/hr by GPU class — DCP's own rates, derived from corrected backend rates (DCP-668)
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

function CostEstimator({ modelId, vramGb, pricePerHour, onPriceEstimate }: CostEstimatorProps) {
  const { t } = useLanguage()
  const [hours, setHours] = useState(1)
  const [minutes, setMinutes] = useState(0)
  const [tokens, setTokens] = useState(1000)
  const [estimateMode, setEstimateMode] = useState<'duration' | 'tokens'>('duration')

  const gpuType = getGpuType(vramGb)
  // Prefer a real per-hour price passed in; otherwise fall back to DCP's own GPU-class rate.
  const costPerHour = pricePerHour && pricePerHour > 0 ? pricePerHour : GPU_RATE_SAR_PER_HOUR[gpuType]
  const costPerMin = costPerHour / 60
  // Per-token cost at DCP rates
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
  const [estimatedPrice, setEstimatedPrice] = useState(0)

  useEffect(() => {
    if (onPriceEstimate && estimatedPrice > 0) {
      onPriceEstimate(estimatedPrice)
    }
  }, [estimatedPrice, onPriceEstimate])

  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      {/* Cost Estimator — DCP's own rates */}
      <CostEstimator
        modelId={modelId}
        vramGb={vramGb}
        pricePerHour={pricePerHour}
        onPriceEstimate={setEstimatedPrice}
      />

      {/* Info Box */}
      <div className="p-4 bg-dc1-surface border border-dc1-border rounded-lg">
        <p className="text-sm text-dc1-text-secondary">
          {t('marketplace.pricing_info') || 'Per-token rates, input and output priced separately, settled in real time as your requests complete. Saudi-hosted providers compete directly for your traffic.'}
        </p>
      </div>
    </div>
  )
}
