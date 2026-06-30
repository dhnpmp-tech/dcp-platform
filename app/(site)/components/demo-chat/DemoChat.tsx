'use client'

// DemoChat — the hero's "proof you can touch" box. One prompt, one real
// completion streamed back from a verified Saudi GPU via /api/public/demo/chat.
// Extracted from the old home god-component so the home page can server-render
// its headline while only this interactive island hydrates.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../../lib/i18n'

type DemoState = 'idle' | 'busy' | 'done' | 'down'

export function DemoChat() {
  const { lang } = useV2()
  const [demoQ, setDemoQ] = useState('')
  const [demoTyped, setDemoTyped] = useState('')
  const [demoMeta, setDemoMeta] = useState<{ model: string; providers: number } | null>(null)
  const [demoState, setDemoState] = useState<DemoState>('idle')
  const demoFull = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  const askDemo = async () => {
    const q = demoQ.trim()
    if (!q || demoState === 'busy') return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setDemoState('busy')
    setDemoTyped('')
    setDemoMeta(null)
    try {
      const res = await fetch('/api/public/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
        signal: ac.signal,
      })
      if (!res.ok) {
        setDemoState('down')
        return
      }
      const d = await res.json()
      demoFull.current = String(d.content || '')
      setDemoMeta({ model: String(d.model || ''), providers: Number(d.provider_count) || 1 })
      setDemoState('done')
    } catch {
      if (ac.signal.aborted) return // unmount or re-ask — leave state as-is
      setDemoState('down')
    }
  }

  // typewriter render — presentation only; the answer already arrived whole
  useEffect(() => {
    if (demoState !== 'done' || !demoFull.current) return
    let i = 0
    const id = window.setInterval(() => {
      i += 2
      setDemoTyped(demoFull.current.slice(0, i))
      if (i >= demoFull.current.length) window.clearInterval(id)
    }, 16)
    return () => window.clearInterval(id)
  }, [demoState])

  // abort any in-flight request on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  return (
    <div className="demo-box">
      <div className="demo-label">
        <Bi en="Proof you can touch — ask a Saudi GPU right now" ar="دليل تلمسه بيدك — اسأل معالجاً سعودياً الآن" />
      </div>
      <div className="demo-row">
        <input
          value={demoQ}
          onChange={(e) => setDemoQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') askDemo()
          }}
          maxLength={280}
          placeholder={lang === 'ar' ? 'اسأل أي شيء — بالعربية أو الإنجليزية…' : 'Ask anything — Arabic or English…'}
          aria-label={lang === 'ar' ? 'سؤال التجربة الحية' : 'Live demo question'}
        />
        <button type="button" onClick={askDemo} disabled={demoState === 'busy'}>
          {demoState === 'busy' ? (
            <Bi en="GPU thinking…" ar="المعالج يفكر…" />
          ) : (
            <Bi en="Ask →" ar="اسأل ←" />
          )}
        </button>
      </div>
      {demoState === 'done' && (
        <div className="demo-out">
          <p dir="auto">{demoTyped}</p>
          {demoMeta && (
            <span className="demo-chain" dir="ltr">
              {demoMeta.model} · 🇸🇦 verified GPU · probe ✓ → inference ✓ → served
            </span>
          )}
        </div>
      )}
      {demoState === 'down' && (
        <div className="demo-out">
          <p>
            <Bi
              en="No live capacity free for the demo right now — that's the honest state."
              ar="لا توجد سعة حية متاحة للتجربة الآن — هذه هي الحالة الصادقة."
            />{' '}
            <Link href="/status">
              <Bi en="Check /status →" ar="راجع الحالة ←" />
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}