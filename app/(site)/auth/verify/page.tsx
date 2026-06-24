'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setSession, sealKeyExchange } from '@/app/lib/auth'

// /auth/verify?token=... — the destination of the magic link in the email.
// Reads the token, exchanges it for an API key + role via /api/auth/magic-link,
// stores the session, and redirects to the appropriate dashboard.
//
// This is the only sign-in path. There is no 6-digit code anywhere in the
// user-visible flow (state-of-the-art passwordless, GitHub/Anthropic style).
//
// `?desktop_callback=http://127.0.0.1:<port>/exchange` — set when the native
// DCP Provider desktop app initiated sign-in. After a successful exchange,
// instead of redirecting the browser to the web dashboard, we POST the
// {api_key, role} blob to the loopback URL the app is listening on. We
// validate STRICT loopback (127.0.0.1 / [::1] / localhost) here as a
// belt-and-braces check on top of the backend filter in auth-otp.js —
// never trust a URL from the wire without verifying it's pointed at the
// local machine.

const API_BASE = '/api'

// Loopback validator. MUST stay in sync with isLoopbackCallback() in
// backend/src/services/auth-otp.js. If you change one, change both.
function isLoopbackCallback(raw: string | null): boolean {
  if (!raw || raw.length > 256) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:') return false
  const host = u.hostname
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
}

function VerifyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'desktop_done' | 'desktop_failed' | 'error'>('verifying')
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

        // ── Native desktop sign-in path ────────────────────────────────
        // If the magic link was triggered by the desktop app, it embedded
        // a `desktop_callback` query param pointing at a local loopback
        // listener. Forward {api_key, role, ...} there and stop — do NOT
        // store credentials in this browser tab and do NOT redirect.
        const rawCallback = searchParams.get('desktop_callback')
        if (rawCallback) {
          if (!isLoopbackCallback(rawCallback)) {
            console.warn('[auth/verify] Refusing non-loopback desktop_callback:', rawCallback)
            setStatus('desktop_failed')
            setErrorMsg(
              'The desktop sign-in link was malformed. Please open the DCP Provider app and try again.'
            )
            return
          }

          try {
            const cbRes = await fetch(rawCallback, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key: data.api_key,
                role: data.role,
                provider: data.provider,
                renter: data.renter,
              }),
              // Loopback only; CORS errors here mean the app already
              // shut its listener down (timeout / user closed it).
            })
            if (!cbRes.ok) {
              throw new Error(`Desktop app responded ${cbRes.status}`)
            }
            setStatus('desktop_done')
            return
          } catch (cbErr) {
            console.error('[auth/verify] desktop_callback POST failed:', cbErr)
            setStatus('desktop_failed')
            setErrorMsg(
              "Couldn't reach the DCP Provider app on this machine. Make sure it's still running and try the sign-in link from the same computer."
            )
            return
          }
        }

        // ── Browser sign-in path (unchanged) ───────────────────────────
        if (data.role === 'renter') {
          localStorage.setItem('dc1_renter_key', data.api_key)
          await setSession({
            role: 'renter',
            userName: data.renter?.name,
            email: data.renter?.email,
          })
          // Seal the raw key into the httpOnly cookie (dual-write; localStorage kept for rollback).
          await sealKeyExchange('renter', data.api_key)
          // Honor a pre-login redirect stashed by /login (sessionStorage
          // key set in app/login/page.tsx handleSendMagicLink). Falls back
          // to the renter marketplace if no pending redirect exists or it
          // doesn't look safe.
          let renterNext = '/renter/dashboard'
          try {
            const pending = sessionStorage.getItem('dcp_post_auth_redirect')
            if (pending && pending.startsWith('/') && !pending.startsWith('//')) {
              renterNext = pending
            }
            sessionStorage.removeItem('dcp_post_auth_redirect')
          } catch { /* ignore */ }
          router.replace(renterNext)
          return
        }

        if (data.role === 'provider') {
          localStorage.setItem('dc1_provider_key', data.api_key)
          await setSession({
            role: 'provider',
            userName: data.provider?.name,
            email: data.provider?.email,
          })
          // Seal the raw key into the httpOnly cookie (dual-write; localStorage kept for rollback).
          await sealKeyExchange('provider', data.api_key)
          // Return the provider into the v2 wizard to continue setup. The key
          // lives in localStorage (survives opening the email in a new tab),
          // and the wizard skips to step 2 when a key is present. We still
          // honor an explicit same-tab wizard redirect if one was stashed.
          let next = '/provider-setup'
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

  // v2 editorial-luxury chrome (locked design language 2026-05-25). This page
  // lives outside the /v2 route tree — the email + desktop app both target
  // /auth/verify — so the tokens are inlined rather than pulled from the v2
  // stylesheet/layout context.
  const pageStyle: CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0b1a', padding: '0 16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  }
  const cardStyle: CSSProperties = {
    width: '100%', maxWidth: 440, background: '#10122a', border: '1px solid #1f2040',
    padding: '44px 40px', textAlign: 'center',
  }
  const titleStyle: CSSProperties = {
    fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif", fontWeight: 400,
    fontSize: 30, lineHeight: 1.15, color: '#f5f3ee', margin: '0 0 12px',
  }
  const subStyle: CSSProperties = { fontSize: 14, lineHeight: 1.6, color: '#c9c5bd', margin: '0 0 8px' }
  const iconStyle: CSSProperties = { margin: '0 auto 18px', display: 'block' }

  if (status === 'desktop_done') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2dd4b6" style={iconStyle}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h1 style={titleStyle}>You&apos;re signed in</h1>
          <p style={subStyle}>DCP Provider has received your credentials and is finishing setup.</p>
          <p style={subStyle}>You can close this tab and return to the DCP Provider app.</p>
        </div>
      </div>
    )
  }

  if (status === 'desktop_failed' || status === 'error') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ee7a3c" style={iconStyle}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h1 style={titleStyle}>Sign-in link didn&apos;t work</h1>
          <p style={{ ...subStyle, margin: '0 0 26px' }}>{errorMsg}</p>
          <a
            href="/auth"
            style={{
              display: 'inline-block', background: '#f5f3ee', color: '#0a0b1a', textDecoration: 'none',
              padding: '13px 32px', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            Request a new link →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <svg
          width="38" height="38" viewBox="0 0 24 24" fill="none"
          style={{ ...iconStyle, animation: 'dcpspin 0.8s linear infinite' }}
        >
          <circle cx="12" cy="12" r="10" stroke="#1f2040" strokeWidth="4" />
          <path fill="#2dd4b6" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <h1 style={titleStyle}>Signing you in</h1>
        <p style={subStyle}>Verifying your sign-in link…</p>
        <style>{'@keyframes dcpspin{to{transform:rotate(360deg)}}'}</style>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0b1a' }} />}>
      <VerifyPageInner />
    </Suspense>
  )
}
