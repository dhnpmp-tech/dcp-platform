'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './usage.css'

const HALALA_PER_SAR = 100

const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
      { k: 'fine', ic: 'FT', label: 'Fine-Tuning', labelAr: 'الضبط الدقيق', href: '/renter/fine-tuning' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Credit', labelAr: 'الرصيد', href: '/renter/wallet' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/docs', bd: '↗' },
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

interface UsageByKeyRow {
  id: string
  label?: string | null
  scopes?: string[]
  org_role?: string | null
  revoked?: boolean
  requests?: number
  total_tokens?: number
  spend_halala?: number
  spend_sar?: number
  monthly_spend_cap_halala?: number
  monthly_spend_cap_sar?: number
  monthly_spend_cap_unlimited?: boolean
  cap_utilization_pct?: number | null
}

interface UsageByKeyResponse {
  rows?: UsageByKeyRow[]
  unattributed?: {
    requests?: number
    total_tokens?: number
    spend_halala?: number
    spend_sar?: number
  }
  claims?: {
    per_key_spend_attribution_live?: boolean
    per_key_budgets_enforced?: boolean
    team_member_rollups_live?: boolean
  }
}

interface BudgetStatusResponse {
  v1_inference?: {
    requests?: number
    spend_halala?: number
    monthly_spend_cap_halala?: number
    monthly_spend_cap_unlimited?: boolean
    remaining_cap_halala?: number | null
    cap_utilization_pct?: number | null
  }
  quota?: {
    daily_jobs_limit?: number
    monthly_spend_limit_halala?: number
  }
  api_keys?: {
    active?: number
    billing?: number
    inference?: number
    per_key_budgets_available?: boolean
  }
  claims?: {
    workspace_usage_export_live?: boolean
    per_key_budgets_enforced?: boolean
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
  if (s === 'completed' || s === 'complete' || s === 'succeeded' || s === 'success' || s === 'done') return 'completed'
  if (s === 'stopped' || s === 'stop') return 'stopped'
  return 'settled'
}

function rowsFromSpend(source: Array<{ name: string; sar: number }>): BreakdownRow[] {
  const total = source.reduce((sum, row) => sum + row.sar, 0)
  return source
    .filter((row) => row.name && row.sar > 0)
    .map((row) => ({ name: row.name, sar: row.sar, pct: total > 0 ? Math.round((row.sar / total) * 10000) / 100 : 0 }))
    .sort((a, b) => b.sar - a.sar)
    .slice(0, 5)
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

// C1 phase-2: a browser <a> cannot set headers, so the CSV link used to carry
// the renter key in the querystring (?key=). Fetch the CSV with the x-renter-key
// header instead, then trigger a blob download (same pattern as invoices +
// settings data-export). The backend route already accepts the header.
async function downloadUsageCsv(period: Period): Promise<void> {
  const key = getRenterKey()
  if (!key) return
  const base = getApiBase()
  const res = await fetch(`${base}/renters/me/usage/export?format=csv&period=${period}`, {
    headers: { 'x-renter-key': key },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`CSV export failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dcp-usage-${period}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
  const [usageByKey, setUsageByKey] = useState<UsageByKeyResponse | null>(null)
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatusResponse | null>(null)
  // C1 phase-2: CSV export uses downloadUsageCsv (x-renter-key header) instead of an <a href="?key=">.

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    const renterKey = key
    const base = getApiBase()
    const headers = { 'x-renter-key': renterKey }
    let cancelled = false

    async function loadUsage() {
      try {
        setLoadState('loading')
        setError('')
        const [me, balanceData, analyticsData, jobsData, usageData, usageByKeyData, budgetData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance`, headers, true),
          readJson<AnalyticsResponse>(`${base}/renters/me/analytics?period=${period}`, headers, true),
          readJson<JobsResponse>(`${base}/renters/me/jobs?page=0&limit=50&period=${period}`, headers, true),
          readJson<UsageResponse>(`${base}/renters/me/usage?limit=50&offset=0&period=${period}`, headers, true),
          readJson<UsageByKeyResponse>(`${base}/renters/me/usage/by-key?period=${period}`, headers, true),
          readJson<BudgetStatusResponse>(`${base}/renters/me/budget-status?period=${period}`, headers, true),
        ])
        if (cancelled) return
        setRenter(me?.renter || null)
        setBalance(balanceData || null)
        setAnalytics(analyticsData || null)
        setJobs(jobsData?.jobs || [])
        setUsage(usageData?.usage || [])
        setUsageTotals(usageData?.totals || me?.v1_usage_summary || null)
        setUsageByKey(usageByKeyData || null)
        setBudgetStatus(budgetData || null)
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
  const accountCapUnlimited = budgetStatus?.v1_inference?.monthly_spend_cap_unlimited ?? true
  const accountCapSar = halalaToSar(budgetStatus?.v1_inference?.monthly_spend_cap_halala)
  const remainingCapSar =
    typeof budgetStatus?.v1_inference?.remaining_cap_halala === 'number'
      ? halalaToSar(budgetStatus.v1_inference.remaining_cap_halala)
      : null
  const capUtilization = budgetStatus?.v1_inference?.cap_utilization_pct
  const scopedActiveKeys = budgetStatus?.api_keys?.active || 0
  const billingKeys = budgetStatus?.api_keys?.billing || 0
  const keyUsageRows = usageByKey?.rows || []
  const unattributedUsage = usageByKey?.unattributed || null

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
          <div className="rt-ws-btn">
            <span className="av">{initials(displayName, displayEmail)}</span>
            <span className="body">
              <span className="nm">{displayName}</span>
              <span className="sub">{displaySub}</span>
            </span>
          </div>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Credit" ar="الرصيد" />
          </div>
          <div className="v">
            <Bi en={`Credit ${balanceParts[0]}`} ar={`رصيد ${balanceParts[0]}`} />
            <span className="u">.{balanceParts[1] || '00'}</span>
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b><Bi en={`${fmtSar(heldSar)} credit`} ar={`${fmtSar(heldSar)} رصيد`} /></b>
          </div>
          <div className="row">
            <span>
              <Bi en="Lifetime spend" ar="إجمالي الإنفاق" />
            </span>
            <b><Bi en={`${fmtSar(totalSpentSar, false)} credit`} ar={`${fmtSar(totalSpentSar, false)} رصيد`} /></b>
          </div>
          <Link className="topup" href="/renter/wallet#top-up">
            <Bi en="+ Add credit" ar="+ إضافة رصيد" />
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
                    href={it.href} target={it.href === '/docs' ? '_blank' : undefined} rel={it.href === '/docs' ? 'noopener noreferrer' : undefined}
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
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/auth' }}>
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
          <Link className="keys" href="/renter/keys">
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
            <button
              type="button"
              className="btn-sec"
              onClick={() => {
                void downloadUsageCsv(period).catch((err) => setError(String(err?.message || err)))
              }}
            >
              ↓ <Bi en="Export CSV" ar="تصدير CSV" />
            </button>
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

          <div className="budget-strip">
            <div>
              <span className="k">
                <Bi en="Monthly v1 cap" ar="حد v1 الشهري" />
              </span>
              <b>
                {accountCapUnlimited ? <Bi en="Unlimited" ar="غير محدود" /> : `SAR ${fmtSar(accountCapSar)}`}
              </b>
            </div>
            <div>
              <span className="k">
                <Bi en="Remaining" ar="المتبقي" />
              </span>
              <b>{remainingCapSar == null ? '—' : `SAR ${fmtSar(remainingCapSar)}`}</b>
            </div>
            <div>
              <span className="k">
                <Bi en="Cap used" ar="استخدام الحد" />
              </span>
              <b>{typeof capUtilization === 'number' ? `${capUtilization}%` : '—'}</b>
            </div>
            <div>
              <span className="k">
                <Bi en="Scoped keys" ar="المفاتيح المحددة" />
              </span>
              <b>{numFmt.format(scopedActiveKeys)}</b>
              <span className="sub">
                <Bi en={`${numFmt.format(billingKeys)} billing`} ar={`${numFmt.format(billingKeys)} للفوترة`} />
              </span>
            </div>
          </div>

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
                  <Bi en="API key usage" ar="استخدام مفاتيح API" />
                </h3>
              </div>
              <span className="mut">
                <Bi en={usageByKey?.claims?.team_member_rollups_live ? 'Team rollups live' : 'Scoped-key rollup'} ar={usageByKey?.claims?.team_member_rollups_live ? 'تجميع الفريق مفعل' : 'تجميع حسب المفتاح'} />
              </span>
            </div>
            <table className="tbl jobs-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Key" ar="المفتاح" />
                  </th>
                  <th>
                    <Bi en="Scope" ar="النطاق" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Requests" ar="الطلبات" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Tokens" ar="الرموز" />
                  </th>
                  <th style={{ textAlign: 'end' }}>SAR</th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Monthly cap" ar="الحد الشهري" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {keyUsageRows.length === 0 && (!unattributedUsage || !unattributedUsage.requests) ? (
                  <tr className="empty-row">
                    <td colSpan={7}>
                      <Bi en="No scoped-key usage has been recorded for this period." ar="لم يتم تسجيل استخدام حسب المفاتيح في هذه الفترة." />
                    </td>
                  </tr>
                ) : (
                  <>
                    {keyUsageRows.map((row) => {
                      const capSar = typeof row.monthly_spend_cap_sar === 'number'
                        ? row.monthly_spend_cap_sar
                        : halalaToSar(row.monthly_spend_cap_halala)
                      const unlimited = row.monthly_spend_cap_unlimited !== false && !row.monthly_spend_cap_halala
                      const scope = Array.isArray(row.scopes) && row.scopes.length ? row.scopes.join(' · ') : '—'
                      const status = row.revoked ? 'revoked' : 'active'
                      return (
                        <tr key={row.id}>
                          <td>
                            <span className="mono">{row.label || row.id}</span>
                          </td>
                          <td>
                            <span className="mono">{scope}</span>
                          </td>
                          <td>
                            <span className="mono" style={{ textAlign: 'end', display: 'block' }}>{numFmt.format(row.requests || 0)}</span>
                          </td>
                          <td>
                            <span className="mono" style={{ textAlign: 'end', display: 'block' }}>{numFmt.format(row.total_tokens || 0)}</span>
                          </td>
                          <td>
                            <span className="sar">
                              {fmtSar(typeof row.spend_sar === 'number' ? row.spend_sar : halalaToSar(row.spend_halala))}
                              <span className="u">SAR</span>
                            </span>
                          </td>
                          <td>
                            <span className="sar">
                              {unlimited ? <Bi en="Unlimited" ar="غير محدود" /> : fmtSar(capSar)}
                              {!unlimited && <span className="u">SAR</span>}
                            </span>
                          </td>
                          <td>
                            <span className={`stat ${status}`}>{status}</span>
                          </td>
                        </tr>
                      )
                    })}
                    {unattributedUsage && (unattributedUsage.requests || 0) > 0 && (
                      <tr>
                        <td>
                          <span className="mono">unattributed</span>
                        </td>
                        <td>
                          <span className="mono">master / legacy</span>
                        </td>
                        <td>
                          <span className="mono" style={{ textAlign: 'end', display: 'block' }}>{numFmt.format(unattributedUsage.requests || 0)}</span>
                        </td>
                        <td>
                          <span className="mono" style={{ textAlign: 'end', display: 'block' }}>{numFmt.format(unattributedUsage.total_tokens || 0)}</span>
                        </td>
                        <td>
                          <span className="sar">
                            {fmtSar(typeof unattributedUsage.spend_sar === 'number' ? unattributedUsage.spend_sar : halalaToSar(unattributedUsage.spend_halala))}
                            <span className="u">SAR</span>
                          </span>
                        </td>
                        <td>
                          <span className="mut">—</span>
                        </td>
                        <td>
                          <span className="stat settled">recorded</span>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
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
                <option>completed</option>
                <option>stopped</option>
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
