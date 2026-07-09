'use strict';

const express = require('express');
const {
  AdapterRegistryError,
  createAdapter,
  getAdapter,
  listAdapters,
} = require('../services/adapterRegistry');
const { buildAdapterArtifactPolicyReadiness } = require('../services/adapterArtifactPolicy');
const { buildAdapterBillingReadiness } = require('../services/adapterBillingReadiness');
const {
  buildAdapterEndpointSmokeDisabledResponse,
  buildAdapterEndpointSmokeReadiness,
  buildAdapterEndpointSmokeStatusDisabledResponse,
} = require('../services/adapterEndpointSmokeReadiness');
const { buildAdapterUsageAttributionReadiness } = require('../services/adapterUsageAttributionReadiness');
const {
  AdapterDeploymentError,
  attachAdapterDeploymentLoadProof,
  createAdapterDeployment,
  getAdapterDeployment,
  listAllAdapterDeployments,
  listAdapterDeployments,
  toRouteError,
} = require('../services/adapterDeploymentLifecycle');
const { requireAdminAuth } = require('../middleware/auth');

const PUBLIC_CREATE_STATUSES = new Set(['registered', 'validating', 'ready']);

function createAdaptersRouter(deps = {}) {
  const router = express.Router();
  const registryDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || require('./pods').requireRenter;
  const requireAdmin = deps.requireAdmin || requireAdminAuth;

  router.get('/', requireRenter, (req, res) => {
    try {
      const result = listAdapters(registryDb, req.renter.id, {
        status: req.query.status,
        base_model: req.query.base_model,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.adapters,
        count: result.adapters.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendAdapterError(res, error);
    }
  });

  router.get('/deployments', requireRenter, (req, res) => {
    try {
      const result = listAllAdapterDeployments(registryDb, req.renter.id, {
        adapter_id: req.query.adapter_id,
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.deployments,
        count: result.deployments.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.get('/artifacts/readiness', (_req, res) => {
    try {
      return res.json(buildAdapterArtifactPolicyReadiness(new Date()));
    } catch (error) {
      console.error('[adapters] artifact policy readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch adapter artifact policy readiness',
        code: 'adapter_artifact_policy_readiness_internal_error',
      });
    }
  });

  router.get('/billing/readiness', (_req, res) => {
    try {
      return res.json(buildAdapterBillingReadiness(new Date()));
    } catch (error) {
      console.error('[adapters] billing readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch adapter billing readiness',
        code: 'adapter_billing_readiness_internal_error',
      });
    }
  });

  router.get('/endpoints/smoke/readiness', (_req, res) => {
    try {
      return res.json(buildAdapterEndpointSmokeReadiness(new Date()));
    } catch (error) {
      console.error('[adapters] endpoint smoke readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch adapter endpoint smoke readiness',
        code: 'adapter_endpoint_smoke_readiness_internal_error',
      });
    }
  });

  router.get('/usage/attribution/readiness', (_req, res) => {
    try {
      return res.json(buildAdapterUsageAttributionReadiness(new Date()));
    } catch (error) {
      console.error('[adapters] usage attribution readiness error:', error && error.message ? error.message : error);
      return res.status(500).json({
        error: 'Failed to fetch adapter usage attribution readiness',
        code: 'adapter_usage_attribution_readiness_internal_error',
      });
    }
  });

  router.get('/:adapterId', requireRenter, (req, res) => {
    try {
      const adapter = getAdapter(registryDb, req.renter.id, req.params.adapterId);
      if (!adapter) {
        return res.status(404).json({
          error: 'Adapter not found',
          code: 'adapter_not_found',
        });
      }
      return res.json({ adapter });
    } catch (error) {
      return sendAdapterError(res, error);
    }
  });

  router.post('/', requireRenter, (req, res) => {
    try {
      const body = req.body || {};
      const requestedStatus = body.status == null ? 'registered' : String(body.status).trim().toLowerCase();
      if (!PUBLIC_CREATE_STATUSES.has(requestedStatus)) {
        return res.status(400).json({
          error: 'status cannot be set to a deployment lifecycle state from this endpoint',
          code: 'invalid_initial_status',
          allowed: Array.from(PUBLIC_CREATE_STATUSES),
        });
      }

      const adapter = createAdapter(registryDb, req.renter.id, {
        adapter_id: body.adapter_id,
        name: body.name,
        base_model: body.base_model,
        storage_key: body.storage_key,
        checksum_sha256: body.checksum_sha256,
        rank: body.rank,
        metadata: body.metadata,
        status: requestedStatus,
      });

      return res.status(201).json({
        adapter,
        deployment_enabled: false,
        next: 'validate_adapter_or_create_lora_training_job',
      });
    } catch (error) {
      return sendAdapterError(res, error);
    }
  });

  router.get('/:adapterId/deployments', requireRenter, (req, res) => {
    try {
      const adapter = getAdapter(registryDb, req.renter.id, req.params.adapterId);
      if (!adapter) {
        return res.status(404).json({
          error: 'Adapter not found',
          code: 'adapter_not_found',
        });
      }
      const result = listAdapterDeployments(registryDb, req.renter.id, req.params.adapterId, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({
        object: 'list',
        data: result.deployments,
        count: result.deployments.length,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.post('/:adapterId/deployments', requireRenter, (req, res) => {
    try {
      const deployment = createAdapterDeployment(registryDb, req.renter.id, {
        ...(req.body || {}),
        adapter_id: req.params.adapterId,
      });
      return res.status(201).json({
        deployment,
        serving_enabled: false,
        next: 'attach_serving_load_proof_internal',
      });
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.get('/:adapterId/deployments/:deploymentId', requireRenter, (req, res) => {
    try {
      const deployment = getAdapterDeployment(registryDb, req.renter.id, req.params.deploymentId);
      if (!deployment || deployment.adapter_id !== req.params.adapterId) {
        return res.status(404).json({
          error: 'Deployment not found',
          code: 'deployment_not_found',
        });
      }
      return res.json({ deployment });
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.get('/:adapterId/deployments/:deploymentId/endpoint-smoke', requireRenter, (req, res) => {
    try {
      const deployment = getAdapterDeployment(registryDb, req.renter.id, req.params.deploymentId);
      if (!deployment || deployment.adapter_id !== req.params.adapterId) {
        return res.status(404).json({
          error: 'Deployment not found',
          code: 'deployment_not_found',
        });
      }
      return res.json(buildAdapterEndpointSmokeStatusDisabledResponse({ deployment }, new Date()));
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.post('/:adapterId/deployments/:deploymentId/endpoint-smoke', requireRenter, (req, res) => {
    try {
      const deployment = getAdapterDeployment(registryDb, req.renter.id, req.params.deploymentId);
      if (!deployment || deployment.adapter_id !== req.params.adapterId) {
        return res.status(404).json({
          error: 'Deployment not found',
          code: 'deployment_not_found',
        });
      }
      const body = req.body || {};
      const smokeResult = body.smoke_result;
      if (!smokeResult || typeof smokeResult !== 'object' || Array.isArray(smokeResult)) {
        return res.status(400).json({
          error: 'smoke_result object is required',
          code: 'invalid_endpoint_smoke_result',
        });
      }
      return res.status(409).json(buildAdapterEndpointSmokeDisabledResponse({
        deployment,
        smoke_result: smokeResult,
        funded_smoke_principal: body.funded_smoke_principal === true,
      }, new Date()));
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  router.post('/:adapterId/deployments/:deploymentId/load-proof', requireAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const servingLoadProof = body.serving_load_proof;
      if (!servingLoadProof || typeof servingLoadProof !== 'object' || Array.isArray(servingLoadProof)) {
        return res.status(400).json({
          error: 'serving_load_proof object is required',
          code: 'invalid_load_proof',
        });
      }
      const deployment = attachAdapterDeploymentLoadProof(
        registryDb,
        body.renter_id,
        req.params.adapterId,
        req.params.deploymentId,
        servingLoadProof
      );
      return res.json({
        deployment,
        serving_enabled: deployment.route_traffic === true,
        next: deployment.route_traffic
          ? 'route_traffic_allowed_by_load_proof'
          : 'retry_vllm_load_proof_before_routing',
      });
    } catch (error) {
      return sendAdapterError(res, toRouteError(error));
    }
  });

  return router;
}

function sendAdapterError(res, error) {
  if (error instanceof AdapterRegistryError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  if (error instanceof AdapterDeploymentError) {
    const body = {
      error: error.message,
      code: error.code,
    };
    if (error.details) body.details = error.details;
    return res.status(error.httpStatus || 400).json(body);
  }
  console.error('[adapters] route error:', error && error.message ? error.message : error);
  return res.status(500).json({
    error: 'Failed to process adapter registry request',
    code: 'adapter_registry_internal_error',
  });
}

let defaultRouter = null;
function adapterRouter(req, res, next) {
  if (!defaultRouter) defaultRouter = createAdaptersRouter();
  return defaultRouter(req, res, next);
}

module.exports = adapterRouter;
module.exports.createAdaptersRouter = createAdaptersRouter;
module.exports.sendAdapterError = sendAdapterError;
