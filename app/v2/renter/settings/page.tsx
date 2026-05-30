'use client'

// Ported from public/dcp-v2/prototypes/renter/Settings.html (renter console · Settings).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./settings.css.
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './settings.css'

// ── Fetched API shape (subset of v1 /renters/me) ───────────────────────
interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
    balance_halala?: number
  }
}

// halala (integer cents) → SAR number
const halToSar = (h: number) => h / 100
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

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

const CURRENT_PAGE = 'settings'

// ── Members mock (illustrative; from prototype) ────────────────────────
const MEMBERS = [
  {
    initial: 'F',
    avStyle: undefined as CSSProperties | undefined,
    name: 'Fatima Al-Harbi',
    email: 'fatima@nextwave.sa · you',
    emailAr: 'fatima@nextwave.sa · أنت',
    role: 'Owner',
    roleAr: 'المالك',
    rolePill: 'owner',
    lastActive: 'Now',
    lastActiveAr: 'الآن',
    editable: false,
  },
  {
    initial: 'H',
    avStyle: { background: 'linear-gradient(135deg, #6bb39a, var(--teal))' } as CSSProperties,
    name: 'Hassan Al-Otaibi',
    email: 'hassan@nextwave.sa',
    emailAr: 'hassan@nextwave.sa',
    role: 'Developer',
    roleAr: 'مطوّر',
    rolePill: '',
    lastActive: '2 hours ago',
    lastActiveAr: 'قبل ساعتين',
    editable: true,
  },
  {
    initial: 'R',
    avStyle: { background: 'linear-gradient(135deg, var(--orange), #b84510)' } as CSSProperties,
    name: 'Reem Al-Suhaimi',
    email: 'reem@nextwave.sa',
    emailAr: 'reem@nextwave.sa',
    role: 'Billing',
    roleAr: 'الفوترة',
    rolePill: '',
    lastActive: '3 days ago',
    lastActiveAr: 'قبل ٣ أيام',
    editable: true,
  },
]

export default function RenterSettingsPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)

  // ── Live profile data (/renters/me). Mock stays as the default render;
  // a successful fetch overrides it. Null on no key / failure. ───────────
  const [balanceSar, setBalanceSar] = useState<number | null>(null)
  const [ownerName, setOwnerName] = useState<string | null>(null)
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  // Editable form fields — seeded with the prototype mock so the page renders
  // fully with no key, then overwritten by /renters/me on a successful fetch.
  const [workspaceName, setWorkspaceName] = useState('NextWave Commerce')
  const [legalName, setLegalName] = useState('NextWave Commerce LLC')
  const [billingContact, setBillingContact] = useState('finance@nextwave.sa')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) return

    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    let cancelled = false

    fetch(`${base}/renters/me`, { headers })
      .then((r) => (r.ok ? (r.json() as Promise<RenterMe>) : null))
      .then((d) => {
        if (cancelled || !d?.renter) return
        const me = d.renter
        if (typeof me.balance_halala === 'number') setBalanceSar(halToSar(me.balance_halala))
        if (me.name) setOwnerName(me.name)
        if (me.email) setOwnerEmail(me.email)
        if (me.organization) {
          setOrgName(me.organization)
          setWorkspaceName(me.organization)
          setLegalName(me.organization)
        }
        if (me.email) setBillingContact(me.email)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="settings">
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
              <span className="nm">{orgName ?? 'NextWave Commerce'}</span>
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
            {balanceSar != null ? (
              <>
                SAR {numFmt.format(Math.floor(balanceSar))}
                <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
              </>
            ) : (
              <>
                SAR 2,184<span className="u">.52</span>
              </>
            )}
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
          <div className="av">{(ownerName ?? 'Fatima Al-Harbi').charAt(0)}</div>
          <div className="who">
            {ownerName ?? 'Fatima Al-Harbi'}
            <span className="e">{ownerEmail ?? 'fatima@nextwave.sa'} · Owner</span>
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
        <header className="rt-tb" id="rt-tb" data-crumb="Settings">
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
            <span>{orgName ?? 'NextWave Commerce'}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Settings" ar="الإعدادات" />
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
            <Bi en="Workspace " ar="إعدادات " />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="settings." ar="مساحة العمل." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="NextWave Commerce · 3 members" ar="نكست‑ويف كوميرس · ٣ أعضاء" />
            </span>
            <span>
              <Bi en="Owner " ar="المالك " />
              <b>{ownerName ?? 'Fatima Al-Harbi'}</b>
            </span>
          </div>

          {/* Workspace */}
          <div className="panel" style={{ marginTop: 36 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Workspace" ar="مساحة العمل" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Workspace name" ar="اسم مساحة العمل" />
                </b>
                <Bi en="Visible to everyone in the workspace" ar="مرئي لكل أعضاء مساحة العمل" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Workspace slug" ar="معرّف مساحة العمل" />
                </b>
                <Bi en="Appears in URLs and API logs" ar="يظهر في الروابط وسجلات API" />
              </div>
              <div className="ctl">
                <input className="input" type="text" defaultValue="nextwave-prod" />
                <span className="hint">
                  console.dcp.sa/
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>nextwave-prod</b>
                </span>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Region preference" ar="تفضيل المنطقة" />
                </b>
                <Bi en="For ambiguous routing decisions" ar="لقرارات التوجيه غير الواضحة" />
              </div>
              <div className="ctl">
                <select className="select" defaultValue="Riyadh (default)">
                  <option>{lang === 'ar' ? 'الرياض (افتراضي)' : 'Riyadh (default)'}</option>
                  <option>{lang === 'ar' ? 'جدة' : 'Jeddah'}</option>
                  <option>{lang === 'ar' ? 'الدمام' : 'Dammam'}</option>
                  <option>{lang === 'ar' ? 'نيوم' : 'NEOM'}</option>
                  <option>{lang === 'ar' ? 'لا تفضيل' : 'No preference'}</option>
                </select>
                <span className="hint">
                  <Bi
                    en="All workspaces serve from inside the Kingdom regardless of this setting. This just nudges the router."
                    ar="جميع مساحات العمل تُخدَم من داخل المملكة بغض النظر عن هذا الإعداد. هذا مجرد توجيه للموجّه."
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Billing entity */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Billing entity" ar="الكيان المالي" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Legal name" ar="الاسم القانوني" />
                </b>
                <Bi en="As shown on invoices" ar="كما يظهر على الفواتير" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Commercial registration" ar="السجل التجاري" />
                </b>
                <Bi en="CR number" ar="رقم السجل التجاري" />
              </div>
              <div className="ctl">
                <input className="input" type="text" defaultValue="1010382947" />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="VAT registration" ar="تسجيل ضريبة القيمة المضافة" />
                </b>
                <Bi en="For tax invoices" ar="للفواتير الضريبية" />
              </div>
              <div className="ctl">
                <input className="input" type="text" defaultValue="VAT-310234567890003" />
                <span className="hint">
                  <Bi
                    en="Leave blank if not VAT-registered. We still issue a simplified invoice."
                    ar="اتركه فارغًا إن لم تكن مسجّلًا في ضريبة القيمة المضافة. سنُصدر فاتورة مبسّطة على أي حال."
                  />
                </span>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Billing address" ar="عنوان الفوترة" />
                </b>
                <Bi en="Appears on every invoice" ar="يظهر على كل فاتورة" />
              </div>
              <div className="ctl">
                <textarea
                  className="textarea"
                  defaultValue={'King Abdullah Road\nRiyadh 11564\nSaudi Arabia'}
                />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Billing contact" ar="جهة اتصال الفوترة" />
                </b>
                <Bi en="Where to send invoices" ar="إلى أين تُرسل الفواتير" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="email"
                  value={billingContact}
                  onChange={(e) => setBillingContact(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Members" ar="الأعضاء" />
                </h3>
              </div>
              <button className="btn-pri" type="button">
                <Bi en="+ Invite member" ar="+ دعوة عضو" />
              </button>
            </div>
            <table className="tbl members-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Member" ar="العضو" />
                  </th>
                  <th>
                    <Bi en="Role" ar="الدور" />
                  </th>
                  <th>
                    <Bi en="Last active" ar="آخر نشاط" />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {MEMBERS.map((m) => (
                  <tr key={m.email}>
                    <td>
                      <span className="av" style={m.avStyle}>
                        {m.initial}
                      </span>
                      <span className="nm">
                        {m.name} <span className="em">{lang === 'ar' ? m.emailAr : m.email}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`role-pill${m.rolePill ? ` ${m.rolePill}` : ''}`}>
                        <Bi en={m.role} ar={m.roleAr} />
                      </span>
                    </td>
                    <td>
                      <span className="mut">
                        <Bi en={m.lastActive} ar={m.lastActiveAr} />
                      </span>
                    </td>
                    <td style={m.editable ? { textAlign: 'end' } : undefined}>
                      {m.editable ? (
                        <button className="btn-sec" type="button">
                          <Bi en="Edit" ar="تعديل" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notifications */}
          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Notifications" ar="الإشعارات" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Spend alerts" ar="تنبيهات الإنفاق" />
                </b>
                <Bi en="Email when daily spend crosses a threshold" ar="بريد عند تجاوز الإنفاق اليومي حدًّا معيّنًا" />
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Alert at SAR 100 / day" ar="تنبيه عند ١٠٠ ريال / يوم" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Alert at SAR 500 / day" ar="تنبيه عند ٥٠٠ ريال / يوم" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Alert at SAR 2,000 / day" ar="تنبيه عند ٢٬٠٠٠ ريال / يوم" />
                  </span>
                </label>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Wallet" ar="المحفظة" />
                </b>
                <Bi en="Top-ups and low balance" ar="عمليات الشحن والرصيد المنخفض" />
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Auto top-up triggered" ar="تشغيل الشحن التلقائي" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Balance below trigger threshold" ar="الرصيد دون حدّ التشغيل" />
                  </span>
                </label>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Other" ar="أخرى" />
                </b>
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" defaultChecked />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="New model available" ar="نموذج جديد متاح" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Marketing & product updates" ar="تحديثات تسويقية ومنتجات" />
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Danger */}
          <div
            className="panel"
            style={{
              marginTop: 28,
              borderColor: 'color-mix(in oklab, var(--err) 40%, var(--hair))',
            }}
          >
            <div
              className="panel-hd"
              style={{ borderBottomColor: 'color-mix(in oklab, var(--err) 30%, var(--hair))' }}
            >
              <div>
                <h3 style={{ color: 'var(--err)' }}>
                  <Bi en="Danger zone" ar="منطقة الخطر" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b style={{ color: 'var(--err)' }}>
                  <Bi en="Transfer ownership" ar="نقل الملكية" />
                </b>
                <Bi en="Hand the workspace to another member" ar="تسليم مساحة العمل لعضو آخر" />
              </div>
              <div className="ctl">
                <button
                  className="btn-sec danger"
                  type="button"
                  style={{ borderColor: 'var(--err)', color: 'var(--err)', alignSelf: 'flex-start' }}
                >
                  <Bi en="Transfer…" ar="نقل…" />
                </button>
              </div>
              <div className="lbl">
                <b style={{ color: 'var(--err)' }}>
                  <Bi en="Delete workspace" ar="حذف مساحة العمل" />
                </b>
                <Bi en="Permanent · this can’t be undone" ar="دائم · لا يمكن التراجع عنه" />
              </div>
              <div className="ctl">
                <button
                  className="btn-sec danger"
                  type="button"
                  style={{ borderColor: 'var(--err)', color: 'var(--err)', alignSelf: 'flex-start' }}
                >
                  <Bi en="Delete workspace…" ar="حذف مساحة العمل…" />
                </button>
                <span className="hint">
                  <Bi
                    en="All keys are revoked, all jobs stop, all data is purged after 90 days per PDPL."
                    ar="تُلغى جميع المفاتيح وتتوقف جميع المهام وتُمحى جميع البيانات بعد ٩٠ يومًا وفق نظام حماية البيانات الشخصية."
                  />
                </span>
              </div>
            </div>
          </div>

          <div
            style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'flex-end' }}
          >
            <button className="btn-sec" type="button">
              <Bi en="Discard changes" ar="تجاهل التغييرات" />
            </button>
            <button className="btn-pri" type="button">
              <Bi en="Save settings" ar="حفظ الإعدادات" />
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
