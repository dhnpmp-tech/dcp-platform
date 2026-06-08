'use client'

import Link from 'next/link'
import { Instrument_Serif } from 'next/font/google'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--pricing-serif',
})

interface ModelClassRate {
  klass: 'embedding' | 'tiny' | 'small' | 'medium' | 'large'
  label: string
  examples: string
  paygHalala: number
  use: string
}

interface GpuRate {
  tier: 'entry' | 'standard' | 'high' | 'enterprise'
  display: string
  minVramGb: number
  ratePerHourSar: number
  ratePerMinHalala: number
  ratePerHourUsd: number
}

interface SubscriptionTier {
  tier: 'starter' | 'growth' | 'scale'
  name: string
  monthlySar: number
  discountPct: number
  bestFor: string
}

const SAR_USD = 3.75

const MODEL_CLASS_RATES: ModelClassRate[] = [
  {
    klass: 'embedding',
    label: 'Embedding',
    examples: 'bge-m3',
    paygHalala: 5,
    use: 'Retrieval, RAG indexing, search pipelines',
  },
  {
    klass: 'tiny',
    label: 'Tiny',
    examples: 'TinyLlama 1B, qwen2.5vl:3b, Gemma-2B',
    paygHalala: 15,
    use: 'Cheap classification, extraction, vision previews',
  },
  {
    klass: 'small',
    label: 'Small',
    examples: 'qwen3:8b, Mistral-7B, Llama-3-8B, ALLaM-7B',
    paygHalala: 30,
    use: 'Production chat, summaries, support agents',
  },
  {
    klass: 'medium',
    label: 'Medium',
    examples: 'Qwen 3.6-27B-MTP, Qwen2.5-Coder-32B',
    paygHalala: 150,
    use: 'Coding, long-context reasoning, bilingual workflows',
  },
  {
    klass: 'large',
    label: 'Large',
    examples: 'Future 70B class',
    paygHalala: 400,
    use: 'High-end reasoning when the catalog has capacity',
  },
]

const GPU_RATES: GpuRate[] = [
  { tier: 'enterprise', display: 'NVIDIA H200', minVramGb: 141, ratePerHourUsd: 2.45, ratePerHourSar: 9.19, ratePerMinHalala: 16 },
  { tier: 'enterprise', display: 'NVIDIA H100', minVramGb: 80, ratePerHourUsd: 1.89, ratePerHourSar: 7.09, ratePerMinHalala: 12 },
  { tier: 'high', display: 'NVIDIA A100', minVramGb: 40, ratePerHourUsd: 1.2, ratePerHourSar: 4.5, ratePerMinHalala: 8 },
  { tier: 'standard', display: 'NVIDIA RTX 4090', minVramGb: 24, ratePerHourUsd: 0.267, ratePerHourSar: 1.0, ratePerMinHalala: 2 },
  { tier: 'standard', display: 'NVIDIA RTX 4080', minVramGb: 16, ratePerHourUsd: 0.178, ratePerHourSar: 0.67, ratePerMinHalala: 2 },
  { tier: 'standard', display: 'NVIDIA RTX 3090', minVramGb: 24, ratePerHourUsd: 0.134, ratePerHourSar: 0.5, ratePerMinHalala: 1 },
  { tier: 'entry', display: 'NVIDIA RTX 3080', minVramGb: 10, ratePerHourUsd: 0.089, ratePerHourSar: 0.33, ratePerMinHalala: 1 },
]

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    monthlySar: 375,
    discountPct: 15,
    bestFor: 'Solo builders and early internal tools',
  },
  {
    tier: 'growth',
    name: 'Growth',
    monthlySar: 1500,
    discountPct: 22,
    bestFor: 'Production teams with recurring inference',
  },
  {
    tier: 'scale',
    name: 'Scale',
    monthlySar: 5625,
    discountPct: 30,
    bestFor: 'Heavy workloads and private capacity planning',
  },
]

const FLOW = [
  {
    title: 'Starter credit first',
    body: 'New renter accounts start with 100 SAR credit. Usage draws from expiring credits before paid balance.',
    meta: 'no card required',
  },
  {
    title: 'Auto-top-up when enabled',
    body: 'Saved-card renters can set a threshold, recharge amount, and monthly cap. A 3D Secure step-up is handled before credit is granted.',
    meta: 'cap controlled by renter',
  },
  {
    title: '402 before work starts',
    body: 'If balance cannot cover the pre-flight estimate, the API returns insufficient_balance instead of starting an unpaid job.',
    meta: 'no silent negative balance',
  },
]

function sar(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: value < 10 ? 2 : 0 })
}

function discounted(rate: number, pct: number) {
  return Math.ceil(rate * (1 - pct / 100))
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body: string
}) {
  return (
    <div className="grid gap-3 border-t border-dc1-border pt-7 md:grid-cols-[0.36fr_0.64fr]">
      <p className="text-xs font-semibold uppercase text-dc1-amber">{eyebrow}</p>
      <div>
        <h2 className="text-2xl font-semibold text-dc1-text-primary sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-dc1-text-secondary">{body}</p>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="border-t border-dc1-border pt-4">
      <p className="text-xs font-semibold uppercase text-dc1-text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums text-dc1-text-primary">{value}</p>
      <p className="mt-1 text-xs leading-5 text-dc1-text-secondary">{note}</p>
    </div>
  )
}

function RateTable() {
  return (
    <div className="overflow-x-auto border border-dc1-border bg-dc1-surface-l1">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-dc1-border bg-dc1-surface-l2 text-xs uppercase text-dc1-text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Model class</th>
            <th className="px-4 py-3 font-semibold">Typical models</th>
            <th className="px-4 py-3 font-semibold">Best fit</th>
            <th className="px-4 py-3 text-right font-semibold">PAYG</th>
            <th className="px-4 py-3 text-right font-semibold">Starter</th>
            <th className="px-4 py-3 text-right font-semibold">Growth</th>
            <th className="px-4 py-3 text-right font-semibold">Scale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border">
          {MODEL_CLASS_RATES.map((row) => (
            <tr key={row.klass} className="align-top">
              <td className="px-4 py-4 font-semibold text-dc1-text-primary">{row.label}</td>
              <td className="max-w-[260px] px-4 py-4 text-xs leading-5 text-dc1-text-secondary">{row.examples}</td>
              <td className="max-w-[260px] px-4 py-4 text-xs leading-5 text-dc1-text-secondary">{row.use}</td>
              <td className="px-4 py-4 text-right font-mono tabular-nums text-dc1-text-primary">
                {row.paygHalala}
                <span className="ml-1 text-xs text-dc1-text-muted">h/M</span>
              </td>
              {SUBSCRIPTION_TIERS.map((tier) => (
                <td
                  key={tier.tier}
                  className={`px-4 py-4 text-right font-mono tabular-nums ${tier.tier === 'growth' ? 'text-dc1-amber' : 'text-dc1-text-secondary'}`}
                >
                  {discounted(row.paygHalala, tier.discountPct)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubscriptionLedger() {
  return (
    <div className="grid gap-0 border border-dc1-border bg-dc1-surface-l1 md:grid-cols-3">
      {SUBSCRIPTION_TIERS.map((tier, index) => (
        <article
          key={tier.tier}
          className={`p-5 ${index > 0 ? 'border-t border-dc1-border md:border-l md:border-t-0' : ''} ${tier.tier === 'growth' ? 'bg-dc1-surface-l2' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-dc1-text-primary">{tier.name}</h3>
            {tier.tier === 'growth' && (
              <span className="border border-dc1-amber px-2 py-0.5 text-[10px] font-semibold uppercase text-dc1-amber">
                default
              </span>
            )}
          </div>
          <p className="mt-4 font-mono text-3xl tabular-nums text-dc1-text-primary">
            {sar(tier.monthlySar)}
            <span className="text-sm text-dc1-text-muted"> SAR/mo</span>
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-t border-dc1-border pt-3">
              <dt className="text-dc1-text-muted">Credit issued</dt>
              <dd className="font-mono text-dc1-text-primary">{sar(tier.monthlySar)} SAR</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-dc1-border pt-3">
              <dt className="text-dc1-text-muted">Rate discount</dt>
              <dd className="font-mono text-dc1-amber">{tier.discountPct}%</dd>
            </div>
            <div className="border-t border-dc1-border pt-3">
              <dt className="text-dc1-text-muted">Use case</dt>
              <dd className="mt-1 leading-5 text-dc1-text-secondary">{tier.bestFor}</dd>
            </div>
          </dl>
          <a href="mailto:billing@dcp.sa?subject=DCP%20subscription%20enquiry" className="btn btn-secondary btn-sm mt-5 w-full">
            Talk to sales
          </a>
        </article>
      ))}
    </div>
  )
}

function GpuTable() {
  return (
    <div className="overflow-x-auto border border-dc1-border bg-dc1-surface-l1">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-dc1-border bg-dc1-surface-l2 text-xs uppercase text-dc1-text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">GPU</th>
            <th className="px-4 py-3 font-semibold">Class</th>
            <th className="px-4 py-3 text-right font-semibold">Min VRAM</th>
            <th className="px-4 py-3 text-right font-semibold">SAR/hour</th>
            <th className="px-4 py-3 text-right font-semibold">Halala/min</th>
            <th className="px-4 py-3 text-right font-semibold">USD/hour</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border">
          {GPU_RATES.map((row) => (
            <tr key={row.display}>
              <td className="px-4 py-3 font-semibold text-dc1-text-primary">{row.display}</td>
              <td className="px-4 py-3 text-dc1-text-secondary">{row.tier}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-dc1-text-secondary">{row.minVramGb} GB</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-dc1-amber">{row.ratePerHourSar.toFixed(2)}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-dc1-text-secondary">{row.ratePerMinHalala}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-dc1-text-muted">{row.ratePerHourUsd.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className={`${serif.variable} min-h-screen bg-dc1-void text-dc1-text-primary`} dir="ltr">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section aria-labelledby="pricing-heading" className="grid gap-8 border-b border-dc1-border pb-10 lg:grid-cols-[0.58fr_0.42fr]">
          <div>
            <p className="text-xs font-semibold uppercase text-dc1-amber">Pricing</p>
            <h1
              id="pricing-heading"
              className={`${serif.className} mt-4 max-w-3xl text-5xl leading-[0.98] text-dc1-text-primary sm:text-6xl lg:text-7xl`}
            >
              Saudi GPU pricing without hidden starts.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-dc1-text-secondary">
              DCP has two renter SKUs: pay-as-you-go balance and monthly credit commits.
              The API checks balance before dispatch. If credit is missing, it returns
              <code className="mx-1 bg-dc1-surface-l2 px-1.5 py-0.5 font-mono text-sm text-dc1-amber">402 insufficient_balance</code>
              before any provider starts work.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/renter/register" className="btn btn-primary btn-md">
                Start with 100 SAR
              </Link>
              <Link href="/docs/quickstart" className="btn btn-secondary btn-md">
                API quickstart
              </Link>
            </div>
          </div>

          <aside className="border border-dc1-border bg-dc1-surface-l1 p-5">
            <p className="text-sm font-semibold text-dc1-text-primary">Balance contract</p>
            <div className="mt-5 grid gap-5">
              <Metric label="Starter credit" value="100 SAR" note="Issued on renter signup. It is consumed before paid balance." />
              <Metric label="Minimum top-up" value="1 SAR" note="Card top-ups run through Moyasar. Bank transfer top-ups stay admin-confirmed." />
              <Metric label="Pre-flight gate" value="HTTP 402" note="Returned before dispatch when estimated cost exceeds available balance." />
            </div>
          </aside>
        </section>

        <section aria-labelledby="flow-heading" className="py-10">
          <SectionHeader
            eyebrow="Balance flow"
            title="How money moves before a request reaches a GPU"
            body="The important parts are explicit: credit order, optional auto-top-up, and the insufficient-balance gate. This is what keeps billing predictable for renters and prevents unpaid provider work."
          />
          <div id="flow-heading" className="mt-6 border border-dc1-border bg-dc1-surface-l1">
            {FLOW.map((item, index) => (
              <div key={item.title} className={`grid gap-4 p-5 md:grid-cols-[0.24fr_0.56fr_0.2fr] ${index > 0 ? 'border-t border-dc1-border' : ''}`}>
                <p className="font-mono text-sm tabular-nums text-dc1-amber">0{index + 1}</p>
                <div>
                  <h3 className="font-semibold text-dc1-text-primary">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-dc1-text-secondary">{item.body}</p>
                </div>
                <p className="text-sm text-dc1-text-muted md:text-right">{item.meta}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="model-rates-heading" className="py-10">
          <SectionHeader
            eyebrow="Model classes"
            title="Per-million-token rates by model class"
            body="Token rates are class-based so renters can estimate before picking a model. Subscription discounts multiply each class rate; premium models remain premium on every tier."
          />
          <div id="model-rates-heading" className="mt-6">
            <RateTable />
          </div>
          <p className="mt-3 text-xs leading-5 text-dc1-text-muted">
            h/M means halala per million tokens. Source: backend model-class rate table. The live API may return only models whose providers pass catalog and routing checks.
          </p>
        </section>

        <section aria-labelledby="subscriptions-heading" className="py-10">
          <SectionHeader
            eyebrow="Monthly commits"
            title="Subscription credit is a discount ledger, not a different product"
            body="Each plan issues the same amount in platform credit every month. The discount applies to model-class token rates, then PAYG balance covers any overage."
          />
          <div id="subscriptions-heading" className="mt-6">
            <SubscriptionLedger />
          </div>
        </section>

        <section aria-labelledby="gpu-rates-heading" className="py-10">
          <SectionHeader
            eyebrow="GPU time"
            title="Raw GPU-hour floor for jobs that bill by active runtime"
            body="Some control-plane jobs still settle against active GPU time. The values below mirror the backend GPU rate table at SAR/USD 3.75."
          />
          <div id="gpu-rates-heading" className="mt-6">
            <GpuTable />
          </div>
        </section>

        <section aria-labelledby="examples-heading" className="py-10">
          <SectionHeader
            eyebrow="Examples"
            title="Concrete balances, before a renter ships traffic"
            body="These examples are intentionally plain. They show how the same balance behaves across token classes, auto-top-up, and failed delivery."
          />
          <div id="examples-heading" className="mt-6 grid gap-4 lg:grid-cols-[0.42fr_0.58fr]">
            <div className="border border-dc1-border bg-dc1-surface-l1 p-5">
              <p className="font-mono text-4xl tabular-nums text-dc1-amber">333M</p>
              <p className="mt-2 text-sm font-semibold text-dc1-text-primary">Approximate small-model tokens from starter credit</p>
              <p className="mt-2 text-sm leading-6 text-dc1-text-secondary">
                100 SAR starter credit at 30 halala per million tokens gives roughly 333 million small-class tokens before paid balance is needed.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Metric label="Medium class" value="66M tokens" note="100 SAR at 150 halala/M, before subscription discounts." />
              <Metric label="Auto-top-up cap" value="renter set" note="Threshold, recharge amount, and monthly cap are configured from billing settings." />
              <Metric label="Failed delivery" value="credited back" note="Undelivered jobs are credited automatically; unused paid balance can enter refund review." />
              <Metric label="Corporate billing" value="available" note="Monthly invoicing is available through billing@dcp.sa; tax-invoice details are confirmed per account." />
            </div>
          </div>
        </section>

        <section aria-labelledby="policy-heading" className="grid gap-6 border border-dc1-border bg-dc1-surface-l1 p-6 md:grid-cols-[0.35fr_0.65fr]">
          <div>
            <p className="text-xs font-semibold uppercase text-dc1-amber">Policy</p>
            <h2 id="policy-heading" className="mt-3 text-2xl font-semibold text-dc1-text-primary">Refunds and data residency</h2>
          </div>
          <div className="grid gap-5 text-sm leading-6 text-dc1-text-secondary">
            <p>
              Refund requests for paid top-ups are submitted from the renter payment record and reviewed by an admin.
              Approved card refunds are sent through Moyasar when the original payment has a Moyasar id; bank-transfer
              or sandbox records use the internal/manual refund path.
            </p>
            <p>
              DCP recruits providers for Saudi-hosted compute and does not use prompts or completions for model training.
              Some platform infrastructure (web frontend, billing metadata) currently runs outside the Kingdom; see the
              <Link href="/privacy" className="text-dc1-amber hover:underline"> Privacy Policy</Link> for the current data-location
              disclosure. Billing records are retained for reconciliation and audit.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/terms" className="text-dc1-amber hover:underline">Terms</Link>
              <Link href="/privacy" className="text-dc1-amber hover:underline">Privacy</Link>
              <a href="mailto:billing@dcp.sa" className="text-dc1-amber hover:underline">billing@dcp.sa</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
