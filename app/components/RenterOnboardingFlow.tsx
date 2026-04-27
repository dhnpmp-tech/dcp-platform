'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '../lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'account' | 'usecase' | 'model' | 'apikey'
type UseCase = 'government' | 'legal' | 'fintech' | 'research' | 'other'

interface AccountForm {
  email: string
  password: string
}

interface ModelOption {
  id: string
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  vramGb: number
  pricePerHour: number
  useCases: UseCase[]
  badge?: string
  badgeAr?: string
}

// ── Model catalog ──────────────────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  {
    id: 'arabic-rag-complete',
    name: 'Arabic RAG Pipeline',
    nameAr: 'خط أنابيب RAG العربي',
    description: 'BGE-M3 embeddings + reranker + ALLaM 7B. PDPL-compliant enterprise stack.',
    descriptionAr: 'تضمينات BGE-M3 + إعادة الترتيب + ALLaM 7B. حزمة مؤسسية متوافقة مع PDPL.',
    vramGb: 40,
    pricePerHour: 0.89,
    useCases: ['government', 'legal', 'fintech'],
    badge: 'Recommended',
    badgeAr: 'موصى به',
  },
  {
    id: 'allam-7b',
    name: 'ALLaM 7B',
    nameAr: 'ALLaM سبعة مليار',
    description: 'Saudi Arabic LLM by SDAIA. Fine-tuned on regulatory, legal, and financial corpora.',
    descriptionAr: 'نموذج لغوي عربي سعودي من SDAIA. مُحسَّن للنصوص التنظيمية والقانونية والمالية.',
    vramGb: 16,
    pricePerHour: 0.27,
    useCases: ['government', 'legal', 'fintech', 'research'],
  },
  {
    id: 'jais-13b',
    name: 'JAIS 13B',
    nameAr: 'JAIS ثلاثة عشر مليار',
    description: 'Arabic-English bilingual LLM by G42/MBZUAI. Strong on Arabic creative and analytical tasks.',
    descriptionAr: 'نموذج لغوي عربي-إنجليزي من G42/MBZUAI. قوي في المهام الإبداعية والتحليلية العربية.',
    vramGb: 24,
    pricePerHour: 0.45,
    useCases: ['government', 'legal', 'research'],
  },
  {
    id: 'qwen25-7b',
    name: 'Qwen 2.5 7B',
    nameAr: 'كيوين 2.5 سبعة مليار',
    description: 'Strong Arabic and multilingual LLM with OpenAI-compatible API.',
    descriptionAr: 'نموذج لغوي عربي ومتعدد اللغات مع واجهة برمجية متوافقة مع OpenAI.',
    vramGb: 16,
    pricePerHour: 0.27,
    useCases: ['research', 'other', 'fintech'],
  },
  {
    id: 'llama3-8b',
    name: 'Llama 3 8B',
    nameAr: 'لاما 3 ثمانية مليار',
    description: "Meta's Llama 3 with OpenAI-compatible API. General-purpose, fast, cost-efficient.",
    descriptionAr: 'نموذج لاما 3 من Meta. استدلال سريع وفعّال للأغراض العامة.',
    vramGb: 16,
    pricePerHour: 0.27,
    useCases: ['research', 'other'],
  },
  {
    id: 'arabic-embeddings',
    name: 'Arabic Embeddings (BGE-M3)',
    nameAr: 'التضمينات العربية (BGE-M3)',
    description: 'High-throughput Arabic embedding service. Powers RAG pipelines and semantic search.',
    descriptionAr: 'خدمة تضمين عربية عالية الإنتاجية. تشغّل خطوط RAG والبحث الدلالي.',
    vramGb: 8,
    pricePerHour: 0.27,
    useCases: ['government', 'legal', 'fintech', 'research'],
  },
]

// ── Use-case config ────────────────────────────────────────────────────────────

const USE_CASES: { id: UseCase; label: string; labelAr: string; icon: string }[] = [
  { id: 'government', label: 'Government', labelAr: 'جهات حكومية', icon: '🏛️' },
  { id: 'legal', label: 'Legal', labelAr: 'قانوني', icon: '⚖️' },
  { id: 'fintech', label: 'Fintech', labelAr: 'تقنية مالية', icon: '🏦' },
  { id: 'research', label: 'Research', labelAr: 'بحث علمي', icon: '🔬' },
  { id: 'other', label: 'Other', labelAr: 'أخرى', icon: '💡' },
]

const STEP_ORDER: Step[] = ['account', 'usecase', 'model', 'apikey']
const TOTAL_STEPS = STEP_ORDER.length

// ── Helpers ────────────────────────────────────────────────────────────────────

function stepIndex(s: Step) {
  return STEP_ORDER.indexOf(s)
}

// ── StepIndicator ──────────────────────────────────────────────────────────────

function StepIndicator({ current, isRTL }: { current: Step; isRTL: boolean }) {
  const labels = {
    en: ['Account', 'Use Case', 'Model', 'API Key'],
    ar: ['الحساب', 'حالة الاستخدام', 'النموذج', 'مفتاح API'],
  }
  const lang = isRTL ? 'ar' : 'en'
  const currentIdx = stepIndex(current)

  return (
    <div className={`flex items-center gap-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
      {STEP_ORDER.map((s, idx) => (
        <div key={s} className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                idx < currentIdx
                  ? 'bg-dc1-amber text-dc1-void'
                  : idx === currentIdx
                  ? 'bg-dc1-amber/20 border-2 border-dc1-amber text-dc1-amber'
                  : 'bg-dc1-surface-l2 border border-dc1-border text-dc1-text-muted'
              }`}
            >
              {idx < currentIdx ? '✓' : idx + 1}
            </div>
            <span
              className={`text-[10px] font-medium hidden sm:block ${
                idx === currentIdx ? 'text-dc1-amber' : idx < currentIdx ? 'text-dc1-text-secondary' : 'text-dc1-text-muted'
              }`}
            >
              {labels[lang][idx]}
            </span>
          </div>
          {idx < TOTAL_STEPS - 1 && (
            <div
              className={`w-8 sm:w-16 h-px mx-1 transition-colors ${
                idx < currentIdx ? 'bg-dc1-amber' : 'bg-dc1-border'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Account creation ───────────────────────────────────────────────────

function StepAccount({
  isRTL,
  onComplete,
}: {
  isRTL: boolean
  onComplete: (token: string, email: string) => void
}) {
  const [form, setForm] = useState<AccountForm>({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = {
    title: isRTL ? 'إنشاء حسابك' : 'Create your account',
    sub: isRTL ? 'بريد إلكتروني وكلمة مرور، أو اتصل محفظتك.' : 'Email + password, or connect your wallet.',
    email: isRTL ? 'البريد الإلكتروني' : 'Email address',
    password: isRTL ? 'كلمة المرور' : 'Password',
    submit: isRTL ? 'إنشاء الحساب' : 'Create account',
    or: isRTL ? 'أو' : 'OR',
    wallet: isRTL ? 'ربط المحفظة (قريباً)' : 'Connect Wallet (coming soon)',
    login: isRTL ? 'لديك حساب بالفعل؟' : 'Already have an account?',
    loginLink: isRTL ? 'تسجيل الدخول' : 'Log in',
    errRequired: isRTL ? 'البريد الإلكتروني وكلمة المرور مطلوبان' : 'Email and password are required',
    errServer: isRTL ? 'فشل إنشاء الحساب. يرجى المحاولة مجدداً.' : 'Account creation failed. Please try again.',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.trim() || !form.password.trim()) {
      setError(t.errRequired)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error || t.errServer)
        return
      }
      const data = await res.json()
      const token: string = data.apiKey || data.token || data.key || ''
      onComplete(token, form.email.trim())
    } catch {
      setError(t.errServer)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary mb-1">{t.title}</h2>
        <p className="text-dc1-text-secondary text-sm">{t.sub}</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-semibold text-dc1-text-secondary mb-1.5" htmlFor="ob-email">
            {t.email}
          </label>
          <input
            id="ob-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm placeholder:text-dc1-text-muted focus:outline-none focus:border-dc1-amber transition-colors"
            placeholder="you@example.com"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-dc1-text-secondary mb-1.5" htmlFor="ob-pass">
            {t.password}
          </label>
          <input
            id="ob-pass"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm placeholder:text-dc1-text-muted focus:outline-none focus:border-dc1-amber transition-colors"
            placeholder="••••••••"
            dir="ltr"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:bg-dc1-amber-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (isRTL ? 'جاري الإنشاء...' : 'Creating account…') : t.submit}
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-dc1-border" />
        <span className="text-xs text-dc1-text-muted">{t.or}</span>
        <div className="flex-1 h-px bg-dc1-border" />
      </div>

      <button
        type="button"
        disabled
        className="w-full py-3 rounded-lg border border-dc1-border text-dc1-text-muted text-sm cursor-not-allowed opacity-50"
      >
        {t.wallet}
      </button>

      <p className="text-xs text-dc1-text-muted text-center">
        {t.login}{' '}
        <a href="/login" className="text-dc1-amber hover:underline">
          {t.loginLink}
        </a>
      </p>
    </form>
  )
}

// ── Step 2: Use case selection ─────────────────────────────────────────────────

function StepUseCase({
  isRTL,
  initialUseCase,
  onNext,
  onBack,
}: {
  isRTL: boolean
  initialUseCase: UseCase | null
  onNext: (uc: UseCase) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<UseCase | null>(initialUseCase)

  const t = {
    title: isRTL ? 'ما هي حالة استخدامك؟' : 'What is your use case?',
    sub: isRTL ? 'سنعرض النماذج الأنسب لك.' : 'We\'ll show the best models for your needs.',
    next: isRTL ? 'التالي' : 'Next',
    back: isRTL ? 'رجوع' : 'Back',
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary mb-1">{t.title}</h2>
        <p className="text-dc1-text-secondary text-sm">{t.sub}</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            type="button"
            onClick={() => setSelected(uc.id)}
            className={`flex items-center gap-4 p-4 rounded-xl border text-start transition-all ${
              selected === uc.id
                ? 'border-dc1-amber bg-dc1-amber/10'
                : 'border-dc1-border bg-dc1-surface-l2 hover:border-dc1-border-light'
            }`}
          >
            <span className="text-2xl w-8 shrink-0 text-center">{uc.icon}</span>
            <span className="text-sm font-semibold text-dc1-text-primary">
              {isRTL ? uc.labelAr : uc.label}
            </span>
            <div
              className={`ms-auto w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                selected === uc.id ? 'border-dc1-amber bg-dc1-amber' : 'border-dc1-border'
              }`}
            >
              {selected === uc.id && (
                <svg className="w-2.5 h-2.5 text-dc1-void" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-3 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary text-sm font-medium transition-colors"
        >
          {t.back}
        </button>
        <button
          type="button"
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className="flex-1 py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:bg-dc1-amber-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {t.next}
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Model selection ────────────────────────────────────────────────────

function StepModel({
  isRTL,
  useCase,
  onNext,
  onBack,
}: {
  isRTL: boolean
  useCase: UseCase
  onNext: (modelId: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = MODELS.filter((m) => m.useCases.includes(useCase))

  const t = {
    title: isRTL ? 'اختر نموذجاً' : 'Choose a model',
    sub: isRTL ? 'مصفّى حسب حالة استخدامك. الأسعار بالساعة.' : 'Filtered for your use case. Prices per GPU-hour.',
    perHour: isRTL ? '/ساعة' : '/hr',
    vram: isRTL ? 'VRAM' : 'VRAM',
    next: isRTL ? 'التالي' : 'Next',
    back: isRTL ? 'رجوع' : 'Back',
    allModels: isRTL ? 'استعراض جميع النماذج' : 'Browse all models',
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary mb-1">{t.title}</h2>
        <p className="text-dc1-text-secondary text-sm">{t.sub}</p>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => setSelected(model.id)}
            className={`flex items-start gap-4 p-4 rounded-xl border text-start transition-all ${
              selected === model.id
                ? 'border-dc1-amber bg-dc1-amber/10'
                : 'border-dc1-border bg-dc1-surface-l2 hover:border-dc1-border-light'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-dc1-text-primary">
                  {isRTL ? model.nameAr : model.name}
                </span>
                {model.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-dc1-amber/20 text-dc1-amber uppercase tracking-wide">
                    {isRTL ? model.badgeAr : model.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-dc1-text-muted leading-relaxed mb-2">
                {isRTL ? model.descriptionAr : model.description}
              </p>
              <div className="flex items-center gap-3 text-xs text-dc1-text-muted">
                <span className="font-semibold text-dc1-amber">
                  ${model.pricePerHour.toFixed(2)}{t.perHour}
                </span>
                <span>{model.vramGb} GB {t.vram}</span>
              </div>
            </div>
            <div
              className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                selected === model.id ? 'border-dc1-amber bg-dc1-amber' : 'border-dc1-border'
              }`}
            >
              {selected === model.id && (
                <svg className="w-2.5 h-2.5 text-dc1-void" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <a
        href="/renter/models"
        className="text-xs text-dc1-amber hover:underline text-center"
      >
        {t.allModels}
      </a>

      <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-3 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary text-sm font-medium transition-colors"
        >
          {t.back}
        </button>
        <button
          type="button"
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className="flex-1 py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:bg-dc1-amber-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {t.next}
        </button>
      </div>
    </div>
  )
}

// ── Step 4: API key + getting-started ─────────────────────────────────────────

function StepApiKey({
  isRTL,
  email,
  token,
  modelId,
  onDone,
}: {
  isRTL: boolean
  email: string
  token: string
  modelId: string
  onDone: () => void
}) {
  const [apiKey, setApiKey] = useState<string>(token)
  const [loading, setLoading] = useState(!token)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const model = MODELS.find((m) => m.id === modelId)

  useEffect(() => {
    if (token) {
      setApiKey(token)
      setLoading(false)
      return
    }
    // Fetch API key if not provided from registration
    fetch('/api/renters/me/api-key', {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((data) => {
        setApiKey(data.apiKey || data.key || '')
        setLoading(false)
      })
      .catch(() => {
        setError(isRTL ? 'تعذّر جلب مفتاح API.' : 'Could not fetch your API key.')
        setLoading(false)
      })
  }, [token, isRTL])

  function handleCopy() {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const modelName = model ? (isRTL ? model.nameAr : model.name) : modelId

  const snippet = `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey || 'YOUR_API_KEY'}",
    base_url="https://api.dcp.sa/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "مرحبا"}],
)
print(response.choices[0].message.content)`

  const t = {
    title: isRTL ? 'مفتاح API الخاص بك جاهز' : 'Your API key is ready',
    sub: isRTL
      ? `حسابك نشط. ابدأ التكامل مع ${modelName}.`
      : `Your account is active. Start integrating with ${modelName}.`,
    keyLabel: isRTL ? 'مفتاح API' : 'API Key',
    copy: isRTL ? 'نسخ' : 'Copy',
    copied: isRTL ? 'تم النسخ!' : 'Copied!',
    snippetLabel: isRTL ? 'مثال على التشغيل السريع' : 'Getting started',
    done: isRTL ? 'الانتقال إلى لوحة التحكم' : 'Go to Dashboard',
    docs: isRTL ? 'قراءة التوثيق' : 'Read the docs',
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-dc1-text-primary mb-1">{t.title}</h2>
        <p className="text-dc1-text-secondary text-sm">{t.sub}</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* API key display */}
      <div>
        <label className="block text-xs font-semibold text-dc1-text-secondary mb-1.5">
          {t.keyLabel}
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-2.5 rounded-lg bg-dc1-surface-l3 border border-dc1-border font-mono text-sm text-dc1-text-primary truncate" dir="ltr">
            {loading ? (
              <span className="text-dc1-text-muted animate-pulse">
                {isRTL ? 'جاري التحميل...' : 'Loading…'}
              </span>
            ) : (
              apiKey || <span className="text-dc1-text-muted">{isRTL ? 'غير متاح' : 'Unavailable'}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!apiKey || loading}
            className={`shrink-0 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              copied
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : 'border-dc1-border text-dc1-text-secondary hover:border-dc1-border-light hover:text-dc1-text-primary'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {copied ? t.copied : t.copy}
          </button>
        </div>
        <p className="text-xs text-dc1-text-muted mt-1.5">
          {isRTL
            ? 'احتفظ بهذا المفتاح في مكان آمن. لن يُعرض مرة أخرى.'
            : 'Store this key safely. It will not be shown again.'}
        </p>
      </div>

      {/* Code snippet */}
      <div>
        <label className="block text-xs font-semibold text-dc1-text-secondary mb-1.5">
          {t.snippetLabel}
        </label>
        <pre
          className="bg-dc1-surface-l3 border border-dc1-border rounded-lg p-4 text-xs font-mono text-dc1-text-secondary overflow-x-auto"
          dir="ltr"
        >
          {snippet}
        </pre>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:bg-dc1-amber-hover transition-colors"
        >
          {t.done}
        </button>
        <a
          href="/docs/quickstart"
          className="flex-1 py-3 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary text-sm font-medium text-center transition-colors"
        >
          {t.docs}
        </a>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RenterOnboardingFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language } = useLanguage()
  const isRTL = language === 'ar'

  // Pre-fill use case from URL param (e.g. /onboarding?vertical=government)
  const verticalParam = searchParams.get('vertical') as UseCase | null

  const [step, setStep] = useState<Step>('account')
  const [authToken, setAuthToken] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [useCase, setUseCase] = useState<UseCase | null>(verticalParam)
  const [modelId, setModelId] = useState<string | null>(null)

  function handleAccountComplete(token: string, email: string) {
    setAuthToken(token)
    setUserEmail(email)
    // Store API key for session
    try {
      localStorage.setItem('dc1_renter_key', token)
    } catch {
      // ignore storage errors
    }
    setStep('usecase')
  }

  function handleUseCaseNext(uc: UseCase) {
    setUseCase(uc)
    setStep('model')
  }

  function handleModelNext(mid: string) {
    setModelId(mid)
    setStep('apikey')
  }

  function handleDone() {
    router.push('/renter')
  }

  return (
    <div
      className="min-h-screen bg-dc1-void flex flex-col items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={language}
    >
      {/* Logo bar */}
      <div className="w-full max-w-2xl mb-8 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-dc1-text-primary hover:text-dc1-amber transition-colors">
          <span className="text-xl font-bold tracking-tight">DCP</span>
        </a>
        <StepIndicator current={step} isRTL={isRTL} />
      </div>

      {/* Panel */}
      <div className="w-full max-w-2xl bg-dc1-surface-l1 border border-dc1-border rounded-2xl p-8 shadow-2xl">
        {step === 'account' && (
          <StepAccount isRTL={isRTL} onComplete={handleAccountComplete} />
        )}
        {step === 'usecase' && (
          <StepUseCase
            isRTL={isRTL}
            initialUseCase={useCase}
            onNext={handleUseCaseNext}
            onBack={() => setStep('account')}
          />
        )}
        {step === 'model' && useCase && (
          <StepModel
            isRTL={isRTL}
            useCase={useCase}
            onNext={handleModelNext}
            onBack={() => setStep('usecase')}
          />
        )}
        {step === 'apikey' && modelId && (
          <StepApiKey
            isRTL={isRTL}
            email={userEmail}
            token={authToken}
            modelId={modelId}
            onDone={handleDone}
          />
        )}
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-dc1-text-muted text-center max-w-md">
        {isRTL
          ? 'DCP — سوق حوسبة GPU في المملكة العربية السعودية. متوافق مع نظام حماية البيانات الشخصية PDPL.'
          : 'DCP — Saudi Arabia GPU compute marketplace. PDPL-compliant.'}
      </p>
    </div>
  )
}
