const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const {
  getAdminTokenFromReq,
  getBearerToken,
  looksLikeRenterKey,
  looksLikeProviderKey,
} = require('./auth');

function ipFallbackKey(req) {
  return `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
}

function normalizeLimiterCredential(rawValue, prefix) {
  if (Array.isArray(rawValue)) return null;
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  return `${prefix}:${trimmed}`;
}

function retryAfterSeconds(req, windowMs) {
  const resetTime = req?.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const seconds = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return Math.max(1, Math.ceil(windowMs / 1000));
}

function defaultRateLimitBody({ retryAfter }) {
  return {
    error: 'Rate limit exceeded',
    retryAfterSeconds: retryAfter,
    retryAfterMs: retryAfter * 1000,
  };
}

function openAiRateLimitBody({ retryAfter }) {
  return {
    error: {
      message: `Rate limit exceeded. Retry after ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
      type: 'rate_limit_error',
      param: null,
      code: 'rate_limit_exceeded',
      status: 429,
      retryable: true,
      retry_after_seconds: retryAfter,
      retry_after_ms: retryAfter * 1000,
    },
    retry_after_seconds: retryAfter,
    retry_after_ms: retryAfter * 1000,
  };
}

function createRateLimiter({ windowMs, max, keyGenerator, buildBody = defaultRateLimitBody }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    // Evaluate the disable flag PER-REQUEST (via skip) rather than baking it
    // into `max` at construction. This way a runtime toggle is honored: tests
    // set DISABLE_RATE_LIMIT=1 globally (jest-setup) to avoid limiter
    // saturation, while rateLimiter.test.js flips it back to '0' per-test to
    // verify active limiting on the very same module-level limiter consts. In
    // production the flag is unset, so limiting is always on.
    skip: () => process.env.DISABLE_RATE_LIMIT === '1',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfter = retryAfterSeconds(req, windowMs);
      console.warn(`[rate-limit] 429: ${req.method} ${req.path}`);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json(buildBody({ req, retryAfter, windowMs }));
    },
  });
}

function getRenterKey(req, { includeGenericQueryKey = true } = {}) {
  // H2 — prefix-aware: skip values that look like a provider key so they
  // don't share a rate-limit bucket with renter keys (and vice versa).
  const candidates = [
    req.headers['x-renter-key'],
    req.query.renter_key,
  ];
  if (includeGenericQueryKey) candidates.push(req.query.key);
  candidates.push(getBearerToken(req));

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && looksLikeProviderKey(candidate.trim())) continue;
    const normalized = normalizeLimiterCredential(candidate, 'renter');
    if (normalized) return normalized;
  }
  return null;
}

function getProviderKey(req) {
  // H2 — prefix-aware: only accept candidates that don't look like a renter key.
  const candidates = [
    req.headers['x-provider-key'],
    req.query.provider_key,
    req.query.key,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (looksLikeRenterKey(trimmed)) continue;
    return `provider:${trimmed}`;
  }
  return null;
}

// Typed API key — when both renter and provider candidates are present,
// returns the one whose prefix actually matches the channel it arrived on.
function getApiKey(req) { return getRenterKey(req) || getProviderKey(req); }
function getAdminToken(req) { return getAdminTokenFromReq(req); }

function createAdminIpAllowlist() {
  const raw = (process.env.ADMIN_IP_ALLOWLIST || '').trim();
  if (!raw) return null;
  const allowed = new Set(raw.split(',').map((ip) => ip.trim()).filter(Boolean));
  return function adminIpAllowlist(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || '';
    if (allowed.has(ip)) return next();
    return res.status(403).json({ error: 'Access denied: IP not in allowlist' });
  };
}

// Provider registration: 5 per IP per hour (DCP-855)
const registerLimiter = createRateLimiter({ windowMs: 60*60*1000, max: 5, keyGenerator: (req) => ipFallbackKey(req) });

// Agent self-serve registration: 3 per IP per hour. Tighter than the human
// registerLimiter (5/IP/hr) because this path mints a REAL renter key + trial
// credit in ONE programmatic call with NO email-click verification — every
// successful call hands out money, so the per-IP cap is the primary abuse
// brake against credit farming. Keyed on IP (the caller is unauthenticated).
const agentRegisterLimiter = createRateLimiter({ windowMs: 60*60*1000, max: 3, keyGenerator: (req) => ipFallbackKey(req) });

// Job submission: 20 per renter key per minute (DCP-855)
const jobSubmitLimiter = createRateLimiter({
  windowMs: 60*1000,
  max: 20,
  keyGenerator: (req) => getRenterKey(req, { includeGenericQueryKey: false }) || ipFallbackKey(req),
});

// Job creation: 10 per renter key per minute (DCP-855)
const jobCreateLimiter = createRateLimiter({ windowMs: 60*1000, max: 10, keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req) });

const marketplaceLimiter = createRateLimiter({ windowMs: 60*1000, max: 60, keyGenerator: (req) => getApiKey(req) || ipFallbackKey(req) });
const publicProvidersLimiter = createRateLimiter({ windowMs: 60*1000, max: 60, keyGenerator: (req) => ipFallbackKey(req) });
const containerRegistryLimiter = createRateLimiter({ windowMs: 60*1000, max: 30, keyGenerator: (req) => ipFallbackKey(req) });
const vllmCompleteLimiter = createRateLimiter({
  windowMs: 60*1000,
  max: 60,
  keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req),
  buildBody: openAiRateLimitBody,
});
const vllmStreamLimiter = createRateLimiter({
  windowMs: 60*1000,
  // 5/min punished the primary paying behavior (chat UIs, agent loops stream
  // every turn); align with the non-stream budget until tier-based limits land.
  max: 30,
  keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req),
  buildBody: openAiRateLimitBody,
});

const retryJobLimiter = createRateLimiter({
  windowMs: 60*1000, max: 3,
  keyGenerator: (req) => {
    const actor = getRenterKey(req) || ipFallbackKey(req);
    const jobId = String(req.params?.job_id || 'unknown-job');
    return `retry:${actor}:job:${jobId}`;
  }
});

const renterAccountDeletionLimiter = createRateLimiter({ windowMs: 24*60*60*1000, max: 1, keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req) });
const providerAccountDeletionLimiter = createRateLimiter({ windowMs: 24*60*60*1000, max: 1, keyGenerator: (req) => getProviderKey(req) || ipFallbackKey(req) });
const renterDataExportLimiter = createRateLimiter({ windowMs: 24*60*60*1000, max: 1, keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req) });
const providerDataExportLimiter = createRateLimiter({ windowMs: 24*60*60*1000, max: 1, keyGenerator: (req) => getProviderKey(req) || ipFallbackKey(req) });
const adminLimiter = createRateLimiter({ windowMs: 60*1000, max: 30, keyGenerator: (req) => `admin:${getAdminToken(req) || ipFallbackKey(req)}` });

// Provider heartbeat: 10 per provider key per minute (DCP-855, daemon sends 2/min, raised from 4 to
// prevent 429-loop where rate-limited responses themselves consume the budget)
const heartbeatProviderLimiter = createRateLimiter({ windowMs: 60*1000, max: 30, keyGenerator: (req) => getProviderKey(req) || ipFallbackKey(req) });

// Auth endpoints: 5 per IP per 15 minutes (DCP-855)
const authLimiter = createRateLimiter({ windowMs: 15*60*1000, max: 5, keyGenerator: (req) => ipFallbackKey(req) });

// Catalog: 200 per IP per 15 minutes
const catalogLimiter = createRateLimiter({ windowMs: 15*60*1000, max: 200, keyGenerator: (req) => ipFallbackKey(req) });

// Model catalog: 100 per IP per minute (DCP-855, scraping protection)
const modelCatalogLimiter = createRateLimiter({ windowMs: 60*1000, max: 100, keyGenerator: (req) => ipFallbackKey(req) });

// Public endpoint: 200 per IP per 15 minutes
const publicEndpointLimiter = createRateLimiter({ windowMs: 15*60*1000, max: 200, keyGenerator: (req) => ipFallbackKey(req) });

// Authenticated endpoint: 1000 per API key per minute
const authenticatedEndpointLimiter = createRateLimiter({ windowMs: 60*1000, max: 1000, keyGenerator: (req) => getApiKey(req) || ipFallbackKey(req) });

// Model deploy: 20 per API key per minute
const modelDeployLimiter = createRateLimiter({ windowMs: 60*1000, max: 20, keyGenerator: (req) => getApiKey(req) || ipFallbackKey(req) });

// Template deploy: 10 per renter key per minute (DCP-956)
// Mirrors jobCreateLimiter — prevents IP-cycling abuse on the one-click deploy endpoint.
const templateDeployLimiter = createRateLimiter({ windowMs: 60*1000, max: 10, keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req) });

// Provider activation: 3 per provider key per hour (DCP-875)
// Prevents repeated activation probing; daemon activates once on startup.
const providerActivateLimiter = createRateLimiter({ windowMs: 60*60*1000, max: 3, keyGenerator: (req) => getProviderKey(req) || ipFallbackKey(req) });

// Renter webhook registration: 10 per renter key per hour (DCP-863/DCP-875)
// Webhook URLs are validated for SSRF — limit prevents rapid URL rotation attempts.
const webhookRegistrationLimiter = createRateLimiter({ windowMs: 60*60*1000, max: 10, keyGenerator: (req) => getRenterKey(req) || ipFallbackKey(req) });

module.exports = {
  createRateLimiter, createAdminIpAllowlist,
  registerLimiter, agentRegisterLimiter, jobSubmitLimiter, jobCreateLimiter,
  marketplaceLimiter, publicProvidersLimiter, publicEndpointLimiter,
  catalogLimiter, modelCatalogLimiter, authenticatedEndpointLimiter,
  modelDeployLimiter, containerRegistryLimiter,
  vllmCompleteLimiter, vllmStreamLimiter, retryJobLimiter,
  renterAccountDeletionLimiter, providerAccountDeletionLimiter,
  renterDataExportLimiter, providerDataExportLimiter,
  adminLimiter, heartbeatProviderLimiter, authLimiter,
  providerActivateLimiter, webhookRegistrationLimiter,
  templateDeployLimiter,
};
