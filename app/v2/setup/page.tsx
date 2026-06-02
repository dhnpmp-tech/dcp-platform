'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './setup.css'

const STEPS = [
  { n: 1, en: '01 · Use case', ar: '01 · حالة الاستخدام' },
  { n: 2, en: '02 · Workspace', ar: '02 · مساحة العمل' },
  { n: 3, en: '03 · API key', ar: '03 · مفتاح API' },
  { n: 4, en: '04 · First call', ar: '04 · أول طلب' },
]

const USE_CASES = [
  {
    ic: '⌨',
    nameEn: 'Chat / assistant',
    nameAr: 'محادثة / مساعد',
    descEn: 'Customer support, internal tools, Arabic Q&A',
    descAr: 'دعم العملاء، أدوات داخلية، أسئلة وأجوبة بالعربية',
  },
  {
    ic: '⌕',
    nameEn: 'Search / RAG',
    nameAr: 'بحث / RAG',
    descEn: 'Embeddings + retrieval over your own docs',
    descAr: 'تضمينات + استرجاع من مستنداتك الخاصة',
  },
  {
    ic: '◷',
    nameEn: 'Agents / automation',
    nameAr: 'وكلاء / أتمتة',
    descEn: 'Multi-step workflows and tool use',
    descAr: 'تدفقات متعددة الخطوات واستخدام الأدوات',
  },
  {
    ic: '⊞',
    nameEn: 'Batch / pipeline',
    nameAr: 'دفعات / خط معالجة',
    descEn: 'High-volume offline processing',
    descAr: 'معالجة عالية الحجم دون اتصال',
  },
]

export default function SetupPage() {
  const { lang, toggle } = useV2()
  const [step, setStep] = useState(1)
  const [useCase, setUseCase] = useState(0)
  const [copied, setCopied] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    let cancelled = false
    const key = getRenterKey()
    if (!key) {
      setKeyStatus('missing')
      return
    }

    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/renters/me?key=${encodeURIComponent(key)}`, {
          headers: { 'x-renter-key': key },
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Stored renter key could not be verified.')
        }
        if (cancelled) return
        setApiKey(key)
        setKeyStatus('ready')
      } catch (err) {
        if (cancelled) return
        setKeyError(err instanceof Error ? err.message : 'Could not verify renter key.')
        setKeyStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const go = (n: number) => {
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyKey = () => {
    if (!apiKey) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(apiKey).catch(() => {})
    }
    setCopied(true)
  }

  const topAction =
    keyStatus === 'ready' ? (
      <Link href="/v2/renter/dashboard" className="skip">
        <Bi en="Open console →" ar="افتح الكونسول →" />
      </Link>
    ) : keyStatus === 'loading' ? null : (
      <Link href="/v2/auth?role=renter&new&redirect=/v2/setup" className="skip">
        <Bi en="Sign in to continue →" ar="سجّل الدخول للمتابعة →" />
      </Link>
    )

  return (
    <div className="setup">
      <div className="setup-top">
        <Link href="/v2" className="wm">
          DCP<i>∞</i>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="lang-toggle" onClick={toggle}>
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          {topAction}
        </div>
      </div>

      <div className="stepper" id="stepper">
        {STEPS.map((s) => {
          const cls = s.n === step ? 'step on' : s.n < step ? 'step done' : 'step'
          return (
            <div
              key={s.n}
              className={cls}
              data-s={s.n}
              aria-current={s.n === step ? 'step' : undefined}
            >
              <div className="bar">
                <span></span>
              </div>
              <div className="lbl">
                <Bi en={s.en} ar={s.ar} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1 */}
      <div className="card" data-pane={1} style={{ display: step === 1 ? 'block' : 'none' }}>
        <h1>
          <Bi en="What are you building?" ar="ماذا تبني؟" />
        </h1>
        <p className="sub">
          <Bi
            en="We’ll tune your defaults — it takes one click and you can change it any time."
            ar="سنضبط إعداداتك الافتراضية — نقرة واحدة، ويمكنك تغييرها في أي وقت."
          />
        </p>
        <div className="opt-grid">
          {USE_CASES.map((u, i) => (
            <div
              key={u.nameEn}
              className={i === useCase ? 'opt on' : 'opt'}
              onClick={() => setUseCase(i)}
            >
              <div className="ic">{u.ic}</div>
              <div className="nm">
                <Bi en={u.nameEn} ar={u.nameAr} />
              </div>
              <div className="desc">
                <Bi en={u.descEn} ar={u.descAr} />
              </div>
            </div>
          ))}
        </div>
        <div className="nav-row">
          <span></span>
          <button className="btn-pri" onClick={() => go(2)}>
            <Bi en="Continue →" ar="متابعة →" />
          </button>
        </div>
      </div>

      {/* Step 2 */}
      <div className="card" data-pane={2} style={{ display: step === 2 ? 'block' : 'none' }}>
        <h1>
          <Bi en="Name your workspace." ar="سمّ مساحة عملك." />
        </h1>
        <p className="sub">
          <Bi
            en="This is where your keys, usage, and billing live. Most teams use their company name."
            ar="هنا تعيش مفاتيحك واستخدامك وفواتيرك. تستخدم معظم الفرق اسم شركتها."
          />
        </p>
        <div className="field">
          <label>
            <Bi en="Workspace name" ar="اسم مساحة العمل" />
          </label>
          <input
            type="text"
            placeholder={lang === 'ar' ? 'مثال: نكست ويف للتجارة' : 'e.g. NextWave Commerce'}
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
        </div>
        <div className="field">
          <label>
            <Bi en="Region preference" ar="تفضيل المنطقة" />
          </label>
          <input
            type="text"
            defaultValue={lang === 'ar' ? 'الرياض (افتراضي)' : 'Riyadh (default)'}
            readOnly
            style={{ color: 'var(--mut)' }}
          />
          <div className="hint">
            <Bi
              en="All workspaces serve from inside the Kingdom. You can fine-tune routing later."
              ar="جميع مساحات العمل تُخدَّم من داخل المملكة. يمكنك ضبط التوجيه لاحقاً."
            />
          </div>
        </div>
        <div className="nav-row">
          <button className="btn-sec" onClick={() => go(1)}>
            <Bi en="← Back" ar="→ رجوع" />
          </button>
          <button className="btn-pri" onClick={() => go(3)}>
            <Bi en="Continue →" ar="متابعة →" />
          </button>
        </div>
      </div>

      {/* Step 3 */}
      <div className="card" data-pane={3} style={{ display: step === 3 ? 'block' : 'none' }}>
        <h1>
          <Bi en="Here’s your first key." ar="إليك مفتاحك الأول." />
        </h1>
        <p className="sub">
          <Bi
            en="Copy it now — for security we won’t show the full key again. You can create more any time."
            ar="انسخه الآن — لأسباب أمنية لن نعرض المفتاح كاملاً مجدداً. يمكنك إنشاء المزيد في أي وقت."
          />
        </p>
        {keyStatus === 'loading' && (
          <div className="key-reveal">
            <code>
              <Bi en="Checking your session…" ar="جارٍ التحقق من جلستك…" />
            </code>
          </div>
        )}
        {keyStatus === 'ready' && (
          <>
            <div className="key-reveal">
              <code>{apiKey}</code>
              <button className="copy" onClick={copyKey}>
                {copied ? <Bi en="Copied" ar="تم النسخ" /> : <Bi en="Copy" ar="نسخ" />}
              </button>
            </div>
            <p className="sub" style={{ marginTop: '8px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
              <Bi
                en="Stored locally as your renter API key. Create scoped production keys from the console after this first call."
                ar="مُخزَّن محلياً كمفتاح API للمستأجر. أنشئ مفاتيح إنتاج محددة النطاق من الكونسول بعد أول طلب."
              />
            </p>
          </>
        )}
        {keyStatus === 'missing' && (
          <div className="callout err">
            <Bi
              en="Sign in or create a renter account first. DCP only reveals real keys after email verification."
              ar="سجّل الدخول أو أنشئ حساب مستأجر أولاً. لا يعرض DCP المفاتيح الحقيقية إلا بعد التحقق من البريد."
            />{' '}
            <Link href="/v2/auth?role=renter&new&redirect=/v2/setup">
              <Bi en="Continue to auth" ar="تابع إلى المصادقة" />
            </Link>
          </div>
        )}
        {keyStatus === 'error' && (
          <div className="callout err">
            {keyError}{' '}
            <Link href="/v2/auth?role=renter&method=apikey&redirect=/v2/setup">
              <Bi en="Sign in again" ar="سجّل الدخول مجدداً" />
            </Link>
          </div>
        )}
        <div className="nav-row">
          <button className="btn-sec" onClick={() => go(2)}>
            <Bi en="← Back" ar="→ رجوع" />
          </button>
          <button className="btn-pri" onClick={() => go(4)} disabled={keyStatus !== 'ready'}>
            <Bi en="I’ve copied it →" ar="نسختُه →" />
          </button>
        </div>
      </div>

      {/* Step 4 */}
      <div className="card" data-pane={4} style={{ display: step === 4 ? 'block' : 'none' }}>
        <h1>
          <Bi en="Make your first call." ar="نفّذ أول طلب." />
        </h1>
        <p className="sub">
          <Bi
            en="Paste this into your terminal. It’ll stream an Arabic answer from inside the Kingdom — and it’s on your free credit."
            ar="الصق هذا في الطرفية. سيبثّ إجابة بالعربية من داخل المملكة — وعلى رصيدك المجاني."
          />
        </p>
        <pre className="code">
          <span className="c"># Your key is already filled in</span>
          {'\n$ '}
          <span className="k">curl</span>{' '}
          <span className="s">https://api.dcp.sa/v1/chat/completions</span>
          {' \\\n   '}
          <span className="k">-H</span>{' '}
          <span className="s">&quot;Authorization: Bearer {apiKey || 'YOUR_DCP_RENTER_KEY'}&quot;</span>
          {' \\\n   '}
          <span className="k">-d</span>{' '}
          <span className="s">{`'{"model":"allam-7b","messages":[{"role":"user","content":"مرحبا"}]}'`}</span>
        </pre>
        <div className="nav-row">
          <button className="btn-sec" onClick={() => go(3)}>
            <Bi en="← Back" ar="→ رجوع" />
          </button>
          <Link className="btn-pri" href="/v2/renter/dashboard">
            <Bi en="Open the console →" ar="افتح الكونسول →" />
          </Link>
        </div>
      </div>
    </div>
  )
}
