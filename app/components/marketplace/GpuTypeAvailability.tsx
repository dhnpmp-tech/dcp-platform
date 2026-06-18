'use client'

// ─────────────────────────────────────────────────────────────────────────
// GpuTypeAvailability — GPU-type availability grid for the v1 marketplace
// directory. Tailwind dc1-* skin so it matches the legacy marketplace chrome;
// shares its data source (useGpuTypes) with the v2 GpuAvailability component.
//
// INVISIBILITY: GPU TYPE + VRAM + Available only. No machine name, no node /
// provider count, no vendor, no endpoint. On-demand and live read identically.
// ─────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { useLanguage } from '../../lib/i18n'
import { useGpuTypes, displayGpuType } from '../../lib/useGpuTypes'

// Every "Rent" action lands on the renter pods launch console.
const LAUNCH_HREF = '/v2/renter/pods'

export default function GpuTypeAvailability() {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const { types, errored } = useGpuTypes()

  return (
    <section className="border-b border-dc1-border bg-dc1-surface-l1/40" aria-labelledby="gpu-types-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
          <h2 id="gpu-types-heading" className="text-xl sm:text-2xl font-bold text-dc1-text-primary">
            {ar ? 'استأجر أحد هذه المعالجات' : 'Rent one of these GPUs'}
          </h2>
          <span className="text-xs font-mono uppercase tracking-wider text-dc1-text-muted">
            {types === null
              ? (ar ? 'جارٍ الاستعلام…' : 'querying…')
              : (ar ? 'شغّل وحدتك الخاصة' : 'spin up your own pod')}
          </span>
        </div>

        {types === null && !errored && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`skel-${i}`} className="h-28 rounded-xl border border-dc1-border bg-dc1-surface-l2 animate-pulse" />
            ))}
          </div>
        )}

        {(errored || (types && types.length === 0)) && (
          <div className="flex items-baseline justify-between gap-4 flex-wrap rounded-xl border border-dc1-border bg-dc1-surface-l2 px-5 py-4 text-sm text-dc1-text-muted">
            <span>
              {ar
                ? 'لا توجد أنواع معالجات منشورة الآن — هذه هي الحالة الحية الصادقة.'
                : 'No GPU types are published right now — that is the honest live state.'}
            </span>
            <Link href="/status" className="text-dc1-amber hover:text-dc1-amber-hover font-mono text-xs uppercase tracking-wide">
              {ar ? 'تابع الحالة الحية ←' : 'Watch live status →'}
            </Link>
          </div>
        )}

        {types && types.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {types.map((gpu) => {
              // Identical card face for every GPU type. Available cards link to
              // the launch console; out-of-stock cards stay listed but dimmed
              // and non-interactive (advertised, honestly unavailable).
              const inner = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${gpu.available ? 'bg-status-success animate-pulse' : 'bg-dc1-text-muted'}`}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-dc1-text-secondary">
                      {gpu.available
                        ? (ar ? 'متاح' : 'Available')
                        : (ar ? 'غير متاح مؤقتاً' : 'Temporarily out')}
                    </span>
                  </div>
                  <div className="mt-auto flex flex-col gap-0.5">
                    <span className="text-lg font-bold leading-tight text-dc1-text-primary group-hover:text-dc1-amber transition-colors">
                      {displayGpuType(gpu.type)}
                    </span>
                    <span className="text-xs font-mono text-dc1-text-secondary">
                      {gpu.vram_gb}<span className="text-dc1-text-muted"> GB</span>
                    </span>
                  </div>
                </>
              )
              return (
                <li key={`${gpu.type}-${gpu.vram_gb}`}>
                  {gpu.available ? (
                    <Link
                      href={LAUNCH_HREF}
                      aria-label={`${displayGpuType(gpu.type)}, ${gpu.vram_gb} gigabytes, available — rent`}
                      className="group flex h-full flex-col gap-3 rounded-xl border border-dc1-border bg-dc1-surface-l2 p-4 transition-all duration-200 hover:border-dc1-amber/40 hover:shadow-amber"
                    >
                      {inner}
                      <span className="text-[10px] font-mono uppercase tracking-widest text-dc1-text-muted group-hover:text-dc1-amber transition-colors">
                        {ar ? 'استأجر ←' : 'Rent →'}
                      </span>
                    </Link>
                  ) : (
                    <div
                      aria-label={`${displayGpuType(gpu.type)}, ${gpu.vram_gb} gigabytes, temporarily out of stock`}
                      aria-disabled="true"
                      className="flex h-full flex-col gap-3 rounded-xl border border-dc1-border bg-dc1-surface-l2 p-4 opacity-50 cursor-not-allowed"
                    >
                      {inner}
                      <span className="text-[10px] font-mono uppercase tracking-widest text-dc1-text-muted" aria-hidden="true">
                        {ar ? 'غير متاح مؤقتاً' : 'Temporarily out'}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
