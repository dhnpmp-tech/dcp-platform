'use client'

// Ported from the v2 renter console source design (Invoices).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./invoices.css.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './invoices.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
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
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/renter/wallet', bd: 'SAR' },
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

// RENT-6: a browser <a> cannot set headers, so the CSV link used to carry the
// renter key in the querystring. Fetch the CSV with the x-renter-key header
// instead, then trigger a blob download (same pattern as settings data-export).
// The backend route already accepts the header (renters.js: x-renter-key || key).
async function downloadInvoiceCsv(numericId: number, invoiceLabel: string): Promise<void> {
  const key = getRenterKey()
  if (!key) return
  const res = await fetch(`${getApiBase()}/renters/me/invoices/${numericId}/csv`, {
    headers: { 'x-renter-key': key },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`CSV export failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dcp-invoice-${invoiceLabel}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
        const headers = { 'x-renter-key': key }
        const [meData, balanceData, invoiceData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance`, headers, true),
          readJson<InvoicesResponse>(`${base}/renters/me/invoices?limit=50`, headers),
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
    <main className="rt-main">
      <h1 className="rt-h1">
        <Bi en="Your " ar="فواتيرك" />
        <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
          <Bi en="invoices." ar="." />
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
              return (
                <tr key={i.id}>
                  <td>
                    <span className="nm">{i.id}</span>
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
                    <span className={`stat ${i.status === 'paid' ? 'settled' : 'streaming'}`}>
                      {i.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <a
                        href={`${getApiBase()}/renters/me/invoices/${i.numericId}/csv`}
                        onClick={(event) => {
                          event.preventDefault()
                          void downloadInvoiceCsv(i.numericId, i.id).catch((err) =>
                            setError(err instanceof Error ? err.message : 'CSV export failed'),
                          )
                        }}
                      >
                        CSV ↓
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
