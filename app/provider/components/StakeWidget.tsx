'use client'

import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api'

// Minimum stake display in SAR (1 SAR = 100 halala; wei values come from backend)
// We display wei values converted to SAR via a fixed rate placeholder
// Backend returns amounts in wei (18 decimals). We show them as token units.
const WEI_TO_DISPLAY = (wei: string): string => {
  try {
    const n = BigInt(wei)
    if (n === 0n) return '0'
    // Display as integer token units (divide by 1e18)
    const units = Number(n) / 1e18
    if (units < 0.001) return '< 0.001'
    if (units >= 1000) return units.toLocaleString('en-US', { maximumFractionDigits: 0 })
    return units.toLocaleString('en-US', { maximumFractionDigits: 3 })
  } catch {
    return '—'
  }
}

const WEI_TO_BIGINT = (wei: string): bigint => {
  try { return BigInt(wei) } catch { return 0n }
}

interface StakeData {
  providerId: number
  walletAddress: string | null
  stakeStatus: string
  stakeAmount: string
  minimumRequired: string
  hasMinimumStake: boolean
  shortfall: string
  gpuTier: number
  liveCheckPerformed: boolean
  requireStake: boolean
}

interface StakeWidgetProps {
  /** Optional: pass the provider ID if already known to skip the /me fetch */
  providerId?: number
}

export function StakeWidget({ providerId: providerIdProp }: StakeWidgetProps) {
  const [stakeData, setStakeData] = useState<StakeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key) { setLoading(false); return }

    try {
      let pid = providerIdProp
      if (!pid) {
        const meRes = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(key)}`)
        if (!meRes.ok) { setLoading(false); return }
        const meData = await meRes.json()
        pid = meData.provider?.id
      }
      if (!pid) { setLoading(false); return }

      const res = await fetch(
        `${API_BASE}/providers/${pid}/stake-status?api_key=${encodeURIComponent(key)}`
      )
      if (!res.ok) { setLoading(false); setError('Failed to load stake status'); return }
      const data: StakeData = await res.json()
      setStakeData(data)
      setError(null)
    } catch {
      setError('Could not load stake data')
    } finally {
      setLoading(false)
    }
  }, [providerIdProp])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
        <div className="h-4 w-32 bg-dc1-surface-l2 rounded skeleton mb-3" />
        <div className="h-10 bg-dc1-surface-l2 rounded skeleton mb-2" />
        <div className="h-6 bg-dc1-surface-l2 rounded skeleton" />
      </div>
    )
  }

  // No staking contract configured — show coming-soon card
  const stakingEnabled =
    stakeData &&
    stakeData.requireStake &&
    WEI_TO_BIGINT(stakeData.minimumRequired) > 0n

  if (!stakeData || !stakingEnabled) {
    return (
      <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldIcon />
          <h3 className="text-sm font-semibold text-dc1-text-primary">Stake Status</h3>
        </div>
        <p className="text-sm text-dc1-text-muted">
          Staking coming soon — stake DCP tokens to unlock higher job priority and earnings multipliers.
        </p>
      </div>
    )
  }

  const currentWei = WEI_TO_BIGINT(stakeData.stakeAmount)
  const requiredWei = WEI_TO_BIGINT(stakeData.minimumRequired)
  const shortfallWei = WEI_TO_BIGINT(stakeData.shortfall)

  const progressPct =
    requiredWei > 0n
      ? Math.min(100, Number((currentWei * 100n) / requiredWei))
      : stakeData.hasMinimumStake ? 100 : 0

  const statusColor = stakeData.hasMinimumStake
    ? 'text-status-success'
    : currentWei > 0n
    ? 'text-status-warning'
    : 'text-dc1-text-muted'

  const barColor = stakeData.hasMinimumStake
    ? 'bg-status-success'
    : currentWei > 0n
    ? 'bg-status-warning'
    : 'bg-dc1-border'

  const tierLabels: Record<number, string> = {
    0: 'Standard',
    1: 'Professional',
    2: 'Enterprise',
  }

  return (
    <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldIcon />
          <h3 className="text-sm font-semibold text-dc1-text-primary">Stake Status</h3>
        </div>
        {stakeData.gpuTier > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-dc1-surface-l2 text-dc1-text-muted border border-dc1-border">
            {tierLabels[stakeData.gpuTier] ?? `Tier ${stakeData.gpuTier}`}
          </span>
        )}
      </div>

      {/* Current stake */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-dc1-surface-l2 p-3">
          <p className="text-xs text-dc1-text-muted mb-1">Current Stake</p>
          <p className={`text-lg font-bold ${statusColor}`}>
            {WEI_TO_DISPLAY(stakeData.stakeAmount)}
          </p>
          <p className="text-xs text-dc1-text-muted">DCP tokens</p>
        </div>
        <div className="rounded-lg bg-dc1-surface-l2 p-3">
          <p className="text-xs text-dc1-text-muted mb-1">Minimum Required</p>
          <p className="text-lg font-bold text-dc1-text-primary">
            {WEI_TO_DISPLAY(stakeData.minimumRequired)}
          </p>
          <p className="text-xs text-dc1-text-muted">DCP tokens</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-dc1-text-muted mb-1.5">
          <span>Stake progress</span>
          <span className={statusColor}>{progressPct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-dc1-surface-l3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Status + shortfall */}
      {stakeData.hasMinimumStake ? (
        <div className="flex items-center gap-2 text-sm text-status-success">
          <CheckIcon />
          <span className="font-medium">Minimum stake met — full job eligibility</span>
        </div>
      ) : shortfallWei > 0n ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-sm">
          <p className="font-medium text-status-warning mb-1">Stake shortfall</p>
          <p className="text-dc1-text-secondary">
            Add <span className="font-semibold text-dc1-text-primary">
              {WEI_TO_DISPLAY(stakeData.shortfall)} DCP
            </span> to meet the minimum and unlock full job priority.
          </p>
        </div>
      ) : null}

      {/* Wallet address */}
      {stakeData.walletAddress && (
        <p className="text-xs text-dc1-text-muted font-mono truncate">
          Wallet: {stakeData.walletAddress.slice(0, 10)}…{stakeData.walletAddress.slice(-6)}
        </p>
      )}

      {/* Add Stake CTA */}
      {!stakeData.hasMinimumStake && (
        <button
          className="w-full rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 px-4 py-2.5 text-sm font-semibold text-dc1-amber hover:bg-dc1-amber/20 transition-colors min-h-[44px]"
          onClick={() => {
            // Navigate to stake interaction — wallet connect flow
            window.location.href = '/provider/stake'
          }}
        >
          Add Stake →
        </button>
      )}

      {stakeData.liveCheckPerformed && (
        <p className="text-xs text-dc1-text-muted text-right">Live chain data</p>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg className="w-4 h-4 text-dc1-amber flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
