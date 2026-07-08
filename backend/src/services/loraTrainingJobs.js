'use strict';

const crypto = require('crypto');
const {
  LoraContractError,
  normalizeLoraTrainingSpec,
  validateLoraDatasetJsonl,
} = require('./loraTrainingContract');
const {
  AdapterRegistryError,
  createAdapter,
  ensureAdapterRegistrySchema,
  getAdapter,
} = require('./adapterRegistry');

const TRAINING_JOB_STATUSES = Object.freeze([
  'created',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

const TRAINING_JOB_STATUS_SET = new Set(TRAINING_JOB_STATUSES);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const DEFAULT_MAX_DATASET_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_DATASET_ROWS = 100000;

class LoraTrainingJobError extends Error {
  constructor(message, { code = 'lora_training_job_error', httpStatus = 400, details = undefined } = {}) {
    super(message);
    this.name = 'LoraTrainingJobError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function ensureLoraTrainingJobsSchema(db) {
  const schemaDb = db && typeof db.exec === 'function'
    ? db
    : db && db._db && typeof db._db.exec === 'function'
      ? db._db
      : null;
  if (!schemaDb) {
    throw new TypeError('ensureLoraTrainingJobsSchema requires a better-sqlite3 db with exec(sql)');
  }

  schemaDb.exec(`
    CREATE TABLE IF NOT EXISTS lora_training_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      training_job_id TEXT NOT NULL UNIQUE,
      renter_id INTEGER NOT NULL,
      recipe TEXT NOT NULL,
      base_model TEXT NOT NULL,
      dataset_storage_key TEXT NOT NULL,
      dataset_checksum_sha256 TEXT NOT NULL,
      dataset_format TEXT NOT NULL,
      dataset_row_count INTEGER NOT NULL,
      train_rows INTEGER NOT NULL,
      validation_rows INTEGER NOT NULL,
      estimated_tokens INTEGER NOT NULL,
      output_adapter_name TEXT NOT NULL,
      output_adapter_id TEXT NOT NULL,
      training_spec_json TEXT NOT NULL,
      dataset_validation_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created','queued','running','succeeded','failed','cancelled')),
      artifact_storage_key TEXT,
      artifact_checksum_sha256 TEXT,
      model_card_storage_key TEXT,
      failure_reason TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_lora_training_jobs_renter_created ON lora_training_jobs(renter_id, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_lora_training_jobs_renter_status ON lora_training_jobs(renter_id, status, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_lora_training_jobs_output_adapter ON lora_training_jobs(output_adapter_id)`);
  schemaDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lora_training_jobs_renter_idempotency
      ON lora_training_jobs(renter_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL
  `);
}

function createLoraTrainingJob(db, renterId, input = {}, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const idempotencyKey = normalizeOptionalIdempotencyKey(
    options.idempotencyKey || input.idempotency_key || input.idempotencyKey
  );
  if (idempotencyKey) {
    const existing = getTrainingJobByIdempotencyKey(db, ownerId, idempotencyKey);
    if (existing) return { job: existing, idempotent_replay: true };
  }

  let datasetValidation;
  let trainingSpec;
  try {
    datasetValidation = validateLoraDatasetJsonl(input.dataset_jsonl, {
      maxBytes: options.maxDatasetBytes || DEFAULT_MAX_DATASET_BYTES,
      maxRows: options.maxDatasetRows || DEFAULT_MAX_DATASET_ROWS,
      validationSplitPct: input.validation_split_pct,
    });
    trainingSpec = normalizeLoraTrainingSpec(input);
  } catch (error) {
    if (error instanceof LoraContractError) {
      trainingJobError(error.message, {
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

  if (trainingSpec.dataset_storage_key !== normalizeStorageKey(input.dataset_storage_key, 'dataset_storage_key')) {
    trainingJobError('dataset_storage_key normalization mismatch', {
      code: 'invalid_dataset_storage_key',
      details: { dataset_storage_key: input.dataset_storage_key },
    });
  }

  const now = new Date().toISOString();
  const trainingJobId = normalizeTrainingJobId(input.training_job_id);
  const outputAdapterId = normalizeOutputAdapterId(input.output_adapter_id);
  const row = {
    training_job_id: trainingJobId,
    renter_id: ownerId,
    recipe: trainingSpec.recipe,
    base_model: trainingSpec.base_model,
    dataset_storage_key: trainingSpec.dataset_storage_key,
    dataset_checksum_sha256: datasetValidation.checksum_sha256,
    dataset_format: datasetValidation.format,
    dataset_row_count: datasetValidation.row_count,
    train_rows: datasetValidation.train_rows,
    validation_rows: datasetValidation.validation_rows,
    estimated_tokens: datasetValidation.estimated_tokens,
    output_adapter_name: trainingSpec.output_adapter_name,
    output_adapter_id: outputAdapterId,
    training_spec_json: JSON.stringify(trainingSpec),
    dataset_validation_json: JSON.stringify(datasetValidation),
    idempotency_key: idempotencyKey,
    created_at: now,
    updated_at: now,
  };

  try {
    db.prepare(`
      INSERT INTO lora_training_jobs (
        training_job_id, renter_id, recipe, base_model, dataset_storage_key,
        dataset_checksum_sha256, dataset_format, dataset_row_count, train_rows,
        validation_rows, estimated_tokens, output_adapter_name, output_adapter_id,
        training_spec_json, dataset_validation_json, status, artifact_storage_key,
        artifact_checksum_sha256, model_card_storage_key, failure_reason,
        idempotency_key, created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL)
    `).run(
      row.training_job_id,
      row.renter_id,
      row.recipe,
      row.base_model,
      row.dataset_storage_key,
      row.dataset_checksum_sha256,
      row.dataset_format,
      row.dataset_row_count,
      row.train_rows,
      row.validation_rows,
      row.estimated_tokens,
      row.output_adapter_name,
      row.output_adapter_id,
      row.training_spec_json,
      row.dataset_validation_json,
      row.idempotency_key,
      row.created_at,
      row.updated_at,
    );
  } catch (error) {
    const message = String(error && error.message ? error.message : '');
    if (message.includes('UNIQUE constraint failed: lora_training_jobs.training_job_id')) {
      trainingJobError('training_job_id already exists', {
        code: 'training_job_exists',
        httpStatus: 409,
        details: { training_job_id: trainingJobId },
      });
    }
    if (message.includes('idx_lora_training_jobs_renter_idempotency')) {
      const existing = getTrainingJobByIdempotencyKey(db, ownerId, idempotencyKey);
      if (existing) return { job: existing, idempotent_replay: true };
    }
    throw error;
  }

  return {
    job: getLoraTrainingJob(db, ownerId, trainingJobId),
    idempotent_replay: false,
  };
}

function getLoraTrainingJob(db, renterId, trainingJobId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeTrainingJobId(trainingJobId);
  const row = db.prepare(`${selectTrainingJobSql()} WHERE renter_id = ? AND training_job_id = ?`).get(ownerId, id);
  return decorateJobWithAdapterStatus(db, mapTrainingJobRow(row));
}

function listLoraTrainingJobs(db, renterId, options = {}) {
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
    ${selectTrainingJobSql()}
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?
  `).all(...params);
  return {
    jobs: rows.map((row) => decorateJobWithAdapterStatus(db, mapTrainingJobRow(row))),
    limit,
    offset,
  };
}

function updateLoraTrainingJobStatus(db, renterId, trainingJobId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeTrainingJobId(trainingJobId);
  const nextStatus = normalizeStatus(status);
  const now = new Date().toISOString();
  const startedAt = nextStatus === 'running' ? now : null;
  const completedAt = ['succeeded', 'failed', 'cancelled'].includes(nextStatus) ? now : null;
  const artifactStorageKey = options.artifact_storage_key == null
    ? null
    : normalizeStorageKey(options.artifact_storage_key, 'artifact_storage_key');
  const artifactChecksum = options.artifact_checksum_sha256 == null
    ? null
    : normalizeChecksum(options.artifact_checksum_sha256, 'artifact_checksum_sha256');
  const modelCardStorageKey = options.model_card_storage_key == null
    ? null
    : normalizeStorageKey(options.model_card_storage_key, 'model_card_storage_key');
  const failureReason = options.failure_reason == null
    ? null
    : normalizeBoundedString(options.failure_reason, 'failure_reason', 240);

  const result = db.prepare(`
    UPDATE lora_training_jobs
       SET status = ?,
           artifact_storage_key = COALESCE(?, artifact_storage_key),
           artifact_checksum_sha256 = COALESCE(?, artifact_checksum_sha256),
           model_card_storage_key = COALESCE(?, model_card_storage_key),
           failure_reason = COALESCE(?, failure_reason),
           updated_at = ?,
           started_at = COALESCE(started_at, ?),
           completed_at = COALESCE(?, completed_at)
     WHERE renter_id = ? AND training_job_id = ?
  `).run(
    nextStatus,
    artifactStorageKey,
    artifactChecksum,
    modelCardStorageKey,
    failureReason,
    now,
    startedAt,
    completedAt,
    ownerId,
    id,
  );
  if (!result || result.changes === 0) return null;
  return getLoraTrainingJob(db, ownerId, id);
}

function registerLoraTrainingJobAdapter(db, renterId, trainingJobId, options = {}) {
  assertDb(db);
  ensureAdapterRegistrySchema(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeTrainingJobId(trainingJobId);
  const job = getLoraTrainingJob(db, ownerId, id);
  if (!job) {
    trainingJobError('LoRA training job not found', {
      code: 'lora_training_job_not_found',
      httpStatus: 404,
      details: { training_job_id: id },
    });
  }
  if (job.status !== 'succeeded') {
    trainingJobError('LoRA training job must be succeeded before adapter registration', {
      code: 'training_job_not_succeeded',
      httpStatus: 409,
      details: {
        training_job_id: id,
        status: job.status,
      },
    });
  }
  if (!job.artifact_storage_key || !job.artifact_checksum_sha256) {
    trainingJobError('LoRA training job is missing adapter artifact proof', {
      code: 'adapter_artifact_proof_missing',
      httpStatus: 409,
      details: {
        training_job_id: id,
        requires: ['artifact_storage_key', 'artifact_checksum_sha256'],
      },
    });
  }

  const existingAdapter = getAdapter(db, ownerId, job.output_adapter_id);
  if (existingAdapter) {
    assertExistingAdapterMatchesJob(existingAdapter, job);
    return {
      job: markJobAdapterRegistered(job),
      adapter: existingAdapter,
      adapter_registered: true,
      idempotent_replay: true,
      serving_enabled: false,
      next: 'create_adapter_deployment_after_vllm_load_proof',
    };
  }

  let adapter;
  try {
    adapter = createAdapter(db, ownerId, {
      adapter_id: job.output_adapter_id,
      name: job.output_adapter_name,
      base_model: job.base_model,
      storage_key: job.artifact_storage_key,
      checksum_sha256: job.artifact_checksum_sha256,
      rank: job.training_spec?.hyperparameters?.rank,
      status: options.status || 'ready',
      metadata: buildAdapterMetadataFromTrainingJob(job),
    });
  } catch (error) {
    if (error instanceof AdapterRegistryError && error.code === 'adapter_exists') {
      const replayed = getAdapter(db, ownerId, job.output_adapter_id);
      if (replayed) {
        assertExistingAdapterMatchesJob(replayed, job);
        return {
          job: markJobAdapterRegistered(job),
          adapter: replayed,
          adapter_registered: true,
          idempotent_replay: true,
          serving_enabled: false,
          next: 'create_adapter_deployment_after_vllm_load_proof',
        };
      }
    }
    throw error;
  }

  return {
    job: markJobAdapterRegistered(getLoraTrainingJob(db, ownerId, id)),
    adapter,
    adapter_registered: true,
    idempotent_replay: false,
    serving_enabled: false,
    next: 'create_adapter_deployment_after_vllm_load_proof',
  };
}

function getTrainingJobByIdempotencyKey(db, renterId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const row = db.prepare(`${selectTrainingJobSql()} WHERE renter_id = ? AND idempotency_key = ?`).get(renterId, idempotencyKey);
  return mapTrainingJobRow(row);
}

function selectTrainingJobSql() {
  return `
    SELECT id, training_job_id, renter_id, recipe, base_model, dataset_storage_key,
           dataset_checksum_sha256, dataset_format, dataset_row_count, train_rows,
           validation_rows, estimated_tokens, output_adapter_name, output_adapter_id,
           training_spec_json, dataset_validation_json, status, artifact_storage_key,
           artifact_checksum_sha256, model_card_storage_key, failure_reason,
           idempotency_key, created_at, updated_at, started_at, completed_at
      FROM lora_training_jobs
  `;
}

function mapTrainingJobRow(row) {
  if (!row) return null;
  return {
    training_job_id: row.training_job_id,
    renter_id: row.renter_id,
    recipe: row.recipe,
    base_model: row.base_model,
    dataset_storage_key: row.dataset_storage_key,
    dataset_checksum_sha256: row.dataset_checksum_sha256,
    dataset_format: row.dataset_format,
    dataset_row_count: row.dataset_row_count,
    train_rows: row.train_rows,
    validation_rows: row.validation_rows,
    estimated_tokens: row.estimated_tokens,
    output_adapter_name: row.output_adapter_name,
    output_adapter_id: row.output_adapter_id,
    training_spec: safeJson(row.training_spec_json),
    dataset_validation: safeJson(row.dataset_validation_json),
    status: row.status,
    artifact_storage_key: row.artifact_storage_key || null,
    artifact_checksum_sha256: row.artifact_checksum_sha256 || null,
    model_card_storage_key: row.model_card_storage_key || null,
    failure_reason: row.failure_reason || null,
    idempotency_key: row.idempotency_key || null,
    training_enabled: false,
    adapter_registered: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

function decorateJobWithAdapterStatus(db, job) {
  if (!job) return null;
  return {
    ...job,
    adapter_registered: adapterExistsForJob(db, job),
  };
}

function adapterExistsForJob(db, job) {
  if (!job || !job.output_adapter_id) return false;
  try {
    const row = db.prepare(`
      SELECT 1
        FROM adapter_registry
       WHERE renter_id = ? AND adapter_id = ?
       LIMIT 1
    `).get(job.renter_id, job.output_adapter_id);
    return !!row;
  } catch (_) {
    return false;
  }
}

function markJobAdapterRegistered(job) {
  if (!job) return null;
  return {
    ...job,
    adapter_registered: true,
  };
}

function buildAdapterMetadataFromTrainingJob(job) {
  return {
    source: 'lora_training_job',
    training_job_id: job.training_job_id,
    recipe: job.recipe,
    dataset: {
      storage_key: job.dataset_storage_key,
      checksum_sha256: job.dataset_checksum_sha256,
      format: job.dataset_format,
      row_count: job.dataset_row_count,
      train_rows: job.train_rows,
      validation_rows: job.validation_rows,
      estimated_tokens: job.estimated_tokens,
    },
    model_card_storage_key: job.model_card_storage_key,
    safety: {
      trainer_artifact_required: true,
      serving_load_proof_required: true,
      route_traffic: false,
    },
  };
}

function assertExistingAdapterMatchesJob(adapter, job) {
  const mismatches = [];
  if (adapter.base_model !== job.base_model) mismatches.push('base_model');
  if (adapter.storage_key !== job.artifact_storage_key) mismatches.push('storage_key');
  if (adapter.checksum_sha256 !== job.artifact_checksum_sha256) mismatches.push('checksum_sha256');
  if (mismatches.length > 0) {
    trainingJobError('Existing adapter does not match LoRA training artifact proof', {
      code: 'adapter_registration_conflict',
      httpStatus: 409,
      details: {
        adapter_id: adapter.adapter_id,
        training_job_id: job.training_job_id,
        mismatches,
      },
    });
  }
}

function normalizeTrainingJobId(value) {
  const id = value == null ? generateTrainingJobId() : String(value).trim();
  if (!/^lora_job_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    trainingJobError('training_job_id must start with lora_job_ and contain URL-safe lowercase characters', {
      code: 'invalid_training_job_id',
      details: { field: 'training_job_id' },
    });
  }
  return id;
}

function generateTrainingJobId() {
  return `lora_job_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeOutputAdapterId(value) {
  const id = value == null ? generateOutputAdapterId() : String(value).trim();
  if (!/^adpt_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    trainingJobError('output_adapter_id must be a valid adapter registry id', {
      code: 'invalid_output_adapter_id',
      details: { field: 'output_adapter_id' },
    });
  }
  return id;
}

function generateOutputAdapterId() {
  return `adpt_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeStorageKey(value, fieldName) {
  if (typeof value !== 'string') {
    trainingJobError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const key = value.trim().replace(/^\/+/, '');
  if (!key || key.length > 512 || key.includes('\0')) {
    trainingJobError(`${fieldName} is invalid`, {
      code: 'invalid_storage_key',
      details: { field: fieldName },
    });
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
    trainingJobError(`${fieldName} must be a relative object key without dot segments`, {
      code: 'invalid_storage_key',
      details: { field: fieldName },
    });
  }
  return key;
}

function normalizeChecksum(value, fieldName) {
  const checksum = normalizeBoundedString(value, fieldName, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    trainingJobError(`${fieldName} must be a 64-character hex SHA-256 digest`, {
      code: 'invalid_checksum',
      details: { field: fieldName },
    });
  }
  return checksum;
}

function normalizeOptionalIdempotencyKey(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(key)) {
    trainingJobError('idempotency key must be 1-180 URL-safe characters', {
      code: 'invalid_idempotency_key',
      details: { max_length: MAX_IDEMPOTENCY_KEY_LENGTH },
    });
  }
  return key;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!TRAINING_JOB_STATUS_SET.has(status)) {
    trainingJobError('status is not a supported LoRA training lifecycle state', {
      code: 'invalid_status',
      details: { allowed: TRAINING_JOB_STATUSES },
    });
  }
  return status;
}

function normalizePositiveInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    trainingJobError(`${fieldName} must be a positive integer`, {
      code: 'invalid_integer',
      details: { field: fieldName },
    });
  }
  return n;
}

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    trainingJobError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    trainingJobError(`${fieldName} is invalid`, {
      code: 'invalid_string',
      details: { field: fieldName, max_length: maxLength },
    });
  }
  return normalized;
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

function safeJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function trainingJobError(message, opts) {
  throw new LoraTrainingJobError(message, opts);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('LoRA training jobs require a db with prepare(sql)');
  }
}

module.exports = {
  TRAINING_JOB_STATUSES,
  LoraTrainingJobError,
  ensureLoraTrainingJobsSchema,
  createLoraTrainingJob,
  getLoraTrainingJob,
  listLoraTrainingJobs,
  registerLoraTrainingJobAdapter,
  updateLoraTrainingJobStatus,
  __test: {
    normalizeTrainingJobId,
    normalizeOutputAdapterId,
    normalizeStorageKey,
    normalizeStatus,
    generateTrainingJobId,
    generateOutputAdapterId,
    mapTrainingJobRow,
  },
};
