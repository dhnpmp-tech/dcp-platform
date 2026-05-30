'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
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

const API_KEY = 'dcp-renter-XXXXXXXXXXXXXXXXXXXX'

export default function SetupPage() {
  const { lang, toggle } = useV2()
  const [step, setStep] = useState(1)
  const [useCase, setUseCase] = useState(0)
  const [copied, setCopied] = useState(false)

  const go = (n: number) => {
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyKey = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(API_KEY).catch(() => {})
    }
    setCopied(true)
  }

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
          <Link href="/v2/renter/dashboard" className="skip">
            <Bi en="Skip to console →" ar="تخطّي إلى الكونسول →" />
          </Link>
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
            defaultValue=""
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
        <div className="key-reveal">
          <code>{API_KEY}</code>
          <button className="copy" onClick={copyKey}>
            {copied ? <Bi en="Copied" ar="تم النسخ" /> : <Bi en="Copy" ar="نسخ" />}
          </button>
        </div>
        <p className="sub" style={{ marginTop: '8px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
          <Bi en="Stored as " ar="مُخزَّن باسم " />
          <b style={{ color: 'var(--ink)' }}>production-server</b>
          <Bi en=" · full scope · SAR 20 free credit applied" ar=" · نطاق كامل · رصيد مجاني 20 ريال مُطبَّق" />
        </p>
        <div className="nav-row">
          <button className="btn-sec" onClick={() => go(2)}>
            <Bi en="← Back" ar="→ رجوع" />
          </button>
          <button className="btn-pri" onClick={() => go(4)}>
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
          <span className="s">&quot;Authorization: Bearer sk_live_7f3a…&quot;</span>
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
