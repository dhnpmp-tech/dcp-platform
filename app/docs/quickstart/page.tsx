'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded border border-dc1-border bg-dc1-surface-l3 px-2 py-1 text-xs text-dc1-text-muted transition hover:text-dc1-amber"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative mt-3">
      <pre dir="ltr" className="overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 pr-16 text-left text-xs text-dc1-text-secondary leading-relaxed max-w-full whitespace-pre-wrap break-words">
        {code}
      </pre>
      <CopyButton text={code} />
    </div>
  )
}

function QuickstartLoadingState() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-dc1-void py-8">
        <section className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
            <p className="text-sm text-dc1-text-secondary">Loading quickstart...</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

type SdkKey = 'node' | 'python' | 'cli'

interface SdkCard {
  title: string
  subtitle: string
  installLabel: string
  runLabel: string
  verifyLabel: string
  verifyHint: string
  installCode: string
  runCode: string
  verifyCode: string
}

// ── Step card ─────────────────────────────────────────────────────────────────
function StepCard({
  number,
  time,
  title,
  titleAr,
  children,
  isRTL,
}: {
  number: number
  time: string
  title: string
  titleAr: string
  children: React.ReactNode
  isRTL: boolean
}) {
  return (
    <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-5 sm:p-6">
      <div className={`flex items-start gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dc1-amber/15 text-sm font-bold text-dc1-amber">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h2 className="text-base font-semibold text-dc1-text-primary">
              {isRTL ? titleAr : title}
            </h2>
            <span className="rounded-full border border-dc1-border bg-dc1-surface-l2 px-2 py-0.5 text-xs text-dc1-text-muted">
              {time}
            </span>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── Translations ──────────────────────────────────────────────────────────────
const copy = {
  en: {
  badge: 'QUICKSTART',
  heading: 'Submit and validate your first renter workload in five checkpoints',
  sub: 'From API key to output: auth, balance, compatible provider selection, submission, and completion review.',
  roleHeading: 'Choose your role path',
  roleSub: 'Start from the flow that matches your role. DCP keeps one consistent trust model: Saudi energy advantage, Arabic AI support, and containerized execution.',
  roleCards: [
    {
      title: 'I am a renter',
      desc: 'Follow the renter checklist and ship your first workload.',
      cta: 'Open renter checklist',
      href: '#renter-onboarding-checklist',
    },
    {
      title: 'I am a provider',
      desc: 'Register your GPU (NVIDIA or Apple Silicon), download the 4 MB app, and go online. No Docker needed.',
      cta: 'Start provider onboarding',
      href: '/setup',
    },
    {
      title: 'I am integrating API',
      desc: 'Use auth and endpoint contracts for production-safe integration.',
      cta: 'Open API integration start',
      href: '/docs/api/openrouter-60s-quickstart',
    },
  ],
  sdkHeading: 'SDK Quickstarts (Node, Python, CLI)',
  sdkSub: 'Use one SDK track at a time and verify key, connectivity, and completion before scaling.',
    sdkTabs: {
      node: 'Node.js',
      python: 'Python',
      cli: 'CLI',
    },
  stepTitles: [
    'Get your API key',
    'Top up your balance',
    'Browse available GPUs',
    'Submit a job',
    'Monitor job status',
  ],
  stepTimes: ['Prepare', 'Fund', 'Select', 'Submit', 'Track'],
    s1: {
      p1: 'Register a renter account at',
      p2: 'dcp.sa/renter/register',
      p3: ". You'll receive a renter API key — copy it from the dashboard and keep it private.",
      note: 'Keep your key safe. It authenticates all API calls and is shown once.',
    },
    s2: {
      p1: 'Fund wallet in SAR. Use the dashboard at',
      p2: 'dcp.sa/renter/billing',
      p3: ', or call the API directly:',
      note: 'Billing in every flow is the same: estimate hold in halala before start, runtime settlement after completion, unused hold returned automatically.',
    },
    s3: {
      p1: 'Fetch live providers from the marketplace and note the',
      code: 'id',
      p2: 'for the compatible provider you choose:',
      note: 'Save the',
      code2: 'provider.id',
      p3: 'for your job submit request.',
    },
    s4: {
      p1: 'Submit an LLM job and pass your renter key in the',
      code: 'x-renter-key',
      p2: 'header:',
      note: 'DCP holds an estimate before execution and reconciles against actual runtime when the job completes.',
    },
    s5: {
      p1: 'Poll the job endpoint until',
      code: 'status',
      p2: 'reaches',
      code2: 'completed',
      p3: ', then fetch the output:',
      statuses: 'Status flow:',
      statusFlow: 'pending → queued → running → completed',
      logsNote: 'Logs are available at',
    },
    next: 'Next actions',
    nextItems: [
      { label: 'View API reference', href: '/docs/api' },
      { label: 'Open renter guide', href: '/docs/renter-guide' },
      { label: 'Open provider guide', href: '/docs/provider-guide' },
    ],
    toggleLang: 'عربي',
    verifyHeading: 'Verification checklist',
  checklistHeading: 'Renter onboarding checklist',
  checklistItems: [
    { label: 'Register renter account', href: '/renter/register' },
    { label: 'Top up wallet', href: '/renter/billing' },
    { label: 'Choose a GPU in marketplace', href: '/renter/marketplace' },
    { label: 'Submit workload', href: '/renter/playground?starter=1' },
    { label: 'Monitor output and logs', href: '/renter/jobs' },
  ],
  verifyItems: [
    'Confirm your API key starts with dcp-renter-',
    'Confirm top-up response includes success=true and new_balance_halala',
    'Capture job_id from submit response before polling status',
    ],
    sdkCards: {
      node: {
        title: 'Node.js SDK',
        subtitle: 'Typed renter workflows from backend services.',
        installLabel: 'Install',
        runLabel: 'Submit + wait',
        verifyLabel: 'Verify connectivity',
        verifyHint: 'Expected: your renter profile JSON with email and balance fields.',
      },
      python: {
        title: 'Python SDK',
        subtitle: 'Renter workflow helper for job submission.',
        installLabel: 'Install',
        runLabel: 'Submit + wait',
        verifyLabel: 'Verify profile',
        verifyHint: 'Expected: renter profile JSON with email and balance fields.',
      },
      cli: {
        title: 'CLI Quickstart',
        subtitle: 'Direct API smoke tests from any shell.',
        installLabel: 'Set env vars',
        runLabel: 'Submit a sample job',
        verifyLabel: 'Verify status endpoint',
        verifyHint: 'Expected: status transitions pending/queued/running/completed.',
      },
    },
  },
  ar: {
  badge: 'دليل البدء السريع',
  heading: 'شغّل حمولة GPU في خطوات واضحة',
  sub: 'من إعداد الحساب إلى إرسال الحمولة: خطوات واضحة للمصادقة، الرصيد، اختيار مزود مناسب، ومراجعة النتيجة.',
  roleHeading: 'اختر مسارك حسب الدور',
  roleSub: 'ابدأ من المسار المناسب لدورك. DCP يحافظ على نفس ركائز الثقة: ميزة الطاقة السعودية، دعم النماذج العربية، وتشغيل عبر الحاويات.',
  roleCards: [
    {
      title: 'أنا مستأجر',
      desc: 'اتبع قائمة تحقق المستأجر وشغّل أول حمولة بسرعة.',
      cta: 'افتح قائمة تحقق المستأجر',
      href: '#renter-onboarding-checklist',
    },
    {
      title: 'أنا مزود',
      desc: 'سجّل وحدة GPU (NVIDIA أو Apple Silicon)، نزّل التطبيق بحجم 4 ميغابايت، وابدأ. لا حاجة لـ Docker.',
      cta: 'ابدأ إعداد المزود',
      href: '/setup',
    },
    {
      title: 'أنا أدمج API',
      desc: 'ابدأ بالمصادقة وخرائط النقاط النهائية لتكامل إنتاجي آمن.',
      cta: 'افتح بداية تكامل API',
      href: '/docs/api/openrouter-60s-quickstart',
    },
  ],
    sdkHeading: 'أدلة SDK السريعة (Node وPython وCLI)',
    sdkSub: 'بدّل بين المسارات واختبر كل مسار خلال دقائق.',
    sdkTabs: {
      node: 'Node.js',
      python: 'Python',
      cli: 'CLI',
    },
    stepTitles: [
      'احصل على مفتاح API',
      'أضف رصيدًا لمحفظتك',
      'تصفّح وحدات GPU المتاحة',
      'أرسل وظيفة',
      'راقب حالة الوظيفة',
    ],
  stepTimes: ['التهيئة', 'الشحن', 'الاختيار', 'الإرسال', 'المتابعة'],
    s1: {
      p1: 'سجّل حساب مستأجر على',
      p2: 'dcp.sa/renter/register',
      p3: '. ستحصل على مفتاح API — انسخه من لوحة التحكم.',
      note: 'احتفظ بمفتاحك بأمان. يُستخدم لمصادقة جميع طلبات API ويُعرض مرةً واحدة فقط.',
    },
    s2: {
      p1: 'أضف ريالات سعودية إلى محفظتك. استخدم لوحة التحكم على',
      p2: 'dcp.sa/renter/billing',
      p3: '، أو استدعِ API مباشرةً:',
      note: 'الفوترة موحدة في جميع المسارات: حجز تقديري بالهللة قبل التشغيل، ثم تسوية حسب وقت التشغيل الفعلي، مع إعادة الرصيد غير المستخدم تلقائيًا.',
    },
    s3: {
      p1: 'استرجع سوق GPU المباشر للعثور على مزود مناسب وسجّل',
      code: 'id',
      p2: 'لتقديم طلب الوظيفة:',
      note: 'دوّن',
      code2: 'provider.id',
      p3: 'لاستخدامه في الإرسال.',
    },
    s4: {
      p1: 'أرسل وظيفة استدلال LLM باستخدام PyTorch. مرّر مفتاح المستأجر في ترويسة',
      code: 'x-renter-key',
      p2: ':',
      note: 'تستخدم الفوترة تقديرًا مسبقًا قبل التنفيذ ثم تسوية حسب وقت التشغيل الفعلي بعد الاكتمال.',
    },
    s5: {
      p1: 'استطلع نقطة نهاية الوظيفة حتى يصل',
      code: 'status',
      p2: 'إلى',
      code2: 'completed',
      p3: '، ثم استرجع المخرجات:',
      statuses: 'تدفق الحالات:',
      statusFlow: 'pending → queued → running → completed',
      logsNote: 'السجلات متاحة على',
    },
    next: 'الخطوات التالية',
    nextItems: [
      { label: 'عرض مرجع API', href: '/docs/api' },
      { label: 'فتح دليل المستأجر', href: '/docs/renter-guide' },
      { label: 'فتح دليل المزود', href: '/docs/provider-guide' },
    ],
    toggleLang: 'English',
    verifyHeading: 'قائمة التحقق',
    checklistHeading: 'قائمة تحقق المستأجر',
    checklistItems: [
      { label: 'سجل حساب مستأجر', href: '/renter/register' },
      { label: 'اشحن المحفظة', href: '/renter/billing' },
      { label: 'اختر GPU من السوق', href: '/renter/marketplace' },
      { label: 'أرسل وظيفة تجريبية', href: '/renter/playground?starter=1' },
      { label: 'راقب المخرجات والسجلات', href: '/renter/jobs' },
    ],
    verifyItems: [
      'تأكد أن مفتاح API يبدأ بـ dcp-renter-',
      'تأكد أن استجابة الشحن تحتوي success=true و new_balance_halala',
      'احفظ قيمة job_id من استجابة الإرسال قبل مراقبة الحالة',
    ],
    sdkCards: {
      node: {
        title: 'Node.js SDK',
        subtitle: 'تكامل مهام المستأجر من خدمات الباك إند.',
        installLabel: 'التثبيت',
        runLabel: 'إرسال + انتظار',
        verifyLabel: 'التحقق من الاتصال',
        verifyHint: 'المتوقع: JSON يحتوي البريد والرصيد.',
      },
      python: {
        title: 'Python SDK',
        subtitle: 'مسار مستأجر: إرسال وظيفتك والتحقق من الحالة عبر Python.',
        installLabel: 'التثبيت',
        runLabel: 'إرسال + انتظار',
        verifyLabel: 'التحقق من الملف الشخصي',
        verifyHint: 'المتوقع: JSON يحوي البريد الإلكتروني والرصيد.',
      },
      cli: {
        title: 'CLI Quickstart',
        subtitle: 'اختبارات API مباشرة من أي سطر أوامر.',
        installLabel: 'ضبط المتغيرات',
        runLabel: 'إرسال وظيفة تجريبية',
        verifyLabel: 'التحقق من الحالة',
        verifyHint: 'المتوقع: انتقالات الحالة pending/queued/running/completed.',
      },
    },
  },
}

// ── Code snippets ─────────────────────────────────────────────────────────────
const TOPUP_CODE = `# Check available models (no auth needed)
curl https://api.dcp.sa/v1/models`

const TOPUP_RESPONSE = `{
  "data": [
    {
      "id": "qwen3-30b-a3b",
      "name": "Qwen3 30B-A3B (MoE)",
      "provider_count": 1,
      "context_length": 32768,
      "max_vram_gb": 18
    }
  ]
}`

const BROWSE_CODE = `# Run inference (OpenAI-compatible)
curl -X POST https://api.dcp.sa/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_RENTER_KEY" \\
  -d '{
    "model": "qwen3-30b-a3b",
    "messages": [{"role": "user", "content": "What is the capital of Saudi Arabia?"}],
    "max_tokens": 100
  }'`

const BROWSE_RESPONSE = `{
  "id": "chatcmpl-abc123",
  "model": "qwen3-30b-a3b",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "The capital of Saudi Arabia is Riyadh."
    }
  }],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 12,
    "total_tokens": 27
  }
}`

const SUBMIT_CODE = `# Python (drop-in OpenAI replacement)
from openai import OpenAI

client = OpenAI(
    base_url="https://api.dcp.sa/v1",
    api_key="YOUR_RENTER_KEY"
)

response = client.chat.completions.create(
    model="qwen3-30b-a3b",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=100
)
print(response.choices[0].message.content)`

const SUBMIT_RESPONSE = `# Node.js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.dcp.sa/v1",
  apiKey: "YOUR_RENTER_KEY"
});

const response = await client.chat.completions.create({
  model: "qwen3-30b-a3b",
  messages: [{ role: "user", content: "Hello" }]
});
console.log(response.choices[0].message.content);`

const POLL_CODE = `# Poll status
curl https://api.dcp.sa/api/jobs/job-abc123

# Fetch output (returns 202 while running, 200 when completed)
curl https://api.dcp.sa/api/jobs/job-abc123/output`

const POLL_RESPONSE = `{
  "type": "text",
  "response": "Transformers are a neural network architecture...",
  "billing": {
    "actual_cost_halala": 188,
    "refunded_halala": 12
  }
}`

const SDK_SNIPPETS: Record<SdkKey, Omit<SdkCard, 'title' | 'subtitle' | 'installLabel' | 'runLabel' | 'verifyLabel' | 'verifyHint'>> = {
    node: {
    installCode: `npm install openai`,
  runCode: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.dcp.sa/v1",
  apiKey: process.env.DCP_RENTER_KEY,
});

const response = await client.chat.completions.create({
  model: "qwen3-30b-a3b",
  messages: [{ role: "user", content: "Explain transformer attention in 2 lines." }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);`,
    verifyCode: `// Check balance
const res = await fetch("https://api.dcp.sa/api/renters/me", {
  headers: { "x-renter-key": process.env.DCP_RENTER_KEY }
});
const data = await res.json();
console.log(data.name, data.balance_halala + " halala");`,
  },
  python: {
    installCode: `pip install openai`,
    runCode: `from openai import OpenAI
import os

client = OpenAI(
    base_url="https://api.dcp.sa/v1",
    api_key=os.environ["DCP_RENTER_KEY"],
)

response = client.chat.completions.create(
    model="qwen3-30b-a3b",
    messages=[{"role": "user", "content": "Summarize this sentence in one line."}],
    max_tokens=100,
)

print(response.choices[0].message.content)

submit_resp = requests.post(
  f'{BASE_URL}/jobs/submit',
  headers={'x-renter-key': API_KEY},
  json=submit_payload,
)
job = submit_resp.json()['job']

job_id = job['job_id']
while True:
  status_resp = requests.get(
    f'{BASE_URL}/jobs/{job_id}',
    headers={'x-renter-key': API_KEY},
  ).json()
  if status_resp['status'] == 'completed':
    break
  time.sleep(3)

print('job completed', job_id, status_resp['status'])`,
    verifyCode: `me_resp = requests.get(
  f'{BASE_URL}/renters/me',
  headers={'x-renter-key': API_KEY},
).json()
print(me_resp.get('email'), me_resp.get('balance_halala'))`,
  },
  cli: {
    installCode: `export DCP_RENTER_KEY="dcp-renter-xxxx"
export API_BASE="https://api.dcp.sa/api"`,
  runCode: `curl -X POST "$API_BASE/jobs/submit" \\
  -H "Content-Type: application/json" \\
  -H "x-renter-key: $DCP_RENTER_KEY" \\
  -d '{
    "provider_id": 42,
    "job_type": "llm_inference",
    "duration_minutes": 5,
    "container_spec": { "image_type": "vllm-serve" },
    "params": { "model": "meta-llama/Llama-3-8B", "prompt": "Say hello from DCP" }
  }'`,
    verifyCode: `curl "$API_BASE/jobs/<job_id>" \\
  -H "x-renter-key: $DCP_RENTER_KEY"`,
  },
}

// ── Page ──────────────────────────────────────────────────────────────────────
function QuickstartPageInner() {
  const { language, setLanguage, t: tr } = useLanguage()
  const isRTL = language === 'ar'
  const t = copy[language]
  const [activeSdk, setActiveSdk] = useState<SdkKey>('node')
  const billingExplainerRef = useRef<HTMLDivElement | null>(null)
  const hasTrackedBillingExplainerView = useRef(false)

  const trackQuickstartEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = { event, source: 'docs_quickstart', ...payload }
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
    const win = window as typeof window & {
      dataLayer?: Array<Record<string, unknown>>
      gtag?: (...args: unknown[]) => void
    }
    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(detail)
    }
    if (typeof win.gtag === 'function') {
      win.gtag('event', event, detail)
    }
  }, [])

  const sdkCards = useMemo<Record<SdkKey, SdkCard>>(() => {
    return {
      node: { ...t.sdkCards.node, ...SDK_SNIPPETS.node },
      python: { ...t.sdkCards.python, ...SDK_SNIPPETS.python },
      cli: { ...t.sdkCards.cli, ...SDK_SNIPPETS.cli },
    }
  }, [t])

  const activeCard = sdkCards[activeSdk]
  const firstJobChecklist = useMemo(
    () => [
      { label: tr('conversion.first_job.step.register'), href: '/renter/register' },
      { label: tr('conversion.first_job.step.topup'), href: '/renter/billing' },
      { label: tr('conversion.first_job.step.choose_gpu'), href: '/renter/marketplace' },
      { label: tr('conversion.first_job.step.submit'), href: '/renter/playground?starter=1' },
      { label: tr('conversion.first_job.step.monitor'), href: '/renter/jobs' },
    ],
    [tr]
  )

  useEffect(() => {
    const node = billingExplainerRef.current
    if (!node || hasTrackedBillingExplainerView.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (hasTrackedBillingExplainerView.current) return
        if (entries.some((entry) => entry.isIntersecting)) {
          hasTrackedBillingExplainerView.current = true
          trackQuickstartEvent('billing_explainer_viewed', { page: 'quickstart' })
          observer.disconnect()
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [trackQuickstartEvent])

  return (
    <div className="min-h-screen bg-dc1-void" dir={isRTL ? 'rtl' : 'ltr'}>
      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero card */}
        <div className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
          <div className={`flex items-center justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <p className="text-xs uppercase tracking-[0.16em] text-dc1-amber">{t.badge}</p>
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="rounded border border-dc1-border bg-dc1-surface-l2 px-3 py-1 text-xs text-dc1-text-secondary transition hover:text-dc1-amber hover:border-dc1-amber/30"
            >
              {t.toggleLang}
            </button>
          </div>
          <h1 className={`mt-2 text-3xl font-bold text-dc1-text-primary sm:text-4xl ${isRTL ? 'text-right' : ''}`}>
            {tr('quickstart.intro_headline')}
          </h1>
          <p className={`mt-3 text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>{tr('quickstart.intro_body')}</p>

          {/* Step progress bar */}
          <div className={`mt-6 flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="flex items-center gap-1">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-dc1-amber/20 text-xs font-bold text-dc1-amber">
                  {n}
                </div>
                {n < 5 && <div className="h-px w-6 bg-dc1-border sm:w-10" />}
              </div>
            ))}
          </div>
          <p className={`mt-4 text-xs text-dc1-text-muted ${isRTL ? 'text-right' : ''}`}>
            {tr('quickstart.intro_note')}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
          <h2 className={`text-lg font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {t.roleHeading}
          </h2>
          <p className={`mt-2 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
            {t.roleSub}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {t.roleCards.map((card) => (
              <div key={card.href} className="rounded-xl border border-dc1-border bg-dc1-surface-l2 p-4">
                <h3 className={`text-base font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>{card.title}</h3>
                <p className={`mt-2 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>{card.desc}</p>
                <Link
                  href={card.href}
                  className="btn btn-primary btn-sm mt-4"
                  onClick={() =>
                    trackQuickstartEvent('role_path_cta_clicked', {
                      language,
                      role_path_title: card.title,
                      destination: card.href,
                    })
                  }
                >
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Billing transparency */}
        <div ref={billingExplainerRef} className="mt-6 rounded-xl border border-dc1-amber/25 bg-dc1-amber/5 p-6">
          <h2 className={`text-lg font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {tr('billing.explainer.title')}
          </h2>
          <ul className={`mt-3 space-y-2 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
            <li>{tr('billing.explainer.step1')}</li>
            <li>{tr('billing.explainer.step2')}</li>
            <li>{tr('billing.explainer.step3')}</li>
          </ul>
          <p className={`mt-3 text-xs text-dc1-text-muted ${isRTL ? 'text-right' : ''}`}>{tr('billing.explainer.note')}</p>
          <p className={`mt-2 text-xs text-dc1-text-muted ${isRTL ? 'text-right' : ''}`}>{tr('billing.explainer.rail_status')}</p>
        </div>

        <div id="renter-onboarding-checklist" className="mt-6 rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6">
          <h2 className={`text-lg font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {tr('conversion.first_job.title')}
          </h2>
          <ol className="mt-4 space-y-2">
            {firstJobChecklist.map((item, index) => (
              <li key={item.href} className={`flex items-center justify-between gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
                  {index + 1}. {item.label}
                </span>
                <Link
                  href={item.href}
                  onClick={() =>
                    trackQuickstartEvent('first_job_checklist_step_clicked', {
                      page: 'quickstart',
                      step_index: index + 1,
                      step_label: item.label,
                      destination: item.href,
                    })
                  }
                  className="text-xs font-medium text-dc1-amber hover:underline"
                >
                  {tr('common.open')}
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {/* Steps */}
        <div className="mt-6 space-y-4">

          {/* Step 1: Get API key */}
          <StepCard number={1} time={t.stepTimes[0]} title={t.stepTitles[0]} titleAr={copy.ar.stepTitles[0]} isRTL={isRTL}>
            <p className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {t.s1.p1}{' '}
              <Link href="/renter/register" className="text-dc1-amber underline-offset-2 hover:underline">
                {t.s1.p2}
              </Link>
              {t.s1.p3}
            </p>
            <div className="mt-3 rounded-lg border border-dc1-amber/20 bg-dc1-amber/5 px-4 py-3 text-xs text-dc1-amber">
              {t.s1.note}
            </div>
          </StepCard>

          {/* Step 2: Top up */}
          <StepCard number={2} time={t.stepTimes[1]} title={t.stepTitles[1]} titleAr={copy.ar.stepTitles[1]} isRTL={isRTL}>
            <p className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {t.s2.p1}{' '}
              <Link href="/renter/billing" className="text-dc1-amber underline-offset-2 hover:underline">
                {t.s2.p2}
              </Link>
              {t.s2.p3}
            </p>
            <CodeBlock code={TOPUP_CODE} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Response</p>
            <CodeBlock code={TOPUP_RESPONSE} />
            <div className="mt-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3 text-xs text-dc1-text-muted">
              {t.s2.note}
            </div>
          </StepCard>

          {/* Step 3: Browse GPUs */}
          <StepCard number={3} time={t.stepTimes[2]} title={t.stepTitles[2]} titleAr={copy.ar.stepTitles[2]} isRTL={isRTL}>
            <p className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {t.s3.p1}{' '}
              <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-dc1-amber">{t.s3.code}</code>
              {' '}{t.s3.p2}
            </p>
            <CodeBlock code={BROWSE_CODE} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Response</p>
            <CodeBlock code={BROWSE_RESPONSE} />
            <div className="mt-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3 text-xs text-dc1-text-muted">
              {t.s3.note}{' '}
              <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-dc1-amber">{t.s3.code2}</code>
              {' '}{t.s3.p3}
            </div>
          </StepCard>

          {/* Step 4: Submit job */}
          <StepCard number={4} time={t.stepTimes[3]} title={t.stepTitles[3]} titleAr={copy.ar.stepTitles[3]} isRTL={isRTL}>
            <p className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {t.s4.p1}{' '}
              <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-dc1-amber">{t.s4.code}</code>
              {' '}{t.s4.p2}
            </p>
            <CodeBlock code={SUBMIT_CODE} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Response</p>
            <CodeBlock code={SUBMIT_RESPONSE} />
            <div className="mt-3 rounded-lg border border-dc1-amber/20 bg-dc1-amber/5 px-4 py-3 text-xs text-dc1-amber">
              {t.s4.note}
            </div>
          </StepCard>

          {/* Step 5: Monitor */}
          <StepCard number={5} time={t.stepTimes[4]} title={t.stepTitles[4]} titleAr={copy.ar.stepTitles[4]} isRTL={isRTL}>
            <p className={`text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {t.s5.p1}{' '}
              <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-dc1-amber">{t.s5.code}</code>
              {' '}{t.s5.p2}{' '}
              <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-emerald-400">{t.s5.code2}</code>
              {t.s5.p3}
            </p>
            <CodeBlock code={POLL_CODE} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Response</p>
            <CodeBlock code={POLL_RESPONSE} />
            <div className="mt-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3 text-xs text-dc1-text-muted">
              <span className="font-semibold text-dc1-text-secondary">{t.s5.statuses}</span>{' '}
              <code className="text-dc1-text-secondary">{t.s5.statusFlow}</code>
              <br />
              <span className="mt-1 block">
                {t.s5.logsNote}{' '}
                <code className="rounded bg-dc1-surface-l3 px-1 py-0.5 text-dc1-amber">GET /api/jobs/:id/logs</code>
              </span>
            </div>
          </StepCard>
        </div>

        <div className="mt-8 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
          <h2 className={`text-xl font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {t.sdkHeading}
          </h2>
          <p className={`mt-2 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>{t.sdkSub}</p>

          <div className={`mt-5 flex flex-wrap gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {(Object.keys(t.sdkTabs) as SdkKey[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSdk(tab)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  activeSdk === tab
                    ? 'border-dc1-amber/40 bg-dc1-amber/15 text-dc1-amber'
                    : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
                }`}
              >
                {t.sdkTabs[tab]}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-dc1-border bg-dc1-surface-l2 p-4 sm:p-5">
            <h3 className={`text-base font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
              {activeCard.title}
            </h3>
            <p className={`mt-1 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
              {activeCard.subtitle}
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">
              {activeCard.installLabel}
            </p>
            <CodeBlock code={activeCard.installCode} />

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">
              {activeCard.runLabel}
            </p>
            <CodeBlock code={activeCard.runCode} />

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">
              {activeCard.verifyLabel}
            </p>
            <CodeBlock code={activeCard.verifyCode} />

            <p className={`mt-3 rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-xs text-dc1-text-muted ${isRTL ? 'text-right' : ''}`}>
              {activeCard.verifyHint}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
          <h2 className={`text-lg font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {t.verifyHeading}
          </h2>
          <ul className="mt-3 space-y-2">
            {t.verifyItems.map((item) => (
              <li key={item} className={`rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-sm text-dc1-text-secondary ${isRTL ? 'text-right' : ''}`}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What's next */}
        <div className="mt-8 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
          <h2 className={`text-lg font-semibold text-dc1-text-primary ${isRTL ? 'text-right' : ''}`}>
            {t.next}
          </h2>
          <div className={`mt-4 flex flex-wrap gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {t.nextItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-sm text-dc1-text-secondary transition hover:border-dc1-amber/30 hover:text-dc1-amber"
              >
                {item.label}
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={isRTL ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function QuickstartPage() {
  return (
    <Suspense fallback={<QuickstartLoadingState />}>
      <QuickstartPageInner />
    </Suspense>
  )
}
