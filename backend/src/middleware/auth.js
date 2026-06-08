const crypto = require('crypto');

// ── DCP-audit H1: API-key prefix scheme ────────────────────────────────────
// Renter and provider API keys are minted with explicit prefixes (renters.js,
// providers.js, admin.js). Callers that *expect* one role can reject keys that
// look like the other role early — before any DB lookup — to prevent
// cross-role key-confusion (e.g. a leaked provider key accidentally accepted
// at /v1/chat/completions because the renter table happened to have a row
// with that string). Scoped renter sub-keys (renter_api_keys.key) historically
// don't carry the prefix, so we only reject keys that *actively look like the
// wrong role* — unknown-prefix keys still flow through and are validated by
// the existing DB lookup.
const RENTER_KEY_PREFIXES = ['dcp-renter-', 'dc1-renter-'];
const PROVIDER_KEY_PREFIXES = ['dcp-provider-', 'dc1-provider-'];

function looksLikeRenterKey(key) {
  if (typeof key !== 'string') return false;
  return RENTER_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function looksLikeProviderKey(key) {
  if (typeof key !== 'string') return false;
  return PROVIDER_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function detectKeyType(key) {
  if (looksLikeRenterKey(key)) return 'renter';
  if (looksLikeProviderKey(key)) return 'provider';
  return 'unknown';
}

function normalizeCredential(value, { maxLen = 512 } = {}) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLen) return null;
  return normalized;
}

function normalizeHeaderToken(rawHeader) {
  if (Array.isArray(rawHeader)) return null;
  return normalizeCredential(rawHeader);
}

function getBearerToken(req) {
  const authHeader = normalizeHeaderToken(req.headers?.authorization);
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return normalizeCredential(match[1]);
}

function getAdminTokenFromReq(req) {
  return normalizeHeaderToken(req.headers?.['x-admin-token']) || getBearerToken(req);
}

function getExpectedAdminToken() {
  return normalizeCredential(process.env.DC1_ADMIN_TOKEN);
}

function secureTokenEqual(provided, expected) {
  if (!provided || !expected) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function isAdminRequest(req) {
  const expected = getExpectedAdminToken();
  const provided = getAdminTokenFromReq(req);
  return secureTokenEqual(provided, expected);
}

function requireAdminAuth(req, res, next) {
  const expected = getExpectedAdminToken();
  if (!expected) {
    return res.status(503).json({ error: 'Admin token not configured' });
  }
  const provided = getAdminTokenFromReq(req);
  if (!secureTokenEqual(provided, expected)) {
    return res.status(401).json({ error: 'Admin access denied' });
  }
  return next();
}

function getApiKeyFromReq(req, options = {}) {
  const {
    headerName,
    queryNames = [],
    bodyNames = [],
    maxLen = 128,
  } = options;

  const candidates = [];
  if (headerName) candidates.push(req.headers?.[headerName]);
  // Authorization: Bearer <token> — the form the provider daemon's _auth_headers()
  // sends. Accept it on every credentialed lookup so daemon -> /api/jobs/* calls
  // (e.g. the interactive-pod hold-loop status poll) authenticate as the provider.
  // The key value/prefix disambiguates provider vs renter; renter paths still
  // reject provider-prefixed keys via looksLikeProviderKey.
  const authzHeader = req.headers && req.headers['authorization'];
  if (typeof authzHeader === 'string') {
    const m = authzHeader.match(/^Bearer\s+(.+)$/i);
    if (m) candidates.push(m[1]);
  }
  for (const queryName of queryNames) candidates.push(req.query?.[queryName]);
  for (const bodyName of bodyNames) candidates.push(req.body?.[bodyName]);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) continue;
    const normalized = normalizeCredential(candidate, { maxLen });
    if (normalized) return normalized;
  }
  return null;
}

module.exports = {
  getAdminTokenFromReq,
  getApiKeyFromReq,
  getBearerToken,
  getExpectedAdminToken,
  isAdminRequest,
  normalizeCredential,
  requireAdminAuth,
  secureTokenEqual,
  // H1: key-type prefix helpers
  looksLikeRenterKey,
  looksLikeProviderKey,
  detectKeyType,
  RENTER_KEY_PREFIXES,
  PROVIDER_KEY_PREFIXES,
};
