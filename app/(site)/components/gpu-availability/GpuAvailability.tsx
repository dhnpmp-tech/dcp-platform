'use client'

// ─────────────────────────────────────────────────────────────────────────
// GpuAvailability — shared renter-facing GPU-type availability grid (v2 skin).
//
// Renders the GPU *types* the mesh can serve right now (live native nodes +
// on-demand types we spin up on click). Both read identically as "Available".
//
// INVISIBILITY (non-negotiable): this surface shows GPU TYPE + VRAM only.
// It NEVER renders a machine name, a node/provider count, a vendor, an
// endpoint, or any external infra detail. Data comes from useGpuTypes(), which
// reads the backend `gpu_types` field — already deduped and stripped of
// names/counts.
// ─────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { Bi } from '@/app/(site)/lib/i18n'
import { useGpuTypes, displayGpuType, type GpuTypeEntry } from '@/app/lib/useGpuTypes'
import { ROUTES } from '@/app/lib/routes'
import './gpu-availability.css'

// Where every "Rent" action lands — the renter pods launch console. Sourced
// from the central routes module so it can never drift to a stale v1 path.
// Unauthenticated visitors are forwarded by middleware to /auth (the new
// auth surface), which returns them here after sign-in.
const LAUNCH_HREF = ROUTES.renterPods

interface GpuAvailabilityProps {
  // Visual context. 'home' tucks under an existing section (no own heading by
  // default); 'marketplace'/'directory' render the boxed editorial card.
  variant?: 'home' | 'marketplace' | 'directory'
  showHeading?: boolean
}

export default function GpuAvailability({ variant = 'marketplace', showHeading = true }: GpuAvailabilityProps) {
  const { types, errored } = useGpuTypes()

  return (
    <section className={`gpu-avail gpu-avail--${variant}`} aria-labelledby="gpu-avail-heading">
      {showHeading && (
        <div className="gpu-avail-head">
          <span id="gpu-avail-heading" className="gpu-avail-title">
            <Bi en="Rent one of these GPUs" ar="استأجر أحد هذه المعالجات" />
          </span>
          <span className="gpu-avail-sub">
            {types === null
              ? <Bi en="querying…" ar="جارٍ الاستعلام…" />
              : <Bi en="spin up your own pod" ar="شغّل وحدتك الخاصة" />}
          </span>
        </div>
      )}

      {types === null && !errored && (
        <div className="gpu-avail-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="gpu-card gpu-card--skel" key={`skel-${i}`} />
          ))}
        </div>
      )}

      {(errored || (types && types.length === 0)) && (
        <div className="gpu-avail-empty">
          <span>
            <Bi
              en="No GPU types are published right now — that is the honest live state."
              ar="لا توجد أنواع معالجات منشورة الآن — هذه هي الحالة الحية الصادقة."
            />
          </span>
          <Link href="/status">
            <Bi en="Watch live status →" ar="تابع الحالة الحية ←" />
          </Link>
        </div>
      )}

      {types && types.length > 0 && (
        <ul className="gpu-avail-grid">
          {types.map((gpu) => (
            <li
              className={`gpu-card${gpu.available ? '' : ' gpu-card--off'}`}
              key={`${gpu.type}-${gpu.vram_gb}`}
            >
              {gpu.available ? (
                <Link
                  className="gpu-card-link"
                  href={LAUNCH_HREF}
                  aria-label={`${displayGpuType(gpu.type)}, ${gpu.vram_gb} gigabytes, available — rent`}
                >
                  <GpuCardInner gpu={gpu} />
                  <span className="gpu-rent">
                    <Bi en="Rent →" ar="استأجر ←" />
                  </span>
                </Link>
              ) : (
                <div
                  className="gpu-card-link"
                  aria-label={`${displayGpuType(gpu.type)}, ${gpu.vram_gb} gigabytes, temporarily out of stock`}
                  aria-disabled="true"
                >
                  <GpuCardInner gpu={gpu} />
                  <span className="gpu-rent" aria-hidden="true">
                    <Bi en="Temporarily out" ar="غير متاح مؤقتاً" />
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Shared card face — identical treatment for every GPU type (native and
// on-demand alike). Only the availability dot + state label differ.
function GpuCardInner({ gpu }: { gpu: GpuTypeEntry }) {
  return (
    <>
      <div className="gpu-card-top">
        <span className={`gpu-dot ${gpu.available ? 'is-on' : 'is-off'}`} aria-hidden="true" />
        <span className="gpu-state">
          {gpu.available
            ? <Bi en="Available" ar="متاح" />
            : <Bi en="Temporarily out" ar="غير متاح مؤقتاً" />}
        </span>
      </div>
      <div className="gpu-card-body">
        <span className="gpu-type">{displayGpuType(gpu.type)}</span>
        <span className="gpu-vram">
          {gpu.vram_gb}
          <i> GB</i>
        </span>
      </div>
    </>
  )
}
