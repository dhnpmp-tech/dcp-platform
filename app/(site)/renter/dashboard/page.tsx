'use client'

// Ported from the v2 renter console source design (Overview).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./dashboard.css.
//
// Renter mental model = "what's running and how much runway do I have" — NOT "how much
// have I spent". Spend history/analytics live in Usage (/renter/usage) and Wallet
// (/renter/wallet); this Overview leads with runway: balance, active sessions, GPU in
// use, and quick actions.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './dashboard.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/renter/pods' },
      { k: 'fine', ic: 'FT', label: 'Fine-Tuning', labelAr: 'الضبط الدقيق', href: '/renter/fine-tuning' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'dash'

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

type QsTab = 'curl' | 'py' | 'node'

// ── Fetched API shapes (subset of v1 /renters/* responses) ──────────────
interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
    balance_halala?: number
    total_spent_halala?: number
    total_jobs?: number
  }
}

interface LiveJob {
  requestId: string
  model: string
  status: string
  providerGpu: string
  tokensGenerated: number
  costHalala: number
}

interface LiveResp {
  active?: LiveJob[]
  recent?: LiveJob[]
}

interface PodLite {
  id: number | string
  status: string
  gpu_type?: string | null
}

interface PodsResp {
  pods?: PodLite[]
}

type PlatformReadinessState = 'loading' | 'ready' | 'partial' | 'missing-key' | 'error'

interface ModelCatalogRow {
  id?: string
  pricing?: {
    contract?: {
      version?: string
    }
  }
  capability_contract?: {
    version?: string
  }
  feature_readiness?: Record<string, unknown>
}

interface ModelCatalogResp {
  data?: ModelCatalogRow[]
}

interface PromptCacheSettlementReadiness {
  object?: string
  version?: string
  current_mode?: string
  policy?: {
    cached_input_discounts_enabled?: boolean
    settlement_discounts_enabled?: boolean
    provider_cache_hit_evidence?: {
      status?: string
    }
    discount_policy?: {
      status?: string
    }
  }
  claim_guards?: {
    cached_input_discounts_enabled?: boolean
    settlement_discounts_enabled?: boolean
    mutates_balance?: boolean
    dispatches_inference?: boolean
  }
}

interface BatchReadinessResp {
  readiness?: {
    object?: string
    version?: string
    current_mode?: string
    public_execution_enabled?: boolean
    features?: {
      discounts?: {
        enabled?: boolean
        status?: string
      }
      worker_execution?: {
        public_enabled?: boolean
        status?: string
      }
    }
    claims?: {
      batch_execution_live?: boolean
      batch_discount_live?: boolean
    }
    live_acceptance?: {
      execution_discount_smoke?: {
        status?: string
        command?: string
      }
    }
  }
}

interface LoraReadinessResp {
  object?: string
  version?: string
  current_mode?: string
  training_jobs?: {
    status?: string
    public_training_enabled?: boolean
    worker_execution_enabled?: boolean
  }
  adapter_registry?: {
    status?: string
    api_available?: boolean
    serving_enabled?: boolean
    route_traffic?: boolean
  }
  adapter_deployments?: {
    status?: string
    serving_enabled?: boolean
    route_traffic?: boolean
    billing_enabled?: boolean
  }
  claim_guards?: {
    public_training_enabled?: boolean
    public_serving_enabled?: boolean
    route_traffic?: boolean
    tinker_compatible?: boolean
  }
}

interface PlatformRail {
  key: string
  labelEn: string
  labelAr: string
  href: string
  statusEn: string
  statusAr: string
  detailEn: string
  detailAr: string
  contract: string
  tone: 'live' | 'gated' | 'checking'
}

// Renter pod quota (DCP_MAX_ACTIVE_PODS) — the bounded, runway-relevant "session".
const MAX_ACTIVE_PODS = 2
// Statuses that occupy an active pod slot (mirrors the pods page's ACTIVE_POD_STATUSES).
const ACTIVE_POD_STATUSES = new Set(['queued', 'assigned', 'pulling', 'running', 'starting'])

// halala (integer cents) → SAR number
const halToSar = (h: number) => h / 100

// Two-letter avatar initials derived from an account/workspace name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

async function readOptionalJson<T>(url: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { ...options, cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as T | null
  } catch {
    return null
  }
}

function formatContractStatus(value: string | undefined, fallback = 'checking'): string {
  return String(value || fallback)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function RenterDashboardPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [qsTab, setQsTab] = useState<QsTab>('curl')

  // ── Live data (balance / live jobs). No mock fallback:
  // failed or missing auth renders explicit empty/error states.
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [dataError, setDataError] = useState('')
  const [renterName, setRenterName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [balanceSar, setBalanceSar] = useState<number | null>(null)
  const [totalJobs, setTotalJobs] = useState<number | null>(null)
  const [activeJobs, setActiveJobs] = useState<LiveJob[]>([])
  const [recentJobs, setRecentJobs] = useState<LiveJob[]>([])
  const [activePodCount, setActivePodCount] = useState<number | null>(null)
  const [platformState, setPlatformState] = useState<PlatformReadinessState>('loading')
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResp | null>(null)
  const [promptCacheSettlement, setPromptCacheSettlement] = useState<PromptCacheSettlementReadiness | null>(null)
  const [batchReadinessResp, setBatchReadinessResp] = useState<BatchReadinessResp | null>(null)
  const [loraReadiness, setLoraReadiness] = useState<LoraReadinessResp | null>(null)

  const liveJobs = useMemo(() => [...activeJobs, ...recentJobs], [activeJobs, recentJobs])
  // Runway view: how much of the balance is currently held by in-flight jobs, and
  // which GPU types are running right now.
  const heldSar = useMemo(
    () => activeJobs.reduce((sum, j) => sum + halToSar(j.costHalala ?? 0), 0),
    [activeJobs],
  )
  const gpusInUse = useMemo(() => {
    const set = new Set(activeJobs.map((j) => j.providerGpu).filter(Boolean))
    return Array.from(set)
  }, [activeJobs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setDataState('missing-key')
      setPlatformState('missing-key')
      return
    }

    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    let cancelled = false
    setDataState('loading')
    setDataError('')
    setPlatformState('loading')

    ;(async () => {
      try {
        const [meRes, liveRes, podsRes] = await Promise.all([
          fetch(`${base}/renters/me`, { headers }),
          fetch(`${base}/renters/me/live`, { headers }),
          fetch(`${base}/pods?key=${encodeURIComponent(key)}`, { headers }),
        ])

        if (!meRes.ok) {
          const data = await meRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load renter dashboard.')
        }
        const me = (await meRes.json()) as RenterMe
        if (cancelled) return
        const renter = me.renter
        if (renter?.name) setRenterName(renter.name)
        if (renter?.organization) setWorkspaceName(renter.organization)
        if (typeof renter?.balance_halala === 'number') setBalanceSar(halToSar(renter.balance_halala))
        if (typeof renter?.total_jobs === 'number') setTotalJobs(renter.total_jobs)

        if (liveRes.ok) {
          const live = (await liveRes.json()) as LiveResp
          if (!cancelled) {
            setActiveJobs(live.active ?? [])
            setRecentJobs(live.recent ?? [])
          }
        }
        if (podsRes.ok) {
          const pd = (await podsRes.json()) as PodsResp
          if (!cancelled) {
            setActivePodCount((pd.pods ?? []).filter((p) => ACTIVE_POD_STATUSES.has(p.status)).length)
          }
        }
        const platformResults = await Promise.allSettled([
          readOptionalJson<ModelCatalogResp>('/v1/models'),
          readOptionalJson<PromptCacheSettlementReadiness>('/v1/prompt-cache/settlement/readiness'),
          readOptionalJson<BatchReadinessResp>(`${base}/batches/readiness`, { headers }),
          readOptionalJson<LoraReadinessResp>(`${base}/lora/readiness`, { headers }),
        ])
        if (!cancelled) {
          const modelData = platformResults[0].status === 'fulfilled' ? platformResults[0].value : null
          const promptData = platformResults[1].status === 'fulfilled' ? platformResults[1].value : null
          const batchData = platformResults[2].status === 'fulfilled' ? platformResults[2].value : null
          const loraData = platformResults[3].status === 'fulfilled' ? platformResults[3].value : null
          setModelCatalog(Array.isArray(modelData?.data) ? modelData : null)
          setPromptCacheSettlement(promptData?.object === 'prompt_cache_settlement_readiness' ? promptData : null)
          setBatchReadinessResp(batchData?.readiness?.object === 'batch_inference_readiness' ? batchData : null)
          setLoraReadiness(loraData?.object === 'lora_readiness' ? loraData : null)
          const loadedContracts = [
            Array.isArray(modelData?.data),
            promptData?.object === 'prompt_cache_settlement_readiness',
            batchData?.readiness?.object === 'batch_inference_readiness',
            loraData?.object === 'lora_readiness',
          ].filter(Boolean).length
          setPlatformState(loadedContracts === 4 ? 'ready' : loadedContracts > 0 ? 'partial' : 'error')
        }
        if (!cancelled) setDataState('ready')
      } catch (err) {
        if (cancelled) return
        setDataState('error')
        setPlatformState('error')
        setDataError(err instanceof Error ? err.message : 'Failed to load renter dashboard.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Live-jobs poll: refresh active/recent jobs every 2s so the panel's
  // "Updates every 2s" label is honest. Stops on unmount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) return

    const headers = { 'x-renter-key': key }
    const base = getApiBase()
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${base}/renters/me/live`, { headers })
        if (!res.ok || cancelled) return
        const live = (await res.json()) as LiveResp
        if (cancelled) return
        setActiveJobs(live.active ?? [])
        setRecentJobs(live.recent ?? [])
      } catch {
        // Transient poll failure: keep the last known live jobs on screen.
      }
    }

    const timer = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const displayName = renterName || (lang === 'ar' ? 'المستأجر' : 'Renter')
  const displayWorkspace = workspaceName || (lang === 'ar' ? 'مساحة العمل' : 'Workspace')
  const wsInitials = initials(workspaceName || renterName || displayWorkspace)
  const userInitials = initials(renterName || workspaceName || displayName)
  const modelRows = modelCatalog?.data ?? []
  const pricedModelCount = modelRows.filter((row) => row.pricing?.contract?.version === 'dcp.model_token_pricing.v1').length
  const capabilityModelCount = modelRows.filter((row) => row.capability_contract?.version === 'dcp.model_capability_contract.v1').length
  const batchReadiness = batchReadinessResp?.readiness
  const batchExecutionLive = batchReadiness?.public_execution_enabled === true || batchReadiness?.claims?.batch_execution_live === true
  const batchDiscountLive = batchReadiness?.features?.discounts?.enabled === true || batchReadiness?.claims?.batch_discount_live === true
  const promptCacheDiscountLive = promptCacheSettlement?.policy?.cached_input_discounts_enabled === true || promptCacheSettlement?.claim_guards?.cached_input_discounts_enabled === true
  const loraTrainingLive = loraReadiness?.training_jobs?.public_training_enabled === true || loraReadiness?.training_jobs?.worker_execution_enabled === true
  const adapterRouteLive = loraReadiness?.adapter_deployments?.route_traffic === true || loraReadiness?.claim_guards?.route_traffic === true
  const platformStateLabel = platformState === 'ready'
    ? '4 contracts synced'
    : platformState === 'partial'
      ? 'partial contract sync'
      : platformState === 'missing-key'
        ? 'renter key required'
        : platformState === 'loading'
          ? 'loading contracts'
          : 'contracts unavailable'
  const platformRails: PlatformRail[] = [
    {
      key: 'inference',
      labelEn: 'Inference',
      labelAr: 'الاستدلال',
      href: '/renter/playground',
      statusEn: modelRows.length > 0 ? `${modelRows.length} models · ${pricedModelCount} priced` : 'checking model catalog',
      statusAr: modelRows.length > 0 ? `${modelRows.length} نماذج` : 'فحص الكتالوج',
      detailEn: `${capabilityModelCount || 'No'} capability contracts visible; use Playground for live requests.`,
      detailAr: 'عقود القدرة ظاهرة؛ استخدم البيئة التجريبية للطلبات الحية.',
      contract: '/v1/models',
      tone: modelRows.length > 0 ? 'live' : 'checking',
    },
    {
      key: 'prompt-cache',
      labelEn: 'Prompt cache',
      labelAr: 'تخزين المحادثة',
      href: '/renter/playground',
      statusEn: promptCacheDiscountLive ? 'discounts live' : formatContractStatus(promptCacheSettlement?.policy?.provider_cache_hit_evidence?.status || promptCacheSettlement?.policy?.discount_policy?.status, 'settlement gated'),
      statusAr: promptCacheDiscountLive ? 'الخصم يعمل' : 'التسوية مقيدة',
      detailEn: 'Hash-only measurement is visible; provider hit evidence and discount approval still gate settlement.',
      detailAr: 'القياس ظاهر؛ إثبات المزود والموافقة يقيدان الخصم.',
      contract: '/v1/prompt-cache/settlement/readiness',
      tone: promptCacheSettlement ? (promptCacheDiscountLive ? 'live' : 'gated') : 'checking',
    },
    {
      key: 'batch',
      labelEn: 'Batch',
      labelAr: 'الدُفعات',
      href: '/renter/batches',
      statusEn: batchExecutionLive ? 'execution live' : formatContractStatus(batchReadiness?.current_mode, 'metadata only'),
      statusAr: batchExecutionLive ? 'التنفيذ يعمل' : 'بيانات فقط',
      detailEn: batchDiscountLive ? 'Discounts are live.' : 'JSONL validation and ledgers are available; worker execution, downloads, and discounts stay proof-gated.',
      detailAr: 'التحقق والسجل متاحان؛ التنفيذ والخصومات مقيدة.',
      contract: '/api/batches/readiness',
      tone: batchReadiness ? (batchExecutionLive ? 'live' : 'gated') : 'checking',
    },
    {
      key: 'lora',
      labelEn: 'LoRA + adapters',
      labelAr: 'LoRA والمحوّلات',
      href: '/renter/fine-tuning',
      statusEn: adapterRouteLive ? 'adapter routing live' : formatContractStatus(loraReadiness?.current_mode, 'metadata only'),
      statusAr: adapterRouteLive ? 'توجيه المحوّل يعمل' : 'بيانات فقط',
      detailEn: loraTrainingLive ? 'Training worker is enabled.' : 'Dataset validation, job metadata, adapter registry, and deployment intents are visible; GPU artifact/load proof still gates serving.',
      detailAr: 'التحقق والبيانات ظاهرة؛ إثبات GPU وتحميل المحوّل يقيدان الخدمة.',
      contract: '/api/lora/readiness',
      tone: loraReadiness ? (adapterRouteLive || loraTrainingLive ? 'live' : 'gated') : 'checking',
    },
    {
      key: 'pods',
      labelEn: 'Pods',
      labelAr: 'الحاويات',
      href: '/renter/pods',
      statusEn: activePodCount != null ? `${activePodCount} / ${MAX_ACTIVE_PODS} active` : 'checking pods',
      statusAr: activePodCount != null ? `${activePodCount} / ${MAX_ACTIVE_PODS} نشطة` : 'فحص الحاويات',
      detailEn: 'Launch GPU pods, attach /workspace, and use Stage 2 to choose Auto-pick or a fixed GPU card.',
      detailAr: 'شغّل حاويات GPU واختر GPU في المرحلة 2.',
      contract: '/api/pods',
      tone: activePodCount != null ? 'live' : 'checking',
    },
  ]

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="dash">
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <div className="rt-ws-btn">
            <span className="av">{wsInitials}</span>
            <span className="body">
              <span className="nm">{displayWorkspace}</span>
              <span className="sub">
                <Bi en="Live renter account" ar="حساب مستأجر حي" />
              </span>
            </span>
          </div>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Credit" ar="الرصيد" />
          </div>
          <div className="v">
            {balanceSar != null ? (
              <>
                <Bi en={`Credit ${numFmt.format(Math.floor(balanceSar))}`} ar={`رصيد ${numFmt.format(Math.floor(balanceSar))}`} />
                <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>{activeJobs.length > 0 ? <Bi en={`${heldSar.toFixed(2)} credit`} ar={`${heldSar.toFixed(2)} رصيد`} /> : (lang === 'ar' ? 'لا يوجد' : 'n/a')}</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Active pods" ar="الحاويات النشطة" />
            </span>
            <b>{activePodCount != null ? `${activePodCount} / ${MAX_ACTIVE_PODS}` : '—'}</b>
          </div>
          <Link className="topup" href="/renter/wallet#top-up">
            <Bi en="+ Add credit" ar="+ إضافة رصيد" />
          </Link>
        </div>

        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => {
                const active = it.k === CURRENT_PAGE
                return (
                  <Link key={it.k} href={it.href} target={it.href === '/docs' ? '_blank' : undefined} rel={it.href === '/docs' ? 'noopener noreferrer' : undefined} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
                    <span className="ic">{it.ic}</span>
                    <span>
                      <Bi en={it.label} ar={it.labelAr} />
                    </span>
                    <span className="bd">{it.bd || ''}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="rt-sb-foot">
          <div className="av">{userInitials}</div>
          <div className="who">
            {displayName}
            <span className="e">
              <Bi en="Renter account" ar="حساب مستأجر" />
            </span>
          </div>
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/auth' }}>
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`rt-backdrop${navOpen ? ' on' : ''}`}
        id="rt-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        {/* ── Topbar (inlined from renter-shell.js) ────────────────── */}
        <header className="rt-tb" id="rt-tb" data-crumb="Overview">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            type="button"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>{displayWorkspace}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="Overview" ar="نظرة عامة" />
            </span>
          </div>
          <span className="pill">
            <span
              className="d"
              style={
                dataState === 'ready'
                  ? undefined
                  : { background: 'var(--mut)', animation: 'none' }
              }
            />{' '}
            {dataState === 'ready' ? (
              <Bi en="API live" ar="الواجهة تعمل" />
            ) : dataState === 'loading' ? (
              <Bi en="API connecting" ar="جارٍ الاتصال" />
            ) : (
              <Bi en="API offline" ar="الواجهة غير متصلة" />
            )}
          </span>
          <button
            className="lang-pill"
            type="button"
            onClick={toggle}
            aria-label="Toggle language"
          >
            <span style={{ background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>
              EN
            </span>
            <span style={{ background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>
              ع
            </span>
          </button>
          <Link className="keys" href="/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="Welcome back, " ar="مرحباً بعودتك، " />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              {displayName}.
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en={`${activeJobs.length} running now`} ar={`${activeJobs.length} قيد التشغيل الآن`} />
            </span>
            <span>
              <Bi en="Credit" ar="الرصيد" />{' '}
              <b>{balanceSar != null ? <Bi en={`${balanceSar.toFixed(2)} credit`} ar={`${balanceSar.toFixed(2)} رصيد`} /> : '—'}</b>
            </span>
            <span>
              <Bi en="Scoped keys live on the keys page" ar="المفاتيح محددة النطاق في صفحة المفاتيح" />
            </span>
          </div>

          {dataState === 'missing-key' && (
            <div className="dash-state err" style={{ marginTop: 24 }}>
              <Bi
                en="Sign in with a renter key to load balance, live jobs, and quick actions."
                ar="سجّل الدخول بمفتاح مستأجر لتحميل الرصيد والمهام الحية والإجراءات السريعة."
              />{' '}
              <Link href="/auth?role=renter&method=apikey&redirect=/renter/dashboard">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {dataState === 'error' && (
            <div className="dash-state err" style={{ marginTop: 24 }} role="alert">
              {dataError}
            </div>
          )}

          {/* KPI row — runway, not spend. (Spend history lives in Usage + Wallet.) */}
          <div className="kpi-row" style={{ marginTop: 36 }}>
            <div className="kpi featured">
              <span className="k">
                <Bi en="Credit" ar="الرصيد" />
              </span>
              <span className="v">
                {balanceSar != null ? (
                  <>
                    <Bi en={`Credit ${numFmt.format(Math.floor(balanceSar))}`} ar={`رصيد ${numFmt.format(Math.floor(balanceSar))}`} />
                    <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d flat">
                <Bi
                  en={`${activeJobs.length > 0 ? `SAR ${heldSar.toFixed(2)} held` : 'Nothing held'} · your runway`}
                  ar={`${activeJobs.length > 0 ? `محجوز SAR ${heldSar.toFixed(2)}` : 'لا شيء محجوز'} · رصيدك`}
                />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Active pods" ar="الحاويات النشطة" />
              </span>
              <span className="v">
                {activePodCount != null ? activePodCount : '—'}
                <span className="u"> / {MAX_ACTIVE_PODS}</span>
              </span>
              <span className="d flat">
                <Bi
                  en={activePodCount ? `${liveJobs.length} live jobs` : 'none running'}
                  ar={activePodCount ? `${liveJobs.length} مهام حية` : 'لا شيء يعمل'}
                />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="GPU in use" ar="المعالج المستخدم" />
              </span>
              <span className="v" style={{ fontSize: gpusInUse.length > 0 ? '1.4rem' : undefined }}>
                {gpusInUse.length > 0 ? (
                  <>
                    {gpusInUse[0]}
                    {gpusInUse.length > 1 && <span className="u"> +{gpusInUse.length - 1}</span>}
                  </>
                ) : (
                  <span className="u">—</span>
                )}
              </span>
              <span className="d flat">
                <Bi en={gpusInUse.length > 0 ? 'serving now' : 'idle'} ar={gpusInUse.length > 0 ? 'يخدم الآن' : 'خامل'} />
              </span>
            </div>
            <div className="kpi">
              <span className="k">
                <Bi en="Jobs · account" ar="المهام · الحساب" />
              </span>
              <span className="v">
                {totalJobs != null ? totalJobs.toLocaleString('en-US') : '—'}
                <span className="u">jobs</span>
              </span>
              <span className="d flat">
                <Link href="/renter/wallet" style={{ color: 'var(--mut)', textDecoration: 'none', borderBottom: '1px solid var(--hair)' }}>
                  <Bi en="Spend & invoices → Wallet" ar="الإنفاق والفواتير ← المحفظة" />
                </Link>
              </span>
            </div>
          </div>

          <section className={`platform-readiness ${platformState}`} aria-label={lang === 'ar' ? 'جاهزية منصة DCP' : 'Platform readiness'}>
            <div className="platform-readiness-head">
              <div>
                <span className="platform-eyebrow">
                  <Bi en="Fireworks/Tinker rails" ar="مسارات Fireworks/Tinker" />
                </span>
                <h2>
                  <Bi en="Platform readiness" ar="جاهزية المنصة" />
                </h2>
                <p>
                  <Bi
                    en="One board for the connected DCP product: inference, prompt cache, Batch, LoRA/adapters, and Pods."
                    ar="لوحة واحدة لمسارات DCP: الاستدلال، التخزين المؤقت، الدُفعات، LoRA، والحاويات."
                  />
                </p>
              </div>
              <span className={`platform-state ${platformState}`}>
                <Bi en={platformStateLabel} ar={platformState === 'ready' ? 'العقود متزامنة' : 'جار الفحص'} />
              </span>
            </div>
            <div className="platform-rail-grid">
              {platformRails.map((rail) => (
                <Link key={rail.key} href={rail.href} className={`platform-rail ${rail.tone}`}>
                  <span><Bi en={rail.labelEn} ar={rail.labelAr} /></span>
                  <strong><Bi en={rail.statusEn} ar={rail.statusAr} /></strong>
                  <em><Bi en={rail.detailEn} ar={rail.detailAr} /></em>
                  <code>{rail.contract}</code>
                </Link>
              ))}
            </div>
            <div className="platform-proof-row">
              <span>
                <Bi
                  en="No billing, routing, training, discount, or launch mutation happens from this dashboard."
                  ar="لا تغيّر هذه اللوحة الفوترة أو التوجيه أو التدريب أو الخصومات أو التشغيل."
                />
              </span>
              <Link href="/fine-tuning">
                <Bi en="Public fine-tuning page" ar="صفحة الضبط العامة" />
              </Link>
              <Link href="/batch">
                <Bi en="Public Batch page" ar="صفحة الدُفعات العامة" />
              </Link>
              <Link href="/dedicated-deployments">
                <Bi en="Dedicated endpoints" ar="نقاط النهاية المخصصة" />
              </Link>
            </div>
          </section>

          {/* Quick actions + Live jobs */}
          <div className="two-col" style={{ marginTop: 28 }}>
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Quick actions" ar="إجراءات سريعة" />
                  </h3>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                <Link className="btn-pri" href="/renter/pods" style={{ textAlign: 'center' }}>
                  <Bi en="▦ Launch a GPU pod" ar="▦ تشغيل حاوية GPU" />
                </Link>
                <Link className="btn-sec" href="/renter/pods" style={{ textAlign: 'center' }}>
                  <Bi en="Manage pods · extend · stop" ar="إدارة الحاويات · تمديد · إيقاف" />
                </Link>
                <Link className="btn-sec" href="/renter/playground" style={{ textAlign: 'center' }}>
                  <Bi en="▷ Open Playground" ar="▷ افتح البيئة التجريبية" />
                </Link>
                <Link className="btn-sec" href="/renter/wallet#top-up" style={{ textAlign: 'center' }}>
                  <Bi en="Add credit" ar="إضافة رصيد" />
                </Link>
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--hair)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--mut)',
                }}
              >
                <Bi
                  en="What's running and how much runway you have — at a glance."
                  ar="ما الذي يعمل وكم لديك من رصيد — في لمحة."
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <div>
                  <h3>
                    <Bi en="Live jobs" ar="المهام الحية" />
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mut)',
                  }}
                >
                  <Bi en={`${activeJobs.length} active`} ar={`${activeJobs.length} نشطة`} />
                </span>
              </div>
              <div className="live-jobs" id="live">
                {liveJobs.length > 0 ? (
                  liveJobs.map((j) => (
                    <div className="lj-row" key={j.requestId}>
                      <div className="body">
                        <div className="nm">{j.model}</div>
                        <div className="sub">
                          {j.providerGpu} ·{' '}
                          <span className={`stat ${j.status}`}>{j.status}</span> ·{' '}
                          {(j.tokensGenerated ?? 0).toLocaleString()} tok
                        </div>
                      </div>
                      <div className="right">
                        <div className="sar">SAR {halToSar(j.costHalala ?? 0).toFixed(2)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-row">
                    <Bi en="No active or recent inference jobs for this renter key." ar="لا توجد مهام استدلال نشطة أو حديثة لهذا المفتاح." />
                  </div>
                )}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--hair)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--mut)',
                }}
              >
                <span>
                  <Bi en="Updates every 2s" ar="يتحدّث كل ثانيتين" />
                </span>
                <Link
                  href="/renter/usage"
                  style={{
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink)',
                    paddingBottom: '2px',
                    textDecoration: 'none',
                  }}
                >
                  <Bi en="Full usage →" ar="الاستخدام الكامل ←" />
                </Link>
              </div>
            </div>
          </div>

          {/* Quick start */}
          <div className="quickstart">
            <h3>
              <Bi en="Quick start · ship in 3 lines" ar="بداية سريعة · انطلق في ٣ أسطر" />
            </h3>
            <div className="qs-tabs">
              <button type="button" className={qsTab === 'curl' ? 'on' : ''} onClick={() => setQsTab('curl')}>
                cURL
              </button>
              <button type="button" className={qsTab === 'py' ? 'on' : ''} onClick={() => setQsTab('py')}>
                Python
              </button>
              <button type="button" className={qsTab === 'node' ? 'on' : ''} onClick={() => setQsTab('node')}>
                Node
              </button>
            </div>

            <div className={`qs-body${qsTab === 'curl' ? ' on' : ''}`} data-t="curl">
              <pre className="code">
                <span className="c"># Chat completion · in-Kingdom · pay per token</span>
                {'\n'}$ <span className="k">curl</span>{' '}
                <span className="s">https://api.dcp.sa/v1/chat/completions</span> \{'\n'}
                {'   '}
                <span className="k">-H</span>{' '}
                <span className="s">&quot;Authorization: Bearer $DCP_KEY&quot;</span> \{'\n'}
                {'   '}
                <span className="k">-d</span>{' '}
                <span className="s">
                  {'\'{"model":"qwen2.5:7b","messages":[{"role":"user","content":"اشرح لي زكاة المال"}]}\''}
                </span>
              </pre>
            </div>

            <div className={`qs-body${qsTab === 'py' ? ' on' : ''}`} data-t="py">
              <pre className="code">
                <span className="k">import</span> os
                {'\n'}<span className="k">from</span> openai <span className="k">import</span> OpenAI
                {'\n\n'}client = <span className="n">OpenAI</span>(
                {'\n    '}base_url=<span className="s">&quot;https://api.dcp.sa/v1&quot;</span>,
                {'\n    '}api_key=<span className="s">os.environ[&quot;DCP_KEY&quot;]</span>,
                {'\n'})
                {'\n\n'}resp = client.chat.completions.create(
                {'\n    '}model=<span className="s">&quot;qwen2.5:7b&quot;</span>,
                {'\n    '}messages=[{'{'}
                <span className="s">&quot;role&quot;</span>: <span className="s">&quot;user&quot;</span>,{' '}
                <span className="s">&quot;content&quot;</span>:{' '}
                <span className="s">&quot;اشرح لي زكاة المال&quot;</span>
                {'}'}],
                {'\n'})
                {'\n'}
                <span className="n">print</span>(resp.choices[<span className="k">0</span>].message.content)
              </pre>
            </div>

            <div className={`qs-body${qsTab === 'node' ? ' on' : ''}`} data-t="node">
              <pre className="code">
                <span className="k">import</span> OpenAI <span className="k">from</span>{' '}
                <span className="s">&quot;openai&quot;</span>;
                {'\n\n'}
                <span className="k">const</span> client = <span className="k">new</span>{' '}
                <span className="n">OpenAI</span>({'{'}
                {'\n  '}baseURL: <span className="s">&quot;https://api.dcp.sa/v1&quot;</span>,
                {'\n  '}apiKey: process.env.DCP_KEY,
                {'\n'}
                {'}'});
                {'\n\n'}
                <span className="k">const</span> resp = <span className="k">await</span>{' '}
                client.chat.completions.create({'{'}
                {'\n  '}model: <span className="s">&quot;qwen2.5:7b&quot;</span>,
                {'\n  '}messages: [{'{'} role: <span className="s">&quot;user&quot;</span>, content:{' '}
                <span className="s">&quot;اشرح لي زكاة المال&quot;</span> {'}'}],
                {'\n'}
                {'}'});
              </pre>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn-pri" href="/renter/playground">
                <Bi en="Open Playground →" ar="افتح البيئة التجريبية ←" />
              </Link>
              <Link className="btn-sec" href="/renter/keys">
                <Bi en="Get an API key" ar="احصل على مفتاح API" />
              </Link>
              <Link className="btn-sec" href="/docs" target="_blank" rel="noopener noreferrer">
                <Bi en="Read the docs" ar="اقرأ التوثيق" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
