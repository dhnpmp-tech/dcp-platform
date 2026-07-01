'use client'

// ─────────────────────────────────────────────────────────────────────────
// GpuCardSelector — price-showing GPU card selector for the pod-launch UI.
//
// Replaces the renter GPU dropdown with a card grid where each card shows the
// live per-second SAR price (the real cost-plus price from providers, NOT a
// stale published tier). The selected card is highlighted; selection is
// keyboard-navigable (arrow keys, Home/End, Enter/Space).
//
// Selection contract: the parent owns `value` (the gpu_model string POSTed as
// gpu_type) and `onChange`. This matches the existing pods/page.tsx launch
// state, so the swap is a drop-in.
//
// Price source: the `sarPerHour` field on each GpuCard is the live cost-plus
// price (providers.sar_per_hour). The per-second SAR rate is derived as
// sarPerHour / 3600. RTX 3090 ≈ 2.5 SAR/hr → ~0.000694 SAR/sec.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type KeyboardEvent } from 'react'
import { useV2, Bi } from '@/app/(site)/lib/i18n'
import './gpu-cards.css'

export interface GpuCard {
  /** The gpu_model string POSTed as gpu_type. */
  gpuModel: string
  /** VRAM in GB. */
  vramGb: number
  /** Whether at least one provider of this type is online right now. */
  available: boolean
  /** Live cost-plus price in SAR/hour (the real price source). */
  sarPerHour: number | null
  /** Optional band label for grouping (workhorse / datacenter). */
  band?: 'workhorse' | 'datacenter'
}

interface GpuCardSelectorProps {
  cards: ReadonlyArray<GpuCard>
  /** Currently selected gpu_model string, or '' for auto-pick. */
  value: string
  /** Fired with the selected gpu_model (or '' to clear/auto-pick). */
  onChange: (gpuModel: string) => void
  /** Optional label override for the fieldset. */
  legend?: string
  /** When true, include an "Auto-pick" card (value ''). Default true. */
  allowAuto?: boolean
}

const SAR_PER_HOUR_TO_PER_SEC = 1 / 3600

function formatSarPerHour(sar: number | null): string {
  if (sar == null || !Number.isFinite(sar)) return '—'
  if (sar < 1) return sar.toFixed(3)
  return sar.toFixed(2)
}

function formatSarPerSec(sarPerHour: number | null): string {
  if (sarPerHour == null || !Number.isFinite(sarPerHour)) return '—'
  const perSec = sarPerHour * SAR_PER_HOUR_TO_PER_SEC
  // Per-second rates are tiny; show 6 sig-fig in scientific-ish form, but the
  // SAR is small enough that fixed notation is more readable.
  return perSec.toFixed(6)
}

function shortModel(gpuModel: string): string {
  // "NVIDIA RTX 4090" → "RTX 4090"; keep full if no space.
  const parts = gpuModel.split(/\s+/)
  if (parts.length > 1 && parts[0].toUpperCase() === 'NVIDIA') return parts.slice(1).join(' ')
  return gpuModel
}

export default function GpuCardSelector({
  cards,
  value,
  onChange,
  legend,
  allowAuto = true,
}: GpuCardSelectorProps) {
  const { lang } = useV2()

  // Build the visible list: optional auto-pick card first, then all cards.
  // Sort by price ascending so the cheapest workhorse surfaces first (matches
  // the editorial hierarchy intent — not a flat uniform grid).
  const sorted = useMemo(() => {
    const withPrice = cards.filter((c) => c.sarPerHour != null)
    const withoutPrice = cards.filter((c) => c.sarPerHour == null)
    const priced = [...withPrice].sort((a, b) => (a.sarPerHour ?? 0) - (b.sarPerHour ?? 0))
    return [...priced, ...withoutPrice]
  }, [cards])

  // Items in tab-order for keyboard nav. Each is the gpu_model (or '' for auto).
  const itemIds = useMemo(() => {
    const ids: string[] = []
    if (allowAuto) ids.push('')
    sorted.forEach((c) => ids.push(c.gpuModel))
    return ids
  }, [allowAuto, sorted])

  function focusCard(idx: number) {
    const id = itemIds[idx]
    if (id == null) return
    onChange(id)
    const el = document.querySelector<HTMLElement>(`[data-gpu-card="${cssEscape(id)}"]`)
    el?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLFieldSetElement>) {
    const current = itemIds.indexOf(value)
    const idx = current === -1 ? 0 : current
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault()
        focusCard(Math.min(itemIds.length - 1, idx + 1))
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault()
        focusCard(Math.max(0, idx - 1))
        break
      case 'Home':
        e.preventDefault()
        focusCard(0)
        break
      case 'End':
        e.preventDefault()
        focusCard(itemIds.length - 1)
        break
      default:
        // Enter/Space handled by the radio input natively.
        break
    }
  }

  const legendText = legend ?? (lang === 'ar' ? 'اختر كرت GPU' : 'Choose a GPU')

  return (
    <fieldset className="gpu-fs" onKeyDown={onKeyDown}>
      <legend className="gpu-fs-legend">
        <Bi en={legendText} ar={legendText} />
      </legend>

      <div className="gpu-grid" role="radiogroup" aria-label={legendText}>
        {allowAuto && (
          <GpuCardView
            card={null}
            selected={value === ''}
            onSelect={() => onChange('')}
            lang={lang}
          />
        )}
        {sorted.map((c) => (
          <GpuCardView
            key={c.gpuModel}
            card={c}
            selected={value === c.gpuModel}
            onSelect={() => onChange(c.gpuModel)}
            lang={lang}
          />
        ))}
      </div>
    </fieldset>
  )
}

// ── single card (or the auto-pick card when card===null) ──────────────────────

interface GpuCardViewProps {
  card: GpuCard | null
  selected: boolean
  onSelect: () => void
  lang: 'en' | 'ar'
}

function GpuCardView({ card, selected, onSelect, lang }: GpuCardViewProps) {
  const isAuto = card === null
  const id = isAuto ? '' : card.gpuModel
  const label = isAuto
    ? (lang === 'ar' ? 'اختيار تلقائي' : 'Auto-pick')
    : shortModel(card.gpuModel)
  const vram = isAuto ? null : card.vramGb
  const sarHour = isAuto ? null : card.sarPerHour
  const sarSec = isAuto ? null : formatSarPerSec(card.sarPerHour)
  const available = isAuto ? true : card.available
  const band = isAuto ? null : card.band

  return (
    <div
      className={`gpu-card${selected ? ' sel' : ''}${available ? '' : ' off'}${isAuto ? ' auto' : ''}`}
      data-gpu-card={cssEscape(id)}
      role="radio"
      aria-checked={selected}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="gpu-card-top">
        <span className="gpu-band">{band ? bandLabel(band, lang) : (isAuto ? (lang === 'ar' ? 'افتراضي' : 'default') : '')}</span>
        {available ? (
          <span className="gpu-avail on"><span className="d" />{lang === 'ar' ? 'متاح' : 'live'}</span>
        ) : (
          <span className="gpu-avail off">{lang === 'ar' ? 'غير متاح' : 'offline'}</span>
        )}
      </div>

      <div className="gpu-name">{label}</div>
      {vram != null && <div className="gpu-vram">{vram} GB <span className="u">VRAM</span></div>}

      <div className="gpu-price-block">
        <div className="gpu-price-row">
          <span className="gpu-price-k">{lang === 'ar' ? 'السعر/ساعة' : 'SAR/hr'}</span>
          <b className="gpu-price-v">{formatSarPerHour(sarHour)}</b>
        </div>
        <div className="gpu-price-row sub">
          <span className="gpu-price-k">{lang === 'ar' ? '/ثانية' : '/sec'}</span>
          <span className="gpu-price-sec mono">{sarSec}</span>
        </div>
      </div>

      {selected && <span className="gpu-sel-mark" aria-hidden="true">✓</span>}
    </div>
  )
}

function bandLabel(band: 'workhorse' | 'datacenter', lang: 'en' | 'ar'): string {
  if (lang === 'ar') return band === 'workhorse' ? 'استهلاكي' : 'مركز بيانات'
  return band
}

// Minimal CSS.escape polyfill — avoids importing a dependency for one call.
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`)
}