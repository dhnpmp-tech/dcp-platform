'use client'

// /pricing — DCP pricing. Two billing models: pay-as-you-go (per million tokens
// for inference, per GPU-second for pods) and optional monthly subscriptions.
// Reuses the home design system (home.css) + docs chrome (docs.css). Pattern A.
// All numbers mirror app/lib/structured-data.ts (GPU_SKUS + PRICING_FAQ) — the
// single source of truth — so the page and the JSON-LD can never drift.

import Link from 'next/link'
import { Bi, BiX, useV2 } from '@/app/(site)/lib/i18n'
import { PRICING_FAQ } from '@/app/lib/structured-data'
import '../(home)/home.css'
import '../docs/docs.css'

// Per-token inference rates by model class (halala per 1M tokens).
// 100 halala = 1 SAR. Source of truth: structured-data PRICING_FAQ.
const TOKEN_CLASSES: ReadonlyArray<{ cEn: string; cAr: string; hal: number }> = [
  { cEn: 'Embedding', cAr: 'تضمين', hal: 5 },
  { cEn: 'Tiny', cAr: 'صغير جداً', hal: 15 },
  { cEn: 'Small', cAr: 'صغير', hal: 30 },
  { cEn: 'Medium', cAr: 'متوسط', hal: 150 },
  { cEn: 'Large', cAr: 'كبير', hal: 400 },
]

// On-demand GPU rental — mirrors GPU_SKUS in structured-data.ts exactly.
const GPU_ROWS: ReadonlyArray<{ model: string; vram: number; sar: number }> = [
  { model: 'NVIDIA H200', vram: 141, sar: 23.05 },
  { model: 'NVIDIA H100', vram: 80, sar: 17.27 },
  { model: 'NVIDIA A100', vram: 80, sar: 7.3 },
  { model: 'NVIDIA L40S', vram: 48, sar: 5.2 },
  { model: 'NVIDIA RTX 5090', vram: 32, sar: 5.2 },
  { model: 'NVIDIA RTX 4090', vram: 24, sar: 3.62 },
  { model: 'NVIDIA RTX 3090', vram: 24, sar: 2.5 },
]

const SUBS: ReadonlyArray<{ nameEn: string; nameAr: string; sar: number; pctEn: string; pctAr: string; perksEn: string[]; perksAr: string[] }> = [
  {
    nameEn: 'Starter', nameAr: 'المبتدئ', sar: 375, pctEn: '15% off', pctAr: 'خصم ١٥٪',
    perksEn: ['Discounted token allowance', 'Per-second pod billing', 'Email support'],
    perksAr: ['بدل رموز بخصم', 'فوترة الحاويات بالثانية', 'دعم بالبريد'],
  },
  {
    nameEn: 'Growth', nameAr: 'النمو', sar: 1500, pctEn: '22% off', pctAr: 'خصم ٢٢٪',
    perksEn: ['Larger discounted allowance', 'Priority pod scheduling', 'Workspace sharing'],
    perksAr: ['بدل أوسع بخصم', 'جدولة حاويات بأولوية', 'مشاركة مساحة العمل'],
  },
  {
    nameEn: 'Scale', nameAr: 'الحجم', sar: 5625, pctEn: '30% off', pctAr: 'خصم ٣٠٪',
    perksEn: ['Max discounted allowance', 'Reserved capacity option', 'Dedicated CSM'],
    perksAr: ['بدل بخصم أعلى', 'خيار سعة محجوزة', 'مدير حساب مخصص'],
  },
]

export default function PricingPage() {
  const { toggle, lang } = useV2()

  return (
    <>
      <header className="dx-top">
        <Link href="/" className="wm">
          DCP<i>∞</i>
          <span className="tag"><Bi en="Pricing" ar="الأسعار" /></span>
        </Link>
        <div className="links">
          <Link href="/"><Bi en="Home" ar="الرئيسية" /></Link>
          <Link href="/marketplace"><Bi en="Marketplace" ar="السوق" /></Link>
          <Link href="/containers"><Bi en="GPU Pods" ar="حاويات GPU" /></Link>
          <Link href="/docs"><Bi en="Docs" ar="التوثيق" /></Link>
          <button type="button" className="dx-langpill" onClick={toggle} aria-label="Toggle language">
            <span className={lang === 'en' ? 'on' : undefined}>EN</span>
            <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
          </button>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Pricing · cost-plus · SAR" ar="§ الأسعار · تكلفة + هامش · ريال" /></span>
            <span><Bi en="Per token · per GPU-second · subscriptions" ar="بالرمز · بثانية المعالج · اشتراكات" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(40px, 6vw, 84px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: '24px 0 0', textWrap: 'balance' }}>
            <BiX
              en={<>Pay for what you use. <em style={{ fontStyle: 'italic', backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>Refunded when you stop.</em></>}
              ar={<>ادفع مقابل ما تستخدم. <em style={{ backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>يُسترد عند الإيقاف.</em></>}
            />
          </h1>
          <p className="lead" style={{ color: 'var(--ink-2)', fontSize: 18, lineHeight: 1.55, maxWidth: '62ch', margin: '22px 0 0' }}>
            <Bi
              en="No procurement, no quota, no flat monthly GPU. Inference is billed per million tokens; pods are billed per GPU-second, cost-plus from the live market, and the unused time is refunded the instant you stop. Everything is priced in Saudi Riyal, shown before you commit."
              ar="بلا مشتريات، بلا حصة، بلا إيجار شهري ثابت. الاستدلال يُفوتر لكل مليون رمز؛ والحاويات تُفوتر بثانية المعالج، تكلفة + هامش من السوق الحي، ويُسترد الوقت غير المستخدم لحظة إيقافك. كل شيء بالريال السعودي، يُعرض قبل التزامك."
            />
          </p>
        </div>
      </section>

      {/* ─── Snapshot cards ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <div className="ps-grid">
            <div className="ps-it">
              <span className="sub"><Bi en="Inference API" ar="واجهة الاستدلال" /></span>
              <span className="nm"><Bi en="Per million tokens" ar="لكل مليون رمز" /></span>
              <span className="pr">5<span className="u"><Bi en="halala / 1M from" ar="هللة / مليون من" /></span></span>
              <span className="sub"><Bi en="api.dcp.sa/v1 · OpenAI-compatible" ar="api.dcp.sa/v1 · متوافق مع OpenAI" /></span>
            </div>
            <div className="ps-it">
              <span className="sub"><Bi en="GPU Pods" ar="حاويات GPU" /></span>
              <span className="nm"><Bi en="Per GPU-second" ar="بثانية المعالج" /></span>
              <span className="pr">2.5<span className="u"><Bi en="SAR / hr from" ar="ريال / ساعة من" /></span></span>
              <span className="sub"><Bi en="Refunded on stop · root + SSH + Jupyter" ar="يُسترد عند الإيقاف · جذر + SSH + Jupyter" /></span>
            </div>
            <div className="ps-it">
              <span className="sub"><Bi en="New accounts" ar="الحسابات الجديدة" /></span>
              <span className="nm"><Bi en="Starter credit" ar="رصيد البداية" /></span>
              <span className="pr">100<span className="u"><Bi en="SAR · no card" ar="ريال · بلا بطاقة" /></span></span>
              <span className="sub"><Bi en="Fund later in SAR or USDC" ar="ادفع لاحقاً بالريال أو USDC" /></span>
            </div>
            <div className="ps-it frontier">
              <span className="sub"><Bi en="Subscriptions" ar="الاشتراكات" /></span>
              <span className="nm"><Bi en="Monthly plans" ar="خطط شهرية" /></span>
              <span className="pr">375<span className="u"><Bi en="SAR / mo from" ar="ريال / شهر من" /></span></span>
              <span className="sub"><Bi en="Discounted token allowance" ar="بدل رموز بخصم" /></span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Per-token inference rates by class ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Inference · per 1M tokens" ar="§ الاستدلال · لكل مليون رمز" /></span>
            <span><Bi en="100 halala = 1 SAR" ar="١٠٠ هللة = ١ ريال" /></span>
          </div>
          <div className="mp-live" style={{ marginTop: 18 }}>
            <div className="mp-live-head">
              <span><Bi en="Rate by model class — halala per 1 million tokens" ar="السعر حسب فئة النموذج — هللة لكل مليون رمز" /></span>
              <span><Bi en="Halala = 1/100 SAR" ar="الهللة = ١/١٠٠ ريال" /></span>
            </div>
            <div className="mp-rows">
              <div className="mp-row mp-row-head" aria-hidden="true">
                <span><Bi en="Model class" ar="فئة النموذج" /></span>
                <span><Bi en="Example" ar="مثال" /></span>
                <span><Bi en="In / out" ar="دخول / خروج" /></span>
                <span><Bi en="Halala / 1M" ar="هللة / مليون" /></span>
              </div>
              {TOKEN_CLASSES.map((t) => (
                <div className="mp-row" key={t.cEn}>
                  <span className="mp-model">
                    <b><Bi en={t.cEn} ar={t.cAr} /></b>
                  </span>
                  <span><Bi en={t.cEn === 'Embedding' ? 'embeddings' : t.cEn === 'Large' ? 'DeepSeek V4 Pro' : 'chat model'} ar={t.cEn === 'Embedding' ? 'تضمين' : t.cEn === 'Large' ? 'DeepSeek V4 Pro' : 'نموذج محادثة'} /></span>
                  <span>—</span>
                  <span>{t.hal}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 12, fontFamily: 'var(--mono)' }}>
            <Bi en="Each chat-completion response also returns per-call usage pricing in USD and SAR." ar="كل استجابة محادثة تعرض أيضاً سعر الاستخدام بالدولار والريال." />
          </p>
        </div>
      </section>

      {/* ─── GPU rental grid ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ GPU Pods · per GPU-second · cost-plus" ar="§ الحاويات · بثانية المعالج · تكلفة + هامش" /></span>
            <span><Bi en="Refreshed every few minutes" ar="يتحدّث كل بضع دقائق" /></span>
          </div>
          <div className="mp-live" style={{ marginTop: 18 }}>
            <div className="mp-live-head">
              <span><Bi en="On-demand GPU types — indicative SAR / hour, from" ar="أنواع معالجات عند الطلب — ريال / ساعة إرشادي، من" /></span>
              <span><Bi en="Billed per second · refunded on stop" ar="بالثانية · يُسترد عند الإيقاف" /></span>
            </div>
            <div className="mp-rows">
              <div className="mp-row mp-row-head" aria-hidden="true">
                <span><Bi en="GPU" ar="المعالج" /></span>
                <span><Bi en="VRAM" ar="الذاكرة" /></span>
                <span><Bi en="SAR / hr from" ar="ريال / ساعة من" /></span>
              </div>
              {GPU_ROWS.map((g) => (
                <div className="mp-row" key={g.model}>
                  <span className="mp-model"><b>{g.model}</b></span>
                  <span>{g.vram} GB</span>
                  <span>{g.sar.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 12, fontFamily: 'var(--mono)' }}>
            <Bi
              en="GPU pod prices are cost-plus from the live market and refresh every few minutes; the rate at launch is the rate you pay for that pod."
              ar="أسعار الحاويات تكلفة + هامش من السوق الحي وتتحدّث كل بضع دقائق؛ السعر عند الإطلاق هو ما تدفعه لتلك الحاوية."
            />
          </p>
          <div className="ctas" style={{ marginTop: 20 }}>
            <Link className="btn primary" href="/containers">
              <Bi en="See GPU pods →" ar="راجع الحاويات ←" />
            </Link>
            <Link className="btn ghost" href="/marketplace">
              <Bi en="Browse marketplace" ar="تصفّح السوق" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Subscription tiers ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 44 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Monthly subscriptions · optional" ar="§ اشتراكات شهرية · اختيارية" /></span>
            <span><Bi en="For steady-usage teams" ar="للفرق ذات الاستخدام المنتظم" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 18 }}>
            {SUBS.map((s) => (
              <article className="mg" key={s.nameEn}>
                <span className="org"><Bi en={s.nameEn} ar={s.nameAr} /></span>
                <h3 className="nm">{s.sar.toLocaleString()} <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--mut)' }}><Bi en="SAR / mo" ar="ريال / شهر" /></span></h3>
                <span className="tag"><Bi en={s.pctEn} ar={s.pctAr} /></span>
                <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.6 }}>
                  {s.perksEn.map((p, i) => (
                    <li key={p}><Bi en={p} ar={s.perksAr[i]} /></li>
                  ))}
                </ul>
                <div className="meta">
                  <span><Bi en="Discounted allowance" ar="بدل بخصم" /></span>
                  <Link href="/setup"><Bi en="Start →" ar="ابدأ ←" /></Link>
                </div>
              </article>
            ))}
            <article className="mg frontier">
              <span className="org"><Bi en="Enterprise" ar="المؤسسات" /></span>
              <h3 className="nm"><Bi en="Custom" ar="حسب الطلب" /></h3>
              <span className="tag"><Bi en="VPC · DPA · MSA" ar="VPC · DPA · MSA" /></span>
              <p>
                <Bi
                  en="Run it in your own VPC, with a DPA, MSA, and data-flow appendix. Dedicated capacity and a CSM."
                  ar="شغّله في بيئتك الخاصة، مع DPA وMSA وملحق تدفق البيانات. سعة مخصصة ومدير حساب."
                />
              </p>
              <div className="meta">
                <span><Bi en="Sovereignty preserved" ar="السيادة محفوظة" /></span>
                <Link href="/support"><Bi en="Talk to sales →" ar="تواصل مع المبيعات ←" /></Link>
              </div>
            </article>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 14, fontFamily: 'var(--mono)' }}>
            <Bi en="Pay-as-you-go remains the default — subscriptions are optional and do not lock you in. Unused subscription tokens do not roll over." ar="الدفع حسب الاستخدام يبقى الافتراضي — الاشتراكات اختيارية ولا تقيّدك. الرموز غير المستخدمة لا تتدحرج." />
          </p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq">
        <div className="wrap" style={{ paddingTop: 48 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Pricing FAQ" ar="§ أسئلة الأسعار" /></span>
            <span><Bi en="Cost-plus · refunds · subscriptions" ar="تكلفة + هامش · استرداد · اشتراكات" /></span>
          </div>
          <div style={{ display: 'grid', gap: 0, marginTop: 14 }}>
            {PRICING_FAQ.map((f, i) => (
              <details key={`pf-${i}`} style={{ borderTop: '1px solid var(--hair)', padding: '18px 0' }} {...(i === 0 ? { open: true } : {})}>
                <summary style={{ cursor: 'pointer', fontSize: 18, fontWeight: 500, color: 'var(--ink)', listStyle: 'none' }}>{f.q}</summary>
                <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.7 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── End CTA ─── */}
      <section className="home-end">
        <div className="wrap">
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(32px, 4.5vw, 56px)', lineHeight: 1, letterSpacing: '-.02em', margin: 0, textWrap: 'balance' }}>
            <BiX
              en={<>Start with 100 SAR. <em>No card.</em></>}
              ar={<>ابدأ بـ١٠٠ ريال. <em>بلا بطاقة.</em></>}
            />
          </h2>
          <div className="ctas" style={{ marginTop: 28 }}>
            <Link className="btn primary lg" href="/setup">
              <Bi en="Start free →" ar="ابدأ مجاناً ←" />
            </Link>
            <Link className="btn ghost lg" href="/renter/playground">
              <Bi en="Open playground" ar="افتح ساحة التجربة" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}