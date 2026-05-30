'use client'

// v2 landing — in-app proof of the Midnight foundation (kit tokens + EN/AR + RTL).
// The full marketing Home (Saudi-map hero, mesh flow, marketplace, etc.) is being
// ported from prototypes/Home.html; this renders the live theme + working toggle.

import Link from 'next/link'
import { Bi, useV2 } from './lib/i18n'

const grad = 'linear-gradient(90deg, #2dd4b6 0%, #2dd4b6 28%, #6bb39a 55%, #ee7a3c 100%)'
const gradText: React.CSSProperties = {
  backgroundImage: grad,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  fontStyle: 'italic',
}
const mono: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  color: 'var(--mut)',
}

const MARQUEE = [
  { en: 'Inference and agents, in the Kingdom', ar: 'استدلال ووكلاء، داخل المملكة' },
  { en: 'Pay per token · Saudi Riyal', ar: 'ادفع لكل رمز · بالريال السعودي' },
  { en: 'DCP-Agent for Saudi business · agents.dcp.sa', ar: 'DCP-Agent للأعمال · agents.dcp.sa' },
  { en: 'Earn Riyal from your GPU', ar: 'اكسب ريالاً من معالجك' },
  { en: 'PDPL · Saudi data residency', ar: 'نظام البيانات · إقامة داخل المملكة' },
]

const LAYERS = [
  { tag: 'INFERENCE · KSA', en: 'Inference', ar: 'الاستدلال', de: 'OpenAI-compatible API for Arabic-first and global open models, served from in-Kingdom GPUs.', da: 'واجهة متوافقة مع OpenAI لنماذج عربية وعالمية، من معالجات داخل المملكة.' },
  { tag: 'AGENTS · KSA', en: 'Agents', ar: 'الوكلاء', de: 'DCP-Agent for Saudi business — live at agents.dcp.sa. Personal AI coming next.', da: 'DCP-Agent للأعمال السعودية — على agents.dcp.sa. الذكاء الشخصي قادم.' },
  { tag: 'GPUS · KSA', en: 'Providers', ar: 'المزوّدون', de: 'Earn Riyal from idle GPUs on the DCP mesh. 75/25 split, paid in SAR.', da: 'اكسب ريالاً من معالجاتك على شبكة DCP. تقسيم 75/25، يُدفع بالريال.' },
]

export default function V2Home() {
  const { toggle, lang } = useV2()
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh', fontFamily: 'var(--sans)' }}>
      {/* marquee */}
      <div style={{ background: '#04050d', borderBottom: '1px solid var(--line)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', gap: 48, padding: '10px 0', ...mono }}>
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--teal)', fontSize: 13 }}>∞</span>
              <Bi en={m.en} ar={m.ar} />
            </span>
          ))}
        </div>
      </div>

      {/* topbar */}
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 32px', borderBottom: '1px solid var(--hair)', position: 'sticky', top: 0, zIndex: 40,
          background: 'color-mix(in oklab, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)',
        }}
      >
        <Link href="/v2" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 26, letterSpacing: '-.01em' }}>DCP</span>
          <span style={{ ...gradText, fontSize: 18, fontStyle: 'normal' }}>∞</span>
        </Link>
        <nav style={{ display: 'flex', gap: 26, ...mono, fontSize: 12 }}>
          <a href="#" style={{ color: 'var(--ink)' }}><Bi en="Overview" ar="نظرة عامة" /></a>
          <a href="#" style={{ color: 'var(--ink-2)' }}><Bi en="Marketplace" ar="السوق" /></a>
          <a href="#" style={{ color: 'var(--ink-2)' }}><Bi en="Agents" ar="الوكلاء" /></a>
          <a href="#" style={{ color: 'var(--ink-2)' }}><Bi en="Pricing" ar="الأسعار" /></a>
          <a href="#" style={{ color: 'var(--ink-2)' }}><Bi en="Docs" ar="التوثيق" /></a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={toggle}
            className="lang-pill"
            aria-label="Toggle language"
            style={{ display: 'inline-flex', gap: 0, border: '1px solid var(--hair)', borderRadius: 999, fontFamily: 'var(--mono)', fontSize: 11, overflow: 'hidden', cursor: 'pointer', background: 'transparent', color: 'var(--ink)' }}
          >
            <span style={{ padding: '5px 9px', background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>EN</span>
            <span style={{ padding: '5px 9px', background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>ع</span>
          </button>
          <a href="#" className="btn small ghost" style={{ fontFamily: 'var(--sans)', fontSize: 13, padding: '8px 14px', border: '1px solid var(--ink)', borderRadius: 2, color: 'var(--ink)', textDecoration: 'none' }}><Bi en="Sign in" ar="دخول" /></a>
          <a href="#" className="btn small primary" style={{ fontFamily: 'var(--sans)', fontSize: 13, padding: '8px 14px', background: 'var(--ink)', color: 'var(--bg)', borderRadius: 2, textDecoration: 'none' }}><Bi en="Start free →" ar="ابدأ مجاناً ←" /></a>
        </div>
      </header>

      {/* hero */}
      <section style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '88px 32px 64px' }}>
        <div style={{ ...mono, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--teal)' }}>
          <span style={{ width: 26, height: 1, background: 'var(--teal)' }} /> § DCP · <Bi en="Sovereign Arabic AI Runtime · KSA" ar="بيئة تشغيل عربية سيادية · السعودية" />
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(56px, 9vw, 132px)', lineHeight: 1.0, letterSpacing: '-.02em', margin: '18px 0 0' }}>
          <Bi en="Arabic AI that " ar="ذكاء اصطناعي عربي " />
          <span style={gradText}><Bi en="lives in the Kingdom." ar="يعيش داخل المملكة." /></span>
        </h1>
        <p style={{ fontSize: 19, color: 'var(--ink-2)', maxWidth: 560, marginTop: 26, lineHeight: 1.5 }}>
          <Bi
            en="Inference and agents, served from inside the Kingdom. Your data stays here. You pay for what you use, in Riyal."
            ar="استدلال ووكلاء، من داخل المملكة. بياناتك تبقى هنا. تدفع مقابل ما تستخدمه، بالريال."
          />
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
          <a href="#" style={{ fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 500, padding: '13px 22px', background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 2, textDecoration: 'none' }}><Bi en="Try the live demo →" ar="جرّب العرض المباشر ←" /></a>
          <a href="#" style={{ fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 500, padding: '13px 22px', background: 'var(--ink)', color: 'var(--bg)', borderRadius: 2, textDecoration: 'none' }}><Bi en="Start free · no card" ar="ابدأ مجاناً · دون بطاقة" /></a>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 34, flexWrap: 'wrap', ...mono, fontSize: 10.5 }}>
          {['Inference · KSA', 'Agents · KSA', 'GPUs · KSA', 'Frontier · opt-in only'].map((c) => (
            <span key={c} style={{ padding: '5px 10px', border: '1px solid color-mix(in oklab, var(--teal) 35%, transparent)', background: 'color-mix(in oklab, var(--teal) 14%, transparent)', borderRadius: 999, color: 'var(--ink)' }}>{c}</span>
          ))}
        </div>
      </section>

      {/* three layers */}
      <section style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '12px 32px 80px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {LAYERS.map((l) => (
          <div key={l.tag} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 2, padding: 26, position: 'relative' }}>
            <div style={{ position: 'absolute', insetInline: -1, top: -1, height: 2, background: grad }} />
            <div style={{ ...mono, color: 'var(--teal)' }}>{l.tag}</div>
            <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 30, margin: '10px 0 8px' }}><Bi en={l.en} ar={l.ar} /></h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.55 }}><Bi en={l.de} ar={l.da} /></p>
          </div>
        ))}
      </section>

      {/* compliance footer */}
      <footer style={{ borderTop: '1px solid var(--hair)', padding: '28px 32px', maxWidth: 'var(--maxw)', margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, ...mono, fontSize: 10.5 }}>
        <span><Bi en="PDPL · Saudi data residency · ZATCA VAT" ar="نظام حماية البيانات · إقامة سعودية · ضريبة هيئة الزكاة" /></span>
        <span>DC Power Solutions Company · CR 7053667775</span>
      </footer>
    </div>
  )
}
