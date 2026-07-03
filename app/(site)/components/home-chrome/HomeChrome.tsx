'use client'

// HomeChrome — the bespoke home topbar: marquee, nav, language pill, sign-in /
// start-free CTAs, and the full-screen mobile editorial menu. Extracted from the
// old home god-component so the home page body can server-render while only the
// chrome (which needs lang + menu state) hydrates.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../../lib/i18n'
import { MARQUEE, NAV } from '../../(home)/home-data'

export function HomeChrome() {
  const { lang, toggle } = useV2()
  const [menuOpen, setMenuOpen] = useState(false)

  // close mobile menu on Escape
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const menuLinks: ReadonlyArray<{ href: string; n: string; tEn: string; tAr: string; sEn: string; sAr: string }> = [
    { href: '/containers', n: '01', tEn: 'GPU Pods', tAr: 'حاويات GPU', sEn: 'Whole-GPU rental · from 2.5 SAR/hr', sAr: 'إيجار معالجات كاملة · من ٢٫٥ ريال/س' },
    { href: '/marketplace', n: '02', tEn: 'Inference', tAr: 'الاستدلال', sEn: 'OpenAI-compatible · live models', sAr: 'متوافقة مع OpenAI · نماذج حية' },
    { href: '/agents', n: '03', tEn: 'Agents', tAr: 'الوكلاء', sEn: 'Live at agents.dcp.sa · MCP', sAr: 'على agents.dcp.sa · MCP' },
    { href: '/pricing', n: '04', tEn: 'Pricing', tAr: 'الأسعار', sEn: 'Per-second · per-token · SAR', sAr: 'بالثانية · بالرمز · بالريال' },
    { href: '/docs', n: '05', tEn: 'Docs', tAr: 'التوثيق', sEn: 'API · CLI · SDKs', sAr: 'واجهة · سطر أوامر · مكتبات' },
    { href: '/trust-center', n: '06', tEn: 'Trust center', tAr: 'مركز الثقة', sEn: 'PDPL · compliance · enterprise', sAr: 'نظام البيانات · امتثال · مؤسسات' },
    { href: '/provider-setup', n: '07', tEn: 'Earn', tAr: 'اكسب', sEn: 'Register a GPU · paid in SAR', sAr: 'سجّل معالجاً · يُدفع بالريال' },
    { href: '/', n: '08', tEn: 'Overview', tAr: 'نظرة عامة', sEn: 'Sovereign Arabic AI runtime', sAr: 'بيئة تشغيل عربية سيادية' },
  ]

  return (
    <>
      {/* ───────── Top marquee ───────── */}
      <div className="v2-marq">
        <div className="in">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={`marq-${i}`}>
              <Bi en={m.en} ar={m.ar} />
            </span>
          ))}
        </div>
      </div>

      {/* ───────── Nav ───────── */}
      <header className="v2-topbar">
        <div className="left">
          <Link href="/" className="brand-name">
            DCP<i>∞</i>
          </Link>
          <nav>
            {NAV.map((item) => (
              <Link key={item.en} href={item.href} className={item.on ? 'on' : undefined}>
                <Bi en={item.en} ar={item.ar} />
              </Link>
            ))}
          </nav>
        </div>
        <div className="right">
          <div className="lang-pill" id="lang-pill" onClick={toggle} role="group" aria-label="Language">
            <button type="button" data-l="en" className={lang === 'en' ? 'on' : undefined}>
              EN
            </button>
            <button type="button" data-l="ar" className={lang === 'ar' ? 'on' : undefined}>
              ع
            </button>
          </div>
          <Link className="btn small ghost" href="/auth">
            <Bi en="Sign in" ar="دخول" />
          </Link>
          <Link className="btn small primary" href="/setup">
            <Bi en="Start free →" ar="ابدأ مجاناً ←" />
          </Link>
          <button
            type="button"
            className="menu-toggle"
            id="menu-toggle"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile menu — full-screen editorial overlay */}
      <div className={menuOpen ? 'v2-mobile-menu on' : 'v2-mobile-menu'} id="mobile-menu">
        <div className="mm-glyph" aria-hidden="true">
          <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid meet">
            <g className="ms" transform="translate(180 110)">
              <path d="M 0 0 H 180 V 60 H 60 V 220 H 180 V 280 H 0 Z" />
              <path d="M 260 0 H 460 V 60 H 320 V 160 H 460 V 220 H 380 V 280 H 260 Z M 380 100 H 460 V 160 H 380 Z" />
              <path d="M 540 0 H 720 V 60 H 600 V 220 H 720 V 280 H 540 Z M 660 100 H 720 V 160 H 660 Z" />
            </g>
          </svg>
        </div>

        <div className="mm-head">
          <span className="brand-name">
            DCP<i>∞</i>
          </span>
          <button type="button" className="mm-close" id="mm-close" aria-label="Close" onClick={() => setMenuOpen(false)}>
            ✕
          </button>
        </div>
        <div
          className="mm-body"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setMenuOpen(false)
          }}
        >
          <div className="mm-section">
            <Bi en="Explore" ar="تصفّح" />
          </div>
          {menuLinks.map((l) => (
            <Link key={l.n} className="mm-link" href={l.href}>
              <span className="n">{l.n}</span>
              <span className="body">
                <span className="t">
                  <Bi en={l.tEn} ar={l.tAr} />
                </span>
                <span className="ar">{l.tAr}</span>
                <span className="s">
                  <Bi en={l.sEn} ar={l.sAr} />
                </span>
              </span>
              <span className="arrow">→</span>
            </Link>
          ))}
        </div>
        <div className="mm-foot">
          <span className="stamp">DC Power Solutions · CR 7053667775</span>
          <Link href="/setup" className="btn small primary">
            <Bi en="Start free →" ar="ابدأ مجاناً ←" />
          </Link>
        </div>
      </div>
    </>
  )
}