'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'
import '../public-directory.css'

type FetchState = 'loading' | 'ready' | 'error'

interface ModelPricing {
  sar_per_1m_input_tokens?: string | number | null
  sar_per_1m_output_tokens?: string | number | null
  source?: string | null
  contract?: {
    version?: string
  } | null
}

interface CatalogModel {
  id: string
  name?: string
  display_name?: string
  available?: boolean
  status?: string
  provider_count?: number
  context_length?: number
  context_window?: number
  max_output_tokens?: number
  pricing?: ModelPricing
  token_pricing?: ModelPricing
  capability_flags?: Record<string, boolean>
  supported_features?: string[]
}

interface CatalogResponse {
  data?: CatalogModel[]
}

function modelName(model: CatalogModel): string {
  return model.name || model.display_name || model.id
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

function formatContext(tokens: number): string {
  if (!tokens) return 'n/a'
  if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`
  return String(tokens)
}

function modelPricing(model: CatalogModel): ModelPricing {
  return model.pricing || model.token_pricing || {}
}

function formatSar(value?: string | number | null): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'n/a'
  return `SAR ${parsed.toFixed(2)}`
}

function modelCapabilities(model: CatalogModel): string {
  const flags = model.capability_flags || {}
  const explicit = Array.isArray(model.supported_features) ? model.supported_features : []
  const chips = [
    flags.streaming ? 'streaming' : null,
    flags.tool_calling ? 'tools' : null,
    flags.vision ? 'vision' : null,
    flags.reasoning ? 'reasoning' : null,
    flags.multilingual ? 'multilingual' : null,
    ...explicit.slice(0, 3),
  ].filter(Boolean)
  return chips.length > 0 ? chips.join(' · ') : 'catalog'
}

export default function ModelsPage() {
  const [state, setState] = useState<FetchState>('loading')
  const [models, setModels] = useState<CatalogModel[]>([])

  useEffect(() => {
    let cancelled = false
    async function loadModels() {
      setState('loading')
      try {
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`models failed: ${res.status}`)
        const data = (await res.json()) as CatalogResponse
        if (!cancelled) {
          setModels(Array.isArray(data.data) ? data.data : [])
          setState('ready')
        }
      } catch {
        if (!cancelled) {
          setModels([])
          setState('error')
        }
      }
    }
    void loadModels()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => Number(isServeable(b)) - Number(isServeable(a))
      || providerCount(b) - providerCount(a)
      || modelName(a).localeCompare(modelName(b)))
  }, [models])

  const liveModels = sortedModels.filter(isServeable)
  const catalogOnlyModels = sortedModels.filter((model) => !isServeable(model))
  const maxContext = sortedModels.reduce((max, model) => Math.max(max, modelContext(model)), 0)
  const pricingContract = sortedModels.map((model) => modelPricing(model).contract?.version).find(Boolean)

  return (
    <>
      <SiteHeader active="/models" />

      <section className="directory-hero">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ Models · earned catalog" ar="§ النماذج · كتالوج مكتسب" /></span>
            <span><Bi en="Source: GET /v1/models" ar="المصدر: GET /v1/models" /></span>
          </div>
          <h1>
            <BiX
              en={<>Models, <em>only as live as the fleet proves.</em></>}
              ar={<>النماذج، <em>بقدر ما يثبته الأسطول فقط.</em></>}
            />
          </h1>
          <p className="lead">
            <Bi
              en="This is the public OpenAI-compatible model directory for DCP. It reads the live /v1/models catalog, separates serveable rows from catalog-only rows, and avoids turning zero-provider metadata into a capacity promise."
              ar="هذا هو دليل نماذج DCP العام المتوافق مع OpenAI. يقرأ كتالوج /v1/models الحي، ويفصل الصفوف القابلة للخدمة عن صفوف الكتالوج فقط، ولا يحول بيانات بلا مزودين إلى وعد سعة."
            />
          </p>
          <div className="directory-actions">
            <Link className="btn primary lg" href="/renter/playground"><Bi en="Open Playground ->" ar="افتح بيئة الاختبار ←" /></Link>
            <Link className="btn ghost lg" href="/docs#openai-compatible-api"><Bi en="API docs" ar="توثيق الواجهة" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 24 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Catalog state" ar="§ ٠١ · حالة الكتالوج" /></span>
            <span><Bi en="Serveability requires provider_count > 0" ar="القابلية للخدمة تتطلب provider_count > 0" /></span>
          </div>

          <div className="directory-metrics" aria-label="Models catalog metrics">
            <article className="directory-metric">
              <span><Bi en="Catalog rows" ar="صفوف الكتالوج" /></span>
              <strong>{state === 'ready' ? sortedModels.length : state}</strong>
              <em><Bi en="all rows returned by /v1/models" ar="كل الصفوف المعادة من /v1/models" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Serveable now" ar="قابلة للخدمة الآن" /></span>
              <strong>{state === 'ready' ? liveModels.length : state}</strong>
              <em><Bi en="provider-backed and not unavailable" ar="مدعومة بمزود وليست غير متاحة" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Catalog-only" ar="كتالوج فقط" /></span>
              <strong>{state === 'ready' ? catalogOnlyModels.length : state}</strong>
              <em><Bi en="visible metadata, no traffic promise" ar="بيانات ظاهرة دون وعد حركة" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Max context" ar="أكبر سياق" /></span>
              <strong>{state === 'ready' ? formatContext(maxContext) : state}</strong>
              <em>{pricingContract || 'dcp.model_token_pricing.v1'}</em>
            </article>
          </div>

          <div className="directory-panel">
            <div className="directory-panel-head">
              <span><Bi en="Live model directory" ar="دليل النماذج الحي" /></span>
              <b dir="ltr">GET /v1/models</b>
            </div>
            {state === 'loading' && (
              <div className="directory-empty">
                <strong><Bi en="Loading catalog" ar="تحميل الكتالوج" /></strong>
                <Bi en="The page is querying live model metadata." ar="تستعلم الصفحة عن بيانات النماذج الحية." />
              </div>
            )}
            {state === 'error' && (
              <div className="directory-empty">
                <strong><Bi en="Catalog unavailable" ar="الكتالوج غير متاح" /></strong>
                <Bi en="No model availability or pricing claim is made while /v1/models cannot be read." ar="لا تقدم الصفحة ادعاء توفر أو أسعار عندما لا يمكن قراءة /v1/models." />
              </div>
            )}
            {state === 'ready' && sortedModels.length === 0 && (
              <div className="directory-empty">
                <strong><Bi en="No models returned" ar="لم تعد نماذج" /></strong>
                <Bi en="An empty catalog is treated as an honest operational state." ar="يُعامل الكتالوج الفارغ كحالة تشغيل صادقة." />
              </div>
            )}
            {state === 'ready' && sortedModels.length > 0 && (
              <div className="directory-table">
                {sortedModels.slice(0, 14).map((model) => {
                  const pricing = modelPricing(model)
                  return (
                    <article className={`directory-row${isServeable(model) ? ' is-live' : ' is-muted'}`} key={model.id}>
                      <span>
                        <b>{modelName(model)}</b>
                        <code dir="ltr">{model.id}</code>
                      </span>
                      <span>
                        <em><Bi en="Providers" ar="المزوّدون" /></em>
                        <b>{providerCount(model)}</b>
                      </span>
                      <span>
                        <em><Bi en="Context" ar="السياق" /></em>
                        <b>{formatContext(modelContext(model))}</b>
                      </span>
                      <span>
                        <em><Bi en="SAR / 1M input" ar="ريال / مليون إدخال" /></em>
                        <b>{formatSar(pricing.sar_per_1m_input_tokens)}</b>
                      </span>
                      <span>
                        <em><Bi en="State" ar="الحالة" /></em>
                        <b>{isServeable(model) ? 'serveable' : (model.status || 'catalog-only')}</b>
                        <i>{modelCapabilities(model)}</i>
                      </span>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="directory-link-grid" aria-label="Model family pages">
            <Link href="/models/qwen-arabic">
              <strong>Qwen Arabic</strong>
              <span><Bi en="Arabic-capable Qwen family page with live catalog proof and API snippet." ar="صفحة عائلة Qwen العربية مع إثبات كتالوج حي ومثال واجهة." /></span>
              <em><Bi en="Open family page" ar="افتح صفحة العائلة" /></em>
            </Link>
            <Link href="/models/allam">
              <strong>ALLaM</strong>
              <span><Bi en="Saudi Arabic model path, explicitly gated by provider_count and benchmark readiness." ar="مسار النموذج العربي السعودي، مقيد صراحة بعدد المزودين وجاهزية القياس." /></span>
              <em><Bi en="Open family page" ar="افتح صفحة العائلة" /></em>
            </Link>
            <Link href="/pricing">
              <strong><Bi en="Pricing" ar="الأسعار" /></strong>
              <span><Bi en="Token rates and GPU pod rates in Saudi Riyal, with 402 insufficient-balance guardrails." ar="أسعار الرموز والحاويات بالريال السعودي، مع حواجز 402 لنقص الرصيد." /></span>
              <em><Bi en="See rates" ar="راجع الأسعار" /></em>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
