'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './profile.css'

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
      { k: 'dash', ic: '⌂', enLabel: 'Dashboard', arLabel: 'لوحة التحكم', href: '/provider/dashboard' },
      { k: 'rigs', ic: '☷', enLabel: 'Rigs', arLabel: 'الأجهزة', href: '/provider/rigs' },
      { k: 'earnings', ic: '△', enLabel: 'Earnings', arLabel: 'الأرباح', href: '/provider/earnings' },
      { k: 'payouts', ic: '₪', enLabel: 'Payouts', arLabel: 'المدفوعات', href: '/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    arSec: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', enLabel: 'Profile', arLabel: 'الملف الشخصي', href: '/provider/profile' },
      { k: 'settings', ic: '⚙', enLabel: 'Settings', arLabel: 'الإعدادات', href: '/provider/settings' },
      { k: 'docs', ic: '?', enLabel: 'Provider docs', arLabel: 'دليل المزود', href: '/docs', bd: '↗' },
    ],
  },
]

const CURRENT_NAV = 'profile'
const HALALA_PER_SAR = 100

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface ProviderMe {
  name?: string | null
  email?: string | null
  status?: string | null
  approval_status?: string | null
  approved_at?: string | null
  rejected_reason?: string | null
  location?: string | null
  gpu_model?: string | null
  gpu_vram_mib?: number | null
  gpu_count_reported?: number | null
  gpu_count?: number | null
  daemon_version?: string | null
  run_mode?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  wallet_address?: string | null
  wallet_address_updated_at?: string | null
  payout_iban?: string | null
  payout_holder_name?: string | null
  payout_account_registered_at?: string | null
  total_jobs?: number | null
  uptime_percent?: number | null
  created_at?: string | null
  today_earnings_halala?: number | null
  week_earnings_halala?: number | null
  month_earnings_halala?: number | null
  total_earnings_halala?: number | null
  claimable_earnings_halala?: number | null
}

interface ProviderMeResponse {
  provider?: ProviderMe
}

const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

function halalaToSar(halala: number | null | undefined): number | null {
  return typeof halala === 'number' ? halala / HALALA_PER_SAR : null
}

function fmtSar(sar: number | null, precise = false): string {
  if (sar == null || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function maskIban(iban: string | null | undefined): string {
  const tail = (iban || '').replace(/\s+/g, '').slice(-4)
  return tail ? `IBAN ••${tail}` : '—'
}

function maskWallet(wallet: string | null | undefined): string {
  if (!wallet) return '—'
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet
}

function gpuSummary(provider: ProviderMe): string {
  const gpu = provider.gpu_model || ''
  const count = provider.gpu_count_reported || provider.gpu_count || 0
  const vram = provider.gpu_vram_mib ? `${Math.round(provider.gpu_vram_mib / 1024)} GB` : ''
  if (!gpu && !vram && !count) return '—'
  return [count > 1 ? `${count}x` : '', gpu, vram].filter(Boolean).join(' ')
}

function valueText(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  return String(value)
}

export default function ProviderProfilePage() {
  const { lang, toggle } = useV2()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [provider, setProvider] = useState<ProviderMe | null>(null)
  const [killing, setKilling] = useState(false)

  function signOut() {
    if (typeof window === 'undefined') return
    localStorage.removeItem('dc1_provider_key')
    window.location.href = '/auth'
  }

  async function killSwitch() {
    if (typeof window === 'undefined' || killing) return
    const key = getProviderKey()
    if (!key) {
      window.location.href = '/auth?role=provider&method=apikey&redirect=/provider/profile'
      return
    }
    const ok = window.confirm(
      lang === 'ar'
        ? 'إيقاف كل الأجهزة الآن؟ ستتوقف المهام الجديدة عن التوجيه إليك.'
        : 'Pause all rigs now? New jobs will stop routing to you.',
    )
    if (!ok) return
    setKilling(true)
    try {
      const res = await fetch(`${getApiBase()}/providers/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': key },
        body: JSON.stringify({ key }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to pause rigs.')
      window.location.reload()
    } catch (err) {
      setKilling(false)
      window.alert(err instanceof Error ? err.message : 'Failed to pause rigs.')
    }
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
        if (!res.ok) throw new Error(data.error || 'Failed to load provider profile.')
        return data
      })
      .then((data) => {
        if (cancelled) return
        setProvider(data.provider || null)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setProvider(null)
        setLoadState('error')
        setLoadError(err instanceof Error ? err.message : 'Failed to load provider profile.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const displayName = provider?.name || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = provider?.email || provider?.status || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const statusLabel = provider?.status || (loadState === 'missing-key' ? 'missing key' : loadState)
  const todaySar = halalaToSar(provider?.today_earnings_halala)
  const weekSar = halalaToSar(provider?.week_earnings_halala)
  const monthSar = halalaToSar(provider?.month_earnings_halala)
  const totalSar = halalaToSar(provider?.total_earnings_halala)
  const claimableSar = halalaToSar(provider?.claimable_earnings_halala)
  const jobs = typeof provider?.total_jobs === 'number' ? provider.total_jobs : null
  const uptime = typeof provider?.uptime_percent === 'number' ? `${provider.uptime_percent.toFixed(1)}%` : '—'
  const initials = displayName.charAt(0).toUpperCase() || 'P'

  return (
    <div className="pv-app">
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
            <span>
              <Bi en="This week" ar="هذا الأسبوع" />
            </span>
            <b>{weekSar != null ? `SAR ${fmtSar(weekSar)}` : '—'}</b>
          </div>
          <div className="row" style={{ marginTop: '8px', paddingTop: 0, border: 0 }}>
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
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
                  target={it.href === '/docs' ? '_blank' : undefined}
                  rel={it.href === '/docs' ? 'noopener noreferrer' : undefined}
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
          <div className="av">{initials}</div>
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
        className={`pv-backdrop${drawerOpen ? ' on' : ''}`}
        id="pv-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Profile" ar="الملف الشخصي" />
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
            type="button"
            title={lang === 'en' ? 'Pause all rigs' : 'إيقاف كل الأجهزة'}
            disabled={killing}
            onClick={killSwitch}
          >
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
              <Bi en="Provider account · payout identity · operational facts" ar="حساب المزوّد · هوية الصرف · بيانات التشغيل" />
            </span>
            <span>
              <Bi en="Jobs " ar="المهام " />
              <b>{jobs != null ? jobs.toLocaleString('en-US') : '—'}</b>
            </span>
            <span>
              <Bi en="Uptime " ar="الجاهزية " />
              <b>{uptime}</b>
            </span>
            <span>
              <Bi en="Joined " ar="انضم " />
              <b>{fmtDate(provider?.created_at)}</b>
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load profile data." ar="سجّل الدخول بمفتاح مزوّد لتحميل بيانات الملف." />{' '}
              <Link href="/auth?role=provider&method=apikey&redirect=/provider/profile">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {loadState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {loadError}
            </div>
          )}

          <div className="profile-grid" style={{ marginTop: '36px' }}>
            <div className="profile-card">
              <div className="profile-k">
                <Bi en="Account status" ar="حالة الحساب" />
              </div>
              <div className="profile-v">{valueText(provider?.approval_status || provider?.status)}</div>
              <div className="profile-d">
                <Bi en="Approved " ar="تمت الموافقة " />
                <b>{fmtDate(provider?.approved_at)}</b>
              </div>
            </div>
            <div className="profile-card">
              <div className="profile-k">
                <Bi en="Claimable earnings" ar="الأرباح القابلة للسحب" />
              </div>
              <div className="profile-v">SAR {fmtSar(claimableSar, true)}</div>
              <div className="profile-d">
                <Bi en="Lifetime " ar="الإجمالي " />
                <b>SAR {fmtSar(totalSar, true)}</b>
              </div>
            </div>
            <div className="profile-card">
              <div className="profile-k">
                <Bi en="GPU profile" ar="ملف GPU" />
              </div>
              <div className="profile-v small">{gpuSummary(provider || {})}</div>
              <div className="profile-d">
                <Bi en="Daemon " ar="الخادم المحلي " />
                <b>{valueText(provider?.daemon_version)}</b>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Identity" ar="الهوية" />
                </h3>
              </div>
            </div>
            <div className="kv-grid">
              <div className="kv">
                <span>
                  <Bi en="Display name" ar="الاسم المعروض" />
                </span>
                <b>{valueText(provider?.name)}</b>
              </div>
              <div className="kv">
                <span>
                  <Bi en="Contact email" ar="البريد الإلكتروني" />
                </span>
                <b>{valueText(provider?.email)}</b>
              </div>
              <div className="kv">
                <span>
                  <Bi en="Region" ar="المنطقة" />
                </span>
                <b>{valueText(provider?.location)}</b>
              </div>
              <div className="kv">
                <span>
                  <Bi en="Run mode" ar="وضع التشغيل" />
                </span>
                <b>{valueText(provider?.run_mode)}</b>
              </div>
              <div className="kv">
                <span>
                  <Bi en="Schedule" ar="الجدولة" />
                </span>
                <b>
                  {provider?.scheduled_start && provider?.scheduled_end
                    ? `${provider.scheduled_start}–${provider.scheduled_end}`
                    : '—'}
                </b>
              </div>
              <div className="kv">
                <span>
                  <Bi en="Wallet" ar="المحفظة" />
                </span>
                <b>{maskWallet(provider?.wallet_address)}</b>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout identity" ar="هوية الصرف" />
                </h3>
              </div>
              <Link className="profile-link" href="/provider/payouts">
                <Bi en="Open payouts →" ar="افتح المدفوعات ←" />
              </Link>
            </div>
            {provider?.payout_iban ? (
              <div className="kv-grid">
                <div className="kv">
                  <span>
                    <Bi en="Payout IBAN" ar="آيبان الصرف" />
                  </span>
                  <b>{maskIban(provider.payout_iban)}</b>
                </div>
                <div className="kv">
                  <span>
                    <Bi en="Account holder" ar="صاحب الحساب" />
                  </span>
                  <b>{valueText(provider.payout_holder_name)}</b>
                </div>
                <div className="kv">
                  <span>
                    <Bi en="Registered" ar="مسجل" />
                  </span>
                  <b>{fmtDate(provider.payout_account_registered_at)}</b>
                </div>
              </div>
            ) : (
              <span className="empty-row">
                <Bi en="No payout account on file." ar="لا يوجد حساب صرف محفوظ." />
              </span>
            )}
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Profile changes" ar="تغييرات الملف" />
                </h3>
              </div>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
              <Bi
                en="This v2 profile reads the live provider account. Editing identity, payout account, and tax records still needs dedicated backend update routes, so this page stays read-only instead of pretending to save changes."
                ar="يقرأ ملف v2 هذا حساب المزوّد الحي. ما زال تعديل الهوية وحساب الصرف والسجلات الضريبية يحتاج إلى مسارات backend مخصصة، لذلك تبقى هذه الصفحة للقراءة فقط بدل الادعاء بحفظ التغييرات."
              />
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
