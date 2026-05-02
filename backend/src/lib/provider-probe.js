'use strict';

/**
 * Audit C3 — backend-side endpoint reachability probe.
 *
 * Why a backend-side probe at all: the daemon heartbeat tells us "this
 * daemon is alive on its own LAN", but it can't tell us whether the
 * provider's `vllm_endpoint_url` (Cloudflare tunnel, WG mesh IP, public
 * VPS, etc.) is reachable from THIS backend. We have hit this exact gap
 * twice in production already — see infra_cloudflare_tunnel_block memo and
 * infra_quick_tunnel_orphan_2026-04-27. In both cases the daemon was
 * happy, the heartbeat was fresh, and the endpoint was 403/dead.
 *
 * Why a background loop instead of probing per-request: probing on every
 * /v1/chat/completions hit would add 50-200 ms of latency to every renter
 * call, defeating the point. A 30 s background sweep keeps the latency
 * budget on the inference path while still catching dead endpoints
 * within one heartbeat-stale window.
 *
 * What it writes:
 *   providers.endpoint_reachable     0 = unreachable, 1 = reachable
 *   providers.endpoint_probed_at     ISO timestamp of last probe
 *   providers.endpoint_probe_error   short reason on failure (truncated)
 *
 * v1.js `getCapableProviders` filters `endpoint_reachable !== 0`. NULL
 * means never probed yet — treat as reachable so newly registered
 * providers can serve immediately.
 */

const db = require('../db');

const PROBE_INTERVAL_MS = Number(process.env.DCP_PROBE_INTERVAL_MS) || 30 * 1000;
const PROBE_TIMEOUT_MS = Number(process.env.DCP_PROBE_TIMEOUT_MS) || 5 * 1000;
const PROBE_HEARTBEAT_STALE_MS = 5 * 60 * 1000; // skip providers whose heartbeat is already stale

let _timer = null;
let _running = false;

function _normalizeBaseUrl(url) {
  // vllm_endpoint_url may be the bare host:port or include a path.
  // We want to hit a cheap health-ish path that both Ollama and vLLM serve.
  // Ollama serves GET / → "Ollama is running". vLLM serves GET /v1/models
  // (heavier, but cached). Try /v1/models first; fall back to /.
  if (typeof url !== 'string' || !url.trim()) return null;
  let trimmed = url.trim().replace(/\/+$/, '');
  // Strip trailing /v1 or /v1/<anything> so we own the path.
  trimmed = trimmed.replace(/\/v1(\/.*)?$/, '');
  return trimmed;
}

async function _probeEndpoint(base) {
  // Try /v1/models first (works for both Ollama-OAI and vLLM). If that
  // 404s or otherwise fails the network layer, try /. We only mark
  // unreachable on actual network/timeout errors — a 4xx still means
  // "something is listening", which is what we care about.
  for (const path of ['/v1/models', '/']) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return { ok: true, error: null, status: res.status };
    } catch (err) {
      if (path === '/') {
        const msg = String(err && err.message ? err.message : err).slice(0, 200);
        return { ok: false, error: msg };
      }
    }
  }
  return { ok: false, error: 'unknown' };
}

async function _probeOne(provider) {
  // H5 routing preference: probe WG mesh IP first when available
  if (provider.wg_mesh_ip) {
    const wgPort = (provider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
    const wgBase = `http://${provider.wg_mesh_ip}:${wgPort}`;
    const wgResult = await _probeEndpoint(wgBase);
    if (wgResult.ok) return wgResult;
    // WG unreachable — fall through to vllm_endpoint_url
  }

  const base = _normalizeBaseUrl(provider.vllm_endpoint_url);
  if (!base) {
    return { ok: false, error: 'no_endpoint_url' };
  }
  return _probeEndpoint(base);
}

function _onlineProviders() {
  const cutoff = new Date(Date.now() - PROBE_HEARTBEAT_STALE_MS).toISOString();
  return db.all(
    `SELECT id, vllm_endpoint_url, wg_mesh_ip FROM providers
     WHERE status = 'online'
       AND COALESCE(is_paused, 0) = 0
       AND deleted_at IS NULL
       AND last_heartbeat >= ?`,
    [cutoff]
  );
}

async function runProbeOnce() {
  const providers = _onlineProviders();
  if (!providers.length) return { probed: 0 };

  const updateStmt = db.prepare(
    `UPDATE providers
     SET endpoint_reachable = ?, endpoint_probed_at = ?, endpoint_probe_error = ?
     WHERE id = ?`
  );

  let reachable = 0;
  let unreachable = 0;
  await Promise.all(
    providers.map(async (p) => {
      const { ok, error } = await _probeOne(p);
      const nowIso = new Date().toISOString();
      try {
        updateStmt.run(ok ? 1 : 0, nowIso, ok ? null : (error || 'unknown'), p.id);
      } catch (e) {
        console.warn(`[provider-probe] write failed for provider ${p.id}: ${e.message}`);
        return;
      }
      if (ok) reachable += 1;
      else {
        unreachable += 1;
        console.warn(`[provider-probe] provider ${p.id} unreachable at ${p.vllm_endpoint_url}: ${error}`);
      }
    })
  );

  console.log(`[provider-probe] swept ${providers.length} provider(s): ${reachable} reachable, ${unreachable} unreachable`);
  return { probed: providers.length, reachable, unreachable };
}

function startProbeLoop() {
  if (_timer) return; // already running
  _running = true;
  const tick = async () => {
    if (!_running) return;
    try { await runProbeOnce(); }
    catch (err) { console.warn(`[provider-probe] loop tick failed: ${err.message}`); }
    if (_running) _timer = setTimeout(tick, PROBE_INTERVAL_MS);
  };
  // First tick on next event-loop pass so server.listen() finishes first.
  _timer = setTimeout(tick, 1000);
  console.log(`[provider-probe] started (interval=${PROBE_INTERVAL_MS}ms, timeout=${PROBE_TIMEOUT_MS}ms)`);
}

function stopProbeLoop() {
  _running = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

module.exports = {
  startProbeLoop,
  stopProbeLoop,
  runProbeOnce,
  // exported for tests
  _normalizeBaseUrl,
  PROBE_INTERVAL_MS,
};
