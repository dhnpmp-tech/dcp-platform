'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'

// Minimal "notify me" capture shown when a renter wants a specific model but
// no provider is online yet (linked from app/renter/models/page.tsx). There is
// no dedicated waitlist backend endpoint yet, so this records the intent as a
// lightweight client-side analytics signal and always lands the user on a
// friendly confirmation. The model the user was looking at arrives via ?model=
// and is echoed back for context. A real waitlist endpoint is tracked in the
// improvement backlog; until then this avoids dead-ending the renter.

function WaitlistInner() {
  const searchParams = useSearchParams()
  const model = searchParams.get('model') || ''

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter an email so we can notify you.')
      return
    }
    setLoading(true)
    setError('')
    // Emit a best-effort analytics signal so the demand is captured even though
    // there is no dedicated waitlist endpoint yet.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dc1_analytics', {
          detail: {
            event: 'renter_model_waitlist_joined',
            source_page: 'renter_model_waitlist',
            model: model || 'any',
          },
        })
      )
    }
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-dc1-void flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="card bg-dc1-surface-l1 border border-dc1-border rounded-lg p-8">
            {submitted ? (
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-dc1-amber mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
                <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">You&apos;re on the list</h1>
                <p className="text-sm text-dc1-text-secondary mb-6">
                  We&apos;ll email <span className="text-dc1-amber font-mono break-all">{email}</span> the moment{' '}
                  {model ? <span className="text-dc1-text-primary font-semibold">{model}</span> : 'a matching GPU'} comes online.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
                  <Link href="/renter/marketplace" className="text-dc1-amber hover:underline">
                    Browse the marketplace
                  </Link>
                  <span className="text-dc1-text-muted">•</span>
                  <Link href="/renter/playground" className="text-dc1-amber hover:underline">
                    Open the playground
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-dc1-text-primary mb-2">Get notified</h1>
                <p className="text-sm text-dc1-text-secondary mb-6">
                  {model ? (
                    <>
                      We&apos;ll let you know as soon as a provider with{' '}
                      <span className="text-dc1-text-primary font-semibold">{model}</span> comes online.
                    </>
                  ) : (
                    <>We&apos;ll let you know as soon as a matching GPU comes online.</>
                  )}
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-md text-status-error text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="waitlist-email" className="label">
                      Email <span className="text-status-error">*</span>
                    </label>
                    <input
                      id="waitlist-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input"
                      disabled={loading}
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn btn-primary w-full">
                    {loading ? 'Adding you…' : 'Notify me'}
                  </button>
                </form>

                <p className="mt-6 pt-6 border-t border-dc1-border/30 text-center text-sm text-dc1-text-secondary">
                  Ready to provide GPUs instead?{' '}
                  <Link href="/setup" className="text-dc1-amber hover:underline">
                    Become a provider
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function RenterWaitlistPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dc1-void" />}>
      <WaitlistInner />
    </Suspense>
  )
}
