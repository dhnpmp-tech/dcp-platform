// DC1 Provider Onboarding Backend Server
// Auto-load .env BEFORE anything reads process.env. Under `pm2 -lc`, inherited
// environment can be stripped, so this keeps runtime config loading consistent
// across deploy paths (prod regression fix 2026-05-13; reconciled into git 2026-05-30).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const paymentsRouter = require('./routes/payments');
const { startJobSweep, getSweepMetrics, startProviderOfflineSweep } = require('./services/jobSweep');
const { startDailyDigest, stopDailyDigest } = require('./services/dailyDigest');
const { startProviderHealthWorker } = require('./workers/providerHealthWorker');
const { runControlPlaneCycle } = require('./services/controlPlane');
const { sendAlert } = require('./services/notifications');
const {
  registerLimiter,
  jobSubmitLimiter,
  marketplaceLimiter,
  adminLimiter,
  publicEndpointLimiter,
  authenticatedEndpointLimiter,
  heartbeatProviderLimiter,
  authLimiter,
  providerActivateLimiter,
  webhookRegistrationLimiter,
  createAdminIpAllowlist,
} = require('./middleware/rateLimiter');
const { getBearerToken } = require('./middleware/auth');
const { sensitiveAuditLogger } = require('./middleware/sensitiveAuditLogger');

// ── Startup secrets guard ──────────────────────────────────────────────────
// Fail fast if required secrets are missing or still set to placeholder values.
const PLACEHOLDER_PREFIX = 'CHANGE_ME';
const REQUIRED_SECRETS = ['DC1_ADMIN_TOKEN', 'DC1_HMAC_SECRET'];
for (const key of REQUIRED_SECRETS) {
  const val = process.env[key] || '';
  if (!val || val.startsWith(PLACEHOLDER_PREFIX)) {
    console.error(`[startup] FATAL: ${key} is missing or still set to a placeholder value. Set it in your PM2 env or OS environment before starting.`);
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by'); // don't advertise Express (free fingerprinting for attackers)
const PORT = process.env.DC1_PROVIDER_PORT || 8083;
const TRUST_PROXY_HOPS = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);

// Harden proxy trust to explicit hop count. This prevents accidental
// trust-all configurations that let attackers spoof X-Forwarded-For.
app.set(
  'trust proxy',
  Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS > 0 ? TRUST_PROXY_HOPS : false
);

function ipRateKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0');
}

function getLatestDaemonVersion() {
  const configured = (process.env.DAEMON_VERSION || '').trim();
  if (configured) return configured;

  const daemonCandidates = [
    path.join(__dirname, '../installers/dcp_daemon.py'),
    path.join(__dirname, '../installers/dc1_daemon.py'),
    path.join(__dirname, '../installers/dc1-daemon.py'),
  ];
  for (const daemonPath of daemonCandidates) {
    if (!fs.existsSync(daemonPath)) continue;
    const script = fs.readFileSync(daemonPath, 'utf8');
    const versionMatch = script.match(/DAEMON_VERSION\s*=\s*"([^"]+)"/);
    if (versionMatch && versionMatch[1]) return versionMatch[1];
  }
  return '3.3.0';
}

// ── CORS Lockdown (DCP-879 + audit M1) ────────────────────────────────────
// Additional origins can be injected via CORS_ORIGINS (comma-separated)
//
// M1 follow-up — fail-secure default: the loopback hard-stop is ON unless an
// operator explicitly opts out. The previous gate (`NODE_ENV !== 'production'`)
// silently bypassed lockdown on hosts that hadn't set NODE_ENV (our VPS PM2
// process is one such host), which made the audit fix dormant in production.
// Local dev now opts in via NODE_ENV=development OR DCP_ALLOW_LOOPBACK_CORS=1.
const _isDev = process.env.NODE_ENV === 'development'
  || process.env.DCP_ALLOW_LOOPBACK_CORS === '1';
console.log(`[cors] Loopback lockdown ${_isDev ? 'DISABLED (dev mode)' : 'ACTIVE'} — `
  + `NODE_ENV=${process.env.NODE_ENV || '<unset>'} `
  + `DCP_ALLOW_LOOPBACK_CORS=${process.env.DCP_ALLOW_LOOPBACK_CORS || '<unset>'}`);

// M1 — defence-in-depth: in production, never allow loopback hostnames
// regardless of how they were injected (CORS_ORIGINS env, FRONTEND_URL, or
// future helpers). The stage-2 audit flagged "localhost in production CORS"
// as a real risk after past misconfigurations bled localhost entries through.
const _LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
function _isLoopbackOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  try {
    const u = new URL(origin);
    return _LOOPBACK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
function _filterProdSafe(origins) {
  if (_isDev) return origins;
  return origins.filter((o) => {
    if (_isLoopbackOrigin(o)) {
      console.warn(`[cors] Dropping loopback origin in production: ${o}`);
      return false;
    }
    return true;
  });
}

const _extraOrigins = _filterProdSafe(
  process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : []
);
const _frontendOriginRaw = (process.env.FRONTEND_URL || '').trim();
const _frontendOrigin = _isDev || !_isLoopbackOrigin(_frontendOriginRaw)
  ? _frontendOriginRaw
  : '';
const ALLOWED_ORIGINS = [
  'https://dcp.sa',
  'https://www.dcp.sa',
  'https://app.dcp.sa',
  'https://api.dcp.sa',
  ...(_frontendOrigin ? [_frontendOrigin] : []),
  ..._extraOrigins,
  // localhost variants — only in non-production environments
  ...(_isDev ? [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://localhost:8080',
  ] : []),
];
// Explicit CORS methods and headers (DCP-879)
const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Renter-Key',
  'X-Provider-Key',
  'X-Admin-Token',
  'X-DC1-Signature',
  'X-DCP-Event',
  'X-Paperclip-Run-Id',
];
// Vercel deployments: prod + branch previews. M1 — narrowed from any
// *.vercel.app to project-specific subdomains so a third-party Vercel app
// can't speak as us. Configurable via VERCEL_PROJECT_NAMES (comma-separated)
// to cover renames; defaults to the two we own today.
const _vercelProjects = (process.env.VERCEL_PROJECT_NAMES || 'dcp,dcp-platform,dc1-platform')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const _vercelProjectAlt = _vercelProjects.map((p) => p.replace(/[^a-z0-9-]/g, '')).join('|');
const VERCEL_ORIGIN_RE = new RegExp(
  `^https:\\/\\/(?:${_vercelProjectAlt})(?:-[a-z0-9-]+)?\\.vercel\\.app$`,
  'i'
);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (daemon, curl, server-to-server)
    if (!origin) return callback(null, true);
    // M1 — production hard-stop on any loopback origin even if it slipped
    // through earlier filters.
    if (!_isDev && _isLoopbackOrigin(origin)) {
      console.warn(`[cors] Blocked loopback origin in production: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }
    // Allow exact matches
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow our Vercel deployments (production + branch previews)
    if (VERCEL_ORIGIN_RE.test(origin)) return callback(null, true);
    console.warn(`[cors] Blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: CORS_ALLOWED_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  credentials: true,
  maxAge: 86400, // preflight cache: 24 hours
}));

// Webhook raw parser must run before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use('/api/payments/payout-webhook', express.raw({ type: 'application/json' }));
// Raw body capture for provider heartbeat HMAC validation
app.use('/api/providers/heartbeat', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
  }
  next();
});
// Raw body capture for WireGuard-register HMAC validation (H7) — same pattern as
// heartbeat so enforceHeartbeatHmac has the bytes to verify once the
// DC1_REQUIRE_HEARTBEAT_HMAC flag is flipped during the C3 rollout.
app.use('/api/providers/wg/register', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
  }
  next();
});
// Raw body capture for provider webhook HMAC validation (DCP-722)
app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
  }
  next();
});
// ── Body-size policy (DoS mitigation, Tito audit) ─────────────────────────
// Global default is tight (2MB). Routes that legitimately accept larger
// payloads — today only /api/providers/job-result which carries base64 image
// results from SDXL/SD workers — mount their own higher-limit parser BEFORE
// the global one, so the express matcher uses the local parser first.
//
// If a new large-body endpoint is added in the future, add a per-route
// limiter here rather than bumping the global cap.
const LARGE_BODY_LIMIT = process.env.DCP_LARGE_BODY_LIMIT || '10mb';
const GLOBAL_BODY_LIMIT = process.env.DCP_GLOBAL_BODY_LIMIT || '2mb';

app.use('/api/providers/job-result', express.json({ limit: LARGE_BODY_LIMIT }));
app.use('/api/providers/job-result', express.urlencoded({ extended: true, limit: LARGE_BODY_LIMIT }));

app.use(express.json({ limit: GLOBAL_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: GLOBAL_BODY_LIMIT }));
app.use(sensitiveAuditLogger);

// ── Security Headers (DCP-879) ───────────────────────────────────────────
// Headless REST API — no HTML served from this origin, so strict policies apply.
app.use((req, res, next) => {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Deny framing (clickjacking protection)
  res.setHeader('X-Frame-Options', 'DENY');
  // Legacy XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer: send origin only on same-origin, strip on cross-origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable browser features not used by a JSON API
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // CSP: headless API serves no scripts/styles — lock down everything
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  // HSTS: 2-year max-age, include subdomains + preload (TLS live on api.dcp.sa)
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Cross-Origin isolation headers (DCP-879)
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  // Opt into origin-keyed agent cluster for process isolation
  res.setHeader('Origin-Agent-Cluster', '?1');
  next();
});

// ── Input Sanitization ──────────────────────────────────────────────────
// Strip HTML tags and null bytes from all string inputs
function sanitize(obj) {
  if (typeof obj === 'string') return obj.replace(/\0/g, '').replace(/<[^>]*>/g, '').trim();
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) clean[k] = sanitize(v);
    return clean;
  }
  return obj;
}
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  if (req.query && typeof req.query === 'object') req.query = sanitize(req.query);
  next();
});

// ── Auth Security: API Key in Query Params ──────────────────────────────
// Log and reject requests that pass API credentials via URL query parameters.
// Credentials in URLs appear in server logs, browser history, and HTTP referrer headers.
// Providers (daemon) still use query params on some endpoints — only renter-facing
// endpoints are enforced here. Provider routes remain backward-compatible.
const {
  detectQueryParamKeys,
  rejectRenterQueryParamKey,
} = require('./middleware/queryKeyReject');

// Audit C1 — query-param API key deprecation telemetry.
//
// Background: Nexus/Tito audit C1 flagged that every endpoint accepting
// `?key=`, `?renter_key=`, `?provider_key=`, or `?api_key=` leaks credentials
// into browser history, server access logs, referrer headers, and proxy logs.
// Full removal is blocked: 60+ backend handlers, 30+ frontend call sites
// (server.js:306 note), and the Tauri installer URLs in already-shipped .exes.
//
// This middleware ships the C1 "phase 1" mitigation:
//   - Sets `Deprecation: true`, `Sunset: <today + 30d>`, and `Link: rel=deprecation`
//     response headers when a query-param credential is observed.
//   - Logs each occurrence (rate-limited to 1/min per req.path) so we can
//     measure migration blast radius before phase 2 (refuse query-param keys).
//
// `?key=` clients keep working through the sunset window. Phase 2 is a
// separate change once the per-path log telemetry shows the call sites are
// migrated.
const C1_SUNSET_DAYS = 30;
const C1_QUERY_KEY_SUNSET = new Date('2026-07-15T00:00:00Z');
const C1_SUNSET_MS = C1_SUNSET_DAYS * 24 * 60 * 60 * 1000;
const C1_DEPRECATION_DOC_URL = 'https://api.dcp.sa/docs/auth#bearer';
const _c1LastLogByPath = new Map(); // path → last-log-ms
const C1_LOG_THROTTLE_MS = 60 * 1000;

function _c1ShouldLog(reqPath) {
  const now = Date.now();
  const last = _c1LastLogByPath.get(reqPath) || 0;
  if (now - last < C1_LOG_THROTTLE_MS) return false;
  _c1LastLogByPath.set(reqPath, now);
  // Bound the map so a flood of unique paths can't grow it unboundedly.
  if (_c1LastLogByPath.size > 1024) {
    const cutoff = now - C1_LOG_THROTTLE_MS;
    for (const [k, v] of _c1LastLogByPath) {
      if (v < cutoff) _c1LastLogByPath.delete(k);
    }
  }
  return true;
}

app.use((req, res, next) => {
  const detected = detectQueryParamKeys(req);
  if (detected.any) {
    // RFC 8594 (Sunset) + draft-ietf-httpapi-deprecation-header
    res.setHeader('Deprecation', 'true');
    // RFC 8594: Sunset must be a FIXED date — a rolling now+30d never arrives,
    // so the advertised cutoff was moving forward every day. Pinned date gives
    // ?key= clients (e.g. the AWS poller on /api/pods) one real deadline.
    res.setHeader('Sunset', C1_QUERY_KEY_SUNSET.toUTCString());
    res.setHeader('Link', `<${C1_DEPRECATION_DOC_URL}>; rel="deprecation"`);

    if (_c1ShouldLog(req.path)) {
      const which = detected.hasRenterKey ? 'renter' : detected.hasProviderKey ? 'provider' : 'shared';
      console.warn(
        `[c1-deprecation] ?${which}_key= used: ${req.method} ${req.path} ip=${req.ip || 'unknown'} — clients should migrate to Authorization: Bearer (sunset ${C1_SUNSET_DAYS}d)`
      );
    }
  }
  next();
});

// C1 phase-2: query-param API key rejection is now LIVE on /api/renters/me/*
// (the frontend migration is complete — all fetch call sites use the
// x-renter-key header; the CSV export uses a header-authed blob download).
// ?key=/​?renter_key= on these routes now returns 400. Installer download URLs
// (/api/providers/download?key=) are intentionally NOT covered here — they are
// baked into already-shipped Tauri .exe/.dmg binaries and remain on ?key= until
// a signed-URL mechanism lands. /api/renters/analytics + /api/renters/export
// mounts below are inert (those exact routes don't exist) — left as placeholders.
app.use('/api/renters/me', rejectRenterQueryParamKey);
// app.use('/api/renters/analytics', rejectRenterQueryParamKey); // route does not exist
// app.use('/api/renters/export', rejectRenterQueryParamKey);   // route does not exist

// ── Auth Failure Logging ────────────────────────────────────────────────
// Wrap res.status to detect 401/403 and emit an audit log entry.
app.use((req, res, next) => {
  const originalStatus = res.status.bind(res);
  res.status = function authAuditStatus(code) {
    if (code === 401 || code === 403) {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const hasAuthHeader = !!(req.headers?.authorization || req.headers?.['x-renter-key'] || req.headers?.['x-provider-key'] || req.headers?.['x-admin-token']);
      console.warn(
        `[auth] Failed auth: status=${code} method=${req.method} path=${req.path} ip=${ip} has_header=${hasAuthHeader}`
      );
    }
    return originalStatus(code);
  };
  next();
});

// ── Rate Limiting ───────────────────────────────────────────────────────
// Registration: 5 attempts per IP per 10 minutes
app.use('/api/providers/register', registerLimiter);
app.use('/api/renters/register', registerLimiter);

// Provider activation: 3 per provider key per hour (DCP-875)
app.use('/api/providers/:id/activate', providerActivateLimiter);

// Renter webhook registration: 10 per renter key per hour (DCP-875)
app.use('/api/renters/:id/webhooks', webhookRegistrationLimiter);

// Heartbeat: 60 per provider key per minute (keyed per provider, not per IP).
// Daemon sends every 30s = 2/min normally; 60/min leaves headroom for burst recovery.
app.use('/api/providers/heartbeat', heartbeatProviderLimiter);

// Job submission: 20 per renter key per minute (DCP-805)
app.use('/api/jobs/submit', jobSubmitLimiter);

// Marketplace listing: 60 requests per API key per minute
app.use('/api/providers/marketplace', marketplaceLimiter);

// Admin endpoints: 30 requests per token per minute
// IP allowlist: when ADMIN_IP_ALLOWLIST env var is set, restrict access to listed IPs
const adminIpAllowlistMiddleware = createAdminIpAllowlist();
if (adminIpAllowlistMiddleware) app.use('/api/admin', adminIpAllowlistMiddleware);
app.use('/api/admin', adminLimiter);

// Tiered rate limiting for providers/jobs/models:
//   - authenticated (API key or bearer token present): 1000 req/min per key
//   - public (no credentials): 100 req/min per IP
function hasApiCredential(req) {
  return !!(
    req.headers['x-renter-key'] ||
    req.headers['x-provider-key'] ||
    req.query.renter_key ||
    req.query.provider_key ||
    req.query.key ||
    getBearerToken(req)
  );
}
function tieredApiLimiter(req, res, next) {
  if (hasApiCredential(req)) return authenticatedEndpointLimiter(req, res, next);
  return publicEndpointLimiter(req, res, next);
}
app.use('/api/providers', tieredApiLimiter);
app.use('/api/jobs', tieredApiLimiter);
app.use('/api/models', tieredApiLimiter);
app.use('/api/templates', tieredApiLimiter);
// Renter endpoints: 1000 req/min (authenticated) or 200 req/min (public) per IP (DCP-894)
// Covers /api/renters/jobs and other authenticated renter routes.
// More specific limiters (topupLimiter, webhookRegistrationLimiter) remain in effect
// for their respective paths — express-rate-limit instances track independent counters.
app.use('/api/renters', tieredApiLimiter);

// Auth endpoints (if added in future): 10 per IP per minute
app.use('/api/auth', authLimiter);

// Login endpoints: 10 attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipRateKey(req),
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/providers/login', loginLimiter);
app.use('/api/renters/login', loginLimiter);
app.use('/api/providers/login-email', loginLimiter);
app.use('/api/renters/login-email', loginLimiter);
app.use('/api/admin/login', loginLimiter);

// Balance top-up: 10 per IP per minute (financial operation — prevent abuse)
const topupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipRateKey(req),
  message: { error: 'Too many top-up requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/renters/topup', topupLimiter);

// Payment initiation (Moyasar): 10 per IP per minute
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipRateKey(req),
  message: { error: 'Too many payment requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/payments/topup', paymentLimiter);
app.use('/api/payments/topup-sandbox', paymentLimiter);

// Moyasar webhook: 100 per IP per minute
const paymentWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => ipRateKey(req),
  message: { error: 'Webhook rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/payments/webhook', paymentWebhookLimiter);

// General API: 300 per IP per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: (req) => ipRateKey(req),
  message: { error: 'Rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);

// Phase 4 Final: VPS is headless API only — no HTML serving
// Static HTML files (provider-onboarding.html, admin.html, docs.html) removed.
// All frontend is served by Next.js on Vercel (dcp.sa).

// ── Analytics Latency Middleware (DCP-935) ──────────────────────────────
// Fire-and-forget API latency events to Segment for authenticated requests.
// Must be registered BEFORE route handlers so res.json is wrapped in time.
const analyticsService = require('./services/analyticsService');
app.use(analyticsService.latencyMiddleware);

// ── Contract-conformance drift gate (backlog #11a) — TEST ONLY ─────────────
// Mounts express-openapi-validator against the vendored dcp-contracts spec
// (backend/openapi/dcp.yaml) as a RESPONSE-VALIDATION drift gate in LOG mode:
// validateRequests:false, validateResponses logs via onError and NEVER throws,
// so the response still returns unchanged and the test suite pass/fail is
// identical with the gate on. It only surfaces spec↔backend drift as
// '[contract-drift] <method> <path>: <message>' lines for the reconciliation
// backlog. Gated to NODE_ENV==='test' so production is untouched (zero prod
// latency/risk; the validator is never even required outside tests). Mounted
// here — after body parsers + rate limiters, BEFORE the route handlers — so
// the library can wrap res.json on the documented routes. Flipping to ENFORCE
// (throw) is a deliberate follow-up (#11b) once the drift is reconciled.
if (process.env.NODE_ENV === 'test') {
    try {
        const { buildContractDriftGate } = require('./middleware/contractDriftGate');
        app.use(buildContractDriftGate());
        console.log('[contract-gate] response-validation drift gate mounted (test env, log-mode)');
    } catch (err) {
        // The gate is observability-only. If it cannot mount (e.g. the vendored
        // spec is unreadable), log and continue — it must NEVER break tests.
        console.warn(`[contract-gate] gate not mounted: ${err && err.message ? err.message : err}`);
    }
}

// Serve installer files for download (daemon binaries — still needed)
app.use('/installers', express.static(path.join(__dirname, '..', 'installers')));

// Provider auto-installer: curl dcp.sa/install | bash
// Serves install.sh for Linux/macOS provider setup
const INSTALL_SCRIPT_PATH = path.join(__dirname, '..', 'public', 'install.sh');
app.get('/install', (req, res) => {
    if (!fs.existsSync(INSTALL_SCRIPT_PATH)) {
        return res.status(404).json({ error: 'Install script not found' });
    }
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
    return res.sendFile(INSTALL_SCRIPT_PATH);
});
// Also serve at /install.sh for convenience
app.get('/install.sh', (req, res) => {
    if (!fs.existsSync(INSTALL_SCRIPT_PATH)) {
        return res.status(404).json({ error: 'Install script not found' });
    }
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
    return res.sendFile(INSTALL_SCRIPT_PATH);
});

// Windows provider auto-installer: the /setup wizard emits a one-liner that
// does `Invoke-WebRequest -Uri 'https://dcp.sa/install.ps1' -OutFile
// dcp_setup.ps1; .\dcp_setup.ps1 -Token '<install_token>'`. dcp.sa rewrites
// /install.ps1 here (see next.config.js). Serve the PowerShell installer that
// exchanges the wizard install_token for an api_key via /v1/provider/
// register-node, mirroring the .sh path. Prefer a maintained public copy; fall
// back to the bundled installers/ source so this never 404s.
const INSTALL_PS1_PUBLIC_PATH = path.join(__dirname, '..', 'public', 'install.ps1');
const INSTALL_PS1_FALLBACK_PATH = path.join(__dirname, '..', 'installers', 'dcp-setup-windows.ps1');
app.get('/install.ps1', (req, res) => {
    const ps1Path = fs.existsSync(INSTALL_PS1_PUBLIC_PATH)
        ? INSTALL_PS1_PUBLIC_PATH
        : (fs.existsSync(INSTALL_PS1_FALLBACK_PATH) ? INSTALL_PS1_FALLBACK_PATH : null);
    if (!ps1Path) {
        return res.status(404).json({ error: 'Windows install script not found' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="install.ps1"');
    return res.sendFile(ps1Path);
});

// Agent-driven install (curl https://api.dcp.sa/install/agent | bash -s -- --token TOKEN)
// This is the new path: bootstrap the DCP Agent (Hermes fork), and the
// agent itself orchestrates the rest of the install via its skills.
const AGENT_INSTALL_SCRIPT_PATH = path.join(__dirname, '..', 'public', 'agent-install.sh');
app.get('/install/agent', (req, res) => {
    if (!fs.existsSync(AGENT_INSTALL_SCRIPT_PATH)) {
        return res.status(404).json({ error: 'Agent install script not found' });
    }
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="agent-install.sh"');
    return res.sendFile(AGENT_INSTALL_SCRIPT_PATH);
});

// Provider self-heal one-liner. Existing providers run this to apply
// today's fixes (WG re-register via /api/providers/wg/install-config +
// OLLAMA_HOST persist + health probe) without re-installing from scratch.
//   curl -sSL https://api.dcp.sa/fix-provider | bash -s -- --api-key dcp-provider-XXX
const FIX_PROVIDER_SCRIPT_PATH = path.join(__dirname, '..', 'public', 'fix-provider.sh');
app.get('/fix-provider', (req, res) => {
    if (!fs.existsSync(FIX_PROVIDER_SCRIPT_PATH)) {
        return res.status(404).json({ error: 'Self-heal script not found' });
    }
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fix-provider.sh"');
    return res.sendFile(FIX_PROVIDER_SCRIPT_PATH);
});

// Tauri auto-updater endpoint — serves update manifest
// Format: https://api.dcp.sa/api/providers/updates/{target}/{current_version}
app.get('/api/providers/updates/:target/:current_version', (req, res) => {
    const { target, current_version } = req.params;
    const LATEST_APP_VERSION = '0.2.9';

    // Compare versions — if current >= latest, no update
    if (current_version === LATEST_APP_VERSION || current_version > LATEST_APP_VERSION) {
        return res.status(204).end(); // No update available
    }

    // Determine download URL and signature based on target
    const sigPath = path.join(__dirname, '..', 'public', 'dcp-provider-update.nsis.zip.sig');
    const signature = fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf8').trim() : '';

    if (!signature) {
        // No signature available — can't serve auto-update
        return res.status(204).end();
    }

    if (target.includes('windows')) {
        return res.json({
            version: LATEST_APP_VERSION,
            notes: 'Windows: your node now connects to the mesh automatically - the secure tunnel activates with a one-time admin prompt, so your GPU can serve.',
            pub_date: new Date().toISOString(),
            platforms: {
                'windows-x86_64': {
                    signature,
                    url: 'https://api.dcp.sa/download/windows-update',
                }
            }
        });
    }

    // No update for other platforms yet
    res.status(204).end();
});

// Desktop app auto-update bundle (.nsis.zip for Tauri updater)
app.get('/download/windows-update', (req, res) => {
    const zipPath = path.join(__dirname, '..', 'public', 'dcp-provider-update.nsis.zip');
    if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: 'Update bundle not available' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="DCP-Provider-update.nsis.zip"');
    return res.sendFile(zipPath);
});

// Desktop app downloads — Windows provider installer
app.get('/download/windows', (req, res) => {
    const exePath = path.join(__dirname, '..', 'public', 'dcp-provider-setup.exe');
    if (!fs.existsSync(exePath)) {
        return res.status(404).json({ error: 'Windows installer not available yet' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="DCP-Provider-Setup.exe"');
    return res.sendFile(exePath);
});
app.get('/download/mac', (req, res) => {
    // TODO: add macOS .dmg when ready
    return res.status(404).json({ error: 'macOS installer coming soon — use install.sh for now' });
});

// Renter live inference dashboard (RunPod-style)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'renter-dashboard.html'));
});

// API Routes
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

const providersRouter = require('./routes/providers');
app.use('/api/providers', providersRouter);

// Legacy / fallback aliases for the daemon download endpoint.
//   GET /daemon?key=…             — fallback URL hardcoded in install.sh
//   GET /installers/daemon?key=…  — CANONICAL_INSTALLER_DOWNLOAD_URL in dcp_daemon.py
// Both 302-redirect to the canonical handler. This keeps the distribution
// channels Tito's audit expected (and that install.sh / dcp_daemon.py already
// reference) working without duplicating the handler logic.
function legacyDaemonAlias(req, res) {
    const qIdx = req.url.indexOf('?');
    const qs = qIdx >= 0 ? req.url.slice(qIdx) : '';
    res.redirect(302, `/api/providers/download/daemon${qs}`);
}
app.get('/daemon', legacyDaemonAlias);
app.get('/installers/daemon', legacyDaemonAlias);

const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);
const openRouterSettlementRouter = require('./routes/openrouter-settlement');
app.use('/api/admin/openrouter', openRouterSettlementRouter);

const { providerEarningsRouter, adminStatsRouter } = require('./routes/earnings');
app.use('/api/providers', providerEarningsRouter);
app.use('/api/admin', adminStatsRouter);

const benchmarkRouter = require('./routes/benchmark');
app.use('/api/benchmark', benchmarkRouter);

const recoveryRouter = require('./routes/recovery');
app.use('/api/recovery', recoveryRouter);

const jobsRouter = require('./routes/jobs');
app.use('/api/jobs', jobsRouter);
// Interactive GPU pods (RunPod-style Jupyter + SSH) — same job rails, different template.
const podsRouter = require('./routes/pods');
app.use('/api/pods', podsRouter);
const volumesRouter = require('./routes/volumes');
app.use('/api/volumes', volumesRouter);
const workspaceRouter = require('./routes/workspace');
app.use('/api/workspace', workspaceRouter);
const publicDemoRouter = require('./routes/public-demo');
app.use('/api/public/demo', publicDemoRouter);
const funnelRouter = require('./routes/funnel');
app.use('/api/funnel', funnelRouter);
const { jobsInvoiceRouter, rentersInvoiceRouter } = require('./routes/invoices');
app.use('/api/jobs', jobsInvoiceRouter);
app.use('/api/renters', rentersInvoiceRouter);

const standupRouter = require('./routes/standup');
app.use('/api/standup', standupRouter);
const missionRouter = require('./routes/mission');
app.use('/api/mission', missionRouter);
const channelsRouter = require('./routes/channels');
app.use('/api/channels', channelsRouter);
const reconciliationRouter = require('./routes/reconciliation');
app.use('/api/reconciliation', reconciliationRouter);
const securityRouter = require('./routes/security');
app.use('/api/security', securityRouter);
const intelligenceRouter = require('./routes/intelligence');
app.use('/api/intelligence', intelligenceRouter);

const syncRouter = require('./routes/sync');
app.use('/api/sync', syncRouter);

const rentersRouter = require('./routes/renters');
app.use('/api/renters', rentersRouter);

const { renterRouter: renterTxRouter, providerRouter: providerTxRouter } = require('./routes/transactions');
app.use('/api/renters', renterTxRouter);
app.use('/api/providers', providerTxRouter);

const supportRouter = require('./routes/support');
app.use('/api/support', supportRouter);

const modelsRouter = require('./routes/models');
app.use('/api/models', modelsRouter);

const pricingRouter = require('./routes/pricing');
app.use('/api/pricing', pricingRouter);

const subscriptionsRouter = require('./routes/subscriptions');
app.use('/api/subscriptions', subscriptionsRouter);

const adminPricingRouter = require('./routes/admin-pricing');
app.use('/api/admin', adminPricingRouter);

const adminIncidentsRouter = require('./routes/admin-incidents');
app.use('/api/admin', adminIncidentsRouter);

const v1Router = require('./routes/v1');
// ── H2-gated-v1-query-key-reject (H2) ───────────────────────────────
// /v1/* accepts the renter key via ?key= (routes/v1.js getRenterKey). Keys in
// URLs leak through access logs, browser history, and Referer headers. We
// (a) always log a throttled deprecation warning when a query-param key is
// seen on /v1/*, and (b) reject it with 400 ONLY when DC1_REJECT_QUERY_KEYS
// is explicitly enabled. The flag DEFAULTS OFF so live SDK/clients that still
// send ?key= keep working; flip it to '1' after the SDK migration completes.
const DC1_REJECT_QUERY_KEYS = /^(1|true|yes|on)$/i.test(
  String(process.env.DC1_REJECT_QUERY_KEYS || '').trim()
);
function gatedRejectV1QueryKey(req, res, next) {
  const detected = detectQueryParamKeys(req);
  if (detected.hasRenterKey || detected.hasSharedKey) {
    if (_c1ShouldLog('v1:' + req.path)) {
      console.warn(
        `[security][H2] /v1 query-param API key observed: ${req.method} ${req.path} ` +
        `ip=${req.ip || 'unknown'} reject=${DC1_REJECT_QUERY_KEYS} ` +
        `— send the key via Authorization: Bearer or X-Renter-Key instead`
      );
    }
    if (DC1_REJECT_QUERY_KEYS) {
      return res.status(400).json({
        error: {
          message: 'API keys must be sent via the Authorization: Bearer header or X-Renter-Key, not a URL query parameter. This prevents credential exposure in logs and browser history.',
          type: 'invalid_request_error',
          code: 'query_param_key_rejected',
          status: 400,
          retryable: false,
        },
      });
    }
  }
  next();
}
app.use('/v1', gatedRejectV1QueryKey);
app.use('/v1', v1Router);

// Renter-facing Anthropic Messages surface (dcp launcher / Claude Code).
// Distinct from /api/agent/gateway/v1/messages (Nexus brain, provider-key-
// gated) — different callers, auth, and routing. See routes/anthropic.js.
const anthropicRouter = require('./routes/anthropic');
app.use('/anthropic', anthropicRouter);

// dcp CLI device-code login (routes/cli-auth.js). Mounted on its own /v1/cli
// prefix — same layering pattern as the wizard router below.
const cliAuthRouter = require('./routes/cli-auth');
app.use('/v1/cli', cliAuthRouter);

// Provider-onboarding wizard surface (auth bridge + provider endpoints).
// Mounted after v1Router so OpenAI-compat routes win on shared prefix;
// wizard router only claims /auth/* and /provider/* below /v1/.
const v1WizardRouter = require('./routes/v1-wizard');
app.use('/v1', v1WizardRouter);

const verificationRouter = require('./routes/verification');
app.use('/api/verification', verificationRouter);

app.use('/api/payments', paymentsRouter);

const templatesRouter = require('./routes/templates');
app.use('/api/templates', templatesRouter);

const containersRouter = require('./routes/containers');
app.use('/api/containers', containersRouter);

const p2pRouter = require('./routes/p2p');
app.use('/api/p2p', p2pRouter);

const webhooksRouter = require('./routes/webhooks');
app.use('/api/webhooks', webhooksRouter);

const networkRouter = require('./routes/network');
app.use('/api/network', networkRouter);

// Initialize Supabase sync bridge

const settlementRouter = require('./routes/settlement');
app.use('/api/settlement', settlementRouter);
const supabaseSync = require('./services/supabase-sync');
if (supabaseSync.init()) { supabaseSync.startPeriodicSync(); }

const fallbackRouter = require('./routes/fallback');
app.use('/api/fallback', fallbackRouter);

const publicHealthRouter = require('./routes/public-health');
app.use('/api/health', publicHealthRouter);

const payoutsRouter = require('./routes/payouts');
app.use('/api', payoutsRouter);

const ragRouter = require('./routes/rag');
app.use('/api/rag', ragRouter);

const arabicRagRouter = require('./routes/arabic-rag');
app.use('/api/templates/arabic-rag', arabicRagRouter);

// Agent gateway — proxies provider Hermes traffic to upstream brains
// (MiniMax / Anthropic / future in-house). Server-side keys; providers
// authenticate with their DCP_PROVIDER_KEY. Swappable by editing
// UPSTREAMS / ROUTING in routes/agent-gateway.js.
const agentGatewayRouter = require('./routes/agent-gateway');
app.use('/api/agent/gateway', agentGatewayRouter);

// Agent self-update manifest — dcp-agent providers poll /agent/manifest.json
// to learn which commit to roll forward to. See routes/agentManifest.js for
// the v1 trust model (TLS-only).
const agentManifestRouter = require('./routes/agentManifest');
app.use('/agent', agentManifestRouter);

const db = require('./db');
const { countUsableProviders } = require('./services/providerVerification');

function getProviderCapacitySnapshot() {
  // Exclude soft-retired rows so "registered" reflects real providers, not
  // abandoned/never-onboarded signups (e.g. dead registrations carry deleted_at).
  const total = db.prepare('SELECT COUNT(*) AS count FROM providers WHERE deleted_at IS NULL').get()?.count || 0;
  const heartbeating = db.prepare("SELECT COUNT(*) AS count FROM providers WHERE status = 'online' AND deleted_at IS NULL").get()?.count || 0;
  const endpointReachable = db.prepare(
    `SELECT COUNT(*) AS count
       FROM providers
      WHERE status = 'online'
        AND COALESCE(is_paused, 0) = 0
        AND deleted_at IS NULL
        AND vllm_endpoint_url IS NOT NULL
        AND COALESCE(endpoint_reachable, 0) = 1
        AND endpoint_probed_at IS NOT NULL`
  ).get()?.count || 0;

  let serving = 0;
  try {
    serving = countUsableProviders(db);
  } catch (_) {
    serving = 0;
  }

  return {
    total,
    heartbeating,
    endpoint_reachable: endpointReachable,
    serving,
    capacity_reason: serving > 0 ? 'verified_serving_capacity' : 'no_verified_serving_provider',
  };
}

// Available GPU TYPES for the public status grid. GPU-TYPE ONLY — no machine
// names, no node counts. On-demand (burst) types are ALWAYS available; live
// native nodes contribute their GPU type (deduped) when heartbeating fresh.
// INVISIBILITY: never reveal that a type is burst-backed or who the vendor is.
function getAvailableGpuTypes() {
  const HEARTBEAT_FRESH_MS = 300 * 1000;
  const byType = new Map(); // gpu_model -> { type, vram_gb, available }
  const upsert = (gpuModel, vramGb, available = true) => {
    const type = (gpuModel || '').trim();
    if (!type) return;
    const vram = (vramGb != null && Number.isFinite(vramGb) && vramGb > 0) ? Math.round(vramGb) : null;
    const existing = byType.get(type);
    if (!existing) {
      byType.set(type, { type, vram_gb: vram, available: !!available });
    } else {
      if (existing.vram_gb == null && vram != null) existing.vram_gb = vram;
      // If ANY source for this type is live/in-stock, the type is available.
      if (available) existing.available = true;
    }
  };
  try {
    const rows = db.prepare(
      `SELECT gpu_model, gpu_name_detected, vram_gb, gpu_vram_mib, is_burst,
              last_heartbeat, is_paused, approval_status, status, stock_available
         FROM providers
        WHERE deleted_at IS NULL
          AND is_paused = 0
          AND COALESCE(approval_status, 'pending') = 'approved'
          AND COALESCE(status, 'online') NOT IN ('suspended','flagged','rejected','banned','disabled')`
    ).all();
    for (const r of rows) {
      const vramGb = (r.vram_gb != null && r.vram_gb > 0)
        ? r.vram_gb
        : (r.gpu_vram_mib ? r.gpu_vram_mib / 1024 : null);
      const gpuModel = r.gpu_name_detected || r.gpu_model;
      if (r.is_burst) {
        // Advertise all on-demand types ALWAYS, but availability tracks REAL
        // RunPod secure-cloud stock (stock_available, refreshed by the burst
        // stock-refresh cron). Out-of-stock types still show, with available:false.
        upsert(gpuModel, vramGb, r.stock_available !== 0);
        continue;
      }
      // native: only when heartbeating fresh
      if (!r.last_heartbeat) continue;
      const ageMs = Date.now() - new Date(r.last_heartbeat).getTime();
      if (ageMs < HEARTBEAT_FRESH_MS) upsert(gpuModel, vramGb);
    }
  } catch (_) { /* providers table unavailable */ }
  return Array.from(byType.values()).sort((a, b) => (b.vram_gb || 0) - (a.vram_gb || 0));
}

const sweepIntervalMsRaw = Number.parseInt(process.env.JOB_SWEEP_INTERVAL_MS || '30000', 10);
const sweepIntervalMs = Number.isFinite(sweepIntervalMsRaw) && sweepIntervalMsRaw > 0 ? sweepIntervalMsRaw : 30000;
startJobSweep(db, sweepIntervalMs);
const providerOfflineSweepIntervalMs = Number.parseInt(process.env.PROVIDER_OFFLINE_SWEEP_INTERVAL_MS || '60000', 10);
startProviderOfflineSweep(db, Number.isFinite(providerOfflineSweepIntervalMs) && providerOfflineSweepIntervalMs > 0 ? providerOfflineSweepIntervalMs : 60000);
// Daily digest — rolls renter_notifications into ONE email/day per renter.
// Gated by NOTIFICATIONS_V2_ENABLED env flag; no-op until the migration has
// landed and the flag is flipped on.
startDailyDigest(db);
process.on('SIGTERM', () => { try { stopDailyDigest(); } catch (_e) { /* shutdown best-effort */ } });
process.on('SIGINT', () => { try { stopDailyDigest(); } catch (_e) { /* shutdown best-effort */ } });
const providerHealthCheckIntervalMs = Number.parseInt(process.env.PROVIDER_HEALTH_CHECK_INTERVAL_MS || String(5 * 60 * 1000), 10);
startProviderHealthWorker(db, Number.isFinite(providerHealthCheckIntervalMs) && providerHealthCheckIntervalMs > 0 ? providerHealthCheckIntervalMs : 5 * 60 * 1000);

const controlPlaneIntervalMsRaw = Number.parseInt(process.env.CONTROL_PLANE_INTERVAL_MS || '60000', 10);
const controlPlaneIntervalMs = Number.isFinite(controlPlaneIntervalMsRaw) && controlPlaneIntervalMsRaw > 0
  ? controlPlaneIntervalMsRaw
  : 60000;
const controlPlanePrewarmTopModels = Number.parseInt(process.env.CONTROL_PLANE_PREWARM_TOP_MODELS || '10', 10);
const controlPlanePrewarmLookbackDays = Number.parseInt(process.env.CONTROL_PLANE_PREWARM_LOOKBACK_DAYS || '7', 10);
const controlPlanePrewarmTargetWarm = Number.parseInt(process.env.CONTROL_PLANE_PREWARM_TARGET_WARM || '2', 10);
const controlPlaneAlertCooldownMs = Number.parseInt(process.env.CONTROL_PLANE_ALERT_COOLDOWN_MS || '900000', 10);
const controlPlanePrewarmScheduleUtc = String(process.env.CONTROL_PLANE_PREWARM_SCHEDULE_UTC || '').trim();
const controlPlaneLastAlertAt = {
  cycle_failed: 0,
  slo_breached: 0,
};

function parseUtcMinute(value) {
  const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWithinPrewarmWindow(now = new Date()) {
  if (!controlPlanePrewarmScheduleUtc) return true;
  const [startRaw, endRaw] = controlPlanePrewarmScheduleUtc.split('-');
  const startMinute = parseUtcMinute(startRaw);
  const endMinute = parseUtcMinute(endRaw);
  if (startMinute == null || endMinute == null) return true;

  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMinute <= endMinute) {
    return nowMinute >= startMinute && nowMinute < endMinute;
  }
  return nowMinute >= startMinute || nowMinute < endMinute;
}

async function maybeSendControlPlaneAlert(type, details) {
  const now = Date.now();
  const lastAt = controlPlaneLastAlertAt[type] || 0;
  if (now - lastAt < controlPlaneAlertCooldownMs) return;
  controlPlaneLastAlertAt[type] = now;
  try {
    await sendAlert('health_degraded', details);
  } catch (_) {}
}

async function runServerlessControlPlaneCycle() {
  try {
    const runPrewarm = isWithinPrewarmWindow();
    const result = runControlPlaneCycle({
      persistSignals: true,
      runPrewarm,
      prewarmTopModels: controlPlanePrewarmTopModels,
      prewarmLookbackDays: controlPlanePrewarmLookbackDays,
      prewarmTargetWarmProvidersPerModel: controlPlanePrewarmTargetWarm,
    });

    const signalCount = Number(result?.signals?.signal_count || 0);
    const requestedPreloads = Number(result?.prewarm?.requested_actions || 0);
    const coldStartP50 = result?.signals?.cold_start_p50_ms;
    const coldStartP95 = result?.signals?.cold_start_p95_ms;
    const queueBreaches = Number(result?.signals?.queue_slo_breaches || 0);
    const coldBreaches = Number(result?.signals?.cold_start_slo_breaches || 0);
    const utilBreaches = Number(result?.signals?.utilization_slo_breaches || 0);
    console.log(
      `[control-plane] cycle ok signals=${signalCount} prewarm_enabled=${runPrewarm ? 1 : 0} prewarm_requests=${requestedPreloads} cold_start_p50_ms=${coldStartP50 == null ? 'n/a' : coldStartP50} cold_start_p95_ms=${coldStartP95 == null ? 'n/a' : coldStartP95}`
    );

    if (queueBreaches > 0 || coldBreaches > 0 || utilBreaches > 0) {
      const details = `control-plane SLO breach: queue=${queueBreaches}, cold_start=${coldBreaches}, gpu_util=${utilBreaches}, prewarm_enabled=${runPrewarm ? 1 : 0}`;
      await maybeSendControlPlaneAlert('slo_breached', details);
    }
  } catch (error) {
    console.error('[control-plane] cycle failed:', error?.message || error);
    await maybeSendControlPlaneAlert('cycle_failed', `control-plane cycle failed: ${error?.message || error}`);
  }
}

runServerlessControlPlaneCycle();
setInterval(runServerlessControlPlaneCycle, controlPlaneIntervalMs);
console.log(`[control-plane] Serverless readiness cycle started (every ${controlPlaneIntervalMs}ms)`);

// Health check
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const sweep = getSweepMetrics();

    const providerCapacity = getProviderCapacitySnapshot();

    const jobsQueued = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status = 'queued'`
    ).get()?.count || 0;

    const jobsRunning = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status = 'running'`
    ).get()?.count || 0;

    // FIX #4: money-config readiness — surfaces whether card top-up can work
    // without leaking secrets. Source of truth lives in routes/payments.js.
    const payments = typeof paymentsRouter.getMoneyConfigReadiness === 'function'
      ? paymentsRouter.getMoneyConfigReadiness()
      : {
          payments_webhook_ready: false,
          payments_secret_ready: false,
          payout_source_ready: false,
          sandbox_topup_enabled: false,
        };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'ok',
      providers: {
        total: providerCapacity.total,
        online: providerCapacity.heartbeating,
        heartbeating: providerCapacity.heartbeating,
        endpoint_reachable: providerCapacity.endpoint_reachable,
        serving: providerCapacity.serving,
      },
      capacity: {
        serving_providers: providerCapacity.serving,
        reason: providerCapacity.capacity_reason,
        gates: ['fresh_heartbeat', 'endpoint_reachable', 'verified_online', 'model_coverage'],
      },
      jobs: { queued: jobsQueued, running: jobsRunning },
      payments,
      sweepErrors: sweep.sweepErrors,
      sweep,
    });
  } catch (err) {
    console.error('[health] Failed to run health checks:', err?.message || err);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Detailed health check — used by monitoring agents and QA during Phase 1
app.get('/api/health/detailed', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const sweep = getSweepMetrics();
    const now24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const providerCapacity = getProviderCapacitySnapshot();

    const jobsQueued = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status = 'queued'`
    ).get()?.count || 0;

    const jobsRunning = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status IN ('assigned','pulling','running')`
    ).get()?.count || 0;

    const jobsCompleted24h = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status = 'completed' AND updated_at >= ?`
    ).get(now24hAgo)?.count || 0;

    const jobsFailed24h = db.prepare(
      `SELECT COUNT(*) AS count FROM jobs WHERE status = 'failed' AND updated_at >= ?`
    ).get(now24hAgo)?.count || 0;

    // Models: count the live public catalog source. The optional Arabic
    // portfolio file only enriches catalog metadata; it is not the catalog.
    let modelCatalogCount = 0;
    try {
      modelCatalogCount = db.prepare(
        `SELECT COUNT(*) AS count FROM model_registry WHERE COALESCE(is_active, 1) = 1`
      ).get()?.count || 0;
    } catch { /* model_registry unavailable */ }

    // Templates: count .json files in docker-templates
    let templateCount = 0;
    try {
      const templatesDir = require('path').join(__dirname, '../../../docker-templates');
      templateCount = require('fs').readdirSync(templatesDir)
        .filter((f) => f.endsWith('.json')).length;
    } catch { /* templates dir unavailable */ }

    // Metering: v1/chat writes the canonical usage_events ledger. Keep the
    // legacy serve_sessions fallback for older proxy sessions only.
    let lastTokenRecordAt = null;
    let totalTokens24h = 0;
    try {
      const lastUsageEvent = db.prepare(
        `SELECT occurred_at FROM usage_events
         WHERE occurred_at IS NOT NULL
         ORDER BY occurred_at DESC
         LIMIT 1`
      ).get();
      lastTokenRecordAt = lastUsageEvent?.occurred_at || null;

      const tokens24h = db.prepare(
        `SELECT COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS total
         FROM usage_events
         WHERE occurred_at >= ?`
      ).get(now24hAgo);
      totalTokens24h = tokens24h?.total || 0;
    } catch { /* usage_events unavailable */ }
    if (!lastTokenRecordAt) {
      try {
        const lastSession = db.prepare(
          `SELECT last_inference_at FROM serve_sessions WHERE last_inference_at IS NOT NULL ORDER BY last_inference_at DESC LIMIT 1`
        ).get();
        lastTokenRecordAt = lastSession?.last_inference_at || null;

        const tokens24h = db.prepare(
          `SELECT COALESCE(SUM(total_tokens), 0) AS total FROM serve_sessions WHERE updated_at >= ?`
        ).get(now24hAgo);
        totalTokens24h = tokens24h?.total || 0;
      } catch { /* serve_sessions unavailable */ }
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      db: 'ok',
      providers: {
        registered: providerCapacity.total,
        online: providerCapacity.heartbeating,
        heartbeating: providerCapacity.heartbeating,
        endpoint_reachable: providerCapacity.endpoint_reachable,
        serving: providerCapacity.serving,
      },
      // Available GPU TYPES for the public status grid (type + vram_gb +
      // available). GPU-type only — no machine names, no node counts. Lets the
      // frontend render a GPU grid and drop the raw provider count.
      gpu_types: getAvailableGpuTypes(),
      capacity: {
        serving_providers: providerCapacity.serving,
        reason: providerCapacity.capacity_reason,
        gates: ['fresh_heartbeat', 'endpoint_reachable', 'verified_online', 'model_coverage'],
      },
      jobs: {
        queued: jobsQueued,
        running: jobsRunning,
        completed_24h: jobsCompleted24h,
        failed_24h: jobsFailed24h,
      },
      models: { catalog_count: modelCatalogCount },
      templates: { count: templateCount },
      metering: { last_token_record_at: lastTokenRecordAt, total_tokens_24h: totalTokens24h },
      sweep,
    });
  } catch (err) {
    console.error('[health/detailed] Failed to run health checks:', err?.message || err);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Public daemon latest-version endpoint (no auth required)
app.get('/api/daemon/latest-version', (req, res) => {
  const latestVersion = getLatestDaemonVersion();
  const downloadUrl = (process.env.DAEMON_DOWNLOAD_URL || 'https://api.dcp.sa/api/providers/download/daemon').trim();
  const changelog = (process.env.DAEMON_CHANGELOG || 'Stability and security improvements.').trim();
  res.json({
    version: latestVersion,
    download_url: downloadUrl,
    changelog,
  });
});

// OpenAPI spec — GET /api/docs
const OPENAPI_PATH = path.join(__dirname, '../../docs/openapi.yaml');
app.get('/api/docs', (req, res) => {
  if (!fs.existsSync(OPENAPI_PATH)) {
    return res.status(404).json({ error: 'OpenAPI spec not found' });
  }
  res.setHeader('Content-Type', 'application/yaml');

  res.sendFile(OPENAPI_PATH);
});

// Swagger UI — GET /api/docs/ui (CDN-hosted, no npm package required)
app.get('/api/docs/ui', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DCP API — Swagger UI</title>
  <!-- TITOFIX_M2_SWAGGER_SRI: pinned + integrity-protected -->
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous" />
  <style>
    body { margin: 0; background: #07070E; }
    .topbar { background: #07070E !important; }
    .topbar-wrapper img { display: none; }
    .topbar-wrapper::before {
      content: 'DCP API';
      color: #F5A524;
      font-size: 1.4rem;
      font-weight: 700;
      font-family: Inter, sans-serif;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/docs',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        deepLinking: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`);
});

// Default route -> API info (headless mode)
app.get('/', (req, res) => {
  res.json({
    service: 'dc1-platform-api',
    version: '4.0.0',
    status: 'ok',
    frontend: 'https://dcp.sa',
    docs: 'https://dcp.sa/docs',
    timestamp: new Date().toISOString(),
  });
});

// Start recovery cycle every 30 seconds
const { runRecoveryCycle } = require('./services/recovery-engine');
setInterval(runRecoveryCycle, 30 * 1000);
console.log('[recovery] Recovery cycle started (every 30s)');

// Start job timeout enforcement every 30 seconds
const { enforceJobTimeouts } = require('./routes/jobs');
setInterval(enforceJobTimeouts, 30 * 1000);
console.log('[timeout] Job timeout enforcement started (every 30s)');

// Start fallback loop (bottleneck detection + disconnect recovery) every 15 seconds
const { startLoop: startFallbackLoop } = require('./services/fallback-loop');
startFallbackLoop();

// Start provider liveness monitor — marks providers offline on missed heartbeats (DCP-804)
const providerLivenessMonitor = require('./services/providerLivenessMonitor');
providerLivenessMonitor.start();

// Start data retention cleanup (runs daily at 2:00 AM UTC — DCP-59)
const cleanup = require('./services/cleanup');
cleanup.schedule();

// Auto-top-up paused-renter sweep — retries charges once the 24h pause window
// elapses. Runs every 15 minutes. Idle when no renters are paused.
const autoTopupService = require('./services/autoTopupService');
const dbModuleForSweep = require('./db');
const { recordCronTick } = require('./services/cronHeartbeat');
const AUTO_TOPUP_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
async function runAutoTopupSweep() {
  try {
    const r = await autoTopupService.sweepPausedRenters(dbModuleForSweep._db || dbModuleForSweep);
    if (r.swept > 0) {
      console.log(`[auto_topup.sweep] swept=${r.swept} retried=${r.retried}`);
    }
    recordCronTick('auto_topup_sweep', {
      outcome: 'ok',
      intervalMs: AUTO_TOPUP_SWEEP_INTERVAL_MS,
      summary: r,
    });
  } catch (err) {
    console.error('[auto_topup.sweep] error:', err?.message || err);
    try {
      recordCronTick('auto_topup_sweep', {
        outcome: 'error',
        intervalMs: AUTO_TOPUP_SWEEP_INTERVAL_MS,
        error: err?.message || String(err),
      });
    } catch (_) { /* heartbeat write must never bring down the cron */ }
  }
}
setInterval(runAutoTopupSweep, AUTO_TOPUP_SWEEP_INTERVAL_MS);
console.log(`[auto_topup] paused-renter sweep started (every ${AUTO_TOPUP_SWEEP_INTERVAL_MS / 60000}m)`);

// Payout reconciliation sweep — pings Moyasar for status on payouts that have
// been 'processing' for longer than 15 min without a webhook update. Catches
// dropped/delayed webhooks. Runs every 15 minutes. Idle when no rows match.
const payoutService = require('./services/payoutService');
const PAYOUT_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
async function runPayoutReconcile() {
  try {
    const r = await payoutService.reconcileProcessingPayouts(dbModuleForSweep._db || dbModuleForSweep);
    if (r.swept > 0) {
      console.log(`[payout.reconcile] swept=${r.swept} transitioned=${r.transitioned} errors=${r.errors}`);
    }
    recordCronTick('payout_reconcile', {
      outcome: 'ok',
      intervalMs: PAYOUT_RECONCILE_INTERVAL_MS,
      summary: r,
    });
  } catch (err) {
    console.error('[payout.reconcile] error:', err?.message || err);
    try {
      recordCronTick('payout_reconcile', {
        outcome: 'error',
        intervalMs: PAYOUT_RECONCILE_INTERVAL_MS,
        error: err?.message || String(err),
      });
    } catch (_) {}
  }
}
setInterval(runPayoutReconcile, PAYOUT_RECONCILE_INTERVAL_MS);
console.log(`[payout] reconciliation sweep started (every ${PAYOUT_RECONCILE_INTERVAL_MS / 60000}m)`);

// Audit C3 — backend-side endpoint reachability probe (30s loop).
// Detects providers whose daemon heartbeats but whose vllm_endpoint_url is
// dead from this VPS (Cloudflare tunnel killed, WG mesh IP not routable, etc).
const providerProbe = require('./lib/provider-probe');
providerProbe.startProbeLoop();

// EARNED-ONLINE verification (60s loop). ADDITIVE layer alongside the probe
// above: it does not touch routing (endpoint_reachable). Instead it makes a
// backend-initiated GET /v1/models + 1-token POST /v1/chat/completions against
// each fresh-heartbeat provider and records "earned online" state in its own
// provider_verification table, surfaced via /api/admin/fleet/health.
const providerVerification = require('./services/providerVerification');
// `db` is the module-scoped handle required earlier in this file (above the
// job sweep). Reuse it rather than redeclaring to avoid a const collision.
providerVerification.startProviderVerification(db);

// Final error handler — never leak stack traces or the absolute /root deploy
// path to clients, regardless of NODE_ENV. Defense-in-depth: Express's default
// dev handler dumps err.stack on any thrown error when NODE_ENV !== 'production',
// which has leaked server internals (and the root run path) on the live API.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (res.headersSent) return _next(err);
  const isCors = err && err.message === 'Not allowed by CORS';
  const status = isCors ? 403 : (err && err.status) || 500;
  if (status >= 500) console.error('[server] unhandled error:', err && err.stack ? err.stack : err);
  res.status(status).json({ error: isCors ? 'Origin not allowed' : 'Internal server error' });
});

// FIX #4: boot guard for money-config. In production we DO NOT hard-fail when
// Moyasar keys are absent (they legitimately are not provisioned yet) — we emit
// one loud, explicit multi-line warning listing exactly what is unset and that
// card top-up is therefore disabled. Never throw here.
function warnIfMoneyConfigMissing() {
  if (process.env.NODE_ENV !== 'production') return;
  const readiness = typeof paymentsRouter.getMoneyConfigReadiness === 'function'
    ? paymentsRouter.getMoneyConfigReadiness()
    : {};

  const missing = [];
  if (!readiness.payments_secret_ready) missing.push('MOYASAR_SECRET_KEY');
  if (!readiness.payments_webhook_ready) missing.push('MOYASAR_WEBHOOK_SECRET');
  if (!readiness.payout_source_ready) missing.push('MOYASAR_PAYOUT_SOURCE_ID');

  if (missing.length === 0) return;

  console.warn('');
  console.warn('================================================================');
  console.warn('  [startup] PAYMENTS NOT FULLY CONFIGURED (production)');
  console.warn('  Card top-up via Moyasar is DISABLED until these are set:');
  for (const key of missing) {
    console.warn(`    - ${key} is UNSET`);
  }
  console.warn('  Renters can still top up via bank transfer (manual IBAN flow)');
  console.warn('  if DCP_BANK_IBAN is configured. Card payments will return 503.');
  console.warn('  This is a warning, not a fatal error — boot continues.');
  console.warn('================================================================');
  console.warn('');
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DCP Platform API (headless) running on port ${PORT}`);
    console.log(`API:  http://localhost:${PORT}/api`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    warnIfMoneyConfigMissing();
  });
}

module.exports = app;
