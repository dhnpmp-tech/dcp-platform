'use strict';

const crypto = require('crypto');
const {
  BatchInferenceContractError,
  MAX_BATCH_BYTES,
  MAX_BATCH_REQUESTS,
  parseBatchJsonl,
} = require('./batchInferenceContract');

const BATCH_STATUSES = Object.freeze([
  'created',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const BATCH_STATUS_SET = new Set(BATCH_STATUSES);
const COMPLETION_WINDOWS = Object.freeze(['24h']);
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_STORAGE_KEY_LENGTH = 512;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

class BatchInferenceJobError extends Error {
  constructor(message, { code = 'batch_inference_job_error', httpStatus = 400, details = undefined } = {}) {
    super(message);
    this.name = 'BatchInferenceJobError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function ensureBatchInferenceJobSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new TypeError('ensureBatchInferenceJobSchema requires a better-sqlite3 db with exec(sql)');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_inference_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL UNIQUE,
      renter_id INTEGER NOT NULL,
      input_storage_key TEXT NOT NULL,
      input_checksum_sha256 TEXT NOT NULL,
      input_normalized_bytes INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL,
      completion_window TEXT NOT NULL DEFAULT '24h',
      metadata_json TEXT,
      result_storage_key TEXT,
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created','queued','running','completed','failed','cancelled')),
      completed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      total_cost_halala INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      expires_at TEXT,
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_renter_created ON batch_inference_jobs(renter_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_renter_status ON batch_inference_jobs(renter_id, status, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_checksum ON batch_inference_jobs(input_checksum_sha256)`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_jobs_renter_idempotency
      ON batch_inference_jobs(renter_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL
  `);
}

function createBatchInferenceJob(db, renterId, input = {}, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const idempotencyKey = normalizeOptionalIdempotencyKey(
    options.idempotencyKey || input.idempotency_key || input.idempotencyKey
  );
  if (idempotencyKey) {
    const existing = getBatchByIdempotencyKey(db, ownerId, idempotencyKey);
    if (existing) {
      return {
        batch: existing,
        idempotent_replay: true,
      };
    }
  }

  let parsed;
  try {
    parsed = parseBatchJsonl(input.input_jsonl, {
      maxBytes: options.maxBytes || MAX_BATCH_BYTES,
      maxRequests: options.maxRequests || MAX_BATCH_REQUESTS,
    });
  } catch (error) {
    if (error instanceof BatchInferenceContractError) {
      batchError(error.message, {
        code: error.code,
        httpStatus: 400,
        details: {
          line: error.line,
          ...error.details,
        },
      });
    }
    throw error;
  }

  const now = new Date().toISOString();
  const batchId = normalizeBatchId(input.batch_id);
  const storageKey = normalizeInputStorageKey(input.input_storage_key, ownerId, batchId);
  const completionWindow = normalizeCompletionWindow(input.completion_window);
  const metadataJson = normalizeMetadata(input.metadata);
  const expiresAt = computeExpiresAt(now, completionWindow);

  try {
    db.prepare(`
      INSERT INTO batch_inference_jobs (
        batch_id, renter_id, input_storage_key, input_checksum_sha256,
        input_normalized_bytes, request_count, completion_window, metadata_json,
        result_storage_key, status, completed_count, failed_count, total_cost_halala,
        idempotency_key, created_at, updated_at, started_at, completed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'created', 0, 0, 0, ?, ?, ?, NULL, NULL, ?)
    `).run(
      batchId,
      ownerId,
      storageKey,
      parsed.checksum_sha256,
      parsed.normalized_bytes,
      parsed.counts.requests,
      completionWindow,
      metadataJson,
      idempotencyKey,
      now,
      now,
      expiresAt,
    );
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    const message = String(error && error.message ? error.message : '');
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || message.includes('UNIQUE constraint failed: batch_inference_jobs.batch_id')) {
      batchError('batch_id already exists', {
        code: 'batch_exists',
        httpStatus: 409,
        details: { batch_id: batchId },
      });
    }
    if (message.includes('idx_batch_jobs_renter_idempotency')) {
      const existing = getBatchByIdempotencyKey(db, ownerId, idempotencyKey);
      if (existing) {
        return {
          batch: existing,
          idempotent_replay: true,
        };
      }
    }
    throw error;
  }

  return {
    batch: getBatchInferenceJob(db, ownerId, batchId),
    idempotent_replay: false,
  };
}

function getBatchInferenceJob(db, renterId, batchId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const row = db.prepare(`
    SELECT batch_id, renter_id, input_storage_key, input_checksum_sha256,
           input_normalized_bytes, request_count, completion_window, metadata_json,
           result_storage_key, status, completed_count, failed_count,
           total_cost_halala, idempotency_key, created_at, updated_at,
           started_at, completed_at, expires_at
      FROM batch_inference_jobs
     WHERE renter_id = ? AND batch_id = ?
  `).get(ownerId, id);
  return mapBatchRow(row);
}

function listBatchInferenceJobs(db, renterId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const params = [ownerId];
  const where = ['renter_id = ?'];
  if (options.status) {
    where.push('status = ?');
    params.push(normalizeStatus(options.status));
  }
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  params.push(limit, offset);

  const rows = db.prepare(`
    SELECT batch_id, renter_id, input_storage_key, input_checksum_sha256,
           input_normalized_bytes, request_count, completion_window, metadata_json,
           result_storage_key, status, completed_count, failed_count,
           total_cost_halala, idempotency_key, created_at, updated_at,
           started_at, completed_at, expires_at
      FROM batch_inference_jobs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?
  `).all(...params);

  return {
    batches: rows.map(mapBatchRow),
    limit,
    offset,
  };
}

function updateBatchInferenceJobStatus(db, renterId, batchId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const nextStatus = normalizeStatus(status);
  const now = new Date().toISOString();
  const startedAt = nextStatus === 'running' ? now : null;
  const completedAt = ['completed', 'failed', 'cancelled'].includes(nextStatus) ? now : null;
  const resultStorageKey = options.result_storage_key == null
    ? null
    : normalizeStorageKey(options.result_storage_key, 'result_storage_key');
  const completedCount = normalizeNonNegativeInteger(options.completed_count ?? 0, 'completed_count');
  const failedCount = normalizeNonNegativeInteger(options.failed_count ?? 0, 'failed_count');
  const totalCostHalala = normalizeNonNegativeInteger(options.total_cost_halala ?? 0, 'total_cost_halala');

  const result = db.prepare(`
    UPDATE batch_inference_jobs
       SET status = ?,
           result_storage_key = COALESCE(?, result_storage_key),
           completed_count = CASE WHEN ? = 1 THEN ? ELSE completed_count END,
           failed_count = CASE WHEN ? = 1 THEN ? ELSE failed_count END,
           total_cost_halala = CASE WHEN ? = 1 THEN ? ELSE total_cost_halala END,
           updated_at = ?,
           started_at = COALESCE(started_at, ?),
           completed_at = COALESCE(?, completed_at)
     WHERE renter_id = ? AND batch_id = ?
  `).run(
    nextStatus,
    resultStorageKey,
    completedAt ? 1 : 0,
    completedCount,
    completedAt ? 1 : 0,
    failedCount,
    completedAt ? 1 : 0,
    totalCostHalala,
    now,
    startedAt,
    completedAt,
    ownerId,
    id,
  );
  if (!result || result.changes === 0) return null;
  return getBatchInferenceJob(db, ownerId, id);
}

function getBatchByIdempotencyKey(db, renterId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const row = db.prepare(`
    SELECT batch_id, renter_id, input_storage_key, input_checksum_sha256,
           input_normalized_bytes, request_count, completion_window, metadata_json,
           result_storage_key, status, completed_count, failed_count,
           total_cost_halala, idempotency_key, created_at, updated_at,
           started_at, completed_at, expires_at
      FROM batch_inference_jobs
     WHERE renter_id = ? AND idempotency_key = ?
  `).get(renterId, idempotencyKey);
  return mapBatchRow(row);
}

function mapBatchRow(row) {
  if (!row) return null;
  let metadata = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch (_) {
      metadata = null;
    }
  }
  return {
    batch_id: row.batch_id,
    renter_id: row.renter_id,
    status: row.status,
    input_storage_key: row.input_storage_key,
    input_checksum_sha256: row.input_checksum_sha256,
    input_normalized_bytes: row.input_normalized_bytes,
    request_count: row.request_count,
    completion_window: row.completion_window,
    metadata,
    result_storage_key: row.result_storage_key || null,
    completed_count: row.completed_count,
    failed_count: row.failed_count,
    total_cost_halala: row.total_cost_halala,
    idempotency_key: row.idempotency_key || null,
    execution_enabled: false,
    results_available: Boolean(row.result_storage_key && row.status === 'completed'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    expires_at: row.expires_at || null,
  };
}

function normalizeBatchId(value) {
  const id = value == null ? generateBatchId() : String(value).trim();
  if (!/^batch_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    batchError('batch_id must start with batch_ and contain URL-safe lowercase characters', {
      code: 'invalid_batch_id',
      details: { field: 'batch_id' },
    });
  }
  return id;
}

function generateBatchId() {
  return `batch_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeInputStorageKey(value, renterId, batchId) {
  if (value == null || value === '') {
    return `batch-inputs/renter-${renterId}/${batchId}/input.jsonl`;
  }
  return normalizeStorageKey(value, 'input_storage_key');
}

function normalizeStorageKey(value, fieldName) {
  if (typeof value !== 'string') {
    batchError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const key = value.trim().replace(/^\/+/, '');
  if (!key || key.length > MAX_STORAGE_KEY_LENGTH || key.includes('\0')) {
    batchError(`${fieldName} is invalid`, {
      code: 'invalid_storage_key',
      details: { field: fieldName, max_length: MAX_STORAGE_KEY_LENGTH },
    });
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
    batchError(`${fieldName} must be a relative object key without dot segments`, {
      code: 'invalid_storage_key',
      details: { field: fieldName },
    });
  }
  return key;
}

function normalizeCompletionWindow(value) {
  const window = String(value || '24h').trim().toLowerCase();
  if (!COMPLETION_WINDOWS.includes(window)) {
    batchError('completion_window is not supported', {
      code: 'invalid_completion_window',
      details: { allowed: COMPLETION_WINDOWS },
    });
  }
  return window;
}

function normalizeMetadata(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    batchError('metadata must be a JSON object', {
      code: 'invalid_metadata',
      details: { field: 'metadata' },
    });
  }
  let json;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    batchError('metadata must be JSON-serializable', {
      code: 'invalid_metadata',
      details: { field: 'metadata' },
    });
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_BYTES) {
    batchError('metadata is too large', {
      code: 'metadata_too_large',
      details: { max_bytes: MAX_METADATA_BYTES },
    });
  }
  return json;
}

function normalizeOptionalIdempotencyKey(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(key)) {
    batchError('idempotency key must be 1-180 URL-safe characters', {
      code: 'invalid_idempotency_key',
      details: { max_length: MAX_IDEMPOTENCY_KEY_LENGTH },
    });
  }
  return key;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!BATCH_STATUS_SET.has(status)) {
    batchError('status is not a supported batch lifecycle state', {
      code: 'invalid_status',
      details: { allowed: BATCH_STATUSES },
    });
  }
  return status;
}

function normalizePositiveInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    batchError(`${fieldName} must be a positive integer`, {
      code: 'invalid_integer',
      details: { field: fieldName },
    });
  }
  return n;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    batchError(`${fieldName} must be a non-negative integer`, {
      code: 'invalid_integer',
      details: { field: fieldName },
    });
  }
  return n;
}

function normalizeLimit(value) {
  if (value == null || value === '') return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(value) {
  if (value == null || value === '') return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return offset;
}

function computeExpiresAt(createdAtIso, completionWindow) {
  const createdAt = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdAt)) return null;
  if (completionWindow === '24h') {
    return new Date(createdAt + 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function batchError(message, opts) {
  throw new BatchInferenceJobError(message, opts);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('batch inference jobs require a db with prepare(sql)');
  }
}

module.exports = {
  BATCH_STATUSES,
  COMPLETION_WINDOWS,
  BatchInferenceJobError,
  ensureBatchInferenceJobSchema,
  createBatchInferenceJob,
  getBatchInferenceJob,
  listBatchInferenceJobs,
  updateBatchInferenceJobStatus,
  __test: {
    normalizeBatchId,
    normalizeInputStorageKey,
    normalizeCompletionWindow,
    normalizeMetadata,
    normalizeOptionalIdempotencyKey,
    normalizeStatus,
    generateBatchId,
    mapBatchRow,
  },
};
