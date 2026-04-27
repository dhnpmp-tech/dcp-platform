'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// Nav icons
const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

const halalaToSar = (h: number) => ((h || 0) / 100).toFixed(2)

export default function FinanceDashboard() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [txns, setTxns] = useState<any[]>([])
  const [txnPage, setTxnPage] = useState(1)
  const [txnPagination, setTxnPagination] = useState<any>(null)
  const [error, setError] = useState('')
  const [recon, setRecon] = useState<any>(null)
  const [reconDays, setReconDays] = useState(7)

  const sar = t('common.sar')
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

  useEffect(() => {
    const token = localStorage.getItem('dc1_admin_token')
    if (!token) { router.push('/login'); return }

    const headers = { 'x-admin-token': token }

    const load = async () => {
      try {
        const [sumRes, txnRes, reconRes] = await Promise.all([
          fetch(`${API_BASE}/admin/finance/summary`, { headers }),
          fetch(`${API_BASE}/admin/finance/transactions?page=${txnPage}&limit=15`, { headers }),
          fetch(`${API_BASE}/admin/finance/reconciliation?days=${reconDays}`, { headers }),
        ])
        if (!sumRes.ok || !txnRes.ok || !reconRes.ok) throw new Error(t('admin.finance.failed_load'))
        const sumData = await sumRes.json()
        const txnData = await txnRes.json()
        const reconData = await reconRes.json()
        setData(sumData)
        setTxns(txnData.transactions || [])
        setTxnPagination(txnData.pagination || null)
        setRecon(reconData)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [router, txnPage, reconDays, t])

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
        <div className="text-dc1-text-secondary">{t('admin.finance.loading_data')}</div>
      </DashboardLayout>
    )
  }

  const at = data?.all_time || {}
  const td = data?.today || {}
  const wk = data?.this_week || {}
  const mo = data?.this_month || {}
  const rb = data?.renter_balances || {}
  const wd = data?.withdrawals || {}

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{t('admin.finance.title')}</h1>
          <p className="text-dc1-text-secondary">{t('admin.finance.subtitle')}</p>
        </div>

        {error && <div className="card border-red-500/50 text-red-400 text-sm">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t('admin.finance.total_revenue')} value={`${halalaToSar(at.total_revenue)} ${sar}`} accent="success" icon={<CurrencyIcon />} />
          <StatCard label={t('admin.finance.dcp_fees')} value={`${halalaToSar(at.total_dc1_fees)} ${sar}`} accent="amber" icon={<CurrencyIcon />} />
          <StatCard label={t('admin.finance.provider_payouts')} value={`${halalaToSar(at.total_provider_payouts)} ${sar}`} accent="info" icon={<CurrencyIcon />} />
          <StatCard label={t('admin.finance.completed_jobs')} value={String(at.completed_jobs || 0)} accent="default" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <h3 className="text-sm font-medium text-dc1-text-secondary mb-3">{t('admin.finance.today')}</h3>
            <p className="text-2xl font-bold text-dc1-text-primary">{halalaToSar(td.revenue)} {sar}</p>
            <p className="text-xs text-dc1-text-muted mt-1">{td.jobs || 0} {t('admin.finance.jobs')} · {t('admin.finance.dcp_fee')}: {halalaToSar(td.dc1_fees)} {sar}</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-dc1-text-secondary mb-3">{t('admin.finance.this_week')}</h3>
            <p className="text-2xl font-bold text-dc1-text-primary">{halalaToSar(wk.revenue)} {sar}</p>
            <p className="text-xs text-dc1-text-muted mt-1">{wk.jobs || 0} {t('admin.finance.jobs')} · {t('admin.finance.dcp_fee')}: {halalaToSar(wk.dc1_fees)} {sar}</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-dc1-text-secondary mb-3">{t('admin.finance.this_month')}</h3>
            <p className="text-2xl font-bold text-dc1-text-primary">{halalaToSar(mo.revenue)} {sar}</p>
            <p className="text-xs text-dc1-text-muted mt-1">{mo.jobs || 0} {t('admin.finance.jobs')} · {t('admin.finance.dcp_fee')}: {halalaToSar(mo.dc1_fees)} {sar}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="section-heading mb-4">{t('admin.finance.renter_balances')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.total_held')}</span><span className="text-dc1-text-primary font-semibold">{halalaToSar(rb.total_held)} {sar}</span></div>
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.active_renters')}</span><span className="text-dc1-text-primary">{rb.total_renters || 0}</span></div>
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.funded_accounts')}</span><span className="text-dc1-text-primary">{rb.funded_renters || 0}</span></div>
            </div>
          </div>
          <div className="card">
            <h2 className="section-heading mb-4">{t('admin.finance.withdrawals')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.pending')}</span><span className="text-dc1-amber font-semibold">{wd.pending_count || 0} ({(wd.pending_sar || 0).toFixed(2)} {sar})</span></div>
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.approved')}</span><span className="text-dc1-text-primary">{(wd.approved_sar || 0).toFixed(2)} {sar}</span></div>
              <div className="flex justify-between"><span className="text-dc1-text-secondary">{t('admin.finance.paid_out')}</span><span className="text-status-success">{(wd.paid_sar || 0).toFixed(2)} {sar}</span></div>
            </div>
          </div>
        </div>

        {data?.daily_revenue?.length > 0 && (
          <div className="card">
            <h2 className="section-heading mb-4">{t('admin.finance.daily_revenue_14d')}</h2>
            <div className="flex items-end gap-1 h-40">
              {data.daily_revenue.map((d: any) => {
                const maxRev = Math.max(...data.daily_revenue.map((x: any) => x.revenue || 1))
                const pct = maxRev > 0 ? ((d.revenue || 0) / maxRev) * 100 : 0
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-8 bg-dc1-surface-l2 border border-dc1-border px-2 py-1 rounded text-xs text-dc1-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {d.day}: {halalaToSar(d.revenue)} {sar} ({d.jobs} {t('admin.finance.jobs')})
                    </div>
                    <div
                      className="w-full bg-dc1-amber/80 rounded-t hover:bg-dc1-amber transition-colors"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="text-[10px] text-dc1-text-muted">{d.day?.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="section-heading mb-4">{t('admin.finance.top_providers')}</h2>
            <div className="space-y-3">
              {(data?.top_providers || []).map((p: any, i: number) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-dc1-text-muted w-5">{i + 1}.</span>
                    <div>
                      <p className="text-sm font-medium text-dc1-text-primary">{p.name}</p>
                      <p className="text-xs text-dc1-text-muted">{p.gpu_model} · {p.job_count} {t('admin.finance.jobs')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-status-success">{halalaToSar(p.total_earned)} {sar}</span>
                </div>
              ))}
              {(!data?.top_providers?.length) && <p className="text-sm text-dc1-text-muted">{t('admin.finance.no_earnings')}</p>}
            </div>
          </div>
          <div className="card">
            <h2 className="section-heading mb-4">{t('admin.finance.top_renters')}</h2>
            <div className="space-y-3">
              {(data?.top_renters || []).map((r: any, i: number) => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-dc1-text-muted w-5">{i + 1}.</span>
                    <div>
                      <p className="text-sm font-medium text-dc1-text-primary">{r.name}</p>
                      <p className="text-xs text-dc1-text-muted">{r.email} · {r.job_count} {t('admin.finance.jobs')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-dc1-amber">{halalaToSar(r.total_spent)} {sar}</span>
                </div>
              ))}
              {(!data?.top_renters?.length) && <p className="text-sm text-dc1-text-muted">{t('admin.finance.no_spending')}</p>}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-heading mb-4">{t('admin.finance.recent_transactions')}</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('table.job_id')}</th>
                  <th>{t('table.type')}</th>
                  <th>{t('admin.jobs.renter')}</th>
                  <th>{t('table.provider')}</th>
                  <th>{t('admin.finance.revenue')}</th>
                  <th>{t('admin.finance.dcp_fee')}</th>
                  <th>{t('admin.finance.provider_cut')}</th>
                  <th>{t('admin.finance.date')}</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((item: any) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs text-dc1-amber">{item.job_id?.slice(0, 20) || item.id}</td>
                    <td className="text-sm">{item.job_type || t('admin.finance.na')}</td>
                    <td className="text-sm">{item.renter_name || t('admin.finance.na')}</td>
                    <td className="text-sm">{item.provider_name || t('admin.finance.na')}</td>
                    <td className="text-sm font-semibold text-dc1-text-primary">{halalaToSar(item.actual_cost_halala)}</td>
                    <td className="text-sm text-dc1-amber">{halalaToSar(item.dc1_fee_halala)}</td>
                    <td className="text-sm text-status-success">{halalaToSar(item.provider_earned_halala)}</td>
                    <td className="text-xs text-dc1-text-secondary">{item.completed_at ? new Date(item.completed_at).toLocaleDateString() : t('admin.finance.na')}</td>
                  </tr>
                ))}
                {txns.length === 0 && <tr><td colSpan={8} className="text-center text-dc1-text-muted py-6">{t('admin.finance.no_transactions')}</td></tr>}
              </tbody>
            </table>
          </div>

          {txnPagination && txnPagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-dc1-border">
              <span className="text-sm text-dc1-text-secondary">
                {t('admin.finance.page_of_total')
                  .replace('{page}', String(txnPagination.page))
                  .replace('{pages}', String(txnPagination.total_pages))
                  .replace('{total}', String(txnPagination.total))}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                  disabled={txnPage <= 1}
                  className="px-3 py-1 text-sm rounded bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary disabled:opacity-30 border border-dc1-border"
                >
                  {t('admin.finance.previous')}
                </button>
                <button
                  onClick={() => setTxnPage((p) => Math.min(txnPagination.total_pages, p + 1))}
                  disabled={txnPage >= txnPagination.total_pages}
                  className="px-3 py-1 text-sm rounded bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary disabled:opacity-30 border border-dc1-border"
                >
                  {t('admin.finance.next')}
                </button>
              </div>
            </div>
          )}
        </div>

        {data?.discrepancies?.length > 0 && (
          <div className="card border-red-500/30">
            <h2 className="section-heading text-red-400 mb-4">{t('admin.finance.billing_discrepancies')}</h2>
            <p className="text-sm text-dc1-text-secondary mb-3">{t('admin.finance.billing_discrepancies_desc')}</p>
            <div className="space-y-2">
              {data.discrepancies.map((d: any) => (
                <div key={d.id} className="text-xs font-mono text-red-300">
                  {d.job_id}: cost={d.actual_cost_halala} | provider={d.provider_earned_halala} + dc1={d.dc1_fee_halala} = {(d.provider_earned_halala || 0) + (d.dc1_fee_halala || 0)}
                </div>
              ))}
            </div>
          </div>
        )}

        {recon && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="section-heading">{t('admin.finance.financial_reconciliation')}</h2>
                <div className="flex gap-2">
                  {[7, 14, 30, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setReconDays(days)}
                      className={`px-3 py-1 text-sm rounded border ${
                        reconDays === days
                          ? 'bg-dc1-amber text-dc1-void border-dc1-amber'
                          : 'bg-dc1-surface-l2 text-dc1-text-secondary border-dc1-border hover:text-dc1-text-primary'
                      }`}
                    >
                      {days}{t('admin.finance.days_short')}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-dc1-text-muted mb-4">
                {t('admin.finance.period_line')
                  .replace('{since}', recon.since ? new Date(recon.since).toLocaleDateString() : t('admin.finance.na'))
                  .replace('{days}', String(recon.period_days))}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                <StatCard label={t('admin.finance.total_jobs')} value={String(recon.summary?.total_completed_jobs || 0)} accent="default" />
                <StatCard label={t('admin.finance.total_billed')} value={`${halalaToSar(recon.summary?.total_billed_halala)} ${sar}`} accent="default" />
                <StatCard
                  label={t('admin.finance.split_mismatches')}
                  value={String(recon.summary?.split_mismatches || 0)}
                  accent={recon.summary?.split_mismatches > 0 ? 'error' : 'success'}
                />
                <StatCard
                  label={t('admin.finance.missing_billing')}
                  value={String(recon.summary?.missing_billing || 0)}
                  accent={recon.summary?.missing_billing > 0 ? 'error' : 'success'}
                />
                <StatCard
                  label={t('admin.finance.provider_drift')}
                  value={String(recon.summary?.provider_drift_count || 0)}
                  accent={recon.summary?.provider_drift_count > 0 ? 'error' : 'success'}
                />
                <StatCard
                  label={t('admin.finance.renter_drift')}
                  value={String(recon.summary?.renter_drift_count || 0)}
                  accent={recon.summary?.renter_drift_count > 0 ? 'error' : 'success'}
                />
              </div>

              {recon.issues?.provider_earnings_drift?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-dc1-text-secondary mb-3">{t('admin.finance.provider_earnings_drift')}</h3>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('table.provider')}</th>
                          <th>{t('table.email')}</th>
                          <th>{t('admin.finance.recorded_sar')}</th>
                          <th>{t('admin.finance.computed_sar')}</th>
                          <th>{t('admin.finance.drift_sar')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.issues.provider_earnings_drift.map((p: any) => (
                          <tr key={p.id}>
                            <td className="text-sm font-medium text-dc1-text-primary">{p.name}</td>
                            <td className="text-sm text-dc1-text-secondary">{p.email}</td>
                            <td className="text-sm">{halalaToSar(p.recorded_earnings_halala)}</td>
                            <td className="text-sm">{halalaToSar(p.computed_earnings_halala)}</td>
                            <td className="text-sm font-semibold" style={{ color: p.drift !== 0 ? '#ef4444' : '#10b981' }}>
                              {halalaToSar(p.drift)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {recon.issues?.renter_spend_drift?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dc1-text-secondary mb-3">{t('admin.finance.renter_spend_drift')}</h3>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('admin.jobs.renter')}</th>
                          <th>{t('table.email')}</th>
                          <th>{t('admin.finance.recorded_sar')}</th>
                          <th>{t('admin.finance.computed_sar')}</th>
                          <th>{t('admin.finance.drift_sar')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.issues.renter_spend_drift.map((r: any) => (
                          <tr key={r.id}>
                            <td className="text-sm font-medium text-dc1-text-primary">{r.name}</td>
                            <td className="text-sm text-dc1-text-secondary">{r.email}</td>
                            <td className="text-sm">{halalaToSar(r.recorded_spent)}</td>
                            <td className="text-sm">{halalaToSar(r.computed_spent)}</td>
                            <td className="text-sm font-semibold" style={{ color: r.drift !== 0 ? '#ef4444' : '#10b981' }}>
                              {halalaToSar(r.drift)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
