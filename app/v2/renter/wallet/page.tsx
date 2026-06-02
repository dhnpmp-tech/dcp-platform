'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './wallet.css'

const HALALA_PER_SAR = 100

const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys' },
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

const CURRENT_PAGE = 'wallet'

const TOPUP_METHODS = [
  {
    code: 'creditcard',
    nm: 'Credit card',
    nmAr: 'بطاقة ائتمان',
    desc: 'Starts a Moyasar card payment and credits the wallet after webhook confirmation.',
    descAr: 'تبدأ دفعة بطاقة عبر ميسر ويضاف الرصيد بعد تأكيد الويب هوك.',
  },
  {
    code: 'applepay',
    nm: 'Apple Pay',
    nmAr: 'Apple Pay',
    desc: 'Starts a Moyasar Apple Pay payment using the same live top-up contract.',
    descAr: 'تبدأ دفعة Apple Pay عبر نفس عقد الشحن الحي.',
  },
  {
    code: 'bank_transfer',
    nm: 'Bank transfer',
    nmAr: 'تحويل بنكي',
    desc: 'Returns the configured DCP bank-transfer instructions with a unique reference.',
    descAr: 'يعرض تعليمات التحويل البنكي المهيأة مع مرجع فريد.',
  },
] as const

const AMOUNTS = [100, 500, 2000, 5000]

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'
type SaveState = 'idle' | 'submitting' | 'success' | 'error'

interface RenterAccount {
  name?: string
  email?: string
  organization?: string
  balance_halala?: number
  total_spent_halala?: number
  total_jobs?: number
  created_at?: string
}

interface RenterMeResponse {
  renter?: RenterAccount
  recent_jobs?: Array<{ id?: string; job_id?: string; model?: string; actual_cost_halala?: number; status?: string; created_at?: string }>
  v1_usage_summary?: { total_cost_halala?: number }
}

interface RenterBalanceResponse {
  balance_halala?: number
  balance_sar?: number
  held_halala?: number
  held_sar?: number
  available_halala?: number
  available_sar?: number
  total_spent_halala?: number
  total_spent_sar?: number
  total_jobs?: number
}

interface RenterPayment {
  id?: string
  payment_id?: string
  amount_halala?: number
  amount_sar?: number
  status?: string
  source_type?: string
  payment_method?: string
  description?: string
  created_at?: string
  moyasar_id?: string | null
}

interface RenterPaymentsResponse {
  payments?: RenterPayment[]
}

interface AutoTopupSettings {
  enabled?: boolean
  threshold_halala?: number
  threshold_sar?: number
  amount_halala?: number
  amount_sar?: number
  monthly_cap_halala?: number
  monthly_cap_sar?: number
  monthly_used_halala?: number
  monthly_used_sar?: number
  paused_until?: string | null
  consecutive_failures?: number
  last_attempt_at?: string | null
  card_on_file?: { brand?: string | null; last4?: string | null; saved_at?: string | null } | null
}

interface TopupResult {
  status?: string
  payment_url?: string | null
  payment_id?: string
  topup_id?: string
  payment_method?: string
  amount_sar?: number
  instructions?: {
    bank_name?: string
    account_name?: string
    iban?: string
    reference?: string
    step1?: string
    step2?: string
    step3?: string
  }
}

const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function halalaToSar(halala: number | null | undefined): number {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : 0
}

function fmtSar(sar: number | null | undefined, precise = true): string {
  if (typeof sar !== 'number' || Number.isNaN(sar)) return '—'
  return precise ? sarFmt.format(sar) : wholeFmt.format(sar)
}

function amountFromPayment(p: RenterPayment): number {
  if (typeof p.amount_sar === 'number') return p.amount_sar
  return halalaToSar(p.amount_halala)
}

function relTime(iso?: string): { en: string; ar: string } {
  if (!iso) return { en: '—', ar: '—' }
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return { en: '—', ar: '—' }
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  const wks = Math.floor(days / 7)
  if (wks >= 1) return { en: `${wks}w ago`, ar: `قبل ${wks} أ` }
  if (days >= 1) return { en: `${days}d ago`, ar: `قبل ${days} ي` }
  if (hrs >= 1) return { en: `${hrs}h ago`, ar: `قبل ${hrs} س` }
  if (mins >= 1) return { en: `${mins}m ago`, ar: `قبل ${mins} د` }
  return { en: 'just now', ar: 'الآن' }
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

export default function RenterWalletPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [methodIdx, setMethodIdx] = useState(0)
  const [amountSar, setAmountSar] = useState(500)
  const [customAmount, setCustomAmount] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [autoSaveState, setAutoSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalanceResponse | null>(null)
  const [payments, setPayments] = useState<RenterPayment[]>([])
  const [autoTopup, setAutoTopup] = useState<AutoTopupSettings | null>(null)
  const [topupResult, setTopupResult] = useState<TopupResult | null>(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoThresholdSar, setAutoThresholdSar] = useState(0)
  const [autoAmountSar, setAutoAmountSar] = useState(0)
  const [autoCapSar, setAutoCapSar] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    const renterKey = key

    const base = getApiBase()
    const headers = { 'x-renter-key': renterKey }
    let cancelled = false

    async function loadWallet() {
      try {
        setLoadState('loading')
        const encodedKey = encodeURIComponent(renterKey)
        const [me, balanceData, paymentData, autoData] = await Promise.all([
          readJson<RenterMeResponse>(`${base}/renters/me?key=${encodedKey}`, headers),
          readJson<RenterBalanceResponse>(`${base}/renters/balance?key=${encodedKey}`, headers, true),
          readJson<RenterPaymentsResponse>(`${base}/renters/me/payments?key=${encodedKey}`, headers, true),
          readJson<AutoTopupSettings>(`${base}/payments/auto-topup-settings`, headers, true),
        ])
        if (cancelled) return
        const auto = autoData || null
        setRenter(me?.renter || null)
        setBalance(balanceData || null)
        setPayments(paymentData?.payments || [])
        setAutoTopup(auto)
        setAutoEnabled(!!auto?.enabled)
        setAutoThresholdSar(typeof auto?.threshold_sar === 'number' ? auto.threshold_sar : halalaToSar(auto?.threshold_halala))
        setAutoAmountSar(typeof auto?.amount_sar === 'number' ? auto.amount_sar : halalaToSar(auto?.amount_halala))
        setAutoCapSar(typeof auto?.monthly_cap_sar === 'number' ? auto.monthly_cap_sar : halalaToSar(auto?.monthly_cap_halala))
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Wallet data could not be loaded')
        setLoadState('error')
      }
    }

    loadWallet()
    return () => {
      cancelled = true
    }
  }, [])

  const displayName = renter?.organization || renter?.name || renter?.email || 'DCP renter'
  const displayEmail = renter?.email || 'API key not loaded'
  const displaySub = renter?.organization && renter?.name ? `${renter.name} · renter account` : 'Renter account'
  const availableSar =
    typeof balance?.available_sar === 'number'
      ? balance.available_sar
      : typeof balance?.balance_sar === 'number'
        ? balance.balance_sar
        : typeof renter?.balance_halala === 'number'
          ? halalaToSar(renter.balance_halala)
          : halalaToSar(balance?.available_halala ?? balance?.balance_halala)
  const heldSar = typeof balance?.held_sar === 'number' ? balance.held_sar : halalaToSar(balance?.held_halala)
  const totalSpentSar =
    typeof balance?.total_spent_sar === 'number'
      ? balance.total_spent_sar
      : typeof balance?.total_spent_halala === 'number'
        ? halalaToSar(balance.total_spent_halala)
        : halalaToSar(renter?.total_spent_halala)
  const totalJobs = balance?.total_jobs ?? renter?.total_jobs ?? 0
  const selectedMethod = TOPUP_METHODS[methodIdx]
  const canUseWallet = loadState === 'ready'
  const topupAmount = customAmount.trim() ? Number(customAmount) : amountSar
  const canSubmitTopup = canUseWallet && Number.isFinite(topupAmount) && topupAmount >= 1 && topupAmount <= 10000
  const canSaveAutoTopup = canUseWallet && !!autoTopup?.card_on_file

  const balanceParts = useMemo(() => {
    const [whole, frac = '00'] = fmtSar(availableSar).split('.')
    return { whole, frac }
  }, [availableSar])

  async function submitTopup(event: FormEvent) {
    event.preventDefault()
    const key = getRenterKey()
    if (!key || !canSubmitTopup) return
    setSaveState('submitting')
    setTopupResult(null)
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/payments/topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `v2-wallet-${Date.now()}`,
          'x-renter-key': key,
        },
        body: JSON.stringify({
          amount_halala: Math.round(topupAmount * HALALA_PER_SAR),
          payment_method: selectedMethod.code,
          callback_url: `${window.location.origin}/payment/auto-topup-callback`,
        }),
      })
      const data = (await res.json()) as TopupResult & { error?: string; message?: string }
      if (!res.ok) throw new Error(data.message || data.error || `Top-up failed: ${res.status}`)
      setTopupResult(data)
      setSaveState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up could not be started')
      setSaveState('error')
    }
  }

  async function saveAutoTopup(event: FormEvent) {
    event.preventDefault()
    const key = getRenterKey()
    if (!key || !canSaveAutoTopup) return
    setAutoSaveState('submitting')
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/payments/auto-topup-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': key,
        },
        body: JSON.stringify({
          enabled: autoEnabled,
          threshold_sar: autoThresholdSar,
          amount_sar: autoAmountSar,
          monthly_cap_sar: autoCapSar,
        }),
      })
      const data = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) throw new Error(data.message || data.error || `Auto top-up save failed: ${res.status}`)
      setAutoSaveState('success')
      setAutoTopup((prev) => ({
        ...(prev || {}),
        enabled: autoEnabled,
        threshold_sar: autoThresholdSar,
        amount_sar: autoAmountSar,
        monthly_cap_sar: autoCapSar,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto top-up settings could not be saved')
      setAutoSaveState('error')
    }
  }

  return (
    <div className="rt-app">
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="wallet">
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <button className="rt-ws-btn" title="Current renter account" type="button">
            <span className="av">{initials(displayName, displayEmail)}</span>
            <span className="body">
              <span className="nm">{displayName}</span>
              <span className="sub">{displaySub}</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {balanceParts.whole}
            <span className="u">.{balanceParts.frac}</span>
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
          <a className="topup" href="#top-up">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </a>
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
          <div className="av">{initials(renter?.name, renter?.email)}</div>
          <div className="who">
            {renter?.name || 'Renter'}
            <span className="e">{displayEmail}</span>
          </div>
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <header className="rt-tb" id="rt-tb" data-crumb="Wallet">
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
            <span>{displayName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Wallet" ar="المحفظة" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en={loadState === 'ready' ? 'API live' : 'Needs renter key'} ar={loadState === 'ready' ? 'الواجهة تعمل' : 'يتطلب مفتاح مستأجر'} />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="/v2/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="Your " ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="wallet." ar="محفظتك." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="Saudi Riyal · halala-precise" ar="ريال سعودي · بدقة الهللة" />
            </span>
            <span>
              <Bi en="Auto top-up " ar="الشحن التلقائي " />
              <b>
                <Bi en={autoTopup?.enabled ? 'on' : 'off'} ar={autoTopup?.enabled ? 'مفعّل' : 'متوقف'} />
              </b>
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or paste a renter API key before v2 can show wallet balance, payments, or top-up controls."
                  ar="سجل الدخول أو أدخل مفتاح مستأجر قبل أن تعرض v2 الرصيد والمدفوعات وأدوات الشحن."
                />
              </span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state error" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Wallet unavailable" ar="المحفظة غير متاحة" />
              </b>
              <span>{error}</span>
            </div>
          )}

          <div className="balance-card" style={{ marginTop: '36px' }}>
            <div className="balance-grid">
              <div>
                <div className="k">
                  <Bi en="Available balance" ar="الرصيد المتاح" />
                </div>
                <div className="v">
                  SAR {balanceParts.whole}
                  <span className="u">.{balanceParts.frac}</span>
                </div>
                <div className="d">
                  <Bi en="Held in active jobs: " ar="محجوز في مهام نشطة: " />
                  <b>SAR {fmtSar(heldSar)}</b>
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Lifetime spend" ar="إجمالي الإنفاق" />
                </div>
                <div className="v small">SAR {fmtSar(totalSpentSar)}</div>
                <div className="d">
                  <Bi en={`${wholeFmt.format(totalJobs)} completed jobs recorded`} ar={`${wholeFmt.format(totalJobs)} مهام مسجلة`} />
                </div>
              </div>
              <div>
                <div className="k">
                  <Bi en="Auto top-up" ar="الشحن التلقائي" />
                </div>
                <div className="v small">{autoTopup?.enabled ? `SAR ${fmtSar(autoTopup.amount_sar || halalaToSar(autoTopup.amount_halala))}` : 'Off'}</div>
                <div className="d">
                  {autoTopup?.card_on_file ? (
                    <Bi
                      en={`${autoTopup.card_on_file.brand || 'Card'} ending ${autoTopup.card_on_file.last4 || '----'}`}
                      ar={`${autoTopup.card_on_file.brand || 'بطاقة'} تنتهي بـ ${autoTopup.card_on_file.last4 || '----'}`}
                    />
                  ) : (
                    <Bi en="No saved card on file" ar="لا توجد بطاقة محفوظة" />
                  )}
                </div>
              </div>
            </div>
          </div>

          <form id="top-up" className="panel" style={{ marginTop: '28px' }} onSubmit={submitTopup}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Top up" ar="شحن الرصيد" />
                </h3>
              </div>
            </div>

            <h4 className="section-kicker">
              <Bi en="Method" ar="الطريقة" />
            </h4>
            <div className="topup-methods">
              {TOPUP_METHODS.map((m, i) => (
                <button
                  key={m.code}
                  type="button"
                  className={`topup-method${i === methodIdx ? ' on' : ''}`}
                  onClick={() => setMethodIdx(i)}
                >
                  <div className="nm">
                    <Bi en={m.nm} ar={m.nmAr} />
                  </div>
                  <div className="desc">
                    <Bi en={m.desc} ar={m.descAr} />
                  </div>
                  <div className="fee">
                    <Bi en="Backend contract" ar="عقد الخلفية" /> <b>{m.code}</b>
                  </div>
                </button>
              ))}
            </div>

            <h4 className="section-kicker spaced">
              <Bi en="Amount" ar="المبلغ" />
            </h4>
            <div className="amount-pick">
              {AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={!customAmount && amount === amountSar ? 'on' : ''}
                  onClick={() => {
                    setAmountSar(amount)
                    setCustomAmount('')
                  }}
                >
                  SAR {wholeFmt.format(amount)}
                </button>
              ))}
              <label className="custom-amount">
                <span>
                  <Bi en="Custom SAR" ar="مبلغ مخصص بالريال" />
                </span>
                <input
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="1000"
                  aria-label="Custom SAR amount"
                />
              </label>
            </div>

            <div className="action-row">
              <button className="btn-pri" type="submit" disabled={!canSubmitTopup || saveState === 'submitting'}>
                {saveState === 'submitting' ? (
                  <Bi en="Starting..." ar="جاري البدء..." />
                ) : (
                  <Bi en={`Top up SAR ${fmtSar(topupAmount)}`} ar={`شحن ${fmtSar(topupAmount)} ريال`} />
                )}
              </button>
              <span className="hint">
                <Bi
                  en="Card and Apple Pay open Moyasar checkout; bank transfer returns DCP bank instructions."
                  ar="البطاقة و Apple Pay تفتحان دفع ميسر؛ التحويل البنكي يعرض تعليمات بنك DCP."
                />
              </span>
            </div>

            {saveState === 'error' && <div className="dash-state error">{error}</div>}
            {topupResult && (
              <div className="dash-state success">
                <b>
                  <Bi en="Top-up started" ar="بدأ الشحن" />
                </b>
                {topupResult.payment_url ? (
                  <a href={topupResult.payment_url}>
                    <Bi en="Continue payment" ar="متابعة الدفع" />
                  </a>
                ) : topupResult.instructions ? (
                  <span>
                    {topupResult.instructions.bank_name} · {topupResult.instructions.account_name} · {topupResult.instructions.reference}
                  </span>
                ) : (
                  <span>{topupResult.payment_id || topupResult.topup_id || topupResult.status}</span>
                )}
              </div>
            )}
          </form>

          <form className="panel" style={{ marginTop: '28px' }} onSubmit={saveAutoTopup}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Auto top-up" ar="الشحن التلقائي" />
                </h3>
              </div>
            </div>
            {!autoTopup?.card_on_file && (
              <div className="dash-state">
                <b>
                  <Bi en="Saved card required" ar="بطاقة محفوظة مطلوبة" />
                </b>
                <span>
                  <Bi
                    en="The backend will not enable auto top-up until a Moyasar card token is saved for this renter."
                    ar="لن تفعّل الخلفية الشحن التلقائي حتى يتم حفظ رمز بطاقة ميسر لهذا المستأجر."
                  />
                </span>
              </div>
            )}
            <div className="form-grid">
              <div className="lbl">
                <b>
                  <Bi en="Enabled" ar="مفعّل" />
                </b>
                <Bi en="Read from backend settings" ar="مقروء من إعدادات الخلفية" />
              </div>
              <div className="ctl">
                <label className="switch">
                  <input type="checkbox" checked={autoEnabled} disabled={!canSaveAutoTopup} onChange={(event) => setAutoEnabled(event.target.checked)} />
                  <span className="track" />
                  <span className="lbl-text">
                    <Bi en={autoEnabled ? 'On' : 'Off'} ar={autoEnabled ? 'مفعّل' : 'متوقف'} />
                  </span>
                </label>
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Trigger threshold" ar="حد التفعيل" />
                </b>
                <Bi en="Refill below this balance" ar="إعادة الشحن عند انخفاض الرصيد عن" />
              </div>
              <div className="ctl">
                <input className="input" type="number" min="0" value={autoThresholdSar} disabled={!canSaveAutoTopup} onChange={(event) => setAutoThresholdSar(Number(event.target.value))} />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Refill amount" ar="مبلغ إعادة الشحن" />
                </b>
                <Bi en="Amount charged per refill" ar="المبلغ في كل إعادة شحن" />
              </div>
              <div className="ctl">
                <input className="input" type="number" min="0" value={autoAmountSar} disabled={!canSaveAutoTopup} onChange={(event) => setAutoAmountSar(Number(event.target.value))} />
              </div>
              <div className="lbl">
                <b>
                  <Bi en="Monthly cap" ar="الحد الشهري" />
                </b>
                <Bi en="Backend spending guard" ar="حماية الإنفاق في الخلفية" />
              </div>
              <div className="ctl">
                <input className="input" type="number" min="0" value={autoCapSar} disabled={!canSaveAutoTopup} onChange={(event) => setAutoCapSar(Number(event.target.value))} />
                <span className="hint">
                  <Bi
                    en={`Used this month: SAR ${fmtSar(autoTopup?.monthly_used_sar || halalaToSar(autoTopup?.monthly_used_halala))}`}
                    ar={`المستخدم هذا الشهر: ${fmtSar(autoTopup?.monthly_used_sar || halalaToSar(autoTopup?.monthly_used_halala))} ريال`}
                  />
                </span>
              </div>
            </div>
            <div className="action-row">
              <button className="btn-pri" type="submit" disabled={!canSaveAutoTopup || autoSaveState === 'submitting'}>
                {autoSaveState === 'submitting' ? <Bi en="Saving..." ar="جاري الحفظ..." /> : <Bi en="Save auto top-up" ar="حفظ الشحن التلقائي" />}
              </button>
              {autoSaveState === 'success' && (
                <span className="hint success-text">
                  <Bi en="Saved" ar="تم الحفظ" />
                </span>
              )}
            </div>
          </form>

          <div className="panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Transactions" ar="المعاملات" />
                </h3>
              </div>
              <Link className="text-link" href="/v2/renter/invoices">
                <Bi en="Tax invoices →" ar="الفواتير الضريبية →" />
              </Link>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="When" ar="متى" />
                  </th>
                  <th>
                    <Bi en="Description" ar="الوصف" />
                  </th>
                  <th>
                    <Bi en="Method" ar="الطريقة" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Amount" ar="المبلغ" />
                  </th>
                </tr>
              </thead>
              <tbody id="tx">
                {payments.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={4}>
                      <Bi en="No wallet payments have been recorded for this renter yet." ar="لم يتم تسجيل أي مدفوعات محفظة لهذا المستأجر بعد." />
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => {
                    const when = relTime(payment.created_at)
                    const amount = amountFromPayment(payment)
                    const method = payment.payment_method || payment.source_type || (payment.moyasar_id ? 'moyasar' : 'wallet')
                    const description = payment.description || payment.payment_id || payment.id || 'Payment'
                    return (
                      <tr key={payment.payment_id || payment.id || `${description}-${payment.created_at}`}>
                        <td>
                          <span className="mut">
                            <Bi en={when.en} ar={when.ar} />
                          </span>
                        </td>
                        <td>
                          <span className="mono">{description}</span>
                        </td>
                        <td>
                          <span className="mono">{method}</span>
                        </td>
                        <td>
                          <span className="sar" style={{ color: payment.status === 'refunded' ? 'var(--ink)' : 'var(--teal)' }}>
                            {payment.status === 'refunded' ? '-' : '+'}
                            {fmtSar(amount)}
                            <span className="u">SAR</span>
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
