'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useLanguage } from '../lib/i18n';

interface PaperclipAgent {
  id: string;
  name: string;
  role: string;
  urlKey: string;
  status: string;
  spentMonthlyCents: number;
  budgetMonthlyCents: number;
  lastHeartbeatAt: string | null;
}

const AGENT_COLORS: Record<string, string> = {
  ceo: '#ffd700',
  'devops-automator': '#4da6ff',
  'backend-architect': '#00c853',
  'security-engineer': '#ff5252',
  'frontend-developer': '#bb86fc',
  'founding-engineer': '#00d4ff',
};

function usageColor(pct: number): string {
  if (pct > 80) return '#ff5252';
  if (pct > 50) return '#ffab00';
  return '#00c853';
}

function usageBarClass(pct: number): string {
  if (pct > 80) return 'bg-[#ff5252]';
  if (pct > 50) return 'bg-[#ffab00]';
  return 'bg-[#00c853]';
}

function getColor(role: string): string {
  return AGENT_COLORS[role] || '#888';
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function SkeletonRow() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 bg-[#21262d] rounded w-24" />
        <div className="flex-1 h-2 bg-[#21262d] rounded" />
        <div className="h-4 bg-[#21262d] rounded w-20" />
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const { t } = useLanguage();
  const [agents, setAgents] = useState<PaperclipAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'live' | 'unavailable'>('unavailable');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/paperclip-agents', { cache: 'no-store' });
      if (res.ok) {
        const data: PaperclipAgent[] = await res.json();
        setAgents(data.sort((a, b) => b.spentMonthlyCents - a.spentMonthlyCents));
        setDataSource('live');
        setLastRefresh(new Date());
      } else {
        setDataSource('unavailable');
      }
    } catch {
      setDataSource('unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 60000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const totalSpentCents = agents.reduce((s, a) => s + a.spentMonthlyCents, 0);
  const totalBudgetCents = agents.reduce((s, a) => s + a.budgetMonthlyCents, 0);
  const totalSpentDollars = totalSpentCents / 100;
  const activeCount = agents.filter(a => a.status === 'running').length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[#00d4ff]">💰 Agent Budget</h1>
            <p className="text-sm text-gray-500">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            {dataSource === 'live' && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#00c853]/10 text-[#00c853]">LIVE</span>
            )}
            {dataSource === 'unavailable' && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#ffab00]/10 text-[#ffab00]">API Unavailable</span>
            )}
            {lastRefresh && (
              <span className="text-xs text-gray-600">Updated {lastRefresh.toLocaleTimeString()}</span>
            )}
            <div className="text-right">
              <div className="text-xs text-gray-500">Total Spent (Month)</div>
              <div className="text-xl font-bold text-[#ffd700]">${totalSpentDollars.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div className="text-xs text-gray-500 mb-1">Total Agents</div>
            <div className="text-2xl font-bold text-[#00d4ff]">{agents.length}</div>
            <div className="text-xs text-gray-600 mt-1">{activeCount} currently running</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div className="text-xs text-gray-500 mb-1">Monthly Spend</div>
            <div className="text-2xl font-bold text-[#ffd700]">${totalSpentDollars.toFixed(2)}</div>
            {totalBudgetCents > 0 ? (
              <>
                <div className="w-full h-1.5 rounded-full bg-[#21262d] mt-2">
                  <div
                    className={`h-1.5 rounded-full ${usageBarClass((totalSpentCents / totalBudgetCents) * 100)}`}
                    style={{ width: `${Math.min((totalSpentCents / totalBudgetCents) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  of ${(totalBudgetCents / 100).toFixed(2)} budget
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-600 mt-1">No budget cap set</div>
            )}
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
            <div className="text-xs text-gray-500 mb-1">Avg Cost / Agent</div>
            <div className="text-2xl font-bold text-[#bb86fc]">
              {agents.length > 0 ? `$${(totalSpentDollars / agents.length).toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-xs text-gray-600 mt-1">this month</div>
          </div>
        </div>

        {/* Per-agent rows */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Per-Agent Spending</h2>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            : dataSource === 'unavailable'
            ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center text-gray-500">
                <div className="text-2xl mb-2">⚙️</div>
                <div className="text-sm">Paperclip API not configured</div>
                <div className="text-xs mt-1 text-gray-600">
                  Set PAPERCLIP_API_URL, PAPERCLIP_API_KEY, and PAPERCLIP_COMPANY_ID environment variables
                </div>
              </div>
            )
            : agents.map((agent) => {
              const color = getColor(agent.role);
              const spentDollars = agent.spentMonthlyCents / 100;
              const budgetDollars = agent.budgetMonthlyCents / 100;
              const pct = agent.budgetMonthlyCents > 0
                ? (agent.spentMonthlyCents / agent.budgetMonthlyCents) * 100
                : 0;

              return (
                <div key={agent.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm" style={{ color }}>
                        {agent.name}
                      </span>
                      <span className="text-xs text-gray-600 font-mono">{agent.role}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        agent.status === 'running'
                          ? 'bg-[#00c853]/10 text-[#00c853]'
                          : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-white">${spentDollars.toFixed(2)}</div>
                      {agent.budgetMonthlyCents > 0 && (
                        <div className="text-xs text-gray-600">/ ${budgetDollars.toFixed(2)} cap</div>
                      )}
                    </div>
                  </div>

                  {agent.budgetMonthlyCents > 0 ? (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Monthly Budget</span>
                        <span className="text-gray-400">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#21262d]">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: usageColor(pct),
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">No budget cap</div>
                  )}

                  {agent.lastHeartbeatAt && (
                    <div className="text-xs text-gray-600 mt-2">
                      Last active: {timeAgo(agent.lastHeartbeatAt)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Model Cost Breakdown */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {t('budget.model_rates_title')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { model: 'Sonnet 4.6', input: '$3.00', output: '$15.00', color: '#00d4ff' },
              { model: 'Haiku 4.5', input: '$0.25', output: '$1.25', color: '#00c853' },
              { model: 'Opus 4.6', input: '$15.00', output: '$75.00', color: '#ffd700' },
              { model: 'MiniMax', input: '$0.40', output: '$1.60', color: '#bb86fc' },
            ].map((m) => (
              <div key={m.model} className="text-center p-3 bg-[#21262d] rounded-lg">
                <div className="font-bold text-sm" style={{ color: m.color }}>{m.model}</div>
                <div className="text-xs text-gray-500 mt-1">In: {m.input}/M</div>
                <div className="text-xs text-gray-500">Out: {m.output}/M</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
