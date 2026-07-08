'use client'

import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

const CAPABILITIES = [
  {
    k: 'openai_compatible',
    tEn: 'OpenAI-compatible API',
    tAr: 'واجهة متوافقة مع OpenAI',
    en: 'Use base_url=https://api.dcp.sa/v1 with your DCP renter key; SDK rewrites are not required.',
    ar: 'استخدم base_url=https://api.dcp.sa/v1 مع مفتاح مستأجر DCP؛ لا تحتاج لإعادة كتابة SDK.',
  },
  {
    k: 'earned_model_catalog',
    tEn: 'Earned model catalog',
    tAr: 'كتالوج نماذج مكتسب',
    en: 'Public model rows come from /v1/models and only count providers that are verified serving.',
    ar: 'صفوف النماذج العامة تأتي من /v1/models وتحسب فقط المزوّدين المتحققين في الخدمة.',
  },
  {
    k: 'sar_metering',
    tEn: 'SAR token metering',
    tAr: 'قياس الرموز بالريال',
    en: 'Model metadata carries SAR per-1M token prices, context, max output, and capability flags.',
    ar: 'تحمل بيانات النموذج أسعار الريال لكل مليون رمز والسياق والحد الأقصى للإخراج وأعلام القدرات.',
  },
  {
    k: 'balanced_routing',
    tEn: 'Balanced routing first',
    tAr: 'التوجيه المتوازن أولاً',
    en: 'The shipped router policy is the balanced default; premium/latency/cost policies stay gated until measured.',
    ar: 'سياسة التوجيه المشحونة هي الافتراضي المتوازن؛ تبقى سياسات الجودة/الكمون/التكلفة مقيدة حتى تقاس.',
  },
  {
    k: 'prompt_cache_readiness',
    tEn: 'Prompt-cache measurement',
    tAr: 'قياس التخزين المؤقت',
    en: 'Static-prefix and session hints are exposed as hash-only measurements; cached-input discounts stay off until settlement proof exists.',
    ar: 'تظهر تلميحات البادئة الثابتة والجلسة كقياسات بصمات فقط؛ تبقى خصومات الإدخال المخزن متوقفة حتى يوجد إثبات تسوية.',
  },
] as const

const CHAT_SNIPPET = `from openai import OpenAI

client = OpenAI(
    api_key="$DCP_RENTER_KEY",
    base_url="https://api.dcp.sa/v1",
)

response = client.chat.completions.create(
    model="Qwen/Qwen2.5-14B-Instruct-AWQ",
    messages=[{"role": "user", "content": "Explain zakat in Arabic."}],
)

print(response.choices[0].message.content)`

function capabilitySource(key: string): string {
  if (key === 'balanced_routing') return '/v1/router/policies'
  if (key === 'prompt_cache_readiness') return '/v1/prompt-cache/readiness'
  return '/v1/models'
}

export default function InferenceProductPage() {
  return (
    <>
      <SiteHeader active="/inference" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/inference.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="OpenAI-compatible inference · KSA GPU mesh" ar="استدلال متوافق مع OpenAI · شبكة GPU داخل المملكة" /></span>
            <span><Bi en="Published from live catalog metadata" ar="منشور من بيانات الكتالوج الحية" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.6rem, 1.2rem + 4.8vw, 5.2rem)', lineHeight: 0.96, letterSpacing: '-.02em', maxWidth: 920, margin: '22px 0 18px' }}>
            <BiX
              en={<>Inference API for Saudi AI products, <em style={{ fontStyle: 'italic' }}>without stale capacity claims.</em></>}
              ar={<>واجهة استدلال لمنتجات الذكاء السعودي، <em>دون ادعاءات سعة قديمة.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 720, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP exposes a drop-in /v1 API for chat completions and model discovery. The pages that show rates, model capability, context, and provider counts read the backend catalog, so zero-capacity models do not become marketing promises."
              ar="يوفر DCP واجهة /v1 بديلة للمحادثة واكتشاف النماذج. الصفحات التي تعرض الأسعار والقدرات والسياق وعدد المزوّدين تقرأ كتالوج الخلفية، فلا تتحول النماذج بلا سعة إلى وعود تسويقية."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/renter/playground"><Bi en="Open Playground ->" ar="افتح بيئة الاختبار ←" /></Link>
            <Link className="btn ghost" href="/marketplace"><Bi en="Live model catalog" ar="كتالوج النماذج الحي" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Shipped inference contract" ar="§ ٠١ · عقد الاستدلال المشحون" /></span>
            <span><Bi en="Model metadata before product claims" ar="بيانات النموذج قبل ادعاءات المنتج" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {CAPABILITIES.map((capability) => (
              <article className="mg" key={capability.k}>
                <span className="org">{capability.k}</span>
                <h3 className="nm"><Bi en={capability.tEn} ar={capability.tAr} /></h3>
                <p><Bi en={capability.en} ar={capability.ar} /></p>
                <div className="meta">
                  <span><Bi en="Source" ar="المصدر" /></span>
                  <b dir="ltr">{capabilitySource(capability.k)}</b>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="pshow">
            <div className="pshow-media">
              <img
                src="/home/swarm.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="Abstract GPU mesh visual representing DCP inference routing across verified Saudi providers"
              />
              <span className="pshow-cap" dir="ltr">fig. 01 - verified model routing</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · Drop-in client" ar="§ ٠٢ · عميل مباشر" /></span>
                <span><Bi en="Change base_url, keep the SDK" ar="غيّر base_url وأبقِ SDK" /></span>
              </div>
              <h2>
                <BiX en={<>One client path for app teams and agents. <em>SAR metered.</em></>} ar={<>مسار عميل واحد للفرق والوكلاء. <em>مقاس بالريال.</em></>} />
              </h2>
              <p>
                <Bi
                  en="Use the same OpenAI SDK call shape, but keep your traffic on DCP's in-Kingdom provider mesh. The model catalog is the source of truth for what is actually serveable."
                  ar="استخدم نفس شكل استدعاء OpenAI SDK، لكن أبقِ الحركة على شبكة مزوّدي DCP داخل المملكة. كتالوج النماذج هو مصدر الحقيقة لما يمكن خدمته فعلاً."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="OpenAI-compatible DCP inference example">{CHAT_SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="Prompt-cache measurement is visible at /v1/prompt-cache/readiness; discounts remain gated until settlement proof exists." ar="قياس التخزين المؤقت ظاهر في /v1/prompt-cache/readiness؛ تبقى الخصومات مقيدة حتى يوجد إثبات التسوية." /></li>
                <li><Bi en="Batch discounts, LoRA serving, and dedicated deployments remain explicit feature gates." ar="تبقى خصومات الدُفعات وخدمة LoRA والنشرات المخصصة بوابات ميزات صريحة." /></li>
                <li><Bi en="Provider counts are not inflated by stale heartbeat-only machines." ar="لا تضخم أعداد المزوّدين بأجهزة نبض اتصال قديمة فقط." /></li>
                <li><Bi en="Pricing and context are rendered from backend metadata where possible." ar="تعرض الأسعار والسياق من بيانات الخلفية حيثما أمكن." /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Route policy boundary" ar="حدود سياسة التوجيه" /></span>
              <h3><Bi en="Balanced routing is live. Everything else waits for evidence." ar="التوجيه المتوازن يعمل. كل شيء آخر ينتظر الدليل." /></h3>
              <p>
                <Bi
                  en="The Playground sends the balanced policy only when the backend marks it available. Cost-first, latency-first, premium, batch, and prompt-cache economics need measurement gates before they become public promises."
                  ar="ترسل بيئة الاختبار سياسة التوازن فقط عندما تضعها الخلفية كمتاحة. سياسات أقل تكلفة وأقل كمون والمميزة والدُفعات واقتصاد التخزين المؤقت تحتاج بوابات قياس قبل أن تصبح وعوداً عامة."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/renter/playground"><Bi en="Try Playground" ar="جرّب بيئة الاختبار" /></Link>
                <Link className="btn ghost" href="/pricing"><Bi en="See pricing" ar="شاهد الأسعار" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Inference gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">/v1/models</span>
                <p><Bi en="Serveable models, provider count, context, and token prices come from the live catalog." ar="النماذج القابلة للخدمة وعدد المزوّدين والسياق وأسعار الرموز تأتي من الكتالوج الحي." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">/v1/chat/completions</span>
                <p><Bi en="OpenAI-compatible requests run through DCP's provider router and meter usage." ar="طلبات متوافقة مع OpenAI تمر عبر موجّه مزوّدي DCP وتقيس الاستخدام." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">/v1/prompt-cache/readiness</span>
                <p><Bi en="Prompt-cache rows are hash-only measurements; cached-input discounts and provider KV-cache control are still off." ar="صفوف التخزين المؤقت قياسات بصمات فقط؛ تبقى خصومات الإدخال المخزن والتحكم في ذاكرة المزود متوقفة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">feature_readiness</span>
                <p><Bi en="Batch, prompt cache, LoRA, and dedicated deployment flags stay off until implementation and proof land." ar="تبقى أعلام الدُفعات والتخزين المؤقت وLoRA والنشر المخصص متوقفة حتى يصل التنفيذ والإثبات." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
