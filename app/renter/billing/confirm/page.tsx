'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Payment confirmation redirect page.
 *
 * Moyasar redirects here after payment with ?id=PAYMENT_ID&status=STATUS.
 * We forward to /renter/billing?payment=callback&id=...&status=... which
 * handles verification inline (single page for the whole billing flow).
 *
 * This page exists as a fallback for any old callback_url references that
 * point to /renter/billing/confirm.
 */
function ConfirmRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const paymentId = searchParams.get('id') || searchParams.get('payment_id') || ''
    const status = searchParams.get('status') || ''

    const params = new URLSearchParams()
    params.set('payment', 'callback')
    if (paymentId) params.set('id', paymentId)
    if (status) params.set('status', status)

    router.replace(`/renter/billing?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-dc1-bg-primary flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-dc1-accent-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-dc1-text-secondary text-sm">Redirecting to billing...</p>
      </div>
    </div>
  )
}

export default function PaymentConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dc1-bg-primary flex items-center justify-center">
        <p className="text-dc1-text-secondary">Loading...</p>
      </div>
    }>
      <ConfirmRedirect />
    </Suspense>
  )
}
