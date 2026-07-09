'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

const CAPABILITIES = [
  {
    k: 'openai_compatible',
    tEn: 'OpenAI-compatible API',
    tAr: 'واجهة متوافقة مع OpenAI',
    en: 'Use base_url=https://api.dcp.sa/v1 with your DCP renter key; SDK rewrites are not required.',
    ar: 'استخدم base_url=https://api.dcp.sa/v1 مع مفتاح مستأجر DCP؛ لا تحتاج لإعادة كتابة SDK.',
  },
  {
    k: 'earned_model_catalog',
    tEn: 'Earned model catalog',
    tAr: 'كتالوج نماذج مكتسب',
    en: 'Public model rows come from /v1/models and only count providers that are verified serving.',
    ar: 'صفوف النماذج العامة تأتي من /v1/models وتحسب فقط المزوّدين المتحققين في الخدمة.',
  },
  {
    k: 'sar_metering',
    tEn: 'SAR token metering',
    tAr: 'قياس الرموز بالريال',
    en: 'Model metadata carries SAR per-1M token prices, context, max output, and capability flags.',
    ar: 'تحمل بيانات النموذج أسعار الريال لكل مليون رمز والسياق والحد الأقصى للإخراج وأعلام القدرات.',
  },
  {
    k: 'balanced_routing',
    tEn: 'Balanced routing first',
    tAr: 'التوجيه المتوازن أولاً',
    en: 'The shipped router policy is the balanced default; premium/latency/cost policies stay gated until measured.',
    ar: 'سياسة التوجيه المشحونة هي الافتراضي المتوازن؛ تبقى سياسات الجودة/الكمون/التكلفة مقيدة حتى تقاس.',
  },
  {
    k: 'prompt_cache_readiness',
    tEn: 'Prompt-cache measurement',
    tAr: 'قياس التخزين المؤقت',
    en: 'Static-prefix and session hints are exposed as hash-only measurements; cached-input discounts stay off until settlement proof exists.',
    ar: 'تظهر تلميحات البادئة الثابتة والجلسة كقياسات بصمات فقط؛ تبقى خصومات الإدخال المخزن متوقفة حتى يوجد إثبات تسوية.',
  },
] as const

const CHAT_SNIPPET = `from openai import OpenAI

client = OpenAI(
    api_key="$DCP_RENTER_KEY",
    base_url="https://api.dcp.sa/v1",
)

response = client.chat.completions.create(
    model="Qwen/Qwen2.5-14B-Instruct-AWQ",
    messages=[{"role": "user", "content": "Explain zakat in Arabic."}],
)

print(response.choices[0].message.content)`

type RouterPolicyState = 'loading' | 'ready' | 'error'
type ModelCatalogState = 'loading' | 'ready' | 'error'
type PromptCacheState = 'loading' | 'ready' | 'error'

interface RouterPolicy {
  id: string
  label: string
  status: string
  available: boolean
  default?: boolean
  request_selectable?: boolean
  current_behavior?: string
}

interface RouterPoliciesResponse {
  version?: string
  default_policy?: string
  request_selectable?: boolean
  data?: RouterPolicy[]
}

interface ModelPricing {
  sar_per_1m_input_tokens?: string | number | null
  sar_per_1m_output_tokens?: string | number | null
  halala_per_1m_input_tokens?: number | null
  halala_per_1m_output_tokens?: number | null
}

interface InferenceModel {
  id: string
  name?: string
  display_name?: string
  available?: boolean
  provider_count?: number
  context_length?: number
  context_window?: number
  max_output_tokens?: number
  status?: string
  pricing?: ModelPricing
  token_pricing?: ModelPricing
  supported_features?: string[]
  capability_flags?: Record<string, boolean>
}

interface ModelCatalogResponse {
  object?: string
  data?: InferenceModel[]
}

interface LiveAcceptanceGate {
  status?: string
  command?: string
  live_acceptance_gate?: string
  blocked_on?: string[]
  verifies?: string[]
}

interface PromptCacheReadiness {
  object?: string
  version?: string
  current_mode?: string
  status?: string
  measurement?: {
    hash_only?: boolean
    stores_raw_prompt?: boolean
    stores_static_prefix?: boolean
  }
  billing?: {
    discounts_enabled?: boolean
    settlement_discount_enabled?: boolean
  }
  claims?: {
    prompt_cache_discount?: boolean
    provider_kv_cache_control?: boolean
    tinker_compatible?: boolean
  }
  live_acceptance?: {
    provider_discount_smoke?: LiveAcceptanceGate
  }
}

function capabilitySource(key: string): string {
  if (key === 'balanced_routing') return '/v1/router/policies'
  if (key === 'prompt_cache_readiness') return '/v1/prompt-cache/readiness'
  return '/v1/models'
}

function formatPolicyStatus(status?: string): string {
  return String(status || 'gated').replace(/_/g, ' ')
}

function modelName(model: InferenceModel): string {
  return model.name || model.display_name || model.id
}

function modelContext(model: InferenceModel): number {
  return model.context_length || model.context_window || 0
}

function formatContext(tokens: number): string {
  if (!tokens) return 'n/a'
  if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`
  return String(tokens)
}

function formatSar(value?: string | number | null): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'n/a'
  return `SAR ${parsed.toFixed(2)}`
}

function modelPricing(model: InferenceModel): ModelPricing {
  return model.pricing || model.token_pricing || {}
}

export default function InferenceProductPage() {
  const [routerPolicyState, setRouterPolicyState] = useState<RouterPolicyState>('loading')
  const [routerPolicies, setRouterPolicies] = useState<RouterPoliciesResponse | null>(null)
  const [modelCatalogState, setModelCatalogState] = useState<ModelCatalogState>('loading')
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResponse | null>(null)
  const [promptCacheState, setPromptCacheState] = useState<PromptCacheState>('loading')
  const [promptCacheReadiness, setPromptCacheReadiness] = useState<PromptCacheReadiness | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadRouterPolicies() {
      setRouterPolicyState('loading')
      try {
        const res = await fetch('/v1/router/policies', { cache: 'no-store' })
        if (!res.ok) throw new Error(`router policies failed: ${res.status}`)
        const data = (await res.json()) as RouterPoliciesResponse
        if (!cancelled) {
          setRouterPolicies(data)
          setRouterPolicyState('ready')
        }
      } catch {
        if (!cancelled) {
          setRouterPolicies(null)
          setRouterPolicyState('error')
        }
      }
    }
    loadRouterPolicies()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadModelCatalog() {
      setModelCatalogState('loading')
      try {
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`models failed: ${res.status}`)
        const data = (await res.json()) as ModelCatalogResponse
        if (!cancelled) {
          setModelCatalog(data)
          setModelCatalogState('ready')
        }
      } catch {
        if (!cancelled) {
          setModelCatalog(null)
          setModelCatalogState('error')
        }
      }
    }
    loadModelCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPromptCacheReadiness() {
      setPromptCacheState('loading')
      try {
        const res = await fetch('/v1/prompt-cache/readiness', { cache: 'no-store' })
        if (!res.ok) throw new Error(`prompt cache readiness failed: ${res.status}`)
        const data = (await res.json()) as PromptCacheReadiness
        if (!cancelled) {
          setPromptCacheReadiness(data)
          setPromptCacheState('ready')
        }
      } catch {
        if (!cancelled) {
          setPromptCacheReadiness(null)
          setPromptCacheState('error')
        }
      }
    }
    loadPromptCacheReadiness()
    return () => {
      cancelled = true
    }
  }, [])

  const policies = useMemo(() => routerPolicies?.data || [], [routerPolicies])
  const defaultPolicy = useMemo(() => {
    return policies.find((policy) => policy.id === routerPolicies?.default_policy)
      || policies.find((policy) => policy.default)
      || policies.find((policy) => policy.id === 'balanced')
      || null
  }, [policies, routerPolicies?.default_policy])
  const availablePolicies = policies.filter((policy) => policy.available).length
  const gatedPolicies = Math.max(0, policies.length - availablePolicies)
  const catalogModels = useMemo(() => modelCatalog?.data || [], [modelCatalog])
  const visibleCatalogModels = useMemo(() => {
    return [...catalogModels]
      .sort((a, b) => Number(Boolean(b.available)) - Number(Boolean(a.available))
        || (b.provider_count || 0) - (a.provider_count || 0)
        || modelName(a).localeCompare(modelName(b)))
      .slice(0, 5)
  }, [catalogModels])
  const availableCatalogModels = catalogModels.filter((model) => model.available).length
  const providerBackedModels = catalogModels.filter((model) => (model.provider_count || 0) > 0).length
  const maxContextTokens = catalogModels.reduce((max, model) => Math.max(max, modelContext(model)), 0)
  const promptCacheGate = promptCacheReadiness?.live_acceptance?.provider_discount_smoke || null
  const promptCacheMode = promptCacheReadiness?.current_mode || 'measurement_only_no_discount'
  const promptCacheDiscountsEnabled = promptCacheReadiness?.billing?.discounts_enabled === true
  const promptCacheHashOnly = promptCacheReadiness?.measurement?.hash_only === true

  return (
    <>
      <SiteHeader active="/inference" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/inference.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="OpenAI-compatible inference · KSA GPU mesh" ar="استدلال متوافق مع OpenAI · شبكة GPU داخل المملكة" /></span>
            <span><Bi en="Published from live catalog metadata" ar="منشور من بيانات الكتالوج الحية" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.6rem, 1.2rem + 4.8vw, 5.2rem)', lineHeight: 0.96, letterSpacing: '-.02em', maxWidth: 920, margin: '22px 0 18px' }}>
            <BiX
              en={<>Inference API for Saudi AI products, <em style={{ fontStyle: 'italic' }}>without stale capacity claims.</em></>}
              ar={<>واجهة استدلال لمنتجات الذكاء السعودي، <em>دون ادعاءات سعة قديمة.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 720, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP exposes a drop-in /v1 API for chat completions and model discovery. The pages that show rates, model capability, context, and provider counts read the backend catalog, so zero-capacity models do not become marketing promises."
              ar="يوفر DCP واجهة /v1 بديلة للمحادثة واكتشاف النماذج. الصفحات التي تعرض الأسعار والقدرات والسياق وعدد المزوّدين تقرأ كتالوج الخلفية، فلا تتحول النماذج بلا سعة إلى وعود تسويقية."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/renter/playground"><Bi en="Open Playground ->" ar="افتح بيئة الاختبار ←" /></Link>
            <Link className="btn ghost" href="/marketplace"><Bi en="Live model catalog" ar="كتالوج النماذج الحي" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Shipped inference contract" ar="§ ٠١ · عقد الاستدلال المشحون" /></span>
            <span><Bi en="Model metadata before product claims" ar="بيانات النموذج قبل ادعاءات المنتج" /></span>
          </div>
          <div className="inference-model-live" aria-live="polite">
            <div className="model-live-head">
              <span><Bi en="Live model catalog" ar="كتالوج النماذج الحي" /></span>
              <b dir="ltr">GET /v1/models</b>
            </div>
            {modelCatalogState === 'loading' && (
              <p className="model-live-empty">
                <Bi en="Loading live model metadata..." ar="تحميل بيانات النماذج الحية..." />
              </p>
            )}
            {modelCatalogState === 'error' && (
              <p className="model-live-empty">
                <Bi en="Model metadata is temporarily unavailable; capacity claims stay tied to the backend catalog." ar="بيانات النماذج غير متاحة مؤقتاً؛ تبقى ادعاءات السعة مرتبطة بكتالوج الخلفية." />
              </p>
            )}
            {modelCatalogState === 'ready' && (
              <>
                <div className="model-live-metrics">
                  <span>
                    <em><Bi en="Serving models" ar="نماذج قيد الخدمة" /></em>
                    <strong>{availableCatalogModels}/{catalogModels.length}</strong>
                  </span>
                  <span>
                    <em><Bi en="Provider-backed" ar="مدعومة بمزوّد" /></em>
                    <strong>{providerBackedModels}</strong>
                  </span>
                  <span>
                    <em><Bi en="Max context" ar="أكبر سياق" /></em>
                    <strong>{formatContext(maxContextTokens)}</strong>
                  </span>
                </div>
                <div className="model-live-list">
                  {visibleCatalogModels.map((model) => {
                    const pricing = modelPricing(model)
                    const flags = model.capability_flags || {}
                    const chips = [
                      flags.streaming ? 'streaming' : null,
                      flags.tool_calling ? 'tools' : null,
                      flags.vision ? 'vision' : null,
                      flags.lora ? 'LoRA' : null,
                    ].filter(Boolean)
                    return (
                      <div key={model.id} className={model.available ? 'available' : 'catalog-only'}>
                        <span>
                          <b>{modelName(model)}</b>
                          <i dir="ltr">{model.id}</i>
                        </span>
                        <span><em><Bi en="Providers" ar="المزوّدون" /></em><strong>{model.provider_count || 0}</strong></span>
                        <span><em><Bi en="Context" ar="السياق" /></em><strong>{formatContext(modelContext(model))}</strong></span>
                        <span>
                          <em><Bi en="SAR / 1M" ar="ريال / مليون" /></em>
                          <strong>{formatSar(pricing.sar_per_1m_input_tokens)} in / {formatSar(pricing.sar_per_1m_output_tokens)} out</strong>
                        </span>
                        <span><em><Bi en="State" ar="الحالة" /></em><strong>{model.available ? 'serving' : formatPolicyStatus(model.status || 'catalog_only')}</strong></span>
                        {chips.length > 0 && <small>{chips.join(' · ')}</small>}
                      </div>
                    )
                  })}
                </div>
                <p className="model-live-note">
                  <Bi en="Rows with zero providers stay visible as catalog metadata, not capacity claims." ar="تبقى الصفوف بلا مزوّدين ظاهرة كبيانات كتالوج، لا كادعاءات سعة." />
                </p>
              </>
            )}
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {CAPABILITIES.map((capability) => (
              <article className="mg" key={capability.k}>
                <span className="org">{capability.k}</span>
                <h3 className="nm"><Bi en={capability.tEn} ar={capability.tAr} /></h3>
                <p><Bi en={capability.en} ar={capability.ar} /></p>
                <div className="meta">
                  <span><Bi en="Source" ar="المصدر" /></span>
                  <b dir="ltr">{capabilitySource(capability.k)}</b>
                </div>
              </article>
            ))}
          </div>
          <div className="inference-prompt-cache-live" aria-live="polite">
            <div className="prompt-cache-live-head">
              <span><Bi en="Prompt-cache live proof" ar="إثبات التخزين المؤقت الحي" /></span>
              <b dir="ltr">{promptCacheReadiness?.version || 'dcp.prompt_cache.v1'}</b>
            </div>
            {promptCacheState === 'loading' && (
              <p className="prompt-cache-live-empty">
                <Bi en="Loading prompt-cache readiness..." ar="تحميل جاهزية التخزين المؤقت..." />
              </p>
            )}
            {promptCacheState === 'error' && (
              <p className="prompt-cache-live-empty">
                <Bi en="Prompt-cache readiness is temporarily unavailable; discounts remain gated." ar="جاهزية التخزين المؤقت غير متاحة مؤقتاً؛ تبقى الخصومات مقيدة." />
              </p>
            )}
            {promptCacheState === 'ready' && (
              <>
                <div className="prompt-cache-live-metrics">
                  <span>
                    <em><Bi en="Mode" ar="الوضع" /></em>
                    <strong>{formatPolicyStatus(promptCacheMode)}</strong>
                  </span>
                  <span>
                    <em><Bi en="Live gate" ar="بوابة حية" /></em>
                    <strong>{formatPolicyStatus(promptCacheGate?.status || 'blocked_external')}</strong>
                  </span>
                  <span>
                    <em><Bi en="Discounts" ar="الخصومات" /></em>
                    <strong>{promptCacheDiscountsEnabled ? 'live' : 'gated'}</strong>
                  </span>
                </div>
                <div className="prompt-cache-live-list">
                  <span className={promptCacheHashOnly ? 'available' : 'gated'}>
                    <b><Bi en="Hash-only measurement" ar="قياس بصمة فقط" /></b>
                    <em>{promptCacheHashOnly ? 'active' : 'checking'}</em>
                  </span>
                  <span className="gated">
                    <b><Bi en="Provider KV-cache control" ar="تحكم KV للمزوّد" /></b>
                    <em>{promptCacheReadiness?.claims?.provider_kv_cache_control ? 'live' : 'gated'}</em>
                  </span>
                  <span className="gated">
                    <b><Bi en="Settlement discount" ar="خصم التسوية" /></b>
                    <em>{promptCacheReadiness?.billing?.settlement_discount_enabled ? 'live' : 'gated'}</em>
                  </span>
                  {promptCacheGate?.live_acceptance_gate && (
                    <span className="gated">
                      <b>{promptCacheGate.live_acceptance_gate}</b>
                      <em>gate</em>
                    </span>
                  )}
                  {promptCacheGate?.blocked_on?.slice(0, 3).map((blocker) => (
                    <span key={blocker} className="gated">
                      <b>{blocker}</b>
                      <em>blocker</em>
                    </span>
                  ))}
                </div>
                <p className="prompt-cache-live-note" dir="ltr">
                  {promptCacheGate?.command || 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement'}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="pshow">
            <div className="pshow-media">
              <img
                src="/home/swarm.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="Abstract GPU mesh visual representing DCP inference routing across verified Saudi providers"
              />
              <span className="pshow-cap" dir="ltr">fig. 01 - verified model routing</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · Drop-in client" ar="§ ٠٢ · عميل مباشر" /></span>
                <span><Bi en="Change base_url, keep the SDK" ar="غيّر base_url وأبقِ SDK" /></span>
              </div>
              <h2>
                <BiX en={<>One client path for app teams and agents. <em>SAR metered.</em></>} ar={<>مسار عميل واحد للفرق والوكلاء. <em>مقاس بالريال.</em></>} />
              </h2>
              <p>
                <Bi
                  en="Use the same OpenAI SDK call shape, but keep your traffic on DCP's in-Kingdom provider mesh. The model catalog is the source of truth for what is actually serveable."
                  ar="استخدم نفس شكل استدعاء OpenAI SDK، لكن أبقِ الحركة على شبكة مزوّدي DCP داخل المملكة. كتالوج النماذج هو مصدر الحقيقة لما يمكن خدمته فعلاً."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="OpenAI-compatible DCP inference example">{CHAT_SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="Prompt-cache measurement is visible at /v1/prompt-cache/readiness; discounts remain gated until settlement proof exists." ar="قياس التخزين المؤقت ظاهر في /v1/prompt-cache/readiness؛ تبقى الخصومات مقيدة حتى يوجد إثبات التسوية." /></li>
                <li><Bi en="Batch discounts, LoRA serving, and dedicated deployments remain explicit feature gates." ar="تبقى خصومات الدُفعات وخدمة LoRA والنشرات المخصصة بوابات ميزات صريحة." /></li>
                <li><Bi en="Provider counts are not inflated by stale heartbeat-only machines." ar="لا تضخم أعداد المزوّدين بأجهزة نبض اتصال قديمة فقط." /></li>
                <li><Bi en="Pricing and context are rendered from backend metadata where possible." ar="تعرض الأسعار والسياق من بيانات الخلفية حيثما أمكن." /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Route policy boundary" ar="حدود سياسة التوجيه" /></span>
              <h3><Bi en="Balanced routing is live. Everything else waits for evidence." ar="التوجيه المتوازن يعمل. كل شيء آخر ينتظر الدليل." /></h3>
              <p>
                <Bi
                  en="The Playground sends the balanced policy only when the backend marks it available. Cost-first, latency-first, premium, batch, and prompt-cache economics need measurement gates before they become public promises."
                  ar="ترسل بيئة الاختبار سياسة التوازن فقط عندما تضعها الخلفية كمتاحة. سياسات أقل تكلفة وأقل كمون والمميزة والدُفعات واقتصاد التخزين المؤقت تحتاج بوابات قياس قبل أن تصبح وعوداً عامة."
                />
              </p>
              <div className="inference-policy-live" aria-live="polite">
                <div className="policy-live-head">
                  <span><Bi en="Router policy catalog" ar="كتالوج سياسات التوجيه" /></span>
                  <b dir="ltr">{routerPolicies?.version || 'dcp.inference_routing_policies.v1'}</b>
                </div>
                {routerPolicyState === 'loading' && (
                  <p className="policy-live-empty">
                    <Bi en="Loading router-policy readiness..." ar="تحميل جاهزية سياسات التوجيه..." />
                  </p>
                )}
                {routerPolicyState === 'error' && (
                  <p className="policy-live-empty">
                    <Bi en="Router-policy readiness is temporarily unavailable; future policies remain gated." ar="جاهزية سياسات التوجيه غير متاحة مؤقتاً؛ تبقى السياسات المستقبلية مقيدة." />
                  </p>
                )}
                {routerPolicyState === 'ready' && (
                  <>
                    <div className="policy-live-metrics">
                      <span>
                        <em><Bi en="Default" ar="الافتراضي" /></em>
                        <strong>{defaultPolicy?.label || 'Balanced'}</strong>
                      </span>
                      <span>
                        <em><Bi en="Available" ar="متاح" /></em>
                        <strong>{availablePolicies}/{policies.length}</strong>
                      </span>
                      <span>
                        <em><Bi en="Gated policies" ar="سياسات مقيدة" /></em>
                        <strong>{gatedPolicies}</strong>
                      </span>
                    </div>
                    <div className="policy-live-list">
                      {policies.map((policy) => (
                        <span key={policy.id} className={policy.available ? 'available' : 'gated'}>
                          <b>{policy.label}</b>
                          <em>{formatPolicyStatus(policy.status)}</em>
                          {!policy.request_selectable && <i><Bi en="not selectable" ar="غير قابل للاختيار" /></i>}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/renter/playground"><Bi en="Try Playground" ar="جرّب بيئة الاختبار" /></Link>
                <Link className="btn ghost" href="/pricing"><Bi en="See pricing" ar="شاهد الأسعار" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Inference gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">/v1/models</span>
                <p><Bi en="Serveable models, provider count, context, and token prices come from the live catalog." ar="النماذج القابلة للخدمة وعدد المزوّدين والسياق وأسعار الرموز تأتي من الكتالوج الحي." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">/v1/chat/completions</span>
                <p><Bi en="OpenAI-compatible requests run through DCP's provider router and meter usage." ar="طلبات متوافقة مع OpenAI تمر عبر موجّه مزوّدي DCP وتقيس الاستخدام." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">/v1/prompt-cache/readiness</span>
                <p><Bi en="Prompt-cache rows are hash-only measurements; cached-input discounts and provider KV-cache control are still off." ar="صفوف التخزين المؤقت قياسات بصمات فقط؛ تبقى خصومات الإدخال المخزن والتحكم في ذاكرة المزود متوقفة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">feature_readiness</span>
                <p><Bi en="Batch, prompt cache, LoRA, and dedicated deployment flags stay off until implementation and proof land." ar="تبقى أعلام الدُفعات والتخزين المؤقت وLoRA والنشر المخصص متوقفة حتى يصل التنفيذ والإثبات." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
