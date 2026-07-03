'use client'

// /marketplace — the live GPU + model marketplace. Reuses the home design
// system (home.css) + docs chrome (docs.css). Pattern A (inline dx-top header).
// All live telemetry is honest: LiveCapacity polls /api/health/detailed +
// /v1/models and shows whatever is true now (including 0), never simulated.

import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX, useV2 } from '@/app/(site)/lib/i18n'
import GpuAvailability from '@/app/(site)/components/gpu-availability/GpuAvailability'
import { LiveCapacity } from '@/app/(site)/components/live-capacity/LiveCapacity'
import '../(home)/home.css'
import '../docs/docs.css'

export default function MarketplacePage() {
  const { toggle, lang } = useV2()

  return (
    <>
      <SiteHeader active="/marketplace" />

      {/* ─── Hero ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ Live marketplace · KSA provider mesh" ar="§ سوق حي · شبكة مزوّدين داخل المملكة" />
            </span>
            <span>
              <Bi en="Published only after live verification" ar="يُنشر فقط بعد تحقق حي" />
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(40px, 6vw, 80px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: '24px 0 0', textWrap: 'balance' }}>
            <BiX
              en={<>The Saudi GPU market, <em style={{ fontStyle: 'italic', backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>honestly listed.</em></>}
              ar={<>سوق المعالجات السعودية، <em style={{ backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>إدراج صادق.</em></>}
            />
          </h1>
          <p className="lead" style={{ color: 'var(--ink-2)', fontSize: 18, lineHeight: 1.55, maxWidth: '62ch', margin: '22px 0 0' }}>
            <Bi
              en="Every machine below was reached, asked a real question, and verified to answer — moments ago, not at sign-up. The moment any check fails, it leaves the list. Live capacity and per-token SAR rates come straight from the catalog."
              ar="كل جهاز أدناه تم الوصول إليه وسؤاله سؤالاً حقيقياً والتحقق من إجابته — قبل لحظات، لا عند التسجيل. ولحظة فشل أي فحص يغادر القائمة. السعة الحية وأسعار الريال بالرمز تأتي مباشرة من الكتالوج."
            />
          </p>
        </div>
      </section>

      {/* ─── Live capacity + served models ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <LiveCapacity />
        </div>
      </section>

      {/* ─── GPU availability (verified provider mesh) ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 8 }}>
          <GpuAvailability variant="marketplace" />
        </div>
      </section>

      {/* ─── Model lineup ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ Model lineup · Arabic-first" ar="§ باقة النماذج · عربية أولاً" />
            </span>
            <span>
              <Bi en="OpenAI-compatible · served in-Kingdom" ar="متوافق مع OpenAI · داخل المملكة" />
            </span>
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            <article className="mg">
              <span className="org">Allam · Q4</span>
              <h3 className="nm">ALLaM-7B</h3>
              <span className="tag">Arabic-first LLM</span>
              <p>
                <Bi
                  en="SDAIA's Arabic-large language model, quantized for fast in-Kingdom serving. The reference Arabic model on DCP."
                  ar="نموذج سدايا العربي الكميّم للخدمة السريعة داخل المملكة. النموذج العربي المرجعي على DCP."
                />
              </p>
              <div className="meta">
                <span><Bi en="Served from KSA GPUs" ar="يُخدم من معالجات المملكة" /></span>
                <b dir="ltr">api.dcp.sa/v1</b>
              </div>
            </article>

            <article className="mg">
              <span className="org">DeepSeek · V4 Flash</span>
              <h3 className="nm">DeepSeek V4 Flash</h3>
              <span className="tag">Fast · cheap</span>
              <p>
                <Bi
                  en="The fast tier. Drop-in OpenAI-compatible chat endpoint, streamed from KSA-resident GPUs."
                  ar="الفئة السريعة. نقطة محادثة متوافقة مع OpenAI، تبثّ من معالجات داخل المملكة."
                />
              </p>
              <div className="meta">
                <span><Bi en="Per 1M tokens" ar="لكل مليون رمز" /></span>
                <b dir="ltr">1.10 / 3.40 SAR</b>
              </div>
            </article>

            <article className="mg">
              <span className="org">DeepSeek · V4 Pro</span>
              <h3 className="nm">DeepSeek V4 Pro</h3>
              <span className="tag">Frontier-class</span>
              <p>
                <Bi
                  en="The deep-reasoning tier. Higher quality for harder prompts; still in-Kingdom, still SAR-billed."
                  ar="فئة الاستدلال العميق. جودة أعلى للمطالبات الأصعب؛ لا تزال داخل المملكة وبالريال."
                />
              </p>
              <div className="meta">
                <span><Bi en="Per 1M tokens" ar="لكل مليون رمز" /></span>
                <b dir="ltr">4.20 / 12.60 SAR</b>
              </div>
            </article>

            <article className="mg frontier">
              <span className="org">Roadmap</span>
              <h3 className="nm">
                <Bi en="More models, opt-in" ar="نماذج أكثر، بإذن" />
              </h3>
              <span className="tag">Cross-border · opt-in</span>
              <p>
                <Bi
                  en="Frontier models arrive behind an explicit per-tenant opt-in — never on by default. Your data stays in the Kingdom unless you ask it to leave."
                  ar="النماذج المتقدمة تأتي خلف إذن صريح لكل مستأجر — ليست مفتوحة افتراضياً. بياناتك تبقى في المملكة إلا إن طلبت خروجها."
                />
              </p>
              <div className="meta">
                <span><Bi en="Sovereignty preserved" ar="السيادة محفوظة" /></span>
                <Link href="/trust-center">
                  <Bi en="Trust center →" ar="مركز الثقة ←" />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ─── End CTA ─── */}
      <section className="home-end">
        <div className="wrap">
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(32px, 4.5vw, 56px)', lineHeight: 1, letterSpacing: '-.02em', margin: 0, textWrap: 'balance' }}>
            <BiX
              en={<>Rent a whole GPU, or call the API. <em>Both in SAR.</em></>}
              ar={<>استأجر معالجاً كاملاً، أو استدعِ الواجهة. <em>كلاهما بالريال.</em></>}
            />
          </h2>
          <div className="ctas" style={{ marginTop: 28 }}>
            <Link className="btn primary lg" href="/setup">
              <Bi en="Start free · no card →" ar="ابدأ مجاناً · بلا بطاقة ←" />
            </Link>
            <Link className="btn ghost lg" href="/containers">
              <Bi en="See GPU pods" ar="راجع الحاويات" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}