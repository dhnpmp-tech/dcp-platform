'use client'

import { useCallback, useEffect, useState } from 'react'

interface AutoTopupSettings {
  enabled: boolean
  threshold_sar: number
  amount_sar: number
  monthly_cap_sar: number
  monthly_used_sar: number
  paused_until: string | null
  consecutive_failures: number
  last_attempt_at: string | null
  card_on_file: {
    brand: string | null
    last4: string | null
    saved_at: string | null
  } | null
}

interface AutoTopupPanelProps {
  apiBase: string
  renterKey: string
  /**
   * If true, the renter just completed a top-up that included save_card=true.
   * We show a banner suggesting they enable auto-top-up now that the token is on file.
   */
  cardJustSaved?: boolean
}

const PRESETS_THRESHOLD = [50, 100, 250]
const PRESETS_AMOUNT = [100, 250, 500, 1000]
const PRESETS_CAP = [500, 1000, 2500, 5000]

function brandDisplay(brand: string | null): string {
  if (!brand) return 'Card'
  const map: Record<string, string> = { visa: 'Visa', master: 'Mastercard', mastercard: 'Mastercard', mada: 'mada', amex: 'Amex', unionpay: 'UnionPay' }
  return map[brand.toLowerCase()] || brand
}

export default function AutoTopupPanel({ apiBase, renterKey, cardJustSaved }: AutoTopupPanelProps) {
  const [settings, setSettings] = useState<AutoTopupSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Form state — initialized from server response, edited locally.
  const [enabled, setEnabled] = useState(false)
  const [thresholdSar, setThresholdSar] = useState<number>(100)
  const [amountSar, setAmountSar] = useState<number>(500)
  const [monthlyCapSar, setMonthlyCapSar] = useState<number>(2500)

  const fetchSettings = useCallback(async () => {
    if (!renterKey) return
    try {
      const res = await fetch(`${apiBase}/payments/auto-topup-settings`, {
        headers: { 'x-renter-key': renterKey },
      })
      if (!res.ok) {
        if (res.status === 404) {
          setSettings(null)
        } else {
          setError('Could not load auto-top-up settings')
        }
        setLoading(false)
        return
      }
      const data: AutoTopupSettings = await res.json()
      setSettings(data)
      setEnabled(data.enabled)
      if (data.threshold_sar > 0) setThresholdSar(data.threshold_sar)
      if (data.amount_sar > 0) setAmountSar(data.amount_sar)
      if (data.monthly_cap_sar > 0) setMonthlyCapSar(data.monthly_cap_sar)
    } catch {
      setError('Network error loading auto-top-up settings')
    } finally {
      setLoading(false)
    }
  }, [apiBase, renterKey])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (!renterKey) return
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/payments/auto-topup-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': renterKey,
        },
        body: JSON.stringify({
          enabled,
          threshold_sar: thresholdSar,
          amount_sar: amountSar,
          monthly_cap_sar: monthlyCapSar,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const messages: Record<string, string> = {
          INVALID_AMOUNT: 'Recharge amount must be greater than 0',
          INVALID_THRESHOLD: 'Threshold must be greater than 0',
          CAP_BELOW_AMOUNT: 'Monthly cap cannot be less than the recharge amount',
          NO_CARD_ON_FILE: 'Save a card on file first by completing a top-up with the "save card" option enabled',
        }
        setError(messages[data.error] || data.message || 'Could not save settings')
        return
      }
      setSaved(true)
      await fetchSettings()
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Network error saving settings')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveCard = async () => {
    if (!renterKey) return
    if (!confirm('Remove the saved card? This also disables auto-top-up.')) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/payments/saved-card`, {
        method: 'DELETE',
        headers: { 'x-renter-key': renterKey },
      })
      if (!res.ok) {
        setError('Could not remove saved card')
        return
      }
      setEnabled(false)
      await fetchSettings()
    } catch {
      setError('Network error removing card')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-6">
        <div className="animate-pulse h-6 w-48 bg-dc1-bg-primary rounded mb-2" />
        <div className="animate-pulse h-4 w-72 bg-dc1-bg-primary rounded" />
      </div>
    )
  }

  const hasCard = !!settings?.card_on_file
  const isPaused = settings?.paused_until && new Date(settings.paused_until) > new Date()

  return (
    <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border overflow-hidden">
      <div className="px-6 py-4 border-b border-dc1-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-dc1-text-primary">Auto-top-up</h2>
            <p className="text-sm text-dc1-text-secondary mt-1">
              Automatically recharge your balance when it drops below a threshold. Uses your saved card via Moyasar.
            </p>
          </div>
          {hasCard && settings?.enabled && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30">
              Active
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Card on file */}
        <div className="rounded-md border border-dc1-border bg-dc1-bg-primary px-4 py-3 flex items-center justify-between">
          {hasCard ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-dc1-text-primary">
                  {brandDisplay(settings!.card_on_file!.brand)} •••• {settings!.card_on_file!.last4 || '????'}
                </span>
                <span className="text-xs text-dc1-text-muted">
                  Saved {settings!.card_on_file!.saved_at
                    ? new Date(settings!.card_on_file!.saved_at!).toLocaleDateString('en-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '--'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRemoveCard}
                disabled={saving}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <p className="text-sm text-dc1-text-secondary">
                No card on file. Complete a top-up with "Save card for future use" to enable auto-top-up.
              </p>
              {cardJustSaved && (
                <span className="text-xs text-dc1-accent-primary">Card saving in progress...</span>
              )}
            </div>
          )}
        </div>

        {/* Status banners */}
        {isPaused && (
          <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-4 py-3">
            <p className="text-sm text-orange-300">
              <strong>Paused</strong> until {new Date(settings!.paused_until!).toLocaleString('en-SA')} after {settings!.consecutive_failures} consecutive
              failures. Update your card or contact support to resume.
            </p>
          </div>
        )}

        {settings?.enabled && settings.monthly_cap_sar > 0 && (
          <div className="text-xs text-dc1-text-muted">
            This month: {settings.monthly_used_sar.toFixed(2)} / {settings.monthly_cap_sar.toFixed(2)} SAR used
            ({Math.round((settings.monthly_used_sar / settings.monthly_cap_sar) * 100)}%)
          </div>
        )}

        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!hasCard || saving}
            className="h-4 w-4 rounded border-dc1-border accent-dc1-accent-primary disabled:opacity-50"
          />
          <span className={`text-sm font-medium ${hasCard ? 'text-dc1-text-primary' : 'text-dc1-text-muted'}`}>
            Enable auto-top-up
          </span>
        </label>

        {/* Threshold */}
        <div>
          <label className="block text-xs font-medium text-dc1-text-secondary uppercase tracking-wider mb-2">
            Recharge when balance drops below
          </label>
          <div className="flex gap-2 mb-2">
            {PRESETS_THRESHOLD.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setThresholdSar(v)}
                disabled={!hasCard || saving}
                className={`px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-50 ${
                  thresholdSar === v
                    ? 'border-dc1-accent-primary bg-dc1-accent-primary/10 text-dc1-accent-primary'
                    : 'border-dc1-border text-dc1-text-secondary hover:border-dc1-text-muted'
                }`}
              >
                {v} SAR
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={100000}
              value={thresholdSar}
              onChange={(e) => setThresholdSar(parseFloat(e.target.value) || 0)}
              disabled={!hasCard || saving}
              className="px-3 py-1.5 rounded border border-dc1-border bg-dc1-bg-primary text-sm text-dc1-text-primary w-24 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-dc1-text-secondary uppercase tracking-wider mb-2">
            Recharge amount
          </label>
          <div className="flex gap-2 mb-2">
            {PRESETS_AMOUNT.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmountSar(v)}
                disabled={!hasCard || saving}
                className={`px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-50 ${
                  amountSar === v
                    ? 'border-dc1-accent-primary bg-dc1-accent-primary/10 text-dc1-accent-primary'
                    : 'border-dc1-border text-dc1-text-secondary hover:border-dc1-text-muted'
                }`}
              >
                {v} SAR
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={1000000}
              value={amountSar}
              onChange={(e) => setAmountSar(parseFloat(e.target.value) || 0)}
              disabled={!hasCard || saving}
              className="px-3 py-1.5 rounded border border-dc1-border bg-dc1-bg-primary text-sm text-dc1-text-primary w-28 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Monthly cap */}
        <div>
          <label className="block text-xs font-medium text-dc1-text-secondary uppercase tracking-wider mb-2">
            Monthly spending cap{' '}
            <span className="normal-case font-normal text-dc1-text-muted">(0 = unlimited)</span>
          </label>
          <div className="flex gap-2 mb-2">
            {PRESETS_CAP.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMonthlyCapSar(v)}
                disabled={!hasCard || saving}
                className={`px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-50 ${
                  monthlyCapSar === v
                    ? 'border-dc1-accent-primary bg-dc1-accent-primary/10 text-dc1-accent-primary'
                    : 'border-dc1-border text-dc1-text-secondary hover:border-dc1-text-muted'
                }`}
              >
                {v} SAR
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={10000000}
              value={monthlyCapSar}
              onChange={(e) => setMonthlyCapSar(parseFloat(e.target.value) || 0)}
              disabled={!hasCard || saving}
              className="px-3 py-1.5 rounded border border-dc1-border bg-dc1-bg-primary text-sm text-dc1-text-primary w-28 disabled:opacity-50"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2 border-t border-dc1-border">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasCard}
            className="px-4 py-2 rounded bg-dc1-accent-primary text-dc1-bg-primary font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save auto-top-up settings'}
          </button>
          {saved && (
            <span className="text-sm text-green-400">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  )
}
