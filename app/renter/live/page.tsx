'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../../components/layout/DashboardLayout'

const API_BASE = '/api'

interface ActiveRequest {
  requestId: string
  model: string
  status: string
  stream: boolean
  maxTokens: number
  temperature: number
  providerGpu: string
  tokensGenerated: number
  promptTokens: number
  completionTokens: number
  progressPct: number
  tokensPerSec: number
  elapsedMs: number
  elapsedSec: number
  etaSeconds: number | null
  costHalala: number
  startedAt: string
  completedAt: string | null
  error: string | null
}

interface SessionStats {
  startedAt: string
  durationSec: number
  totalRequests: number
  totalErrors: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCostHalala: number
  totalCostUsd: string
  avgTokensPerSec: number
  successRate: number
}

interface LiveData {
  renter: { id: number; name: string; balanceHalala: number; balanceSar: string }
  active: ActiveRequest[]
  recent: ActiveRequest[]
  session: SessionStats
  _ts: string
}

export default function LiveMonitorPage() {
  const [apiKey, setApiKey] = useState('')
  const [data, setData] = useState<LiveData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    const key = localStorage.getItem('dc1_renter_key')
    if (key) {
      setApiKey(key)
    }
  }, [])

  const fetchLive = useCallback(async () => {
    if (!apiKey) return
    try {
      const res = await fetch(`${API_BASE}/renters/me/live?key=${encodeURIComponent(apiKey)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    fetchLive()
    setPolling(true)
    const interval = setInterval(fetchLive, 2000)
    return () => { clearInterval(interval); setPolling(false) }
  }, [apiKey, fetchLive])

  const s = data?.session

  return (
    <DashboardLayout navItems={[]} role="renter" userName={data?.renter?.name || ''}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Live Inference Monitor</h1>
            <p className="text-sm text-gray-400 mt-1">
              Real-time view of your inference requests
            </p>
          </div>
          <div className="flex items-center gap-3">
            {polling && (
              <span className="flex items-center gap-2 text-sm text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Polling every 2s
              </span>
            )}
            {data && (
              <span className="text-xs text-gray-500">
                Balance: {data.renter.balanceSar} SAR
              </span>
            )}
          </div>
        </div>

        {/* Session Stats */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatBox label="Requests" value={String(s.totalRequests)} />
            <StatBox label="Total Tokens" value={formatNum(s.totalTokens)} accent />
            <StatBox label="Avg Tok/s" value={String(s.avgTokensPerSec)} />
            <StatBox label="Errors" value={String(s.totalErrors)} />
            <StatBox label="Cost" value={s.totalCostUsd} />
            <StatBox label="Active" value={String(data?.active?.length || 0)} accent />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Active Requests */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Active Requests
          </h2>
          {data?.active && data.active.length > 0 ? (
            <div className="space-y-3">
              {data.active.map((req) => (
                <RequestCard key={req.requestId} req={req} active />
              ))}
            </div>
          ) : (
            <EmptyState text="No active inference requests" />
          )}
        </section>

        {/* Recent */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Recent Completed
          </h2>
          {data?.recent && data.recent.length > 0 ? (
            <div className="space-y-3">
              {data.recent.map((req) => (
                <RequestCard key={req.requestId} req={req} />
              ))}
            </div>
          ) : (
            <EmptyState text="No recent requests" />
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ? 'text-cyan-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

function RequestCard({ req, active }: { req: ActiveRequest; active?: boolean }) {
  const isError = req.status === 'error'
  const borderClass = active ? 'border-cyan-500/50' : isError ? 'border-red-500/30' : 'border-gray-700'
  const progressColor = isError ? 'bg-red-500' : active ? 'bg-cyan-400' : 'bg-emerald-500'

  return (
    <div className={`bg-gray-800/50 border ${borderClass} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">{req.model}</span>
        <span className={`text-xs px-2 py-1 rounded font-semibold uppercase ${
          active ? 'bg-cyan-500/15 text-cyan-400' :
          isError ? 'bg-red-500/15 text-red-400' :
          'bg-emerald-500/15 text-emerald-400'
        }`}>
          {req.status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${progressColor} rounded-full transition-all duration-500`}
          style={{ width: `${req.progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric label="Progress" value={`${req.progressPct}%`} accent={active} />
        <Metric label="Tokens" value={`${req.completionTokens || req.tokensGenerated} / ${req.maxTokens}`} />
        <Metric label="Tok/s" value={String(req.tokensPerSec)} accent={active} />
        <Metric label="Elapsed" value={`${req.elapsedSec}s`} />
        {active && req.etaSeconds != null && (
          <Metric label="ETA" value={`${req.etaSeconds}s`} />
        )}
        <Metric label="GPU" value={req.providerGpu} />
        {isError && req.error && (
          <Metric label="Error" value={req.error} error />
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, accent, error }: { label: string; value: string; accent?: boolean; error?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label} </span>
      <span className={`font-semibold ${error ? 'text-red-400' : accent ? 'text-cyan-400' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-gray-500 text-sm">
      {text}
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}
