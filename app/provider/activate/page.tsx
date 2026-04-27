'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'

const API_BASE = '/api'

// Monthly earnings estimates by tier at 70% utilisation (SAR @ 3.75 rate)
const TIER_EARNINGS: Record<string, { minUSD: number; maxUSD: number; label: string }> = {
  A: { minUSD: 2_800, maxUSD: 4_200, label: 'Enterprise (H100/H200)' },
  B: { minUSD: 1_200, maxUSD: 2_100, label: 'High-end (RTX 4090/4080)' },
  C: { minUSD: 380,   maxUSD: 860,   label: 'Standard (RTX 3090 and below)' },
}

const USD_TO_SAR = 3.75

interface BenchmarkResult {
  gpu_model: string
  vram_gb: number
  tflops: number
  bandwidth_gbps: number
  tokens_per_sec: number
  tier: string
  timestamp?: string
}

type Step = 1 | 2 | 3

function parseBenchmarkOutput(raw: string): BenchmarkResult | null {
  // Try to extract the JSON block from the benchmark script output
  const jsonMatch = raw.match(/\{[\s\S]*"gpu_model"[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as BenchmarkResult
  } catch {
    return null
  }
}

export default function ProviderActivatePage() {
  const [step, setStep] = useState<Step>(1)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [providerLoadError, setProviderLoadError] = useState('')

  const [benchmarkRaw, setBenchmarkRaw] = useState('')
  const [parsed, setParsed] = useState<BenchmarkResult | null>(null)
  const [parseError, setParseError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [assignedTier, setAssignedTier] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Load API key and resolve provider ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dc1_provider_key')
    if (!stored) {
      setProviderLoadError(
        'No provider API key found. Please register first at /setup.'
      )
      return
    }
    setApiKey(stored)

    fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(stored)}`)
      .then((r) => r.json())
      .then((data) => {
        const id = data?.provider?.id
        if (id) {
          setProviderId(String(id))
        } else {
          setProviderLoadError('Could not resolve provider ID. Please re-register.')
        }
      })
      .catch(() => setProviderLoadError('Failed to load provider data. Check your connection.'))
  }, [])

  const benchmarkCmd = providerId && apiKey
    ? `node <(curl -fsSL https://api.dcp.sa/scripts/provider-gpu-benchmark.mjs) ${providerId} https://api.dcp.sa ${apiKey}`
    : `node <(curl -fsSL https://api.dcp.sa/scripts/provider-gpu-benchmark.mjs) <provider-id> https://api.dcp.sa <api-key>`

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(benchmarkCmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [benchmarkCmd])

  const handleParseBenchmark = () => {
    setParseError('')
    if (!benchmarkRaw.trim()) {
      setParseError('Paste your benchmark output above.')
      return
    }
    const result = parseBenchmarkOutput(benchmarkRaw)
    if (!result) {
      setParseError(
        'Could not parse benchmark JSON. Make sure you copied the full output including the JSON block.'
      )
      return
    }
    setParsed(result)
  }

  const handleSubmitBenchmark = async () => {
    if (!parsed || !providerId || !apiKey) return
    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch(`${API_BASE}/providers/${encodeURIComponent(providerId)}/benchmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-provider-key': apiKey,
        },
        body: JSON.stringify({
          gpu_model: parsed.gpu_model,
          vram_gb: parsed.vram_gb,
          tflops: parsed.tflops,
          bandwidth_gbps: parsed.bandwidth_gbps,
          tokens_per_sec: parsed.tokens_per_sec,
          tier: parsed.tier,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Submission failed')
      }

      const data = await res.json()
      setAssignedTier(data.tier || parsed.tier)
      setStep(2)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const tier = assignedTier || parsed?.tier || null
  const tierInfo = tier ? TIER_EARNINGS[tier] : null

  return (
    <>
      <Header />
      <main className="min-h-screen bg-dc1-void px-4 py-12">
        <div className="mx-auto max-w-2xl">
          {/* Page header */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold text-dc1-text-primary">Activate your GPU node</h1>
            <p className="mt-2 text-dc1-text-secondary">
              Run the benchmark script, paste the results, and go live in minutes.
            </p>
          </div>

          {/* Progress indicator */}
          <div className="mb-8 flex items-center gap-0">
            {(['Run benchmark', 'Verify results', 'Go live'] as const).map((label, i) => {
              const stepNum = (i + 1) as Step
              const active = step === stepNum
              const done = step > stepNum
              return (
                <div key={label} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        done
                          ? 'bg-status-success text-white'
                          : active
                          ? 'bg-dc1-amber text-dc1-void'
                          : 'bg-dc1-surface-l2 text-dc1-text-muted'
                      }`}
                    >
                      {done ? '✓' : stepNum}
                    </div>
                    <span
                      className={`hidden text-xs sm:block ${
                        active ? 'text-dc1-text-primary' : 'text-dc1-text-muted'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div
                      className={`mx-2 h-px flex-1 transition-colors ${
                        step > stepNum ? 'bg-status-success' : 'bg-dc1-border'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Provider load error */}
          {providerLoadError && (
            <div className="mb-6 rounded-lg border border-status-error bg-status-error-bg p-4 text-status-error text-sm">
              {providerLoadError}{' '}
              <Link href="/setup" className="underline">
                Register here
              </Link>
            </div>
          )}

          {/* ── Step 1: Run benchmark ── */}
          {step === 1 && (
            <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-dc1-text-primary">
                  Step 1 — Run the GPU benchmark
                </h2>
                <p className="mt-1 text-sm text-dc1-text-secondary">
                  Copy and run the command below in a terminal on your GPU machine. It detects your
                  hardware and prints a JSON report.
                </p>
              </div>

              {/* Command block */}
              <div className="rounded-lg bg-dc1-void border border-dc1-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-dc1-surface-l2 border-b border-dc1-border">
                  <span className="text-xs text-dc1-text-muted font-mono">bash</span>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-dc1-amber hover:text-dc1-amber-hover transition-colors"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="px-4 py-3 text-xs text-dc1-text-primary font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {benchmarkCmd}
                </pre>
              </div>

              <p className="text-xs text-dc1-text-muted">
                Requires: Node.js 18+, NVIDIA drivers, <code className="font-mono">nvidia-smi</code>.
                The script does not install anything — it only reads GPU stats.
              </p>

              {/* Paste output */}
              <div>
                <label
                  htmlFor="benchmarkOutput"
                  className="block text-sm font-medium text-dc1-text-primary mb-2"
                >
                  Paste benchmark output
                </label>
                <textarea
                  id="benchmarkOutput"
                  rows={10}
                  value={benchmarkRaw}
                  onChange={(e) => {
                    setBenchmarkRaw(e.target.value)
                    setParsed(null)
                    setParseError('')
                  }}
                  placeholder={'Paste the full terminal output here...\n\nExample:\n📋 Benchmark Report:\n{\n  "gpu_model": "NVIDIA RTX 4090",\n  "vram_gb": 24,\n  "tflops": 165,\n  ...'}
                  className="w-full rounded-lg border border-dc1-border bg-dc1-void px-4 py-3 text-sm text-dc1-text-primary font-mono placeholder-dc1-text-muted focus:border-dc1-amber focus:outline-none focus:ring-1 focus:ring-dc1-amber resize-none"
                />
              </div>

              {parseError && (
                <p className="text-sm text-status-error">{parseError}</p>
              )}

              {/* Parsed preview */}
              {parsed && (
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 space-y-2">
                  <p className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">
                    Detected
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <span className="text-dc1-text-secondary">GPU model</span>
                    <span className="text-dc1-text-primary font-medium">{parsed.gpu_model}</span>
                    <span className="text-dc1-text-secondary">VRAM</span>
                    <span className="text-dc1-text-primary font-medium">{parsed.vram_gb} GB</span>
                    <span className="text-dc1-text-secondary">TFLOPS</span>
                    <span className="text-dc1-text-primary font-medium">{parsed.tflops}</span>
                    <span className="text-dc1-text-secondary">Memory bandwidth</span>
                    <span className="text-dc1-text-primary font-medium">{parsed.bandwidth_gbps} GB/s</span>
                    <span className="text-dc1-text-secondary">Token throughput</span>
                    <span className="text-dc1-text-primary font-medium">{parsed.tokens_per_sec} tok/s</span>
                    <span className="text-dc1-text-secondary">Detected tier</span>
                    <span className="text-dc1-text-primary font-bold">{parsed.tier}</span>
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-sm text-status-error">{submitError}</p>
              )}

              <div className="flex gap-3">
                {!parsed ? (
                  <button
                    onClick={handleParseBenchmark}
                    disabled={!benchmarkRaw.trim()}
                    className="flex-1 rounded-lg bg-dc1-amber px-5 py-3 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-hover disabled:opacity-40 transition-colors"
                  >
                    Parse output
                  </button>
                ) : (
                  <button
                    onClick={handleSubmitBenchmark}
                    disabled={submitting || !providerId}
                    className="flex-1 rounded-lg bg-dc1-amber px-5 py-3 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-hover disabled:opacity-40 transition-colors"
                  >
                    {submitting ? 'Submitting…' : 'Submit benchmark →'}
                  </button>
                )}
                {parsed && (
                  <button
                    onClick={() => { setParsed(null); setBenchmarkRaw('') }}
                    className="rounded-lg border border-dc1-border px-4 py-3 text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                  >
                    Re-paste
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Verify results ── */}
          {step === 2 && tier && (
            <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-dc1-text-primary">
                  Step 2 — Your GPU results
                </h2>
                <p className="mt-1 text-sm text-dc1-text-secondary">
                  Benchmark verified. Here is your tier assignment and earnings estimate.
                </p>
              </div>

              {/* Tier badge */}
              <div className="flex items-center gap-4 rounded-lg bg-dc1-surface-l2 border border-dc1-border p-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dc1-amber text-dc1-void text-2xl font-bold shrink-0">
                  {tier}
                </div>
                <div>
                  <p className="text-lg font-bold text-dc1-text-primary">Tier {tier}</p>
                  <p className="text-sm text-dc1-text-secondary">
                    {tierInfo?.label || 'Standard tier'}
                  </p>
                </div>
              </div>

              {/* GPU stats */}
              {parsed && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'GPU', value: parsed.gpu_model },
                    { label: 'VRAM', value: `${parsed.vram_gb} GB` },
                    { label: 'TFLOPS', value: String(parsed.tflops) },
                    { label: 'Token throughput', value: `${parsed.tokens_per_sec} tok/s` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-dc1-surface-l2 border border-dc1-border p-3">
                      <p className="text-xs text-dc1-text-muted">{label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-dc1-text-primary">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Earnings estimate */}
              {tierInfo && (
                <div className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/5 p-5">
                  <p className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wide mb-3">
                    Estimated monthly earnings at 70% utilisation
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-dc1-amber">
                        ${tierInfo.minUSD.toLocaleString()} – ${tierInfo.maxUSD.toLocaleString()}
                      </p>
                      <p className="text-xs text-dc1-text-muted mt-0.5">USD / month</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-dc1-text-primary">
                        {(tierInfo.minUSD * USD_TO_SAR).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {' '}–{' '}
                        {(tierInfo.maxUSD * USD_TO_SAR).toLocaleString(undefined, { maximumFractionDigits: 0 })} SAR
                      </p>
                      <p className="text-xs text-dc1-text-muted mt-0.5">SAR / month</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-dc1-text-muted">
                    Based on DCP floor pricing. Saudi providers benefit from lower electricity costs —
                    up to 33% higher net margin vs US providers.
                  </p>
                </div>
              )}

              <button
                onClick={() => setStep(3)}
                className="w-full rounded-lg bg-dc1-amber px-5 py-3 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-hover transition-colors"
              >
                Go live →
              </button>
            </div>
          )}

          {/* ── Step 3: Go live ── */}
          {step === 3 && (
            <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6 space-y-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 border border-status-success mx-auto">
                <svg className="h-8 w-8 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-dc1-text-primary">Your node is live</h2>
                <p className="mt-2 text-dc1-text-secondary">
                  DCP has verified your GPU. First jobs will arrive within 24 hours as the network
                  routes workloads to your tier.
                </p>
              </div>

              <div className="rounded-lg bg-dc1-surface-l2 border border-dc1-border p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wide">What happens next</p>
                <ul className="space-y-1 text-sm text-dc1-text-secondary">
                  <li>• Jobs are dispatched automatically — no action required</li>
                  <li>• Earnings accumulate in your provider wallet in real time</li>
                  <li>• Payouts are processed weekly to your registered wallet</li>
                  <li>• Keep your machine online and daemon running to maximise uptime</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/provider"
                  className="flex-1 rounded-lg bg-dc1-amber px-5 py-3 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-hover transition-colors text-center"
                >
                  Open provider dashboard
                </Link>
                <Link
                  href="/provider/earnings"
                  className="flex-1 rounded-lg border border-dc1-border px-5 py-3 text-sm font-semibold text-dc1-text-primary hover:border-dc1-border-light transition-colors text-center"
                >
                  View earnings
                </Link>
              </div>
            </div>
          )}

          {/* Footer nav */}
          <p className="mt-8 text-center text-xs text-dc1-text-muted">
            Need help?{' '}
            <Link href="/support?category=provider" className="text-dc1-amber hover:underline">
              Contact provider support
            </Link>{' '}
            ·{' '}
            <Link href="/setup" className="text-dc1-amber hover:underline">
              Back to registration
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
