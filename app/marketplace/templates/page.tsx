'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage, type Language } from '../../lib/i18n'

const API_BASE = '/api'

type CategoryKey = 'all' | 'llm' | 'embedding' | 'image' | 'training' | 'notebook'
type DeployContractState =
  | 'PUBLIC_NO_AUTH'
  | 'RENTER_READY'
  | 'SUBMITTING'
  | 'AUTH_EXPIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'NO_PROVIDER'
  | 'RATE_LIMITED'
  | 'SUCCESS_SUBMITTED'

interface DockerTemplate {
  id: string
  name: string
  description: string
  image?: string
  job_type?: string
  min_vram_gb?: number
  estimated_price_sar_per_hour?: number
  tags?: string[]
  sort_order?: number
  difficulty?: 'easy' | 'medium' | 'advanced'
  tier?: string
  icon?: string
  params?: Record<string, unknown>
  model_name?: string
  tier_hint?: {
    tier?: string
    notes?: string
  }
  deploy_defaults?: {
    duration_minutes?: number
    pricing_class?: string
    job_type?: string
    params?: Record<string, unknown>
  }
}

interface DeployInteractionState {
  template: DockerTemplate | null
  state: DeployContractState
  jobId: string | null
  httpStatus: number | null
}

const VRAM_SAVINGS_TIERS: { minVram: number; savingsPct: number }[] = [
  { minVram: 80, savingsPct: 40 },
  { minVram: 40, savingsPct: 33 },
  { minVram: 24, savingsPct: 28 },
  { minVram: 16, savingsPct: 24 },
  { minVram: 0, savingsPct: 24 },
]

const CATEGORY_EMOJI: Record<CategoryKey, string> = {
  all: '✦',
  llm: '🤖',
  embedding: '🔍',
  image: '🎨',
  training: '🎓',
  notebook: '📓',
}

const CATEGORY_LABELS: Record<Language, Record<CategoryKey, string>> = {
  en: {
    all: 'All Templates',
    llm: 'LLM / Inference',
    embedding: 'Embeddings & RAG',
    image: 'Image Generation',
    training: 'Training & Fine-tune',
    notebook: 'Notebooks & Dev',
  },
  ar: {
    all: 'كل القوالب',
    llm: 'نماذج لغوية / استدلال',
    embedding: 'تضمين و RAG',
    image: 'توليد الصور',
    training: 'تدريب وضبط دقيق',
    notebook: 'دفاتر وأدوات تطوير',
  },
}

const COPY = {
  en: {
    marketplace: 'Marketplace',
    templates: 'Templates',
    title: 'GPU Workload Templates',
    subtitle: 'Live template catalog from the backend contract. Deploy-ready paths keep your renter intent through auth.',
    available: 'templates available',
    arabicIncluded: 'Arabic-capable models included',
    instantTier: 'Instant-tier pre-warmed',
    search: 'Search templates...',
    minVram: 'Min VRAM (GB)',
    speed: 'Deployment speed',
    speedAll: '⚡ All speeds',
    speedInstant: '⚡ Instant (0-2s)',
    speedCached: '🚀 Cached (2-10s)',
    speedDemand: '⏱ On-Demand (10s+)',
    arabicOnly: 'Arabic only',
    reset: 'Reset',
    loading: 'Loading...',
    of: 'of',
    failed: 'Failed to load templates.',
    retry: 'Retry',
    noMatch: 'No templates match your filters.',
    clearFilters: 'Clear filters',
    vram: 'VRAM',
    type: 'Type',
    sarHr: 'SAR/hr',
    vastEquivalent: 'vs Vast.ai equivalent',
    estimated: '(est.)',
    cheaper: 'cheaper',
    hideParams: 'Hide',
    viewParams: 'View',
    params: 'parameters',
    deployNow: 'Deploy Now',
    dontSee: "Don't see what you need?",
    ctaDesc: 'Deploy any custom Docker container or contact us for enterprise Arabic AI deployments with PDPL compliance.',
    customDeploy: 'Custom Container Deploy',
    browseModels: 'Browse Model Catalog',
    easy: 'Easy',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    tierInstant: '⚡ Instant',
    tierCached: '🚀 Cached',
    tierDemand: 'On-Demand',
    arabicTag: 'Arabic',
  },
  ar: {
    marketplace: 'السوق',
    templates: 'القوالب',
    title: 'قوالب أحمال GPU',
    subtitle: 'كتالوج حي من عقد API الخلفي. مسارات النشر تحافظ على نية المستأجر أثناء تسجيل الدخول.',
    available: 'قالب متاح',
    arabicIncluded: 'يشمل نماذج تدعم العربية',
    instantTier: 'طبقة فورية مُسخنة مسبقاً',
    search: 'ابحث في القوالب...',
    minVram: 'الحد الأدنى للذاكرة (GB)',
    speed: 'سرعة النشر',
    speedAll: '⚡ كل السرعات',
    speedInstant: '⚡ فوري (0-2ث)',
    speedCached: '🚀 مخزن (2-10ث)',
    speedDemand: '⏱ عند الطلب (+10ث)',
    arabicOnly: 'العربية فقط',
    reset: 'إعادة ضبط',
    loading: 'جار التحميل...',
    of: 'من',
    failed: 'تعذر تحميل القوالب.',
    retry: 'إعادة المحاولة',
    noMatch: 'لا توجد قوالب مطابقة للفلاتر.',
    clearFilters: 'مسح الفلاتر',
    vram: 'الذاكرة',
    type: 'النوع',
    sarHr: 'ريال/ساعة',
    vastEquivalent: 'مقارنة بسعر Vast.ai',
    estimated: '(تقديري)',
    cheaper: 'أرخص',
    hideParams: 'إخفاء',
    viewParams: 'عرض',
    params: 'المعاملات',
    deployNow: 'انشر الآن',
    dontSee: 'لم تجد ما تحتاجه؟',
    ctaDesc: 'انشر أي حاوية Docker مخصصة أو تواصل معنا لنشر عربي مؤسسي متوافق مع PDPL.',
    customDeploy: 'نشر حاوية مخصصة',
    browseModels: 'تصفح كتالوج النماذج',
    easy: 'سهل',
    intermediate: 'متوسط',
    advanced: 'متقدم',
    tierInstant: '⚡ فوري',
    tierCached: '🚀 مخزن',
    tierDemand: 'عند الطلب',
    arabicTag: 'عربي',
  },
} as const

const DEPLOY_STATE_COPY: Record<Language, Record<DeployContractState, { title: string; body: string; tone: 'neutral' | 'warning' | 'error' | 'success' }>> = {
  en: {
    PUBLIC_NO_AUTH: {
      title: 'Sign in to deploy this template',
      body: 'Continue with renter login, then deploy immediately with this template pre-selected.',
      tone: 'neutral',
    },
    RENTER_READY: {
      title: 'Ready to submit this deployment',
      body: 'DCP will assign an available GPU provider and start billing when execution begins.',
      tone: 'neutral',
    },
    SUBMITTING: {
      title: 'Submitting deployment request',
      body: 'Hold on while we reserve capacity and create your job.',
      tone: 'neutral',
    },
    AUTH_EXPIRED: {
      title: 'Session expired',
      body: 'Your renter key is missing or inactive. Sign in again to continue.',
      tone: 'warning',
    },
    INSUFFICIENT_BALANCE: {
      title: 'Insufficient balance',
      body: 'Top up renter credits, then retry the same template deploy.',
      tone: 'error',
    },
    NO_PROVIDER: {
      title: 'No compatible provider online',
      body: 'No active GPU currently matches this template. Retry shortly.',
      tone: 'warning',
    },
    RATE_LIMITED: {
      title: 'Deploy queue is busy',
      body: 'Request throttled or temporarily unavailable. Retry in a few seconds.',
      tone: 'warning',
    },
    SUCCESS_SUBMITTED: {
      title: 'Deployment submitted',
      body: 'Your job was created. Continue to the OpenRouter 60s quickstart for the first API call path.',
      tone: 'success',
    },
  },
  ar: {
    PUBLIC_NO_AUTH: {
      title: 'سجّل الدخول لنشر هذا القالب',
      body: 'أكمل تسجيل دخول المستأجر ثم انشر فوراً مع تحديد القالب مسبقاً.',
      tone: 'neutral',
    },
    RENTER_READY: {
      title: 'جاهز لإرسال النشر',
      body: 'ستقوم DCP بتعيين مزوّد GPU متاح وتبدأ الفوترة عند بدء التنفيذ.',
      tone: 'neutral',
    },
    SUBMITTING: {
      title: 'جارٍ إرسال طلب النشر',
      body: 'انتظر قليلاً بينما نحجز السعة وننشئ المهمة.',
      tone: 'neutral',
    },
    AUTH_EXPIRED: {
      title: 'انتهت الجلسة',
      body: 'مفتاح المستأجر مفقود أو غير نشط. سجّل الدخول مجدداً للمتابعة.',
      tone: 'warning',
    },
    INSUFFICIENT_BALANCE: {
      title: 'الرصيد غير كافٍ',
      body: 'اشحن رصيد المستأجر ثم أعد محاولة نشر القالب نفسه.',
      tone: 'error',
    },
    NO_PROVIDER: {
      title: 'لا يوجد مزوّد متوافق حالياً',
      body: 'لا يوجد مزوّد GPU نشط يطابق هذا القالب الآن. أعد المحاولة بعد قليل.',
      tone: 'warning',
    },
    RATE_LIMITED: {
      title: 'طابور النشر مزدحم',
      body: 'تم تقييد الطلب أو الخدمة مزدحمة مؤقتاً. أعد المحاولة بعد ثوانٍ.',
      tone: 'warning',
    },
    SUCCESS_SUBMITTED: {
      title: 'تم إرسال النشر',
      body: 'تم إنشاء المهمة. انتقل إلى دليل OpenRouter خلال 60 ثانية لمسار أول استدعاء API.',
      tone: 'success',
    },
  },
}

function getVramSavings(vramGb: number | undefined): { savingsPct: number } {
  const vram = vramGb ?? 0
  for (const tier of VRAM_SAVINGS_TIERS) {
    if (vram >= tier.minVram) return tier
  }
  return { savingsPct: 24 }
}

function getCategoryForTemplate(t: DockerTemplate): CategoryKey {
  const tags = (t.tags ?? []).map((x) => x.toLowerCase())
  const id = t.id?.toLowerCase() ?? ''
  if (tags.includes('training') || id.includes('finetune') || id.includes('lora') || id.includes('qlora')) return 'training'
  if (tags.includes('embedding') || tags.includes('rag') || id.includes('embed') || id.includes('rerank')) return 'embedding'
  if (tags.includes('image') || id.includes('sdxl') || id.includes('stable-diffusion') || id.includes('sd')) return 'image'
  if (id.includes('jupyter') || id.includes('notebook') || id.includes('python-scientific')) return 'notebook'
  if (tags.includes('llm') || tags.includes('inference') || id.includes('llm') || id.includes('vllm') || id.includes('ollama')) return 'llm'
  return 'llm'
}

function getDifficultyBadge(difficulty: string | undefined, language: Language) {
  const copy = COPY[language]
  if (difficulty === 'advanced') return { label: copy.advanced, cls: 'bg-status-error/10 text-status-error border-status-error/20' }
  if (difficulty === 'medium') return { label: copy.intermediate, cls: 'bg-dc1-amber/10 text-dc1-amber border-dc1-amber/20' }
  return { label: copy.easy, cls: 'bg-status-success/10 text-status-success border-status-success/20' }
}

function getTierBadge(tier: string | undefined, language: Language) {
  const copy = COPY[language]
  if (tier === 'instant') return { label: copy.tierInstant, cls: 'bg-status-success/10 text-status-success border-status-success/20' }
  if (tier === 'cached') return { label: copy.tierCached, cls: 'bg-status-info/10 text-status-info border-status-info/20' }
  return { label: copy.tierDemand, cls: 'bg-dc1-surface-l3 text-dc1-text-secondary border-dc1-border' }
}

function resolveTemplateModel(template: DockerTemplate): string {
  if (typeof template.model_name === 'string' && template.model_name.trim()) return template.model_name.trim()
  if (template.params && typeof template.params.model === 'string' && template.params.model.trim()) return template.params.model.trim()
  return ''
}

function normalizeTemplate(raw: Record<string, unknown>): DockerTemplate {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? raw.model_name ?? raw.id ?? ''),
    description: String(raw.description ?? raw.model_name ?? ''),
    image: typeof raw.image === 'string' ? raw.image : undefined,
    job_type: typeof raw.job_type === 'string' ? raw.job_type : undefined,
    min_vram_gb: Number.isFinite(Number(raw.min_vram_gb)) ? Number(raw.min_vram_gb) : undefined,
    estimated_price_sar_per_hour: Number.isFinite(Number(raw.estimated_price_sar_per_hour)) ? Number(raw.estimated_price_sar_per_hour) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map((x) => String(x)) : [],
    sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : undefined,
    difficulty: ['easy', 'medium', 'advanced'].includes(String(raw.difficulty ?? ''))
      ? (String(raw.difficulty) as DockerTemplate['difficulty'])
      : undefined,
    tier: typeof raw.tier === 'string' ? raw.tier : undefined,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    params: raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)
      ? (raw.params as Record<string, unknown>)
      : undefined,
    model_name: typeof raw.model_name === 'string' ? raw.model_name : undefined,
    tier_hint: raw.tier_hint && typeof raw.tier_hint === 'object' && !Array.isArray(raw.tier_hint)
      ? (raw.tier_hint as DockerTemplate['tier_hint'])
      : undefined,
    deploy_defaults: raw.deploy_defaults && typeof raw.deploy_defaults === 'object' && !Array.isArray(raw.deploy_defaults)
      ? (raw.deploy_defaults as DockerTemplate['deploy_defaults'])
      : undefined,
  }
}

function SkeletonCard() {
  return (
    <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex justify-between">
        <div className="h-5 bg-dc1-surface-l3 rounded w-2/3" />
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-16" />
      </div>
      <div className="h-3 bg-dc1-surface-l3 rounded w-full" />
      <div className="h-3 bg-dc1-surface-l3 rounded w-4/5" />
      <div className="flex gap-2 mt-1">
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-12" />
        <div className="h-5 bg-dc1-surface-l3 rounded-full w-16" />
      </div>
      <div className="h-10 bg-dc1-surface-l3 rounded-lg mt-2" />
      <div className="h-9 bg-dc1-surface-l3 rounded-md" />
    </div>
  )
}

function TemplateCard({
  template,
  language,
  onDeploy,
}: {
  template: DockerTemplate
  language: Language
  onDeploy: (template: DockerTemplate) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const copy = COPY[language]
  const difficulty = getDifficultyBadge(template.difficulty, language)
  const tierBadge = getTierBadge(template.tier ?? template.tier_hint?.tier, language)
  const hasArabic = (template.tags ?? []).some((t) => t.toLowerCase().includes('arabic')) || template.id.toLowerCase().includes('arabic')
  const priceHr = template.estimated_price_sar_per_hour ?? null
  const { savingsPct } = getVramSavings(template.min_vram_gb)
  const vastEquivPrice = priceHr !== null ? priceHr / (1 - savingsPct / 100) : null

  return (
    <article className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 hover:border-dc1-amber/30 hover:shadow-amber transition-all duration-200 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {template.icon && <span className="text-xl shrink-0">{template.icon}</span>}
          <h3 className="text-base font-bold text-dc1-text-primary leading-tight group-hover:text-dc1-amber transition-colors truncate">
            {template.name}
          </h3>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${tierBadge.cls}`}>
          {tierBadge.label}
        </span>
      </div>

      <p className="text-sm text-dc1-text-secondary leading-relaxed line-clamp-2">{template.description}</p>

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${difficulty.cls}`}>
          {difficulty.label}
        </span>
        {hasArabic && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-dc1-amber/10 text-dc1-amber border-dc1-amber/20">
            🌙 {copy.arabicTag}
          </span>
        )}
        {(template.tags ?? []).slice(0, 3).map((tag) => (
          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-dc1-surface-l3 text-dc1-text-muted border border-dc1-border">
            {tag}
          </span>
        ))}
      </div>

      <div className="bg-dc1-surface-l1 rounded-lg px-3 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs">
          {template.min_vram_gb && (
            <div>
              <span className="text-dc1-text-muted">{copy.vram}</span>
              <span className="ml-1 font-semibold text-dc1-text-primary">{template.min_vram_gb} GB</span>
            </div>
          )}
          {(template.job_type || template.deploy_defaults?.job_type) && (
            <div>
              <span className="text-dc1-text-muted">{copy.type}</span>
              <span className="ml-1 font-mono text-[10px] text-dc1-text-secondary">{template.job_type ?? template.deploy_defaults?.job_type}</span>
            </div>
          )}
        </div>
        {priceHr !== null && (
          <div className="text-right">
            <p className="text-lg font-extrabold text-dc1-amber leading-none">
              {priceHr.toFixed(2)}
              <span className="text-xs font-normal text-dc1-text-secondary ml-1">{copy.sarHr}</span>
            </p>
          </div>
        )}
      </div>

      {priceHr !== null && vastEquivPrice !== null && (
        <div className="rounded-lg border border-status-success/20 bg-status-success/5 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] text-dc1-text-muted uppercase tracking-wide mb-0.5">{copy.vastEquivalent}</p>
              <p className="text-xs text-dc1-text-secondary">
                <span className="line-through">{vastEquivPrice.toFixed(2)} {copy.sarHr}</span>
                <span className="ml-1 text-dc1-text-muted text-[10px]">{copy.estimated}</span>
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-status-success/10 border border-status-success/30 text-status-success text-xs font-bold">
              ↓ {savingsPct}% {copy.cheaper}
            </span>
          </div>
        </div>
      )}

      {template.params && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-dc1-text-muted hover:text-dc1-text-primary transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {expanded ? copy.hideParams : copy.viewParams} {copy.params}
        </button>
      )}
      {expanded && template.params && (
        <pre className="text-[10px] font-mono text-dc1-text-secondary bg-dc1-surface-l1 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
          {JSON.stringify(template.params, null, 2)}
        </pre>
      )}

      <button
        onClick={() => onDeploy(template)}
        className="btn btn-primary w-full text-center text-sm mt-auto"
      >
        {copy.deployNow}
      </button>
    </article>
  )
}

function DeployContractModal({
  language,
  flow,
  onClose,
  onPrimaryAction,
  onSecondaryAction,
}: {
  language: Language
  flow: DeployInteractionState
  onClose: () => void
  onPrimaryAction: () => void
  onSecondaryAction: () => void
}) {
  if (!flow.template) return null
  const stateCopy = DEPLOY_STATE_COPY[language][flow.state]
  const isLoading = flow.state === 'SUBMITTING'
  const toneClass =
    stateCopy.tone === 'success'
      ? 'border-status-success/30 bg-status-success/10 text-status-success'
      : stateCopy.tone === 'error'
      ? 'border-status-error/30 bg-status-error/10 text-status-error'
      : stateCopy.tone === 'warning'
      ? 'border-dc1-amber/30 bg-dc1-amber/10 text-dc1-amber'
      : 'border-dc1-border bg-dc1-surface-l1 text-dc1-text-primary'

  const primaryLabel =
    flow.state === 'PUBLIC_NO_AUTH' || flow.state === 'AUTH_EXPIRED'
      ? (language === 'ar' ? 'تسجيل الدخول' : 'Sign In')
      : flow.state === 'SUCCESS_SUBMITTED'
      ? (language === 'ar' ? 'دليل OpenRouter (60 ثانية)' : 'OpenRouter 60s Quickstart')
      : flow.state === 'INSUFFICIENT_BALANCE'
      ? (language === 'ar' ? 'إضافة رصيد' : 'Add Credits')
      : flow.state === 'NO_PROVIDER' || flow.state === 'RATE_LIMITED'
      ? (language === 'ar' ? 'إعادة المحاولة' : 'Retry Deploy')
      : (language === 'ar' ? 'نشر الآن' : 'Deploy Now')

  const secondaryLabel =
    flow.state === 'SUCCESS_SUBMITTED'
      ? (language === 'ar' ? 'عرض حالة المهمة' : 'View Job Status')
      : (language === 'ar' ? 'إغلاق' : 'Close')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-dc1-text-muted">{flow.template.name}</p>
            <h2 className="text-lg font-bold text-dc1-text-primary mt-1">{stateCopy.title}</h2>
          </div>
          <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`rounded-lg border px-4 py-3 text-sm ${toneClass}`}>
          <p>{stateCopy.body}</p>
          {flow.httpStatus ? (
            <p className="mt-2 text-xs opacity-80">{language === 'ar' ? 'رمز الاستجابة' : 'HTTP status'}: {flow.httpStatus}</p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button onClick={onSecondaryAction} className="btn btn-secondary min-h-[44px] px-4">
            {secondaryLabel}
          </button>
          <button onClick={onPrimaryAction} disabled={isLoading} className="btn btn-primary min-h-[44px] px-5 flex items-center justify-center gap-2">
            {isLoading ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : null}
            {isLoading ? (language === 'ar' ? 'جارٍ الإرسال…' : 'Submitting...') : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MarketplaceTemplatesPage() {
  const router = useRouter()
  const { language, dir } = useLanguage()
  const copy = COPY[language]

  const [templates, setTemplates] = useState<DockerTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [search, setSearch] = useState('')
  const [filterVram, setFilterVram] = useState('')
  const [filterArabic, setFilterArabic] = useState(false)
  const [filterTier, setFilterTier] = useState<'all' | 'instant' | 'cached' | 'on-demand'>('all')
  const [deployFlow, setDeployFlow] = useState<DeployInteractionState>({
    template: null,
    state: 'RENTER_READY',
    jobId: null,
    httpStatus: null,
  })

  const categories = useMemo(
    () => (['all', 'llm', 'embedding', 'image', 'training', 'notebook'] as CategoryKey[]).map((key) => ({
      key,
      emoji: CATEGORY_EMOJI[key],
      label: CATEGORY_LABELS[language][key],
    })),
    [language]
  )

  const trackTemplateEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('dc1_analytics', {
        detail: {
          event,
          source_page: 'public_marketplace_templates',
          role_intent: 'renter',
          surface: 'template_catalog',
          locale: language,
          ...payload,
        },
      })
    )
  }, [language])

  useEffect(() => {
    async function loadTemplates() {
      setLoading(true)
      setError(false)
      try {
        const [catalogRes, templatesRes] = await Promise.all([
          fetch(`${API_BASE}/templates/catalog`),
          fetch(`${API_BASE}/templates`),
        ])

        const catalogJson = catalogRes.ok ? await catalogRes.json() : null
        const templatesJson = templatesRes.ok ? await templatesRes.json() : null

        const catalogList = Array.isArray(catalogJson?.templates)
          ? (catalogJson.templates as Record<string, unknown>[]).map(normalizeTemplate)
          : []
        const baseList = Array.isArray(templatesJson?.templates)
          ? (templatesJson.templates as Record<string, unknown>[]).map(normalizeTemplate)
          : []

        let merged: DockerTemplate[] = []
        if (catalogList.length > 0) {
          const baseMap = new Map(baseList.map((template) => [template.id, template]))
          merged = catalogList.map((template) => {
            const base = baseMap.get(template.id)
            return {
              ...template,
              name: base?.name || template.name,
              description: base?.description || template.description || template.model_name || '',
              tags: base?.tags ?? template.tags ?? [],
              icon: base?.icon || template.icon,
              difficulty: base?.difficulty || template.difficulty,
              tier: base?.tier || template.tier || template.tier_hint?.tier,
              estimated_price_sar_per_hour: base?.estimated_price_sar_per_hour,
              params: base?.params || template.deploy_defaults?.params || template.params,
              job_type: base?.job_type || template.deploy_defaults?.job_type || template.job_type,
              min_vram_gb: base?.min_vram_gb ?? template.min_vram_gb,
            }
          })
        } else {
          merged = baseList
        }

        if (merged.length === 0) {
          throw new Error('No template data available')
        }

        setTemplates(merged)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    loadTemplates()
  }, [])

  useEffect(() => {
    if (loading || templates.length === 0) return
    trackTemplateEvent('template_catalog_viewed', {
      contract: 'dcp_483_template_first_deploy_v1',
      funnel_step: 'discover',
      total_templates: templates.length,
      arabic_templates: templates.filter((template) => (template.tags ?? []).some((tag) => tag.toLowerCase().includes('arabic'))).length,
    })
  }, [loading, templates, trackTemplateEvent])

  const filtered = useMemo(() => {
    return templates.filter((template) => {
      if (activeCategory !== 'all' && getCategoryForTemplate(template) !== activeCategory) return false
      if (filterArabic && !(template.tags ?? []).some((tag) => tag.toLowerCase().includes('arabic'))) return false
      if (filterVram !== '') {
        const minVram = parseInt(filterVram, 10)
        if (!Number.isNaN(minVram) && (template.min_vram_gb ?? 0) < minVram) return false
      }
      if (filterTier !== 'all') {
        const tier = (template.tier ?? template.tier_hint?.tier ?? 'on-demand').toLowerCase()
        if (filterTier === 'instant' && tier !== 'instant') return false
        if (filterTier === 'cached' && tier !== 'cached') return false
        if (filterTier === 'on-demand' && tier !== 'on-demand' && tier !== '' && tier !== 'standard') return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = `${template.name} ${template.description} ${(template.tags ?? []).join(' ')} ${resolveTemplateModel(template)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [templates, activeCategory, filterVram, filterArabic, filterTier, search])

  const getRenterApiKey = useCallback(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('dc1_renter_key') || window.localStorage.getItem('dc1_api_key') || ''
  }, [])

  const openDeployState = useCallback((template: DockerTemplate) => {
    const hasKey = Boolean(getRenterApiKey())
    const state: DeployContractState = hasKey ? 'RENTER_READY' : 'PUBLIC_NO_AUTH'
    setDeployFlow({
      template,
      state,
      jobId: null,
      httpStatus: null,
    })
    trackTemplateEvent('template_select_clicked', {
      contract: 'dcp_483_template_first_deploy_v1',
      funnel_step: 'select',
      template_id: template.id,
      cta_state: state,
      has_model_intent: Boolean(resolveTemplateModel(template)),
    })
  }, [getRenterApiKey, trackTemplateEvent])

  const handleDeployClick = useCallback((template: DockerTemplate) => {
    openDeployState(template)
  }, [openDeployState])

  const submitTemplateDeploy = useCallback(async () => {
    const template = deployFlow.template
    if (!template) return

    const apiKey = getRenterApiKey()
    if (!apiKey) {
      setDeployFlow((current) => ({ ...current, state: 'PUBLIC_NO_AUTH', httpStatus: null }))
      return
    }

    setDeployFlow((current) => ({ ...current, state: 'SUBMITTING', jobId: null, httpStatus: null }))
    trackTemplateEvent('template_deploy_requested', {
      contract: 'dcp_483_template_first_deploy_v1',
      funnel_step: 'deploy',
      template_id: template.id,
      cta_state: 'SUBMITTING',
    })

    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(template.id)}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify({ duration_minutes: 60 }),
      })

      if (res.status === 201) {
        const data = await res.json().catch(() => ({}))
        const jobId = data?.jobId || data?.job_id || data?.id || null
        setDeployFlow((current) => ({
          ...current,
          state: 'SUCCESS_SUBMITTED',
          jobId,
          httpStatus: res.status,
        }))
        trackTemplateEvent('template_deploy_state_changed', {
          contract: 'dcp_483_template_first_deploy_v1',
          funnel_step: 'success',
          template_id: template.id,
          cta_state: 'SUCCESS_SUBMITTED',
          http_status: res.status,
          job_id: jobId,
        })
        return
      }

      let nextState: DeployContractState = 'RATE_LIMITED'
      if (res.status === 401 || res.status === 403) nextState = 'AUTH_EXPIRED'
      else if (res.status === 402) nextState = 'INSUFFICIENT_BALANCE'
      else if (res.status === 503) nextState = 'NO_PROVIDER'
      else if (res.status === 429 || res.status === 500) nextState = 'RATE_LIMITED'

      setDeployFlow((current) => ({
        ...current,
        state: nextState,
        httpStatus: res.status,
      }))
      trackTemplateEvent('template_deploy_state_changed', {
        contract: 'dcp_483_template_first_deploy_v1',
        funnel_step: 'deploy',
        template_id: template.id,
        cta_state: nextState,
        http_status: res.status,
      })
    } catch {
      setDeployFlow((current) => ({
        ...current,
        state: 'RATE_LIMITED',
        httpStatus: 500,
      }))
      trackTemplateEvent('template_deploy_state_changed', {
        contract: 'dcp_483_template_first_deploy_v1',
        funnel_step: 'deploy',
        template_id: template.id,
        cta_state: 'RATE_LIMITED',
        http_status: 500,
      })
    }
  }, [deployFlow.template, getRenterApiKey, trackTemplateEvent])

  const closeDeployFlow = useCallback(() => {
    setDeployFlow({ template: null, state: 'RENTER_READY', jobId: null, httpStatus: null })
  }, [])

  const handleDeployPrimaryAction = useCallback(() => {
    if (!deployFlow.template) return
    const template = deployFlow.template
    if (deployFlow.state === 'PUBLIC_NO_AUTH' || deployFlow.state === 'AUTH_EXPIRED') {
      const loginParams = new URLSearchParams({
        role: 'renter',
        source: 'public_marketplace_templates',
        redirect: `/marketplace/templates?source=public_marketplace_templates&template=${encodeURIComponent(template.id)}`,
      })
      trackTemplateEvent('template_deploy_auth_redirect', {
        contract: 'dcp_483_template_first_deploy_v1',
        template_id: template.id,
        cta_state: deployFlow.state,
        destination: '/login',
      })
      router.push(`/login?${loginParams.toString()}`)
      return
    }
    if (deployFlow.state === 'SUCCESS_SUBMITTED') {
      const params = new URLSearchParams({
        source: 'public_marketplace_templates',
        template: template.id,
      })
      if (deployFlow.jobId) params.set('job', deployFlow.jobId)
      trackTemplateEvent('template_deploy_success_handoff_clicked', {
        contract: 'dcp_483_template_first_deploy_v1',
        funnel_step: 'success',
        template_id: template.id,
        cta_state: 'SUCCESS_SUBMITTED',
        destination: '/docs/api/openrouter-60s-quickstart',
        job_id: deployFlow.jobId,
      })
      router.push(`/docs/api/openrouter-60s-quickstart?${params.toString()}`)
      return
    }
    if (deployFlow.state === 'INSUFFICIENT_BALANCE') {
      router.push('/renter/billing?source=public_marketplace_templates')
      return
    }
    submitTemplateDeploy()
  }, [deployFlow, router, submitTemplateDeploy, trackTemplateEvent])

  const handleDeploySecondaryAction = useCallback(() => {
    if (!deployFlow.template) return
    if (deployFlow.state === 'SUCCESS_SUBMITTED' && deployFlow.jobId) {
      router.push(`/renter/jobs/${deployFlow.jobId}?source=public_marketplace_templates`)
      return
    }
    closeDeployFlow()
  }, [closeDeployFlow, deployFlow, router])

  const handleCustomDeploy = useCallback(() => {
    const custom = templates.find((template) => template.id === 'custom-container')
    if (!custom) return
    openDeployState(custom)
  }, [templates, openDeployState])

  const resetFilters = () => {
    setSearch('')
    setFilterVram('')
    setFilterArabic(false)
    setFilterTier('all')
    setActiveCategory('all')
  }

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <Header />

      <main className="flex-1">
        <section className="border-b border-dc1-border bg-gradient-to-b from-dc1-amber/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center gap-2 mb-3">
              <Link href="/marketplace" className="text-sm text-dc1-text-muted hover:text-dc1-amber transition-colors">{copy.marketplace}</Link>
              <span className="text-dc1-text-muted">/</span>
              <span className="text-sm text-dc1-text-primary font-medium">{copy.templates}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-dc1-text-primary mb-3">{copy.title}</h1>
            <p className="text-dc1-text-secondary text-lg mb-6 max-w-2xl">{copy.subtitle}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
                <span className="text-dc1-amber font-bold">{templates.length}</span>
                <span className="text-dc1-text-secondary">{copy.available}</span>
              </div>
              <div className="flex items-center gap-2 bg-dc1-amber/10 rounded-lg px-3 py-2 border border-dc1-amber/20">
                <span className="text-dc1-amber font-bold">🌙</span>
                <span className="text-dc1-amber font-medium">{copy.arabicIncluded}</span>
              </div>
              <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
                <span className="text-status-success font-bold">⚡</span>
                <span className="text-dc1-text-secondary">{copy.instantTier}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-dc1-border bg-dc1-surface-l1/50 sticky top-0 z-10 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    activeCategory === cat.key
                      ? 'bg-dc1-amber text-white border-dc1-amber'
                      : 'bg-transparent text-dc1-text-secondary border-dc1-border hover:border-dc1-amber/40 hover:text-dc1-text-primary'
                  }`}
                >
                  <span className="me-1">{cat.emoji}</span>
                  {cat.label}
                  {cat.key !== 'all' && (
                    <span className="ms-1 opacity-60 text-xs">
                      ({templates.filter((template) => getCategoryForTemplate(template) === cat.key).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pb-3 items-center">
              <div className="relative flex-1 min-w-48">
                <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc1-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={copy.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input ps-9 w-full text-sm"
                />
              </div>
              <input
                type="number"
                min="0"
                step="4"
                placeholder={copy.minVram}
                value={filterVram}
                onChange={(e) => setFilterVram(e.target.value)}
                className="input text-sm w-36"
              />
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as typeof filterTier)}
                className="input text-sm w-40"
                aria-label={copy.speed}
              >
                <option value="all">{copy.speedAll}</option>
                <option value="instant">{copy.speedInstant}</option>
                <option value="cached">{copy.speedCached}</option>
                <option value="on-demand">{copy.speedDemand}</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-dc1-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterArabic}
                  onChange={(e) => setFilterArabic(e.target.checked)}
                  className="rounded"
                />
                🌙 {copy.arabicOnly}
              </label>
              <button
                onClick={resetFilters}
                className="text-xs text-dc1-text-muted hover:text-dc1-amber transition-colors whitespace-nowrap"
              >
                {copy.reset}
              </button>
              <span className="text-xs text-dc1-text-muted whitespace-nowrap ms-auto">
                {loading ? copy.loading : `${filtered.length} ${copy.of} ${templates.length}`}
              </span>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-dc1-text-secondary mb-2">{copy.failed}</p>
              <button onClick={() => window.location.reload()} className="btn btn-secondary btn-sm mt-2">{copy.retry}</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-dc1-text-secondary mb-1">{copy.noMatch}</p>
              <button
                onClick={resetFilters}
                className="btn btn-outline btn-sm mt-3"
              >
                {copy.clearFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  language={language}
                  onDeploy={handleDeployClick}
                />
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-dc1-border bg-dc1-surface-l1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">{copy.dontSee}</h2>
            <p className="text-dc1-text-secondary mb-6 max-w-lg mx-auto">{copy.ctaDesc}</p>
            <div className="flex justify-center gap-3 flex-wrap">
              <button onClick={handleCustomDeploy} className="btn btn-primary" disabled={templates.length === 0}>
                {copy.customDeploy}
              </button>
              <Link href="/marketplace/models" className="btn btn-secondary">
                {copy.browseModels}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {deployFlow.template ? (
        <DeployContractModal
          language={language}
          flow={deployFlow}
          onClose={closeDeployFlow}
          onPrimaryAction={handleDeployPrimaryAction}
          onSecondaryAction={handleDeploySecondaryAction}
        />
      ) : null}

      <Footer />
    </div>
  )
}
