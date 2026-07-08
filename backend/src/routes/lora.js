'use strict';

const express = require('express');
const {
  LoraTrainingJobError,
  MODEL_CARD_MANIFEST_VERSION,
  createLoraTrainingJob,
  ensureLoraTrainingJobsSchema,
  getLoraTrainingJob,
  listLoraTrainingJobLogs,
  listLoraTrainingJobs,
  registerLoraTrainingJobAdapter,
} = require('../services/loraTrainingJobs');
const {
  DATASET_FORMATS,
  DEPLOY_MODES,
  LoraContractError,
  TRAINING_RECIPES,
  validateLoraDatasetJsonl,
} = require('../services/loraTrainingContract');
const { AdapterRegistryError, ensureAdapterRegistrySchema } = require('../services/adapterRegistry');

const LORA_READINESS_VERSION = 'dcp.lora_readiness.v1';
const LORA_DATASET_VALIDATION_VERSION = 'dcp.lora_dataset_validation.v1';

function createLoraRouter(deps = {}) {
  const router = express.Router();
  const loraDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || require('./pods').requireRenter;
  ensureLoraTrainingJobsSchema(loraDb);
  ensureAdapterRegistrySchema(loraDb);

  router.get('/readiness', requireRenter, (_req, res) => {
    return res.json(buildLoraReadiness());
  });

  router.post('/datasets/validate', requireRenter, (req, res) => {
    try {
      const body = req.body || {};
      const validation = validateLoraDatasetJsonl(body.dataset_jsonl, {
        validationSplitPct: body.validation_split_pct,
      });
      return res.json({
        object: 'lora_dataset_validation',
        version: LORA_DATASET_VALIDATION_VERSION,
        validation,
        training_job_created: false,
        training_enabled: false,
        raw_dataset_persistence: false,
        next: 'create_lora_training_job_after_dataset_review',
      });
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  router.get('/training-jobs', requireRenter, (req, res) => {
    try {
      const result = listLoraTrainingJobs(loraDb, req.renter.id, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.jobs,
        count: result.jobs.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  router.post('/training-jobs', requireRenter, (req, res) => {
    try {
      const { job, idempotent_replay: idempotentReplay } = createLoraTrainingJob(
        loraDb,
        req.renter.id,
        req.body || {},
        {
          idempotencyKey: req.header('idempotency-key'),
        }
      );
      return res.status(idempotentReplay ? 200 : 201).json({
        training_job: job,
        idempotent_replay: idempotentReplay,
        training_enabled: false,
        next: 'launch_lora_trainer_worker_after_gpu_host_proof',
      });
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  router.get('/training-jobs/:trainingJobId', requireRenter, (req, res) => {
    try {
      const job = getLoraTrainingJob(loraDb, req.renter.id, req.params.trainingJobId);
      if (!job) {
        return res.status(404).json({
          error: 'LoRA training job not found',
          code: 'lora_training_job_not_found',
        });
      }
      return res.json({ training_job: job });
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  router.get('/training-jobs/:trainingJobId/logs', requireRenter, (req, res) => {
    try {
      const result = listLoraTrainingJobLogs(loraDb, req.renter.id, req.params.trainingJobId, {
        limit: req.query.limit,
        offset: req.query.offset,
      });
      if (!result) {
        return res.status(404).json({
          error: 'LoRA training job not found',
          code: 'lora_training_job_not_found',
        });
      }
      return res.json({
        object: 'list',
        data: result.logs,
        count: result.logs.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  router.post('/training-jobs/:trainingJobId/register-adapter', requireRenter, (req, res) => {
    try {
      const result = registerLoraTrainingJobAdapter(loraDb, req.renter.id, req.params.trainingJobId);
      return res.status(result.idempotent_replay ? 200 : 201).json(result);
    } catch (error) {
      return sendLoraError(res, error);
    }
  });

  return router;
}

function buildLoraReadiness(now = new Date()) {
  return {
    object: 'lora_readiness',
    version: LORA_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'metadata_and_artifact_proof_only',
    endpoints: {
      readiness: 'GET /api/lora/readiness',
      validate_dataset: 'POST /api/lora/datasets/validate',
      create_training_job: 'POST /api/lora/training-jobs',
      list_training_jobs: 'GET /api/lora/training-jobs',
      training_job_logs: 'GET /api/lora/training-jobs/{training_job_id}/logs',
      register_adapter: 'POST /api/lora/training-jobs/{training_job_id}/register-adapter',
      adapter_registry: 'GET/POST /api/adapters',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
    },
    dataset_validation: {
      status: 'available',
      available: true,
      validate_only_endpoint: 'POST /api/lora/datasets/validate',
      supported_formats: Object.values(DATASET_FORMATS),
      validation_input: 'dataset_jsonl',
      checksum: 'sha256_normalized_jsonl',
      raw_dataset_persistence: false,
      raw_dataset_not_embedded: true,
    },
    training_jobs: {
      status: 'metadata_only',
      api_available: true,
      public_training_enabled: false,
      worker_execution_enabled: false,
      gpu_host_proof_required: true,
      recipes: TRAINING_RECIPES,
      next: 'run_lora_training_worker_on_gpu_host_and_record_artifact_proof',
    },
    model_cards: {
      status: 'metadata_stub',
      api_available: true,
      manifest_version: MODEL_CARD_MANIFEST_VERSION,
      model_card_artifact_writer_enabled: false,
      next: 'write_model_card_artifact_after_gpu_host_training_proof',
    },
    adapter_registry: {
      status: 'metadata_registry',
      api_available: true,
      public_upload_enabled: true,
      serving_enabled: false,
      route_traffic: false,
      checksum_required: true,
      next: 'register_adapter_only_after_artifact_checksum_proof',
    },
    adapter_deployments: {
      status: 'load_proof_required',
      api_available: true,
      modes: DEPLOY_MODES,
      serving_enabled: false,
      route_traffic: false,
      load_proof_required: true,
      next: 'attach_vllm_adapter_load_proof_before_any_routing',
    },
    claim_guards: {
      public_training_enabled: false,
      public_serving_enabled: false,
      route_traffic: false,
      quality_claims: false,
      tinker_compatible: false,
      discounts_enabled: false,
    },
  };
}

function sendLoraError(res, error) {
  if (error instanceof LoraContractError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.line != null || error.details) {
      body.details = {
        ...(error.line != null ? { line: error.line } : {}),
        ...(error.details || {}),
      };
    }
    return res.status(400).json(body);
  }
  if (error instanceof LoraTrainingJobError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  if (error instanceof AdapterRegistryError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  console.error('[lora] route error:', error && error.message ? error.message : error);
  return res.status(500).json({
    error: 'Failed to process LoRA request',
    code: 'lora_internal_error',
  });
}

let defaultRouter = null;
function loraRouter(req, res, next) {
  if (!defaultRouter) defaultRouter = createLoraRouter();
  return defaultRouter(req, res, next);
}

module.exports = loraRouter;
module.exports.LORA_READINESS_VERSION = LORA_READINESS_VERSION;
module.exports.LORA_DATASET_VALIDATION_VERSION = LORA_DATASET_VALIDATION_VERSION;
module.exports.buildLoraReadiness = buildLoraReadiness;
module.exports.createLoraRouter = createLoraRouter;
module.exports.sendLoraError = sendLoraError;
