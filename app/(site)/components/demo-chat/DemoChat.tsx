'use client'

// DemoChat — the hero's "proof you can touch" box. One prompt, one real
// completion streamed back from a verified Saudi GPU via /api/public/demo/chat.
// Extracted from the old home god-component so the home page can server-render
// its headline while only this interactive island hydrates.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../../lib/i18n'

type DemoState = 'idle' | 'busy' | 'done' | 'down'

// Curated starters a 7B-class model answers WELL — steers first-time users
// away from live-data questions (weather, news) the demo cannot know.
const STARTERS: ReadonlyArray<{ en: string; ar: string }> = [
  { en: 'Explain per-second GPU billing in one sentence', ar: 'اشرح الفوترة بالثانية في جملة واحدة' },
  { en: 'Write one line of poetry about Riyadh', ar: 'اكتب بيت شعر عن الرياض' },
  { en: 'What is WireGuard, briefly?', ar: 'ما هو WireGuard باختصار؟' },
]

export function DemoChat() {
  const { lang } = useV2()
  const [demoQ, setDemoQ] = useState('')
  const [demoTyped, setDemoTyped] = useState('')
  const [demoMeta, setDemoMeta] = useState<{ model: string; providers: number; ms: number } | null>(null)
  const [demoState, setDemoState] = useState<DemoState>('idle')
  const demoFull = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  const askDemo = async (qOverride?: string) => {
    const q = (qOverride ?? demoQ).trim()
    if (!q || demoState === 'busy') return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setDemoState('busy')
    setDemoTyped('')
    setDemoMeta(null)
    try {
      const t0 = performance.now()
      const res = await fetch('/api/public/demo/chat?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
        signal: ac.signal,
      })
      if (!res.ok) {
        setDemoState('down')
        return
      }
      // streaming path: tokens render the moment they arrive from the GPU
      if (res.headers.get('x-dcp-stream') === '1' && res.body) {
        const model = res.headers.get('x-demo-model') || ''
        const providers = Number(res.headers.get('x-demo-providers')) || 1
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let acc = ''
        let firstMs = 0
        demoFull.current = '' // disable the typewriter effect — this IS live
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!firstMs) {
            firstMs = Math.round(performance.now() - t0)
            setDemoState('done')
            setDemoMeta({ model, providers, ms: firstMs })
          }
          acc += dec.decode(value, { stream: true })
          setDemoTyped(acc)
        }
        if (!acc.trim()) setDemoState('down')
        return
      }
      // buffered fallback (old backend): whole answer at once + typewriter
      const d = await res.json()
      const ms = Math.round(performance.now() - t0)
      demoFull.current = String(d.content || '')
      setDemoMeta({ model: String(d.model || ''), providers: Number(d.provider_count) || 1, ms })
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
        <button type="button" onClick={() => askDemo()} disabled={demoState === 'busy'}>
          {demoState === 'busy' ? (
            <Bi en="GPU thinking…" ar="المعالج يفكر…" />
          ) : (
            <Bi en="Ask →" ar="اسأل ←" />
          )}
        </button>
      </div>
      {demoState === 'idle' && (
        <div className="demo-starters">
          {STARTERS.map((s) => {
            const t = lang === 'ar' ? s.ar : s.en
            return (
              <button
                key={s.en}
                type="button"
                onClick={() => {
                  setDemoQ(t)
                  askDemo(t)
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      )}
      {demoState === 'done' && (
        <div className="demo-out">
          <p dir="auto">{demoTyped}</p>
          {demoMeta && (
            <span className="demo-chain" dir="ltr">
              {demoMeta.model} · 🇸🇦 verified GPU · probe ✓ → inference ✓ → first token in{' '}
              {(demoMeta.ms / 1000).toFixed(1)}s from your network
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