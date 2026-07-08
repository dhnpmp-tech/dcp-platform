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
    en: 'Adapters can be registered with base model, storage key, checksum, rank, and status.',
    ar: 'يمكن تسجيل المحولات مع النموذج الأساسي ومفتاح التخزين والبصمة والرتبة والحالة.',
  },
  {
    k: 'deployment_intents',
    tEn: 'Deployment intents',
    tAr: 'نوايا النشر',
    en: 'Deployment rows are visible, but route traffic stays off until matching vLLM load proof exists.',
    ar: 'صفوف النشر مرئية، لكن حركة التوجيه تبقى متوقفة حتى يوجد إثبات تحميل vLLM مطابق.',
  },
] as const

const SNIPPET = `curl -s https://api.dcp.sa/api/lora/readiness \\
  -H "Authorization: Bearer $DCP_RENTER_KEY"

curl -s "https://api.dcp.sa/api/adapters/deployments?limit=25" \\
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
              en="DCP now exposes the LoRA product contract: dataset validation, training-job metadata, model-card stubs, adapter registry rows, and deployment intents. Public managed training and adapter route traffic remain gated until GPU-host artifact proof and vLLM load proof exist."
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
                  <b><Bi en={gate.k === 'deployment_intents' ? 'visible · routes off' : 'contract live'} ar={gate.k === 'deployment_intents' ? 'مرئي · المسارات متوقفة' : 'العقد يعمل'} /></b>
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
                <li><Bi en="No public Tinker compatibility claim until behavior matches." ar="لا ادعاء توافق عام مع Tinker حتى يطابق السلوك." /></li>
                <li><Bi en="No adapter route traffic until vLLM load proof matches adapter and base model." ar="لا حركة لمحولات النشر حتى يطابق إثبات تحميل vLLM المحول والنموذج الأساسي." /></li>
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
                  en="For today: prepare datasets, inspect training metadata, register adapter artifacts, and create proof-gated deployment intents. Next: run LoRA SFT on controlled 3090/4090/5090-class pods, attach artifact proof, load adapters into vLLM, and route traffic through billed inference only after evidence exists."
                  ar="اليوم: جهّز البيانات، وافحص بيانات التدريب، وسجل آثار المحولات، وأنشئ نوايا نشر مقيدة بالإثبات. التالي: تشغيل LoRA SFT على حاويات 3090/4090/5090 مضبوطة، وإرفاق إثبات الأثر، وتحميل المحولات في vLLM، وتوجيه الحركة عبر الاستدلال المفوتر فقط بعد وجود الدليل."
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
                <span className="gate-k">gpu_artifact_proof</span>
                <p><Bi en="Trainer workers must prove the adapter artifact before public training is claimed." ar="يجب أن تثبت عمال التدريب أثر المحول قبل ادعاء التدريب العام." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
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
