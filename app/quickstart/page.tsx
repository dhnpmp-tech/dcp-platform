'use client'

/**
 * Public /quickstart — API quickstart for renters.
 *
 * Goal: a developer can copy-paste a working call to api.dcp.sa in under
 * two minutes. Three code tabs (curl / Python / Node.js), a multimodal
 * block, an auth section, a billing/rate-limit section, and an error
 * codes table.
 *
 * Notes on data sources:
 *   - Code snippets are hand-written to match the live OpenAI-compatible
 *     surface served at https://api.dcp.sa/v1/chat/completions and the
 *     shared OpenAPI spec at https://github.com/DCP-SA/dcp-contracts.
 *   - 402 envelope shape matches backend/src/routes/v1.js (insufficient
 *     balance branch).
 *   - English-only for this PR. Arabic translations are queued for the
 *     next i18n sweep.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'

const API_BASE = 'https://api.dcp.sa/v1'
const CONTRACTS_REPO = 'https://github.com/DCP-SA/dcp-contracts'

// The canonical model id below is what the spec asked us to surface as
// the headline example. At time of writing, the live catalog returned by
// GET https://api.dcp.sa/v1/models exposes other ids (qwen3:30b-a3b,
// qwen3.5:35b-a3b, etc.) — if you copy-paste this without checking the
// live list you may get a 404 with `model_not_found`. The /status page
// always reflects what's actually serving.
const HEADLINE_MODEL = 'qwen3.6-27b-mtp'

type TabKey = 'curl' | 'python' | 'node'

interface ErrorRow {
  code: number
  label: string
  meaning: string
  remediation: string
}

const ERROR_ROWS: ErrorRow[] = [
  {
    code: 401,
    label: 'unauthenticated',
    meaning: 'Missing or invalid renter key.',
    remediation: 'Send Authorization: Bearer dcp-renter-… (or x-renter-key header, or ?key= query).',
  },
  {
    code: 402,
    label: 'billing_insufficient_balance',
    meaning: 'Your wallet balance is below the estimated cost of the call.',
    remediation: 'Top up at dcp.sa/renter/billing. The error body includes billing_url, balance_halala and required_halala.',
  },
  {
    code: 422,
    label: 'validation_error',
    meaning: 'Request body failed schema validation (bad model id, missing messages, etc.).',
    remediation: 'Inspect error.message and the dcp-contracts OpenAPI schema.',
  },
  {
    code: 429,
    label: 'rate_limited',
    meaning: 'Too many requests in a short window for this key or IP.',
    remediation: 'Back off using the Retry-After header. Defaults are conservative; contact support for higher quotas.',
  },
  {
    code: 502,
    label: 'provider_upstream_error',
    meaning: 'The selected provider returned a bad response.',
    remediation: 'Retry — the router will pick a different provider on the retry.',
  },
  {
    code: 503,
    label: 'no_provider_available',
    meaning: 'No live provider is currently serving the requested model.',
    remediation: 'Check dcp.sa/status for live model availability and try a different model.',
  },
]

const CURL_BASIC = `curl -X POST ${API_BASE}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -d '{
    "model": "${HEADLINE_MODEL}",
    "messages": [
      {"role": "user", "content": "Say hello from DCP in one sentence."}
    ],
    "max_tokens": 64
  }'`

const PYTHON_BASIC = `# pip install openai
from openai import OpenAI
import os

client = OpenAI(
    base_url="${API_BASE}",
    api_key=os.environ["DCP_RENTER_KEY"],
)

resp = client.chat.completions.create(
    model="${HEADLINE_MODEL}",
    messages=[{"role": "user", "content": "Say hello from DCP in one sentence."}],
    max_tokens=64,
)

print(resp.choices[0].message.content)`

const NODE_BASIC = `// npm install openai
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API_BASE}",
  apiKey: process.env.DCP_RENTER_KEY,
});

const resp = await client.chat.completions.create({
  model: "${HEADLINE_MODEL}",
  messages: [{ role: "user", content: "Say hello from DCP in one sentence." }],
  max_tokens: 64,
});

console.log(resp.choices[0].message.content);`

const MULTIMODAL_CURL = `# Vision routing is live but currently VRAM-constrained.
# Check https://dcp.sa/status for live multimodal availability.
curl -X POST ${API_BASE}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DCP_RENTER_KEY" \\
  -d '{
    "model": "${HEADLINE_MODEL}",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
            }
          }
        ]
      }
    ],
    "max_tokens": 256
  }'`

const ERROR_402_ENVELOPE = `HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": {
    "status": 402,
    "type": "billing_error",
    "code": "billing_insufficient_balance",
    "message": "Insufficient balance. Top up to continue.",
    "details": {
      "billing_url": "https://dcp.sa/renter/billing",
      "balance_halala": 412,
      "required_halala": 1800
    }
  }
}`

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore — clipboard may be blocked in the iframe; user can still select+copy
    }
  }

  return (
    <div className="relative">
      {label ? (
        <div className="absolute left-3 top-2 text-[10px] font-mono uppercase tracking-wider text-dc1-text-muted">
          {label}
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded border border-dc1-border bg-dc1-surface-l3 px-2 py-1 text-xs text-dc1-text-muted transition hover:text-dc1-amber"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre
        dir="ltr"
        className="overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 pr-16 pt-8 text-left text-xs leading-relaxed text-dc1-text-secondary"
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Tabs({
  active,
  onChange,
}: {
  active: TabKey
  onChange: (key: TabKey) => void
}) {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'curl', label: 'curl' },
    { key: 'python', label: 'Python' },
    { key: 'node', label: 'Node.js' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? 'border-dc1-amber/40 bg-dc1-amber/15 text-dc1-amber'
                : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function SectionHeading({ id, kicker, title }: { id: string; kicker: string; title: string }) {
  return (
    <div id={id} className="mb-4 scroll-mt-24">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-dc1-amber">{kicker}</p>
      <h2 className="mt-1 text-2xl font-bold text-dc1-text-primary">{title}</h2>
    </div>
  )
}

export default function QuickstartPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('curl')

  // Lightweight live signal: did the live catalog actually list our headline
  // model? If not, render a small inline warning so the docs never lie.
  const [headlineModelLive, setHeadlineModelLive] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/v1/models', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = Array.isArray(data?.data)
          ? data.data.map((row: { id?: unknown }) => String(row?.id || '')).filter(Boolean)
          : []
        if (!cancelled) setHeadlineModelLive(ids.includes(HEADLINE_MODEL))
      } catch {
        if (!cancelled) setHeadlineModelLive(null)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  // Pre-fill the env-export with the logged-in renter's key (auth stores it in
  // localStorage). The key stays in the env var — the samples still read
  // $DCP_RENTER_KEY — so the copy-paste setup is ready-to-run without teaching
  // anyone to hardcode a secret into committed application code.
  const [renterKey, setRenterKey] = useState<string | null>(null)
  useEffect(() => {
    try {
      const k = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key')
      if (k) setRenterKey(k)
    } catch { /* localStorage unavailable (SSR / private mode) — keep placeholder */ }
  }, [])

  const activeSnippet =
    activeTab === 'curl' ? CURL_BASIC : activeTab === 'python' ? PYTHON_BASIC : NODE_BASIC

  return (
    <div className="min-h-screen bg-dc1-void" dir="ltr">
      <Header />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero */}
        <section aria-labelledby="quickstart-heading" className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-dc1-amber">QUICKSTART</p>
          <h1 id="quickstart-heading" className="mt-2 text-4xl font-bold text-dc1-text-primary sm:text-5xl">
            Your first DCP call, in under two minutes
          </h1>
          <p className="mt-4 max-w-2xl text-base text-dc1-text-secondary">
            DCP serves an OpenAI-compatible API at{' '}
            <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">
              {API_BASE}
            </code>
            . If you can call OpenAI, you can call DCP. Three steps: get a key, send a request, read the response.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/renter/register" className="btn btn-primary btn-md">
              Get an API key
            </Link>
            <Link href="/pricing" className="btn btn-secondary btn-md">
              See pricing
            </Link>
            <a
              href={CONTRACTS_REPO}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-md"
            >
              OpenAPI spec ↗
            </a>
          </div>
        </section>

        {/* Step 1: Get a key */}
        <section className="mb-12">
          <SectionHeading id="get-key" kicker="STEP 1" title="Get an API key" />
          <ol className="space-y-3 text-sm text-dc1-text-secondary">
            <li>
              <span className="font-semibold text-dc1-text-primary">1. </span>
              Sign up at{' '}
              <Link href="/renter/register" className="text-dc1-amber hover:underline">
                dcp.sa/renter/register
              </Link>
              . New accounts get a 100 SAR starter credit.
            </li>
            <li>
              <span className="font-semibold text-dc1-text-primary">2. </span>
              Open your dashboard and copy your renter key. It will start with{' '}
              <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">dcp-renter-</code>{' '}
              (legacy{' '}
              <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">dc1-renter-</code>{' '}
              prefixes also work).
            </li>
            <li>
              <span className="font-semibold text-dc1-text-primary">3. </span>
              Export it in your shell so the samples below pick it up:
              <CodeBlock code={`export DCP_RENTER_KEY="${renterKey || 'dcp-renter-...'}"`} />
              {renterKey ? (
                <span className="mt-1 block text-xs text-status-success">
                  ✓ Pre-filled with your key from this session — copy and run.
                </span>
              ) : (
                <span className="mt-1 block text-xs text-dc1-text-muted">
                  Sign in and this fills in with your key automatically.
                </span>
              )}
            </li>
          </ol>
        </section>

        {/* Step 2: First call */}
        <section className="mb-12">
          <SectionHeading id="first-call" kicker="STEP 2" title="Your first call" />
          <p className="mb-4 text-sm text-dc1-text-secondary">
            Pick a language. All three snippets hit the same endpoint —{' '}
            <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">
              POST {API_BASE}/chat/completions
            </code>
            .
          </p>
          <Tabs active={activeTab} onChange={setActiveTab} />
          <div className="mt-3">
            <CodeBlock code={activeSnippet} label={activeTab} />
          </div>
          {headlineModelLive === false ? (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
              Live model catalog at <code>/v1/models</code> does not currently list{' '}
              <code>{HEADLINE_MODEL}</code>. Substitute one of the model ids shown on{' '}
              <Link href="/status" className="underline hover:text-amber-200">
                /status
              </Link>{' '}
              and re-run.
            </div>
          ) : null}
        </section>

        {/* Step 3: Multimodal */}
        <section className="mb-12">
          <SectionHeading id="multimodal" kicker="STEP 3" title="Multimodal (text + image)" />
          <p className="mb-4 text-sm text-dc1-text-secondary">
            Vision routing is live and uses the OpenAI{' '}
            <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">content</code>{' '}
            array format. Image availability is currently VRAM-constrained — check{' '}
            <Link href="/status" className="text-dc1-amber hover:underline">
              dcp.sa/status
            </Link>{' '}
            for which multimodal models are live right now.
          </p>
          <CodeBlock code={MULTIMODAL_CURL} label="curl" />
        </section>

        {/* Auth */}
        <section className="mb-12">
          <SectionHeading id="auth" kicker="STEP 4" title="Authentication" />
          <p className="mb-3 text-sm text-dc1-text-secondary">
            DCP accepts your renter key three ways. Pick whichever fits your client. All three are accepted on every endpoint.
          </p>
          <ul className="space-y-2 text-sm text-dc1-text-secondary">
            <li>
              <span className="font-semibold text-dc1-text-primary">Bearer header (preferred): </span>
              <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">Authorization: Bearer dcp-renter-…</code>
            </li>
            <li>
              <span className="font-semibold text-dc1-text-primary">Custom header: </span>
              <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">x-renter-key: dcp-renter-…</code>
            </li>
            <li>
              <span className="font-semibold text-dc1-text-primary">Query parameter: </span>
              <code className="rounded bg-dc1-surface-l2 px-1.5 py-0.5 text-dc1-amber">?key=dcp-renter-…</code>{' '}
              (use this only for one-off shell tests; it ends up in logs)
            </li>
          </ul>
          <div className="mt-4 rounded-lg border border-dc1-amber/25 bg-dc1-amber/5 px-4 py-3 text-xs text-dc1-amber">
            Both <code>dcp-renter-</code> and the legacy <code>dc1-renter-</code> prefixes are accepted. Existing
            integrations do not need to rotate keys.
          </div>
        </section>

        {/* Billing & rate limits */}
        <section className="mb-12">
          <SectionHeading id="billing" kicker="STEP 5" title="Billing &amp; rate limits" />
          <ul className="space-y-2 text-sm text-dc1-text-secondary">
            <li>
              DCP bills in SAR halala (1 SAR = 100 halala). Pricing details and the per-model rate card live at{' '}
              <Link href="/pricing" className="text-dc1-amber hover:underline">
                dcp.sa/pricing
              </Link>
              .
            </li>
            <li>New renter accounts receive a 100 SAR starter credit on signup. PAYG is the default; monthly subscription tiers (Starter / Growth / Scale) discount the per-token rate by 15–30%.</li>
            <li>
              Rate limits are per-key and per-IP. Production renters who need higher quotas can request them at{' '}
              <a href="mailto:billing@dcp.sa" className="text-dc1-amber hover:underline">
                billing@dcp.sa
              </a>
              .
            </li>
            <li>
              If your balance drops below the estimated cost of a call, you'll get a 402 with the envelope below.
              The body's <code>details.billing_url</code> takes the renter straight to the top-up page.
            </li>
          </ul>
          <div className="mt-4">
            <CodeBlock code={ERROR_402_ENVELOPE} label="402 envelope" />
          </div>
        </section>

        {/* Error codes */}
        <section className="mb-12">
          <SectionHeading id="errors" kicker="REFERENCE" title="Error codes" />
          <div className="overflow-x-auto rounded-lg border border-dc1-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-dc1-surface-l2 text-xs uppercase tracking-wider text-dc1-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">HTTP</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Meaning</th>
                  <th scope="col" className="px-4 py-3 font-semibold">What to do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dc1-border bg-dc1-surface-l1">
                {ERROR_ROWS.map((row) => (
                  <tr key={row.code}>
                    <td className="px-4 py-3 font-mono text-dc1-amber">{row.code}</td>
                    <td className="px-4 py-3 font-mono text-xs text-dc1-text-secondary">{row.label}</td>
                    <td className="px-4 py-3 text-dc1-text-secondary">{row.meaning}</td>
                    <td className="px-4 py-3 text-dc1-text-muted">{row.remediation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* OpenAPI */}
        <section className="mb-12">
          <SectionHeading id="openapi" kicker="REFERENCE" title="OpenAPI spec" />
          <p className="text-sm text-dc1-text-secondary">
            The authoritative request and response shapes for everything documented above live in the shared{' '}
            <a
              href={CONTRACTS_REPO}
              target="_blank"
              rel="noreferrer"
              className="text-dc1-amber hover:underline"
            >
              DCP-SA/dcp-contracts
            </a>{' '}
            repository. Generate typed clients from the spec there rather than hand-rolling shapes — the docs you're
            reading now will only ever cover the headline path.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  )
}
