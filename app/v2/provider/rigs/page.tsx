'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import './rigs.css'

// ── Provider shell nav (from provider-shell.js NAV template) ──
interface NavItem {
  k: string
  ic: string
  label: string
  labelAr: string
  href: string
  bd?: string
}
interface NavSection {
  sec: string
  secAr: string
  items: NavItem[]
}

const NAV: NavSection[] = [
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
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف', href: '/v2/provider/profile', bd: 'Silver' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'وثائق المزود', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'rigs'

// ── Mock rig data (illustrative, verbatim from the prototype) ──
type RigStatus = 'earning' | 'idle' | 'paused'
interface Rig {
  id: string
  name: string
  gpu: string
  vram: number
  os: string
  engine: string
  status: RigStatus
  util: number
  temp: number
  uptime: string
  jobs: number
  today: number
  todayJobs: number
  week: number
  avg: number
  fail: number
}

const RIGS: Rig[] = [
  { id: 'rig-01', name: 'studio-main', gpu: 'RTX 4090', vram: 24, os: 'Ubuntu 22.04', engine: 'Ollama', status: 'earning', util: 78, temp: 62, uptime: '23d 14h', jobs: 1284, today: 94.2, todayJobs: 28, week: 624, avg: 89, fail: 0 },
  { id: 'rig-02', name: 'studio-bench', gpu: 'RTX 4080', vram: 16, os: 'Ubuntu 22.04', engine: 'Ollama', status: 'earning', util: 54, temp: 58, uptime: '18d 02h', jobs: 842, today: 62.4, todayJobs: 18, week: 412, avg: 58, fail: 0 },
  { id: 'rig-03', name: 'office-mac', gpu: 'M3 Max', vram: 64, os: 'macOS 14.5', engine: 'MLX', status: 'idle', util: 0, temp: 42, uptime: '9d 22h', jobs: 318, today: 0.0, todayJobs: 0, week: 188, avg: 27, fail: 1 },
  { id: 'rig-04', name: 'garage-3090', gpu: 'RTX 3090', vram: 24, os: 'Ubuntu 20.04', engine: 'Ollama', status: 'paused', util: 0, temp: 38, uptime: '0h', jobs: 2104, today: 0.0, todayJobs: 0, week: 0, avg: 0, fail: 0 },
]

type Filter = 'all' | RigStatus
const FILTERS: { f: Filter; en: string; ar: string }[] = [
  { f: 'all', en: 'All · 4', ar: 'الكل · 4' },
  { f: 'earning', en: 'Earning · 2', ar: 'تكسب · 2' },
  { f: 'idle', en: 'Idle · 1', ar: 'خاملة · 1' },
  { f: 'paused', en: 'Paused · 1', ar: 'متوقفة · 1' },
]

const STATUS_AR: Record<RigStatus, string> = {
  earning: 'تكسب',
  idle: 'خاملة',
  paused: 'متوقفة',
}

export default function ProviderRigsPage() {
  const { lang, toggle } = useV2()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState('rig-01')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const rows = RIGS.filter((r) => filter === 'all' || r.status === filter)
  const selected = RIGS.find((r) => r.id === selectedId) ?? RIGS[0]

  return (
    <div className="pv-app">
      {/* Sidebar — from provider-shell.js, kept inline so the page is self-contained */}
      <aside className={`pv-sb${sidebarOpen ? ' on' : ''}`} id="pv-sb" data-page={CURRENT_PAGE}>
        <div className="pv-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
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
            <span className="d"></span> <Bi en="2 of 4 rigs earning" ar="2 من 4 أجهزة تكسب" />
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
              <div className="sec">{lang === 'ar' ? s.secAr : s.sec}</div>
              {s.items.map((it) => (
                <Link
                  key={it.k}
                  href={it.href}
                  className={CURRENT_PAGE === it.k ? 'on' : ''}
                  aria-current={CURRENT_PAGE === it.k ? 'page' : undefined}
                >
                  <span className="ic">{it.ic}</span>
                  <span>{lang === 'ar' ? it.labelAr : it.label}</span>
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
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`pv-backdrop${sidebarOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setSidebarOpen(false)}
      />

      <div>
        {/* Topbar — from provider-shell.js */}
        <header className="pv-tb" id="pv-tb" data-crumb="Rigs">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>riyadh-studio-01</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Rigs" ar="الأجهزة" />
            </span>
          </div>
          <span className="pill">
            <span className="d"></span> <Bi en="Live · earning" ar="مباشر · تكسب" />
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="kill" title="Pause all rigs">
            ◉ <Bi en="Kill switch" ar="إيقاف الكل" />
          </button>
        </header>

        <main className="pv-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '18px' }}>
            <div>
              <h1 className="pv-h1">
                <Bi en="Your " ar="أجهزتك " />
                <em style={{ fontStyle: 'italic', color: 'var(--orange)' }}>
                  <Bi en="rigs." ar="." />
                </em>
              </h1>
              <div className="pv-h1-sub">
                <span>
                  <Bi en="4 connected" ar="4 متصلة" />
                </span>
                <span>
                  <b>2</b> <Bi en="earning · " ar="تكسب · " />
                  <b>1</b> <Bi en="idle · " ar="خاملة · " />
                  <b>1</b> <Bi en="paused" ar="متوقفة" />
                </span>
                <span>
                  <Bi en="Add a new rig with a 4 MB installer" ar="أضف جهازًا جديدًا بمُثبّت 4 ميغابايت" />
                </span>
              </div>
            </div>
            <a href="#" className="btn primary lg" style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a' }}>
              <Bi en="+ Connect a new rig" ar="+ ربط جهاز جديد" />
            </a>
          </div>

          {/* Rigs table */}
          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Fleet" ar="الأسطول" />
                </h3>
              </div>
              <div className="seg" id="filter">
                {FILTERS.map((f) => (
                  <button
                    key={f.f}
                    data-f={f.f}
                    className={filter === f.f ? 'on' : ''}
                    onClick={() => setFilter(f.f)}
                  >
                    {lang === 'ar' ? f.ar : f.en}
                  </button>
                ))}
              </div>
            </div>
            <table className="rigs-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Rig" ar="الجهاز" />
                  </th>
                  <th>GPU</th>
                  <th>
                    <Bi en="OS · engine" ar="النظام · المحرك" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Utilization" ar="الاستخدام" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Temp" ar="الحرارة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Uptime" ar="مدة التشغيل" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Jobs · lifetime" ar="المهام · الإجمالي" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="rigs-body">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    data-id={r.id}
                    className={`rig-row${r.id === selectedId ? ' selected' : ''}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td>
                      <span className={`rig-pip ${r.status}`}></span>
                      <span className="rig-name">{r.name}</span>
                    </td>
                    <td>
                      <span className="rig-gpu">{r.gpu}</span>
                      <small>{r.vram} GB</small>
                    </td>
                    <td>
                      <span className="rig-os">{r.os}</span>
                      <small>{r.engine}</small>
                    </td>
                    <td>
                      <span className={`stat ${r.status}`}>{lang === 'ar' ? STATUS_AR[r.status] : r.status}</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="util">{r.util}%</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="temp">{r.temp}°C</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="uptime">{r.uptime}</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="jobs">{r.jobs.toLocaleString()}</span>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="arrow">→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Selected rig drawer */}
          <div className="panel" style={{ marginTop: '28px' }} id="rig-detail">
            <div className="panel-hd">
              <div>
                <h3 id="rd-name">{selected.name}</h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.08em', color: 'var(--mut)', marginTop: '6px' }}>
                  <span id="rd-gpu">
                    {selected.gpu} · {selected.vram} GB
                  </span>{' '}
                  · <span id="rd-os">{selected.os}</span> · <span id="rd-engine">{selected.engine}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="seg-btn" id="btn-pause">
                  ⏸ <Bi en="Pause this rig" ar="إيقاف هذا الجهاز" />
                </button>
                <button className="seg-btn" id="btn-restart">
                  ↻ <Bi en="Restart daemon" ar="إعادة تشغيل الخدمة" />
                </button>
                <button className="seg-btn danger" id="btn-remove">
                  ⊘ <Bi en="Remove" ar="إزالة" />
                </button>
              </div>
            </div>

            <div className="rd-grid">
              <div>
                <div className="rd-k">
                  <Bi en="Current utilization" ar="الاستخدام الحالي" />
                </div>
                <div className="rd-v" id="rd-util">
                  {selected.util}%
                </div>
                <div className="rd-bar">
                  <span id="rd-util-bar" style={{ width: `${selected.util}%` }}></span>
                </div>
              </div>
              <div>
                <div className="rd-k">
                  <Bi en="Today · earned" ar="اليوم · المكتسب" />
                </div>
                <div className="rd-v">
                  SAR <span id="rd-today">{selected.today.toFixed(2)}</span>
                </div>
                <div className="rd-foot">
                  <Bi en="from " ar="من " />
                  <span id="rd-today-jobs">{selected.todayJobs}</span> <Bi en="jobs" ar="مهمة" />
                </div>
              </div>
              <div>
                <div className="rd-k">
                  <Bi en="Last 7 days" ar="آخر 7 أيام" />
                </div>
                <div className="rd-v">
                  SAR <span id="rd-week">{selected.week}</span>
                </div>
                <div className="rd-foot">
                  <Bi en="avg " ar="متوسط " />
                  <span id="rd-avg">{selected.avg}</span> <Bi en="/ day" ar="/ يوم" />
                </div>
              </div>
              <div>
                <div className="rd-k">
                  <Bi en="Cold-start failures · 7d" ar="فشل البدء البارد · 7 أيام" />
                </div>
                <div className="rd-v" id="rd-fail">
                  {selected.fail}
                </div>
                <div className="rd-foot">
                  <Bi en="all clear" ar="كل شيء سليم" />
                </div>
              </div>
            </div>

            {/* Per-rig setup snippet */}
            <div style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--hair)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '10px' }}>
                <Bi en="Re-pair this rig" ar="إعادة إقران هذا الجهاز" />
              </div>
              <pre className="code">$ curl -sSL https://dcp.sa/install | sh
$ dcp-provider pair --token rig_8f3a…c721</pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
