// v2 marketing home — product-first rework.
// A SERVER component composing editorial sections + a few interactive client
// leaves (HomeChrome, HeroMeshCanvas, DemoChat). The two products (GPU pods,
// inference API) lead: hero doors → §01 pods showcase → §02 inference showcase,
// each with a generated cinematic visual so the page reads as a product, not a
// text column. The hero headline server-renders via <BiX> (LCP win). GPU rates
// import from structured-data.ts so visible prices and JSON-LD can never drift.

import Link from 'next/link'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import { HomeChrome } from '@/app/(site)/components/home-chrome/HomeChrome'
import { HeroMeshCanvas } from '@/app/(site)/components/hero-mesh/HeroMeshCanvas'
import { DemoChat } from '@/app/(site)/components/demo-chat/DemoChat'
import { PodMeter } from '@/app/(site)/components/pod-meter/PodMeter'
import { BootEgg } from '@/app/(site)/components/boot-egg/BootEgg'
import { EggWord } from '@/app/(site)/components/boot-egg/EggWord'
import { TokenDrift } from '@/app/(site)/components/token-drift/TokenDrift'
import { GPU_SKUS } from '@/app/lib/structured-data'
import { HOME_FAQ_VISIBLE } from './home-data'
import './home.css'

export default function V2HomePage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh', fontFamily: 'var(--sans)' }}>
      <HomeChrome />
      <BootEgg />

      {/* ═══════════════ §00 HERO — full-bleed live mesh ═══════════════ */}
      <section className="home-hero hero-bleed">
        <HeroMeshCanvas className="hero-mesh--bleed" />
        <div className="wrap">
          <div className="hero-copy hero-copy-bleed">
              <span className="eyebrow">
                <Bi en="§ WHOLE GPUs · RENT BY THE SECOND · IN RIYALS" ar="§ معالجات كاملة · استئجار بالثانية · بالريال" />
              </span>
              <h1>
                <BiX
                  en={
                    <>
                      Rent a whole <EggWord>GPU</EggWord> <em>by the second.</em>
                      <br />
                      Stop paying for the other 59{' '}minutes.
                    </>
                  }
                  ar={
                    <>
                      استأجر <EggWord>معالجاً</EggWord> كاملاً <em>بالثانية.</em>
                      <br />
                      لا تدفع مقابل الدقائق الـ٥٩ الباقية.
                    </>
                  }
                />
              </h1>
              <p className="lead">
                <Bi
                  en="GPU pods in Saudi Arabia: root, SSH and Jupyter in about a minute, billed per second in Riyal — and the unused time is refunded the instant you stop. When you don't need the whole card, the same mesh answers as an OpenAI-compatible API."
                  ar="حاويات GPU في السعودية: Root وSSH وJupyter خلال دقيقة تقريباً، بفوترة بالثانية بالريال — ويُعاد الوقت غير المستخدم لحظة إيقافك. وحين لا تحتاج البطاقة كاملة، تجيبك الشبكة نفسها كواجهة متوافقة مع OpenAI."
                />
              </p>

              <div className="door-grid">
                <Link className="door" href="/pods">
                  <span className="door-k">
                    <Bi en="Product 01 · compute" ar="المنتج ٠١ · حوسبة" />
                  </span>
                  <span className="door-t">
                    <Bi en="GPU Pods" ar="حاويات GPU" />
                  </span>
                  <span className="door-d">
                    <Bi
                      en="A whole RTX-class or datacenter GPU, dedicated to you — Jupyter + SSH in about a minute."
                      ar="معالج كامل من فئة RTX أو مراكز البيانات، مخصص لك — Jupyter وSSH خلال دقيقة تقريباً."
                    />
                  </span>
                  <span className="door-p" dir="ltr">
                    <Bi en="from 2.5 SAR/hr · billed per second" ar="من ٢٫٥ ريال/ساعة · فوترة بالثانية" />
                  </span>
                  <span className="door-a">→</span>
                </Link>
                <Link className="door" href="/inference">
                  <span className="door-k">
                    <Bi en="Product 02 · inference" ar="المنتج ٠٢ · استدلال" />
                  </span>
                  <span className="door-t">
                    <Bi en="Inference API" ar="واجهة الاستدلال" />
                  </span>
                  <span className="door-d">
                    <Bi
                      en="OpenAI-compatible chat, embeddings and rerank — change base_url, keep your code."
                      ar="محادثة وتضمين وإعادة ترتيب متوافقة مع OpenAI — غيّر base_url وأبقِ كودك كما هو."
                    />
                  </span>
                  <span className="door-p" dir="ltr">
                    <Bi en="from 5 halala / 1M tokens" ar="من ٥ هللات / مليون رمز" />
                  </span>
                  <span className="door-a">→</span>
                </Link>
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
                  <span className="flag">🌐</span>{' '}
                  <span><Bi en="Frontier · opt-in only" ar="متقدم · بإذن فقط" /></span>
                </span>
              </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §01 PRODUCT · GPU PODS ═══════════════ */}
      <section id="pods">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 01 · GPU Pods" ar="§ ٠١ · حاويات GPU" />
            </span>
            <span>
              <Bi en="Whole, dedicated NVIDIA GPUs · on-demand · in-Kingdom" ar="معالجات NVIDIA كاملة مخصصة · عند الطلب · داخل المملكة" />
            </span>
          </div>

          <div className="pshow">
            <div className="pshow-media">
              <img
                src="/home/pods.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="Macro photograph of a GPU circuit board lit in teal and amber — the whole-GPU pods DCP rents on demand in Saudi Arabia"
              />
              <span className="pshow-cap" dir="ltr">fig. 01 — whole-GPU pod · dedicated silicon</span>
            </div>
            <div className="pshow-copy">
              <h2>
                <BiX
                  en={<>A whole GPU. Root, Jupyter, SSH. <em>In about a minute.</em></>}
                  ar={<>معالج كامل. Root وJupyter وSSH. <em>خلال دقيقة تقريباً.</em></>}
                />
              </h2>
              <p>
                <Bi
                  en="Not a slice, not a queue — the entire card is yours with a pinned driver. Launch from the console or one API call, extend without a restart, and stop whenever you want: the unused seconds come straight back to your wallet."
                  ar="ليست شريحة ولا طابور انتظار — البطاقة كلها لك مع تعريف مثبّت. شغّلها من لوحة التحكم أو باستدعاء واحد للواجهة، ومدّدها دون إعادة تشغيل، وأوقفها متى شئت: الثواني غير المستخدمة تعود مباشرة إلى محفظتك."
                />
              </p>
              <ul className="pshow-list">
                <li><Bi en="Root + Jupyter over TLS + SSH · persistent /workspace volumes" ar="Root وJupyter عبر TLS وSSH · وحدات /workspace دائمة" /></li>
                <li><Bi en="Prepaid per GPU-second in SAR · prorated refund on early stop" ar="مسبق الدفع بالثانية بالريال · استرداد تناسبي عند الإيقاف المبكر" /></li>
                <li><Bi en="Idempotent money routes · machine-readable 402 for agents" ar="مسارات دفع آمنة التكرار · استجابة 402 مقروءة آلياً للوكلاء" /></li>
              </ul>
              <pre className="term" dir="ltr" aria-label="Launch a pod via the API">
{`$ curl -X POST https://api.dcp.sa/api/pods \\
    -H "Authorization: Bearer $DCP_KEY" \\
    -d '{"gpu_type":"H100","duration_minutes":60}'

201 { "access_url": "https://…/jupyter", "ssh_command": "ssh …" }`}
              </pre>
              <div className="pshow-ctas">
                <Link className="btn primary" href="/pods">
                  <Bi en="Launch a pod →" ar="شغّل حاوية ←" />
                </Link>
                <Link className="btn ghost" href="/pricing">
                  <Bi en="Full pricing" ar="الأسعار الكاملة" />
                </Link>
              </div>
            </div>
          </div>

          {/* live rate rail — same source of truth as the JSON-LD offers.
              Hover flips each price to per-second: the billing unit, felt. */}
          <div className="rate-rail" aria-label="GPU types and indicative hourly rates">
            {GPU_SKUS.map((g) => (
              <div className="rr-it" key={g.model} dir="ltr">
                <span className="rr-n">{g.model.replace('NVIDIA ', '')}</span>
                <span className="rr-v">{g.vramGb} GB</span>
                <span className="rr-p">
                  <Bi en={`from ${g.sarPerHour} SAR/hr`} ar={`من ${g.sarPerHour} ريال/س`} />
                </span>
                <span className="rr-ps" aria-hidden="true">
                  = {(g.sarPerHour / 3600).toFixed(5)} SAR/s
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ §02 PRODUCT · INFERENCE API ═══════════════ */}
      <section id="inference">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 02 · Inference API" ar="§ ٠٢ · واجهة الاستدلال" />
            </span>
            <span>
              <Bi en="OpenAI-compatible · per-token billing in SAR · Arabic-first models" ar="متوافقة مع OpenAI · فوترة بالرمز بالريال · نماذج عربية أولاً" />
            </span>
          </div>

          <div className="pshow flip">
            <div className="pshow-media">
              <img
                src="/home/inference.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="Streams of teal and amber light converging — tokens flowing through DCP's OpenAI-compatible inference API served from Saudi GPUs"
              />
              <TokenDrift />
              <span className="pshow-cap" dir="ltr">fig. 02 — token streams · api.dcp.sa/v1</span>
            </div>
            <div className="pshow-copy">
              <h2>
                <BiX
                  en={<>Point your SDK <em>at the Kingdom.</em></>}
                  ar={<>وجّه SDK الخاص بك <em>إلى المملكة.</em></>}
                />
              </h2>
              <p>
                <Bi
                  en="One line changes: base_url. Chat, embeddings and rerank served from KSA-resident GPUs, with streaming, function calling and JSON mode. An Arabic-first, open-source model lineup — frontier models stay off unless you opt in."
                  ar="سطر واحد يتغيّر: base_url. محادثة وتضمين وإعادة ترتيب من معالجات داخل المملكة، مع البث واستدعاء الدوال ووضع JSON. باقة نماذج مفتوحة عربية أولاً — النماذج المتقدمة تبقى مغلقة حتى تفتحها بنفسك."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="Point an OpenAI SDK at DCP">
{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.dcp.sa/v1",  # ← the only change
    api_key=os.environ["DCP_API_KEY"],
)`}
              </pre>
              <ul className="pshow-list">
                <li><Bi en="Per-1M-token rates by class: 5 → 400 halala · shown before you commit" ar="أسعار لكل مليون رمز حسب الفئة: ٥ → ٤٠٠ هللة · تُعرض قبل الالتزام" /></li>
                <li><Bi en="GET /v1/models carries a live available flag — no stale catalog" ar="‏GET /v1/models تحمل مؤشر توفّر حي — لا فهرس متقادم" /></li>
              </ul>
              <DemoChat />
              <div className="pshow-ctas">
                <Link className="btn primary" href="/renter/playground">
                  <Bi en="Open playground →" ar="افتح ساحة التجربة ←" />
                </Link>
                <Link className="btn ghost" href="/marketplace">
                  <Bi en="Live models" ar="النماذج الحية" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §03 SOVEREIGNTY BAND ═══════════════ */}
      <section className="sov-band" id="sovereign" aria-labelledby="sov-h">
        <img
          src="/home/skyline.webp"
          width={2000}
          height={849}
          loading="lazy"
          decoding="async"
          alt="Riyadh skyline at dawn under a constellation of connected GPU nodes — DCP's in-Kingdom compute mesh"
        />
        <div className="sov-band-in wrap">
          <span className="eyebrow">
            <Bi en="§ 03 · Sovereignty, structurally" ar="§ ٠٣ · سيادة بالبنية" />
          </span>
          <h2 id="sov-h">
            <BiX
              en={<>Everything above runs <em>inside Saudi Arabia.</em></>}
              ar={<>كل ما سبق يعمل <em>داخل السعودية.</em></>}
            />
          </h2>
          <p>
            <Bi
              en="Data, models, storage and the control plane stay in the Kingdom, under Saudi law — not as a policy promise, but because the hardware is here. Cross-border frontier models exist only behind an explicit per-tenant switch."
              ar="البيانات والنماذج والتخزين وطبقة التحكم تبقى في المملكة وتحت النظام السعودي — ليس وعداً في سياسة، بل لأن العتاد هنا فعلاً. النماذج العابرة للحدود لا توجد إلا خلف مفتاح صريح لكل مستأجر."
            />
          </p>
          <div className="compliance sov-compliance">
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
              <span className="sub">DC Power Solutions Co.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §04 EVERY WAY IN ═══════════════
          The "how easy is this really" section: four doors into the same
          mesh — terminal, any OpenAI SDK, browser console, your AI agent —
          plus the honest time-to-pod strip underneath. */}
      <section id="ways">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 04 · Every way in" ar="§ ٠٤ · كل طرق الدخول" />
            </span>
            <span>
              <Bi en="Terminal · any OpenAI SDK · browser · your AI agent" ar="طرفية · أي SDK من OpenAI · متصفح · وكيلك الذكي" />
            </span>
          </div>

          <div className="ways">
            <div className="way">
              <span className="way-k">
                <Bi en="01 · Terminal" ar="٠١ · الطرفية" />
              </span>
              <h3>
                <BiX en={<>One curl. <em>Whole GPU.</em></>} ar={<>أمر curl واحد. <em>معالج كامل.</em></>} />
              </h3>
              <pre className="term slim" dir="ltr" aria-label="Create a pod from the terminal">{`curl -X POST https://api.dcp.sa/api/pods \\
  -H "Authorization: Bearer $DCP_KEY" \\
  -d '{"gpu_type":"H100","duration_minutes":60}'`}</pre>
              <p>
                <Bi
                  en="Root, Jupyter and SSH come back in the response. Extend or stop it the same way."
                  ar="يعود Root وJupyter وSSH في الاستجابة. مدّدها أو أوقفها بالطريقة نفسها."
                />
              </p>
            </div>

            <div className="way">
              <span className="way-k">
                <Bi en="02 · Any OpenAI SDK" ar="٠٢ · أي SDK من OpenAI" />
              </span>
              <h3>
                <BiX en={<>Change one line. <em>Keep your code.</em></>} ar={<>غيّر سطراً واحداً. <em>وأبقِ كودك.</em></>} />
              </h3>
              <pre className="term slim" dir="ltr" aria-label="Point an OpenAI SDK at DCP">{`client = OpenAI(
  base_url="https://api.dcp.sa/v1",
  api_key=DCP_KEY)`}</pre>
              <p>
                <Bi
                  en="Chat, embeddings and rerank from in-Kingdom GPUs — streaming, function calling, JSON mode."
                  ar="محادثة وتضمين وإعادة ترتيب من معالجات داخل المملكة — بث واستدعاء دوال وJSON."
                />
              </p>
            </div>

            <div className="way">
              <span className="way-k">
                <Bi en="03 · Browser" ar="٠٣ · المتصفح" />
              </span>
              <h3>
                <BiX en={<>No terminal? <em>The console.</em></>} ar={<>بلا طرفية؟ <em>لوحة التحكم.</em></>} />
              </h3>
              <p>
                <Bi
                  en="Pick a GPU, click launch, and Jupyter opens in a tab. Wallet, invoices and usage live in the same place. The playground answers before you ever create a key."
                  ar="اختر معالجاً، اضغط تشغيل، وسيفتح Jupyter في تبويب. المحفظة والفواتير والاستخدام في المكان نفسه. وساحة التجربة تجيبك قبل أن تنشئ مفتاحاً أصلاً."
                />
              </p>
              <div className="way-end">
                <Link href="/setup">
                  <Bi en="Open the console →" ar="افتح لوحة التحكم ←" />
                </Link>
              </div>
            </div>

            <div className="way">
              <span className="way-k">
                <Bi en="04 · Your AI agent" ar="٠٤ · وكيلك الذكي" />
              </span>
              <h3>
                <BiX en={<>Agents are <em>first-class.</em></>} ar={<>الوكلاء <em>مواطنون من الدرجة الأولى.</em></>} />
              </h3>
              <pre className="term slim" dir="ltr" aria-label="Install the DCP MCP server">{`npx -y github:dhnpmp-tech/dcp-mcp`}</pre>
              <p>
                <Bi
                  en="An agent self-registers, gets a real key plus a 20 SAR trial, and rents GPUs — zero humans involved."
                  ar="يسجّل الوكيل نفسه، ويحصل على مفتاح حقيقي مع رصيد تجريبي ٢٠ ريالاً، ويستأجر المعالجات — دون أي تدخل بشري."
                />
              </p>
              <div className="way-end">
                <Link href="/agents">
                  <Bi en="The agent guide →" ar="دليل الوكلاء ←" />
                </Link>
              </div>
            </div>
          </div>

          {/* honest time-to-pod strip */}
          <div className="ways-clock" dir="ltr" aria-label="Time from sign-up to a running pod">
            <span className="wc-step"><i>0:00</i> <Bi en="sign up · no card" ar="سجّل · بلا بطاقة" /></span>
            <span className="wc-arrow">→</span>
            <span className="wc-step"><i>0:30</i> <Bi en="fund wallet in SAR" ar="موّل المحفظة بالريال" /></span>
            <span className="wc-arrow">→</span>
            <span className="wc-step"><i>~1:30</i> <Bi en="Jupyter open on a whole GPU" ar="Jupyter يعمل على معالج كامل" /></span>
            <span className="wc-note"><Bi en="billed per second only while it runs" ar="فوترة بالثانية فقط أثناء التشغيل" /></span>
          </div>

          {/* the per-second billing toy — feel the refund instead of reading about it */}
          <PodMeter />
        </div>
      </section>

      {/* ═══════════════ §05 AGENTS ═══════════════ */}
      <section id="agents-band">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 05 · Agents" ar="§ ٠٥ · الوكلاء" />
            </span>
            <span>
              <Bi en="Humans get a console · agents get MCP" ar="البشر لهم لوحة تحكم · والوكلاء لهم MCP" />
            </span>
          </div>
          <div className="agents-band">
            <div className="ab-cell">
              <span className="ab-k"><Bi en="For Saudi business" ar="للأعمال السعودية" /></span>
              <h3>
                <BiX
                  en={<>DCP-Agent. <em>Live for SMB.</em></>}
                  ar={<>DCP-Agent. <em>جاهز للمنشآت.</em></>}
                />
              </h3>
              <p>
                <Bi
                  en="The Arabic AI agent for Saudi small & mid-size businesses — already in production at agents.dcp.sa. A free personal version for every Saudi is coming."
                  ar="وكيل الذكاء العربي للمنشآت السعودية الصغيرة والمتوسطة — في الإنتاج على agents.dcp.sa. والنسخة الشخصية المجانية لكل سعودي قريباً."
                />
              </p>
              <div className="end">
                <span dir="ltr">agents.dcp.sa</span>
                <Link href="/agents">
                  <Bi en="Visit →" ar="زر ←" />
                </Link>
              </div>
            </div>
            <div className="ab-cell">
              <span className="ab-k"><Bi en="For AI agents · zero human" ar="لوكلاء الذكاء · دون تدخل بشري" /></span>
              <h3>
                <BiX
                  en={<>An agent can rent a GPU <em>by itself.</em></>}
                  ar={<>وكيل يستأجر معالجاً <em>بنفسه.</em></>}
                />
              </h3>
              <p>
                <Bi
                  en="Self-register in one call, get a real key plus a 20 SAR trial credit, then rent pods and run inference through the official MCP server — no email click, no human."
                  ar="تسجيل ذاتي باستدعاء واحد، ومفتاح حقيقي مع رصيد تجريبي ٢٠ ريالاً، ثم استئجار الحاويات وتشغيل الاستدلال عبر خادم MCP الرسمي — دون بريد ودون بشر."
                />
              </p>
              <pre className="term slim" dir="ltr" aria-label="Install the DCP MCP server">{`npx -y github:dhnpmp-tech/dcp-mcp`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §06 EARN · PROVIDERS ═══════════════ */}
      <section id="earn">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 06 · Providers" ar="§ ٠٦ · المزوّدون" />
            </span>
            <span>
              <Bi en="The other side of the marketplace" ar="الطرف الآخر من السوق" />
            </span>
          </div>
          <div className="pshow">
            <div className="pshow-media">
              <img
                src="/home/rig.webp"
                width={1200}
                height={896}
                loading="lazy"
                decoding="async"
                alt="A gaming PC with a large GPU glowing teal on a desk at night — the kind of Saudi-owned machine that earns Riyal on DCP"
              />
              <span className="pshow-cap" dir="ltr">fig. 03 — a provider node · somewhere in the Kingdom</span>
            </div>
            <div className="pshow-copy">
              <h2>
                <BiX
                  en={<>Your idle GPU. <em>Paid in Riyal.</em></>}
                  ar={<>معالجك الخامل. <em>يُدفع بالريال.</em></>}
                />
              </h2>
              <p>
                <Bi
                  en="One 4 MB app, packaged natively for every desk: a signed .exe for Windows, a universal .dmg for macOS, .AppImage and .deb for Linux. Run it once — it detects your card, installs the inference engine, downloads a model, verifies real throughput, joins the self-hosted WireGuard mesh, and keeps itself up to date. No port forwarding, no DevOps."
                  ar="تطبيق واحد بحجم ٤ ميغابايت، مغلّف أصلياً لكل نظام: ‎.exe موقّع لـWindows، و‎.dmg شامل لـmacOS، و‎.AppImage و‎.deb لـLinux. شغّله مرة واحدة — يكتشف بطاقتك، ويثبّت محرك الاستدلال، وينزّل نموذجاً، ويتحقق من السرعة الفعلية، وينضم إلى شبكة WireGuard ذاتية الاستضافة، ويحدّث نفسه تلقائياً. بلا فتح منافذ، بلا عمليات تشغيل."
                />
              </p>
              <ul className="pshow-list">
                <li><Bi en="You keep 75% of every Riyal your rig earns · paid out in SAR" ar="تحتفظ بـ٧٥٪ من كل ريال يكسبه جهازك · يُدفع بالريال" /></li>
                <li><Bi en="Native installers + signed auto-updates · one codebase, three platforms" ar="مثبّتات أصلية وتحديثات موقّعة تلقائية · قاعدة كود واحدة لثلاث منصات" /></li>
                <li><Bi en="Paid only while your machine is verified and actually serving" ar="تُدفع فقط ما دام جهازك متحققاً منه ويخدم فعلاً" /></li>
              </ul>
              <div className="pshow-ctas">
                <Link className="btn primary" href="/provider-setup">
                  <Bi en="Register a GPU →" ar="سجّل معالجاً ←" />
                </Link>
                <Link className="btn ghost" href="/earn">
                  <Bi en="Estimate earnings" ar="قدّر أرباحك" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ §07 FAQ (all 6 — same set as JSON-LD) ═══════════════ */}
      <section id="faq">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx">
              <Bi en="§ 07 · The questions people ask AI" ar="§ ٠٧ · الأسئلة الشائعة · ما يسأله الناس للذكاء الاصطناعي" />
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

      {/* ═══════════════ §08 END CTA ═══════════════ */}
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
                en="Sovereign Arabic AI — GPU pods, inference, agents, and a KSA GPU mesh. Built by DC Power Solutions Co., Riyadh."
                ar="ذكاء اصطناعي عربي سيادي — حاويات GPU واستدلال ووكلاء وشبكة معالجات داخل المملكة. من بناء DC Power Solutions Co.، الرياض."
              />
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> <span><Bi en="KSA-resident" ar="داخل المملكة" /></span>
              </span>
              <span className="residency-badge">
                <span className="flag">∞</span> <span>agents.dcp.sa</span>
              </span>
            </div>
          </div>

          <div>
            <h4><Bi en="Product" ar="المنتج" /></h4>
            <ul>
              <li><Link href="/pods"><Bi en="GPU Pods" ar="حاويات GPU" /></Link></li>
              <li><Link href="/inference"><Bi en="Inference" ar="الاستدلال" /></Link></li>
              <li><Link href="/fine-tuning"><Bi en="Fine-Tuning" ar="الضبط الدقيق" /></Link></li>
              <li><Link href="/batch"><Bi en="Batch" ar="الدُفعات" /></Link></li>
              <li><Link href="/agents"><Bi en="Agents" ar="الوكلاء" /></Link></li>
              <li><Link href="/pricing"><Bi en="Pricing" ar="الأسعار" /></Link></li>
              <li><Link href="/"><Bi en="Overview" ar="نظرة عامة" /></Link></li>
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
          <span>
            § DC Power Solutions Company · CR 7053667775 · VAT 311102233400003{' '}
            <span className="egg-hint" dir="ltr">
              · psst — try typing <EggWord>“gpu”</EggWord>
            </span>
          </span>
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
