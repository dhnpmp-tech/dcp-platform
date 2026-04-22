// Shared wizard types + session-state shape.

import type { ProbeReport } from './hardware-probe'

export type StepId = 1 | 2 | 3 | 4 | 5 | 6

export interface Credentials {
  apiKey: string
  email: string
  role: 'provider' | 'renter'
}

export interface GpuSelection {
  vendor: 'nvidia' | 'amd' | 'apple'
  id: string
  label: string
  vramGb: number
  count: number
}

export interface WizardConfig {
  schedule: 'always_on' | 'smart_hours' | 'custom'
  gpuLoadMaxPct: number
  vramMaxPct: number
  powerLimit: 'default' | '250w' | '200w' | 'eco'
  timezone: string
}

export interface WizardSession {
  currentStep: StepId
  credentials: Credentials | null
  gpus: GpuSelection[]
  hourlyUsd: number | null
  hrsPerDay: number
  config: WizardConfig
  installToken: string | null
  installTokenExpires: string | null
  requirementsAck: boolean
  // Hardware probe snapshot from Step 2 — pre-fills Step 3 GPU hint and
  // tagged onto /v1/provider/gpu-profile as `detected_by: 'browser_webgpu'`
  // when we got a real WebGPU vendor back. Null until Step 2 runs.
  probeReport: ProbeReport | null
}

export const DEFAULT_CONFIG: WizardConfig = {
  schedule: 'always_on',
  gpuLoadMaxPct: 100,
  vramMaxPct: 100,
  powerLimit: 'default',
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh'
    : 'Asia/Riyadh',
}

export function defaultSession(): WizardSession {
  return {
    currentStep: 1,
    credentials: null,
    gpus: [],
    hourlyUsd: null,
    hrsPerDay: 12,
    config: DEFAULT_CONFIG,
    installToken: null,
    installTokenExpires: null,
    requirementsAck: false,
    probeReport: null,
  }
}

export const STEP_LABELS = [
  { n: 1, label: 'Sign In' },
  { n: 2, label: 'Requirements' },
  { n: 3, label: 'GPU' },
  { n: 4, label: 'Earnings' },
  { n: 5, label: 'Install' },
  { n: 6, label: 'Verify' },
]
