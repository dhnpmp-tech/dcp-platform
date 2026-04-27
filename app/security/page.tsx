'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SecurityEvent {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  provider_id: number;
  provider_name: string;
  description: string;
  timestamp: string;
}

interface SecuritySummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

const severityColors: Record<string, string> = {
  info: 'bg-[#00c853]/10 text-[#00c853]',
  warning: 'bg-[#ffab00]/10 text-[#ffab00]',
  critical: 'bg-[#ff5252]/10 text-[#ff5252]',
};

const typeLabels: Record<string, string> = {
  failed_heartbeat: '💀 Failed Heartbeat',
  new_registration: '🆕 New Registration',
  suspicious_toggle: '⚠️ Suspicious Toggle',
  active_threat: '🚨 Active Threat',
  provider_offline: '🔌 Provider Offline',
  provider_online: '✅ Provider Online',
  long_offline: '⏰ Extended Offline',
};

function getAdminToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null;
}

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return '/api';
  }
  return '/api';
}

// Derive security events from real provider data
function deriveSecurityEvents(providers: Array<{
  id: number; name: string; status: string; is_online: boolean;
  last_heartbeat?: string; created_at?: string; is_paused?: boolean;
  minutes_since_heartbeat?: number | null;
}>): SecurityEvent[] {
  const events: SecurityEvent[] = [];
  const now = new Date();

  for (const p of providers) {
    // New registration (created within last 24h)
    if (p.created_at) {
      const createdAt = new Date(p.created_at);
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation < 24) {
        events.push({
          type: 'new_registration',
          severity: 'info',
          provider_id: p.id,
          provider_name: p.name,
          description: `New provider registered: ${p.name}`,
          timestamp: p.created_at,
        });
      }
    }

    // Offline provider with recent heartbeat = potential issue
    if (!p.is_online && p.last_heartbeat) {
      const lastHB = new Date(p.last_heartbeat);
      const minutesSince = p.minutes_since_heartbeat ?? Math.round((now.getTime() - lastHB.getTime()) / 60_000);

      if (minutesSince < 30) {
        // Recently went offline — warning
        events.push({
          type: 'failed_heartbeat',
          severity: 'warning',
          provider_id: p.id,
          provider_name: p.name,
          description: `Lost heartbeat ${minutesSince} min ago — was recently online`,
          timestamp: p.last_heartbeat,
        });
      } else if (minutesSince < 1440) {
        // Offline for hours
        events.push({
          type: 'provider_offline',
          severity: 'info',
          provider_id: p.id,
          provider_name: p.name,
          description: `Offline for ${Math.round(minutesSince / 60)}h — last heartbeat: ${lastHB.toLocaleString()}`,
          timestamp: p.last_heartbeat,
        });
      } else {
        // Extended offline (>24h)
        events.push({
          type: 'long_offline',
          severity: 'warning',
          provider_id: p.id,
          provider_name: p.name,
          description: `Extended offline: ${Math.round(minutesSince / 1440)}d since last heartbeat`,
          timestamp: p.last_heartbeat,
        });
      }
    }

    // Online provider = good event
    if (p.is_online) {
      events.push({
        type: 'provider_online',
        severity: 'info',
        provider_id: p.id,
        provider_name: p.name,
        description: `Provider is online and healthy`,
        timestamp: p.last_heartbeat || now.toISOString(),
      });
    }

    // Paused provider
    if (p.is_paused) {
      events.push({
        type: 'suspicious_toggle',
        severity: 'info',
        provider_id: p.id,
        provider_name: p.name,
        description: 'Provider is paused — not receiving jobs',
        timestamp: p.last_heartbeat || now.toISOString(),
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

export default function SecurityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [summary, setSummary] = useState<SecuritySummary>({ total: 0, critical: 0, warning: 0, info: 0 });
  const [loading, setLoading] = useState(true);
  const [flagging, setFlagging] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback');

  const fetchData = useCallback(async () => {
    const API = getApiBase();
    const token = getAdminToken();
    if (!token) { router.push('/login'); return; }
    const headers: Record<string, string> = { 'x-admin-token': token };

    try {
      const res = await fetch(`${API}/admin/providers?page=0`, { headers });
      if (res.status === 401) { localStorage.removeItem('dc1_admin_token'); router.push('/login'); return; }
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const providers = data.providers || [];

      const derivedEvents = deriveSecurityEvents(providers);
      setEvents(derivedEvents);

      const summaryData: SecuritySummary = {
        total: derivedEvents.length,
        critical: derivedEvents.filter(e => e.severity === 'critical').length,
        warning: derivedEvents.filter(e => e.severity === 'warning').length,
        info: derivedEvents.filter(e => e.severity === 'info').length,
      };
      setSummary(summaryData);
      setDataSource('live');
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      // API offline — show empty state
      if (events.length === 0) {
        setEvents([]);
        setSummary({ total: 0, critical: 0, warning: 0, info: 0 });
      }
      setDataSource('fallback');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleFlag = async (providerId: number) => {
    setFlagging(providerId);
    try {
      const API = getApiBase();
      const token = getAdminToken();
      if (!token) return;
      await fetch(`${API}/admin/providers/${providerId}/suspend`, {
        method: 'POST',
        headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
      });
      await fetchData();
    } catch {
      // ignore — may not have suspend endpoint yet
    } finally {
      setFlagging(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#00d4ff]">🛡️ Security Guards View</h1>
        <div className="flex items-center gap-3">
          {dataSource === 'live' && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#00c853]/10 text-[#00c853]">LIVE</span>
          )}
          {dataSource === 'fallback' && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#ffab00]/10 text-[#ffab00]">API Offline</span>
          )}
          <span className="text-xs text-gray-500">Auto-refresh 30s</span>
          {lastRefresh && <span className="text-xs text-gray-600">Last: {lastRefresh}</span>}
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded bg-[#21262d] text-gray-300 text-xs hover:bg-[#30363d] transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: summary.total, color: 'text-white' },
          { label: 'Critical', value: summary.critical, color: 'text-[#ff5252]' },
          { label: 'Warnings', value: summary.warning, color: 'text-[#ffab00]' },
          { label: 'Info', value: summary.info, color: 'text-[#00c853]' },
        ].map((card) => (
          <div key={card.label} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</div>
            <div className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Live Event Feed */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Live Event Feed</h2>
          <span className="text-xs text-gray-600">{events.length} events</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading security events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            ✅ No security events — all clear
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-[#30363d]">
                  <th className="text-left px-4 py-2">Timestamp</th>
                  <th className="text-left px-4 py-2">Provider</th>
                  <th className="text-left px-4 py-2">Event</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={`${event.provider_id}-${event.type}-${i}`} className="border-b border-[#30363d]/50 hover:bg-[#21262d]">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[#00d4ff] text-xs whitespace-nowrap">
                      #{event.provider_id} {event.provider_name}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{typeLabels[event.type] || event.type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[event.severity]}`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{event.description}</td>
                    <td className="px-4 py-3">
                      {event.severity !== 'info' && (
                        <button
                          onClick={() => handleFlag(event.provider_id)}
                          disabled={flagging === event.provider_id}
                          className="px-2 py-1 rounded text-xs bg-[#ff5252]/10 text-[#ff5252] hover:bg-[#ff5252]/20 transition-colors disabled:opacity-50"
                        >
                          {flagging === event.provider_id ? '...' : '🚩 Flag'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
