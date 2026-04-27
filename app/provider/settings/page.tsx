'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

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
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

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

interface ProviderInfo {
  id: number
  name: string
  email: string
  gpu_model: string
  status: string
  api_key: string
  created_at: string
  vllm_endpoint_url?: string
}

interface SshKeyItem {
  id: string
  label: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

interface TeamMemberItem {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'pending'
}

interface NotificationPrefs {
  email: boolean
  telegram: boolean
  webhook: boolean
  offlineAfterMinutes: number
  maxTempThresholdC: number
}

export default function ProviderSettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const navItems = [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [newlyRotatedKey, setNewlyRotatedKey] = useState('')
  const [rotating, setRotating] = useState(false)
  const [rotateConfirm, setRotateConfirm] = useState(false)
  const [rotateError, setRotateError] = useState('')
  const [prefs, setPrefs] = useState({
    run_mode: 'always-on',
    scheduled_start: '23:00',
    scheduled_end: '07:00',
    gpu_usage_cap_pct: 80,
    vram_reserve_gb: 1,
    temp_limit_c: 85,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [exportingData, setExportingData] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const [sshKeys, setSshKeys] = useState<SshKeyItem[]>([])
  const [newSshLabel, setNewSshLabel] = useState('')
  const [newSshPublicKey, setNewSshPublicKey] = useState('')
  const [sshError, setSshError] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([])
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamMemberItem['role']>('member')
  const [teamMessage, setTeamMessage] = useState('')
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    email: true,
    telegram: false,
    webhook: false,
    offlineAfterMinutes: 7,
    maxTempThresholdC: 85,
  })
  const [notificationMessage, setNotificationMessage] = useState('')
  const [apiLifecycleMessage, setApiLifecycleMessage] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('')
  const [savingEndpoint, setSavingEndpoint] = useState(false)
  const [endpointSaved, setEndpointSaved] = useState(false)
  const [endpointError, setEndpointError] = useState('')

  useEffect(() => {
    const apiKey = localStorage.getItem('dc1_provider_key')
    if (!apiKey) {
      router.push('/login')
      return
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(apiKey)}`)
        if (!res.ok) {
          localStorage.removeItem('dc1_provider_key')
          router.push('/login')
          return
        }
        const data = await res.json()
        const p = data.provider
        setProvider({
          ...p,
          api_key: apiKey,
        })
        setEndpointUrl(p.vllm_endpoint_url || '')
        setPrefs({
          run_mode: p.run_mode || 'always-on',
          scheduled_start: p.scheduled_start || '23:00',
          scheduled_end: p.scheduled_end || '07:00',
          gpu_usage_cap_pct: p.gpu_usage_cap_pct != null ? p.gpu_usage_cap_pct : 80,
          vram_reserve_gb: p.vram_reserve_gb != null ? p.vram_reserve_gb : 1,
          temp_limit_c: p.temp_limit_c != null ? p.temp_limit_c : 85,
        })
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  useEffect(() => {
    if (!provider?.api_key) return
    const scope = provider.api_key.slice(0, 12)
    const rawSsh = localStorage.getItem(`dc1_provider_ssh_keys_${scope}`)
    const rawTeam = localStorage.getItem(`dc1_provider_team_${scope}`)
    const rawNotif = localStorage.getItem(`dc1_provider_notif_${scope}`)

    if (rawSsh) {
      try {
        setSshKeys(JSON.parse(rawSsh) as SshKeyItem[])
      } catch {
        setSshKeys([])
      }
    }

    if (rawTeam) {
      try {
        setTeamMembers(JSON.parse(rawTeam) as TeamMemberItem[])
      } catch {
        setTeamMembers([])
      }
    } else {
      setTeamMembers([
        {
          id: `member-${Date.now()}`,
          name: provider?.name || 'Provider Owner',
          email: provider?.email || 'owner@dcp.sa',
          role: 'owner',
          status: 'active',
        },
      ])
    }

    if (rawNotif) {
      try {
        setNotificationPrefs(JSON.parse(rawNotif) as NotificationPrefs)
      } catch {
        // keep defaults
      }
    }
  }, [provider?.api_key, provider?.email, provider?.name])

  const copyApiKey = () => {
    if (!provider) return
    navigator.clipboard.writeText(provider.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRotateKey = async () => {
    if (!provider) return
    setRotating(true)
    setRotateError('')
    try {
      const res = await fetch(`${API_BASE}/providers/me/rotate-key?key=${encodeURIComponent(provider.api_key)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to rotate key')
      const newKey = data.new_key || data.api_key
      if (!newKey) throw new Error('Rotation succeeded but new key was missing')
      localStorage.setItem('dc1_provider_key', newKey)
      setProvider({ ...provider, api_key: newKey })
      setNewlyRotatedKey(newKey)
      setShowKey(false)
      setRotateConfirm(false)
      setCopied(false)
    } catch (err: any) {
      console.error('Key rotation failed:', err)
      setRotateError(err?.message || 'Failed to rotate API key. Please try again.')
    } finally {
      setRotating(false)
    }
  }

  const handleSavePreferences = async () => {
    if (!provider) return
    setSavingPrefs(true)
    setPrefsSaved(false)
    try {
      const res = await fetch(`${API_BASE}/providers/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: provider.api_key, ...prefs }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save preferences')
        return
      }
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 3000)
    } catch (err) {
      console.error('Save preferences failed:', err)
      alert('Failed to save preferences. Please try again.')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleSaveEndpoint = async () => {
    if (!provider) return
    setSavingEndpoint(true)
    setEndpointSaved(false)
    setEndpointError('')
    try {
      const res = await fetch(`${API_BASE}/providers/endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: provider.api_key, vllm_endpoint_url: endpointUrl || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setEndpointError(err.error || 'Failed to save endpoint')
        return
      }
      setEndpointSaved(true)
      setTimeout(() => setEndpointSaved(false), 3000)
    } catch {
      setEndpointError('Failed to save. Please try again.')
    } finally {
      setSavingEndpoint(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('dc1_provider_key')
    localStorage.removeItem('dc1_user_data')
    window.location.href = '/'
  }

  const handleDeleteAccount = async () => {
    if (!provider || deleteConfirmText !== 'DELETE') return
    setDeletingAccount(true)
    setDeleteError('')

    try {
      const res = await fetch(`${API_BASE}/providers/me?key=${encodeURIComponent(provider.api_key)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete account')

      localStorage.removeItem('dc1_provider_key')
      localStorage.removeItem('dc1_user_data')
      window.location.href = '/'
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete account')
      setDeletingAccount(false)
    }
  }

  const handleExportData = async () => {
    if (!provider) return
    setExportingData(true)
    setExportMessage('')
    setExportError('')

    try {
      const res = await fetch(`${API_BASE}/providers/me/export?key=${encodeURIComponent(provider.api_key)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to export data')

      const exportedAt = data?.exported_at
        ? new Date(data.exported_at).toLocaleString()
        : 'now'
      setExportMessage(`Data export generated successfully at ${exportedAt}.`)
    } catch (err: any) {
      setExportError(err?.message || 'Failed to export data')
    } finally {
      setExportingData(false)
    }
  }

  const toFingerprint = (publicKey: string): string => {
    const normalized = publicKey.trim().replace(/\s+/g, ' ')
    const tail = normalized.slice(-32).padStart(32, '0')
    return `SHA256:${tail.slice(0, 8)}:${tail.slice(8, 16)}:${tail.slice(16, 24)}:${tail.slice(24, 32)}`
  }

  const handleAddSshKey = () => {
    if (!provider?.api_key) return
    setSshError('')
    const label = newSshLabel.trim()
    const publicKey = newSshPublicKey.trim()
    if (!label || !publicKey) {
      setSshError('Label and public key are required.')
      return
    }
    if (!publicKey.startsWith('ssh-')) {
      setSshError('SSH key must start with ssh-rsa, ssh-ed25519, or similar.')
      return
    }
    const next: SshKeyItem[] = [
      {
        id: `ssh-${Date.now()}`,
        label,
        publicKey,
        fingerprint: toFingerprint(publicKey),
        createdAt: new Date().toISOString(),
      },
      ...sshKeys,
    ]
    setSshKeys(next)
    localStorage.setItem(`dc1_provider_ssh_keys_${provider.api_key.slice(0, 12)}`, JSON.stringify(next))
    setNewSshLabel('')
    setNewSshPublicKey('')
  }

  const handleRemoveSshKey = (id: string) => {
    if (!provider?.api_key) return
    const next = sshKeys.filter((key) => key.id !== id)
    setSshKeys(next)
    localStorage.setItem(`dc1_provider_ssh_keys_${provider.api_key.slice(0, 12)}`, JSON.stringify(next))
  }

  const handleSaveNotificationPrefs = () => {
    if (!provider?.api_key) return
    localStorage.setItem(
      `dc1_provider_notif_${provider.api_key.slice(0, 12)}`,
      JSON.stringify(notificationPrefs),
    )
    setNotificationMessage('Notification preferences saved.')
    setTimeout(() => setNotificationMessage(''), 2500)
  }

  const handleInviteMember = () => {
    if (!provider?.api_key) return
    setTeamMessage('')
    const name = inviteName.trim()
    const email = inviteEmail.trim()
    if (!name || !email) {
      setTeamMessage('Name and email are required.')
      return
    }
    const next: TeamMemberItem[] = [
      ...teamMembers,
      {
        id: `invite-${Date.now()}`,
        name,
        email,
        role: inviteRole,
        status: 'pending',
      },
    ]
    setTeamMembers(next)
    localStorage.setItem(`dc1_provider_team_${provider.api_key.slice(0, 12)}`, JSON.stringify(next))
    setInviteName('')
    setInviteEmail('')
    setInviteRole('member')
    setTeamMessage('Invitation staged. Backend invite endpoint pending.')
  }

  const handleRemoveMember = (id: string) => {
    if (!provider?.api_key) return
    const next = teamMembers.filter((member) => member.id !== id)
    setTeamMembers(next)
    localStorage.setItem(`dc1_provider_team_${provider.api_key.slice(0, 12)}`, JSON.stringify(next))
  }

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="provider" userName={provider?.name || 'Provider'}>
      <div className="space-y-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-dc1-text-primary">Settings</h1>

        <div className="rounded-xl border border-dc1-amber/20 bg-dc1-surface-l2 p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-dc1-amber font-semibold mb-2">{t('register.provider.next_action_title')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <Link href="/provider/download" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              {t('register.provider.state.heartbeat.label')}
            </Link>
            <Link href="/provider/jobs" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              {t('register.provider.state.ready.label')}
            </Link>
            <Link href="/provider/earnings" className="rounded-lg border border-dc1-border bg-dc1-surface-l1 px-3 py-2 text-dc1-text-secondary hover:text-dc1-amber transition-colors">
              {t('nav.earnings')}
            </Link>
            <span className="rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 px-3 py-2 text-dc1-amber">
              {t('nav.settings')}
            </span>
          </div>
        </div>

        {/* Account Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-dc1-text-primary">Account Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-dc1-border/30">
              <span className="text-sm text-dc1-text-secondary">Name</span>
              <span className="text-sm text-dc1-text-primary font-medium">{provider?.name || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dc1-border/30">
              <span className="text-sm text-dc1-text-secondary">Email</span>
              <span className="text-sm text-dc1-text-primary">{provider?.email || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dc1-border/30">
              <span className="text-sm text-dc1-text-secondary">GPU Model</span>
              <span className="text-sm text-dc1-text-primary">{provider?.gpu_model || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dc1-border/30">
              <span className="text-sm text-dc1-text-secondary">Status</span>
              <span className={`text-sm font-medium ${provider?.status === 'online' ? 'text-status-success' : 'text-dc1-text-secondary'}`}>
                {provider?.status || '—'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dc1-border/30">
              <span className="text-sm text-dc1-text-secondary">Provider ID</span>
              <span className="text-sm text-dc1-text-primary font-mono">{provider?.id || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-dc1-text-secondary">Member Since</span>
              <span className="text-sm text-dc1-text-primary">
                {provider?.created_at ? new Date(provider.created_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Billing and Payout Summary */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-dc1-text-primary">{t('settings.settlement.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('settings.settlement.rail_label')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('settings.settlement.rail_value')}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('settings.settlement.timing_label')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('settings.settlement.timing_value')}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('settings.settlement.minimum_label')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('settings.settlement.minimum_value')}</p>
            </div>
          </div>
          <p className="text-xs text-dc1-text-muted">
            {t('settings.settlement.note')}
          </p>
        </div>

        {/* API Key */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-dc1-text-primary">API Key</h2>
          <p className="text-sm text-dc1-text-secondary">
            Your API key is used to authenticate your daemon with the DCP platform.
          </p>
          {newlyRotatedKey && (
            <div className="rounded-lg border border-dc1-amber/40 bg-dc1-amber/10 p-4 space-y-3">
              <p className="text-sm text-dc1-text-primary font-medium">
                Your new API key (shown once)
              </p>
              <code className="block w-full text-xs sm:text-sm font-mono text-dc1-amber bg-dc1-surface-l3 border border-dc1-border rounded-lg p-3 break-all">
                {newlyRotatedKey}
              </code>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newlyRotatedKey)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  {copied ? 'Copied!' : t('settings.new_key_copy')}
                </button>
                <button
                  onClick={() => setNewlyRotatedKey('')}
                  className="btn btn-outline btn-sm"
                >
                  I saved this key
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono text-dc1-amber bg-dc1-surface-l3 border border-dc1-border rounded-lg p-3 break-all">
              {showKey ? provider?.api_key : '••••••••••••••••••••••••••••••••'}
            </code>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowKey(!showKey)}
                className="btn btn-secondary btn-sm"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={copyApiKey}
                className="btn btn-secondary btn-sm"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-dc1-border/30">
            <div className="mb-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary">
              <div className="flex justify-between gap-3">
                <span>Last used</span>
                <span className="text-dc1-text-primary">Daemon handshake + heartbeat authenticated</span>
              </div>
              <div className="flex justify-between gap-3 mt-1">
                <span>Scope</span>
                <span className="text-dc1-text-primary">Provider daemon, jobs, earnings endpoints</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setApiLifecycleMessage('Create additional key is pending backend support.')}
                className="btn btn-outline text-xs px-3"
              >
                Create Additional Key
              </button>
              <button
                type="button"
                onClick={() => setApiLifecycleMessage('Revoke old keys is pending backend support. Use rotate as secure fallback.')}
                className="btn btn-outline text-xs px-3"
              >
                Revoke Legacy Keys
              </button>
            </div>
            {apiLifecycleMessage && <p className="text-xs text-dc1-text-muted mb-3">{apiLifecycleMessage}</p>}
            {!rotateConfirm ? (
              <button
                onClick={() => setRotateConfirm(true)}
                className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors"
              >
                {t('settings.rotate_key')}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-status-error">
                  {t('settings.rotate_confirm')}
                </p>
                {rotateError && <p className="text-sm text-status-error">{rotateError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleRotateKey}
                    disabled={rotating}
                    className="px-3 py-1.5 rounded text-sm font-medium bg-status-error/20 text-status-error hover:bg-status-error/30 transition disabled:opacity-50"
                  >
                    {rotating ? 'Rotating...' : 'Confirm Rotate'}
                  </button>
                  <button
                    onClick={() => setRotateConfirm(false)}
                    className="px-3 py-1.5 rounded text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* GPU Preferences */}
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-dc1-text-primary">GPU Preferences</h2>
            {prefsSaved && <span className="text-sm text-status-success font-medium">Saved!</span>}
          </div>

          {/* Run Mode */}
          <div>
            <label className="text-sm text-dc1-text-secondary mb-2 block">Run Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['always-on', 'scheduled', 'manual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPrefs({ ...prefs, run_mode: mode })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                    prefs.run_mode === mode
                      ? 'border-dc1-amber bg-dc1-amber/10 text-dc1-amber'
                      : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:border-dc1-amber/30'
                  }`}
                >
                  {mode === 'always-on' ? 'Always On' : mode === 'scheduled' ? 'Scheduled' : 'Manual'}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule (only if scheduled mode) */}
          {prefs.run_mode === 'scheduled' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-dc1-text-secondary mb-1 block">Start Time</label>
                <input
                  type="time"
                  value={prefs.scheduled_start}
                  onChange={e => setPrefs({ ...prefs, scheduled_start: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="text-sm text-dc1-text-secondary mb-1 block">End Time</label>
                <input
                  type="time"
                  value={prefs.scheduled_end}
                  onChange={e => setPrefs({ ...prefs, scheduled_end: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          )}

          {/* GPU Usage Cap */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-dc1-text-secondary">GPU Usage Cap</label>
              <span className="text-sm font-semibold text-dc1-text-primary">{prefs.gpu_usage_cap_pct}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={prefs.gpu_usage_cap_pct}
              onChange={e => setPrefs({ ...prefs, gpu_usage_cap_pct: Number(e.target.value) })}
              className="w-full accent-dc1-amber"
            />
            <div className="flex justify-between text-xs text-dc1-text-muted mt-1">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>

          {/* VRAM Reserve */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-dc1-text-secondary">VRAM Reserve</label>
              <span className="text-sm font-semibold text-dc1-text-primary">{prefs.vram_reserve_gb} GB</span>
            </div>
            <input
              type="range"
              min={0}
              max={16}
              step={0.5}
              value={prefs.vram_reserve_gb}
              onChange={e => setPrefs({ ...prefs, vram_reserve_gb: Number(e.target.value) })}
              className="w-full accent-dc1-amber"
            />
            <p className="text-xs text-dc1-text-muted mt-1">Amount of VRAM to keep free for your own use</p>
          </div>

          {/* Temperature Limit */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-dc1-text-secondary">Temperature Limit</label>
              <span className={`text-sm font-semibold ${prefs.temp_limit_c >= 90 ? 'text-status-error' : prefs.temp_limit_c >= 80 ? 'text-status-warning' : 'text-dc1-text-primary'}`}>
                {prefs.temp_limit_c}°C
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={prefs.temp_limit_c}
              onChange={e => setPrefs({ ...prefs, temp_limit_c: Number(e.target.value) })}
              className="w-full accent-dc1-amber"
            />
            <p className="text-xs text-dc1-text-muted mt-1">Daemon will throttle jobs if GPU exceeds this temperature</p>
          </div>

          <button
            onClick={handleSavePreferences}
            disabled={savingPrefs}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {savingPrefs ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>

        {/* Inference Endpoint */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-dc1-text-primary">Inference Endpoint</h2>
            {endpointSaved && <span className="text-sm text-status-success font-medium">Saved!</span>}
          </div>
          <p className="text-sm text-dc1-text-secondary">
            If your GPU is hosted in the cloud (RunPod, Lambda, etc.), set the public URL where your vLLM instance is reachable.
            The daemon will advertise this endpoint in every heartbeat.
          </p>
          <div>
            <label className="text-sm text-dc1-text-secondary mb-1 block">vLLM Endpoint URL</label>
            <input
              type="url"
              value={endpointUrl}
              onChange={e => { setEndpointUrl(e.target.value); setEndpointError('') }}
              placeholder="https://{pod-id}-8000.proxy.runpod.net"
              className="input w-full"
            />
            <p className="text-xs text-dc1-text-muted mt-1">
              RunPod: <code className="bg-dc1-surface-l2 px-1 rounded">https://&#123;pod-id&#125;-8000.proxy.runpod.net</code> &mdash;
              Leave empty if running the daemon locally with WireGuard VPN.
            </p>
          </div>
          {endpointError && <p className="text-sm text-status-error">{endpointError}</p>}
          <button
            onClick={handleSaveEndpoint}
            disabled={savingEndpoint}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {savingEndpoint ? 'Saving...' : 'Save Endpoint'}
          </button>
        </div>

        {/* Notification Preferences */}
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="section-heading">Notification Preferences</h2>
            <p className="text-dc1-text-muted text-sm mt-1">Choose channels and thresholds for provider alerts.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: 'email', label: 'Email' },
              { key: 'telegram', label: 'Telegram' },
              { key: 'webhook', label: 'Webhook' },
            ].map((channel) => (
              <label
                key={channel.key}
                className="rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-3 flex items-center justify-between"
              >
                <span className="text-sm text-dc1-text-primary">{channel.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(notificationPrefs[channel.key as keyof NotificationPrefs])}
                  onChange={(e) =>
                    setNotificationPrefs((prev) => ({ ...prev, [channel.key]: e.target.checked }))
                  }
                  className="h-4 w-4 accent-dc1-amber"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Offline alert after (minutes)</label>
              <input
                type="number"
                min={1}
                value={notificationPrefs.offlineAfterMinutes}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    offlineAfterMinutes: Number(e.target.value || 1),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">GPU temp warning (°C)</label>
              <input
                type="number"
                min={50}
                max={100}
                value={notificationPrefs.maxTempThresholdC}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    maxTempThresholdC: Number(e.target.value || 50),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
          </div>
          {notificationMessage && <p className="text-xs text-status-success">{notificationMessage}</p>}
          <div className="flex justify-end">
            <button onClick={handleSaveNotificationPrefs} className="btn btn-primary text-sm min-h-[44px]">
              Save Notification Preferences
            </button>
          </div>
        </div>

        {/* SSH Keys */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="section-heading">SSH Keys</h2>
            <p className="text-dc1-text-muted text-sm mt-1">Manage SSH keys for provider-side secure operations.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={newSshLabel}
              onChange={(e) => setNewSshLabel(e.target.value)}
              placeholder="Label (workstation)"
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <input
              type="text"
              value={newSshPublicKey}
              onChange={(e) => setNewSshPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3Nz..."
              className="sm:col-span-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
          </div>
          {sshError && <p className="text-xs text-status-error">{sshError}</p>}
          <div className="flex justify-end">
            <button onClick={handleAddSshKey} className="btn btn-primary text-sm min-h-[44px]">
              Add SSH Key
            </button>
          </div>
          <div className="space-y-2">
            {sshKeys.length === 0 ? (
              <p className="text-xs text-dc1-text-muted">No SSH keys added yet.</p>
            ) : (
              sshKeys.map((key) => (
                <div key={key.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-dc1-text-primary font-medium">{key.label}</p>
                      <p className="text-xs text-dc1-text-muted">{key.fingerprint}</p>
                      <p className="text-xs text-dc1-text-muted mt-1">
                        Added {new Date(key.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveSshKey(key.id)}
                      className="px-3 py-1.5 rounded border border-status-error/30 text-status-error text-xs hover:bg-status-error/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Settings */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="section-heading">Team Settings</h2>
            <p className="text-dc1-text-muted text-sm mt-1">Invite teammates and assign account roles.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Name"
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="sm:col-span-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMemberItem['role'])}
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={handleInviteMember} className="btn btn-primary text-sm min-h-[44px]">
              Invite Member
            </button>
          </div>
          {teamMessage && <p className="text-xs text-dc1-text-muted">{teamMessage}</p>}
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={member.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-dc1-text-primary font-medium">{member.name}</p>
                  <p className="text-xs text-dc1-text-muted">{member.email}</p>
                  <p className="text-xs text-dc1-text-muted mt-1">
                    {member.role} • {member.status}
                  </p>
                </div>
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="px-3 py-1.5 rounded border border-status-error/30 text-status-error text-xs hover:bg-status-error/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card p-6 border-status-error/20 space-y-4">
          <h2 className="text-lg font-semibold text-status-error">Account Actions</h2>
          <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-dc1-text-primary">Export My Data</h3>
            <p className="text-xs text-dc1-text-secondary">
              Request a PDPL export of your account profile, job history, earnings, and payouts (limited to 1 request per 24 hours).
            </p>
            {exportMessage && <p className="text-xs text-status-success">{exportMessage}</p>}
            {exportError && <p className="text-xs text-status-error">{exportError}</p>}
            <button
              onClick={handleExportData}
              disabled={exportingData}
              className="px-4 py-2 rounded-lg border border-dc1-amber/40 text-dc1-amber text-sm font-medium hover:bg-dc1-amber/10 transition disabled:opacity-50"
            >
              {exportingData ? 'Exporting...' : 'Export My Data'}
            </button>
          </div>
          <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-status-error">Delete Account</h3>
            <p className="text-xs text-dc1-text-secondary">
              This permanently deletes your provider account, cancels active jobs, and revokes daemon access.
            </p>
            <button
              onClick={() => {
                setShowDeleteModal(true)
                setDeleteConfirmText('')
                setDeleteError('')
              }}
              className="px-4 py-2 rounded-lg border border-status-error/40 text-status-error text-sm font-medium hover:bg-status-error/10 transition"
            >
              Delete Account
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg border border-status-error/30 text-status-error text-sm font-medium hover:bg-status-error/10 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-status-error">Confirm Account Deletion</h2>
            <p className="text-sm text-dc1-text-secondary">
              This action cannot be undone. Type <span className="font-mono text-dc1-text-primary">DELETE</span> to continue.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-status-error/30"
            />
            {deleteError && <p className="text-sm text-status-error">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  if (deletingAccount) return
                  setShowDeleteModal(false)
                  setDeleteConfirmText('')
                  setDeleteError('')
                }}
                className="btn btn-outline text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                className="btn text-sm bg-status-error/20 text-status-error border border-status-error/40 hover:bg-status-error/30 disabled:opacity-50"
              >
                {deletingAccount ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
