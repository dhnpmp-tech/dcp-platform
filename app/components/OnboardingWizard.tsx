'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

type UseCase =
  | 'arabic-ai'
  | 'llm-inference'
  | 'embeddings-rag'
  | 'tools-agents'

interface RecommendedTemplate {
  id: string
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  tags: string[]
  minVramGb: number
  emoji: string
}

// ── Template recommendations by use case ─────────────────────────────────────

const RECOMMENDATIONS: Record<UseCase, RecommendedTemplate[]> = {
  'arabic-ai': [
    {
      id: 'arabic-rag-complete',
      name: 'Arabic RAG Pipeline',
      nameAr: 'خط أنابيب RAG العربي',
      description: 'Complete PDPL-compliant Arabic document retrieval stack (BGE-M3 + reranker + ALLaM). Ideal for gov, legal, and finance.',
      descriptionAr: 'مجموعة استرجاع مستندات عربية كاملة ومتوافقة مع نظام حماية البيانات الشخصية (BGE-M3 + إعادة الترتيب + ALLaM). مثالية للحكومة والقانون والمال.',
      tags: ['arabic', 'rag', 'enterprise'],
      minVramGb: 40,
      emoji: '🔍',
    },
    {
      id: 'arabic-embeddings',
      name: 'Arabic Embeddings API',
      nameAr: 'واجهة برمجة التضمينات العربية',
      description: 'High-throughput Arabic & bilingual embedding service using BGE-M3. Powers search and RAG pipelines.',
      descriptionAr: 'خدمة تضمين عربية وثنائية اللغة عالية الإنتاجية باستخدام BGE-M3. تشغّل محركات البحث وخطوط RAG.',
      tags: ['arabic', 'embedding', 'rag'],
      minVramGb: 8,
      emoji: '📐',
    },
    {
      id: 'qwen25-7b',
      name: 'Qwen 2.5 7B (Arabic/Multilingual)',
      nameAr: 'كيوين 2.5 سبعة مليار (عربي/متعدد اللغات)',
      description: 'Strong Arabic and multilingual LLM with OpenAI-compatible API. Best-in-class Arabic reasoning.',
      descriptionAr: 'نموذج لغوي عربي ومتعدد اللغات قوي مع واجهة برمجية متوافقة مع OpenAI. أفضل استدلال عربي في فئته.',
      tags: ['arabic', 'llm', 'multilingual'],
      minVramGb: 16,
      emoji: '🌐',
    },
  ],
  'llm-inference': [
    {
      id: 'llama3-8b',
      name: 'Llama 3 8B Instruct',
      nameAr: 'لاما 3 ثمانية مليار',
      description: 'Meta\'s Llama 3 with OpenAI-compatible API. General-purpose, fast, cost-efficient inference.',
      descriptionAr: 'نموذج لاما 3 من Meta مع واجهة برمجية متوافقة مع OpenAI. استدلال سريع وفعّال للأغراض العامة.',
      tags: ['llm', 'inference'],
      minVramGb: 16,
      emoji: '🦙',
    },
    {
      id: 'mistral-7b',
      name: 'Mistral 7B Instruct',
      nameAr: 'ميسترال سبعة مليار',
      description: 'Highly capable reasoning and coding model with OpenAI-compatible API. Great for agents and tools.',
      descriptionAr: 'نموذج استدلال وترميز عالي الكفاءة مع واجهة برمجية متوافقة مع OpenAI. رائع للوكلاء والأدوات.',
      tags: ['llm', 'coding', 'reasoning'],
      minVramGb: 16,
      emoji: '🌀',
    },
    {
      id: 'nemotron-nano',
      name: 'Nemotron Nano 4B',
      nameAr: 'نيموترون نانو أربعة مليار',
      description: 'NVIDIA\'s efficient 4B model — lowest VRAM, highest throughput for high-volume inference tasks.',
      descriptionAr: 'نموذج NVIDIA الفعّال بأربعة مليار معامل — أقل استهلاك VRAM وأعلى إنتاجية لمهام الاستدلال عالية الحجم.',
      tags: ['llm', 'efficient'],
      minVramGb: 8,
      emoji: '⚡',
    },
  ],
  'embeddings-rag': [
    {
      id: 'arabic-embeddings',
      name: 'Arabic Embeddings (BGE-M3)',
      nameAr: 'التضمينات العربية (BGE-M3)',
      description: 'High-throughput Arabic + multilingual embedding service. Powers RAG and semantic search.',
      descriptionAr: 'خدمة تضمين عربية ومتعددة اللغات عالية الإنتاجية. تشغّل RAG والبحث الدلالي.',
      tags: ['embedding', 'rag', 'arabic'],
      minVramGb: 8,
      emoji: '📐',
    },
    {
      id: 'arabic-rag-complete',
      name: 'Arabic RAG Pipeline',
      nameAr: 'خط أنابيب RAG العربي',
      description: 'Full PDPL-compliant Arabic retrieval stack: BGE-M3 embeddings + BGE-reranker-v2 + ALLaM.',
      descriptionAr: 'مجموعة استرجاع عربية كاملة ومتوافقة مع PDPL: تضمينات BGE-M3 + BGE-reranker-v2 + ALLaM.',
      tags: ['rag', 'arabic', 'enterprise'],
      minVramGb: 40,
      emoji: '🔍',
    },
    {
      id: 'bge-reranker',
      name: 'BGE Reranker v2',
      nameAr: 'BGE-reranker-v2',
      description: 'Re-rank retrieval results for better RAG quality. OpenAI-compatible API.',
      descriptionAr: 'إعادة ترتيب نتائج الاسترجاع لتحسين جودة RAG. واجهة متوافقة مع OpenAI.',
      tags: ['reranking', 'rag'],
      minVramGb: 8,
      emoji: '📊',
    },
  ],
  'tools-agents': [
    {
      id: 'qwen25-7b',
      name: 'Qwen 2.5 7B (Tools)',
      nameAr: 'كيوين 2.5 سبعة مليار',
      description: 'Strong tool-calling + function-calling support. Multilingual including Arabic.',
      descriptionAr: 'دعم قوي لاستدعاء الأدوات والوظائف. متعدد اللغات يشمل العربية.',
      tags: ['tools', 'function-calling', 'arabic'],
      minVramGb: 16,
      emoji: '🛠️',
    },
    {
      id: 'mistral-7b',
      name: 'Mistral 7B Instruct',
      nameAr: 'ميسترال سبعة مليار',
      description: 'Strong reasoning and coding agent. OpenAI-compatible tool-calling API.',
      descriptionAr: 'نموذج استدلال وترميز قوي. واجهة استدعاء أدوات متوافقة مع OpenAI.',
      tags: ['llm', 'tools', 'reasoning'],
      minVramGb: 16,
      emoji: '🌀',
    },
    {
      id: 'llama3-8b',
      name: 'Llama 3 8B Instruct',
      nameAr: 'لاما 3 ثمانية مليار',
      description: 'General-purpose tool-using agent. Fast, cost-efficient for high-volume agent workflows.',
      descriptionAr: 'وكيل عام لاستخدام الأدوات. سريع وفعّال للأحمال عالية الحجم.',
      tags: ['llm', 'tools'],
      minVramGb: 16,
      emoji: '🦙',
    },
  ],
}

// ── Use-case options ──────────────────────────────────────────────────────────

interface UseCaseOption {
  id: UseCase
  label: string
  labelAr: string
  description: string
  descriptionAr: string
  emoji: string
}

const USE_CASES: UseCaseOption[] = [
  {
    id: 'arabic-ai',
    label: 'Arabic AI',
    labelAr: 'الذكاء الاصطناعي العربي',
    description: 'Arabic NLP, RAG pipelines, PDPL-compliant document processing',
    descriptionAr: 'معالجة اللغة العربية وخطوط RAG ومعالجة المستندات المتوافقة مع نظام حماية البيانات',
    emoji: '🌙',
  },
  {
    id: 'llm-inference',
    label: 'LLM Inference',
    labelAr: 'استدلال نماذج اللغة',
    description: 'Run language models via OpenAI-compatible API endpoints',
    descriptionAr: 'تشغيل نماذج اللغة عبر واجهات برمجية متوافقة مع OpenAI',
    emoji: '🤖',
  },
  {
    id: 'embeddings-rag',
    label: 'Embeddings & RAG',
    labelAr: 'التضمينات و RAG',
    description: 'High-throughput Arabic + multilingual embeddings, retrieval reranking, full RAG pipelines',
    descriptionAr: 'تضمينات عربية ومتعددة اللغات عالية الإنتاجية، إعادة ترتيب الاسترجاع، خطوط RAG كاملة',
    emoji: '📐',
  },
  {
    id: 'tools-agents',
    label: 'Tools & Agents',
    labelAr: 'الأدوات والوكلاء',
    description: 'Function-calling and tool-using LLMs for agent workflows',
    descriptionAr: 'نماذج لغوية تدعم استدعاء الوظائف والأدوات لسير عمل الوكلاء',
    emoji: '🛠️',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export const DCP_ONBOARDED_KEY = 'dcp_onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(DCP_ONBOARDED_KEY) === 'true'
  } catch {
    return true // fail-safe: don't block on storage errors
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(DCP_ONBOARDED_KEY, 'true')
  } catch {
    // ignore
  }
}

// ── Step components ───────────────────────────────────────────────────────────

function StepIndicator({ current, total, isRTL }: { current: number; total: number; isRTL: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current
              ? 'bg-blue-500 w-6'
              : i === current
              ? 'bg-blue-400 w-8'
              : 'bg-white/10 w-4'
          }`}
        />
      ))}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  /** When `true`, renders as a full-page layout instead of a modal overlay. */
  fullPage?: boolean
  /** Called when the wizard completes or is skipped. */
  onComplete?: () => void
}

export default function OnboardingWizard({ fullPage = false, onComplete }: OnboardingWizardProps) {
  const router = useRouter()
  const { language, setLanguage } = useLanguage()
  const isRTL = language === 'ar'

  const [step, setStep] = useState(0) // 0 = welcome/lang, 1 = use-case, 2 = templates
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null)
  const [exiting, setExiting] = useState(false)

  const totalSteps = 3

  function finish() {
    markOnboarded()
    setExiting(true)
    setTimeout(() => {
      if (onComplete) {
        onComplete()
      } else {
        router.push('/marketplace')
      }
    }, 300)
  }

  function skip() {
    markOnboarded()
    setExiting(true)
    setTimeout(() => {
      if (onComplete) {
        onComplete()
      } else {
        router.push('/marketplace')
      }
    }, 300)
  }

  function handleDeploy(templateId: string) {
    markOnboarded()
    router.push(`/marketplace/templates?deploy=${templateId}`)
  }

  const panelBase =
    'relative bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden'
  const panelClass = fullPage
    ? `${panelBase} w-full max-w-2xl mx-auto`
    : `${panelBase} w-full max-w-2xl mx-auto`

  const wrapperClass = fullPage
    ? 'min-h-screen flex items-center justify-center p-4 bg-[#060810]'
    : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm'

  return (
    <div className={`${wrapperClass} transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className={panelClass}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white/80 tracking-wide">DCP</span>
          </div>
          <div className="flex items-center gap-4">
            <StepIndicator current={step} total={totalSteps} isRTL={isRTL} />
            <button
              onClick={skip}
              className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1"
            >
              {isRTL ? 'تخطى' : 'Skip'}
            </button>
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-8 min-h-[420px]">
          {step === 0 && (
            <StepWelcome
              isRTL={isRTL}
              language={language}
              onSelectLanguage={(lang) => {
                setLanguage(lang)
              }}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <StepUseCase
              isRTL={isRTL}
              selected={selectedUseCase}
              onSelect={setSelectedUseCase}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && selectedUseCase && (
            <StepTemplates
              isRTL={isRTL}
              useCase={selectedUseCase}
              onDeploy={handleDeploy}
              onFinish={finish}
              onBack={() => setStep(1)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 0: Welcome + Language ────────────────────────────────────────────────

function StepWelcome({
  isRTL,
  language,
  onSelectLanguage,
  onNext,
}: {
  isRTL: boolean
  language: string
  onSelectLanguage: (lang: 'en' | 'ar') => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400/80 mb-2">
          {isRTL ? 'الخطوة 1 من 3' : 'Step 1 of 3'}
        </p>
        <h1 className="text-2xl font-bold text-white mb-2">
          {isRTL ? 'مرحباً بك في DCP' : 'Welcome to DCP'}
        </h1>
        <p className="text-white/50 text-sm leading-relaxed max-w-md">
          {isRTL
            ? 'الاستدلال الذكي المستضاف داخل المملكة. واجهة متوافقة مع OpenAI. فوترة لكل توكن. الإعداد أقل من دقيقتين.'
            : 'Saudi-hosted AI inference. OpenAI-compatible API. Per-token billing. Setup takes under 2 minutes.'}
        </p>
      </div>

      {/* Language selector */}
      <div>
        <p className="text-xs text-white/40 mb-3">
          {isRTL ? 'اختر لغتك المفضلة' : 'Choose your preferred language'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { code: 'en' as const, label: 'English', sub: 'English interface', emoji: '🇬🇧' },
            { code: 'ar' as const, label: 'العربية', sub: 'واجهة عربية', emoji: '🇸🇦' },
          ].map((opt) => (
            <button
              key={opt.code}
              onClick={() => onSelectLanguage(opt.code)}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${
                language === opt.code
                  ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-white">{opt.label}</div>
                <div className="text-xs text-white/40">{opt.sub}</div>
              </div>
              {language === opt.code && (
                <div className="ms-auto w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-auto w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
      >
        {isRTL ? 'التالي ←' : 'Next →'}
      </button>
    </div>
  )
}

// ── Step 1: Use-case selection ────────────────────────────────────────────────

function StepUseCase({
  isRTL,
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  isRTL: boolean
  selected: UseCase | null
  onSelect: (u: UseCase) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400/80 mb-2">
          {isRTL ? 'الخطوة 2 من 3' : 'Step 2 of 3'}
        </p>
        <h2 className="text-xl font-bold text-white mb-1">
          {isRTL ? 'ماذا ستستخدم DCP لأجل؟' : 'What will you use DCP for?'}
        </h2>
        <p className="text-white/40 text-sm">
          {isRTL ? 'اختر ما يناسبك أكثر — سنقترح قوالب لك.' : 'Pick what fits best — we\'ll suggest templates for you.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => onSelect(uc.id)}
            className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
              selected === uc.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
            }`}
          >
            <span className="text-2xl w-8 shrink-0 text-center">{uc.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">
                {isRTL ? uc.labelAr : uc.label}
              </div>
              <div className="text-xs text-white/40 truncate">
                {isRTL ? uc.descriptionAr : uc.description}
              </div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
              selected === uc.id ? 'border-blue-500 bg-blue-500' : 'border-white/20'
            }`}>
              {selected === uc.id && (
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7-1-1z" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white text-sm font-medium transition-colors"
        >
          {isRTL ? '→ رجوع' : '← Back'}
        </button>
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {isRTL ? 'عرض التوصيات ←' : 'See Recommendations →'}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Template recommendations ─────────────────────────────────────────

function StepTemplates({
  isRTL,
  useCase,
  onDeploy,
  onFinish,
  onBack,
}: {
  isRTL: boolean
  useCase: UseCase
  onDeploy: (templateId: string) => void
  onFinish: () => void
  onBack: () => void
}) {
  const templates = RECOMMENDATIONS[useCase] ?? []
  const ucMeta = USE_CASES.find((u) => u.id === useCase)!

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400/80 mb-2">
          {isRTL ? 'الخطوة 3 من 3' : 'Step 3 of 3'}
        </p>
        <h2 className="text-xl font-bold text-white mb-1">
          {isRTL ? 'القوالب الموصى بها' : 'Recommended Templates'}
        </h2>
        <p className="text-white/40 text-sm">
          {isRTL
            ? `بناءً على اختيارك: ${ucMeta.labelAr}. انقر لنشر فوري.`
            : `Based on your choice: ${ucMeta.label}. Click to deploy instantly.`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {templates.map((tpl, idx) => (
          <div
            key={tpl.id}
            className={`flex items-start gap-4 p-4 rounded-xl border border-white/8 bg-white/[0.02] transition-all duration-200 hover:border-white/15 hover:bg-white/[0.04] ${
              idx === 0 ? 'ring-1 ring-blue-500/30' : ''
            }`}
          >
            <span className="text-2xl w-8 shrink-0 text-center mt-0.5">{tpl.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-white">
                  {isRTL ? tpl.nameAr : tpl.name}
                </span>
                {idx === 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 uppercase tracking-wide">
                    {isRTL ? 'مقترح' : 'Suggested'}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/45 leading-relaxed mb-2">
                {isRTL ? tpl.descriptionAr : tpl.description}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {tpl.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/40">
                    {tag}
                  </span>
                ))}
                <span className="text-[10px] text-white/30">
                  {tpl.minVramGb} GB VRAM
                </span>
              </div>
            </div>
            <button
              onClick={() => onDeploy(tpl.id)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              {isRTL ? 'نشر' : 'Deploy'}
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white text-sm font-medium transition-colors"
        >
          {isRTL ? '→ رجوع' : '← Back'}
        </button>
        <button
          onClick={onFinish}
          className="flex-1 py-3 rounded-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white font-medium text-sm transition-colors"
        >
          {isRTL ? 'تصفح جميع القوالب' : 'Browse All Templates'}
        </button>
      </div>
    </div>
  )
}
