'use client'

/**
 * Full notifications list. Backed by /api/renters/me/notifications. Replaces
 * per-job completion emails — see backend/src/services/notificationsV2.js.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import DashboardLayout from '../../components/layout/DashboardLayout'

const API_BASE = '/api'
const FETCH_LIMIT = 100

type NotificationKind = 'job_completed' | 'job_failed' | 'balance_low' | string
type ReadFilter = 'all' | 'unread' | 'read'

interface NotificationPayload {
  job_id?: string
  model?: string
  cost_halala?: number
  cost_sar?: number
  duration_minutes?: number | null
  status?: string
  balance_halala?: number
  balance_sar?: number
}

interface NotificationItem {
  id: number
  kind: NotificationKind
  job_id: number | null
  payload: NotificationPayload | null
  read_at: string | null
  created_at: string
}

interface NotificationsResponse {
  items: NotificationItem[]
  total: number
  unread_count: number
}

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describe(n: NotificationItem): { title: string; meta: string; href: string | null; tone: 'success' | 'warn' | 'info' } {
  const payload = n.payload ?? {}
  if (n.kind === 'job_completed') {
    const model = payload.model ?? 'Job'
    const sar = typeof payload.cost_sar === 'number'
      ? payload.cost_sar.toFixed(2)
      : ((Number(payload.cost_halala) || 0) / 100).toFixed(2)
    return {
      title: `${model} completed`,
      meta: `${sar} SAR`,
      href: payload.job_id ? `/dashboard/jobs?job=${encodeURIComponent(payload.job_id)}` : null,
      tone: 'success',
    }
  }
  if (n.kind === 'job_failed') {
    return {
      title: `${payload.model ?? 'Job'} failed`,
      meta: payload.status ?? 'see job for details',
      href: payload.job_id ? `/dashboard/jobs?job=${encodeURIComponent(payload.job_id)}` : null,
      tone: 'warn',
    }
  }
  if (n.kind === 'balance_low') {
    const sar = typeof payload.balance_sar === 'number'
      ? payload.balance_sar.toFixed(2)
      : ((Number(payload.balance_halala) || 0) / 100).toFixed(2)
    return {
      title: 'Low balance',
      meta: `${sar} SAR remaining — top up to keep jobs running`,
      href: '/renter/billing',
      tone: 'warn',
    }
  }
  return { title: n.kind, meta: '', href: null, tone: 'info' }
}

export default function NotificationsPage() {
  const router = useRouter()
  const [renterKey, setRenterKey] = useState('')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [kindFilter, setKindFilter] = useState<'all' | NotificationKind>('all')

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: <HomeIcon /> },
    { label: 'Marketplace', href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Playground', href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: 'Jobs', href: '/dashboard/jobs', icon: <JobsIcon /> },
    { label: 'Notifications', href: '/dashboard/notifications', icon: <BellIcon /> },
    { label: 'Billing', href: '/renter/billing', icon: <BillingIcon /> },
    { label: 'Analytics', href: '/renter/analytics', icon: <ChartIcon /> },
    { label: 'Settings', href: '/renter/settings', icon: <GearIcon /> },
  ]

  const fetchData = useCallback(async (key: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/renters/me/notifications?limit=${FETCH_LIMIT}`, {
        headers: { 'X-Renter-Key': key },
        cache: 'no-store',
      })
      if (res.status === 401 || res.status === 404) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (res.ok) {
        const data = (await res.json()) as NotificationsResponse
        setItems(Array.isArray(data.items) ? data.items : [])
        setUnreadCount(Number(data.unread_count) || 0)
      }
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [router])

  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) { router.push('/login'); return }
    setRenterKey(key)
    fetchData(key)
  }, [fetchData, router])

  const markRead = useCallback(async (id: number) => {
    if (!renterKey) return
    try {
      await fetch(`${API_BASE}/renters/me/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'X-Renter-Key': renterKey },
      })
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch { /* non-fatal */ }
  }, [renterKey])

  const markAllRead = useCallback(async () => {
    if (!renterKey) return
    try {
      await fetch(`${API_BASE}/renters/me/notifications/read-all`, {
        method: 'POST',
        headers: { 'X-Renter-Key': renterKey },
      })
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      setUnreadCount(0)
    } catch { /* non-fatal */ }
  }, [renterKey])

  const kinds = useMemo(() => {
    const set = new Set<NotificationKind>()
    for (const n of items) set.add(n.kind)
    return Array.from(set)
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (readFilter === 'unread' && n.read_at) return false
      if (readFilter === 'read' && !n.read_at) return false
      if (kindFilter !== 'all' && n.kind !== kindFilter) return false
      return true
    })
  }, [items, readFilter, kindFilter])

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">Notifications</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">
              In-dashboard updates for your jobs and account. {unreadCount > 0 && <span className="text-dc1-amber">{unreadCount} unread.</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="btn btn-secondary text-sm py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark all read
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {(['all', 'unread', 'read'] as ReadFilter[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setReadFilter(opt)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                readFilter === opt
                  ? 'bg-dc1-amber/15 text-dc1-amber border-dc1-amber/40'
                  : 'text-dc1-text-secondary border-dc1-border hover:bg-dc1-surface-l2'
              }`}
            >
              {opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
          {kinds.length > 1 && (
            <>
              <span className="text-dc1-text-muted text-xs">·</span>
              <button
                type="button"
                onClick={() => setKindFilter('all')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  kindFilter === 'all'
                    ? 'bg-dc1-amber/15 text-dc1-amber border-dc1-amber/40'
                    : 'text-dc1-text-secondary border-dc1-border hover:bg-dc1-surface-l2'
                }`}
              >
                All kinds
              </button>
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    kindFilter === k
                      ? 'bg-dc1-amber/15 text-dc1-amber border-dc1-amber/40'
                      : 'text-dc1-text-secondary border-dc1-border hover:bg-dc1-surface-l2'
                  }`}
                >
                  {k}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="card divide-y divide-dc1-border overflow-hidden">
          {loading && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-dc1-text-muted">Loading notifications…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-dc1-text-muted">
              No notifications match the current filter.
            </div>
          )}
          {filtered.map((n) => {
            const { title, meta, href, tone } = describe(n)
            const isUnread = !n.read_at
            const dotClass =
              tone === 'success' ? 'bg-status-success' :
              tone === 'warn' ? 'bg-dc1-amber' :
              'bg-dc1-text-muted'
            const inner = (
              <div className={`px-4 py-4 flex items-start gap-3 hover:bg-dc1-surface-l2 transition-colors ${isUnread ? 'bg-dc1-amber/[0.04]' : ''}`}>
                <span aria-hidden="true" className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${dotClass}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-dc1-text-primary truncate">{title}</span>
                    <span className="text-xs text-dc1-text-muted shrink-0">{formatDateTime(n.created_at)}</span>
                  </div>
                  {meta && <div className="text-xs text-dc1-text-secondary mt-1">{meta}</div>}
                  <div className="text-[11px] text-dc1-text-muted mt-1 uppercase tracking-wider">{n.kind}</div>
                </div>
              </div>
            )
            return (
              <div key={n.id} onClick={() => isUnread && markRead(n.id)}>
                {href ? <Link href={href}>{inner}</Link> : inner}
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
