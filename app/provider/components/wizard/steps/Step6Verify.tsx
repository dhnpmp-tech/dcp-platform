'use client'

// Step 6: Verify. Polls /v1/provider/node-status every 5s until the daemon
// phones home (via /provider/register-node on its end). On success we show
// a celebration card and link to the dashboard.

import { useEffect, useRef, useState } from 'react'
import {
  ErrorBox, PrimaryButton, SecondaryButton, v1Fetch, V1Error,
} from '../primitives'

interface Step6Props {
  apiKey: string
  onBack: () => void
  onDone: () => void
}

// Earned-state machine from GET /v1/provider/node-status. `live` is the single
// source of truth for the "You're Live" claim — it is true ONLY when the node
// is approved AND heartbeating within 90s AND not paused. We must NOT re-derive
// liveness from `connected`/`status` on the client (that defeats the
// earned-state design and can show a false "You're Live").
type WizardLiveState =
  | 'live'
  | 'pending_approval'
  | 'no_recent_heartbeat'
  | 'paused'

interface NodeStatusResponse {
  live: boolean
  state: WizardLiveState
  state_message: string
  next_step: string | null
  connected: boolean
  status: 'pending' | 'registered' | 'active' | 'online' | 'inactive'
  node_id?: string | null
  approval_status?: string
  is_paused?: boolean
  heartbeat_age_seconds?: number | null
  last_seen_at?: string | null
  last_seen?: string | null
  daemon_version?: string | null
  gpu_model?: string | null
  vram_gb?: number | null
  os?: string | null
  driver_version?: string | null
}

export function Step6Verify({ apiKey, onBack, onDone }: Step6Props) {
  const [status, setStatus] = useState<NodeStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const r = await v1Fetch<NodeStatusResponse>('/provider/node-status', { apiKey })
        if (cancelled) return
        setStatus(r)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof V1Error ? e.message : 'Could not reach api.dcp.sa')
      }
    }

    poll()                              // immediate probe
    timerRef.current = setInterval(() => {
      setElapsed((n) => n + 5)
      poll()
    }, 5000)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [apiKey])

  // Liveness is EARNED, not derived. Trust the backend `live` flag — it already
  // gates on approval + fresh heartbeat + not-paused. Re-deriving from
  // `connected`/`status` here previously let the UI claim "You're Live" for a
  // node that was merely registered but not approved/heartbeating.
  const isLive = status?.live === true

  if (isLive) {
    return (
      <div className="space-y-5 rounded-2xl border border-status-success/40 bg-status-success/5 p-6 md:p-8 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">You&apos;re Live</h2>
        <p className="text-sm text-dc1-text-secondary">
          {status?.state_message ?? 'Your node is online and ready to earn.'}
        </p>
        <dl className="mx-auto grid max-w-md grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-dc1-border bg-dc1-surface-l1 p-4 text-left text-sm">
          <dt className="text-dc1-text-muted">Node ID</dt>
          <dd className="font-mono text-dc1-text-primary">{status?.node_id ?? '—'}</dd>
          {status?.gpu_model && (<>
            <dt className="text-dc1-text-muted">GPU</dt>
            <dd className="text-dc1-text-primary">{status.gpu_model}</dd>
          </>)}
          {status?.driver_version && (<>
            <dt className="text-dc1-text-muted">Driver</dt>
            <dd className="text-dc1-text-primary">{status.driver_version}</dd>
          </>)}
          {status?.daemon_version && (<>
            <dt className="text-dc1-text-muted">Daemon</dt>
            <dd className="text-dc1-text-primary">v{status.daemon_version}</dd>
          </>)}
          <dt className="text-dc1-text-muted">Status</dt>
          <dd className="text-status-success">🟢 Active</dd>
        </dl>
        <PrimaryButton onClick={onDone} className="mx-auto">
          Go to dashboard →
        </PrimaryButton>
        <p className="text-xs text-dc1-text-muted">Welcome to DCP 🇸🇦</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">Waiting for your daemon…</h2>
        <p className="mt-1 text-sm text-dc1-text-secondary">
          Don&apos;t close this page. Once your daemon connects, we&apos;ll verify everything automatically.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent" />
        <div className="flex-1 text-sm">
          {/* Prefer the backend's plain-language earned-state copy. It explains
              exactly which gate is still open (approval / heartbeat / paused),
              so the user isn't left guessing. Fall back to status-derived copy
              only when the new fields are absent (older backend). */}
          <p className="font-semibold text-dc1-text-primary">
            {status?.state_message
              ? status.state_message
              : status?.status === 'registered'
              ? 'Registered — waiting for first heartbeat from daemon'
              : status?.status === 'pending'
              ? 'Waiting for daemon to register…'
              : 'Connecting…'}
          </p>
          {status?.next_step && (
            <p className="mt-1 text-xs text-dc1-text-secondary">{status.next_step}</p>
          )}
          <p className="mt-1 text-xs text-dc1-text-muted">
            Checking every 5 seconds ({elapsed}s elapsed) — typically takes 30–60 seconds
          </p>
        </div>
      </div>

      {elapsed >= 300 && (
        <div className="rounded-lg border border-status-error/40 bg-status-error/5 p-4 text-sm">
          <p className="font-semibold text-status-error">Still not connected after 5 minutes</p>
          <p className="mt-1 text-xs text-dc1-text-secondary">
            Check if the installer completed without errors, and that your firewall allows outbound
            HTTPS to api.dcp.sa. You can go back and re-run the install command.
          </p>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      <details className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 text-sm" open={elapsed >= 120}>
        <summary className="cursor-pointer font-semibold text-dc1-text-primary">
          Troubleshooting
        </summary>
        <ul className="mt-3 space-y-1.5 text-xs text-dc1-text-secondary">
          <li>• Command didn&apos;t run? Go back to re-show the install command or download the desktop app.</li>
          <li>• Error in terminal? Check that you ran as Administrator (Windows) / with sudo (Linux/macOS).</li>
          <li>• macOS: approve the app in System Settings → Privacy &amp; Security if prompted.</li>
          <li>• Taking too long? Verify your firewall allows outbound HTTPS to api.dcp.sa.</li>
          <li>• WireGuard issue? The installer configures the tunnel automatically — check your network connection.</li>
          <li>• Still stuck? <a href="/support?category=provider" className="text-dc1-amber hover:underline">Contact support</a> with your provider email.</li>
        </ul>
      </details>

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>← Re-show install command</SecondaryButton>
        <a
          href="/support"
          className="text-sm text-dc1-amber hover:underline"
        >
          Contact support
        </a>
      </div>
    </div>
  )
}
