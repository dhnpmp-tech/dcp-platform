'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
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
const ChartIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>)

const formatSAR = (sar: number) => `SAR ${sar.toFixed(2)}`

interface RevenueData {
  period_days: number
  totals: {
    total_sar: number
    platform_fees_sar: number
    provider_payouts_sar: number
    total_jobs: number
  }
  by_day: Array<{
    date: string
    jobs: number
    total_sar: number
    platform_fees_sar: number
    provider_payouts_sar: number
  }>
}

interface FinanceSummary {
  today: { revenue: number; dc1_fees: number; jobs: number }
  this_week: { revenue: number; dc1_fees: number; jobs: number }
  this_month: { revenue: number; dc1_fees: number; jobs: number }
  top_providers: Array<{ id: string; name: string; gpu_model: string; total_earned: number; job_count: number }>
  top_renters: Array<{ id: string; name: string; email: string; total_spent: number; job_count: number }>
}

function BarChart({ data }: { data: RevenueData['by_day'] }) {
  if (!data || data.length === 0) {
    return <p className="text-dc1-text-muted text-sm text-center py-8">No data for this period</p>
  }
  const maxVal = Math.max(...data.map(d => d.total_sar), 1)
  const displayData = [...data].reverse().slice(0, 14)

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {displayData.map((d) => {
          const height = Math.max((d.total_sar / maxVal) * 100, 2)
          const platformHeight = Math.max((d.platform_fees_sar / maxVal) * 100, 0)
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div
                className="w-full rounded-t-sm bg-dc1-surface-l3 relative overflow-hidden"
                style={{ height: `${height}%` }}
                title={`${d.date}: ${formatSAR(d.total_sar)} (${d.jobs} jobs)`}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 bg-dc1-amber/70 rounded-t-sm"
                  style={{ height: `${(platformHeight / height) * 100}%` }}
                />
              </div>
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-dc1-surface-l2 border border-dc1-border rounded px-2 py-1 text-xs whitespace-nowrap hidden group-hover:block z-10">
                <p className="text-dc1-text-primary font-mono">{formatSAR(d.total_sar)}</p>
                <p className="text-dc1-text-muted">{d.jobs} jobs</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 text-xs text-dc1-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-dc1-surface-l3 inline-block" /> Provider payout
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-dc1-amber/70 inline-block" /> Platform fee (15%)
        </span>
      </div>
    </div>
  )
}

export default function RevenueAdmin() {
  const router = useRouter()
  const { t, isRTL, dir } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: 'Revenue', href: '/admin/revenue', icon: <ChartIcon /> },
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
        const [revRes, finRes] = await Promise.all([
          fetch(`${API_BASE}/admin/revenue?days=${days}`, { headers }),
          fetch(`${API_BASE}/admin/finance/summary`, { headers }),
        ])
        if (revRes.status === 401 || finRes.status === 401) {
          localStorage.removeItem('dc1_admin_token')
          router.push('/login')
          return
        }
        if (!revRes.ok) throw new Error('Failed to fetch revenue data')
        if (!finRes.ok) throw new Error('Failed to fetch finance summary')

        const revData: RevenueData = await revRes.json()
        const finData: FinanceSummary = await finRes.json()
        setRevenue(revData)
        setFinance(finData)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [router, days])

  const todaySAR = ((finance?.today?.revenue ?? 0) / 100).toFixed(2)
  const weekSAR = ((finance?.this_week?.revenue ?? 0) / 100).toFixed(2)
  const monthSAR = ((finance?.this_month?.revenue ?? 0) / 100).toFixed(2)

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-8" dir={dir}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-dc1-text-primary">Revenue Dashboard</h1>
            <p className="text-dc1-text-secondary mt-1">Platform revenue, fees, and top accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-dc1-text-secondary">Period:</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary rounded px-3 py-1.5 text-sm focus:outline-none focus:border-dc1-amber"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-status-error text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-dc1-amber border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-medium text-dc1-text-secondary uppercase tracking-wider mb-3">
                All-time totals
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Revenue"
                  value={formatSAR(revenue?.totals.total_sar ?? 0)}
                  accent="amber"
                  icon={<CurrencyIcon />}
                />
                <StatCard
                  label="Platform Fees (15%)"
                  value={formatSAR(revenue?.totals.platform_fees_sar ?? 0)}
                  accent="success"
                  icon={<ChartIcon />}
                />
                <StatCard
                  label="Provider Payouts (85%)"
                  value={formatSAR(revenue?.totals.provider_payouts_sar ?? 0)}
                  accent="info"
                  icon={<ServerIcon />}
                />
                <StatCard
                  label="Jobs Completed"
                  value={(revenue?.totals.total_jobs ?? 0).toLocaleString()}
                  accent="default"
                  icon={<BriefcaseIcon />}
                />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium text-dc1-text-secondary uppercase tracking-wider mb-3">
                Revenue by period
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Today" value={`SAR ${todaySAR}`} accent="amber" />
                <StatCard label="This week" value={`SAR ${weekSAR}`} accent="amber" />
                <StatCard label="This month" value={`SAR ${monthSAR}`} accent="amber" />
              </div>
            </div>

            <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
              <h2 className="text-base font-semibold text-dc1-text-primary mb-4">
                Daily revenue — last {Math.min(days, 14)} days
              </h2>
              <BarChart data={revenue?.by_day ?? []} />
            </div>

            <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
              <h2 className="text-base font-semibold text-dc1-text-primary mb-4">
                Daily breakdown ({days}-day window)
              </h2>
              {revenue && revenue.by_day.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className={`w-full text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
                    <thead>
                      <tr className="border-b border-dc1-border">
                        <th className="pb-3 text-dc1-text-secondary font-medium">Date</th>
                        <th className="pb-3 text-dc1-text-secondary font-medium text-right">Jobs</th>
                        <th className="pb-3 text-dc1-text-secondary font-medium text-right">Total (SAR)</th>
                        <th className="pb-3 text-dc1-text-secondary font-medium text-right">Platform (SAR)</th>
                        <th className="pb-3 text-dc1-text-secondary font-medium text-right">Providers (SAR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dc1-border">
                      {revenue.by_day.map((row) => (
                        <tr key={row.date} className="hover:bg-dc1-surface-l2 transition-colors">
                          <td className="py-2.5 font-mono text-dc1-text-primary" dir="ltr">{row.date}</td>
                          <td className="py-2.5 text-right text-dc1-text-secondary">{row.jobs}</td>
                          <td className="py-2.5 text-right font-mono text-dc1-amber" dir="ltr">{row.total_sar.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-mono text-status-success" dir="ltr">{row.platform_fees_sar.toFixed(2)}</td>
                          <td className="py-2.5 text-right font-mono text-status-info" dir="ltr">{row.provider_payouts_sar.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-dc1-text-muted text-sm">No completed jobs in this period.</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
                <h2 className="text-base font-semibold text-dc1-text-primary mb-4">Top 5 Renters by Spend</h2>
                {finance && finance.top_renters.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-border">
                        <th className="text-left pb-3 text-dc1-text-secondary font-medium">#</th>
                        <th className="text-left pb-3 text-dc1-text-secondary font-medium">Renter</th>
                        <th className="text-right pb-3 text-dc1-text-secondary font-medium">Spent (SAR)</th>
                        <th className="text-right pb-3 text-dc1-text-secondary font-medium">Jobs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dc1-border">
                      {finance.top_renters.map((r, i) => (
                        <tr key={r.id} className="hover:bg-dc1-surface-l2 transition-colors">
                          <td className="py-2.5 text-dc1-text-muted">{i + 1}</td>
                          <td className="py-2.5">
                            <p className="text-dc1-text-primary font-medium truncate max-w-[140px]">{r.name}</p>
                            <p className="text-dc1-text-muted text-xs truncate max-w-[140px]" dir="ltr">{r.email}</p>
                          </td>
                          <td className="py-2.5 text-right font-mono text-dc1-amber" dir="ltr">
                            {(r.total_spent / 100).toFixed(2)}
                          </td>
                          <td className="py-2.5 text-right text-dc1-text-secondary">{r.job_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-dc1-text-muted text-sm">No renter spend data yet.</p>
                )}
              </div>

              <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
                <h2 className="text-base font-semibold text-dc1-text-primary mb-4">Top 5 Providers by Job Count</h2>
                {finance && finance.top_providers.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-border">
                        <th className="text-left pb-3 text-dc1-text-secondary font-medium">#</th>
                        <th className="text-left pb-3 text-dc1-text-secondary font-medium">Provider</th>
                        <th className="text-right pb-3 text-dc1-text-secondary font-medium">Jobs</th>
                        <th className="text-right pb-3 text-dc1-text-secondary font-medium">Earned (SAR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dc1-border">
                      {finance.top_providers.map((p, i) => (
                        <tr key={p.id} className="hover:bg-dc1-surface-l2 transition-colors">
                          <td className="py-2.5 text-dc1-text-muted">{i + 1}</td>
                          <td className="py-2.5">
                            <p className="text-dc1-text-primary font-medium truncate max-w-[140px]">{p.name}</p>
                            <p className="text-dc1-text-muted text-xs" dir="ltr">{p.gpu_model}</p>
                          </td>
                          <td className="py-2.5 text-right text-dc1-text-secondary">{p.job_count}</td>
                          <td className="py-2.5 text-right font-mono text-status-success" dir="ltr">
                            {(p.total_earned / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-dc1-text-muted text-sm">No provider job data yet.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
