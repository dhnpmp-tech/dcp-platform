'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSession } from '../../lib/auth'

const API_BASE = '/api'

/**
 * /auth/callback — handles Supabase magic link redirects.
 *
 * After the user clicks the magic link in their email, Supabase verifies
 * the token and redirects here with session tokens in the URL hash:
 *   /auth/callback#access_token=...&refresh_token=...&type=email
 *
 * We extract the access_token, exchange it via our backend for the user's
 * DCP API key, store credentials, and redirect to the appropriate dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      try {
        // Parse hash fragment — Supabase puts tokens there
        const hash = window.location.hash.substring(1) // remove leading #
        if (!hash) {
          setStatus('error')
          setErrorMsg('No authentication data received. Please try logging in again.')
          return
        }

        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')

        if (!accessToken) {
          setStatus('error')
          setErrorMsg('No access token found. The magic link may have expired.')
          return
        }

        // Exchange the Supabase access token for a DCP API key
        const res = await fetch(`${API_BASE}/auth/magic-link-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to complete login')
        }

        const data = await res.json()

        if (!data.success || !data.api_key) {
          throw new Error('Login exchange failed — no API key returned')
        }

        // Store credentials and redirect based on role
        if (data.role === 'renter') {
          localStorage.setItem('dc1_renter_key', data.api_key)
          await setSession({
            role: 'renter',
            userName: data.renter?.name,
            email: data.renter?.email,
          })
          router.replace('/renter/marketplace')
        } else if (data.role === 'provider') {
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
        } else {
          throw new Error('Unknown account role')
        }
      } catch (err) {
        console.error('[auth/callback] Error:', err)
        setStatus('error')
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Authentication failed. Please try logging in again.'
        )
      }
    }

    handleCallback()
  }, [router])

  if (status === 'error') {
    return (
      <div className="flex flex-col min-h-screen bg-dc1-void items-center justify-center px-4">
        <div className="w-full max-w-md card border-dc1-border/50 shadow-lg text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-dc1-text-primary mb-2">Login Failed</h1>
          <p className="text-sm text-dc1-text-secondary mb-6">{errorMsg}</p>
          <a
            href="/login"
            className="btn btn-primary inline-block"
          >
            Back to Login
          </a>
        </div>
      </div>
    )
  }

  // Processing state — show spinner
  return (
    <div className="flex flex-col min-h-screen bg-dc1-void items-center justify-center px-4">
      <div className="w-full max-w-md card border-dc1-border/50 shadow-lg text-center">
        <div className="mb-4">
          <svg className="w-10 h-10 mx-auto text-dc1-amber animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-dc1-text-primary mb-2">Completing Login</h1>
        <p className="text-sm text-dc1-text-secondary">Verifying your magic link...</p>
      </div>
    </div>
  )
}
