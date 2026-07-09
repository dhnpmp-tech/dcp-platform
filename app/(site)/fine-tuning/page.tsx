'use client'

import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

const GATES = [
  {
    k: 'dataset_validation',
    tEn: 'Dataset validation',
    tAr: 'تحقق البيانات',
    en: 'JSONL format, row counts, token estimate, checksum, and train/validation split are contract-backed.',
    ar: 'شكل JSONL وعد الصفوف وتقدير الرموز والبصمة وتقسيم التدريب/التحقق مدعومة بعقد.',
  },
  {
    k: 'training_job_metadata',
    tEn: 'Training job rows',
    tAr: 'صفوف مهام التدريب',
    en: 'Renter-scoped job metadata, model-card stubs, and artifact reservations exist before public trainer execution.',
    ar: 'بيانات المهام حسب المستأجر وقوالب بطاقة النموذج وحجوزات الأثر موجودة قبل تشغيل التدريب العام.',
  },
  {
    k: 'adapter_registry',
    tEn: 'Adapter registry',
    tAr: 'سجل المحولات',
    en: 'Adapters can be registered with base model, storage key, checksum, rank, and status; the registry contract proof is now part of the local roadmap suite.',
    ar: 'يمكن تسجيل المحولات مع النموذج الأساسي ومفتاح التخزين والبصمة والرتبة والحالة؛ أصبح إثبات عقد السجل جزءا من مجموعة خارطة الطريق المحلية.',
  },
  {
    k: 'artifact_policy',
    tEn: 'Artifact policy',
    tAr: 'سياسة آثار المحولات',
    en: 'Adapter and model-card keys are renter/adapter scoped and checksum-guarded before uploads or serving are claimed.',
    ar: 'مفاتيح المحول وبطاقة النموذج محددة بالمستأجر والمحول ومحروسة بالبصمة قبل ادعاء الرفع أو الخدمة.',
  },
  {
    k: 'deployment_intents',
    tEn: 'Deployment intents',
    tAr: 'نوايا النشر',
    en: 'Deployment rows are visible, and the deployment lifecycle contract proof is part of the local roadmap suite. Route traffic stays off until vLLM proof matches deployment, adapter, endpoint, and artifact.',
    ar: 'صفوف النشر مرئية، وإثبات عقد دورة حياة النشر جزء من مجموعة خارطة الطريق المحلية. تبقى حركة التوجيه متوقفة حتى يوجد إثبات تحميل vLLM مطابق.',
  },
  {
    k: 'deployment_control_loop',
    tEn: 'Intent control loop',
    tAr: 'حلقة التحكم في النية',
    en: 'Ready adapters can create proof-gated deployment intent rows, and renters can stop stale intents. Neither action grants load-proof privileges or starts serving.',
    ar: 'يمكن للمحولات الجاهزة إنشاء صفوف نية نشر مقيدة بالإثبات، ويمكن للمستأجر إيقاف النوايا القديمة. لا يمنح أي إجراء صلاحية إثبات التحميل أو يبدأ الخدمة.',
  },
  {
    k: 'endpoint_smoke',
    tEn: 'Endpoint smoke readiness',
    tAr: 'جاهزية دخان النقطة',
    en: 'Future endpoint smoke must prove a funded principal, deterministic request, response hash, latency, token totals, and adapter trace.',
    ar: 'يجب أن يثبت دخان النقطة المستقبلي رصيدا ممولا وطلبا حتميا وبصمة الاستجابة والزمن والرموز وتتبع المحول.',
  },
  {
    k: 'usage_attribution',
    tEn: 'Usage attribution',
    tAr: 'نسب الاستخدام',
    en: 'Future adapter usage rows must carry deployment, adapter, endpoint, checksum, provider, request, token, cost, and pending-settlement fields.',
    ar: 'يجب أن تحمل صفوف استخدام المحولات المستقبلية حقول النشر والمحول والنقطة والبصمة والمزود والطلب والرموز والتكلفة والتسوية المعلقة.',
  },
  {
    k: 'billing_readiness',
    tEn: 'Adapter billing readiness',
    tAr: 'جاهزية فوترة المحولات',
    en: 'Billing is a disabled policy contract until endpoint smoke, funded-principal, attribution, and settlement proof exist.',
    ar: 'الفوترة عقد سياسة معطل حتى يوجد إثبات دخان النقطة والرصيد الممول والنسب والتسوية.',
  },
  {
    k: 'tinker_loop',
    tEn: 'Tinker-style loop gates',
    tAr: 'بوابات حلقة بأسلوب Tinker',
    en: 'Create LoRA, forward/backward, optimizer step, save, sample, and evaluate are visible as disabled contract gates until GPU proof exists.',
    ar: 'إنشاء LoRA والمرور الأمامي/العكسي وخطوة المحسن والحفظ والعينة والتقييم مرئية كبوابات عقد معطلة حتى يوجد إثبات GPU.',
  },
] as const

const SNIPPET = `curl -s https://api.dcp.sa/api/lora/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s https://api.dcp.sa/api/lora/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" | jq '.tinker_loop'

curl -s https://api.dcp.sa/api/lora/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" | jq '.adapter_registry.registry_contract_proof'

npm run proof:adapter-registry-contract

curl -s https://api.dcp.sa/api/lora/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" | jq '.adapter_deployments.deployment_contract_proof'

npm run proof:adapter-deployment-contract

curl -s https://api.dcp.sa/api/adapters/artifacts/readiness

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

curl -s https://api.dcp.sa/api/adapters/billing/readiness

curl -s "https://api.dcp.sa/api/adapters/deployments?limit=25" \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments \\
  -X POST \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"single_adapter_live_merge"}'

curl -s https://api.dcp.sa/api/adapters/$ADAPTER_ID/deployments/$DEPLOYMENT_ID/stop \\
  -X POST \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"`

export default function FineTuningProductPage() {
  return (
    <>
      <SiteHeader active="/fine-tuning" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/inference.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="LoRA SFT MVP · proof-gated serving" ar="نسخة LoRA SFT أولية · خدمة مقيدة بالإثبات" /></span>
            <span><Bi en="Train-here/deploy-here contract, honest state" ar="عقد درّب هنا وانشر هنا، بحالة صادقة" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.6rem, 1.2rem + 4.6vw, 5rem)', lineHeight: 0.96, letterSpacing: '-.02em', maxWidth: 920, margin: '22px 0 18px' }}>
            <BiX
              en={<>Fine-tuning for Saudi workflows, <em style={{ fontStyle: 'italic' }}>without pretending the GPU proof is done.</em></>}
              ar={<>ضبط دقيق لسير العمل السعودي، <em>دون ادعاء أن إثبات GPU اكتمل.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 720, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP now exposes the LoRA product contract: dataset validation, training-job metadata, model-card stubs, adapter registry rows, deployment intents, endpoint-smoke readiness, usage attribution readiness, and adapter billing readiness. Public managed training, route traffic, adapter usage writes, and adapter billing remain gated until GPU-host artifact proof, vLLM load proof, deterministic endpoint smoke, usage attribution, and money-policy proof exist."
              ar="يعرض DCP الآن عقد منتج LoRA: تحقق البيانات، وبيانات مهام التدريب، وقوالب بطاقات النماذج، وسجل المحولات، ونوايا النشر. يبقى التدريب المُدار العام وحركة محولات النشر مقيدين حتى يوجد إثبات أثر على مضيف GPU وإثبات تحميل vLLM."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/renter/fine-tuning"><Bi en="Open Fine-Tuning console ->" ar="افتح لوحة الضبط الدقيق ←" /></Link>
            <Link className="btn ghost" href="/docs"><Bi en="Read API docs" ar="اقرأ توثيق API" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · What is live" ar="§ ٠١ · ما يعمل الآن" /></span>
            <span><Bi en="Contract rails before public claims" ar="مسارات العقد قبل الادعاءات العامة" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {GATES.map((gate) => (
              <article className="mg" key={gate.k}>
                <span className="org">{gate.k}</span>
                <h3 className="nm"><Bi en={gate.tEn} ar={gate.tAr} /></h3>
                <p><Bi en={gate.en} ar={gate.ar} /></p>
                <div className="meta">
                  <span><Bi en="Status" ar="الحالة" /></span>
                  <b><Bi
                    en={gate.k === 'deployment_intents' ? 'visible · routes off' : gate.k === 'deployment_control_loop' ? 'create/stop live · routes off' : gate.k === 'endpoint_smoke' || gate.k === 'usage_attribution' || gate.k === 'billing_readiness' || gate.k === 'tinker_loop' ? 'contract-only · disabled' : 'contract live'}
                    ar={gate.k === 'deployment_intents' ? 'مرئي · المسارات متوقفة' : gate.k === 'deployment_control_loop' ? 'إنشاء/إيقاف يعمل · المسارات متوقفة' : gate.k === 'endpoint_smoke' || gate.k === 'usage_attribution' || gate.k === 'billing_readiness' || gate.k === 'tinker_loop' ? 'عقد فقط · معطل' : 'العقد يعمل'}
                  /></b>
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
                alt="GPU server board used as the visual signal for DCP LoRA fine-tuning and adapter deployment"
              />
              <span className="pshow-cap" dir="ltr">fig. 02 - LoRA adapter proof path</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · API surface" ar="§ ٠٢ · واجهة API" /></span>
                <span><Bi en="Readiness + deployment intent" ar="الجاهزية + نية النشر" /></span>
              </div>
              <h2>
                <BiX en={<>Build against the contract now. <em>Serve only after proof.</em></>} ar={<>ابنِ فوق العقد الآن. <em>وشغّل فقط بعد الإثبات.</em></>} />
              </h2>
              <p>
                <Bi
                  en="The public page points developers at the same contract used by the renter console. It is intentionally explicit about what is live, what is metadata-only, and what still needs GPU-host proof."
                  ar="توجه الصفحة العامة المطورين إلى نفس العقد الذي تستخدمه لوحة المستأجر. وهي صريحة عمداً حول ما يعمل، وما هو بيانات فقط، وما لا يزال يحتاج إثبات مضيف GPU."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="Fine-tuning API snippets">{SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="No public Tinker compatibility claim; low-level loop primitives are contract-only until GPU proof exists." ar="لا ادعاء توافق عام مع Tinker؛ بدائيات الحلقة منخفضة المستوى عقد فقط حتى يوجد إثبات GPU." /></li>
                <li><Bi en="Ready adapters can create and stop gated deployment intent rows from the renter console; neither action accepts renter load proof or starts route traffic." ar="يمكن للمحولات الجاهزة إنشاء وإيقاف صفوف نية نشر مقيدة من لوحة المستأجر؛ لا يقبل أي إجراء إثبات تحميل من المستأجر ولا يبدأ حركة التوجيه." /></li>
                <li><Bi en="No adapter route traffic until vLLM load proof matches deployment id, adapter id, base model, mode, endpoint id, and checksum." ar="لا حركة لمحولات النشر حتى يطابق إثبات تحميل vLLM معرف النشر والمحول والنموذج الأساسي والوضع والنقطة والبصمة." /></li>
                <li><Bi en="The endpoint-smoke GET returns renter-scoped no-record status, and the POST exists only as a disabled validation contract; it returns 409 and records nothing until response hash, latency, token totals, adapter trace, funded principal, usage attribution, settlement policy, and founder approval pass." ar="تعيد طريقة GET لحالة دخان النقطة حالة بلا تسجيل حسب المستأجر، وتبقى طريقة POST عقد تحقق معطلا يعيد 409 ولا يسجل شيئا حتى اعتماد دليل الاستجابة والرصيد ونسب الاستخدام وسياسة التسوية وموافقة المؤسسين." /></li>
                <li><Bi en="No quality claims until reproducible benchmark artifacts exist." ar="لا ادعاءات جودة حتى توجد آثار قياس قابلة للتكرار." /></li>
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
              <h3><Bi en="What we are selling now is the path, not an inflated promise." ar="ما نبيعه الآن هو المسار، وليس وعداً متضخماً." /></h3>
              <p>
                <Bi
                  en="For today: prepare datasets, inspect training metadata, register adapter artifacts, create proof-gated deployment intents, and inspect disabled endpoint-smoke, usage-attribution, and adapter-billing policy. Next: run LoRA SFT on controlled 3090/4090/5090-class pods, attach artifact proof, load adapters into vLLM, smoke the endpoint with hashed response evidence and adapter trace, and route billed inference only after money and usage evidence exists."
                  ar="اليوم: جهّز البيانات، وافحص بيانات التدريب، وسجل آثار المحولات، وأنشئ أو أوقف نوايا نشر مقيدة بالإثبات. التالي: تشغيل LoRA SFT على حاويات 3090/4090/5090 مضبوطة، وإرفاق إثبات الأثر، وتحميل المحولات في vLLM، وتوجيه الحركة عبر الاستدلال المفوتر فقط بعد وجود الدليل."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/renter/fine-tuning"><Bi en="Open console" ar="افتح اللوحة" /></Link>
                <Link className="btn ghost" href="/pods"><Bi en="Rent a GPU pod" ar="استأجر حاوية GPU" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Fine-tuning gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">metadata_contract</span>
                <p><Bi en="Readiness, jobs, adapters, and deployment intents are visible now." ar="الجاهزية والمهام والمحولات ونوايا النشر مرئية الآن." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">intent_control</span>
                <p><Bi en="Ready adapters can create or stop non-serving deployment intent rows." ar="يمكن للمحولات الجاهزة إنشاء أو إيقاف صفوف نية نشر بلا خدمة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">gpu_artifact_proof</span>
                <p><Bi en="Trainer workers must prove the adapter artifact before public training is claimed." ar="يجب أن تثبت عمال التدريب أثر المحول قبل ادعاء التدريب العام." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">adapter_load_proof</span>
                <p><Bi en="Serving turns on only when the endpoint proves it loaded the right adapter for the right base model." ar="تعمل الخدمة فقط عندما تثبت النقطة أنها حملت المحول الصحيح للنموذج الأساسي الصحيح." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
