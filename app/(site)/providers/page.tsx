'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'
import '../public-directory.css'

type FetchState = 'loading' | 'ready' | 'error'

interface ProviderModel {
  model_id: string
  display_name?: string
  providers_count?: number
  min_price_sar_per_hr?: number
  max_vram_available_gb?: number
}

interface ProviderModelsResponse {
  models?: ProviderModel[]
  total?: number
}

interface HealthDetailed {
  providers?: {
    online?: number
    serving?: number
    total?: number
    unreachable?: number
  }
  models?: {
    catalog_count?: number
  }
}

const PROVIDER_GATES = [
  {
    k: 'fresh_heartbeat',
    titleEn: 'Heartbeat is fresh',
    titleAr: 'نبض الاتصال حديث',
    en: 'The provider daemon is alive and reporting current GPU state.',
    ar: 'وكيل المزوّد يعمل ويرسل حالة GPU الحالية.',
  },
  {
    k: 'endpoint_reachable',
    titleEn: 'Endpoint is reachable',
    titleAr: 'نقطة النهاية قابلة للوصول',
    en: 'The backend can touch the serving endpoint; heartbeat alone is not enough.',
    ar: 'تستطيع الخلفية لمس نقطة الخدمة؛ نبض الاتصال وحده لا يكفي.',
  },
  {
    k: 'verified_online',
    titleEn: 'Inference proof passes',
    titleAr: 'إثبات الاستدلال ينجح',
    en: 'A real OpenAI-shaped model probe succeeds before capacity is promoted.',
    ar: 'ينجح فحص نموذج حقيقي بشكل OpenAI قبل ترقية السعة.',
  },
  {
    k: 'model_coverage',
    titleEn: 'Model coverage is earned',
    titleAr: 'تغطية النموذج مكتسبة',
    en: 'Public model counts rise only when a verified provider serves that model.',
    ar: 'ترتفع أعداد النماذج العامة فقط عندما يخدم مزود متحقق ذلك النموذج.',
  },
] as const

function providerCount(model: ProviderModel): number {
  const count = Number(model.providers_count || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function modelName(model: ProviderModel): string {
  return model.display_name || model.model_id
}

function formatSarPerHour(value?: number): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'n/a'
  return `SAR ${parsed.toFixed(2)}/hr`
}

function formatVram(value?: number): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'n/a'
  return `${parsed.toFixed(parsed >= 10 ? 0 : 1)} GB`
}

export default function ProvidersPage() {
  const [modelState, setModelState] = useState<FetchState>('loading')
  const [models, setModels] = useState<ProviderModel[]>([])
  const [healthState, setHealthState] = useState<FetchState>('loading')
  const [health, setHealth] = useState<HealthDetailed | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadProviderModels() {
      setModelState('loading')
      try {
        const res = await fetch('/api/providers/models', { cache: 'no-store' })
        if (!res.ok) throw new Error(`provider models failed: ${res.status}`)
        const data = (await res.json()) as ProviderModelsResponse
        if (!cancelled) {
          setModels(Array.isArray(data.models) ? data.models : [])
          setModelState('ready')
        }
      } catch {
        if (!cancelled) {
          setModels([])
          setModelState('error')
        }
      }
    }
    void loadProviderModels()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadHealth() {
      setHealthState('loading')
      try {
        const res = await fetch('/api/health/detailed', { cache: 'no-store' })
        if (!res.ok) throw new Error(`health failed: ${res.status}`)
        const data = (await res.json()) as HealthDetailed
        if (!cancelled) {
          setHealth(data)
          setHealthState('ready')
        }
      } catch {
        if (!cancelled) {
          setHealth(null)
          setHealthState('error')
        }
      }
    }
    void loadHealth()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => providerCount(b) - providerCount(a)
      || modelName(a).localeCompare(modelName(b)))
  }, [models])
  const totalProviderModelSlots = sortedModels.reduce((sum, model) => sum + providerCount(model), 0)
  const maxVram = sortedModels.reduce((max, model) => Math.max(max, Number(model.max_vram_available_gb || 0)), 0)
  const onlineProviders = Number(health?.providers?.online ?? 0)
  const servingProviders = Number(health?.providers?.serving ?? 0)

  return (
    <>
      <SiteHeader active="/providers" />

      <section className="directory-hero">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ Providers · public-safe aggregate" ar="§ المزوّدون · تجميع عام آمن" /></span>
            <span><Bi en="No provider identities exposed" ar="لا تُكشف هويات المزوّدين" /></span>
          </div>
          <h1>
            <BiX
              en={<>The provider network, <em>without private fleet leakage.</em></>}
              ar={<>شبكة المزوّدين، <em>دون تسريب بيانات الأسطول الخاصة.</em></>}
            />
          </h1>
          <p className="lead">
            <Bi
              en="This page gives renters and prospective providers a public view of DCP supply: aggregate model coverage, health gates, and the onboarding path. It never renders provider names, provider IDs, WireGuard addresses, endpoints, or private fleet rows."
              ar="تعرض هذه الصفحة للمستأجرين والمزوّدين المحتملين صورة عامة عن عرض DCP: تغطية النماذج المجمعة، بوابات الصحة، ومسار الانضمام. ولا تعرض أسماء المزوّدين أو معرّفاتهم أو عناوين WireGuard أو نقاط النهاية أو صفوف الأسطول الخاصة."
            />
          </p>
          <div className="directory-actions">
            <Link className="btn primary lg" href="/provider-setup"><Bi en="Become a provider ->" ar="كن مزوّداً ←" /></Link>
            <Link className="btn ghost lg" href="/marketplace"><Bi en="View marketplace" ar="شاهد السوق" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 24 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Public aggregate" ar="§ ٠١ · التجميع العام" /></span>
            <span><Bi en="Source: /api/providers/models + /api/health/detailed" ar="المصدر: /api/providers/models + /api/health/detailed" /></span>
          </div>

          <div className="directory-metrics" aria-label="Provider network public metrics">
            <article className="directory-metric">
              <span><Bi en="Model families" ar="عائلات النماذج" /></span>
              <strong>{modelState === 'ready' ? sortedModels.length : modelState}</strong>
              <em><Bi en="from /api/providers/models" ar="من /api/providers/models" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Provider-model slots" ar="خانات مزوّد/نموذج" /></span>
              <strong>{modelState === 'ready' ? totalProviderModelSlots : modelState}</strong>
              <em><Bi en="aggregate count only" ar="عدد مجمع فقط" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Serving providers" ar="مزوّدون يخدمون" /></span>
              <strong>{healthState === 'ready' ? `${servingProviders}/${onlineProviders}` : healthState}</strong>
              <em><Bi en="health endpoint aggregate" ar="تجميع نقطة الصحة" /></em>
            </article>
            <article className="directory-metric">
              <span><Bi en="Max VRAM class" ar="أكبر فئة VRAM" /></span>
              <strong>{modelState === 'ready' ? formatVram(maxVram) : modelState}</strong>
              <em><Bi en="no machine identity exposed" ar="دون كشف هوية الجهاز" /></em>
            </article>
          </div>

          <div className="directory-panel">
            <div className="directory-panel-head">
              <span><Bi en="Provider model coverage" ar="تغطية نماذج المزوّدين" /></span>
              <b dir="ltr">GET /api/providers/models</b>
            </div>
            {modelState === 'loading' && (
              <div className="directory-empty">
                <strong><Bi en="Loading provider aggregate" ar="تحميل تجميع المزوّدين" /></strong>
                <Bi en="The page is querying public model coverage." ar="تستعلم الصفحة عن تغطية النماذج العامة." />
              </div>
            )}
            {modelState === 'error' && (
              <div className="directory-empty">
                <strong><Bi en="Provider aggregate unavailable" ar="تجميع المزوّدين غير متاح" /></strong>
                <Bi en="No provider capacity claim is made while the aggregate cannot be read." ar="لا تقدم الصفحة ادعاء سعة مزوّد عندما لا يمكن قراءة التجميع." />
              </div>
            )}
            {modelState === 'ready' && sortedModels.length === 0 && (
              <div className="directory-empty">
                <strong><Bi en="No public coverage rows" ar="لا توجد صفوف تغطية عامة" /></strong>
                <Bi en="An empty provider-model aggregate is treated as an honest fleet state." ar="يُعامل تجميع المزود/النموذج الفارغ كحالة أسطول صادقة." />
              </div>
            )}
            {modelState === 'ready' && sortedModels.length > 0 && (
              <div className="directory-table">
                {sortedModels.slice(0, 12).map((model) => (
                  <article className="directory-row is-live" key={model.model_id}>
                    <span>
                      <b>{modelName(model)}</b>
                      <code dir="ltr">{model.model_id}</code>
                    </span>
                    <span>
                      <em><Bi en="Providers" ar="المزوّدون" /></em>
                      <b>{providerCount(model)}</b>
                    </span>
                    <span>
                      <em><Bi en="Max VRAM" ar="أكبر VRAM" /></em>
                      <b>{formatVram(model.max_vram_available_gb)}</b>
                    </span>
                    <span>
                      <em><Bi en="Rate basis" ar="أساس السعر" /></em>
                      <b>{formatSarPerHour(model.min_price_sar_per_hr)}</b>
                    </span>
                    <span>
                      <em><Bi en="Privacy" ar="الخصوصية" /></em>
                      <b><Bi en="aggregate only" ar="تجميع فقط" /></b>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="directory-proof" aria-label="Provider publication gates">
            {PROVIDER_GATES.map((gate) => (
              <article key={gate.k}>
                <span>{gate.k}</span>
                <h2><Bi en={gate.titleEn} ar={gate.titleAr} /></h2>
                <p><Bi en={gate.en} ar={gate.ar} /></p>
              </article>
            ))}
          </div>

          <div className="directory-link-grid" aria-label="Provider next steps">
            <Link href="/provider-setup">
              <strong><Bi en="Join" ar="انضم" /></strong>
              <span><Bi en="Start provider onboarding, install the daemon, and verify your machine before public capacity appears." ar="ابدأ انضمام المزوّد، ثبّت الوكيل، وتحقق من جهازك قبل ظهور السعة العامة." /></span>
              <em><Bi en="Provider setup" ar="إعداد المزوّد" /></em>
            </Link>
            <Link href="/provider/dashboard">
              <strong><Bi en="Operate" ar="شغّل" /></strong>
              <span><Bi en="Manage rigs, health, earnings, and payouts from the provider console." ar="أدر الأجهزة والصحة والأرباح والمدفوعات من لوحة المزوّد." /></span>
              <em><Bi en="Provider console" ar="لوحة المزوّد" /></em>
            </Link>
            <Link href="/docs#provider-onboarding">
              <strong><Bi en="Document" ar="وثّق" /></strong>
              <span><Bi en="Read the provider flow, daemon install path, and publication rules in the public docs." ar="اقرأ مسار المزوّد وتثبيت الوكيل وقواعد النشر في التوثيق العام." /></span>
              <em><Bi en="Provider docs" ar="توثيق المزوّد" /></em>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
