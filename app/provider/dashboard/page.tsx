'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatCard from '../../components/ui/StatCard'
import { useLanguage } from '../../lib/i18n'
import { StakeWidget } from '../components/StakeWidget'

const API_BASE = '/api'

const GPU_MARKET_PRICES_SAR: Record<string, number> = {
  'RTX 4090': 7500,
  'RTX 4080 Super': 5000,
  'RTX 4080': 4500,
  'RTX 3090': 3000,
  'RTX 3080': 2000,
  'H200': 225000,
  'H100': 150000,
  'A100': 75000,
  'L40S': 60000,
  'RTX 3060 Ti': 1500,
}

function getGpuMarketPriceSar(gpuModel: string): number | null {
  if (!gpuModel) return null
  const entry = Object.entries(GPU_MARKET_PRICES_SAR).find(([k]) =>
    gpuModel.toLowerCase().includes(k.toLowerCase())
  )
  return entry ? entry[1] : null
}

interface SparkPoint { date: string; earnings_halala: number }

function Sparkline({ data }: { data: SparkPoint[] }) {
  if (data.length < 2) {
    return <div className="h-12 flex items-center justify-center text-xs text-dc1-text-muted">No data yet</div>
  }
  const W = 280; const H = 48
  const PL = 4; const PR = 4; const PT = 4
  const cw = W - PL - PR; const ch = H - PT - 4
  const n = data.length
  const maxVal = Math.max(...data.map(d => d.earnings_halala), 1)
  const pts = data.map((d, i) => ({
    x: PL + (i / (n - 1)) * cw,
    y: PT + ch - (d.earnings_halala / maxVal) * ch,
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${pts[n-1].x.toFixed(1)} ${(PT+ch).toFixed(1)} L ${PL} ${(PT+ch).toFixed(1)} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5A524" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F5A524" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkGrad)" />
      <path d={pathD} fill="none" stroke="#F5A524" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusDot({ earning, online }: { earning: boolean; online: boolean }) {
  if (earning) return (
    <span className="relative flex h-3 w-3 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-status-success" />
    </span>
  )
  if (online) return <span className="inline-flex rounded-full h-3 w-3 bg-status-success flex-shrink-0" />
  return <span className="inline-flex rounded-full h-3 w-3 bg-dc1-text-muted flex-shrink-0" />
}

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 5v14a1 1 0 001 1h12a1 1 0 001-1V5m-9 9h4" />
  </svg>
)
const LightningIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const CurrencyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const GpuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6M9 8h6" />
  </svg>
)

interface ProviderInfo {
  name: string; status: 'online' | 'offline'; isPaused: boolean
  gpuModel: string; gpuUtil: number; vramUtil: number; activeJobId: string | null
  totalEarningsHalala: number; todayEarningsHalala: number; monthEarningsHalala: number
}
interface MetricsStats {
  jobsCompleted: number; avgJobDurationMinutes: number
  totalEarningsSar: number; uptimeHours7d: number
}
interface RecentJob {
  jobId: string; jobType: string; status: string
  durationMinutes: number; earningsHalala: number; completedAt: string
}

export default function ProviderEarningsDashboard() {
  const router = useRouter()
  const { t, isRTL } = useLanguage()
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const [metrics, setMetrics] = useState<MetricsStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [spark, setSpark] = useState<SparkPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingPause, setTogglingPause] = useState(false)
  const [jobPage, setJobPage] = useState(0)
  const JOBS_PER_PAGE = 5

  const FleetIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
  const navItems = [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]

  const loadData = useCallback(async () => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key) { router.push('/login?role=provider&method=apikey&reason=missing_credentials'); return }
    try {
      const [meRes, metricsRes, sparkRes] = await Promise.all([
        fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(key)}`),
        fetch(`${API_BASE}/providers/me/metrics?key=${encodeURIComponent(key)}`),
        fetch(`${API_BASE}/providers/earnings-daily?key=${encodeURIComponent(key)}&days=7`),
      ])
      if (!meRes.ok) {
        if (meRes.status === 401 || meRes.status === 403) {
          localStorage.removeItem('dc1_provider_key')
          router.push('/login?role=provider&method=apikey&reason=invalid_credentials')
        }
        return
      }
      const meData = await meRes.json()
      const p = meData.provider || {}
      setProvider({
        name: p.name || 'Provider',
        status: p.status === 'online' || p.status === 'idle' ? 'online' : 'offline',
        isPaused: Boolean(p.is_paused),
        gpuModel: p.gpu_model || 'Unknown GPU',
        gpuUtil: Number(p.gpu_usage || 0),
        vramUtil: Number(p.vram_usage || 0),
        activeJobId: p.active_job?.job_id || null,
        totalEarningsHalala: Number(p.total_earnings_halala || 0),
        todayEarningsHalala: Number(p.today_earnings_halala || 0),
        monthEarningsHalala: Number(p.month_earnings_halala || 0),
      })
      if (metricsRes.ok) {
        const m = await metricsRes.json()
        const s = m.stats || {}
        setMetrics({
          jobsCompleted: Number(s.jobs_completed || 0),
          avgJobDurationMinutes: Number(s.avg_job_duration_minutes || 0),
          totalEarningsSar: Number(s.earnings_sar || 0),
          uptimeHours7d: Number(s.uptime_hours_last_7d || 0),
        })
        setRecentJobs((m.recent_jobs || []).map((j: any) => ({
          jobId: String(j.job_id || j.id || ''),
          jobType: String(j.job_type || 'inference'),
          status: String(j.status || 'completed'),
          durationMinutes: Number(j.duration_minutes || 0),
          earningsHalala: Number(j.earnings_halala || 0),
          completedAt: String(j.completed_at || ''),
        })))
      }
      if (sparkRes.ok) {
        const sd = await sparkRes.json()
        setSpark((sd.daily || []).map((d: any) => ({
          date: String(d.day || d.date || ''),
          earnings_halala: Number(d.earned_halala || d.earnings_halala || 0),
        })))
      }
    } catch { /* keep stale data */ }
    finally { setLoading(false) }
  }, [router])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  const handlePauseResume = async () => {
    const key = localStorage.getItem('dc1_provider_key')
    if (!key || !provider) return
    setTogglingPause(true)
    try {
      const endpoint = provider.isPaused ? 'resume' : 'pause'
      const res = await fetch(`${API_BASE}/providers/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (res.ok) {
        const data = await res.json()
        setProvider(prev => prev ? {
          ...prev, isPaused: endpoint === 'pause',
          status: data.status === 'online' || data.status === 'idle' ? 'online' : 'offline',
        } : prev)
      }
    } catch { /* sync on next poll */ }
    finally { setTogglingPause(false) }
  }

  const isOnline = provider?.status === 'online' && !provider?.isPaused
  const isEarning = isOnline && Boolean(provider?.activeJobId)
  const todaySar = (provider?.todayEarningsHalala ?? 0) / 100
  const monthSar = (provider?.monthEarningsHalala ?? 0) / 100
  const totalSar = (provider?.totalEarningsHalala ?? 0) / 100
  const spark7dTotal = spark.reduce((s, d) => s + d.earnings_halala, 0)
  const projectedMonthSar = spark7dTotal > 0 ? (spark7dTotal / 7) * 30 / 100 : 0
  const gpuPriceSar = provider ? getGpuMarketPriceSar(provider.gpuModel) : null
  const paybackPct = gpuPriceSar && totalSar > 0 ? Math.min(100, Math.round((totalSar / gpuPriceSar) * 100)) : null
  const uptimePct = metrics ? Math.min(100, Math.round((metrics.uptimeHours7d / 168) * 100)) : 0
  const totalPages = Math.ceil(recentJobs.length / JOBS_PER_PAGE)
  const pagedJobs = recentJobs.slice(jobPage * JOBS_PER_PAGE, (jobPage + 1) * JOBS_PER_PAGE)

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="space-y-6">
          <div className="h-8 w-56 bg-dc1-surface-l2 rounded skeleton" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <div key={i} className="h-24 bg-dc1-surface-l2 rounded-lg skeleton" />)}
          </div>
          <div className="h-36 bg-dc1-surface-l2 rounded-xl skeleton" />
          <div className="h-48 bg-dc1-surface-l2 rounded-xl skeleton" />
          <div className="h-64 bg-dc1-surface-l2 rounded-xl skeleton" />
        </div>
      </DashboardLayout>
    )
  }

  if (!provider) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="card">
          <p className="text-dc1-text-secondary">Failed to load provider data.</p>
          <button onClick={loadData} className="mt-4 btn-primary">Retry</button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="provider" userName={provider.name}>
      <div className="space-y-6 overflow-x-hidden" dir={isRTL ? 'rtl' : 'ltr'}>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold font-poppins text-dc1-text-primary">Earnings Dashboard</h1>
          <Link href="/provider/earnings" className="text-sm text-dc1-amber hover:underline">Full earnings report →</Link>
        </div>

        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Jobs Served" value={metrics?.jobsCompleted ?? 0} />
          <StatCard label="Avg Job Duration" value={metrics ? `${metrics.avgJobDurationMinutes.toFixed(1)} min` : '—'} />
          <StatCard label="Uptime (7 days)" value={`${uptimePct}%`} accent={uptimePct >= 70 ? 'success' : uptimePct >= 40 ? 'amber' : 'default'} />
          <StatCard label="Total Earned" value={`${totalSar.toFixed(2)} SAR`} accent="amber" />
        </div>

        <div className={`rounded-xl border p-5 transition-colors ${isEarning ? 'border-status-success/40 bg-status-success/5' : 'border-dc1-border bg-dc1-surface-l1'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot earning={isEarning} online={isOnline} />
                <span className={`text-sm font-semibold ${isEarning ? 'text-status-success' : isOnline ? 'text-dc1-text-primary' : 'text-dc1-text-muted'}`}>
                  {isEarning ? '⚡ Earning' : isOnline ? 'Online — Idle' : 'Offline'}
                </span>
                {provider.isPaused && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-status-warning/20 text-status-warning border border-status-warning/30">Paused</span>
                )}
              </div>
              <p className="text-dc1-text-secondary text-sm truncate">{provider.gpuModel}</p>
              {isEarning && provider.activeJobId && (
                <p className="text-xs text-dc1-text-muted mt-0.5 font-mono">Job: {provider.activeJobId}</p>
              )}
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <div>
                <div className="flex justify-between text-xs text-dc1-text-muted mb-1"><span>GPU Util</span><span>{provider.gpuUtil}%</span></div>
                <div className="h-2 rounded-full bg-dc1-surface-l3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${provider.gpuUtil > 80 ? 'bg-status-success' : provider.gpuUtil > 30 ? 'bg-dc1-amber' : 'bg-dc1-border'}`} style={{ width: `${provider.gpuUtil}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-dc1-text-muted mb-1"><span>VRAM</span><span>{provider.vramUtil}%</span></div>
                <div className="h-2 rounded-full bg-dc1-surface-l3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${provider.vramUtil > 90 ? 'bg-status-error' : provider.vramUtil > 60 ? 'bg-dc1-amber' : 'bg-status-info'}`} style={{ width: `${provider.vramUtil}%` }} />
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <button onClick={handlePauseResume} disabled={togglingPause}
                className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${provider.isPaused ? 'bg-status-success/20 text-status-success hover:bg-status-success/30 border border-status-success/30' : 'bg-status-warning/20 text-status-warning hover:bg-status-warning/30 border border-status-warning/30'}`}>
                {togglingPause ? 'Updating…' : provider.isPaused ? 'Go Online' : 'Pause GPU'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 space-y-5">
          <h2 className="text-base font-semibold font-poppins text-dc1-text-primary">Earnings Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-dc1-surface-l2 p-4">
              <p className="text-xs text-dc1-text-muted mb-1">Today</p>
              <p className="text-xl font-bold text-dc1-amber">{todaySar.toFixed(2)} SAR</p>
              <p className="text-xs text-dc1-text-muted">{provider.todayEarningsHalala.toLocaleString()} halala</p>
            </div>
            <div className="rounded-lg bg-dc1-surface-l2 p-4">
              <p className="text-xs text-dc1-text-muted mb-1">This Month</p>
              <p className="text-xl font-bold text-dc1-text-primary">{monthSar.toFixed(2)} SAR</p>
              {projectedMonthSar > monthSar && (
                <p className="text-xs text-status-info">Projected: {projectedMonthSar.toFixed(0)} SAR/mo</p>
              )}
            </div>
            <div className="rounded-lg bg-dc1-surface-l2 p-4">
              <p className="text-xs text-dc1-text-muted mb-1">GPU Payback</p>
              {paybackPct !== null ? (
                <>
                  <p className="text-xl font-bold text-dc1-text-primary">{paybackPct}%</p>
                  <p className="text-xs text-dc1-text-muted">{totalSar.toFixed(0)} / {gpuPriceSar!.toLocaleString()} SAR</p>
                  <div className="mt-2 h-1.5 rounded-full bg-dc1-surface-l3 overflow-hidden">
                    <div className="h-full rounded-full bg-status-success transition-all duration-700" style={{ width: `${paybackPct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-dc1-text-muted">
                  Set GPU in <Link href="/provider/settings" className="text-dc1-amber hover:underline">Settings</Link> to track payback
                </p>
              )}
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-dc1-text-muted mb-1">
              <span>7-Day Earnings (SAR)</span>
              {spark7dTotal > 0 && <span className="text-dc1-amber">{(spark7dTotal / 100).toFixed(2)} SAR total</span>}
            </div>
            <Sparkline data={spark} />
            {spark.length >= 2 && (
              <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
                <span>{new Date(spark[0].date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(spark[spark.length-1].date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </div>
        </div>

        <StakeWidget />

        <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold font-poppins text-dc1-text-primary">Recent Jobs</h2>
            <Link href="/provider/jobs" className="text-sm text-dc1-amber hover:underline">All jobs →</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="py-10 text-center text-dc1-text-muted text-sm">No jobs yet — go online to start earning.</div>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-5 gap-3 px-3 py-2 text-xs font-medium text-dc1-text-muted border-b border-dc1-border">
                <span>Job ID</span><span>Type</span><span>Duration</span>
                <span className="text-right">Earned</span><span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-dc1-border/40">
                {pagedJobs.map(job => (
                  <div key={job.jobId}>
                    <div className="sm:hidden px-3 py-3 hover:bg-dc1-surface-l2 transition-colors rounded">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-dc1-text-secondary font-mono text-xs truncate">
                          {job.jobId.length > 14 ? `${job.jobId.slice(0, 12)}…` : job.jobId}
                        </span>
                        <span className={`text-xs font-medium capitalize ${job.status === 'completed' ? 'text-status-success' : 'text-status-error'}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-dc1-surface-l2 px-2 py-1.5">
                          <p className="text-dc1-text-muted">Type</p>
                          <p className="text-dc1-text-secondary capitalize">{job.jobType}</p>
                        </div>
                        <div className="rounded-md bg-dc1-surface-l2 px-2 py-1.5">
                          <p className="text-dc1-text-muted">Duration</p>
                          <p className="text-dc1-text-secondary">{job.durationMinutes.toFixed(1)} min</p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-medium text-dc1-amber">
                        {(job.earningsHalala / 100).toFixed(4)} SAR
                      </p>
                    </div>

                    <div className="hidden sm:grid grid-cols-5 gap-3 px-3 py-3 text-sm hover:bg-dc1-surface-l2 transition-colors rounded">
                      <span className="text-dc1-text-secondary font-mono text-xs truncate">
                        {job.jobId.length > 14 ? `${job.jobId.slice(0, 12)}…` : job.jobId}
                      </span>
                      <span className="text-dc1-text-secondary capitalize">{job.jobType}</span>
                      <span className="text-dc1-text-secondary">{job.durationMinutes.toFixed(1)} min</span>
                      <span className="text-dc1-amber font-medium text-right">{(job.earningsHalala / 100).toFixed(4)} SAR</span>
                      <span className={`text-right text-xs font-medium ${job.status === 'completed' ? 'text-status-success' : 'text-status-error'}`}>
                        {job.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-dc1-border">
                  <button onClick={() => setJobPage(p => Math.max(0, p-1))} disabled={jobPage === 0}
                    className="text-sm text-dc1-text-secondary disabled:opacity-40 hover:text-dc1-text-primary transition-colors">← Previous</button>
                  <span className="text-xs text-dc1-text-muted">{jobPage+1} of {totalPages}</span>
                  <button onClick={() => setJobPage(p => Math.min(totalPages-1, p+1))} disabled={jobPage === totalPages-1}
                    className="text-sm text-dc1-text-secondary disabled:opacity-40 hover:text-dc1-text-primary transition-colors">Next →</button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
