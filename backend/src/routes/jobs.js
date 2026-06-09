const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');
const router = express.Router();
const db = require('../db');
const { retryJobLimiter, jobCreateLimiter } = require('../middleware/rateLimiter');
const { getApiKeyFromReq, isAdminRequest, requireAdminAuth, looksLikeProviderKey } = require('../middleware/auth');
const { validateAndNormalizeImageRef, isApprovedImageRef } = require('../lib/container-registry');
const { isPublicWebhookUrl, isResolvablePublicWebhookUrl } = require('../lib/webhook-security');
const { resolveRenterWebhookSecret } = require('../lib/webhook-secret');
const { validateBody } = require('../middleware/validate');
const { jobSubmitSchema } = require('../schemas/jobs.schema');
const { getChainEscrow } = require('../services/escrow-chain');
const { invokePodRelay } = require('../lib/pod-relay');
const pricingService = require('../services/pricingService');
const {
  sendJobQueued,
  sendJobStarted,
  sendJobCompleted,
  sendJobFailed,
} = require('../services/emailService');
const {
  appendAttemptLogLines,
  getAttemptLogPath,
  resolveAttemptLogPath,
} = require('../services/job-execution-logs');
const {
  normalizePricingClass,
  calculateControlPlaneSignals,
} = require('../services/controlPlane');
const analytics = require('../services/analyticsService');
const conversionFunnel = require('../services/conversionFunnelService');
const jobEventEmitter = require('../utils/jobEventEmitter');

function flattenRunParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
  return db.prepare(sql).run(...flattenRunParams(params));
}

function createTransaction(work) {
  if (typeof db?._db?.transaction === 'function') {
    return db._db.transaction(work);
  }
  return (...args) => work(...args);
}

// HMAC secret for signing task_spec
// IMPORTANT: DC1_HMAC_SECRET must be set in env — do NOT share with DC1_ADMIN_TOKEN
// A process-scoped random fallback is used only if the env var is missing (restarts
// will invalidate all in-flight job signatures — set DC1_HMAC_SECRET in production)
if (!process.env.DC1_HMAC_SECRET) {
  console.warn('[SECURITY] DC1_HMAC_SECRET not set — using random fallback. Set this env var in production.');
}
const HMAC_SECRET = process.env.DC1_HMAC_SECRET || crypto.randomBytes(32).toString('hex');

// Docker templates directory — loaded on-demand for templateId resolution
const DOCKER_TEMPLATES_DIR = require('path').join(__dirname, '../../../docker-templates');
function loadDockerTemplate(templateId) {
  if (!templateId || typeof templateId !== 'string') return null;
  // Sanitize: only allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(templateId)) return null;
  const templatePath = require('path').join(DOCKER_TEMPLATES_DIR, `${templateId}.json`);
  try {
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch {
    return null;
  }
}

const JOB_COLUMNS = new Set((db.all("PRAGMA table_info('jobs')") || []).map((row) => row.name));
const HAS_RETRY_REASON = JOB_COLUMNS.has('retry_reason');
const HAS_RETRIED_FROM_JOB_ID = JOB_COLUMNS.has('retried_from_job_id');
const HAS_TEMPLATE_ID = JOB_COLUMNS.has('template_id');
const DEFAULT_JOB_PRIORITY = 2;
const MIN_JOB_PRIORITY = 0;
const MAX_JOB_PRIORITY = 10;
const PRICING_CLASS_SORT_SQL = `CASE COALESCE(pricing_class, 'standard')
  WHEN 'priority' THEN 0
  WHEN 'standard' THEN 1
  WHEN 'economy' THEN 2
  ELSE 1
END`;
const ACTIVE_JOB_STATUSES = new Set(['assigned', 'pulling', 'running']);

function signTaskSpec(taskSpec) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(taskSpec).digest('hex');
}

function signWebhookPayload(secret, payloadJson) {
  return crypto.createHmac('sha256', secret).update(payloadJson).digest('hex');
}

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
      },
      billing: details.billing || null,
    };
    const payloadJson = JSON.stringify(payload);
    // Audit M6 — per-renter secret, never the api_key. Skip sending if no
    // secret can be derived rather than signing with a guessable value.
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
    console.error('[jobs/webhook] Failed to notify renter webhook:', error.message);
    return { sent: false, reason: error.message };
  }
}

function parsePriority(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed >= MIN_JOB_PRIORITY && parsed <= MAX_JOB_PRIORITY) {
    return parsed;
  }
  return DEFAULT_JOB_PRIORITY;
}

function pricingClassRank(pricingClass) {
  const normalized = normalizePricingClass(pricingClass);
  if (normalized === 'priority') return 0;
  if (normalized === 'standard') return 1;
  if (normalized === 'economy') return 2;
  return 1;
}

function normalizeModelField(modelValue) {
  if (modelValue === undefined || modelValue === null) return null;
  const model = String(modelValue).trim();
  return model.length > 0 ? model : null;
}

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
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

function recordColdStartTelemetry({ providerId, job, firstTokenAt }) {
  const assignedAnchor = job?.assigned_at || job?.picked_up_at || job?.started_at || job?.submitted_at;
  if (!assignedAnchor || !firstTokenAt) return null;

  const assignedMs = Date.parse(assignedAnchor);
  const firstTokenMs = Date.parse(firstTokenAt);
  if (!Number.isFinite(assignedMs) || !Number.isFinite(firstTokenMs)) return null;
  if (firstTokenMs < assignedMs) return null;

  const coldStartMs = Math.max(0, Math.round(firstTokenMs - assignedMs));
  const provider = db.get(
    `SELECT gpu_model, gpu_name_detected, vram_mb, gpu_vram_mb, gpu_vram_mib
     FROM providers
     WHERE id = ?`,
    providerId
  );
  const gpuName = provider?.gpu_name_detected || provider?.gpu_model || null;
  const vramMb = Number(provider?.vram_mb || provider?.gpu_vram_mb || provider?.gpu_vram_mib || 0);
  const gpuVramGb = Number.isFinite(vramMb) && vramMb > 0 ? Math.max(0, Math.round(vramMb / 1024)) : null;

  db.prepare(
    `INSERT INTO provider_gpu_telemetry (
       provider_id, gpu_name, gpu_vram_gb, gpu_util_pct, vram_used_gb, cold_start_ms, active_jobs
     )
     VALUES (
       ?, ?, ?, NULL, NULL, ?,
       (SELECT COUNT(*) FROM jobs WHERE provider_id = ? AND status = 'running')
     )`
  ).run(providerId, gpuName, gpuVramGb, coldStartMs, providerId);

  return coldStartMs;
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
      quoted_cost_halala: Number((details.quoted_cost_halala ?? job.cost_halala) || 0),
      queue_position: details.queue_position,
      actual_cost_halala: Number((details.actual_cost_halala ?? job.actual_cost_halala) || 0),
      gpu_seconds_used: details.gpu_seconds_used,
      refunded_amount_halala: Number((details.refunded_amount_halala ?? job.cost_halala) || 0),
      retry_attempts: Number((details.retry_attempts ?? job.retry_count) || 0),
      last_error: normalizeString(details.last_error || job.last_error || job.error, { maxLen: 1000 }),
    };

    let pendingSend = null;
    if (event === 'queued') pendingSend = sendJobQueued(renterEmail, payload);
    if (event === 'started') pendingSend = sendJobStarted(renterEmail, payload);
    if (event === 'completed') pendingSend = sendJobCompleted(renterEmail, payload);
    if (event === 'failed') pendingSend = sendJobFailed(renterEmail, payload);
    if (!pendingSend || typeof pendingSend.then !== 'function') return;

    pendingSend.catch((err) => {
      console.error(`[jobs/email:${event}] Failed for ${job.job_id}:`, err.message);
    });
  } catch (error) {
    console.error(`[jobs/email:${event}] Unexpected error:`, error.message);
  }
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

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeRawPythonTaskSpec(value) {
  if (typeof value !== 'string') return false;
  const task = value.trim();
  if (!task) return false;
  if (task.startsWith('#!') && task.toLowerCase().includes('python')) return true;
  return /\b(import|from|def|class|lambda|subprocess|os\.|sys\.)\b/.test(task);
}

function normalizeContainerSpec(rawContainerSpec) {
  if (!isPlainObject(rawContainerSpec)) {
    return { error: 'container_spec is required and must be an object' };
  }

  const imageType = normalizeString(rawContainerSpec.image_type, { maxLen: 120 });
  if (!imageType) {
    return { error: 'container_spec.image_type is required' };
  }

  let modelId = null;
  if (rawContainerSpec.model_id != null) {
    modelId = normalizeString(rawContainerSpec.model_id, { maxLen: 200 });
    if (!modelId) {
      return { error: 'container_spec.model_id must be a non-empty string when provided' };
    }
  }

  let env = null;
  if (rawContainerSpec.env != null) {
    if (!isPlainObject(rawContainerSpec.env)) {
      return { error: 'container_spec.env must be an object when provided' };
    }
    try {
      JSON.stringify(rawContainerSpec.env);
      env = rawContainerSpec.env;
    } catch (_) {
      return { error: 'container_spec.env must be JSON-serializable' };
    }
  }

  let enableCheckpoint = false;
  if (rawContainerSpec.enable_checkpoint != null) {
    if (typeof rawContainerSpec.enable_checkpoint !== 'boolean') {
      return { error: 'container_spec.enable_checkpoint must be boolean when provided' };
    }
    enableCheckpoint = rawContainerSpec.enable_checkpoint;
  }

  const vramRequiredMb = toFiniteInt(rawContainerSpec.vram_required_mb, { min: 0, max: 1024 * 1024 });
  if (rawContainerSpec.vram_required_mb != null && vramRequiredMb == null) {
    return { error: 'container_spec.vram_required_mb must be a non-negative integer when provided' };
  }

  const gpuCount = toFiniteInt(rawContainerSpec.gpu_count, { min: 1, max: 64 });
  if (rawContainerSpec.gpu_count != null && gpuCount == null) {
    return { error: 'container_spec.gpu_count must be an integer between 1 and 64 when provided' };
  }

  const computeTypeRaw = normalizeString(rawContainerSpec.compute_type, { maxLen: 32 });
  const computeType = computeTypeRaw ? computeTypeRaw.toLowerCase() : null;
  const allowedComputeTypes = new Set(['inference', 'training', 'rendering']);
  if (computeType && !allowedComputeTypes.has(computeType)) {
    return { error: 'container_spec.compute_type must be one of: inference, training, rendering' };
  }

  const pricingClass = normalizePricingClass(rawContainerSpec.pricing_class);
  let prewarmRequested = false;
  if (rawContainerSpec.prewarm_requested != null) {
    if (typeof rawContainerSpec.prewarm_requested !== 'boolean') {
      return { error: 'container_spec.prewarm_requested must be boolean when provided' };
    }
    prewarmRequested = rawContainerSpec.prewarm_requested;
  }

  let image = null;
  const requestedImage = rawContainerSpec.image ?? rawContainerSpec.image_override;
  if (requestedImage != null) {
    const validatedImage = validateAndNormalizeImageRef(requestedImage);
    if (validatedImage.error) {
      return { error: validatedImage.error };
    }
    if (!isApprovedImageRef(db, validatedImage.value)) {
      return { error: 'container_spec.image is not approved. Use GET /api/containers/registry for allowed images.' };
    }
    image = validatedImage.value;
  }

  return {
    value: {
      image_type: imageType,
      vram_required_mb: vramRequiredMb != null ? vramRequiredMb : 0,
      gpu_count: gpuCount != null ? gpuCount : 1,
      compute_type: computeType || 'inference',
      pricing_class: pricingClass,
      ...(modelId ? { model_id: modelId } : {}),
      ...(image ? { image } : {}),
      ...(env ? { env } : {}),
      ...(enableCheckpoint ? { enable_checkpoint: true } : {}),
      ...(prewarmRequested ? { prewarm_requested: true } : {}),
    },
  };
}

function buildLegacyContainerSpec(jobType) {
  const normalizedType = String(jobType || '').trim();
  const byType = {
    training: { image_type: 'training', compute_type: 'training' },
    rendering: { image_type: 'rendering', compute_type: 'rendering' },
    benchmark: { image_type: 'benchmark', compute_type: 'inference' },
    llm_inference: { image_type: 'llm', compute_type: 'inference' },
    'llm-inference': { image_type: 'llm', compute_type: 'inference' },
    image_generation: { image_type: 'image_generation', compute_type: 'rendering' },
  };
  const selected = byType[normalizedType] || { image_type: normalizedType || 'generic', compute_type: 'inference' };
  return {
    image_type: selected.image_type,
    vram_required_mb: 0,
    gpu_count: 1,
    compute_type: selected.compute_type,
    pricing_class: 'standard',
  };
}

function inferRetryReason(job) {
  if (HAS_RETRY_REASON && job.retry_reason) return job.retry_reason;
  const msg = String(job.error || '').toLowerCase();
  if (msg.includes('queue timeout')) return 'queue_timeout';
  if (msg.includes('timed out') || msg.includes('timeout')) return 'provider_timeout';
  if (job.status === 'permanently_failed' || (job.retry_count || 0) > 0) return 'execution_failed';
  return null;
}

function applyRetryMetadata(job) {
  if (!job || typeof job !== 'object') return job;
  job.retry_count = Number(job.retry_count || 0);
  job.max_retries = Number(job.max_retries || 2);
  job.retry_reason = inferRetryReason(job);
  return job;
}

function isAdmin(req) {
  return isAdminRequest(req);
}

function getRenterFromReq(req) {
  const key = getApiKeyFromReq(req, {
    headerName: 'x-renter-key',
    queryNames: ['renter_key', 'key'],
  });
  if (!key) return null;
  // First match the legacy master key on `renters.api_key`. If that misses,
  // fall back to the sub-keys table (`renter_api_keys`) so dashboard sub-keys
  // (`dcp-renter-…`) resolve to the same renter as the legacy master key —
  // otherwise canReadJob() returns 403 on /api/jobs/:id and the detail view
  // blanks out model / device / tokens for jobs the user actually owns.
  const direct = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active');
  if (direct) return direct;
  const ak = db.get('SELECT renter_id FROM renter_api_keys WHERE key = ? AND revoked_at IS NULL', key);
  if (!ak) return null;
  return db.get('SELECT id FROM renters WHERE id = ? AND status = ?', ak.renter_id, 'active') || null;
}

function getProviderFromReq(req) {
  const key = getApiKeyFromReq(req, {
    headerName: 'x-provider-key',
    queryNames: ['key'],
    bodyNames: ['api_key'],
  });
  if (!key) return null;
  // SEC: exclude deleted providers so revoked accounts cannot submit job results
  return db.get('SELECT id FROM providers WHERE api_key = ? AND deleted_at IS NULL', key) || null;
}

function canReadJob(req, job) {
  if (isAdmin(req)) return true;
  const renter = getRenterFromReq(req);
  if (renter && job.renter_id && renter.id === job.renter_id) return true;
  const provider = getProviderFromReq(req);
  if (provider && job.provider_id && provider.id === job.provider_id) return true;
  return false;
}

function resolveAttemptNumber(jobId, requestedAttempt) {
  const parsed = toFiniteInt(requestedAttempt, { min: 1 });
  if (parsed != null) return parsed;
  const latest = db.get(
    `SELECT attempt_number FROM job_executions
     WHERE job_id = ?
     ORDER BY attempt_number DESC
     LIMIT 1`,
    jobId
  );
  return Number(latest?.attempt_number || 1);
}

function canControlJob(req, job) {
  if (isAdmin(req)) return true;
  const provider = getProviderFromReq(req);
  if (provider && job.provider_id && provider.id === job.provider_id) return true;
  return false;
}

function getAuthenticatedActor(req) {
  if (isAdmin(req)) return { type: 'admin', id: null };
  const provider = getProviderFromReq(req);
  if (provider) return { type: 'provider', id: provider.id };
  const renter = getRenterFromReq(req);
  if (renter) return { type: 'renter', id: renter.id };
  return null;
}

const TERMINAL_JOB_STATUSES = new Set(['done', 'completed', 'failed', 'cancelled', 'permanently_failed', 'timed_out']);
const LIFECYCLE_SCHEMA_VERSION = '2026-03-20.v1';

function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value > 1e12 ? value : value * 1000;
    const date = new Date(normalized);
    if (Number.isFinite(date.getTime())) return date.toISOString();
    return null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const date = new Date(value.trim());
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

function categorizeJobError(rawError, statusHint = null) {
  const message = String(rawError || '').toLowerCase();
  const status = String(statusHint || '').toLowerCase();
  if (
    status === 'timed_out'
    || status === 'timeout'
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('queue timeout')
  ) {
    return { category: 'timeout', code: 'timeout' };
  }
  if (
    message.includes('out of memory')
    || message.includes('cuda out of memory')
    || message.includes('cuda oom')
    || /\boom\b/.test(message)
  ) {
    return { category: 'oom', code: 'gpu_out_of_memory' };
  }
  if (
    message.includes('image pull')
    || message.includes('manifest unknown')
    || message.includes('pull access denied')
    || message.includes('failed to pull')
    || message.includes('not found: manifest')
  ) {
    return { category: 'image_pull', code: 'image_pull_failed' };
  }
  if (
    message.includes('provider offline')
    || message.includes('provider disconnected')
    || message.includes('provider may be offline')
    || message.includes('heartbeat stale')
    || message.includes('connection reset')
  ) {
    return { category: 'provider_disconnect', code: 'provider_disconnect' };
  }
  return { category: 'execution', code: 'execution_error' };
}

function recordLifecycleEvent(jobOrJobId, eventType, options = {}) {
  const jobId = typeof jobOrJobId === 'string' ? jobOrJobId : jobOrJobId?.job_id;
  if (!jobId || !eventType) return null;

  const occurredAt = toIsoTimestamp(options.occurred_at) || new Date().toISOString();
  const status = options.status == null ? null : String(options.status);
  const source = options.source ? String(options.source) : 'api';
  const message = normalizeString(options.message, { maxLen: 2000, trim: false });
  const errorCategory = options.error_category ? String(options.error_category) : null;
  const errorCode = options.error_code ? String(options.error_code) : null;
  let payloadJson = null;
  if (options.payload !== undefined) {
    try {
      payloadJson = JSON.stringify(options.payload);
    } catch (_) {
      payloadJson = null;
    }
  }

  const nextSeq = db.get(
    'SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_sequence FROM job_lifecycle_events WHERE job_id = ?',
    jobId
  );
  const sequenceNo = Number(nextSeq?.next_sequence || 1);

  runStatement(
    `INSERT INTO job_lifecycle_events (
      job_id, sequence_no, event_type, status, source, error_category, error_code, message, payload_json, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    jobId,
    sequenceNo,
    String(eventType),
    status,
    source,
    errorCategory,
    errorCode,
    message,
    payloadJson,
    occurredAt
  );

  return {
    schema_version: LIFECYCLE_SCHEMA_VERSION,
    job_id: jobId,
    sequence_no: sequenceNo,
    event_type: String(eventType),
    status,
    source,
    error_category: errorCategory,
    error_code: errorCode,
    message,
    payload: options.payload === undefined ? null : options.payload,
    occurred_at: occurredAt,
    occurred_at_ms: Date.parse(occurredAt) || Date.now(),
  };
}

function safeCheckpointName(jobId) {
  return `cp-${String(jobId || '').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 64)}`;
}

function runDockerCommand(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveJobContainerId(job) {
  if (job.container_id) return String(job.container_id);
  if (!job.job_id) return null;
  try {
    const result = runDockerCommand([
      'ps',
      '--filter', `name=dcp-job-${job.job_id}`,
      '--format', '{{.ID}}',
    ]);
    return result ? result.split('\n')[0].trim() : null;
  } catch (_) {
    return null;
  }
}

function normalizeIncomingLogLines(rawLines) {
  if (!Array.isArray(rawLines)) return [];
  const VALID_LEVELS = new Set(['info', 'warn', 'error', 'debug']);
  const out = [];
  for (const row of rawLines.slice(0, 500)) {
    const levelCandidate = String(row?.level || '').toLowerCase();
    const level = VALID_LEVELS.has(levelCandidate) ? levelCandidate : 'info';
    const message = String(row?.message || '').slice(0, 2000);
    if (!message) continue;
    const loggedAt = toIsoTimestamp(row?.logged_at || row?.timestamp || row?.ts) || new Date().toISOString();
    out.push({ level, message, logged_at: loggedAt });
  }
  return out;
}

function appendJobLogs(job, lines) {
  if (!job || !job.job_id || !Array.isArray(lines) || lines.length === 0) {
    return 0;
  }

  const maxRow = db.get('SELECT MAX(line_no) as max_line FROM job_logs WHERE job_id = ?', job.job_id);
  let lineNo = (maxRow?.max_line || 0) + 1;
  const insert = db.prepare(
    'INSERT INTO job_logs (job_id, line_no, level, message, logged_at) VALUES (?, ?, ?, ?, ?)'
  );
  const updateJsonl = db.prepare(
    `UPDATE jobs
     SET logs_jsonl = substr(COALESCE(logs_jsonl, '') || ?, -1000000),
         updated_at = ?
     WHERE id = ?`
  );

  const writeTx = createTransaction((rows) => {
    const jsonlParts = [];
    for (const row of rows) {
      const loggedAt = toIsoTimestamp(row.logged_at) || new Date().toISOString();
      insert.run(job.job_id, lineNo++, row.level, row.message, loggedAt);
      jsonlParts.push(JSON.stringify({
        type: 'log',
        line: row.message,
        ts: Date.parse(loggedAt) || Date.now(),
        logged_at: loggedAt,
        level: row.level,
      }));
    }
    if (jsonlParts.length > 0) {
      const now = new Date().toISOString();
      updateJsonl.run(`${jsonlParts.join('\n')}\n`, now, job.id);
    }
  });

  writeTx(lines);
  return lines.length;
}

// Renter auth middleware — validates renter API key from header or query
function requireRenter(req, res, next) {
  const key = getApiKeyFromReq(req, {
    headerName: 'x-renter-key',
    queryNames: ['renter_key', 'key'],
  });
  if (!key) {
    return res.status(401).json({ error: 'Renter API key required (x-renter-key header or renter_key query)' });
  }
  // H1 — reject provider-prefixed keys on a renter-only path.
  if (looksLikeProviderKey(key)) {
    return res.status(401).json({ error: 'Wrong key type: provider key cannot be used on renter endpoint', code: 'wrong_key_type' });
  }
  const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
  if (!renter) {
    return res.status(403).json({ error: 'Invalid or inactive renter API key' });
  }
  req.renter = renter;
  next();
}

function logQuotaCheck(renterId, checkType, allowed, limitValue, currentValue, requestedValue, reason, jobId = null) {
  try {
    runStatement(
      `INSERT INTO quota_log (
        renter_id, job_id, check_type, allowed, limit_value, current_value, requested_value, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      renterId,
      jobId,
      checkType,
      allowed ? 1 : 0,
      limitValue,
      currentValue,
      requestedValue,
      reason,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('[quota] failed to log quota check:', err.message);
  }
}

// ── Queue helper: promote next queued job for a provider ─────────────────────
function promoteNextQueuedJob(providerId) {
  // Queue ordering: pricing class first (priority -> standard -> economy),
  // then numeric priority, then FIFO by creation time.
  const nextQueued = db.get(
    `SELECT * FROM jobs WHERE provider_id = ? AND status = 'queued'
     ORDER BY ${PRICING_CLASS_SORT_SQL} ASC,
              COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) DESC,
              created_at ASC
     LIMIT 1`,
    [providerId]
  );
  if (nextQueued) {
    const timeout = nextQueued.max_duration_seconds || 1800;
    const timeoutAt = new Date(Date.now() + timeout * 1000).toISOString().replace('T', ' ').replace('Z', '');
    runStatement(
      `UPDATE jobs SET status = 'pending', timeout_at = ? WHERE id = ?`,
      [timeoutAt, nextQueued.id]
    );
    recordLifecycleEvent(nextQueued, 'job.status.changed', {
      status: 'pending',
      source: 'scheduler',
      message: 'Job promoted from queued to pending',
      payload: {
        from_status: 'queued',
        to_status: 'pending',
        timeout_at: timeoutAt,
        provider_id: providerId,
      },
    });
    console.log(`[Queue] Auto-promoted job ${nextQueued.job_id} from queued → pending for provider ${providerId}`);
    return nextQueued;
  }
  return null;
}

function getQueuePosition(job) {
  if (!job || job.status !== 'queued') return null;

  const jobPriority = Number.isFinite(Number(job.priority))
    ? Number(job.priority)
    : DEFAULT_JOB_PRIORITY;
  const jobPricingClassRank = pricingClassRank(job.pricing_class);
  const jobCreatedAt = job.created_at || '';

  if (job.provider_id == null) {
    const ahead = db.get(
      `SELECT COUNT(*) AS cnt
       FROM jobs
       WHERE status = 'queued'
         AND provider_id IS NULL
         AND (
           ${PRICING_CLASS_SORT_SQL} < ?
           OR (
             ${PRICING_CLASS_SORT_SQL} = ?
             AND (
               COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) > ?
               OR (COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) = ? AND created_at < ?)
             )
           )
         )`,
      [jobPricingClassRank, jobPricingClassRank, jobPriority, jobPriority, jobCreatedAt]
    );
    return (ahead?.cnt || 0) + 1;
  }

  const ahead = db.get(
    `SELECT COUNT(*) AS cnt
     FROM jobs
     WHERE provider_id = ?
       AND status IN ('queued', 'pending', 'running')
       AND (
         ${PRICING_CLASS_SORT_SQL} < ?
         OR (
           ${PRICING_CLASS_SORT_SQL} = ?
           AND (
             COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) > ?
             OR (COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) = ? AND created_at < ?)
           )
         )
       )`,
    [job.provider_id, jobPricingClassRank, jobPricingClassRank, jobPriority, jobPriority, jobCreatedAt]
  );
  return (ahead?.cnt || 0) + 1;
}

// Cost rates and multipliers sourced from config/pricing.js (DCP-762).
const { JOB_TYPE_RATES_HALALA_PER_MIN: COST_RATES, PRICING_CLASS_MULTIPLIERS } = require('../config/pricing');

// ── Job template scripts ────────────────────────────────────────────────────
// These auto-generate Python task_spec scripts for known job types so renters
// can submit jobs with simple JSON params instead of writing Python code.

// Sanitize a string for safe embedding in Python single-quoted strings
function pyEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\r/g, '');
}

// Whitelist model IDs to prevent code injection via model param
const ALLOWED_SD_MODELS = [
  'CompVis/stable-diffusion-v1-4',
  'stable-diffusion-v1-5/stable-diffusion-v1-5',
  'CompVis/stable-diffusion-v1-4',
  'stabilityai/stable-diffusion-2-1',
  'runwayml/stable-diffusion-v1-5',
  'stabilityai/stable-diffusion-xl-base-1.0',
];
const ALLOWED_LLM_MODELS = [
  'microsoft/phi-2',
  'microsoft/phi-1_5',
  'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
  'google/gemma-2b',
  'mistralai/Mistral-7B-Instruct-v0.2',
];

function generateImageGenScript(params) {
  const prompt = pyEscape(params.prompt || 'A beautiful sunset over Riyadh skyline');
  const negPrompt = pyEscape(params.negative_prompt || 'blurry, low quality, distorted');
  const steps = Math.min(Math.max(parseInt(params.steps) || 30, 5), 100);
  const width = Math.min(Math.max(parseInt(params.width) || 512, 256), 1024);
  const height = Math.min(Math.max(parseInt(params.height) || 512, 256), 1024);
  const seed = params.seed ? parseInt(params.seed) : -1;
  const rawModel = String(params.model || 'CompVis/stable-diffusion-v1-4');
  const model = ALLOWED_SD_MODELS.includes(rawModel) ? rawModel : 'CompVis/stable-diffusion-v1-4';

  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DCP Image Generation - auto-generated task script"""
import torch, base64, io, json, sys, time

t0 = time.time()
print("[dcp] Loading model: ${model}", flush=True)

try:
    from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
except ImportError:
    print("[dcp] Installing diffusers...", flush=True)
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "diffusers", "transformers", "accelerate", "safetensors", "-q"])
    from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

pipe = StableDiffusionPipeline.from_pretrained(
    '${model}',
    torch_dtype=dtype,
    safety_checker=None,
    requires_safety_checker=False
)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe = pipe.to(device)

# Memory optimization for <=8GB GPUs
if device == "cuda":
    try:
        pipe.enable_attention_slicing()
    except:
        pass

print(f"[dcp] Model loaded in {time.time()-t0:.1f}s on {device}", flush=True)

generator = None
seed_used = ${seed}
if seed_used >= 0:
    generator = torch.Generator(device=device).manual_seed(seed_used)
else:
    import random
    seed_used = random.randint(0, 2**32-1)
    generator = torch.Generator(device=device).manual_seed(seed_used)

print(f"[dcp] Generating ${width}x${height} image, ${steps} steps, seed={seed_used}...", flush=True)
t1 = time.time()

with torch.no_grad():
    result = pipe(
        prompt='${prompt}',
        negative_prompt='${negPrompt}',
        num_inference_steps=${steps},
        width=${width},
        height=${height},
        generator=generator,
        guidance_scale=7.5
    )

image = result.images[0]
gen_time = time.time() - t1
print(f"[dcp] Generated in {gen_time:.1f}s", flush=True)

# Encode as base64 PNG
buf = io.BytesIO()
image.save(buf, format="PNG", optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode("ascii")

# Output structured result - daemon captures this
output = {
    "type": "image",
    "format": "png",
    "encoding": "base64",
    "width": ${width},
    "height": ${height},
    "steps": ${steps},
    "seed": seed_used,
    "prompt": '${prompt}',
    "model": '${model}',
    "device": device,
    "gen_time_s": round(gen_time, 1),
    "total_time_s": round(time.time()-t0, 1),
    "data": b64
}
print("DC1_RESULT_JSON:" + json.dumps(output))
`;
}

function generateLlmInferenceScript(params) {
  const prompt = pyEscape(params.prompt || 'What is the capital of Saudi Arabia?');
  const maxTokens = Math.min(Math.max(parseInt(params.max_tokens) || 256, 32), 4096);
  const rawModel = String(params.model || 'TinyLlama/TinyLlama-1.1B-Chat-v1.0');
  const model = ALLOWED_LLM_MODELS.includes(rawModel) ? rawModel : 'TinyLlama/TinyLlama-1.1B-Chat-v1.0';
  const temperature = Math.min(Math.max(parseFloat(params.temperature) || 0.7, 0.1), 2.0);

  // Determine if model needs 4-bit quantization (7B+ params need it for 8GB VRAM cards)
  const needs4bit = model.includes('Mistral-7B') || model.includes('gemma-7b');
  // Determine chat template format based on model
  const isChatModel = model.includes('Chat') || model.includes('Instruct');

  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DCP LLM Inference v4 - chat templates + phase markers for progress tracking"""
import torch, json, sys, time

t0 = time.time()
print("[dcp-phase] installing_deps", flush=True)

from transformers import AutoModelForCausalLM, AutoTokenizer

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

print("[dcp-phase] downloading_model", flush=True)
print("[dcp] Downloading/loading model: ${model}", flush=True)
tokenizer = AutoTokenizer.from_pretrained('${model}', trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

print("[dcp-phase] loading_model", flush=True)
model = AutoModelForCausalLM.from_pretrained(
    '${model}', torch_dtype=dtype,
    device_map="auto" if device == "cuda" else None,
    trust_remote_code=True
)
print(f"[dcp] Model loaded in {time.time()-t0:.1f}s on {device}", flush=True)

user_prompt = '${prompt}'

# ── Format with chat template ────────────────────────────────────────
${isChatModel ? `messages = [{"role": "user", "content": user_prompt}]
try:
    formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
except Exception:
    model_lower = '${model}'.lower()
    if 'tinyllama' in model_lower:
        formatted = f"<|user|>\\n{user_prompt}\\n<|assistant|>\\n"
    elif 'mistral' in model_lower:
        formatted = f"[INST] {user_prompt} [/INST]"
    else:
        formatted = f"User: {user_prompt}\\nAssistant:"
` : `formatted = f"Question: {user_prompt}\\nAnswer:"`}
print(f"[dcp] Prompt formatted ({len(formatted)} chars)", flush=True)

inputs = tokenizer(formatted, return_tensors="pt").to(device)
input_len = inputs["input_ids"].shape[1]

print("[dcp-phase] generating", flush=True)
print(f"[dcp] Generating up to ${maxTokens} tokens...", flush=True)
t1 = time.time()
with torch.no_grad():
    out = model.generate(**inputs, max_new_tokens=${maxTokens},
        temperature=${temperature}, do_sample=True, top_p=0.9,
        repetition_penalty=1.1,
        pad_token_id=tokenizer.eos_token_id)

gen_ids = out[0][input_len:]
response = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()
gen_time = time.time() - t1
n_tokens = len(gen_ids)
print(f"[dcp] Generated {n_tokens} tokens in {gen_time:.1f}s", flush=True)

output = {
    "type": "text", "prompt": user_prompt, "response": response,
    "model": '${model}', "tokens_generated": n_tokens,
    "tokens_per_second": round(n_tokens / gen_time, 1) if gen_time > 0 else 0,
    "gen_time_s": round(gen_time, 1), "total_time_s": round(time.time()-t0, 1),
    "device": device
}
print("DC1_RESULT_JSON:" + json.dumps(output))
`;
}

// custom_container: pass image_override + optional script through to daemon as JSON task_spec
function generateCustomContainerSpec(params) {
  const imageOverride = params.image_override || 'dc1/general-worker:latest';
  const script = params.script || 'import torch\nprint(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \'none\'}")\n';
  // Return JSON string — daemon handles task_spec as JSON when it detects it
  return JSON.stringify({ image_override: imageOverride, script });
}

// vllm_serve: start a vLLM OpenAI-compatible serving endpoint on the provider GPU
// Returns a JSON task_spec that the daemon interprets as a long-running serve job
const ALLOWED_VLLM_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.2',
  'meta-llama/Meta-Llama-3-8B-Instruct',
  'microsoft/Phi-3-mini-4k-instruct',
  'google/gemma-2b-it',
  'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
];
function generateVllmServeSpec(params) {
  const rawModel = String(params.model || 'TinyLlama/TinyLlama-1.1B-Chat-v1.0');
  const model = ALLOWED_VLLM_MODELS.includes(rawModel) ? rawModel : 'TinyLlama/TinyLlama-1.1B-Chat-v1.0';
  const maxModelLen = Math.min(Math.max(parseInt(params.max_model_len) || 4096, 512), 32768);
  const dtype = ['float16', 'bfloat16', 'float32'].includes(params.dtype) ? params.dtype : 'float16';
  return JSON.stringify({ serve_mode: true, model, max_model_len: maxModelLen, dtype });
}

// Map job types to their template generators
const JOB_TEMPLATES = {
  'image_generation': generateImageGenScript,
  'llm-inference': generateLlmInferenceScript,
  'llm_inference': generateLlmInferenceScript,  // underscore alias (avoids daemon Docker path for llm-inference)
  'custom_container': generateCustomContainerSpec,
  'vllm_serve': generateVllmServeSpec,
};

function calculateCostHalala(jobType, durationMinutes, pricingClass, gpuModel) {
  return pricingService.calculateCostHalala(
    gpuModel || null, durationMinutes, normalizePricingClass(pricingClass), jobType
  );
}

function estimateThreeComponentCost({ gpuModel, durationSeconds, storageGbSeconds, bandwidthBytesOut, pricingClass, jobType }) {
  return pricingService.estimateThreeComponentCost({
    gpuModel: gpuModel || null,
    durationSeconds,
    storageGbSeconds: storageGbSeconds || 0,
    bandwidthBytesOut: bandwidthBytesOut || 0,
    pricingClass: normalizePricingClass(pricingClass),
    jobType,
  });
}

// Floor-plus-remainder: guarantees provider + dc1 === total exactly
function splitBilling(totalHalala) {
  const dc1 = Math.floor(totalHalala * 15 / 100);
  return { provider: totalHalala - dc1, dc1 };
}

// Whitelisted job types — renters may only submit these types
const ALLOWED_JOB_TYPES = new Set(['image_generation', 'llm-inference', 'llm_inference', 'rendering', 'training', 'benchmark', 'custom_container', 'vllm_serve', 'rag-pipeline', 'interactive_pod']);

// Whitelisted GPU model identifiers (finding S1-02).
// Sourced from GPU_COMPATIBILITY (jobScheduler) + GPU_RATE_TABLE (pricing config).
// Input is normalised to uppercase with all non-alphanumeric chars stripped before lookup.
// null/omitted gpu_type is always accepted (means "any GPU").
const ALLOWED_GPU_TYPES = new Set([
  'H200', 'H100', 'A100',  // data-centre tier
  'L40S', 'L40',           // pro workstation tier
  'RTX4090', 'RTX4080',    // consumer high-end tier
  'RTX3090', 'RTX3080',    // consumer previous-gen tier
]);

/**
 * Normalise a gpu_type value for allowlist comparison.
 * Strips all non-alphanumeric characters and converts to uppercase.
 * e.g. "RTX 4090" → "RTX4090", "rtx-4090" → "RTX4090"
 */
function normalizeGpuType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
}

/**
 * Validate gpu_requirements.gpu_type against the known allowlist.
 * Returns null when valid, or an error string when invalid.
 */
function validateGpuType(gpuType) {
  if (gpuType == null) return null; // omitted → any GPU, always allowed
  const normalized = normalizeGpuType(gpuType);
  if (!normalized) return null;     // empty string after normalisation → treat as omitted
  if (ALLOWED_GPU_TYPES.has(normalized)) return null;
  return `Invalid gpu_requirements.gpu_type '${gpuType}'. Allowed values: ${[...ALLOWED_GPU_TYPES].join(', ')}`;
}

// Lazy-load jobRouter to avoid module-load ordering issues
let _jobRouter;
function getJobRouter() {
  if (!_jobRouter) _jobRouter = require('../services/jobRouter');
  return _jobRouter;
}

// Lazy-load jobScheduler for enhanced resource matching
let _jobScheduler;
function getJobScheduler() {
  if (!_jobScheduler) _jobScheduler = require('../services/jobScheduler');
  return _jobScheduler;
}

// POST /api/jobs/submit — requires renter auth
// provider_id is optional: omit to auto-route to best GPU-fit provider (DCP-205)
router.post('/submit', requireRenter, validateBody(jobSubmitSchema), (req, res) => {
  try {
    const {
      provider_id: reqProviderId,
      template_id: reqTemplateId,
      bundle_id: reqBundleId,
      duration_minutes,
      gpu_requirements: reqGpuRequirements,
      container_spec: reqContainerSpec,
      task_spec,
      params: bodyParams,
      max_duration_seconds,
      priority: reqPriority,
      model: requestedModel,
      pricing_class: requestedPricingClass,
      prewarm_requested: requestedPrewarm,
    } = req.body;

    // Bundle definitions — matches GET /api/templates/bundles
    const BUNDLE_DEFINITIONS = {
      'arabic-rag': {
        job_type: 'rag-pipeline',
        min_vram_gb: 24,
        components: [
          { role: 'embed',    model: 'BAAI/bge-m3',              port: 8001 },
          { role: 'rerank',   model: 'BAAI/bge-reranker-v2-m3', port: 8002 },
          { role: 'generate', model: 'allam-7b-instruct',         port: 8003 },
        ],
        pricing_class: 'standard',
      },
    };

    // Resolve bundle if bundle_id provided — expands to multi-component job_type + VRAM
    let resolvedBundle = null;
    if (reqBundleId) {
      resolvedBundle = BUNDLE_DEFINITIONS[reqBundleId] || null;
      if (!resolvedBundle) {
        return res.status(404).json({
          error: `Bundle '${reqBundleId}' not found`,
          available_bundles: Object.keys(BUNDLE_DEFINITIONS),
        });
      }
    }

    // Resolve docker template if templateId provided — overrides job_type, min_vram, image defaults
    let resolvedTemplate = null;
    if (reqTemplateId) {
      resolvedTemplate = loadDockerTemplate(reqTemplateId);
      if (!resolvedTemplate) {
        return res.status(404).json({ error: `Template '${reqTemplateId}' not found` });
      }
    }

    const job_type = req.body.job_type || resolvedBundle?.job_type || resolvedTemplate?.job_type;
    const gpu_requirements = reqGpuRequirements
      || (resolvedBundle?.min_vram_gb ? { min_vram_gb: resolvedBundle.min_vram_gb } : undefined)
      || (resolvedTemplate?.min_vram_gb ? { min_vram_gb: resolvedTemplate.min_vram_gb } : undefined);
    const container_spec = reqContainerSpec || (resolvedTemplate?.image && resolvedTemplate.image !== 'custom'
      ? { image_override: resolvedTemplate.image }
      : undefined);

    const jobPriority = parsePriority(reqPriority);
    const payloadModel = normalizeModelField(requestedModel);
    const durationMinutes = toFiniteNumber(duration_minutes, { min: 0.01, max: 1440 });
    const requestedProviderId = reqProviderId == null ? null : toFiniteInt(reqProviderId, { min: 1 });

    if (!job_type || durationMinutes == null) {
      return res.status(400).json({ error: 'Missing required fields: job_type (or templateId), duration_minutes' });
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({ error: 'duration_minutes must be a positive number' });
    }
    if (reqProviderId != null && requestedProviderId == null) {
      return res.status(400).json({ error: 'provider_id must be a positive integer' });
    }

    // Whitelist check — only allow known job types
    if (!ALLOWED_JOB_TYPES.has(job_type)) {
      return res.status(400).json({ error: `Invalid job_type. Allowed: ${[...ALLOWED_JOB_TYPES].join(', ')}` });
    }

    // S1-02: Reject unrecognised GPU model strings before they reach the scheduler.
    // Prevents injection of arbitrary strings into scheduling/billing logic.
    const gpuTypeError = validateGpuType(gpu_requirements?.gpu_type);
    if (gpuTypeError) {
      return res.status(400).json({ error: gpuTypeError, code: 'INVALID_GPU_TYPE' });
    }

    // DCP-SEC-001: Reject Jupyter jobs with default or missing NOTEBOOK_TOKEN (HIGH)
    // 'dc1jupyter' is publicly visible in the repo; any attacker can authenticate
    // to a renter notebook and execute arbitrary code / exfiltrate data from the GPU.
    const isJupyterJob = resolvedTemplate?.id === 'jupyter-gpu'
      || (job_type === 'training' && bodyParams?.script_type === 'jupyter');
    if (isJupyterJob) {
      const notebookToken = bodyParams?.NOTEBOOK_TOKEN;
      const WEAK_TOKENS = new Set(['dc1jupyter', '', 'jupyter', 'password', 'token']);
      if (!notebookToken || WEAK_TOKENS.has(String(notebookToken).trim())) {
        return res.status(400).json({
          error: 'NOTEBOOK_TOKEN must be a unique, non-default value. Generate a random token (e.g. a UUID) and pass it as params.NOTEBOOK_TOKEN.',
          code: 'WEAK_NOTEBOOK_TOKEN',
        });
      }
    }

    // Block raw Python task_spec from renters — all execution must go through templates
    // Raw Python means arbitrary code execution on provider hardware
    if (looksLikeRawPythonTaskSpec(task_spec)) {
      return res.status(400).json({
        error: 'Raw Python task_spec is not allowed. Use the params field with a supported job_type instead.',
        docs: 'POST /api/jobs/submit with { job_type, params: { prompt, model, ... } }'
      });
    }

    if (container_spec != null && !isPlainObject(container_spec)) {
      return res.status(400).json({ error: 'container_spec must be an object when provided' });
    }
    const containerSpecInput = isPlainObject(container_spec)
      ? container_spec
      : buildLegacyContainerSpec(job_type);
    const normalizedContainer = normalizeContainerSpec(containerSpecInput);
    if (normalizedContainer.error) {
      return res.status(400).json({ error: normalizedContainer.error });
    }
    const pricingClass = normalizePricingClass(requestedPricingClass || normalizedContainer.value?.pricing_class);
    const prewarmRequested = requestedPrewarm === true || normalizedContainer.value?.prewarm_requested === true;
    normalizedContainer.value.pricing_class = pricingClass;
    if (prewarmRequested) {
      normalizedContainer.value.prewarm_requested = true;
    } else if (normalizedContainer.value.prewarm_requested) {
      delete normalizedContainer.value.prewarm_requested;
    }
    const containerSpecJson = JSON.stringify(normalizedContainer.value);

    // ── Provider resolution ───────────────────────────────────────────────────
    // If provider_id given: validate it directly (manual selection).
    // If omitted: auto-route to best GPU-fit provider via jobRouter (DCP-205).
    let provider = null;
    let provider_id = null;
    let routedMatchFound = false;

    if (requestedProviderId != null) {
      // Manual provider selection — validate existence and heartbeat freshness
      provider = db.get('SELECT * FROM providers WHERE id = ?', requestedProviderId);
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }
      // Graduated heartbeat check (mirrors DCP-183): offline after 10 min silence
      const heartbeatAgeSecs = provider.last_heartbeat
        ? (Date.now() - new Date(provider.last_heartbeat).getTime()) / 1000
        : Infinity;
      const normalizedProviderStatus = String(provider.status || '').toLowerCase();
      const explicitlyUnavailable = new Set(['offline', 'paused', 'banned', 'suspended']);
      const hasRecentHeartbeat = Number.isFinite(heartbeatAgeSecs) && heartbeatAgeSecs <= 600;
      const onlineSignal = normalizedProviderStatus === 'online' || hasRecentHeartbeat;
      if (explicitlyUnavailable.has(normalizedProviderStatus) || !onlineSignal) {
        return res.status(400).json({ error: 'Provider is not online', provider_status: provider.status });
      }
      provider_id = provider.id;
      routedMatchFound = true;
    } else {
      // Auto-routing: pick best available provider matching VRAM + uptime criteria
      const minVramGb = toFiniteNumber(gpu_requirements?.min_vram_gb, { min: 0, max: 1024 }) || 0;
      const globalRate = COST_RATES[job_type] || COST_RATES['default'];

      // Use enhanced jobScheduler for GPU type matching support, with jobRouter fallback
      const useScheduler = process.env.USE_JOB_SCHEDULER !== 'false'; // default true
      let routed;

      if (useScheduler) {
        // Enhanced routing with GPU type matching
        // NOTE: gpu_type comes from gpu_requirements.gpu_type (e.g. "A100", "RTX4090"),
        // NOT from the model field which is an ML model name (e.g. "mistralai/Mistral-7B").
        const requestedGpuType = normalizeString(gpu_requirements?.gpu_type) || null;
        routed = getJobScheduler().findBestProviderJobRouter({
          job_type,
          min_vram_gb: minVramGb,
          globalRateHalala: globalRate,
          pricing_class: pricingClass,
          gpu_type: requestedGpuType,
        });
      } else {
        // Legacy jobRouter for compatibility
        routed = getJobRouter().findBestProvider({
          job_type,
          min_vram_gb: minVramGb,
          globalRateHalala: globalRate,
          pricing_class: pricingClass,
        });
      }

      if (routed) {
        provider = db.get('SELECT * FROM providers WHERE id = ?', routed.provider.id);
        provider_id = routed.provider.id;
        routedMatchFound = true;
        console.log(`[jobs/submit] Auto-routed job (${job_type}) to provider #${provider_id} (${provider.name})`);
      } else {
        console.log(`[jobs/submit] No capable provider online. Queueing job (${job_type}) globally.`);
      }
    }

    // Validate cached-model tier (Sprint 25 Gap 5)
    // If prewarm was requested, verify provider has model cached before routing
    if (prewarmRequested && provider && model) {
      let cachedModels = [];
      try {
        cachedModels = JSON.parse(provider.cached_models || '[]');
      } catch (_) {
        cachedModels = [];
      }
      // Check if the requested model is in the provider's cached models
      if (!Array.isArray(cachedModels) || !cachedModels.includes(model)) {
        console.log(`[jobs/submit] Prewarm requested for model '${model}' but not cached on provider #${provider_id}. Queueing instead.`);
        // Don't assign to this provider if model isn't cached
        provider_id = null;
        routedMatchFound = false;
      }
    }

    // Check if provider is busy (has a running or pending job)
    let busyJob = null;
    if (provider_id != null) {
      busyJob = db.get(
        `SELECT id, job_id, status FROM jobs WHERE provider_id = ? AND status IN ('running', 'pending')`,
        provider_id
      );
    }
    const isQueued = !routedMatchFound || !!busyJob; // queued if no match or assigned provider is busy

    // Validate GPU requirements if specified
    if (gpu_requirements != null && !isPlainObject(gpu_requirements)) {
      return res.status(400).json({ error: 'gpu_requirements must be an object' });
    }
    if (gpu_requirements && provider) {
      const req_vram = toFiniteNumber(gpu_requirements.min_vram_gb, { min: 0, max: 1024 });
      const providerVram = provider.gpu_vram_mib ? provider.gpu_vram_mib / 1024 : provider.vram_gb;
      if (req_vram && providerVram && providerVram < req_vram) {
        return res.status(400).json({
          error: 'Provider does not meet GPU requirements',
          required_vram_gb: req_vram,
          provider_vram_gb: providerVram
        });
      }
    }

    const gpuModel = provider?.gpu_model || gpu_requirements?.gpu_type || null;
    const cost_halala = calculateCostHalala(job_type, durationMinutes, pricingClass, gpuModel);
    const gpuRateSnapshot = pricingService.estimateCost(
      gpuModel, durationMinutes * 60, normalizePricingClass(pricingClass), job_type
    ).gpu_rate_snapshot;

    // Balance must be positive before any submission is accepted.
    if (req.renter.balance_halala <= 0) {
      logQuotaCheck(req.renter.id, 'balance_positive', false, 1, req.renter.balance_halala, cost_halala, 'zero_balance');
      return res.status(402).json({
        error: 'Balance is zero. Please top up your renter wallet before submitting jobs.',
        balance_halala: req.renter.balance_halala,
        required_halala: cost_halala
      });
    }

    // Ensure renter quota row exists, then evaluate daily/monthly limits.
    try {
      runStatement(
        `INSERT OR IGNORE INTO renter_quota (renter_id, daily_jobs_limit, monthly_spend_limit_halala, created_at, updated_at)
         VALUES (?, 100, 10000, ?, ?)`,
        req.renter.id,
        new Date().toISOString(),
        new Date().toISOString()
      );
    } catch (_) {
      // Compatibility: older test/mocked schemas may not include renter_quota.
    }
    const renterQuota = db.get(
      `SELECT renter_id, daily_jobs_limit, monthly_spend_limit_halala FROM renter_quota WHERE renter_id = ?`,
      req.renter.id
    );
    const dailyJobs = db.get(
      `SELECT COUNT(*) AS total FROM jobs
       WHERE renter_id = ? AND date(COALESCE(submitted_at, created_at)) = date('now')`,
      req.renter.id
    ) || { total: 0 };
    const monthlySpend = db.get(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala)), 0) AS total FROM jobs
       WHERE renter_id = ? AND strftime('%Y-%m', COALESCE(submitted_at, created_at)) = strftime('%Y-%m', 'now')`,
      req.renter.id
    ) || { total: 0 };

    const projectedDailyJobs = Number(dailyJobs.total || 0) + 1;
    const projectedMonthlySpend = Number(monthlySpend.total || 0) + Number(cost_halala || 0);

    const dailyJobsLimit = Number(renterQuota?.daily_jobs_limit || 100);
    const monthlySpendLimitHalala = Number(renterQuota?.monthly_spend_limit_halala || 10000);
    const dailyAllowed = projectedDailyJobs <= dailyJobsLimit;
    logQuotaCheck(
      req.renter.id,
      'daily_jobs_limit',
      dailyAllowed,
      dailyJobsLimit,
      Number(dailyJobs.total || 0),
      1,
      dailyAllowed ? 'ok' : 'daily_limit_exceeded'
    );
    if (!dailyAllowed) {
      return res.status(429).json({
        error: 'Daily job submission quota exceeded',
        daily_jobs_limit: dailyJobsLimit,
        submitted_today: Number(dailyJobs.total || 0)
      });
    }

    const monthlyAllowed = projectedMonthlySpend <= monthlySpendLimitHalala;
    logQuotaCheck(
      req.renter.id,
      'monthly_spend_limit_halala',
      monthlyAllowed,
      monthlySpendLimitHalala,
      Number(monthlySpend.total || 0),
      Number(cost_halala || 0),
      monthlyAllowed ? 'ok' : 'monthly_spend_limit_exceeded'
    );
    if (!monthlyAllowed) {
      return res.status(429).json({
        error: 'Monthly spend quota exceeded',
        monthly_spend_limit_halala: monthlySpendLimitHalala,
        spent_this_month_halala: Number(monthlySpend.total || 0),
        requested_halala: Number(cost_halala || 0)
      });
    }

    // ── Pre-pay balance check ──────────────────────────────────────────
    // Renter must have enough balance to cover estimated job cost
    if (req.renter.balance_halala < cost_halala) {
      logQuotaCheck(
        req.renter.id,
        'balance_coverage',
        false,
        req.renter.balance_halala,
        req.renter.balance_halala,
        cost_halala,
        'insufficient_balance'
      );
      return res.status(402).json({
        error: 'Insufficient balance',
        balance_halala: req.renter.balance_halala,
        required_halala: cost_halala,
        shortfall_halala: cost_halala - req.renter.balance_halala,
        message: `Top up at least ${Math.ceil((cost_halala - req.renter.balance_halala) / 100)} SAR to submit this job. POST /api/renters/topup`
      });
    }
    logQuotaCheck(
      req.renter.id,
      'balance_coverage',
      true,
      req.renter.balance_halala,
      req.renter.balance_halala,
      cost_halala,
      'ok'
    );

    // Validate/prepare task payload before touching renter balance.
    let finalTaskSpec = task_spec;
    let result_type = 'text'; // default result type

    if (JOB_TEMPLATES[job_type]) {
      let params = {};
      if (bodyParams != null && !isPlainObject(bodyParams)) {
        return res.status(400).json({ error: 'params must be an object' });
      }
      if (bodyParams && Object.keys(bodyParams).length > 0) {
        params = { ...bodyParams };
      } else if (task_spec) {
        params = typeof task_spec === 'string' ? (() => { try { return JSON.parse(task_spec); } catch { return { prompt: task_spec }; } })() : task_spec;
      }
      if (payloadModel && !params.model) {
        params.model = payloadModel;
      }

      // DCP-SEC-003: Validate image_override for custom_container jobs against the approved registry.
      // Without this check a renter could run arbitrary Docker images on provider hardware.
      if (job_type === 'custom_container' && params.image_override) {
        const imgValidation = validateAndNormalizeImageRef(params.image_override);
        if (imgValidation.error) {
          return res.status(400).json({ error: `params.image_override: ${imgValidation.error}` });
        }
        if (!isApprovedImageRef(db, imgValidation.value)) {
          return res.status(400).json({
            error: 'params.image_override is not in the approved image registry. Use GET /api/containers/registry for allowed images.',
            code: 'IMAGE_NOT_APPROVED',
          });
        }
        params.image_override = imgValidation.value; // normalised form
      }

      finalTaskSpec = JOB_TEMPLATES[job_type](params);
      result_type = job_type === 'image_generation' ? 'image' : job_type === 'vllm_serve' ? 'endpoint' : 'text';
    }
    // If a bundle was resolved, inject bundle metadata into the task spec so providers
    // know which multi-model stack to launch. This overrides any template-derived spec.
    if (resolvedBundle && !finalTaskSpec) {
      const bundlePayload = {
        job_type: resolvedBundle.job_type,
        bundle_id: reqBundleId,
        components: resolvedBundle.components,
        params: isPlainObject(bodyParams) ? bodyParams : {},
      };
      finalTaskSpec = JSON.stringify(bundlePayload);
    }

    if (!finalTaskSpec) {
      // Legacy compatibility: older suites submit non-template job types without task_spec.
      // Keep assignment flow functional by storing a deterministic minimal payload.
      const fallbackPayload = {
        job_type,
        params: isPlainObject(bodyParams) ? bodyParams : {},
      };
      finalTaskSpec = JSON.stringify(fallbackPayload);
    }
    const effectiveModel = normalizeModelField(bodyParams?.model) || payloadModel;

    const taskSpecStr = finalTaskSpec ? (typeof finalTaskSpec === 'string' ? finalTaskSpec : JSON.stringify(finalTaskSpec)) : null;
    const taskSpecHmac = taskSpecStr ? signTaskSpec(taskSpecStr) : null;
    const now = new Date().toISOString();
    const job_id = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const workspaceVolumeName = `dcp-job-${job_id}`;
    const checkpointEnabled = normalizedContainer.value?.enable_checkpoint === true ? 1 : 0;

    // Job timeout: default 30 minutes, max 1 hour
    const requestedTimeoutSeconds = toFiniteInt(max_duration_seconds, { min: 60, max: 3600 });
    const timeout = requestedTimeoutSeconds || 1800;
    const timeoutAt = new Date(Date.now() + timeout * 1000).toISOString().replace('T', ' ').replace('Z', '');

    // If provider is busy, job goes into 'queued'; otherwise 'pending' (ready for daemon)
    const initialStatus = isQueued ? 'queued' : 'pending';

    const createJobTx = createTransaction(() => {
      // DCP-777: Atomic balance guard — AND balance_halala >= ? ensures the deduction
      // fails (changes=0) if funds were already spent by a concurrent request.
      // Defense-in-depth for future async refactors of this path.
      const deductResult = runStatement(
        `UPDATE renters
         SET balance_halala = balance_halala - ?,
             updated_at = ?
         WHERE id = ? AND balance_halala >= ?`,
        cost_halala,
        now,
        req.renter.id,
        cost_halala
      );
      if (deductResult.changes === 0) {
        throw Object.assign(new Error('Insufficient balance at commit time'), { code: 'INSUFFICIENT_BALANCE_AT_COMMIT' });
      }

      const templateIdValue = resolvedTemplate?.id || reqTemplateId || null;
      const gpuRateSnapshotJson = gpuRateSnapshot ? JSON.stringify(gpuRateSnapshot) : null;
      const insertResult = HAS_TEMPLATE_ID
        ? runStatement(
            `INSERT INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at, duration_minutes,
              cost_halala, gpu_requirements, container_spec, task_spec, task_spec_hmac, max_duration_seconds, timeout_at,
              notes, created_at, priority, pricing_class, prewarm_requested, workspace_volume_name, checkpoint_enabled, template_id, gpu_rate_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            job_id, provider_id, req.renter.id, job_type, effectiveModel, initialStatus, now, durationMinutes, cost_halala,
            gpu_requirements ? JSON.stringify(gpu_requirements) : null,
            containerSpecJson,
            taskSpecStr,
            taskSpecHmac,
            timeout,
            isQueued ? null : timeoutAt,
            null,
            now,
            jobPriority,
            pricingClass,
            prewarmRequested ? 1 : 0,
            workspaceVolumeName,
            checkpointEnabled,
            templateIdValue,
            gpuRateSnapshotJson
          )
        : runStatement(
            `INSERT INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at, duration_minutes,
              cost_halala, gpu_requirements, container_spec, task_spec, task_spec_hmac, max_duration_seconds, timeout_at,
              notes, created_at, priority, pricing_class, prewarm_requested, workspace_volume_name, checkpoint_enabled, gpu_rate_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            job_id, provider_id, req.renter.id, job_type, effectiveModel, initialStatus, now, durationMinutes, cost_halala,
            gpu_requirements ? JSON.stringify(gpu_requirements) : null,
            containerSpecJson,
            taskSpecStr,
            taskSpecHmac,
            timeout,
            isQueued ? null : timeoutAt,
            null,
            now,
            jobPriority,
            pricingClass,
            prewarmRequested ? 1 : 0,
            workspaceVolumeName,
            checkpointEnabled,
            gpuRateSnapshotJson
          );

      runStatement(
        `UPDATE renters
         SET total_jobs = total_jobs + 1,
             updated_at = ?
         WHERE id = ?`,
        now,
        req.renter.id
      );
      return insertResult.lastInsertRowid;
    });
    const newJobId = createJobTx();
    const job = db.get('SELECT * FROM jobs WHERE id = ?', newJobId);
    recordLifecycleEvent(job, 'job.submitted', {
      status: initialStatus,
      source: 'renter',
      message: initialStatus === 'queued' ? 'Job submitted and queued' : 'Job submitted and pending provider assignment',
      payload: {
        renter_id: req.renter.id,
        provider_id: provider_id || null,
        job_type,
        model: effectiveModel || null,
        pricing_class: pricingClass,
        queue_state: initialStatus,
        max_duration_seconds: timeout,
      },
    });

    // Lifecycle hook for pre-warm orchestration: mark target provider/model so
    // daemon/control-plane can pre-load the model before execution.
    if (provider_id != null && prewarmRequested && effectiveModel) {
      runStatement(
        `UPDATE providers
         SET model_preload_status = 'warming',
             model_preload_model = ?,
             model_preload_requested_at = ?,
             model_preload_updated_at = ?
         WHERE id = ?`,
        effectiveModel,
        now,
        now,
        provider_id
      );
    }

    // ── Create escrow hold — funds are locked pending job execution ────────
    // Escrow expires at job timeout + 30-minute settlement buffer
    const escrowExpiresAt = new Date(Date.now() + (timeout + 1800) * 1000).toISOString();
    const renterKey = req.headers['x-renter-key'] || req.query.renter_key;
    if (provider_id != null) {
      try {
        runStatement(
          `INSERT INTO escrow_holds (id, renter_api_key, provider_id, job_id, amount_halala, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, 'held', ?, ?)`,
          'esc-' + job_id, renterKey, provider_id, job_id, cost_halala, now, escrowExpiresAt
        );
      } catch (e) {
        console.error('[escrow] Failed to create hold for job', job_id, ':', e.message);
      }
    }

    // On-chain escrow (opt-in via ESCROW_CONTRACT_ADDRESS) — fire-and-forget, never blocks job creation
    const chainEscrow = getChainEscrow();
    if (chainEscrow.isEnabled() && provider_id != null) {
      const expiryMs = new Date(escrowExpiresAt).getTime();
      chainEscrow.depositAndLock(job_id, provider?.wallet_address || null, cost_halala, expiryMs)
        .catch(err => console.error('[escrow-chain] depositAndLock async error:', err.message));
    }

    // Calculate queue position if queued
    const queue_position = isQueued ? getQueuePosition(job) : null;

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        job_id: job.job_id,
        provider_id: job.provider_id,
        renter_id: job.renter_id,
        job_type: job.job_type,
        model: job.model || effectiveModel,
        status: job.status,
        submitted_at: job.submitted_at,
        started_at: job.started_at,
        duration_minutes: job.duration_minutes,
        cost_halala: job.cost_halala,
        max_duration_seconds: timeout,
        timeout_at: job.timeout_at,
        gpu_requirements: job.gpu_requirements ? JSON.parse(job.gpu_requirements) : null,
        container_spec: normalizedContainer.value,
        workspace_volume_name: workspaceVolumeName,
        checkpoint_enabled: checkpointEnabled === 1,
        task_spec_signed: !!taskSpecHmac,
        priority: jobPriority,
        pricing_class: pricingClass,
        prewarm_requested: prewarmRequested,
        queue_position: queue_position,
        ...(resolvedBundle ? { bundle_id: reqBundleId, bundle_components: resolvedBundle.components } : {}),
      },
      ...(isQueued
        ? {
          queued: true,
          message: routedMatchFound
            ? `Provider is busy. Your job is #${queue_position} in queue and will run automatically when the provider is free.`
            : `No capable provider is currently available. Your job is queued at position #${queue_position} and will start when a matching provider heartbeats.`
        }
        : {})
    });

    fireAndForgetJobEmail('queued', job, {
      quoted_cost_halala: Number(cost_halala || 0),
      queue_position,
      estimated_duration_minutes: Number(durationMinutes || 0),
    });

    // Analytics: renter_deployment_start
    analytics.renter.deploymentStart(job.renter_id, job.job_id, job.model || effectiveModel, {
      job_type: job.job_type,
      pricing_class: pricingClass,
    }).catch(() => {});
    conversionFunnel.trackStage({
      journey: 'renter',
      stage: 'first_action',
      actorType: 'renter',
      actorId: job.renter_id,
      req,
      metadata: {
        action: 'job_submit',
        job_id: job.job_id,
        job_type: job.job_type,
      },
    });
  } catch (error) {
    console.error('Job submit error:', error);
    res.status(500).json({ error: 'Job submission failed' });
  }
});

// POST /api/jobs/:job_id/retry?key=RENTER_KEY
// Clones a failed renter-owned job into a fresh submission and re-holds escrow.
router.post('/:job_id/retry', retryJobLimiter, requireRenter, (req, res) => {
  try {
    const sourceJob = db.get(
      `SELECT * FROM jobs
       WHERE (id = ? OR job_id = ?) AND renter_id = ?
       LIMIT 1`,
      req.params.job_id,
      req.params.job_id,
      req.renter.id
    );
    if (!sourceJob) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (sourceJob.status !== 'failed') {
      return res.status(400).json({
        error: 'Only failed jobs can be retried',
        current_status: sourceJob.status,
      });
    }

    const parsedDuration = toFiniteNumber(sourceJob.duration_minutes, { min: 0.01, max: 1440 });
    const durationMinutes = parsedDuration != null ? parsedDuration : 1;
    const quotedCostHalala = calculateCostHalala(sourceJob.job_type, durationMinutes, sourceJob.pricing_class);

    const renter = db.get(
      'SELECT id, balance_halala FROM renters WHERE id = ? AND status = ?',
      req.renter.id,
      'active'
    );
    if (!renter) {
      return res.status(403).json({ error: 'Invalid or inactive renter API key' });
    }
    if (renter.balance_halala < quotedCostHalala) {
      return res.status(402).json({
        error: 'insufficient_balance',
        required_halala: quotedCostHalala,
        available_halala: renter.balance_halala,
      });
    }

    let normalizedContainerValue = null;
    if (sourceJob.container_spec) {
      try {
        const parsedContainerSpec = JSON.parse(sourceJob.container_spec);
        const normalizedContainer = normalizeContainerSpec(parsedContainerSpec);
        if (normalizedContainer.error) {
          return res.status(400).json({ error: normalizedContainer.error });
        }
        normalizedContainerValue = normalizedContainer.value;
      } catch (_) {
        return res.status(400).json({ error: 'Original job has invalid container_spec and cannot be retried' });
      }
    } else {
      return res.status(400).json({ error: 'Original job is missing container_spec and cannot be retried' });
    }

    const now = new Date().toISOString();
    const job_id = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const priority = parsePriority(sourceJob.priority);
    const timeout = toFiniteInt(sourceJob.max_duration_seconds, { min: 60, max: 3600 }) || 1800;
    const requestedProviderId = toFiniteInt(sourceJob.provider_id, { min: 1 });
    let provider_id = requestedProviderId;
    let provider = null;
    let busyJob = null;
    let routedMatchFound = false;

    if (requestedProviderId != null) {
      provider = db.get('SELECT * FROM providers WHERE id = ?', requestedProviderId);
      if (provider) {
        const heartbeatAgeSecs = provider.last_heartbeat
          ? (Date.now() - new Date(provider.last_heartbeat).getTime()) / 1000
          : Infinity;
        busyJob = db.get(
          `SELECT id FROM jobs
           WHERE provider_id = ? AND status IN ('running', 'pending')`,
          provider.id
        );
        if (heartbeatAgeSecs <= 600) {
          routedMatchFound = true;
        }
      } else {
        provider_id = null;
      }
    }
    const isQueued = !routedMatchFound || !!busyJob;
    const timeoutAt = isQueued
      ? null
      : new Date(Date.now() + timeout * 1000).toISOString().replace('T', ' ').replace('Z', '');

    const taskSpecStr = sourceJob.task_spec
      ? (typeof sourceJob.task_spec === 'string' ? sourceJob.task_spec : JSON.stringify(sourceJob.task_spec))
      : null;
    const taskSpecHmac = taskSpecStr ? signTaskSpec(taskSpecStr) : null;
    const pricingClass = normalizePricingClass(sourceJob.pricing_class || normalizedContainerValue.pricing_class);
    const prewarmRequested = Number(sourceJob.prewarm_requested || 0) === 1 || normalizedContainerValue.prewarm_requested === true;
    normalizedContainerValue.pricing_class = pricingClass;
    if (prewarmRequested) normalizedContainerValue.prewarm_requested = true;
    else delete normalizedContainerValue.prewarm_requested;
    const containerSpecJson = JSON.stringify(normalizedContainerValue);
    const workspaceVolumeName = `dcp-job-${job_id}`;
    const checkpointEnabled = normalizedContainerValue.enable_checkpoint === true ? 1 : 0;
    const renterKey = req.headers['x-renter-key'] || req.query.renter_key || req.query.key;
    const escrowExpiresAt = new Date(Date.now() + (timeout + 1800) * 1000).toISOString();

    const createRetryJobTx = createTransaction(() => {
      // DCP-777: Same atomic balance guard as main submit path.
      const deductResult = runStatement(
        `UPDATE renters
         SET balance_halala = balance_halala - ?
         WHERE id = ? AND balance_halala >= ?`,
        quotedCostHalala,
        renter.id,
        quotedCostHalala
      );
      if (deductResult.changes === 0) {
        throw Object.assign(new Error('Insufficient balance at commit time'), { code: 'INSUFFICIENT_BALANCE_AT_COMMIT' });
      }

      const insertSql = HAS_RETRIED_FROM_JOB_ID
        ? `INSERT INTO jobs (
             job_id, provider_id, renter_id, job_type, model, status, submitted_at, duration_minutes,
             cost_halala, gpu_requirements, container_spec, task_spec, task_spec_hmac, max_duration_seconds,
             timeout_at, notes, created_at, priority, pricing_class, prewarm_requested, workspace_volume_name, checkpoint_enabled, retried_from_job_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO jobs (
             job_id, provider_id, renter_id, job_type, model, status, submitted_at, duration_minutes,
             cost_halala, gpu_requirements, container_spec, task_spec, task_spec_hmac, max_duration_seconds,
             timeout_at, notes, created_at, priority, pricing_class, prewarm_requested, workspace_volume_name, checkpoint_enabled
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const insertParams = [
        job_id,
        provider_id,
        renter.id,
        sourceJob.job_type,
        sourceJob.model || null,
        isQueued ? 'queued' : 'pending',
        now,
        durationMinutes,
        quotedCostHalala,
        sourceJob.gpu_requirements || null,
        containerSpecJson,
        taskSpecStr,
        taskSpecHmac,
        timeout,
        timeoutAt,
        sourceJob.notes || null,
        now,
        priority,
        pricingClass,
        prewarmRequested ? 1 : 0,
        workspaceVolumeName,
        checkpointEnabled,
      ];
      if (HAS_RETRIED_FROM_JOB_ID) {
        insertParams.push(sourceJob.id);
      }
      const insertResult = runStatement(insertSql, insertParams);

      if (provider_id != null) {
        runStatement(
          `INSERT INTO escrow_holds (id, renter_api_key, provider_id, job_id, amount_halala, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, 'held', ?, ?)`,
          `esc-${job_id}`,
          renterKey,
          provider_id,
          job_id,
          quotedCostHalala,
          now,
          escrowExpiresAt
        );
      }

      return insertResult.lastInsertRowid;
    });

    const newJobId = createRetryJobTx();
    const newJob = db.get('SELECT * FROM jobs WHERE id = ?', newJobId);
    if (!newJob) {
      return res.status(500).json({ error: 'Retry job creation failed' });
    }
    recordLifecycleEvent(newJob, 'job.retried', {
      status: newJob.status,
      source: 'renter',
      message: 'Retry job created from failed source job',
      payload: {
        source_job_id: sourceJob.job_id,
        retry_count: Number((sourceJob.retry_count || 0) + 1),
        provider_id: newJob.provider_id || null,
        queue_state: newJob.status,
      },
    });

    if (provider_id != null && prewarmRequested && sourceJob.model) {
      runStatement(
        `UPDATE providers
         SET model_preload_status = 'warming',
             model_preload_model = ?,
             model_preload_requested_at = ?,
             model_preload_updated_at = ?
         WHERE id = ?`,
        sourceJob.model,
        now,
        now,
        provider_id
      );
    }

    res.status(201).json({
      success: true,
      job: {
        id: newJob.id,
        job_id: newJob.job_id,
        status: newJob.status,
        job_type: newJob.job_type,
        model: newJob.model,
        cost_halala: newJob.cost_halala,
        provider_id: newJob.provider_id,
        pricing_class: pricingClass,
        prewarm_requested: prewarmRequested,
        retried_from_job_id: HAS_RETRIED_FROM_JOB_ID ? newJob.retried_from_job_id : sourceJob.id,
      },
    });

    fireAndForgetJobEmail('queued', newJob, {
      quoted_cost_halala: Number(quotedCostHalala || 0),
      queue_position: isQueued ? getQueuePosition(newJob) : null,
      estimated_duration_minutes: Number(durationMinutes || 0),
    });
  } catch (error) {
    console.error('Job retry error:', error);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

// GET /api/jobs/assigned?key=API_KEY
// Daemon polls this to check if it has a running job with a task to execute
function fetchAndAssignNextJob(providerId) {
  const job = db.get(
    `SELECT * FROM jobs
     WHERE provider_id = ?
       AND status IN ('pending', 'queued')
       AND task_spec IS NOT NULL
       AND picked_up_at IS NULL
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
       ${PRICING_CLASS_SORT_SQL} ASC,
       COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) DESC,
       created_at ASC
     LIMIT 1`,
    [providerId]
  );

  if (!job) return null;

  const now = new Date().toISOString();
  const timeout = job.max_duration_seconds || 1800;
  const timeoutAt = new Date(Date.now() + timeout * 1000).toISOString().replace('T', ' ').replace('Z', '');
  runStatement(
    `UPDATE jobs
     SET status = 'assigned',
         assigned_at = ?,
         picked_up_at = ?,
         timeout_at = ?
     WHERE id = ?`,
    [now, now, timeoutAt, job.id]
  );
  recordLifecycleEvent(job, 'job.status.changed', {
    status: 'assigned',
    source: 'daemon',
    message: 'Job assigned to provider daemon',
    payload: {
      from_status: job.status,
      to_status: 'assigned',
      provider_id: providerId,
      timeout_at: timeoutAt,
    },
  });

  runStatement(
    `UPDATE escrow_holds SET status = 'locked' WHERE job_id = ? AND status = 'held'`,
    job.job_id
  );

  const updated = db.get('SELECT * FROM jobs WHERE id = ?', [job.id]);
  if (!updated) return null;
  fireAndForgetJobEmail('started', updated, {
    estimated_duration_minutes: Number(updated.duration_minutes || 0),
  });
  updated.gpu_requirements = updated.gpu_requirements ? JSON.parse(updated.gpu_requirements) : null;
  return updated;
}

router.get('/assigned', (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'API key required' });

    const provider = db.get('SELECT * FROM providers WHERE api_key = ?', [key]);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const job = fetchAndAssignNextJob(provider.id);
    if (!job) return res.json({ job: null });

    res.json({ job });
  } catch (error) {
    console.error('Assigned job fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch assigned job' });
  }
});

// GET /api/jobs/queue?key=API_KEY
// Provider fetches the next pending/queued job by priority (DESC), then FIFO.
router.get('/queue', (req, res) => {
  try {
    const key = req.query.key || req.headers['x-provider-key'];
    if (!key) return res.status(400).json({ error: 'Provider API key required' });

    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', [key]);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const job = fetchAndAssignNextJob(provider.id);
    res.json({ job: job || null });
  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch queue job' });
  }
});

// POST /api/jobs/:job_id/result
// Daemon posts execution result; auto-completes the job
router.post('/:job_id/result', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!isAdmin(req)) {
      const provider = getProviderFromReq(req);
      if (!provider || provider.id !== job.provider_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Guard against duplicate settlement — only settle active jobs
    const activeStatuses = ['running', 'assigned', 'pulling'];
    if (!activeStatuses.includes(job.status)) {
      return res.status(409).json({
        error: 'Job already settled',
        current_status: job.status,
        job_id: job.job_id
      });
    }

    const { result, error: jobError, duration_seconds, gpu_util_peak, transient,
      gpu_seconds, storage_gb_seconds, bandwidth_bytes_out, bandwidth_bytes_in } = req.body;
    const jobMaxSeconds = Math.max(job.max_duration_seconds || 3600, 60);
    const durationSeconds = duration_seconds == null ? null : toFiniteNumber(duration_seconds, { min: 0, max: jobMaxSeconds });
    const gpuSeconds = gpu_seconds != null ? Math.max(0, toFiniteNumber(gpu_seconds, { min: 0 })) : durationSeconds;
    const storageGbSeconds = storage_gb_seconds != null ? Math.max(0, toFiniteInt(storage_gb_seconds, { min: 0 })) : 0;
    const bandwidthBytesOut = bandwidth_bytes_out != null ? Math.max(0, toFiniteInt(bandwidth_bytes_out, { min: 0 })) : 0;
    const bandwidthBytesIn = bandwidth_bytes_in != null ? Math.max(0, toFiniteInt(bandwidth_bytes_in, { min: 0 })) : 0;
    if (duration_seconds != null && durationSeconds == null) {
      return res.status(400).json({ error: `duration_seconds must be a finite number between 0 and ${jobMaxSeconds}` });
    }

    // ── Transient failure retry logic ──────────────────────────────────────
    // If daemon reports a transient failure (e.g. Docker pull timeout, temp GPU error)
    // and the job hasn't exceeded max_retries, reset it to 'pending' for re-execution
    if (!result && jobError && transient === true) {
      const retryCount = (job.retry_count || 0) + 1;
      const maxRetries = job.max_retries || 2;
      if (retryCount <= maxRetries) {
        const now = new Date().toISOString();
        const timeout = job.max_duration_seconds || 1800;
        const timeoutAt = new Date(Date.now() + timeout * 1000).toISOString().replace('T', ' ').replace('Z', '');
        const retryReasonClause = HAS_RETRY_REASON ? ', retry_reason = ?' : '';
        const retryReasonParam = HAS_RETRY_REASON ? ['execution_failed'] : [];
        runStatement(
          `UPDATE jobs SET status = 'pending', retry_count = ?, picked_up_at = NULL, assigned_at = NULL,
           timeout_at = ?, error = ?, updated_at = ?${retryReasonClause} WHERE id = ?`,
          [retryCount, timeoutAt, `[retry ${retryCount}/${maxRetries}] ${jobError}`, now, ...retryReasonParam, job.id]
        );
        const retryError = categorizeJobError(jobError, 'pending');
        recordLifecycleEvent(job, 'job.retry.scheduled', {
          status: 'pending',
          source: 'daemon',
          error_category: retryError.category,
          error_code: retryError.code,
          message: `Transient failure, retry ${retryCount}/${maxRetries}`,
          payload: {
            previous_status: job.status,
            retry_count: retryCount,
            max_retries: maxRetries,
            timeout_at: timeoutAt,
            error: String(jobError || ''),
          },
        });
        console.log(`[Retry] Job ${job.job_id}: transient failure, retry ${retryCount}/${maxRetries}`);
        return res.json({
          success: false,
          retry: true,
          attempt: retryCount,
          max_retries: maxRetries,
          job_id: job.job_id,
          message: `Job re-queued for retry ${retryCount}/${maxRetries}`
        });
      }
      // Exhausted retries — fall through to normal failure handling
      console.log(`[Retry] Job ${job.job_id}: transient failure exhausted (${job.retry_count}/${job.max_retries})`);
    }

    const now = new Date().toISOString();
    const { compute_halala, storage_halala, bandwidth_halala, total_halala } = estimateThreeComponentCost({
      gpuModel: job.gpu_model,
      durationSeconds: gpuSeconds || 0,
      storageGbSeconds: storageGbSeconds,
      bandwidthBytesOut: bandwidthBytesOut,
      pricingClass: job.pricing_class,
      jobType: job.job_type,
    });
    const totalCostHalala = Math.max(0, total_halala);
    const { provider: providerEarned, dc1: dc1Fee } = splitBilling(totalCostHalala);
    const settlementStatus = result ? 'completed' : 'failed';
    const settledResult = result == null
      ? null
      : (typeof result === 'string' ? result : JSON.stringify(result));

    runStatement(
      `UPDATE jobs SET
        status = ?,
        result = ?,
        error = ?,
        completed_at = ?,
        actual_duration_minutes = ?,
        actual_cost_halala = ?,
        provider_earned_halala = ?,
        dc1_fee_halala = ?,
        gpu_seconds_used = ?,
        storage_gb_seconds = ?,
        bandwidth_bytes_out = ?,
        bandwidth_bytes_in = ?,
        compute_halala = ?,
        storage_halala = ?,
        bandwidth_halala = ?
      WHERE id = ?`,
      [
        settlementStatus,
        settledResult,
        jobError || null,
        now,
        gpuSeconds != null ? Math.ceil(gpuSeconds / 60) : actualMinutes,
        totalCostHalala,
        providerEarned,
        dc1Fee,
        gpuSeconds || 0,
        storageGbSeconds,
        bandwidthBytesOut,
        bandwidthBytesIn,
        compute_halala,
        storage_halala,
        bandwidth_halala,
        job.id
      ]
    );
    const completionEvent = result ? 'job.completed' : 'job.failed';
    const completionStatus = settlementStatus;
    const completionError = result ? null : categorizeJobError(jobError, completionStatus);
    recordLifecycleEvent(job, completionEvent, {
      status: completionStatus,
      source: 'daemon',
      error_category: completionError?.category || null,
      error_code: completionError?.code || null,
      message: result ? 'Job completed successfully' : 'Job failed without output payload',
      payload: {
        duration_seconds: durationSeconds,
        gpu_seconds: gpuSeconds || 0,
        actual_duration_minutes: gpuSeconds != null ? Math.ceil(gpuSeconds / 60) : actualMinutes,
        actual_cost_halala: totalCostHalala,
        compute_halala,
        storage_halala,
        bandwidth_halala,
        provider_earned_halala: providerEarned,
        dc1_fee_halala: dc1Fee,
        retry_count: Number(job.retry_count || 0),
        error: result ? null : String(jobError || ''),
      },
    });

    if (result) {
      runStatement(
        `UPDATE providers
         SET total_earnings = total_earnings + ?,
             total_earnings_halala = COALESCE(total_earnings_halala, 0) + ?,
             total_jobs = total_jobs + 1
         WHERE id = ?`,
        [providerEarned / 100, providerEarned, job.provider_id]
      );
    }

    // ── Escrow settlement ──────────────────────────────────────────────────
    // Success: job produced output → release held funds to provider
    // Failure: no result → refund renter and release escrow back to them
    if (result) {
      runStatement(
        `UPDATE escrow_holds SET status = 'released_provider', resolved_at = ?
         WHERE job_id = ? AND status IN ('held','locked')`,
        now, job.job_id
      );
      runStatement(
        `UPDATE providers SET claimable_earnings_halala = claimable_earnings_halala + ? WHERE id = ?`,
        providerEarned, job.provider_id
      );
      // On-chain: claim escrow to provider
      const chainEscrow = getChainEscrow();
      if (chainEscrow.isEnabled()) {
        chainEscrow.claimLock(job.job_id)
          .catch(err => console.error('[escrow-chain] claimLock async error:', err.message));
      } else {
        // Simulation log — real claimLock call when ESCROW_CONTRACT_ADDRESS + ESCROW_ORACLE_PRIVATE_KEY are set
        const providerRecord = db.get('SELECT api_key FROM providers WHERE id = ?', job.provider_id);
        console.log(
          `[escrow-sim] claimLock | jobId=${job.job_id}` +
          ` | providerAddress=N/A (no EVM wallet registered)` +
          ` | providerKey=${providerRecord ? providerRecord.api_key.slice(0, 8) + '...' : 'unknown'}` +
          ` | amountHalala=${providerEarned}` +
          ` | dc1FeeHalala=${dc1Fee}`
        );
      }
    } else {
      // Permanent failure — return held amount to renter balance
      runStatement(
        `UPDATE escrow_holds SET status = 'released_renter', resolved_at = ?
         WHERE job_id = ? AND status IN ('held','locked')`,
        now, job.job_id
      );
      if (job.renter_id && job.cost_halala > 0 && !job.refunded_at) {
        runStatement('UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?', job.cost_halala, job.renter_id);
        runStatement('UPDATE jobs SET refunded_at = ? WHERE id = ?', now, job.id);
      }
      // On-chain: cancel expired lock, return funds to renter
      const chainEscrow = getChainEscrow();
      if (chainEscrow.isEnabled()) {
        chainEscrow.cancelExpiredLock(job.job_id)
          .catch(err => console.error('[escrow-chain] cancelExpiredLock async error:', err.message));
      } else {
        // Simulation log — real cancelExpiredLock call when on-chain escrow is configured
        console.log(
          `[escrow-sim] cancelExpiredLock | jobId=${job.job_id}` +
          ` | refundHalala=${job.cost_halala}` +
          ` | reason=job_failed_no_result`
        );
      }
    }

    // ── Auto-dispatch: promote next queued job for this provider ──────
    const promoted = promoteNextQueuedJob(job.provider_id);

    const updated = db.get('SELECT * FROM jobs WHERE id = ?', [job.id]);

    // Fire-and-forget renter callback (if configured). Never blocks settlement response.
    notifyRenterJobWebhook(updated, result ? 'job.completed' : 'job.failed', {
      completed_at: now,
      billing: {
        actual_cost_halala: totalCostHalala,
        provider_earned_halala: providerEarned,
        dc1_fee_halala: dc1Fee,
      },
    }).catch(() => {});

    fireAndForgetJobEmail(result ? 'completed' : 'failed', updated, {
      actual_cost_halala: totalCostHalala,
      gpu_seconds_used: durationSeconds != null ? Number(durationSeconds) : null,
      refunded_amount_halala: Number(job.cost_halala || 0),
      retry_attempts: Number(updated?.retry_count || 0),
      last_error: normalizeString(jobError || updated?.error, { maxLen: 1000 }),
    });

    // Analytics: renter_deployment_complete / renter_deployment_error
    if (result) {
      analytics.renter.deploymentComplete(
        job.renter_id,
        job.job_id,
        job.model || job.job_type,
        durationSeconds != null ? durationSeconds * 1000 : null,
        { cost_halala: totalCostHalala }
      ).catch(() => {});
      conversionFunnel.trackStage({
        journey: 'renter',
        stage: 'first_success',
        actorType: 'renter',
        actorId: job.renter_id,
        req,
        metadata: {
          success_type: 'job_completed',
          job_id: job.job_id,
          cost_halala: totalCostHalala,
        },
      });
    } else {
      analytics.renter.deploymentError(
        job.renter_id,
        job.job_id,
        'execution_failed',
        normalizeString(jobError || updated?.error, { maxLen: 200 })
      ).catch(() => {});
    }

    res.json({
      success: true,
      job: updated,
      billing: {
        actual_cost_halala: totalCostHalala,
        provider_earned_halala: providerEarned,
        dc1_fee_halala: dc1Fee
      },
      ...(promoted ? { next_job_promoted: { job_id: promoted.job_id, renter_id: promoted.renter_id } } : {})
    });
  } catch (error) {
    console.error('Job result error:', error);
    res.status(500).json({ error: 'Failed to record job result' });
  }
});

// GET /api/jobs/active
router.get('/active', (req, res) => {
  try {
    const actor = getAuthenticatedActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let jobs = [];
    if (actor.type === 'admin') {
      jobs = db.all(
        `SELECT * FROM jobs WHERE status IN ('queued', 'pending', 'running', 'paused') ORDER BY submitted_at DESC`
      );
    } else if (actor.type === 'provider') {
      jobs = db.all(
        `SELECT * FROM jobs WHERE provider_id = ? AND status IN ('queued', 'pending', 'running', 'paused') ORDER BY submitted_at DESC`,
        actor.id
      );
    } else {
      jobs = db.all(
        `SELECT * FROM jobs WHERE renter_id = ? AND status IN ('queued', 'pending', 'running', 'paused') ORDER BY submitted_at DESC`,
        actor.id
      );
    }

    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active jobs' });
  }
});

// GET /api/jobs/queue/:provider_id — show queue for a provider
router.get('/queue/:provider_id(\\d+)', (req, res) => {
  try {
    const actor = getAuthenticatedActor(req);
    const providerId = parseInt(req.params.provider_id, 10);
    if (!Number.isInteger(providerId) || providerId <= 0) {
      return res.status(400).json({ error: 'Invalid provider_id' });
    }

    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (actor.type === 'provider' && actor.id !== providerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let jobs = [];
    if (actor.type === 'renter') {
      jobs = db.all(
        `SELECT j.job_id, j.status
         FROM jobs j
         WHERE j.provider_id = ? AND j.renter_id = ? AND j.status IN ('queued', 'pending', 'running')
         ORDER BY CASE j.status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'queued' THEN 2 END,
                  ${PRICING_CLASS_SORT_SQL.replace(/pricing_class/g, 'j.pricing_class')} ASC,
                  COALESCE(j.priority, ${DEFAULT_JOB_PRIORITY}) DESC,
                  j.created_at ASC`,
        providerId, actor.id
      );
    } else {
      jobs = db.all(
        `SELECT j.job_id, j.status
         FROM jobs j
         WHERE j.provider_id = ? AND j.status IN ('queued', 'pending', 'running')
         ORDER BY CASE j.status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'queued' THEN 2 END,
                  ${PRICING_CLASS_SORT_SQL.replace(/pricing_class/g, 'j.pricing_class')} ASC,
                  COALESCE(j.priority, ${DEFAULT_JOB_PRIORITY}) DESC,
                  j.created_at ASC`,
        providerId
      );
    }

    res.json({ queue: jobs, total: jobs.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// GET /api/jobs/queue/status
// Queue depth grouped by compute_type + vram_required_mb.
router.get('/queue/status', (req, res) => {
  try {
    const actor = getAuthenticatedActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const whereParts = [`status = 'queued'`];
    const params = [];
    if (actor?.type === 'provider') {
      whereParts.push('provider_id = ?');
      params.push(actor.id);
    } else if (actor?.type === 'renter') {
      whereParts.push('renter_id = ?');
      params.push(actor.id);
    }

    const queued = db.all(
      `SELECT container_spec, pricing_class, created_at, submitted_at
       FROM jobs
       WHERE ${whereParts.join(' AND ')}
       ORDER BY ${PRICING_CLASS_SORT_SQL} ASC,
                COALESCE(priority, ${DEFAULT_JOB_PRIORITY}) DESC,
                created_at ASC`,
      ...params
    );

    const grouped = new Map();
    for (const row of queued) {
      let containerSpec = null;
      try { containerSpec = row.container_spec ? JSON.parse(row.container_spec) : null; } catch (_) {}

      const computeType = String(containerSpec?.compute_type || 'inference').toLowerCase();
      const vramRequiredMb = Number.isFinite(Number(containerSpec?.vram_required_mb))
        ? Number(containerSpec.vram_required_mb)
        : 0;
      const pricingClass = normalizePricingClass(row.pricing_class || containerSpec?.pricing_class);
      const submittedMs = Date.parse(row.submitted_at || row.created_at || new Date().toISOString());
      const waitSeconds = Number.isFinite(submittedMs)
        ? Math.max(0, Math.round((Date.now() - submittedMs) / 1000))
        : 0;
      const key = `${pricingClass}:${computeType}:${vramRequiredMb}`;
      const bucket = grouped.get(key) || {
        pricing_class: pricingClass,
        compute_type: computeType,
        vram_required_mb: vramRequiredMb,
        depth: 0,
        avg_wait_seconds: 0,
        p95_wait_seconds: 0,
        _waits: [],
      };
      bucket.depth += 1;
      bucket._waits.push(waitSeconds);
      grouped.set(key, bucket);
    }

    const buckets = Array.from(grouped.values()).sort((a, b) => {
      if (a.pricing_class !== b.pricing_class) return pricingClassRank(a.pricing_class) - pricingClassRank(b.pricing_class);
      if (a.compute_type !== b.compute_type) return a.compute_type.localeCompare(b.compute_type);
      return a.vram_required_mb - b.vram_required_mb;
    });
    for (const bucket of buckets) {
      const waits = bucket._waits
        .map((value) => Number(value || 0))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b);
      const avg = waits.length > 0
        ? waits.reduce((sum, value) => sum + value, 0) / waits.length
        : 0;
      const p95 = waits.length > 0 ? waits[Math.min(waits.length - 1, Math.floor((waits.length - 1) * 0.95))] : 0;
      bucket.avg_wait_seconds = Number(avg.toFixed(2));
      bucket.p95_wait_seconds = Number(p95.toFixed(2));
      delete bucket._waits;
    }
    const controlPlane = calculateControlPlaneSignals({ actor, persist: false });

    return res.json({
      queued_total: queued.length,
      buckets,
      control_plane: {
        generated_at: controlPlane.generated_at,
        signal_count: controlPlane.signal_count,
        queue_slo_breaches: controlPlane.queue_slo_breaches,
        cold_start_slo_breaches: controlPlane.cold_start_slo_breaches,
        recommended_scale_up_total: controlPlane.recommended_scale_up_total,
        recommended_scale_down_total: controlPlane.recommended_scale_down_total,
        signals: controlPlane.signals,
      },
      // Backwards-compatible alias for older clients.
      queue: buckets.map((bucket) => ({
        pricing_class: bucket.pricing_class,
        compute_type: bucket.compute_type,
        vram_bucket: bucket.vram_required_mb,
        count: bucket.depth,
      })),
    });
  } catch (error) {
    console.error('Queue status error:', error);
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// POST /api/jobs/:job_id/pause
// Creates a Docker checkpoint and marks the job paused.
router.post('/:job_id/pause', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canControlJob(req, job)) return res.status(403).json({ error: 'Forbidden' });
    if (!ACTIVE_JOB_STATUSES.has(String(job.status || '').toLowerCase())) {
      return res.status(400).json({ error: 'Job is not active', current_status: job.status });
    }
    if (!job.checkpoint_enabled) {
      return res.status(400).json({ error: 'Checkpointing is not enabled for this job' });
    }

    const containerId = resolveJobContainerId(job);
    if (!containerId) {
      return res.status(409).json({ error: 'Active container not found for this job' });
    }

    const checkpointName = safeCheckpointName(job.job_id || job.id);
    const checkpointPath = `/var/lib/docker/containers/${containerId}/checkpoints/${checkpointName}`;
    try {
      runDockerCommand(['checkpoint', 'create', containerId, checkpointName]);
    } catch (error) {
      console.error('[jobs] checkpoint create error:', error);
      return res.status(500).json({ error: 'Failed to create checkpoint' });
    }

    const now = new Date().toISOString();
    runStatement(
      `UPDATE jobs
       SET status = 'paused',
           container_id = ?,
           checkpoint_name = ?,
           checkpoint_path = ?,
           checkpointed_at = ?,
           updated_at = ?
       WHERE id = ?`,
      containerId,
      checkpointName,
      checkpointPath,
      now,
      now,
      job.id
    );
    recordLifecycleEvent(job, 'job.paused', {
      status: 'paused',
      source: 'api',
      message: 'Job paused with Docker checkpoint',
      payload: {
        previous_status: job.status,
        container_id: containerId,
        checkpoint_name: checkpointName,
      },
    });

    return res.json({
      success: true,
      job_id: job.job_id,
      status: 'paused',
      container_id: containerId,
      checkpoint_name: checkpointName,
      checkpoint_path: checkpointPath,
    });
  } catch (error) {
    console.error('Job pause error:', error);
    return res.status(500).json({ error: 'Failed to pause job' });
  }
});

// POST /api/jobs/:job_id/resume
// Resumes a paused Docker container from the last checkpoint.
router.post('/:job_id/resume', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canControlJob(req, job)) return res.status(403).json({ error: 'Forbidden' });
    if (String(job.status || '').toLowerCase() !== 'paused') {
      return res.status(400).json({ error: 'Job is not paused', current_status: job.status });
    }
    if (!job.checkpoint_name) {
      return res.status(400).json({ error: 'No checkpoint found for this job' });
    }

    const containerId = job.container_id || resolveJobContainerId(job);
    if (!containerId) {
      return res.status(409).json({ error: 'Container not found for resume' });
    }

    try {
      runDockerCommand(['start', '--checkpoint', String(job.checkpoint_name), containerId]);
    } catch (error) {
      console.error('[jobs] checkpoint resume error:', error);
      return res.status(500).json({ error: 'Failed to resume checkpoint' });
    }

    const now = new Date().toISOString();
    runStatement(
      `UPDATE jobs
       SET status = 'running',
           container_id = ?,
           updated_at = ?
       WHERE id = ?`,
      containerId,
      now,
      job.id
    );
    recordLifecycleEvent(job, 'job.resumed', {
      status: 'running',
      source: 'api',
      message: 'Job resumed from checkpoint',
      payload: {
        previous_status: job.status,
        container_id: containerId,
        checkpoint_name: job.checkpoint_name,
      },
    });

    return res.json({
      success: true,
      job_id: job.job_id,
      status: 'running',
      container_id: containerId,
      checkpoint_name: job.checkpoint_name,
      checkpoint_path: job.checkpoint_path,
    });
  } catch (error) {
    console.error('Job resume error:', error);
    return res.status(500).json({ error: 'Failed to resume job' });
  }
});

// GET /api/jobs/verify-hmac?job_id=X&hmac=Y
// Daemon can verify a task_spec signature before executing
// Requires valid provider API key (key query param or x-provider-key header)
// IMPORTANT: must be BEFORE /:job_id routes to avoid being caught by param route
router.get('/verify-hmac', (req, res) => {
  try {
    // Auth: require provider key so only daemons can call this
    const providerKey = req.headers['x-provider-key'] || req.query.key;
    if (!providerKey) return res.status(401).json({ error: 'Provider key required' });
    const callerProvider = db.get('SELECT id FROM providers WHERE api_key = ?', [providerKey]);
    if (!callerProvider) return res.status(403).json({ error: 'Invalid provider key' });

    const { job_id, hmac: providedHmac } = req.query;
    if (!job_id || !providedHmac) return res.status(400).json({ error: 'job_id and hmac required' });

    // Ensure this provider owns the job being verified
    const job = db.get('SELECT task_spec_hmac, provider_id FROM jobs WHERE id = ? OR job_id = ?', [job_id, job_id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.provider_id !== callerProvider.id) return res.status(403).json({ error: 'Forbidden' });

    if (!job.task_spec_hmac || providedHmac.length !== job.task_spec_hmac.length) {
      return res.json({ valid: false });
    }

    const valid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(job.task_spec_hmac, 'hex')
    );

    res.json({ valid: !!valid });
  } catch (error) {
    res.json({ valid: false, error: 'Verification failed' });
  }
});

// GET /api/jobs/verify-hmac-local?key=PROVIDER_KEY&hmac=HMAC_VALUE
// Alternate verify endpoint used by legacy daemons without injected HMAC_SECRET
// Validates HMAC against HMAC_SECRET server-side (daemon provides computed value)
// IMPORTANT: must be BEFORE /:job_id routes
router.get('/verify-hmac-local', (req, res) => {
  try {
    const providerKey = req.headers['x-provider-key'] || req.query.key;
    if (!providerKey) return res.status(401).json({ error: 'Provider key required' });
    const callerProvider = db.get('SELECT id FROM providers WHERE api_key = ?', [providerKey]);
    if (!callerProvider) return res.status(403).json({ error: 'Invalid provider key' });

    const { hmac: providedHmac } = req.query;
    if (!providedHmac) return res.status(400).json({ error: 'hmac required' });
    if (!/^[0-9a-f]{64}$/i.test(providedHmac)) return res.json({ valid: false });

    // This endpoint is intentionally limited — daemon must have task_spec_hmac from job poll
    // We verify only that the HMAC length and format are valid (daemon does local verify)
    // Full job-scoped verify requires job_id — use /verify-hmac for that
    res.json({ valid: false, error: 'Use /verify-hmac with job_id for full verification' });
  } catch (error) {
    res.json({ valid: false });
  }
});

// ============================================================================
// GET /api/jobs/history — Renter's recent job history
// IMPORTANT: Must be BEFORE /:job_id to avoid param catch
// ============================================================================
router.get('/history', (req, res) => {
  try {
    const renterKey = req.headers['x-renter-key'];
    if (!renterKey) return res.status(401).json({ error: 'Renter API key required' });

    const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', renterKey, 'active');
    if (!renter) return res.status(401).json({ error: 'Invalid renter key' });

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const jobs = db.all(
      `SELECT j.id, j.job_id, j.job_type, j.status, j.submitted_at, j.started_at,
              j.completed_at, j.progress_phase, j.error, j.actual_cost_halala,
              j.cost_halala, j.actual_duration_minutes, j.duration_minutes,
              j.refunded_at,
              p.name as provider_name, p.gpu_model as provider_gpu
       FROM jobs j
       LEFT JOIN providers p ON j.provider_id = p.id
       WHERE j.renter_id = ?
       ORDER BY j.submitted_at DESC
       LIMIT ?`,
      renter.id, limit
    );

    res.json({
      balance_halala: renter.balance_halala || 0,
      balance_sar: ((renter.balance_halala || 0) / 100).toFixed(2),
      total_jobs: jobs.length,
      jobs: jobs.map(j => ({
        ...j,
        cost_sar: j.actual_cost_halala ? (j.actual_cost_halala / 100).toFixed(2) : (j.cost_halala ? (j.cost_halala / 100).toFixed(2) : '0.00'),
        refunded: !!j.refunded_at
      }))
    });
  } catch (error) {
    console.error('Job history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/jobs/:job_id/stream — Server-Sent Events for real-time job status (DCP-742)
//
// Emits: job_queued | provider_assigned | job_starting | job_running | job_completed | job_failed
// Payload: { event, status, provider_id, elapsed_sec, tokens_used, cost_usd }
// Stream closes automatically when the job reaches a terminal state.
// Auth: same as GET /api/jobs/:job_id (renter key, provider key, or admin)
router.get('/:job_id/stream', (req, res) => {
  let closed = false;
  let pollTimer = null;
  let keepaliveTimer = null;
  let unsubscribe = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    if (unsubscribe) unsubscribe();
    try { res.end(); } catch (_) {}
  };

  const sendSseEvent = (eventName, data) => {
    if (closed) return;
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      cleanup();
    }
  };

  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    // Emit current state immediately so client has a baseline
    const initialEvent = jobEventEmitter.statusToSseEvent(job.status) || 'job_queued';
    sendSseEvent(initialEvent, jobEventEmitter.buildPayload(job, initialEvent));

    // If job is already terminal, close immediately
    if (TERMINAL_JOB_STATUSES.has(String(job.status || '').toLowerCase())) {
      sendSseEvent('end', { status: job.status, ts: Date.now() });
      cleanup();
      return;
    }

    // Subscribe to real-time events from jobEventEmitter
    unsubscribe = jobEventEmitter.subscribe(job.job_id, (eventName, data) => {
      sendSseEvent(eventName, data);
      if (jobEventEmitter.TERMINAL_SSE_EVENTS.has(eventName)) {
        sendSseEvent('end', { status: data.status, ts: Date.now() });
        cleanup();
      }
    });

    // Polling fallback — catches any events that arrive before a client connects
    // or that are missed due to timing. Polls every 2 seconds.
    let lastKnownStatus = job.status;
    pollTimer = setInterval(() => {
      if (closed) return;
      try {
        const latest = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
        if (!latest) { cleanup(); return; }

        if (latest.status !== lastKnownStatus) {
          lastKnownStatus = latest.status;
          const sseEvent = jobEventEmitter.statusToSseEvent(latest.status);
          if (sseEvent) {
            sendSseEvent(sseEvent, jobEventEmitter.buildPayload(latest, sseEvent));
          }
          if (TERMINAL_JOB_STATUSES.has(String(latest.status || '').toLowerCase())) {
            sendSseEvent('end', { status: latest.status, ts: Date.now() });
            cleanup();
          }
        }
      } catch (pollErr) {
        console.error('Job SSE poll error:', pollErr);
        cleanup();
      }
    }, 2000);

    // Keep-alive comment every 20 seconds to prevent proxy timeouts
    keepaliveTimer = setInterval(() => {
      if (!closed) res.write(': keep-alive\n\n');
    }, 20000);

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  } catch (error) {
    console.error('Job SSE stream error:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to stream job status' });
    cleanup();
  }
});

// GET /api/jobs/:job_id/status — DCP-779 live polling endpoint
const PROVIDER_STALE_MS = 90 * 1000;

router.get('/:job_id/status', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });
    const session = db.get('SELECT total_tokens FROM serve_sessions WHERE job_id = ?', job.job_id);
    const tokens_generated = session ? (session.total_tokens ?? 0) : 0;
    const startedAt = job.started_at ? new Date(job.started_at) : null;
    const elapsed_seconds = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : null;
    const costHalala = job.actual_cost_halala ?? job.cost_halala ?? null;
    const estimated_cost_usd = jobEventEmitter.halalaToCostUsd(costHalala);
    let provider_online = false;
    if (job.provider_id) {
      const prov = db.get('SELECT last_heartbeat FROM providers WHERE id = ?', job.provider_id);
      if (prov && prov.last_heartbeat) {
        provider_online = (Date.now() - new Date(prov.last_heartbeat).getTime()) < PROVIDER_STALE_MS;
      }
    }
    return res.json({ job_id: job.job_id, status: job.status, tokens_generated, elapsed_seconds, estimated_cost_usd, provider_online });
  } catch (err) {
    console.error('[jobs/:job_id/status]', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /api/jobs/:job_id
router.get('/:job_id', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!canReadJob(req, job)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    job.gpu_requirements = job.gpu_requirements ? JSON.parse(job.gpu_requirements) : null;

    // Add queue position for queued jobs (priority-aware).
    if (job.status === 'queued') {
      job.queue_position = getQueuePosition(job);
    }

    applyRetryMetadata(job);

    // Polling-friendly fields (mirrors SSE payload)
    const startedAt = job.started_at ? new Date(job.started_at) : null;
    job.elapsed_sec = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : null;
    job.tokens_used = job.tokens_used ?? null;
    job.cost_usd = jobEventEmitter.halalaToCostUsd(job.actual_cost_halala ?? job.cost_halala ?? null);

    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /api/jobs/:job_id/complete
router.post('/:job_id/complete', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.status !== 'running') {
      return res.status(400).json({ error: 'Job is not running', current_status: job.status });
    }
    if (!isAdmin(req)) {
      const renter = getRenterFromReq(req);
      if (!renter || renter.id !== job.renter_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const now = new Date().toISOString();
    const startedAt = job.started_at || job.submitted_at;
    const elapsedSeconds = startedAt
      ? Math.max(1, Math.ceil((new Date(now) - new Date(startedAt)) / 1000))
      : ((job.duration_minutes || 1) * 60);
    const actualMinutes = Math.ceil(elapsedSeconds / 60);
    const { compute_halala, storage_halala, bandwidth_halala, total_halala } = estimateThreeComponentCost({
      gpuModel: job.gpu_model,
      durationSeconds: elapsedSeconds,
      storageGbSeconds: 0,
      bandwidthBytesOut: 0,
      pricingClass: job.pricing_class,
      jobType: job.job_type,
    });
    const totalCostHalala = Math.max(0, total_halala);
    const { provider: provider_earned, dc1: dc1_fee } = splitBilling(totalCostHalala);

    runStatement(
      `UPDATE jobs SET
        status = 'completed',
        completed_at = ?,
        actual_duration_minutes = ?,
        actual_cost_halala = ?,
        provider_earned_halala = ?,
        dc1_fee_halala = ?,
        gpu_seconds_used = ?,
        storage_gb_seconds = 0,
        bandwidth_bytes_out = 0,
        bandwidth_bytes_in = 0,
        compute_halala = ?,
        storage_halala = ?,
        bandwidth_halala = ?
       WHERE id = ?`,
      now, actualMinutes, totalCostHalala, provider_earned, dc1_fee,
      elapsedSeconds, compute_halala, storage_halala, bandwidth_halala, job.id
    );
    recordLifecycleEvent(job, 'job.completed', {
      status: 'completed',
      source: 'api',
      message: 'Job marked completed via manual completion endpoint',
      payload: {
        gpu_seconds: elapsedSeconds,
        actual_duration_minutes: Math.ceil(elapsedSeconds / 60),
        actual_cost_halala: totalCostHalala,
        compute_halala,
        storage_halala,
        bandwidth_halala,
        provider_earned_halala: provider_earned,
        dc1_fee_halala: dc1_fee,
      },
    });

    // Provider earnings updated from actual billing — 75% floor split, not full renter charge
    runStatement(
      `UPDATE providers SET
        total_jobs = total_jobs + 1,
        total_earnings = total_earnings + ?,
        claimable_earnings_halala = claimable_earnings_halala + ?
       WHERE id = ?`,
      provider_earned / 100, provider_earned, job.provider_id
    );

    // Release escrow to provider
    runStatement(
      `UPDATE escrow_holds SET status = 'released_provider', resolved_at = ?
       WHERE job_id = ? AND status IN ('held','locked')`,
      now, job.job_id
    );

    // On-chain: claim escrow to provider (mirrors /result success path)
    const chainEscrow = getChainEscrow();
    if (chainEscrow.isEnabled()) {
      chainEscrow.claimLock(job.job_id)
        .catch(err => console.error('[escrow-chain] claimLock async error (complete):', err.message));
    } else {
      // Simulation log — real claimLock call when ESCROW_CONTRACT_ADDRESS + ESCROW_ORACLE_PRIVATE_KEY are set
      const providerRecord = db.get('SELECT api_key FROM providers WHERE id = ?', job.provider_id);
      console.log(
        `[escrow-sim] claimLock | jobId=${job.job_id}` +
        ` | providerAddress=N/A (no EVM wallet registered)` +
        ` | providerKey=${providerRecord ? providerRecord.api_key.slice(0, 8) + '...' : 'unknown'}` +
        ` | amountHalala=${provider_earned}` +
        ` | dc1FeeHalala=${dc1_fee}`
      );
    }

    const updated = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
    fireAndForgetJobEmail('completed', updated, {
      actual_cost_halala: totalCostHalala,
      refunded_amount_halala: 0,
      retry_attempts: Number(updated?.retry_count || 0),
    });
    updated.gpu_requirements = updated.gpu_requirements ? JSON.parse(updated.gpu_requirements) : null;
    res.json({
      success: true,
      job: updated,
      billing: {
        estimated_cost_halala: job.cost_halala,
        actual_cost_halala: totalCostHalala,
        actual_duration_minutes: actualMinutes,
        provider_earned_halala: provider_earned,
        dc1_fee_halala: dc1_fee
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// POST /api/jobs/:job_id/fail — Explicit daemon failure webhook; releases escrow to renter
router.post('/:job_id/fail', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!isAdmin(req)) {
      const provider = getProviderFromReq(req);
      if (!provider || provider.id !== job.provider_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const activeStatuses = ['running', 'assigned', 'pulling', 'pending'];
    if (!activeStatuses.includes(job.status)) {
      return res.status(409).json({ error: 'Job already settled', current_status: job.status });
    }

    const { error: jobError, duration_seconds } = req.body;
    const durationSeconds = duration_seconds == null ? null : toFiniteNumber(duration_seconds, { min: 0, max: 86400 });
    if (duration_seconds != null && durationSeconds == null) {
      return res.status(400).json({ error: 'duration_seconds must be a finite number' });
    }
    const now = new Date().toISOString();
    const actualMinutes = durationSeconds != null ? Math.ceil(durationSeconds / 60) : (job.duration_minutes || 1);

    runStatement(
      `UPDATE jobs SET status = 'failed', error = ?, completed_at = ?, actual_duration_minutes = ? WHERE id = ?`,
      jobError || 'Job failed', now, actualMinutes, job.id
    );
    const failClass = categorizeJobError(jobError || 'Job failed', 'failed');
    recordLifecycleEvent(job, 'job.failed', {
      status: 'failed',
      source: 'daemon',
      error_category: failClass.category,
      error_code: failClass.code,
      message: 'Job failure reported by provider daemon',
      payload: {
        duration_seconds: durationSeconds,
        actual_duration_minutes: actualMinutes,
        error: String(jobError || 'Job failed'),
      },
    });

    // Release escrow back to renter
    runStatement(
      `UPDATE escrow_holds SET status = 'released_renter', resolved_at = ?
       WHERE job_id = ? AND status IN ('held','locked')`,
      now, job.job_id
    );

    // Refund renter
    if (job.renter_id && job.cost_halala > 0 && !job.refunded_at) {
      runStatement('UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?', job.cost_halala, job.renter_id);
      runStatement('UPDATE jobs SET refunded_at = ? WHERE id = ?', now, job.id);
    }

    // On-chain: cancel expired lock, return funds to renter
    const chainEscrow = getChainEscrow();
    if (chainEscrow.isEnabled()) {
      chainEscrow.cancelExpiredLock(job.job_id)
        .catch(err => console.error('[escrow-chain] cancelExpiredLock async error:', err.message));
    }

    promoteNextQueuedJob(job.provider_id);
    const updated = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
    fireAndForgetJobEmail('failed', updated || job, {
      refunded_amount_halala: Number(job.cost_halala || 0),
      retry_attempts: Number(updated?.retry_count || job.retry_count || 0),
      last_error: normalizeString(jobError || updated?.error || job.error, { maxLen: 1000 }),
    });
    res.json({ success: true, job_id: job.job_id, refunded_halala: job.cost_halala });
  } catch (error) {
    console.error('Job fail error:', error);
    res.status(500).json({ error: 'Failed to record job failure' });
  }
});

// POST /api/jobs/:job_id/cancel
router.post('/:job_id/cancel', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!isAdmin(req)) {
      const renter = getRenterFromReq(req);
      if (!renter || renter.id !== job.renter_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot cancel job with status: ${job.status}` });
    }

    const now = new Date().toISOString();
    runStatement(
      `UPDATE jobs SET status = 'cancelled', completed_at = ? WHERE id = ?`,
      now, job.id
    );
    recordLifecycleEvent(job, 'job.cancelled', {
      status: 'cancelled',
      source: 'api',
      message: 'Job cancelled before completion',
      payload: {
        previous_status: job.status,
      },
    });

    // Refund renter for cancelled job
    if (job.renter_id && job.cost_halala > 0) {
      runStatement('UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?', job.cost_halala, job.renter_id);
      runStatement('UPDATE jobs SET refunded_at = ? WHERE id = ?', now, job.id);
    }

    // Release escrow back to renter on cancellation
    runStatement(
      `UPDATE escrow_holds SET status = 'released_renter', resolved_at = ?
       WHERE job_id = ? AND status IN ('held','locked')`,
      now, job.job_id
    );

    // Auto-dispatch: promote next queued job for this provider
    promoteNextQueuedJob(job.provider_id);

    const updated = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
    res.json({ success: true, job: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// POST /api/jobs/:job_id/progress — Daemon reports execution phase (downloading, loading, generating)
router.post('/:job_id/progress', (req, res) => {
  try {
    const { api_key, phase } = req.body;
    const phaseText = typeof phase === 'string' ? phase.trim() : '';
    if (!api_key || !phaseText) return res.status(400).json({ error: 'api_key and phase required' });

    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
    if (!provider) return res.status(401).json({ error: 'Invalid API key' });

    const job = db.get('SELECT * FROM jobs WHERE (id = ? OR job_id = ?) AND provider_id = ?',
      req.params.job_id, req.params.job_id, provider.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // pulling = Docker image pull in progress; execution phases advance status to 'running'
    const validPhases = ['pulling', 'downloading_model', 'installing_deps', 'loading_model', 'generating', 'formatting'];
    if (!validPhases.includes(phaseText)) {
      return res.status(400).json({ error: `Invalid phase. Valid: ${validPhases.join(', ')}` });
    }

    const now = new Date().toISOString();
    // Status transitions based on phase:
    // pulling → set status='pulling' (still waiting for container)
    // execution phases → advance to 'running' if job is assigned/pulling
    let newStatus = null;
    if (phaseText === 'pulling') {
      newStatus = 'pulling';
    } else if (['assigned', 'pulling'].includes(job.status)) {
      newStatus = 'running';
    }

    if (newStatus) {
      runStatement(
        'UPDATE jobs SET progress_phase = ?, progress_updated_at = ?, status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?',
        phaseText, now, newStatus, now, job.id
      );
      recordLifecycleEvent(job, 'job.phase.changed', {
        status: newStatus,
        source: 'daemon',
        message: `Job phase transitioned to ${phaseText}`,
        payload: {
          phase: phaseText,
          previous_status: job.status,
          next_status: newStatus,
        },
      });
    } else {
      runStatement('UPDATE jobs SET progress_phase = ?, progress_updated_at = ? WHERE id = ?', phaseText, now, job.id);
      recordLifecycleEvent(job, 'job.phase.changed', {
        status: job.status,
        source: 'daemon',
        message: `Job phase updated to ${phaseText}`,
        payload: {
          phase: phaseText,
          previous_status: job.status,
          next_status: job.status,
        },
      });
    }

    let coldStartMs = null;
    if (phaseText === 'generating') {
      const markFirstToken = runStatement(
        'UPDATE jobs SET first_token_at = ? WHERE id = ? AND first_token_at IS NULL',
        now,
        job.id
      );
      if ((markFirstToken?.changes || 0) === 1) {
        coldStartMs = recordColdStartTelemetry({
          providerId: provider.id,
          job,
          firstTokenAt: now,
        });
      }
    }

    console.log(`[progress] Job ${job.job_id}: phase=${phaseText}${newStatus ? ` status→${newStatus}` : ''}`);
    res.json({ success: true, phase: phaseText, cold_start_ms: coldStartMs });
  } catch (error) {
    console.error('Job progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// POST /api/jobs/:job_id/endpoint-ready — daemon reports vLLM serve endpoint is ready
// Body: { api_key, port, provider_ip? }
// Backend constructs endpoint_url from provider's stored IP + port, stores on job
router.post('/:job_id/endpoint-ready', (req, res) => {
  try {
    // ── interactive_pod: publish Jupyter+SSH via the VPS relay (same job rails) ──
    {
      const podApiKey = req.body && req.body.api_key;
      const prov0 = podApiKey ? db.get('SELECT id FROM providers WHERE api_key = ?', podApiKey) : null;
      const job0 = prov0 ? db.get('SELECT * FROM jobs WHERE (id = ? OR job_id = ?) AND provider_id = ?',
        req.params.job_id, req.params.job_id, prov0.id) : null;
      if (job0 && job0.job_type === 'interactive_pod') {
        const jport = toFiniteInt(req.body.jupyter_host_port, { min: 1, max: 65535 });
        const sport = toFiniteInt(req.body.ssh_host_port, { min: 1, max: 65535 });
        const meshIp = String(req.body.wg_mesh_ip || '');
        if (!jport || !sport) return res.status(400).json({ error: 'jupyter_host_port and ssh_host_port required' });
        if (!/^10\.[89]\.\d+\.\d+$/.test(meshIp)) return res.status(400).json({ error: 'Invalid wg_mesh_ip (expected 10.8/10.9 mesh)' });
        let jupyterToken = '';
        try { jupyterToken = (JSON.parse(job0.task_spec) || {}).jupyter_token || ''; } catch {}
        let relay;
        try {
          relay = invokePodRelay(['start', String(job0.job_id), meshIp, String(jport), String(sport)]);
        } catch (e) {
          console.error('[pod] relay start failed:', e.message);
          return res.status(502).json({ error: 'Relay setup failed' });
        }
        const jpub = toFiniteInt(relay && relay.jpub, { min: 1, max: 65535 });
        const spub = toFiniteInt(relay && relay.spub, { min: 1, max: 65535 });
        if (!jpub || !spub) return res.status(502).json({ error: 'Relay returned invalid ports' });
        const accessUrl = `https://api.dcp.sa:${jpub}/?token=${encodeURIComponent(jupyterToken)}`;
        const sshCommand = `ssh -p ${spub} root@api.dcp.sa`;
        const nowPod = new Date().toISOString();
        runStatement(
          `UPDATE jobs SET jupyter_host_port=?, ssh_host_port=?, pod_wg_mesh_ip=?, pod_jpub=?, pod_spub=?,
            access_url=?, ssh_command=?, status='running', progress_phase='serving',
            progress_updated_at=?, started_at=COALESCE(started_at, ?) WHERE id=?`,
          jport, sport, meshIp, jpub, spub, accessUrl, sshCommand, nowPod, nowPod, job0.id
        );
        console.log(`[pod] Job ${job0.job_id}: live at ${accessUrl} | ssh -p ${spub}`);
        return res.json({ success: true, access_url: accessUrl, ssh_command: sshCommand });
      }
    }

    const { api_key, port, provider_ip: reportedIp } = req.body;
    if (!api_key || !port) return res.status(400).json({ error: 'api_key and port required' });

    const provider = db.get(
      'SELECT id, provider_ip, ip_address FROM providers WHERE api_key = ?', api_key
    );
    if (!provider) return res.status(401).json({ error: 'Invalid API key' });

    const job = db.get('SELECT * FROM jobs WHERE (id = ? OR job_id = ?) AND provider_id = ?',
      req.params.job_id, req.params.job_id, provider.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.job_type !== 'vllm_serve') return res.status(400).json({ error: 'Not a vllm_serve job' });

    const resolvedIp = reportedIp || provider.provider_ip || provider.ip_address;
    if (!resolvedIp) return res.status(400).json({ error: 'Cannot resolve provider IP — send provider_ip in body' });

    const portNum = toFiniteInt(port, { min: 1024, max: 65535 });
    if (!portNum) return res.status(400).json({ error: 'Invalid port' });

    const endpointUrl = `http://${resolvedIp}:${portNum}/v1`;
    const now = new Date().toISOString();

    runStatement(
      `UPDATE jobs SET endpoint_url = ?, serve_port = ?, status = 'running',
        progress_phase = 'serving', progress_updated_at = ?,
        started_at = COALESCE(started_at, ?) WHERE id = ?`,
      endpointUrl, portNum, now, now, job.id
    );
    recordLifecycleEvent(job, 'job.endpoint.ready', {
      status: 'running',
      source: 'daemon',
      message: 'vLLM endpoint reported ready',
      payload: {
        endpoint_url: endpointUrl,
        serve_port: portNum,
        provider_ip: resolvedIp,
      },
    });

    console.log(`[vllm] Job ${job.job_id}: endpoint ready at ${endpointUrl}`);
    res.json({ success: true, endpoint_url: endpointUrl });
  } catch (error) {
    console.error('Endpoint-ready error:', error);
    res.status(500).json({ error: 'Failed to record endpoint' });
  }
});

// POST /api/jobs/:job_id/logs — daemon streams execution log lines to backend
// Accepts: { api_key, lines: [{ level, message }] }
router.post('/:job_id/logs', (req, res) => {
  try {
    const { api_key, lines, attempt_number } = req.body;
    if (!api_key) return res.status(401).json({ error: 'api_key required' });
    if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'lines array required' });

    const provider = db.get('SELECT id FROM providers WHERE api_key = ?', api_key);
    if (!provider) return res.status(401).json({ error: 'Invalid API key' });

    const job = db.get('SELECT * FROM jobs WHERE (id = ? OR job_id = ?) AND provider_id = ?',
      req.params.job_id, req.params.job_id, provider.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const normalized = normalizeIncomingLogLines(lines);
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No valid log lines provided' });
    }

    const linesWritten = appendJobLogs(job, normalized);
    const attemptNumber = resolveAttemptNumber(job.job_id, attempt_number);
    const logPath = appendAttemptLogLines(job.job_id, attemptNumber, normalized);
    runStatement(
      `UPDATE job_executions
       SET log_path = COALESCE(log_path, ?)
       WHERE job_id = ? AND attempt_number = ?`,
      logPath || getAttemptLogPath(job.job_id, attemptNumber),
      job.job_id,
      attemptNumber
    );
    res.json({ success: true, lines_written: linesWritten, attempt_number: attemptNumber });
  } catch (error) {
    console.error('Job logs write error:', error);
    res.status(500).json({ error: 'Failed to write job logs' });
  }
});

// GET /api/jobs/:job_id/logs — fetch job execution logs (renter, provider, or admin)
// Query params: since=<line_no> (default 0), limit=<n> (default 200, max 1000)
router.get('/:job_id/logs', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    if (req.query.attempt != null) {
      const attemptNumber = toFiniteInt(req.query.attempt, { min: 1 });
      if (attemptNumber == null) {
        return res.status(400).json({ error: 'attempt must be a positive integer' });
      }
      const execution = db.get(
        `SELECT attempt_number FROM job_executions WHERE job_id = ? AND attempt_number = ?`,
        job.job_id,
        attemptNumber
      );
      if (!execution) {
        return res.status(404).json({ error: 'Execution attempt not found' });
      }
      const resolved = resolveAttemptLogPath(job.job_id, attemptNumber);
      if (!resolved) {
        return res.status(404).json({ error: 'Log file not found for this attempt' });
      }
      res.setHeader(
        'Content-Type',
        resolved.gzipped ? 'application/gzip' : 'text/plain; charset=utf-8'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${job.job_id}-attempt-${attemptNumber}.log${resolved.gzipped ? '.gz' : ''}"`
      );
      return res.sendFile(resolved.path);
    }

    const since = parseInt(req.query.since) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    const logs = db.all(
      'SELECT line_no, level, message, logged_at FROM job_logs WHERE job_id = ? AND line_no > ? ORDER BY line_no ASC LIMIT ?',
      job.job_id, since, limit
    );

    const total = db.get('SELECT COUNT(*) as cnt FROM job_logs WHERE job_id = ?', job.job_id);
    res.json({
      schema_version: LIFECYCLE_SCHEMA_VERSION,
      job_id: job.job_id,
      status: job.status,
      logs: logs.map((row) => ({
        line_no: row.line_no,
        level: row.level,
        message: row.message,
        logged_at: row.logged_at,
        logged_at_ms: Date.parse(row.logged_at) || null,
      })),
      total_lines: total?.cnt || 0,
      has_more: logs.length === limit
    });
  } catch (error) {
    console.error('Job logs read error:', error);
    res.status(500).json({ error: 'Failed to read job logs' });
  }
});

// GET /api/jobs/:job_id/history — renter-scoped execution history
router.get('/:job_id/history', (req, res) => {
  try {
    const job = db.get(
      `SELECT id, job_id, renter_id, provider_id, status, submitted_at, started_at, completed_at,
              cost_halala, actual_cost_halala, actual_duration_minutes, job_type, model
       FROM jobs
       WHERE id = ? OR job_id = ?`,
      req.params.job_id,
      req.params.job_id
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const renter = getRenterFromReq(req);
    if (!renter || renter.id !== job.renter_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const executions = db.all(
      `SELECT id, attempt_number, started_at, ended_at, exit_code, log_path, gpu_seconds_used, cost_halala
       FROM job_executions
       WHERE job_id = ?
       ORDER BY attempt_number ASC`,
      job.job_id
    );

    res.json({
      job,
      executions: executions.map((row) => ({
        ...row,
        log_available: !!resolveAttemptLogPath(job.job_id, row.attempt_number),
      })),
    });
  } catch (error) {
    console.error('Job history error:', error);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

// GET /api/jobs/:job_id/logs/stream?key=RENT
// Server-Sent Events stream for renter-owned job logs in near real-time.
router.get('/:job_id/logs/stream', (req, res) => {
  let interval = null;
  let keepalive = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    if (keepalive) clearInterval(keepalive);
    try { res.end(); } catch (_) {}
  };

  try {
    const renterKey = req.query.key || req.headers['x-renter-key'];
    if (!renterKey) return res.status(401).json({ error: 'Renter API key required (?key=...)' });

    const renter = db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', renterKey, 'active');
    if (!renter) return res.status(401).json({ error: 'Invalid renter API key' });

    const job = db.get(
      'SELECT id, job_id, status, renter_id FROM jobs WHERE (id = ? OR job_id = ?) LIMIT 1',
      req.params.job_id,
      req.params.job_id
    );
    if (!job || job.renter_id !== renter.id) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    const sendLogEvent = (row) => {
      const loggedAt = row?.logged_at || null;
      const ts = loggedAt ? Date.parse(loggedAt) : Date.now();
      res.write(`data: ${JSON.stringify({
        schema_version: LIFECYCLE_SCHEMA_VERSION,
        type: 'log',
        event_type: 'job.log',
        line_no: row?.line_no || null,
        level: row?.level || 'info',
        line: row?.message || '',
        logged_at: loggedAt,
        ts: Number.isFinite(ts) ? ts : Date.now(),
      })}\n\n`);
    };

    let lastLine = Math.max(parseInt(req.query.since, 10) || 0, 0);
    const pollAndFlush = () => {
      if (closed) return;
      const newRows = db.all(
        `SELECT line_no, level, message, logged_at
         FROM job_logs
         WHERE job_id = ? AND line_no > ?
         ORDER BY line_no ASC
         LIMIT 200`,
        job.job_id,
        lastLine
      );
      for (const row of newRows) {
        sendLogEvent(row);
        lastLine = row.line_no;
      }

      const latest = db.get('SELECT status FROM jobs WHERE id = ?', job.id);
      if (!latest || TERMINAL_JOB_STATUSES.has(String(latest.status || '').toLowerCase())) {
        res.write(`data: ${JSON.stringify({ type: 'end', status: latest?.status || 'done', ts: Date.now() })}\n\n`);
        cleanup();
      }
    };

    // If already terminal, return last 50 lines and close.
    if (TERMINAL_JOB_STATUSES.has(String(job.status || '').toLowerCase())) {
      const tail = db.all(
        `SELECT line_no, level, message, logged_at
         FROM job_logs
         WHERE job_id = ?
         ORDER BY line_no DESC
         LIMIT 50`,
        job.job_id
      ).reverse();
      for (const row of tail) {
        sendLogEvent(row);
      }
      res.write(`data: ${JSON.stringify({ type: 'end', status: job.status || 'done', ts: Date.now() })}\n\n`);
      return cleanup();
    }

    // Initial flush + steady polling.
    pollAndFlush();
    interval = setInterval(pollAndFlush, 1000);
    keepalive = setInterval(() => {
      if (!closed) res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  } catch (error) {
    console.error('Job logs SSE error:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to stream logs' });
    cleanup();
  }
});

// GET /api/jobs/:job_id/lifecycle — deterministic lifecycle events feed.
// Query params: since_sequence=<n>, limit=<n>, event_type=<type>, status=<status>, error_category=<category>
router.get('/:job_id/lifecycle', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    const sinceSequence = Math.max(parseInt(req.query.since_sequence, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const filters = ['job_id = ?', 'sequence_no > ?'];
    const params = [job.job_id, sinceSequence];

    if (req.query.event_type) {
      filters.push('event_type = ?');
      params.push(String(req.query.event_type));
    }
    if (req.query.status) {
      filters.push('status = ?');
      params.push(String(req.query.status));
    }
    if (req.query.error_category) {
      filters.push('error_category = ?');
      params.push(String(req.query.error_category));
    }
    params.push(limit);

    const rows = db.all(
      `SELECT sequence_no, event_type, status, source, error_category, error_code, message, payload_json, occurred_at
       FROM job_lifecycle_events
       WHERE ${filters.join(' AND ')}
       ORDER BY sequence_no ASC
       LIMIT ?`,
      params
    );
    const total = db.get('SELECT COUNT(*) AS cnt FROM job_lifecycle_events WHERE job_id = ?', job.job_id);

    const events = rows.map((row) => {
      let payload = null;
      if (row.payload_json) {
        try { payload = JSON.parse(row.payload_json); } catch (_) { payload = null; }
      }
      return {
        schema_version: LIFECYCLE_SCHEMA_VERSION,
        job_id: job.job_id,
        sequence_no: row.sequence_no,
        event_type: row.event_type,
        status: row.status,
        source: row.source,
        error_category: row.error_category,
        error_code: row.error_code,
        message: row.message,
        payload,
        occurred_at: row.occurred_at,
        occurred_at_ms: Date.parse(row.occurred_at) || null,
      };
    });

    return res.json({
      schema_version: LIFECYCLE_SCHEMA_VERSION,
      job_id: job.job_id,
      status: job.status,
      events,
      total_events: Number(total?.cnt || 0),
      has_more: events.length === limit,
    });
  } catch (error) {
    console.error('Job lifecycle read error:', error);
    return res.status(500).json({ error: 'Failed to read lifecycle events' });
  }
});

// GET /api/jobs/:job_id/lifecycle/stream — SSE lifecycle event stream
router.get('/:job_id/lifecycle/stream', (req, res) => {
  let interval = null;
  let keepalive = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    if (keepalive) clearInterval(keepalive);
    try { res.end(); } catch (_) {}
  };

  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    let lastSequence = Math.max(parseInt(req.query.since_sequence, 10) || 0, 0);
    const pollAndFlush = () => {
      if (closed) return;
      const rows = db.all(
        `SELECT sequence_no, event_type, status, source, error_category, error_code, message, payload_json, occurred_at
         FROM job_lifecycle_events
         WHERE job_id = ? AND sequence_no > ?
         ORDER BY sequence_no ASC
         LIMIT 200`,
        job.job_id,
        lastSequence
      );

      for (const row of rows) {
        let payload = null;
        if (row.payload_json) {
          try { payload = JSON.parse(row.payload_json); } catch (_) { payload = null; }
        }
        const data = {
          schema_version: LIFECYCLE_SCHEMA_VERSION,
          job_id: job.job_id,
          sequence_no: row.sequence_no,
          event_type: row.event_type,
          status: row.status,
          source: row.source,
          error_category: row.error_category,
          error_code: row.error_code,
          message: row.message,
          payload,
          occurred_at: row.occurred_at,
          occurred_at_ms: Date.parse(row.occurred_at) || Date.now(),
        };
        res.write(`event: ${row.event_type}\n`);
        res.write(`id: ${row.sequence_no}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        lastSequence = row.sequence_no;
      }

      const latest = db.get('SELECT status FROM jobs WHERE id = ?', job.id);
      if (!latest || TERMINAL_JOB_STATUSES.has(String(latest.status || '').toLowerCase())) {
        res.write(`event: end\n`);
        res.write(`data: ${JSON.stringify({
          schema_version: LIFECYCLE_SCHEMA_VERSION,
          type: 'end',
          job_id: job.job_id,
          status: latest?.status || 'done',
          ts: Date.now(),
        })}\n\n`);
        cleanup();
      }
    };

    pollAndFlush();
    interval = setInterval(pollAndFlush, 1000);
    keepalive = setInterval(() => {
      if (!closed) res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  } catch (error) {
    console.error('Job lifecycle SSE error:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to stream lifecycle events' });
    cleanup();
  }
});

// GET /api/jobs/:job_id/executions?key=RENTER_KEY
// Returns execution attempt history for a job from the job_executions table.
// Auth: renter key (must own job), provider key (must own job), or admin token.
router.get('/:job_id/executions', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    const executions = db.all(
      `SELECT attempt_number, started_at, ended_at, exit_code, gpu_seconds_used, cost_halala
       FROM job_executions
       WHERE job_id = ?
       ORDER BY attempt_number ASC`,
      job.job_id
    );

    res.json({
      job_id: job.job_id,
      status: job.status,
      cost_halala: job.cost_halala || 0,
      actual_cost_halala: job.actual_cost_halala || 0,
      retry_count: job.retry_count || 0,
      executions,
    });
  } catch (error) {
    console.error('Job executions error:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// GET /api/jobs/:job_id/output — serve job result (image, text, etc.)
// Renter or anyone with the job_id can fetch the output
router.get('/:job_id/output', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });

    // Failed/cancelled/timed-out jobs — return 410 Gone with error details
    if (job.status === 'failed' || job.status === 'cancelled') {
      return res.status(410).json({
        status: job.status,
        error: job.error || (job.status === 'cancelled' ? 'Job was cancelled' : 'Job failed'),
        job_id: job.job_id,
        submitted_at: job.submitted_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        progress_phase: job.progress_phase || null,
        refunded: job.refunded_at ? true : false
      });
    }

    if (job.status !== 'completed') {
      // Build phase-aware status message
      const phaseMessages = {
        'downloading_model': 'Downloading model weights...',
        'installing_deps': 'Installing dependencies...',
        'loading_model': 'Loading model onto GPU...',
        'generating': 'Generating response...',
        'formatting': 'Formatting output...',
      };
      const message = (job.progress_phase && phaseMessages[job.progress_phase])
        ? phaseMessages[job.progress_phase]
        : (job.status === 'running' ? 'Job running...' : `Job status: ${job.status}`);

      return res.status(202).json({
        status: job.status,
        message,
        progress_phase: job.progress_phase || null,
        job_id: job.job_id,
        submitted_at: job.submitted_at,
        started_at: job.started_at,
        progress_updated_at: job.progress_updated_at || null,
        timeout_at: job.timeout_at || null,
        cost_halala: job.cost_halala || 0
      });
    }

    if (!job.result) {
      return res.status(204).json({ error: 'Job completed but no output data' });
    }

    // Try to parse structured DC1_RESULT_JSON from the result
    let structured = null;
    // Match the DC1_RESULT_JSON marker — greedy to capture the full JSON object
    const jsonMatch = job.result.match(/DC1_RESULT_JSON:({[\s\S]+})\s*$/);
    if (jsonMatch) {
      try {
        structured = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.warn(`Job ${job.job_id} DC1_RESULT_JSON parse failed: ${e.message} (length: ${jsonMatch[1].length})`);
      }
    }

    // Fallback: v1 proxy inference path stores the structured result as plain
    // JSON in `result` (no DC1_RESULT_JSON: prefix). Without this branch, every
    // v1:proxy job falls into the raw-text fallback below and the dashboard
    // detail view loses model/device/tokens/response.
    if (!structured && typeof job.result === 'string' && job.result.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(job.result);
        if (parsed && typeof parsed === 'object') {
          // Normalize legacy `llm_inference` type into the `text` shape the
          // image/text rendering paths below already understand.
          if (parsed.type === 'llm_inference') parsed.type = 'text';
          structured = parsed;
        }
      } catch (e) {
        // Not JSON — leave structured null and fall through to raw text.
      }
    }

    // If structured image result, serve as image or JSON based on Accept header
    if (structured && structured.type === 'image' && structured.data) {
      // Base64 integrity validation — catch truncated images early
      const b64 = structured.data;
      const b64clean = b64.replace(/[\s\r\n]/g, '');
      const isValidBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(b64clean);
      const expectedMinBytes = (structured.width || 256) * (structured.height || 256) * 0.05; // ~5% of raw size minimum for compressed PNG
      const actualBytes = Math.floor(b64clean.length * 3 / 4);
      const isTruncated = !isValidBase64 || actualBytes < expectedMinBytes;

      if (isTruncated) {
        return res.status(206).json({
          error: 'Image data appears truncated or corrupted',
          type: 'image',
          expected_dimensions: `${structured.width}x${structured.height}`,
          base64_length: b64clean.length,
          decoded_bytes: actualBytes,
          expected_min_bytes: Math.round(expectedMinBytes),
          valid_base64: isValidBase64,
          hint: 'The provider daemon may have truncated stdout. Ensure daemon version >= 3.1.0',
          billing: {
            actual_cost_halala: job.actual_cost_halala,
            actual_cost_sar: job.actual_cost_halala ? (job.actual_cost_halala / 100).toFixed(2) : null
          }
        });
      }

      const wantsJson = (req.headers.accept || '').includes('application/json');
      if (wantsJson) {
        return res.json({
          type: 'image',
          format: structured.format || 'png',
          width: structured.width,
          height: structured.height,
          prompt: structured.prompt,
          model: structured.model,
          seed: structured.seed,
          gen_time_s: structured.gen_time_s,
          total_time_s: structured.total_time_s,
          device: structured.device,
          image_base64: structured.data,
          image_bytes: actualBytes,
          billing: {
            actual_cost_halala: job.actual_cost_halala,
            actual_cost_sar: job.actual_cost_halala ? (job.actual_cost_halala / 100).toFixed(2) : null
          }
        });
      }
      // Serve raw image
      const imgBuf = Buffer.from(structured.data, 'base64');
      res.set('Content-Type', `image/${structured.format || 'png'}`);
      res.set('Content-Length', imgBuf.length);
      res.set('X-DCP-Prompt', structured.prompt?.substring(0, 200));
      res.set('X-DCP-Seed', String(structured.seed || ''));
      res.set('X-DCP-GenTime', String(structured.gen_time_s || ''));
      res.set('X-DCP-ImageBytes', String(actualBytes));
      return res.send(imgBuf);
    }

    // If structured text result
    if (structured && structured.type === 'text') {
      return res.json({
        type: 'text',
        prompt: structured.prompt,
        response: structured.response,
        model: structured.model,
        tokens_generated: structured.tokens_generated,
        tokens_per_second: structured.tokens_per_second,
        gen_time_s: structured.gen_time_s,
        total_time_s: structured.total_time_s,
        device: structured.device,
        billing: {
          actual_cost_halala: job.actual_cost_halala,
          actual_cost_sar: job.actual_cost_halala ? (job.actual_cost_halala / 100).toFixed(2) : null
        }
      });
    }

    // Fallback: raw text result
    res.json({
      type: 'text',
      result: job.result,
      billing: {
        actual_cost_halala: job.actual_cost_halala,
        actual_cost_sar: job.actual_cost_halala ? (job.actual_cost_halala / 100).toFixed(2) : null
      }
    });
  } catch (error) {
    console.error('Job output error:', error);
    res.status(500).json({ error: 'Failed to fetch job output' });
  }
});

// GET /api/jobs/:job_id/output/:format — serve image in specific format (png, jpeg, webp)
router.get('/:job_id/output/:format', (req, res) => {
  try {
    const { format } = req.params;
    const validFormats = ['png', 'jpeg', 'jpg', 'webp'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({ error: `Invalid format: ${format}. Supported: png, jpeg, webp` });
    }

    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canReadJob(req, job)) return res.status(403).json({ error: 'Forbidden' });
    if (job.status !== 'completed') return res.status(400).json({ error: 'Job not completed' });
    if (!job.result) return res.status(204).json({ error: 'No output data' });

    const jsonMatch = job.result.match(/DC1_RESULT_JSON:({[\s\S]+})\s*$/);
    if (!jsonMatch) return res.status(400).json({ error: 'No structured image data found' });

    let structured;
    try { structured = JSON.parse(jsonMatch[1]); } catch(e) {
      return res.status(500).json({ error: 'Failed to parse image data' });
    }
    if (!structured || structured.type !== 'image' || !structured.data) {
      return res.status(400).json({ error: 'Job is not an image generation job' });
    }

    const imgBuf = Buffer.from(structured.data, 'base64');
    const normalizedFormat = format.toLowerCase() === 'jpg' ? 'jpeg' : format.toLowerCase();

    if (normalizedFormat === 'png') {
      // Serve raw PNG directly — no conversion needed
      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', `attachment; filename="dcp-${job.job_id}.png"`);
      res.set('Content-Length', imgBuf.length);
      return res.send(imgBuf);
    }

    // Optional image conversion dependency removed: return original PNG when non-PNG requested.
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename="dcp-${job.job_id}.png"`);
    res.set('Content-Length', imgBuf.length);
    res.send(imgBuf);
  } catch (error) {
    console.error('Job output format error:', error);
    res.status(500).json({ error: 'Failed to fetch job output' });
  }
});

// Timeout enforcement — called by recovery engine every 30s
function enforceJobTimeouts() {
  try {
    const now = new Date().toISOString();
    const chainEscrow = getChainEscrow();
    // Include assigned/pulling states — if daemon stalls during container setup, still timeout
    const timedOut = db.all(
      `SELECT * FROM jobs WHERE status IN ('running', 'assigned', 'pulling') AND timeout_at IS NOT NULL
       AND datetime(replace(timeout_at, 'T', ' ')) < datetime(replace(?, 'T', ' '))`,
      now
    );

    for (const job of timedOut) {
      runStatement(
        `UPDATE jobs SET status = 'failed', error = 'Job timed out — provider may be offline or model too large', completed_at = ? WHERE id = ?`,
        now, job.id
      );
      const timeoutClass = categorizeJobError('Job timed out — provider may be offline or model too large', 'timed_out');
      recordLifecycleEvent(job, 'job.timed_out', {
        status: 'failed',
        source: 'timeout_enforcer',
        error_category: timeoutClass.category,
        error_code: timeoutClass.code,
        message: 'Job exceeded max_duration_seconds and was terminated',
        payload: {
          timeout_at: job.timeout_at || null,
          provider_id: job.provider_id || null,
          max_duration_seconds: job.max_duration_seconds || null,
        },
      });
      // Refund renter for timed-out jobs + mark escrow expired
      if (job.renter_id && job.cost_halala > 0) {
        try {
          runStatement('UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?', job.cost_halala, job.renter_id);
          runStatement('UPDATE jobs SET refunded_at = ? WHERE id = ?', now, job.id);
          console.log(`[timeout] Refunded ${job.cost_halala} halala to renter ${job.renter_id} for job ${job.job_id}`);
        } catch(e) { console.error('[timeout] Refund error:', e); }
      }
      // Release escrow to renter — funds already returned to renter above
      try {
        runStatement(
          `UPDATE escrow_holds SET status = 'released_renter', resolved_at = ?
           WHERE job_id = ? AND status IN ('held','locked')`,
          now, job.job_id
        );
      } catch(e) { console.error('[timeout] Escrow release error:', e); }
      if (chainEscrow.isEnabled()) {
        chainEscrow.cancelExpiredLock(job.job_id)
          .catch(err => console.error('[escrow-chain] cancelExpiredLock async error:', err.message));
      }
      console.log(`[timeout] Job ${job.job_id} timed out (provider ${job.provider_id})`);
      const updated = db.get('SELECT * FROM jobs WHERE id = ?', job.id);
      fireAndForgetJobEmail('failed', updated || job, {
        refunded_amount_halala: Number(job.cost_halala || 0),
        retry_attempts: Number((updated || job).retry_count || 0),
        last_error: 'Job timed out — provider may be offline or model too large',
      });
      // Auto-dispatch: promote next queued job for this provider
      promoteNextQueuedJob(job.provider_id);
    }

    return timedOut.length;
  } catch (error) {
    console.error('[timeout] Enforcement error:', error);
    return 0;
  }
}

// ============================================================================
// POST /api/jobs/test - Admin creates test benchmark job for a provider
// ============================================================================
router.post('/test', requireAdminAuth, (req, res) => {
  try {
    const { provider_id, matrix_size, iterations } = req.body;
    const providerId = toFiniteInt(provider_id, { min: 1 });
    if (!providerId) return res.status(400).json({ error: 'provider_id required' });

    // Verify provider exists and is online
    const provider = db.get('SELECT id, status, readiness_status FROM providers WHERE id = ?', providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const matrixSize = toFiniteInt(matrix_size, { min: 128, max: 16384 }) || 4096;
    const iterCount = toFiniteInt(iterations, { min: 1, max: 100 }) || 5;

    const job_id = 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const taskSpec = JSON.stringify({
      benchmark: 'matmul',
      matrix_size: matrixSize,
      iterations: iterCount
    });
    const taskSpecHmac = signTaskSpec(taskSpec);
    const now = new Date().toISOString();

    runStatement(
      `INSERT INTO jobs (job_id, provider_id, job_type, status, task_spec, task_spec_hmac, gpu_requirements, duration_minutes, max_duration_seconds, submitted_at, created_at)
       VALUES (?, ?, 'benchmark', 'pending', ?, ?, '{}', 5, 300, ?, ?)`,
      job_id, providerId, taskSpec, taskSpecHmac, now, now
    );

    res.json({
      success: true,
      job: { job_id, provider_id: providerId, status: 'pending', task_spec: JSON.parse(taskSpec) },
      message: `Test job created. Daemon will pick it up on next poll.`
    });
  } catch (error) {
    console.error('Test job creation error:', error);
    res.status(500).json({ error: 'Test job creation failed' });
  }
});

// ============================================================================
// GET /api/jobs/scheduler/health - Admin scheduler health metrics
// ============================================================================
router.get('/scheduler/health', requireAdminAuth, (req, res) => {
  try {
    const now = new Date();
    const stats = {
      timestamp: now.toISOString(),
      queued: db.all('SELECT COUNT(*) as count FROM jobs WHERE status = ?', 'queued')?.[0]?.count || 0,
      pending: db.all('SELECT COUNT(*) as count FROM jobs WHERE status = ?', 'pending')?.[0]?.count || 0,
      assigned: db.all('SELECT COUNT(*) as count FROM jobs WHERE status = ?', 'assigned')?.[0]?.count || 0,
      running: db.all('SELECT COUNT(*) as count FROM jobs WHERE status = ?', 'running')?.[0]?.count || 0,
      providers_online: db.all(
        `SELECT COUNT(*) as count FROM providers WHERE last_heartbeat > datetime('now', '-2 minutes')`
      )?.[0]?.count || 0,
      providers_degraded: db.all(
        `SELECT COUNT(*) as count FROM providers WHERE last_heartbeat BETWEEN datetime('now', '-10 minutes') AND datetime('now', '-2 minutes')`
      )?.[0]?.count || 0,
      providers_offline: db.all(
        `SELECT COUNT(*) as count FROM providers WHERE last_heartbeat < datetime('now', '-10 minutes') OR last_heartbeat IS NULL`
      )?.[0]?.count || 0,
    };

    res.json(stats);
  } catch (error) {
    console.error('Scheduler health check error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduler health metrics' });
  }
});

// ============================================================================
// GET /api/jobs/scheduler/diagnostics/:job_id - Admin scheduler diagnostics
// ============================================================================
router.get('/scheduler/diagnostics/:job_id', requireAdminAuth, (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.job_id, req.params.job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const getJobScheduler = () => require('../services/jobScheduler');
    const scheduler = getJobScheduler();
    const report = scheduler.getSchedulingReport(job, 10); // Top 10 candidate providers

    res.json({
      job_id: job.job_id,
      status: job.status,
      provider_id: job.provider_id,
      gpu_requirements: job.gpu_requirements ? JSON.parse(job.gpu_requirements) : null,
      scheduling_analysis: report
    });
  } catch (error) {
    console.error('Scheduler diagnostics error:', error);
    res.status(500).json({ error: 'Failed to generate scheduler diagnostics' });
  }
});

// ── DCP-758: Job Dispatch Service routes ──────────────────────────────────────
let _jobDispatchService;
function getDispatchService() {
  if (!_jobDispatchService) _jobDispatchService = require('../services/jobDispatchService');
  return _jobDispatchService;
}

// ============================================================================
// GET /api/jobs — Paginated renter job history (DCP-782)
// Query params: limit (default 50, max 200), offset (default 0)
// Returns: job_id, template_name, gpu_model, started_at, ended_at, duration_seconds,
//          tokens_used, cost_sar
// Auth: x-renter-key — renter can only see their own jobs
// ============================================================================
router.get('/', requireRenter, (req, res) => {
  try {
    const limit = Math.min(toFiniteInt(req.query.limit, { min: 1, max: 200 }) ?? 50, 200);
    const offset = toFiniteInt(req.query.offset, { min: 0 }) ?? 0;

    const jobs = db.all(
      `SELECT j.id, j.job_id, j.job_type, j.template_id, j.status,
              j.submitted_at, j.started_at, j.completed_at AS ended_at,
              j.duration_seconds, j.actual_duration_minutes,
              j.prompt_tokens, j.completion_tokens,
              j.actual_cost_halala, j.cost_halala,
              j.refunded_at,
              p.gpu_model
       FROM jobs j
       LEFT JOIN providers p ON j.provider_id = p.id
       WHERE j.renter_id = ?
       ORDER BY j.submitted_at DESC
       LIMIT ? OFFSET ?`,
      req.renter.id, limit, offset
    );

    const total = (db.get('SELECT COUNT(*) AS cnt FROM jobs WHERE renter_id = ?', req.renter.id) || {}).cnt || 0;

    res.json({
      total,
      limit,
      offset,
      jobs: jobs.map(j => {
        const costHalala = j.actual_cost_halala ?? j.cost_halala ?? 0;
        const tokensUsed = (j.prompt_tokens || 0) + (j.completion_tokens || 0);
        return {
          id: j.id,
          job_id: j.job_id,
          job_type: j.job_type,
          template_name: j.template_id || null,
          gpu_model: j.gpu_model || null,
          status: j.status,
          submitted_at: j.submitted_at,
          started_at: j.started_at,
          ended_at: j.ended_at,
          duration_seconds: j.duration_seconds ?? (j.actual_duration_minutes != null ? j.actual_duration_minutes * 60 : null),
          tokens_used: tokensUsed || null,
          cost_sar: (costHalala / 100).toFixed(2),
          refunded: !!j.refunded_at,
        };
      }),
    });
  } catch (error) {
    console.error('[GET /api/jobs]', error);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

// In-memory idempotency cache for POST /api/jobs — keyed by "renterId:idempotency_key"
// Entries expire after 5 minutes. This is sufficient for Phase 1 single-process deployments.
const _jobIdempotencyCache = new Map();
const JOB_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
function _pruneJobIdempotencyCache() {
  const now = Date.now();
  for (const [k, v] of _jobIdempotencyCache) {
    if (now - v.ts > JOB_IDEMPOTENCY_TTL_MS) _jobIdempotencyCache.delete(k);
  }
}

// List available docker template IDs for error messages
function getAvailableTemplateIds() {
  try {
    return require('fs').readdirSync(DOCKER_TEMPLATES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch { return []; }
}

/**
 * POST /api/jobs
 * Simplified job submission using the credit-hold dispatch pipeline.
 * Credits are reserved (not immediately debited); actual debit happens on
 * PATCH /complete; hold is released on PATCH /fail.
 */
router.post('/', jobCreateLimiter, requireRenter, async (req, res) => {
  try {
    const {
      job_type,
      duration_minutes,
      gpu_requirements,
      params: bodyParams,
      pricing_class: requestedPricingClass,
      model: requestedModel,
      provider_id: reqProviderId,
      template_id: reqTemplateId,
    } = req.body;

    // ── Idempotency deduplication ────────────────────────────────────────────
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (idempotencyKey) {
      _pruneJobIdempotencyCache();
      const cacheKey = `${req.renter.id}:${String(idempotencyKey).slice(0, 128)}`;
      const cached = _jobIdempotencyCache.get(cacheKey);
      if (cached) {
        return res.status(200).json({ ...cached.body, idempotent: true });
      }
    }

    // ── Provider availability check ──────────────────────────────────────────
    const onlineProviderCount = db.prepare(
      `SELECT COUNT(*) AS count FROM providers WHERE status = 'online'`
    ).get()?.count || 0;
    if (onlineProviderCount === 0) {
      return res.status(503).json({
        error: 'No providers are currently online. Your job cannot be dispatched at this time.',
        code: 'NO_PROVIDERS_AVAILABLE',
        retry_after_seconds: 60,
      });
    }

    let resolvedTemplate = null;
    if (reqTemplateId) {
      resolvedTemplate = loadDockerTemplate(reqTemplateId);
      if (!resolvedTemplate) {
        const available = getAvailableTemplateIds();
        return res.status(400).json({
          error: `Template '${reqTemplateId}' not found`,
          code: 'INVALID_TEMPLATE_ID',
          available_templates: available,
        });
      }
    }

    const effectiveJobType = job_type || resolvedTemplate?.job_type;
    const durationMinutes = toFiniteNumber(duration_minutes, { min: 0.01, max: 1440 });

    if (!effectiveJobType || durationMinutes == null) {
      return res.status(400).json({
        error: 'Missing required fields: job_type (or template_id), duration_minutes',
      });
    }
    if (!ALLOWED_JOB_TYPES.has(effectiveJobType)) {
      return res.status(400).json({
        error: `Invalid job_type. Allowed: ${[...ALLOWED_JOB_TYPES].join(', ')}`,
      });
    }

    // S1-02: Validate GPU type allowlist (same check as the main submit endpoint)
    const adminGpuTypeError = validateGpuType(gpu_requirements?.gpu_type);
    if (adminGpuTypeError) {
      return res.status(400).json({ error: adminGpuTypeError, code: 'INVALID_GPU_TYPE' });
    }

    const pricingClass = normalizePricingClass(requestedPricingClass || 'standard');
    const estimatedCostHalala = calculateCostHalala(effectiveJobType, durationMinutes, pricingClass);
    const payloadModel = normalizeModelField(requestedModel);
    const minVramGb = toFiniteNumber(gpu_requirements?.min_vram_gb, { min: 0, max: 1024 }) || 0;
    const gpuType = normalizeString(gpu_requirements?.gpu_type) || null;
    const requestedProviderId = reqProviderId == null ? null : toFiniteInt(reqProviderId, { min: 1 });

    if (req.renter.balance_halala < estimatedCostHalala) {
      return res.status(402).json({
        error: 'Insufficient balance',
        balance_halala: req.renter.balance_halala,
        required_halala: estimatedCostHalala,
        shortfall_halala: estimatedCostHalala - req.renter.balance_halala,
      });
    }

    const now = new Date().toISOString();
    const job_id = 'job-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');

    db.prepare(
      `INSERT INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at,
        duration_minutes, cost_halala, gpu_requirements, created_at, pricing_class)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    ).run(
      job_id, requestedProviderId, req.renter.id, effectiveJobType, payloadModel,
      now, durationMinutes, estimatedCostHalala,
      gpu_requirements ? JSON.stringify(gpu_requirements) : null, now, pricingClass
    );
    db.prepare(
      `UPDATE renters SET total_jobs = total_jobs + 1, updated_at = ? WHERE id = ?`
    ).run(now, req.renter.id);

    const requirements = {
      min_vram_gb: minVramGb,
      gpu_type: gpuType,
      job_type: effectiveJobType,
      pricing_class: pricingClass,
    };

    const dispatchResult = await getDispatchService().dispatch(
      req.renter.id, job_id, estimatedCostHalala, requirements
    );

    const job = db.get('SELECT * FROM jobs WHERE job_id = ?', job_id);
    const responseBody = {
      success: true,
      job: {
        job_id: job.job_id,
        job_type: job.job_type,
        model: job.model,
        status: job.status,
        cost_halala: job.cost_halala,
        duration_minutes: job.duration_minutes,
        pricing_class: job.pricing_class,
        submitted_at: job.submitted_at,
        provider_id: job.provider_id,
        renter_id: job.renter_id,
      },
      dispatch: {
        assigned: dispatchResult.assigned,
        queued: dispatchResult.queued,
        hold_id: dispatchResult.holdId,
        provider: dispatchResult.provider
          ? { id: dispatchResult.provider.id, name: dispatchResult.provider.name }
          : null,
      },
    };

    // Cache for idempotency deduplication
    if (idempotencyKey) {
      const cacheKey = `${req.renter.id}:${String(idempotencyKey).slice(0, 128)}`;
      _jobIdempotencyCache.set(cacheKey, { body: responseBody, ts: Date.now() });
    }

    // X-RateLimit-Remaining for clients using legacy header format
    const rlRemaining = req.rateLimit?.remaining;
    if (rlRemaining != null) res.setHeader('X-RateLimit-Remaining', String(rlRemaining));

    return res.status(201).json(responseBody);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({
        error: 'Insufficient credits',
        available_halala: err.available,
        required_halala: err.required,
        shortfall_halala: err.shortfall,
        docs: 'POST /api/renters/topup to add balance',
      });
    }
    console.error('[POST /api/jobs] dispatch error:', err);
    res.status(500).json({ error: 'Job dispatch failed', code: 'DISPATCH_ERROR' });
  }
});

/**
 * PATCH /api/jobs/:id/complete
 * Provider or admin signals completion. Settles the credit hold:
 * actual cost debited from renter balance, excess hold freed.
 */
router.patch('/:job_id/complete', async (req, res) => {
  try {
    const job = db.get(
      'SELECT * FROM jobs WHERE id = ? OR job_id = ?',
      req.params.job_id, req.params.job_id
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (!isAdmin(req)) {
      const provider = getProviderFromReq(req);
      if (!provider || provider.id !== job.provider_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (['completed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ error: `Job already in terminal state: ${job.status}` });
    }

    const now = new Date().toISOString();
    const startedAt = job.started_at || job.submitted_at;
    const elapsedSeconds = startedAt
      ? Math.max(1, Math.ceil((new Date(now) - new Date(startedAt)) / 1000))
      : ((job.duration_minutes || 1) * 60);
    const { compute_halala, storage_halala, bandwidth_halala, total_halala } = estimateThreeComponentCost({
      gpuModel: job.gpu_model,
      durationSeconds: elapsedSeconds,
      storageGbSeconds: 0,
      bandwidthBytesOut: 0,
      pricingClass: job.pricing_class,
      jobType: job.job_type,
    });
    const totalCostHalala = Math.max(0, total_halala);
    const { provider: providerEarned, dc1: dc1Fee } = splitBilling(totalCostHalala);

    runStatement(
      `UPDATE jobs SET status = 'completed', completed_at = ?,
        actual_duration_minutes = ?, actual_cost_halala = ?,
        provider_earned_halala = ?, dc1_fee_halala = ?,
        gpu_seconds_used = ?, storage_gb_seconds = 0,
        bandwidth_bytes_out = 0, bandwidth_bytes_in = 0,
        compute_halala = ?, storage_halala = ?, bandwidth_halala = ?
       WHERE id = ?`,
      now, Math.ceil(elapsedSeconds / 60), totalCostHalala, providerEarned, dc1Fee,
      elapsedSeconds, compute_halala, storage_halala, bandwidth_halala, job.id
    );

    if (job.provider_id) {
      runStatement(
        `UPDATE providers SET total_jobs = total_jobs + 1,
          total_earnings = total_earnings + ?,
          claimable_earnings_halala = claimable_earnings_halala + ?
         WHERE id = ?`,
        providerEarned / 100, providerEarned, job.provider_id
      );
    }

    const settlement = await getDispatchService().completeJob(job.job_id, actualCostHalala);

    recordLifecycleEvent(job, 'job.completed', {
      status: 'completed', source: 'patch_complete',
      message: 'Job completed via PATCH /complete',
      payload: { actual_duration_minutes: actualMinutes, actual_cost_halala: actualCostHalala },
    });

    return res.json({
      success: true, job_id: job.job_id, status: 'completed',
      billing: {
        actual_duration_minutes: actualMinutes,
        actual_cost_halala: actualCostHalala,
        provider_earned_halala: providerEarned,
        dc1_fee_halala: dc1Fee,
      },
      settlement,
    });
  } catch (err) {
    console.error('[PATCH /api/jobs/:id/complete] error:', err);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

/**
 * PATCH /api/jobs/:id/fail
 * Provider or admin signals failure. Releases credit hold —
 * the renter is not charged for failed jobs.
 */
router.patch('/:job_id/fail', async (req, res) => {
  try {
    const job = db.get(
      'SELECT * FROM jobs WHERE id = ? OR job_id = ?',
      req.params.job_id, req.params.job_id
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (!isAdmin(req)) {
      const provider = getProviderFromReq(req);
      if (!provider || provider.id !== job.provider_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      return res.status(400).json({ error: `Job already in terminal state: ${job.status}` });
    }

    const now = new Date().toISOString();
    const reason = req.body?.reason || 'provider_reported_failure';

    runStatement(
      `UPDATE jobs SET status = 'failed', completed_at = ?, notes = ? WHERE id = ?`,
      now, reason, job.id
    );

    const release = await getDispatchService().failJob(job.job_id);

    recordLifecycleEvent(job, 'job.failed', {
      status: 'failed', source: 'patch_fail',
      message: 'Job failed via PATCH /fail',
      payload: { reason },
    });

    return res.json({
      success: true, job_id: job.job_id, status: 'failed', reason,
      credit_hold_released: release.released,
      released_halala: release.releasedHalala,
    });
  } catch (err) {
    console.error('[PATCH /api/jobs/:id/fail] error:', err);
    res.status(500).json({ error: 'Failed to mark job as failed' });
  }
});

/**
 * POST /api/jobs/from-template
 *
 * Renter-facing one-click deploy from the marketplace deploy modal:
 * "I want to run THIS model — find me an online provider that already
 * caches it and meets its VRAM floor, then queue the job."
 *
 * Body: { model_id?, template_id?, duration_minutes? }
 *  - At least one of model_id or template_id must be present.
 *  - duration_minutes defaults to 60 if omitted (1..1440).
 *
 * Selection rules (provider must satisfy ALL):
 *  - status = 'online' AND is_paused = 0
 *  - fresh heartbeat (< 10 min)
 *  - cached_models contains the model_id (case-insensitive substring)
 *  - VRAM >= model_registry.min_gpu_vram_gb for the model
 *
 * 503 with capacity snapshot if nothing matches.
 *
 * Returns 201 { job_id, jobId, status, model, provider, totalCost }.
 */
router.post('/from-template', jobCreateLimiter, requireRenter, (req, res) => {
  try {
    const rawModelId = typeof req.body?.model_id === 'string' ? req.body.model_id.trim() : '';
    const rawTemplateId = typeof req.body?.template_id === 'string' ? req.body.template_id.trim() : '';
    const modelId = rawModelId.slice(0, 256);
    const templateId = rawTemplateId.slice(0, 128);

    if (!modelId && !templateId) {
      return res.status(400).json({
        error: 'model_id or template_id is required',
        code: 'MISSING_TARGET',
      });
    }

    const rawDuration = req.body?.duration_minutes;
    const duration_minutes = rawDuration === undefined || rawDuration === null
      ? 60
      : Number(rawDuration);
    if (!Number.isFinite(duration_minutes) || duration_minutes <= 0 || duration_minutes > 1440) {
      return res.status(400).json({ error: 'duration_minutes must be between 1 and 1440' });
    }

    // ── Resolve the model row from the registry (authoritative source for VRAM) ──
    // If model_id is missing but template_id is given, the template's job_type
    // drives sizing instead; we still need *some* min_vram floor (0 = any).
    let modelRow = null;
    if (modelId) {
      modelRow = db.get(
        `SELECT model_id, display_name, min_gpu_vram_gb, default_price_halala_per_min, is_active,
                ollama_pull_uri, vllm_model_uri, preferred_engine, download_size_bytes
           FROM model_registry
          WHERE model_id = ? OR LOWER(model_id) = LOWER(?)
          LIMIT 1`,
        modelId, modelId
      );
      if (!modelRow) {
        return res.status(404).json({
          error: `Model '${modelId}' not found in catalog`,
          code: 'MODEL_NOT_FOUND',
        });
      }
      if (Number(modelRow.is_active) === 0) {
        return res.status(410).json({
          error: `Model '${modelId}' is no longer active in the catalog`,
          code: 'MODEL_INACTIVE',
        });
      }
    }

    const minVramGb = Number(modelRow?.min_gpu_vram_gb) || 0;
    const minVramMib = minVramGb * 1024;

    // ── Provider lookup: model-cached + fresh + sufficient VRAM ──
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const modelLike = modelId ? `%${modelId.toLowerCase()}%` : null;

    const providerSql = modelId
      ? `SELECT p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib,
                p.cached_models, p.last_heartbeat,
                COUNT(CASE WHEN j.status IN ('assigned','pulling','running','pending') THEN 1 END) AS active_jobs
           FROM providers p
      LEFT JOIN jobs j ON j.provider_id = p.id
          WHERE p.status = 'online'
            AND COALESCE(p.is_paused, 0) = 0
            AND p.last_heartbeat >= ?
            AND COALESCE(p.gpu_vram_mib, p.vram_gb * 1024, 0) >= ?
            AND LOWER(COALESCE(p.cached_models, '')) LIKE ?
          GROUP BY p.id
          ORDER BY active_jobs ASC, p.last_heartbeat DESC
          LIMIT 1`
      : `SELECT p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib,
                p.cached_models, p.last_heartbeat,
                COUNT(CASE WHEN j.status IN ('assigned','pulling','running','pending') THEN 1 END) AS active_jobs
           FROM providers p
      LEFT JOIN jobs j ON j.provider_id = p.id
          WHERE p.status = 'online'
            AND COALESCE(p.is_paused, 0) = 0
            AND p.last_heartbeat >= ?
            AND COALESCE(p.gpu_vram_mib, p.vram_gb * 1024, 0) >= ?
          GROUP BY p.id
          ORDER BY active_jobs ASC, p.last_heartbeat DESC
          LIMIT 1`;
    const providerArgs = modelId ? [tenMinAgo, minVramMib, modelLike] : [tenMinAgo, minVramMib];
    const provider = db.get(providerSql, ...providerArgs);

    if (!provider) {
      // Migration 008: nobody has it cached, but maybe somebody with enough
      // VRAM can pull it. Pick the freshest capable provider and write a
      // pull_model task — the renter waits in `warming_provider` state.
      // Three preconditions:
      //   1. model row has ollama_pull_uri set (otherwise we don't know what
      //      to pull and we should still 503 honestly)
      //   2. a capable provider exists (VRAM + fresh heartbeat + not paused)
      //   3. that provider has enough free disk (best-effort: not required
      //      yet because the daemon doesn't surface disk_free; the agent's
      //      own preflight will refuse the pull if it can't fit)
      const capable = db.all(
        `SELECT p.id, p.name, p.gpu_model, p.last_heartbeat
           FROM providers p
          WHERE p.status = 'online'
            AND COALESCE(p.is_paused, 0) = 0
            AND p.last_heartbeat >= ?
            AND COALESCE(p.gpu_vram_mib, p.vram_gb * 1024, 0) >= ?
       ORDER BY (SELECT COUNT(*) FROM jobs j WHERE j.provider_id = p.id AND j.status IN ('assigned','pulling','running','pending')) ASC,
                p.last_heartbeat DESC`,
        tenMinAgo, minVramMib
      );
      const pullUri = modelRow && typeof modelRow.ollama_pull_uri === 'string' && modelRow.ollama_pull_uri.trim()
        ? modelRow.ollama_pull_uri.trim() : null;
      if (!pullUri || !Array.isArray(capable) || capable.length === 0) {
        return res.status(503).json({
          error: modelId
            ? `No online provider has '${modelId}' cached and no auto-pull configured`
            : 'No online provider currently meets the VRAM floor',
          code: 'NO_PROVIDER_AVAILABLE',
          required_vram_gb: minVramGb,
          model_id: modelId || null,
          capable_provider_count: Array.isArray(capable) ? capable.length : 0,
          retry_after_seconds: 60,
        });
      }
      const targetProvider = capable[0];
      const nowIso = new Date().toISOString();
      const job_id = 'job-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
      const taskInsert = db.prepare(
        `INSERT INTO pending_provider_tasks
           (provider_id, task_type, params_json, status, created_at, source_job_id)
         VALUES (?, 'pull_model', ?, 'queued', ?, ?)`
      ).run(
        targetProvider.id,
        JSON.stringify({
          model_id: modelRow.model_id,
          ollama_pull_uri: pullUri,
          download_size_bytes: modelRow.download_size_bytes || null,
        }),
        nowIso,
        job_id
      );
      const taskId = taskInsert.lastInsertRowid;
      // Hold a placeholder job in warming_provider state so the renter
      // has something to poll. Cost is 0 — we don't charge for warming.
      // Schema-flex: jobs table is wide; only set what we need.
      const JOB_COLS = new Set((db.all("PRAGMA table_info('jobs')") || []).map(r => r.name));
      const hasWarmingTaskId = JOB_COLS.has('warming_task_id');
      const insertCols = ['job_id', 'provider_id', 'renter_id', 'job_type', 'status',
                          'submitted_at', 'duration_minutes', 'cost_halala',
                          'gpu_requirements', 'task_spec', 'created_at', 'pricing_class'];
      const insertVals = [job_id, targetProvider.id, req.renter.id, 'inference',
                          'warming_provider', nowIso, duration_minutes, 0,
                          minVramGb ? JSON.stringify({ min_vram_gb: minVramGb }) : null,
                          JSON.stringify({
                            job_type: 'inference',
                            model_id: modelRow.model_id,
                            warming: true,
                          }),
                          nowIso, 'standard'];
      if (hasWarmingTaskId) { insertCols.push('warming_task_id'); insertVals.push(taskId); }
      const placeholders = insertCols.map(() => '?').join(',');
      db.prepare(`INSERT INTO jobs (${insertCols.join(',')}) VALUES (${placeholders})`).run(...insertVals);
      // Eta is rough: 80 MB/s sustained pull on Saudi residential broadband
      // assumed at 30 Mbps real-world ≈ 3 MB/s → size_GB × ~5 minutes/GB.
      const sizeGb = (modelRow.download_size_bytes || 0) / 1_000_000_000;
      const etaSeconds = Math.max(60, Math.round(sizeGb * 300));
      return res.status(202).json({
        job_id,
        jobId: job_id,
        id: job_id,
        status: 'warming_provider',
        warming: true,
        task_id: taskId,
        model: { model_id: modelRow.model_id, display_name: modelRow.display_name, min_gpu_vram_gb: modelRow.min_gpu_vram_gb },
        provider: { id: targetProvider.id, name: targetProvider.name, gpu_model: targetProvider.gpu_model },
        eta_seconds: etaSeconds,
        message: `Model warming on provider "${targetProvider.name}". Estimated ${Math.ceil(etaSeconds / 60)} min until first request can route.`,
      });
    }

    // ── Cost & balance ──
    const pricing_class = 'standard';
    const cost_halala = pricingService.calculateCostHalala(
      provider.gpu_model || null, duration_minutes, pricing_class, 'inference'
    );
    if (req.renter.balance_halala < cost_halala) {
      return res.status(402).json({
        error: 'Insufficient balance',
        balance_halala: req.renter.balance_halala,
        required_halala: cost_halala,
        shortfall_halala: cost_halala - req.renter.balance_halala,
      });
    }

    // ── Atomic insert + balance debit + counter bump ──
    const now = new Date().toISOString();
    const job_id = 'job-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const gpuReqs = minVramGb ? JSON.stringify({ min_vram_gb: minVramGb }) : null;
    const taskSpec = JSON.stringify({
      job_type: 'inference',
      template_id: templateId || null,
      model_id: modelId || null,
      params: {},
    });
    const containerSpec = JSON.stringify({ pricing_class });
    const timeoutSec = Math.min(Math.ceil(duration_minutes * 60) + 600, 86400);
    const timeoutAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

    const JOB_COLS = new Set((db.all("PRAGMA table_info('jobs')") || []).map(r => r.name));
    const hasTemplateId = JOB_COLS.has('template_id');
    const hasModel = JOB_COLS.has('model');

    const cols = [
      'job_id', 'provider_id', 'renter_id', 'job_type', 'status', 'submitted_at',
      'duration_minutes', 'cost_halala', 'gpu_requirements', 'container_spec', 'task_spec',
      'max_duration_seconds', 'timeout_at', 'created_at', 'priority', 'pricing_class',
      'prewarm_requested', 'workspace_volume_name', 'checkpoint_enabled',
    ];
    const vals = [
      job_id, provider.id, req.renter.id, 'inference', 'pending', now,
      duration_minutes, cost_halala, gpuReqs, containerSpec, taskSpec,
      timeoutSec, timeoutAt, now, 2, pricing_class,
      0, `dcp-job-${job_id}`, 0,
    ];
    if (hasTemplateId) { cols.push('template_id'); vals.push(templateId || null); }
    if (hasModel && modelId) { cols.push('model'); vals.push(modelId); }

    const placeholders = cols.map(() => '?').join(',');
    const insertSql = `INSERT INTO jobs (${cols.join(',')}) VALUES (${placeholders})`;

    const doInsert = () => {
      db.prepare('UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ? WHERE id = ?')
        .run(cost_halala, now, req.renter.id);
      db.prepare(insertSql).run(...vals);
      db.prepare('UPDATE renters SET total_jobs = total_jobs + 1, updated_at = ? WHERE id = ?')
        .run(now, req.renter.id);
    };
    if (typeof db?._db?.transaction === 'function') {
      db._db.transaction(doInsert)();
    } else {
      doInsert();
    }

    return res.status(201).json({
      job_id,
      jobId: job_id,
      id: job_id,
      status: 'pending',
      model: modelRow
        ? { model_id: modelRow.model_id, display_name: modelRow.display_name, min_gpu_vram_gb: modelRow.min_gpu_vram_gb }
        : null,
      provider: { id: provider.id, name: provider.name, gpu_model: provider.gpu_model },
      duration_minutes,
      totalCost: {
        halala: cost_halala,
        sar: (cost_halala / 100).toFixed(2),
      },
      message: `Job queued on provider "${provider.name}".`,
    });
  } catch (err) {
    console.error('[POST /api/jobs/from-template] error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.calculateCostHalala = calculateCostHalala;
module.exports.COST_RATES = COST_RATES;
module.exports.PRICING_CLASS_MULTIPLIERS = PRICING_CLASS_MULTIPLIERS;
module.exports.enforceJobTimeouts = enforceJobTimeouts;
module.exports.signTaskSpec = signTaskSpec;
module.exports.HMAC_SECRET = HMAC_SECRET;
