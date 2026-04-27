// Legacy proxy for /api/dc1/* — kept because several frontend pages still use
// API_BASE = '/api/dc1' (renter dashboard, jobs, billing, models, etc.).
//
// BACKEND is hardcoded to the public api.dcp.sa hostname for the same reason
// app/api/[...path]/route.ts is: Vercel BACKEND_URL was misconfigured and
// the env var resolved to a private IP, so every /api/dc1/* request 404'd
// with x-vercel-error: DNS_HOSTNAME_RESOLVED_PRIVATE.
//
// Once all frontend fetches are swept from /api/dc1/* → /api/*, this whole
// file can be deleted.

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
