// OS detection for wizard Step 2/5 adaptive flow.
// Intentionally browser-only — spec Step 2 says the wizard can't probe the
// machine, so we only consume navigator.userAgent / navigator.platform. The
// daemon will confirm the real OS on first-run handshake in Step 6.
//
// Hardware requirements come from the single source of truth at
// app/lib/provider-onboarding.ts (backlog #8) — OS_PROFILES is just a typed
// re-export so existing wizard imports keep working.

import { HARDWARE_REQUIREMENTS } from '../../../lib/provider-onboarding'

export type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown'

export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = (navigator.userAgent || '').toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  if (ua.includes('win') || platform.includes('win')) return 'windows'
  if (ua.includes('mac') || platform.includes('mac')) return 'macos'
  if (ua.includes('linux') || platform.includes('linux')) return 'linux'
  return 'unknown'
}

export interface OSProfile {
  os: DetectedOS
  label: string
  tagline: string
  minReqs: string[]
  gpuDetectHint: string
}

// OS_PROFILES is the wizard-facing alias of the shared hardware matrix. The
// data is defined once in app/lib/provider-onboarding.ts so the wizard,
// /provider/download, and provider-install.ts can never drift on the GPU floor.
export const OS_PROFILES: Record<DetectedOS, OSProfile> = HARDWARE_REQUIREMENTS
