'use strict';

const crypto = require('crypto');
const { buildEvaluatorJobSchema } = require('./evaluatorJobSchema');

const EVALUATOR_JOB_RECORD_VERSION = 'dcp.evaluator_job_record.v1';
const EVALUATOR_JOB_STATUSES = Object.freeze([
  'draft',
  'blocked',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
const EVALUATOR_JOB_STATUS_SET = new Set(EVALUATOR_JOB_STATUSES);
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

class EvaluatorJobError extends Error {
  constructor(message, { code = 'evaluator_job_error', httpStatus = 400, details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorJobError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function ensureEvaluatorJobSchema(db) {
  const schemaDb = db && typeof db.exec === 'function'
    ? db
    : db && db._db && typeof db._db.exec === 'function'
      ? db._db
      : null;
  if (!schemaDb) {
    throw new TypeError('ensureEvaluatorJobSchema requires a better-sqlite3 db with exec(sql)');
  }

  schemaDb.exec(`
    CREATE TABLE IF NOT EXISTS evaluator_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_job_id TEXT NOT NULL UNIQUE,
      renter_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      task TEXT NOT NULL,
      dataset_ref TEXT NOT NULL,
      dataset_sha256 TEXT NOT NULL,
      dataset_format TEXT NOT NULL DEFAULT 'jsonl',
      dataset_example_count INTEGER NOT NULL DEFAULT 0,
      candidate_model TEXT NOT NULL,
      baseline_models_json TEXT NOT NULL DEFAULT '[]',
      metrics_json TEXT NOT NULL,
      max_examples INTEGER NOT NULL DEFAULT 100,
      redaction_review_id TEXT,
      cost_budget_halala INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','blocked','queued','running','succeeded','failed','cancelled')),
      result_manifest_json TEXT,
      failure_reason TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      queued_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_evaluator_jobs_renter_created ON evaluator_jobs(renter_id, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_evaluator_jobs_renter_status ON evaluator_jobs(renter_id, status, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_evaluator_jobs_dataset_sha ON evaluator_jobs(dataset_sha256)`);
  schemaDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluator_jobs_renter_idempotency
      ON evaluator_jobs(renter_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL
  `);
}

function createEvaluatorJob(db, renterId, input = {}, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const idempotencyKey = normalizeOptionalIdempotencyKey(
    options.idempotencyKey || input.idempotency_key || input.idempotencyKey
  );
  if (idempotencyKey) {
    const existing = getEvaluatorJobByIdempotencyKey(db, ownerId, idempotencyKey);
    if (existing) {
      return {
        eval_job: existing,
        idempotent_replay: true,
      };
    }
  }

  const normalized = normalizeEvaluatorJobInput(input);
  const now = new Date().toISOString();
  const evalJobId = normalizeEvalJobId(input.eval_job_id);

  try {
    db.prepare(`
      INSERT INTO evaluator_jobs (
        eval_job_id, renter_id, name, task, dataset_ref, dataset_sha256,
        dataset_format, dataset_example_count, candidate_model,
        baseline_models_json, metrics_json, max_examples, redaction_review_id,
        cost_budget_halala, metadata_json, status, result_manifest_json,
        failure_reason, idempotency_key, created_at, updated_at,
        queued_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft',
        NULL, NULL, ?, ?, ?, NULL, NULL, NULL)
    `).run(
      evalJobId,
      ownerId,
      normalized.name,
      normalized.task,
      normalized.dataset_ref,
      normalized.dataset_sha256,
      normalized.dataset_format,
      normalized.dataset_example_count,
      normalized.candidate_model,
      JSON.stringify(normalized.baseline_models),
      JSON.stringify(normalized.metrics),
      normalized.max_examples,
      normalized.redaction_review_id,
      normalized.cost_budget_halala,
      normalized.metadata_json,
      idempotencyKey,
      now,
      now,
    );
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    const message = String(error && error.message ? error.message : '');
    if (message.includes('idx_evaluator_jobs_renter_idempotency')
      || (message.includes('evaluator_jobs.renter_id') && message.includes('evaluator_jobs.idempotency_key'))) {
      const existing = getEvaluatorJobByIdempotencyKey(db, ownerId, idempotencyKey);
      if (existing) {
        return {
          eval_job: existing,
          idempotent_replay: true,
        };
      }
    }
    if (message.includes('UNIQUE constraint failed: evaluator_jobs.eval_job_id')) {
      evaluatorJobError('eval_job_id already exists', {
        code: 'evaluator_job_exists',
        httpStatus: 409,
        details: { eval_job_id: evalJobId },
      });
    }
    if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
      evaluatorJobError('Evaluator job uniqueness constraint failed', {
        code: 'evaluator_job_unique_conflict',
        httpStatus: 409,
      });
    }
    throw error;
  }

  return {
    eval_job: getEvaluatorJob(db, ownerId, evalJobId),
    idempotent_replay: false,
  };
}

function listEvaluatorJobs(db, renterId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const status = normalizeOptionalStatus(options.status);
  const params = [ownerId];
  let where = 'WHERE renter_id = ?';
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  params.push(limit, offset);
  const rows = db.prepare(`
    SELECT * FROM evaluator_jobs
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params);
  return {
    eval_jobs: rows.map(serializeEvaluatorJobRow),
    limit,
    offset,
  };
}

function getEvaluatorJob(db, renterId, evalJobId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const normalizedId = normalizeRequiredString(evalJobId, 'eval_job_id', { max: 80 });
  const row = db.prepare(`
    SELECT * FROM evaluator_jobs
    WHERE renter_id = ? AND eval_job_id = ?
  `).get(ownerId, normalizedId);
  return row ? serializeEvaluatorJobRow(row) : null;
}

function getEvaluatorJobByIdempotencyKey(db, renterId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const row = db.prepare(`
    SELECT * FROM evaluator_jobs
    WHERE renter_id = ? AND idempotency_key = ?
  `).get(ownerId, idempotencyKey);
  return row ? serializeEvaluatorJobRow(row) : null;
}

function serializeEvaluatorJobRow(row) {
  const resultManifest = parseJson(row.result_manifest_json, null);
  return {
    object: 'evaluator_job',
    version: EVALUATOR_JOB_RECORD_VERSION,
    eval_job_id: row.eval_job_id,
    renter_id: row.renter_id,
    name: row.name,
    task: row.task,
    dataset: {
      ref: row.dataset_ref,
      sha256: row.dataset_sha256,
      format: row.dataset_format || 'jsonl',
      example_count: Number(row.dataset_example_count || 0),
      raw_publication_allowed: false,
    },
    candidate_model: row.candidate_model,
    baseline_models: parseJson(row.baseline_models_json, []),
    metrics: parseJson(row.metrics_json, []),
    max_examples: Number(row.max_examples || 100),
    redaction_review_id: row.redaction_review_id || null,
    cost_budget_halala: Number(row.cost_budget_halala || 0),
    metadata: parseJson(row.metadata_json, null),
    status: row.status,
    worker_enabled: false,
    billing_enabled: false,
    result_available: Boolean(resultManifest && row.status === 'succeeded'),
    result_manifest: resultManifest,
    failure_reason: row.failure_reason || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    queued_at: row.queued_at || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    next: row.status === 'draft'
      ? 'evaluator_worker_and_result_artifact_not_enabled'
      : null,
  };
}

function normalizeEvaluatorJobInput(input = {}) {
  const schema = buildEvaluatorJobSchema(new Date('2026-07-09T00:00:00.000Z'));
  const taskAllowed = new Set(schema.request_schema.fields.task.allowed_values);
  const metricsAllowed = new Set(schema.request_schema.fields.metrics.allowed_values);
  const dataset = input.dataset && typeof input.dataset === 'object' ? input.dataset : {};
  const task = normalizeRequiredString(input.task, 'task', { max: 80 });
  if (!taskAllowed.has(task)) {
    evaluatorJobError('Unsupported evaluator task', {
      code: 'unsupported_evaluator_task',
      details: { task, allowed_values: [...taskAllowed] },
    });
  }
  const datasetFormat = normalizeRequiredString(dataset.format ?? input.dataset_format ?? 'jsonl', 'dataset.format', { max: 20 });
  if (datasetFormat !== 'jsonl') {
    evaluatorJobError('Only jsonl evaluator datasets are supported by the metadata contract', {
      code: 'unsupported_evaluator_dataset_format',
      details: { format: datasetFormat, allowed_values: ['jsonl'] },
    });
  }
  const metrics = normalizeStringArray(input.metrics, 'metrics', { min: 1, max: 12, itemMax: 80 });
  const unsupportedMetrics = metrics.filter((metric) => !metricsAllowed.has(metric));
  if (unsupportedMetrics.length > 0) {
    evaluatorJobError('Unsupported evaluator metric', {
      code: 'unsupported_evaluator_metric',
      details: { metrics: unsupportedMetrics, allowed_values: [...metricsAllowed] },
    });
  }
  return {
    name: normalizeRequiredString(input.name, 'name', { max: 120 }),
    task,
    dataset_ref: normalizeRequiredString(dataset.ref ?? input.dataset_ref, 'dataset.ref', { max: 512 }),
    dataset_sha256: normalizeSha256(dataset.sha256 ?? input.dataset_sha256, 'dataset.sha256'),
    dataset_format: datasetFormat,
    dataset_example_count: normalizePositiveInteger(dataset.example_count ?? input.dataset_example_count, 'dataset.example_count', { max: 10000000 }),
    candidate_model: normalizeRequiredString(input.candidate_model, 'candidate_model', { max: 200 }),
    baseline_models: normalizeStringArray(input.baseline_models ?? [], 'baseline_models', { min: 0, max: 12, itemMax: 200 }),
    metrics,
    max_examples: normalizePositiveInteger(input.max_examples ?? 100, 'max_examples', {
      min: 1,
      max: schema.scoring_harness.max_examples_hard_limit,
    }),
    redaction_review_id: normalizeOptionalString(input.redaction_review_id, 'redaction_review_id', { max: 120 }),
    cost_budget_halala: normalizeNonNegativeInteger(input.cost_budget_halala ?? 0, 'cost_budget_halala', { max: 1000000000 }),
    metadata_json: normalizeMetadata(input.metadata),
  };
}

function normalizeEvalJobId(value) {
  if (value == null || value === '') {
    return `evaljob_${crypto.randomBytes(10).toString('hex')}`;
  }
  const normalized = normalizeRequiredString(value, 'eval_job_id', { max: 80 });
  if (!/^evaljob_[A-Za-z0-9_-]{8,70}$/.test(normalized)) {
    evaluatorJobError('eval_job_id must start with evaljob_ and contain 8-70 URL-safe characters', {
      code: 'invalid_eval_job_id',
      details: { eval_job_id: normalized },
    });
  }
  return normalized;
}

function normalizeRequiredString(value, field, { max }) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    evaluatorJobError(`${field} is required`, {
      code: 'missing_required_field',
      details: { field },
    });
  }
  if (normalized.length > max) {
    evaluatorJobError(`${field} exceeds maximum length`, {
      code: 'field_too_long',
      details: { field, max },
    });
  }
  return normalized;
}

function normalizeOptionalString(value, field, { max }) {
  if (value == null || value === '') return null;
  return normalizeRequiredString(value, field, { max });
}

function normalizeSha256(value, field) {
  const normalized = normalizeRequiredString(value, field, { max: 64 }).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    evaluatorJobError(`${field} must be a 64-character SHA-256 hex digest`, {
      code: 'invalid_sha256',
      details: { field },
    });
  }
  return normalized;
}

function normalizeStringArray(value, field, { min, max, itemMax }) {
  if (!Array.isArray(value)) {
    evaluatorJobError(`${field} must be an array`, {
      code: 'invalid_array_field',
      details: { field },
    });
  }
  if (value.length < min || value.length > max) {
    evaluatorJobError(`${field} length is outside allowed bounds`, {
      code: 'array_length_out_of_bounds',
      details: { field, min, max },
    });
  }
  return value.map((item, index) => normalizeRequiredString(item, `${field}[${index}]`, { max: itemMax }));
}

function normalizePositiveInteger(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    evaluatorJobError(`${field} must be an integer between ${min} and ${max}`, {
      code: 'invalid_integer_field',
      details: { field, min, max },
    });
  }
  return n;
}

function normalizeNonNegativeInteger(value, field, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    evaluatorJobError(`${field} must be a non-negative integer`, {
      code: 'invalid_integer_field',
      details: { field, min: 0, max },
    });
  }
  return n;
}

function normalizeLimit(value) {
  if (value == null || value === '') return DEFAULT_LIMIT;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function normalizeOffset(value) {
  if (value == null || value === '') return 0;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeOptionalStatus(value) {
  if (value == null || value === '') return null;
  const status = String(value).trim().toLowerCase();
  if (!EVALUATOR_JOB_STATUS_SET.has(status)) {
    evaluatorJobError('Unsupported evaluator job status filter', {
      code: 'unsupported_evaluator_job_status',
      details: { status, allowed_values: EVALUATOR_JOB_STATUSES },
    });
  }
  return status;
}

function normalizeOptionalIdempotencyKey(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    evaluatorJobError('Idempotency-Key is too long', {
      code: 'idempotency_key_too_long',
      httpStatus: 400,
      details: { max: MAX_IDEMPOTENCY_KEY_LENGTH },
    });
  }
  return normalized;
}

function normalizeMetadata(value) {
  if (value == null) return null;
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_BYTES) {
    evaluatorJobError('metadata exceeds maximum size', {
      code: 'metadata_too_large',
      details: { max_bytes: MAX_METADATA_BYTES },
    });
  }
  return json;
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('Evaluator job service requires a better-sqlite3 db with prepare(sql)');
  }
}

function evaluatorJobError(message, options = {}) {
  throw new EvaluatorJobError(message, options);
}

module.exports = {
  EVALUATOR_JOB_RECORD_VERSION,
  EVALUATOR_JOB_STATUSES,
  EvaluatorJobError,
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
  getEvaluatorJob,
  listEvaluatorJobs,
};
