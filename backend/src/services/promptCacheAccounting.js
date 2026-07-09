'use strict';

const crypto = require('crypto');

const PROMPT_CACHE_ACCOUNTING_VERSION = 'dcp.prompt_cache.v1';
const DEFAULT_CHARS_PER_TOKEN = 4;
const MAX_MODEL_LENGTH = 200;
const MAX_REQUEST_ID_LENGTH = 200;

function buildPromptCacheReadiness(now = new Date()) {
  return {
    object: 'prompt_cache_readiness',
    version: PROMPT_CACHE_ACCOUNTING_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'measurement_only_no_discount',
    status: 'available_measurement_only',
    endpoints: {
      readiness: 'GET /v1/prompt-cache/readiness',
      settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
      chat_completions: 'POST /v1/chat/completions',
    },
    request_hints: {
      static_prefix_fields: ['static_prefix', 'prompt_cache.static_prefix'],
      session_fields: ['prompt_cache.session_id', 'session_id', 'user'],
      supported_surfaces: ['/v1/chat/completions'],
    },
    measurement: {
      hash_only: true,
      stores_raw_prompt: false,
      stores_static_prefix: false,
      tracks_cache_key: true,
      tracks_cached_input_tokens: true,
      prior_hit_detection: true,
      non_streaming_supported: true,
      streaming_supported: true,
    },
    billing: {
      discounts_enabled: false,
      discount_bps: 0,
      billable_input_tokens_discounted: false,
      settlement_discount_enabled: false,
    },
    live_acceptance: {
      provider_discount_smoke: {
        status: 'blocked_external',
        command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
        live_acceptance_gate: 'prompt_cache_provider_discount_smoke',
        blocked_on: [
          'funded smoke principal',
          'provider cache-hit evidence',
          'settlement discount policy approval',
        ],
        verifies: [
          'live hit metadata',
          'no discount while disabled',
          'settlement discount policy remains disabled',
        ],
      },
    },
    response_fields: [
      'usage.prompt_cache',
      'usage.pricing.prompt_cache',
      'usage.pricing.cached_input_tokens',
      'usage.pricing.billable_input_tokens',
    ],
    claims: {
      prompt_cache_discount: false,
      provider_kv_cache_control: false,
      tinker_compatible: false,
    },
    next: 'enable_discount_only_after_provider_cache_hit_and_settlement_proof',
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizeContent(content) {
  if (content == null) return null;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return null;
        const type = String(part.type || '').trim();
        if (type === 'text') return { type, text: String(part.text || '') };
        if (type === 'image_url') {
          const url = typeof part.image_url === 'string'
            ? part.image_url
            : String(part.image_url && part.image_url.url ? part.image_url.url : '');
          return { type, image_url_hash: sha256(url) };
        }
        return { type: type || 'unknown' };
      })
      .filter(Boolean);
  }
  if (typeof content === 'object') return JSON.parse(JSON.stringify(content));
  return String(content);
}

function resolveStaticPrefix({ messages, prompt, staticPrefix } = {}) {
  if (staticPrefix != null) {
    return {
      source: 'explicit_static_prefix',
      value: normalizeContent(staticPrefix),
      message_count: 0,
    };
  }

  if (Array.isArray(messages)) {
    const prefixMessages = [];
    for (const message of messages) {
      const role = normalizeRole(message && message.role);
      if (role !== 'system' && role !== 'developer') break;
      prefixMessages.push({
        role,
        content: normalizeContent(message.content),
        name: message.name ? String(message.name) : undefined,
      });
    }
    if (prefixMessages.length > 0) {
      return {
        source: 'leading_system_messages',
        value: prefixMessages,
        message_count: prefixMessages.length,
      };
    }
  }

  if (typeof prompt === 'string' && prompt.trim()) {
    return {
      source: 'legacy_prompt_prefix_unset',
      value: null,
      message_count: 0,
    };
  }

  return {
    source: 'no_static_prefix',
    value: null,
    message_count: 0,
  };
}

function estimateTokensForPrefix(prefixValue) {
  if (prefixValue == null) return 0;
  const bytes = Buffer.byteLength(stableStringify(prefixValue), 'utf8');
  return Math.max(1, Math.ceil(bytes / DEFAULT_CHARS_PER_TOKEN));
}

function toNonNegativeInteger(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function hasPriorCacheKey(priorCacheKeys, cacheKey) {
  if (!priorCacheKeys || !cacheKey) return false;
  if (priorCacheKeys instanceof Set) return priorCacheKeys.has(cacheKey);
  if (Array.isArray(priorCacheKeys)) return priorCacheKeys.includes(cacheKey);
  if (typeof priorCacheKeys === 'object') return priorCacheKeys[cacheKey] === true;
  return false;
}

function buildPromptCacheKey({ model, sessionId, prefix }) {
  const scope = sessionId ? { session_id_hash: sha256(sessionId) } : { session_id_hash: null };
  const material = stableStringify({
    version: PROMPT_CACHE_ACCOUNTING_VERSION,
    model: String(model || '').trim(),
    scope,
    prefix,
  });
  const digest = sha256(material);
  return {
    cache_key: `pc_${digest.slice(0, 40)}`,
    cache_key_sha256: digest,
    session_id_hash: scope.session_id_hash ? scope.session_id_hash.slice(0, 24) : null,
  };
}

function computePromptCacheAccounting({
  model,
  messages,
  prompt,
  staticPrefix,
  sessionId,
  promptTokens,
  usage,
  priorCacheKeys,
} = {}) {
  const inputTokens = toNonNegativeInteger(
    promptTokens != null ? promptTokens : usage && usage.prompt_tokens,
    0,
  );
  const prefix = resolveStaticPrefix({ messages, prompt, staticPrefix });

  if (prefix.value == null) {
    return {
      version: PROMPT_CACHE_ACCOUNTING_VERSION,
      eligible: false,
      status: prefix.source,
      cache_key: null,
      cache_key_sha256: null,
      session_id_hash: null,
      static_prefix_source: prefix.source,
      static_prefix_message_count: prefix.message_count,
      static_prefix_tokens_estimate: 0,
      input_tokens: inputTokens,
      cached_input_tokens: 0,
      billable_input_tokens: inputTokens,
      discount_applied: false,
      discount_bps: 0,
    };
  }

  const key = buildPromptCacheKey({ model, sessionId, prefix: prefix.value });
  const prefixTokens = Math.min(inputTokens, estimateTokensForPrefix(prefix.value));
  const hit = hasPriorCacheKey(priorCacheKeys, key.cache_key);
  const cachedInputTokens = hit ? prefixTokens : 0;

  return {
    version: PROMPT_CACHE_ACCOUNTING_VERSION,
    eligible: true,
    status: hit ? 'hit_measured_no_discount' : 'miss_measured',
    cache_key: key.cache_key,
    cache_key_sha256: key.cache_key_sha256,
    session_id_hash: key.session_id_hash,
    static_prefix_source: prefix.source,
    static_prefix_message_count: prefix.message_count,
    static_prefix_tokens_estimate: prefixTokens,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    billable_input_tokens: inputTokens,
    discount_applied: false,
    discount_bps: 0,
  };
}

function attachPromptCacheUsage(usage = {}, accounting) {
  const promptTokens = toNonNegativeInteger(usage.prompt_tokens, 0);
  const completionTokens = toNonNegativeInteger(usage.completion_tokens, 0);
  const totalTokens = toNonNegativeInteger(usage.total_tokens, promptTokens + completionTokens);
  const safeAccounting = accounting || computePromptCacheAccounting({ usage });
  const promptCache = {
    version: safeAccounting.version,
    status: safeAccounting.status,
    eligible: safeAccounting.eligible,
    cache_key: safeAccounting.cache_key,
    cached_input_tokens: toNonNegativeInteger(safeAccounting.cached_input_tokens, 0),
    billable_input_tokens: toNonNegativeInteger(safeAccounting.billable_input_tokens, promptTokens),
    discount_applied: false,
    discount_bps: 0,
  };
  const nextUsage = {
    ...usage,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_cache: promptCache,
  };
  if (usage.pricing && typeof usage.pricing === 'object' && !Array.isArray(usage.pricing)) {
    nextUsage.pricing = {
      ...usage.pricing,
      prompt_cache: {
        version: promptCache.version,
        status: promptCache.status,
        eligible: promptCache.eligible,
        cached_input_tokens: promptCache.cached_input_tokens,
        billable_input_tokens: promptCache.billable_input_tokens,
        discount_applied: false,
        discount_bps: 0,
      },
      cached_input_tokens: promptCache.cached_input_tokens,
      billable_input_tokens: promptCache.billable_input_tokens,
      prompt_cache_discount_applied: false,
      prompt_cache_discount_bps: 0,
    };
  }
  return nextUsage;
}

function ensurePromptCacheAccountingSchema(db) {
  const schemaDb = db && typeof db.exec === 'function'
    ? db
    : db && db._db && typeof db._db.exec === 'function'
      ? db._db
      : null;
  if (!schemaDb) {
    throw new TypeError('ensurePromptCacheAccountingSchema requires a better-sqlite3 db with exec(sql)');
  }

  schemaDb.exec(`
    CREATE TABLE IF NOT EXISTS prompt_cache_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      renter_id INTEGER NOT NULL,
      cache_key TEXT NOT NULL,
      cache_key_sha256 TEXT NOT NULL,
      model_id TEXT NOT NULL,
      session_id_hash TEXT,
      status TEXT NOT NULL,
      static_prefix_source TEXT NOT NULL,
      static_prefix_message_count INTEGER NOT NULL DEFAULT 0,
      static_prefix_tokens_estimate INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      billable_input_tokens INTEGER NOT NULL DEFAULT 0,
      discount_applied INTEGER NOT NULL DEFAULT 0,
      discount_bps INTEGER NOT NULL DEFAULT 0,
      request_id TEXT,
      provider_response_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cache_measurements_key ON prompt_cache_measurements(renter_id, cache_key, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cache_measurements_model_session ON prompt_cache_measurements(renter_id, model_id, session_id_hash, created_at DESC)`);
}

function hasPromptCacheMeasurement(db, renterId, cacheKey) {
  assertDb(db);
  ensurePromptCacheAccountingSchema(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const key = normalizeCacheKey(cacheKey);
  const row = db.prepare(`
    SELECT 1
      FROM prompt_cache_measurements
     WHERE renter_id = ? AND cache_key = ?
     LIMIT 1
  `).get(ownerId, key);
  return !!row;
}

function recordPromptCacheMeasurement(db, renterId, accounting, options = {}) {
  assertDb(db);
  ensurePromptCacheAccountingSchema(db);
  if (!accounting || !accounting.eligible || !accounting.cache_key) {
    return { recorded: false, reason: 'not_eligible' };
  }
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO prompt_cache_measurements (
      renter_id, cache_key, cache_key_sha256, model_id, session_id_hash, status,
      static_prefix_source, static_prefix_message_count, static_prefix_tokens_estimate,
      input_tokens, cached_input_tokens, billable_input_tokens, discount_applied,
      discount_bps, request_id, provider_response_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ownerId,
    normalizeCacheKey(accounting.cache_key),
    normalizeSha256(accounting.cache_key_sha256, 'cache_key_sha256'),
    normalizeBoundedString(options.model || '', 'model', MAX_MODEL_LENGTH),
    accounting.session_id_hash || null,
    normalizeBoundedString(accounting.status || '', 'status', 80),
    normalizeBoundedString(accounting.static_prefix_source || 'unknown', 'static_prefix_source', 80),
    toNonNegativeInteger(accounting.static_prefix_message_count, 0),
    toNonNegativeInteger(accounting.static_prefix_tokens_estimate, 0),
    toNonNegativeInteger(accounting.input_tokens, 0),
    toNonNegativeInteger(accounting.cached_input_tokens, 0),
    toNonNegativeInteger(accounting.billable_input_tokens, 0),
    accounting.discount_applied ? 1 : 0,
    toNonNegativeInteger(accounting.discount_bps, 0),
    options.requestId ? normalizeBoundedString(options.requestId, 'request_id', MAX_REQUEST_ID_LENGTH) : null,
    options.providerResponseId ? normalizeBoundedString(options.providerResponseId, 'provider_response_id', MAX_REQUEST_ID_LENGTH) : null,
    now,
  );
  return {
    recorded: true,
    cache_key: accounting.cache_key,
    created_at: now,
  };
}

function normalizePositiveInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`);
  }
  return n;
}

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} is required`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${fieldName} is invalid`);
  }
  return normalized;
}

function normalizeCacheKey(value) {
  const key = normalizeBoundedString(value, 'cache_key', 80);
  if (!/^pc_[a-f0-9]{40}$/.test(key)) {
    throw new TypeError('cache_key is invalid');
  }
  return key;
}

function normalizeSha256(value, fieldName) {
  const digest = normalizeBoundedString(value, fieldName, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError(`${fieldName} must be a SHA-256 digest`);
  }
  return digest;
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('prompt-cache accounting requires a db with prepare(sql)');
  }
}

module.exports = {
  PROMPT_CACHE_ACCOUNTING_VERSION,
  buildPromptCacheReadiness,
  computePromptCacheAccounting,
  attachPromptCacheUsage,
  ensurePromptCacheAccountingSchema,
  hasPromptCacheMeasurement,
  recordPromptCacheMeasurement,
  __test: {
    stableStringify,
    normalizeContent,
    resolveStaticPrefix,
    estimateTokensForPrefix,
    buildPromptCacheKey,
  },
};
