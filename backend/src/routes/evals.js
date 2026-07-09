'use strict';

const express = require('express');
const { publicEndpointLimiter } = require('../middleware/rateLimiter');
const { buildEvaluatorReadiness } = require('../services/evaluatorReadiness');

function createEvalsRouter() {
  const router = express.Router();

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

  return router;
}

let defaultRouter = null;
function evalsRouter(req, res, next) {
  if (!defaultRouter) defaultRouter = createEvalsRouter();
  return defaultRouter(req, res, next);
}

module.exports = evalsRouter;
module.exports.createEvalsRouter = createEvalsRouter;
