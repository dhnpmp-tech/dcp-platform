'use client'

import Link from 'next/link'
import type { DailySpend } from './SpendingChart'

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(2)
}

interface SpendingAnalyticsCardProps {
  balanceHalala: number
  monthSpendHalala: number
  dailySpend: DailySpend[]
}

export default function SpendingAnalyticsCard({
  balanceHalala,
  monthSpendHalala,
  dailySpend,
}: SpendingAnalyticsCardProps) {
  const isLow = balanceHalala < 1000
  const isCritical = balanceHalala < 200
  const balanceColor = isCritical
    ? 'text-status-error'
    : isLow
    ? 'text-status-warning'
    : 'text-dc1-amber'

  // Build last-7-days chart data
  const today = new Date()
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const iso = d.toISOString().slice(0, 10)
    const found = dailySpend.find(r => r.day === iso)
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      total_halala: found?.total_halala ?? 0,
    }
  })

  const maxVal = Math.max(...chartData.map(d => d.total_halala), 1)
  const hasSpend = chartData.some(d => d.total_halala > 0)

  return (
    <div className="card p-5 flex flex-col gap-5">

      {/* Month spend + credit row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-dc1-text-muted uppercase tracking-wide mb-1">This Month</p>
          <p className="text-2xl font-bold text-dc1-text-primary">
            {formatSAR(monthSpendHalala)}{' '}
            <span className="text-sm font-medium text-dc1-text-secondary">SAR</span>
          </p>
          <p className="text-xs text-dc1-text-muted mt-0.5">
            {monthSpendHalala.toLocaleString()} halala
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-dc1-text-muted uppercase tracking-wide mb-1">Credit</p>
          <p className={`text-xl font-bold ${balanceColor}`}>
            {formatSAR(balanceHalala)}{' '}
            <span className="text-sm font-medium">credit</span>
          </p>
          {isCritical && (
            <p className="text-xs text-status-error mt-0.5">Critical credit - add credit now</p>
          )}
          {isLow && !isCritical && (
            <p className="text-xs text-status-warning mt-0.5">Low credit</p>
          )}
        </div>
      </div>

      {/* 7-day CSS bar chart */}
      <div>
        <p className="text-xs text-dc1-text-muted mb-2">Spend — last 7 days</p>
        {!hasSpend ? (
          <div className="flex items-center justify-center h-14 text-dc1-text-muted text-xs">
            No spend this week.
          </div>
        ) : (
          <div
            className="flex items-end gap-1"
            style={{ height: 64 }}
            role="img"
            aria-label="7-day spending bar chart"
          >
            {chartData.map((d, i) => {
              const barH = d.total_halala > 0
                ? Math.max(4, (d.total_halala / maxVal) * 44)
                : 2
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end gap-0.5 group"
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      d.total_halala > 0
                        ? 'bg-amber-400 group-hover:bg-amber-300'
                        : 'bg-dc1-surface-l3'
                    }`}
                    style={{ height: barH }}
                    title={`${d.label}: ${formatSAR(d.total_halala)} SAR`}
                  />
                  <span className="text-[9px] text-dc1-text-muted">{d.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top-up CTA */}
      <Link
        href="/renter/billing"
        className="btn btn-primary text-sm py-2 flex items-center justify-center gap-2 w-full"
        aria-label="Add account credit"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Credit
      </Link>
    </div>
  )
}
