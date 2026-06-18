'use client'

// v2 marketing home.
// dcp-kit.css is imported by app/v2/layout.tsx; only the co-located page CSS is
// imported here. The data-en/data-ar swap is handled by V2Provider + <Bi>.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import GpuAvailability from '@/app/v2/components/gpu-availability/GpuAvailability'
import './home.css'

// ───────── marquee items ─────────
const MARQUEE: ReadonlyArray<{ en: string; ar: string }> = [
  { en: 'Inference and agents, in the Kingdom', ar: 'استدلال ووكلاء، داخل المملكة' },
  { en: 'Pay per token · Saudi Riyal', ar: 'ادفع لكل رمز · بالريال السعودي' },
  { en: 'DCP-Agent for Saudi business · agents.dcp.sa', ar: 'DCP-Agent للأعمال السعودية · agents.dcp.sa' },
  { en: 'Earn Riyal from your GPU', ar: 'اكسب ريالاً من معالجك' },
  { en: 'PDPL · Saudi data residency', ar: 'نظام البيانات · إقامة داخل المملكة' },
]

// ───────── nav links ─────────
const NAV: ReadonlyArray<{ href: string; en: string; ar: string; on?: boolean }> = [
  { href: '/v2/home', en: 'Overview', ar: 'نظرة عامة', on: true },
  { href: '#marketplace', en: 'Marketplace', ar: 'السوق' },
  { href: '#compute', en: 'GPU Pods', ar: 'حاويات GPU' },
  { href: '#agents', en: 'Agents', ar: 'الوكلاء' },
  { href: '/v2/provider-setup', en: 'Earn', ar: 'اكسب' },
  { href: '#pricing', en: 'Pricing', ar: 'الأسعار' },
  { href: '/v2/docs', en: 'Docs', ar: 'التوثيق' },
]

// ───────── capacity truth cards ─────────
const CAPACITY_GATES = [
  {
    k: 'endpoint_reachable',
    tEn: 'We can reach it',
    tAr: 'نستطيع الوصول إليه',
    en: 'Our backend connects to the machine over the private mesh — right now, not at sign-up time.',
    ar: 'خلفيتنا تتصل بالجهاز عبر الشبكة الخاصة — الآن، لا عند التسجيل.',
  },
  {
    k: 'verified_online',
    tEn: 'It really answers',
    tAr: 'يجيب فعلاً',
    en: 'We send the machine a real question and verify a real answer comes back. A heartbeat alone earns nothing.',
    ar: 'نرسل للجهاز سؤالاً حقيقياً ونتحقق من عودة إجابة حقيقية. نبض الاتصال وحده لا يكفي.',
  },
  {
    k: 'model_coverage',
    tEn: 'It serves what it claims',
    tAr: 'يقدّم ما يدّعيه',
    en: 'A model is listed only while a verified machine is actually serving that exact model.',
    ar: 'يُعرض النموذج فقط ما دام جهاز متحقق يخدم ذلك النموذج بعينه.',
  },
]

// ───────── how-it-works stations ─────────

type QsTab = 'curl' | 'cli' | 'py' | 'js'

// §01 live marketplace — shape of /v1/models entries (earned-online catalog)
type MpModel = {
  id: string
  name?: string
  context_length?: number
  quantization?: string
  available?: boolean
  provider_count?: number
  pricing?: { usd_per_1m_input_tokens?: string }
}

const SAR_PER_USD = 3.75 // backend stores halala and converts at the SAMA peg; we display SAR, never USD
const fmtMpPrice = (m: MpModel): string => {
  const usd = Number(m.pricing?.usd_per_1m_input_tokens ?? 0)
  return usd > 0 ? `${(usd * SAR_PER_USD).toFixed(2)} SAR` : '—'
}

export default function V2HomePage() {
  const { lang, toggle } = useV2()
  const [menuOpen, setMenuOpen] = useState(false)
  const [qsTab, setQsTab] = useState<QsTab>('curl')
  const [copied, setCopied] = useState(false)
  const [live, setLive] = useState<{ online: number; serving: number; catalog: number } | null>(null)
  // Count of GPU *types* the mesh can serve right now (type-level, never a
  // node/provider count). Sourced from /api/health/detailed `gpu_types`.
  const [gpuTypeCount, setGpuTypeCount] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<MpModel[] | null>(null)

  // Hero live demo — one prompt, one real completion from a verified Saudi GPU.
  const [demoQ, setDemoQ] = useState('')
  const [demoTyped, setDemoTyped] = useState('')
  const [demoMeta, setDemoMeta] = useState<{ model: string; providers: number } | null>(null)
  const [demoState, setDemoState] = useState<'idle' | 'busy' | 'done' | 'down'>('idle')
  const demoFull = useRef('')

  const askDemo = async () => {
    const q = demoQ.trim()
    if (!q || demoState === 'busy') return
    setDemoState('busy'); setDemoTyped(''); setDemoMeta(null)
    try {
      const res = await fetch('/api/public/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      })
      if (!res.ok) { setDemoState('down'); return }
      const d = await res.json()
      demoFull.current = String(d.content || '')
      setDemoMeta({ model: String(d.model || ''), providers: Number(d.provider_count) || 1 })
      setDemoState('done')
    } catch { setDemoState('down') }
  }

  // typewriter render — presentation only; the answer already arrived whole
  useEffect(() => {
    if (demoState !== 'done' || !demoFull.current) return
    let i = 0
    const id = window.setInterval(() => {
      i += 2
      setDemoTyped(demoFull.current.slice(0, i))
      if (i >= demoFull.current.length) window.clearInterval(id)
    }, 16)
    return () => window.clearInterval(id)
  }, [demoState])

  const codeRef = useRef<HTMLPreElement | null>(null)

  // close mobile menu on Escape
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // §01 live capacity — real numbers from the same source /status uses.
  // Honest: shows whatever is true now (including 0), never simulated.
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/health/detailed', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        if (!alive) return
        setLive({
          online: Number(d?.providers?.online ?? 0),
          serving: Number(d?.providers?.serving ?? 0),
          catalog: Number(d?.models?.catalog_count ?? 0),
        })
        // GPU-type breadth (deduped, no machine names/counts) — used for the
        // mesh stat in place of a raw provider count.
        const gt = Array.isArray(d?.gpu_types) ? d.gpu_types : []
        setGpuTypeCount(gt.filter((t: { available?: boolean }) => t?.available !== false).length)
      } catch { /* offline — keep prior state, no fabricated numbers */ }
      try {
        const mres = await fetch('/v1/models', { cache: 'no-store' })
        if (!mres.ok) return
        const md = await mres.json()
        if (alive && Array.isArray(md?.data)) setCatalog(md.data as MpModel[])
      } catch { /* offline — keep prior state, no fabricated numbers */ }
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const copyCode = () => {
    const text = codeRef.current?.textContent ?? ''
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        /* clipboard unavailable — ignore */
      })
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh', fontFamily: 'var(--sans)' }}>
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
          <Link href="/v2/home" className="brand-name">
            DCP<i>∞</i>
          </Link>
          <nav>
            {NAV.map((item) =>
              item.href.startsWith('/') ? (
                <Link key={item.en} href={item.href} className={item.on ? 'on' : undefined}>
                  <Bi en={item.en} ar={item.ar} />
                </Link>
              ) : (
                <a key={item.en} href={item.href} className={item.on ? 'on' : undefined}>
                  <Bi en={item.en} ar={item.ar} />
                </a>
              ),
            )}
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
          <Link className="btn small ghost" href="/v2/auth">
            <Bi en="Sign in" ar="دخول" />
          </Link>
          <Link className="btn small primary" href="/v2/setup">
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
        {/* Background Najdi Kufic glyph echo */}
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
        <div className="mm-body" onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setMenuOpen(false)
        }}>
          <div className="mm-section">
            <Bi en="Explore" ar="تصفّح" />
          </div>
          <Link className="mm-link" href="/v2/home">
            <span className="n">01</span>
            <span className="body">
              <span className="t">
                <Bi en="Overview" ar="نظرة عامة" />
              </span>
              <span className="ar">نظرة عامة</span>
              <span className="s">
                <Bi en="Sovereign Arabic AI runtime" ar="بيئة تشغيل عربية سيادية" />
              </span>
            </span>
            <span className="arrow">→</span>
          </Link>
          <a className="mm-link" href="#quickstart">
            <span className="n">02</span>
            <span className="body">
              <span className="t">
                <Bi en="Quickstart" ar="البدء السريع" />
              </span>
              <span className="ar">البدء السريع</span>
              <span className="s">
                <Bi en="Start the renter path" ar="ابدأ مسار المستأجر" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>
          <a className="mm-link" href="#pricing">
            <span className="n">03</span>
            <span className="body">
              <span className="t">
                <Bi en="Pricing" ar="الأسعار" />
              </span>
              <span className="ar">الأسعار</span>
              <span className="s">
                <Bi en="Per-million-token · SAR" ar="لكل مليون رمز · بالريال" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>

          <div className="mm-section">
            <Bi en="Build & operate" ar="ابن وشغّل" />
          </div>
          <a className="mm-link" href="#marketplace">
            <span className="n">04</span>
            <span className="body">
              <span className="t">
                <Bi en="Marketplace" ar="السوق" />
              </span>
              <span className="ar">السوق</span>
              <span className="s">
                <Bi en="KSA provider mesh" ar="شبكة مزوّدين داخل المملكة" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>
          <a className="mm-link" href="#compute">
            <span className="n">05</span>
            <span className="body">
              <span className="t">
                <Bi en="GPU Pods" ar="حاويات GPU" />
              </span>
              <span className="ar">حاويات GPU</span>
              <span className="s">
                <Bi en="Whole-GPU compute rental" ar="إيجار معالجات كاملة" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>
          <a className="mm-link" href="#agents">
            <span className="n">06</span>
            <span className="body">
              <span className="t">
                <Bi en="Agents" ar="الوكلاء" />
              </span>
              <span className="ar">الوكلاء</span>
              <span className="s">
                <Bi en="Live at agents.dcp.sa" ar="على agents.dcp.sa" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>
          <Link className="mm-link" href="/v2/docs">
            <span className="n">07</span>
            <span className="body">
              <span className="t">
                <Bi en="Docs" ar="التوثيق" />
              </span>
              <span className="ar">التوثيق</span>
              <span className="s">
                <Bi en="API · CLI · SDKs" ar="واجهة · سطر أوامر · مكتبات" />
              </span>
            </span>
            <span className="arrow">→</span>
          </Link>

          <div className="mm-section">
            <Bi en="Trust" ar="الثقة" />
          </div>
          <a className="mm-link" href="#residency">
            <span className="n">08</span>
            <span className="body">
              <span className="t">
                <Bi en="Sovereignty" ar="السيادة" />
              </span>
              <span className="ar">السيادة</span>
              <span className="s">
                <Bi en="Where your data lives" ar="أين تعيش بياناتك" />
              </span>
            </span>
            <span className="arrow">→</span>
          </a>
        </div>
        <div className="mm-foot">
          <span className="stamp">DC Power Solutions · CR 7053667775</span>
          <Link href="/v2/setup" className="btn small primary">
            <Bi en="Start free →" ar="ابدأ مجاناً ←" />
          </Link>
        </div>
      </div>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="home-hero">
        {/* Najdi-inspired Arabic glyph watermark */}
        <div className="hero-glyph" aria-hidden="true">
          <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2dd4b6" />
                <stop offset=".55" stopColor="#6bb39a" />
                <stop offset="1" stopColor="#ee7a3c" />
              </linearGradient>
            </defs>
            {/*
              A hand-tuned Najdi-style square Kufic composition of the letters
              د · ج · ب (the consonants of DCP read in Arabic).
            */}
            <g className="stroke-a" transform="translate(200 110) scale(1)">
              {/* د */}
              <path d="M 0 0 H 180 V 60 H 60 V 220 H 180 V 280 H 0 Z" />
              {/* ج */}
              <path d="M 260 0 H 460 V 60 H 320 V 160 H 460 V 220 H 380 V 280 H 260 Z M 380 100 H 460 V 160 H 380 Z" />
              {/* ب */}
              <path d="M 540 0 H 720 V 60 H 600 V 220 H 720 V 280 H 540 Z M 660 100 H 720 V 160 H 660 Z" />
              {/* Decorative knots in the Najdi border tradition */}
              <path d="M -40 -40 H 760 V 320 H -40 Z" strokeDasharray="4 12" opacity=".6" />
            </g>
            <g className="stroke-b" transform="translate(200 110) scale(1)">
              <path d="M 0 0 H 180 V 60 H 60 V 220 H 180 V 280 H 0 Z" />
              <path d="M 260 0 H 460 V 60 H 320 V 160 H 460 V 220 H 380 V 280 H 260 Z" />
              <path d="M 540 0 H 720 V 60 H 600 V 220 H 720 V 280 H 540 Z" />
            </g>
          </svg>
        </div>

        {/* Saudi network map */}
        <div className="saudi-map" aria-hidden="true">
          <svg viewBox="0 0 1000 850" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="mapLink" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2dd4b6" stopOpacity=".7" />
                <stop offset="1" stopColor="#ee7a3c" stopOpacity=".7" />
              </linearGradient>
            </defs>

            <g className="grid">
              <path d="M 0 100 H 1000 M 0 300 H 1000 M 0 500 H 1000 M 0 700 H 1000" />
              <path d="M 227 0 V 850 M 455 0 V 850 M 683 0 V 850 M 911 0 V 850" />
            </g>

            <path
              className="border2"
              d="M 45 125 L 182 5 L 318 45 L 455 75 L 591 100 L 614 175 L 660 230 L 705 270 L 728 285 L 760 305 L 778 325 L 768 348 L 740 360 L 815 385 L 900 420 L 970 455 L 945 490 L 910 540 L 845 590 L 745 660 L 645 720 L 555 770 L 470 765 L 380 745 L 295 710 L 240 645 L 215 565 L 218 520 L 225 470 L 200 400 L 175 320 L 145 250 L 110 195 L 75 155 Z"
            />
            <path
              className="border"
              d="M 45 125 L 182 5 L 318 45 L 455 75 L 591 100 L 614 175 L 660 230 L 705 270 L 728 285 L 760 305 L 778 325 L 768 348 L 740 360 L 815 385 L 900 420 L 970 455 L 945 490 L 910 540 L 845 590 L 745 660 L 645 720 L 555 770 L 470 765 L 380 745 L 295 710 L 240 645 L 215 565 L 218 520 L 225 470 L 200 400 L 175 320 L 145 250 L 110 195 L 75 155 Z"
            />

            <path className="link a" d="M 578 365 L 728 280" />
            <path className="link a" d="M 578 365 L 227 525" />
            <path className="link b" d="M 578 365 L 45 200" />
            <path className="link b" d="M 728 280 L 45 200" />
            <path className="link b" d="M 227 525 L 45 200" />
            <path className="link a" d="M 227 525 L 728 280" />

            <circle className="halo b" cx="578" cy="365" r="6" />
            <circle className="halo c" cx="227" cy="525" r="6" />
            <circle className="halo d" cx="728" cy="280" r="6" />
            <circle className="halo e" cx="45" cy="200" r="6" />

            <circle className="node" cx="578" cy="365" r="5" />
            <circle className="node" cx="227" cy="525" r="4" />
            <circle className="node orange" cx="728" cy="280" r="4" />
            <circle className="node orange" cx="45" cy="200" r="4" />

            <text className="label l" x="596" y="361">RUH-1</text>
            <text className="label" x="596" y="375">Riyadh</text>
            <text className="label l" x="245" y="521">JED-1</text>
            <text className="label" x="245" y="535">Jeddah</text>
            <text className="label l" x="746" y="276">DMM-1</text>
            <text className="label" x="746" y="290">Dammam</text>
            <text className="label l" x="63" y="196">NW-1</text>
            <text className="label" x="63" y="210">Northwest</text>
          </svg>
        </div>

        <p
          style={{
            position: 'absolute',
            bottom: 14,
            right: 18,
            zIndex: 1,
            margin: 0,
            fontSize: 11,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        >
          <Bi en="Illustrative network footprint" ar="رسم توضيحي لانتشار الشبكة" />
        </p>

        <div className="wrap">
          <div className="home-hero-grid">
            <div>
              <span className="eyebrow">
                <Bi
                  en="§ DCP · Sovereign Arabic AI Runtime · KSA"
                  ar="§ DCP · بيئة تشغيل الذكاء الاصطناعي العربي السيادية · المملكة"
                />
              </span>
              <h1>
                {lang === 'ar' ? (
                  <>
                    سحابة المعالجات السعودية <em>المفتوحة.</em>
                  </>
                ) : (
                  <>
                    Saudi Arabia&apos;s <em>open GPU cloud.</em>
                  </>
                )}
              </h1>
              <p className="lead">
                <Bi
                  en="AI by the token. Whole GPUs by the minute. Verified live, billed in Riyal — your data never leaves the Kingdom."
                  ar="ذكاء اصطناعي بالرمز. معالجات كاملة بالدقيقة. متحقق مباشرةً، بالريال — بياناتك لا تغادر المملكة أبداً."
                />
              </p>

              <div className="door-grid">
                <Link className="door" href="/v2/renter/playground">
                  <span className="door-k"><Bi en="for builders" ar="للمطوّرين" /></span>
                  <span className="door-t"><Bi en="Use AI models" ar="استخدم النماذج" /></span>
                  <span className="door-d"><Bi en="OpenAI-compatible API and playground. Pay per token, in SAR." ar="واجهة متوافقة مع OpenAI وساحة تجربة. ادفع بالرمز، بالريال." /></span>
                  <span className="door-a">→</span>
                </Link>
                <Link className="door" href="/v2/containers">
                  <span className="door-k"><Bi en="for compute" ar="للحوسبة" /></span>
                  <span className="door-t"><Bi en="Rent a whole GPU" ar="استأجر معالجاً كاملاً" /></span>
                  <span className="door-d"><Bi en="A whole RTX-class GPU, dedicated to you — Jupyter + SSH in about a minute." ar="معالج RTX كامل مخصص لك — Jupyter و SSH خلال دقيقة تقريباً." /></span>
                  <span className="door-a">→</span>
                </Link>
                <Link className="door" href="/v2/provider-setup">
                  <span className="door-k"><Bi en="for GPU owners" ar="لمالكي المعالجات" /></span>
                  <span className="door-t"><Bi en="Earn with your GPU" ar="اكسب بمعالجك" /></span>
                  <span className="door-d"><Bi en="Your idle card joins the verified mesh and gets paid in SAR." ar="بطاقتك الخاملة تنضم إلى الشبكة المتحققة وتُدفع لها بالريال." /></span>
                  <span className="door-a">→</span>
                </Link>
              </div>

              <div className="demo-box">
                <div className="demo-label">
                  <Bi en="Proof you can touch — ask a Saudi GPU right now" ar="دليل تلمسه بيدك — اسأل معالجاً سعودياً الآن" />
                </div>
                <div className="demo-row">
                  <input
                    value={demoQ}
                    onChange={(e) => setDemoQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') askDemo() }}
                    maxLength={280}
                    placeholder={lang === 'ar' ? 'اسأل أي شيء — بالعربية أو الإنجليزية…' : 'Ask anything — Arabic or English…'}
                    aria-label={lang === 'ar' ? 'سؤال التجربة الحية' : 'Live demo question'}
                  />
                  <button type="button" onClick={askDemo} disabled={demoState === 'busy'}>
                    {demoState === 'busy'
                      ? <Bi en="GPU thinking…" ar="المعالج يفكر…" />
                      : <Bi en="Ask →" ar="اسأل ←" />}
                  </button>
                </div>
                {demoState === 'done' && (
                  <div className="demo-out">
                    <p dir="auto">{demoTyped}</p>
                    {demoMeta && (
                      <span className="demo-chain" dir="ltr">
                        {demoMeta.model} · 🇸🇦 verified GPU · probe ✓ → inference ✓ → served
                      </span>
                    )}
                  </div>
                )}
                {demoState === 'down' && (
                  <div className="demo-out">
                    <p><Bi en="No live capacity free for the demo right now — that's the honest state." ar="لا توجد سعة حية متاحة للتجربة الآن — هذه هي الحالة الصادقة." /> <Link href="/status"><Bi en="Check /status →" ar="راجع الحالة ←" /></Link></p>
                  </div>
                )}
              </div>
              <div className="res-row">
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> <span><Bi en="Inference · KSA" ar="الاستدلال · المملكة" /></span>
                </span>
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> <span><Bi en="Agents · KSA" ar="الوكلاء · المملكة" /></span>
                </span>
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> <span><Bi en="GPUs · KSA" ar="معالجات · المملكة" /></span>
                </span>
                <span className="residency-badge cross">
                  <span className="flag">🌐</span> <span><Bi en="Frontier · opt-in only" ar="متقدم · بإذن فقط" /></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="hiw">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ How it works" ar="§ كيف يعمل" />
            </span>
            <span>
              <Bi en="Arabic in · Arabic out · round-trip" ar="عربية دخولاً · عربية خروجاً · دورة كاملة" />
            </span>
          </div>

          <div className="hiw-brand">
            <span className="hiw-wm">
              DCP<em>∞</em>
            </span>
            <span className="hiw-tag">
              {lang === 'ar' ? (
                <>
                  ذكاء عربي سيادي · <em>مبني في المملكة</em>
                </>
              ) : (
                <>
                  Sovereign Arabic AI · <em>built in the Kingdom</em>
                </>
              )}
            </span>
          </div>

          {/* Sovereignty boundary — the round-trip never crosses the border.
              Replaces the old 6-stage flow (which read as a translation
              pipeline). The plumbing lives on /v2/architecture. */}
          <div className="sov">
            <div className="sov-border">
              <span className="sov-border-tag">
                <Bi en="🇸🇦 Saudi Arabia · data does not cross this line" ar="🇸🇦 المملكة العربية السعودية · البيانات لا تتجاوز هذا الحد" />
              </span>
              <div className="sov-loop">
                <div className="sov-node">
                  <span className="sov-k"><Bi en="you send" ar="أنت ترسل" /></span>
                  <b><Bi en="Your Arabic prompt" ar="سؤالك بالعربية" /></b>
                </div>
                <span className="sov-arc" aria-hidden="true">→</span>
                <div className="sov-node sov-gpu">
                  <span className="sov-k sov-k-teal"><Bi en="verified · in-Kingdom" ar="متحقق · داخل المملكة" /></span>
                  <b><Bi en="A Saudi GPU answers" ar="معالج سعودي يجيب" /></b>
                </div>
                <span className="sov-arc" aria-hidden="true">→</span>
                <div className="sov-node">
                  <span className="sov-k"><Bi en="you receive" ar="أنت تستلم" /></span>
                  <b><Bi en="Your Arabic answer" ar="إجابتك بالعربية" /></b>
                </div>
              </div>
            </div>
            <div className="sov-out" aria-hidden="true">
              <span className="sov-cut"><Bi en="never routed outside" ar="لا يُوجَّه للخارج أبداً" /></span>
              <span className="sov-ext">AWS</span>
              <span className="sov-ext">Azure</span>
              <span className="sov-ext">OpenRouter</span>
            </div>
          </div>

          <p className="hiw-foot">
            {lang === 'ar' ? (
              <>
                سؤالك وإجابته يبقيان <b>داخل المملكة</b> — على معالج متحقق، لا على سحابة أجنبية. النماذج المتقدمة عبر الحدود متاحة <b>بإذن صريح لكل عميل</b> فقط.{' '}
                <Link href="/v2/architecture"><Bi en="See the full architecture →" ar="اطّلع على البنية الكاملة ←" /></Link>
              </>
            ) : (
              <>
                Your prompt and its answer stay <b>inside the Kingdom</b> — on a verified GPU, never a foreign cloud. Cross-border frontier models are available by <b>explicit per-tenant opt-in</b> only.{' '}
                <Link href="/v2/architecture"><Bi en="See the full architecture →" ar="اطّلع على البنية الكاملة ←" /></Link>
              </>
            )}
          </p>
        </div>
      </section>

      {/* ═══════════════ MARKETPLACE ═══════════════ */}
      <section id="marketplace">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 01 · The GPU mesh · verified capacity" ar="§ ٠١ · شبكة المعالجات · سعة متحققة" />
            </span>
            <span>
              <Bi en="Where your requests actually run" ar="أين تعمل طلباتك فعلياً" />
            </span>
          </div>

          <div className="demand-v2">
            <div className="left">
              <div className="demand-label">
                <span>
                  <Bi
                    en="Capacity is published only after live provider verification"
                    ar="تُنشر السعة فقط بعد تحقق حي من المزوّد"
                  />
                </span>
                <b>
                  <Bi en="No simulated telemetry" ar="لا توجد قياسات مصطنعة" />
                </b>
              </div>
              <div className="demand-bar" aria-label={lang === 'ar' ? 'لا توجد سعة منشورة حتى يجتاز مزوّد حي فحوصات التحقق' : 'No published capacity until a live provider passes verification'}>
                <span id="verified-capacity-bar" style={{ transform: `scaleX(${live ? Math.min(1, live.serving / Math.max(live.online, 1)) : 0})`, transformOrigin: 'left', transition: 'transform .6s cubic-bezier(.16,1,.3,1)' }} />
              </div>
            </div>
            <div className="right">
              <span>
                <Bi en="Live availability" ar="التوفر الحي" />
              </span>
              <br />
              <b>
                {live
                  ? <Bi en="Verified live" ar="متحقق حياً" />
                  : <Bi en="Gated by /status" ar="محكوم عبر /status" />}
              </b>
            </div>
          </div>

          {(() => {
            const served = (catalog ?? []).filter((m) => m.available)
            return (
              <div className="mp-live">
                <div className="mp-live-head">
                  <span><Bi en="Serving right now — live from /v1/models" ar="يُخدم الآن — مباشرة من الكتالوج" /></span>
                  <span>
                    {catalog
                      ? (lang === 'ar'
                          ? `${served.length} متاح من ${catalog.length} في الكتالوج`
                          : `${served.length} available of ${catalog.length} catalog models`)
                      : <Bi en="querying…" ar="جارٍ الاستعلام…" />}
                  </span>
                </div>
                {served.length > 0 ? (
                  <div className="mp-rows">
                    <div className="mp-row mp-row-head" aria-hidden="true">
                      <span><Bi en="Model" ar="النموذج" /></span>
                      <span><Bi en="Context" ar="السياق" /></span>
                      <span><Bi en="Quant" ar="التكميم" /></span>
                      <span><Bi en="SAR / 1M tokens" ar="ريال / مليون رمز" /></span>
                    </div>
                    {served.slice(0, 8).map((m) => (
                      <div className="mp-row" key={m.id}>
                        <span className="mp-model"><b>{m.name || m.id}</b><i dir="ltr">{m.id}</i></span>
                        <span>{m.context_length ? `${Math.round(m.context_length / 1024)}K` : '—'}</span>
                        <span>{m.quantization || '—'}</span>
                        <span>{fmtMpPrice(m)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mp-empty">
                    <span>
                      <Bi
                        en="No verified capacity is serving right now, so nothing is listed. That is the honest state — not an error."
                        ar="لا توجد سعة متحققة تعمل الآن، لذلك لا يُعرض شيء. هذه هي الحالة الصادقة — وليست خطأ."
                      />
                    </span>
                    <Link href="/status"><Bi en="Watch live status →" ar="تابع الحالة الحية ←" /></Link>
                  </div>
                )}
                <div className="mp-live-head" style={{ borderTop: '1px solid var(--hair)', borderBottom: 0 }}>
              <span>
                <Bi en="Prefer the whole card? RTX-class · 24 GB · dedicated — rent it by the minute, in SAR" ar="تفضّل البطاقة كاملة؟ فئة RTX · ٢٤ جيجابايت · مخصصة — استأجرها بالدقيقة، بالريال" />
              </span>
                  <Link href="/v2/containers"><Bi en="Launch a pod →" ar="شغّل حاوية ←" /></Link>
                </div>
              </div>
            )
          })()}

          {/* GPU types available to rent — the whole-card counterpart to the
              models-for-inference table above. Type + VRAM + Available only;
              no machine names, no node counts. */}
          <div className="mp-live-head" style={{ border: 0, padding: '0 0 12px' }}>
            <span><Bi en="And these whole GPUs — available to rent right now" ar="وهذه المعالجات الكاملة — متاحة للإيجار الآن" /></span>
            <Link href="/v2/renter/pods"><Bi en="Open the launch console →" ar="افتح وحدة الإطلاق ←" /></Link>
          </div>
          <GpuAvailability variant="home" showHeading={false} />

          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label">
                <Bi en="What the public marketplace means" ar="ما معنى السوق العام" />
              </span>
              <h3>
                <Bi
                  en="No provider is listed until the inference path itself is proven."
                  ar="لا يظهر أي مزوّد حتى يتم إثبات مسار الاستدلال نفسه."
                />
              </h3>
              <p>
                <Bi
                  en="Most GPU lists are typed in by hand — and go stale. This one cannot be typed in: a machine appears only after our backend has reached it, asked it a real question, and verified the answer. The moment any check fails, the machine disappears from the list instead of rotting on it."
                  ar="معظم قوائم المعالجات تُكتب يدوياً — ثم تتقادم. هذه القائمة لا يمكن كتابتها يدوياً: لا يظهر الجهاز إلا بعد أن تصل إليه خلفيتنا وتسأله سؤالاً حقيقياً وتتحقق من الإجابة. ولحظة فشل أي فحص، يختفي الجهاز من القائمة بدلاً من أن يتعفن عليها."
                />
              </p>
            </div>
            <div className="capacity-gates" aria-label={lang === 'ar' ? 'بوابات السعة المنشورة' : 'Published capacity gates'}>
              {CAPACITY_GATES.map((gate, index) => (
                <div className="capacity-gate" key={gate.k}>
                  <span className="gate-n">{String(index + 1).padStart(2, '0')}</span>
                  <span className="gate-t"><Bi en={gate.tEn} ar={gate.tAr} /> <i className="gate-k-inline" dir="ltr">{gate.k}</i></span>
                  <p><Bi en={gate.en} ar={gate.ar} /></p>
                </div>
              ))}
            </div>
          </div>
          <div className="mp-foot">
            <span>
              <Bi
                en="If those checks fail, the right public state is empty capacity plus a route to status, not a stale GPU list."
                ar="إذا فشلت هذه الفحوصات، فالحالة العامة الصحيحة هي سعة فارغة مع رابط للحالة، وليست قائمة معالجات قديمة."
              />
            </span>
            <Link href="/status">
              <Bi en="Check live status →" ar="تحقق من الحالة الحية ←" />
            </Link>
          </div>

          <div className="callout" style={{ marginTop: 32 }}>
            {lang === 'ar' ? (
              <>
                <b>رموز للإجابات — أو المعالج كاملاً للتحكم.</b> بوابات السعة أعلاه تحكم الاستدلال الحقيقي. إن أردت حوسبة خام، فحاويات GPU في القسم التالي. وإن أردت تشغيل جهازك كمزوّد، فابدأ من مسار المزوّد.
              </>
            ) : (
              <>
                <b>Tokens for answers — or the whole GPU for control.</b> The capacity gates above govern real inference. If you want raw compute instead, GPU pods are one section down. And if you want to bring hardware as a provider, start with the provider path.
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════ THREE LAYERS ═══════════════ */}
      {/* ═══════════════ COMPUTE PODS ═══════════════ */}
      <section id="compute">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 02 · Raw compute · GPU pods" ar="§ ٠٢ · حوسبة خام · حاويات GPU" />
            </span>
            <span>
              <Bi en="The second product · whole GPUs, not slices" ar="المنتج الثاني · معالجات كاملة، لا شرائح" />
            </span>
          </div>

          <div className="capacity-truth" style={{ marginBottom: 24 }}>
            <div className="capacity-copy">
              <span className="truth-label">
                <Bi en="Inference and raw compute" ar="الاستدلال والحوسبة الخام" />
              </span>
              <h3>
                <Bi
                  en="Buy tokens when you want answers. Rent the whole GPU when you want control."
                  ar="اشترِ الرموز عندما تريد إجابات. استأجر المعالج كاملاً عندما تريد التحكم."
                />
              </h3>
              <p>
                <Bi
                  en="A DCP pod is a dedicated GPU container on the same verified mesh: pick an image, get Jupyter over TLS and root SSH in about a minute, train or fine-tune, tear it down. The same health gates that protect inference decide which machines may host your pod."
                  ar="حاوية DCP هي حاوية GPU مخصصة على الشبكة المتحققة نفسها: اختر صورة، واحصل على Jupyter عبر TLS و SSH جذري خلال دقيقة تقريباً، درّب أو خصّص نموذجك، ثم أوقفها. نفس بوابات الصحة التي تحمي الاستدلال تقرر أي الأجهزة يمكنها استضافة حاويتك."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn" href="/v2/renter/pods">
                  <Bi en="Launch a pod →" ar="شغّل حاوية ←" />
                </Link>
                <Link className="btn ghost" href="/v2/containers">
                  <Bi en="Technical brief — send it to your CTO" ar="الموجز التقني — أرسله لمديرك التقني" />
                </Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Why rent a DCP pod">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">zero_setup · jupyter + root_ssh ≤ 60s</span>
                <p><Bi
                  en="From idea to training in about a minute. Open Jupyter in your browser or SSH straight in — nothing to install, no ticket queue, no GPU waitlist."
                  ar="من الفكرة إلى التدريب خلال دقيقة تقريباً. افتح Jupyter في متصفحك أو ادخل مباشرة عبر SSH — لا شيء للتثبيت، ولا طابور تذاكر، ولا قائمة انتظار للمعالجات."
                /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">--gpus all · pinned driver</span>
                <p><Bi
                  en="The whole card is yours. No sharing, no throttling, no noisy neighbors — your benchmarks run at bare-metal speed and reproduce tomorrow, because we even freeze driver updates mid-rental."
                  ar="البطاقة كلها لك. لا مشاركة، ولا تقييد، ولا جيران مزعجين — تعمل اختباراتك بسرعة المعدن الخام وتتكرر نتائجها غداً، لأننا نجمّد حتى تحديثات التعريف أثناء الإيجار."
                /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">hard deadline · restart-proof reaper</span>
                <p><Bi
                  en="It ends when you said it ends. The host machine itself enforces your rental's deadline — even across crashes and reboots — so a forgotten pod can never squat a GPU or surprise you later."
                  ar="ينتهي عندما قلت أنت إنه ينتهي. الجهاز المضيف نفسه يفرض موعد نهاية إيجارك — حتى عبر الأعطال وإعادة التشغيل — فلا يمكن لحاوية منسية أن تحتل معالجاً أو تفاجئك لاحقاً."
                /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">wireguard mesh · live docker/cuda/nvml gates</span>
                <p><Bi
                  en="Verified Saudi machines only. Your pod lands exclusively on hardware that just passed live Docker, CUDA, and GPU-health probes — the same earned-online discipline behind our inference catalog. Your data stays in the Kingdom."
                  ar="أجهزة سعودية متحققة فقط. تهبط حاويتك حصرياً على عتاد اجتاز للتو فحوصات حية لـ Docker و CUDA وصحة المعالج — نفس انضباط «الاتصال المُكتسب» وراء كتالوج الاستدلال لدينا. بياناتك تبقى داخل المملكة."
                /></p>
              </div>
            </div>
          </div>

          <div className="mp-foot">
            <span>
              <Bi
                en="Same mesh, same verification, same KSA residency — applied to raw compute. Pods launch only on providers that pass live Docker + CUDA + GPU-health probes."
                ar="نفس الشبكة، نفس التحقق، نفس الإقامة داخل المملكة — مطبقة على الحوسبة الخام. تنطلق الحاويات فقط على مزوّدين اجتازوا فحوصات حية لـ Docker و CUDA وصحة المعالج."
              />
            </span>
            <Link href="/v2/renter/pods">
              <Bi en="dcp pod create →" ar="dcp pod create ←" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ VISION ═══════════════ */}
      <section id="vision">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ The vision" ar="§ الرؤية" /></span>
            <span><Bi en="Why this is bigger than a GPU list" ar="لماذا هذا أكبر من قائمة معالجات" /></span>
          </div>
          <h2 className="vision-h">
            <Bi
              en="Every idle GPU in the Kingdom is a data center."
              ar="كل معالج خامل في المملكة هو مركز بيانات."
            />
          </h2>
          <p className="vision-p">
            <Bi
              en="Hyperscalers build walls around compute. We build rails between the GPUs the Kingdom already owns — gaming rigs, workstations, university clusters — verify each one live, and put it to work serving Arabic-first AI and raw compute, paid in Riyal. The numbers below are the mesh as it exists this minute, not a projection."
              ar="السحابات الكبرى تبني جدراناً حول الحوسبة. نحن نمدّ السكك بين المعالجات التي تملكها المملكة أصلاً — أجهزة الألعاب ومحطات العمل وعناقيد الجامعات — نتحقق من كل واحدة مباشرةً، ونشغّلها لخدمة ذكاء اصطناعي عربي أولاً وحوسبة خام، بالريال. الأرقام أدناه هي الشبكة كما هي في هذه الدقيقة، لا توقّعاً."
            />
          </p>
          <div className="vision-live" dir="ltr">
            <div><b>{gpuTypeCount !== null ? gpuTypeCount : '—'}</b><span><Bi en="GPU types available to rent" ar="أنواع معالجات متاحة للإيجار" /></span></div>
            <div><b>{catalog ? catalog.filter((m) => m.available).length : '—'}</b><span><Bi en="models serving this minute" ar="نماذج تخدم هذه الدقيقة" /></span></div>
            <div><b>{catalog ? catalog.length : '—'}</b><span><Bi en="models in the catalog" ar="نموذجاً في الكتالوج" /></span></div>
            <div><b>2</b><span><Bi en="products: tokens + whole GPUs" ar="منتجان: رموز ومعالجات كاملة" /></span></div>
          </div>
          <div className="mg-grid" style={{ marginTop: 24 }}>
            <div className="mg">
              <span className="org"><Bi en="NOW · live today" ar="الآن · يعمل اليوم" /></span>
              <h4 className="nm"><Bi en="The verified mesh" ar="الشبكة المتحققة" /></h4>
              <p><Bi en="WireGuard-meshed providers, earned-online catalog, token billing in SAR, interactive GPU pods, Arabic-first models." ar="مزوّدون عبر WireGuard، كتالوج بالاتصال المُكتسب، فوترة بالرمز بالريال، حاويات GPU تفاعلية، نماذج عربية أولاً." /></p>
            </div>
            <div className="mg">
              <span className="org"><Bi en="NEXT · building now" ar="التالي · قيد البناء" /></span>
              <h4 className="nm"><Bi en="Production hardening" ar="تقوية الإنتاج" /></h4>
              <p><Bi en="Pod billing by the minute in SAR, VM-grade isolation (gVisor), card payments switched on, a larger verified fleet." ar="فوترة الحاويات بالدقيقة بالريال، عزل بمستوى الأجهزة الافتراضية (gVisor)، تفعيل الدفع بالبطاقات، أسطول متحقق أكبر." /></p>
            </div>
            <div className="mg">
              <span className="org"><Bi en="THEN · the bet" ar="بعد ذلك · الرهان" /></span>
              <h4 className="nm"><Bi en="Sovereign AI at scale" ar="ذكاء سيادي على نطاق واسع" /></h4>
              <p><Bi en="ALLaM at scale, a datacenter tier, and the long tail of Saudi expert models — trained, served, and paid for inside the Kingdom." ar="ALLaM على نطاق واسع، وفئة مراكز البيانات، وسلسلة النماذج السعودية المتخصصة — تُدرَّب وتُخدَّم وتُدفع داخل المملكة." /></p>
            </div>
          </div>
        </div>
      </section>

      <section id="residency">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 03 · Three layers, one runtime" ar="§ ٠٣ · ثلاث طبقات، بيئة تشغيل واحدة" />
            </span>
            <span>
              <Bi en="Inference · Agents · Sovereignty" ar="استدلال · وكلاء · سيادة" />
            </span>
          </div>
          <div className="layers">
            <div className="layer">
              <span className="n">
                <Bi en="01 · Inference" ar="٠١ · استدلال" />
              </span>
              <h3>
                <Bi en="One API. Per-million-token billing." ar="واجهة برمجة واحدة. فوترة لكل مليون رمز." />
              </h3>
              <p>
                <Bi
                  en="OpenAI-compatible chat, embedding, and rerank endpoints, served from KSA-resident GPUs. Arabic-first, open-source model lineup. Frontier models stay off unless you opt in."
                  ar="نقاط نهاية محادثة وتضمين وإعادة ترتيب متوافقة مع OpenAI، تعمل على معالجات داخل المملكة. باقة نماذج مفتوحة عربية أولاً. النماذج المتقدمة تبقى مغلقة حتّى تفتحها."
                />
              </p>
              <ul>
                <li><Bi en="OpenAI SDK · no rewrite needed" ar="SDK OpenAI · بلا إعادة كتابة" /></li>
                <li><Bi en="Streaming · function calling · JSON mode" ar="بثّ · استدعاء دوال · JSON" /></li>
                <li><Bi en="Halala-grained billing · SAR + USDC" ar="فوترة بالهللة · ريال + USDC" /></li>
              </ul>
              <div className="end">
                <span>api.dcp.sa / v1</span>
                <a href="#pricing">
                  <Bi en="See rates →" ar="عرض الأسعار ←" />
                </a>
              </div>
            </div>
            <div className="layer">
              <span className="n">
                <Bi en="02 · Agents" ar="٠٢ · وكلاء" />
              </span>
              <h3>
                {lang === 'ar' ? (
                  <>
                    DCP-Agent. <em>جاهز للمنشآت.</em>
                  </>
                ) : (
                  <>
                    DCP-Agent. <em>Live for SMB.</em>
                  </>
                )}
              </h3>
              <p>
                {lang === 'ar' ? (
                  <>
                    وكيل الذكاء العربي للمنشآت السعودية الصغيرة والمتوسطة. جاهز وفي الإنتاج على <b>agents.dcp.sa</b>. والنسخة الشخصية المجانية لكل مواطن سعودي قريباً.
                  </>
                ) : (
                  <>
                    The Arabic AI agent for Saudi small &amp; mid-size businesses. Already in production at <b>agents.dcp.sa</b>. Free personal version for every Saudi is coming.
                  </>
                )}
              </p>
              <div className="end">
                <span>agents.dcp.sa</span>
                <a href="https://agents.dcp.sa">
                  <Bi en="Visit →" ar="زر ←" />
                </a>
              </div>
            </div>
            <div className="layer">
              <span className="n">
                <Bi en="03 · Providers" ar="٠٣ · مزوّدون" />
              </span>
              <h3>
                {lang === 'ar' ? (
                  <>
                    اكسب ريالاً من <em>معالجك.</em>
                  </>
                ) : (
                  <>
                    Earn SAR with <em>your GPU.</em>
                  </>
                )}
              </h3>
              <p>
                <Bi
                  en="A 4 MB desktop app for Windows, macOS Apple Silicon, and Linux. Auto-detects your GPU, installs the inference engine (Ollama or MLX), downloads a model, and reports measured throughput after verification. Joins a self-hosted WireGuard mesh — no port forwarding."
                  ar="تطبيق سطح مكتب بحجم ٤ ميغابايت لـWindows وmacOS Apple Silicon وLinux. يكتشف المعالج تلقائياً، ويصب محرّك الاستدلال (Ollama أو MLX)، وينزّل نموذجاً، ويعرض السرعة المقاسة بعد التحقق. ينضم إلى شبكة WireGuard ذاتية الاستضافة — دون فتح منافذ."
                />
              </p>
              <ul>
                <li><Bi en="Windows · macOS Apple Silicon · Linux" ar="Windows · macOS Apple Silicon · Linux" /></li>
                <li><Bi en="4 MB app · zero config · WireGuard mesh" ar="٤ ميغابايت · بلا إعداد · شبكة WireGuard" /></li>
                <li><Bi en="85% provider · 15% platform · monthly SAR payout" ar="٨٥٪ للمزوّد · ١٥٪ للمنصّة · دفع شهري بالريال" /></li>
              </ul>
              <div className="end">
                <span>dcp.sa / v2 / provider-setup</span>
                <Link href="/v2/provider-setup">
                  <Bi en="Register a GPU →" ar="سجّل معالجاً ←" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ QUICK START ═══════════════ */}
      <section id="quickstart">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 04 · Quick start" ar="§ ٠٤ · البدء السريع" />
            </span>
            <span>
              <Bi en="cURL · CLI · Python SDK" ar="cURL · CLI · Python SDK" />
            </span>
          </div>

          <div className="qs-wrap">
            <div className="qs-left">
              <h2 className="st">
                {lang === 'ar' ? (
                  <>
                    ثلاثة أسطر من <em>الصفر</em> إلى إجابة عربية.
                  </>
                ) : (
                  <>
                    Three lines from <em>nothing</em> to an Arabic answer.
                  </>
                )}
              </h2>
              <p className="ss">
                {lang === 'ar' ? (
                  <>
                    استخدم SDK OpenAI كما هو — تغيّر فقط الرابط الأساسي والمفتاح. واجهة سطر الأوامر <code>dcp</code> تأتي بأمر استدلال مباشر وإعدادات لكل مستأجر. مكتبات Python وNode غلاف رقيق يمكن استبداله بـOpenAI في أي وقت.
                  </>
                ) : (
                  <>
                    Drop your existing OpenAI SDK in — only the base URL and key change. The official <code>dcp</code> CLI ships with a one-shot inference command and per-tenant config. Python and Node SDKs are thin wrappers; you can swap in for OpenAI&rsquo;s any time.
                  </>
                )}
              </p>
              <div className="stamps">
                <span className="stamp"><Bi en="OpenAI-compat · v1" ar="متوافق مع OpenAI · v1" /></span>
                <span className="stamp"><Bi en="Streaming · SSE" ar="بثّ · SSE" /></span>
                <span className="stamp"><Bi en="Function calling" ar="استدعاء دوال" /></span>
                <span className="stamp"><Bi en="JSON mode" ar="وضع JSON" /></span>
                <span className="stamp"><Bi en="200k context · frontier" ar="سياق ٢٠٠ ألف · متقدم" /></span>
              </div>
              <div style={{ marginTop: 30, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn ghost" href="/v2/docs">
                  <Bi en="Read the API docs →" ar="اقرأ توثيق الواجهة ←" />
                </Link>
                <Link className="btn ghost" href="/v2/setup">
                  <Bi en="Get your API key" ar="احصل على مفتاحك" />
                </Link>
              </div>
            </div>

            <div className="qs-card">
              <div className="qs-tabs">
                <button type="button" className={qsTab === 'curl' ? 'on' : undefined} onClick={() => setQsTab('curl')}>
                  cURL
                </button>
                <button type="button" className={qsTab === 'cli' ? 'on' : undefined} onClick={() => setQsTab('cli')}>
                  CLI · dcp
                </button>
                <button type="button" className={qsTab === 'py' ? 'on' : undefined} onClick={() => setQsTab('py')}>
                  Python
                </button>
                <button type="button" className={qsTab === 'js' ? 'on' : undefined} onClick={() => setQsTab('js')}>
                  Node
                </button>
                <div className="spacer" />
                <button
                  type="button"
                  className={copied ? 'copy done' : 'copy'}
                  id="copy-btn"
                  onClick={copyCode}
                >
                  {copied ? (lang === 'ar' ? 'نُسخ ✓' : 'Copied ✓') : lang === 'ar' ? 'نسخ' : 'Copy'}
                </button>
              </div>

              <div className={qsTab === 'curl' ? 'qs-body on' : 'qs-body'} data-tab="curl">
                <pre ref={qsTab === 'curl' ? codeRef : undefined}>
                  <span className="com"># Arabic chat completion · OpenAI-compatible · KSA-resident</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">curl</span> <span className="grad">https://api.dcp.sa/v1/chat/completions</span> \{'\n'}
                  {'  '}<span className="key">-H</span> <span className="str">&quot;Authorization: Bearer $DCP_KEY&quot;</span> \{'\n'}
                  {'  '}<span className="key">-H</span> <span className="str">&quot;Content-Type: application/json&quot;</span> \{'\n'}
                  {'  '}<span className="key">-d</span> <span className="str">{`'{
    "model": "qwen3-4b",
    "stream": true,
    "messages": [
      { "role": "user",
        "content": "ما حكم زكاة الراتب الشهري إذا لم يبلغ النصاب إلا بعد جمعه لسنة؟" }
    ]
  }'`}</span>
                  {'\n\n'}
                  <span className="com">{`# → streams Arabic answer with cited sources (verifier-checked)
# → settled in halala against your wallet at end of stream`}</span>
                </pre>
              </div>

              <div className={qsTab === 'cli' ? 'qs-body on' : 'qs-body'} data-tab="cli">
                <pre ref={qsTab === 'cli' ? codeRef : undefined}>
                  <span className="com"># One-line install · macOS · Linux · Windows</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">npm</span> install <span className="key">-g</span> <span className="str">@dcp/cli</span>
                  {'\n\n'}
                  <span className="com"># Authenticate once · stores key in ~/.dcprc (encrypted at rest)</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">dcp</span> login{'\n'}
                  {'  '}<span className="grad">→ Opens console.dcp.sa to fetch a tenant-scoped key</span>
                  {'\n\n'}
                  <span className="com"># Run inference · streams Arabic answer to stdout</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">dcp</span> run <span className="str">&quot;ما حكم زكاة الراتب الشهري؟&quot;</span> \{'\n'}
                  {'        '}<span className="key">--model</span> qwen3-4b \{'\n'}
                  {'        '}<span className="key">--cite</span>
                  {'\n\n'}
                  <span className="com"># Pin sovereign-only · frontier blocked even if router prefers it</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">dcp</span> config set sovereign_only=<span className="num">true</span>
                  {'\n\n'}
                  <span className="com"># Show last 24h spend · per-model breakdown</span>
                  {'\n'}
                  <span className="pmt">$</span> <span className="fn">dcp</span> usage <span className="key">--since</span> 24h
                </pre>
              </div>

              <div className={qsTab === 'py' ? 'qs-body on' : 'qs-body'} data-tab="py">
                <pre ref={qsTab === 'py' ? codeRef : undefined}>
                  <span className="com"># pip install openai · standard OpenAI SDK works as-is</span>
                  {'\n'}
                  <span className="key">import</span> os{'\n'}
                  <span className="key">from</span> openai <span className="key">import</span> OpenAI
                  {'\n\n'}
                  client = OpenAI({'\n'}
                  {'    '}base_url=<span className="str">&quot;https://api.dcp.sa/v1&quot;</span>,{'\n'}
                  {'    '}api_key=os.environ[<span className="str">&quot;DCP_KEY&quot;</span>],{'\n'}
                  )
                  {'\n\n'}
                  stream = client.chat.completions.create({'\n'}
                  {'    '}model=<span className="str">&quot;qwen3-4b&quot;</span>,{'\n'}
                  {'    '}messages=[{'{'}{'\n'}
                  {'        '}<span className="str">&quot;role&quot;</span>: <span className="str">&quot;user&quot;</span>,{'\n'}
                  {'        '}<span className="str">&quot;content&quot;</span>: <span className="str">&quot;ما حكم زكاة الراتب الشهري؟&quot;</span>,{'\n'}
                  {'    '}{'}'}],{'\n'}
                  {'    '}stream=<span className="key">True</span>,{'\n'}
                  {'    '}extra_body={'{'}<span className="str">&quot;cite&quot;</span>: <span className="key">True</span>, <span className="str">&quot;sovereign_only&quot;</span>: <span className="key">True</span>{'}'},{'\n'}
                  )
                  {'\n\n'}
                  <span className="key">for</span> chunk <span className="key">in</span> stream:{'\n'}
                  {'    '}<span className="fn">print</span>(chunk.choices[<span className="num">0</span>].delta.content <span className="key">or</span> <span className="str">&quot;&quot;</span>, end=<span className="str">&quot;&quot;</span>, flush=<span className="key">True</span>)
                </pre>
              </div>

              <div className={qsTab === 'js' ? 'qs-body on' : 'qs-body'} data-tab="js">
                <pre ref={qsTab === 'js' ? codeRef : undefined}>
                  <span className="com">{'// npm install openai · standard OpenAI SDK works as-is'}</span>
                  {'\n'}
                  <span className="key">import</span> OpenAI <span className="key">from</span> <span className="str">&quot;openai&quot;</span>;
                  {'\n\n'}
                  <span className="key">const</span> client = <span className="key">new</span> OpenAI({'{'}{'\n'}
                  {'  '}baseURL: <span className="str">&quot;https://api.dcp.sa/v1&quot;</span>,{'\n'}
                  {'  '}apiKey:  process.env.DCP_KEY,{'\n'}
                  {'}'});
                  {'\n\n'}
                  <span className="key">const</span> stream = <span className="key">await</span> client.chat.completions.create({'{'}{'\n'}
                  {'  '}model: <span className="str">&quot;qwen3-4b&quot;</span>,{'\n'}
                  {'  '}messages: [{'{'}{'\n'}
                  {'    '}role:    <span className="str">&quot;user&quot;</span>,{'\n'}
                  {'    '}content: <span className="str">&quot;ما حكم زكاة الراتب الشهري؟&quot;</span>,{'\n'}
                  {'  '}{'}'}],{'\n'}
                  {'  '}stream: <span className="key">true</span>,{'\n'}
                  {'  // DCP extensions\n'}
                  {'  '}cite: <span className="key">true</span>,{'\n'}
                  {'  '}sovereign_only: <span className="key">true</span>,{'\n'}
                  {'}'});
                  {'\n\n'}
                  <span className="key">for await</span> (<span className="key">const</span> chunk <span className="key">of</span> stream) {'{'}{'\n'}
                  {'  '}process.stdout.write(chunk.choices[<span className="num">0</span>]?.delta?.content ?? <span className="str">&quot;&quot;</span>);{'\n'}
                  {'}'}
                </pre>
              </div>

              <div className="qs-foot">
                <span>
                  <Bi
                    en="api.dcp.sa / v1 · OpenAI-compatible · Arabic-first default"
                    ar="api.dcp.sa / v1 · متوافق مع OpenAI · افتراضي عربي"
                  />
                </span>
                <Link href="/v2/docs">
                  <Bi en="Full reference →" ar="المرجع الكامل ←" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ MODELS ═══════════════ */}
      <section id="models">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 05 · Models we serve" ar="§ ٠٥ · النماذج التي نُقدّمها" />
            </span>
            <span>
              <Bi en="Sovereign by default · Frontier opt-in" ar="سيادي افتراضياً · متقدم بإذن" />
            </span>
          </div>

          <div className="mg-grid">
            <div className="mg">
              <span className="org">Saudi Data &amp; AI Authority</span>
              <h4 className="nm">ALLaM-7B-Q4</h4>
              <span className="tag">
                <Bi en="Arabic generation · 32k ctx" ar="توليد عربي · ٣٢ ألف سياق" />
              </span>
              <p>
                <Bi
                  en="Tuned for Modern Standard Arabic with Saudi domain context — Sharia, ZATCA, GoSi, business law, Tadawul filings."
                  ar="مُدرَّب على العربية الفصحى مع سياق سعودي مباشر — شريعة، ZATCA، تأمينات، نظام شركات، إفصاحات تداول."
                />
              </p>
              <div className="badge-row">
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> KSA
                </span>
              </div>
              <div className="meta">
                <span><Bi en="Pricing on serving" ar="السعر عند التشغيل" /></span>
                <span><Bi en="registered · not yet online" ar="مُسجَّل · غير متصل بعد" /></span>
              </div>
            </div>


            <div className="mg frontier">
              <span className="org">DeepSeek · cross-border</span>
              <h4 className="nm">DeepSeek V4 Flash</h4>
              <span className="tag">
                <Bi en="Frontier · fast · 128k ctx" ar="متقدم · سريع · ١٢٨ ألف سياق" />
              </span>
              <p>
                <Bi
                  en="Frontier reasoning for hard cases. Off by default — opt-in per tenant, cross-border marker on every call, separate invoice line."
                  ar="استدلال متقدم للحالات الصعبة. مغلق افتراضياً — يُفعَّل لكل مستأجر، علامة خارج المملكة على كل استدعاء، وسطر فاتورة منفصل."
                />
              </p>
              <div className="badge-row">
                <span className="residency-badge cross">
                  <span className="flag">🌐</span> <span><Bi en="Cross-border · opt-in" ar="خارج · بإذن" /></span>
                </span>
              </div>
              <div className="meta">
                <span>
                  <b>SAR 1.10/M</b> in · <b>3.40/M</b> out
                </span>
                <span><Bi en="default off" ar="افتراضي مغلق" /></span>
              </div>
            </div>

            <div className="mg frontier">
              <span className="org">DeepSeek · cross-border</span>
              <h4 className="nm">DeepSeek V4 Pro</h4>
              <span className="tag">
                <Bi en="Frontier · max · 200k ctx" ar="متقدم · أقصى · ٢٠٠ ألف سياق" />
              </span>
              <p>
                <Bi
                  en="Top-tier reasoning, max context. For long-doc analysis, complex agent planning, advanced code generation. Cross-border, audit-tagged."
                  ar="أعلى مستوى استدلال وأقصى سياق. لتحليل الوثائق الطويلة، تخطيط الوكلاء المعقّد، توليد الكود المتقدم. خارج المملكة، مع وسم تدقيقي."
                />
              </p>
              <div className="badge-row">
                <span className="residency-badge cross">
                  <span className="flag">🌐</span> <span><Bi en="Cross-border · opt-in" ar="خارج · بإذن" /></span>
                </span>
              </div>
              <div className="meta">
                <span>
                  <b>SAR 4.20/M</b> in · <b>12.60/M</b> out
                </span>
                <span><Bi en="default off" ar="افتراضي مغلق" /></span>
              </div>
            </div>

            <div className="mg" style={{ background: 'var(--bg-2)', borderStyle: 'dashed' }}>
              <span className="org">
                <Bi en="On the roadmap" ar="في خارطة الطريق" />
              </span>
              <h4 className="nm">
                <Bi en="Arabic-first sovereign model · in evaluation" ar="نموذج عربي سيادي · قيد التقييم" />
              </h4>
              <span className="tag">
                <Bi en="Arabic generation · 64k ctx" ar="توليد عربي · ٦٤ ألف سياق" />
              </span>
              <p>
                <Bi
                  en="A bigger Arabic-first sovereign model is in evaluation. We&rsquo;ll bring it up alongside ALLaM as a router option once it&rsquo;s online."
                  ar="نموذج عربي سيادي أكبر قيد التقييم. سنُشغّله بجانب اللام كخيار في الموجّه عند توفّره."
                />
              </p>
              <div className="badge-row">
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> KSA · pilot
                </span>
              </div>
              <div className="meta">
                <span><Bi en="Pricing TBD" ar="السعر لاحقاً" /></span>
                <span><Bi en="join waitlist" ar="انضم للقائمة" /></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ DCP-AGENT — short pitch ═══════════════ */}
      <section id="agents">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 06 · DCP-Agent" ar="§ ٠٦ · DCP-Agent" />
            </span>
            <span>
              <Bi en="Live for SMB · agents.dcp.sa" ar="جاهز للمنشآت · agents.dcp.sa" />
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 56, alignItems: 'center' }} className="agents-mini">
            <div>
              <h2 className="st" style={{ marginTop: 0 }}>
                {lang === 'ar' ? (
                  <>
                    وكيل الذكاء العربي المصنوع <em>للأعمال السعودية.</em>
                  </>
                ) : (
                  <>
                    The Arabic AI agent built for <em>Saudi business.</em>
                  </>
                )}
              </h2>
              <p className="ss">
                {lang === 'ar' ? (
                  <>
                    DCP-Agent جاهز على <b>agents.dcp.sa</b> للمنشآت السعودية الصغيرة والمتوسطة. يعمل الوكيل بالعربية من البداية إلى النهاية — الردّ على العملاء، صياغة الوثائق، وإدارة مهام المكتب الخلفي. والنسخة الشخصية المجانية لكل مواطن سعودي قريباً.
                  </>
                ) : (
                  <>
                    DCP-Agent is live at <b>agents.dcp.sa</b> for Saudi small &amp; mid-size businesses. The agent works in Arabic end-to-end — reply to customers, draft documents, run back-office tasks. Free personal version for every Saudi is coming.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 30 }}>
                <a className="btn primary lg" href="https://agents.dcp.sa">
                  <Bi en="Open agents.dcp.sa →" ar="افتح agents.dcp.sa ←" />
                </a>
                <span
                  style={{
                    alignSelf: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                  }}
                >
                  <Bi en="Personal AI · waitlist soon" ar="الذكاء الشخصي · قائمة انتظار قريباً" />
                </span>
              </div>
            </div>

            <a href="https://agents.dcp.sa" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: 'linear-gradient(180deg, var(--paper) 0%, var(--bg-2) 100%)',
                  border: '1px solid var(--line)',
                  padding: '32px 32px 36px',
                  position: 'relative',
                  transition: 'transform .2s, box-shadow .2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '8px 8px 0 var(--ink)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                <span style={{ position: 'absolute', inset: '-1px -1px auto -1px', height: 2, background: 'var(--grad)' }} />
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'var(--teal)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'var(--teal)',
                      boxShadow: '0 0 0 3px color-mix(in oklab, var(--teal) 25%, transparent)',
                    }}
                  />
                  <span>
                    <Bi en="Live in production" ar="في الإنتاج" />
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 64,
                    lineHeight: '.9',
                    letterSpacing: '-.028em',
                    margin: '18px 0 8px',
                    color: 'var(--ink)',
                  }}
                >
                  agents.dcp.sa
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    letterSpacing: '.06em',
                    color: 'var(--mut)',
                    marginTop: 8,
                  }}
                >
                  <Bi en="Visit →" ar="زر ←" />
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════ ARABIC WEDGE ═══════════════ */}
      <section id="enterprise">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 07 · Arabic is the wedge" ar="§ ٠٧ · العربية هي الميزة" />
            </span>
            <span>
              <Bi en="Try it live →" ar="جرّبه مباشرة ←" />
            </span>
          </div>
          <div className="wedge">
            <div>
              <h2 className="st" style={{ marginTop: 0 }}>
                {lang === 'ar' ? (
                  <>
                    النماذج العامة تتحدث العربية <em>كالسائح.</em>
                  </>
                ) : (
                  <>
                    Generic models speak Arabic <em>like a tourist.</em>
                  </>
                )}
              </h2>
              <p className="ss">
                <Bi
                  en="ALLaM-7B was tuned on Modern Standard Arabic with Saudi domain context. The verifier hook is locked against an Arabic-negation regression test that runs on every commit. The combination is what banks and regulators actually need from Arabic AI."
                  ar="نموذج اللام دُرِّب على العربية الفصحى مع سياق سعودي مباشر. أداة التحقق محميّة باختبار منع تراجع للنفي العربي يعمل عند كل إيداع. هذا المزيج هو ما تحتاجه البنوك والجهات التنظيمية فعلاً من الذكاء العربي."
                />
              </p>
              <div style={{ marginTop: 28 }}>
                <Link className="btn primary" href="/v2/renter/playground">
                  <Bi en="Run an Arabic question →" ar="نفّذ سؤالاً عربياً ←" />
                </Link>
              </div>
            </div>
            <div className="wedge-q">
              <div className="lbl">
                <Bi en="Prompt · MSA" ar="السؤال · فصحى" />
              </div>
              <div className="q">ما حكم زكاة الراتب الشهري إذا لم يبلغ النصاب إلا بعد جمعه لسنة كاملة؟</div>
              <div className="a-lbl">
                <Bi en="Grounded · cited" ar="مُسند · موثّق" />
              </div>
              <div className="a">
                يجمع الراتب الشهري ويُحسب الحول من يوم بلوغ النصاب لا من يوم استلام أول راتب. إذا بلغ مجموع المدّخر النصاب وحال عليه الحول، وجبت فيه الزكاة بنسبة ٢٫٥٪ [١]. إن لم يبلغ النصاب فلا زكاة حتى بلوغه [٢].
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> <span><Bi en="Generation · KSA" ar="التوليد · المملكة" /></span>
                </span>
                <span className="residency-badge ksa">
                  <span className="flag">🇸🇦</span> <span><Bi en="Verified · 2 citations" ar="مُثبت · استشهادان" /></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ TWO-PATH REGISTRATION ═══════════════ */}
      <section id="register">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 08 · Two paths in" ar="§ ٠٨ · مساران للدخول" />
            </span>
            <span>
              <Bi en="Renter · or · Provider" ar="مستخدم · أو · مزوّد" />
            </span>
          </div>

          <div className="paths">
            {/* RENTER */}
            <div className="path">
              <span className="lbl">
                <Bi en="A · I want to use DCP" ar="A · أريد استخدام DCP" />
              </span>
              <h3>
                {lang === 'ar' ? (
                  <>
                    ابنِ بـ<em>الذكاء العربي.</em>
                  </>
                ) : (
                  <>
                    Build with <em>Arabic AI.</em>
                  </>
                )}
              </h3>
              <p className="desc">
                <Bi
                  en="For founders, banks, hospitals, regulators, agencies. You ship the product; we serve the inference and the agents. SAR billing, halala-grained, no rental contracts."
                  ar="للمؤسسين والبنوك والمستشفيات والجهات التنظيمية والوكالات. أنت تشحن المنتج؛ ونحن نقدّم الاستدلال والوكلاء. فوترة بالريال بدقة الهللة، بلا عقود إيجار."
                />
              </p>
              <ul className="steps">
                <li>
                  <span className="n">01</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>اشترك مجاناً</b> · بلا بطاقة، بلا حد أدنى. مستأجر ينشأ خلال أقل من ٣٠ ثانية.
                      </>
                    ) : (
                      <>
                        <b>Sign up free</b> · no card, no minimum. Tenant created in &lt; 30s.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">02</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>احصل على مفتاح API</b> في console.dcp.sa. ضعه في SDK OpenAI — يتغيّر فقط الرابط الأساسي.
                      </>
                    ) : (
                      <>
                        <b>Grab an API key</b> in console.dcp.sa. Drop it into your OpenAI SDK — only base URL changes.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">03</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>جرّب وضع السيادة فقط</b> إن كنت في قطاع منظّم — النماذج المتقدمة تبقى مغلقة، مجاناً.
                      </>
                    ) : (
                      <>
                        <b>Try sovereign-only</b> if you&rsquo;re regulated — frontier stays off, free.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">04</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>أنشئ وكلاء</b> من بيئة الاختبار أو عبر SDK الوكيل. ٥ شخصيين + ٣ مشاريع في فئة الفريق.
                      </>
                    ) : (
                      <>
                        <b>Spin up agents</b> from the Playground or via the agent SDK. 5 personal + 3 project on Team tier.
                      </>
                    )}
                  </span>
                </li>
              </ul>
              <div className="cta">
                <Link className="btn primary lg" href="/v2/setup">
                  <Bi en="Start free · no card →" ar="ابدأ مجاناً · بلا بطاقة ←" />
                </Link>
                <Link className="btn ghost" href="/v2/auth">
                  <Bi en="Sign in" ar="دخول" />
                </Link>
              </div>
              <div className="smallprint">
                <Bi
                  en="SAR + USDC accepted · mada · Apple Pay · bank transfer"
                  ar="ريال + USDC مقبول · مدى · Apple Pay · تحويل بنكي"
                />
              </div>
            </div>

            {/* PROVIDER */}
            <div className="path">
              <span className="lbl">
                <Bi en="B · I have idle GPUs" ar="B · لدي معالجات معطّلة" />
              </span>
              <h3>
                {lang === 'ar' ? (
                  <>
                    اكسب ريالاً من <em>عتادك.</em>
                  </>
                ) : (
                  <>
                    Earn SAR on <em>your hardware.</em>
                  </>
                )}
              </h3>
              <p className="desc">
                <Bi
                  en="For studios, labs, universities, family offices, anyone with consumer or workstation GPUs sitting idle. We handle orchestration, customers, and the SLA. Provider earnings use the published 85/15 platform split, paid monthly to a Saudi bank account."
                  ar="للاستوديوهات والمختبرات والجامعات والمكاتب العائلية وأي شخص لديه معالجات استهلاكية أو محطات عمل معطّلة. نتولّى التنسيق والعملاء والتزام الخدمة. تُحسب أرباح المزوّد وفق تقسيم ٨٥/١٥ المنشور، وتُدفع شهرياً إلى حساب بنكي سعودي."
                />
              </p>
              <ul className="steps">
                <li>
                  <span className="n">01</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>سجّل جهازك</b> — ملف العتاد، الذاكرة، المنطقة، السعة. موافقة خلال ٤٨ ساعة.
                      </>
                    ) : (
                      <>
                        <b>Submit your rig</b> — hardware profile, RAM, region, uplink. Approval inside 48h.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">02</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>ثبّت الوكيل</b> · أمر واحد على لينكس، ملف MSI واحد على ويندوز. عزل تلقائي عند العبث.
                      </>
                    ) : (
                      <>
                        <b>Install the agent</b> · one bash line on Linux, one MSI on Windows. Auto-quarantines on tamper.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">03</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>ابدأ تقديم الاستدلال</b> — يُمزَج العبء بين العملاء؛ ولن نتجاوز ٩٠٪ افتراضياً.
                      </>
                    ) : (
                      <>
                        <b>Start serving inference</b> — workload is mixed across customers; we won&rsquo;t saturate you past 90% by default.
                      </>
                    )}
                  </span>
                </li>
                <li>
                  <span className="n">04</span>
                  <span className="t">
                    {lang === 'ar' ? (
                      <>
                        <b>اقبض بالريال</b> · دفع شهري إلى بنكك، مع لوحة لكل جهاز توضّح الاستخدام والأخطاء والأرباح.
                      </>
                    ) : (
                      <>
                        <b>Get paid in SAR</b> · monthly payout to your bank, with a per-rig dashboard showing utilisation, errors, and earnings.
                      </>
                    )}
                  </span>
                </li>
              </ul>
              <div className="cta">
                <Link className="btn primary lg" href="/v2/provider-setup">
                  <Bi en="Apply as provider →" ar="تقدّم كمزوّد ←" />
                </Link>
                <Link className="btn ghost" href="/v2/provider/dashboard">
                  <Bi en="Provider dashboard" ar="لوحة المزوّد" />
                </Link>
              </div>
              <div className="smallprint">
                <Bi
                  en="85% provider share · monthly SAR payout · KSA bank account required"
                  ar="حصة المزوّد ٨٥٪ · دفع شهري بالريال · يتطلّب حساباً بنكياً سعودياً"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING SNAPSHOT ═══════════════ */}
      <section id="pricing">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 09 · Pricing at a glance" ar="§ ٠٩ · نظرة سريعة على الأسعار" />
            </span>
            <span>
              <Bi en="Full table + calculator on Pricing →" ar="الجدول الكامل + الحاسبة في الأسعار ←" />
            </span>
          </div>
          <div className="ps-grid">
            <div className="ps-it">
              <div className="nm">ALLaM-7B</div>
              <div className="pr" style={{ fontSize: 20 }}>
                <Bi en="Pricing on serving" ar="السعر عند التشغيل" />
              </div>
              <div className="sub">
                <Bi en="Arabic generation · sovereign · registered, not yet online" ar="توليد عربي · سيادي · مُسجَّل، غير متصل بعد" />
              </div>
            </div>
            <div className="ps-it frontier">
              <div className="nm">DeepSeek V4</div>
              <div className="pr">
                SAR 1.10<span className="u">/M in</span>
              </div>
              <div className="pr" style={{ fontSize: 24 }}>
                SAR 3.40<span className="u">/M out · flash</span>
              </div>
              <div className="sub">
                <Bi en="Frontier · cross-border · opt-in" ar="متقدم · خارج · بإذن" />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-2)', fontSize: 15 }}>
              {lang === 'ar' ? (
                <>
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>فئات الاشتراك</b> · المبتدئ ٣٧٥ ريال/شهر · النمو ١٬٥٠٠ ريال/شهر · المتسع ٥٬٦٢٥ ريال/شهر · مؤسسات حسب الطلب.
                </>
              ) : (
                <>
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>Subscription tiers</b> · Starter SAR 375/mo · Growth SAR 1,500/mo · Scale SAR 5,625/mo · Enterprise on request.
                </>
              )}
            </span>
            <a className="btn ghost" href="#pricing">
              <Bi en="See full pricing →" ar="عرض الأسعار كاملةً ←" />
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════ COMPLIANCE BAND ═══════════════ */}
      <section>
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 10 · Proof, not promises" ar="§ ١٠ · دليل، لا وعود" />
            </span>
            <span>
              <Bi en="Updated 2026-05-25" ar="آخر تحديث ٢٠٢٦-٠٥-٢٥" />
            </span>
          </div>
          <div className="compliance">
            <div className="item">
              <span className="k">PDPL</span>
              <span className="v"><Bi en="Aligned" ar="متوائم" /></span>
              <span className="sub"><Bi en="Saudi residency" ar="إقامة سعودية" /></span>
            </div>
            <div className="item">
              <span className="k"><Bi en="Settlement" ar="تسوية" /></span>
              <span className="v"><Bi en="In-Kingdom" ar="داخل المملكة" /></span>
              <span className="sub"><Bi en="Halala · SAR" ar="هللة · ريال" /></span>
            </div>
            <div className="item">
              <span className="k"><Bi en="Hosting" ar="الاستضافة" /></span>
              <span className="v"><Bi en="Self-hosted" ar="ذاتية الاستضافة" /></span>
              <span className="sub"><Bi en="In-Kingdom infrastructure" ar="بنية تحتية داخل المملكة" /></span>
            </div>
            <div className="item">
              <span className="k">ZATCA</span>
              <span className="v"><Bi en="VAT-registered" ar="مسجّل ضريبياً" /></span>
              <span className="sub">311102233400003</span>
            </div>
            <div className="item">
              <span className="k">CR</span>
              <span className="v">7053667775</span>
              <span className="sub"><Bi en="DC Power Solutions Co." ar="DC Power Solutions Co." /></span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ ENTERPRISE BAND ═══════════════ */}
      <section>
        <div className="wrap">
          <div className="ent">
            <span className="eyebrow">
              <Bi en="§ Enterprise" ar="§ المؤسسات" />
            </span>
            <h2>
              {lang === 'ar' ? (
                <>
                  شغّله <em>داخل شبكتك الخاصة.</em>
                </>
              ) : (
                <>
                  Run it <em>in your own VPC.</em>
                </>
              )}
            </h2>
            <p>
              <Bi
                en="For banks, hospitals, regulators, the bigger gov programmes. Bring your own keys, your own corpora, your own audit pipeline. We sign the DPA, the MSA, the data-flow appendix, and we sit on the call with your CISO."
                ar="للبنوك والمستشفيات والجهات التنظيمية والبرامج الحكومية الكبيرة. أحضر مفاتيحك ومراجعك وخط تدقيقك. نوقّع اتفاقية حماية البيانات، والاتفاقية الرئيسية، وملحق تدفّق البيانات، ونجلس على المكالمة مع مسؤول أمنكم."
              />
            </p>
            <ul>
              <li><Bi en="In-Kingdom settlement · SAR + halala" ar="تسوية داخل المملكة · ريال + هللة" /></li>
              <li><Bi en="Dedicated tenancy · isolated control plane" ar="استئجار مخصص · بيئة تحكم معزولة" /></li>
              <li><Bi en="Private peering · IPsec or DirectConnect" ar="ربط خاص · IPsec أو DirectConnect" /></li>
              <li><Bi en="Dedicated CSM · onboarding sprint" ar="مسؤول نجاح مخصص · جلسة إعداد" /></li>
              <li><Bi en="Customer data-classification workbook" ar="دفتر تصنيف بيانات خاص بالعميل" /></li>
              <li><Bi en="SLA per enterprise contract · credits + escalation path" ar="اتفاقية مستوى خدمة حسب عقد المؤسسة · أرصدة + مسار تصعيد" /></li>
            </ul>
            <div className="ctas">
              <Link className="btn primary lg" href="/support">
                <Bi en="Talk to sales →" ar="تواصل مع المبيعات ←" />
              </Link>
              <Link className="btn ghost lg" href="/trust-center">
                <Bi en="Compliance pack" ar="حزمة الامتثال" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ END CTA ═══════════════ */}
      <section className="home-end">
        <div className="wrap">
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            <Bi en="§ Ready when you are" ar="§ جاهزون عندما تكونون" />
          </span>
          <h2>
            {lang === 'ar' ? (
              <>
                ذكاء اصطناعي عربي سيادي. <em>شغّله.</em>
              </>
            ) : (
              <>
                Sovereign Arabic AI. <em>Run it.</em>
              </>
            )}
          </h2>
          <p>
            <Bi
              en="Eight minutes from this page to a ready renter workspace. First inference is enabled by the catalog only when a verified serving model is online. No procurement. No data-egress conversation. No flat GPU rental."
              ar="ثماني دقائق من هذه الصفحة إلى مساحة عمل جاهزة للمستأجر. يفتح الفهرس أول طلب استدلال فقط عندما يكون نموذج مخدوم ومتحقق متصلاً. بلا مشتريات، بلا نقاش حول خروج البيانات، بلا إيجار معالجات ثابت."
            />
          </p>
          <div className="ctas">
            <Link className="btn primary lg" href="/v2/setup">
              <Bi en="Start free · no card →" ar="ابدأ مجاناً · بلا بطاقة ←" />
            </Link>
            <Link className="btn ghost lg" href="/v2/renter/playground">
              <Bi en="Open playground" ar="افتح ساحة التجربة" />
            </Link>
            <Link className="btn ghost lg" href="/v2/provider-setup">
              <Bi en="Or apply as provider" ar="أو تقدّم كمزوّد" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ FOOTER SITEMAP ═══════════════ */}
      <footer className="site foot">
        <div className="foot-grid">
          <div>
            <div className="brand">
              DCP<i>∞</i>
            </div>
            <p className="desc">
              <Bi
                en="Sovereign Arabic AI — inference, agents, and a KSA GPU mesh. Built by DC Power Solutions Co., Riyadh."
                ar="ذكاء اصطناعي عربي سيادي — استدلال ووكلاء وشبكة معالجات داخل المملكة. من بناء DC Power Solutions Co.، الرياض."
              />
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> <span><Bi en="KSA-resident" ar="داخل المملكة" /></span>
              </span>
              <span className="residency-badge">
                <span className="flag">∞</span> <span><Bi en="agents.dcp.sa" ar="agents.dcp.sa" /></span>
              </span>
            </div>
          </div>

          <div>
            <h4><Bi en="Product" ar="المنتج" /></h4>
            <ul>
              <li><Link href="/v2/home"><Bi en="Overview" ar="نظرة عامة" /></Link></li>
              <li><a href="#marketplace"><Bi en="Marketplace" ar="السوق" /></a></li>
              <li><a href="#compute"><Bi en="GPU Pods" ar="حاويات GPU" /></a></li>
              <li><a href="#agents"><Bi en="Agents" ar="الوكلاء" /></a></li>
              <li><a href="#models"><Bi en="Models" ar="النماذج" /></a></li>
              <li><a href="#pricing"><Bi en="Pricing" ar="الأسعار" /></a></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Build" ar="البناء" /></h4>
            <ul>
              <li><Link href="/v2/docs"><Bi en="API docs" ar="توثيق الواجهة" /></Link></li>
              <li><a href="#quickstart"><Bi en="Quick start" ar="بدء سريع" /></a></li>
              <li><Link href="/v2/setup"><Bi en="Get an API key" ar="احصل على مفتاح" /></Link></li>
              <li><Link href="/v2/renter/playground"><Bi en="Playground" ar="بيئة الاختبار" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Renters" ar="المستخدمون" /></h4>
            <ul>
              <li><Link href="/v2/setup"><Bi en="Sign up" ar="اشترك" /></Link></li>
              <li><Link href="/v2/auth"><Bi en="Sign in" ar="دخول" /></Link></li>
              <li><Link href="/v2/renter/dashboard"><Bi en="Console" ar="لوحة التحكم" /></Link></li>
              <li><Link href="/v2/renter/usage"><Bi en="Usage" ar="الاستخدام" /></Link></li>
              <li><Link href="/v2/renter/wallet"><Bi en="Wallet" ar="المحفظة" /></Link></li>
              <li><Link href="/v2/renter/invoices"><Bi en="Invoices" ar="الفواتير" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Providers" ar="المزوّدون" /></h4>
            <ul>
              <li><Link href="/v2/provider/dashboard"><Bi en="Provider console" ar="لوحة المزوّد" /></Link></li>
              <li><Link href="/v2/provider/rigs"><Bi en="Rigs" ar="الأجهزة" /></Link></li>
              <li><Link href="/v2/provider/earnings"><Bi en="Earnings" ar="الأرباح" /></Link></li>
              <li><Link href="/v2/provider/payouts"><Bi en="Payouts" ar="المدفوعات" /></Link></li>
              <li><a href="#pricing"><Bi en="Tiers" ar="الفئات" /></a></li>
            </ul>
          </div>
        </div>

        <div className="foot-bottom">
          <span>§ DC Power Solutions Company · CR 7053667775 · VAT 311102233400003</span>
          <div className="badges">
            <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>PDPL</span>
            <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>KSA-resident</span>
            <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>ZATCA</span>
          </div>
          <span>© 2026 · Riyadh · KSA</span>
        </div>
      </footer>
    </div>
  )
}
