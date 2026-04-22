// Browser-side hardware probe for wizard Step 2.
//
// What the browser actually exposes (Tito's spec acknowledges this, see
// docs/technical-specs/web-wizard-spec.md line 144 — "wizard can't probe
// the machine"). We probe what we CAN and mark everything else "unknown"
// so the UI can fall back to a self-acknowledge checkbox.
//
// Reliable signals:          OS family (userAgent), CPU cores
// Chrome-only (≥113):        WebGPU adapter vendor + architecture
// Fuzzy / privacy-capped:    deviceMemory (capped at 8), connection class
// Never exposed:             GPU model, VRAM, driver version, free disk,
//                            upload speed, Apple chip name, OS version
//
// The daemon re-verifies everything on first-run handshake (Step 6), so
// this is purely a UX hint — never used for gating real decisions.

import { detectOS, type DetectedOS } from './os-detect'

export type ProbeStatus =
  | 'detected'     // probe succeeded and the value is trustworthy
  | 'detected_fuzzy' // probe returned a value but it's capped/coarse
  | 'unsupported'  // API doesn't exist in this browser (Safari/Firefox for WebGPU, etc.)
  | 'unavailable'  // API exists but returned no data (no GPU, offline, etc.)

export interface OSProbe {
  status: ProbeStatus
  os: DetectedOS
  raw: string          // raw userAgent for diagnostics
  is64bit: boolean | null
}

export interface CpuProbe {
  status: ProbeStatus
  cores: number | null
}

export interface MemoryProbe {
  status: ProbeStatus
  // navigator.deviceMemory is privacy-capped at 8 — if we see 8 we only know "≥ 8",
  // we cannot confirm the 16 GB floor.
  gbReported: number | null
  meetsSixteenGbFloor: boolean | null  // null = cannot confirm either way
}

export type GpuVendorGuess = 'nvidia' | 'amd' | 'apple' | 'intel' | 'unknown'

export interface GpuProbe {
  status: ProbeStatus
  vendorGuess: GpuVendorGuess
  architecture: string | null    // e.g. "apple-gpu", "ampere", empty string common
  description: string | null     // whatever the adapter hands back — often empty
  source: 'webgpu' | 'webgl' | null
}

export interface NetworkProbe {
  status: ProbeStatus
  effectiveType: string | null   // "4g" | "3g" | "2g" | "slow-2g"
  downlinkMbps: number | null    // DOWNLOAD — upload is never exposed
}

export interface ProbeReport {
  os: OSProbe
  cpu: CpuProbe
  memory: MemoryProbe
  gpu: GpuProbe
  network: NetworkProbe
  completedAt: number            // epoch ms — so consumers can invalidate
}

// ──────────────────────────────────────────────────────────────────────
// Individual probes
// Each returns synchronously or within a short timeout; none throws.
// ──────────────────────────────────────────────────────────────────────

export function probeOS(): OSProbe {
  if (typeof navigator === 'undefined') {
    return { status: 'unsupported', os: 'unknown', raw: '', is64bit: null }
  }
  const raw = navigator.userAgent || ''
  const os = detectOS()
  // "64" token covers Win64/WOW64/x86_64/aarch64. Apple Silicon UA never
  // announces bitness but is always 64-bit — treat macOS as 64.
  const is64bit =
    os === 'macos' ? true :
    /(?:win64|wow64|x86_64|amd64|arm64|aarch64)/i.test(raw) ? true :
    /(?:win32|i386|i686)/i.test(raw) ? false :
    null
  return {
    status: os === 'unknown' ? 'unavailable' : 'detected',
    os,
    raw,
    is64bit,
  }
}

export function probeCpu(): CpuProbe {
  if (typeof navigator === 'undefined' || typeof navigator.hardwareConcurrency !== 'number') {
    return { status: 'unsupported', cores: null }
  }
  const cores = navigator.hardwareConcurrency
  if (!cores || cores < 1) {
    return { status: 'unavailable', cores: null }
  }
  return { status: 'detected', cores }
}

export function probeMemory(): MemoryProbe {
  // `deviceMemory` is non-standard typing in TS lib.dom — cast via unknown.
  const nav = typeof navigator === 'undefined' ? null : navigator as unknown as { deviceMemory?: number }
  if (!nav || typeof nav.deviceMemory !== 'number') {
    return { status: 'unsupported', gbReported: null, meetsSixteenGbFloor: null }
  }
  const gb = nav.deviceMemory
  // Spec caps deviceMemory at 8 for privacy; seeing 8 means "≥ 8", not "= 8".
  // We cannot affirmatively verify 16 GB from the browser, ever. We only
  // flag a FAIL when the reported value is strictly less than 8.
  const meetsFloor = gb >= 8 ? null : false
  return {
    status: 'detected_fuzzy',
    gbReported: gb,
    meetsSixteenGbFloor: meetsFloor,
  }
}

interface WebGpuAdapterInfoLike {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
}

interface WebGpuAdapterLike {
  info?: WebGpuAdapterInfoLike
  requestAdapterInfo?: () => Promise<WebGpuAdapterInfoLike>
}

interface NavigatorGpuLike {
  requestAdapter?: (opts?: unknown) => Promise<WebGpuAdapterLike | null>
}

function normalizeVendor(raw: string | undefined): GpuVendorGuess {
  const v = (raw || '').toLowerCase()
  if (!v) return 'unknown'
  if (v.includes('nvidia')) return 'nvidia'
  if (v.includes('apple')) return 'apple'
  if (v.includes('amd') || v.includes('ati') || v.includes('radeon')) return 'amd'
  if (v.includes('intel')) return 'intel'
  return 'unknown'
}

// WebGL fallback — deprecated but still the only signal on Firefox.
// Returns a vendor guess pulled from the UNMASKED_RENDERER_WEBGL extension,
// or null if the browser blocks it.
function probeGpuWebgl(): GpuProbe | null {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return null
    const dbg = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number
      UNMASKED_VENDOR_WEBGL: number
    } | null
    if (!dbg) return null
    const renderer = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) || ''
    const vendor = (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string) || ''
    const guess = normalizeVendor(`${renderer} ${vendor}`)
    return {
      status: guess === 'unknown' ? 'unavailable' : 'detected_fuzzy',
      vendorGuess: guess,
      architecture: null,
      description: renderer || vendor || null,
      source: 'webgl',
    }
  } catch {
    return null
  }
}

export async function probeGpu(timeoutMs = 2000): Promise<GpuProbe> {
  const nav = typeof navigator === 'undefined' ? null : navigator as unknown as { gpu?: NavigatorGpuLike }

  // WebGPU path (Chrome 113+, Edge, recent Safari TP — but flagged off on
  // stable Safari/Firefox as of this writing).
  if (nav?.gpu?.requestAdapter) {
    try {
      const adapterPromise = nav.gpu.requestAdapter()
      const adapter = await Promise.race([
        adapterPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ])
      if (adapter) {
        // Chrome 113+ exposes `.info` directly; older drafts used
        // `requestAdapterInfo()`. Try both.
        let info: WebGpuAdapterInfoLike | undefined = adapter.info
        if (!info && adapter.requestAdapterInfo) {
          try { info = await adapter.requestAdapterInfo() } catch { /* ignore */ }
        }
        if (info) {
          const guess = normalizeVendor(info.vendor)
          return {
            status: guess === 'unknown' ? 'detected_fuzzy' : 'detected',
            vendorGuess: guess,
            architecture: info.architecture || null,
            description: info.description || info.device || null,
            source: 'webgpu',
          }
        }
      }
    } catch {
      // fall through to WebGL fallback
    }
  }

  // WebGL fallback
  const wg = probeGpuWebgl()
  if (wg) return wg

  return {
    status: 'unsupported',
    vendorGuess: 'unknown',
    architecture: null,
    description: null,
    source: null,
  }
}

interface NetworkInfoLike {
  effectiveType?: string
  downlink?: number
}

export function probeNetwork(): NetworkProbe {
  const nav = typeof navigator === 'undefined' ? null : navigator as unknown as {
    connection?: NetworkInfoLike
    mozConnection?: NetworkInfoLike
    webkitConnection?: NetworkInfoLike
  }
  const conn = nav?.connection ?? nav?.mozConnection ?? nav?.webkitConnection
  if (!conn) {
    return { status: 'unsupported', effectiveType: null, downlinkMbps: null }
  }
  const effectiveType = conn.effectiveType || null
  const downlink = typeof conn.downlink === 'number' ? conn.downlink : null
  if (!effectiveType && downlink === null) {
    return { status: 'unavailable', effectiveType: null, downlinkMbps: null }
  }
  return { status: 'detected_fuzzy', effectiveType, downlinkMbps: downlink }
}

// ──────────────────────────────────────────────────────────────────────
// Top-level: run all probes in parallel with a hard cap.
// ──────────────────────────────────────────────────────────────────────

export async function runAllProbes(timeoutMs = 2500): Promise<ProbeReport> {
  const osRes = probeOS()
  const cpuRes = probeCpu()
  const memRes = probeMemory()
  const netRes = probeNetwork()
  const gpuRes = await probeGpu(timeoutMs)
  return {
    os: osRes,
    cpu: cpuRes,
    memory: memRes,
    gpu: gpuRes,
    network: netRes,
    completedAt: Date.now(),
  }
}
