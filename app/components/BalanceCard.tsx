'use client'

import Link from 'next/link'

const SAR_TO_USD = 1 / 3.75

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(2)
}

function formatUSD(halala: number): string {
  return ((halala / 100) * SAR_TO_USD).toFixed(2)
}

interface BalanceCardProps {
  balanceHalala: number
  totalSpentHalala: number
}

export default function BalanceCard({ balanceHalala, totalSpentHalala }: BalanceCardProps) {
  const isLow = balanceHalala < 1000
  const isCritical = balanceHalala < 200

  const borderClass = isCritical
    ? 'border-status-error/50'
    : isLow
    ? 'border-status-warning/50'
    : 'border-dc1-border hover:border-dc1-border-light'

  const balanceColor = isCritical
    ? 'text-status-error'
    : isLow
    ? 'text-status-warning'
    : 'text-dc1-amber'

  return (
    <div className={`bg-dc1-surface-l1 border rounded-lg p-6 transition-all ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-dc1-text-secondary mb-1">Available Credit</p>
          <p className={`text-3xl font-bold ${balanceColor}`}>
            {formatSAR(balanceHalala)} <span className="text-lg font-semibold">credit</span>
          </p>
          <p className="text-sm text-dc1-text-muted mt-0.5">≈ ${formatUSD(balanceHalala)} USD</p>
          {isLow && (
            <p className={`text-xs mt-1.5 ${isCritical ? 'text-status-error' : 'text-status-warning'}`}>
              {isCritical ? 'Critical: credit very low' : 'Credit running low - add credit soon'}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-dc1-text-secondary mb-1">Total Spent</p>
          <p className="text-xl font-semibold text-dc1-text-primary">{formatSAR(totalSpentHalala)} SAR</p>
          <p className="text-sm text-dc1-text-muted mt-0.5">≈ ${formatUSD(totalSpentHalala)} USD</p>
        </div>
      </div>
      <div className="mt-5">
        <Link
          href="/renter/billing"
          className="btn btn-primary inline-flex items-center gap-2 text-sm py-2 px-4"
          aria-label="Add account credit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Credit
        </Link>
      </div>
    </div>
  )
}
