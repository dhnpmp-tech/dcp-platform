'use client'

// Ported from prototypes/Auth.html, wired to the live magic-link/API-key auth
// contracts used by app/login/page.tsx. Nafath and Google remain explicit
// coming-soon choices until real integrations exist.
import './auth.css'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { setSession } from '@/app/lib/auth'
import { Bi, useV2 } from '@/app/v2/lib/i18n'

type AuthTab = 'signin' | 'signup'
type AuthRole = 'renter' | 'provider'
type LoginMethod = 'email' | 'apikey'
type AuthStep = 'email' | 'sent'

const API_BASE = '/api'

function getSafeRedirect(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}

function AuthInner() {
  const router = useRouter()
  const { lang, toggle } = useV2()
  const search = useSearchParams()

  const initialTab: AuthTab = search?.has('new') ? 'signup' : 'signin'
  const roleParam = search?.get('role')
  const methodParam = search?.get('method')
  const isAdminIntent = roleParam === 'admin'

  const [tab, setTab] = useState<AuthTab>(initialTab)
  const [role, setRole] = useState<AuthRole>(roleParam === 'provider' ? 'provider' : 'renter')
  const [method, setMethod] = useState<LoginMethod>(methodParam === 'apikey' ? 'apikey' : 'email')
  const [authStep, setAuthStep] = useState<AuthStep>('email')
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (roleParam === 'provider') setRole('provider')
    if (roleParam === 'renter') setRole('renter')
    if (methodParam === 'apikey' || methodParam === 'email') setMethod(methodParam)
    if (search?.has('new')) setTab('signup')
  }, [methodParam, roleParam, search])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const defaultRedirect = useMemo(() => {
    if (tab === 'signup' && role === 'renter') return '/v2/setup'
    if (tab === 'signup' && role === 'provider') return '/v2/provider-setup'
    return role === 'provider' ? '/v2/provider/dashboard' : '/v2/renter/dashboard'
  }, [role, tab])

  const nextPath = getSafeRedirect(search?.get('redirect') || null, defaultRedirect)
  const adminNextPath = getSafeRedirect(search?.get('redirect') || null, '/admin')
  const adminAuthHref = '/v2/auth?role=admin&method=apikey&redirect=/admin'

  const resetFeedback = () => {
    setError('')
    setSuccess('')
  }

  const persistMagicLinkRedirect = useCallback(() => {
    try {
      sessionStorage.setItem('dcp_login_prefer_role', role)
      sessionStorage.setItem('dcp_post_auth_redirect', nextPath)
      if (role === 'provider') {
        sessionStorage.setItem('dcp_wizard_redirect_after_auth', nextPath)
      }
    } catch {
      /* ignore */
    }
  }, [nextPath, role])

  const sendMagicLink = useCallback(async () => {
    resetFeedback()
    if (!email.trim()) {
      setError(lang === 'ar' ? 'أدخل بريدك الإلكتروني.' : 'Enter your email.')
      return
    }

    setIsLoading(true)
    try {
      persistMagicLinkRedirect()
      const endpoint = role === 'renter' ? 'renters/send-otp' : 'providers/send-otp'
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send sign-in link.')

      setAuthStep('sent')
      setSuccess(lang === 'ar' ? 'أرسلنا رابط الدخول إلى بريدك.' : 'Check your email. We sent a sign-in link.')
      setCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link.')
    } finally {
      setIsLoading(false)
    }
  }, [email, lang, persistMagicLinkRedirect, role])

  const loginWithApiKey = useCallback(async () => {
    resetFeedback()
    if (!apiKey.trim()) {
      setError(lang === 'ar' ? 'أدخل مفتاح API.' : 'Enter your API key.')
      return
    }

    setIsLoading(true)
    try {
      const key = apiKey.trim()
      if (role === 'renter') {
        const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.renter) throw new Error(data.error || 'Invalid renter API key.')
        localStorage.setItem('dc1_renter_key', key)
        await setSession({ role: 'renter', userName: data.renter.name, email: data.renter.email })
      } else {
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(key)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.provider) throw new Error(data.error || 'Invalid provider API key.')
        localStorage.setItem('dc1_provider_key', key)
        await setSession({ role: 'provider', userName: data.provider.name, email: data.provider.email })
      }
      router.push(nextPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setIsLoading(false)
    }
  }, [apiKey, lang, nextPath, role, router])

  const loginWithAdminKey = useCallback(async () => {
    resetFeedback()
    if (!apiKey.trim()) {
      setError(lang === 'ar' ? 'أدخل مفتاح الإدارة.' : 'Enter your admin key.')
      return
    }

    setIsLoading(true)
    try {
      const key = apiKey.trim()
      const res = await fetch(`${API_BASE}/admin/dashboard`, {
        headers: { 'x-admin-token': key },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Invalid admin API key.')
      localStorage.setItem('dc1_admin_token', key)
      await setSession({ role: 'admin', userName: 'Admin' })
      router.push(adminNextPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin sign-in failed.')
    } finally {
      setIsLoading(false)
    }
  }, [adminNextPath, apiKey, lang, router])

  const submit = async () => {
    if (method === 'apikey') return loginWithApiKey()
    return sendMagicLink()
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <Link href="/v2/home" className="wm" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          DCP<i>∞</i>
        </Link>
        <div className="glyph" aria-hidden="true">
          <svg viewBox="0 0 1200 700">
            <g className="ms" transform="translate(180 110)">
              <path d="M 0 0 H 180 V 60 H 60 V 220 H 180 V 280 H 0 Z" />
              <path d="M 260 0 H 460 V 60 H 320 V 160 H 460 V 220 H 380 V 280 H 260 Z M 380 100 H 460 V 160 H 380 Z" />
              <path d="M 540 0 H 720 V 60 H 600 V 220 H 720 V 280 H 540 Z M 660 100 H 720 V 160 H 660 Z" />
            </g>
          </svg>
        </div>
        <div className="big">
          <Bi en="Arabic AI that " ar="ذكاء اصطناعي عربي " />
          <em>
            <Bi en="lives in the Kingdom." ar="يعيش داخل المملكة." />
          </em>
        </div>
        <div className="foot">
          <span>
            <Bi en="Inference · agents" ar="استدلال · وكلاء" />
          </span>
          <span>
            <Bi en="Pay in Riyal" ar="ادفع بالريال" />
          </span>
          <span>
            <Bi en="PDPL · in-Kingdom" ar="نظام حماية البيانات · داخل المملكة" />
          </span>
        </div>
      </div>

      <div className="auth-form">
        <button type="button" onClick={toggle} aria-label="Toggle language" className="lang-switch">
          <span className={lang === 'en' ? 'on' : undefined}>EN</span>
          <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
        </button>

        {isAdminIntent ? (
          <div>
            <h1>
              <Bi en="Admin sign-in." ar="دخول الإدارة." />
            </h1>
            <p className="sub">
              <Bi
                en="Use the operator API key. The admin console remains on the hardened operations surface while v2 renter and provider flows go live."
                ar="استخدم مفتاح API للمشغلين. تبقى لوحة الإدارة على سطح العمليات الموثوق بينما تُفعّل تدفقات v2 للمستأجرين والمزوّدين."
              />
            </p>
            <div className="field">
              <label>
                <Bi en="Admin API key" ar="مفتاح API للإدارة" />
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="admin key"
                autoComplete="off"
              />
            </div>
            <button type="button" className="btn-pri" onClick={loginWithAdminKey} disabled={isLoading}>
              {isLoading ? <Bi en="Signing in…" ar="جارٍ الدخول…" /> : <Bi en="Open admin console →" ar="افتح لوحة الإدارة ←" />}
            </button>
            {error && <div className="callout err" role="alert">{error}</div>}
            {success && <div className="callout ok" role="status">{success}</div>}
          </div>
        ) : (
          <>
            <div className="seg-tabs" id="tabs" role="tablist">
              <button
                type="button"
                data-t="signin"
                className={tab === 'signin' ? 'on' : undefined}
                role="tab"
                aria-selected={tab === 'signin'}
                onClick={() => {
                  setTab('signin')
                  setAuthStep('email')
                  resetFeedback()
                }}
              >
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </button>
              <button
                type="button"
                data-t="signup"
                className={tab === 'signup' ? 'on' : undefined}
                role="tab"
                aria-selected={tab === 'signup'}
                onClick={() => {
                  setTab('signup')
                  setAuthStep('email')
                  resetFeedback()
                }}
              >
                <Bi en="Create account" ar="إنشاء حساب" />
              </button>
            </div>

            <h1>
              {tab === 'signup' ? <Bi en="Start free." ar="ابدأ مجاناً." /> : <Bi en="Welcome back." ar="مرحباً بعودتك." />}
            </h1>
            <p className="sub">
              {tab === 'signup' ? (
                <Bi
                  en="Create your DCP session with a passwordless magic link, then finish setup with a real account key."
                  ar="أنشئ جلسة DCP عبر رابط دخول بدون كلمة مرور، ثم أكمل الإعداد بمفتاح حساب حقيقي."
                />
              ) : (
                <Bi en="Sign in to your DCP console." ar="سجّل الدخول إلى لوحة تحكم DCP." />
              )}
            </p>

            <div className="oauth">
              <button type="button" disabled title="Coming soon">
                <span className="ic">⚷</span> <Bi en="Nafath · coming soon" ar="نفاذ · قريباً" />
              </button>
              <button type="button" disabled title="Coming soon">
                <span className="ic">✉</span> <Bi en="Google · coming soon" ar="جوجل · قريباً" />
              </button>
            </div>
            <div className="divider">
              <Bi en="or continue with DCP" ar="أو تابع عبر DCP" />
            </div>

            <div className="role-grid" aria-label={lang === 'ar' ? 'نوع الحساب' : 'Account type'}>
              <button
                type="button"
                className={role === 'renter' ? 'on' : undefined}
                onClick={() => {
                  setRole('renter')
                  resetFeedback()
                }}
              >
                <Bi en="Renter" ar="مستأجر" />
              </button>
              <button
                type="button"
                className={role === 'provider' ? 'on' : undefined}
                onClick={() => {
                  setRole('provider')
                  resetFeedback()
                }}
              >
                <Bi en="Provider" ar="مزوّد" />
              </button>
            </div>

            {tab === 'signin' && (
              <div className="method-tabs" aria-label={lang === 'ar' ? 'طريقة الدخول' : 'Sign-in method'}>
                <button
                  type="button"
                  className={method === 'email' ? 'on' : undefined}
                  onClick={() => {
                    setMethod('email')
                    setAuthStep('email')
                    resetFeedback()
                  }}
                >
                  <Bi en="Magic link" ar="رابط سحري" />
                </button>
                <button
                  type="button"
                  className={method === 'apikey' ? 'on' : undefined}
                  onClick={() => {
                    setMethod('apikey')
                    setAuthStep('email')
                    resetFeedback()
                  }}
                >
                  <Bi en="API key" ar="مفتاح API" />
                </button>
              </div>
            )}

            {method === 'email' ? (
              <>
                <div className="field">
                  <label>
                    <Bi en="Email" ar="البريد الإلكتروني" />
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.sa"
                    autoComplete="email"
                    disabled={authStep === 'sent'}
                  />
                </div>
                {authStep === 'sent' ? (
                  <div className="auth-actions">
                    <button type="button" className="btn-pri" onClick={sendMagicLink} disabled={isLoading || countdown > 0}>
                      {countdown > 0 ? (
                        <Bi en={`Resend in ${countdown}s`} ar={`إعادة الإرسال خلال ${countdown}ث`} />
                      ) : (
                        <Bi en="Resend magic link" ar="إعادة إرسال الرابط" />
                      )}
                    </button>
                    <button type="button" className="btn-sec" onClick={() => { setAuthStep('email'); resetFeedback(); setCountdown(0) }}>
                      <Bi en="Use another email" ar="استخدم بريداً آخر" />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-pri" onClick={submit} disabled={isLoading}>
                    {isLoading ? <Bi en="Sending…" ar="جارٍ الإرسال…" /> : <Bi en="Send magic link →" ar="أرسل الرابط السحري ←" />}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="field">
                  <label>
                    <Bi en="API key" ar="مفتاح API" />
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={role === 'provider' ? 'prov_…' : 'dcp-renter-…'}
                    autoComplete="off"
                  />
                </div>
                <button type="button" className="btn-pri" onClick={submit} disabled={isLoading}>
                  {isLoading ? <Bi en="Signing in…" ar="جارٍ الدخول…" /> : <Bi en="Sign in →" ar="تسجيل الدخول ←" />}
                </button>
              </>
            )}

            {error && <div className="callout err" role="alert">{error}</div>}
            {success && <div className="callout ok" role="status">{success}</div>}

            <div className="legal">
              {tab === 'signin' ? (
                <>
                  <Bi en="Need admin access? " ar="تحتاج دخول الإدارة؟ " />
                  <Link href={adminAuthHref}>
                    <Bi en="Use the admin API-key login" ar="استخدم دخول الإدارة بمفتاح API" />
                  </Link>
                  .
                </>
              ) : (
                <>
                  <Bi en="By continuing you agree to our " ar="بالمتابعة فإنك توافق على " />
                  <Link href="/terms">
                    <Bi en="Terms" ar="الشروط" />
                  </Link>
                  <Bi en=" and " ar=" و" />
                  <Link href="/privacy">
                    <Bi en="Privacy Policy" ar="سياسة الخصوصية" />
                  </Link>
                  <Bi
                    en=". Data stays in the Kingdom per PDPL."
                    ar=". تبقى البيانات داخل المملكة وفق نظام حماية البيانات الشخصية."
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  )
}
