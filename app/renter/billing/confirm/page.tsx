'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/layout/DashboardLayout'

const API_BASE = '/api'

// ── Nav Icons ──────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const navItems = [
  { label: 'Dashboard', href: '/renter', icon: <HomeIcon /> },
  { label: 'Marketplace', href: '/renter/marketplace', icon: <MarketplaceIcon /> },
  { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
  { label: 'Playground', href: '/renter/playground', icon: <PlaygroundIcon /> },
  { label: 'Jobs', href: '/renter/jobs', icon: <JobsIcon /> },
  { label: 'Billing', href: '/renter/billing', icon: <BillingIcon /> },
  { label: 'Analytics', href: '/renter/analytics', icon: <ChartIcon /> },
  { label: 'Settings', href: '/renter/settings', icon: <GearIcon /> },
]

type VerifyStatus = 'polling' | 'paid' | 'failed' | 'timeout'

function PaymentConfirmPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<VerifyStatus>('polling')
  const [attempt, setAttempt] = useState(0)

  const paymentId = searchParams.get('id') || searchParams.get('payment_id')

  useEffect(() => {
    const key = localStorage.getItem('dc1_renter_key')
    if (!key) { router.push('/login'); return }
    if (!paymentId) { setStatus('failed'); return }

    const MAX_RETRIES = 10
    let retryCount = 0
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`${API_BASE}/payments/verify/${paymentId}`, {
          headers: { 'x-renter-key': key },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'paid') {
            if (!cancelled) setStatus('paid')
            return
          }
        }
      } catch {
        // network error — keep polling
      }

      retryCount++
      if (!cancelled) setAttempt(retryCount)

      if (retryCount >= MAX_RETRIES) {
        if (!cancelled) setStatus('timeout')
        return
      }

      setTimeout(poll, 2000)
    }

    poll()
    return () => { cancelled = true }
  }, [paymentId, router])

  return (
    <DashboardLayout navItems={navItems} role="renter" userName="">
      <div className="max-w-lg mx-auto py-16 text-center">
        {status === 'polling' && (
          <div>
            <div className="w-16 h-16 rounded-full bg-dc1-amber/10 border-2 border-dc1-amber/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg className="w-8 h-8 text-dc1-amber animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Verifying Payment</h1>
            <p className="text-dc1-text-secondary mb-4">
              Confirming your payment...
            </p>
            <p className="text-sm text-dc1-text-muted">
              Attempt {attempt + 1} of 10
            </p>
          </div>
        )}

        {status === 'paid' && (
          <div>
            <div className="w-16 h-16 rounded-full bg-status-success/10 border-2 border-status-success/30 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Payment Successful!</h1>
            <p className="text-dc1-text-secondary mb-8">
              Your balance has been updated. You can now submit GPU jobs.
            </p>
            <Link href="/renter/billing" className="btn btn-primary">
              Back to Billing
            </Link>
          </div>
        )}

        {(status === 'failed' || status === 'timeout') && (
          <div>
            <div className="w-16 h-16 rounded-full bg-status-error/10 border-2 border-status-error/30 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Payment Not Completed</h1>
            <p className="text-dc1-text-secondary mb-8">
              {status === 'timeout'
                ? 'We could not confirm your payment in time. If you completed the payment, your balance will update shortly.'
                : 'The payment was not completed or could not be verified.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/renter/billing" className="btn btn-primary">
                Try Again
              </Link>
              <Link href="/renter" className="btn btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function PaymentConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dc1-void flex items-center justify-center"><p className="text-dc1-text-secondary">Loading...</p></div>}>
      <PaymentConfirmPageInner />
    </Suspense>
  )
}
