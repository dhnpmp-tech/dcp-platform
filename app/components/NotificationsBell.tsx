'use client'

/**
 * NotificationsBell — in-dashboard bell + dropdown for renter notifications.
 *
 * Replaces per-job completion emails: the backend now persists notifications
 * in `renter_notifications` and rolls them up into a single daily digest
 * email. The bell polls every 30s for unread count + last 20 items.
 *
 * Feature-flag-safe on the backend: when notifications are disabled the
 * endpoint simply returns an empty list, so this component renders nothing
 * meaningful (badge hidden, dropdown empty) without throwing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const POLL_INTERVAL_MS = 30_000
const DROPDOWN_LIMIT = 20

interface NotificationPayload {
  job_id?: string
  model?: string
  cost_halala?: number
  cost_sar?: number
  duration_minutes?: number | null
  status?: string
  balance_halala?: number
  balance_sar?: number
  threshold_sar?: number
}

interface NotificationItem {
  id: number
  kind: string
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

interface NotificationsBellProps {
  renterKey: string | null
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function describeNotification(n: NotificationItem): { title: string; meta: string; href: string | null } {
  const payload = n.payload ?? {}
  if (n.kind === 'job_completed') {
    const model = payload.model ?? 'job'
    const sar = typeof payload.cost_sar === 'number'
      ? payload.cost_sar.toFixed(2)
      : ((Number(payload.cost_halala) || 0) / 100).toFixed(2)
    return {
      title: `${model} completed`,
      meta: `${sar} SAR`,
      href: payload.job_id ? `/dashboard/jobs?job=${encodeURIComponent(payload.job_id)}` : null,
    }
  }
  if (n.kind === 'job_failed') {
    return {
      title: `${payload.model ?? 'Job'} failed`,
      meta: payload.status ?? 'see job for details',
      href: payload.job_id ? `/dashboard/jobs?job=${encodeURIComponent(payload.job_id)}` : null,
    }
  }
  if (n.kind === 'balance_low') {
    const sar = typeof payload.balance_sar === 'number'
      ? payload.balance_sar.toFixed(2)
      : ((Number(payload.balance_halala) || 0) / 100).toFixed(2)
    return {
      title: 'Low credit',
      meta: `${sar} credit remaining`,
      href: '/renter/billing',
    }
  }
  return { title: n.kind, meta: '', href: null }
}

export default function NotificationsBell({ renterKey }: NotificationsBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!renterKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/renters/me/notifications?limit=${DROPDOWN_LIMIT}`, {
        headers: { 'X-Renter-Key': renterKey },
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as NotificationsResponse
      setItems(Array.isArray(data.items) ? data.items : [])
      setUnreadCount(Number(data.unread_count) || 0)
    } catch (_err) {
      // Non-fatal: leave previous state in place.
    } finally {
      setLoading(false)
    }
  }, [renterKey])

  // Initial fetch + polling.
  useEffect(() => {
    if (!renterKey) return
    fetchNotifications()
    const id = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchNotifications, renterKey])

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [open])

  const markRead = useCallback(async (id: number) => {
    if (!renterKey) return
    try {
      await fetch(`/api/renters/me/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'X-Renter-Key': renterKey },
      })
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (_err) {
      // ignore
    }
  }, [renterKey])

  const markAllRead = useCallback(async () => {
    if (!renterKey) return
    try {
      await fetch('/api/renters/me/notifications/read-all', {
        method: 'POST',
        headers: { 'X-Renter-Key': renterKey },
      })
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      setUnreadCount(0)
    } catch (_err) {
      // ignore
    }
  }, [renterKey])

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return null
    if (unreadCount > 99) return '99+'
    return String(unreadCount)
  }, [unreadCount])

  if (!renterKey) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={badgeLabel ? `Notifications (${badgeLabel} unread)` : 'Notifications'}
        className="relative p-2 rounded-md text-dc1-text-secondary hover:text-dc1-text-primary hover:bg-dc1-surface-l2 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
        </svg>
        {badgeLabel && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold leading-none rounded-full bg-dc1-amber text-dc1-void"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-dc1-surface-l1 border border-dc1-border rounded-lg shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-dc1-border">
            <span className="text-sm font-semibold text-dc1-text-primary">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-xs text-dc1-amber hover:underline disabled:text-dc1-text-muted disabled:no-underline disabled:cursor-not-allowed"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-dc1-border">
            {loading && items.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-dc1-text-muted">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-dc1-text-muted">No notifications yet.</div>
            )}
            {items.map((n) => {
              const { title, meta, href } = describeNotification(n)
              const isUnread = !n.read_at
              const inner = (
                <div className={`px-4 py-3 flex items-start gap-3 hover:bg-dc1-surface-l2 transition-colors ${isUnread ? 'bg-dc1-amber/[0.04]' : ''}`}>
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${isUnread ? 'bg-dc1-amber' : 'bg-transparent border border-dc1-border'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-dc1-text-primary truncate">{title}</span>
                      <span className="text-[11px] text-dc1-text-muted shrink-0">{formatRelativeTime(n.created_at)}</span>
                    </div>
                    {meta && <div className="text-xs text-dc1-text-secondary mt-0.5 truncate">{meta}</div>}
                  </div>
                </div>
              )
              return (
                <div key={n.id} onClick={() => isUnread && markRead(n.id)}>
                  {href ? (
                    <Link href={href} onClick={() => setOpen(false)}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </div>
              )
            })}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-xs text-center text-dc1-amber hover:bg-dc1-surface-l2 border-t border-dc1-border"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
