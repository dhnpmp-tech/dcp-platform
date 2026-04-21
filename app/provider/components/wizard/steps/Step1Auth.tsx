'use client'

// Step 1: Welcome + Sign Up / Sign In.
//
// DCP auth is magic-link. Backend /v1/auth/{register,login} both call
// Supabase signInWithOtp → user clicks email link → Supabase returns an
// access_token which we POST to /v1/auth/session to resolve to a DCP api_key.
//
// From this step's perspective the flow is "collect email → request
// magic-link → tell the user to check their inbox". Credentials return to
// the wizard asynchronously via the /auth/callback page (Step 1.5).

import { useState } from 'react'
import { ErrorBox, PrimaryButton, v1Fetch, V1Error } from '../primitives'

interface Step1AuthProps {
  onEmailSent: (email: string, mode: 'register' | 'login') => void
}

export function Step1Auth({ onEmailSent }: Step1AuthProps) {
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const trimmed = email.trim()
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await v1Fetch(
        mode === 'register' ? '/auth/register' : '/auth/login',
        {
          method: 'POST',
          body: mode === 'register'
            ? { email: trimmed, role: 'provider', display_name: displayName.trim() || undefined }
            : { email: trimmed },
        },
      )
      setSent(true)
      onEmailSent(trimmed, mode)
    } catch (e) {
      const msg = e instanceof V1Error ? e.message : 'Could not send magic link. Please try again.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-8 text-center">
        <div className="text-5xl">📬</div>
        <h2 className="text-xl font-bold text-dc1-text-primary">Check your email</h2>
        <p className="text-sm text-dc1-text-secondary">
          We sent a magic link to <strong>{trimmed}</strong>. Click it to continue.
        </p>
        <p className="text-xs text-dc1-text-muted">
          Link expires in 1 hour. Didn&apos;t get it? Check spam, or{' '}
          <button
            type="button"
            onClick={() => { setSent(false); setError(null) }}
            className="text-dc1-amber hover:underline"
          >
            try a different email
          </button>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <div className="text-center">
          <div className="mb-2 text-4xl">🖥️</div>
          <h2 className="text-2xl font-bold text-dc1-text-primary">
            Turn Your GPU Into Income
          </h2>
          <p className="mt-2 text-sm text-dc1-text-secondary">
            DCP connects your idle GPU to AI workloads. Earn while your machine sits idle.
          </p>
        </div>
      </div>

      <div className="flex rounded-lg border border-dc1-border bg-dc1-surface-l2 p-1">
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'register'
              ? 'bg-dc1-amber text-dc1-void'
              : 'text-dc1-text-secondary hover:text-dc1-text-primary'
          }`}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'login'
              ? 'bg-dc1-amber text-dc1-void'
              : 'text-dc1-text-secondary hover:text-dc1-text-primary'
          }`}
        >
          Sign in
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
          Email
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="mt-1 block w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2.5 text-sm text-dc1-text-primary placeholder:text-dc1-text-muted focus:border-dc1-amber focus:outline-none"
          />
        </label>

        {mode === 'register' && (
          <label className="block text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
            Display name <span className="font-normal normal-case text-dc1-text-muted">(optional)</span>
            <input
              type="text"
              autoComplete="name"
              placeholder="Ahmad"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2.5 text-sm text-dc1-text-primary placeholder:text-dc1-text-muted focus:border-dc1-amber focus:outline-none"
            />
          </label>
        )}
      </div>

      {error && <ErrorBox message={error} onRetry={submit} />}

      <PrimaryButton
        onClick={submit}
        disabled={!valid}
        loading={busy}
        className="w-full"
      >
        {mode === 'register' ? 'Send sign-up link' : 'Send sign-in link'}
      </PrimaryButton>

      <p className="text-center text-xs text-dc1-text-muted">
        We&apos;ll email you a link. No password required.
      </p>
    </div>
  )
}
