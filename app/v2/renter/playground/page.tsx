'use client'

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './playground.css'

// ── Mock data (illustrative, from the prototype) ──────────────
interface NavItem {
  k: string
  ic: string
  label: string
  href: string
  bd?: string
}
interface NavSection {
  sec: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    sec: 'Build',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', href: '/v2/renter/keys', bd: '3' },
      { k: 'usage', ic: '△', label: 'Usage', href: '/v2/renter/usage' },
    ],
  },
  {
    sec: 'Spend',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', href: '/v2/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', href: '/v2/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', href: '/v2/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'pg'

interface ModelOption {
  id: string
  name: string
  price?: string
}

// Fallback model list (illustrative, from the prototype). Replaced at runtime
// by the live catalog when /v1/models is reachable.
const MODELS: ModelOption[] = [
  { id: 'allam-7b', name: 'allam-7b', price: '↻' },
  { id: 'jais-13b', name: 'jais-13b' },
  { id: 'falcon-h1-7b', name: 'falcon-h1-7b' },
  { id: 'bge-m3', name: 'bge-m3' },
  { id: 'qwen-2.5-72b', name: 'qwen-2.5-72b' },
]

// Shape returned by the OpenAI-compatible /v1/models endpoint (subset).
interface CatalogModelRaw {
  id?: string
  model_id?: string
  name?: string
  display_name?: string
  provider_count?: number
}

// Default wallet balance shown before/without a live fetch (SAR).
const FALLBACK_BALANCE_SAR = 2184.52

const SAMPLE_RTL_STYLE: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'start',
  fontFamily: "'Noto Naskh Arabic', serif",
  fontSize: '13px',
  direction: 'rtl',
}
const SAMPLE_LTR_STYLE: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'start',
  fontSize: '12.5px',
}

const SAMPLE_PROMPTS: { text: string; rtl: boolean }[] = [
  { text: 'اكتب رسالة بريد لعميل', rtl: true },
  { text: 'حلّل نصاً قانونياً', rtl: true },
  { text: 'Summarize this PDF…', rtl: false },
  { text: 'Function calling demo', rtl: false },
]

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  ar: boolean
  roleLabel: string
  content: ReactNode
}

interface SessionStats {
  inputTokens: number
  outputTokens: number
  elapsedSeconds: number
  costSar: number
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-user',
    role: 'user',
    ar: true,
    roleLabel: 'You · Arabic',
    content: 'اشرح لي زكاة المال بطريقة بسيطة وأعطني مثال.',
  },
  {
    id: 'seed-assistant',
    role: 'assistant',
    ar: true,
    roleLabel: 'allam-7b · 1,482 tok · 1.2s',
    content: (
      <>
        زكاة المال فريضة شرعية تجب على من بلغ ماله النصاب وحال عليه الحول الكامل. النصاب في النقود
        يعادل قيمة 85 جراماً من الذهب أو 595 جراماً من الفضة. مقدار الزكاة 2.5% من المال المدّخر.
        <br />
        <br />
        مثال: إذا كان لديك 100,000 ريال ومرّ عليها سنة هجرية كاملة دون أن تقلّ عن النصاب، فالواجب
        2,500 ريال زكاة.
      </>
    ),
  },
]

const TEMP_STEP = 0.1
const MAX_TOKEN_STEP = 128

function isArabicText(value: string): boolean {
  return /[؀-ۿ]/.test(value)
}

export default function PlaygroundPage() {
  const { lang, toggle } = useV2()

  // ── shell mobile drawer ──
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── playground controls ──
  const [models, setModels] = useState<ModelOption[]>(MODELS)
  const [model, setModel] = useState('allam-7b')
  const [tempRaw, setTempRaw] = useState(7) // 0..20 -> /10
  const [maxTokens, setMaxTokens] = useState(1024)
  const [topPRaw, setTopPRaw] = useState(100) // 0..100 -> /100
  const [stream, setStream] = useState(true)

  // ── wallet balance (real when a renter key is present, else mock) ──
  const [balanceSar, setBalanceSar] = useState<number>(FALLBACK_BALANCE_SAR)

  const [draft, setDraft] = useState('ما الفرق بين زكاة المال وزكاة الفطر؟')
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [isSending, setIsSending] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [stats, setStats] = useState<SessionStats>({
    inputTokens: 0,
    outputTokens: 0,
    elapsedSeconds: 0,
    costSar: 0,
  })

  const temperature = (tempRaw * TEMP_STEP).toFixed(1)
  const topP = (topPRaw / 100).toFixed(1)
  const maxTokensLabel = maxTokens.toLocaleString('en-US')

  const selectedModelName = useMemo(
    () => models.find((m) => m.id === model)?.name ?? model,
    [models, model],
  )

  // Wallet balance split into whole + .fraction parts (matches the markup).
  const balanceWhole = Math.floor(balanceSar)
  const balanceFraction = Math.round((balanceSar - balanceWhole) * 100)
    .toString()
    .padStart(2, '0')
  const balanceWholeLabel = balanceWhole.toLocaleString('en-US')

  function updateAssistantMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)))
  }

  async function send() {
    const text = draft.trim()
    if (!text || isSending) return
    const key = getRenterKey()
    const ar = isArabicText(text)
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      ar,
      roleLabel: ar ? 'You · Arabic' : 'You · English',
      content: text,
    }
    const assistantId = `a-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      ar,
      roleLabel: `${selectedModelName} · streaming…`,
      content: ar ? 'يجري إرسال الطلب إلى DCP…' : 'Sending request to DCP…',
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setDraft('')
    setRequestError('')

    if (!key) {
      const message = lang === 'ar'
        ? 'سجّل الدخول بمفتاح مستأجر حقيقي قبل إرسال طلب إلى النموذج.'
        : 'Sign in with a real renter key before sending a model request.'
      updateAssistantMessage(assistantId, { roleLabel: 'DCP · auth required', content: message })
      setRequestError(message)
      return
    }

    setIsSending(true)
    const startedAt = performance.now()
    let fullContent = ''
    let outputTokens = 0

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
          max_tokens: maxTokens,
          temperature: Number(temperature),
          top_p: Number(topP),
          stream,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(detail || `DCP returned HTTP ${res.status}`)
      }

      if (stream && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue
            try {
              const chunk = JSON.parse(data)
              const delta = chunk.choices?.[0]?.delta
              const content = delta?.content || delta?.reasoning_content || ''
              if (content) {
                fullContent += content
                outputTokens += 1
                updateAssistantMessage(assistantId, { content: fullContent })
              }
              if (chunk.usage?.completion_tokens) outputTokens = chunk.usage.completion_tokens
            } catch {
              // Ignore malformed SSE keepalive lines and continue streaming.
            }
          }
        }
      } else {
        const data = await res.json()
        fullContent = data.choices?.[0]?.message?.content || ''
        outputTokens = data.usage?.completion_tokens || Math.max(1, Math.ceil(fullContent.length / 4))
        updateAssistantMessage(assistantId, { content: fullContent || (lang === 'ar' ? 'لا توجد استجابة.' : 'No response returned.') })
      }

      const elapsedSeconds = (performance.now() - startedAt) / 1000
      const inputTokens = Math.max(1, Math.ceil(text.length / 4))
      setStats((prev) => ({
        inputTokens: prev.inputTokens + inputTokens,
        outputTokens: prev.outputTokens + outputTokens,
        elapsedSeconds,
        costSar: prev.costSar,
      }))
      updateAssistantMessage(assistantId, {
        roleLabel: `${selectedModelName} · ${outputTokens.toLocaleString('en-US')} tok · ${elapsedSeconds.toFixed(1)}s`,
        content: fullContent || (lang === 'ar' ? 'اكتملت الاستجابة بدون محتوى.' : 'The response completed without content.'),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed.'
      setRequestError(message)
      updateAssistantMessage(assistantId, {
        roleLabel: 'DCP · request failed',
        content: message,
      })
    } finally {
      setIsSending(false)
    }
  }

  function onSampleClick(text: string) {
    setDraft(text)
  }

  function onTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  // ── live-counter jitter (cosmetic), gated for reduced motion ──
  const [inputTokens, setInputTokens] = useState(248)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return
    const id = window.setInterval(() => {
      setInputTokens((prev) => prev + Math.round((Math.random() - 0.4) * 3))
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  // ── live model catalog (OpenAI-compatible /v1/models, same source as v1) ──
  // Falls back to the prototype MODELS list when the endpoint is unreachable.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('https://api.dcp.sa/v1/models')
        if (!res.ok) return
        const data: unknown = await res.json()
        const raw = ((): CatalogModelRaw[] => {
          if (Array.isArray(data)) return data as CatalogModelRaw[]
          const obj = data as { data?: unknown; models?: unknown }
          if (Array.isArray(obj.data)) return obj.data as CatalogModelRaw[]
          if (Array.isArray(obj.models)) return obj.models as CatalogModelRaw[]
          return []
        })()
        const mapped: ModelOption[] = raw
          .map((m) => ({
            id: m.id || m.model_id || '',
            name: m.name || m.display_name || m.id || m.model_id || '',
            // Reuse the existing "available" affordance (↻) for online models.
            price: (m.provider_count ?? 0) > 0 ? '↻' : undefined,
          }))
          .filter((m) => m.id !== '')
          // Online models first, then alphabetical (mirrors v1 sort).
          .sort((a, b) => {
            const ao = a.price ? 1 : 0
            const bo = b.price ? 1 : 0
            if (ao !== bo) return bo - ao
            return a.name.localeCompare(b.name)
          })
        if (cancelled || mapped.length === 0) return
        setModels(mapped)
        // Keep current selection if still present, else pick first online/model.
        setModel((prev) => {
          if (mapped.some((m) => m.id === prev)) return prev
          const firstOnline = mapped.find((m) => m.price)
          return (firstOnline ?? mapped[0]).id
        })
      } catch {
        // Silently keep the fallback MODELS list.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── real wallet balance (renter key required, else keep mock) ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/renters/me?key=${encodeURIComponent(key)}`, {
          headers: { 'x-renter-key': key },
        })
        if (!res.ok) return
        const data: { renter?: { balance_halala?: number } } = await res.json()
        const halala = data.renter?.balance_halala
        if (cancelled || halala == null) return
        setBalanceSar(halala / 100)
      } catch {
        // Silently keep the fallback balance.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rt-app">
      {/* ── Sidebar (from renter-shell.js template) ── */}
      <aside className={`rt-sb${sidebarOpen ? ' on' : ''}`} id="rt-sb" data-page={CURRENT_PAGE}>
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">Console</span>
        </div>
        <div className="rt-ws">
          <button className="rt-ws-btn" title="Switch workspace">
            <span className="av">N</span>
            <span className="body">
              <span className="nm">NextWave Commerce</span>
              <span className="sub">acme-prod · 3 members</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>
        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {balanceWholeLabel}<span className="u">.{balanceFraction}</span>
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR 2.72</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Burn · last 7 days" ar="الاستهلاك · آخر 7 أيام" />
            </span>
            <b>SAR 412</b>
          </div>
          <button className="topup">
            <Bi en="+ Top up" ar="+ شحن" />
          </button>
        </div>
        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">{s.sec}</div>
              {s.items.map((it) => (
                <Link
                  key={it.k}
                  href={it.href}
                  className={CURRENT_PAGE === it.k ? 'on' : ''}
                  aria-current={CURRENT_PAGE === it.k ? 'page' : undefined}
                >
                  <span className="ic">{it.ic}</span>
                  <span>{it.label}</span>
                  <span className="bd">{it.bd || ''}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="rt-sb-foot">
          <div className="av">F</div>
          <div className="who">
            Fatima Al-Harbi
            <span className="e">fatima@nextwave.sa · Owner</span>
          </div>
          <span className="out" title="Sign out">
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`rt-backdrop${sidebarOpen ? ' on' : ''}`}
        id="rt-backdrop"
        onClick={() => setSidebarOpen(false)}
      />

      <div>
        {/* ── Topbar (from renter-shell.js template) ── */}
        <header className="rt-tb" id="rt-tb" data-crumb="Playground">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>NextWave Commerce</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Playground" ar="ساحة التجربة" />
            </span>
          </div>
          <span className="pill">
            <span className="d"></span> <Bi en="API live" ar="الواجهة مفعّلة" />
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <Link className="keys" href="/v2/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح الواجهة" />
          </Link>
        </header>

        <main className="rt-main">
          <h1 className="rt-h1">
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="Try it" ar="جرّبه" />
            </em>{' '}
            <Bi en="before you ship." ar="قبل أن تطلق." />
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi
                en="Same API · same cost · same answer your app would see"
                ar="نفس الواجهة · نفس التكلفة · نفس الإجابة التي سيراها تطبيقك"
              />
            </span>
          </div>

          <div className="pg-grid" style={{ marginTop: '36px' }}>
            {/* Left side: model picker + knobs */}
            <div className="pg-side">
              <div className="panel">
                <h4>
                  <Bi en="Model" ar="النموذج" />
                </h4>
                <div className="model-pick">
                  {models.map((m) => (
                    <label key={m.id}>
                      <input
                        type="radio"
                        name="m"
                        checked={model === m.id}
                        onChange={() => setModel(m.id)}
                      />
                      <span className="dot"></span>
                      <span className="nm">{m.name}</span>
                      {m.price ? <span className="price">{m.price}</span> : <span className="price"></span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h4>
                  <Bi en="Parameters" ar="المعاملات" />
                </h4>
                <div className="knob">
                  <div className="label">
                    <span>
                      <Bi en="Temperature" ar="درجة الحرارة" />
                    </span>
                    <b>{temperature}</b>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={tempRaw}
                    onChange={(e) => setTempRaw(Number(e.target.value))}
                  />
                </div>
                <div className="knob">
                  <div className="label">
                    <span>
                      <Bi en="Max tokens" ar="أقصى عدد للرموز" />
                    </span>
                    <b>{maxTokensLabel}</b>
                  </div>
                  <input
                    type="range"
                    min={128}
                    max={4096}
                    step={MAX_TOKEN_STEP}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                  />
                </div>
                <div className="knob">
                  <div className="label">
                    <span>
                      <Bi en="Top-p" ar="Top-p" />
                    </span>
                    <b>{topP}</b>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={topPRaw}
                    onChange={(e) => setTopPRaw(Number(e.target.value))}
                  />
                </div>
                <label className="switch" style={{ marginTop: '16px' }}>
                  <input
                    type="checkbox"
                    checked={stream}
                    onChange={(e) => setStream(e.target.checked)}
                  />
                  <span className="track"></span>
                  <span className="lbl-text">
                    <Bi en="Stream response" ar="بث الاستجابة" />
                  </span>
                </label>
              </div>
            </div>

            {/* Middle: chat */}
            <div className="chat">
              <div className="chat-hd">
                <div className="nm">{selectedModelName}</div>
                <div className="meta">
                  <Bi en="Sample prompts available below" ar="نماذج جاهزة متوفرة أدناه" />
                </div>
              </div>
              <div className="chat-body" id="chat-body">
                {messages.map((m) => (
                  <div key={m.id} className={`msg ${m.role}${m.ar ? ' ar' : ''}`}>
                    <div className="role">{m.roleLabel}</div>
                    <div className="content">{m.content}</div>
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <textarea
                  placeholder={lang === 'ar' ? 'اسأل بالعربية أو الإنجليزية…' : 'Ask in English or Arabic…'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onTextareaKeyDown}
                />
                <div className="row">
                  <div className="left">
                    <span>
                      <Bi en="Markdown supported" ar="يدعم Markdown" />
                    </span>
                    <span>·</span>
                    <span>
                      <b style={{ color: 'var(--ink)' }}>⌘+↵</b> <Bi en="to send" ar="للإرسال" />
                    </span>
                  </div>
                  <button className="send" onClick={send} disabled={isSending}>
                    {isSending ? <Bi en="Sending…" ar="جارٍ الإرسال…" /> : <Bi en="Send" ar="إرسال" />}
                  </button>
                </div>
                {requestError && <div className="pg-error" role="alert">{requestError}</div>}
              </div>
            </div>

            {/* Right: cost + sample prompts */}
            <div className="pg-side">
              <div className="panel meter-card">
                <span className="k">
                  <Bi en="This session" ar="هذه الجلسة" />
                </span>
                <div className="v">
                  SAR {Math.floor(stats.costSar)}
                  <span className="u">.{Math.round((stats.costSar % 1) * 100).toString().padStart(2, '0')}</span>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <div className="meter-row">
                    <span>
                      <Bi en="Input tokens" ar="رموز الإدخال" />
                    </span>
                    <b>{stats.inputTokens.toLocaleString('en-US')}</b>
                  </div>
                  <div className="meter-row">
                    <span>
                      <Bi en="Output tokens" ar="رموز الإخراج" />
                    </span>
                    <b>{stats.outputTokens.toLocaleString('en-US')}</b>
                  </div>
                  <div className="meter-row">
                    <span>
                      <Bi en="Time elapsed" ar="الوقت المنقضي" />
                    </span>
                    <b>{stats.elapsedSeconds.toFixed(1)}s</b>
                  </div>
                  <div className="meter-row">
                    <span>
                      <Bi en="Rate" ar="السعر" />
                    </span>
                    <b>
                      <Bi en="SAR 0.26 / 1M tok" ar="SAR 0.26 / مليون رمز" />
                    </b>
                  </div>
                </div>
              </div>

              <div className="panel">
                <h4>
                  <Bi en="Sample prompts" ar="نماذج جاهزة" />
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {SAMPLE_PROMPTS.map((p) => (
                    <a
                      key={p.text}
                      className="btn-sec"
                      style={p.rtl ? SAMPLE_RTL_STYLE : SAMPLE_LTR_STYLE}
                      onClick={() => onSampleClick(p.text)}
                    >
                      {p.text}
                    </a>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h4>
                  <Bi en="Ship it" ar="أطلقه" />
                </h4>
                <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: '13px', lineHeight: 1.6 }}>
                  <Bi
                    en="When this prompt works, copy the exact request as cURL, Python, or Node."
                    ar="عندما يعمل هذا الطلب، انسخ نفس الطلب كـ cURL أو Python أو Node."
                  />
                </p>
                <Link className="btn-pri" style={{ display: 'block', textAlign: 'center' }} href="/v2/renter/keys">
                  <Bi en="View code →" ar="عرض الكود →" />
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
