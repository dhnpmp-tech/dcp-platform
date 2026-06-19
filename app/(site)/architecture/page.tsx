'use client'

// Architecture deep-dive — the plumbing the landing hero deliberately omits.
// For technical / procurement buyers who want to see exactly how a request
// stays sovereign. Reuses the docs chrome + home design system; no new CSS deps.

import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

// The real request lifecycle. Sovereign stages run in-Kingdom; the one
// cross-border possibility (frontier) is gated behind explicit opt-in.
const STAGES = [
  { n: '01', g: 'أ', en: 'Arabic in', ar: 'عربية دخولاً', sen: 'The renter sends an Arabic prompt to api.dcp.sa/v1 — OpenAI-compatible.', sar: 'يرسل المستأجر سؤالاً بالعربية إلى api.dcp.sa/v1 — متوافق مع OpenAI.', loc: 'KSA', frontier: false },
  { n: '02', g: '◇', en: 'Verified routing', ar: 'توجيه متحقق', sen: 'The router picks a provider that just passed a live reachability + inference probe for the requested model — earned-online, never claimed-online.', sar: 'يختار الموجّه مزوّداً اجتاز للتو فحص وصول واستدلال حياً للنموذج المطلوب — اتصال مُكتسب لا مُدّعى.', loc: 'KSA', frontier: false },
  { n: '03', g: '◆', en: 'Model runs in-Kingdom', ar: 'النموذج يعمل داخل المملكة', sen: 'An Arabic-first or open model executes on a verified Saudi GPU over the WireGuard mesh. Sovereign by default.', sar: 'يعمل نموذج عربي أولاً أو مفتوح على معالج سعودي متحقق عبر شبكة WireGuard. سيادي افتراضياً.', loc: 'KSA', frontier: false },
  { n: '04', g: '🌐', en: 'Frontier (opt-in only)', ar: 'متقدّم (بإذن فقط)', sen: 'A cross-border frontier model (e.g. DeepSeek) runs ONLY if the tenant explicitly enabled it — billed on a separate invoice line, logged distinctly.', sar: 'يعمل نموذج متقدّم عبر الحدود (مثل DeepSeek) فقط إذا فعّله العميل صراحةً — يُفوتر على بند منفصل ويُسجّل بوضوح.', loc: 'opt-in', frontier: true },
  { n: '05', g: 'أ', en: 'Arabic out', ar: 'عربية خروجاً', sen: 'The response returns to the renter. For sovereign requests, nothing left the Kingdom at any point.', sar: 'تعود الإجابة إلى المستأجر. للطلبات السيادية، لم يغادر أي شيء المملكة في أي لحظة.', loc: 'KSA', frontier: false },
  { n: '06', g: '◷', en: 'Settled in SAR', ar: 'تسوية بالريال', sen: 'Only successful inference is billed — atomic, idempotent, server-measured, in Saudi Riyal.', sar: 'يُفوتر الاستدلال الناجح فقط — ذري، غير مكرر، مُقاس على الخادم، بالريال السعودي.', loc: 'KSA', frontier: false },
]

export default function ArchitecturePage() {
  const { toggle, lang } = useV2()

  return (
    <>
      <header className="dx-top">
        <Link href="/" className="wm">
          DCP<i>∞</i><span className="tag"><Bi en="Architecture" ar="البنية" /></span>
        </Link>
        <div className="links">
          <Link href="/"><Bi en="Home" ar="الرئيسية" /></Link>
          <Link href="/docs"><Bi en="Docs" ar="التوثيق" /></Link>
          <Link href="/status"><Bi en="Live status" ar="الحالة الحية" /></Link>
          <button type="button" className="dx-langpill" onClick={toggle} aria-label="Toggle language">
            <span className={lang === 'en' ? 'on' : undefined}>EN</span>
            <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
          </button>
        </div>
      </header>

      <section>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Architecture · how a request stays sovereign" ar="البنية · كيف يبقى الطلب سيادياً" /></span>
            <span><Bi en="The plumbing the homepage omits" ar="التفاصيل التي تتجاوزها الصفحة الرئيسية" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif, "Instrument Serif", serif)', fontWeight: 400, fontSize: 'clamp(2.2rem, 1.1rem + 4vw, 4rem)', lineHeight: 1.05, maxWidth: 900, margin: '16px 0 16px' }}>
            <Bi en="Arabic in, Arabic out — and the border in between." ar="عربية دخولاً، عربية خروجاً — والحدود بينهما." />
          </h1>
          <p style={{ maxWidth: 680, fontSize: 16, lineHeight: 1.7, color: 'var(--mut)' }}>
            <Bi
              en="The landing page shows the outcome; this page shows the mechanism. Every sovereign stage below runs on a verified GPU inside Saudi Arabia. The only stage that can cross a border is the frontier model, and only when a tenant explicitly turns it on."
              ar="تعرض الصفحة الرئيسية النتيجة؛ وتعرض هذه الصفحة الآلية. كل مرحلة سيادية أدناه تعمل على معالج متحقق داخل المملكة. المرحلة الوحيدة التي قد تعبر الحدود هي النموذج المتقدّم، وفقط عندما يفعّله العميل صراحةً."
            />
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="hiw-flow">
            <div className="hiw-row">
              {STAGES.map((s) => (
                <div key={s.n} className={s.frontier ? 'hiw-st ksa frontier' : 'hiw-st ksa'}>
                  <span className="hiw-n">{s.n}</span>
                  <span className="hiw-g">{s.g}</span>
                  <h4 className="hiw-h"><Bi en={s.en} ar={s.ar} /></h4>
                  <span className="hiw-sub"><Bi en={s.sen} ar={s.sar} /></span>
                  <span className="hiw-flag">
                    {s.frontier
                      ? <Bi en="🌐 opt-in" ar="🌐 بإذن" />
                      : <Bi en="🇸🇦 KSA" ar="🇸🇦 المملكة" />}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="capacity-truth" style={{ marginTop: 32 }}>
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Why it's not just a translation pipeline" ar="لماذا ليست مجرد سلسلة ترجمة" /></span>
              <h3><Bi en="The translation steps are an internal convenience — your data and your model choice never leave the Kingdom for sovereign requests." ar="خطوات الترجمة راحة داخلية — بياناتك واختيارك للنموذج لا يغادران المملكة للطلبات السيادية." /></h3>
              <p><Bi
                en="Arabic-first models (ALLaM-class) run natively. The optional Arabic↔English bridge exists only to let you reach the broader open-model catalog when you want it — it runs on the same in-Kingdom GPUs, not on a foreign service. Frontier cross-border models are the single exception, gated behind per-tenant opt-in and billed separately."
                ar="النماذج العربية أولاً (فئة ALLaM) تعمل أصلاً. جسر العربية↔الإنجليزية الاختياري موجود فقط ليتيح لك الوصول إلى كتالوج النماذج المفتوحة الأوسع عند الحاجة — ويعمل على نفس معالجات المملكة، لا على خدمة أجنبية. النماذج المتقدّمة عبر الحدود هي الاستثناء الوحيد، محكومة بإذن لكل عميل وتُفوتر منفصلة."
              /></p>
            </div>
            <div className="capacity-gates" aria-label="Sovereignty guarantees">
              <div className="capacity-gate"><span className="gate-n">01</span><span className="gate-k">in_kingdom_default</span><p><Bi en="Sovereign requests touch only verified Saudi GPUs." ar="الطلبات السيادية تلامس فقط معالجات سعودية متحققة." /></p></div>
              <div className="capacity-gate"><span className="gate-n">02</span><span className="gate-k">frontier_opt_in</span><p><Bi en="Cross-border models are off until a tenant turns them on." ar="النماذج عبر الحدود مغلقة حتى يفعّلها العميل." /></p></div>
              <div className="capacity-gate"><span className="gate-n">03</span><span className="gate-k">pdpl_audit_trail</span><p><Bi en="Every route is logged for residency compliance." ar="يُسجَّل كل توجيه لامتثال الإقامة." /></p></div>
            </div>
          </div>

          <div className="mp-foot">
            <span><Bi en="Want the API details? The renter docs cover endpoints, auth, and billing." ar="تريد تفاصيل الواجهة؟ توثيق المستأجر يغطي النقاط والمصادقة والفوترة." /></span>
            <Link href="/docs"><Bi en="Read the docs →" ar="اقرأ التوثيق ←" /></Link>
          </div>
        </div>
      </section>
    </>
  )
}
