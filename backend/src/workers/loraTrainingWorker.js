'use strict';

const {
  ensureLoraTrainingJobsSchema,
  listCreatedLoraTrainingJobs,
  registerLoraTrainingJobAdapter,
  updateLoraTrainingJobStatus,
} = require('../services/loraTrainingJobs');

const DEFAULT_LIMIT = 2;

function buildLoraArtifactStorageKey(job) {
  return `adapters/renter-${job.renter_id}/${job.output_adapter_id}/adapter.safetensors`;
}

function buildLoraModelCardStorageKey(job) {
  return `adapters/renter-${job.renter_id}/${job.output_adapter_id}/model-card.json`;
}

async function runLoraTrainingWorkerOnce(db, options = {}) {
  const enabled = options.enabled === true || process.env.DCP_LORA_TRAINING_WORKER_ENABLED === '1';
  const limit = normalizeLimit(options.limit);
  const executor = options.executor;
  const autoRegisterAdapter = options.autoRegisterAdapter === true;

  ensureLoraTrainingJobsSchema(db);

  if (!enabled) {
    return {
      enabled: false,
      scanned: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      note: 'LoRA training worker is disabled. Set DCP_LORA_TRAINING_WORKER_ENABLED=1 and provide an executor before processing.',
    };
  }

  if (typeof executor !== 'function') {
    return {
      enabled: true,
      scanned: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      note: 'LoRA training worker has no executor configured; no jobs were mutated.',
    };
  }

  const pending = listCreatedLoraTrainingJobs(db, { limit });
  const result = {
    enabled: true,
    scanned: pending.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    jobs: [],
  };

  for (const job of pending) {
    result.processed += 1;
    updateLoraTrainingJobStatus(db, job.renter_id, job.training_job_id, 'running');

    try {
      const execution = await executor(job);
      const completed = updateLoraTrainingJobStatus(db, job.renter_id, job.training_job_id, 'succeeded', {
        artifact_storage_key: execution?.artifact_storage_key || buildLoraArtifactStorageKey(job),
        artifact_checksum_sha256: requireSha256(execution?.artifact_checksum_sha256, 'artifact_checksum_sha256'),
        model_card_storage_key: execution?.model_card_storage_key || buildLoraModelCardStorageKey(job),
      });
      let adapter = null;
      if (autoRegisterAdapter || execution?.register_adapter === true) {
        adapter = registerLoraTrainingJobAdapter(db, job.renter_id, job.training_job_id).adapter;
      }
      result.succeeded += 1;
      result.jobs.push({
        training_job_id: job.training_job_id,
        status: completed.status,
        artifact_storage_key: completed.artifact_storage_key,
        artifact_checksum_sha256: completed.artifact_checksum_sha256,
        adapter_registered: !!adapter,
        adapter_id: adapter ? adapter.adapter_id : null,
      });
    } catch (error) {
      const failed = updateLoraTrainingJobStatus(db, job.renter_id, job.training_job_id, 'failed', {
        failure_reason: String(error && error.message ? error.message : error).slice(0, 240),
      });
      result.failed += 1;
      result.jobs.push({
        training_job_id: job.training_job_id,
        status: failed.status,
        error: failed.failure_reason,
      });
    }
  }

  return result;
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, 10);
}

function requireSha256(value, fieldName) {
  const checksum = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(`${fieldName} must be a 64-character hex SHA-256 digest`);
  }
  return checksum;
}

module.exports = {
  buildLoraArtifactStorageKey,
  buildLoraModelCardStorageKey,
  runLoraTrainingWorkerOnce,
  __test: {
    normalizeLimit,
    requireSha256,
  },
};
