'use client'

// /v2/provider-setup — ported from prototypes/Provider-Setup.html
// 6-step provider onboarding wizard (orange accent = provider context).
// Bilingual via the V2Provider context; dir/lang/palette handled globally.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../lib/i18n'
import './provider-setup.css'

// ── Earnings formula constants (illustrative MOCK data, per prototype) ──
const PER_HOUR = [1.15, 1.6, 2.2] as const
const WEEKS_PER_MONTH = 4.33
const PROVIDER_SHARE = 0.75
const PLATFORM_SHARE = 0.25
const VERIFY_DELAY_MS = 3200
const INSTALL_STEP_DELAY_MS = 750
const INSTALL_BASE_DELAY_MS = 300
const COUNTER_INTERVAL_MS = 4000
const INSTALL_KEY = 'curl -sSL https://dcp.sa/install | sh -s -- --key prov_8f3a…c721'

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const STEPS = [
  { en: 'Sign in', ar: 'الدخول' },
  { en: 'Requirements', ar: 'المتطلبات' },
  { en: 'Your GPU', ar: 'معالجك' },
  { en: 'Earnings', ar: 'الأرباح' },
  { en: 'Install', ar: 'التثبيت' },
  { en: 'Verify', ar: 'التحقق' },
] as const

export default function V2ProviderSetup() {
  const { lang, toggle } = useV2()
  const reducedMotion = useReducedMotion()

  // wizard
  const [step, setStep] = useState(1)

  // magic-link sign-in
  const [magicSent, setMagicSent] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const sentTo = email || 'you@example.sa'

  // step 3 — rate slider
  const [rate, setRate] = useState(1)

  // step 4 — earnings estimator
  const [hrs, setHrs] = useState(8)
  const [days, setDays] = useState(7)
  const [demand, setDemand] = useState(1)

  // step 5 — install sequence
  const [seqShown, setSeqShown] = useState(0)
  const seqTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // step 6 — verify
  const [verified, setVerified] = useState(false)

  // live counter jitter (cosmetic)
  const [provCount, setProvCount] = useState(41)

  // ── live-counter jitter (cosmetic; static under reduced motion) ──
  useEffect(() => {
    if (reducedMotion) return
    const id = setInterval(() => {
      if (Math.random() > 0.6) setProvCount((n) => n + 1)
    }, COUNTER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [reducedMotion])

  // ── verify auto-resolve when on step 6 ──
  useEffect(() => {
    if (step !== 6) return
    setVerified(false)
    if (reducedMotion) {
      setVerified(true)
      return
    }
    const id = setTimeout(() => setVerified(true), VERIFY_DELAY_MS)
    return () => clearTimeout(id)
  }, [step, reducedMotion])

  // ── clean up install-sequence timers on unmount ──
  useEffect(() => {
    return () => {
      seqTimers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const go = useCallback((n: number) => {
    setStep(n)
    if (n === 5) setSeqShown(0)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const sendMagic = useCallback(() => setMagicSent(true), [])
  const resetMagic = useCallback(() => setMagicSent(false), [])

  const runSeq = useCallback(() => {
    seqTimers.current.forEach((t) => clearTimeout(t))
    seqTimers.current = []
    setSeqShown(0)
    if (reducedMotion) {
      setSeqShown(5)
      return
    }
    for (let i = 0; i < 5; i++) {
      const id = setTimeout(() => setSeqShown((s) => Math.max(s, i + 1)), INSTALL_BASE_DELAY_MS + i * INSTALL_STEP_DELAY_MS)
      seqTimers.current.push(id)
    }
  }, [reducedMotion])

  const copyInstall = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(INSTALL_KEY)
    }
  }, [])

  // ── earnings estimate (always a range, never a guarantee) ──
  const est = useMemo(() => {
    const perHour = PER_HOUR[demand]
    const monthlyActive = hrs * days * WEEKS_PER_MONTH
    const mid = monthlyActive * perHour
    const lo = roundTo10(mid * 0.78)
    const hi = roundTo10(mid * 1.24)
    return {
      lo,
      hi,
      youLo: Math.round(lo * PROVIDER_SHARE),
      youHi: Math.round(hi * PROVIDER_SHARE),
      dcpLo: Math.round(lo * PLATFORM_SHARE),
      dcpHi: Math.round(hi * PLATFORM_SHARE),
    }
  }, [hrs, days, demand])

  const fmt = useCallback((n: number) => n.toLocaleString(lang === 'ar' ? 'ar' : 'en'), [lang])

  const rateLabel = (lang === 'ar' ? ['اقتصادي', 'متوازن', 'أعلى'] : ['economy', 'balanced', 'premium'])[rate]
  const demandLabel = (lang === 'ar' ? ['منخفض', 'معتاد', 'مرتفع'] : ['Low', 'Typical', 'High'])[demand]

  const namePh = lang === 'ar' ? 'مثال: جهاز فيصل' : "e.g. Faisal's Rig"
  const emailPh = 'you@example.sa'
  const ibanPh = 'SA00 0000 0000 0000 0000 0000'

  return (
    <>
      <header className="hdr">
        <Link href="/v2" className="wm">
          DCP<i>∞</i>
          <span className="ctx">
            <Bi en="Provider" ar="مزوّد" />
          </span>
        </Link>
        <div className="right">
          <a className="help" href="#">
            <Bi en="Need help?" ar="تحتاج مساعدة؟" />
          </a>
          <div className="lang" id="lang">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => lang !== 'en' && toggle()}>
              EN
            </button>
            <button className={`ar-label${lang === 'ar' ? ' on' : ''}`} onClick={() => lang !== 'ar' && toggle()}>
              عربي
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="stepper" id="stepper">
          {STEPS.map((s, i) => {
            const sn = i + 1
            const cls = sn === step ? 'st on' : sn < step ? 'st done' : 'st'
            return (
              <div key={s.en} className={cls} data-s={sn} aria-current={sn === step ? 'step' : undefined}>
                <span className="num">
                  <span className="n">{sn}</span>
                </span>
                <span className="lbl">
                  <Bi en={s.en} ar={s.ar} />
                </span>
              </div>
            )
          })}
        </div>

        {/* STEP 1 · SIGN IN */}
        <div className="step-grid" data-pane="1" style={{ display: step === 1 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 1 of 6" ar="الخطوة ١ من ٦" />
            </span>
            <h1 className="step-h">
              {lang === 'ar' ? (
                <>
                  اربح من المعالج <em>الذي تملكه.</em>
                </>
              ) : (
                <>
                  Earn from the GPU you <em>already own.</em>
                </>
              )}
            </h1>
            <p className="step-sub">
              <Bi
                en="Sign in with your email — we'll send a one-tap magic link, no password. Providers earn from DCP; you never pay us a thing."
                ar="ادخل ببريدك — سنرسل رابطاً سحرياً بنقرة واحدة، دون كلمة مرور. المزوّدون يكسبون من DCP؛ ولا تدفع لنا شيئاً."
              />
            </p>

            {!magicSent && (
              <div id="signin-form">
                <div className="field">
                  <label>
                    <Bi en="Display name" ar="الاسم الظاهر" />
                  </label>
                  <input type="text" placeholder={namePh} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>
                    <Bi en="Email" ar="البريد الإلكتروني" />
                  </label>
                  <input type="email" id="email" placeholder={emailPh} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button className="btn pri block" style={{ marginTop: 22 }} onClick={sendMagic}>
                  <Bi en="Send magic link →" ar="أرسل الرابط السحري →" />
                </button>
                <div className="safe-line">
                  <span className="ic">🔒</span>
                  <span>
                    <Bi
                      en="Providers earn — you never pay DCP. No card, ever."
                      ar="المزوّدون يكسبون — لا تدفع لـ DCP أبداً. بدون بطاقة، إطلاقاً."
                    />
                  </span>
                </div>
              </div>
            )}

            {magicSent && (
              <div id="ml-wait" className="ml-wait">
                <div className="env">✉</div>
                <h2>
                  <Bi en="Check your inbox" ar="تحقّق من بريدك" />
                </h2>
                <p>
                  <span>
                    <Bi en="We sent a sign-in link to" ar="أرسلنا رابط الدخول إلى" />
                  </span>{' '}
                  <span className="em" id="sent-to">
                    {sentTo}
                  </span>
                  . <Bi en="Tap it on this device to continue." ar="انقره على هذا الجهاز للمتابعة." />
                </p>
                <div className="resend">
                  <span>
                    <Bi en="Didn't get it?" ar="لم يصلك؟" />
                  </span>{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      resetMagic()
                    }}
                  >
                    <Bi en="Resend or edit email" ar="إعادة الإرسال أو تعديل البريد" />
                  </a>
                </div>
                <button className="btn sec" style={{ marginTop: 22 }} onClick={() => go(2)}>
                  <Bi en="Simulate link tapped →" ar="محاكاة فتح الرابط →" />
                </button>
              </div>
            )}
          </div>

          <div className="rail">
            <div className="rail-card tint">
              <h4>
                <Bi en="§ Live network" ar="§ الشبكة الآن" />
              </h4>
              <div className="counter">
                <span id="prov-count">{provCount}</span>{' '}
                <span className="u">
                  <Bi en="providers registered" ar="مزوّد مسجّل" />
                </span>
              </div>
              <p style={{ marginTop: 8 }}>
                <Bi
                  en="Across Riyadh, Jeddah, Dammam and NEOM — growing every week."
                  ar="في الرياض وجدة والدمام ونيوم — وينمو كل أسبوع."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ Why a magic link?" ar="§ لماذا رابط سحري؟" />
              </h4>
              <p>
                <Bi
                  en="No password to leak or forget. The link works once, expires in 15 minutes, and only opens your account on the device you tap it from."
                  ar="لا كلمة مرور تُسرق أو تُنسى. الرابط يعمل مرة واحدة، وينتهي خلال ١٥ دقيقة، ويفتح حسابك فقط على الجهاز الذي تنقره منه."
                />
              </p>
            </div>
            <div className="rail-card">
              <div className="chips">
                <span className="chip">
                  <span className="d"></span> <span><Bi en="In-Kingdom" ar="داخل المملكة" /></span>
                </span>
                <span className="chip">
                  <span className="d"></span> PDPL
                </span>
                <span className="chip">
                  <span className="d"></span> <span><Bi en="SAR payouts" ar="مدفوعات بالريال" /></span>
                </span>
                <span className="chip">
                  <span className="d"></span> <span><Bi en="Pause anytime" ar="إيقاف وقتما تشاء" /></span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 2 · REQUIREMENTS */}
        <div className="step-grid" data-pane="2" style={{ display: step === 2 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 2 of 6" ar="الخطوة ٢ من ٦" />
            </span>
            <h1 className="step-h">
              {lang === 'ar' ? (
                <>
                  لنتحقّق من <em>جهازك.</em>
                </>
              ) : (
                <>
                  Let's check <em>your machine.</em>
                </>
              )}
            </h1>
            <p className="step-sub">
              <Bi
                en="We detected the basics from your browser. The full check runs after install — this is just to set expectations."
                ar="اكتشفنا الأساسيات من متصفحك. الفحص الكامل يجري بعد التثبيت — هذا فقط لتوضيح التوقعات."
              />
            </p>

            <div className="check">
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Operating system" ar="نظام التشغيل" />
                  <small>
                    <Bi en="Windows 11 · supported" ar="ويندوز ١١ · مدعوم" />
                  </small>
                </span>
                <span className="v">Win 11</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Graphics card" ar="كرت الشاشة" />
                  <small>
                    <Bi en="NVIDIA RTX series detected" ar="تم اكتشاف NVIDIA RTX" />
                  </small>
                </span>
                <span className="v">RTX 4090</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="System memory" ar="ذاكرة النظام" />
                  <small>
                    <Bi en="16 GB or more recommended" ar="١٦ جيجابايت أو أكثر مُوصى به" />
                  </small>
                </span>
                <span className="v">32 GB</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Internet" ar="الإنترنت" />
                  <small>
                    <Bi en="Stable connection · 50+ Mbps" ar="اتصال مستقر · ٥٠+ ميجابت" />
                  </small>
                </span>
                <span className="v">280 Mbps</span>
              </div>
              <div className="row warn">
                <span className="ic">!</span>
                <span className="t">
                  <Bi en="Not supported" ar="غير مدعوم" />
                  <small>
                    <Bi en="GPUs below RTX 3060 Ti, and integrated graphics" ar="معالجات أقل من RTX 3060 Ti، والرسومات المدمجة" />
                  </small>
                </span>
                <span className="v">—</span>
              </div>
            </div>

            <div className="safe-line">
              <span className="ic">🛡</span>
              <span>
                <Bi
                  en="Jobs run in an isolated, GPU-scoped container. They can't see your files, and you can pause or quit anytime from the menu bar."
                  ar="المهام تعمل في حاوية معزولة محصورة بالمعالج. لا ترى ملفاتك، ويمكنك الإيقاف أو الخروج وقتما تشاء من شريط القوائم."
                />
              </span>
            </div>

            <div className="nav-row">
              <button className="btn sec" onClick={() => go(1)}>
                <Bi en="← Back" ar="→ رجوع" />
              </button>
              <button className="btn pri" onClick={() => go(3)}>
                <Bi en="Looks good →" ar="يبدو جيداً →" />
              </button>
            </div>
          </div>
          <div className="rail">
            <div className="rail-card">
              <h4>
                <Bi en="§ Will this harm my PC?" ar="§ هل يضر هذا بجهازي؟" />
              </h4>
              <p>
                <Bi
                  en="No. We cap utilization so your GPU never runs hotter than gaming. Set quiet hours and a temperature limit — your machine, your rules."
                  ar="لا. نحدّ من الاستخدام بحيث لا يسخن معالجك أكثر من الألعاب. اضبط ساعات الهدوء وحدّ الحرارة — جهازك، وقواعدك."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ Always in control" ar="§ التحكم الكامل لك" />
              </h4>
              <p>
                <Bi
                  en="One click in the menu bar pauses all jobs. Quit the app and your GPU is 100% yours again — instantly."
                  ar="نقرة واحدة في شريط القوائم توقف كل المهام. أغلق التطبيق ويعود معالجك ملكك بالكامل — فوراً."
                />
              </p>
            </div>
          </div>
        </div>

        {/* STEP 3 · GPU */}
        <div className="step-grid" data-pane="3" style={{ display: step === 3 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 3 of 6" ar="الخطوة ٣ من ٦" />
            </span>
            <h1 className="step-h">
              {lang === 'ar' ? (
                <>
                  هذا ما <em>ستشغّله.</em>
                </>
              ) : (
                <>
                  Here's what you'll be <em>running.</em>
                </>
              )}
            </h1>
            <p className="step-sub">
              <Bi
                en="Confirm your GPU and pick a rate. A lower rate wins more jobs; a higher rate earns more per job. Change it anytime."
                ar="أكّد معالجك واختر سعراً. السعر الأقل يفوز بمهام أكثر؛ والأعلى يربح أكثر لكل مهمة. غيّره وقتما تشاء."
              />
            </p>

            <div className="gpu-card">
              <div className="top">
                <div className="nm">
                  NVIDIA RTX 4090 <small>24 GB · Ada Lovelace · driver 552.22</small>
                </div>
                <span className="badge">
                  <Bi en="auto-detected" ar="اكتشاف تلقائي" />
                </span>
              </div>
              <div className="body">
                <div className="slider-row" style={{ marginTop: 0 }}>
                  <div className="lab">
                    <span>
                      <Bi en="Your rate" ar="سعرك" />
                    </span>
                    <b>
                      <span id="rate-pct">{rateLabel}</span>
                    </b>
                  </div>
                  <input
                    type="range"
                    id="rate"
                    min={0}
                    max={2}
                    value={rate}
                    step={1}
                    onChange={(e) => setRate(Number(e.target.value))}
                  />
                  <div className="lab" style={{ marginTop: 8, color: 'var(--mut)' }}>
                    <span>
                      <Bi en="Win more jobs" ar="مهام أكثر" />
                    </span>
                    <span>
                      <Bi en="Earn more per job" ar="ربح أكثر للمهمة" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="tiers">
              <div className="t on">
                <div className="nm">
                  <Bi en="Bronze" ar="برونزي" />{' '}
                  <span className="you">
                    <Bi en="you" ar="أنت" />
                  </span>
                </div>
                <div className="rq">
                  <Bi en="0+ jobs / mo" ar="٠+ مهمة شهرياً" />
                </div>
                <div className="share">70%</div>
              </div>
              <div className="t">
                <div className="nm">
                  <Bi en="Silver" ar="فضي" />
                </div>
                <div className="rq">
                  <Bi en="500+ jobs / mo" ar="٥٠٠+ مهمة شهرياً" />
                </div>
                <div className="share">75%</div>
              </div>
              <div className="t">
                <div className="nm">
                  <Bi en="Gold" ar="ذهبي" />
                </div>
                <div className="rq">
                  <Bi en="2,500+ jobs / mo" ar="٢٬٥٠٠+ مهمة شهرياً" />
                </div>
                <div className="share">82%</div>
              </div>
            </div>

            <div className="nav-row">
              <button className="btn sec" onClick={() => go(2)}>
                <Bi en="← Back" ar="→ رجوع" />
              </button>
              <button className="btn pri" onClick={() => go(4)}>
                <Bi en="See my earnings →" ar="اعرض أرباحي →" />
              </button>
            </div>
          </div>
          <div className="rail">
            <div className="rail-card tint">
              <h4>
                <Bi en="§ Your card's throughput" ar="§ إنتاجية معالجك" />
              </h4>
              <div className="counter">
                ~210 <span className="u">tok/sec</span>
              </div>
              <p style={{ marginTop: 8 }}>
                <Bi
                  en="Real measured speed for an RTX 4090 on our most-requested Arabic models."
                  ar="سرعة حقيقية مقاسة لـ RTX 4090 على أكثر النماذج العربية طلباً."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ How tiers work" ar="§ كيف تعمل الفئات" />
              </h4>
              <p>
                <Bi
                  en="The more reliably you serve jobs, the bigger your share of each Riyal. Everyone starts at Bronze and climbs automatically — no application."
                  ar="كلما خدمت المهام بموثوقية أكبر، زادت حصتك من كل ريال. الجميع يبدأ برونزياً ويصعد تلقائياً — دون طلب."
                />
              </p>
            </div>
          </div>
        </div>

        {/* STEP 4 · EARNINGS */}
        <div className="step-grid" data-pane="4" style={{ display: step === 4 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 4 of 6" ar="الخطوة ٤ من ٦" />
            </span>
            <h1 className="step-h">
              {lang === 'ar' ? (
                <>
                  كم يمكن أن <em>تكسب؟</em>
                </>
              ) : (
                <>
                  What could you <em>make?</em>
                </>
              )}
            </h1>
            <p className="step-sub">
              <Bi
                en="Drag to match how you'd actually run it. This is an estimate — real earnings depend on demand and uptime. We never guarantee a number."
                ar="اسحب لتطابق كيف ستشغّله فعلاً. هذا تقدير — الأرباح الحقيقية تعتمد على الطلب والجاهزية. لا نضمن رقماً أبداً."
              />
            </p>

            <div className="slider-row">
              <div className="lab">
                <span>
                  <Bi en="Hours per day" ar="ساعات يومياً" />
                </span>
                <b>
                  <span id="hrs-v">{hrs}</span> <span><Bi en="hrs" ar="ساعات" /></span>
                </b>
              </div>
              <input type="range" id="hrs" min={2} max={24} value={hrs} step={1} onChange={(e) => setHrs(Number(e.target.value))} />
            </div>
            <div className="slider-row">
              <div className="lab">
                <span>
                  <Bi en="Days per week" ar="أيام أسبوعياً" />
                </span>
                <b>
                  <span id="days-v">{days}</span>
                </b>
              </div>
              <input type="range" id="days" min={1} max={7} value={days} step={1} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
            <div className="slider-row">
              <div className="lab">
                <span>
                  <Bi en="Expected demand" ar="الطلب المتوقع" />
                </span>
                <b>
                  <span id="dem-v">{demandLabel}</span>
                </b>
              </div>
              <input type="range" id="dem" min={0} max={2} value={demand} step={1} onChange={(e) => setDemand(Number(e.target.value))} />
            </div>

            <div className="est-out">
              <div className="k">
                <Bi en="Estimated · per month" ar="تقديري · شهرياً" />
              </div>
              <div className="range">
                <span id="est-lo">{fmt(est.lo)}</span>–<span id="est-hi">{fmt(est.hi)}</span> <span className="u">SAR</span>
              </div>
              <div className="note">
                <Bi
                  en="Based on ~210 tok/sec measured throughput and current demand. An estimate, not a guarantee."
                  ar="بناءً على إنتاجية مقاسة ~٢١٠ رمز/ث والطلب الحالي. تقدير، وليس ضماناً."
                />
              </div>
              <div className="est-split">
                <div className="s you">
                  <div className="lab">
                    <Bi en="You keep · 75%" ar="تحتفظ · ٧٥٪" />
                  </div>
                  <div className="val">
                    <span id="split-you">{fmt(est.youLo)}</span>–<span id="split-you-hi">{fmt(est.youHi)}</span> SAR
                  </div>
                </div>
                <div className="s">
                  <div className="lab">
                    <Bi en="DCP · 25%" ar="DCP · ٢٥٪" />
                  </div>
                  <div className="val">
                    <span id="split-dcp">{fmt(est.dcpLo)}</span>–<span id="split-dcp-hi">{fmt(est.dcpHi)}</span> SAR
                  </div>
                </div>
              </div>
            </div>

            <div className="field" style={{ marginTop: 24 }}>
              <label>
                <Bi en="Where should we pay you? · Saudi IBAN" ar="أين ندفع لك؟ · آيبان سعودي" />
              </label>
              <input type="text" placeholder={ibanPh} />
              <div className="hint">
                <Bi
                  en="Weekly payouts in SAR via Moyasar, straight to your bank. Verified once, in about two minutes."
                  ar="مدفوعات أسبوعية بالريال عبر Moyasar، مباشرة إلى بنكك. تُوثّق مرة واحدة، في دقيقتين تقريباً."
                />
              </div>
            </div>
            <div className="legal">
              <span>
                <Bi
                  en="By continuing you agree to weekly SAR settlement and our data handling, described in our"
                  ar="بالمتابعة فإنك توافق على التسوية الأسبوعية بالريال وطريقة تعاملنا مع البيانات، الموضحة في"
                />
              </span>{' '}
              <a href="#">
                <Bi en="Privacy Policy" ar="سياسة الخصوصية" />
              </a>
              . <span><Bi en="Your data stays in the Kingdom." ar="بياناتك تبقى داخل المملكة." /></span>
            </div>

            <div className="nav-row">
              <button className="btn sec" onClick={() => go(3)}>
                <Bi en="← Back" ar="→ رجوع" />
              </button>
              <button className="btn pri" onClick={() => go(5)}>
                <Bi en="Install the app →" ar="ثبّت التطبيق →" />
              </button>
            </div>
          </div>
          <div className="rail">
            <div className="rail-card tint">
              <h4>
                <Bi en="§ How you get paid" ar="§ كيف تُدفع لك" />
              </h4>
              <p>
                <Bi
                  en="SAR, weekly, to your Saudi bank account via Moyasar. No crypto required, no currency conversion, no waiting on foreign transfers."
                  ar="بالريال، أسبوعياً، إلى حسابك البنكي السعودي عبر Moyasar. لا عملات رقمية، لا تحويل عملات، لا انتظار حوالات خارجية."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ The honest version" ar="§ النسخة الصادقة" />
              </h4>
              <p>
                <Bi
                  en="Nobody can promise a fixed income — demand moves. We show a range tied to real measured speeds, and you keep 75% of every Riyal a job earns."
                  ar="لا أحد يستطيع وعدك بدخل ثابت — الطلب يتغير. نعرض نطاقاً مرتبطاً بسرعات حقيقية مقاسة، وتحتفظ بـ ٧٥٪ من كل ريال تكسبه المهمة."
                />
              </p>
            </div>
          </div>
        </div>

        {/* STEP 5 · INSTALL */}
        <div className="step-grid" data-pane="5" style={{ display: step === 5 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 5 of 6" ar="الخطوة ٥ من ٦" />
            </span>
            <h1 className="step-h">
              {lang === 'ar' ? (
                <>
                  ثبّت <em>تطبيق المزوّد.</em>
                </>
              ) : (
                <>
                  Install the <em>provider app.</em>
                </>
              )}
            </h1>
            <p className="step-sub">
              <Bi
                en="A 4 MB app. It detects your GPU, installs the engine, pulls a model, and connects over a secure tunnel — no firewall changes needed."
                ar="تطبيق بحجم ٤ ميجابايت. يكتشف معالجك، ويثبّت المحرّك، ويسحب نموذجاً، ويتصل عبر نفق آمن — دون تغيير الجدار الناري."
              />
            </p>

            <div className="os-dl">
              <a
                className="os detected"
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  runSeq()
                }}
              >
                <div className="nm">Windows</div>
                <div className="meta">.msi · 4 MB</div>
                <span className="tag">
                  <Bi en="✓ your device" ar="✓ جهازك" />
                </span>
              </a>
              <a
                className="os"
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  runSeq()
                }}
              >
                <div className="nm">macOS</div>
                <div className="meta">.dmg · Apple Silicon</div>
              </a>
              <a
                className="os"
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  runSeq()
                }}
              >
                <div className="nm">Linux</div>
                <div className="meta">.deb / script</div>
              </a>
            </div>

            <p className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mut)', marginTop: 18 }}>
              <Bi en="Or paste this in your terminal — your key is already filled in:" ar="أو الصق هذا في الطرفية — مفتاحك مُدرج مسبقاً:" />
            </p>
            <div className="code-card">
              <code>{INSTALL_KEY}</code>
              <button className="copy" onClick={copyInstall}>
                <Bi en="Copy" ar="نسخ" />
              </button>
            </div>

            <div className="seq" id="seq">
              <div className={`ln${seqShown >= 1 ? ' show' : ''}`} data-d="0">
                <span className="ic">→</span>
                <span>
                  <Bi en="Scanning hardware…" ar="فحص العتاد…" />
                </span>
              </div>
              <div className={`ln${seqShown >= 2 ? ' show' : ''}`} data-d="1">
                <span className="ic">✓</span>
                <span>
                  {lang === 'ar' ? (
                    <>
                      تم اكتشاف <b>RTX 4090</b> · ٢٤ جيجابايت
                    </>
                  ) : (
                    <>
                      Detected <b>RTX 4090</b> · 24 GB
                    </>
                  )}
                </span>
              </div>
              <div className={`ln${seqShown >= 3 ? ' show' : ''}`} data-d="2">
                <span className="ic">✓</span>
                <span>
                  <Bi en="Installed inference engine" ar="تم تثبيت محرّك الاستدلال" />
                </span>
              </div>
              <div className={`ln${seqShown >= 4 ? ' show' : ''}`} data-d="3">
                <span className="ic">✓</span>
                <span>
                  <Bi en="Pulled model weights · 4.1 GB" ar="تم سحب أوزان النموذج · ٤٫١ جيجابايت" />
                </span>
              </div>
              <div className={`ln${seqShown >= 5 ? ' show' : ''}`} data-d="4">
                <span className="ic">✓</span>
                <span>
                  <Bi en="Opened secure tunnel — no port forwarding" ar="تم فتح نفق آمن — دون توجيه منافذ" />
                </span>
              </div>
            </div>

            <div className="safe-line">
              <span className="ic">📱</span>
              <span>
                <Bi
                  en="Installing on another device? We'll email a link, or scan a QR from your phone to hand off to your PC."
                  ar="تثبّت على جهاز آخر؟ سنرسل رابطاً بالبريد، أو امسح رمز QR من هاتفك لنقله إلى حاسبك."
                />
              </span>
            </div>

            <div className="nav-row">
              <button className="btn sec" onClick={() => go(4)}>
                <Bi en="← Back" ar="→ رجوع" />
              </button>
              <button className="btn pri" onClick={() => go(6)}>
                <Bi en="I've installed it →" ar="ثبّتُه →" />
              </button>
            </div>
          </div>
          <div className="rail">
            <div className="rail-card">
              <h4>
                <Bi en="§ What the app can and can't do" ar="§ ما يمكن للتطبيق فعله وما لا يمكنه" />
              </h4>
              <p>
                <Bi
                  en="It uses your GPU and a model folder — nothing else. It can't read your files, your messages, or your browser. Jobs run sandboxed, GPU-scoped."
                  ar="يستخدم معالجك ومجلد النموذج — لا شيء آخر. لا يقرأ ملفاتك أو رسائلك أو متصفحك. المهام تعمل معزولة، محصورة بالمعالج."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ Trusted installer" ar="§ مُثبّت موثوق" />
              </h4>
              <p>
                <Bi
                  en="Signed and notarized for Windows and macOS. Open-source daemon — inspect exactly what runs on your machine."
                  ar="موقّع ومُوثّق لويندوز وماك. خادم مفتوح المصدر — افحص بالضبط ما يعمل على جهازك."
                />
              </p>
            </div>
          </div>
        </div>

        {/* STEP 6 · VERIFY */}
        <div className="step-grid" data-pane="6" style={{ display: step === 6 ? 'grid' : 'none' }}>
          <div className="panel">
            <span className="eyebrow">
              <Bi en="Step 6 of 6" ar="الخطوة ٦ من ٦" />
            </span>
            {!verified && (
              <div className="verify-box" id="vb-wait">
                <div className="pulse-ring waiting">
                  <div className="core">◌</div>
                </div>
                <h2>
                  <Bi en="Waiting for your rig…" ar="بانتظار جهازك…" />
                </h2>
                <div className="heartbeat">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p>
                  <Bi
                    en="Listening for a heartbeat from the app. This usually takes a few seconds after install."
                    ar="نستمع لنبض من التطبيق. عادةً يستغرق ثوانٍ بعد التثبيت."
                  />
                </p>
              </div>
            )}
            {verified && (
              <div className="verify-box" id="vb-ok">
                <div className="pulse-ring ok">
                  <div className="core">✓</div>
                </div>
                <h2>
                  <Bi en="You're live and earning." ar="أنت متصل وتكسب." />
                </h2>
                <p>
                  <Bi
                    en="Connected · GPU detected · your first job is already routing to you."
                    ar="متصل · تم اكتشاف المعالج · أول مهمة في طريقها إليك."
                  />
                </p>
                <div className="what-now">
                  <div className="row">
                    <span className="ic">✓</span>
                    <span>
                      <Bi en="Your rig is in the console — watch it earn in real time." ar="جهازك في لوحة التحكم — شاهده يكسب فوراً." />
                    </span>
                  </div>
                  <div className="row">
                    <span className="ic">✓</span>
                    <span>
                      <b>
                        <Bi en="Set quiet hours" ar="اضبط ساعات الهدوء" />
                      </b>{' '}
                      <span>
                        <Bi en="so it eases off while you sleep or game." ar="ليخفّ أثناء نومك أو لعبك." />
                      </span>
                    </span>
                  </div>
                  <div className="row">
                    <span className="ic">✓</span>
                    <span>
                      <b>
                        <Bi en="First payout" ar="أول دفعة" />
                      </b>{' '}
                      <span>
                        <Bi en="lands next Monday, in SAR, to your bank." ar="تصل الإثنين القادم، بالريال، إلى بنكك." />
                      </span>
                    </span>
                  </div>
                </div>
                <Link className="btn pri block" href="/v2/provider/dashboard" style={{ marginTop: 24 }}>
                  <Bi en="Open my dashboard →" ar="افتح لوحتي →" />
                </Link>
              </div>
            )}
          </div>
          <div className="rail">
            <div className="rail-card tint">
              <h4>
                <Bi en="§ Rig status" ar="§ حالة الجهاز" />
              </h4>
              <p id="rig-status">
                {verified ? (
                  <>
                    <b style={{ color: 'var(--teal)' }}>
                      <Bi en="Connected" ar="متصل" />
                    </b>{' '}
                    · <Bi en="earning now" ar="يكسب الآن" />
                  </>
                ) : (
                  <Bi en="Connecting…" ar="جارٍ الاتصال…" />
                )}
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ Stuck?" ar="§ عالق؟" />
              </h4>
              <p>
                <Bi
                  en="If nothing happens after a minute, make sure the app is open and you're signed in to the same account. Still stuck? We're one tap away."
                  ar="إذا لم يحدث شيء بعد دقيقة، تأكد أن التطبيق مفتوح وأنك مسجّل بنفس الحساب. ما زلت عالقاً؟ نحن على بعد نقرة."
                />
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
