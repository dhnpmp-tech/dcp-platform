'use client'

// Ported from public/dcp-v2/prototypes/provider/Earnings.html (provider console · Earnings).
// Sidebar + topbar chrome (formerly injected by provider-shell.js) is inlined here so the
// route is self-contained; provider-shell.css + the page's inline <style> are folded into
// ./earnings.css. Orange accent marks the provider context.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './earnings.css'

// ── Nav model (from provider-shell.js NAV) ─────────────────────────────
const NAV = [
  {
    sec: 'Operate',
    secAr: 'التشغيل',
    items: [
      { k: 'dash', ic: '⌂', label: 'Dashboard', labelAr: 'لوحة التحكم', href: '/v2/provider/dashboard' },
      { k: 'rigs', ic: '☷', label: 'Rigs', labelAr: 'الأجهزة', href: '/v2/provider/rigs', bd: '4' },
      { k: 'earnings', ic: '△', label: 'Earnings', labelAr: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', label: 'Payouts', labelAr: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف الشخصي', href: '/v2/provider/profile', bd: 'Silver' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'وثائق المزوّد', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'earnings'

// ── Earnings mock data (illustrative; from prototype EARN) ──────────────
interface EarnPoint {
  date: Date
  sar: number
}

function buildEarn(): EarnPoint[] {
  const out: EarnPoint[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const base = 180 + Math.sin((89 - i) / 5) * 50 + (i < 30 ? 60 : 0) + (i < 9 ? 40 : 0)
    const jitter = (((89 - i) * 11) % 19) - 9
    out.push({ date: d, sar: Math.round(base + jitter) })
  }
  return out
}

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// ── Chart geometry (from prototype renderChart()) ───────────────────────
function buildChart(earn: EarnPoint[], rangeDays: number) {
  const W = 600
  const H = 300
  const padL = 56
  const padR = 8
  const padT = 16
  const padB = 22
  const days = earn.slice(-rangeDays)
  const max = Math.max(...days.map((d) => d.sar)) * 1.1
  const min = Math.min(...days.map((d) => d.sar)) * 0.85
  const range = max - min
  const x = (i: number) => padL + (i / (days.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB)

  let line = ''
  days.forEach((d, i) => {
    line += (i === 0 ? 'M ' : ' L ') + x(i).toFixed(1) + ' ' + y(d.sar).toFixed(1)
  })
  const area = `${line} L ${x(days.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z`

  const grid: number[] = []
  for (let i = 0; i <= 4; i++) grid.push(padT + (i / 4) * (H - padT - padB))

  const axisL: string[] = []
  for (let i = 0; i <= 4; i++) axisL.push(`SAR ${numFmt.format(max - (i / 4) * range)}`)

  const labelEvery = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 5 : 15
  const axisB = days
    .filter((_, i) => i % labelEvery === 0 || i === days.length - 1)
    .map((d) => d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))

  return { W, H, padL, padR, line, area, grid, axisL, axisB }
}

// ── Breakdown mock (from prototype markup) ──────────────────────────────
const BY_RIG = [
  { name: 'studio-main', width: '48%', value: 'SAR 2,798', muted: false },
  { name: 'studio-bench', width: '32%', value: 'SAR 1,864', muted: false },
  { name: 'office-mac', width: '14%', value: 'SAR 816', muted: false },
  { name: 'garage-3090', width: '6%', value: 'SAR 348', muted: true },
]

const BY_MODEL = [
  { name: 'allam-7b', width: '54%', value: 'SAR 3,120', muted: false },
  { name: 'jais-13b', width: '20%', value: 'SAR 1,180', muted: false },
  { name: 'falcon-h1', width: '14%', value: 'SAR 820', muted: false },
  { name: 'bge-m3', width: '7%', value: 'SAR 412', muted: false },
  { name: 'others', width: '5%', value: 'SAR 294', muted: true },
]

// ── Payouts mock (from prototype PAYOUTS) ───────────────────────────────
// `statClass` selects the CSS swatch (.stat.paid / .stat.accruing); `status` is
// the human label shown in the cell — real withdrawal states (pending /
// processing / failed) keep their own label but reuse the .accruing swatch.
interface Payout {
  period: string
  mode: string
  sar: number
  status: string
  statClass: 'accruing' | 'paid'
  date: string
  inv: string | null
}

// ── Real shapes fetched from the provider API (v1 endpoints reused) ─────
// GET /api/providers/earnings
interface ProviderEarnings {
  total_earned_sar: number
  available_sar: number
  pending_withdrawal_sar: number
  withdrawn_sar: number
  total_jobs: number
}

// GET /api/providers/me/earnings/history?period=7d|30d|90d  → array
interface EarningsHistoryRow {
  date: string
  earnings_halala: number
  jobs_completed: number
}

// GET /api/providers/me/withdrawals → { withdrawals: Withdrawal[] }
interface Withdrawal {
  id: string | number
  amount_halala: number
  status: string
  iban: string
  created_at: string
  processed_at: string | null
}

const PAYOUTS: Payout[] = [
  { period: 'Dec 02 – Dec 08', mode: 'SAR · IBAN', sar: 428, status: 'accruing', statClass: 'accruing', date: '—', inv: null },
  { period: 'Nov 25 – Dec 01', mode: 'SAR · IBAN', sar: 1482, status: 'paid', statClass: 'paid', date: '2 Dec 2025', inv: 'INV-2025-49' },
  { period: 'Nov 18 – Nov 24', mode: 'SAR · IBAN', sar: 1284, status: 'paid', statClass: 'paid', date: '25 Nov 2025', inv: 'INV-2025-48' },
  { period: 'Nov 11 – Nov 17', mode: 'SAR · IBAN', sar: 1164, status: 'paid', statClass: 'paid', date: '18 Nov 2025', inv: 'INV-2025-47' },
  { period: 'Nov 04 – Nov 10', mode: 'SAR · IBAN', sar: 982, status: 'paid', statClass: 'paid', date: '11 Nov 2025', inv: 'INV-2025-46' },
  { period: 'Oct 28 – Nov 03', mode: 'SAR · IBAN', sar: 914, status: 'paid', statClass: 'paid', date: '4 Nov 2025', inv: 'INV-2025-45' },
  { period: 'Oct 21 – Oct 27', mode: 'SAR · IBAN', sar: 1058, status: 'paid', statClass: 'paid', date: '28 Oct 2025', inv: 'INV-2025-44' },
]

// Halala (1/100 SAR) → SAR. Backend money is stored in halala integers.
const HALALA_PER_SAR = 100

function halalaToSar(halala: number): number {
  return Math.round(halala / HALALA_PER_SAR)
}

// Map a real withdrawal status onto the two available .stat swatches.
function statusToClass(status: string): 'accruing' | 'paid' {
  return status === 'paid' ? 'paid' : 'accruing'
}

function fmtPayoutDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function maskIban(iban: string): string {
  const tail = (iban || '').replace(/\s+/g, '').slice(-4)
  return tail ? `SAR · IBAN ••${tail}` : 'SAR · IBAN'
}

// Withdrawal[] → the render shape the payouts table already consumes.
function toPayoutRows(withdrawals: Withdrawal[]): Payout[] {
  return withdrawals.map((w) => ({
    period: fmtPayoutDate(w.created_at),
    mode: maskIban(w.iban),
    sar: halalaToSar(w.amount_halala),
    status: w.status,
    statClass: statusToClass(w.status),
    date: w.status === 'paid' ? fmtPayoutDate(w.processed_at) : '—',
    inv: null,
  }))
}

// EarningsHistoryRow[] → the EarnPoint[] the chart already renders. Empty days
// in the API response are fine — buildChart() scales to whatever it gets.
function historyToEarn(rows: EarningsHistoryRow[]): EarnPoint[] {
  return rows
    .map((r) => ({ date: new Date(r.date), sar: halalaToSar(r.earnings_halala) }))
    .filter((p) => !Number.isNaN(p.date.getTime()))
}

type RangeOpt = 7 | 30 | 90

export default function ProviderEarningsPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [range, setRange] = useState<RangeOpt>(30)

  // EARN data is date-relative (uses new Date()); build it client-side after
  // mount so SSR/CSR markup stays identical and hydration never mismatches.
  // This mock stays the fallback — it is the default series until (and unless)
  // the real /earnings/history fetch lands a non-empty result.
  const [earn, setEarn] = useState<EarnPoint[] | null>(null)
  useEffect(() => {
    setEarn(buildEarn())
  }, [])

  // ── Real data (replaces mock on success; mock kept as fallback) ─────────
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>(PAYOUTS)

  // Totals (balance + lifetime + job count) and payouts: fetched once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    let cancelled = false
    const headers = { 'x-provider-key': key }
    const base = getApiBase()

    void (async () => {
      try {
        const [eRes, wRes] = await Promise.all([
          fetch(`${base}/providers/earnings`, { headers }),
          fetch(`${base}/providers/me/withdrawals`, { headers }),
        ])
        if (cancelled) return
        if (eRes.ok) {
          const e = (await eRes.json()) as ProviderEarnings
          if (!cancelled) setEarnings(e)
        }
        if (wRes.ok) {
          const w = (await wRes.json()) as { withdrawals?: Withdrawal[] }
          const rows = toPayoutRows(w.withdrawals || [])
          if (!cancelled && rows.length > 0) setPayouts(rows)
        }
      } catch {
        /* keep mock fallback on network/parse failure */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Daily earnings series: re-fetched whenever the range toggle changes, since
  // the history endpoint is period-scoped (7d / 30d / 90d).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    let cancelled = false
    const period = `${range}d`

    void (async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/providers/me/earnings/history?period=${period}`,
          { headers: { 'x-provider-key': key } }
        )
        if (cancelled || !res.ok) return
        const rows = (await res.json()) as EarningsHistoryRow[]
        const points = historyToEarn(Array.isArray(rows) ? rows : [])
        if (!cancelled && points.length > 0) setEarn(points)
      } catch {
        /* keep mock fallback on network/parse failure */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [range])

  const chart = useMemo(() => (earn ? buildChart(earn, range) : null), [earn, range])

  const ranges: RangeOpt[] = [7, 30, 90]

  return (
    <div className="pv-app">
      {/* ── Sidebar (inlined from provider-shell.js) ───────────────── */}
      <aside className={`pv-sb${navOpen ? ' on' : ''}`} id="pv-sb" data-page="earnings">
        <div className="pv-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Provider" ar="مزوّد" />
          </span>
        </div>

        <div className="pv-status">
          <div className="k">
            <Bi en="Earning today" ar="أرباح اليوم" />
          </div>
          <div className="v">
            SAR 218<span className="u"><Bi en="so far" ar="حتى الآن" /></span>
          </div>
          <div className="live">
            <span className="d" /> <Bi en="2 of 4 rigs earning" ar="٢ من ٤ أجهزة تكسب" />
          </div>
          <div className="row">
            <span>
              <Bi en="Yesterday" ar="أمس" />
            </span>
            <b>SAR 194</b>
          </div>
          <div className="row">
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>SAR 5,826</b>
          </div>
        </div>

        <nav className="pv-nav">
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

        <div className="pv-sb-foot">
          <div className="av">Y</div>
          <div className="who">
            Yazeed Al-Qahtani
            <span className="e">riyadh-studio-01 · Silver</span>
          </div>
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`pv-backdrop${navOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        {/* ── Topbar (inlined from provider-shell.js) ──────────────── */}
        <header className="pv-tb" id="pv-tb" data-crumb="Earnings">
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
            <span>riyadh-studio-01</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Earnings" ar="الأرباح" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="Live · earning" ar="مباشر · يكسب" />
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
          <button className="kill" title="Pause all rigs" type="button">
            ◉ <Bi en="Kill switch" ar="إيقاف الكل" />
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en="Your " ar="أرباحك " />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
              <Bi en="earnings." ar="بالكامل." />
            </em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="Paid out weekly · Saudi Riyal" ar="تُدفع أسبوعياً · ريال سعودي" />
            </span>
            <span>
              <Bi en="Next payout " ar="الدفعة القادمة " />
              <b>
                {earnings ? (
                  `Mon · SAR ${numFmt.format(Math.round(earnings.available_sar || 0))}`
                ) : (
                  <Bi en="Mon · SAR 428" ar="الإثنين · ٤٢٨ ريال" />
                )}
              </b>
            </span>
            <span>
              <Bi en="Lifetime " ar="الإجمالي " />
              <b>
                SAR{' '}
                {earnings
                  ? numFmt.format(Math.round(earnings.total_earned_sar || 0))
                  : '42,180'}
              </b>
            </span>
          </div>

          {/* Big chart */}
          <div className="panel" style={{ marginTop: 36 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Daily earnings" ar="الأرباح اليومية" />
                </h3>
              </div>
              <div className="seg" id="range">
                {ranges.map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-r={r}
                    className={range === r ? 'on' : ''}
                    onClick={() => setRange(r)}
                  >
                    {r}D
                  </button>
                ))}
              </div>
            </div>
            <div className="earn-chart" id="chart">
              <div className="axis-l" id="ax-l">
                {chart?.axisL.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
              <div className="axis-b" id="ax-b">
                {chart?.axisB.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
              <svg id="chart-svg" viewBox="0 0 600 300" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="earnArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ee7a3c" stopOpacity=".45" />
                    <stop offset="1" stopColor="#ee7a3c" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g className="grid" id="grid">
                  {chart?.grid.map((gy, i) => (
                    <line key={i} x1={chart.padL} y1={gy} x2={chart.W - chart.padR} y2={gy} />
                  ))}
                </g>
                <path className="area" id="area" d={chart?.area} />
                <path className="line" id="line" d={chart?.line} />
              </svg>
            </div>
          </div>

          {/* Breakdown by rig + by model */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 22,
              marginTop: 28,
            }}
          >
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By rig · last 30 days" ar="حسب الجهاز · آخر ٣٠ يوم" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {BY_RIG.map((r) => (
                  <div className="brk-row" key={r.name}>
                    <span className="brk-name">{r.name}</span>
                    <div className="brk-bar">
                      <span style={{ width: r.width, ...(r.muted ? { background: 'var(--mut)' } : {}) }} />
                    </div>
                    <span className="brk-v" style={r.muted ? { color: 'var(--mut)' } : undefined}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="By model · last 30 days" ar="حسب النموذج · آخر ٣٠ يوم" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {BY_MODEL.map((m) => (
                  <div className="brk-row" key={m.name}>
                    <span className="brk-name" style={m.muted ? { color: 'var(--mut)' } : undefined}>
                      {m.name}
                    </span>
                    <div className="brk-bar">
                      <span style={{ width: m.width, ...(m.muted ? { background: 'var(--mut)' } : {}) }} />
                    </div>
                    <span className="brk-v" style={m.muted ? { color: 'var(--mut)' } : undefined}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payouts */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payouts" ar="المدفوعات" />
                </h3>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                    marginTop: 6,
                  }}
                >
                  <Bi en="Weekly · Mon · SAR to IBAN " ar="أسبوعياً · الإثنين · ريال إلى الآيبان " />
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>•••• 2847</b>
                </div>
              </div>
              <Link
                href="/v2/provider/payouts"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  borderBottom: '1px solid var(--ink)',
                  paddingBottom: '2px',
                  textDecoration: 'none',
                }}
              >
                <Bi en="Manage payouts →" ar="إدارة المدفوعات ←" />
              </Link>
            </div>
            <table className="payouts-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Period" ar="الفترة" />
                  </th>
                  <th>
                    <Bi en="Method" ar="الطريقة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Amount" ar="المبلغ" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Paid" ar="تاريخ الدفع" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Invoice" ar="الفاتورة" />
                  </th>
                </tr>
              </thead>
              <tbody id="payouts">
                {payouts.map((p, i) => (
                  <tr key={`${p.period}-${i}`}>
                    <td>
                      <span className="period">{p.period}</span>
                    </td>
                    <td>
                      <span className="mode">{p.mode}</span>
                    </td>
                    <td>
                      <span className="amount">
                        {p.sar.toLocaleString()}
                        <span className="u">SAR</span>
                      </span>
                    </td>
                    <td>
                      <span className={`stat ${p.statClass}`}>{p.status}</span>
                    </td>
                    <td>
                      <span className="when">{p.date}</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      {p.inv ? (
                        <Link className="inv" href="#">
                          {p.inv} ↓
                        </Link>
                      ) : (
                        <span className="when">—</span>
                      )}
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
