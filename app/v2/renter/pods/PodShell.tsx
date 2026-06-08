'use client'

// Shell chrome for the v2 renter GPU Pods page: sidebar + topbar.
// Kept in a sibling module so page.tsx stays focused on pod logic + content.
// Mirrors the structure shared by every other v2 renter console page
// (wallet, dashboard, keys, usage, …): rt-sb sidebar + rt-tb toolbar.

import Link from 'next/link'
import { Bi } from '@/app/v2/lib/i18n'

export const CURRENT_PAGE = 'pods'

// Navigation — identical shape across the v2 renter console. The GPU Pods
// item lives in the Build section (after Usage) and is mirrored into every
// other renter page so users can reach Pods from anywhere.
export const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/v2/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/v2/renter/pods' },
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

export function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

interface SidebarProps {
  navOpen: boolean
  renterName: string
  renterEmail: string
}

export function PodSidebar({ navOpen, renterName, renterEmail }: SidebarProps) {
  return (
    <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="pods">
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
          <span className="av">{initials(renterName, renterEmail)}</span>
          <span className="body">
            <span className="nm">{renterName}</span>
            <span className="sub">Renter account</span>
          </span>
          <span className="chev">⌄</span>
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
                <Link key={it.k} href={it.href} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
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
        <div className="av">{initials(renterName, renterEmail)}</div>
        <div className="who">
          {renterName}
          <span className="e">{renterEmail || 'API key not loaded'}</span>
        </div>
        <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/v2/auth' }}>
          ↱
        </span>
      </div>
    </aside>
  )
}

interface TopbarProps {
  renterName: string
  isLive: boolean
  lang: 'en' | 'ar'
  onToggleLang: () => void
  onToggleNav: () => void
}

export function PodTopbar({ renterName, isLive, lang, onToggleLang, onToggleNav }: TopbarProps) {
  return (
    <header className="rt-tb" id="rt-tb" data-crumb="GPU Pods">
      <button className="mb-toggle" id="mb-toggle" aria-label="Menu" type="button" onClick={onToggleNav}>
        ☰
      </button>
      <div className="crumb">
        <span>{renterName}</span>
        <span className="sep">/</span>
        <span className="cur">
          <Bi en="GPU Pods" ar="حاويات GPU" />
        </span>
      </div>
      <span className="pill">
        <span className="d" />{' '}
        <Bi en={isLive ? 'API live' : 'Needs renter key'} ar={isLive ? 'الواجهة تعمل' : 'يتطلب مفتاح مستأجر'} />
      </span>
      <button className="lang-pill" type="button" onClick={onToggleLang} aria-label="Toggle language">
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
  )
}
