'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

interface RenterInfo {
  id: number
  name: string
  email: string
  organization: string
  webhook_url?: string | null
  balance_halala: number
  total_spent_halala: number
  total_jobs: number
  created_at: string
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
  lowBalanceThresholdSar: number
  dailySpendAlertSar: number
}

// Nav icons
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

export default function RenterSettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]
  const [renter, setRenter] = useState<RenterInfo | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newlyRotatedKey, setNewlyRotatedKey] = useState('')
  const [rotating, setRotating] = useState(false)
  const [rotateConfirm, setRotateConfirm] = useState(false)
  const [rotateError, setRotateError] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookMessage, setWebhookMessage] = useState('')
  const [webhookError, setWebhookError] = useState('')
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
    lowBalanceThresholdSar: 25,
    dailySpendAlertSar: 120,
  })
  const [notificationMessage, setNotificationMessage] = useState('')
  const [apiLifecycleMessage, setApiLifecycleMessage] = useState('')

  useEffect(() => {
    const key = localStorage.getItem('dc1_renter_key')
    if (!key) {
      router.push('/login')
      return
    }
    setApiKey(key)

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`)
        if (!res.ok) {
          localStorage.removeItem('dc1_renter_key')
          router.push('/login')
          return
        }
        const data = await res.json()
        setRenter(data.renter || null)
        setWebhookUrl(data?.renter?.webhook_url || '')
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [router])

  useEffect(() => {
    if (!apiKey) return
    const sshStorageKey = `dc1_renter_ssh_keys_${apiKey.slice(0, 12)}`
    const teamStorageKey = `dc1_renter_team_${apiKey.slice(0, 12)}`
    const notifStorageKey = `dc1_renter_notif_${apiKey.slice(0, 12)}`
    const rawSsh = localStorage.getItem(sshStorageKey)
    const rawTeam = localStorage.getItem(teamStorageKey)
    const rawNotif = localStorage.getItem(notifStorageKey)

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
    }

    if (!rawTeam) {
      setTeamMembers([
        {
          id: `member-${Date.now()}`,
          name: renter?.name || 'Workspace Owner',
          email: renter?.email || 'owner@dcp.sa',
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
  }, [apiKey, renter?.email, renter?.name])

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRotateKey = async () => {
    setRotating(true)
    setRotateError('')
    try {
      const res = await fetch(`${API_BASE}/renters/me/rotate-key?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to rotate key')
      const newKey = data.new_key || data.api_key
      if (!newKey) throw new Error('Rotation succeeded but new key was missing')
      localStorage.setItem('dc1_renter_key', newKey)
      setApiKey(newKey)
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

  const handleLogout = () => {
    localStorage.removeItem('dc1_renter_key')
    window.location.href = '/'
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    setDeletingAccount(true)
    setDeleteError('')

    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(apiKey)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete account')

      localStorage.removeItem('dc1_renter_key')
      window.location.href = '/'
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete account')
      setDeletingAccount(false)
    }
  }

  const handleExportData = async () => {
    setExportingData(true)
    setExportMessage('')
    setExportError('')

    try {
      const res = await fetch(`${API_BASE}/renters/me/export?key=${encodeURIComponent(apiKey)}`)
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

  const handleSaveWebhook = async () => {
    setSavingWebhook(true)
    setWebhookMessage('')
    setWebhookError('')
    try {
      const res = await fetch(`${API_BASE}/renters/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': apiKey,
        },
        body: JSON.stringify({
          webhook_url: webhookUrl.trim() ? webhookUrl.trim() : null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save webhook URL')
      }

      const nextUrl = data?.settings?.webhook_url || ''
      setWebhookUrl(nextUrl)
      setRenter((prev) => (prev ? { ...prev, webhook_url: nextUrl } : prev))
      setWebhookMessage('Webhook URL saved.')
    } catch (err: any) {
      setWebhookError(err?.message || 'Failed to save webhook URL')
    } finally {
      setSavingWebhook(false)
    }
  }

  const toFingerprint = (publicKey: string): string => {
    const normalized = publicKey.trim().replace(/\s+/g, ' ')
    const tail = normalized.slice(-32).padStart(32, '0')
    return `SHA256:${tail.slice(0, 8)}:${tail.slice(8, 16)}:${tail.slice(16, 24)}:${tail.slice(24, 32)}`
  }

  const handleAddSshKey = () => {
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
    localStorage.setItem(`dc1_renter_ssh_keys_${apiKey.slice(0, 12)}`, JSON.stringify(next))
    setNewSshLabel('')
    setNewSshPublicKey('')
  }

  const handleRemoveSshKey = (id: string) => {
    const next = sshKeys.filter((key) => key.id !== id)
    setSshKeys(next)
    localStorage.setItem(`dc1_renter_ssh_keys_${apiKey.slice(0, 12)}`, JSON.stringify(next))
  }

  const handleSaveNotifications = () => {
    localStorage.setItem(
      `dc1_renter_notif_${apiKey.slice(0, 12)}`,
      JSON.stringify(notificationPrefs),
    )
    setNotificationMessage('Notification preferences saved.')
    setTimeout(() => setNotificationMessage(''), 2500)
  }

  const handleInviteMember = () => {
    setTeamMessage('')
    const email = inviteEmail.trim()
    const name = inviteName.trim()
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
    localStorage.setItem(`dc1_renter_team_${apiKey.slice(0, 12)}`, JSON.stringify(next))
    setInviteName('')
    setInviteEmail('')
    setInviteRole('member')
    setTeamMessage('Invitation staged. Backend invite endpoint pending.')
  }

  const handleRemoveMember = (id: string) => {
    const next = teamMembers.filter((member) => member.id !== id)
    setTeamMembers(next)
    localStorage.setItem(`dc1_renter_team_${apiKey.slice(0, 12)}`, JSON.stringify(next))
  }

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName="Renter">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  if (!renter) {
    return (
      <DashboardLayout navItems={navItems} role="renter" userName="Renter">
        <div className="card p-8 text-center">
          <p className="text-dc1-text-secondary">Failed to load account info</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renter.name}>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary">Settings</h1>
          <p className="text-dc1-text-secondary text-sm mt-1">Manage your account and API access</p>
        </div>

        {/* Profile */}
        <div className="card p-6 space-y-4">
          <h2 className="section-heading">Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Name</label>
              <div className="text-dc1-text-primary font-medium">{renter.name}</div>
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Email</label>
              <div className="text-dc1-text-primary">{renter.email}</div>
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Organization</label>
              <div className="text-dc1-text-primary">{renter.organization || '—'}</div>
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Member Since</label>
              <div className="text-dc1-text-primary">
                {renter.created_at ? new Date(renter.created_at).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Account Stats */}
        <div className="card p-6 space-y-4">
          <h2 className="section-heading">Account Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-dc1-surface-l2 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-dc1-amber">{((renter.balance_halala || 0) / 100).toFixed(2)} SAR</div>
              <div className="text-xs text-dc1-text-muted">Balance</div>
            </div>
            <div className="bg-dc1-surface-l2 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-dc1-text-primary">{((renter.total_spent_halala || 0) / 100).toFixed(2)} SAR</div>
              <div className="text-xs text-dc1-text-muted">Total Spent</div>
            </div>
            <div className="bg-dc1-surface-l2 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-dc1-text-primary">{renter.total_jobs || 0}</div>
              <div className="text-xs text-dc1-text-muted">Jobs Run</div>
            </div>
          </div>
        </div>

        {/* Webhook Settings */}
        <div className="card p-6 space-y-4">
          <h2 className="section-heading">Job Completion Webhook</h2>
          <p className="text-dc1-text-muted text-sm">
            Receive a signed callback when a job finishes or fails.
          </p>
          <div className="space-y-2">
            <label className="text-xs text-dc1-text-muted block">Webhook URL (optional)</label>
            <input
              type="url"
              placeholder="https://your-app.example.com/dcp/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-dc1-amber/30"
            />
            <p className="text-xs text-dc1-text-muted">
              Header: <span className="font-mono">X-DCP-Signature</span> (HMAC-SHA256).
            </p>
          </div>
          {webhookMessage && <p className="text-xs text-status-success">{webhookMessage}</p>}
          {webhookError && <p className="text-xs text-status-error">{webhookError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleSaveWebhook}
              disabled={savingWebhook}
              className="btn btn-primary text-sm min-h-[44px] disabled:opacity-60"
            >
              {savingWebhook ? 'Saving...' : 'Save Webhook'}
            </button>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="section-heading">Notifications</h2>
            <p className="text-dc1-text-muted text-sm mt-1">Configure alert channels and spend thresholds.</p>
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
              <label className="text-xs text-dc1-text-muted block mb-1">Low balance threshold (SAR)</label>
              <input
                type="number"
                min={1}
                value={notificationPrefs.lowBalanceThresholdSar}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    lowBalanceThresholdSar: Number(e.target.value || 1),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">Daily spend alert (SAR)</label>
              <input
                type="number"
                min={1}
                value={notificationPrefs.dailySpendAlertSar}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    dailySpendAlertSar: Number(e.target.value || 1),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
          </div>
          {notificationMessage && <p className="text-xs text-status-success">{notificationMessage}</p>}
          <div className="flex justify-end">
            <button onClick={handleSaveNotifications} className="btn btn-primary text-sm min-h-[44px]">
              Save Notifications
            </button>
          </div>
        </div>

        {/* API Key Management */}
        <div className="card p-6 space-y-4">
          <h2 className="section-heading">API Key</h2>
          <p className="text-dc1-text-muted text-sm">
            Your API key is used to authenticate requests to the DCP Platform.
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
                  className="btn btn-secondary text-sm px-3"
                >
                  {copied ? 'Copied!' : t('settings.new_key_copy')}
                </button>
                <button
                  onClick={() => setNewlyRotatedKey('')}
                  className="btn btn-outline text-sm px-3"
                >
                  I saved this key
                </button>
              </div>
            </div>
          )}

          {/* Key display */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-dc1-surface-l2 border border-dc1-border rounded-lg px-4 py-3 font-mono text-sm text-dc1-text-primary overflow-hidden">
              {showKey ? apiKey : `${apiKey.slice(0, 12)}${'•'.repeat(20)}`}
            </div>
            <button
              onClick={() => setShowKey(!showKey)}
              className="btn btn-outline text-sm px-3"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={copyApiKey}
              className="btn btn-secondary text-sm px-3"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Rotate Key */}
          <div className="border-t border-dc1-border pt-4">
            <div className="mb-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary">
              <div className="flex justify-between gap-3">
                <span>Last used</span>
                <span className="text-dc1-text-primary">Active in current browser session</span>
              </div>
              <div className="flex justify-between gap-3 mt-1">
                <span>Scope</span>
                <span className="text-dc1-text-primary">Renter API + Playground access</span>
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
            {apiLifecycleMessage && (
              <p className="text-xs text-dc1-text-muted">{apiLifecycleMessage}</p>
            )}
            {!rotateConfirm ? (
              <button
                onClick={() => setRotateConfirm(true)}
                className="text-sm text-status-warning hover:text-status-warning/80 font-medium transition"
              >
                {t('settings.rotate_key')}
              </button>
            ) : (
              <div className="bg-status-warning/5 border border-status-warning/20 rounded-lg p-4 space-y-3">
                <p className="text-sm text-dc1-text-primary">
                  {t('settings.rotate_confirm')}
                </p>
                {rotateError && <p className="text-sm text-status-error">{rotateError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleRotateKey}
                    disabled={rotating}
                    className="btn btn-primary text-sm disabled:opacity-50"
                  >
                    {rotating ? 'Rotating...' : 'Confirm Rotate'}
                  </button>
                  <button
                    onClick={() => setRotateConfirm(false)}
                    className="btn btn-outline text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SSH Keys */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="section-heading">SSH Keys</h2>
            <p className="text-dc1-text-muted text-sm mt-1">Use SSH keys for secure template sync and authenticated repository access.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={newSshLabel}
              onChange={(e) => setNewSshLabel(e.target.value)}
              placeholder="Label (MacBook Pro)"
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
            <p className="text-dc1-text-muted text-sm mt-1">Invite teammates and assign owner/admin/member roles.</p>
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
              Request a PDPL export of your account profile, jobs, payments, and analytics (limited to 1 request per 24 hours).
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
              This permanently deletes your renter account, removes access keys, and anonymizes your job history.
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
