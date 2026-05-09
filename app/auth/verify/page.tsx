'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setSession } from '../../lib/auth'

// /auth/verify?token=... — the destination of the magic link in the email.
// Reads the token, exchanges it for an API key + role via /api/auth/magic-link,
// stores the session, and redirects to the appropriate dashboard.
//
// This is the only sign-in path. There is no 6-digit code anywhere in the
// user-visible flow (state-of-the-art passwordless, GitHub/Anthropic style).

const API_BASE = '/api'

function VerifyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function run() {
      const token = searchParams.get('token')
      if (!token) {
        setStatus('error')
        setErrorMsg('This sign-in link is missing a token. Please request a new link.')
        return
      }

      // The login page persists the role the user picked, so /auth/verify
      // redirects to the right dashboard when both roles exist for one email.
      let prefer: 'provider' | 'renter' | undefined = undefined
      try {
        const stored = sessionStorage.getItem('dcp_login_prefer_role')
        if (stored === 'provider' || stored === 'renter') prefer = stored
      } catch { /* ignore */ }

      try {
        const res = await fetch(`${API_BASE}/auth/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, prefer }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.success || !data.api_key) {
          throw new Error(data.error || 'This sign-in link is invalid or has expired.')
        }

        // Store credentials by role
        if (data.role === 'renter') {
          localStorage.setItem('dc1_renter_key', data.api_key)
          await setSession({
            role: 'renter',
            userName: data.renter?.name,
            email: data.renter?.email,
          })
          router.replace('/renter/marketplace')
          return
        }

        if (data.role === 'provider') {
          localStorage.setItem('dc1_provider_key', data.api_key)
          await setSession({
            role: 'provider',
            userName: data.provider?.name,
            email: data.provider?.email,
          })
          // If the user started in the /setup wizard, return them there
          // instead of the generic /provider dashboard.
          let next = '/provider'
          try {
            const pending = sessionStorage.getItem('dcp_wizard_redirect_after_auth')
            if (pending && pending.startsWith('/')) next = pending
          } catch { /* ignore */ }
          router.replace(next)
          return
        }

        throw new Error('Unknown account role returned by server.')
      } catch (err) {
        console.error('[auth/verify] error:', err)
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
      }
    }

    run()
  }, [router, searchParams])

  if (status === 'error') {
    return (
      <div className="flex flex-col min-h-screen bg-dc1-void items-center justify-center px-4">
        <div className="w-full max-w-md card border-dc1-border/50 shadow-lg text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-dc1-text-primary mb-2">Sign-in link didn&apos;t work</h1>
          <p className="text-sm text-dc1-text-secondary mb-6">{errorMsg}</p>
          <a href="/login" className="btn btn-primary inline-block">Request a new link</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-dc1-void items-center justify-center px-4">
      <div className="w-full max-w-md card border-dc1-border/50 shadow-lg text-center">
        <div className="mb-4">
          <svg className="w-10 h-10 mx-auto text-dc1-amber animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-dc1-text-primary mb-2">Signing you in</h1>
        <p className="text-sm text-dc1-text-secondary">Verifying your sign-in link…</p>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dc1-void" />}>
      <VerifyPageInner />
    </Suspense>
  )
}
