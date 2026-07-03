'use client'

// TokenDrift — "Arabic in, Arabic out", literally: moving the pointer over
// the inference visual releases Arabic letters that drift upward along the
// token streams and fade. Canvas overlay, ≤40 glyphs, compositor-cheap,
// pointer-only (no touch spam), disabled under reduced motion.

import { useEffect, useRef } from 'react'

const GLYPHS = ['ا', 'ب', 'ت', 'ن', 'م', 'و', 'ع', 'ر', 'س', 'د', 'ل', 'ك'] as const
const TEAL = 'rgba(45,212,182,'
const AMBER = 'rgba(238,122,60,'
const MAX_GLYPHS = 40

type Glyph = { x: number; y: number; vy: number; vx: number; life: number; ch: string; warm: boolean; size: number }

export function TokenDrift() {
  const hostRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const cv = cvRef.current
    const parent = host?.parentElement
    if (!host || !cv || !parent) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover)').matches) return

    const ctx = cv.getContext('2d')
    if (!ctx) return
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0
    let H = 0
    const size = () => {
      const r = parent.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      cv.width = W * DPR
      cv.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(parent)

    let glyphs: Glyph[] = []
    let raf = 0
    let running = false
    let lastSpawn = 0

    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect()
      const now = performance.now()
      if (now - lastSpawn < 70 || glyphs.length >= MAX_GLYPHS) return
      lastSpawn = now
      glyphs.push({
        x: e.clientX - r.left + (Math.random() - 0.5) * 14,
        y: e.clientY - r.top,
        vy: -(0.35 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 0.3,
        life: 1,
        ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        warm: Math.random() < 0.4,
        size: 14 + Math.random() * 10,
      })
      if (!running) {
        running = true
        raf = requestAnimationFrame(frame)
      }
    }

    const frame = () => {
      ctx.clearRect(0, 0, W, H)
      glyphs = glyphs.filter((g) => g.life > 0.02)
      for (const g of glyphs) {
        g.y += g.vy
        g.x += g.vx
        g.life *= 0.975
        ctx.font = `${g.size}px 'Noto Naskh Arabic', serif`
        ctx.fillStyle = `${g.warm ? AMBER : TEAL}${(g.life * 0.85).toFixed(3)})`
        ctx.fillText(g.ch, g.x, g.y)
      }
      if (glyphs.length > 0) {
        raf = requestAnimationFrame(frame)
      } else {
        running = false
        ctx.clearRect(0, 0, W, H)
      }
    }

    parent.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      parent.removeEventListener('pointermove', onMove)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={hostRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      <canvas ref={cvRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
