'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import './profile.css'

/* ════════ Provider nav (illustrative MOCK chrome) ════════ */
interface NavItem {
  k: string
  ic: string
  enLabel: string
  arLabel: string
  href: string
  bd?: string
}
interface NavSection {
  sec: string
  arSec: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    sec: 'Operate',
    arSec: 'التشغيل',
    items: [
      { k: 'dash', ic: '⌂', enLabel: 'Dashboard', arLabel: 'لوحة التحكم', href: '/v2/provider/dashboard' },
      { k: 'rigs', ic: '☷', enLabel: 'Rigs', arLabel: 'الأجهزة', href: '/v2/provider/rigs', bd: '4' },
      { k: 'earnings', ic: '△', enLabel: 'Earnings', arLabel: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', enLabel: 'Payouts', arLabel: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    arSec: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', enLabel: 'Profile', arLabel: 'الملف الشخصي', href: '/v2/provider/profile', bd: 'Silver' },
      { k: 'settings', ic: '⚙', enLabel: 'Settings', arLabel: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', enLabel: 'Provider docs', arLabel: 'دليل المزود', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_NAV = 'profile'

/* ════════ Initial identity + payout values (illustrative MOCK) ════════ */
const INITIAL_PROFILE = {
  displayName: 'Riyadh Studio',
  handle: 'riyadh-studio-01',
  email: 'yazeed@example.sa',
  phone: '+966 50 123 4567',
  region: 'Riyadh',
  iban: 'SA03 8000 0001 6080 1011 2847',
  holder: 'Yazeed Mohammed Al-Qahtani',
  vat: 'VAT-300123456789003',
}

type ProfileState = typeof INITIAL_PROFILE

export default function ProviderProfilePage() {
  const { lang, toggle } = useV2()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState<ProfileState>(INITIAL_PROFILE)
  const [currency, setCurrency] = useState('sar')

  const update = (key: keyof ProfileState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const discard = () => {
    setForm(INITIAL_PROFILE)
    setCurrency('sar')
  }

  return (
    <div className="pv-app">
      {/* ═══════════ SIDEBAR ═══════════ */}
      <aside className={`pv-sb${drawerOpen ? ' on' : ''}`} id="pv-sb" data-page="profile">
        <div className="pv-sb-brand">
          <span className="wm">DCP<i>∞</i></span>
          <span className="ctx">
            <Bi en="Provider" ar="مزود" />
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
          <div className="row" style={{ marginTop: '8px', paddingTop: 0, border: 0 }}>
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>SAR 5,826</b>
          </div>
        </div>

        <nav className="pv-nav">
          {NAV.map((section) => (
            <div key={section.sec} style={{ display: 'contents' }}>
              <div className="sec">
                <Bi en={section.sec} ar={section.arSec} />
              </div>
              {section.items.map((it) => (
                <Link
                  key={it.k}
                  href={it.href}
                  className={it.k === CURRENT_NAV ? 'on' : undefined}
                  aria-current={it.k === CURRENT_NAV ? 'page' : undefined}
                >
                  <span className="ic">{it.ic}</span>
                  <span>
                    <Bi en={it.enLabel} ar={it.arLabel} />
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
          <span className="out" title="Sign out">↱</span>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      <div
        className={`pv-backdrop${drawerOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

      {/* ═══════════ MAIN ═══════════ */}
      <div>
        <header className="pv-tb">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            onClick={() => setDrawerOpen((o) => !o)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>riyadh-studio-01</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Profile" ar="الملف الشخصي" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="Live · earning" ar="مباشر · يكسب" />
          </span>
          <button
            className="lang"
            onClick={toggle}
            title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
          >
            {lang === 'en' ? 'ع' : 'EN'}
          </button>
          <button className="kill" title={lang === 'en' ? 'Pause all rigs' : 'إيقاف كل الأجهزة'}>
            ◉ <Bi en="Kill switch" ar="إيقاف طارئ" />
          </button>
        </header>

        <main className="pv-main">
          <h1 className="pv-h1">
            <Bi en="Your " ar="ملفك " />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
              <Bi en="profile." ar="الشخصي." />
            </em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="Account, identity, payouts" ar="الحساب، الهوية، المدفوعات" />
            </span>
            <span>
              <Bi en="Tier " ar="الفئة " />
              <b>
                <Bi en="Silver" ar="فضي" />
              </b>
            </span>
            <span>
              <Bi en="Trust " ar="الثقة " />
              <b>92</b>
            </span>
            <span>
              <Bi en="Joined Aug 2024" ar="انضم أغسطس 2024" />
            </span>
          </div>

          {/* Tier ladder */}
          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Provider tier" ar="فئة المزود" />
                </h3>
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10.5px',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--mut)',
                }}
              >
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>1,862</b>{' '}
                <Bi en="jobs / month · " ar="مهمة / شهر · " />
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>638</b>{' '}
                <Bi en="to next tier" ar="للفئة التالية" />
              </div>
            </div>
            <div className="tier-bar">
              <div className="t">
                <span className="nm">
                  <Bi en="Bronze" ar="برونزي" />
                </span>
                <span className="req">
                  <Bi en="0 jobs / month" ar="0 مهمة / شهر" />
                </span>
                <span className="cut">
                  <Bi en="70% rev share" ar="70% حصة الإيراد" />
                </span>
              </div>
              <div className="t">
                <span className="nm">
                  <Bi en="Silver" ar="فضي" />
                </span>
                <span className="req on">
                  <Bi en="50 jobs / month" ar="50 مهمة / شهر" />
                </span>
                <span className="cut">
                  <Bi en="75% rev share · current" ar="75% حصة الإيراد · الحالية" />
                </span>
              </div>
              <div className="t on">
                <span className="nm">
                  <Bi en="Gold" ar="ذهبي" />
                </span>
                <span className="req">
                  <Bi en="500 jobs / month" ar="500 مهمة / شهر" />
                </span>
                <span className="cut">
                  <Bi en="78% rev share" ar="78% حصة الإيراد" />
                </span>
              </div>
              <div className="t">
                <span className="nm">
                  <Bi en="Platinum" ar="بلاتيني" />
                </span>
                <span className="req">
                  <Bi en="2,500 jobs / month" ar="2,500 مهمة / شهر" />
                </span>
                <span className="cut">
                  <Bi en="82% rev share" ar="82% حصة الإيراد" />
                </span>
              </div>
            </div>
          </div>

          {/* Account info */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Identity" ar="الهوية" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Display name" ar="الاسم المعروض" />
                </b>
                <Bi en="Shown on the marketplace" ar="يظهر في السوق" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => update('displayName', e.target.value)}
                />
                <span className="hint">
                  <Bi
                    en="Visible to renters. Personal name stays private."
                    ar="مرئي للمستأجرين. يبقى اسمك الشخصي خاصاً."
                  />
                </span>
              </div>

              <div className="lbl">
                <b>
                  <Bi en="Provider handle" ar="معرّف المزود" />
                </b>
                <Bi en="Your URL slug" ar="مُعرّف الرابط الخاص بك" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={form.handle}
                  onChange={(e) => update('handle', e.target.value)}
                />
                <span className="hint">
                  dcp.sa/p/
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{form.handle}</b>
                </span>
              </div>

              <div className="lbl">
                <b>
                  <Bi en="Contact email" ar="البريد الإلكتروني" />
                </b>
                <Bi en="For payouts and incident alerts" ar="للمدفوعات وتنبيهات الحوادث" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>

              <div className="lbl">
                <b>
                  <Bi en="Phone" ar="الهاتف" />
                </b>
                <Bi en="For payout verification" ar="للتحقق من المدفوعات" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </div>

              <div className="lbl">
                <b>
                  <Bi en="Region" ar="المنطقة" />
                </b>
                <Bi en="Where your rigs live" ar="مكان تواجد أجهزتك" />
              </div>
              <div className="ctl">
                <select
                  className="select"
                  value={form.region}
                  onChange={(e) => update('region', e.target.value)}
                >
                  <option value="Riyadh">{lang === 'ar' ? 'الرياض' : 'Riyadh'}</option>
                  <option value="Jeddah">{lang === 'ar' ? 'جدة' : 'Jeddah'}</option>
                  <option value="Dammam">{lang === 'ar' ? 'الدمام' : 'Dammam'}</option>
                  <option value="NEOM">{lang === 'ar' ? 'نيوم' : 'NEOM'}</option>
                </select>
                <span className="hint">
                  <Bi
                    en="Affects routing latency for nearby renters."
                    ar="يؤثر على زمن التوجيه للمستأجرين القريبين."
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Payout method */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout method" ar="طريقة الدفع" />
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
                <Bi en="Weekly · every Monday" ar="أسبوعياً · كل اثنين" />
              </span>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Currency" ar="العملة" />
                </b>
                <Bi en="Settlement currency" ar="عملة التسوية" />
              </div>
              <div className="ctl">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label className="switch">
                    <input
                      type="radio"
                      name="cur"
                      checked={currency === 'sar'}
                      onChange={() => setCurrency('sar')}
                    />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="SAR · Saudi Riyal" ar="ريال سعودي · SAR" />
                    </span>
                  </label>
                </div>
                <span className="hint">
                  <Bi
                    en="USDC on Base available once you reach Gold tier."
                    ar="USDC على Base متاح عند الوصول إلى الفئة الذهبية."
                  />
                </span>
              </div>

              <div className="lbl">
                <b>
                  <Bi en="IBAN" ar="الآيبان" />
                </b>
                <Bi en="Saudi bank account" ar="حساب بنكي سعودي" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={form.iban}
                  onChange={(e) => update('iban', e.target.value)}
                />
                <span className="hint">
                  <Bi en="Verified · Bank Aljazira" ar="موثّق · بنك الجزيرة" />
                </span>
              </div>

              <div className="lbl">
                <b>
                  <Bi en="Account holder" ar="صاحب الحساب" />
                </b>
                <Bi en="As shown on IBAN" ar="كما يظهر على الآيبان" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={form.holder}
                  onChange={(e) => update('holder', e.target.value)}
                />
              </div>

              <div className="lbl">
                <b>
                  <Bi en="VAT / ZATCA" ar="ضريبة القيمة المضافة / هيئة الزكاة" />
                </b>
                <Bi en="For tax invoices" ar="للفواتير الضريبية" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={form.vat}
                  onChange={(e) => update('vat', e.target.value)}
                />
                <span className="hint">
                  <Bi
                    en="We issue an automated ZATCA-compliant invoice each payout cycle."
                    ar="نُصدر فاتورة آلية متوافقة مع هيئة الزكاة في كل دورة دفع."
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Save */}
          <div
            style={{
              marginTop: '28px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button className="seg-btn" onClick={discard}>
              <Bi en="Discard changes" ar="تجاهل التغييرات" />
            </button>
            <button
              className="btn primary lg"
              style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a' }}
            >
              <Bi en="Save profile" ar="حفظ الملف" />
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
