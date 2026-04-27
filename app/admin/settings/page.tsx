'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

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
  failedJobsThreshold: number
  staleProviderThresholdMinutes: number
}

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6a2 2 0 002-2V9l-7-4-7 4v10a2 2 0 002 2z" />
  </svg>
)
const ServerIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
  </svg>
)
const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)
const BriefcaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const CurrencyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const WalletIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
)
const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)
const CpuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
)
const ContainerIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

export default function AdminSettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [apiMessage, setApiMessage] = useState('')
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
    failedJobsThreshold: 5,
    staleProviderThresholdMinutes: 15,
  })
  const [notificationMessage, setNotificationMessage] = useState('')

  useEffect(() => {
    const adminToken = localStorage.getItem('dc1_admin_token')
    if (!adminToken) {
      router.push('/login')
      return
    }
    setToken(adminToken)

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/dashboard`, {
          headers: { 'x-admin-token': adminToken },
        })
        if (!res.ok && res.status === 401) {
          localStorage.removeItem('dc1_admin_token')
          router.push('/login')
          return
        }
      } finally {
        setLoading(false)
      }
    }

    const rawSsh = localStorage.getItem('dc1_admin_ssh_keys')
    const rawTeam = localStorage.getItem('dc1_admin_team')
    const rawNotif = localStorage.getItem('dc1_admin_notif')

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
          id: `owner-${Date.now()}`,
          name: t('admin.settings.default_admin_name'),
          email: 'ops@dcp.sa',
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

    load()
  }, [router, t])

  const navItems = [
    { label: t('nav.dashboard'), href: '/admin', icon: <HomeIcon /> },
    { label: t('nav.providers'), href: '/admin/providers', icon: <ServerIcon /> },
    { label: t('nav.renters'), href: '/admin/renters', icon: <UsersIcon /> },
    { label: t('nav.jobs'), href: '/admin/jobs', icon: <BriefcaseIcon /> },
    { label: t('nav.finance'), href: '/admin/finance', icon: <CurrencyIcon /> },
    { label: t('nav.withdrawals'), href: '/admin/withdrawals', icon: <WalletIcon /> },
    { label: t('nav.security'), href: '/admin/security', icon: <ShieldIcon /> },
    { label: t('nav.fleet'), href: '/admin/fleet', icon: <CpuIcon /> },
    { label: t('nav.containers'), href: '/admin/containers', icon: <ContainerIcon /> },
    { label: t('nav.settings'), href: '/admin/settings', icon: <GearIcon /> },
  ]

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
      setSshError(t('admin.settings.ssh_required'))
      return
    }
    if (!publicKey.startsWith('ssh-')) {
      setSshError(t('admin.settings.ssh_invalid_prefix'))
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
    localStorage.setItem('dc1_admin_ssh_keys', JSON.stringify(next))
    setNewSshLabel('')
    setNewSshPublicKey('')
  }

  const handleRemoveSshKey = (id: string) => {
    const next = sshKeys.filter((key) => key.id !== id)
    setSshKeys(next)
    localStorage.setItem('dc1_admin_ssh_keys', JSON.stringify(next))
  }

  const handleSaveNotifications = () => {
    localStorage.setItem('dc1_admin_notif', JSON.stringify(notificationPrefs))
    setNotificationMessage(t('admin.settings.notifications_saved'))
    setTimeout(() => setNotificationMessage(''), 2500)
  }

  const handleInviteMember = () => {
    setTeamMessage('')
    const name = inviteName.trim()
    const email = inviteEmail.trim()
    if (!name || !email) {
      setTeamMessage(t('admin.settings.team_required'))
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
    localStorage.setItem('dc1_admin_team', JSON.stringify(next))
    setInviteName('')
    setInviteEmail('')
    setInviteRole('member')
    setTeamMessage(t('admin.settings.invite_staged'))
  }

  const handleRemoveMember = (id: string) => {
    const next = teamMembers.filter((member) => member.id !== id)
    setTeamMembers(next)
    localStorage.setItem('dc1_admin_team', JSON.stringify(next))
  }

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="admin" userName={t('common.admin')}>
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary">{t('admin.settings.title')}</h1>
          <p className="text-dc1-text-secondary text-sm mt-1">{t('admin.settings.subtitle')}</p>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="section-heading">{t('admin.settings.account_info')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.name')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('admin.settings.default_admin_name')}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.email')}</p>
              <p className="text-sm text-dc1-text-primary mt-1">ops@dcp.sa</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.role')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('admin.settings.platform_admin')}</p>
            </div>
          </div>
          <p className="text-xs text-dc1-text-muted">
            {t('admin.settings.avatar_note')}
          </p>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="section-heading">{t('admin.settings.billing_controls')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.topup_processor')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('admin.settings.topup_processor_value')}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.payout_window')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('admin.settings.payout_window_value')}</p>
            </div>
            <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.invoice_retention')}</p>
              <p className="text-sm text-dc1-text-primary font-medium mt-1">{t('admin.settings.invoice_retention_value')}</p>
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="section-heading">{t('admin.settings.api_keys')}</h2>
          <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-xs text-dc1-text-secondary space-y-1">
            <div className="flex justify-between gap-3">
              <span>{t('admin.settings.primary_token')}</span>
              <span className="text-dc1-text-primary">{t('admin.settings.primary_token_value')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t('admin.settings.last_used')}</span>
              <span className="text-dc1-text-primary">{t('admin.settings.last_used_value')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t('admin.settings.token_preview')}</span>
              <span className="text-dc1-text-primary font-mono">{token ? `${token.slice(0, 8)}...${token.slice(-4)}` : t('admin.settings.not_loaded')}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setApiMessage(t('admin.settings.api_create_pending'))}
              className="btn btn-outline text-xs px-3"
            >
              {t('admin.settings.create_key')}
            </button>
            <button
              onClick={() => setApiMessage(t('admin.settings.api_rotate_pending'))}
              className="btn btn-outline text-xs px-3"
            >
              {t('admin.settings.rotate_key')}
            </button>
            <button
              onClick={() => setApiMessage(t('admin.settings.api_revoke_pending'))}
              className="btn btn-outline text-xs px-3"
            >
              {t('admin.settings.revoke_key')}
            </button>
          </div>
          {apiMessage && <p className="text-xs text-dc1-text-muted">{apiMessage}</p>}
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h2 className="section-heading">{t('admin.settings.ssh_keys')}</h2>
            <p className="text-dc1-text-muted text-sm mt-1">{t('admin.settings.ssh_keys_subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={newSshLabel}
              onChange={(e) => setNewSshLabel(e.target.value)}
              placeholder={t('admin.settings.ssh_label_placeholder')}
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <input
              type="text"
              value={newSshPublicKey}
              onChange={(e) => setNewSshPublicKey(e.target.value)}
              placeholder={t('admin.settings.ssh_key_placeholder')}
              className="sm:col-span-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
          </div>
          {sshError && <p className="text-xs text-status-error">{sshError}</p>}
          <div className="flex justify-end">
            <button onClick={handleAddSshKey} className="btn btn-primary text-sm min-h-[44px]">
              {t('admin.settings.add_ssh_key')}
            </button>
          </div>
          <div className="space-y-2">
            {sshKeys.length === 0 ? (
              <p className="text-xs text-dc1-text-muted">{t('admin.settings.no_ssh_keys')}</p>
            ) : (
              sshKeys.map((key) => (
                <div key={key.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-dc1-text-primary font-medium">{key.label}</p>
                      <p className="text-xs text-dc1-text-muted">{key.fingerprint}</p>
                      <p className="text-xs text-dc1-text-muted mt-1">
                        {`${t('admin.settings.added')} ${new Date(key.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveSshKey(key.id)}
                      className="px-3 py-1.5 rounded border border-status-error/30 text-status-error text-xs hover:bg-status-error/10"
                    >
                      {t('admin.settings.remove')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-6 space-y-5">
          <div>
            <h2 className="section-heading">{t('admin.settings.notifications')}</h2>
            <p className="text-dc1-text-muted text-sm mt-1">{t('admin.settings.notifications_subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: 'email', label: t('admin.settings.channel_email') },
              { key: 'telegram', label: t('admin.settings.channel_telegram') },
              { key: 'webhook', label: t('admin.settings.channel_webhook') },
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
              <label className="text-xs text-dc1-text-muted block mb-1">{t('admin.settings.failed_jobs_threshold')}</label>
              <input
                type="number"
                min={1}
                value={notificationPrefs.failedJobsThreshold}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    failedJobsThreshold: Number(e.target.value || 1),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dc1-text-muted block mb-1">{t('admin.settings.stale_provider_threshold')}</label>
              <input
                type="number"
                min={1}
                value={notificationPrefs.staleProviderThresholdMinutes}
                onChange={(e) =>
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    staleProviderThresholdMinutes: Number(e.target.value || 1),
                  }))
                }
                className="w-full px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
              />
            </div>
          </div>
          {notificationMessage && <p className="text-xs text-status-success">{notificationMessage}</p>}
          <div className="flex justify-end">
            <button onClick={handleSaveNotifications} className="btn btn-primary text-sm min-h-[44px]">
              {t('admin.settings.save_notifications')}
            </button>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h2 className="section-heading">{t('admin.settings.team_settings')}</h2>
            <p className="text-dc1-text-muted text-sm mt-1">{t('admin.settings.team_settings_subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder={t('admin.settings.name')}
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t('admin.settings.email_placeholder')}
              className="sm:col-span-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMemberItem['role'])}
              className="sm:col-span-1 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary text-sm"
            >
              <option value="member">{t('admin.settings.role_member')}</option>
              <option value="admin">{t('admin.settings.role_admin')}</option>
              <option value="owner">{t('admin.settings.role_owner')}</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={handleInviteMember} className="btn btn-primary text-sm min-h-[44px]">
              {t('admin.settings.invite_admin')}
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
                    {`${t(`admin.settings.role_${member.role}`)} • ${t(`admin.settings.status_${member.status}`)}`}
                  </p>
                </div>
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="px-3 py-1.5 rounded border border-status-error/30 text-status-error text-xs hover:bg-status-error/10"
                  >
                    {t('admin.settings.remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
