'use strict';

const express = require('express');
const {
  LoraTrainingJobError,
  createLoraTrainingJob,
  ensureLoraTrainingJobsSchema,
  getLoraTrainingJob,
  listLoraTrainingJobs,
} = require('../services/loraTrainingJobs');

function createLoraRouter(deps = {}) {
  const router = express.Router();
  const loraDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || require('./pods').requireRenter;
  ensureLoraTrainingJobsSchema(loraDb);

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

  return router;
}

function sendLoraError(res, error) {
  if (error instanceof LoraTrainingJobError) {
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
module.exports.createLoraRouter = createLoraRouter;
module.exports.sendLoraError = sendLoraError;
