'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { displayGpuType } from '@/app/lib/useGpuTypes'
import WorkspacePanel from '../workspace/WorkspacePanel'
import type { WorkspaceVolume } from '../workspace/workspaceApi'
import { PodSidebar, PodTopbar, initials } from './PodShell'
import './pods.css'

// ── Pod domain constants (ported verbatim from the v1 pods page) ──────
const POD_REFRESH_MS = 8000
const MIN_TOKEN_LENGTH = 16
const DEFAULT_DURATION_MINUTES = 60

// Launchable, PREPAID durations. A launch debits the full-duration quote
// upfront (rate + 40% per gpu-second); an early stop refunds the difference.
// Capped at 48h on demand — backend rejects > 2880 min with EXCEEDS_MAX_DURATION
// (pods.js). Anything longer is a separate owner-decided "reserved capacity"
// track, surfaced below the selector as a non-launchable contact-us hint.
const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
  { minutes: 480, label: '8h' },
  { minutes: 1440, label: '24h' },
  { minutes: 2160, label: '36h' },
  { minutes: 2880, label: '48h' },
]

// Friendly aliases map to pre-baked dcp-compute:<alias> images (sshd baked in →
// fast start). "Custom…" lets the renter pass any valid Docker image reference,
// which the daemon boots with sshd injected. PyTorch is the default.
interface ImagePreset {
  value: string
  label: string
  labelAr: string
}

interface LaunchTemplate {
  key: string
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  image: string
  durationMin?: number
  workloadKey?: string
  disabled?: boolean
  badgeEn?: string
  badgeAr?: string
}

const IMAGE_PRESETS: ImagePreset[] = [
  { value: 'pytorch', label: 'PyTorch', labelAr: 'PyTorch' },
  { value: 'vllm', label: 'vLLM serve', labelAr: 'vLLM للخدمة' },
  { value: 'cuda', label: 'CUDA base', labelAr: 'CUDA أساسي' },
  { value: 'ubuntu', label: 'Ubuntu base', labelAr: 'Ubuntu أساسي' },
]
const CUSTOM_IMAGE_OPTION = 'custom'
const DEFAULT_IMAGE = 'pytorch'

const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  {
    key: 'notebook-pytorch',
    titleEn: 'Notebook / PyTorch',
    titleAr: 'دفتر / PyTorch',
    descEn: 'CUDA-ready Python notebook with SSH for experiments and training scripts.',
    descAr: 'دفتر Python جاهز لـ CUDA مع SSH للتجارب وسكربتات التدريب.',
    image: 'pytorch',
    durationMin: 60,
    workloadKey: 'notebook',
  },
  {
    key: 'serve-vllm',
    titleEn: 'vLLM serve pod',
    titleAr: 'حاوية خدمة vLLM',
    descEn: 'Inference server experiments with Jupyter and SSH access.',
    descAr: 'تجارب خدمة الاستدلال مع وصول Jupyter وSSH.',
    image: 'vllm',
    durationMin: 120,
    workloadKey: 'infer',
  },
  {
    key: 'sft-pytorch',
    titleEn: 'SFT / QLoRA prep',
    titleAr: 'تجهيز SFT / QLoRA',
    descEn: 'Stage data in /workspace, then launch a PyTorch pod for adapter work.',
    descAr: 'جهّز البيانات في /workspace ثم شغّل حاوية PyTorch لعمل المحوّلات.',
    image: 'pytorch',
    durationMin: 240,
    workloadKey: 'finetune',
    badgeEn: 'LoRA path',
    badgeAr: 'مسار LoRA',
  },
  {
    key: 'cuda-base',
    titleEn: 'CUDA base',
    titleAr: 'CUDA أساسي',
    descEn: 'Bare CUDA runtime for custom installers and low-level GPU checks.',
    descAr: 'بيئة CUDA أساسية للمثبتات المخصصة وفحوصات GPU المنخفضة.',
    image: 'cuda',
    durationMin: 60,
  },
  {
    key: 'lora-verification',
    titleEn: 'LoRA stack image',
    titleAr: 'صورة LoRA',
    descEn: 'Built in repo; GPU-host smoke verification is still the release gate.',
    descAr: 'مبنية في المستودع؛ تحقق GPU-host ما زال بوابة الإطلاق.',
    image: 'lora',
    durationMin: 240,
    workloadKey: 'finetune',
    disabled: true,
    badgeEn: 'Verification pending',
    badgeAr: 'بانتظار التحقق',
  },
]

const ACTIVE_POD_STATUSES = new Set(['queued', 'assigned', 'pulling', 'running', 'starting'])

// ── GPU selector constants ────────────────────────────────────────────
// Fixed SAR↔USD peg (3.75 SAR = 1 USD). USD is a SECONDARY, approximate
// display only — SAR is the source of truth and the billed currency.
const SAR_TO_USD = 1 / 3.75
// VRAM band boundary. ≤ this → "Workhorse & consumer"; above → "Data-center".
const VRAM_BAND_GB = 32
// GPU types we mark with a quiet "Best value" ribbon — the cheapest strong pick
// in each band. Keyed by gpu_model substring (case-insensitive), recomputed at
// render against live stock so we never ribbon an out-of-stock type.
const VALUE_PICK_MATCHES = ['rtx 3090', 'h100']

type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'vram-desc' | 'vram-asc' | 'name'
type AvailFilter = 'available' | 'priced'

// VRAM band keys + their bilingual labels/subtitles.
const BANDS: { key: 'workhorse' | 'datacenter'; en: string; ar: string; subEn: string; subAr: string }[] = [
  { key: 'workhorse', en: 'Workhorse & consumer', ar: 'للعمل اليومي والمستهلك', subEn: '32 GB and under', subAr: '32 غيغابايت وأقل' },
  { key: 'datacenter', en: 'Data-center & high-VRAM', ar: 'مراكز البيانات وذاكرة عالية', subEn: '48 GB and above', subAr: '48 غيغابايت فأكثر' },
]

// Optional "Guide me by workload" presets. Each sets a VRAM floor + a preferred
// gpu_model substring; the recommendation resolves against live stock at click.
interface Workload {
  key: string
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  floor: number
  prefer: string // gpu_model substring of the preferred pick
  /** Optional image alias + duration the preset pre-selects (the Experiment
   *  pod uses this — a pod-shaped test server beats a bare vLLM on the node,
   *  see the 2026-07-03 VRAM-parking incident + team policy). */
  image?: string
  durationMin?: number
}
const WORKLOADS: Workload[] = [
  { key: 'finetune', titleEn: 'Fine-tune 7–13B', titleAr: 'ضبط 7–13B', descEn: 'LoRA / QLoRA on a small model', descAr: 'LoRA / QLoRA على نموذج صغير', floor: 24, prefer: 'rtx 4090', image: 'pytorch', durationMin: 240 },
  { key: 'infer', titleEn: 'Inference / serving', titleAr: 'الاستدلال / الخدمة', descEn: 'Run a model, batch or API', descAr: 'تشغيل نموذج، دفعات أو API', floor: 24, prefer: 'rtx 3090', image: 'vllm', durationMin: 120 },
  { key: 'diffusion', titleEn: 'Image / video gen', titleAr: 'توليد الصور / الفيديو', descEn: 'SDXL, ComfyUI, video diffusion', descAr: 'SDXL وComfyUI وتوليد الفيديو', floor: 24, prefer: 'rtx 4090', image: 'cuda', durationMin: 120 },
  { key: 'notebook', titleEn: 'Notebook / dev', titleAr: 'دفتر / تطوير', descEn: 'Prototyping, light experiments', descAr: 'نماذج أولية وتجارب خفيفة', floor: 8, prefer: 'rtx 3090', image: 'pytorch', durationMin: 60 },
  { key: 'largetrain', titleEn: 'Large training', titleAr: 'تدريب كبير', descEn: 'Full fine-tune, 30B+ models', descAr: 'ضبط كامل، نماذج 30B+', floor: 80, prefer: 'a100', image: 'pytorch', durationMin: 480 },
  { key: 'frontier', titleEn: 'Frontier-scale', titleAr: 'نطاق متقدم', descEn: '100B+, long-context training', descAr: '100B+ وسياق طويل', floor: 141, prefer: 'h200', image: 'pytorch', durationMin: 480 },
  { key: 'experiment', titleEn: 'Experiment server', titleAr: 'خادم تجريبي', descEn: 'vLLM test pod — auto-cleans on stop', descAr: 'حاوية vLLM تجريبية — تُنظَّف تلقائياً عند الإيقاف', floor: 24, prefer: 'rtx 3090', image: 'vllm', durationMin: 120 },
]

// VRAM slider stops (GB). The slider snaps to the nearest stop.
const VRAM_STOPS = [0, 8, 12, 16, 24, 32, 48, 80, 94, 141, 180]

// ── Types ─────────────────────────────────────────────────────────────
interface Pod {
  id: number | string
  status: string
  access_url?: string | null
  ssh_command?: string | null
  // GPU TYPE only — never a machine name or provider id (backend leak-fix
  // removed provider_id / provider_name from toPodView).
  gpu_type?: string | null
  duration_minutes?: number | null
  submitted_at?: string | null
  created_at?: string | null
  ends_at?: string | null
  seconds_remaining?: number | null
  workspace_persisted?: boolean | null
}

interface AvailableProvider {
  id: number
  // GPU TYPE + VRAM + price + availability ONLY — never a machine name, never a
  // provider id/count/region, and NEVER the on_demand flag. on_demand is
  // deliberately not carried so it can never drive a label or styling (vendor
  // invisibility). sar_per_hour is the REAL cost-plus price, present on every
  // row; USD is derived locally as a secondary ≈ display.
  gpu_model: string
  vram_gb: number
  available: boolean
  sar_per_hour: number | null
  status: 'online' | 'offline'
}

// A distinct GPU TYPE, deduped from the (possibly repeating) provider rows.
// This is the unit the selector renders and the unit we POST as gpu_type.
interface GpuType {
  gpu_model: string
  vram_gb: number
  available: boolean
  sar_per_hour: number | null
  band: 'workhorse' | 'datacenter'
}

interface LaunchState {
  // Selected GPU TYPE (the provider gpu_model string POSTed as gpu_type).
  // '' = auto-pick (backend chooses any available type).
  gpuType: string
  durationMinutes: number
  notebookToken: string
  // Selected preset value, or CUSTOM_IMAGE_OPTION to use customImage instead.
  imageChoice: string
  // Free-form Docker image ref, only used when imageChoice === CUSTOM_IMAGE_OPTION.
  customImage: string
  submitting: boolean
  error: string
}

interface PodsListResponse {
  pods?: Pod[]
}

interface AvailableProvidersResponse {
  providers?: Array<Record<string, unknown>>
}

interface RenterMeResponse {
  renter?: { name?: string; email?: string; organization?: string }
}

interface LaunchResponse {
  id?: number | string | null
  job?: { id?: number | string | null }
  // One-time secrets returned by the 201 launch response (pods.js:374-375).
  // Shown ONCE in a reveal panel — never persisted or re-fetchable.
  root_password?: string | null
  jupyter_token?: string | null
  error?: string
  code?: string
  message?: string
}

// One-time credentials surfaced immediately after a successful launch.
interface LaunchReveal {
  podId: string
  rootPassword: string
  jupyterToken: string
}

type LoadState = 'loading' | 'ready' | 'missing-key'

// ── Helpers ────────────────────────────────────────────────────────────
function generateNotebookToken(): string {
  // Strong, URL-safe token generated client-side so the renter sees it once.
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isActivePod(pod: Pod): boolean {
  return ACTIVE_POD_STATUSES.has(String(pod.status || '').toLowerCase())
}

// Resolve the image to send in the POST body: a preset alias, or the trimmed
// custom Docker ref when "Custom…" is selected. Returns '' if custom is empty.
function resolveImage(launch: Pick<LaunchState, 'imageChoice' | 'customImage'>): string {
  if (launch.imageChoice === CUSTOM_IMAGE_OPTION) return launch.customImage.trim()
  return launch.imageChoice
}

function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function formatSubmitted(pod: Pod): string {
  const iso = pod.submitted_at || pod.created_at
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.floor(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function statusClass(status: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'running') return 'active'
  if (s === 'queued' || s === 'assigned' || s === 'pulling' || s === 'starting') return 'queued'
  if (s === 'failed' || s === 'error') return 'failed'
  return 'revoked'
}

function isFundingLaunchError(err: string): boolean {
  return err === 'insufficient_balance' ||
    /^insufficient (balance|credit)/i.test(err) ||
    /^this gpu requires prepaid credit/i.test(err)
}

function keepFundingLaunchError(err: string): string {
  return isFundingLaunchError(err) ? err : ''
}

// ── GPU-selector helpers ───────────────────────────────────────────────
// Brand eyebrow derived from the raw gpu_model. Apple Silicon vs NVIDIA only —
// no vendor/provider identity, just the silicon family the card already shows.
function gpuBrand(gpuModel: string): string {
  return /apple/i.test(gpuModel) ? 'Apple' : 'NVIDIA'
}

function bandForVram(vramGb: number): 'workhorse' | 'datacenter' {
  return vramGb <= VRAM_BAND_GB ? 'workhorse' : 'datacenter'
}

// Format SAR to 2 dp (cost-plus prices like 2.5 → "2.50").
function fmtSar(v: number): string {
  return v.toFixed(2)
}
// Approximate USD via the fixed peg — secondary display only.
function fmtUsd(sar: number): string {
  return (sar * SAR_TO_USD).toFixed(2)
}

function isValuePick(gpuModel: string): boolean {
  const m = gpuModel.toLowerCase()
  return VALUE_PICK_MATCHES.some((needle) => m.includes(needle))
}

// Snap an arbitrary slider value to the nearest defined VRAM stop.
function snapVram(value: number): number {
  let best = VRAM_STOPS[0]
  for (const stop of VRAM_STOPS) {
    if (Math.abs(stop - value) < Math.abs(best - value)) best = stop
  }
  return best
}

// Dedupe the (repeating) provider rows down to distinct GPU TYPES by gpu_model.
// A type is `available` if ANY row of that type is available; price/vram are
// taken from the first row (consistent per type). Sort cheapest-first within a
// type later; unpriced (none expected now) sinks last.
function dedupeGpuTypes(providers: AvailableProvider[]): GpuType[] {
  const byModel = new Map<string, GpuType>()
  for (const p of providers) {
    const key = p.gpu_model
    const existing = byModel.get(key)
    if (existing) {
      // Promote availability if any row is available; keep first non-null price.
      if (p.available) existing.available = true
      if (existing.sar_per_hour == null && p.sar_per_hour != null) existing.sar_per_hour = p.sar_per_hour
    } else {
      byModel.set(key, {
        gpu_model: p.gpu_model,
        vram_gb: p.vram_gb,
        available: p.available,
        sar_per_hour: p.sar_per_hour,
        band: bandForVram(p.vram_gb),
      })
    }
  }
  return Array.from(byModel.values())
}

// price value used for sorting; unpriced sinks to the end.
function priceValue(g: GpuType): number {
  return g.sar_per_hour == null ? Infinity : g.sar_per_hour
}

function sortGpuTypes(arr: GpuType[], sort: SortKey): GpuType[] {
  const a = [...arr]
  const cmp: Record<SortKey, (x: GpuType, y: GpuType) => number> = {
    'price-asc': (x, y) => priceValue(x) - priceValue(y),
    'price-desc': (x, y) => priceValue(y) - priceValue(x),
    'vram-desc': (x, y) => y.vram_gb - x.vram_gb,
    'vram-asc': (x, y) => x.vram_gb - y.vram_gb,
    name: (x, y) => displayGpuType(x.gpu_model).localeCompare(displayGpuType(y.gpu_model)),
    // Recommended: available first, then value-picks, then cheapest.
    recommended: (x, y) => {
      const order = (g: GpuType) => (g.available ? 0 : 1)
      if (order(x) !== order(y)) return order(x) - order(y)
      const vx = isValuePick(x.gpu_model) ? 0 : 1
      const vy = isValuePick(y.gpu_model) ? 0 : 1
      if (vx !== vy) return vx - vy
      return priceValue(x) - priceValue(y)
    },
  }
  return a.sort(cmp[sort])
}

// Apply the toolbar filters (search text, min-VRAM, availability chips).
function filterGpuTypes(
  arr: GpuType[],
  opts: { search: string; minVram: number; filters: Set<AvailFilter> },
): GpuType[] {
  const q = opts.search.trim().toLowerCase()
  return arr.filter((g) => {
    if (q) {
      const hay = `${displayGpuType(g.gpu_model)} ${gpuBrand(g.gpu_model)} ${g.vram_gb}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (opts.minVram > 0 && g.vram_gb < opts.minVram) return false
    if (opts.filters.size) {
      let pass = false
      if (opts.filters.has('available') && g.available) pass = true
      if (opts.filters.has('priced') && g.sar_per_hour != null && g.available) pass = true
      if (!pass) return false
    }
    return true
  })
}

export default function RenterPodsPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pods, setPods] = useState<Pod[]>([])
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [renterKey, setRenterKey] = useState<string | null>(null)
  const [workspaceVolume, setWorkspaceVolume] = useState<WorkspaceVolume | null>(null)
  const [renterName, setRenterName] = useState('Renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  const [extending, setExtending] = useState<Record<string, boolean>>({})
  const [extendMsg, setExtendMsg] = useState<Record<string, string>>({})
  // One-time launch credentials (root_password + jupyter_token). Cleared on dismiss.
  const [reveal, setReveal] = useState<LaunchReveal | null>(null)
  const [launch, setLaunch] = useState<LaunchState>({
    gpuType: '',
    durationMinutes: DEFAULT_DURATION_MINUTES,
    notebookToken: generateNotebookToken(),
    imageChoice: DEFAULT_IMAGE,
    customImage: '',
    submitting: false,
    error: '',
  })

  // ── GPU selector UI state ──────────────────────────────────────────────
  const [gpuSearch, setGpuSearch] = useState('')
  const [minVram, setMinVram] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('recommended')
  const [availFilters, setAvailFilters] = useState<Set<AvailFilter>>(() => new Set())
  const [collapsedBands, setCollapsedBands] = useState<Set<string>>(() => new Set())
  const [assistOpen, setAssistOpen] = useState(false)
  const [activeWorkload, setActiveWorkload] = useState<string | null>(null)
  // Notify-me waitlist: per-gpu_model busy + done flags so each out-of-stock
  // card shows its own state without touching the launch flow.
  const [notifyBusy, setNotifyBusy] = useState<Record<string, boolean>>({})
  const [notifyDone, setNotifyDone] = useState<Record<string, boolean>>({})
  const [notifyErr, setNotifyErr] = useState<Record<string, string>>({})

  // Track ids we're actively polling so a launch immediately starts polling.
  const pollIdsRef = useRef<Set<string>>(new Set())

  // ── Data loaders ─────────────────────────────────────────────────────
  const [nowTick, setNowTick] = useState(() => 0)
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchPods = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${getApiBase()}/pods?key=${encodeURIComponent(apiKey)}`, {
        headers: { 'x-renter-key': apiKey },
        cache: 'no-store',
      })
      if (res.status === 401 || res.status === 403) {
        setLoadState('missing-key')
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as PodsListResponse | Pod[]
      const list: Pod[] = Array.isArray((data as PodsListResponse)?.pods)
        ? (data as PodsListResponse).pods!
        : Array.isArray(data)
          ? (data as Pod[])
          : []
      setPods(list)
    } catch (err) {
      console.error('Failed to load pods:', err)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/renters/available-providers`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as AvailableProvidersResponse
      const list: AvailableProvider[] = (data.providers || [])
        // Keep ALL rows (available AND out-of-stock) so the grid can render
        // out-of-stock cards with a Notify-me CTA. Carry sar_per_hour (the real
        // cost-plus price, present on every row). NEVER read on_demand — vendor
        // invisibility: it must not drive any label, sort, or styling.
        .map((p) => ({
          id: p.id as number,
          gpu_model: (p.gpu_model as string) || 'GPU',
          vram_gb: (p.vram_gb as number) ?? 0,
          available: p.available !== false,
          sar_per_hour: typeof p.sar_per_hour === 'number' ? (p.sar_per_hour as number) : null,
          status: 'online' as const,
        }))
      setProviders(list)
    } catch (err) {
      console.error('Failed to load providers:', err)
    }
  }, [])

  const fetchRenter = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${getApiBase()}/renters/me`, {
        headers: { 'x-renter-key': apiKey },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as RenterMeResponse
        setRenterName(data.renter?.organization || data.renter?.name || 'Renter')
        setRenterEmail(data.renter?.email || '')
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  // ── Auth gate + polling loop ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apiKey = getRenterKey()
    if (!apiKey) {
      setRenterKey(null)
      setWorkspaceVolume(null)
      setLoadState('missing-key')
      return
    }
    setRenterKey(apiKey)
    let cancelled = false
    const tick = async () => {
      await Promise.all([fetchPods(apiKey), fetchRenter(apiKey), fetchProviders()])
      if (!cancelled) setLoadState('ready')
    }
    tick()
    const interval = setInterval(() => {
      const key = getRenterKey()
      if (key) fetchPods(key)
    }, POD_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fetchPods, fetchProviders, fetchRenter])

  // ── Launch ───────────────────────────────────────────────────────────
  const submitLaunch = async () => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || launch.submitting) return

    const token = launch.notebookToken.trim()
    if (token.length < MIN_TOKEN_LENGTH) {
      setLaunch((l) => ({ ...l, error: `Notebook token must be at least ${MIN_TOKEN_LENGTH} characters.` }))
      return
    }

    const image = resolveImage(launch)
    if (launch.imageChoice === CUSTOM_IMAGE_OPTION && !image) {
      setLaunch((l) => ({ ...l, error: 'Enter a Docker image reference for a custom pod.' }))
      return
    }

    setLaunch((l) => ({ ...l, submitting: true, error: '' }))
    try {
      const res = await fetch(`${getApiBase()}/pods?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify({
          // Launch by GPU TYPE, never provider_id. '' → omit so the backend
          // auto-picks any available type. The backend resolves gpu_type → an
          // in-stock provider internally; the renter never sees a provider id.
          gpu_type: launch.gpuType || undefined,
          duration_minutes: launch.durationMinutes,
          image,
          params: { NOTEBOOK_TOKEN: token },
        }),
      })

      if (res.status === 402) {
        const err = (await res.json().catch(() => ({}))) as LaunchResponse
        const code = err.code || err.error
        const message = err.message || (
          code === 'on_demand_requires_prepaid_credit'
            ? 'This GPU requires prepaid credit. Add credit and retry.'
            : 'Insufficient credit. Add credit and retry.'
        )
        setLaunch((l) => ({ ...l, submitting: false, error: message }))
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as LaunchResponse
        setLaunch((l) => ({ ...l, submitting: false, error: err.error || 'Failed to launch pod.' }))
        return
      }

      const data = (await res.json()) as LaunchResponse
      const newId = data.id ?? data.job?.id ?? null
      if (newId != null) pollIdsRef.current.add(String(newId))

      // The 201 hands back root_password + jupyter_token EXACTLY ONCE — capture
      // and surface them now; they are never returned by GET /pods again.
      if (data.root_password || data.jupyter_token) {
        setReveal({
          podId: newId != null ? String(newId) : '',
          rootPassword: data.root_password || '',
          jupyterToken: data.jupyter_token || '',
        })
      }

      // Reset the form (fresh token) and refresh the list immediately. The GPU
      // selection is preserved so a renter can relaunch the same type quickly.
      setLaunch({
        gpuType: launch.gpuType,
        durationMinutes: launch.durationMinutes,
        notebookToken: generateNotebookToken(),
        imageChoice: launch.imageChoice,
        customImage: launch.customImage,
        submitting: false,
        error: '',
      })
      fetchPods(apiKey)
    } catch {
      setLaunch((l) => ({ ...l, submitting: false, error: 'Network error. Please try again.' }))
    }
  }

  // ── Stop ─────────────────────────────────────────────────────────────
  const stopPod = async (pod: Pod) => {
    const apiKey = getRenterKey() || ''
    const id = String(pod.id)
    if (!apiKey || stopping[id]) return
    setStopping((s) => ({ ...s, [id]: true }))
    try {
      const res = await fetch(`${getApiBase()}/pods/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`, {
        method: 'DELETE',
        headers: { 'x-renter-key': apiKey },
      })
      if (res.ok) {
        pollIdsRef.current.delete(id)
        fetchPods(apiKey)
      }
    } catch (err) {
      console.error('Failed to stop pod:', err)
    } finally {
      setStopping((s) => ({ ...s, [id]: false }))
    }
  }

  const extendPod = async (pod: Pod, minutes: number) => {
    const apiKey = getRenterKey() || ''
    const id = String(pod.id)
    if (!apiKey || extending[id]) return
    setExtending((e) => ({ ...e, [id]: true }))
    setExtendMsg((m) => ({ ...m, [id]: '' }))
    try {
      const res = await fetch(`${getApiBase()}/pods/${encodeURIComponent(id)}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': apiKey },
        body: JSON.stringify({ extend_minutes: minutes }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setExtendMsg((m) => ({ ...m, [id]: `+${minutes >= 60 ? minutes / 60 + 'h' : minutes + 'm'} · ${data.charged_sar ?? '?'} SAR` }))
        fetchPods(apiKey)
      } else {
        const msg = (data && (data.error?.message || data.error)) || `Extend failed (${res.status})`
        setExtendMsg((m) => ({ ...m, [id]: String(msg).slice(0, 90) }))
      }
    } catch (err) {
      setExtendMsg((m) => ({ ...m, [id]: 'Extend failed — try again' }))
    } finally {
      setExtending((e) => ({ ...e, [id]: false }))
    }
  }

  // ── Copy helper ──────────────────────────────────────────────────────
  const copyText = (key: string, value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
      })
      .catch(() => {
        /* clipboard unavailable */
      })
  }

  // Keep funding errors sticky; clear transient field errors as the renter edits.
  const onImageChoice = (v: string) => setLaunch((l) => ({ ...l, imageChoice: v, error: keepFundingLaunchError(l.error) }))
  const onCustomImage = (v: string) => setLaunch((l) => ({ ...l, customImage: v, error: keepFundingLaunchError(l.error) }))
  const onRegenerate = () =>
    setLaunch((l) => ({ ...l, notebookToken: generateNotebookToken(), error: keepFundingLaunchError(l.error) }))

  // ── GPU type selection + notify-me ─────────────────────────────────────
  const selectGpuType = useCallback((gpuModel: string) => {
    setLaunch((l) => ({ ...l, gpuType: gpuModel, error: keepFundingLaunchError(l.error) }))
  }, [])

  const toggleAvailFilter = (f: AvailFilter) =>
    setAvailFilters((prev) => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })

  const toggleBand = (key: string) =>
    setCollapsedBands((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const clearGpuFilters = () => {
    setGpuSearch('')
    setMinVram(0)
    setAvailFilters(new Set())
  }

  // Apply a workload preset: set the VRAM floor and select its preferred type if
  // that type is live, else leave selection unchanged.
  const applyWorkload = (w: Workload) => {
    setActiveWorkload(w.key)
    setMinVram(w.floor)
    if (w.image || w.durationMin) {
      setLaunch((l) => ({
        ...l,
        ...(w.image ? { imageChoice: w.image } : {}),
        ...(w.durationMin ? { durationMinutes: w.durationMin } : {}),
      }))
    }
    const match = gpuTypes.find(
      (g) => g.available && g.sar_per_hour != null && g.gpu_model.toLowerCase().includes(w.prefer),
    )
    if (match) selectGpuType(match.gpu_model)
  }

  const applyLaunchTemplate = (template: LaunchTemplate) => {
    if (template.disabled) return
    if (template.workloadKey) {
      const workload = WORKLOADS.find((w) => w.key === template.workloadKey)
      if (workload) {
        setActiveWorkload(workload.key)
        setMinVram(workload.floor)
      }
    }
    setLaunch((l) => ({
      ...l,
      imageChoice: template.image,
      durationMinutes: template.durationMin || l.durationMinutes,
      error: keepFundingLaunchError(l.error),
    }))
  }

  // POST /api/pods/notify-me { gpu_type } — renter-authed waitlist for an
  // out-of-stock type. Prefills nothing (server uses the signed-in renter).
  const notifyMe = async (gpuModel: string) => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || notifyBusy[gpuModel]) return
    setNotifyBusy((s) => ({ ...s, [gpuModel]: true }))
    setNotifyErr((e) => ({ ...e, [gpuModel]: '' }))
    try {
      const res = await fetch(`${getApiBase()}/pods/notify-me?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': apiKey },
        body: JSON.stringify({ gpu_type: gpuModel }),
      })
      if (res.ok) {
        setNotifyDone((d) => ({ ...d, [gpuModel]: true }))
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setNotifyErr((e) => ({ ...e, [gpuModel]: data.error || `Failed (${res.status})` }))
      }
    } catch {
      setNotifyErr((e) => ({ ...e, [gpuModel]: 'Network error' }))
    } finally {
      setNotifyBusy((s) => ({ ...s, [gpuModel]: false }))
    }
  }

  const isCustom = launch.imageChoice === CUSTOM_IMAGE_OPTION
  const activePods = pods.filter(isActivePod).length

  // ── Derived GPU selector data ──────────────────────────────────────────
  // Distinct GPU types from the (repeating) provider rows. This is the unit the
  // selector renders and POSTs as gpu_type.
  const gpuTypes = dedupeGpuTypes(providers)
  const availableGpuTypes = gpuTypes.filter((g) => g.available && g.sar_per_hour != null)
  // Count of distinct GPU *types* available (type-level, never a node/provider
  // count) — shown in the console KPI instead of a raw provider total.
  const gpuTypeCount = availableGpuTypes.length
  // No launchable types at all → disable launch + show empty state.
  const noLaunchable = availableGpuTypes.length === 0

  // Filter + group + sort for the card grid.
  const filteredTypes = filterGpuTypes(gpuTypes, { search: gpuSearch, minVram, filters: availFilters })
  const shownCount = filteredTypes.length
  const minPrice = availableGpuTypes.reduce<number | null>((min, g) => {
    const v = g.sar_per_hour as number
    return min == null || v < min ? v : min
  }, null)

  // The currently-selected type (if still in stock).
  const selectedType = launch.gpuType ? gpuTypes.find((g) => g.gpu_model === launch.gpuType) || null : null
  const selectedImage = resolveImage(launch)
  const selectedPreset = IMAGE_PRESETS.find((img) => img.value === launch.imageChoice)
  const selectedImageLabel = isCustom
    ? (selectedImage || (lang === 'ar' ? 'صورة مخصصة' : 'Custom image'))
    : selectedPreset
      ? (lang === 'ar' ? selectedPreset.labelAr : selectedPreset.label)
      : selectedImage
  const durationLabel = formatDuration(launch.durationMinutes)
  const selectedQuoteSar = selectedType?.sar_per_hour != null
    ? selectedType.sar_per_hour * (launch.durationMinutes / 60)
    : null

  const isLive = loadState === 'ready'

  return (
    <div className="rt-app">
      <PodSidebar navOpen={navOpen} renterName={renterName} renterEmail={renterEmail} />

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <PodTopbar
          renterName={renterName}
          isLive={isLive}
          lang={lang}
          onToggleLang={toggle}
          onToggleNav={() => setNavOpen((v) => !v)}
        />

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="GPU " ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="pods." ar="حاويات GPU." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="Full container · Jupyter + SSH" ar="حاوية كاملة · Jupyter + SSH" />
            </span>
            <span>
              <Bi en="Auto-refresh " ar="تحديث تلقائي " />
              <b>{POD_REFRESH_MS / 1000}s</b>
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or paste a renter API key before v2 can launch GPU pods or show your running containers."
                  ar="سجل الدخول أو أدخل مفتاح مستأجر قبل أن تتمكن v2 من تشغيل حاويات GPU أو عرض حاوياتك العاملة."
                />
              </span>
              <Link className="text-link" href="/renter/keys" style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                <Bi en="Manage API keys →" ar="إدارة مفاتيح API →" />
              </Link>
            </div>
          )}

          {/* ── Stat tiles ─────────────────────────────────── */}
          <div className="pod-kpis" style={{ marginTop: '36px' }}>
            <div className="kpi featured">
              <div className="k">
                <Bi en="Total pods" ar="إجمالي الحاويات" />
              </div>
              <div className="v">{pods.length}</div>
              <div className="d flat">
                <Bi en="Across this renter account" ar="عبر حساب المستأجر هذا" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Active" ar="نشطة" />
              </div>
              <div className="v" style={{ color: activePods > 0 ? 'var(--teal)' : 'var(--ink)' }}>
                {activePods}
              </div>
              <div className="d up">
                <Bi en="Running or provisioning" ar="قيد التشغيل أو التجهيز" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="GPU types available" ar="أنواع المعالجات المتاحة" />
              </div>
              <div className="v">{gpuTypeCount}</div>
              <div className="d flat">
                <Bi en="Ready to host a pod" ar="جاهزة لاستضافة حاوية" />
              </div>
            </div>
          </div>

          {/* ── Workspace staging ────────────────────────────── */}
          <div className="pod-stage" style={{ marginTop: '28px' }}>
            <div className="pod-stage-hd">
              <span className="pod-stage-no">01</span>
              <div>
                <h2><Bi en="Stage workspace files" ar="جهّز ملفات مساحة العمل" /></h2>
                <p>
                  <Bi
                    en="Use the same /workspace volume that reattaches when a pod starts."
                    ar="استخدم نفس وحدة /workspace التي تُعاد عند تشغيل الحاوية."
                  />
                </p>
              </div>
            </div>
            <WorkspacePanel
              apiBase={getApiBase()}
              renterKey={renterKey}
              context="pod-launch"
              onVolumeLoaded={setWorkspaceVolume}
            />
          </div>

          {/* ── Launch panel ───────────────────────────────── */}
          <section className="panel pod-launch" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Launch GPU pod" ar="تشغيل حاوية GPU" />
                </h3>
              </div>
              <span className="hint">
                <Bi en="Jupyter notebook + SSH, torn down on duration" ar="دفتر Jupyter + SSH، تُغلق عند انتهاء المدة" />
              </span>
            </div>

            <div className="pod-flow-rail" aria-label={lang === 'ar' ? 'خطة التشغيل' : 'Launch plan'}>
              <div className={`pod-flow-item${workspaceVolume ? ' ok' : ''}`}>
                <span className="pod-flow-no">01</span>
                <span className="pod-flow-k"><Bi en="Workspace" ar="مساحة العمل" /></span>
                <strong>
                  {workspaceVolume
                    ? `${workspaceVolume.size_gb} GB /workspace`
                    : <Bi en="No volume yet" ar="لا توجد وحدة بعد" />}
                </strong>
              </div>
              <div className={`pod-flow-item${selectedType ? ' ok' : ''}`}>
                <span className="pod-flow-no">02</span>
                <span className="pod-flow-k"><Bi en="GPU" ar="GPU" /></span>
                <strong>
                  {selectedType
                    ? displayGpuType(selectedType.gpu_model)
                    : <Bi en="Auto-pick" ar="اختيار تلقائي" />}
                </strong>
              </div>
              <div className="pod-flow-item ok">
                <span className="pod-flow-no">03</span>
                <span className="pod-flow-k"><Bi en="Runtime" ar="بيئة التشغيل" /></span>
                <strong>{selectedImageLabel} · {durationLabel}</strong>
              </div>
              <div className={`pod-flow-item${selectedQuoteSar != null ? ' ok' : ''}`}>
                <span className="pod-flow-no">04</span>
                <span className="pod-flow-k"><Bi en="Prepaid quote" ar="تقدير مسبق" /></span>
                <strong>
                  {selectedQuoteSar != null
                    ? `~SAR ${fmtSar(selectedQuoteSar)}`
                    : <Bi en="After GPU pick" ar="بعد اختيار GPU" />}
                </strong>
              </div>
            </div>

            <section className="pod-template-picker" aria-labelledby="pod-template-heading">
              <div className="pod-template-hd">
                <div>
                  <span className="pod-label"><Bi en="Launch template" ar="قالب التشغيل" /></span>
                  <h4 id="pod-template-heading">
                    <Bi en="Choose the pod shape" ar="اختر شكل الحاوية" />
                  </h4>
                </div>
                <span className="hint">
                  <Bi en="Templates set image, duration, and workload filters" ar="القوالب تضبط الصورة والمدة وتصفية العمل" />
                </span>
              </div>
              <div className="pod-template-grid">
                {LAUNCH_TEMPLATES.map((template) => {
                  const selected =
                    !template.disabled &&
                    !isCustom &&
                    launch.imageChoice === template.image &&
                    (!template.durationMin || launch.durationMinutes === template.durationMin)
                  return (
                    <button
                      key={template.key}
                      type="button"
                      className={`pod-template-card${selected ? ' on' : ''}${template.disabled ? ' disabled' : ''}`}
                      aria-pressed={selected}
                      aria-disabled={template.disabled || undefined}
                      disabled={template.disabled || !isLive}
                      onClick={() => applyLaunchTemplate(template)}
                    >
                      {(template.badgeEn || template.disabled) && (
                        <span className="pod-template-badge">
                          {lang === 'ar'
                            ? (template.badgeAr || 'قريباً')
                            : (template.badgeEn || 'Coming next')}
                        </span>
                      )}
                      <span className="pod-template-title">{lang === 'ar' ? template.titleAr : template.titleEn}</span>
                      <span className="pod-template-desc">{lang === 'ar' ? template.descAr : template.descEn}</span>
                      <span className="pod-template-meta">
                        {template.image}
                        {template.durationMin ? ` · ${formatDuration(template.durationMin)}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* ── GPU picker: optional workload helper + toolbar + card grid ── */}
            <div className="gpu-picker">
              {/* Optional "Guide me by workload" helper (collapsed by default) */}
              <section className="gpu-assist" data-open={assistOpen} aria-label={lang === 'ar' ? 'دليل العمل' : 'Workload guide'}>
                <button
                  type="button"
                  className="gpu-assist-head"
                  aria-expanded={assistOpen}
                  aria-controls="gpu-assist-body"
                  onClick={() => setAssistOpen((v) => !v)}
                >
                  <span className="ico" aria-hidden="true">◇</span>
                  <span className="gpu-assist-title">
                    <Bi en="Not sure which GPU? Guide me by workload" ar="غير متأكد أي معالج؟ دلّني حسب العمل" />
                  </span>
                  <span className="chev" aria-hidden="true">▾</span>
                </button>
                {assistOpen && (
                  <div className="gpu-assist-body" id="gpu-assist-body">
                    <p className="gpu-assist-q">
                      <Bi en="What are you running?" ar="ماذا تشغّل؟" />
                    </p>
                    <div className="gpu-workloads" role="group" aria-label={lang === 'ar' ? 'نوع العمل' : 'Workload type'}>
                      {WORKLOADS.map((w) => (
                        <button
                          key={w.key}
                          type="button"
                          className="gpu-wk"
                          aria-pressed={activeWorkload === w.key}
                          onClick={() => applyWorkload(w)}
                        >
                          <span className="t">{lang === 'ar' ? w.titleAr : w.titleEn}</span>
                          <span className="d">{lang === 'ar' ? w.descAr : w.descEn}</span>
                          <span className="n">{lang === 'ar' ? `≥ ${w.floor} غ.ب` : `≥ ${w.floor} GB`}</span>
                        </button>
                      ))}
                    </div>
                    {activeWorkload && (() => {
                      const w = WORKLOADS.find((x) => x.key === activeWorkload)
                      if (!w) return null
                      return (
                        <div className="gpu-reco" aria-live="polite">
                          <span className="label">
                            <Bi en="Filtered for this workload" ar="تمت التصفية لهذا العمل" />
                          </span>
                          <p className="why">
                            <Bi
                              en={`Showing GPU types with at least ${w.floor} GB of VRAM. The best-value available type is pre-selected when one fits.`}
                              ar={`تُعرض المعالجات بذاكرة ${w.floor} غيغابايت على الأقل. يُختار أفضل نوع متاح من حيث القيمة تلقائيًا عند توفره.`}
                            />
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </section>

              {/* Quiet toolbar: search + min-VRAM + sort + availability chips */}
              <div className="gpu-toolbar">
                <div className="gpu-tb-left">
                  <div className="gpu-ctl gpu-search">
                    <span className="mag" aria-hidden="true">⌕</span>
                    <label className="sr-only" htmlFor="gpu-search">
                      {lang === 'ar' ? 'ابحث عن معالج بالاسم أو الذاكرة' : 'Search GPU by name, brand or VRAM'}
                    </label>
                    <input
                      id="gpu-search"
                      type="search"
                      value={gpuSearch}
                      onChange={(e) => setGpuSearch(e.target.value)}
                      placeholder={lang === 'ar' ? 'ابحث عن معالج (مثل 4090، H100)' : 'Search GPU (e.g. 4090, H100, 80GB)'}
                      autoComplete="off"
                      disabled={!isLive}
                    />
                  </div>
                  <div className="gpu-ctl gpu-vram">
                    <div className="rng-head">
                      <label htmlFor="vram-range">
                        <Bi en="Min VRAM" ar="أدنى ذاكرة" />
                      </label>
                      <output htmlFor="vram-range">
                        {minVram === 0 ? <Bi en="Any" ar="أي" /> : `≥ ${minVram} GB`}
                      </output>
                    </div>
                    <input
                      id="vram-range"
                      type="range"
                      min={0}
                      max={180}
                      step={1}
                      value={minVram}
                      onChange={(e) => setMinVram(snapVram(Number(e.target.value)))}
                      aria-valuetext={minVram === 0 ? (lang === 'ar' ? 'أي ذاكرة' : 'Any VRAM') : `${minVram} GB`}
                      disabled={!isLive}
                    />
                  </div>
                  <div className="gpu-ctl">
                    <label htmlFor="gpu-sort">
                      <Bi en="Sort" ar="ترتيب" />
                    </label>
                    <select
                      id="gpu-sort"
                      className="gpu-sort"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      disabled={!isLive}
                    >
                      <option value="recommended">{lang === 'ar' ? 'موصى به' : 'Recommended'}</option>
                      <option value="price-asc">{lang === 'ar' ? 'السعر — من الأقل' : 'Price — low to high'}</option>
                      <option value="price-desc">{lang === 'ar' ? 'السعر — من الأعلى' : 'Price — high to low'}</option>
                      <option value="vram-desc">{lang === 'ar' ? 'الذاكرة — من الأعلى' : 'VRAM — high to low'}</option>
                      <option value="vram-asc">{lang === 'ar' ? 'الذاكرة — من الأقل' : 'VRAM — low to high'}</option>
                      <option value="name">{lang === 'ar' ? 'الاسم أ–ي' : 'Name A–Z'}</option>
                    </select>
                  </div>
                </div>
                <div className="gpu-ctl">
                  <label id="gpu-avail-lbl">
                    <Bi en="Availability" ar="التوفر" />
                  </label>
                  <div className="gpu-chips" role="group" aria-labelledby="gpu-avail-lbl">
                    <button
                      type="button"
                      className="gpu-chip"
                      aria-pressed={availFilters.has('available')}
                      onClick={() => toggleAvailFilter('available')}
                      disabled={!isLive}
                    >
                      <Bi en="Available" ar="متاح" />
                    </button>
                    <button
                      type="button"
                      className="gpu-chip"
                      aria-pressed={availFilters.has('priced')}
                      onClick={() => toggleAvailFilter('priced')}
                      disabled={!isLive}
                    >
                      <Bi en="Priced now" ar="مُسعّر الآن" />
                    </button>
                  </div>
                </div>
              </div>

              <p className="gpu-summary" aria-live="polite">
                {lang === 'ar'
                  ? `${shownCount} ${shownCount === 1 ? 'نوع' : 'أنواع'} معروضة · ${gpuTypeCount} متاح${minPrice != null ? ` · من ${fmtSar(minPrice)} ﷼/س` : ''}`
                  : `${shownCount} GPU ${shownCount === 1 ? 'type' : 'types'} shown · ${gpuTypeCount} available${minPrice != null ? ` · from SAR ${fmtSar(minPrice)}/hr` : ''}`}
              </p>

              {/* ONE radiogroup spanning all bands (a11y: native radio semantics) */}
              <div className="gpu-results" role="radiogroup" aria-label={lang === 'ar' ? 'نوع المعالج' : 'GPU type'}>
                {!isLive ? (
                  <p className="gpu-empty">
                    <Bi en="Loading GPU types…" ar="جارٍ تحميل أنواع المعالجات…" />
                  </p>
                ) : shownCount === 0 ? (
                  <p className="gpu-empty">
                    <Bi en="No GPU types match your filters." ar="لا توجد أنواع معالجات تطابق عوامل التصفية." />
                    <button type="button" className="gpu-clear" onClick={clearGpuFilters}>
                      <Bi en="Clear filters" ar="مسح التصفية" />
                    </button>
                  </p>
                ) : (
                  BANDS.map((band) => {
                    const inBand = sortGpuTypes(filteredTypes.filter((g) => g.band === band.key), sortKey)
                    if (!inBand.length) return null
                    const collapsed = collapsedBands.has(band.key)
                    return (
                      <section key={band.key} className="gpu-group" data-collapsed={collapsed}>
                        <button
                          type="button"
                          className="gpu-group-head"
                          aria-expanded={!collapsed}
                          onClick={() => toggleBand(band.key)}
                        >
                          <span className="chev" aria-hidden="true">▾</span>
                          <h3>{lang === 'ar' ? band.ar : band.en}</h3>
                          <span className="meta">{lang === 'ar' ? band.subAr : band.subEn}</span>
                        </button>
                        {!collapsed && (
                          <div className="gpu-grid">
                            {inBand.map((g, idx) => {
                              const out = !g.available
                              const unpriced = g.sar_per_hour == null
                              const selectable = !out && !unpriced
                              const selected = launch.gpuType === g.gpu_model
                              const reco = isValuePick(g.gpu_model) && selectable
                              const brand = gpuBrand(g.gpu_model)
                              const name = displayGpuType(g.gpu_model)
                              const cls = ['gpu-card', out ? 'is-out' : '', reco ? 'is-reco' : ''].filter(Boolean).join(' ')
                              // roving tabindex: the selected radio (or the first
                              // selectable card) is the single tab stop.
                              const isFirstSelectable =
                                selectable && !selectedType && idx === inBand.findIndex((x) => x.available && x.sar_per_hour != null)
                              const tabIndex = selectable ? (selected || isFirstSelectable ? 0 : -1) : undefined
                              const availLabel = out
                                ? lang === 'ar' ? 'غير متوفر' : 'Out of stock'
                                : lang === 'ar' ? 'متاح' : 'Available'
                              const ariaLabel = `${name}, ${g.vram_gb} GB VRAM, ${
                                unpriced ? (lang === 'ar' ? 'السعر عند الطلب' : 'price on request') : `${fmtSar(g.sar_per_hour as number)} SAR/hr`
                              }, ${availLabel}`
                              const onSelect = () => selectable && selectGpuType(g.gpu_model)
                              const onKey = (e: React.KeyboardEvent) => {
                                if (!selectable) return
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  selectGpuType(g.gpu_model)
                                }
                              }
                              return (
                                <div
                                  key={g.gpu_model}
                                  className={cls}
                                  role={selectable ? 'radio' : 'group'}
                                  aria-checked={selectable ? selected : undefined}
                                  aria-disabled={selectable ? undefined : true}
                                  aria-label={ariaLabel}
                                  tabIndex={tabIndex}
                                  onClick={onSelect}
                                  onKeyDown={onKey}
                                >
                                  {reco && (
                                    <span className="gpu-ribbon">
                                      <Bi en="Best value" ar="أفضل قيمة" />
                                    </span>
                                  )}
                                  <div className="gpu-card-top">
                                    <div>
                                      <p className="gpu-card-brand">{brand}</p>
                                      <h4 className="gpu-card-name">{name}</h4>
                                    </div>
                                    <div className="gpu-price-block">
                                      {unpriced ? (
                                        <div className="gpu-price-tba">
                                          <Bi en="Contact sales" ar="تواصل مع المبيعات" />
                                        </div>
                                      ) : (
                                        <>
                                          <div className="gpu-price">
                                            <span className="cur">SAR</span>
                                            {fmtSar(g.sar_per_hour as number)}
                                            <span className="unit">/hr</span>
                                          </div>
                                          <div className="gpu-price-usd">≈ ${fmtUsd(g.sar_per_hour as number)} USD/hr</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="gpu-card-specs">
                                    <div className="spec">
                                      <span className="k">VRAM</span>
                                      <span className="v">{g.vram_gb} GB</span>
                                    </div>
                                    <div className="spec">
                                      <span className="k">
                                        <Bi en="Access" ar="الوصول" />
                                      </span>
                                      <span className="v">Jupyter · SSH</span>
                                    </div>
                                    <div className="spec">
                                      <span className="k">
                                        <Bi en="Billing" ar="الفوترة" />
                                      </span>
                                      <span className="v">
                                        <Bi en="Per second" ar="بالثانية" />
                                      </span>
                                    </div>
                                  </div>
                                  <div className="gpu-card-foot">
                                    {/* Availability conveyed by dot SHAPE + LABEL, not color alone. */}
                                    <span className={`gpu-badge ${out ? 'out' : 'ok'}`}>
                                      <span className="dot" aria-hidden="true" />
                                      {availLabel}
                                    </span>
                                    {out ? (
                                      <button
                                        type="button"
                                        className="gpu-notify"
                                        disabled={!!notifyBusy[g.gpu_model] || !!notifyDone[g.gpu_model]}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          notifyMe(g.gpu_model)
                                        }}
                                        aria-label={
                                          lang === 'ar'
                                            ? `أعلمني عند توفر ${name}`
                                            : `Notify me when ${name} is back in stock`
                                        }
                                      >
                                        {notifyDone[g.gpu_model] ? (
                                          <Bi en="✓ Notified" ar="✓ تم" />
                                        ) : notifyBusy[g.gpu_model] ? (
                                          <Bi en="…" ar="…" />
                                        ) : (
                                          <Bi en="Notify me" ar="أعلمني" />
                                        )}
                                      </button>
                                    ) : (
                                      <span className="gpu-card-cta">
                                        {selected ? (
                                          <Bi en="Selected ✓" ar="محدد ✓" />
                                        ) : (
                                          <Bi en="Select →" ar="اختر →" />
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  {out && notifyErr[g.gpu_model] && (
                                    <span className="gpu-notify-err">{notifyErr[g.gpu_model]}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })
                )}
              </div>

              {/* Selection summary line — mirrors the mock's sticky-bar pick info. */}
              <div className="gpu-selection" aria-live="polite">
                {selectedType ? (
                  <span className="gpu-selection-pick">
                    <b>{displayGpuType(selectedType.gpu_model)}</b> · {selectedType.vram_gb} GB
                    {selectedType.sar_per_hour != null && (
                      <>
                        {' · '}
                        <span className="gpu-selection-price">
                          SAR {fmtSar(selectedType.sar_per_hour)}/hr · ≈ ${fmtUsd(selectedType.sar_per_hour)}/hr
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="gpu-selection-empty">
                    <Bi
                      en="No GPU selected — pick a card, or launch to auto-pick an available type."
                      ar="لم يتم اختيار معالج — اختر بطاقة، أو شغّل للاختيار التلقائي لنوع متاح."
                    />
                  </span>
                )}
              </div>
            </div>

            <div className="pod-form-grid">
              {/* Duration */}
              <div className="pod-field">
                <label htmlFor="pod-duration" className="pod-label">
                  <Bi en="Duration" ar="المدة" />
                </label>
                <select
                  id="pod-duration"
                  className="select"
                  value={launch.durationMinutes}
                  onChange={(e) => setLaunch((l) => ({ ...l, durationMinutes: Number(e.target.value) }))}
                  disabled={!isLive}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="pod-help">
                  <Bi en="The pod is torn down automatically when the duration elapses. The full duration is charged upfront; an early stop refunds the difference." ar="تُغلق الحاوية تلقائيًا عند انتهاء المدة. تُحتسب المدة كاملة مسبقًا، ويُعاد الفرق عند الإيقاف المبكر." />
                </p>
                <p className="pod-help pod-help-reserved">
                  <Bi
                    en="Need 10–90 days for a long training run? Reserved capacity isn’t booked on demand — contact us at sales@dcp.sa for multi-day reserved GPUs."
                    ar="تحتاج إلى 10–90 يومًا لتدريب طويل؟ السعة المحجوزة لا تُحجز عند الطلب — تواصل معنا على sales@dcp.sa لحجز معالجات رسومات لعدة أيام."
                  />
                </p>
              </div>

              {/* Image */}
              <div className="pod-field pod-field-wide">
                <label htmlFor="pod-image" className="pod-label">
                  <Bi en="Image override" ar="تجاوز الصورة" />
                </label>
                <div className="pod-image-row">
                  <select
                    id="pod-image"
                    className="select"
                    value={launch.imageChoice}
                    onChange={(e) => onImageChoice(e.target.value)}
                    disabled={!isLive}
                  >
                    {IMAGE_PRESETS.map((img) => (
                      <option key={img.value} value={img.value}>
                        {lang === 'ar' ? img.labelAr : img.label}
                      </option>
                    ))}
                    <option value={CUSTOM_IMAGE_OPTION}>{lang === 'ar' ? 'مخصص…' : 'Custom…'}</option>
                  </select>
                  {isCustom && (
                    <input
                      id="pod-image-custom"
                      type="text"
                      className="input pod-mono-input"
                      value={launch.customImage}
                      onChange={(e) => onCustomImage(e.target.value)}
                      placeholder="e.g. tensorflow/tensorflow:latest-gpu"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!isLive}
                    />
                  )}
                </div>
                <p className="pod-help">
                  <Bi
                    en="Template cards set this automatically. Use Custom only when you need an exact Docker reference; SSH is injected automatically."
                    ar="تضبط بطاقات القوالب هذا تلقائيًا. استخدم مخصص فقط عند الحاجة إلى مرجع Docker محدد؛ يتم حقن SSH تلقائيًا."
                  />
                </p>
              </div>

              {/* Notebook token */}
              <div className="pod-field pod-field-wide">
                <label htmlFor="pod-token" className="pod-label">
                  <Bi en="Notebook token" ar="رمز الدفتر" />
                </label>
                <div className="pod-token-row">
                  <input
                    id="pod-token"
                    type="text"
                    className="input pod-mono-input"
                    value={launch.notebookToken}
                    onChange={(e) => setLaunch((l) => ({ ...l, notebookToken: e.target.value }))}
                    placeholder="strong token used to open Jupyter"
                    spellCheck={false}
                    autoComplete="off"
                    disabled={!isLive}
                  />
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={onRegenerate}
                    title="Generate a new token"
                    disabled={!isLive}
                  >
                    <Bi en="Regenerate" ar="توليد جديد" />
                  </button>
                </div>
                <p className="pod-help">
                  <Bi
                    en={`Used to authenticate your Jupyter session. Keep it private — at least ${MIN_TOKEN_LENGTH} characters.`}
                    ar={`يُستخدم للمصادقة على جلسة Jupyter. احتفظ به سريًا — ${MIN_TOKEN_LENGTH} حرفًا على الأقل.`}
                  />
                </p>
              </div>
            </div>

            {isFundingLaunchError(launch.error) ? (
              <div className="dash-state error" style={{ marginTop: '20px' }}>
                <b>
                  <Bi en="Credit required" ar="الرصيد مطلوب" />
                </b>
                <span>
                  {launch.error === 'insufficient_balance'
                    ? <Bi en="Add credit before launching this pod." ar="أضف رصيدًا قبل تشغيل هذه الحاوية." />
                    : launch.error}
                  {' '}
                  <Link href="/renter/wallet">
                    <Bi en="Add credit" ar="إضافة رصيد" />
                  </Link>
                </span>
              </div>
            ) : launch.error ? (
              <div className="dash-state error" style={{ marginTop: '20px' }}>
                <span>{launch.error}</span>
              </div>
            ) : null}

            <div className="action-row">
              <button
                type="button"
                className="btn-pri pod-launch-btn"
                onClick={submitLaunch}
                disabled={launch.submitting || noLaunchable || !isLive}
              >
                {launch.submitting && <span className="pod-spinner" aria-hidden="true" />}
                {launch.submitting ? (
                  <Bi en="Launching…" ar="جارٍ التشغيل…" />
                ) : (
                  <Bi en="Launch GPU pod" ar="تشغيل حاوية GPU" />
                )}
              </button>
              {noLaunchable && isLive && (
                <span className="hint">
                  <Bi en="No GPU types are available right now." ar="لا توجد أنواع معالجات متاحة حاليًا." />
                </span>
              )}
            </div>

            {/* ── One-time credentials reveal (shown ONCE per launch) ───── */}
            {reveal && (reveal.rootPassword || reveal.jupyterToken) && (
              <div className="pod-access" style={{ marginTop: '20px' }}>
                <div
                  className="dash-state"
                  style={{
                    borderColor: 'color-mix(in oklab, var(--teal) 40%, var(--hair))',
                    background: 'color-mix(in oklab, var(--teal) 4%, var(--paper))',
                  }}
                >
                  <b>
                    <Bi en="Save these credentials now" ar="احفظ بيانات الاعتماد الآن" />
                    {reveal.podId ? ` — Pod #${reveal.podId}` : ''}
                  </b>
                  <span>
                    <Bi
                      en="Shown only once. They are not stored and cannot be retrieved later — copy them before leaving this page."
                      ar="تُعرض مرة واحدة فقط. لا يتم تخزينها ولا يمكن استرجاعها لاحقًا — انسخها قبل مغادرة هذه الصفحة."
                    />
                  </span>
                </div>

                {reveal.rootPassword && (
                  <div className="pod-access-block">
                    <div className="pod-access-body">
                      <span className="pod-access-k">
                        <Bi en="Root password (SSH)" ar="كلمة مرور الجذر (SSH)" />
                      </span>
                      <code className="pod-access-ssh">{reveal.rootPassword}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-sec pod-copy"
                      onClick={() => copyText('reveal-root', reveal.rootPassword)}
                      aria-label="Copy root password"
                    >
                      {copied === 'reveal-root' ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                    </button>
                  </div>
                )}

                {reveal.jupyterToken && (
                  <div className="pod-access-block">
                    <div className="pod-access-body">
                      <span className="pod-access-k">
                        <Bi en="Jupyter token" ar="رمز Jupyter" />
                      </span>
                      <code className="pod-access-ssh">{reveal.jupyterToken}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-sec pod-copy"
                      onClick={() => copyText('reveal-token', reveal.jupyterToken)}
                      aria-label="Copy Jupyter token"
                    >
                      {copied === 'reveal-token' ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                    </button>
                  </div>
                )}

                <div className="action-row">
                  <button type="button" className="btn-sec" onClick={() => setReveal(null)}>
                    <Bi en="Dismiss" ar="إخفاء" />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Pods list ──────────────────────────────────── */}
          <section className="panel pod-list-panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Your pods" ar="حاوياتك" />
                </h3>
              </div>
              <span className="hint">
                <Bi en={`${activePods} active · ${pods.length} total`} ar={`${activePods} نشطة · ${pods.length} إجمالي`} />
              </span>
            </div>

            {pods.length === 0 ? (
              <div className="pod-empty">
                <b>
                  <Bi en="No pods yet." ar="لا توجد حاويات بعد." />
                </b>
                <span>
                  <Bi
                    en="Launch a GPU pod above to get a Jupyter notebook and SSH access."
                    ar="شغّل حاوية GPU بالأعلى للحصول على دفتر Jupyter ووصول SSH."
                  />
                </span>
              </div>
            ) : (
              <div className="pod-rows">
                {pods.map((pod) => {
                  const id = String(pod.id)
                  const active = isActivePod(pod)
                  const accessReady = !!pod.access_url && active
                  const isCopiedSsh = copied === `ssh-${id}`
                  const submitted = formatSubmitted(pod)
                  return (
                    <article key={id} className={`pod-row${active ? ' on' : ' off'}`}>
                      <div className="pod-row-hd">
                        <div className="pod-row-id">
                          <span className="mono">Pod #{id}</span>
                          <span className={`stat ${statusClass(pod.status)}`}>{pod.status}</span>
                        </div>
                        <div className="pod-row-meta">
                          {/* GPU TYPE only — never a machine name or provider id. */}
                          {pod.gpu_type ? `${displayGpuType(pod.gpu_type)} · ` : ''}
                          {formatDuration(pod.duration_minutes)}
                          {submitted ? ` · ${submitted}` : ''}
                        </div>
                        {active && (
                          <button
                            type="button"
                            className="btn-sec danger pod-stop"
                            onClick={() => stopPod(pod)}
                            disabled={!!stopping[id]}
                            aria-label={`Stop pod ${id}`}
                          >
                            {stopping[id] && <span className="pod-spinner dark" aria-hidden="true" />}
                            {stopping[id] ? <Bi en="Stopping…" ar="جارٍ الإيقاف…" /> : <Bi en="Stop" ar="إيقاف" />}
                          </button>
                        )}
                      </div>

                      {pod.status === 'running' && typeof pod.seconds_remaining === 'number' && (() => {
                        // live countdown: recompute from ends_at every tick (nowTick drives re-render)
                        void nowTick
                        const left = pod.ends_at
                          ? Math.max(0, Math.round((Date.parse(pod.ends_at) - Date.now()) / 1000))
                          : pod.seconds_remaining
                        const ending = left <= 300
                        return (
                          <div className={`pod-clock${ending ? ' warn' : ''}`}>
                            <span className="pod-clock-t">
                              {ending ? '⚠ ' : ''}
                              <Bi en="Rental ends in" ar="ينتهي الإيجار خلال" /> <b>{formatCountdown(left)}</b>
                            </span>
                            <span className="pod-clock-sub">
                              {ending
                                ? <Bi en="Save anything outside /workspace now — /workspace is kept and reattaches to your next pod." ar="احفظ أي شيء خارج /workspace الآن — يُحتفظ بـ /workspace ويُعاد ربطه بحاويتك التالية." />
                                : <Bi en="/workspace is saved and reattaches to your next pod." ar="يُحفظ /workspace ويُعاد ربطه بحاويتك التالية." />}
                            </span>
                            <div className="pod-extend">
                              <span className="pod-extend-lbl"><Bi en="Extend" ar="تمديد" /></span>
                              {[30, 60, 120].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  className="pod-extend-btn"
                                  disabled={!!extending[id]}
                                  onClick={() => extendPod(pod, mins)}
                                >
                                  {mins >= 60 ? `+${mins / 60}h` : `+${mins}m`}
                                </button>
                              ))}
                              {extending[id] && <span className="pod-extend-msg"><Bi en="charging…" ar="جارٍ الخصم…" /></span>}
                              {!extending[id] && extendMsg[id] && <span className="pod-extend-msg">{extendMsg[id]}</span>}
                            </div>
                          </div>
                        )
                      })()}

                      {accessReady ? (
                        <div className="pod-access">
                          <div className="pod-access-block">
                            <div className="pod-access-body">
                              <span className="pod-access-k">
                                <Bi en="Jupyter notebook" ar="دفتر Jupyter" />
                              </span>
                              <a
                                className="pod-access-url"
                                href={pod.access_url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {pod.access_url}
                              </a>
                            </div>
                            <a
                              className="btn-pri pod-open"
                              href={pod.access_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Bi en="Open →" ar="فتح →" />
                            </a>
                          </div>

                          {pod.ssh_command && (
                            <div className="pod-access-block">
                              <div className="pod-access-body">
                                <span className="pod-access-k">
                                  <Bi en="SSH" ar="SSH" />
                                </span>
                                <code className="pod-access-ssh">{pod.ssh_command}</code>
                              </div>
                              <button
                                type="button"
                                className="btn-sec pod-copy"
                                onClick={() => copyText(`ssh-${id}`, pod.ssh_command as string)}
                                aria-label="Copy SSH command"
                              >
                                {isCopiedSsh ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : active ? (
                        <div className="pod-provisioning">
                          <span className="pod-spinner" aria-hidden="true" />
                          <Bi
                            en="Provisioning your pod… endpoints appear here once it's ready."
                            ar="جارٍ تجهيز حاويتك… ستظهر نقاط الوصول هنا عند الجاهزية."
                          />
                        </div>
                      ) : (
                        <div className="pod-inactive">
                          <Bi en="This pod is no longer running." ar="هذه الحاوية لم تعد قيد التشغيل." />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
