'use client'

// Provider dashboard install-command panel.
//
// Surfaced as the FIRST widget on /provider when the provider's daemon has
// never phoned home yet (no last_heartbeat). Detects OS in the browser, mints
// a single-use install token via /v1/provider/install-token, and renders the
// OS-specific one-liner with the token inlined plus a copy button.
//
// Auto-hides as soon as the dashboard's first heartbeat arrives — caller
// passes `pending` and only renders this component while it's true.

import { useState } from 'react'
import { detectOS, type DetectedOS } from './wizard/os-detect'
import { CopyButton, v1Fetch, V1Error } from './wizard/primitives'

interface InstallTokenResponse {
  install_token: string
  expires_at: string
}

interface Props {
  apiKey: string
}

// Mirror of buildCommand() in wizard/steps/Step5Install.tsx — kept tiny so we
// don't pull the whole wizard module just for one helper.
function buildCommand(os: DetectedOS, token: string): string {
  switch (os) {
    case 'windows':
      return [
        'powershell -ExecutionPolicy Bypass -Command "',
        "  Invoke-WebRequest -Uri 'https://dcp.sa/install.ps1' -OutFile dcp_setup.ps1;",
        `  .\\dcp_setup.ps1 -Token '${token}'"`,
      ].join('\n')
    case 'macos':
      return `curl -fsSL https://dcp.sa/install.sh | sudo bash -s -- --token ${token}`
    case 'linux':
      return `curl -fsSL https://dcp.sa/install.sh | sudo bash -s -- --token ${token}`
    default:
      return `# Unknown OS — visit dcp.sa/setup to install. Token: ${token}`
  }
}

function osLabel(os: DetectedOS): string {
  if (os === 'windows') return 'Windows (PowerShell as Administrator)'
  if (os === 'macos') return 'macOS (Terminal)'
  if (os === 'linux') return 'Linux (Terminal)'
  return 'Terminal'
}

export default function InstallCommandPanel({ apiKey }: Props) {
  // Lazily compute OS — useState initializer runs once, browser-only.
  const [os] = useState<DetectedOS>(() => detectOS())
  const [token, setToken] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const r = await v1Fetch<InstallTokenResponse>('/provider/install-token', {
        method: 'POST',
        apiKey,
        body: {},
      })
      setToken(r.install_token)
      setExpiresAt(r.expires_at)
    } catch (e) {
      // If the backend requires PDPL fields, send the user to the wizard step
      // 5 — which has the consent modal. Don't try to inline the modal here.
      const msg = e instanceof V1Error ? e.message : 'Could not generate install token.'
      const needsConsent = msg.toLowerCase().includes('consent') || msg.toLowerCase().includes('pdpl')
      setError(
        needsConsent
          ? 'Please complete the setup wizard once to record your PDPL consent — after that this panel works directly.'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-dc1-amber/50 bg-gradient-to-br from-dc1-amber/10 to-dc1-amber/5 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="text-4xl select-none">🛠️</div>
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-dc1-amber">Install your daemon</h2>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Your provider account is ready, but no daemon has phoned home yet. Run the
              one-liner below on your GPU machine — the installer handles WireGuard,
              service registration, and your first heartbeat. This panel disappears as
              soon as your daemon checks in.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {error}{' '}
              <a href="/setup" className="underline hover:text-dc1-amber">
                Open the full setup wizard
              </a>
              .
            </div>
          )}

          {!token && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="btn btn-primary btn-sm"
              >
                {busy ? 'Generating…' : 'Generate install token'}
              </button>
              <p className="text-xs text-dc1-text-muted">
                Single-use, expires in 60 minutes. Detected OS:{' '}
                <span className="font-semibold text-dc1-text-primary">{osLabel(os)}</span>
              </p>
            </div>
          )}

          {token && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
                  {os === 'windows'
                    ? 'Open PowerShell as Administrator, then paste:'
                    : 'Open Terminal, then paste:'}
                </p>
                <span className="rounded bg-dc1-surface-l2 px-2 py-0.5 text-[10px] font-semibold text-dc1-amber">
                  {osLabel(os)}
                </span>
              </div>
              <div className="relative rounded-lg border border-dc1-border bg-dc1-void p-4">
                <pre className="overflow-x-auto text-xs leading-relaxed text-dc1-text-primary">
                  <code>{buildCommand(os, token)}</code>
                </pre>
                <div className="absolute right-2 top-2">
                  <CopyButton text={buildCommand(os, token)} label="Copy" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-dc1-text-muted">
                {expiresAt && (
                  <span>Token expires {new Date(expiresAt).toLocaleString()}. Single-use only.</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setToken(null)
                    setExpiresAt(null)
                    void generate()
                  }}
                  className="text-dc1-amber hover:underline"
                >
                  Regenerate token
                </button>
              </div>
              <p className="text-[10px] text-dc1-text-muted">
                Copy from this page only — pasting from email or chat can break the command (dashes get mangled).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
