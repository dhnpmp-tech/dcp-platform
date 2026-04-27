'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

export default function RentersPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [creditModal, setCreditModal] = useState<{ id: number; name: string } | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditToast, setCreditToast] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkCreditModal, setBulkCreditModal] = useState(false)
  const [bulkCreditAmount, setBulkCreditAmount] = useState('')
  const [bulkCreditReason, setBulkCreditReason] = useState('')

  const navItems = useMemo(() => ([
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
  ]), [t])

  const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null

  const fetchRenters = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/renters`, { headers: { 'x-admin-token': token! } })
      if (res.status === 401) { localStorage.removeItem('dc1_admin_token'); router.push('/login'); return }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }, [router, token])

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    fetchRenters()
    const interval = setInterval(fetchRenters, 30000)
    return () => clearInterval(interval)
  }, [fetchRenters, router, token])

  useEffect(() => {
    if (!creditToast) return
    const timer = setTimeout(() => setCreditToast(null), 5000)
    return () => clearTimeout(timer)
  }, [creditToast])

  const handleSuspend = async (id: number, action: 'suspend' | 'unsuspend') => {
    setActionLoading(id)
    try {
      await fetch(`${API_BASE}/admin/renters/${id}/${action}`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
      })
      await fetchRenters()
    } catch (err) { console.error(err) }
    finally { setActionLoading(null) }
  }

  const handleCredit = async () => {
    if (!creditModal || !creditAmount || !creditReason) return
    setCreditLoading(true)
    try {
      const amountHalala = Math.round(parseFloat(creditAmount) * 100)
      const res = await fetch(`${API_BASE}/admin/renters/${creditModal.id}/credit`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_halala: amountHalala, reason: creditReason }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || t('admin.renters.failed_grant_credits'))
      }
      setCreditModal(null)
      setCreditAmount('')
      setCreditReason('')
      setCreditToast(`${t('admin.renters.credits_granted_to')} ${creditModal.name}.`)
      await fetchRenters()
    } catch (err: any) {
      console.error(err)
      setCreditToast(err?.message || t('admin.renters.failed_grant_credits'))
    }
    finally { setCreditLoading(false) }
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
      setSelected(new Set(filtered.map((r: any) => r.id)))
    }
  }

  const handleBulkAction = async (action: 'suspend' | 'unsuspend' | 'credit') => {
    if (selected.size === 0) return
    if (action === 'credit') { setBulkCreditModal(true); return }
    setBulkLoading(true)
    try {
      await fetch(`${API_BASE}/admin/bulk/renters`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      })
      setSelected(new Set())
      await fetchRenters()
    } catch (err) { console.error(err) }
    finally { setBulkLoading(false) }
  }

  const handleBulkCredit = async () => {
    if (!bulkCreditAmount || !bulkCreditReason) return
    setBulkLoading(true)
    try {
      const amountHalala = Math.round(parseFloat(bulkCreditAmount) * 100)
      await fetch(`${API_BASE}/admin/bulk/renters`, {
        method: 'POST',
        headers: { 'x-admin-token': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action: 'credit', amount_halala: amountHalala, reason: bulkCreditReason }),
      })
      setSelected(new Set())
      setBulkCreditModal(false)
      setBulkCreditAmount('')
      setBulkCreditReason('')
      await fetchRenters()
    } catch (err) { console.error(err) }
    finally { setBulkLoading(false) }
  }

  const renters = data?.renters || []
  const now = Date.now()
  const MS_7D = 7 * 24 * 60 * 60 * 1000
  const MS_30D = 30 * 24 * 60 * 60 * 1000

  const filtered = renters.filter((r: any) => {
    if (filter === 'active' && r.status !== 'active') return false
    if (filter === 'suspended' && r.status !== 'suspended') return false
    if (filter === 'active_7d') {
      const last = r.last_active_at || r.updated_at
      if (!last || now - new Date(last).getTime() > MS_7D) return false
    }
    if (filter === 'active_30d') {
      const last = r.last_active_at || r.updated_at
      if (!last || now - new Date(last).getTime() > MS_30D) return false
    }
    if (filter === 'churned') {
      const last = r.last_active_at || r.updated_at
      if (last && now - new Date(last).getTime() <= MS_30D) return false
    }
    if (search && !r.name?.toLowerCase().includes(search.toLowerCase()) && !r.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{t('admin.renters.title')}</h1>
        <p className="text-dc1-text-secondary">
          {data ? `${data.total} ${t('marketplace.total')} — ${data.active} ${t('admin.renters.active')}, ${data.suspended} ${t('admin.renters.suspended')}` : t('common.loading')}
        </p>
        {creditToast && (
          <div className="mt-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">
            {creditToast}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder={t('admin.renters.search_placeholder')}
            className="input flex-1"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'active_7d', label: 'Active 7d' },
              { key: 'active_30d', label: 'Active 30d' },
              { key: 'churned', label: 'Churned' },
              { key: 'suspended', label: 'Suspended' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filter === key
                    ? 'bg-dc1-amber text-black'
                    : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="card mb-4 flex items-center justify-between">
          <span className="text-sm text-dc1-text-primary font-medium">{selected.size} {t('admin.renters.selected')}</span>
          <div className="flex gap-2">
            <button onClick={() => handleBulkAction('credit')} disabled={bulkLoading}
              className="text-xs px-3 py-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 font-medium">
              {t('admin.renters.bulk_credit')}
            </button>
            <button onClick={() => handleBulkAction('suspend')} disabled={bulkLoading}
              className="text-xs px-3 py-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 font-medium">
              {bulkLoading ? t('admin.renters.processing') : t('admin.renters.bulk_suspend')}
            </button>
            <button onClick={() => handleBulkAction('unsuspend')} disabled={bulkLoading}
              className="text-xs px-3 py-1.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 font-medium">
              {bulkLoading ? t('admin.renters.processing') : t('admin.renters.bulk_reactivate')}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-1.5 rounded bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary font-medium">
              {t('admin.renters.clear')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-dc1-text-secondary">{t('admin.renters.loading')}</div>
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
                  <th>{t('admin.renters.renter')}</th>
                  <th>{t('admin.renters.organization')}</th>
                  <th>{t('admin.renters.balance')}</th>
                  <th>{t('admin.renters.jobs')}</th>
                  <th>{t('admin.renters.spent')}</th>
                  <th>Last Active</th>
                  <th>{t('table.status')}</th>
                  <th>{t('admin.jobs.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className={selected.has(r.id) ? 'bg-dc1-amber/5' : ''}>
                    <td className="w-10">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                        className="rounded border-dc1-border" />
                    </td>
                    <td>
                      <Link href={`/admin/renters/${r.id}`} className="text-dc1-amber hover:underline font-medium">
                        {r.name}
                      </Link>
                      <div className="text-xs text-dc1-text-muted">{r.email}</div>
                    </td>
                    <td className="text-sm">{r.organization || t('admin.renters.na')}</td>
                    <td className="text-sm text-dc1-amber">{r.balance_halala !== null && r.balance_halala !== undefined ? `${(r.balance_halala / 100).toFixed(2)} ${t('common.sar')}` : '—'}</td>
                    <td className="text-sm">{r.total_jobs || 0}</td>
                    <td className="text-sm">{r.total_spent_halala != null && r.total_spent_halala !== undefined ? `${(r.total_spent_halala / 100).toFixed(2)} ${t('common.sar')}` : t('admin.renters.na')}</td>
                    <td className="text-sm text-dc1-text-muted">
                      {r.last_active_at
                        ? new Date(r.last_active_at).toLocaleDateString()
                        : r.updated_at
                        ? new Date(r.updated_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      <StatusBadge status={r.status === 'suspended' ? 'warning' : 'online'}
                        label={r.status === 'suspended' ? t('admin.renters.suspended') : t('admin.renters.active')} />
                    </td>
                    <td className="space-x-2 flex">
                      <button
                        onClick={() => setCreditModal({ id: r.id, name: r.name })}
                        className="text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                      >
                        {t('admin.renters.grant_credits')}
                      </button>
                      {r.status === 'suspended' ? (
                        <button
                          onClick={() => handleSuspend(r.id, 'unsuspend')}
                          disabled={actionLoading === r.id}
                          className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50"
                        >
                          {actionLoading === r.id ? '...' : t('admin.renters.reactivate')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspend(r.id, 'suspend')}
                          disabled={actionLoading === r.id}
                          className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                        >
                          {actionLoading === r.id ? '...' : t('admin.renters.suspend')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-dc1-text-muted text-sm text-center">{t('admin.renters.no_renters')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Credit Modal */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dc1-surface-l1 rounded-lg p-6 w-96 shadow-lg">
            <h2 className="text-xl font-bold text-dc1-text-primary mb-4">{t('admin.renters.grant_credits')}: {creditModal.name}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dc1-text-secondary mb-2">{t('admin.renters.amount_sar')}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="input w-full"
                  value={creditAmount}
                  onChange={e => setCreditAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dc1-text-secondary mb-2">{t('admin.renters.reason')}</label>
                <input
                  type="text"
                  placeholder={t('admin.renters.reason_placeholder')}
                  className="input w-full"
                  value={creditReason}
                  onChange={e => setCreditReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setCreditModal(null)}
                  className="px-4 py-2 rounded text-sm font-medium bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary"
                >
                  {t('admin.jobs.cancel')}
                </button>
                <button
                  onClick={handleCredit}
                  disabled={creditLoading || !creditAmount || !creditReason}
                  className="px-4 py-2 rounded text-sm font-medium bg-dc1-amber text-black hover:bg-yellow-500 disabled:opacity-50"
                >
                  {creditLoading ? t('admin.renters.processing') : t('admin.renters.confirm_grant')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Credit Modal */}
      {bulkCreditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dc1-surface-l1 rounded-lg p-6 w-96 shadow-lg">
            <h2 className="text-xl font-bold text-dc1-text-primary mb-4">{t('admin.renters.bulk_credit')}: {selected.size} {t('admin.renters.renters')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dc1-text-secondary mb-2">{t('admin.renters.amount_per_account_sar')}</label>
                <input type="number" step="0.01" placeholder="0.00" className="input w-full"
                  value={bulkCreditAmount} onChange={e => setBulkCreditAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-dc1-text-secondary mb-2">{t('admin.renters.reason')}</label>
                <input type="text" placeholder={t('admin.renters.bulk_reason_placeholder')} className="input w-full"
                  value={bulkCreditReason} onChange={e => setBulkCreditReason(e.target.value)} />
              </div>
              <p className="text-xs text-dc1-text-muted">{t('admin.renters.total')}: {bulkCreditAmount ? `${(parseFloat(bulkCreditAmount) * selected.size).toFixed(2)} ${t('common.sar')} ${t('admin.renters.across')} ${selected.size} ${t('admin.renters.accounts')}` : t('admin.renters.na')}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setBulkCreditModal(false); setBulkCreditAmount(''); setBulkCreditReason('') }}
                  className="px-4 py-2 rounded text-sm font-medium bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary">
                  {t('admin.jobs.cancel')}
                </button>
                <button onClick={handleBulkCredit} disabled={bulkLoading || !bulkCreditAmount || !bulkCreditReason}
                  className="px-4 py-2 rounded text-sm font-medium bg-dc1-amber text-black hover:bg-yellow-500 disabled:opacity-50">
                  {bulkLoading ? t('admin.renters.processing') : t('admin.renters.confirm_bulk_credit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
