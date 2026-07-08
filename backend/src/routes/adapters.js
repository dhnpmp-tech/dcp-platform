'use strict';

const express = require('express');
const {
  AdapterRegistryError,
  createAdapter,
  getAdapter,
  listAdapters,
} = require('../services/adapterRegistry');

const PUBLIC_CREATE_STATUSES = new Set(['registered', 'validating', 'ready']);

function createAdaptersRouter(deps = {}) {
  const router = express.Router();
  const registryDb = deps.db || require('../db');
  const requireRenter = deps.requireRenter || require('./pods').requireRenter;

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
