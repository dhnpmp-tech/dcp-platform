const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const router = express.Router();

// Database (use existing connection)
const db = require('../db');
const {
    publicProvidersLimiter,
    providerAccountDeletionLimiter,
    providerDataExportLimiter,
    heartbeatProviderLimiter,
    authLimiter,
    registerLimiter,
} = require('../middleware/rateLimiter');
const { isAdminRequest, getBearerToken } = require('../middleware/auth');
const { resolveRenterWebhookSecret } = require('../lib/webhook-secret');
const { safeErrorPayload } = require('../lib/error-response');
const { getChainEscrow } = require('../services/escrow-chain');
const { sendAlert } = require('../services/notifications');
const {
    sendWelcomeEmail,
    sendJobStarted,
    sendJobCompleted,
    sendJobFailed,
    sendDataExportReady,
} = require('../services/emailService');
const {
    announceFromProviderHeartbeat,
} = require('../services/p2p-discovery');
const { getBenchmarkResult } = require('../services/benchmarkRunner');
const { findActiveAccountByEmail, buildConflictResponse } = require('../services/cross-role-uniqueness');
const {
    appendAttemptLogLines,
    appendAttemptRawText,
    getAttemptLogPath,
} = require('../services/job-execution-logs');
const {
    evaluateProviderModelCompatibility,
} = require('../services/vllmCompatibilityMatrix');
const { isPublicWebhookUrl, isResolvablePublicWebhookUrl } = require('../lib/webhook-security');
const { normalizeProviderOs } = require('../lib/provider-os');
const { toCatalogContractCore } = require('../lib/model-catalog-contract');
const { validateBody } = require('../middleware/validate');
const { providerRegisterSchema, providerBenchmarkSchema } = require('../schemas/providers.schema');
const analytics = require('../services/analyticsService');
const conversionFunnel = require('../services/conversionFunnelService');

function flattenRunParams(params) {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
    return db.prepare(sql).run(...flattenRunParams(params));
}

// ── Migration 008 helpers: pull-task channel ────────────────────────────────

// Apply task_updates[] from heartbeat body. Each update may set progress, mark
// completed/failed, or update status mid-pull. When a pull_model task completes
// we re-dispatch the source job (lift it out of warming_provider).
function applyTaskUpdates(providerId, updates, nowIso) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    for (const raw of updates) {
        const taskId = toFiniteInt(raw?.task_id, { min: 1 });
        if (!taskId) continue;
        // Confirm the task belongs to this provider (defense in depth).
        const task = db.get('SELECT * FROM pending_provider_tasks WHERE id = ? AND provider_id = ?', taskId, providerId);
        if (!task) continue;
        const newStatus = ['in_progress', 'completed', 'failed'].includes(raw?.status) ? raw.status : task.status;
        const progressPct = toFiniteInt(raw?.progress_pct, { min: 0, max: 100 }) ?? task.progress_pct ?? 0;
        const progressMessage = normalizeString(raw?.progress_message, { maxLen: 500 }) || task.progress_message || null;
        const errorReason = normalizeString(raw?.error_reason, { maxLen: 500 }) || (newStatus === 'failed' ? 'unspecified' : task.error_reason);
        const isTerminal = newStatus === 'completed' || newStatus === 'failed';
        const pickedUpAt = (newStatus === 'in_progress' && !task.picked_up_at) ? nowIso : task.picked_up_at;
        const completedAt = isTerminal ? nowIso : null;
        runStatement(
            `UPDATE pending_provider_tasks
                SET status = ?, progress_pct = ?, progress_message = ?, error_reason = ?,
                    picked_up_at = COALESCE(?, picked_up_at),
                    last_progress_at = ?,
                    completed_at = ?
              WHERE id = ?`,
            newStatus, progressPct, progressMessage, errorReason,
            pickedUpAt, nowIso, completedAt,
            taskId
        );
        // On successful pull, lift the source job from 'warming_provider' to
        // 'pending' so the normal dispatch path picks it up next tick.
        if (newStatus === 'completed' && task.task_type === 'pull_model' && task.source_job_id) {
            try {
                runStatement(
                    `UPDATE jobs SET status = 'pending', updated_at = ? WHERE job_id = ? AND status = 'warming_provider'`,
                    nowIso, task.source_job_id
                );
            } catch (e) {
                console.warn('[heartbeat/applyTaskUpdates] failed to lift job from warming:', e?.message);
            }
        }
    }
}

// Fetch queued tasks for a provider, plus enough catalog metadata for the
// agent to act without a follow-up backend call. Returns at most 5 tasks
// per heartbeat to keep agent context short.
function fetchPendingTasksForProvider(providerId) {
    const rows = db.all(
        `SELECT t.id AS task_id, t.task_type, t.params_json, t.status, t.created_at,
                t.progress_pct
           FROM pending_provider_tasks t
          WHERE t.provider_id = ?
            AND t.status IN ('queued', 'in_progress')
          ORDER BY t.created_at ASC
          LIMIT 5`,
        providerId
    );
    return rows.map((r) => {
        let params = null;
        try { params = r.params_json ? JSON.parse(r.params_json) : null; } catch { params = null; }
        return {
            task_id: r.task_id,
            task_type: r.task_type,
            status: r.status,
            progress_pct: r.progress_pct,
            params,
            created_at: r.created_at,
        };
    });
}

function recordActivationEvent(providerId, eventCode, metadata = null) {
    try {
        runStatement(
            `INSERT INTO provider_activation_events (provider_id, event_code, occurred_at, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            providerId,
            eventCode,
            new Date().toISOString(),
            metadata ? JSON.stringify(metadata) : null,
            new Date().toISOString()
        );
    } catch (error) {
        console.warn('[provider-activation-event] failed to persist event', {
            providerId,
            eventCode,
            message: error?.message || String(error),
        });
    }
}

// ── Heartbeat HMAC validation ────────────────────────────────────────────────
// Daemons sign the raw request body with HMAC-SHA256 using DC1_HMAC_SECRET.
// Header format: X-DC1-Signature: sha256=<hex>
//
// Enforcement controlled by DC1_REQUIRE_HEARTBEAT_HMAC env var:
//   unset / "0" — warn only (backward-compatible, existing daemons work)
//   "1"         — reject requests without a valid signature
//
function verifyHeartbeatHmac(req) {
    const hmacSecret = process.env.DC1_HMAC_SECRET;
    if (!hmacSecret) return { valid: false, reason: 'DC1_HMAC_SECRET not configured' };

    const signatureHeader = req.headers['x-dc1-signature'];
    if (!signatureHeader) return { valid: false, reason: 'X-DC1-Signature header missing' };

    const match = String(signatureHeader).trim().match(/^sha256=([a-f0-9]{64})$/i);
    if (!match) return { valid: false, reason: 'X-DC1-Signature format invalid (expected sha256=<64 hex chars>)' };

    const rawBody = req.rawBody;
    if (!rawBody) return { valid: false, reason: 'Raw body unavailable for HMAC check' };

    const expected = crypto.createHmac('sha256', hmacSecret).update(rawBody).digest('hex');
    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(match[1].toLowerCase(), 'hex')
        );
        return { valid: isValid, reason: isValid ? null : 'HMAC mismatch' };
    } catch {
        return { valid: false, reason: 'HMAC comparison failed' };
    }
}

// Import shared billing rates from jobs module
const { COST_RATES } = require('./jobs');

// Daemon versions:
// - latest: preferred newest version for update nudges
// - minimum: hard floor for compatibility checks
const LATEST_DAEMON_VERSION = (process.env.DAEMON_VERSION || '4.1.0').trim();
const MIN_DAEMON_VERSION = (process.env.MIN_DAEMON_VERSION || LATEST_DAEMON_VERSION).trim();
const WINDOWS_INSTALLER_PATH = path.join(__dirname, '../../installers/dcp-provider-setup-Windows.exe');
const LINUX_INSTALL_SCRIPT_PATH = path.join(__dirname, '../../public/install.sh');
const VLLM_COMPATIBILITY_MATRIX_PATH = path.join(__dirname, '../../../infra/vllm-configs/compatibility-matrix.json');
// Auth rate limiting: use the centralized authLimiter (5/IP/15min — brute force protection, DCP-855).
const loginEmailLimiter = authLimiter;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAUDI_IBAN_REGEX = /^SA\d{22}$/i;
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
    if (typeof value !== 'string') return null;
    const next = trim ? value.trim() : value;
    if (!next) return null;
    return next.slice(0, maxLen);
}

function normalizeEmail(value) {
    const normalized = normalizeString(value, { maxLen: 254 })?.toLowerCase() || null;
    if (!normalized || !EMAIL_REGEX.test(normalized)) return null;
    return normalized;
}

function normalizeSingleQueryParam(value, { maxLen = 128 } = {}) {
    if (typeof value !== 'string') return null;
    return normalizeString(value, { maxLen, trim: false });
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

// Audit C1 (SSRF mitigation, 2026-05-11): the prior validator on
// vllm_endpoint_url was a regex `^https?://.+` — that admits
// http://169.254.169.254/latest/meta-data/iam/security-credentials/
// (AWS metadata), http://127.0.0.1:8083/api/admin/... (own backend),
// http://metadata.google.internal/ (GCP), Redis sockets, etc. Once the
// renter hits /v1/chat/completions, the backend issues fetch(url) and
// returns the body to the renter → credential exfiltration.
//
// New rule (synchronous — no DNS round-trip):
//   1. URL parses, scheme is http:// or https://
//   2. Hostname is a dotted-quad IPv4 (no DNS hostnames at all)
//   3. IPv4 is either:
//      - WG mesh: 10.8.0.0/24 (legitimate provider endpoint), OR
//      - Public unicast (NOT 10.0.0.0/8 outside mesh, 127/8, 169.254/16,
//        172.16/12, 192.168/16, 0.0.0.0, link-local, multicast, broadcast)
//   4. Port is in the inference allowlist:
//      8000 (vLLM default), 11434 (Ollama), 8080 (common alt)
//      or 9000-9999 (custom provider ports)
function _isPrivateIPv4(parts) {
    const [a, b] = parts;
    if (a === 0) return true;                      // 0.0.0.0/8
    if (a === 127) return true;                    // loopback
    if (a === 169 && b === 254) return true;       // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;       // 192.168/16
    if (a >= 224) return true;                     // multicast / reserved
    return false;
}
function _isWgMeshIPv4(parts) {
    // Our WireGuard mesh on the VPS uses 10.8.0.0/24 per
    // infra_wireguard_server.md. Providers registering 10.8.0.X is
    // legitimate; any other 10.x.x.x is a rogue private network.
    return parts[0] === 10 && parts[1] === 8 && parts[2] === 0;
}
function _isPrivateNonMeshIPv4(parts) {
    if (parts[0] === 10 && !(parts[1] === 8 && parts[2] === 0)) return true;
    return _isPrivateIPv4(parts);
}
const _ALLOWED_INFERENCE_PORTS = new Set([8000, 11434, 8080]);
function _portAllowed(port) {
    if (_ALLOWED_INFERENCE_PORTS.has(port)) return true;
    if (port >= 9000 && port <= 9999) return true;
    return false;
}
function sanitizeVllmEndpointUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch {
        return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // hostname must be dotted-quad IPv4 (refuse FQDNs that would need DNS,
    // refuse IPv6, refuse anything weird)
    const ipMatch = u.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipMatch) return null;
    const parts = ipMatch.slice(1, 5).map(Number);
    if (parts.some((n) => n < 0 || n > 255)) return null;
    // Allow WG mesh OR public unicast (block everything private/special)
    if (_isWgMeshIPv4(parts)) {
        // mesh IP — allowed
    } else if (_isPrivateNonMeshIPv4(parts)) {
        return null;
    }
    // Port allowlist
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    if (!_portAllowed(port)) return null;
    // Return canonical form (strip trailing slash, normalize)
    return `${u.protocol}//${u.hostname}:${port}`.replace(/\/+$/, '');
}

const PROVIDER_REACTIVATION_TOKEN_TTL_SECONDS = 15 * 60;
const PROVIDER_REACTIVATION_TOKEN_MIN_TTL_SECONDS = 1;
const PROVIDER_REACTIVATION_TOKEN_MAX_TTL_SECONDS = 60 * 60;

function toBase64Url(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value) {
    if (typeof value !== 'string' || !value) return null;
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    try {
        return Buffer.from(padded, 'base64').toString('utf8');
    } catch (_) {
        return null;
    }
}

function getProviderReactivationTokenSecret() {
    return normalizeString(
        process.env.PROVIDER_REACTIVATION_TOKEN_SECRET || process.env.DC1_HMAC_SECRET || '',
        { maxLen: 1024, trim: false }
    );
}

function hashProviderApiKey(apiKey) {
    return crypto.createHash('sha256').update(String(apiKey || '')).digest('hex');
}

function signProviderReactivationTokenPayload(payloadBase64, secret) {
    return crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
}

function issueProviderReactivationToken(provider, ttlSeconds = PROVIDER_REACTIVATION_TOKEN_TTL_SECONDS) {
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = toFiniteInt(ttlSeconds, {
        min: PROVIDER_REACTIVATION_TOKEN_MIN_TTL_SECONDS,
        max: PROVIDER_REACTIVATION_TOKEN_MAX_TTL_SECONDS,
    }) || PROVIDER_REACTIVATION_TOKEN_TTL_SECONDS;
    const secret = getProviderReactivationTokenSecret();
    if (!secret) return { token: null, error: 'Provider reactivation token secret is not configured' };

    const payload = {
        pid: provider.id,
        kf: hashProviderApiKey(provider.api_key),
        iat: nowSec,
        exp: nowSec + ttl,
        nonce: crypto.randomBytes(8).toString('hex'),
    };
    const payloadBase64 = toBase64Url(JSON.stringify(payload));
    const signature = signProviderReactivationTokenPayload(payloadBase64, secret);
    return {
        token: `${payloadBase64}.${signature}`,
        expiresAtIso: new Date(payload.exp * 1000).toISOString(),
    };
}

function verifyProviderReactivationToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) {
        return { valid: false, reason: 'invalid' };
    }

    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature || signature.length !== 64 || /[^a-f0-9]/i.test(signature)) {
        return { valid: false, reason: 'invalid' };
    }

    const secret = getProviderReactivationTokenSecret();
    if (!secret) return { valid: false, reason: 'misconfigured' };

    const expectedSignature = signProviderReactivationTokenPayload(payloadBase64, secret);
    try {
        const signatureMatches = crypto.timingSafeEqual(
            Buffer.from(signature.toLowerCase(), 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
        if (!signatureMatches) return { valid: false, reason: 'invalid' };
    } catch (_) {
        return { valid: false, reason: 'invalid' };
    }

    const payloadRaw = fromBase64Url(payloadBase64);
    if (!payloadRaw) return { valid: false, reason: 'invalid' };

    let payload = null;
    try {
        payload = JSON.parse(payloadRaw);
    } catch (_) {
        return { valid: false, reason: 'invalid' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const providerId = toFiniteInt(payload?.pid, { min: 1 });
    const expiresAt = toFiniteInt(payload?.exp, { min: 1 });
    const keyFingerprint = normalizeString(payload?.kf, { maxLen: 128, trim: false });
    if (!providerId || !expiresAt || !keyFingerprint || keyFingerprint.length < 32) {
        return { valid: false, reason: 'invalid' };
    }
    if (expiresAt <= nowSec) {
        return { valid: false, reason: 'expired' };
    }
    return {
        valid: true,
        payload: {
            providerId,
            keyFingerprint,
            expiresAt,
        },
    };
}

function getProviderReactivationCommands(providerApiKey) {
    const cleanKey = normalizeString(providerApiKey, { maxLen: 128, trim: false }) || '';
    const encodedKey = encodeURIComponent(cleanKey);
    const backendBase = (process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa').replace(/\/+$/, '');
    const setupBase = `${backendBase}/api/providers/download/setup?key=${encodedKey}`;
    const daemonDownloadUrl = `${backendBase}/api/providers/download/daemon?key=${encodedKey}`;

    return {
        daemon_download_url: daemonDownloadUrl,
        linux: {
            setup_url: `${setupBase}&os=linux`,
            install_command: `curl -fsSL "${setupBase}&os=linux" | bash`,
        },
        mac: {
            setup_url: `${setupBase}&os=mac`,
            install_command: `curl -fsSL "${setupBase}&os=mac" | bash`,
        },
        windows: {
            setup_url: `${setupBase}&os=windows`,
            install_command: `powershell -ExecutionPolicy Bypass -Command "iwr '${setupBase}&os=windows' -UseBasicParsing | iex"`,
        },
    };
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseContainerSpec(containerSpecRaw) {
    if (!containerSpecRaw) return null;
    if (typeof containerSpecRaw === 'string') {
        try {
            const parsed = JSON.parse(containerSpecRaw);
            return isPlainObject(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return isPlainObject(containerSpecRaw) ? containerSpecRaw : null;
}

function fireAndForgetJobEmail(event, job, details = {}) {
    try {
        if (!job?.renter_id) return;
        const renter = db.get('SELECT email FROM renters WHERE id = ?', job.renter_id);
        const renterEmail = normalizeString(renter?.email, { maxLen: 254 })?.toLowerCase();
        if (!renterEmail) return;

        const containerSpec = parseContainerSpec(job.container_spec);
        const payload = {
            job_id: job.job_id,
            job_type: job.job_type,
            image_type: containerSpec?.image_type || null,
            estimated_duration_minutes: Number((details.estimated_duration_minutes ?? job.duration_minutes) || 0),
            actual_cost_halala: Number((details.actual_cost_halala ?? job.actual_cost_halala) || 0),
            gpu_seconds_used: details.gpu_seconds_used,
            refunded_amount_halala: Number((details.refunded_amount_halala ?? job.cost_halala) || 0),
            retry_attempts: Number((details.retry_attempts ?? job.restart_count ?? job.retry_count) || 0),
            last_error: normalizeString(details.last_error || job.last_error || job.error, { maxLen: 1000 }),
        };

        let pendingSend = null;
        if (event === 'started') pendingSend = sendJobStarted(renterEmail, payload);
        if (event === 'completed') pendingSend = sendJobCompleted(renterEmail, payload);
        if (event === 'failed') pendingSend = sendJobFailed(renterEmail, payload);
        if (!pendingSend || typeof pendingSend.then !== 'function') return;

        pendingSend.catch((err) => {
            console.error(`[providers/email:${event}] Failed for ${job.job_id}:`, err.message);
        });
    } catch (error) {
        console.error(`[providers/email:${event}] Unexpected error:`, error.message);
    }
}

const ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ROTATIONS_PER_WINDOW = 3;

function isRotationRateLimited(accountType, accountId) {
    const cutoff = new Date(Date.now() - ROTATION_WINDOW_MS).toISOString();
    const row = db.get(
        `SELECT COUNT(*) AS rotation_count
         FROM api_key_rotations
         WHERE account_type = ? AND account_id = ? AND rotated_at >= ?`,
        accountType,
        accountId,
        cutoff
    );
    return Number(row?.rotation_count || 0) >= MAX_ROTATIONS_PER_WINDOW;
}

function recordRotationEvent(accountType, accountId, rotatedAt) {
    runStatement(
        'INSERT INTO api_key_rotations (account_type, account_id, rotated_at) VALUES (?, ?, ?)',
        accountType,
        accountId,
        rotatedAt
    );
}

function hashedDeletedEmail(rawEmail, accountId) {
    const fallback = `deleted-provider-${accountId}@dcp.sa`;
    const normalized = normalizeEmail(rawEmail) || fallback;
    const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
    return `deleted_${digest}@deleted.dcp.sa`;
}
const benchmarkLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many requests. Limit is 30 requests per minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Semantic version comparison: returns -1 (v1<v2), 0 (equal), 1 (v1>v2)
function compareVersions(v1, v2) {
    const p1 = (v1 || '0').split('.').map(Number);
    const p2 = (v2 || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const a = p1[i] || 0, b = p2[i] || 0;
        if (a < b) return -1;
        if (a > b) return 1;
    }
    return 0;
}

function signWebhookPayload(secret, payloadJson) {
    return crypto.createHmac('sha256', secret).update(payloadJson).digest('hex');
}

const CAPACITY_RESERVED_JOB_STATUSES = ['pending', 'assigned', 'pulling', 'running'];

async function notifyRenterJobWebhook(job, eventName, details = {}) {
    try {
        const allowPrivateWebhookUrl = process.env.NODE_ENV === 'test' || process.env.ALLOW_PRIVATE_WEBHOOK_URLS === '1';
        if (!job?.renter_id) return { sent: false, reason: 'missing_renter_id' };

        const renter = db.get(
            'SELECT id, api_key, webhook_url, status FROM renters WHERE id = ?',
            job.renter_id
        );
        if (!renter || renter.status !== 'active' || !renter.webhook_url) {
            return { sent: false, reason: 'webhook_not_configured' };
        }
        if (!allowPrivateWebhookUrl && !isPublicWebhookUrl(renter.webhook_url)) {
            return { sent: false, reason: 'webhook_url_blocked' };
        }
        if (!allowPrivateWebhookUrl && !(await isResolvablePublicWebhookUrl(renter.webhook_url))) {
            return { sent: false, reason: 'webhook_dns_blocked' };
        }

        const now = new Date().toISOString();
        const payload = {
            event: eventName,
            timestamp: now,
            job: {
                id: job.id,
                job_id: job.job_id,
                renter_id: job.renter_id,
                provider_id: job.provider_id,
                status: job.status,
                job_type: job.job_type,
                submitted_at: job.submitted_at,
                started_at: job.started_at,
                completed_at: details.completed_at || now,
                restart_count: Number(job.restart_count || 0),
                last_error: details.last_error || job.last_error || null,
            },
            billing: details.billing || null,
        };
        const payloadJson = JSON.stringify(payload);
        // Audit M6 — per-renter webhook secret, never the api_key.
        const secret = resolveRenterWebhookSecret(renter.id);
        if (!secret) {
            return { sent: false, reason: 'webhook_secret_unavailable' };
        }
        const signature = signWebhookPayload(secret, payloadJson);

        const response = await fetch(renter.webhook_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-DCP-Event': eventName,
                'X-DCP-Signature': signature,
            },
            body: payloadJson,
            signal: AbortSignal.timeout(5000),
        });

        return { sent: true, ok: response.ok, status: response.status };
    } catch (error) {
        console.error('[providers/webhook] Failed to notify renter webhook:', error.message);
        return { sent: false, reason: error.message };
    }
}

// ============================================================================
// POST /api/providers/register - Register new provider
// ============================================================================
router.post('/register', registerLimiter, validateBody(providerRegisterSchema), async (req, res) => {
    try {
        const { name, email, gpu_model, os, phone, location, resource_spec } = req.body;
        const cleanName = normalizeString(name, { maxLen: 120 });
        const cleanEmail = normalizeEmail(email);
        const cleanGpuModel = normalizeString(gpu_model, { maxLen: 120 });
        const rawOs = normalizeString(os, { maxLen: 40 });
        const cleanOs = normalizeProviderOs(rawOs || '');
        const cleanLocation = normalizeString(location, { maxLen: 200 });

        // Validate inputs
        if (!cleanName || !cleanEmail || !cleanGpuModel || !rawOs) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!cleanOs) {
            return res.status(400).json({ error: 'Invalid OS value' });
        }

        // Check for similar existing accounts (fuzzy duplicate detection)
        const similar = db.all(
            `SELECT id, name, email, status FROM providers
             WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)
             LIMIT 3`,
            cleanEmail, cleanName
        );
        if (similar.length > 0) {
            const matches = similar.map(s => `${s.name} (${s.email}, ${s.status})`).join('; ');
            console.warn(`[registration] Potential duplicate for "${cleanName}" <${cleanEmail}>: ${matches}`);
        }

        // Dual-role allowed: the historical hard block (see migration 006) was
        // softened on 2026-05-09 because real users (Tareq, Fadi) hit it during
        // onboarding. The same email can now hold both a provider and a
        // renter row. We log cross-role state for visibility.
        const conflict = findActiveAccountByEmail(db, cleanEmail);
        if (conflict && conflict.role !== 'provider') {
            console.log(`[providers/register] dual-role onboarding: ${cleanEmail} already has ${conflict.role} (id=${conflict.id})`);
        }

        // Generate unique API key
        const api_key = 'dcp-provider-' + crypto.randomBytes(16).toString('hex');

        // Generate unique provider ID
        const provider_id = 'prov-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Validate resource_spec if provided
        let resourceSpecJson = null;
        if (resource_spec && (typeof resource_spec === 'string' || isPlainObject(resource_spec))) {
            try {
                resourceSpecJson = typeof resource_spec === 'string'
                    ? resource_spec
                    : JSON.stringify(resource_spec);
            } catch (_) {}
        }

        // Save to database — default supported_compute_types to ["inference"] so
        // the provider is eligible for inference routing immediately after going online.
        const result = await runStatement(
            `INSERT INTO providers (name, email, gpu_model, os, api_key, status, approval_status, created_at, location, resource_spec, supported_compute_types)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cleanName, cleanEmail, cleanGpuModel, cleanOs, api_key, 'registered', 'pending', new Date().toISOString(), cleanLocation, resourceSpecJson, '["inference"]']
        );
        
        // Return canonical setup download route so clients can follow the URL directly.
        const installer_url = `/api/providers/download/setup?key=${api_key}&os=${encodeURIComponent(cleanOs)}`;
        
        res.json({
            success: true,
            provider_id: result.lastInsertRowid,
            api_key,
            installer_url,
            message: `Welcome ${cleanName}! Your API key is ready. Download the installer to get started.`
        });

        // Fire-and-forget: welcome email + analytics
        sendWelcomeEmail(cleanEmail, cleanName, api_key, 'provider')
            .catch((e) => console.error('[providers.register] welcome email failed:', e.message));
        analytics.provider.signupComplete(result.lastInsertRowid, {
            gpu_model: cleanGpuModel,
            os: cleanOs,
        }).catch(() => {});
        conversionFunnel.trackStage({
            journey: 'provider',
            stage: 'register',
            actorType: 'provider',
            actorId: result.lastInsertRowid,
            req,
            inferViewOnRegister: true,
            metadata: {
                gpu_model: cleanGpuModel,
                os: cleanOs,
            },
        });
        
    } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A provider with this email already exists' });
    }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================================
// POST /api/providers/login-email - Login with email instead of API key
// ============================================================================

// --- SUPABASE AUTH OTP (Real Magic Link) ---
const { sendOtp, verifyOtp } = require('../services/auth-otp');

// POST /api/providers/send-otp - Send magic link OTP code via Supabase Auth
router.post('/send-otp', loginEmailLimiter, async (req, res) => {
  try {
    const { email, desktop_callback } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return res.status(400).json({ error: 'Valid email is required' });

    // `desktop_callback` is optional. When the native DCP Provider desktop
    // app initiates sign-in, it spins up a local loopback HTTP server and
    // passes its URL here. auth-otp.js validates loopback-only and embeds
    // it in the magic-link URL; non-loopback URLs are dropped silently.
    const result = await sendOtp(cleanEmail, {
      requestedRole: 'provider',
      desktopCallback: typeof desktop_callback === 'string' ? desktop_callback : null,
    });
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send verification code' });
    }

    res.json({ success: true, message: 'Sign-in link sent to your email' });
  } catch (error) {
    console.error('Provider OTP send error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// POST /api/providers/verify-otp - Verify OTP code and return API key
router.post('/verify-otp', loginEmailLimiter, async (req, res) => {
  try {
    const { email, token } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return res.status(400).json({ error: 'Valid email is required' });
    if (!token) return res.status(400).json({ error: 'Verification code is required' });

    const otpResult = await verifyOtp(cleanEmail, token);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.error || 'Invalid or expired verification code' });
    }

    // OTP verified via Supabase Auth - now find the provider in SQLite
    const provider = db.get('SELECT * FROM providers WHERE LOWER(email) = LOWER(?)', cleanEmail);

    if (!provider) {
      return res.status(404).json({ error: 'No provider account found with this email. Register first.' });
    }

    res.json({
      success: true,
      api_key: provider.api_key,
      provider: {
        id: provider.id,
        name: provider.name,
        email: provider.email,
        gpu_model: provider.gpu_model,
        status: provider.status,
      }
    });
  } catch (error) {
    console.error('Provider OTP verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// DCP-896 SECURITY FIX: /login-email DISABLED — returned full API key with only
// email as "proof of identity" (no password, no OTP). This is an authentication
// bypass. Clients must use /send-otp + /verify-otp instead.
router.post('/login-email', loginEmailLimiter, (req, res) => {
    return res.status(410).json({
        error: 'This endpoint is disabled for security reasons.',
        instructions: 'Use POST /api/providers/send-otp to receive a verification code, then POST /api/providers/verify-otp to authenticate.',
    });
});

// ============================================================================
// GET /api/providers/installer - Download installer (with validation)
// ============================================================================
router.get('/installer', (req, res) => {
    try {
        const { key, os } = req.query;

        const cleanKey = normalizeSingleQueryParam(key, { maxLen: 128 });
        const cleanOs = normalizeSingleQueryParam(os, { maxLen: 24 });

        if (!cleanKey || !cleanOs) {
            return res.status(400).json({ error: 'Missing API key or OS' });
        }

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanKey);
        if (!provider) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        
        // Determine installer path
        const installerMap = {
            'Windows': 'dcp-provider-setup-Windows.exe',
            'Mac': 'dcp-provider-setup-Mac.pkg',
            'Linux': 'dcp-provider-setup-Linux.deb'
        };
        
        const installerFile = installerMap[cleanOs];
        if (!installerFile) {
            return res.status(400).json({ error: 'Invalid OS' });
        }
        
        const installerPath = path.join(__dirname, '../../installers', installerFile);
        
        // Check if file exists
        if (!fs.existsSync(installerPath)) {
            return res.status(404).json({ error: 'Installer not found' });
        }
        
        // Send file with appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${installerFile}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const fileStream = fs.createReadStream(installerPath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Installer download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// REPUTATION: compute uptime%, success_rate, and composite reputation_score
// Called on every heartbeat — rolls a 7-day window.
// Formula: 70% success_rate + 20% uptime + 10% longevity (0–100 each)
// ============================================================================
function computeReputationScore(providerId) {
    // 1. Uptime — heartbeats received in last 7 days vs expected (1/min = 10080)
    const EXPECTED_HEARTBEATS_7D = 7 * 24 * 60;
    const hbRow = db.get(
        `SELECT COUNT(*) AS cnt FROM heartbeat_log
         WHERE provider_id = ? AND received_at >= datetime('now', '-7 days')`,
        providerId
    );
    const uptimePct = Math.min((hbRow.cnt / EXPECTED_HEARTBEATS_7D) * 100, 100);

    // 2. Success rate — completed / (completed + failed) across all jobs
    const jobRow = db.get(
        `SELECT
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status IN ('completed','failed') THEN 1 ELSE 0 END) AS terminal
         FROM jobs WHERE provider_id = ?`,
        providerId
    );
    const successRate = (jobRow && jobRow.terminal > 0)
        ? (jobRow.completed / jobRow.terminal) * 100
        : 100; // default 100 while no terminal jobs exist

    // 3. Longevity — capped at 1.0 after 30 days of registration
    const provRow = db.get('SELECT created_at FROM providers WHERE id = ?', providerId);
    const daysSince = provRow?.created_at
        ? (Date.now() - new Date(provRow.created_at).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
    const longevityPct = Math.min(daysSince / 30, 1.0) * 100;

    const score = Math.round(0.7 * successRate + 0.2 * uptimePct + 0.1 * longevityPct);
    return {
        reputation_score: Math.min(score, 100),
        uptime_percent: Math.round(uptimePct * 10) / 10,
    };
}

// ============================================================================
// POST /api/providers/heartbeat - Provider heartbeat (GPU status update)
// ============================================================================
//
// HEARTBEAT API CONTRACT
// ----------------------
// What this endpoint is for:
//   The DCP daemon (dcp_daemon.py) running on the provider's machine sends
//   a periodic snapshot of GPU telemetry, daemon health, and reachability
//   info. The backend uses these heartbeats to keep the provider's status
//   fresh in the marketplace, score reputation, and feed the live
//   "providers online" metric on the dashboard.
//
// Frequency: every 30 seconds while the provider is active.
//
// IMPORTANT — POST ONLY:
//   This endpoint accepts ONLY HTTP POST. A manual `curl https://api.dcp.sa
//   /api/providers/heartbeat` (default GET) returns 404 because Express has
//   no GET handler at this path — that 404 is *not* an outage, it's normal
//   method-not-found. To probe the endpoint by hand, send a POST with a
//   minimal JSON body, e.g.
//     curl -X POST https://api.dcp.sa/api/providers/heartbeat \
//       -H 'Content-Type: application/json' \
//       -d '{"api_key":"<your-key>","gpu_status":{},"provider_ip":"x.x.x.x","provider_hostname":"host"}'
//
// Endpoint : POST /api/providers/heartbeat
// Auth     : api_key in request body (no header required)
//
// Required payload fields:
//   api_key        {string}  Provider API key issued at registration
//   gpu_status     {object}  GPU telemetry snapshot — see sub-fields below
//   provider_ip    {string}  Public IP of the provider machine
//   provider_hostname {string} Hostname of the provider machine
//
// gpu_status sub-fields:
//   gpu_name       {string}  GPU model name (e.g. "NVIDIA RTX 3090")
//   gpu_vram_mib   {number}  Total VRAM in MiB
//   driver_version {string}  NVIDIA driver version string
//   gpu_util_pct   {number}  GPU utilisation 0–100
//   temp_c         {number}  GPU temperature in °C
//   power_w        {number}  GPU power draw in Watts
//   free_vram_mib  {number}  Available (free) VRAM in MiB
//   daemon_version {string}  Semver string of the running daemon
//   python_version {string}  Python runtime version
//   os_info        {string}  OS identifier string
//   gpu_count      {number}  Number of GPUs detected
//   all_gpus       {array}   Per-GPU metric objects (multi-GPU rigs)
//   compute_capability {string} CUDA compute capability (e.g. "8.6")
//   cuda_version   {string}  CUDA toolkit version
//
// Optional payload fields:
//   cached_models  {array}   List of model names already downloaded on the node
//   resource_spec  {object}  Ocean-style resource specification object
//   model_cache    {object}  Cache disk metrics for /opt/dcp/model-cache
//   uptime         {number}  (reserved — not currently used)
//
// Response:
//   { success: true, timestamp: ISO-string, update_available: bool, min_version: string }
//
// Daemon interval recommendation: 30 seconds.
// Grace period thresholds (used by GET /api/providers/available):
//   < 2 min since last heartbeat  → status: "online"   (green)
//   2–10 min since last heartbeat → status: "degraded"  (yellow, still bookable)
//   > 10 min since last heartbeat → status: "offline"   (excluded from marketplace)
// ============================================================================
router.post('/heartbeat', heartbeatProviderLimiter, (req, res) => {
    // HMAC-SHA256 signature validation — prevents spoofed provider status updates.
    // Daemons set X-DC1-Signature: sha256=<hex> using DC1_HMAC_SECRET.
    const hmacResult = verifyHeartbeatHmac(req);
    const requireHmac = process.env.DC1_REQUIRE_HEARTBEAT_HMAC === '1';
    if (!hmacResult.valid) {
        if (requireHmac) {
            console.warn(`[providers/heartbeat] HMAC rejected: ${hmacResult.reason}`);
            return res.status(401).json({ error: 'Invalid heartbeat signature', detail: hmacResult.reason });
        }
        // Warn-only mode: log but allow through for backward-compatible rollout
        if (req.rawBody) {
            console.warn(`[providers/heartbeat] HMAC warning (enforcement disabled): ${hmacResult.reason}`);
        }
    }

    try {
        const {
            api_key,
            gpu_status,
            gpu_info,
            uptime,
            provider_ip,
            provider_hostname,
            peer_id,
            cached_models,
            resource_spec,
            container_restart_count,
            model_cache,
            vllm_endpoint_url,   // DCP-922
            vllm_models,
            wg_mesh_ip,          // Audit H5: WireGuard mesh IP advertised by daemon
            wg_health,           // Tier-1 WG telemetry (handshake age, rx/tx, ping)
            task_updates,        // Migration 008: agent reports back on pull_model tasks
        } = req.body;
        const cleanApiKey = normalizeString(api_key, { maxLen: 128, trim: false });
        if (!cleanApiKey) return res.status(400).json({ error: 'api_key required' });
        const normalizedGpuStatus = isPlainObject(gpu_status)
            ? gpu_status
            : (typeof gpu_status === 'string' ? { status: gpu_status } : null);
        if (gpu_status != null && !normalizedGpuStatus) {
            return res.status(400).json({ error: 'gpu_status must be an object' });
        }
        if (gpu_info != null && !isPlainObject(gpu_info)) {
            return res.status(400).json({ error: 'gpu_info must be an object' });
        }

        const gs = normalizedGpuStatus || {};
        const gi = gpu_info || {};
        const gpuName = normalizeString(gs.gpu_name, { maxLen: 200 });
        const gpuVramMib = toFiniteNumber(gs.gpu_vram_mib, { min: 0, max: 1024 * 1024 });
        const gpuDriver = normalizeString(gs.driver_version, { maxLen: 80 });
        const gpuInfoName = normalizeString(gi.gpu_name, { maxLen: 200 });
        const gpuInfoVramMb = toFiniteInt(gi.vram_mb, { min: 0, max: 1024 * 1024 });
        const gpuInfoDriver = normalizeString(gi.driver_version, { maxLen: 80 });
        const gpuInfoCuda = normalizeString(gi.cuda_version, { maxLen: 40 });
        const gpuUtil = toFiniteNumber(gs.gpu_util_pct, { min: 0, max: 100 });
        const gpuTemp = toFiniteNumber(gs.temp_c, { min: -40, max: 150 });
        const gpuPower = toFiniteNumber(gs.power_w, { min: 0, max: 2000 });
        const gpuFreeVram = toFiniteNumber(gs.free_vram_mib, { min: 0, max: 1024 * 1024 });
        const daemonVersion = normalizeString(gs.daemon_version, { maxLen: 32 });
        const pythonVersion = normalizeString(gs.python_version, { maxLen: 32 });
        const osInfo = normalizeString(gs.os_info, { maxLen: 200 });
        const peerId = normalizeString(peer_id, { maxLen: 200 });
        const providerIp = normalizeString(provider_ip, { maxLen: 64, trim: true });
        const providerHostname = normalizeString(provider_hostname, { maxLen: 255, trim: true });
        const reportedContainerRestarts =
            toFiniteInt(container_restart_count, { min: 0, max: 1000000 }) ??
            toFiniteInt(gs.container_restart_count, { min: 0, max: 1000000 }) ??
            0;
        const modelCacheObj = isPlainObject(model_cache) ? model_cache : {};
        const modelCacheUsedMb =
            toFiniteInt(modelCacheObj.used_mb, { min: 0, max: 1024 * 1024 * 10 }) ??
            toFiniteInt(modelCacheObj.cache_mb, { min: 0, max: 1024 * 1024 * 10 }) ??
            0;
        const modelCacheTotalMb =
            toFiniteInt(modelCacheObj.total_mb, { min: 0, max: 1024 * 1024 * 10 }) ??
            toFiniteInt(modelCacheObj.capacity_mb, { min: 0, max: 1024 * 1024 * 10 }) ??
            0;
        const modelCacheUsedPctRaw =
            toFiniteNumber(modelCacheObj.used_pct, { min: 0, max: 100 }) ??
            toFiniteNumber(modelCacheObj.pct_used, { min: 0, max: 100 }) ??
            (modelCacheTotalMb > 0 ? (modelCacheUsedMb / modelCacheTotalMb) * 100 : null);
        const modelCacheUsedPct = modelCacheUsedPctRaw != null ? Number(modelCacheUsedPctRaw.toFixed(2)) : 0;

        // DCP-922 + audit C1 (SSRF): validate and sanitize provider-registered
        // vLLM endpoint URL. Regex alone (the prior fix) does NOT prevent a
        // malicious provider from registering http://169.254.169.254/... or
        // http://127.0.0.1:8083/api/admin/... — once the renter hits
        // /v1/chat/completions the backend fetch() to that URL leaks AWS IAM
        // creds / internal admin / Redis. Defence:
        //   1. URL must parse
        //   2. Hostname must be a public IPv4 OR a private 10.8.0.0/24 mesh IP
        //      (our own WG mesh — providers legitimately serve from there)
        //   3. Reject RFC1918 outside the mesh, loopback, link-local, ULA,
        //      and cloud-metadata FQDNs
        //   4. Port must be one of the inference-ports allowlist
        let cleanVllmEndpointUrl = null;
        if (vllm_endpoint_url) {
            const rawUrl = normalizeString(vllm_endpoint_url, { maxLen: 512, trim: true });
            if (rawUrl) {
                cleanVllmEndpointUrl = sanitizeVllmEndpointUrl(rawUrl);
            }
        }

        // Audit H5: validate WireGuard mesh IP. Only accept dotted-quad IPv4
        // strings — anything else is dropped silently so a malformed daemon
        // payload can't poison the providers row.
        let cleanWgMeshIp = null;
        if (wg_mesh_ip) {
            const rawIp = normalizeString(wg_mesh_ip, { maxLen: 64, trim: true });
            if (rawIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawIp)) {
                cleanWgMeshIp = rawIp;
            }
        }

        // Tier-1 WG telemetry. We only persist the derived "tunnel_healthy"
        // boolean + handshake age — the raw rx/tx counters are noisy and not
        // worth a column. Heuristic: tunnel_healthy = present AND
        // (handshake_age_s is null OR < 180s) AND (last_ping_ms != null when
        // peer_endpoint set).
        let wgTunnelHealthy = null;     // null = wg not installed / not in scope
        let wgHandshakeAgeS = null;
        if (isPlainObject(wg_health) && wg_health.present === true) {
            const age = toFiniteNumber(wg_health.handshake_age_s, { min: 0, max: 86400 });
            const ping = toFiniteNumber(wg_health.last_ping_ms, { min: 0, max: 60000 });
            const hasPeer = typeof wg_health.peer_endpoint === 'string' && wg_health.peer_endpoint.length > 0;
            wgHandshakeAgeS = age;
            // Healthy if either the handshake is fresh, or we have a recent
            // in-tunnel ping reply. Either alone is sufficient.
            const handshakeOk = age == null || age < 180;
            const pingOk = ping != null;
            wgTunnelHealthy = (handshakeOk || pingOk) && (!hasPeer || ping != null || handshakeOk);
            if (!wgTunnelHealthy) {
                console.warn(`[providers/heartbeat] WG tunnel UNHEALTHY for api_key=${cleanApiKey.slice(0,12)}… handshake_age=${age} ping=${ping} peer=${hasPeer}`);
            }
        }

        const now = new Date().toISOString();

        // Verify API key (sync — better-sqlite3)
        // Tier 4.16 / G47: include is_paused so the response can echo it back
        // to the daemon. The daemon flips its local _REMOTE_PAUSED flag from
        // this field, which forces accepting_jobs=false on the next heartbeat.
        const p = db.get(
            `SELECT id, approval_status, model_preload_status, model_preload_model, p2p_peer_id, available_gpu_tiers, is_paused
             FROM providers
             WHERE api_key = ? AND deleted_at IS NULL`,
            cleanApiKey
        );
        if (!p) return res.status(401).json({ error: 'Invalid API key' });
        const approvalStatus = normalizeString(p.approval_status, { maxLen: 32 }) || 'pending';
        const isTestRuntime = Boolean(process.env.JEST_WORKER_ID) || process.env.DC1_DB_PATH === ':memory:';
        const allowPendingHeartbeat =
            isTestRuntime || process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT === '1';
        if (approvalStatus !== 'approved') {
            // Compatibility mode for legacy test suites: allow post-registration heartbeats to progress.
            // Production remains strict unless explicitly opted in via env override.
            if (!(approvalStatus === 'pending' && allowPendingHeartbeat)) {
                return res.status(403).json({ error: 'Provider is not approved yet' });
            }
        }

        const resolvedGpuName = gpuInfoName || gpuName;
        const resolvedGpuVramMib = gpuInfoVramMb != null ? gpuInfoVramMb : gpuVramMib;
        const resolvedTotalVramMb = toFiniteInt(gs.vram_mb, { min: 0, max: 1024 * 1024 })
            || (resolvedGpuVramMib != null ? Math.round(resolvedGpuVramMib) : null);
        const resolvedGpuDriver = gpuInfoDriver || gpuDriver;
        const gpuInfoJson = (gpuInfoName || gpuInfoVramMb != null || gpuInfoDriver || gpuInfoCuda)
            ? JSON.stringify({
                gpu_name: gpuInfoName || null,
                vram_mb: gpuInfoVramMb != null ? gpuInfoVramMb : null,
                driver_version: gpuInfoDriver || null,
                cuda_version: gpuInfoCuda || null,
            })
            : null;

        const providerRuntimeStatus = reportedContainerRestarts > 10 ? 'degraded' : 'online';

        runStatement(`UPDATE providers SET
          gpu_status = ?, provider_ip = ?, provider_hostname = ?, last_heartbeat = ?, status = ?,
          p2p_peer_id = COALESCE(?, p2p_peer_id),
          gpu_name_detected = COALESCE(?, gpu_name_detected),
          gpu_vram_mib = COALESCE(?, gpu_vram_mib),
          gpu_driver = COALESCE(?, gpu_driver),
          gpu_vram_mb = COALESCE(?, gpu_vram_mb),
          vram_mb = COALESCE(?, vram_mb),
          gpu_count = COALESCE(?, gpu_count),
          gpu_model = COALESCE(?, gpu_model),
          gpu_info_json = COALESCE(?, gpu_info_json),
          cached_models = COALESCE(?, cached_models),
          vllm_models = ?,
          container_restart_count = ?,
          model_cache_disk_mb = ?,
          model_cache_disk_total_mb = ?,
          model_cache_disk_used_pct = ?,
          gpu_profile_source = 'daemon',
          gpu_profile_updated_at = ?,
          vllm_endpoint_url = COALESCE(?, vllm_endpoint_url),
          wg_mesh_ip = COALESCE(?, wg_mesh_ip),
          wg_tunnel_healthy = COALESCE(?, wg_tunnel_healthy),
          wg_handshake_age_s = COALESCE(?, wg_handshake_age_s)
          WHERE id = ?`,
          JSON.stringify(normalizedGpuStatus || {}), providerIp || null, providerHostname || null, now, providerRuntimeStatus,
          peerId || p.p2p_peer_id,
          resolvedGpuName, resolvedGpuVramMib, resolvedGpuDriver,
          gpuInfoVramMb != null ? gpuInfoVramMb : null,
          resolvedTotalVramMb,
          toFiniteInt(gs.gpu_count, { min: 1, max: 64 }) || null,
          resolvedGpuName,
          gpuInfoJson,
          Array.isArray(cached_models) ? JSON.stringify(cached_models) : null,
          Array.isArray(vllm_models) ? JSON.stringify(vllm_models) : null,
          reportedContainerRestarts,
          modelCacheUsedMb,
          modelCacheTotalMb,
          modelCacheUsedPct,
          now,
          cleanVllmEndpointUrl,
          cleanWgMeshIp,
          wgTunnelHealthy == null ? null : (wgTunnelHealthy ? 1 : 0),
          wgHandshakeAgeS == null ? null : Math.round(wgHandshakeAgeS),
          p.id
        );

        const normalizedCachedModels = Array.isArray(cached_models)
            ? cached_models
                .map((model) => normalizeString(model, { maxLen: 200 }))
                .filter(Boolean)
            : [];
        const tierCapability = getProviderRoutingProfile({
            cached_models: JSON.stringify(normalizedCachedModels),
            available_gpu_tiers: p.available_gpu_tiers || null,
            model_preload_status: p.model_preload_status || null,
        });
        const preloadModel = normalizeString(p.model_preload_model, { maxLen: 200 });
        const preloadModelFound = preloadModel
            ? normalizedCachedModels.some((entry) => entry.toLowerCase() === preloadModel.toLowerCase())
            : false;
        const currentPreloadStatus = normalizeString(p.model_preload_status, { maxLen: 20 }) || 'none';
        let effectivePreloadStatus = currentPreloadStatus;
        if (preloadModel && currentPreloadStatus === 'downloading' && preloadModelFound) {
            runStatement(
                `UPDATE providers
                 SET model_preload_status = 'ready',
                     model_preload_updated_at = ?,
                     updated_at = ?
                 WHERE id = ?`,
                now,
                now,
                p.id
            );
            effectivePreloadStatus = 'ready';
        }

        const gpuVramGb = resolvedTotalVramMb != null
            ? Math.max(0, Math.round(resolvedTotalVramMb / 1024))
            : null;
        const vramUsedGb = (resolvedGpuVramMib != null && gpuFreeVram != null)
            ? Number(Math.max(0, (resolvedGpuVramMib - gpuFreeVram) / 1024).toFixed(2))
            : null;
        db.prepare(
            `INSERT INTO provider_gpu_telemetry (
                provider_id, gpu_name, gpu_vram_gb, gpu_util_pct, vram_used_gb, active_jobs
             )
             VALUES (
                ?, ?, ?, ?, ?,
                (SELECT COUNT(*)
                 FROM jobs
                 WHERE provider_id = ?
                   AND status = 'running')
             )`
        ).run(
            p.id,
            resolvedGpuName || null,
            gpuVramGb,
            gpuUtil,
            vramUsedGb,
            p.id
        );

        const allGpus = Array.isArray(gs.all_gpus) ? gs.all_gpus.slice(0, 32) : null;
        const gpuCount = toFiniteInt(gs.gpu_count, { min: 1, max: 64 }) || (allGpus ? allGpus.length : 1);
        const computeCap = gs.compute_capability || null;
        const cudaVersion = gpuInfoCuda || gs.cuda_version || null;
        runStatement(`INSERT INTO heartbeat_log (provider_id, received_at, provider_ip, provider_hostname, gpu_util_pct, gpu_temp_c, gpu_power_w, gpu_vram_free_mib, gpu_vram_total_mib, daemon_version, python_version, os_info, gpu_metrics_json, gpu_count, container_restart_count, model_cache_used_mb, model_cache_total_mb, model_cache_used_pct)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          p.id, now, providerIp || null, providerHostname || null,
          gpuUtil, gpuTemp, gpuPower, gpuFreeVram, resolvedGpuVramMib,
          daemonVersion, pythonVersion, osInfo,
          allGpus ? JSON.stringify(allGpus) : null,
          gpuCount,
          reportedContainerRestarts,
          modelCacheUsedMb,
          modelCacheTotalMb,
          modelCacheUsedPct
        );

        // Update GPU spec fields on provider record when new data arrives
        if (computeCap || cudaVersion || allGpus) {
            runStatement(
                `UPDATE providers SET
                  gpu_count_reported = COALESCE(?, gpu_count_reported),
                  gpu_compute_capability = COALESCE(?, gpu_compute_capability),
                  gpu_cuda_version = COALESCE(?, gpu_cuda_version),
                  gpu_spec_json = COALESCE(?, gpu_spec_json)
                 WHERE id = ?`,
                gpuCount, computeCap, cudaVersion,
                allGpus ? JSON.stringify(allGpus) : null,
                p.id
            );
        }

        // Update Ocean-style resource_spec when daemon provides it
        if (resource_spec && (typeof resource_spec === 'string' || isPlainObject(resource_spec))) {
            const resourceSpecJson = typeof resource_spec === 'string'
                ? resource_spec
                : JSON.stringify(resource_spec);
            const parsedSpec = safeJsonParse(resourceSpecJson);
            const discovered = discoverComputeTypesFromResourceSpec(parsedSpec);
            runStatement(
                'UPDATE providers SET resource_spec = ?, supported_compute_types = COALESCE(?, supported_compute_types) WHERE id = ?',
                resourceSpecJson,
                discovered.size > 0 ? JSON.stringify(Array.from(discovered)) : null,
                p.id
            );
        }

        // Store daemon version on provider record for job assignment checks
        if (daemonVersion) {
            runStatement('UPDATE providers SET daemon_version = ? WHERE id = ?', daemonVersion, p.id);
        }

        // Recompute reputation score on every heartbeat (rolling 7-day window)
        const rep = computeReputationScore(p.id);
        runStatement(
            'UPDATE providers SET uptime_percent = ?, reputation_score = ? WHERE id = ?',
            rep.uptime_percent, rep.reputation_score, p.id
        );

        // DCP-82 Gap 3: expose dynamic capacity data for upstream schedulers (e.g., OpenRouter).
        const reservedInferenceJobs = Number(
            db.get(
                `SELECT COUNT(*) AS c
                 FROM jobs
                 WHERE provider_id = ?
                   AND job_type = 'vllm'
                   AND status IN ('pending', 'assigned', 'pulling', 'running')`,
                p.id
            )?.c || 0
        );
        const queueDepthRows = db.all(
            `SELECT model, COUNT(*) AS queued
             FROM jobs
             WHERE provider_id = ?
               AND job_type = 'vllm'
               AND status IN ('pending', 'assigned', 'pulling', 'running')
             GROUP BY model
             ORDER BY queued DESC
             LIMIT 20`,
            p.id
        );
        const queueDepthByModel = {};
        for (const row of queueDepthRows) {
            const key = normalizeString(row.model, { maxLen: 200 }) || '__unknown__';
            queueDepthByModel[key] = Number(row.queued || 0);
        }
        const availableGpuSlots = Math.max(0, Number(gpuCount || 1) - reservedInferenceJobs);
        const estimatedWaitSeconds = reservedInferenceJobs > 0 ? reservedInferenceJobs * 60 : 0;

        // Tell daemon if update is available (semantic version comparison)
        const needsUpdate = !daemonVersion || compareVersions(daemonVersion, LATEST_DAEMON_VERSION) < 0;
        conversionFunnel.trackStage({
            journey: 'provider',
            stage: 'first_action',
            actorType: 'provider',
            actorId: p.id,
            req,
            metadata: {
                action: 'heartbeat_received',
                approval_status: approvalStatus,
                daemon_version: daemonVersion || null,
            },
        });
        try {
            announceFromProviderHeartbeat(p, {
                gpu_status: normalizedGpuStatus || {},
                gpu_info: gi,
                provider_ip: providerIp || null,
                provider_hostname: providerHostname || null,
                resource_spec,
                resolved_total_vram_mib: resolvedTotalVramMb,
                heartbeat_issued_at: now,
            });
        } catch (announcementError) {
            console.warn('[p2p-discovery] heartbeat announce enqueue failed:', announcementError.message);
        }
        // ── Migration 008: pull-task channel ──────────────────────────────
        // Process any task progress / completion the agent reported, then
        // query queued tasks for this provider to attach to the response.
        applyTaskUpdates(p.id, task_updates, now);
        const pendingTasks = fetchPendingTasksForProvider(p.id);

        return res.json({
            success: true, message: 'Heartbeat received', timestamp: now,
            needs_update: needsUpdate,
            latest_version: LATEST_DAEMON_VERSION,
            update_available: needsUpdate,
            min_version: MIN_DAEMON_VERSION,
            approval_status: approvalStatus,
            approved: approvalStatus === 'approved',
            // Tier 4.16 / G47: echo the providers.is_paused bit back to the
            // daemon. Daemon mirrors this into _REMOTE_PAUSED and uses it to
            // force accepting_jobs=false on the next heartbeat. Always 0 or 1
            // (numeric) to keep parsing simple on the daemon side.
            is_paused: p.is_paused ? 1 : 0,
            preload_model: preloadModel && effectivePreloadStatus === 'downloading'
                ? { model_name: preloadModel, status: 'downloading' }
                : null,
            capacity_report: {
                provider_id: p.id,
                queue_depth_by_model: queueDepthByModel,
                active_inference_jobs: reservedInferenceJobs,
                available_gpu_slots: availableGpuSlots,
                estimated_wait_seconds: estimatedWaitSeconds,
                generated_at: now,
            },
            tier_capability: {
                available_tier_modes: Array.from(tierCapability.available_tier_modes || []),
                available_gpu_tiers: Array.from(tierCapability.available_gpu_tiers || []),
                source: tierCapability.tier_capability_source || 'heuristic',
            },
            // Migration 008: agent should execute these in order and report
            // progress in `task_updates` on subsequent heartbeats.
            pending_tasks: pendingTasks,
        });
        
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Heartbeat failed' });
    }
});

// ============================================================================
// POST /api/providers/:id/heartbeat - Simplified REST heartbeat
// Body: { gpu_utilization, vram_used_mb, jobs_active, timestamp }
// Auth: x-provider-key header or Authorization: Bearer <api_key>
// ============================================================================
router.post('/:id/heartbeat', heartbeatProviderLimiter, (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });
        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) return res.status(401).json({ error: 'API key required' });
        const provider = db.get(
            'SELECT id, approval_status FROM providers WHERE id = ? AND api_key = ?',
            providerId, apiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid provider ID or API key' });
        if (provider.approval_status !== 'approved') {
            const allowPending = Boolean(process.env.JEST_WORKER_ID) || process.env.DC1_DB_PATH === ':memory:' || process.env.ALLOW_UNAPPROVED_PROVIDER_HEARTBEAT === '1';
            if (!(provider.approval_status === 'pending' && allowPending)) {
                return res.status(403).json({ error: 'Provider not approved' });
            }
        }
        // Accept legacy field names, REST aliases (DCP-782), and canonical metric names (DCP-892)
        const { gpu_utilization, gpu_utilization_pct, vram_used_mb, active_jobs, jobs_active,
                vram_used, jobs_running, uptime_seconds, model_loaded, vram_total, vram_total_mb } = req.body;
        // gpu_utilization_pct is the canonical name (DCP-892); gpu_utilization is the legacy alias
        const gpuUtil = toFiniteNumber(gpu_utilization_pct ?? gpu_utilization, { min: 0, max: 100 });
        // vram_used (MB) is alias for vram_used_mb
        const vramUsedMb = toFiniteInt(vram_used_mb ?? vram_used, { min: 0, max: 1024 * 1024 });
        // vram_total: total VRAM capacity in MB (vram_total_mb is alias)
        const vramTotalMb = toFiniteInt(vram_total_mb ?? vram_total, { min: 0, max: 1024 * 1024 });
        // active_jobs (DCP-892 canonical), jobs_active and jobs_running are legacy aliases
        const jobsActive = toFiniteInt(active_jobs ?? jobs_active ?? jobs_running, { min: 0, max: 10000 });
        // model_loaded: currently loaded model identifier (DCP-907)
        const modelLoaded = normalizeString(model_loaded, { maxLen: 200 }) || null;
        const now = new Date().toISOString();

        // Build provider update — include vram_total and model_loaded when provided (DCP-907)
        const heartbeatUpdates = ["last_heartbeat = ?", "status = 'online'", "updated_at = ?"];
        const heartbeatParams = [now, now];
        if (vramTotalMb != null) {
            heartbeatUpdates.push('vram_mb = ?');
            heartbeatParams.push(vramTotalMb);
        }
        if (modelLoaded !== null) {
            heartbeatUpdates.push('cached_models = ?');
            heartbeatParams.push(JSON.stringify([modelLoaded]));
        }
        heartbeatParams.push(provider.id);
        runStatement(`UPDATE providers SET ${heartbeatUpdates.join(', ')} WHERE id = ?`, ...heartbeatParams);

        db.prepare(
            'INSERT INTO provider_gpu_telemetry (provider_id, gpu_util_pct, vram_used_gb, active_jobs) VALUES (?, ?, ?, ?)'
        ).run(
            provider.id,
            gpuUtil ?? null,
            vramUsedMb != null ? Number((vramUsedMb / 1024).toFixed(3)) : null,
            jobsActive ?? null
        );
        // Write to provider_metrics for the health poller timeseries (DCP-892)
        db.prepare(
            'INSERT INTO provider_metrics (provider_id, recorded_at, gpu_utilization_pct, vram_used_mb, active_jobs) VALUES (?, ?, ?, ?, ?)'
        ).run(provider.id, now, gpuUtil ?? null, vramUsedMb ?? null, jobsActive ?? null);
        runStatement(
            'INSERT INTO heartbeat_log (provider_id, received_at, gpu_util_pct) VALUES (?, ?, ?)',
            provider.id, now, gpuUtil ?? null
        );
        const uptimeSec = toFiniteInt(uptime_seconds, { min: 0 });
        return res.json({
            success: true,
            provider_id: provider.id,
            status: 'online',
            timestamp: now,
            ...(uptimeSec != null && { uptime_seconds: uptimeSec }),
            ...(modelLoaded !== null && { model_loaded: modelLoaded }),
        });
    } catch (error) {
        console.error('[providers/:id/heartbeat]', error);
        return res.status(500).json({ error: 'Heartbeat failed' });
    }
});

// ============================================================================
// GET /api/providers/:id/liveness - Provider liveness check (DCP-782)
// Returns last heartbeat timestamp and online/stale/offline status.
// Thresholds: online (<30s), stale (30-90s), offline (>90s)
// Auth: public - read-only status info
// ============================================================================
const LIVENESS_ONLINE_S = 120;  // 2 minutes — generous for consumer GPUs with variable heartbeat intervals
const LIVENESS_STALE_S  = 300;  // 5 minutes — mark as stale after 5 min without heartbeat

router.get('/:id/liveness', (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const provider = db.get(
            'SELECT id, name, gpu_model, last_heartbeat FROM providers WHERE id = ?',
            providerId
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const now = Date.now();
        let liveness_status = 'offline';
        let heartbeat_age_seconds = null;

        if (provider.last_heartbeat) {
            const ageMs = now - new Date(provider.last_heartbeat).getTime();
            heartbeat_age_seconds = Math.floor(ageMs / 1000);
            if (heartbeat_age_seconds < LIVENESS_ONLINE_S) {
                liveness_status = 'online';
            } else if (heartbeat_age_seconds < LIVENESS_STALE_S) {
                liveness_status = 'stale';
            }
        }

        return res.json({
            provider_id: provider.id,
            liveness_status,
            last_heartbeat: provider.last_heartbeat || null,
            heartbeat_age_seconds,
        });
    } catch (error) {
        console.error('[providers/:id/liveness]', error);
        return res.status(500).json({ error: 'Failed to fetch liveness status' });
    }
});

// ============================================================================
// GET /api/providers/:id/metrics?period=1h — Provider utilization timeseries (DCP-892)
// Returns timeseries of gpu_utilization_pct, vram_used_mb, active_jobs from provider_metrics.
// Auth: public (read-only health data)
// Query params: period = 1h (default) | 6h | 24h | 7d
// ============================================================================
const METRICS_PERIOD_SECONDS = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };

router.get('/:id/metrics', (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const provider = db.get('SELECT id FROM providers WHERE id = ?', providerId);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const periodParam = normalizeString(req.query.period, { maxLen: 8, trim: true }) || '1h';
        const periodSeconds = METRICS_PERIOD_SECONDS[periodParam];
        if (!periodSeconds) {
            return res.status(400).json({ error: 'Invalid period. Use 1h, 6h, 24h, or 7d' });
        }

        const since = new Date(Date.now() - periodSeconds * 1000).toISOString();
        const rows = db.all(
            `SELECT recorded_at, gpu_utilization_pct, vram_used_mb, active_jobs
             FROM provider_metrics
             WHERE provider_id = ? AND recorded_at >= ?
             ORDER BY recorded_at ASC`,
            providerId, since
        );

        return res.json({
            provider_id: providerId,
            period: periodParam,
            since,
            count: rows.length,
            metrics: rows,
        });
    } catch (error) {
        console.error('[providers/:id/metrics]', error);
        return res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// ============================================================================
// POST /api/providers/:id/benchmark - Provider GPU benchmark submission (DCP-723)
// Body: { gpu_model, vram_gb, tflops, bandwidth_gbps, tokens_per_sec, tier }
// Auth: x-provider-key header or Authorization: Bearer <api_key>
// Purpose: Store GPU benchmark results and assign provider to tier (A/B/C)
// ============================================================================
router.post('/:id/benchmark', validateBody(providerBenchmarkSchema), (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        // Verify provider and API key
        const provider = db.get(
            'SELECT id, approval_status FROM providers WHERE id = ? AND api_key = ?',
            providerId, apiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid provider ID or API key' });

        // Validate benchmark data
        const { gpu_model, vram_gb, tflops, bandwidth_gbps, tokens_per_sec, tier } = req.body;

        if (!gpu_model || typeof gpu_model !== 'string') {
            return res.status(400).json({ error: 'gpu_model required (string)' });
        }

        const vramNum = parseFloat(vram_gb);
        const tflopsNum = parseFloat(tflops);
        const bwNum = parseFloat(bandwidth_gbps);
        const tpsNum = parseFloat(tokens_per_sec);

        if (isNaN(vramNum) || vramNum < 1 || vramNum > 1000) {
            return res.status(400).json({ error: 'vram_gb must be between 1 and 1000' });
        }
        if (isNaN(tflopsNum) || tflopsNum < 1 || tflopsNum > 10000) {
            return res.status(400).json({ error: 'tflops must be between 1 and 10000' });
        }
        if (isNaN(bwNum) || bwNum < 1 || bwNum > 100000) {
            return res.status(400).json({ error: 'bandwidth_gbps must be between 1 and 100000' });
        }
        if (isNaN(tpsNum) || tpsNum < 1 || tpsNum > 100000) {
            return res.status(400).json({ error: 'tokens_per_sec must be between 1 and 100000' });
        }

        // Determine tier if not provided
        let computedTier = tier;
        if (!computedTier) {
            // Auto-assign based on TFLOPS and VRAM
            if (tflopsNum >= 900 && vramNum >= 40) {
                computedTier = 'A'; // Enterprise tier (H100/H200)
            } else if (tflopsNum >= 200 && vramNum >= 20) {
                computedTier = 'B'; // High-end consumer (RTX 4090/4080)
            } else {
                computedTier = 'C'; // Standard tier
            }
        } else if (!['A', 'B', 'C'].includes(String(computedTier))) {
            return res.status(400).json({ error: 'tier must be A, B, or C' });
        }

        const now = new Date().toISOString();
        const gpuModelClean = normalizeString(gpu_model, { maxLen: 255 });

        // Store benchmark result
        try {
            db.prepare(`
                INSERT INTO provider_benchmarks
                (provider_id, gpu_model, vram_gb, tflops, bandwidth_gbps, tokens_per_sec, tier, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                provider.id,
                gpuModelClean,
                vramNum,
                tflopsNum,
                bwNum,
                tpsNum,
                computedTier,
                now
            );
        } catch (dbError) {
            // Table might not exist yet - create it
            if (dbError.message.includes('no such table')) {
                db.prepare(`
                    CREATE TABLE IF NOT EXISTS provider_benchmarks (
                        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                        provider_id TEXT NOT NULL,
                        gpu_model TEXT NOT NULL,
                        vram_gb REAL NOT NULL,
                        tflops REAL NOT NULL,
                        bandwidth_gbps REAL NOT NULL,
                        tokens_per_sec REAL NOT NULL,
                        tier TEXT NOT NULL,
                        submitted_at TEXT NOT NULL,
                        FOREIGN KEY (provider_id) REFERENCES providers(id)
                    )
                `).run();

                // Retry insert
                db.prepare(`
                    INSERT INTO provider_benchmarks
                    (provider_id, gpu_model, vram_gb, tflops, bandwidth_gbps, tokens_per_sec, tier, submitted_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    provider.id,
                    gpuModelClean,
                    vramNum,
                    tflopsNum,
                    bwNum,
                    tpsNum,
                    computedTier,
                    now
                );
            } else {
                throw dbError;
            }
        }

        // Update provider with GPU tier
        runStatement(
            'UPDATE providers SET gpu_tier = ?, updated_at = ? WHERE id = ?',
            computedTier, now, provider.id
        );

        return res.json({
            success: true,
            provider_id: provider.id,
            gpu_model: gpuModelClean,
            tier: computedTier,
            timestamp: now,
            message: `Benchmark recorded. Provider assigned to tier ${computedTier}`
        });
    } catch (error) {
        console.error('[providers/:id/benchmark]', error);
        return res.status(500).json(safeErrorPayload(error, 'Benchmark submission failed'));
    }
});

// ============================================================================
// POST /api/providers/daemon-event - Log daemon events (crashes, job results, etc.)
// ============================================================================
router.post('/daemon-event', (req, res) => {
    try {
        const { api_key, event_type, severity, daemon_version, timestamp,
                hostname, os_info, python_version, details, job_id } = req.body;

        const cleanApiKey = normalizeString(api_key, { maxLen: 128, trim: false });
        const cleanEventType = normalizeString(event_type, { maxLen: 80 });
        if (!cleanApiKey || !cleanEventType) {
            return res.status(400).json({ error: 'Missing api_key or event_type' });
        }

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanApiKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });
        const cleanSeverity = ['info', 'warning', 'error', 'critical'].includes(String(severity || '').toLowerCase())
            ? String(severity).toLowerCase()
            : 'info';
        const cleanTimestamp = normalizeString(timestamp, { maxLen: 40, trim: true }) || new Date().toISOString();
        const cleanDetails = normalizeString(details || '', { maxLen: 5000, trim: false }) || '';

        runStatement(`INSERT INTO daemon_events
            (provider_id, event_type, severity, daemon_version, job_id,
             hostname, os_info, python_version, details, event_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            provider.id,
            cleanEventType,
            cleanSeverity,
            normalizeString(daemon_version, { maxLen: 32 }) || null,
            normalizeString(job_id, { maxLen: 80 }) || null,
            normalizeString(hostname, { maxLen: 255 }) || null,
            normalizeString(os_info, { maxLen: 200 }) || null,
            normalizeString(python_version, { maxLen: 32 }) || null,
            cleanDetails,  // Cap at 5KB
            cleanTimestamp
        );

        // Log critical events to console for immediate visibility
        if (cleanSeverity === 'critical' || cleanSeverity === 'error') {
            console.warn(`[DAEMON EVENT] provider=${provider.id} type=${cleanEventType} severity=${cleanSeverity}: ${cleanDetails.substring(0, 200)}`);
            // Fire async alert — don't block response
            const provName = db.get('SELECT name FROM providers WHERE id = ?', provider.id)?.name || `ID ${provider.id}`;
            sendAlert(
              cleanEventType === 'crash' ? 'provider_crash' : 'critical_error',
              `Provider: ${provName} (ID ${provider.id})\nEvent: ${cleanEventType}\nSeverity: ${cleanSeverity}\nHost: ${normalizeString(hostname, { maxLen: 255 }) || 'unknown'}\n\n${cleanDetails.substring(0, 500)}`
            ).catch(() => {});
        }

        res.json({ success: true, event_type: cleanEventType, provider_id: provider.id });

    } catch (error) {
        console.error('Daemon event error:', error);
        res.status(500).json({ error: 'Event logging failed' });
    }
});

// ============================================================================
// GET /api/providers/status - Get provider dashboard data
// Auth: x-provider-key header or ?key= query param (NOT in URL path — DCP-896)
// ============================================================================
router.get('/status', async (req, res) => {
    try {
        // DCP-896: key moved from URL path parameter to header/query to prevent
        // API key exposure in server access logs and browser history.
        const api_key = req.headers['x-provider-key'] || req.query.key;
        if (!api_key) {
            return res.status(400).json({ error: 'API key required (x-provider-key header or ?key= query)' });
        }

        const provider = await db.get(
            'SELECT * FROM providers WHERE api_key = ? AND deleted_at IS NULL',
            [api_key]
        );
        
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }
        
        res.json({
            provider_id: provider.id,
            name: provider.name,
            status: provider.status,
            gpu_model: provider.gpu_model,
            gpu_status: provider.gpu_status ? JSON.parse(provider.gpu_status) : null,
            provider_ip: provider.ip_address || provider.provider_ip,
            last_heartbeat: provider.last_heartbeat,
            total_earnings: provider.total_earnings || 0,
            total_jobs: provider.total_jobs || 0,
            uptime_percent: provider.uptime_percent || 0
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Status fetch failed' });
    }
});

// === SETUP ROUTE - Serve daemon.sh with injected API key ===
router.get('/setup', (req, res) => {
    try {
        const { key } = req.query;
        if (!key) {
            return res.status(400).json({ error: 'API key required: /setup?key=YOUR_KEY' });
        }

        const daemonPath = path.join(__dirname, '../../installers/daemon.sh');
        if (!fs.existsSync(daemonPath)) {
            return res.status(404).json({ error: 'daemon.sh not found' });
        }

        let daemonScript = fs.readFileSync(daemonPath, 'utf-8');
        daemonScript = daemonScript.replace(
            'DC1_API_KEY="${1:-}"',
            'DC1_API_KEY="' + key + '"'
        );

        res.setHeader('Content-Type', 'text/x-shellscript');
        res.setHeader('Content-Disposition', 'inline; filename="daemon.sh"');
        res.send(daemonScript);

    } catch (error) {
        console.error('Setup script error:', error);
        res.status(500).json({ error: 'Failed to serve setup script' });
    }
});

// === SETUP-WINDOWS ROUTE - Serve daemon.ps1 with injected API key ===
router.get('/setup-windows', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) {
            return res.status(400).json({ error: 'API key required: /setup-windows?key=YOUR_KEY' });
        }

        // Validate API key exists in DB
        const provider = await db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
        if (!provider) {
            return res.status(404).json({ error: 'Invalid API key' });
        }

        const ps1Path = path.join(__dirname, '../../installers/daemon.ps1');
        if (!fs.existsSync(ps1Path)) {
            return res.status(500).json({ error: 'PowerShell installer template not found' });
        }

        let script = fs.readFileSync(ps1Path, 'utf-8');
        // Replace all template placeholders with provider-specific values
        script = script.replace(/\{\{API_KEY\}\}/g, key);
        script = script.replace(/INJECTED_API_KEY/g, key); // legacy fallback
        script = script.replace(/\{\{API_URL\}\}/g, process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa');
        script = script.replace(/\{\{RUN_MODE\}\}/g, provider.run_mode || 'always-on');
        script = script.replace(/\{\{SCHEDULED_START\}\}/g, provider.scheduled_start || '23:00');
        script = script.replace(/\{\{SCHEDULED_END\}\}/g, provider.scheduled_end || '07:00');

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'inline; filename="daemon.ps1"');
        res.send(script);

    } catch (error) {
        console.error('Windows setup script error:', error);
        res.status(500).json({ error: 'Failed to serve Windows setup script' });
    }
});

// ============================================================================
// GET /api/providers/me - Provider self-service dashboard data
// ============================================================================
router.get('/me', async (req, res) => {
    try {
        const key = req.query.key || req.headers['x-provider-key'];
        if (!key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        // Today, week, and month earnings
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(todayStart);
        monthStart.setUTCDate(1);

        const todayEarnings = db.get(
            `SELECT COALESCE(SUM(provider_earned_halala), 0) as total FROM jobs WHERE provider_id = ? AND status = 'completed' AND completed_at >= ?`,
            provider.id, todayStart.toISOString()
        );
        const weekEarnings = db.get(
            `SELECT COALESCE(SUM(provider_earned_halala), 0) as total FROM jobs WHERE provider_id = ? AND status = 'completed' AND completed_at >= ?`,
            provider.id, weekStart.toISOString()
        );
        const monthEarnings = db.get(
            `SELECT COALESCE(SUM(provider_earned_halala), 0) as total FROM jobs WHERE provider_id = ? AND status = 'completed' AND completed_at >= ?`,
            provider.id, monthStart.toISOString()
        );

        // Active job
        const activeJob = db.get(
            `SELECT id, job_id, job_type, started_at, cost_halala FROM jobs WHERE provider_id = ? AND status = 'running' LIMIT 1`,
            provider.id
        );

        // Recent completed/failed jobs for activity table
        const recentJobs = db.all(
            `SELECT id, job_id, job_type, model, status, submitted_at, completed_at, actual_cost_halala, provider_earned_halala, dc1_fee_halala
             FROM jobs WHERE provider_id = ? ORDER BY submitted_at DESC LIMIT 20`,
            provider.id
        );

        // GPU metrics from gpu_status JSON
        let gpuMetrics = { utilization_pct: 0, vram_used_mib: 0, temperature_c: 0 };
        if (provider.gpu_status) {
            try {
                const gs = JSON.parse(provider.gpu_status);
                gpuMetrics = {
                    utilization_pct: gs.utilization_pct || gs.gpu_utilization || 0,
                    vram_used_mib: gs.vram_used_mib || gs.memory_used || 0,
                    temperature_c: gs.temperature_c || gs.temperature || 0
                };
            } catch (_) {}
        }

        // Parse resource_spec JSON for response
        let resourceSpec = null;
        if (provider.resource_spec) {
            try { resourceSpec = JSON.parse(provider.resource_spec); } catch (_) {}
        }
        const declaredComputeTypes = parseSupportedComputeTypesField(provider.supported_compute_types);
        const discoveredComputeTypes = discoverComputeTypesFromResourceSpec(resourceSpec);
        const supportedComputeTypes = declaredComputeTypes.size > 0
            ? Array.from(declaredComputeTypes)
            : (discoveredComputeTypes.size > 0 ? Array.from(discoveredComputeTypes) : ['inference', 'training', 'rendering']);

        const profileSource = (provider.gpu_profile_source || '').trim().toLowerCase() === 'daemon'
            ? 'daemon'
            : 'manual';

        const payload = {
            provider: {
                id: provider.id,
                name: provider.name,
                status: provider.status,
                gpu_model: provider.gpu_model,
                gpu_vram_mib: provider.gpu_vram_mib || 0,
                gpu_count_reported: provider.gpu_count_reported || 1,
                gpu_compute_capability: provider.gpu_compute_capability || null,
                gpu_cuda_version: provider.gpu_cuda_version || null,
                vram_mb: toFiniteInt(provider.vram_mb, { min: 0, max: 1024 * 1024 }) || 0,
                gpu_count: toFiniteInt(provider.gpu_count, { min: 1, max: 64 }) || 1,
                supported_compute_types: supportedComputeTypes,
                gpu_profile_source: profileSource,
                gpu_profile_updated_at: provider.gpu_profile_updated_at || provider.last_heartbeat || null,
                auto_detected: profileSource === 'daemon',
                resource_spec: resourceSpec,
                last_heartbeat: provider.last_heartbeat || null,
                daemon_version: provider.daemon_version || null,
                run_mode: provider.run_mode || 'always-on',
                scheduled_start: provider.scheduled_start || '23:00',
                scheduled_end: provider.scheduled_end || '07:00',
                wallet_address: provider.wallet_address || null,
                wallet_address_updated_at: provider.wallet_address_updated_at || null,
                gpu_usage_cap_pct: provider.gpu_usage_cap_pct != null ? provider.gpu_usage_cap_pct : 80,
                vram_reserve_gb: provider.vram_reserve_gb != null ? provider.vram_reserve_gb : 1,
                temp_limit_c: provider.temp_limit_c != null ? provider.temp_limit_c : 85,
                is_paused: Boolean(provider.is_paused),
                approval_status: provider.approval_status || 'pending',
                approved_at: provider.approved_at || null,
                rejected_reason: provider.rejected_reason || null,
                total_earnings_halala: provider.total_earnings ? Math.round(provider.total_earnings * 100) : 0,
                total_jobs: provider.total_jobs || 0,
                uptime_percent: provider.uptime_percent || 0,
                gpu_metrics: gpuMetrics,
                today_earnings_halala: todayEarnings.total,
                week_earnings_halala: weekEarnings.total,
                month_earnings_halala: monthEarnings.total,
                active_job: activeJob || null
            },
            recent_jobs: recentJobs
        };
        res.json(payload);
    } catch (error) {
        console.error('Provider me error:', error);
        res.status(500).json({ error: 'Failed to fetch provider data' });
    }
});

// ============================================================================
// PATCH /api/providers/me/gpu-profile - Manual provider GPU profile override
// ============================================================================
router.patch('/me/gpu-profile', (req, res) => {
    try {
        const key = normalizeString(req.query.key, { maxLen: 128, trim: false });
        if (!key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get(
            `SELECT id, gpu_model, vram_mb, gpu_count, supported_compute_types, resource_spec,
                    last_heartbeat, gpu_profile_source, gpu_profile_updated_at
             FROM providers
             WHERE api_key = ?`,
            key
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const fields = {};
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'gpu_model')) {
            const gpuModel = normalizeString(req.body.gpu_model, { maxLen: 120 });
            if (!gpuModel) return res.status(400).json({ error: 'gpu_model must be a non-empty string' });
            fields.gpu_model = gpuModel;
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'vram_mb')) {
            const vramMb = toFiniteInt(req.body.vram_mb, { min: 1024, max: 327680 });
            if (vramMb == null) return res.status(400).json({ error: 'vram_mb must be between 1024 and 327680' });
            fields.vram_mb = vramMb;
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'gpu_count')) {
            const gpuCount = toFiniteInt(req.body.gpu_count, { min: 1, max: 8 });
            if (gpuCount == null) return res.status(400).json({ error: 'gpu_count must be between 1 and 8' });
            fields.gpu_count = gpuCount;
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'supported_compute_types')) {
            const rawTypes = req.body.supported_compute_types;
            if (!Array.isArray(rawTypes) || rawTypes.length === 0) {
                return res.status(400).json({ error: 'supported_compute_types must be a non-empty array' });
            }
            const normalized = [];
            for (const item of rawTypes) {
                const token = parseComputeTypeToken(item);
                if (!token) {
                    return res.status(400).json({ error: 'supported_compute_types supports only inference, training, rendering' });
                }
                if (!normalized.includes(token)) normalized.push(token);
            }
            fields.supported_compute_types = JSON.stringify(normalized);
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid profile fields provided' });
        }

        const daemonReportedAt = provider.last_heartbeat ? new Date(provider.last_heartbeat).getTime() : 0;
        const profileUpdatedAt = provider.gpu_profile_updated_at ? new Date(provider.gpu_profile_updated_at).getTime() : 0;
        const daemonIsNewer = provider.gpu_profile_source === 'daemon' && daemonReportedAt >= profileUpdatedAt;
        const wantsHardwareOverride = fields.gpu_model != null || fields.vram_mb != null || fields.gpu_count != null;
        if (daemonIsNewer && wantsHardwareOverride) {
            return res.status(409).json({
                error: 'Daemon-reported GPU profile is newer. Stop daemon heartbeat before applying manual hardware overrides.',
            });
        }

        const now = new Date().toISOString();
        const updateKeys = Object.keys(fields);
        const setClause = updateKeys.map((keyName) => `${keyName} = ?`).join(', ');
        const values = updateKeys.map((keyName) => fields[keyName]);

        runStatement(
            `UPDATE providers
             SET ${setClause}, gpu_profile_source = 'manual', gpu_profile_updated_at = ?, updated_at = ?
             WHERE id = ?`,
            [...values, now, now, provider.id]
        );

        const resourceSpec = safeJsonParse(provider.resource_spec);
        const declaredComputeTypes = fields.supported_compute_types
            ? parseSupportedComputeTypesField(fields.supported_compute_types)
            : parseSupportedComputeTypesField(provider.supported_compute_types);
        const discoveredComputeTypes = discoverComputeTypesFromResourceSpec(resourceSpec);
        const supportedComputeTypes = declaredComputeTypes.size > 0
            ? Array.from(declaredComputeTypes)
            : (discoveredComputeTypes.size > 0 ? Array.from(discoveredComputeTypes) : ['inference', 'training', 'rendering']);

        return res.json({
            success: true,
            profile: {
                gpu_model: fields.gpu_model ?? provider.gpu_model,
                vram_mb: fields.vram_mb ?? provider.vram_mb ?? 0,
                gpu_count: fields.gpu_count ?? provider.gpu_count ?? 1,
                supported_compute_types: supportedComputeTypes,
                gpu_profile_source: 'manual',
                gpu_profile_updated_at: now,
                auto_detected: false,
            },
        });
    } catch (error) {
        console.error('Provider GPU profile update error:', error);
        return res.status(500).json({ error: 'Failed to update GPU profile' });
    }
});

// ============================================================================
// PATCH /api/providers/me/wallet - Update provider EVM wallet for on-chain escrow
// ============================================================================
router.patch('/me/wallet', (req, res) => {
    try {
        const key = normalizeString(req.query.key || req.headers['x-provider-key'] || req.body?.key, { maxLen: 128, trim: false });
        if (!key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get(
            'SELECT id, wallet_address FROM providers WHERE api_key = ?',
            key
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'wallet_address')) {
            return res.status(400).json({ error: 'wallet_address is required' });
        }

        const rawWallet = req.body.wallet_address;
        if (rawWallet == null) {
            return res.status(400).json({ error: 'wallet_address cannot be null' });
        }

        const walletAddress = normalizeString(rawWallet, { maxLen: 42 });
        if (!walletAddress || !ETH_ADDRESS_REGEX.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid Ethereum wallet address' });
        }

        const normalizedWallet = walletAddress.toLowerCase();
        const now = new Date().toISOString();
        const changed = provider.wallet_address?.toLowerCase() !== normalizedWallet;
        if (changed) {
            runStatement(
                `UPDATE providers
                 SET wallet_address = ?, wallet_address_updated_at = ?, updated_at = ?
                 WHERE id = ?`,
                normalizedWallet,
                now,
                now,
                provider.id
            );
        }

        return res.json({
            success: true,
            wallet_address: normalizedWallet,
            wallet_address_updated_at: now,
            changed,
        });
    } catch (error) {
        console.error('Provider wallet update error:', error);
        return res.status(500).json({ error: 'Failed to update provider wallet address' });
    }
});

// ============================================================================
// GET /api/providers/me/metrics - Provider performance dashboard metrics
// ============================================================================
router.get('/me/metrics', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id, gpu_model FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const statsRow = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS jobs_completed,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS jobs_failed,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_duration_minutes, duration_minutes, 0) ELSE 0 END), 0) AS total_compute_minutes,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(provider_earned_halala, 0) ELSE 0 END), 0) AS earnings_halala,
                COALESCE(AVG(CASE WHEN status = 'completed' THEN COALESCE(actual_duration_minutes, duration_minutes, NULL) END), 0) AS avg_job_duration_minutes
             FROM jobs
             WHERE provider_id = ?`,
            provider.id
        ) || {};

        const hbRow = db.get(
            `SELECT COALESCE(COUNT(*), 0) AS heartbeat_count
             FROM heartbeat_log
             WHERE provider_id = ? AND received_at >= datetime('now', '-7 days')`,
            provider.id
        ) || {};

        // Heartbeat cadence is every ~30s, so 120 heartbeats ~= 1 hour.
        const uptimeHoursLast7d = Number(((hbRow.heartbeat_count || 0) / 120).toFixed(2));

        const recentJobs = db.all(
            `SELECT
                job_id,
                job_type,
                model,
                status,
                COALESCE(actual_duration_minutes, duration_minutes, 0) AS duration_minutes,
                COALESCE(provider_earned_halala, 0) AS earnings_halala,
                completed_at
             FROM jobs
             WHERE provider_id = ? AND status = 'completed'
             ORDER BY datetime(completed_at) DESC
             LIMIT 10`,
            provider.id
        );

        const earningsHalala = Number(statsRow.earnings_halala || 0);
        const response = {
            provider_id: provider.id,
            gpu_model: provider.gpu_model || null,
            stats: {
                jobs_completed: Number(statsRow.jobs_completed || 0),
                jobs_failed: Number(statsRow.jobs_failed || 0),
                total_compute_minutes: Number(statsRow.total_compute_minutes || 0),
                earnings_halala: earningsHalala,
                earnings_sar: Number((earningsHalala / 100).toFixed(2)),
                uptime_hours_last_7d: uptimeHoursLast7d,
                avg_job_duration_minutes: Number(Number(statsRow.avg_job_duration_minutes || 0).toFixed(2)),
            },
            recent_jobs: recentJobs,
        };

        return res.json(response);
    } catch (error) {
        console.error('Provider metrics error:', error);
        return res.status(500).json({ error: 'Failed to fetch provider metrics' });
    }
});

// ============================================================================
// POST /api/providers/pause - Pause provider
// ============================================================================
router.post('/pause', async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        runStatement('UPDATE providers SET status = ?, is_paused = 1 WHERE id = ?', 'paused', provider.id);
        res.json({ success: true, status: 'paused' });
    } catch (error) {
        console.error('Pause error:', error);
        res.status(500).json({ error: 'Pause failed' });
    }
});

// ============================================================================
// POST /api/providers/resume - Resume provider
// ============================================================================
router.post('/resume', async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const lastHb = provider.last_heartbeat ? new Date(provider.last_heartbeat) : null;
        const isRecent = lastHb && (Date.now() - lastHb.getTime()) < 60000;
        const newStatus = isRecent ? 'online' : 'connected';

        runStatement('UPDATE providers SET status = ?, is_paused = 0 WHERE id = ?', newStatus, provider.id);
        res.json({ success: true, status: newStatus });
    } catch (error) {
        console.error('Resume error:', error);
        res.status(500).json({ error: 'Resume failed' });
    }
});

// ============================================================================
// POST /api/providers/preferences - Update provider preferences
// ============================================================================
router.post('/preferences', async (req, res) => {
    try {
        const { key, run_mode, scheduled_start, scheduled_end, gpu_usage_cap_pct, vram_reserve_gb, temp_limit_c } = req.body;
        const cleanKey = normalizeString(key, { maxLen: 128, trim: false });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [cleanKey]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        // Validate
        const validModes = ['always-on', 'manual', 'scheduled'];
        const cleanRunMode = run_mode == null ? null : normalizeString(run_mode, { maxLen: 24 });
        if (cleanRunMode && !validModes.includes(cleanRunMode)) {
            return res.status(400).json({ error: 'Invalid run_mode' });
        }
        const usageCap = gpu_usage_cap_pct == null
            ? null
            : toFiniteNumber(gpu_usage_cap_pct, { min: 0, max: 100 });
        if (gpu_usage_cap_pct != null && usageCap == null) {
            return res.status(400).json({ error: 'gpu_usage_cap_pct must be 0-100' });
        }
        const vramReserve = vram_reserve_gb == null
            ? null
            : toFiniteNumber(vram_reserve_gb, { min: 0, max: 16 });
        if (vram_reserve_gb != null && vramReserve == null) {
            return res.status(400).json({ error: 'vram_reserve_gb must be 0-16' });
        }
        const tempLimit = temp_limit_c == null
            ? null
            : toFiniteNumber(temp_limit_c, { min: 50, max: 100 });
        if (temp_limit_c != null && tempLimit == null) {
            return res.status(400).json({ error: 'temp_limit_c must be 50-100' });
        }

        const updates = {
            run_mode: cleanRunMode || provider.run_mode || 'always-on',
            scheduled_start: normalizeString(scheduled_start, { maxLen: 5 }) || provider.scheduled_start || '23:00',
            scheduled_end: normalizeString(scheduled_end, { maxLen: 5 }) || provider.scheduled_end || '07:00',
            gpu_usage_cap_pct: usageCap != null ? usageCap : (provider.gpu_usage_cap_pct != null ? provider.gpu_usage_cap_pct : 80),
            vram_reserve_gb: vramReserve != null ? vramReserve : (provider.vram_reserve_gb != null ? provider.vram_reserve_gb : 1),
            temp_limit_c: tempLimit != null ? tempLimit : (provider.temp_limit_c != null ? provider.temp_limit_c : 85)
        };

        runStatement(
            `UPDATE providers SET run_mode = ?, scheduled_start = ?, scheduled_end = ?, gpu_usage_cap_pct = ?, vram_reserve_gb = ?, temp_limit_c = ? WHERE id = ?`,
            updates.run_mode, updates.scheduled_start, updates.scheduled_end, updates.gpu_usage_cap_pct, updates.vram_reserve_gb, updates.temp_limit_c, provider.id
        );

        res.json({ success: true, preferences: updates });
    } catch (error) {
        console.error('Preferences error:', error);
        res.status(500).json({ error: 'Preferences update failed' });
    }
});

// ============================================================================
// POST /api/providers/endpoint - Update vLLM endpoint URL
// ============================================================================
router.post('/endpoint', (req, res) => {
    try {
        const { key, vllm_endpoint_url } = req.body;
        const cleanKey = normalizeString(key, { maxLen: 128, trim: false });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', [cleanKey]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        // Validate URL if provided
        let cleanUrl = null;
        if (vllm_endpoint_url) {
            cleanUrl = normalizeString(vllm_endpoint_url, { maxLen: 512, trim: true });
            if (cleanUrl && !/^https?:\/\//.test(cleanUrl)) {
                return res.status(400).json({ error: 'Endpoint URL must start with http:// or https://' });
            }
        }

        runStatement(
            'UPDATE providers SET vllm_endpoint_url = ? WHERE id = ?',
            cleanUrl, provider.id
        );

        res.json({ success: true, vllm_endpoint_url: cleanUrl });
    } catch (error) {
        console.error('Endpoint update error:', error);
        res.status(500).json({ error: 'Endpoint update failed' });
    }
});


// ============================================================================
// GET /api/providers/download - Download daemon installer with injected key
// ============================================================================
router.get('/download', async (req, res) => {
    try {
        const { key, platform } = req.query;
        const cleanKey = normalizeSingleQueryParam(key, { maxLen: 128 });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [cleanKey]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const isUnix = platform === 'linux' || platform === 'mac' || platform === 'darwin';
        const templateFile = isUnix ? 'daemon.sh' : 'daemon.ps1';
        const downloadName = isUnix ? 'dc1-setup.sh' : 'dc1-setup.ps1';
        const templatePath = path.join(__dirname, '../../installers', templateFile);

        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ error: 'Installer template not found' });
        }

        let script = fs.readFileSync(templatePath, 'utf-8');
        script = script.replace(/\{\{API_KEY\}\}/g, cleanKey);
        script = script.replace(/\{\{RUN_MODE\}\}/g, provider.run_mode || 'always-on');
        script = script.replace(/\{\{SCHEDULED_START\}\}/g, provider.scheduled_start || '23:00');
        script = script.replace(/\{\{SCHEDULED_END\}\}/g, provider.scheduled_end || '07:00');

        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(script);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/daemon/windows
// Canonical Windows installer endpoint used by dcp.sa download page
// ============================================================================
function sendWindowsInstaller(res) {
    if (fs.existsSync(WINDOWS_INSTALLER_PATH)) {
        res.setHeader('Content-Disposition', 'attachment; filename="dcp-provider-setup.exe"');
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.sendFile(WINDOWS_INSTALLER_PATH);
    }
    return res.status(404).json({
        error: 'Installer not yet built',
        message: 'makensis is required to build backend/installers/dcp-provider-Windows.nsi',
        build_docs: '/docs/build-installer.md',
        powershell_alternative: '/api/providers/setup-windows?key=YOUR_KEY'
    });
}

router.get('/daemon/windows', (req, res) => {
    return sendWindowsInstaller(res);
});

// ============================================================================
// GET /api/providers/daemon/linux
// Curl-able Linux setup entrypoint: curl -sSL .../daemon/linux | bash
// ============================================================================
router.get('/daemon/linux', (req, res) => {
    if (!fs.existsSync(LINUX_INSTALL_SCRIPT_PATH)) {
        return res.status(404).json({
            error: 'Linux install script not found',
            expected_path: 'backend/public/install.sh'
        });
    }

    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
    return res.sendFile(LINUX_INSTALL_SCRIPT_PATH);
});

// ============================================================================
// GET /api/providers/download-windows-exe
// Returns the generic Windows .exe installer (asks for API key during install)
// ============================================================================
router.get('/download-windows-exe', (req, res) => {
    return sendWindowsInstaller(res);
});

// ============================================================================
// POST /api/providers/readiness - Daemon reports system check results
// ============================================================================
router.post('/readiness', (req, res) => {
    try {
        const { api_key, checks, daemon_version } = req.body;
        const cleanApiKey = normalizeString(api_key, { maxLen: 128, trim: false });
        if (!cleanApiKey) return res.status(400).json({ error: 'API key required' });
        if (checks != null && !isPlainObject(checks)) {
            return res.status(400).json({ error: 'checks must be an object' });
        }

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanApiKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        // checks = { cuda: bool, pytorch: bool, vram_gb: number, driver: string, ... }
        const vramGb = toFiniteNumber(checks?.vram_gb, { min: 0, max: 1024 });
        const allPassed = !!checks && checks.cuda === true && checks.pytorch === true && vramGb != null && vramGb >= 4;
        const status = allPassed ? 'ready' : 'failed';

        runStatement(
            `UPDATE providers SET readiness_status = ?, readiness_details = ?, daemon_version = ?, updated_at = ? WHERE id = ?`,
            status, JSON.stringify(checks || {}), normalizeString(daemon_version, { maxLen: 32 }) || null, new Date().toISOString(), provider.id
        );

        res.json({ success: true, readiness_status: status, checks });
    } catch (error) {
        console.error('Readiness check error:', error);
        res.status(500).json({ error: 'Readiness check failed' });
    }
});

// ============================================================================
// GET /api/providers/:api_key/jobs - Daemon polls for assigned pending jobs
// ============================================================================
function normalizeComputeType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'training') return 'training';
    if (raw === 'rendering') return 'rendering';
    return 'inference';
}

const SUPPORTED_COMPUTE_TYPES = new Set(['inference', 'training', 'rendering']);

function parseComputeTypeToken(value) {
    const token = String(value || '').trim().toLowerCase();
    if (!SUPPORTED_COMPUTE_TYPES.has(token)) return null;
    return token;
}

function parseSupportedComputeTypesField(raw) {
    let source = raw;
    if (typeof source === 'string') {
        try {
            source = JSON.parse(source);
        } catch (_) {
            source = source.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }

    if (!Array.isArray(source)) return new Set();
    const parsed = new Set();
    for (const item of source) {
        const normalized = parseComputeTypeToken(item);
        if (normalized) parsed.add(normalized);
    }
    return parsed;
}

function discoverComputeTypesFromResourceSpec(resourceSpec) {
    const discovered = new Set();
    if (!resourceSpec) return discovered;
    const addCapability = (value) => {
        const token = String(value || '').toLowerCase();
        if (token.includes('train')) discovered.add('training');
        if (token.includes('render')) discovered.add('rendering');
        if (token.includes('infer') || token.includes('llm') || token.includes('serve')) discovered.add('inference');
    };

    if (Array.isArray(resourceSpec.compute_types)) {
        resourceSpec.compute_types.forEach(addCapability);
    }
    if (Array.isArray(resourceSpec?.capabilities?.compute_types)) {
        resourceSpec.capabilities.compute_types.forEach(addCapability);
    }
    if (Array.isArray(resourceSpec.compute_environments)) {
        resourceSpec.compute_environments.forEach((env) => {
            if (typeof env === 'string') {
                addCapability(env);
                return;
            }
            addCapability(env?.id);
            addCapability(env?.name);
            if (Array.isArray(env?.tags)) env.tags.forEach(addCapability);
            if (Array.isArray(env?.compute_types)) env.compute_types.forEach(addCapability);
        });
    }
    if (Array.isArray(resourceSpec.resources)) {
        resourceSpec.resources.forEach((resource) => {
            if (!resource || typeof resource !== 'object') return;
            addCapability(resource?.id);
            addCapability(resource?.type);
            addCapability(resource?.model);
            if (Array.isArray(resource?.tags)) resource.tags.forEach(addCapability);
            if (Array.isArray(resource?.compute_types)) resource.compute_types.forEach(addCapability);
            if (Array.isArray(resource?.capabilities?.compute_types)) {
                resource.capabilities.compute_types.forEach(addCapability);
            }
        });
    }

    return discovered;
}

const PROVIDER_ADMISSION_REASON_CODES = Object.freeze({
    OK: 'ADMISSION_OK',
    NO_PENDING_JOBS: 'NO_PENDING_JOBS',
    PROVIDER_PAUSED: 'PROVIDER_PAUSED',
    PROVIDER_OFFLINE: 'PROVIDER_OFFLINE',
    JOB_TIER_UNSUPPORTED: 'JOB_TIER_UNSUPPORTED',
    COMPUTE_TYPE_UNSUPPORTED: 'COMPUTE_TYPE_UNSUPPORTED',
    INSUFFICIENT_VRAM: 'INSUFFICIENT_VRAM',
    INSUFFICIENT_GPU_COUNT: 'INSUFFICIENT_GPU_COUNT',
    MODEL_COMPATIBILITY_UNSUPPORTED: 'MODEL_COMPATIBILITY_UNSUPPORTED',
    TIER_MODE_NOT_AVAILABLE: 'TIER_MODE_NOT_AVAILABLE',
    INSTANT_MODEL_NOT_CACHED: 'INSTANT_MODEL_NOT_CACHED',
    MODEL_UNSUPPORTED_ON_PROVIDER: 'MODEL_UNSUPPORTED_ON_PROVIDER',
    NO_ELIGIBLE_JOB_FOR_PROVIDER: 'NO_ELIGIBLE_JOB_FOR_PROVIDER',
});

const TIER_ADMISSION_REJECTION_CODES = Object.freeze([
    PROVIDER_ADMISSION_REASON_CODES.PROVIDER_PAUSED,
    PROVIDER_ADMISSION_REASON_CODES.PROVIDER_OFFLINE,
    PROVIDER_ADMISSION_REASON_CODES.JOB_TIER_UNSUPPORTED,
    PROVIDER_ADMISSION_REASON_CODES.COMPUTE_TYPE_UNSUPPORTED,
    PROVIDER_ADMISSION_REASON_CODES.INSUFFICIENT_VRAM,
    PROVIDER_ADMISSION_REASON_CODES.INSUFFICIENT_GPU_COUNT,
    PROVIDER_ADMISSION_REASON_CODES.MODEL_COMPATIBILITY_UNSUPPORTED,
    PROVIDER_ADMISSION_REASON_CODES.TIER_MODE_NOT_AVAILABLE,
    PROVIDER_ADMISSION_REASON_CODES.INSTANT_MODEL_NOT_CACHED,
    PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
    PROVIDER_ADMISSION_REASON_CODES.NO_ELIGIBLE_JOB_FOR_PROVIDER,
]);
const TIER_ADMISSION_REJECTION_CODE_SET = new Set(TIER_ADMISSION_REJECTION_CODES);

const TIER_MODE_BY_PREWARM_CLASS = Object.freeze({
    hot: 'instant',
    warm: 'cached',
    cold: 'on-demand',
});
const TIER_MODE_BY_GPU_TIER = Object.freeze({
    A: ['instant', 'cached', 'on-demand'],
    B: ['cached', 'on-demand'],
    C: ['on-demand'],
});

const LOW_VRAM_AWQ_ENFORCEMENT_MAX_MB = 12288;
let cachedVllmCompatibilityIndex = null;

function normalizeModelToken(value) {
    return normalizeString(value, { maxLen: 500 })?.toLowerCase() || null;
}

function toVariantRecord(rawVariant) {
    if (!isPlainObject(rawVariant)) return null;
    const minVramMb =
        toFiniteInt(rawVariant.min_vram_mb, { min: 1, max: 1024 * 1024 }) ||
        toFiniteInt(rawVariant.vram_required_mb, { min: 1, max: 1024 * 1024 }) ||
        null;
    if (!minVramMb) return null;

    const aliases = new Set();
    const addAlias = (raw) => {
        const normalized = normalizeModelToken(raw);
        if (normalized) aliases.add(normalized);
    };
    addAlias(rawVariant.model_id);
    if (Array.isArray(rawVariant.aliases)) rawVariant.aliases.forEach(addAlias);

    return {
        min_vram_mb: minVramMb,
        available: rawVariant.available !== false,
        availability_note: normalizeString(rawVariant.availability_note, { maxLen: 500 }),
        recommended_script: normalizeString(rawVariant.recommended_script, { maxLen: 500 }),
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
            if (!isPlainObject(model)) continue;
            const canonicalId = normalizeModelToken(model.id);
            if (!canonicalId) continue;

            const variants = {};
            const variantAliases = new Map();
            const rawVariants = isPlainObject(model.variants) ? model.variants : {};
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

        cachedVllmCompatibilityIndex = {
            available: true,
            byAlias,
        };
        return cachedVllmCompatibilityIndex;
    } catch (error) {
        console.error('[providers] Failed to load vLLM compatibility matrix:', error.message);
        cachedVllmCompatibilityIndex = {
            available: false,
            byAlias: new Map(),
        };
        return cachedVllmCompatibilityIndex;
    }
}

function evaluateLowVramInferenceCompatibility(providerProfile, jobRequirements) {
    if (jobRequirements.compute_type !== 'inference' || !jobRequirements.model_id) {
        return { accepted: true };
    }
    if (providerProfile.vram_mb > LOW_VRAM_AWQ_ENFORCEMENT_MAX_MB) {
        return { accepted: true };
    }

    const compatibilityIndex = loadVllmCompatibilityIndex();
    if (!compatibilityIndex.available) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
            reason: 'Low-VRAM inference admission requires vLLM compatibility matrix, but it is unavailable',
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }

    const normalizedModelId = normalizeModelToken(jobRequirements.model_id);
    const modelEntry = normalizedModelId ? compatibilityIndex.byAlias.get(normalizedModelId) : null;
    if (!modelEntry) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
            reason: `Model '${jobRequirements.model_id}' is not supported for <=12GB AWQ provider routing`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }

    const requestedVariant = normalizedModelId && modelEntry.variantAliases.has(normalizedModelId)
        ? modelEntry.variantAliases.get(normalizedModelId)
        : null;
    const selectedVariant = requestedVariant || modelEntry.defaultVariant;
    const variantConfig = modelEntry.variants[selectedVariant];
    if (!variantConfig) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
            reason: `Compatibility matrix is missing variant '${selectedVariant}' for model '${jobRequirements.model_id}'`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }

    if (!variantConfig.available) {
        if (modelEntry.fallbackVariant) {
            const fallbackConfig = modelEntry.variants[modelEntry.fallbackVariant];
            if (fallbackConfig && providerProfile.vram_mb >= fallbackConfig.min_vram_mb) {
                return { accepted: true };
            }
            if (fallbackConfig) {
                return {
                    accepted: false,
                    reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
                    reason: `${jobRequirements.model_id}: AWQ weights unavailable (${variantConfig.availability_note || 'upstream missing'}); fallback '${modelEntry.fallbackVariant}' needs at least ${fallbackConfig.min_vram_mb} MiB VRAM`,
                    tier_mode: jobRequirements.tier_mode,
                    prewarm_class: jobRequirements.prewarm_class,
                };
            }
        }
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
            reason: `${jobRequirements.model_id}: AWQ weights unavailable (${variantConfig.availability_note || 'upstream missing'})`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }

    if (providerProfile.vram_mb < variantConfig.min_vram_mb) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_UNSUPPORTED_ON_PROVIDER,
            reason: `Model '${jobRequirements.model_id}' requires ${variantConfig.min_vram_mb} MiB VRAM for ${selectedVariant}, provider has ${providerProfile.vram_mb} MiB`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }

    return { accepted: true };
}

function resolveTierMode(prewarmClass) {
    const normalized = normalizeString(prewarmClass, { maxLen: 32 })?.toLowerCase() || 'warm';
    return {
        prewarm_class: normalized,
        tier_mode: TIER_MODE_BY_PREWARM_CLASS[normalized] || null,
    };
}

function parseAvailableGpuTiers(raw) {
    const parsed = safeJsonParse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const tiers = new Set();
    for (const value of parsed) {
        const tier = normalizeString(value, { maxLen: 4, trim: true })?.toUpperCase();
        if (tier && TIER_MODE_BY_GPU_TIER[tier]) tiers.add(tier);
    }
    return tiers;
}

function getProviderRoutingProfile(provider) {
    const vramMb =
        toFiniteInt(provider.vram_mb, { min: 0, max: 1024 * 1024 }) ||
        toFiniteInt(provider.gpu_vram_mb, { min: 0, max: 1024 * 1024 }) ||
        (toFiniteInt(provider.gpu_vram_mib, { min: 0, max: 1024 * 1024 }) != null
            ? Math.round(provider.gpu_vram_mib)
            : null) ||
        (toFiniteNumber(provider.vram_gb, { min: 0, max: 1024 }) != null
            ? Math.round(Number(provider.vram_gb) * 1024)
            : 0);

    const gpuCount =
        toFiniteInt(provider.gpu_count_reported, { min: 1, max: 64 }) ||
        toFiniteInt(provider.gpu_count, { min: 1, max: 64 }) ||
        1;

    const declared = parseSupportedComputeTypesField(provider.supported_compute_types);
    const supported = declared.size > 0
        ? declared
        : new Set(['inference', 'training', 'rendering']);

    if (declared.size === 0) {
        const resourceSpec = safeJsonParse(provider.resource_spec);
        const discovered = discoverComputeTypesFromResourceSpec(resourceSpec);
        if (discovered.size > 0) {
            supported.clear();
            discovered.forEach((cap) => supported.add(cap));
        }
    }

    const cachedModelsRaw = safeJsonParse(provider.cached_models);
    const cachedModels = new Set();
    if (Array.isArray(cachedModelsRaw)) {
        for (const modelId of cachedModelsRaw) {
            const normalizedModel = normalizeString(modelId, { maxLen: 500 })?.toLowerCase();
            if (normalizedModel) cachedModels.add(normalizedModel);
        }
    }

    const availableGpuTiers = parseAvailableGpuTiers(provider.available_gpu_tiers);
    const availableTierModes = new Set();
    if (availableGpuTiers.size > 0) {
        for (const tier of availableGpuTiers) {
            const supportedModes = TIER_MODE_BY_GPU_TIER[tier] || [];
            supportedModes.forEach((mode) => availableTierModes.add(mode));
        }
    } else {
        // Backward-compatible fallback: if daemon does not publish explicit tier contract yet,
        // keep legacy behavior and defer tier gating to model/cache-specific checks.
        availableTierModes.add('on-demand');
        availableTierModes.add('cached');
        availableTierModes.add('instant');
    }

    return {
        vram_mb: Number(vramMb || 0),
        gpu_count: Number(gpuCount || 1),
        supported_compute_types: supported,
        cached_models: cachedModels,
        available_gpu_tiers: availableGpuTiers,
        available_tier_modes: availableTierModes,
        tier_capability_source: availableGpuTiers.size > 0 ? 'available_gpu_tiers' : 'heuristic',
        gpu_label: normalizeString(provider.gpu_name_detected, { maxLen: 120 })
            || normalizeString(provider.gpu_model, { maxLen: 120 })
            || null,
    };
}

function buildTierCapabilityContract(providerProfile, requirements) {
    return {
        required_tier_mode: requirements.tier_mode || null,
        provider_tier_modes: Array.from(providerProfile.available_tier_modes || []),
        provider_gpu_tiers: Array.from(providerProfile.available_gpu_tiers || []),
        source: providerProfile.tier_capability_source || 'heuristic',
    };
}

function normalizeAdmissionRejectionCode(value) {
    const code = normalizeString(value, { maxLen: 128, trim: true });
    return code && TIER_ADMISSION_REJECTION_CODE_SET.has(code) ? code : null;
}

function fetchLatestTierAdmissionRejection(providerId) {
    const row = db.get(
        `SELECT occurred_at, metadata_json
           FROM provider_activation_events
          WHERE provider_id = ?
            AND event_code = 'tier_admission_rejected'
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        providerId
    );
    if (!row) {
        return {
            latest_rejection_code: null,
            latest_rejection_at: null,
            code_enum: TIER_ADMISSION_REJECTION_CODES,
        };
    }

    let metadata = null;
    if (row.metadata_json) {
        try {
            metadata = JSON.parse(row.metadata_json);
        } catch (_) {
            metadata = null;
        }
    }
    const rejectionCode = normalizeAdmissionRejectionCode(metadata?.rejection_code);
    return {
        latest_rejection_code: rejectionCode,
        latest_rejection_at: row.occurred_at || null,
        code_enum: TIER_ADMISSION_REJECTION_CODES,
    };
}

function parseJobContainerRequirements(containerSpecRaw, prewarmCache = null) {
    let containerSpec = null;
    try { containerSpec = containerSpecRaw ? JSON.parse(containerSpecRaw) : null; } catch (_) {}
    const vramRequiredMb = toFiniteInt(containerSpec?.vram_required_mb, { min: 0, max: 1024 * 1024 }) || 0;
    const gpuCount = toFiniteInt(containerSpec?.gpu_count, { min: 1, max: 64 }) || 1;
    const computeType = normalizeComputeType(containerSpec?.compute_type);

    // Sprint 25 Gap 5: tier-aware routing — look up model's prewarm_class
    const modelId = normalizeString(containerSpec?.model_id, { maxLen: 500 }) || null;
    let prewarmClass = 'warm';
    if (modelId) {
        if (prewarmCache && prewarmCache.has(modelId)) {
            prewarmClass = prewarmCache.get(modelId);
        } else {
            const modelRecord = db.get(
                'SELECT prewarm_class FROM model_registry WHERE model_id = ? AND is_active = 1',
                modelId
            );
            prewarmClass = normalizeString(modelRecord?.prewarm_class)?.toLowerCase() || 'warm';
            if (prewarmCache) prewarmCache.set(modelId, prewarmClass);
        }
    }

    const tier = resolveTierMode(prewarmClass);

    return {
        vram_required_mb: vramRequiredMb,
        gpu_count: gpuCount,
        compute_type: computeType,
        container_spec: containerSpec,
        model_id: modelId,
        prewarm_class: tier.prewarm_class,
        tier_mode: tier.tier_mode,
    };
}

function evaluateProviderAdmission(providerProfile, jobRequirements) {
    if (!jobRequirements.tier_mode) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.JOB_TIER_UNSUPPORTED,
            reason: `Unsupported prewarm class '${jobRequirements.prewarm_class || 'unknown'}'`,
            tier_mode: null,
            prewarm_class: jobRequirements.prewarm_class || null,
        };
    }
    if (!providerProfile.supported_compute_types.has(jobRequirements.compute_type)) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.COMPUTE_TYPE_UNSUPPORTED,
            reason: `Provider does not support compute type '${jobRequirements.compute_type}'`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }
    if (!providerProfile.available_tier_modes.has(jobRequirements.tier_mode)) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.TIER_MODE_NOT_AVAILABLE,
            reason: `Provider does not advertise required tier mode '${jobRequirements.tier_mode}'`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
            provider_tier_modes: Array.from(providerProfile.available_tier_modes || []),
            provider_gpu_tiers: Array.from(providerProfile.available_gpu_tiers || []),
        };
    }
    const modelCompatibility = evaluateLowVramInferenceCompatibility(providerProfile, jobRequirements);
    if (!modelCompatibility.accepted) {
        return modelCompatibility;
    }
    if (providerProfile.vram_mb < jobRequirements.vram_required_mb) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.INSUFFICIENT_VRAM,
            reason: `Provider VRAM ${providerProfile.vram_mb} MiB is below required ${jobRequirements.vram_required_mb} MiB`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }
    if (providerProfile.gpu_count < jobRequirements.gpu_count) {
        return {
            accepted: false,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.INSUFFICIENT_GPU_COUNT,
            reason: `Provider GPU count ${providerProfile.gpu_count} is below required ${jobRequirements.gpu_count}`,
            tier_mode: jobRequirements.tier_mode,
            prewarm_class: jobRequirements.prewarm_class,
        };
    }
    if (jobRequirements.model_id) {
        const compatibility = evaluateProviderModelCompatibility({
            modelId: jobRequirements.model_id,
            providerVramMb: providerProfile.vram_mb,
        });
        if (!compatibility.supported) {
            return {
                accepted: false,
                reason_code: PROVIDER_ADMISSION_REASON_CODES.MODEL_COMPATIBILITY_UNSUPPORTED,
                reason: compatibility.reason,
                tier_mode: jobRequirements.tier_mode,
                prewarm_class: jobRequirements.prewarm_class,
                model_id: jobRequirements.model_id,
                matrix_version: compatibility.matrix_version || null,
                min_required_vram_mb: compatibility.min_required_vram_mb || null,
                recommended_script: compatibility.recommended_script || null,
            };
        }
        // Include compatibility data on accepted admissions for deterministic operator hints.
        if (compatibility.known) {
            jobRequirements._compatibility = compatibility;
        }
    }
    if (jobRequirements.tier_mode === 'instant' && jobRequirements.model_id) {
        const normalizedModelId = normalizeString(jobRequirements.model_id, { maxLen: 500 })?.toLowerCase();
        if (!normalizedModelId || !providerProfile.cached_models?.has(normalizedModelId)) {
            return {
                accepted: false,
                reason_code: PROVIDER_ADMISSION_REASON_CODES.INSTANT_MODEL_NOT_CACHED,
                reason: `Instant tier requires cached model '${jobRequirements.model_id}'`,
                tier_mode: jobRequirements.tier_mode,
                prewarm_class: jobRequirements.prewarm_class,
            };
        }
    }
    return {
        accepted: true,
        reason_code: PROVIDER_ADMISSION_REASON_CODES.OK,
        reason: 'Provider satisfies admission checks',
        tier_mode: jobRequirements.tier_mode,
        prewarm_class: jobRequirements.prewarm_class,
        resolved_model_id: jobRequirements?._compatibility?.resolved_model_id || null,
        resolved_variant: jobRequirements?._compatibility?.resolved_variant || null,
        recommended_script: jobRequirements?._compatibility?.recommended_script || null,
        fallback_used: Boolean(jobRequirements?._compatibility?.fallback_used),
        matrix_version: jobRequirements?._compatibility?.matrix_version || null,
    };
}

function buildNextPendingJob(providerId) {
    const provider = db.get(
        `SELECT id, wallet_address, is_paused, last_heartbeat, resource_spec, supported_compute_types, gpu_count, gpu_count_reported,
                gpu_model, gpu_name_detected,
                vram_mb, gpu_vram_mb, gpu_vram_mib, vram_gb, cached_models, available_gpu_tiers, model_preload_status
         FROM providers
         WHERE id = ?`,
        providerId
    );
    if (!provider) {
        return {
            job: null,
            admission: {
                accepted: false,
                reason_code: PROVIDER_ADMISSION_REASON_CODES.PROVIDER_OFFLINE,
                reason: 'Provider not found',
            },
        };
    }
    if (Number(provider.is_paused || 0) === 1) {
        return {
            job: null,
            admission: {
                accepted: false,
                reason_code: PROVIDER_ADMISSION_REASON_CODES.PROVIDER_PAUSED,
                reason: 'Provider is paused',
            },
        };
    }
    const providerStatus = computeProviderStatus(provider.last_heartbeat, Date.now());
    if (providerStatus.status === 'offline') {
        return {
            job: null,
            admission: {
                accepted: false,
                reason_code: PROVIDER_ADMISSION_REASON_CODES.PROVIDER_OFFLINE,
                reason: 'Provider heartbeat is stale/offline',
            },
        };
    }

    const providerProfile = getProviderRoutingProfile(provider);
    const candidates = db.all(
        `SELECT id, job_id, job_type, model, priority, task_spec, task_spec_hmac, gpu_requirements,
                container_spec, duration_minutes, max_duration_seconds, status, created_at, provider_id,
                renter_id, cost_halala
         FROM jobs
         WHERE status IN ('pending', 'queued')
           AND task_spec IS NOT NULL
           AND picked_up_at IS NULL
           AND (provider_id = ? OR provider_id IS NULL)
         ORDER BY
           COALESCE(priority, 5) DESC,
           CASE status WHEN 'pending' THEN 0 ELSE 1 END,
           created_at ASC
         LIMIT 200`,
        providerId
    );

    let job = null;
    let parsedContainerSpec = null;
    let selectedAdmission = null;
    const now = new Date().toISOString();
    const prewarmCache = new Map(); // memoize model_registry lookups within this poll
    for (const candidate of candidates) {
        const requirements = parseJobContainerRequirements(candidate.container_spec, prewarmCache);
        const admission = evaluateProviderAdmission(providerProfile, requirements);
        if (!admission.accepted) {
            const rejectionCode = normalizeAdmissionRejectionCode(admission.reason_code);
            if (rejectionCode) {
                recordActivationEvent(providerId, 'tier_admission_rejected', {
                    rejection_code: rejectionCode,
                    reason_code: rejectionCode,
                    reason: admission.reason || null,
                    tier_mode: admission.tier_mode || requirements.tier_mode || null,
                    prewarm_class: admission.prewarm_class || requirements.prewarm_class || null,
                    job_id: candidate.job_id || null,
                    model_id: requirements.model_id || null,
                    compute_type: requirements.compute_type || null,
                });
            }
            if (!selectedAdmission) {
                selectedAdmission = {
                    ...admission,
                    job_id: candidate.job_id,
                    compute_type: requirements.compute_type,
                    model_id: requirements.model_id,
                    tier_capability: buildTierCapabilityContract(providerProfile, requirements),
                };
            }
            continue;
        }

        const updateResult = runStatement(
            `UPDATE jobs
             SET provider_id = ?,
                 assigned_at = COALESCE(assigned_at, ?),
                 picked_up_at = ?,
                 status = 'running',
                 started_at = COALESCE(started_at, ?),
                 timeout_at = datetime(?, '+' || COALESCE(max_duration_seconds, 600) || ' seconds')
             WHERE id = ?
               AND status IN ('pending', 'queued')
               AND picked_up_at IS NULL
               AND (provider_id = ? OR provider_id IS NULL)`,
            providerId, now, now, now, now, candidate.id, providerId
        );
        if ((updateResult?.changes || 0) !== 1) {
            continue;
        }

        job = candidate;
        parsedContainerSpec = requirements.container_spec;
        selectedAdmission = {
            ...admission,
            job_id: candidate.job_id,
            compute_type: requirements.compute_type,
            model_id: requirements.model_id,
            tier_capability: buildTierCapabilityContract(providerProfile, requirements),
        };
        break;
    }

    if (!job) {
        return {
            job: null,
            admission: selectedAdmission || {
                accepted: false,
                reason_code: candidates.length > 0
                    ? PROVIDER_ADMISSION_REASON_CODES.NO_ELIGIBLE_JOB_FOR_PROVIDER
                    : PROVIDER_ADMISSION_REASON_CODES.NO_PENDING_JOBS,
                reason: candidates.length > 0
                    ? 'Pending jobs exist but none pass provider admission checks'
                    : 'No pending jobs available',
                tier_capability: {
                    required_tier_mode: null,
                    provider_tier_modes: Array.from(providerProfile.available_tier_modes || []),
                    provider_gpu_tiers: Array.from(providerProfile.available_gpu_tiers || []),
                    source: providerProfile.tier_capability_source || 'heuristic',
                },
            },
        };
    }

    const nextAttemptRow = db.get(
        'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number FROM job_executions WHERE job_id = ?',
        job.job_id
    );
    const attemptNumber = Number(nextAttemptRow?.attempt_number || 1);
    const logPath = getAttemptLogPath(job.job_id, attemptNumber);
    runStatement(
        `INSERT INTO job_executions (job_id, attempt_number, started_at, log_path, gpu_seconds_used, cost_halala)
         VALUES (?, ?, ?, ?, 0, 0)`,
        job.job_id,
        attemptNumber,
        now,
        logPath
    );
    const escrowExpirySeconds = Number(job.max_duration_seconds || 600) + 1800;
    const escrowExpiresAt = new Date(Date.now() + (escrowExpirySeconds * 1000)).toISOString();
    const renterApiKey = job.renter_id != null
        ? db.get('SELECT api_key FROM renters WHERE id = ?', job.renter_id)?.api_key
        : null;
    if (renterApiKey && Number.isFinite(Number(job.cost_halala)) && Number(job.cost_halala) > 0) {
        const amountHalala = Number(job.cost_halala);
        runStatement(
            `INSERT OR IGNORE INTO escrow_holds (id, renter_api_key, provider_id, job_id, amount_halala, status, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, 'held', ?, ?)`,
            `esc-${job.job_id}`,
            renterApiKey,
            providerId,
            job.job_id,
            amountHalala,
            now,
            escrowExpiresAt
        );
        runStatement(`UPDATE escrow_holds SET status = 'locked' WHERE job_id = ? AND status = 'held'`, job.job_id);

        const chainEscrow = getChainEscrow();
        if (chainEscrow.isEnabled()) {
            const expiryMs = new Date(escrowExpiresAt).getTime();
            chainEscrow.getEscrow(job.job_id).then((record) => {
                const chainStatus = Number(record?.status);
                if (!record || chainStatus !== 1) {
                    return chainEscrow.depositAndLock(
                        job.job_id,
                        provider?.wallet_address || null,
                        amountHalala,
                        expiryMs
                    );
                }
                return null;
            }).catch((err) => {
                console.error('[escrow-chain] pre-lock check failed for job', job.job_id, ':', err.message);
            });
        }
    }
    runStatement(`UPDATE providers SET current_job_id = ? WHERE id = ?`, job.job_id, providerId);

    let taskSpec = job.task_spec;
    try { taskSpec = JSON.parse(taskSpec); } catch {}

    fireAndForgetJobEmail('started', job, {
        estimated_duration_minutes: Number(job.duration_minutes || 0),
    });

    return {
        job: {
        id: job.id,
        job_id: job.job_id,
        job_type: job.job_type,
        model: job.model || null,
        priority: Number.isInteger(job.priority) ? job.priority : 5,
        task_spec: taskSpec,
        task_spec_hmac: job.task_spec_hmac,
        attempt_number: attemptNumber,
        container_spec: parsedContainerSpec,
        gpu_requirements: job.gpu_requirements ? JSON.parse(job.gpu_requirements) : null,
        duration_minutes: job.duration_minutes,
        max_duration_seconds: job.max_duration_seconds || 600
        },
        admission: selectedAdmission || {
            accepted: true,
            reason_code: PROVIDER_ADMISSION_REASON_CODES.OK,
            reason: 'Provider satisfies admission checks',
            tier_capability: {
                required_tier_mode: null,
                provider_tier_modes: Array.from(providerProfile.available_tier_modes || []),
                provider_gpu_tiers: Array.from(providerProfile.available_gpu_tiers || []),
                source: providerProfile.tier_capability_source || 'heuristic',
            },
        },
    };
}

router.get('/:api_key/jobs', (req, res) => {
    try {
        const { api_key } = req.params;
        const provider = db.get('SELECT id, readiness_status FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });
        const decision = buildNextPendingJob(provider.id);
        return res.json({ job: decision.job || null, admission: decision.admission || null });
    } catch (error) {
        console.error('Job poll error:', error);
        res.status(500).json({ error: 'Job poll failed' });
    }
});

// ============================================================================
// GET /api/providers/jobs/next - Daemon polls next pending job by API key
// Auth: x-provider-key header or ?key=
// ============================================================================
router.get('/jobs/next', (req, res) => {
    try {
        const cleanApiKey = normalizeString(
            req.headers['x-provider-key'] || req.query.key,
            { maxLen: 128, trim: false }
        );
        if (!cleanApiKey) return res.status(400).json({ error: 'Provider API key required' });
        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanApiKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });
        const decision = buildNextPendingJob(provider.id);
        return res.json({ job: decision.job || null, admission: decision.admission || null });
    } catch (error) {
        console.error('Job next poll error:', error);
        res.status(500).json({ error: 'Job poll failed' });
    }
});

// ============================================================================
// PATCH /api/providers/jobs/:job_id/logs - Provider daemon streams log lines
// ============================================================================
router.patch('/jobs/:job_id/logs', (req, res) => {
    try {
        const bodyKey = normalizeString(req.body?.api_key, { maxLen: 128, trim: false });
        const headerKey = normalizeString(req.headers['x-provider-key'], { maxLen: 128, trim: false });
        const apiKey = bodyKey || headerKey;
        if (!apiKey) return res.status(401).json({ error: 'api_key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const job = db.get(
            'SELECT id, job_id FROM jobs WHERE (id = ? OR job_id = ?) AND provider_id = ? LIMIT 1',
            req.params.job_id,
            req.params.job_id,
            provider.id
        );
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const rawLines = Array.isArray(req.body?.lines)
            ? req.body.lines
            : (req.body?.line != null ? [{ level: req.body.level || 'info', message: req.body.line }] : []);
        if (!Array.isArray(rawLines) || rawLines.length === 0) {
            return res.status(400).json({ error: 'Provide line or lines[]' });
        }

        const VALID_LEVELS = new Set(['info', 'warn', 'error', 'debug']);
        const normalized = rawLines
            .slice(0, 500)
            .map((entry) => {
                const levelCandidate = String(entry?.level || '').toLowerCase();
                const level = VALID_LEVELS.has(levelCandidate) ? levelCandidate : 'info';
                const message = String(entry?.message || '').slice(0, 2000);
                return { level, message };
            })
            .filter((entry) => entry.message.length > 0);
        if (normalized.length === 0) return res.status(400).json({ error: 'No valid log lines provided' });

        const latestAttempt = db.get(
            `SELECT attempt_number FROM job_executions
             WHERE job_id = ?
             ORDER BY attempt_number DESC
             LIMIT 1`,
            job.job_id
        );
        const requestedAttempt = toFiniteInt(req.body?.attempt_number, { min: 1 });
        const attemptNumber = requestedAttempt || Number(latestAttempt?.attempt_number || 1);

        const maxRow = db.get('SELECT MAX(line_no) as max_line FROM job_logs WHERE job_id = ?', job.job_id);
        let lineNo = (maxRow?.max_line || 0) + 1;
        const now = new Date().toISOString();
        const ts = Date.parse(now) || Date.now();

        const insert = db.prepare(
            'INSERT INTO job_logs (job_id, line_no, level, message, logged_at) VALUES (?, ?, ?, ?, ?)'
        );
        const updateJsonl = db.prepare(
            `UPDATE jobs
             SET logs_jsonl = substr(COALESCE(logs_jsonl, '') || ?, -1000000),
                 updated_at = ?
             WHERE id = ?`
        );

        const writeTx = db._db.transaction((rows) => {
            const jsonlParts = [];
            for (const row of rows) {
                insert.run(job.job_id, lineNo++, row.level, row.message, now);
                jsonlParts.push(JSON.stringify({
                    type: 'log',
                    line: row.message,
                    ts,
                    level: row.level,
                }));
            }
            updateJsonl.run(`${jsonlParts.join('\n')}\n`, now, job.id);
        });

        writeTx(normalized);
        const logPath = appendAttemptLogLines(job.job_id, attemptNumber, normalized);
        runStatement(
            `UPDATE job_executions
             SET log_path = COALESCE(log_path, ?)
             WHERE job_id = ? AND attempt_number = ?`,
            logPath,
            job.job_id,
            attemptNumber
        );
        res.json({ success: true, lines_written: normalized.length, attempt_number: attemptNumber });
    } catch (error) {
        console.error('Provider job logs write error:', error);
        res.status(500).json({ error: 'Failed to write job logs' });
    }
});

// ============================================================================
// POST /api/providers/job-result - Daemon submits completed job result
// ============================================================================
router.post('/job-result', (req, res) => {
    try {
        const {
            api_key,
            job_id,
            result,
            success,
            error: jobError,
            metrics,
            gpu_seconds_used,
            exit_code,
            attempt_number,
            restart_count,
            last_error,
        } = req.body;
        const cleanApiKey = normalizeString(api_key, { maxLen: 128, trim: false });
        const cleanJobId = normalizeString(job_id, { maxLen: 80, trim: true });
        if (!cleanApiKey || !cleanJobId) return res.status(400).json({ error: 'api_key and job_id required' });

        const provider = db.get(
            'SELECT id, cost_per_gpu_second_halala FROM providers WHERE api_key = ?',
            cleanApiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const job = db.get('SELECT * FROM jobs WHERE job_id = ? AND provider_id = ?', cleanJobId, provider.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (job.status !== 'running') return res.json({ success: true, message: `Job already settled (${job.status})` });

        const now = new Date().toISOString();
        const successFlag = success === true || success === 'true' || success === 1;
        const newStatus = successFlag ? 'completed' : 'failed';
        const restartCount = toFiniteInt(restart_count, { min: 0, max: 100 }) ?? 0;
        const lastError = normalizeString(last_error, { maxLen: 1000 }) || normalizeString(jobError, { maxLen: 1000 }) || null;

        // Calculate actual duration and billing
        const startedAt = job.started_at || job.submitted_at;
        const actualMinutes = startedAt ? Math.ceil((Date.now() - new Date(startedAt).getTime()) / 60000) : job.duration_minutes || 0;
        const elapsedSeconds = startedAt
            ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000)
            : Math.max(0, Number(actualMinutes || 0) * 60);
        const metricsGpuCount = toFiniteInt(metrics?.gpu_count, { min: 1, max: 64 });
        const gpuCount = metricsGpuCount || 1;
        const reportedGpuSeconds = toFiniteNumber(gpu_seconds_used, { min: 0 });
        const actualGpuSeconds = reportedGpuSeconds != null
            ? reportedGpuSeconds
            : Math.round(elapsedSeconds * gpuCount * 1000) / 1000;

        // Billing rates (halala / GPU-second)
        const fallbackGpuSecondRate = (COST_RATES[job.job_type] || COST_RATES['default']) / 60;
        const providerGpuSecondRate = toFiniteNumber(provider.cost_per_gpu_second_halala, { min: 0 });
        const ratePerGpuSecond = providerGpuSecondRate != null ? providerGpuSecondRate : fallbackGpuSecondRate;
        const actualCostHalala = Math.max(0, Math.round(actualGpuSeconds * ratePerGpuSecond));
        const providerEarned = Math.floor(actualCostHalala * 0.75);
        const dc1Fee = actualCostHalala - providerEarned;

        runStatement(
            `UPDATE jobs SET status = ?, result = ?, error = ?, completed_at = ?,
             actual_duration_minutes = ?, duration_seconds = ?, actual_cost_halala = ?,
             provider_earned_halala = ?, dc1_fee_halala = ?,
             restart_count = ?, last_error = ?
             WHERE id = ?`,
            newStatus, typeof result === 'string' ? result : JSON.stringify(result || {}), lastError, now,
            actualMinutes, Math.round(elapsedSeconds), actualCostHalala, providerEarned, dc1Fee, restartCount, lastError, job.id
        );

        // Update provider stats
        if (successFlag) {
            runStatement(
                `UPDATE providers SET total_earnings = total_earnings + ?, claimable_earnings_halala = claimable_earnings_halala + ?, total_jobs = total_jobs + 1, current_job_id = NULL WHERE id = ?`,
                providerEarned / 100, providerEarned, provider.id  // total_earnings is in SAR, claimable in halala
            );
        } else {
            runStatement(`UPDATE providers SET current_job_id = NULL WHERE id = ?`, provider.id);
        }

        // ── Release escrow to provider (or back to renter on failure) ──
        if (successFlag) {
            runStatement(
                `UPDATE escrow_holds SET status = 'released_provider', resolved_at = ? WHERE job_id = ? AND status IN ('held','locked')`,
                now, cleanJobId
            );
        } else {
            runStatement(
                `UPDATE escrow_holds SET status = 'released_renter', resolved_at = ? WHERE job_id = ? AND status IN ('held','locked')`,
                now, cleanJobId
            );
        }

        // ── Renter billing settlement ──────────────────────────────────
        // Pre-pay hold was deducted at submit time (cost_halala).
        // Now settle: refund difference if actual < estimated, or charge extra.
        if (job.renter_id) {
            const estimatedCost = job.cost_halala || 0;
            if (successFlag) {
                const delta = estimatedCost - actualCostHalala; // positive = refund, negative = extra charge
                if (delta !== 0) {
                    runStatement(
                        `UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`,
                        delta, job.renter_id
                    );
                }
                runStatement(
                    `UPDATE renters SET total_spent_halala = total_spent_halala + ?, total_jobs = total_jobs + 1 WHERE id = ?`,
                    actualCostHalala, job.renter_id
                );
            } else {
                // Failure path: release full pre-paid quote to renter
                if (estimatedCost > 0 && !job.refunded_at) {
                    runStatement(
                        `UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`,
                        estimatedCost,
                        job.renter_id
                    );
                    runStatement(
                        `UPDATE jobs SET refunded_at = ? WHERE id = ?`,
                        now,
                        job.id
                    );
                }
            }
        }

        const latestAttempt = db.get(
            `SELECT attempt_number FROM job_executions WHERE job_id = ? ORDER BY attempt_number DESC LIMIT 1`,
            cleanJobId
        );
        const attempted = toFiniteInt(attempt_number, { min: 1 }) || Number(latestAttempt?.attempt_number || 1);
        const resolvedExitCode = toFiniteInt(exit_code, { min: -255, max: 255 });
        runStatement(
            `UPDATE job_executions
             SET ended_at = ?, exit_code = ?, gpu_seconds_used = ?, cost_halala = ?, log_path = COALESCE(log_path, ?)
             WHERE job_id = ? AND attempt_number = ?`,
            now,
            resolvedExitCode != null ? resolvedExitCode : (successFlag ? 0 : 1),
            actualGpuSeconds,
            actualCostHalala,
            getAttemptLogPath(cleanJobId, attempted),
            cleanJobId,
            attempted
        );

        const textResult = typeof result === 'string' ? result : null;
        if (textResult) {
            appendAttemptRawText(cleanJobId, attempted, `\n${textResult}\n`);
        }

        const updated = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
        fireAndForgetJobEmail(successFlag ? 'completed' : 'failed', updated || job, {
            actual_cost_halala: actualCostHalala,
            gpu_seconds_used: actualGpuSeconds,
            refunded_amount_halala: successFlag ? 0 : Number(job.cost_halala || 0),
            retry_attempts: Number(restartCount || 0),
            last_error: lastError,
        });
        if (!successFlag && restartCount >= 3 && updated) {
            notifyRenterJobWebhook(updated, 'job.failed', {
                completed_at: now,
                last_error: lastError,
                billing: {
                    actual_cost_halala: actualCostHalala,
                    provider_earned_halala: providerEarned,
                    dc1_fee_halala: dc1Fee,
                },
            }).catch(() => {});
        }

        res.json({
            success: true,
            job_id: cleanJobId,
            status: newStatus,
            actual_minutes: actualMinutes,
            gpu_seconds_used: actualGpuSeconds,
            rate_per_gpu_second_halala: ratePerGpuSecond,
            cost_halala: actualCostHalala,
            provider_earned_halala: providerEarned,
            dc1_fee_halala: dc1Fee,
            restart_count: restartCount,
            last_error: lastError
        });
    } catch (error) {
        console.error('Job result error:', error);
        res.status(500).json({ error: 'Job result submission failed' });
    }
});

// ============================================================================
// POST /api/providers/:id/jobs/:jobId/complete — DCP-911
// RESTful job completion. Provider reports inference done.
// Body: { tokenCount, durationMs, modelId }
// Creates billing_record (15% platform / 85% provider), sets lifecycle_status='billed'.
// ============================================================================
router.post('/:id/jobs/:jobId/complete', async (req, res) => {
    try {
        const providerId = toFiniteInt(req.params.id, { min: 1 });
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });

        const apiKey = getBearerToken(req) || normalizeString(req.body?.api_key, { maxLen: 128, trim: false });
        if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

        const provider = db.get(
            'SELECT id, cost_per_gpu_second_halala, evm_wallet_address FROM providers WHERE api_key = ? AND id = ?',
            apiKey, providerId
        );
        if (!provider) return res.status(401).json({ error: 'Invalid API key or provider mismatch' });

        const cleanJobId = normalizeString(req.params.jobId, { maxLen: 80 });
        if (!cleanJobId) return res.status(400).json({ error: 'Invalid job id' });

        const job = db.get('SELECT * FROM jobs WHERE job_id = ? AND provider_id = ?', cleanJobId, provider.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        if (job.lifecycle_status === 'billed') {
            const record = db.get('SELECT * FROM billing_records WHERE job_id = ?', cleanJobId);
            return res.json({ success: true, already_billed: true, billing_record: record });
        }

        // ── DCP-927: EIP-712 attestation gate ────────────────────────────────
        const requireAttestation = process.env.REQUIRE_ATTESTATION === 'true';
        const attestationData    = req.body?.attestationData    || null;
        const attestationSig     = req.body?.signature || req.body?.attestationSignature || null;
        let   attestationValid   = false;

        if (attestationData && attestationSig && provider.evm_wallet_address) {
            try {
                const { verifyJobAttestation } = await import('../blockchain/attestation-verifier.mjs');
                const vResult = verifyJobAttestation(attestationData, attestationSig, provider.evm_wallet_address);
                attestationValid = vResult.valid;
                if (!vResult.valid && requireAttestation) {
                    return res.status(401).json({
                        error: 'Attestation signature invalid',
                        recovered: vResult.recoveredAddress,
                        expected: provider.evm_wallet_address,
                    });
                }
            } catch (importErr) {
                console.warn('[providers/:id/jobs/:jobId/complete] attestation import failed:', importErr.message);
                if (requireAttestation) {
                    return res.status(500).json({ error: 'Attestation verification unavailable' });
                }
            }
        } else if (requireAttestation && (!attestationData || !attestationSig)) {
            return res.status(400).json({ error: 'attestationData and signature required when REQUIRE_ATTESTATION=true' });
        }
        // ─────────────────────────────────────────────────────────────────────

        const tokenCount = toFiniteInt(req.body?.tokenCount, { min: 0 }) ?? 0;
        const durationMs = toFiniteInt(req.body?.durationMs, { min: 0 }) ?? 0;
        const modelId = normalizeString(req.body?.modelId, { maxLen: 200 }) || job.model || null;

        const PLATFORM_FEE_RATE = 0.15;
        let grossCostHalala = 0;

        if (job.actual_cost_halala != null && job.actual_cost_halala > 0) {
            grossCostHalala = job.actual_cost_halala;
        } else if (tokenCount > 0) {
            const rateRow = db.get('SELECT token_rate_halala FROM cost_rates WHERE model = ?', modelId || '');
            grossCostHalala = tokenCount * (rateRow?.token_rate_halala ?? 1);
        } else if (durationMs > 0) {
            const elapsedSec = durationMs / 1000;
            const fallbackRate = (COST_RATES[job.job_type] || COST_RATES['default']) / 60;
            const providerRate = toFiniteNumber(provider.cost_per_gpu_second_halala, { min: 0 });
            grossCostHalala = Math.max(0, Math.round(elapsedSec * (providerRate ?? fallbackRate)));
        }

        const platformFeeHalala = Math.round(grossCostHalala * PLATFORM_FEE_RATE);
        const providerEarningHalala = grossCostHalala - platformFeeHalala;
        const now = new Date().toISOString();
        const recordId = require('crypto').randomUUID
            ? require('crypto').randomUUID()
            : require('crypto').randomBytes(16).toString('hex');

        const settle = db.transaction(() => {
            db.prepare(`
                INSERT INTO billing_records
                  (id, job_id, renter_id, provider_id, model_id, token_count, duration_ms,
                   gross_cost_halala, platform_fee_halala, provider_earning_halala,
                   currency, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAR', 'pending_release', ?)
            `).run(
                recordId, cleanJobId, job.renter_id || null, provider.id,
                modelId, tokenCount, durationMs,
                grossCostHalala, platformFeeHalala, providerEarningHalala, now
            );
            // DCP-927: record attestation state on the job row
            const newAttestStatus = attestationValid ? 'signed' : 'pending';
            db.prepare(
                `UPDATE jobs SET lifecycle_status = 'billed', attestation_status = ?, updated_at = ? WHERE job_id = ?`
            ).run(newAttestStatus, now, cleanJobId);
            // Store signature on the active serve session if present
            if (attestationSig) {
                db.prepare(
                    `UPDATE serve_sessions SET attestation_signature = ? WHERE job_id = ? AND provider_id = ?`
                ).run(attestationSig, cleanJobId, provider.id);
            }
            if (!(job.actual_cost_halala > 0)) {
                db.prepare(
                    `UPDATE providers SET claimable_earnings_halala = claimable_earnings_halala + ? WHERE id = ?`
                ).run(providerEarningHalala, provider.id);
            }
        });
        settle();

        return res.json({
            success: true,
            job_id: cleanJobId,
            billing_record_id: recordId,
            gross_cost_halala: grossCostHalala,
            platform_fee_halala: platformFeeHalala,
            provider_earning_halala: providerEarningHalala,
            platform_fee_rate: PLATFORM_FEE_RATE,
            lifecycle_status: 'billed',
            attestation_status: attestationValid ? 'signed' : 'pending',
        });
    } catch (error) {
        console.error('[providers/:id/jobs/:jobId/complete]', error);
        return res.status(500).json({ error: 'Job completion failed' });
    }
});

// ============================================================================
// Daemon download + manifest helpers
// ============================================================================

// Resolve the on-disk daemon path. Daemon filename compat (Option A): the
// canonical filename is dcp_daemon.py. The candidate list retains the legacy
// dc1_daemon.py / dc1-daemon.py names so that an older backend deploy
// (pre-rename) or a mixed working tree still resolves.
function _resolveDaemonPath() {
    const daemonCandidates = [
        path.join(__dirname, '../../installers/dcp_daemon.py'),
        path.join(__dirname, '../../installers/dc1_daemon.py'),
        path.join(__dirname, '../../installers/dc1-daemon.py'),
    ];
    return daemonCandidates.find(candidate => fs.existsSync(candidate)) || null;
}

// Build the exact bytes the /download/daemon route would send for `cleanKey`.
// Both /download/daemon and /download/daemon/manifest go through this so the
// sha256 in the manifest matches the bytes a client subsequently downloads.
function _buildInjectedDaemonScript(cleanKey) {
    const daemonPath = _resolveDaemonPath();
    if (!daemonPath) return null;
    const script = fs.readFileSync(daemonPath, 'utf-8');
    const versionMatch = script.match(/DAEMON_VERSION\s*=\s*"([^"]+)"/);
    const currentVersion = versionMatch ? versionMatch[1] : 'unknown';
    const apiUrl = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa';
    const hmacSecret = process.env.DC1_HMAC_SECRET || '';
    const injected = script
        .replace('API_KEY = "{{API_KEY}}"', `API_KEY = "${cleanKey}"`)
        .replace('API_URL = "{{API_URL}}"', `API_URL = "${apiUrl}"`)
        .replace('HMAC_SECRET = "{{HMAC_SECRET}}"', `HMAC_SECRET = "${hmacSecret}"`)
        .replace('API_KEY = "INJECT_KEY_HERE"', `API_KEY = "${cleanKey}"`)
        .replace('API_URL = "INJECT_URL_HERE"', `API_URL = "${apiUrl}"`);
    return { daemonPath, injected, currentVersion };
}

// ============================================================================
// GET /api/providers/download/daemon - Serve dcp_daemon.py with injected key
// ============================================================================
router.get('/download/daemon', (req, res) => {
    try {
        const { key, check_only } = req.query;
        const cleanKey = normalizeSingleQueryParam(key, { maxLen: 128 });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const built = _buildInjectedDaemonScript(cleanKey);
        if (!built) return res.status(404).json({ error: 'Daemon file not found' });
        const { daemonPath, injected, currentVersion } = built;

        // check_only mode: return version info without downloading the file
        if (check_only === 'true') {
            recordActivationEvent(provider.id, 'daemon_download_check', { route: 'download/daemon' });
            return res.json({
                version: currentVersion,
                min_version: MIN_DAEMON_VERSION,
                download_url: `/api/providers/download/daemon?key=${cleanKey}`,
            });
        }

        const downloadName = path.basename(daemonPath);
        recordActivationEvent(provider.id, 'daemon_downloaded', {
            route: 'download/daemon',
            filename: downloadName,
            daemon_version: currentVersion,
        });
        res.setHeader('Content-Type', 'text/x-python');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.send(injected);
    } catch (error) {
        console.error('Daemon download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/download/daemon/manifest - sha256 + size + version
// ----------------------------------------------------------------------------
// Audit G19 (Tier 4.17): the Tauri update_daemon path downloads bytes from
// /download/daemon and writes them into ~/.dcp atomically without verifying
// what it received. A path-injection or in-flight tamper would be silently
// installed. The manifest endpoint returns the sha256 of the EXACT bytes the
// /download/daemon route would serve for the same `key` (post-injection of
// API_KEY / API_URL / HMAC_SECRET). The Tauri side fetches manifest first,
// downloads the daemon, hashes the bytes locally, and aborts the install on
// mismatch.
// ============================================================================
router.get('/download/daemon/manifest', (req, res) => {
    try {
        const { key } = req.query;
        const cleanKey = normalizeSingleQueryParam(key, { maxLen: 128 });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const built = _buildInjectedDaemonScript(cleanKey);
        if (!built) return res.status(404).json({ error: 'Daemon file not found' });

        const buf = Buffer.from(built.injected, 'utf-8');
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        return res.json({
            version: built.currentVersion,
            size: buf.length,
            sha256,
        });
    } catch (error) {
        console.error('Daemon manifest error:', error);
        res.status(500).json({ error: 'Manifest failed' });
    }
});

// ============================================================================
// GET /api/providers/download/menubar - Serve macOS menu bar app
// ============================================================================
router.get('/download/menubar', (req, res) => {
    try {
        // check_only: return version info without downloading
        if (req.query.check_only === 'true') {
            return res.json({ version: '2.0.0', platform: 'macos' });
        }
        const menubarPath = path.join(__dirname, '../../installers/dcp_menubar.py');
        if (!fs.existsSync(menubarPath)) {
            return res.status(404).json({ error: 'Menu bar app not found' });
        }
        res.setHeader('Content-Type', 'text/x-python');
        res.setHeader('Content-Disposition', 'attachment; filename="dcp_menubar.py"');
        res.sendFile(menubarPath);
    } catch (error) {
        console.error('Menubar download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/download/tray-windows - Serve Windows system tray app
// ============================================================================
router.get('/download/tray-windows', (req, res) => {
    try {
        if (req.query.check_only === 'true') {
            return res.json({ version: '2.0.0', platform: 'windows' });
        }
        const trayPath = path.join(__dirname, '../../installers/dcp_tray_windows.py');
        if (!fs.existsSync(trayPath)) {
            return res.status(404).json({ error: 'Windows tray app not found' });
        }
        res.setHeader('Content-Type', 'text/x-python');
        res.setHeader('Content-Disposition', 'attachment; filename="dcp_tray_windows.py"');
        res.sendFile(trayPath);
    } catch (error) {
        console.error('Windows tray download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/download/tray-linux - Serve Linux desktop tray app
// ============================================================================
router.get('/download/tray-linux', (req, res) => {
    try {
        if (req.query.check_only === 'true') {
            return res.json({ version: '2.0.0', platform: 'linux' });
        }
        const trayPath = path.join(__dirname, '../../installers/dcp_tray_linux.py');
        if (!fs.existsSync(trayPath)) {
            return res.status(404).json({ error: 'Linux tray app not found' });
        }
        res.setHeader('Content-Type', 'text/x-python');
        res.setHeader('Content-Disposition', 'attachment; filename="dcp_tray_linux.py"');
        res.sendFile(trayPath);
    } catch (error) {
        console.error('Linux tray download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/download/tray-mac - Serve macOS menu bar app
// ============================================================================
router.get('/download/tray-mac', (req, res) => {
    try {
        if (req.query.check_only === 'true') {
            return res.json({ version: '2.0.0', platform: 'macos' });
        }
        const menubarPath = path.join(__dirname, '../../installers/dcp_menubar.py');
        if (!fs.existsSync(menubarPath)) {
            return res.status(404).json({ error: 'Menu bar app not found' });
        }
        res.setHeader('Content-Type', 'text/x-python');
        res.setHeader('Content-Disposition', 'attachment; filename="dcp_menubar.py"');
        res.sendFile(menubarPath);
    } catch (error) {
        console.error('Mac tray download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/download/setup - OS-specific setup script with injected key
// ============================================================================
router.get('/download/setup', (req, res) => {
    try {
        const { key, os: osType } = req.query;
        const cleanKey = normalizeSingleQueryParam(key, { maxLen: 128 });
        if (!cleanKey) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', cleanKey);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const isWindows = (osType || '').toLowerCase() === 'windows';
        const templateFile = isWindows ? 'dc1-setup-windows.ps1' : 'dc1-setup-unix.sh';
        const templatePath = path.join(__dirname, '../../installers', templateFile);

        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ error: `Setup script ${templateFile} not found` });
        }

        const apiUrl = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa';
        let script = fs.readFileSync(templatePath, 'utf-8');
        script = script.replace(/INJECT_KEY_HERE/g, cleanKey);
        script = script.replace(/INJECT_URL_HERE/g, apiUrl);

        const contentType = isWindows ? 'text/plain' : 'text/x-shellscript';
        const filename = isWindows ? 'dc1-setup.ps1' : 'dc1-setup.sh';

        recordActivationEvent(provider.id, 'setup_script_downloaded', {
            route: 'download/setup',
            os: isWindows ? 'windows' : 'unix',
            filename,
        });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(script);
    } catch (error) {
        console.error('Setup download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// ============================================================================
// GET /api/providers/earnings — Provider checks earnings balance
// ============================================================================
router.get('/earnings', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get(
            'SELECT id, name, total_earnings, total_jobs, claimable_earnings_halala FROM providers WHERE api_key = ?',
            api_key
        );
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        // Legacy pending withdrawals table (SAR)
        const pending = db.get(
            `SELECT COALESCE(SUM(amount_sar), 0) as pending_sar FROM withdrawals WHERE provider_id = ? AND status = 'pending'`,
            provider.id
        ) || { pending_sar: 0 };

        // Legacy completed withdrawals table (SAR)
        const completed = db.get(
            `SELECT COALESCE(SUM(amount_sar), 0) as withdrawn_sar FROM withdrawals WHERE provider_id = ? AND status = 'completed'`,
            provider.id
        ) || { withdrawn_sar: 0 };

        // New withdrawal state machine table (halala)
        const requestSummary = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount_halala ELSE 0 END), 0) AS pending_halala,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_halala ELSE 0 END), 0) AS paid_halala
             FROM withdrawal_requests
             WHERE provider_id = ?`,
            provider.id
        ) || { pending_halala: 0, paid_halala: 0 };

        // Prefer escrow-based halala tracking (DCP-32); fall back to total_earnings SAR for pre-escrow providers
        const claimableHalala = Number(provider.claimable_earnings_halala || 0);
        const usesClaimableLedger = provider.claimable_earnings_halala != null;
        const totalEarnedHalala = usesClaimableLedger
            ? claimableHalala
            : Math.round((provider.total_earnings || 0) * 100);
        const pendingHalala = Math.round((pending.pending_sar || 0) * 100);
        const withdrawnHalala = Math.round((completed.withdrawn_sar || 0) * 100);
        const legacyAvailableHalala = Math.max(0, totalEarnedHalala - pendingHalala - withdrawnHalala);
        const availableHalala = usesClaimableLedger ? claimableHalala : legacyAvailableHalala;
        const pendingWithdrawalHalala = usesClaimableLedger
            ? (requestSummary.pending_halala || 0)
            : pendingHalala;
        const withdrawnTotalHalala = usesClaimableLedger
            ? (requestSummary.paid_halala || 0)
            : withdrawnHalala;

        // Escrow breakdown: active holds and recent releases
        const escrowSummary = db.get(
            `SELECT
               COUNT(CASE WHEN status = 'held' THEN 1 END) as held_count,
               COALESCE(SUM(CASE WHEN status = 'held' THEN amount_halala END), 0) as held_halala,
               COUNT(CASE WHEN status = 'locked' THEN 1 END) as locked_count,
               COALESCE(SUM(CASE WHEN status = 'locked' THEN amount_halala END), 0) as locked_halala
             FROM escrow_holds WHERE provider_id = ?`,
            provider.id
        ) || {};

        res.json({
            provider_id: provider.id,
            name: provider.name,
            total_earned_sar: provider.total_earnings,
            total_earned_halala: totalEarnedHalala,
            claimable_earnings_halala: claimableHalala,
            pending_withdrawal_sar: Number((pendingWithdrawalHalala / 100).toFixed(2)),
            withdrawn_sar: Number((withdrawnTotalHalala / 100).toFixed(2)),
            available_sar: Number((availableHalala / 100).toFixed(2)),
            available_halala: availableHalala,
            total_jobs: provider.total_jobs,
            escrow: {
                held_jobs: escrowSummary.held_count || 0,
                held_halala: escrowSummary.held_halala || 0,
                locked_jobs: escrowSummary.locked_count || 0,
                locked_halala: escrowSummary.locked_halala || 0,
            }
        });
    } catch (error) {
        console.error('Earnings check error:', error);
        res.status(500).json({ error: 'Earnings check failed' });
    }
});

// ============================================================================
// POST /api/providers/me/withdraw — Create withdrawal request (pending)
// ============================================================================
router.post('/me/withdraw', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get(
            'SELECT id, claimable_earnings_halala FROM providers WHERE api_key = ?',
            api_key
        );
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const amount_halala = toFiniteInt(req.body?.amount_halala, { min: 1000 });
        if (amount_halala == null) {
            return res.status(400).json({ error: 'amount_halala must be an integer and at least 1000' });
        }

        const iban = normalizeString(req.body?.iban, { maxLen: 24 })?.toUpperCase() || '';
        if (!SAUDI_IBAN_REGEX.test(iban)) {
            return res.status(400).json({ error: 'Invalid IBAN format. Expected SA followed by 22 digits' });
        }

        const claimable = toFiniteInt(provider.claimable_earnings_halala, { min: 0 }) || 0;
        const pending = db.get(
            `SELECT COALESCE(SUM(amount_halala), 0) AS pending_halala
             FROM withdrawal_requests
             WHERE provider_id = ?
               AND status IN ('pending', 'processing')`,
            provider.id
        ) || { pending_halala: 0 };
        const pending_halala = toFiniteInt(pending.pending_halala, { min: 0 }) || 0;
        const available_halala = Math.max(0, claimable - pending_halala);
        const existingPending = db.get(
            `SELECT id, status, amount_halala, created_at
             FROM withdrawal_requests
             WHERE provider_id = ?
               AND status IN ('pending', 'processing')
             ORDER BY created_at DESC
             LIMIT 1`,
            provider.id
        );
        if (existingPending) {
            return res.status(409).json({
                error: 'Provider already has a pending withdrawal request',
                existing_withdrawal_request: existingPending,
            });
        }

        if (amount_halala > available_halala) {
            return res.status(400).json({
                error: 'Requested amount exceeds claimable earnings',
                claimable_earnings_halala: claimable,
                pending_withdrawals_halala: pending_halala,
                available_to_withdraw_halala: available_halala,
            });
        }

        const now = new Date().toISOString();
        const requestId = `wreq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        db.prepare(
            `INSERT INTO withdrawal_requests
             (id, provider_id, amount_halala, is_amount_reserved, status, iban, created_at, updated_at)
             VALUES (?, ?, ?, 0, 'pending', ?, ?, ?)`
        ).run(requestId, provider.id, amount_halala, iban, now, now);

        const withdrawal_request = db.get(
            `SELECT id, provider_id, amount_halala, status, iban, admin_note, created_at, processed_at, updated_at
             FROM withdrawal_requests
             WHERE id = ?`,
            requestId
        );

        return res.status(201).json({
            withdrawal_id: requestId,
            status: 'pending',
            message: 'Withdrawal queued for review. Expect 1-3 business days.',
            withdrawal_request,
        });
    } catch (error) {
        console.error('Create provider withdrawal request error:', error);
        return res.status(500).json({ error: 'Failed to create withdrawal request' });
    }
});

// ============================================================================
// GET /api/providers/me/withdrawals — List provider withdrawal requests
// ============================================================================
router.get('/me/withdrawals', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const withdrawals = db.all(
            `SELECT id, provider_id, amount_halala, status, iban, admin_note, created_at, processed_at, updated_at
             FROM withdrawal_requests
             WHERE provider_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            provider.id
        );

        return res.json({ withdrawals });
    } catch (error) {
        console.error('List provider withdrawal requests error:', error);
        return res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
});

// ============================================================================
// POST /api/providers/withdraw — Provider requests earnings withdrawal
// ============================================================================
router.post('/withdraw', (req, res) => {
    try {
        const { api_key, amount_sar, payout_method, payout_details } = req.body;
        const cleanApiKey = normalizeString(api_key, { maxLen: 128, trim: false });
        if (!cleanApiKey) return res.status(400).json({ error: 'api_key required' });

        const provider = db.get(
            'SELECT id, name, total_earnings, claimable_earnings_halala FROM providers WHERE api_key = ?',
            cleanApiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const amountSar = toFiniteNumber(amount_sar, { min: 0.01, max: 1000000 });
        if (amountSar == null) {
            return res.status(400).json({ error: 'amount_sar must be > 0' });
        }

        // Minimum withdrawal: 10 SAR
        if (amountSar < 10) {
            return res.status(400).json({ error: 'Minimum withdrawal is 10 SAR' });
        }

        // Compute available balance using escrow-based halala tracking (DCP-32)
        const pending = db.get(
            `SELECT COALESCE(SUM(amount_sar), 0) as pending_sar FROM withdrawals WHERE provider_id = ? AND status = 'pending'`,
            provider.id
        ) || { pending_sar: 0 };

        const completed = db.get(
            `SELECT COALESCE(SUM(amount_sar), 0) as withdrawn_sar FROM withdrawals WHERE provider_id = ? AND status = 'completed'`,
            provider.id
        ) || { withdrawn_sar: 0 };

        // Prefer escrow-based halala balance; fall back to total_earnings SAR for legacy providers
        const claimableHalala = provider.claimable_earnings_halala || 0;
        const totalEarnedHalala = claimableHalala > 0
            ? claimableHalala
            : Math.round((provider.total_earnings || 0) * 100);
        const pendingHalala = Math.round((pending.pending_sar || 0) * 100);
        const withdrawnHalala = Math.round((completed.withdrawn_sar || 0) * 100);
        const availableHalala = Math.max(0, totalEarnedHalala - pendingHalala - withdrawnHalala);
        const availableSar = availableHalala / 100;

        if (amountSar > availableSar) {
            return res.status(402).json({
                error: 'Insufficient available earnings',
                available_sar: availableSar.toFixed(2),
                available_halala: availableHalala,
                requested_sar: amountSar
            });
        }

        const now = new Date().toISOString();
        const withdrawal_id = 'wd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

        runStatement(
            `INSERT INTO withdrawals (withdrawal_id, provider_id, amount_sar, payout_method, payout_details, status, requested_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            withdrawal_id, provider.id, amountSar,
            normalizeString(payout_method, { maxLen: 50 }) || 'bank_transfer',
            payout_details && (typeof payout_details === 'string' || isPlainObject(payout_details))
                ? JSON.stringify(payout_details)
                : null,
            now
        );

        res.status(201).json({
            success: true,
            withdrawal_id,
            amount_sar: amountSar,
            status: 'pending',
            message: 'Withdrawal request submitted. Processing takes 1-3 business days.'
        });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal request failed' });
    }
});

// ============================================================================
// GET /api/providers/job-history — Provider's completed job history with earnings
// ============================================================================
router.get('/job-history', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id, name FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const jobs = db.all(
            `SELECT j.id, j.job_id, j.job_type, j.status, j.submitted_at, j.started_at,
                    j.completed_at, j.progress_phase, j.error,
                    j.actual_cost_halala, j.cost_halala,
                    j.provider_earned_halala, j.dc1_fee_halala,
                    j.actual_duration_minutes, j.duration_minutes,
                    r.name as renter_name
             FROM jobs j
             LEFT JOIN renters r ON j.renter_id = r.id
             WHERE j.provider_id = ? AND j.status IN ('completed', 'failed', 'cancelled')
             ORDER BY j.completed_at DESC
             LIMIT ? OFFSET ?`,
            provider.id, limit, offset
        );

        const totals = db.get(
            `SELECT COUNT(*) as total_jobs,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_jobs,
                    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed_jobs,
                    COALESCE(SUM(CASE WHEN status='completed' THEN provider_earned_halala ELSE 0 END), 0) as total_earned_halala
             FROM jobs WHERE provider_id = ?`,
            provider.id
        );

        res.json({
            provider_id: provider.id,
            ...totals,
            total_earned_sar: ((totals.total_earned_halala || 0) / 100).toFixed(2),
            success_rate: totals.total_jobs > 0
                ? Math.round((totals.completed_jobs / totals.total_jobs) * 100)
                : 0,
            jobs: jobs.map(j => ({
                ...j,
                earned_sar: j.provider_earned_halala ? (j.provider_earned_halala / 100).toFixed(2) : '0.00',
                cost_sar: j.actual_cost_halala ? (j.actual_cost_halala / 100).toFixed(2) : '0.00'
            }))
        });
    } catch (error) {
        console.error('Provider job history error:', error);
        res.status(500).json({ error: 'Failed to fetch job history' });
    }
});

// ============================================================================
// GET /api/providers/earnings-daily — Daily earnings breakdown for charts
// ============================================================================
router.get('/earnings-daily', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const daily = db.all(
            `SELECT DATE(completed_at) as day,
                    COUNT(*) as jobs,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
                    COALESCE(SUM(CASE WHEN status='completed' THEN provider_earned_halala ELSE 0 END), 0) as earned_halala,
                    COALESCE(SUM(CASE WHEN status='completed' THEN actual_duration_minutes ELSE 0 END), 0) as total_minutes
             FROM jobs
             WHERE provider_id = ? AND completed_at >= ?
             GROUP BY DATE(completed_at)
             ORDER BY day DESC`,
            provider.id, sinceDate
        );

        res.json({
            provider_id: provider.id,
            days_requested: days,
            daily: daily.map(d => ({
                ...d,
                earned_sar: (d.earned_halala / 100).toFixed(2)
            }))
        });
    } catch (error) {
        console.error('Earnings daily error:', error);
        res.status(500).json({ error: 'Failed to fetch daily earnings' });
    }
});

// ============================================================================
// GET /api/providers/me/earnings/history — Earnings trend (7d / 30d / 90d)
// ============================================================================
router.get('/me/earnings/history', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const periodMap = { '7d': 7, '30d': 30, '90d': 90 };
        const days = periodMap[req.query.period] || 30;
        const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const rows = db.all(
            `SELECT DATE(completed_at) as date,
                    COALESCE(SUM(CASE WHEN status='completed' THEN provider_earned_halala ELSE 0 END), 0) as earnings_halala,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as jobs_completed
             FROM jobs
             WHERE provider_id = ? AND completed_at >= ?
             GROUP BY DATE(completed_at)
             ORDER BY date ASC`,
            provider.id, sinceDate
        );

        res.json(rows);
    } catch (error) {
        console.error('Earnings history error:', error);
        res.status(500).json({ error: 'Failed to fetch earnings history' });
    }
});

// ============================================================================
// POST /api/providers/upload-logs — Provider sends startup/gpu/daemon logs
// ============================================================================
router.post('/upload-logs', (req, res) => {
    try {
        const apiKey = normalizeString(req.body?.api_key || req.headers['x-api-key'] || req.headers['x-provider-key'], { maxLen: 128 });
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const provider = db.get('SELECT id, name FROM providers WHERE api_key = ?', apiKey);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const logs = req.body?.logs;
        if (!logs || typeof logs !== 'object') return res.status(400).json({ error: 'logs object required' });

        const logDir = path.join(__dirname, '..', 'data', 'provider-logs', String(provider.id));
        fs.mkdirSync(logDir, { recursive: true });

        let saved = 0;
        for (const [filename, content] of Object.entries(logs)) {
            const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
            fs.writeFileSync(path.join(logDir, `${new Date().toISOString().slice(0,10)}_${safeName}`), String(content).slice(0, 200000));
            saved++;
        }

        console.log(`[provider-logs] ${provider.name} (${provider.id}) uploaded ${saved} log files`);
        res.json({ success: true, files: saved });
    } catch (error) {
        console.error('[provider-logs] Upload failed:', error?.message);
        res.status(500).json({ error: 'Log upload failed' });
    }
});

// ============================================================================
// GET /api/providers/daemon-logs — Recent daemon events/logs
// ============================================================================
router.get('/daemon-logs', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const severity = req.query.severity; // optional filter: error, warning, info

        let query = `SELECT id, event_type, severity, daemon_version, job_id,
                            hostname, os_info, python_version, details, event_timestamp
                     FROM daemon_events
                     WHERE provider_id = ?`;
        const params = [provider.id];

        if (severity) {
            query += ` AND severity = ?`;
            params.push(severity);
        }

        query += ` ORDER BY event_timestamp DESC LIMIT ?`;
        params.push(limit);

        const events = db.all(query, ...params);

        // Get LIVE daemon info from provider heartbeat (most accurate source)
        const providerRecord = db.get(
            `SELECT gpu_status, last_heartbeat, provider_hostname, status, daemon_version
             FROM providers WHERE id = ?`,
            provider.id
        );

        let daemon_info = null;
        if (providerRecord) {
            const gpu = providerRecord.gpu_status ? JSON.parse(providerRecord.gpu_status) : {};
            daemon_info = {
                version: gpu.daemon_version || providerRecord.daemon_version || null,
                hostname: providerRecord.provider_hostname || gpu.hostname || null,
                os: gpu.os_info || null,
                python: gpu.python_version || null,
                gpu_name: gpu.gpu_name || null,
                gpu_vram_mib: gpu.gpu_vram_mib || null,
                free_vram_mib: gpu.free_vram_mib || null,
                gpu_temp_c: gpu.temp_c || null,
                gpu_util_pct: gpu.gpu_util_pct != null ? gpu.gpu_util_pct : null,
                driver_version: gpu.driver_version || null,
                provider_status: providerRecord.status,
                last_heartbeat: providerRecord.last_heartbeat
            };
        }

        res.json({
            provider_id: provider.id,
            daemon_info,
            events
        });
    } catch (error) {
        console.error('Daemon logs error:', error);
        res.status(500).json({ error: 'Failed to fetch daemon logs' });
    }
});

// ============================================================================
// GET /api/providers/withdrawal-history — Withdrawal requests
// ============================================================================
router.get('/withdrawal-history', (req, res) => {
    try {
        const api_key = req.query.key || req.headers['x-provider-key'];
        if (!api_key) return res.status(400).json({ error: 'API key required' });

        const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
        if (!provider) return res.status(401).json({ error: 'Invalid API key' });

        const withdrawals = db.all(
            `SELECT withdrawal_id, amount_sar, payout_method, status, requested_at, processed_at
             FROM withdrawals WHERE provider_id = ?
             ORDER BY requested_at DESC LIMIT 50`,
            provider.id
        );

        res.json({ provider_id: provider.id, withdrawals });
    } catch (error) {
        console.error('Withdrawal history error:', error);
        res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
});

const MODEL_TIERS = {
    tier8: [
        { model_id: 'llama-3-8b', display_name: 'Llama 3 8B' },
        { model_id: 'mistral-7b', display_name: 'Mistral 7B' },
        { model_id: 'phi-3-mini', display_name: 'Phi-3 Mini' },
    ],
    tier24: [
        { model_id: 'llama-3-70b-q4', display_name: 'Llama 3 70B Q4' },
        { model_id: 'codellama-34b', display_name: 'CodeLlama 34B' },
        { model_id: 'mixtral-8x7b', display_name: 'Mixtral 8x7B' },
    ],
    tier40: [
        { model_id: 'llama-3-70b', display_name: 'Llama 3 70B' },
        { model_id: 'falcon-40b', display_name: 'Falcon 40B' },
        { model_id: 'yi-34b', display_name: 'Yi 34B' },
    ],
};

const MODEL_DISPLAY_OVERRIDES = {
    'llama-3-8b': 'Llama 3 8B',
    'mistral-7b': 'Mistral 7B',
    'phi-3-mini': 'Phi-3 Mini',
    'llama-3-70b-q4': 'Llama 3 70B Q4',
    'codellama-34b': 'CodeLlama 34B',
    'mixtral-8x7b': 'Mixtral 8x7B',
    'llama-3-70b': 'Llama 3 70B',
    'falcon-40b': 'Falcon 40B',
    'yi-34b': 'Yi 34B',
    'meta-llama/meta-llama-3-8b-instruct': 'Llama 3 8B Instruct',
    'mistralai/mistral-7b-instruct-v0.2': 'Mistral 7B Instruct',
    'microsoft/phi-3-mini-4k-instruct': 'Phi-3 Mini Instruct',
};

const MODEL_ALIASES = {
    'meta-llama/meta-llama-3-8b-instruct': 'llama-3-8b',
    'meta-llama/llama-3-8b-instruct': 'llama-3-8b',
    'mistralai/mistral-7b-instruct-v0.2': 'mistral-7b',
    'microsoft/phi-3-mini-4k-instruct': 'phi-3-mini',
};

function safeJsonParse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function toDisplayName(modelId) {
    const known = MODEL_DISPLAY_OVERRIDES[String(modelId).toLowerCase()];
    if (known) return known;
    return String(modelId)
        .split('/')
        .pop()
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeModelId(modelId) {
    const cleaned = String(modelId || '').trim();
    if (!cleaned) return null;
    const lower = cleaned.toLowerCase();
    return MODEL_ALIASES[lower] || lower;
}

function inferVramGb(provider) {
    if (Number.isFinite(provider.gpu_vram_mib) && provider.gpu_vram_mib > 0) {
        return provider.gpu_vram_mib / 1024;
    }
    if (Number.isFinite(provider.vram_gb) && provider.vram_gb > 0) {
        return provider.vram_gb;
    }
    const resourceSpec = safeJsonParse(provider.resource_spec);
    const gpuResources = Array.isArray(resourceSpec?.resources)
        ? resourceSpec.resources.filter(r => String(r?.type || '').toLowerCase() === 'gpu')
        : [];
    if (gpuResources.length === 0) return 0;

    let maxVramGb = 0;
    gpuResources.forEach((gpuResource) => {
        const candidates = [
            gpuResource?.vram_gb,
            gpuResource?.memory_gb,
            gpuResource?.total_memory_gb,
            gpuResource?.total_gb,
            gpuResource?.total,
        ];
        const firstGb = candidates.find(v => Number.isFinite(Number(v)) && Number(v) > 0);
        if (firstGb != null) {
            maxVramGb = Math.max(maxVramGb, Number(firstGb));
            return;
        }
        if (Number.isFinite(Number(gpuResource?.memory_mib)) && Number(gpuResource.memory_mib) > 0) {
            maxVramGb = Math.max(maxVramGb, Number(gpuResource.memory_mib) / 1024);
        }
    });
    return maxVramGb;
}

function getFallbackModelsForVram(vramGb) {
    if (vramGb >= 40) return MODEL_TIERS.tier40;
    if (vramGb >= 24) return MODEL_TIERS.tier24;
    if (vramGb >= 8) return MODEL_TIERS.tier8;
    return [];
}

function extractProviderModels(provider) {
    const parsed = safeJsonParse(provider.cached_models);
    let models = [];
    if (Array.isArray(parsed)) {
        models = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.models)) models = parsed.models;
        else if (Array.isArray(parsed.supported_models)) models = parsed.supported_models;
        else if (Array.isArray(parsed.vllm_models)) models = parsed.vllm_models;
    }

    const normalized = new Map();
    models.forEach(item => {
        const rawModelId = typeof item === 'string'
            ? item
            : item?.model_id || item?.model || item?.id || item?.name;
        const modelId = normalizeModelId(rawModelId);
        if (!modelId) return;
        const optionalFields = (item && typeof item === 'object' && !Array.isArray(item))
            ? {
                deprecation_date: item.deprecation_date,
                datacenters: item.datacenters,
                openrouter: item.openrouter,
            }
            : null;
        normalized.set(modelId, {
            model_id: modelId,
            display_name: (item && item.display_name) || toDisplayName(modelId),
            ...(optionalFields || {}),
        });
    });

    if (normalized.size > 0) return Array.from(normalized.values());
    return getFallbackModelsForVram(inferVramGb(provider));
}

// ============================================================================
// Graduated provider status thresholds (seconds since last heartbeat)
// Used by /models and /available to compute online | degraded | offline status.
// ============================================================================
const HEARTBEAT_ONLINE_THRESHOLD_S   = 120;   // < 2 min  → online   (green)
const HEARTBEAT_DEGRADED_THRESHOLD_S = 600;   // 2–10 min → degraded (yellow, still bookable)
                                               // > 10 min → offline  (excluded)

/**
 * Compute graduated availability status from the age of the last heartbeat.
 * @param {string|null} lastHeartbeat  ISO-8601 timestamp from providers.last_heartbeat
 * @param {number}      now            Current epoch ms (Date.now())
 * @returns {{ status: 'online'|'degraded'|'offline', heartbeat_age_seconds: number|null, degraded_since: string|null }}
 */
function computeProviderStatus(lastHeartbeat, now) {
    if (!lastHeartbeat) {
        return { status: 'offline', heartbeat_age_seconds: null, degraded_since: null };
    }
    const ageMs = now - new Date(lastHeartbeat).getTime();
    const ageSecs = Math.floor(ageMs / 1000);
    if (ageSecs < HEARTBEAT_ONLINE_THRESHOLD_S) {
        return { status: 'online', heartbeat_age_seconds: ageSecs, degraded_since: null };
    }
    if (ageSecs < HEARTBEAT_DEGRADED_THRESHOLD_S) {
        // degraded_since = moment the provider crossed the 2-minute threshold
        const degradedSince = new Date(new Date(lastHeartbeat).getTime() + HEARTBEAT_ONLINE_THRESHOLD_S * 1000).toISOString();
        return { status: 'degraded', heartbeat_age_seconds: ageSecs, degraded_since: degradedSince };
    }
    return { status: 'offline', heartbeat_age_seconds: ageSecs, degraded_since: null };
}

function toCatalogModelKey(modelId) {
    return String(modelId || '').trim().toLowerCase();
}

function parseUseCases(value) {
    if (Array.isArray(value)) return value.map((entry) => String(entry || '').toLowerCase().trim()).filter(Boolean);
    const parsed = safeJsonParse(value);
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry || '').toLowerCase().trim()).filter(Boolean);
    return [];
}

function toUsdStringFromHalalaPerMinute(halalaPerMinute) {
    const halala = Number(halalaPerMinute || 0);
    if (!Number.isFinite(halala) || halala <= 0) return '0.000000';
    const sarPerMinute = halala / 100;
    const usdPerMinute = sarPerMinute / 3.75;
    return usdPerMinute.toFixed(6);
}

function inferModalitiesFromUseCases(useCases) {
    const set = new Set(['text']);
    useCases.forEach((entry) => {
        if (entry.includes('image')) set.add('image');
        if (entry.includes('audio') || entry.includes('speech') || entry.includes('voice')) set.add('audio');
    });
    return Array.from(set);
}

function inferSupportedFeaturesFromUseCases(useCases) {
    const featureSet = new Set(['chat.completions']);
    useCases.forEach((entry) => {
        if (entry.includes('reason')) featureSet.add('reasoning');
        if (entry.includes('code')) featureSet.add('code_generation');
        if (entry.includes('tool')) featureSet.add('tool_calling');
        if (entry.includes('embed')) featureSet.add('embeddings');
        if (entry.includes('image')) featureSet.add('image_generation');
        if (entry.includes('arabic') || entry.includes('translation')) featureSet.add('multilingual');
    });
    return Array.from(featureSet);
}

const providerCatalogOptionalFieldsSchema = z.object({
    deprecation_date: z.string().trim().regex(
        /^(\d{4}-\d{2}-\d{2}|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z))$/,
        'deprecation_date must be ISO date or datetime'
    ).optional(),
    datacenters: z.array(
        z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/)
    ).max(16).optional(),
    openrouter: z.object({
        slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/),
    }).strict().optional(),
}).strict();

function normalizeOpenRouterSlug(value, fallbackModelId) {
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
    return String(fallbackModelId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9/._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/\/-+/g, '/')
        .replace(/^-+|-+$/g, '');
}

function extractOptionalCatalogFields(rawModelMetadata, canonicalModelId) {
    if (!rawModelMetadata || typeof rawModelMetadata !== 'object' || Array.isArray(rawModelMetadata)) {
        return {};
    }

    const candidate = {};
    if (rawModelMetadata.deprecation_date != null) candidate.deprecation_date = rawModelMetadata.deprecation_date;
    if (rawModelMetadata.datacenters != null) candidate.datacenters = rawModelMetadata.datacenters;
    if (rawModelMetadata.openrouter && typeof rawModelMetadata.openrouter === 'object') {
        candidate.openrouter = {
            slug: normalizeOpenRouterSlug(rawModelMetadata.openrouter.slug, canonicalModelId),
        };
    }

    if (Object.keys(candidate).length === 0) return {};
    const parsed = providerCatalogOptionalFieldsSchema.safeParse(candidate);
    if (!parsed.success) return {};
    return parsed.data;
}

function toModelCatalogContractItem({ model, providerCount, maxVramGb, sourceMetadata }) {
    const modelId = String(model.model_id || '').trim();
    const contractCore = toCatalogContractCore({
        model,
        providerCount,
        maxVramGb,
        created: model.created_at ? Math.floor(new Date(model.created_at).getTime() / 1000) : null,
        nameFallback: toDisplayName(modelId),
    });
    const optionalFields = extractOptionalCatalogFields(sourceMetadata, modelId);
    const payload = {
        ...contractCore,
        sampling_parameters: {
            temperature: { min: 0, max: 2, default: 0.7 },
            top_p: { min: 0, max: 1, default: 1 },
            top_k: { min: 1, max: 200, default: 50 },
        },
    };

    if (optionalFields.deprecation_date) payload.deprecation_date = optionalFields.deprecation_date;
    if (optionalFields.datacenters) payload.datacenters = optionalFields.datacenters;
    if (optionalFields.openrouter) payload.openrouter = optionalFields.openrouter;

    return payload;
}

// ============================================================================
// GET /api/providers/model-catalog — OpenRouter provider model contract feed
// ============================================================================
router.get('/model-catalog', (req, res) => {
    try {
        const activeModels = db.all(
            `SELECT model_id, display_name, quantization, context_window, default_price_halala_per_min, vram_gb, created_at, use_cases
             FROM model_registry
             WHERE is_active = 1`
        );

        const providers = db.all(
            `SELECT id, is_paused, gpu_vram_mib, vram_gb, cached_models, resource_spec, last_heartbeat
             FROM providers
             WHERE is_paused = 0 AND last_heartbeat IS NOT NULL`
        );

        const now = Date.now();
        const providerCoverage = new Map();

        providers.forEach((provider) => {
            const { status: providerStatus } = computeProviderStatus(provider.last_heartbeat, now);
            if (providerStatus === 'offline') return;

            const providerVramGb = inferVramGb(provider);
            const providerModels = extractProviderModels(provider);
            providerModels.forEach((item) => {
                const joinKey = toCatalogModelKey(item.model_id);
                if (!joinKey) return;
                const existing = providerCoverage.get(joinKey);
                if (!existing) {
                    providerCoverage.set(joinKey, {
                        providerIds: new Set([provider.id]),
                        maxVramGb: providerVramGb || 0,
                        sourceMetadata: (item && typeof item === 'object') ? item : null,
                    });
                    return;
                }
                existing.providerIds.add(provider.id);
                existing.maxVramGb = Math.max(existing.maxVramGb || 0, providerVramGb || 0);
                if (!existing.sourceMetadata && item && typeof item === 'object') {
                    existing.sourceMetadata = item;
                }
            });
        });

        const models = activeModels.map((model) => {
            const coverage = providerCoverage.get(toCatalogModelKey(model.model_id));
            return toModelCatalogContractItem({
                model,
                providerCount: coverage?.providerIds?.size || 0,
                maxVramGb: coverage?.maxVramGb || Number(model.vram_gb) || 0,
                sourceMetadata: coverage?.sourceMetadata || null,
            });
        }).sort((a, b) => a.id.localeCompare(b.id));

        return res.json({
            object: 'list',
            data: models,
            total: models.length,
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Provider model catalog error:', error);
        return res.status(500).json({ error: 'Failed to fetch provider model catalog' });
    }
});

// ============================================================================
// GET /api/providers/models — Public aggregate of available vLLM models
// ============================================================================
router.get('/models', (req, res) => {
    try {
        const providers = db.all(
            `SELECT id, status, is_paused, gpu_vram_mib, vram_gb, cached_models, resource_spec, last_heartbeat
             FROM providers
             WHERE is_paused = 0 AND last_heartbeat IS NOT NULL`
        );

        const llmRateHalalaPerMin = COST_RATES['llm-inference']
            || COST_RATES.llm_inference
            || COST_RATES.vllm_serve
            || COST_RATES.default
            || 10;

        const now = Date.now();
        const modelMap = new Map();

        providers.forEach(provider => {
            // Only include providers whose heartbeat is recent enough (online or degraded)
            const { status: providerStatus } = computeProviderStatus(provider.last_heartbeat, now);
            if (providerStatus === 'offline') return;

            const providerVramGb = inferVramGb(provider);
            const providerModels = extractProviderModels(provider);

            providerModels.forEach(model => {
                const existing = modelMap.get(model.model_id);
                if (!existing) {
                    modelMap.set(model.model_id, {
                        model_id: model.model_id,
                        display_name: model.display_name || toDisplayName(model.model_id),
                        provider_ids: new Set([provider.id]),
                        min_price_sar_per_hr: (llmRateHalalaPerMin * 60) / 100,
                        max_vram_available_gb: providerVramGb,
                        sample_provider_id: String(provider.id),
                    });
                    return;
                }

                existing.provider_ids.add(provider.id);
                existing.max_vram_available_gb = Math.max(existing.max_vram_available_gb || 0, providerVramGb || 0);
            });
        });

        const models = Array.from(modelMap.values())
            .map(m => ({
                model_id: m.model_id,
                display_name: m.display_name,
                providers_count: m.provider_ids.size,
                min_price_sar_per_hr: Number(m.min_price_sar_per_hr.toFixed(2)),
                max_vram_available_gb: Number((m.max_vram_available_gb || 0).toFixed(1)),
                sample_provider_id: m.sample_provider_id,
            }))
            .sort((a, b) => b.providers_count - a.providers_count || a.model_id.localeCompare(b.model_id));

        res.json({ models, total: models.length });
    } catch (error) {
        console.error('Provider models aggregation error:', error);
        res.status(500).json({ error: 'Failed to fetch provider models' });
    }
});

// ============================================================================
// POST /api/providers/me/rotate-key — Rotate API key (provider self-service)
// Backwards-compatible alias retained: /api/providers/rotate-key
// ============================================================================
router.post(['/me/rotate-key', '/rotate-key'], (req, res) => {
    try {
        const key = req.headers['x-provider-key'] || req.query.key;
        if (!key) return res.status(400).json({ error: 'Current API key required (x-provider-key header or key query)' });

        const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        if (isRotationRateLimited('provider', provider.id)) {
            return res.status(429).json({ error: 'Rate limit exceeded: max 3 key rotations per 24 hours' });
        }

        const newKey = `dcp-provider-${crypto.randomUUID()}`;
        const nowIso = new Date().toISOString();
        runStatement(
            'UPDATE providers SET api_key = ?, rotated_at = ?, updated_at = ? WHERE id = ?',
            newKey,
            nowIso,
            nowIso,
            provider.id
        );
        recordRotationEvent('provider', provider.id, nowIso);

        res.json({
            success: true,
            message: 'API key rotated. Save the new key — the old one is now invalid.',
            new_key: newKey,
            api_key: newKey,
            provider_id: provider.id
        });
    } catch (error) {
        console.error('Provider key rotation error:', error);
        res.status(500).json({ error: 'Key rotation failed' });
    }
});

// ============================================================================
// POST /api/providers/me/reactivation-token — issue short-lived reactivation token
// Auth: x-provider-key or Bearer token
// ============================================================================
router.post(['/me/reactivation-token', '/reactivation-token'], (req, res) => {
    try {
        const provider = getProviderFromLegacyKey(req);
        if (!provider) return res.status(401).json({ error: 'Provider API key required' });

        const ttlSeconds = toFiniteInt(req.body?.ttl_seconds, {
            min: PROVIDER_REACTIVATION_TOKEN_MIN_TTL_SECONDS,
            max: PROVIDER_REACTIVATION_TOKEN_MAX_TTL_SECONDS,
        }) || PROVIDER_REACTIVATION_TOKEN_TTL_SECONDS;

        const issued = issueProviderReactivationToken(provider, ttlSeconds);
        if (!issued.token) {
            return res.status(500).json({ error: issued.error || 'Failed to issue reactivation token' });
        }

        recordActivationEvent(provider.id, 'reactivation_token_issued', {
            route: 'reactivation-token',
            ttl_seconds: ttlSeconds,
        });

        return res.json({
            success: true,
            provider_id: provider.id,
            reactivation_token: issued.token,
            expires_at: issued.expiresAtIso,
        });
    } catch (error) {
        console.error('[providers/reactivation-token]', error);
        return res.status(500).json({ error: 'Failed to issue reactivation token' });
    }
});

// ============================================================================
// GET /api/providers/reactivation/bundle — exchange token for install bundle
// ============================================================================
router.get('/reactivation/bundle', (req, res) => {
    try {
        const token = normalizeSingleQueryParam(req.query.token, { maxLen: 4096 });
        if (!token) return res.status(400).json({ error: 'Reactivation token required' });

        const verified = verifyProviderReactivationToken(token);
        if (!verified.valid) {
            if (verified.reason === 'expired') {
                return res.status(401).json({ error: 'Reactivation token expired' });
            }
            if (verified.reason === 'misconfigured') {
                return res.status(500).json({ error: 'Reactivation token secret is not configured' });
            }
            return res.status(401).json({ error: 'Invalid reactivation token' });
        }

        const provider = db.get(
            'SELECT id, api_key, status, is_paused, deleted_at FROM providers WHERE id = ?',
            verified.payload.providerId
        );
        if (!provider || provider.deleted_at) {
            return res.status(401).json({ error: 'Invalid reactivation token' });
        }

        if (hashProviderApiKey(provider.api_key) !== verified.payload.keyFingerprint) {
            return res.status(401).json({ error: 'Reactivation token is no longer valid for this provider key' });
        }

        const commands = getProviderReactivationCommands(provider.api_key);
        recordActivationEvent(provider.id, 'reactivation_bundle_downloaded', {
            route: 'reactivation/bundle',
        });

        return res.json({
            success: true,
            provider_id: provider.id,
            status: provider.status,
            is_paused: Boolean(provider.is_paused),
            reactivation_bundle: commands,
        });
    } catch (error) {
        console.error('[providers/reactivation/bundle]', error);
        return res.status(500).json({ error: 'Failed to fetch reactivation bundle' });
    }
});

// ============================================================================
// GET /api/providers/available — Renter marketplace: all online providers with full GPU specs
// Public endpoint (renter key preferred but not required for browsing)
// Returns GPU model, VRAM, CUDA version, compute capability, cost rates, availability
// ============================================================================
const EXPECTED_HEARTBEATS_PER_DAY = 24 * 60 * 2; // daemon heartbeat every 30 seconds

function roundTo1(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
}

function computeReputationTier({ uptimePct, successRate, totalJobs }) {
    if (uptimePct >= 95 && successRate >= 95 && totalJobs >= 10) return 'top';
    if (uptimePct >= 80 && successRate >= 80) return 'reliable';
    return 'new';
}

function normalizeLatencyMs(rawValue) {
    if (rawValue == null || rawValue === '') return null;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 10) / 10;
}

function toLatencyContract(row, heartbeatAgeSeconds = null) {
    const benchmarkLatencyMs = normalizeLatencyMs(row?.best_latency_ms);
    if (benchmarkLatencyMs != null) {
        return {
            latency_ms: benchmarkLatencyMs,
            latency_source: 'benchmark',
            latency_sample_count: Number(row?.latency_sample_count || 0),
            latency_measured_at: row?.latest_latency_completed_at || null,
            latency_sort_ms: benchmarkLatencyMs,
        };
    }

    if (Number.isFinite(heartbeatAgeSeconds) && heartbeatAgeSeconds >= 0) {
        const fallbackLatencyMs = normalizeLatencyMs(heartbeatAgeSeconds * 1000);
        return {
            latency_ms: fallbackLatencyMs,
            latency_source: 'heartbeat_age',
            latency_sample_count: 0,
            latency_measured_at: null,
            latency_sort_ms: fallbackLatencyMs,
        };
    }

    return {
        latency_ms: null,
        latency_source: 'none',
        latency_sample_count: 0,
        latency_measured_at: null,
        latency_sort_ms: Number.POSITIVE_INFINITY,
    };
}

function compareByLatencyThenDeterministic(a, b) {
    const latencyDelta = (a.latency_sort_ms ?? Number.POSITIVE_INFINITY) - (b.latency_sort_ms ?? Number.POSITIVE_INFINITY);
    if (latencyDelta !== 0) return latencyDelta;

    const reputationDelta = (b.reputation_score ?? 100) - (a.reputation_score ?? 100);
    if (reputationDelta !== 0) return reputationDelta;

    const uptimeDelta = (b.uptime_pct ?? 0) - (a.uptime_pct ?? 0);
    if (uptimeDelta !== 0) return uptimeDelta;

    return (a.id ?? 0) - (b.id ?? 0);
}

// ============================================================================
// GET /api/providers/active — Authenticated view of online-only providers
// Requires: Authorization: Bearer <renter_api_key|provider_api_key>
// Returns only "online" providers (heartbeat within the last 2 minutes).
// Launch gate: DCP-613 noted this endpoint must require auth.
// ============================================================================
router.get('/active', (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authorization required. Use: Authorization: Bearer <api_key>' });
    }

    // Validate token against renters or providers table
    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND deleted_at IS NULL', [token]);
    const provider = !renter && db.get('SELECT id FROM providers WHERE api_key = ? AND deleted_at IS NULL', [token]);
    if (!renter && !provider) {
        return res.status(401).json({ error: 'Invalid or expired API key' });
    }

    // Query filters: ?tier=A, ?min_vram=24, ?available=true
    const filterTier = req.query.tier ? String(req.query.tier).toUpperCase() : null;
    const filterMinVram = req.query.min_vram ? parseFloat(req.query.min_vram) : null;
    if (filterTier && !['A', 'B', 'C'].includes(filterTier)) {
        return res.status(400).json({ error: 'tier must be A, B, or C' });
    }
    if (filterMinVram !== null && (isNaN(filterMinVram) || filterMinVram < 0)) {
        return res.status(400).json({ error: 'min_vram must be a positive number (GB)' });
    }

    try {
        const { COST_RATES } = require('./jobs');
        let providers = [];
        try {
            providers = db.all(
                `SELECT id, name, gpu_model, gpu_name_detected, gpu_vram_mib, gpu_driver,
                        gpu_vram_mb, gpu_info_json,
                        gpu_compute_capability, gpu_cuda_version, gpu_count_reported, gpu_spec_json,
                        gpu_tier, available_gpu_tiers,
                        status, location, run_mode, reliability_score, reputation_score,
                        cached_models, last_heartbeat, uptime_percent, p.total_jobs, is_paused, created_at,
                        COALESCE(hb.heartbeats_7d, 0) AS heartbeats_7d,
                        COALESCE(js.completed_jobs, 0) AS completed_jobs,
                        COALESCE(js.terminal_jobs, 0) AS terminal_jobs,
                        COALESCE(js.total_jobs_computed, 0) AS total_jobs_all,
                        bl.best_latency_ms,
                        bl.latest_latency_completed_at,
                        COALESCE(bl.latency_sample_count, 0) AS latency_sample_count
                 FROM providers p
                 LEFT JOIN (
                    SELECT provider_id, COUNT(*) AS heartbeats_7d
                    FROM heartbeat_log
                    WHERE datetime(received_at) >= datetime('now', '-7 days')
                    GROUP BY provider_id
                 ) hb ON hb.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
                           SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END) AS terminal_jobs,
                           COUNT(*) AS total_jobs_computed
                    FROM jobs
                    GROUP BY provider_id
                 ) js ON js.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           MIN(latency_ms) AS best_latency_ms,
                           MAX(completed_at) AS latest_latency_completed_at,
                           COUNT(*) AS latency_sample_count
                    FROM benchmark_runs
                    WHERE status = 'completed' AND latency_ms IS NOT NULL
                    GROUP BY provider_id
                 ) bl ON bl.provider_id = p.id
                 WHERE p.is_paused = 0 AND p.last_heartbeat IS NOT NULL
                   AND COALESCE(p.approval_status, 'pending') = 'approved'
                 ORDER BY (p.reputation_score IS NULL) ASC, p.reputation_score DESC,
                          (p.gpu_vram_mib IS NULL) ASC, p.gpu_vram_mib DESC`
            );
        } catch (queryError) {
            console.warn('[/active] Primary query failed, using fallback:', queryError?.message || queryError);
            providers = db.all(
                `SELECT p.id, p.name, p.gpu_model, p.status, p.location, p.run_mode,
                        p.last_heartbeat, p.total_jobs, p.created_at,
                        p.gpu_name_detected, p.gpu_vram_mib, p.gpu_driver,
                        p.gpu_vram_mb, p.gpu_compute_capability, p.gpu_cuda_version,
                        p.gpu_count_reported, p.gpu_spec_json, p.gpu_info_json,
                        p.reliability_score, p.reputation_score, p.cached_models,
                        COALESCE(hb.heartbeats_7d, 0) AS heartbeats_7d,
                        COALESCE(js.completed_jobs, 0) AS completed_jobs,
                        COALESCE(js.terminal_jobs, 0) AS terminal_jobs,
                        COALESCE(js.total_jobs_computed, 0) AS total_jobs_all,
                        bl.best_latency_ms,
                        bl.latest_latency_completed_at,
                        COALESCE(bl.latency_sample_count, 0) AS latency_sample_count
                 FROM providers p
                 LEFT JOIN (
                    SELECT provider_id, COUNT(*) AS heartbeats_7d
                    FROM heartbeat_log
                    WHERE datetime(received_at) >= datetime('now', '-7 days')
                    GROUP BY provider_id
                 ) hb ON hb.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
                           SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END) AS terminal_jobs,
                           COUNT(*) AS total_jobs_computed
                    FROM jobs
                    GROUP BY provider_id
                 ) js ON js.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           MIN(latency_ms) AS best_latency_ms,
                           MAX(completed_at) AS latest_latency_completed_at,
                           COUNT(*) AS latency_sample_count
                    FROM benchmark_runs
                    WHERE status = 'completed' AND latency_ms IS NOT NULL
                    GROUP BY provider_id
                 ) bl ON bl.provider_id = p.id
                 WHERE COALESCE(p.is_paused, 0) = 0 AND p.last_heartbeat IS NOT NULL
                 ORDER BY p.id DESC`
            );
        }

        const now = Date.now();
        const mapped = providers.reduce((acc, p) => {
            const { status: computedStatus, heartbeat_age_seconds } =
                computeProviderStatus(p.last_heartbeat, now);
            const latency = toLatencyContract(p, heartbeat_age_seconds);

            // /active returns only fully-online providers (not degraded)
            if (computedStatus !== 'online') return acc;

            // Apply query filters: ?tier=A, ?min_vram=24
            if (filterTier && p.gpu_tier !== filterTier) return acc;
            if (filterMinVram !== null) {
                const vramGb = p.gpu_vram_mib ? p.gpu_vram_mib / 1024 : (p.gpu_vram_mb ? p.gpu_vram_mb / 1024 : 0);
                if (vramGb < filterMinVram) return acc;
            }

            let cachedModels = [];
            if (p.cached_models) { try { cachedModels = JSON.parse(p.cached_models); } catch {} }

            let gpuSpec = null;
            if (p.gpu_spec_json) { try { gpuSpec = JSON.parse(p.gpu_spec_json); } catch {} }
            let gpuInfo = null;
            if (p.gpu_info_json) { try { gpuInfo = JSON.parse(p.gpu_info_json); } catch {} }

            const createdAtMs = p.created_at ? new Date(p.created_at).getTime() : NaN;
            const daysSinceRegistration = Number.isFinite(createdAtMs)
                ? Math.max(1 / 24, (now - createdAtMs) / (1000 * 60 * 60 * 24))
                : 7;
            const uptimeWindowDays = Math.min(7, daysSinceRegistration);
            const expectedHeartbeats = Math.max(1, uptimeWindowDays * EXPECTED_HEARTBEATS_PER_DAY);
            const uptimePct = roundTo1(Math.min(100, (Number(p.heartbeats_7d || 0) / expectedHeartbeats) * 100));

            const completedJobs = Number(p.completed_jobs || 0);
            const terminalJobs = Number(p.terminal_jobs || 0);
            const totalJobs = Number(p.total_jobs_all || 0);
            const jobSuccessRate = roundTo1(terminalJobs > 0 ? (completedJobs / terminalJobs) * 100 : 0);
            const reputationTier = computeReputationTier({ uptimePct, successRate: jobSuccessRate, totalJobs });

            acc.push({
                id: p.id,
                name: p.name,
                gpu_model: p.gpu_name_detected || p.gpu_model,
                vram_gb: p.gpu_vram_mib ? Math.round(p.gpu_vram_mib / 1024 * 10) / 10 : null,
                vram_mb: p.gpu_vram_mb != null ? p.gpu_vram_mb : (p.gpu_vram_mib != null ? p.gpu_vram_mib : null),
                vram_mib: p.gpu_vram_mib,
                gpu_count: p.gpu_count_reported || 1,
                driver_version: p.gpu_driver,
                compute_capability: p.gpu_compute_capability,
                cuda_version: p.gpu_cuda_version,
                gpu_info: {
                    gpu_name: gpuInfo?.gpu_name || p.gpu_name_detected || p.gpu_model || null,
                    vram_mb: gpuInfo?.vram_mb != null
                        ? gpuInfo.vram_mb
                        : (p.gpu_vram_mb != null ? p.gpu_vram_mb : (p.gpu_vram_mib != null ? p.gpu_vram_mib : null)),
                    driver_version: gpuInfo?.driver_version || p.gpu_driver || null,
                    cuda_version: gpuInfo?.cuda_version || p.gpu_cuda_version || null,
                },
                gpu_spec: gpuSpec,
                gpu_tier: p.gpu_tier || null,
                available_gpu_tiers: p.available_gpu_tiers ? (function() { try { return JSON.parse(p.available_gpu_tiers); } catch(e) { return []; } })() : [],
                status: 'online',
                is_live: true,
                last_heartbeat: p.last_heartbeat || null,
                heartbeat_age_seconds,
                location: p.location,
                run_mode: p.run_mode,
                reliability_score: p.reliability_score,
                reputation_score: p.reputation_score ?? 100,
                uptime_percent: uptimePct,
                uptime_pct: uptimePct,
                job_success_rate: jobSuccessRate,
                total_jobs_completed: completedJobs,
                reputation_tier: reputationTier,
                cached_models: cachedModels,
                latency_ms: latency.latency_ms,
                latency_source: latency.latency_source,
                latency_sample_count: latency.latency_sample_count,
                latency_measured_at: latency.latency_measured_at,
                latency_sort_ms: latency.latency_sort_ms,
                cost_rates_halala_per_min: COST_RATES,
            });

            return acc;
        }, []);

        mapped.sort(compareByLatencyThenDeterministic);

        res.json({
            providers: mapped,
            total: mapped.length,
            timestamp: new Date().toISOString(),
            filters: { tier: filterTier || null, min_vram_gb: filterMinVram },
        });
    } catch (error) {
        console.error('[/active] Error:', error);
        res.status(500).json({ error: 'Failed to fetch active providers' });
    }
});

router.get('/available', (req, res) => {
    try {
        const { COST_RATES } = require('./jobs');
        // Fetch all non-paused providers that have ever sent a heartbeat.
        // Graduated status (online/degraded/offline) is computed in JS from heartbeat age,
        // so we do NOT filter by status column here — the DB status column is only updated
        // when a heartbeat arrives (→ 'online'), not when the provider goes silent.
        let providers = [];
        try {
            providers = db.all(
                `SELECT id, name, gpu_model, gpu_name_detected, gpu_vram_mib, gpu_driver,
                        gpu_vram_mb, gpu_info_json,
                        gpu_compute_capability, gpu_cuda_version, gpu_count_reported, gpu_spec_json,
                        status, location, run_mode, reliability_score, reputation_score,
                        cached_models, last_heartbeat, uptime_percent, p.total_jobs, is_paused, created_at,
                        COALESCE(hb.heartbeats_7d, 0) AS heartbeats_7d,
                        COALESCE(js.completed_jobs, 0) AS completed_jobs,
                        COALESCE(js.terminal_jobs, 0) AS terminal_jobs,
                        COALESCE(js.total_jobs_computed, 0) AS total_jobs_all,
                        bl.best_latency_ms,
                        bl.latest_latency_completed_at,
                        COALESCE(bl.latency_sample_count, 0) AS latency_sample_count
                 FROM providers p
                 LEFT JOIN (
                    SELECT provider_id, COUNT(*) AS heartbeats_7d
                    FROM heartbeat_log
                    WHERE datetime(received_at) >= datetime('now', '-7 days')
                    GROUP BY provider_id
                 ) hb ON hb.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
                           SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END) AS terminal_jobs,
                           COUNT(*) AS total_jobs_computed
                    FROM jobs
                    GROUP BY provider_id
                 ) js ON js.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           MIN(latency_ms) AS best_latency_ms,
                           MAX(completed_at) AS latest_latency_completed_at,
                           COUNT(*) AS latency_sample_count
                    FROM benchmark_runs
                    WHERE status = 'completed' AND latency_ms IS NOT NULL
                    GROUP BY provider_id
                 ) bl ON bl.provider_id = p.id
                 WHERE p.is_paused = 0 AND p.last_heartbeat IS NOT NULL
                   AND COALESCE(p.approval_status, 'pending') = 'approved'
                 ORDER BY (p.reputation_score IS NULL) ASC, p.reputation_score DESC,
                          (p.gpu_vram_mib IS NULL) ASC, p.gpu_vram_mib DESC`
            );
        } catch (primaryQueryError) {
            console.warn('Available providers primary query failed, using legacy fallback:', primaryQueryError?.message || primaryQueryError);
            // Fallback for older SQLite syntax/runtime or partially-migrated provider schemas.
            providers = db.all(
                `SELECT p.id, p.name, p.gpu_model, p.status, p.location, p.run_mode,
                        p.last_heartbeat, p.total_jobs, p.created_at,
                        p.gpu_name_detected, p.gpu_vram_mib, p.gpu_driver,
                        p.gpu_vram_mb, p.gpu_compute_capability, p.gpu_cuda_version,
                        p.gpu_count_reported, p.gpu_spec_json, p.gpu_info_json,
                        p.reliability_score, p.reputation_score, p.cached_models,
                        COALESCE(hb.heartbeats_7d, 0) AS heartbeats_7d,
                        COALESCE(js.completed_jobs, 0) AS completed_jobs,
                        COALESCE(js.terminal_jobs, 0) AS terminal_jobs,
                        COALESCE(js.total_jobs_computed, 0) AS total_jobs_all,
                        bl.best_latency_ms,
                        bl.latest_latency_completed_at,
                        COALESCE(bl.latency_sample_count, 0) AS latency_sample_count
                 FROM providers p
                 LEFT JOIN (
                    SELECT provider_id, COUNT(*) AS heartbeats_7d
                    FROM heartbeat_log
                    WHERE datetime(received_at) >= datetime('now', '-7 days')
                    GROUP BY provider_id
                 ) hb ON hb.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
                           SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END) AS terminal_jobs,
                           COUNT(*) AS total_jobs_computed
                    FROM jobs
                    GROUP BY provider_id
                 ) js ON js.provider_id = p.id
                 LEFT JOIN (
                    SELECT provider_id,
                           MIN(latency_ms) AS best_latency_ms,
                           MAX(completed_at) AS latest_latency_completed_at,
                           COUNT(*) AS latency_sample_count
                    FROM benchmark_runs
                    WHERE status = 'completed' AND latency_ms IS NOT NULL
                    GROUP BY provider_id
                 ) bl ON bl.provider_id = p.id
                 WHERE COALESCE(p.is_paused, 0) = 0 AND p.last_heartbeat IS NOT NULL
                 ORDER BY p.id DESC`
            );
        }

        const now = Date.now();
        const mapped = providers.reduce((acc, p) => {
            const { status: computedStatus, heartbeat_age_seconds, degraded_since } =
                computeProviderStatus(p.last_heartbeat, now);
            const latency = toLatencyContract(p, heartbeat_age_seconds);

            // Exclude truly offline providers from the marketplace listing
            if (computedStatus === 'offline') return acc;

            let cachedModels = [];
            if (p.cached_models) { try { cachedModels = JSON.parse(p.cached_models); } catch {} }

            let gpuSpec = null;
            if (p.gpu_spec_json) { try { gpuSpec = JSON.parse(p.gpu_spec_json); } catch {} }
            let gpuInfo = null;
            if (p.gpu_info_json) { try { gpuInfo = JSON.parse(p.gpu_info_json); } catch {} }

            const createdAtMs = p.created_at ? new Date(p.created_at).getTime() : NaN;
            const daysSinceRegistration = Number.isFinite(createdAtMs)
                ? Math.max(1 / 24, (now - createdAtMs) / (1000 * 60 * 60 * 24))
                : 7;
            const uptimeWindowDays = Math.min(7, daysSinceRegistration);
            const expectedHeartbeats = Math.max(1, uptimeWindowDays * EXPECTED_HEARTBEATS_PER_DAY);
            const uptimePct = roundTo1(Math.min(100, (Number(p.heartbeats_7d || 0) / expectedHeartbeats) * 100));

            const completedJobs = Number(p.completed_jobs || 0);
            const terminalJobs = Number(p.terminal_jobs || 0);
            const totalJobs = Number(p.total_jobs_all || 0);
            const jobSuccessRate = roundTo1(terminalJobs > 0 ? (completedJobs / terminalJobs) * 100 : 0);
            const reputationTier = computeReputationTier({
                uptimePct,
                successRate: jobSuccessRate,
                totalJobs,
            });

            acc.push({
                id: p.id,
                name: p.name,
                // GPU spec
                gpu_model: p.gpu_name_detected || p.gpu_model,
                vram_gb: p.gpu_vram_mib ? Math.round(p.gpu_vram_mib / 1024 * 10) / 10 : null,
                vram_mb: p.gpu_vram_mb != null ? p.gpu_vram_mb : (p.gpu_vram_mib != null ? p.gpu_vram_mib : null),
                vram_mib: p.gpu_vram_mib,
                gpu_count: p.gpu_count_reported || 1,
                driver_version: p.gpu_driver,
                compute_capability: p.gpu_compute_capability,
                cuda_version: p.gpu_cuda_version,
                gpu_info: {
                    gpu_name: gpuInfo?.gpu_name || p.gpu_name_detected || p.gpu_model || null,
                    vram_mb: gpuInfo?.vram_mb != null
                        ? gpuInfo.vram_mb
                        : (p.gpu_vram_mb != null ? p.gpu_vram_mb : (p.gpu_vram_mib != null ? p.gpu_vram_mib : null)),
                    driver_version: gpuInfo?.driver_version || p.gpu_driver || null,
                    cuda_version: gpuInfo?.cuda_version || p.gpu_cuda_version || null,
                },
                gpu_spec: gpuSpec,
                // Graduated availability status
                status: computedStatus,           // "online" | "degraded"
                is_live: computedStatus === 'online',
                heartbeat_age_seconds,
                degraded_since,                   // ISO timestamp when degraded began; null if online
                location: p.location,
                run_mode: p.run_mode,
                // Quality
                reliability_score: p.reliability_score,
                reputation_score: p.reputation_score ?? 100,
                uptime_percent: uptimePct,
                uptime_pct: uptimePct,
                job_success_rate: jobSuccessRate,
                total_jobs_completed: completedJobs,
                reputation_tier: reputationTier,
                cached_models: cachedModels,
                latency_ms: latency.latency_ms,
                latency_source: latency.latency_source,
                latency_sample_count: latency.latency_sample_count,
                latency_measured_at: latency.latency_measured_at,
                latency_sort_ms: latency.latency_sort_ms,
                // Pricing (halala per minute by job type)
                cost_rates_halala_per_min: COST_RATES,
            });

            return acc;
        }, []);
        // Degrade sort: online providers first, then degraded, both sub-sorted by reputation
        mapped.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
            return compareByLatencyThenDeterministic(a, b);
        });

        res.json({
            providers: mapped,
            total: mapped.length,
            online_count: mapped.filter(p => p.status === 'online').length,
            degraded_count: mapped.filter(p => p.status === 'degraded').length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Available providers error:', error);
        res.status(500).json({ error: 'Failed to fetch available providers' });
    }
});

// ============================================================================
// GET /api/providers/marketplace — Public provider cards for marketplace page
// Returns only online providers with minimal card fields (no auth required)
// ============================================================================
router.get('/marketplace', (req, res) => {
    try {
        const defaultRateHalalaPerHour = 500;
        const providers = db.all(
            `SELECT p.id, p.gpu_model, p.gpu_name_detected, p.gpu_vram_mib, p.vram_gb, p.uptime_percent, p.total_jobs, p.created_at,
                    p.last_heartbeat, p.reputation_score,
                    gp.rate_halala AS marketplace_rate_halala,
                    COALESCE(hb.heartbeats_7d, 0) AS heartbeats_7d,
                    COALESCE(js.completed_jobs, 0) AS completed_jobs,
                    COALESCE(js.terminal_jobs, 0) AS terminal_jobs,
                    COALESCE(js.total_jobs_computed, 0) AS total_jobs_all,
                    bl.best_latency_ms,
                    bl.latest_latency_completed_at,
                    COALESCE(bl.latency_sample_count, 0) AS latency_sample_count
             FROM providers p
             LEFT JOIN gpu_pricing gp
               ON LOWER(TRIM(gp.gpu_model)) = LOWER(TRIM(COALESCE(p.gpu_name_detected, p.gpu_model)))
             LEFT JOIN (
                SELECT provider_id, COUNT(*) AS heartbeats_7d
                FROM heartbeat_log
                WHERE datetime(received_at) >= datetime('now', '-7 days')
                GROUP BY provider_id
             ) hb ON hb.provider_id = p.id
             LEFT JOIN (
                SELECT provider_id,
                       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
                       SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END) AS terminal_jobs,
                       COUNT(*) AS total_jobs_computed
                FROM jobs
                GROUP BY provider_id
             ) js ON js.provider_id = p.id
             LEFT JOIN (
                SELECT provider_id,
                       MIN(latency_ms) AS best_latency_ms,
                       MAX(completed_at) AS latest_latency_completed_at,
                       COUNT(*) AS latency_sample_count
                FROM benchmark_runs
                WHERE status = 'completed' AND latency_ms IS NOT NULL
                GROUP BY provider_id
             ) bl ON bl.provider_id = p.id
             WHERE p.status = 'online' AND COALESCE(p.is_paused, 0) = 0
               AND COALESCE(p.approval_status, 'pending') = 'approved'
             ORDER BY COALESCE(p.reputation_score, 0) DESC, p.id DESC`
        );

        const payload = providers.map((p) => {
            const createdAtMs = p.created_at ? new Date(p.created_at).getTime() : NaN;
            const daysSinceRegistration = Number.isFinite(createdAtMs)
                ? Math.max(1 / 24, (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24))
                : 7;
            const uptimeWindowDays = Math.min(7, daysSinceRegistration);
            const expectedHeartbeats = Math.max(1, uptimeWindowDays * EXPECTED_HEARTBEATS_PER_DAY);
            const uptimePct = roundTo1(Math.min(100, (Number(p.heartbeats_7d || 0) / expectedHeartbeats) * 100));

            const completedJobs = Number(p.completed_jobs || 0);
            const terminalJobs = Number(p.terminal_jobs || 0);
            const totalJobs = Number(p.total_jobs_all || 0);
            const jobSuccessRate = roundTo1(terminalJobs > 0 ? (completedJobs / terminalJobs) * 100 : 0);
            const reputationTier = computeReputationTier({
                uptimePct,
                successRate: jobSuccessRate,
                totalJobs,
            });
            const heartbeatAgeSeconds = p.last_heartbeat
                ? Math.max(0, Math.floor((Date.now() - new Date(p.last_heartbeat).getTime()) / 1000))
                : null;
            const latency = toLatencyContract(p, heartbeatAgeSeconds);

            const rateHalalaPerHour = Number.isInteger(p.marketplace_rate_halala)
                ? p.marketplace_rate_halala
                : defaultRateHalalaPerHour;
            return {
                id: p.id,
                gpu_model: p.gpu_name_detected || p.gpu_model || 'Unknown GPU',
                vram_gb: p.vram_gb != null
                    ? Number(p.vram_gb)
                    : (p.gpu_vram_mib != null ? Math.round((p.gpu_vram_mib / 1024) * 10) / 10 : null),
                rate_halala: rateHalalaPerHour,
                price_per_min_halala: Math.max(1, Math.round(rateHalalaPerHour / 60)),
                uptime_pct: uptimePct,
                job_success_rate: jobSuccessRate,
                total_jobs_completed: completedJobs,
                reputation_tier: reputationTier,
                reputation_score: p.reputation_score ?? 0,
                latency_ms: latency.latency_ms,
                latency_source: latency.latency_source,
                latency_sample_count: latency.latency_sample_count,
                latency_measured_at: latency.latency_measured_at,
                latency_sort_ms: latency.latency_sort_ms,
            };
        });

        payload.sort(compareByLatencyThenDeterministic);

        res.json(payload);
    } catch (error) {
        console.error('Marketplace providers error:', error);
        res.status(500).json({ error: 'Failed to fetch marketplace providers' });
    }
});

// ============================================================================
// GET /api/providers/public — Anonymized GPU listings for public marketplace
// No auth required. Cached 30s to avoid hammering DB on landing page loads.
// Returns online providers only (heartbeat within 5 minutes).
// Fields: gpu_model, vram_mb, gpu_count, supported_compute_types,
//         cost_per_hour_sar, jobs_completed — NO email, api_key, or earnings.
// ============================================================================
let _publicCache = null;
let _publicCacheAt = 0;
const PUBLIC_CACHE_TTL_MS = 30 * 1000;

router.get('/public', publicProvidersLimiter, (req, res) => {
    try {
        const now = Date.now();
        if (_publicCache && (now - _publicCacheAt) < PUBLIC_CACHE_TTL_MS) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('Cache-Control', 'public, max-age=30');
            return res.json(_publicCache);
        }

        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
        const rows = db.all(
            `SELECT p.id, p.gpu_model, p.gpu_name_detected, p.gpu_vram_mib, p.vram_gb,
                    p.gpu_count, p.supported_compute_types,
                    p.cost_per_gpu_second_halala,
                    COALESCE(js.completed_jobs, 0) AS jobs_completed
             FROM providers p
             LEFT JOIN (
                SELECT provider_id,
                       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs
                FROM jobs
                GROUP BY provider_id
             ) js ON js.provider_id = p.id
             WHERE p.status = 'online'
               AND p.last_heartbeat >= ?
               AND COALESCE(p.is_paused, 0) = 0
             ORDER BY p.id DESC`,
            fiveMinutesAgo
        );

        const payload = rows.map(p => {
            const vramMb = p.gpu_vram_mib != null
                ? Number(p.gpu_vram_mib)
                : (p.vram_gb != null ? Math.round(Number(p.vram_gb) * 1024) : null);

            let computeTypes = [];
            try {
                if (p.supported_compute_types) {
                    computeTypes = JSON.parse(p.supported_compute_types);
                }
            } catch (_) {}

            const costPerSecHalala = Number(p.cost_per_gpu_second_halala || 0.25);
            const costPerHourSar = parseFloat(((costPerSecHalala * 3600) / 100).toFixed(2));

            return {
                id: p.id,
                gpu_model: p.gpu_name_detected || p.gpu_model || 'Unknown GPU',
                vram_mb: vramMb,
                gpu_count: Number(p.gpu_count || 1),
                supported_compute_types: computeTypes,
                cost_per_hour_sar: costPerHourSar,
                jobs_completed: Number(p.jobs_completed || 0),
                online: true,
            };
        });

        _publicCache = payload;
        _publicCacheAt = now;
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.json(payload);
    } catch (error) {
        console.error('Public providers error:', error);
        res.status(500).json({ error: 'Failed to fetch public providers' });
    }
});

// ============================================================================
// GET /api/providers/:id/benchmarks — Most recent benchmark result for provider
// ============================================================================
router.get('/:id/benchmarks', benchmarkLimiter, (req, res) => {
    try {
        const isAdminReq = isAdminRequest(req);

        const providerId = parseInt(req.params.id, 10);
        if (!Number.isFinite(providerId)) {
            return res.status(400).json({ error: 'Provider id must be a number' });
        }

        if (!isAdminReq) {
            const key = req.headers['x-provider-key'] || req.query.key;
            if (!key) return res.status(401).json({ error: 'API key required' });
            const own = db.get('SELECT id FROM providers WHERE api_key = ?', key);
            if (!own || own.id !== providerId) return res.status(403).json({ error: 'Forbidden' });
        }

        const provider = db.get('SELECT id FROM providers WHERE id = ?', providerId);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        const benchmarkJob = db.get(
            `SELECT job_id
             FROM jobs
             WHERE provider_id = ? AND job_type = 'benchmark' AND status = 'completed' AND result IS NOT NULL
             ORDER BY datetime(COALESCE(completed_at, submitted_at)) DESC, id DESC
             LIMIT 1`,
            providerId
        );

        if (!benchmarkJob) {
            return res.status(404).json({ error: 'No benchmark found for this provider' });
        }

        const benchmark = getBenchmarkResult(benchmarkJob.job_id);
        if (!benchmark) {
            return res.status(404).json({ error: 'Benchmark data unavailable' });
        }

        res.json({
            provider_id: providerId,
            benchmark,
        });
    } catch (error) {
        console.error('Provider benchmark fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch provider benchmark' });
    }
});

// ============================================================================
// GET /api/providers/:id/gpu-metrics — GPU metric history for charts and monitoring
// Returns last N heartbeat samples with GPU utilization, temp, VRAM, multi-GPU JSON
// Auth: provider key (own data) or admin token
// Query params: limit (default 60, max 1440), since (ISO timestamp)
// ============================================================================
router.get('/:id/gpu-metrics', (req, res) => {
    try {
        const isAdminReq = isAdminRequest(req);

        const providerIdParam = req.params.id;

        // Allow provider to fetch own metrics by numeric ID or 'me'
        let provider;
        if (providerIdParam === 'me') {
            const key = req.headers['x-provider-key'] || req.query.key;
            if (!key) return res.status(401).json({ error: 'API key required' });
            provider = db.get('SELECT id, gpu_name_detected, gpu_vram_mib, gpu_count_reported, gpu_spec_json FROM providers WHERE api_key = ?', key);
        } else {
            provider = db.get('SELECT id, gpu_name_detected, gpu_vram_mib, gpu_count_reported, gpu_spec_json FROM providers WHERE id = ?', providerIdParam);
            if (provider && !isAdminReq) {
                // Non-admin must supply own key
                const key = req.headers['x-provider-key'] || req.query.key;
                const own = key ? db.get('SELECT id FROM providers WHERE api_key = ?', key) : null;
                if (!own || own.id !== provider.id) return res.status(403).json({ error: 'Forbidden' });
            }
        }

        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const limit = Math.min(parseInt(req.query.limit) || 60, 1440);
        const since = req.query.since || null;

        let samples;
        if (since) {
            samples = db.all(
                `SELECT received_at, gpu_util_pct, gpu_temp_c, gpu_power_w, gpu_vram_free_mib, gpu_vram_total_mib, gpu_metrics_json, gpu_count
                 FROM heartbeat_log WHERE provider_id = ? AND received_at > ?
                 ORDER BY received_at DESC LIMIT ?`,
                provider.id, since, limit
            );
        } else {
            samples = db.all(
                `SELECT received_at, gpu_util_pct, gpu_temp_c, gpu_power_w, gpu_vram_free_mib, gpu_vram_total_mib, gpu_metrics_json, gpu_count
                 FROM heartbeat_log WHERE provider_id = ?
                 ORDER BY received_at DESC LIMIT ?`,
                provider.id, limit
            );
        }

        // Parse gpu_metrics_json inline
        const parsed = samples.map(s => ({
            ...s,
            all_gpus: s.gpu_metrics_json ? (() => { try { return JSON.parse(s.gpu_metrics_json); } catch { return null; } })() : null,
            gpu_metrics_json: undefined,
        }));

        res.json({
            provider_id: provider.id,
            gpu_name: provider.gpu_name_detected,
            gpu_vram_mib: provider.gpu_vram_mib,
            gpu_count: provider.gpu_count_reported || 1,
            gpu_spec: provider.gpu_spec_json ? (() => { try { return JSON.parse(provider.gpu_spec_json); } catch { return null; } })() : null,
            samples: parsed,
            sample_count: parsed.length,
        });
    } catch (error) {
        console.error('GPU metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch GPU metrics' });
    }
});

// ============================================================================
// GET /api/providers/me/data-export — PDPL right to access/export
// Alias kept for backwards compatibility: /api/providers/me/export
// ============================================================================
router.get(['/me/data-export', '/me/export'], providerDataExportLimiter, (req, res) => {
    try {
        const key = req.headers['x-provider-key'] || req.query.key;
        if (!key) return res.status(400).json({ error: 'API key required (x-provider-key header or key query)' });

        const provider = db.get(
            `SELECT id, name, email, gpu_model, os, status, approval_status, created_at, updated_at,
                    total_jobs, total_earnings, claimable_earnings_halala
             FROM providers
             WHERE api_key = ?`,
            key
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const jobs = db.all(
            `SELECT id, job_id, job_type, status, renter_id, model,
                    cost_halala, actual_cost_halala, duration_minutes, actual_duration_minutes,
                    submitted_at, started_at, completed_at, created_at, updated_at, error
             FROM jobs
             WHERE provider_id = ?
             ORDER BY COALESCE(completed_at, submitted_at, created_at) DESC`,
            provider.id
        );

        const payments = db.all(
            `SELECT id, job_id, amount_halala, status, created_at, resolved_at
             FROM escrow_holds
             WHERE provider_id = ? AND status = 'released_provider'
             ORDER BY COALESCE(resolved_at, created_at) DESC`,
            provider.id
        );

        const withdrawalsLegacy = db.all(
            `SELECT withdrawal_id AS request_id, amount_sar, status, requested_at AS created_at, processed_at, notes
             FROM withdrawals
             WHERE provider_id = ?
             ORDER BY requested_at DESC`,
            provider.id
        );

        const withdrawals = db.all(
            `SELECT id AS request_id, amount_halala, status, created_at, processed_at, admin_note
             FROM withdrawal_requests
             WHERE provider_id = ?
             ORDER BY created_at DESC`,
            provider.id
        );

        const analytics = {
            status_counts: db.all(
                `SELECT status, COUNT(*) AS count
                 FROM jobs
                 WHERE provider_id = ?
                 GROUP BY status
                 ORDER BY count DESC`,
                provider.id
            ),
            daily_earnings_last_30d: db.all(
                `SELECT DATE(COALESCE(completed_at, submitted_at, created_at)) AS day,
                        COALESCE(SUM(COALESCE(provider_earned_halala, 0)), 0) AS provider_earned_halala,
                        COUNT(*) AS job_count
                 FROM jobs
                 WHERE provider_id = ?
                   AND DATE(COALESCE(completed_at, submitted_at, created_at)) >= DATE('now', '-30 day')
                 GROUP BY DATE(COALESCE(completed_at, submitted_at, created_at))
                 ORDER BY day DESC`,
                provider.id
            ),
            heartbeat_summary: db.get(
                `SELECT COUNT(*) AS samples,
                        MAX(received_at) AS last_heartbeat_at,
                        COALESCE(AVG(gpu_util_pct), 0) AS avg_gpu_util_pct,
                        COALESCE(AVG(gpu_temp_c), 0) AS avg_gpu_temp_c
                 FROM heartbeat_log
                 WHERE provider_id = ?`,
                provider.id
            ) || { samples: 0, last_heartbeat_at: null, avg_gpu_util_pct: 0, avg_gpu_temp_c: 0 },
        };

        const nowIso = new Date().toISOString();
        runStatement(
            `INSERT INTO pdpl_request_log (account_type, account_id, request_type, requested_at, metadata_json)
             VALUES ('provider', ?, 'export', ?, ?)`,
            provider.id,
            nowIso,
            JSON.stringify({ mode: 'direct_json', endpoint: '/api/providers/me/export' })
        );

        sendDataExportReady(provider.email, {
            accountType: 'provider',
            requestedAt: nowIso,
            deliveryMode: 'direct',
        }).catch((e) => console.error('[providers.export] data export email failed:', e.message));

        return res.json({
            exported_at: nowIso,
            account: {
                id: provider.id,
                name: provider.name,
                email: provider.email,
                gpu_model: provider.gpu_model,
                os: provider.os,
                status: provider.status,
                approval_status: provider.approval_status,
                created_at: provider.created_at,
                updated_at: provider.updated_at || null,
                total_jobs: Number(provider.total_jobs || 0),
                total_earnings_halala: Math.max(0, Math.round(Number(provider.total_earnings || 0) * 100)),
                claimable_earnings_halala: Number(provider.claimable_earnings_halala || 0),
            },
            jobs,
            payments,
            withdrawals: [
                ...withdrawals.map((entry) => ({ ...entry, source: 'withdrawal_requests' })),
                ...withdrawalsLegacy.map((entry) => ({ ...entry, source: 'withdrawals' })),
            ],
            analytics,
        });
    } catch (error) {
        console.error('Provider export error:', error);
        return res.status(500).json({ error: 'Failed to export provider data' });
    }
});

// ============================================================================
// DELETE /api/providers/me — PDPL right to erasure
// Soft-deletes and anonymizes provider account (audit trail preserved).
// Auth: x-provider-key header or key query param.
// ============================================================================
router.delete('/me', providerAccountDeletionLimiter, (req, res) => {
    try {
        const key = req.headers['x-provider-key'] || req.query.key;
        if (!key) return res.status(400).json({ error: 'API key required (x-provider-key header or key query)' });

        const provider = db.get('SELECT id, status, email FROM providers WHERE api_key = ?', key);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });
        if (provider.status === 'deleted') return res.status(410).json({ error: 'Account already deleted' });

        const now = new Date().toISOString();
        const deletionScheduledFor = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
        const anonymizedEmail = hashedDeletedEmail(provider.email, provider.id);
        const tombstoneApiKey = `deleted-provider-${provider.id}-${crypto.randomUUID()}`;

        const cancelledJobs = runStatement(
            `UPDATE jobs SET
               status = 'cancelled',
               error = COALESCE(error, 'Cancelled: provider account deleted by PDPL request'),
               completed_at = COALESCE(completed_at, ?),
               updated_at = ?
             WHERE provider_id = ?
              AND status IN ('queued', 'pending', 'running', 'paused')`,
            now,
            now,
            provider.id
        );

        // Keep provider-linked audit records; only redact bank payout details.
        runStatement('UPDATE withdrawals SET payout_details = NULL, notes = ? WHERE provider_id = ?', 'Redacted per PDPL deletion request', provider.id);
        runStatement('UPDATE withdrawal_requests SET iban = ?, admin_note = ? WHERE provider_id = ?', 'SA0000000000000000000000', 'Redacted per PDPL deletion request', provider.id);
        runStatement('DELETE FROM serve_sessions WHERE provider_id = ?', provider.id);

        const updated = runStatement(
            `UPDATE providers SET
               name = '[deleted]',
               email = ?,
               organization = NULL,
               ip_address = NULL,
               location = NULL,
               notes = NULL,
               status = 'deleted',
               approval_status = 'deleted',
               deleted_at = ?,
               deletion_scheduled_for = ?,
               api_key = ?,
               updated_at = ?
             WHERE id = ?`,
            anonymizedEmail,
            now,
            deletionScheduledFor,
            tombstoneApiKey,
            now,
            provider.id
        );
        if (!updated.changes) return res.status(500).json({ error: 'Account deletion failed' });

        runStatement(
            `INSERT INTO pdpl_request_log (account_type, account_id, request_type, requested_at, metadata_json)
             VALUES ('provider', ?, 'delete', ?, ?)`,
            provider.id,
            now,
            JSON.stringify({ cancelled_jobs: cancelledJobs.changes || 0, deletion_scheduled_for: deletionScheduledFor })
        );

        return res.json({
            cancelled_jobs: cancelledJobs.changes || 0,
            deletion_scheduled_for: deletionScheduledFor,
            message: 'Account scheduled for deletion in 30 days. Contact support to cancel.',
        });
    } catch (error) {
        console.error('Provider delete error:', error);
        return res.status(500).json({ error: 'Account deletion failed' });
    }
});

// ─── Provider Health API ───────────────────────────────────────────────────────
// GET /api/providers/online  — list of currently online providers (admin only)
// GET /api/providers/:id/health — health check history (admin or provider itself)
// ──────────────────────────────────────────────────────────────────────────────

const { getProviderHealthStatus, getOnlineProviders } = require('../workers/providerHealthWorker');

router.get('/online', (req, res) => {
    try {
        const isAdmin = isAdminRequest(req);

        if (isAdmin) {
            // Admin: full provider records from health worker
            const providers = getOnlineProviders(db);
            return res.json({ count: providers.length, providers, generated_at: new Date().toISOString() });
        }

        // Public: sanitized marketplace view — no email, no api_key, no internal fields.
        // Returns providers with a fresh heartbeat (within ONLINE_EXPIRY_SECONDS).
        // ONLINE_EXPIRY_SECONDS is defined later in the file; use a safe default if referenced early.
        const freshnessThresholdSec = 90;
        const cutoff = new Date(Date.now() - freshnessThresholdSec * 1000).toISOString();

        const rows = db.all(
            `SELECT id, name, gpu_model, vram_gb, location, cached_models, status, last_heartbeat, updated_at
             FROM providers
             WHERE status = 'online'
               AND approval_status = 'approved'
               AND COALESCE(is_paused, 0) = 0
               AND deleted_at IS NULL
               AND last_heartbeat >= ?
             ORDER BY last_heartbeat DESC
             LIMIT 100`,
            cutoff
        );

        const sanitized = rows.map((p) => {
            let loadedModels = [];
            try { loadedModels = JSON.parse(p.cached_models || '[]'); } catch (_) {}
            const heartbeatAgeSec = p.last_heartbeat
                ? Math.floor((Date.now() - new Date(p.last_heartbeat).getTime()) / 1000)
                : null;
            return {
                id: p.id,
                name: p.name,
                gpu_model: p.gpu_model,
                vram_gb: p.vram_gb,
                location: p.location || null,
                loaded_models: Array.isArray(loadedModels) ? loadedModels : [],
                heartbeat_age_seconds: heartbeatAgeSec,
                is_live: heartbeatAgeSec != null && heartbeatAgeSec < freshnessThresholdSec,
            };
        });

        return res.json({
            count: sanitized.length,
            providers: sanitized,
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Provider online list error:', error);
        return res.status(500).json({ error: 'Failed to list online providers' });
    }
});

router.get('/:id/health', (req, res) => {
    try {
        const providerId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(providerId) || providerId < 1) {
            return res.status(400).json({ error: 'Invalid provider id' });
        }
        if (!isAdminRequest(req)) {
            const apiKey = getBearerToken(req) || req.body?.api_key || req.query?.api_key;
            if (!apiKey) return res.status(401).json({ error: 'Authentication required' });
            const p = db.get('SELECT id FROM providers WHERE id = ? AND api_key = ?', providerId, apiKey);
            if (!p) return res.status(403).json({ error: 'Access denied' });
        }
        const health = getProviderHealthStatus(db, providerId);
        if (!health) return res.status(404).json({ error: 'Provider not found' });
        return res.json(health);
    } catch (error) {
        console.error('Provider health endpoint error:', error);
        return res.status(500).json({ error: 'Failed to fetch provider health' });
    }
});


// ============================================================================
// Provider Activation System (DCP-753)
// ============================================================================
// Minimum hardware requirements for provider activation
const ACTIVATION_MIN_VRAM_GB = 8;
const ACTIVATION_MIN_TFLOPS = 10;
const ACTIVATION_STALE_HEARTBEAT_SECONDS = Number(process.env.DC1_ACTIVATION_STALE_HEARTBEAT_SECONDS || 300);
const ACTIVATION_MIN_COMPUTE_CAPABILITY = Number(process.env.DC1_ACTIVATION_MIN_COMPUTE_CAPABILITY || 6.0);
const ACTIVATION_BLOCKER_CODES = Object.freeze({
    KEY_AUTH_MISMATCH: 'KEY_AUTH_MISMATCH',
    KEY_AUTH_INTEGRITY: 'KEY_AUTH_INTEGRITY',
    DAEMON_NOT_SEEN: 'DAEMON_NOT_SEEN',
    STALE_HEARTBEAT: 'STALE_HEARTBEAT',
    MISSING_TIER_IMAGE: 'MISSING_TIER_IMAGE',
    INVALID_GPU_CAPABILITY: 'INVALID_GPU_CAPABILITY',
});

// Provider event emitter for downstream consumers (e.g. job dispatcher DCP-738)
const _providerEventEmitter = new (require('events'))();
_providerEventEmitter.setMaxListeners(50);

function ensureAvailableGpuTiersColumn() {
    try {
        db.prepare('ALTER TABLE providers ADD COLUMN available_gpu_tiers TEXT').run();
    } catch (_) { /* Column already exists */ }
}

function ensureGpuTierColumn() {
    try {
        db.prepare('ALTER TABLE providers ADD COLUMN gpu_tier TEXT').run();
    } catch (_) { /* Column already exists */ }
}

function ensureProviderBenchmarksTable() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS provider_benchmarks (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            provider_id TEXT NOT NULL,
            gpu_model TEXT NOT NULL,
            vram_gb REAL NOT NULL,
            tflops REAL NOT NULL,
            bandwidth_gbps REAL,
            tokens_per_sec REAL,
            tier TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            FOREIGN KEY (provider_id) REFERENCES providers(id)
        )
    `).run();
}

function parseActivationCachedModels(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object' && typeof entry.model_id === 'string') return entry.model_id;
            return null;
        }).filter(Boolean);
    } catch (_) {
        return [];
    }
}

function parseActivationComputeCapability(raw) {
    if (raw == null) return null;
    const parsed = Number.parseFloat(String(raw).trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function buildProviderActivationScorecard(provider, opts = {}) {
    const {
        authKeyProvided = true,
        authKeyMatched = true,
        nowMs = Date.now(),
    } = opts;

    const checks = {
        key_auth_match: Boolean(authKeyProvided && authKeyMatched),
        auth_key_integrity: false,
        daemon_seen: false,
        heartbeat_fresh: false,
        tier_image_available: true,
        gpu_capability_fit: true,
    };

    if (provider) {
        checks.auth_key_integrity = Boolean(normalizeString(provider.api_key, { maxLen: 128, trim: false }));
        checks.daemon_seen = Boolean(
            normalizeString(provider.daemon_version, { maxLen: 32 }) ||
            provider.last_heartbeat ||
            provider.gpu_status
        );

        const heartbeatAt = provider.last_heartbeat ? new Date(provider.last_heartbeat).getTime() : null;
        if (Number.isFinite(heartbeatAt)) {
            const ageSeconds = Math.max(0, Math.floor((nowMs - heartbeatAt) / 1000));
            checks.heartbeat_fresh = ageSeconds <= ACTIVATION_STALE_HEARTBEAT_SECONDS;
        }

        const preloadModel = normalizeString(provider.model_preload_model, { maxLen: 200 });
        const preloadStatus = (normalizeString(provider.model_preload_status, { maxLen: 32 }) || 'none').toLowerCase();
        const cachedModels = parseActivationCachedModels(provider.cached_models);
        if (preloadModel) {
            const hasModel = cachedModels.some((model) => String(model).toLowerCase() === preloadModel.toLowerCase());
            checks.tier_image_available = hasModel && preloadStatus !== 'downloading' && preloadStatus !== 'warming';
        }

        const computeCapability = parseActivationComputeCapability(provider.gpu_compute_capability);
        if (provider.gpu_compute_capability != null && String(provider.gpu_compute_capability).trim() !== '') {
            checks.gpu_capability_fit = computeCapability != null && computeCapability >= ACTIVATION_MIN_COMPUTE_CAPABILITY;
        }
    }

    const blockers = [];
    if (!checks.key_auth_match) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.KEY_AUTH_MISMATCH, message: 'API key does not match provider' });
    if (!checks.auth_key_integrity) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.KEY_AUTH_INTEGRITY, message: 'Provider API key integrity check failed' });
    if (!checks.daemon_seen) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.DAEMON_NOT_SEEN, message: 'No daemon activity detected' });
    if (!checks.heartbeat_fresh) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.STALE_HEARTBEAT, message: 'Heartbeat is stale or missing' });
    if (!checks.tier_image_available) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.MISSING_TIER_IMAGE, message: 'Required tier image is not ready' });
    if (!checks.gpu_capability_fit) blockers.push({ reason_code: ACTIVATION_BLOCKER_CODES.INVALID_GPU_CAPABILITY, message: 'GPU capability is below serving requirement' });

    return {
        provider_id: provider?.id || null,
        ready_to_serve: blockers.length === 0,
        checks,
        blockers,
        admission: provider?.id ? fetchLatestTierAdmissionRejection(provider.id) : {
            latest_rejection_code: null,
            latest_rejection_at: null,
            code_enum: TIER_ADMISSION_REJECTION_CODES,
        },
        generated_at: new Date(nowMs).toISOString(),
    };
}

function activateProviderById(providerId) {
    ensureAvailableGpuTiersColumn();
    ensureProviderBenchmarksTable();

    const provider = db.get(
        'SELECT id, status, approval_status FROM providers WHERE id = ?',
        providerId
    );
    if (!provider) return { activated: false, reason: 'Provider not found' };

    const benchmark = db.get(
        'SELECT gpu_model, vram_gb, tflops, tier FROM provider_benchmarks WHERE provider_id = ? ORDER BY submitted_at DESC LIMIT 1',
        providerId
    );
    if (!benchmark) return { activated: false, reason: 'No benchmark on record' };

    const errors = [];
    if (benchmark.vram_gb < ACTIVATION_MIN_VRAM_GB) {
        errors.push('VRAM ' + benchmark.vram_gb + 'GB < minimum ' + ACTIVATION_MIN_VRAM_GB + 'GB');
    }
    if (benchmark.tflops < ACTIVATION_MIN_TFLOPS) {
        errors.push('TFLOPS ' + benchmark.tflops + ' < minimum ' + ACTIVATION_MIN_TFLOPS);
    }
    if (errors.length > 0) {
        return { activated: false, reason: 'Hardware below minimum: ' + errors.join('; ') };
    }

    if (provider.status === 'active') {
        return { activated: false, reason: 'Already active' };
    }

    const tier = benchmark.tier || 'C';
    const tierRank = { A: 0, B: 1, C: 2 };
    const tierRankVal = tierRank[tier] !== undefined ? tierRank[tier] : 2;
    const availableTiers = Object.keys(tierRank).filter(function(t) {
        return (tierRank[t] !== undefined ? tierRank[t] : 2) >= tierRankVal;
    });

    const now = new Date().toISOString();
    runStatement(
        'UPDATE providers SET status = ?, available_gpu_tiers = ?, updated_at = ? WHERE id = ?',
        'active', JSON.stringify(availableTiers), now, providerId
    );

    _providerEventEmitter.emit('provider.activated', {
        provider_id: providerId,
        tier: tier,
        available_tiers: availableTiers,
        vram_gb: benchmark.vram_gb,
        tflops: benchmark.tflops,
        gpu_model: benchmark.gpu_model,
        activated_at: now,
    });

    console.log('[providers] Activated provider ' + providerId + ' (tier=' + tier + ', vram=' + benchmark.vram_gb + 'GB, tflops=' + benchmark.tflops + ')');
    return { activated: true, tier: tier, available_tiers: availableTiers };
}

// ============================================================================
// POST /api/providers/:id/benchmark-submit — Benchmark submission + activation
// ============================================================================
router.post('/:id/benchmark-submit', function(req, res) {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const provider = db.get(
            'SELECT id, approval_status FROM providers WHERE id = ? AND api_key = ?',
            providerId, apiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid provider ID or API key' });

        const body = req.body || {};
        const gpu_model = body.gpu_model;
        const vram_gb = body.vram_gb;
        const tflops = body.tflops;
        const tier = body.tier;
        const bandwidth_gbps = body.bandwidth_gbps;
        const tokens_per_sec = body.tokens_per_sec;

        if (!gpu_model || typeof gpu_model !== 'string') {
            return res.status(400).json({ error: 'gpu_model required (string)' });
        }

        const vramNum = parseFloat(vram_gb);
        const tflopsNum = parseFloat(tflops);

        if (isNaN(vramNum) || vramNum < 1 || vramNum > 1000) {
            return res.status(400).json({ error: 'vram_gb must be a number between 1 and 1000' });
        }
        if (isNaN(tflopsNum) || tflopsNum < 1 || tflopsNum > 10000) {
            return res.status(400).json({ error: 'tflops must be a number between 1 and 10000' });
        }

        let computedTier = tier;
        if (!computedTier) {
            if (tflopsNum >= 900 && vramNum >= 40) computedTier = 'A';
            else if (tflopsNum >= 200 && vramNum >= 20) computedTier = 'B';
            else computedTier = 'C';
        } else if (!['A', 'B', 'C'].includes(String(computedTier))) {
            return res.status(400).json({ error: 'tier must be A, B, or C' });
        }

        const now = new Date().toISOString();
        const gpuModelClean = normalizeString(gpu_model, { maxLen: 255 });
        const bwNum = parseFloat(bandwidth_gbps) || null;
        const tpsNum = parseFloat(tokens_per_sec) || null;

        ensureProviderBenchmarksTable();
        ensureGpuTierColumn();
        db.prepare(
            'INSERT INTO provider_benchmarks (provider_id, gpu_model, vram_gb, tflops, bandwidth_gbps, tokens_per_sec, tier, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(provider.id, gpuModelClean, vramNum, tflopsNum, bwNum, tpsNum, computedTier, now);

        runStatement(
            'UPDATE providers SET gpu_tier = ?, updated_at = ? WHERE id = ?',
            computedTier, now, provider.id
        );

        let activation = null;
        if (provider.approval_status === 'approved') {
            activation = activateProviderById(provider.id);
            if (activation && activation.activated) {
                conversionFunnel.trackStage({
                    journey: 'provider',
                    stage: 'first_success',
                    actorType: 'provider',
                    actorId: provider.id,
                    req,
                    metadata: {
                        success_type: 'benchmark_activation',
                        tier: activation.tier || null,
                    },
                });
            }
        }

        const meetsMinimum = vramNum >= ACTIVATION_MIN_VRAM_GB && tflopsNum >= ACTIVATION_MIN_TFLOPS;

        return res.json({
            success: true,
            provider_id: provider.id,
            gpu_model: gpuModelClean,
            tier: computedTier,
            timestamp: now,
            meets_minimum_requirements: meetsMinimum,
            activation: activation
                ? { triggered: true, activated: activation.activated, tier: activation.tier, available_tiers: activation.available_tiers, reason: activation.reason }
                : { triggered: false, reason: provider.approval_status !== 'approved' ? 'Pending admin approval' : 'Not triggered' },
            message: (activation && activation.activated)
                ? 'Benchmark recorded. Provider activated to tier ' + computedTier + '.'
                : 'Benchmark recorded (tier ' + computedTier + '). ' + (meetsMinimum ? 'Awaiting approval.' : 'Hardware below minimum requirements.'),
        });
    } catch (error) {
        console.error('[providers/:id/benchmark-submit]', error);
        return res.status(500).json(safeErrorPayload(error, 'Benchmark submission failed'));
    }
});

// ============================================================================
// POST /api/providers/:id/activate — Explicit provider activation (admin/internal)
// ============================================================================
router.post('/:id/activate', function(req, res) {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        if (!isAdminRequest(req)) {
            const apiKey = normalizeString(
                req.headers['x-provider-key'] || getBearerToken(req),
                { maxLen: 128, trim: false }
            );
            if (!apiKey) return res.status(401).json({ error: 'Admin or provider API key required' });
            const p = db.get('SELECT id FROM providers WHERE id = ? AND api_key = ?', providerId, apiKey);
            if (!p) return res.status(403).json({ error: 'Access denied' });
        }

        const result = activateProviderById(providerId);

        if (result.activated) {
            conversionFunnel.trackStage({
                journey: 'provider',
                stage: 'first_success',
                actorType: 'provider',
                actorId: providerId,
                req,
                metadata: {
                    success_type: 'explicit_activation',
                    tier: result.tier || null,
                },
            });
            return res.json({
                success: true,
                provider_id: providerId,
                status: 'active',
                tier: result.tier,
                available_tiers: result.available_tiers,
                message: 'Provider ' + providerId + ' activated to tier ' + result.tier,
            });
        } else {
            const statusCode = result.reason === 'Provider not found' ? 404
                : result.reason === 'No benchmark on record' ? 422
                : result.reason === 'Already active' ? 200
                : 422;
            return res.status(statusCode).json({
                success: result.reason === 'Already active',
                provider_id: providerId,
                activated: false,
                reason: result.reason,
            });
        }
    } catch (error) {
        console.error('[providers/:id/activate]', error);
        return res.status(500).json(safeErrorPayload(error, 'Activation failed'));
    }
});

// ============================================================================
// Provider API Key Management (DCP-760)
// POST   /api/providers/:id/keys       — issue a new scoped provider API key
// GET    /api/providers/:id/keys       — list non-revoked key metadata
// DELETE /api/providers/:id/keys/:kid  — revoke a key
//
// Auth: provider's legacy api_key (x-provider-key or Bearer) OR admin token.
// Keys use format dcp_prov_<32 base62> and are SHA-256 hashed before storage.
// ============================================================================

const { generateProviderKey, listProviderKeys, revokeProviderKey } = require('../services/apiKeyService');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

function getProviderFromLegacyKey(req) {
    const legacyKey = normalizeString(
        req.headers['x-provider-key'] || getBearerToken(req),
        { maxLen: 128, trim: false }
    );
    if (!legacyKey) return null;
    return db.get('SELECT * FROM providers WHERE api_key = ? AND deleted_at IS NULL', [legacyKey]);
}

function canManageProviderKeys(req, providerId) {
    if (isAdminRequest(req)) return true;
    const provider = getProviderFromLegacyKey(req);
    return !!(provider && provider.id == providerId);
}

router.post('/:id/keys', (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });
        if (!canManageProviderKeys(req, providerId)) {
            return res.status(403).json({ error: 'Forbidden: provider key or admin token required' });
        }
        const provider = db.get('SELECT id FROM providers WHERE id = ? AND deleted_at IS NULL', [providerId]);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 128) : '';
        const { key, keyId, prefix } = generateProviderKey(providerId, label);

        return res.status(201).json({
            key,
            key_id: keyId,
            prefix,
            label: label || null,
            message: 'Save this key — it will not be shown again.',
        });
    } catch (err) {
        console.error('[providers/:id/keys POST]', err);
        return res.status(500).json({ error: 'Failed to issue API key' });
    }
});

router.get('/:id/keys', (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });
        if (!canManageProviderKeys(req, providerId)) {
            return res.status(403).json({ error: 'Forbidden: provider key or admin token required' });
        }
        const keys = listProviderKeys(providerId);
        return res.json({ keys, count: keys.length });
    } catch (err) {
        console.error('[providers/:id/keys GET]', err);
        return res.status(500).json({ error: 'Failed to list API keys' });
    }
});

router.delete('/:id/keys/:kid', (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });
        if (!canManageProviderKeys(req, providerId)) {
            return res.status(403).json({ error: 'Forbidden: provider key or admin token required' });
        }
        const revoked = revokeProviderKey(req.params.kid, providerId);
        if (!revoked) return res.status(404).json({ error: 'Key not found or already revoked' });
        return res.json({ revoked: true });
    } catch (err) {
        console.error('[providers/:id/keys DELETE]', err);
        return res.status(500).json({ error: 'Failed to revoke API key' });
    }
});

// ============================================================================
// GET /api/providers/activation-scorecard — provider readiness scorecard
// ============================================================================
// Auth:
//  - Admin: can request one provider (?provider_id=) or fleet view (no provider_id)
//  - Provider: requires x-provider-key/Bearer and returns own scorecard
router.get('/activation-scorecard', (req, res) => {
    try {
        const providerId = normalizeString(req.query.provider_id, { maxLen: 128, trim: true });
        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req) || req.query.key,
            { maxLen: 128, trim: false }
        );
        const admin = isAdminRequest(req);

        if (!admin && !apiKey) {
            return res.status(401).json({
                ready_to_serve: false,
                blockers: [{ reason_code: ACTIVATION_BLOCKER_CODES.KEY_AUTH_MISMATCH, message: 'Provider API key required' }],
            });
        }

        if (admin && !providerId) {
            const providers = db.all(
                `SELECT id, status, api_key, daemon_version, last_heartbeat, gpu_status,
                        cached_models, model_preload_status, model_preload_model, gpu_compute_capability
                 FROM providers
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 500`
            );
            const scorecards = providers.map((provider) => buildProviderActivationScorecard(provider, { authKeyProvided: true, authKeyMatched: true }));
            return res.json({
                count: scorecards.length,
                ready_count: scorecards.filter((entry) => entry.ready_to_serve).length,
                blocked_count: scorecards.filter((entry) => !entry.ready_to_serve).length,
                providers: scorecards,
                generated_at: new Date().toISOString(),
            });
        }

        const targetProvider = providerId
            ? db.get(
                `SELECT id, status, api_key, daemon_version, last_heartbeat, gpu_status,
                        cached_models, model_preload_status, model_preload_model, gpu_compute_capability
                 FROM providers
                 WHERE id = ? AND deleted_at IS NULL`,
                providerId
            )
            : db.get(
                `SELECT id, status, api_key, daemon_version, last_heartbeat, gpu_status,
                        cached_models, model_preload_status, model_preload_model, gpu_compute_capability
                 FROM providers
                 WHERE api_key = ? AND deleted_at IS NULL`,
                apiKey
            );

        if (!targetProvider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        const authKeyMatched = admin || String(targetProvider.api_key || '') === String(apiKey || '');
        const scorecard = buildProviderActivationScorecard(targetProvider, {
            authKeyProvided: Boolean(apiKey) || admin,
            authKeyMatched,
        });

        if (!scorecard.checks.key_auth_match) {
            return res.status(401).json(scorecard);
        }
        return res.json(scorecard);
    } catch (error) {
        console.error('[providers/activation-scorecard GET]', error);
        return res.status(500).json(safeErrorPayload(error, 'Failed to build activation scorecard'));
    }
});

const ACTIVATION_STATE = Object.freeze({
    NOT_STARTED: 'not_started',
    INSTALL_STARTED: 'install_started',
    HEARTBEAT_RECEIVED: 'heartbeat_received',
    READY_FOR_JOBS: 'ready_for_jobs',
    BLOCKED: 'blocked',
});

const ACTIVATION_STATE_BLOCKER = Object.freeze({
    DAEMON_NOT_DETECTED: 'daemon_not_detected',
    HEARTBEAT_MISSING: 'heartbeat_missing',
    HEARTBEAT_STALE: 'heartbeat_stale',
    APPROVAL_PENDING: 'approval_pending',
    APPROVAL_REJECTED: 'approval_rejected',
    PROVIDER_PAUSED: 'provider_paused',
    PROVIDER_SUSPENDED: 'provider_suspended',
    READINESS_PENDING: 'readiness_pending',
    READINESS_FAILED: 'readiness_failed',
    GPU_PROFILE_INCOMPLETE: 'gpu_profile_incomplete',
    PROVIDER_NOT_ONLINE: 'provider_not_online',
});

const ACTIVATION_HINTS = Object.freeze({
    install_daemon: {
        hint_key: 'install_daemon',
        hint_en: 'Install and start the provider daemon, then send the first heartbeat.',
        hint_ar: 'قم بتثبيت وتشغيل دايمون المزود ثم أرسل أول نبضة.',
    },
    send_heartbeat: {
        hint_key: 'send_heartbeat',
        hint_en: 'Start the daemon and send a heartbeat to continue onboarding.',
        hint_ar: 'شغّل الدايمون وأرسل نبضة متابعة لإكمال التهيئة.',
    },
    refresh_heartbeat: {
        hint_key: 'refresh_heartbeat',
        hint_en: 'Daemon heartbeat is stale. Restart daemon/network and send a fresh heartbeat.',
        hint_ar: 'نبضة الدايمون قديمة. أعد تشغيل الدايمون أو الشبكة وأرسل نبضة جديدة.',
    },
    wait_approval: {
        hint_key: 'wait_approval',
        hint_en: 'Provider registration is pending admin approval.',
        hint_ar: 'تسجيل المزود بانتظار موافقة الإدارة.',
    },
    fix_rejection: {
        hint_key: 'fix_rejection',
        hint_en: 'Provider was rejected. Review rejection reason and resubmit after fixes.',
        hint_ar: 'تم رفض المزود. راجع سبب الرفض وأعد التقديم بعد المعالجة.',
    },
    resume_provider: {
        hint_key: 'resume_provider',
        hint_en: 'Provider is paused. Resume provider to continue accepting jobs.',
        hint_ar: 'المزود في وضع الإيقاف. قم بالاستئناف لمتابعة استقبال الوظائف.',
    },
    contact_support: {
        hint_key: 'contact_support',
        hint_en: 'Provider is suspended. Contact support/admin to resolve account status.',
        hint_ar: 'المزود موقوف. تواصل مع الدعم أو الإدارة لمعالجة حالة الحساب.',
    },
    run_readiness_checks: {
        hint_key: 'run_readiness_checks',
        hint_en: 'Readiness checks are still running. Keep daemon online until checks pass.',
        hint_ar: 'فحوصات الجاهزية ما زالت قيد التنفيذ. أبقِ الدايمون متصلاً حتى تنجح الفحوصات.',
    },
    fix_readiness: {
        hint_key: 'fix_readiness',
        hint_en: 'Readiness checks failed. Fix failed checks and re-run readiness.',
        hint_ar: 'فشلت فحوصات الجاهزية. أصلح العناصر الفاشلة ثم أعد تشغيل فحص الجاهزية.',
    },
    complete_gpu_profile: {
        hint_key: 'complete_gpu_profile',
        hint_en: 'GPU profile is incomplete. Update GPU model/VRAM and resend heartbeat.',
        hint_ar: 'ملف تعريف GPU غير مكتمل. حدّث طراز البطاقة/الذاكرة ثم أعد إرسال النبضة.',
    },
    mark_online: {
        hint_key: 'mark_online',
        hint_en: 'Provider has heartbeat but is not online yet. Complete activation to go live.',
        hint_ar: 'تم استلام النبضة لكن المزود ليس متصلاً بعد. أكمل التفعيل للبدء.',
    },
    ready_for_jobs: {
        hint_key: 'ready_for_jobs',
        hint_en: 'Provider is fully activated and ready to accept jobs.',
        hint_ar: 'المزود مفعّل بالكامل وجاهز لاستقبال الوظائف.',
    },
});

const ACTIVATION_BLOCKER_HINT_KEY = Object.freeze({
    [ACTIVATION_STATE_BLOCKER.DAEMON_NOT_DETECTED]: 'install_daemon',
    [ACTIVATION_STATE_BLOCKER.HEARTBEAT_MISSING]: 'send_heartbeat',
    [ACTIVATION_STATE_BLOCKER.HEARTBEAT_STALE]: 'refresh_heartbeat',
    [ACTIVATION_STATE_BLOCKER.APPROVAL_PENDING]: 'wait_approval',
    [ACTIVATION_STATE_BLOCKER.APPROVAL_REJECTED]: 'fix_rejection',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_PAUSED]: 'resume_provider',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_SUSPENDED]: 'contact_support',
    [ACTIVATION_STATE_BLOCKER.READINESS_PENDING]: 'run_readiness_checks',
    [ACTIVATION_STATE_BLOCKER.READINESS_FAILED]: 'fix_readiness',
    [ACTIVATION_STATE_BLOCKER.GPU_PROFILE_INCOMPLETE]: 'complete_gpu_profile',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_NOT_ONLINE]: 'mark_online',
});

const ACTIVATION_BLOCKER_SEVERITY = Object.freeze({
    [ACTIVATION_STATE_BLOCKER.DAEMON_NOT_DETECTED]: 'soft',
    [ACTIVATION_STATE_BLOCKER.HEARTBEAT_MISSING]: 'soft',
    [ACTIVATION_STATE_BLOCKER.HEARTBEAT_STALE]: 'hard',
    [ACTIVATION_STATE_BLOCKER.APPROVAL_PENDING]: 'soft',
    [ACTIVATION_STATE_BLOCKER.APPROVAL_REJECTED]: 'hard',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_PAUSED]: 'hard',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_SUSPENDED]: 'hard',
    [ACTIVATION_STATE_BLOCKER.READINESS_PENDING]: 'soft',
    [ACTIVATION_STATE_BLOCKER.READINESS_FAILED]: 'hard',
    [ACTIVATION_STATE_BLOCKER.GPU_PROFILE_INCOMPLETE]: 'soft',
    [ACTIVATION_STATE_BLOCKER.PROVIDER_NOT_ONLINE]: 'soft',
});

function activationApiError(res, statusCode, code, error, details = {}) {
    return res.status(statusCode).json({
        error,
        code,
        statusCode,
        details,
    });
}

function resolveActivationHint(hintKey) {
    return ACTIVATION_HINTS[hintKey] || ACTIVATION_HINTS.install_daemon;
}

function collectActivationStateBlockers(provider, nowMs = Date.now()) {
    const blockers = [];
    const daemonSeen = Boolean(
        normalizeString(provider.daemon_version, { maxLen: 64 }) ||
        provider.gpu_status
    );
    const approvalStatus = normalizeString(provider.approval_status, { maxLen: 32 })?.toLowerCase() || 'pending';
    const providerStatus = normalizeString(provider.status, { maxLen: 32 })?.toLowerCase() || 'pending';
    const readinessStatus = normalizeString(provider.readiness_status, { maxLen: 32 })?.toLowerCase() || 'pending';
    const isPaused = Number(provider.is_paused || 0) === 1;

    const heartbeatAt = provider.last_heartbeat ? new Date(provider.last_heartbeat).getTime() : null;
    const hasHeartbeat = Number.isFinite(heartbeatAt);
    const heartbeatAgeSeconds = hasHeartbeat ? Math.max(0, Math.floor((nowMs - heartbeatAt) / 1000)) : null;
    const heartbeatFresh = heartbeatAgeSeconds != null && heartbeatAgeSeconds <= ACTIVATION_STALE_HEARTBEAT_SECONDS;

    const vramMb = toFiniteInt(provider.vram_mb, { min: 0, max: 1024 * 1024 })
        || toFiniteInt(provider.gpu_vram_mib, { min: 0, max: 1024 * 1024 })
        || toFiniteInt(provider.gpu_vram_mb, { min: 0, max: 1024 * 1024 })
        || 0;
    const gpuProfileComplete = Boolean(normalizeString(provider.gpu_model, { maxLen: 255 })) && vramMb > 0;

    if (!daemonSeen) blockers.push(ACTIVATION_STATE_BLOCKER.DAEMON_NOT_DETECTED);
    if (!hasHeartbeat) blockers.push(ACTIVATION_STATE_BLOCKER.HEARTBEAT_MISSING);
    if (hasHeartbeat && !heartbeatFresh) blockers.push(ACTIVATION_STATE_BLOCKER.HEARTBEAT_STALE);

    if (approvalStatus === 'pending') blockers.push(ACTIVATION_STATE_BLOCKER.APPROVAL_PENDING);
    if (approvalStatus === 'rejected') blockers.push(ACTIVATION_STATE_BLOCKER.APPROVAL_REJECTED);
    if (isPaused) blockers.push(ACTIVATION_STATE_BLOCKER.PROVIDER_PAUSED);
    if (providerStatus === 'suspended') blockers.push(ACTIVATION_STATE_BLOCKER.PROVIDER_SUSPENDED);

    if (readinessStatus === 'pending') blockers.push(ACTIVATION_STATE_BLOCKER.READINESS_PENDING);
    if (['failed', 'error', 'blocked'].includes(readinessStatus)) blockers.push(ACTIVATION_STATE_BLOCKER.READINESS_FAILED);
    if (!gpuProfileComplete) blockers.push(ACTIVATION_STATE_BLOCKER.GPU_PROFILE_INCOMPLETE);
    if (providerStatus !== 'online') blockers.push(ACTIVATION_STATE_BLOCKER.PROVIDER_NOT_ONLINE);

    return {
        blockers,
        daemonSeen,
        hasHeartbeat,
        heartbeatFresh,
        heartbeatAgeSeconds,
        gpuProfileComplete,
        approvalStatus,
        providerStatus,
        readinessStatus,
        isPaused,
    };
}

function resolveActivationState(evalResult) {
    const hardBlockers = evalResult.blockers.filter((code) => ACTIVATION_BLOCKER_SEVERITY[code] === 'hard');
    if (!evalResult.daemonSeen && !evalResult.hasHeartbeat) return ACTIVATION_STATE.NOT_STARTED;
    if (evalResult.daemonSeen && !evalResult.hasHeartbeat) return ACTIVATION_STATE.INSTALL_STARTED;
    if (evalResult.hasHeartbeat && !evalResult.heartbeatFresh) return ACTIVATION_STATE.BLOCKED;
    if (hardBlockers.length > 0) return ACTIVATION_STATE.BLOCKED;
    if (evalResult.blockers.length === 0) return ACTIVATION_STATE.READY_FOR_JOBS;
    return ACTIVATION_STATE.HEARTBEAT_RECEIVED;
}

function buildActivationStatePayload(provider, nowMs = Date.now()) {
    const evalResult = collectActivationStateBlockers(provider, nowMs);
    const activationState = resolveActivationState(evalResult);

    const blockers = evalResult.blockers.map((code) => {
        const hintKey = ACTIVATION_BLOCKER_HINT_KEY[code] || 'install_daemon';
        const hint = resolveActivationHint(hintKey);
        return {
            code,
            severity: ACTIVATION_BLOCKER_SEVERITY[code] || 'soft',
            ...hint,
        };
    });

    const nextAction = activationState === ACTIVATION_STATE.READY_FOR_JOBS
        ? resolveActivationHint('ready_for_jobs')
        : (blockers[0] || resolveActivationHint('install_daemon'));

    return {
        provider_id: provider.id,
        activation_state: activationState,
        blocker_codes: blockers.map((item) => item.code),
        blockers,
        admission: fetchLatestTierAdmissionRejection(provider.id),
        next_action: nextAction,
        signals: {
            approval_status: evalResult.approvalStatus,
            provider_status: evalResult.providerStatus,
            readiness_status: evalResult.readinessStatus,
            is_paused: evalResult.isPaused,
            daemon_seen: evalResult.daemonSeen,
            heartbeat_received: evalResult.hasHeartbeat,
            heartbeat_fresh: evalResult.heartbeatFresh,
            heartbeat_age_seconds: evalResult.heartbeatAgeSeconds,
            last_heartbeat: provider.last_heartbeat || null,
            gpu_profile_complete: evalResult.gpuProfileComplete,
        },
        generated_at: new Date(nowMs).toISOString(),
    };
}

// ============================================================================
// GET /api/providers/activation-state — canonical provider activation state
// ============================================================================
// Auth:
//   - Provider: x-provider-key / Bearer token (returns own activation state)
//   - Admin: x-admin-token + provider_id query (returns requested provider state)
router.get('/activation-state', (req, res) => {
    try {
        const providerId = normalizeString(req.query.provider_id, { maxLen: 64, trim: true });
        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req) || req.query.key,
            { maxLen: 128, trim: false }
        );
        const admin = isAdminRequest(req);

        if (!admin && !apiKey) {
            return activationApiError(
                res,
                401,
                'PROVIDER_AUTH_REQUIRED',
                'Provider API key required',
                {
                    remediation_hint: resolveActivationHint('install_daemon'),
                }
            );
        }

        if (admin && !providerId) {
            return activationApiError(
                res,
                400,
                'PROVIDER_ID_REQUIRED',
                'provider_id is required for admin activation-state lookup',
                {
                    field: 'provider_id',
                }
            );
        }

        const targetProvider = providerId
            ? db.get(
                `SELECT id, api_key, status, approval_status, is_paused, daemon_version, last_heartbeat,
                        gpu_status, readiness_status, gpu_model, vram_mb, gpu_vram_mib, gpu_vram_mb
                 FROM providers
                 WHERE id = ? AND deleted_at IS NULL`,
                providerId
            )
            : db.get(
                `SELECT id, api_key, status, approval_status, is_paused, daemon_version, last_heartbeat,
                        gpu_status, readiness_status, gpu_model, vram_mb, gpu_vram_mib, gpu_vram_mb
                 FROM providers
                 WHERE api_key = ? AND deleted_at IS NULL`,
                apiKey
            );

        if (!targetProvider) {
            return activationApiError(
                res,
                404,
                'PROVIDER_NOT_FOUND',
                'Provider not found',
                {
                    provider_id: providerId || null,
                }
            );
        }

        if (!admin && String(targetProvider.api_key || '') !== String(apiKey || '')) {
            return activationApiError(
                res,
                403,
                'PROVIDER_AUTH_FORBIDDEN',
                'Provider API key does not match the requested provider',
                {
                    remediation_hint: resolveActivationHint('install_daemon'),
                }
            );
        }

        return res.json(buildActivationStatePayload(targetProvider));
    } catch (error) {
        console.error('[providers/activation-state GET]', error);
        return activationApiError(
            res,
            500,
            'ACTIVATION_STATE_FETCH_FAILED',
            'Failed to fetch provider activation state',
            { reason: error.message }
        );
    }
});

// ============================================================================
// GET /api/providers/self-test — Provider readiness validation (DCP-802)
// ============================================================================
// Purpose: Provider calls this endpoint to validate they are ready to go live.
// Auth: Bearer <provider-key> (API key in Authorization header)
// Returns: readiness status, individual checks, and actionable next_step
router.get('/self-test', (req, res) => {
    try {
        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) {
            return res.status(401).json({
                ready: false,
                checks: {
                    key_valid: false,
                    gpu_detected: false,
                    docker_accessible: false,
                    network_reachable: false,
                    vram_available_gb: 0,
                },
                next_step: 'missing_key',
            });
        }

        const provider = db.get(
            'SELECT id, gpu_model, vram_mb, last_heartbeat, status FROM providers WHERE api_key = ? AND deleted_at IS NULL',
            apiKey
        );

        if (!provider) {
            return res.status(401).json({
                ready: false,
                checks: {
                    key_valid: false,
                    gpu_detected: false,
                    docker_accessible: false,
                    network_reachable: false,
                    vram_available_gb: 0,
                },
                next_step: 'invalid_key',
            });
        }

        // Check if GPU is detected (recorded in provider profile)
        const gpuDetected = !!(provider.gpu_model && provider.vram_mb);

        // Check if docker is accessible (has recent heartbeat activity)
        const dockerAccessible = !!provider.last_heartbeat;

        // Check if network is reachable (provider has been online recently)
        const lastHeartbeatTime = provider.last_heartbeat ? new Date(provider.last_heartbeat) : null;
        const minutesSinceHeartbeat = lastHeartbeatTime
            ? (Date.now() - lastHeartbeatTime.getTime()) / (1000 * 60)
            : null;
        const networkReachable = minutesSinceHeartbeat != null && minutesSinceHeartbeat < 5;

        // Convert VRAM to GB
        const vramGb = provider.vram_mb ? Math.round(provider.vram_mb / 1024 * 10) / 10 : 0;

        // Determine overall readiness and next step
        const allReady = gpuDetected && dockerAccessible && networkReachable && vramGb >= 4;

        let nextStep = 'activate';
        if (!gpuDetected) {
            nextStep = 'fix_gpu';
        } else if (!dockerAccessible) {
            nextStep = 'fix_docker';
        } else if (!networkReachable) {
            nextStep = 'fix_network';
        }

        res.json({
            ready: allReady,
            checks: {
                key_valid: true,
                gpu_detected: gpuDetected,
                docker_accessible: dockerAccessible,
                network_reachable: networkReachable,
                vram_available_gb: vramGb,
            },
            next_step: nextStep,
            provider_id: provider.id,
            gpu_model: provider.gpu_model || null,
            status: provider.status,
        });
    } catch (error) {
        console.error('[providers/self-test GET]', error);
        res.status(500).json(safeErrorPayload(error, 'Self-test check failed'));
    }
});

// ============================================================================
// POST /api/providers/activate — Provider activation for go-live (DCP-802)
// ============================================================================
// Purpose: Provider activates themselves after passing self-test
// Auth: Bearer <provider-key> (API key in Authorization header)
// Returns: activation status, provider info, and earnings estimate
router.post('/activate', (req, res) => {
    try {
        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                activated: false,
                reason: 'API key required',
            });
        }

        const provider = db.get(
            'SELECT id, gpu_model, vram_mb, status FROM providers WHERE api_key = ? AND deleted_at IS NULL',
            apiKey
        );

        if (!provider) {
            return res.status(401).json({
                success: false,
                activated: false,
                reason: 'Invalid API key',
            });
        }

        // Check if already online
        if (provider.status === 'online') {
            return res.status(200).json({
                success: true,
                activated: false,
                reason: 'Provider already online',
                provider_id: provider.id,
                status: 'online',
            });
        }

        // Validate minimum requirements for activation
        const vramGb = provider.vram_mb ? provider.vram_mb / 1024 : 0;
        if (!provider.gpu_model || vramGb < 4) {
            return res.status(422).json({
                success: false,
                activated: false,
                reason: 'Insufficient hardware: GPU model or VRAM < 4GB',
                provider_id: provider.id,
            });
        }

        // Set provider status to 'online' and trigger heartbeat subscription
        const now = new Date().toISOString();
        runStatement(
            'UPDATE providers SET status = ?, updated_at = ? WHERE id = ?',
            'online', now, provider.id
        );
        conversionFunnel.trackStage({
            journey: 'provider',
            stage: 'first_success',
            actorType: 'provider',
            actorId: provider.id,
            req,
            metadata: {
                success_type: 'self_activate_online',
                gpu_model: provider.gpu_model || null,
            },
        });

        // Estimate monthly earnings based on GPU model and DCP pricing
        const estimatedMonthlyEarnings = calculateEstimatedMonthlyEarnings(provider.gpu_model, 0.7);

        res.json({
            success: true,
            activated: true,
            provider_id: provider.id,
            status: 'online',
            gpu_model: provider.gpu_model,
            vram_available_gb: Math.round(vramGb * 10) / 10,
            estimated_monthly_earnings_halala: estimatedMonthlyEarnings,
            message: `Provider ${provider.id} is now online and ready to accept jobs.`,
            next_steps: [
                `Pull available job types from /api/providers/${provider.id}/jobs`,
                'Subscribe to heartbeat notifications',
                'Monitor earnings and job queue',
            ],
        });
    } catch (error) {
        console.error('[providers/activate POST]', error);
        res.status(500).json({
            success: false,
            error: 'Activation failed',
            details: error.message,
        });
    }
});

// Helper function to estimate monthly earnings based on GPU model
function calculateEstimatedMonthlyEarnings(gpuModel, utilizationRate = 0.7) {
    // Pricing data from FOUNDER-STRATEGIC-BRIEF
    // RTX 4090 = $0.267/hr = 26.7 halalas/hour
    const pricePerHourHalala = {
        'RTX 4090': 26.7,
        'RTX 4080': 18.9,
        'RTX 3090': 13.4,
        'H100': 53.4,
        'H200': 66.75,
        'A100': 40.05,
        'L40S': 26.7,
    };

    const gpuNormalized = gpuModel ? gpuModel.toUpperCase() : '';
    let baseHourlyHalala = pricePerHourHalala['RTX 4090'];

    for (const [modelKey, price] of Object.entries(pricePerHourHalala)) {
        if (gpuNormalized.includes(modelKey)) {
            baseHourlyHalala = price;
            break;
        }
    }

    const hoursPerMonth = 30 * 24;
    const monthlyBeforeUtilization = baseHourlyHalala * hoursPerMonth;
    const monthlyWithUtilization = Math.round(monthlyBeforeUtilization * utilizationRate);

    return monthlyWithUtilization;
}

// ============================================================================
// Provider Online / Offline API (DCP-877)
//
// POST /api/providers/:id/online   — provider self-declares readiness
// POST /api/providers/:id/offline  — provider graceful offline
// GET  /api/providers/online       — public listing (sanitized) + admin full view
//
// Fixes the "43 registered, 0 active" gap: providers register with
// approval_status=pending and cannot heartbeat. /online grants self-approval
// for MVP so providers can immediately appear in the marketplace.
// ============================================================================

const ONLINE_EXPIRY_SECONDS = 90; // heartbeat must arrive within this window

// POST /api/providers/:id/online
// Provider calls this once to declare availability. Sets approval_status=approved
// and status=online so the marketplace immediately shows the provider.
// Body: { gpuModel?, vramGb?, loadedModels?, maxConcurrentJobs? }
// Auth: x-provider-key or Bearer token
router.post('/:id/online', (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) return res.status(401).json({ error: 'API key required (x-provider-key or Bearer)' });

        const provider = db.get(
            'SELECT id, name, status FROM providers WHERE id = ? AND api_key = ? AND deleted_at IS NULL',
            providerId, apiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid provider ID or API key' });

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const gpuModel = normalizeString(body.gpuModel || body.gpu_model, { maxLen: 200 });
        const vramGb = toFiniteInt(body.vramGb ?? body.vram_gb, { min: 0, max: 1024 });
        const loadedModels = Array.isArray(body.loadedModels ?? body.loaded_models)
            ? (body.loadedModels ?? body.loaded_models).map((m) => normalizeString(m, { maxLen: 200 })).filter(Boolean)
            : [];

        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + ONLINE_EXPIRY_SECONDS * 1000).toISOString();

        // Build update fields — only update non-null provided values
        const updates = [
            "status = 'online'",
            "approval_status = 'approved'",
            'last_heartbeat = ?',
            'updated_at = ?',
        ];
        const params = [now, now];

        if (gpuModel) { updates.push('gpu_model = ?'); params.push(gpuModel); }
        if (vramGb != null) { updates.push('vram_gb = ?'); params.push(vramGb); }
        if (loadedModels.length > 0) { updates.push('cached_models = ?'); params.push(JSON.stringify(loadedModels)); }

        params.push(provider.id);
        runStatement(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`, ...params);

        // Log heartbeat for health tracking
        try {
            runStatement(
                'INSERT INTO heartbeat_log (provider_id, received_at, gpu_util_pct) VALUES (?, ?, ?)',
                provider.id, now, null
            );
        } catch (_) { /* heartbeat_log table may differ — non-fatal */ }

        console.log(`[providers/:id/online] Provider ${provider.id} (${provider.name}) came online`);

        return res.json({
            online: true,
            provider_id: provider.id,
            status: 'online',
            expires_at: expiresAt,
            heartbeat_interval_seconds: Math.floor(ONLINE_EXPIRY_SECONDS / 3),
            loaded_models: loadedModels,
            message: `Provider online. Send heartbeat every ${Math.floor(ONLINE_EXPIRY_SECONDS / 3)}s to stay live.`,
        });
    } catch (error) {
        console.error('[providers/:id/online]', error);
        return res.status(500).json({ error: 'Failed to bring provider online' });
    }
});

// POST /api/providers/:id/offline
// Provider gracefully declares itself offline. Stops new job assignments.
// Body: { reason? }
// Auth: x-provider-key or Bearer token
router.post('/:id/offline', (req, res) => {
    try {
        const providerId = normalizeString(req.params.id, { maxLen: 128, trim: true });
        if (!providerId) return res.status(400).json({ error: 'Provider ID required' });

        const apiKey = normalizeString(
            req.headers['x-provider-key'] || getBearerToken(req),
            { maxLen: 128, trim: false }
        );
        if (!apiKey) return res.status(401).json({ error: 'API key required (x-provider-key or Bearer)' });

        const provider = db.get(
            'SELECT id, name, status FROM providers WHERE id = ? AND api_key = ? AND deleted_at IS NULL',
            providerId, apiKey
        );
        if (!provider) return res.status(401).json({ error: 'Invalid provider ID or API key' });

        const now = new Date().toISOString();
        runStatement(
            "UPDATE providers SET status = 'offline', updated_at = ? WHERE id = ?",
            now, provider.id
        );

        console.log(`[providers/:id/offline] Provider ${provider.id} (${provider.name}) went offline`);

        return res.json({
            offline: true,
            provider_id: provider.id,
            status: 'offline',
            offline_at: now,
        });
    } catch (error) {
        console.error('[providers/:id/offline]', error);
        return res.status(500).json({ error: 'Failed to bring provider offline' });
    }
});

// ---- GET /api/providers/:id/stake-status -- DCP-920 --------------------------------
// Provider stake status check. Auth: own API key or admin. Used by onboarding wizard.
router.get('/:id/stake-status', async (req, res) => {
    try {
        const providerId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(providerId) || providerId < 1) {
            return res.status(400).json({ error: 'Invalid provider id' });
        }
        if (!isAdminRequest(req)) {
            const apiKey = getBearerToken(req) || req.query?.api_key;
            if (!apiKey) return res.status(401).json({ error: 'Authentication required' });
            const p = db.get('SELECT id FROM providers WHERE id = ? AND api_key = ?', providerId, apiKey);
            if (!p) return res.status(403).json({ error: 'Access denied' });
        }
        const provider = db.get(
            'SELECT id, evm_wallet_address, stake_status, stake_amount_wei, gpu_tier FROM providers WHERE id = ?',
            providerId
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const tier = Number(provider.gpu_tier) || 0;
        let stakeAmount = BigInt(provider.stake_amount_wei || '0');
        let hasMinimumStake = provider.stake_status === 'active';
        let minimumRequired = 0n;
        let liveCheckPerformed = false;

        if (process.env.PROVIDER_STAKE_ADDRESS) {
            try {
                const { verifyProviderStake, getTierMinimumStake } =
                    await import('../blockchain/stake-verifier.mjs');
                minimumRequired = getTierMinimumStake(tier);
                const result = await verifyProviderStake(providerId);
                stakeAmount = result.stakeAmount;
                hasMinimumStake = result.hasMinimumStake;
                liveCheckPerformed = true;
            } catch (importErr) {
                console.warn('[stake-status] Live check failed:', importErr.message);
            }
        } else {
            try {
                const { getTierMinimumStake } = await import('../blockchain/stake-verifier.mjs');
                minimumRequired = getTierMinimumStake(tier);
                hasMinimumStake = stakeAmount >= minimumRequired && provider.stake_status === 'active';
            } catch (_) { /* stake-verifier unavailable */ }
        }

        const shortfall = minimumRequired > stakeAmount ? minimumRequired - stakeAmount : 0n;
        return res.json({
            providerId,
            walletAddress: provider.evm_wallet_address || null,
            stakeStatus: provider.stake_status || 'none',
            stakeAmount: stakeAmount.toString(),
            minimumRequired: minimumRequired.toString(),
            hasMinimumStake,
            shortfall: shortfall.toString(),
            gpuTier: tier,
            liveCheckPerformed,
            requireStake: process.env.REQUIRE_STAKE === 'true',
        });
    } catch (error) {
        console.error('[providers/:id/stake-status]', error);
        return res.status(500).json({ error: 'Failed to fetch stake status' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Generate referral code for authenticated provider
router.get('/me/referral-code', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id, referral_code FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    let code = provider.referral_code;
    if (!code) {
        code = 'DCP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        runStatement('UPDATE providers SET referral_code = ? WHERE id = ?', code, provider.id);
    }

    const stats = db.get(`
        SELECT COUNT(*) as total_referrals,
               COALESCE(SUM(total_bonus_halala), 0) as total_bonus_halala
        FROM referrals WHERE referrer_id = ?
    `, provider.id) || { total_referrals: 0, total_bonus_halala: 0 };

    res.json({
        referral_code: code,
        referral_link: `https://dcp.sa/provider/register?ref=${code}`,
        total_referrals: stats.total_referrals,
        total_bonus_sar: (stats.total_bonus_halala / 100).toFixed(2),
    });
});

// List my referrals
router.get('/me/referrals', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const referrals = db.all(`
        SELECT r.*, p.name as referred_name, p.gpu_model, p.status as provider_status
        FROM referrals r
        JOIN providers p ON p.id = r.referred_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC
    `, provider.id);

    res.json({ referrals });
});

// Apply referral code during registration
router.post('/apply-referral', (req, res) => {
    const { referral_code, new_provider_id } = req.body;
    if (!referral_code || !new_provider_id) {
        return res.status(400).json({ error: 'referral_code and new_provider_id required' });
    }

    const referrer = db.get('SELECT id, name FROM providers WHERE referral_code = ?', referral_code);
    if (!referrer) return res.status(404).json({ error: 'Invalid referral code' });
    if (referrer.id === new_provider_id) return res.status(400).json({ error: 'Cannot refer yourself' });

    const existing = db.get('SELECT id FROM referrals WHERE referrer_id = ? AND referred_id = ?',
        referrer.id, new_provider_id);
    if (existing) return res.status(409).json({ error: 'Referral already exists' });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    runStatement(`INSERT INTO referrals (referrer_id, referred_id, referral_code, bonus_pct, bonus_duration_days, expires_at)
            VALUES (?, ?, ?, 5.0, 30, ?)`,
        referrer.id, new_provider_id, referral_code, expiresAt);
    runStatement('UPDATE providers SET referred_by = ? WHERE id = ?', referrer.id, new_provider_id);

    res.json({ success: true, referrer_name: referrer.name, bonus_pct: 5.0, duration_days: 30 });
});


// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER GROUPS / FLEET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Create a provider group
router.post('/groups', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name required' });

    const result = runStatement(
        `INSERT INTO provider_groups (name, owner_id, description) VALUES (?, ?, ?)`,
        name, provider.id, description || null
    );

    runStatement('UPDATE providers SET group_id = ?, group_role = ? WHERE id = ?',
        result.lastInsertRowid, 'admin', provider.id);

    res.status(201).json({
        group_id: result.lastInsertRowid,
        name,
        owner_id: provider.id,
    });
});

// List my groups
router.get('/groups', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id, group_id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const owned = db.all(`
        SELECT g.*,
            (SELECT COUNT(*) FROM providers p WHERE p.group_id = g.id) as member_count,
            (SELECT COALESCE(SUM(p.total_earnings_halala), 0) FROM providers p WHERE p.group_id = g.id) as group_earnings_halala
        FROM provider_groups g
        WHERE g.owner_id = ?
        ORDER BY g.created_at DESC
    `, provider.id);

    let membership = null;
    if (provider.group_id) {
        membership = db.get(`
            SELECT g.*,
                (SELECT COUNT(*) FROM providers p WHERE p.group_id = g.id) as member_count
            FROM provider_groups g WHERE g.id = ?
        `, provider.group_id);
    }

    res.json({ owned_groups: owned, membership });
});

// Get group details with members
router.get('/groups/:groupId', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const group = db.get('SELECT * FROM provider_groups WHERE id = ?', req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (group.owner_id !== provider.id) {
        const isMember = db.get('SELECT id FROM providers WHERE id = ? AND group_id = ?',
            provider.id, group.id);
        if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });
    }

    const members = db.all(`
        SELECT id, name, gpu_model, gpu_count, vram_gb, status, group_role,
               total_earnings_halala, total_jobs, created_at
        FROM providers WHERE group_id = ?
        ORDER BY group_role DESC, created_at ASC
    `, group.id);

    const stats = {
        total_gpus: members.reduce((sum, m) => sum + (m.gpu_count || 1), 0),
        total_vram_gb: members.reduce((sum, m) => sum + (m.vram_gb || 0), 0),
        total_earnings_sar: members.reduce((sum, m) => sum + (m.total_earnings_halala || 0), 0) / 100,
        total_jobs: members.reduce((sum, m) => sum + (m.total_jobs || 0), 0),
        online_count: members.filter(m => m.status === 'online').length,
    };

    res.json({ group, members, stats });
});

// Add member to group
router.post('/groups/:groupId/members', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const group = db.get('SELECT * FROM provider_groups WHERE id = ? AND owner_id = ?',
        req.params.groupId, provider.id);
    if (!group) return res.status(403).json({ error: 'Not group owner' });

    const { email, provider_id } = req.body;
    let target;
    if (email) {
        target = db.get('SELECT id, name, group_id FROM providers WHERE email = ?', email);
    } else if (provider_id) {
        target = db.get('SELECT id, name, group_id FROM providers WHERE id = ?', provider_id);
    }
    if (!target) return res.status(404).json({ error: 'Provider not found' });
    if (target.group_id) return res.status(409).json({ error: 'Provider already in a group' });

    runStatement('UPDATE providers SET group_id = ?, group_role = ? WHERE id = ?',
        group.id, 'member', target.id);

    res.json({ success: true, added: target.name, group_id: group.id });
});

// Remove member from group
router.delete('/groups/:groupId/members/:memberId', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const group = db.get('SELECT * FROM provider_groups WHERE id = ? AND owner_id = ?',
        req.params.groupId, provider.id);
    if (!group) return res.status(403).json({ error: 'Not group owner' });

    const memberId = parseInt(req.params.memberId);
    if (memberId === provider.id) return res.status(400).json({ error: 'Cannot remove yourself (owner)' });

    runStatement('UPDATE providers SET group_id = NULL, group_role = NULL WHERE id = ? AND group_id = ?',
        memberId, group.id);

    res.json({ success: true, removed_id: memberId });
});

// Group aggregate earnings
router.get('/groups/:groupId/earnings', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const group = db.get('SELECT * FROM provider_groups WHERE id = ?', req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner_id !== provider.id) return res.status(403).json({ error: 'Not group owner' });

    const memberEarnings = db.all(`
        SELECT id, name, gpu_model, total_earnings_halala, total_jobs
        FROM providers WHERE group_id = ?
        ORDER BY total_earnings_halala DESC
    `, group.id);

    const total = memberEarnings.reduce((sum, m) => sum + (m.total_earnings_halala || 0), 0);

    res.json({
        group_id: group.id,
        group_name: group.name,
        total_earnings_sar: (total / 100).toFixed(2),
        members: memberEarnings.map(m => ({
            ...m,
            earnings_sar: ((m.total_earnings_halala || 0) / 100).toFixed(2),
        })),
    });
});


// ═══════════════════════════════════════════════════════════════════════════
// POWER CONFIG DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════

// Default power config template — providers can override locally
const DEFAULT_POWER_CONFIG = {
    electricity_cost_kwh: 0.076,    // USD/kWh — US average default
    gpu_tdp_watts: 350,             // Watts — conservative default
    min_profit_margin_pct: 10,      // require 10% margin over electricity cost
    enabled: false,                 // disabled by default until provider configures
};

// Regional electricity rate presets
const REGIONAL_POWER_PRESETS = {
    'sa-ccsez':      { electricity_cost_kwh: 0.014, label: 'Saudi Arabia (CCSEZ)' },
    'sa-industrial': { electricity_cost_kwh: 0.019, label: 'Saudi Arabia (Industrial)' },
    'us':            { electricity_cost_kwh: 0.076, label: 'United States (Average)' },
    'eu':            { electricity_cost_kwh: 0.178, label: 'EU (Average)' },
    'uk':            { electricity_cost_kwh: 0.293, label: 'United Kingdom' },
    'ae':            { electricity_cost_kwh: 0.028, label: 'UAE (Average)' },
};

// GPU TDP lookup for auto-detection
const GPU_TDP_MAP = {
    'RTX 3060': 170, 'RTX 3070': 220, 'RTX 3080': 320, 'RTX 3090': 350,
    'RTX 4070': 200, 'RTX 4080': 320, 'RTX 4090': 450,
    'RTX 5090': 575, 'A100': 400, 'H100': 700, 'H200': 700, 'L40S': 350,
};

// Get power config template for a provider (pre-filled with their GPU's TDP)
router.get('/me/power-config', (req, res) => {
    const apiKey = req.query.key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const provider = db.get('SELECT id, gpu_model, location_country FROM providers WHERE api_key = ?', apiKey);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    // Auto-detect GPU TDP from model
    let gpuTdp = DEFAULT_POWER_CONFIG.gpu_tdp_watts;
    if (provider.gpu_model) {
        for (const [model, tdp] of Object.entries(GPU_TDP_MAP)) {
            if (provider.gpu_model.toUpperCase().includes(model.toUpperCase())) {
                gpuTdp = tdp;
                break;
            }
        }
    }

    // Auto-detect region rate
    let regionRate = DEFAULT_POWER_CONFIG.electricity_cost_kwh;
    const country = (provider.location_country || '').toLowerCase();
    if (country.includes('saudi') || country === 'sa') regionRate = 0.019;
    else if (country.includes('emirates') || country === 'ae') regionRate = 0.028;
    else if (country.includes('united kingdom') || country === 'gb' || country === 'uk') regionRate = 0.293;

    const config = {
        ...DEFAULT_POWER_CONFIG,
        gpu_tdp_watts: gpuTdp,
        electricity_cost_kwh: regionRate,
        enabled: true,
    };

    res.json({
        config,
        presets: REGIONAL_POWER_PRESETS,
        instructions: 'Save this as ~/dcp-provider/power_config.json on your provider machine. The daemon will read it on next heartbeat cycle.',
    });
});

// Admin: broadcast recommended power configs for all providers
// Audit M4 — token compare goes through secureTokenEqual (timing-safe).
router.post('/admin/broadcast-power-config', (req, res) => {
    const { secureTokenEqual, normalizeCredential } = require('../middleware/auth');
    const provided = normalizeCredential(req.headers['x-admin-token'] || req.query.admin_token);
    const expected = normalizeCredential(process.env.DC1_ADMIN_TOKEN);
    if (!secureTokenEqual(provided, expected)) {
        return res.status(403).json({ error: 'Admin token required' });
    }

    const { provider_id, region } = req.body;

    // If targeting a specific provider
    if (provider_id) {
        const provider = db.get('SELECT id, gpu_model FROM providers WHERE id = ?', provider_id);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        try {
            db.prepare('UPDATE providers SET power_config_json = ? WHERE id = ?')
                .run(JSON.stringify(req.body.config || DEFAULT_POWER_CONFIG), provider_id);
        } catch {
            // Column may not exist yet — daemon reads from local file
        }

        return res.json({ success: true, message: `Power config set for provider ${provider_id}` });
    }

    // Broadcast: list all providers with their recommended power configs
    const providers = db.all(`
        SELECT id, name, gpu_model, location_country, status
        FROM providers WHERE status IN ('online', 'idle', 'offline')
        ORDER BY id
    `);

    const configs = providers.map(p => {
        const preset = region ? REGIONAL_POWER_PRESETS[region] : null;
        let gpuTdp = DEFAULT_POWER_CONFIG.gpu_tdp_watts;
        if (p.gpu_model) {
            for (const [model, tdp] of Object.entries(GPU_TDP_MAP)) {
                if (p.gpu_model.toUpperCase().includes(model.toUpperCase())) {
                    gpuTdp = tdp;
                    break;
                }
            }
        }
        return {
            provider_id: p.id,
            name: p.name,
            gpu_model: p.gpu_model,
            status: p.status,
            recommended_config: {
                ...DEFAULT_POWER_CONFIG,
                gpu_tdp_watts: gpuTdp,
                electricity_cost_kwh: preset ? preset.electricity_cost_kwh : DEFAULT_POWER_CONFIG.electricity_cost_kwh,
                enabled: true,
            },
        };
    });

    res.json({
        total_providers: configs.length,
        configs,
        note: 'Power configs are recommendations. Providers save locally as ~/dcp-provider/power_config.json.',
    });
});


// ============================================================================
// POST /api/providers/wg/register — WireGuard auto-provisioning
// Accepts a provider's WG public key, assigns next available 10.8.0.X mesh IP,
// generates a per-peer PSK, adds the peer to the server's wg0 interface, and
// returns the full WG config the client needs.
//
// Auth: x-provider-key header or ?key= query param (same pattern as /status)
// Body: { public_key: "base64..." }
// Returns: { ip, server_pubkey, server_endpoint, psk?, already_registered? }
// ============================================================================
router.post('/wg/register', async (req, res) => {
    try {
        // ── HMAC validation (warn-only until all daemons send signatures) ──
        const hmacResult = verifyHeartbeatHmac(req);
        if (!hmacResult.valid) {
            console.warn(`[wg/register] HMAC warning: ${hmacResult.reason}`);
            // Continue — API key auth is sufficient for now.
            // TODO: enforce once DC1_HMAC_SECRET is set to a real value.
        }

        const api_key = req.headers['x-provider-key'] || req.query.key;
        if (!api_key) {
            return res.status(401).json({ error: 'API key required (x-provider-key header or ?key= query)' });
        }

        const provider = db.get(
            'SELECT id, wg_mesh_ip, wg_public_key, wg_last_rotation_at FROM providers WHERE api_key = ? AND deleted_at IS NULL',
            [api_key]
        );
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        const { public_key, rotate } = req.body || {};
        const cleanPubKey = normalizeString(public_key, { maxLen: 64, trim: true });
        if (!cleanPubKey) {
            return res.status(400).json({ error: 'public_key required (base64-encoded WireGuard public key)' });
        }

        // Validate base64 format (WG public keys are 44 chars base64 = 32 bytes)
        if (!/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(cleanPubKey)) {
            return res.status(400).json({ error: 'public_key must be a valid base64-encoded WireGuard key' });
        }

        const WG_SERVER_PUBKEY = 'zVxlVgKwnxq4Z9l6jGgD0yMJH5meHrlodJYyRHrL+wM=';
        const WG_SERVER_ENDPOINT = '76.13.179.86:51820';
        // Tier 2 fallback (UDP/443). Activated by setting these env vars on
        // the VPS after `wg-quick up wg1`. When absent, the response shape is
        // identical to Tier 1 — daemons just don't see the fallback fields.
        const WG_FALLBACK_ENDPOINT = (process.env.DCP_WG_FALLBACK_ENDPOINT || '').trim() || null;
        const WG_FALLBACK_PUBKEY = (process.env.DCP_WG_FALLBACK_PUBKEY || '').trim() || WG_SERVER_PUBKEY;
        const WG_FALLBACK_TUNNEL_TARGET = (process.env.DCP_WG_FALLBACK_TUNNEL_TARGET || '10.9.0.1').trim();
        const { execSync, execFileSync } = require('child_process');

        // ── Key rotation path ───────────────────────────────────────────
        if (rotate === true && provider.wg_mesh_ip && provider.wg_public_key) {
            // Rate limit: max 1 rotation per 24 hours
            if (provider.wg_last_rotation_at) {
                const lastRotation = new Date(provider.wg_last_rotation_at).getTime();
                const hoursSince = (Date.now() - lastRotation) / (1000 * 60 * 60);
                if (hoursSince < 24) {
                    return res.status(429).json({
                        error: 'Key rotation rate limited',
                        detail: `Last rotation was ${Math.round(hoursSince)}h ago. Max 1 per 24h.`,
                    });
                }
            }

            const oldPubKey = provider.wg_public_key;
            const keepIp = provider.wg_mesh_ip;

            // Remove old peer from wg0
            try {
                // Audit H1 (command injection): use execFileSync array
                // form + re-validate oldPubKey from DB before passing to
                // shell. Even though all DB writers go through the
                // 42-44-char base64 regex today, a future direct UPDATE
                // (admin tool, migration script) could put `"$(rm -rf /)`
                // payload into wg_public_key and we'd run it as root.
                if (!/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(String(oldPubKey || ''))) {
                    throw new Error('invalid oldPubKey shape — refusing to shell out');
                }
                execFileSync('wg', ['set', 'wg0', 'peer', oldPubKey, 'remove'], { timeout: 5000 });
                console.log(`[wg/register] Removed old peer ${oldPubKey} for provider ${provider.id} (rotation)`);
            } catch (e) {
                console.warn(`[wg/register] Failed to remove old peer (may already be gone): ${e.message}`);
            }

            // Generate new PSK
            let psk;
            try {
                psk = execSync('wg genpsk', { timeout: 5000 }).toString().trim();
            } catch (e) {
                console.error('[wg/register] Failed to generate PSK during rotation:', e.message);
                return res.status(500).json({ error: 'Failed to generate PSK during rotation' });
            }

            // Add new peer with same IP
            try {
                const pskPath = `/tmp/wg_psk_${provider.id}_${Date.now()}`;
                fs.writeFileSync(pskPath, psk + '\n', { mode: 0o600 });
                execSync(
                    `wg set wg0 peer "${cleanPubKey}" preshared-key ${pskPath} allowed-ips ${keepIp}/32 persistent-keepalive 25`,
                    { timeout: 5000 }
                );
                execSync('wg-quick save wg0', { timeout: 5000 });

                // Mirror the rotated peer onto wg1 (UDP/443 fallback) too.
                // Without this, a key rotation would leave wg1 advertising the
                // OLD pubkey while the daemon now uses the new one — a daemon
                // that's already on wg1 would silently lose its tunnel.
                if (WG_FALLBACK_ENDPOINT) {
                    try {
                        // Remove old peer from wg1 (best-effort) before adding new one.
                        // Same H1 defence as wg0 — array form + key shape re-check.
                        try {
                            if (!/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(String(oldPubKey || ''))) {
                                throw new Error('invalid oldPubKey shape — refusing to shell out');
                            }
                            execFileSync('wg', ['set', 'wg1', 'peer', oldPubKey, 'remove'], { timeout: 5000 });
                        }
                        catch (_) { /* old peer may not exist on wg1; ignore */ }
                        const mirroredIp = keepIp.replace(/^10\.8\./, '10.9.');
                        execSync(
                            `wg set wg1 peer "${cleanPubKey}" preshared-key ${pskPath} allowed-ips ${mirroredIp}/32 persistent-keepalive 25`,
                            { timeout: 5000 }
                        );
                        execSync('wg-quick save wg1', { timeout: 5000 });
                        console.log(`[wg/register] Rotated peer mirrored onto wg1 as ${mirroredIp}`);
                    } catch (mirrorErr) {
                        console.error(`[wg/register] wg1 rotation mirror failed (non-fatal): ${mirrorErr.message}`);
                    }
                }

                try { fs.unlinkSync(pskPath); } catch (_) {}
            } catch (e) {
                console.error('[wg/register] Failed to add rotated peer:', e.message);
                return res.status(500).json({ error: 'Failed to add rotated WG peer: ' + e.message });
            }

            // Update DB with new key + rotation timestamp
            runStatement(
                'UPDATE providers SET wg_public_key = ?, wg_last_rotation_at = ? WHERE id = ?',
                cleanPubKey, new Date().toISOString(), provider.id
            );

            console.log(`[wg/register] Provider ${provider.id} rotated WG key, kept IP ${keepIp}`);

            return res.json({
                ip: keepIp,
                server_pubkey: WG_SERVER_PUBKEY,
                server_endpoint: WG_SERVER_ENDPOINT,
                psk: psk,
                rotated: true,
                ...(WG_FALLBACK_ENDPOINT ? {
                    fallback_endpoint: WG_FALLBACK_ENDPOINT,
                    fallback_server_public_key: WG_FALLBACK_PUBKEY,
                    fallback_tunnel_target: WG_FALLBACK_TUNNEL_TARGET,
                    fallback_subnet: '10.9.0.0/24',
                } : {}),
            });
        }

        // ── Normal registration path (unchanged) ────────────────────────

        // Idempotent: if provider already has a WG IP and matching key, return existing config
        if (provider.wg_mesh_ip && provider.wg_public_key === cleanPubKey) {
            console.log(`[wg/register] Provider ${provider.id} already registered with IP ${provider.wg_mesh_ip}`);
            return res.json({
                ip: provider.wg_mesh_ip,
                server_pubkey: WG_SERVER_PUBKEY,
                server_endpoint: WG_SERVER_ENDPOINT,
                already_registered: true,
                ...(WG_FALLBACK_ENDPOINT ? {
                    fallback_endpoint: WG_FALLBACK_ENDPOINT,
                    fallback_server_public_key: WG_FALLBACK_PUBKEY,
                    fallback_tunnel_target: WG_FALLBACK_TUNNEL_TARGET,
                    fallback_subnet: '10.9.0.0/24',
                } : {}),
            });
        }

        // Assign next available IP in 10.8.0.0/24
        // .1 = server, .2 = reserved (Fadi), start allocating from .3
        const usedIps = db.all("SELECT wg_mesh_ip FROM providers WHERE wg_mesh_ip IS NOT NULL");
        const usedSet = new Set(usedIps.map(r => r.wg_mesh_ip));
        let assignedIp = null;
        for (let i = 3; i < 255; i++) {
            const candidate = `10.8.0.${i}`;
            if (!usedSet.has(candidate)) {
                assignedIp = candidate;
                break;
            }
        }
        if (!assignedIp) {
            return res.status(503).json({ error: 'No available mesh IPs in 10.8.0.0/24 (subnet full)' });
        }

        // Generate PSK on the server
        let psk;
        try {
            psk = execSync('wg genpsk', { timeout: 5000 }).toString().trim();
        } catch (e) {
            console.error('[wg/register] Failed to generate PSK:', e.message);
            return res.status(500).json({ error: 'Failed to generate PSK — is wireguard-tools installed on the server?' });
        }

        // Add peer to WG interface
        try {
            const pskPath = `/tmp/wg_psk_${provider.id}_${Date.now()}`;
            fs.writeFileSync(pskPath, psk + '\n', { mode: 0o600 });
            execSync(
                `wg set wg0 peer "${cleanPubKey}" preshared-key ${pskPath} allowed-ips ${assignedIp}/32 persistent-keepalive 25`,
                { timeout: 5000 }
            );
            // Persist the config so it survives wg0 restarts
            execSync('wg-quick save wg0', { timeout: 5000 });

            // ── Mirror peer onto wg1 (UDP/443 fallback) when configured ──
            // wg1 is only present on the VPS when the operator provisioned
            // it; backend signals readiness via DCP_WG_FALLBACK_ENDPOINT.
            // The mirrored peer uses the SAME pubkey + PSK but a swapped
            // mesh IP (10.8.0.N → 10.9.0.N) so daemons on broken-NAT
            // links can fall over without re-authenticating.
            if (WG_FALLBACK_ENDPOINT) {
                try {
                    const mirroredIp = assignedIp.replace(/^10\.8\./, '10.9.');
                    execSync(
                        `wg set wg1 peer "${cleanPubKey}" preshared-key ${pskPath} allowed-ips ${mirroredIp}/32 persistent-keepalive 25`,
                        { timeout: 5000 }
                    );
                    execSync('wg-quick save wg1', { timeout: 5000 });
                    console.log(`[wg/register] Mirrored ${cleanPubKey.slice(0,12)}… onto wg1 as ${mirroredIp}`);
                } catch (mirrorErr) {
                    // Don't fail the request if the fallback mirror fails —
                    // primary wg0 already succeeded. Just log loudly.
                    console.error(`[wg/register] wg1 mirror failed (non-fatal): ${mirrorErr.message}`);
                }
            }

            // Clean up temp PSK file
            try { fs.unlinkSync(pskPath); } catch (_) {}
        } catch (e) {
            console.error('[wg/register] Failed to add WG peer:', e.message);
            return res.status(500).json({ error: 'Failed to add WG peer: ' + e.message });
        }

        // Store in DB
        runStatement(
            'UPDATE providers SET wg_mesh_ip = ?, wg_public_key = ? WHERE id = ?',
            assignedIp, cleanPubKey, provider.id
        );

        console.log(`[wg/register] Provider ${provider.id} assigned WG IP ${assignedIp}`);

        res.json({
            ip: assignedIp,
            server_pubkey: WG_SERVER_PUBKEY,
            server_endpoint: WG_SERVER_ENDPOINT,
            psk: psk,
            ...(WG_FALLBACK_ENDPOINT ? {
                fallback_endpoint: WG_FALLBACK_ENDPOINT,
                fallback_server_public_key: WG_FALLBACK_PUBKEY,
                fallback_tunnel_target: WG_FALLBACK_TUNNEL_TARGET,
                fallback_subnet: '10.9.0.0/24',
            } : {}),
        });
    } catch (error) {
        console.error('[wg/register] Unexpected error:', error);
        res.status(500).json(safeErrorPayload('WG registration failed'));
    }
});


// ============================================================================
// POST /api/providers/wg/install-config
// One-shot installer endpoint. Generates an ephemeral keypair server-side
// (so the installer doesn't have to run wg genkey), registers the public
// half as a peer at a fresh mesh IP, returns a complete, paste-ready
// wg0.conf for the installer to drop into /etc/wireguard/wg0.conf.
//
// Why this exists: every previous installer path (Python daemon, old
// agent.sh, Nexus's setup script) generated a keypair on the box, then
// either skipped the server-side peer registration or skipped writing
// the conf with the returned PSK. Result: providers report "DCP Provider
// is LIVE" while WG never handshakes. This endpoint collapses the chain
// into one HTTP call so there's no place to drop pieces.
//
// Auth: x-provider-key. Idempotent — repeated calls return the SAME
// config (same keypair, same PSK, same IP) until rotated.
// ============================================================================
router.post('/wg/install-config', async (req, res) => {
    try {
        const { execSync, execFileSync } = require('child_process');
        const WG_SERVER_PUBKEY = 'zVxlVgKwnxq4Z9l6jGgD0yMJH5meHrlodJYyRHrL+wM=';
        const WG_SERVER_ENDPOINT = '76.13.179.86:51820';
        const api_key = req.headers['x-provider-key'] || req.query.key;
        if (!api_key) {
            return res.status(401).json({ error: 'x-provider-key header required' });
        }
        const provider = db.get(
            'SELECT id, name, wg_mesh_ip, wg_public_key FROM providers WHERE api_key = ? AND deleted_at IS NULL',
            [api_key]
        );
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found for this api_key' });
        }

        // Generate keypair server-side. The private key NEVER leaves this
        // response — the installer writes it to /etc/wireguard/wg0.conf
        // with mode 0600 and we don't keep a copy.
        let privKey, pubKey, psk;
        try {
            privKey = execSync('wg genkey', { timeout: 5000 }).toString().trim();
            pubKey = execSync(`echo "${privKey}" | wg pubkey`, { timeout: 5000 }).toString().trim();
            psk = execSync('wg genpsk', { timeout: 5000 }).toString().trim();
        } catch (e) {
            console.error('[wg/install-config] keygen failed:', e.message);
            return res.status(500).json({ error: 'WireGuard tools missing on server: ' + e.message });
        }

        // Re-use existing IP if provider already has one, else allocate.
        let assignedIp = provider.wg_mesh_ip;
        if (!assignedIp) {
            const usedIps = db.all("SELECT wg_mesh_ip FROM providers WHERE wg_mesh_ip IS NOT NULL");
            const usedSet = new Set(usedIps.map(r => r.wg_mesh_ip));
            for (let i = 3; i < 255; i++) {
                const candidate = `10.8.0.${i}`;
                if (!usedSet.has(candidate)) { assignedIp = candidate; break; }
            }
            if (!assignedIp) {
                return res.status(503).json({ error: 'mesh subnet 10.8.0.0/24 full' });
            }
        }

        // If provider already had a peer registered with a different pubkey,
        // remove that stale peer first (atomicity fix for issue #358).
        if (provider.wg_public_key && provider.wg_public_key !== pubKey) {
            try {
                if (/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(provider.wg_public_key)) {
                    execFileSync('wg', ['set', 'wg0', 'peer', provider.wg_public_key, 'remove'], { timeout: 5000 });
                }
            } catch (_) { /* old peer may not exist; ignore */ }
        }

        // Register new peer on the live wg0 + persist.
        try {
            const pskPath = `/tmp/wg_psk_install_${provider.id}_${Date.now()}`;
            fs.writeFileSync(pskPath, psk + '\n', { mode: 0o600 });
            execSync(
                `wg set wg0 peer "${pubKey}" preshared-key ${pskPath} allowed-ips ${assignedIp}/32 persistent-keepalive 25`,
                { timeout: 5000 }
            );
            execSync('wg-quick save wg0', { timeout: 5000 });
            try { fs.unlinkSync(pskPath); } catch (_) {}
        } catch (e) {
            console.error('[wg/install-config] peer add failed:', e.message);
            return res.status(500).json({ error: 'wg set failed: ' + e.message });
        }

        // Update DB. Same transactional shape as /wg/register.
        runStatement(
            `UPDATE providers
                SET wg_mesh_ip = ?, wg_public_key = ?, wg_last_rotation_at = ?,
                    vllm_endpoint_url = COALESCE(vllm_endpoint_url, ?),
                    updated_at = datetime('now')
              WHERE id = ?`,
            assignedIp, pubKey, new Date().toISOString(),
            `http://${assignedIp}:8000`,  // default vLLM port
            provider.id
        );

        // Build the paste-ready wg0.conf body. Caller writes this verbatim
        // to /etc/wireguard/wg0.conf (mode 0600).
        const wgConfBody = [
            '[Interface]',
            `PrivateKey = ${privKey}`,
            `Address = ${assignedIp}/24`,
            'DNS = 1.1.1.1',
            '',
            '[Peer]',
            `PublicKey = ${WG_SERVER_PUBKEY}`,
            `PresharedKey = ${psk}`,
            `Endpoint = ${WG_SERVER_ENDPOINT}`,
            'AllowedIPs = 10.8.0.0/24',
            'PersistentKeepalive = 25',
            '',
        ].join('\n');

        console.log(`[wg/install-config] Provider ${provider.id} (${provider.name}) configured at ${assignedIp}`);

        return res.json({
            success: true,
            mesh_ip: assignedIp,
            wg_conf: wgConfBody,
            vllm_endpoint_url: `http://${assignedIp}:8000`,
            instructions: [
                `sudo bash -c 'umask 077; cat > /etc/wireguard/wg0.conf <<EOF`,
                wgConfBody.trimEnd(),
                `EOF`,
                `chmod 600 /etc/wireguard/wg0.conf`,
                `wg-quick down wg0 2>/dev/null || true`,
                `wg-quick up wg0`,
                `'`,
            ].join('\n'),
        });
    } catch (error) {
        console.error('[wg/install-config] unexpected:', error);
        return res.status(500).json({ error: 'wg install-config failed' });
    }
});


// ─── v4.4: HERMES AGENT LIVENESS + LOG SHIPPING ─────────────────────────
// Closes the observability gap surfaced 2026-05-13 on Tareq Node 2: provider
// daemon phones home, but Hermes (the local agent) does not. Errors live in
// ~/.dcp/agent.log (134 MB on Tareq's node, never shipped). If Hermes crashes,
// central has no signal.
//
// Routes:
//   POST /api/providers/:id/agent-liveness   — Hermes posts a small JSON blob every 60s
//   POST /api/providers/:id/agent-logs       — Hermes uploads tail when wants_logs_at is set
//   GET  /api/providers/:id/agent-state      — admin OR provider-key reads combined state
//
// Auth: Bearer token (or x-provider-key) === providers.api_key. Admin token also accepted on GET.
// Secrets are redacted server-side (defence-in-depth — client should redact too).

const AGENT_LOG_MAX_BYTES = 64 * 1024;          // 64 KB tail cap
const AGENT_LOG_SNAPSHOTS_PER_PROVIDER = 50;    // auto-prune older
const AGENT_LIVENESS_STALE_MS = 5 * 60 * 1000;  // 5 min → agent_offline

// Redaction patterns. Applied to log excerpts AND to last_error_excerpt.
// Intentionally aggressive: prefer overshoot to a leaked credential.
const _AGENT_REDACTION_RULES = [
    // Bearer tokens
    { re: /(bearer\s+)([A-Za-z0-9._\-]{8,})/gi, repl: '$1[REDACTED]' },
    // Authorization: <anything>
    { re: /(authorization["'\s:=]+)([^\s"',]+)/gi, repl: '$1[REDACTED]' },
    // api_key / apikey / api-key in any kv form
    { re: /(api[_\-]?key["'\s:=]+)([^\s"',]+)/gi, repl: '$1[REDACTED]' },
    // password
    { re: /(password["'\s:=]+)([^\s"',]+)/gi, repl: '$1[REDACTED]' },
    // generic "secret"
    { re: /(secret["'\s:=]+)([^\s"',]+)/gi, repl: '$1[REDACTED]' },
    // JWTs (three dot-separated base64url segments, min lengths)
    { re: /eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}/g, repl: '[REDACTED_JWT]' },
    // DCP key prefixes — provider / renter keys leaking into logs
    { re: /\bdcp-provider-[A-Za-z0-9_\-]{6,}/g, repl: 'dcp-provider-[REDACTED]' },
    { re: /\bdcp-renter-[A-Za-z0-9_\-]{6,}/g, repl: 'dcp-renter-[REDACTED]' },
    { re: /\bdc1-renter-[A-Za-z0-9_\-]{6,}/g, repl: 'dc1-renter-[REDACTED]' },
];

function _agentRedact(input) {
    if (typeof input !== 'string' || input.length === 0) return input;
    let out = input;
    for (const { re, repl } of _AGENT_REDACTION_RULES) {
        out = out.replace(re, repl);
    }
    return out;
}

// Pure function: given a liveness row + "now", decide whether to emit
// agent_offline. Exposed for unit testing and for /diag/summary rollup.
function _agentOfflineWarnings(liveness, nowMs = Date.now()) {
    const warnings = [];
    if (!liveness || !liveness.updated_at) {
        warnings.push('agent_never_reported');
        return warnings;
    }
    const updatedAtMs = Date.parse(liveness.updated_at);
    if (!Number.isFinite(updatedAtMs)) return warnings;
    if ((nowMs - updatedAtMs) > AGENT_LIVENESS_STALE_MS) {
        warnings.push('agent_offline');
    }
    return warnings;
}

// Pure function: prune snapshots beyond the per-provider cap. Returns the
// list of ids to delete. Newest first.
function _agentSnapshotIdsToPrune(snapshotIdsNewestFirst, cap = AGENT_LOG_SNAPSHOTS_PER_PROVIDER) {
    if (!Array.isArray(snapshotIdsNewestFirst)) return [];
    if (snapshotIdsNewestFirst.length <= cap) return [];
    return snapshotIdsNewestFirst.slice(cap);
}

// Shared: authenticate a provider-only route. Returns the provider row or
// sends a 401/403/404 and returns null.
function _agentAuthProvider(req, res, providerId, { allowAdmin = false } = {}) {
    const isAdmin = allowAdmin && isAdminRequest(req);
    const submittedKey = normalizeString(
        req.headers['x-provider-key'] || getBearerToken(req) || req.query.key,
        { maxLen: 128, trim: false }
    );
    const provider = db.get(
        'SELECT id, api_key FROM providers WHERE id = ? AND deleted_at IS NULL',
        [providerId]
    );
    if (!provider) {
        res.status(404).json({ error: 'Provider not found' });
        return null;
    }
    if (!isAdmin) {
        if (!submittedKey || submittedKey !== provider.api_key) {
            res.status(403).json({ error: 'Forbidden: provider key or admin token required' });
            return null;
        }
    }
    return provider;
}

router.post('/:id/agent-liveness', express.json({ limit: '16kb' }), (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });

        const provider = _agentAuthProvider(req, res, providerId, { allowAdmin: false });
        if (!provider) return;

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const agent = normalizeString(body.agent, { maxLen: 32 }) || 'hermes';
        const pid = toFiniteInt(body.pid, { min: 0, max: 2 ** 31 - 1 });
        const uptimeS = toFiniteInt(body.uptime_s, { min: 0, max: 2 ** 31 - 1 });
        const dashboardPort = toFiniteInt(body.dashboard_port, { min: 1, max: 65535 });
        const gatewayState = normalizeString(body.gateway_state, { maxLen: 32 });
        const activeAgents = toFiniteInt(body.active_agents, { min: 0, max: 1000 });
        const platforms = Array.isArray(body.platforms)
            ? body.platforms.filter((p) => typeof p === 'string').slice(0, 20).map((p) => p.slice(0, 32))
            : null;
        const platformsJson = platforms ? JSON.stringify(platforms) : null;
        const lastErrorExcerpt = _agentRedact(normalizeString(body.last_error_excerpt, { maxLen: 2000 }));
        const lastErrorAt = normalizeString(body.last_error_at, { maxLen: 40 });
        const memRssMb = toFiniteInt(body.mem_rss_mb, { min: 0, max: 1024 * 1024 });
        const logTailSha = normalizeString(body.log_tail_sha256, { maxLen: 64, trim: false });

        const nowIso = new Date().toISOString();
        db.run(
            `INSERT INTO provider_agent_liveness
                (provider_id, agent, pid, uptime_s, dashboard_port, gateway_state,
                 active_agents, platforms_json, last_error_excerpt, last_error_at,
                 mem_rss_mb, log_tail_sha256, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(provider_id) DO UPDATE SET
                agent = excluded.agent,
                pid = excluded.pid,
                uptime_s = excluded.uptime_s,
                dashboard_port = excluded.dashboard_port,
                gateway_state = excluded.gateway_state,
                active_agents = excluded.active_agents,
                platforms_json = excluded.platforms_json,
                last_error_excerpt = excluded.last_error_excerpt,
                last_error_at = excluded.last_error_at,
                mem_rss_mb = excluded.mem_rss_mb,
                log_tail_sha256 = excluded.log_tail_sha256,
                updated_at = excluded.updated_at`,
            [providerId, agent, pid, uptimeS, dashboardPort, gatewayState,
             activeAgents, platformsJson, lastErrorExcerpt, lastErrorAt,
             memRssMb, logTailSha, nowIso]
        );

        // Return the pull-trigger so Hermes knows whether to upload its log
        // tail on the next tick.
        const row = db.get(
            'SELECT wants_logs_at FROM provider_agent_liveness WHERE provider_id = ?',
            [providerId]
        );
        return res.json({ ok: true, wants_logs_at: row?.wants_logs_at || null });
    } catch (err) {
        console.error('[providers/:id/agent-liveness]', err);
        return res.status(500).json({ error: 'Failed to record agent liveness' });
    }
});

router.post('/:id/agent-logs', express.json({ limit: '128kb' }), (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });

        const provider = _agentAuthProvider(req, res, providerId, { allowAdmin: false });
        if (!provider) return;

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const rawExcerpt = typeof body.log_excerpt === 'string' ? body.log_excerpt : '';
        if (!rawExcerpt) {
            return res.status(400).json({ error: 'log_excerpt required' });
        }
        // Hard cap on payload size regardless of express limit.
        const capped = rawExcerpt.slice(0, AGENT_LOG_MAX_BYTES);
        const redacted = _agentRedact(capped);
        const byteCount = Buffer.byteLength(redacted, 'utf8');

        const nowIso = new Date().toISOString();
        db.run(
            `INSERT INTO provider_agent_log_snapshots
                (provider_id, captured_at, byte_count, log_excerpt)
             VALUES (?,?,?,?)`,
            [providerId, nowIso, byteCount, redacted]
        );

        // Auto-prune: keep newest AGENT_LOG_SNAPSHOTS_PER_PROVIDER.
        const ids = db.all(
            `SELECT id FROM provider_agent_log_snapshots
             WHERE provider_id = ? ORDER BY captured_at DESC, id DESC`,
            [providerId]
        ).map((r) => r.id);
        const idsToDrop = _agentSnapshotIdsToPrune(ids);
        if (idsToDrop.length) {
            const placeholders = idsToDrop.map(() => '?').join(',');
            db.run(
                `DELETE FROM provider_agent_log_snapshots WHERE id IN (${placeholders})`,
                idsToDrop
            );
        }

        // Clear the pull trigger so Hermes doesn't re-upload on every tick.
        db.run(
            `UPDATE provider_agent_liveness SET wants_logs_at = NULL WHERE provider_id = ?`,
            [providerId]
        );

        return res.json({ ok: true, byte_count: byteCount, pruned: idsToDrop.length });
    } catch (err) {
        console.error('[providers/:id/agent-logs]', err);
        return res.status(500).json({ error: 'Failed to record agent log snapshot' });
    }
});

router.get('/:id/agent-state', (req, res) => {
    try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId) return res.status(400).json({ error: 'Invalid provider id' });

        const provider = _agentAuthProvider(req, res, providerId, { allowAdmin: true });
        if (!provider) return;

        const liveness = db.get(
            `SELECT agent, pid, uptime_s, dashboard_port, gateway_state, active_agents,
                    platforms_json, last_error_excerpt, last_error_at, mem_rss_mb,
                    log_tail_sha256, updated_at, wants_logs_at
             FROM provider_agent_liveness WHERE provider_id = ?`,
            [providerId]
        );
        const latestSnapshot = db.get(
            `SELECT id, captured_at, byte_count, log_excerpt
             FROM provider_agent_log_snapshots
             WHERE provider_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1`,
            [providerId]
        );

        let platforms = null;
        if (liveness && liveness.platforms_json) {
            try { platforms = JSON.parse(liveness.platforms_json); } catch (_) { platforms = null; }
        }
        const warnings = _agentOfflineWarnings(liveness);

        return res.json({
            provider_id: providerId,
            liveness: liveness ? { ...liveness, platforms, platforms_json: undefined } : null,
            latest_snapshot: latestSnapshot || null,
            warnings,
        });
    } catch (err) {
        console.error('[providers/:id/agent-state]', err);
        return res.status(500).json({ error: 'Failed to read agent state' });
    }
});

module.exports = router;
module.exports.__private = {
    discoverComputeTypesFromResourceSpec,
    inferVramGb,
    _agentRedact,
    _agentOfflineWarnings,
    _agentSnapshotIdsToPrune,
    AGENT_LIVENESS_STALE_MS,
    AGENT_LOG_MAX_BYTES,
    AGENT_LOG_SNAPSHOTS_PER_PROVIDER,
    loadVllmCompatibilityIndex,
    evaluateLowVramInferenceCompatibility,
    evaluateProviderAdmission,
    PROVIDER_ADMISSION_REASON_CODES,
    activateProviderById,
    getProviderRoutingProfile,
    parseJobContainerRequirements,
    evaluateProviderAdmission,
    PROVIDER_ADMISSION_REASON_CODES,
    TIER_ADMISSION_REJECTION_CODES,
    fetchLatestTierAdmissionRejection,
    _providerEventEmitter,
    ACTIVATION_MIN_VRAM_GB,
    ACTIVATION_MIN_TFLOPS,
};
