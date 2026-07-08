'use client'

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useV2, Bi } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import WorkspacePanel from '../workspace/WorkspacePanel'
import './playground.css'

const HALALA_PER_SAR = 100
// Codebase-standard FX anchor (matches app/admin/pricing, app/provider/activate,
// and the v1 playground). Used only as a client-side fallback when the backend
// pricing object does not already carry sar_total.
const SAR_PER_USD = 3.75

interface NavItem {
  k: string
  ic: string
  label: string
  labelAr?: string
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
      { k: 'dash', ic: '⌂', label: 'Overview', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
      { k: 'fine', ic: 'FT', label: 'Fine-Tuning', labelAr: 'الضبط الدقيق', href: '/renter/fine-tuning' },
    ],
  },
  {
    sec: 'Spend',
    items: [
      { k: 'wallet', ic: '₪', label: 'Credit', href: '/renter/wallet' },
      { k: 'invoices', ic: '≡', label: 'Invoices', href: '/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', href: '/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', href: '/docs', bd: '↗' },
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
type RouterPolicyState = 'loading' | 'ready' | 'error'

interface RouterPolicy {
  id: string
  label: string
  status: string
  available: boolean
  default?: boolean
  request_selectable: boolean
  current_behavior?: string
  signals?: string[]
  next?: string
}

interface RouterPoliciesResponse {
  object?: string
  version?: string
  default_policy?: string
  request_policy_parameter?: string | null
  request_selectable?: boolean
  generated_at?: string
  data?: RouterPolicy[]
}

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
  reasoning?: string
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

// Pricing block carried on the OpenAI-compatible usage object. The backend now
// emits sar_total directly; older deployments only emit usd_total (a string).
interface PricingUsage {
  sar_total?: number | string
  sar?: number | string
  usd_total?: number | string
}

// Resolve the real SAR cost of one request. Prefer the backend's sar_total,
// then the legacy `sar` field, then convert usd_total client-side at the
// codebase-standard rate. Returns null when no priced usage is present so the
// session meter stays honest instead of silently reading 0.
function resolveRequestSar(pricing: PricingUsage | undefined): number | null {
  if (!pricing) return null
  const sarTotal = Number(pricing.sar_total ?? pricing.sar)
  if (Number.isFinite(sarTotal)) return sarTotal
  const usdTotal = Number(pricing.usd_total)
  if (Number.isFinite(usdTotal)) return usdTotal * SAR_PER_USD
  return null
}

function fmtSar(sar: number | null | undefined): string {
  return typeof sar === 'number' && Number.isFinite(sar) ? sarFmt.format(sar) : '—'
}

function formatPolicyStatus(value: string | null | undefined): string {
  if (!value) return '-'
  return value.replace(/_/g, ' ')
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
  const [routerPolicyState, setRouterPolicyState] = useState<RouterPolicyState>('loading')
  const [routerPolicies, setRouterPolicies] = useState<RouterPoliciesResponse | null>(null)
  const [tempRaw, setTempRaw] = useState(7) // 0..20 -> /10
  const [maxTokens, setMaxTokens] = useState(1024)
  const [topPRaw, setTopPRaw] = useState(100) // 0..100 -> /100
  const [stream, setStream] = useState(true)
  // Reasoning is OFF by default — clean answers, and the renter is not billed
  // for thinking tokens. Toggling on sends enable_thinking:true (the backend
  // translates it to the right per-engine knob) and reveals the reasoning panel.
  const [showReasoning, setShowReasoning] = useState(false)

  // ── Playground / Workspace surface tab ──
  // The renter playground and the workspace file manager share this route.
  // The chat playground is the default; "Workspace" reveals the file manager
  // for the renter's persistent in-Kingdom volume (PR #678 backend).
  const [surface, setSurface] = useState<'playground' | 'workspace'>('playground')

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
  const defaultRouterPolicy = useMemo(() => {
    const policies = routerPolicies?.data || []
    return policies.find((policy) => policy.id === routerPolicies?.default_policy)
      || policies.find((policy) => policy.default)
      || policies.find((policy) => policy.id === 'balanced')
      || null
  }, [routerPolicies])
  const shouldSendBalancedPolicy = defaultRouterPolicy?.id === 'balanced' && defaultRouterPolicy.available === true

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

  // Drive the topbar status pill off real state instead of static markup.
  const apiLive = catalogState === 'ready' && accountState === 'ready'
  const apiConnecting = catalogState === 'loading' || accountState === 'loading'
  const apiPillColor = apiLive ? 'var(--rt-accent)' : 'var(--mut)'

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
    let fullReasoning = ''
    let outputTokens = 0
    let promptTokens = 0
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
          enable_thinking: showReasoning,
          ...(shouldSendBalancedPolicy ? { routing_policy: 'balanced' } : {}),
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
              // Keep the answer and the reasoning on SEPARATE tracks — never
              // merge reasoning into content (that was the Ollama leak bug).
              const content = delta?.content || ''
              const reasoning = delta?.reasoning_content || delta?.reasoning || ''
              if (content || reasoning) {
                if (content) {
                  fullContent += content
                  outputTokens += 1
                }
                if (reasoning) fullReasoning += reasoning
                updateAssistantMessage(assistantId, { content: fullContent, reasoning: fullReasoning || undefined })
              }
              if (chunk.usage?.completion_tokens) outputTokens = chunk.usage.completion_tokens
              if (chunk.usage?.prompt_tokens) promptTokens = chunk.usage.prompt_tokens
              const sarTotal = resolveRequestSar(chunk.usage?.pricing)
              if (sarTotal !== null) requestCostSar = sarTotal
            } catch {
              // Ignore malformed SSE keepalive lines and continue streaming.
            }
          }
        }
      } else {
        const data = await res.json()
        const msg = data.choices?.[0]?.message
        fullContent = msg?.content || ''
        fullReasoning = msg?.reasoning_content || msg?.reasoning || ''
        outputTokens = data.usage?.completion_tokens || Math.max(1, Math.ceil(fullContent.length / 4))
        if (data.usage?.prompt_tokens) promptTokens = data.usage.prompt_tokens
        const sarTotal = resolveRequestSar(data.usage?.pricing)
        if (sarTotal !== null) requestCostSar = sarTotal
        updateAssistantMessage(assistantId, {
          content: fullContent || (lang === 'ar' ? 'لا توجد استجابة.' : 'No response returned.'),
          reasoning: fullReasoning || undefined,
        })
      }

      const elapsedSeconds = (performance.now() - startedAt) / 1000
      // Prefer the backend's real prompt_tokens; the char/4 estimate is only a
      // fallback for responses that omit usage.
      const inputTokens = promptTokens > 0 ? promptTokens : Math.max(1, Math.ceil(text.length / 4))
      setStats((prev) => ({
        inputTokens: prev.inputTokens + inputTokens,
        outputTokens: prev.outputTokens + outputTokens,
        elapsedSeconds,
        costSar: prev.costSar + requestCostSar,
      }))
      updateAssistantMessage(assistantId, {
        roleLabel: `${selectedModelName} · ${outputTokens.toLocaleString('en-US')} tok · ${elapsedSeconds.toFixed(1)}s`,
        content: fullContent || (lang === 'ar' ? 'اكتملت الاستجابة بدون محتوى.' : 'The response completed without content.'),
        reasoning: fullReasoning || undefined,
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

  // ── read-only routing policy catalog ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setRouterPolicyState('loading')
        const res = await fetch('/v1/router/policies', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Router policy request failed: ${res.status}`)
        const data = (await res.json()) as RouterPoliciesResponse
        if (cancelled) return
        setRouterPolicies(data)
        setRouterPolicyState('ready')
      } catch {
        if (cancelled) return
        setRouterPolicies(null)
        setRouterPolicyState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── real renter account + credit balance ──
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
        const headers = { 'x-renter-key': key }
        const [meData, balanceData] = await Promise.all([
          readJson<RenterMeResponse>(`${getApiBase()}/renters/me`, headers),
          readJson<RenterBalanceResponse>(`${getApiBase()}/renters/balance`, headers, true),
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
            <Bi en="Credit" ar="الرصيد" />
          </div>
          <div className="v">
            <Bi en={`Credit ${fmtSar(balanceSar)}`} ar={`رصيد ${fmtSar(balanceSar)}`} />
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b><Bi en={`${fmtSar(heldSar)} credit`} ar={`${fmtSar(heldSar)} رصيد`} /></b>
          </div>
          <div className="row">
            <span>
              <Bi en="Total spent" ar="إجمالي الإنفاق" />
            </span>
            <b><Bi en={`${fmtSar(totalSpentSar)} credit`} ar={`${fmtSar(totalSpentSar)} رصيد`} /></b>
          </div>
          <Link className="topup" href="/renter/wallet">
            <Bi en="+ Add credit" ar="+ إضافة رصيد" />
          </Link>
        </div>
        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">{s.sec}</div>
              {s.items.map((it) => (
                <Link
                  key={it.k}
                  href={it.href} target={it.href === '/docs' ? '_blank' : undefined} rel={it.href === '/docs' ? 'noopener noreferrer' : undefined}
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
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/auth' }}>
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
          <span
            className="pill"
            style={{ color: apiPillColor, borderColor: apiPillColor }}
            title={apiLive ? 'Live model catalog + renter session ready' : 'Catalog or renter session not ready'}
          >
            <span className="d" style={apiLive ? undefined : { background: 'var(--mut)', animation: 'none' }}></span>{' '}
            {apiLive ? (
              <Bi en="API live" ar="الواجهة مفعّلة" />
            ) : apiConnecting ? (
              <Bi en="API connecting" ar="جارٍ الاتصال" />
            ) : (
              <Bi en="API offline" ar="الواجهة غير متصلة" />
            )}
          </span>
          <button className="lang" onClick={toggle} aria-label="Toggle language">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <Link className="keys" href="/renter/keys">
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
                en="Same API · metered at your app's exact rate · same answer your app would see"
                ar="نفس الواجهة · بنفس التسعير الذي يدفعه تطبيقك · نفس الإجابة التي سيراها تطبيقك"
              />
            </span>
          </div>

          {/* ── surface tabs: chat playground ↔ workspace file manager ── */}
          <div className="tabs pg-surface-tabs" role="tablist" aria-label={lang === 'ar' ? 'سطح الساحة' : 'Playground surface'}>
            <button
              role="tab"
              aria-selected={surface === 'playground'}
              className={surface === 'playground' ? 'on' : ''}
              onClick={() => setSurface('playground')}
            >
              <Bi en="Playground" ar="الساحة" />
            </button>
            <button
              role="tab"
              aria-selected={surface === 'workspace'}
              className={surface === 'workspace' ? 'on' : ''}
              onClick={() => setSurface('workspace')}
            >
              <Bi en="Workspace" ar="مساحة العمل" />
            </button>
          </div>

          {surface === 'workspace' ? (
            <WorkspacePanel
              apiBase={getApiBase()}
              renterKey={getRenterKey()}
            />
          ) : (
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
                <label className="switch" style={{ marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    checked={showReasoning}
                    onChange={(e) => setShowReasoning(e.target.checked)}
                  />
                  <span className="track"></span>
                  <span className="lbl-text">
                    <Bi en="Show reasoning" ar="إظهار الاستدلال" />
                  </span>
                </label>
              </div>

              <div className="panel router-panel">
                <h4>
                  <Bi en="Routing" ar="التوجيه" />
                </h4>
                {routerPolicyState === 'loading' && (
                  <div className="pg-empty">
                    <Bi en="Loading router policy catalog..." ar="تحميل كتالوج سياسات التوجيه..." />
                  </div>
                )}
                {routerPolicyState === 'error' && (
                  <div className="pg-error" role="alert">
                    <Bi en="Could not load router policy readiness." ar="تعذر تحميل جاهزية سياسات التوجيه." />
                  </div>
                )}
                {routerPolicyState === 'ready' && (
                  <>
                    <div className="route-default">
                      <span><Bi en="Default" ar="الافتراضي" /></span>
                      <b>{defaultRouterPolicy?.label || 'Balanced'}</b>
                      <em>{formatPolicyStatus(defaultRouterPolicy?.status)}</em>
                    </div>
                    <div className="route-policy-list">
                      {(routerPolicies?.data || []).map((policy) => (
                        <div
                          key={policy.id}
                          className={`route-policy${policy.id === defaultRouterPolicy?.id ? ' on' : ''}${policy.available ? '' : ' gated'}`}
                        >
                          <span>{policy.label}</span>
                          <b>{formatPolicyStatus(policy.status)}</b>
                        </div>
                      ))}
                    </div>
                    <div className="route-note mono">
                      <Bi
                        en={shouldSendBalancedPolicy ? 'routing_policy=balanced' : 'read-only routing catalog'}
                        ar={shouldSendBalancedPolicy ? 'routing_policy=balanced' : 'كتالوج توجيه للقراءة فقط'}
                      />
                    </div>
                  </>
                )}
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
                      {showReasoning && m.reasoning ? (
                        <div className="reasoning">
                          <span className="reasoning-label">
                            <Bi en="Reasoning" ar="الاستدلال" />
                          </span>
                          {m.reasoning}
                        </div>
                      ) : null}
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
                <Link className="btn-pri" style={{ display: 'block', textAlign: 'center' }} href="/renter/keys">
                  <Bi en="View code →" ar="عرض الكود →" />
                </Link>
              </div>
            </div>
          </div>
          )}
        </main>
      </div>
    </div>
  )
}
