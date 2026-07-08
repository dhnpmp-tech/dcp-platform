'use strict';

const crypto = require('crypto');

const PROMPT_CACHE_ACCOUNTING_VERSION = 'dcp.prompt_cache.v1';
const DEFAULT_CHARS_PER_TOKEN = 4;

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
  return {
    ...usage,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_cache: {
      version: safeAccounting.version,
      status: safeAccounting.status,
      eligible: safeAccounting.eligible,
      cache_key: safeAccounting.cache_key,
      cached_input_tokens: safeAccounting.cached_input_tokens,
      billable_input_tokens: safeAccounting.billable_input_tokens,
      discount_applied: false,
      discount_bps: 0,
    },
  };
}

module.exports = {
  PROMPT_CACHE_ACCOUNTING_VERSION,
  computePromptCacheAccounting,
  attachPromptCacheUsage,
  __test: {
    stableStringify,
    normalizeContent,
    resolveStaticPrefix,
    estimateTokensForPrefix,
    buildPromptCacheKey,
  },
};
