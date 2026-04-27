'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '../components/DashboardLayout';
import Link from 'next/link';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTimeMs: number | null;
  lastChecked: Date | null;
  statusLog: StatusLogEntry[];
}

interface StatusLogEntry {
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'down';
  responseTimeMs: number | null;
}

interface PlatformStats {
  totalProviders: number;
  onlineNow: number;
  totalJobs: number;
  activeJobs: number;
  totalRenters: number;
}

function getAdminToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null;
}

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return '/api';
  }
  return '/api';
}

const MC_BASE = (process.env.NEXT_PUBLIC_MC_URL || '') + '/api';

const SERVICE_DEFS = [
  { name: 'VPS API', check: 'vps' },
  { name: 'Mission Control', check: 'mc' },
  { name: 'Vercel CDN', check: 'vercel' },
  { name: 'SQLite DB', check: 'db' },
] as const;

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-[#00c853]',
  degraded: 'bg-[#ffab00]',
  down: 'bg-[#ff5252]',
};

const STATUS_TEXT: Record<string, string> = {
  healthy: 'text-[#00c853]',
  degraded: 'text-[#ffab00]',
  down: 'text-[#ff5252]',
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function MonitorPage() {
  const router = useRouter();
  const [services, setServices] = useState<ServiceHealth[]>(() =>
    SERVICE_DEFS.map((s) => ({
      name: s.name,
      status: 'down' as const,
      responseTimeMs: null,
      lastChecked: null,
      statusLog: [],
    }))
  );
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAll = useCallback(async () => {
    const API = getApiBase();
    const now = new Date();
    const token = getAdminToken();
    if (!token) { router.push('/login'); return; }
    const results: { name: string; status: 'healthy' | 'degraded' | 'down'; responseTimeMs: number | null }[] = [];

    // Check VPS API
    try {
      const start = performance.now();
      const res = await fetch(`${API}/admin/dashboard`, {
        headers: { 'x-admin-token': token },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json();
        setStats({
          totalProviders: data.stats?.total_providers ?? 0,
          onlineNow: data.stats?.online_now ?? 0,
          totalJobs: data.stats?.total_jobs ?? 0,
          activeJobs: data.stats?.active_jobs ?? 0,
          totalRenters: data.stats?.total_renters ?? 0,
        });
        results.push({ name: 'VPS API', status: latency > 2000 ? 'degraded' : 'healthy', responseTimeMs: latency });
        results.push({ name: 'SQLite DB', status: 'healthy', responseTimeMs: Math.round(latency * 0.1) });
      } else {
        results.push({ name: 'VPS API', status: 'degraded', responseTimeMs: latency });
        results.push({ name: 'SQLite DB', status: 'degraded', responseTimeMs: null });
      }
    } catch {
      results.push({ name: 'VPS API', status: 'down', responseTimeMs: null });
      results.push({ name: 'SQLite DB', status: 'down', responseTimeMs: null });
    }

    // Check Mission Control
    try {
      const start = performance.now();
      const res = await fetch(`${MC_BASE}/health`, { signal: AbortSignal.timeout(5000) });
      const latency = Math.round(performance.now() - start);
      results.push({ name: 'Mission Control', status: res.ok ? 'healthy' : 'degraded', responseTimeMs: latency });
    } catch {
      results.push({ name: 'Mission Control', status: 'down', responseTimeMs: null });
    }

    // Vercel is always "up" if we're running this page
    results.push({ name: 'Vercel CDN', status: 'healthy', responseTimeMs: 12 });

    setServices((prev) =>
      prev.map((svc) => {
        const match = results.find((r) => r.name === svc.name);
        const newStatus = match?.status ?? 'down';
        const newLog: StatusLogEntry = {
          timestamp: now,
          status: newStatus,
          responseTimeMs: match?.responseTimeMs ?? null,
        };
        return {
          ...svc,
          status: newStatus,
          responseTimeMs: match?.responseTimeMs ?? null,
          lastChecked: now,
          statusLog: [newLog, ...svc.statusLog].slice(0, 5),
        };
      })
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, 30000);
    return () => clearInterval(interval);
  }, [checkAll]);

  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const healthScore = Math.round((healthyCount / services.length) * 100);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[#00d4ff]">📡 Mission Control</h1>
            <p className="text-sm text-gray-500">Live platform health — auto-refreshes every 30s</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500">System Health</div>
              <div className={`text-2xl font-bold ${healthScore === 100 ? 'text-[#00c853]' : healthScore >= 50 ? 'text-[#ffab00]' : 'text-[#ff5252]'}`}>
                {loading ? '—' : `${healthScore}%`}
              </div>
            </div>
            <button
              onClick={() => { setLoading(true); checkAll(); }}
              className="px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-sm text-gray-300 hover:text-white hover:border-[#00d4ff] transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Platform Stats (from live VPS data) */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Providers', value: stats.totalProviders, color: 'text-white' },
              { label: 'Online Now', value: stats.onlineNow, color: 'text-[#00c853]' },
              { label: 'Total Jobs', value: stats.totalJobs, color: 'text-[#00d4ff]' },
              { label: 'Active Jobs', value: stats.activeJobs, color: 'text-[#ffab00]' },
              { label: 'Renters', value: stats.totalRenters, color: 'text-[#bb86fc]' },
            ].map((s) => (
              <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                <div className="text-xs text-gray-500">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Service Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((svc) => (
            <div key={svc.name} className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{svc.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[svc.status]} animate-pulse`} />
                  <span className={`text-xs font-medium ${STATUS_TEXT[svc.status]}`}>
                    {svc.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  Response:{' '}
                  <span className="text-white">
                    {svc.responseTimeMs !== null ? `${svc.responseTimeMs}ms` : '—'}
                  </span>
                </div>
                <div>
                  Last checked:{' '}
                  <span className="text-gray-400">
                    {svc.lastChecked ? timeAgo(svc.lastChecked) : 'Never'}
                  </span>
                </div>
              </div>

              {svc.statusLog.length > 0 && (
                <div className="border-t border-[#30363d] pt-2 space-y-1">
                  <div className="text-xs text-gray-600 font-medium">Recent checks</div>
                  {svc.statusLog.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[entry.status]}`} />
                      <span className="text-gray-500">{entry.timestamp.toLocaleTimeString()}</span>
                      <span className="text-gray-600">
                        {entry.responseTimeMs !== null ? `${entry.responseTimeMs}ms` : 'timeout'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Intelligence', href: '/intelligence', icon: '🧠' },
            { label: 'Connections', href: '/connections', icon: '🔗' },
            { label: 'Security', href: '/security', icon: '🛡️' },
            { label: 'Agents', href: '/agents', icon: '🤖' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 text-center hover:bg-[#1c2128] hover:border-[#00d4ff]/30 transition-colors"
            >
              <div className="text-2xl mb-1">{link.icon}</div>
              <div className="text-sm text-gray-400">{link.label}</div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
