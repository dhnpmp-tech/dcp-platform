'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

// ── Icons ───────────────────────────────────────────────────────────────────
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
const ReferralIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

// ── Types ────────────────────────────────────────────────────────────────────
interface GroupInfo {
  id: number
  name: string
  description: string | null
  status: string
  owner_id: number
  member_count: number
  group_earnings_halala: number
  created_at: string
}

interface GroupMember {
  id: number
  name: string
  gpu_model: string
  gpu_count: number
  vram_gb: number
  status: string
  group_role: string
  total_earnings_halala: number
  total_jobs: number
  created_at: string
}

interface GroupStats {
  total_gpus: number
  total_vram_gb: number
  total_earnings_sar: number
  total_jobs: number
  online_count: number
}

interface GroupDetail {
  group: GroupInfo
  members: GroupMember[]
  stats: GroupStats
}

interface ReferralInfo {
  referral_code: string
  referral_link: string
  total_referrals: number
  total_bonus_sar: number
}

interface ReferralEntry {
  id: number
  referred_name: string
  gpu_model: string
  provider_status: string
  status: string
  bonus_pct: number
  total_bonus_halala: number
  created_at: string
  expires_at: string
}

// ── Component ────────────────────────────────────────────────────────────────
export default function FleetDashboard() {
  const router = useRouter()
  const { t } = useLanguage()

  // State
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'groups' | 'referrals'>('groups')
  const [ownedGroups, setOwnedGroups] = useState<GroupInfo[]>([])
  const [membership, setMembership] = useState<GroupInfo | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null)
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [referrals, setReferrals] = useState<ReferralEntry[]>([])
  const [copiedRef, setCopiedRef] = useState(false)

  // Create group modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberEmail, setAddMemberEmail] = useState('')
  const [addMemberLoading, setAddMemberLoading] = useState(false)
  const [addMemberError, setAddMemberError] = useState('')

  const getKey = () => localStorage.getItem('dc1_provider_key') || ''

  const navItems = [
    { label: t('nav.dashboard'), href: '/provider', icon: <HomeIcon /> },
    { label: t('nav.jobs'), href: '/provider/jobs', icon: <LightningIcon /> },
    { label: t('nav.earnings'), href: '/provider/earnings', icon: <CurrencyIcon /> },
    { label: t('nav.gpu_metrics'), href: '/provider/gpu', icon: <GpuIcon /> },
    { label: 'Fleet', href: '/provider/fleet', icon: <FleetIcon /> },
    { label: t('nav.settings'), href: '/provider/settings', icon: <GearIcon /> },
  ]

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    const key = getKey()
    if (!key) { router.push('/login?role=provider&method=apikey'); return }
    try {
      const res = await fetch(`${API_BASE}/providers/groups?key=${encodeURIComponent(key)}`)
      if (!res.ok) return
      const data = await res.json()
      setOwnedGroups(data.owned_groups || [])
      setMembership(data.membership || null)
    } catch { /* ignore */ }
  }, [router])

  const loadGroupDetail = useCallback(async (groupId: number) => {
    const key = getKey()
    try {
      const res = await fetch(`${API_BASE}/providers/groups/${groupId}?key=${encodeURIComponent(key)}`)
      if (!res.ok) return
      const data = await res.json()
      setSelectedGroup(data)
    } catch { /* ignore */ }
  }, [])

  const loadReferralInfo = useCallback(async () => {
    const key = getKey()
    if (!key) return
    try {
      const [infoRes, listRes] = await Promise.all([
        fetch(`${API_BASE}/providers/me/referral-code?key=${encodeURIComponent(key)}`),
        fetch(`${API_BASE}/providers/me/referrals?key=${encodeURIComponent(key)}`),
      ])
      if (infoRes.ok) setReferralInfo(await infoRes.json())
      if (listRes.ok) {
        const listData = await listRes.json()
        setReferrals(listData.referrals || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([loadGroups(), loadReferralInfo()])
      setLoading(false)
    }
    init()
  }, [loadGroups, loadReferralInfo])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    setCreateLoading(true)
    try {
      const res = await fetch(`${API_BASE}/providers/groups?key=${encodeURIComponent(getKey())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }),
      })
      if (res.ok) {
        setShowCreateModal(false)
        setNewGroupName('')
        setNewGroupDesc('')
        await loadGroups()
      }
    } catch { /* ignore */ }
    finally { setCreateLoading(false) }
  }

  const handleAddMember = async () => {
    if (!addMemberEmail.trim() || !selectedGroup) return
    setAddMemberLoading(true)
    setAddMemberError('')
    try {
      const res = await fetch(
        `${API_BASE}/providers/groups/${selectedGroup.group.id}/members?key=${encodeURIComponent(getKey())}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: addMemberEmail.trim() }),
        }
      )
      if (res.ok) {
        setShowAddMember(false)
        setAddMemberEmail('')
        await loadGroupDetail(selectedGroup.group.id)
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setAddMemberError(err.error || 'Failed to add member')
      }
    } catch {
      setAddMemberError('Network error')
    }
    finally { setAddMemberLoading(false) }
  }

  const handleRemoveMember = async (memberId: number) => {
    if (!selectedGroup) return
    try {
      await fetch(
        `${API_BASE}/providers/groups/${selectedGroup.group.id}/members/${memberId}?key=${encodeURIComponent(getKey())}`,
        { method: 'DELETE' }
      )
      await loadGroupDetail(selectedGroup.group.id)
    } catch { /* ignore */ }
  }

  const copyReferralLink = async () => {
    if (!referralInfo) return
    try {
      await navigator.clipboard.writeText(referralInfo.referral_link)
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 2000)
    } catch { /* ignore */ }
  }

  const formatSar = (halala: number) => `SAR ${(halala / 100).toFixed(2)}`

  // ── Loading / Auth guard ──────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="provider" userName="Provider">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dc1-amber border-t-transparent" />
        </div>
      </DashboardLayout>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={navItems} role="provider" userName="Provider">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">Fleet Management</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Manage your provider groups and referral program
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-dc1-surface-l2 p-1 w-fit">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'groups'
                ? 'bg-dc1-amber text-black'
                : 'text-dc1-text-secondary hover:text-dc1-text-primary'
            }`}
          >
            Provider Groups
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'referrals'
                ? 'bg-dc1-amber text-black'
                : 'text-dc1-text-secondary hover:text-dc1-text-primary'
            }`}
          >
            Referrals
          </button>
        </div>

        {/* ═══ GROUPS TAB ════════════════════════════════════════════════════ */}
        {activeTab === 'groups' && (
          <div className="space-y-6">
            {/* Group overview cards */}
            {!selectedGroup ? (
              <>
                {/* My membership */}
                {membership && (
                  <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                    <h3 className="text-sm font-semibold text-dc1-text-muted uppercase tracking-wide mb-3">
                      Your Current Group
                    </h3>
                    <button
                      onClick={() => loadGroupDetail(membership.id)}
                      className="flex items-center justify-between w-full text-left hover:bg-dc1-surface-l2 -mx-2 px-2 py-2 rounded-lg transition-colors"
                    >
                      <div>
                        <p className="text-lg font-semibold text-dc1-text-primary">{membership.name}</p>
                        <p className="text-sm text-dc1-text-secondary">
                          {membership.member_count} members &middot; {membership.status}
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-dc1-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Owned groups */}
                <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-dc1-text-muted uppercase tracking-wide">
                      Your Groups
                    </h3>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="btn-primary px-3 py-1.5 text-sm"
                    >
                      + Create Group
                    </button>
                  </div>

                  {ownedGroups.length === 0 ? (
                    <div className="text-center py-12">
                      <FleetIcon />
                      <p className="mt-3 text-dc1-text-secondary">No groups yet</p>
                      <p className="text-sm text-dc1-text-muted mt-1">
                        Create a group to manage multiple provider nodes together
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ownedGroups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => loadGroupDetail(group.id)}
                          className="flex items-center justify-between w-full text-left rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4 hover:border-dc1-amber/40 transition-colors"
                        >
                          <div>
                            <p className="font-semibold text-dc1-text-primary">{group.name}</p>
                            <p className="text-sm text-dc1-text-secondary mt-0.5">
                              {group.member_count} members &middot; {formatSar(group.group_earnings_halala)} earned
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              group.status === 'active'
                                ? 'bg-status-success/10 text-status-success'
                                : 'bg-dc1-surface-l3 text-dc1-text-muted'
                            }`}>
                              {group.status}
                            </span>
                            <svg className="w-5 h-5 text-dc1-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ── Group Detail View ──────────────────────────────────────── */
              <div className="space-y-6">
                {/* Back button + header */}
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="flex items-center gap-2 text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to groups
                </button>

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-dc1-text-primary">{selectedGroup.group.name}</h2>
                    {selectedGroup.group.description && (
                      <p className="text-sm text-dc1-text-secondary mt-1">{selectedGroup.group.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowAddMember(true); setAddMemberError('') }}
                    className="btn-primary px-3 py-1.5 text-sm"
                  >
                    + Add Member
                  </button>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Members', value: selectedGroup.members.length },
                    { label: 'Online', value: selectedGroup.stats.online_count },
                    { label: 'Total GPUs', value: selectedGroup.stats.total_gpus },
                    { label: 'Total VRAM', value: `${selectedGroup.stats.total_vram_gb} GB` },
                    { label: 'Earnings', value: `SAR ${selectedGroup.stats.total_earnings_sar.toFixed(2)}` },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 text-center">
                      <p className="text-xs text-dc1-text-muted uppercase tracking-wide">{stat.label}</p>
                      <p className="text-lg font-bold text-dc1-text-primary mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Member table */}
                <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dc1-border bg-dc1-surface-l2">
                          <th className="text-left px-4 py-3 font-medium text-dc1-text-muted">Provider</th>
                          <th className="text-left px-4 py-3 font-medium text-dc1-text-muted">GPU</th>
                          <th className="text-center px-4 py-3 font-medium text-dc1-text-muted">Status</th>
                          <th className="text-right px-4 py-3 font-medium text-dc1-text-muted">Jobs</th>
                          <th className="text-right px-4 py-3 font-medium text-dc1-text-muted">Earnings</th>
                          <th className="text-center px-4 py-3 font-medium text-dc1-text-muted">Role</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dc1-border">
                        {selectedGroup.members.map(member => (
                          <tr key={member.id} className="hover:bg-dc1-surface-l2/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-dc1-text-primary">{member.name}</p>
                              <p className="text-xs text-dc1-text-muted">ID: {member.id}</p>
                            </td>
                            <td className="px-4 py-3 text-dc1-text-secondary">
                              {member.gpu_count || 1}x {member.gpu_model || 'Unknown'}
                              {member.vram_gb ? ` (${member.vram_gb} GB)` : ''}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                                member.status === 'online'
                                  ? 'bg-status-success/10 text-status-success'
                                  : member.status === 'idle'
                                    ? 'bg-dc1-amber/10 text-dc1-amber'
                                    : 'bg-dc1-surface-l3 text-dc1-text-muted'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  member.status === 'online' ? 'bg-status-success' :
                                  member.status === 'idle' ? 'bg-dc1-amber' : 'bg-dc1-text-muted'
                                }`} />
                                {member.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-dc1-text-secondary">{member.total_jobs || 0}</td>
                            <td className="px-4 py-3 text-right text-dc1-amber font-medium">
                              {formatSar(member.total_earnings_halala || 0)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                member.group_role === 'admin'
                                  ? 'bg-dc1-amber/10 text-dc1-amber'
                                  : 'bg-dc1-surface-l3 text-dc1-text-muted'
                              }`}>
                                {member.group_role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {member.group_role !== 'admin' && (
                                <button
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                  title="Remove from group"
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Create Group Modal ─────────────────────────────────────── */}
            {showCreateModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 shadow-xl space-y-4">
                  <h3 className="text-lg font-bold text-dc1-text-primary">Create Provider Group</h3>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="label" htmlFor="group-name">Group Name</label>
                      <input
                        id="group-name"
                        type="text"
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        placeholder="e.g. CCSEZ GPU Farm"
                        className="input w-full"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="label" htmlFor="group-desc">Description <span className="font-normal text-dc1-text-muted">(optional)</span></label>
                      <input
                        id="group-desc"
                        type="text"
                        value={newGroupDesc}
                        onChange={e => setNewGroupDesc(e.target.value)}
                        placeholder="e.g. Our data center in Riyadh"
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowCreateModal(false)} className="btn-secondary px-4 py-2 text-sm">
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateGroup}
                      disabled={createLoading || !newGroupName.trim()}
                      className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {createLoading ? 'Creating...' : 'Create Group'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Add Member Modal ───────────────────────────────────────── */}
            {showAddMember && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 shadow-xl space-y-4">
                  <h3 className="text-lg font-bold text-dc1-text-primary">Add Member</h3>
                  <div className="space-y-1.5">
                    <label className="label" htmlFor="member-email">Provider Email</label>
                    <input
                      id="member-email"
                      type="email"
                      value={addMemberEmail}
                      onChange={e => setAddMemberEmail(e.target.value)}
                      placeholder="provider@example.com"
                      className="input w-full"
                      autoFocus
                    />
                    {addMemberError && (
                      <p className="text-sm text-red-400">{addMemberError}</p>
                    )}
                    <p className="text-xs text-dc1-text-muted">
                      The provider must be registered and not already in a group.
                    </p>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowAddMember(false)} className="btn-secondary px-4 py-2 text-sm">
                      Cancel
                    </button>
                    <button
                      onClick={handleAddMember}
                      disabled={addMemberLoading || !addMemberEmail.trim()}
                      className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {addMemberLoading ? 'Adding...' : 'Add Member'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ REFERRALS TAB ═════════════════════════════════════════════════ */}
        {activeTab === 'referrals' && (
          <div className="space-y-6">
            {/* Referral code card */}
            {referralInfo && (
              <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-dc1-text-muted uppercase tracking-wide">
                  Your Referral Link
                </h3>
                <div className="flex items-center gap-3">
                  <code className="flex-1 rounded-lg border border-dc1-border bg-dc1-surface-l2 px-4 py-2.5 text-sm text-dc1-amber font-mono break-all">
                    {referralInfo.referral_link}
                  </code>
                  <button
                    onClick={copyReferralLink}
                    className="btn-secondary px-4 py-2.5 text-sm whitespace-nowrap"
                  >
                    {copiedRef ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-dc1-text-muted">Code: </span>
                    <span className="font-mono font-semibold text-dc1-amber">{referralInfo.referral_code}</span>
                  </div>
                  <div>
                    <span className="text-dc1-text-muted">Total referrals: </span>
                    <span className="font-semibold text-dc1-text-primary">{referralInfo.total_referrals}</span>
                  </div>
                  <div>
                    <span className="text-dc1-text-muted">Bonus earned: </span>
                    <span className="font-semibold text-dc1-amber">SAR {referralInfo.total_bonus_sar.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-dc1-text-muted">
                  Share your referral link. When a new provider registers with your code, you earn 5% of their earnings for 30 days.
                </p>
              </div>
            )}

            {/* Referral list */}
            <div className="rounded-xl border border-dc1-border bg-dc1-surface-l1 overflow-hidden">
              <div className="px-5 py-4 border-b border-dc1-border">
                <h3 className="text-sm font-semibold text-dc1-text-muted uppercase tracking-wide">
                  Your Referrals ({referrals.length})
                </h3>
              </div>
              {referrals.length === 0 ? (
                <div className="text-center py-12">
                  <ReferralIcon />
                  <p className="mt-3 text-dc1-text-secondary">No referrals yet</p>
                  <p className="text-sm text-dc1-text-muted mt-1">
                    Share your referral link to start earning bonuses
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dc1-border bg-dc1-surface-l2">
                        <th className="text-left px-4 py-3 font-medium text-dc1-text-muted">Provider</th>
                        <th className="text-left px-4 py-3 font-medium text-dc1-text-muted">GPU</th>
                        <th className="text-center px-4 py-3 font-medium text-dc1-text-muted">Status</th>
                        <th className="text-center px-4 py-3 font-medium text-dc1-text-muted">Bonus %</th>
                        <th className="text-right px-4 py-3 font-medium text-dc1-text-muted">Bonus Earned</th>
                        <th className="text-right px-4 py-3 font-medium text-dc1-text-muted">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dc1-border">
                      {referrals.map(ref => (
                        <tr key={ref.id} className="hover:bg-dc1-surface-l2/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-dc1-text-primary">{ref.referred_name}</td>
                          <td className="px-4 py-3 text-dc1-text-secondary">{ref.gpu_model || 'Unknown'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              ref.status === 'active'
                                ? 'bg-status-success/10 text-status-success'
                                : ref.status === 'expired'
                                  ? 'bg-dc1-surface-l3 text-dc1-text-muted'
                                  : 'bg-dc1-amber/10 text-dc1-amber'
                            }`}>
                              {ref.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-dc1-text-secondary">{ref.bonus_pct}%</td>
                          <td className="px-4 py-3 text-right text-dc1-amber font-medium">
                            {formatSar(ref.total_bonus_halala || 0)}
                          </td>
                          <td className="px-4 py-3 text-right text-dc1-text-muted">
                            {ref.expires_at ? new Date(ref.expires_at).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
