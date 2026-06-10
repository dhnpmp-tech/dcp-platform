'use strict';

/**
 * EARNED-ONLINE verification — backend-initiated proof that a provider is
 * actually serving inference right now, not just "claimed online" by a fresh
 * daemon heartbeat.
 *
 * ─── Why this exists alongside provider-probe.js (do NOT conflate them) ─────
 * `lib/provider-probe.js` answers a NARROW question: "is the TCP endpoint
 * reachable from this VPS?" It writes `providers.endpoint_reachable`, which
 * `v1.js getCapableProviders` filters on. That column is LIVE ROUTING STATE
 * and this module never touches it — a sloppy write there can strand real
 * traffic on a real-money backend.
 *
 * This module answers a STRONGER question: "did the endpoint actually answer
 * a real OpenAI-shaped request — GET /v1/models, and a 1-token POST
 * /v1/chat/completions against a model the provider claims to cache — within
 * a short timeout?" That is the difference between "claimed online" and
 * "earned online". The result is recorded in its OWN table
 * (`provider_verification`) so it can layer on top of the existing fleet
 * view without changing routing behaviour. A provider can be
 * endpoint_reachable=1 (something is listening) yet verified_online=0
 * (it 500s / 403s / times out on a real chat call), and we want that gap to
 * be VISIBLE to admins, not silently routed into.
 *
 * What it writes (provider_verification, one row per provider, upserted):
 *   verified_online   0 / 1   — did GET /v1/models succeed (and chat if attempted)
 *   verified_at       ISO ts  — last time a verification pass completed
 *   verified_models   JSON[]  — model ids returned by /v1/models
 *   probe_latency_ms  INTEGER — wall-clock of the slowest sub-probe
 *   probe_error       TEXT    — short reason on failure (truncated), else NULL
 *   chat_ok           0 / 1   — did the 1-token chat probe succeed (NULL = not attempted)
 *   probed_endpoint   TEXT    — which base URL answered (wg mesh vs vllm url)
 *
 * countUsableProviders(db) is the metering-grade count: providers that are
 * BOTH verified_online AND have a fresh heartbeat. This is what "serving now"
 * should be measured against, separate from the looser "claimed online".
 */

const VERIFY_INTERVAL_MS = Number(process.env.DCP_VERIFY_INTERVAL_MS) || 60 * 1000;
const VERIFY_TIMEOUT_MS = Number(process.env.DCP_VERIFY_TIMEOUT_MS) || 6 * 1000;
// Only verify providers whose daemon heartbeat is fresh — a stale heartbeat
// means the daemon is gone, no point hammering a dead endpoint.
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;
// "usable" / "serving now" freshness window for countUsableProviders. Keep
// this tight so the count reflects providers that could take a request RIGHT
// NOW, not ones that were verified ten minutes ago.
const USABLE_FRESH_MS = Number(process.env.DCP_USABLE_FRESH_MS) || 3 * 60 * 1000;
const VERIFY_MODELS_MAX = 50; // cap stored model list so the JSON stays small

let _timer = null;
let _running = false;
let _schemaReady = false;

// ─── Schema (additive, idempotent) ─────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS so this is safe to call repeatedly and never
// collides with existing migrations. Keyed by provider_id (one current row
// per provider) — history lives in logs/metrics, this is "latest state".
function ensureSchema(db) {
  if (_schemaReady) return;
  db.prepare(
    `CREATE TABLE IF NOT EXISTS provider_verification (
       provider_id      INTEGER PRIMARY KEY,
       verified_online  INTEGER NOT NULL DEFAULT 0,
       verified_at      TEXT,
       verified_models  TEXT,
       probe_latency_ms INTEGER,
       probe_error      TEXT,
       chat_ok          INTEGER,
       probed_endpoint  TEXT,
       updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  ).run();
  try {
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_provider_verification_online
         ON provider_verification(verified_online, verified_at)`
    ).run();
    // Freshness-led index: the hot-path queries (getEarnedRoutingState,
    // countUsableProviders) filter `WHERE verified_at >= ?`, which the
    // verified_online-led index above cannot serve. Lead on verified_at and
    // include verified_online so the range scan is covered.
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_provider_verification_freshness
         ON provider_verification(verified_at, verified_online)`
    ).run();
  } catch (_) { /* indexes are best-effort */ }
  _schemaReady = true;
}

// ─── Endpoint resolution (mirrors provider-probe's routing preference) ──────
// Strip a trailing /v1[/...] and trailing slashes so we own the path.
function _normalizeBaseUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  let trimmed = url.trim().replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/v1(\/.*)?$/, '');
  return trimmed;
}

// Resolve the candidate base URLs in routing-preference order: WG mesh IP
// first (matches lib/provider-probe.js H5 preference), then the public
// vllm_endpoint_url. Returns [] when nothing is resolvable.
function _candidateBases(provider, db) {
  const bases = [];
  if (provider.wg_mesh_ip) {
    const wgPort = (provider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
    bases.push(`http://${provider.wg_mesh_ip}:${wgPort}`);
  }
  const direct = _normalizeBaseUrl(provider.vllm_endpoint_url);
  if (direct) bases.push(direct);
  // Multi-engine providers expose several ports (e.g. llama.cpp :8080 +
  // Ollama :11434). Add each engine's own base_url so verification succeeds
  // via ANY reachable engine, keeping the provider in serving state instead
  // of failing whenever the single registered endpoint is flaky.
  if (db) {
    try {
      const engines = db.all(
        'SELECT base_url FROM provider_engines WHERE provider_id = ?',
        [provider.id]
      );
      for (const e of (engines || [])) {
        const eb = _normalizeBaseUrl(e.base_url);
        if (eb && !bases.includes(eb)) bases.push(eb);
      }
    } catch (_) { /* table missing on older schema — legacy candidates apply */ }
  }
  return bases;
}

function _normalizeModelId(value) {
  return String(value || '').trim().toLowerCase();
}

// Pick a model id to use for the 1-token chat probe. If /v1/models reports
// live model ids, never probe a stale cached_models entry that is absent from
// that live list. Prefer the provider's cached id only when it is confirmed by
// /v1/models; otherwise probe the first live model the endpoint actually
// reports. Returns null when no model is known (chat probe is then skipped —
// GET /v1/models success alone still counts as verified).
// A 1-token text chat probe only makes sense against a chat/completion model.
// Embedding, reranker, vision-only, audio and diffusion models return errors
// for a plain chat request, which would yield a false "not earned online"
// verdict (and flicker the provider out of serving). Skip them when picking
// the probe model.
function _isChatProbeModel(id) {
  const s = String(id || '').toLowerCase();
  return !/(bge[-/]|\bbge\b|embed|gte[-/]|e5[-/]|rerank|vl[:_-]|[0-9]vl\b|vision|whisper|\btts\b|diffusion|sdxl|clip[-/])/.test(s);
}

function _pickProbeModel(provider, reportedModels) {
  const cached = _parseModelList(provider.cached_models).filter(_isChatProbeModel);
  const reported = (Array.isArray(reportedModels)
    ? reportedModels.map((s) => String(s).trim()).filter(Boolean)
    : []
  ).filter(_isChatProbeModel);
  if (reported.length) {
    const reportedSet = new Set(reported.map(_normalizeModelId));
    const cachedMatch = cached.find((model) => reportedSet.has(_normalizeModelId(model)));
    return cachedMatch || reported[0];
  }
  if (cached.length) return cached[0];
  // No chat-capable model known — GET /v1/models success stands on its own.
  return null;
}

function _parseModelList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch (_) { /* fall through */ }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Sub-probes ─────────────────────────────────────────────────────────────
// GET /v1/models against a base. Returns { ok, status, models[], latencyMs }.
// A non-2xx is NOT ok here — for verification (unlike reachability) we want a
// real, well-formed model listing, since that is what a renter request needs.
async function _probeModels(base) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, models: [], latencyMs, error: `models_http_${res.status}` };
    }
    let models = [];
    try {
      const body = await res.json();
      if (body && Array.isArray(body.data)) {
        models = body.data
          .map((m) => (m && (m.id || m.name)) ? String(m.id || m.name).trim() : null)
          .filter(Boolean)
          .slice(0, VERIFY_MODELS_MAX);
      }
    } catch (_) { /* model listing not JSON — still reachable, just empty list */ }
    return { ok: true, status: res.status, models, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = String(err && err.message ? err.message : err).slice(0, 200);
    return { ok: false, status: null, models: [], latencyMs, error: msg };
  }
}

// 1-token POST /v1/chat/completions. Returns { ok, status, latencyMs, error }.
// max_tokens:1 keeps provider GPU cost negligible. We treat any 2xx as ok;
// a 4xx/5xx means the endpoint is listening but not actually serving this
// model, which for verification purposes is a FAILURE (the gap we care about).
async function _probeChat(base, model) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, latencyMs, error: `chat_http_${res.status}` };
    }
    return { ok: true, status: res.status, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = String(err && err.message ? err.message : err).slice(0, 200);
    return { ok: false, status: null, latencyMs, error: msg };
  }
}

// Verify a single provider across its candidate bases. First base that
// answers GET /v1/models wins; we then attempt the chat probe on that same
// base when a model is known.
async function _verifyOne(provider, db) {
  const bases = _candidateBases(provider, db);
  if (!bases.length) {
    return {
      verified_online: 0,
      verified_models: [],
      probe_latency_ms: null,
      probe_error: 'no_endpoint_url',
      chat_ok: null,
      probed_endpoint: null,
    };
  }

  let lastError = 'unknown';
  let lastFail = null; // a "/v1/models OK but chat failed" result, kept as fallback
  for (const base of bases) {
    const models = await _probeModels(base);
    if (!models.ok) {
      lastError = models.error || 'models_failed';
      continue; // try the next candidate base
    }

    const model = _pickProbeModel(provider, models.models);
    let chatOk = null;
    let chatLatency = 0;
    let chatError = null;
    if (model) {
      const chat = await _probeChat(base, model);
      chatOk = chat.ok ? 1 : 0;
      chatLatency = chat.latencyMs || 0;
      chatError = chat.ok ? null : chat.error;
    }

    const latency = Math.max(models.latencyMs || 0, chatLatency);
    // verified_online requires /v1/models to succeed. When a chat probe was
    // attempted it must ALSO succeed — a model that lists but won't serve is
    // not "earned online". When no model is known we cannot run chat, so
    // /v1/models success stands on its own.
    const online = model ? (chatOk === 1 ? 1 : 0) : 1;
    const result = {
      verified_online: online,
      verified_models: models.models,
      probe_latency_ms: latency,
      probe_error: online ? null : (chatError || 'chat_failed'),
      chat_ok: chatOk,
      probed_endpoint: base,
    };
    // Success on this base — done. Otherwise (/v1/models worked but the chat
    // probe failed, e.g. a slow 27B on a flaky port) DON'T give up: keep
    // trying the other engine bases — a different engine (e.g. Ollama :11434)
    // may chat fine. This stops a single flaky engine from flickering the
    // whole provider out of "serving".
    if (online === 1) return result;
    lastFail = result;
    lastError = chatError || 'chat_failed';
  }

  // No base passed the chat probe. Prefer the "endpoint up, chat failed"
  // result (still has verified_models + the real error) over a hard miss.
  if (lastFail) return lastFail;
  return {
    verified_online: 0,
    verified_models: [],
    probe_latency_ms: null,
    probe_error: lastError,
    chat_ok: null,
    probed_endpoint: null,
  };
}

// Providers worth verifying: claimed online, not paused, not deleted, fresh
// daemon heartbeat. Mirrors the gate provider-probe uses so we never verify
// a provider the router would already skip.
function _candidateProviders(db) {
  const cutoff = new Date(Date.now() - HEARTBEAT_FRESH_MS).toISOString();
  return db.all(
    `SELECT id, name, vllm_endpoint_url, wg_mesh_ip, cached_models, last_heartbeat
       FROM providers
      WHERE status = 'online'
        AND COALESCE(is_paused, 0) = 0
        AND deleted_at IS NULL
        AND last_heartbeat >= ?
        -- A provider hosting an active pod is rented out: probing it re-warms
        -- inference engines (Ollama model load) and steals VRAM from the
        -- renter's dedicated card. Skip until the pod ends.
        AND NOT EXISTS (
            SELECT 1 FROM jobs jp
             WHERE jp.provider_id = providers.id
               AND jp.job_type = 'interactive_pod'
               AND jp.status IN ('queued','assigned','pulling','running'))`,
    [cutoff]
  );
}

async function runVerificationOnce(db) {
  ensureSchema(db);
  const providers = _candidateProviders(db);
  if (!providers.length) return { verified: 0, online: 0 };

  const upsert = db.prepare(
    `INSERT INTO provider_verification
       (provider_id, verified_online, verified_at, verified_models,
        probe_latency_ms, probe_error, chat_ok, probed_endpoint, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       verified_online  = excluded.verified_online,
       verified_at      = excluded.verified_at,
       verified_models  = excluded.verified_models,
       probe_latency_ms = excluded.probe_latency_ms,
       probe_error      = excluded.probe_error,
       chat_ok          = excluded.chat_ok,
       probed_endpoint  = excluded.probed_endpoint,
       updated_at       = excluded.updated_at`
  );

  let online = 0;
  await Promise.all(
    providers.map(async (p) => {
      const r = await _verifyOne(p, db);
      const nowIso = new Date().toISOString();
      if (r.verified_online === 1) online += 1;
      try {
        upsert.run(
          Number(p.id),
          r.verified_online,
          nowIso,
          JSON.stringify(r.verified_models || []),
          r.probe_latency_ms,
          r.probe_error,
          r.chat_ok,
          r.probed_endpoint,
          nowIso
        );
      } catch (e) {
        console.warn(`[provider-verify] write failed for provider ${p.id}: ${e.message}`);
      }
    })
  );

  console.log(`[provider-verify] verified ${providers.length} provider(s): ${online} earned-online`);
  return { verified: providers.length, online };
}

function startProviderVerification(db) {
  if (_timer) return; // already running
  _running = true;
  ensureSchema(db);
  const tick = async () => {
    if (!_running) return;
    try { await runVerificationOnce(db); }
    catch (err) { console.warn(`[provider-verify] loop tick failed: ${err.message}`); }
    if (_running) _timer = setTimeout(tick, VERIFY_INTERVAL_MS);
  };
  // First tick a couple seconds after boot so the listen() + initial probe
  // pass settle first. Staggered slightly behind provider-probe's 1s tick.
  _timer = setTimeout(tick, 3000);
  console.log(`[provider-verify] started (interval=${VERIFY_INTERVAL_MS}ms, timeout=${VERIFY_TIMEOUT_MS}ms)`);
}

function stopProviderVerification() {
  _running = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

// ─── Helpers consumed by routes ─────────────────────────────────────────────
// Metering-grade count: verified_online=1 AND fresh verification AND fresh
// daemon heartbeat. This is "serving now" — the number admins/metering should
// trust over the looser "claimed online" count.
function countUsableProviders(db) {
  ensureSchema(db);
  const verifyCutoff = new Date(Date.now() - USABLE_FRESH_MS).toISOString();
  const hbCutoff = new Date(Date.now() - USABLE_FRESH_MS).toISOString();
  const row = db.get(
    `SELECT COUNT(*) AS n
       FROM provider_verification pv
       JOIN providers p ON p.id = pv.provider_id
      WHERE pv.verified_online = 1
        AND pv.verified_at >= ?
        AND p.status = 'online'
        AND COALESCE(p.is_paused, 0) = 0
        AND p.deleted_at IS NULL
        AND p.last_heartbeat >= ?`,
    [verifyCutoff, hbCutoff]
  );
  return Number(row?.n || 0);
}

// Return the current verification row map keyed by provider_id, for the
// fleet-health route to merge in without an extra query per provider.
function getVerificationMap(db) {
  ensureSchema(db);
  const rows = db.all(
    `SELECT provider_id, verified_online, verified_at, verified_models,
            probe_latency_ms, probe_error, chat_ok, probed_endpoint
       FROM provider_verification`
  );
  const map = new Map();
  for (const r of (rows || [])) {
    let models = [];
    try { models = JSON.parse(r.verified_models || '[]'); } catch (_) { models = []; }
    map.set(Number(r.provider_id), {
      verified_online: r.verified_online === 1,
      verified_at: r.verified_at || null,
      verified_models: Array.isArray(models) ? models : [],
      probe_latency_ms: r.probe_latency_ms != null ? Number(r.probe_latency_ms) : null,
      probe_error: r.probe_error || null,
      chat_ok: r.chat_ok == null ? null : r.chat_ok === 1,
      probed_endpoint: r.probed_endpoint || null,
    });
  }
  return map;
}

// Earned routing state for the renter-facing path (catalog, alternatives,
// routing candidates). Keys purely off the *freshness of the probe verdict*:
//   servingIds — providers we probed within USABLE_FRESH_MS and confirmed
//                serving (verified_online=1). The strong "earned-online" set.
//   deadIds    — providers we probed within USABLE_FRESH_MS and confirmed
//                NOT serving (verified_online=0). The "freshly-confirmed-dead"
//                set — safe to exclude with zero false-negative risk, because
//                a probe that just failed means a renter would fail too.
//   active     — whether the verification subsystem produced ANY fresh verdict.
//                When false (loop down / never ran), callers MUST fall back to
//                claimed-state routing so a dead verification loop can never
//                self-inflict a fleet-wide outage.
// Status/heartbeat/paused gating is left to the caller's existing candidate
// query; this only answers "what did the earned probe most recently say?".
function getEarnedRoutingState(db) {
  ensureSchema(db);
  const cutoff = new Date(Date.now() - USABLE_FRESH_MS).toISOString();
  let rows = [];
  try {
    rows = db.all(
      `SELECT provider_id, verified_online
         FROM provider_verification
        WHERE verified_at >= ?`,
      [cutoff]
    );
  } catch (_) {
    return { active: false, servingIds: new Set(), deadIds: new Set() };
  }
  const servingIds = new Set();
  const deadIds = new Set();
  for (const r of (rows || [])) {
    const id = Number(r.provider_id);
    if (r.verified_online === 1) servingIds.add(id);
    else deadIds.add(id);
  }
  return { active: (rows || []).length > 0, servingIds, deadIds };
}

module.exports = {
  startProviderVerification,
  stopProviderVerification,
  runVerificationOnce,
  countUsableProviders,
  getVerificationMap,
  getEarnedRoutingState,
  ensureSchema,
  // exported for tests
  _normalizeBaseUrl,
  _candidateBases,
  _pickProbeModel,
  _normalizeModelId,
  _parseModelList,
  VERIFY_INTERVAL_MS,
  HEARTBEAT_FRESH_MS,
  USABLE_FRESH_MS,
};
