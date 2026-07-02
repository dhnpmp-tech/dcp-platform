'use client'

// dcp.sa/cli-login — approval page for the `dcp` CLI device-code flow.
//
// The CLI opens this URL with ?code=XXXX-XXXX. The renter confirms it's the
// code shown in their terminal, and (authenticated by their renter key) we
// POST /v1/cli/device/approve — which binds the code to their account and
// mints a scoped inference key the CLI then claims via /device/token.

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getRenterKey } from '@/lib/api'
import './cli-login.css'

type Phase = 'idle' | 'approving' | 'approved' | 'error'

function normalizeCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

function CliLogin() {
  const params = useSearchParams()
  const [code, setCode] = useState('')
  const [renterKey, setRenterKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [startedThis, setStartedThis] = useState(false)

  useEffect(() => {
    const fromUrl = params.get('code')
    if (fromUrl) setCode(normalizeCode(fromUrl))
    const stored = getRenterKey()
    if (stored) setRenterKey(stored)
  }, [params])

  const looksLikeRenterKey = (k: string) => /^(dcp-renter-|dc1-renter-|dc1-sk-)/.test(k.trim())

  function saveKey() {
    const k = keyInput.trim()
    if (!looksLikeRenterKey(k)) {
      setError('That does not look like a DCP renter key (starts with dcp-renter-).')
      return
    }
    localStorage.setItem('dc1_renter_key', k)
    setRenterKey(k)
    setError('')
  }

  async function approve() {
    const userCode = normalizeCode(code)
    if (userCode.length !== 9) {
      setError('Enter the full 8-character code shown in your terminal (e.g. AB12-CD34).')
      return
    }
    setPhase('approving')
    setError('')
    try {
      const res = await fetch('/v1/cli/device/approve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${renterKey}`,
        },
        body: JSON.stringify({ user_code: userCode }),
      })
      if (res.ok) {
        setPhase('approved')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setRenterKey('')
        setError('Your saved key was rejected. Paste a current DCP renter key and try again.')
      } else if (body.error === 'expired_token') {
        setError('This code has expired. Run `dcp login` again to get a fresh one.')
      } else if (body.error === 'invalid_or_used_code') {
        setError('This code was already used or is not recognized. Run `dcp login` again.')
      } else {
        setError(body.error || 'Approval failed. Please try again.')
      }
      setPhase('error')
    } catch {
      setError('Network error reaching DCP. Check your connection and try again.')
      setPhase('error')
    }
  }

  if (phase === 'approved') {
    return (
      <main className="cli-wrap">
        <section className="cli-card cli-ok" aria-live="polite">
          <div className="cli-check">✓</div>
          <h1>Approved</h1>
          <p>Your terminal will continue automatically — you can close this tab.</p>
          <p className="cli-sub">Signed in as this DCP account for the <code>dcp</code> CLI.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="cli-wrap">
      <section className="cli-card" aria-labelledby="cli-title">
        <p className="cli-eyebrow">DCP · CLI sign-in</p>
        <h1 id="cli-title">Approve <code>dcp</code> on this device</h1>
        <p className="cli-lede">
          Confirm this matches the code shown in your terminal, then approve.
        </p>

        <label className="cli-label" htmlFor="cli-code">Device code</label>
        <input
          id="cli-code"
          className="cli-code-input"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          spellCheck={false}
        />

        {!renterKey && (
          <div className="cli-authbox">
            <p className="cli-authnote">
              Sign in to approve — paste your DCP renter key, or{' '}
              <Link href="/setup">get one here</Link>.
            </p>
            <div className="cli-keyrow">
              <input
                className="cli-key-input"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="dcp-renter-…"
                type="password"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="cli-btn cli-btn-ghost" onClick={saveKey}>Use key</button>
            </div>
          </div>
        )}

        <label className="cli-confirm">
          <input
            type="checkbox"
            checked={startedThis}
            onChange={(e) => setStartedThis(e.target.checked)}
          />
          <span>I ran <code>dcp login</code> just now and this code matches my terminal.</span>
        </label>

        <button
          className="cli-btn cli-btn-primary"
          onClick={approve}
          disabled={!renterKey || !startedThis || phase === 'approving'}
        >
          {phase === 'approving' ? 'Approving…' : 'Approve sign-in'}
        </button>

        {error && <p className="cli-error" role="alert">{error}</p>}

        <p className="cli-foot">
          <strong>Only approve a code you started yourself.</strong> If someone sent you this link
          or code, do not approve — it would grant <em>their</em> CLI a scoped inference key on
          <em> your</em> account (billed to you). This never exposes your password.
        </p>
      </section>
    </main>
  )
}

export default function CliLoginPage() {
  return (
    <Suspense fallback={<main className="cli-wrap"><section className="cli-card"><p className="cli-lede">Loading…</p></section></main>}>
      <CliLogin />
    </Suspense>
  )
}
