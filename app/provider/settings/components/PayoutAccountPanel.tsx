'use client'

import { useCallback, useEffect, useState } from 'react'

interface PayoutAccountState {
  payout_iban: string | null
  payout_holder_name: string | null
  moyasar_payout_account_id: string | null
  registered_at: string | null
}

interface PayoutAccountPanelProps {
  apiBase: string
  providerId: number
  providerApiKey: string
}

function maskIban(iban: string | null): string {
  if (!iban) return ''
  const clean = iban.toUpperCase().replace(/\s+/g, '')
  if (clean.length < 8) return clean
  return `${clean.slice(0, 4)} •••• •••• •••• ${clean.slice(-4)}`
}

/**
 * Provider IBAN registration for Moyasar-routed payouts.
 *
 * When the renter pays for compute, 75% accrues to the provider's
 * `claimable_earnings_halala` balance. The provider requests a payout, and
 * once the admin approves, the backend disburses to the IBAN registered here
 * via Moyasar's POST /v1/payouts. Without an IBAN on file the admin can only
 * process the payout manually via bank transfer.
 */
export default function PayoutAccountPanel({ apiBase, providerId, providerApiKey }: PayoutAccountPanelProps) {
  const [account, setAccount] = useState<PayoutAccountState | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [iban, setIban] = useState('')
  const [holderName, setHolderName] = useState('')

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/providers/me?key=${encodeURIComponent(providerApiKey)}`)
      if (!res.ok) {
        setError('Could not load payout account')
        setLoading(false)
        return
      }
      const data = await res.json()
      setAccount({
        payout_iban: data.payout_iban || null,
        payout_holder_name: data.payout_holder_name || null,
        moyasar_payout_account_id: data.moyasar_payout_account_id || null,
        registered_at: data.payout_account_registered_at || null,
      })
      if (data.payout_iban) {
        setIban(data.payout_iban)
        setHolderName(data.payout_holder_name || '')
      }
    } catch {
      setError('Network error loading payout account')
    } finally {
      setLoading(false)
    }
  }, [apiBase, providerApiKey])

  useEffect(() => {
    void fetchAccount()
  }, [fetchAccount])

  const handleSave = async () => {
    setError('')
    setSuccess('')

    const normalizedIban = iban.trim().toUpperCase().replace(/\s+/g, '')
    if (!/^SA\d{22}$/.test(normalizedIban)) {
      setError('IBAN must be a Saudi IBAN (SA followed by 22 digits)')
      return
    }
    if (!holderName.trim() || holderName.trim().length < 2) {
      setError('Account holder name is required (as printed on the bank account)')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/providers/${providerId}/payout-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-provider-key': providerApiKey,
        },
        body: JSON.stringify({
          iban: normalizedIban,
          holder_name: holderName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const messages: Record<string, string> = {
          INVALID_IBAN: 'Invalid Saudi IBAN — must be SA followed by 22 digits',
          INVALID_HOLDER_NAME: 'Account holder name is required',
        }
        setError(messages[data.error] || data.message || 'Could not register payout account')
        return
      }
      setSuccess('Payout account registered. Future payouts will route via Moyasar.')
      setEditing(false)
      await fetchAccount()
      setTimeout(() => setSuccess(''), 5000)
    } catch {
      setError('Network error saving payout account')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-6">
        <div className="animate-pulse h-5 w-40 bg-dc1-bg-primary rounded mb-3" />
        <div className="animate-pulse h-4 w-72 bg-dc1-bg-primary rounded" />
      </div>
    )
  }

  const hasAccount = !!account?.payout_iban

  return (
    <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border overflow-hidden">
      <div className="px-6 py-4 border-b border-dc1-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-dc1-text-primary">Payout account</h2>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Saudi IBAN where DCP sends your provider earnings. Disbursed automatically via Moyasar after admin approval.
            </p>
          </div>
          {hasAccount && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30">
              Registered
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5">
        {!editing && hasAccount && (
          <>
            <div className="rounded-md border border-dc1-border bg-dc1-bg-primary px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-dc1-text-muted uppercase tracking-wider">IBAN</span>
                <span className="text-xs text-dc1-text-muted">
                  Registered {account!.registered_at
                    ? new Date(account!.registered_at).toLocaleDateString('en-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '--'}
                </span>
              </div>
              <p className="text-sm font-mono text-dc1-text-primary tracking-wider">
                {maskIban(account!.payout_iban)}
              </p>
              <p className="text-xs text-dc1-text-secondary mt-2">
                Holder: {account!.payout_holder_name}
              </p>
              {account!.moyasar_payout_account_id && (
                <p className="text-[10px] text-dc1-text-muted mt-1 font-mono">
                  Moyasar account: {account!.moyasar_payout_account_id.slice(0, 8)}...
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-dc1-accent-primary hover:opacity-80"
            >
              Update IBAN →
            </button>
          </>
        )}

        {!editing && !hasAccount && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded bg-dc1-accent-primary text-dc1-bg-primary font-medium text-sm hover:opacity-90"
          >
            Register payout IBAN
          </button>
        )}

        {editing && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-dc1-text-secondary uppercase tracking-wider mb-2">
                Saudi IBAN
              </label>
              <input
                type="text"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="SA00 0000 0000 0000 0000 0000"
                maxLength={32}
                className="w-full px-3 py-2 rounded border border-dc1-border bg-dc1-bg-primary text-sm font-mono text-dc1-text-primary tracking-wider"
              />
              <p className="text-xs text-dc1-text-muted mt-1">
                SA followed by 22 digits. Spaces are stripped automatically.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-dc1-text-secondary uppercase tracking-wider mb-2">
                Account holder name
              </label>
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="Full name as on the bank account"
                maxLength={140}
                className="w-full px-3 py-2 rounded border border-dc1-border bg-dc1-bg-primary text-sm text-dc1-text-primary"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center gap-3 pt-2 border-t border-dc1-border">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded bg-dc1-accent-primary text-dc1-bg-primary font-medium text-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : hasAccount ? 'Update IBAN' : 'Register IBAN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setError('')
                  if (account?.payout_iban) {
                    setIban(account.payout_iban)
                    setHolderName(account.payout_holder_name || '')
                  } else {
                    setIban('')
                    setHolderName('')
                  }
                }}
                disabled={saving}
                className="px-4 py-2 rounded border border-dc1-border text-sm text-dc1-text-secondary hover:text-dc1-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {success && (
          <p className="text-sm text-green-400 mt-3">{success}</p>
        )}
      </div>
    </div>
  )
}
