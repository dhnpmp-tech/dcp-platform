'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { useLanguage } from '../lib/i18n'
import { setSession } from '../lib/auth'
import {
  consumePendingRenterAuthIntent,
  setRestoredRenterAuthIntent,
  withRenterIntentInPath,
} from '../lib/renter-auth-intent'

// Magic-link-only sign-in (state-of-the-art passwordless, GitHub/Anthropic
// style). The user enters their email, we send a single sign-in link, and
// the click on the link itself authenticates them via /auth/verify. No code
// field, no second step.
const API_BASE = '/api'

type Role = 'provider' | 'renter' | 'admin'
type LoginMethod = 'email' | 'apikey'
type AuthStep = 'email' | 'sent'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()

  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [role, setRole] = useState<Role>('renter')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email')
  const [authStep, setAuthStep] = useState<AuthStep>('email')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const getSafeRedirect = (fallback: string) => {
    const redirectParam = searchParams.get('redirect')
    if (!redirectParam) return fallback
    if (!redirectParam.startsWith('/') || redirectParam.startsWith('//')) return fallback
    return redirectParam
  }

  const getRenterPostLoginRedirect = () => {
    const defaultRedirect = getSafeRedirect('/renter')
    if (typeof window === 'undefined') return defaultRedirect
    const intent = consumePendingRenterAuthIntent()
    if (!intent) return defaultRedirect
    setRestoredRenterAuthIntent(intent)
    const targetBase = defaultRedirect === '/renter' ? '/renter/playground' : defaultRedirect
    return withRenterIntentInPath(targetBase, intent)
  }

  const getReasonMessage = useCallback((reason: string) => {
    if (reason === 'expired_session') return t('auth.error.expired_session')
    if (reason === 'missing_credentials') return t('auth.error.missing_credentials')
    if (reason === 'invalid_credentials') return t('auth.error.invalid_credentials')
    return t('auth.error.sign_in_failed')
  }, [t])

  const normalizeAuthError = (status: number, rawError: string, fallback: string) => {
    const lower = rawError.toLowerCase()
    if (status === 401 || status === 403) {
      if (lower.includes('session')) return t('auth.error.expired_session')
      return t('auth.error.invalid_credentials')
    }
    if (lower.includes('session')) return t('auth.error.expired_session')
    return rawError || fallback
  }

  useEffect(() => {
    const roleParam = searchParams.get('role')
    if (roleParam === 'renter' || roleParam === 'provider' || roleParam === 'admin') setRole(roleParam)
    const methodParam = searchParams.get('method')
    if (methodParam === 'email' || methodParam === 'apikey') setLoginMethod(methodParam)
    const reasonParam = searchParams.get('reason')
    if (reasonParam) setError(getReasonMessage(reasonParam))
  }, [getReasonMessage, searchParams])

  // Persist the intended post-login destination (provider vs renter) so that
  // /auth/verify, which has no Role context, can redirect correctly when the
  // user clicks the link in their email.
  const persistRolePreference = (chosen: Role) => {
    try {
      sessionStorage.setItem('dcp_login_prefer_role', chosen)
    } catch { /* ignore */ }
  }

  const handleSendMagicLink = async () => {
    setError(''); setSuccessMsg(''); setIsLoading(true)
    try {
      if (!email.trim()) { setError(t('login.enter_email')); setIsLoading(false); return }
      if (role === 'admin') { setError(t('login.admin_needs_key')); setIsLoading(false); return }
      persistRolePreference(role)
      // Stash the post-login redirect so /auth/verify can honor it after the
      // magic-link click. URL params don't survive the email round-trip; this
      // sessionStorage key is read in app/auth/verify/page.tsx.
      try {
        const r = searchParams.get('redirect')
        if (r && r.startsWith('/') && !r.startsWith('//')) {
          sessionStorage.setItem('dcp_post_auth_redirect', r)
        }
      } catch { /* sessionStorage unavailable — fall through */ }
      const endpoint = role === 'renter' ? 'renters/send-otp' : 'providers/send-otp'
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send sign-in link.')
      }
      setAuthStep('sent')
      setSuccessMsg('Check your email — we sent you a sign-in link.')
      setCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link.')
    } finally { setIsLoading(false) }
  }

  const handleResendLink = () => { if (countdown > 0) return; handleSendMagicLink() }
  const handleBackToEmail = () => { setAuthStep('email'); setError(''); setSuccessMsg(''); setCountdown(0) }

  const handleApiKeyLogin = async () => {
    setError(''); setIsLoading(true)
    try {
      if (!apiKey.trim()) { setError(t('login.enter_key')); setIsLoading(false); return }
      if (role === 'renter') {
        const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(apiKey.trim())}`)
        if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(normalizeAuthError(res.status, data.error || '', t('auth.error.invalid_credentials'))) }
        const data = await res.json()
        if (!data.renter) throw new Error(t('login.error.renter_not_found'))
        localStorage.setItem('dc1_renter_key', apiKey.trim())
        await setSession({ role: 'renter', userName: data.renter.name, email: data.renter.email })
        router.push(getRenterPostLoginRedirect())
      } else if (role === 'provider') {
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey.trim())}`)
        if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(normalizeAuthError(res.status, data.error || '', t('auth.error.invalid_credentials'))) }
        const data = await res.json()
        if (!data.provider) throw new Error(t('login.error.provider_not_found'))
        localStorage.setItem('dc1_provider_key', apiKey.trim())
        await setSession({ role: 'provider', userName: data.provider.name, email: data.provider.email })
        router.push('/provider')
      } else if (role === 'admin') {
        const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: { 'x-admin-token': apiKey.trim() } })
        if (!res.ok) throw new Error(normalizeAuthError(res.status, t('login.error.invalid_admin_key'), t('auth.error.invalid_credentials')))
        localStorage.setItem('dc1_admin_token', apiKey.trim())
        await setSession({ role: 'admin', userName: 'Admin' })
        router.push('/admin')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error.sign_in_failed'))
    } finally { setIsLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loginMethod === 'apikey') return handleApiKeyLogin()
    if (authStep === 'email') return handleSendMagicLink()
    // 'sent' step has no submit — only Resend / Back
  }

  const helperRows = [
    { id: 'renter', roleLabel: t('login.role.renter'), authLabel: 'Magic link', destination: '/renter/playground' },
    { id: 'provider', roleLabel: t('login.role.provider'), authLabel: 'Magic link', destination: '/provider' },
    { id: 'admin', roleLabel: t('login.role.admin'), authLabel: t('login.auth_mode.api_key'), destination: '/admin' },
  ]

  return (
    <div className="flex flex-col min-h-screen bg-dc1-void">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="card border-dc1-border/50 shadow-lg">
            <div className="flex justify-center mb-8">
              <img src="/dcp-logo-transparent.svg" alt="DCP" className="h-12 w-auto" />
            </div>
            <h1 className="text-2xl font-bold text-dc1-text-primary text-center mb-2">{t('auth.sign_in')}</h1>
            <p className="text-sm text-dc1-text-secondary text-center mb-6">
              {authStep === 'sent'
                ? 'We sent a sign-in link to your email.'
                : 'Sign in with a one-click link sent to your email.'}
            </p>

            {authStep === 'email' && (
              <div className="mb-6">
                <div className="flex rounded-lg border border-dc1-border overflow-hidden">
                  <button type="button" onClick={() => { setLoginMethod('email'); setError(''); setSuccessMsg('') }}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${loginMethod === 'email' ? 'bg-dc1-amber text-dc1-void' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'}`}>
                    {t('login.email')}
                  </button>
                  <button type="button" onClick={() => { setLoginMethod('apikey'); setError(''); setSuccessMsg('') }}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${loginMethod === 'apikey' ? 'bg-dc1-amber text-dc1-void' : 'bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'}`}>
                    {t('login.api_key')}
                  </button>
                </div>
              </div>
            )}

            {authStep === 'email' && (
              <div className="mb-6">
                <label className="label">{t('login.account_type')}</label>
                <div className="flex gap-3">
                  {(loginMethod === 'email' ? ['renter', 'provider'] as const : ['renter', 'provider', 'admin'] as const).map((r) => (
                    <label key={r} className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="radio" value={r} checked={role === r} onChange={(e) => setRole(e.target.value as Role)} className="w-4 h-4 accent-dc1-amber" />
                      <span className="text-sm text-dc1-text-primary">{t(`login.role.${r}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {authStep === 'email' && (
              <div className="mb-6 rounded-lg border border-dc1-border bg-dc1-surface-l2/60 p-4">
                <h2 className="text-sm font-semibold text-dc1-text-primary mb-1">{t('login.helper.title')}</h2>
                <p className="text-xs text-dc1-text-secondary mb-3">{t('login.helper.subtitle')}</p>
                <div className="space-y-2">
                  {helperRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-dc1-text-primary">{row.roleLabel}</span>
                      <span className="text-dc1-text-secondary">{row.authLabel}</span>
                      <span className="font-mono text-dc1-amber">{row.destination}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-emerald-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {successMsg}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-md text-status-error text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {loginMethod === 'email' ? (
                authStep === 'email' ? (
                  <div>
                    <label htmlFor="email" className="label">{t('login.email_address')}</label>
                    <input id="email" type="email" placeholder="you@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="input" disabled={isLoading} required autoFocus />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2/60 p-5 text-center">
                    <svg className="w-12 h-12 mx-auto text-dc1-amber mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-dc1-text-primary mb-1">Link sent to</p>
                    <p className="text-base text-dc1-amber font-mono mb-4 break-all">{email}</p>
                    <p className="text-xs text-dc1-text-secondary mb-4">
                      Open the email and click <span className="text-dc1-text-primary font-semibold">Sign In to DCP</span>.
                      {' '}{t('auth.magic_link_expires_note')}
                    </p>
                    <div className="flex flex-col gap-2 items-center">
                      {countdown > 0 ? (
                        <span className="text-xs text-dc1-text-secondary">
                          You can request a new link in {countdown}s
                        </span>
                      ) : (
                        <button type="button" onClick={handleResendLink} disabled={isLoading}
                          className="text-sm text-dc1-amber hover:text-dc1-amber/80 font-medium">
                          Resend link
                        </button>
                      )}
                      <button type="button" onClick={handleBackToEmail}
                        className="text-xs text-dc1-text-secondary hover:text-dc1-text-primary">
                        {t('auth.use_different_email')}
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div>
                  <label htmlFor="apiKey" className="label">{t('login.api_key')}</label>
                  <input id="apiKey" type="password"
                    placeholder={role === 'renter' ? 'dcp-renter-...' : role === 'provider' ? 'dcp-provider-...' : 'admin key'}
                    value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    className="input font-mono" disabled={isLoading} required />
                </div>
              )}

              {(authStep === 'email' || loginMethod === 'apikey') && (
                <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
                  {isLoading
                    ? (loginMethod === 'email' ? 'Sending link…' : t('login.signing_in'))
                    : (loginMethod === 'email' ? 'Send Sign-In Link' : t('auth.sign_in'))}
                </button>
              )}
            </form>

            <div className="mt-6 pt-6 border-t border-dc1-border/30">
              <p className="text-xs text-dc1-text-secondary text-center">
                {loginMethod === 'email'
                  ? (authStep === 'sent'
                      ? "Didn't get the email? Check your spam folder, or click Resend above."
                      : "We'll email you a one-click sign-in link. No password, no codes.")
                  : t('login.apikey_hint')}
              </p>
            </div>

            {authStep === 'email' && (
              <div className="mt-4 space-y-2 text-center text-sm">
                <p className="text-dc1-text-secondary">
                  {t('login.new_to_dc1')}{' '}
                  <a href="/setup" className="text-dc1-amber hover:text-dc1-amber/80 font-medium">{t('login.become_provider')}</a>
                </p>
                <p className="text-dc1-text-secondary">
                  {t('login.want_to_rent')}{' '}
                  <a href="/renter/register" className="text-dc1-amber hover:text-dc1-amber/80 font-medium">{t('login.register_as_renter')}</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}>
      <LoginPageInner />
    </Suspense>
  )
}
