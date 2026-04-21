// GPU catalog + earnings model for wizard Step 3/4.
//
// Rate table must stay in sync with backend/src/config/pricing.js and the
// APPLE_SILICON_RATES block in backend/src/routes/v1-wizard.js. Backend is
// authoritative — these values are for UX estimation only; the /gpu-profile
// endpoint returns the canonical `estimated_hourly_rate` which the wizard
// displays in Step 4.

export interface GpuOption {
  vendor: 'nvidia' | 'amd' | 'apple'
  id: string         // canonical backend id, e.g. "rtx_4090"
  label: string      // display label, e.g. "RTX 4090"
  vramGb: number
  hourlyUsd: number
}

export const NVIDIA_GPUS: GpuOption[] = [
  { vendor: 'nvidia', id: 'rtx_5090',   label: 'RTX 5090',   vramGb: 32, hourlyUsd: 0.394 },
  { vendor: 'nvidia', id: 'rtx_4090',   label: 'RTX 4090',   vramGb: 24, hourlyUsd: 0.267 },
  { vendor: 'nvidia', id: 'rtx_4080',   label: 'RTX 4080',   vramGb: 16, hourlyUsd: 0.131 },
  { vendor: 'nvidia', id: 'rtx_4070ti', label: 'RTX 4070 Ti', vramGb: 12, hourlyUsd: 0.095 },
  { vendor: 'nvidia', id: 'rtx_4060ti', label: 'RTX 4060 Ti', vramGb: 16, hourlyUsd: 0.080 },
  { vendor: 'nvidia', id: 'rtx_3090',   label: 'RTX 3090',   vramGb: 24, hourlyUsd: 0.180 },
  { vendor: 'nvidia', id: 'rtx_3080',   label: 'RTX 3080',   vramGb: 10, hourlyUsd: 0.105 },
  { vendor: 'nvidia', id: 'a100_40g',   label: 'A100 (40GB)', vramGb: 40, hourlyUsd: 0.560 },
  { vendor: 'nvidia', id: 'a100_80g',   label: 'A100 (80GB)', vramGb: 80, hourlyUsd: 0.786 },
  { vendor: 'nvidia', id: 'h100_sxm',   label: 'H100 SXM',   vramGb: 80, hourlyUsd: 1.421 },
  { vendor: 'nvidia', id: 'h200_sxm',   label: 'H200 SXM',   vramGb: 141, hourlyUsd: 2.450 },
]

export const APPLE_GPUS: GpuOption[] = [
  { vendor: 'apple', id: 'm1',         label: 'M1',         vramGb: 16,  hourlyUsd: 0.08 },
  { vendor: 'apple', id: 'm1_pro',     label: 'M1 Pro',     vramGb: 32,  hourlyUsd: 0.15 },
  { vendor: 'apple', id: 'm1_max',     label: 'M1 Max',     vramGb: 64,  hourlyUsd: 0.25 },
  { vendor: 'apple', id: 'm1_ultra',   label: 'M1 Ultra',   vramGb: 128, hourlyUsd: 0.35 },
  { vendor: 'apple', id: 'm2',         label: 'M2',         vramGb: 24,  hourlyUsd: 0.10 },
  { vendor: 'apple', id: 'm2_pro',     label: 'M2 Pro',     vramGb: 32,  hourlyUsd: 0.16 },
  { vendor: 'apple', id: 'm2_max',     label: 'M2 Max',     vramGb: 96,  hourlyUsd: 0.28 },
  { vendor: 'apple', id: 'm2_ultra',   label: 'M2 Ultra',   vramGb: 192, hourlyUsd: 0.48 },
  { vendor: 'apple', id: 'm3',         label: 'M3',         vramGb: 24,  hourlyUsd: 0.10 },
  { vendor: 'apple', id: 'm3_pro',     label: 'M3 Pro',     vramGb: 36,  hourlyUsd: 0.18 },
  { vendor: 'apple', id: 'm3_max',     label: 'M3 Max',     vramGb: 128, hourlyUsd: 0.35 },
  { vendor: 'apple', id: 'm3_ultra',   label: 'M3 Ultra',   vramGb: 192, hourlyUsd: 0.55 },
  { vendor: 'apple', id: 'm4',         label: 'M4',         vramGb: 32,  hourlyUsd: 0.12 },
  { vendor: 'apple', id: 'm4_pro',     label: 'M4 Pro',     vramGb: 48,  hourlyUsd: 0.22 },
  { vendor: 'apple', id: 'm4_max',     label: 'M4 Max',     vramGb: 128, hourlyUsd: 0.40 },
  { vendor: 'apple', id: 'm4_ultra',   label: 'M4 Ultra',   vramGb: 512, hourlyUsd: 0.65 },
]

export const AMD_GPUS: GpuOption[] = [
  { vendor: 'amd', id: 'mi50',  label: 'Radeon Instinct MI50',  vramGb: 16, hourlyUsd: 0.10 },
  { vendor: 'amd', id: 'mi100', label: 'Radeon Instinct MI100', vramGb: 32, hourlyUsd: 0.22 },
  { vendor: 'amd', id: 'mi210', label: 'Radeon Instinct MI210', vramGb: 64, hourlyUsd: 0.38 },
]

export const ALL_GPUS = [...NVIDIA_GPUS, ...APPLE_GPUS, ...AMD_GPUS]

export function findGpu(id: string): GpuOption | undefined {
  return ALL_GPUS.find(g => g.id === id)
}

// Earnings math — monthly at N hrs/day × 30 days × utilisation.
// Utilisation assumption (70%) matches /provider/earnings backend calc.
export function estimateEarnings(hourlyUsd: number, hrsPerDay: number) {
  const daily = hourlyUsd * hrsPerDay
  const monthly = daily * 30 * 0.70
  const monthly24x7 = hourlyUsd * 24 * 30 * 0.70
  return {
    hourly: hourlyUsd,
    daily,
    monthly,
    monthly24x7,
    hourlySar: hourlyUsd * 3.75,
    monthlySar: monthly * 3.75,
  }
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}
