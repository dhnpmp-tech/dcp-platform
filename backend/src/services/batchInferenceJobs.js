'use strict';

const crypto = require('crypto');
const {
  BatchInferenceContractError,
  MAX_BATCH_BYTES,
  MAX_BATCH_REQUESTS,
  SUPPORTED_BATCH_URLS,
  checksumBatchRequest,
  parseBatchJsonl,
} = require('./batchInferenceContract');
const {
  BATCH_LIVE_ACCEPTANCE_COMMAND,
  BATCH_LIVE_ACCEPTANCE_GATE,
  buildBatchLiveAcceptanceContract,
} = require('./batchLiveAcceptanceContract');
const { getBatchResultDownloadConfig } = require('./batchResultDownloads');

const BATCH_STATUSES = Object.freeze([
  'created',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const BATCH_STATUS_SET = new Set(BATCH_STATUSES);
const BATCH_LINE_STATUSES = Object.freeze([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

const BATCH_LINE_STATUS_SET = new Set(BATCH_LINE_STATUSES);
const BATCH_LINE_SETTLEMENT_STATUSES = Object.freeze([
  'unsettled',
  'not_required',
  'settled',
  'already_settled',
  'failed',
]);

const BATCH_LINE_SETTLEMENT_STATUS_SET = new Set(BATCH_LINE_SETTLEMENT_STATUSES);
const COMPLETION_WINDOWS = Object.freeze(['24h']);
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_STORAGE_KEY_LENGTH = 512;
const MAX_ERROR_CODE_LENGTH = 120;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_PROVIDER_RESPONSE_ID_LENGTH = 180;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_SETTLEMENT_REQUEST_ID_LENGTH = 240;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const BATCH_READINESS_CONTRACT_VERSION = 'dcp.batch_inference_readiness.v1';

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
  const schemaDb = db && typeof db.exec === 'function'
    ? db
    : db && db._db && typeof db._db.exec === 'function'
      ? db._db
      : null;
  if (!schemaDb) {
    throw new TypeError('ensureBatchInferenceJobSchema requires a better-sqlite3 db with exec(sql)');
  }

  schemaDb.exec(`
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
      result_checksum_sha256 TEXT,
      result_normalized_bytes INTEGER NOT NULL DEFAULT 0,
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
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_renter_created ON batch_inference_jobs(renter_id, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_renter_status ON batch_inference_jobs(renter_id, status, created_at DESC)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_checksum ON batch_inference_jobs(input_checksum_sha256)`);
  schemaDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_jobs_renter_idempotency
      ON batch_inference_jobs(renter_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL
  `);
  ensureBatchColumn(schemaDb, 'result_checksum_sha256', 'ALTER TABLE batch_inference_jobs ADD COLUMN result_checksum_sha256 TEXT');
  ensureBatchColumn(schemaDb, 'result_normalized_bytes', 'ALTER TABLE batch_inference_jobs ADD COLUMN result_normalized_bytes INTEGER NOT NULL DEFAULT 0');

  schemaDb.exec(`
    CREATE TABLE IF NOT EXISTS batch_inference_job_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      renter_id INTEGER NOT NULL,
      line_index INTEGER NOT NULL,
      custom_id TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      model_id TEXT NOT NULL,
      request_checksum_sha256 TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','running','succeeded','failed','cancelled')),
      status_code INTEGER,
      response_checksum_sha256 TEXT,
      response_normalized_bytes INTEGER NOT NULL DEFAULT 0,
      provider_id INTEGER,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_halala INTEGER NOT NULL DEFAULT 0,
      request_id TEXT,
      provider_response_id TEXT,
      settlement_status TEXT NOT NULL DEFAULT 'unsettled'
        CHECK(settlement_status IN ('unsettled','not_required','settled','already_settled','failed')),
      settlement_request_id TEXT,
      settlement_error_code TEXT,
      settlement_error_message TEXT,
      settled_at TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES batch_inference_jobs(batch_id),
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  schemaDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_lines_batch_custom_id
      ON batch_inference_job_lines(renter_id, batch_id, custom_id)
  `);
  schemaDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_lines_batch_line_index
      ON batch_inference_job_lines(renter_id, batch_id, line_index)
  `);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_batch_lines_batch_index ON batch_inference_job_lines(renter_id, batch_id, line_index)`);
  schemaDb.exec(`CREATE INDEX IF NOT EXISTS idx_batch_lines_batch_status ON batch_inference_job_lines(renter_id, batch_id, status)`);
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'provider_id', 'ALTER TABLE batch_inference_job_lines ADD COLUMN provider_id INTEGER');
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'settlement_status', "ALTER TABLE batch_inference_job_lines ADD COLUMN settlement_status TEXT NOT NULL DEFAULT 'unsettled'");
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'settlement_request_id', 'ALTER TABLE batch_inference_job_lines ADD COLUMN settlement_request_id TEXT');
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'settlement_error_code', 'ALTER TABLE batch_inference_job_lines ADD COLUMN settlement_error_code TEXT');
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'settlement_error_message', 'ALTER TABLE batch_inference_job_lines ADD COLUMN settlement_error_message TEXT');
  ensureColumn(schemaDb, 'batch_inference_job_lines', 'settled_at', 'ALTER TABLE batch_inference_job_lines ADD COLUMN settled_at TEXT');
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
        result_storage_key, result_checksum_sha256, result_normalized_bytes, status,
        completed_count, failed_count, total_cost_halala, idempotency_key,
        created_at, updated_at, started_at, completed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 'created', 0, 0, 0, ?, ?, ?, NULL, NULL, ?)
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
    insertBatchInferenceJobLines(db, ownerId, batchId, parsed.requests, now);
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

function insertBatchInferenceJobLines(db, renterId, batchId, requests, now) {
  const stmt = db.prepare(`
    INSERT INTO batch_inference_job_lines (
      batch_id, renter_id, line_index, custom_id, method, url, model_id,
      request_checksum_sha256, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);
  requests.forEach((request, index) => {
    stmt.run(
      batchId,
      renterId,
      index + 1,
      request.custom_id,
      request.method,
      request.url,
      request.body.model,
      checksumBatchRequest(request),
      now,
      now,
    );
  });
}

function getBatchInferenceJob(db, renterId, batchId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const row = db.prepare(`
    ${selectBatchSql()}
     WHERE renter_id = ? AND batch_id = ?
  `).get(ownerId, id);
  return mapBatchRow(row);
}

function getBatchInferenceResultManifest(db, renterId, batchId) {
  const batch = getBatchInferenceJob(db, renterId, batchId);
  if (!batch) return null;
  return {
    batch_id: batch.batch_id,
    renter_id: batch.renter_id,
    status: batch.status,
    results_available: batch.results_available,
    result_storage_key: batch.result_storage_key,
    result_checksum_sha256: batch.result_checksum_sha256,
    result_normalized_bytes: batch.result_normalized_bytes,
    completed_count: batch.completed_count,
    failed_count: batch.failed_count,
    total_cost_halala: batch.total_cost_halala,
    download_enabled: false,
    download_url: null,
    next: batch.results_available
      ? 'sign_result_download_url_after_object_store_bridge'
      : 'wait_for_completed_batch_result_key_and_checksum',
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    completed_at: batch.completed_at,
    expires_at: batch.expires_at,
  };
}

function buildBatchInferenceReadiness(env = process.env) {
  const workerFlagEnabled = parseEnvBoolean(env.DCP_BATCH_WORKER_ENABLED);
  const settlementFlagEnabled = parseEnvBoolean(env.DCP_BATCH_SETTLEMENT_ENABLED);
  const downloadConfig = getBatchResultDownloadConfig(env);
  const liveAcceptanceContract = buildBatchLiveAcceptanceContract();

  return {
    object: 'batch_inference_readiness',
    version: BATCH_READINESS_CONTRACT_VERSION,
    current_mode: 'metadata_validation_only',
    public_execution_enabled: false,
    request_creation_enabled: true,
    supported_urls: [...SUPPORTED_BATCH_URLS],
    limits: {
      max_requests: MAX_BATCH_REQUESTS,
      max_bytes: MAX_BATCH_BYTES,
      completion_windows: [...COMPLETION_WINDOWS],
    },
    endpoints: {
      create: '/api/batches',
      list: '/api/batches',
      detail: '/api/batches/{batch_id}',
      lines: '/api/batches/{batch_id}/lines',
      results: '/api/batches/{batch_id}/results',
    },
    features: {
      jsonl_validation: {
        status: 'available',
        enabled: true,
      },
      line_ledger: {
        status: 'available',
        enabled: true,
      },
      result_manifest: {
        status: 'available_after_result_proof',
        enabled: true,
      },
      result_downloads: {
        status: downloadConfig.configured ? 'configured_after_result_proof' : 'not_configured',
        configured: downloadConfig.configured,
        missing_config: downloadConfig.missing,
        enabled_for_completed_results: downloadConfig.configured,
      },
      worker_execution: {
        status: workerFlagEnabled ? 'feature_flag_enabled_but_no_public_executor' : 'disabled',
        env_flag_enabled: workerFlagEnabled,
        public_enabled: false,
      },
      settlement: {
        status: settlementFlagEnabled ? 'feature_flag_enabled_but_public_execution_disabled' : 'disabled',
        env_flag_enabled: settlementFlagEnabled,
        public_enabled: false,
      },
      discounts: {
        status: 'not_enabled',
        enabled: false,
      },
      model_capability_flag: {
        status: 'false_until_execution_and_settlement_proof',
        enabled: false,
      },
    },
    live_acceptance: {
      execution_discount_smoke: {
        status: 'blocked_external',
        command: BATCH_LIVE_ACCEPTANCE_COMMAND,
        live_acceptance_gate: BATCH_LIVE_ACCEPTANCE_GATE,
        acceptance_contract: liveAcceptanceContract.contract,
        pass_condition: liveAcceptanceContract.pass_condition,
        required_evidence: liveAcceptanceContract.required_evidence,
        claim_unlocks: liveAcceptanceContract.claim_unlocks,
        blocked_on: [
          'funded renter key',
          'live provider execution capacity',
          'object-store result path',
          'discount policy approval',
        ],
        verifies: [
          'renter-authenticated readiness',
          'batch create guard',
          'batch poll completed proof',
          'result manifest/download prerequisites',
          'per-line usage and provider trace proof',
          'discounted settlement proof',
          'model capability flag proof after settlement',
          'discount remains disabled until approved',
        ],
      },
    },
    claims: {
      batch_execution_live: false,
      batch_discount_live: false,
      model_batch_capability_live: false,
      result_downloads_depend_on_completed_result_proof: true,
    },
    next: 'connect_worker_to_live_v1_executor_after_gpu_billing_and_result_smoke',
  };
}

function buildPublicBatchInferenceReadiness(env = process.env) {
  const readiness = JSON.parse(JSON.stringify(buildBatchInferenceReadiness(env)));
  readiness.public_view = true;
  if (readiness.features?.result_downloads) {
    delete readiness.features.result_downloads.missing_config;
  }
  if (readiness.features?.worker_execution) {
    delete readiness.features.worker_execution.env_flag_enabled;
  }
  if (readiness.features?.settlement) {
    delete readiness.features.settlement.env_flag_enabled;
  }
  return readiness;
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
    ${selectBatchSql()}
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

function listBatchInferenceJobLines(db, renterId, batchId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const batch = getBatchInferenceJob(db, ownerId, id);
  if (!batch) return null;
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const rows = db.prepare(`
    ${selectBatchLineSql()}
     WHERE renter_id = ? AND batch_id = ?
     ORDER BY line_index ASC
     LIMIT ? OFFSET ?
  `).all(ownerId, id, limit, offset);

  return {
    batch,
    lines: rows.map(mapBatchLineRow),
    limit,
    offset,
  };
}

function listCreatedBatchInferenceJobs(db, options = {}) {
  assertDb(db);
  const limit = normalizeLimit(options.limit);
  const rows = db.prepare(`
    ${selectBatchSql()}
     WHERE status = 'created'
     ORDER BY created_at ASC, id ASC
     LIMIT ?
  `).all(limit);
  return rows.map(mapBatchRow);
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
  const resultChecksum = options.result_checksum_sha256 == null
    ? null
    : normalizeChecksum(options.result_checksum_sha256, 'result_checksum_sha256');
  const resultNormalizedBytes = options.result_normalized_bytes == null
    ? null
    : normalizeNonNegativeInteger(options.result_normalized_bytes, 'result_normalized_bytes');
  if (nextStatus === 'completed') {
    if (!resultStorageKey || !resultChecksum) {
      batchError('completed batch results require result storage and SHA-256 proof', {
        code: 'batch_result_proof_missing',
        httpStatus: 409,
        details: {
          required: ['result_storage_key', 'result_checksum_sha256'],
        },
      });
    }
  }

  const completedCount = normalizeNonNegativeInteger(options.completed_count ?? 0, 'completed_count');
  const failedCount = normalizeNonNegativeInteger(options.failed_count ?? 0, 'failed_count');
  const totalCostHalala = normalizeNonNegativeInteger(options.total_cost_halala ?? 0, 'total_cost_halala');

  const result = db.prepare(`
    UPDATE batch_inference_jobs
       SET status = ?,
           result_storage_key = COALESCE(?, result_storage_key),
           result_checksum_sha256 = COALESCE(?, result_checksum_sha256),
           result_normalized_bytes = CASE WHEN ? = 1 THEN ? ELSE result_normalized_bytes END,
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
    resultChecksum,
    resultNormalizedBytes == null ? 0 : 1,
    resultNormalizedBytes == null ? 0 : resultNormalizedBytes,
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

function updateBatchInferenceJobLineStatus(db, renterId, batchId, customId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const lineCustomId = normalizeCustomId(customId);
  const nextStatus = normalizeLineStatus(status);
  const now = new Date().toISOString();
  const completedAt = ['succeeded', 'failed', 'cancelled'].includes(nextStatus) ? now : null;
  const statusCode = options.status_code == null ? null : normalizeOptionalHttpStatus(options.status_code);
  const responseChecksum = options.response_checksum_sha256 == null
    ? null
    : normalizeChecksum(options.response_checksum_sha256, 'response_checksum_sha256');
  const responseNormalizedBytes = options.response_normalized_bytes == null
    ? null
    : normalizeNonNegativeInteger(options.response_normalized_bytes, 'response_normalized_bytes');
  const providerId = options.provider_id == null ? null : normalizePositiveInteger(options.provider_id, 'provider_id');
  const usage = normalizeLineUsage(options.usage || {});
  const costHalala = options.cost_halala == null ? null : normalizeNonNegativeInteger(options.cost_halala, 'cost_halala');
  const requestId = options.request_id == null ? null : normalizeBoundedString(options.request_id, 'request_id', MAX_IDEMPOTENCY_KEY_LENGTH);
  const providerResponseId = options.provider_response_id == null
    ? null
    : normalizeBoundedString(options.provider_response_id, 'provider_response_id', MAX_PROVIDER_RESPONSE_ID_LENGTH);
  const errorCode = options.error_code == null ? null : normalizeBoundedString(options.error_code, 'error_code', MAX_ERROR_CODE_LENGTH);
  const errorMessage = options.error_message == null
    ? null
    : normalizeBoundedString(options.error_message, 'error_message', MAX_ERROR_MESSAGE_LENGTH);

  const result = db.prepare(`
    UPDATE batch_inference_job_lines
       SET status = ?,
           status_code = COALESCE(?, status_code),
           response_checksum_sha256 = COALESCE(?, response_checksum_sha256),
           response_normalized_bytes = CASE WHEN ? = 1 THEN ? ELSE response_normalized_bytes END,
           provider_id = COALESCE(?, provider_id),
           prompt_tokens = CASE WHEN ? = 1 THEN ? ELSE prompt_tokens END,
           completion_tokens = CASE WHEN ? = 1 THEN ? ELSE completion_tokens END,
           total_tokens = CASE WHEN ? = 1 THEN ? ELSE total_tokens END,
           cost_halala = CASE WHEN ? = 1 THEN ? ELSE cost_halala END,
           request_id = COALESCE(?, request_id),
           provider_response_id = COALESCE(?, provider_response_id),
           error_code = COALESCE(?, error_code),
           error_message = COALESCE(?, error_message),
           updated_at = ?,
           completed_at = COALESCE(?, completed_at)
     WHERE renter_id = ? AND batch_id = ? AND custom_id = ?
  `).run(
    nextStatus,
    statusCode,
    responseChecksum,
    responseNormalizedBytes == null ? 0 : 1,
    responseNormalizedBytes == null ? 0 : responseNormalizedBytes,
    providerId,
    usage.present ? 1 : 0,
    usage.prompt_tokens,
    usage.present ? 1 : 0,
    usage.completion_tokens,
    usage.present ? 1 : 0,
    usage.total_tokens,
    costHalala == null ? 0 : 1,
    costHalala == null ? 0 : costHalala,
    requestId,
    providerResponseId,
    errorCode,
    errorMessage,
    now,
    completedAt,
    ownerId,
    id,
    lineCustomId,
  );
  if (!result || result.changes === 0) return null;
  return getBatchInferenceJobLine(db, ownerId, id, lineCustomId);
}

function updateBatchInferenceJobLineSettlement(db, renterId, batchId, customId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const lineCustomId = normalizeCustomId(customId);
  const nextStatus = normalizeSettlementStatus(status);
  const now = new Date().toISOString();
  const settlementRequestId = options.settlement_request_id == null
    ? null
    : normalizeBoundedString(options.settlement_request_id, 'settlement_request_id', MAX_SETTLEMENT_REQUEST_ID_LENGTH);
  const providerId = options.provider_id == null ? null : normalizePositiveInteger(options.provider_id, 'provider_id');
  const errorCode = options.error_code == null
    ? null
    : normalizeBoundedString(options.error_code, 'settlement_error_code', MAX_ERROR_CODE_LENGTH);
  const errorMessage = options.error_message == null
    ? null
    : normalizeBoundedString(options.error_message, 'settlement_error_message', MAX_ERROR_MESSAGE_LENGTH);
  const finalStatus = nextStatus !== 'unsettled';

  const result = db.prepare(`
    UPDATE batch_inference_job_lines
       SET settlement_status = ?,
           settlement_request_id = COALESCE(?, settlement_request_id),
           provider_id = COALESCE(?, provider_id),
           settlement_error_code = ?,
           settlement_error_message = ?,
           settled_at = CASE WHEN ? = 1 THEN ? ELSE settled_at END,
           updated_at = ?
     WHERE renter_id = ? AND batch_id = ? AND custom_id = ?
  `).run(
    nextStatus,
    settlementRequestId,
    providerId,
    errorCode,
    errorMessage,
    finalStatus ? 1 : 0,
    now,
    now,
    ownerId,
    id,
    lineCustomId,
  );
  if (!result || result.changes === 0) return null;
  return getBatchInferenceJobLine(db, ownerId, id, lineCustomId);
}

function getBatchInferenceJobLine(db, renterId, batchId, customId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeBatchId(batchId);
  const lineCustomId = normalizeCustomId(customId);
  const row = db.prepare(`
    ${selectBatchLineSql()}
     WHERE renter_id = ? AND batch_id = ? AND custom_id = ?
  `).get(ownerId, id, lineCustomId);
  return mapBatchLineRow(row);
}

function getBatchByIdempotencyKey(db, renterId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const row = db.prepare(`
    ${selectBatchSql()}
     WHERE renter_id = ? AND idempotency_key = ?
  `).get(renterId, idempotencyKey);
  return mapBatchRow(row);
}

function selectBatchSql() {
  return `
    SELECT batch_id, renter_id, input_storage_key, input_checksum_sha256,
           input_normalized_bytes, request_count, completion_window, metadata_json,
           result_storage_key, result_checksum_sha256, result_normalized_bytes,
           status, completed_count, failed_count, total_cost_halala,
           idempotency_key, created_at, updated_at, started_at, completed_at,
           expires_at
      FROM batch_inference_jobs
  `;
}

function selectBatchLineSql() {
  return `
    SELECT batch_id, renter_id, line_index, custom_id, method, url, model_id,
           request_checksum_sha256, status, status_code, response_checksum_sha256,
           response_normalized_bytes, provider_id, prompt_tokens, completion_tokens,
           total_tokens, cost_halala, request_id, provider_response_id,
           settlement_status, settlement_request_id, settlement_error_code,
           settlement_error_message, settled_at,
           error_code, error_message, created_at, updated_at, completed_at
      FROM batch_inference_job_lines
  `;
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
    result_checksum_sha256: row.result_checksum_sha256 || null,
    result_normalized_bytes: row.result_normalized_bytes || 0,
    completed_count: row.completed_count,
    failed_count: row.failed_count,
    total_cost_halala: row.total_cost_halala,
    idempotency_key: row.idempotency_key || null,
    execution_enabled: false,
    results_available: Boolean(row.result_storage_key && row.result_checksum_sha256 && row.status === 'completed'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    expires_at: row.expires_at || null,
  };
}

function mapBatchLineRow(row) {
  if (!row) return null;
  return {
    batch_id: row.batch_id,
    renter_id: row.renter_id,
    line_index: row.line_index,
    custom_id: row.custom_id,
    method: row.method,
    url: row.url,
    model_id: row.model_id,
    request_checksum_sha256: row.request_checksum_sha256,
    status: row.status,
    status_code: row.status_code == null ? null : row.status_code,
    response_checksum_sha256: row.response_checksum_sha256 || null,
    response_normalized_bytes: row.response_normalized_bytes || 0,
    provider_id: row.provider_id == null ? null : row.provider_id,
    usage: {
      prompt_tokens: row.prompt_tokens || 0,
      completion_tokens: row.completion_tokens || 0,
      total_tokens: row.total_tokens || 0,
    },
    cost_halala: row.cost_halala || 0,
    request_id: row.request_id || null,
    provider_response_id: row.provider_response_id || null,
    settlement_status: row.settlement_status || 'unsettled',
    settlement_request_id: row.settlement_request_id || null,
    settlement_error_code: row.settlement_error_code || null,
    settlement_error_message: row.settlement_error_message || null,
    settled_at: row.settled_at || null,
    error_code: row.error_code || null,
    error_message: row.error_message || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at || null,
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

function normalizeChecksum(value, fieldName) {
  const checksum = normalizeBoundedString(value, fieldName, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    batchError(`${fieldName} must be a 64-character hex SHA-256 digest`, {
      code: 'invalid_checksum',
      details: { field: fieldName },
    });
  }
  return checksum;
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

function normalizeLineStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!BATCH_LINE_STATUS_SET.has(status)) {
    batchError('status is not a supported batch line lifecycle state', {
      code: 'invalid_line_status',
      details: { allowed: BATCH_LINE_STATUSES },
    });
  }
  return status;
}

function normalizeSettlementStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!BATCH_LINE_SETTLEMENT_STATUS_SET.has(status)) {
    batchError('settlement_status is not a supported batch line settlement state', {
      code: 'invalid_line_settlement_status',
      details: { allowed: BATCH_LINE_SETTLEMENT_STATUSES },
    });
  }
  return status;
}

function normalizeCustomId(value) {
  const customId = normalizeBoundedString(value, 'custom_id', 128);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(customId)) {
    batchError('custom_id must be 1-128 URL-safe characters', {
      code: 'invalid_custom_id',
      details: { field: 'custom_id' },
    });
  }
  return customId;
}

function normalizeLineUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      present: false,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }
  const promptTokens = normalizeNonNegativeInteger(value.prompt_tokens ?? 0, 'usage.prompt_tokens');
  const completionTokens = normalizeNonNegativeInteger(value.completion_tokens ?? 0, 'usage.completion_tokens');
  const totalTokens = normalizeNonNegativeInteger(
    value.total_tokens ?? promptTokens + completionTokens,
    'usage.total_tokens'
  );
  return {
    present: true,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function normalizeOptionalHttpStatus(value) {
  const status = Number(value);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    batchError('status_code must be an HTTP status code', {
      code: 'invalid_status_code',
      details: { field: 'status_code' },
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

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    batchError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    batchError(`${fieldName} is invalid`, {
      code: 'invalid_string',
      details: { field: fieldName, max_length: maxLength },
    });
  }
  return normalized;
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

function parseEnvBoolean(value) {
  if (value == null || value === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function batchError(message, opts) {
  throw new BatchInferenceJobError(message, opts);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('batch inference jobs require a db with prepare(sql)');
  }
}

function ensureBatchColumn(db, columnName, alterSql) {
  return ensureColumn(db, 'batch_inference_jobs', columnName, alterSql);
}

function ensureColumn(db, tableName, columnName, alterSql) {
  const columns = new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => String(row.name || ''))
  );
  if (!columns.has(columnName)) {
    db.exec(alterSql);
  }
}

module.exports = {
  BATCH_STATUSES,
  BATCH_LINE_STATUSES,
  BATCH_LINE_SETTLEMENT_STATUSES,
  COMPLETION_WINDOWS,
  BATCH_READINESS_CONTRACT_VERSION,
  BatchInferenceJobError,
  buildBatchInferenceReadiness,
  buildPublicBatchInferenceReadiness,
  ensureBatchInferenceJobSchema,
  createBatchInferenceJob,
  getBatchInferenceJob,
  getBatchInferenceJobLine,
  getBatchInferenceResultManifest,
  listBatchInferenceJobLines,
  listBatchInferenceJobs,
  listCreatedBatchInferenceJobs,
  updateBatchInferenceJobLineStatus,
  updateBatchInferenceJobLineSettlement,
  updateBatchInferenceJobStatus,
  __test: {
    normalizeBatchId,
    normalizeInputStorageKey,
    normalizeCompletionWindow,
    normalizeMetadata,
    normalizeOptionalIdempotencyKey,
    normalizeStatus,
    normalizeLineStatus,
    normalizeSettlementStatus,
    normalizeChecksum,
    parseEnvBoolean,
    generateBatchId,
    mapBatchRow,
    mapBatchLineRow,
  },
};
