'use client'

/**
 * ModelRateCard — per-model SAR/halala rate card.
 *
 * Mounted on /pricing, /marketplace, and /renter/pricing. Data lives in
 * app/lib/rate-card.ts (single source of truth). Bilingual EN/AR via
 * useLanguage().
 *
 * The rates are DRAFT — Peter tunes them in rate-card.ts; no other file
 * should hard-code per-model halala numbers.
 */

import { useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import {
  RATE_CARD,
  RATE_CARD_FX_NOTE_AR,
  RATE_CARD_FX_NOTE_EN,
  RATE_CARD_LAST_UPDATED,
  RateCardCategory,
  RateCardEntry,
  halalaPer1kToSarPer1k,
  halalaPer1kToSarPerMillion,
} from '../../lib/rate-card'

type Filter = 'all' | RateCardCategory

const FILTERS: { key: Filter; en: string; ar: string }[] = [
  { key: 'all', en: 'All', ar: 'الكل' },
  { key: 'arabic', en: 'Arabic-first', ar: 'عربي أولاً' },
  { key: 'chat', en: 'Chat', ar: 'محادثة' },
  { key: 'reasoning', en: 'Reasoning', ar: 'تفكير' },
  { key: 'code', en: 'Code', ar: 'برمجة' },
  { key: 'multimodal', en: 'Multimodal', ar: 'متعدد الوسائط' },
  { key: 'embedding', en: 'Embeddings', ar: 'تضمينات' },
]

const CATEGORY_BADGE: Record<RateCardCategory, string> = {
  arabic: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  chat: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  reasoning: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  code: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  multimodal: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  embedding: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

function CategoryBadge({ category, lang }: { category: RateCardCategory; lang: 'en' | 'ar' }) {
  const f = FILTERS.find((x) => x.key === category)
  const label = f ? (lang === 'ar' ? f.ar : f.en) : category
  return (
    <span className={`px-2 py-0.5 text-[10px] rounded-full border font-medium ${CATEGORY_BADGE[category]}`}>
      {label}
    </span>
  )
}

interface ModelRateCardProps {
  /** Compact = no filter bar, no footnote (for embedding under marketplace) */
  variant?: 'full' | 'compact'
  /** Heading override; defaults to the i18n key `rate_card.title` */
  headingOverride?: string
}

export default function ModelRateCard({ variant = 'full', headingOverride }: ModelRateCardProps) {
  const { language, t } = useLanguage()
  const lang = language === 'ar' ? 'ar' : 'en'
  const [filter, setFilter] = useState<Filter>('all')

  const rows = useMemo<RateCardEntry[]>(
    () => (filter === 'all' ? RATE_CARD : RATE_CARD.filter((r) => r.category === filter)),
    [filter],
  )

  const heading = headingOverride ?? t('rate_card.title')

  return (
    <section className="card border-dc1-amber/20" id="model-rate-card">
      {/* Heading + lead */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="section-heading">{heading}</h2>
          <span className="text-[11px] text-dc1-text-muted">
            {t('rate_card.updated')} {RATE_CARD_LAST_UPDATED}
          </span>
        </div>
        <p className="text-sm text-dc1-text-secondary mt-1">{t('rate_card.lead')}</p>
        <p className="text-[11px] text-dc1-amber/80 mt-1">{t('rate_card.draft_notice')}</p>
      </div>

      {/* Filter chips */}
      {variant === 'full' && (
        <div className="flex flex-wrap gap-1 bg-dc1-surface-l2 p-1 rounded-lg mb-4 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                filter === f.key
                  ? 'bg-dc1-amber text-dc1-void'
                  : 'text-dc1-text-secondary hover:text-dc1-text-primary'
              }`}
            >
              {lang === 'ar' ? f.ar : f.en}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dc1-border">
              <th className="text-start py-3 pe-4 text-dc1-text-muted font-medium">{t('rate_card.col_model')}</th>
              <th className="text-end py-3 px-4 text-dc1-text-muted font-medium">{t('rate_card.col_prompt')}</th>
              <th className="text-end py-3 px-4 text-dc1-amber font-semibold">{t('rate_card.col_completion')}</th>
              <th className="text-start py-3 px-4 text-dc1-text-muted font-medium hidden md:table-cell">
                {t('rate_card.col_gpu')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dc1-border">
            {rows.map((r) => {
              const isImageBilling = r.category === 'multimodal' && r.promptHalalaPer1k === 0
              return (
                <tr key={r.id} className="hover:bg-dc1-surface-l2/40 transition-colors">
                  <td className="py-3 pe-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-dc1-text-primary">
                          {lang === 'ar' ? r.nameAr : r.name}
                        </span>
                        <CategoryBadge category={r.category} lang={lang} />
                      </div>
                      <code className="text-[10px] text-dc1-text-muted">{r.repo}</code>
                      <span className="text-[11px] text-dc1-text-secondary">
                        {lang === 'ar' ? r.noteAr : r.noteEn}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-end whitespace-nowrap">
                    {isImageBilling ? (
                      <span className="text-dc1-text-muted text-xs">—</span>
                    ) : (
                      <>
                        <div className="text-dc1-text-primary font-semibold">
                          {r.promptHalalaPer1k.toFixed(0)}{' '}
                          <span className="text-xs font-normal text-dc1-text-muted">
                            {t('rate_card.halala_1k')}
                          </span>
                        </div>
                        <div className="text-[10px] text-dc1-text-muted">
                          {t('rate_card.sar_million')}{' '}
                          {halalaPer1kToSarPerMillion(r.promptHalalaPer1k)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-3 px-4 text-end whitespace-nowrap">
                    {isImageBilling ? (
                      <span className="text-dc1-amber font-semibold text-sm">
                        {t('rate_card.per_image')}
                      </span>
                    ) : (
                      <>
                        <div className="text-dc1-amber font-bold">
                          {r.completionHalalaPer1k.toFixed(0)}{' '}
                          <span className="text-xs font-normal text-dc1-text-muted">
                            {t('rate_card.halala_1k')}
                          </span>
                        </div>
                        <div className="text-[10px] text-dc1-text-muted">
                          {t('rate_card.sar_million')}{' '}
                          {halalaPer1kToSarPerMillion(r.completionHalalaPer1k)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <div className="text-dc1-text-primary font-medium text-xs">{r.recommendedGpu}</div>
                    <div className="text-[10px] text-dc1-text-muted">
                      {r.minVramGb} GB VRAM
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      {variant === 'full' && (
        <div className="mt-4 space-y-1 text-[11px] text-dc1-text-muted">
          <p>{lang === 'ar' ? RATE_CARD_FX_NOTE_AR : RATE_CARD_FX_NOTE_EN}</p>
          <p>{t('rate_card.unit_explainer')}</p>
        </div>
      )}
    </section>
  )
}

// Tiny helper for the sample calculator we expose alongside the table.
export function priceFor1MTokens(modelId: string): { promptSar: string; completionSar: string } | null {
  const m = RATE_CARD.find((r) => r.id === modelId)
  if (!m) return null
  return {
    promptSar: halalaPer1kToSarPerMillion(m.promptHalalaPer1k),
    completionSar: halalaPer1kToSarPerMillion(m.completionHalalaPer1k),
  }
}

export { halalaPer1kToSarPer1k }
