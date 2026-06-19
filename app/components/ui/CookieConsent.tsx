'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '../../lib/i18n'

type ConsentValue = 'accepted' | 'declined'

// On-brand cookie banner restyled to the new editorial-luxury "Midnight" design
// system. It renders on legacy v1 routes where dcp-kit.css is NOT in scope, so
// the Midnight tokens are applied via inline styles (values mirror
// app/(site)/styles/dcp-kit.css :root) — no dc1-* classes, no legacy btn
// classes. The consent persistence (localStorage `dcp_consent`) is unchanged.
const MIDNIGHT = {
  bg: '#0a0b1a',
  paper: '#161834',
  ink: '#f5f3ee',
  ink2: '#c9c5bd',
  line: '#272848',
  teal: '#2dd4b6',
} as const

export default function CookieConsent() {
  const { language } = useLanguage()
  const [ready, setReady] = useState(false)
  const [consent, setConsent] = useState<ConsentValue | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dcp_consent')
      if (stored === 'accepted' || stored === 'declined') {
        setConsent(stored)
      }
    } catch (_) {
      // Ignore localStorage errors and keep banner hidden.
    } finally {
      setReady(true)
    }
  }, [])

  const saveConsent = (next: ConsentValue) => {
    try {
      localStorage.setItem('dcp_consent', next)
    } catch (_) {
      // Ignore storage errors in private browsing modes.
    }
    setConsent(next)
  }

  if (!ready || consent) return null

  const isAr = language === 'ar'
  const title = isAr ? 'إشعار ملفات تعريف الارتباط' : 'Cookie Notice'
  const body = isAr
    ? 'نستخدم ملفات تعريف الارتباط الأساسية لتسجيل الدخول والأمان. لا نستخدم ملفات تتبع حالياً. يمكنك قبول أو رفض ملفات التحليلات (عند تفعيلها مستقبلاً).'
    : 'We use essential cookies for login and security. We do not currently use tracking cookies. You can accept or decline analytics cookies if enabled in the future.'
  const acceptLabel = isAr ? 'قبول' : 'Accept'
  const declineLabel = isAr ? 'رفض' : 'Decline'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4"
      dir={isAr ? 'rtl' : 'ltr'}
      role="region"
      aria-label={title}
    >
      <div
        className="mx-auto flex max-w-5xl flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between"
        style={{
          background: MIDNIGHT.paper,
          border: `1px solid ${MIDNIGHT.line}`,
          borderRadius: 4,
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.7)',
          fontFamily:
            "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div className="space-y-1.5">
          <p
            className="text-sm font-semibold"
            style={{ color: MIDNIGHT.ink, letterSpacing: '-0.01em' }}
          >
            {title}
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: MIDNIGHT.ink2, maxWidth: '60ch' }}
          >
            {body}
          </p>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={() => saveConsent('declined')}
            className="text-sm font-medium transition-colors"
            style={{
              minHeight: 40,
              padding: '8px 18px',
              borderRadius: 2,
              border: `1px solid ${MIDNIGHT.line}`,
              background: 'transparent',
              color: MIDNIGHT.ink2,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = MIDNIGHT.ink
              e.currentTarget.style.color = MIDNIGHT.ink
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = MIDNIGHT.line
              e.currentTarget.style.color = MIDNIGHT.ink2
            }}
          >
            {declineLabel}
          </button>
          <button
            type="button"
            onClick={() => saveConsent('accepted')}
            className="text-sm font-semibold transition-transform"
            style={{
              minHeight: 40,
              padding: '8px 20px',
              borderRadius: 2,
              border: `1px solid ${MIDNIGHT.ink}`,
              background: MIDNIGHT.ink,
              color: MIDNIGHT.bg,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
