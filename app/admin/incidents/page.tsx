'use client'

/**
 * /admin/incidents — "what changed in the last N hours" timeline.
 *
 * Single-pane incident triage for the 1-3 person ops team. Unions
 * admin_audit_log + daemon_events + provider_status_log via
 * GET /api/admin/incidents/feed and renders newest-first.
 *
 * Shipped in response to the 2026-05-21 admin monitoring audit's
 * "if you have one day, build this" recommendation.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// Nav icons (copy of the rest of /admin/* so chrome stays consistent).
const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)
const ClockIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)

interface IncidentItem {
  source: 'audit' | 'daemon' | 'status'
  severity: 'info' | 'warning' | 'critical' | string
  timestamp: string
  title: string
  actor: string
  target: string | null
  provider_id: number | null
  details: string | null
  ref_id: string
}

interface IncidentsFeed {
  generated_at: string
  period_hours: number
  counts: { audit: number; daemon: number; status: number; merged: number }
  items: IncidentItem[]
}

const PERIOD_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

function formatAge(iso: string): string {
  if (!iso) return '—'
  // Backend ships two formats: ISO ("2026-05-21T07:30:00.000Z") and loose
  // ("2026-05-21 07:30:00"). Date.parse handles both for our purposes
  // because JS treats the loose form as local time — which on a UTC VPS
  // happens to be UTC. Close enough for relative-age display.
  const parsed = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  const ageSec = (Date.now() - parsed.getTime()) / 1000
  if (!Number.isFinite(ageSec) || ageSec < 0) return iso
  if (ageSec < 60) return `${Math.round(ageSec)}s ago`
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`
  if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h ago`
  return `${Math.round(ageSec / 86400)}d ago`
}

function sourceBadge(source: string): { label: string; classes: string } {
  switch (source) {
    case 'audit':
      return { label: 'audit', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    case 'daemon':
      return { label: 'daemon', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' }
    case 'status':
      return { label: 'status', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    default:
      return { label: source, classes: 'bg-dc1-border/30 text-dc1-text-secondary border-dc1-border' }
  }
}

function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500 bg-red-500/5'
    case 'warning':
      return 'border-l-yellow-500 bg-yellow-500/5'
    case 'info':
    default:
      return 'border-l-dc1-border'
  }
}

export default function AdminIncidentsPage() {
  const router = useRouter()
  const { t, dir } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [feed, setFeed] = useState<IncidentsFeed | null>(null)
  const [error, setError] = useState('')
  const [hours, setHours] = useState(24)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'audit' | 'daemon' | 'status'>('all')

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: 'Pricing', href: '/admin/pricing', icon: <CurrencyIcon /> },
    { label: 'Incidents', href: '/admin/incidents', icon: <ClockIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
  ]

  const load = useCallback(async () => {
    const token = localStorage.getItem('dc1_admin_token')
    if (!token) {
      router.push('/login')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/admin/incidents/feed?hours=${hours}&limit=200`, {
        headers: { 'x-admin-token': token },
      })
      if (res.status === 401) {
        localStorage.removeItem('dc1_admin_token')
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error(`Failed to fetch incidents (HTTP ${res.status})`)
      const data: IncidentsFeed = await res.json()
      setFeed(data)
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [router, hours])

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [load])

  const filteredItems = (feed?.items || []).filter(
    (it) => sourceFilter === 'all' || it.source === sourceFilter
  )

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-6" dir={dir}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-dc1-text-primary">Incidents</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              What changed in the last {hours}h — admin actions, daemon events, provider state transitions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                onClick={() => setHours(opt.hours)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
                  hours === opt.hours
                    ? 'border-dc1-amber/40 bg-dc1-amber/15 text-dc1-amber'
                    : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {feed && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-3">
              <p className="text-xs uppercase tracking-wide text-dc1-text-muted">Merged</p>
              <p className="font-mono text-2xl tabular-nums text-dc1-text-primary">{feed.counts.merged}</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-400">Audit</p>
              <p className="font-mono text-2xl tabular-nums text-dc1-text-primary">{feed.counts.audit}</p>
            </div>
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
              <p className="text-xs uppercase tracking-wide text-purple-400">Daemon</p>
              <p className="font-mono text-2xl tabular-nums text-dc1-text-primary">{feed.counts.daemon}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-400">Status</p>
              <p className="font-mono text-2xl tabular-nums text-dc1-text-primary">{feed.counts.status}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {(['all', 'audit', 'daemon', 'status'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1 rounded-full border ${
                sourceFilter === s
                  ? 'border-dc1-amber bg-dc1-amber/15 text-dc1-amber'
                  : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary'
              }`}
            >
              {s === 'all' ? 'All sources' : s}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && !feed ? (
          <div className="text-dc1-text-secondary">Loading…</div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-6 text-center text-sm text-dc1-text-secondary">
            No events in the selected window.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const sb = sourceBadge(item.source)
              return (
                <div
                  key={item.ref_id}
                  className={`rounded-lg border border-dc1-border bg-dc1-surface-l1 border-l-4 ${severityClasses(item.severity)} p-3`}
                >
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sb.classes}`}>
                        {sb.label}
                      </span>
                      {item.severity !== 'info' && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          item.severity === 'critical'
                            ? 'bg-red-500/15 text-red-400'
                            : item.severity === 'warning'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : 'bg-dc1-border/30 text-dc1-text-secondary'
                        }`}>
                          {item.severity}
                        </span>
                      )}
                      <span className="font-mono text-sm text-dc1-text-primary truncate">{item.title}</span>
                      {item.target && (
                        <span className="text-xs text-dc1-text-muted">→ {item.target}</span>
                      )}
                      {item.provider_id != null && item.source !== 'status' && (
                        <span className="text-xs text-dc1-text-muted">[provider#{item.provider_id}]</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-dc1-text-secondary shrink-0">
                      <span title={item.timestamp}>{formatAge(item.timestamp)}</span>
                      <span className="text-dc1-text-muted">{item.actor}</span>
                    </div>
                  </div>
                  {item.details && (
                    <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-dc1-surface-l2 p-2 text-[11px] text-dc1-text-secondary whitespace-pre-wrap">
                      {item.details}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {feed && (
          <p className="text-xs text-dc1-text-muted">
            Generated {new Date(feed.generated_at).toLocaleTimeString()} · refreshes every 30 s ·
            bandwidth_* daemon events filtered as noise.
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}
