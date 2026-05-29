'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import './payouts.css'

/* ════════════════════════════════════════
   Provider shell nav — derived from provider-shell.js NAV template.
   Rendered inline so the page is self-contained. Current page = payouts.
   ════════════════════════════════════════ */
const NAV = [
  {
    sec: 'Operate',
    secAr: 'التشغيل',
    items: [
      { k: 'dash', ic: '⌂', label: 'Dashboard', labelAr: 'لوحة التحكم', href: '/v2/provider/dashboard' },
      { k: 'rigs', ic: '☷', label: 'Rigs', labelAr: 'الأجهزة', href: '/v2/provider/rigs', bd: '4' },
      { k: 'earnings', ic: '△', label: 'Earnings', labelAr: 'الأرباح', href: '#' },
      { k: 'payouts', ic: '₪', label: 'Payouts', labelAr: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف', href: '#', bd: 'Silver' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '#' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'دليل المزوّد', href: '#', bd: '↗' },
    ],
  },
]

const CURRENT = 'payouts'

/* Payouts history — illustrative mock data from the prototype */
type Payout = {
  period: string
  mode: string
  sar: number
  status: 'accruing' | 'paid'
  date: string
  inv: string | null
}

const PAYOUTS: Payout[] = [
  { period: 'Dec 02 – Dec 08', mode: 'Bank · SAR', sar: 428, status: 'accruing', date: '—', inv: null },
  { period: 'Nov 25 – Dec 01', mode: 'Bank · SAR', sar: 1482, status: 'paid', date: '2 Dec 2025', inv: 'INV-2025-49' },
  { period: 'Nov 18 – Nov 24', mode: 'Bank · SAR', sar: 1284, status: 'paid', date: '25 Nov 2025', inv: 'INV-2025-48' },
  { period: 'Nov 11 – Nov 17', mode: 'Bank · SAR', sar: 1164, status: 'paid', date: '18 Nov 2025', inv: 'INV-2025-47' },
  { period: 'Nov 04 – Nov 10', mode: 'Bank · SAR', sar: 982, status: 'paid', date: '11 Nov 2025', inv: 'INV-2025-46' },
  { period: 'Oct 28 – Nov 03', mode: 'Bank · SAR', sar: 914, status: 'paid', date: '4 Nov 2025', inv: 'INV-2025-45' },
  { period: 'Oct 21 – Oct 27', mode: 'Bank · SAR', sar: 1058, status: 'paid', date: '28 Oct 2025', inv: 'INV-2025-44' },
  { period: 'Oct 14 – Oct 20', mode: 'Bank · SAR', sar: 1124, status: 'paid', date: '21 Oct 2025', inv: 'INV-2025-43' },
  { period: 'Oct 07 – Oct 13', mode: 'Bank · SAR', sar: 892, status: 'paid', date: '14 Oct 2025', inv: 'INV-2025-42' },
  { period: 'Sep 30 – Oct 06', mode: 'Bank · SAR', sar: 786, status: 'paid', date: '7 Oct 2025', inv: 'INV-2025-41' },
  { period: 'Sep 23 – Sep 29', mode: 'Bank · SAR', sar: 824, status: 'paid', date: '30 Sep 2025', inv: 'INV-2025-40' },
  { period: 'Sep 16 – Sep 22', mode: 'Bank · SAR', sar: 942, status: 'paid', date: '23 Sep 2025', inv: 'INV-2025-39' },
]

const FREQ_OPTS = [
  { en: 'Daily', ar: 'يومي' },
  { en: 'Weekly · Mon', ar: 'أسبوعي · الإثنين' },
  { en: 'Monthly · 1st', ar: 'شهري · 1' },
  { en: 'Manual only', ar: 'يدوي فقط' },
]

const THRESHOLD_OPTS = [
  { en: 'SAR 50', ar: '50 ر.س' },
  { en: 'SAR 100', ar: '100 ر.س' },
  { en: 'SAR 200', ar: '200 ر.س' },
  { en: 'SAR 500', ar: '500 ر.س' },
  { en: 'SAR 1,000', ar: '1,000 ر.س' },
]

export default function PayoutsPage() {
  const { lang, toggle } = useV2()

  // Mobile drawer
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Frequency / threshold toggles (index of the active option)
  const [freq, setFreq] = useState(1) // Weekly · Mon
  const [threshold, setThreshold] = useState(2) // SAR 200

  // Withdraw + change-bank demo feedback (replaces prototype alert() calls)
  const [withdrawQueued, setWithdrawQueued] = useState(false)
  const [changingBank, setChangingBank] = useState(false)

  return (
    <div className="pv-app">
      {/* ── Sidebar ── */}
      <aside className={`pv-sb${drawerOpen ? ' on' : ''}`} data-page="payouts">
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
            SAR 218
            <span className="u">
              <Bi en="so far" ar="حتى الآن" />
            </span>
          </div>
          <div className="live">
            <span className="d" /> <Bi en="2 of 4 rigs earning" ar="جهازان من 4 يكسبان" />
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
              {s.items.map((it) => (
                <Link key={it.k} href={it.href} className={it.k === CURRENT ? 'on' : undefined} aria-current={it.k === CURRENT ? 'page' : undefined}>
                  <span className="ic">{it.ic}</span>
                  <span>
                    <Bi en={it.label} ar={it.labelAr} />
                  </span>
                  <span className="bd">{it.bd || ''}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="pv-sb-foot">
          <div className="av">Y</div>
          <div className="who">
            Yazeed Al-Qahtani
            <span className="e">riyadh-studio-01 · Silver</span>
          </div>
          <span className="out" title="Sign out" role="button">
            ↱
          </span>
        </div>
      </aside>

      <div className={`pv-backdrop${drawerOpen ? ' on' : ''}`} onClick={() => setDrawerOpen(false)} />

      <div>
        {/* ── Topbar ── */}
        <header className="pv-tb" data-crumb="Payouts">
          <button className="mb-toggle" aria-label="Menu" onClick={() => setDrawerOpen((v) => !v)}>
            ☰
          </button>
          <div className="crumb">
            <span>riyadh-studio-01</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Payouts" ar="المدفوعات" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="Live · earning" ar="مباشر · يكسب" />
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="kill" title="Pause all rigs">
            ◉ <Bi en="Kill switch" ar="إيقاف الكل" />
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en="Your " ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
              <Bi en="payouts." ar="مدفوعاتك." />
            </em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="Where your earnings land · how often · in what" ar="أين تصل أرباحك · كم مرة · بأي طريقة" />
            </span>
          </div>

          {/* Balance card */}
          <div className="balance-card" style={{ marginTop: '36px' }}>
            <div className="balance-grid">
              <div>
                <div className="k">
                  <Bi en="Available balance · ready to pay out" ar="الرصيد المتاح · جاهز للصرف" />
                </div>
                <div className="v">SAR 428.40</div>
                <div className="d">
                  <Bi en="Accrued from " ar="متراكم من " />
                  <b>
                    <Bi en="Nov 25 → today" ar="25 نوفمبر ← اليوم" />
                  </b>{' '}
                  <Bi en="· 187 jobs · 14 rigs" ar="· 187 مهمة · 14 جهازًا" />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Next payout" ar="الدفعة القادمة" />
                </div>
                <div className="v small">
                  <Bi en="Mon · 8 Dec" ar="الإثنين · 8 ديسمبر" />
                </div>
                <div className="d">
                  <Bi en="In 4 days · automatic" ar="بعد 4 أيام · تلقائي" />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Last payout" ar="آخر دفعة" />
                </div>
                <div className="v small">SAR 1,482</div>
                <div className="d">
                  <Bi en="2 Dec · settled · INV-2025-49" ar="2 ديسمبر · تمت التسوية · INV-2025-49" />
                </div>
              </div>
            </div>
          </div>

          {/* Withdraw alert · for the cases where balance > threshold */}
          <div className="alert">
            <div className="t">
              <b>
                <Bi en="Withdraw now" ar="اسحب الآن" />
              </b>{' '}
              <Bi en="— your balance is above your set threshold of SAR 200." ar="— رصيدك أعلى من الحد الذي ضبطته وهو 200 ر.س." />
              <span className="sub">
                <Bi en="Manual withdrawals settle in 1 business day · no fee" ar="السحوبات اليدوية تُسوّى خلال يوم عمل واحد · بدون رسوم" />
              </span>
            </div>
            <button onClick={() => setWithdrawQueued(true)}>
              {withdrawQueued ? <Bi en="Withdrawal queued ✓" ar="تم إدراج السحب ✓" /> : <Bi en="Withdraw SAR 428.40" ar="اسحب 428.40 ر.س" />}
            </button>
          </div>
          {withdrawQueued && (
            <div style={{ marginTop: '12px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--mut)', letterSpacing: '.04em', lineHeight: 1.6 }}>
              <Bi
                en="Manual withdrawal queued. SAR 428.40 will land in your Bank Aljazira account by tomorrow afternoon. You’ll get an email confirmation."
                ar="تم إدراج السحب اليدوي. ستصل 428.40 ر.س إلى حساب بنك الجزيرة بحلول ظهر الغد. ستصلك رسالة تأكيد بالبريد."
              />
            </div>
          )}

          {/* Payout method */}
          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout method" ar="طريقة الصرف" />
                </h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: '6px' }}>
                  <Bi en="Currently set to " ar="مضبوطة حاليًا على " />
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    <Bi en="SAR · Bank transfer" ar="ر.س · تحويل بنكي" />
                  </b>
                </div>
              </div>
            </div>

            <div className="method-grid">
              <div className="method on">
                <div className="nm">
                  <Bi en="Bank transfer · SAR" ar="تحويل بنكي · ر.س" />
                </div>
                <div className="desc">
                  <Bi
                    en="Direct deposit to your Saudi IBAN. 1 business day after each payout cycle. Zero fee."
                    ar="إيداع مباشر إلى الآيبان السعودي الخاص بك. يوم عمل واحد بعد كل دورة صرف. بدون رسوم."
                  />
                </div>
                <div className="meta">
                  <span>
                    <Bi en="Available" ar="متاح" />
                  </span>
                  <b>
                    <Bi en="Default" ar="افتراضي" />
                  </b>
                </div>
              </div>
              <div className="method">
                <div className="nm">STC Pay</div>
                <div className="desc">
                  <Bi
                    en="Instant transfer to your STC Pay wallet. Useful for smaller, more frequent payouts. Zero fee."
                    ar="تحويل فوري إلى محفظة STC Pay. مفيد للدفعات الأصغر والأكثر تكرارًا. بدون رسوم."
                  />
                </div>
                <div className="meta">
                  <span>
                    <Bi en="Not connected" ar="غير مرتبط" />
                  </span>
                  <b>
                    <Bi en="Available" ar="متاح" />
                  </b>
                </div>
              </div>
              <div className="method locked">
                <span className="gate">
                  <Bi en="Gold tier" ar="فئة ذهبية" />
                </span>
                <div className="nm">USDC · Base L2</div>
                <div className="desc">
                  <Bi
                    en="On-chain payout in USDC stablecoin. Unlocked once your account reaches Gold provider tier (500+ jobs/month)."
                    ar="صرف على السلسلة بعملة USDC المستقرة. يُفتح عند وصول حسابك إلى الفئة الذهبية (500+ مهمة شهريًا)."
                  />
                </div>
                <div className="meta">
                  <span>
                    <Bi en="638 jobs to unlock" ar="638 مهمة للفتح" />
                  </span>
                  <b>
                    <Bi en="Locked" ar="مقفل" />
                  </b>
                </div>
              </div>
            </div>
          </div>

          {/* Connected bank account */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Connected bank account" ar="الحساب البنكي المرتبط" />
                </h3>
              </div>
              <button className="seg-btn" onClick={() => setChangingBank(true)}>
                <Bi en="Change bank account" ar="تغيير الحساب البنكي" />
              </button>
            </div>

            <div className="bank-row">
              <div className="logo">BAJ</div>
              <div>
                <div className="nm">
                  <Bi en="Bank Aljazira" ar="بنك الجزيرة" />{' '}
                  <span className="verified">
                    ✓ <Bi en="Verified" ar="موثّق" />
                  </span>
                </div>
                <div className="acc">
                  IBAN · SA03 8000 0001 6080 1011 <b style={{ color: 'var(--ink)', fontWeight: 500 }}>2847</b>
                </div>
                <div className="holder">
                  <Bi en="Yazeed Mohammed Al-Qahtani · matched to ID record" ar="يزيد محمد القحطاني · مطابق لسجل الهوية" />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--mut)', textAlign: 'end' }}>
                <Bi en="Connected" ar="مرتبط منذ" />
                <br />
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>
                  <Bi en="14 Aug 2024" ar="14 أغسطس 2024" />
                </b>
              </div>
            </div>

            <div style={{ marginTop: '18px', padding: '14px 18px', border: '1px dashed var(--hair)', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--mut)', lineHeight: 1.7 }}>
              <Bi en="Verified via SAMA Open Banking. Your IBAN must be Saudi (" ar="موثّق عبر الخدمات المصرفية المفتوحة لمؤسسة النقد. يجب أن يكون الآيبان سعوديًا (" />
              <b style={{ color: 'var(--ink)', fontWeight: 500 }}>SA</b>
              <Bi
                en=" prefix) and the account holder must match your government ID. Each verification takes around 2 minutes."
                ar=" بادئة) وأن يطابق اسم صاحب الحساب هويتك الحكومية. يستغرق كل توثيق حوالي دقيقتين."
              />
              {changingBank && (
                <span style={{ display: 'block', marginTop: '8px', color: 'var(--pv-accent)' }}>
                  <Bi en="Re-verify a new IBAN via SAMA Open Banking. Takes about 2 minutes." ar="أعد توثيق آيبان جديد عبر الخدمات المصرفية المفتوحة. يستغرق حوالي دقيقتين." />
                </span>
              )}
            </div>
          </div>

          {/* Schedule + threshold */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Schedule & threshold" ar="الجدولة والحد" />
                </h3>
              </div>
            </div>

            <div className="sched-grid">
              <div className="sched-card">
                <div className="k">
                  <Bi en="Payout frequency" ar="تكرار الصرف" />
                </div>
                <div className="opts">
                  {FREQ_OPTS.map((opt, i) => (
                    <button key={opt.en} className={`opt${i === freq ? ' on' : ''}`} onClick={() => setFreq(i)}>
                      <Bi en={opt.en} ar={opt.ar} />
                    </button>
                  ))}
                </div>
                <div className="hint">
                  <Bi
                    en="Weekly is most common. Daily pays out every business morning if your balance is over the minimum threshold of "
                    ar="الأسبوعي هو الأكثر شيوعًا. اليومي يصرف كل صباح عمل إذا تجاوز رصيدك الحد الأدنى وهو "
                  />
                  <b>
                    <Bi en="SAR 50" ar="50 ر.س" />
                  </b>
                  <Bi
                    en=". Manual stops automatic payouts entirely — you withdraw when you want."
                    ar=". اليدوي يوقف الصرف التلقائي تمامًا — تسحب متى أردت."
                  />
                </div>
              </div>
              <div className="sched-card">
                <div className="k">
                  <Bi en="Auto-withdraw threshold" ar="حد السحب التلقائي" />
                </div>
                <div className="opts">
                  {THRESHOLD_OPTS.map((opt, i) => (
                    <button key={opt.en} className={`opt${i === threshold ? ' on' : ''}`} onClick={() => setThreshold(i)}>
                      <Bi en={opt.en} ar={opt.ar} />
                    </button>
                  ))}
                </div>
                <div className="hint">
                  <Bi
                    en="When your accrued balance crosses this number, we’ll trigger a payout even if it’s outside your normal schedule. Set higher to batch payouts and reduce bank-statement noise."
                    ar="عندما يتجاوز رصيدك المتراكم هذا الرقم، سنطلق دفعة حتى لو كانت خارج جدولك المعتاد. ارفع الحد لتجميع الدفعات وتقليل ضوضاء كشف الحساب."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tax + invoicing */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Tax & invoicing" ar="الضريبة والفوترة" />
                </h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: '6px' }}>
                  <Bi en="Each payout ships with a ZATCA-compliant invoice" ar="كل دفعة تصدر بفاتورة متوافقة مع هيئة الزكاة والضريبة (ZATCA)" />
                </div>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="VAT registration" ar="التسجيل الضريبي" />
                </b>
                <Bi en="For tax invoices" ar="للفواتير الضريبية" />
              </div>
              <div className="ctl">
                <input className="input" type="text" defaultValue="VAT-300123456789003" />
                <span className="hint">
                  <Bi
                    en="Leave blank if you’re not VAT-registered. We’ll still issue a standard invoice for each payout."
                    ar="اتركه فارغًا إن لم تكن مسجلاً ضريبيًا. سنظل نصدر فاتورة قياسية لكل دفعة."
                  />
                </span>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Invoice address" ar="عنوان الفاتورة" />
                </b>
                <Bi en="Appears on each invoice" ar="يظهر في كل فاتورة" />
              </div>
              <div className="ctl">
                <input className="input" type="text" defaultValue="Riyadh Studio · King Abdullah Rd, Riyadh 11564" />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Auto-email invoices" ar="إرسال الفواتير تلقائيًا" />
                </b>
                <Bi en="To your finance team" ar="إلى فريقك المالي" />
              </div>
              <div className="ctl">
                <input className="input" type="email" placeholder={lang === 'ar' ? 'finance@yourcompany.sa' : 'finance@yourcompany.sa'} />
                <span className="hint">
                  <Bi en="Optional · we already email them to your primary contact." ar="اختياري · نرسلها أصلاً إلى جهة الاتصال الأساسية." />
                </span>
              </div>
            </div>
          </div>

          {/* Recent payouts */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout history" ar="سجل المدفوعات" />
                </h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: '6px' }}>
                  <Bi en="Last 12 cycles · download any invoice" ar="آخر 12 دورة · حمّل أي فاتورة" />
                </div>
              </div>
              <Link href="#" style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink)', borderBottom: '1px solid var(--ink)', paddingBottom: '2px' }}>
                <Bi en="View earnings →" ar="عرض الأرباح ←" />
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
                    <Bi en="Paid" ar="دُفعت" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Invoice" ar="الفاتورة" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {PAYOUTS.map((p) => (
                  <tr key={p.period}>
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
                      <span className={`stat ${p.status}`}>
                        {p.status === 'paid' ? <Bi en="paid" ar="مدفوعة" /> : <Bi en="accruing" ar="متراكمة" />}
                      </span>
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

          {/* Footnotes */}
          <div style={{ marginTop: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' }}>
            <div className="panel">
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '8px' }}>
                <Bi en="How earnings settle" ar="كيف تُسوّى الأرباح" />
              </div>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
                <Bi
                  en="Each completed job credits your balance in halala-precision. Failed jobs and rejected requests don’t bill the renter, so they don’t credit you either. Balance updates within a few seconds of job completion. Anything you see on this page is real and ready to be paid out."
                  ar="كل مهمة مكتملة تضيف إلى رصيدك بدقة الهللة. المهام الفاشلة والطلبات المرفوضة لا تُحاسب المستأجر، لذا لا تُضاف إليك. يتحدّث الرصيد خلال ثوانٍ من اكتمال المهمة. كل ما تراه على هذه الصفحة حقيقي وجاهز للصرف."
                />
              </p>
            </div>
            <div className="panel">
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '8px' }}>
                <Bi en="Revenue share" ar="حصة الإيرادات" />
              </div>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
                <Bi en="At your current Silver tier, you keep " ar="في فئتك الفضية الحالية، تحتفظ بـ " />
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>75%</b>
                <Bi
                  en=" of every job. The rest covers platform routing, monitoring, billing, and renter support. The cut shown on each job already nets these out — what you see is what you’ll be paid."
                  ar=" من كل مهمة. الباقي يغطي توجيه المنصة والمراقبة والفوترة ودعم المستأجر. الحصة الظاهرة على كل مهمة تخصم ذلك مسبقًا — ما تراه هو ما ستُدفع."
                />
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
