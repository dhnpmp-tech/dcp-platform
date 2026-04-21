'use client'

// Legacy provider registration entry point.
//
// Provider registration is now Step 1 of the unified six-step wizard at
// /setup (see app/setup/page.tsx). This page forwards any remaining
// /provider/onboard traffic there.
//
// Preserves query params so any deep links carrying tracking/ref params
// still land correctly.

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RedirectInner() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const qs = params.toString()
    router.replace(qs ? `/setup?${qs}` : '/setup')
  }, [router, params])

  return (
    <p className="text-dc1-text-secondary text-sm">Redirecting to /setup…</p>
  )
}

export default function ProviderOnboardRedirect() {
  return (
    <div className="min-h-screen bg-dc1-void flex items-center justify-center">
      <Suspense
        fallback={<p className="text-dc1-text-secondary text-sm">Redirecting…</p>}
      >
        <RedirectInner />
      </Suspense>
    </div>
  )
}
