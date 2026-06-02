'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './usage.css'

const HALALA_PER_SAR = 100

const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/v2/renter/usage' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/v2/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/v2/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'usage'
const PERIODS = ['7d', '30d', '90d'] as const

type Period = (typeof PERIODS)[number]
type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface RenterAccount {
  name?: string
  email?: string
  organization?: string
  balance_halala?: number
  total_spent_halala?: number
  total_jobs?: number
}

interface RenterMeResponse {
  renter?: RenterAccount
  v1_usage_summary?: {
    total_requests?: number
    total_tokens?: number
    total_cost_halala?: number
  }
}

interface RenterBalanceResponse {
  balance_halala?: number
  balance_sar?: number
  held_halala?: number
  held_sar?: number
  total_spent_halala?: number
  total_spent_sar?: number
  total_jobs?: number
}

interface AnalyticsDay {
  day?: string
  date?: string
  total_halala?: number
  job_count?: number
  jobs?: number
}

interface StatusCount {
  status: string
  count: number
}

interface TopGpu {
  gpu_model?: string
  job_count?: number
  total_halala?: number
}

interface AnalyticsResponse {
  period?: string
  daily_spend?: AnalyticsDay[]
  status_counts?: StatusCount[]
  avg_duration_minutes?: number | null
  completed_job_count?: number
  top_gpus?: TopGpu[]
  v1_usage?: {
    daily?: Array<{ day?: string; total_halala?: number; request_count?: number; total_tokens?: number }>
    totals?: { total_requests?: number; total_tokens?: number; total_cost_halala?: number }
  }
}

interface JobRecord {
  id?: number
  job_id?: string
  job_type?: string
  model?: string | null
  status?: string
  cost_halala?: number
  cost_sar?: string | number
  submitted_at?: string
  started_at?: string | null
  completed_at?: string | null
  duration_minutes?: number | null
  provider_gpu?: string | null
}

interface JobsResponse {
  jobs?: JobRecord[]
  pagination?: { page?: number; limit?: number; total?: number; pages?: number }
}

interface UsageRecord {
  id?: number
  request_id?: string
  model?: string
  source?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost_halala?: number
  created_at?: string
  settlement_status?: string
}

interface UsageResponse {
  usage?: UsageRecord[]
  totals?: {
    total_requests?: number
    total_tokens?: number
    total_cost_halala?: number
    total_cost_sar?: string | number
  }
}

interface BreakdownRow {
  name: string
  pct: number
  sar: number
}

const numFmt = new Intl.NumberFormat('en-US')
const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function halalaToSar(halala: number | null | undefined): number {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : 0
}

function fmtSar(sar: number | null | undefined, precise = true): string {
  if (typeof sar !== 'number' || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function costSar(row: { cost_halala?: number; cost_sar?: string | number; total_halala?: number }): number {
  if (typeof row.cost_halala === 'number') return halalaToSar(row.cost_halala)
  if (typeof row.total_halala === 'number') return halalaToSar(row.total_halala)
  if (typeof row.cost_sar === 'number') return row.cost_sar
  if (typeof row.cost_sar === 'string') {
    const parsed = Number(row.cost_sar)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

function modelName(job: JobRecord): string {
  return job.model || job.job_type || 'unlabeled'
}

function formatWhen(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function durationMs(job: JobRecord): number | null {
  if (typeof job.duration_minutes === 'number') return Math.round(job.duration_minutes * 60_000)
  if (!job.submitted_at || !job.completed_at) return null
  const start = new Date(job.submitted_at).getTime()
  const end = new Date(job.completed_at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return end - start
}

function mapStatus(status?: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled') return 'failed'
  if (s === 'running' || s === 'active') return 'active'
  if (s === 'pending' || s === 'queued') return 'queued'
  return 'settled'
}

function rowsFromSpend(source: Array<{ name: string; sar: number }>): BreakdownRow[] {
  const total = source.reduce((sum, row) => sum + row.sar, 0)
  return source
    .filter((row) => row.name && row.sar > 0)
    .map((row) => ({ name: row.name, sar: row.sar, pct: total > 0 ? Math.max(4, Math.round((row.sar / total) * 100)) : 0 }))
    .sort((a, b) => b.sar - a.sar)
    .slice(0, 5)
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

export default function RenterUsagePage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<Period>('30d')
  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('All models')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalanceResponse | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [usage, setUsage] = useState<UsageRecord[]>([])
  const [usageTotals, setUsageTotals] = useState<UsageResponse['totals'] | null>(null)
  const [exportHref, setExportHref] = useState('/v2/renter/usage')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    const renterKey = key
    const encodedKey = encodeURIComponent(renterKey)
    const base = getApiBase()
    const headers = { 'x-renter-key': renterKey }
    let cancelled = false

    async function loadUsage() {
      try {
        setLoadState('loading')
        setError('')
        setExportHref(`${base}/renters/me/jobs/export?key=${encodedKey}&format=csv`)
        const [me, balanceData, analyticsData, jobsData, usageData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me?key=${encodedKey}`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance?key=${encodedKey}`, headers, true),
          readJson<AnalyticsResponse>(`${base}/renters/me/analytics?key=${encodedKey}&period=${period}`, headers, true),
          readJson<JobsResponse>(`${base}/renters/me/jobs?key=${encodedKey}&page=0&limit=50`, headers, true),
          readJson<UsageResponse>(`${base}/renters/me/usage?key=${encodedKey}&limit=50&offset=0`, headers, true),
        ])
        if (cancelled) return
        setRenter(me?.renter || null)
        setBalance(balanceData || null)
        setAnalytics(analyticsData || null)
        setJobs(jobsData?.jobs || [])
        setUsage(usageData?.usage || [])
        setUsageTotals(usageData?.totals || me?.v1_usage_summary || null)
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Usage data could not be loaded')
        setLoadState('error')
      }
    }

    loadUsage()
    return () => {
      cancelled = true
    }
  }, [period])

  const displayName = renter?.organization || renter?.name || renter?.email || 'DCP renter'
  const displayEmail = renter?.email || 'API key not loaded'
  const displaySub = renter?.organization && renter?.name ? `${renter.name} · renter account` : 'Renter account'
  const balanceSar =
    typeof balance?.balance_sar === 'number'
      ? balance.balance_sar
      : typeof renter?.balance_halala === 'number'
        ? halalaToSar(renter.balance_halala)
        : halalaToSar(balance?.balance_halala)
  const heldSar = typeof balance?.held_sar === 'number' ? balance.held_sar : halalaToSar(balance?.held_halala)
  const totalSpentSar =
    typeof balance?.total_spent_sar === 'number'
      ? balance.total_spent_sar
      : typeof balance?.total_spent_halala === 'number'
        ? halalaToSar(balance.total_spent_halala)
        : halalaToSar(renter?.total_spent_halala)
  const dailySpend = analytics?.daily_spend || []
  const periodJobs = dailySpend.reduce((sum, day) => sum + (day.job_count || day.jobs || 0), 0)
  const periodSpendSar = dailySpend.reduce((sum, day) => sum + halalaToSar(day.total_halala), 0)
  const v1Requests = usageTotals?.total_requests || analytics?.v1_usage?.totals?.total_requests || 0
  const v1Tokens = usageTotals?.total_tokens || analytics?.v1_usage?.totals?.total_tokens || 0
  const v1SpendSar =
    typeof usageTotals?.total_cost_sar === 'number'
      ? usageTotals.total_cost_sar
      : typeof usageTotals?.total_cost_sar === 'string'
        ? Number(usageTotals.total_cost_sar)
        : halalaToSar(usageTotals?.total_cost_halala ?? analytics?.v1_usage?.totals?.total_cost_halala)
  const completedJobs = analytics?.completed_job_count || analytics?.status_counts?.find((s) => s.status === 'completed')?.count || 0
  const allStatusJobs = analytics?.status_counts?.reduce((sum, row) => sum + (row.count || 0), 0) || 0
  const successRate = allStatusJobs > 0 ? Math.round((completedJobs / allStatusJobs) * 100) : null
  const avgDuration = typeof analytics?.avg_duration_minutes === 'number' ? `${analytics.avg_duration_minutes} min` : '—'
  const balanceParts = fmtSar(balanceSar).split('.')

  const modelRows = useMemo(() => {
    const byModel = new Map<string, number>()
    for (const job of jobs) byModel.set(modelName(job), (byModel.get(modelName(job)) || 0) + costSar(job))
    for (const row of usage) byModel.set(row.model || 'v1 inference', (byModel.get(row.model || 'v1 inference') || 0) + halalaToSar(row.cost_halala))
    return rowsFromSpend([...byModel.entries()].map(([name, sar]) => ({ name, sar })))
  }, [jobs, usage])

  const sourceRows = useMemo(() => {
    const bySource = new Map<string, number>()
    for (const row of usage) bySource.set(row.source || 'v1 inference', (bySource.get(row.source || 'v1 inference') || 0) + halalaToSar(row.cost_halala))
    if (bySource.size === 0) {
      const jobSpend = jobs.reduce((sum, job) => sum + costSar(job), 0)
      if (jobSpend > 0) bySource.set('job queue', jobSpend)
    }
    return rowsFromSpend([...bySource.entries()].map(([name, sar]) => ({ name, sar })))
  }, [jobs, usage])

  const modelOptions = ['All models', ...Array.from(new Set(jobs.map(modelName))).filter(Boolean).sort()]
  const filteredJobs = jobs.filter((job) => {
    const q = search.trim().toLowerCase()
    const model = modelName(job)
    const status = mapStatus(job.status)
    const haystack = `${job.job_id || job.id || ''} ${model} ${job.provider_gpu || ''} ${job.status || ''}`.toLowerCase()
    return (
      (!q || haystack.includes(q)) &&
      (modelFilter === 'All models' || model === modelFilter) &&
      (statusFilter === 'All statuses' || status === statusFilter)
    )
  })

  return (
    <div className="rt-app">
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="usage">
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <button className="rt-ws-btn" title="Current renter account" type="button">
            <span className="av">{initials(displayName, displayEmail)}</span>
            <span className="body">
              <span className="nm">{displayName}</span>
              <span className="sub">{displaySub}</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {balanceParts[0]}
            <span className="u">.{balanceParts[1] || '00'}</span>
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR {fmtSar(heldSar)}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Lifetime spend" ar="إجمالي الإنفاق" />
            </span>
            <b>SAR {fmtSar(totalSpentSar, false)}</b>
          </div>
          <Link className="topup" href="/v2/renter/wallet#top-up">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </Link>
        </div>

        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => {
                const active = it.k === CURRENT_PAGE
                return (
                  <Link
                    key={it.k}
                    href={it.href}
                    className={active ? 'on' : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="ic">{it.ic}</span>
                    <span>
                      <Bi en={it.label} ar={it.labelAr} />
                    </span>
                    <span className="bd">{it.bd || ''}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="rt-sb-foot">
          <div className="av">{initials(renter?.name, renter?.email)}</div>
          <div className="who">
            {renter?.name || 'Renter'}
            <span className="e">{displayEmail}</span>
          </div>
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <header className="rt-tb" id="rt-tb" data-crumb="Usage">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            type="button"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Usage" ar="الاستخدام" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en={loadState === 'ready' ? 'API live' : 'Needs renter key'} ar={loadState === 'ready' ? 'الواجهة تعمل' : 'يتطلب مفتاح مستأجر'} />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="/v2/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <div className="page-heading">
            <div>
              <h1 className="rt-h1">
                <Bi en="Every " ar="كل " />
                <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
                  <Bi en="job" ar="مهمة" />
                </em>
                <Bi en=", accounted for." ar="، محسوبة بدقة." />
              </h1>
              <div className="rt-h1-sub">
                <span>
                  <Bi en={`${period} · `} ar={`${period} · `} />
                  <b>{numFmt.format(periodJobs)}</b> <Bi en="jobs" ar="مهمة" />
                </span>
                <span>
                  <Bi en="Spend" ar="الإنفاق" /> <b>SAR {fmtSar(periodSpendSar)}</b>
                </span>
                <span>
                  <Bi en="v1 API" ar="واجهة v1" /> <b>{numFmt.format(v1Requests)}</b> <Bi en="requests" ar="طلبات" />
                </span>
              </div>
            </div>
            <a className="btn-sec" href={exportHref}>
              ↓ <Bi en="Export CSV" ar="تصدير CSV" />
            </a>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or paste a renter API key before v2 can show usage, spend, or job history."
                  ar="سجل الدخول أو أدخل مفتاح مستأجر قبل أن تعرض v2 الاستخدام والإنفاق وسجل المهام."
                />
              </span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state error" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Usage unavailable" ar="الاستخدام غير متاح" />
              </b>
              <span>{error}</span>
            </div>
          )}

          <div className="kpi-row" style={{ marginTop: 36 }}>
            <div className="kpi featured">
              <div className="k">
                <Bi en="Period spend" ar="إنفاق الفترة" />
              </div>
              <div className="v">
                SAR {fmtSar(periodSpendSar)}
              </div>
              <div className="d flat">
                <Bi en={`${numFmt.format(periodJobs)} jobs in selected period`} ar={`${numFmt.format(periodJobs)} مهام في الفترة المحددة`} />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Success rate" ar="نسبة النجاح" />
              </div>
              <div className="v">{successRate == null ? '—' : `${successRate}%`}</div>
              <div className="d flat">
                <Bi en={`${numFmt.format(allStatusJobs)} jobs by status`} ar={`${numFmt.format(allStatusJobs)} مهام حسب الحالة`} />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Avg duration" ar="متوسط المدة" />
              </div>
              <div className="v">{avgDuration}</div>
              <div className="d flat">
                <Bi en={`${numFmt.format(completedJobs)} completed jobs`} ar={`${numFmt.format(completedJobs)} مهام مكتملة`} />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="v1 tokens" ar="رموز v1" />
              </div>
              <div className="v">{numFmt.format(v1Tokens)}</div>
              <div className="d flat">
                <Bi en={`SAR ${fmtSar(v1SpendSar)} ledger spend`} ar={`${fmtSar(v1SpendSar)} ريال من سجل الاستخدام`} />
              </div>
            </div>
          </div>

          <div className="breakdown-grid">
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By model" ar="حسب النموذج" />
                  </h3>
                </div>
              </div>
              <BreakdownRows rows={modelRows} empty="No model spend recorded yet." />
            </div>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By source" ar="حسب المصدر" />
                  </h3>
                </div>
              </div>
              <BreakdownRows rows={sourceRows} empty="No source spend recorded yet." />
            </div>
          </div>

          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Recent jobs" ar="المهام الأخيرة" />
                </h3>
              </div>
              <div className="seg">
                {PERIODS.map((p) => (
                  <button key={p} className={period === p ? 'on' : ''} type="button" onClick={() => setPeriod(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="filters">
              <input
                className="input search"
                placeholder={lang === 'ar' ? 'ابحث برقم المهمة أو النموذج أو الحالة...' : 'Search by job ID, model, GPU, or status...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="select" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
                {modelOptions.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
              <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option>All statuses</option>
                <option>settled</option>
                <option>queued</option>
                <option>active</option>
                <option>failed</option>
              </select>
            </div>
            <table className="tbl jobs-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Time" ar="الوقت" />
                  </th>
                  <th>
                    <Bi en="Job" ar="المهمة" />
                  </th>
                  <th>
                    <Bi en="Model" ar="النموذج" />
                  </th>
                  <th>
                    <Bi en="GPU" ar="المعالج" />
                  </th>
                  <th style={{ textAlign: 'end' }}>SAR</th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Latency" ar="زمن الاستجابة" />
                  </th>
                </tr>
              </thead>
              <tbody id="jobs-body">
                {filteredJobs.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={7}>
                      <Bi en="No jobs match the current account and filters." ar="لا توجد مهام تطابق الحساب والفلاتر الحالية." />
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, index) => {
                    const ms = durationMs(job)
                    const status = mapStatus(job.status)
                    const rowKey = job.job_id || job.id || `${modelName(job)}-${job.submitted_at || index}`
                    return (
                      <tr key={rowKey}>
                        <td>
                          <span className="mut">{formatWhen(job.submitted_at)}</span>
                        </td>
                        <td>
                          <span className="mono">{job.job_id || job.id}</span>
                        </td>
                        <td>
                          <span className="mono">{modelName(job)}</span>
                        </td>
                        <td>
                          <span className="mono">{job.provider_gpu || '—'}</span>
                        </td>
                        <td>
                          <span className="sar">
                            {fmtSar(costSar(job))}
                            <span className="u">SAR</span>
                          </span>
                        </td>
                        <td>
                          <span className={`stat ${status}`}>{status}</span>
                        </td>
                        <td>
                          <span className="mut" style={{ textAlign: 'end', display: 'block' }}>
                            {ms == null ? '—' : `${numFmt.format(ms)} ms`}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="v1 API usage" ar="استخدام واجهة v1" />
                </h3>
              </div>
            </div>
            <table className="tbl jobs-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Time" ar="الوقت" />
                  </th>
                  <th>
                    <Bi en="Request" ar="الطلب" />
                  </th>
                  <th>
                    <Bi en="Model" ar="النموذج" />
                  </th>
                  <th>
                    <Bi en="Source" ar="المصدر" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Tokens" ar="الرموز" />
                  </th>
                  <th style={{ textAlign: 'end' }}>SAR</th>
                  <th>
                    <Bi en="Settlement" ar="التسوية" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={7}>
                      <Bi en="No v1 inference usage has been recorded for this renter yet." ar="لم يتم تسجيل استخدام v1 لهذا المستأجر بعد." />
                    </td>
                  </tr>
                ) : (
                  usage.map((row, index) => (
                    <tr key={row.request_id || row.id || `${row.model || row.source || 'usage'}-${row.created_at || index}`}>
                      <td>
                        <span className="mut">{formatWhen(row.created_at)}</span>
                      </td>
                      <td>
                        <span className="mono">{row.request_id || row.id}</span>
                      </td>
                      <td>
                        <span className="mono">{row.model || '—'}</span>
                      </td>
                      <td>
                        <span className="mono">{row.source || '—'}</span>
                      </td>
                      <td>
                        <span className="mono" style={{ textAlign: 'end', display: 'block' }}>
                          {numFmt.format(row.total_tokens || 0)}
                        </span>
                      </td>
                      <td>
                        <span className="sar">
                          {fmtSar(halalaToSar(row.cost_halala))}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className={`stat ${mapStatus(row.settlement_status)}`}>{row.settlement_status || 'recorded'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}

function BreakdownRows({ rows, empty }: { rows: BreakdownRow[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="empty-breakdown">{empty}</div>
  }
  return (
    <div className="breakdown-list">
      {rows.map((row) => (
        <div className="brk-row" key={row.name}>
          <span className="brk-name">{row.name}</span>
          <div className="brk-bar">
            <span style={{ width: `${row.pct}%` }} />
          </div>
          <span className="brk-v">SAR {fmtSar(row.sar)}</span>
        </div>
      ))}
    </div>
  )
}
