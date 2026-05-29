'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'

const VSCODE_SHORTCUT = `# Install DCP extension from VS Code Marketplace
# Then press Ctrl+Shift+V to open the vLLM serve panel`

const JOB_OUTPUT = `✓ Job queued: llama3-8b-inference
✓ Provider matched: RTX 4090 (online)
✓ Job running — estimated 12s
✓ Output ready — 340 tokens`

export default function RenterGuidePage() {
  const { t } = useLanguage()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const workloads = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      title: t('rg.wl_llm'),
      desc: t('rg.wl_llm_desc'),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      title: t('rg.wl_img'),
      desc: t('rg.wl_img_desc'),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: t('rg.wl_train'),
      desc: t('rg.wl_train_desc'),
    },
  ]

  const pricingPoints = [
    { title: t('rg.price_sar'), desc: t('rg.price_sar_desc') },
    { title: t('rg.price_min'), desc: t('rg.price_min_desc') },
    { title: t('rg.price_no_commit'), desc: t('rg.price_no_commit_desc') },
  ]

  const steps = [
    {
      num: '1',
      title: t('rg.step1_title'),
      desc: t('rg.step1_desc'),
    },
    {
      num: '2',
      title: t('rg.step2_title'),
      desc: t('rg.step2_desc'),
    },
    {
      num: '3',
      title: t('rg.step3_title'),
      desc: t('rg.step3_desc'),
      output: JOB_OUTPUT,
    },
  ]

  const faqs = [
    { q: t('rg.faq_q1'), a: t('rg.faq_a1') },
    { q: t('rg.faq_q2'), a: t('rg.faq_a2') },
    { q: t('rg.faq_q3'), a: t('rg.faq_a3') },
    { q: t('rg.faq_q4'), a: t('rg.faq_a4') },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-dc1-border">
          <div className="absolute inset-0 bg-gradient-to-b from-dc1-amber/5 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dc1-amber/10 border border-dc1-amber/20 text-dc1-amber text-xs font-medium mb-6">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t('rg.badge')}
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-dc1-amber mb-4 leading-tight">
              {t('rg.title')}
            </h1>
            <p className="text-lg text-dc1-text-secondary max-w-2xl leading-relaxed">
              {t('rg.subtitle')}
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/renter/register" className="btn btn-primary btn-sm">
                {t('rg.cta_button')}
              </Link>
              <Link href="/renter/marketplace" className="btn btn-secondary btn-sm">
                {t('rg.browse_gpus')}
              </Link>
            </div>
          </div>
        </section>

        {/* What You Can Run */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-2">
            {t('rg.wl_title')}
          </h2>
          <p className="text-dc1-text-secondary mb-8 max-w-2xl">{t('rg.wl_desc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {workloads.map((wl) => (
              <div
                key={wl.title}
                className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-5 flex gap-4"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-dc1-amber/10 flex items-center justify-center text-dc1-amber">
                  {wl.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-dc1-text-primary mb-1">{wl.title}</h3>
                  <p className="text-xs text-dc1-text-secondary leading-relaxed">{wl.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-dc1-surface-l1 border-y border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">
              {t('rg.price_title')}
            </h2>
            <p className="text-dc1-text-secondary mb-8 max-w-2xl">{t('rg.price_desc')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {pricingPoints.map((item) => (
                <div
                  key={item.title}
                  className="bg-dc1-surface-l2 border border-dc1-amber/20 rounded-lg p-5"
                >
                  <div className="w-2 h-2 bg-dc1-amber rounded-full mb-3" />
                  <h3 className="text-sm font-semibold text-dc1-amber mb-2">{item.title}</h3>
                  <p className="text-xs text-dc1-text-secondary leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Getting Started Steps */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-10">
            {t('rg.setup_title')}
          </h2>
          <div className="space-y-10">
            {steps.map((step) => (
              <div key={step.num} className="flex gap-6">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-dc1-amber flex items-center justify-center text-dc1-void font-bold text-sm">
                  {step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{step.title}</h3>
                  <p className="text-sm text-dc1-text-secondary mb-4 leading-relaxed">{step.desc}</p>

                  {step.output && (
                    <div>
                      <p className="text-xs text-dc1-text-muted font-mono mb-2 uppercase tracking-wider">Terminal output</p>
                      <pre className="bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-xs text-green-400 font-mono max-w-full whitespace-pre-wrap break-words">
                        {step.output}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* VS Code Integration */}
        <section className="bg-dc1-surface-l1 border-y border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-dc1-amber/10 border border-dc1-amber/20 flex items-center justify-center text-dc1-amber">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-dc1-text-primary mb-2">
                  {t('rg.vscode_title')}
                </h2>
                <p className="text-dc1-text-secondary mb-6 max-w-2xl leading-relaxed">
                  {t('rg.vscode_desc')}
                </p>
                <pre className="bg-dc1-surface-l2 border border-dc1-border rounded-lg px-4 py-3 text-xs text-dc1-amber font-mono overflow-x-auto mb-4 max-w-full whitespace-pre-wrap break-words">
                  {VSCODE_SHORTCUT}
                </pre>
                <Link
                  href="https://marketplace.visualstudio.com/items?itemName=dcp-platform.dc1-vscode"
                  className="btn btn-secondary btn-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('rg.vscode_install')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Payments & billing */}
        <section className="bg-dc1-surface-l1 border-y border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">Payments &amp; billing</h2>
            <p className="text-sm text-dc1-text-secondary mb-8 max-w-2xl">
              DCP runs on a pre-paid SAR balance. You top up your account, then every inference job draws from
              that balance at the model&rsquo;s per-token rate. No invoices, no surprises mid-month.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">Top up your balance</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Go to{' '}
                  <Link href="/renter/billing" className="text-dc1-amber hover:underline">/renter/billing</Link>{' '}
                  and pick an amount (1&ndash;10,000 SAR). Pay with mada, Visa, or Mastercard via Moyasar.
                  Your balance is credited within seconds of the payment confirming.
                </p>
                <p className="text-xs text-dc1-text-muted">
                  Receipts land in your inbox automatically and are listed under Payment History on the
                  billing page.
                </p>
              </div>

              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">Auto-top-up (recommended)</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Save a card on file and set a threshold (e.g. &ldquo;recharge 500 SAR when my balance drops
                  below 100&rdquo;). DCP charges your card automatically and you never hit the
                  insufficient-balance gate mid-call.
                </p>
                <p className="text-xs text-dc1-text-muted">
                  Set a monthly cap as a safety net &mdash; the auto-recharge stops once the cap is reached
                  for the calendar month.
                </p>
              </div>

              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">Insufficient balance (HTTP 402)</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Before each /v1 request DCP estimates the cost (prompt tokens × in-rate + max_tokens ×
                  out-rate, with a 20% safety margin) and rejects with{' '}
                  <code className="text-dc1-amber">402 insufficient_balance</code> if your balance plus active
                  subscription credits can&rsquo;t cover it. The error payload includes your current balance,
                  the estimate, and the deficit in SAR.
                </p>
                <p className="text-xs text-dc1-text-muted">
                  Top up or enable auto-top-up and retry the request &mdash; no quota state is lost.
                </p>
              </div>

              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">Remove a saved card or pause auto-top-up</h3>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  On{' '}
                  <Link href="/renter/billing" className="text-dc1-amber hover:underline">/renter/billing</Link>,
                  click <strong>Remove</strong> next to the card on file to delete the saved token and disable
                  auto-top-up in one action. Re-enable later by completing any top-up with &ldquo;Save card for
                  future use&rdquo; ticked.
                </p>
                <p className="text-xs text-dc1-text-muted">
                  3D Secure verification is required by mada on every charge and may be required by your
                  Visa/Mastercard issuer; you&rsquo;ll get an email with a verification link when it&rsquo;s
                  needed.
                </p>
              </div>

              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-5 md:col-span-2">
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">Refunds &amp; disputes</h3>
                <p className="text-sm text-dc1-text-secondary mb-2">
                  Refunds for a successful top-up (mistaken amount, change of mind) are processed by Moyasar
                  within 5&ndash;10 business days back to the original card. Email{' '}
                  <a href="mailto:billing@dcp.sa" className="text-dc1-amber hover:underline">billing@dcp.sa</a>{' '}
                  with the payment id from your billing page.
                </p>
                <p className="text-sm text-dc1-text-secondary mb-2">
                  Refunds for a failed inference job (provider crashed, timed-out, returned nonsense) are
                  evaluated per-job &mdash; include the job id and a short note explaining the failure.
                </p>
                <p className="text-xs text-dc1-text-muted">
                  Card-network disputes (chargebacks) follow the standard SAMA timeline. We&rsquo;ll respond
                  to your bank with the Moyasar payment trace within 7 days.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-8">
            {t('rg.faq_title')}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-dc1-surface-l2 border border-dc1-border rounded-lg overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-dc1-text-primary hover:text-dc1-amber transition-colors text-start"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`w-4 h-4 flex-shrink-0 ms-3 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-dc1-text-secondary leading-relaxed border-t border-dc1-border pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-dc1-surface-l1 border-t border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="card border-dc1-amber/20 text-center py-12 px-8 glow-amber">
              <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">
                {t('rg.cta_title')}
              </h2>
              <p className="text-dc1-text-secondary max-w-md mx-auto mb-8">
                {t('rg.cta_desc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/renter/register" className="btn btn-primary btn-lg w-full sm:w-auto">
                  {t('rg.cta_button')}
                </Link>
                <Link href="/login" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">
                  {t('rg.cta_signin')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
