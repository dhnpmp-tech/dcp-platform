'use client'

// Shared low-level atoms for the v1 provider onboarding wizard.
// Extracted from the legacy ProviderOnboardingWizard.tsx so the new
// 8-step flow (web-wizard-spec.md) can reuse the design tokens and
// interaction patterns without dragging along the old 5-step shell.

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Clipboard helper ──────────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ── Session-scoped state persistence ──────────────────────────────────────────
// The wizard can be closed + reopened mid-flow. We persist step progress and
// form inputs in sessionStorage (cleared when the tab closes) so a refresh
// doesn't lose the user's work, but there's no cross-session leakage.
export function loadSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore parse errors */ }
  return fallback
}

export function saveSession<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore quota errors */ }
}

export function clearSession(key: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(key)
  } catch { /* ignore */ }
}

// ── Progress indicator ────────────────────────────────────────────────────────
// Generalised from the legacy 5-step version: now takes an arbitrary array of
// step labels, so the new 8-step flow renders correctly.
export interface WizardProgressProps {
  currentStep: number            // 1-indexed
  steps: { n: number; label: string }[]
  isRTL?: boolean
}

export function WizardProgress({ currentStep, steps, isRTL = false }: WizardProgressProps) {
  const total = steps.length
  const pct = Math.min(100, Math.round((currentStep / total) * 100))
  const label = steps[currentStep - 1]?.label ?? ''

  return (
    <div className="mb-6 space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-dc1-text-primary">
          Step {currentStep} of {total} — {label}
        </span>
        <span className="text-dc1-text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-dc1-surface-l3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-dc1-amber to-status-success transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between px-1">
        {steps.map(({ n, label: stepLabel }) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                n < currentStep
                  ? 'border-status-success bg-status-success/20 text-status-success'
                  : n === currentStep
                  ? 'border-dc1-amber bg-dc1-amber/20 text-dc1-amber'
                  : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-muted'
              }`}
            >
              {n < currentStep ? '✓' : n}
            </div>
            <span
              className={`hidden text-[10px] md:block ${
                n === currentStep ? 'text-dc1-text-primary' : 'text-dc1-text-muted'
              }`}
              title={stepLabel}
            >
              {stepLabel.length > 10 ? `${stepLabel.slice(0, 10)}…` : stepLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Copy-to-clipboard button ──────────────────────────────────────────────────
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(async () => {
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-1.5 text-xs font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3 transition-colors min-h-[36px]"
      aria-label={copied ? 'Copied!' : label}
    >
      {copied ? (
        <>
          <span className="text-status-success">✓</span>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

// ── Error box ─────────────────────────────────────────────────────────────────
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-base leading-none mt-0.5">✕</span>
        <div className="flex-1">
          <p className="text-red-300">{message}</p>
          <p className="mt-1 text-dc1-text-muted text-xs">
            Need help?{' '}
            <a href="/support" className="text-dc1-amber hover:underline">Contact support</a>
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 min-h-[36px]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

// ── Primary/secondary button ──────────────────────────────────────────────────
export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean },
) {
  const { loading, children, disabled, className = '', ...rest } = props
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-bright transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-dc1-void border-t-transparent" />
      )}
      {children}
    </button>
  )
}

export function SecondaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { children, className = '', ...rest } = props
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-5 py-2.5 text-sm font-semibold text-dc1-text-primary hover:bg-dc1-surface-l3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── API helper ────────────────────────────────────────────────────────────────
// Single place to call the v1 backend. Centralises base URL resolution, auth
// header injection, and error normalisation so each step component stays terse.
const V1_BASE = process.env.NEXT_PUBLIC_DCP_API_BASE || '/v1'

export interface V1ErrorBody {
  error?: { code?: string; message?: string }
}

export class V1Error extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function v1Fetch<T = unknown>(
  path: string,
  opts: { method?: string; apiKey?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`

  const res = await fetch(`${V1_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  // 202 / 204 are valid empty-body responses; attempt JSON parse but tolerate
  // an empty body.
  let parsed: unknown = null
  try { parsed = await res.json() } catch { /* empty body */ }

  if (!res.ok) {
    const body = (parsed || {}) as V1ErrorBody
    throw new V1Error(
      res.status,
      body.error?.code || 'unknown_error',
      body.error?.message || `Request failed with status ${res.status}`,
    )
  }
  return parsed as T
}
