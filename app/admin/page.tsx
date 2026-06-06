'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../components/layout/DashboardLayout'
import StatCard from '../components/ui/StatCard'
import StatusBadge from '../components/ui/StatusBadge'
import { useLanguage } from '../lib/i18n'

const API_BASE = '/api'

interface NavItem { label: string; href: string; icon: React.ReactNode }

interface PricingRate {
  gpu_model: string
  rate_halala: number
  updated_at: string
}

interface EditModal {
  open: boolean
  isNew: boolean
  gpu_model: string
  rate_sar: string
  saving: boolean
  error: string
}

interface ProviderStatus {
  id: number
  name: string
  gpu_model: string
  status: string
  gpu_util_pct: number | null
  last_heartbeat: string | null
  jobs_today: number
  earnings_today_halala: number
  endpoint_url: string | null
  stake_status: string | null
  registered_at: string | null
}

interface AdminJob {
  job_id: string
  renter_id: string
  model: string
  provider_name: string
  status: string
  token_count: number | null
  cost_halala: number
  submitted_at: string
}

interface RevenueSummary {
  date: string
  gross_halala: number
  platform_fee_halala: number
  provider_earning_halala: number
}

interface ApiError {
  id: string | number
  message: string
  path: string | null
  created_at: string
}

interface AdminMetrics {
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

export default function AdminDashboard() {
  const router = useRouter()
  const { t, isRTL } = useLanguage()
  const [isAuthed, setIsAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [gpuBreakdown, setGpuBreakdown] = useState<any[]>([])
  const [recentSignups, setRecentSignups] = useState<any[]>([])
  const [recentHeartbeats, setRecentHeartbeats] = useState<any[]>([])

  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'health' | 'ops'>('overview')

  // Operations tab state
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providerSort, setProviderSort] = useState<{ col: 'status' | 'earnings'; dir: 'asc' | 'desc' }>({ col: 'status', dir: 'asc' })
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null)
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [revenue7d, setRevenue7d] = useState<RevenueSummary[]>([])
  const [revenueLoading, setRevenueLoading] = useState(false)
  const opsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Health tab enhanced state
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null)
  const [apiHealthLoading, setApiHealthLoading] = useState(false)
  const [apiErrors, setApiErrors] = useState<ApiError[]>([])
  const [errorsLoading, setErrorsLoading] = useState(false)
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pricing state
  const [pricingRates, setPricingRates] = useState<PricingRate[]>([])
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState('')
  const [modal, setModal] = useState<EditModal>({
    open: false, isNew: false, gpu_model: '', rate_sar: '', saving: false, error: '',
  })

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    if (!token) { router.push('/login'); return }
    setIsAuthed(true)

    const fetchDashboard = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/dashboard`, {
          headers: { 'x-admin-token': token },
        })
        if (!res.ok) {
          if (res.status === 401) { localStorage.removeItem('dc1_admin_token'); router.push('/login'); return }
          throw new Error('Failed to load dashboard')
        }
        const data = await res.json()
        // The Vercel-side route at app/api/admin/dashboard/route.ts wraps
        // the backend payload under .dashboard alongside .fleet, .activeJobs,
        // .reconciliation. Older builds returned the backend shape directly.
        // Accept either so the page renders no matter which response wins.
        const dash = data.dashboard || data
        setStats(dash.stats)
        setGpuBreakdown(dash.gpu_breakdown || [])
        setRecentSignups(dash.recent_signups || [])
        setRecentHeartbeats(dash.recent_heartbeats || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 30000)
    return () => clearInterval(interval)
  }, [router])

  const getToken = useCallback(
    () => (typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') || '' : ''),
    [],
  )

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true)
    setPricingError('')
    try {
      const res = await fetch(`${API_BASE}/admin/pricing`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (!res.ok) throw new Error('Failed to load pricing')
      const data = await res.json()
      setPricingRates(data.prices || [])
    } catch (err: any) {
      setPricingError(err.message)
    } finally {
      setPricingLoading(false)
    }
  }, [getToken])

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true)
    setMetricsError('')
    try {
      const res = await fetch(`${API_BASE}/admin/metrics`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (!res.ok) throw new Error('Failed to load system metrics')
      const data = await res.json()
      setMetrics(data)
    } catch (err: any) {
      setMetricsError(err.message)
    } finally {
      setMetricsLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (activeTab === 'pricing' && isAuthed) fetchPricing()
  }, [activeTab, isAuthed, fetchPricing])

  useEffect(() => {
    if (!isAuthed) return
    if (activeTab !== 'overview' && activeTab !== 'health') return
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [activeTab, isAuthed, fetchMetrics])

  const fetchProviders = useCallback(async () => {
    setProvidersLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/providers/status`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (res.ok) {
        const data = await res.json()
        const providerRows = data.providers || data || []
        setProviders(providerRows.map((p: any) => ({
          id: p.id,
          name: p.name || p.email || 'Unknown',
          gpu_model: p.gpu_model || null,
          status: p.is_online ? 'online' : 'offline',
          gpu_util_pct: p.gpu_util_pct ?? null,
          last_heartbeat: p.last_seen || null,
          jobs_today: p.active_jobs ?? 0,
          earnings_today_halala: 0,
          endpoint_url: null,
          stake_status: null,
          registered_at: null,
        })))
      }
    } catch { /* non-fatal */ } finally {
      setProvidersLoading(false)
    }
  }, [getToken])

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/jobs?status=running,completed&limit=20`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (res.ok) {
        const data = await res.json()
        const jobsArr = data.jobs || data || []
        setJobs(jobsArr.map((j: any) => ({
          ...j,
          token_count: (j.prompt_tokens || 0) + (j.completion_tokens || 0),
        })))
      }
    } catch { /* non-fatal */ } finally {
      setJobsLoading(false)
    }
  }, [getToken])

  const fetchRevenue7d = useCallback(async () => {
    setRevenueLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/revenue/summary`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (res.ok) {
        const data = await res.json()
        setRevenue7d(data.last_30_days || data.days || data || [])
      }
    } catch { /* non-fatal */ } finally {
      setRevenueLoading(false)
    }
  }, [getToken])

  const pingApiHealth = useCallback(async () => {
    setApiHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      setApiHealthy(res.ok)
    } catch {
      setApiHealthy(false)
    } finally {
      setApiHealthLoading(false)
    }
  }, [])

  const fetchApiErrors = useCallback(async () => {
    setErrorsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/errors?limit=5`, {
        headers: { 'x-admin-token': getToken() },
      })
      if (res.ok) {
        const data = await res.json()
        setApiErrors(data.errors || data || [])
      }
    } catch { /* non-fatal */ } finally {
      setErrorsLoading(false)
    }
  }, [getToken])

  // Ops tab: initial data fetch + 30s job refresh
  useEffect(() => {
    if (!isAuthed || activeTab !== 'ops') return
    fetchProviders()
    fetchJobs()
    fetchRevenue7d()
    const interval = setInterval(fetchJobs, 30000)
    opsIntervalRef.current = interval
    return () => {
      clearInterval(interval)
      opsIntervalRef.current = null
    }
  }, [activeTab, isAuthed, fetchProviders, fetchJobs, fetchRevenue7d])

  // Health tab: API ping every 60s + fetch errors
  useEffect(() => {
    if (!isAuthed || activeTab !== 'health') return
    pingApiHealth()
    fetchApiErrors()
    const interval = setInterval(pingApiHealth, 60000)
    healthIntervalRef.current = interval
    return () => {
      clearInterval(interval)
      healthIntervalRef.current = null
    }
  }, [activeTab, isAuthed, pingApiHealth, fetchApiErrors])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  const openEdit = (rate: PricingRate) => {
    setModal({
      open: true, isNew: false,
      gpu_model: rate.gpu_model,
      rate_sar: (rate.rate_halala / 100).toFixed(2),
      saving: false, error: '',
    })
    setHasUnsaved(true)
  }

  const openAdd = () => {
    setModal({ open: true, isNew: true, gpu_model: '', rate_sar: '', saving: false, error: '' })
    setHasUnsaved(true)
  }

  const closeModal = () => {
    setModal(m => ({ ...m, open: false }))
    setHasUnsaved(false)
  }

  const saveRate = async () => {
    const rateHalala = Math.round(parseFloat(modal.rate_sar) * 100)
    if (isNaN(rateHalala) || rateHalala <= 0) {
      setModal(m => ({ ...m, error: 'Enter a valid positive rate.' }))
      return
    }
    setModal(m => ({ ...m, saving: true, error: '' }))
    try {
      const token = getToken()
      if (modal.isNew) {
        const res = await fetch(`${API_BASE}/admin/pricing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ gpu_model: modal.gpu_model, rate_halala: rateHalala }),
        })
        if (!res.ok) throw new Error('Failed to add rate')
      } else {
        const res = await fetch(`${API_BASE}/admin/pricing/${encodeURIComponent(modal.gpu_model)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ rate_halala: rateHalala }),
        })
        if (!res.ok) throw new Error('Failed to update rate')
      }
      await fetchPricing()
      closeModal()
    } catch (err: any) {
      setModal(m => ({ ...m, saving: false, error: err.message }))
    }
  }

  if (!isAuthed) return <div className="flex items-center justify-center min-h-screen text-dc1-text-secondary">{t('common.loading')}</div>

  const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" /></svg>)
  const ServerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" /></svg>)
  const UsersIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>)
  const BriefcaseIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)
  const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>)
  const CpuIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>)
  const ContainerIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>)
  const BoltIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>)
  const CurrencyIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
  const WalletIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>)
  const GearIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>)

  const navItems: NavItem[] = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
    { label: 'Settings', href: '/admin/settings', icon: <GearIcon /> },
  ]

  const formatTime = (iso: string) => {
    if (!iso) return t('admin.never')
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const totalGpus = gpuBreakdown.reduce((sum: number, g: any) => sum + g.count, 0)

  // KPI computations
  const gmv = (stats?.total_revenue_halala || 0) / 100
  const mrr = (metrics?.revenue.this_month_halala || 0) / 100
  const totalRenters = stats?.total_renters || 0
  const arpu = totalRenters > 0 ? gmv / totalRenters : 0
  const breakevenTarget = 5357 // SAR/month from strategic brief
  const breakevenPct = breakevenTarget > 0 ? Math.min((mrr / breakevenTarget) * 100, 100) : 0
  const totalProviders = stats?.total_providers || 0
  const onlineProviders = stats?.online_now || 0
  const activationPct = totalProviders > 0 ? Math.min((onlineProviders / totalProviders) * 100, 100) : 0

  const tabClass = (tab: 'overview' | 'pricing' | 'health' | 'ops') =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-dc1-amber text-dc1-amber bg-dc1-surface-l2'
        : 'border-transparent text-dc1-text-secondary hover:text-dc1-text-primary'
    }`

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds < 60) return `${seconds || 0}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let idx = 0
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024
      idx += 1
    }
    return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`
  }

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary mb-2">{t('admin.dashboard')}</h1>
        <p className="text-dc1-text-secondary">{t('admin.live_overview')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dc1-border mb-6">
        <button className={tabClass('overview')} onClick={() => setActiveTab('overview')}>
          {t('admin.tab.overview')}
        </button>
        <button className={tabClass('pricing')} onClick={() => {
          if (hasUnsaved && !window.confirm(t('admin.pricing.unsavedWarning'))) return
          setActiveTab('pricing')
        }}>
          {t('admin.tab.pricing')}
        </button>
        <button className={tabClass('health')} onClick={() => {
          if (hasUnsaved && !window.confirm(t('admin.pricing.unsavedWarning'))) return
          setActiveTab('health')
        }}>
          {t('admin.tab.health')}
        </button>
        <button className={tabClass('ops')} onClick={() => {
          if (hasUnsaved && !window.confirm(t('admin.pricing.unsavedWarning'))) return
          setActiveTab('ops')
        }}>
          Operations
        </button>
      </div>

      {error && <div className="card mb-6 border-red-500/50 text-red-400 text-sm">{error}</div>}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        loading ? (
          <div className="text-dc1-text-secondary">{t('admin.loading')}</div>
        ) : (
          <>
            {/* Provider Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <StatCard label={t('admin.total_providers')} value={String(stats?.total_providers || 0)} accent="default" />
              <StatCard label={t('admin.online_now')} value={String(stats?.online_now || 0)} accent="success" />
              <StatCard label={t('admin.total_renters')} value={String(stats?.total_renters || 0)} accent="info" />
              <StatCard label={t('admin.active_jobs')} value={String(stats?.active_jobs || 0)} accent="amber" />
            </div>

            {/* Revenue Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard label={t('admin.total_revenue')} value={`${((stats?.total_revenue_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`} accent="success" />
              <StatCard label={t('admin.dc1_fees')} value={`${((stats?.total_dc1_fees_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`} accent="amber" />
              <StatCard label={t('admin.today_revenue')} value={`${((stats?.today_revenue_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`} accent="info" />
              <StatCard label={t('provider.jobs_completed')} value={String(stats?.completed_jobs || 0)} accent="default" />
            </div>

            {/* KPI Dashboard */}
            <div className="card mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="section-heading">KPI Dashboard</h2>
                {metricsLoading && (
                  <span className="text-xs text-dc1-text-muted">Updating…</span>
                )}
              </div>

              {/* Top KPI metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatCard
                  label="GMV (Total)"
                  value={`SAR ${gmv.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  accent="success"
                />
                <StatCard
                  label="MRR (This Month)"
                  value={`SAR ${mrr.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  accent="amber"
                />
                <StatCard
                  label="ARPU"
                  value={arpu > 0 ? `SAR ${arpu.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  accent="info"
                />
              </div>

              {/* Break-even progress bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-dc1-text-secondary font-medium">Break-even Progress</span>
                  <span className="text-dc1-text-secondary font-mono">
                    SAR {mrr.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / SAR 5,357
                  </span>
                </div>
                <div className="w-full bg-dc1-surface-l2 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-3 rounded-full transition-all duration-700"
                    style={{
                      width: `${breakevenPct}%`,
                      background: breakevenPct >= 100
                        ? 'var(--color-status-success, #10b981)'
                        : breakevenPct >= 50
                          ? '#f59e0b'
                          : '#2dd4b6',
                    }}
                  />
                </div>
                <p className="text-xs text-dc1-text-muted mt-1">
                  {breakevenPct.toFixed(1)}% of SAR 5,357/month break-even target
                </p>
              </div>

              {/* Provider activation rate */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-dc1-text-secondary font-medium">Provider Activation Rate</span>
                  <span className="text-dc1-text-secondary font-mono">
                    {onlineProviders} / {totalProviders} active
                  </span>
                </div>
                <div className="w-full bg-dc1-surface-l2 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-status-success h-3 rounded-full transition-all duration-700"
                    style={{ width: `${activationPct}%` }}
                  />
                </div>
                <p className="text-xs text-dc1-text-muted mt-1">
                  {activationPct.toFixed(1)}% activation rate (target: 60%)
                </p>
              </div>
            </div>

            {/* GPU Fleet */}
            <div className="card mb-8">
              <h2 className="section-heading mb-6">{t('admin.gpu_fleet')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {gpuBreakdown.map((g: any) => (
                  <div key={g.gpu_model} className="bg-dc1-surface-l2 rounded-lg p-4 border border-dc1-border/50 hover:border-dc1-amber/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-dc1-text-secondary mb-1">{g.gpu_model || t('marketplace.unknown')}</p>
                        <p className="text-2xl font-bold text-dc1-text-primary">{g.count}</p>
                        <p className="text-xs text-dc1-text-muted mt-1">{t('admin.providers_count')}</p>
                      </div>
                      <div className="w-12 h-12 bg-dc1-amber/10 rounded-lg flex items-center justify-center text-dc1-amber">
                        <BoltIcon />
                      </div>
                    </div>
                  </div>
                ))}
                {gpuBreakdown.length === 0 && <p className="text-dc1-text-muted text-sm col-span-3">{t('admin.no_gpu_data')}</p>}
              </div>
            </div>

            {/* Recent Signups */}
            <div className="card mb-8">
              <h2 className="section-heading mb-6">{t('admin.recent_signups')}</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>{t('table.name')}</th><th>{t('table.email')}</th><th>{t('table.gpu_model')}</th><th>{t('table.os')}</th><th>{t('table.joined')}</th></tr>
                  </thead>
                  <tbody>
                    {recentSignups.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-sm">{p.email}</td>
                        <td className="text-sm text-dc1-amber">{p.gpu_model || '—'}</td>
                        <td className="text-sm">{p.os || '—'}</td>
                        <td className="text-sm text-dc1-text-secondary">{formatTime(p.created_at)}</td>
                      </tr>
                    ))}
                    {recentSignups.length === 0 && <tr><td colSpan={5} className="text-dc1-text-muted text-sm">{t('admin.no_signups')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Heartbeats */}
            <div className="card">
              <h2 className="section-heading mb-6">{t('admin.recent_heartbeats')}</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>{t('table.provider')}</th><th>{t('table.gpu')}</th><th>{t('table.ip')}</th><th>{t('table.hostname')}</th><th>{t('table.last_seen')}</th></tr>
                  </thead>
                  <tbody>
                    {recentHeartbeats.map((h: any) => (
                      <tr key={h.id}>
                        <td className="font-medium">{h.name}</td>
                        <td className="text-sm text-dc1-amber">{h.gpu_model || '—'}</td>
                        <td className="text-sm font-mono">{h.provider_ip || '—'}</td>
                        <td className="text-sm">{h.provider_hostname || '—'}</td>
                        <td className="text-sm text-dc1-text-secondary">{formatTime(h.last_heartbeat)}</td>
                      </tr>
                    ))}
                    {recentHeartbeats.length === 0 && <tr><td colSpan={5} className="text-dc1-text-muted text-sm">{t('admin.no_heartbeats')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* Pricing Tab */}
      {activeTab === 'pricing' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="section-heading">{t('admin.pricing.title')}</h2>
            <button
              onClick={openAdd}
              className="btn-amber px-4 py-2 text-sm font-medium rounded-lg"
            >
              + {t('admin.pricing.addBtn')}
            </button>
          </div>

          {pricingError && <div className="mb-4 text-red-400 text-sm">{pricingError}</div>}

          {pricingLoading ? (
            <div className="text-dc1-text-secondary text-sm">{t('admin.loading')}</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className={isRTL ? 'text-right' : ''}>{t('admin.pricing.modelLabel')}</th>
                    <th className={isRTL ? 'text-right' : ''}>{t('admin.pricing.rateLabel')}</th>
                    <th className={isRTL ? 'text-right' : ''}>{t('admin.pricing.lastUpdated')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRates.map((rate) => (
                    <tr key={rate.gpu_model}>
                      <td className={`font-medium ${isRTL ? 'text-right' : ''}`}>{rate.gpu_model}</td>
                      <td className={`text-dc1-amber font-mono ${isRTL ? 'text-right' : ''}`}>
                        {(rate.rate_halala / 100).toFixed(2)} {t('common.sar')}
                      </td>
                      <td className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
                        {formatTime(rate.updated_at)}
                      </td>
                      <td className={isRTL ? 'text-left' : 'text-right'}>
                        <button
                          onClick={() => openEdit(rate)}
                          className="px-3 py-1 text-xs font-medium bg-dc1-amber/10 text-dc1-amber rounded hover:bg-dc1-amber/20 transition-colors"
                        >
                          {t('admin.pricing.editBtn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pricingRates.length === 0 && (
                    <tr><td colSpan={4} className="text-dc1-text-muted text-sm">{t('admin.pricing.noRates')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* System Health Tab */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {metricsError && <div className="card border-red-500/50 text-red-400 text-sm">{metricsError}</div>}

          {metricsLoading && !metrics ? (
            <div className="text-dc1-text-secondary text-sm">{t('admin.loading')}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  label={t('admin.health.queue_depth')}
                  value={String((metrics?.queue.pending_jobs || 0) + (metrics?.queue.running_jobs || 0))}
                  accent="amber"
                />
                <div className="bg-dc1-surface-l1 border rounded-lg p-5 transition-all duration-200 border-dc1-border hover:border-dc1-border-light">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-sm text-dc1-text-secondary">{t('admin.health.providers_online')}</p>
                    {(metrics?.providers.pending_approval || 0) > 0 && (
                      <span className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                        {t('admin.health.pending_approval_alert')}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-status-success">{metrics?.providers.online || 0}</p>
                </div>
                <StatCard
                  label={t('admin.health.today_revenue')}
                  value={`${((metrics?.revenue.today_halala || 0) / 100).toFixed(2)} ${t('common.sar')}`}
                  accent="success"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="section-heading">{t('admin.health.queue_title')}</h2>
                    {(metrics?.queue.failed_last_1h || 0) > 5 && (
                      <span className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                        {t('admin.health.failures_alert')}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.pending_jobs')}</p>
                      <p className="text-xl font-semibold text-dc1-text-primary">{metrics?.queue.pending_jobs || 0}</p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.running_jobs')}</p>
                      <p className="text-xl font-semibold text-status-info">{metrics?.queue.running_jobs || 0}</p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.failed_last_1h')}</p>
                      <p className={`text-xl font-semibold ${(metrics?.queue.failed_last_1h || 0) > 5 ? 'text-red-400' : 'text-dc1-text-primary'}`}>
                        {metrics?.queue.failed_last_1h || 0}
                      </p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.avg_wait')}</p>
                      <p className="text-xl font-semibold text-dc1-amber">{formatDuration(metrics?.queue.avg_wait_seconds || 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h2 className="section-heading mb-4">{t('admin.health.system_title')}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.pending_approval')}</p>
                      <p className={`text-xl font-semibold ${(metrics?.providers.pending_approval || 0) > 0 ? 'text-red-400' : 'text-status-success'}`}>
                        {metrics?.providers.pending_approval || 0}
                      </p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.avg_heartbeat_age')}</p>
                      <p className="text-xl font-semibold text-dc1-text-primary">{formatDuration(metrics?.providers.avg_heartbeat_age_seconds || 0)}</p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.service_uptime')}</p>
                      <p className="text-xl font-semibold text-dc1-text-primary">{formatDuration(metrics?.system.uptime_seconds || 0)}</p>
                    </div>
                    <div className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                      <p className="text-dc1-text-secondary">{t('admin.health.db_size')}</p>
                      <p className="text-xl font-semibold text-dc1-text-primary">{formatBytes(metrics?.system.db_size_bytes || 0)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-dc1-text-muted mt-4">
                    {t('admin.health.node_version')}: {metrics?.system.node_version || '—'}
                  </p>
                </div>
              </div>

              {/* API Health Ping */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="section-heading">API Health</h2>
                  {apiHealthLoading && <span className="text-xs text-dc1-text-muted">Checking…</span>}
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    apiHealthy === null ? 'bg-dc1-text-muted' :
                    apiHealthy ? 'bg-status-success animate-pulse' : 'bg-status-error animate-pulse'
                  }`} />
                  <span className={`text-sm font-medium ${
                    apiHealthy === null ? 'text-dc1-text-muted' :
                    apiHealthy ? 'text-status-success' : 'text-status-error'
                  }`}>
                    {apiHealthy === null ? 'Checking…' : apiHealthy ? 'api.dcp.sa — healthy' : 'api.dcp.sa — unreachable'}
                  </span>
                  <button
                    onClick={pingApiHealth}
                    className="ml-auto px-3 py-1 text-xs bg-dc1-surface-l2 text-dc1-text-secondary rounded hover:bg-dc1-surface-l3 transition-colors"
                  >
                    Ping now
                  </button>
                </div>
                <p className="text-xs text-dc1-text-muted mt-2">Auto-checks every 60s</p>
              </div>

              {/* Last 5 Errors */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="section-heading">Recent Errors</h2>
                  {errorsLoading && <span className="text-xs text-dc1-text-muted">Loading…</span>}
                </div>
                {apiErrors.length === 0 ? (
                  <p className="text-sm text-dc1-text-muted">{errorsLoading ? 'Fetching…' : 'No recent errors recorded.'}</p>
                ) : (
                  <div className="space-y-2">
                    {apiErrors.map((e, i) => (
                      <div key={String(e.id ?? i)} className="bg-dc1-surface-l2 border border-dc1-border/60 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-status-error font-mono truncate">{e.message}</p>
                          <span className="text-xs text-dc1-text-muted whitespace-nowrap">{e.created_at ? new Date(e.created_at).toLocaleTimeString() : '—'}</span>
                        </div>
                        {e.path && <p className="text-xs text-dc1-text-muted mt-1">{e.path}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Operations Tab */}
      {activeTab === 'ops' && (
        <div className="space-y-8">
          {/* Provider Status Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-heading">Provider Status</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {providersLoading && <span className="text-xs text-dc1-text-muted">Loading…</span>}
                <span className="text-xs text-dc1-text-secondary">Sort:</span>
                <button
                  onClick={() => setProviderSort(s => ({ col: 'status', dir: s.col === 'status' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  className={`px-2 py-1 text-xs rounded transition-colors ${providerSort.col === 'status' ? 'bg-dc1-amber/20 text-dc1-amber' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:bg-dc1-surface-l3'}`}
                >
                  Status {providerSort.col === 'status' ? (providerSort.dir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  onClick={() => setProviderSort(s => ({ col: 'earnings', dir: s.col === 'earnings' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                  className={`px-2 py-1 text-xs rounded transition-colors ${providerSort.col === 'earnings' ? 'bg-dc1-amber/20 text-dc1-amber' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:bg-dc1-surface-l3'}`}
                >
                  Earnings {providerSort.col === 'earnings' ? (providerSort.dir === 'desc' ? '↓' : '↑') : ''}
                </button>
                <button onClick={fetchProviders} className="px-2 py-1 text-xs bg-dc1-surface-l2 text-dc1-text-secondary rounded hover:bg-dc1-surface-l3 transition-colors">
                  Refresh
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>GPU</th>
                    <th>Status</th>
                    <th>GPU Util</th>
                    <th>Last Heartbeat</th>
                    <th>Jobs Today</th>
                    <th>Earnings Today</th>
                  </tr>
                </thead>
                <tbody>
                  {[...providers]
                    .sort((a, b) => {
                      if (providerSort.col === 'status') {
                        const order: Record<string, number> = { online: 0, offline: 1 }
                        const av = order[a.status] ?? 2
                        const bv = order[b.status] ?? 2
                        return providerSort.dir === 'asc' ? av - bv : bv - av
                      }
                      const ae = a.earnings_today_halala ?? 0
                      const be = b.earnings_today_halala ?? 0
                      return providerSort.dir === 'desc' ? be - ae : ae - be
                    })
                    .flatMap(p => {
                      const rows = [
                        <tr
                          key={p.id}
                          className="cursor-pointer hover:bg-dc1-surface-l2/50 transition-colors"
                          onClick={() => setExpandedProvider(expandedProvider === p.id ? null : p.id)}
                        >
                          <td className="font-medium">
                            <span className="mr-1 text-dc1-text-muted text-xs">{expandedProvider === p.id ? '▼' : '▶'}</span>
                            {p.name}
                          </td>
                          <td className="text-dc1-amber text-sm">{p.gpu_model || '—'}</td>
                          <td><StatusBadge status={p.status === 'online' ? 'online' : 'offline'} /></td>
                          <td className="text-sm font-mono">{p.gpu_util_pct !== null ? `${p.gpu_util_pct}%` : '—'}</td>
                          <td className="text-sm text-dc1-text-secondary">
                            {p.last_heartbeat ? new Date(p.last_heartbeat).toLocaleTimeString() : '—'}
                          </td>
                          <td className="text-sm">{p.jobs_today ?? 0}</td>
                          <td className="text-sm font-mono text-status-success">
                            {((p.earnings_today_halala ?? 0) / 100).toFixed(2)} SAR
                          </td>
                        </tr>,
                      ]
                      if (expandedProvider === p.id) {
                        rows.push(
                          <tr key={`${p.id}-x`} className="bg-dc1-surface-l2/30">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div>
                                  <p className="text-dc1-text-muted text-xs mb-1">Endpoint URL</p>
                                  <p className="font-mono text-dc1-text-secondary break-all">{p.endpoint_url || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-dc1-text-muted text-xs mb-1">Stake Status</p>
                                  <p className="text-dc1-text-secondary">{p.stake_status || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-dc1-text-muted text-xs mb-1">Registered</p>
                                  <p className="text-dc1-text-secondary">{p.registered_at ? new Date(p.registered_at).toLocaleDateString() : '—'}</p>
                                </div>
                              </div>
                            </td>
                          </tr>,
                        )
                      }
                      return rows
                    })}
                  {providers.length === 0 && (
                    <tr><td colSpan={7} className="text-dc1-text-muted text-sm">{providersLoading ? 'Loading providers…' : 'No providers found.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Job Feed */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-heading">Live Job Feed</h2>
              <div className="flex items-center gap-2">
                {jobsLoading && <span className="text-xs text-dc1-text-muted">Refreshing…</span>}
                <span className="text-xs text-dc1-text-muted">Auto-refresh 30s</span>
                <button onClick={fetchJobs} className="px-2 py-1 text-xs bg-dc1-surface-l2 text-dc1-text-secondary rounded hover:bg-dc1-surface-l3 transition-colors">
                  Refresh now
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Renter</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j, i) => (
                    <tr key={j.job_id ?? i}>
                      <td className="font-mono text-xs text-dc1-text-secondary">{j.job_id ? `${j.job_id.slice(0, 8)}…` : '—'}</td>
                      <td className="text-sm font-mono text-dc1-text-muted">{j.renter_id ? `${j.renter_id.slice(0, 6)}…` : '—'}</td>
                      <td className="text-sm text-dc1-amber">{j.model || '—'}</td>
                      <td className="text-sm">{j.provider_name || '—'}</td>
                      <td><StatusBadge status={j.status as 'running' | 'completed' | 'failed' | 'pending'} /></td>
                      <td className="text-sm font-mono">{j.token_count ?? '—'}</td>
                      <td className="text-sm font-mono text-status-success">{((j.cost_halala ?? 0) / 100).toFixed(4)} SAR</td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr><td colSpan={7} className="text-dc1-text-muted text-sm">{jobsLoading ? 'Loading jobs…' : 'No recent jobs.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 7-Day Revenue Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-heading">7-Day Revenue</h2>
              {revenueLoading && <span className="text-xs text-dc1-text-muted">Loading…</span>}
            </div>
            {revenue7d.length === 0 ? (
              <p className="text-sm text-dc1-text-muted">{revenueLoading ? 'Loading revenue data…' : 'No revenue data available yet.'}</p>
            ) : (() => {
              const maxGross = Math.max(...revenue7d.map(d => d.gross_halala || 0), 1)
              return (
                <div>
                  <div className="flex items-end gap-2 h-32 mb-3">
                    {revenue7d.slice(-7).map((day, i) => {
                      const gross = day.gross_halala || 0
                      const fee = day.platform_fee_halala || 0
                      const pct = Math.max((gross / maxGross) * 100, 2)
                      return (
                        <div key={day.date ?? i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t-sm bg-dc1-amber/60 hover:bg-dc1-amber/80 transition-colors relative group"
                            style={{ height: `${pct}%` }}
                          >
                            <div
                              className="absolute inset-x-0 bottom-0 rounded-t-sm bg-status-success/80"
                              style={{ height: `${fee > 0 && gross > 0 ? (fee / gross) * 100 : 0}%` }}
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-dc1-surface-l1 border border-dc1-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg pointer-events-none">
                              {(gross / 100).toFixed(2)} SAR gross
                            </div>
                          </div>
                          <span className="text-xs text-dc1-text-muted">
                            {day.date ? new Date(day.date).toLocaleDateString('en-SA', { month: 'short', day: 'numeric' }) : `D${i + 1}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-dc1-amber/60" />
                      <span className="text-xs text-dc1-text-muted">Gross revenue</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-status-success/80" />
                      <span className="text-xs text-dc1-text-muted">Platform fee (15%)</span>
                    </div>
                    <div className="ml-auto text-xs text-dc1-text-secondary font-mono">
                      7d total: {(revenue7d.reduce((s, d) => s + (d.gross_halala || 0), 0) / 100).toFixed(2)} SAR
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Edit / Add Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dc1-surface-l1 border border-dc1-border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-dc1-text-primary mb-4">
              {modal.isNew ? t('admin.pricing.addTitle') : t('admin.pricing.editTitle')}
            </h3>

            {modal.isNew && (
              <div className="mb-4">
                <label className="block text-sm text-dc1-text-secondary mb-1">
                  {t('admin.pricing.modelLabel')}
                </label>
                <input
                  type="text"
                  value={modal.gpu_model}
                  onChange={e => setModal(m => ({ ...m, gpu_model: e.target.value }))}
                  placeholder={t('admin.pricing.modelPlaceholder')}
                  className="input w-full"
                  dir="ltr"
                />
              </div>
            )}

            {!modal.isNew && (
              <p className="text-sm text-dc1-text-secondary mb-4 font-medium">{modal.gpu_model}</p>
            )}

            <div className="mb-4">
              <label className="block text-sm text-dc1-text-secondary mb-1">
                {t('admin.pricing.rateLabel')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={modal.rate_sar}
                onChange={e => setModal(m => ({ ...m, rate_sar: e.target.value }))}
                className="input w-full"
                dir="ltr"
                placeholder="0.00"
              />
              <p className="text-xs text-dc1-text-muted mt-1">{t('common.sar')}/hr</p>
            </div>

            {modal.error && <p className="text-red-400 text-sm mb-4">{modal.error}</p>}

            <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={saveRate}
                disabled={modal.saving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-dc1-amber text-dc1-void rounded-lg hover:bg-dc1-amber/90 transition-colors disabled:opacity-60"
              >
                {modal.saving ? t('admin.pricing.saving') : t('admin.pricing.saveBtn')}
              </button>
              <button
                onClick={closeModal}
                disabled={modal.saving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-dc1-surface-l2 text-dc1-text-secondary rounded-lg hover:bg-dc1-surface-l3 transition-colors"
              >
                {t('admin.pricing.cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
