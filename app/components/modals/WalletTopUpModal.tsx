'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface WalletTopUpModalProps {
  currentBalanceHalala: number
  onClose: () => void
  onSuccess: (newBalanceHalala: number) => void
}

type Step = 'amount' | 'confirm' | 'success' | 'error'
const PRESET_AMOUNTS_SAR = [50, 100, 500]
const API_BASE = '/api'

function formatSAR(halala: number): string { return (halala / 100).toFixed(2) }
function sarToHalala(sar: number): number { return Math.round(sar * 100) }
function makeRef(): string { return 'DCP-' + Math.random().toString(36).slice(2, 8).toUpperCase() }

export default function WalletTopUpModal({ currentBalanceHalala, onClose, onSuccess }: WalletTopUpModalProps) {
  const [step, setStep] = useState<Step>('amount')
  const [amountSAR, setAmountSAR] = useState('')
  const [customInput, setCustomInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [transferRef] = useState(makeRef)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (step === 'amount') inputRef.current?.focus() }, [step])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const parsedSAR = parseFloat(amountSAR)
  const isValidAmount = !isNaN(parsedSAR) && parsedSAR >= 1 && parsedSAR <= 1000
  const topUpHalala = isValidAmount ? sarToHalala(parsedSAR) : 0
  const newBalanceHalala = currentBalanceHalala + topUpHalala

  const handleConfirm = useCallback(async () => {
    if (!isValidAmount) return
    setLoading(true)
    setErrorMsg('')
    try {
      const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
      if (!key) throw new Error('Not authenticated')
      const res = await fetch(`${API_BASE}/renters/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Renter-Key': key },
        body: JSON.stringify({ amount_sar: parsedSAR }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) { setStep('success'); return }
        throw new Error(data.error || 'Top-up failed')
      }
      onSuccess(data.balance_halala ?? newBalanceHalala)
      setStep('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Top-up failed')
      setStep('error')
    } finally { setLoading(false) }
  }, [isValidAmount, parsedSAR, newBalanceHalala, onSuccess])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dc1-void/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="dialog" aria-modal="true" aria-labelledby="topup-modal-title"
    >
      <div className="bg-dc1-surface-l1 border border-dc1-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-dc1-border">
          <h2 id="topup-modal-title" className="text-lg font-semibold text-dc1-text-primary">
            {step === 'success' ? 'Credit Requested' : 'Add Credit'}
          </h2>
          <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary transition-colors p-1 rounded" aria-label="Close modal">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {step === 'amount' && (
          <div className="p-6 space-y-5">
            <div className="bg-dc1-surface-l2 rounded-lg p-4">
              <p className="text-xs text-dc1-text-muted mb-1">Current credit</p>
              <p className="text-2xl font-bold text-dc1-amber">{formatSAR(currentBalanceHalala)} credit</p>
            </div>
            <div>
              <p className="text-sm text-dc1-text-secondary mb-3">Quick select</p>
              <div className="grid grid-cols-3 gap-3">
                {PRESET_AMOUNTS_SAR.map(sar => (
                  <button key={sar} onClick={() => { setAmountSAR(String(sar)); setCustomInput('') }}
                    className={`py-3 rounded-lg border text-sm font-semibold transition-all ${amountSAR === String(sar) ? 'bg-dc1-amber text-dc1-void border-dc1-amber' : 'bg-dc1-surface-l2 text-dc1-text-primary border-dc1-border hover:border-dc1-amber/50 hover:text-dc1-amber'}`}
                    aria-pressed={amountSAR === String(sar)}>{sar} SAR</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="topup-custom-amount" className="text-sm text-dc1-text-secondary block mb-2">Custom amount (SAR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc1-text-muted text-sm font-medium select-none">SAR</span>
                <input ref={inputRef} id="topup-custom-amount" type="number" min="1" max="1000" step="0.01"
                  value={customInput} onChange={(e) => { setCustomInput(e.target.value); setAmountSAR(e.target.value) }}
                  placeholder="Enter amount"
                  className="w-full pl-12 pr-4 py-3 bg-dc1-surface-l2 border border-dc1-border rounded-lg text-dc1-text-primary placeholder-dc1-text-muted text-sm focus:outline-none focus:border-dc1-amber focus:ring-1 focus:ring-dc1-amber/30 transition-colors"
                  aria-describedby="topup-amount-hint" />
              </div>
              <p id="topup-amount-hint" className="text-xs text-dc1-text-muted mt-1">Min: 1 SAR — Max: 1,000 SAR per transaction</p>
            </div>
            <div>
              <p className="text-sm text-dc1-text-secondary mb-2">Payment method</p>
              <div className="flex items-center gap-3 p-3 bg-dc1-surface-l2 border border-dc1-border rounded-lg">
                <svg className="w-5 h-5 text-dc1-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dc1-text-primary">Bank Transfer</p>
                  <p className="text-xs text-dc1-text-muted">Manual transfer — instructions provided after confirmation</p>
                </div>
              </div>
            </div>
            <button onClick={() => setStep('confirm')} disabled={!isValidAmount}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-dc1-amber text-dc1-void hover:opacity-90 active:scale-[0.98]">
              Continue
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="p-6 space-y-5">
            <div className="space-y-0">
              {[
                ['Credit amount', `${parsedSAR.toFixed(2)} SAR`, 'font-semibold text-dc1-text-primary'],
                ['Payment method', 'Bank Transfer', 'font-semibold text-dc1-text-primary'],
                ['Current credit', `${formatSAR(currentBalanceHalala)} credit`, 'text-dc1-text-secondary'],
              ].map(([label, value, cls]) => (
                <div key={label} className="flex justify-between items-center py-3 border-b border-dc1-border">
                  <span className="text-sm text-dc1-text-secondary">{label}</span>
                  <span className={`text-sm ${cls}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-3">
                <span className="text-sm font-semibold text-dc1-text-primary">Credit after payment</span>
                <span className="text-base font-bold text-dc1-amber">{formatSAR(newBalanceHalala)} credit</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('amount')}
                className="flex-1 py-3 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary hover:border-dc1-border-light text-sm font-medium transition-colors">Back</button>
              <button onClick={handleConfirm} disabled={loading}
                className="flex-1 py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Processing...
                  </span>
                ) : 'Confirm Credit'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-full bg-status-success/15 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-base font-semibold text-dc1-text-primary mb-1">Credit Request Received</h3>
              {isValidAmount && <p className="text-sm text-dc1-text-secondary">{parsedSAR.toFixed(2)} SAR will be added after payment is confirmed.</p>}
            </div>
            <div className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-dc1-text-primary mb-1">Bank Transfer Details</p>
              {[['Bank', 'Al Rajhi Bank', ''], ['Account name', 'DCP Platform', ''], ['IBAN', 'SA00 8000 0000 0000 0000 0000', 'font-mono text-xs'], ['Reference', transferRef, 'text-dc1-amber font-bold tracking-wide']].map(([label, value, cls]) => (
                <div key={label} className="flex justify-between gap-4 text-sm">
                  <span className="text-dc1-text-muted flex-shrink-0">{label}</span>
                  <span className={`text-dc1-text-primary break-all ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-dc1-text-muted text-center">Include the reference code in your transfer. Balance updates within 1 business day.</p>
            <button onClick={onClose} className="w-full py-3 rounded-lg bg-dc1-amber text-dc1-void font-semibold text-sm hover:opacity-90 transition-all active:scale-[0.98]">Done</button>
          </div>
        )}

        {step === 'error' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-full bg-status-error/15 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <h3 className="text-base font-semibold text-dc1-text-primary mb-1">Credit Request Failed</h3>
              <p className="text-sm text-dc1-text-secondary">{errorMsg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep('amount'); setErrorMsg('') }}
                className="flex-1 py-3 rounded-lg border border-dc1-border text-dc1-text-secondary hover:text-dc1-text-primary text-sm font-medium transition-colors">Try Again</button>
              <button onClick={onClose}
                className="flex-1 py-3 rounded-lg bg-dc1-surface-l2 text-dc1-text-secondary border border-dc1-border text-sm font-medium hover:text-dc1-text-primary transition-colors">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
