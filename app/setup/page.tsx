'use client'

// /setup — DCP provider onboarding wizard entry point.
//
// URL matches the web-wizard-spec header ("URL: provider.dcp.sa/setup"). For
// dcp.sa (no subdomain yet) the same wizard mounts here.
//
// Flow:
//   1. Write a session flag so the shared /auth/callback page knows to
//      redirect back here after the user clicks the magic link.
//   2. Hydrate any existing provider credentials from localStorage (written
//      by /auth/callback on successful magic-link exchange).
//   3. Mount the WizardShell.

import { Suspense, useEffect, useState } from 'react'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { WizardShell } from '../provider/components/wizard/WizardShell'
import { saveSession } from '../provider/components/wizard/primitives'
import type { Credentials } from '../provider/components/wizard/types'

const WIZARD_RETURN_FLAG = 'dcp_wizard_redirect_after_auth'

function WizardPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Breadcrumb for /auth/callback: when the user clicks the magic link,
    // Supabase redirects to /auth/callback which will read this flag and
    // bounce them back here instead of /provider.
    try {
      sessionStorage.setItem(WIZARD_RETURN_FLAG, '/setup')
    } catch { /* ignore */ }

    // Legacy-link bootstrap: the old /provider/wizard accepted credentials as
    // query params (providerId/apiKey, plus snake_case variants). Middleware
    // now 308-redirects those URLs to /setup with the query string preserved.
    // Seed localStorage from any such params so users don't lose their session,
    // then strip the credentials from the URL so they don't linger in history.
    try {
      const sp = new URLSearchParams(window.location.search)
      const urlApiKey =
        sp.get('apiKey') ?? sp.get('api_key') ?? sp.get('providerKey')
      const urlEmail = sp.get('email')
      if (urlApiKey) {
        localStorage.setItem('dc1_provider_key', urlApiKey)
        if (urlEmail) {
          localStorage.setItem(
            'dc1_session',
            JSON.stringify({ email: urlEmail, role: 'provider' }),
          )
        }
        // Strip credential params (and optional email) from the URL without a reload.
        sp.delete('apiKey'); sp.delete('api_key'); sp.delete('providerKey')
        sp.delete('providerId'); sp.delete('provider_id'); sp.delete('email')
        const clean = sp.toString()
          ? `${window.location.pathname}?${sp.toString()}`
          : window.location.pathname
        window.history.replaceState({}, '', clean)
      }
    } catch { /* ignore */ }

    // Pick up credentials if the user has already completed magic-link auth.
    // localStorage key matches what /auth/callback writes today.
    try {
      const apiKey = localStorage.getItem('dc1_provider_key') || ''
      const rawSession = localStorage.getItem('dc1_session')
      let email = ''
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as { email?: string; role?: string }
        if (parsed?.role === 'provider') email = parsed.email || ''
      }
      if (apiKey) {
        setCredentials({ apiKey, email, role: 'provider' })
      }
    } catch { /* ignore */ }

    setHydrated(true)
  }, [])

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent" />
      </div>
    )
  }

  return (
    <WizardShell
      initialCredentials={credentials}
      onComplete={() => {
        // Clear the wizard session + return-flag on success.
        saveSession(WIZARD_RETURN_FLAG, null as unknown)
        try { sessionStorage.removeItem(WIZARD_RETURN_FLAG) } catch { /* ignore */ }
      }}
    />
  )
}

export default function SetupPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-dc1-void px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-dc1-text-primary">
              Become a DCP Provider
            </h1>
            <p className="mt-2 text-sm text-dc1-text-secondary">
              Six steps, under 15 minutes. Your GPU starts earning as soon as you finish.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent" />
              </div>
            }
          >
            <WizardPage />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  )
}
