'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { PodSidebar, PodTopbar } from '../pods/PodShell'
import '../pods/pods.css'
import './batches.css'

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'
type SubmitState = 'idle' | 'submitting' | 'error'

interface RenterMe {
  renter?: {
    name?: string
    email?: string
    organization?: string
  }
}

interface BatchRecord {
  batch_id: string
  renter_id: number
  status: string
  input_storage_key: string
  input_checksum_sha256: string
  input_normalized_bytes: number
  request_count: number
  completion_window: string
  metadata: Record<string, unknown> | null
  result_storage_key: string | null
  result_checksum_sha256: string | null
  result_normalized_bytes: number
  completed_count: number
  failed_count: number
  total_cost_halala: number
  execution_enabled: boolean
  results_available: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
  expires_at: string | null
}

interface BatchLine {
  custom_id: string
  line_index: number
  method: string
  url: string
  model_id: string
  request_checksum_sha256: string
  status: string
  status_code: number | null
  response_checksum_sha256: string | null
  response_normalized_bytes: number
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  cost_halala: number
  request_id: string | null
  provider_response_id: string | null
  error_code: string | null
  error_message: string | null
}

interface ResultManifest {
  batch_id: string
  status: string
  results_available: boolean
  result_storage_key: string | null
  result_checksum_sha256: string | null
  result_normalized_bytes: number
  completed_count: number
  failed_count: number
  total_cost_halala: number
  download_enabled: boolean
  download_url: string | null
  download_method: string | null
  download_expires_in: number | null
  download_expires_at: string | null
  next: string
}

interface BatchReadinessFeature {
  status: string
  enabled?: boolean
  configured?: boolean
  enabled_for_completed_results?: boolean
  public_enabled?: boolean
  env_flag_enabled?: boolean
  missing_config?: string[]
}

interface BatchReadiness {
  object: 'batch_inference_readiness'
  version: string
  current_mode: string
  public_execution_enabled: boolean
  request_creation_enabled: boolean
  supported_urls: string[]
  limits: {
    max_requests: number
    max_bytes: number
    completion_windows: string[]
  }
  endpoints: {
    create: string
    list: string
    detail: string
    lines: string
    results: string
  }
  features: {
    jsonl_validation: BatchReadinessFeature
    line_ledger: BatchReadinessFeature
    result_manifest: BatchReadinessFeature
    result_downloads: BatchReadinessFeature
    worker_execution: BatchReadinessFeature
    settlement: BatchReadinessFeature
    discounts: BatchReadinessFeature
    model_capability_flag: BatchReadinessFeature
  }
  claims: {
    batch_execution_live: boolean
    batch_discount_live: boolean
    model_batch_capability_live: boolean
    result_downloads_depend_on_completed_result_proof: boolean
  }
  next: string
}

interface BatchListResponse {
  data?: BatchRecord[]
  error?: string
}

interface BatchLinesResponse {
  data?: BatchLine[]
  error?: string
}

interface BatchResultResponse {
  result?: ResultManifest
  error?: string
}

interface BatchReadinessResponse {
  readiness?: BatchReadiness
  error?: string
}

const SAMPLE_JSONL = [
  JSON.stringify({
    custom_id: 'support-001',
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: 'qwen/qwen3-coder',
      messages: [{ role: 'user', content: 'Classify this ticket as billing, technical, or account.' }],
    },
  }),
  JSON.stringify({
    custom_id: 'brief-002',
    method: 'POST',
    url: '/v1/complete',
    body: {
      model: 'mistral',
      prompt: 'Write a two sentence Arabic market brief for a GPU rental platform.',
    },
  }),
].join('\n')

function shortHash(value: string | null | undefined): string {
  if (!value) return '-'
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US').format(value)
}

function statusTone(status: string): string {
  if (status === 'completed' || status === 'succeeded') return 'settled'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  if (status === 'running') return 'streaming'
  return 'queued'
}

function formatMode(value: string | null | undefined): string {
  if (!value) return '-'
  return value.replace(/_/g, ' ')
}

function gateText(value: boolean): string {
  return value ? 'live' : 'gated'
}

function featureText(feature: BatchReadinessFeature | undefined, fallback = 'gated'): string {
  if (!feature) return fallback
  if (feature.public_enabled === true || feature.enabled === true) return 'available'
  if (feature.configured === true) return formatMode(feature.status || 'configured')
  return formatMode(feature.status || fallback)
}

async function readJson<T>(url: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data as T
}

export default function RenterBatchesPage() {
  const { lang, toggle } = useV2()
  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [renterName, setRenterName] = useState('DCP renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [batches, setBatches] = useState<BatchRecord[]>([])
  const [readiness, setReadiness] = useState<BatchReadiness | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [lines, setLines] = useState<BatchLine[]>([])
  const [manifest, setManifest] = useState<ResultManifest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [inputJsonl, setInputJsonl] = useState(SAMPLE_JSONL)
  const [purpose, setPurpose] = useState('batch-console-validation')

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
        const [me, batchList, readinessData] = await Promise.all([
          readJson<RenterMe>(`${base}/renters/me`, headers),
          readJson<BatchListResponse>(`${base}/batches?limit=25`, headers),
          readJson<BatchReadinessResponse>(`${base}/batches/readiness`, headers),
        ])
        if (cancelled) return
        const renter = me.renter
        const nextBatches = batchList.data || []
        setRenterName(renter?.organization || renter?.name || 'DCP renter')
        setRenterEmail(renter?.email || '')
        setBatches(nextBatches)
        setReadiness(readinessData.readiness || null)
        setSelectedBatchId(nextBatches[0]?.batch_id || '')
        setLoadState('ready')
      } catch (err) {
        if (cancelled) return
        setLoadState('error')
        setError(err instanceof Error ? err.message : 'Batch console could not be loaded.')
      }
    })()

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedBatchId || typeof window === 'undefined') {
      setLines([])
      setManifest(null)
      return
    }
    const key = getRenterKey()
    if (!key) return
    const base = getApiBase()
    const headers = { 'x-renter-key': key }
    let cancelled = false

    setDetailLoading(true)
    setDetailError('')
    ;(async () => {
      try {
        const [lineData, resultData] = await Promise.all([
          readJson<BatchLinesResponse>(`${base}/batches/${encodeURIComponent(selectedBatchId)}/lines?limit=100`, headers),
          readJson<BatchResultResponse>(`${base}/batches/${encodeURIComponent(selectedBatchId)}/results`, headers),
        ])
        if (cancelled) return
        setLines(lineData.data || [])
        setManifest(resultData.result || null)
      } catch (err) {
        if (cancelled) return
        setLines([])
        setManifest(null)
        setDetailError(err instanceof Error ? err.message : 'Batch details could not be loaded.')
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [selectedBatchId])

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.batch_id === selectedBatchId) || null,
    [batches, selectedBatchId],
  )

  const totals = useMemo(() => {
    return batches.reduce(
      (acc, batch) => {
        acc.requests += batch.request_count || 0
        acc.completed += batch.completed_count || 0
        acc.failed += batch.failed_count || 0
        acc.cost += batch.total_cost_halala || 0
        if (batch.results_available) acc.ready += 1
        return acc
      },
      { requests: 0, completed: 0, failed: 0, cost: 0, ready: 0 },
    )
  }, [batches])

  async function refreshBatches(nextSelectedId?: string) {
    const key = getRenterKey()
    if (!key) return
    const base = getApiBase()
    const headers = { 'x-renter-key': key }
    const data = await readJson<BatchListResponse>(`${base}/batches?limit=25`, headers)
    const nextBatches = data.data || []
    setBatches(nextBatches)
    setSelectedBatchId(nextSelectedId || nextBatches[0]?.batch_id || '')
  }

  async function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readiness && !readiness.request_creation_enabled) {
      setSubmitState('error')
      setSubmitError('Batch creation is currently gated.')
      return
    }
    const key = getRenterKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    setSubmitState('submitting')
    setSubmitError('')
    try {
      const base = getApiBase()
      const res = await fetch(`${base}/batches`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-renter-key': key,
          'idempotency-key': `batch-console-${Date.now()}`,
        },
        body: JSON.stringify({
          input_jsonl: inputJsonl,
          completion_window: '24h',
          metadata: { purpose: purpose || 'batch-console' },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Batch create failed: ${res.status}`)
      const created = data.batch as BatchRecord | undefined
      await refreshBatches(created?.batch_id)
      setSubmitState('idle')
    } catch (err) {
      setSubmitState('error')
      setSubmitError(err instanceof Error ? err.message : 'Batch could not be created.')
    }
  }

  const isLive = loadState === 'ready'
  const requestCreationEnabled = readiness?.request_creation_enabled !== false
  const publicExecutionEnabled = readiness?.public_execution_enabled === true
  const resultDownloadsConfigured = readiness?.features.result_downloads.configured === true
  const discountsEnabled = readiness?.features.discounts.enabled === true
  const readinessMode = readiness?.current_mode || 'metadata_validation_only'
  const supportedUrls = readiness?.supported_urls?.length
    ? readiness.supported_urls.join(' · ')
    : '/v1/chat/completions · /v1/complete'
  const completionWindows = readiness?.limits.completion_windows?.length
    ? readiness.limits.completion_windows.join(' · ')
    : '24h'

  return (
    <div className="rt-app bt-page">
      <PodSidebar
        navOpen={navOpen}
        renterName={renterName}
        renterEmail={renterEmail}
        currentPage="batches"
      />

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <PodTopbar
          renterName={renterName}
          isLive={isLive}
          lang={lang}
          onToggleLang={toggle}
          onToggleNav={() => setNavOpen((v) => !v)}
          pageLabelEn="Batch"
          pageLabelAr="الدُفعات"
        />

        <main className="rt-main bt-main">
          <h1 className="rt-h1">
            <Bi en="Batch" ar="الدُفعات" />{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="inference." ar="للاستدلال." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span><Bi en="JSONL validation" ar="تحقق JSONL" /></span>
            <span>
              <Bi
                en={`Line ledger live · execution ${gateText(publicExecutionEnabled)}`}
                ar={`سجل الأسطر يعمل · التنفيذ ${publicExecutionEnabled ? 'يعمل' : 'مشروط'}`}
              />
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state bt-state">
              <b><Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" /></b>
              <span><Bi en="Sign in before reading batch records." ar="سجل الدخول قبل قراءة سجلات الدُفعات." /></span>
            </div>
          )}

          {loadState === 'error' && (
            <div className="dash-state bt-state">
              <b><Bi en="Batch console unavailable" ar="لوحة الدُفعات غير متاحة" /></b>
              <span>{error}</span>
            </div>
          )}

          {loadState === 'loading' && (
            <div className="bt-skeleton-grid" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => <span key={i} />)}
            </div>
          )}

          {loadState === 'ready' && (
            <>
              <section className="kpi-row bt-kpis" aria-label="Batch summary">
                <div className="kpi featured">
                  <span className="k"><Bi en="Batches" ar="الدُفعات" /></span>
                  <span className="v">{formatNumber(batches.length)}</span>
                  <span className="d flat"><Bi en="validated records" ar="سجلات متحققة" /></span>
                </div>
                <div className="kpi">
                  <span className="k"><Bi en="Requests" ar="الطلبات" /></span>
                  <span className="v">{formatNumber(totals.requests)}</span>
                  <span className="d flat"><Bi en="line ledger rows" ar="صفوف سجل الأسطر" /></span>
                </div>
                <div className="kpi">
                  <span className="k"><Bi en="Result artifacts" ar="ملفات النتائج" /></span>
                  <span className="v">{formatNumber(totals.ready)}</span>
                  <span className={resultDownloadsConfigured ? 'd up' : 'd flat'}>
                    <Bi en={resultDownloadsConfigured ? 'download signer configured' : 'checksum gated'} ar={resultDownloadsConfigured ? 'موقع التنزيل مضبوط' : 'مشروط بالبصمة'} />
                  </span>
                </div>
                <div className="kpi">
                  <span className="k"><Bi en="Cost" ar="التكلفة" /></span>
                  <span className="v">{(totals.cost / 100).toFixed(2)}<span className="u">SAR</span></span>
                  <span className="d flat"><Bi en={discountsEnabled ? 'batch discount live' : 'batch discount gated'} ar={discountsEnabled ? 'خصم الدفعات يعمل' : 'خصم الدفعات مشروط'} /></span>
                </div>
              </section>

              <section className="bt-readiness" aria-label="Batch readiness">
                <div className="bt-section-head compact">
                  <div>
                    <span className="bt-eyebrow"><Bi en="Readiness" ar="الجاهزية" /></span>
                    <h2>{formatMode(readinessMode)}</h2>
                  </div>
                  <span className="bt-contract mono">{readiness?.version || 'dcp.batch_inference_readiness.v1'}</span>
                </div>
                <div className="bt-readiness-grid">
                  <div>
                    <span><Bi en="Create" ar="الإنشاء" /></span>
                    <b>{requestCreationEnabled ? 'available' : 'gated'}</b>
                  </div>
                  <div>
                    <span><Bi en="Execute" ar="التنفيذ" /></span>
                    <b>{gateText(publicExecutionEnabled)}</b>
                  </div>
                  <div>
                    <span><Bi en="Downloads" ar="التنزيل" /></span>
                    <b>{featureText(readiness?.features.result_downloads)}</b>
                  </div>
                  <div>
                    <span><Bi en="Settlement" ar="التسوية" /></span>
                    <b>{featureText(readiness?.features.settlement)}</b>
                  </div>
                  <div>
                    <span><Bi en="Discounts" ar="الخصومات" /></span>
                    <b>{discountsEnabled ? 'live' : 'not enabled'}</b>
                  </div>
                  <div>
                    <span><Bi en="Window" ar="المدة" /></span>
                    <b>{completionWindows}</b>
                  </div>
                </div>
                <div className="bt-supported">
                  <span><Bi en="Supported URLs" ar="المسارات المدعومة" /></span>
                  <code>{supportedUrls}</code>
                </div>
              </section>

              <section className="bt-grid">
                <div className="bt-ledger">
                  <div className="bt-section-head">
                    <div>
                      <span className="bt-eyebrow"><Bi en="Batch ledger" ar="سجل الدُفعات" /></span>
                      <h2><Bi en="Validated jobs" ar="المهام المتحققة" /></h2>
                    </div>
                    <button className="btn-sec" type="button" onClick={() => void refreshBatches(selectedBatchId)}>
                      <Bi en="Refresh" ar="تحديث" />
                    </button>
                  </div>

                  {batches.length === 0 ? (
                    <div className="bt-empty">
                      <b><Bi en="No batch records" ar="لا توجد سجلات دُفعات" /></b>
                      <span><Bi en="Submit JSONL to create a validation record." ar="أرسل JSONL لإنشاء سجل تحقق." /></span>
                    </div>
                  ) : (
                    <div className="bt-table-wrap">
                      <table className="tbl bt-table">
                        <thead>
                          <tr>
                            <th><Bi en="Batch" ar="الدُفعة" /></th>
                            <th><Bi en="Status" ar="الحالة" /></th>
                            <th><Bi en="Requests" ar="الطلبات" /></th>
                            <th><Bi en="Input proof" ar="إثبات الإدخال" /></th>
                            <th><Bi en="Updated" ar="آخر تحديث" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map((batch) => (
                            <tr
                              key={batch.batch_id}
                              className={batch.batch_id === selectedBatchId ? 'bt-row-selected' : ''}
                              onClick={() => setSelectedBatchId(batch.batch_id)}
                            >
                              <td>
                                <button className="bt-link-button" type="button">{batch.batch_id}</button>
                                <span className="bt-table-sub">{String(batch.metadata?.purpose || 'batch')}</span>
                              </td>
                              <td><span className={`stat ${statusTone(batch.status)}`}>{batch.status}</span></td>
                              <td className="mono">{formatNumber(batch.request_count)}</td>
                              <td className="mono">{shortHash(batch.input_checksum_sha256)}</td>
                              <td className="mono">{formatDate(batch.updated_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <aside className="bt-create">
                  <div className="bt-section-head compact">
                    <div>
                      <span className="bt-eyebrow"><Bi en="Create" ar="إنشاء" /></span>
                      <h2><Bi en="JSONL batch" ar="دفعة JSONL" /></h2>
                    </div>
                  </div>

                  <form onSubmit={submitBatch} className="bt-form">
                    <label>
                      <span><Bi en="Purpose" ar="الغرض" /></span>
                      <input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
                    </label>
                    <label>
                      <span><Bi en="Input JSONL" ar="إدخال JSONL" /></span>
                      <textarea value={inputJsonl} onChange={(event) => setInputJsonl(event.target.value)} rows={11} spellCheck={false} />
                    </label>
                    {submitState === 'error' && <p className="bt-error">{submitError}</p>}
                    <button className="btn-pri" type="submit" disabled={submitState === 'submitting' || !requestCreationEnabled}>
                      <Bi
                        en={!requestCreationEnabled ? 'Creation gated' : submitState === 'submitting' ? 'Validating' : 'Create batch'}
                        ar={!requestCreationEnabled ? 'الإنشاء مشروط' : submitState === 'submitting' ? 'جار التحقق' : 'إنشاء دفعة'}
                      />
                    </button>
                  </form>
                </aside>
              </section>

              <section className="bt-detail">
                <div className="bt-section-head">
                  <div>
                    <span className="bt-eyebrow"><Bi en="Selected batch" ar="الدُفعة المختارة" /></span>
                    <h2>{selectedBatch?.batch_id || <Bi en="No selection" ar="لا يوجد اختيار" />}</h2>
                  </div>
                  {selectedBatch && <span className={`stat ${statusTone(selectedBatch.status)}`}>{selectedBatch.status}</span>}
                </div>

                {!selectedBatch ? (
                  <div className="bt-empty"><Bi en="Create or select a batch." ar="أنشئ أو اختر دفعة." /></div>
                ) : (
                  <div className="bt-detail-grid">
                    <div className="bt-lines">
                      <div className="bt-subhead">
                        <b><Bi en="Line ledger" ar="سجل الأسطر" /></b>
                        <span>{detailLoading ? 'loading' : `${lines.length} rows`}</span>
                      </div>
                      {detailError && <p className="bt-error">{detailError}</p>}
                      <div className="bt-table-wrap">
                        <table className="tbl bt-line-table">
                          <thead>
                            <tr>
                              <th><Bi en="Custom id" ar="المعرف" /></th>
                              <th><Bi en="Endpoint" ar="المسار" /></th>
                              <th><Bi en="Model" ar="النموذج" /></th>
                              <th><Bi en="Status" ar="الحالة" /></th>
                              <th><Bi en="Usage" ar="الاستخدام" /></th>
                              <th><Bi en="Cost" ar="التكلفة" /></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.length === 0 ? (
                              <tr><td colSpan={6} className="bt-muted-cell"><Bi en="No line rows loaded" ar="لم يتم تحميل صفوف" /></td></tr>
                            ) : lines.map((line) => (
                              <tr key={line.custom_id}>
                                <td>
                                  <span className="mono">{line.custom_id}</span>
                                  <span className="bt-table-sub">{shortHash(line.request_checksum_sha256)}</span>
                                </td>
                                <td className="mono">{line.url}</td>
                                <td className="mono">{line.model_id}</td>
                                <td><span className={`stat ${statusTone(line.status)}`}>{line.status}</span></td>
                                <td className="mono">{formatNumber(line.usage.total_tokens)}</td>
                                <td className="sar">{(line.cost_halala / 100).toFixed(2)}<span className="u">SAR</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bt-proof">
                      <div className="bt-subhead">
                        <b><Bi en="Result proof" ar="إثبات النتيجة" /></b>
                        <span>{manifest?.next || 'pending'}</span>
                      </div>
                      <dl>
                        <div>
                          <dt><Bi en="Available" ar="متاحة" /></dt>
                          <dd>{manifest?.results_available ? 'true' : 'false'}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Result key" ar="مفتاح النتيجة" /></dt>
                          <dd>{manifest?.result_storage_key || '-'}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Checksum" ar="البصمة" /></dt>
                          <dd>{shortHash(manifest?.result_checksum_sha256)}</dd>
                        </div>
                        <div>
                          <dt><Bi en="Download" ar="التنزيل" /></dt>
                          <dd>{manifest?.download_enabled ? 'signed' : 'gated'}</dd>
                        </div>
                      </dl>
                      {manifest?.download_enabled && manifest.download_url && (
                        <a className="btn-sec" href={manifest.download_url} rel="noopener noreferrer">
                          <Bi en="Download JSONL" ar="تنزيل JSONL" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
