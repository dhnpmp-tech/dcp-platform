'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { PodSidebar, PodTopbar } from '../pods/PodShell'
import '../pods/pods.css'
import './fine-tuning.css'

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
  }
}

interface AdapterRecord {
  adapter_id: string
  name: string
  base_model: string
  storage_key: string
  checksum_sha256: string
  rank: number | null
  status: string
  created_at: string
  updated_at: string
  deployed_at: string | null
}

interface AdapterListResponse {
  data?: AdapterRecord[]
  error?: string
}

const STAGES = [
  {
    no: '01',
    status: 'ready',
    titleEn: 'Dataset validation',
    titleAr: 'تحقق البيانات',
    bodyEn: 'JSONL shape, token estimate, checksum, and train/validation split contract are in the backend.',
    bodyAr: 'شكل JSONL وتقدير الرموز والبصمة وتقسيم التدريب/التحقق موجودة كعقد في الخلفية.',
  },
  {
    no: '02',
    status: 'ready',
    titleEn: 'LoRA job draft',
    titleAr: 'مسودة مهمة LoRA',
    bodyEn: 'Fixed LoRA and QLoRA SFT recipes are normalized before any GPU work is allowed.',
    bodyAr: 'وصفات LoRA وQLoRA SFT ثابتة وتتم تسويتها قبل السماح بأي عمل GPU.',
  },
  {
    no: '03',
    status: 'ready',
    titleEn: 'Adapter registry',
    titleAr: 'سجل المحولات',
    bodyEn: 'Renter-scoped adapter metadata is live. Registry writes do not deploy traffic.',
    bodyAr: 'بيانات المحولات حسب المستأجر تعمل الآن. الكتابة في السجل لا تنشر حركة مرور.',
  },
  {
    no: '04',
    status: 'blocked',
    titleEn: 'Deployment proof',
    titleAr: 'إثبات النشر',
    bodyEn: 'Endpoint routing stays off until adapter load proof matches adapter id and base model.',
    bodyAr: 'يبقى توجيه النقطة متوقفا حتى يطابق إثبات التحميل معرف المحول والنموذج الأساسي.',
  },
] as const

const CONTRACT_LINES = [
  'POST /api/adapters',
  'GET  /api/adapters',
  'dataset_jsonl: chat_messages | prompt_completion',
  'recipes: lora_sft | qlora_sft',
  'route_traffic: false until adapter_load_proof',
]

function shortChecksum(value: string): string {
  if (!value) return '-'
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function RenterFineTuningPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [renterName, setRenterName] = useState('DCP renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [adapters, setAdapters] = useState<AdapterRecord[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }

    const base = getApiBase()
    const headers = { 'x-renter-key': key }
    let cancelled = false
    setLoadState('loading')
    setError('')

    ;(async () => {
      try {
        const [meRes, adaptersRes] = await Promise.all([
          fetch(`${base}/renters/me`, { headers }),
          fetch(`${base}/adapters`, { headers }),
        ])

        if (!meRes.ok) {
          const data = await meRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load renter account.')
        }
        if (!adaptersRes.ok) {
          const data = await adaptersRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load adapter registry.')
        }

        const me = (await meRes.json()) as RenterMe
        const adapterData = (await adaptersRes.json()) as AdapterListResponse
        if (cancelled) return

        const renter = me.renter
        setRenterName(renter?.organization || renter?.name || 'DCP renter')
        setRenterEmail(renter?.email || '')
        setAdapters(adapterData.data || [])
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setLoadState('error')
        setError(err instanceof Error ? err.message : 'Failed to load fine-tuning state.')
      }
    })()

    return () => { cancelled = true }
  }, [])

  const baseModels = useMemo(() => {
    const set = new Set(adapters.map((adapter) => adapter.base_model).filter(Boolean))
    return set.size
  }, [adapters])

  const readyAdapters = adapters.filter((adapter) => adapter.status === 'ready' || adapter.status === 'deployed')
  const adapterRows = adapters.slice(0, 6)
  const isLive = loadState === 'ready'

  return (
    <div className="rt-app ft-page">
      <PodSidebar
        navOpen={navOpen}
        renterName={renterName}
        renterEmail={renterEmail}
        currentPage="fine"
      />

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <PodTopbar
          renterName={renterName}
          isLive={isLive}
          lang={lang}
          onToggleLang={toggle}
          onToggleNav={() => setNavOpen((v) => !v)}
          pageLabelEn="Fine-Tuning"
          pageLabelAr="الضبط الدقيق"
        />

        <main className="rt-main ft-main">
          <h1 className="rt-h1">
            <Bi en="Fine-" ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="tuning." ar="الضبط الدقيق." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="LoRA SFT MVP" ar="نسخة LoRA SFT الأولى" />
            </span>
            <span>
              <Bi en="Contracts ready · serving gated by proof" ar="العقود جاهزة · الخدمة مشروطة بالإثبات" />
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state ft-state">
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or add a renter API key before the console can read adapter registry state."
                  ar="سجل الدخول أو أضف مفتاح مستأجر قبل أن تقرأ اللوحة حالة سجل المحولات."
                />
              </span>
              <Link className="text-link" href="/renter/keys">
                <Bi en="Manage API keys" ar="إدارة مفاتيح API" />
              </Link>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state ft-state">
              <b>
                <Bi en="Fine-tuning state unavailable" ar="حالة الضبط الدقيق غير متاحة" />
              </b>
              <span>{error}</span>
            </div>
          )}

          <div className="ft-kpis" aria-label={lang === 'ar' ? 'مؤشرات الضبط الدقيق' : 'Fine-tuning indicators'}>
            <div className="kpi featured">
              <div className="k">
                <Bi en="Adapters" ar="المحولات" />
              </div>
              <div className="v">{loadState === 'ready' ? adapters.length : 0}</div>
              <div className="d flat">
                <Bi en="Registry metadata only" ar="بيانات سجل فقط" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Base models" ar="النماذج الأساسية" />
              </div>
              <div className="v">{loadState === 'ready' ? baseModels : 0}</div>
              <div className="d flat">
                <Bi en="From registered adapters" ar="من المحولات المسجلة" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Ready adapters" ar="محولات جاهزة" />
              </div>
              <div className="v">{loadState === 'ready' ? readyAdapters.length : 0}</div>
              <div className="d up">
                <Bi en="Still requires deploy proof" ar="ما زالت تتطلب إثبات نشر" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Traffic routes" ar="مسارات الحركة" />
              </div>
              <div className="v">0</div>
              <div className="d flat">
                <Bi en="Off until load proof" ar="متوقفة حتى إثبات التحميل" />
              </div>
            </div>
          </div>

          <section className="ft-section" aria-labelledby="ft-flow-title">
            <div className="ft-section-head">
              <div>
                <span className="pod-label">
                  <Bi en="Train here, deploy here" ar="درّب هنا، وانشر هنا" />
                </span>
                <h2 id="ft-flow-title">
                  <Bi en="LoRA workflow gates" ar="بوابات سير عمل LoRA" />
                </h2>
              </div>
              <Link className="btn-sec" href="/renter/pods">
                <Bi en="Open GPU Pods" ar="افتح حاويات GPU" />
              </Link>
            </div>

            <div className="ft-stage-grid">
              {STAGES.map((stage) => (
                <article key={stage.no} className={`ft-stage ${stage.status}`}>
                  <div className="ft-stage-top">
                    <span className="ft-stage-no">{stage.no}</span>
                    <span className="ft-stage-status">
                      <Bi
                        en={stage.status === 'blocked' ? 'Proof gate' : 'Contract ready'}
                        ar={stage.status === 'blocked' ? 'بوابة إثبات' : 'العقد جاهز'}
                      />
                    </span>
                  </div>
                  <h3>
                    <Bi en={stage.titleEn} ar={stage.titleAr} />
                  </h3>
                  <p>
                    <Bi en={stage.bodyEn} ar={stage.bodyAr} />
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="ft-grid" aria-label={lang === 'ar' ? 'حالة السجل والعقود' : 'Registry and contract state'}>
            <div className="ft-ledger">
              <div className="ft-section-head compact">
                <div>
                  <span className="pod-label">
                    <Bi en="Adapter registry" ar="سجل المحولات" />
                  </span>
                  <h2>
                    <Bi en="Latest adapters" ar="آخر المحولات" />
                  </h2>
                </div>
              </div>

              {adapterRows.length > 0 ? (
                <div className="ft-table-wrap">
                  <table className="tbl ft-table">
                    <thead>
                      <tr>
                        <th><Bi en="Adapter" ar="المحول" /></th>
                        <th><Bi en="Base model" ar="النموذج الأساسي" /></th>
                        <th><Bi en="Rank" ar="الرتبة" /></th>
                        <th><Bi en="Status" ar="الحالة" /></th>
                        <th><Bi en="Checksum" ar="البصمة" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adapterRows.map((adapter) => (
                        <tr key={adapter.adapter_id}>
                          <td>
                            <span className="mono">{adapter.adapter_id}</span>
                            <span className="ft-table-sub">{adapter.name}</span>
                          </td>
                          <td className="mono">{adapter.base_model}</td>
                          <td className="mono">{adapter.rank ?? '-'}</td>
                          <td>
                            <span className={`stat ${adapter.status === 'failed' ? 'failed' : adapter.status === 'ready' || adapter.status === 'deployed' ? 'settled' : 'queued'}`}>
                              {adapter.status}
                            </span>
                          </td>
                          <td>
                            <span className="mono">{shortChecksum(adapter.checksum_sha256)}</span>
                            <span className="ft-table-sub">{formatDate(adapter.created_at)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ft-empty">
                  <b>
                    <Bi en="No adapters registered yet" ar="لا توجد محولات مسجلة بعد" />
                  </b>
                  <span>
                    <Bi
                      en="Use the GPU Pods flow for datasets and training work. Registry records appear here after an adapter artifact is registered."
                      ar="استخدم مسار حاويات GPU للبيانات والتدريب. تظهر سجلات المحولات هنا بعد تسجيل أثر المحول."
                    />
                  </span>
                </div>
              )}
            </div>

            <aside className="ft-contract">
              <span className="pod-label">
                <Bi en="API contract preview" ar="معاينة عقد API" />
              </span>
              <pre className="code ft-code" aria-label={lang === 'ar' ? 'معاينة عقد API' : 'API contract preview'}>
                {CONTRACT_LINES.map((line) => line).join('\n')}
              </pre>
              <div className="ft-contract-note">
                <Bi
                  en="This is the current contract surface, not a managed training launch button. Deployment routing remains disabled until the serving proof lands."
                  ar="هذه هي واجهة العقد الحالية وليست زر تشغيل تدريب مُدار. يبقى توجيه النشر معطلاً حتى يصل إثبات الخدمة."
                />
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  )
}
