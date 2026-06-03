'use client'

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './playground.css'

const HALALA_PER_SAR = 100

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
      { k: 'keys', ic: '⚷', label: 'API keys', href: '/v2/renter/keys' },
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

// Shape returned by the OpenAI-compatible /v1/models endpoint (subset).
interface CatalogModelRaw {
  id?: string
  model_id?: string
  name?: string
  display_name?: string
  provider_count?: number
}

type CatalogState = 'loading' | 'ready' | 'empty' | 'error'

interface RenterAccount {
  name?: string
  email?: string
  organization?: string
  balance_halala?: number
}

interface RenterMeResponse {
  renter?: RenterAccount
}

interface RenterBalanceResponse {
  balance_halala?: number
  balance_sar?: number
  held_halala?: number
  held_sar?: number
  total_spent_halala?: number
  total_spent_sar?: number
}

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
  { text: 'Plan a tool call', rtl: false },
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

const TEMP_STEP = 0.1
const MAX_TOKEN_STEP = 128
const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function isArabicText(value: string): boolean {
  return /[؀-ۿ]/.test(value)
}

function halalaToSar(halala: number | null | undefined): number | undefined {
  return typeof halala === 'number' && Number.isFinite(halala) ? halala / HALALA_PER_SAR : undefined
}

function fmtSar(sar: number | null | undefined): string {
  return typeof sar === 'number' && Number.isFinite(sar) ? sarFmt.format(sar) : '—'
}

function initials(name?: string, email?: string): string {
  const source = (name || email || 'DCP').trim()
  return source.charAt(0).toUpperCase()
}

async function readJson<T>(url: string, headers: HeadersInit, optional = false): Promise<T | null> {
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as T
}

export default function PlaygroundPage() {
  const { lang, toggle } = useV2()

  // ── shell mobile drawer ──
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── playground controls ──
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [catalogState, setCatalogState] = useState<CatalogState>('loading')
  const [tempRaw, setTempRaw] = useState(7) // 0..20 -> /10
  const [maxTokens, setMaxTokens] = useState(1024)
  const [topPRaw, setTopPRaw] = useState(100) // 0..100 -> /100
  const [stream, setStream] = useState(true)

  // ── live renter shell ──
  const [renter, setRenter] = useState<RenterAccount | null>(null)
  const [balance, setBalance] = useState<RenterBalanceResponse | null>(null)
  const [accountState, setAccountState] = useState<'missing-key' | 'loading' | 'ready' | 'error'>('loading')

  const [draft, setDraft] = useState('ما الفرق بين زكاة المال وزكاة الفطر؟')
  const [messages, setMessages] = useState<ChatMessage[]>([])
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

  const accountName = renter?.organization || renter?.name || renter?.email || 'Renter account'
  const accountSub = renter?.email ||
    (accountState === 'missing-key'
      ? 'Sign in with a renter API key'
      : accountState === 'error'
        ? 'Account unavailable'
        : 'Loading account')
  const balanceSar = balance?.balance_sar ?? halalaToSar(balance?.balance_halala ?? renter?.balance_halala)
  const heldSar = balance?.held_sar ?? halalaToSar(balance?.held_halala)
  const totalSpentSar = balance?.total_spent_sar ?? halalaToSar(balance?.total_spent_halala)

  function updateAssistantMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)))
  }

  async function send() {
    const text = draft.trim()
    if (!text || isSending) return
    const key = getRenterKey()
    if (!model) {
      const message = lang === 'ar'
        ? 'لا يوجد نموذج متاح حالياً من كتالوج DCP المباشر.'
        : 'No serving model is currently available from the live DCP catalog.'
      setRequestError(message)
      return
    }
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
    let requestCostSar = 0

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
              const sarTotal = Number(chunk.usage?.pricing?.sar_total ?? chunk.usage?.pricing?.sar)
              if (Number.isFinite(sarTotal)) requestCostSar = sarTotal
            } catch {
              // Ignore malformed SSE keepalive lines and continue streaming.
            }
          }
        }
      } else {
        const data = await res.json()
        fullContent = data.choices?.[0]?.message?.content || ''
        outputTokens = data.usage?.completion_tokens || Math.max(1, Math.ceil(fullContent.length / 4))
        const sarTotal = Number(data.usage?.pricing?.sar_total ?? data.usage?.pricing?.sar)
        if (Number.isFinite(sarTotal)) requestCostSar = sarTotal
        updateAssistantMessage(assistantId, { content: fullContent || (lang === 'ar' ? 'لا توجد استجابة.' : 'No response returned.') })
      }

      const elapsedSeconds = (performance.now() - startedAt) / 1000
      const inputTokens = Math.max(1, Math.ceil(text.length / 4))
      setStats((prev) => ({
        inputTokens: prev.inputTokens + inputTokens,
        outputTokens: prev.outputTokens + outputTokens,
        elapsedSeconds,
        costSar: prev.costSar + requestCostSar,
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

  // ── live model catalog (OpenAI-compatible /v1/models, same source as v1) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setCatalogState('loading')
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`)
        const data: unknown = await res.json()
        const raw = ((): CatalogModelRaw[] => {
          if (Array.isArray(data)) return data as CatalogModelRaw[]
          const obj = data as { data?: unknown; models?: unknown }
          if (Array.isArray(obj.data)) return obj.data as CatalogModelRaw[]
          if (Array.isArray(obj.models)) return obj.models as CatalogModelRaw[]
          return []
        })()
        const mapped: ModelOption[] = raw
          .filter((m) => (m.provider_count ?? 0) > 0)
          .map((m) => ({
            id: m.id || m.model_id || '',
            name: m.name || m.display_name || m.id || m.model_id || '',
            price: `${m.provider_count} live`,
          }))
          .filter((m) => m.id !== '')
          .sort((a, b) => a.name.localeCompare(b.name))
        if (cancelled) return
        setModels(mapped)
        setCatalogState(mapped.length ? 'ready' : 'empty')
        setModel((prev) => (mapped.some((m) => m.id === prev) ? prev : mapped[0]?.id || ''))
      } catch {
        if (cancelled) return
        setModels([])
        setModel('')
        setCatalogState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── real renter account + wallet balance ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setAccountState('missing-key')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setAccountState('loading')
        const encodedKey = encodeURIComponent(key)
        const headers = { 'x-renter-key': key }
        const [meData, balanceData] = await Promise.all([
          readJson<RenterMeResponse>(`${getApiBase()}/renters/me?key=${encodedKey}`, headers),
          readJson<RenterBalanceResponse>(`${getApiBase()}/renters/balance?key=${encodedKey}`, headers, true),
        ])
        if (cancelled) return
        setRenter(meData?.renter || null)
        setBalance(balanceData)
        setAccountState('ready')
      } catch {
        if (cancelled) return
        setAccountState('error')
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
            <span className="av">{initials(accountName, renter?.email)}</span>
            <span className="body">
              <span className="nm">{accountName}</span>
              <span className="sub">{accountSub}</span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>
        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            SAR {fmtSar(balanceSar)}
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>SAR {fmtSar(heldSar)}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Total spent" ar="إجمالي الإنفاق" />
            </span>
            <b>SAR {fmtSar(totalSpentSar)}</b>
          </div>
          <Link className="topup" href="/v2/renter/wallet">
            <Bi en="+ Top up" ar="+ شحن" />
          </Link>
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
          <div className="av">{initials(renter?.name || accountName, renter?.email)}</div>
          <div className="who">
            {renter?.name || accountName}
            <span className="e">{renter?.email || 'Renter session required'}</span>
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
            <span>{accountName}</span>
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
                {catalogState === 'loading' && (
                  <div className="pg-empty">
                    <Bi en="Loading live model catalog..." ar="تحميل كتالوج النماذج المباشر..." />
                  </div>
                )}
                {catalogState === 'empty' && (
                  <div className="pg-empty">
                    <Bi en="No serving models are available right now." ar="لا توجد نماذج عاملة متاحة حالياً." />
                  </div>
                )}
                {catalogState === 'error' && (
                  <div className="pg-error" role="alert">
                    <Bi en="Could not load the live model catalog." ar="تعذر تحميل كتالوج النماذج المباشر." />
                  </div>
                )}
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
                <div className="nm">{selectedModelName || 'No live model'}</div>
                <div className="meta">
                  <Bi en="Sample prompts available below" ar="نماذج جاهزة متوفرة أدناه" />
                </div>
              </div>
              <div className="chat-body" id="chat-body">
                {messages.length === 0 ? (
                  <div className="pg-empty">
                    <Bi
                      en="Send a prompt with a live renter key. Responses will appear here."
                      ar="أرسل طلباً بمفتاح مستأجر مباشر. ستظهر الاستجابات هنا."
                    />
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`msg ${m.role}${m.ar ? ' ar' : ''}`}>
                      <div className="role">{m.roleLabel}</div>
                      <div className="content">{m.content}</div>
                    </div>
                  ))
                )}
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
                  <button className="send" onClick={send} disabled={isSending || !model}>
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
                      <Bi en="From response usage" ar="من بيانات استخدام الاستجابة" />
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
