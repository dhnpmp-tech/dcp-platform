export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';

interface PingResult {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTimeMs: number | null;
}

const SERVICE_URLS: Record<string, string> = {
  Vercel: 'https://dcp.sa',
  Supabase: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.com',
  'Mission Control': `${process.env.MC_API_URL || 'https://mc.dcp.sa'}/api/tasks`,
  'GitHub API': 'https://api.github.com',
};

export async function GET() {
  const MC_TOKEN = process.env.MC_API_TOKEN || '';

  const results: PingResult[] = await Promise.all(
    Object.entries(SERVICE_URLS).map(async ([name, url]) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const headers: Record<string, string> = {};
        if (name === 'Mission Control' && MC_TOKEN) {
          headers['Authorization'] = `Bearer ${MC_TOKEN}`;
        }
        const res = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers,
        });
        clearTimeout(timeout);
        const elapsed = Date.now() - start;
        const status: PingResult['status'] =
          res.ok ? (elapsed > 3000 ? 'degraded' : 'healthy') : 'down';
        return { name, status, responseTimeMs: elapsed };
      } catch {
        const elapsed = Date.now() - start;
        return { name, status: 'down' as const, responseTimeMs: elapsed > 10_000 ? null : elapsed };
      }
    }),
  );

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
