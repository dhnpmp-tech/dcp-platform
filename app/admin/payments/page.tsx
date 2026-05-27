'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'
import { getApiBase } from '../../../lib/api'

interface PayoutRow {
  payout_id: string
  provider_id: number
  provider_name: string | null
  provider_email: string | null
  amount_sar: number
  amount_halala: number
  status: 'pending' | 'processing' | 'paid' | 'rejected'
  moyasar_payout_id: string | null
  moyasar_status: string | null
  failure_reason: string | null
  requested_at: string
  processed_at: string | null
  payment_ref: string | null
}

interface BillingRow {
  request_id: string
  renter_id: number
  renter_name: string | null
  renter_email: string | null
  provider_id: number | null
  cost_sar: number
  provider_earned_sar: number
  status: 'settled' | 'insufficient_balance' | 'error'
  error_code: string | null
  settled_at: string
}

interface AutoTopupRow {
  attempt_id: string
  renter_id: number
  renter_name: string | null
  renter_email: string | null
  amount_sar: number
  status: 'initiated' | 'paid' | 'failed' | '3ds_required' | 'capped' | 'paused'
  moyasar_payment_id: string | null
  trigger_reason: string | null
  balance_before_sar: number | null
  balance_after_sar: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface AuditData {
  payouts: PayoutRow[]
  billing: BillingRow[]
  auto_topup: AutoTopupRow[]
  summary: {
    payouts: Record<string, number>
    billing_attempts: Record<string, number>
    auto_topup: Record<string, number>
  }
}

type Tab = 'payouts' | 'billing' | 'auto_topup'

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  processing: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  paid: 'bg-green-500/15 text-green-400 border border-green-500/30',
  settled: 'bg-green-500/15 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
  insufficient_balance: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  error: 'bg-red-500/15 text-red-400 border border-red-500/30',
  initiated: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  '3ds_required': 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  capped: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  paused: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGES[status] || 'bg-dc1-bg-primary text-dc1-text-secondary border border-dc1-border'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{status}</span>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-SA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function shortId(id: string | null, n = 8): string {
  if (!id) return '—'
  return id.length > n ? `${id.slice(0, n)}…` : id
}

export default function AdminPaymentsAuditPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const API_BASE = getApiBase()

  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('payouts')
  const [refreshing, setRefreshing] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  const navItems = useMemo(
    () => [
      { label: 'Overview', href: '/admin' },
      { label: 'Providers', href: '/admin/providers' },
      { label: 'Renters', href: '/admin/renters' },
      { label: 'Jobs', href: '/admin/jobs' },
      { label: 'Payments', href: '/admin/payments' },
      { label: 'Withdrawals', href: '/admin/withdrawals' },
      { label: 'Finance', href: '/admin/finance' },
    ],
    []
  )

  useEffect(() => {
    const stored = localStorage.getItem('dc1_admin_token')
    if (!stored) {
      router.push('/login')
      return
    }
    setToken(stored)
  }, [router])

  const fetchAudit = useCallback(async () => {
    if (!token) return
    setError('')
    setRefreshing(true)
    try {
      const res = await fetch(`${API_BASE}/admin/payments/audit?limit=100`, {
        headers: { 'x-admin-token': token },
      })
      if (!res.ok) {
        setError(`HTTP ${res.status} — admin token may be invalid`)
        setData(null)
      } else {
        setData(await res.json())
      }
    } catch (err) {
      setError('Network error loading audit feed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [API_BASE, token])

  useEffect(() => {
    void fetchAudit()
  }, [fetchAudit])

  const handlePayoutSync = async (payoutId: string) => {
    if (!token) return
    setActionMessage('')
    try {
      const res = await fetch(`${API_BASE}/admin/payouts/${payoutId}/sync`, {
        method: 'POST',
        headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
      })
      const body = await res.json()
      if (!res.ok) {
        setActionMessage(`Sync failed: ${body.error || body.message || res.status}`)
      } else {
        setActionMessage(`Sync result: status=${body.status} moyasar=${body.moyasarStatus || '—'} transitioned=${body.transitioned}`)
        await fetchAudit()
      }
    } catch {
      setActionMessage('Sync request errored — network/auth?')
    }
  }

  if (loading) {
    return (
      <DashboardLayout navItems={navItems} role="admin" userName="Admin">
        <div className="max-w-7xl mx-auto p-6">
          <div className="animate-pulse h-8 w-64 bg-dc1-bg-primary rounded mb-4" />
          <div className="animate-pulse h-32 w-full bg-dc1-bg-primary rounded" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout navItems={navItems} role="admin" userName="Admin">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-dc1-text-primary">Payments audit</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Live view of Moyasar payouts, /v1 inference settlement attempts, and auto-top-up charges.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAudit}
            disabled={refreshing}
            className="px-3 py-1.5 rounded border border-dc1-border text-sm text-dc1-text-secondary hover:text-dc1-text-primary disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
        )}

        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard title="Payouts" counts={data.summary.payouts} />
            <SummaryCard title="Billing attempts (/v1)" counts={data.summary.billing_attempts} />
            <SummaryCard title="Auto-top-up attempts" counts={data.summary.auto_topup} />
          </div>
        )}

        <div className="flex gap-1 border-b border-dc1-border">
          {(['payouts', 'billing', 'auto_topup'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-dc1-accent-primary text-dc1-text-primary'
                  : 'border-transparent text-dc1-text-secondary hover:text-dc1-text-primary'
              }`}
            >
              {id === 'payouts' ? 'Payouts' : id === 'billing' ? 'Billing attempts' : 'Auto-top-up'}
            </button>
          ))}
        </div>

        {actionMessage && (
          <div className="rounded-md border border-dc1-border bg-dc1-bg-primary p-3 text-xs text-dc1-text-secondary">
            {actionMessage}
          </div>
        )}

        {tab === 'payouts' && <PayoutsTable rows={data?.payouts || []} onSync={handlePayoutSync} />}
        {tab === 'billing' && <BillingTable rows={data?.billing || []} />}
        {tab === 'auto_topup' && <AutoTopupTable rows={data?.auto_topup || []} />}
      </div>
    </DashboardLayout>
  )
}

function SummaryCard({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts)
  const total = entries.reduce((s, [, n]) => s + n, 0)
  return (
    <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-4">
      <h3 className="text-sm font-semibold text-dc1-text-primary mb-3">{title}</h3>
      <div className="text-2xl font-mono font-bold text-dc1-text-primary mb-2">{total}</div>
      <div className="flex flex-wrap gap-2">
        {entries.length === 0 ? (
          <span className="text-xs text-dc1-text-muted">No records yet</span>
        ) : (
          entries.map(([s, n]) => (
            <div key={s} className="flex items-center gap-1">
              <StatusBadge status={s} />
              <span className="text-xs text-dc1-text-secondary font-mono">{n}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PayoutsTable({ rows, onSync }: { rows: PayoutRow[]; onSync: (id: string) => void }) {
  if (rows.length === 0) return <Empty label="No payouts yet." />
  return (
    <div className="overflow-x-auto bg-dc1-bg-secondary rounded-lg border border-dc1-border">
      <table className="w-full text-sm">
        <thead className="bg-dc1-bg-primary border-b border-dc1-border">
          <tr>
            <Th>Payout</Th>
            <Th>Provider</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <Th>Moyasar</Th>
            <Th>Requested</Th>
            <Th>Processed</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border">
          {rows.map((r) => (
            <tr key={r.payout_id} className="hover:bg-dc1-bg-primary/50">
              <Td className="font-mono text-xs">{shortId(r.payout_id, 10)}</Td>
              <Td>
                <div className="text-dc1-text-primary">{r.provider_name || `Provider ${r.provider_id}`}</div>
                {r.provider_email && (
                  <div className="text-xs text-dc1-text-muted">{r.provider_email}</div>
                )}
              </Td>
              <Td className="font-mono">{r.amount_sar.toFixed(2)} SAR</Td>
              <Td>
                <StatusBadge status={r.status} />
                {r.failure_reason && (
                  <div className="text-xs text-red-400 mt-1">{r.failure_reason}</div>
                )}
              </Td>
              <Td>
                <div className="font-mono text-xs">{shortId(r.moyasar_payout_id)}</div>
                {r.moyasar_status && (
                  <div className="text-xs text-dc1-text-muted">{r.moyasar_status}</div>
                )}
              </Td>
              <Td className="text-xs">{formatDateTime(r.requested_at)}</Td>
              <Td className="text-xs">{formatDateTime(r.processed_at)}</Td>
              <Td>
                {r.status === 'processing' && r.moyasar_payout_id && (
                  <button
                    type="button"
                    onClick={() => onSync(r.payout_id)}
                    className="text-xs text-dc1-accent-primary hover:underline"
                  >
                    Sync
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BillingTable({ rows }: { rows: BillingRow[] }) {
  if (rows.length === 0) return <Empty label="No /v1 settlement attempts recorded." />
  return (
    <div className="overflow-x-auto bg-dc1-bg-secondary rounded-lg border border-dc1-border">
      <table className="w-full text-sm">
        <thead className="bg-dc1-bg-primary border-b border-dc1-border">
          <tr>
            <Th>Request</Th>
            <Th>Renter</Th>
            <Th>Cost</Th>
            <Th>Provider earned</Th>
            <Th>Status</Th>
            <Th>Settled</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border">
          {rows.map((r) => (
            <tr key={r.request_id} className="hover:bg-dc1-bg-primary/50">
              <Td className="font-mono text-xs">{shortId(r.request_id, 12)}</Td>
              <Td>
                <div className="text-dc1-text-primary">{r.renter_name || `Renter ${r.renter_id}`}</div>
                {r.renter_email && (
                  <div className="text-xs text-dc1-text-muted">{r.renter_email}</div>
                )}
              </Td>
              <Td className="font-mono">{r.cost_sar.toFixed(2)} SAR</Td>
              <Td className="font-mono">{r.provider_earned_sar.toFixed(2)} SAR</Td>
              <Td>
                <StatusBadge status={r.status} />
                {r.error_code && (
                  <div className="text-xs text-red-400 mt-1">{r.error_code}</div>
                )}
              </Td>
              <Td className="text-xs">{formatDateTime(r.settled_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AutoTopupTable({ rows }: { rows: AutoTopupRow[] }) {
  if (rows.length === 0) return <Empty label="No auto-top-up attempts yet." />
  return (
    <div className="overflow-x-auto bg-dc1-bg-secondary rounded-lg border border-dc1-border">
      <table className="w-full text-sm">
        <thead className="bg-dc1-bg-primary border-b border-dc1-border">
          <tr>
            <Th>Attempt</Th>
            <Th>Renter</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <Th>Balance after</Th>
            <Th>Trigger</Th>
            <Th>Created</Th>
            <Th>Completed</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dc1-border">
          {rows.map((r) => (
            <tr key={r.attempt_id} className="hover:bg-dc1-bg-primary/50">
              <Td className="font-mono text-xs">{shortId(r.attempt_id, 10)}</Td>
              <Td>
                <div className="text-dc1-text-primary">{r.renter_name || `Renter ${r.renter_id}`}</div>
                {r.renter_email && (
                  <div className="text-xs text-dc1-text-muted">{r.renter_email}</div>
                )}
              </Td>
              <Td className="font-mono">{r.amount_sar.toFixed(2)} SAR</Td>
              <Td>
                <StatusBadge status={r.status} />
                {r.error_message && (
                  <div className="text-xs text-red-400 mt-1">{r.error_message}</div>
                )}
              </Td>
              <Td className="font-mono">
                {r.balance_after_sar != null ? `${r.balance_after_sar.toFixed(2)} SAR` : '—'}
              </Td>
              <Td className="text-xs text-dc1-text-muted">{r.trigger_reason || '—'}</Td>
              <Td className="text-xs">{formatDateTime(r.created_at)}</Td>
              <Td className="text-xs">{formatDateTime(r.completed_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
}

function Empty({ label }: { label: string }) {
  return (
    <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-8 text-center">
      <p className="text-sm text-dc1-text-secondary">{label}</p>
    </div>
  )
}
