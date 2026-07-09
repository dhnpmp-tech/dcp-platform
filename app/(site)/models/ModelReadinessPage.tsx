'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

type FetchState = 'loading' | 'ready' | 'error'
type FeatureKey = 'prompt_caching' | 'batch' | 'lora' | 'dedicated_deployment'

interface FeatureReadiness {
  status?: string
  available?: boolean
  next?: string
}

interface CatalogModel {
  id?: string
  name?: string
  display_name?: string
  available?: boolean
  status?: string
  provider_count?: number
  context_length?: number
  context_window?: number
  max_output_tokens?: number
  pricing?: {
    sar_per_1m_input_tokens?: string | number | null
    sar_per_1m_output_tokens?: string | number | null
    source?: string
  }
  token_pricing?: CatalogModel['pricing']
  capability_flags?: Record<string, boolean>
  capabilities?: Record<string, boolean>
  feature_readiness?: {
    version?: string
    prompt_caching?: FeatureReadiness
    batch?: FeatureReadiness
    lora?: FeatureReadiness
    dedicated_deployment?: FeatureReadiness
  }
}

interface CatalogResponse {
  data?: CatalogModel[]
}

interface BenchmarkReadiness {
  version?: string
  benchmark_suite?: string
  summary?: {
    live_measured_models?: number
    live_quality_rows?: number
    launch_ready_models?: number
    public_quality_claim_allowed?: boolean
  }
  claim_guards?: {
    arabic_quality_claim_allowed?: boolean
    public_ranking_allowed?: boolean
    customer_case_study_allowed?: boolean
    frontier_model_comparison_allowed?: boolean
  }
  next_actions?: string[]
}

export interface ModelPageConfig {
  slug: 'allam' | 'qwen-arabic'
  active: string
  matchTerms: string[]
  defaultModelId: string
  logoSrc: string
  logoAlt: string
  eyebrowEn: string
  eyebrowAr: string
  titleEn: string
  titleAr: string
  italicEn: string
  italicAr: string
  leadEn: string
  leadAr: string
  intentEn: string
  intentAr: string
  promptEn: string
  promptAr: string
}

const FEATURE_LABELS: ReadonlyArray<{ key: FeatureKey; en: string; ar: string }> = [
  { key: 'prompt_caching', en: 'Prompt cache', ar: 'تخزين المطالبات' },
  { key: 'batch', en: 'Batch API', ar: 'واجهة الدُفعات' },
  { key: 'lora', en: 'LoRA adapters', ar: 'محولات LoRA' },
  { key: 'dedicated_deployment', en: 'Dedicated deployments', ar: 'النشر المخصص' },
]

function modelTitle(model: CatalogModel): string {
  return model.name || model.display_name || model.id || 'Unnamed model'
}

function modelSearchText(model: CatalogModel): string {
  return `${model.id || ''} ${model.name || ''} ${model.display_name || ''}`.toLowerCase()
}

function providerCount(model: CatalogModel): number {
  const count = Number(model.provider_count || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function isServeable(model: CatalogModel): boolean {
  return providerCount(model) > 0 && model.available !== false
}

function modelContext(model: CatalogModel): number {
  return Number(model.context_length || model.context_window || 0) || 0
}

function formatContext(value: number): string {
  if (!value) return 'n/a'
  if (value >= 1024) return `${Math.round(value / 1024)}K`
  return String(value)
}

function formatSar(value?: string | number | null): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'n/a'
  return `SAR ${parsed.toFixed(2)}`
}

function formatStatus(value?: string): string {
  return String(value || 'not_reported').replace(/_/g, ' ')
}

function pricing(model: CatalogModel): CatalogModel['pricing'] {
  return model.pricing || model.token_pricing || {}
}

function capabilityLabels(model: CatalogModel): string[] {
  const flags = model.capability_flags || model.capabilities || {}
  return [
    flags.streaming && 'streaming',
    flags.tool_calling && 'tools',
    flags.reasoning && 'reasoning',
    flags.vision && 'vision',
    flags.multilingual && 'multilingual',
    flags.code_generation && 'code',
  ].filter(Boolean) as string[]
}

function snippet(modelId: string, prompt: string): string {
  return `from openai import OpenAI

client = OpenAI(
    api_key="$DCP_RENTER_KEY",
    base_url="https://api.dcp.sa/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "${prompt}"}],
)

print(response.choices[0].message.content)`
}

export default function ModelReadinessPage({ config }: { config: ModelPageConfig }) {
  const [catalogState, setCatalogState] = useState<FetchState>('loading')
  const [models, setModels] = useState<CatalogModel[]>([])
  const [benchmarkState, setBenchmarkState] = useState<FetchState>('loading')
  const [benchmark, setBenchmark] = useState<BenchmarkReadiness | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      setCatalogState('loading')
      try {
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`models failed: ${res.status}`)
        const data = (await res.json()) as CatalogResponse
        if (!cancelled) {
          setModels(Array.isArray(data.data) ? data.data : [])
          setCatalogState('ready')
        }
      } catch {
        if (!cancelled) {
          setModels([])
          setCatalogState('error')
        }
      }
    }
    loadCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadBenchmarkReadiness() {
      setBenchmarkState('loading')
      try {
        const res = await fetch('/api/models/benchmarks/readiness', { cache: 'no-store' })
        if (!res.ok) throw new Error(`benchmark readiness failed: ${res.status}`)
        const data = (await res.json()) as BenchmarkReadiness
        if (!cancelled) {
          setBenchmark(data)
          setBenchmarkState('ready')
        }
      } catch {
        if (!cancelled) {
          setBenchmark(null)
          setBenchmarkState('error')
        }
      }
    }
    loadBenchmarkReadiness()
    return () => {
      cancelled = true
    }
  }, [])

  const matchingModels = useMemo(() => {
    const terms = config.matchTerms.map((term) => term.toLowerCase())
    return models.filter((model) => {
      const text = modelSearchText(model)
      return terms.some((term) => text.includes(term))
    })
  }, [config.matchTerms, models])

  const liveModels = useMemo(() => matchingModels.filter(isServeable), [matchingModels])
  const catalogOnlyModels = useMemo(() => matchingModels.filter((model) => !isServeable(model)), [matchingModels])
  const proofModel = liveModels[0] || matchingModels[0]
  const snippetModelId = liveModels[0]?.id || 'MODEL_ID_FROM_V1_MODELS'
  const featureSource = proofModel?.feature_readiness
  const qualityClaimAllowed =
    benchmark?.summary?.public_quality_claim_allowed === true ||
    benchmark?.claim_guards?.arabic_quality_claim_allowed === true

  return (
    <>
      <SiteHeader active={config.active} />

      <section className="hero model-hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <Image src="/home/inference.webp" alt="" fill priority sizes="100vw" />
        </div>
        <div className="wrap model-hero-wrap">
          <div className="model-hero-copy">
            <div className="section-meta">
              <span className="idx"><Bi en={config.eyebrowEn} ar={config.eyebrowAr} /></span>
              <span><Bi en="Live catalog first, claims gated by proof" ar="الكتالوج الحي أولاً، والادعاءات مقيدة بالإثبات" /></span>
            </div>
            <h1>
              <BiX
                en={<>{config.titleEn}, <em>{config.italicEn}</em></>}
                ar={<>{config.titleAr}، <em>{config.italicAr}</em></>}
              />
            </h1>
            <p className="lead">
              <Bi en={config.leadEn} ar={config.leadAr} />
            </p>
            <div className="model-hero-actions">
              <Link className="btn primary" href="/renter/playground"><Bi en="Open Playground ->" ar="افتح بيئة الاختبار ←" /></Link>
              <Link className="btn ghost" href="/pricing"><Bi en="See live rates" ar="شاهد الأسعار الحية" /></Link>
            </div>
          </div>
          <aside className="model-proof-card" aria-label="Model page evidence sources">
            <Image src={config.logoSrc} alt={config.logoAlt} width={112} height={112} />
            <span className="model-proof-k"><Bi en="Evidence sources" ar="مصادر الدليل" /></span>
            <strong>{config.defaultModelId}</strong>
            <ul>
              <li><Bi en="/v1/models controls serveability, pricing, context, and feature readiness." ar="/v1/models يتحكم في القابلية للخدمة والأسعار والسياق وجاهزية الميزات." /></li>
              <li><Bi en="/api/models/benchmarks/readiness controls quality and ranking claims." ar="/api/models/benchmarks/readiness يتحكم في ادعاءات الجودة والترتيب." /></li>
              <li><Bi en="Zero-provider rows stay catalog-only until verified serving returns." ar="تبقى الصفوف بلا مزود في الكتالوج فقط حتى تعود خدمة مثبتة." /></li>
            </ul>
          </aside>
        </div>
      </section>

      <section>
        <div className="wrap model-grid-wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Live catalog" ar="§ ٠١ · الكتالوج الحي" /></span>
            <span><Bi en="Served rows and catalog-only rows separated" ar="صفوف الخدمة وصفوف الكتالوج مفصولة" /></span>
          </div>
          <div className="model-stat-grid" aria-label="Model family live catalog status">
            <article className="model-stat">
              <span><Bi en="Matching rows" ar="الصفوف المطابقة" /></span>
              <strong>{catalogState === 'ready' ? matchingModels.length : catalogState}</strong>
              <em><Bi en="from GET /v1/models" ar="من GET /v1/models" /></em>
            </article>
            <article className="model-stat">
              <span><Bi en="Live matching models" ar="نماذج مطابقة حية" /></span>
              <strong>{catalogState === 'ready' ? liveModels.length : catalogState}</strong>
              <em><Bi en="requires provider_count > 0" ar="يتطلب provider_count > 0" /></em>
            </article>
            <article className="model-stat">
              <span><Bi en="Catalog-only rows" ar="صفوف كتالوج فقط" /></span>
              <strong>{catalogState === 'ready' ? catalogOnlyModels.length : catalogState}</strong>
              <em><Bi en="not advertised as serveable" ar="لا تعلن كقابلة للخدمة" /></em>
            </article>
            <article className="model-stat">
              <span><Bi en="Quality claims" ar="ادعاءات الجودة" /></span>
              <strong><Bi en={qualityClaimAllowed ? 'allowed' : 'gated'} ar={qualityClaimAllowed ? 'مسموحة' : 'مقيدة'} /></strong>
              <em>{benchmark?.version || (benchmarkState === 'ready' ? 'readiness loaded' : benchmarkState)}</em>
            </article>
          </div>

          {catalogState === 'error' && (
            <div className="model-empty">
              <strong><Bi en="Live catalog unavailable" ar="الكتالوج الحي غير متاح" /></strong>
              <p><Bi en="The page could not read /v1/models, so it will not make availability or pricing claims." ar="لم تتمكن الصفحة من قراءة /v1/models، لذلك لن تقدم ادعاءات توفر أو أسعار." /></p>
            </div>
          )}

          {catalogState === 'ready' && matchingModels.length === 0 && (
            <div className="model-empty">
              <strong><Bi en="No catalog match yet" ar="لا يوجد تطابق في الكتالوج بعد" /></strong>
              <p><Bi en="This model family is not currently present in /v1/models. Use the live catalog before sending traffic." ar="عائلة النموذج هذه غير موجودة حالياً في /v1/models. استخدم الكتالوج الحي قبل إرسال الحركة." /></p>
            </div>
          )}

          <div className="model-row-grid">
            {(liveModels.length ? liveModels : matchingModels).slice(0, 6).map((model) => {
              const price = pricing(model)
              const labels = capabilityLabels(model)
              return (
                <article className={`model-row-card${isServeable(model) ? ' live' : ' catalog'}`} key={model.id || modelTitle(model)}>
                  <span className="model-row-status"><Bi en={isServeable(model) ? 'serveable now' : 'catalog-only'} ar={isServeable(model) ? 'قابل للخدمة الآن' : 'كتالوج فقط'} /></span>
                  <h2>{modelTitle(model)}</h2>
                  <code>{model.id}</code>
                  <div className="model-row-meta">
                    <span><Bi en={`${providerCount(model)} live providers`} ar={`${providerCount(model)} مزود حي`} /></span>
                    <span><Bi en={`${formatContext(modelContext(model))} context`} ar={`سياق ${formatContext(modelContext(model))}`} /></span>
                    <span>{formatSar(price?.sar_per_1m_input_tokens)} / 1M in</span>
                    <span>{formatSar(price?.sar_per_1m_output_tokens)} / 1M out</span>
                  </div>
                  {labels.length > 0 && (
                    <div className="model-chip-row">
                      {labels.map((label) => <span key={label}>{label}</span>)}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="pshow model-pshow">
            <div className="pshow-media">
              <Image
                src="/home/skyline.webp"
                alt="Riyadh skyline used as the visual signal for DCP Saudi model deployment readiness"
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
              />
              <span className="pshow-cap" dir="ltr">fig. 04 - model family proof path</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · Advanced gates" ar="§ ٠٢ · البوابات المتقدمة" /></span>
                <span><Bi en="Feature readiness follows the catalog row" ar="جاهزية الميزات تتبع صف الكتالوج" /></span>
              </div>
              <h2>
                <BiX en={<>Use the family when it is served. <em>Do not infer unavailable rails.</em></>} ar={<>استخدم العائلة عندما تكون مخدومة. <em>ولا تستنتج مسارات غير متاحة.</em></>} />
              </h2>
              <p>
                <Bi en={config.intentEn} ar={config.intentAr} />
              </p>
              <div className="model-feature-grid" aria-label="Advanced model readiness">
                {FEATURE_LABELS.map((feature) => {
                  const row = featureSource?.[feature.key]
                  return (
                    <div className="model-feature" key={feature.key}>
                      <span><Bi en={feature.en} ar={feature.ar} /></span>
                      <strong>{formatStatus(row?.status)}</strong>
                      <em><Bi en={row?.available ? 'available' : 'gated'} ar={row?.available ? 'متاح' : 'مقيد'} /></em>
                      {row?.next && <small>{row.next}</small>}
                    </div>
                  )
                })}
              </div>
              <pre className="term" dir="ltr" aria-label="Model API snippet">{snippet(snippetModelId, config.promptEn)}</pre>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth model-claim-guard">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Claim guard" ar="حارس الادعاء" /></span>
              <h3><Bi en="Arabic quality pages should be useful before they are boastful." ar="يجب أن تكون صفحات الجودة العربية مفيدة قبل أن تكون متفاخرة." /></h3>
              <p>
                <Bi
                  en="These model pages package the catalog and developer path, but public quality claims, rankings, case studies, and frontier comparisons remain blocked until reproducible benchmark artifacts exist."
                  ar="تغلف صفحات النماذج هذه الكتالوج ومسار المطور، لكن ادعاءات الجودة العامة والترتيبات ودراسات الحالة والمقارنات مع النماذج الكبرى تبقى محجوبة حتى توجد آثار قياس قابلة للتكرار."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/benchmarks"><Bi en="Inspect benchmarks" ar="افحص القياسات" /></Link>
                <Link className="btn ghost" href="/inference"><Bi en="Back to inference" ar="ارجع إلى الاستدلال" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Benchmark claim guards">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">benchmark_suite</span>
                <p>{benchmark?.benchmark_suite || 'saudi-arabic-v1'}</p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">arabic_quality_claim_allowed</span>
                <p>{String(benchmark?.claim_guards?.arabic_quality_claim_allowed === true)}</p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">next_action</span>
                <p>{benchmark?.next_actions?.[0] || 'Attach reproducible eval artifacts before public quality claims.'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
