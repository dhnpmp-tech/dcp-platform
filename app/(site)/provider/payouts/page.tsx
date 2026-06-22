'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './payouts.css'

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
      { k: 'dash', ic: '⌂', label: 'Dashboard', labelAr: 'لوحة التحكم', href: '/provider/dashboard' },
      { k: 'rigs', ic: '☷', label: 'Rigs', labelAr: 'الأجهزة', href: '/provider/rigs' },
      { k: 'earnings', ic: '△', label: 'Earnings', labelAr: 'الأرباح', href: '/provider/earnings' },
      { k: 'payouts', ic: '₪', label: 'Payouts', labelAr: 'المدفوعات', href: '/provider/payouts', bd: 'SAR' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'profile', ic: '✦', label: 'Profile', labelAr: 'الملف', href: '/provider/profile' },
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/provider/settings' },
      { k: 'docs', ic: '?', label: 'Provider docs', labelAr: 'دليل المزوّد', href: '/docs', bd: '↗' },
    ],
  },
]

const CURRENT = 'payouts'
const HALALA_PER_SAR = 100
const MIN_WITHDRAWAL_HALALA = 1000

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface Payout {
  id: string
  period: string
  mode: string
  sar: number
  status: string
  statClass: 'accruing' | 'paid'
  date: string
}

interface ProviderEarnings {
  total_earned_sar?: number
  available_sar?: number
  pending_withdrawal_sar?: number
  withdrawn_sar?: number
  claimable_earnings_halala?: number
}

interface ProviderMe {
  name?: string
  email?: string
  status?: string
  payout_iban?: string | null
  payout_holder_name?: string | null
  payout_account_registered_at?: string | null
  today_earnings_halala?: number
  week_earnings_halala?: number
  month_earnings_halala?: number
  total_earnings_halala?: number
  claimable_earnings_halala?: number
  total_jobs?: number
}

interface ProviderMeResponse {
  provider?: ProviderMe
}

interface Withdrawal {
  id: string | number
  amount_halala: number
  status: string
  iban?: string | null
  created_at: string
  processed_at?: string | null
}

const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

function halalaToSar(halala: number | undefined): number | null {
  return typeof halala === 'number' ? halala / HALALA_PER_SAR : null
}

function fmtSar(sar: number | null | undefined, precise = true): string {
  if (typeof sar !== 'number' || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function compactStatus(status: string | undefined): string {
  return status || 'pending'
}

function statusClass(status: string): 'accruing' | 'paid' {
  return status === 'paid' || status === 'completed' ? 'paid' : 'accruing'
}

function maskIban(iban: string | null | undefined): string {
  const clean = (iban || '').replace(/\s+/g, '')
  const tail = clean.slice(-4)
  return tail ? `IBAN ••${tail}` : 'No payout IBAN on file'
}

function fullIbanForApi(iban: string | null): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase()
}

function withdrawalToPayout(w: Withdrawal): Payout {
  const status = compactStatus(w.status)
  return {
    id: String(w.id),
    period: fmtDate(w.created_at),
    mode: maskIban(w.iban),
    sar: Number(w.amount_halala || 0) / HALALA_PER_SAR,
    status,
    statClass: statusClass(status),
    date: statusClass(status) === 'paid' ? fmtDate(w.processed_at) : '—',
  }
}

export default function PayoutsPage() {
  const { lang, toggle } = useV2()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [providerName, setProviderName] = useState('')
  const [providerEmail, setProviderEmail] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [payoutIban, setPayoutIban] = useState<string | null>(null)
  const [payoutHolder, setPayoutHolder] = useState('')
  const [payoutRegisteredAt, setPayoutRegisteredAt] = useState<string | null>(null)
  const [todaySar, setTodaySar] = useState<number | null>(null)
  const [weekSar, setWeekSar] = useState<number | null>(null)
  const [monthSar, setMonthSar] = useState<number | null>(null)
  const [lifetimeSar, setLifetimeSar] = useState<number | null>(null)
  const [availableSar, setAvailableSar] = useState<number | null>(null)
  const [pendingSar, setPendingSar] = useState<number | null>(null)
  const [withdrawnSar, setWithdrawnSar] = useState<number | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [requestState, setRequestState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState('')
  const [killState, setKillState] = useState<'idle' | 'pausing'>('idle')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }

    let cancelled = false
    const base = getApiBase()
    const headers = { 'x-provider-key': key }
    setLoadState('loading')
    setLoadError('')

    ;(async () => {
      try {
        const [meRes, earningsRes, withdrawalsRes] = await Promise.all([
          fetch(`${base}/providers/me?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/providers/earnings?key=${encodeURIComponent(key)}`, { headers }),
          fetch(`${base}/providers/me/withdrawals?key=${encodeURIComponent(key)}`, { headers }),
        ])
        if (cancelled) return

        const meData = (await meRes.json().catch(() => ({}))) as ProviderMeResponse & { error?: string }
        if (!meRes.ok) throw new Error(meData.error || 'Failed to load provider payout account.')

        const provider = meData.provider || {}
        setProviderName(provider.name || '')
        setProviderEmail(provider.email || '')
        setProviderStatus(provider.status || '')
        setPayoutIban(provider.payout_iban || null)
        setPayoutHolder(provider.payout_holder_name || '')
        setPayoutRegisteredAt(provider.payout_account_registered_at || null)
        setTodaySar(halalaToSar(provider.today_earnings_halala))
        setWeekSar(halalaToSar(provider.week_earnings_halala))
        setMonthSar(halalaToSar(provider.month_earnings_halala))
        setLifetimeSar(halalaToSar(provider.total_earnings_halala))
        setAvailableSar(halalaToSar(provider.claimable_earnings_halala))

        if (earningsRes.ok) {
          const data = (await earningsRes.json()) as ProviderEarnings
          if (!cancelled) {
            setAvailableSar(typeof data.available_sar === 'number' ? data.available_sar : halalaToSar(data.claimable_earnings_halala))
            setPendingSar(typeof data.pending_withdrawal_sar === 'number' ? data.pending_withdrawal_sar : null)
            setWithdrawnSar(typeof data.withdrawn_sar === 'number' ? data.withdrawn_sar : null)
            setLifetimeSar(typeof data.total_earned_sar === 'number' ? data.total_earned_sar : halalaToSar(provider.total_earnings_halala))
          }
        }

        if (withdrawalsRes.ok) {
          const data = (await withdrawalsRes.json()) as { withdrawals?: Withdrawal[] }
          if (!cancelled) setPayouts((data.withdrawals || []).map(withdrawalToPayout))
        } else {
          setPayouts([])
        }

        if (!cancelled) setLoadState('ready')
      } catch (err) {
        if (!cancelled) {
          setLoadState('error')
          setLoadError(err instanceof Error ? err.message : 'Failed to load provider payout account.')
          setPayouts([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function requestWithdrawal() {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    const iban = fullIbanForApi(payoutIban)
    const amount = Math.round((availableSar || 0) * HALALA_PER_SAR)
    if (!key || amount < MIN_WITHDRAWAL_HALALA || !iban) return

    setRequestState('submitting')
    setRequestMessage('')
    try {
      const res = await fetch(`${getApiBase()}/providers/me/withdraw?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': key },
        body: JSON.stringify({ amount_halala: amount, iban }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to request withdrawal.')
      const withdrawal = data.withdrawal_request as Withdrawal | undefined
      if (withdrawal) setPayouts((rows) => [withdrawalToPayout(withdrawal), ...rows])
      setPendingSar((pendingSar || 0) + amount / HALALA_PER_SAR)
      setAvailableSar(Math.max(0, (availableSar || 0) - amount / HALALA_PER_SAR))
      setRequestState('success')
      setRequestMessage(data.message || 'Withdrawal request queued for review.')
    } catch (err) {
      setRequestState('error')
      setRequestMessage(err instanceof Error ? err.message : 'Failed to request withdrawal.')
    }
  }

  async function killSwitch() {
    if (typeof window === 'undefined') return
    const key = getProviderKey()
    if (!key || killState === 'pausing') return
    const confirmMsg =
      lang === 'ar'
        ? 'إيقاف كل الأجهزة فورًا؟ ستتوقف عن استقبال المهام حتى تستأنف يدويًا.'
        : 'Pause all rigs now? They stop accepting jobs until you resume manually.'
    if (!window.confirm(confirmMsg)) return
    setKillState('pausing')
    try {
      const res = await fetch(`${getApiBase()}/providers/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': key },
        body: JSON.stringify({ key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to pause rigs.')
      setProviderStatus(data.status || 'paused')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to pause rigs.')
    } finally {
      setKillState('idle')
    }
  }

  const displayName = providerName || (lang === 'ar' ? 'المزوّد' : 'Provider')
  const displayScope = providerEmail || providerStatus || (lang === 'ar' ? 'حساب المزوّد' : 'Provider account')
  const statusLabel = providerStatus || (loadState === 'missing-key' ? 'missing key' : loadState)
  const canWithdraw = Boolean(payoutIban && availableSar != null && availableSar * HALALA_PER_SAR >= MIN_WITHDRAWAL_HALALA)
  const maskedIban = maskIban(payoutIban)

  return (
    <div className="pv-app">
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
            {todaySar != null ? (
              <>
                SAR {fmtSar(todaySar, false)}
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
            <b>{weekSar != null ? `SAR ${fmtSar(weekSar, false)}` : '—'}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="This month" ar="هذا الشهر" />
            </span>
            <b>{monthSar != null ? `SAR ${fmtSar(monthSar, false)}` : '—'}</b>
          </div>
        </div>

        <nav className="pv-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => (
                <Link key={it.k} href={it.href} className={it.k === CURRENT ? 'on' : undefined} aria-current={it.k === CURRENT ? 'page' : undefined} target={it.href === '/docs' ? '_blank' : undefined} rel={it.href === '/docs' ? 'noopener noreferrer' : undefined}>
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
          <div className="av">{displayName.charAt(0).toUpperCase() || 'P'}</div>
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
            onClick={() => {
              localStorage.removeItem('dc1_provider_key')
              window.location.href = '/auth'
            }}
          >
            ↱
          </span>
        </div>
      </aside>

      <div className={`pv-backdrop${drawerOpen ? ' on' : ''}`} onClick={() => setDrawerOpen(false)} />

      <div>
        <header className="pv-tb" data-crumb="Payouts">
          <button className="mb-toggle" aria-label="Menu" onClick={() => setDrawerOpen((v) => !v)}>
            ☰
          </button>
          <div className="crumb">
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Payouts" ar="المدفوعات" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> {statusLabel}
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button className="kill" title="Pause all rigs" onClick={killSwitch} disabled={killState === 'pausing'}>
            ◉ {killState === 'pausing' ? <Bi en="Pausing…" ar="جارٍ الإيقاف…" /> : <Bi en="Kill switch" ar="إيقاف الكل" />}
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
              <Bi en="Claimable balance · withdrawal requests · payout account" ar="الرصيد القابل للسحب · طلبات السحب · حساب الصرف" />
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi en="Sign in with a provider API key to load payout data." ar="سجّل الدخول بمفتاح مزوّد لتحميل بيانات المدفوعات." />{' '}
              <Link href="/auth?role=provider&method=apikey&redirect=/provider/payouts">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {loadState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {loadError}
            </div>
          )}

          <div className="balance-card" style={{ marginTop: '36px' }}>
            <div className="balance-grid">
              <div>
                <div className="k">
                  <Bi en="Available balance · ready to request" ar="الرصيد المتاح · جاهز للطلب" />
                </div>
                <div className="v">{availableSar != null ? `SAR ${fmtSar(availableSar)}` : '—'}</div>
                <div className="d">
                  <Bi en="Lifetime earnings " ar="إجمالي الأرباح " />
                  <b>{lifetimeSar != null ? `SAR ${fmtSar(lifetimeSar, false)}` : '—'}</b>
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Pending withdrawal" ar="سحب قيد المراجعة" />
                </div>
                <div className="v small">{pendingSar != null ? `SAR ${fmtSar(pendingSar)}` : '—'}</div>
                <div className="d">
                  <Bi en="Queued requests stay visible below" ar="طلبات الانتظار تظهر أدناه" />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Withdrawn" ar="تم سحبه" />
                </div>
                <div className="v small">{withdrawnSar != null ? `SAR ${fmtSar(withdrawnSar)}` : '—'}</div>
                <div className="d">
                  <Bi en="Settled payout requests" ar="طلبات صرف تمت تسويتها" />
                </div>
              </div>
            </div>
          </div>

          <div className="alert">
            <div className="t">
              <b>
                <Bi en="Request withdrawal" ar="اطلب السحب" />
              </b>{' '}
              {canWithdraw ? (
                <Bi en="— create a pending withdrawal request for the full available balance." ar="— أنشئ طلب سحب معلقًا لكامل الرصيد المتاح." />
              ) : (
                <Bi en="— connect a payout IBAN and keep at least SAR 10 claimable before requesting a withdrawal." ar="— اربط آيبان الصرف واحتفظ بما لا يقل عن 10 ر.س قابلة للسحب قبل طلب السحب." />
              )}
              <span className="sub">
                <Bi en="Admin review keeps payouts auditable before money moves." ar="مراجعة الإدارة تجعل المدفوعات قابلة للتدقيق قبل انتقال الأموال." />
              </span>
            </div>
            <button onClick={requestWithdrawal} disabled={!canWithdraw || requestState === 'submitting'}>
              {requestState === 'submitting' ? (
                <Bi en="Submitting..." ar="جارٍ الإرسال..." />
              ) : availableSar != null ? (
                <Bi en={`Request SAR ${fmtSar(availableSar)}`} ar={`اطلب ${fmtSar(availableSar)} ر.س`} />
              ) : (
                <Bi en="Request withdrawal" ar="طلب السحب" />
              )}
            </button>
          </div>
          {requestMessage && (
            <div className={`dash-state${requestState === 'error' ? ' err' : ''}`} style={{ marginTop: '12px' }}>
              {requestMessage}
            </div>
          )}

          <div className="panel" style={{ marginTop: '36px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout account" ar="حساب الصرف" />
                </h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: '6px' }}>
                  <Bi en="Bank transfer · Saudi Riyal" ar="تحويل بنكي · ريال سعودي" />
                </div>
              </div>
            </div>

            {payoutIban ? (
              <div className="bank-row">
                <div className="logo">SAR</div>
                <div>
                  <div className="nm">
                    <Bi en="Payout account" ar="حساب الصرف" />{' '}
                    <span className="verified">
                      <Bi en="IBAN on file (unverified)" ar="آيبان محفوظ (غير مُتحقَّق)" />
                    </span>
                  </div>
                  <div className="acc">{maskedIban}</div>
                  <div className="holder">{payoutHolder || <Bi en="Account holder pending provider profile" ar="اسم صاحب الحساب ينتظر ملف المزوّد" />}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--mut)', textAlign: 'end' }}>
                  <Bi en="Registered" ar="مسجل" />
                  <br />
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{fmtDate(payoutRegisteredAt)}</b>
                </div>
              </div>
            ) : (
              <span className="empty-row">
                <Bi en="No payout account on file. Add one in the provider profile before requesting withdrawals." ar="لا يوجد حساب صرف محفوظ. أضف حسابًا في ملف المزوّد قبل طلب السحب." />
              </span>
            )}
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout controls" ar="إعدادات الصرف" />
                </h3>
              </div>
            </div>
            <div className="method-grid">
              <div className={`method${payoutIban ? ' on' : ''}`}>
                <div className="nm">
                  <Bi en="Manual withdrawal requests" ar="طلبات السحب اليدوية" />
                </div>
                <div className="desc">
                  <Bi
                    en="Providers request a withdrawal when claimable earnings are available. The request is reviewed in the admin queue before payout processing."
                    ar="يطلب المزوّد السحب عندما تكون الأرباح القابلة للسحب متاحة. تتم مراجعة الطلب في قائمة الإدارة قبل معالجة الدفع."
                  />
                </div>
                <div className="meta">
                  <span>{payoutIban ? maskedIban : <Bi en="IBAN required" ar="الآيبان مطلوب" />}</span>
                  <b>{canWithdraw ? <Bi en="Ready" ar="جاهز" /> : <Bi en="Waiting" ar="بانتظار" />}</b>
                </div>
              </div>
              <div className="method locked">
                <div className="nm">
                  <Bi en="Automatic schedule" ar="الجدولة التلقائية" />
                </div>
                <div className="desc">
                  <Bi
                    en="Automatic payout preferences need a backend preference endpoint before launch. Until then, this surface stays manual and auditable."
                    ar="تحتاج تفضيلات الصرف التلقائي إلى نقطة backend قبل الإطلاق. حتى ذلك الحين تبقى هذه الواجهة يدوية وقابلة للتدقيق."
                  />
                </div>
                <div className="meta">
                  <span>
                    <Bi en="Not enabled" ar="غير مفعّل" />
                  </span>
                  <b>
                    <Bi en="Manual" ar="يدوي" />
                  </b>
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Payout history" ar="سجل المدفوعات" />
                </h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: '6px' }}>
                  <Bi en="Provider withdrawal requests" ar="طلبات سحب المزوّد" />
                </div>
              </div>
              <Link href="/provider/earnings" style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink)', borderBottom: '1px solid var(--ink)', paddingBottom: '2px' }}>
                <Bi en="View earnings →" ar="عرض الأرباح ←" />
              </Link>
            </div>
            <table className="payouts-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Requested" ar="تاريخ الطلب" />
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
                </tr>
              </thead>
              <tbody>
                {payouts.length > 0 ? (
                  payouts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="period">{p.period}</span>
                      </td>
                      <td>
                        <span className="mode">{p.mode}</span>
                      </td>
                      <td>
                        <span className="amount">
                          {fmtSar(p.sar)}
                          <span className="u">SAR</span>
                        </span>
                      </td>
                      <td>
                        <span className={`stat ${p.statClass}`}>{p.status}</span>
                      </td>
                      <td>
                        <span className="when">{p.date}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <span className="empty-row">
                        <Bi en="No withdrawal requests yet." ar="لا توجد طلبات سحب بعد." />
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' }}>
            <div className="panel">
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '8px' }}>
                <Bi en="How earnings settle" ar="كيف تُسوّى الأرباح" />
              </div>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
                <Bi
                  en="Completed jobs credit claimable earnings in halala precision. Withdrawal requests stay pending until admin review, so payout state remains auditable."
                  ar="المهام المكتملة تضيف أرباحًا قابلة للسحب بدقة الهللة. تبقى طلبات السحب معلقة حتى مراجعة الإدارة، لذلك تبقى حالة الصرف قابلة للتدقيق."
                />
              </p>
            </div>
            <div className="panel">
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: '8px' }}>
                <Bi en="Revenue share" ar="حصة الإيرادات" />
              </div>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.65 }}>
                <Bi
                  en="The backend settlement path stores the provider-earned amount per job. This page shows the already-netted balance rather than calculating a tier split in the browser."
                  ar="يحفظ مسار التسوية في backend مبلغ المزوّد لكل مهمة. تعرض هذه الصفحة الرصيد الصافي بالفعل بدل حساب تقسيم الفئات في المتصفح."
                />
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
