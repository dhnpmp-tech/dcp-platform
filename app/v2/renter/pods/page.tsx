'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import { displayGpuType } from '@/app/lib/useGpuTypes'
import { PodSidebar, PodTopbar, initials } from './PodShell'
import './pods.css'

// ── Pod domain constants (ported verbatim from the v1 pods page) ──────
const POD_REFRESH_MS = 8000
const MIN_TOKEN_LENGTH = 16
const DEFAULT_DURATION_MINUTES = 60

// Launchable, PREPAID durations. A launch debits the full-duration quote
// upfront (rate + 40% per gpu-second); an early stop refunds the difference.
// Capped at 48h on demand — backend rejects > 2880 min with EXCEEDS_MAX_DURATION
// (pods.js). Anything longer is a separate owner-decided "reserved capacity"
// track, surfaced below the selector as a non-launchable contact-us hint.
const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
  { minutes: 480, label: '8h' },
  { minutes: 1440, label: '24h' },
  { minutes: 2160, label: '36h' },
  { minutes: 2880, label: '48h' },
]

// Friendly aliases map to pre-baked dcp-compute:<alias> images (sshd baked in →
// fast start). "Custom…" lets the renter pass any valid Docker image reference,
// which the daemon boots with sshd injected. PyTorch is the default.
const IMAGE_PRESETS: { value: string; label: string; labelAr: string }[] = [
  { value: 'pytorch', label: 'PyTorch', labelAr: 'PyTorch' },
  { value: 'vllm', label: 'vLLM', labelAr: 'vLLM' },
  { value: 'cuda', label: 'CUDA base', labelAr: 'CUDA أساسي' },
  { value: 'ubuntu', label: 'Ubuntu', labelAr: 'Ubuntu' },
]
const CUSTOM_IMAGE_OPTION = 'custom'
const DEFAULT_IMAGE = 'pytorch'

const ACTIVE_POD_STATUSES = new Set(['queued', 'assigned', 'pulling', 'running', 'starting'])

// ── Types ─────────────────────────────────────────────────────────────
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
  ends_at?: string | null
  seconds_remaining?: number | null
  workspace_persisted?: boolean | null
}

interface AvailableProvider {
  id: number
  // GPU TYPE + VRAM only — never a machine name, never a provider id, and no
  // native/on-demand distinction. Every option reads identically: GPU type,
  // VRAM, availability. We deliberately do NOT carry the on_demand flag so it
  // cannot drive any label or styling.
  gpu_model: string
  vram_gb: number
  available: boolean
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

interface PodsListResponse {
  pods?: Pod[]
}

interface AvailableProvidersResponse {
  providers?: Array<Record<string, unknown>>
}

interface RenterMeResponse {
  renter?: { name?: string; email?: string; organization?: string }
}

interface LaunchResponse {
  id?: number | string | null
  job?: { id?: number | string | null }
  // One-time secrets returned by the 201 launch response (pods.js:374-375).
  // Shown ONCE in a reveal panel — never persisted or re-fetchable.
  root_password?: string | null
  jupyter_token?: string | null
  error?: string
}

// One-time credentials surfaced immediately after a successful launch.
interface LaunchReveal {
  podId: string
  rootPassword: string
  jupyterToken: string
}

type LoadState = 'loading' | 'ready' | 'missing-key'

// ── Helpers ────────────────────────────────────────────────────────────
function generateNotebookToken(): string {
  // Strong, URL-safe token generated client-side so the renter sees it once.
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
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

function formatSubmitted(pod: Pod): string {
  const iso = pod.submitted_at || pod.created_at
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.floor(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function statusClass(status: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'running') return 'active'
  if (s === 'queued' || s === 'assigned' || s === 'pulling' || s === 'starting') return 'queued'
  if (s === 'failed' || s === 'error') return 'failed'
  return 'revoked'
}

export default function RenterPodsPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pods, setPods] = useState<Pod[]>([])
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [renterName, setRenterName] = useState('Renter')
  const [renterEmail, setRenterEmail] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  const [extending, setExtending] = useState<Record<string, boolean>>({})
  const [extendMsg, setExtendMsg] = useState<Record<string, string>>({})
  const [volume, setVolume] = useState<any>(null)
  const [volOptions, setVolOptions] = useState<any[]>([])
  const [volPool, setVolPool] = useState<{ available_gb?: number; ceiling_gb?: number } | null>(null)
  const [volBusy, setVolBusy] = useState(false)
  const [volMsg, setVolMsg] = useState('')
  // One-time launch credentials (root_password + jupyter_token). Cleared on dismiss.
  const [reveal, setReveal] = useState<LaunchReveal | null>(null)
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

  // ── Data loaders ─────────────────────────────────────────────────────
  const [nowTick, setNowTick] = useState(() => 0)
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchPods = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${getApiBase()}/pods?key=${encodeURIComponent(apiKey)}`, {
        headers: { 'x-renter-key': apiKey },
        cache: 'no-store',
      })
      if (res.status === 401 || res.status === 403) {
        setLoadState('missing-key')
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as PodsListResponse | Pod[]
      const list: Pod[] = Array.isArray((data as PodsListResponse)?.pods)
        ? (data as PodsListResponse).pods!
        : Array.isArray(data)
          ? (data as Pod[])
          : []
      setPods(list)
    } catch (err) {
      console.error('Failed to load pods:', err)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/renters/available-providers`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as AvailableProvidersResponse
      const list: AvailableProvider[] = (data.providers || [])
        // Drive the selectable list off the backend `available` flag (present
        // on every row, now reflecting real live stock). Out-of-stock types
        // simply aren't selectable here. No native/on-demand distinction.
        .filter((p) => p.available !== false)
        .map((p) => ({
          id: p.id as number,
          gpu_model: (p.gpu_model as string) || 'GPU',
          vram_gb: (p.vram_gb as number) ?? 0,
          available: p.available !== false,
          status: 'online' as const,
        }))
      setProviders(list)
      // Auto-pick the first provider if the renter hasn't chosen one yet.
      setLaunch((prev) => (prev.providerId ? prev : { ...prev, providerId: list[0] ? String(list[0].id) : '' }))
    } catch (err) {
      console.error('Failed to load providers:', err)
    }
  }, [])

  const fetchRenter = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${getApiBase()}/renters/me?key=${encodeURIComponent(apiKey)}`, {
        headers: { 'x-renter-key': apiKey },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as RenterMeResponse
        setRenterName(data.renter?.organization || data.renter?.name || 'Renter')
        setRenterEmail(data.renter?.email || '')
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  // ── Auth gate + polling loop ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apiKey = getRenterKey()
    if (!apiKey) {
      setLoadState('missing-key')
      return
    }
    let cancelled = false
    const tick = async () => {
      await Promise.all([fetchPods(apiKey), fetchRenter(apiKey), fetchProviders(), fetchVolume(apiKey)])
      if (!cancelled) setLoadState('ready')
    }
    tick()
    const interval = setInterval(() => {
      const key = getRenterKey()
      if (key) fetchPods(key)
    }, POD_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fetchPods, fetchProviders, fetchRenter])

  // ── Launch ───────────────────────────────────────────────────────────
  const submitLaunch = async () => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || launch.submitting) return

    const token = launch.notebookToken.trim()
    if (token.length < MIN_TOKEN_LENGTH) {
      setLaunch((l) => ({ ...l, error: `Notebook token must be at least ${MIN_TOKEN_LENGTH} characters.` }))
      return
    }

    const image = resolveImage(launch)
    if (launch.imageChoice === CUSTOM_IMAGE_OPTION && !image) {
      setLaunch((l) => ({ ...l, error: 'Enter a Docker image reference for a custom pod.' }))
      return
    }

    setLaunch((l) => ({ ...l, submitting: true, error: '' }))
    try {
      const res = await fetch(`${getApiBase()}/pods?key=${encodeURIComponent(apiKey)}`, {
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
        setLaunch((l) => ({ ...l, submitting: false, error: 'insufficient_balance' }))
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as LaunchResponse
        setLaunch((l) => ({ ...l, submitting: false, error: err.error || 'Failed to launch pod.' }))
        return
      }

      const data = (await res.json()) as LaunchResponse
      const newId = data.id ?? data.job?.id ?? null
      if (newId != null) pollIdsRef.current.add(String(newId))

      // The 201 hands back root_password + jupyter_token EXACTLY ONCE — capture
      // and surface them now; they are never returned by GET /pods again.
      if (data.root_password || data.jupyter_token) {
        setReveal({
          podId: newId != null ? String(newId) : '',
          rootPassword: data.root_password || '',
          jupyterToken: data.jupyter_token || '',
        })
      }

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
      setLaunch((l) => ({ ...l, submitting: false, error: 'Network error. Please try again.' }))
    }
  }

  // ── Stop ─────────────────────────────────────────────────────────────
  const stopPod = async (pod: Pod) => {
    const apiKey = getRenterKey() || ''
    const id = String(pod.id)
    if (!apiKey || stopping[id]) return
    setStopping((s) => ({ ...s, [id]: true }))
    try {
      const res = await fetch(`${getApiBase()}/pods/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`, {
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
      setStopping((s) => ({ ...s, [id]: false }))
    }
  }

  const extendPod = async (pod: Pod, minutes: number) => {
    const apiKey = getRenterKey() || ''
    const id = String(pod.id)
    if (!apiKey || extending[id]) return
    setExtending((e) => ({ ...e, [id]: true }))
    setExtendMsg((m) => ({ ...m, [id]: '' }))
    try {
      const res = await fetch(`${getApiBase()}/pods/${encodeURIComponent(id)}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': apiKey },
        body: JSON.stringify({ extend_minutes: minutes }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setExtendMsg((m) => ({ ...m, [id]: `+${minutes >= 60 ? minutes / 60 + 'h' : minutes + 'm'} · ${data.charged_sar ?? '?'} SAR` }))
        fetchPods(apiKey)
      } else {
        const msg = (data && (data.error?.message || data.error)) || `Extend failed (${res.status})`
        setExtendMsg((m) => ({ ...m, [id]: String(msg).slice(0, 90) }))
      }
    } catch (err) {
      setExtendMsg((m) => ({ ...m, [id]: 'Extend failed — try again' }))
    } finally {
      setExtending((e) => ({ ...e, [id]: false }))
    }
  }

  const fetchVolume = useCallback(async (apiKey: string) => {
    try {
      const res = await fetch(`${getApiBase()}/volumes/me`, { headers: { 'x-renter-key': apiKey } })
      if (!res.ok) return
      const data = await res.json()
      setVolume(data.volume || null)
      setVolOptions(data.options || [])
      setVolPool(data.pool || null)
    } catch (_) { /* non-fatal */ }
  }, [])

  const rentVolume = async (sizeGb: number) => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || volBusy) return
    setVolBusy(true); setVolMsg('')
    try {
      const res = await fetch(`${getApiBase()}/volumes/rent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': apiKey },
        body: JSON.stringify({ size_gb: sizeGb }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setVolMsg(`Rented ${sizeGb} GB · ${data.charged_sar} SAR/mo`); fetchVolume(apiKey) }
      else setVolMsg(String((data && (data.error?.message || data.error)) || `Rent failed (${res.status})`).slice(0, 120))
    } catch (_) { setVolMsg('Rent failed — try again') }
    finally { setVolBusy(false) }
  }

  const releaseVolume = async () => {
    const apiKey = getRenterKey() || ''
    if (!apiKey || volBusy) return
    if (typeof window !== 'undefined' && !window.confirm('Release your volume? Stored files will be deleted and billing stops.')) return
    setVolBusy(true); setVolMsg('')
    try {
      const res = await fetch(`${getApiBase()}/volumes`, { method: 'DELETE', headers: { 'x-renter-key': apiKey } })
      if (res.ok) { setVolMsg('Volume released'); fetchVolume(apiKey) }
      else setVolMsg('Release failed')
    } catch (_) { setVolMsg('Release failed') }
    finally { setVolBusy(false) }
  }

  // ── Copy helper ──────────────────────────────────────────────────────
  const copyText = (key: string, value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
      })
      .catch(() => {
        /* clipboard unavailable */
      })
  }

  // Keep the insufficient_balance error sticky; clear any transient field error.
  const keptError = (err: string) => (err === 'insufficient_balance' ? err : '')
  const onImageChoice = (v: string) => setLaunch((l) => ({ ...l, imageChoice: v, error: keptError(l.error) }))
  const onCustomImage = (v: string) => setLaunch((l) => ({ ...l, customImage: v, error: keptError(l.error) }))
  const onRegenerate = () =>
    setLaunch((l) => ({ ...l, notebookToken: generateNotebookToken(), error: keptError(l.error) }))

  const isCustom = launch.imageChoice === CUSTOM_IMAGE_OPTION
  const activePods = pods.filter(isActivePod).length
  const noProviders = providers.length === 0
  // Count of distinct GPU *types* available (type-level, never a node/provider
  // count) — shown in the console KPI instead of a raw provider total.
  const gpuTypeCount = new Set(providers.map((p) => p.gpu_model)).size
  const isLive = loadState === 'ready'

  return (
    <div className="rt-app">
      <PodSidebar navOpen={navOpen} renterName={renterName} renterEmail={renterEmail} />

      <div className={`rt-backdrop${navOpen ? ' on' : ''}`} id="rt-backdrop" onClick={() => setNavOpen(false)} />

      <div>
        <PodTopbar
          renterName={renterName}
          isLive={isLive}
          lang={lang}
          onToggleLang={toggle}
          onToggleNav={() => setNavOpen((v) => !v)}
        />

        <main className="rt-main">
          <h1 className="rt-h1">
            <Bi en="GPU " ar="" />
            <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
              <Bi en="pods." ar="حاويات GPU." />
            </em>
          </h1>
          <div className="rt-h1-sub">
            <span>
              <Bi en="Full container · Jupyter + SSH" ar="حاوية كاملة · Jupyter + SSH" />
            </span>
            <span>
              <Bi en="Auto-refresh " ar="تحديث تلقائي " />
              <b>{POD_REFRESH_MS / 1000}s</b>
            </span>
          </div>

          {loadState === 'missing-key' && (
            <div className="dash-state" style={{ marginTop: '28px' }}>
              <b>
                <Bi en="Renter key required" ar="مفتاح المستأجر مطلوب" />
              </b>
              <span>
                <Bi
                  en="Sign in or paste a renter API key before v2 can launch GPU pods or show your running containers."
                  ar="سجل الدخول أو أدخل مفتاح مستأجر قبل أن تتمكن v2 من تشغيل حاويات GPU أو عرض حاوياتك العاملة."
                />
              </span>
              <Link className="text-link" href="/v2/renter/keys" style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                <Bi en="Manage API keys →" ar="إدارة مفاتيح API →" />
              </Link>
            </div>
          )}

          {/* ── Stat tiles ─────────────────────────────────── */}
          <div className="pod-kpis" style={{ marginTop: '36px' }}>
            <div className="kpi featured">
              <div className="k">
                <Bi en="Total pods" ar="إجمالي الحاويات" />
              </div>
              <div className="v">{pods.length}</div>
              <div className="d flat">
                <Bi en="Across this renter account" ar="عبر حساب المستأجر هذا" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="Active" ar="نشطة" />
              </div>
              <div className="v" style={{ color: activePods > 0 ? 'var(--teal)' : 'var(--ink)' }}>
                {activePods}
              </div>
              <div className="d up">
                <Bi en="Running or provisioning" ar="قيد التشغيل أو التجهيز" />
              </div>
            </div>
            <div className="kpi">
              <div className="k">
                <Bi en="GPU types available" ar="أنواع المعالجات المتاحة" />
              </div>
              <div className="v">{gpuTypeCount}</div>
              <div className="d flat">
                <Bi en="Ready to host a pod" ar="جاهزة لاستضافة حاوية" />
              </div>
            </div>
          </div>

          {/* ── Persistent volume panel ──────────────────────── */}
          <section className="panel vol-panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3><Bi en="Persistent storage" ar="تخزين دائم" /></h3>
              </div>
              <span className="hint">
                <Bi en="In-Kingdom · survives teardown · reattaches to every pod" ar="داخل المملكة · يبقى بعد الإيقاف · يُعاد ربطه بكل حاوية" />
              </span>
            </div>
            {volume ? (
              <div className="vol-active">
                <div className="vol-active-row">
                  <span className="vol-size mono">{volume.size_gb} GB</span>
                  <span className="vol-stat on">{volume.status}</span>
                  <span className="vol-price">{volume.price_sar_per_month} SAR/mo</span>
                  {typeof volume.used_pct === 'number' && (
                    <span className="vol-used">{volume.used_gb} GB used ({volume.used_pct}%)</span>
                  )}
                  <button type="button" className="btn-sec danger vol-release" disabled={volBusy} onClick={releaseVolume}>
                    <Bi en="Release" ar="إلغاء" />
                  </button>
                </div>
                <p className="vol-note"><Bi en="Files in /workspace are saved here and restore automatically on your next pod — on any provider." ar="تُحفظ ملفات /workspace هنا وتُستعاد تلقائيًا في حاويتك التالية على أي مزوّد." /></p>
              </div>
            ) : (
              <div className="vol-rent">
                <p className="vol-note"><Bi en="Rent a volume so your work persists across pods. Without one, pods are temporary." ar="استأجر مساحة لتبقى أعمالك بين الحاويات. بدونها تكون الحاويات مؤقتة." /></p>
                <div className="vol-options">
                  {volOptions.map((o) => {
                    const tooBig = volPool && typeof volPool.available_gb === 'number' && o.size_gb > volPool.available_gb
                    return (
                      <button key={o.size_gb} type="button" className="vol-opt" disabled={volBusy || !!tooBig} onClick={() => rentVolume(o.size_gb)}>
                        <span className="vol-opt-gb">{o.size_gb} GB</span>
                        <span className="vol-opt-price">{o.price_sar_per_month} SAR/mo</span>
                        {tooBig ? <span className="vol-opt-full"><Bi en="pool full" ar="ممتلئ" /></span> : null}
                      </button>
                    )
                  })}
                </div>
                {volPool && typeof volPool.available_gb === 'number' && (
                  <span className="vol-pool"><Bi en={`${volPool.available_gb} GB available`} ar={`${volPool.available_gb} غيغابايت متاح`} /></span>
                )}
              </div>
            )}
            {volMsg && <span className="vol-msg">{volMsg}</span>}
          </section>

          {/* ── Launch panel ───────────────────────────────── */}
          <section className="panel pod-launch" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Launch GPU pod" ar="تشغيل حاوية GPU" />
                </h3>
              </div>
              <span className="hint">
                <Bi en="Jupyter notebook + SSH, torn down on duration" ar="دفتر Jupyter + SSH، تُغلق عند انتهاء المدة" />
              </span>
            </div>

            <div className="pod-form-grid">
              {/* Provider */}
              <div className="pod-field">
                <label htmlFor="pod-provider" className="pod-label">
                  <Bi en="Provider" ar="المزود" />
                </label>
                <select
                  id="pod-provider"
                  className="select"
                  value={launch.providerId}
                  onChange={(e) => setLaunch((l) => ({ ...l, providerId: e.target.value }))}
                  disabled={!isLive}
                >
                  {noProviders && (
                    <option value="">{lang === 'ar' ? 'لا يوجد مزودون متصلون' : 'No online providers'}</option>
                  )}
                  {providers.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {displayGpuType(p.gpu_model)}
                      {p.vram_gb ? ` · ${p.vram_gb}GB` : ''}
                    </option>
                  ))}
                </select>
                <p className="pod-help">
                  <Bi en="Leave on the first option to auto-pick an available GPU." ar="اترك الخيار الأول للاختيار التلقائي لمعالج رسومات متاح." />
                </p>
              </div>

              {/* Duration */}
              <div className="pod-field">
                <label htmlFor="pod-duration" className="pod-label">
                  <Bi en="Duration" ar="المدة" />
                </label>
                <select
                  id="pod-duration"
                  className="select"
                  value={launch.durationMinutes}
                  onChange={(e) => setLaunch((l) => ({ ...l, durationMinutes: Number(e.target.value) }))}
                  disabled={!isLive}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="pod-help">
                  <Bi en="The pod is torn down automatically when the duration elapses. The full duration is charged upfront; an early stop refunds the difference." ar="تُغلق الحاوية تلقائيًا عند انتهاء المدة. تُحتسب المدة كاملة مسبقًا، ويُعاد الفرق عند الإيقاف المبكر." />
                </p>
                <p className="pod-help pod-help-reserved">
                  <Bi
                    en="Need 10–90 days for a long training run? Reserved capacity isn’t booked on demand — contact us at sales@dcp.sa for multi-day reserved GPUs."
                    ar="تحتاج إلى 10–90 يومًا لتدريب طويل؟ السعة المحجوزة لا تُحجز عند الطلب — تواصل معنا على sales@dcp.sa لحجز معالجات رسومات لعدة أيام."
                  />
                </p>
              </div>

              {/* Image */}
              <div className="pod-field pod-field-wide">
                <label htmlFor="pod-image" className="pod-label">
                  <Bi en="Image" ar="الصورة" />
                </label>
                <div className="pod-image-row">
                  <select
                    id="pod-image"
                    className="select"
                    value={launch.imageChoice}
                    onChange={(e) => onImageChoice(e.target.value)}
                    disabled={!isLive}
                  >
                    {IMAGE_PRESETS.map((img) => (
                      <option key={img.value} value={img.value}>
                        {lang === 'ar' ? img.labelAr : img.label}
                      </option>
                    ))}
                    <option value={CUSTOM_IMAGE_OPTION}>{lang === 'ar' ? 'مخصص…' : 'Custom…'}</option>
                  </select>
                  {isCustom && (
                    <input
                      id="pod-image-custom"
                      type="text"
                      className="input pod-mono-input"
                      value={launch.customImage}
                      onChange={(e) => onCustomImage(e.target.value)}
                      placeholder="e.g. tensorflow/tensorflow:latest-gpu"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!isLive}
                    />
                  )}
                </div>
                <p className="pod-help">
                  <Bi
                    en="Presets start fast with SSH ready. Custom images boot any Docker reference with SSH injected automatically."
                    ar="القوالب الجاهزة تبدأ بسرعة مع SSH. الصور المخصصة تشغّل أي مرجع Docker مع حقن SSH تلقائيًا."
                  />
                </p>
              </div>

              {/* Notebook token */}
              <div className="pod-field pod-field-wide">
                <label htmlFor="pod-token" className="pod-label">
                  <Bi en="Notebook token" ar="رمز الدفتر" />
                </label>
                <div className="pod-token-row">
                  <input
                    id="pod-token"
                    type="text"
                    className="input pod-mono-input"
                    value={launch.notebookToken}
                    onChange={(e) => setLaunch((l) => ({ ...l, notebookToken: e.target.value }))}
                    placeholder="strong token used to open Jupyter"
                    spellCheck={false}
                    autoComplete="off"
                    disabled={!isLive}
                  />
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={onRegenerate}
                    title="Generate a new token"
                    disabled={!isLive}
                  >
                    <Bi en="Regenerate" ar="توليد جديد" />
                  </button>
                </div>
                <p className="pod-help">
                  <Bi
                    en={`Used to authenticate your Jupyter session. Keep it private — at least ${MIN_TOKEN_LENGTH} characters.`}
                    ar={`يُستخدم للمصادقة على جلسة Jupyter. احتفظ به سريًا — ${MIN_TOKEN_LENGTH} حرفًا على الأقل.`}
                  />
                </p>
              </div>
            </div>

            {launch.error === 'insufficient_balance' ? (
              <div className="dash-state error" style={{ marginTop: '20px' }}>
                <b>
                  <Bi en="Insufficient balance" ar="رصيد غير كافٍ" />
                </b>
                <span>
                  <Bi en="Please " ar="يرجى " />
                  <Link href="/v2/renter/wallet">
                    <Bi en="top up your balance" ar="شحن رصيدك" />
                  </Link>
                  <Bi en=" first." ar=" أولًا." />
                </span>
              </div>
            ) : launch.error ? (
              <div className="dash-state error" style={{ marginTop: '20px' }}>
                <span>{launch.error}</span>
              </div>
            ) : null}

            <div className="action-row">
              <button
                type="button"
                className="btn-pri pod-launch-btn"
                onClick={submitLaunch}
                disabled={launch.submitting || noProviders || !isLive}
              >
                {launch.submitting && <span className="pod-spinner" aria-hidden="true" />}
                {launch.submitting ? (
                  <Bi en="Launching…" ar="جارٍ التشغيل…" />
                ) : (
                  <Bi en="Launch GPU pod" ar="تشغيل حاوية GPU" />
                )}
              </button>
              {noProviders && isLive && (
                <span className="hint">
                  <Bi en="No online providers are available right now." ar="لا يوجد مزودون متصلون متاحون حاليًا." />
                </span>
              )}
            </div>

            {/* ── One-time credentials reveal (shown ONCE per launch) ───── */}
            {reveal && (reveal.rootPassword || reveal.jupyterToken) && (
              <div className="pod-access" style={{ marginTop: '20px' }}>
                <div
                  className="dash-state"
                  style={{
                    borderColor: 'color-mix(in oklab, var(--teal) 40%, var(--hair))',
                    background: 'color-mix(in oklab, var(--teal) 4%, var(--paper))',
                  }}
                >
                  <b>
                    <Bi en="Save these credentials now" ar="احفظ بيانات الاعتماد الآن" />
                    {reveal.podId ? ` — Pod #${reveal.podId}` : ''}
                  </b>
                  <span>
                    <Bi
                      en="Shown only once. They are not stored and cannot be retrieved later — copy them before leaving this page."
                      ar="تُعرض مرة واحدة فقط. لا يتم تخزينها ولا يمكن استرجاعها لاحقًا — انسخها قبل مغادرة هذه الصفحة."
                    />
                  </span>
                </div>

                {reveal.rootPassword && (
                  <div className="pod-access-block">
                    <div className="pod-access-body">
                      <span className="pod-access-k">
                        <Bi en="Root password (SSH)" ar="كلمة مرور الجذر (SSH)" />
                      </span>
                      <code className="pod-access-ssh">{reveal.rootPassword}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-sec pod-copy"
                      onClick={() => copyText('reveal-root', reveal.rootPassword)}
                      aria-label="Copy root password"
                    >
                      {copied === 'reveal-root' ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                    </button>
                  </div>
                )}

                {reveal.jupyterToken && (
                  <div className="pod-access-block">
                    <div className="pod-access-body">
                      <span className="pod-access-k">
                        <Bi en="Jupyter token" ar="رمز Jupyter" />
                      </span>
                      <code className="pod-access-ssh">{reveal.jupyterToken}</code>
                    </div>
                    <button
                      type="button"
                      className="btn-sec pod-copy"
                      onClick={() => copyText('reveal-token', reveal.jupyterToken)}
                      aria-label="Copy Jupyter token"
                    >
                      {copied === 'reveal-token' ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                    </button>
                  </div>
                )}

                <div className="action-row">
                  <button type="button" className="btn-sec" onClick={() => setReveal(null)}>
                    <Bi en="Dismiss" ar="إخفاء" />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Pods list ──────────────────────────────────── */}
          <section className="panel pod-list-panel" style={{ marginTop: '28px' }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Your pods" ar="حاوياتك" />
                </h3>
              </div>
              <span className="hint">
                <Bi en={`${activePods} active · ${pods.length} total`} ar={`${activePods} نشطة · ${pods.length} إجمالي`} />
              </span>
            </div>

            {pods.length === 0 ? (
              <div className="pod-empty">
                <b>
                  <Bi en="No pods yet." ar="لا توجد حاويات بعد." />
                </b>
                <span>
                  <Bi
                    en="Launch a GPU pod above to get a Jupyter notebook and SSH access."
                    ar="شغّل حاوية GPU بالأعلى للحصول على دفتر Jupyter ووصول SSH."
                  />
                </span>
              </div>
            ) : (
              <div className="pod-rows">
                {pods.map((pod) => {
                  const id = String(pod.id)
                  const active = isActivePod(pod)
                  const accessReady = !!pod.access_url && active
                  const isCopiedSsh = copied === `ssh-${id}`
                  const submitted = formatSubmitted(pod)
                  return (
                    <article key={id} className={`pod-row${active ? ' on' : ' off'}`}>
                      <div className="pod-row-hd">
                        <div className="pod-row-id">
                          <span className="mono">Pod #{id}</span>
                          <span className={`stat ${statusClass(pod.status)}`}>{pod.status}</span>
                        </div>
                        <div className="pod-row-meta">
                          {/* GPU TYPE only — never a machine name or provider id. */}
                          {pod.gpu_type ? `${displayGpuType(pod.gpu_type)} · ` : ''}
                          {formatDuration(pod.duration_minutes)}
                          {submitted ? ` · ${submitted}` : ''}
                        </div>
                        {active && (
                          <button
                            type="button"
                            className="btn-sec danger pod-stop"
                            onClick={() => stopPod(pod)}
                            disabled={!!stopping[id]}
                            aria-label={`Stop pod ${id}`}
                          >
                            {stopping[id] && <span className="pod-spinner dark" aria-hidden="true" />}
                            {stopping[id] ? <Bi en="Stopping…" ar="جارٍ الإيقاف…" /> : <Bi en="Stop" ar="إيقاف" />}
                          </button>
                        )}
                      </div>

                      {pod.status === 'running' && typeof pod.seconds_remaining === 'number' && (() => {
                        // live countdown: recompute from ends_at every tick (nowTick drives re-render)
                        void nowTick
                        const left = pod.ends_at
                          ? Math.max(0, Math.round((Date.parse(pod.ends_at) - Date.now()) / 1000))
                          : pod.seconds_remaining
                        const ending = left <= 300
                        return (
                          <div className={`pod-clock${ending ? ' warn' : ''}`}>
                            <span className="pod-clock-t">
                              {ending ? '⚠ ' : ''}
                              <Bi en="Rental ends in" ar="ينتهي الإيجار خلال" /> <b>{formatCountdown(left)}</b>
                            </span>
                            <span className="pod-clock-sub">
                              {ending
                                ? <Bi en="Save anything outside /workspace now — /workspace is kept and reattaches to your next pod." ar="احفظ أي شيء خارج /workspace الآن — يُحتفظ بـ /workspace ويُعاد ربطه بحاويتك التالية." />
                                : <Bi en="/workspace is saved and reattaches to your next pod." ar="يُحفظ /workspace ويُعاد ربطه بحاويتك التالية." />}
                            </span>
                            <div className="pod-extend">
                              <span className="pod-extend-lbl"><Bi en="Extend" ar="تمديد" /></span>
                              {[30, 60, 120].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  className="pod-extend-btn"
                                  disabled={!!extending[id]}
                                  onClick={() => extendPod(pod, mins)}
                                >
                                  {mins >= 60 ? `+${mins / 60}h` : `+${mins}m`}
                                </button>
                              ))}
                              {extending[id] && <span className="pod-extend-msg"><Bi en="charging…" ar="جارٍ الخصم…" /></span>}
                              {!extending[id] && extendMsg[id] && <span className="pod-extend-msg">{extendMsg[id]}</span>}
                            </div>
                          </div>
                        )
                      })()}

                      {accessReady ? (
                        <div className="pod-access">
                          <div className="pod-access-block">
                            <div className="pod-access-body">
                              <span className="pod-access-k">
                                <Bi en="Jupyter notebook" ar="دفتر Jupyter" />
                              </span>
                              <a
                                className="pod-access-url"
                                href={pod.access_url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {pod.access_url}
                              </a>
                            </div>
                            <a
                              className="btn-pri pod-open"
                              href={pod.access_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Bi en="Open →" ar="فتح →" />
                            </a>
                          </div>

                          {pod.ssh_command && (
                            <div className="pod-access-block">
                              <div className="pod-access-body">
                                <span className="pod-access-k">
                                  <Bi en="SSH" ar="SSH" />
                                </span>
                                <code className="pod-access-ssh">{pod.ssh_command}</code>
                              </div>
                              <button
                                type="button"
                                className="btn-sec pod-copy"
                                onClick={() => copyText(`ssh-${id}`, pod.ssh_command as string)}
                                aria-label="Copy SSH command"
                              >
                                {isCopiedSsh ? <Bi en="✓ Copied" ar="✓ نُسخ" /> : <Bi en="Copy" ar="نسخ" />}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : active ? (
                        <div className="pod-provisioning">
                          <span className="pod-spinner" aria-hidden="true" />
                          <Bi
                            en="Provisioning your pod… endpoints appear here once it's ready."
                            ar="جارٍ تجهيز حاويتك… ستظهر نقاط الوصول هنا عند الجاهزية."
                          />
                        </div>
                      ) : (
                        <div className="pod-inactive">
                          <Bi en="This pod is no longer running." ar="هذه الحاوية لم تعد قيد التشغيل." />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
