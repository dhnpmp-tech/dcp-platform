'use client'

// PodMeter — the per-second billing toy. The page "rents a pod" the moment
// it mounts: a live halala counter ticks at the real native RTX 3090 rate.
// Press stop and the amount spools back to zero — refund-on-stop, felt
// instead of read. Micro-entertainment that IS the product claim.
//
// Honesty rules: the rate is the published RTX 3090 floor (2.5 SAR/hr from
// structured-data GPU_SKUS), the label says "simulated", and nothing is
// actually charged or created.

import { useEffect, useRef, useState } from 'react'
import { Bi } from '../../lib/i18n'
import './pod-meter.css'

const SAR_PER_HOUR = 2.5 // native RTX 3090 floor — keep in sync with GPU_SKUS
const SAR_PER_SECOND = SAR_PER_HOUR / 3600

type Phase = 'running' | 'refunding' | 'refunded'

function fmtClock(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function PodMeter() {
  const [phase, setPhase] = useState<Phase>('running')
  const [elapsed, setElapsed] = useState(0) // seconds
  const [shown, setShown] = useState(0) // SAR currently displayed
  const startRef = useRef<number>(0)
  const rafRef = useRef(0)
  const frozenRef = useRef(0)

  // run phase: tick the meter from mount
  useEffect(() => {
    if (phase !== 'running') return
    startRef.current = performance.now() - elapsed * 1000
    const tick = (now: number) => {
      const e = (now - startRef.current) / 1000
      setElapsed(e)
      setShown(e * SAR_PER_SECOND)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // refund phase: spool the shown amount back to zero (~900ms), then rest
  useEffect(() => {
    if (phase !== 'refunding') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setShown(0)
      setPhase('refunded')
      return
    }
    const from = frozenRef.current
    const t0 = performance.now()
    const DUR = 900
    const spool = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR)
      const eased = 1 - (1 - p) * (1 - p) * (1 - p)
      setShown(from * (1 - eased))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(spool)
      } else {
        setShown(0)
        setPhase('refunded')
      }
    }
    rafRef.current = requestAnimationFrame(spool)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  const stop = () => {
    if (phase !== 'running') return
    frozenRef.current = shown
    setPhase('refunding')
  }
  const restart = () => {
    setElapsed(0)
    setShown(0)
    setPhase('running')
  }

  return (
    <div className={`pod-meter pm-${phase}`} dir="ltr" aria-live="off">
      <span className="pm-dot" aria-hidden="true" />
      <span className="pm-label">
        {phase === 'refunded' ? (
          <Bi en="pod stopped · unused time refunded" ar="توقفت الحاوية · أُعيد الوقت غير المستخدم" />
        ) : (
          <Bi en="this page rented a pod when you arrived" ar="استأجرت هذه الصفحة حاوية لحظة وصولك" />
        )}
      </span>
      <span className="pm-clock">{fmtClock(phase === 'running' ? elapsed : 0)}</span>
      <span className="pm-cost">
        {shown.toFixed(4)} <i>SAR</i>
      </span>
      {phase === 'running' ? (
        <button type="button" className="pm-btn" onClick={stop}>
          <Bi en="Stop pod → refund" ar="أوقفها ← استرداد" />
        </button>
      ) : phase === 'refunded' ? (
        <button type="button" className="pm-btn ghost" onClick={restart}>
          <Bi en="Rent it again" ar="استأجرها من جديد" />
        </button>
      ) : (
        <span className="pm-btn ghost pm-wait">
          <Bi en="refunding…" ar="جارٍ الاسترداد…" />
        </span>
      )}
      <span className="pm-note">
        <Bi en="simulated · real pods bill exactly like this" ar="محاكاة · الحاويات الحقيقية تُفوتر هكذا تماماً" />
      </span>
    </div>
  )
}
