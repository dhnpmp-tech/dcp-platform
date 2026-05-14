'use client'

// DCP Homepage Redesign — ported from the Claude Design handover bundle.
//
// This component is the SINGLE SOURCE for the redesigned homepage. It is
// rendered by two routes:
//   /preview  → app/preview/page.tsx (design-review surface, unchanged)
//   /         → app/page.tsx (production landing, P1 migration)
//
// Keep the visual surface here. Page-level wrappers (analytics, metrics
// contract, role-intent persistence) live in app/page.tsx.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './preview.css'
import { marketplace, models, demoPrompts, demoResponses } from './data'
import type { ModelRow } from './data'
import { DCP_I18N, type PreviewLang, type PreviewStrings } from './i18n'

/* ────────────────────────────────────────────────────────────────────── */
/* Motion preference                                                      */
/* ────────────────────────────────────────────────────────────────────── */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener?.('change', handler)
    return () => mql.removeEventListener?.('change', handler)
  }, [])
  return reduced
}

/* ────────────────────────────────────────────────────────────────────── */
/* Language context                                                       */
/* ────────────────────────────────────────────────────────────────────── */

interface LangCtxShape {
  lang: PreviewLang
  t: PreviewStrings
  setLang: (l: PreviewLang) => void
}

const LangCtx = createContext<LangCtxShape>({
  lang: 'en',
  t: DCP_I18N.en,
  setLang: () => {},
})

function useLang() {
  return useContext(LangCtx)
}

/* ────────────────────────────────────────────────────────────────────── */
/* Number formatting                                                      */
/* ────────────────────────────────────────────────────────────────────── */

function fmt(n: number, lang: PreviewLang, opts: Intl.NumberFormatOptions = {}): string {
  const loc = lang === 'ar' ? 'ar-SA' : 'en-US'
  return new Intl.NumberFormat(loc, opts).format(n)
}
function fmtInt(n: number, lang: PreviewLang): string {
  return fmt(Math.round(n), lang)
}

/* ────────────────────────────────────────────────────────────────────── */
/* Inline icons                                                           */
/* ────────────────────────────────────────────────────────────────────── */

const Arrow = ({ size = 14, dir = 'right' as 'right' | 'left' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
const Play = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 5v14l12-7z" />
  </svg>
)
const Stop = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x={6} y={6} width={12} height={12} />
  </svg>
)

/* ────────────────────────────────────────────────────────────────────── */
/* Reveal (IntersectionObserver fade+rise)                                */
/* ────────────────────────────────────────────────────────────────────── */

function Reveal({
  delay = 0,
  as = 'div',
  className,
  style,
  children,
}: {
  delay?: number
  as?: keyof React.JSX.IntrinsicElements
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced) {
      el.style.opacity = '1'
      el.style.transform = 'none'
      return
    }
    el.style.opacity = '0'
    el.style.transform = 'translateY(18px)'
    el.style.transition = `opacity .9s cubic-bezier(.2,.7,.2,1) ${delay}ms, transform .9s cubic-bezier(.2,.7,.2,1) ${delay}ms`
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.style.opacity = '1'
          el.style.transform = 'none'
          io.unobserve(el)
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [delay, reduced])

  return React.createElement(
    as,
    { ref: ref as React.Ref<HTMLElement>, className, style },
    children,
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Magnetic button (cursor pull)                                          */
/* ────────────────────────────────────────────────────────────────────── */

function MagneticButton({
  children,
  strength = 0.22,
  className = '',
}: {
  children: React.ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const reduced = usePrefersReducedMotion()

  function onMove(e: React.MouseEvent) {
    if (reduced) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`
  }
  function onLeave() {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <span className={'magnet ' + className} onMouseMove={onMove} onMouseLeave={onLeave} ref={ref}>
      {children}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* HeroMap — animated Saudi node graph                                    */
/* ────────────────────────────────────────────────────────────────────── */

function HeroMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0

    function resize() {
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      w = r.width
      h = r.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    resize()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    interface Node {
      id: string
      x: number
      y: number
      r: number
      label: string
      primary?: boolean
    }
    const nodes: Node[] = [
      { id: 'ruh', x: 0.52, y: 0.54, r: 5.4, label: 'RUH', primary: true },
      { id: 'jed', x: 0.26, y: 0.62, r: 3.8, label: 'JED' },
      { id: 'dmm', x: 0.74, y: 0.42, r: 3.4, label: 'DMM' },
      { id: 'med', x: 0.34, y: 0.48, r: 2.6, label: 'MED' },
      { id: 'tuu', x: 0.22, y: 0.28, r: 2.4, label: 'TUU' },
      { id: 'neo', x: 0.12, y: 0.20, r: 2.8, label: 'NEOM' },
      { id: 'auh', x: 0.38, y: 0.82, r: 2.4, label: 'AHB' },
      { id: 'hgr', x: 0.82, y: 0.60, r: 2.0, label: 'HGR' },
      { id: 'yun', x: 0.30, y: 0.38, r: 2.0, label: 'YNB' },
      { id: 'qsm', x: 0.47, y: 0.38, r: 2.2, label: 'QSM' },
    ]

    const edges: [string, string][] = []
    for (const n of nodes) if (n.id !== 'ruh') edges.push(['ruh', n.id])
    edges.push(['jed', 'med'], ['jed', 'yun'], ['dmm', 'hgr'], ['tuu', 'neo'], ['qsm', 'ruh'])

    interface Arc {
      from: Node
      to: Node
      t: number
      life: number
      hue: 'teal' | 'orange'
    }
    const arcs: Arc[] = []
    function spawnArc() {
      const to = nodes[1 + Math.floor(Math.random() * (nodes.length - 1))]
      const from = nodes[0]
      arcs.push({
        from,
        to,
        t: 0,
        life: 1600 + Math.random() * 800,
        hue: Math.random() < 0.55 ? 'teal' : 'orange',
      })
      if (arcs.length > 8) arcs.shift()
    }

    let lastSpawn = 0
    let t0 = performance.now()
    let raf = 0

    const nx = (n: Node) => n.x * w
    const ny = (n: Node) => n.y * h

    function frame(t: number) {
      const dt = t - t0
      t0 = t
      if (t - lastSpawn > 900) {
        spawnArc()
        lastSpawn = t
      }
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)

      // Edges
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(120, 160, 180, 0.10)'
      for (const [a, b] of edges) {
        const na = nodes.find((n) => n.id === a)
        const nb = nodes.find((n) => n.id === b)
        if (!na || !nb) continue
        ctx.beginPath()
        ctx.moveTo(nx(na), ny(na))
        ctx.lineTo(nx(nb), ny(nb))
        ctx.stroke()
      }

      // Nodes + halo + ping
      for (const n of nodes) {
        const x = nx(n)
        const y = ny(n)
        ctx.fillStyle = n.primary ? 'rgba(45,212,182,0.16)' : 'rgba(200,200,220,0.08)'
        ctx.beginPath()
        ctx.arc(x, y, n.r * 3.2, 0, Math.PI * 2)
        ctx.fill()
        if (n.primary) {
          const pingT = (t / 1800) % 1
          ctx.strokeStyle = `rgba(45,212,182,${(1 - pingT) * 0.35})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x, y, n.r + pingT * 22, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = n.primary ? '#2dd4b6' : '#e8e3d6'
        ctx.beginPath()
        ctx.arc(x, y, n.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(200, 200, 220, 0.55)'
        ctx.font = "10px 'JetBrains Mono', monospace"
        ctx.fillText(n.label, x + n.r + 6, y + 3)
      }

      // Arcs
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]
        a.t += dt
        const p = a.t / a.life
        if (p >= 1) {
          arcs.splice(i, 1)
          continue
        }
        const x1 = nx(a.from)
        const y1 = ny(a.from)
        const x2 = nx(a.to)
        const y2 = ny(a.to)
        const cx = (x1 + x2) / 2
        const cy = Math.min(y1, y2) - Math.hypot(x2 - x1, y2 - y1) * 0.22

        ctx.strokeStyle =
          a.hue === 'teal'
            ? `rgba(45,212,182,${0.18 * (1 - Math.abs(p - 0.5) * 2)})`
            : `rgba(238,122,60,${0.18 * (1 - Math.abs(p - 0.5) * 2)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.quadraticCurveTo(cx, cy, x2, y2)
        ctx.stroke()

        const it = 1 - p
        const tx = it * it * x1 + 2 * it * p * cx + p * p * x2
        const ty = it * it * y1 + 2 * it * p * cy + p * p * y2
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 12)
        const col = a.hue === 'teal' ? '45,212,182' : '238,122,60'
        g.addColorStop(0, `rgba(${col}, 0.95)`)
        g.addColorStop(1, `rgba(${col}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(tx, ty, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = a.hue === 'teal' ? '#2dd4b6' : '#ee7a3c'
        ctx.beginPath()
        ctx.arc(tx, ty, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(frame)
    }

    if (!reduced) {
      raf = requestAnimationFrame(frame)
    } else {
      for (const n of nodes) {
        const x = nx(n)
        const y = ny(n)
        ctx.fillStyle = n.primary ? '#2dd4b6' : '#e8e3d6'
        ctx.beginPath()
        ctx.arc(x, y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const onResize = () => {
      resize()
      ctx.scale(dpr, dpr)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [reduced])

  return <canvas ref={canvasRef} className="hero-map-canvas" aria-hidden="true" />
}

/* ────────────────────────────────────────────────────────────────────── */
/* Sparkline                                                              */
/* ────────────────────────────────────────────────────────────────────── */

function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    el.width = r.width * dpr
    el.height = height * dpr
    el.style.height = height + 'px'
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const w = r.width
    const h = height
    if (!values || !values.length) return
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(0.0001, max - min)
    ctx.clearRect(0, 0, w, h)
    ctx.lineWidth = 1.4
    const stroke =
      getComputedStyle(document.documentElement).getPropertyValue('--teal').trim() || '#2dd4b6'
    ctx.strokeStyle = stroke
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - 2 - ((v - min) / range) * (h - 4)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    const ly = h - 2 - ((values[values.length - 1] - min) / range) * (h - 4)
    ctx.fillStyle = stroke
    ctx.beginPath()
    ctx.arc(w - 2, ly, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }, [values, height])
  return <canvas ref={ref} className="spark" />
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section helpers                                                        */
/* ────────────────────────────────────────────────────────────────────── */

function SectionMeta({ idx, label, right }: { idx: string; label: string; right?: string }) {
  return (
    <div className="section-meta">
      <span>
        <span className="idx">{idx}</span> · {label}
      </span>
      {right ? <span>{right}</span> : null}
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

/* ────────────────────────────────────────────────────────────────────── */
/* Marquee                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function Marquee() {
  const { t } = useLang()
  const words = t.marquee.split(' — ')
  return (
    <div className="marquee">
      <div className="marquee-in">
        {words.map((w, i) => (
          <span key={'a' + i}>{w}</span>
        ))}
        {words.map((w, i) => (
          <span key={'b' + i}>{w}</span>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Nav                                                                    */
/* ────────────────────────────────────────────────────────────────────── */

function Nav() {
  const { lang, setLang, t } = useLang()
  return (
    <header className="nav">
      <div className="nav-in">
        <a href="#" className="brand">
          <span className="brand-mark">
            {/* perf: explicit dims prevent CLS; eager + high fetchpriority
                because logo is in the nav above the fold. decoding=async
                keeps the main thread free during paint. */}
            <img
              src="/preview/dcp-logo-square.jpeg"
              alt="DCP"
              width={36}
              height={36}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </span>
          <span className="brand-name">DCP</span>
        </a>
        <nav className="nav-links">
          <a href="#marketplace">{t.nav.marketplace}</a>
          <a href="#api">{t.nav.platform}</a>
          <a href="#models">{t.nav.models}</a>
          <a href="#providers">{t.nav.providers}</a>
          <a href="#pricing">{t.nav.pricing}</a>
        </nav>
        <div className="nav-right">
          <span className="nav-status" title="Riyadh latency">
            <span className="d" />
            <span>RUH · 38ms</span>
          </span>
          <span className="lang-pill">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              EN
            </button>
            <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>
              ع
            </button>
          </span>
          <a className="btn ghost small" href="#">
            {t.nav.signin}
          </a>
          <MagneticButton>
            <a className="btn primary small" href="#">
              {t.nav.start} <Arrow size={12} />
            </a>
          </MagneticButton>
        </div>
      </div>
    </header>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Hero                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

function FeatureCard() {
  const { lang, t } = useLang()
  const en = lang !== 'ar'
  const rows = t.platform.rows
  return (
    <div className="ticker-card feat">
      <div className="tc-hd">
        <span className="live">
          <span className="d" />
          {en ? 'PLATFORM' : 'المنصة'}
        </span>
        <span>dcp.sa</span>
      </div>
      <ul className="feat-list">
        {rows.map(([n, k, v]) => (
          <li key={n}>
            <span className="n">{n}</span>
            <div>
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Hero() {
  const { lang, t } = useLang()
  const [dateStr, setDateStr] = useState<string>('')
  // Render locale-aware date only on client to avoid SSR hydration mismatch.
  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }),
    )
  }, [lang])

  return (
    <section className="hero" style={{ paddingTop: 30, borderTop: 0 }}>
      <div className="hero-bg">
        <HeroMap />
      </div>
      <div className="wrap">
        <div className="hero-meta">
          <span className="left">
            <span>
              <span className="dot">◦</span> Riyadh · Jeddah · Dammam · NEOM
            </span>
            <span>{t.topline.live} · 40+ providers registered</span>
          </span>
          <span>{dateStr}</span>
        </div>
        <div className="hero-body">
          <Reveal>
            <Eyebrow>{t.hero.eyebrow}</Eyebrow>
            <h1 className="hero-h">
              {t.hero.headline_1}
              <br />
              <em>{t.hero.headline_2}</em>
            </h1>
            <p className="hero-sub">{t.hero.sub}</p>
            <div className="hero-ctas">
              <MagneticButton>
                <a href="#api" className="btn primary lg">
                  {t.hero.cta_primary} <Arrow size={14} />
                </a>
              </MagneticButton>
              <MagneticButton strength={0.18}>
                <a href="#marketplace" className="btn ghost lg">
                  {t.hero.cta_secondary}
                </a>
              </MagneticButton>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <FeatureCard />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Marketplace                                                            */
/* ────────────────────────────────────────────────────────────────────── */

function Marketplace() {
  const { lang, t } = useLang()
  const [filter, setFilter] = useState<'all' | 'ar' | 'h100' | 'rtx'>('all')
  const [q, setQ] = useState('')

  const rows = useMemo(
    () =>
      marketplace.filter((r) => {
        if (filter === 'ar' && !r.arabic) return false
        if (filter === 'h100' && !/H100|A100/.test(r.gpu)) return false
        if (filter === 'rtx' && !/RTX|M4/.test(r.gpu)) return false
        if (q && !(r.gpu + ' ' + r.provider + ' ' + r.region).toLowerCase().includes(q.toLowerCase()))
          return false
        return true
      }),
    [filter, q],
  )

  // Jitter util + price live (2.4s)
  const [ticks, setTicks] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), 2400)
    return () => clearInterval(id)
  }, [])

  const meanUtil = useMemo(() => {
    if (!marketplace.length) return 0
    return (
      marketplace.reduce(
        (s, r, i) => s + Math.max(5, Math.min(99, r.util + Math.sin((ticks + i) * 0.8) * 4)),
        0,
      ) / marketplace.length
    )
  }, [ticks])

  const histRef = useRef<number[]>([])
  const [, forceRerender] = useState(0)
  useEffect(() => {
    histRef.current = [...histRef.current, meanUtil].slice(-40)
    if (histRef.current.length < 12) {
      while (histRef.current.length < 12) {
        histRef.current.unshift(meanUtil + (Math.random() - 0.5) * 6)
      }
    }
    forceRerender((n) => n + 1)
  }, [meanUtil])

  const demandLabel =
    meanUtil > 78
      ? lang === 'ar'
        ? 'طلب مرتفع'
        : 'High demand'
      : meanUtil > 55
      ? lang === 'ar'
        ? 'طلب معتدل'
        : 'Moderate'
      : lang === 'ar'
      ? 'سعة متاحة'
      : 'Capacity available'

  const chipOpts: [typeof filter, string, number][] = [
    ['all', t.market.f_all, marketplace.length],
    ['ar', t.market.f_ar, marketplace.filter((r) => r.arabic).length],
    ['h100', t.market.f_h100, marketplace.filter((r) => /H100|A100/.test(r.gpu)).length],
    ['rtx', t.market.f_rtx, marketplace.filter((r) => /RTX|M4/.test(r.gpu)).length],
  ]

  return (
    <section id="marketplace">
      <div className="wrap">
        <SectionMeta idx="01" label="Marketplace" />
        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 36 }}>
          <Reveal>
            <Eyebrow>{t.market.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.market.title}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="ss">{t.market.sub}</p>
          </Reveal>
        </div>

        <div className="demand">
          <div className="demand-left">
            <div className="demand-label">
              <span>
                {lang === 'ar' ? 'طلب الشبكة · متوسط الاستخدام' : 'Network demand · mean utilization'}
              </span>
              <b>
                {fmtInt(meanUtil, lang)}% · {demandLabel}
              </b>
            </div>
            <div className="demand-bar">
              <span style={{ transform: `scaleX(${meanUtil / 100})` }} />
            </div>
          </div>
          <div className="demand-right">
            <div className="k">{lang === 'ar' ? 'آخر 40 تحديث' : 'last 40 ticks'}</div>
            <Sparkline values={histRef.current} height={28} />
          </div>
        </div>

        <div className="mk-controls">
          <input
            className="mk-search"
            placeholder={t.market.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {chipOpts.map(([k, label, n]) => (
            <button
              key={k}
              className={'chip ' + (filter === k ? 'on' : '')}
              onClick={() => setFilter(k)}
            >
              {label} <span className="n">{fmtInt(n, lang)}</span>
            </button>
          ))}
        </div>

        <table className="mk-table">
          <thead>
            <tr>
              {t.market.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const util = Math.max(5, Math.min(99, r.util + Math.sin((ticks + i) * 0.8) * 4))
              const sar = r.sarhr * (1 + Math.sin((ticks + i) * 0.6) * 0.01)
              return (
                <tr key={r.id}>
                  <td className="gpu-cell">
                    {r.gpu}
                    <small>
                      vram {r.vram}GB · {r.arabic ? 'in-kingdom' : 'mesh'}
                    </small>
                  </td>
                  <td>
                    <span className="region">
                      <span className="pin" />
                      {r.region}
                    </span>
                  </td>
                  <td className="provider">{r.provider}</td>
                  <td>
                    <div className="util-cell">
                      <div className="util-bar">
                        <span style={{ transform: `scaleX(${util / 100})` }} />
                      </div>
                      <span className="util-val">{fmtInt(util, lang)}%</span>
                    </div>
                  </td>
                  <td className="price">
                    {fmt(sar, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="price usd">
                    ${fmt(r.usd, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="rel">
                    {fmt(r.reliability, lang, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </td>
                  <td>
                    <span className="perf">
                      {Array.from({ length: 5 }).map((_, b) => (
                        <span
                          key={b}
                          className={'bar ' + (b < Math.ceil(r.perf / 20) ? 'on' : '')}
                          style={{ height: 6 + b * 3 }}
                        />
                      ))}
                    </span>
                  </td>
                  <td>
                    <button className="btn small">{t.market.reserve}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="mk-foot">
          <span>
            {fmtInt(rows.length, lang)} / {fmtInt(marketplace.length, lang)} listings
          </span>
          <span>{lang === 'ar' ? 'يحدَّث كل 2.4 ثانية' : 'live · updated every 2.4s'}</span>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Playground                                                             */
/* ────────────────────────────────────────────────────────────────────── */

function Playground() {
  const { lang, t } = useLang()
  const [model, setModel] = useState<string>('allam-7b')
  const [prompt, setPrompt] = useState<string>(demoPrompts['allam-7b'])
  const [out, setOut] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [tokens, setTokens] = useState(0)
  const [latency, setLatency] = useState(0)
  const [tab, setTab] = useState<'ui' | 'curl' | 'sdk'>('ui')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function chooseModel(id: string) {
    setModel(id)
    setPrompt(demoPrompts[id] || '')
    setOut('')
  }

  function run() {
    setOut('')
    setRunning(true)
    setTokens(0)
    setLatency(38 + Math.random() * 14)
    const target = demoResponses[model] || '...'
    let i = 0
    const startT = performance.now()
    timerRef.current = setInterval(() => {
      i += Math.random() > 0.5 ? 2 : 1
      setOut(target.slice(0, i))
      setTokens(Math.round(i / 4))
      if (i >= target.length) {
        if (timerRef.current) clearInterval(timerRef.current)
        setRunning(false)
        setLatency(performance.now() - startT)
      }
    }, 22)
  }
  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    setRunning(false)
  }
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
    },
    [],
  )

  const isArabicOut = /[\u0600-\u06FF]/.test(out)
  const modelObj: ModelRow | undefined = models.find((m) => m.id === model)
  const cost = ((tokens / 1000) * (modelObj?.out || 1) * 3.75).toFixed(4)

  return (
    <section id="api">
      <div className="wrap">
        <SectionMeta idx="02" label="Platform · API" />
        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 36 }}>
          <Reveal>
            <Eyebrow>{t.playground.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.playground.title}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="ss">{t.playground.sub}</p>
          </Reveal>
        </div>

        <div className="pg">
          <div className="pg-pane">
            <div className="pg-label">{t.playground.model}</div>
            <select
              className="select"
              value={model}
              onChange={(e) => chooseModel(e.target.value)}
              style={{ appearance: 'none', font: 'inherit' }}
            >
              {models
                .filter((m) => m.kind === 'chat')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.org}
                  </option>
                ))}
            </select>

            <div className="pg-label" style={{ marginTop: 18 }}>
              {t.playground.prompt}
            </div>
            <textarea
              className="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              dir={/[\u0600-\u06FF]/.test(prompt) ? 'rtl' : 'ltr'}
            />

            <div className="pg-actions">
              {running ? (
                <button className="btn" onClick={stop}>
                  <Stop /> {t.playground.stop}
                </button>
              ) : (
                <button className="btn primary" onClick={run}>
                  <Play /> {t.playground.run}
                </button>
              )}
              <div className="pg-meta">
                <span>
                  <b>{fmtInt(tokens, lang)}</b> {t.playground.tokens}
                </span>
                <span>
                  <b>{cost}</b> {t.playground.cost}
                </span>
                <span>
                  <b>{fmtInt(latency, lang)}</b> {t.playground.latency}
                </span>
              </div>
            </div>
          </div>

          <div className="pg-pane">
            <div className="tabs">
              <button className={tab === 'ui' ? 'on' : ''} onClick={() => setTab('ui')}>
                {t.playground.response}
              </button>
              <button className={tab === 'curl' ? 'on' : ''} onClick={() => setTab('curl')}>
                cURL
              </button>
              <button className={tab === 'sdk' ? 'on' : ''} onClick={() => setTab('sdk')}>
                Node
              </button>
            </div>
            {tab === 'ui' && (
              <div
                className={
                  'pg-response ' + (isArabicOut ? 'rtl-out ' : '') + (!out ? 'empty' : '')
                }
              >
                {out ? (
                  <>
                    {out}
                    {running && <span className="cursor" />}
                  </>
                ) : (
                  <span>{t.playground.empty}</span>
                )}
                {tokens > 0 && (
                  <div className="token-ribbon">
                    {Array.from({ length: Math.min(24, Math.floor(tokens / 3)) }).map((_, i) => (
                      <span className="tok-chip" key={i}>
                        {'•'.repeat(1 + (i % 3))}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === 'curl' && (
              <pre className="code">
                <span className="f">curl</span>{' '}
                <span className="n">https://api.dcp.sa/v1/chat/completions</span> {'\\\n  '}
                <span className="k">-H</span>{' '}
                <span className="s">&quot;Authorization: Bearer $DCP_KEY&quot;</span> {'\\\n  '}
                <span className="k">-H</span>{' '}
                <span className="s">&quot;Content-Type: application/json&quot;</span> {'\\\n  '}
                <span className="k">-d</span>{' '}
                <span className="s">{`'{"model":"${modelObj?.name ?? ''}","messages":[{"role":"user","content":"..."}]}'`}</span>
              </pre>
            )}
            {tab === 'sdk' && (
              <pre className="code">
                <span className="k">import</span> {'{ '}
                <span className="f">OpenAI</span>
                {' }'} <span className="k">from</span>{' '}
                <span className="s">&quot;openai&quot;</span>;{'\n\n'}
                <span className="k">const</span> client = <span className="k">new</span>{' '}
                <span className="f">OpenAI</span>({'{ '}
                {'\n  '}
                baseURL: <span className="s">&quot;https://api.dcp.sa/v1&quot;</span>,{'\n  '}
                apiKey: process.env.<span className="n">DCP_KEY</span>,{'\n'}
                {'});'}
                {'\n\n'}
                <span className="k">const</span> r = <span className="k">await</span>{' '}
                client.chat.completions.<span className="f">create</span>({'{'}
                {'\n  '}
                model: <span className="s">&quot;{modelObj?.name ?? ''}&quot;</span>,{'\n  '}
                messages: [{'{'} role: <span className="s">&quot;user&quot;</span>, content:{' '}
                <span className="s">&quot;مرحباً&quot;</span> {'}'}],{'\n'}
                {'});'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Models                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

function Models() {
  const { lang, t } = useLang()
  const [filter, setFilter] = useState<'all' | 'ar' | 'chat' | 'image' | 'embed'>('all')
  const filtered = useMemo(
    () =>
      models.filter((m) => {
        if (filter === 'ar' && !m.arabic) return false
        if (filter === 'chat' && m.kind !== 'chat') return false
        if (filter === 'image' && m.kind !== 'image') return false
        if (filter === 'embed' && m.kind !== 'embed') return false
        return true
      }),
    [filter],
  )
  const chips: [typeof filter, string][] = [
    ['all', t.models.all],
    ['ar', t.models.ar],
    ['chat', t.models.chat],
    ['image', t.models.image],
    ['embed', t.models.embed],
  ]
  return (
    <section id="models">
      <div className="wrap">
        <SectionMeta idx="03" label="Model catalog" />
        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 36 }}>
          <Reveal>
            <Eyebrow>{t.models.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.models.title}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="ss">{t.models.sub}</p>
          </Reveal>
        </div>
        <div className="mk-controls" style={{ marginBottom: 20 }}>
          {chips.map(([k, l]) => (
            <button
              key={k}
              className={'chip ' + (filter === k ? 'on' : '')}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="models-grid">
          {filtered.map((m) => (
            <div className="m-card" key={m.id}>
              {m.hot && (
                <span className="hot">
                  <span className="d" />
                  hot
                </span>
              )}
              <div className="org">
                {m.org} · {m.ctx}
              </div>
              <div className="mname">{m.name}</div>
              <div className="mtag">{m.tag}</div>
              <div className="mrow">
                <span>{t.models.in}</span>
                <span>
                  <b>
                    {fmt(m.in, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </b>{' '}
                  SAR
                </span>
              </div>
              <div className="mrow" style={{ marginTop: 0, borderTop: '0', paddingTop: 6 }}>
                <span>{t.models.out}</span>
                <span>
                  <b>
                    {fmt(m.out, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </b>{' '}
                  SAR
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mk-foot" style={{ marginTop: 16 }}>
          <span>{t.models.per}</span>
          <span>+ {fmtInt(14, lang)} more in catalog</span>
        </p>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Billing                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function Billing() {
  const { t } = useLang()
  return (
    <section id="pricing">
      <div className="wrap">
        <SectionMeta idx="04" label="Settlement" />
        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 20 }}>
          <Reveal>
            <Eyebrow>{t.billing.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.billing.title}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="ss">{t.billing.sub}</p>
          </Reveal>
        </div>
        <div className="bill-list">
          {t.billing.rows.map(([n, title, desc]) => (
            <div className="bill-row" key={n}>
              <div className="n">{n}</div>
              <div className="t">{title}</div>
              <div className="d">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Providers (with earnings calculator)                                   */
/* ────────────────────────────────────────────────────────────────────── */

type GpuKey = 'rtx4070' | 'rtx4080' | 'rtx4090' | 'rtx5090' | 'm4max' | 'a100' | 'h100'

function Providers() {
  const { lang, t } = useLang()
  const [hours, setHours] = useState(16)
  const [util, setUtil] = useState(55)
  const [gpu, setGpu] = useState<GpuKey>('rtx4090')
  const rates: Record<GpuKey, number> = {
    rtx4070: 1.6,
    rtx4080: 2.4,
    rtx4090: 3.4,
    rtx5090: 4.8,
    m4max: 2.2,
    a100: 9.6,
    h100: 20.1,
  }
  const price = rates[gpu]
  const earn = price * 0.75 * hours * (util / 100) * 30

  return (
    <section id="providers">
      <div className="wrap">
        <SectionMeta idx="05" label="Provider network" />
        <div className="prov-wrap">
          <Reveal>
            <Eyebrow>{t.providers.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.providers.title}
            </h2>
            <p className="ss">{t.providers.sub}</p>
            <ul className="prov-list">
              {t.providers.items.map((it, i) => (
                <li key={i}>
                  <span className="mk">0{i + 1}</span>
                  <span className="tx">{it}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MagneticButton>
                <a className="btn primary" href="#">
                  {t.providers.cta} <Arrow size={13} />
                </a>
              </MagneticButton>
              <a className="btn ghost" href="#">
                docs
              </a>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="calc-card">
              <div className="pg-label">{t.providers.calc}</div>

              <div className="calc-field" style={{ marginTop: 16 }}>
                <div className="calc-row">
                  <span>GPU</span>
                  <b>{gpu.toUpperCase()}</b>
                </div>
                <select
                  className="select"
                  value={gpu}
                  onChange={(e) => setGpu(e.target.value as GpuKey)}
                >
                  <option value="rtx4070">RTX 4070 Ti · 12GB</option>
                  <option value="rtx4080">RTX 4080 · 16GB</option>
                  <option value="rtx4090">RTX 4090 · 24GB</option>
                  <option value="rtx5090">RTX 5090 · 32GB</option>
                  <option value="m4max">Apple M4 Max · 36GB</option>
                  <option value="a100">A100 · 40GB</option>
                  <option value="h100">H100 · 80GB</option>
                </select>
              </div>

              <div className="calc-field">
                <div className="calc-row">
                  <span>Hours / day</span>
                  <b>{fmtInt(hours, lang)} h</b>
                </div>
                <input
                  className="slider"
                  type="range"
                  min={1}
                  max={24}
                  value={hours}
                  onChange={(e) => setHours(+e.target.value)}
                />
              </div>

              <div className="calc-field">
                <div className="calc-row">
                  <span>Utilization</span>
                  <b>{fmtInt(util, lang)}%</b>
                </div>
                <input
                  className="slider"
                  type="range"
                  min={10}
                  max={95}
                  value={util}
                  onChange={(e) => setUtil(+e.target.value)}
                />
              </div>

              <div className="calc-out">
                <div className="big">
                  {fmt(earn, lang, { maximumFractionDigits: 0 })}
                  <span className="u">SAR {t.providers.mo}</span>
                </div>
                <div className="sub">
                  {fmt(price, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR/hr
                  · 75/25 · weekly payout
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Enterprise                                                             */
/* ────────────────────────────────────────────────────────────────────── */

function Enterprise() {
  const { t } = useLang()
  return (
    <section style={{ padding: '96px 0' }}>
      <div className="wrap">
        <div className="ent">
          <div className="ent-bg" />
          <Reveal>
            <Eyebrow>{t.enterprise.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 16, maxWidth: '18ch' }}>
              {t.enterprise.title}
            </h2>
            <p className="ss">{t.enterprise.sub}</p>
            <div className="ent-cta">
              <MagneticButton>
                <a className="btn primary" href="#">
                  {t.enterprise.cta} <Arrow size={13} />
                </a>
              </MagneticButton>
              <a className="btn ghost" href="#">
                whitepaper.pdf
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Trust                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function Trust() {
  const { t } = useLang()
  return (
    <section>
      <div className="wrap">
        <SectionMeta idx="06" label="How DCP runs" />
        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 20 }}>
          <Reveal>
            <Eyebrow>{t.trust.eyebrow}</Eyebrow>
            <h2 className="st" style={{ marginTop: 12 }}>
              {t.trust.title}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="ss">
              These are platform policy and operating-model statements, separate from live
              telemetry.
            </p>
          </Reveal>
        </div>
        <div className="trust-grid">
          {t.trust.items.map(([k, v], i) => (
            <div className="tr" key={k}>
              <div className="n">
                0{i + 1} / {String(t.trust.items.length).padStart(2, '0')}
              </div>
              <h3>{k}</h3>
              <p>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* EndCTA + Footer                                                        */
/* ────────────────────────────────────────────────────────────────────── */

function EndCTA() {
  const { t } = useLang()
  return (
    <section className="end-cta">
      <div className="wrap">
        <Reveal>
          <Eyebrow>{t.cta_block.small}</Eyebrow>
          <div className="big">
            {t.cta_block.big_1}
            <br />
            <em>{t.cta_block.big_2}</em>
          </div>
          <p className="ss">{t.cta_block.body}</p>
          <div className="ctas">
            <MagneticButton>
              <a className="btn primary lg" href="#">
                {t.cta_block.primary} <Arrow size={14} />
              </a>
            </MagneticButton>
            <MagneticButton strength={0.18}>
              <a className="btn ghost lg" href="#">
                {t.cta_block.secondary}
              </a>
            </MagneticButton>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  const { t } = useLang()
  const cols: [string, string[]][] = [
    [t.footer.product, ['Start Renting', 'Start Earning', 'Marketplace', 'Console Login']],
    [t.footer.dev, ['Docs', 'Build via API', 'Provider install help', 'Billing support']],
    [t.footer.company, ['Support', 'Job failure support', 'Enterprise support', 'System status']],
    [t.footer.legal, ['Terms of Service', 'Privacy Policy', 'Acceptable Use', 'System Status']],
  ]
  return (
    <footer className="site foot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="brand">
              <span className="brand-mark">
                {/* perf: footer is below the fold; lazy-load + explicit
                    dims to avoid CLS when it scrolls into view. */}
                <img
                  src="/preview/dcp-logo-square.jpeg"
                  alt="DCP"
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="brand-name">
                DCP<i>·sa</i>
              </span>
            </div>
            <p
              style={{
                marginTop: 16,
                maxWidth: '36ch',
                color: 'color-mix(in oklab, var(--bg) 75%, transparent)',
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              {t.footer.tag}
            </p>
            <div
              style={{
                marginTop: 20,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '.1em',
                color: 'var(--teal)',
              }}
            >
              ● {t.footer.status}
            </div>
          </div>
          {cols.map(([h, ls]) => (
            <div key={h}>
              <h4>{h}</h4>
              <ul>
                {ls.map((l) => (
                  <li key={l}>
                    <a href="#">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 DC Power Solutions Company · Riyadh, KSA</span>
          <span>CR: 7053667775 · dcp.sa</span>
        </div>
      </div>
    </footer>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Root                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export default function HomeRedesign() {
  const [lang, setLang] = useState<PreviewLang>('en')

  // Load preferred lang on mount (client-only to avoid SSR mismatch)
  useEffect(() => {
    const s = typeof window !== 'undefined' ? window.localStorage.getItem('dcp_preview_lang') : null
    if (s === 'en' || s === 'ar') setLang(s)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('dcp_preview_lang', lang)
  }, [lang])

  const t = DCP_I18N[lang] || DCP_I18N.en

  return (
    <LangCtx.Provider value={{ lang, t, setLang }}>
      <div
        className="dcp-v2"
        data-palette="midnight"
        data-lang={lang}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <Marquee />
        <Nav />
        <Hero />
        <Marketplace />
        <Playground />
        <Models />
        <Billing />
        <Providers />
        <Enterprise />
        <Trust />
        <EndCTA />
        <Footer />
      </div>
    </LangCtx.Provider>
  )
}
