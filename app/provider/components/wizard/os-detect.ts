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
  flag: string
  minReqs: string[]
  gpuDetectHint: string
}

export const OS_PROFILES: Record<DetectedOS, OSProfile> = {
  windows: {
    os: 'windows',
    label: 'Windows',
    flag: '🪟',
    minReqs: [
      'Windows 10/11 (64-bit)',
      'NVIDIA GPU (GTX 1060 6GB+)',
      'NVIDIA driver 525 or newer',
      '16 GB RAM, 50 GB free disk',
      '5+ Mbps upload',
    ],
    gpuDetectHint: 'Open Task Manager → Performance → GPU.',
  },
  macos: {
    os: 'macos',
    label: 'macOS',
    flag: '🍎',
    minReqs: [
      'macOS 13 (Ventura) or later',
      'Apple Silicon M1/M2/M3/M4',
      '16 GB unified memory minimum',
      '50 GB free disk, 5+ Mbps upload',
    ],
    gpuDetectHint: ' menu → About This Mac. Look for Chip: Apple M…',
  },
  linux: {
    os: 'linux',
    label: 'Linux',
    flag: '🐧',
    minReqs: [
      'Ubuntu 20.04+ / Debian 11+ / RHEL 8+',
      'NVIDIA GPU + driver 525+  OR  AMD (ROCm 5.4+)',
      '16 GB RAM, 50 GB free disk',
      '5+ Mbps upload',
    ],
    gpuDetectHint: 'Run `nvidia-smi` or `rocminfo` in a terminal.',
  },
  unknown: {
    os: 'unknown',
    label: 'Your Machine',
    flag: '💻',
    minReqs: [
      'Modern discrete GPU (NVIDIA 525+ / AMD ROCm / Apple Silicon)',
      '16 GB RAM, 50 GB free disk',
      '5+ Mbps upload',
    ],
    gpuDetectHint: 'Check your system info for GPU model and driver.',
  },
}
