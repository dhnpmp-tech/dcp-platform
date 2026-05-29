'use client'

// Ported from public/dcp-v2/prototypes/renter/Invoices.html (renter console · Invoices).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./invoices.css.
import { useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
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
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '#', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/v2/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '#' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'invoices'

// ── Invoice mock data (illustrative; from prototype script) ─────────────
interface Invoice {
  id: string
  period: string
  sub: number
  status: 'open' | 'paid'
  files: string[]
}

const INV: Invoice[] = [
  { id: 'INV-2025-12', period: 'Dec 2025', sub: 2456, status: 'open', files: ['PDF', 'XML'] },
  { id: 'INV-2025-11', period: 'Nov 2025', sub: 2284, status: 'paid', files: ['PDF', 'XML'] },
  { id: 'INV-2025-10', period: 'Oct 2025', sub: 1984, status: 'paid', files: ['PDF', 'XML'] },
  { id: 'INV-2025-09', period: 'Sep 2025', sub: 1612, status: 'paid', files: ['PDF', 'XML'] },
  { id: 'INV-2025-08', period: 'Aug 2025', sub: 1428, status: 'paid', files: ['PDF', 'XML'] },
  { id: 'INV-2025-07', period: 'Jul 2025', sub: 1284, status: 'paid', files: ['PDF', 'XML'] },
  { id: 'INV-2025-06', period: 'Jun 2025', sub: 1124, status: 'paid', files: ['PDF', 'XML'] },
]

export default function RenterInvoicesPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)

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
            SAR 2,184<span className="u">.52</span>
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
            <span>NextWave Commerce</span>
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
              <Bi en="ZATCA-compliant · auto-issued monthly" ar="متوافقة مع هيئة الزكاة · تصدر شهرياً تلقائياً" />
            </span>
            <span>
              <Bi en="VAT registration " ar="التسجيل الضريبي " />
              <b>VAT-310234567890003</b>
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
              <Link href="#" className="btn-sec">
                <Bi en="Edit entity" ar="تعديل الجهة" />
              </Link>
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
                  NextWave Commerce LLC
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '12.5px',
                    lineHeight: 1.7,
                    color: 'var(--ink-2)',
                  }}
                >
                  CR 1010382947<br />
                  VAT 310234567890003<br />
                  King Abdullah Road<br />
                  Riyadh 11564, Saudi Arabia
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
                <Bi en="Issued on the 1st of each month" ar="تصدر في الأول من كل شهر" />
              </span>
            </div>
            <table className="tbl inv-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Invoice" ar="الفاتورة" />
                  </th>
                  <th>
                    <Bi en="Period" ar="الفترة" />
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
                {INV.map((i) => {
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
                        <span className="sar">
                          {i.sub.toLocaleString()}
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
                          {i.files.map((f) => (
                            <Link key={f} href="#">
                              {f} ↓
                            </Link>
                          ))}
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
