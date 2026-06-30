// v2 marketing home — reworked.
// A SERVER component composing 6 editorial sections + a few interactive client
// leaves (HomeChrome, HeroMeshCanvas, DemoChat). The hero headline server-renders
// via the <BiX> bilingual-CSS-toggle so it lands in the initial HTML (LCP win)
// without waiting for the client i18n context. dcp-kit.css is imported by the
// site layout; only the co-located page CSS is imported here.

import Link from 'next/link'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import { HomeChrome } from '@/app/(site)/components/home-chrome/HomeChrome'
import { HeroMeshCanvas } from '@/app/(site)/components/hero-mesh/HeroMeshCanvas'
import { DemoChat } from '@/app/(site)/components/demo-chat/DemoChat'
import { CAPACITY_GATES, HOME_FAQ_VISIBLE } from './home-data'
import './home.css'

export default function V2HomePage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh', fontFamily: 'var(--sans)' }}>
      <HomeChrome />

      {/* ═══════════════ §01 HERO ═══════════════ */}
      <section className="home-hero">
        <div className="wrap">
          <div className="home-hero-grid hero-2col">
            <div className="hero-copy">
              <span className="eyebrow">
                <Bi en="§ WHOLE GPUs · BY THE SECOND · IN RIYALS" ar="§ معالجات كاملة · بالثانية · بالريال" />
              </span>
              <h1>
                <BiX
                  en={
                    <>
                      Rent a whole GPU <em>by the second.</em>
                      <br />
                      Stop paying for the other 59 minutes.
                    </>
                  }
                  ar={
                    <>
                      استأجر معالجاً كاملاً <em>بالثانية.</em>
                      <br />
                      لا تدفع مقابل الدقائق الـ٥٩ الباقية.
                    </>
                  }
                />
              </h1>
              <p className="lead">
                <Bi
                  en="Root, SSH, and Jupyter in about a minute. Billed per second in Riyal — and the unused time is refunded the instant you stop. No procurement ticket. No quota waitlist. No bill that runs away while you sleep."
                  ar="‏Root وSSH وJupyter خلال دقيقة تقريباً. محاسبة بالثانية بالريال — ويُعاد إليك الوقت غير المستخدم لحظة إيقافك. بلا طلب شراء، بلا قائمة انتظار، وبلا فاتورة تتضخّم وأنت نائم."
                />
              </p>

              <div className="door-grid">
                <Link className="door" href="/renter/playground">
                  <span className="door-k">
                    <Bi en="for builders" ar="للمطوّرين" />
                  </span>
                  <span className="door-t">
                    <Bi en="Use AI models" ar="استخدم النماذج" />
                  </span>
                  <span className="door-d">
                    <Bi
                      en="OpenAI-compatible API and playground. Pay per token, in SAR."
                      ar="واجهة متوافقة مع OpenAI وساحة تجربة. ادفع بالرمز، بالريال."
                    />
                  </span>
                  <span className="door-a">→</span>
                </Link>
                <Link className="door" href="/containers">
                  <span className="door-k">
                    <Bi en="for compute" ar="للحوسبة" />
                  </span>
                  <span className="door-t">
                    <Bi en="Rent a whole GPU" ar="استأجر معالجاً كاملاً" />
                  </span>
                  <span className="door-d">
                    <Bi
                      en="A whole RTX-class GPU, dedicated to you — Jupyter + SSH in about a minute."
                      ar="معالج RTX كامل مخصص لك — Jupyter و SSH خلال دقيقة تقريباً."
                    />
                  </span>
                  <span className="door-a">→</span>
                </Link>
              </div>

              <DemoChat />

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
                  <span className="flag">🌐</span>{' '}
                  <span><Bi en="Frontier · opt-in only" ar="متقدم · بإذن فقط" /></span>
                </span>
              </div>
            </div>

            <div className="hero-visual">
              <HeroMeshCanvas />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §02 WHAT DCP IS ═══════════════ */}
      <section id="what">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 01 · What DCP is" ar="§ ٠١ · ما هو DCP" />
            </span>
            <span>
              <Bi en="Inference · agents · a provider mesh — one Saudi runtime" ar="استدلال · وكلاء · شبكة مزوّدين — بيئة سعودية واحدة" />
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
                <Link href="/pricing">
                  <Bi en="See rates →" ar="عرض الأسعار ←" />
                </Link>
              </div>
            </div>
            <div className="layer">
              <span className="n">
                <Bi en="02 · Agents" ar="٠٢ · وكلاء" />
              </span>
              <h3>
                <BiX
                  en={
                    <>
                      DCP-Agent. <em>Live for SMB.</em>
                    </>
                  }
                  ar={
                    <>
                      DCP-Agent. <em>جاهز للمنشآت.</em>
                    </>
                  }
                />
              </h3>
              <p>
                <Bi
                  en="The Arabic AI agent for Saudi small & mid-size businesses. Already in production at agents.dcp.sa. A free personal version for every Saudi is coming."
                  ar="وكيل الذكاء العربي للمنشآت السعودية الصغيرة والمتوسطة. جاهز وفي الإنتاج على agents.dcp.sa. النسخة الشخصية المجانية لكل مواطن سعودي قريباً."
                />
              </p>
              <div className="end">
                <span>agents.dcp.sa</span>
                <Link href="/agents">
                  <Bi en="Visit →" ar="زر ←" />
                </Link>
              </div>
            </div>
            <div className="layer">
              <span className="n">
                <Bi en="03 · Providers" ar="٠٣ · مزوّدون" />
              </span>
              <h3>
                <BiX
                  en={
                    <>
                      Earn SAR with <em>your GPU.</em>
                    </>
                  }
                  ar={
                    <>
                      اكسب ريالاً من <em>معالجك.</em>
                    </>
                  }
                />
              </h3>
              <p>
                <Bi
                  en="A 4 MB desktop app for Windows, macOS Apple Silicon, and Linux. Auto-detects your GPU, installs the inference engine, downloads a model, and reports measured throughput after verification. Joins a self-hosted WireGuard mesh — no port forwarding."
                  ar="تطبيق سطح مكتب بحجم ٤ ميغابايت لـWindows وmacOS Apple Silicon وLinux. يكتشف المعالج تلقائياً، ويصب محرّك الاستدلال، وينزّل نموذجاً، ويعرض السرعة المقاسة بعد التحقق. ينضم إلى شبكة WireGuard ذاتية الاستضافة — دون فتح منافذ."
                />
              </p>
              <ul>
                <li><Bi en="Windows · macOS Apple Silicon · Linux" ar="Windows · macOS Apple Silicon · Linux" /></li>
                <li><Bi en="4 MB app · zero config · WireGuard mesh" ar="٤ ميغابايت · بلا إعداد · شبكة WireGuard" /></li>
                <li><Bi en="85% provider · 15% platform · monthly SAR payout" ar="٨٥٪ للمزوّد · ١٥٪ للمنصّة · دفع شهري بالريال" /></li>
              </ul>
              <div className="end">
                <span>dcp.sa / provider-setup</span>
                <Link href="/provider-setup">
                  <Bi en="Register a GPU →" ar="سجّل معالجاً ←" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §03 WHY IT'S HONEST ═══════════════ */}
      <section id="honest">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 02 · Proof, not a hand-typed list" ar="§ ٠٢ · دليل، لا قائمة مكتوبة يدوياً" />
            </span>
            <span>
              <Bi en="A machine appears only after we prove it answers" ar="لا يظهر الجهاز إلا بعد أن نثبت أنه يجيب" />
            </span>
          </div>
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
              <div className="mp-foot" style={{ marginTop: 18 }}>
                <Link href="/marketplace">
                  <Bi en="See live capacity →" ar="راجع السعة الحية ←" />
                </Link>
                <Link href="/status">
                  <Bi en="Check /status" ar="راجع الحالة" />
                </Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Published capacity gates">
              {CAPACITY_GATES.map((gate, index) => (
                <div className="capacity-gate" key={gate.k}>
                  <span className="gate-n">{String(index + 1).padStart(2, '0')}</span>
                  <span className="gate-t">
                    <Bi en={gate.tEn} ar={gate.tAr} /> <i className="gate-k-inline" dir="ltr">{gate.k}</i>
                  </span>
                  <p>
                    <Bi en={gate.en} ar={gate.ar} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §04 TWO PATHS IN ═══════════════ */}
      <section id="register">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 03 · Two paths in" ar="§ ٠٣ · مساران للدخول" />
            </span>
            <span>
              <Bi en="Renter · or · Provider" ar="مستخدم · أو · مزوّد" />
            </span>
          </div>
          <div className="paths paths-2">
            <div className="path">
              <span className="lbl">
                <Bi en="A · I want to use DCP" ar="A · أريد استخدام DCP" />
              </span>
              <h3>
                <BiX
                  en={<>Build with <em>Arabic AI.</em></>}
                  ar={<>ابنِ بـ<em>الذكاء العربي.</em></>}
                />
              </h3>
              <p className="desc">
                <Bi
                  en="For founders, banks, hospitals, regulators, agencies. You ship the product; we serve the inference and the agents. SAR billing, halala-grained, no rental contracts."
                  ar="للمؤسسين والبنوك والمستشفيات والجهات التنظيمية والوكالات. أنت تشحن المنتج؛ ونحن نقدّم الاستدلال والوكلاء. فوترة بالريال بدقة الهللة، بلا عقود إيجار."
                />
              </p>
              <Link className="btn primary lg" href="/setup">
                <Bi en="Start free · no card →" ar="ابدأ مجاناً · بلا بطاقة ←" />
              </Link>
            </div>
            <div className="path">
              <span className="lbl">
                <Bi en="B · I have a GPU to earn from" ar="B · لدي معالج أريد الكسب منه" />
              </span>
              <h3>
                <BiX
                  en={<>Turn idle iron into <em>Riyal.</em></>}
                  ar={<>حوّل عتاداً خاملاً إلى <em>ريال.</em></>}
                />
              </h3>
              <p className="desc">
                <Bi
                  en="A 4 MB app auto-detects your card, joins the verified WireGuard mesh, and pays you 85% of inference revenue in monthly SAR. No port forwarding, no DevOps."
                  ar="تطبيق بحجم ٤ ميغابايت يكتشف بطاقتك تلقائياً، ينضم لشبكة WireGuard المتحققة، ويدفع لك ٨٥٪ من إيراد الاستدلال شهرياً بالريال. بلا فتح منافذ، بلا عمليات تشغيل."
                />
              </p>
              <Link className="btn primary lg" href="/provider-setup">
                <Bi en="Register a GPU →" ar="سجّل معالجاً ←" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §05 FAQ (top 3 — full set in JSON-LD) ═══════════════ */}
      <section id="faq">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 04 · The questions people ask AI" ar="§ ٠٤ · الأسئلة الشائعة · ما يسأله الناس للذكاء الاصطناعي" />
            </span>
            <span>
              <Bi en="Rent a GPU · OpenAI-compatible API · MCP · sovereignty" ar="إيجار معالج · واجهة متوافقة مع OpenAI · MCP · السيادة" />
            </span>
          </div>
          <div className="faq-list" style={{ display: 'grid', gap: 0 }}>
            {HOME_FAQ_VISIBLE.map((f, i) => (
              <details key={`faq-${i}`} className="faq-item" style={{ borderTop: '1px solid var(--hair)', padding: '18px 0' }} {...(i === 0 ? { open: true } : {})}>
                <summary style={{ cursor: 'pointer', fontSize: 18, fontWeight: 500, color: 'var(--ink)', listStyle: 'none' }}>
                  <Bi en={f.qEn} ar={f.qAr} />
                </summary>
                <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.7 }} dir="auto">
                  <Bi en={f.aEn} ar={f.aAr} />
                </p>
              </details>
            ))}
          </div>
          <p style={{ marginTop: 18, color: 'var(--mut)', fontSize: 14 }}>
            <Link href="/docs">
              <Bi en="Full FAQ + API reference in the docs →" ar="الأسئلة الكاملة ومرجع الواجهة في التوثيق ←" />
            </Link>
          </p>
        </div>
      </section>

      {/* ═══════════════ §06 COMPLIANCE BAND ═══════════════ */}
      <section>
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 05 · Proof, not promises" ar="§ ٠٥ · دليل، لا وعود" />
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

      {/* ═══════════════ §07 END CTA ═══════════════ */}
      <section className="home-end">
        <div className="wrap">
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            <Bi en="§ Ready when you are" ar="§ جاهزون عندما تكونون" />
          </span>
          <h2>
            <BiX
              en={<>Sovereign Arabic AI. <em>Run it.</em></>}
              ar={<>ذكاء اصطناعي عربي سيادي. <em>شغّله.</em></>}
            />
          </h2>
          <p>
            <Bi
              en="Eight minutes from this page to a ready renter workspace. First inference is enabled by the catalog only when a verified serving model is online. No procurement. No data-egress conversation. No flat GPU rental."
              ar="ثماني دقائق من هذه الصفحة إلى مساحة عمل جاهزة للمستأجر. يفتح الفهرس أول طلب استدلال فقط عندما يكون نموذج مخدوم ومتحقق متصلاً. بلا مشتريات، بلا نقاش حول خروج البيانات، بلا إيجار معالجات ثابت."
            />
          </p>
          <div className="ctas">
            <Link className="btn primary lg" href="/setup">
              <Bi en="Start free · no card →" ar="ابدأ مجاناً · بلا بطاقة ←" />
            </Link>
            <Link className="btn ghost lg" href="/renter/playground">
              <Bi en="Open playground" ar="افتح ساحة التجربة" />
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
              <li><Link href="/"><Bi en="Overview" ar="نظرة عامة" /></Link></li>
              <li><Link href="/marketplace"><Bi en="Marketplace" ar="السوق" /></Link></li>
              <li><Link href="/containers"><Bi en="GPU Pods" ar="حاويات GPU" /></Link></li>
              <li><Link href="/agents"><Bi en="Agents" ar="الوكلاء" /></Link></li>
              <li><Link href="/pricing"><Bi en="Pricing" ar="الأسعار" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Build" ar="البناء" /></h4>
            <ul>
              <li><Link href="/docs"><Bi en="API docs" ar="توثيق الواجهة" /></Link></li>
              <li><Link href="/docs"><Bi en="Quick start" ar="بدء سريع" /></Link></li>
              <li><Link href="/setup"><Bi en="Get an API key" ar="احصل على مفتاح" /></Link></li>
              <li><Link href="/renter/playground"><Bi en="Playground" ar="بيئة الاختبار" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Renters" ar="المستخدمون" /></h4>
            <ul>
              <li><Link href="/setup"><Bi en="Sign up" ar="اشترك" /></Link></li>
              <li><Link href="/auth"><Bi en="Sign in" ar="دخول" /></Link></li>
              <li><Link href="/renter/dashboard"><Bi en="Console" ar="لوحة التحكم" /></Link></li>
              <li><Link href="/renter/wallet"><Bi en="Wallet" ar="المحفظة" /></Link></li>
              <li><Link href="/renter/invoices"><Bi en="Invoices" ar="الفواتير" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Providers" ar="المزوّدون" /></h4>
            <ul>
              <li><Link href="/provider/dashboard"><Bi en="Provider console" ar="لوحة المزوّد" /></Link></li>
              <li><Link href="/provider/rigs"><Bi en="Rigs" ar="الأجهزة" /></Link></li>
              <li><Link href="/provider/earnings"><Bi en="Earnings" ar="الأرباح" /></Link></li>
              <li><Link href="/provider/payouts"><Bi en="Payouts" ar="المدفوعات" /></Link></li>
              <li><Link href="/pricing"><Bi en="Tiers" ar="الفئات" /></Link></li>
            </ul>
          </div>

          <div>
            <h4><Bi en="Trust" ar="الثقة" /></h4>
            <ul>
              <li><Link href="/trust-center"><Bi en="Trust center" ar="مركز الثقة" /></Link></li>
              <li><Link href="/status"><Bi en="Live status" ar="الحالة الحية" /></Link></li>
              <li><Link href="/support"><Bi en="Talk to sales" ar="تواصل مع المبيعات" /></Link></li>
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