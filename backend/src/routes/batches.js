'use strict';

const express = require('express');
const {
  BatchInferenceJobError,
  createBatchInferenceJob,
  ensureBatchInferenceJobSchema,
  getBatchInferenceJob,
  getBatchInferenceResultManifest,
  listBatchInferenceJobs,
} = require('../services/batchInferenceJobs');
const { signBatchResultDownload } = require('../services/batchResultDownloads');

function createBatchesRouter(deps = {}) {
  const router = express.Router();
  const batchDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || require('./pods').requireRenter;
  const resultDownloadSigner = deps.resultDownloadSigner || signBatchResultDownload;
  ensureBatchInferenceJobSchema(batchDb);

  router.get('/', requireRenter, (req, res) => {
    try {
      const result = listBatchInferenceJobs(batchDb, req.renter.id, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.batches,
        count: result.batches.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendBatchError(res, error);
    }
  });

  router.post('/', requireRenter, (req, res) => {
    try {
      const { batch, idempotent_replay: idempotentReplay } = createBatchInferenceJob(
        batchDb,
        req.renter.id,
        req.body || {},
        {
          idempotencyKey: req.header('idempotency-key'),
        }
      );
      return res.status(idempotentReplay ? 200 : 201).json({
        batch,
        idempotent_replay: idempotentReplay,
        execution_enabled: false,
        next: 'batch_worker_and_result_artifact_not_enabled',
      });
    } catch (error) {
      return sendBatchError(res, error);
    }
  });

  router.get('/:batchId', requireRenter, (req, res) => {
    try {
      const batch = getBatchInferenceJob(batchDb, req.renter.id, req.params.batchId);
      if (!batch) {
        return res.status(404).json({
          error: 'Batch not found',
          code: 'batch_not_found',
        });
      }
      return res.json({ batch });
    } catch (error) {
      return sendBatchError(res, error);
    }
  });

  router.get('/:batchId/results', requireRenter, async (req, res) => {
    try {
      const result = getBatchInferenceResultManifest(batchDb, req.renter.id, req.params.batchId);
      if (!result) {
        return res.status(404).json({
          error: 'Batch not found',
          code: 'batch_not_found',
        });
      }
      const download = await resultDownloadSigner(result);
      return res.json({ result: { ...result, ...download } });
    } catch (error) {
      return sendBatchError(res, error);
    }
  });

  return router;
}

function sendBatchError(res, error) {
  if (error instanceof BatchInferenceJobError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  console.error('[batches] route error:', error && error.message ? error.message : error);
  return res.status(500).json({
    error: 'Failed to process batch inference request',
    code: 'batch_inference_internal_error',
  });
}

let defaultRouter = null;
function batchRouter(req, res, next) {
  if (!defaultRouter) defaultRouter = createBatchesRouter();
  return defaultRouter(req, res, next);
}

module.exports = batchRouter;
module.exports.createBatchesRouter = createBatchesRouter;
module.exports.sendBatchError = sendBatchError;
