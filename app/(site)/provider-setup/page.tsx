'use client'

// /provider-setup.
// 6-step provider onboarding wizard (orange accent = provider context).
// Bilingual via the V2Provider context; dir/lang/palette handled globally.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../lib/i18n'
import { getApiBase, getProviderKey } from '@/lib/api'
import './provider-setup.css'

// ── Earnings estimate constants. The exact GPU profile is verified by the daemon after install. ──
const PER_HOUR = [1.15, 1.6, 2.2] as const
const WEEKS_PER_MONTH = 4.33
const PROVIDER_SHARE = 0.85
const PLATFORM_SHARE = 0.15

type SetupOs = 'windows' | 'mac' | 'linux'
type VerifyState = 'idle' | 'checking' | 'connected' | 'waiting' | 'error'

function isVerifiedProviderStatus(status: string): boolean {
  return ['online', 'connected', 'idle'].includes(status.toLowerCase())
}

function providerKeyFromStorage(): string {
  if (typeof window === 'undefined') return ''
  return getProviderKey() || ''
}

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10
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

  // wizard
  const [step, setStep] = useState(1)

  // magic-link sign-in
  const [magicSent, setMagicSent] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [providerKey, setProviderKey] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const sentTo = email || 'you@example.sa'

  // step 3 — rate slider
  const [rate, setRate] = useState(1)

  // step 4 — earnings estimator
  const [hrs, setHrs] = useState(8)
  const [days, setDays] = useState(7)
  const [demand, setDemand] = useState(1)
  const [iban, setIban] = useState('')

  // step 5 — installer command target
  const [selectedOs, setSelectedOs] = useState<SetupOs>('linux')

  // step 6 — verify
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [providerStatus, setProviderStatus] = useState('')
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    const key = providerKeyFromStorage()
    if (key) {
      setProviderKey(key)
      setApiKeyInput(key)
      // Already signed in — e.g. returning from the magic-link verify, which
      // stores the provider key in localStorage before redirecting here. Skip
      // the sign-in step so the user lands on Requirements, not back on step 1.
      setStep((s) => (s === 1 ? 2 : s))
    }
  }, [])

  const go = useCallback((n: number) => {
    setStep(n)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const persistProviderKey = useCallback(async (key: string) => {
    const clean = key.trim()
    if (!clean) {
      setAuthError(lang === 'ar' ? 'أدخل مفتاح المزوّد.' : 'Enter your provider API key.')
      return false
    }

    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await fetch(`${getApiBase()}/providers/me?key=${encodeURIComponent(clean)}`, {
        headers: { 'x-provider-key': clean },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.provider) throw new Error(data.error || 'Invalid provider API key.')
      localStorage.setItem('dc1_provider_key', clean)
      setProviderKey(clean)
      setApiKeyInput(clean)
      if (data.provider.name) setName(data.provider.name)
      if (data.provider.email) setEmail(data.provider.email)
      go(2)
      return true
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Provider sign-in failed.')
      return false
    } finally {
      setAuthBusy(false)
    }
  }, [go, lang])

  const sendMagic = useCallback(async () => {
    setAuthError('')
    if (!email.trim()) {
      setAuthError(lang === 'ar' ? 'أدخل بريدك الإلكتروني.' : 'Enter your email.')
      return
    }
    setAuthBusy(true)
    try {
      const res = await fetch(`${getApiBase()}/providers/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send sign-in link.')
      setMagicSent(true)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to send sign-in link.')
    } finally {
      setAuthBusy(false)
    }
  }, [email, lang])
  const resetMagic = useCallback(() => setMagicSent(false), [])

  const checkProviderStatus = useCallback(async () => {
    if (!providerKey) {
      setVerifyState('error')
      setVerifyError(lang === 'ar' ? 'سجّل الدخول بمفتاح المزوّد أولاً.' : 'Sign in with a provider key first.')
      return
    }
    setVerifyState('checking')
    setVerifyError('')
    try {
      const res = await fetch(`${getApiBase()}/providers/status?key=${encodeURIComponent(providerKey)}`, {
        headers: { 'x-provider-key': providerKey },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not check provider status.')
      const status = String(data.status || data.provider?.status || 'offline')
      setProviderStatus(status)
      setVerifyState(isVerifiedProviderStatus(status) ? 'connected' : 'waiting')
    } catch (err) {
      setVerifyState('error')
      setVerifyError(err instanceof Error ? err.message : 'Could not check provider status.')
    }
  }, [lang, providerKey])

  // ── verify against live provider status; never auto-resolve from a timer ──
  useEffect(() => {
    if (step !== 6 || !providerKey) return
    void checkProviderStatus()
    const id = window.setInterval(() => void checkProviderStatus(), 10000)
    return () => window.clearInterval(id)
  }, [checkProviderStatus, providerKey, step])

  const siteBase = typeof window !== 'undefined' ? window.location.origin : 'https://dcp.sa'
  const osParam = selectedOs === 'windows' ? 'windows' : selectedOs === 'mac' ? 'mac' : 'linux'
  const setupPath = providerKey
    ? `/api/providers/download/setup?key=${encodeURIComponent(providerKey)}&os=${encodeURIComponent(osParam)}`
    : ''
  const installCommand = providerKey
    ? selectedOs === 'windows'
      ? `iwr "${siteBase}${setupPath}" -OutFile dcp-setup.ps1; powershell -ExecutionPolicy Bypass -File .\\dcp-setup.ps1`
      : `curl -fsSL "${siteBase}${setupPath}" -o dcp-setup.sh && bash dcp-setup.sh`
    : 'Sign in with a provider API key to generate your installer command.'
  const verified = verifyState === 'connected'

  const runSeq = useCallback((os: SetupOs) => {
    setSelectedOs(os)
  }, [])

  const copyInstall = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(installCommand)
    }
  }, [installCommand])

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
        <Link href="/" className="wm">
          DCP<i>∞</i>
          <span className="ctx">
            <Bi en="Provider" ar="مزوّد" />
          </span>
        </Link>
        <div className="right">
          <Link className="help" href="/support">
            <Bi en="Need help?" ar="تحتاج مساعدة؟" />
          </Link>
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
                  {authBusy ? <Bi en="Sending…" ar="جارٍ الإرسال…" /> : <Bi en="Send magic link →" ar="أرسل الرابط السحري →" />}
                </button>
                <div className="field">
                  <label>
                    <Bi en="Already have a provider API key?" ar="لديك مفتاح مزوّد بالفعل؟" />
                  </label>
                  <input
                    type="password"
                    placeholder="dcp-provider-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                  />
                </div>
                <button className="btn sec block" style={{ marginTop: 12 }} onClick={() => void persistProviderKey(apiKeyInput)}>
                  {authBusy ? <Bi en="Checking…" ar="جارٍ التحقق…" /> : <Bi en="Continue with API key →" ar="تابع بالمفتاح →" />}
                </button>
                {authError && (
                  <div className="form-error" role="alert">
                    {authError}
                  </div>
                )}
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      resetMagic()
                    }}
                  >
                    <Bi en="Resend or edit email" ar="إعادة الإرسال أو تعديل البريد" />
                  </button>
                </div>
                <Link
                  className="btn sec"
                  style={{ marginTop: 22 }}
                  href="/auth?role=provider&method=apikey&redirect=/provider-setup"
                >
                  <Bi en="Finish sign-in with API key →" ar="أكمل الدخول بالمفتاح →" />
                </Link>
              </div>
            )}
          </div>

          <div className="rail">
            <div className="rail-card tint">
              <h4>
                <Bi en="§ Verified network" ar="§ الشبكة المتحققة" />
              </h4>
              <div className="counter">
                <span id="provider-verification-state">
                  <Bi en="Verified only" ar="متحقق فقط" />
                </span>{' '}
                <span className="u">
                  <Bi en="before listing" ar="قبل العرض" />
                </span>
              </div>
              <p style={{ marginTop: 8 }}>
                <Bi
                  en="Provider capacity is shown publicly only after real status and endpoint checks pass."
                  ar="تُعرض سعة المزوّدين علناً فقط بعد اجتياز فحص الحالة ونقطة الخدمة."
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
                en="These are the minimum expectations before install. The full check runs after the daemon reports your real GPU, memory, network, and serving endpoint."
                ar="هذه هي التوقعات الدنيا قبل التثبيت. يجري الفحص الكامل بعد أن يرسل الخادم المحلي معالجك الحقيقي والذاكرة والشبكة ونقطة الخدمة."
              />
            </p>

            <div className="check">
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Operating system" ar="نظام التشغيل" />
                  <small>
                    <Bi en="Windows, macOS, and Linux installers are available" ar="مثبّتات Windows وmacOS وLinux متاحة" />
                  </small>
                </span>
                <span className="v">Win / mac / Linux</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Graphics card" ar="كرت الشاشة" />
                  <small>
                    <Bi en="The daemon reports your exact GPU after install" ar="يرسل الخادم المحلي نوع المعالج الدقيق بعد التثبيت" />
                  </small>
                </span>
                <span className="v">RTX 3060 Ti+</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="System memory" ar="ذاكرة النظام" />
                  <small>
                    <Bi en="16 GB or more recommended" ar="١٦ جيجابايت أو أكثر مُوصى به" />
                  </small>
                </span>
                <span className="v">16 GB+</span>
              </div>
              <div className="row ok">
                <span className="ic">✓</span>
                <span className="t">
                  <Bi en="Internet" ar="الإنترنت" />
                  <small>
                    <Bi en="Stable connection · 50+ Mbps" ar="اتصال مستقر · ٥٠+ ميجابت" />
                  </small>
                </span>
                <span className="v">50+ Mbps</span>
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
                  <Bi en="Daemon-reported GPU" ar="المعالج كما يرسله الخادم المحلي" /> <small><Bi en="Exact model and VRAM appear after install" ar="يظهر النوع والذاكرة بعد التثبيت" /></small>
                </div>
                <span className="badge">
                  <Bi en="after install" ar="بعد التثبيت" />
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
                  <Bi en="Provider" ar="المزوّد" />{' '}
                  <span className="you">
                    <Bi en="you" ar="أنت" />
                  </span>
                </div>
                <div className="rq">
                  <Bi en="published split" ar="التقسيم المنشور" />
                </div>
                <div className="share">75%</div>
              </div>
              <div className="t">
                <div className="nm">
                  <Bi en="DCP" ar="DCP" />
                </div>
                <div className="rq">
                  <Bi en="platform operations" ar="تشغيل المنصة" />
                </div>
                <div className="share">25%</div>
              </div>
              <div className="t">
                <div className="nm">
                  <Bi en="Review" ar="مراجعة" />
                </div>
                <div className="rq">
                  <Bi en="shown before payout" ar="تظهر قبل الدفع" />
                </div>
                <div className="share">audit</div>
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
                <Bi en="§ Throughput proof" ar="§ إثبات الإنتاجية" />
              </h4>
              <div className="counter">
                <Bi en="after install" ar="بعد التثبيت" />
              </div>
              <p style={{ marginTop: 8 }}>
                <Bi
                  en="The console shows measured tokens per second only after the daemon reports your exact GPU and a backend probe can reach the served model."
                  ar="تعرض لوحة التحكم الرموز في الثانية فقط بعد أن يرسل الخادم المحلي نوع معالجك الدقيق وبعد أن يصل فحص الخلفية إلى النموذج المخدوم."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ Reliability" ar="§ الموثوقية" />
              </h4>
              <p>
                <Bi
                  en="Reliability affects routing and future eligibility. The published payout split remains 75% provider and 25% platform unless a separately audited policy changes it."
                  ar="تؤثر الموثوقية في التوجيه والأهلية المستقبلية. يبقى تقسيم الدفع المنشور ٧٥٪ للمزوّد و٢٥٪ للمنصّة ما لم تتغير سياسة مدققة بشكل منفصل."
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
                  en="Based on the planning rate selected above until your daemon reports measured throughput. An estimate, not a guarantee."
                  ar="بناءً على سعر التخطيط المحدد أعلاه حتى يرسل الخادم المحلي إنتاجية مقاسة. تقدير، وليس ضماناً."
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
                    <Bi en="DCP · 15%" ar="DCP · ١٥٪" />
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
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder={ibanPh}
                value={iban}
                onChange={(e) => {
                  const next = e.target.value
                  setIban(next)
                  // No payout-registration endpoint is wired into this wizard yet
                  // (the real Saudi-IBAN endpoint, POST /providers/:id/payout-account,
                  // also needs a holder name + Moyasar keys). Keep the typed IBAN as a
                  // local draft so it is not silently lost between steps and can be
                  // submitted once payout registration is wired up.
                  if (typeof window !== 'undefined') {
                    if (next.trim()) localStorage.setItem('dc1_provider_iban_draft', next.trim())
                    else localStorage.removeItem('dc1_provider_iban_draft')
                  }
                }}
              />
              <div className="hint">
                <Bi
                  en="Payouts in SAR land in your bank once your payout details are verified."
                  ar="تصل مدفوعاتك بالريال إلى بنكك بعد التحقق من بيانات الدفع."
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
              <Link href="/privacy">
                <Bi en="Privacy Policy" ar="سياسة الخصوصية" />
              </Link>
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
                  en="SAR, to your Saudi bank account via Moyasar. No crypto required, no currency conversion, no waiting on foreign transfers."
                  ar="بالريال، إلى حسابك البنكي السعودي عبر Moyasar. لا عملات رقمية، لا تحويل عملات، لا انتظار حوالات خارجية."
                />
              </p>
            </div>
            <div className="rail-card">
              <h4>
                <Bi en="§ The honest version" ar="§ النسخة الصادقة" />
              </h4>
              <p>
                <Bi
                  en="Nobody can promise a fixed income — demand moves. Before the first verified throughput report, this range is planning guidance only; once jobs settle, you keep 75% of every Riyal a job earns."
                  ar="لا أحد يستطيع وعدك بدخل ثابت — الطلب يتغير. قبل أول تقرير إنتاجية متحقق، هذا النطاق إرشاد تخطيطي فقط؛ وبعد تسوية المهام تحتفظ بـ ٧٥٪ من كل ريال تكسبه المهمة."
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
              <button
                type="button"
                className={selectedOs === 'windows' ? 'os selected' : 'os'}
                onClick={(e) => {
                  e.preventDefault()
                  runSeq('windows')
                }}
              >
                <div className="nm">Windows</div>
                <div className="meta">.exe · or terminal script</div>
                {selectedOs === 'windows' && (
                  <span className="tag">
                    <Bi en="selected" ar="محدد" />
                  </span>
                )}
              </button>
              <button
                type="button"
                className={selectedOs === 'mac' ? 'os selected' : 'os'}
                onClick={(e) => {
                  e.preventDefault()
                  runSeq('mac')
                }}
              >
                <div className="nm">macOS</div>
                <div className="meta">Apple Silicon · terminal script</div>
                {selectedOs === 'mac' && (
                  <span className="tag">
                    <Bi en="selected" ar="محدد" />
                  </span>
                )}
              </button>
              <button
                type="button"
                className={selectedOs === 'linux' ? 'os selected' : 'os'}
                onClick={(e) => {
                  e.preventDefault()
                  runSeq('linux')
                }}
              >
                <div className="nm">Linux</div>
                <div className="meta">terminal script</div>
                {selectedOs === 'linux' && (
                  <span className="tag">
                    <Bi en="selected" ar="محدد" />
                  </span>
                )}
              </button>
            </div>

            {selectedOs === 'windows' && (
              <p className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mut)', marginTop: 14 }}>
                <Bi en="Prefer an app? " ar="تفضّل تطبيقاً؟ " />
                <a href="/download/windows" style={{ color: 'var(--ink)' }}>
                  <Bi en="Download DCP-Provider-Setup.exe →" ar="حمّل DCP-Provider-Setup.exe ←" />
                </a>
              </p>
            )}
            <p className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mut)', marginTop: 18 }}>
              <Bi en="Or paste this in your terminal — generated from your provider key:" ar="أو الصق هذا في الطرفية — مُولّد من مفتاح المزوّد:" />
            </p>
            <div className="code-card">
              <code>{installCommand}</code>
              <button className="copy" onClick={copyInstall} disabled={!providerKey}>
                <Bi en="Copy" ar="نسخ" />
              </button>
            </div>
            {!providerKey && (
              <div className="form-error" role="alert">
                <Bi en="Sign in with a provider API key before downloading an installer." ar="سجّل الدخول بمفتاح مزوّد قبل تنزيل المثبّت." />
              </div>
            )}

            <div className="seq" id="seq">
              <div className="ln show" data-d="0">
                <span className="ic">→</span>
                <span>
                  <Bi en="Installer checks hardware and reports exact GPU/VRAM to DCP." ar="يفحص المثبّت العتاد ويرسل نوع المعالج والذاكرة بدقة إلى DCP." />
                </span>
              </div>
              <div className="ln show" data-d="1">
                <span className="ic">○</span>
                <span>
                  {lang === 'ar' ? (
                    <>
                      تنتظر الخلفية <b>تقرير المعالج</b> من الخادم المحلي، وليس تخميناً من المتصفح
                    </>
                  ) : (
                    <>
                      Backend waits for the daemon's <b>GPU report</b>, not a browser guess
                    </>
                  )}
                </span>
              </div>
              <div className="ln show" data-d="2">
                <span className="ic">○</span>
                <span>
                  <Bi en="Inference engine install runs on your machine." ar="يعمل تثبيت محرّك الاستدلال على جهازك." />
                </span>
              </div>
              <div className="ln show" data-d="3">
                <span className="ic">○</span>
                <span>
                  <Bi en="Model download size depends on the served model." ar="يعتمد حجم تنزيل النموذج على النموذج المخدوم." />
                </span>
              </div>
              <div className="ln show" data-d="4">
                <span className="ic">○</span>
                <span>
                  <Bi en="Secure tunnel opens only after the installer succeeds." ar="يفتح النفق الآمن فقط بعد نجاح المثبّت." />
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
              <button className="btn pri" onClick={() => { go(6); void checkProviderStatus() }} disabled={!providerKey}>
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
                  en="Open-source daemon — inspect exactly what runs on your machine."
                  ar="خادم مفتوح المصدر — افحص بالضبط ما يعمل على جهازك."
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
                <p className="status-note">
                  {verifyState === 'checking' ? (
                    <Bi en="Checking backend status…" ar="جارٍ التحقق من الحالة…" />
                  ) : verifyError ? (
                    verifyError
                  ) : providerStatus ? (
                    <Bi en={`Latest status: ${providerStatus}`} ar={`آخر حالة: ${providerStatus}`} />
                  ) : (
                    <Bi en="No daemon heartbeat has been observed yet." ar="لم تُرصد نبضة من الخادم المحلي بعد." />
                  )}
                </p>
                <button className="btn sec" style={{ marginTop: 18 }} onClick={() => void checkProviderStatus()}>
                  <Bi en="Check again" ar="تحقق مرة أخرى" />
                </button>
              </div>
            )}
            {verified && (
              <div className="verify-box" id="vb-ok">
                <div className="pulse-ring ok">
                  <div className="core">✓</div>
                </div>
                <h2>
                  <Bi en="Your rig is connected." ar="جهازك متصل." />
                </h2>
                <p>
                  <Bi
                    en="Backend status is online or connected. You can now open the provider console and watch routing, earnings, and health."
                    ar="حالة الخلفية متصلة أو نشطة. يمكنك الآن فتح لوحة المزوّد ومتابعة التوجيه والأرباح والصحة."
                  />
                </p>
                <div className="what-now">
                  <div className="row">
                    <span className="ic">✓</span>
                    <span>
                      <Bi en="Your rig is in the console — watch health, routing, and earnings there." ar="جهازك في لوحة التحكم — تابع الصحة والتوجيه والأرباح هناك." />
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
                        <Bi en="lands in SAR, to your bank, once your payout details are verified." ar="تصل بالريال إلى بنكك بعد التحقق من بيانات الدفع." />
                      </span>
                    </span>
                  </div>
                </div>
                <Link className="btn pri block" href="/provider/dashboard" style={{ marginTop: 24 }}>
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
                    · <Bi en="ready for routing" ar="جاهز للتوجيه" />
                  </>
                ) : (
                  <>
                    <Bi en="Waiting" ar="بانتظار الاتصال" />
                    {providerStatus ? ` · ${providerStatus}` : ''}
                  </>
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
