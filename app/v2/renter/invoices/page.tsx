'use client'

// Ported from the v2 renter console source design (Invoices).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./invoices.css.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './invoices.css'

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
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/v2/renter/pods' },
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

const CURRENT_PAGE = 'invoices'

const HALALA_PER_SAR = 100

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface RenterAccount {
  name?: string
  email?: string
  organization?: string
  phone?: string | null
  use_case?: string | null
  balance_halala?: number
  total_spent_halala?: number
}

interface RenterMeResponse {
  renter?: RenterAccount
}

interface RenterBalanceResponse {
  balance_halala?: number
  balance_sar?: number
  held_halala?: number
  held_sar?: number
  total_spent_halala?: number
  total_spent_sar?: number
}

interface ApiInvoice {
  id: number
  job_id: string | null
  job_type?: string | null
  amount_sar: number | null
  amount_halala?: number | null
  total_sar: number | null
  status: string | null
  created_at: string | null
  invoice_at: string | null
  provider_name?: string | null
  gpu_model?: string | null
}

interface InvoicesResponse {
  invoices?: ApiInvoice[]
  total_spent_sar?: number
  total_spent_halala?: number
  pagination?: {
    total?: number
  }
}

interface Invoice {
  id: string
  numericId: number
  period: string
  sub: number
  status: 'open' | 'paid'
  jobType: string
  provider: string
}

const PERIOD_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatPeriod(when: string | null): string {
  if (!when) return ''
  const d = new Date(when)
  return Number.isNaN(d.getTime()) ? '' : PERIOD_FMT.format(d)
}

function mapInvoice(row: ApiInvoice): Invoice {
  const sub = Number(row.total_sar ?? row.amount_sar ?? (row.amount_halala ?? 0) / HALALA_PER_SAR)
  const id = row.job_id || `INV-${row.id}`
  return {
    id,
    numericId: row.id,
    period: formatPeriod(row.invoice_at ?? row.created_at),
    sub,
    status: row.status === 'paid' || row.status === 'completed' || row.status === 'settled' ? 'paid' : 'open',
    jobType: row.job_type || 'inference',
    provider: row.provider_name || row.gpu_model || 'DCP provider',
  }
}

function halalaToSar(halala: number | null | undefined): number {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : 0
}

function optionalHalalaToSar(halala: number | null | undefined): number | undefined {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : undefined
}

function fmtSar(sar: number | null | undefined, precise = true): string {
  if (typeof sar !== 'number' || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

export default function RenterInvoicesPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [renterKey, setRenterKey] = useState('')
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalanceResponse | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [totalSpentSar, setTotalSpentSar] = useState(0)
  const [invoiceTotal, setInvoiceTotal] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    setRenterKey(key)

    let cancelled = false
    ;(async () => {
      try {
        setLoadState('loading')
        const base = getApiBase()
        const encodedKey = encodeURIComponent(key)
        const headers = { 'x-renter-key': key }
        const [meData, balanceData, invoiceData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me?key=${encodedKey}`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance?key=${encodedKey}`, headers, true),
          readJson<InvoicesResponse>(`${base}/renters/me/invoices?key=${encodedKey}&limit=50`, headers),
        ])
        if (cancelled) return
        setRenter(meData?.renter || null)
        setBalance(balanceData)
        setInvoices(Array.isArray(invoiceData?.invoices) ? invoiceData.invoices.map(mapInvoice) : [])
        setTotalSpentSar(
          invoiceData?.total_spent_sar ??
            optionalHalalaToSar(invoiceData?.total_spent_halala) ??
            balanceData?.total_spent_sar ??
            optionalHalalaToSar(balanceData?.total_spent_halala) ??
            0,
        )
        setInvoiceTotal(Number(invoiceData?.pagination?.total || invoiceData?.invoices?.length || 0))
        setLoadState('ready')
      } catch {
        if (cancelled) return
        setError('Could not load live invoice data.')
        setLoadState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const accountName = renter?.organization || renter?.name || renter?.email || 'Renter account'
  const accountSub = renter?.email || 'Sign in with a renter API key'
  const balanceSar = balance?.balance_sar ?? halalaToSar(balance?.balance_halala ?? renter?.balance_halala)
  const heldSar = balance?.held_sar ?? halalaToSar(balance?.held_halala)
  const invoiceSummary = invoiceTotal || invoices.length

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="invoices">
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
            <span className="av">{initials(accountName, renter?.email)}</span>
            <span className="body">
              <span className="nm">{accountName}</span>
              <span className="sub">{accountSub}</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {fmtSar(balanceSar)}
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR {fmtSar(heldSar)}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Total invoiced" ar="إجمالي الفواتير" />
            </span>
            <b>SAR {fmtSar(totalSpentSar)}</b>
          </div>
          <Link className="topup" href="/v2/renter/wallet">
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
          <div className="av">{initials(renter?.name || accountName, renter?.email)}</div>
          <div className="who">
            {renter?.name || accountName}
            <span className="e">{renter?.email || 'Renter session required'}</span>
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
        <header className="rt-tb" id="rt-tb" data-crumb="Invoices">
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
            <span>{accountName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Invoices" ar="الفواتير" />
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
          <h1 className="rt-h1">
            <Bi en="Tax " ar="فواتير " />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="invoices." ar="ضريبية." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="Live billing records from completed DCP jobs" ar="سجلات فوترة مباشرة من مهام DCP المكتملة" />
            </span>
            <span>
              <Bi en="Rows loaded " ar="الصفوف المحملة " />
              <b>{loadState === 'ready' ? invoiceSummary : '—'}</b>
            </span>
          </div>

          {/* Billing entity */}
          <div className="panel" style={{ marginTop: 36 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Billing entity" ar="الجهة المُفوترة" />
                </h3>
              </div>
              <span className="btn-sec" aria-disabled="true">
                <Bi en="Profile-backed" ar="من ملف الحساب" />
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                    marginBottom: 8,
                  }}
                >
                  <Bi en="Bill to" ar="إلى" />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '22px',
                    lineHeight: 1.2,
                    color: 'var(--ink)',
                    marginBottom: 6,
                  }}
                >
                  {accountName}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '12.5px',
                    lineHeight: 1.7,
                    color: 'var(--ink-2)',
                  }}
                >
                  {renter?.email || 'No renter session loaded'}
                  <br />
                  {renter?.phone || 'Phone not set'}
                  <br />
                  {renter?.use_case || 'Use case not set'}
                  <br />
                  Legal billing profile fields are not configured yet.
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                    marginBottom: 8,
                  }}
                >
                  <Bi en="From" ar="من" />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '22px',
                    lineHeight: 1.2,
                    color: 'var(--ink)',
                    marginBottom: 6,
                  }}
                >
                  DC Power Solutions Company
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '12.5px',
                    lineHeight: 1.7,
                    color: 'var(--ink-2)',
                  }}
                >
                  CR 7053667775<br />
                  VAT 311102233400003<br />
                  Riyadh, Saudi Arabia
                </div>
              </div>
            </div>
          </div>

          {/* Invoice list */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Invoice history" ar="سجل الفواتير" />
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
                <Bi en="CSV export is available per invoice" ar="تصدير CSV متاح لكل فاتورة" />
              </span>
            </div>
            {loadState === 'loading' && (
              <div className="rt-empty">
                <Bi en="Loading live invoice history..." ar="تحميل سجل الفواتير المباشر..." />
              </div>
            )}
            {loadState === 'missing-key' && (
              <div className="rt-empty">
                <Bi en="Sign in with a renter API key to view invoices." ar="سجّل الدخول بمفتاح مستأجر لعرض الفواتير." />
              </div>
            )}
            {loadState === 'error' && (
              <div className="rt-empty" role="alert">
                {error}
              </div>
            )}
            {loadState === 'ready' && invoices.length === 0 && (
              <div className="rt-empty">
                <Bi en="No invoice rows yet. Completed jobs will appear here." ar="لا توجد فواتير بعد. ستظهر المهام المكتملة هنا." />
              </div>
            )}
            <table className="tbl inv-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Invoice" ar="الفاتورة" />
                  </th>
                  <th>
                    <Bi en="Period" ar="الفترة" />
                  </th>
                  <th>
                    <Bi en="Source" ar="المصدر" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Subtotal" ar="المجموع الفرعي" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="VAT 15%" ar="ضريبة ١٥٪" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Total" ar="الإجمالي" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="inv-body">
                {invoices.map((i) => {
                  const vat = i.sub * 0.15
                  const tot = i.sub + vat
                  return (
                    <tr key={i.id}>
                      <td>
                        <span className="nm">{i.id}</span>
                        <span className="ms">
                          <Bi en="ZATCA Simplified Tax Invoice" ar="فاتورة ضريبية مبسطة (زاتكا)" />
                        </span>
                      </td>
                      <td>
                        <span className="mono">{i.period}</span>
                      </td>
                      <td>
                        <span className="mono">{i.jobType}</span>
                        <span className="ms">{i.provider}</span>
                      </td>
                      <td>
                        <span className="sar">
                          {fmtSar(i.sub)}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className="sar" style={{ color: 'var(--mut)' }}>
                          {vat.toFixed(2)}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className="sar">
                          {tot.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className={`stat ${i.status === 'paid' ? 'settled' : 'streaming'}`}>
                          {i.status}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          <Link href={`${getApiBase()}/renters/me/invoices/${i.numericId}/csv?key=${encodeURIComponent(renterKey)}`}>
                            CSV ↓
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
