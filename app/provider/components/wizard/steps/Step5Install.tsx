'use client'

// Step 5: Install. We call /v1/provider/install-token, then render an
// OS-specific one-liner that embeds the token. The token is single-use and
// consumed by /provider/register-node when the daemon phones home in Step 6.
//
// Token minting is gated behind a PDPL consent check. On click:
//   1. GET /v1/provider/me — if pdpl_consented_at is set, mint directly.
//   2. Otherwise open the LegalConsentModal and mint on submit with the
//      compliance fields in the body.
// If the provider already has a valid unexpired token in wizard state
// (initialToken/initialExpires), render it immediately without re-minting.

import { useState } from 'react'
import {
  CopyButton, ErrorBox, PrimaryButton, SecondaryButton, v1Fetch, V1Error,
} from '../primitives'
import type { DetectedOS } from '../os-detect'
import { LegalConsentModal, type LegalPayload } from './LegalConsentModal'

interface Step5Props {
  apiKey: string
  os: DetectedOS
  initialToken: string | null
  initialExpires: string | null
  onTokenReady: (token: string, expiresAt: string) => void
  onContinue: () => void
  onBack: () => void
}

interface InstallTokenResponse {
  install_token: string
  expires_at: string
}

interface MeResponse {
  provider_id: number
  pdpl_consented_at: string | null
}

export function Step5Install({
  apiKey, os, initialToken, initialExpires, onTokenReady, onContinue, onBack,
}: Step5Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpires)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  async function mint(body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await v1Fetch<InstallTokenResponse>('/provider/install-token', {
        method: 'POST', apiKey, body,
      })
      setToken(r.install_token)
      setExpiresAt(r.expires_at)
      onTokenReady(r.install_token, r.expires_at)
      return true
    } catch (e) {
      const msg = e instanceof V1Error ? e.message : 'Could not generate install token.'
      if (modalOpen) setModalError(msg)
      else setError(msg)
      return false
    }
  }

  async function onGenerateClick() {
    setBusy(true)
    setError(null)
    try {
      const me = await v1Fetch<MeResponse>('/provider/me', { method: 'GET', apiKey })
      if (me.pdpl_consented_at) {
        await mint({})
      } else {
        setModalOpen(true)
      }
    } catch (e) {
      setError(e instanceof V1Error ? e.message : 'Could not check consent state.')
    } finally {
      setBusy(false)
    }
  }

  async function onModalSubmit(payload: LegalPayload) {
    setModalBusy(true)
    setModalError(null)
    const ok = await mint(payload as unknown as Record<string, unknown>)
    setModalBusy(false)
    if (ok) setModalOpen(false)
  }

  function onModalCancel() {
    if (modalBusy) return
    setModalOpen(false)
    setModalError(null)
  }

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">Install DCP on Your Machine</h2>
        <p className="mt-1 text-sm text-dc1-text-secondary">
          Copy-paste one command. The installer handles the rest.
        </p>
      </div>

      {error && <ErrorBox message={error} onRetry={onGenerateClick} />}

      {!token && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <PrimaryButton
            data-testid="generate-token"
            onClick={onGenerateClick}
            loading={busy}
            disabled={busy}
          >
            Generate install token
          </PrimaryButton>
          <p className="text-xs text-dc1-text-muted">
            We'll confirm your profile before issuing the single-use token.
          </p>
        </div>
      )}

      {token && (
        <>
          <InstallCommand os={os} token={token} />

          {expiresAt && (
            <p className="text-center text-xs text-dc1-text-muted">
              Token expires {new Date(expiresAt).toLocaleString()}. Single-use only.
            </p>
          )}

          <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
              What the installer does
            </p>
            <ul className="space-y-1 text-dc1-text-secondary">
              {INSTALLER_BEHAVIOUR[os].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-0.5 text-status-success">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton onClick={onContinue} disabled={!token}>
          I ran the command →
        </PrimaryButton>
      </div>

      <LegalConsentModal
        open={modalOpen}
        busy={modalBusy}
        error={modalError}
        onCancel={onModalCancel}
        onSubmit={onModalSubmit}
      />
    </div>
  )
}

function InstallCommand({ os, token }: { os: DetectedOS; token: string }) {
  const cmd = buildCommand(os, token)
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
        {os === 'windows'
          ? 'Open PowerShell as Administrator, then paste:'
          : 'Open Terminal, then paste:'}
      </p>
      <div className="relative rounded-lg border border-dc1-border bg-dc1-void p-4">
        <pre className="overflow-x-auto text-xs leading-relaxed text-dc1-text-primary">
          <code>{cmd}</code>
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton text={cmd} label="Copy" />
        </div>
      </div>
    </div>
  )
}

function buildCommand(os: DetectedOS, token: string): string {
  switch (os) {
    case 'windows':
      return [
        'powershell -ExecutionPolicy Bypass -Command "',
        "  Invoke-WebRequest -Uri 'https://get.dcp.sa/install.ps1' -OutFile dcp_setup.ps1;",
        `  .\\dcp_setup.ps1 -Token '${token}'"`,
      ].join('\n')
    case 'macos':
      return `curl -fsSL https://get.dcp.sa/install.sh | sudo bash -s -- --token ${token}`
    case 'linux':
      return `curl -fsSL https://get.dcp.sa/install.sh | sudo bash -s -- --token ${token}`
    default:
      return `# Unknown OS — check docs.dcp.sa/install. Token: ${token}`
  }
}

const INSTALLER_BEHAVIOUR: Record<DetectedOS, string[]> = {
  windows: [
    'Installs DCP daemon to C:\\DCP\\',
    'Creates Windows service (auto-start)',
    'Adds system-tray app for monitoring',
    'Configures firewall exceptions',
    'Verifies GPU + NVIDIA driver',
    'Registers with api.dcp.sa',
  ],
  macos: [
    'Installs DCP daemon to /usr/local/dcp/',
    'Creates launchd agent (auto-start on login)',
    'Adds menu-bar app for monitoring',
    'Detects Apple Silicon / unified memory',
    'Registers with api.dcp.sa',
  ],
  linux: [
    'Installs DCP daemon to /opt/dcp/',
    'Creates systemd unit (dcpd.service)',
    'Configures udev rules for GPU access',
    'Verifies NVIDIA / ROCm driver',
    'Registers with api.dcp.sa',
  ],
  unknown: [
    'Installs the DCP daemon and registers with api.dcp.sa',
  ],
}
