'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'
const SAR_USD_RATE = 3.75

// Nav icons (mirroring the rest of /admin/* pages so the chrome stays consistent).
const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)

interface RateRow {
  model: string
  model_class: string | null
  token_rate_halala: number
}

interface TierRow {
  tier: string
  count: number
  mrr_sar: number
}

interface PricingSummary {
  generated_at: string
  mrr_sar: number
  active_count: number
  by_tier: TierRow[]
  credits_outstanding_halala: number
  rate_card: RateRow[]
}

const CLASS_ORDER: Record<string, number> = {
  tiny: 1, small: 2, medium: 3, large: 4, embedding: 5,
}

const TIER_LABEL: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
}

const halalaPerMTokenToUsdPerM = (h: number) => h / 100 / SAR_USD_RATE
const halalaToSar = (h: number) => (h || 0) / 100

export default function AdminPricingPage() {
  const router = useRouter()
  const { t, dir } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<PricingSummary | null>(null)
  const [error, setError] = useState('')

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: 'Pricing', href: '/admin/pricing', icon: <CurrencyIcon /> },
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
        const res = await fetch(`${API_BASE}/admin/subscriptions/summary`, { headers })
        if (res.status === 401) {
          localStorage.removeItem('dc1_admin_token')
          router.push('/login')
          return
        }
        if (!res.ok) throw new Error('Failed to fetch pricing summary')
        const data: PricingSummary = await res.json()
        setSummary(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [router])

  const sortedRateCard = (summary?.rate_card || [])
    .slice()
    .sort((a, b) => {
      const ka = CLASS_ORDER[a.model_class || ''] || 99
      const kb = CLASS_ORDER[b.model_class || ''] || 99
      if (ka !== kb) return ka - kb
      return a.token_rate_halala - b.token_rate_halala
    })

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-8" dir={dir}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-dc1-text-primary">Pricing &amp; Subscriptions</h1>
            <p className="text-dc1-text-secondary mt-1">
              Live PAYG rate card and subscription MRR. Edit via SQL migration; UI editor in v2.
            </p>
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
                Subscriptions overview
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Monthly recurring revenue"
                  value={`SAR ${(summary?.mrr_sar ?? 0).toLocaleString()}`}
                  accent="amber"
                  icon={<CurrencyIcon />}
                />
                <StatCard
                  label="Active subscriptions"
                  value={String(summary?.active_count ?? 0)}
                  accent="info"
                  icon={<UsersIcon />}
                />
                <StatCard
                  label="Credits outstanding"
                  value={`SAR ${halalaToSar(summary?.credits_outstanding_halala ?? 0).toFixed(2)}`}
                  accent="default"
                  icon={<WalletIcon />}
                />
              </div>
            </div>

            <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
              <h2 className="text-base font-semibold text-dc1-text-primary mb-4">
                Subscriptions by tier
              </h2>
              {summary && summary.by_tier.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-dc1-text-muted border-b border-dc1-border">
                        <th className="py-2 pr-4 font-medium">Tier</th>
                        <th className="py-2 pr-4 font-medium">Active subs</th>
                        <th className="py-2 pr-4 font-medium">MRR (SAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_tier.map((row) => (
                        <tr key={row.tier} className="border-b border-dc1-border/40">
                          <td className="py-2 pr-4 text-dc1-text-primary">
                            {TIER_LABEL[row.tier] || row.tier}
                          </td>
                          <td className="py-2 pr-4 font-mono text-dc1-text-secondary">{row.count}</td>
                          <td className="py-2 pr-4 font-mono text-dc1-amber">
                            {row.mrr_sar.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-dc1-text-muted">No active subscriptions yet.</p>
              )}
            </div>

            <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-6">
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-base font-semibold text-dc1-text-primary">
                  PAYG rate card
                </h2>
                <p className="text-xs text-dc1-text-muted">
                  Read-only. Rates live in <code className="text-dc1-amber">cost_rates</code>; edit via migration.
                </p>
              </div>
              {sortedRateCard.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-dc1-text-muted border-b border-dc1-border">
                        <th className="py-2 pr-4 font-medium">Model</th>
                        <th className="py-2 pr-4 font-medium">Class</th>
                        <th className="py-2 pr-4 font-medium text-right">Halala / M tokens</th>
                        <th className="py-2 pr-4 font-medium text-right">USD / M tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRateCard.map((row) => (
                        <tr key={row.model} className="border-b border-dc1-border/40">
                          <td className="py-2 pr-4 font-mono text-dc1-text-primary">{row.model}</td>
                          <td className="py-2 pr-4 text-dc1-text-secondary">
                            {row.model_class || '—'}
                          </td>
                          <td className="py-2 pr-4 font-mono text-dc1-text-secondary text-right">
                            {row.token_rate_halala.toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 font-mono text-dc1-amber text-right">
                            ${halalaPerMTokenToUsdPerM(row.token_rate_halala).toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-dc1-text-muted">No active rates loaded.</p>
              )}
            </div>

            {summary?.generated_at && (
              <p className="text-xs text-dc1-text-muted">
                Generated {new Date(summary.generated_at).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
