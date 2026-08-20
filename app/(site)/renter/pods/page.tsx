'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { displayGpuType } from '@/app/lib/useGpuTypes'
import WorkspacePanel from '../workspace/WorkspacePanel'
import { humanBytes, type WorkspaceFile, type WorkspaceVolume } from '../workspace/workspaceApi'
import './pods.css'

// ── Pod domain constants (ported verbatim from the v1 pods page) ──────
const POD_REFRESH_MS = 8000
const MIN_TOKEN_LENGTH = 16
const DEFAULT_DURATION_MINUTES = 60
const POD_WORKSPACE_STAGE_PREF_KEY = 'dcp_pods_workspace_stage_open'
const LARGE_WORKSPACE_COLLAPSE_FILE_COUNT = 12

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

// Serve-mode models — mirrors the backend + daemon whitelist (run_vllm_serve_job).
// Ordered small → large so the default is a safe single-GPU pick; multi-GPU pods
// serve the bigger ones tensor-parallel (TP = GPU count).
// `gated` = needs Hugging Face license acceptance / token to download. One-click
// serve can fail ugly on a provider without an HF token, so the default is an
// OPEN model and gated ones are labelled (Tito's Node-3 QA flag).
const SERVE_MODELS: { value: string; label: string; gated?: boolean }[] = [
  { value: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', label: 'TinyLlama 1.1B · fast/tiny' },
  { value: 'microsoft/Phi-3-mini-4k-instruct', label: 'Phi-3 mini 4k · open' },
  { value: 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B', label: 'DeepSeek-R1 Distill 8B · open' },
  { value: 'google/gemma-2b-it', label: 'Gemma 2B Instruct', gated: true },
  { value: 'mistralai/Mistral-7B-Instruct-v0.2', label: 'Mistral 7B Instruct', gated: true },
  { value: 'meta-llama/Meta-Llama-3-8B-Instruct', label: 'Llama 3 8B Instruct', gated: true },
]
// Phi-3 mini: open (MIT), fits 1×3090, quick cold-start — the safest first success.
const DEFAULT_SERVE_MODEL = 'microsoft/Phi-3-mini-4k-instruct'
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
  // Serve pods expose these instead of Jupyter/SSH: a public OpenAI /v1 URL,
  // the served model, and the tensor-parallel size. mode distinguishes them.
  job_type?: string | null
  mode?: 'notebook' | 'serve' | null
  endpoint_url?: string | null
  serve_model?: string | null
  tensor_parallel_size?: number | null
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
  // Multi-GPU SKU: number of GPUs this pod uses (1..4 → 24/48/72/96 GB on a 3090).
  gpuCount: number
  notebookToken: string
  // Selected preset value, or CUSTOM_IMAGE_OPTION to use customImage instead.
  imageChoice: string
  // Free-form Docker image ref, only used when imageChoice === CUSTOM_IMAGE_OPTION.
  customImage: string
  // Launch mode: 'notebook' (Jupyter+SSH interactive_pod) or 'serve' (managed
  // vLLM /v1 endpoint, TP = gpuCount). Multi-GPU defaults to serve.
  mode: 'notebook' | 'serve'
  // Serve-mode: the vLLM model id + max context length. Ignored in notebook mode.
  serveModel: string
  serveMaxLen: number
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
    current_mode?: string
    trial_credit_source?: string
    paid_credit_source?: string
    derived_states?: Record<string, string>
    analytics_lifecycle_tag_live?: boolean
    mutates_account_classification?: boolean
    note?: string
  }
  routing_policy?: {
    trial_capacity_copy?: string
    high_demand_capacity_copy?: string
    trial_credit_allowed_supply_tiers?: string[]
    paid_credit_required_supply_tiers?: string[]
    trial_credit_capacity_class?: string
    high_demand_capacity_class?: string
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
    changes_account_classification?: boolean
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
    trial_grant_halala?: number
    trial_grant_sar?: number
    paid_funding_halala?: number
    paid_funding_sar?: number
    on_demand_committed_halala?: number
    on_demand_committed_sar?: number
    paid_available_halala?: number
    paid_available_sar?: number
  }
  credit_policy?: {
    current_mode?: string
    source_contract?: string
    explicit_trial_account_tag_live?: boolean
    derived_trial_account_state?: string
    trial_credit_source?: string
    trial_grant_halala?: number
    trial_grant_sar?: number
    has_trial_grant?: boolean
    paid_credit_source?: string
    paid_available_halala?: number
    paid_available_sar?: number
    trial_credit_allowed_capacity?: string
    trial_credit_unlocks_high_demand?: boolean
    high_demand_requires_paid_credit?: boolean
  }
  trial_classification?: {
    current_mode?: string
    explicit_trial_account_tag_live?: boolean
    analytics_lifecycle_tag_live?: boolean
    derived_account_state?: string
    has_trial_grant?: boolean
    trial_grant_halala?: number
    trial_grant_sar?: number
    paid_available_halala?: number
    paid_available_sar?: number
    trial_credit_capacity_class?: string
    high_demand_capacity_class?: string
    mutates_account_classification?: boolean
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
    changes_trial_accounting?: boolean
    changes_account_classification?: boolean
    changes_paid_credit_policy?: boolean
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

interface WorkspaceFolderPeek {
  id: string
  label: string
  fileCount: number
  totalBytes: number
}

function summarizeWorkspaceFolders(files: WorkspaceFile[], limit = 3, query = ''): WorkspaceFolderPeek[] {
  const groups = new Map<string, WorkspaceFolderPeek>()
  const normalizedQuery = query.trim().toLowerCase()

  for (const file of files) {
    const key = String(file.key || '').replace(/^\/+/, '')
    const parts = key.split('/').filter(Boolean)
    const hasFolder = parts.length > 1
    const id = hasFolder ? parts[0] : '__root__'
    const label = hasFolder ? `${parts[0]}/` : 'Root files'
    if (normalizedQuery) {
      const haystack = `${label} ${key}`.toLowerCase()
      if (!haystack.includes(normalizedQuery)) continue
    }
    const current = groups.get(id) || { id, label, fileCount: 0, totalBytes: 0 }
    current.fileCount += 1
    current.totalBytes += Number(file.size || 0)
    groups.set(id, current)
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount
      if (b.totalBytes !== a.totalBytes) return b.totalBytes - a.totalBytes
      return a.label.localeCompare(b.label)
    })
    .slice(0, limit)
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

function cheapestGpuType(arr: GpuType[]): GpuType | null {
  return [...arr]
    .sort((a, b) => {
      const priceDiff = priceValue(a) - priceValue(b)
      if (priceDiff !== 0) return priceDiff
      if (a.vram_gb !== b.vram_gb) return a.vram_gb - b.vram_gb
      return displayGpuType(a.gpu_model).localeCompare(displayGpuType(b.gpu_model))
    })[0] || null
}

function recommendedGpuTypeForContext(
  availableTypes: GpuType[],
  opts: { workload?: Workload | null; templateMinVram?: number; browseMinVram?: number },
): GpuType | null {
  const available = availableTypes.filter((g) => g.available && g.sar_per_hour != null)
  if (available.length === 0) return null

  const floor = Math.max(
    0,
    opts.workload?.floor || 0,
    opts.templateMinVram || 0,
    opts.browseMinVram || 0,
  )
  const floorMatches = floor > 0 ? available.filter((g) => g.vram_gb >= floor) : available
  const pool = floorMatches.length > 0 ? floorMatches : available
  const prefer = opts.workload?.prefer?.trim().toLowerCase() || ''
  if (prefer) {
    const preferred = pool.filter((g) => g.gpu_model.toLowerCase().includes(prefer))
    const cheapestPreferred = cheapestGpuType(preferred)
    if (cheapestPreferred) return cheapestPreferred
  }

  return cheapestGpuType(pool)
}

export default function RenterPodsPage() {
  const { lang, toggle } = useV2()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pods, setPods] = useState<Pod[]>([])
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [renterKey, setRenterKey] = useState<string | null>(null)
  const [workspaceVolume, setWorkspaceVolume] = useState<WorkspaceVolume | null>(null)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [workspaceStageOpen, setWorkspaceStageOpen] = useState(false)
  const [workspacePeekQuery, setWorkspacePeekQuery] = useState('')
  const [workspaceFolderFocusRequest, setWorkspaceFolderFocusRequest] = useState<{ folderId: string; nonce: number } | null>(null)
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
  // One-time launch credentials (root_password + jupyter_token) kept per pod for
  // the SESSION so the pod card's "Copy all" can include them once the pod is
  // live — the backend never returns them again after the 201, and the SSH root
  // password isn't in the access_url, so without this the card copy-all is
  // missing the password the renter needs to SSH in.
  const [podCreds, setPodCreds] = useState<Record<string, { rootPassword: string; jupyterToken: string }>>({})
  // Pods-first redesign: the launch flow lives in a modal (opened from the header).
  const [launchModalOpen, setLaunchModalOpen] = useState(false)
  const [launch, setLaunch] = useState<LaunchState>({
    gpuType: '',
    durationMinutes: DEFAULT_DURATION_MINUTES,
    gpuCount: 1,
    notebookToken: generateNotebookToken(),
    imageChoice: DEFAULT_IMAGE,
    customImage: '',
    mode: 'notebook',
    serveModel: DEFAULT_SERVE_MODEL,
    serveMaxLen: 4096,
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
  const workspaceStagePreferenceLoadedRef = useRef(false)
  const skipInitialWorkspaceStagePreferenceWriteRef = useRef(true)
  const largeWorkspaceAutoCollapsedRef = useRef(false)

  // ── Data loaders ─────────────────────────────────────────────────────
  const [nowTick, setNowTick] = useState(() => 0)
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(POD_WORKSPACE_STAGE_PREF_KEY)
      if (saved === 'open' || saved === 'closed') {
        setWorkspaceStageOpen(saved === 'open')
      }
    } catch {
      /* localStorage is optional for the UX preference */
    } finally {
      workspaceStagePreferenceLoadedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceStagePreferenceLoadedRef.current) return
    if (skipInitialWorkspaceStagePreferenceWriteRef.current) {
      skipInitialWorkspaceStagePreferenceWriteRef.current = false
      return
    }
    try {
      window.localStorage.setItem(POD_WORKSPACE_STAGE_PREF_KEY, workspaceStageOpen ? 'open' : 'closed')
    } catch {
      /* non-fatal preference write */
    }
  }, [workspaceStageOpen])

  useEffect(() => {
    if (
      largeWorkspaceAutoCollapsedRef.current ||
      !workspaceStagePreferenceLoadedRef.current ||
      !workspaceStageOpen ||
      workspaceFiles.length < LARGE_WORKSPACE_COLLAPSE_FILE_COUNT
    ) {
      return
    }
    largeWorkspaceAutoCollapsedRef.current = true
    setWorkspaceStageOpen(false)
  }, [workspaceFiles.length, workspaceStageOpen])

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

    const isServe = launch.mode === 'serve'
    const token = launch.notebookToken.trim()
    // Notebook mode needs a strong Jupyter token; serve mode has no notebook.
    if (!isServe && token.length < MIN_TOKEN_LENGTH) {
      setLaunch((l) => ({ ...l, error: `Notebook token must be at least ${MIN_TOKEN_LENGTH} characters.`, creditError: null }))
      return
    }

    const image = resolveImage(launch)
    if (!isServe && launch.imageChoice === CUSTOM_IMAGE_OPTION && !image) {
      setLaunch((l) => ({ ...l, error: 'Enter a Docker image reference for a custom pod.', creditError: null }))
      return
    }

    // Serve mode POSTs mode:'serve' + model (backend runs vLLM with TP=gpu_count
    // on the dedicated vLLM image — no notebook token / image override).
    const launchBody = isServe
      ? {
          mode: 'serve',
          gpu_type: launch.gpuType || undefined,
          duration_minutes: launch.durationMinutes,
          gpu_count: launch.gpuCount,
          model: launch.serveModel,
          max_model_len: launch.serveMaxLen,
        }
      : {
          // Launch by GPU TYPE, never provider_id. '' → omit so the backend
          // auto-picks any available type. The backend resolves gpu_type → an
          // in-stock provider internally; the renter never sees a provider id.
          gpu_type: launch.gpuType || undefined,
          duration_minutes: launch.durationMinutes,
          gpu_count: launch.gpuCount,
          image,
          params: { NOTEBOOK_TOKEN: token },
        }

    setLaunch((l) => ({ ...l, submitting: true, error: '', creditError: null }))
    try {
      const res = await fetch(`${getApiBase()}/pods?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify(launchBody),
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
        // Also keep them keyed by pod id so the pod card's one-click "Copy all"
        // can include the SSH root password once the pod is live this session.
        if (newId != null) {
          setPodCreds((m) => ({
            ...m,
            [String(newId)]: {
              rootPassword: data.root_password || '',
              jupyterToken: data.jupyter_token || '',
            },
          }))
        }
      }

      // Reset the form (fresh token) and refresh the list immediately. The GPU
      // selection is preserved so a renter can relaunch the same type quickly.
      setLaunch({
        gpuType: launch.gpuType,
        durationMinutes: launch.durationMinutes,
        gpuCount: launch.gpuCount,
        notebookToken: generateNotebookToken(),
        imageChoice: launch.imageChoice,
        customImage: launch.customImage,
        mode: launch.mode,
        serveModel: launch.serveModel,
        serveMaxLen: launch.serveMaxLen,
        submitting: false,
        error: '',
        creditError: null,
      })
      setLaunchModalOpen(false) // close the launch modal; the new pod + its
      // one-time credentials now show on the main pods page.
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
    ? selectedType.sar_per_hour * launch.gpuCount * (launch.durationMinutes / 60)
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
  const minimumCreditPolicy = minimumBalance?.credit_policy
  const trialClassification = minimumBalance?.trial_classification
  const highDemandCapacityCopy = trialRouting?.routing_policy?.high_demand_capacity_copy || 'High-demand capacity: paid credit'
  const explicitTrialTagLive = typeof minimumCreditPolicy?.explicit_trial_account_tag_live === 'boolean'
    ? minimumCreditPolicy.explicit_trial_account_tag_live
    : trialRouting?.account_classification?.explicit_trial_account_tag_live === true
  const trialAccountModeLabel = explicitTrialTagLive ? 'Trial accounts: explicit tag' : 'Trial accounts: grant-credit provenance'
  const trialTagAnswerLabel = explicitTrialTagLive ? 'Trial-account tag live' : 'No trial-account tag live'
  const trialCreditSource = minimumCreditPolicy?.trial_credit_source || trialRouting?.account_classification?.trial_credit_source
  const trialCreditSourceLabel = trialCreditSource === 'renters.trial_grant_halala'
    ? 'Trial source: grant balance'
    : 'Trial source: credit provenance'
  const trialGrantSar = typeof minimumCreditPolicy?.trial_grant_sar === 'number'
    ? minimumCreditPolicy.trial_grant_sar
    : typeof minimumBalance?.account?.trial_grant_sar === 'number'
      ? minimumBalance.account.trial_grant_sar
      : sarFromHalala(minimumCreditPolicy?.trial_grant_halala ?? minimumBalance?.account?.trial_grant_halala)
  const trialGrantAnswerLabel = trialGrantSar > 0
    ? `Trial grant SAR ${fmtSar(trialGrantSar)}`
    : 'No trial grant on account'
  const derivedTrialState = trialClassification?.derived_account_state
    || minimumCreditPolicy?.derived_trial_account_state
    || (trialGrantSar > 0 ? 'trial_grant_active' : 'no_trial_grant')
  const derivedTrialStateLabel = derivedTrialState === 'trial_grant_active'
    ? 'Derived trial state: grant active'
    : 'Derived trial state: no grant'
  const creditPolicyContractLabel = minimumCreditPolicy
    ? 'Minimum-balance credit policy: synced'
    : minimumBalanceStatus === 'loading'
      ? 'Minimum-balance credit policy: checking'
      : 'Minimum-balance credit policy: fallback copy'
  const highDemandPaidCreditGateLabel = minimumCreditPolicy?.high_demand_requires_paid_credit === true
    ? 'High-demand paid-credit gate live'
    : 'High-demand paid-credit gate enforced by backend'
  const trialCapacityAnswerLabel = 'Trial credit: DCP/community GPU pool'
  const trialRouteAnswerLabel = 'Trial route: DCP/community GPU pool'
  const highDemandAnswerLabel = 'High-demand GPUs: paid credit only'
  const trialFounderAnswerLabel = explicitTrialTagLive
    ? 'Tagged trial account; backend policy still gates high-demand GPUs'
    : 'No separate trial-account tag; grant credit is the trial signal'
  const trialPolicyHeadline = explicitTrialTagLive
    ? 'Trial account tag is active'
    : 'Trial accounts use grant-credit provenance'
  const trialPolicyDetail = explicitTrialTagLive
    ? `${trialCapacityAnswerLabel} · ${highDemandAnswerLabel}`
    : `No separate trial tag is live. ${trialCapacityAnswerLabel}. ${highDemandAnswerLabel}.`
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
  const workspacePeekSearch = workspacePeekQuery.trim()
  const workspaceFolderPeekMatches = summarizeWorkspaceFolders(
    workspaceFiles,
    Number.MAX_SAFE_INTEGER,
    workspacePeekSearch,
  )
  const workspaceFolderPeek = workspaceFolderPeekMatches.slice(0, workspacePeekSearch ? 6 : 3)
  const hiddenWorkspaceFolderCount = Math.max(
    0,
    (workspacePeekSearch ? workspaceFolderPeekMatches.length : workspaceFolderCount) - workspaceFolderPeek.length,
  )
  const workspacePeekMatchNoun = workspaceFolderPeekMatches.length === 1 ? 'matching folder' : 'matching folders'
  const workspacePeekResultLabel = workspacePeekSearch
    ? `${workspaceFolderPeekMatches.length} ${workspacePeekMatchNoun}`
    : `${workspaceFolderCount} folders`
  const workspaceChecklistLabel = workspaceVolume
    ? workspaceFiles.length > 0
      ? `${workspaceFiles.length} files · ${workspaceFolderCount} folders`
      : `${workspaceVolume.size_gb} GB /workspace · empty`
    : 'Create /workspace volume'
  const workspaceChecklistDetail = workspaceVolume
    ? 'Stage 1 can stay collapsed; open only the folder you need.'
    : 'Create a persistent workspace before launching.'
  const workspaceStageModeLabel = workspaceVolume
    ? workspaceFiles.length >= LARGE_WORKSPACE_COLLAPSE_FILE_COUNT
      ? 'Large workspace auto-collapsed'
      : workspaceFiles.length > 4
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
  const finalGpuRequestHeadline = selectedType
    ? displayGpuType(selectedType.gpu_model)
    : 'Auto-pick GPU'
  const finalGpuRequestDetail = selectedType
    ? `Pinned card · ${selectedType.vram_gb} GB VRAM${selectedType.sar_per_hour != null ? ` · SAR ${fmtSar(selectedType.sar_per_hour)}/hr` : ''}`
    : 'No fixed GPU card pinned. VRAM chips and workload presets are only browse filters.'
  const recommendedGpuType = recommendedGpuTypeForContext(availableGpuTypes, {
    workload: activeWorkloadPreset,
    templateMinVram: selectedTemplateMinVram,
    browseMinVram: minVram,
  })
  const recommendedGpuLabel = recommendedGpuType ? displayGpuType(recommendedGpuType.gpu_model) : ''
  const recommendationMatchesSelected = !!selectedType && !!recommendedGpuType && selectedType.gpu_model === recommendedGpuType.gpu_model
  const recommendationReasonLabel = recommendedGpuType
    ? activeWorkloadPreset
      ? `${activeWorkloadPreset.titleEn} currently points to ${recommendedGpuLabel}; it is the lowest priced available match for that workload floor.`
      : selectedTemplateMinVram
        ? `${selectedRuntimeLabel} recommends ${selectedTemplateMinVram} GB+; ${recommendedGpuLabel} is the lowest priced available match.`
        : minVram > 0
          ? `Current browse filter is ${minVram} GB+; ${recommendedGpuLabel} is the lowest priced available card in that view.`
          : `${recommendedGpuLabel} is the lowest priced available card for this pod shape.`
    : 'No available priced GPU card can be recommended yet.'
  const recommendationStateLabel = recommendationMatchesSelected
    ? 'Recommendation is pinned in the launch request.'
    : selectedType
      ? `Launch is pinned to ${displayGpuType(selectedType.gpu_model)}; the suggestion will not replace it unless you choose it.`
      : 'Launch still uses Auto-pick until you press Use recommended GPU or choose a card.'
  const launchButtonLabel = launch.mode === 'serve'
    ? (selectedType ? `Serve on ${displayGpuType(selectedType.gpu_model)}` : 'Launch serve endpoint')
    : selectedType
    ? `Launch ${displayGpuType(selectedType.gpu_model)} pod`
    : 'Launch auto-picked GPU pod'
  const mobileDockStage1Label = workspaceStageBodyOpen ? 'Stage 1 open' : 'Stage 1 collapsed'
  const workspacePathPrimaryFolder = workspaceFolderPeek[0] || workspaceFolderPeekMatches[0] || null
  const workspaceOutlinePrimaryLabel = workspacePathPrimaryFolder
    ? `${workspacePathPrimaryFolder.label} · ${workspacePathPrimaryFolder.fileCount} files · ${humanBytes(workspacePathPrimaryFolder.totalBytes)}`
    : 'No folder selected'

  function focusWorkspaceFolder(folderId: string) {
    setWorkspaceFolderFocusRequest((current) => ({
      folderId,
      nonce: (current?.nonce || 0) + 1,
    }))
    setWorkspaceStageOpen(true)
  }

  const isLive = loadState === 'ready'

  return (
    <main className="rt-main">
      <div className="pod-page-head">
        <div>
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
          </div>
        </div>
        {loadState !== 'missing-key' && (
          <button type="button" className="pod-launch-cta" onClick={() => setLaunchModalOpen(true)}>
            <Bi en="+ Launch a pod" ar="+ تشغيل حاوية" />
          </button>
        )}
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

      {/* ── Launch modal (opened from the header CTA) ─────── */}
      {launchModalOpen && (
      <div
        className="pod-modal-overlay"
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (e.target === e.currentTarget) setLaunchModalOpen(false) }}
      >
      <section className="panel pod-launch pod-launch-modal">
        <button type="button" className="pod-modal-close" aria-label="Close" onClick={() => setLaunchModalOpen(false)}>×</button>
        <div className="pod-modal-head">
          <h3><Bi en="Launch a pod" ar="تشغيل حاوية" /></h3>
          <span className="hint">{launch.mode === 'serve'
            ? <Bi en="Managed vLLM /v1 endpoint · tensor-parallel across your GPUs · billed by the second" ar="نقطة vLLM /v1 مُدارة · توازٍ موتّري عبر معالجاتك · محاسبة بالثانية" />
            : <Bi en="Jupyter + SSH · billed by the second · auto-stops when the time ends" ar="Jupyter + SSH · محاسبة بالثانية · تتوقف تلقائيًا عند انتهاء الوقت" />}</span>
        </div>

        {/* Mode: Notebook (Jupyter+SSH) vs Serve (managed vLLM /v1, TP=GPU count).
            Tareq P0: multi-GPU defaults to Serve — see the GPU-count handler. */}
        <div className="pod-mode-toggle" role="radiogroup" aria-label={lang === 'ar' ? 'الوضع' : 'Mode'}>
          <button
            type="button"
            role="radio"
            aria-checked={launch.mode === 'notebook'}
            className={launch.mode === 'notebook' ? 'selected' : ''}
            onClick={() => setLaunch((l) => ({ ...l, mode: 'notebook' }))}
            disabled={!isLive}
          >
            <strong><Bi en="Notebook" ar="دفتر" /></strong>
            <span><Bi en="Jupyter + SSH" ar="Jupyter + SSH" /></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={launch.mode === 'serve'}
            className={launch.mode === 'serve' ? 'selected' : ''}
            onClick={() => setLaunch((l) => ({ ...l, mode: 'serve' }))}
            disabled={!isLive}
          >
            <strong><Bi en="Serve a model" ar="خدمة نموذج" /></strong>
            <span><Bi en="vLLM /v1 · tensor-parallel" ar="vLLM /v1 · توازٍ موتّري" /></span>
          </button>
        </div>

        <div className="pod-form-grid">
          {/* GPU type — visual card grid (name + VRAM). Price lives in the launch summary. */}
          <div className="pod-field pod-field-wide">
            <label className="pod-label"><Bi en="GPU" ar="المعالج" /></label>
            <div className="pod-gpu-grid" role="radiogroup" aria-label={lang === 'ar' ? 'نوع المعالج' : 'GPU type'}>
              <button
                type="button"
                role="radio"
                aria-checked={launch.gpuType === ''}
                className={`pod-gpu-card${launch.gpuType === '' ? ' selected' : ''}`}
                onClick={() => selectGpuType('')}
                disabled={!isLive || noLaunchable}
              >
                <strong><Bi en="Auto" ar="تلقائي" /></strong>
                <span><Bi en="any available" ar="أي متاح" /></span>
              </button>
              {availableGpuTypes.map((g) => (
                <button
                  key={g.gpu_model}
                  type="button"
                  role="radio"
                  aria-checked={launch.gpuType === g.gpu_model}
                  className={`pod-gpu-card${launch.gpuType === g.gpu_model ? ' selected' : ''}`}
                  onClick={() => selectGpuType(g.gpu_model)}
                  disabled={!isLive}
                >
                  <strong>{displayGpuType(g.gpu_model)}</strong>
                  <span>{g.vram_gb} GB</span>
                  {g.sar_per_hour != null && (
                    <span className="pod-gpu-card-price">{fmtSar(g.sar_per_hour as number)}<Bi en=" SAR/hr" ar=" ﷼/س" /></span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {/* GPU count — multi-GPU SKU (1×/2×/3×/4× → more VRAM on one node) */}
          <div className="pod-field">
            <label className="pod-label">
              <Bi en="GPUs" ar="عدد المعالجات" />
            </label>
            <div className="pod-gpu-count" role="radiogroup" aria-label={lang === 'ar' ? 'عدد المعالجات' : 'GPU count'}>
              {[1, 2, 3, 4].map((n) => {
                const vram = selectedType?.vram_gb ? selectedType.vram_gb * n : null
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={launch.gpuCount === n}
                    className={launch.gpuCount === n ? 'selected' : ''}
                    onClick={() => setLaunch((l) => ({ ...l, gpuCount: n, mode: n >= 2 ? 'serve' : l.mode, ...keepFundingLaunchError(l.error, l.creditError) }))}
                    disabled={!isLive}
                  >
                    <strong>{n}×</strong>
                    {vram != null && <span>{vram} GB</span>}
                  </button>
                )
              })}
            </div>
            <p className="pod-help">
              {launch.mode === 'serve'
                ? <Bi
                    en="Serve splits ONE model across your GPUs — tensor-parallel size = GPU count (automatic). More GPUs → bigger models / more headroom. Billed per GPU; if a node hasn't enough free GPUs, pick fewer or another type."
                    ar="تقسّم الخدمة نموذجًا واحدًا عبر معالجاتك — حجم التوازي الموتّري = عدد المعالجات (تلقائي). معالجات أكثر ← نماذج أكبر. تُحتسب لكل معالج؛ إن لم تتوفر معالجات كافية اختر عددًا أقل."
                  />
                : <Bi
                    en="Combine 2–4 GPUs on one node for more VRAM. To serve one model tensor-parallel across them, switch to Serve mode above. Billed per GPU; if a node hasn't enough free GPUs, pick fewer or another type."
                    ar="ادمج 2–4 معالجات لمزيد من الذاكرة. لخدمة نموذج واحد بالتوازي الموتّري عبرها، بدّل إلى وضع الخدمة بالأعلى. تُحتسب لكل معالج؛ إن لم تتوفر معالجات كافية اختر عددًا أقل."
                  />}
            </p>
          </div>

          {/* Serve model + context — Serve mode only. TP = GPU count (automatic). */}
          {launch.mode === 'serve' && (
            <>
              <div className="pod-field pod-field-wide">
                <label htmlFor="pod-serve-model" className="pod-label"><Bi en="Model" ar="النموذج" /></label>
                <select
                  id="pod-serve-model"
                  className="select"
                  value={launch.serveModel}
                  onChange={(e) => setLaunch((l) => ({ ...l, serveModel: e.target.value }))}
                  disabled={!isLive}
                >
                  {SERVE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.gated ? `${m.label} · needs HF license` : m.label}</option>
                  ))}
                </select>
                {/* Serve always runs tensor-parallel = GPU count; make that explicit. */}
                <p className="pod-help">
                  <Bi
                    en={`Served with vLLM as an OpenAI-compatible /v1 endpoint · tensor-parallel = ${launch.gpuCount} GPU${launch.gpuCount > 1 ? 's' : ''} (automatic). The public URL appears once the model loads.`}
                    ar={`تُقدَّم عبر vLLM كنقطة /v1 متوافقة مع OpenAI · التوازي الموتّري = ${launch.gpuCount} معالج (تلقائي). يظهر الرابط العام بعد تحميل النموذج.`}
                  />
                </p>
                {SERVE_MODELS.find((m) => m.value === launch.serveModel)?.gated && (
                  <p className="pod-help pod-help-reserved">
                    <Bi
                      en="This model is license-gated on Hugging Face — it only loads if the provider has accepted access. Prefer an “· open” model for a guaranteed first launch."
                      ar="هذا النموذج مقيّد بترخيص على Hugging Face — لا يُحمَّل إلا إذا قبل المزوّد الوصول. يُفضَّل نموذج «مفتوح» لضمان أول تشغيل."
                    />
                  </p>
                )}
              </div>
              <div className="pod-field">
                <label htmlFor="pod-serve-ctx" className="pod-label"><Bi en="Max context length" ar="أقصى طول للسياق" /></label>
                <select
                  id="pod-serve-ctx"
                  className="select"
                  value={launch.serveMaxLen}
                  onChange={(e) => setLaunch((l) => ({ ...l, serveMaxLen: Number(e.target.value) }))}
                  disabled={!isLive}
                >
                  {[2048, 4096, 8192, 16384, 32768].map((n) => (
                    <option key={n} value={n}>{`${n.toLocaleString()} tokens`}</option>
                  ))}
                </select>
                <p className="pod-help">
                  <Bi en="Total tokens shared by prompt + output (vLLM max-model-len). Longer needs more VRAM — lower it if the model won't fit." ar="إجمالي الرموز المشتركة بين الإدخال والإخراج (max-model-len في vLLM). الأطول يحتاج ذاكرة أكبر — قلّله إن لم يتّسع النموذج." />
                </p>
              </div>
            </>
          )}

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

          {/* Image override — notebook mode only (serve uses the dedicated vLLM image). */}
          {launch.mode !== 'serve' && (
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
          )}

          {/* Notebook token — notebook mode only (serve has no Jupyter). */}
          {launch.mode !== 'serve' && (
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
          )}
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

        <div className="pod-launch-summary" aria-label={lang === 'ar' ? 'ملخص التشغيل' : 'Launch summary'}>
          <span>
            <b><Bi en="GPU" ar="المعالج" /></b>
            <strong>
              {selectedType ? displayGpuType(selectedType.gpu_model) : <Bi en="Auto-pick" ar="اختيار تلقائي" />}
              {launch.gpuCount > 1 ? ` ×${launch.gpuCount}` : ''}
            </strong>
            {selectedType?.vram_gb != null && (
              <em>{selectedType.vram_gb * launch.gpuCount} GB VRAM</em>
            )}
          </span>
          <span>
            {launch.mode === 'serve'
              ? <>
                  <b><Bi en="Serve" ar="خدمة" /></b>
                  <strong>{(SERVE_MODELS.find((m) => m.value === launch.serveModel)?.label) || launch.serveModel}</strong>
                  <em><Bi en={`vLLM · TP=${launch.gpuCount} · ${durationLabel}`} ar={`vLLM · TP=${launch.gpuCount} · ${durationLabel}`} /></em>
                </>
              : <>
                  <b><Bi en="Runtime" ar="البيئة" /></b>
                  <strong>{selectedRuntimeLabel}</strong>
                  <em>{durationLabel}</em>
                </>}
          </span>
          <span>
            <b><Bi en="Estimate" ar="التقدير" /></b>
            <strong>
              {selectedQuoteSar != null
                ? <Bi en={`~SAR ${fmtSar(selectedQuoteSar)}`} ar={`~${fmtSar(selectedQuoteSar)} ﷼`} />
                : <Bi en="Shown after GPU picked" ar="يظهر بعد اختيار المعالج" />}
            </strong>
            <em><Bi en="full duration · refunded on early stop" ar="المدة كاملة · يُعاد الفرق عند الإيقاف المبكر" /></em>
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
      </section>
      </div>
      )}

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
              <button
                type="button"
                className="btn-pri pod-copy-all"
                onClick={() =>
                  copyText(
                    'reveal-all',
                    [
                      reveal.podId ? `Pod #${reveal.podId}` : null,
                      reveal.rootPassword ? `Root password (SSH): ${reveal.rootPassword}` : null,
                      reveal.jupyterToken ? `Jupyter token: ${reveal.jupyterToken}` : null,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
                aria-label="Copy all credentials"
              >
                {copied === 'reveal-all'
                  ? <Bi en="✓ Copied all" ar="✓ نُسخ الكل" />
                  : <Bi en="⧉ Copy all credentials" ar="⧉ نسخ كل بيانات الاعتماد" />}
              </button>
              <button type="button" className="btn-sec" onClick={() => setReveal(null)}>
                <Bi en="Dismiss" ar="إخفاء" />
              </button>
            </div>
          </div>
        )}

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
              // Serve pods become "ready" when the /v1 endpoint is published;
              // notebook pods when the Jupyter access_url is set.
              const isServe = pod.mode === 'serve' || pod.job_type === 'vllm_serve'
              const accessReady = active && (isServe ? !!pod.endpoint_url : !!pod.access_url)
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

                  {accessReady && typeof pod.seconds_remaining === 'number' && (() => {
                    // Rental timer only once the pod is LIVE (access_url set) — never
                    // during provisioning. recompute from ends_at every tick (nowTick).
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
                          {isServe
                            ? <Bi en="Your /v1 endpoint stays live until the rental ends, then the pod is torn down." ar="تبقى نقطة /v1 مباشرة حتى انتهاء الإيجار، ثم تُغلق الحاوية." />
                            : ending
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

                  {accessReady && isServe ? (
                    <div className="pod-access">
                      <div className="pod-access-hd">
                        <span className="pod-access-hd-k">
                          <Bi en="OpenAI-compatible endpoint" ar="نقطة متوافقة مع OpenAI" />
                        </span>
                        <button
                          type="button"
                          className="btn-sec pod-copy-all"
                          onClick={() =>
                            copyText(
                              `all-${id}`,
                              [
                                `Pod #${id}`,
                                pod.serve_model ? `Model: ${pod.serve_model}` : null,
                                pod.gpu_type
                                  ? `GPU: ${displayGpuType(pod.gpu_type)}${pod.tensor_parallel_size && pod.tensor_parallel_size > 1 ? ` ×${pod.tensor_parallel_size} (tensor-parallel)` : ''}`
                                  : null,
                                `Base URL: ${pod.endpoint_url}`,
                                `Models: ${pod.endpoint_url}/models`,
                                '',
                                `curl ${pod.endpoint_url}/chat/completions \\`,
                                '  -H "Content-Type: application/json" \\',
                                `  -d '{"model":"${pod.serve_model || ''}","messages":[{"role":"user","content":"Hello"}]}'`,
                              ]
                                .filter((x) => x !== null)
                                .join('\n'),
                            )
                          }
                          aria-label="Copy all endpoint details"
                        >
                          {copied === `all-${id}`
                            ? <Bi en="✓ Copied all" ar="✓ نُسخ الكل" />
                            : <Bi en="⧉ Copy all details" ar="⧉ نسخ كل التفاصيل" />}
                        </button>
                      </div>
                      {pod.serve_model && (
                        <div className="pod-access-block">
                          <div className="pod-access-body">
                            <span className="pod-access-k"><Bi en="Model" ar="النموذج" /></span>
                            <code className="pod-access-ssh">
                              {pod.serve_model}
                              {pod.tensor_parallel_size && pod.tensor_parallel_size > 1 ? `  ·  TP=${pod.tensor_parallel_size}` : ''}
                            </code>
                          </div>
                        </div>
                      )}
                      <div className="pod-access-block">
                        <div className="pod-access-body">
                          <span className="pod-access-k"><Bi en="Base URL (/v1)" ar="الرابط الأساسي (/v1)" /></span>
                          <code className="pod-access-ssh">{pod.endpoint_url}</code>
                        </div>
                        <button
                          type="button"
                          className="btn-sec pod-copy"
                          onClick={() => copyText(`ep-${id}`, pod.endpoint_url as string)}
                          aria-label="Copy endpoint URL"
                        >
                          {copied === `ep-${id}` ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                        </button>
                      </div>
                      <p className="pod-serve-hint">
                        <Bi
                          en="Point any OpenAI SDK at this base URL (no API key needed). It's healthy once /models responds."
                          ar="وجّه أي SDK من OpenAI إلى هذا الرابط (بدون مفتاح). يصبح جاهزًا عند استجابة ‎/models."
                        />
                      </p>
                    </div>
                  ) : accessReady ? (
                    <div className="pod-access">
                      <div className="pod-access-hd">
                        <span className="pod-access-hd-k">
                          <Bi en="Connection details" ar="بيانات الاتصال" />
                        </span>
                        <button
                          type="button"
                          className="btn-sec pod-copy-all"
                          onClick={() =>
                            copyText(
                              `all-${id}`,
                              [
                                `Pod #${id}`,
                                pod.gpu_type ? `GPU: ${displayGpuType(pod.gpu_type)}` : null,
                                `Jupyter: ${pod.access_url}`,
                                podCreds[id]?.jupyterToken ? `Jupyter token: ${podCreds[id].jupyterToken}` : null,
                                pod.ssh_command ? `SSH: ${pod.ssh_command}` : null,
                                // Root password is one-time (never on GET /pods); include it
                                // from the launch we captured this session so one click gives
                                // EVERYTHING needed to SSH in.
                                podCreds[id]?.rootPassword ? `SSH root password: ${podCreds[id].rootPassword}` : null,
                              ]
                                .filter(Boolean)
                                .join('\n'),
                            )
                          }
                          aria-label="Copy all pod connection details and credentials"
                        >
                          {copied === `all-${id}`
                            ? <Bi en="✓ Copied all" ar="✓ نُسخ الكل" />
                            : <Bi en="⧉ Copy all details" ar="⧉ نسخ كل التفاصيل" />}
                        </button>
                      </div>
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
                      <span className="pod-provisioning-body">
                        <span className="pod-provisioning-line">
                          <Bi en="Provisioning your pod…" ar="جارٍ تجهيز حاويتك…" />
                          {(() => {
                            void nowTick
                            const t0 = pod.submitted_at || pod.created_at
                            if (!t0) return null
                            const secs = Math.max(0, Math.round((Date.now() - Date.parse(t0)) / 1000))
                            return <b> {formatCountdown(secs)}</b>
                          })()}
                        </span>
                        <small>
                          {isServe
                            ? <Bi
                                en="Loading the model and starting the vLLM server (tensor-parallel across your GPUs). Your /v1 URL — and the rental timer — appear once /models responds. First load of an uncached model can take a few minutes."
                                ar="جارٍ تحميل النموذج وتشغيل خادم vLLM (توازٍ موتّري عبر معالجاتك). يظهر رابط /v1 ومؤقّت الإيجار عند استجابة ‎/models. قد يستغرق أول تحميل لنموذج غير مُخزَّن بضع دقائق."
                              />
                            : <Bi
                                en="Pulling the image and starting Jupyter. Your endpoints — and the rental timer — appear once it's live. A node's first launch can take a couple of minutes."
                                ar="جارٍ تجهيز البيئة وتشغيل Jupyter. ستظهر نقاط الوصول ومؤقّت الإيجار عند الجاهزية. قد يستغرق أول تشغيل على الجهاز دقيقتين."
                              />}
                        </small>
                      </span>
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
  )
}
