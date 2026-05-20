'use client'

/**
 * Public /pricing — Saudi Riyal (SAR) per-GPU-hour rate card.
 *
 * Honesty notes (see PR body for context):
 *   - DCP's settlement engine bills in halala for actual GPU-active seconds,
 *     not per million tokens. Rates below are sourced verbatim from
 *     backend/src/config/pricing.js (GPU_RATE_TABLE) and converted to SAR
 *     at SAR_USD_RATE (default 3.75).
 *   - The model catalog (/v1/models) exposes a synthetic
 *     `usd_per_1m_input_tokens` field for OpenAI-client compatibility, but
 *     it is derived from the per-minute halala rate and is not a separate
 *     token-priced product. Displaying it on this page would be misleading
 *     until token-grain settlement actually exists.
 *
 * Data source of truth: backend/src/config/pricing.js
 */

import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'

interface RateRow {
  tier: 'entry' | 'standard' | 'high' | 'enterprise'
  display: string
  minVramGb: number
  ratePerHourSar: number
  ratePerMinHalala: number
  ratePerHourUsd: number
  vastAiUsdHour: number
}

// SAR/USD rate matches backend/src/config/pricing.js (SAR_USD_RATE=3.75).
// If the backend ever rotates this, the numbers below should be regenerated
// from /api/pricing/rates rather than redrawn by hand.
const SAR_USD = 3.75

const RATE_ROWS: RateRow[] = [
  {
    tier: 'enterprise',
    display: 'NVIDIA H200',
    minVramGb: 141,
    ratePerHourUsd: 2.45,
    ratePerHourSar: 9.19,
    ratePerMinHalala: 16, // ceil((9.1875 * 100) / 60)
    vastAiUsdHour: 4.5,
  },
  {
    tier: 'enterprise',
    display: 'NVIDIA H100',
    minVramGb: 80,
    ratePerHourUsd: 1.89,
    ratePerHourSar: 7.09,
    ratePerMinHalala: 12,
    vastAiUsdHour: 2.5,
  },
  {
    tier: 'high',
    display: 'NVIDIA A100',
    minVramGb: 40,
    ratePerHourUsd: 1.2,
    ratePerHourSar: 4.5,
    ratePerMinHalala: 8,
    vastAiUsdHour: 1.89,
  },
  {
    tier: 'standard',
    display: 'NVIDIA RTX 4090',
    minVramGb: 24,
    ratePerHourUsd: 0.267,
    ratePerHourSar: 1.0,
    ratePerMinHalala: 2,
    vastAiUsdHour: 0.35,
  },
  {
    tier: 'standard',
    display: 'NVIDIA RTX 4080',
    minVramGb: 16,
    ratePerHourUsd: 0.178,
    ratePerHourSar: 0.67,
    ratePerMinHalala: 2,
    vastAiUsdHour: 0.23,
  },
  {
    tier: 'standard',
    display: 'NVIDIA RTX 3090',
    minVramGb: 24,
    ratePerHourUsd: 0.134,
    ratePerHourSar: 0.5,
    ratePerMinHalala: 1,
    vastAiUsdHour: 0.2,
  },
  {
    tier: 'entry',
    display: 'NVIDIA RTX 3080',
    minVramGb: 10,
    ratePerHourUsd: 0.089,
    ratePerHourSar: 0.33,
    ratePerMinHalala: 1,
    vastAiUsdHour: 0.13,
  },
]

const TIER_LABEL: Record<RateRow['tier'], string> = {
  entry: 'Entry',
  standard: 'Standard',
  high: 'High',
  enterprise: 'Enterprise',
}

const TIER_PILL: Record<RateRow['tier'], string> = {
  entry: 'bg-dc1-surface-l3 text-dc1-text-secondary',
  standard: 'bg-emerald-500/10 text-emerald-300',
  high: 'bg-sky-500/10 text-sky-300',
  enterprise: 'bg-dc1-amber/10 text-dc1-amber',
}

interface FaqItem {
  q: string
  a: React.ReactNode
}

const FAQ: FaqItem[] = [
  {
    q: 'How does DCP bill?',
    a: (
      <>
        DCP bills in SAR halala (1 SAR = 100 halala) for actual GPU-active seconds. Before a job starts the platform
        places a hold based on the rate above and the requested duration; on completion the hold is settled against
        actual runtime and any unused balance is returned automatically. There is no monthly subscription, no minimum
        spend, and no per-seat fee.
      </>
    ),
  },
  {
    q: 'What is the minimum top-up?',
    a: <>5 SAR. New renter accounts also receive a 50 SAR starter credit on signup.</>,
  },
  {
    q: 'Do you charge per million tokens like OpenAI?',
    a: (
      <>
        Not today. Token-grain billing is on the roadmap and will be rolled out per-model as we finish per-engine
        accounting. The OpenAI-compatible <code className="rounded bg-dc1-surface-l2 px-1 py-0.5 text-dc1-amber">/v1/models</code>{' '}
        endpoint already returns a <code className="rounded bg-dc1-surface-l2 px-1 py-0.5 text-dc1-amber">pricing</code>{' '}
        block for client compatibility, but the authoritative unit is per-minute GPU time.
      </>
    ),
  },
  {
    q: 'Can I get a corporate invoice?',
    a: (
      <>
        Yes. Email{' '}
        <a href="mailto:billing@dcp.sa" className="text-dc1-amber hover:underline">
          billing@dcp.sa
        </a>{' '}
        with your VAT number and we will set up monthly invoicing. Existing prepaid balance is treated as a credit on
        the next invoice.
      </>
    ),
  },
  {
    q: 'What is your refund policy?',
    a: (
      <>
        See clause 5.4 of our{' '}
        <Link href="/terms" className="text-dc1-amber hover:underline">
          Terms of Service
        </Link>
        . In short: unused prepaid balance is refundable on written request within 14 days of top-up; consumed compute
        is non-refundable but failed jobs that the platform did not deliver are credited back automatically.
      </>
    ),
  },
  {
    q: 'Where does compute run?',
    a: (
      <>
        Inside Saudi Arabia, across DCP-vetted providers. The platform is built to be PDPL-compliant; prompts and
        completions are not used for training and are retained only for the minimum window required by audit and
        billing reconciliation.
      </>
    ),
  },
]

function CalculatorRow({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-4">
      <p className="text-xs uppercase tracking-wide text-dc1-text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums text-dc1-text-primary">{value}</p>
      <p className="mt-1 text-xs text-dc1-text-secondary">{hint}</p>
    </div>
  )
}

interface SubscriptionTier {
  tier: 'starter' | 'growth' | 'scale'
  name: string
  monthlySar: number
  discountPct: number
  monthlyCreditSar: number
  bestFor: string
  highlight?: boolean
}

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    monthlySar: 375,
    discountPct: 15,
    monthlyCreditSar: 375,
    bestFor: 'Indie devs, small Saudi apps with predictable monthly volume',
  },
  {
    tier: 'growth',
    name: 'Growth',
    monthlySar: 1500,
    discountPct: 22,
    monthlyCreditSar: 1500,
    bestFor: 'Saudi SMBs and startups in production',
    highlight: true,
  },
  {
    tier: 'scale',
    name: 'Scale',
    monthlySar: 5625,
    discountPct: 30,
    monthlyCreditSar: 5625,
    bestFor: 'Production teams running heavy inference workloads',
  },
]

function SubscriptionTiersSection() {
  return (
    <section aria-labelledby="subs-heading" className="mb-14">
      <h2 id="subs-heading" className="text-xl font-semibold text-dc1-text-primary">
        Monthly subscription tiers
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-dc1-text-secondary">
        Subscribe and your tokens get cheaper. Each tier is a monthly SAR commit that grants you the same amount in
        platform credit, debited at <span className="font-semibold text-dc1-text-primary">every model&apos;s own per-million-token rate</span>{' '}
        — multiplied by your tier discount. Premium models still cost more than small models on Scale; the discount is
        the same percentage across the catalog. Unused credit rolls over for 30 days. Overage falls back to PAYG.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSCRIPTION_TIERS.map((t) => (
          <div
            key={t.tier}
            className={
              'rounded-2xl border p-6 transition ' +
              (t.highlight
                ? 'border-dc1-amber bg-dc1-surface-l2 shadow-[0_0_0_1px_var(--dc1-amber-soft)]'
                : 'border-dc1-border bg-dc1-surface-l1')
            }
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold text-dc1-text-primary">{t.name}</h3>
              {t.highlight && (
                <span className="rounded-full bg-dc1-amber px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dc1-void">
                  Popular
                </span>
              )}
            </div>
            <p className="mt-3 font-mono text-3xl tabular-nums text-dc1-text-primary">
              {t.monthlySar.toLocaleString()} <span className="text-base text-dc1-text-muted">SAR / mo</span>
            </p>
            <p className="mt-1 text-xs text-dc1-text-secondary">
              ≈ ${(t.monthlySar / SAR_USD).toFixed(0)} USD · {t.discountPct}% off every model&apos;s PAYG rate
            </p>
            <ul className="mt-5 space-y-2 text-sm text-dc1-text-secondary">
              <li>
                <span className="text-dc1-text-primary">{t.monthlyCreditSar.toLocaleString()} SAR</span> platform credit
                each month
              </li>
              <li>
                <span className="text-dc1-text-primary">{t.discountPct}%</span> off every model&apos;s per-M-token PAYG
                rate
              </li>
              <li>Unused credit rolls over for 30 days, then expires</li>
              <li>Overage continues at PAYG rates — no hard cap</li>
              <li className="text-xs text-dc1-text-muted">Best for: {t.bestFor}</li>
            </ul>
            <Link
              href={`/renter/register?intent=subscribe&tier=${t.tier}`}
              className={'btn btn-md mt-6 w-full ' + (t.highlight ? 'btn-primary' : 'btn-secondary')}
            >
              Start with {t.name}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 text-sm text-dc1-text-secondary">
        <p className="font-semibold text-dc1-text-primary">How the discount maths works</p>
        <p className="mt-2">
          Effective rate ={' '}
          <code className="rounded bg-dc1-surface-l2 px-1 py-0.5 text-xs text-dc1-text-primary">
            model_payg_rate × (1 − tier_discount)
          </code>
          . If a model is 19 halala per million tokens on PAYG, a Growth subscriber (22% off) pays{' '}
          <span className="font-mono">15 halala per million</span>; a Scale subscriber (30% off) pays{' '}
          <span className="font-mono">14 halala per million</span>. Subscription credit is consumed first (oldest-expiring
          balance first), then PAYG balance picks up any overage. Above Scale: contact us for a custom contract.
        </p>
      </div>
    </section>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-dc1-void" dir="ltr">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero */}
        <section aria-labelledby="pricing-heading" className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-dc1-amber">PRICING</p>
          <h1 id="pricing-heading" className="mt-2 text-4xl font-bold text-dc1-text-primary sm:text-5xl">
            Pricing in SAR. Two SKUs, one balance.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-dc1-text-secondary">
            Pay-as-you-go per million tokens, or upgrade to a monthly subscription that gives you the same tokens at a
            discount. Every signup gets a 100 SAR starter credit — no card required.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/renter/register" className="btn btn-primary btn-md">
              Start free (100 SAR credit)
            </Link>
            <Link href="/quickstart" className="btn btn-secondary btn-md">
              Read the quickstart
            </Link>
          </div>
        </section>

        {/* Subscription tiers */}
        <SubscriptionTiersSection />

        {/* Rate table */}
        <section aria-labelledby="rate-table-heading" className="mb-14">
          <h2 id="rate-table-heading" className="text-xl font-semibold text-dc1-text-primary">
            GPU rate card
          </h2>
          <p className="mt-1 text-sm text-dc1-text-secondary">
            Rates are charged per GPU-hour of active compute, rounded up to the nearest minute. Prices below are sourced
            verbatim from <code>backend/src/config/pricing.js</code> at SAR/USD = {SAR_USD}.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-dc1-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-dc1-surface-l2 text-xs uppercase tracking-wider text-dc1-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">GPU</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tier</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Min VRAM</th>
                  <th scope="col" className="px-4 py-3 font-semibold">SAR / hour</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Halala / minute</th>
                  <th scope="col" className="px-4 py-3 font-semibold">vs Vast.ai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dc1-border bg-dc1-surface-l1">
                {RATE_ROWS.map((row) => {
                  const savings = Math.max(
                    0,
                    Math.round(((row.vastAiUsdHour - row.ratePerHourUsd) / row.vastAiUsdHour) * 100),
                  )
                  return (
                    <tr key={row.display}>
                      <td className="px-4 py-3 font-medium text-dc1-text-primary">{row.display}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_PILL[row.tier]}`}>
                          {TIER_LABEL[row.tier]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-dc1-text-secondary">{row.minVramGb} GB</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-dc1-amber">
                        {row.ratePerHourSar.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-dc1-text-secondary">
                        {row.ratePerMinHalala}
                      </td>
                      <td className="px-4 py-3 text-emerald-300">−{savings}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-dc1-text-muted">
            Comparison column uses public Vast.ai marketplace prices captured March 2026. Your actual savings depend on
            workload, batch size, and queue priority class.
          </p>
        </section>

        {/* Sample cost */}
        <section aria-labelledby="sample-cost-heading" className="mb-14">
          <h2 id="sample-cost-heading" className="text-xl font-semibold text-dc1-text-primary">
            What a real job costs
          </h2>
          <p className="mt-1 text-sm text-dc1-text-secondary">
            Concrete numbers using the standard pricing class (no surcharge), based on the rate table above.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CalculatorRow
              label="5-minute RTX 3090 call"
              value="0.05 SAR"
              hint="5 halala/minute × 5 minutes on a 3090."
            />
            <CalculatorRow
              label="1-hour A100 fine-tune"
              value="4.50 SAR"
              hint="A100 at 4.50 SAR/hour, settled to the second."
            />
            <CalculatorRow
              label="50 SAR starter credit"
              value="~10 hours"
              hint="≈ 10 hours of RTX 3090 standard inference."
            />
          </div>
          <p className="mt-3 text-xs text-dc1-text-muted">
            Rule of thumb: 1M tokens of typical chat output ≈ ~750K English words ≈ a ~300-page novel. On a 3090
            serving Qwen3 at ~85 tok/s, that's roughly 3.3 hours — about 1.65 SAR of compute.
          </p>
        </section>

        {/* What's included */}
        <section aria-labelledby="included-heading" className="mb-14">
          <h2 id="included-heading" className="text-xl font-semibold text-dc1-text-primary">
            What's included
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: 'Saudi-hosted compute',
                body: 'Every provider is registered, vetted, and physically located inside Saudi Arabia. No cross-border data egress for routine inference.',
              },
              {
                title: 'PDPL-compliant by default',
                body: 'Prompts and completions are never used to train models. Audit logs are retained only as long as billing reconciliation requires.',
              },
              {
                title: 'OpenAI-compatible API',
                body: 'Drop-in for the OpenAI SDK at api.dcp.sa/v1. Bearer, x-renter-key, or ?key= auth — all three accepted.',
              },
              {
                title: 'Refund on failure',
                body: 'Jobs the platform fails to deliver are credited back automatically. Unused prepaid balance is refundable within 14 days.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <p className="text-sm font-semibold text-dc1-text-primary">{item.title}</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="mb-12">
          <h2 id="faq-heading" className="text-xl font-semibold text-dc1-text-primary">
            FAQ
          </h2>
          <div className="mt-4 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-dc1-text-primary">
                  <span>{item.q}</span>
                  <span className="text-dc1-amber transition group-open:rotate-45">+</span>
                </summary>
                <div className="mt-3 text-sm text-dc1-text-secondary">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-8 text-center">
          <h2 className="text-2xl font-bold text-dc1-text-primary">Ready to ship?</h2>
          <p className="mt-2 text-sm text-dc1-text-secondary">
            Read the quickstart — your first call takes under two minutes.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/quickstart" className="btn btn-primary btn-md">
              Open quickstart
            </Link>
            <Link href="/status" className="btn btn-secondary btn-md">
              Check live status
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
