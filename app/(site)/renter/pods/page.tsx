'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { displayGpuType } from '@/app/lib/useGpuTypes'
import WorkspacePanel from '../workspace/WorkspacePanel'
import type { WorkspaceFile, WorkspaceVolume } from '../workspace/workspaceApi'
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
  catalogIds?: string[]
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  image: string
  durationMin?: number
  minVramGb?: number
  workloadKey?: string
  disabled?: boolean
  badgeEn?: string
  badgeAr?: string
}

interface TemplateCatalogItem {
  id: string
  model_name: string
  min_vram_gb: number
  tier_hint?: {
    tier?: string
    notes?: string
  }
  deploy_defaults?: {
    duration_minutes?: number
    pricing_class?: string
    job_type?: string
    params?: Record<string, unknown>
  }
}

interface TemplateCatalogResponse {
  contract?: string
  version?: string
  templates?: TemplateCatalogItem[]
  count?: number
  error?: string
}

type TemplateCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
type MinimumBalanceStatus = 'idle' | 'loading' | 'ready' | 'error'

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
    key: 'pytorch-notebook',
    catalogIds: ['pytorch-single-gpu'],
    titleEn: 'Notebook / PyTorch',
    titleAr: 'دفتر / PyTorch',
    descEn: 'CUDA-ready Python notebook with SSH for experiments and training scripts.',
    descAr: 'دفتر Python جاهز لـ CUDA مع SSH للتجارب وسكربتات التدريب.',
    image: 'pytorch',
    durationMin: 60,
    workloadKey: 'notebook',
  },
  {
    key: 'lora-sft',
    catalogIds: ['lora-finetune'],
    titleEn: 'LoRA SFT prep',
    titleAr: 'تجهيز LoRA SFT',
    descEn: 'Stage a dataset, open a PyTorch pod, and run the adapter dry-run path.',
    descAr: 'جهّز مجموعة بيانات، افتح حاوية PyTorch، وشغّل مسار تجربة المحوّل.',
    image: 'pytorch',
    durationMin: 240,
    minVramGb: 16,
    workloadKey: 'finetune',
    badgeEn: 'Dataset path',
    badgeAr: 'مسار البيانات',
  },
  {
    key: 'qlora-sft',
    catalogIds: ['qlora-finetune'],
    titleEn: 'QLoRA SFT prep',
    titleAr: 'تجهيز QLoRA SFT',
    descEn: 'Memory-aware adapter prep for 4-bit fine-tuning experiments.',
    descAr: 'تجهيز محوّلات بذاكرة أقل لتجارب الضبط 4-bit.',
    image: 'pytorch',
    durationMin: 240,
    minVramGb: 12,
    workloadKey: 'finetune',
    badgeEn: '4-bit path',
    badgeAr: 'مسار 4-bit',
  },
  {
    key: 'serve-vllm',
    catalogIds: ['vllm-serve'],
    titleEn: 'vLLM serve pod',
    titleAr: 'حاوية خدمة vLLM',
    descEn: 'Inference server experiments with Jupyter and SSH access.',
    descAr: 'تجارب خدمة الاستدلال مع وصول Jupyter وSSH.',
    image: 'vllm',
    durationMin: 120,
    workloadKey: 'infer',
  },
  {
    key: 'arabic-rag',
    catalogIds: ['arabic-embeddings', 'arabic-reranker'],
    titleEn: 'Embeddings / rerank',
    titleAr: 'التضمين / إعادة الترتيب',
    descEn: 'Arabic retrieval prep for embedding and reranker service experiments.',
    descAr: 'تجهيز استرجاع عربي لتجارب خدمات التضمين وإعادة الترتيب.',
    image: 'vllm',
    durationMin: 120,
    minVramGb: 8,
    workloadKey: 'infer',
    badgeEn: 'RAG path',
    badgeAr: 'مسار RAG',
  },
  {
    key: 'arabic-transcription',
    catalogIds: ['whisper-large-v3'],
    titleEn: 'Arabic transcription',
    titleAr: 'تفريغ صوت عربي',
    descEn: 'Whisper Large-v3 candidate pod for Arabic and multilingual audio tests.',
    descAr: 'حاوية مرشحة لـ Whisper Large-v3 لاختبارات الصوت العربية ومتعددة اللغات.',
    image: 'pytorch',
    durationMin: 60,
    minVramGb: 8,
    workloadKey: 'notebook',
    badgeEn: 'Audio path',
    badgeAr: 'مسار الصوت',
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

// Optional "Guide me by workload" presets. Each sets a VRAM floor and highlights
// a preferred gpu_model substring. It never pins the launch GPU by itself.
interface Workload {
  key: string
  titleEn: string
  titleAr: string
  descEn: string
  descAr: string
  floor: number
  prefer: string // gpu_model substring of the highlighted workload match
  /** Optional image alias + duration the preset pre-selects (the Experiment
   *  pod uses this — a pod-shaped test server beats a bare vLLM on the node,
   *  see the 2026-07-03 VRAM-parking incident + team policy). */
  image?: string
  durationMin?: number
}
const WORKLOADS: Workload[] = [
  { key: 'finetune', titleEn: 'Fine-tune 7–13B', titleAr: 'ضبط 7–13B', descEn: 'LoRA / QLoRA on a small model', descAr: 'LoRA / QLoRA على نموذج صغير', floor: 24, prefer: 'rtx 4090', image: 'pytorch', durationMin: 240 },
  { key: 'infer', titleEn: 'Inference / serving', titleAr: 'الاستدلال / الخدمة', descEn: 'Run a model or API server', descAr: 'تشغيل نموذج أو خادم API', floor: 24, prefer: 'rtx 3090', image: 'vllm', durationMin: 120 },
  { key: 'diffusion', titleEn: 'Image / video gen', titleAr: 'توليد الصور / الفيديو', descEn: 'SDXL, ComfyUI, video diffusion', descAr: 'SDXL وComfyUI وتوليد الفيديو', floor: 24, prefer: 'rtx 4090', image: 'cuda', durationMin: 120 },
  { key: 'notebook', titleEn: 'Notebook / dev', titleAr: 'دفتر / تطوير', descEn: 'Prototyping, light experiments', descAr: 'نماذج أولية وتجارب خفيفة', floor: 8, prefer: 'rtx 3090', image: 'pytorch', durationMin: 60 },
  { key: 'largetrain', titleEn: 'Large training', titleAr: 'تدريب كبير', descEn: 'Full fine-tune, 30B+ models', descAr: 'ضبط كامل، نماذج 30B+', floor: 80, prefer: 'a100', image: 'pytorch', durationMin: 480 },
  { key: 'frontier', titleEn: 'Frontier-scale', titleAr: 'نطاق متقدم', descEn: '100B+, long-context training', descAr: '100B+ وسياق طويل', floor: 141, prefer: 'h200', image: 'pytorch', durationMin: 480 },
  { key: 'experiment', titleEn: 'Experiment server', titleAr: 'خادم تجريبي', descEn: 'vLLM test pod — auto-cleans on stop', descAr: 'حاوية vLLM تجريبية — تُنظَّف تلقائياً عند الإيقاف', floor: 24, prefer: 'rtx 3090', image: 'vllm', durationMin: 120 },
]

// Explicit VRAM filter stops (GB). Kept as chips so renters do not mistake the
// filter for the selected GPU type.
const VRAM_FILTER_OPTIONS = [0, 8, 12, 16, 24, 32, 48, 80, 141, 180]

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
  creditError: LaunchCreditError | null
}

interface LaunchCreditError {
  code: string
  message: string
  requiredSar?: number
  availableSar?: number
  minimumPaidCreditSar?: number
  creditShortfallSar?: number
  rateSarPerHour?: number
  durationMinutes?: number
}

interface PodsListResponse {
  pods?: Pod[]
}

interface AvailableProvidersResponse {
  providers?: Array<Record<string, unknown>>
}

interface PodTrialRoutingReadinessResponse {
  object?: string
  version?: string
  account_classification?: {
    explicit_trial_account_tag_live?: boolean
    trial_credit_source?: string
    paid_credit_source?: string
    note?: string
  }
  routing_policy?: {
    trial_capacity_copy?: string
    high_demand_capacity_copy?: string
    trial_credit_allowed_supply_tiers?: string[]
    paid_credit_required_supply_tiers?: string[]
    provider_visibility?: {
      exposes_provider_id_to_renter?: boolean
      exposes_vendor_to_renter?: boolean
      exposes_supply_tier_to_renter?: boolean
    }
  }
  claim_guards?: {
    launches_pod?: boolean
    mutates_balance?: boolean
    changes_billing?: boolean
    changes_trial_accounting?: boolean
    exposes_vendor_or_provider?: boolean
    claims_workspace_live_acceptance?: boolean
    claims_lora_pod_image_gpu_ready?: boolean
    claims_fine_tuning_ready_pods?: boolean
  }
  infrastructure_proofs?: {
    workspace_pod_contract?: {
      status?: string
      command?: string
      local_roadmap_gate?: string
    }
    workspace_live_acceptance?: {
      status?: string
      command?: string
      live_acceptance_gate?: string
      blocked_on?: string[]
    }
    lora_pod_image_provider_host?: {
      status?: string
      command?: string
      live_acceptance_gate?: string
      blocked_on?: string[]
    }
  }
  error?: string
}

interface MinimumBalanceReadinessResponse {
  object?: string
  version?: string
  current_mode?: string
  account?: {
    balance_halala?: number
    balance_sar?: number
    paid_funding_halala?: number
    paid_funding_sar?: number
    on_demand_committed_halala?: number
    on_demand_committed_sar?: number
    paid_available_halala?: number
    paid_available_sar?: number
  }
  rails?: {
    gpu_pods_provider_supply?: {
      status?: string
      minimum_type?: string
      available_balance_halala?: number
      enforcement_live?: boolean
      notes?: string
    }
    gpu_pods_on_demand_supply?: {
      status?: string
      minimum_type?: string
      paid_available_halala?: number
      enforcement_live?: boolean
      notes?: string
    }
    batch_inference?: {
      status?: string
      enforcement_live?: boolean
    }
    prompt_cache_discount?: {
      status?: string
      enforcement_live?: boolean
    }
    lora_training?: {
      status?: string
      enforcement_live?: boolean
    }
    adapter_deployments?: {
      status?: string
      enforcement_live?: boolean
    }
  }
  claim_guards?: {
    mutates_balance?: boolean
    creates_payment?: boolean
    creates_pod?: boolean
    dispatches_inference?: boolean
    creates_batch?: boolean
    creates_lora_training_job?: boolean
    creates_adapter_deployment?: boolean
    enables_discount?: boolean
    changes_enforcement?: boolean
  }
  error?: string
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
  required_sar?: number
  balance_sar?: number
  paid_available_sar?: number
  minimum_paid_credit_sar?: number
  credit_shortfall_sar?: number
  rate_sar_per_hour?: number
}

// One-time credentials surfaced immediately after a successful launch.
interface LaunchReveal {
  podId: string
  rootPassword: string
  jupyterToken: string
}

type LoadState = 'loading' | 'ready' | 'missing-key'
type TrialRoutingStatus = 'idle' | 'loading' | 'ready' | 'error'

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

function catalogIdsFor(template: LaunchTemplate): string[] {
  return Array.isArray(template.catalogIds) ? template.catalogIds.filter(Boolean) : []
}

function catalogItemsFor(template: LaunchTemplate, catalogById: Map<string, TemplateCatalogItem>): TemplateCatalogItem[] {
  return catalogIdsFor(template)
    .map((id) => catalogById.get(id))
    .filter((item): item is TemplateCatalogItem => !!item)
}

function catalogMinVram(template: LaunchTemplate, catalogItems: TemplateCatalogItem[]): number | undefined {
  const fromCatalog = catalogItems
    .map((item) => Number(item.min_vram_gb))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (fromCatalog.length > 0) return Math.max(...fromCatalog)
  return template.minVramGb
}

function catalogDuration(template: LaunchTemplate, catalogItems: TemplateCatalogItem[]): number | undefined {
  if (template.durationMin) return template.durationMin
  const firstDuration = catalogItems
    .map((item) => Number(item.deploy_defaults?.duration_minutes))
    .find((value) => Number.isFinite(value) && value > 0)
  return firstDuration
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

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function buildLaunchCreditError(err: LaunchResponse, durationMinutes: number): LaunchCreditError {
  const code = String(err.code || err.error || 'insufficient_balance')
  const isPaidCreditGate = code === 'on_demand_requires_prepaid_credit'
  return {
    code,
    message: isPaidCreditGate
      ? 'This GPU requires paid credit.'
      : 'Insufficient credit for this pod.',
    requiredSar: optionalNumber(err.required_sar),
    availableSar: optionalNumber(err.paid_available_sar ?? err.balance_sar),
    minimumPaidCreditSar: optionalNumber(err.minimum_paid_credit_sar),
    creditShortfallSar: optionalNumber(err.credit_shortfall_sar),
    rateSarPerHour: optionalNumber(err.rate_sar_per_hour),
    durationMinutes,
  }
}

function isFundingLaunchError(err: string, creditError?: LaunchCreditError | null): boolean {
  return Boolean(creditError) ||
    err === 'insufficient_balance' ||
    /^insufficient (balance|credit)/i.test(err) ||
    /^this gpu requires prepaid credit/i.test(err)
}

function keepFundingLaunchError(err: string, creditError?: LaunchCreditError | null): Pick<LaunchState, 'error' | 'creditError'> {
  return isFundingLaunchError(err, creditError)
    ? { error: err, creditError: creditError || null }
    : { error: '', creditError: null }
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
function sarFromHalala(value?: number | null): number {
  return Number((Number(value || 0) / 100).toFixed(2))
}
function countTopLevelWorkspaceFolders(files: WorkspaceFile[]): number {
  const folders = new Set<string>()
  for (const file of files) {
    const key = String(file.key || '').replace(/^\/+/, '')
    const parts = key.split('/').filter(Boolean)
    if (parts.length > 1) folders.add(parts[0])
  }
  return folders.size
}
// Approximate USD via the fixed peg — secondary display only.
function fmtUsd(sar: number): string {
  return (sar * SAR_TO_USD).toFixed(2)
}

function isValuePick(gpuModel: string): boolean {
  const m = gpuModel.toLowerCase()
  return VALUE_PICK_MATCHES.some((needle) => m.includes(needle))
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
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [workspaceStageOpen, setWorkspaceStageOpen] = useState(false)
  const [renterName, setRenterName] = useState('Renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>('pytorch-notebook')
  const [templateCatalogStatus, setTemplateCatalogStatus] = useState<TemplateCatalogStatus>('idle')
  const [templateCatalogVersion, setTemplateCatalogVersion] = useState('')
  const [templateCatalog, setTemplateCatalog] = useState<TemplateCatalogItem[]>([])
  const [templateCatalogError, setTemplateCatalogError] = useState('')
  const [trialRoutingStatus, setTrialRoutingStatus] = useState<TrialRoutingStatus>('idle')
  const [trialRouting, setTrialRouting] = useState<PodTrialRoutingReadinessResponse | null>(null)
  const [trialRoutingError, setTrialRoutingError] = useState('')
  const [minimumBalanceStatus, setMinimumBalanceStatus] = useState<MinimumBalanceStatus>('idle')
  const [minimumBalance, setMinimumBalance] = useState<MinimumBalanceReadinessResponse | null>(null)
  const [minimumBalanceError, setMinimumBalanceError] = useState('')
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
    creditError: null,
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

  const fetchTemplateCatalog = useCallback(async () => {
    setTemplateCatalogStatus('loading')
    setTemplateCatalogError('')
    try {
      const res = await fetch(`${getApiBase()}/templates/catalog`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as TemplateCatalogResponse
      if (!res.ok) {
        throw new Error(data.error || `Template catalog failed (${res.status})`)
      }
      setTemplateCatalog(Array.isArray(data.templates) ? data.templates : [])
      setTemplateCatalogVersion(data.version || '')
      setTemplateCatalogStatus('ready')
    } catch (err) {
      setTemplateCatalog([])
      setTemplateCatalogVersion('')
      setTemplateCatalogError(err instanceof Error ? err.message : 'Template catalog unavailable')
      setTemplateCatalogStatus('error')
    }
  }, [])

  const fetchTrialRoutingReadiness = useCallback(async () => {
    setTrialRoutingStatus('loading')
    setTrialRoutingError('')
    try {
      const res = await fetch(`${getApiBase()}/pods/trial-routing/readiness`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as PodTrialRoutingReadinessResponse
      if (!res.ok) {
        throw new Error(data.error || `Trial routing policy failed (${res.status})`)
      }
      setTrialRouting(data)
      setTrialRoutingStatus('ready')
    } catch (err) {
      setTrialRouting(null)
      setTrialRoutingError(err instanceof Error ? err.message : 'Trial routing policy unavailable')
      setTrialRoutingStatus('error')
    }
  }, [])

  const fetchMinimumBalanceReadiness = useCallback(async (apiKey: string) => {
    setMinimumBalanceStatus('loading')
    setMinimumBalanceError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/me/minimum-balances`, {
        headers: { 'x-renter-key': apiKey },
        cache: 'no-store',
      })
      const data = (await res.json().catch(() => ({}))) as MinimumBalanceReadinessResponse
      if (!res.ok) {
        throw new Error(data.error || `Minimum balance policy failed (${res.status})`)
      }
      setMinimumBalance(data)
      setMinimumBalanceStatus('ready')
    } catch (err) {
      setMinimumBalance(null)
      setMinimumBalanceError(err instanceof Error ? err.message : 'Minimum balance policy unavailable')
      setMinimumBalanceStatus('error')
    }
  }, [])

  // ── Auth gate + polling loop ─────────────────────────────────────────
  useEffect(() => {
    fetchTemplateCatalog()
    fetchTrialRoutingReadiness()
  }, [fetchTemplateCatalog, fetchTrialRoutingReadiness])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const apiKey = getRenterKey()
    if (!apiKey) {
      setRenterKey(null)
      setWorkspaceVolume(null)
      setWorkspaceFiles([])
      setMinimumBalance(null)
      setMinimumBalanceStatus('idle')
      setMinimumBalanceError('')
      setLoadState('missing-key')
      return
    }
    setRenterKey(apiKey)
    let cancelled = false
    const tick = async () => {
      await Promise.all([fetchPods(apiKey), fetchRenter(apiKey), fetchProviders(), fetchMinimumBalanceReadiness(apiKey)])
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
  }, [fetchMinimumBalanceReadiness, fetchPods, fetchProviders, fetchRenter])

  // ── Launch ───────────────────────────────────────────────────────────
  const submitLaunch = async () => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || launch.submitting) return

    const token = launch.notebookToken.trim()
    if (token.length < MIN_TOKEN_LENGTH) {
      setLaunch((l) => ({ ...l, error: `Notebook token must be at least ${MIN_TOKEN_LENGTH} characters.`, creditError: null }))
      return
    }

    const image = resolveImage(launch)
    if (launch.imageChoice === CUSTOM_IMAGE_OPTION && !image) {
      setLaunch((l) => ({ ...l, error: 'Enter a Docker image reference for a custom pod.', creditError: null }))
      return
    }

    setLaunch((l) => ({ ...l, submitting: true, error: '', creditError: null }))
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
        const creditError = buildLaunchCreditError(err, launch.durationMinutes)
        setLaunch((l) => ({ ...l, submitting: false, error: creditError.message, creditError }))
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as LaunchResponse
        setLaunch((l) => ({ ...l, submitting: false, error: err.error || 'Failed to launch pod.', creditError: null }))
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
        creditError: null,
      })
      fetchPods(apiKey)
    } catch {
      setLaunch((l) => ({ ...l, submitting: false, error: 'Network error. Please try again.', creditError: null }))
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
  const onImageChoice = (v: string) => {
    setSelectedTemplateKey(null)
    setLaunch((l) => ({ ...l, imageChoice: v, ...keepFundingLaunchError(l.error, l.creditError) }))
  }
  const onCustomImage = (v: string) => {
    setSelectedTemplateKey(null)
    setLaunch((l) => ({ ...l, customImage: v, ...keepFundingLaunchError(l.error, l.creditError) }))
  }
  const onRegenerate = () =>
    setLaunch((l) => ({ ...l, notebookToken: generateNotebookToken(), ...keepFundingLaunchError(l.error, l.creditError) }))

  const templateCatalogById = new Map(templateCatalog.map((item) => [item.id, item]))

  // ── GPU type selection + notify-me ─────────────────────────────────────
  const selectGpuType = useCallback((gpuModel: string) => {
    setLaunch((l) => ({ ...l, gpuType: gpuModel, ...keepFundingLaunchError(l.error, l.creditError) }))
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
    setActiveWorkload(null)
  }

  // Apply a workload preset: set helper filters and runtime defaults only. The
  // final launch GPU changes only through Auto-pick or an explicit GPU card.
  const applyWorkload = (w: Workload) => {
    setSelectedTemplateKey(null)
    setActiveWorkload(w.key)
    setMinVram(w.floor)
    if (w.image || w.durationMin) {
      setLaunch((l) => ({
        ...l,
        ...(w.image ? { imageChoice: w.image } : {}),
        ...(w.durationMin ? { durationMinutes: w.durationMin } : {}),
        ...keepFundingLaunchError(l.error, l.creditError),
      }))
    }
  }

  const applyLaunchTemplate = (template: LaunchTemplate) => {
    if (template.disabled) return
    const catalogItems = catalogItemsFor(template, templateCatalogById)
    const minVram = catalogMinVram(template, catalogItems)
    const durationMinutes = catalogDuration(template, catalogItems)
    if (template.workloadKey) {
      const workload = WORKLOADS.find((w) => w.key === template.workloadKey)
      if (workload) {
        setActiveWorkload(workload.key)
        setMinVram(minVram || workload.floor)
      }
    } else if (minVram) {
      setMinVram(minVram)
    }
    setSelectedTemplateKey(template.key)
    setLaunch((l) => ({
      ...l,
      imageChoice: template.image,
      durationMinutes: durationMinutes || l.durationMinutes,
      ...keepFundingLaunchError(l.error, l.creditError),
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
  const selectedLaunchTemplate = selectedTemplateKey
    ? LAUNCH_TEMPLATES.find((template) => template.key === selectedTemplateKey) || null
    : null
  const selectedTemplateCatalogItems = selectedLaunchTemplate
    ? catalogItemsFor(selectedLaunchTemplate, templateCatalogById)
    : []
  const selectedTemplateMinVram = selectedLaunchTemplate
    ? catalogMinVram(selectedLaunchTemplate, selectedTemplateCatalogItems)
    : undefined
  const selectedImage = resolveImage(launch)
  const selectedPreset = IMAGE_PRESETS.find((img) => img.value === launch.imageChoice)
  const selectedImageLabel = isCustom
    ? (selectedImage || (lang === 'ar' ? 'صورة مخصصة' : 'Custom image'))
    : selectedPreset
      ? (lang === 'ar' ? selectedPreset.labelAr : selectedPreset.label)
      : selectedImage
  const selectedRuntimeLabel = selectedLaunchTemplate
    ? (lang === 'ar' ? selectedLaunchTemplate.titleAr : selectedLaunchTemplate.titleEn)
    : selectedImageLabel
  const durationLabel = formatDuration(launch.durationMinutes)
  const selectedQuoteSar = selectedType?.sar_per_hour != null
    ? selectedType.sar_per_hour * (launch.durationMinutes / 60)
    : null
  const activeFilterCount =
    (gpuSearch.trim() ? 1 : 0) +
    (minVram > 0 ? 1 : 0) +
    availFilters.size
  const activeWorkloadPreset = activeWorkload
    ? WORKLOADS.find((workload) => workload.key === activeWorkload)
    : null
  const activeWorkloadLabel = activeWorkloadPreset
  const workloadSuggestedType = activeWorkloadPreset
    ? availableGpuTypes.find((g) => g.gpu_model.toLowerCase().includes(activeWorkloadPreset.prefer)) || null
    : null
  const workloadSuggestionLabel = workloadSuggestedType ? displayGpuType(workloadSuggestedType.gpu_model) : ''
  const workloadLaunchStateLabel = selectedType ? displayGpuType(selectedType.gpu_model) : 'Auto-pick'
  const gpuRequestDetail = selectedType
    ? `${selectedType.vram_gb} GB VRAM${selectedType.sar_per_hour != null ? ` · SAR ${fmtSar(selectedType.sar_per_hour)}/hr` : ''}`
    : activeWorkloadPreset
      ? `${activeWorkloadPreset.titleEn} filters to ${activeWorkloadPreset.floor} GB+; workload matches are highlighted but not selected until a GPU card is chosen.`
    : selectedTemplateMinVram
      ? `${selectedRuntimeLabel} recommends ${selectedTemplateMinVram} GB+; browse filters do not pin launch until a GPU card is selected.`
      : minVram > 0
        ? `Browsing ${minVram} GB+ cards only; launch still auto-picks until a card is selected.`
        : 'No fixed GPU type selected; backend picks an available type at launch.'
  const trialCapacityCopy = trialRouting?.routing_policy?.trial_capacity_copy || 'Trial credit: DCP/community capacity'
  const highDemandCapacityCopy = trialRouting?.routing_policy?.high_demand_capacity_copy || 'High-demand capacity: paid credit'
  const explicitTrialTagLive = trialRouting?.account_classification?.explicit_trial_account_tag_live === true
  const trialAccountModeLabel = explicitTrialTagLive ? 'Trial accounts: explicit tag' : 'Trial accounts: grant-credit provenance'
  const trialTagAnswerLabel = explicitTrialTagLive ? 'Trial-account tag live' : 'No trial-account tag live'
  const trialCreditSourceLabel = trialRouting?.account_classification?.trial_credit_source === 'renters.trial_grant_halala'
    ? 'Trial source: grant balance'
    : 'Trial source: credit provenance'
  const trialRouteAnswerLabel = 'Trial route: native/community GPU pool'
  const highDemandAnswerLabel = 'High-demand GPUs: paid credit only'
  const trialHandlingAnswerLabel = explicitTrialTagLive
    ? 'Trial flag is explicit on the account'
    : 'No separate trial tag; grant credit decides'
  const trialPolicyHeadline = explicitTrialTagLive
    ? 'Trial account tag is active'
    : 'Trial accounts use grant-credit provenance'
  const trialPolicyDetail = explicitTrialTagLive
    ? `${trialCapacityCopy} · ${highDemandCapacityCopy}`
    : `No separate trial tag is live. ${trialCapacityCopy} ${highDemandCapacityCopy}`
  const gpuRequestModeLabel = selectedType ? 'Fixed GPU request' : 'Auto-pick request'
  const launchGpuLine = selectedType
    ? `Launch will request ${displayGpuType(selectedType.gpu_model)}.`
    : 'Launch will auto-pick an available GPU type; no GPU is pinned yet.'
  const stage2FilterLabel = minVram > 0 ? `Browse filter ${minVram} GB+` : 'No browse filter'
  const stage2GpuDecisionLabel = selectedType ? displayGpuType(selectedType.gpu_model) : 'Auto-pick GPU'
  const launchModeHeadline = selectedType
    ? 'Fixed GPU selected for launch'
    : 'Auto-pick is selected for launch'
  const launchModeDetail = selectedType
    ? 'The launch request will include this GPU type. Filters below only change which cards are visible.'
    : 'Templates, workload presets, and VRAM chips only narrow or highlight cards; they do not pin a GPU until a card is selected.'
  const launchRequestPayloadLabel = selectedType
    ? `gpu_type = ${displayGpuType(selectedType.gpu_model)}`
    : 'gpu_type omitted = auto-pick'
  const launchRequestPayloadDetail = selectedType
    ? 'This selected GPU card is pinned in the final launch request.'
    : 'No GPU card is pinned; filters and template hints stay browse-only.'
  const stage2ModeChipLabel = selectedType ? 'Mode: fixed GPU selected' : 'Mode: auto-pick selected'
  const vramFilterLaunchState = selectedType
    ? `Launch request: ${displayGpuType(selectedType.gpu_model)}`
    : 'Launch request: Auto-pick'
  const vramFilterDisclaimer = selectedType
    ? `Browse filter only. Launch stays ${displayGpuType(selectedType.gpu_model)} until you choose another card or return to auto-pick.`
    : 'Browse filter only. Launch stays Auto-pick until you choose Use as launch GPU on a card.'
  const workspacePodContractStatus = trialRouting?.infrastructure_proofs?.workspace_pod_contract?.status
  const workspaceLiveStatus = trialRouting?.infrastructure_proofs?.workspace_live_acceptance?.status
  const loraPodImageStatus = trialRouting?.infrastructure_proofs?.lora_pod_image_provider_host?.status
  const trialRoutingSynced = trialRoutingStatus === 'ready' &&
    trialRouting?.object === 'pod_trial_routing_readiness' &&
    trialRouting?.claim_guards?.launches_pod === false &&
    trialRouting?.claim_guards?.mutates_balance === false &&
    trialRouting?.claim_guards?.changes_billing === false &&
    trialRouting?.claim_guards?.changes_trial_accounting === false &&
    trialRouting?.claim_guards?.exposes_vendor_or_provider === false &&
    trialRouting?.claim_guards?.claims_workspace_live_acceptance === false &&
    trialRouting?.claim_guards?.claims_lora_pod_image_gpu_ready === false &&
    trialRouting?.claim_guards?.claims_fine_tuning_ready_pods === false &&
    trialRouting?.routing_policy?.provider_visibility?.exposes_provider_id_to_renter === false &&
    trialRouting?.routing_policy?.provider_visibility?.exposes_vendor_to_renter === false &&
    trialRouting?.routing_policy?.provider_visibility?.exposes_supply_tier_to_renter === false
  const trialPolicySourceLabel = trialRoutingSynced
    ? 'Backend policy: synced'
    : trialRoutingStatus === 'loading'
      ? 'Backend policy: checking'
      : 'Backend policy: fallback copy'
  const providerPodRail = minimumBalance?.rails?.gpu_pods_provider_supply
  const onDemandPodRail = minimumBalance?.rails?.gpu_pods_on_demand_supply
  const paidAvailableSar = typeof minimumBalance?.account?.paid_available_sar === 'number'
    ? minimumBalance.account.paid_available_sar
    : sarFromHalala(minimumBalance?.account?.paid_available_halala)
  const providerPodGateLabel = providerPodRail?.status === 'live_quote_preflight'
    ? 'Provider/community pods: quote preflight'
    : 'Provider/community pods: checking'
  const onDemandPodGateLabel = onDemandPodRail?.status === 'live_paid_credit_preflight'
    ? 'On-demand pods: paid credit preflight'
    : 'On-demand pods: checking'
  const minimumBalanceSynced = minimumBalanceStatus === 'ready' &&
    minimumBalance?.object === 'minimum_balance_readiness' &&
    minimumBalance?.current_mode === 'read_only_policy_contract' &&
    providerPodRail?.enforcement_live === true &&
    onDemandPodRail?.enforcement_live === true &&
    minimumBalance?.claim_guards?.mutates_balance === false &&
    minimumBalance?.claim_guards?.creates_payment === false &&
    minimumBalance?.claim_guards?.creates_pod === false &&
    minimumBalance?.claim_guards?.changes_enforcement === false
  const minimumBalanceSourceLabel = minimumBalanceSynced
    ? 'Minimum balance: synced'
    : minimumBalanceStatus === 'loading'
      ? 'Minimum balance: checking'
      : 'Minimum balance: fallback copy'
  const futureBillingRailsBlocked = [
    minimumBalance?.rails?.batch_inference,
    minimumBalance?.rails?.prompt_cache_discount,
    minimumBalance?.rails?.lora_training,
    minimumBalance?.rails?.adapter_deployments,
  ].filter((rail) => rail?.enforcement_live === false).length
  const workspaceFolderCount = countTopLevelWorkspaceFolders(workspaceFiles)
  const workspaceChecklistLabel = workspaceVolume
    ? workspaceFiles.length > 0
      ? `${workspaceFiles.length} files · ${workspaceFolderCount} folders`
      : `${workspaceVolume.size_gb} GB /workspace · empty`
    : 'Create /workspace volume'
  const workspaceChecklistDetail = workspaceVolume
    ? 'Stage 1 can stay collapsed; open only the folder you need.'
    : 'Create a persistent workspace before launching.'
  const workspaceStageModeLabel = workspaceVolume
    ? workspaceFiles.length > 4
      ? 'Accordion collapsed by default'
      : 'Compact workspace checkpoint'
    : 'Volume required'
  const workspaceStageBodyOpen = workspaceStageOpen || workspaceFiles.length === 0
  const workspaceStageHeadline = workspaceVolume
    ? workspaceFiles.length > 0
      ? `Stage 1 ready: ${workspaceFiles.length} files grouped in ${workspaceFolderCount} folders`
      : `${workspaceVolume.size_gb} GB /workspace ready for uploads`
    : 'Create /workspace volume'
  const workspaceStageDetail = workspaceVolume
    ? workspaceFiles.length > 0
      ? 'Collapsed by default. Expand only if you need to upload, delete, or inspect a folder.'
      : 'Open Stage 1 to upload datasets, notebooks, adapters, or checkpoints.'
    : 'Rent a persistent workspace volume before launching a pod.'
  const workspaceStageToggleLabel = workspaceStageBodyOpen
    ? 'Collapse Stage 1 workspace'
    : 'Expand Stage 1 workspace'
  const gpuChecklistLabel = selectedType ? displayGpuType(selectedType.gpu_model) : 'Auto-pick · no fixed GPU'
  const gpuChecklistDetail = selectedType
    ? `Fixed launch request · ${selectedType.vram_gb} GB${selectedType.sar_per_hour != null ? ` · SAR ${fmtSar(selectedType.sar_per_hour)}/hr` : ''}`
    : minVram > 0
      ? `${stage2FilterLabel} is browsing only; launch still auto-picks.`
      : 'Backend picks an available GPU type at launch.'
  const creditChecklistLabel = minimumBalanceSynced
    ? 'Credit gates synced'
    : minimumBalanceStatus === 'loading'
      ? 'Credit gates checking'
      : 'Credit gates fallback'
  const creditChecklistDetail = minimumBalanceSynced
    ? `Paid available SAR ${fmtSar(paidAvailableSar)} · high-demand requires paid credit.`
    : 'Launch still uses backend credit enforcement.'
  const workspaceFastPathLabel = workspaceVolume
    ? workspaceFiles.length > 0
      ? `${workspaceFiles.length} files staged; file tree can stay collapsed.`
      : `${workspaceVolume.size_gb} GB /workspace ready; no files staged.`
    : 'Create a workspace volume, then continue to Stage 2.'
  const stage2FastPathLabel = selectedType
    ? `Fixed launch GPU: ${displayGpuType(selectedType.gpu_model)}.`
    : 'Auto-pick is active; no fixed GPU is selected.'
  const stage2FastPathDetail = selectedType
    ? 'The final launch request includes this GPU type.'
    : 'Templates and VRAM filters only narrow the cards; pick a card to pin the launch GPU.'
  const workspaceNavStatusLabel = workspaceVolume
    ? workspaceFiles.length > 0
      ? `${workspaceFiles.length} files grouped · collapsible`
      : `${workspaceVolume.size_gb} GB ready · collapsible`
    : 'Create volume'
  const stage2NavStatusLabel = selectedType
    ? `Pinned: ${displayGpuType(selectedType.gpu_model)}`
    : 'Auto-pick live · no card pinned'
  const stage3NavStatusLabel = `${selectedRuntimeLabel} · ${durationLabel}`
  const gpuPickerLaunchHeadline = selectedType
    ? `Selected for launch: ${displayGpuType(selectedType.gpu_model)}`
    : 'Selected for launch: Auto-pick'
  const gpuPickerLaunchDetail = selectedType
    ? 'Changing templates, VRAM chips, search, or sort will not replace the pinned GPU card.'
    : 'No card is pinned yet. Templates, VRAM chips, search, and sort only organize the list below.'
  const gpuPickerRequestCode = selectedType
    ? `gpu_type = ${displayGpuType(selectedType.gpu_model)}`
    : 'gpu_type omitted'
  const launchButtonLabel = selectedType
    ? `Launch ${displayGpuType(selectedType.gpu_model)} pod`
    : 'Launch auto-picked GPU pod'

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

          <nav className="pod-stage-nav" aria-label={lang === 'ar' ? 'مراحل تشغيل الحاوية' : 'Pod launch stages'}>
            <a href="#pod-stage-1" className={workspaceVolume ? 'ok' : ''}>
              <span>Stage 1 of 3</span>
              <strong><Bi en="Workspace files · collapsible" ar="ملفات مساحة العمل · قابلة للطي" /></strong>
              <em>
                <Bi en={workspaceNavStatusLabel} ar={workspaceVolume ? 'قابلة للطي؛ انتقل للمرحلة 2 عند الجاهزية' : 'أنشئ وحدة'} />
              </em>
            </a>
            <a href="#pod-stage-2" className={`primary${selectedType || launch.gpuType === '' ? ' ok' : ''}`}>
              <span>Stage 2 of 3</span>
              <strong><Bi en="Actual launch GPU" ar="GPU التشغيل الفعلي" /></strong>
              <em>
                <Bi en={stage2NavStatusLabel} ar={selectedType ? 'تم تثبيت بطاقة GPU' : 'اختيار تلقائي · لا توجد بطاقة مثبتة'} />
              </em>
            </a>
            <a href="#pod-stage-3" className="ok">
              <span>Stage 3 of 3</span>
              <strong><Bi en="Runtime + launch" ar="البيئة + التشغيل" /></strong>
              <em>{stage3NavStatusLabel}</em>
            </a>
          </nav>

          <div className="pod-fast-path" aria-label={lang === 'ar' ? 'الانتقال السريع للمرحلة 2' : 'Fast path to Stage 2'}>
            <a href="#pod-stage-2" className="pod-fast-card primary">
              <span><Bi en="Main decision" ar="القرار الرئيسي" /></span>
              <strong><Bi en="Go straight to Stage 2 of 3" ar="اذهب مباشرة للمرحلة 2 من 3" /></strong>
              <em><Bi en={`${stage2FastPathLabel} ${stage2FastPathDetail}`} ar="القوالب وتصفية الذاكرة للتصفح فقط؛ اختر بطاقة لتثبيت GPU التشغيل." /></em>
            </a>
            <a href="#pod-stage-1" className="pod-fast-card">
              <span>Stage 1 of 3</span>
              <strong><Bi en="Workspace is collapsible" ar="مساحة العمل قابلة للطي" /></strong>
              <em><Bi en={`${workspaceFastPathLabel} Skip file-by-file review when the folder summary looks right.`} ar={workspaceVolume ? 'تبقى شجرة الملفات مطوية؛ افتح مجلداً واحداً فقط عند الحاجة.' : 'أنشئ وحدة مساحة عمل ثم تابع للمرحلة 2.'} /></em>
            </a>
            <div className="pod-fast-card policy">
              <span><Bi en="Trial answer" ar="إجابة التجربة" /></span>
              <strong><Bi en={trialTagAnswerLabel} ar={explicitTrialTagLive ? 'وسم التجربة نشط' : 'لا يوجد وسم تجربة مباشر'} /></strong>
              <em><Bi en={`${trialHandlingAnswerLabel}; ${trialRouteAnswerLabel}; ${highDemandAnswerLabel}.`} ar="لا يوجد وسم منفصل؛ رصيد المنحة يذهب إلى سعة DCP والمجتمع؛ الطلب العالي يحتاج رصيداً مدفوعاً." /></em>
            </div>
          </div>

          {/* ── Workspace staging ────────────────────────────── */}
          <div className="pod-stage" id="pod-stage-1" style={{ marginTop: '28px' }}>
            <div className="pod-stage-hd">
              <span className="pod-stage-no">Stage 1 of 3</span>
              <div>
                <h2><Bi en="Stage 1: workspace files, collapsible" ar="المرحلة 1: ملفات مساحة العمل، قابلة للطي" /></h2>
                <p>
                  <Bi
                    en="Use the same /workspace volume that reattaches when a pod starts; expand only when the summary needs inspection."
                    ar="استخدم نفس وحدة /workspace التي تُعاد عند تشغيل الحاوية."
                  />
                </p>
              </div>
            </div>
            <div className={`pod-stage-accordion ${workspaceStageBodyOpen ? 'open' : 'closed'}`} aria-label={lang === 'ar' ? 'نقطة تحقق مساحة العمل للمرحلة 1' : 'Stage 1 workspace checkpoint'}>
              <div className="pod-stage-accordion-summary">
                <div className="pod-stage-accordion-copy">
                  <span>
                    <Bi en={workspaceStageBodyOpen ? 'Workspace details open' : 'Workspace details collapsed'} ar={workspaceStageBodyOpen ? 'تفاصيل مساحة العمل مفتوحة' : 'تفاصيل مساحة العمل مطوية'} />
                  </span>
                  <strong><Bi en={workspaceStageHeadline} ar={workspaceVolume ? 'مساحة العمل جاهزة' : 'أنشئ وحدة مساحة عمل'} /></strong>
                  <em><Bi en={workspaceStageDetail} ar={workspaceFiles.length > 0 ? 'تبقى التفاصيل مطوية؛ افتحها فقط عند الحاجة.' : 'افتح المرحلة 1 لإضافة الملفات.'} /></em>
                </div>
                <div className="pod-stage-accordion-facts">
                  <span>
                    <Bi en={workspaceVolume ? `${workspaceVolume.size_gb} GB /workspace` : 'No workspace volume'} ar={workspaceVolume ? `${workspaceVolume.size_gb} غ.ب /workspace` : 'لا توجد وحدة مساحة عمل'} />
                  </span>
                  <span>
                    <Bi en={`${workspaceFiles.length} staged files`} ar={`${workspaceFiles.length} ملفات مجهزة`} />
                  </span>
                  <span>
                    <Bi en={`${workspaceFolderCount} folders`} ar={`${workspaceFolderCount} مجلدات`} />
                  </span>
                  <a href="#pod-stage-2">
                    <Bi en="Skip to Stage 2" ar="انتقل للمرحلة 2" />
                  </a>
                  <button
                    type="button"
                    aria-expanded={workspaceStageBodyOpen}
                    aria-controls="pod-stage-1-workspace-panel"
                    onClick={() => setWorkspaceStageOpen((value) => !value)}
                  >
                    <Bi en={workspaceStageToggleLabel} ar={workspaceStageBodyOpen ? 'اطوِ مساحة العمل' : 'افتح مساحة العمل'} />
                  </button>
                </div>
              </div>
              <div id="pod-stage-1-workspace-panel" hidden={!workspaceStageBodyOpen}>
                <WorkspacePanel
                  apiBase={getApiBase()}
                  renterKey={renterKey}
                  context="pod-launch"
                  nextStageHref="#pod-stage-2"
                  onVolumeLoaded={setWorkspaceVolume}
                  onFilesLoaded={setWorkspaceFiles}
                />
              </div>
            </div>
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
                <span className="pod-flow-no">Stage 1</span>
                <span className="pod-flow-k"><Bi en="Workspace" ar="مساحة العمل" /></span>
                <strong>
                  {workspaceVolume
                    ? `${workspaceVolume.size_gb} GB /workspace`
                    : <Bi en="No volume yet" ar="لا توجد وحدة بعد" />}
                </strong>
              </div>
              <div className={`pod-flow-item${selectedType ? ' ok' : ''}`}>
                <span className="pod-flow-no">Stage 2</span>
                <span className="pod-flow-k"><Bi en="GPU decision" ar="قرار GPU" /></span>
                <strong>
                  {selectedType
                    ? displayGpuType(selectedType.gpu_model)
                    : <Bi en="Auto-pick · no fixed GPU" ar="اختيار تلقائي · بدون GPU محدد" />}
                </strong>
              </div>
              <div className="pod-flow-item ok">
                <span className="pod-flow-no">Stage 3</span>
                <span className="pod-flow-k"><Bi en="Runtime" ar="بيئة التشغيل" /></span>
                <strong>{selectedRuntimeLabel} · {durationLabel}</strong>
              </div>
              <div className={`pod-flow-item${selectedQuoteSar != null ? ' ok' : ''}`}>
                <span className="pod-flow-no">Launch</span>
                <span className="pod-flow-k"><Bi en="Prepaid quote" ar="تقدير مسبق" /></span>
                <strong>
                  {selectedQuoteSar != null
                    ? `~SAR ${fmtSar(selectedQuoteSar)}`
                    : <Bi en="After GPU pick" ar="بعد اختيار GPU" />}
                </strong>
              </div>
            </div>

            <div className="pod-launch-checklist" aria-label={lang === 'ar' ? 'قائمة تحقق التشغيل' : 'Launch checklist'}>
              <a className={workspaceVolume ? 'ready' : 'needs'} href="#pod-stage-1">
                <span className="pod-launch-check-no">Stage 1</span>
                <strong><Bi en="Workspace" ar="مساحة العمل" /></strong>
                <b>{workspaceChecklistLabel}</b>
                <em><Bi en={workspaceChecklistDetail} ar={workspaceVolume ? 'تبقى المرحلة 1 مطوية؛ افتح مجلداً واحداً فقط عند الحاجة.' : 'أنشئ مساحة عمل دائمة قبل التشغيل.'} /></em>
              </a>
              <a className={selectedType ? 'ready' : 'auto'} href="#pod-stage-2">
                <span className="pod-launch-check-no">Stage 2</span>
                <strong><Bi en="Actual GPU request" ar="طلب GPU الفعلي" /></strong>
                <b>{gpuChecklistLabel}</b>
                <em><Bi en={gpuChecklistDetail} ar={selectedType ? 'طلب GPU محدد عند التشغيل.' : 'التصفية للتصفح فقط؛ التشغيل يختار تلقائياً.'} /></em>
              </a>
              <a className={trialRoutingSynced ? 'ready' : 'needs'} href="#pod-stage-2">
                <span className="pod-launch-check-no">Trial</span>
                <strong><Bi en="Account route" ar="مسار الحساب" /></strong>
                <b><Bi en={trialAccountModeLabel} ar={explicitTrialTagLive ? 'وسم تجربة صريح' : 'حسب مصدر رصيد المنحة'} /></b>
                <em><Bi en={`${trialRouteAnswerLabel}; ${highDemandAnswerLabel}.`} ar="رصيد التجربة لسعة DCP والمجتمع؛ الطلب العالي يحتاج رصيداً مدفوعاً." /></em>
              </a>
              <a className={minimumBalanceSynced ? 'ready' : 'needs'} href="#pod-stage-3">
                <span className="pod-launch-check-no">Credit</span>
                <strong><Bi en="Minimum balance" ar="الحد الأدنى للرصيد" /></strong>
                <b><Bi en={creditChecklistLabel} ar={minimumBalanceSynced ? 'بوابات الرصيد متزامنة' : 'بوابات الرصيد قيد الفحص'} /></b>
                <em><Bi en={creditChecklistDetail} ar="التشغيل يستخدم بوابات الرصيد في الخلفية." /></em>
              </a>
            </div>

            <div className="pod-stage-control-map" aria-label={lang === 'ar' ? 'ما الذي تتحكم به كل مرحلة' : 'What each stage controls'}>
              <a href="#pod-stage-1">
                <span>Stage 1</span>
                <strong><Bi en="Workspace tree" ar="شجرة مساحة العمل" /></strong>
                <em><Bi en={workspaceStageModeLabel} ar={workspaceVolume ? 'شجرة المجلدات أولاً' : 'وحدة التخزين مطلوبة'} /></em>
              </a>
              <a href="#pod-stage-2" className="primary">
                <span>Stage 2</span>
                <strong><Bi en="Actual launch GPU" ar="GPU التشغيل الفعلي" /></strong>
                <em><Bi en={selectedType ? 'A GPU card is pinned' : 'Auto-pick is still active'} ar={selectedType ? 'تم تثبيت بطاقة GPU' : 'الاختيار التلقائي نشط'} /></em>
              </a>
              <a href="#pod-stage-3">
                <span>Stage 3</span>
                <strong><Bi en="Runtime and launch" ar="البيئة والتشغيل" /></strong>
                <em>{selectedRuntimeLabel} · {durationLabel}</em>
              </a>
            </div>

            <div className="pod-stage-hd pod-stage-hd--compact" id="pod-stage-2">
              <span className="pod-stage-no">Stage 2 of 3</span>
              <div>
                <h2><Bi en="Stage 2: actual launch GPU and template" ar="المرحلة 2: GPU التشغيل الفعلي والقالب" /></h2>
                <p>
                  <Bi
                    en="The launch GPU is the Auto-pick toggle or the selected card. Templates, VRAM, search, and sort stay browse-only helpers."
                    ar="اختر قالب العمل، ثم حدد معالج GPU بوضوح أو اترك التشغيل على الاختيار التلقائي."
                  />
                </p>
              </div>
            </div>

            <div className="pod-compute-summary" aria-live="polite" aria-label={lang === 'ar' ? 'قرار GPU في المرحلة 2' : 'Stage 2 GPU decision'}>
              <div className="pod-compute-main">
                <span className="pod-compute-k">
                  <Bi en="Stage 2 actual launch GPU" ar="قرار المرحلة 2" />
                </span>
                {selectedType ? (
                  <>
                    <strong>{displayGpuType(selectedType.gpu_model)}</strong>
                    <span>
                      <Bi en={launchGpuLine} ar="سيتم طلب نوع GPU المحدد عند التشغيل." /> {selectedType.vram_gb} GB VRAM
                      {selectedType.sar_per_hour != null && ` · SAR ${fmtSar(selectedType.sar_per_hour)}/hr`}
                    </span>
                  </>
                ) : (
                  <>
                    <strong><Bi en="Auto-pick at launch · no GPU pinned" ar="اختيار تلقائي عند التشغيل" /></strong>
                    <span>
                      <Bi
                        en={`${launchGpuLine} ${gpuRequestDetail}`}
                        ar="لم يتم تحديد نوع GPU؛ التصفية أدناه للتصفح فقط."
                      />
                    </span>
                  </>
                )}
                <div className="pod-request-toggle" role="group" aria-label={lang === 'ar' ? 'وضع طلب GPU' : 'GPU request mode'}>
                  <button
                    type="button"
                    className={!selectedType ? 'on' : ''}
                    aria-pressed={!selectedType}
                    onClick={() => setLaunch((l) => ({ ...l, gpuType: '', ...keepFundingLaunchError(l.error, l.creditError) }))}
                  >
                    <Bi en="Auto-pick" ar="اختيار تلقائي" />
                  </button>
                  <button
                    type="button"
                    className={selectedType ? 'on' : ''}
                    aria-pressed={!!selectedType}
                    onClick={() => document.getElementById('gpu-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    <Bi en="Fixed GPU" ar="GPU محدد" />
                  </button>
                </div>
                <div className={`pod-stage2-mode-card ${selectedType ? 'fixed' : 'auto'}`}>
                  <span>
                    <Bi en="Launch mode" ar="وضع التشغيل" />
                  </span>
                  <strong>
                    <Bi en={launchModeHeadline} ar={selectedType ? 'تم تحديد GPU للتشغيل' : 'الاختيار التلقائي محدد للتشغيل'} />
                  </strong>
                  <em>
                    <Bi en={launchModeDetail} ar={selectedType ? 'سيرسل التشغيل نوع GPU هذا. التصفية أدناه للتصفح فقط.' : 'القوالب وتصفية الذاكرة تضيق البطاقات فقط ولا تثبت GPU حتى تختار بطاقة.'} />
                  </em>
                </div>
                <div className={`pod-request-preview ${selectedType ? 'fixed' : 'auto'}`} aria-label={lang === 'ar' ? 'معاينة طلب التشغيل' : 'Launch request preview'}>
                  <span>
                    <Bi en="What DCP will send" ar="ما سيرسله DCP" />
                  </span>
                  <code>{launchRequestPayloadLabel}</code>
                  <em>
                    <Bi en={launchRequestPayloadDetail} ar={selectedType ? 'بطاقة GPU المحددة مثبتة في طلب التشغيل النهائي.' : 'لا توجد بطاقة GPU مثبتة؛ التصفية والقوالب للتصفح فقط.'} />
                  </em>
                </div>
                <div className="pod-decision-lane" aria-label={lang === 'ar' ? 'ملخص قرارات المرحلة 2' : 'Stage 2 decision summary'}>
                  <span>
                    <b><Bi en="Template" ar="القالب" /></b>
                    {selectedRuntimeLabel}
                  </span>
                  <span>
                    <b><Bi en="Filter" ar="التصفية" /></b>
                    <Bi en={stage2FilterLabel} ar={minVram > 0 ? `تصفية ${minVram} غ.ب+` : 'بدون تصفية تصفح'} />
                  </span>
                  <span className={selectedType ? 'fixed' : 'auto'}>
                    <b><Bi en="Actual GPU" ar="GPU الفعلي" /></b>
                    {stage2GpuDecisionLabel}
                  </span>
                </div>
                <div className="pod-stage2-source-grid" aria-label={lang === 'ar' ? 'مصادر قرار GPU' : 'GPU decision source guide'}>
                  <span className="affects">
                    <b><Bi en="Affects launch" ar="يؤثر على التشغيل" /></b>
                    <Bi en="Auto-pick toggle or a selected GPU card" ar="زر الاختيار التلقائي أو بطاقة GPU محددة" />
                  </span>
                  <span>
                    <b><Bi en="Browse only" ar="تصفح فقط" /></b>
                    <Bi en="Template hint, VRAM chips, search, and sort" ar="تلميح القالب وشرائح الذاكرة والبحث والترتيب" />
                  </span>
                  <span>
                    <b><Bi en="Trial accounts" ar="حسابات التجربة" /></b>
                    <Bi en={`${trialHandlingAnswerLabel}; ${trialRouteAnswerLabel}.`} ar="لا يوجد وسم منفصل؛ رصيد المنحة يستخدم وحدات DCP والمجتمع." />
                  </span>
                </div>
                <div className="pod-stage2-rule" aria-label={lang === 'ar' ? 'قاعدة اختيار GPU في المرحلة 2' : 'Stage 2 launch GPU selection rule'}>
                  <strong>
                    <Bi en="Launch selection rule" ar="قاعدة اختيار التشغيل" />
                  </strong>
                  <span>
                    <Bi
                      en="Only Auto-pick or a GPU card selected with Use as launch GPU changes what DCP sends. Templates, workload presets, VRAM chips, search, and sort only organize choices."
                      ar="الاختيار التلقائي أو بطاقة GPU المحددة فقط يغير ما يرسله DCP. القوالب والعمل والذاكرة والبحث والترتيب تنظّم الخيارات فقط."
                    />
                  </span>
                </div>
              </div>
              <div className="pod-compute-facts">
                <span className={selectedType ? 'pod-request-state fixed' : 'pod-request-state auto'}>
                  {selectedType
                    ? <Bi en={`Request mode: ${gpuRequestModeLabel}`} ar="وضع الطلب: GPU محدد" />
                    : <Bi en={`Request mode: ${gpuRequestModeLabel}`} ar="وضع الطلب: اختيار تلقائي" />}
                </span>
                <span className={`pod-policy-state ${trialRoutingStatus === 'loading' ? 'loading' : trialRoutingSynced ? 'ready' : 'fallback'}`}>
                  {trialRoutingStatus === 'loading'
                    ? <Bi en="Credit policy: checking" ar="سياسة الرصيد: جار التحقق" />
                    : trialRoutingSynced
                      ? <Bi en="Credit policy: synced" ar="سياسة الرصيد: متزامنة" />
                      : <Bi en="Credit policy: built-in fallback" ar="سياسة الرصيد: نسخة احتياطية" />}
                </span>
                {minVram > 0 && (
                  <span>
                    <Bi en={`Browse-only filter: ≥ ${minVram} GB`} ar={`تصفية البطاقات: ≥ ${minVram} غ.ب`} />
                  </span>
                )}
                {minVram > 0 && !selectedType && (
                  <span className="pod-filter-note">
                    <Bi en="Filter only; not the launch GPU" ar="تصفية فقط؛ ليست GPU التشغيل" />
                  </span>
                )}
                <span className="pod-filter-note">
                  <Bi en="VRAM chips are browse filters, not the selected launch GPU" ar="شرائح الذاكرة للتصفح فقط وليست GPU التشغيل المحددة" />
                </span>
                {selectedQuoteSar != null && (
                  <span>
                    <Bi en={`Quote: ~SAR ${fmtSar(selectedQuoteSar)}`} ar={`التقدير: ~${fmtSar(selectedQuoteSar)} ﷼`} />
                  </span>
                )}
                <span>
                  <Bi en={trialCapacityCopy} ar="رصيد التجربة: سعة DCP والمجتمع" />
                </span>
                <span>
                  <Bi en={highDemandCapacityCopy} ar="السعة عالية الطلب: رصيد مدفوع" />
                </span>
                <span>
                  <Bi en={trialRouteAnswerLabel} ar="مسار التجربة: وحدات DCP والمجتمع" />
                </span>
                <span>
                  <Bi en={highDemandAnswerLabel} ar="وحدات الطلب العالي: رصيد مدفوع فقط" />
                </span>
                <span>
                  <Bi en={trialAccountModeLabel} ar={explicitTrialTagLive ? 'حسابات التجربة: وسم صريح' : 'حسابات التجربة: حسب مصدر الرصيد'} />
                </span>
                <span>
                  <Bi en={trialTagAnswerLabel} ar={explicitTrialTagLive ? 'وسم حساب التجربة نشط' : 'لا يوجد وسم حساب تجربة مباشر'} />
                </span>
                <span>
                  <Bi en={trialHandlingAnswerLabel} ar={explicitTrialTagLive ? 'وسم التجربة ظاهر على الحساب' : 'لا يوجد وسم منفصل؛ مصدر الرصيد يحدد المسار'} />
                </span>
                <span>
                  <Bi en={trialCreditSourceLabel} ar="مصدر التجربة: رصيد المنحة" />
                </span>
                {selectedType && (
                  <button
                    type="button"
                    className="pod-auto-pick"
                    onClick={() => setLaunch((l) => ({ ...l, gpuType: '', ...keepFundingLaunchError(l.error, l.creditError) }))}
                  >
                    <Bi en="Use auto-pick" ar="استخدم الاختيار التلقائي" />
                  </button>
                )}
                {trialRoutingStatus === 'error' && trialRoutingError && (
                  <span className="pod-policy-note">
                    <Bi en="Launch still uses backend gates." ar="التشغيل لا يزال يستخدم بوابات الخادم." />
                  </span>
                )}
              </div>
            </div>

            <div className="gpu-selection-strip" aria-label={lang === 'ar' ? 'طلب GPU للتشغيل' : 'Actual launch GPU request'} aria-live="polite">
              <div className="gpu-selection-copy">
                <span className="gpu-selection-k">
                  <Bi en="Stage 2 selected launch GPU" ar="GPU التشغيل المحدد في المرحلة 2" />
                </span>
                {selectedType ? (
                  <>
                    <strong>{displayGpuType(selectedType.gpu_model)}</strong>
                    <span>
                      {selectedType.vram_gb} GB VRAM
                      {selectedType.sar_per_hour != null && ` · SAR ${fmtSar(selectedType.sar_per_hour)}/hr`}
                    </span>
                  </>
                ) : (
                  <>
                    <strong><Bi en="Auto-pick: no fixed GPU" ar="اختيار تلقائي: بدون GPU محدد" /></strong>
                    <span>
                      <Bi
                        en={gpuRequestDetail}
                        ar="لم يتم تحديد نوع GPU؛ التصفية تقلل البطاقات أدناه فقط."
                      />
                    </span>
                  </>
                )}
              </div>
              <div className="gpu-selection-actions">
                <span className={`gpu-selection-chip ${selectedType ? 'fixed' : 'auto'}`}>
                  {selectedType
                    ? <Bi en="Request: fixed GPU" ar="الطلب: GPU محدد" />
                    : <Bi en="Request: auto-pick" ar="الطلب: اختيار تلقائي" />}
                </span>
                <span className={`gpu-selection-chip ${selectedType ? 'fixed' : 'auto'}`}>
                  <Bi en={stage2ModeChipLabel} ar={selectedType ? 'الوضع: GPU محدد' : 'الوضع: اختيار تلقائي'} />
                </span>
                <span className="gpu-selection-chip final">
                  <Bi en="Final launch request" ar="طلب التشغيل النهائي" />
                </span>
                <span className="gpu-selection-chip request">
                  {launchRequestPayloadLabel}
                </span>
                <span className="gpu-selection-chip">
                  {minVram > 0
                    ? <Bi en={`Browse filter ${minVram} GB+`} ar={`تصفية التصفح ${minVram} غ.ب+`} />
                    : <Bi en="Any VRAM" ar="أي ذاكرة" />}
                </span>
                {selectedTemplateMinVram && (
                  <span className="gpu-selection-chip">
                    <Bi en={`Template hint ${selectedTemplateMinVram} GB+`} ar={`تلميح القالب ${selectedTemplateMinVram} غ.ب+`} />
                  </span>
                )}
                <span className="gpu-selection-chip">
                  {activeWorkloadLabel
                    ? (lang === 'ar' ? activeWorkloadLabel.titleAr : activeWorkloadLabel.titleEn)
                    : <Bi en="No workload filter" ar="لا توجد تصفية عمل" />}
                </span>
                <span className="gpu-selection-chip">
                  <Bi en={`${shownCount} shown`} ar={`${shownCount} معروضة`} />
                </span>
                {selectedType && (
                  <button
                    type="button"
                    className="gpu-selection-action"
                    onClick={() => setLaunch((l) => ({ ...l, gpuType: '', ...keepFundingLaunchError(l.error, l.creditError) }))}
                  >
                    <Bi en="Back to auto-pick" ar="العودة للاختيار التلقائي" />
                  </button>
                )}
                {activeFilterCount > 0 && (
                  <button type="button" className="gpu-selection-action" onClick={clearGpuFilters}>
                    <Bi en="Clear filters" ar="مسح التصفية" />
                  </button>
                )}
              </div>
            </div>

            <div className="pod-trial-policy" aria-label={lang === 'ar' ? 'سياسة تجربة الحاويات' : 'Trial routing policy'}>
              <div className="pod-trial-copy">
                <span className="pod-trial-k">
                  <Bi en="Trial routing policy" ar="سياسة تجربة الحاويات" />
                </span>
                <strong>
                  <Bi en={trialPolicyHeadline} ar={explicitTrialTagLive ? 'وسم التجربة نشط' : 'التجربة حسب مصدر الرصيد'} />
                </strong>
                <span>
                  <Bi en={trialPolicyDetail} ar="لا يوجد وسم تجربة منفصل؛ رصيد التجربة يستخدم سعة DCP والمجتمع، والسعة عالية الطلب تتطلب رصيدًا مدفوعًا." />
                </span>
              </div>
              <div className="pod-trial-facts">
                <span className={trialRoutingSynced ? 'ready' : 'checking'}>
                  <Bi en={trialPolicySourceLabel} ar={trialRoutingSynced ? 'سياسة الخادم: متزامنة' : 'سياسة الخادم: قيد الفحص'} />
                </span>
                <span>
                  <Bi en={trialAccountModeLabel} ar={explicitTrialTagLive ? 'حسابات التجربة: وسم صريح' : 'حسابات التجربة: حسب مصدر الرصيد'} />
                </span>
                <span>
                  <Bi en={trialTagAnswerLabel} ar={explicitTrialTagLive ? 'وسم حساب التجربة نشط' : 'لا يوجد وسم حساب تجربة مباشر'} />
                </span>
                <span>
                  <Bi en={trialCreditSourceLabel} ar="مصدر التجربة: رصيد المنحة" />
                </span>
                <span>
                  <Bi en={trialRouteAnswerLabel} ar="مسار التجربة: وحدات DCP والمجتمع" />
                </span>
                <span>
                  <Bi en={highDemandAnswerLabel} ar="وحدات الطلب العالي: رصيد مدفوع فقط" />
                </span>
                <span>
                  <Bi en={trialHandlingAnswerLabel} ar={explicitTrialTagLive ? 'وسم التجربة ظاهر على الحساب' : 'لا يوجد وسم منفصل؛ مصدر الرصيد يحدد المسار'} />
                </span>
                <span>
                  <Bi en="Provider identity hidden" ar="هوية المزود مخفية" />
                </span>
              </div>
            </div>

            <div className="pod-balance-policy" aria-label={lang === 'ar' ? 'سياسة الحد الأدنى للرصيد' : 'Minimum balance policy'}>
              <div className="pod-balance-copy">
                <span className="pod-balance-k">
                  <Bi en="Minimum balance policy" ar="سياسة الحد الأدنى للرصيد" />
                </span>
                <strong>
                  <Bi en="Credit gates are visible before launch" ar="بوابات الرصيد ظاهرة قبل التشغيل" />
                </strong>
                <span>
                  <Bi
                    en="Provider/community pods use quote preflight; high-demand pods require paid available credit."
                    ar="حاويات DCP والمجتمع تستخدم فحص التسعير؛ الطلب العالي يحتاج رصيداً مدفوعاً متاحاً."
                  />
                </span>
              </div>
              <div className="pod-balance-facts">
                <span className={minimumBalanceSynced ? 'ready' : 'checking'}>
                  <Bi en={minimumBalanceSourceLabel} ar={minimumBalanceSynced ? 'الحد الأدنى: متزامن' : 'الحد الأدنى: قيد الفحص'} />
                </span>
                <span>
                  <Bi en={providerPodGateLabel} ar="حاويات DCP والمجتمع: فحص التسعير" />
                </span>
                <span>
                  <Bi en={onDemandPodGateLabel} ar="حاويات الطلب العالي: فحص الرصيد المدفوع" />
                </span>
                <span>
                  <Bi en={`Paid available SAR ${fmtSar(paidAvailableSar)}`} ar={`الرصيد المدفوع المتاح ${fmtSar(paidAvailableSar)} ﷼`} />
                </span>
                <span className="blocked">
                  <Bi en="Trial credit does not unlock high-demand GPUs" ar="رصيد التجربة لا يفتح وحدات الطلب العالي" />
                </span>
                <span className={minimumBalance?.claim_guards?.changes_enforcement ? 'checking' : 'ready'}>
                  <Bi
                    en={minimumBalance?.claim_guards?.changes_enforcement ? 'Enforcement change: pending' : 'Read-only: no enforcement change'}
                    ar={minimumBalance?.claim_guards?.changes_enforcement ? 'تغيير التنفيذ: معلق' : 'قراءة فقط: لا تغيير في التنفيذ'}
                  />
                </span>
                <span>
                  <Bi en={`${futureBillingRailsBlocked} future billing rails blocked`} ar={`${futureBillingRailsBlocked} مسارات فوترة مستقبلية مقيدة`} />
                </span>
                {minimumBalanceStatus === 'error' && minimumBalanceError && (
                  <span className="checking">
                    <Bi en="Launch still uses backend credit gates" ar="التشغيل لا يزال يستخدم بوابات الرصيد الخلفية" />
                  </span>
                )}
              </div>
            </div>

            {trialRoutingSynced && (
              <div className="pod-proof-strip" aria-label={lang === 'ar' ? 'بوابات إثبات الحاويات' : 'Pod proof gates'}>
                <div className="pod-proof-copy">
                  <span className="pod-proof-k">
                    <Bi en="Pod proof gates" ar="بوابات إثبات الحاوية" />
                  </span>
                  <strong>
                    <Bi en="Workspace and LoRA image evidence" ar="أدلة مساحة العمل وصورة LoRA" />
                  </strong>
                  <span>
                    <Bi
                      en="CI contracts are visible; live GPU-host acceptance still needs a funded provider window."
                      ar="عقود CI ظاهرة؛ قبول GPU الحي يحتاج نافذة مزود ممولة."
                    />
                  </span>
                </div>
                <div className="pod-proof-facts">
                  <span className="ready">
                    <Bi
                      en={`Workspace contract: ${workspacePodContractStatus === 'ci_safe' ? 'CI safe' : 'checking'}`}
                      ar={`عقد مساحة العمل: ${workspacePodContractStatus === 'ci_safe' ? 'آمن CI' : 'قيد الفحص'}`}
                    />
                  </span>
                  <span className="blocked">
                    <Bi
                      en={`Workspace live: ${workspaceLiveStatus === 'blocked_external' ? 'provider window' : 'checking'}`}
                      ar={`مساحة العمل الحية: ${workspaceLiveStatus === 'blocked_external' ? 'نافذة مزود' : 'قيد الفحص'}`}
                    />
                  </span>
                  <span className="blocked">
                    <Bi
                      en={`LoRA image: ${loraPodImageStatus === 'blocked_external' ? 'GPU-host proof' : 'checking'}`}
                      ar={`صورة LoRA: ${loraPodImageStatus === 'blocked_external' ? 'إثبات GPU' : 'قيد الفحص'}`}
                    />
                  </span>
                </div>
              </div>
            )}

            <section className="pod-template-picker" aria-labelledby="pod-template-heading">
              <div className="pod-template-hd">
                <div>
                  <span className="pod-label"><Bi en="Launch template" ar="قالب التشغيل" /></span>
                  <h4 id="pod-template-heading">
                    <Bi en="Choose the pod shape" ar="اختر شكل الحاوية" />
                  </h4>
                </div>
                <span className="hint">
                  <Bi en="Backed by /api/templates/catalog where available" ar="مدعومة عبر /api/templates/catalog عند التوفر" />
                </span>
              </div>
              <div className={`pod-template-contract ${templateCatalogStatus}`}>
                <span className="pod-template-contract-k">
                  <Bi en="Backend catalog" ar="كتالوج الخلفية" />
                </span>
                <strong>
                  {templateCatalogStatus === 'ready'
                    ? `${templateCatalog.length} templates${templateCatalogVersion ? ` · ${templateCatalogVersion}` : ''}`
                    : templateCatalogStatus === 'loading'
                      ? (lang === 'ar' ? 'جارٍ الفحص' : 'Checking')
                      : templateCatalogStatus === 'error'
                        ? (templateCatalogError || (lang === 'ar' ? 'غير متاح' : 'Unavailable'))
                        : (lang === 'ar' ? 'بانتظار الفحص' : 'Pending')}
                </strong>
              </div>
              <div className="pod-template-grid">
                {LAUNCH_TEMPLATES.map((template) => {
                  const catalogIds = catalogIdsFor(template)
                  const catalogItems = catalogItemsFor(template, templateCatalogById)
                  const catalogMissing =
                    templateCatalogStatus === 'ready' &&
                    catalogIds.length > 0 &&
                    catalogItems.length !== catalogIds.length
                  const disabled = template.disabled || catalogMissing
                  const selected = !disabled && selectedTemplateKey === template.key
                  const minVram = catalogMinVram(template, catalogItems)
                  const duration = catalogDuration(template, catalogItems)
                  const catalogBadge =
                    catalogItems.length === catalogIds.length && catalogIds.length > 0
                      ? (lang === 'ar' ? 'موثق' : 'Catalog verified')
                      : templateCatalogStatus === 'loading'
                        ? (lang === 'ar' ? 'فحص الكتالوج' : 'Checking catalog')
                        : templateCatalogStatus === 'error'
                          ? (lang === 'ar' ? 'كتالوج غير متاح' : 'Catalog offline')
                          : catalogMissing
                            ? (lang === 'ar' ? 'مفقود من الكتالوج' : 'Missing catalog')
                            : ''
                  return (
                    <button
                      key={template.key}
                      type="button"
                      className={`pod-template-card${selected ? ' on' : ''}${disabled ? ' disabled' : ''}`}
                      aria-pressed={selected}
                      aria-disabled={disabled || undefined}
                      disabled={disabled || !isLive}
                      onClick={() => applyLaunchTemplate(template)}
                    >
                      {(catalogBadge || template.badgeEn || disabled) && (
                        <span className="pod-template-badge">
                          {catalogBadge || (lang === 'ar'
                            ? (template.badgeAr || 'قريباً')
                            : (template.badgeEn || 'Coming next'))}
                        </span>
                      )}
                      <span className="pod-template-title">{lang === 'ar' ? template.titleAr : template.titleEn}</span>
                      <span className="pod-template-desc">{lang === 'ar' ? template.descAr : template.descEn}</span>
                      <span className="pod-template-meta">
                        {template.image}
                        {duration ? ` · ${formatDuration(duration)}` : ''}
                        {minVram ? ` · ≥ ${minVram} GB` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* ── GPU picker: optional workload helper + toolbar + card grid ── */}
            <div className="gpu-picker">
              <div className={`gpu-picker-status ${selectedType ? 'fixed' : 'auto'}`} aria-label={lang === 'ar' ? 'حالة GPU المختار للتشغيل' : 'GPU picker selected launch state'}>
                <div className="gpu-picker-status-copy">
                  <span><Bi en="Actual launch request" ar="طلب التشغيل الفعلي" /></span>
                  <strong><Bi en={gpuPickerLaunchHeadline} ar={selectedType ? 'تم اختيار GPU للتشغيل' : 'المختار للتشغيل: اختيار تلقائي'} /></strong>
                  <em><Bi en={gpuPickerLaunchDetail} ar={selectedType ? 'تغيير التصفية لا يستبدل GPU المثبت.' : 'لا توجد بطاقة مثبتة؛ التصفية تنظم القائمة فقط.'} /></em>
                </div>
                <div className="gpu-picker-status-facts">
                  <code>{gpuPickerRequestCode}</code>
                  <span><Bi en="VRAM chips are filters only" ar="شرائح الذاكرة للتصفية فقط" /></span>
                  <a href="#gpu-results"><Bi en="Choose a GPU card" ar="اختر بطاقة GPU" /></a>
                </div>
              </div>
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
                              en={`Workload preset applied: ${w.titleEn}. Showing GPU types with at least ${w.floor} GB of VRAM. ${
                                workloadSuggestionLabel ? `${workloadSuggestionLabel} is highlighted as a workload match. ` : ''
                              }Launch remains ${workloadLaunchStateLabel} until you choose Use as launch GPU on a card.`}
                              ar={`تم تطبيق قالب العمل: ${w.titleAr}. تُعرض المعالجات بذاكرة ${w.floor} غيغابايت على الأقل. يبقى طلب التشغيل كما هو حتى تختار بطاقة GPU.`}
                            />
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </section>

              <div className="gpu-filter-callout" aria-label={lang === 'ar' ? 'مصدر اختيار GPU' : 'GPU selection source of truth'}>
                <span className="gpu-filter-callout-k">
                  <Bi en="Before filtering" ar="قبل التصفية" />
                </span>
                <strong>
                  <Bi en="The launch GPU is only Auto-pick or a card marked Selected launch GPU." ar="GPU التشغيل هو الاختيار التلقائي أو بطاقة محددة فقط." />
                </strong>
                <em>
                  <Bi en="VRAM chips, workload guide, search, and sort change the list you see. They do not change the final request until you pick a GPU card." ar="شرائح الذاكرة ودليل العمل والبحث والترتيب تغيّر القائمة فقط ولا تغيّر طلب التشغيل حتى تختار بطاقة." />
                </em>
              </div>

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
                    <label id="gpu-vram-filter-label">
                      <Bi en="Browse filter only: VRAM" ar="تصفية التصفح فقط: الذاكرة" />
                    </label>
                    <div className="gpu-vram-options" role="group" aria-labelledby="gpu-vram-filter-label">
                      {VRAM_FILTER_OPTIONS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="gpu-vram-chip"
                          aria-pressed={minVram === value}
                          onClick={() => setMinVram(value)}
                          disabled={!isLive}
                        >
                          {value === 0
                            ? <Bi en="Any" ar="أي" />
                            : <Bi en={`${value} GB+`} ar={`${value} غ.ب+`} />}
                        </button>
                      ))}
                    </div>
                    <p className="gpu-filter-disclaimer">
                      <Bi
                        en={vramFilterDisclaimer}
                        ar={selectedType ? 'هذه تصفية تصفح فقط. يبقى GPU التشغيل المثبت كما هو حتى تختار بطاقة أخرى أو تعود للاختيار التلقائي.' : 'هذه تصفية تصفح فقط. يبقى GPU التشغيل على الاختيار التلقائي حتى تختار بطاقة.'}
                      />
                    </p>
                    <p className={`gpu-filter-state ${selectedType ? 'fixed' : 'auto'}`}>
                      <span><Bi en="Current launch state" ar="حالة التشغيل الحالية" /></span>
                      <strong><Bi en={vramFilterLaunchState} ar={selectedType ? 'طلب التشغيل: GPU محدد' : 'طلب التشغيل: اختيار تلقائي'} /></strong>
                    </p>
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
              <div id="gpu-results" className="gpu-results" role="radiogroup" aria-label={lang === 'ar' ? 'نوع المعالج' : 'GPU type'}>
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
                              const workloadMatch = !!activeWorkloadPreset &&
                                selectable &&
                                g.gpu_model.toLowerCase().includes(activeWorkloadPreset.prefer)
                              const reco = (isValuePick(g.gpu_model) && selectable) || workloadMatch
                              const brand = gpuBrand(g.gpu_model)
                              const name = displayGpuType(g.gpu_model)
                              const cls = [
                                'gpu-card',
                                out ? 'is-out' : '',
                                reco ? 'is-reco' : '',
                                workloadMatch ? 'is-workload-match' : '',
                              ].filter(Boolean).join(' ')
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
                                      {workloadMatch
                                        ? <Bi en="Workload match" ar="مطابق للعمل" />
                                        : <Bi en="Best value" ar="أفضل قيمة" />}
                                    </span>
                                  )}
                                  {selected && (
                                    <span className="gpu-selected-ribbon">
                                      <Bi en="Selected launch GPU" ar="GPU التشغيل المحدد" />
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
                                          <Bi en="Launch GPU selected ✓" ar="تم تحديد GPU للتشغيل ✓" />
                                        ) : (
                                          <Bi en="Use as launch GPU →" ar="استخدمه كـ GPU للتشغيل →" />
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

            <div className="pod-stage-hd pod-stage-hd--compact pod-stage-hd--runtime" id="pod-stage-3">
              <span className="pod-stage-no">Stage 3 of 3</span>
              <div>
                <h2><Bi en="Stage 3: confirm runtime and launch" ar="المرحلة 3: أكد البيئة وشغّل" /></h2>
                <p>
                  <Bi
                    en="Set duration, image, and notebook access before the prepaid launch."
                    ar="حدد المدة والصورة ووصول الدفتر قبل التشغيل مسبق الدفع."
                  />
                </p>
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
                  onChange={(e) => {
                    setSelectedTemplateKey(null)
                    setLaunch((l) => ({ ...l, durationMinutes: Number(e.target.value) }))
                  }}
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

            {isFundingLaunchError(launch.error, launch.creditError) ? (
              <div className="dash-state error pod-credit-state" style={{ marginTop: '20px' }}>
                <b>
                  <Bi en="Credit required" ar="الرصيد مطلوب" />
                </b>
                <span>
                  {launch.creditError?.code === 'on_demand_requires_prepaid_credit'
                    ? <Bi en="Trial credit covers DCP and community GPUs. Add paid credit to launch this GPU." ar="رصيد التجربة يغطي وحدات DCP والمجتمع. أضف رصيدًا مدفوعًا لتشغيل هذه البطاقة." />
                    : <Bi en="Add credit before launching this pod." ar="أضف رصيدًا قبل تشغيل هذه الحاوية." />}
                  {' '}
                  <Link href="/renter/wallet">
                    <Bi en="Add credit" ar="إضافة رصيد" />
                  </Link>
                </span>
                {launch.creditError && (
                  <div className="pod-credit-facts" aria-label="Credit requirement details">
                    {launch.creditError.availableSar != null && (
                      <span>
                        <Bi en={`Available credit ${fmtSar(launch.creditError.availableSar)}`} ar={`الرصيد المتاح ${fmtSar(launch.creditError.availableSar)}`} />
                      </span>
                    )}
                    {launch.creditError.requiredSar != null && (
                      <span>
                        <Bi en={`Required credit ${fmtSar(launch.creditError.requiredSar)}`} ar={`الرصيد المطلوب ${fmtSar(launch.creditError.requiredSar)}`} />
                      </span>
                    )}
                    {launch.creditError.creditShortfallSar != null && launch.creditError.creditShortfallSar > 0 && (
                      <span className="strong">
                        <Bi en={`Add ${fmtSar(launch.creditError.creditShortfallSar)} more`} ar={`أضف ${fmtSar(launch.creditError.creditShortfallSar)} إضافية`} />
                      </span>
                    )}
                    {launch.creditError.minimumPaidCreditSar != null && launch.creditError.minimumPaidCreditSar !== launch.creditError.requiredSar && (
                      <span>
                        <Bi en={`Minimum paid credit ${fmtSar(launch.creditError.minimumPaidCreditSar)}`} ar={`الحد الأدنى للرصيد المدفوع ${fmtSar(launch.creditError.minimumPaidCreditSar)}`} />
                      </span>
                    )}
                    {launch.creditError.durationMinutes != null && (
                      <span>
                        <Bi en={`${launch.creditError.durationMinutes} min launch`} ar={`تشغيل ${launch.creditError.durationMinutes} دقيقة`} />
                      </span>
                    )}
                    {launch.creditError.rateSarPerHour != null && (
                      <span>
                        <Bi en={`Rate ${fmtSar(launch.creditError.rateSarPerHour)}/hr`} ar={`السعر ${fmtSar(launch.creditError.rateSarPerHour)}/ساعة`} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : launch.error ? (
              <div className="dash-state error" style={{ marginTop: '20px' }}>
                <span>{launch.error}</span>
              </div>
            ) : null}

            <div className="pod-launch-review" aria-label={lang === 'ar' ? 'مراجعة التشغيل' : 'Launch review'}>
              <span>
                <b><Bi en="Stage 1" ar="المرحلة 1" /></b>
                {workspaceVolume
                  ? `${workspaceVolume.size_gb} GB /workspace`
                  : <Bi en="No workspace volume" ar="لا توجد وحدة مساحة عمل" />}
              </span>
              <span>
                <b><Bi en="Stage 2" ar="المرحلة 2" /></b>
                {selectedType
                  ? displayGpuType(selectedType.gpu_model)
                  : <Bi en="Auto-pick GPU" ar="اختيار GPU تلقائي" />}
              </span>
              <span>
                <b><Bi en="Stage 3" ar="المرحلة 3" /></b>
                {selectedRuntimeLabel} · {durationLabel}
              </span>
              <span>
                <b><Bi en="Credit route" ar="مسار الرصيد" /></b>
                <Bi en={explicitTrialTagLive ? 'Trial tag active' : 'Trial via grant credit · native/community GPUs'} ar={explicitTrialTagLive ? 'وسم التجربة نشط' : 'التجربة حسب رصيد المنحة · معالجات DCP والمجتمع'} />
              </span>
            </div>

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
                  <Bi en={launchButtonLabel} ar={selectedType ? 'تشغيل حاوية GPU المحددة' : 'تشغيل حاوية GPU بالاختيار التلقائي'} />
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
