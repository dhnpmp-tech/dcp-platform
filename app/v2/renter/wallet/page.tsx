'use client'

// Ported from public/dcp-v2/prototypes/renter/Wallet.html (renter console · Wallet).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./wallet.css.
import { useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import './wallet.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '#', bd: '3' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '#' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/v2/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '#' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '#' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '#', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'wallet'

// ── Top-up methods (illustrative; from prototype markup) ────────────────
const TOPUP_METHODS = [
  {
    nm: 'mada · card',
    nmAr: 'بطاقة مدى',
    desc: 'Saudi national card scheme. Instant credit, settles in SAR.',
    descAr: 'نظام البطاقات الوطني السعودي. إيداع فوري، تسوية بالريال.',
    feeLabel: 'Fee',
    feeLabelAr: 'الرسوم',
    fee: 'none',
    feeAr: 'بدون',
  },
  {
    nm: 'Apple Pay',
    nmAr: 'Apple Pay',
    desc: 'Pay with Touch ID or Face ID from your phone.',
    descAr: 'ادفع باستخدام بصمة الإصبع أو الوجه من هاتفك.',
    feeLabel: 'Fee',
    feeLabelAr: 'الرسوم',
    fee: 'none',
    feeAr: 'بدون',
  },
  {
    nm: 'Bank transfer',
    nmAr: 'تحويل بنكي',
    desc: 'SAR SARIE / IPS transfer. Lands within minutes during business hours.',
    descAr: 'تحويل سريع / SARIE بالريال. يصل خلال دقائق في ساعات العمل.',
    feeLabel: 'Fee',
    feeLabelAr: 'الرسوم',
    fee: 'none',
    feeAr: 'بدون',
  },
  {
    nm: 'USDC · Base L2',
    nmAr: 'USDC · Base L2',
    desc: 'On-chain stablecoin top-up. Converted to SAR at the mid-rate.',
    descAr: 'شحن بعملة مستقرة على السلسلة. يُحوَّل إلى الريال بسعر الوسط.',
    feeLabel: 'FX spread',
    feeLabelAr: 'هامش الصرف',
    fee: '0.4%',
    feeAr: '٠٫٤٪',
  },
]

// ── Amount presets (illustrative; from prototype markup) ────────────────
const AMOUNTS = [
  { label: 'SAR 200', labelAr: '٢٠٠ ريال' },
  { label: 'SAR 500', labelAr: '٥٠٠ ريال' },
  { label: 'SAR 2,000', labelAr: '٢٬٠٠٠ ريال' },
  { label: 'SAR 5,000', labelAr: '٥٬٠٠٠ ريال' },
  { label: 'Other…', labelAr: 'مبلغ آخر…' },
]

// ── Transactions MOCK (from prototype TX) ───────────────────────────────
interface Tx {
  t: string
  tAr: string
  d: string
  dAr: string
  m: string
  mAr: string
  amt: number
}

const TX: Tx[] = [
  { t: '2m ago', tAr: 'قبل ٢ د', d: 'j_ac81 · allam-7b · settled', dAr: 'j_ac81 · allam-7b · مُسوّاة', m: 'Wallet', mAr: 'المحفظة', amt: -0.18 },
  { t: '12m ago', tAr: 'قبل ١٢ د', d: 'j_ac7f · jais-13b · settled', dAr: 'j_ac7f · jais-13b · مُسوّاة', m: 'Wallet', mAr: 'المحفظة', amt: -1.92 },
  { t: '2h ago', tAr: 'قبل ٢ س', d: 'Batch b_2847 · 62 jobs · settled', dAr: 'دفعة b_2847 · ٦٢ مهمة · مُسوّاة', m: 'Wallet', mAr: 'المحفظة', amt: -14.2 },
  { t: '1d ago', tAr: 'قبل ١ ي', d: 'Auto top-up · card •• 4192', dAr: 'شحن تلقائي · بطاقة •• 4192', m: 'mada', mAr: 'مدى', amt: 500 },
  { t: '3d ago', tAr: 'قبل ٣ ي', d: 'Daily settlement · Dec 01', dAr: 'تسوية يومية · ١ ديسمبر', m: 'Wallet', mAr: 'المحفظة', amt: -82.4 },
  { t: '1w ago', tAr: 'قبل ١ أ', d: 'Top-up · bank transfer', dAr: 'شحن · تحويل بنكي', m: 'SARIE', mAr: 'سريع', amt: 2000 },
  { t: '2w ago', tAr: 'قبل ٢ أ', d: 'USDC deposit · 0x7Fe3…', dAr: 'إيداع USDC · 0x7Fe3…', m: 'Base L2', mAr: 'Base L2', amt: 1000 },
]

export default function RenterWalletPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [methodIdx, setMethodIdx] = useState(0)
  const [amountIdx, setAmountIdx] = useState(1) // SAR 500 selected by default

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="wallet">
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
        <header className="rt-tb" id="rt-tb" data-crumb="Wallet">
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
              <Bi en="Wallet" ar="المحفظة" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="API live" ar="الواجهة تعمل" />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="#">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="Your " ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="wallet." ar="محفظتك." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="Saudi Riyal · halala-precise" ar="ريال سعودي · بدقة الهللة" />
            </span>
            <span>
              <Bi en="Auto top-up " ar="الشحن التلقائي " />
              <b>
                <Bi en="on" ar="مفعّل" />
              </b>
            </span>
          </div>

          {/* Balance */}
          <div className="balance-card" style={{ marginTop: '36px' }}>
            <div className="balance-grid">
              <div>
                <div className="k">
                  <Bi en="Available balance" ar="الرصيد المتاح" />
                </div>
                <div className="v">
                  SAR 2,184<span className="u">.52</span>
                </div>
                <div className="d">
                  <Bi en="Of which " ar="منها " />
                  <b>SAR 2.72</b>
                  <Bi en=" is held in 4 active jobs" ar=" محجوزة في ٤ مهام نشطة" />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Burn · last 7 days" ar="الصرف · آخر ٧ أيام" />
                </div>
                <div className="v small">SAR 412</div>
                <div className="d">
                  <Bi en="~ 12 days of runway at this rate" ar="~ ١٢ يوماً متبقية بهذا المعدل" />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Auto top-up" ar="الشحن التلقائي" />
                </div>
                <div className="v small">SAR 2,000</div>
                <div className="d">
                  <Bi en="When balance drops below " ar="عندما يقل الرصيد عن " />
                  <b>SAR 500</b>
                </div>
              </div>
            </div>
          </div>

          {/* Top up */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Top up" ar="شحن الرصيد" />
                </h3>
              </div>
            </div>

            <h4
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--mut)',
                margin: '0 0 14px',
              }}
            >
              <Bi en="Method" ar="الطريقة" />
            </h4>
            <div className="topup-methods">
              {TOPUP_METHODS.map((m, i) => (
                <div
                  key={m.nm}
                  className={`topup-method${i === methodIdx ? ' on' : ''}`}
                  onClick={() => setMethodIdx(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setMethodIdx(i)
                    }
                  }}
                >
                  <div className="nm">
                    <Bi en={m.nm} ar={m.nmAr} />
                  </div>
                  <div className="desc">
                    <Bi en={m.desc} ar={m.descAr} />
                  </div>
                  <div className="fee">
                    <Bi en={m.feeLabel} ar={m.feeLabelAr} />{' '}
                    <b>
                      <Bi en={m.fee} ar={m.feeAr} />
                    </b>
                  </div>
                </div>
              ))}
            </div>

            <h4
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--mut)',
                margin: '26px 0 14px',
              }}
            >
              <Bi en="Amount" ar="المبلغ" />
            </h4>
            <div className="amount-pick">
              {AMOUNTS.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  className={i === amountIdx ? 'on' : ''}
                  onClick={() => setAmountIdx(i)}
                >
                  <Bi en={a.label} ar={a.labelAr} />
                </button>
              ))}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-pri" type="button">
                <Bi en="Top up " ar="شحن " />
                {lang === 'ar' ? AMOUNTS[amountIdx].labelAr : AMOUNTS[amountIdx].label}
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--mut)' }}>
                <Bi en="Card •• 4192 · Bank Aljazira" ar="بطاقة •• 4192 · بنك الجزيرة" />
              </span>
            </div>
          </div>

          {/* Auto top-up */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Auto top-up" ar="الشحن التلقائي" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Enabled" ar="مفعّل" />
                </b>
                <Bi en="Never run out of credit" ar="لا تنفد رصيدك أبداً" />
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi
                      en="On — refill automatically when balance is low"
                      ar="مفعّل — إعادة الشحن تلقائياً عند انخفاض الرصيد"
                    />
                  </span>
                </label>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Trigger threshold" ar="حد التفعيل" />
                </b>
                <Bi en="Refill when balance drops below" ar="إعادة الشحن عند انخفاض الرصيد عن" />
              </div>
              <div className="ctl">
                <select className="select" style={{ maxWidth: '200px' }} defaultValue="SAR 500">
                  <option>SAR 100</option>
                  <option>SAR 250</option>
                  <option>SAR 500</option>
                  <option>SAR 1,000</option>
                  <option>SAR 2,000</option>
                </select>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Refill amount" ar="مبلغ إعادة الشحن" />
                </b>
                <Bi en="Top up to" ar="الشحن حتى" />
              </div>
              <div className="ctl">
                <select className="select" style={{ maxWidth: '200px' }} defaultValue="SAR 2,000">
                  <option>SAR 500</option>
                  <option>SAR 1,000</option>
                  <option>SAR 2,000</option>
                  <option>SAR 5,000</option>
                  <option>SAR 10,000</option>
                </select>
                <span className="hint">
                  <Bi en="Monthly cap: " ar="الحد الشهري: " />
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>SAR 20,000</b>
                  <Bi
                    en=". If auto top-up would exceed this, we’ll email you instead."
                    ar=". إذا تجاوز الشحن التلقائي هذا الحد، سنراسلك بالبريد بدلاً من ذلك."
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Transactions" ar="المعاملات" />
                </h3>
              </div>
              <Link
                href="#"
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
                <Bi en="Tax invoices →" ar="الفواتير الضريبية →" />
              </Link>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="When" ar="متى" />
                  </th>
                  <th>
                    <Bi en="Description" ar="الوصف" />
                  </th>
                  <th>
                    <Bi en="Method" ar="الطريقة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Amount" ar="المبلغ" />
                  </th>
                </tr>
              </thead>
              <tbody id="tx">
                {TX.map((x, i) => (
                  <tr key={`${x.t}-${i}`}>
                    <td>
                      <span className="mut">
                        <Bi en={x.t} ar={x.tAr} />
                      </span>
                    </td>
                    <td>
                      <span className="mono">
                        <Bi en={x.d} ar={x.dAr} />
                      </span>
                    </td>
                    <td>
                      <span className="mono">
                        <Bi en={x.m} ar={x.mAr} />
                      </span>
                    </td>
                    <td>
                      <span className="sar" style={{ color: x.amt < 0 ? 'var(--ink)' : 'var(--teal)' }}>
                        {x.amt > 0 ? '+' : ''}
                        {x.amt.toFixed(2)}
                        <span className="u">SAR</span>
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
