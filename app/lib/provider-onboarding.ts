// Single source of truth for provider onboarding surfaces.
//
// Backlog #8: three surfaces previously emitted DIFFERENT install commands and
// contradicted each other on hardware specs and run-mode values:
//
//   1. Web wizard Step5Install — token flow: `curl -fsSL https://dcp.sa/install.sh
//      | sudo bash -s -- --token <T>` (canonical).
//   2. app/lib/provider-install.ts — key-in-URL flow: `curl -sSL
//      https://api.dcp.sa/install | bash -s -- <KEY>` (different host/path,
//      no sudo). DEPRECATED — never give the key out in a shell-history-visible
//      one-liner; the install token is single-use and consent-gated.
//   3. app/provider/download/page.tsx — its own OS cards + a third copy of the
//      key-in-URL command.
//
// Hardware floor contradiction: the wizard stated "GTX 1060 6GB or newer" while
// /provider/download stated "RTX 2060+ (8 GB+ VRAM)". Reconciled to a SINGLE
// minimum below (GTX 1060, 6 GB) — the actual supported floor.
//
// run_mode contradiction: the wizard used `always_on | smart_hours | custom`
// while the desktop app + daemon use `always | idle | scheduled`. Canonical
// enum is `always | idle | scheduled` — see RUN_MODES.
//
// Everything onboarding-related (install command, hardware matrix, run modes)
// now lives here. Surfaces import from this module instead of redefining.

// ──────────────────────────────────────────────────────────────────────────
// OS targets
// ──────────────────────────────────────────────────────────────────────────

export type OnboardingOS = 'windows' | 'macos' | 'linux' | 'unknown'

// ──────────────────────────────────────────────────────────────────────────
// Canonical install command builder
// ──────────────────────────────────────────────────────────────────────────
//
// SINGLE canonical flow: single-use install TOKEN via dcp.sa/install.sh (Unix)
// or dcp.sa/install.ps1 (Windows PowerShell). The key-in-URL form is
// deprecated — it leaks the long-lived provider key into shell history.
//
// The token is consent-gated and single-use, consumed by the daemon's
// register-node call on first heartbeat. When no token is available yet
// (e.g. the public /earn teaser before sign-in), pass `token: null` to render
// a placeholder one-liner that mirrors the real command shape.

export const INSTALL_HOST = 'dcp.sa'
export const INSTALL_SCRIPT_SH = `https://${INSTALL_HOST}/install.sh`
export const INSTALL_SCRIPT_PS1 = `https://${INSTALL_HOST}/install.ps1`

const TOKEN_PLACEHOLDER = '<YOUR_INSTALL_TOKEN>'

export interface InstallCommandArgs {
  os: OnboardingOS
  /** Single-use install token. Null/empty renders a placeholder one-liner. */
  token?: string | null
}

/**
 * Build the single canonical install command for an OS.
 *
 * Unix (macOS/Linux):
 *   curl -fsSL https://dcp.sa/install.sh | sudo bash -s -- --token <T>
 * Windows (PowerShell as Admin):
 *   powershell -ExecutionPolicy Bypass -Command "
 *     Invoke-WebRequest -Uri 'https://dcp.sa/install.ps1' -OutFile dcp_setup.ps1;
 *     .\dcp_setup.ps1 -Token '<T>'"
 */
export function buildInstallCommand({ os, token }: InstallCommandArgs): string {
  const tok = token && token.trim() ? token.trim() : TOKEN_PLACEHOLDER
  switch (os) {
    case 'windows':
      return [
        'powershell -ExecutionPolicy Bypass -Command "',
        `  Invoke-WebRequest -Uri '${INSTALL_SCRIPT_PS1}' -OutFile dcp_setup.ps1;`,
        `  .\\dcp_setup.ps1 -Token '${tok}'"`,
      ].join('\n')
    case 'macos':
    case 'linux':
      return `curl -fsSL ${INSTALL_SCRIPT_SH} | sudo bash -s -- --token ${tok}`
    case 'unknown':
    default:
      // Mirror the Unix shape so the placeholder is still copy-paste-meaningful;
      // the user picks an OS in the wizard before this resolves for real.
      return `curl -fsSL ${INSTALL_SCRIPT_SH} | sudo bash -s -- --token ${tok}`
  }
}

/** True when the resolved command still carries the placeholder token. */
export function isPlaceholderInstallCommand(cmd: string): boolean {
  return cmd.includes(TOKEN_PLACEHOLDER)
}

// ──────────────────────────────────────────────────────────────────────────
// Hardware requirements — ONE matrix
// ──────────────────────────────────────────────────────────────────────────
//
// Reconciles the GTX 1060-6GB vs RTX 2060-8GB contradiction to a single stated
// minimum: GTX 1060 (6 GB VRAM). This is the floor; anything newer is fine.

export const GPU_MIN_NVIDIA = 'NVIDIA GTX 1060 (6 GB VRAM) or newer'
export const GPU_MIN_NVIDIA_DRIVER = 'NVIDIA driver 525 or newer'
export const RAM_MIN_GB = 16
export const DISK_MIN_GB = 50
export const UPLOAD_MIN_MBPS = 5

export interface HardwareRequirement {
  /** Stable key for analytics / ack checkboxes. */
  key: string
  /** Short label, e.g. "GPU". */
  label: string
  /** Full requirement detail string. */
  detail: string
}

export interface OSHardwareProfile {
  os: OnboardingOS
  label: string
  tagline: string
  /** Bullet list of minimum requirements for this OS. */
  minReqs: string[]
  /** Where to look to confirm GPU model/driver. */
  gpuDetectHint: string
}

// Per-OS minimums. The GPU floor is GTX 1060 6GB everywhere it applies.
export const HARDWARE_REQUIREMENTS: Record<OnboardingOS, OSHardwareProfile> = {
  windows: {
    os: 'windows',
    label: 'Windows',
    tagline: 'CUDA-ready desktops & workstations',
    minReqs: [
      'Windows 10 or 11 (64-bit)',
      GPU_MIN_NVIDIA,
      GPU_MIN_NVIDIA_DRIVER,
      `${RAM_MIN_GB} GB RAM / ${DISK_MIN_GB} GB free disk`,
      `${UPLOAD_MIN_MBPS}+ Mbps sustained upload`,
    ],
    gpuDetectHint:
      'Open Task Manager → Performance → GPU to see your model and driver version.',
  },
  macos: {
    os: 'macos',
    label: 'macOS',
    tagline: 'Apple Silicon inference nodes',
    minReqs: [
      'macOS 13 Ventura or later',
      'Apple Silicon M1, M2, M3 or M4',
      `${RAM_MIN_GB} GB unified memory minimum`,
      `${DISK_MIN_GB} GB free disk / ${UPLOAD_MIN_MBPS}+ Mbps upload`,
    ],
    gpuDetectHint:
      'Apple menu → About This Mac — confirm the "Chip" row reads "Apple M…".',
  },
  linux: {
    os: 'linux',
    label: 'Linux',
    tagline: 'Servers, rigs, bare-metal GPUs',
    minReqs: [
      'Ubuntu 20.04+, Debian 11+, or RHEL 8+',
      `${GPU_MIN_NVIDIA} (driver 525+) — or AMD ROCm 5.4+`,
      `${RAM_MIN_GB} GB RAM / ${DISK_MIN_GB} GB free disk`,
      `${UPLOAD_MIN_MBPS}+ Mbps sustained upload`,
    ],
    gpuDetectHint:
      'Run `nvidia-smi` (NVIDIA) or `rocminfo` (AMD) in a terminal to confirm the GPU is visible.',
  },
  unknown: {
    os: 'unknown',
    label: 'Your machine',
    tagline: 'We couldn’t auto-detect your OS',
    minReqs: [
      `${GPU_MIN_NVIDIA}, AMD ROCm 5.4+, or Apple Silicon`,
      `${RAM_MIN_GB} GB RAM / ${DISK_MIN_GB} GB free disk`,
      `${UPLOAD_MIN_MBPS}+ Mbps sustained upload`,
    ],
    gpuDetectHint: 'Check your system info panel for GPU model and driver version.',
  },
}

// Flat requirement rows for the /provider/download "System Requirements" table.
// Built from the same constants so it can never drift from the per-OS matrix.
export const HARDWARE_REQUIREMENT_ROWS: HardwareRequirement[] = [
  {
    key: 'gpu',
    label: 'GPU',
    detail: `${GPU_MIN_NVIDIA} or Apple Silicon (M1/M2/M3/M4)`,
  },
  {
    key: 'python',
    label: 'Python 3.10+',
    detail: 'Required for the DCP daemon process',
  },
  {
    key: 'os',
    label: 'Operating System',
    detail: 'Windows 10/11, macOS 13+ (Apple Silicon), or Ubuntu 20.04+',
  },
  {
    key: 'ram',
    label: 'Memory & Storage',
    detail: `${RAM_MIN_GB} GB RAM minimum, ${DISK_MIN_GB} GB free disk`,
  },
  {
    key: 'internet',
    label: 'Internet',
    detail: `Stable connection, ${UPLOAD_MIN_MBPS}+ Mbps sustained upload, for receiving inference jobs`,
  },
]

// ──────────────────────────────────────────────────────────────────────────
// Run modes — canonical enum
// ──────────────────────────────────────────────────────────────────────────
//
// Canonical values match the desktop app + daemon: always | idle | scheduled.
// Replaces the wizard's old always_on | smart_hours | custom.

export type RunMode = 'always' | 'idle' | 'scheduled'

export interface RunModeOption {
  value: RunMode
  label: string
  description: string
}

export const RUN_MODES: RunModeOption[] = [
  {
    value: 'always',
    label: 'Always On',
    description: 'Daemon runs whenever the machine is on — maximum availability.',
  },
  {
    value: 'idle',
    label: 'When Idle',
    description: 'Only earns while your machine is otherwise idle.',
  },
  {
    value: 'scheduled',
    label: 'Scheduled',
    description: 'Runs during the hours you choose (set after install).',
  },
]

export const DEFAULT_RUN_MODE: RunMode = 'always'

export function runModeLabel(value: RunMode): string {
  return RUN_MODES.find((m) => m.value === value)?.label ?? value
}
