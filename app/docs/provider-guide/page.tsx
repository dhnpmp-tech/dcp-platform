'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'

const PREREQ_LINUX = `# Verify GPU driver (NVIDIA)
nvidia-smi

# On macOS Apple Silicon, no driver needed — MLX engine is used automatically

# Verify Python 3.10+
python3 --version`

const PREREQ_WINDOWS = `# Verify GPU driver (PowerShell)
nvidia-smi

# Python 3.10+ (auto-installed by the DCP app if missing)
python --version`

const DOWNLOAD_LINUX = `# Linux / macOS — one-line install with your key
# On Apple Silicon Macs, the MLX inference engine is used automatically
curl -sSL https://api.dcp.sa/install | bash -s -- YOUR_PROVIDER_KEY`

const DOWNLOAD_WINDOWS = `# Windows — download the desktop app (recommended, ~4 MB):
# https://api.dcp.sa/download/windows

# Alternative: PowerShell one-liner (no admin rights needed)
irm https://api.dcp.sa/install.ps1 | iex`

const RUN_LINUX = `# Linux / macOS
python3 dcp_daemon.py`

const RUN_WINDOWS = `# Windows
python dcp_daemon.py`

const DAEMON_OUTPUT = `[DCP] dcp_daemon v4.0.0-alpha.2 starting
[DCP] GPU detected: NVIDIA RTX 4090 (24 GB VRAM)
[DCP] Provider ID: 42 | Status: online
[DCP] Heartbeat sent — next in 30s
[DCP] Waiting for jobs...`

const VERIFY_CURL = `# Check your provider status via API
curl "https://api.dcp.sa/api/providers/me?key=YOUR_PROVIDER_KEY"`

const VERIFY_RESPONSE = `{
  "provider": {
    "id": 42,
    "status": "online",
    "gpu_model": "RTX 4090",
    "last_heartbeat": "2026-03-19T18:00:00Z",
    "total_jobs": 0,
    "total_earned_sar": "0.00"
  }
}`

const JOB_OUTPUT = `[DCP] Job received: job-abc123 (llm_inference, 30 min)
[DCP] Loading model via Ollama engine
[DCP] Inference running — executing job
[DCP] Job completed in 612s
[DCP] Earnings credited: +45.75 SAR (75% of 61.00 SAR)`

export default function ProviderGuidePage() {
  const { t } = useLanguage()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Record<number, 'linux' | 'windows'>>({})

  function getTab(stepIdx: number): 'linux' | 'windows' {
    return activeTab[stepIdx] ?? 'linux'
  }
  function setTab(stepIdx: number, tab: 'linux' | 'windows') {
    setActiveTab((prev) => ({ ...prev, [stepIdx]: tab }))
  }

  const requirements = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
      title: t('pg.req_gpu'),
      desc: t('pg.req_gpu_desc'),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: t('pg.req_os'),
      desc: t('pg.req_os_desc'),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
      title: t('pg.req_internet'),
      desc: t('pg.req_internet_desc'),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      title: t('pg.req_account'),
      desc: t('pg.req_account_desc'),
    },
  ]

  const earnings = [
    { title: t('pg.earn_split'), desc: t('pg.earn_split_desc') },
    { title: t('pg.earn_example'), desc: t('pg.earn_example_desc') },
    { title: t('pg.earn_paid'), desc: t('pg.earn_paid_desc') },
  ]

  type StepCode = { linux: string; windows: string }
  type StepLink = { href: string; label: string }
  type Step = {
    num: string
    title: string
    desc: string
    code?: StepCode
    output?: string
    link?: StepLink
  }

  const steps: Step[] = [
    {
      num: '1',
      title: t('pg.step1_title'),
      desc: t('pg.step1_desc'),
      code: { linux: PREREQ_LINUX, windows: PREREQ_WINDOWS },
    },
    {
      num: '2',
      title: t('pg.step2_title'),
      desc: t('pg.step2_desc'),
      link: { href: '/setup', label: t('pg.cta_button') },
    },
    {
      num: '3',
      title: t('pg.step3_title'),
      desc: t('pg.step3_desc'),
      code: { linux: DOWNLOAD_LINUX, windows: DOWNLOAD_WINDOWS },
    },
    {
      num: '4',
      title: t('pg.step4_title'),
      desc: t('pg.step4_desc'),
      code: { linux: RUN_LINUX, windows: RUN_WINDOWS },
      output: DAEMON_OUTPUT,
    },
    {
      num: '5',
      title: t('pg.step5_title'),
      desc: t('pg.step5_desc'),
      code: { linux: VERIFY_CURL, windows: VERIFY_CURL },
      output: VERIFY_RESPONSE,
    },
    {
      num: '6',
      title: t('pg.step6_title'),
      desc: t('pg.step6_desc'),
      output: JOB_OUTPUT,
    },
  ]

  const faqs = [
    { q: t('pg.faq_q1'), a: t('pg.faq_a1') },
    { q: t('pg.faq_q2'), a: t('pg.faq_a2') },
    { q: t('pg.faq_q3'), a: t('pg.faq_a3') },
    { q: t('pg.faq_q4'), a: t('pg.faq_a4') },
  ]

  const troubleshootingByStatus = [
    {
      id: 'status-waiting-install-daemon',
      status: t('register.provider.state.waiting.label'),
      action: t('register.provider.status_matrix.waiting.action'),
      command: 'python3 dcp_daemon.py',
    },
    {
      id: 'status-heartbeat-verify-telemetry',
      status: t('register.provider.state.heartbeat.label'),
      action: t('register.provider.status_matrix.heartbeat.action'),
      command: 'curl "https://api.dcp.sa/api/providers/me?key=YOUR_PROVIDER_KEY"',
    },
    {
      id: 'status-stale-restart-daemon',
      status: t('register.provider.state.stale.label'),
      action: t('register.provider.status_matrix.stale.action'),
      command: 'curl -I "https://api.dcp.sa/api/providers/download/daemon?key=YOUR_PROVIDER_KEY"',
    },
    {
      id: 'status-paused-resume-provider',
      status: t('register.provider.state.paused.label'),
      action: t('register.provider.status_matrix.paused.action'),
      command: 'Open /provider/dashboard and select Resume',
    },
    {
      id: 'status-ready-monitor-jobs',
      status: t('register.provider.state.ready.label'),
      action: t('register.provider.status_matrix.ready.action'),
      command: 'Open /provider/dashboard and check jobs + earnings panels',
    },
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {t('pg.badge')}
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-dc1-amber mb-4 leading-tight">
              {t('pg.title')}
            </h1>
            <p className="text-lg text-dc1-text-secondary max-w-2xl leading-relaxed">
              {t('pg.subtitle')}
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/setup" className="btn btn-primary btn-sm">
                {t('pg.cta_button')}
              </Link>
              <Link href="/docs/api" className="btn btn-secondary btn-sm">
                API Reference
              </Link>
            </div>
          </div>
        </section>

        {/* Requirements */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-8">
            {t('pg.req_title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requirements.map((req) => (
              <div
                key={req.title}
                className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-5 flex gap-4"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-dc1-amber/10 flex items-center justify-center text-dc1-amber">
                  {req.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-dc1-text-primary mb-1">{req.title}</h3>
                  <p className="text-xs text-dc1-text-secondary leading-relaxed">{req.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Earnings */}
        <section className="bg-dc1-surface-l1 border-y border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">
              {t('pg.earn_title')}
            </h2>
            <p className="text-dc1-text-secondary mb-8 max-w-2xl">{t('pg.earn_desc')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {earnings.map((item) => (
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

        {/* Setup Steps */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-10">
            {t('pg.setup_title')}
          </h2>
          <div className="space-y-10">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex gap-6">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-dc1-amber flex items-center justify-center text-dc1-void font-bold text-sm">
                  {step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{step.title}</h3>
                  <p className="text-sm text-dc1-text-secondary mb-4 leading-relaxed">{step.desc}</p>

                  {step.link && (
                    <Link href={step.link.href} className="btn btn-primary btn-sm inline-flex mb-4">
                      {step.link.label}
                    </Link>
                  )}

                  {step.code && (
                    <div className="mb-3">
                      {/* OS tab bar */}
                      <div className="flex gap-1 mb-2">
                        {(['linux', 'windows'] as const).map((os) => (
                          <button
                            key={os}
                            onClick={() => setTab(idx, os)}
                            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                              getTab(idx) === os
                                ? 'bg-dc1-amber text-dc1-void font-semibold'
                                : 'text-dc1-text-muted hover:text-dc1-amber'
                            }`}
                          >
                            {os === 'linux' ? 'Linux / macOS' : 'Windows (PowerShell)'}
                          </button>
                        ))}
                      </div>
                      <pre className="bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-xs text-dc1-amber font-mono overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                        {getTab(idx) === 'linux' ? step.code.linux : step.code.windows}
                      </pre>
                    </div>
                  )}

                  {step.output && (
                    <div>
                      <p className="text-xs text-dc1-text-muted font-mono mb-2 uppercase tracking-wider">Expected output</p>
                      <pre className="bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-xs text-green-400 font-mono overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                        {step.output}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">
            {t('register.provider.status_matrix.title')}
          </h2>
          <p className="text-dc1-text-secondary mb-8 max-w-3xl">
            {t('register.provider.status_matrix.subtitle')}
          </p>
          <div className="space-y-4">
            {troubleshootingByStatus.map((item) => (
              <article
                key={item.id}
                id={item.id}
                className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-5 scroll-mt-24"
              >
                <h3 className="text-base font-semibold text-dc1-text-primary mb-2">{item.status}</h3>
                <p className="text-sm text-dc1-text-secondary leading-relaxed mb-3">{item.action}</p>
                <pre className="bg-dc1-surface-l1 border border-dc1-border rounded-lg px-4 py-3 text-xs text-dc1-amber font-mono overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                  {item.command}
                </pre>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-dc1-surface-l1 border-y border-dc1-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-8">
              {t('pg.faq_title')}
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
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="card border-dc1-amber/20 text-center py-12 px-8 glow-amber">
            <h2 className="text-2xl font-bold text-dc1-text-primary mb-3">
              {t('pg.cta_title')}
            </h2>
            <p className="text-dc1-text-secondary max-w-md mx-auto mb-8">
              {t('pg.cta_desc')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/setup" className="btn btn-primary btn-lg w-full sm:w-auto">
                {t('pg.cta_button')}
              </Link>
              <Link href="/login" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">
                {t('pg.cta_signin')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
