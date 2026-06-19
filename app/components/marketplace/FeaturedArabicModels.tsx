'use client'

import Link from 'next/link'
import { useLanguage } from '../../lib/i18n'

const USD_TO_SAR = 3.75

interface ArabicModel {
  id: string
  nameEn: string
  nameAr: string
  category: string
  categoryAr: string
  description: string
  descriptionAr: string
  priceUsdPerMin: number
  arabicBadge: string
  arabicBadgeAr: string
  deployPath: string
}

const ARABIC_MODELS: ArabicModel[] = [
  {
    id: 'allam-7b',
    nameEn: 'ALLaM 7B',
    nameAr: 'ألام 7B',
    category: 'LLM',
    categoryAr: 'نموذج لغوي',
    description: 'SDAIA-trained Arabic-first large language model',
    descriptionAr: 'نموذج لغوي عربي متقدم من مركز الذكاء الاصطناعي',
    priceUsdPerMin: 0.18,
    arabicBadge: 'Arabic Native',
    arabicBadgeAr: 'عربي أصيل',
    deployPath: '/marketplace/models?model=allam-7b',
  },
  {
    id: 'jais-13b',
    nameEn: 'JAIS 13B',
    nameAr: 'جيس 13B',
    category: 'LLM',
    categoryAr: 'نموذج لغوي',
    description: 'G42 Arabic/English bilingual foundation model',
    descriptionAr: 'نموذج ثنائي اللغة من جي 42',
    priceUsdPerMin: 0.22,
    arabicBadge: 'Arabic Native',
    arabicBadgeAr: 'عربي أصيل',
    deployPath: '/marketplace/models?model=jais-13b',
  },
  {
    id: 'qwen25-7b',
    nameEn: 'Qwen 2.5 7B',
    nameAr: 'كيوين 2.5 7B',
    category: 'LLM',
    categoryAr: 'نموذج لغوي',
    description: 'Strong Arabic instruction-following and reasoning',
    descriptionAr: 'أداء عربي ممتاز في التعليمات والاستدلال',
    priceUsdPerMin: 0.15,
    arabicBadge: 'Arabic Excellent',
    arabicBadgeAr: 'عربي ممتاز',
    deployPath: '/marketplace/models?model=qwen25-7b',
  },
  {
    id: 'falcon-h1-7b',
    nameEn: 'Falcon H1 7B',
    nameAr: 'فالكون H1 7B',
    category: 'LLM',
    categoryAr: 'نموذج لغوي',
    description: 'TII Arabic-aware hybrid state-space model',
    descriptionAr: 'نموذج هجين من معهد الابتكار التقني',
    priceUsdPerMin: 0.16,
    arabicBadge: 'Arabic Native',
    arabicBadgeAr: 'عربي أصيل',
    deployPath: '/marketplace/models?model=falcon-h1-7b',
  },
]

function trackAnalytics(event: string, props: Record<string, unknown>) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail: { event, ...props } }))
  }
}

function ModelCard({ model, isRTL, showSar }: { model: ArabicModel; isRTL: boolean; showSar: boolean }) {
  const priceUsd = model.priceUsdPerMin
  const priceSar = (priceUsd * USD_TO_SAR).toFixed(2)

  const name = isRTL ? model.nameAr : model.nameEn
  const category = isRTL ? model.categoryAr : model.category
  const description = isRTL ? model.descriptionAr : model.description
  const badge = isRTL ? model.arabicBadgeAr : model.arabicBadge
  const deployLabel = isRTL ? 'نشر' : 'Deploy'

  return (
    <article className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 hover:border-dc1-amber/40 hover:shadow-amber transition-all duration-200 group">
      {/* Category + badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wider">{category}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium text-emerald-400">
          🌍 {badge}
        </span>
      </div>

      {/* Name */}
      <h3 className="text-base font-bold text-dc1-text-primary leading-tight">{name}</h3>

      {/* Description */}
      <p className="text-xs text-dc1-text-muted leading-relaxed">{description}</p>

      {/* Price */}
      <div className="mt-auto pt-2 border-t border-dc1-border">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {showSar ? (
            <>
              <span className="text-lg font-bold text-dc1-text-primary">{priceSar}</span>
              <span className="text-xs text-dc1-text-muted">SAR/min</span>
              <span className="text-xs text-dc1-text-muted">(${priceUsd.toFixed(2)}/min)</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-dc1-text-primary">${priceUsd.toFixed(2)}</span>
              <span className="text-xs text-dc1-text-muted">/min</span>
              <span className="text-xs text-dc1-text-muted">≈ {priceSar} SAR</span>
            </>
          )}
        </div>
      </div>

      {/* CTA */}
      <Link
        href={model.deployPath}
        onClick={() =>
          trackAnalytics('arabic_model_clicked', {
            model_id: model.id,
            source: 'featured_carousel',
            language: isRTL ? 'ar' : 'en',
          })
        }
        className="btn btn-secondary btn-sm w-full text-center mt-1"
      >
        {deployLabel}
      </Link>
    </article>
  )
}

export default function FeaturedArabicModels() {
  const { isRTL, language } = useLanguage()
  const showSar = isRTL

  const heading = isRTL ? 'النماذج العربية' : 'Arabic Models'
  const subheading = isRTL
    ? 'محسّنة للشرق الأوسط — نماذج مُدرَّبة على العربية وجاهزة للنشر'
    : 'Optimized for the Middle East — Arabic-trained models ready to deploy'
  const learnMoreLabel = isRTL ? 'تعرف على Arabic RAG ←' : 'Learn about Arabic RAG →'

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
      aria-label={heading}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Section header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-dc1-text-primary flex items-center gap-2">
            🌍 {heading}
          </h2>
          <p className="text-sm text-dc1-text-secondary mt-1">{subheading}</p>
        </div>
        <Link
          // Repointed from the dead /docs/arabic-rag path (404) to the live
          // "Working in Arabic" section anchor (#arabic) on the canonical /docs page.
          href="/docs#arabic"
          onClick={() =>
            trackAnalytics('arabic_rag_learn_more_clicked', { source: 'featured_carousel', language })
          }
          className="text-sm text-dc1-amber hover:text-dc1-amber/80 transition-colors shrink-0"
        >
          {learnMoreLabel}
        </Link>
      </div>

      {/* Model grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ARABIC_MODELS.map((model) => (
          <ModelCard key={model.id} model={model} isRTL={isRTL} showSar={showSar} />
        ))}
      </div>

      {/* SAR conversion note */}
      <p className="text-xs text-dc1-text-muted mt-4 text-center">
        {isRTL
          ? 'سعر الصرف: 1 دولار = 3.75 ريال سعودي • الأسعار تقريبية'
          : '1 USD = 3.75 SAR • Prices shown in SAR for reference'}
      </p>
    </section>
  )
}
