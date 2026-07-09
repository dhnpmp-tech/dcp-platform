'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

const DEPLOYMENT_GATES = [
  {
    k: 'deployment_intent',
    tEn: 'Deployment intent rows',
    tAr: 'صفوف نية النشر',
    en: 'Renter-owned adapter deployment records exist before traffic is routed.',
    ar: 'توجد سجلات نشر المحولات حسب المستأجر قبل توجيه الحركة.',
  },
  {
    k: 'load_proof',
    tEn: 'vLLM load proof',
    tAr: 'إثبات تحميل vLLM',
    en: 'Endpoint proof must match deployment id, adapter id, base model, mode, and artifact checksum.',
    ar: 'يجب أن يطابق إثبات النقطة معرّف النشر والمحول والنموذج الأساسي والوضع وبصمة الأثر.',
  },
  {
    k: 'endpoint_smoke',
    tEn: 'Endpoint smoke readiness',
    tAr: 'جاهزية دخان النقطة',
    en: 'A funded deterministic smoke must prove response hash, latency, token totals, and adapter trace before route or billing claims.',
    ar: 'يجب أن يثبت دخان حتمي ممول بصمة الاستجابة والزمن والرموز وتتبع المحول قبل ادعاءات التوجيه أو الفوترة.',
  },
  {
    k: 'route_traffic',
    tEn: 'Route traffic gate',
    tAr: 'بوابة توجيه الحركة',
    en: 'Traffic stays off until the backend records matching proof for the deployment, endpoint, and artifact.',
    ar: 'تبقى الحركة متوقفة حتى تسجل الخلفية إثباتا مطابقا للنشر والنقطة والأثر.',
  },
  {
    k: 'usage_attribution',
    tEn: 'Usage attribution readiness',
    tAr: 'جاهزية نسب الاستخدام',
    en: 'Usage rows stay disabled until they can prove deployment, adapter, endpoint, checksum, provider, request, scoped-key, token, cost, and pending settlement fields.',
    ar: 'تبقى صفوف الاستخدام معطلة حتى تثبت حقول النشر والمحول والنقطة والبصمة والمزود والطلب والمفتاح والرموز والتكلفة والتسوية المعلقة.',
  },
  {
    k: 'billing_readiness',
    tEn: 'Billing readiness',
    tAr: 'جاهزية الفوترة',
    en: 'Adapter billing stays off until endpoint smoke, funded principal, usage attribution, and settlement policy are approved.',
    ar: 'تبقى فوترة المحول متوقفة حتى اعتماد دخان النقطة والرصيد الممول ونسب الاستخدام وسياسة التسوية.',
  },
  {
    k: 'multi_lora',
    tEn: 'Multi-LoRA later',
    tAr: 'تعدد LoRA لاحقاً',
    en: 'Live merge and multi-LoRA are product targets, not public serving claims until controlled smoke proof exists.',
    ar: 'الدمج الحي وتعدد LoRA أهداف منتج، وليست ادعاءات خدمة عامة حتى يوجد إثبات دخان مضبوط.',
  },
] as const

const DEPLOY_SNIPPET = `curl -s "https://api.dcp.sa/api/adapters/deployments?limit=25" \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s https://api.dcp.sa/api/adapters/adpt_support_arabic/deployments \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "deployment_id": "adpl_support_arabic_001",
    "mode": "single_adapter_live_merge",
    "endpoint_id": "endpoint_qwen_arabic_01",
    "route_traffic": false
  }'

curl -s https://api.dcp.sa/api/adapters/endpoints/smoke/readiness

curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/endpoint-smoke \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/endpoint-smoke \\
  -X POST \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"funded_smoke_principal":true,"smoke_result":{"request_id":"req_smoke_001"}}'

curl -s https://api.dcp.sa/api/adapters/usage/attribution/readiness

curl -s https://api.dcp.sa/api/adapters/settlement/readiness

curl -s https://api.dcp.sa/api/adapters/billing/approval/readiness

curl -s https://api.dcp.sa/api/adapters/billing/readiness`

const READINESS_ENDPOINTS = [
  {
    id: 'artifact_policy',
    title: 'Artifact policy',
    path: '/api/adapters/artifacts/readiness',
    fallbackMode: 'artifact_policy_contract_only',
  },
  {
    id: 'endpoint_smoke',
    title: 'Endpoint smoke',
    path: '/api/adapters/endpoints/smoke/readiness',
    fallbackMode: 'endpoint_smoke_contract_only',
  },
  {
    id: 'usage_attribution',
    title: 'Usage attribution',
    path: '/api/adapters/usage/attribution/readiness',
    fallbackMode: 'usage_attribution_contract_only',
  },
  {
    id: 'settlement',
    title: 'Settlement',
    path: '/api/adapters/settlement/readiness',
    fallbackMode: 'settlement_policy_contract_only',
  },
  {
    id: 'founder_approval',
    title: 'Founder approval',
    path: '/api/adapters/billing/approval/readiness',
    fallbackMode: 'approval_policy_contract_only',
  },
  {
    id: 'adapter_billing',
    title: 'Adapter billing',
    path: '/api/adapters/billing/readiness',
    fallbackMode: 'billing_policy_contract_only',
  },
] as const

type ReadinessState = 'loading' | 'ready' | 'error'

type ReadinessEndpointId = typeof READINESS_ENDPOINTS[number]['id']

interface AdapterReadinessPacket {
  object?: string
  version?: string
  current_mode?: string
  endpoints?: Record<string, string>
  artifact_policy?: {
    policy_available?: boolean
    artifact_upload_endpoint_enabled?: boolean
    artifact_storage_write_enabled?: boolean
    adapter_serving_enabled?: boolean
    route_traffic_enabled?: boolean
  }
  policy?: {
    readiness_available?: boolean
    endpoint_smoke_recording_enabled?: boolean
    adapter_endpoint_routing_enabled?: boolean
    adapter_usage_attribution_enabled?: boolean
    adapter_usage_ledger_writes_enabled?: boolean
    adapter_settlement_enabled?: boolean
    provider_payouts_enabled?: boolean
    founder_billing_approval_live?: boolean
    adapter_billing_enabled?: boolean
    adapter_inference_billing_enabled?: boolean
    dispatches_inference?: boolean
  }
  claim_guards?: Record<string, boolean | undefined>
  next_actions?: string[]
}

type AdapterReadinessMap = Partial<Record<ReadinessEndpointId, AdapterReadinessPacket>>

function formatStatus(value: string | undefined): string {
  if (!value) return 'contract only'
  return value.replace(/_/g, ' ')
}

function packetLive(packet: AdapterReadinessPacket | undefined): boolean {
  return packet?.claim_guards?.readiness_contract_live === true
    || packet?.claim_guards?.policy_contract_live === true
    || packet?.artifact_policy?.policy_available === true
    || packet?.policy?.readiness_available === true
}

function blocksTraffic(packet: AdapterReadinessPacket | undefined): boolean {
  if (!packet) return false
  return packet.claim_guards?.routes_adapter_traffic === false
    || packet.claim_guards?.enables_adapter_serving === false
    || packet.policy?.adapter_endpoint_routing_enabled === false
    || packet.artifact_policy?.route_traffic_enabled === false
    || packet.artifact_policy?.adapter_serving_enabled === false
}

function blocksBilling(packet: AdapterReadinessPacket | undefined): boolean {
  if (!packet) return false
  return packet.claim_guards?.enables_adapter_billing === false
    || packet.claim_guards?.bills_adapter_inference === false
    || packet.policy?.adapter_billing_enabled === false
    || packet.policy?.adapter_inference_billing_enabled === false
    || packet.policy?.adapter_settlement_enabled === false
    || packet.policy?.founder_billing_approval_live === false
}

export default function DedicatedDeploymentsProductPage() {
  const [readinessState, setReadinessState] = useState<ReadinessState>('loading')
  const [readinessPackets, setReadinessPackets] = useState<AdapterReadinessMap>({})

  useEffect(() => {
    let cancelled = false
    async function loadReadiness() {
      setReadinessState('loading')
      try {
        const entries = await Promise.all(READINESS_ENDPOINTS.map(async (endpoint) => {
          const res = await fetch(endpoint.path, { cache: 'no-store' })
          if (!res.ok) throw new Error(`${endpoint.id} failed: ${res.status}`)
          return [endpoint.id, await res.json()] as const
        }))
        if (!cancelled) {
          setReadinessPackets(Object.fromEntries(entries) as AdapterReadinessMap)
          setReadinessState('ready')
        }
      } catch {
        if (!cancelled) {
          setReadinessPackets({})
          setReadinessState('error')
        }
      }
    }
    loadReadiness()
    return () => {
      cancelled = true
    }
  }, [])

  const readinessRows = useMemo(() => {
    return READINESS_ENDPOINTS.map((endpoint) => {
      const packet = readinessPackets[endpoint.id]
      return {
        ...endpoint,
        packet,
        mode: packet?.current_mode || endpoint.fallbackMode,
        version: packet?.version || 'pending',
        live: packetLive(packet),
        trafficBlocked: blocksTraffic(packet),
        billingBlocked: blocksBilling(packet),
      }
    })
  }, [readinessPackets])
  const liveContractCount = readinessRows.filter((row) => row.live).length
  const trafficBlockedCount = readinessRows.filter((row) => row.trafficBlocked).length
  const billingBlockedCount = readinessRows.filter((row) => row.billingBlocked).length
  const billingPacket = readinessPackets.adapter_billing
  const smokePacket = readinessPackets.endpoint_smoke
  const nextAdapterAction = billingPacket?.next_actions?.[0]
    || smokePacket?.next_actions?.[0]
    || 'Run strict adapter vLLM load proof against a real serving endpoint.'

  return (
    <>
      <SiteHeader active="/dedicated-deployments" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/rig.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Dedicated deployments · endpoint proof first" ar="نشرات مخصصة · إثبات النقطة أولاً" /></span>
            <span><Bi en="Persistent serving for adapters, gated by evidence" ar="خدمة مستمرة للمحولات، مقيدة بالدليل" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.55rem, 1.15rem + 4.6vw, 5rem)', lineHeight: 0.96, letterSpacing: '-.02em', maxWidth: 950, margin: '22px 0 18px' }}>
            <BiX
              en={<>Dedicated endpoints for custom models and LoRA adapters, <em style={{ fontStyle: 'italic' }}>only after load proof.</em></>}
              ar={<>نقاط نهاية مخصصة للنماذج والمحولات، <em>فقط بعد إثبات التحميل.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 740, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP's dedicated-deployment rail connects Pods, Fine-Tuning, and Inference: create an adapter, request a deployment intent, prove the serving endpoint loaded the right artifact, smoke it with hashed response evidence, then route billed traffic. Today the intent, load-proof, endpoint-smoke, usage, and billing contracts are visible; public traffic remains gated."
              ar="يربط مسار النشرات المخصصة في DCP بين الحاويات والضبط الدقيق والاستدلال: أنشئ محولاً، واطلب نية نشر، وأثبت أن نقطة الخدمة حملت الأثر الصحيح، ثم وجّه حركة مفوترة. اليوم عقود النية والإثبات مرئية؛ وتبقى الحركة العامة مقيدة."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/renter/fine-tuning"><Bi en="Inspect deployment intents ->" ar="افحص نوايا النشر ←" /></Link>
            <Link className="btn ghost" href="/inference"><Bi en="Use live inference" ar="استخدم الاستدلال الحي" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · What is shipped" ar="§ ٠١ · ما تم شحنه" /></span>
            <span><Bi en="Intent and proof, not traffic yet" ar="نية وإثبات، وليس حركة بعد" /></span>
          </div>
          <div className="dedicated-readiness-live" aria-live="polite">
            <div className="dedicated-readiness-head">
              <span><Bi en="Adapter readiness contracts" ar="عقود جاهزية المحولات" /></span>
              <b dir="ltr">GET /api/adapters/*/readiness</b>
            </div>
            {readinessState === 'loading' && (
              <p className="dedicated-readiness-empty">
                <Bi en="Loading adapter deployment readiness..." ar="تحميل جاهزية نشر المحولات..." />
              </p>
            )}
            {readinessState === 'error' && (
              <p className="dedicated-readiness-empty">
                <Bi en="Adapter readiness is temporarily unavailable; route traffic and billing stay gated." ar="جاهزية المحولات غير متاحة مؤقتاً؛ تبقى الحركة والفوترة مقيدة." />
              </p>
            )}
            {readinessState === 'ready' && (
              <>
                <div className="dedicated-readiness-metrics">
                  <span>
                    <em><Bi en="Contracts live" ar="العقود الحية" /></em>
                    <strong>{liveContractCount}/{READINESS_ENDPOINTS.length}</strong>
                  </span>
                  <span>
                    <em><Bi en="Traffic gates blocked" ar="بوابات الحركة المقيدة" /></em>
                    <strong>{trafficBlockedCount}</strong>
                  </span>
                  <span>
                    <em><Bi en="Billing gates blocked" ar="بوابات الفوترة المقيدة" /></em>
                    <strong>{billingBlockedCount}</strong>
                  </span>
                </div>
                <div className="dedicated-readiness-list">
                  {readinessRows.map((row) => (
                    <div key={row.id} className={row.live ? 'contract-live' : 'contract-pending'}>
                      <span>
                        <b>{row.title}</b>
                        <i dir="ltr">{row.path}</i>
                      </span>
                      <span>
                        <em><Bi en="Mode" ar="الوضع" /></em>
                        <strong>{formatStatus(row.mode)}</strong>
                      </span>
                      <span>
                        <em><Bi en="Traffic" ar="الحركة" /></em>
                        <strong>{row.trafficBlocked ? 'gated' : 'checking'}</strong>
                      </span>
                      <span>
                        <em><Bi en="Billing" ar="الفوترة" /></em>
                        <strong>{row.billingBlocked ? 'gated' : 'checking'}</strong>
                      </span>
                      <small dir="ltr">{row.version}</small>
                    </div>
                  ))}
                </div>
                <p className="dedicated-readiness-note">
                  <Bi en={nextAdapterAction} ar="الإجراء التالي: شغّل إثبات تحميل vLLM الصارم للمحول على نقطة خدمة حقيقية." />
                </p>
              </>
            )}
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {DEPLOYMENT_GATES.map((gate) => (
              <article className="mg" key={gate.k}>
                <span className="org">{gate.k}</span>
                <h3 className="nm"><Bi en={gate.tEn} ar={gate.tAr} /></h3>
                <p><Bi en={gate.en} ar={gate.ar} /></p>
                <div className="meta">
                  <span><Bi en="Status" ar="الحالة" /></span>
                  <b><Bi en={gate.k === 'route_traffic' || gate.k === 'endpoint_smoke' ? 'gated' : 'contract visible'} ar={gate.k === 'route_traffic' || gate.k === 'endpoint_smoke' ? 'مقيد' : 'العقد مرئي'} /></b>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="pshow">
            <div className="pshow-media">
              <img
                src="/home/pods.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="GPU rack visual representing a future dedicated DCP endpoint for custom model serving"
              />
              <span className="pshow-cap" dir="ltr">fig. 04 - adapter intent to endpoint proof</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · Deployment API" ar="§ ٠٢ · واجهة النشر" /></span>
                <span><Bi en="Read rows, create intent" ar="اقرأ الصفوف، وأنشئ النية" /></span>
              </div>
              <h2>
                <BiX en={<>The product contract is ready for operators. <em>The endpoint must still prove itself.</em></>} ar={<>عقد المنتج جاهز للمشغلين. <em>لكن على النقطة إثبات نفسها.</em></>} />
              </h2>
              <p>
                <Bi
                  en="The deployed endpoint becomes real only when the backend receives matching load proof from the serving layer for the deployment id, adapter id, base model, mode, endpoint id, and checksum. Endpoint smoke then has to prove a funded deterministic request, response hash, latency, token totals, and adapter trace. The POST route is live only as a disabled validation contract that returns 409 and records nothing. Until then, deployment rows are planning and audit records, not public route promises."
                  ar="تصبح نقطة النهاية المنشورة حقيقية فقط عندما تستقبل الخلفية إثبات تحميل مطابقاً من طبقة الخدمة. حتى ذلك الحين، صفوف النشر سجلات تخطيط وتدقيق، وليست وعود توجيه عامة."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="Dedicated deployment API snippets">{DEPLOY_SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="Single-adapter live merge is first; multi-LoRA waits for controlled vLLM smoke." ar="دمج محول واحد أولاً؛ وينتظر تعدد LoRA دخان vLLM مضبوطاً." /></li>
                <li><Bi en="Route traffic remains false until deployment, adapter, base model, mode, endpoint, and checksum proof match." ar="تبقى حركة التوجيه غير مفعلة حتى يتطابق إثبات النشر والمحول والنموذج الأساسي والوضع والنقطة والبصمة." /></li>
                <li><Bi en="Usage writes and billed inference start only after endpoint smoke proves response hash, latency, token totals, adapter trace, funded principal, usage attribution, and settlement policy." ar="تبدأ كتابة الاستخدام والاستدلال المفوتر فقط بعد اعتماد دخان النقطة والرصيد الممول ونسب الاستخدام وسياسة التسوية." /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Fireworks-style boundary" ar="حد بأسلوب Fireworks" /></span>
              <h3><Bi en="Dedicated deployments are the bridge between LoRA and revenue." ar="النشرات المخصصة هي الجسر بين LoRA والإيراد." /></h3>
              <p>
                <Bi
                  en="Fireworks separates serverless inference from fine-tuned LoRA deployment. DCP should do the same: public inference for general models, dedicated endpoints for customer adapters, and traffic only after proof."
                  ar="تفصل Fireworks بين الاستدلال بلا خادم ونشر محولات LoRA المضبوطة. يجب أن يفعل DCP الشيء نفسه: استدلال عام للنماذج العامة، ونقاط مخصصة لمحولات العملاء، وحركة فقط بعد الإثبات."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/fine-tuning"><Bi en="Prepare an adapter" ar="جهّز محولاً" /></Link>
                <Link className="btn ghost" href="/pods"><Bi en="Rent a GPU pod" ar="استأجر حاوية GPU" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Dedicated deployment gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">adapter_ready</span>
                <p><Bi en="Adapter artifact metadata must be registered and ready." ar="يجب تسجيل بيانات أثر المحول وأن تكون جاهزة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">serving_load_proof</span>
                <p><Bi en="The endpoint reports matching deployment id, adapter id, base model, mode, endpoint id, and checksum." ar="تبلّغ النقطة عن معرف نشر ومحول ونموذج أساسي ووضع ونقطة وبصمة مطابقة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">endpoint_smoke</span>
                <p><Bi en="A funded deterministic request proves response hash, latency, token totals, and adapter trace." ar="يثبت طلب حتمي ممول بصمة الاستجابة والزمن والرموز وتتبع المحول." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">route_traffic</span>
                <p><Bi en="Traffic and billing stay off until the proof row marks the deployment running." ar="تبقى الحركة والفوترة متوقفتين حتى يضع صف الإثبات النشر في حالة تشغيل." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">05</span>
                <span className="gate-k">usage_attribution</span>
                <p><Bi en="Usage rows must carry deployment, adapter, endpoint, checksum, provider, request, token, cost, and pending-settlement proof." ar="يجب أن تحمل صفوف الاستخدام إثبات النشر والمحول والنقطة والبصمة والمزود والطلب والرموز والتكلفة والتسوية المعلقة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">06</span>
                <span className="gate-k">billing_readiness</span>
                <p><Bi en="Billing stays disabled until usage rows carry adapter and endpoint attribution." ar="تبقى الفوترة معطلة حتى تحمل صفوف الاستخدام نسب المحول والنقطة." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
