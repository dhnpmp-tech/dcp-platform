'use client'

// Shared NEW header — the editorial-luxury marquee + sticky topbar + full-screen
// mobile menu used to wrap EVERY page in the app/(site) group. Lifted from the
// redesigned home so re-shelled legacy pages (pricing, support, terms, …) render
// the SAME chrome and the OLD v1 Header (Rent Compute / CONSOLE LOGIN / INTENT
// toggle) can never appear again.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { BootEgg } from '@/app/(site)/components/boot-egg/BootEgg'

// ───────── marquee items ─────────
const MARQUEE: ReadonlyArray<{ en: string; ar: string }> = [
  { en: 'Inference and agents, in the Kingdom', ar: 'استدلال ووكلاء، داخل المملكة' },
  { en: 'Pay per token · Saudi Riyal', ar: 'ادفع لكل رمز · بالريال السعودي' },
  { en: 'DCP-Agent for Saudi business · agents.dcp.sa', ar: 'DCP-Agent للأعمال السعودية · agents.dcp.sa' },
  { en: 'Agents can rent a GPU · npx -y github:dhnpmp-tech/dcp-mcp', ar: 'الوكلاء يستأجرون المعالجات · npx -y github:dhnpmp-tech/dcp-mcp' },
  { en: 'Earn Riyal from your GPU', ar: 'اكسب ريالاً من معالجك' },
  { en: 'PDPL · Saudi data residency', ar: 'نظام البيانات · إقامة داخل المملكة' },
]

// ───────── primary nav — product-first, identical to the home topbar ─────────
const NAV: ReadonlyArray<{ href: string; en: string; ar: string }> = [
  { href: '/', en: 'Overview', ar: 'نظرة عامة' },
  { href: '/pods', en: 'GPU Pods', ar: 'حاويات GPU' },
  { href: '/inference', en: 'Inference', ar: 'الاستدلال' },
  { href: '/fine-tuning', en: 'Fine-Tuning', ar: 'الضبط الدقيق' },
  { href: '/batch', en: 'Batch', ar: 'الدُفعات' },
  { href: '/agents', en: 'Agents', ar: 'الوكلاء' },
  { href: '/pricing', en: 'Pricing', ar: 'الأسعار' },
  { href: '/provider-setup', en: 'Earn', ar: 'اكسب' },
  { href: '/docs', en: 'Docs', ar: 'التوثيق' },
]

// ───────── mobile menu rows ─────────
const MENU: ReadonlyArray<{ href: string; n: string; tEn: string; tAr: string; sEn: string; sAr: string }> = [
  { href: '/', n: '01', tEn: 'Overview', tAr: 'نظرة عامة', sEn: 'Sovereign Arabic AI runtime', sAr: 'بيئة تشغيل عربية سيادية' },
  { href: '/inference', n: '02', tEn: 'Inference', tAr: 'الاستدلال', sEn: 'OpenAI-compatible · live catalog', sAr: 'متوافق مع OpenAI · كتالوج حي' },
  { href: '/fine-tuning', n: '03', tEn: 'Fine-Tuning', tAr: 'الضبط الدقيق', sEn: 'LoRA contracts · proof-gated serving', sAr: 'عقود LoRA · خدمة مقيدة بالإثبات' },
  { href: '/batch', n: '04', tEn: 'Batch', tAr: 'الدُفعات', sEn: 'JSONL validation · execution gated', sAr: 'تحقق JSONL · التشغيل مقيد' },
  { href: '/pricing', n: '05', tEn: 'Pricing', tAr: 'الأسعار', sEn: 'Per-million-token · SAR', sAr: 'لكل مليون رمز · بالريال' },
  { href: '/pods', n: '06', tEn: 'GPU Pods', tAr: 'حاويات GPU', sEn: 'Rent a whole GPU on demand', sAr: 'استأجر معالجاً كاملاً عند الطلب' },
  { href: '/agents', n: '07', tEn: 'Agents', tAr: 'الوكلاء', sEn: 'Zero-human onboarding · MCP', sAr: 'تهيئة بلا بشر · MCP' },
  { href: '/docs', n: '08', tEn: 'Docs', tAr: 'التوثيق', sEn: 'OpenAI-compatible API', sAr: 'واجهة متوافقة مع OpenAI' },
  { href: '/provider-setup', n: '09', tEn: 'Earn', tAr: 'اكسب', sEn: 'Earn Riyal from your GPU', sAr: 'اكسب ريالاً من معالجك' },
  { href: '/support', n: '10', tEn: 'Support', tAr: 'الدعم', sEn: 'Talk to the team', sAr: 'تواصل مع الفريق' },
]

interface SiteHeaderProps {
  /** Pathname-derived key marking the active nav item (e.g. "/pricing"). */
  active?: string
}

export default function SiteHeader({ active }: SiteHeaderProps) {
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

  return (
    <>
      {/* the "type gpu" terminal easter egg travels with the shared chrome */}
      <BootEgg />

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
              <Link
                key={item.en}
                href={item.href}
                className={active && item.href === active ? 'on' : undefined}
              >
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
          <button type="button" className="mm-close" aria-label="Close" onClick={() => setMenuOpen(false)}>
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
          {MENU.map((m) => (
            <Link key={m.href} className="mm-link" href={m.href}>
              <span className="n">{m.n}</span>
              <span className="body">
                <span className="t">
                  <Bi en={m.tEn} ar={m.tAr} />
                </span>
                <span className="ar">{m.tAr}</span>
                <span className="s">
                  <Bi en={m.sEn} ar={m.sAr} />
                </span>
              </span>
              <span className="arrow">→</span>
            </Link>
          ))}
        </div>
        <div className="mm-foot">
          <span className="stamp">
            <Bi en="In-Kingdom · PDPL" ar="داخل المملكة · نظام البيانات" />
          </span>
          <span>© 2026 · Riyadh</span>
        </div>
      </div>
    </>
  )
}
