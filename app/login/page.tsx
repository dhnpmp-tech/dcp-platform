'use client'

import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
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

const API_BASE = '/api/dc1'

type Role = 'provider' | 'renter' | 'admin'
type LoginMethod = 'email' | 'apikey'
type AuthStep = 'email' | 'otp'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()

  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [role, setRole] = useState<Role>('renter')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email')
  const [authStep, setAuthStep] = useState<AuthStep>('email')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [countdown, setCountdown] = useState(0)
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (authStep === 'otp' && otpInputRef.current) otpInputRef.current.focus()
  }, [authStep])

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
    // OTP-specific: if the error mentions token/code/otp expiry, show the code-specific message
    if (lower.includes('token') || lower.includes('otp') || lower.includes('code') || lower.includes('verification')) {
      return t('login.error.invalid_or_expired_code')
    }
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

  const handleSendOtp = async () => {
    setError(''); setSuccessMsg(''); setIsLoading(true)
    try {
      if (!email.trim()) { setError(t('login.enter_email')); setIsLoading(false); return }
      if (role === 'admin') { setError(t('login.admin_needs_key')); setIsLoading(false); return }
      const endpoint = role === 'renter' ? 'renters/send-otp' : 'providers/send-otp'
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('login.error.send_failed'))
      }
      setAuthStep('otp')
      setSuccessMsg(t('login.otp.sent_success'))
      setCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error.send_failed'))
    } finally { setIsLoading(false) }
  }

  const handleVerifyOtp = async () => {
    setError(''); setSuccessMsg(''); setIsLoading(true)
    try {
      if (!otpCode.trim()) { setError(t('login.error.enter_verification_code')); setIsLoading(false); return }
      const endpoint = role === 'renter' ? 'renters/verify-otp' : 'providers/verify-otp'
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: otpCode.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(normalizeAuthError(res.status, data.error || t('login.error.verification_failed'), t('login.error.invalid_or_expired_code')))
      }
      const data = await res.json()
      if (!data.success || !data.api_key) throw new Error(t('login.error.verification_failed'))
      if (role === 'renter') {
        localStorage.setItem('dc1_renter_key', data.api_key)
        await setSession({ role: 'renter', userName: data.renter?.name, email: data.renter?.email })
        router.push(getRenterPostLoginRedirect())
      } else {
        localStorage.setItem('dc1_provider_key', data.api_key)
        await setSession({ role: 'provider', userName: data.provider?.name, email: data.provider?.email })
        router.push('/provider')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error.verification_failed'))
    } finally { setIsLoading(false) }
  }

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
    if (authStep === 'email') return handleSendOtp()
    return handleVerifyOtp()
  }

  const handleResendOtp = () => { if (countdown > 0) return; setOtpCode(''); handleSendOtp() }
  const handleBackToEmail = () => { setAuthStep('email'); setOtpCode(''); setError(''); setSuccessMsg(''); setCountdown(0) }
  const helperRows = [
    {
      id: 'renter',
      roleLabel: t('login.role.renter'),
      authLabel: t('login.auth_mode.email_otp'),
      destination: '/renter/playground',
    },
    {
      id: 'provider',
      roleLabel: t('login.role.provider'),
      authLabel: t('login.auth_mode.email_otp'),
      destination: '/provider',
    },
    {
      id: 'admin',
      roleLabel: t('login.role.admin'),
      authLabel: t('login.auth_mode.api_key'),
      destination: '/admin',
    },
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
              {authStep === 'otp' ? t('login.otp.step_description') : t('login.sign_in_desc')}
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
                <>
                  {authStep === 'email' ? (
                    <div>
                      <label htmlFor="email" className="label">{t('login.email_address')}</label>
                      <input id="email" type="email" placeholder="you@example.com" value={email}
                        onChange={(e) => setEmail(e.target.value)} className="input" disabled={isLoading} required autoFocus />
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 p-3 bg-dc1-surface-l2 rounded-md">
                        <p className="text-xs text-dc1-text-secondary">{t('login.otp.sending_to')}</p>
                        <p className="text-sm text-dc1-text-primary font-medium">{email}</p>
                        <button type="button" onClick={handleBackToEmail} className="text-xs text-dc1-amber hover:text-dc1-amber/80 mt-1">{t('login.otp.change_email')}</button>
                      </div>
                      <label htmlFor="otpCode" className="label">{t('login.otp.code_label')}</label>
                      <p className="mb-2 text-xs text-dc1-text-secondary">
                        {t('login.otp.expectation')}
                      </p>
                      <input id="otpCode" ref={otpInputRef} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                        placeholder={t('login.otp.placeholder')} value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        className="input text-center text-2xl tracking-[0.5em] font-mono" disabled={isLoading} required autoComplete="one-time-code" />
                      <div className="mt-2 text-center">
                        {countdown > 0 ? (
                          <span className="text-xs text-dc1-text-secondary">{t('login.otp.resend_in').replace('{seconds}', String(countdown))}</span>
                        ) : (
                          <button type="button" onClick={handleResendOtp} className="text-xs text-dc1-amber hover:text-dc1-amber/80" disabled={isLoading}>
                            {t('login.otp.resend')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label htmlFor="apiKey" className="label">{t('login.api_key')}</label>
                  <input id="apiKey" type="password"
                    placeholder={role === 'renter' ? 'dcp-renter-...' : role === 'provider' ? 'dcp-provider-...' : 'admin key'}
                    value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    className="input font-mono" disabled={isLoading} required />
                </div>
              )}

              <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
                {isLoading
                  ? (authStep === 'otp' ? t('login.otp.verifying') : t('login.signing_in'))
                  : (loginMethod === 'email' ? (authStep === 'otp' ? t('login.otp.verify_cta') : t('login.otp.send_cta')) : t('auth.sign_in'))}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-dc1-border/30">
              <p className="text-xs text-dc1-text-secondary text-center mb-3">
                {loginMethod === 'email'
                  ? (authStep === 'otp' ? t('login.otp.check_inbox') : t('login.otp.send_notice'))
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
