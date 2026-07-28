'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'

type RenterConsolePage =
  | 'dash'
  | 'pg'
  | 'keys'
  | 'usage'
  | 'pods'
  | 'fine'
  | 'batches'
  | 'wallet'
  | 'invoices'
  | 'settings'
  | 'docs'

interface NavItem {
  k: RenterConsolePage
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
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
      { k: 'fine', ic: 'FT', label: 'Fine-Tuning', labelAr: 'الضبط الدقيق', href: '/renter/fine-tuning' },
      { k: 'batches', ic: '▤', label: 'Batch', labelAr: 'الدُفعات', href: '/renter/batches' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Credit', labelAr: 'الرصيد', href: '/renter/wallet' },
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

const PAGE_META: Record<string, { label: string; labelAr: string; navKey?: RenterConsolePage }> = {
  '/renter/dashboard': { label: 'Overview', labelAr: 'نظرة عامة', navKey: 'dash' },
  '/renter/playground': { label: 'Playground', labelAr: 'البيئة التجريبية', navKey: 'pg' },
  '/renter/keys': { label: 'API keys', labelAr: 'مفاتيح API', navKey: 'keys' },
  '/renter/usage': { label: 'Usage', labelAr: 'الاستخدام', navKey: 'usage' },
  '/renter/pods': { label: 'GPU Pods', labelAr: 'حاويات GPU', navKey: 'pods' },
  '/renter/fine-tuning': { label: 'Fine-Tuning', labelAr: 'الضبط الدقيق', navKey: 'fine' },
  '/renter/batches': { label: 'Batch', labelAr: 'الدُفعات', navKey: 'batches' },
  '/renter/wallet': { label: 'Credit', labelAr: 'الرصيد', navKey: 'wallet' },
  '/renter/invoices': { label: 'Invoices', labelAr: 'الفواتير', navKey: 'invoices' },
  '/renter/settings': { label: 'Settings', labelAr: 'الإعدادات', navKey: 'settings' },
  '/renter/jobs': { label: 'Job detail', labelAr: 'تفاصيل المهمة', navKey: 'usage' },
}

const numFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface RenterAccount {
  name?: string
  email?: string
  organization?: string
  balance_halala?: number
  total_spent_halala?: number
}

interface RenterBalance {
  balance_sar?: number
  balance_halala?: number
  held_sar?: number
  held_halala?: number
  total_spent_sar?: number
  total_spent_halala?: number
}

interface JsonResult<T> {
  value: T | null
  failed: boolean
}

async function readJsonOrDegraded<T>(response: Response, label: string): Promise<JsonResult<T>> {
  try {
    return { value: (await response.json()) as T, failed: false }
  } catch (error) {
    console.warn(`[renter-shell] Failed to parse ${label} response`, error)
    return { value: null, failed: true }
  }
}

function halalaToSar(value?: number | null): number {
  return typeof value === 'number' ? value / 100 : 0
}

function sarValue(...values: Array<number | undefined | null>): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

function pageMeta(pathname: string) {
  const direct = PAGE_META[pathname]
  if (direct) return direct
  const parent = Object.keys(PAGE_META)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0]
  return parent ? PAGE_META[parent] : PAGE_META['/renter/dashboard']
}

export default function RenterShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/renter/dashboard'
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalance | null>(null)
  const [accountState, setAccountState] = useState<'missing-key' | 'loading' | 'ready' | 'degraded' | 'error'>('loading')

  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    const key = getRenterKey()
    if (!key) {
      setRenter(null)
      setBalance(null)
      setAccountState('missing-key')
      return
    }

    setAccountState('loading')
    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    ;(async () => {
      try {
        const [meRes, balanceRes] = await Promise.all([
          fetch(`${base}/renters/me`, { headers, cache: 'no-store' }),
          fetch(`${base}/renters/balance`, { headers, cache: 'no-store' }),
        ])
        if (cancelled) return
        const meJson = meRes.ok
          ? await readJsonOrDegraded<{ renter?: RenterAccount }>(meRes, 'renters/me')
          : { value: null, failed: false }
        const balanceJson = balanceRes.ok
          ? await readJsonOrDegraded<RenterBalance>(balanceRes, 'renters/balance')
          : { value: null, failed: false }
        setRenter(meJson.value?.renter || null)
        setBalance(balanceJson.value || null)
        setAccountState(meRes.ok && !meJson.failed ? (balanceRes.ok && !balanceJson.failed ? 'ready' : 'degraded') : 'error')
      } catch (error) {
        console.warn('[renter-shell] Account summary request failed', error)
        if (!cancelled) setAccountState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const meta = useMemo(() => pageMeta(pathname), [pathname])
  const accountName = renter?.organization || renter?.name || renter?.email || 'Renter account'
  const accountEmail = renter?.email || ''
  const accountSub =
    accountState === 'ready'
      ? accountEmail || 'Live renter account'
      : accountState === 'loading'
        ? 'Loading renter account'
        : accountState === 'degraded'
          ? 'Credit summary unavailable'
        : accountState === 'missing-key'
          ? 'Renter key required'
          : 'Renter session check failed'
  const balanceSar = sarValue(balance?.balance_sar, halalaToSar(balance?.balance_halala ?? renter?.balance_halala))
  const heldSar = sarValue(balance?.held_sar, halalaToSar(balance?.held_halala))
  const totalSpentSar = sarValue(balance?.total_spent_sar, halalaToSar(balance?.total_spent_halala ?? renter?.total_spent_halala))
  const apiReady = accountState === 'ready'
  const pillColor = apiReady ? 'var(--rt-accent)' : 'var(--mut)'

  function signOut() {
    localStorage.removeItem('dc1_renter_key')
    window.location.href = '/auth'
  }

  return (
    <div className="rt-app" suppressHydrationWarning>
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page={meta.navKey || 'dash'}>
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <button className="rt-ws-btn" type="button" title="Renter account">
            <span className="av">{initials(accountName, accountEmail)}</span>
            <span className="body">
              <span className="nm">{accountName}</span>
              <span className="sub">
                <Bi en={accountSub} ar={accountSub} />
              </span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Credit" ar="الرصيد" />
          </div>
          <div className="v">
            <Bi en={`Credit ${numFmt.format(balanceSar)}`} ar={`رصيد ${numFmt.format(balanceSar)}`} />
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>
              <Bi en={`${numFmt.format(heldSar)} credit`} ar={`${numFmt.format(heldSar)} رصيد`} />
            </b>
          </div>
          <div className="row">
            <span>
              <Bi en="Total spent" ar="إجمالي الإنفاق" />
            </span>
            <b>
              <Bi en={`${numFmt.format(totalSpentSar)} credit`} ar={`${numFmt.format(totalSpentSar)} رصيد`} />
            </b>
          </div>
          <Link className="topup" href="/renter/wallet#top-up">
            <Bi en="+ Add credit" ar="+ إضافة رصيد" />
          </Link>
        </div>

        <nav className="rt-nav" aria-label="Renter console">
          {NAV.map((section) => (
            <div key={section.sec}>
              <div className="sec">
                <Bi en={section.sec} ar={section.secAr} />
              </div>
              {section.items.map((item) => {
                const active = item.k === meta.navKey
                const isDocs = item.href === '/docs'
                return (
                  <Link
                    key={item.k}
                    href={item.href}
                    target={isDocs ? '_blank' : undefined}
                    rel={isDocs ? 'noopener noreferrer' : undefined}
                    className={active ? 'on' : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="ic">{item.ic}</span>
                    <span>
                      <Bi en={item.label} ar={item.labelAr} />
                    </span>
                    <span className="bd">{item.bd || ''}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="rt-sb-foot">
          <div className="av">{initials(renter?.name || accountName, accountEmail)}</div>
          <div className="who">
            {renter?.name || accountName}
            <span className="e">{accountEmail || accountSub}</span>
          </div>
          <button className="out" title="Sign out" type="button" aria-label="Sign out" onClick={signOut}>
            ↱
          </button>
        </div>
      </aside>

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <header className="rt-tb" id="rt-tb" data-crumb={meta.label}>
          <button className="mb-toggle" id="mb-toggle" aria-label="Menu" type="button" onClick={() => setNavOpen((v) => !v)}>
            ☰
          </button>
          <div className="crumb">
            <span>{accountName}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en={meta.label} ar={meta.labelAr} />
            </span>
          </div>
          <span className="pill" style={{ color: pillColor, borderColor: pillColor }}>
            <span className="d" style={apiReady ? undefined : { background: 'var(--mut)', animation: 'none' }} />{' '}
            {apiReady ? (
              <Bi en="API live" ar="الواجهة تعمل" />
            ) : accountState === 'degraded' ? (
              <Bi en="API degraded" ar="الواجهة متدهورة" />
            ) : accountState === 'loading' ? (
              <Bi en="API connecting" ar="جارٍ الاتصال" />
            ) : (
              <Bi en="Needs renter key" ar="يتطلب مفتاح مستأجر" />
            )}
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

        {children}
      </div>
    </div>
  )
}
