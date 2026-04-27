'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: <HomeIcon /> },
  { label: 'Providers', href: '/admin/providers', icon: <ServerIcon /> },
  { label: 'Renters', href: '/admin/renters', icon: <UsersIcon /> },
  { label: 'Jobs', href: '/admin/jobs', icon: <BriefcaseIcon /> },
  { label: 'Finance', href: '/admin/finance', icon: <CurrencyIcon /> },
  { label: 'Withdrawals', href: '/admin/withdrawals', icon: <WalletIcon /> },
  { label: 'Security', href: '/admin/security', icon: <ShieldIcon /> },
  { label: 'Fleet Health', href: '/admin/fleet', icon: <CpuIcon /> },
  { label: 'Containers', href: '/admin/containers', icon: <ContainerIcon /> },
]

export default function ProvidersPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<any | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [gpuFilter, setGpuFilter] = useState('all')
  const [fetchError, setFetchError] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchProviders = useCallback(async () => {
    setFetchError(false)
    try {
      const res = await fetch(`${API_BASE}/admin/providers`, { headers: { 'x-admin-token': token! } })
      if (res.status === 401) { localStorage.removeItem('dc1_admin_token'); router.push('/login'); return }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error(err)
      setFetchError(true)
    } finally { setLoading(false) }
  }, [router, token])

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    fetchProviders()
    const interval = setInterval(fetchProviders, 30000)
    return () => clearInterval(interval)
  }, [fetchProviders, router, token])

  const handleSuspend = async (id: number, action: 'suspend' | 'unsuspend') => {
    setActionLoading(id)
    try {
      await fetch(`${API_BASE}/admin/providers/${id}/${action}`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
      })
      await fetchProviders()
    } catch (err) { console.error(err) }
    finally { setActionLoading(null) }
  }

  // Unified activate/deactivate via PATCH /api/admin/providers/:id/status
  const handleSetStatus = async (id: number, status: 'active' | 'suspended') => {
    setActionLoading(id)
    try {
      await fetch(`${API_BASE}/admin/providers/${id}/status`, {
        method: 'PATCH',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchProviders()
    } catch (err) { console.error(err) }
    finally { setActionLoading(null) }
  }

  const handleApproval = async (id: number, action: 'approve' | 'reject', reason?: string) => {
    setActionLoading(id)
    try {
      const payload = action === 'reject' ? { reason } : {}
      await fetch(`${API_BASE}/admin/providers/${id}/${action}`, {
        method: 'PATCH',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await fetchProviders()
    } catch (err) { console.error(err) }
    finally { setActionLoading(null) }
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p: any) => p.id)))
    }
  }

  const handleBulkAction = async (action: 'suspend' | 'unsuspend') => {
    if (selected.size === 0) return
    setBulkLoading(true)
    try {
      await fetch(`${API_BASE}/admin/bulk/providers`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      })
      setSelected(new Set())
      await fetchProviders()
    } catch (err) { console.error(err) }
    finally { setBulkLoading(false) }
  }

  const providers = data?.providers || []
  const filtered = providers.filter((p: any) => {
    if (filter === 'online' && !p.is_online) return false
    if (filter === 'offline' && (p.is_online || !p.last_heartbeat)) return false
    if (filter === 'suspended' && p.status !== 'suspended') return false
    if (filter === 'pending_approval' && (p.approval_status || 'pending') !== 'pending') return false
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase()) && !p.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const gpuModels = Array.from(new Set(providers.map((p: any) => p.gpu_model).filter(Boolean))) as string[]

  const formatTime = (iso: string) => {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString() + ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">Provider Management</h1>
        <p className="text-dc1-text-secondary">
          {data ? `${data.total} total — ${data.online} online, ${data.offline} offline, ${data.pending_approval || 0} pending approval` : 'Loading...'}
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by name or email..."
              className="input flex-1"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {['all', 'pending_approval', 'online', 'offline', 'suspended'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-dc1-amber text-black'
                      : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                  }`}
                >
                  {f === 'pending_approval' ? 'Pending Approval' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {gpuModels.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-dc1-text-muted">GPU model:</span>
              <button
                onClick={() => setGpuFilter('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${gpuFilter === 'all' ? 'bg-dc1-amber text-black' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'}`}
              >
                All
              </button>
              {gpuModels.map((model: string) => (
                <button
                  key={model}
                  onClick={() => setGpuFilter(model)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${gpuFilter === model ? 'bg-dc1-amber text-black' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'}`}
                >
                  {model}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="card mb-4 flex items-center justify-between">
          <span className="text-sm text-dc1-text-primary font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => handleBulkAction('suspend')} disabled={bulkLoading}
              className="text-xs px-3 py-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 font-medium">
              {bulkLoading ? 'Processing...' : 'Bulk Suspend'}
            </button>
            <button onClick={() => handleBulkAction('unsuspend')} disabled={bulkLoading}
              className="text-xs px-3 py-1.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 font-medium">
              {bulkLoading ? 'Processing...' : 'Bulk Reactivate'}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-1.5 rounded bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary font-medium">
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-dc1-surface-l2 rounded-lg h-14 border border-dc1-border" />
          ))}
        </div>
      ) : fetchError ? (
        <div className="text-center py-16 card">
          <p className="text-dc1-text-secondary mb-4">Could not load providers. Check your connection or admin credentials.</p>
          <button onClick={fetchProviders} className="btn btn-secondary btn-sm">
            Retry
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll} className="rounded border-dc1-border" />
                  </th>
                  <th>Provider</th>
                  <th>GPU</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Uptime 24h</th>
                  <th>Jobs</th>
                  <th>Earnings</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => (
                  <tr key={p.id} className={selected.has(p.id) ? 'bg-dc1-amber/5' : ''}>
                    <td className="w-10">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                        className="rounded border-dc1-border" />
                    </td>
                    <td>
                      <Link href={`/admin/providers/${p.id}`} className="text-dc1-amber hover:underline font-medium">
                        {p.name}
                      </Link>
                      <div className="text-xs text-dc1-text-muted">{p.email}</div>
                    </td>
                    <td className="text-sm text-dc1-amber">{p.gpu_model || p.gpu_name_detected || '—'}</td>
                    <td>
                      <StatusBadge status={p.status === 'suspended' ? 'warning' : p.is_online ? 'online' : 'offline'}
                        label={p.status === 'suspended' ? 'Suspended' : p.is_online ? 'Online' : p.last_heartbeat ? 'Offline' : 'Registered'} />
                    </td>
                    <td>
                      {(p.approval_status || 'pending') === 'approved' && (
                        <span className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-300 border border-green-600/30">Approved</span>
                      )}
                      {(p.approval_status || 'pending') === 'pending' && (
                        <span className="text-xs px-2 py-1 rounded bg-amber-600/20 text-amber-300 border border-amber-600/30">Pending</span>
                      )}
                      {(p.approval_status || 'pending') === 'rejected' && (
                        <span className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-300 border border-red-600/30" title={p.rejected_reason || ''}>
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="text-sm">{p.uptime_24h !== null ? `${p.uptime_24h}%` : '—'}</td>
                    <td className="text-sm">{p.total_jobs || 0}</td>
                    <td className="text-sm">{p.total_earnings ? `${(p.total_earnings / 100).toFixed(2)} SAR` : '—'}</td>
                    <td className="text-xs text-dc1-text-secondary">{p.minutes_since_heartbeat !== null ? `${p.minutes_since_heartbeat}m ago` : 'Never'}</td>
                    <td>
                      <div className="flex gap-1.5 items-center flex-wrap">
                        {(p.approval_status || 'pending') === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproval(p.id, 'approve')}
                              disabled={actionLoading === p.id}
                              className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-300 hover:bg-green-600/30 disabled:opacity-50"
                            >
                              {actionLoading === p.id ? '...' : t('admin.approve')}
                            </button>
                            <button
                              onClick={() => { setRejectTarget(p); setRejectReason('') }}
                              disabled={actionLoading === p.id}
                              className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/30 disabled:opacity-50"
                            >
                              {t('admin.reject')}
                            </button>
                          </>
                        )}
                        {/* One-click activate / deactivate via PATCH /status */}
                        {p.status === 'suspended' ? (
                          <button
                            onClick={() => handleSetStatus(p.id, 'active')}
                            disabled={actionLoading === p.id}
                            title="Activate provider — clears suspension and marks as available"
                            className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 font-medium"
                          >
                            {actionLoading === p.id ? '...' : 'Activate'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSetStatus(p.id, 'suspended')}
                            disabled={actionLoading === p.id}
                            title="Deactivate provider — suspends from job pool"
                            className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                          >
                            {actionLoading === p.id ? '...' : 'Deactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-dc1-text-muted text-sm text-center">No providers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
            <h2 className="text-lg font-semibold text-dc1-text-primary mb-2">{t('admin.reject')} Provider</h2>
            <p className="text-sm text-dc1-text-secondary mb-4">
              Enter rejection reason for <span className="text-dc1-text-primary font-medium">{rejectTarget.name}</span>.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="input w-full mb-4"
              placeholder="Reason is required"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason('') }}
                className="px-3 py-2 rounded bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const reason = rejectReason.trim()
                  if (!reason) return
                  await handleApproval(rejectTarget.id, 'reject', reason)
                  setRejectTarget(null)
                  setRejectReason('')
                }}
                disabled={!rejectReason.trim() || actionLoading === rejectTarget.id}
                className="px-3 py-2 rounded bg-red-600/20 text-red-300 hover:bg-red-600/30 disabled:opacity-50 text-sm"
              >
                {actionLoading === rejectTarget.id ? '...' : t('admin.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
