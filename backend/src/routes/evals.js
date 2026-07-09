'use strict';

const express = require('express');
const { publicEndpointLimiter } = require('../middleware/rateLimiter');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');
const { buildEvaluatorJobSchema } = require('../services/evaluatorJobSchema');
const { buildEvaluatorWorkerGate } = require('../services/evaluatorWorkerGate');
const { buildEvaluatorResultManifestContract } = require('../services/evaluatorResultManifest');
const { buildEvaluatorResultWriterDryRunReadiness } = require('../services/evaluatorResultWriterDryRun');
const { buildEvaluatorArtifactStoragePolicyReadiness } = require('../services/evaluatorArtifactStoragePolicy');
const { buildEvaluatorResultAccessPolicyReadiness } = require('../services/evaluatorResultAccessPolicy');
const { buildEvaluatorResultEndpointDisabledResponse } = require('../services/evaluatorResultEndpointGate');
const {
  EvaluatorJobError,
  createEvaluatorJob,
  ensureEvaluatorJobSchema,
  getEvaluatorJob,
  listEvaluatorJobs,
} = require('../services/evaluatorJobs');

function createEvalsRouter(deps = {}) {
  const router = express.Router();
  const evalDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || ((req, res, next) => require('./pods').requireRenter(req, res, next));
  ensureEvaluatorJobSchema(evalDb);

  router.get('/readiness', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorReadiness(new Date()));
    } catch (error) {
      console.error('[evals] readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator readiness',
        code: 'evaluator_readiness_internal_error',
      });
    }
  });

  router.get('/jobs/schema', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorJobSchema(new Date()));
    } catch (error) {
      console.error('[evals] job schema error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator job schema',
        code: 'evaluator_job_schema_internal_error',
      });
    }
  });

  router.get('/worker/readiness', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorWorkerGate(new Date()));
    } catch (error) {
      console.error('[evals] worker readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator worker readiness',
        code: 'evaluator_worker_readiness_internal_error',
      });
    }
  });

  router.get('/results/schema', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorResultManifestContract(new Date()));
    } catch (error) {
      console.error('[evals] result manifest schema error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator result manifest schema',
        code: 'evaluator_result_manifest_schema_internal_error',
      });
    }
  });

  router.get('/results/writer/readiness', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorResultWriterDryRunReadiness(new Date()));
    } catch (error) {
      console.error('[evals] result writer readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator result writer readiness',
        code: 'evaluator_result_writer_readiness_internal_error',
      });
    }
  });

  router.get('/results/artifacts/readiness', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorArtifactStoragePolicyReadiness(new Date()));
    } catch (error) {
      console.error('[evals] result artifact storage readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator result artifact storage readiness',
        code: 'evaluator_artifact_storage_readiness_internal_error',
      });
    }
  });

  router.get('/results/access/readiness', publicEndpointLimiter, (_req, res) => {
    try {
      return res.json(buildEvaluatorResultAccessPolicyReadiness(new Date()));
    } catch (error) {
      console.error('[evals] result access readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch evaluator result access readiness',
        code: 'evaluator_result_access_readiness_internal_error',
      });
    }
  });

  router.get('/jobs', requireRenter, (req, res) => {
    try {
      const result = listEvaluatorJobs(evalDb, req.renter.id, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.eval_jobs,
        count: result.eval_jobs.length,
        limit: result.limit,
        offset: result.offset,
        worker_enabled: false,
        billing_enabled: false,
      });
    } catch (error) {
      return sendEvaluatorJobError(res, error);
    }
  });

  router.post('/jobs', requireRenter, (req, res) => {
    try {
      const { eval_job: evalJob, idempotent_replay: idempotentReplay } = createEvaluatorJob(
        evalDb,
        req.renter.id,
        req.body || {},
        {
          idempotencyKey: req.header('idempotency-key'),
        }
      );
      return res.status(idempotentReplay ? 200 : 201).json({
        eval_job: evalJob,
        idempotent_replay: idempotentReplay,
        worker_enabled: false,
        billing_enabled: false,
        next: 'evaluator_worker_and_result_artifact_not_enabled',
      });
    } catch (error) {
      return sendEvaluatorJobError(res, error);
    }
  });

  router.get('/jobs/:evalJobId', requireRenter, (req, res) => {
    try {
      const evalJob = getEvaluatorJob(evalDb, req.renter.id, req.params.evalJobId);
      if (!evalJob) {
        return res.status(404).json({
          error: 'Evaluator job not found',
          code: 'evaluator_job_not_found',
        });
      }
      return res.json({
        eval_job: evalJob,
        worker_enabled: false,
        billing_enabled: false,
      });
    } catch (error) {
      return sendEvaluatorJobError(res, error);
    }
  });

  router.get('/jobs/:evalJobId/results', requireRenter, (req, res) => {
    try {
      const evalJob = getEvaluatorJob(evalDb, req.renter.id, req.params.evalJobId);
      if (!evalJob) {
        return res.status(404).json({
          error: 'Evaluator job not found',
          code: 'evaluator_job_not_found',
        });
      }
      return res.status(409).json(buildEvaluatorResultEndpointDisabledResponse(evalJob, new Date()));
    } catch (error) {
      return sendEvaluatorJobError(res, error);
    }
  });

  return router;
}

function sendEvaluatorJobError(res, error) {
  if (error instanceof EvaluatorJobError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  console.error('[evals] job route error:', error && error.message ? error.message : error);
  return res.status(500).json({
    error: 'Failed to process evaluator job request',
    code: 'evaluator_job_internal_error',
  });
}

let defaultRouter = null;
function evalsRouter(req, res, next) {
  if (!defaultRouter) defaultRouter = createEvalsRouter();
  return defaultRouter(req, res, next);
}

module.exports = evalsRouter;
module.exports.createEvalsRouter = createEvalsRouter;
module.exports.sendEvaluatorJobError = sendEvaluatorJobError;
