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

interface Metrics {
  queue: {
    pending_jobs: number
    running_jobs: number
    failed_last_1h: number
    avg_wait_seconds: number
  }
  providers: {
    online: number
    total_registered: number
    pending_approval: number
    avg_heartbeat_age_seconds: number
  }
  renters: {
    total_registered: number
    active_last_24h: number
    total_balance_halala: number
  }
  revenue: {
    today_halala: number
    this_week_halala: number
    this_month_halala: number
  }
  system: {
    uptime_seconds: number
    db_size_bytes: number
    node_version: string
  }
}

function formatSAR(halala: number) {
  return `${(halala / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR`
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number) {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

export default function AdminMetricsPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/metrics`, {
        headers: { 'x-admin-token': token! },
      })
      if (res.status === 401) {
        localStorage.removeItem('dc1_admin_token')
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch metrics')
      const data = await res.json()
      setMetrics(data)
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }, [token, router])

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 10_000)
    return () => clearInterval(interval)
  }, [fetchMetrics, token, router])

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary">Platform Metrics</h1>
          <p className="mt-1 text-dc1-text-secondary">
            Live operational data — refreshes every 10 seconds
            {lastUpdated && (
              <span className="ml-2 text-xs text-dc1-text-muted">
                (last updated {lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="rounded-lg border border-dc1-border px-4 py-2 text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-status-error bg-status-error-bg p-4 text-sm text-status-error">
          {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="flex items-center justify-center py-20 text-dc1-text-muted">
          Loading metrics...
        </div>
      ) : metrics ? (
        <div className="space-y-8">

          {/* Provider stats */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">
              Providers
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Online Now"
                value={String(metrics.providers.online)}
              />
              <StatCard
                label="Total Registered"
                value={String(metrics.providers.total_registered)}
              />
              <StatCard
                label="Pending Approval"
                value={String(metrics.providers.pending_approval)}
              />
              <StatCard
                label="Avg Heartbeat Age"
                value={metrics.providers.avg_heartbeat_age_seconds != null
                  ? `${Math.round(metrics.providers.avg_heartbeat_age_seconds)}s`
                  : '—'}
              />
            </div>
          </section>

          {/* Job queue */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">
              Job Queue
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Pending"
                value={String(metrics.queue.pending_jobs)}
              />
              <StatCard
                label="Running"
                value={String(metrics.queue.running_jobs)}
              />
              <StatCard
                label="Failed (last 1h)"
                value={String(metrics.queue.failed_last_1h)}
              />
              <StatCard
                label="Avg Wait"
                value={metrics.queue.avg_wait_seconds != null
                  ? `${Math.round(metrics.queue.avg_wait_seconds)}s`
                  : '—'}
              />
            </div>
          </section>

          {/* Renters */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">
              Renters
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard
                label="Total Registered"
                value={String(metrics.renters.total_registered)}
              />
              <StatCard
                label="Active (24h)"
                value={String(metrics.renters.active_last_24h)}
              />
              <StatCard
                label="Total Balance"
                value={formatSAR(metrics.renters.total_balance_halala)}
              />
            </div>
          </section>

          {/* Revenue */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">
              Revenue
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard
                label="Today"
                value={formatSAR(metrics.revenue.today_halala)}
              />
              <StatCard
                label="This Week"
                value={formatSAR(metrics.revenue.this_week_halala)}
              />
              <StatCard
                label="This Month"
                value={formatSAR(metrics.revenue.this_month_halala)}
              />
            </div>
          </section>

          {/* System */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-dc1-text-muted">
              System
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard
                label="Uptime"
                value={formatUptime(metrics.system.uptime_seconds)}
              />
              <StatCard
                label="DB Size"
                value={formatBytes(metrics.system.db_size_bytes)}
              />
              <StatCard
                label="Node Version"
                value={metrics.system.node_version || '—'}
              />
            </div>
          </section>

        </div>
      ) : null}
    </DashboardLayout>
  )
}
