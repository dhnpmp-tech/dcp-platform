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
const TRAINING_LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
const TRAINING_LOG_LEVEL_SET = new Set(TRAINING_LOG_LEVELS);

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
  schemaDb.exec(`
    CREATE TABLE IF NOT EXISTS lora_training_job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      training_job_id TEXT NOT NULL,
      renter_id INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info'
        CHECK(level IN ('debug','info','warn','error')),
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (training_job_id) REFERENCES lora_training_jobs(training_job_id),
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_lora_training_job_logs_job_created ON lora_training_job_logs(renter_id, training_job_id, created_at ASC, id ASC)`);
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

  appendLoraTrainingJobLog(db, ownerId, trainingJobId, {
    level: 'info',
    event: 'created',
    message: 'LoRA training job metadata created; GPU training remains disabled until worker proof is enabled.',
    metadata: {
      training_enabled: false,
      recipe: row.recipe,
      base_model: row.base_model,
      dataset_rows: row.dataset_row_count,
      estimated_tokens: row.estimated_tokens,
    },
  });

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

function listCreatedLoraTrainingJobs(db, options = {}) {
  assertDb(db);
  const limit = normalizeLimit(options.limit);
  const rows = db.prepare(`
    ${selectTrainingJobSql()}
     WHERE status = 'created'
     ORDER BY created_at ASC, id ASC
     LIMIT ?
  `).all(limit);
  return rows.map((row) => decorateJobWithAdapterStatus(db, mapTrainingJobRow(row)));
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
  const logMetadata = buildStatusLogMetadata(nextStatus, {
    artifact_storage_key: artifactStorageKey,
    artifact_checksum_sha256: artifactChecksum,
    model_card_storage_key: modelCardStorageKey,
    failure_reason: failureReason,
  });
  appendLoraTrainingJobLog(db, ownerId, id, {
    level: nextStatus === 'failed' ? 'error' : 'info',
    event: `status_${nextStatus}`,
    message: buildStatusLogMessage(nextStatus, logMetadata),
    metadata: logMetadata,
  });
  return getLoraTrainingJob(db, ownerId, id);
}

function appendLoraTrainingJobLog(db, renterId, trainingJobId, input = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeTrainingJobId(trainingJobId);
  assertTrainingJobBelongsToRenter(db, ownerId, id);
  const level = normalizeLogLevel(input.level);
  const event = normalizeLogEvent(input.event);
  const message = normalizeBoundedString(input.message, 'message', 600);
  const metadata = normalizeLogMetadata(input.metadata);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO lora_training_job_logs (
      training_job_id, renter_id, level, event, message, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, level, event, message, metadata, now);

  return {
    training_job_id: id,
    renter_id: ownerId,
    level,
    event,
    message,
    metadata: metadata ? safeJson(metadata) : null,
    created_at: now,
  };
}

function listLoraTrainingJobLogs(db, renterId, trainingJobId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeTrainingJobId(trainingJobId);
  if (!trainingJobBelongsToRenter(db, ownerId, id)) return null;
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const rows = db.prepare(`
    SELECT id, training_job_id, renter_id, level, event, message, metadata_json, created_at
      FROM lora_training_job_logs
     WHERE renter_id = ? AND training_job_id = ?
     ORDER BY created_at ASC, id ASC
     LIMIT ? OFFSET ?
  `).all(ownerId, id, limit, offset);
  return {
    logs: rows.map(mapTrainingJobLogRow),
    limit,
    offset,
  };
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

function buildStatusLogMessage(status, metadata = {}) {
  if (status === 'running') return 'LoRA training worker marked the job running.';
  if (status === 'succeeded' && metadata.artifact_storage_key) return 'LoRA training worker recorded adapter artifact proof.';
  if (status === 'succeeded') return 'LoRA training job was marked succeeded without adapter artifact proof.';
  if (status === 'failed') return 'LoRA training worker marked the job failed.';
  if (status === 'cancelled') return 'LoRA training job was cancelled.';
  if (status === 'queued') return 'LoRA training job was queued for execution.';
  return `LoRA training job status changed to ${status}.`;
}

function buildStatusLogMetadata(status, values) {
  const metadata = { status };
  if (values.artifact_storage_key) metadata.artifact_storage_key = values.artifact_storage_key;
  if (values.artifact_checksum_sha256) metadata.artifact_checksum_sha256 = values.artifact_checksum_sha256;
  if (values.model_card_storage_key) metadata.model_card_storage_key = values.model_card_storage_key;
  if (values.failure_reason) metadata.failure_reason = values.failure_reason;
  return metadata;
}

function mapTrainingJobLogRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    training_job_id: row.training_job_id,
    renter_id: row.renter_id,
    level: row.level,
    event: row.event,
    message: row.message,
    metadata: safeJson(row.metadata_json),
    created_at: row.created_at,
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

function normalizeLogLevel(value) {
  const level = String(value || 'info').trim().toLowerCase();
  if (!TRAINING_LOG_LEVEL_SET.has(level)) {
    trainingJobError('log level is not supported', {
      code: 'invalid_log_level',
      details: { allowed: TRAINING_LOG_LEVELS },
    });
  }
  return level;
}

function normalizeLogEvent(value) {
  const event = normalizeBoundedString(value, 'event', 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(event)) {
    trainingJobError('log event must be lowercase URL-safe text', {
      code: 'invalid_log_event',
      details: { field: 'event' },
    });
  }
  return event;
}

function normalizeLogMetadata(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    trainingJobError('log metadata must be an object', {
      code: 'invalid_log_metadata',
      details: { field: 'metadata' },
    });
  }
  const json = JSON.stringify(value);
  if (json.length > 4096) {
    trainingJobError('log metadata is too large', {
      code: 'invalid_log_metadata',
      details: { max_bytes: 4096 },
    });
  }
  return json;
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

function assertTrainingJobBelongsToRenter(db, renterId, trainingJobId) {
  if (!trainingJobBelongsToRenter(db, renterId, trainingJobId)) {
    trainingJobError('LoRA training job not found', {
      code: 'lora_training_job_not_found',
      httpStatus: 404,
      details: { training_job_id: trainingJobId },
    });
  }
}

function trainingJobBelongsToRenter(db, renterId, trainingJobId) {
  const row = db.prepare(`
    SELECT 1
      FROM lora_training_jobs
     WHERE renter_id = ? AND training_job_id = ?
     LIMIT 1
  `).get(renterId, trainingJobId);
  return !!row;
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
  TRAINING_LOG_LEVELS,
  LoraTrainingJobError,
  ensureLoraTrainingJobsSchema,
  appendLoraTrainingJobLog,
  createLoraTrainingJob,
  getLoraTrainingJob,
  listLoraTrainingJobLogs,
  listLoraTrainingJobs,
  listCreatedLoraTrainingJobs,
  registerLoraTrainingJobAdapter,
  updateLoraTrainingJobStatus,
  __test: {
    normalizeTrainingJobId,
    normalizeOutputAdapterId,
    normalizeStorageKey,
    normalizeStatus,
    normalizeLogEvent,
    normalizeLogLevel,
    generateTrainingJobId,
    generateOutputAdapterId,
    mapTrainingJobLogRow,
    mapTrainingJobRow,
  },
};
