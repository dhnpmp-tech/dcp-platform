'use client'

// BootEgg — type "gpu" anywhere on the page (outside an input) and a
// terminal overlay boots a simulated pod: the same verification gates,
// timings and refund the real platform enforces, compressed to four
// seconds of typewriter. A hidden handshake for the terminal crowd.
// ESC or click closes. Honest footer: it is a simulation.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import './boot-egg.css'

const LINES: ReadonlyArray<{ t: string; cls: string }> = [
  { t: '$ dcp pod create --gpu rtx-3090 --minutes 1', cls: 'cmd' },
  { t: '→ verifying provider … endpoint_reachable ✓', cls: 'ok' },
  { t: '→ real inference probe … verified_online ✓', cls: 'ok' },
  { t: '→ wireguard tunnel … handshake 14 ms ✓', cls: 'ok' },
  { t: '→ jupyter … ready in 0:47', cls: 'ok' },
  { t: '201 { "access_url": "https://…/jupyter", "billing": "per-second" }', cls: 'res' },
  { t: '$ dcp pod stop', cls: 'cmd' },
  { t: '→ stopped · 0.0194 SAR refunded — unused seconds returned', cls: 'refund' },
]

const TRIGGER = 'gpu'

export function BootEgg() {
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState(0) // total chars revealed
  const bufRef = useRef('')
  const timerRef = useRef(0)

  const totalChars = LINES.reduce((n, l) => n + l.t.length, 0)

  // trigger: collect plain keystrokes outside form fields
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key.length !== 1) return
      bufRef.current = (bufRef.current + e.key.toLowerCase()).slice(-TRIGGER.length)
      if (bufRef.current === TRIGGER && !open) {
        bufRef.current = ''
        setProgress(0)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // typewriter: reveal characters across all lines
  useEffect(() => {
    if (!open) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setProgress(totalChars)
      return
    }
    let done = 0
    const tick = () => {
      done += 3
      setProgress(done)
      if (done < totalChars) {
        timerRef.current = window.setTimeout(tick, 18)
      }
    }
    timerRef.current = window.setTimeout(tick, 220)
    return () => window.clearTimeout(timerRef.current)
  }, [open, totalChars])

  const close = useCallback(() => setOpen(false), [])

  if (!open) return null

  // slice the global progress into per-line reveals
  let remaining = progress
  const rendered = LINES.map((l) => {
    const take = Math.max(0, Math.min(l.t.length, remaining))
    remaining -= take
    return { ...l, shown: l.t.slice(0, take), active: take > 0 && take < l.t.length }
  })

  return (
    <div className="boot-egg" role="dialog" aria-label="DCP terminal easter egg" onClick={close}>
      <div className="be-term" dir="ltr" onClick={(e) => e.stopPropagation()}>
        <div className="be-head">
          <span className="be-dots" aria-hidden="true">
            <i /> <i /> <i />
          </span>
          <span className="be-title">dcp — simulated boot</span>
          <button type="button" className="be-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <pre className="be-body">
          {rendered.map((l, i) =>
            l.shown ? (
              <span key={`l-${i}`} className={`be-${l.cls}`}>
                {l.shown}
                {l.active ? <i className="be-caret" /> : null}
                {'\n'}
              </span>
            ) : null,
          )}
        </pre>
        <div className="be-foot">
          <span>you found the terminal · this one is simulated</span>
          <Link href="/docs" onClick={close}>
            the real one is one curl away →
          </Link>
        </div>
      </div>
    </div>
  )
}
