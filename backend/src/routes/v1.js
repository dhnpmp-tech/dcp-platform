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

const router = express.Router();
const VLLM_COMPATIBILITY_MATRIX_PATH = path.join(__dirname, '../../../infra/vllm-configs/compatibility-matrix.json');
const TOKEN_RATE_BILLING_UNIT_TOKENS = 1_000_000;
const DEFAULT_TOKEN_RATE_HALALA = 19;

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
       AND deleted_at IS NULL`
  );
  const nowMs = Date.now();
  const capable = [];
  const requestedLower = requestedModelId
    ? String(requestedModelId).toLowerCase().trim()
    : null;
  for (const p of providers) {
    const hbMs = p.last_heartbeat ? Date.parse(p.last_heartbeat) : NaN;
    if (Number.isFinite(hbMs) && (nowMs - hbMs) > PROVIDER_HEARTBEAT_STALE_MS) continue;
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
        if (!hasModel) continue;
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
}) {
  const safePromptTokens = toFiniteInt(promptTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const safeCompletionTokens = toFiniteInt(completionTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const safeTotalTokens = toFiniteInt(totalTokens, { min: 0, max: 1_000_000_000 })
    ?? (safePromptTokens + safeCompletionTokens);
  const totalCostHalala = computeTokenCostHalala(safeTotalTokens, tokenRateHalala);
  if (totalCostHalala <= 0 || safeTotalTokens <= 0) {
    return { promptCostHalala: 0, completionCostHalala: 0, totalCostHalala: 0 };
  }

  const promptShare = Math.max(0, Math.min(1, safePromptTokens / safeTotalTokens));
  const promptCostHalala = Math.round(totalCostHalala * promptShare);
  const completionCostHalala = Math.max(0, totalCostHalala - promptCostHalala);

  return {
    promptCostHalala,
    completionCostHalala,
    totalCostHalala,
  };
}

function withUsdUsagePricing(rawUsage = {}, tokenRateHalala = DEFAULT_TOKEN_RATE_HALALA) {
  const promptTokens = toFiniteInt(rawUsage.prompt_tokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const completionTokens = toFiniteInt(rawUsage.completion_tokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const totalTokens = toFiniteInt(rawUsage.total_tokens, { min: 0, max: 1_000_000_000 })
    ?? (promptTokens + completionTokens);
  const { promptCostHalala, completionCostHalala, totalCostHalala } = computeUsageCostBreakdown({
    promptTokens,
    completionTokens,
    totalTokens,
    tokenRateHalala,
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
];

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

  // Direct alias lookup — always applies regardless of port or format
  if (OLLAMA_MODEL_ALIASES[normalized]) {
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
  if (OLLAMA_MODEL_ALIASES[normalized] && (endpointLooksOllama || cachedLooksOllama)) {
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
  if (looksOllama && OLLAMA_TO_HF_ALIASES[normalized]) {
    const hf = OLLAMA_TO_HF_ALIASES[normalized];
    if (cachedList.some((m) => m === hf.toLowerCase())) {
      return hf;
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
  const body = { model: effectiveModelId, messages, max_tokens: maxTokens, temperature, stream: !!stream, think: false, ...passthroughBody };
  if (tools !== undefined) body.tools = tools;
  if (toolChoice !== undefined) body.tool_choice = toolChoice;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(PROXY_TIMEOUT_BASE_MS + (maxTokens || 0) * PROXY_TIMEOUT_PER_TOKEN_MS, PROXY_TIMEOUT_MAX_MS)),
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
  return { body: parsed };
}

router.post('/chat/completions', v1ChatRateLimiter, requireAuth, async (req, res) => {
  let persistFailureUsageBestEffort = null;
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
      return sendV1Error(res, {
        status: 503,
        type: 'server_error',
        code: 'no_capacity_available',
        message: `No inference providers currently online for '${model}'. Try again shortly.`,
      });
    }

    const gateSelection = selectProvidersWithLatencyGate({
      db,
      providers: capableProviders,
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
    const assignedProvider = providerById.get(Number(gateSelection.selectedProviderId)) || null;
    const fallbackProviders = gateSelection.fallbackProviderIds
      .map((providerId) => providerById.get(Number(providerId)))
      .filter(Boolean);

    if (!assignedProvider) {
      return sendV1Error(res, {
        status: 503,
        type: 'server_error',
        code: 'no_capacity_available',
        message: 'No inference providers available for this model',
      });
    }

    res.setHeader('x-dcp-latency-gate-mode', gateSelection.mode);

    // Check balance
    const mergedPrompt = estimatePromptFromMessages(messages);
    const promptTokens = approximateTokenCount(mergedPrompt);
    const durationMinutes = Math.max(1, Math.ceil(maxTokens / 350));
    const estimatedCostHalala = Math.max(1, Math.round(durationMinutes * modelReq.fallback_rate_halala_per_min));
    const tokenRateHalala = resolveTokenRateHalala(modelReq.model_id);
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
      const proxyResult = await proxyToProvider({
        endpointUrl: assignedProvider.vllm_endpoint_url,
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
        const usageForResponse = withUsdUsagePricing(resultBody?.usage || {}, tokenRateHalala);
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
          // Extract response text for job result storage. Ollama in thinking
          // mode (e.g. qwen3:4b) returns the assistant text in `reasoning`
          // (not `reasoning_content`) and leaves `content` empty — without the
          // bare `reasoning` fallback every v1:proxy job got persisted with
          // response="" and the playground MD/JSON exports showed "(no
          // response recorded)". The Ollama→OpenAI merge below at L1402-1409
          // fixes the live response shipped to the renter, but happens AFTER
          // this insert, so we have to mirror its sources here.
          const proxyResponseText = resultBody?.choices?.[0]?.message?.content
            || resultBody?.choices?.[0]?.message?.reasoning_content
            || resultBody?.choices?.[0]?.message?.reasoning
            || '';
          const proxyResultJson = JSON.stringify({
            type: 'llm_inference',
            prompt: messages?.[messages.length - 1]?.content || '',
            response: proxyResponseText.slice(0, 10000),
            model: resultBody?.model || modelReq.model_id,
            tokens_generated: proxyCompletionTokens,
            tokens_per_second: resultBody?.timings?.predicted_per_second || 0,
            gen_time_s: resultBody?.timings?.predicted_ms ? resultBody.timings.predicted_ms / 1000 : 0,
            total_time_s: resultBody?.timings?.predicted_ms ? resultBody.timings.predicted_ms / 1000 : 0,
            device: providerForUsage?.gpu_model || 'GPU',
          });
          db.prepare(
            `INSERT OR IGNORE INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
              started_at, completed_at, duration_minutes, cost_halala, actual_cost_halala, provider_earned_halala,
              prompt_tokens, completion_tokens, result,
              notes, created_at, updated_at, priority)
             VALUES (?, ?, ?, 'inference', ?, 'completed', ?, ?, ?, 0, ?, ?, ?,
              ?, ?, ?,
              'v1:proxy:chat/completions', ?, ?, 8)`
          ).run(
            proxyJobId, providerForUsage?.id, req.renter.id, modelReq.model_id, proxyStartedAt,
            proxyStartedAt, proxyNow, proxyCostHalala, proxyCostHalala, proxyProviderEarned,
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
        return res.json({
          ...resultBody,
          usage: usageForResponse,
        });
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
                const usageWithPricing = withUsdUsagePricing(parsed.usage, tokenRateHalala);
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
            const streamPromptTokens = streamSnapshot.promptTokens || 0;
            const streamCompletionTokens = streamSnapshot.completionTokens || 0;
            const streamCostHalala = streamSnapshot.costHalala > 0
              ? streamSnapshot.costHalala
              : Math.max(1, Math.round((modelReq.fallback_rate_halala_per_min || 2) * ((streamPromptTokens + streamCompletionTokens) / 30)));
            const streamProviderEarned = Math.max(1, Math.round(streamCostHalala * 0.85));
            db.prepare(
              `INSERT OR IGNORE INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
                completed_at, duration_minutes, cost_halala, provider_earned_halala,
                prompt_tokens, completion_tokens,
                notes, created_at, updated_at, priority)
               VALUES (?, ?, ?, 'inference', ?, 'completed', ?, ?, 0, ?, ?,
                ?, ?,
                'v1:proxy:stream', ?, ?, 8)`
            ).run(
              streamJobId, providerForUsage?.id, req.renter.id, modelReq.model_id, streamNow,
              streamNow, streamCostHalala, streamProviderEarned,
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

        const fallbackResult = await proxyToProvider({
          endpointUrl: fallbackProvider.vllm_endpoint_url,
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
          tokenRateHalala
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
  }
});

module.exports = router;
