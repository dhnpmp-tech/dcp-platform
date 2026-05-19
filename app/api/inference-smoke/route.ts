// Temporary server-side proxy to api.dcp.sa/v1/chat/completions.
// Lets us smoke the inference path from networks that block Hostinger IPs
// (e.g. public wifi). Hardcoded model + key for the qwen3.6-35b-mtp smoke;
// remove once the daemon-fix lands and we're back on api.dcp.sa directly.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const UPSTREAM = 'https://api.dcp.sa/v1/chat/completions';

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'POST a JSON body with {prompt: string, max_tokens?: number, model?: string} OR pass ?prompt=... in the query',
    default_model: 'qwen3.6-35b-mtp',
  });
}

export async function POST(req: NextRequest) {
  try {
    let prompt = '';
    let maxTokens = 120;
    let model = 'qwen3.6-35b-mtp';
    let renterKey = '';

    const ctype = req.headers.get('content-type') || '';
    if (ctype.includes('application/json')) {
      const body = await req.json();
      prompt = String(body.prompt || body.message || '/no_think Reply in one sentence: hello from Saudi Arabia.');
      maxTokens = Number(body.max_tokens || 120);
      model = String(body.model || model);
      renterKey = String(body.renter_key || '');
    } else {
      const url = new URL(req.url);
      prompt = url.searchParams.get('prompt') || '/no_think Reply in one sentence: hello.';
      maxTokens = Number(url.searchParams.get('max_tokens') || 120);
      model = url.searchParams.get('model') || model;
    }

    const apiKey = renterKey || process.env.DCP_SMOKE_RENTER_KEY || 'dcp-renter-06f9bf5b311cbb4ae561b43b1e26373f';

    // Pre-flight: pin Tareq Node 2 provider row to point at the live llama-server.
    // The provider daemon's full-shape heartbeat trips a backend silent-drop path
    // (separate bug), so we self-heartbeat with the minimal correct shape before
    // each inference attempt. Removes once the daemon-side fix lands.
    try {
      await fetch('https://api.dcp.sa/api/providers/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: 'dcp-provider-c817120867acf6c1a877915cb5af2d8f',
          gpu_status: { gpu_name: 'NVIDIA GeForce RTX 3090', gpu_vram_mib: 24576, driver_version: '595.58.03' },
          provider_ip: '10.8.0.6',
          provider_hostname: 'tareq-node2',
          vllm_models: ['qwen3.6-35b-mtp', 'qwen3.6-35b-a3b', 'qwen3.6-35b'],
          vllm_endpoint_url: 'http://10.8.0.6:8080/v1',
          wg_mesh_ip: '10.8.0.6',
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      // pre-flight is best-effort; the inference call below is the real test
    }

    const t0 = Date.now();
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(85_000),
    });
    const elapsedMs = Date.now() - t0;

    const upstreamBody = await upstream.json().catch(() => ({ raw: 'non-json' }));

    return NextResponse.json({
      ok: upstream.ok,
      status: upstream.status,
      elapsed_ms: elapsedMs,
      model_requested: model,
      upstream: upstreamBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
