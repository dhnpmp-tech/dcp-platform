'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type AuthKind = 'none' | 'provider' | 'renter' | 'admin'

type Endpoint = {
  id: string
  method: HttpMethod
  path: string
  authKind: AuthKind
  authLabel: string
  descriptionEn: string
  descriptionAr: string
  requestExample?: string
  responseExample: string
}

type EndpointSection = {
  id: string
  titleEn: string
  titleAr: string
  endpoints: Endpoint[]
}

const sections: EndpointSection[] = [
  {
    id: 'providers',
    titleEn: 'Provider Endpoints',
    titleAr: 'نقاط المزود',
    endpoints: [
      {
        id: 'provider-register',
        method: 'POST',
        path: '/api/providers/register',
        authKind: 'none',
        authLabel: 'None',
        descriptionEn: 'Register a provider and return provider API key.',
        descriptionAr: 'تسجيل مزود جديد وإرجاع مفتاح API.',
        requestExample: `{
  "name": "Riyadh RTX Node",
  "email": "provider@example.com",
  "gpu_model": "RTX 4090",
  "os": "linux",
  "phone": "+966500000000"
}`,
        responseExample: `{
  "success": true,
  "provider_id": 42,
  "api_key": "dcp-provider-..."
}`,
      },
      {
        id: 'provider-me',
        method: 'GET',
        path: '/api/providers/me?key=:api_key',
        authKind: 'provider',
        authLabel: 'Provider API key',
        descriptionEn: 'Provider profile, jobs, earnings, and heartbeat summary.',
        descriptionAr: 'ملف المزود والوظائف والأرباح وملخص heartbeat.',
        responseExample: `{
  "provider": { "id": 42, "status": "online", "total_jobs": 19 },
  "recent_jobs": []
}`,
      },
      {
        id: 'provider-heartbeat',
        method: 'POST',
        path: '/api/providers/heartbeat',
        authKind: 'provider',
        authLabel: 'Provider API key',
        descriptionEn: 'Daemon heartbeat with GPU utilization telemetry.',
        descriptionAr: 'نبضة daemon مع بيانات استخدام GPU.',
        requestExample: `{
  "api_key": "dcp-provider-...",
  "gpu_status": { "gpu_name": "NVIDIA RTX 4090", "gpu_util_pct": 42 }
}`,
        responseExample: `{
  "success": true,
  "status": "online",
  "update_available": false
}`,
      },
    ],
  },
  {
    id: 'renters',
    titleEn: 'Renter Endpoints',
    titleAr: 'نقاط المستأجر',
    endpoints: [
      {
        id: 'renter-register',
        method: 'POST',
        path: '/api/renters/register',
        authKind: 'none',
        authLabel: 'None',
        descriptionEn: 'Register a renter account and return renter key.',
        descriptionAr: 'تسجيل مستأجر جديد وإرجاع مفتاح المستأجر.',
        requestExample: `{
  "name": "Acme AI",
  "email": "renter@example.com",
  "organization": "Acme"
}`,
        responseExample: `{
  "success": true,
  "renter_id": 7,
  "api_key": "dcp-renter-..."
}`,
      },
      {
        id: 'renter-me',
        method: 'GET',
        path: '/api/renters/me?key=:api_key',
        authKind: 'renter',
        authLabel: 'Renter API key',
        descriptionEn: 'Renter profile and wallet state.',
        descriptionAr: 'ملف المستأجر وحالة المحفظة.',
        responseExample: `{
  "renter": { "id": 7, "balance_halala": 5000 },
  "recent_jobs": []
}`,
      },
      {
        id: 'renter-available-providers',
        method: 'GET',
        path: '/api/renters/available-providers',
        authKind: 'none',
        authLabel: 'Public',
        descriptionEn: 'List currently online providers for marketplace.',
        descriptionAr: 'قائمة المزودين المتصلين لسوق الاستئجار.',
        responseExample: `{
  "providers": [{ "id": 42, "gpu_model": "RTX 4090", "is_live": true }],
  "total": 1
}`,
      },
    ],
  },
  {
    id: 'jobs',
    titleEn: 'Job Endpoints',
    titleAr: 'نقاط المهام',
    endpoints: [
      {
        id: 'jobs-submit',
        method: 'POST',
        path: '/api/jobs/submit',
        authKind: 'renter',
        authLabel: 'x-renter-key',
        descriptionEn: 'Submit renter compute job with billing pre-hold.',
        descriptionAr: 'إرسال مهمة حوسبة مع احتجاز تكلفة مسبق.',
        requestExample: `{
  "provider_id": 42,
  "job_type": "llm-inference",
  "duration_minutes": 3,
  "container_spec": { "image_type": "vllm-serve" },
  "params": {
    "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    "prompt": "Summarize DCP in three bullets"
  }
}`,
        responseExample: `{
  "success": true,
  "job": { "job_id": "job-...", "status": "pending", "cost_halala": 450 }
}`,
      },
      {
        id: 'jobs-status',
        method: 'GET',
        path: '/api/jobs/:job_id',
        authKind: 'renter',
        authLabel: 'Renter/Provider/Admin key',
        descriptionEn: 'Fetch current job state and execution details.',
        descriptionAr: 'جلب حالة المهمة الحالية وتفاصيل التنفيذ.',
        responseExample: `{
  "job": { "job_id": "job-abc123", "status": "running" }
}`,
      },
      {
        id: 'jobs-output',
        method: 'GET',
        path: '/api/jobs/:job_id/output',
        authKind: 'renter',
        authLabel: 'Renter/Provider/Admin key',
        descriptionEn: 'Fetch job output; returns 202 while still running.',
        descriptionAr: 'جلب مخرجات المهمة؛ ترجع 202 أثناء التشغيل.',
        responseExample: `{
  "type": "text",
  "response": "Model output...",
  "billing": { "actual_cost_halala": 188 }
}`,
      },
    ],
  },
  {
    id: 'admin',
    titleEn: 'Admin Endpoints',
    titleAr: 'نقاط الإدارة',
    endpoints: [
      {
        id: 'admin-dashboard',
        method: 'GET',
        path: '/api/admin/dashboard',
        authKind: 'admin',
        authLabel: 'x-admin-token',
        descriptionEn: 'Platform metrics for operations and finance.',
        descriptionAr: 'مؤشرات المنصة التشغيلية والمالية.',
        responseExample: `{
  "stats": { "total_providers": 120, "online_now": 48 }
}`,
      },
      {
        id: 'admin-withdrawals',
        method: 'GET',
        path: '/api/admin/withdrawals',
        authKind: 'admin',
        authLabel: 'x-admin-token',
        descriptionEn: 'List provider withdrawal requests and status breakdown.',
        descriptionAr: 'قائمة طلبات السحب وحالتها.',
        responseExample: `{
  "pending": [],
  "all": [],
  "summary": { "pending_count": 0 }
}`,
      },
    ],
  },
]

const allEndpoints = sections.flatMap((section) => section.endpoints)

function methodClass(method: HttpMethod) {
  if (method === 'POST') return 'bg-blue-500/15 text-blue-200 border-blue-400/40'
  if (method === 'PATCH') return 'bg-amber-500/15 text-amber-200 border-amber-400/40'
  if (method === 'DELETE') return 'bg-red-500/15 text-red-200 border-red-400/40'
  return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40'
}

function toProxyPath(path: string) {
  if (!path.startsWith('/api/')) {
    return path
  }
  return `/api/${path.slice('/api/'.length)}`
}

function withPathParams(path: string, jobId: string) {
  return path.replace(':job_id', encodeURIComponent(jobId || 'job-abc123')).replace(':api_key', 'YOUR_API_KEY')
}

function prettyPrint(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export default function ApiDocsPage() {
  const [selectedId, setSelectedId] = useState(allEndpoints[0].id)
  const [providerKey, setProviderKey] = useState('')
  const [renterKey, setRenterKey] = useState('')
  const [adminToken, setAdminToken] = useState('')
  const [jobId, setJobId] = useState('job-abc123')
  const [body, setBody] = useState(allEndpoints[0].requestExample || '')
  const [result, setResult] = useState('')
  const [statusLine, setStatusLine] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const selected = useMemo(
    () => allEndpoints.find((entry) => entry.id === selectedId) || allEndpoints[0],
    [selectedId]
  )

  const runtimePath = useMemo(() => withPathParams(selected.path, jobId), [selected.path, jobId])

  const runtimeUrl = useMemo(() => {
    const path = toProxyPath(runtimePath)
    if (path.startsWith('http')) return path
    return path
  }, [runtimePath])

  const onEndpointChange = (nextId: string) => {
    setSelectedId(nextId)
    const next = allEndpoints.find((entry) => entry.id === nextId)
    setBody(next?.requestExample || '')
    setResult('')
    setStatusLine('')
  }

  const runRequest = async () => {
    setIsRunning(true)
    setStatusLine('')

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (selected.authKind === 'provider' && providerKey.trim()) {
      headers['x-provider-key'] = providerKey.trim()
    }
    if (selected.authKind === 'renter' && renterKey.trim()) {
      headers['x-renter-key'] = renterKey.trim()
    }
    if (selected.authKind === 'admin' && adminToken.trim()) {
      headers['x-admin-token'] = adminToken.trim()
    }

    const requestInit: RequestInit = {
      method: selected.method,
      headers,
    }

    if (selected.method !== 'GET' && body.trim()) {
      headers['Content-Type'] = 'application/json'
      requestInit.body = body
    }

    try {
      const res = await fetch(runtimeUrl, requestInit)
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }

      setStatusLine(`${res.status} ${res.statusText || ''}`.trim())
      setResult(prettyPrint(parsed))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown request error'
      setStatusLine('Request failed')
      setResult(message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-dc1-void">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-dc1-amber">DCP API</p>
          <h1 className="mt-2 text-3xl font-bold text-dc1-text-primary sm:text-4xl">API Reference + Try It Out</h1>
          <p className="mt-3 text-dc1-text-secondary">
            Use proxy base <code className="rounded bg-dc1-surface-l3 px-1 py-0.5">/api/dc1</code> in browser and direct base{' '}
            <code className="rounded bg-dc1-surface-l3 px-1 py-0.5">https://api.dcp.sa/api</code> for backend/server-side calls.
          </p>
          <p className="mt-2 text-dc1-text-secondary">
            تكامل تفاعلي لتجربة الطلبات مباشرة من التوثيق مع دعم مفاتيح المزود والمستأجر والإدارة.
          </p>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <Link href="/docs/openapi.yaml" className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-dc1-text-secondary hover:text-dc1-amber">
              OpenAPI YAML
            </Link>
            <Link href="/docs/api-reference" className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2 text-dc1-text-secondary hover:text-dc1-amber">
              Auth + endpoint map guide
            </Link>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6">
          <h2 className="text-xl font-semibold text-dc1-text-primary">Interactive Try It Out</h2>
          <p className="mt-1 text-sm text-dc1-text-secondary">Select an endpoint, fill keys/body, and execute against the live proxy.</p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Endpoint</span>
              <select
                value={selected.id}
                onChange={(event) => onEndpointChange(event.target.value)}
                className="input"
              >
                {sections.map((section) => (
                  <optgroup key={section.id} label={`${section.titleEn} / ${section.titleAr}`}>
                    {section.endpoints.map((endpoint) => (
                      <option key={endpoint.id} value={endpoint.id}>
                        {endpoint.method} {endpoint.path}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Runtime URL</span>
              <input value={runtimeUrl} readOnly className="input text-xs" />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Provider Key (optional)</span>
              <input value={providerKey} onChange={(event) => setProviderKey(event.target.value)} placeholder="dcp-provider-..." className="input" />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Renter Key (optional)</span>
              <input value={renterKey} onChange={(event) => setRenterKey(event.target.value)} placeholder="dcp-renter-..." className="input" />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Admin Token (optional)</span>
              <input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="admin token" className="input" />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Path job_id placeholder</span>
              <input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="job-abc123" className="input" />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Endpoint Notes</p>
            <p className="mt-1 text-sm text-dc1-text-secondary">{selected.descriptionEn}</p>
            <p className="mt-1 text-sm text-dc1-text-secondary">{selected.descriptionAr}</p>
            <p className="mt-2 text-xs text-dc1-text-muted">Auth: {selected.authLabel}</p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Request Body (JSON)</p>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              className="mt-2 w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 font-mono text-xs text-dc1-text-secondary"
              placeholder="{ }"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={runRequest}
              disabled={isRunning}
              className="btn btn-primary btn-sm disabled:opacity-60"
            >
              {isRunning ? 'Running...' : `Run ${selected.method}`}
            </button>
            <span className="text-xs text-dc1-text-muted">Requests are executed from browser context using same-origin proxy.</span>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Response</p>
            <p className="mt-1 text-sm text-dc1-text-secondary">{statusLine || 'No response yet.'}</p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary max-w-full whitespace-pre-wrap break-words">
              {result || '// Execute a request to view response payload.'}
            </pre>
          </div>
        </section>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="space-y-4">
              <h2 className="text-2xl font-bold text-dc1-text-primary">{section.titleEn}</h2>
              <p className="text-sm text-dc1-text-secondary">{section.titleAr}</p>

              {section.endpoints.map((endpoint) => (
                <article key={endpoint.id} className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded border px-2 py-1 text-xs font-semibold ${methodClass(endpoint.method)}`}>
                      {endpoint.method}
                    </span>
                    <code className="text-sm text-dc1-text-primary">{endpoint.path}</code>
                  </div>

                  <p className="mt-3 text-sm text-dc1-text-secondary">{endpoint.descriptionEn}</p>
                  <p className="mt-1 text-sm text-dc1-text-secondary">{endpoint.descriptionAr}</p>
                  <p className="mt-2 text-xs text-dc1-text-muted">Auth: {endpoint.authLabel}</p>

                  {endpoint.requestExample && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Example Request</p>
                      <pre className="overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary max-w-full whitespace-pre-wrap break-words">
                        {endpoint.requestExample}
                      </pre>
                    </div>
                  )}

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-muted">Example Response</p>
                    <pre className="overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary max-w-full whitespace-pre-wrap break-words">
                      {endpoint.responseExample}
                    </pre>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
