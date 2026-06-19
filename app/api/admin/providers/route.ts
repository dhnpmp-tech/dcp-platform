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

export async function GET(request: NextRequest) {
  const authError = requireAdminCallerAuth(request);
  if (authError) return authError;

  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/providers`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: adminHeaders(request),
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'Admin access denied' }, { status: res.status });
    }
    if (!res.ok) return NextResponse.json({ error: 'Backend error' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}
