// Catch-all backend proxy for the post-rename frontend.
//
// Mirror of app/api/[...path]/route.ts but hardcoded to https://api.dcp.sa
// because Vercel BACKEND_URL env was misconfigured (rejected with
// DNS_HOSTNAME_RESOLVED_PRIVATE), and ALL /api/* AND /api/* rewrites
// in next.config.js were 404ing.
//
// After PR #297 swept frontend fetches from /api/* → /api/*, those
// requests had no route handler. This catch-all proxies them straight to
// the public backend over HTTPS so Vercel's private-IP guard never trips.
//
// Explicit routes under app/api/* (e.g. app/api/providers/route.ts,
// app/api/jobs/[id]/route.ts) take precedence over this catch-all per
// Next.js file-based routing — only requests with no explicit handler
// fall through to here.

import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'https://api.dcp.sa';

function buildBackendUrl(pathSegments: string[], search: string): string {
  const safePath = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
  return `${BACKEND}/api/${safePath}${search}`;
}

function copyRequestHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.delete('host');
  nextHeaders.delete('content-length');
  return nextHeaders;
}

async function proxyToBackend(req: NextRequest, path: string[]): Promise<NextResponse> {
  const targetUrl = buildBackendUrl(path, req.nextUrl.search);
  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();

  const backendRes = await fetch(targetUrl, {
    method,
    headers: copyRequestHeaders(req.headers),
    body,
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers(backendRes.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');

  // Progressive endpoints (e.g. the public demo with ?stream=1) mark
  // themselves with X-Dcp-Stream — pass the body through untouched so
  // chunks reach the browser as they arrive. Everything else keeps the
  // buffered behaviour this proxy has always had.
  if (backendRes.headers.get('x-dcp-stream') === '1' && backendRes.body) {
    return new NextResponse(backendRes.body, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(await backendRes.arrayBuffer(), {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function OPTIONS(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}
