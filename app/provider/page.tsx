'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../components/layout/DashboardLayout'
import StatusBadge from '../components/ui/StatusBadge'
import StatCard from '../components/ui/StatCard'
import { useLanguage } from '../lib/i18n'
import ProviderWizard from './components/ProviderWizard'
import ProviderActivationCard from './components/ProviderActivationCard'
import InstallCommandPanel from './components/InstallCommandPanel'
import { getProviderActivationNarrative } from '../lib/provider-activation-narrative'
import {
  buildProviderTroubleshootingHref,
  getProviderOnboardingStep,
  ProviderNextActionState,
} from '../lib/provider-install'
import { trackProviderInstallEvent } from '../lib/provider-install-telemetry'

interface ProviderData {
  id: string
  name: string
  status: 'online' | 'offline'
  todayEarnings: number
  weekEarnings: number
  totalEarnings: number
  jobsCompleted: number
  gpuUptime: number
  gpuModel: string
  vramMb: number
  gpuCount: number
  supportedComputeTypes: Array<'inference' | 'training' | 'rendering'>
  gpuProfileSource: 'manual' | 'daemon'
  autoDetected: boolean
  temperature: number
  gpuUsage: number
  vramUsage: number
  isPaused: boolean
  lastHeartbeat: string
  daemonVersion: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  rejectedReason: string
  activeJob?: {
    id: string
    jobType: string
    status: string
    startTime: string
  }
  recentJobs: Array<{
    id: string
    jobType: string
    duration: number
    earnings: number
    status: 'completed' | 'failed'
    completedAt: string
  }>
}

interface DaemonVersionInfo {
  version: string
  download_url: string
  changelog?: string
}

type NativeAppOs = 'windows' | 'linux' | 'macos' | 'unknown'

const GPU_MODEL_PRESETS = ['RTX 3060 Ti', 'RTX 3080', 'RTX 4090', 'A100', 'H100']
const COMPUTE_TYPES: Array<'inference' | 'training' | 'rendering'> = ['inference', 'training', 'rendering']
const isComputeType = (value: string): value is 'inference' | 'training' | 'rendering' =>
  COMPUTE_TYPES.includes(value as 'inference' | 'training' | 'rendering')

// SVG Icon components
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 5v14a1 1 0 001 1h12a1 1 0 001-1V5m-9 9h4" />
  </svg>
)

const LightningIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const CurrencyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

// Provider nav items
const GpuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6M9 8h6" />
  </svg>
)

const FleetIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

// Temperature gauge color
const getTempColor = (temp: number): string => {
  if (temp < 70) return 'bg-status-success'
  if (temp < 80) return 'bg-status-warning'
  return 'bg-status-error'
}

const compareVersions = (v1: string, v2: string): number => {
  const p1 = (v1 || '0').split('.').map((part) => Number(part) || 0)
  const p2 = (v2 || '0').split('.').map((part) => Number(part) || 0)
  const maxLen = Math.max(p1.length, p2.length)
  for (let i = 0; i < maxLen; i += 1) {
    const a = p1[i] || 0
    const b = p2[i] || 0
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

function ProviderDashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, isRTL } = useLanguage()
  const activationNarrative = getProviderActivationNarrative(isRTL)
  const [providerData, setProviderData] = useState<ProviderData | null>(null)
  const [latestDaemon, setLatestDaemon] = useState<DaemonVersionInfo | null>(null)
  const [providerApiKey, setProviderApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [detectedNativeAppOs, setDetectedNativeAppOs] = useState<NativeAppOs>('unknown')
  const [gpuProfileDraft, setGpuProfileDraft] = useState({
    gpuModel: '',
    vramMb: 4096,
    gpuCount: 1,
    supportedComputeTypes: ['inference'] as Array<'inference' | 'training' | 'rendering'>,
  })

  const getNavItems = () => [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]
  const [togglingPause, setTogglingPause] = useState(false)
  const [dailyEarnings, setDailyEarnings] = useState<Array<{ day: string; earned_halala: number; completed: number }>>([])

  const toggleComputeType = (computeType: 'inference' | 'training' | 'rendering') => {
    setGpuProfileDraft((prev) => {
      if (prev.supportedComputeTypes.includes(computeType)) {
        const next = prev.supportedComputeTypes.filter((item) => item !== computeType)
        return {
          ...prev,
          supportedComputeTypes: next.length > 0 ? next : prev.supportedComputeTypes,
        }
      }
      return {
        ...prev,
        supportedComputeTypes: [...prev.supportedComputeTypes, computeType],
      }
    })
  }


  const handlePauseResume = async () => {
    if (!providerData) return
    const apiKey = localStorage.getItem('dc1_provider_key')
    if (!apiKey) return
    const API_BASE = '/api'
    const endpoint = providerData.isPaused ? 'resume' : 'pause'
    setTogglingPause(true)
    try {
      const res = await fetch(`${API_BASE}/providers/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
      })
      if (res.ok) {
        const data = await res.json()
        setProviderData({
          ...providerData,
          isPaused: endpoint === 'pause',
          status: data.status === 'online' || data.status === 'idle' ? 'online' : 'offline',
        })
      }
    } catch (err) {
      console.error('Pause/resume failed:', err)
    } finally {
      setTogglingPause(false)
    }
  }

  const handleSaveGpuProfile = async () => {
    if (!providerApiKey) return
    setProfileSaving(true)
    setProfileError('')
    setProfileSaved(false)
    try {
      const API_BASE = '/api'
      const res = await fetch(`${API_BASE}/providers/me/gpu-profile?key=${encodeURIComponent(providerApiKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gpu_model: gpuProfileDraft.gpuModel.trim(),
          vram_mb: gpuProfileDraft.vramMb,
          gpu_count: gpuProfileDraft.gpuCount,
          supported_compute_types: gpuProfileDraft.supportedComputeTypes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || t('common.error'))
      }
      setProviderData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          gpuModel: data?.profile?.gpu_model || gpuProfileDraft.gpuModel,
          vramMb: Number(data?.profile?.vram_mb || gpuProfileDraft.vramMb),
          gpuCount: Number(data?.profile?.gpu_count || gpuProfileDraft.gpuCount),
          supportedComputeTypes: Array.isArray(data?.profile?.supported_compute_types)
            ? data.profile.supported_compute_types
            : gpuProfileDraft.supportedComputeTypes,
          gpuProfileSource: 'manual',
          autoDetected: false,
        }
      })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2400)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setProfileSaving(false)
    }
  }

  useEffect(() => {
    const platform = window.navigator.platform.toLowerCase()
    if (platform.includes('win')) {
      setDetectedNativeAppOs('windows')
      return
    }
    if (platform.includes('mac')) {
      setDetectedNativeAppOs('macos')
      return
    }
    if (platform.includes('linux')) {
      setDetectedNativeAppOs('linux')
      return
    }
    setDetectedNativeAppOs('unknown')
  }, [])

  useEffect(() => {
    const fetchLatestDaemonVersion = async () => {
      try {
        const API_BASE = '/api'
        const res = await fetch(`${API_BASE}/daemon/latest-version`)
        if (!res.ok) return
        const data = await res.json()
        if (!data?.version) return
        setLatestDaemon({
          version: String(data.version),
          download_url: String(data.download_url || '/api/providers/download/daemon'),
          changelog: typeof data.changelog === 'string' ? data.changelog : undefined,
        })
      } catch {
        // Non-blocking for dashboard rendering
      }
    }

    fetchLatestDaemonVersion()
  }, [])

  useEffect(() => {
    const API_BASE = '/api'

    const redirectToLogin = (reason: 'missing_credentials' | 'invalid_credentials' | 'expired_session') => {
      router.push(`/login?role=provider&method=apikey&reason=${reason}`)
    }

    const initializeDashboard = async () => {
      // Auth key resolution order:
      //   1. ?key=… query-string param (covers welcome-email "View dashboard"
      //      links: /provider?key=dcp-provider-xxx). Persist to localStorage
      //      so the URL can be cleaned up + reloads stay authed.
      //   2. localStorage (existing session).
      //   3. Redirect to /login if neither is present.
      // Bug fixed 2026-05-21: previously only checked localStorage, so the
      // welcome-email link landed the user on /login despite carrying a
      // valid key in the URL.
      const urlKey = searchParams?.get('key') || null
      let apiKey: string | null = null
      if (urlKey && /^(dcp|dc1)-provider-[a-z0-9]+/i.test(urlKey)) {
        apiKey = urlKey
        try {
          localStorage.setItem('dc1_provider_key', urlKey)
          // Strip ?key= from the URL so it stops appearing in shared
          // screenshots / referer headers. localStorage already has it.
          const cleanUrl = window.location.pathname + window.location.hash
          window.history.replaceState({}, '', cleanUrl)
        } catch (_) {
          // localStorage / history may be unavailable in restricted
          // contexts (private browsing); we still continue with apiKey
          // captured in-memory.
        }
      }
      if (!apiKey) {
        apiKey = localStorage.getItem('dc1_provider_key')
      }
      if (!apiKey) {
        redirectToLogin('missing_credentials')
        return
      }
      setProviderApiKey(apiKey)
      setLoadError('')

      try {
        // Fetch real provider data from VPS
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          const rawError = String(payload?.error || '').toLowerCase()
          const reason = (res.status === 401 || res.status === 403)
            ? (rawError.includes('expired') || rawError.includes('session') ? 'expired_session' : 'invalid_credentials')
            : 'invalid_credentials'
          // Invalid key — clear and redirect
          localStorage.removeItem('dc1_provider_key')
          redirectToLogin(reason)
          return
        }

        const data = await res.json()
        const provider = data.provider || {}
        const supportedComputeTypes = Array.isArray(provider.supported_compute_types)
          ? provider.supported_compute_types.filter((item: string) => isComputeType(item))
          : ['inference']
        const vramMb = Number(provider.vram_mb || provider.gpu_vram_mb || 0)
        const gpuCount = Number(provider.gpu_count || provider.gpu_count_reported || 1)

        // Map real data to ProviderData shape, filling gaps with defaults
        setProviderData({
          id: String(provider.id || ''),
          name: provider.name || 'Provider',
          status: provider.status === 'online' || provider.status === 'idle' ? 'online' : 'offline',
          isPaused: Boolean(provider.is_paused),
          lastHeartbeat: provider.last_heartbeat || '',
          daemonVersion: provider.daemon_version || '',
          approvalStatus: provider.approval_status || 'pending',
          rejectedReason: provider.rejected_reason || '',
          todayEarnings: (provider.today_earnings_halala || 0) / 100,
          weekEarnings: (provider.week_earnings_halala || 0) / 100,
          totalEarnings: (provider.total_earnings_halala || 0) / 100,
          jobsCompleted: provider.total_jobs || 0,
          gpuUptime: provider.uptime_percent || 0,
          gpuModel: provider.gpu_model || 'Unknown GPU',
          vramMb: Number.isFinite(vramMb) && vramMb > 0 ? vramMb : 4096,
          gpuCount: Number.isFinite(gpuCount) && gpuCount > 0 ? gpuCount : 1,
          supportedComputeTypes: supportedComputeTypes.length > 0 ? supportedComputeTypes : ['inference'],
          gpuProfileSource: provider.gpu_profile_source === 'daemon' ? 'daemon' : 'manual',
          autoDetected: Boolean(provider.auto_detected),
          temperature: provider.gpu_temp || 0,
          gpuUsage: provider.gpu_usage || 0,
          vramUsage: provider.vram_usage || 0,
          activeJob: provider.active_job ? {
            id: provider.active_job.job_id,
            jobType: provider.active_job.job_type,
            status: provider.active_job.status,
            startTime: provider.active_job.started_at || '',
          } : undefined,
          recentJobs: (data.recent_jobs || []).map((j: any) => ({
            id: j.job_id || String(j.id),
            jobType: j.job_type || 'Unknown',
            duration: j.actual_duration_minutes || 0,
            earnings: (j.provider_earned_halala || 0) / 100,
            status: j.status === 'completed' ? 'completed' : 'failed',
            completedAt: j.completed_at || '',
          })),
        })
        setGpuProfileDraft({
          gpuModel: provider.gpu_model || '',
          vramMb: Number.isFinite(vramMb) && vramMb > 0 ? vramMb : 4096,
          gpuCount: Number.isFinite(gpuCount) && gpuCount > 0 ? gpuCount : 1,
          supportedComputeTypes: supportedComputeTypes.length > 0 ? supportedComputeTypes : ['inference'],
        })
        // Fetch daily earnings for chart
        try {
          const dailyRes = await fetch(`${API_BASE}/providers/earnings-daily?key=${encodeURIComponent(apiKey)}&days=7`)
          if (dailyRes.ok) {
            const dailyData = await dailyRes.json()
            setDailyEarnings(dailyData.daily || [])
          }
        } catch { /* ignore chart data failure */ }
      } catch (error) {
        console.error('Failed to load provider data:', error)
        setLoadError(t('auth.error.network'))
      } finally {
        setLoading(false)
      }
    }

    initializeDashboard()
    const interval = setInterval(initializeDashboard, 30000)
    return () => clearInterval(interval)
  }, [router, t])

  useEffect(() => {
    if (!providerData || !providerApiKey) return
    const alreadyCompleted = localStorage.getItem('wizard_completed') === 'true'
    const shouldShowWizard = providerData.jobsCompleted === 0 && !providerData.lastHeartbeat && !alreadyCompleted
    if (shouldShowWizard) {
      setShowWizard(true)
    }
  }, [providerApiKey, providerData])

  const daemonNeedsUpdate = Boolean(
    latestDaemon?.version &&
    (!providerData?.daemonVersion || compareVersions(providerData.daemonVersion, latestDaemon.version) < 0)
  )
  const daemonStatusLabel = daemonNeedsUpdate
    ? t('provider.daemon_update')
        .replace('{current}', providerData?.daemonVersion ? `v${providerData.daemonVersion}` : 'unknown')
        .replace('{latest}', latestDaemon?.version ? `v${latestDaemon.version}` : 'latest')
    : t('provider.daemon_current').replace('{version}', latestDaemon?.version ? `v${latestDaemon.version}` : (providerData?.daemonVersion ? `v${providerData.daemonVersion}` : '—'))

  const daemonDownloadUrl = (() => {
    if (!providerApiKey) return ''
    const base = latestDaemon?.download_url || '/api/providers/download/daemon'
    const separator = base.includes('?') ? '&' : '?'
    return `${base}${separator}key=${encodeURIComponent(providerApiKey)}`
  })()
  const selectedVramGb = Math.max(4, Math.min(80, Math.round((gpuProfileDraft.vramMb || 4096) / 1024)))
  const computeTypeLabel = (value: 'inference' | 'training' | 'rendering') => t(`provider.compute_${value}`)
  const nativeStatusAppDownloads: Array<{
    id: Exclude<NativeAppOs, 'unknown'>
    label: string
    details: string
    href: string
  }> = [
    {
      id: 'windows',
      label: 'Windows Tray App',
      details: 'Best for Windows 10/11 hosts. Launches as a tray process.',
      href: '/api/providers/download/tray-windows',
    },
    {
      id: 'linux',
      label: 'Linux Tray App',
      details: 'Desktop tray helper for Ubuntu and other Linux distributions.',
      href: '/api/providers/download/tray-linux',
    },
    {
      id: 'macos',
      label: 'macOS Menubar App',
      details: 'Native status indicator for macOS menu bar.',
      href: '/api/providers/download/tray-mac',
    },
  ]
  const detectedNativeAppLabel = detectedNativeAppOs === 'windows'
    ? 'Windows'
    : detectedNativeAppOs === 'linux'
      ? 'Linux'
      : detectedNativeAppOs === 'macos'
        ? 'macOS'
        : 'Unknown'

  if (loading) {
    return (
      <DashboardLayout navItems={getNavItems()} role="provider" userName="Provider">
        <div className="space-y-6">
          <div className="h-8 w-48 bg-dc1-surface-l2 rounded skeleton" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-dc1-surface-l2 rounded skeleton" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!providerData) {
    return (
      <DashboardLayout navItems={getNavItems()} role="provider" userName="Provider">
        <div className="card">
          <p className="text-dc1-text-secondary">{t('provider.failed_load')}</p>
          {loadError && (
            <p className="text-status-error text-sm mt-3">{loadError}</p>
          )}
        </div>
      </DashboardLayout>
    )
  }

  // Daemon-pending = no heartbeat has ever arrived. We treat this as the
  // "status === 'pending'" guard from the onboarding bundle: the install
  // command panel is the FIRST widget the user sees until their daemon
  // checks in (then it auto-hides). Independent from the approval-status
  // pending banner above, which is moderation-related.
  const daemonPending = !providerData.lastHeartbeat

  return (
    <DashboardLayout navItems={getNavItems()} role="provider" userName={providerData.name}>
      <div className="space-y-8">
        {/* Install command panel — surfaced first when no daemon has ever
            heartbeated, hidden as soon as the dashboard sees a heartbeat. */}
        {daemonPending && providerApiKey && (
          <InstallCommandPanel apiKey={providerApiKey} />
        )}
        {providerData.approvalStatus === 'pending' && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100 text-sm">
            {t('provider.pending_approval')}
          </div>
        )}
        {providerData.approvalStatus === 'rejected' && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-100 text-sm">
            {t('provider.rejected').replace('{reason}', providerData.rejectedReason || 'No reason provided')}
          </div>
        )}

        {/* Activate Your GPU banner — shown when approved but offline (DCP-963) */}
        {providerData.approvalStatus === 'approved' && providerData.status === 'offline' && (
          (() => {
            const onboardingState: ProviderNextActionState = providerData.isPaused
              ? 'paused'
              : !providerData.lastHeartbeat
                ? 'waiting'
                : providerData.status === 'offline'
                  ? 'stale'
                  : providerData.jobsCompleted > 0
                    ? 'ready'
                    : 'heartbeat'
            const troubleshootingHref = buildProviderTroubleshootingHref(onboardingState)
            const supportHref = `/support?category=provider_install&source=provider_dashboard_banner&state=${onboardingState}#contact-form`
            const onboardingStep = getProviderOnboardingStep(onboardingState)

            return (
          <div className="rounded-2xl border-2 border-dc1-amber/50 bg-gradient-to-br from-dc1-amber/10 to-dc1-amber/5 p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="text-4xl select-none">⚡</div>
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-dc1-amber">{activationNarrative.headline}</h2>
                  <p className="text-sm text-dc1-text-secondary mt-1">
                    {activationNarrative.subheadline}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Link
                    href="/provider/download"
                    className="flex items-start gap-3 rounded-xl border border-dc1-amber/30 bg-dc1-surface-l2 px-4 py-3 hover:border-dc1-amber/60 transition-colors group"
                    onClick={() =>
                      trackProviderInstallEvent('provider_install_cta_clicked', {
                        source_page: 'provider_dashboard',
                        surface: 'activation_banner_step',
                        destination: '/provider/download',
                        locale: isRTL ? 'ar' : 'en',
                        cta_tier: 'primary',
                        next_action_state: onboardingState,
                        step: onboardingStep,
                        has_provider_key: Boolean(providerApiKey),
                      })
                    }
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dc1-amber/20 text-dc1-amber font-bold text-sm group-hover:bg-dc1-amber/30 transition-colors">1</span>
                    <div>
                      <p className="text-sm font-semibold text-dc1-text-primary">{t('provider.install_banner.step1_title')}</p>
                      <p className="text-xs text-dc1-text-muted mt-0.5">{t('provider.install_banner.step1_desc')}</p>
                    </div>
                  </Link>
                  <Link
                    href="/provider/gpu"
                    className="flex items-start gap-3 rounded-xl border border-dc1-amber/30 bg-dc1-surface-l2 px-4 py-3 hover:border-dc1-amber/60 transition-colors group"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dc1-amber/20 text-dc1-amber font-bold text-sm group-hover:bg-dc1-amber/30 transition-colors">2</span>
                    <div>
                      <p className="text-sm font-semibold text-dc1-text-primary">{t('provider.install_banner.step2_title')}</p>
                      <p className="text-xs text-dc1-text-muted mt-0.5">{t('provider.install_banner.step2_desc')}</p>
                    </div>
                  </Link>
                  <div className="flex items-start gap-3 rounded-xl border border-dc1-border bg-dc1-surface-l2 px-4 py-3 opacity-60">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dc1-surface-l3 text-dc1-text-muted font-bold text-sm">3</span>
                    <div>
                      <p className="text-sm font-semibold text-dc1-text-secondary">{t('provider.install_banner.step3_title')}</p>
                      <p className="text-xs text-dc1-text-muted mt-0.5">{t('provider.install_banner.step3_desc')}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href="/provider/download"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      trackProviderInstallEvent('provider_install_cta_clicked', {
                        source_page: 'provider_dashboard',
                        surface: 'activation_banner',
                        destination: '/provider/download',
                        locale: isRTL ? 'ar' : 'en',
                        cta_tier: 'primary',
                        next_action_state: onboardingState,
                        step: onboardingStep,
                        has_provider_key: Boolean(providerApiKey),
                      })
                    }
                  >
                    {t('provider.install_banner.primary_cta')}
                  </Link>
                  <Link
                    href={troubleshootingHref}
                    className="text-sm text-dc1-amber underline underline-offset-2 hover:text-dc1-amber/80"
                    onClick={() =>
                      trackProviderInstallEvent('provider_install_cta_clicked', {
                        source_page: 'provider_dashboard',
                        surface: 'activation_banner',
                        destination: troubleshootingHref,
                        locale: isRTL ? 'ar' : 'en',
                        cta_tier: 'secondary',
                        next_action_state: onboardingState,
                        step: onboardingStep,
                        has_provider_key: Boolean(providerApiKey),
                      })
                    }
                  >
                    {t('register.provider.status_matrix.guide_cta')}
                  </Link>
                  <Link
                    href={supportHref}
                    className="text-sm text-dc1-amber underline underline-offset-2 hover:text-dc1-amber/80"
                    onClick={() =>
                      trackProviderInstallEvent('provider_install_cta_clicked', {
                        source_page: 'provider_dashboard',
                        surface: 'activation_banner',
                        destination: supportHref,
                        locale: isRTL ? 'ar' : 'en',
                        cta_tier: 'secondary',
                        next_action_state: onboardingState,
                        step: onboardingStep,
                        has_provider_key: Boolean(providerApiKey),
                      })
                    }
                  >
                    {t('register.provider.next_action_support_cta')}
                  </Link>
                </div>
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
                  <p className="text-xs font-semibold text-dc1-text-primary mb-1">{activationNarrative.assumptionsTitle}</p>
                  <ul className="space-y-1 text-xs text-dc1-text-muted">
                    {activationNarrative.assumptions.map((assumption) => (
                      <li key={assumption}>• {assumption}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
            )
          })()
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">{t('provider.dashboard')}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={providerData.isPaused ? 'paused' : providerData.status} />
            <button
              onClick={handlePauseResume}
              disabled={togglingPause}
              className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                providerData.isPaused
                  ? 'bg-status-success/20 text-status-success hover:bg-status-success/30 border border-status-success/30'
                  : 'bg-status-warning/20 text-status-warning hover:bg-status-warning/30 border border-status-warning/30'
              }`}
            >
              {togglingPause ? t('provider.updating') : providerData.isPaused ? t('provider.resume_gpu') : t('provider.pause_gpu')}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-dc1-amber/20 bg-dc1-surface-l2 p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">{t('register.provider.next_action_title')}</p>
          <p className="text-sm text-dc1-text-secondary mb-3">{t('register.provider.status_auto_update')}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <Link href="/setup" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              1. {t('register.provider.install_title')}
            </Link>
            <Link href="/provider/download" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              2. {t('register.provider.state.heartbeat.label')}
            </Link>
            <Link href="/provider/jobs" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              3. {t('register.provider.state.ready.label')}
            </Link>
            <Link href="/provider/earnings" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              4. {t('nav.earnings')}
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-dc1-text-primary">Native Status App</h2>
              <p className="text-sm text-dc1-text-secondary mt-1">{t('provider.native_helper')}</p>
            </div>
            <span className="text-xs font-semibold rounded-full border border-dc1-amber/40 bg-dc1-amber/10 px-3 py-1 text-dc1-amber">
              Detected OS: {detectedNativeAppLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {nativeStatusAppDownloads.map((download) => {
              const isRecommended = detectedNativeAppOs === download.id
              return (
                <a
                  key={download.id}
                  href={download.href}
                  className={`rounded-xl border p-4 transition-colors ${
                    isRecommended
                      ? 'border-dc1-amber bg-dc1-amber/10'
                      : 'border-dc1-border bg-dc1-surface-l2 hover:border-dc1-amber/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-dc1-text-primary">{download.label}</p>
                    {isRecommended && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dc1-amber">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-dc1-text-muted">{download.details}</p>
                  <p className="mt-3 text-xs font-semibold text-dc1-amber">Download</p>
                </a>
              )
            })}
          </div>
        </div>

        {/* Provider activation onboarding — DCP-679 3-screen flow */}
        {providerData.status === 'offline' && providerData.jobsCompleted === 0 && !providerData.lastHeartbeat && (
          <ProviderActivationCard
            providerId={providerData.id}
            apiKey={providerApiKey}
            onComplete={() => {
              setProviderData((prev) => {
                if (!prev) return prev
                return { ...prev, lastHeartbeat: new Date().toISOString() }
              })
            }}
          />
        )}

        {latestDaemon && (
          daemonNeedsUpdate ? (
            <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-status-warning">{daemonStatusLabel}</p>
              {daemonDownloadUrl && (
                <a
                  href={daemonDownloadUrl}
                  className="text-sm font-semibold text-dc1-amber hover:underline"
                >
                  {t('provider.download_update')}
                </a>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30">
              {daemonStatusLabel}
            </div>
          )
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label={t('provider.today_earnings')}
            value={`${providerData.todayEarnings.toFixed(2)} ${t('common.sar')}`}
            accent="amber"
            icon={<CurrencyIcon />}
          />
          <StatCard
            label={t('provider.this_week')}
            value={`${providerData.weekEarnings.toFixed(2)} ${t('common.sar')}`}
            accent="info"
            icon={<CurrencyIcon />}
          />
          <StatCard
            label={t('provider.total_earnings')}
            value={`${providerData.totalEarnings.toFixed(2)} ${t('common.sar')}`}
            accent="success"
            icon={<CurrencyIcon />}
          />
          <StatCard
            label={t('provider.jobs_completed')}
            value={providerData.jobsCompleted}
            accent="default"
            icon={<LightningIcon />}
          />
          <StatCard
            label={t('provider.gpu_uptime')}
            value={`${providerData.gpuUptime}%`}
            accent="info"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="section-heading">{t('provider.gpu_profile')}</h2>
            {providerData.autoDetected && (
              <span className="inline-flex items-center rounded-full border border-status-info/40 bg-status-info/15 px-3 py-1 text-xs font-semibold text-status-info">
                {t('provider.auto_detected')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3">
              <p className="text-xs text-dc1-text-muted mb-1">{t('provider.gpu_model')}</p>
              <p className="text-sm font-semibold text-dc1-text-primary">{providerData.gpuModel}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3">
              <p className="text-xs text-dc1-text-muted mb-1">{t('provider.vram')}</p>
              <p className="text-sm font-semibold text-dc1-text-primary">{Math.max(1, Math.round(providerData.vramMb / 1024))} GB</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3">
              <p className="text-xs text-dc1-text-muted mb-1">{t('provider.gpu_count')}</p>
              <p className="text-sm font-semibold text-dc1-text-primary">{providerData.gpuCount}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3">
              <p className="text-xs text-dc1-text-muted mb-1">{t('provider.compute_types')}</p>
              <p className="text-sm font-semibold text-dc1-text-primary">
                {(providerData.supportedComputeTypes || []).map((item) => computeTypeLabel(item)).join(' · ')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label htmlFor="provider-gpu-model" className="block text-sm font-medium text-dc1-text-secondary mb-2">
                {t('provider.gpu_model')}
              </label>
              <input
                id="provider-gpu-model"
                list="provider-gpu-presets"
                value={gpuProfileDraft.gpuModel}
                onChange={(event) => setGpuProfileDraft((prev) => ({ ...prev, gpuModel: event.target.value }))}
                className="w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 text-dc1-text-primary focus:outline-none focus:border-dc1-amber"
                placeholder="RTX 4090"
              />
              <datalist id="provider-gpu-presets">
                {GPU_MODEL_PRESETS.map((model) => <option key={model} value={model} />)}
              </datalist>
            </div>

            <div>
              <p className="block text-sm font-medium text-dc1-text-secondary mb-2">{t('provider.gpu_count')}</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 4, 8].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setGpuProfileDraft((prev) => ({ ...prev, gpuCount: count }))}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      gpuProfileDraft.gpuCount === count
                        ? 'border-dc1-amber bg-dc1-amber/20 text-dc1-amber'
                        : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:border-dc1-amber/60'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-dc1-text-secondary">{t('provider.vram')}</p>
              <span className="text-sm font-semibold text-dc1-text-primary">{selectedVramGb} GB</span>
            </div>
            <input
              type="range"
              min={4}
              max={80}
              step={4}
              value={selectedVramGb}
              onChange={(event) => {
                const nextGb = Number(event.target.value)
                setGpuProfileDraft((prev) => ({ ...prev, vramMb: nextGb * 1024 }))
              }}
              className="w-full accent-dc1-amber"
            />
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-dc1-text-secondary mb-3">{t('provider.compute_types')}</p>
            <div className="flex items-center gap-3 flex-wrap">
              {COMPUTE_TYPES.map((computeType) => (
                <label key={computeType} className="inline-flex items-center gap-2 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gpuProfileDraft.supportedComputeTypes.includes(computeType)}
                    onChange={() => toggleComputeType(computeType)}
                    className="accent-dc1-amber"
                  />
                  <span className="text-sm text-dc1-text-primary">{computeTypeLabel(computeType)}</span>
                </label>
              ))}
            </div>
          </div>

          {profileError && (
            <p className="mt-4 text-sm text-status-error">{profileError}</p>
          )}
          {profileSaved && (
            <p className="mt-4 text-sm text-status-success">{t('provider.profile_saved')}</p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSaveGpuProfile}
              disabled={profileSaving}
              className="rounded-lg bg-dc1-amber text-dc1-void px-4 py-2 min-h-[44px] font-semibold hover:bg-dc1-amber/90 disabled:opacity-60"
            >
              {profileSaving ? t('provider.updating') : t('provider.save_profile')}
            </button>
          </div>
        </div>

        {/* GPU Health Section */}
        <div className="card">
          <h2 className="section-heading mb-6">{t('provider.gpu_health')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* GPU Model */}
            <div>
              <p className="text-sm text-dc1-text-secondary mb-2">{t('provider.gpu_model')}</p>
              <p className="text-lg font-semibold text-dc1-text-primary">{providerData.gpuModel}</p>
            </div>

            {/* Temperature Gauge */}
            <div>
              <p className="text-sm text-dc1-text-secondary mb-2">{t('provider.temperature')}</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-dc1-surface-l2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getTempColor(providerData.temperature)} transition-all`}
                      style={{ width: `${Math.min(providerData.temperature, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-dc1-text-primary w-12 text-right">
                  {providerData.temperature}°C
                </span>
              </div>
            </div>

            {/* Daemon Connection */}
            <div>
              <p className="text-sm text-dc1-text-secondary mb-2">{t('provider.daemon_status')}</p>
              {(() => {
                const hb = providerData.lastHeartbeat
                const isConnected = hb ? (Date.now() - new Date(hb).getTime()) < 120000 : false
                const isStale = hb ? (Date.now() - new Date(hb).getTime()) < 300000 : false
                return (
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-status-success animate-pulse' : isStale ? 'bg-status-warning' : 'bg-status-error'}`} />
                    <span className="text-sm font-medium text-dc1-text-primary">
                      {isConnected ? t('provider.connected') : isStale ? t('provider.stale') : t('provider.disconnected')}
                    </span>
                    {providerData.daemonVersion && (
                      <span className="text-xs text-dc1-text-muted ms-1">v{providerData.daemonVersion}</span>
                    )}
                  </div>
                )
              })()}
              {providerData.lastHeartbeat && (
                <p className="text-xs text-dc1-text-muted mt-1">
                  {t('provider.last_seen')}: {new Date(providerData.lastHeartbeat).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Usage Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-dc1-border">
            {/* GPU Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-dc1-text-secondary">{t('provider.gpu_usage')}</p>
                <span className="text-sm font-semibold text-dc1-text-primary">{providerData.gpuUsage}%</span>
              </div>
              <div className="h-2 bg-dc1-surface-l2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-dc1-amber transition-all"
                  style={{ width: `${providerData.gpuUsage}%` }}
                />
              </div>
            </div>

            {/* VRAM Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-dc1-text-secondary">{t('provider.vram_usage')}</p>
                <span className="text-sm font-semibold text-dc1-text-primary">{providerData.vramUsage}%</span>
              </div>
              <div className="h-2 bg-dc1-surface-l2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-status-info transition-all"
                  style={{ width: `${providerData.vramUsage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Earnings Chart */}
        {dailyEarnings.length > 0 && (
          <div className="card">
            <h2 className="section-heading mb-4">{t('provider.last_7_days')}</h2>
            <div className="flex items-end gap-2 h-32">
              {(() => {
                const maxEarning = Math.max(...dailyEarnings.map(d => d.earned_halala), 1)
                return dailyEarnings.slice(0, 7).reverse().map(d => {
                  const pct = Math.max(4, (d.earned_halala / maxEarning) * 100)
                  const sar = (d.earned_halala / 100).toFixed(2)
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-dc1-amber font-medium">{sar}</span>
                      <div
                        className="w-full bg-gradient-to-t from-dc1-amber/60 to-dc1-amber rounded-t transition-all"
                        style={{ height: `${pct}%`, minHeight: '4px' }}
                      />
                      <span className="text-[10px] text-dc1-text-muted">
                        {new Date(d.day + 'T00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-[9px] text-dc1-text-muted">{d.completed}j</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Current Job Section */}
        <div className="card">
          <h2 className="section-heading mb-4">{t('provider.current_job')}</h2>
          {providerData.activeJob ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-dc1-text-secondary mb-1">{t('provider.job_type')}</p>
                  <p className="text-lg font-semibold text-dc1-text-primary">{providerData.activeJob.jobType}</p>
                </div>
                <StatusBadge status="running" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-dc1-text-secondary mb-1">{t('provider.job_id')}</p>
                  <p className="text-sm font-mono text-dc1-amber">{providerData.activeJob.id}</p>
                </div>
                <div>
                  <p className="text-sm text-dc1-text-secondary mb-1">{t('provider.started')}</p>
                  <p className="text-sm text-dc1-text-primary">{providerData.activeJob.startTime}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-dc1-text-secondary">{t('provider.no_active_jobs')}</p>
            </div>
          )}
        </div>

        {/* Recent Activity Section */}
        <div className="card">
          <h2 className="section-heading mb-6">{t('provider.recent_activity')}</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('table.job_type')}</th>
                  <th>{t('table.duration')}</th>
                  <th>{t('table.earnings')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.completed')}</th>
                </tr>
              </thead>
              <tbody>
                {providerData.recentJobs.length > 0 ? providerData.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.jobType}</td>
                    <td>{job.duration > 0 ? `${job.duration} ${t('common.min')}` : '<1 min'}</td>
                    <td className="font-semibold text-status-success">{job.earnings > 0 ? `${job.earnings.toFixed(2)} ${t('common.sar')}` : '—'}</td>
                    <td>
                      <StatusBadge
                        status={job.status === 'completed' ? 'completed' : 'failed'}
                        size="sm"
                      />
                    </td>
                    <td className="text-dc1-text-secondary">{job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="text-center text-dc1-text-secondary py-6">{t('common.no_jobs_yet')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showWizard && providerData && (
        <ProviderWizard
          providerId={providerData.id}
          apiKey={providerApiKey}
          onComplete={() => setShowWizard(false)}
          onDismiss={() => setShowWizard(false)}
          onHeartbeatDetected={() => {
            setProviderData((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                lastHeartbeat: new Date().toISOString(),
              }
            })
          }}
        />
      )}
    </DashboardLayout>
  )
}

// useSearchParams() requires a Suspense boundary at the page root in Next.js
// app-router. Without this, `next build` fails with "missing-suspense-with-csr-bailout".
export default function ProviderDashboard() {
  return (
    <Suspense fallback={null}>
      <ProviderDashboardInner />
    </Suspense>
  )
}
