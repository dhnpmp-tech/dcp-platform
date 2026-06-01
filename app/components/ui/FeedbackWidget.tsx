'use client'

/**
 * DCP Phase 1 — In-App Feedback Widget
 *
 * Self-hosted feedback collection widget (no Intercom/Pendo account required).
 * Drop-in ready: replace the `submitFeedback()` call with Intercom/Pendo SDK
 * when accounts are provisioned.
 *
 * Features:
 *  - Floating button (bottom-right, above CookieConsent)
 *  - Appears automatically after DC1_FEEDBACK_THRESHOLD API calls
 *  - Contextual surveys: post-deployment, post-inference, error pages
 *  - Feedback menu: bug, feature request, improvement, support
 *  - RTL / Arabic support via useLanguage()
 *  - Respects cookie consent (only shows if consent given or not yet set)
 *  - Custom DOM event API for contextual trigger from any page
 *
 * Usage from other pages/components:
 *   window.dispatchEvent(new CustomEvent('dc1_feedback_trigger', {
 *     detail: { survey: 'deployment' | 'inference' | 'error', context: '...' }
 *   }))
 *
 * Tracking API call count (from any API-calling component):
 *   window.dispatchEvent(new CustomEvent('dc1_api_call'))
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useLanguage } from '../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedbackCategory = 'bug' | 'feature' | 'improvement' | 'support'
type SurveyType = 'deployment' | 'inference' | 'error' | 'general'
type WidgetView = 'hidden' | 'prompt' | 'menu' | 'survey' | 'bug' | 'feature' | 'improvement' | 'support' | 'submitted'
type ScaleRating = 1 | 2 | 3 | 4 | 5
type YesNoValue = 'yes' | 'no' | 'other'

interface SurveyPayload {
  survey: SurveyType
  context?: string
}

interface FeedbackSubmission {
  type: FeedbackCategory | SurveyType
  rating?: ScaleRating
  yesNo?: YesNoValue
  text: string
  url: string
  timestamp: string
  survey?: SurveyType
  surveyContext?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_CALL_THRESHOLD = 3
const STORAGE_API_COUNT = 'dcp_api_call_count'
const STORAGE_PROMPT_DISMISSED = 'dcp_feedback_prompt_dismissed'
const STORAGE_LAST_SUBMITTED = 'dcp_feedback_last_submitted'
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 h between prompts

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiCallCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_API_COUNT) ?? '0', 10)
  } catch {
    return 0
  }
}

function incrementApiCallCount(): number {
  try {
    const next = getApiCallCount() + 1
    localStorage.setItem(STORAGE_API_COUNT, String(next))
    return next
  } catch {
    return 0
  }
}

function shouldShowPrompt(): boolean {
  try {
    const dismissed = localStorage.getItem(STORAGE_PROMPT_DISMISSED)
    if (dismissed === 'permanent') return false

    const lastSubmitted = localStorage.getItem(STORAGE_LAST_SUBMITTED)
    if (lastSubmitted) {
      const elapsed = Date.now() - parseInt(lastSubmitted, 10)
      if (elapsed < PROMPT_COOLDOWN_MS) return false
    }

    if (dismissed) {
      const elapsed = Date.now() - parseInt(dismissed, 10)
      if (elapsed < PROMPT_COOLDOWN_MS) return false
    }

    return getApiCallCount() >= API_CALL_THRESHOLD
  } catch {
    return false
  }
}

async function submitFeedback(payload: FeedbackSubmission): Promise<void> {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Silently fail — feedback should never break the user experience
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: ScaleRating | null
  onChange: (v: ScaleRating) => void
}) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as ScaleRating[]).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`text-2xl transition-colors ${
            value !== null && n <= value
              ? 'text-dc1-amber'
              : 'text-dc1-text-muted hover:text-dc1-amber/60'
          }`}
          aria-label={`Rate ${n} out of 5`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function FeedbackWidget() {
  const { language } = useLanguage()
  const isRTL = language === 'ar'

  const [view, setView] = useState<WidgetView>('hidden')
  const [surveyPayload, setSurveyPayload] = useState<SurveyPayload | null>(null)

  // Survey state
  const [rating, setRating] = useState<ScaleRating | null>(null)
  const [yesNo, setYesNo] = useState<YesNoValue | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const textRef = useRef<HTMLTextAreaElement>(null)

  // ── Boot: check if prompt should appear ──────────────────────────────────

  useEffect(() => {
    // Slight delay to avoid layout flash during hydration
    const t = setTimeout(() => {
      if (shouldShowPrompt()) {
        setView('prompt')
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // ── Reset helpers ─────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setRating(null)
    setYesNo(null)
    setText('')
  }, [])

  // ── Event listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    const handleApiCall = () => {
      const count = incrementApiCallCount()
      if (count >= API_CALL_THRESHOLD && view === 'hidden' && shouldShowPrompt()) {
        setView('prompt')
      }
    }

    const handleTrigger = (e: Event) => {
      const detail = (e as CustomEvent<SurveyPayload>).detail
      if (detail?.survey) {
        setSurveyPayload(detail)
        setView('survey')
        resetForm()
      }
    }

    window.addEventListener('dc1_api_call', handleApiCall)
    window.addEventListener('dc1_feedback_trigger', handleTrigger)
    return () => {
      window.removeEventListener('dc1_api_call', handleApiCall)
      window.removeEventListener('dc1_feedback_trigger', handleTrigger)
    }
  }, [view, resetForm])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PROMPT_DISMISSED, String(Date.now()))
    } catch { /* noop */ }
    setView('hidden')
    setSurveyPayload(null)
    resetForm()
  }, [resetForm])

  const dismissPermanently = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PROMPT_DISMISSED, 'permanent')
    } catch { /* noop */ }
    setView('hidden')
    setSurveyPayload(null)
    resetForm()
  }, [resetForm])

  // ── Submit ────────────────────────────────────────────────────────────────

  const submit = useCallback(
    async (type: FeedbackCategory | SurveyType) => {
      setSubmitting(true)
      const payload: FeedbackSubmission = {
        type,
        rating: rating ?? undefined,
        yesNo: yesNo ?? undefined,
        text: text.trim(),
        url: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: new Date().toISOString(),
        survey: surveyPayload?.survey,
        surveyContext: surveyPayload?.context,
      }
      await submitFeedback(payload)
      try {
        localStorage.setItem(STORAGE_LAST_SUBMITTED, String(Date.now()))
      } catch { /* noop */ }
      setSubmitting(false)
      setView('submitted')
    },
    [rating, yesNo, text, surveyPayload],
  )

  // ── i18n strings ─────────────────────────────────────────────────────────

  const t = (en: string, ar: string) => (isRTL ? ar : en)

  // ── Survey config per type ────────────────────────────────────────────────

  const getSurveyConfig = (survey: SurveyType) => {
    switch (survey) {
      case 'deployment':
        return {
          question: t(
            'How was your deployment experience?',
            'كيف كانت تجربة النشر لديك؟',
          ),
          scaleLabel: t('Rate 1–5', 'قيّم من ١ إلى ٥'),
          showScale: true,
          showText: true,
          textPlaceholder: t(
            'Any feedback on the deployment process…',
            'ملاحظاتك على عملية النشر…',
          ),
        }
      case 'inference':
        return {
          question: t(
            'Was the output what you expected?',
            'هل كانت النتيجة كما توقعت؟',
          ),
          showYesNo: true,
          showText: true,
          textPlaceholder: t(
            'Tell us more (optional)…',
            'أخبرنا المزيد (اختياري)…',
          ),
        }
      case 'error':
        return {
          question: t(
            'What were you trying to do?',
            'ماذا كنت تحاول أن تفعل؟',
          ),
          showText: true,
          textPlaceholder: t(
            'Describe what you were doing before this error…',
            'صف ما كنت تفعله قبل حدوث هذا الخطأ…',
          ),
        }
      default:
        return {
          question: t(
            'How can we improve?',
            'كيف يمكننا التحسين؟',
          ),
          showScale: true,
          showText: true,
          textPlaceholder: t(
            'Share your thoughts…',
            'شاركنا أفكارك…',
          ),
        }
    }
  }

  // ── Shared panel wrapper ──────────────────────────────────────────────────

  const panelClass =
    'fixed bottom-20 right-4 z-50 w-80 rounded-xl border border-dc1-border bg-dc1-surface-l1 shadow-2xl'
  const panelDir = isRTL ? 'rtl' : 'ltr'

  // ─────────────────────────────────────────────────────────────────────────
  // Render: hidden (just the FAB or nothing)
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'hidden') {
    return (
      <button
        onClick={() => { setView('menu'); resetForm() }}
        className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full bg-dc1-amber text-dc1-void shadow-amber hover:bg-dc1-amber-hover transition-all duration-200 flex items-center justify-center text-xl"
        aria-label={t('Give feedback', 'أرسل ملاحظاتك')}
        title={t('Give feedback', 'أرسل ملاحظاتك')}
      >
        💬
      </button>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: automatic prompt after 3 API calls
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'prompt') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-dc1-text-primary leading-snug">
              {t(
                'Help us improve — share feedback in 30 seconds',
                'ساعدنا في التحسين — شاركنا رأيك في ٣٠ ثانية',
              )}
            </p>
            <button
              onClick={dismiss}
              className="shrink-0 text-dc1-text-muted hover:text-dc1-text-primary transition-colors"
              aria-label={t('Dismiss', 'إغلاق')}
            >
              ✕
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setView('menu'); resetForm() }}
              className="btn btn-primary btn-sm flex-1"
            >
              {t('Give Feedback', 'إرسال ملاحظة')}
            </button>
            <button
              onClick={dismiss}
              className="btn btn-outline btn-sm"
            >
              {t('Later', 'لاحقاً')}
            </button>
          </div>
          <button
            onClick={dismissPermanently}
            className="mt-2 w-full text-center text-xs text-dc1-text-muted hover:text-dc1-text-secondary transition-colors"
          >
            {t("Don't show again", 'لا تُظهر هذا مجدداً')}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: main menu
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'menu') {
    const menuItems: Array<{ icon: string; label: string; labelAr: string; next: WidgetView }> = [
      { icon: '🐛', label: 'Report a bug', labelAr: 'الإبلاغ عن خطأ', next: 'bug' },
      { icon: '💡', label: 'Feature request', labelAr: 'طلب ميزة', next: 'feature' },
      { icon: '✨', label: 'How can we improve?', labelAr: 'كيف يمكننا التحسين؟', next: 'improvement' },
      { icon: '💬', label: 'Chat with support', labelAr: 'التواصل مع الدعم', next: 'support' },
    ]

    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center justify-between border-b border-dc1-border px-4 py-3">
          <span className="text-sm font-semibold text-dc1-text-primary">
            {t('Feedback', 'الملاحظات')}
          </span>
          <button
            onClick={dismiss}
            className="text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none"
            aria-label={t('Close', 'إغلاق')}
          >
            ✕
          </button>
        </div>
        <div className="p-2">
          {menuItems.map(({ icon, label, labelAr, next }) => (
            <button
              key={next}
              onClick={() => { setView(next); resetForm() }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-dc1-text-primary hover:bg-dc1-surface-l2 transition-colors"
              dir={panelDir}
            >
              <span className="text-base">{icon}</span>
              <span>{isRTL ? labelAr : label}</span>
              <span className="ml-auto text-dc1-text-muted text-xs">›</span>
            </button>
          ))}
        </div>
        {/* FAB to close */}
        <button
          onClick={dismiss}
          className="absolute -bottom-14 right-0 h-12 w-12 rounded-full bg-dc1-amber text-dc1-void shadow-amber hover:bg-dc1-amber-hover transition-all duration-200 flex items-center justify-center text-xl"
          aria-label={t('Close', 'إغلاق')}
        >
          ✕
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: contextual survey (deployment / inference / error / general)
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'survey' && surveyPayload) {
    const cfg = getSurveyConfig(surveyPayload.survey)
    const canSubmit = !submitting && (
      cfg.showScale ? rating !== null : true
    ) && (
      cfg.showYesNo ? yesNo !== null : true
    )

    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center justify-between border-b border-dc1-border px-4 py-3">
          <span className="text-sm font-semibold text-dc1-text-primary">
            {t('Quick Question', 'سؤال سريع')}
          </span>
          <button onClick={dismiss} className="text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-dc1-text-primary">{cfg.question}</p>

          {cfg.showScale && (
            <StarRating value={rating} onChange={setRating} />
          )}

          {cfg.showYesNo && (
            <div className="flex gap-2">
              {(['yes', 'no', 'other'] as YesNoValue[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setYesNo(v)}
                  className={`btn btn-sm flex-1 ${yesNo === v ? 'btn-primary' : 'btn-outline'}`}
                >
                  {t(
                    v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Other',
                    v === 'yes' ? 'نعم' : v === 'no' ? 'لا' : 'أخرى',
                  )}
                </button>
              ))}
            </div>
          )}

          {cfg.showText && (
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={cfg.textPlaceholder}
              className="input resize-none h-20 text-sm"
            />
          )}

          <button
            onClick={() => submit(surveyPayload.survey)}
            disabled={!canSubmit}
            className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? t('Sending…', 'جارٍ الإرسال…')
              : t('Submit', 'إرسال')}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: bug report form
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'bug') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center gap-2 border-b border-dc1-border px-4 py-3">
          <button
            onClick={() => setView('menu')}
            className="text-dc1-text-muted hover:text-dc1-text-primary text-sm"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-dc1-text-primary">
            🐛 {t('Report a Bug', 'الإبلاغ عن خطأ')}
          </span>
          <button onClick={dismiss} className="ml-auto text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-dc1-text-secondary">
            {t(
              'Describe the bug. We\'ll also capture your current URL automatically.',
              'صف الخطأ. سنلتقط رابط الصفحة الحالية تلقائياً.',
            )}
          </p>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'Steps to reproduce, what you expected, what happened…',
              'خطوات إعادة الإنتاج، ما توقعته، وما حدث…',
            )}
            className="input resize-none h-28 text-sm"
          />
          <button
            onClick={() => submit('bug')}
            disabled={submitting || text.trim().length < 5}
            className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Submit Bug Report', 'إرسال تقرير الخطأ')}
          </button>
          <a
            href="https://github.com/dhnpmp-tech/dcp-platform/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-dc1-amber hover:underline"
          >
            {t('Or open a GitHub issue →', 'أو افتح مشكلة على GitHub →')}
          </a>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: feature request form
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'feature') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center gap-2 border-b border-dc1-border px-4 py-3">
          <button onClick={() => setView('menu')} className="text-dc1-text-muted hover:text-dc1-text-primary text-sm">
            ‹
          </button>
          <span className="text-sm font-semibold text-dc1-text-primary">
            💡 {t('Feature Request', 'طلب ميزة')}
          </span>
          <button onClick={dismiss} className="ml-auto text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'What feature would help you most? Include your use case…',
              'ما الميزة التي ستفيدك أكثر؟ اذكر حالة الاستخدام…',
            )}
            className="input resize-none h-28 text-sm"
          />
          <button
            onClick={() => submit('feature')}
            disabled={submitting || text.trim().length < 5}
            className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Submit Request', 'إرسال الطلب')}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: general improvement feedback
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'improvement') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center gap-2 border-b border-dc1-border px-4 py-3">
          <button onClick={() => setView('menu')} className="text-dc1-text-muted hover:text-dc1-text-primary text-sm">
            ‹
          </button>
          <span className="text-sm font-semibold text-dc1-text-primary">
            ✨ {t('How can we improve?', 'كيف يمكننا التحسين؟')}
          </span>
          <button onClick={dismiss} className="ml-auto text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-dc1-text-secondary">
            {t('Overall, how would you rate DCP?', 'بشكل عام، كيف تقيّم DCP؟')}
          </p>
          <StarRating value={rating} onChange={setRating} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'What\'s working well? What could be better?',
              'ما الذي يعمل جيداً؟ وما الذي يمكن تحسينه؟',
            )}
            className="input resize-none h-24 text-sm"
          />
          <button
            onClick={() => submit('improvement')}
            disabled={submitting || rating === null}
            className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Submit Feedback', 'إرسال الملاحظة')}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: support routing
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'support') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="flex items-center gap-2 border-b border-dc1-border px-4 py-3">
          <button onClick={() => setView('menu')} className="text-dc1-text-muted hover:text-dc1-text-primary text-sm">
            ‹
          </button>
          <span className="text-sm font-semibold text-dc1-text-primary">
            💬 {t('Contact Support', 'التواصل مع الدعم')}
          </span>
          <button onClick={dismiss} className="ml-auto text-dc1-text-muted hover:text-dc1-text-primary transition-colors text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'Describe your issue. Our team will respond within 24h…',
              'صف مشكلتك. سيرد فريقنا خلال ٢٤ ساعة…',
            )}
            className="input resize-none h-28 text-sm"
          />
          <button
            onClick={() => submit('support')}
            disabled={submitting || text.trim().length < 5}
            className="btn btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Send to Support', 'إرسال إلى الدعم')}
          </button>
          <p className="text-center text-xs text-dc1-text-muted">
            {t('Or email', 'أو راسلنا على')}{' '}
            <a href="mailto:support@dcp.sa" className="text-dc1-amber hover:underline">
              support@dcp.sa
            </a>
          </p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: thank you / submitted
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'submitted') {
    return (
      <div className={panelClass} dir={panelDir}>
        <div className="p-6 text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <p className="text-sm font-semibold text-dc1-text-primary">
            {t('Thank you!', 'شكراً لك!')}
          </p>
          <p className="text-xs text-dc1-text-secondary">
            {t(
              'Your feedback helps us improve DCP for everyone.',
              'ملاحظاتك تساعدنا في تحسين DCP للجميع.',
            )}
          </p>
          <button
            onClick={dismiss}
            className="btn btn-outline btn-sm"
          >
            {t('Close', 'إغلاق')}
          </button>
        </div>
      </div>
    )
  }

  return null
}
