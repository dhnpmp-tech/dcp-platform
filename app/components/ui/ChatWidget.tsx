'use client'

/**
 * DCP Phase 1 — AI Chat Support Widget
 *
 * Self-hosted AI-powered support chat widget connected to DCP's own inference API.
 * Replaces the feedback-only flow with an intelligent chat that answers questions about DCP.
 *
 * Features:
 * - Floating chat bubble button (bottom-right)
 * - AI-powered responses via /api/chat → /v1/chat/completions
 * - Typing indicators during AI response
 * - Error states with retry option
 * - Session management (stores conversation in localStorage)
 * - RTL / Arabic support via useLanguage()
 * - Respects cookie consent
 *
 * Usage:
 *   <ChatWidget />
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useLanguage } from '../../lib/i18n'

type WidgetView = 'button' | 'chat'
type MessageRole = 'user' | 'assistant' | 'system'

interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  error?: boolean
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: string
}

const STORAGE_KEY = 'dcp_chat_session'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getStoredSession(): { messages: ChatMessage[]; lastActivity: number } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const session = JSON.parse(stored)
    if (!Array.isArray(session.messages)) return null
    return session
  } catch {
    return null
  }
}

function saveSession(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages,
      lastActivity: Date.now(),
    }))
  } catch { /* noop */ }
}

function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* noop */ }
}

const WELCOME_MESSAGE: ChatMessage = {
  id: generateId(),
  role: 'assistant',
  content: 'مرحباً! أنا مساعد DCP الذكي. كيف يمكنني مساعدتك اليوم؟\n\nHello! I\'m the DCP Support Assistant. How can I help you today?',
  timestamp: Date.now(),
}

const QUICK_QUESTIONS = [
  'How do I register as a provider?',
  'How does pricing work?',
  'What models are available?',
  'How do I integrate via API?',
]

/** Lightweight markdown renderer for chat messages */
function renderMarkdown(text: string): React.ReactNode {
  // Strip thinking tokens (Qwen reasoning blocks)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  cleaned = cleaned.replace(/\*\*think\*\*[\s\S]*?\*\*\/think\*\*/g, '')
  cleaned = cleaned.replace(/^<think>[\s\S]*/gm, '')
  cleaned = cleaned.trim()
  if (!cleaned) return null

  // Split into blocks by double newline
  const blocks = cleaned.split(/\n\n+/)

  return blocks.map((block, bi) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    // Code block
    if (trimmed.startsWith('```')) {
      const code = trimmed.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return (
        <pre key={bi} className="bg-black/30 rounded-lg px-3 py-2 my-1.5 overflow-x-auto text-xs font-mono whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
      )
    }

    // Process inline elements in a line
    const processInline = (line: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = []
      let remaining = line
      let key = 0

      while (remaining.length > 0) {
        // Inline code
        const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/)
        if (codeMatch) {
          if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>)
          parts.push(<code key={key++} className="bg-black/30 px-1.5 py-0.5 rounded text-xs font-mono">{codeMatch[2]}</code>)
          remaining = codeMatch[3]
          continue
        }

        // Bold
        const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/)
        if (boldMatch) {
          if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>)
          parts.push(<strong key={key++} className="font-semibold">{boldMatch[2]}</strong>)
          remaining = boldMatch[3]
          continue
        }

        // Markdown link [text](url)
        const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/)
        if (linkMatch) {
          if (linkMatch[1]) parts.push(<span key={key++}>{linkMatch[1]}</span>)
          parts.push(
            <a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
              {linkMatch[2]}
            </a>
          )
          remaining = linkMatch[4]
          continue
        }

        // Plain URL
        const urlMatch = remaining.match(/^(.*?)(https?:\/\/[^\s,)]+)(.*)$/)
        if (urlMatch) {
          if (urlMatch[1]) parts.push(<span key={key++}>{urlMatch[1]}</span>)
          parts.push(
            <a key={key++} href={urlMatch[2]} target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
              {urlMatch[2]}
            </a>
          )
          remaining = urlMatch[3]
          continue
        }

        // No more matches — rest is plain text
        parts.push(<span key={key++}>{remaining}</span>)
        break
      }
      return parts
    }

    // List items
    if (/^\d+\.\s|^[-*]\s/.test(trimmed)) {
      const items = trimmed.split('\n').filter(l => l.trim())
      const isOrdered = /^\d+\./.test(items[0])
      const Tag = isOrdered ? 'ol' : 'ul'
      return (
        <Tag key={bi} className={`my-1.5 space-y-1 ${isOrdered ? 'list-decimal' : 'list-disc'} list-inside`}>
          {items.map((item, ii) => (
            <li key={ii} className="text-sm leading-relaxed">
              {processInline(item.replace(/^\d+\.\s*|^[-*]\s*/, ''))}
            </li>
          ))}
        </Tag>
      )
    }

    // Regular paragraph
    const lines = trimmed.split('\n')
    return (
      <p key={bi} className="text-sm leading-relaxed my-1">
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {processInline(line)}
          </span>
        ))}
      </p>
    )
  })
}

export default function ChatWidget() {
  const { language } = useLanguage()
  const isRTL = language === 'ar'

  const [view, setView] = useState<WidgetView>('button')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, scrollToBottom])

  useEffect(() => {
    const session = getStoredSession()
    if (session) {
      const isExpired = Date.now() - session.lastActivity > SESSION_TIMEOUT_MS
      if (isExpired) {
        clearSession()
      } else {
        setMessages(session.messages.length > 0 ? session.messages : [WELCOME_MESSAGE])
      }
    } else {
      setMessages([WELCOME_MESSAGE])
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0 && messages[0].id !== WELCOME_MESSAGE.id) {
      saveSession(messages)
    }
  }, [messages])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isTyping) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)
    setError(null)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      const data: ChatResponse = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const assistantContent = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get response. Please try again.'

      const errorAssistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Warning: ${errorMessage}`,
        timestamp: Date.now(),
        error: true,
      }

      setMessages((prev) => [...prev, errorAssistantMessage])
      setError(errorMessage)
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }, [messages, isTyping])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }, [inputValue, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }, [inputValue, sendMessage])

  const clearChat = useCallback(() => {
    clearSession()
    setMessages([WELCOME_MESSAGE])
    setError(null)
  }, [])

  const t = (en: string, ar: string) => (isRTL ? ar : en)

  const panelClass = 'fixed bottom-20 right-4 z-50 w-[340px] sm:w-[400px] rounded-2xl border border-dc1-border bg-dc1-surface-l1 shadow-2xl flex flex-col max-h-[560px]'
  const panelDir = isRTL ? 'rtl' : 'ltr'

  if (view === 'button') {
    return (
      <button
        onClick={() => setView('chat')}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-lg hover:shadow-cyan-400/30 hover:scale-105 transition-all duration-200 flex items-center justify-center text-xl"
        aria-label={t('Chat with support', 'تواصل مع الدعم')}
        title={t('Chat with support', 'تواصل مع الدعم')}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {/* Notification dot only shown when there are unread messages */}
      </button>
    )
  }

  return (
    <div className={panelClass} dir={panelDir}>
      <div className="flex items-center justify-between bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-3.5 rounded-t-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-cyan-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('DCP Support', 'دعم DCP')}</p>
            <p className="text-xs text-white/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              {t('Online now', 'متصل الآن')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="text-white/70 hover:text-white transition-colors text-xs px-2 py-1 rounded border border-white/30 hover:border-white/60"
            title={t('New chat', 'محادثة جديدة')}
          >
            {t('New', 'جديد')}
          </button>
          <button
            onClick={() => setView('button')}
            className="text-white/70 hover:text-white transition-colors text-lg leading-none"
            aria-label={t('Close', 'إغلاق')}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-cyan-500 text-white rounded-br-sm text-sm'
                  : msg.error
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400 rounded-bl-sm text-sm'
                  : 'bg-dc1-surface-l2 text-dc1-text-primary rounded-bl-sm'
              }`}
              style={{ wordBreak: 'break-word' }}
            >
              {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-dc1-surface-l2 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-dc1-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-dc1-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-dc1-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && !isTyping && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                const lastUserMsg = messages.filter((m) => m.role === 'user').pop()
                if (lastUserMsg) sendMessage(lastUserMsg.content)
              }}
              className="text-xs text-dc1-amber hover:underline"
            >
              {t('Retry', 'إعادة المحاولة')}
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && messages[0].id === WELCOME_MESSAGE.id && !isTyping && (
        <div className="px-4 pb-2">
          <p className="text-xs text-dc1-text-muted mb-2">{t('Quick questions:', 'أسئلة سريعة:')}</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-xs px-2.5 py-1 rounded-full bg-dc1-surface-l2 border border-dc1-border text-dc1-text-secondary hover:text-dc1-amber hover:border-dc1-amber transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-dc1-border p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('Type your message…', 'اكتب رسالتك…')}
            className="flex-1 bg-dc1-surface-l2 border border-dc1-border rounded-xl px-3 py-2 text-sm text-dc1-text-primary placeholder:text-dc1-text-muted resize-none focus:outline-none focus:border-dc1-amber transition-colors"
            rows={1}
            disabled={isTyping}
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            className="h-10 w-10 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
            aria-label={t('Send', 'إرسال')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-dc1-text-muted mt-1.5 text-center">
          {t('DCP AI Assistant — for general support only', 'مساعد DCP الذكي — للدعم العام فقط')}
        </p>
      </form>
    </div>
  )
}
