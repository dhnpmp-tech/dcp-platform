// NOTE: install-command + hardware-spec + run_mode logic now lives in the
// single source of truth at app/lib/provider-onboarding.ts (backlog #8). This
// module retains only the still-used onboarding-state helpers and daemon
// download/API-base utilities. The legacy key-in-URL command builder below is
// deprecated and re-exports the canonical token-based builder.

import { buildInstallCommand, type OnboardingOS } from './provider-onboarding'

const API_BASE = '/api/dcp'
const PUBLIC_API_FALLBACK = `https://api.dcp.sa/api`

export type InstallTarget = 'linux' | 'windows' | 'macos'
export type ProviderNextActionState = 'waiting' | 'heartbeat' | 'ready' | 'paused' | 'stale'

function normalizeApiBase(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function getProviderInstallApiBase(): string {
  const envBase = process.env.NEXT_PUBLIC_DC1_API
  if (envBase) {
    const normalized = normalizeApiBase(envBase)
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized
    }
    if (typeof window !== 'undefined' && normalized.startsWith('/')) {
      return `${window.location.origin}${normalized}`
    }
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}${API_BASE}`
  }

  return PUBLIC_API_FALLBACK
}

/**
 * @deprecated The key-in-URL install form leaked the long-lived provider key
 * into shell history. Use `buildInstallCommand` from
 * `app/lib/provider-onboarding.ts` (single-use token flow) instead.
 *
 * This wrapper now delegates to the canonical token-based builder so any
 * remaining callers emit the unified command. The `apiBase`/`key` arguments
 * are ignored (kept for signature compatibility); pass the install token via
 * the canonical builder where one is available.
 */
export function buildProviderInstallCommand(
  target: InstallTarget,
  _apiBase: string,
  _key: string,
): string {
  return buildInstallCommand({ os: target as OnboardingOS, token: null })
}

export function buildProviderDaemonDownloadUrl(apiBase: string, key: string): string {
  return `${apiBase}/providers/download/daemon?key=${encodeURIComponent(key || 'YOUR_PROVIDER_KEY')}`
}

export function buildProviderTroubleshootingHref(state: ProviderNextActionState): string {
  switch (state) {
    case 'waiting':
      return '/docs/provider-guide#status-waiting-install-daemon'
    case 'heartbeat':
      return '/docs/provider-guide#status-heartbeat-verify-telemetry'
    case 'ready':
      return '/docs/provider-guide#status-ready-monitor-jobs'
    case 'paused':
      return '/docs/provider-guide#status-paused-resume-provider'
    case 'stale':
    default:
      return '/docs/provider-guide#status-stale-restart-daemon'
  }
}

export function getProviderOnboardingStep(state: ProviderNextActionState): string {
  switch (state) {
    case 'waiting':
      return 'install_daemon'
    case 'heartbeat':
      return 'verify_heartbeat'
    case 'ready':
      return 'accept_jobs'
    case 'paused':
      return 'resume_provider'
    case 'stale':
    default:
      return 'restart_daemon'
  }
}
