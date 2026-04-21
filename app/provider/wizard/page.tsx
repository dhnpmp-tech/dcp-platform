'use client'

// Legacy provider activation wizard entry point.
//
// The 6-step activation flow lives at /setup (see app/setup/page.tsx) as of
// v4.1.0. This page forwards any lingering /provider/wizard traffic — deep
// links, bookmarks, docs — to the canonical URL.
//
// Preserves query params so magic-link callbacks still land on the wizard
// with their providerId / apiKey intact.

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

export default function ProviderWizardRedirect() {
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
