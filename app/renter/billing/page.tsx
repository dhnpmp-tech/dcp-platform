'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import Script from 'next/script'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'
import { getApiBase } from '../../../lib/api'
import AutoTopupPanel from './components/AutoTopupPanel'

// ── SVG Icons ────────────────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

// ── Types ────────────────────────────────────────────────────────────────────
interface PaymentRecord {
  payment_id: string
  moyasar_id?: string
  amount_sar: number
  amount_halala: number
  status: string
  source_type?: string
  payment_method?: string
  description?: string
  created_at: string
  confirmed_at?: string
  refunded_at?: string
  refund_amount_halala?: number
}

interface BalanceData {
  balance_sar: number
  balance_halala: number
  name?: string
  email?: string
}

interface SubscriptionStatus {
  has_subscription: boolean
  payg_balance_halala: number
  payg_balance_sar: number
  subscription: {
    id: number
    tier: 'starter' | 'growth' | 'scale'
    monthly_sar: number
    discount_pct: number | null
    status: string
    period_start: string
    period_end: string
    cancel_at_period_end: boolean
  } | null
  credits: {
    remaining_halala: number
    grants: Array<{ id: number; granted_at: string; expires_at: string; remaining_halala: number }>
  }
}

const TIER_LABEL: Record<'starter' | 'growth' | 'scale', string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
}

type CallbackStatus = 'verifying' | 'paid' | 'failed' | 'timeout' | null

// Preset SAR amounts for top-up
const TOPUP_PRESETS = [10, 50, 100, 500]

// ── Moyasar form type declaration ────────────────────────────────────────────
declare global {
  interface Window {
    Moyasar?: {
      init: (config: Record<string, unknown>) => void
    }
  }
}

// ── Inner component (needs useSearchParams inside Suspense) ──────────────────
function BillingPageInner() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const API_BASE = getApiBase()

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [renterName, setRenterName] = useState('')
  const [renterKey, setRenterKey] = useState<string | null>(null)
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [paymentsPagination, setPaymentsPagination] = useState({ total: 0, limit: 20, offset: 0 })
  const [totalPaidSar, setTotalPaidSar] = useState(0)

  // Top-up form
  const [topupAmount, setTopupAmount] = useState<number>(50)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [topupLoading, setTopupLoading] = useState(false)
  const [topupError, setTopupError] = useState('')

  // Tokenize-on-payment: when true, Moyasar.init runs with save_card=true and
  // after the payment is confirmed we POST the token id to /api/payments/save-card-token.
  const [saveCardOnTopup, setSaveCardOnTopup] = useState(false)
  const [cardJustSaved, setCardJustSaved] = useState(false)

  // Moyasar form
  const [moyasarReady, setMoyasarReady] = useState(false)
  const [showMoyasarForm, setShowMoyasarForm] = useState(false)
  const moyasarFormRef = useRef<HTMLDivElement>(null)
  const moyasarPublishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY || ''

  // Payment callback verification
  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>(null)
  const [callbackAttempt, setCallbackAttempt] = useState(0)

  // ── Check for payment callback ─────────────────────────────────────────────
  const isCallback = searchParams.get('payment') === 'callback'
  const callbackPaymentId = searchParams.get('id') || searchParams.get('payment_id')
  const callbackPaymentStatus = searchParams.get('status')

  // ── Auth + initial data ────────────────────────────────────────────────────
  useEffect(() => {
    const key = typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null
    if (!key) {
      setLoading(false)
      return
    }
    setRenterKey(key)
  }, [])

  const fetchBalance = useCallback(async () => {
    if (!renterKey) return
    try {
      const res = await fetch(`${API_BASE}/payments/balance`, {
        headers: { 'x-renter-key': renterKey },
      })
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setRenterName(data.name || 'Renter')
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err)
    }
  }, [API_BASE, renterKey])

  const fetchSubscription = useCallback(async () => {
    if (!renterKey) return
    try {
      const res = await fetch(`${API_BASE}/subscriptions/me`, {
        headers: { 'x-renter-key': renterKey },
      })
      if (res.ok) {
        const data: SubscriptionStatus = await res.json()
        setSubscription(data)
      }
    } catch (err) {
      // Endpoint may not be deployed yet — fail silently rather than break the page.
      console.error('Failed to fetch subscription status:', err)
    }
  }, [API_BASE, renterKey])

  const fetchHistory = useCallback(async (offset = 0) => {
    if (!renterKey) return
    try {
      const res = await fetch(`${API_BASE}/payments/history?limit=20&offset=${offset}`, {
        headers: { 'x-renter-key': renterKey },
      })
      if (res.ok) {
        const data = await res.json()
        setPayments(data.payments || [])
        setPaymentsPagination(data.pagination || { total: 0, limit: 20, offset: 0 })
        setTotalPaidSar(data.summary?.total_paid_sar || 0)
      }
    } catch (err) {
      console.error('Failed to fetch payment history:', err)
    }
  }, [API_BASE, renterKey])

  useEffect(() => {
    if (!renterKey) return
    Promise.all([fetchBalance(), fetchHistory(), fetchSubscription()]).finally(() => setLoading(false))
  }, [renterKey, fetchBalance, fetchHistory, fetchSubscription])

  // ── Payment callback verification ──────────────────────────────────────────
  useEffect(() => {
    if (!isCallback || !callbackPaymentId || !renterKey) return

    setCallbackStatus('verifying')
    let cancelled = false
    let retryCount = 0
    const MAX_RETRIES = 10

    const wantSaveCard = searchParams.get('save_card') === '1'

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`${API_BASE}/payments/verify/${callbackPaymentId}`, {
          headers: { 'x-renter-key': renterKey },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'paid') {
            if (!cancelled) {
              setCallbackStatus('paid')
              fetchBalance()
              fetchHistory()
              // Tokenization side-effect: when the renter ticked "Save card",
              // Moyasar returned a token id on the source. The verify endpoint
              // surfaces it directly (see backend Codex P2 fix), so we POST
              // straight to /save-card-token. Best-effort; failure does not
              // affect the top-up that just succeeded.
              if (wantSaveCard && data.source?.token && renterKey) {
                try {
                  await fetch(`${API_BASE}/payments/save-card-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-renter-key': renterKey },
                    body: JSON.stringify({
                      token: data.source.token,
                      brand: data.source.brand || null,
                      last4: data.source.last4 || null,
                    }),
                  })
                  setCardJustSaved(true)
                } catch {
                  // Non-fatal — renter can re-save via a future top-up.
                }
              }
            }
            return
          }
          if (data.status === 'failed') {
            if (!cancelled) setCallbackStatus('failed')
            return
          }
        }
      } catch {
        // network error -- keep polling
      }

      retryCount++
      if (!cancelled) setCallbackAttempt(retryCount)

      if (retryCount >= MAX_RETRIES) {
        if (!cancelled) setCallbackStatus('timeout')
        return
      }

      setTimeout(poll, 2000)
    }

    poll()
    return () => { cancelled = true }
  }, [isCallback, callbackPaymentId, renterKey, API_BASE, fetchBalance, fetchHistory])

  // Auto-redirect after successful callback
  useEffect(() => {
    if (callbackStatus !== 'paid') return
    const timer = setTimeout(() => {
      router.replace('/renter/billing')
    }, 5000)
    return () => clearTimeout(timer)
  }, [callbackStatus, router])

  // ── Moyasar form initialization ────────────────────────────────────────────
  useEffect(() => {
    if (!showMoyasarForm || !moyasarReady || !moyasarPublishableKey || !renterKey) return
    if (!window.Moyasar) return

    // Clear previous form
    if (moyasarFormRef.current) {
      moyasarFormRef.current.innerHTML = ''
    }

    const effectiveAmount = isCustom ? parseFloat(customAmount) : topupAmount
    if (!effectiveAmount || effectiveAmount < 1 || effectiveAmount > 100000) return

    const amountHalala = Math.round(effectiveAmount * 100)

    try {
      // When the renter ticks "Save card", append ?save_card=1 to the callback
      // URL so the verify-callback effect knows to POST the returned token id
      // to /api/payments/save-card-token after Moyasar reports paid.
      const callbackBase = `${window.location.origin}/renter/billing?payment=callback`
      const callbackUrl = saveCardOnTopup ? `${callbackBase}&save_card=1` : callbackBase

      window.Moyasar.init({
        element: '.mysr-form',
        amount: amountHalala,
        currency: 'SAR',
        description: `DCP balance top-up - ${effectiveAmount} SAR`,
        publishable_api_key: moyasarPublishableKey,
        callback_url: callbackUrl,
        supported_networks: ['visa', 'mastercard', 'mada'],
        methods: ['creditcard'],
        save_card: saveCardOnTopup,
        on_initiating: function() {
          setTopupLoading(true)
          setTopupError('')
        },
        on_failure: function(error: unknown) {
          setTopupLoading(false)
          const errMsg = error && typeof error === 'object' && 'message' in error
            ? (error as { message: string }).message
            : 'Payment failed'
          setTopupError(errMsg)
        },
      })
    } catch (err) {
      console.error('Failed to initialize Moyasar form:', err)
      setTopupError('Failed to initialize payment form')
    }
  }, [showMoyasarForm, moyasarReady, moyasarPublishableKey, topupAmount, customAmount, isCustom, renterKey, saveCardOnTopup])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePresetClick = (amount: number) => {
    setIsCustom(false)
    setTopupAmount(amount)
    setCustomAmount('')
    setTopupError('')
    setShowMoyasarForm(false)
  }

  const handleCustomChange = (val: string) => {
    setCustomAmount(val)
    setIsCustom(true)
    setTopupError('')
    setShowMoyasarForm(false)
  }

  const getEffectiveAmount = (): number => {
    return isCustom ? parseFloat(customAmount) || 0 : topupAmount
  }

  const handleProceedToPayment = () => {
    const amount = getEffectiveAmount()
    if (amount < 1) {
      setTopupError('Minimum top-up is 1 SAR')
      return
    }
    if (amount > 100000) {
      setTopupError('Maximum top-up is 100,000 SAR')
      return
    }
    setTopupError('')
    setShowMoyasarForm(true)
  }

  const handleCancelPayment = () => {
    setShowMoyasarForm(false)
    setTopupLoading(false)
    setTopupError('')
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const handleNextPage = () => {
    const next = paymentsPagination.offset + paymentsPagination.limit
    if (next < paymentsPagination.total) {
      fetchHistory(next)
    }
  }
  const handlePrevPage = () => {
    const prev = Math.max(0, paymentsPagination.offset - paymentsPagination.limit)
    fetchHistory(prev)
  }

  // ── Nav items ──────────────────────────────────────────────────────────────
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

  const balanceSar = balance ? balance.balance_sar.toFixed(2) : '0.00'
  const isLowBalance = balance ? balance.balance_sar < 5 : false

  // ── Status helpers ─────────────────────────────────────────────────────────
  const statusStyles: Record<string, { label: string; bg: string; text: string }> = {
    paid: { label: 'Paid', bg: 'bg-green-500/10', text: 'text-green-400' },
    pending: { label: 'Pending', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
    initiated: { label: 'Initiated', bg: 'bg-blue-500/10', text: 'text-blue-400' },
    failed: { label: 'Failed', bg: 'bg-red-500/10', text: 'text-red-400' },
    refunded: { label: 'Refunded', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  }

  const methodLabels: Record<string, string> = {
    creditcard: 'Card',
    applepay: 'Apple Pay',
    bank_transfer: 'Bank Transfer',
    sandbox: 'Sandbox',
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={navItems} role="renter" userName={renterName || undefined}>
      {/* Moyasar SDK script */}
      <Script
        src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.js"
        onReady={() => setMoyasarReady(true)}
        strategy="lazyOnload"
      />
      <link rel="stylesheet" href="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css" />

      <div className="min-h-screen bg-dc1-bg-primary text-dc1-text-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-8">

            {/* ── Payment Callback Banner ──────────────────────────────────── */}
            {isCallback && callbackStatus && (
              <div className="rounded-lg border overflow-hidden">
                {callbackStatus === 'verifying' && (
                  <div className="bg-blue-500/5 border-blue-500/20 border p-6 text-center">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full" />
                      <h2 className="text-lg font-semibold text-dc1-text-primary">Verifying Payment...</h2>
                    </div>
                    <p className="text-dc1-text-secondary text-sm">
                      Confirming your payment with the gateway. Attempt {callbackAttempt + 1} of 10.
                    </p>
                  </div>
                )}

                {callbackStatus === 'paid' && (
                  <div className="bg-green-500/5 border-green-500/20 border p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-dc1-text-primary mb-1">Payment Successful</h2>
                    <p className="text-dc1-text-secondary text-sm mb-3">
                      Your balance has been updated. Redirecting in 5 seconds...
                    </p>
                    <button
                      onClick={() => router.replace('/renter/billing')}
                      className="text-sm text-dc1-accent-primary hover:underline"
                    >
                      Go to Billing now
                    </button>
                  </div>
                )}

                {(callbackStatus === 'failed' || callbackStatus === 'timeout') && (
                  <div className="bg-red-500/5 border-red-500/20 border p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-dc1-text-primary mb-1">Payment Not Completed</h2>
                    <p className="text-dc1-text-secondary text-sm mb-3">
                      {callbackStatus === 'timeout'
                        ? 'We could not confirm your payment in time. If you completed the payment, your balance will update shortly.'
                        : 'The payment was not completed or could not be verified.'}
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => router.replace('/renter/billing')}
                        className="px-4 py-2 bg-dc1-accent-primary text-white rounded-lg hover:opacity-90 transition text-sm font-medium"
                      >
                        Try Again
                      </button>
                      <Link
                        href="/renter"
                        className="px-4 py-2 border border-dc1-border text-dc1-text-primary rounded-lg hover:bg-dc1-bg-secondary transition text-sm font-medium"
                      >
                        Back to Dashboard
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div>
              <h1 className="text-3xl font-bold text-dc1-text-primary">Billing & Payments</h1>
              <p className="text-dc1-text-secondary mt-1">
                Manage your balance, top up with mada/Visa/Mastercard, and view payment history
              </p>
            </div>

            {/* ── Balance + Top-Up Section ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Balance Card */}
              <div className="lg:col-span-1">
                <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-6 h-full">
                  <p className="text-dc1-text-secondary text-sm font-medium mb-1">Account Balance</p>
                  {loading ? (
                    <div className="animate-pulse h-10 bg-dc1-border rounded w-32 mt-2" />
                  ) : (
                    <>
                      <p className={`text-4xl font-bold mt-2 ${isLowBalance ? 'text-red-400' : 'text-dc1-text-primary'}`}>
                        {balanceSar}
                        <span className="text-lg font-normal text-dc1-text-secondary ml-2">SAR</span>
                      </p>
                      {isLowBalance && (
                        <p className="text-xs text-red-400 mt-2 font-medium">
                          Low balance -- top up to keep jobs running
                        </p>
                      )}
                    </>
                  )}

                  <div className="mt-6 pt-4 border-t border-dc1-border space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-dc1-text-secondary">Total Deposited</span>
                      <span className="text-dc1-text-primary font-medium">{totalPaidSar.toFixed(2)} SAR</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dc1-text-secondary">Transactions</span>
                      <span className="text-dc1-text-primary font-medium">{paymentsPagination.total}</span>
                    </div>
                    {subscription && (
                      <div className="flex justify-between text-sm pt-2 border-t border-dc1-border">
                        <span className="text-dc1-text-secondary">Plan</span>
                        {subscription.has_subscription && subscription.subscription ? (
                          <span className="text-dc1-amber font-semibold">
                            {TIER_LABEL[subscription.subscription.tier]}
                            {subscription.subscription.discount_pct != null && (
                              <span className="text-xs font-normal text-dc1-text-secondary ml-1">
                                (−{subscription.subscription.discount_pct.toFixed(0)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <Link href="/pricing#tiers" className="text-dc1-amber hover:underline font-medium">
                            PAYG · upgrade →
                          </Link>
                        )}
                      </div>
                    )}
                    {subscription?.has_subscription && subscription.subscription && (
                      <div className="flex justify-between text-xs">
                        <span className="text-dc1-text-secondary">Renews</span>
                        <span className="text-dc1-text-secondary">
                          {new Date(subscription.subscription.period_end).toLocaleDateString()}
                          {subscription.subscription.cancel_at_period_end && ' · cancelling'}
                        </span>
                      </div>
                    )}
                    {subscription?.has_subscription && subscription.credits.remaining_halala > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-dc1-text-secondary">Plan credit left</span>
                        <span className="text-dc1-text-primary">
                          {(subscription.credits.remaining_halala / 100).toFixed(2)} SAR
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Top-Up Card */}
              <div className="lg:col-span-2">
                <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border p-6">
                  <h2 className="text-lg font-semibold text-dc1-text-primary mb-4">Top Up Balance</h2>

                  {!moyasarPublishableKey ? (
                    <div className="bg-dc1-amber/5 border border-dc1-amber/20 rounded-lg p-4">
                      <p className="text-dc1-amber font-medium text-sm">Card payments are launching soon</p>
                      <p className="text-dc1-text-secondary text-xs mt-1">
                        Your 100 SAR welcome credit is active now — start deploying right away. Need to top up
                        before cards go live?{' '}
                        <Link href="/support?category=billing&source=renter_billing#contact-form" className="text-dc1-amber hover:underline">
                          Contact us
                        </Link>{' '}
                        and we&apos;ll sort it out.
                      </p>
                    </div>
                  ) : !showMoyasarForm ? (
                    <>
                      {/* Amount Presets */}
                      <div className="mb-4">
                        <label className="text-sm text-dc1-text-secondary font-medium mb-2 block">Select Amount</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {TOPUP_PRESETS.map((amount) => (
                            <button
                              key={amount}
                              onClick={() => handlePresetClick(amount)}
                              className={`py-3 px-4 rounded-lg border text-sm font-semibold transition ${
                                !isCustom && topupAmount === amount
                                  ? 'border-dc1-accent-primary bg-dc1-accent-primary/10 text-dc1-accent-primary'
                                  : 'border-dc1-border text-dc1-text-primary hover:border-dc1-border-hover hover:bg-dc1-bg-primary'
                              }`}
                            >
                              {amount} SAR
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Amount */}
                      <div className="mb-4">
                        <label className="text-sm text-dc1-text-secondary font-medium mb-2 block">Or enter custom amount</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max="100000"
                            step="0.01"
                            placeholder="Enter amount..."
                            value={customAmount}
                            onChange={(e) => handleCustomChange(e.target.value)}
                            onFocus={() => setIsCustom(true)}
                            className={`w-full bg-dc1-bg-primary border rounded-lg px-4 py-3 pr-16 text-dc1-text-primary placeholder-dc1-text-muted focus:outline-none focus:ring-1 transition ${
                              isCustom && customAmount
                                ? 'border-dc1-accent-primary focus:ring-dc1-accent-primary'
                                : 'border-dc1-border focus:ring-dc1-accent-primary'
                            }`}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dc1-text-muted text-sm font-medium">
                            SAR
                          </span>
                        </div>
                      </div>

                      {/* Save card opt-in (enables auto-top-up). Hidden if a
                          card token is already saved — they can manage via the
                          AutoTopupPanel below. */}
                      <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveCardOnTopup}
                          onChange={(e) => setSaveCardOnTopup(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-dc1-border accent-dc1-accent-primary"
                        />
                        <span className="text-sm text-dc1-text-secondary">
                          <span className="text-dc1-text-primary font-medium">Save card for future use</span>{' '}
                          <span className="text-dc1-text-muted">— enables auto-top-up so your balance never runs out mid-job.</span>
                        </span>
                      </label>

                      {/* Error */}
                      {topupError && (
                        <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                          <p className="text-red-400 text-sm">{topupError}</p>
                        </div>
                      )}

                      {/* Proceed Button */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={handleProceedToPayment}
                          disabled={topupLoading}
                          className="px-6 py-3 bg-dc1-accent-primary text-white rounded-lg hover:opacity-90 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {topupLoading ? 'Processing...' : `Pay ${getEffectiveAmount().toFixed(2)} SAR`}
                        </button>
                        <div className="flex items-center gap-2 text-dc1-text-muted text-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>Secure payment via Moyasar</span>
                        </div>
                      </div>

                      {/* Supported Networks */}
                      <div className="mt-4 flex items-center gap-3 text-xs text-dc1-text-muted">
                        <span>Accepted:</span>
                        <span className="px-2 py-0.5 rounded bg-dc1-bg-primary border border-dc1-border font-medium">mada</span>
                        <span className="px-2 py-0.5 rounded bg-dc1-bg-primary border border-dc1-border font-medium">Visa</span>
                        <span className="px-2 py-0.5 rounded bg-dc1-bg-primary border border-dc1-border font-medium">Mastercard</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Moyasar Embedded Payment Form */}
                      <div className="mb-4 p-3 bg-dc1-bg-primary rounded-lg border border-dc1-border">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-dc1-text-primary">
                              Top-up: {getEffectiveAmount().toFixed(2)} SAR
                            </p>
                            <p className="text-xs text-dc1-text-muted mt-0.5">
                              Enter your card details below
                            </p>
                          </div>
                          <button
                            onClick={handleCancelPayment}
                            className="text-sm text-dc1-text-secondary hover:text-dc1-text-primary transition"
                          >
                            Change amount
                          </button>
                        </div>
                      </div>

                      {/* Error */}
                      {topupError && (
                        <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                          <p className="text-red-400 text-sm">{topupError}</p>
                        </div>
                      )}

                      {/* Moyasar form container */}
                      <div ref={moyasarFormRef} className="mysr-form" />

                      {!moyasarReady && (
                        <div className="text-center py-8">
                          <div className="animate-spin h-6 w-6 border-2 border-dc1-accent-primary border-t-transparent rounded-full mx-auto mb-3" />
                          <p className="text-dc1-text-muted text-sm">Loading payment form...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Auto-Top-Up ─────────────────────────────────────────────── */}
            {renterKey && (
              <AutoTopupPanel
                apiBase={API_BASE}
                renterKey={renterKey}
                cardJustSaved={cardJustSaved}
              />
            )}

            {/* ── Payment History ──────────────────────────────────────────── */}
            <div className="bg-dc1-bg-secondary rounded-lg border border-dc1-border overflow-hidden">
              <div className="px-6 py-4 border-b border-dc1-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dc1-text-primary">Payment History</h2>
                {paymentsPagination.total > 0 && (
                  <span className="text-sm text-dc1-text-muted">
                    {paymentsPagination.total} transaction{paymentsPagination.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="px-6 py-12 text-center text-dc1-text-muted">
                  <div className="animate-spin h-6 w-6 border-2 border-dc1-accent-primary border-t-transparent rounded-full mx-auto mb-3" />
                  <p>Loading payment history...</p>
                </div>
              ) : payments.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <svg className="w-12 h-12 text-dc1-text-muted mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-dc1-text-primary font-semibold">No payments yet</p>
                  <p className="text-dc1-text-secondary mt-1 text-sm">
                    Top up your balance above to get started with DCP compute.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-dc1-bg-primary border-b border-dc1-border">
                          <th className="px-6 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">
                            Method
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-dc1-text-secondary uppercase tracking-wider">
                            Reference
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dc1-border">
                        {payments.map((p) => {
                          const style = statusStyles[p.status] || statusStyles.pending
                          const method = methodLabels[p.payment_method || p.source_type || ''] || p.payment_method || p.source_type || '--'
                          const date = p.created_at ? new Date(p.created_at).toLocaleDateString('en-SA', {
                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          }) : '--'
                          const refId = p.payment_id ? p.payment_id.slice(-8).toUpperCase() : '--'

                          return (
                            <tr key={p.payment_id} className="hover:bg-dc1-bg-primary transition">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-dc1-text-secondary">
                                {date}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-dc1-text-primary">
                                {p.amount_sar.toFixed(2)} SAR
                                {p.status === 'refunded' && p.refund_amount_halala && (
                                  <span className="text-orange-400 text-xs ml-1">
                                    (-{(p.refund_amount_halala / 100).toFixed(2)})
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-dc1-text-secondary">
                                {method}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2.5 py-1 rounded-full ${style.bg} ${style.text} text-xs font-medium`}>
                                  {style.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-xs text-dc1-text-muted font-mono">
                                {refId}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {paymentsPagination.total > paymentsPagination.limit && (
                    <div className="px-6 py-3 border-t border-dc1-border flex items-center justify-between">
                      <p className="text-xs text-dc1-text-muted">
                        Showing {paymentsPagination.offset + 1}-{Math.min(paymentsPagination.offset + paymentsPagination.limit, paymentsPagination.total)} of {paymentsPagination.total}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePrevPage}
                          disabled={paymentsPagination.offset === 0}
                          className="px-3 py-1.5 text-xs border border-dc1-border rounded-lg text-dc1-text-secondary hover:bg-dc1-bg-primary transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={handleNextPage}
                          disabled={paymentsPagination.offset + paymentsPagination.limit >= paymentsPagination.total}
                          className="px-3 py-1.5 text-xs border border-dc1-border rounded-lg text-dc1-text-secondary hover:bg-dc1-bg-primary transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Quick Actions ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-dc1-bg-secondary border border-dc1-border rounded-lg p-4">
                <p className="text-sm font-semibold text-dc1-text-primary mb-2">API Integration</p>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Manage your API keys and integrate DCP into your application
                </p>
                <Link
                  href="/renter/settings"
                  className="inline-block px-4 py-2 border border-dc1-border text-dc1-text-primary rounded-lg hover:bg-dc1-bg-primary transition font-medium text-sm"
                >
                  Manage Keys
                </Link>
              </div>

              <div className="bg-dc1-bg-secondary border border-dc1-border rounded-lg p-4">
                <p className="text-sm font-semibold text-dc1-text-primary mb-2">Playground</p>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Test AI models and submit inference jobs directly from the browser
                </p>
                <Link
                  href="/renter/playground"
                  className="inline-block px-4 py-2 border border-dc1-border text-dc1-text-primary rounded-lg hover:bg-dc1-bg-primary transition font-medium text-sm"
                >
                  Open Playground
                </Link>
              </div>

              <div className="bg-dc1-bg-secondary border border-dc1-border rounded-lg p-4">
                <p className="text-sm font-semibold text-dc1-text-primary mb-2">Invoices</p>
                <p className="text-sm text-dc1-text-secondary mb-3">
                  Download invoices and billing reports for accounting
                </p>
                <button
                  disabled
                  title="Coming in next update"
                  className="inline-block px-4 py-2 border border-dc1-border text-dc1-text-muted rounded-lg opacity-50 cursor-not-allowed font-medium text-sm"
                >
                  Export Reports
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// ── Suspense wrapper (useSearchParams requires it) ───────────────────────────
export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dc1-bg-primary flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-dc1-accent-primary border-t-transparent rounded-full" />
      </div>
    }>
      <BillingPageInner />
    </Suspense>
  )
}
