'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './rigs.css'

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
      { k: 'rigs', ic: '☷', label: 'Rigs', labelAr: 'الأجهزة', href: '/v2/provider/rigs' },
      { k: 'earnings', ic: '△', label: 'Earnings', labelAr: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', label: 'Payouts', labelAr: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف', href: '/v2/provider/profile' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'وثائق المزود', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'rigs'
type RigStatus = 'earning' | 'idle' | 'paused' | 'offline'
type Filter = 'all' | RigStatus
type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface Rig {
  id: string
  name: string
  gpu: string
  vram: string
  os: string
  engine: string
  status: RigStatus
  util: number | null
  temp: number | null
  uptime: string
  jobs: number | null
  today: number | null
  todayJobs: number | null
  week: number | null
  avg: number | null
  fail: number | null
}

interface ProviderGpuMetrics {
  utilization_pct?: number
  vram_used_mib?: number
  temperature_c?: number
}
interface ProviderMe {
  id?: number | string
  name?: string
  email?: string
  status?: string
  is_paused?: boolean
  gpu_model?: string
  gpu_vram_mib?: number
  vram_mb?: number
  total_jobs?: number
  uptime_percent?: number
  today_earnings_halala?: number
  week_earnings_halala?: number
  active_job?: unknown
  daemon_version?: string | null
  gpu_metrics?: ProviderGpuMetrics
}
interface ProviderMeResponse {
  provider?: ProviderMe
}

const STATUS_AR: Record<RigStatus, string> = {
  earning: 'تكسب',
  idle: 'خاملة',
  paused: 'متوقفة',
  offline: 'غير متصلة',
}

function toRigStatus(status: string | undefined, isPaused: boolean | undefined): RigStatus {
  if (isPaused || status === 'paused') return 'paused'
  if (status === 'online' || status === 'earning') return 'earning'
  if (status === 'connected' || status === 'idle' || status === 'registered') return 'idle'
  return 'offline'
}

function halToSar(halala: number | undefined): number | null {
  return typeof halala === 'number' ? halala / 100 : null
}

function mapProviderToRig(p: ProviderMe): Rig {
  const vramMib = Number(p.gpu_vram_mib || p.vram_mb || 0)
  const util = p.gpu_metrics?.utilization_pct
  const temp = p.gpu_metrics?.temperature_c
  const status = toRigStatus(p.status, p.is_paused)
  return {
    id: String(p.id || 'provider-rig'),
    name: p.name || 'Provider rig',
    gpu: p.gpu_model || 'GPU pending daemon report',
    vram: vramMib > 0 ? `${Math.round(vramMib / 1024)} GB` : 'VRAM pending',
    os: p.daemon_version ? `Daemon ${p.daemon_version}` : 'Daemon pending',
    engine: p.gpu_model ? 'DCP daemon' : 'Pending install',
    status,
    util: typeof util === 'number' ? Math.round(util) : null,
    temp: typeof temp === 'number' ? Math.round(temp) : null,
    uptime: typeof p.uptime_percent === 'number' ? `${p.uptime_percent.toFixed(1)}%` : '—',
    jobs: typeof p.total_jobs === 'number' ? p.total_jobs : null,
    today: halToSar(p.today_earnings_halala),
    todayJobs: p.active_job ? 1 : 0,
    week: halToSar(p.week_earnings_halala),
    avg: null,
    fail: null,
  }
}

export default function ProviderRigsPage() {
  const { lang, toggle } = useV2()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rigs, setRigs] = useState<Rig[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [providerName, setProviderName] = useState('')
  const [providerEmail, setProviderEmail] = useState('')
  const [providerKey, setProviderKey] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [copyNote, setCopyNote] = useState('')

  function signOut() {
    if (typeof window === 'undefined') return
    localStorage.removeItem('dc1_provider_key')
    window.location.href = '/v2/auth'
  }

  async function setPaused(rigId: string, pause: boolean) {
    if (!providerKey || actionBusy) return
    setActionBusy(true)
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/providers/${pause ? 'pause' : 'resume'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: providerKey }),
      })
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (!res.ok) throw new Error(data.error || (pause ? 'Pause failed.' : 'Resume failed.'))
      const nextStatus: RigStatus = pause ? 'paused' : toRigStatus(data.status, false)
      setRigs((prev) => prev.map((r) => (r.id === rigId ? { ...r, status: nextStatus } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  function killAll() {
    rigs.filter((r) => r.status !== 'paused').forEach((r) => void setPaused(r.id, true))
  }

  function copyInstall() {
    if (typeof navigator === 'undefined' || !setupCmd) return
    void navigator.clipboard?.writeText(setupCmd)
    setCopyNote(lang === 'ar' ? 'تم نسخ الأمر' : 'Command copied')
    setTimeout(() => setCopyNote(''), 2500)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    setProviderKey(key)
    let cancelled = false
    setLoadState('loading')
    setError('')

    fetch(`${getApiBase()}/providers/me?key=${encodeURIComponent(key)}`, {
      headers: { 'x-provider-key': key },
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ProviderMeResponse & { error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load provider rig.')
        return data
      })
      .then((data) => {
        if (cancelled) return
        const provider = data.provider
        if (!provider) throw new Error('Provider not found.')
        const rig = mapProviderToRig(provider)
        setProviderName(provider.name || '')
        setProviderEmail(provider.email || '')
        setRigs([rig])
        setSelectedId(rig.id)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setRigs([])
        setError(err instanceof Error ? err.message : 'Failed to load provider rig.')
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const rows = rigs.filter((r) => filter === 'all' || r.status === filter)
  const selected = rigs.find((r) => r.id === selectedId) ?? rigs[0] ?? null
  const earningCount = rigs.filter((r) => r.status === 'earning').length
  const idleCount = rigs.filter((r) => r.status === 'idle').length
  const pausedCount = rigs.filter((r) => r.status === 'paused').length
  const displayName = providerName || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = providerEmail || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const todaySar = rigs.reduce((sum, r) => sum + (r.today || 0), 0)
  const weekSar = rigs.reduce((sum, r) => sum + (r.week || 0), 0)
  const filters = useMemo(
    () => [
      { f: 'all' as const, en: `All · ${rigs.length}`, ar: `الكل · ${rigs.length}` },
      { f: 'earning' as const, en: `Earning · ${earningCount}`, ar: `تكسب · ${earningCount}` },
      { f: 'idle' as const, en: `Idle · ${idleCount}`, ar: `خاملة · ${idleCount}` },
      { f: 'paused' as const, en: `Paused · ${pausedCount}`, ar: `متوقفة · ${pausedCount}` },
    ],
    [earningCount, idleCount, pausedCount, rigs.length]
  )
  const setupPath = providerKey
    ? `/api/providers/download/setup?key=${encodeURIComponent(providerKey)}&os=linux`
    : '/v2/auth?role=provider&method=apikey&redirect=/v2/provider/rigs'
  // Full key lives ONLY in the clipboard command, never in the rendered DOM/href.
  const maskedKey = providerKey ? `dcp-provider-…${providerKey.slice(-4)}` : ''
  const maskedPath = providerKey
    ? `/api/providers/download/setup?key=${maskedKey}&os=linux`
    : setupPath
  const setupCmd = providerKey
    ? `curl -fsSL "${setupPath}" -o dcp-setup.sh && bash dcp-setup.sh`
    : ''

  return (
    <div className="pv-app">
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
            {todaySar > 0 ? `SAR ${todaySar.toFixed(2)}` : <span className="u">—</span>}
          </div>
          <div className="live">
            <span className="d"></span> {earningCount} / {rigs.length} <Bi en="earning" ar="تكسب" />
          </div>
          <div className="row">
            <span>
              <Bi en="Yesterday" ar="أمس" />
            </span>
            <b>—</b>
          </div>
          <div className="row">
            <span>
              <Bi en="This week" ar="هذا الأسبوع" />
            </span>
            <b>{weekSar > 0 ? `SAR ${weekSar.toFixed(2)}` : '—'}</b>
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
          <div className="av">P</div>
          <div className="who">
            {displayName}
            <span className="e">{displayScope}</span>
          </div>
          <span
            className="out"
            title="Sign out"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={signOut}
          >
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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Rigs" ar="الأجهزة" />
            </span>
          </div>
          <span className="pill">
            <span className="d"></span> {loadState === 'ready' ? `${rigs.length} rig` : loadState}
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="kill" title="Pause all rigs" onClick={killAll} disabled={actionBusy || rigs.length === 0}>
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
                  {rigs.length} <Bi en="loaded" ar="محمّل" />
                </span>
                <span>
                  <b>{earningCount}</b> <Bi en="earning · " ar="تكسب · " />
                  <b>{idleCount}</b> <Bi en="idle · " ar="خاملة · " />
                  <b>{pausedCount}</b> <Bi en="paused" ar="متوقفة" />
                </span>
                <span>
                  <Bi en="Add a new rig with a live setup installer" ar="أضف جهازًا جديدًا بمثبّت حي" />
                </span>
              </div>
            </div>
            {providerKey ? (
              <button type="button" onClick={copyInstall} className="btn primary lg" style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a', cursor: 'pointer' }}>
                <Bi en="+ Connect a new rig" ar="+ ربط جهاز جديد" />
              </button>
            ) : (
              <Link href={setupPath} className="btn primary lg" style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a' }}>
                <Bi en="+ Connect a new rig" ar="+ ربط جهاز جديد" />
              </Link>
            )}
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load rig data." ar="سجّل الدخول بمفتاح مزوّد لتحميل بيانات الجهاز." />{' '}
              <Link href="/v2/auth?role=provider&method=apikey&redirect=/v2/provider/rigs">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {loadState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {error}
            </div>
          )}

          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Fleet" ar="الأسطول" />
                </h3>
              </div>
              <div className="seg" id="filter">
                {filters.map((f) => (
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
                    <Bi en="Daemon" ar="الخادم المحلي" />
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
                    <Bi en="Uptime" ar="الجاهزية" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Jobs · lifetime" ar="المهام · الإجمالي" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="rigs-body">
                {rows.length > 0 ? (
                  rows.map((r) => (
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
                        <small>{r.vram}</small>
                      </td>
                      <td>
                        <span className="rig-os">{r.os}</span>
                        <small>{r.engine}</small>
                      </td>
                      <td>
                        <span className={`stat ${r.status}`}>{lang === 'ar' ? STATUS_AR[r.status] : r.status}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        <span className="util">{r.util != null ? `${r.util}%` : '—'}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        <span className="temp">{r.temp != null ? `${r.temp}°C` : '—'}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        <span className="uptime">{r.uptime}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        <span className="jobs">{r.jobs != null ? r.jobs.toLocaleString() : '—'}</span>
                      </td>
                      <td style={{ textAlign: 'end' }}>
                        <span className="arrow">→</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <span className="empty-row">
                        <Bi en="No rig data yet. Sign in or install the daemon to populate this table." ar="لا توجد بيانات جهاز بعد. سجّل الدخول أو ثبّت الخادم المحلي لملء الجدول." />
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginTop: '28px' }} id="rig-detail">
            {selected ? (
              <>
                <div className="panel-hd">
                  <div>
                    <h3 id="rd-name">{selected.name}</h3>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.08em', color: 'var(--mut)', marginTop: '6px' }}>
                      <span id="rd-gpu">
                        {selected.gpu} · {selected.vram}
                      </span>{' '}
                      · <span id="rd-os">{selected.os}</span> · <span id="rd-engine">{selected.engine}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {selected.status === 'paused' ? (
                      <button className="seg-btn" id="btn-resume" onClick={() => setPaused(selected.id, false)} disabled={actionBusy}>
                        ▶ <Bi en="Resume this rig" ar="تشغيل هذا الجهاز" />
                      </button>
                    ) : (
                      <button className="seg-btn" id="btn-pause" onClick={() => setPaused(selected.id, true)} disabled={actionBusy}>
                        ⏸ <Bi en="Pause this rig" ar="إيقاف هذا الجهاز" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="rd-grid">
                  <div>
                    <div className="rd-k">
                      <Bi en="Current utilization" ar="الاستخدام الحالي" />
                    </div>
                    <div className="rd-v" id="rd-util">
                      {selected.util != null ? `${selected.util}%` : '—'}
                    </div>
                    <div className="rd-bar">
                      <span id="rd-util-bar" style={{ width: `${selected.util || 0}%` }}></span>
                    </div>
                  </div>
                  <div>
                    <div className="rd-k">
                      <Bi en="Today · earned" ar="اليوم · المكتسب" />
                    </div>
                    <div className="rd-v">
                      {selected.today != null ? `SAR ${selected.today.toFixed(2)}` : '—'}
                    </div>
                    <div className="rd-foot">
                      {selected.todayJobs != null ? <Bi en={`active now · ${selected.todayJobs}/1`} ar={`نشط الآن · ${selected.todayJobs}/1`} /> : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="rd-k">
                      <Bi en="Last 7 days" ar="آخر 7 أيام" />
                    </div>
                    <div className="rd-v">
                      {selected.week != null ? `SAR ${selected.week.toFixed(2)}` : '—'}
                    </div>
                    <div className="rd-foot">
                      <Bi en="from provider account" ar="من حساب المزوّد" />
                    </div>
                  </div>
                  <div>
                    <div className="rd-k">
                      <Bi en="Cold-start failures · 7d" ar="فشل البدء البارد · 7 أيام" />
                    </div>
                    <div className="rd-v" id="rd-fail">
                      {selected.fail ?? '—'}
                    </div>
                    <div className="rd-foot">
                      <Bi en="not exposed by current endpoint" ar="غير متاح في المسار الحالي" />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--hair)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '10px' }}>
                    <Bi en="Re-pair this rig" ar="إعادة إقران هذا الجهاز" />
                  </div>
                  <pre className="code">$ curl -fsSL "{maskedPath}" -o dcp-setup.sh
$ bash dcp-setup.sh</pre>
                  {providerKey && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                      <button type="button" className="seg-btn" onClick={copyInstall}>
                        ⎘ <Bi en="Copy install command" ar="نسخ أمر التثبيت" />
                      </button>
                      {copyNote && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--pv-accent)' }}>{copyNote}</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-row">
                <Bi en="Select a loaded rig to see details." ar="اختر جهازًا محمّلًا لرؤية التفاصيل." />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
