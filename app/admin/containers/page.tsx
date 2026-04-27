'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// ─── Icons ───────────────────────────────────────────────────────────────────
const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApprovedImage {
  id: number
  image_ref: string
  registry: string
  resolved_digest: string
  approved_at: string
  last_validated_at: string | null
  scanned_at: string | null
  critical_count: number | null
  approved: number | null
  pinned_ref?: string
}

interface RecentScan {
  id: number
  image_ref: string
  registry: string
  resolved_digest: string
  scanned_at: string
  critical_count: number
  approved: number
}

interface SecurityStatus {
  allowed_registries: string[]
  approved_images: ApprovedImage[]
  recent_scans: RecentScan[]
}

type ScanStatus = 'CLEAN' | 'CRITICAL' | 'PENDING' | 'NOT_SCANNED'

function getScanStatus(img: ApprovedImage): ScanStatus {
  if (img.scanned_at == null) return 'NOT_SCANNED'
  if (img.critical_count == null) return 'PENDING'
  if (img.critical_count > 0) return 'CRITICAL'
  return 'CLEAN'
}

const IMAGE_TYPES = [
  'pytorch-cuda',
  'vllm-serve',
  'training',
  'rendering',
  'custom',
  'docker_hub',
]

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContainersPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [adminKey, setAdminKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'registry' | 'security'>('registry')

  // Registry state
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Approve form state
  const [formImageRef, setFormImageRef] = useState('')
  const [formImageType, setFormImageType] = useState('custom')
  const [approving, setApproving] = useState(false)
  const [approveResult, setApproveResult] = useState<{ ok: boolean; message: string; cves?: number } | null>(null)

  // Per-row action state
  const [rowAction, setRowAction] = useState<Record<number, { loading: boolean; error?: string }>>({})

  // Re-scan all state
  const [rescanningAll, setRescanningAll] = useState(false)
  const [rescanAllResult, setRescanAllResult] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken')
    if (!key) {
      router.push('/login')
      return
    }
    setAdminKey(key)
  }, [router, t])

  const fetchSecurityStatus = useCallback(async (key: string) => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/admin/containers/security-status`, {
        headers: { 'x-admin-token': key },
      })
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SecurityStatus = await res.json()
      setSecurityStatus(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('admin.containers.error_load'))
    } finally {
      setLoading(false)
    }
  }, [router, t])

  useEffect(() => {
    if (adminKey) fetchSecurityStatus(adminKey)
  }, [adminKey, fetchSecurityStatus])

  // ── Approve image ──────────────────────────────────────────────────────────
  async function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    if (!adminKey || !formImageRef.trim()) return
    setApproving(true)
    setApproveResult(null)
    try {
      const res = await fetch(`${API_BASE}/admin/containers/approve-image`, {
        method: 'POST',
        headers: { 'x-admin-token': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_ref: formImageRef.trim(), image_type: formImageType }),
      })
      const data = await res.json()
      if (res.ok) {
        setApproveResult({ ok: true, message: t('admin.containers.approve_success') })
        setFormImageRef('')
        fetchSecurityStatus(adminKey)
      } else if (res.status === 400 && data.critical_count > 0) {
        setApproveResult({ ok: false, message: data.error || t('admin.containers.approve_rejected_critical'), cves: data.critical_count })
      } else {
        setApproveResult({ ok: false, message: data.error || t('admin.containers.approve_failed') })
      }
    } catch {
      setApproveResult({ ok: false, message: t('admin.containers.network_retry') })
    } finally {
      setApproving(false)
    }
  }

  // ── Re-scan single image ───────────────────────────────────────────────────
  async function handleRescan(img: ApprovedImage) {
    if (!adminKey) return
    setRowAction(prev => ({ ...prev, [img.id]: { loading: true } }))
    try {
      const res = await fetch(`${API_BASE}/admin/containers/scan-image`, {
        method: 'POST',
        headers: { 'x-admin-token': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_ref: img.image_ref }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRowAction(prev => ({ ...prev, [img.id]: { loading: false, error: data.error || t('admin.containers.scan_failed') } }))
      } else {
        setRowAction(prev => ({ ...prev, [img.id]: { loading: false } }))
        fetchSecurityStatus(adminKey)
      }
    } catch {
      setRowAction(prev => ({ ...prev, [img.id]: { loading: false, error: t('admin.containers.network_error') } }))
    }
  }

  // ── Re-scan all templates ──────────────────────────────────────────────────
  async function handleRescanAll() {
    if (!adminKey || !securityStatus) return
    setRescanningAll(true)
    setRescanAllResult(null)
    let successCount = 0
    let failCount = 0
    for (const img of securityStatus.approved_images) {
      try {
        const res = await fetch(`${API_BASE}/admin/containers/scan-image`, {
          method: 'POST',
          headers: { 'x-admin-token': adminKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_ref: img.image_ref }),
        })
        if (res.ok) successCount++
        else failCount++
      } catch {
        failCount++
      }
    }
    setRescanAllResult(t('admin.containers.rescan_all_result')
      .replace('{success}', String(successCount))
      .replace('{failed}', String(failCount)))
    setRescanningAll(false)
    fetchSecurityStatus(adminKey)
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  function truncateDigest(digest: string | null) {
    if (!digest) return '—'
    const d = digest.startsWith('sha256:') ? digest.slice(7) : digest
    return d.slice(0, 12) + '…'
  }

  function ScanBadge({ status }: { status: ScanStatus }) {
    const map: Record<ScanStatus, { label: string; cls: string }> = {
      CLEAN: { label: t('admin.containers.scan_status.clean'), cls: 'bg-green-900/50 text-green-300 border border-green-700' },
      CRITICAL: { label: t('admin.containers.scan_status.critical'), cls: 'bg-red-900/50 text-red-300 border border-red-700' },
      PENDING: { label: t('admin.containers.scan_status.pending'), cls: 'bg-amber-900/50 text-amber-300 border border-amber-700' },
      NOT_SCANNED: { label: t('admin.containers.scan_status.not_scanned'), cls: 'bg-gray-800 text-gray-400 border border-gray-600' },
    }
    const { label, cls } = map[status]
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>{label}</span>
  }

  // ── Warn if any approved image has high CVEs ───────────────────────────────
  const hasCriticalImages = securityStatus?.approved_images.some(img =>
    img.critical_count != null && img.critical_count > 0
  )

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
  ]

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-dc1-text-primary">{t('admin.containers.title')}</h1>
            <p className="text-dc1-text-secondary mt-1 text-sm">{t('admin.containers.subtitle')}</p>
          </div>
          <button
            onClick={() => adminKey && fetchSecurityStatus(adminKey)}
            className="btn-secondary text-sm px-4 py-2"
            disabled={loading}
          >
            {loading ? t('admin.containers.refreshing') : t('common.retry')}
          </button>
        </div>

        {/* Critical warning banner */}
        {hasCriticalImages && (
          <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-red-300 text-sm font-medium">
              {t('admin.containers.critical_banner')}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-dc1-surface-l3">
          <div className="flex gap-1">
            {(['registry', 'security'] as const).map(tabKey => (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === tabKey
                    ? 'border-dc1-amber text-dc1-amber'
                    : 'border-transparent text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {tabKey === 'registry' ? t('admin.containers.tab_registry') : t('admin.containers.tab_security')}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-red-300 text-sm">{error}</div>
        )}

        {/* ── REGISTRY TAB ─────────────────────────────────────────────────── */}
        {tab === 'registry' && (
          <div className="space-y-6">
            {/* Approve new image form */}
            <div className="dc1-card p-5">
              <h2 className="text-lg font-semibold text-dc1-text-primary mb-4">{t('admin.containers.approve_title')}</h2>
              <form onSubmit={handleApprove} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1">
                      {t('admin.containers.image_reference')}
                    </label>
                    <input
                      type="text"
                      value={formImageRef}
                      onChange={e => setFormImageRef(e.target.value)}
                      placeholder={t('admin.containers.image_reference_placeholder')}
                      className="w-full bg-dc1-surface-l2 border border-dc1-surface-l3 rounded-lg px-3 py-2 text-sm text-dc1-text-primary placeholder-dc1-text-secondary focus:outline-none focus:border-dc1-amber font-mono"
                      required
                      disabled={approving}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dc1-text-secondary mb-1">
                      {t('admin.containers.image_type')}
                    </label>
                    <select
                      value={formImageType}
                      onChange={e => setFormImageType(e.target.value)}
                      className="w-full bg-dc1-surface-l2 border border-dc1-surface-l3 rounded-lg px-3 py-2 text-sm text-dc1-text-primary focus:outline-none focus:border-dc1-amber"
                      disabled={approving}
                    >
                      {IMAGE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={approving || !formImageRef.trim()}
                    className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
                  >
                    {approving ? t('admin.containers.approving') : t('admin.containers.approve_button')}
                  </button>
                  {approving && (
                    <span className="text-xs text-dc1-text-secondary animate-pulse">
                      {t('admin.containers.approving_hint')}
                    </span>
                  )}
                </div>

                {/* Approve result */}
                {approveResult && (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${
                    approveResult.ok
                      ? 'bg-green-900/20 border-green-700 text-green-300'
                      : 'bg-red-900/20 border-red-700 text-red-300'
                  }`}>
                    {approveResult.message}
                    {!approveResult.ok && approveResult.cves != null && (
                      <span className="ms-2 font-mono font-bold">{`${approveResult.cves} ${t('admin.containers.critical_cves_count')}`}</span>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* Approved images table */}
            <div className="dc1-card overflow-hidden">
              <div className="px-5 py-4 border-b border-dc1-surface-l3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dc1-text-primary">{t('admin.containers.approved_images')}</h2>
                <span className="text-xs text-dc1-text-secondary">
                  {`${securityStatus?.approved_images.length ?? 0} ${t('admin.containers.images')}`}
                </span>
              </div>

              {loading ? (
                <div className="px-5 py-10 text-center text-dc1-text-secondary text-sm">{t('admin.containers.loading_registry')}</div>
              ) : !securityStatus?.approved_images.length ? (
                <div className="px-5 py-10 text-center text-dc1-text-secondary">
                  <ContainerIcon />
                  <p className="mt-3 text-sm">{t('admin.containers.no_images')}</p>
                  <p className="text-xs mt-1">{t('admin.containers.no_images_hint')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-surface-l3 text-dc1-text-secondary text-xs uppercase">
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.image')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.type')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.registry')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.sha256')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.approved')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.scan_status')}</th>
                        <th className="px-4 py-3 text-end font-medium">{t('admin.containers.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityStatus.approved_images.map(img => {
                        const status = getScanStatus(img)
                        const action = rowAction[img.id]
                        return (
                          <tr key={img.id} className="border-b border-dc1-surface-l3/50 hover:bg-dc1-surface-l2/40 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-dc1-text-primary break-all">{img.image_ref}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-dc1-text-secondary">{img.registry}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-dc1-text-secondary">{img.registry}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="font-mono text-xs text-dc1-text-secondary cursor-pointer hover:text-dc1-amber"
                                title={img.resolved_digest}
                              >
                                {truncateDigest(img.resolved_digest)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-dc1-text-secondary whitespace-nowrap">
                              {fmtDate(img.approved_at)}
                            </td>
                            <td className="px-4 py-3">
                              <ScanBadge status={status} />
                              {status === 'CRITICAL' && img.critical_count != null && (
                                <span className="ms-2 text-xs text-red-400">{`${img.critical_count} ${t('admin.containers.cves')}`}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                {action?.error && (
                                  <span className="text-xs text-red-400">{action.error}</span>
                                )}
                                <button
                                  onClick={() => handleRescan(img)}
                                  disabled={action?.loading}
                                  className="text-xs px-3 py-1 rounded bg-dc1-surface-l3 text-dc1-text-primary hover:bg-dc1-amber hover:text-dc1-void transition-colors disabled:opacity-50"
                                >
                                  {action?.loading ? t('admin.containers.scanning') : t('admin.containers.rescan')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECURITY STATUS TAB ──────────────────────────────────────────── */}
        {tab === 'security' && (
          <div className="space-y-6">
            {/* Summary cards */}
            {securityStatus && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="dc1-card p-4 text-center">
                  <p className="text-dc1-text-secondary text-xs mb-1">{t('admin.containers.approved_images')}</p>
                  <p className="text-2xl font-bold text-dc1-text-primary">{securityStatus.approved_images.length}</p>
                </div>
                <div className="dc1-card p-4 text-center">
                  <p className="text-dc1-text-secondary text-xs mb-1">{t('admin.containers.clean')}</p>
                  <p className="text-2xl font-bold text-green-400">
                    {securityStatus.approved_images.filter(i => getScanStatus(i) === 'CLEAN').length}
                  </p>
                </div>
                <div className="dc1-card p-4 text-center">
                  <p className="text-dc1-text-secondary text-xs mb-1">{t('admin.containers.critical_cves')}</p>
                  <p className="text-2xl font-bold text-red-400">
                    {securityStatus.approved_images.filter(i => getScanStatus(i) === 'CRITICAL').length}
                  </p>
                </div>
                <div className="dc1-card p-4 text-center">
                  <p className="text-dc1-text-secondary text-xs mb-1">{t('admin.containers.unscanned')}</p>
                  <p className="text-2xl font-bold text-gray-400">
                    {securityStatus.approved_images.filter(i => getScanStatus(i) === 'NOT_SCANNED').length}
                  </p>
                </div>
              </div>
            )}

            {/* Re-scan all */}
            <div className="dc1-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-dc1-text-primary">{t('admin.containers.rescan_all_title')}</h2>
                  <p className="text-xs text-dc1-text-secondary mt-0.5">
                    {t('admin.containers.rescan_all_hint')}
                  </p>
                </div>
                <button
                  onClick={handleRescanAll}
                  disabled={rescanningAll || !securityStatus?.approved_images.length}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
                >
                  {rescanningAll ? t('admin.containers.scanning_all') : t('admin.containers.rescan_all')}
                </button>
              </div>
              {rescanAllResult && (
                <p className="mt-3 text-sm text-dc1-text-secondary">{rescanAllResult}</p>
              )}
            </div>

            {/* Per-image security table */}
            <div className="dc1-card overflow-hidden">
              <div className="px-5 py-4 border-b border-dc1-surface-l3">
                <h2 className="text-lg font-semibold text-dc1-text-primary">{t('admin.containers.image_scan_status')}</h2>
              </div>
              {loading ? (
                <div className="px-5 py-10 text-center text-dc1-text-secondary text-sm">{t('common.loading')}</div>
              ) : !securityStatus?.approved_images.length ? (
                <div className="px-5 py-10 text-center text-dc1-text-secondary text-sm">{t('admin.containers.no_images')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-surface-l3 text-dc1-text-secondary text-xs uppercase">
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.image')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.last_scan')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.critical')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.status')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.last_validated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityStatus.approved_images.map(img => (
                        <tr key={img.id} className="border-b border-dc1-surface-l3/50 hover:bg-dc1-surface-l2/40 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-dc1-text-primary break-all">{img.image_ref}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-dc1-text-secondary whitespace-nowrap">
                            {fmtDate(img.scanned_at)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {img.critical_count == null
                              ? <span className="text-dc1-text-secondary">—</span>
                              : img.critical_count > 0
                                ? <span className="text-red-400 font-bold">{img.critical_count}</span>
                                : <span className="text-green-400">0</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <ScanBadge status={getScanStatus(img)} />
                          </td>
                          <td className="px-4 py-3 text-xs text-dc1-text-secondary whitespace-nowrap">
                            {fmtDate(img.last_validated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent scans log */}
            {securityStatus && securityStatus.recent_scans.length > 0 && (
              <div className="dc1-card overflow-hidden">
                <div className="px-5 py-4 border-b border-dc1-surface-l3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-dc1-text-primary">{t('admin.containers.recent_scan_log')}</h2>
                  <span className="text-xs text-dc1-text-secondary">{`${securityStatus.recent_scans.length} ${t('admin.containers.records')}`}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-surface-l3 text-dc1-text-secondary text-xs uppercase">
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.image')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.scanned_at')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.critical_cves')}</th>
                        <th className="px-4 py-3 text-start font-medium">{t('admin.containers.table.approved')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityStatus.recent_scans.map(scan => (
                        <tr key={scan.id} className="border-b border-dc1-surface-l3/50 hover:bg-dc1-surface-l2/40 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-dc1-text-primary break-all">{scan.image_ref}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-dc1-text-secondary whitespace-nowrap">
                            {fmtDate(scan.scanned_at)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {scan.critical_count > 0
                              ? <span className="text-red-400 font-bold">{scan.critical_count}</span>
                              : <span className="text-green-400">0</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            {scan.approved
                              ? <span className="text-xs text-green-400">{t('common.yes')}</span>
                              : <span className="text-xs text-dc1-text-secondary">{t('common.no')}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
