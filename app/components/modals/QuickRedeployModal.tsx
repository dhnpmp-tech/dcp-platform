'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────

export interface Job {
  id: number
  job_id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  submitted_at: string
  started_at?: string
  completed_at?: string
  actual_cost_halala: number
  actual_duration_minutes?: number
  params?: string | null
  container_spec?: string | null
}

interface QuickRedeployModalProps {
  job: Job
  onClose: () => void
  onSuccess: () => void
}

// ── GPU Options ────────────────────────────────────────────────────

interface GpuOption {
  id: string
  name: string
  vram: string
  pricePerMin: number // SAR per minute
  tier: 'economy' | 'standard' | 'performance'
}

const GPU_OPTIONS: GpuOption[] = [
  { id: 'rtx-4080', name: 'RTX 4080', vram: '16GB', pricePerMin: 0.14, tier: 'economy' },
  { id: 'rtx-4090', name: 'RTX 4090', vram: '24GB', pricePerMin: 0.22, tier: 'standard' },
  { id: 'a100-40gb', name: 'A100 40GB', vram: '40GB', pricePerMin: 0.31, tier: 'performance' },
  { id: 'h100-pcie', name: 'H100 PCIe', vram: '80GB', pricePerMin: 0.45, tier: 'performance' },
]

const TIER_LABELS: Record<GpuOption['tier'], string> = {
  economy: 'Economy',
  standard: 'Standard',
  performance: 'Performance',
}

const TIER_COLORS: Record<GpuOption['tier'], string> = {
  economy: 'text-dc1-text-secondary',
  standard: 'text-dc1-amber',
  performance: 'text-status-info',
}

// ── Helpers ────────────────────────────────────────────────────────

function formatSAR(halala: number): string {
  return (halala / 100).toFixed(2)
}

function formatDuration(mins?: number): string {
  if (!mins) return '—'
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${Math.round(mins)} min`
  return `${(mins / 60).toFixed(1)} hr`
}

function getModelLabel(job: Job): string {
  if (job.params) {
    try {
      const p = JSON.parse(job.params)
      if (p.model) return p.model
      if (p.gpu_model) return p.gpu_model
    } catch { /* noop */ }
  }
  if (job.container_spec) {
    try {
      const c = JSON.parse(job.container_spec)
      if (c.image) return c.image.split('/').pop()?.split(':')[0] ?? job.job_type
    } catch { /* noop */ }
  }
  return job.job_type ?? 'GPU Job'
}

function getOriginalGpuId(job: Job): string {
  if (job.params) {
    try {
      const p = JSON.parse(job.params)
      if (p.gpu_model) {
        const match = GPU_OPTIONS.find(g =>
          g.name.toLowerCase().includes(p.gpu_model.toLowerCase()) ||
          p.gpu_model.toLowerCase().includes(g.id)
        )
        if (match) return match.id
      }
    } catch { /* noop */ }
  }
  return 'rtx-4090' // default
}

function getJobParamsSummary(job: Job): Record<string, string> {
  const params: Record<string, string> = {}
  if (job.params) {
    try {
      const p = JSON.parse(job.params)
      if (p.model) params['Model'] = p.model
      if (p.max_tokens) params['Max Tokens'] = String(p.max_tokens)
      if (p.temperature != null) params['Temperature'] = String(p.temperature)
      if (p.top_p != null) params['Top-P'] = String(p.top_p)
    } catch { /* noop */ }
  }
  if (job.container_spec) {
    try {
      const c = JSON.parse(job.container_spec)
      if (c.image && !params['Model']) params['Image'] = c.image.split('/').pop() ?? c.image
      if (c.pricing_class) params['Tier'] = c.pricing_class
    } catch { /* noop */ }
  }
  if (!Object.keys(params).length) {
    params['Type'] = job.job_type ?? 'GPU Job'
  }
  return params
}

// ── Analytics ──────────────────────────────────────────────────────

function trackEvent(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && (window as unknown as { analytics?: { track: (e: string, p?: unknown) => void } }).analytics?.track) {
      (window as unknown as { analytics: { track: (e: string, p?: unknown) => void } }).analytics.track(event, props)
    }
    console.debug('[analytics]', event, props)
  } catch { /* noop */ }
}

// ── Step Dots ──────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all ${
            i === current
              ? 'w-5 h-2 bg-dc1-amber'
              : i < current
              ? 'w-2 h-2 bg-dc1-amber/40'
              : 'w-2 h-2 bg-dc1-border'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Review Config ──────────────────────────────────────────

function StepReviewConfig({
  job,
  onCancel,
  onNext,
}: {
  job: Job
  onCancel: () => void
  onNext: () => void
}) {
  const model = getModelLabel(job)
  const params = getJobParamsSummary(job)
  const prevCostSAR = formatSAR(job.actual_cost_halala ?? 0)
  const prevDuration = formatDuration(job.actual_duration_minutes)

  return (
    <div className="space-y-5">
      <div>
        <h3 id="modal-title" className="text-lg font-semibold text-dc1-text-primary">
          Redeploy: {model}
        </h3>
        <p className="text-sm text-dc1-text-secondary mt-0.5">
          Review your previous job configuration before redeploying.
        </p>
      </div>

      <div className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-dc1-text-muted uppercase tracking-wider">
          Job Configuration
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {Object.entries(params).map(([key, val]) => (
            <div key={key}>
              <p className="text-xs text-dc1-text-muted">{key}</p>
              <p className="text-sm font-mono text-dc1-text-primary truncate" title={val}>
                {val}
              </p>
            </div>
          ))}
          <div>
            <p className="text-xs text-dc1-text-muted">Job Type</p>
            <p className="text-sm font-mono text-dc1-text-primary">{job.job_type}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex-1 bg-dc1-surface-l2 border border-dc1-border rounded-lg p-3">
          <p className="text-xs text-dc1-text-muted mb-1">Previous Duration</p>
          <p className="font-semibold text-dc1-text-primary">{prevDuration}</p>
        </div>
        <div className="flex-1 bg-dc1-surface-l2 border border-dc1-border rounded-lg p-3">
          <p className="text-xs text-dc1-text-muted mb-1">Previous Cost</p>
          <p className="font-semibold text-dc1-amber">{prevCostSAR} SAR</p>
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary bg-dc1-surface-l3 hover:bg-dc1-surface-l2 border border-dc1-border transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onNext}
          className="btn btn-primary px-4 py-2 text-sm flex items-center gap-2"
        >
          Next: Select GPU
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Select GPU ─────────────────────────────────────────────

function StepSelectGpu({
  job,
  selectedGpuId,
  onSelectGpu,
  onBack,
  onNext,
}: {
  job: Job
  selectedGpuId: string
  onSelectGpu: (id: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const prevDurationMins = job.actual_duration_minutes ?? 30
  const selectedGpu = GPU_OPTIONS.find(g => g.id === selectedGpuId) ?? GPU_OPTIONS[1]

  return (
    <div className="space-y-5">
      <div>
        <h3 id="modal-title" className="text-lg font-semibold text-dc1-text-primary">
          Select GPU Tier
        </h3>
        <p className="text-sm text-dc1-text-secondary mt-0.5">
          Choose the GPU for your redeployment. Original GPU is pre-selected.
        </p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label="GPU tier selection">
        {GPU_OPTIONS.map(gpu => {
          const isSelected = gpu.id === selectedGpuId
          const estCost = (gpu.pricePerMin * prevDurationMins).toFixed(2)
          return (
            <button
              key={gpu.id}
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelectGpu(gpu.id)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'border-dc1-amber bg-dc1-amber/5'
                  : 'border-dc1-border bg-dc1-surface-l2 hover:border-dc1-border-light'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                isSelected ? 'border-dc1-amber' : 'border-dc1-border'
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-dc1-amber" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-dc1-text-primary">{gpu.name}</span>
                  <span className="text-xs text-dc1-text-muted">{gpu.vram}</span>
                  <span className={`text-xs font-medium ${TIER_COLORS[gpu.tier]}`}>
                    {TIER_LABELS[gpu.tier]}
                  </span>
                </div>
                <p className="text-xs text-dc1-text-muted mt-0.5">
                  {gpu.pricePerMin.toFixed(2)} SAR/min · Est. {estCost} SAR
                </p>
              </div>
              {isSelected && (
                <span className="text-xs font-medium text-dc1-amber flex-shrink-0">Selected</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="bg-dc1-amber/5 border border-dc1-amber/20 rounded-lg p-3 text-sm">
        <p className="text-dc1-text-secondary">
          Estimated cost with <span className="font-medium text-dc1-text-primary">{selectedGpu.name}</span>:{' '}
          <span className="text-dc1-amber font-semibold">
            {(selectedGpu.pricePerMin * prevDurationMins * 0.5).toFixed(2)}–
            {(selectedGpu.pricePerMin * prevDurationMins * 1.5).toFixed(2)} SAR
          </span>
          <span className="text-dc1-text-muted text-xs"> (based on previous runtime)</span>
        </p>
      </div>

      <div className="flex gap-3 justify-between pt-1">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary bg-dc1-surface-l3 hover:bg-dc1-surface-l2 border border-dc1-border transition-all flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          className="btn btn-primary px-4 py-2 text-sm flex items-center gap-2"
        >
          Review &amp; Launch
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Confirm & Launch ───────────────────────────────────────

type LaunchState = 'idle' | 'launching' | 'success' | 'error'

interface LaunchError {
  message: string
  code?: string
}

const ERROR_MAP: Record<string, string> = {
  insufficient_balance: 'Insufficient credit balance. Please top up your wallet.',
  'Only failed jobs can be retried': 'This job type cannot be redeployed. Please submit a new job.',
  'Job not found': 'Original job not found.',
  GPU_UNAVAILABLE_TEMPORARY: 'GPU temporarily unavailable. Please retry in a few minutes.',
  GPU_UNAVAILABLE_RETIRED: 'This GPU type is no longer offered. Please select a different GPU.',
  REGION_UNAVAILABLE: 'Template not available in selected region.',
  MODEL_DEPRECATED: 'This model is no longer available. Please browse similar models.',
}

function StepConfirmLaunch({
  job,
  selectedGpuId,
  onBack,
  onClose,
  onSuccess,
}: {
  job: Job
  selectedGpuId: string
  onBack: () => void
  onClose: () => void
  onSuccess: () => void
}) {
  const [state, setState] = useState<LaunchState>('idle')
  const [error, setError] = useState<LaunchError | null>(null)
  const [newJobId, setNewJobId] = useState<string | null>(null)
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedGpu = GPU_OPTIONS.find(g => g.id === selectedGpuId) ?? GPU_OPTIONS[1]
  const model = getModelLabel(job)
  const prevDurationMins = job.actual_duration_minutes ?? 30
  const estimatedMin = (selectedGpu.pricePerMin * prevDurationMins * 0.5).toFixed(2)
  const estimatedMax = (selectedGpu.pricePerMin * prevDurationMins * 1.5).toFixed(2)

  useEffect(() => {
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
    }
  }, [])

  const handleLaunch = useCallback(async () => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) return

    setState('launching')
    setError(null)
    trackEvent('redeploy_clicked', { job_id: job.job_id, gpu: selectedGpuId, model })

    try {
      const res = await fetch(`/api/jobs/${job.job_id}/retry`, {
        method: 'POST',
        headers: { 'X-Renter-Key': key },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const rawCode = body.error ?? 'SERVER_ERROR'
        throw { message: ERROR_MAP[rawCode] ?? body.error ?? 'Deployment failed. Please try again.', code: rawCode }
      }

      const data = await res.json()
      const returnedJobId = data.job?.job_id ?? data.job_id ?? null
      setNewJobId(returnedJobId)
      setState('success')
      trackEvent('redeploy_confirmed', { job_id: job.job_id, new_job_id: returnedJobId, gpu: selectedGpuId, model })

      autoCloseTimer.current = setTimeout(() => {
        onSuccess()
        onClose()
      }, 6000)
    } catch (err) {
      const launchErr = err as LaunchError
      setState('error')
      setError({ message: launchErr.message ?? 'Deployment failed.', code: launchErr.code })
    }
  }, [job, selectedGpuId, model, onSuccess, onClose])

  if (state === 'success') {
    return (
      <div className="space-y-5">
        <div className="text-center py-4">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-semibold text-dc1-text-primary">Job Started Successfully!</h3>
          <p className="text-sm text-dc1-text-secondary mt-1">Your job has been queued and will start shortly.</p>
        </div>
        {newJobId && (
          <div className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-dc1-text-muted">New Job ID</span>
              <span className="text-xs font-mono text-dc1-text-primary select-all">{newJobId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-dc1-text-muted">GPU</span>
              <span className="text-xs text-dc1-text-primary">{selectedGpu.name}</span>
            </div>
          </div>
        )}
        <p className="text-xs text-dc1-text-muted text-center">Auto-closing in a few seconds…</p>
        <div className="flex gap-3 justify-center">
          {newJobId && (
            <Link href={`/renter/jobs/${newJobId}`} className="btn btn-primary px-4 py-2 text-sm" onClick={onClose}>
              View Job
            </Link>
          )}
          <button
            onClick={() => { onSuccess(); onClose() }}
            className="px-4 py-2 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary bg-dc1-surface-l3 hover:bg-dc1-surface-l2 border border-dc1-border transition-all"
          >
            Back to History
          </button>
        </div>
      </div>
    )
  }

  if (state === 'error' && error) {
    const isBalanceError = error.code === 'insufficient_balance'
    return (
      <div className="space-y-5">
        <div className="text-center py-2">
          <div className="text-4xl mb-3">❌</div>
          <h3 className="text-lg font-semibold text-dc1-text-primary">Deployment Failed</h3>
        </div>
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-4">
          <p className="text-sm text-status-error">{error.message}</p>
          {error.code && <p className="text-xs text-dc1-text-muted mt-1 font-mono">{error.code}</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary bg-dc1-surface-l3 hover:bg-dc1-surface-l2 border border-dc1-border transition-all"
          >
            Close
          </button>
          {isBalanceError ? (
            <Link href="/renter/billing" className="btn btn-primary px-4 py-2 text-sm" onClick={onClose}>
              Top Up Wallet
            </Link>
          ) : (
            <button onClick={() => { setState('idle'); setError(null) }} className="btn btn-primary px-4 py-2 text-sm">
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (state === 'launching') {
    return (
      <div className="space-y-5">
        <div className="text-center py-4">
          <div className="inline-block w-10 h-10 border-2 border-dc1-amber border-t-transparent rounded-full animate-spin mb-3" aria-label="Deploying…" />
          <h3 className="text-lg font-semibold text-dc1-text-primary">Deploying…</h3>
          <p className="text-sm text-dc1-text-secondary mt-1">Submitting your job to the network.</p>
        </div>
        <div className="space-y-2 text-sm" aria-live="polite">
          <div className="flex items-center gap-2 text-dc1-text-secondary">
            <span>✓</span>
            <span>GPU allocated ({selectedGpu.name})</span>
          </div>
          <div className="flex items-center gap-2 text-dc1-text-secondary">
            <span className="animate-pulse">⏳</span>
            <span>Submitting job to queue…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 id="modal-title" className="text-lg font-semibold text-dc1-text-primary">
          Confirm &amp; Launch
        </h3>
        <p className="text-sm text-dc1-text-secondary mt-0.5">
          Review your deployment configuration before launching.
        </p>
      </div>

      <div className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-dc1-text-muted">Model / Job</span>
          <span className="text-sm font-mono text-dc1-text-primary truncate max-w-[60%]">{model}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-dc1-text-muted">GPU</span>
          <span className="text-sm text-dc1-text-primary">{selectedGpu.name} ({selectedGpu.vram})</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-dc1-text-muted">Rate</span>
          <span className="text-sm text-dc1-text-primary">{selectedGpu.pricePerMin.toFixed(2)} SAR/min</span>
        </div>
        <div className="border-t border-dc1-border pt-2 flex justify-between items-center">
          <span className="text-xs text-dc1-text-muted">Estimated Cost</span>
          <span className="text-sm font-semibold text-dc1-amber">{estimatedMin}–{estimatedMax} SAR</span>
        </div>
      </div>

      <p className="text-xs text-dc1-text-muted">
        Actual cost depends on runtime. Your balance will be held until the job completes.
      </p>

      <div className="flex gap-3 justify-between pt-1">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary bg-dc1-surface-l3 hover:bg-dc1-surface-l2 border border-dc1-border transition-all flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={handleLaunch}
          className="btn btn-primary px-5 py-2 text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Launch Job
        </button>
      </div>
    </div>
  )
}

// ── Main Modal ─────────────────────────────────────────────────────

type ModalStep = 0 | 1 | 2

export default function QuickRedeployModal({ job, onClose, onSuccess }: QuickRedeployModalProps) {
  const [step, setStep] = useState<ModalStep>(0)
  const [selectedGpuId, setSelectedGpuId] = useState<string>(() => getOriginalGpuId(job))
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    trackEvent('job.redeploy.viewed', { job_id: job.job_id })
  }, [job.job_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={handleOverlayClick}
    >
      <div className="bg-dc1-surface-l1 border border-dc1-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <StepDots current={step} total={3} />
          <button
            onClick={onClose}
            className="text-dc1-text-muted hover:text-dc1-text-primary transition-colors p-1 -mr-1"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {step === 0 && (
            <StepReviewConfig job={job} onCancel={onClose} onNext={() => setStep(1)} />
          )}
          {step === 1 && (
            <StepSelectGpu
              job={job}
              selectedGpuId={selectedGpuId}
              onSelectGpu={setSelectedGpuId}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepConfirmLaunch
              job={job}
              selectedGpuId={selectedGpuId}
              onBack={() => setStep(1)}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </div>
    </div>
  )
}
