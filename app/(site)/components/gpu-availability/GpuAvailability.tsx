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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bi } from '@/app/(site)/lib/i18n'
import { useGpuTypes, displayGpuType, type GpuTypeEntry } from '@/app/lib/useGpuTypes'
import { ROUTES } from '@/app/lib/routes'
import './gpu-availability.css'

// Where every "Rent" action lands — the renter pods launch console. Sourced
// from the central routes module so it can never drift to a stale v1 path.
// Unauthenticated visitors are forwarded by middleware to /auth (the new
// auth surface), which returns them here after sign-in.
const LAUNCH_HREF = ROUTES.renterPods

// Where the "request a GPU / ask about reserved pods" CTA lands. The support
// surface is the right renter/contact destination (NOT the provider wizard).
const REQUEST_HREF = ROUTES.support

// THIS grid is "spin up your own pod" — every cell must be a rentable GPU pod.
// The backend `gpu_types` feed includes an inference-only "Apple Silicon
// (Apple M2)" entry that is NOT pod-rentable (it serves inference, you can't
// rent a dedicated Mac pod here), so it is filtered out of this surface.
// Native NVIDIA cards — including the RTX 3090 — ARE real pods and stay.
// Matched explicitly by type string (case-insensitive) to avoid dropping any
// genuine NVIDIA pod.
function isRentablePodType(gpu: GpuTypeEntry): boolean {
  return !/apple|\bm2\b|\bm1\b|\bm3\b|\bm4\b/i.test(gpu.type)
}

// Read the live column count of an `auto-fill` CSS grid so a trailing CTA can
// span exactly the cells remaining in the final row — at ANY breakpoint and
// ANY dynamic card count. Pure CSS can't know this for auto-fill, so we read
// the resolved `grid-template-columns` track list and track it on resize.
function useGridColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const tracks = window
        .getComputedStyle(el)
        .getPropertyValue('grid-template-columns')
        .trim()
      const count = tracks && tracks !== 'none' ? tracks.split(/\s+/).length : 1
      setColumns(count > 0 ? count : 1)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return columns
}

interface GpuAvailabilityProps {
  // Visual context. 'home' tucks under an existing section (no own heading by
  // default); 'marketplace'/'directory' render the boxed editorial card.
  variant?: 'home' | 'marketplace' | 'directory'
  showHeading?: boolean
}

export default function GpuAvailability({ variant = 'marketplace', showHeading = true }: GpuAvailabilityProps) {
  const { types, errored } = useGpuTypes()
  const gridRef = useRef<HTMLUListElement>(null)
  const columns = useGridColumns(gridRef)

  // Pod grid shows rentable pods only — drop the inference-only Apple Silicon
  // entry. Filtering here (not in the shared hook) keeps the marketplace/
  // directory model-inference surfaces untouched.
  const pods = useMemo(
    () => (types ? types.filter(isRentablePodType) : types),
    [types],
  )

  // The CTA filler is one grid item. To kill the orphan-card void it spans
  // every cell left in the final row: a full empty trailing row collapses to a
  // single full-width banner, a 1-orphan row gets a wide companion panel, and
  // a perfectly-filled last row drops the CTA onto its own clean full row.
  const remainder = pods && pods.length > 0 ? pods.length % columns : 0
  const ctaSpan = remainder === 0 ? columns : columns - remainder

  return (
    <section className={`gpu-avail gpu-avail--${variant}`} aria-labelledby="gpu-avail-heading">
      {showHeading && (
        <div className="gpu-avail-head">
          <span id="gpu-avail-heading" className="gpu-avail-title">
            <Bi en="Rent one of these GPUs" ar="استأجر أحد هذه المعالجات" />
          </span>
          <span className="gpu-avail-sub">
            {pods === null
              ? <Bi en="querying…" ar="جارٍ الاستعلام…" />
              : <Bi en="spin up your own pod" ar="شغّل وحدتك الخاصة" />}
          </span>
        </div>
      )}

      {variant === 'home' && (
        <div className="gpu-avail-intro">
          <h3 className="gpu-avail-intro-title">
            <Bi en="Your own GPU. By the minute." ar="معالجك الخاص. بالدقيقة." />
          </h3>
          <p className="gpu-avail-intro-sub">
            <Bi
              en="Spin up a dedicated pod — root, Jupyter and SSH — in about two minutes. OpenAI-compatible inference, agent-ready via MCP, billed in Saudi Riyal, sovereign and in-Kingdom."
              ar="شغّل وحدة مخصصة — صلاحيات الجذر وJupyter وSSH — في نحو دقيقتين. استدلال متوافق مع OpenAI، جاهز للوكلاء عبر MCP، بفوترة بالريال السعودي، سيادي وداخل المملكة."
            />
          </p>
          <ul className="gpu-avail-chips" aria-label="Pod capabilities">
            <li className="gpu-chip"><Bi en="~2-min launch" ar="إطلاق بدقيقتين" /></li>
            <li className="gpu-chip"><Bi en="per-minute, cost-plus" ar="بالدقيقة، تكلفة زائد هامش" /></li>
            <li className="gpu-chip"><Bi en="root + Jupyter + SSH" ar="جذر + Jupyter + SSH" /></li>
            <li className="gpu-chip"><Bi en="MCP + OpenAI API" ar="MCP + واجهة OpenAI" /></li>
            <li className="gpu-chip"><Bi en="in-Kingdom" ar="داخل المملكة" /></li>
          </ul>
        </div>
      )}

      {pods === null && !errored && (
        <div className="gpu-avail-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="gpu-card gpu-card--skel" key={`skel-${i}`} />
          ))}
        </div>
      )}

      {(errored || (pods && pods.length === 0)) && (
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

      {pods && pods.length > 0 && (
        <ul className="gpu-avail-grid" ref={gridRef}>
          {pods.map((gpu) => (
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

          {/* Trailing CTA — spans the cells left in the final row so the grid
              never shows an orphan card stranded beside a void. Count-robust:
              span is derived from the live column count + card count, so it
              reads as intentional at 1, 2, 3, 4 or 6 columns and at any
              dynamic pod count. Visibly a CTA, not a GPU card. */}
          <li
            className="gpu-cta"
            style={{ gridColumn: `span ${Math.max(1, ctaSpan)}` }}
          >
            <Link className="gpu-cta-link" href={REQUEST_HREF}>
              <span className="gpu-cta-copy">
                <Bi
                  en="Don't see your card? Request a GPU, or ask about reserved & longer-term pods"
                  ar="لا ترى بطاقتك؟ اطلب معالجاً، أو اسأل عن الوحدات المحجوزة وطويلة الأمد"
                />
              </span>
              <span className="gpu-cta-arrow" aria-hidden="true">→</span>
            </Link>
          </li>
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
