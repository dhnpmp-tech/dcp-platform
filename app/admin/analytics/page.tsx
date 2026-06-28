'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'

const API_BASE = '/api'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: <span className="w-5 h-5 text-center">⌂</span> },
  { label: 'Providers', href: '/admin/providers', icon: <span className="w-5 h-5 text-center">⬡</span> },
  { label: 'Renters', href: '/admin/renters', icon: <span className="w-5 h-5 text-center">👥</span> },
  { label: 'Jobs', href: '/admin/jobs', icon: <span className="w-5 h-5 text-center">⚡</span> },
  { label: 'Metrics', href: '/admin/metrics', icon: <span className="w-5 h-5 text-center">📊</span> },
  { label: 'Analytics', href: '/admin/analytics', icon: <span className="w-5 h-5 text-center">📈</span> },
  { label: 'Finance', href: '/admin/finance', icon: <span className="w-5 h-5 text-center">💰</span> },
  { label: 'Security', href: '/admin/security', icon: <span className="w-5 h-5 text-center">🔒</span> },
]

interface MetricRow {
  x: string | null
  y: number
}

interface Analytics {
  range_days: number
  stats: {
    visitors: number
    pageviews: number
    visits: number
    avg_duration_seconds: number
    bounce_rate_pct: number
    active_visitors: number
  }
  sources: MetricRow[]
  top_pages: MetricRow[]
  countries: MetricRow[]
  browsers: MetricRow[]
  dashboard_url: string
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function labelOf(row: MetricRow): string {
  if (!row.x) return '(direct / none)'
  return row.x
}

function BreakdownList({ title, rows, total }: { title: string; rows: MetricRow[]; total: number }) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">{title}</h2>
      <div className="rounded-lg border border-dc1-border divide-y divide-dc1-border">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-dc1-text-muted text-center">No data yet</div>
        ) : (
          rows.map((row, i) => {
            const pct = total > 0 ? Math.round((row.y / total) * 100) : 0
            return (
              <div key={i} className="relative flex items-center justify-between px-4 py-3">
                <div
                  className="absolute inset-y-0 left-0 bg-dc1-accent/10"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative z-10 truncate text-sm text-dc1-text-primary">{labelOf(row)}</span>
                <span className="relative z-10 ml-3 shrink-0 text-sm font-medium text-dc1-text-secondary">
                  {row.y.toLocaleString()} <span className="text-dc1-text-muted">({pct}%)</span>
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState<'24h' | '30d'>('30d')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/analytics?range=${range === '24h' ? '24h' : '30d'}`, {
        headers: { 'x-admin-token': token! },
      })
      if (res.status === 401) {
        localStorage.removeItem('dc1_admin_token')
        router.push('/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to fetch analytics')
      }
      setData(await res.json())
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [token, router, range])

  useEffect(() => {
    if (!token) {
      router.push('/login')
      return
    }
    fetchAnalytics()
    const interval = setInterval(fetchAnalytics, 30_000)
    return () => clearInterval(interval)
  }, [fetchAnalytics, token, router])

  const visits = data?.stats.visits ?? 0

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary">Web Analytics</h1>
          <p className="mt-1 text-dc1-text-secondary">
            Visitor traffic, sources &amp; behaviour — self-hosted, in-Kingdom (Umami)
            {lastUpdated && (
              <span className="ml-2 text-xs text-dc1-text-muted">
                (updated {lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-dc1-border overflow-hidden">
            {(['24h', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-2 text-sm transition-colors ${
                  range === r
                    ? 'bg-dc1-accent/15 text-dc1-text-primary'
                    : 'text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {r === '24h' ? 'Last 24h' : 'Last 30d'}
              </button>
            ))}
          </div>
          {data?.dashboard_url && (
            <a
              href={data.dashboard_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-dc1-border px-4 py-2 text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
            >
              Full dashboard ↗
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-status-error bg-status-error-bg p-4 text-sm text-status-error">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-dc1-text-muted">Loading analytics…</div>
      ) : data ? (
        <div className="space-y-8">
          <section>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Visitors" value={data.stats.visitors.toLocaleString()} accent="default" />
              <StatCard label="Page Views" value={data.stats.pageviews.toLocaleString()} accent="default" />
              <StatCard label="Visits" value={data.stats.visits.toLocaleString()} accent="default" />
              <StatCard label="Avg Duration" value={formatDuration(data.stats.avg_duration_seconds)} accent="default" />
              <StatCard label="Bounce Rate" value={`${data.stats.bounce_rate_pct}%`} accent="default" />
              <StatCard label="Active Now" value={data.stats.active_visitors.toLocaleString()} accent="success" />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <BreakdownList title="Traffic Sources" rows={data.sources} total={visits} />
            <BreakdownList title="Top Pages" rows={data.top_pages} total={data.stats.pageviews} />
            <BreakdownList title="Countries" rows={data.countries} total={visits} />
            <BreakdownList title="Browsers" rows={data.browsers} total={visits} />
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  )
}
