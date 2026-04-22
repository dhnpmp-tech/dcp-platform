// OS detection for wizard Step 2/5 adaptive flow.
// Intentionally browser-only — spec Step 2 says the wizard can't probe the
// machine, so we only consume navigator.userAgent / navigator.platform. The
// daemon will confirm the real OS on first-run handshake in Step 6.

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

export const OS_PROFILES: Record<DetectedOS, OSProfile> = {
  windows: {
    os: 'windows',
    label: 'Windows',
    tagline: 'CUDA-ready desktops & workstations',
    minReqs: [
      'Windows 10 or 11 (64-bit)',
      'NVIDIA GPU — GTX 1060 6GB or newer',
      'NVIDIA driver 525 or newer',
      '16 GB RAM / 50 GB free disk',
      '5+ Mbps sustained upload',
    ],
    gpuDetectHint: 'Open Task Manager → Performance → GPU to see your model and driver version.',
  },
  macos: {
    os: 'macos',
    label: 'macOS',
    tagline: 'Apple Silicon inference nodes',
    minReqs: [
      'macOS 13 Ventura or later',
      'Apple Silicon M1, M2, M3 or M4',
      '16 GB unified memory minimum',
      '50 GB free disk / 5+ Mbps upload',
    ],
    gpuDetectHint: 'Apple menu → About This Mac — confirm the "Chip" row reads "Apple M…".',
  },
  linux: {
    os: 'linux',
    label: 'Linux',
    tagline: 'Servers, rigs, bare-metal GPUs',
    minReqs: [
      'Ubuntu 20.04+, Debian 11+, or RHEL 8+',
      'NVIDIA driver 525+ — or AMD ROCm 5.4+',
      '16 GB RAM / 50 GB free disk',
      '5+ Mbps sustained upload',
    ],
    gpuDetectHint: 'Run `nvidia-smi` (NVIDIA) or `rocminfo` (AMD) in a terminal to confirm the GPU is visible.',
  },
  unknown: {
    os: 'unknown',
    label: 'Your machine',
    tagline: 'We couldn\u2019t auto-detect your OS',
    minReqs: [
      'Modern discrete GPU (NVIDIA 525+, AMD ROCm, or Apple Silicon)',
      '16 GB RAM / 50 GB free disk',
      '5+ Mbps sustained upload',
    ],
    gpuDetectHint: 'Check your system info panel for GPU model and driver version.',
  },
}
