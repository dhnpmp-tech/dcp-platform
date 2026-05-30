'use client'

// Ported from public/dcp-v2/prototypes/renter/Usage.html (renter console · Usage).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./usage.css.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './usage.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys', bd: '3' },
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

// ── Breakdown mock data (illustrative; from prototype markup) ───────────
const BY_MODEL = [
  { name: 'allam-7b', pct: 58, sar: 'SAR 1,420', muted: false },
  { name: 'jais-13b', pct: 25, sar: 'SAR 624', muted: false },
  { name: 'falcon-h1', pct: 7, sar: 'SAR 182', muted: false },
  { name: 'sdxl', pct: 5, sar: 'SAR 110', muted: false },
  { name: 'bge-m3', pct: 5, sar: 'SAR 120', muted: false },
]

const BY_KEY = [
  { name: 'production-server', pct: 89, sar: 'SAR 2,184', muted: false },
  { name: 'staging', pct: 8, sar: 'SAR 192', muted: false },
  { name: 'analytics-readonly', pct: 0, sar: 'SAR 0', muted: true },
  { name: 'batch-runner', pct: 3, sar: 'SAR 80', muted: true },
]

// ── Jobs mock data (illustrative; from prototype script) ────────────────
interface Job {
  t: string
  id: string
  model: string
  key: string
  tok: number
  sar: number
  stat: string
  ms: number
}

const JOBS: Job[] = [
  { t: '12:42:08', id: 'j_ac81', model: 'allam-7b', key: 'production-server', tok: 412, sar: 0.34, stat: 'settled', ms: 1240 },
  { t: '12:41:54', id: 'j_ac7f', model: 'jais-13b', key: 'production-server', tok: 1824, sar: 1.92, stat: 'settled', ms: 4810 },
  { t: '12:41:41', id: 'j_ac7e', model: 'allam-7b', key: 'production-server', tok: 208, sar: 0.18, stat: 'settled', ms: 820 },
  { t: '12:41:30', id: 'j_ac7d', model: 'bge-m3', key: 'production-server', tok: 64, sar: 0.02, stat: 'settled', ms: 120 },
  { t: '12:41:18', id: 'j_ac7c', model: 'allam-7b', key: 'staging', tok: 928, sar: 0.91, stat: 'settled', ms: 2840 },
  { t: '12:41:02', id: 'j_ac7b', model: 'falcon-h1', key: 'production-server', tok: 2104, sar: 2.48, stat: 'settled', ms: 5420 },
  { t: '12:40:46', id: 'j_ac7a', model: 'allam-7b', key: 'production-server', tok: 512, sar: 0.41, stat: 'settled', ms: 1610 },
  { t: '12:40:24', id: 'j_ac79', model: 'jais-13b', key: 'production-server', tok: 0, sar: 0, stat: 'failed', ms: 4200 },
  { t: '12:40:12', id: 'j_ac78', model: 'allam-7b', key: 'production-server', tok: 288, sar: 0.24, stat: 'settled', ms: 940 },
  { t: '12:39:48', id: 'j_ac77', model: 'allam-7b', key: 'production-server', tok: 1124, sar: 0.92, stat: 'settled', ms: 3210 },
]

const numFmt = new Intl.NumberFormat('en-US')

// ── Live data shapes (from GET /api/renters/me — see app/renter/jobs) ───
interface ApiJob {
  id: number
  job_id: string
  job_type: string
  status: string
  submitted_at: string
  completed_at: string | null
  actual_cost_halala: number | null
}

interface RenterMe {
  renter?: {
    name?: string
    balance_halala?: number
    total_spent_halala?: number
    total_jobs?: number
  }
  recent_jobs?: ApiJob[]
}

// Header summary mirrors the inline mock so values render before/without a key.
interface UsageSummary {
  jobs: string
  spend: string
  avg: string
}

const DEFAULT_SUMMARY: UsageSummary = { jobs: '14,820', spend: 'SAR 2,456', avg: 'SAR 0.17' }
const DEFAULT_BALANCE = { whole: 'SAR 2,184', cents: '.52' }

// Map a backend `status` onto the prototype's job-status vocabulary so the
// existing `.stat .settled / .failed` styling keeps working.
function mapStatus(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled') return 'failed'
  return 'settled'
}

function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function latencyMs(submitted: string, completed: string | null): number {
  if (!completed) return 0
  const start = new Date(submitted).getTime()
  const end = new Date(completed).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return end - start
}

function mapJob(j: ApiJob): Job {
  return {
    t: clockTime(j.submitted_at),
    id: j.job_id || `j_${j.id}`,
    model: j.job_type || '—',
    key: '—',
    tok: 0,
    sar: (j.actual_cost_halala || 0) / 100,
    stat: mapStatus(j.status),
    ms: latencyMs(j.submitted_at, j.completed_at),
  }
}

const sarFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export default function RenterUsagePage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)

  // Primary data: header totals, wallet balance, and the jobs table. The inline
  // mock stays as the default so the page renders fully with no key / failed fetch.
  const [summary, setSummary] = useState<UsageSummary>(DEFAULT_SUMMARY)
  const [balance, setBalance] = useState(DEFAULT_BALANCE)
  const [jobs, setJobs] = useState<Job[]>(JOBS)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/renters/me`, { headers: { 'x-renter-key': key } })
        if (!res.ok) return
        const data: RenterMe = await res.json()
        if (cancelled) return

        const r = data.renter
        if (r) {
          const totalJobs = r.total_jobs ?? 0
          const spentSar = (r.total_spent_halala ?? 0) / 100
          setSummary({
            jobs: numFmt.format(totalJobs),
            spend: `SAR ${sarFmt.format(spentSar)}`,
            avg: totalJobs > 0 ? `SAR ${(spentSar / totalJobs).toFixed(2)}` : 'SAR 0.00',
          })

          const balSar = (r.balance_halala ?? 0) / 100
          const whole = Math.trunc(balSar)
          const cents = Math.round((balSar - whole) * 100)
          setBalance({
            whole: `SAR ${numFmt.format(whole)}`,
            cents: `.${String(cents).padStart(2, '0')}`,
          })
        }

        const live = data.recent_jobs
        if (Array.isArray(live) && live.length > 0) {
          setJobs(live.map(mapJob))
        }
      } catch {
        // Keep the inline mock as the rendered fallback.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Filter controls are cosmetic in the prototype (no filtering script); keep them
  // as controlled inputs so the page is interactive without changing the mock data.
  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('All models')
  const [keyFilter, setKeyFilter] = useState('All keys')
  const [rangeFilter, setRangeFilter] = useState('Last 24h')

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
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
          <button className="rt-ws-btn" title="Switch workspace" type="button">
            <span className="av">N</span>
            <span className="body">
              <span className="nm">NextWave Commerce</span>
              <span className="sub">acme-prod · 3 members</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            {balance.whole}
            <span className="u">{balance.cents}</span>
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR 2.72</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Burn · last 7 days" ar="الصرف · آخر ٧ أيام" />
            </span>
            <b>SAR 412</b>
          </div>
          <button className="topup" type="button">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </button>
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
          <div className="av">F</div>
          <div className="who">
            Fatima Al-Harbi
            <span className="e">fatima@nextwave.sa · Owner</span>
          </div>
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`rt-backdrop${navOpen ? ' on' : ''}`}
        id="rt-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        {/* ── Topbar (inlined from renter-shell.js) ────────────────── */}
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
            <span>NextWave Commerce</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Usage" ar="الاستخدام" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="API live" ar="الواجهة تعمل" />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span
              style={{
                background: lang === 'en' ? 'var(--ink)' : 'transparent',
                color: lang === 'en' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              EN
            </span>
            <span
              style={{
                background: lang === 'ar' ? 'var(--ink)' : 'transparent',
                color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              ع
            </span>
          </button>
          <Link className="keys" href="/v2/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
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
                  <Bi en="30 days · " ar="٣٠ يوم · " />
                  <b>{summary.jobs}</b> <Bi en="jobs" ar="مهمة" />
                </span>
                <span>
                  <Bi en="Spend" ar="الإنفاق" /> <b>{summary.spend}</b>
                </span>
                <span>
                  <Bi en="Avg" ar="المتوسط" /> <b>{summary.avg}</b> <Bi en="/ job" ar="/ مهمة" />
                </span>
              </div>
            </div>
            <button className="btn-sec" type="button">
              ↓ <Bi en="Export CSV" ar="تصدير CSV" />
            </button>
          </div>

          {/* Breakdown panels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 22,
              marginTop: 36,
            }}
          >
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By model" ar="حسب النموذج" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {BY_MODEL.map((row) => (
                  <div className="brk-row" key={row.name}>
                    <span className="brk-name" style={row.muted ? { color: 'var(--mut)' } : undefined}>
                      {row.name}
                    </span>
                    <div className="brk-bar">
                      <span
                        style={{
                          width: `${row.pct}%`,
                          ...(row.muted ? { background: 'var(--mut)' } : {}),
                        }}
                      />
                    </div>
                    <span className="brk-v" style={row.muted ? { color: 'var(--mut)' } : undefined}>
                      {row.sar}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By API key" ar="حسب مفتاح API" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {BY_KEY.map((row) => (
                  <div className="brk-row" key={row.name}>
                    <span className="brk-name" style={row.muted ? { color: 'var(--mut)' } : undefined}>
                      {row.name}
                    </span>
                    <div className="brk-bar">
                      <span
                        style={{
                          width: `${row.pct}%`,
                          ...(row.muted ? { background: 'var(--mut)' } : {}),
                        }}
                      />
                    </div>
                    <span className="brk-v" style={row.muted ? { color: 'var(--mut)' } : undefined}>
                      {row.sar}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Jobs table */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Recent jobs" ar="المهام الأخيرة" />
                </h3>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10.5px',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--mut)',
                }}
              >
                <Bi en="Last 24 hours · 1,284 jobs" ar="آخر ٢٤ ساعة · ١٢٨٤ مهمة" />
              </span>
            </div>
            <div className="filters">
              <input
                className="input search"
                placeholder={
                  lang === 'ar' ? 'ابحث برقم المهمة أو الموجه أو المفتاح…' : 'Search by job ID, prompt, or key…'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="select" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
                <option>All models</option>
                <option>allam-7b</option>
                <option>jais-13b</option>
                <option>falcon-h1</option>
              </select>
              <select className="select" value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)}>
                <option>All keys</option>
                <option>production-server</option>
                <option>staging</option>
              </select>
              <select className="select" value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value)}>
                <option>Last 24h</option>
                <option>Last 7 days</option>
                <option>Last 30 days</option>
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
                    <Bi en="Key" ar="المفتاح" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Tokens" ar="الرموز" />
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
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <span className="mut">{j.t}</span>
                    </td>
                    <td>
                      <span className="mono">{j.id}</span>
                    </td>
                    <td>
                      <span className="mono">{j.model}</span>
                    </td>
                    <td>
                      <span className="mono">{j.key}</span>
                    </td>
                    <td>
                      <span className="mono" style={{ textAlign: 'end', display: 'block' }}>
                        {numFmt.format(j.tok)}
                      </span>
                    </td>
                    <td>
                      <span className="sar">
                        {j.sar.toFixed(2)}
                        <span className="u">SAR</span>
                      </span>
                    </td>
                    <td>
                      <span className={`stat ${j.stat}`}>{j.stat}</span>
                    </td>
                    <td>
                      <span className="mut" style={{ textAlign: 'end', display: 'block' }}>
                        {numFmt.format(j.ms)} ms
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
