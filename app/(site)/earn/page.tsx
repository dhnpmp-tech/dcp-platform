'use client'

// /earn — provider pitch. Redesigned to the Midnight editorial-luxury design
// language (dcp-kit tokens, Instrument Serif headings, JetBrains Mono labels,
// SiteShell chrome). The OLD dc1-* Tailwind palette + rounded-card look is gone.
//
// i18n: this page now uses the (site) V2 i18n (useV2/Bi) like every other
// redesigned (site) page, so the EN/AR toggle in the shared header drives it.
// Copy is inlined bilingually (the old dictionary keys lived in the v1 i18n
// bundle which the redesigned shell no longer consumes).
//
// Purpose preserved: provider value, the agent-first DEMAND section, the
// earnings calculator, quick-install, how-it-works, FAQ, and the CTA to the
// PROVIDER wizard (/provider-setup). /setup is RENTER signup — every provider
// call-to-action here lands on ROUTES.providerSetup.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import SiteShell from '../components/chrome/SiteShell'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { buildInstallCommand } from '@/app/lib/provider-onboarding'
import { trackProviderInstallEvent } from '@/app/lib/provider-install-telemetry'
import { ROUTES } from '@/app/lib/routes'

// GPU pricing in halala/hr (matches backend gpu_pricing seed data)
const GPU_RATES = [
  { model: 'RTX 3060 Ti', rate_halala: 500 },
  { model: 'RTX 3080', rate_halala: 800 },
  { model: 'RTX 4090', rate_halala: 1200 },
  { model: 'Apple M2 Pro (16 GB)', rate_halala: 400 },
  { model: 'Apple M3 Max (36 GB)', rate_halala: 700 },
  { model: 'Apple M4 Max (48 GB)', rate_halala: 900 },
  { model: 'A100', rate_halala: 2200 },
]

interface BiText {
  en: string
  ar: string
}

const VALUE_BULLETS: BiText[] = [
  {
    en: 'Cost-plus payout in Saudi Riyal — you keep 75% of every billed token your rig serves.',
    ar: 'دفعات بالريال السعودي على أساس التكلفة زائد هامش — تحتفظ بنسبة 75% من كل رمز مفوتر يخدمه جهازك.',
  },
  {
    en: 'No exclusivity, no lock-in. Pause or resume your rig any time from the desktop app.',
    ar: 'دون حصرية ودون التزام. أوقف جهازك أو استأنفه في أي وقت من تطبيق سطح المكتب.',
  },
  {
    en: 'Demand routes itself — agents and renters hit the API 24/7, not only office hours.',
    ar: 'الطلب يوجّه نفسه — الوكلاء والمستأجرون يستخدمون الواجهة على مدار الساعة، لا في أوقات العمل فقط.',
  },
]

// Agent-first DEMAND — what a provider's GPU actually serves on DCP.
const AGENTIC_CARDS: { n: string; title: BiText; body: BiText }[] = [
  {
    n: '01',
    title: { en: 'MCP connector', ar: 'موصّل MCP' },
    body: {
      en: 'Agents plug DCP straight into their toolchain — npx -y github:dhnpmp-tech/dcp-mcp, listed in the official MCP registry. Your GPU becomes a tool an agent can call.',
      ar: 'يربط الوكلاء DCP مباشرة بسلسلة أدواتهم عبر npx -y github:dhnpmp-tech/dcp-mcp، المدرج في سجل MCP الرسمي. يصبح معالجك أداة يستدعيها الوكيل.',
    },
  },
  {
    n: '02',
    title: { en: 'Agent self-serve onboarding', ar: 'تسجيل ذاتي للوكلاء' },
    body: {
      en: 'An agent gets its own key and trial with no human in the loop — it signs up, rents, and runs inference automatically. Demand arrives 24/7, not just office hours.',
      ar: 'يحصل الوكيل على مفتاحه وتجربته دون أي تدخل بشري — يسجّل ويستأجر ويشغّل الاستدلال تلقائياً. الطلب يصل على مدار الساعة، لا في أوقات العمل فقط.',
    },
  },
  {
    n: '03',
    title: { en: 'OpenAI-compatible API', ar: 'واجهة متوافقة مع OpenAI' },
    body: {
      en: 'Renters and agents hit api.dcp.sa/v1 with the OpenAI SDK they already use — zero rewrites. Every call that lands routes real, paid inference work to a rig like yours.',
      ar: 'يستخدم المستأجرون والوكلاء api.dcp.sa/v1 بحزمة OpenAI التي يملكونها أصلاً — دون أي إعادة كتابة. كل طلب يصل يوجّه عملاً استدلالياً مدفوعاً إلى جهاز مثل جهازك.',
    },
  },
]

const TRUST_BULLETS: BiText[] = [
  {
    en: 'A signed heartbeat proves your rig is live before any traffic is routed to it.',
    ar: 'نبضة موقّعة تثبت أن جهازك يعمل قبل توجيه أي حركة إليه.',
  },
  {
    en: 'The router polls a live reachability + inference probe — earned-online, never claimed-online.',
    ar: 'يفحص الموجّه الوصول والاستدلال حياً — اتصال مُكتسب لا مُدّعى.',
  },
  {
    en: 'Pause and resume on your terms; the scheduler stops sending work the moment you step away.',
    ar: 'أوقف واستأنف بشروطك؛ يتوقف المجدول عن إرسال العمل لحظة انسحابك.',
  },
  {
    en: 'Inference runs inside an isolated runtime — the renter prompt never touches your host.',
    ar: 'يعمل الاستدلال داخل بيئة معزولة — لا يلامس سؤال المستأجر مضيفك إطلاقاً.',
  },
]

const REQS: { title: BiText; desc: BiText }[] = [
  {
    title: { en: 'NVIDIA or Apple Silicon GPU', ar: 'معالج NVIDIA أو Apple Silicon' },
    desc: {
      en: 'An RTX 3060 Ti or better, or an Apple M2 Pro / M3 / M4 with 16 GB+ unified memory.',
      ar: 'بطاقة RTX 3060 Ti أو أفضل، أو Apple M2 Pro / M3 / M4 بذاكرة موحّدة 16 جيجابايت فأكثر.',
    },
  },
  {
    title: { en: 'Windows, Linux, or macOS', ar: 'ويندوز أو لينكس أو macOS' },
    desc: {
      en: 'The DCP daemon installs in minutes and runs detached in the background.',
      ar: 'يُثبّت برنامج DCP الخفي في دقائق ويعمل منفصلاً في الخلفية.',
    },
  },
  {
    title: { en: 'A stable connection', ar: 'اتصال مستقر' },
    desc: {
      en: 'The rig joins the in-Kingdom WireGuard mesh; a residential line is fine.',
      ar: 'ينضم الجهاز إلى شبكة WireGuard داخل المملكة؛ خط منزلي يكفي.',
    },
  },
  {
    title: { en: 'A free provider account', ar: 'حساب مزوّد مجاني' },
    desc: {
      en: 'Register, get a provider key, point your rig at DCP, and start earning.',
      ar: 'سجّل، احصل على مفتاح مزوّد، وجّه جهازك إلى DCP، وابدأ الكسب.',
    },
  },
]

const HOW_STEPS: { n: string; title: BiText; desc: BiText }[] = [
  {
    n: '01',
    title: { en: 'Install the daemon', ar: 'ثبّت البرنامج الخفي' },
    desc: {
      en: 'Download the DCP desktop app or run the one-line installer. It detects your GPU and configures everything.',
      ar: 'حمّل تطبيق DCP لسطح المكتب أو شغّل المثبّت بسطر واحد. يكتشف معالجك ويهيّئ كل شيء.',
    },
  },
  {
    n: '02',
    title: { en: 'Get verified online', ar: 'تحقّق من الاتصال' },
    desc: {
      en: 'Your rig joins the mesh, passes a live inference probe, and appears in the marketplace as earned-online.',
      ar: 'ينضم جهازك إلى الشبكة، ويجتاز فحص استدلال حي، ويظهر في السوق باتصال مُكتسب.',
    },
  },
  {
    n: '03',
    title: { en: 'Earn in Riyal', ar: 'اكسب بالريال' },
    desc: {
      en: 'Renters and agents route paid inference to your rig. Only successful work is billed; you keep 75%.',
      ar: 'يوجّه المستأجرون والوكلاء استدلالاً مدفوعاً إلى جهازك. يُفوتر العمل الناجح فقط؛ وتحتفظ بنسبة 75%.',
    },
  },
]

const FAQ: { q: BiText; a: BiText }[] = [
  {
    q: { en: 'How much can I realistically earn?', ar: 'كم يمكنني أن أكسب واقعياً؟' },
    a: {
      en: 'It depends on your GPU class, hours online, and how much demand routes to it. Use the calculator above for an illustrative monthly estimate — actual earnings track real, billed inference, not a guaranteed rate.',
      ar: 'يعتمد ذلك على فئة معالجك وساعات الاتصال وحجم الطلب الموجّه إليه. استخدم الحاسبة أعلاه لتقدير شهري توضيحي — الأرباح الفعلية تتبع الاستدلال المفوتر الحقيقي، لا معدلاً مضموناً.',
    },
  },
  {
    q: { en: 'When and how do I get paid?', ar: 'متى وكيف أتقاضى؟' },
    a: {
      en: 'Payouts settle in Saudi Riyal to your registered payout method on the published revenue-share schedule. You keep 75% of every billed token your rig serves.',
      ar: 'تُسوّى الدفعات بالريال السعودي إلى طريقة الدفع المسجّلة وفق جدول حصة الإيرادات المنشور. تحتفظ بنسبة 75% من كل رمز مفوتر يخدمه جهازك.',
    },
  },
  {
    q: { en: 'Do I have to keep my rig on all the time?', ar: 'هل يجب أن أبقي جهازي يعمل دائماً؟' },
    a: {
      en: 'No. Pause and resume any time from the desktop app. The scheduler stops routing work to a paused rig immediately, and resumes when you come back online.',
      ar: 'لا. أوقف واستأنف في أي وقت من تطبيق سطح المكتب. يتوقف المجدول عن توجيه العمل إلى جهاز متوقف فوراً، ويستأنف عند عودتك.',
    },
  },
  {
    q: { en: 'Is renter data safe on my machine?', ar: 'هل بيانات المستأجر آمنة على جهازي؟' },
    a: {
      en: 'Inference runs in an isolated runtime and the renter prompt never touches your host filesystem. You serve compute, not custody of anyone’s data.',
      ar: 'يعمل الاستدلال في بيئة معزولة، ولا يلامس سؤال المستأجر نظام ملفات مضيفك. أنت تقدّم حوسبة، لا حفظاً لبيانات أحد.',
    },
  },
  {
    q: { en: 'Which GPUs are supported?', ar: 'ما المعالجات المدعومة؟' },
    a: {
      en: 'NVIDIA RTX 3060 Ti and above, plus Apple Silicon (M2 Pro / M3 / M4) with 16 GB or more of unified memory. The daemon auto-detects your hardware on install.',
      ar: 'بطاقات NVIDIA RTX 3060 Ti فأعلى، إضافة إلى Apple Silicon (M2 Pro / M3 / M4) بذاكرة موحّدة 16 جيجابايت فأكثر. يكتشف البرنامج الخفي عتادك تلقائياً عند التثبيت.',
    },
  },
]

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="surface flush" style={{ overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          padding: '18px 22px',
          textAlign: 'start',
        }}
      >
        <span style={{ fontFamily: 'var(--serif)', fontSize: 20, lineHeight: 1.2, color: 'var(--ink)' }}>
          {question}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--mono)',
            color: 'var(--teal)',
            fontSize: 18,
            transition: 'transform .2s',
            transform: open ? 'rotate(45deg)' : 'none',
          }}
        >
          +
        </span>
      </button>
      {open && (
        <p
          style={{
            margin: 0,
            padding: '0 22px 20px',
            color: 'var(--ink-2)',
            fontSize: 14.5,
            lineHeight: 1.7,
          }}
        >
          {answer}
        </p>
      )}
    </div>
  )
}

export default function EarnPage() {
  const { lang } = useV2()
  const isAr = lang === 'ar'
  const tr = (b: BiText) => (isAr ? b.ar : b.en)
  // Rich (JSX) bilingual chooser — for headings that embed an <em> accent.
  const rich = (en: React.ReactNode, ar: React.ReactNode) => (isAr ? ar : en)

  const [selectedGpu, setSelectedGpu] = useState(GPU_RATES[2]) // RTX 4090 default
  const [hours, setHours] = useState(8)
  const [utilPct, setUtilPct] = useState(50)

  // Public teaser — no minted token yet, so render the canonical command with
  // its placeholder token (real token is minted in the /provider-setup wizard).
  const quickInstallCommand = useMemo(() => buildInstallCommand({ os: 'linux', token: null }), [])

  // gpu_rate * hours/day * (util/100) * 30 days * 0.75 provider share / 100 halala→SAR
  const grossHalala = selectedGpu.rate_halala * hours * (utilPct / 100) * 30
  const feeSar = Math.round((grossHalala * 0.25) / 100)
  const netSar = Math.round((grossHalala * 0.75) / 100)
  const grossSar = Math.round(grossHalala / 100)

  return (
    <SiteShell active="/provider-setup">
      <main className="earn">
        {/* ── Hero ── */}
        <section className="hero" style={{ borderTop: 0 }}>
          <div className="hero-bg hero-bg--photo" aria-hidden="true">
            <img src="/home/fans.webp" alt="" width={1800} height={1005} decoding="async" />
          </div>
          <div className="wrap">
            <div className="hero-meta">
              <span className="left">
                <span className="dot">●</span>{' '}
                <Bi en="Provider network · open" ar="شبكة المزوّدين · مفتوحة" />
              </span>
              <span>
                <Bi en="Earn Riyal from your GPU" ar="اكسب ريالاً من معالجك" />
              </span>
            </div>
            <span className="eyebrow">
              <Bi en="Become a DCP provider" ar="كن مزوّداً في DCP" />
            </span>
            <h1 className="hero-h">
              {rich(
                <>Your idle GPU is <em>working capital</em>.</>,
                <>معالجك الخامل هو <em>رأس مال عامل</em>.</>
              )}
            </h1>
            <p className="hero-sub">
              <Bi
                en="Plug a spare NVIDIA or Apple Silicon rig into DCP and serve sovereign, in-Kingdom AI inference. Demand routes itself — agents and renters pay per token, settled in Saudi Riyal."
                ar="اربط جهاز NVIDIA أو Apple Silicon الاحتياطي بـ DCP وقدّم استدلال ذكاء اصطناعي سيادياً داخل المملكة. الطلب يوجّه نفسه — يدفع الوكلاء والمستأجرون لكل رمز، وتُسوّى بالريال السعودي."
              />
            </p>
            <div className="hero-ctas">
              <Link href={ROUTES.providerSetup} className="btn primary lg">
                <Bi en="Start earning →" ar="ابدأ الكسب ←" />
              </Link>
              <a href="#calculator" className="btn ghost lg">
                <Bi en="Estimate my earnings" ar="قدّر أرباحي" />
              </a>
            </div>
            <p className="hero-trusted">
              <Bi
                en="Illustrative scenario — actual earnings track real billed inference."
                ar="سيناريو توضيحي — الأرباح الفعلية تتبع الاستدلال المفوتر الحقيقي."
              />
            </p>
          </div>
        </section>

        {/* ── Provider value ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">01 — <Bi en="Why providers run DCP" ar="لماذا يشغّل المزوّدون DCP" /></span>
              <span><Bi en="Cost-plus · Riyal · no lock-in" ar="تكلفة زائد هامش · ريال · بلا التزام" /></span>
            </div>
            <div className="grid-2">
              <div>
                <h2 className="st">
                  {rich(
                    <>Turn spare cycles into <em>monthly income</em>.</>,
                    <>حوّل الدورات الفائضة إلى <em>دخل شهري</em>.</>
                  )}
                </h2>
                <p className="ss">
                  <Bi
                    en="DCP pays cost-plus: a transparent margin over your real running cost, never a flat tier. You stay in control of when your rig is online and what it serves."
                    ar="يدفع DCP على أساس التكلفة زائد هامش: هامش شفاف فوق تكلفة تشغيلك الحقيقية، لا فئة ثابتة. تبقى متحكماً بوقت اتصال جهازك وما يخدمه."
                  />
                </p>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {VALUE_BULLETS.map((b) => (
                  <li
                    key={b.en}
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '18px 0',
                      borderTop: '1px solid var(--hair)',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 13 }}>∞</span>
                    <span style={{ fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink)' }}>{tr(b)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Agent-first demand ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">02 — <Bi en="Agent-first demand" ar="طلب مدفوع بالوكلاء" /></span>
              <span><Bi en="What your GPU serves" ar="ما يخدمه معالجك" /></span>
            </div>
            <h2 className="st">
              {rich(
                <>Your GPU serves <em>agent-driven</em> workloads.</>,
                <>جهازك يخدم أحمال <em>الوكلاء</em>.</>
              )}
            </h2>
            <p className="ss">
              <Bi
                en="DCP is agent-first. Demand does not wait for a human to click a button — agents rent GPUs and run inference automatically through the rails below. That is the paid work routed to your rig."
                ar="DCP منصة وكلاء أولاً. لا ينتظر الطلب بشراً يضغط زراً — يستأجر الوكلاء المعالجات ويشغّلون الاستدلال تلقائياً عبر هذه المسارات. هذا هو العمل المدفوع الذي يُوجَّه إلى جهازك."
              />
            </p>
            <div className="grid-3" style={{ marginTop: 36 }}>
              {AGENTIC_CARDS.map((c) => (
                <article key={c.n} className="m-card" style={{ gridColumn: 'auto' }}>
                  <span className="org">{c.n}</span>
                  <h3 className="mname">{tr(c.title)}</h3>
                  <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                    {tr(c.body)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust / how providers stay protected ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">03 — <Bi en="How you stay in control" ar="كيف تبقى متحكماً" /></span>
              <span><Bi en="Verified · isolated · pausable" ar="متحقق · معزول · قابل للإيقاف" /></span>
            </div>
            <div className="trust-grid">
              {TRUST_BULLETS.map((b, i) => (
                <div className="tr" key={b.en}>
                  <div className="n">{String(i + 1).padStart(2, '0')}</div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>{tr(b)}</p>
                </div>
              ))}
            </div>
            <p className="hero-trusted" style={{ marginTop: 24 }}>
              <Bi
                en="Earnings shown anywhere on this page are estimates, not a guaranteed payout."
                ar="أي أرباح معروضة في هذه الصفحة تقديرات، وليست دفعة مضمونة."
              />
            </p>
          </div>
        </section>

        {/* ── Requirements ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">04 — <Bi en="What you need" ar="ما تحتاجه" /></span>
              <span><Bi en="Minutes to set up" ar="دقائق للإعداد" /></span>
            </div>
            <div className="grid-2">
              {REQS.map((r) => (
                <div className="surface" key={r.title.en}>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '0 0 8px', lineHeight: 1.1 }}>
                    {tr(r.title)}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{tr(r.desc)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Earnings calculator ── */}
        <section id="calculator">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">05 — <Bi en="Earnings calculator" ar="حاسبة الأرباح" /></span>
              <span><Bi en="Illustrative · per month" ar="توضيحي · شهرياً" /></span>
            </div>
            <div className="grid-2">
              <div>
                <h2 className="st">
                  {rich(
                    <>See what your rig could <em>return</em>.</>,
                    <>شاهد ما قد <em>يعيده</em> جهازك.</>
                  )}
                </h2>
                <p className="ss">
                  <Bi
                    en="Pick a GPU class, set hours online per day and an expected utilisation. The estimate applies the 75% provider share to the published per-hour rate."
                    ar="اختر فئة معالج، حدّد ساعات الاتصال يومياً والاستخدام المتوقع. يطبّق التقدير حصة المزوّد 75% على السعر المنشور للساعة."
                  />
                </p>
              </div>

              <div className="calc-card">
                <div className="calc-field">
                  <div className="calc-row">
                    <b><Bi en="GPU model" ar="طراز المعالج" /></b>
                  </div>
                  <select
                    className="select"
                    value={selectedGpu.model}
                    onChange={(e) =>
                      setSelectedGpu(GPU_RATES.find((g) => g.model === e.target.value) ?? GPU_RATES[2])
                    }
                  >
                    {GPU_RATES.map((g) => (
                      <option key={g.model} value={g.model}>
                        {g.model} — {(g.rate_halala / 100).toFixed(2)} SAR/hr
                      </option>
                    ))}
                  </select>
                </div>

                <div className="calc-field">
                  <div className="calc-row">
                    <b><Bi en="Hours online / day" ar="ساعات الاتصال / يوم" /></b>
                    <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{hours}h</span>
                  </div>
                  <input
                    className="slider"
                    type="range"
                    min={4}
                    max={24}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    aria-label="Hours online per day"
                  />
                </div>

                <div className="calc-field">
                  <div className="calc-row">
                    <b><Bi en="Expected utilisation" ar="الاستخدام المتوقع" /></b>
                    <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{utilPct}%</span>
                  </div>
                  <input
                    className="slider"
                    type="range"
                    min={20}
                    max={80}
                    step={5}
                    value={utilPct}
                    onChange={(e) => setUtilPct(Number(e.target.value))}
                    aria-label="Expected utilisation"
                  />
                </div>

                <div className="calc-out">
                  <div className="calc-row" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <span><Bi en="Gross / month" ar="الإجمالي / شهر" /></span>
                    <span style={{ color: 'var(--ink-2)' }}>{grossSar.toLocaleString()} SAR</span>
                  </div>
                  <div className="calc-row" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8 }}>
                    <span><Bi en="DCP fee (25%)" ar="رسوم DCP (25%)" /></span>
                    <span style={{ color: 'var(--orange)' }}>−{feeSar.toLocaleString()} SAR</span>
                  </div>
                  <div className="big" style={{ marginTop: 18 }}>
                    {netSar.toLocaleString()}
                    <span className="u"><Bi en="SAR / month — you keep" ar="ريال / شهر — تحتفظ به" /></span>
                  </div>
                  <div className="sub">
                    <Bi en="Estimate only · not a guaranteed payout" ar="تقدير فقط · ليس دفعة مضمونة" />
                  </div>
                </div>

                <Link href={ROUTES.providerSetup} className="btn primary lg" style={{ marginTop: 22, width: '100%', justifyContent: 'center' }}>
                  <Bi en="Start earning →" ar="ابدأ الكسب ←" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Quick install ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">06 — <Bi en="Quick install" ar="تثبيت سريع" /></span>
              <span><Bi en="One line · detached daemon" ar="سطر واحد · برنامج خفي منفصل" /></span>
            </div>
            <div className="surface">
              <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(28px,3.4vw,40px)', margin: '0 0 8px', lineHeight: 1.05 }}>
                <Bi en="Point your rig at DCP" ar="وجّه جهازك إلى DCP" />
              </h2>
              <p style={{ marginTop: 0, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.6 }}>
                <Bi
                  en="Run the installer on Linux, or grab the desktop app for Windows and macOS. Your real provider key is minted in the setup wizard."
                  ar="شغّل المثبّت على لينكس، أو احصل على تطبيق سطح المكتب لويندوز و macOS. يُنشأ مفتاح المزوّد الحقيقي في معالج الإعداد."
                />
              </p>
              <pre className="code" style={{ marginTop: 16 }}>
                <span className="s">{quickInstallCommand}</span>
              </pre>
              <div className="row" style={{ marginTop: 16 }}>
                <a
                  href="https://api.dcp.sa/download/windows"
                  className="btn primary small"
                  onClick={() =>
                    trackProviderInstallEvent('provider_install_cta_clicked', {
                      source_page: 'earn',
                      surface: 'quick_install',
                      destination: 'https://api.dcp.sa/download/windows',
                      locale: lang,
                      cta_tier: 'primary',
                      next_action_state: 'waiting',
                      os_target: 'windows',
                      has_provider_key: false,
                      step: 'download_windows',
                    })
                  }
                >
                  <Bi en="Download for Windows (~4 MB)" ar="تنزيل لويندوز (~4 ميجابايت)" />
                </a>
                <Link
                  href="/provider/download"
                  className="btn ghost small"
                  onClick={() =>
                    trackProviderInstallEvent('provider_install_cta_clicked', {
                      source_page: 'earn',
                      surface: 'quick_install',
                      destination: '/provider/download',
                      locale: lang,
                      cta_tier: 'primary',
                      next_action_state: 'waiting',
                      os_target: 'linux',
                      has_provider_key: false,
                      step: 'open_download',
                    })
                  }
                >
                  <Bi en="All downloads" ar="كل التنزيلات" />
                </Link>
                <Link
                  href="/docs"
                  className="mono"
                  style={{ color: 'var(--teal)', fontSize: 12.5 }}
                  onClick={() =>
                    trackProviderInstallEvent('provider_install_cta_clicked', {
                      source_page: 'earn',
                      surface: 'quick_install',
                      destination: '/docs',
                      locale: lang,
                      cta_tier: 'secondary',
                      next_action_state: 'waiting',
                      os_target: 'linux',
                      has_provider_key: false,
                      step: 'open_docs',
                    })
                  }
                >
                  <Bi en="Provider guide →" ar="دليل المزوّد ←" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">07 — <Bi en="How it works" ar="كيف يعمل" /></span>
              <span><Bi en="Install → verify → earn" ar="تثبيت ← تحقّق ← كسب" /></span>
            </div>
            <div className="grid-3">
              {HOW_STEPS.map((s) => (
                <div className="surface" key={s.n}>
                  <span className="org" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.14em', color: 'var(--teal)' }}>
                    {s.n}
                  </span>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '8px 0 6px', lineHeight: 1.1 }}>
                    {tr(s.title)}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>{tr(s.desc)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">08 — <Bi en="Provider FAQ" ar="أسئلة المزوّدين" /></span>
              <span><Bi en="Earnings · payouts · control" ar="أرباح · دفعات · تحكم" /></span>
            </div>
            <div className="col" style={{ gap: 12, maxWidth: 820 }}>
              {FAQ.map((f) => (
                <FaqItem key={f.q.en} question={tr(f.q)} answer={tr(f.a)} />
              ))}
            </div>
          </div>
        </section>

        {/* ── End CTA ── */}
        <div className="end-cta">
          <div className="wrap">
            <span className="eyebrow" style={{ justifyContent: 'center' }}>
              <Bi en="Ready when you are" ar="جاهزون متى كنت" />
            </span>
            <div className="big">
              {rich(
                <>Earn from <em>your GPU</em>.</>,
                <>اكسب من <em>معالجك</em>.</>
              )}
            </div>
            <p className="ss center">
              <Bi
                en="Register as a provider, point your rig at DCP, and start serving sovereign AI inference for Saudi Riyal."
                ar="سجّل كمزوّد، وجّه جهازك إلى DCP، وابدأ بخدمة استدلال ذكاء اصطناعي سيادي مقابل الريال السعودي."
              />
            </p>
            <div className="ctas">
              <Link href={ROUTES.providerSetup} className="btn primary lg">
                <Bi en="Become a provider →" ar="كن مزوّداً ←" />
              </Link>
              <Link href="/auth" className="btn ghost lg">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
            <p className="hero-trusted" style={{ marginTop: 18 }}>
              <Bi
                en="Payouts in Saudi Riyal on the published revenue-share schedule."
                ar="دفعات بالريال السعودي وفق جدول حصة الإيرادات المنشور."
              />
            </p>
          </div>
        </div>
      </main>
    </SiteShell>
  )
}
