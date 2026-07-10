'use client'

// /pricing — DCP pricing. Two billing models: pay-as-you-go (per million tokens
// for inference, per GPU-second for pods) and optional monthly subscriptions.
// Reuses the home design system (home.css) + docs chrome (docs.css). Pattern A.
// All numbers mirror app/lib/structured-data.ts (GPU_SKUS + PRICING_FAQ) — the
// single source of truth — so the page and the JSON-LD can never drift.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX, useV2 } from '@/app/(site)/lib/i18n'
import { PRICING_FAQ } from '@/app/lib/structured-data'
import { PodMeter } from '@/app/(site)/components/pod-meter/PodMeter'
import '../(home)/home.css'
import '../docs/docs.css'

// Per-token inference rates by model class (halala per 1M tokens).
// 100 halala = 1 SAR. Source of truth: structured-data PRICING_FAQ.
const TOKEN_CLASSES: ReadonlyArray<{ cEn: string; cAr: string; hal: number }> = [
  { cEn: 'Embedding', cAr: 'تضمين', hal: 5 },
  { cEn: 'Tiny', cAr: 'صغير جداً', hal: 15 },
  { cEn: 'Small', cAr: 'صغير', hal: 30 },
  { cEn: 'Medium', cAr: 'متوسط', hal: 150 },
  { cEn: 'Large', cAr: 'كبير', hal: 400 },
]

// On-demand GPU rental — mirrors GPU_SKUS in structured-data.ts exactly.
const GPU_ROWS: ReadonlyArray<{ model: string; vram: number; sar: number }> = [
  { model: 'NVIDIA H200', vram: 141, sar: 23.05 },
  { model: 'NVIDIA H100', vram: 80, sar: 17.27 },
  { model: 'NVIDIA A100', vram: 80, sar: 7.3 },
  { model: 'NVIDIA L40S', vram: 48, sar: 5.2 },
  { model: 'NVIDIA RTX 5090', vram: 32, sar: 5.2 },
  { model: 'NVIDIA RTX 4090', vram: 24, sar: 3.62 },
  { model: 'NVIDIA RTX 3090', vram: 24, sar: 2.5 },
]

const SUBS: ReadonlyArray<{ nameEn: string; nameAr: string; sar: number; pctEn: string; pctAr: string; perksEn: string[]; perksAr: string[] }> = [
  {
    nameEn: 'Starter', nameAr: 'المبتدئ', sar: 375, pctEn: '15% off', pctAr: 'خصم ١٥٪',
    perksEn: ['Discounted token allowance', 'Per-second pod billing', 'Email support'],
    perksAr: ['بدل رموز بخصم', 'فوترة الحاويات بالثانية', 'دعم بالبريد'],
  },
  {
    nameEn: 'Growth', nameAr: 'النمو', sar: 1500, pctEn: '22% off', pctAr: 'خصم ٢٢٪',
    perksEn: ['Larger discounted allowance', 'Priority pod scheduling', 'Workspace sharing'],
    perksAr: ['بدل أوسع بخصم', 'جدولة حاويات بأولوية', 'مشاركة مساحة العمل'],
  },
  {
    nameEn: 'Scale', nameAr: 'الحجم', sar: 5625, pctEn: '30% off', pctAr: 'خصم ٣٠٪',
    perksEn: ['Max discounted allowance', 'Reserved capacity option', 'Dedicated CSM'],
    perksAr: ['بدل بخصم أعلى', 'خيار سعة محجوزة', 'مدير حساب مخصص'],
  },
]

type LiveCatalogState = 'loading' | 'ready' | 'empty' | 'error'
type AdvancedFeatureKey = 'prompt_caching' | 'batch' | 'lora' | 'dedicated_deployment'

interface FeatureReadinessRaw {
  status?: string
  available?: boolean
  next?: string
  [key: string]: unknown
}

interface AdvancedFeatureDefinition {
  key: AdvancedFeatureKey
  labelEn: string
  labelAr: string
  blockedEn: string
  blockedAr: string
}

interface AdvancedFeatureReadiness {
  key: AdvancedFeatureKey
  status: string
  available: boolean
  next?: string
}

interface AdvancedReadinessSummary {
  key: AdvancedFeatureKey
  labelEn: string
  labelAr: string
  status: string
  availableCount: number
  applicableCount: number
  next?: string
  blockedEn: string
  blockedAr: string
}

interface LiveCatalogModelRaw {
  id?: string
  model_id?: string
  name?: string
  display_name?: string
  available?: boolean
  status?: string
  provider_count?: number
  context_length?: number
  context_window?: number
  max_output_tokens?: number
  max_vram_gb?: number
  pricing?: {
    sar_per_1m_input_tokens?: string | number
    sar_per_1m_output_tokens?: string | number
    source?: string
    contract?: PricingContractRaw
  }
  capability_flags?: {
    streaming?: boolean
    reasoning?: boolean
    tool_calling?: boolean
    code_generation?: boolean
    multilingual?: boolean
  }
  capabilities?: LiveCatalogModelRaw['capability_flags']
  feature_readiness?: {
    version?: string
    prompt_caching?: FeatureReadinessRaw
    batch?: FeatureReadinessRaw
    lora?: FeatureReadinessRaw
    dedicated_deployment?: FeatureReadinessRaw
  }
}

interface PricingContractRaw {
  version?: string
  currency?: string
  billing_unit?: string
  source?: string
  source_contract?: string
  usd_display_only?: boolean
}

interface LiveCatalogModel {
  id: string
  name: string
  status: string
  providerCount: number
  contextLength?: number
  maxOutputTokens?: number
  maxVramGb?: number
  inputSarPer1m?: string | number
  outputSarPer1m?: string | number
  pricingSource?: string
  pricingContractVersion?: string
  pricingSourceContract?: string
  pricingUsdDisplayOnly?: boolean
  featureLabels: string[]
  readinessVersion?: string
  advancedReadiness: AdvancedFeatureReadiness[]
}

const ADVANCED_FEATURES: AdvancedFeatureDefinition[] = [
  {
    key: 'prompt_caching',
    labelEn: 'Prompt cache',
    labelAr: 'تخزين المطالبات',
    blockedEn: 'Discounts gated',
    blockedAr: 'الخصومات مقيدة',
  },
  {
    key: 'batch',
    labelEn: 'Batch API',
    labelAr: 'واجهة الدُفعات',
    blockedEn: 'Execution gated',
    blockedAr: 'التنفيذ مقيد',
  },
  {
    key: 'lora',
    labelEn: 'LoRA',
    labelAr: 'LoRA',
    blockedEn: 'Serving gated',
    blockedAr: 'الخدمة مقيدة',
  },
  {
    key: 'dedicated_deployment',
    labelEn: 'Dedicated deployments',
    labelAr: 'النشر المخصص',
    blockedEn: 'Load proof required',
    blockedAr: 'إثبات التحميل مطلوب',
  },
]

function formatCompactNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  return value.toLocaleString('en-US')
}

function formatSarPerMillion(value: string | number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `SAR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return '-'
  return value.replace(/_/g, ' ')
}

function formatReadinessStatus(value: string | null | undefined): string {
  if (!value) return 'not reported'
  return value.replace(/_/g, ' ')
}

function featureLabelsFor(model: LiveCatalogModelRaw): string[] {
  const flags = model.capability_flags || model.capabilities || {}
  return [
    flags.streaming ? 'Streaming' : null,
    flags.tool_calling ? 'Tools' : null,
    flags.reasoning ? 'Reasoning' : null,
    flags.code_generation ? 'Code' : null,
    flags.multilingual ? 'Multilingual' : null,
  ].filter(Boolean) as string[]
}

function advancedReadinessFor(model: LiveCatalogModelRaw): AdvancedFeatureReadiness[] {
  const readiness = model.feature_readiness || {}
  const rows: AdvancedFeatureReadiness[] = []
  for (const feature of ADVANCED_FEATURES) {
    const raw = readiness[feature.key]
    if (!raw || typeof raw !== 'object') continue
    const row: AdvancedFeatureReadiness = {
      key: feature.key,
      status: String(raw.status || 'not_reported'),
      available: raw.available === true,
    }
    if (typeof raw.next === 'string') row.next = raw.next
    rows.push(row)
  }
  return rows
}

function summarizeAdvancedReadiness(models: LiveCatalogModel[]): AdvancedReadinessSummary[] {
  return ADVANCED_FEATURES.map((definition) => {
    const rows = models
      .map((model) => model.advancedReadiness.find((feature) => feature.key === definition.key))
      .filter((feature): feature is AdvancedFeatureReadiness => !!feature && feature.status !== 'not_applicable')
    const statusCounts = new Map<string, number>()
    rows.forEach((row) => statusCounts.set(row.status, (statusCounts.get(row.status) || 0) + 1))
    const primaryStatus = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'not_reported'
    const availableCount = rows.filter((row) => row.available).length
    return {
      ...definition,
      status: availableCount > 0 ? 'partially_available' : primaryStatus,
      availableCount,
      applicableCount: rows.length,
      next: rows.find((row) => row.next)?.next,
    }
  })
}

function mapLiveCatalogModels(raw: LiveCatalogModelRaw[]): LiveCatalogModel[] {
  return raw
    .filter((model) => Number(model.provider_count || 0) > 0)
    .map((model) => {
      const contextLength = Number(model.context_length ?? model.context_window)
      const maxOutputTokens = Number(model.max_output_tokens)
      const maxVramGb = Number(model.max_vram_gb)
      return {
        id: model.id || model.model_id || '',
        name: model.name || model.display_name || model.id || model.model_id || '',
        status: model.status || (model.available ? 'available' : 'unknown'),
        providerCount: Number(model.provider_count || 0),
        contextLength: Number.isFinite(contextLength) ? contextLength : undefined,
        maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : undefined,
        maxVramGb: Number.isFinite(maxVramGb) ? maxVramGb : undefined,
        inputSarPer1m: model.pricing?.sar_per_1m_input_tokens,
        outputSarPer1m: model.pricing?.sar_per_1m_output_tokens,
        pricingSource: model.pricing?.source,
        pricingContractVersion: model.pricing?.contract?.version,
        pricingSourceContract: model.pricing?.contract?.source_contract,
        pricingUsdDisplayOnly: model.pricing?.contract?.usd_display_only,
        featureLabels: featureLabelsFor(model),
        readinessVersion: model.feature_readiness?.version,
        advancedReadiness: advancedReadinessFor(model),
      }
    })
    .filter((model) => model.id)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function PricingPage() {
  const { toggle, lang } = useV2()
  const [liveState, setLiveState] = useState<LiveCatalogState>('loading')
  const [liveModels, setLiveModels] = useState<LiveCatalogModel[]>([])
  const visibleLiveModels = useMemo(() => liveModels.slice(0, 12), [liveModels])
  const advancedReadiness = useMemo(() => summarizeAdvancedReadiness(liveModels), [liveModels])
  const readinessVersion = liveModels.find((model) => model.readinessVersion)?.readinessVersion || 'dcp.model_feature_readiness.v1'
  const pricingContractVersion = liveModels.find((model) => model.pricingContractVersion)?.pricingContractVersion || 'dcp.model_token_pricing.v1'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLiveState('loading')
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`)
        const data: unknown = await res.json()
        const raw = (() => {
          if (Array.isArray(data)) return data as LiveCatalogModelRaw[]
          const obj = data as { data?: unknown; models?: unknown }
          if (Array.isArray(obj.data)) return obj.data as LiveCatalogModelRaw[]
          if (Array.isArray(obj.models)) return obj.models as LiveCatalogModelRaw[]
          return []
        })()
        const mapped = mapLiveCatalogModels(raw)
        if (cancelled) return
        setLiveModels(mapped)
        setLiveState(mapped.length > 0 ? 'ready' : 'empty')
      } catch {
        if (cancelled) return
        setLiveModels([])
        setLiveState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <SiteHeader active="/pricing" />

      {/* ─── Hero ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Pricing · cost-plus · SAR" ar="§ الأسعار · تكلفة + هامش · ريال" /></span>
            <span><Bi en="Per token · per GPU-second · subscriptions" ar="بالرمز · بثانية المعالج · اشتراكات" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(40px, 6vw, 84px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: '24px 0 0', textWrap: 'balance' }}>
            <BiX
              en={<>Pay for what you use. <em style={{ fontStyle: 'italic', backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>Refunded when you stop.</em></>}
              ar={<>ادفع مقابل ما تستخدم. <em style={{ backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>يُسترد عند الإيقاف.</em></>}
            />
          </h1>
          <p className="lead" style={{ color: 'var(--ink-2)', fontSize: 18, lineHeight: 1.55, maxWidth: '62ch', margin: '22px 0 0' }}>
            <Bi
              en="No procurement, no quota, no flat monthly GPU. Inference is billed per million tokens; pods are billed per GPU-second, cost-plus from the live market, and the unused time is refunded the instant you stop. Everything is priced in Saudi Riyal, shown before you commit."
              ar="بلا مشتريات، بلا حصة، بلا إيجار شهري ثابت. الاستدلال يُفوتر لكل مليون رمز؛ والحاويات تُفوتر بثانية المعالج، تكلفة + هامش من السوق الحي، ويُسترد الوقت غير المستخدم لحظة إيقافك. كل شيء بالريال السعودي، يُعرض قبل التزامك."
            />
          </p>
        </div>
      </section>

      {/* ─── Snapshot cards ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <div className="ps-grid">
            <div className="ps-it">
              <span className="sub"><Bi en="Inference API" ar="واجهة الاستدلال" /></span>
              <span className="nm"><Bi en="Per million tokens" ar="لكل مليون رمز" /></span>
              <span className="pr">5<span className="u"><Bi en="halala / 1M from" ar="هللة / مليون من" /></span></span>
              <span className="sub"><Bi en="api.dcp.sa/v1 · OpenAI-compatible" ar="api.dcp.sa/v1 · متوافق مع OpenAI" /></span>
            </div>
            <div className="ps-it">
              <span className="sub"><Bi en="GPU Pods" ar="حاويات GPU" /></span>
              <span className="nm"><Bi en="Per GPU-second" ar="بثانية المعالج" /></span>
              <span className="pr">2.5<span className="u"><Bi en="SAR / hr from" ar="ريال / ساعة من" /></span></span>
              <span className="sub"><Bi en="Refunded on stop · root + SSH + Jupyter" ar="يُسترد عند الإيقاف · جذر + SSH + Jupyter" /></span>
            </div>
            <div className="ps-it">
              <span className="sub"><Bi en="New accounts" ar="الحسابات الجديدة" /></span>
              <span className="nm"><Bi en="Starter credit" ar="رصيد البداية" /></span>
              <span className="pr">100<span className="u"><Bi en="SAR · no card" ar="ريال · بلا بطاقة" /></span></span>
              <span className="sub"><Bi en="Fund later in Saudi Riyal" ar="ادفع لاحقاً بالريال السعودي" /></span>
            </div>
            <div className="ps-it frontier">
              <span className="sub"><Bi en="Subscriptions" ar="الاشتراكات" /></span>
              <span className="nm"><Bi en="Monthly plans" ar="خطط شهرية" /></span>
              <span className="pr">375<span className="u"><Bi en="SAR / mo from" ar="ريال / شهر من" /></span></span>
              <span className="sub"><Bi en="Discounted token allowance" ar="بدل رموز بخصم" /></span>
            </div>
          </div>
          {/* feel the billing model instead of reading it */}
          <PodMeter />
        </div>
      </section>

      {/* ─── Per-token inference rates by class ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Inference · per 1M tokens" ar="§ الاستدلال · لكل مليون رمز" /></span>
            <span><Bi en="100 halala = 1 SAR" ar="١٠٠ هللة = ١ ريال" /></span>
          </div>
          <div className="mp-live" style={{ marginTop: 18 }}>
            <div className="mp-live-head">
              <span><Bi en="Rate by model class — halala per 1 million tokens" ar="السعر حسب فئة النموذج — هللة لكل مليون رمز" /></span>
              <span><Bi en="Halala = 1/100 SAR" ar="الهللة = ١/١٠٠ ريال" /></span>
            </div>
            <div className="mp-rows">
              <div className="mp-row mp-row-head" aria-hidden="true">
                <span><Bi en="Model class" ar="فئة النموذج" /></span>
                <span><Bi en="Example" ar="مثال" /></span>
                <span><Bi en="In / out" ar="دخول / خروج" /></span>
                <span><Bi en="Halala / 1M" ar="هللة / مليون" /></span>
              </div>
              {TOKEN_CLASSES.map((t) => (
                <div className="mp-row" key={t.cEn}>
                  <span className="mp-model">
                    <b><Bi en={t.cEn} ar={t.cAr} /></b>
                  </span>
                  <span><Bi en={t.cEn === 'Embedding' ? 'embeddings' : t.cEn === 'Large' ? 'DeepSeek V4 Pro' : 'chat model'} ar={t.cEn === 'Embedding' ? 'تضمين' : t.cEn === 'Large' ? 'DeepSeek V4 Pro' : 'نموذج محادثة'} /></span>
                  <span>—</span>
                  <span>{t.hal}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 12, fontFamily: 'var(--mono)' }}>
            <Bi en="Each chat-completion response also returns per-call usage pricing in USD and SAR." ar="كل استجابة محادثة تعرض أيضاً سعر الاستخدام بالدولار والريال." />
          </p>

          <div className="mp-live pricing-live-catalog" style={{ marginTop: 24 }}>
            <div className="mp-live-head">
              <span><Bi en="Live API catalog — from /v1/models" ar="كتالوج الواجهة المباشر — من /v1/models" /></span>
              <span><Bi en={liveState === 'ready' ? `${liveModels.length} serveable models · ${pricingContractVersion}` : 'checking live catalog'} ar={liveState === 'ready' ? `${liveModels.length} نموذجاً قابلاً للخدمة · ${pricingContractVersion}` : 'جارٍ فحص الكتالوج المباشر'} /></span>
            </div>
            <div className="mp-rows">
              <div className="mp-row mp-row-head" aria-hidden="true">
                <span><Bi en="Model" ar="النموذج" /></span>
                <span><Bi en="Context" ar="السياق" /></span>
                <span><Bi en="Input / 1M" ar="الإدخال / 1M" /></span>
                <span><Bi en="Output / 1M" ar="الإخراج / 1M" /></span>
              </div>
              {liveState === 'loading' && (
                <div className="mp-empty">
                  <span><Bi en="Loading live model pricing..." ar="تحميل تسعير النماذج المباشر..." /></span>
                </div>
              )}
              {liveState === 'error' && (
                <div className="mp-empty">
                  <span><Bi en="Live model pricing is temporarily unavailable." ar="تسعير النماذج المباشر غير متاح مؤقتاً." /></span>
                  <Link href="/renter/playground"><Bi en="Open playground" ar="افتح ساحة التجربة" /></Link>
                </div>
              )}
              {liveState === 'empty' && (
                <div className="mp-empty">
                  <span><Bi en="No serveable models are advertised right now." ar="لا توجد نماذج قابلة للخدمة معلنة حالياً." /></span>
                </div>
              )}
              {liveState === 'ready' && visibleLiveModels.map((model) => (
                <div className="mp-row pricing-live-row" key={model.id}>
                  <span className="mp-model">
                    <b>{model.name}</b>
                    <i>{model.id} · {formatStatus(model.status)} · {model.providerCount} live · {model.pricingSource || 'catalog'} · {model.pricingContractVersion || 'pricing contract pending'}</i>
                    {model.pricingSourceContract && (
                      <i>{model.pricingSourceContract}{model.pricingUsdDisplayOnly ? ' · USD display only' : ''}</i>
                    )}
                    {model.featureLabels.length > 0 && (
                      <span className="pricing-chip-row">
                        {model.featureLabels.map((feature) => <em key={feature}>{feature}</em>)}
                      </span>
                    )}
                  </span>
                  <span>
                    {formatCompactNumber(model.contextLength)} tok
                    <i>{model.maxOutputTokens ? `${formatCompactNumber(model.maxOutputTokens)} max out` : 'max out n/a'}</i>
                  </span>
                  <span>{formatSarPerMillion(model.inputSarPer1m)}</span>
                  <span>{formatSarPerMillion(model.outputSarPer1m)}</span>
                </div>
              ))}
            </div>
            {liveState === 'ready' && liveModels.length > visibleLiveModels.length && (
              <div className="mp-empty pricing-live-foot">
                <span><Bi en={`Showing ${visibleLiveModels.length} of ${liveModels.length} serveable models.`} ar={`عرض ${visibleLiveModels.length} من ${liveModels.length} نموذجاً قابلاً للخدمة.`} /></span>
                <Link href="/renter/playground"><Bi en="Open playground" ar="افتح ساحة التجربة" /></Link>
              </div>
            )}
          </div>

          {liveState === 'ready' && (
            <div className="pricing-readiness-rail" aria-label={lang === 'ar' ? 'جاهزية ميزات النماذج المتقدمة' : 'Advanced model feature readiness'}>
              <div className="pricing-readiness-head">
                <div>
                  <span className="pricing-readiness-k">
                    <Bi en="Advanced readiness — from /v1/models feature_readiness" ar="جاهزية متقدمة — من /v1/models feature_readiness" />
                  </span>
                  <strong>
                    <Bi en="Rates are live; advanced economics stay gated until proof closes" ar="الأسعار مباشرة؛ اقتصاديات الميزات المتقدمة مقيدة حتى اكتمال الإثبات" />
                  </strong>
                </div>
                <span className="pricing-readiness-version">{readinessVersion}</span>
              </div>
              <div className="pricing-readiness-grid">
                {advancedReadiness.map((feature) => (
                  <div className={`pricing-readiness-card${feature.availableCount > 0 ? ' live' : ' gated'}`} key={feature.key}>
                    <span className="pricing-readiness-card-k">
                      <Bi en={feature.labelEn} ar={feature.labelAr} />
                    </span>
                    <strong>{formatReadinessStatus(feature.status)}</strong>
                    <span>
                      {feature.applicableCount > 0
                        ? <Bi en={`${feature.applicableCount} serveable models covered`} ar={`${feature.applicableCount} نموذجاً قابلاً للخدمة مشمولاً`} />
                        : <Bi en="No serveable model coverage yet" ar="لا توجد تغطية لنموذج قابل للخدمة بعد" />}
                    </span>
                    <em>
                      <Bi en={feature.availableCount > 0 ? `${feature.availableCount} available` : feature.blockedEn} ar={feature.availableCount > 0 ? `${feature.availableCount} متاح` : feature.blockedAr} />
                    </em>
                    {feature.next && <small>{feature.next}</small>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── GPU rental grid ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ GPU Pods · per GPU-second · cost-plus" ar="§ الحاويات · بثانية المعالج · تكلفة + هامش" /></span>
            <span><Bi en="Refreshed every few minutes" ar="يتحدّث كل بضع دقائق" /></span>
          </div>
          <div className="mp-live" style={{ marginTop: 18 }}>
            <div className="mp-live-head">
              <span><Bi en="On-demand GPU types — indicative SAR / hour, from" ar="أنواع معالجات عند الطلب — ريال / ساعة إرشادي، من" /></span>
              <span><Bi en="Billed per second · refunded on stop" ar="بالثانية · يُسترد عند الإيقاف" /></span>
            </div>
            <div className="mp-rows">
              <div className="mp-row mp-row-head" aria-hidden="true">
                <span><Bi en="GPU" ar="المعالج" /></span>
                <span><Bi en="VRAM" ar="الذاكرة" /></span>
                <span><Bi en="SAR / hr from" ar="ريال / ساعة من" /></span>
              </div>
              {GPU_ROWS.map((g) => (
                <div className="mp-row" key={g.model}>
                  <span className="mp-model"><b>{g.model}</b></span>
                  <span>{g.vram} GB</span>
                  <span>{g.sar.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 12, fontFamily: 'var(--mono)' }}>
            <Bi
              en="GPU pod prices are cost-plus from the live market and refresh every few minutes; the rate at launch is the rate you pay for that pod."
              ar="أسعار الحاويات تكلفة + هامش من السوق الحي وتتحدّث كل بضع دقائق؛ السعر عند الإطلاق هو ما تدفعه لتلك الحاوية."
            />
          </p>
          <div className="ctas" style={{ marginTop: 20 }}>
            <Link className="btn primary" href="/pods">
              <Bi en="See GPU pods →" ar="راجع الحاويات ←" />
            </Link>
            <Link className="btn ghost" href="/marketplace">
              <Bi en="Browse marketplace" ar="تصفّح السوق" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Subscription tiers ─── */}
      <section>
        <div className="wrap" style={{ paddingTop: 44 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Monthly subscriptions · optional" ar="§ اشتراكات شهرية · اختيارية" /></span>
            <span><Bi en="For steady-usage teams" ar="للفرق ذات الاستخدام المنتظم" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 18 }}>
            {SUBS.map((s) => (
              <article className="mg" key={s.nameEn}>
                <span className="org"><Bi en={s.nameEn} ar={s.nameAr} /></span>
                <h3 className="nm">{s.sar.toLocaleString()} <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--mut)' }}><Bi en="SAR / mo" ar="ريال / شهر" /></span></h3>
                <span className="tag"><Bi en={s.pctEn} ar={s.pctAr} /></span>
                <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.6 }}>
                  {s.perksEn.map((p, i) => (
                    <li key={p}><Bi en={p} ar={s.perksAr[i]} /></li>
                  ))}
                </ul>
                <div className="meta">
                  <span><Bi en="Discounted allowance" ar="بدل بخصم" /></span>
                  <Link href="/setup"><Bi en="Start →" ar="ابدأ ←" /></Link>
                </div>
              </article>
            ))}
            <article className="mg frontier">
              <span className="org"><Bi en="Enterprise" ar="المؤسسات" /></span>
              <h3 className="nm"><Bi en="Custom" ar="حسب الطلب" /></h3>
              <span className="tag"><Bi en="VPC · DPA · MSA" ar="VPC · DPA · MSA" /></span>
              <p>
                <Bi
                  en="Run it in your own VPC, with a DPA, MSA, and data-flow appendix. Dedicated capacity and a CSM."
                  ar="شغّله في بيئتك الخاصة، مع DPA وMSA وملحق تدفق البيانات. سعة مخصصة ومدير حساب."
                />
              </p>
              <div className="meta">
                <span><Bi en="Sovereignty preserved" ar="السيادة محفوظة" /></span>
                <Link href="/support"><Bi en="Talk to sales →" ar="تواصل مع المبيعات ←" /></Link>
              </div>
            </article>
          </div>
          <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 14, fontFamily: 'var(--mono)' }}>
            <Bi en="Pay-as-you-go remains the default — subscriptions are optional and do not lock you in. Unused subscription tokens do not roll over." ar="الدفع حسب الاستخدام يبقى الافتراضي — الاشتراكات اختيارية ولا تقيّدك. الرموز غير المستخدمة لا تتدحرج." />
          </p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq">
        <div className="wrap" style={{ paddingTop: 48 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ Pricing FAQ" ar="§ أسئلة الأسعار" /></span>
            <span><Bi en="Cost-plus · refunds · subscriptions" ar="تكلفة + هامش · استرداد · اشتراكات" /></span>
          </div>
          <div style={{ display: 'grid', gap: 0, marginTop: 14 }}>
            {PRICING_FAQ.map((f, i) => (
              <details key={`pf-${i}`} style={{ borderTop: '1px solid var(--hair)', padding: '18px 0' }} {...(i === 0 ? { open: true } : {})}>
                <summary style={{ cursor: 'pointer', fontSize: 18, fontWeight: 500, color: 'var(--ink)', listStyle: 'none' }}>{f.q}</summary>
                <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.7 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── End CTA ─── */}
      <section className="home-end">
        <div className="wrap">
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(32px, 4.5vw, 56px)', lineHeight: 1, letterSpacing: '-.02em', margin: 0, textWrap: 'balance' }}>
            <BiX
              en={<>Start with 100 SAR. <em>No card.</em></>}
              ar={<>ابدأ بـ١٠٠ ريال. <em>بلا بطاقة.</em></>}
            />
          </h2>
          <div className="ctas" style={{ marginTop: 28 }}>
            <Link className="btn primary lg" href="/setup">
              <Bi en="Start free →" ar="ابدأ مجاناً ←" />
            </Link>
            <Link className="btn ghost lg" href="/renter/playground">
              <Bi en="Open playground" ar="افتح ساحة التجربة" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
