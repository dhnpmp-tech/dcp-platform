'use strict';

const {
  ensureBatchInferenceJobSchema,
  listCreatedBatchInferenceJobs,
  updateBatchInferenceJobStatus,
} = require('../services/batchInferenceJobs');

const DEFAULT_LIMIT = 5;

function buildBatchResultStorageKey(batch) {
  return `batch-results/renter-${batch.renter_id}/${batch.batch_id}/output.jsonl`;
}

async function runBatchInferenceWorkerOnce(db, options = {}) {
  const enabled = options.enabled === true || process.env.DCP_BATCH_WORKER_ENABLED === '1';
  const limit = normalizeLimit(options.limit);
  const executor = options.executor;

  ensureBatchInferenceJobSchema(db);

  if (!enabled) {
    return {
      enabled: false,
      scanned: 0,
      processed: 0,
      completed: 0,
      failed: 0,
      note: 'Batch worker is disabled. Set DCP_BATCH_WORKER_ENABLED=1 and provide an executor before processing.',
    };
  }

  if (typeof executor !== 'function') {
    return {
      enabled: true,
      scanned: 0,
      processed: 0,
      completed: 0,
      failed: 0,
      note: 'Batch worker has no executor configured; no jobs were mutated.',
    };
  }

  const pending = listCreatedBatchInferenceJobs(db, { limit });

  const result = {
    enabled: true,
    scanned: pending.length,
    processed: 0,
    completed: 0,
    failed: 0,
    batches: [],
  };

  for (const batch of pending) {
    result.processed += 1;
    updateBatchInferenceJobStatus(db, batch.renter_id, batch.batch_id, 'running');

    try {
      const execution = await executor(batch);
      const completed = updateBatchInferenceJobStatus(db, batch.renter_id, batch.batch_id, 'completed', {
        result_storage_key: execution?.result_storage_key || buildBatchResultStorageKey(batch),
        result_checksum_sha256: requireSha256(execution?.result_checksum_sha256, 'result_checksum_sha256'),
        result_normalized_bytes: normalizeNonNegativeInteger(execution?.result_normalized_bytes, 0),
        completed_count: normalizeNonNegativeInteger(execution?.completed_count, batch.request_count),
        failed_count: normalizeNonNegativeInteger(execution?.failed_count, 0),
        total_cost_halala: normalizeNonNegativeInteger(execution?.total_cost_halala, 0),
      });
      result.completed += 1;
      result.batches.push({
        batch_id: batch.batch_id,
        status: completed.status,
        result_storage_key: completed.result_storage_key,
        result_checksum_sha256: completed.result_checksum_sha256,
      });
    } catch (error) {
      const failed = updateBatchInferenceJobStatus(db, batch.renter_id, batch.batch_id, 'failed', {
        completed_count: 0,
        failed_count: batch.request_count,
        total_cost_halala: 0,
      });
      result.failed += 1;
      result.batches.push({
        batch_id: batch.batch_id,
        status: failed.status,
        error: String(error && error.message ? error.message : error).slice(0, 240),
      });
    }
  }

  return result;
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, 25);
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return fallback;
  return number;
}

function requireSha256(value, fieldName) {
  const checksum = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(`${fieldName} must be a 64-character hex SHA-256 digest`);
  }
  return checksum;
}

module.exports = {
  buildBatchResultStorageKey,
  runBatchInferenceWorkerOnce,
  __test: {
    normalizeLimit,
    normalizeNonNegativeInteger,
    requireSha256,
  },
};
