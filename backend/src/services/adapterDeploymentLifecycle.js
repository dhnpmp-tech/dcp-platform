'use strict';

const crypto = require('crypto');
const { getAdapter } = require('./adapterRegistry');
const {
  LoraContractError,
  normalizeAdapterDeploySpec,
} = require('./loraTrainingContract');

const DEPLOYMENT_STATUSES = Object.freeze([
  'pending',
  'provisioning',
  'running',
  'degraded',
  'stopped',
  'failed',
]);

const DEPLOYMENT_STATUS_SET = new Set(DEPLOYMENT_STATUSES);
const READY_ADAPTER_STATUSES = new Set(['ready', 'deployed']);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

class AdapterDeploymentError extends Error {
  constructor(message, { code = 'adapter_deployment_error', httpStatus = 400, details = undefined } = {}) {
    super(message);
    this.name = 'AdapterDeploymentError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function ensureAdapterDeploymentSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new TypeError('ensureAdapterDeploymentSchema requires a better-sqlite3 db with exec(sql)');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS adapter_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL UNIQUE,
      renter_id INTEGER NOT NULL,
      adapter_id TEXT NOT NULL,
      base_model TEXT NOT NULL,
      mode TEXT NOT NULL,
      endpoint_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','provisioning','running','degraded','stopped','failed')),
      route_traffic INTEGER NOT NULL DEFAULT 0 CHECK(route_traffic IN (0,1)),
      serving_load_proof_json TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      stopped_at TEXT,
      FOREIGN KEY (renter_id) REFERENCES renters(id),
      FOREIGN KEY (adapter_id) REFERENCES adapter_registry(adapter_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_deployments_renter_adapter ON adapter_deployments(renter_id, adapter_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_deployments_renter_status ON adapter_deployments(renter_id, status, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_deployments_endpoint ON adapter_deployments(endpoint_id)`);
}

function createAdapterDeployment(db, renterId, input = {}, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const adapterId = normalizeAdapterId(input.adapter_id);
  const adapter = getAdapter(db, ownerId, adapterId);
  if (!adapter) {
    deploymentError('Adapter not found for this renter', {
      code: 'adapter_not_found',
      httpStatus: 404,
      details: { adapter_id: adapterId },
    });
  }
  if (!READY_ADAPTER_STATUSES.has(adapter.status)) {
    deploymentError('Adapter must be ready before a deployment record can be requested', {
      code: 'adapter_not_ready',
      httpStatus: 409,
      details: { adapter_id: adapterId, status: adapter.status },
    });
  }

  const spec = normalizeDeploySpecForAdapter(adapter, input, {
    acceptLoadProof: options.acceptLoadProof === true,
  });
  const now = new Date().toISOString();
  const deployment = {
    deployment_id: normalizeDeploymentId(input.deployment_id),
    renter_id: ownerId,
    adapter_id: adapter.adapter_id,
    base_model: adapter.base_model,
    mode: spec.mode,
    endpoint_id: spec.endpoint_id,
    status: spec.route_traffic ? 'running' : 'pending',
    route_traffic: spec.route_traffic ? 1 : 0,
    serving_load_proof_json: spec.serving_load_proof ? JSON.stringify(spec.serving_load_proof) : null,
    failure_reason: null,
    created_at: now,
    updated_at: now,
    started_at: spec.route_traffic ? now : null,
    stopped_at: null,
  };

  try {
    db.prepare(`
      INSERT INTO adapter_deployments (
        deployment_id, renter_id, adapter_id, base_model, mode, endpoint_id,
        status, route_traffic, serving_load_proof_json, failure_reason,
        created_at, updated_at, started_at, stopped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deployment.deployment_id,
      deployment.renter_id,
      deployment.adapter_id,
      deployment.base_model,
      deployment.mode,
      deployment.endpoint_id,
      deployment.status,
      deployment.route_traffic,
      deployment.serving_load_proof_json,
      deployment.failure_reason,
      deployment.created_at,
      deployment.updated_at,
      deployment.started_at,
      deployment.stopped_at,
    );
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    const message = String(error && error.message ? error.message : '');
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || message.includes('UNIQUE constraint failed: adapter_deployments.deployment_id')) {
      deploymentError('deployment_id already exists', {
        code: 'deployment_exists',
        httpStatus: 409,
        details: { deployment_id: deployment.deployment_id },
      });
    }
    throw error;
  }

  return getAdapterDeployment(db, ownerId, deployment.deployment_id);
}

function attachDeploymentLoadProof(db, renterId, deploymentId, servingLoadProof) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeDeploymentId(deploymentId);
  const deployment = getAdapterDeployment(db, ownerId, id);
  if (!deployment) {
    deploymentError('Deployment not found for this renter', {
      code: 'deployment_not_found',
      httpStatus: 404,
      details: { deployment_id: id },
    });
  }
  if (deployment.status === 'stopped') {
    deploymentError('Stopped deployments cannot accept load proof', {
      code: 'deployment_stopped',
      httpStatus: 409,
      details: { deployment_id: id },
    });
  }

  const spec = normalizeAdapterDeploySpec({
    mode: deployment.mode,
    adapter_id: deployment.adapter_id,
    base_model: deployment.base_model,
    endpoint_id: deployment.endpoint_id || undefined,
    serving_load_proof: servingLoadProof,
  });
  const now = new Date().toISOString();
  const nextStatus = spec.route_traffic ? 'running' : 'degraded';
  const failureReason = spec.route_traffic ? null : 'serving_load_proof_mismatch';
  db.prepare(`
    UPDATE adapter_deployments
       SET status = ?,
           route_traffic = ?,
           serving_load_proof_json = ?,
           failure_reason = ?,
           updated_at = ?,
           started_at = CASE WHEN ? = 1 THEN COALESCE(started_at, ?) ELSE started_at END
     WHERE renter_id = ? AND deployment_id = ?
  `).run(
    nextStatus,
    spec.route_traffic ? 1 : 0,
    JSON.stringify(spec.serving_load_proof),
    failureReason,
    now,
    spec.route_traffic ? 1 : 0,
    now,
    ownerId,
    id,
  );
  return getAdapterDeployment(db, ownerId, id);
}

function attachAdapterDeploymentLoadProof(db, renterId, adapterId, deploymentId, servingLoadProof) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const expectedAdapterId = normalizeAdapterId(adapterId);
  const id = normalizeDeploymentId(deploymentId);
  const deployment = getAdapterDeployment(db, ownerId, id);
  if (!deployment || deployment.adapter_id !== expectedAdapterId) {
    deploymentError('Deployment not found for this renter and adapter', {
      code: 'deployment_not_found',
      httpStatus: 404,
      details: {
        deployment_id: id,
        adapter_id: expectedAdapterId,
      },
    });
  }
  return attachDeploymentLoadProof(db, ownerId, id, servingLoadProof);
}

function updateDeploymentStatus(db, renterId, deploymentId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeDeploymentId(deploymentId);
  const nextStatus = normalizeStatus(status);
  const now = new Date().toISOString();
  const routeTraffic = nextStatus === 'running' && options.route_traffic === true ? 1 : 0;
  const stoppedAt = nextStatus === 'stopped' ? now : null;
  const failureReason = options.failure_reason ? normalizeBoundedString(options.failure_reason, 'failure_reason', 240) : null;
  const result = db.prepare(`
    UPDATE adapter_deployments
       SET status = ?,
           route_traffic = ?,
           failure_reason = COALESCE(?, failure_reason),
           updated_at = ?,
           stopped_at = COALESCE(?, stopped_at)
     WHERE renter_id = ? AND deployment_id = ?
  `).run(nextStatus, routeTraffic, failureReason, now, stoppedAt, ownerId, id);
  if (!result || result.changes === 0) return null;
  return getAdapterDeployment(db, ownerId, id);
}

function listAdapterDeployments(db, renterId, adapterId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeAdapterId(adapterId);
  const params = [ownerId, id];
  const where = ['renter_id = ?', 'adapter_id = ?'];
  if (options.status) {
    where.push('status = ?');
    params.push(normalizeStatus(options.status));
  }
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  params.push(limit, offset);

  const rows = db.prepare(`
    SELECT deployment_id, renter_id, adapter_id, base_model, mode, endpoint_id,
           status, route_traffic, serving_load_proof_json, failure_reason,
           created_at, updated_at, started_at, stopped_at
      FROM adapter_deployments
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?
  `).all(...params);

  return {
    deployments: rows.map(mapDeploymentRow),
    limit,
    offset,
  };
}

function listAllAdapterDeployments(db, renterId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const params = [ownerId];
  const where = ['renter_id = ?'];
  if (options.adapter_id) {
    where.push('adapter_id = ?');
    params.push(normalizeAdapterId(options.adapter_id));
  }
  if (options.status) {
    where.push('status = ?');
    params.push(normalizeStatus(options.status));
  }
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  params.push(limit, offset);

  const rows = db.prepare(`
    SELECT deployment_id, renter_id, adapter_id, base_model, mode, endpoint_id,
           status, route_traffic, serving_load_proof_json, failure_reason,
           created_at, updated_at, started_at, stopped_at
      FROM adapter_deployments
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?
  `).all(...params);

  return {
    deployments: rows.map(mapDeploymentRow),
    limit,
    offset,
  };
}

function getAdapterDeployment(db, renterId, deploymentId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeDeploymentId(deploymentId);
  const row = db.prepare(`
    SELECT deployment_id, renter_id, adapter_id, base_model, mode, endpoint_id,
           status, route_traffic, serving_load_proof_json, failure_reason,
           created_at, updated_at, started_at, stopped_at
      FROM adapter_deployments
     WHERE renter_id = ? AND deployment_id = ?
  `).get(ownerId, id);
  return mapDeploymentRow(row);
}

function normalizeDeploySpecForAdapter(adapter, input, options = {}) {
  const requestedBaseModel = input.base_model || adapter.base_model;
  const spec = normalizeAdapterDeploySpec({
    mode: input.mode || 'single_adapter_live_merge',
    adapter_id: adapter.adapter_id,
    base_model: requestedBaseModel,
    endpoint_id: input.endpoint_id,
    serving_load_proof: options.acceptLoadProof ? input.serving_load_proof : null,
  });
  if (spec.base_model !== adapter.base_model) {
    deploymentError('base_model must match the registered adapter base model', {
      code: 'base_model_mismatch',
      details: {
        adapter_id: adapter.adapter_id,
        expected_base_model: adapter.base_model,
        received_base_model: spec.base_model,
      },
    });
  }
  return spec;
}

function mapDeploymentRow(row) {
  if (!row) return null;
  let servingLoadProof = null;
  if (row.serving_load_proof_json) {
    try {
      servingLoadProof = JSON.parse(row.serving_load_proof_json);
    } catch (_) {
      servingLoadProof = null;
    }
  }
  return {
    deployment_id: row.deployment_id,
    renter_id: row.renter_id,
    adapter_id: row.adapter_id,
    base_model: row.base_model,
    mode: row.mode,
    endpoint_id: row.endpoint_id || null,
    status: row.status,
    route_traffic: row.route_traffic === 1,
    serving_load_proof: servingLoadProof,
    failure_reason: row.failure_reason || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    stopped_at: row.stopped_at || null,
  };
}

function normalizeDeploymentId(value) {
  const id = value == null ? generateDeploymentId() : String(value).trim();
  if (!/^adpl_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    deploymentError('deployment_id must start with adpl_ and contain URL-safe lowercase characters', {
      code: 'invalid_deployment_id',
      details: { field: 'deployment_id' },
    });
  }
  return id;
}

function normalizeAdapterId(value) {
  const id = normalizeBoundedString(value, 'adapter_id', 80);
  if (!/^adpt_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    deploymentError('adapter_id must be a valid adapter registry id', {
      code: 'invalid_adapter_id',
      details: { field: 'adapter_id' },
    });
  }
  return id;
}

function generateDeploymentId() {
  return `adpl_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizePositiveInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    deploymentError(`${fieldName} must be a positive integer`, {
      code: 'invalid_integer',
      details: { field: fieldName },
    });
  }
  return n;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!DEPLOYMENT_STATUS_SET.has(status)) {
    deploymentError('status is not a supported deployment lifecycle state', {
      code: 'invalid_status',
      details: { field: 'status', allowed: DEPLOYMENT_STATUSES },
    });
  }
  return status;
}

function normalizeLimit(value) {
  if (value == null || value === '') return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(value) {
  if (value == null || value === '') return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return offset;
}

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    deploymentError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const normalized = value.trim();
  if (!normalized) {
    deploymentError(`${fieldName} must not be empty`, {
      code: 'empty_string',
      details: { field: fieldName },
    });
  }
  if (normalized.length > maxLength) {
    deploymentError(`${fieldName} exceeds max length`, {
      code: 'string_too_long',
      details: { field: fieldName, max_length: maxLength },
    });
  }
  return normalized;
}

function deploymentError(message, opts) {
  throw new AdapterDeploymentError(message, opts);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('adapter deployment lifecycle requires a db with prepare(sql)');
  }
}

function toRouteError(error) {
  if (error instanceof AdapterDeploymentError) return error;
  if (error instanceof LoraContractError) {
    return new AdapterDeploymentError(error.message, {
      code: error.code || 'invalid_lora_contract',
      httpStatus: 400,
      details: error.details,
    });
  }
  return error;
}

module.exports = {
  DEPLOYMENT_STATUSES,
  AdapterDeploymentError,
  ensureAdapterDeploymentSchema,
  createAdapterDeployment,
  attachDeploymentLoadProof,
  attachAdapterDeploymentLoadProof,
  updateDeploymentStatus,
  listAdapterDeployments,
  listAllAdapterDeployments,
  getAdapterDeployment,
  toRouteError,
  __test: {
    normalizeDeploymentId,
    normalizeStatus,
    normalizeLimit,
    normalizeOffset,
    generateDeploymentId,
    mapDeploymentRow,
  },
};
