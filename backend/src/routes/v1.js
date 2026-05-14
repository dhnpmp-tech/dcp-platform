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
} = rateLimiterMiddleware;
const { toCatalogContractCore, toUsdStringFromHalala } = require('../lib/model-catalog-contract');
const { deduplicateModelAliases, DASH_TO_CANONICAL } = require('../lib/model-aliases');
const { recordOpenRouterUsage } = require('../services/openrouterSettlementService');
const inferenceTracker = require('../services/inferenceTracker');
const {
  selectProvidersWithLatencyGate,
  recordStreamOutcome,
  resolveProviderTier,
} = require('../services/inferenceLatencyBudgetGate');
const { looksLikeProviderKey } = require('../middleware/auth');
const { classifyRequest } = require('../lib/request-classifier');

const router = express.Router();
const VLLM_COMPATIBILITY_MATRIX_PATH = path.join(__dirname, '../../../infra/vllm-configs/compatibility-matrix.json');
const TOKEN_RATE_BILLING_UNIT_TOKENS = 1_000_000;
const DEFAULT_TOKEN_RATE_HALALA = 19;

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
      return dbInstance.all(`
        SELECT cached_models, gpu_model, vram_mb
        FROM providers
        WHERE status = 'online'
          AND COALESCE(is_paused, 0) = 0
          AND deleted_at IS NULL
          AND last_heartbeat > datetime('now', '-120 seconds')
      `);
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
    try { scopes = JSON.parse(scopedKey.scopes || '[]'); } catch (_) {}
    if (!scopes.includes('inference') && !scopes.includes('admin')) {
      return sendV1Error(res, {
        status: 403,
        type: 'authentication_error',
        code: 'authentication_scope_missing',
        message: 'API key does not have inference scope',
        retryable: false,
      });
    }
    try { db.prepare('UPDATE renter_api_keys SET last_used_at = ? WHERE id = ?').run(now, scopedKey.id); } catch (_) {}
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

// ── GET /v1/models — OpenAI-compatible model list ──────────────────────────

router.get('/models', (req, res) => {
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

    // Count online providers per model by checking cached_models
    const onlineProviders = db.all(
      `SELECT cached_models, vram_mb FROM providers
       WHERE status = 'online' AND COALESCE(is_paused, 0) = 0
         AND deleted_at IS NULL AND vllm_endpoint_url IS NOT NULL`
    );
    const providerCountByModel = new Map();
    for (const p of onlineProviders) {
      const cached = parseCachedModels(p.cached_models);
      for (const m of cached) {
        providerCountByModel.set(m, (providerCountByModel.get(m) || 0) + 1);
      }
      // Also count by VRAM eligibility — if no cached_models, count for models fitting VRAM
      if (cached.length === 0 && p.vram_mb > 0) {
        providerCountByModel.set('__vram_' + p.vram_mb, (providerCountByModel.get('__vram_' + p.vram_mb) || 0) + 1);
      }
    }

    const data = (rows || []).map((row) => {
      // Match provider count: check if any online provider has this model cached
      const modelLower = (row.model_id || '').toLowerCase().trim();
      let pCount = providerCountByModel.get(modelLower) || 0;
      // Also check partial matches (e.g., "qwen3-8b" matches cached "qwen3:8b")
      if (pCount === 0) {
        for (const [cached, count] of providerCountByModel) {
          if (cached.includes(modelLower) || modelLower.includes(cached)) {
            pCount = Math.max(pCount, count);
          }
        }
      }
      const contractCore = toCatalogContractCore({
        model: row,
        providerCount: pCount,
        maxVramGb: Number(row.vram_gb || row.min_gpu_vram_gb || 0),
        created: nowSecs,
      });
      const tokenRateHalala = tokenRateByModel.get(row.model_id) ?? tokenRateByModel.get('__default__') ?? DEFAULT_TOKEN_RATE_HALALA;
      const usdPerToken = toUsdStringFromHalala(tokenRateHalala / TOKEN_RATE_BILLING_UNIT_TOKENS);
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
      return {
        ...contractCore,
        object: 'model',
        owned_by: 'dc1-platform',
        permission: [],
        root: row.model_id,
        parent: null,
        description: buildModelDescription(row, contractCore),
        pricing: {
          prompt_tokens: usdPerToken,
          completion_tokens: usdPerToken,
          usd_per_minute: contractCore.pricing.usd_per_minute,
          usd_per_1m_input_tokens: contractCore.pricing.usd_per_1m_input_tokens,
          usd_per_1m_output_tokens: contractCore.pricing.usd_per_1m_output_tokens,
        },
        architecture,
        endpoints: [{ url: endpointUrl, type: 'chat' }],
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

const PROVIDER_HEARTBEAT_STALE_MS = 10 * 60 * 1000;
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

function getCapableProviders(minVramMb, requestedModelId) {
  const providers = db.all(
    `SELECT * FROM providers
     WHERE status = 'online' AND COALESCE(is_paused, 0) = 0
       AND deleted_at IS NULL
       AND vllm_endpoint_url IS NOT NULL AND vllm_endpoint_url != ''`
  );
  const nowMs = Date.now();
  const capable = [];
  const requestedLower = requestedModelId
    ? String(requestedModelId).toLowerCase().trim()
    : null;
  for (const p of providers) {
    const hbMs = p.last_heartbeat ? Date.parse(p.last_heartbeat) : NaN;
    if (Number.isFinite(hbMs) && (nowMs - hbMs) > PROVIDER_HEARTBEAT_STALE_MS) continue;
    // Audit C3 — backend-side reachability probe. The probe writes 0 when the
    // provider's vllm_endpoint_url is unreachable from this VPS even though
    // its daemon heartbeats fine (e.g. dead Cloudflare tunnel). Treat NULL
    // (never probed yet) as reachable so newly registered providers can serve
    // immediately while the next probe pass classifies them.
    if (p.endpoint_reachable === 0) continue;
    if (!parseComputeTypes(p.supported_compute_types).has('inference')) continue;
    if (resolveProviderVramMb(p) < minVramMb) continue;
    if (requestedLower) {
      const cached = parseCachedModels(p.cached_models);
      // Backward-compat: if the provider reports no cached_models at all,
      // fall through (we don't know what they have, so don't exclude).
      if (cached.length > 0) {
        const hasModel = cached.some((m) =>
          m === requestedLower ||
          m.includes(requestedLower) ||
          requestedLower.includes(m)
        );
        // Loose-match fallback: handle the case where the requested id
        // differs from the cached id only in punctuation / quant suffix.
        // Example: requested "qwen3:30b-a3b" vs cached
        // "qwen/qwen3-30b-a3b-gptq-int4" — colon-vs-slash breaks substring
        // match, but they refer to the same model.
        const looseKey = (s) =>
          String(s)
            .toLowerCase()
            .replace(/[\/:_\-\s.]/g, '')
            .replace(/(gptq|awq|gguf|int4|int8|fp16|fp8|bf16|q4km|q4ks|q5km|q5ks|q6k|q8|km|ks)/g, '');
        const wantLoose = looseKey(requestedLower);
        const hasLoose = wantLoose.length >= 4 && cached.some((m) => {
          const c = looseKey(m);
          return c && (c === wantLoose || c.includes(wantLoose) || wantLoose.includes(c));
        });
        if (!hasModel && !hasLoose) continue;
      }
    }
    capable.push(p);
  }
  return capable;
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
    const row = db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      modelId
    ) || db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      '__default__'
    );
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

function estimatePromptFromMessages(messages) {
  return messages.map(m => `${m.role}: ${m.content}`).join('\n');
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
    },
  };
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

function endpointLooksOllamaForThinking(endpointUrl) {
  if (!endpointUrl) return false;
  const raw = String(endpointUrl);
  return raw.includes(':11434') || /ollama/i.test(raw);
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

  // Engine + model-family detection for thinking-disable injection.
  // Thinking-capable models (Qwen3, QwQ, DeepSeek-R1) emit <think>...</think>
  // by default. Each engine needs a different knob to turn that off:
  //   - Ollama (/v1/chat/completions on :11434): top-level `think: false`
  //   - vLLM:                                    `chat_template_kwargs.enable_thinking: false`
  // The renter can opt back IN by passing `enable_thinking: true` or
  // `chat_template_kwargs.enable_thinking: true` in the request body
  // (both are now in the passthrough whitelist).
  const _endpointIsOllamaLike = endpointLooksOllamaForThinking(endpointUrl);
  const _modelIsThinkingCapable = isThinkingCapableModel(effectiveModelId);
  const _userTplKwargs = (passthroughBody && typeof passthroughBody.chat_template_kwargs === 'object')
    ? passthroughBody.chat_template_kwargs
    : null;
  const _userEnableThinkingOptIn =
    passthroughBody?.enable_thinking === true ||
    _userTplKwargs?.enable_thinking === true;
  const _shouldDisableThinking = _modelIsThinkingCapable && !_userEnableThinkingOptIn;

  const body = { model: effectiveModelId, messages, max_tokens: maxTokens, temperature, stream: !!stream, ...passthroughBody };
  if (_shouldDisableThinking) {
    if (_endpointIsOllamaLike) {
      body.think = false;
    } else {
      // Merge with any user-provided chat_template_kwargs (e.g. tools_in_user_message)
      body.chat_template_kwargs = { ..._userTplKwargs, enable_thinking: false };
    }
  } else if (_endpointIsOllamaLike && !_modelIsThinkingCapable) {
    // Preserve historic behavior for non-thinking models on Ollama: it
    // doesn't hurt and matches the prior unconditional `think: false`.
    body.think = false;
  }
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
  // If streaming, return the raw response for pipe-through
  if (stream) return { streamResponse: response };
  let parsed;
  try { parsed = await response.json(); } catch (_) {
    return { proxyError: 'invalid_response', detail: 'Provider returned non-JSON body' };
  }
  // Belt-and-suspenders: strip <think>...</think> from the response when
  // thinking should have been disabled. Covers the case where a provider
  // engine doesn't recognize the disable knob (e.g. an older vLLM, or a
  // future engine we haven't tested), or the model emits thinking tags
  // anyway. No-op when no tags are present, so safe for every response.
  if (_shouldDisableThinking && parsed && Array.isArray(parsed.choices)) {
    for (const choice of parsed.choices) {
      if (choice?.message && typeof choice.message.content === 'string') {
        choice.message.content = stripThinkBlocks(choice.message.content);
      }
      if (choice?.delta && typeof choice.delta.content === 'string') {
        choice.delta.content = stripThinkBlocks(choice.delta.content);
      }
    }
  }
  return { body: parsed };
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

    // Prepare messages — support tool_calls in assistant msgs and tool role msgs
    const messages = [];
    for (const entry of messagesRaw.slice(0, 100)) {
      const role = normalizeString(entry?.role, { maxLen: 20 }) || 'user';
      const msg = { role: role.toLowerCase() };

      // Tool call results (role: "tool")
      if (msg.role === 'tool' && entry.tool_call_id) {
        msg.tool_call_id = String(entry.tool_call_id);
        msg.content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content || '');
        messages.push(msg);
        continue;
      }

      // Assistant messages with tool_calls
      if (msg.role === 'assistant' && Array.isArray(entry.tool_calls)) {
        msg.content = entry.content || '';
        msg.tool_calls = entry.tool_calls.map(tc => ({
          id: tc.id || `call_${crypto.randomBytes(8).toString('hex')}`,
          type: 'function',
          function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '{}' },
        }));
        messages.push(msg);
        continue;
      }

      // Regular messages
      const content = normalizeString(entry?.content, { maxLen: 20000, trim: false });
      if (!content) continue;
      msg.content = content;
      messages.push(msg);
    }

    if (messages.length === 0) {
      return sendV1Error(res, {
        status: 400,
        type: 'invalid_request_error',
        code: 'invalid_request_messages_empty',
        message: 'messages must include at least one non-empty content string',
        retryable: false,
      });
    }

    const maxTokens = toFiniteInt(req.body?.max_tokens, { min: 1, max: 8192 }) || 512;
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

    const gateSelection = selectProvidersWithLatencyGate({
      db,
      providers: freeProviders,
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
    const durationMinutes = Math.max(1, Math.ceil(maxTokens / 350));
    const estimatedCostHalala = Math.max(1, Math.round(durationMinutes * modelReq.fallback_rate_halala_per_min));
    const tokenRateHalala = resolveTokenRateHalala(modelReq.model_id);
    // Migration 011: prefer per-1M in/out rates from model_registry. Falls
    // back to legacy `tokenRateHalala` applied symmetrically when null.
    const modelRegRates = resolveModelRegistryRates(modelReq.model_id);
    const inRateHalalaPer1m = modelRegRates.in;
    const outRateHalalaPer1m = modelRegRates.out;
    const meteringRequestId = extractRequestId(req);
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
          console.error('[v1/chat/completions] usage_events insert failed:', msg);
        }
      }
      usagePersisted = true;
    };

    const debitRenterSafe = (costHalala) => {
      try {
        db.prepare('UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ? WHERE id = ? AND balance_halala >= ?')
          .run(costHalala, new Date().toISOString(), req.renter.id, costHalala);
      } catch (_) { /* best-effort */ }
    };

    const debitAndPersistUsage = ({ providerForUsage, providerResponseId = null, usage, completionText = '' }) => {
      const snapshot = toUsageSnapshot(usage, completionText);
      runUsageTransaction(() => {
        debitRenterSafe(snapshot.costHalala);
        persistUsageOnce({ providerForUsage, providerResponseId, usage, completionText, settlementStatus: 'pending' });
      });
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
    if (Number(req.renter.balance_halala || 0) < estimatedCostHalala) {
      return sendV1Error(res, {
        status: 402,
        type: 'billing_error',
        code: 'billing_insufficient_balance',
        message: 'Insufficient balance',
        retryable: false,
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
      // H5 routing preference: prefer WG mesh IP when available (lower latency, more reliable)
      let effectiveEndpointUrl = assignedProvider.vllm_endpoint_url;
      if (assignedProvider.wg_mesh_ip) {
        const wgPort = (assignedProvider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
        effectiveEndpointUrl = `http://${assignedProvider.wg_mesh_ip}:${wgPort}`;
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
      });

      const debitAndReturnProxyResult = (resultBody, providerForUsage) => {
        setProviderRouteEvidenceHeaders(res, {
          provider: providerForUsage,
          requestedModelId: modelReq.model_id,
          routedModelId: resultBody?.model || routedModelId,
        });
        const usageForResponse = withUsdUsagePricing(resultBody?.usage || {}, tokenRateHalala, { in: inRateHalalaPer1m, out: outRateHalalaPer1m });
        debitAndPersistUsage({
          providerForUsage,
          providerResponseId: normalizeString(resultBody?.id, { maxLen: 200 }),
          usage: usageForResponse,
        });
        // Record as a job so it shows in provider dashboard + recent jobs
        const proxySnapshot = toUsageSnapshot(usageForResponse);
        try {
          const proxyJobId = normalizeString(resultBody?.id, { maxLen: 200 }) || `proxy-${meteringRequestId}`;
          const proxyNow = new Date().toISOString();
          const proxyPromptTokens = proxySnapshot.promptTokens || 0;
          const proxyCompletionTokens = proxySnapshot.completionTokens || 0;
          // Use per-minute rate as fallback when token rate is 0
          const proxyCostHalala = proxySnapshot.costHalala > 0
            ? proxySnapshot.costHalala
            : Math.max(1, Math.round((modelReq.fallback_rate_halala_per_min || 2) * ((proxyPromptTokens + proxyCompletionTokens) / 30)));
          const proxyProviderEarned = Math.max(1, Math.round(proxyCostHalala * 0.85));
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
          // `wallSeconds` is already computed above from proxyStartedAt/proxyNow.
          const proxyDurationSeconds = Math.max(0, Math.round(wallSeconds));
          db.prepare(
            `INSERT OR IGNORE INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
              started_at, completed_at, duration_minutes, duration_seconds, cost_halala, actual_cost_halala, provider_earned_halala,
              prompt_tokens, completion_tokens, result,
              notes, created_at, updated_at, priority)
             VALUES (?, ?, ?, 'inference', ?, 'completed', ?, ?, ?, 0, ?, ?, ?, ?,
              ?, ?, ?,
              'v1:proxy:chat/completions', ?, ?, 8)`
          ).run(
            proxyJobId, providerForUsage?.id, req.renter.id, modelReq.model_id, proxyStartedAt,
            proxyStartedAt, proxyNow, proxyDurationSeconds, proxyCostHalala, proxyCostHalala, proxyProviderEarned,
            proxyPromptTokens, proxyCompletionTokens, proxyResultJson,
            proxyNow, proxyNow
          );
          // Update provider totals
          if (providerForUsage?.id) {
            db.prepare(
              `UPDATE providers SET total_jobs = total_jobs + 1,
                total_earnings = total_earnings + ?,
                total_earnings_halala = COALESCE(total_earnings_halala, 0) + ?,
                claimable_earnings_halala = claimable_earnings_halala + ?
               WHERE id = ?`
            ).run(proxyProviderEarned / 100, proxyProviderEarned, proxyProviderEarned, providerForUsage.id);
          }
          // Update renter totals
          if (req.renter?.id) {
            db.prepare(
              `UPDATE renters SET total_spent_halala = total_spent_halala + ?, total_jobs = total_jobs + 1 WHERE id = ?`
            ).run(proxyCostHalala, req.renter.id);
          }
        } catch (jobInsertErr) {
          console.warn('[v1/chat/completions] proxy job record insert failed:', jobInsertErr?.message);
        }
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

      const writeStreamingResponse = async (streamResponse, providerForUsage) => {
        if (!streamResponse?.body) {
          throw new Error('Provider streaming response missing body');
        }

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
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                completionText += delta;
                inferenceTracker.trackTokens(meteringRequestId, 1);
              }
              if (parsed && parsed.usage && typeof parsed.usage === 'object') {
                const usageWithPricing = withUsdUsagePricing(parsed.usage, tokenRateHalala, { in: inRateHalalaPer1m, out: outRateHalalaPer1m });
                parsed.usage = usageWithPricing;
                finalUsage = usageWithPricing;
              }
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

          debitAndPersistUsage({
            providerForUsage,
            providerResponseId,
            usage: finalUsage || {},
            completionText,
          });
          // Record streaming job for provider dashboard
          const streamSnapshot = toUsageSnapshot(finalUsage || {}, completionText);
          try {
            const streamJobId = providerResponseId || `stream-${meteringRequestId}`;
            const streamNow = new Date().toISOString();
            // P3 cosmetic: persist duration_seconds so streaming jobs are no
            // longer null in Mission Control. `startedAt` (epoch ms) was
            // captured at the top of writeStreamingResponse for SSE timing.
            const streamDurationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
            const streamPromptTokens = streamSnapshot.promptTokens || 0;
            const streamCompletionTokens = streamSnapshot.completionTokens || 0;
            const streamCostHalala = streamSnapshot.costHalala > 0
              ? streamSnapshot.costHalala
              : Math.max(1, Math.round((modelReq.fallback_rate_halala_per_min || 2) * ((streamPromptTokens + streamCompletionTokens) / 30)));
            const streamProviderEarned = Math.max(1, Math.round(streamCostHalala * 0.85));
            db.prepare(
              `INSERT OR IGNORE INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
                completed_at, duration_minutes, duration_seconds, cost_halala, provider_earned_halala,
                prompt_tokens, completion_tokens,
                notes, created_at, updated_at, priority)
               VALUES (?, ?, ?, 'inference', ?, 'completed', ?, ?, 0, ?, ?, ?,
                ?, ?,
                'v1:proxy:stream', ?, ?, 8)`
            ).run(
              streamJobId, providerForUsage?.id, req.renter.id, modelReq.model_id, streamNow,
              streamNow, streamDurationSeconds, streamCostHalala, streamProviderEarned,
              streamPromptTokens, streamCompletionTokens,
              streamNow, streamNow
            );
            if (providerForUsage?.id) {
              db.prepare(
                `UPDATE providers SET total_jobs = total_jobs + 1,
                  total_earnings = total_earnings + ?,
                  claimable_earnings_halala = claimable_earnings_halala + ?
                 WHERE id = ?`
              ).run(streamProviderEarned / 100, streamProviderEarned, providerForUsage.id);
            }
            // Update renter totals
            if (req.renter?.id) {
              db.prepare(
                `UPDATE renters SET total_spent_halala = total_spent_halala + ?, total_jobs = total_jobs + 1 WHERE id = ?`
              ).run(streamCostHalala, req.renter.id);
            }
          } catch (streamJobErr) {
            console.warn('[v1/stream] proxy job record insert failed:', streamJobErr?.message);
          }
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
        await writeStreamingResponse(proxyResult.streamResponse, assignedProvider);
        return;
      }

      if (proxyResult.body) {
        return debitAndReturnProxyResult(proxyResult.body, assignedProvider);
      }

      // If selected provider endpoint exists but failed to produce a valid payload,
      // retry once through other capable providers before returning upstream failure.
      const fallbackCapable = fallbackProviders
        .filter((provider) => provider.id !== assignedProvider.id && provider.vllm_endpoint_url)
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

        // H5 routing preference: prefer WG mesh IP for fallback too
        let fallbackEffectiveUrl = fallbackProvider.vllm_endpoint_url;
        if (fallbackProvider.wg_mesh_ip) {
          const fbPort = (fallbackProvider.vllm_endpoint_url || '').match(/:(\d+)\/?$/)?.[1] || '11434';
          fallbackEffectiveUrl = `http://${fallbackProvider.wg_mesh_ip}:${fbPort}`;
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
        });

        if (fallbackResult.proxyError) continue;

        if (wantsStream && fallbackResult.streamResponse) {
          await writeStreamingResponse(fallbackResult.streamResponse, fallbackProvider);
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
      db.prepare('UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ? WHERE id = ? AND balance_halala >= ?')
        .run(estimatedCostHalala, now, req.renter.id, estimatedCostHalala);

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
          debitAndPersistUsage({ providerForUsage: assignedProvider, providerResponseId: completionId, usage });
          return res.end();
        }

        debitAndPersistUsage({ providerForUsage: assignedProvider, providerResponseId: completionId, usage });
        return res.json({
          id: completionId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelReq.model_id,
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
