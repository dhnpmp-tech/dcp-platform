'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import { useLanguage } from '../../lib/i18n'
import { displayGpuType } from '../../lib/useGpuTypes'

const API_BASE = '/api'

// Pods are long-lived; poll a touch slower than the jobs page (30s)
const POD_REFRESH_MS = 8000
// Launchable, PREPAID durations (minutes). A launch debits the full-duration
// quote upfront (rate + 40% per gpu-second); an early stop refunds the
// difference. Capped at 48h on demand — backend rejects > 2880 min with
// EXCEEDS_MAX_DURATION. 10–90 day runs are a separate reserved-capacity track,
// surfaced below the selector as a non-launchable contact-us hint.
const DURATION_OPTIONS = [30, 60, 120, 240, 480, 1440, 2160, 2880] as const
const DEFAULT_DURATION_MINUTES = 60
const MIN_TOKEN_LENGTH = 12

// Friendly aliases map to pre-baked dcp-compute:<alias> images (sshd baked in →
// fast start). "Custom…" lets the renter pass any valid Docker image reference,
// which the daemon boots with sshd injected. PyTorch is the default.
const IMAGE_PRESETS = [
  { value: 'pytorch', label: 'PyTorch' },
  { value: 'vllm', label: 'vLLM' },
  { value: 'cuda', label: 'CUDA base' },
  { value: 'ubuntu', label: 'Ubuntu' },
] as const
const CUSTOM_IMAGE_OPTION = 'custom'
const DEFAULT_IMAGE = 'pytorch'

// ── Types ──────────────────────────────────────────────────────────
interface Pod {
  id: number | string
  status: string
  access_url?: string | null
  ssh_command?: string | null
  // GPU TYPE only — never a machine name or provider id (backend leak-fix
  // removed provider_id / provider_name from toPodView).
  gpu_type?: string | null
  duration_minutes?: number | null
  submitted_at?: string | null
  created_at?: string | null
}

interface AvailableProvider {
  id: number
  // GPU TYPE + VRAM only — never a machine name. We deliberately do not hold
  // the provider name so it cannot surface to a renter.
  gpu_model: string
  vram_gb: number
  status: 'online' | 'offline'
}

interface LaunchState {
  providerId: string
  durationMinutes: number
  notebookToken: string
  // Selected preset value, or CUSTOM_IMAGE_OPTION to use customImage instead.
  imageChoice: string
  // Free-form Docker image ref, only used when imageChoice === CUSTOM_IMAGE_OPTION.
  customImage: string
  submitting: boolean
  error: string
}

const ACTIVE_POD_STATUSES = new Set(['queued', 'assigned', 'pulling', 'running', 'starting'])

// ── SVG Icon Components (match renter pages exactly) ───────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)
const PodsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m0-10L4 7m0 0v10l8 4" />
  </svg>
)

// ── Helpers ────────────────────────────────────────────────────────
function generateNotebookToken(): string {
  // Strong, URL-safe token generated client-side so the renter sees it once.
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function isActivePod(pod: Pod): boolean {
  return ACTIVE_POD_STATUSES.has(String(pod.status || '').toLowerCase())
}

// Resolve the image to send in the POST body: a preset alias, or the trimmed
// custom Docker ref when "Custom…" is selected. Returns '' if custom is empty.
function resolveImage(launch: Pick<LaunchState, 'imageChoice' | 'customImage'>): string {
  if (launch.imageChoice === CUSTOM_IMAGE_OPTION) return launch.customImage.trim()
  return launch.imageChoice
}

function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

export default function RenterPodsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [pods, setPods] = useState<Pod[]>([])
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [renterName, setRenterName] = useState('Renter')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  const [launch, setLaunch] = useState<LaunchState>({
    providerId: '',
    durationMinutes: DEFAULT_DURATION_MINUTES,
    notebookToken: generateNotebookToken(),
    imageChoice: DEFAULT_IMAGE,
    customImage: '',
    submitting: false,
    error: '',
  })

  // Track ids we're actively polling so a launch immediately starts polling.
  const pollIdsRef = useRef<Set<string>>(new Set())

  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: 'GPU Pods', href: '/renter/pods', icon: <PodsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]

  // ── Data loaders ─────────────────────────────────────────────────
  const fetchPods = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${API_BASE}/pods?key=${encodeURIComponent(apiKey)}`, {
        headers: { 'x-renter-key': apiKey },
      })
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('dc1_renter_key')
        router.push('/login')
        return
      }
      if (!res.ok) return
      const data = await res.json()
      const list: Pod[] = Array.isArray(data?.pods) ? data.pods : Array.isArray(data) ? data : []
      setPods(list)
    } catch (err) {
      console.error('Failed to load pods:', err)
    }
  }, [router])

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/renters/available-providers`)
      if (!res.ok) return
      const data = await res.json()
      const list: AvailableProvider[] = (data.providers || []).map((p: Record<string, unknown>) => ({
        id: p.id as number,
        gpu_model: (p.gpu_model as string) || 'GPU',
        vram_gb: (p.vram_gb as number) ?? 0,
        status: 'online' as const,
      }))
      setProviders(list)
      // Auto-pick the first provider if the renter hasn't chosen one yet.
      setLaunch(prev => (prev.providerId ? prev : { ...prev, providerId: list[0] ? String(list[0].id) : '' }))
    } catch (err) {
      console.error('Failed to load providers:', err)
    }
  }, [])

  const fetchRenter = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(apiKey)}`)
      if (res.ok) {
        const data = await res.json()
        setRenterName(data.renter?.name || 'Renter')
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  // ── Auth gate + polling loop ─────────────────────────────────────
  useEffect(() => {
    const apiKey = localStorage.getItem('dc1_renter_key')
    if (!apiKey) {
      router.push('/login')
      return
    }
    let cancelled = false
    const tick = async () => {
      await Promise.all([fetchPods(apiKey), fetchRenter(apiKey), fetchProviders()])
      if (!cancelled) setLoading(false)
    }
    tick()
    const interval = setInterval(() => {
      const key = localStorage.getItem('dc1_renter_key')
      if (key) fetchPods(key)
    }, POD_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fetchPods, fetchProviders, fetchRenter, router])

  // ── Launch ───────────────────────────────────────────────────────
  const submitLaunch = async () => {
    const apiKey = localStorage.getItem('dc1_renter_key') || ''
    if (!apiKey || launch.submitting) return

    const token = launch.notebookToken.trim()
    if (token.length < MIN_TOKEN_LENGTH) {
      setLaunch(l => ({ ...l, error: `Notebook token must be at least ${MIN_TOKEN_LENGTH} characters.` }))
      return
    }

    const image = resolveImage(launch)
    if (launch.imageChoice === CUSTOM_IMAGE_OPTION && !image) {
      setLaunch(l => ({ ...l, error: 'Enter a Docker image reference for a custom pod.' }))
      return
    }

    setLaunch(l => ({ ...l, submitting: true, error: '' }))
    try {
      const res = await fetch(`${API_BASE}/pods?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify({
          provider_id: launch.providerId ? Number(launch.providerId) : undefined,
          duration_minutes: launch.durationMinutes,
          image,
          params: { NOTEBOOK_TOKEN: token },
        }),
      })

      if (res.status === 402) {
        setLaunch(l => ({ ...l, submitting: false, error: 'insufficient_balance' }))
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLaunch(l => ({ ...l, submitting: false, error: err.error || 'Failed to launch pod.' }))
        return
      }

      const data = await res.json()
      const newId = data.id ?? data.job?.id ?? null
      if (newId != null) pollIdsRef.current.add(String(newId))

      // Reset the form (fresh token) and refresh the list immediately.
      setLaunch({
        providerId: launch.providerId,
        durationMinutes: launch.durationMinutes,
        notebookToken: generateNotebookToken(),
        imageChoice: launch.imageChoice,
        customImage: launch.customImage,
        submitting: false,
        error: '',
      })
      fetchPods(apiKey)
    } catch {
      setLaunch(l => ({ ...l, submitting: false, error: 'Network error. Please try again.' }))
    }
  }

  // ── Stop ─────────────────────────────────────────────────────────
  const stopPod = async (pod: Pod) => {
    const apiKey = localStorage.getItem('dc1_renter_key') || ''
    const id = String(pod.id)
    if (!apiKey || stopping[id]) return
    setStopping(s => ({ ...s, [id]: true }))
    try {
      const res = await fetch(`${API_BASE}/pods/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`, {
        method: 'DELETE',
        headers: { 'x-renter-key': apiKey },
      })
      if (res.ok) {
        pollIdsRef.current.delete(id)
        fetchPods(apiKey)
      }
    } catch (err) {
      console.error('Failed to stop pod:', err)
    } finally {
      setStopping(s => ({ ...s, [id]: false }))
    }
  }

  // ── Copy helper ──────────────────────────────────────────────────
  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(c => (c === key ? null : c)), 2000)
    }).catch(() => { /* clipboard unavailable */ })
  }

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName="Renter">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  const activePods = pods.filter(isActivePod).length

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterName}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">GPU Pods</h1>
            <p className="text-dc1-text-secondary text-sm mt-1">
              Launch a full GPU container with a Jupyter notebook and SSH access — auto-refreshes every {POD_REFRESH_MS / 1000}s
            </p>
          </div>
        </div>

        {/* Launch Form */}
        <section className="card p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-dc1-amber"><PodsIcon /></span>
            <h2 className="text-lg font-semibold text-dc1-text-primary">Launch GPU Pod</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Provider picker (provider-agnostic) */}
            <div className="space-y-1.5">
              <label htmlFor="pod-provider" className="block text-sm font-medium text-dc1-text-secondary">
                Provider
              </label>
              <select
                id="pod-provider"
                value={launch.providerId}
                onChange={e => setLaunch(l => ({ ...l, providerId: e.target.value }))}
                className="w-full bg-dc1-surface-l2 border border-white/10 rounded-lg px-4 py-3 text-dc1-text-primary focus:outline-none focus:border-dc1-amber/60 transition text-sm"
              >
                {providers.length === 0 && <option value="">No online providers</option>}
                {providers.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {/* GPU TYPE + VRAM only — never a machine name. */}
                    {displayGpuType(p.gpu_model)}{p.vram_gb ? ` · ${p.vram_gb}GB` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dc1-text-muted">Leave on the first option to auto-pick an available GPU.</p>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label htmlFor="pod-duration" className="block text-sm font-medium text-dc1-text-secondary">
                Duration
              </label>
              <select
                id="pod-duration"
                value={launch.durationMinutes}
                onChange={e => setLaunch(l => ({ ...l, durationMinutes: Number(e.target.value) }))}
                className="w-full bg-dc1-surface-l2 border border-white/10 rounded-lg px-4 py-3 text-dc1-text-primary focus:outline-none focus:border-dc1-amber/60 transition text-sm"
              >
                {DURATION_OPTIONS.map(min => (
                  <option key={min} value={min}>{formatDuration(min)}</option>
                ))}
              </select>
              <p className="text-xs text-dc1-text-muted">The pod is torn down automatically when the duration elapses. The full duration is charged upfront; an early stop refunds the difference.</p>
              <p className="text-xs text-dc1-text-muted mt-1.5 pt-1.5 border-t border-white/5">
                Need 10–90 days for a long training run? Reserved capacity isn’t booked on demand — contact us at{' '}
                <a href="mailto:sales@dcp.sa" className="underline">sales@dcp.sa</a> for multi-day reserved GPUs.
              </p>
            </div>
          </div>

          {/* Image */}
          <div className="space-y-1.5">
            <label htmlFor="pod-image" className="block text-sm font-medium text-dc1-text-secondary">
              Image
            </label>
            <select
              id="pod-image"
              value={launch.imageChoice}
              onChange={e => setLaunch(l => ({ ...l, imageChoice: e.target.value, error: l.error === 'insufficient_balance' ? l.error : '' }))}
              className="w-full bg-dc1-surface-l2 border border-white/10 rounded-lg px-4 py-3 text-dc1-text-primary focus:outline-none focus:border-dc1-amber/60 transition text-sm"
            >
              {IMAGE_PRESETS.map(img => (
                <option key={img.value} value={img.value}>{img.label}</option>
              ))}
              <option value={CUSTOM_IMAGE_OPTION}>Custom…</option>
            </select>
            {launch.imageChoice === CUSTOM_IMAGE_OPTION ? (
              <input
                id="pod-image-custom"
                type="text"
                value={launch.customImage}
                onChange={e => setLaunch(l => ({ ...l, customImage: e.target.value, error: l.error === 'insufficient_balance' ? l.error : '' }))}
                className="w-full bg-dc1-surface-l2 border border-white/10 rounded-lg px-4 py-3 text-dc1-text-primary font-mono text-sm placeholder-dc1-text-muted focus:outline-none focus:border-dc1-amber/60 transition"
                placeholder="e.g. tensorflow/tensorflow:latest-gpu"
                spellCheck={false}
                autoComplete="off"
              />
            ) : null}
            <p className="text-xs text-dc1-text-muted">
              Presets start fast with SSH ready. Custom images boot any Docker reference with SSH injected automatically.
            </p>
          </div>

          {/* Notebook token */}
          <div className="space-y-1.5">
            <label htmlFor="pod-token" className="block text-sm font-medium text-dc1-text-secondary">
              Notebook token
            </label>
            <div className="flex gap-2">
              <input
                id="pod-token"
                type="text"
                value={launch.notebookToken}
                onChange={e => setLaunch(l => ({ ...l, notebookToken: e.target.value }))}
                className="flex-1 bg-dc1-surface-l2 border border-white/10 rounded-lg px-4 py-3 text-dc1-text-primary font-mono text-sm placeholder-dc1-text-muted focus:outline-none focus:border-dc1-amber/60 transition"
                placeholder="strong token used to open Jupyter"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setLaunch(l => ({ ...l, notebookToken: generateNotebookToken(), error: l.error === 'insufficient_balance' ? l.error : '' }))}
                className="btn btn-secondary px-3 text-sm whitespace-nowrap"
                title="Generate a new token"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-dc1-text-muted">
              Used to authenticate your Jupyter session. Keep it private — at least {MIN_TOKEN_LENGTH} characters.
            </p>
          </div>

          {/* Error */}
          {launch.error === 'insufficient_balance' ? (
            <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
              Insufficient balance. Please{' '}
              <Link href="/renter/billing" className="underline font-semibold">top up your balance</Link>{' '}first.
            </div>
          ) : launch.error ? (
            <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
              {launch.error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              onClick={submitLaunch}
              disabled={launch.submitting || providers.length === 0}
              className="btn btn-primary min-h-[44px] px-6 flex items-center gap-2 disabled:opacity-50"
            >
              {launch.submitting && (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {launch.submitting ? 'Launching…' : 'Launch GPU Pod'}
            </button>
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">Total pods</p>
            <p className="text-2xl font-bold text-dc1-text-primary">{pods.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">Active</p>
            <p className="text-2xl font-bold text-status-success">{activePods}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-dc1-text-secondary">Online providers</p>
            <p className="text-2xl font-bold text-dc1-amber">{providers.length}</p>
          </div>
        </div>

        {/* Pods list */}
        <section className="space-y-4">
          <h2 className="section-heading">Your pods</h2>
          {pods.length === 0 ? (
            <div className="card py-12 text-center space-y-2">
              <p className="text-dc1-text-secondary text-lg">No pods yet.</p>
              <p className="text-dc1-text-muted text-sm">Launch a GPU pod above to get a Jupyter notebook and SSH access.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pods.map(pod => {
                const id = String(pod.id)
                const isCopiedSsh = copied === `ssh-${id}`
                const active = isActivePod(pod)
                const accessReady = !!pod.access_url && active
                return (
                  <div key={id} className="card p-5 space-y-4">
                    {/* Row header */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-dc1-text-primary">Pod #{id}</span>
                          <StatusBadge status={pod.status as any} />
                        </div>
                        <p className="text-xs text-dc1-text-muted">
                          {/* GPU TYPE only — never a machine name or provider id. */}
                          {pod.gpu_type ? `${displayGpuType(pod.gpu_type)} · ` : ''}
                          {formatDuration(pod.duration_minutes)}
                          {(pod.submitted_at || pod.created_at)
                            ? ` · ${new Date((pod.submitted_at || pod.created_at) as string).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </p>
                      </div>
                      {active && (
                        <button
                          onClick={() => stopPod(pod)}
                          disabled={!!stopping[id]}
                          className="btn btn-outline text-sm min-h-[40px] px-4 flex items-center gap-2 disabled:opacity-50"
                          aria-label={`Stop pod ${id}`}
                        >
                          {stopping[id] && (
                            <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                          )}
                          {stopping[id] ? 'Stopping…' : 'Stop'}
                        </button>
                      )}
                    </div>

                    {/* Access details */}
                    {accessReady ? (
                      <div className="space-y-3">
                        {/* Jupyter link */}
                        <div className="bg-dc1-surface-l2 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-xs text-dc1-text-muted mb-1">Jupyter notebook</p>
                            <a
                              href={pod.access_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-dc1-amber hover:underline font-mono text-sm break-all"
                            >
                              {pod.access_url}
                            </a>
                          </div>
                          <a
                            href={pod.access_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary text-sm px-4 shrink-0"
                          >
                            Open →
                          </a>
                        </div>

                        {/* SSH command */}
                        {pod.ssh_command && (
                          <div className="bg-dc1-surface-l2 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-xs text-dc1-text-muted mb-1">SSH</p>
                              <code className="text-dc1-text-primary font-mono text-sm break-all">{pod.ssh_command}</code>
                            </div>
                            <button
                              onClick={() => copyText(`ssh-${id}`, pod.ssh_command as string)}
                              className="btn btn-secondary text-sm px-3 shrink-0 flex items-center gap-1.5"
                              aria-label="Copy SSH command"
                            >
                              {isCopiedSsh ? (
                                <>
                                  <svg className="w-4 h-4 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : active ? (
                      <div className="flex items-center gap-2 text-sm text-dc1-text-secondary">
                        <span className="animate-spin h-4 w-4 border-2 border-dc1-amber border-t-transparent rounded-full" />
                        Provisioning your pod… endpoints appear here once it&apos;s ready.
                      </div>
                    ) : (
                      <p className="text-sm text-dc1-text-muted">This pod is no longer running.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
