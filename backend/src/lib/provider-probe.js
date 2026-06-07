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
 *   providers.endpoint_probe_failures consecutive failed backend probes
 *
 * v1.js `getCapableProviders` requires a positive backend verdict
 * (`endpoint_reachable = 1` plus a probe timestamp). Heartbeat-only freshness
 * must never be enough to enter catalog or routing.
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
    `SELECT id, vllm_endpoint_url, wg_mesh_ip,
            endpoint_reachable, endpoint_probed_at, endpoint_probe_failures
       FROM providers
     WHERE status = 'online'
       AND COALESCE(is_paused, 0) = 0
       AND deleted_at IS NULL
       AND last_heartbeat >= ?`,
    [cutoff]
  );
}

// Track consecutive probe failures per provider. Persisted DB state is the
// source of truth across process restarts; the map covers older schemas or
// short-lived write gaps during a rollout.
const _consecutiveFailures = new Map(); // provider_id -> count
const UNREACHABLE_THRESHOLD = 3;

// ── Per-engine backend reachability (multi-engine routing) ─────────────────
// The legacy probe above only tests providers.vllm_endpoint_url (one port).
// A provider can run several engines on different ports (e.g. Node 2:
// llama.cpp :8080 + Ollama :11434), and the router sends each model to ITS
// engine's base_url. So we must know which engines the BACKEND can actually
// reach — not just the single registered endpoint. We probe each engine,
// persist provider_engines.reachable, and treat the provider as reachable as
// long as ANY engine is reachable (so one flaky engine can't black-hole the
// provider's healthy ones).
const _engineFailures = new Map(); // engine_id -> consecutive backend-probe fails
const ENGINE_UNREACHABLE_THRESHOLD = 2;

function _engineProbeBase(rawBaseUrl) {
  // engine base_url may carry a trailing /v1 (Ollama OAI) — strip it so the
  // shared _probeEndpoint appends /v1/models without doubling the path.
  let b = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  b = b.replace(/\/v1$/i, '');
  return _normalizeBaseUrl(b);
}

// Probe every engine of a provider, persist per-engine reachability with the
// same transient-failure hysteresis, and return true if any engine is
// reachable. Returns false (and is a no-op) when the provider has no engine
// rows — the legacy single-endpoint path still governs those providers.
async function _probeEngines(providerId) {
  let engines;
  try {
    engines = db.all(
      'SELECT id, engine_type, base_url FROM provider_engines WHERE provider_id = ?',
      [providerId]
    );
  } catch (_) {
    return false; // table missing on older schema
  }
  if (!Array.isArray(engines) || engines.length === 0) return false;

  const updReach = db.prepare(
    'UPDATE provider_engines SET reachable = ?, last_probed_at = ?, last_probe_error = ? WHERE id = ?'
  );
  // hysteresis case: refresh probe metadata WITHOUT flipping reachable
  const updKeep = db.prepare(
    'UPDATE provider_engines SET last_probed_at = ?, last_probe_error = ? WHERE id = ?'
  );
  const nowIso = new Date().toISOString();

  await Promise.all(engines.map(async (e) => {
    const eid = Number(e.id);
    let ok = false;
    let error = 'no base_url';
    if (e.base_url) {
      const r = await _probeEndpoint(_engineProbeBase(e.base_url));
      ok = r.ok;
      error = r.error;
    }
    if (ok) {
      _engineFailures.delete(eid);
      try { updReach.run(1, nowIso, null, eid); } catch (_) { /* write gap */ }
    } else {
      const fails = (_engineFailures.get(eid) || 0) + 1;
      _engineFailures.set(eid, fails);
      if (fails >= ENGINE_UNREACHABLE_THRESHOLD) {
        try { updReach.run(0, nowIso, error || 'unreachable', eid); } catch (_) { /* write gap */ }
      } else {
        try { updKeep.run(nowIso, `probe_fail_${fails}`, eid); } catch (_) { /* write gap */ }
      }
    }
  }));

  // Re-read so the verdict includes engines kept up by hysteresis.
  try {
    const any = db.get(
      'SELECT 1 AS x FROM provider_engines WHERE provider_id = ? AND reachable = 1 LIMIT 1',
      [providerId]
    );
    return Boolean(any);
  } catch (_) {
    return false;
  }
}

async function runProbeOnce() {
  const providers = _onlineProviders();
  if (!providers.length) return { probed: 0 };

  const updateStmt = db.prepare(
    `UPDATE providers
     SET endpoint_reachable = ?,
         endpoint_probed_at = ?,
         endpoint_probe_error = ?,
         endpoint_probe_failures = ?
     WHERE id = ?`
  );

  let reachable = 0;
  let unreachable = 0;
  await Promise.all(
    providers.map(async (p) => {
      const legacy = await _probeOne(p);
      // Also probe each engine's own base_url so multi-engine providers stay
      // routable via ANY reachable engine, not just the registered endpoint.
      const engineOk = await _probeEngines(Number(p.id));
      const ok = legacy.ok || engineOk;
      const error = ok ? null : (legacy.error || 'all engines unreachable');
      const nowIso = new Date().toISOString();
      const pid = Number(p.id);

      if (ok) {
        // Reset failure counter on success
        _consecutiveFailures.delete(pid);
        try { updateStmt.run(1, nowIso, null, 0, p.id); } catch (e) {
          console.warn(`[provider-probe] write failed for provider ${p.id}: ${e.message}`);
        }
        reachable += 1;
      } else {
        // Increment consecutive failures
        const persistedFails = Number(p.endpoint_probe_failures);
        const fails = (Number.isFinite(persistedFails) ? persistedFails : (_consecutiveFailures.get(pid) || 0)) + 1;
        _consecutiveFailures.set(pid, fails);

        if (fails >= UNREACHABLE_THRESHOLD) {
          // Mark unreachable only after 3+ consecutive failures
          try { updateStmt.run(0, nowIso, error || 'unknown', fails, p.id); } catch (e) {
            console.warn(`[provider-probe] write failed for provider ${p.id}: ${e.message}`);
          }
          unreachable += 1;
          console.warn(`[provider-probe] provider ${p.id} unreachable (${fails} consecutive failures): ${error}`);
        } else {
          // Keep a previous positive verdict during transient failures, but do
          // not promote never-probed heartbeat-only providers into routing.
          const currentReachable = Number(p.endpoint_reachable) === 1 && p.endpoint_probed_at ? 1 : 0;
          try { updateStmt.run(currentReachable, nowIso, `probe_fail_${fails}/${UNREACHABLE_THRESHOLD}`, fails, p.id); } catch (e) {
            console.warn(`[provider-probe] write failed for provider ${p.id}: ${e.message}`);
          }
          console.log(`[provider-probe] provider ${p.id} probe failed (${fails}/${UNREACHABLE_THRESHOLD}), keeping current state`);
        }
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
  UNREACHABLE_THRESHOLD,
  PROBE_INTERVAL_MS,
};
