/**
 * OpenRouter-compatible /v1/ API endpoints
 *
 * Provides the OpenAI-compatible interface required for OpenRouter integration:
 *   POST /v1/chat/completions   — unified (streaming + non-streaming via req.body.stream)
 *   GET  /v1/models             — model list in OpenAI format
 *
 * These endpoints proxy to the existing vLLM infrastructure and reuse the same
 * renter authentication, billing, and provider-assignment logic.
 *
 * Gap 1: /v1/ path alias
 * Gap 2: unified stream flag (req.body.stream routes internally)
 * Gap 3: /v1/models in OpenAI list format
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const rateLimiterMiddleware = require('../middleware/rateLimiter');
const {
  vllmCompleteLimiter,
  vllmStreamLimiter,
  modelCatalogLimiter,
} = rateLimiterMiddleware;
const { toCatalogContractCore, toTokenPricingContract, toUsdStringFromHalala } = require('../lib/model-catalog-contract');
const { deduplicateModelAliases, DASH_TO_CANONICAL, getCanonicalModelId, modelIdsMatch } = require('../lib/model-aliases');
const { recordOpenRouterUsage } = require('../services/openrouterSettlementService');
const inferenceTracker = require('../services/inferenceTracker');
const subscriptionService = require('../services/subscriptionService');
// Canonical 75/25 provider/DCP split lives in services/reconciliation-engine.js
// and is applied inside billingService.settleInferenceOnce (single money path).
// v1.js no longer computes the split inline — see migration 021 settlement.
const billingService = require('../services/billingService');
const autoTopupService = require('../services/autoTopupService');
const {
  attachPromptCacheUsage,
  computePromptCacheAccounting,
  hasPromptCacheMeasurement,
  recordPromptCacheMeasurement,
} = require('../services/promptCacheAccounting');
const {
  selectProvidersWithLatencyGate,
  recordStreamOutcome,
  resolveProviderTier,
} = require('../services/inferenceLatencyBudgetGate');
const { getEarnedRoutingState } = require('../services/providerVerification');
const { looksLikeProviderKey } = require('../middleware/auth');
const { classifyRequest } = require('../lib/request-classifier');
const conversionFunnel = require('../services/conversionFunnelService');

const router = express.Router();
const VLLM_COMPATIBILITY_MATRIX_PATH = path.join(__dirname, '../../../infra/vllm-configs/compatibility-matrix.json');
const TOKEN_RATE_BILLING_UNIT_TOKENS = 1_000_000;
const DEFAULT_TOKEN_RATE_HALALA = 19;
const PROVIDER_HEARTBEAT_STALE_MS = 10 * 60 * 1000;

// SITE-15: thinking models (qwen3:4b, qwen2.5vl:3b, etc.) can burn the entire
// max_tokens budget on internal reasoning and return ZERO visible content with
// finish_reason === 'length'. That is a non-answer, not a billable completion.
// A completion is only an unbillable non-answer when BOTH hold:
//   1. the renter-visible answer text is empty / whitespace, AND
//   2. the model stopped because it ran out of budget (finish_reason 'length').
// We deliberately do NOT no-bill on finish_reason 'stop'/'content_filter'/etc.
// with empty content — an intentional empty answer (e.g. a tool-only turn) is a
// real completion. Reasoning text the renter never sees does NOT count as an
// answer here; callers pass the post-merge visible content.
const isUnbillableNonAnswer = ({ content = '', finishReason = null } = {}) => {
  const visible = typeof content === 'string' ? content.trim() : '';
  return visible.length === 0 && finishReason === 'length';
};

// SITE-15 (rate audit): surface — once per model — when a model is billed via
// the cost_rates '__default__' fallback rather than its own explicit active
// rate. Silent default-rate billing is how a model like qwen2.5vl:3b can end up
// charged at the wrong number (or, if '__default__' were ever 0, a real answer
// billed 0.00). One WARN per model keeps the log readable; reconciliation can
// then add the missing cost_rates row.
const defaultRateBilledModels = new Set();

// ── Idempotency cache for /v1/chat/completions (H6) ─────────────────────────
// Tunnel timeouts cause renter SDKs to retry, which without dedup would create
// two upstream inferences and bill twice. We cache `Idempotency-Key` results
// per renter for IDEMPOTENCY_TTL_MS so a retry within the window either joins
// the in-flight Promise or returns the cached non-streaming response.
//
// Notes & limits:
//   • Streaming responses are NOT cached (no way to replay an SSE body); a
//     stream retry currently bypasses the cache and is logged.
//   • Keys are scoped by renter_id so two renters can use the same key.
//   • Memory only — survives PM2 restart only via fresh requests.
const IDEMPOTENCY_TTL_MS = Math.max(
  10_000,
  Number(process.env.DCP_IDEMPOTENCY_TTL_MS) || 60_000
);
const IDEMPOTENCY_MAX_ENTRIES = 5_000;
const _idempotencyCache = new Map(); // `${renterId}:${key}` -> { promise?, response?, statusCode?, settledAt }

function _idempotencyKey(renterId, key) {
  return `${Number(renterId) || 0}:${String(key).slice(0, 200)}`;
}
function _idempotencySweep() {
  if (_idempotencyCache.size <= IDEMPOTENCY_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of _idempotencyCache) {
    if (v.settledAt && (now - v.settledAt) > IDEMPOTENCY_TTL_MS) _idempotencyCache.delete(k);
  }
  // If still over cap, drop the oldest entries.
  if (_idempotencyCache.size > IDEMPOTENCY_MAX_ENTRIES) {
    const overflow = _idempotencyCache.size - IDEMPOTENCY_MAX_ENTRIES;
    let dropped = 0;
    for (const k of _idempotencyCache.keys()) {
      _idempotencyCache.delete(k);
      if (++dropped >= overflow) break;
    }
  }
}
function getIdempotencyEntry(renterId, key) {
  if (!key) return null;
  const k = _idempotencyKey(renterId, key);
  const entry = _idempotencyCache.get(k);
  if (!entry || !entry.settledAt) return null;
  if ((Date.now() - entry.settledAt) > IDEMPOTENCY_TTL_MS) {
    _idempotencyCache.delete(k);
    return null;
  }
  return entry;
}
function settleIdempotencyEntry(renterId, key, { response, statusCode = 200 }) {
  if (!key) return;
  _idempotencySweep();
  _idempotencyCache.set(_idempotencyKey(renterId, key), {
    response,
    statusCode,
    settledAt: Date.now(),
  });
}

// ── Session affinity — sticky routing for multi-turn chats (Mesh-LLM affinity.rs pattern)
const SESSION_AFFINITY = new Map(); // key: hash -> { providerId, expiresAt }
const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes

function getSessionKey(messages, model) {
  // Hash first user message + model as session identifier
  const firstUser = (messages || []).find(m => m.role === 'user');
  const prefix = firstUser ? (typeof firstUser.content === 'string' ? firstUser.content.slice(0, 200) : '') : '';
  // Simple hash (djb2)
  let hash = 5381;
  const str = model + ':' + prefix;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(36);
}

function getAffinityProvider(sessionKey) {
  const entry = SESSION_AFFINITY.get(sessionKey);
  if (entry && entry.expiresAt > Date.now()) return entry.providerId;
  SESSION_AFFINITY.delete(sessionKey);
  return null;
}

function setAffinityProvider(sessionKey, providerId) {
  SESSION_AFFINITY.set(sessionKey, { providerId, expiresAt: Date.now() + SESSION_TTL_MS });
  // GC: if map grows large, prune expired entries
  if (SESSION_AFFINITY.size > 10000) {
    const now = Date.now();
    for (const [k, v] of SESSION_AFFINITY) {
      if (v.expiresAt < now) SESSION_AFFINITY.delete(k);
    }
  }
}

// ── Per-model demand tracking (Mesh-LLM demand map pattern) ─────────────────
const MODEL_DEMAND = new Map(); // model -> { count: N, windowStart: timestamp, lastRequest: timestamp }
const DEMAND_WINDOW_MS = 5 * 60 * 1000; // 5-minute sliding window

function trackModelDemand(model) {
  const now = Date.now();
  const entry = MODEL_DEMAND.get(model) || { count: 0, windowStart: now };
  if (now - entry.windowStart > DEMAND_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count++;
  }
  entry.lastRequest = now;
  MODEL_DEMAND.set(model, entry);
}

function getModelDemand(model) {
  const entry = MODEL_DEMAND.get(model);
  if (!entry) return 0;
  if (Date.now() - entry.windowStart > DEMAND_WINDOW_MS) return 0;
  return entry.count;
}

function getAllDemand() {
  const result = {};
  const now = Date.now();
  for (const [model, entry] of MODEL_DEMAND) {
    if (now - entry.windowStart <= DEMAND_WINDOW_MS) {
      result[model] = { count: entry.count, lastRequest: entry.lastRequest };
    }
  }
  return result;
}

// ── M9 Graceful Degradation helpers ─────────────────────────────────────────

async function getAvailableModels(dbInstance) {
  // Get all models currently cached by online, non-paused providers
  const rows = (() => {
    try {
      // Earned-state gate (backlog #2): never suggest an "alternative" whose
      // only provider just failed its inference probe — that's how the 503
      // currently lures renters toward dead-node models. Same policy as the
      // catalog + routing candidates.
      return applyEarnedRoutingPolicy(dbInstance.all(`
        SELECT id, cached_models, gpu_model, vram_mb
        FROM providers
        WHERE status = 'online'
          AND COALESCE(is_paused, 0) = 0
          AND deleted_at IS NULL
          AND last_heartbeat > datetime('now', '-120 seconds')
      `), dbInstance);
    } catch (_) { return []; }
  })();

  const modelCounts = {};
  for (const row of (rows || [])) {
    const models = parseCachedModels(row.cached_models);
    for (const m of models) {
      if (!modelCounts[m]) modelCounts[m] = { count: 0, gpus: new Set() };
      modelCounts[m].count++;
      if (row.gpu_model) modelCounts[m].gpus.add(row.gpu_model);
    }
  }
  return modelCounts;
}

function parseModelSize(modelStr) {
  const match = modelStr.match(/(\d+\.?\d*)b/i);
  return match ? parseFloat(match[1]) : null;
}

function rankAlternatives(requested, available, classification) {
  const results = [];
  const reqLower = requested.toLowerCase();

  for (const [model, info] of Object.entries(available)) {
    const modelLower = model.toLowerCase();
    let score = 0;
    let reason = '';

    // Same family (e.g., qwen3:4b requested, qwen3:8b available)
    const reqFamily = reqLower.split(/[:-]/)[0];
    const modelFamily = modelLower.split(/[:-]/)[0];
    if (reqFamily === modelFamily) {
      score += 10;
      reason = `Same model family (${modelFamily})`;
    }

    // Similar size class
    const reqSize = parseModelSize(reqLower);
    const modelSize = parseModelSize(modelLower);
    if (reqSize && modelSize && Math.abs(reqSize - modelSize) < reqSize * 0.5) {
      score += 5;
      reason = reason || `Similar size class (~${modelSize}B)`;
    }

    // Task compatibility boost
    if (classification.category === 'code' && modelLower.includes('code')) score += 3;
    if (classification.complexity === 'deep' && modelSize && modelSize >= 30) score += 3;

    // Provider count (more = more reliable)
    score += Math.min(info.count, 5);

    if (score > 0) {
      results.push({ model, score, reason, providerCount: info.count });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── Per-provider in-flight gate (H3) ────────────────────────────────────────
// Ollama on consumer GPUs serializes requests; if two renters land on the same
// provider concurrently the second one blocks until the first finishes and
// then trips PROXY_TIMEOUT_PER_TOKEN_MS. We keep an in-memory counter per
// provider id and refuse new traffic while a slot is busy. Default is 1
// in-flight per provider (Ollama-safe); raise via env for vLLM continuous
// batching when you trust the provider can absorb concurrent decode.
const MAX_INFLIGHT_PER_PROVIDER = Math.max(
  1,
  Number(process.env.DCP_PROVIDER_MAX_INFLIGHT) || 1
);
const _inflightByProvider = new Map();
function _providerInflightCount(providerId) {
  const id = Number(providerId);
  if (!id) return 0;
  return _inflightByProvider.get(id) || 0;
}
function isProviderBusy(providerId) {
  return _providerInflightCount(providerId) >= MAX_INFLIGHT_PER_PROVIDER;
}
function acquireProviderSlot(providerId) {
  const id = Number(providerId);
  if (!id) return false;
  const cur = _inflightByProvider.get(id) || 0;
  if (cur >= MAX_INFLIGHT_PER_PROVIDER) return false;
  _inflightByProvider.set(id, cur + 1);
  return true;
}
function releaseProviderSlot(providerId) {
  const id = Number(providerId);
  if (!id) return;
  const cur = _inflightByProvider.get(id) || 0;
  if (cur <= 1) _inflightByProvider.delete(id);
  else _inflightByProvider.set(id, cur - 1);
}

// ── Helpers (shared with vllm.js — keep lightweight to avoid circular deps) ──

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
}

function toFiniteNumber(value, { min = null, max = null } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toFiniteInt(value, { min = null, max = null } = {}) {
  const num = toFiniteNumber(value, { min, max });
  if (num == null || !Number.isInteger(num)) return null;
  return num;
}

function normalizeModelToken(value) {
  return normalizeString(value, { maxLen: 300 })?.toLowerCase() || null;
}

function getRenterKey(req) {
  // Accept: Authorization: Bearer <key>, x-renter-key header, or ?key= query param
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  const header = normalizeString(req.headers['x-renter-key'], { maxLen: 128, trim: false });
  const query = normalizeString(req.query.key, { maxLen: 128, trim: false });
  return header || query || null;
}

function buildV1ErrorPayload({
  status,
  type,
  code,
  message,
  details = undefined,
  retryAfterSeconds = null,
  retryable = null,
}) {
  const safeStatus = toFiniteInt(status, { min: 100, max: 599 }) || 500;
  const safeRetryAfter = toFiniteInt(retryAfterSeconds, { min: 1, max: 86400 });
  const payload = {
    error: {
      message: normalizeString(message, { maxLen: 500, trim: true }) || 'Internal server error',
      type: normalizeString(type, { maxLen: 64, trim: true }) || 'server_error',
      code: normalizeString(code, { maxLen: 64, trim: true }) || 'internal_error',
      status: safeStatus,
      retryable: typeof retryable === 'boolean' ? retryable : [429, 503, 504].includes(safeStatus),
    },
  };
  if (details != null) payload.error.details = details;
  if (safeRetryAfter != null) {
    payload.error.retry_after_seconds = safeRetryAfter;
    payload.error.retry_after_ms = safeRetryAfter * 1000;
    payload.retry_after_seconds = safeRetryAfter;
    payload.retry_after_ms = safeRetryAfter * 1000;
  }
  return payload;
}

function sendV1Error(res, {
  status,
  type,
  code,
  message,
  details = undefined,
  retryAfterSeconds = null,
  retryable = null,
}) {
  const safeRetryAfter = toFiniteInt(retryAfterSeconds, { min: 1, max: 86400 });
  // If the response is already streaming (SSE headers flushed), we cannot set a
  // status code or headers — res.status()/setHeader() throws "Cannot set headers
  // after they are sent" and crashes the request mid-stream. Emit a terminal
  // error frame on the open SSE stream and end it instead of throwing.
  if (res.headersSent) {
    try {
      const payload = buildV1ErrorPayload({ status, type, code, message, details, retryAfterSeconds: safeRetryAfter, retryable });
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (_) { /* stream already torn down by the client */ }
    try { res.end(); } catch (_) { /* already ended */ }
    return;
  }
  if (safeRetryAfter != null) {
    res.setHeader('Retry-After', String(safeRetryAfter));
  }
  return res.status(status).json(buildV1ErrorPayload({
    status,
    type,
    code,
    message,
    details,
    retryAfterSeconds: safeRetryAfter,
    retryable,
  }));
}

function requireAuth(req, res, next) {
  const key = getRenterKey(req);
  if (!key) return sendV1Error(res, {
    status: 401,
    type: 'authentication_error',
    code: 'authentication_required',
    message: 'API key required. Pass via Authorization: Bearer <key>',
    retryable: false,
  });

  // H1 — reject keys that look like a provider key on a renter-only path.
  // Avoids cross-role key confusion + DB-lookup oracle for leaked provider keys.
  if (looksLikeProviderKey(key)) return sendV1Error(res, {
    status: 401,
    type: 'authentication_error',
    code: 'wrong_key_type',
    message: 'Provider API key cannot be used for /v1 inference. Use a renter key.',
    retryable: false,
  });

  const now = new Date().toISOString();

  // Check scoped sub-keys first
  const scopedKey = db.get(
    `SELECT k.id, k.renter_id, k.scopes, k.expires_at, k.revoked_at,
            r.id AS r_id, r.api_key, r.balance_halala, r.status
     FROM renter_api_keys k
     JOIN renters r ON r.id = k.renter_id
     WHERE k.key = ? AND r.status = 'active' AND k.revoked_at IS NULL`,
    key
  );

  if (scopedKey) {
    if (scopedKey.expires_at && scopedKey.expires_at < now) {
      return sendV1Error(res, {
        status: 403,
        type: 'authentication_error',
        code: 'authentication_key_expired',
        message: 'API key has expired',
        retryable: false,
      });
    }
    let scopes = [];
    try {
      scopes = JSON.parse(scopedKey.scopes || '[]');
    } catch (err) {
      console.error('[v1] corrupted scopes JSON for key', {
        keyId: scopedKey.id,
        raw: scopedKey.scopes,
        message: err && err.message,
      });
    }
    if (!scopes.includes('inference') && !scopes.includes('admin')) {
      return sendV1Error(res, {
        status: 403,
        type: 'authentication_error',
        code: 'authentication_scope_missing',
        message: 'API key does not have inference scope',
        retryable: false,
      });
    }
    try {
      db.prepare('UPDATE renter_api_keys SET last_used_at = ? WHERE id = ?').run(now, scopedKey.id);
    } catch (err) {
      console.warn('[v1] last_used_at write failed', {
        keyId: scopedKey.id,
        message: err && err.message,
      });
    }
    req.renter = { id: scopedKey.r_id, api_key: scopedKey.api_key, balance_halala: scopedKey.balance_halala, status: scopedKey.status };
    req.renterKey = key;
    return next();
  }

  // Fall back to master key
  const renter = db.get(
    'SELECT id, api_key, balance_halala, status FROM renters WHERE api_key = ? AND status = ?',
    key, 'active'
  );
  if (!renter) return sendV1Error(res, {
    status: 401,
    type: 'authentication_error',
    code: 'authentication_invalid_key',
    message: 'Invalid or inactive API key',
    retryable: false,
  });

  req.renter = renter;
  req.renterKey = key;
  return next();
}

let modelRegistryColumnsCache = null;

function isSqliteMissingSchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('no such table:') || message.includes('no such column:');
}

function isMissingModelRegistryError(error) {
  const message = String(error?.message || '').toLowerCase();
  return isSqliteMissingSchemaError(error) && message.includes('model_registry');
}

function isMissingCostRatesSchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!isSqliteMissingSchemaError(error)) return false;
  return (
    message.includes('cost_rates')
    || message.includes('token_rate_halala')
    || message.includes('is_active')
  );
}

function getModelRegistryColumns() {
  if (modelRegistryColumnsCache && modelRegistryColumnsCache.size > 0) return modelRegistryColumnsCache;
  try {
    const pragmaRows = db.all('PRAGMA table_info(model_registry)');
    const resolved = new Set((pragmaRows || []).map((row) => String(row.name || '')));
    modelRegistryColumnsCache = resolved.size > 0 ? resolved : null;
    return resolved;
  } catch (error) {
    if (!isMissingModelRegistryError(error)) throw error;
    modelRegistryColumnsCache = null;
    return new Set();
  }
}

function buildModelRegistryListQuery(columns) {
  const selectColumns = [
    'model_id',
    columns.has('display_name') ? 'display_name' : 'model_id AS display_name',
    columns.has('family') ? 'family' : "NULL AS family",
    columns.has('created_at') ? 'created_at' : 'NULL AS created_at',
    columns.has('context_window') ? 'context_window' : '4096 AS context_window',
    columns.has('quantization') ? 'quantization' : "'unknown' AS quantization",
    columns.has('vram_gb') ? 'vram_gb' : '0 AS vram_gb',
    columns.has('default_price_halala_per_min') ? 'default_price_halala_per_min' : '0 AS default_price_halala_per_min',
    columns.has('price_in_halala_per_1m_tok') ? 'price_in_halala_per_1m_tok' : 'NULL AS price_in_halala_per_1m_tok',
    columns.has('price_out_halala_per_1m_tok') ? 'price_out_halala_per_1m_tok' : 'NULL AS price_out_halala_per_1m_tok',
    columns.has('parameter_count') ? 'parameter_count' : 'NULL AS parameter_count',
    columns.has('min_gpu_vram_gb')
      ? 'min_gpu_vram_gb'
      : (columns.has('vram_gb') ? 'vram_gb AS min_gpu_vram_gb' : '0 AS min_gpu_vram_gb'),
    columns.has('use_cases') ? 'use_cases' : "NULL AS use_cases",
  ];

  const whereActive = columns.has('is_active') ? ' WHERE is_active = 1' : '';
  const orderBy = columns.has('display_name') ? 'display_name' : 'model_id';

  return `
    SELECT ${selectColumns.join(', ')}
    FROM model_registry${whereActive}
    ORDER BY ${orderBy} ASC
  `;
}

function buildModelRequirementsQuery(columns) {
  const selectColumns = [
    'model_id',
    columns.has('context_window') ? 'context_window' : '4096 AS context_window',
    columns.has('min_gpu_vram_gb')
      ? 'min_gpu_vram_gb'
      : (columns.has('vram_gb') ? 'vram_gb AS min_gpu_vram_gb' : '0 AS min_gpu_vram_gb'),
  ];
  const whereActive = columns.has('is_active') ? ' AND is_active = 1' : '';
  return `SELECT ${selectColumns.join(', ')} FROM model_registry WHERE model_id = ?${whereActive}`;
}

function loadActiveTokenRateRows() {
  try {
    return db.all(
      `SELECT model, token_rate_halala
         FROM cost_rates
        WHERE is_active = 1`
    );
  } catch (error) {
    if (!isMissingCostRatesSchemaError(error)) throw error;
    return [];
  }
}

function buildEndpointUrl(req) {
  const configured = normalizeString(process.env.OPENROUTER_PROVIDER_ENDPOINT_URL, { maxLen: 400, trim: true });
  if (configured) return configured;
  const host = normalizeString(req.get('host'), { maxLen: 200, trim: true }) || 'localhost:8083';
  const proto = normalizeString(req.get('x-forwarded-proto'), { maxLen: 16, trim: true }) || req.protocol || 'http';
  return `${proto}://${host}/v1/chat/completions`;
}

function buildModelDescription(row, contractCore) {
  const useCases = Array.isArray(contractCore?.supported_features) ? contractCore.supported_features.join(', ') : 'chat.completions';
  const modelName = normalizeString(row?.display_name, { maxLen: 200 }) || normalizeString(row?.model_id, { maxLen: 200 }) || 'Model';
  return `${modelName} hosted by DCP for ${useCases}.`;
}

function resolveCatalogTokenRates(row, tokenRateByModel) {
  const modelId = normalizeString(row?.model_id, { maxLen: 200 });
  const legacyRate = tokenRateByModel.get(modelId) ?? tokenRateByModel.get('__default__') ?? DEFAULT_TOKEN_RATE_HALALA;
  const inputRate = toFiniteInt(row?.price_in_halala_per_1m_tok, { min: 0, max: 100_000_000 });
  const outputRate = toFiniteInt(row?.price_out_halala_per_1m_tok, { min: 0, max: 100_000_000 });
  const hasRegistryRate = inputRate != null || outputRate != null;

  return {
    inputHalalaPer1m: inputRate ?? legacyRate,
    outputHalalaPer1m: outputRate ?? legacyRate,
    source: hasRegistryRate ? 'model_registry' : 'cost_rates',
  };
}

function buildCatalogCapabilityMetadata(contractCore) {
  const base = contractCore?.capability_flags || {};
  const chatCompletions = Boolean(base.chat_completions);
  return {
    chat_completions: chatCompletions,
    streaming: chatCompletions,
    tool_calling: Boolean(base.tool_calling),
    reasoning: Boolean(base.reasoning),
    code_generation: Boolean(base.code_generation),
    embeddings: Boolean(base.embeddings),
    reranking: Boolean(base.reranking),
    image_generation: Boolean(base.image_generation),
    vision: Boolean(base.vision),
    multilingual: Boolean(base.multilingual),
    dedicated_deployment: false,
    lora: false,
    prompt_caching: false,
    batch: false,
  };
}

function resolveTokenizerFamily(row) {
  const family = normalizeString(row?.family, { maxLen: 80 }) || '';
  const modelId = normalizeString(row?.model_id, { maxLen: 200 }) || '';
  if (family) return family.toLowerCase();
  if (modelId.includes('/')) return modelId.split('/')[0].toLowerCase();
  return 'dcp';
}

let cachedVllmCompatibilityIndex = null;

function toVariantRecord(rawVariant) {
  if (!rawVariant || typeof rawVariant !== 'object') return null;
  const minVramMb = toFiniteInt(rawVariant.min_vram_mb, { min: 0, max: 1024 * 1024 });
  const modelId = normalizeString(rawVariant.model_id, { maxLen: 300 });
  if (minVramMb == null || !modelId) return null;

  const aliases = new Set();
  const addAlias = (raw) => {
    const normalized = normalizeModelToken(raw);
    if (normalized) aliases.add(normalized);
  };
  addAlias(rawVariant.model_id);
  if (Array.isArray(rawVariant.aliases)) rawVariant.aliases.forEach(addAlias);

  return {
    modelId,
    minVramMb,
    available: rawVariant.available !== false,
    aliases,
  };
}

function loadVllmCompatibilityIndex() {
  if (cachedVllmCompatibilityIndex) return cachedVllmCompatibilityIndex;
  try {
    const raw = JSON.parse(fs.readFileSync(VLLM_COMPATIBILITY_MATRIX_PATH, 'utf8'));
    const models = Array.isArray(raw?.models) ? raw.models : [];
    const byAlias = new Map();

    for (const model of models) {
      if (!model || typeof model !== 'object') continue;
      const canonicalId = normalizeModelToken(model.id);
      if (!canonicalId) continue;

      const variants = {};
      const variantAliases = new Map();
      const rawVariants = model.variants && typeof model.variants === 'object' ? model.variants : {};
      for (const [variantKeyRaw, variantRaw] of Object.entries(rawVariants)) {
        const variantKey = normalizeString(variantKeyRaw, { maxLen: 64 })?.toLowerCase();
        if (!variantKey) continue;
        const variant = toVariantRecord(variantRaw);
        if (!variant) continue;
        variants[variantKey] = variant;
        for (const alias of variant.aliases) {
          if (!variantAliases.has(alias)) variantAliases.set(alias, variantKey);
        }
      }
      if (Object.keys(variants).length === 0) continue;

      const defaultVariantRaw = normalizeString(model.default_variant, { maxLen: 64 })?.toLowerCase() || 'awq';
      const fallbackVariantRaw = normalizeString(model.fallback_variant, { maxLen: 64 })?.toLowerCase() || null;
      const entry = {
        id: canonicalId,
        variants,
        defaultVariant: variants[defaultVariantRaw] ? defaultVariantRaw : Object.keys(variants)[0],
        fallbackVariant: fallbackVariantRaw && variants[fallbackVariantRaw] ? fallbackVariantRaw : null,
        variantAliases,
      };

      const bindAlias = (aliasRaw) => {
        const alias = normalizeModelToken(aliasRaw);
        if (!alias || byAlias.has(alias)) return;
        byAlias.set(alias, entry);
      };

      bindAlias(canonicalId);
      if (Array.isArray(model.aliases)) model.aliases.forEach(bindAlias);
      for (const alias of variantAliases.keys()) bindAlias(alias);
    }

    cachedVllmCompatibilityIndex = { available: true, byAlias };
    return cachedVllmCompatibilityIndex;
  } catch (_) {
    cachedVllmCompatibilityIndex = { available: false, byAlias: new Map() };
    return cachedVllmCompatibilityIndex;
  }
}

function resolveProviderRoutingModel({ requestedModelId, providerVramMb }) {
  const normalizedModelId = normalizeModelToken(requestedModelId);
  const compatibility = loadVllmCompatibilityIndex();
  if (!compatibility.available || !normalizedModelId) {
    return { proxyModelId: requestedModelId, eligible: true };
  }

  const entry = compatibility.byAlias.get(normalizedModelId);
  if (!entry) {
    return { proxyModelId: requestedModelId, eligible: true };
  }

  const requestedVariant = entry.variantAliases.get(normalizedModelId) || null;
  const variantOrder = [];
  if (requestedVariant) variantOrder.push(requestedVariant);
  if (entry.defaultVariant) variantOrder.push(entry.defaultVariant);
  if (entry.fallbackVariant) variantOrder.push(entry.fallbackVariant);
  for (const variantKey of Object.keys(entry.variants)) {
    if (!variantOrder.includes(variantKey)) variantOrder.push(variantKey);
  }

  for (const variantKey of variantOrder) {
    const variant = entry.variants[variantKey];
    if (!variant || !variant.available) continue;
    if (providerVramMb >= variant.minVramMb) {
      return { proxyModelId: variant.modelId, eligible: true };
    }
  }

  return { proxyModelId: requestedModelId, eligible: false };
}

function resolveEffectiveMinVramMb(requestedModelId, registryMinVramMb) {
  const normalizedModelId = normalizeModelToken(requestedModelId);
  const compatibility = loadVllmCompatibilityIndex();
  if (!compatibility.available || !normalizedModelId) return registryMinVramMb;

  const entry = compatibility.byAlias.get(normalizedModelId);
  if (!entry) return registryMinVramMb;

  const mins = Object.values(entry.variants)
    .filter((variant) => variant && variant.available)
    .map((variant) => variant.minVramMb)
    .filter((value) => Number.isFinite(value));

  if (mins.length === 0) return registryMinVramMb;
  return Math.min(registryMinVramMb, Math.min(...mins));
}

// ── GET /v1/coding/models — curated coding-model catalog (dcp launcher) ────
// What the `dcp` CLI shows in its picker: the curated coding models (see
// lib/coding-models.js) with LIVE availability — 'available' means at least
// one online provider has a reachable vLLM engine serving the model right
// now (the /anthropic surface only routes to vLLM's native Anthropic
// endpoint). Public: the CLI renders the catalog before login.
router.get('/coding/models', modelCatalogLimiter, (req, res) => {
  try {
    const {
      curatedCodingModels,
      IN_RATE_HALALA_PER_1M,
      OUT_RATE_HALALA_PER_1M,
    } = require('../lib/coding-models');
    const models = curatedCodingModels().map((m) => {
      const serving = lookupProviderEnginesForModel(m.id)
        .filter((p) => p._selectedEngine && p._selectedEngine.engine_type === 'vllm');
      return {
        id: m.id,
        label: m.label || m.id,
        vram_gb: Number(m.vram_gb) || 0,
        price_in_halala_per_1m: IN_RATE_HALALA_PER_1M,
        price_out_halala_per_1m: OUT_RATE_HALALA_PER_1M,
        status: serving.length > 0 ? 'available' : 'busy',
        providers_serving: serving.length,
      };
    });
    return res.json({ models });
  } catch (error) {
    console.error('[v1] coding/models error:', error.message);
    return res.status(500).json({ error: 'Failed to load coding models' });
  }
});

// ── GET /v1/models — OpenAI-compatible model list ──────────────────────────

router.get('/models', modelCatalogLimiter, (req, res) => {
  try {
    const columns = getModelRegistryColumns();
    if (columns.size === 0 || !columns.has('model_id')) {
      return res.json({ object: 'list', data: [] });
    }

    let rows = [];
    try {
      rows = db.all(buildModelRegistryListQuery(columns));
    } catch (error) {
      if (!isMissingModelRegistryError(error)) throw error;
    }

    const tokenRateRows = loadActiveTokenRateRows();
    const tokenRateByModel = new Map();
    for (const row of tokenRateRows || []) {
      const modelKey = normalizeString(row?.model, { maxLen: 200 });
      const tokenRate = toFiniteInt(row?.token_rate_halala, { min: 0, max: 100_000_000 });
      if (!modelKey || tokenRate == null) continue;
      tokenRateByModel.set(modelKey, tokenRate);
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const endpointUrl = buildEndpointUrl(req);

    // Count REACHABLE providers per model. Catalog honesty: a provider that is
    // merely status='online' (heartbeat-claimed) but whose endpoint failed the
    // backend reachability probe cannot actually serve, so it must NOT inflate
    // provider_count — otherwise the catalog advertises models that 503 on order.
    // Require a positive backend liveness verdict, mirroring the
    // getCapableProviders routing gate so the catalog matches what can route.
    // Earned-state gate (backlog #2): a provider that heartbeats + has a port
    // listening (endpoint_reachable=1) but FAILED its last inference probe must
    // not inflate provider_count, or the catalog advertises models that 503 on
    // order. applyEarnedRoutingPolicy drops freshly-confirmed-dead providers
    // (default) / keeps only verified-serving ones (strict), degrading to the
    // claimed-state list when verification is inactive.
    let providerRows = [];
    try {
      const rawProviderRows = db.all(
        `SELECT id, cached_models, vram_mb, last_heartbeat FROM providers
       WHERE status = 'online' AND COALESCE(is_paused, 0) = 0
         AND deleted_at IS NULL AND vllm_endpoint_url IS NOT NULL
         AND COALESCE(endpoint_reachable, 0) = 1
         AND endpoint_probed_at IS NOT NULL`
      );
      providerRows = Array.isArray(rawProviderRows) ? rawProviderRows : [];
    } catch (_) {
      providerRows = [];
    }
    const onlineProvidersRaw = applyEarnedRoutingPolicy(providerRows, db);
    const onlineProviders = Array.isArray(onlineProvidersRaw) ? onlineProvidersRaw : [];
    const providerIdsByModelKey = new Map();
    const addProviderForModelKey = (modelKey, providerId) => {
      const key = normalizeModelToken(modelKey);
      const id = Number(providerId);
      if (!key || !Number.isFinite(id)) return;
      if (!providerIdsByModelKey.has(key)) providerIdsByModelKey.set(key, new Set());
      providerIdsByModelKey.get(key).add(id);
    };
    const addProviderModelKeys = (modelId, out) => {
      const rawKey = normalizeModelToken(modelId);
      if (!rawKey) return;
      const canonicalKey = normalizeModelToken(getCanonicalModelId(rawKey));
      out.add(rawKey);
      if (canonicalKey) out.add(canonicalKey);
    };
    const providerCountNowMs = Date.now();
    for (const p of onlineProviders) {
      if (isProviderHeartbeatStale(p, providerCountNowMs)) continue;
      const cached = parseCachedModels(p.cached_models);
      const providerModelKeys = new Set();
      for (const m of cached) {
        addProviderModelKeys(m, providerModelKeys);
      }
      for (const key of providerModelKeys) {
        addProviderForModelKey(key, p.id);
      }
    }
    if (isMultiEngineRoutingEnabled()) {
      try {
        const rawEngineRows = db.all(
          `SELECT p.id AS id,
                  p.last_heartbeat AS last_heartbeat,
                  pe.served_models AS engine_served_models
             FROM provider_engines pe
             JOIN providers p ON p.id = pe.provider_id
            WHERE pe.reachable = 1
              AND p.status = 'online'
              AND COALESCE(p.is_paused, 0) = 0
              AND p.deleted_at IS NULL
              AND COALESCE(p.endpoint_reachable, 0) = 1
              AND p.endpoint_probed_at IS NOT NULL`
        );
        const engineRowsRaw = Array.isArray(rawEngineRows) ? rawEngineRows : [];
        const engineRows = applyEarnedRoutingPolicy(engineRowsRaw, db);
        for (const row of engineRows) {
          if (isProviderHeartbeatStale(row, providerCountNowMs)) continue;
          const engineModels = parseCachedModels(row.engine_served_models);
          const providerModelKeys = new Set();
          for (const modelId of engineModels) {
            addProviderModelKeys(modelId, providerModelKeys);
          }
          for (const key of providerModelKeys) {
            addProviderForModelKey(key, row.id);
          }
        }
      } catch (_) {
        // provider_engines is optional during migration; legacy provider count remains intact.
      }
    }
    const providerCountByModel = new Map(
      Array.from(providerIdsByModelKey.entries()).map(([key, providerIds]) => [key, providerIds.size])
    );

    const data = (rows || []).map((row) => {
      // Match provider count: check if any online provider has this model cached
      const modelLower = (row.model_id || '').toLowerCase().trim();
      const canonicalModelLower = normalizeModelToken(getCanonicalModelId(modelLower));
      // Canonical-alias EQUALITY only. providerCountByModel keys are already
      // canonicalized (raw + getCanonicalModelId), and the alias table maps
      // dash/colon and repo-prefixed forms (e.g. baai/bge-m3 -> bge-m3) to the
      // same key, so this get-by-key is the honest match. The old substring
      // fallback (cached.includes(modelLower) || modelLower.includes(cached))
      // inflated every model to provider_count>=1 and was removed — note that
      // modelIdsMatch() is NOT a substitute here because it also does .includes()
      // + a separator-stripped loose match, i.e. it would re-introduce inflation.
      const pCount = providerCountByModel.get(modelLower) || (canonicalModelLower ? providerCountByModel.get(canonicalModelLower) : 0) || 0;
      const contractCore = toCatalogContractCore({
        model: row,
        providerCount: pCount,
        maxVramGb: Number(row.vram_gb || row.min_gpu_vram_gb || 0),
        created: nowSecs,
      });
      const catalogRates = resolveCatalogTokenRates(row, tokenRateByModel);
      const tokenPricing = toTokenPricingContract({
        inputHalalaPer1m: catalogRates.inputHalalaPer1m,
        outputHalalaPer1m: catalogRates.outputHalalaPer1m,
        source: catalogRates.source,
      });
      const capabilityMetadata = buildCatalogCapabilityMetadata(contractCore);
      const endpoints = capabilityMetadata.chat_completions
        ? [{ url: endpointUrl, type: 'chat' }]
        : [];
      const architecture = {
        tokenizer: resolveTokenizerFamily(row),
        instruct_type: 'instruct',
        modality: 'text',
      };

      // OpenRouter provider model contract shape:
      // {
      //   id, name, description,
      //   pricing: { prompt_tokens, completion_tokens, ... },
      //   context_length,
      //   architecture: { tokenizer, instruct_type|modality },
      //   endpoints: [{ url, type }],
      //   provider_priority?: string[]
      // }
      // Catalog honesty: surface real servability so clients aren't told a model
      // is orderable when no live provider can serve it. Same vocabulary as
      // /api/models (status: 'available' | 'no_providers') so the two endpoints AGREE.
      const isServable = Number(contractCore.provider_count || 0) > 0;
      return {
        ...contractCore,
        available: isServable,
        status: isServable ? 'available' : 'no_providers',
        object: 'model',
        owned_by: 'dc1-platform',
        permission: [],
        root: row.model_id,
        parent: null,
        description: buildModelDescription(row, contractCore),
        pricing: {
          ...tokenPricing,
          usd_per_minute: contractCore.pricing.usd_per_minute,
        },
        capability_flags: capabilityMetadata,
        capabilities: capabilityMetadata,
        architecture,
        endpoints,
        provider_priority: ['dcp'],
        // Legacy aliases kept for existing clients while catalog parity migrates.
        display_name: contractCore.name,
        context_window: contractCore.context_length,
        parameter_count: row.parameter_count ?? null,
      };
    });

    // Tito audit: collapse dash/colon-form alias duplicates so the same
    // underlying model doesn't appear twice with split provider counts.
    // Canonical form = Ollama tag (colon). See src/lib/model-aliases.js.
    const deduped = deduplicateModelAliases(data);
    return res.json({ object: 'list', data: deduped });
  } catch (error) {
    console.error('[v1/models] Error:', error);
    return sendV1Error(res, {
      status: 503,
      type: 'server_error',
      code: 'provider_unavailable',
      message: 'Model catalog is temporarily unavailable',
    });
  }
});

// ── POST /v1/chat/completions — unified streaming + non-streaming ──────────

// Default output budget when the caller specifies neither `max_tokens` nor
// `max_completion_tokens`. SITE-15 fix: thinking-capable models (qwen3:4b,
// qwen3:8b, QwQ, DeepSeek-R1) spend output tokens on internal reasoning before
// emitting any visible answer. With the legacy 512 floor a reasoning-heavy
// prompt burns the entire budget on the internal monologue and returns
// content="" with finish_reason="length" (a non-answer). The /no_think soft
// switch is unreliable on the live Ollama build, so the robust, engine-agnostic
// guard is a higher default budget for thinking models so reasoning can never
// starve the answer. Callers who pass an explicit budget keep full control.
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_MAX_TOKENS_THINKING = 2048;
const MAX_TOKENS_HARD_CAP = 8192;

// Dynamic timeout: 30s base + scales with max_tokens (14B model at ~9 tok/s)
const PROXY_TIMEOUT_BASE_MS = 30000;
const PROXY_TIMEOUT_PER_TOKEN_MS = 150;
const PROXY_TIMEOUT_MAX_MS = 300000; // 5 min hard cap

// M8 — per-class hard timeout caps. Reasoning models can legitimately spend
// minutes generating; vision models should respond fast on short prompts;
// chat is the middle of the road. Without per-class caps, a runaway chat
// completion can pin a provider for 5 minutes when 90s is already abnormal.
const PROXY_TIMEOUT_CAP_BY_CLASS_MS = {
  vision: 60_000,
  chat: 90_000,
  reasoning: 300_000,
};
function classifyModelClass(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id) return 'chat';
  if (/(^|[-_/])(vl|vision|llava|moondream|gemma3|gemini-pro-vision|qwen.*vl)/.test(id)) return 'vision';
  if (/(^|[-_/])(o1|o3|deepseek-r1|qwen.*qwq|qwq|reasoner|thinking)/.test(id)) return 'reasoning';
  // qwen3 thinking-mode is opt-in via /v1 think:true; default the family to chat.
  return 'chat';
}
function resolveProxyTimeoutMs(modelId, maxTokens) {
  const cls = classifyModelClass(modelId);
  const cap = PROXY_TIMEOUT_CAP_BY_CLASS_MS[cls] || PROXY_TIMEOUT_MAX_MS;
  return Math.min(
    PROXY_TIMEOUT_BASE_MS + (maxTokens || 0) * PROXY_TIMEOUT_PER_TOKEN_MS,
    cap,
    PROXY_TIMEOUT_MAX_MS
  );
}

function parseComputeTypes(raw) {
  if (!raw) return new Set(['inference', 'training', 'rendering']);
  if (Array.isArray(raw)) {
    return new Set(raw.map((value) => String(value).toLowerCase()));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((value) => String(value).toLowerCase()));
    }
  } catch (_) {
    // ignore malformed JSON; fall back to CSV parsing
  }
  return new Set(String(raw).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function resolveProviderVramMb(provider) {
  const candidates = [
    provider.vram_mb,
    provider.gpu_vram_mb,
    provider.gpu_vram_mib,
    provider.vram_gb != null ? Number(provider.vram_gb) * 1024 : null,
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const value = toFiniteInt(candidate, { min: 0, max: 1024 * 1024 });
    if (value != null && value > 0) return value;
  }
  return 0;
}

// Parse a provider's `cached_models` column, which may be either a
// JSON-encoded array or a comma-separated string. Returns a lowercase,
// trimmed list of model identifiers (possibly empty).
function parseCachedModels(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean);
    }
  } catch (_) {
    // Fall through to comma-separated parsing
  }
  return String(raw)
    .split(',')
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
}

// ─── Multi-engine routing (migration 015) ────────────────────────────────
// When MULTI_ENGINE_ROUTING_ENABLED=true, the gateway consults the
// `provider_engines` table to find providers serving a specific model on a
// specific engine. Each capable provider returned via this path carries a
// `_selectedEngine` field whose `base_url` overrides the legacy
// `providers.vllm_endpoint_url` in `proxyToProvider`. Falls back to the
// legacy path when no engine row matches (backward compat for providers that
// haven't shipped per-engine heartbeat payloads yet).
function isMultiEngineRoutingEnabled() {
  return process.env.MULTI_ENGINE_ROUTING_ENABLED === 'true';
}

// Returns engine rows (joined with their parent provider) whose
// `served_models` JSON includes `modelAlias`. Filters out paused / soft-
// deleted providers and unreachable engines. Returns a list of
// {provider, engine} pairs sorted by provider id (stable).
function lookupProviderEnginesForModel(modelAlias) {
  const requestedLower = modelAlias ? String(modelAlias).toLowerCase().trim() : null;
  if (!requestedLower) return [];

  // Use a single JOIN — small table (≤ a few hundred rows), no need for a
  // dedicated cache. Filter served_models in JS because SQLite's JSON1 may
  // not be compiled in on every install.
  let rows;
  try {
    rows = db.all(
      `SELECT pe.id              AS engine_id,
              pe.engine_type     AS engine_type,
              pe.base_url        AS engine_base_url,
              pe.port            AS engine_port,
              pe.served_models   AS engine_served_models,
              pe.reachable       AS engine_reachable,
              p.*
         FROM provider_engines pe
        JOIN providers p ON p.id = pe.provider_id
        WHERE pe.reachable = 1
          AND p.status = 'online'
          AND COALESCE(p.is_paused, 0) = 0
          AND p.deleted_at IS NULL
          AND COALESCE(p.endpoint_reachable, 0) = 1
          AND p.endpoint_probed_at IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM jobs jp
                 WHERE jp.provider_id = p.id
                   AND jp.job_type = 'interactive_pod'
                   AND jp.status IN ('queued','assigned','pulling','running'))
            `
    );
  } catch (e) {
    // Table missing or other schema issue — degrade silently to legacy path.
    return [];
  }

  const out = [];
  for (const row of rows) {
    let served = [];
    try {
      const parsed = JSON.parse(row.engine_served_models || '[]');
      if (Array.isArray(parsed)) {
        served = parsed.map((m) => String(m).toLowerCase().trim()).filter(Boolean);
      }
    } catch (_) {
      // Malformed JSON — skip this row rather than crash dispatch.
      continue;
    }
    if (served.length === 0) continue;

    const hasModel = served.some((m) => modelIdsMatch(m, requestedLower));
    if (!hasModel) continue;

    const providerCols = { ...row };
    delete providerCols.engine_id;
    delete providerCols.engine_type;
    delete providerCols.engine_base_url;
    delete providerCols.engine_port;
    delete providerCols.engine_served_models;
    delete providerCols.engine_reachable;

    out.push({
      ...providerCols,
      _selectedEngine: {
        engine_id: row.engine_id,
        engine_type: row.engine_type,
        base_url: row.engine_base_url,
        port: row.engine_port,
        served_models: served,
      },
    });
  }
  return out;
}

// ── Earned-state routing policy (backlog #2 / keystone enforcement) ─────────
// The verification loop (providerVerification.js) probes each claimed-online
// provider ~every 60s with a real /v1/models + inference call and records an
// EARNED verdict. Routing/catalog/alternatives historically trusted only the
// CLAIMED signals (status='online' + endpoint_reachable — which only means "a
// port is listening"), so a node that heartbeats but 503s on inference was
// still advertised and routed to: a ~10s dead-end for the renter.
//
// Modes (env DCP_ROUTING_EARNED_MODE):
//   off          — legacy: ignore earned state entirely (escape hatch).
//   exclude-dead — DEFAULT (now-slice): drop providers we JUST probed and
//                  confirmed dead. Zero false-negative risk (a probe that just
//                  failed means a renter would fail too); the renter fails
//                  fast + honest instead of waiting out a connect timeout.
//   earned-first — STAGED: exclude-dead, and PREFER verified-serving providers
//                  over merely-claimed ones (the preference is applied at the
//                  latency-gate call site so it survives re-ordering). Falls
//                  back to claimed providers only when no verified provider can
//                  serve the model. Validate with a live verified provider
//                  before enabling.
//   strict       — STAGED/graduation: only verified-serving providers are
//                  routable/advertised. Enable once the probe is proven and
//                  enough providers exist that no single one is a SPOF.
// Every mode degrades to legacy when the verification subsystem is inactive
// (no fresh verdicts at all), so a dead verification loop can never blank the
// fleet.
function resolveEarnedRoutingMode() {
  const m = String(process.env.DCP_ROUTING_EARNED_MODE || 'exclude-dead')
    .toLowerCase()
    .trim();
  return ['off', 'exclude-dead', 'earned-first', 'strict'].includes(m) ? m : 'exclude-dead';
}

// Apply the earned-state policy to a list of provider candidate rows (each row
// must carry an `id`). Pure + side-effect free; returns a (possibly new) array.
// `exclude-dead` and `earned-first` both only DROP freshly-confirmed-dead nodes
// here; `earned-first`'s preference ordering is applied separately at the gate
// call site. `strict` keeps only verified-serving nodes.
function applyEarnedRoutingPolicy(providers, dbInstance = db) {
  const mode = resolveEarnedRoutingMode();
  if (mode === 'off' || !Array.isArray(providers) || providers.length === 0) {
    return providers;
  }
  let state;
  try {
    state = getEarnedRoutingState(dbInstance);
  } catch (_) {
    return providers; // verification unavailable → never self-inflict an outage
  }
  if (!state.active) return providers; // loop down / never ran → legacy fallback
  if (mode === 'strict') {
    return providers.filter((p) => state.servingIds.has(Number(p.id)));
  }
  return providers.filter((p) => !state.deadIds.has(Number(p.id)));
}

function isProviderHeartbeatStale(provider, nowMs = Date.now()) {
  const hbMs = provider?.last_heartbeat ? Date.parse(provider.last_heartbeat) : NaN;
  return Number.isFinite(hbMs) && (nowMs - hbMs) > PROVIDER_HEARTBEAT_STALE_MS;
}

function getCapableProviders(minVramMb, requestedModelId) {
  // Flagged: try the multi-engine table first. When it returns matches we
  // skip the legacy SELECT entirely. When it returns nothing we fall through
  // so providers without engine rows still serve via their legacy endpoint.
  if (isMultiEngineRoutingEnabled() && requestedModelId) {
    const engineCandidates = lookupProviderEnginesForModel(requestedModelId);
    if (engineCandidates.length > 0) {
      const nowMs = Date.now();
      const filtered = [];
      for (const candidate of engineCandidates) {
        if (isProviderHeartbeatStale(candidate, nowMs)) continue;
        if (Number(candidate.endpoint_reachable) !== 1 || !candidate.endpoint_probed_at) continue;
        if (!parseComputeTypes(candidate.supported_compute_types).has('inference')) continue;
        if (resolveProviderVramMb(candidate) < minVramMb) continue;
        filtered.push(candidate);
      }
      const earnedFiltered = applyEarnedRoutingPolicy(filtered);
      if (earnedFiltered.length > 0) return earnedFiltered;
      // Either no engine candidate passed the readiness loop, OR they passed
      // but were all dropped by the earned-state policy (e.g. freshly-dead).
      // Fall through to the legacy SELECT so a provider that matches only via
      // cached_models can still serve. NOTE: the legacy path applies
      // applyEarnedRoutingPolicy AGAIN at its return (below) — that second call
      // is REQUIRED, not redundant. This engine-path filter only covers engine
      // candidates; legacy candidates are a different set. Do not remove it.
    }
  }

  const providers = db.all(
    `SELECT * FROM providers
     WHERE status = 'online' AND COALESCE(is_paused, 0) = 0
       AND deleted_at IS NULL
       AND vllm_endpoint_url IS NOT NULL AND vllm_endpoint_url != ''
       AND COALESCE(endpoint_reachable, 0) = 1
       AND endpoint_probed_at IS NOT NULL
       -- rented out: provider has an active interactive pod
       AND NOT EXISTS (
            SELECT 1 FROM jobs jp
             WHERE jp.provider_id = providers.id
               AND jp.job_type = 'interactive_pod'
               AND jp.status IN ('queued','assigned','pulling','running'))`
  );
  const nowMs = Date.now();
  const capable = [];
  const requestedLower = requestedModelId
    ? String(requestedModelId).toLowerCase().trim()
    : null;
  for (const p of providers) {
    if (isProviderHeartbeatStale(p, nowMs)) continue;
    // Audit C3 — backend-side reachability probe. The probe writes a positive
    // verdict only after this backend can touch the provider endpoint. A
    // heartbeat-only provider must never be routable.
    if (Number(p.endpoint_reachable) !== 1 || !p.endpoint_probed_at) continue;
    if (!parseComputeTypes(p.supported_compute_types).has('inference')) continue;
    if (resolveProviderVramMb(p) < minVramMb) continue;
    if (requestedLower) {
      const cached = parseCachedModels(p.cached_models);
      // Backward-compat: if the provider reports no cached_models at all,
      // fall through (we don't know what they have, so don't exclude).
      if (cached.length > 0) {
        const hasModel = cached.some((m) => modelIdsMatch(m, requestedLower));
        if (!hasModel) continue;
      }
    }
    capable.push(p);
  }
  return applyEarnedRoutingPolicy(capable);
}

function resolveModelRequirements(model) {
  const columns = getModelRegistryColumns();
  if (columns.size === 0 || !columns.has('model_id')) {
    return {
      model_id: model,
      min_vram_gb: 0,
      context_window: 4096,
      fallback_rate_halala_per_min: 2,
    };
  }

  let row = null;
  try {
    row = db.get(buildModelRequirementsQuery(columns), model);
  } catch (error) {
    if (!isMissingModelRegistryError(error)) throw error;
  }
  return {
    model_id: row?.model_id || model,
    min_vram_gb: Number(row?.min_gpu_vram_gb || 0),
    context_window: Number(row?.context_window || 4096),
    fallback_rate_halala_per_min: 2,
  };
}

function resolveTokenRateHalala(modelId) {
  try {
    const explicitRow = db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      modelId
    );
    const row = explicitRow || db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      '__default__'
    );
    // SITE-15 rate audit: no explicit active row for this model means it is
    // being priced off '__default__'. Warn once so a missing/deactivated rate
    // (e.g. qwen2.5vl:3b not seeded) does not silently bill at the wrong number.
    if (!explicitRow && modelId && modelId !== '__default__' && !defaultRateBilledModels.has(modelId)) {
      defaultRateBilledModels.add(modelId);
      console.warn('[v1.billing] no explicit cost_rates row — billing via __default__ fallback', {
        model: modelId,
        fallback_token_rate_halala: toFiniteInt(row?.token_rate_halala, { min: 0, max: 100_000_000 }) ?? DEFAULT_TOKEN_RATE_HALALA,
      });
    }
    return toFiniteInt(row?.token_rate_halala, { min: 0, max: 100_000_000 }) ?? DEFAULT_TOKEN_RATE_HALALA;
  } catch (error) {
    if (!isMissingCostRatesSchemaError(error)) throw error;
    return DEFAULT_TOKEN_RATE_HALALA;
  }
}

// Migration 011: separate input vs output per-1M-token rates from
// model_registry. Returns {in, out} in halala-per-1M-tokens; null on either
// side means "no rate configured — caller falls back to legacy token_rate".
function resolveModelRegistryRates(modelId) {
  try {
    const row = db.get(
      `SELECT price_in_halala_per_1m_tok, price_out_halala_per_1m_tok
         FROM model_registry
        WHERE model_id = ? OR LOWER(model_id) = LOWER(?)
        LIMIT 1`,
      modelId, modelId
    );
    if (!row) return { in: null, out: null };
    return {
      in: toFiniteInt(row.price_in_halala_per_1m_tok, { min: 0, max: 100_000_000 }),
      out: toFiniteInt(row.price_out_halala_per_1m_tok, { min: 0, max: 100_000_000 }),
    };
  } catch (error) {
    // Migration not yet applied or column missing — fall through to legacy.
    return { in: null, out: null };
  }
}

function extractRequestId(req) {
  return normalizeString(
    req.headers['idempotency-key']
      || req.headers['x-request-id']
      || req.headers['x-correlation-id'],
    { maxLen: 200, trim: true }
  ) || `orreq_${crypto.randomUUID()}`;
}

function approximateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// OpenAI documents ~765 tokens per high-res image in the vision API. We use
// that as a conservative fixed estimate per image part for local prompt-token
// estimation. Real billing still uses the upstream provider's `usage`
// payload when present — this only affects the pre-flight estimate.
const VISION_IMAGE_TOKEN_ESTIMATE = 765;

// Render a single message's `content` to a string for local token estimation.
// Multimodal content arrays (OpenAI vision format) are flattened: text parts
// contribute their text, image parts contribute a fixed-length placeholder
// sized to approximate VISION_IMAGE_TOKEN_ESTIMATE tokens. The body sent to
// the provider is NOT touched here — this is estimator-only.
function renderMessageContentForEstimate(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text);
    } else if (part.type === 'image_url' || part.type === 'input_image' || part.image_url) {
      // Pad with ~4 chars per estimated token so approximateTokenCount
      // returns ~VISION_IMAGE_TOKEN_ESTIMATE for this part.
      parts.push('x'.repeat(VISION_IMAGE_TOKEN_ESTIMATE * 4));
    }
  }
  return parts.join(' ');
}

function estimatePromptFromMessages(messages) {
  return messages
    .map(m => `${m.role}: ${renderMessageContentForEstimate(m.content)}`)
    .join('\n');
}

// Normalize a renter-supplied `messages` array into the canonical form sent
// to the upstream provider. Pure function — does not throw, does not mutate
// input. Returns a fresh array.
//
// Contract (extracted from POST /v1/chat/completions handler so it can be
// unit-tested in isolation; behaviour must match the inline loop exactly):
//   - At most 100 messages processed; rest discarded.
//   - Role normalised to lowercase (max 20 chars), defaults to 'user'.
//   - role:'tool' messages keep tool_call_id + stringify non-string content.
//   - role:'assistant' with tool_calls array preserves tool_calls (id auto-
//     filled if missing) but DOES NOT recurse into argument generation —
//     the caller (handler) supplies a crypto-backed id factory.
//   - Multimodal arrays: text parts trimmed to 20k chars, image_url parts
//     pass through untouched (string OR {url, detail}). input_image parts
//     pass through verbatim. At most 32 parts. Unknown part.type ignored.
//   - String content normalised via the supplied normalizeString helper.
//   - Messages that would have no content (no parts AND no string) are
//     dropped — caller treats empty result as 400 invalid_request.
//
// Why a factory for the assistant tool-call id? Because the production
// handler uses `crypto.randomBytes` for unguessable ids, but tests want
// deterministic output. Caller passes an injectable id generator.
function normalizeMessagesForUpstream(messagesRaw, {
  normalizeString: normalizeStringFn,
  makeToolCallId,
} = {}) {
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) return [];
  if (typeof normalizeStringFn !== 'function') {
    throw new Error('normalizeMessagesForUpstream: normalizeString is required');
  }
  const idFactory = typeof makeToolCallId === 'function'
    ? makeToolCallId
    : () => `call_${crypto.randomBytes(8).toString('hex')}`;

  const messages = [];
  for (const entry of messagesRaw.slice(0, 100)) {
    const role = normalizeStringFn(entry?.role, { maxLen: 20 }) || 'user';
    const msg = { role: role.toLowerCase() };

    // role:'tool' (tool call result)
    if (msg.role === 'tool' && entry?.tool_call_id) {
      msg.tool_call_id = String(entry.tool_call_id);
      msg.content = typeof entry.content === 'string'
        ? entry.content
        : JSON.stringify(entry.content || '');
      messages.push(msg);
      continue;
    }

    // role:'assistant' with tool_calls
    if (msg.role === 'assistant' && Array.isArray(entry?.tool_calls)) {
      msg.content = entry.content || '';
      msg.tool_calls = entry.tool_calls.map((tc) => ({
        id: tc?.id || idFactory(),
        type: 'function',
        function: {
          name: tc?.function?.name || '',
          arguments: tc?.function?.arguments || '{}',
        },
      }));
      messages.push(msg);
      continue;
    }

    // Multimodal content array (OpenAI vision format).
    // Pass image parts through verbatim — the gateway is a dumb proxy.
    if (Array.isArray(entry?.content)) {
      const parts = [];
      for (const part of entry.content.slice(0, 32)) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && typeof part.text === 'string') {
          const text = part.text.slice(0, 20000);
          if (text) parts.push({ type: 'text', text });
        } else if (part.type === 'image_url' && part.image_url) {
          parts.push({ type: 'image_url', image_url: part.image_url });
        } else if (part.type === 'input_image') {
          parts.push(part);
        }
      }
      if (parts.length === 0) continue;
      msg.content = parts;
      messages.push(msg);
      continue;
    }

    // String content (legacy path).
    const content = normalizeStringFn(entry?.content, { maxLen: 20000, trim: false });
    if (!content) continue;
    msg.content = content;
    messages.push(msg);
  }
  return messages;
}

function computeTokenCostHalala(tokens, tokenRateHalala) {
  const safeTokens = toFiniteInt(tokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const safeTokenRate = toFiniteInt(tokenRateHalala, { min: 0, max: 100_000_000 }) ?? 0;
  if (safeTokens <= 0 || safeTokenRate <= 0) return 0;
  return Math.ceil((safeTokens * safeTokenRate) / TOKEN_RATE_BILLING_UNIT_TOKENS);
}

function computeUsageCostBreakdown({
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  tokenRateHalala = DEFAULT_TOKEN_RATE_HALALA,
  // Migration 011: separate input vs output per-1M-token rates. When set,
  // these win over the legacy `tokenRateHalala`. If only the legacy is set
  // (older callers / fallback path) we apply the same rate to both sides
  // — which preserves the prior "prompt and completion billed equally"
  // semantics for backward compat.
  inRateHalalaPer1m = null,
  outRateHalalaPer1m = null,
}) {
  const safePromptTokens = toFiniteInt(promptTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const safeCompletionTokens = toFiniteInt(completionTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const safeTotalTokens = toFiniteInt(totalTokens, { min: 0, max: 1_000_000_000 })
    ?? (safePromptTokens + safeCompletionTokens);

  // Resolve effective rates.
  // Legacy `tokenRateHalala` is per-token-halala (typically very small) —
  // it's NOT the same unit as the new per-1M rates. Existing rows in
  // `cost_rates` use that field; we convert.
  let inRate = toFiniteInt(inRateHalalaPer1m, { min: 0, max: 100_000_000 });
  let outRate = toFiniteInt(outRateHalalaPer1m, { min: 0, max: 100_000_000 });
  if ((inRate == null || outRate == null) && tokenRateHalala != null) {
    const legacyAsPer1m = toFiniteInt(tokenRateHalala, { min: 0, max: 100_000_000 }) ?? 0;
    // legacy `tokenRateHalala` is halala-per-token NOT per-1M. The legacy
    // computeTokenCostHalala formula divides by TOKEN_RATE_BILLING_UNIT_TOKENS
    // (1_000_000), so the legacy rate already IS in halala-per-1M when
    // expressed against `tokens` in that formula. Keep the unit
    // consistent — `legacyAsPer1m` here IS halala-per-1M.
    if (inRate == null) inRate = legacyAsPer1m;
    if (outRate == null) outRate = legacyAsPer1m;
  }
  inRate = Math.max(0, inRate || 0);
  outRate = Math.max(0, outRate || 0);

  if (safeTotalTokens <= 0 || (inRate === 0 && outRate === 0)) {
    return {
      promptCostHalala: 0,
      completionCostHalala: 0,
      totalCostHalala: 0,
    };
  }

  // Bill prompt and completion separately. Ceil at the per-side level so
  // we don't lose halala to rounding on small calls.
  const promptCostHalala = Math.ceil((safePromptTokens * inRate) / TOKEN_RATE_BILLING_UNIT_TOKENS);
  const completionCostHalala = Math.ceil((safeCompletionTokens * outRate) / TOKEN_RATE_BILLING_UNIT_TOKENS);
  const totalCostHalala = promptCostHalala + completionCostHalala;

  return {
    promptCostHalala,
    completionCostHalala,
    totalCostHalala,
  };
}

// 1 SAR = 100 halala. The catalog contract only exposes USD (halala/375), so
// we derive SAR here for the renter-facing cost meter. Sub-halala precision is
// preserved (4 dp) so per-token micro-costs don't collapse to 0.00.
function toSarStringFromHalala(halalaValue) {
  const halala = Number(halalaValue || 0);
  if (!Number.isFinite(halala) || halala <= 0) return '0.0000';
  return (halala / 100).toFixed(4);
}

function withUsdUsagePricing(rawUsage = {}, tokenRateHalala = DEFAULT_TOKEN_RATE_HALALA, perTokenRates = null) {
  const promptTokens = toFiniteInt(rawUsage.prompt_tokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const completionTokens = toFiniteInt(rawUsage.completion_tokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const totalTokens = toFiniteInt(rawUsage.total_tokens, { min: 0, max: 1_000_000_000 })
    ?? (promptTokens + completionTokens);
  const { promptCostHalala, completionCostHalala, totalCostHalala } = computeUsageCostBreakdown({
    promptTokens,
    completionTokens,
    totalTokens,
    tokenRateHalala,
    inRateHalalaPer1m: perTokenRates?.in ?? null,
    outRateHalalaPer1m: perTokenRates?.out ?? null,
  });

  return {
    ...rawUsage,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    pricing: {
      currency: 'USD',
      usd_prompt: toUsdStringFromHalala(promptCostHalala),
      usd_completion: toUsdStringFromHalala(completionCostHalala),
      usd_total: toUsdStringFromHalala(totalCostHalala),
      // SAR mirror for the renter playground cost meter. Currency stays 'USD'
      // for OpenAI-compat clients; SAR fields are additive and ignored by them.
      sar_prompt: toSarStringFromHalala(promptCostHalala),
      sar_completion: toSarStringFromHalala(completionCostHalala),
      sar_total: toSarStringFromHalala(totalCostHalala),
    },
  };
}

function resolvePromptCacheStaticPrefix(body = {}) {
  if (body.prompt_cache && Object.prototype.hasOwnProperty.call(body.prompt_cache, 'static_prefix')) {
    return body.prompt_cache.static_prefix;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'static_prefix')) {
    return body.static_prefix;
  }
  return undefined;
}

function resolvePromptCacheSessionId(body = {}) {
  const candidate = body.prompt_cache?.session_id ?? body.session_id ?? body.user;
  return normalizeString(candidate, { maxLen: 200, trim: true }) || undefined;
}

function buildPromptCacheUsageResult(rawUsage, context = {}) {
  const baseInput = {
    model: context.model,
    messages: context.messages,
    prompt: context.prompt,
    staticPrefix: context.staticPrefix,
    sessionId: context.sessionId,
    promptTokens: rawUsage?.prompt_tokens ?? context.promptTokens,
    usage: rawUsage,
  };
  let accounting = computePromptCacheAccounting(baseInput);
  if (accounting.cache_key && context.db && context.renterId) {
    try {
      if (hasPromptCacheMeasurement(context.db, context.renterId, accounting.cache_key)) {
        accounting = computePromptCacheAccounting({
          ...baseInput,
          priorCacheKeys: new Set([accounting.cache_key]),
        });
      }
    } catch (error) {
      console.warn('[v1/chat/completions] prompt-cache prior lookup skipped:', error?.message || error);
    }
  }
  return {
    usage: attachPromptCacheUsage(rawUsage, accounting),
    accounting,
  };
}

function recordPromptCacheUsageMeasurement(context = {}, accounting, providerResponseId = null) {
  if (!accounting || !accounting.eligible || !accounting.cache_key) return;
  try {
    recordPromptCacheMeasurement(context.db, context.renterId, accounting, {
      model: context.model,
      requestId: context.requestId,
      providerResponseId,
    });
  } catch (error) {
    console.warn('[v1/chat/completions] prompt-cache measurement record skipped:', error?.message || error);
  }
}

function v1ChatRateLimiter(req, res, next) {
  if (req.body?.stream) {
    return vllmStreamLimiter(req, res, next);
  }
  return vllmCompleteLimiter(req, res, next);
}

const PROVIDER_OPTIONAL_PASSTHROUGH_FIELDS = [
  'top_p',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'stop',
  'n',
  'seed',
  'response_format',
  'stream_options',
  'parallel_tool_calls',
  'logit_bias',
  'logprobs',
  'top_logprobs',
  'user',
  'metadata',
  // Renter opt-in for reasoning/thinking. By default DCP disables thinking
  // on thinking-capable models (Qwen3, QwQ, DeepSeek-R1) to avoid billing
  // for tokens the renter did not ask for. Passing either of these as
  // truthy turns it back on.
  'enable_thinking',
  'chat_template_kwargs',
];

// Model families that emit <think>...</think> reasoning by default unless
// the engine is explicitly told to disable thinking. Matched against the
// effective model id with the leading "org/" stripped and lowercased.
const THINKING_MODEL_PREFIX_RE = /^(qwen3|qwq|deepseek-r1|deepseek[_-]?ai\/deepseek-r1)/i;

function isThinkingCapableModel(modelId) {
  if (!modelId) return false;
  const tail = String(modelId).replace(/^[^/]+\//, '').toLowerCase().trim();
  if (THINKING_MODEL_PREFIX_RE.test(tail)) return true;
  // Also catch the un-stripped form (e.g. "deepseek-ai/DeepSeek-R1-...")
  return THINKING_MODEL_PREFIX_RE.test(String(modelId).toLowerCase());
}

// Strip <think>...</think> reasoning blocks from a model response. No-op
// when no tags are present, so safe to apply unconditionally to thinking-
// capable model responses.
function stripThinkBlocks(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  // Greedy-but-non-overlapping match. Also tolerates leading whitespace
  // after the closing tag so the user-visible answer doesn't start blank.
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trimStart();
}

// ─── Engine-keyed reasoning control ───────────────────────────────────────
// Different inference engines expose DIFFERENT knobs to disable "thinking" on
// reasoning-capable models (Qwen3 / QwQ / DeepSeek-R1), and the same knob can
// behave differently across engine versions. Empirically, Ollama's top-level
// `think:false` BACKFIRES on current builds for qwen3 — reasoning leaks into
// `content`, or the response comes back empty — whereas leaving Ollama at its
// default cleanly separates reasoning into a `reasoning` field. So rather than
// one fragile endpoint-string guess + one knob, we:
//   1. resolve the engine type (from the routing engine hint, else the URL);
//   2. suppress reasoning engine-appropriately — for Qwen-family models we
//      inject the model-native `/no_think` directive (engine-agnostic, and it
//      also saves the renter the reasoning tokens), and for vLLM we set the
//      native chat-template kwarg. We NEVER send Ollama `think:false`;
//   3. ALWAYS normalize the response so `content` is reasoning-free regardless
//      of engine (strip <think> blocks; never promote a separated reasoning
//      field into content).
const REASONING_ENGINE_TYPES = new Set(['ollama', 'vllm', 'llamacpp']);

function resolveEngineType(endpointUrl, engineHint) {
  const hint = typeof engineHint === 'string' ? engineHint.toLowerCase().trim() : '';
  if (REASONING_ENGINE_TYPES.has(hint)) return hint;
  const url = String(endpointUrl || '').toLowerCase();
  if (url.includes(':11434') || url.includes('ollama')) return 'ollama';
  if (url.includes(':8080')) return 'llamacpp';
  if (url.includes(':8000') || url.includes('vllm')) return 'vllm';
  return 'unknown';
}

// Qwen3 / QwQ honor the `/no_think` soft switch in the prompt; it suppresses
// reasoning GENERATION (so the renter is not billed for it) and works on every
// engine. DeepSeek-R1 ignores it and always reasons, so it is excluded — those
// responses are only cleaned by the normalizer below.
const QWEN_NOTHINK_PREFIX_RE = /^(qwen3|qwq)/i;
function modelHonorsNoThink(modelId) {
  if (!modelId) return false;
  const tail = String(modelId).replace(/^[^/]+\//, '').toLowerCase().trim();
  return QWEN_NOTHINK_PREFIX_RE.test(tail) || QWEN_NOTHINK_PREFIX_RE.test(String(modelId).toLowerCase());
}

// Immutably append the Qwen `/no_think` directive to the last user message.
// Returns a NEW messages array; never mutates the renter's input. No-op when
// there is no string-content user message (e.g. multimodal) or it is already
// present.
function injectNoThinkDirective(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') { lastUserIdx = i; break; }
  }
  if (lastUserIdx === -1) return messages;
  const target = messages[lastUserIdx];
  if (typeof target.content !== 'string') return messages;
  if (/\/no_think\b/.test(target.content)) return messages;
  const next = messages.slice();
  next[lastUserIdx] = { ...target, content: `${target.content} /no_think` };
  return next;
}

// Canonicalize an engine's reasoning field name to `reasoning_content`:
// Ollama /v1 emits `reasoning`, Ollama native emits `thinking`, vLLM/DeepSeek
// emit `reasoning_content`. Mutates the passed message/delta object in place.
function canonicalizeReasoningField(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (typeof obj.reasoning_content === 'string') { delete obj.reasoning; delete obj.thinking; return; }
  if (typeof obj.reasoning === 'string') { obj.reasoning_content = obj.reasoning; delete obj.reasoning; delete obj.thinking; }
  else if (typeof obj.thinking === 'string') { obj.reasoning_content = obj.thinking; delete obj.thinking; }
}

// Remove reasoning from a message/delta entirely: strip <think> blocks from
// content and drop any separated reasoning field. Used when thinking is
// disabled (the default / "Show reasoning" toggle off).
//
// SITE-15 salvage: a thinking model can exhaust its budget mid-reasoning and
// return content="" with the answer (or the bulk of its thought) sitting in the
// separated reasoning field. Blindly deleting reasoning then leaves the renter
// an empty completion — a non-answer. So when stripping the content yields
// nothing AND reasoning text exists, promote that reasoning (cleaned of any
// nested <think> tags) into content rather than shipping "". A real answer the
// model actually produced is always better than an empty body.
function stripReasoningFromObject(obj) {
  if (!obj || typeof obj !== 'object') return;
  const strippedContent =
    typeof obj.content === 'string' ? stripThinkBlocks(obj.content) : obj.content;
  const reasoningText =
    (typeof obj.reasoning === 'string' && obj.reasoning) ||
    (typeof obj.reasoning_content === 'string' && obj.reasoning_content) ||
    (typeof obj.thinking === 'string' && obj.thinking) ||
    '';
  const visible = typeof strippedContent === 'string' ? strippedContent.trim() : '';
  obj.content =
    visible.length === 0 && reasoningText.trim().length > 0
      ? stripThinkBlocks(reasoningText)
      : strippedContent;
  delete obj.reasoning;
  delete obj.reasoning_content;
  delete obj.thinking;
}

// Neutral system_fingerprint emitted on every /v1 response. The upstream engine
// stamps its own engine-revealing value (e.g. Ollama → "fp_ollama"), which would
// disclose the inference engine to every caller. DCP sells a sovereign,
// engine-agnostic runtime, so we overwrite — never delete (some OpenAI SDKs
// expect the field) — with a neutral DCP value. Served model names (qwen…) are
// legitimate and left untouched.
const DCP_SYSTEM_FINGERPRINT = 'fp_dcp';

// Overwrite system_fingerprint with the neutral DCP value and scrub any other
// engine tell echoed by the upstream in the response body. Mutates `obj` in
// place. Safe to call on a chat.completion body, a chat.completion.chunk, or a
// freshly-built response object. Idempotent.
function neutralizeEngineFingerprint(obj) {
  if (!obj || typeof obj !== 'object') return;
  // Always present + neutral, regardless of what the engine sent.
  obj.system_fingerprint = DCP_SYSTEM_FINGERPRINT;
  // Drop non-standard engine-identifying top-level fields some engines append
  // (llama.cpp `system_fingerprint` is handled above; these are extra tells).
  // `model` (qwen…) and standard OpenAI fields are intentionally preserved.
  for (const key of ['__verbose', 'system', 'engine', 'backend', 'served_by']) {
    if (key in obj) delete obj[key];
  }
}

// Stateful <think>…</think> stripper for streaming. Inline reasoning tags can
// span SSE chunks, so we (a) track whether we're inside a think block across
// calls and (b) hold back a trailing partial-tag candidate so a tag split on a
// chunk boundary is never leaked as content. Engines that emit reasoning in a
// separate field (Ollama, vLLM) are handled by field-dropping instead; this is
// the belt-and-suspenders path for inline-tag engines (e.g. llama.cpp).
function createStreamingThinkStripper() {
  const OPEN = '<think>';
  const CLOSE = '</think>';
  let insideThink = false;
  let carry = '';
  return function stripChunk(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    const buf = carry + text;
    carry = '';
    let out = '';
    let i = 0;
    while (i < buf.length) {
      if (!insideThink) {
        const open = buf.indexOf(OPEN, i);
        if (open === -1) {
          let safeEnd = buf.length;
          for (let k = Math.max(i, buf.length - OPEN.length + 1); k < buf.length; k++) {
            if (OPEN.startsWith(buf.slice(k)) || CLOSE.startsWith(buf.slice(k))) { safeEnd = k; break; }
          }
          out += buf.slice(i, safeEnd);
          carry = buf.slice(safeEnd);
          break;
        }
        out += buf.slice(i, open);
        insideThink = true;
        i = open + OPEN.length;
      } else {
        const close = buf.indexOf(CLOSE, i);
        if (close === -1) {
          for (let k = Math.max(i, buf.length - CLOSE.length + 1); k < buf.length; k++) {
            if (CLOSE.startsWith(buf.slice(k))) { carry = buf.slice(k); break; }
          }
          break;
        }
        insideThink = false;
        i = close + CLOSE.length;
      }
    }
    return out;
  };
}

function collectProviderOptionalPassthroughFields(requestBody = {}) {
  const passthrough = {};
  for (const field of PROVIDER_OPTIONAL_PASSTHROUGH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(requestBody, field)) {
      passthrough[field] = requestBody[field];
    }
  }
  return passthrough;
}

// ── Ollama model alias mapping ──────────────────────────────────────────────
// Renters request models by HuggingFace ID but Ollama providers serve by
// Ollama-native names. When the provider endpoint is on the Ollama port
// (:11434), map known HuggingFace IDs to their Ollama equivalents.
//
// Canonical source is src/lib/model-aliases.js (also used by the /v1/models
// dedupe pass, so the two can't drift out of sync).
const OLLAMA_MODEL_ALIASES = DASH_TO_CANONICAL;

// Reverse lookup: HuggingFace-style id -> Ollama name is already in
// OLLAMA_MODEL_ALIASES. We also need Ollama -> HF (for when the request
// uses a HF-style id but the provider's cached_models only lists the
// Ollama variant). Build this lazily once.
const OLLAMA_TO_HF_ALIASES = (() => {
  const reverse = {};
  for (const [hf, ollama] of Object.entries(OLLAMA_MODEL_ALIASES)) {
    // Last-writer-wins is fine; both map to the same canonical ollama tag
    reverse[String(ollama).toLowerCase().trim()] = hf;
  }
  return reverse;
})();

function resolveOllamaModelId(modelId, endpointUrl, providerCachedModels) {
  if (!modelId) return modelId;
  const normalized = String(modelId).toLowerCase().trim();

  // Direct alias lookup — only when endpoint looks like Ollama.
  // Pre-flight detection inlined; full endpointLooksOllama is computed
  // below for the other heuristics, but this branch needs it first.
  const _epLooksOllamaEarly = !!(endpointUrl && (String(endpointUrl).includes(':11434') || /ollama/i.test(String(endpointUrl))));
  if (_epLooksOllamaEarly && OLLAMA_MODEL_ALIASES[normalized]) {
    return OLLAMA_MODEL_ALIASES[normalized];
  }

  // Heuristic 1: an Ollama-style tag (contains a ':' and no '/') is almost
  // always meant for Ollama — apply alias mapping regardless of port.
  const looksOllama = normalized.includes(':') && !normalized.includes('/');
  if (looksOllama && OLLAMA_MODEL_ALIASES[normalized]) {
    return OLLAMA_MODEL_ALIASES[normalized];
  }

  // Heuristic 2: endpoint clearly points at Ollama (default port OR any port
  // but we also accept based on path/host containing 'ollama').
  let endpointLooksOllama = false;
  if (endpointUrl) {
    const raw = String(endpointUrl);
    if (raw.includes(':11434') || /ollama/i.test(raw)) {
      endpointLooksOllama = true;
    }
  }

  // Heuristic 3: provider's cached_models list contains Ollama-style tags.
  // This lets us detect Ollama providers running on non-standard ports
  // (RunPod proxy, reverse proxied IP:port, etc).
  let cachedList = [];
  if (providerCachedModels) {
    cachedList = Array.isArray(providerCachedModels)
      ? providerCachedModels.map((s) => String(s).toLowerCase().trim()).filter(Boolean)
      : parseCachedModels(providerCachedModels);
  }
  const cachedLooksOllama = cachedList.some(
    (m) => m.includes(':') && !m.includes('/')
  );

  // Forward mapping: HF-style id -> Ollama name.
  // Critical: cachedLooksOllama alone is NOT sufficient. A vLLM provider's
  // cached_models can include Ollama-style tags as informational metadata
  // (e.g. Tareq's RTX 3090 lists `qwen3:30b-a3b` alongside the canonical
  // `Qwen/Qwen3-30B-A3B-GPTQ-Int4`). Only rewrite to the Ollama tag when
  // the endpoint itself looks like Ollama. Otherwise the renter's HF id
  // passes through verbatim to vLLM, which is case-sensitive.
  if (endpointLooksOllama && OLLAMA_MODEL_ALIASES[normalized]) {
    return OLLAMA_MODEL_ALIASES[normalized];
  }

  // Reverse mapping: the caller used the HF-style id but the provider's
  // cached_models list only contains the Ollama tag. If the HF id is mapped
  // to an ollama tag the provider actually serves, forward it.
  const ollamaTag = OLLAMA_MODEL_ALIASES[normalized];
  if (ollamaTag && cachedList.includes(ollamaTag)) {
    return ollamaTag;
  }

  // Additional reverse case: caller used an Ollama tag but the provider
  // only reports the HF-style id in cached_models — map back to HF.
  // Critical: only do this when the endpoint is NOT Ollama. If endpoint
  // looks like Ollama (port 11434, /ollama in URL, or cached_models is
  // dominated by Ollama tags), the Ollama tag is what the server expects.
  if (looksOllama && !endpointLooksOllama && !cachedLooksOllama && OLLAMA_TO_HF_ALIASES[normalized]) {
    const hf = OLLAMA_TO_HF_ALIASES[normalized];
    if (cachedList.some((m) => m === hf.toLowerCase())) {
      return hf;
    }
  }

  // Final fallback: loose-match against provider's cached_models with
  // original casing preserved. Handles the case where the renter sends
  // the registry's canonical slug (e.g. "qwen3-30b-a3b") but the provider
  // is serving the verbatim HF id (e.g. "Qwen/Qwen3-30B-A3B-GPTQ-Int4").
  // vLLM is case-sensitive and only knows the id it loaded, so we return
  // the cached entry verbatim. Strips slashes/dashes/colons/underscores
  // and common quantization suffixes before comparing.
  if (providerCachedModels) {
    const cachedOriginal = Array.isArray(providerCachedModels)
      ? providerCachedModels.map((s) => String(s).trim()).filter(Boolean)
      : String(providerCachedModels)
          .replace(/^\[|\]$/g, '')
          .split(/[,\n]/)
          .map((s) => s.replace(/^["'\s]+|["'\s]+$/g, ''))
          .filter(Boolean);
    const looseKey = (s) =>
      String(s)
        .toLowerCase()
        .replace(/[\/:_\-\s.]/g, '')
        .replace(/(gptq|awq|gguf|int4|int8|fp16|fp8|bf16|q4km|q4ks|q5km|q5ks|q6k|q8|km|ks)/g, '');
    const wantLoose = looseKey(normalized);
    if (wantLoose.length >= 4) {
      const exact = cachedOriginal.find((s) => looseKey(s) === wantLoose);
      if (exact) return exact;
      const substr = cachedOriginal.find((s) => {
        const c = looseKey(s);
        return c && (c.includes(wantLoose) || wantLoose.includes(c));
      });
      if (substr) return substr;
    }
  }

  return modelId;
}

function extractEndpointHost(endpointUrl) {
  try {
    return new URL(String(endpointUrl || '')).host || null;
  } catch (_) {
    return null;
  }
}

function buildProviderChatCompletionsUrl(endpointUrl) {
  const raw = normalizeString(endpointUrl, { maxLen: 2000, trim: true });
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return `${String(raw).replace(/\/+$/, '')}/v1/chat/completions`;
  }

  const path = String(parsed.pathname || '').replace(/\/+$/, '');
  if (/\/v1\/chat\/completions$/i.test(path) || /\/chat\/completions$/i.test(path)) {
    return parsed.toString();
  }
  if (/\/v1$/i.test(path)) {
    parsed.pathname = `${path}/chat/completions`;
    return parsed.toString();
  }

  parsed.pathname = `${path || ''}/v1/chat/completions`;
  return parsed.toString();
}

function setProviderRouteEvidenceHeaders(res, {
  provider = null,
  requestedModelId = null,
  routedModelId = null,
} = {}) {
  if (!res || typeof res.setHeader !== 'function' || !provider) return;
  const providerId = toFiniteInt(provider.id, { min: 1 });
  if (providerId) res.setHeader('x-dcp-provider-id', String(providerId));

  const providerTier = resolveProviderTier(provider);
  if (providerTier) res.setHeader('x-dcp-provider-tier', String(providerTier));

  const endpointHost = extractEndpointHost(provider.vllm_endpoint_url);
  if (endpointHost) res.setHeader('x-dcp-provider-endpoint-host', endpointHost);

  if (requestedModelId) res.setHeader('x-dcp-requested-model-id', String(requestedModelId));
  if (routedModelId) res.setHeader('x-dcp-routed-model-id', String(routedModelId));
}

async function proxyToProvider({
  endpointUrl,
  modelId,
  messages,
  maxTokens,
  temperature,
  stream,
  tools,
  toolChoice,
  passthroughBody = {},
  providerCachedModels = null,
  engineType = null,
}) {
  const url = buildProviderChatCompletionsUrl(endpointUrl);
  if (!url) {
    return {
      proxyError: 'invalid_endpoint',
      detail: 'Provider endpoint URL is missing or invalid',
    };
  }
  // Remap HuggingFace model IDs to Ollama names when targeting an Ollama provider
  const effectiveModelId = resolveOllamaModelId(modelId, endpointUrl, providerCachedModels);

  // Engine-keyed thinking control. Thinking-capable models (Qwen3, QwQ,
  // DeepSeek-R1) reason by default. By DCP policy reasoning is OFF unless the
  // renter opts in (cleaner output + no billing for tokens they didn't ask
  // for). The knob to disable it differs per engine — see the helper comment.
  const _resolvedEngine = resolveEngineType(endpointUrl, engineType);
  const _modelIsThinkingCapable = isThinkingCapableModel(effectiveModelId);
  const _userTplKwargs = (passthroughBody && typeof passthroughBody.chat_template_kwargs === 'object')
    ? passthroughBody.chat_template_kwargs
    : null;
  const _userEnableThinkingOptIn =
    passthroughBody?.enable_thinking === true ||
    _userTplKwargs?.enable_thinking === true;
  const _shouldDisableThinking = _modelIsThinkingCapable && !_userEnableThinkingOptIn;

  // Strip our own control field out of the passthrough so it is never sent
  // upstream verbatim (we translate it to the engine's native knob instead).
  const { enable_thinking: _omitEnableThinking, ...restPassthrough } = passthroughBody || {};

  let effectiveMessages = messages;
  const body = { model: effectiveModelId, max_tokens: maxTokens, temperature, stream: !!stream, ...restPassthrough };
  if (_shouldDisableThinking) {
    // (1) Qwen-family: inject the model-native /no_think directive — suppresses
    //     reasoning GENERATION (saves tokens) and is engine-agnostic.
    if (modelHonorsNoThink(effectiveModelId)) {
      effectiveMessages = injectNoThinkDirective(messages);
    }
    // (2) vLLM: also set the native chat-template kwarg (reliable belt).
    if (_resolvedEngine === 'vllm') {
      body.chat_template_kwargs = { ..._userTplKwargs, enable_thinking: false };
    }
    // (3) Ollama: DO NOT send `think:false` — it backfires (reasoning leaks
    //     into content / empties the response on current builds). Default
    //     Ollama separates reasoning into its own field; the response
    //     normalizer (below + streaming) drops it. llama.cpp/unknown rely on
    //     /no_think + the <think> normalizer.
  } else if (_resolvedEngine === 'vllm' && _userTplKwargs) {
    // Opt-in path: preserve any user-provided chat_template_kwargs verbatim.
    body.chat_template_kwargs = { ..._userTplKwargs };
  }
  body.messages = effectiveMessages;
  if (tools !== undefined) body.tools = tools;
  if (toolChoice !== undefined) body.tool_choice = toolChoice;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(resolveProxyTimeoutMs(effectiveModelId, maxTokens)),
    });
  } catch (err) {
    return { proxyError: err.name === 'TimeoutError' ? 'timeout' : 'connection_refused', detail: err.message };
  }
  if (!response.ok) {
    return { proxyError: `provider_http_${response.status}`, detail: `Provider returned ${response.status}` };
  }
  // If streaming, return the raw response for pipe-through. The suppress flag
  // lets the streaming normalizer drop reasoning deltas / <think> spans.
  if (stream) return { streamResponse: response, suppressReasoning: _shouldDisableThinking };
  let parsed;
  // Clone the response BEFORE reading so we can salvage the raw body on
  // JSON parse failure. fetch bodies are single-shot streams — once
  // `.json()` consumes them they're gone, so we need a fresh clone for
  // the text peek fallback.
  const responseClone = (() => {
    try { return response.clone(); } catch (_) { return null; }
  })();
  try {
    parsed = await response.json();
  } catch (err) {
    let peek = '';
    if (responseClone) {
      try { peek = await responseClone.text(); } catch (_) { peek = ''; }
    }
    console.error('[v1] non-JSON upstream', {
      url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyPeek: peek.slice(0, 500),
      parseError: err && err.message,
    });
    return { proxyError: 'invalid_response', detail: 'Provider returned non-JSON body' };
  }
  // Response normalizer (non-stream). When thinking is disabled, strip any
  // <think> blocks AND drop the separated reasoning field so `content` is the
  // clean answer regardless of engine. When the renter opted in, keep the
  // reasoning but canonicalize the field name to `reasoning_content` (Ollama
  // emits `reasoning`, native emits `thinking`, vLLM emits `reasoning_content`).
  if (parsed && Array.isArray(parsed.choices)) {
    for (const choice of parsed.choices) {
      if (_shouldDisableThinking) {
        stripReasoningFromObject(choice?.message);
        stripReasoningFromObject(choice?.delta);
      } else {
        canonicalizeReasoningField(choice?.message);
        canonicalizeReasoningField(choice?.delta);
      }
    }
  }
  return { body: parsed, suppressReasoning: _shouldDisableThinking };
}

router.post('/chat/completions', v1ChatRateLimiter, requireAuth, async (req, res) => {
  let persistFailureUsageBestEffort = null;
  // H3 — track every provider slot we hold during this request so we can
  // release them in a single finally regardless of which return path fires.
  const acquiredSlots = new Set();
  const tryAcquireSlot = (providerId) => {
    if (acquireProviderSlot(providerId)) {
      acquiredSlots.add(Number(providerId));
      return true;
    }
    return false;
  };
  // Request id must be in scope for BOTH the try body and the catch handler
  // below — the error path calls inferenceTracker.trackError(meteringRequestId).
  // Declared here (not inside the try) to avoid a ReferenceError in catch.
  const meteringRequestId = extractRequestId(req);
  try {
    const model = normalizeString(req.body?.model, { maxLen: 200 });
    if (!model) return sendV1Error(res, {
      status: 400,
      type: 'invalid_request_error',
      code: 'invalid_request_model_required',
      message: '`model` is required',
      retryable: false,
    });

    const messagesRaw = req.body?.messages;
    if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
      return sendV1Error(res, {
        status: 400,
        type: 'invalid_request_error',
        code: 'invalid_request_messages_required',
        message: '`messages` must be a non-empty array',
        retryable: false,
      });
    }

    // Prepare messages — supports tool_calls, role:'tool', and OpenAI
    // multimodal content arrays. Logic lives in a pure helper so it can
    // be unit-tested without standing up the full express app.
    const messages = normalizeMessagesForUpstream(messagesRaw, {
      normalizeString,
    });

    if (messages.length === 0) {
      return sendV1Error(res, {
        status: 400,
        type: 'invalid_request_error',
        code: 'invalid_request_messages_empty',
        message: 'messages must include at least one non-empty content string',
        retryable: false,
      });
    }

    // Output budget. Accept both `max_tokens` (legacy) and `max_completion_tokens`
    // (current OpenAI SDKs) — whichever the caller sent wins. When neither is
    // provided, choose a default that won't let a thinking model's reasoning
    // starve the visible answer (see DEFAULT_MAX_TOKENS_THINKING note above).
    const requestedMaxTokens =
      toFiniteInt(req.body?.max_tokens, { min: 1, max: MAX_TOKENS_HARD_CAP }) ??
      toFiniteInt(req.body?.max_completion_tokens, { min: 1, max: MAX_TOKENS_HARD_CAP });
    const maxTokens =
      requestedMaxTokens ??
      (isThinkingCapableModel(model) ? DEFAULT_MAX_TOKENS_THINKING : DEFAULT_MAX_TOKENS);
    const temperature = toFiniteNumber(req.body?.temperature, { min: 0, max: 2 }) ?? 0.7;
    const wantsStream = !!req.body?.stream;

    // ── Request classification (Mesh-LLM router.rs port) — telemetry only ──
    const classification = classifyRequest(messages, req.body?.tools);
    if (Math.random() < 0.1) {  // 10% sampling
      console.error(`[router] ${classification.category}/${classification.complexity} model=${model}`);
    }

    // ── Per-model demand tracking ──
    trackModelDemand(model);

    // H6 — Idempotency-Key replay. If the renter retries with the same key
    // within IDEMPOTENCY_TTL_MS, return the cached response instead of
    // creating a second upstream call (and a second bill). Streaming
    // responses are not cacheable — let those retries through.
    const idempotencyKey = !wantsStream
      ? normalizeString(req.headers['idempotency-key'], { maxLen: 200, trim: true })
      : null;
    if (idempotencyKey) {
      const cached = getIdempotencyEntry(req.renter.id, idempotencyKey);
      if (cached) {
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(cached.statusCode || 200).json(cached.response);
      }
    }

    // Extract function calling params (Gap 4)
    const hasTools = Object.prototype.hasOwnProperty.call(req.body || {}, 'tools');
    const hasToolChoice = Object.prototype.hasOwnProperty.call(req.body || {}, 'tool_choice');
    const tools = hasTools ? req.body.tools : undefined;
    const toolChoice = hasToolChoice ? req.body.tool_choice : undefined;
    const passthroughBody = collectProviderOptionalPassthroughFields(req.body || {});

    const modelReq = resolveModelRequirements(model);

    // Check if the model exists in the registry or is known via cached_models
    // If completely unknown, return 404 instead of 503
    const modelLower = (model || '').toLowerCase().trim();
    const knownInRegistry = modelReq.min_vram_gb > 0 || modelReq.model_id !== model;
    const knownByCachedProviders = (() => {
      try {
        const allProviders = db.all(`SELECT cached_models FROM providers WHERE cached_models IS NOT NULL AND cached_models != ''`);
        for (const p of allProviders) {
          const cached = parseCachedModels(p.cached_models);
          if (cached.some(m => m === modelLower || m.includes(modelLower) || modelLower.includes(m))) return true;
        }
      } catch (_) {}
      return false;
    })();
    const knownInCompatMatrix = (() => {
      const compat = loadVllmCompatibilityIndex();
      return compat.available && compat.byAlias.has(normalizeModelToken(model));
    })();

    if (!knownInRegistry && !knownByCachedProviders && !knownInCompatMatrix) {
      return sendV1Error(res, {
        status: 404,
        type: 'invalid_request_error',
        code: 'model_not_found',
        message: `Model '${model}' not found. Use GET /v1/models to see available models.`,
        retryable: false,
      });
    }

    const registryMinVramMb = modelReq.min_vram_gb * 1024;
    const effectiveMinVramMb = resolveEffectiveMinVramMb(modelReq.model_id, registryMinVramMb);
    const capableProviders = getCapableProviders(effectiveMinVramMb, modelReq.model_id).filter((provider) => {
      const providerVramMb = resolveProviderVramMb(provider);
      return resolveProviderRoutingModel({
        requestedModelId: modelReq.model_id,
        providerVramMb,
      }).eligible;
    });
    if (capableProviders.length === 0) {
      // M9: Graceful degradation -- suggest alternatives instead of a generic 503
      const availableModels = await getAvailableModels(db);
      const alternatives = rankAlternatives(model, availableModels, classification);
      const altSlice = alternatives.slice(0, 5).map(a => ({
        model: a.model,
        reason: a.reason,
        provider_count: a.providerCount,
      }));

      return res.status(503).json({
        error: {
          message: `Model '${model}' is not currently available. ${altSlice.length > 0 ? 'Alternatives are available.' : 'No models are currently online.'}`,
          type: 'model_unavailable',
          code: 'model_not_served',
          status: 503,
          retryable: true,
          alternatives: altSlice,
        },
      });
    }

    // H3 — per-provider in-flight gate. Drop providers already serving a
    // request; if every capable provider is busy, surface 503 with
    // Retry-After so the client backs off instead of stacking on Ollama.
    const freeProviders = capableProviders.filter((p) => !isProviderBusy(p.id));
    if (freeProviders.length === 0) {
      res.setHeader('Retry-After', '5');
      return sendV1Error(res, {
        status: 503,
        type: 'server_error',
        code: 'all_providers_busy',
        message: `All providers for '${model}' are serving other requests. Retry shortly.`,
        retryable: true,
      });
    }

    // Earned-first (STAGED, default off): when enabled and at least one
    // verified-serving provider can serve this model, run the latency gate over
    // ONLY the verified subset so a merely-claimed provider (and any within-
    // request failover) stays on earned nodes. Claimed providers are used only
    // when no verified provider serves the model (serving subset empty). No-op
    // in the default exclude-dead mode.
    let gateCandidates = freeProviders;
    if (resolveEarnedRoutingMode() === 'earned-first') {
      try {
        const earned = getEarnedRoutingState(db);
        if (earned.active) {
          const serving = freeProviders.filter((p) => earned.servingIds.has(Number(p.id)));
          if (serving.length > 0) gateCandidates = serving;
        }
      } catch (_) { /* verification unavailable → fall back to the full set */ }
    }

    const gateSelection = selectProvidersWithLatencyGate({
      db,
      providers: gateCandidates,
    });
    if (!gateSelection.pass || !gateSelection.selectedProviderId) {
      return sendV1Error(res, {
        status: 503,
        type: 'latency_budget_gate_error',
        code: 'no_capacity_available',
        message: 'Latency budget gate failed before provider submission',
        details: {
          mode: gateSelection.mode,
          reasons: gateSelection.reasons,
          tiers: gateSelection.tiers,
          thresholds: {
            max_p50_ms: gateSelection.thresholds.maxP50Ms,
            baseline_p95_ms: gateSelection.thresholds.baselineP95Ms,
            max_p95_regression_pct: gateSelection.thresholds.maxP95RegressionPct,
            baseline_stream_failure_rate: gateSelection.thresholds.baselineStreamFailureRate,
            max_stream_failure_regression_pct: gateSelection.thresholds.maxStreamFailureRegressionPct,
            min_latency_samples: gateSelection.thresholds.minLatencySamples,
            min_stream_samples: gateSelection.thresholds.minStreamSamples,
          },
        },
      });
    }

    const providerById = new Map(capableProviders.map((provider) => [Number(provider.id), provider]));
    let assignedProvider = providerById.get(Number(gateSelection.selectedProviderId)) || null;
    const fallbackProviders = gateSelection.fallbackProviderIds
      .map((providerId) => providerById.get(Number(providerId)))
      .filter(Boolean);

    // ── Session affinity — prefer the sticky provider when it passed the gate ──
    const sessionKey = getSessionKey(messages, model);
    const affinityId = getAffinityProvider(sessionKey);
    if (affinityId) {
      const affinityCandidate = providerById.get(Number(affinityId));
      // Only use affinity if the provider is both capable and not busy
      if (affinityCandidate && freeProviders.some(p => Number(p.id) === Number(affinityId))) {
        assignedProvider = affinityCandidate;
      }
    }

    if (!assignedProvider) {
      return sendV1Error(res, {
        status: 503,
        type: 'server_error',
        code: 'no_capacity_available',
        message: 'No inference providers available for this model',
      });
    }

    // Record affinity for this session
    setAffinityProvider(sessionKey, assignedProvider.id);

    res.setHeader('x-dcp-latency-gate-mode', gateSelection.mode);

    // Check balance
    const mergedPrompt = estimatePromptFromMessages(messages);
    const promptTokens = approximateTokenCount(mergedPrompt);
    const promptCacheContext = {
      db,
      renterId: req.renter.id,
      model: modelReq.model_id,
      messages,
      promptTokens,
      staticPrefix: resolvePromptCacheStaticPrefix(req.body || {}),
      sessionId: resolvePromptCacheSessionId(req.body || {}),
      requestId: meteringRequestId,
    };
    let lastPromptCacheAccounting = null;
    const withPromptCacheUsage = (usage) => {
      const result = buildPromptCacheUsageResult(usage, promptCacheContext);
      lastPromptCacheAccounting = result.accounting;
      return result.usage;
    };
    const recordPromptCacheMeasurementOnce = (providerResponseId = null) => {
      recordPromptCacheUsageMeasurement(promptCacheContext, lastPromptCacheAccounting, providerResponseId);
    };
    const durationMinutes = Math.max(1, Math.ceil(maxTokens / 350));
    const estimatedCostHalala = Math.max(1, Math.round(durationMinutes * modelReq.fallback_rate_halala_per_min));

    // ── Admission control v1: token-budget pre-flight gate ────────────────
    // Direct response to the 2026-05-21 Node 2 OOM post-mortem + Tareq's
    // DeepSeek-pattern reference (POST /v1 docs: dynamic concurrency cap +
    // HTTP 429). Prior behavior: any prompt was routed to the GPU; if the
    // (prompt + max_completion) blew past the model's context window the
    // upstream engine would OOM mid-decode and we'd 503 the renter.
    //
    // New behavior: BEFORE dispatch, refuse requests whose declared budget
    // exceeds 90 % of the model's training context. Returns 429 (Too Many
    // Tokens — semantically a renter-side back-off signal, not an
    // engine-side failure) with a clear remediation. The 10 % safety margin
    // leaves headroom for SWA / hybrid-memory re-allocations like the one
    // that crashed Node 2.
    //
    // Cap source order (most→least specific):
    //   1. modelReq.context_window  (model_registry, per-model truth)
    //   2. DCP_DEFAULT_MODEL_CTX env (operator override)
    //   3. 32768 baseline
    const declaredCtxCap = Number(
      modelReq.context_window
      || process.env.DCP_DEFAULT_MODEL_CTX
      || 32768
    );
    const SAFETY_FACTOR = 0.90; // PR #13194 SWA bug + KV graph headroom
    const requestedTokens = promptTokens + maxTokens;
    if (Number.isFinite(declaredCtxCap) && declaredCtxCap > 0
        && requestedTokens > Math.floor(declaredCtxCap * SAFETY_FACTOR)) {
      res.setHeader('Retry-After', '0');
      return sendV1Error(res, {
        status: 429,
        type: 'request_too_large',
        code: 'context_budget_exceeded',
        message:
          `Request budget (${requestedTokens} tokens = ${promptTokens} prompt + ` +
          `${maxTokens} max_tokens) exceeds 90% of model '${modelReq.model_id}'s ` +
          `${declaredCtxCap}-token context window. Reduce the prompt, ` +
          `lower max_tokens, or pick a model with a larger context.`,
        retryable: false,
        details: {
          prompt_tokens: promptTokens,
          max_tokens: maxTokens,
          requested_total: requestedTokens,
          model_context_window: declaredCtxCap,
          safety_factor: SAFETY_FACTOR,
          budget_cap: Math.floor(declaredCtxCap * SAFETY_FACTOR),
        },
      });
    }
    // ──────────────────────────────────────────────────────────────────────

    const baseTokenRateHalala = resolveTokenRateHalala(modelReq.model_id);
    // Migration 011: prefer per-1M in/out rates from model_registry. Falls
    // back to legacy `tokenRateHalala` applied symmetrically when null.
    const modelRegRates = resolveModelRegistryRates(modelReq.model_id);
    const baseInRate = modelRegRates.in;
    const baseOutRate = modelRegRates.out;

    // Migration 016: subscription discount. Active subscription = discount
    // applied per-model (NOT a flat bundle). Models still bill at their own
    // rate; discount is a uniform percentage off PAYG. Behind a flag while
    // we verify; default-off keeps PAYG behavior identical to pre-016.
    let activeSubscription = null;
    let subscriptionDiscountBps = 0;
    if (process.env.SUBSCRIPTION_BILLING_ENABLED === 'true' && req.renter?.id) {
      try {
        activeSubscription = subscriptionService.getActiveSubscription(db, req.renter.id);
        if (activeSubscription) {
          subscriptionDiscountBps = activeSubscription.discount_bps;
        }
      } catch (e) {
        console.error('[v1] subscription lookup failed', { renterId: req.renter.id, msg: e?.message });
      }
    }
    const tokenRateHalala = subscriptionService.computeDiscountedRateHalala(baseTokenRateHalala, subscriptionDiscountBps);
    const inRateHalalaPer1m = baseInRate == null ? null : subscriptionService.computeDiscountedRateHalala(baseInRate, subscriptionDiscountBps);
    const outRateHalalaPer1m = baseOutRate == null ? null : subscriptionService.computeDiscountedRateHalala(baseOutRate, subscriptionDiscountBps);

    // ── Pre-flight balance gate (migration 021) ──────────────────────────────
    // Refuse to dispatch the request if the renter cannot cover the upper-bound
    // cost. Estimate = prompt_tokens × in_rate + max_tokens × out_rate, with a
    // 20% safety margin to absorb token-count drift between local approximation
    // and the model's actual tokenizer. Active subscription credits count.
    const estimateHalala = Math.ceil(
      billingService.estimateInferenceCost({
        promptTokens,
        maxCompletionTokens: maxTokens,
        tokenRateHalala,
        inRateHalalaPer1m: inRateHalalaPer1m || 0,
        outRateHalalaPer1m: outRateHalalaPer1m || 0,
        fallbackRateHalalaPerMin: modelReq.fallback_rate_halala_per_min || 0,
      }) * 1.2
    );
    const gate = billingService.checkBalanceGate(db._db || db, req.renter.id, estimateHalala);
    if (!gate.ok) {
      return sendV1Error(res, {
        status: 402,
        type: 'insufficient_balance',
        code: 'insufficient_balance',
        message: `Insufficient balance to start this request. Available: ${(gate.totalAvailableHalala / 100).toFixed(2)} SAR, estimated cost: ${(gate.estimateHalala / 100).toFixed(2)} SAR. Top up via /api/payments/topup or enable auto-top-up.`,
        retryable: false,
        meta: {
          balance_sar: Number((gate.balanceHalala / 100).toFixed(2)),
          subscription_credits_sar: Number((gate.subCreditsHalala / 100).toFixed(2)),
          available_sar: Number((gate.totalAvailableHalala / 100).toFixed(2)),
          estimate_sar: Number((gate.estimateHalala / 100).toFixed(2)),
          deficit_sar: Number((gate.deficitHalala / 100).toFixed(2)),
        },
      });
    }

    // Optional monthly spend cap (#20) — the renter's own budget guardrail,
    // checked after the balance gate using the same pre-flight estimate. Reject
    // before dispatch if this request would push current-month spend over the
    // cap (no-op when no cap is set). Fail-open inside checkBudgetCap.
    const budgetGate = billingService.checkBudgetCap(db._db || db, req.renter.id, estimateHalala);
    if (budgetGate.capped && !budgetGate.ok) {
      return sendV1Error(res, {
        status: 402,
        type: 'budget_cap_exceeded',
        code: 'budget_cap_exceeded',
        message: `Monthly budget cap reached. Cap: ${(budgetGate.capHalala / 100).toFixed(2)} SAR, spent this month: ${(budgetGate.spentThisMonthHalala / 100).toFixed(2)} SAR, estimated cost: ${(budgetGate.estimateHalala / 100).toFixed(2)} SAR. Raise or remove the cap in your account settings.`,
        retryable: false,
        meta: {
          monthly_cap_sar: Number((budgetGate.capHalala / 100).toFixed(2)),
          spent_this_month_sar: Number((budgetGate.spentThisMonthHalala / 100).toFixed(2)),
          remaining_sar: Number((budgetGate.remainingHalala / 100).toFixed(2)),
          estimate_sar: Number((budgetGate.estimateHalala / 100).toFixed(2)),
        },
      });
    }

    let usagePersisted = false;
    const dbHandle = db._db || db;
    const transactionFactory = typeof dbHandle?.transaction === 'function'
      ? dbHandle.transaction.bind(dbHandle)
      : null;

    const runUsageTransaction = (work) => {
      if (!transactionFactory) {
        work();
        return;
      }
      transactionFactory(() => {
        work();
      })();
    };

    const toUsageSnapshot = (rawUsage = {}, completionText = '') => {
      const billedPromptTokens = toFiniteInt(rawUsage.prompt_tokens, { min: 0, max: 1_000_000_000 }) ?? promptTokens;
      const defaultCompletionTokens = completionText ? approximateTokenCount(completionText) : 0;
      const billedCompletionTokens = toFiniteInt(rawUsage.completion_tokens, { min: 0, max: 1_000_000_000 }) ?? defaultCompletionTokens;
      const billedTotalTokens = toFiniteInt(rawUsage.total_tokens, { min: 0, max: 1_000_000_000 })
        ?? (billedPromptTokens + billedCompletionTokens);
      const { promptCostHalala, completionCostHalala, totalCostHalala } = computeUsageCostBreakdown({
        promptTokens: billedPromptTokens,
        completionTokens: billedCompletionTokens,
        totalTokens: billedTotalTokens,
        tokenRateHalala,
        inRateHalalaPer1m,
        outRateHalalaPer1m,
      });
      return {
        promptTokens: billedPromptTokens,
        completionTokens: billedCompletionTokens,
        totalTokens: billedTotalTokens,
        promptCostHalala,
        completionCostHalala,
        costHalala: totalCostHalala,
        usdPrompt: toUsdStringFromHalala(promptCostHalala),
        usdCompletion: toUsdStringFromHalala(completionCostHalala),
        usdTotal: toUsdStringFromHalala(totalCostHalala),
      };
    };

    const persistUsageOnce = ({
      providerForUsage,
      providerResponseId = null,
      usage,
      completionText = '',
      settlementStatus = 'pending',
    }) => {
      if (usagePersisted) return;
      const snapshot = toUsageSnapshot(usage, completionText);
      try {
        recordOpenRouterUsage(dbHandle, {
          requestId: meteringRequestId,
          providerResponseId,
          requestPath: normalizeString(req.path || req.originalUrl || '/v1/chat/completions', { maxLen: 160 }),
          tokenRateHalala,
          renterId: req.renter.id,
          providerId: providerForUsage?.id || null,
          model: modelReq.model_id,
          source: 'v1',
          promptTokens: snapshot.promptTokens,
          completionTokens: snapshot.completionTokens,
          totalTokens: snapshot.totalTokens,
          promptCostHalala: snapshot.promptCostHalala,
          completionCostHalala: snapshot.completionCostHalala,
          costHalala: snapshot.costHalala,
          usdPrompt: snapshot.usdPrompt,
          usdCompletion: snapshot.usdCompletion,
          usdTotal: snapshot.usdTotal,
          currency: 'SAR',
          settlementStatus,
        });
      } catch (error) {
        console.error('[v1/chat/completions] usage ledger persist failed:', error?.message || error);
      }
      // Migration 010: also write to the new usage_events ledger with
      // provider 70 / DCP 30 revenue split tracking. This is the table
      // the new payout queue + renter dashboards will read from. Legacy
      // openrouter_usage write stays for backward compat during transition.
      try {
        const providerPayoutHalala = Math.ceil((snapshot.costHalala || 0) * 0.70);
        const dcpTakeHalala = Math.max(0, (snapshot.costHalala || 0) - providerPayoutHalala);
        db.prepare(`INSERT INTO usage_events (
          renter_id, provider_id, model_id,
          prompt_tokens, completion_tokens,
          prompt_cost_halala, completion_cost_halala, cost_halala,
          provider_payout_halala, dcp_take_halala,
          price_in_halala_per_1m_tok, price_out_halala_per_1m_tok,
          occurred_at, request_id, source, settlement_status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          req.renter.id,
          providerForUsage?.id || null,
          modelReq.model_id,
          snapshot.promptTokens || 0,
          snapshot.completionTokens || 0,
          snapshot.promptCostHalala || 0,
          snapshot.completionCostHalala || 0,
          snapshot.costHalala || 0,
          providerPayoutHalala,
          dcpTakeHalala,
          inRateHalalaPer1m,
          outRateHalalaPer1m,
          new Date().toISOString(),
          meteringRequestId || null,
          'v1/chat',
          settlementStatus
        );
      } catch (error) {
        // Unique index on request_id may collide on SDK retry — that's
        // expected and means the original was already billed. Other errors
        // are logged but never fail the response (we already billed the
        // legacy ledger above).
        const msg = String(error?.message || error || '');
        if (!/UNIQUE constraint failed.*usage_events/i.test(msg)) {
          // Structured drift-detection signal: this means usagePersisted=true
          // but the usage_events row is missing. On-call needs these receipts
          // to reconcile billing vs ledger after the fact.
          console.error('[v1/chat/completions] usage_events insert failed — billing/ledger drift', {
            request_id: meteringRequestId || null,
            renter_id: req.renter.id,
            provider_id: providerForUsage?.id || null,
            model_id: modelReq.model_id,
            cost_halala: snapshot.costHalala || 0,
            prompt_tokens: snapshot.promptTokens || 0,
            completion_tokens: snapshot.completionTokens || 0,
            settlement_status: settlementStatus,
            message: msg,
          });
        }
      }
      usagePersisted = true;
    };

    // NOTE (migration 021): the legacy debitRenterSafe() helper — a non-atomic
    // sub-credit-then-PAYG debit with log-only drift detection — has been
    // removed. Its responsibilities are now folded into the single atomic
    // settlement path below (billingService.settleInferenceOnce), which debits
    // renter + credits provider + writes usage_events/jobs in ONE transaction.

    // ── ATOMIC SETTLEMENT (migration 021) ────────────────────────────────────
    // Single transactional money path. One billingService.settleInferenceOnce()
    // call per completed inference, keyed by meteringRequestId:
    //   renter-debit (sub credits → PAYG) + provider-credit + usage_events
    //   + jobs row + renter/provider totals, all in ONE db.transaction()
    //   that is idempotent on request_id (billing_attempts PK).
    //
    // Replaces the old debitRenterSafe() + persistUsageOnce() + ad-hoc jobs/
    // totals inserts that wrote across multiple un-coordinated statements.
    //
    // INSUFFICIENT BALANCE: the tokens were already produced and shipped to
    // the renter, so we never reject here. We record the settlement as
    // UNBILLED (see recordUnbilledSettlement) rather than silently debiting 0,
    // so the pre-flight balance gate blocks the renter's NEXT request.
    //
    // ZERO-COMPLETION GUARD: when the provider omits a usage block, the cost
    // is derived from toUsageSnapshot() which already estimates completion
    // tokens from the completion text length (approximateTokenCount) — we
    // never bill 0 halala for real output.
    const recordUnbilledSettlement = ({ providerForUsage, providerResponseId, usage, completionText, costHalala }) => {
      // The atomic tx rolled back (renter could not cover the cost). Persist a
      // durable, idempotent receipt so on-call/reconciliation can see the
      // delivered-but-unbilled tokens. usage_events.settlement_status uses
      // 'failed' here (the closest enum value migration 010 allows — see
      // REVIEWER NOTE: 'unbilled' is not in the CHECK constraint). The
      // authoritative unbilled marker is the billing_attempts row below.
      runUsageTransaction(() => {
        try {
          db.prepare(
            `INSERT OR IGNORE INTO billing_attempts
               (request_id, renter_id, provider_id, cost_halala, provider_earned_halala, status, error_code, settled_at)
             VALUES (?, ?, ?, ?, 0, 'insufficient_balance', 'unbilled', ?)`
          ).run(
            meteringRequestId,
            req.renter.id,
            providerForUsage?.id || null,
            Math.max(0, Math.ceil(Number(costHalala) || 0)),
            new Date().toISOString()
          );
        } catch (e) {
          console.error('[v1] unbilled billing_attempts insert failed', {
            request_id: meteringRequestId, renter_id: req.renter.id, msg: e?.message,
          });
        }
        // Best-effort ledger receipt (status 'failed' === delivered-not-billed).
        persistUsageOnce({ providerForUsage, providerResponseId, usage, completionText, settlementStatus: 'failed' });
      });
    };

    const debitAndPersistUsage = ({ providerForUsage, providerResponseId = null, usage, completionText = '', responseContent = null, finishReason = null, jobMeta = null }) => {
      // SITE-15: a genuinely empty answer that stopped on 'length' (the model
      // over-reasoned and never produced visible content) is a non-answer. Do
      // NOT debit the renter for it. We still persist a durable, idempotent
      // 'failed' receipt (delivered-not-billed) + a billing_attempts audit row
      // so on-call/reconciliation can see it — exactly the unbilled treatment
      // used when balance is short, minus the gate. Falls back to completionText
      // when the caller has no separate visible-content handle (stream path).
      const visibleAnswer = responseContent != null ? responseContent : completionText;
      if (isUnbillableNonAnswer({ content: visibleAnswer, finishReason })) {
        console.warn('[v1.billing] no-bill: empty completion with finish_reason=length (over-reasoned non-answer)', {
          request_id: meteringRequestId,
          renter_id: req.renter.id,
          model: modelReq.model_id,
          finish_reason: finishReason,
        });
        runUsageTransaction(() => {
          try {
            db.prepare(
              `INSERT OR IGNORE INTO billing_attempts
                 (request_id, renter_id, provider_id, cost_halala, provider_earned_halala, status, error_code, settled_at)
               VALUES (?, ?, ?, 0, 0, 'insufficient_balance', 'no_answer', ?)`
            ).run(
              meteringRequestId,
              req.renter.id,
              providerForUsage?.id || null,
              new Date().toISOString()
            );
          } catch (e) {
            console.error('[v1] no-bill billing_attempts insert failed', {
              request_id: meteringRequestId, renter_id: req.renter.id, msg: e?.message,
            });
          }
          persistUsageOnce({ providerForUsage, providerResponseId, usage, completionText, settlementStatus: 'failed' });
        });
        usagePersisted = true;
        return;
      }
      const snapshot = toUsageSnapshot(usage, completionText);
      // Per-minute fallback only when the token-priced cost is exactly 0 AND we
      // truly have no tokens to price (mirrors the legacy proxy/stream job math).
      const settledCostHalala = snapshot.costHalala > 0
        ? snapshot.costHalala
        : Math.max(1, Math.round(
            (modelReq.fallback_rate_halala_per_min || 2)
            * (((snapshot.promptTokens || 0) + (snapshot.completionTokens || 0)) / 30)
          ));
      try {
        const result = billingService.settleInferenceOnce(db._db || db, {
          requestId: meteringRequestId,
          renterId: req.renter.id,
          providerId: providerForUsage?.id || null,
          costHalala: settledCostHalala,
          modelId: modelReq.model_id,
          usageEventRow: {
            promptTokens: snapshot.promptTokens || 0,
            completionTokens: snapshot.completionTokens || 0,
            promptCostHalala: snapshot.promptCostHalala || 0,
            completionCostHalala: snapshot.completionCostHalala || 0,
            inRateHalalaPer1m: inRateHalalaPer1m || 0,
            outRateHalalaPer1m: outRateHalalaPer1m || 0,
            source: 'v1/chat',
          },
          jobRow: jobMeta
            ? {
                jobId: jobMeta.jobId,
                submittedAt: jobMeta.submittedAt,
                startedAt: jobMeta.startedAt,
                completedAt: jobMeta.completedAt,
                durationSeconds: jobMeta.durationSeconds,
                result: jobMeta.result,
                notes: jobMeta.notes,
              }
            : null,
        });
        // Legacy ledger receipt. settleInferenceOnce already wrote the canonical
        // usage_events row (75/25 split, status 'settled'); persistUsageOnce here
        // keeps the openrouter_usage_ledger populated for the renter dashboard
        // (renters.js v1_usage / v1_usage_summary). Its duplicate usage_events
        // INSERT collides on the request_id UNIQUE index and is swallowed, so it
        // does NOT double-write the canonical ledger or re-credit anyone.
        runUsageTransaction(() => {
          persistUsageOnce({ providerForUsage, providerResponseId, usage, completionText, settlementStatus: 'settled' });
        });
        // Fire-and-forget auto-top-up (preserves debitRenterSafe behavior).
        // Skip on the idempotent replay so retries don't re-trigger a charge.
        if (result?.status === 'settled') {
          autoTopupService
            .maybeTrigger(db._db || db, req.renter.id, { triggerReason: 'post_debit_v1' })
            .catch((e) => console.warn('[v1.auto_topup] trigger failed', e?.message || e));
          // Revenue funnel: first successful paid inference for this renter.
          // Deduped per renter by the funnel service, so this records the FIRST
          // /v1/chat/completions settlement only — the moment the money loop
          // closed for a new renter. Best-effort, never blocks the response.
          try {
            conversionFunnel.trackStage({
              journey: 'renter',
              stage: 'first_inference',
              actorType: 'renter',
              actorId: req.renter.id,
              req,
              metadata: {
                model_id: modelReq.model_id,
                cost_halala: settledCostHalala,
                prompt_tokens: snapshot.promptTokens || 0,
                completion_tokens: snapshot.completionTokens || 0,
              },
            });
          } catch (_) { /* funnel best-effort */ }
        }
        usagePersisted = true;
      } catch (err) {
        if (err instanceof billingService.InsufficientBalanceError) {
          // Deliver-once-but-flag: tokens already shipped, record unbilled so
          // the NEXT request is gated. NEVER a silent zero-debit.
          recordUnbilledSettlement({
            providerForUsage,
            providerResponseId,
            usage,
            completionText,
            costHalala: settledCostHalala,
          });
          // Give auto-top-up a chance to refill before the next request.
          autoTopupService
            .maybeTrigger(db._db || db, req.renter.id, { triggerReason: 'unbilled_v1' })
            .catch((e) => console.warn('[v1.auto_topup] trigger failed', e?.message || e));
          return;
        }
        // Any other settlement error: drift signal, never block the response
        // the renter already received. Record a best-effort failed receipt.
        console.error('[v1] settleInferenceOnce failed — ledger/balance drift', {
          request_id: meteringRequestId,
          renter_id: req.renter.id,
          cost_halala: settledCostHalala,
          message: err?.message,
          code: err?.code,
        });
        runUsageTransaction(() => {
          persistUsageOnce({ providerForUsage, providerResponseId, usage, completionText, settlementStatus: 'failed' });
        });
      }
    };

    persistFailureUsageBestEffort = ({
      providerForUsage = null,
      providerResponseId = null,
      usage = null,
      completionText = '',
    } = {}) => {
      runUsageTransaction(() => {
        persistUsageOnce({
          providerForUsage,
          providerResponseId,
          usage: usage || { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
          completionText,
          settlementStatus: 'failed',
        });
      });
    };
    // Migration 016: include subscription credit balance in the pre-flight
    // check. A subscriber with 100k halala of credit and 0 PAYG balance must
    // still pass this gate. Falls back to PAYG-only when no active sub.
    let subscriptionCreditRemaining = 0;
    if (activeSubscription) {
      try {
        subscriptionCreditRemaining = subscriptionService.getRemainingCreditTotal(
          db, req.renter.id, new Date().toISOString()
        );
      } catch (e) {
        console.error('[v1] sub credit lookup failed', { renterId: req.renter.id, msg: e?.message });
      }
    }
    const totalAvailableHalala = Number(req.renter.balance_halala || 0) + subscriptionCreditRemaining;
    if (totalAvailableHalala < estimatedCostHalala) {
      return sendV1Error(res, {
        status: 402,
        type: 'billing_error',
        code: 'billing_insufficient_balance',
        message: 'Insufficient balance',
        retryable: false,
        details: {
          billing_url: 'https://dcp.sa/renter/billing',
          balance_halala: Number(req.renter.balance_halala || 0),
          subscription_credit_halala: subscriptionCreditRemaining,
          required_halala: estimatedCostHalala,
        },
      });
    }

    // Track inference request for live renter dashboard
    inferenceTracker.trackStart({
      requestId: meteringRequestId,
      renterId: req.renter.id,
      model: modelReq.model_id,
      maxTokens,
      temperature,
      stream: wantsStream,
      providerGpu: assignedProvider.gpu_name_detected || assignedProvider.gpu_model || 'unknown',
      providerId: assignedProvider.id,
      providerEndpoint: assignedProvider.vllm_endpoint_url,
    });

    // If provider has a vLLM endpoint, proxy directly
    if (assignedProvider.vllm_endpoint_url) {
      const assignedProviderProxyModel = resolveProviderRoutingModel({
        requestedModelId: modelReq.model_id,
        providerVramMb: resolveProviderVramMb(assignedProvider),
      });
      const routedModelId = assignedProviderProxyModel.proxyModelId;

      const proxyStartedAt = new Date().toISOString();
      // H3 — claim the in-flight slot for this provider before issuing the
      // upstream call. The free-list filter above means we should normally
      // win, but a parallel request could have grabbed it in the same tick.
      if (!tryAcquireSlot(assignedProvider.id)) {
        res.setHeader('Retry-After', '5');
        return sendV1Error(res, {
          status: 503,
          type: 'server_error',
          code: 'all_providers_busy',
          message: 'Provider became busy between selection and dispatch. Retry shortly.',
          retryable: true,
        });
      }
      // Multi-engine routing (migration 015): when the provider was picked
      // via the engines table, dispatch to that engine's base_url instead of
      // the legacy single `vllm_endpoint_url`. Note: engine base_url already
      // contains the WG mesh IP in production (e.g. http://10.8.0.6:11434/v1),
      // so we skip the wg_mesh_ip rewrite for this branch.
      let effectiveEndpointUrl;
      if (assignedProvider._selectedEngine && assignedProvider._selectedEngine.base_url) {
        effectiveEndpointUrl = assignedProvider._selectedEngine.base_url;
      } else {
        // Legacy path. H5 routing preference: prefer WG mesh IP when available
        // (lower latency, more reliable) than the registered vllm endpoint.
        effectiveEndpointUrl = assignedProvider.vllm_endpoint_url;
        if (assignedProvider.wg_mesh_ip) {
          const wgPort = (assignedProvider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
          effectiveEndpointUrl = `http://${assignedProvider.wg_mesh_ip}:${wgPort}`;
        }
      }

      const proxyResult = await proxyToProvider({
        endpointUrl: effectiveEndpointUrl,
        modelId: routedModelId,
        messages,
        maxTokens,
        temperature,
        stream: wantsStream,
        tools,
        toolChoice,
        passthroughBody,
        providerCachedModels: assignedProvider.cached_models,
        engineType: assignedProvider._selectedEngine?.engine_type || null,
      });

      const debitAndReturnProxyResult = (resultBody, providerForUsage) => {
        setProviderRouteEvidenceHeaders(res, {
          provider: providerForUsage,
          requestedModelId: modelReq.model_id,
          routedModelId: resultBody?.model || routedModelId,
        });
        const usageForResponse = withPromptCacheUsage(withUsdUsagePricing(resultBody?.usage || {}, tokenRateHalala, { in: inRateHalalaPer1m, out: outRateHalalaPer1m }));
        // Record as a job so it shows in provider dashboard + recent jobs.
        // Migration 021: the jobs row + provider/renter totals are now written
        // ATOMICALLY by settleInferenceOnce (via debitAndPersistUsage jobMeta),
        // in the same transaction as the renter-debit + provider-credit +
        // usage_events. The standalone job INSERT + totals UPDATEs that used to
        // live here are removed to avoid double-crediting.
        const proxySnapshot = toUsageSnapshot(usageForResponse);
        let proxyJobMeta = null;
        try {
          const proxyJobId = normalizeString(resultBody?.id, { maxLen: 200 }) || `proxy-${meteringRequestId}`;
          const proxyNow = new Date().toISOString();
          const proxyCompletionTokens = proxySnapshot.completionTokens || 0;
          // Extract response text for job result storage. Save ONLY the final
          // assistant `content` — never the model's internal `reasoning` /
          // `reasoning_content`. With thinking models (qwen3:4b, etc.) and a
          // small max_tokens budget, the model can burn the entire budget on
          // internal monologue and return zero content; in that case we
          // deliberately persist an empty response rather than dumping a wall
          // of "Hmm, the user is asking..." into the renter's playground. The
          // renter sees an empty response as a signal to bump max_tokens. The
          // live response body shipped to the renter is independently merged
          // at L1402-1409 so callers still see whatever the model produced.
          const proxyResponseText = resultBody?.choices?.[0]?.message?.content || '';

          // Tokens/sec — Ollama's OpenAI-compat /v1 endpoint strips the
          // llama.cpp `timings` block, so `timings.predicted_per_second` is
          // almost always undefined. Fall back to wall-clock: the elapsed
          // time from proxy start to end is a tight upper bound on inference
          // time (it includes a tiny TLS+proxy hop) and gives renters a
          // useful number instead of "0 tok/s" on every history detail page.
          const wallSeconds = Math.max(0.001, (Date.parse(proxyNow) - Date.parse(proxyStartedAt)) / 1000);
          const reportedTps = resultBody?.timings?.predicted_per_second;
          const reportedGenMs = resultBody?.timings?.predicted_ms;
          const tokensPerSecond = reportedTps && reportedTps > 0
            ? reportedTps
            : (proxyCompletionTokens > 0 ? +(proxyCompletionTokens / wallSeconds).toFixed(2) : 0);
          const genTimeS = reportedGenMs ? reportedGenMs / 1000 : +wallSeconds.toFixed(3);

          const proxyResultJson = JSON.stringify({
            type: 'llm_inference',
            prompt: messages?.[messages.length - 1]?.content || '',
            response: proxyResponseText.slice(0, 10000),
            model: resultBody?.model || modelReq.model_id,
            tokens_generated: proxyCompletionTokens,
            tokens_per_second: tokensPerSecond,
            gen_time_s: genTimeS,
            total_time_s: genTimeS,
            device: providerForUsage?.gpu_model || 'GPU',
          });
          // P3 cosmetic: persist duration_seconds (rounded wall-clock) so the
          // Mission Control job listings show a real duration instead of null.
          proxyJobMeta = {
            jobId: proxyJobId,
            submittedAt: proxyStartedAt,
            startedAt: proxyStartedAt,
            completedAt: proxyNow,
            durationSeconds: Math.max(0, Math.round(wallSeconds)),
            result: proxyResultJson,
            notes: 'v1:proxy:chat/completions',
          };
        } catch (jobMetaErr) {
          console.warn('[v1/chat/completions] proxy job meta build failed:', jobMetaErr?.message);
        }
        debitAndPersistUsage({
          providerForUsage,
          providerResponseId: normalizeString(resultBody?.id, { maxLen: 200 }),
          usage: usageForResponse,
          // SITE-15: pass the renter-VISIBLE answer for the no-bill check. The
          // reasoning->content merge runs ~12 lines below (L2887-2896), so at
          // this point message.content may be empty while `reasoning` holds the
          // real answer — count reasoning as a real answer so we never no-bill a
          // completion the renter actually receives.
          responseContent: (resultBody?.choices?.[0]?.message?.content
            || resultBody?.choices?.[0]?.message?.reasoning
            || ''),
          finishReason: resultBody?.choices?.[0]?.finish_reason || null,
          jobMeta: proxyJobMeta,
        });
        recordPromptCacheMeasurementOnce(normalizeString(resultBody?.id, { maxLen: 200 }));
        inferenceTracker.trackComplete(meteringRequestId, {
          promptTokens: usageForResponse.prompt_tokens || 0,
          completionTokens: usageForResponse.completion_tokens || 0,
          costHalala: proxySnapshot.costHalala,
        });
        // Merge Ollama reasoning tokens into content when content is empty
        // (Ollama ignores think:false in /v1 endpoint, puts all text in reasoning field)
        if (Array.isArray(resultBody?.choices)) {
          for (const choice of resultBody.choices) {
            const msg = choice?.message;
            if (msg && (!msg.content || msg.content === '') && msg.reasoning) {
              msg.content = msg.reasoning;
              delete msg.reasoning;
            }
          }
        }
        const finalBody = {
          ...resultBody,
          usage: usageForResponse,
        };
        // Invisibility: overwrite the engine-revealing system_fingerprint
        // (e.g. "fp_ollama") with the neutral DCP value on this proxied body.
        neutralizeEngineFingerprint(finalBody);
        // H6 — cache successful proxy responses keyed by Idempotency-Key so
        // a retry within the TTL replays without re-billing.
        if (idempotencyKey) {
          settleIdempotencyEntry(req.renter.id, idempotencyKey, {
            response: finalBody,
            statusCode: 200,
          });
        }
        return res.json(finalBody);
      };

      const writeStreamingResponse = async (streamResponse, providerForUsage, suppressReasoning = false) => {
        if (!streamResponse?.body) {
          throw new Error('Provider streaming response missing body');
        }
        // Stateful <think> stripper for the inline-tag case (e.g. llama.cpp),
        // shared across all SSE chunks so a tag split on a boundary is handled.
        const stripStreamThink = createStreamingThinkStripper();

        const startedAt = Date.now();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        setProviderRouteEvidenceHeaders(res, {
          provider: providerForUsage,
          requestedModelId: modelReq.model_id,
          routedModelId,
        });
        if (res.flushHeaders) res.flushHeaders();

        let providerResponseId = null;
        let finalUsage = null;
        let completionText = '';
        let streamFinishReason = null; // SITE-15: last non-null finish_reason seen across chunks
        let sseBuffer = '';
        let doneWritten = false;

        const writeDoneOnce = () => {
          if (doneWritten) return;
          doneWritten = true;
          res.write('data: [DONE]\n\n');
        };

        const processSseBuffer = (flushPartial = false) => {
          const lines = sseBuffer.split('\n');
          sseBuffer = flushPartial ? '' : (lines.pop() || '');
          if (lines.length === 0) return '';

          const transformedLines = [];
          for (const rawLine of lines) {
            const line = rawLine.trimEnd();
            if (!line.startsWith('data:')) {
              transformedLines.push(rawLine);
              continue;
            }
            const payload = line.slice(5).trim();
            if (!payload) {
              transformedLines.push(rawLine);
              continue;
            }
            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              if (parsed && typeof parsed.id === 'string' && parsed.id.trim()) {
                providerResponseId = parsed.id.trim().slice(0, 200);
              }
              // Streaming reasoning normalizer. When reasoning is disabled, drop
              // the separated reasoning field (Ollama `reasoning`, native
              // `thinking`, vLLM `reasoning_content`) and strip inline <think>
              // spans so renter-visible `content` is reasoning-free. When opted
              // in, canonicalize the field name to `reasoning_content`.
              if (parsed && Array.isArray(parsed.choices)) {
                for (const choice of parsed.choices) {
                  const d = choice?.delta;
                  if (!d || typeof d !== 'object') continue;
                  if (suppressReasoning) {
                    delete d.reasoning;
                    delete d.reasoning_content;
                    delete d.thinking;
                    if (typeof d.content === 'string' && d.content) {
                      d.content = stripStreamThink(d.content);
                    }
                  } else {
                    canonicalizeReasoningField(d);
                  }
                }
              }
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                completionText += delta;
                inferenceTracker.trackTokens(meteringRequestId, 1);
              }
              // SITE-15: remember the terminal finish_reason so an empty stream
              // that stopped on 'length' (over-reasoned) is not billed below.
              const chunkFinishReason = parsed?.choices?.[0]?.finish_reason;
              if (typeof chunkFinishReason === 'string' && chunkFinishReason) {
                streamFinishReason = chunkFinishReason;
              }
              if (parsed && parsed.usage && typeof parsed.usage === 'object') {
                const usageWithPricing = withPromptCacheUsage(withUsdUsagePricing(parsed.usage, tokenRateHalala, { in: inRateHalalaPer1m, out: outRateHalalaPer1m }));
                parsed.usage = usageWithPricing;
                finalUsage = usageWithPricing;
              }
              // Invisibility: the engine stamps system_fingerprint on each SSE
              // chunk too (e.g. "fp_ollama"). Overwrite with the neutral DCP
              // value before re-serializing so no chunk leaks the engine.
              neutralizeEngineFingerprint(parsed);
              transformedLines.push(`data: ${JSON.stringify(parsed)}`);
            } catch (_) {
              transformedLines.push(rawLine);
            }
          }

          return transformedLines.length > 0 ? `${transformedLines.join('\n')}\n` : '';
        };

        const transformSseText = (chunkText) => {
          sseBuffer += chunkText;
          return processSseBuffer(false);
        };

        try {
          const body = streamResponse.body;
          if (typeof body[Symbol.asyncIterator] === 'function') {
            for await (const chunk of body) {
              const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              const transformed = transformSseText(bufferChunk.toString('utf8'));
              if (transformed) res.write(transformed);
            }
          } else if (typeof body.getReader === 'function') {
            const reader = body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value) continue;
              const bufferChunk = Buffer.from(value);
              const transformed = transformSseText(bufferChunk.toString('utf8'));
              if (transformed) res.write(transformed);
            }
          } else {
            throw new Error('Unsupported provider stream body');
          }

          const trailing = processSseBuffer(true);
          if (trailing) res.write(trailing);

          // Default stream mode: many providers (Ollama, llama.cpp, some vLLM
          // configs without stream_options.include_usage) never send a usage
          // block, so finalUsage stays null and the client gets no token/cost
          // numbers. Synthesize a final usage chunk from estimated tokens +
          // priced cost so the playground meter shows real USD/SAR, and so the
          // downstream debit/snapshot bills against the same numbers. Only fires
          // when the provider omitted usage (finalUsage still null).
          if (!finalUsage) {
            const synthPromptTokens = promptTokens;
            const synthCompletionTokens = approximateTokenCount(completionText);
            const synthUsage = withPromptCacheUsage(withUsdUsagePricing(
              {
                prompt_tokens: synthPromptTokens,
                completion_tokens: synthCompletionTokens,
                total_tokens: synthPromptTokens + synthCompletionTokens,
              },
              tokenRateHalala,
              { in: inRateHalalaPer1m, out: outRateHalalaPer1m }
            ));
            finalUsage = synthUsage;
            try {
              const usageChunk = {
                id: providerResponseId || `stream-${meteringRequestId}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelReq.model_id,
                system_fingerprint: DCP_SYSTEM_FINGERPRINT,
                choices: [],
                usage: synthUsage,
              };
              res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
            } catch (synthErr) {
              console.warn('[v1/stream] synthetic usage chunk write failed:', synthErr?.message);
            }
          }

          // Record streaming job for provider dashboard.
          // Migration 021: the jobs row + provider/renter totals are now written
          // ATOMICALLY by settleInferenceOnce (via debitAndPersistUsage jobMeta),
          // in the same transaction as the renter-debit + provider-credit +
          // usage_events. The standalone job INSERT + totals UPDATEs that used to
          // live here are removed to avoid double-crediting.
          const streamSnapshot = toUsageSnapshot(finalUsage || {}, completionText);
          let streamJobMeta = null;
          try {
            const streamNow = new Date().toISOString();
            // P3 cosmetic: persist duration_seconds so streaming jobs are no
            // longer null in Mission Control. `startedAt` (epoch ms) was
            // captured at the top of writeStreamingResponse for SSE timing.
            streamJobMeta = {
              jobId: providerResponseId || `stream-${meteringRequestId}`,
              submittedAt: streamNow,
              startedAt: streamNow,
              completedAt: streamNow,
              durationSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
              result: null,
              notes: 'v1:proxy:stream',
            };
          } catch (streamJobErr) {
            console.warn('[v1/stream] proxy job meta build failed:', streamJobErr?.message);
          }
          debitAndPersistUsage({
            providerForUsage,
            providerResponseId,
            usage: finalUsage || {},
            completionText,
            // SITE-15: completionText is already the renter-visible (post-strip)
            // answer for the stream path; finish_reason from the terminal chunk
            // gates the no-bill check.
            finishReason: streamFinishReason,
            jobMeta: streamJobMeta,
          });
          recordPromptCacheMeasurementOnce(providerResponseId);
          inferenceTracker.trackComplete(meteringRequestId, {
            promptTokens: finalUsage?.prompt_tokens || promptTokens,
            completionTokens: finalUsage?.completion_tokens || approximateTokenCount(completionText),
            costHalala: streamSnapshot.costHalala,
          });
          writeDoneOnce();
          res.end();
          recordStreamOutcome(db, {
            providerId: providerForUsage?.id || null,
            providerTier: resolveProviderTier(providerForUsage),
            modelId: modelReq.model_id,
            success: true,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          inferenceTracker.trackError(meteringRequestId, error?.message || 'stream_error');
          persistFailureUsageBestEffort({
            providerForUsage,
            providerResponseId,
            usage: finalUsage || { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
            completionText,
          });
          recordStreamOutcome(db, {
            providerId: providerForUsage?.id || null,
            providerTier: resolveProviderTier(providerForUsage),
            modelId: modelReq.model_id,
            success: false,
            errorCode: normalizeString(error?.message || 'stream_error', { maxLen: 120 }),
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      };

      if (wantsStream && proxyResult.streamResponse) {
        await writeStreamingResponse(proxyResult.streamResponse, assignedProvider, proxyResult.suppressReasoning);
        return;
      }

      if (proxyResult.body) {
        return debitAndReturnProxyResult(proxyResult.body, assignedProvider);
      }

      // If selected provider endpoint exists but failed to produce a valid payload,
      // retry once through other capable providers before returning upstream failure.
      const fallbackCapable = fallbackProviders
        .filter((provider) => provider.id !== assignedProvider.id
          && (provider.vllm_endpoint_url || provider._selectedEngine?.base_url))
        .slice(0, 2);

      for (const fallbackProvider of fallbackCapable) {
        const fallbackProxyModel = resolveProviderRoutingModel({
          requestedModelId: modelReq.model_id,
          providerVramMb: resolveProviderVramMb(fallbackProvider),
        });
        if (!fallbackProxyModel.eligible) continue;

        // H3 — skip fallback providers that are already serving traffic
        // rather than stacking onto a busy Ollama instance.
        if (!tryAcquireSlot(fallbackProvider.id)) continue;

        // Multi-engine routing (migration 015): honor the selected engine's
        // base_url when present, else fall back to the legacy path.
        let fallbackEffectiveUrl;
        if (fallbackProvider._selectedEngine && fallbackProvider._selectedEngine.base_url) {
          fallbackEffectiveUrl = fallbackProvider._selectedEngine.base_url;
        } else {
          // H5 routing preference: prefer WG mesh IP for fallback too.
          fallbackEffectiveUrl = fallbackProvider.vllm_endpoint_url;
          if (fallbackProvider.wg_mesh_ip) {
            const fbPort = (fallbackProvider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
            fallbackEffectiveUrl = `http://${fallbackProvider.wg_mesh_ip}:${fbPort}`;
          }
        }

        const fallbackResult = await proxyToProvider({
          endpointUrl: fallbackEffectiveUrl,
          modelId: fallbackProxyModel.proxyModelId,
          messages,
          maxTokens,
          temperature,
          stream: wantsStream,
          tools,
          toolChoice,
          passthroughBody,
          providerCachedModels: fallbackProvider.cached_models,
          engineType: fallbackProvider._selectedEngine?.engine_type || null,
        });

        if (fallbackResult.proxyError) continue;

        if (wantsStream && fallbackResult.streamResponse) {
          await writeStreamingResponse(fallbackResult.streamResponse, fallbackProvider, fallbackResult.suppressReasoning);
          return;
        }

        if (fallbackResult.body) {
          return debitAndReturnProxyResult(fallbackResult.body, fallbackProvider);
        }
      }

      persistFailureUsageBestEffort({
        providerForUsage: assignedProvider,
        usage: { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
      });
      const isUpstreamTimeout = proxyResult.proxyError === 'timeout';
      return sendV1Error(res, {
        status: isUpstreamTimeout ? 504 : 503,
        type: isUpstreamTimeout ? 'timeout_error' : 'upstream_error',
        code: isUpstreamTimeout ? 'upstream_timeout' : 'provider_unavailable',
        message: proxyResult.proxyError
          ? `Provider failover exhausted after initial error: ${proxyResult.proxyError}`
          : 'Provider failover exhausted',
      });
    }

    // Fallback: create job in queue (non-streaming only for job-based flow)
    const now = new Date().toISOString();
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setProviderRouteEvidenceHeaders(res, {
      provider: assignedProvider,
      requestedModelId: modelReq.model_id,
      routedModelId: modelReq.model_id,
    });

    const containerSpec = {
      image_type: 'vllm-serve',
      image: 'dcp/vllm-serve:latest',
      model_id: modelReq.model_id,
      vram_required_mb: effectiveMinVramMb,
      gpu_count: 1,
      compute_type: 'inference',
    };

    try {
      // Do not debit or reserve balance here. The pre-flight gate above only
      // decides whether to dispatch; the single money write happens after the
      // queued job completes via debitAndPersistUsage -> settleInferenceOnce.
      // Pre-debiting here double-charges successful queued jobs and leaves
      // failed/timeout jobs without a route-local refund.
      db.prepare(
        `INSERT INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
          duration_minutes, cost_halala, gpu_requirements, container_spec, max_duration_seconds,
          notes, created_at, updated_at, priority)
         VALUES (?, ?, ?, 'vllm', ?, 'pending', ?, ?, ?, ?, ?, 300, 'v1:chat/completions', ?, ?, 8)`
      ).run(
        jobId, assignedProvider.id, req.renter.id, modelReq.model_id, now,
        durationMinutes, estimatedCostHalala,
        JSON.stringify({ min_vram_gb: modelReq.min_vram_gb }),
        JSON.stringify(containerSpec), now, now
      );
    } catch (error) {
      persistFailureUsageBestEffort({
        providerForUsage: assignedProvider,
        providerResponseId: `chatcmpl-${jobId}`,
        usage: { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
      });
      return sendV1Error(res, {
        status: 500,
        type: 'server_error',
        code: 'internal_error',
        message: 'Failed to submit inference job',
        retryable: false,
      });
    }

    // Poll for completion (max 5 minutes)
    const POLL_MS = 1500;
    const TIMEOUT_MS = 300000;
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      const job = db.get('SELECT * FROM jobs WHERE job_id = ?', jobId);
      if (!job) break;

      if (job.status === 'completed') {
        const text = job.result_text || '';
        const cTokens = job.completion_tokens || approximateTokenCount(text);
        const usage = withUsdUsagePricing(
          { prompt_tokens: promptTokens, completion_tokens: cTokens, total_tokens: promptTokens + cTokens },
          tokenRateHalala,
          { in: inRateHalalaPer1m, out: outRateHalalaPer1m }
        );
        const completionId = `chatcmpl-${jobId}`;

        // If streaming was requested, simulate SSE from completed text
        if (wantsStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          if (res.flushHeaders) res.flushHeaders();

          // Send content in small chunks
          const chunkSize = 20;
          for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            const payload = {
              id: completionId, object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000), model: modelReq.model_id,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
            };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
          res.write(`data: ${JSON.stringify({
            id: completionId, object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000), model: modelReq.model_id,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage,
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          debitAndPersistUsage({
            providerForUsage: assignedProvider,
            providerResponseId: completionId,
            usage,
            // SITE-15: queued job text is the final visible answer (jobs table has
            // no separate reasoning column — verified). The synthetic terminal
            // chunk above reports finish_reason 'stop', so a non-empty answer
            // always bills; an empty result_text is inferred as 'length' and
            // no-billed. (job.finish_reason is not a real column today, so the
            // `||` always falls through to the text inference — harmless.)
            responseContent: text,
            finishReason: job.finish_reason || (text && text.trim() ? 'stop' : 'length'),
          });
          return res.end();
        }

        debitAndPersistUsage({
          providerForUsage: assignedProvider,
          providerResponseId: completionId,
          usage,
          // SITE-15: same non-answer guard for the non-streaming queued response.
          // jobs has no reasoning column, so `text` is the full visible answer.
          responseContent: text,
          finishReason: job.finish_reason || (text && text.trim() ? 'stop' : 'length'),
        });
        return res.json({
          id: completionId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelReq.model_id,
          system_fingerprint: DCP_SYSTEM_FINGERPRINT,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          }],
          usage,
        });
      }

      if (['failed', 'cancelled', 'permanently_failed', 'timed_out'].includes(job.status)) {
        persistFailureUsageBestEffort({
          providerForUsage: assignedProvider,
          providerResponseId: `chatcmpl-${jobId}`,
          usage: { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
        });
        return sendV1Error(res, {
          status: 503,
          type: 'upstream_error',
          code: 'provider_unavailable',
          message: `Inference ${job.status}: ${job.error || 'unknown'}`,
        });
      }

      await new Promise(r => setTimeout(r, POLL_MS));
    }

    persistFailureUsageBestEffort({
      providerForUsage: assignedProvider,
      providerResponseId: `chatcmpl-${jobId}`,
      usage: { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens },
    });
    inferenceTracker.trackError(meteringRequestId, 'upstream_timeout');
    return sendV1Error(res, {
      status: 504,
      type: 'timeout_error',
      code: 'upstream_timeout',
      message: 'Inference did not complete within timeout',
    });

  } catch (error) {
    if (typeof persistFailureUsageBestEffort === 'function') {
      persistFailureUsageBestEffort();
    }
    inferenceTracker.trackError(meteringRequestId, error?.message || 'internal_error');
    console.error('[v1/chat/completions] Error:', error);
    return sendV1Error(res, {
      status: 500,
      type: 'server_error',
      code: 'internal_error',
      message: 'Internal server error',
      retryable: false,
    });
  } finally {
    // H3 — always release any in-flight slots we acquired, even on early
    // return / thrown error / streaming-write failures. Without this the
    // counter would leak and the provider would appear permanently busy.
    for (const id of acquiredSlots) releaseProviderSlot(id);
    acquiredSlots.clear();
  }
});

// Export router as default + demand tracking for admin endpoints
router.getAllDemand = getAllDemand;
router.getModelDemand = getModelDemand;
module.exports = router;
// Shared cross-route contract — deliberately reused by routes/anthropic.js so
// the renter-facing Anthropic surface authenticates and routes EXACTLY like
// /v1/chat/completions (one auth path, one provider-resolution path).
module.exports.shared = {
  requireAuth,
  lookupProviderEnginesForModel,
};
// Test-only export — internal helpers exposed for unit testing. NOT part of
// the public router contract; do not depend on this from production code.
module.exports.__test = {
  renderMessageContentForEstimate,
  estimatePromptFromMessages,
  approximateTokenCount,
  VISION_IMAGE_TOKEN_ESTIMATE,
  normalizeMessagesForUpstream,
  // Multi-engine routing (migration 015)
  lookupProviderEnginesForModel,
  getCapableProviders,
  isMultiEngineRoutingEnabled,
  buildProviderChatCompletionsUrl,
  // Earned-state routing policy (backlog #2)
  resolveEarnedRoutingMode,
  applyEarnedRoutingPolicy,
  // Engine-keyed reasoning control
  resolveEngineType,
  isThinkingCapableModel,
  modelHonorsNoThink,
  injectNoThinkDirective,
  canonicalizeReasoningField,
  stripReasoningFromObject,
  createStreamingThinkStripper,
  stripThinkBlocks,
  proxyToProvider,
  // Invisibility — engine fingerprint neutralization
  neutralizeEngineFingerprint,
  DCP_SYSTEM_FINGERPRINT,
};
