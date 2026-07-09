'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

const BATCH_GATES = [
  {
    k: 'jsonl_validation',
    tEn: 'JSONL validation',
    tAr: 'تحقق JSONL',
    en: 'Batch inputs are normalized, hashed, capped by request and byte limits, and stored as renter-scoped metadata.',
    ar: 'تُطبّع مدخلات الدُفعات وتُبصم وتُقيّد بعدد الطلبات والحجم وتُحفظ كبيانات حسب المستأجر.',
  },
  {
    k: 'line_ledger',
    tEn: 'Per-line ledger',
    tAr: 'سجل لكل سطر',
    en: 'Each request line has custom id, endpoint, model id, checksum, lifecycle, usage, and future settlement fields.',
    ar: 'كل سطر طلب له معرّف مخصص ونقطة نهاية ونموذج وبصمة ودورة حياة واستخدام وحقول تسوية مستقبلية.',
  },
  {
    k: 'result_manifest',
    tEn: 'Result manifest proof',
    tAr: 'إثبات ملف النتائج',
    en: 'Result metadata is only considered available when the completed batch has a result key and checksum proof.',
    ar: 'لا تُعد بيانات النتائج متاحة إلا عندما تملك الدفعة المكتملة مفتاح نتيجة وإثبات بصمة.',
  },
  {
    k: 'discounts',
    tEn: 'Discounts gated',
    tAr: 'الخصومات مقيدة',
    en: 'Batch discounts and settlement stay off until worker execution and billing proof are enabled.',
    ar: 'تبقى خصومات الدُفعات والتسوية متوقفة حتى يتم تفعيل إثبات تشغيل العامل والفوترة.',
  },
  {
    k: 'live_acceptance',
    tEn: 'Live proof gate',
    tAr: 'بوابة الإثبات الحي',
    en: 'The next opt-in proof is DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution; execution and discounts stay disabled until it passes with result and settlement evidence.',
    ar: 'الإثبات التالي هو DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution؛ يبقى التشغيل والخصم معطلين حتى ينجح مع أدلة النتائج والتسوية.',
  },
] as const

const BATCH_SNIPPET = `curl -s https://api.dcp.sa/api/batches/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s https://api.dcp.sa/api/batches \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "batch_id": "batch_support_triage_001",
    "completion_window": "24h",
    "input_jsonl": "{\"custom_id\":\"ticket-001\",\"method\":\"POST\",\"url\":\"/v1/chat/completions\",\"body\":{\"model\":\"qwen/qwen3-coder\",\"messages\":[{\"role\":\"user\",\"content\":\"Classify this ticket.\"}]}}"
  }'`

type ReadinessState = 'loading' | 'ready' | 'error'

interface BatchReadinessFeature {
  status?: string
  enabled?: boolean
  configured?: boolean
  enabled_for_completed_results?: boolean
  public_enabled?: boolean
}

interface BatchLiveGate {
  status?: string
  command?: string
  live_acceptance_gate?: string
  blocked_on?: string[]
  verifies?: string[]
}

interface PublicBatchReadiness {
  object?: string
  version?: string
  current_mode?: string
  public_view?: boolean
  public_execution_enabled?: boolean
  request_creation_enabled?: boolean
  supported_urls?: string[]
  limits?: {
    completion_windows?: string[]
  }
  features?: {
    jsonl_validation?: BatchReadinessFeature
    line_ledger?: BatchReadinessFeature
    result_downloads?: BatchReadinessFeature
    worker_execution?: BatchReadinessFeature
    settlement?: BatchReadinessFeature
    discounts?: BatchReadinessFeature
    model_capability_flag?: BatchReadinessFeature
  }
  live_acceptance?: {
    execution_discount_smoke?: BatchLiveGate
  }
  claims?: {
    batch_execution_live?: boolean
    batch_discount_live?: boolean
    model_batch_capability_live?: boolean
  }
}

function formatMode(value?: string | null): string {
  return String(value || 'gated').replace(/_/g, ' ')
}

function featureStatus(feature?: BatchReadinessFeature, fallback = 'gated'): string {
  if (!feature) return fallback
  if (feature.public_enabled || feature.enabled) return 'available'
  if (feature.configured) return formatMode(feature.status || 'configured')
  return formatMode(feature.status || fallback)
}

export default function BatchProductPage() {
  const [readinessState, setReadinessState] = useState<ReadinessState>('loading')
  const [readiness, setReadiness] = useState<PublicBatchReadiness | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadPublicReadiness() {
      setReadinessState('loading')
      try {
        const res = await fetch('/api/batches/public/readiness', { cache: 'no-store' })
        if (!res.ok) throw new Error(`batch public readiness failed: ${res.status}`)
        const data = (await res.json()) as { readiness?: PublicBatchReadiness }
        if (!cancelled) {
          setReadiness(data.readiness?.object === 'batch_inference_readiness' ? data.readiness : null)
          setReadinessState('ready')
        }
      } catch {
        if (!cancelled) {
          setReadiness(null)
          setReadinessState('error')
        }
      }
    }
    loadPublicReadiness()
    return () => {
      cancelled = true
    }
  }, [])

  const liveGate = readiness?.live_acceptance?.execution_discount_smoke || null
  const publicExecutionLive = readiness?.public_execution_enabled === true
  const discountsLive = readiness?.claims?.batch_discount_live === true || readiness?.features?.discounts?.enabled === true
  const createLive = readiness?.request_creation_enabled !== false

  return (
    <>
      <SiteHeader active="/batch" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/swarm.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Batch inference · validation-first contract" ar="استدلال دُفعي · عقد يبدأ بالتحقق" /></span>
            <span><Bi en="Fireworks-style rail, DCP-honest gates" ar="مسار بأسلوب Fireworks، وبوابات صادقة من DCP" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.6rem, 1.2rem + 4.6vw, 5rem)', lineHeight: 0.96, letterSpacing: '-.02em', maxWidth: 930, margin: '22px 0 18px' }}>
            <BiX
              en={<>Batch inference for large Saudi workloads, <em style={{ fontStyle: 'italic' }}>without pretending discounts are live.</em></>}
              ar={<>استدلال دُفعي لأحمال سعودية كبيرة، <em>دون ادعاء أن الخصومات تعمل الآن.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 735, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP exposes the Batch product contract before public execution: validate JSONL, create renter-scoped metadata records, inspect line-ledger proof, and read result-manifest gates. Worker execution, discounted settlement, and model batch-capability flags stay gated until evidence lands."
              ar="يعرض DCP عقد منتج الدُفعات قبل التشغيل العام: تحقق JSONL، وإنشاء سجلات بيانات حسب المستأجر، وفحص إثبات سجل السطور، وقراءة بوابات ملف النتائج. يبقى تشغيل العامل والتسوية المخفضة وأعلام قدرة النموذج للدُفعات مقيدة حتى يصل الدليل."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/renter/batches"><Bi en="Open Batch console ->" ar="افتح لوحة الدُفعات ←" /></Link>
            <Link className="btn ghost" href="/docs"><Bi en="Read API docs" ar="اقرأ توثيق API" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Readiness contract" ar="§ ٠١ · عقد الجاهزية" /></span>
            <span><Bi en="What is visible now" ar="ما هو مرئي الآن" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {BATCH_GATES.map((gate) => (
              <article className="mg" key={gate.k}>
                <span className="org">{gate.k}</span>
                <h3 className="nm"><Bi en={gate.tEn} ar={gate.tAr} /></h3>
                <p><Bi en={gate.en} ar={gate.ar} /></p>
                <div className="meta">
                  <span><Bi en="Source" ar="المصدر" /></span>
                  <b dir="ltr">{gate.k === 'discounts' ? 'claim guard' : gate.k === 'live_acceptance' ? 'live_acceptance.execution_discount_smoke' : '/api/batches/readiness'}</b>
                </div>
              </article>
            ))}
          </div>
          <div className="inference-prompt-cache-live" aria-live="polite" aria-label="Public batch readiness">
            <div className="prompt-cache-live-head">
              <span><Bi en="Live Batch readiness" ar="جاهزية الدُفعات الحية" /></span>
              <b dir="ltr">{readiness?.version || 'dcp.batch_inference_readiness.v1'}</b>
            </div>
            {readinessState === 'loading' && (
              <p className="prompt-cache-live-empty">
                <Bi en="Loading batch readiness..." ar="تحميل جاهزية الدُفعات..." />
              </p>
            )}
            {readinessState === 'error' && (
              <p className="prompt-cache-live-empty">
                <Bi en="Batch readiness is temporarily unavailable; execution and discounts remain gated." ar="جاهزية الدُفعات غير متاحة مؤقتاً؛ يبقى التشغيل والخصم مقيدين." />
              </p>
            )}
            {readinessState === 'ready' && (
              <>
                <div className="prompt-cache-live-metrics">
                  <span>
                    <em><Bi en="Mode" ar="الوضع" /></em>
                    <strong>{formatMode(readiness?.current_mode || 'metadata_validation_only')}</strong>
                  </span>
                  <span>
                    <em><Bi en="Create" ar="الإنشاء" /></em>
                    <strong>{createLive ? 'available' : 'gated'}</strong>
                  </span>
                  <span>
                    <em><Bi en="Execute" ar="التشغيل" /></em>
                    <strong>{publicExecutionLive ? 'live' : 'gated'}</strong>
                  </span>
                </div>
                <div className="prompt-cache-live-list">
                  <span className={readiness?.features?.jsonl_validation?.enabled ? 'available' : 'gated'}>
                    <b><Bi en="JSONL validation" ar="تحقق JSONL" /></b>
                    <em>{featureStatus(readiness?.features?.jsonl_validation)}</em>
                  </span>
                  <span className={readiness?.features?.line_ledger?.enabled ? 'available' : 'gated'}>
                    <b><Bi en="Line ledger" ar="سجل الأسطر" /></b>
                    <em>{featureStatus(readiness?.features?.line_ledger)}</em>
                  </span>
                  <span className="gated">
                    <b><Bi en="Worker execution" ar="تشغيل العامل" /></b>
                    <em>{featureStatus(readiness?.features?.worker_execution)}</em>
                  </span>
                  <span className="gated">
                    <b><Bi en="Result downloads" ar="تنزيل النتائج" /></b>
                    <em>{featureStatus(readiness?.features?.result_downloads)}</em>
                  </span>
                  <span className="gated">
                    <b><Bi en="Settlement" ar="التسوية" /></b>
                    <em>{featureStatus(readiness?.features?.settlement)}</em>
                  </span>
                  <span className={discountsLive ? 'available' : 'gated'}>
                    <b><Bi en="Batch discounts" ar="خصومات الدُفعات" /></b>
                    <em>{discountsLive ? 'live' : featureStatus(readiness?.features?.discounts)}</em>
                  </span>
                  {liveGate?.blocked_on?.slice(0, 3).map((blocker) => (
                    <span key={blocker} className="gated">
                      <b>{blocker}</b>
                      <em>blocker</em>
                    </span>
                  ))}
                </div>
                <p className="prompt-cache-live-note" dir="ltr">
                  GET /api/batches/public/readiness · {liveGate?.command || 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution'}
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
                src="/home/inference.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="GPU inference visual representing batch request validation and future worker execution"
              />
              <span className="pshow-cap" dir="ltr">fig. 03 - batch validation to proof ledger</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · API shape" ar="§ ٠٢ · شكل API" /></span>
                <span><Bi en="Create metadata first" ar="أنشئ البيانات أولاً" /></span>
              </div>
              <h2>
                <BiX en={<>Submit JSONL when you need a ledger. <em>Wait for proof before billing claims.</em></>} ar={<>أرسل JSONL عندما تحتاج سجلاً. <em>وانتظر الإثبات قبل ادعاءات الفوترة.</em></>} />
              </h2>
              <p>
                <Bi
                  en="The same readiness contract powers the renter Batch console. It lets developers build against stable endpoints while DCP keeps the expensive parts behind worker, result, and settlement gates."
                  ar="يشغّل عقد الجاهزية نفسه لوحة الدُفعات للمستأجر. يتيح للمطورين البناء فوق نقاط نهاية ثابتة بينما يبقي DCP الأجزاء المكلفة خلف بوابات العامل والنتائج والتسوية."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="Batch API snippets">{BATCH_SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="Creation validates and records input metadata; it does not promise production execution." ar="يتحقق الإنشاء من بيانات الإدخال ويسجلها؛ ولا يعد بتشغيل إنتاجي." /></li>
                <li><Bi en="Downloads require completed-result key and checksum proof." ar="تتطلب التنزيلات مفتاح نتيجة مكتملة وإثبات بصمة." /></li>
                <li><Bi en="Discounts stay gated until settlement proof is attached to completed worker output." ar="تبقى الخصومات مقيدة حتى يرتبط إثبات التسوية بمخرجات عامل مكتملة." /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Product boundary" ar="حدود المنتج" /></span>
              <h3><Bi en="Batch is a product rail now. Execution is still an evidence gate." ar="الدُفعات أصبحت مسار منتج الآن. التشغيل لا يزال بوابة دليل." /></h3>
              <p>
                <Bi
                  en="This page packages the shipped contract like a Fireworks-style product without hiding the current state. The next backend slices are worker smoke, result artifact proof, settlement proof, then discounts."
                  ar="تغلف هذه الصفحة العقد المشحون كمنتج بأسلوب Fireworks دون إخفاء الحالة الحالية. شرائح الخلفية التالية هي دخان العامل، وإثبات أثر النتائج، وإثبات التسوية، ثم الخصومات."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/renter/batches"><Bi en="Open console" ar="افتح اللوحة" /></Link>
                <Link className="btn ghost" href="/inference"><Bi en="Use live inference" ar="استخدم الاستدلال الحي" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Batch gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">request_creation</span>
                <p><Bi en="Validate JSONL and create renter-scoped batch metadata records." ar="تحقق JSONL وأنشئ سجلات بيانات دُفعات حسب المستأجر." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">worker_execution</span>
                <p><Bi en="Future worker execution must prove every completed line before settlement." ar="يجب أن يثبت تشغيل العامل المستقبلي كل سطر مكتمل قبل التسوية." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">discount_settlement</span>
                <p><Bi en="Discounts remain false until the billing path is verified on completed result artifacts." ar="تبقى الخصومات غير مفعّلة حتى يتم التحقق من مسار الفوترة على آثار النتائج المكتملة." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
