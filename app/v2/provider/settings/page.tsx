'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import './settings2.css'

/* ── Nav model (derived from provider-shell.js, mapped to /v2 routes) ── */
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

const CURRENT_NAV = 'settings'

export default function ProviderSettingsPage() {
  const { lang, toggle } = useV2()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Controlled form state (illustrative MOCK defaults from the prototype) ──
  const [acceptJobs, setAcceptJobs] = useState(true)
  const [quietFrom, setQuietFrom] = useState('00:00')
  const [quietTo, setQuietTo] = useState('06:00')
  const [maxConcurrent, setMaxConcurrent] = useState('2 (balanced)')

  const [jobChat, setJobChat] = useState(true)
  const [jobEmbed, setJobEmbed] = useState(true)
  const [jobRerank, setJobRerank] = useState(true)
  const [jobLong, setJobLong] = useState(false)
  const [jobBatch, setJobBatch] = useState(false)
  const [minJobSize, setMinJobSize] = useState('50 tokens (skip ping jobs)')

  const [notifWeekly, setNotifWeekly] = useState(true)
  const [notifOffline, setNotifOffline] = useState(true)
  const [notifPayout, setNotifPayout] = useState(true)
  const [notifNewModel, setNotifNewModel] = useState(false)
  const [notifMarketing, setNotifMarketing] = useState(false)

  return (
    <div className="pv-app">
      {/* ═══════════ SIDEBAR ═══════════ */}
      <aside className={`pv-sb${drawerOpen ? ' on' : ''}`} id="pv-sb" data-page="settings">
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
            SAR 218<span className="u"><Bi en="so far" ar="حتى الآن" /></span>
          </div>
          <div className="live">
            <span className="d" /> <Bi en="2 of 4 rigs earning" ar="جهازان من 4 يكسبان" />
          </div>
          <div className="row">
            <span><Bi en="Yesterday" ar="أمس" /></span>
            <b>SAR 194</b>
          </div>
          <div className="row">
            <span><Bi en="This month" ar="هذا الشهر" /></span>
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
        <header className="pv-tb" id="pv-tb" data-crumb="Settings">
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
              <Bi en="Settings" ar="الإعدادات" />
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
            <Bi en="Fleet " ar="إعدادات " />
            <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
              <Bi en="settings." ar="الأسطول." />
            </em>
          </h1>
          <div className="pv-h1-sub">
            <span>
              <Bi en="Defaults applied to all rigs" ar="الإعدادات الافتراضية المطبقة على كل الأجهزة" />
            </span>
            <span>
              <Bi en="Per-rig overrides live in " ar="التجاوزات لكل جهاز في " />
              <Link href="/v2/provider/rigs" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--mut)' }}>
                <Bi en="Rigs" ar="الأجهزة" />
              </Link>
            </span>
          </div>

          {/* Availability */}
          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Availability" ar="التوفر" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b><Bi en="Accept jobs" ar="قبول المهام" /></b>
                <Bi en="Fleet-wide kill switch" ar="مفتاح إيقاف على مستوى الأسطول" />
              </div>
              <div className="ctl">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={acceptJobs}
                    onChange={() => setAcceptJobs((v) => !v)}
                  />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi
                      en="Accepting jobs — rigs visible on the marketplace"
                      ar="قبول المهام — الأجهزة ظاهرة في السوق"
                    />
                  </span>
                </label>
                <span className="hint">
                  <Bi
                    en="Pausing here keeps your rigs online but stops new jobs from being assigned."
                    ar="الإيقاف المؤقت هنا يُبقي أجهزتك متصلة لكن يوقف إسناد مهام جديدة."
                  />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="Quiet hours" ar="ساعات الهدوء" /></b>
                <Bi en="Reduce throughput overnight" ar="تقليل الإنتاجية ليلًا" />
              </div>
              <div className="ctl">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    className="input"
                    type="time"
                    value={quietFrom}
                    onChange={(e) => setQuietFrom(e.target.value)}
                    style={{ maxWidth: '140px' }}
                  />
                  <span style={{ alignSelf: 'center', color: 'var(--mut)' }}>→</span>
                  <input
                    className="input"
                    type="time"
                    value={quietTo}
                    onChange={(e) => setQuietTo(e.target.value)}
                    style={{ maxWidth: '140px' }}
                  />
                </div>
                <span className="hint">
                  <Bi
                    en="During quiet hours we cap utilization at 40% so your power bill stays sane."
                    ar="خلال ساعات الهدوء نحد الاستخدام عند 40% حتى تبقى فاتورة الكهرباء معقولة."
                  />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="Maximum concurrent jobs" ar="أقصى عدد مهام متزامنة" /></b>
                <Bi en="Per-rig cap" ar="حد لكل جهاز" />
              </div>
              <div className="ctl">
                <select
                  className="select"
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(e.target.value)}
                  style={{ maxWidth: '200px' }}
                >
                  <option>1 (one at a time)</option>
                  <option>2 (balanced)</option>
                  <option>3 (throughput)</option>
                  <option>Engine default</option>
                </select>
              </div>
            </div>
          </div>

          {/* Routing */}
          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Routing" ar="التوجيه" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b><Bi en="Job types" ar="أنواع المهام" /></b>
                <Bi en="What your rigs will serve" ar="ما الذي ستخدمه أجهزتك" />
              </div>
              <div className="ctl">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className="switch">
                    <input type="checkbox" checked={jobChat} onChange={() => setJobChat((v) => !v)} />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="Chat completion · all your enabled models" ar="إكمال المحادثة · كل النماذج المفعّلة لديك" />
                    </span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={jobEmbed} onChange={() => setJobEmbed((v) => !v)} />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="Embeddings" ar="التضمينات" />
                    </span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={jobRerank} onChange={() => setJobRerank((v) => !v)} />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="Reranking" ar="إعادة الترتيب" />
                    </span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={jobLong} onChange={() => setJobLong((v) => !v)} />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="Long-context (32k+) · higher latency tolerance" ar="سياق طويل (32k+) · تحمل أعلى لزمن الاستجابة" />
                    </span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={jobBatch} onChange={() => setJobBatch((v) => !v)} />
                    <span className="track" />
                    <span className="lbl-text">
                      <Bi en="Batch jobs · off-peak only" ar="المهام الدفعية · خارج أوقات الذروة فقط" />
                    </span>
                  </label>
                </div>
              </div>

              <div className="lbl">
                <b><Bi en="Minimum job size" ar="الحد الأدنى لحجم المهمة" /></b>
                <Bi en="Skip tiny jobs" ar="تخطي المهام الصغيرة" />
              </div>
              <div className="ctl">
                <select
                  className="select"
                  value={minJobSize}
                  onChange={(e) => setMinJobSize(e.target.value)}
                  style={{ maxWidth: '240px' }}
                >
                  <option>No minimum</option>
                  <option>50 tokens (skip ping jobs)</option>
                  <option>200 tokens</option>
                  <option>1,000 tokens</option>
                </select>
                <span className="hint">
                  <Bi
                    en="Lower-end rigs sometimes prefer to skip the smallest jobs to keep utilization meaningful."
                    ar="الأجهزة الأقل أداءً تفضل أحيانًا تخطي أصغر المهام لإبقاء الاستخدام ذا معنى."
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="panel" style={{ marginTop: '28px' }}>
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
                  <Bi en="Email · yazeed@example.sa" ar="البريد · yazeed@example.sa" />
                </b>
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" checked={notifWeekly} onChange={() => setNotifWeekly((v) => !v)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Weekly earnings summary · every Sunday" ar="ملخص الأرباح الأسبوعي · كل أحد" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" checked={notifOffline} onChange={() => setNotifOffline((v) => !v)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Rig goes offline for more than 5 minutes" ar="انقطاع جهاز عن الاتصال لأكثر من 5 دقائق" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" checked={notifPayout} onChange={() => setNotifPayout((v) => !v)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Payout sent" ar="تم إرسال الدفعة" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" checked={notifNewModel} onChange={() => setNotifNewModel((v) => !v)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="New model available to serve" ar="نموذج جديد متاح للخدمة" />
                  </span>
                </label>
                <label className="switch">
                  <input type="checkbox" checked={notifMarketing} onChange={() => setNotifMarketing((v) => !v)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en="Marketing & product updates" ar="التسويق وتحديثات المنتج" />
                  </span>
                </label>
              </div>

              <div className="lbl">
                <b><Bi en="Telegram" ar="تيليجرام" /></b>
                <Bi en="Real-time alerts" ar="تنبيهات فورية" />
              </div>
              <div className="ctl">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button className="seg-btn">
                    <Bi en="+ Connect Telegram" ar="+ ربط تيليجرام" />
                  </button>
                  <span className="hint" style={{ color: 'var(--mut)' }}>
                    <Bi en="Not connected" ar="غير متصل" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Danger */}
          <div
            className="panel"
            style={{ marginTop: '28px', borderColor: 'color-mix(in oklab, var(--err) 40%, var(--hair))' }}
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
                  <Bi en="Pause provider account" ar="إيقاف حساب المزود مؤقتًا" />
                </b>
                <Bi en="All rigs go offline" ar="كل الأجهزة تصبح غير متصلة" />
              </div>
              <div className="ctl">
                <button
                  className="seg-btn danger"
                  style={{ borderColor: 'var(--err)', color: 'var(--err)', alignSelf: 'flex-start' }}
                >
                  <Bi en="Pause account" ar="إيقاف الحساب" />
                </button>
                <span className="hint">
                  <Bi
                    en="You can reactivate any time. Open jobs finish; new jobs stop being assigned."
                    ar="يمكنك إعادة التفعيل في أي وقت. تكتمل المهام المفتوحة؛ وتتوقف إسناد المهام الجديدة."
                  />
                </span>
              </div>
              <div className="lbl">
                <b style={{ color: 'var(--err)' }}>
                  <Bi en="Close account" ar="إغلاق الحساب" />
                </b>
                <Bi en="Permanent · this can't be undone" ar="دائم · لا يمكن التراجع عنه" />
              </div>
              <div className="ctl">
                <button
                  className="seg-btn danger"
                  style={{ borderColor: 'var(--err)', color: 'var(--err)', alignSelf: 'flex-start' }}
                >
                  <Bi en="Close account…" ar="إغلاق الحساب…" />
                </button>
                <span className="hint">
                  <Bi
                    en="Final payout sent, then your data is purged after 90 days per PDPL."
                    ar="تُرسل الدفعة النهائية، ثم تُحذف بياناتك بعد 90 يومًا وفق نظام حماية البيانات الشخصية (PDPL)."
                  />
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="seg-btn">
              <Bi en="Discard changes" ar="تجاهل التغييرات" />
            </button>
            <button
              className="btn primary lg"
              style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a' }}
            >
              <Bi en="Save settings" ar="حفظ الإعدادات" />
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
