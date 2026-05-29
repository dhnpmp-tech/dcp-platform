'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'

interface AttemptStatus {
  attempt_id: string
  status: 'initiated' | '3ds_required' | 'paid' | 'failed' | 'capped' | 'paused'
  amount_sar: number | null
  balance_after_sar: number | null
  error_message: string | null
  completed_at: string | null
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 15 // 30s total

/**
 * Auto-top-up 3DS callback landing page.
 *
 * Renter lands here after completing 3D Secure step-up on Moyasar's hosted
 * page. Polls `/api/payments/auto-topup-attempts/:id/status` and shows a
 * tailored UI per terminal state:
 *
 *   paid              → ✓ confirmation + new balance + CTA to /renter/billing
 *   failed            → ✗ failure reason + retry + contact-support CTA
 *   3ds_required /
 *   initiated         → loading spinner (Moyasar's webhook might trail the
 *                       redirect by a few seconds)
 *   timeout           → polite "we're checking" + manual refresh CTA
 *   not found         → invalid / expired link CTA
 *
 * No auth required. The status endpoint returns minimal data, no PII.
 */
function AutoTopupCallbackInner() {
  const params = useSearchParams()
  const attemptId = params.get('attempt_id')
  const moyasarStatus = (params.get('status') || '').toLowerCase()

  const [data, setData] = useState<AttemptStatus | null>(null)
  const [error, setError] = useState<'invalid_link' | 'not_found' | 'network' | 'timeout' | null>(null)
  const [pollCount, setPollCount] = useState(0)

  const fetchStatus = useCallback(async (): Promise<boolean> => {
    if (!attemptId) {
      setError('invalid_link')
      return true
    }
    try {
      const res = await fetch(`/api/payments/auto-topup-attempts/${encodeURIComponent(attemptId)}/status`, {
        cache: 'no-store',
      })
      if (res.status === 404) {
        setError('not_found')
        return true
      }
      if (!res.ok) return false
      const body: AttemptStatus = await res.json()
      setData(body)
      // Stop polling once terminal
      if (body.status === 'paid' || body.status === 'failed') return true
      return false
    } catch {
      return false
    }
  }, [attemptId])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled) return
      const done = await fetchStatus()
      if (done || cancelled) return
      setPollCount((n) => {
        const next = n + 1
        if (next >= MAX_POLL_ATTEMPTS) {
          setError('timeout')
          return next
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS)
        return next
      })
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [fetchStatus])

  // Banner classes per state
  const isSuccess = data?.status === 'paid'
  const isFailure = data?.status === 'failed' || error === 'not_found' || error === 'invalid_link'
  const isPending = !data && !error
  const isTimeout = error === 'timeout'

  return (
    <div className="min-h-screen flex flex-col bg-dc1-void">
      <Header />
      <main className="flex-1">
        <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Pending */}
          {isPending && (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full border-4 border-dc1-amber/30 border-t-dc1-amber animate-spin mb-6" />
              <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Confirming your top-up&hellip;</h1>
              <p className="text-sm text-dc1-text-secondary">
                We&rsquo;re waiting for Moyasar to confirm the 3D Secure verification. This usually takes a few seconds.
              </p>
            </div>
          )}

          {/* Paid */}
          {isSuccess && (
            <div className="rounded-xl border border-status-success/40 bg-status-success/5 p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-status-success/15 flex items-center justify-center text-status-success mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Auto-top-up complete</h1>
              <p className="text-sm text-dc1-text-secondary mb-6">
                We charged your card on file for{' '}
                <strong className="text-dc1-text-primary">{data!.amount_sar?.toFixed(2)} SAR</strong>.
                {data!.balance_after_sar != null && (
                  <>
                    {' '}Your new DCP balance is{' '}
                    <strong className="text-dc1-text-primary">{data!.balance_after_sar.toFixed(2)} SAR</strong>.
                  </>
                )}
              </p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/renter/billing"
                  className="px-5 py-2 rounded-lg bg-dc1-amber text-dc1-void text-sm font-semibold hover:bg-dc1-amber/90 transition-colors"
                >
                  View billing
                </Link>
                <Link
                  href="/renter"
                  className="px-5 py-2 rounded-lg border border-dc1-border text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          )}

          {/* Failed (Moyasar reported failure, or 4xx from our status endpoint) */}
          {isFailure && (
            <div className="rounded-xl border border-status-error/40 bg-status-error/5 p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-status-error/15 flex items-center justify-center text-status-error mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">
                {error === 'invalid_link' ? 'Invalid link' :
                 error === 'not_found' ? 'Couldn\'t find this top-up' :
                 'Auto-top-up failed'}
              </h1>
              <p className="text-sm text-dc1-text-secondary mb-3">
                {error === 'invalid_link' && (
                  'This page expects an attempt_id query parameter. The link from your email may have been truncated.'
                )}
                {error === 'not_found' && (
                  'We couldn\'t find a record for this top-up. The link may have expired or been used already.'
                )}
                {data?.status === 'failed' && (
                  <>
                    Your card was declined or 3D Secure verification was abandoned.
                    {data.error_message && (
                      <> Bank reason: <span className="text-status-error font-mono text-xs">{data.error_message}</span></>
                    )}
                  </>
                )}
                {moyasarStatus === 'failed' && !data && (
                  'Your card was declined or 3D Secure verification failed.'
                )}
              </p>
              <p className="text-xs text-dc1-text-muted mb-6">
                Your DCP balance was not charged.
              </p>
              <div className="flex justify-center gap-3 flex-wrap">
                <Link
                  href="/renter/billing"
                  className="px-5 py-2 rounded-lg bg-dc1-amber text-dc1-void text-sm font-semibold hover:bg-dc1-amber/90 transition-colors"
                >
                  Try a manual top-up
                </Link>
                <a
                  href="mailto:billing@dcp.sa"
                  className="px-5 py-2 rounded-lg border border-dc1-border text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                >
                  Contact billing
                </a>
              </div>
            </div>
          )}

          {/* Timeout — Moyasar's webhook hasn't reached us yet */}
          {isTimeout && (
            <div className="rounded-xl border border-dc1-amber/40 bg-dc1-amber/5 p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-dc1-amber/15 flex items-center justify-center text-dc1-amber mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Still checking with the bank</h1>
              <p className="text-sm text-dc1-text-secondary mb-3">
                Moyasar hasn&rsquo;t confirmed the charge yet. This is normal &mdash; banks occasionally take a minute
                or two to settle 3D Secure verifications.
              </p>
              <p className="text-xs text-dc1-text-muted mb-6">
                You&rsquo;ll get an email confirmation as soon as the charge clears (or an explanation if it fails).
                There&rsquo;s no need to retry from this page.
              </p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/renter/billing"
                  className="px-5 py-2 rounded-lg bg-dc1-amber text-dc1-void text-sm font-semibold hover:bg-dc1-amber/90 transition-colors"
                >
                  Check billing history
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setPollCount(0)
                    setData(null)
                    void fetchStatus()
                  }}
                  className="px-5 py-2 rounded-lg border border-dc1-border text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                >
                  Check again
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}

export default function AutoTopupCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-4 border-dc1-amber/30 border-t-dc1-amber animate-spin" />
        </div>
      }
    >
      <AutoTopupCallbackInner />
    </Suspense>
  )
}
