'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import { Bi, BiX } from '@/app/(site)/lib/i18n'
import '../(home)/home.css'
import '../docs/docs.css'

type BenchmarkReadiness = {
  summary?: {
    total_models?: number
    live_measured_models?: number
    live_latency_rows?: number
    live_quality_rows?: number
    launch_ready_models?: number
    public_quality_claim_allowed?: boolean
  }
  features?: {
    model_latency_feed?: { status?: string; available?: boolean }
    arabic_quality_benchmarks?: { status?: string; available?: boolean; measured_rows?: number }
    customer_evaluator_jobs?: { status?: string; available?: boolean; api_available?: boolean }
  }
}

const BENCHMARK_GATES = [
  {
    k: 'model_latency_feed',
    tEn: 'Live model latency feed',
    tAr: 'تغذية زمن النماذج الحية',
    en: 'Only models with a live verified provider and measured_at timestamp can show latency, cost, or quality numbers.',
    ar: 'النماذج التي لديها مزوّد حي متحقق وطابع measured_at فقط يمكنها عرض زمن أو تكلفة أو جودة.',
    source: '/api/models/benchmarks',
  },
  {
    k: 'arabic_quality_benchmarks',
    tEn: 'Arabic quality claims gated',
    tAr: 'ادعاءات الجودة العربية مقيدة',
    en: 'Saudi customer-support and Arabic task claims wait for approved datasets, fixed harnesses, checksums, and baseline metadata.',
    ar: 'تنتظر ادعاءات دعم العملاء السعودي والمهام العربية بيانات معتمدة، ومنهجية ثابتة، وبصمات، وبيانات أساس.',
    source: 'claim guard',
  },
  {
    k: 'provider_benchmark_contract',
    tEn: 'Provider benchmark contract',
    tAr: 'عقد قياس المزوّد',
    en: 'Provider benchmark records support fleet quality work, while public score claims still require GPU-host proof.',
    ar: 'تدعم سجلات قياس المزوّد عمل جودة الأسطول، لكن ادعاءات الدرجات العامة لا تزال تحتاج إثبات مضيف GPU.',
    source: '/api/benchmark',
  },
  {
    k: 'customer_evaluator_jobs',
    tEn: 'Eval job metadata records',
    tAr: 'سجلات بيانات مهام التقييم',
    en: 'Renter-scoped create/list/read endpoints now store draft eval metadata with dataset checksums and metrics; workers, results, billing, reports, and rankings remain off.',
    ar: 'تخزن واجهات الإنشاء والقائمة والقراءة حسب المستأجر الآن بيانات تقييم مسودة مع بصمات البيانات والمقاييس؛ وتبقى العمال والنتائج والفوترة والتقارير والترتيبات متوقفة.',
    source: '/api/evals/jobs',
  },
] as const

const BENCHMARK_SNIPPET = `curl -s https://api.dcp.sa/api/models/benchmarks/readiness

curl -s https://api.dcp.sa/api/evals/readiness

curl -s https://api.dcp.sa/api/evals/jobs/schema

curl -s https://api.dcp.sa/api/evals/worker/readiness

curl -s https://api.dcp.sa/api/evals/results/schema

curl -s https://api.dcp.sa/api/evals/results/artifacts/readiness

curl -s https://api.dcp.sa/api/evals/results/access/readiness

curl -s https://api.dcp.sa/api/evals/results/downloads/readiness

curl -s https://api.dcp.sa/api/evals/results/writer/readiness

curl -s -H "Authorization: Bearer $DCP_RENTER_KEY" https://api.dcp.sa/api/evals/jobs/{evalJobId}/results

curl -s -H "Authorization: Bearer $DCP_RENTER_KEY" https://api.dcp.sa/api/evals/jobs

curl -s https://api.dcp.sa/api/models/benchmarks

curl -s https://api.dcp.sa/v1/models`

function statusLabel(value: unknown): string {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (value === null || value === undefined || value === '') return '--'
  return String(value)
}

export default function BenchmarksProductPage() {
  const [readiness, setReadiness] = useState<BenchmarkReadiness | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/models/benchmarks/readiness', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json && typeof json === 'object') setReadiness(json)
      })
      .catch(() => {
        if (!cancelled) setReadiness(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => ([
    {
      k: 'models',
      en: 'catalog models',
      ar: 'نماذج الكتالوج',
      value: readiness?.summary?.total_models,
    },
    {
      k: 'measured',
      en: 'live measured rows',
      ar: 'صفوف مقاسة حية',
      value: readiness?.summary?.live_measured_models,
    },
    {
      k: 'latency',
      en: 'latency rows',
      ar: 'صفوف الزمن',
      value: readiness?.summary?.live_latency_rows,
    },
    {
      k: 'quality',
      en: 'quality claims allowed',
      ar: 'ادعاءات الجودة المسموحة',
      value: readiness?.summary?.public_quality_claim_allowed,
    },
  ]), [readiness])

  return (
    <>
      <SiteHeader active="/benchmarks" />

      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/swarm.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Benchmarks and evals · evidence first" ar="القياسات والتقييمات · الدليل أولاً" /></span>
            <span><Bi en="Saudi workload claims stay gated" ar="ادعاءات الأحمال السعودية تبقى مقيدة" /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(2.55rem, 1.15rem + 4.5vw, 5rem)', lineHeight: 0.96, letterSpacing: 0, maxWidth: 950, margin: '22px 0 18px' }}>
            <BiX
              en={<>Benchmarks for Saudi AI workloads, <em style={{ fontStyle: 'italic' }}>locked to reproducible evidence.</em></>}
              ar={<>قياسات لأحمال الذكاء السعودي، <em>مقفلة على دليل قابل للتكرار.</em></>}
            />
          </h1>
          <p className="lead" style={{ maxWidth: 740, color: 'var(--ink-2)' }}>
            <Bi
              en="DCP exposes model benchmark metadata and provider benchmark contracts, but public Arabic-quality claims stay off until the dataset, harness, artifact checksum, and baseline report are all present."
              ar="يعرض DCP بيانات قياس النماذج وعقود قياس المزوّدين، لكن ادعاءات الجودة العربية العامة تبقى متوقفة حتى تتوفر البيانات والمنهجية وبصمة الأثر وتقرير الأساس."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/status"><Bi en="View live status ->" ar="شاهد الحالة الحية ←" /></Link>
            <Link className="btn ghost" href="/inference"><Bi en="Use inference API" ar="استخدم واجهة الاستدلال" /></Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap" style={{ paddingTop: 40 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · Benchmark readiness" ar="§ ٠١ · جاهزية القياس" /></span>
            <span><Bi en="Live feed, gated claims" ar="تغذية حية، ادعاءات مقيدة" /></span>
          </div>
          <div className="mg-grid" style={{ marginTop: 20 }}>
            {BENCHMARK_GATES.map((gate) => (
              <article className="mg" key={gate.k}>
                <span className="org">{gate.k}</span>
                <h3 className="nm"><Bi en={gate.tEn} ar={gate.tAr} /></h3>
                <p><Bi en={gate.en} ar={gate.ar} /></p>
                <div className="meta">
                  <span><Bi en="Source" ar="المصدر" /></span>
                  <b dir="ltr">{gate.source}</b>
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
                src="/home/inference.webp"
                width={1600}
                height={894}
                loading="lazy"
                decoding="async"
                alt="Abstract inference visual representing DCP benchmark evidence and model measurements"
              />
              <span className="pshow-cap" dir="ltr">fig. 05 - benchmark feed to claim guard</span>
            </div>
            <div className="pshow-copy">
              <div className="section-meta" style={{ marginBottom: 18 }}>
                <span className="idx"><Bi en="§ 02 · API contract" ar="§ ٠٢ · عقد API" /></span>
                <span><Bi en="Metrics before marketing" ar="القياسات قبل التسويق" /></span>
              </div>
              <h2>
                <BiX en={<>Publish measured rows. <em>Block quality claims until the run is reproducible.</em></>} ar={<>انشر الصفوف المقاسة. <em>واحمِ ادعاءات الجودة حتى يصبح التشغيل قابلاً للتكرار.</em></>} />
              </h2>
              <p>
                <Bi
                  en="The readiness endpoint is the contract agents can inspect before they quote latency, quality, or comparison claims. It is intentionally conservative: live latency can be visible while public Arabic-quality ranking remains false."
                  ar="نقطة الجاهزية هي العقد الذي يمكن للوكلاء فحصه قبل اقتباس زمن أو جودة أو مقارنات. وهو محافظ عمداً: يمكن أن يظهر الزمن الحي بينما تبقى تصنيفات الجودة العربية العامة غير مفعلة."
                />
              </p>
              <pre className="term" dir="ltr" aria-label="Benchmark readiness API snippets">{BENCHMARK_SNIPPET}</pre>
              <ul className="pshow-list">
                <li><Bi en="Seeded benchmark profile rows never become public numbers without live provider measurement." ar="صفوف ملفات القياس المزروعة لا تصبح أرقاماً عامة دون قياس مزوّد حي." /></li>
                <li><Bi en="Arabic task comparisons need approved datasets, harness version, baseline policy, and artifact checksum." ar="تحتاج مقارنات المهام العربية بيانات معتمدة وإصدار منهجية وسياسة أساس وبصمة أثر." /></li>
                <li><Bi en="Eval job create/list/read endpoints are live for metadata records; workers, result APIs, billing, reports, and rankings remain blocked." ar="واجهات إنشاء وقراءة وقائمة مهام التقييم حية لسجلات البيانات فقط؛ وتبقى العمال وواجهات النتائج والفوترة والتقارير والترتيبات مقيدة." /></li>
                <li><Bi en="The worker readiness contract proves queue dispatch, result writing, and billing hooks stay disabled before eval execution." ar="يثبت عقد جاهزية العامل أن إرسال الطابور وكتابة النتائج وخطافات الفوترة تبقى متوقفة قبل تنفيذ التقييم." /></li>
                <li><Bi en="The worker dry-run fixture proof simulates a draft eval queue item and writes only a temporary manifest, without changing job status or billing." ar="يثبت تشغيل العامل الجاف عنصر طابور تقييم مسودة ويكتب بياناً مؤقتاً فقط، دون تغيير حالة المهمة أو الفوترة." /></li>
                <li><Bi en="The result manifest schema defines checksum proof for future artifacts while result download APIs remain off." ar="يعرّف مخطط بيان النتائج إثبات البصمة للآثار المستقبلية بينما تبقى واجهات تنزيل النتائج متوقفة." /></li>
                <li><Bi en="The artifact storage policy defines renter/job-scoped result keys and checksum guards before object-store writes or signed downloads exist." ar="تعرّف سياسة تخزين الآثار مفاتيح نتائج محددة بالمستأجر والمهمة وحراس البصمة قبل وجود كتابات التخزين أو التنزيلات الموقعة." /></li>
                <li><Bi en="The result access policy requires renter ownership, result availability, artifact scope, and checksums before any result endpoint or signed download can go live." ar="تتطلب سياسة وصول النتائج ملكية المستأجر وتوفر النتيجة ونطاق الأثر والبصمات قبل تفعيل أي واجهة نتائج أو تنزيل موقّع." /></li>
                <li><Bi en="The result endpoint route is renter-scoped but deliberately returns a disabled contract until signed-download proof exists." ar="مسار واجهة النتائج محدد بالمستأجر لكنه يعيد عقد تعطيل عمداً حتى يتوفر إثبات التنزيل الموقّع." /></li>
                <li><Bi en="The signed-download policy defines access, artifact, checksum, content-type, and expiry requirements without exposing a signed URL or object-store key." ar="تعرّف سياسة التنزيل الموقّع متطلبات الوصول والأثر والبصمة ونوع المحتوى والانتهاء دون كشف رابط موقّع أو مفتاح تخزين كائنات." /></li>
                <li><Bi en="The writer dry-run can create a validated manifest in temporary proof storage without production artifact writes." ar="يمكن للتشغيل الجاف للكاتب إنشاء بيان نتائج متحقق في تخزين إثبات مؤقت دون كتابة آثار إنتاجية." /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Current contract state" ar="حالة العقد الحالية" /></span>
              <h3><Bi en="A benchmark page is useful only if it refuses weak evidence." ar="صفحة القياس مفيدة فقط إذا رفضت الدليل الضعيف." /></h3>
              <p>
                <Bi
                  en="This rail lets DCP look like a mature inference platform without drifting into unsupported claims. The page can show the benchmark contract now, then light up eval jobs and public reports only when the backend evidence says they are ready."
                  ar="يسمح هذا المسار لـ DCP أن يبدو كمنصة استدلال ناضجة دون الانزلاق إلى ادعاءات غير مدعومة. تعرض الصفحة عقد القياس الآن، ثم تفعّل مهام التقييم والتقارير العامة فقط عندما تقول أدلة الخلفية إنها جاهزة."
                />
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="btn primary" href="/pricing"><Bi en="Compare pricing" ar="قارن الأسعار" /></Link>
                <Link className="btn ghost" href="/docs"><Bi en="Read docs" ar="اقرأ التوثيق" /></Link>
              </div>
            </div>
            <div className="capacity-gates" aria-label="Benchmark readiness stats">
              {stats.map((stat, index) => (
                <div className="capacity-gate" key={stat.k}>
                  <span className="gate-n">{String(index + 1).padStart(2, '0')}</span>
                  <span className="gate-k">{stat.k}</span>
                  <p><Bi en={`${statusLabel(stat.value)} ${stat.en}`} ar={`${statusLabel(stat.value)} ${stat.ar}`} /></p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
