'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { PodSidebar, PodTopbar } from '../pods/PodShell'
import '../pods/pods.css'
import './fine-tuning.css'

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'
type MinimumBalanceStatus = 'idle' | 'loading' | 'ready' | 'error'

interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
  }
}

interface AdapterRecord {
  adapter_id: string
  name: string
  base_model: string
  storage_key: string
  checksum_sha256: string
  rank: number | null
  status: string
  created_at: string
  updated_at: string
  deployed_at: string | null
}

interface AdapterListResponse {
  data?: AdapterRecord[]
  error?: string
}

interface AdapterDeploymentRecord {
  deployment_id: string
  renter_id: number
  adapter_id: string
  base_model: string
  mode: string
  endpoint_id: string | null
  status: string
  route_traffic: boolean
  serving_load_proof: Record<string, unknown> | null
  failure_reason: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  stopped_at: string | null
}

interface AdapterDeploymentListResponse {
  data?: AdapterDeploymentRecord[]
  error?: string
}

interface LoraModelCardManifest {
  object: string
  schema_version: string
  status: string
  storage_key: string
  adapter: {
    adapter_id: string
    name: string
    base_model: string
    recipe: string
  }
  dataset: {
    storage_key: string
    checksum_sha256: string
    format: string
    row_count: number
    train_rows: number
    validation_rows: number
    estimated_tokens: number
  }
  artifact: {
    storage_key: string | null
    checksum_sha256: string | null
    proof_status: string
  }
  training: {
    training_job_id: string
    status: string
    started_at: string | null
    completed_at: string | null
  }
  claims: {
    public_training_enabled: boolean
    serving_enabled: boolean
    route_traffic: boolean
    quality_claims: boolean
    tinker_compatible: boolean
  }
  safety: {
    raw_dataset_not_embedded: boolean
    gpu_host_proof_required: boolean
    serving_load_proof_required: boolean
    public_claim: string
  }
  next: string
}

interface TrainingJobRecord {
  training_job_id: string
  recipe: string
  base_model: string
  dataset_storage_key: string
  dataset_checksum_sha256: string
  dataset_format: string
  dataset_row_count: number
  train_rows: number
  validation_rows: number
  estimated_tokens: number
  output_adapter_name: string
  output_adapter_id: string
  status: string
  artifact_storage_key: string | null
  artifact_checksum_sha256: string | null
  model_card_storage_key: string | null
  model_card_manifest: LoraModelCardManifest | null
  failure_reason: string | null
  training_enabled: boolean
  adapter_registered: boolean
  created_at: string
  updated_at: string
}

interface TrainingJobListResponse {
  data?: TrainingJobRecord[]
  error?: string
}

interface LoraReadiness {
  object: 'lora_readiness'
  version: string
  current_mode: string
  dataset_validation?: {
    status?: string
    available?: boolean
    validate_only_endpoint?: string
    supported_formats?: string[]
  }
  training_jobs?: {
    status?: string
    api_available?: boolean
    public_training_enabled?: boolean
    worker_execution_enabled?: boolean
    gpu_host_proof_required?: boolean
    recipes?: string[]
  }
  model_cards?: {
    status?: string
    api_available?: boolean
    manifest_version?: string
    model_card_artifact_writer_enabled?: boolean
  }
  adapter_registry?: {
    status?: string
    api_available?: boolean
    registry_contract_proof?: {
      status?: string
      command?: string
      local_roadmap_gate?: string
      verifies?: string[]
    }
    serving_enabled?: boolean
    route_traffic?: boolean
  }
  adapter_deployments?: {
    status?: string
    api_available?: boolean
    deployment_contract_proof?: {
      status?: string
      command?: string
      local_roadmap_gate?: string
      verifies?: string[]
    }
    serving_enabled?: boolean
    route_traffic?: boolean
    load_proof_required?: boolean
    modes?: string[]
  }
  claim_guards?: {
    public_training_enabled?: boolean
    public_serving_enabled?: boolean
    route_traffic?: boolean
    quality_claims?: boolean
    tinker_compatible?: boolean
    discounts_enabled?: boolean
  }
}

interface MinimumBalanceReadiness {
  object?: string
  version?: string
  current_mode?: string
  account?: {
    paid_available_halala?: number
    paid_available_sar?: number
    v1_remaining_cap_halala?: number | null
    v1_remaining_cap_sar?: number | null
  }
  rails?: {
    prompt_cache_discount?: {
      status?: string
      enforcement_live?: boolean
    }
    batch_inference?: {
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
    evaluators?: {
      status?: string
      enforcement_live?: boolean
    }
  }
  claim_guards?: {
    mutates_balance?: boolean
    creates_lora_training_job?: boolean
    creates_adapter_deployment?: boolean
    changes_enforcement?: boolean
  }
}

const STAGES = [
  {
    no: '01',
    status: 'ready',
    titleEn: 'Dataset validation',
    titleAr: 'تحقق البيانات',
    bodyEn: 'JSONL shape, token estimate, checksum, and train/validation split contract are in the backend.',
    bodyAr: 'شكل JSONL وتقدير الرموز والبصمة وتقسيم التدريب/التحقق موجودة كعقد في الخلفية.',
  },
  {
    no: '02',
    status: 'ready',
    titleEn: 'Training job API',
    titleAr: 'واجهة مهام التدريب',
    bodyEn: 'Renter-scoped LoRA job rows are live with fixed recipes, dataset counts, checksums, and adapter reservations.',
    bodyAr: 'صفوف مهام LoRA حسب المستأجر تعمل مع وصفات ثابتة وعدّ البيانات والبصمات وحجز المحولات.',
  },
  {
    no: '03',
    status: 'ready',
    titleEn: 'Adapter registry',
    titleAr: 'سجل المحولات',
    bodyEn: 'Renter-scoped adapter metadata is live. Registry writes do not deploy traffic.',
    bodyAr: 'بيانات المحولات حسب المستأجر تعمل الآن. الكتابة في السجل لا تنشر حركة مرور.',
  },
  {
    no: '04',
    status: 'blocked',
    titleEn: 'Deployment proof',
    titleAr: 'إثبات النشر',
    bodyEn: 'Endpoint routing stays off until adapter load proof matches deployment id, adapter id, base model, mode, endpoint id, and checksum.',
    bodyAr: 'يبقى توجيه النقطة متوقفا حتى يطابق إثبات التحميل معرف النشر والمحول والنموذج الأساسي والوضع والنقطة والبصمة.',
  },
  {
    no: '05',
    status: 'blocked',
    titleEn: 'Endpoint smoke',
    titleAr: 'دخان النقطة',
    bodyEn: 'A funded deterministic request must prove response hash, latency, token totals, and adapter trace before usage writes or billing.',
    bodyAr: 'يجب أن يثبت طلب حتمي ممول بصمة الاستجابة والزمن والرموز وتتبع المحول قبل كتابة الاستخدام أو الفوترة.',
  },
] as const

const WORKSPACE_PREUPLOAD_STEPS = [
  {
    no: '00',
    titleEn: 'Stage files',
    titleAr: 'جهّز الملفات',
    bodyEn: 'Upload JSONL datasets, notebooks, and adapters into the persistent /workspace volume before any training job is created.',
    bodyAr: 'ارفع ملفات JSONL والدفاتر والمحولات إلى مساحة /workspace الدائمة قبل إنشاء أي مهمة تدريب.',
  },
  {
    no: '01',
    titleEn: 'Validate JSONL',
    titleAr: 'تحقق من JSONL',
    bodyEn: 'Run the validate-only endpoint for row counts, token estimates, checksum, and split facts without storing raw rows.',
    bodyAr: 'شغّل واجهة التحقق فقط لحساب الصفوف والرموز والبصمة والتقسيم دون تخزين الصفوف الخام.',
  },
  {
    no: '02',
    titleEn: 'Launch LoRA pod',
    titleAr: 'شغّل حاوية LoRA',
    bodyEn: 'Open the LoRA or QLoRA pod template after the workspace is ready, then keep GPU-host proof visible before serving.',
    bodyAr: 'افتح قالب حاوية LoRA أو QLoRA بعد جاهزية مساحة العمل، وأبق إثبات مضيف GPU واضحا قبل الخدمة.',
  },
] as const

const API_SNIPPETS = [
  {
    id: 'readiness',
    titleEn: 'Read LoRA readiness',
    titleAr: 'قراءة جاهزية LoRA',
    meta: 'GET /api/lora/readiness',
    noteEn: 'Shows training, registry, deployment, route, and claim gates.',
    noteAr: 'يعرض بوابات التدريب والسجل والنشر والتوجيه والادعاءات.',
    command:
      'curl -s https://api.dcp.sa/api/lora/readiness \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY"',
  },
  {
    id: 'validate-dataset',
    titleEn: 'Validate dataset JSONL',
    titleAr: 'تحقق من JSONL البيانات',
    meta: 'POST /api/lora/datasets/validate',
    noteEn: 'Returns checksum, split, token, and size facts without creating a training job or storing raw rows.',
    noteAr: 'يعيد البصمة والتقسيم والرموز والحجم دون إنشاء مهمة تدريب أو تخزين الصفوف الخام.',
    command:
      'curl -s https://api.dcp.sa/api/lora/datasets/validate \\\n' +
      '  -X POST \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY" \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      "  --data-binary @- <<'JSON'\n" +
      '{"dataset_jsonl":"{\\"prompt\\":\\"Translate hello\\",\\"completion\\":\\"marhaba\\"}\\n{\\"prompt\\":\\"Translate thanks\\",\\"completion\\":\\"shukran\\"}","validation_split_pct":10}\n' +
      'JSON',
  },
  {
    id: 'training-jobs',
    titleEn: 'List training jobs',
    titleAr: 'عرض مهام التدريب',
    meta: 'GET /api/lora/training-jobs',
    noteEn: 'Returns metadata rows and model-card manifests; GPU trainer proof is still gated.',
    noteAr: 'يعيد صفوف البيانات وبيانات بطاقة النموذج؛ إثبات مدرب GPU ما زال مقيدا.',
    command:
      'curl -s https://api.dcp.sa/api/lora/training-jobs \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY"',
  },
  {
    id: 'adapters',
    titleEn: 'List adapters',
    titleAr: 'عرض المحولات',
    meta: 'GET /api/adapters',
    noteEn: 'Reads renter-owned adapter registry rows; registry writes do not route traffic.',
    noteAr: 'يقرأ صفوف سجل المحولات الخاصة بالمستأجر؛ الكتابة في السجل لا توجه الحركة.',
    command:
      'curl -s https://api.dcp.sa/api/adapters \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY"',
  },
  {
    id: 'deployments',
    titleEn: 'List deployment intents',
    titleAr: 'عرض نوايا النشر',
    meta: 'GET /api/adapters/deployments',
    noteEn: 'Renter-wide deployment intent list. Route traffic remains off until load proof lands.',
    noteAr: 'قائمة نوايا النشر حسب المستأجر. تبقى الحركة متوقفة حتى يصل إثبات التحميل.',
    command:
      'curl -s "https://api.dcp.sa/api/adapters/deployments?limit=25" \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY"',
  },
  {
    id: 'adapter-endpoint-smoke',
    titleEn: 'Check endpoint smoke gate',
    titleAr: 'فحص بوابة دخان النقطة',
    meta: 'GET /api/adapters/endpoints/smoke/readiness',
    noteEn: 'Public read-only smoke policy; smoke recording, routing, usage writes, billing, invoices, and payouts remain disabled.',
    noteAr: 'سياسة دخان عامة للقراءة فقط؛ يبقى تسجيل الدخان والتوجيه وكتابة الاستخدام والفوترة والفواتير والمدفوعات معطلة.',
    command: 'curl -s https://api.dcp.sa/api/adapters/endpoints/smoke/readiness',
  },
  {
    id: 'adapter-endpoint-smoke-status',
    titleEn: 'Inspect smoke status',
    titleAr: 'فحص حالة الدخان',
    meta: 'GET /api/adapters/{id}/deployments/{id}/endpoint-smoke',
    noteEn: 'Renter-scoped no-record status; it shows strict load-proof readiness while recording, usage writes, and billing remain disabled.',
    noteAr: 'حالة بلا تسجيل حسب المستأجر؛ تعرض جاهزية إثبات التحميل الصارم مع بقاء التسجيل وكتابة الاستخدام والفوترة معطلة.',
    command:
      'curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/endpoint-smoke \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY"',
  },
  {
    id: 'adapter-endpoint-smoke-submit',
    titleEn: 'Submit disabled smoke evidence',
    titleAr: 'إرسال دليل دخان معطل',
    meta: 'POST /api/adapters/{id}/deployments/{id}/endpoint-smoke',
    noteEn: 'Renter-scoped validation contract only; it returns 409, records nothing, and never exposes raw prompt or response content.',
    noteAr: 'عقد تحقق حسب المستأجر فقط؛ يعيد 409 ولا يسجل شيئا ولا يكشف نص الطلب أو الاستجابة الخام.',
    command:
      'curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/endpoint-smoke \\\n' +
      '  -X POST \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY" \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -d \'{"funded_smoke_principal":true,"smoke_result":{"request_id":"req_smoke_001"}}\'',
  },
  {
    id: 'adapter-usage-attribution',
    titleEn: 'Check usage attribution gate',
    titleAr: 'فحص بوابة نسب الاستخدام',
    meta: 'GET /api/adapters/usage/attribution/readiness',
    noteEn: 'Public read-only usage policy; adapter usage writes, billing, invoices, payouts, and route changes remain disabled.',
    noteAr: 'سياسة استخدام عامة للقراءة فقط؛ تبقى كتابة استخدام المحولات والفوترة والفواتير والمدفوعات وتغيير المسارات معطلة.',
    command: 'curl -s https://api.dcp.sa/api/adapters/usage/attribution/readiness',
  },
  {
    id: 'adapter-settlement',
    titleEn: 'Check settlement gate',
    titleAr: 'فحص بوابة التسوية',
    meta: 'GET /api/adapters/settlement/readiness',
    noteEn: 'Public read-only settlement policy; provider payouts, platform splits, invoices, balance mutations, and adapter billing remain disabled.',
    noteAr: 'سياسة تسوية عامة للقراءة فقط؛ تبقى مدفوعات المزود ونسب المنصة والفواتير وتغييرات الرصيد وفوترة المحولات معطلة.',
    command: 'curl -s https://api.dcp.sa/api/adapters/settlement/readiness',
  },
  {
    id: 'adapter-billing-approval',
    titleEn: 'Check approval gate',
    titleAr: 'فحص بوابة الموافقة',
    meta: 'GET /api/adapters/billing/approval/readiness',
    noteEn: 'Public read-only founder-approval policy; evidence packets do not enable billing, routing, invoices, payouts, or balance mutations.',
    noteAr: 'سياسة موافقة عامة للقراءة فقط؛ حزم الإثبات لا تفعل الفوترة أو التوجيه أو الفواتير أو المدفوعات أو تغييرات الرصيد.',
    command: 'curl -s https://api.dcp.sa/api/adapters/billing/approval/readiness',
  },
  {
    id: 'adapter-billing',
    titleEn: 'Check billing gate',
    titleAr: 'فحص بوابة الفوترة',
    meta: 'GET /api/adapters/billing/readiness',
    noteEn: 'Public read-only billing policy; usage writes, invoices, payouts, and route changes remain disabled.',
    noteAr: 'سياسة فوترة عامة للقراءة فقط؛ تبقى صفوف الاستخدام والفواتير والمدفوعات وتغيير المسارات معطلة.',
    command: 'curl -s https://api.dcp.sa/api/adapters/billing/readiness',
  },
  {
    id: 'create-deploy-intent',
    titleEn: 'Create a gated deploy intent',
    titleAr: 'إنشاء نية نشر مقيدة',
    meta: 'POST /api/adapters/{id}/deployments',
    noteEn: 'Records intent only; serving stays disabled until matching vLLM load proof.',
    noteAr: 'يسجل النية فقط؛ تبقى الخدمة معطلة حتى يطابق إثبات تحميل vLLM.',
    command:
      'curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments \\\n' +
      '  -X POST \\\n' +
      '  -H "Authorization: Bearer $DCP_RENTER_KEY" \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -d \'{"base_model":"Qwen/Qwen2.5-14B-Instruct-AWQ","mode":"single_adapter_live_merge"}\'',
  },
]

function shortChecksum(value: string): string {
  if (!value) return '-'
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US').format(value)
}

function sarFromHalala(value: number | null | undefined): number {
  return Number((Number(value || 0) / 100).toFixed(2))
}

function formatSar(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

function statusTone(status: string): string {
  if (status === 'failed' || status === 'cancelled') return 'failed'
  if (status === 'succeeded' || status === 'ready' || status === 'deployed') return 'settled'
  return 'queued'
}

function formatContractMode(value: string | undefined): string {
  if (!value) return 'metadata and artifact proof only'
  return value.replace(/_/g, ' ')
}

function readinessLabel(value: string | undefined): string {
  if (!value) return 'gated'
  return value.replace(/_/g, ' ')
}

function gateLabel(enabled: boolean | undefined): string {
  return enabled ? 'live' : 'off'
}

export default function RenterFineTuningPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [renterName, setRenterName] = useState('DCP renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [adapters, setAdapters] = useState<AdapterRecord[]>([])
  const [adapterDeployments, setAdapterDeployments] = useState<AdapterDeploymentRecord[]>([])
  const [trainingJobs, setTrainingJobs] = useState<TrainingJobRecord[]>([])
  const [readiness, setReadiness] = useState<LoraReadiness | null>(null)
  const [minimumBalance, setMinimumBalance] = useState<MinimumBalanceReadiness | null>(null)
  const [minimumBalanceStatus, setMinimumBalanceStatus] = useState<MinimumBalanceStatus>('idle')
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      setMinimumBalance(null)
      setMinimumBalanceStatus('idle')
      return
    }

    const base = getApiBase()
    const headers = { 'x-renter-key': key }
    let cancelled = false
    setLoadState('loading')
    setMinimumBalanceStatus('loading')
    setError('')

    ;(async () => {
      try {
        const minimumBalancePromise = fetch(`${base}/renters/me/minimum-balances`, { headers })
          .then(async (res) => {
            if (!res.ok) return null
            return (await res.json()) as MinimumBalanceReadiness
          })
          .catch(() => null)

        const [meRes, adaptersRes, deploymentsRes, trainingJobsRes, readinessRes, minimumBalanceData] = await Promise.all([
          fetch(`${base}/renters/me`, { headers }),
          fetch(`${base}/adapters`, { headers }),
          fetch(`${base}/adapters/deployments`, { headers }),
          fetch(`${base}/lora/training-jobs`, { headers }),
          fetch(`${base}/lora/readiness`, { headers }),
          minimumBalancePromise,
        ])

        if (!meRes.ok) {
          const data = await meRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load renter account.')
        }
        if (!adaptersRes.ok) {
          const data = await adaptersRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load adapter registry.')
        }
        if (!deploymentsRes.ok) {
          const data = await deploymentsRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load adapter deployments.')
        }
        if (!trainingJobsRes.ok) {
          const data = await trainingJobsRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load LoRA training jobs.')
        }
        if (!readinessRes.ok) {
          const data = await readinessRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load LoRA readiness gates.')
        }

        const me = (await meRes.json()) as RenterMe
        const adapterData = (await adaptersRes.json()) as AdapterListResponse
        const deploymentData = (await deploymentsRes.json()) as AdapterDeploymentListResponse
        const trainingJobData = (await trainingJobsRes.json()) as TrainingJobListResponse
        const readinessData = (await readinessRes.json()) as LoraReadiness
        const adapterList = adapterData.data || []
        const deploymentList = deploymentData.data || []
        if (cancelled) return

        const renter = me.renter
        setRenterName(renter?.organization || renter?.name || 'DCP renter')
        setRenterEmail(renter?.email || '')
        setAdapters(adapterList)
        setAdapterDeployments(deploymentList)
        setTrainingJobs(trainingJobData.data || [])
        setReadiness(readinessData?.object === 'lora_readiness' ? readinessData : null)
        setMinimumBalance(minimumBalanceData?.object === 'minimum_balance_readiness' ? minimumBalanceData : null)
        setMinimumBalanceStatus(minimumBalanceData?.object === 'minimum_balance_readiness' ? 'ready' : 'error')
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setMinimumBalance(null)
        setMinimumBalanceStatus('error')
        setLoadState('error')
        setError(err instanceof Error ? err.message : 'Failed to load fine-tuning state.')
      }
    })()

    return () => { cancelled = true }
  }, [])

  const baseModels = useMemo(() => {
    const set = new Set(adapters.map((adapter) => adapter.base_model).filter(Boolean))
    return set.size
  }, [adapters])

  const readyAdapters = adapters.filter((adapter) => adapter.status === 'ready' || adapter.status === 'deployed')
  const adapterRows = adapters.slice(0, 6)
  const deploymentRows = adapterDeployments.slice(0, 6)
  const trainingJobRows = trainingJobs.slice(0, 6)
  const manifestRows = trainingJobs.filter((job) => job.model_card_manifest).slice(0, 4)
  const totalDatasetRows = trainingJobs.reduce((sum, job) => sum + (job.dataset_row_count || 0), 0)
  const totalEstimatedTokens = trainingJobs.reduce((sum, job) => sum + (job.estimated_tokens || 0), 0)
  const isLive = loadState === 'ready'
  const readinessMode = readiness?.current_mode || 'metadata_and_artifact_proof_only'
  const claimGuards = readiness?.claim_guards || {}
  const registryProofStatus = readiness?.adapter_registry?.registry_contract_proof?.status
  const deploymentProofStatus = readiness?.adapter_deployments?.deployment_contract_proof?.status
  const loraMinimumRail = minimumBalance?.rails?.lora_training
  const adapterMinimumRail = minimumBalance?.rails?.adapter_deployments
  const paidAvailableSar = typeof minimumBalance?.account?.paid_available_sar === 'number'
    ? minimumBalance.account.paid_available_sar
    : sarFromHalala(minimumBalance?.account?.paid_available_halala)
  const minimumBalanceSynced = minimumBalanceStatus === 'ready'
    && minimumBalance?.current_mode === 'read_only_policy_contract'
    && minimumBalance?.claim_guards?.mutates_balance === false
    && minimumBalance?.claim_guards?.creates_lora_training_job === false
    && minimumBalance?.claim_guards?.creates_adapter_deployment === false
    && minimumBalance?.claim_guards?.changes_enforcement === false
  const blockedFutureBillingRails = [
    minimumBalance?.rails?.prompt_cache_discount,
    minimumBalance?.rails?.batch_inference,
    minimumBalance?.rails?.lora_training,
    minimumBalance?.rails?.adapter_deployments,
    minimumBalance?.rails?.evaluators,
  ].filter((rail) => rail?.enforcement_live === false).length
  const readinessClaims = [
    `training ${gateLabel(claimGuards.public_training_enabled)}`,
    `serving ${gateLabel(claimGuards.public_serving_enabled)}`,
    `routes ${gateLabel(claimGuards.route_traffic)}`,
    `quality ${gateLabel(claimGuards.quality_claims)}`,
    `Tinker ${gateLabel(claimGuards.tinker_compatible)}`,
    `discounts ${gateLabel(claimGuards.discounts_enabled)}`,
  ].join(' · ')

  function copySnippet(id: string, command: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(command).then(() => {
      setCopiedSnippet(id)
      window.setTimeout(() => setCopiedSnippet(null), 1800)
    })
  }

  return (
    <div className="rt-app ft-page">
      <PodSidebar
        navOpen={navOpen}
        renterName={renterName}
        renterEmail={renterEmail}
        currentPage="fine"
      />

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <PodTopbar
          renterName={renterName}
          isLive={isLive}
          lang={lang}
          onToggleLang={toggle}
          onToggleNav={() => setNavOpen((v) => !v)}
          pageLabelEn="Fine-Tuning"
          pageLabelAr="الضبط الدقيق"
        />

        <main className="rt-main ft-main">
          <h1 className="rt-h1">
            <Bi en="Fine-" ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="tuning." ar="الضبط الدقيق." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="LoRA SFT MVP" ar="نسخة LoRA SFT الأولى" />
            </span>
            <span>
              <Bi en="Contracts ready · serving gated by proof" ar="العقود جاهزة · الخدمة مشروطة بالإثبات" />
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state ft-state">
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or add a renter API key before the console can read adapter registry state."
                  ar="سجل الدخول أو أضف مفتاح مستأجر قبل أن تقرأ اللوحة حالة سجل المحولات."
                />
              </span>
              <Link className="text-link" href="/renter/keys">
                <Bi en="Manage API keys" ar="إدارة مفاتيح API" />
              </Link>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state ft-state">
              <b>
                <Bi en="Fine-tuning state unavailable" ar="حالة الضبط الدقيق غير متاحة" />
              </b>
              <span>{error}</span>
            </div>
          )}

          <div className="ft-kpis" aria-label={lang === 'ar' ? 'مؤشرات الضبط الدقيق' : 'Fine-tuning indicators'}>
            <div className="kpi featured">
              <div className="k">
                <Bi en="Training jobs" ar="مهام التدريب" />
              </div>
              <div className="v">{loadState === 'ready' ? trainingJobs.length : 0}</div>
              <div className="d flat">
                <Bi en="Trainer proof still gated" ar="إثبات التدريب ما زال مشروطا" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Dataset rows" ar="صفوف البيانات" />
              </div>
              <div className="v">{loadState === 'ready' ? formatNumber(totalDatasetRows) : 0}</div>
              <div className="d flat">
                <Bi
                  en={loadState === 'ready' ? `${formatNumber(totalEstimatedTokens)} est. tokens` : '0 est. tokens'}
                  ar={loadState === 'ready' ? `${formatNumber(totalEstimatedTokens)} رمز تقديري` : '0 رمز تقديري'}
                />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Model cards" ar="بطاقات النماذج" />
              </div>
              <div className="v">{loadState === 'ready' ? manifestRows.length : 0}</div>
              <div className="d up">
                <Bi en="Metadata only" ar="بيانات وصفية فقط" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Deployment intents" ar="نوايا النشر" />
              </div>
              <div className="v">{loadState === 'ready' ? deploymentRows.length : 0}</div>
              <div className="d flat">
                <Bi
                  en={`Routes off · ${readyAdapters.length} ready adapters`}
                  ar={`المسارات متوقفة · ${readyAdapters.length} محولات جاهزة`}
                />
              </div>
            </div>
          </div>

          <section className="ft-readiness" aria-label={lang === 'ar' ? 'جاهزية LoRA' : 'LoRA readiness'}>
            <div className="ft-section-head compact">
              <div>
                <span className="pod-label">
                  <Bi en="Readiness" ar="الجاهزية" />
                </span>
                <h2>{formatContractMode(readinessMode)}</h2>
              </div>
              <span className="ft-contract-id mono">{readiness?.version || 'dcp.lora_readiness.v1'}</span>
            </div>

            <div className="ft-readiness-grid">
              <div>
                <span><Bi en="Datasets" ar="البيانات" /></span>
                <b>{readinessLabel(readiness?.dataset_validation?.status || (readiness?.dataset_validation?.available ? 'available' : undefined))}</b>
              </div>
              <div>
                <span><Bi en="Jobs" ar="المهام" /></span>
                <b>{readinessLabel(readiness?.training_jobs?.status)}</b>
              </div>
              <div>
                <span><Bi en="Model cards" ar="بطاقات النماذج" /></span>
                <b>{readinessLabel(readiness?.model_cards?.status)}</b>
              </div>
              <div>
                <span><Bi en="Registry" ar="السجل" /></span>
                <b>
                  {readinessLabel(readiness?.adapter_registry?.status)}
                  {registryProofStatus ? ` · ${readinessLabel(registryProofStatus)}` : ''}
                </b>
              </div>
              <div>
                <span><Bi en="Deployments" ar="النشر" /></span>
                <b>
                  {readinessLabel(readiness?.adapter_deployments?.status)}
                  {deploymentProofStatus ? ` · ${readinessLabel(deploymentProofStatus)}` : ''}
                </b>
              </div>
              <div>
                <span><Bi en="Route traffic" ar="توجيه الحركة" /></span>
                <b>{gateLabel(readiness?.adapter_deployments?.route_traffic)}</b>
              </div>
            </div>

            <div className="ft-credit-preflight" aria-label={lang === 'ar' ? 'فحص رصيد الضبط الدقيق' : 'Fine-tuning credit preflight'}>
              <div className="ft-credit-copy">
                <span><Bi en="Credit preflight" ar="فحص الرصيد" /></span>
                <b>{minimumBalanceSynced ? 'minimum balance synced' : minimumBalanceStatus === 'loading' ? 'checking policy' : 'fallback policy'}</b>
                <p>
                  <Bi
                    en="Managed LoRA training and adapter serving stay read-only until their billing and proof rails are approved."
                    ar="يبقى تدريب LoRA المدار وخدمة المحولات للقراءة فقط حتى تعتمد مسارات الفوترة والإثبات."
                  />
                </p>
              </div>
              <div className="ft-credit-facts">
                <div>
                  <span><Bi en="LoRA training" ar="تدريب LoRA" /></span>
                  <b>{readinessLabel(loraMinimumRail?.status || 'metadata_and_artifact_proof_only')}</b>
                </div>
                <div>
                  <span><Bi en="Adapter deployments" ar="نشر المحولات" /></span>
                  <b>{readinessLabel(adapterMinimumRail?.status || 'load_and_billing_policy_required')}</b>
                </div>
                <div>
                  <span><Bi en="Paid available" ar="الرصيد المدفوع المتاح" /></span>
                  <b>SAR {formatSar(paidAvailableSar)}</b>
                </div>
                <div>
                  <span><Bi en="Blocked billing rails" ar="مسارات فوترة مقيدة" /></span>
                  <b>{blockedFutureBillingRails}</b>
                </div>
                <div>
                  <span><Bi en="Enforcement" ar="التنفيذ" /></span>
                  <b>
                    <Bi
                      en={minimumBalance?.claim_guards?.changes_enforcement ? 'change pending' : 'Read-only: no enforcement change'}
                      ar={minimumBalance?.claim_guards?.changes_enforcement ? 'تغيير معلق' : 'قراءة فقط: لا تغيير في التنفيذ'}
                    />
                  </b>
                </div>
              </div>
            </div>

            <div className="ft-supported">
              <span><Bi en="Claim guards" ar="حراس الادعاءات" /></span>
              <code>{readinessClaims}</code>
            </div>
          </section>

          <section className="ft-workspace-preupload" aria-labelledby="ft-workspace-preupload-title">
            <div className="ft-workspace-copy">
              <span className="pod-label">
                <Bi en="Step zero" ar="الخطوة صفر" />
              </span>
              <h2 id="ft-workspace-preupload-title">
                <Bi en="Pre-upload the workspace before fine-tuning" ar="ارفع مساحة العمل قبل الضبط الدقيق" />
              </h2>
              <p>
                <Bi
                  en="The normal DCP path is workspace first: stage files in the renter volume, validate the dataset contract, then launch a proof-gated LoRA pod. Managed training and adapter serving stay gated until GPU-host and load proof land."
                  ar="المسار الطبيعي في DCP يبدأ بمساحة العمل: جهّز الملفات في حجم المستأجر، ثم تحقق من عقد البيانات، ثم شغّل حاوية LoRA المقيدة بالإثبات. يبقى التدريب المدار وخدمة المحولات مقيدين حتى يصل إثبات مضيف GPU وإثبات التحميل."
                />
              </p>
              <div className="ft-workspace-actions">
                <Link className="btn-pri" href="/renter/playground?surface=workspace">
                  <Bi en="Open Workspace" ar="افتح مساحة العمل" />
                </Link>
                <Link className="btn-sec" href="/renter/pods">
                  <Bi en="Open LoRA Pods" ar="افتح حاويات LoRA" />
                </Link>
              </div>
            </div>

            <div className="ft-workspace-steps" aria-label={lang === 'ar' ? 'خطوات التحضير' : 'Workspace preparation steps'}>
              {WORKSPACE_PREUPLOAD_STEPS.map((step) => (
                <article key={step.no}>
                  <span>{step.no}</span>
                  <h3>
                    <Bi en={step.titleEn} ar={step.titleAr} />
                  </h3>
                  <p>
                    <Bi en={step.bodyEn} ar={step.bodyAr} />
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="ft-section" aria-labelledby="ft-flow-title">
            <div className="ft-section-head">
              <div>
                <span className="pod-label">
                  <Bi en="Train here, deploy here" ar="درّب هنا، وانشر هنا" />
                </span>
                <h2 id="ft-flow-title">
                  <Bi en="LoRA workflow gates" ar="بوابات سير عمل LoRA" />
                </h2>
              </div>
              <Link className="btn-sec" href="/renter/pods">
                <Bi en="Open GPU Pods" ar="افتح حاويات GPU" />
              </Link>
            </div>

            <div className="ft-stage-grid">
              {STAGES.map((stage) => (
                <article key={stage.no} className={`ft-stage ${stage.status}`}>
                  <div className="ft-stage-top">
                    <span className="ft-stage-no">{stage.no}</span>
                    <span className="ft-stage-status">
                      <Bi
                        en={stage.status === 'blocked' ? 'Proof gate' : 'Contract ready'}
                        ar={stage.status === 'blocked' ? 'بوابة إثبات' : 'العقد جاهز'}
                      />
                    </span>
                  </div>
                  <h3>
                    <Bi en={stage.titleEn} ar={stage.titleAr} />
                  </h3>
                  <p>
                    <Bi en={stage.bodyEn} ar={stage.bodyAr} />
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="ft-model-cards" aria-labelledby="ft-model-card-title">
            <div className="ft-section-head compact">
              <div>
                <span className="pod-label">
                  <Bi en="Model-card manifest" ar="بيان بطاقة النموذج" />
                </span>
                <h2 id="ft-model-card-title">
                  <Bi en="Adapter proof cards" ar="بطاقات إثبات المحولات" />
                </h2>
              </div>
              <span className="ft-contract-id mono">dcp.lora_model_card_manifest.v1</span>
            </div>

            {manifestRows.length > 0 ? (
              <div className="ft-model-card-grid">
                {manifestRows.map((job) => {
                  const manifest = job.model_card_manifest as LoraModelCardManifest
                  return (
                    <article className="ft-model-card" key={job.training_job_id}>
                      <div className="ft-model-card-top">
                        <div>
                          <span className="ft-table-sub mono">{manifest.adapter.adapter_id}</span>
                          <h3>{manifest.adapter.name}</h3>
                        </div>
                        <span className={`stat ${statusTone(job.status)}`}>{manifest.status}</span>
                      </div>

                      <dl className="ft-model-card-facts">
                        <div>
                          <dt><Bi en="Base" ar="الأساس" /></dt>
                          <dd>{manifest.adapter.base_model}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Dataset" ar="البيانات" /></dt>
                          <dd>{formatNumber(manifest.dataset.row_count)} rows · {manifest.dataset.format}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Artifact" ar="الأثر" /></dt>
                          <dd>{manifest.artifact.proof_status}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Card key" ar="مفتاح البطاقة" /></dt>
                          <dd>{manifest.storage_key}</dd>
                        </div>
                      </dl>

                      <div className="ft-claim-strip" aria-label={lang === 'ar' ? 'حراس الادعاءات' : 'Claim guards'}>
                        <span><Bi en={manifest.claims.public_training_enabled ? 'training on' : 'training off'} ar={manifest.claims.public_training_enabled ? 'التدريب يعمل' : 'التدريب متوقف'} /></span>
                        <span><Bi en={manifest.claims.serving_enabled ? 'serving on' : 'serving off'} ar={manifest.claims.serving_enabled ? 'الخدمة تعمل' : 'الخدمة متوقفة'} /></span>
                        <span><Bi en={manifest.claims.route_traffic ? 'routes on' : 'routes off'} ar={manifest.claims.route_traffic ? 'المسارات تعمل' : 'المسارات متوقفة'} /></span>
                        <span><Bi en={manifest.claims.quality_claims ? 'quality claimed' : 'no quality claim'} ar={manifest.claims.quality_claims ? 'ادعاء جودة' : 'لا ادعاء جودة'} /></span>
                        <span><Bi en={manifest.claims.tinker_compatible ? 'Tinker compatible' : 'Tinker not claimed'} ar={manifest.claims.tinker_compatible ? 'متوافق مع Tinker' : 'لا ادعاء Tinker'} /></span>
                      </div>

                      <p className="ft-next mono">{manifest.next}</p>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="ft-empty">
                <b>
                  <Bi en="No model-card manifests yet" ar="لا توجد بيانات بطاقات نماذج بعد" />
                </b>
                <span>
                  <Bi
                    en="Manifest cards appear after a LoRA job reserves or records a model-card storage key."
                    ar="تظهر بطاقات البيان بعد أن تحجز أو تسجل مهمة LoRA مفتاح تخزين بطاقة النموذج."
                  />
                </span>
              </div>
            )}
          </section>

          <section className="ft-grid" aria-label={lang === 'ar' ? 'حالة السجل والعقود' : 'Registry and contract state'}>
            <div className="ft-ledger-stack">
              <div className="ft-ledger">
                <div className="ft-section-head compact">
                  <div>
                    <span className="pod-label">
                      <Bi en="Training queue" ar="قائمة التدريب" />
                    </span>
                    <h2>
                      <Bi en="LoRA training jobs" ar="مهام تدريب LoRA" />
                    </h2>
                  </div>
                </div>

                {trainingJobRows.length > 0 ? (
                  <div className="ft-table-wrap">
                    <table className="tbl ft-table ft-training-table">
                      <thead>
                        <tr>
                          <th><Bi en="Job" ar="المهمة" /></th>
                          <th><Bi en="Dataset" ar="البيانات" /></th>
                          <th><Bi en="Base model" ar="النموذج الأساسي" /></th>
                          <th><Bi en="Recipe" ar="الوصفة" /></th>
                          <th><Bi en="Status" ar="الحالة" /></th>
                          <th><Bi en="Gates" ar="البوابات" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainingJobRows.map((job) => (
                          <tr key={job.training_job_id}>
                            <td>
                              <span className="mono">{job.training_job_id}</span>
                              <span className="ft-table-sub">{job.output_adapter_name}</span>
                              <span className="ft-table-sub mono">{job.output_adapter_id}</span>
                            </td>
                            <td>
                              <span>
                                <Bi
                                  en={`${formatNumber(job.dataset_row_count)} rows`}
                                  ar={`${formatNumber(job.dataset_row_count)} صف`}
                                />
                              </span>
                              <span className="ft-table-sub">
                                <Bi
                                  en={`${job.dataset_format} · train ${formatNumber(job.train_rows)} · val ${formatNumber(job.validation_rows)}`}
                                  ar={`${job.dataset_format} · تدريب ${formatNumber(job.train_rows)} · تحقق ${formatNumber(job.validation_rows)}`}
                                />
                              </span>
                              <span className="ft-table-sub mono">{shortChecksum(job.dataset_checksum_sha256)}</span>
                            </td>
                            <td className="mono">{job.base_model}</td>
                            <td className="mono">{job.recipe}</td>
                            <td>
                              <span className={`stat ${statusTone(job.status)}`}>
                                {job.status}
                              </span>
                              <span className="ft-table-sub">{formatDate(job.created_at)}</span>
                            </td>
                            <td>
                              <span className="ft-gate-list">
                                <span>
                                  <Bi
                                    en={job.training_enabled ? 'trainer on' : 'trainer off'}
                                    ar={job.training_enabled ? 'التدريب يعمل' : 'التدريب متوقف'}
                                  />
                                </span>
                                <span>
                                  <Bi
                                    en={job.adapter_registered ? 'adapter registered' : 'adapter pending'}
                                    ar={job.adapter_registered ? 'المحول مسجل' : 'المحول قيد الانتظار'}
                                  />
                                </span>
                                <span>
                                  <Bi
                                    en={job.model_card_manifest ? 'model card manifest' : 'model card pending'}
                                    ar={job.model_card_manifest ? 'بيان بطاقة النموذج' : 'بطاقة النموذج قيد الانتظار'}
                                  />
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ft-empty">
                    <b>
                      <Bi en="No training jobs recorded yet" ar="لا توجد مهام تدريب مسجلة بعد" />
                    </b>
                    <span>
                      <Bi
                        en="The job API is live for validated LoRA metadata. GPU trainer execution stays blocked until host proof and artifact registration are wired."
                        ar="واجهة المهام تعمل لبيانات LoRA المحققة. تنفيذ تدريب GPU يبقى متوقفا حتى ربط إثبات المضيف وتسجيل الأثر."
                      />
                    </span>
                  </div>
                )}
              </div>

              <div className="ft-ledger">
                <div className="ft-section-head compact">
                  <div>
                    <span className="pod-label">
                      <Bi en="Adapter registry" ar="سجل المحولات" />
                    </span>
                    <h2>
                      <Bi en="Latest adapters" ar="آخر المحولات" />
                    </h2>
                  </div>
                </div>

                {adapterRows.length > 0 ? (
                  <div className="ft-table-wrap">
                    <table className="tbl ft-table">
                      <thead>
                        <tr>
                          <th><Bi en="Adapter" ar="المحول" /></th>
                          <th><Bi en="Base model" ar="النموذج الأساسي" /></th>
                          <th><Bi en="Rank" ar="الرتبة" /></th>
                          <th><Bi en="Status" ar="الحالة" /></th>
                          <th><Bi en="Checksum" ar="البصمة" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {adapterRows.map((adapter) => (
                          <tr key={adapter.adapter_id}>
                            <td>
                              <span className="mono">{adapter.adapter_id}</span>
                              <span className="ft-table-sub">{adapter.name}</span>
                            </td>
                            <td className="mono">{adapter.base_model}</td>
                            <td className="mono">{adapter.rank ?? '-'}</td>
                            <td>
                              <span className={`stat ${statusTone(adapter.status)}`}>
                                {adapter.status}
                              </span>
                            </td>
                            <td>
                              <span className="mono">{shortChecksum(adapter.checksum_sha256)}</span>
                              <span className="ft-table-sub">{formatDate(adapter.created_at)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ft-empty">
                    <b>
                      <Bi en="No adapters registered yet" ar="لا توجد محولات مسجلة بعد" />
                    </b>
                    <span>
                      <Bi
                        en="Adapter records appear here only after a LoRA artifact is registered. Job rows above may exist before any adapter is deployable."
                        ar="تظهر سجلات المحولات هنا فقط بعد تسجيل أثر LoRA. قد توجد صفوف المهام أعلاه قبل أن يصبح أي محول قابلا للنشر."
                      />
                    </span>
                  </div>
                )}
              </div>

              <div className="ft-ledger">
                <div className="ft-section-head compact">
                  <div>
                    <span className="pod-label">
                      <Bi en="Adapter deployments" ar="نشر المحولات" />
                    </span>
                    <h2>
                      <Bi en="Deployment intents" ar="نوايا النشر" />
                    </h2>
                  </div>
                </div>

                {deploymentRows.length > 0 ? (
                  <div className="ft-table-wrap">
                    <table className="tbl ft-table ft-deploy-table">
                      <thead>
                        <tr>
                          <th><Bi en="Deployment" ar="النشر" /></th>
                          <th><Bi en="Adapter" ar="المحول" /></th>
                          <th><Bi en="Mode" ar="النمط" /></th>
                          <th><Bi en="Endpoint" ar="النقطة" /></th>
                          <th><Bi en="Status" ar="الحالة" /></th>
                          <th><Bi en="Traffic" ar="الحركة" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deploymentRows.map((deployment) => (
                          <tr key={deployment.deployment_id}>
                            <td>
                              <span className="mono">{deployment.deployment_id}</span>
                              <span className="ft-table-sub">{formatDate(deployment.created_at)}</span>
                            </td>
                            <td className="mono">{deployment.adapter_id}</td>
                            <td className="mono">{deployment.mode}</td>
                            <td className="mono">{deployment.endpoint_id || '-'}</td>
                            <td>
                              <span className={`stat ${statusTone(deployment.status)}`}>{deployment.status}</span>
                              {deployment.failure_reason && (
                                <span className="ft-table-sub">{deployment.failure_reason}</span>
                              )}
                            </td>
                            <td>
                              <span className="ft-gate-list">
                                <span>
                                  <Bi
                                    en={deployment.route_traffic ? 'routes on' : 'routes off'}
                                    ar={deployment.route_traffic ? 'المسارات تعمل' : 'المسارات متوقفة'}
                                  />
                                </span>
                                <span>
                                  <Bi
                                    en={deployment.serving_load_proof ? 'load proof attached' : 'load proof pending'}
                                    ar={deployment.serving_load_proof ? 'إثبات التحميل مرفق' : 'إثبات التحميل قيد الانتظار'}
                                  />
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ft-empty">
                    <b>
                      <Bi en="No deployment intents yet" ar="لا توجد نوايا نشر بعد" />
                    </b>
                    <span>
                      <Bi
                        en="Deployment records appear only after a ready adapter asks for a serving target. Route traffic stays off until vLLM proof matches deployment id, adapter id, base model, mode, endpoint id, and checksum."
                        ar="تظهر سجلات النشر فقط بعد أن يطلب محول جاهز هدف خدمة. تبقى الحركة متوقفة حتى يرفق إثبات تحميل vLLM مطابق."
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>

            <aside className="ft-contract">
              <span className="pod-label">
                <Bi en="API snippets" ar="أمثلة API" />
              </span>
              <div className="ft-snippet-stack" aria-label={lang === 'ar' ? 'أمثلة API' : 'API snippets'}>
                {API_SNIPPETS.map((snippet) => (
                  <div className="ft-snippet" key={snippet.id}>
                    <div className="ft-snippet-top">
                      <div>
                        <b>
                          <Bi en={snippet.titleEn} ar={snippet.titleAr} />
                        </b>
                        <span>{snippet.meta}</span>
                      </div>
                      <button type="button" className="ft-copy" onClick={() => copySnippet(snippet.id, snippet.command)}>
                        <Bi en={copiedSnippet === snippet.id ? 'Copied' : 'Copy'} ar={copiedSnippet === snippet.id ? 'تم النسخ' : 'نسخ'} />
                      </button>
                    </div>
                    <pre className="code ft-code">{snippet.command}</pre>
                    <p>
                      <Bi en={snippet.noteEn} ar={snippet.noteAr} />
                    </p>
                  </div>
                ))}
              </div>
              <div className="ft-contract-note">
                <Bi
                  en="These snippets use the shipped contract surface. They do not prove managed training or public adapter serving; deployment routing stays disabled until serving proof lands."
                  ar="تستخدم هذه الأمثلة واجهة العقد المشحونة. لا تثبت التدريب المُدار أو خدمة المحولات العامة؛ يبقى توجيه النشر معطلاً حتى يصل إثبات الخدمة."
                />
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  )
}
