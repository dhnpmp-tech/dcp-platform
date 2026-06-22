'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './settings.css'

const HALALA_PER_SAR = 100

const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'settings'

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'
type SaveState = 'idle' | 'submitting' | 'success' | 'error'

interface RenterAccount {
  id?: number
  name?: string
  email?: string
  organization?: string
  use_case?: string | null
  phone?: string | null
  webhook_url?: string | null
  balance_halala?: number
  total_spent_halala?: number
  total_jobs?: number
  monthly_spend_cap_halala?: number
  created_at?: string
}

interface RenterMeResponse {
  renter?: RenterAccount
}

interface RenterBalanceResponse {
  balance_halala?: number
  balance_sar?: number
  held_halala?: number
  held_sar?: number
  total_spent_halala?: number
  total_spent_sar?: number
  total_jobs?: number
}

interface NotificationItem {
  id: number
  kind?: string
  job_id?: string | null
  read_at?: string | null
  created_at?: string
  payload?: Record<string, unknown> | null
}

interface NotificationsResponse {
  items?: NotificationItem[]
  total?: number
  unread_count?: number
}

const numFmt = new Intl.NumberFormat('en-US')
const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function halalaToSar(halala: number | null | undefined): number {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : 0
}

function fmtSar(sar: number | null | undefined, precise = true): string {
  if (typeof sar !== 'number' || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
}

function notificationLabel(item: NotificationItem): string {
  const payload = item.payload || {}
  const message = payload.message || payload.title || payload.status || item.kind
  return String(message || 'Notification')
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

export default function RenterSettingsPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [readAllState, setReadAllState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalanceResponse | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationTotal, setNotificationTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [spendCap, setSpendCap] = useState('')
  const [capState, setCapState] = useState<SaveState>('idle')
  const [exportState, setExportState] = useState<'idle' | 'working' | 'limited' | 'error'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteState, setDeleteState] = useState<SaveState>('idle')
  const [deleteMessage, setDeleteMessage] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    const renterKey = key
    const encodedKey = encodeURIComponent(renterKey)
    const base = getApiBase()
    const headers = { 'x-renter-key': renterKey }
    let cancelled = false

    async function loadSettings() {
      try {
        setLoadState('loading')
        setError('')
        const [me, balanceData, notificationsData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me?key=${encodedKey}`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance?key=${encodedKey}`, headers, true),
          readJson<NotificationsResponse>(`${base}/renters/me/notifications?key=${encodedKey}&limit=10`, headers, true),
        ])
        if (cancelled) return
        const account = me?.renter || null
        setRenter(account)
        setBalance(balanceData || null)
        setWebhookUrl(account?.webhook_url || '')
        setSpendCap(
          typeof account?.monthly_spend_cap_halala === 'number' && account.monthly_spend_cap_halala > 0
            ? String(account.monthly_spend_cap_halala / HALALA_PER_SAR)
            : '',
        )
        setNotifications(notificationsData?.items || [])
        setNotificationTotal(notificationsData?.total || 0)
        setUnreadCount(notificationsData?.unread_count || 0)
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Settings data could not be loaded')
        setLoadState('error')
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const displayName = renter?.organization || renter?.name || renter?.email || 'DCP renter'
  const displayEmail = renter?.email || 'API key not loaded'
  const displaySub = renter?.organization && renter?.name ? `${renter.name} · renter account` : 'Renter account'
  const balanceSar =
    typeof balance?.balance_sar === 'number'
      ? balance.balance_sar
      : typeof renter?.balance_halala === 'number'
        ? halalaToSar(renter.balance_halala)
        : halalaToSar(balance?.balance_halala)
  const heldSar = typeof balance?.held_sar === 'number' ? balance.held_sar : halalaToSar(balance?.held_halala)
  const totalSpentSar =
    typeof balance?.total_spent_sar === 'number'
      ? balance.total_spent_sar
      : typeof balance?.total_spent_halala === 'number'
        ? halalaToSar(balance.total_spent_halala)
        : halalaToSar(renter?.total_spent_halala)
  const totalJobs = balance?.total_jobs ?? renter?.total_jobs ?? 0
  const balanceParts = useMemo(() => fmtSar(balanceSar).split('.'), [balanceSar])
  const canUseSettings = loadState === 'ready'

  async function saveWebhook(event: FormEvent) {
    event.preventDefault()
    const key = getRenterKey()
    if (!key) return
    setSaveState('submitting')
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': key,
        },
        body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
      })
      const data = (await res.json()) as { error?: string; settings?: { webhook_url?: string | null } }
      if (!res.ok) throw new Error(data.error || `Webhook save failed: ${res.status}`)
      const savedUrl = data.settings?.webhook_url || ''
      setWebhookUrl(savedUrl)
      setRenter((prev) => (prev ? { ...prev, webhook_url: savedUrl } : prev))
      setSaveState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook could not be saved')
      setSaveState('error')
    }
  }

  async function saveBudget(event: FormEvent) {
    event.preventDefault()
    const key = getRenterKey()
    if (!key) return
    const trimmed = spendCap.trim()
    const sar = trimmed === '' ? 0 : Number(trimmed)
    if (!Number.isFinite(sar) || sar < 0) {
      setError('Enter a non-negative monthly cap in SAR (blank or 0 = unlimited).')
      setCapState('error')
      return
    }
    setCapState('submitting')
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/me/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': key,
        },
        body: JSON.stringify({ monthly_spend_cap_sar: sar }),
      })
      const data = (await res.json()) as { error?: string; monthly_spend_cap_halala?: number; unlimited?: boolean }
      if (!res.ok) throw new Error(data.error || `Spend cap save failed: ${res.status}`)
      const savedHalala = typeof data.monthly_spend_cap_halala === 'number' ? data.monthly_spend_cap_halala : 0
      setSpendCap(savedHalala > 0 ? String(savedHalala / HALALA_PER_SAR) : '')
      setRenter((prev) => (prev ? { ...prev, monthly_spend_cap_halala: savedHalala } : prev))
      setCapState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spend cap could not be saved')
      setCapState('error')
    }
  }

  async function handleExport() {
    const key = getRenterKey()
    if (!key || exportState === 'working' || exportState === 'limited') return
    setExportState('working')
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/me/data-export`, {
        headers: { 'x-renter-key': key },
        cache: 'no-store',
      })
      if (res.status === 429) {
        setExportState('limited')
        return
      }
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dcp-account-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account data could not be exported')
      setExportState('error')
    }
  }

  async function deleteAccount() {
    const key = getRenterKey()
    if (!key) return
    setDeleteState('submitting')
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/me`, {
        method: 'DELETE',
        headers: { 'x-renter-key': key },
      })
      const data = (await res.json()) as { error?: string; message?: string; deletion_scheduled_for?: string }
      if (!res.ok) throw new Error(data.error || `Account deletion failed: ${res.status}`)
      setDeleteMessage(data.message || 'Account scheduled for deletion.')
      setDeleteState('success')
      setConfirmDelete(false)
      window.setTimeout(() => {
        localStorage.removeItem('dc1_renter_key')
        window.location.href = '/auth'
      }, 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account could not be deleted')
      setDeleteState('error')
    }
  }

  async function markAllNotificationsRead() {
    const key = getRenterKey()
    if (!key) return
    setReadAllState('submitting')
    try {
      const res = await fetch(`${getApiBase()}/renters/me/notifications/read-all`, {
        method: 'POST',
        headers: { 'x-renter-key': key },
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || `Notification update failed: ${res.status}`)
      setUnreadCount(0)
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
      setReadAllState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications could not be updated')
      setReadAllState('error')
    }
  }

  return (
    <div className="rt-app">
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
          <div className="rt-ws-btn" title="Current renter account">
            <span className="av">{initials(displayName, displayEmail)}</span>
            <span className="body">
              <span className="nm">{displayName}</span>
              <span className="sub">{displaySub}</span>
            </span>
          </div>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {balanceParts[0]}
            <span className="u">.{balanceParts[1] || '00'}</span>
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR {fmtSar(heldSar)}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Lifetime spend" ar="إجمالي الإنفاق" />
            </span>
            <b>SAR {fmtSar(totalSpentSar, false)}</b>
          </div>
          <Link className="topup" href="/renter/wallet#top-up">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </Link>
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
                  <Link key={it.k} href={it.href} target={it.href === '/docs' ? '_blank' : undefined} rel={it.href === '/docs' ? 'noopener noreferrer' : undefined} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
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
          <div className="av">{initials(renter?.name, renter?.email)}</div>
          <div className="who">
            {renter?.name || 'Renter'}
            <span className="e">{displayEmail}</span>
          </div>
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/auth' }}>
            ↱
          </span>
        </div>
      </aside>

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <header className="rt-tb" id="rt-tb" data-crumb="Settings">
          <button className="mb-toggle" id="mb-toggle" aria-label="Menu" type="button" onClick={() => setNavOpen((v) => !v)}>
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
            <span
              className="d"
              style={{
                background: loadState === 'ready' ? 'var(--rt-accent)' : loadState === 'error' ? 'var(--err)' : 'var(--mut)',
                animation: loadState === 'ready' ? undefined : 'none',
              }}
            />{' '}
            <Bi en={loadState === 'ready' ? 'API live' : 'Needs renter key'} ar={loadState === 'ready' ? 'الواجهة تعمل' : 'يتطلب مفتاح مستأجر'} />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <div className="page-heading">
            <div>
              <h1 className="rt-h1">
                <Bi en="Workspace " ar="إعدادات " />
                <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
                  <Bi en="settings." ar="مساحة العمل." />
                </em>
              </h1>
              <div className="rt-h1-sub">
                <span>
                  <Bi en={displayName} ar={displayName} />
                </span>
                <span>
                  <Bi en="Owner " ar="المالك " />
                  <b>{renter?.name || 'Renter'}</b>
                </span>
                <span>
                  <b>{numFmt.format(totalJobs)}</b> <Bi en="jobs recorded" ar="مهام مسجلة" />
                </span>
              </div>
            </div>
            <button
              className="btn-sec"
              type="button"
              onClick={handleExport}
              disabled={!canUseSettings || exportState === 'working' || exportState === 'limited'}
            >
              {exportState === 'working' ? (
                <Bi en="Preparing export..." ar="جاري تجهيز التصدير..." />
              ) : exportState === 'limited' ? (
                <Bi en="Export available in 24h" ar="التصدير متاح خلال 24 ساعة" />
              ) : exportState === 'error' ? (
                <Bi en="Export failed — retry" ar="فشل التصدير — أعد المحاولة" />
              ) : (
                <>
                  ↓ <Bi en="Export account data" ar="تصدير بيانات الحساب" />
                </>
              )}
            </button>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or paste a renter API key before v2 can show account settings."
                  ar="سجل الدخول أو أدخل مفتاح مستأجر قبل أن تعرض v2 إعدادات الحساب."
                />
              </span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state error" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Settings unavailable" ar="الإعدادات غير متاحة" />
              </b>
              <span>{error}</span>
            </div>
          )}

          <div className="settings-grid" style={{ marginTop: 36 }}>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Account" ar="الحساب" />
                  </h3>
                </div>
              </div>
              <div className="facts">
                <Fact label="Name" value={renter?.name || '—'} />
                <Fact label="Email" value={renter?.email || '—'} />
                <Fact label="Organization" value={renter?.organization || '—'} />
                <Fact label="Phone" value={renter?.phone || '—'} />
                <Fact label="Use case" value={renter?.use_case || '—'} />
                <Fact label="Created" value={fmtDate(renter?.created_at)} />
              </div>
              <div className="dash-state compact">
                <b>
                  <Bi en="Profile edits are read-only for launch" ar="تعديل الملف للقراءة فقط عند الإطلاق" />
                </b>
                <span>
                  <Bi
                    en="Company, CR, VAT, and billing-address edits will stay locked until the billing profile workflow is ready."
                    ar="ستبقى تعديلات الشركة والسجل التجاري والضريبة وعنوان الفوترة مقفلة حتى تصبح آلية ملف الفوترة جاهزة."
                  />
                </span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Wallet summary" ar="ملخص المحفظة" />
                  </h3>
                </div>
              </div>
              <div className="facts">
                <Fact label="Balance" value={`SAR ${fmtSar(balanceSar)}`} />
                <Fact label="Held" value={`SAR ${fmtSar(heldSar)}`} />
                <Fact label="Lifetime spend" value={`SAR ${fmtSar(totalSpentSar)}`} />
                <Fact label="Total jobs" value={numFmt.format(totalJobs)} />
              </div>
              <Link className="btn-pri inline-action" href="/renter/wallet">
                <Bi en="Open wallet" ar="فتح المحفظة" />
              </Link>
            </div>
          </div>

          <form className="panel" style={{ marginTop: 28 }} onSubmit={saveBudget}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Monthly spend cap" ar="حد الإنفاق الشهري" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Cap (SAR / month)" ar="الحد (ريال / شهر)" />
                </b>
                <Bi en="Blocks inference once this calendar month's spend is reached" ar="يوقف الاستدلال عند بلوغ إنفاق هذا الشهر الميلادي" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={spendCap}
                  disabled={!canUseSettings}
                  placeholder="0"
                  onChange={(e) => setSpendCap(e.target.value)}
                />
                <span className="hint">
                  <Bi en="Leave blank or 0 for unlimited. Independent of your balance." ar="اتركه فارغًا أو 0 لإزالة الحد. مستقل عن رصيدك." />
                </span>
              </div>
            </div>
            <div className="action-row">
              <button className="btn-pri" type="submit" disabled={!canUseSettings || capState === 'submitting'}>
                {capState === 'submitting' ? <Bi en="Saving..." ar="جاري الحفظ..." /> : <Bi en="Save spend cap" ar="حفظ حد الإنفاق" />}
              </button>
              {capState === 'success' && (
                <span className="hint success-text">
                  <Bi en="Saved" ar="تم الحفظ" />
                </span>
              )}
              {capState === 'error' && <span className="hint error-text">{error}</span>}
            </div>
          </form>

          <form className="panel" style={{ marginTop: 28 }} onSubmit={saveWebhook}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Webhook" ar="الويب هوك" />
                </h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Delivery URL" ar="رابط الاستلام" />
                </b>
                <Bi en="HTTPS public URL for job lifecycle events" ar="رابط HTTPS عام لأحداث دورة حياة المهام" />
              </div>
              <div className="ctl">
                <input
                  className="input"
                  type="url"
                  value={webhookUrl}
                  disabled={!canUseSettings}
                  placeholder="https://example.com/dcp-webhook"
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <span className="hint">
                  <Bi en="Clear the field and save to remove the webhook." ar="امسح الحقل واحفظ لإزالة الويب هوك." />
                </span>
              </div>
            </div>
            <div className="action-row">
              <button className="btn-pri" type="submit" disabled={!canUseSettings || saveState === 'submitting'}>
                {saveState === 'submitting' ? <Bi en="Saving..." ar="جاري الحفظ..." /> : <Bi en="Save webhook" ar="حفظ الويب هوك" />}
              </button>
              {saveState === 'success' && (
                <span className="hint success-text">
                  <Bi en="Saved" ar="تم الحفظ" />
                </span>
              )}
              {saveState === 'error' && <span className="hint error-text">{error}</span>}
            </div>
          </form>

          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Notifications" ar="الإشعارات" />
                </h3>
              </div>
              <button className="btn-sec" type="button" onClick={markAllNotificationsRead} disabled={!canUseSettings || unreadCount === 0 || readAllState === 'submitting'}>
                <Bi en="Mark all read" ar="تعليم الكل كمقروء" />
              </button>
            </div>
            <div className="notification-summary">
              <span>
                <b>{numFmt.format(notificationTotal)}</b> <Bi en="total" ar="الإجمالي" />
              </span>
              <span>
                <b>{numFmt.format(unreadCount)}</b> <Bi en="unread" ar="غير مقروءة" />
              </span>
            </div>
            <table className="tbl members-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Notification" ar="الإشعار" />
                  </th>
                  <th>
                    <Bi en="Job" ar="المهمة" />
                  </th>
                  <th>
                    <Bi en="Created" ar="الإنشاء" />
                  </th>
                  <th>
                    <Bi en="State" ar="الحالة" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={4}>
                      <Bi en="No renter notifications have been recorded yet." ar="لم يتم تسجيل إشعارات لهذا المستأجر بعد." />
                    </td>
                  </tr>
                ) : (
                  notifications.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="mono">{notificationLabel(item)}</span>
                      </td>
                      <td>
                        <span className="mono">{item.job_id || '—'}</span>
                      </td>
                      <td>
                        <span className="mut">{fmtDate(item.created_at)}</span>
                      </td>
                      <td>
                        <span className={`stat ${item.read_at ? 'settled' : 'queued'}`}>{item.read_at ? 'read' : 'unread'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginTop: 28 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Team and controls" ar="الفريق والتحكم" />
                </h3>
              </div>
            </div>
            <div className="unavailable-grid">
              <div className="dash-state compact">
                <b>
                  <Bi en="Team members" ar="أعضاء الفريق" />
                </b>
                <span>
                  <Bi
                    en="Team management stays read-only until invitations and roles are ready. API keys remain the launch access-control surface."
                    ar="تبقى إدارة الفريق للقراءة فقط حتى تصبح الدعوات والأدوار جاهزة. مفاتيح API تبقى سطح التحكم عند الإطلاق."
                  />
                </span>
              </div>
              <div className="dash-state compact">
                <b>
                  <Bi en="Notification preferences" ar="تفضيلات الإشعارات" />
                </b>
                <span>
                  <Bi
                    en="You can review and clear notifications here. Spend-threshold preferences stay locked until the preference workflow is ready."
                    ar="يمكنك مراجعة الإشعارات وتصفيرها هنا. تفضيلات حدود الإنفاق تبقى مقفلة حتى تصبح آلية التفضيلات جاهزة."
                  />
                </span>
              </div>
              <div className="dash-state compact">
                <b>
                  <Bi en="Account deletion" ar="حذف الحساب" />
                </b>
                <span>
                  <Bi
                    en="Schedules your account for deletion in 30 days (PDPL right to erasure). Active jobs are cancelled and the account is anonymized."
                    ar="يجدول حسابك للحذف خلال 30 يومًا (حق المحو وفق نظام حماية البيانات). تُلغى المهام النشطة ويُجهّل الحساب."
                  />
                </span>
                {deleteState === 'success' ? (
                  <span className="hint success-text" style={{ marginTop: 12 }}>
                    {deleteMessage}
                  </span>
                ) : confirmDelete ? (
                  <div className="action-row" style={{ marginTop: 12 }}>
                    <button
                      className="btn-sec danger"
                      type="button"
                      onClick={deleteAccount}
                      disabled={!canUseSettings || deleteState === 'submitting'}
                    >
                      {deleteState === 'submitting' ? (
                        <Bi en="Deleting..." ar="جاري الحذف..." />
                      ) : (
                        <Bi en="Confirm delete" ar="تأكيد الحذف" />
                      )}
                    </button>
                    <button
                      className="btn-sec"
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleteState === 'submitting'}
                    >
                      <Bi en="Cancel" ar="إلغاء" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-sec danger"
                    type="button"
                    style={{ marginTop: 12, alignSelf: 'flex-start' }}
                    onClick={() => setConfirmDelete(true)}
                    disabled={!canUseSettings}
                  >
                    <Bi en="Delete account" ar="حذف الحساب" />
                  </button>
                )}
                {deleteState === 'error' && <span className="hint error-text" style={{ marginTop: 8 }}>{error}</span>}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
