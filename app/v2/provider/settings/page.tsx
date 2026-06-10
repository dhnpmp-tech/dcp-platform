'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './settings2.css'

interface ProviderProfile {
  name?: string | null
  email?: string | null
  status?: string | null
  is_paused?: boolean | null
  run_mode?: RunMode | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  gpu_usage_cap_pct?: number | null
  cost_per_gpu_second_halala?: number | null
  vram_reserve_gb?: number | null
  temp_limit_c?: number | null
  today_earnings_halala?: number | null
  week_earnings_halala?: number | null
  month_earnings_halala?: number | null
}

interface ProviderMeResponse {
  provider?: ProviderProfile
}

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
      { k: 'rigs', ic: '☷', enLabel: 'Rigs', arLabel: 'الأجهزة', href: '/v2/provider/rigs' },
      { k: 'earnings', ic: '△', enLabel: 'Earnings', arLabel: 'الأرباح', href: '/v2/provider/earnings' },
      { k: 'payouts', ic: '₪', enLabel: 'Payouts', arLabel: 'المدفوعات', href: '/v2/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    arSec: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', enLabel: 'Profile', arLabel: 'الملف الشخصي', href: '/v2/provider/profile' },
      { k: 'settings', ic: '⚙', enLabel: 'Settings', arLabel: 'الإعدادات', href: '/v2/provider/settings' },
      { k: 'docs', ic: '?', enLabel: 'Provider docs', arLabel: 'دليل المزود', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_NAV = 'settings'
const HALALA_PER_SAR = 100

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'
type SaveState = 'idle' | 'saving' | 'success' | 'error'
type RunMode = 'always-on' | 'scheduled' | 'manual'

const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function halalaToSar(halala: number | null | undefined): number | null {
  return typeof halala === 'number' ? halala / HALALA_PER_SAR : null
}

function fmtSar(sar: number | null): string {
  if (sar == null || Number.isNaN(sar)) return '—'
  return wholeFmt.format(sar)
}

function normalizeRunMode(mode: string | null | undefined): RunMode {
  return mode === 'scheduled' || mode === 'manual' || mode === 'always-on' ? mode : 'always-on'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function ProviderSettingsPage() {
  const { lang, toggle } = useV2()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [providerName, setProviderName] = useState('')
  const [providerEmail, setProviderEmail] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [todaySar, setTodaySar] = useState<number | null>(null)
  const [weekSar, setWeekSar] = useState<number | null>(null)
  const [monthSar, setMonthSar] = useState<number | null>(null)

  const [runMode, setRunMode] = useState<RunMode>('always-on')
  const [scheduledStart, setScheduledStart] = useState('23:00')
  const [scheduledEnd, setScheduledEnd] = useState('07:00')
  const [gpuUsageCap, setGpuUsageCap] = useState(80)
  const [vramReserve, setVramReserve] = useState(1)
  const [tempLimit, setTempLimit] = useState(85)
  const [podRateSar, setPodRateSar] = useState('') // '' = platform default

  function applyProvider(p: ProviderProfile) {
    setProviderName(p.name || '')
    setProviderEmail(p.email || '')
    setProviderStatus(p.status || '')
    setIsPaused(Boolean(p.is_paused || p.status === 'paused'))
    setTodaySar(halalaToSar(p.today_earnings_halala))
    setWeekSar(halalaToSar(p.week_earnings_halala))
    setMonthSar(halalaToSar(p.month_earnings_halala))
    setRunMode(normalizeRunMode(p.run_mode))
    setScheduledStart(p.scheduled_start || '23:00')
    setScheduledEnd(p.scheduled_end || '07:00')
    setGpuUsageCap(typeof p.gpu_usage_cap_pct === 'number' ? p.gpu_usage_cap_pct : 80)
    setVramReserve(typeof p.vram_reserve_gb === 'number' ? p.vram_reserve_gb : 1)
    setTempLimit(typeof p.temp_limit_c === 'number' ? p.temp_limit_c : 85)
    setPodRateSar(typeof p.cost_per_gpu_second_halala === 'number' ? String(Math.round(p.cost_per_gpu_second_halala * 36 * 100) / 100) : '')
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }

    let cancelled = false
    setLoadState('loading')
    setLoadError('')

    fetch(`${getApiBase()}/providers/me?key=${encodeURIComponent(key)}`, {
      headers: { 'x-provider-key': key },
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ProviderMeResponse & { error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load provider settings.')
        return data
      })
      .then((data) => {
        if (cancelled) return
        if (data.provider) applyProvider(data.provider)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadState('error')
        setLoadError(err instanceof Error ? err.message : 'Failed to load provider settings.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function savePreferences() {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    setSaveState('saving')
    setSaveMessage('')
    try {
      const res = await fetch(`${getApiBase()}/providers/preferences`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': key },
        body: JSON.stringify({
          key,
          run_mode: runMode,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          gpu_usage_cap_pct: clampNumber(gpuUsageCap, 0, 100),
          vram_reserve_gb: clampNumber(vramReserve, 0, 16),
          temp_limit_c: clampNumber(tempLimit, 50, 100),
          pod_rate_sar_per_hour: podRateSar.trim() === '' ? null : clampNumber(Number(podRateSar), 0.1, 50),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Preferences update failed.')
      if (data.preferences) {
        setRunMode(normalizeRunMode(data.preferences.run_mode))
        setScheduledStart(data.preferences.scheduled_start || scheduledStart)
        setScheduledEnd(data.preferences.scheduled_end || scheduledEnd)
        setGpuUsageCap(Number(data.preferences.gpu_usage_cap_pct ?? gpuUsageCap))
        setVramReserve(Number(data.preferences.vram_reserve_gb ?? vramReserve))
        setTempLimit(Number(data.preferences.temp_limit_c ?? tempLimit))
        setPodRateSar(data.preferences.cost_per_gpu_second_halala != null ? String(Math.round(Number(data.preferences.cost_per_gpu_second_halala) * 36 * 100) / 100) : '')
      }
      setSaveState('success')
      setSaveMessage('Saved to your DCP account. Run mode, schedule, GPU cap, VRAM reserve and temperature are NOT yet enforced on your node — the daemon still reads these from its local config.json. Only Pause / Resume takes effect live.')
    } catch (err) {
      setSaveState('error')
      setSaveMessage(err instanceof Error ? err.message : 'Preferences update failed.')
    }
  }

  async function setPaused(nextPaused: boolean) {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) return

    setSaveState('saving')
    setSaveMessage('')
    try {
      const route = nextPaused ? 'pause' : 'resume'
      const res = await fetch(`${getApiBase()}/providers/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': key },
        body: JSON.stringify({ key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Provider ${route} failed.`)
      setIsPaused(nextPaused)
      setProviderStatus(data.status || (nextPaused ? 'paused' : 'connected'))
      setSaveState('success')
      setSaveMessage(nextPaused ? 'Provider paused. New jobs will stop routing here.' : 'Provider resumed.')
    } catch (err) {
      setSaveState('error')
      setSaveMessage(err instanceof Error ? err.message : 'Provider status update failed.')
    }
  }

  const displayName = providerName || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = providerEmail || providerStatus || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const statusLabel = isPaused ? 'paused' : providerStatus || (loadState === 'missing-key' ? 'missing key' : loadState)
  const providerInitial = (displayName.trim()[0] || 'P').toUpperCase()
  const saveDisabled = loadState !== 'ready' || saveState === 'saving'

  return (
    <div className="pv-app">
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
            {todaySar != null ? (
              <>
                SAR {fmtSar(todaySar)}
                <span className="u">
                  <Bi en="so far" ar="حتى الآن" />
                </span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="live">
            <span className="d" /> {statusLabel}
          </div>
          <div className="row">
            <span><Bi en="This week" ar="هذا الأسبوع" /></span>
            <b>{weekSar != null ? `SAR ${fmtSar(weekSar)}` : '—'}</b>
          </div>
          <div className="row">
            <span><Bi en="This month" ar="هذا الشهر" /></span>
            <b>{monthSar != null ? `SAR ${fmtSar(monthSar)}` : '—'}</b>
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
          <div className="av">{providerInitial}</div>
          <div className="who">
            {displayName}
            <span className="e">{displayScope}</span>
          </div>
          <span
            className="out"
            title={lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => { localStorage.removeItem('dc1_provider_key'); window.location.href = '/v2/auth?role=provider' }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { localStorage.removeItem('dc1_provider_key'); window.location.href = '/v2/auth?role=provider' } }}
          >↱</span>
        </div>
      </aside>

      <div
        className={`pv-backdrop${drawerOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Settings" ar="الإعدادات" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> {statusLabel}
          </span>
          <button
            className="lang"
            onClick={toggle}
            title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
          >
            {lang === 'en' ? 'ع' : 'EN'}
          </button>
          <button
            className="kill"
            title={lang === 'en' ? 'Pause all rigs' : 'إيقاف كل الأجهزة'}
            disabled={loadState !== 'ready' || saveState === 'saving' || isPaused}
            onClick={() => setPaused(true)}
          >
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
              <Bi en="Live provider preferences only" ar="تفضيلات المزوّد الحية فقط" />
            </span>
            <span>
              <Bi en="Live on the node: " ar="الفعّال على الجهاز: " />
              <b>
                <Bi en="pause / resume only" ar="الإيقاف / الاستئناف فقط" />
              </b>
              <Bi
                en=" — run mode, schedule and limits are stored on your account but not yet enforced by the daemon."
                ar=" — يُحفظ وضع التشغيل والجدولة والحدود في حسابك لكن لا يطبّقها الخادم المحلي بعد."
              />
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load settings." ar="سجّل الدخول بمفتاح مزوّد لتحميل الإعدادات." />{' '}
              <Link href="/v2/auth?role=provider&method=apikey&redirect=/v2/provider/settings">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {loadState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {loadError}
            </div>
          )}
          {saveMessage && (
            <div className={`dash-state${saveState === 'error' ? ' err' : ''}`} style={{ marginTop: 24 }}>
              {saveMessage}
            </div>
          )}

          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Availability" ar="التوفر" />
                </h3>
              </div>
              <button className="seg-btn" disabled={loadState !== 'ready' || saveState === 'saving'} onClick={() => setPaused(!isPaused)}>
                {isPaused ? <Bi en="Resume provider" ar="استئناف المزوّد" /> : <Bi en="Pause provider" ar="إيقاف المزوّد مؤقتًا" />}
              </button>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b><Bi en="Run mode" ar="وضع التشغيل" /></b>
                <Bi en="Used by the daemon installer" ar="يستخدمه مثبّت الخادم المحلي" />
              </div>
              <div className="ctl">
                <select
                  className="select"
                  value={runMode}
                  onChange={(e) => setRunMode(normalizeRunMode(e.target.value))}
                  style={{ maxWidth: '220px' }}
                >
                  <option value="always-on">{lang === 'ar' ? 'دائم التشغيل' : 'Always on'}</option>
                  <option value="scheduled">{lang === 'ar' ? 'مجدول' : 'Scheduled'}</option>
                  <option value="manual">{lang === 'ar' ? 'يدوي' : 'Manual'}</option>
                </select>
                <span className="hint">
                  <Bi
                    en="Stored on your account for reference. The running daemon does not read this yet — it still uses its local config.json."
                    ar="يُحفظ في حسابك للاطّلاع فقط. لا يقرأه الخادم المحلي قيد التشغيل بعد — فهو ما زال يعتمد على config.json المحلي."
                  />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="Scheduled window" ar="نافذة الجدولة" /></b>
                <Bi en="Only active in scheduled mode" ar="تعمل فقط في الوضع المجدول" />
              </div>
              <div className="ctl">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    className="input"
                    type="time"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    style={{ maxWidth: '140px' }}
                  />
                  <span style={{ alignSelf: 'center', color: 'var(--mut)' }}>→</span>
                  <input
                    className="input"
                    type="time"
                    value={scheduledEnd}
                    onChange={(e) => setScheduledEnd(e.target.value)}
                    style={{ maxWidth: '140px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Resource limits" ar="حدود الموارد" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b><Bi en="GPU usage cap" ar="حد استخدام GPU" /></b>
                <Bi en="0-100 percent" ar="0-100 بالمئة" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={gpuUsageCap}
                  onChange={(e) => setGpuUsageCap(clampNumber(Number(e.target.value), 0, 100))}
                  style={{ maxWidth: '160px' }}
                />
                <span className="hint">
                  <Bi en="Saved to your account as gpu_usage_cap_pct. Not yet enforced on the node." ar="يُحفظ في حسابك كـ gpu_usage_cap_pct. لا يُطبّق على الجهاز بعد." />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="VRAM reserve" ar="احتياطي VRAM" /></b>
                <Bi en="0-16 GB" ar="0-16 جيجابايت" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={16}
                  step={0.5}
                  value={vramReserve}
                  onChange={(e) => setVramReserve(clampNumber(Number(e.target.value), 0, 16))}
                  style={{ maxWidth: '160px' }}
                />
                <span className="hint">
                  <Bi en="Saved to your account as vram_reserve_gb. Not yet enforced on the node." ar="يُحفظ في حسابك كـ vram_reserve_gb. لا يُطبّق على الجهاز بعد." />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="Temperature limit" ar="حد الحرارة" /></b>
                <Bi en="50-100 C" ar="50-100 مئوية" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="number"
                  min={50}
                  max={100}
                  value={tempLimit}
                  onChange={(e) => setTempLimit(clampNumber(Number(e.target.value), 50, 100))}
                  style={{ maxWidth: '160px' }}
                />
                <span className="hint">
                  <Bi en="Saved to your account as temp_limit_c. Not yet enforced on the node." ar="يُحفظ في حسابك كـ temp_limit_c. لا يُطبّق على الجهاز بعد." />
                </span>
              </div>

              <div className="lbl">
                <b><Bi en="GPU pod price" ar="سعر حاوية GPU" /></b>
                <Bi en="SAR per GPU-hour" ar="ريال لكل ساعة GPU" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  value={podRateSar}
                  placeholder="1.20"
                  onChange={(e) => setPodRateSar(e.target.value)}
                  style={{ maxWidth: '160px' }}
                />
                <span className="hint">
                  <Bi
                    en="What renters pay per hour for your whole GPU — you keep 75%. Leave empty for the platform default (1.20 SAR/hr). Market reference: RTX 3090 rents for ~0.5–0.9 SAR/hr on global marketplaces. Takes effect on the next pod launch."
                    ar="ما يدفعه المستأجرون في الساعة مقابل معالجك كاملاً — تحتفظ بـ ٧٥٪. اتركه فارغاً للسعر الافتراضي (١٫٢٠ ريال/ساعة). مرجع السوق: RTX 3090 يؤجَّر بنحو ٠٫٥–٠٫٩ ريال/ساعة عالمياً. يسري من الحاوية التالية." />
                </span>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Unavailable settings" ar="إعدادات غير متاحة" />
                </h3>
              </div>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
              <Bi
                en="Routing job-type filters, notification preferences, Telegram alerts, account closure, and marketing preferences do not have provider settings endpoints yet. They are intentionally not editable in v2 until backend routes exist."
                ar="لا توجد بعد مسارات إعدادات للمزوّد لفلاتر أنواع المهام أو تفضيلات الإشعارات أو تنبيهات تيليجرام أو إغلاق الحساب أو تفضيلات التسويق. لذلك لا تكون قابلة للتعديل في v2 حتى توجد مسارات backend."
              />
            </p>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              className="btn primary lg"
              style={{ background: 'var(--orange)', borderColor: 'var(--orange)', color: '#0a0b1a' }}
              disabled={saveDisabled}
              onClick={savePreferences}
            >
              {saveState === 'saving' ? <Bi en="Saving..." ar="جارٍ الحفظ..." /> : <Bi en="Save settings" ar="حفظ الإعدادات" />}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
