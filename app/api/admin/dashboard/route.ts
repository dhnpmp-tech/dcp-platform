export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa';

// Pre-flight that ensures a caller-provided token exists. Backend is the
// source of truth for validity — timing-safe compare lives there. The
// previous Vercel-side re-check (process.env.DC1_ADMIN_TOKEN vs caller)
// drifted out of sync with the VPS env, causing valid backend tokens to
// 401 at the edge. Remove the duplicate; forward the caller token and let
// the backend decide.
function requireAdminCallerAuth(request: NextRequest): NextResponse | null {
  const callerToken = request.headers.get('x-admin-token');
  if (!callerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// Build headers for backend calls — forwards the caller's admin token
// verbatim so backend timingSafeEqual is the single source of truth.
function adminHeaders(request: NextRequest): HeadersInit {
  const headers: Record<string, string> = {};
  const clientToken = request.headers.get('x-admin-token');
  if (clientToken) headers['x-admin-token'] = clientToken;
  return headers;
}

// Generic fetch — no auth (intelligence / reconciliation / jobs are open routers)
async function safeFetch(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Admin-gated fetch — forwards DC1_ADMIN_TOKEN so token middleware passes
async function adminFetch(url: string, request: NextRequest) {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: adminHeaders(request),
    });
    if (!res.ok) return { __status: res.status, data: null };
    return { __status: 200, data: await res.json() };
  } catch {
    return { __status: 502, data: null };
  }
}

export async function GET(request: NextRequest) {
  const authError = requireAdminCallerAuth(request);
  if (authError) return authError;

  const dashResult = await adminFetch(`${BACKEND_URL}/api/admin/dashboard`, request);

  // If admin endpoint returns 401, propagate it so the frontend can re-auth
  if (dashResult.__status === 401 || dashResult.__status === 403) {
    return NextResponse.json({ error: 'Admin access denied' }, { status: dashResult.__status });
  }

  const [fleet, reconciliation, activeJobsRaw] = await Promise.all([
    safeFetch(`${BACKEND_URL}/api/intelligence/fleet`),
    safeFetch(`${BACKEND_URL}/api/reconciliation/summary`),
    safeFetch(`${BACKEND_URL}/api/jobs/active`),
  ]);

  const activeJobs = activeJobsRaw?.jobs ?? null;

  return NextResponse.json({
    dashboard: dashResult.data,
    fleet,
    reconciliation,
    activeJobs,
    fetchedAt: new Date().toISOString(),
  });
}
