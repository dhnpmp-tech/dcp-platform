'use strict';

const {
  ensureBatchInferenceJobSchema,
  listBatchInferenceJobLines,
  listCreatedBatchInferenceJobs,
  updateBatchInferenceJobLineStatus,
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
      const resultStorageKey = execution?.result_storage_key || buildBatchResultStorageKey(batch);
      const resultChecksum = requireSha256(execution?.result_checksum_sha256, 'result_checksum_sha256');
      const resultNormalizedBytes = normalizeNonNegativeInteger(execution?.result_normalized_bytes, 0);
      const lineSummary = applyExecutionLineProofs(db, batch, execution?.lines);
      const completed = updateBatchInferenceJobStatus(db, batch.renter_id, batch.batch_id, 'completed', {
        result_storage_key: resultStorageKey,
        result_checksum_sha256: resultChecksum,
        result_normalized_bytes: resultNormalizedBytes,
        completed_count: lineSummary
          ? lineSummary.completed_count
          : normalizeNonNegativeInteger(execution?.completed_count, batch.request_count),
        failed_count: lineSummary
          ? lineSummary.failed_count
          : normalizeNonNegativeInteger(execution?.failed_count, 0),
        total_cost_halala: lineSummary
          ? lineSummary.total_cost_halala
          : normalizeNonNegativeInteger(execution?.total_cost_halala, 0),
      });
      result.completed += 1;
      result.batches.push({
        batch_id: batch.batch_id,
        status: completed.status,
        result_storage_key: completed.result_storage_key,
        result_checksum_sha256: completed.result_checksum_sha256,
        line_proof_applied: Boolean(lineSummary),
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

function applyExecutionLineProofs(db, batch, executionLines) {
  if (executionLines == null) return null;
  if (!Array.isArray(executionLines)) {
    throw new Error('execution.lines must be an array when provided');
  }
  const current = listBatchInferenceJobLines(db, batch.renter_id, batch.batch_id, {
    limit: Math.max(batch.request_count, 1),
  });
  const expected = current ? current.lines : [];
  if (executionLines.length !== expected.length) {
    throw new Error(`execution.lines must include exactly ${expected.length} line result(s)`);
  }

  const expectedByCustomId = new Map(expected.map((line) => [line.custom_id, line]));
  const seen = new Set();
  const normalized = executionLines.map((line) => normalizeExecutionLine(line, expectedByCustomId, seen));

  const summary = {
    completed_count: 0,
    failed_count: 0,
    total_cost_halala: 0,
  };

  normalized.forEach((line) => {
    const updated = updateBatchInferenceJobLineStatus(
      db,
      batch.renter_id,
      batch.batch_id,
      line.custom_id,
      line.status,
      line.update
    );
    if (!updated) throw new Error(`execution line ${line.custom_id} could not be updated`);
    if (line.status === 'succeeded') summary.completed_count += 1;
    if (line.status === 'failed') summary.failed_count += 1;
    summary.total_cost_halala += line.cost_halala;
  });

  return summary;
}

function normalizeExecutionLine(line, expectedByCustomId, seen) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) {
    throw new Error('execution line result must be an object');
  }
  const customId = String(line.custom_id || '').trim();
  if (!customId) throw new Error('execution line custom_id is required');
  if (seen.has(customId)) throw new Error(`duplicate execution line custom_id: ${customId}`);
  seen.add(customId);
  if (!expectedByCustomId.has(customId)) {
    throw new Error(`execution line custom_id is not part of batch: ${customId}`);
  }

  const statusCode = line.status_code == null ? null : normalizeHttpStatus(line.status_code);
  const explicitStatus = line.status == null ? null : String(line.status).trim().toLowerCase();
  const hasError = line.error_code != null || line.error_message != null || line.error != null;
  const inferredStatus = statusCode != null && statusCode >= 200 && statusCode < 300 && !hasError
    ? 'succeeded'
    : 'failed';
  const status = explicitStatus || inferredStatus;
  if (!['succeeded', 'failed'].includes(status)) {
    throw new Error('execution line status must be succeeded or failed');
  }
  if (status === 'succeeded') {
    if (statusCode == null || statusCode < 200 || statusCode >= 300) {
      throw new Error(`succeeded execution line ${customId} requires a 2xx status_code`);
    }
    requireSha256(line.response_checksum_sha256, 'response_checksum_sha256');
  }

  const usage = line.usage && typeof line.usage === 'object' && !Array.isArray(line.usage)
    ? line.usage
    : undefined;
  const costHalala = normalizeNonNegativeInteger(line.cost_halala, 0);
  const errorCode = line.error_code || (status === 'failed' ? 'batch_line_failed' : null);
  const errorMessage = line.error_message || line.error || null;

  return {
    custom_id: customId,
    status,
    cost_halala: costHalala,
    update: {
      status_code: statusCode,
      response_checksum_sha256: line.response_checksum_sha256,
      response_normalized_bytes: line.response_normalized_bytes,
      usage,
      cost_halala: costHalala,
      request_id: line.request_id,
      provider_response_id: line.provider_response_id,
      error_code: errorCode,
      error_message: errorMessage == null ? null : String(errorMessage),
    },
  };
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

function normalizeHttpStatus(value) {
  const status = Number(value);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error('status_code must be an HTTP status code');
  }
  return status;
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
    applyExecutionLineProofs,
    normalizeLimit,
    normalizeExecutionLine,
    normalizeHttpStatus,
    normalizeNonNegativeInteger,
    requireSha256,
  },
};
