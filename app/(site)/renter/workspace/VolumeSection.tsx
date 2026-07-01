'use client'

// ─────────────────────────────────────────────────────────────────────────
// VolumeSection — the volume usage bar OR the rent-a-volume CTA.
// Extracted from WorkspacePanel to keep the panel focused on orchestration.
// ─────────────────────────────────────────────────────────────────────────

import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { humanBytes, type VolumeOption, type WorkspaceVolume } from './workspaceApi'

const VOLUME_SIZES = [10, 20, 30]

export type VolumeFetchState = 'idle' | 'loading' | 'ready' | 'error'

interface VolumeSectionProps {
  volumeState: VolumeFetchState
  volume: WorkspaceVolume | null
  rentOptions: VolumeOption[]
  volumeError: string
  selectedSize: number
  onSelectSize: (gb: number) => void
  onRent: () => void
  renting: boolean
}

export default function VolumeSection({
  volumeState,
  volume,
  rentOptions,
  volumeError,
  selectedSize,
  onSelectSize,
  onRent,
  renting,
}: VolumeSectionProps) {
  const { lang } = useV2()

  if (volumeState === 'loading') {
    return (
      <div className="ws-skel">
        <span className="skeleton line" style={{ width: '40%' }} />
        <span className="skeleton line" style={{ width: '70%' }} />
      </div>
    )
  }

  if (volumeState === 'ready' && volume) {
    const usedPct = typeof volume.used_pct === 'number' ? volume.used_pct : 0
    const usedGb = volume.used_gb ?? 0
    const sizeGb = volume.size_gb
    const pctLabel = `${Math.min(100, usedPct)}%`
    return (
      <div className="ws-vol-row">
        <div className="ws-vol-meta">
          <span className="ws-vol-k">
            <Bi en="Volume" ar="الوحدة" />
          </span>
          <b className="ws-vol-v">
            {humanBytes(usedGb * 1073741824)} <span className="u">/ {sizeGb} GB</span>
          </b>
          {volume.price_sar_per_month != null && (
            <span className="ws-vol-price">
              {volume.price_sar_per_month.toFixed(2)} SAR/<Bi en="mo" ar="شهر" />
            </span>
          )}
        </div>
        <div
          className="ws-util-bar"
          role="progressbar"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={lang === 'ar' ? 'استخدام الوحدة' : 'Volume usage'}
        >
          <span style={{ width: pctLabel }} className={usedPct > 85 ? 'hot' : ''} />
        </div>
        <div className="ws-util-val">{pctLabel}</div>
      </div>
    )
  }

  if (volumeState === 'ready' && !volume) {
    return (
      <div className="ws-rent-cta">
        <div className="ws-rent-msg">
          <h4>
            <Bi en="Rent a persistent volume" ar="استأجر وحدة تخزين دائمة" />
          </h4>
          <p>
            <Bi
              en="Files in /workspace persist across pods on any GPU. Billed monthly in SAR."
              ar="ملفات /workspace تبقى عبر الحاويات على أي كرت. تُفوتر شهرياً بالريال."
            />
          </p>
        </div>
        <div className="ws-rent-pick">
          {VOLUME_SIZES.map((gb) => {
            const opt = rentOptions.find((o) => o.size_gb === gb)
            const price = opt ? `${opt.price_sar_per_month.toFixed(2)}` : ''
            return (
              <button
                key={gb}
                className={`ws-size-chip${selectedSize === gb ? ' on' : ''}`}
                onClick={() => onSelectSize(gb)}
                aria-pressed={selectedSize === gb}
              >
                <span className="gb">{gb} GB</span>
                {price && <span className="p">{price} SAR</span>}
              </button>
            )
          })}
          <button className="ws-rent-go" onClick={onRent} disabled={renting}>
            {renting ? <Bi en="Renting…" ar="جارٍ الاستئجار…" /> : <Bi en="Rent →" ar="استأجر ←" />}
          </button>
        </div>
      </div>
    )
  }

  if (volumeState === 'error') {
    return (
      <div className="ws-err" role="alert">
        {volumeError}
      </div>
    )
  }

  return null
}