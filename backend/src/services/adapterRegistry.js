'use strict';

const crypto = require('crypto');

const ADAPTER_STATUSES = Object.freeze([
  'registered',
  'validating',
  'ready',
  'deploying',
  'deployed',
  'failed',
  'archived',
]);

const ADAPTER_STATUS_SET = new Set(ADAPTER_STATUSES);
const MAX_NAME_LENGTH = 80;
const MAX_BASE_MODEL_LENGTH = 160;
const MAX_STORAGE_KEY_LENGTH = 512;
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

class AdapterRegistryError extends Error {
  constructor(message, { code = 'adapter_registry_error', httpStatus = 400, details = undefined } = {}) {
    super(message);
    this.name = 'AdapterRegistryError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function ensureAdapterRegistrySchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new TypeError('ensureAdapterRegistrySchema requires a better-sqlite3 db with exec(sql)');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS adapter_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adapter_id TEXT NOT NULL UNIQUE,
      renter_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      base_model TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      rank INTEGER,
      metadata_json TEXT,
      status TEXT NOT NULL DEFAULT 'registered'
        CHECK(status IN ('registered','validating','ready','deploying','deployed','failed','archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deployed_at TEXT,
      FOREIGN KEY (renter_id) REFERENCES renters(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_registry_renter_created ON adapter_registry(renter_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_registry_renter_status ON adapter_registry(renter_id, status, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_registry_base_model ON adapter_registry(base_model, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_adapter_registry_checksum ON adapter_registry(checksum_sha256)`);
}

function registryError(message, opts) {
  throw new AdapterRegistryError(message, opts);
}

function normalizePositiveInteger(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    registryError(`${fieldName} must be a positive integer`, {
      code: 'invalid_integer',
      details: { field: fieldName },
    });
  }
  return n;
}

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    registryError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const normalized = value.trim();
  if (!normalized) {
    registryError(`${fieldName} cannot be empty`, {
      code: 'invalid_string',
      details: { field: fieldName },
    });
  }
  if (normalized.length > maxLength) {
    registryError(`${fieldName} is too long`, {
      code: 'invalid_string',
      details: { field: fieldName, max_length: maxLength },
    });
  }
  return normalized;
}

function normalizeAdapterId(value) {
  const id = value == null ? generateAdapterId() : String(value).trim();
  if (!/^adpt_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    registryError('adapter_id must start with adpt_ and contain 10-69 URL-safe lowercase characters', {
      code: 'invalid_adapter_id',
      details: { field: 'adapter_id' },
    });
  }
  return id;
}

function generateAdapterId() {
  return `adpt_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeStorageKey(value) {
  const key = normalizeBoundedString(value, 'storage_key', MAX_STORAGE_KEY_LENGTH).replace(/^\/+/, '');
  if (!key || key.includes('\0')) {
    registryError('storage_key is invalid', {
      code: 'invalid_storage_key',
      details: { field: 'storage_key' },
    });
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
    registryError('storage_key must be a relative object key without dot segments', {
      code: 'invalid_storage_key',
      details: { field: 'storage_key' },
    });
  }
  return key;
}

function normalizeChecksum(value) {
  const checksum = normalizeBoundedString(value, 'checksum_sha256', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    registryError('checksum_sha256 must be a 64-character hex SHA-256 digest', {
      code: 'invalid_checksum',
      details: { field: 'checksum_sha256' },
    });
  }
  return checksum;
}

function normalizeRank(value) {
  if (value == null || value === '') return null;
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > 1024) {
    registryError('rank must be an integer between 1 and 1024', {
      code: 'invalid_rank',
      details: { field: 'rank', min: 1, max: 1024 },
    });
  }
  return rank;
}

function normalizeStatus(value = 'registered') {
  const status = String(value || '').trim().toLowerCase();
  if (!ADAPTER_STATUS_SET.has(status)) {
    registryError('status is not a supported adapter lifecycle state', {
      code: 'invalid_status',
      details: { field: 'status', allowed: ADAPTER_STATUSES },
    });
  }
  return status;
}

function normalizeMetadata(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    registryError('metadata must be a JSON object', {
      code: 'invalid_metadata',
      details: { field: 'metadata' },
    });
  }
  let json;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    registryError('metadata must be JSON-serializable', {
      code: 'invalid_metadata',
      details: { field: 'metadata' },
    });
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_BYTES) {
    registryError('metadata is too large', {
      code: 'metadata_too_large',
      details: { field: 'metadata', max_bytes: MAX_METADATA_BYTES },
    });
  }
  return json;
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

function mapAdapterRow(row) {
  if (!row) return null;
  let metadata = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch (_) {
      metadata = null;
    }
  }
  return {
    adapter_id: row.adapter_id,
    renter_id: row.renter_id,
    name: row.name,
    base_model: row.base_model,
    storage_key: row.storage_key,
    checksum_sha256: row.checksum_sha256,
    rank: row.rank == null ? null : row.rank,
    metadata,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deployed_at: row.deployed_at || null,
  };
}

function createAdapter(db, renterId, input = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const now = new Date().toISOString();
  const adapter = {
    adapter_id: normalizeAdapterId(input.adapter_id),
    renter_id: ownerId,
    name: normalizeBoundedString(input.name, 'name', MAX_NAME_LENGTH),
    base_model: normalizeBoundedString(input.base_model, 'base_model', MAX_BASE_MODEL_LENGTH),
    storage_key: normalizeStorageKey(input.storage_key),
    checksum_sha256: normalizeChecksum(input.checksum_sha256),
    rank: normalizeRank(input.rank),
    metadata_json: normalizeMetadata(input.metadata),
    status: normalizeStatus(input.status || 'registered'),
    created_at: now,
    updated_at: now,
    deployed_at: input.deployed_at || null,
  };

  try {
    db.prepare(`
      INSERT INTO adapter_registry (
        adapter_id, renter_id, name, base_model, storage_key, checksum_sha256,
        rank, metadata_json, status, created_at, updated_at, deployed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adapter.adapter_id,
      adapter.renter_id,
      adapter.name,
      adapter.base_model,
      adapter.storage_key,
      adapter.checksum_sha256,
      adapter.rank,
      adapter.metadata_json,
      adapter.status,
      adapter.created_at,
      adapter.updated_at,
      adapter.deployed_at,
    );
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    const message = String(error && error.message ? error.message : '');
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || message.includes('UNIQUE constraint failed: adapter_registry.adapter_id')) {
      registryError('adapter_id already exists', {
        code: 'adapter_exists',
        httpStatus: 409,
        details: { adapter_id: adapter.adapter_id },
      });
    }
    throw error;
  }

  return getAdapter(db, ownerId, adapter.adapter_id);
}

function getAdapter(db, renterId, adapterId) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeAdapterId(adapterId);
  const row = db.prepare(`
    SELECT adapter_id, renter_id, name, base_model, storage_key, checksum_sha256,
           rank, metadata_json, status, created_at, updated_at, deployed_at
      FROM adapter_registry
     WHERE renter_id = ? AND adapter_id = ?
  `).get(ownerId, id);
  return mapAdapterRow(row);
}

function listAdapters(db, renterId, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const params = [ownerId];
  const where = ['renter_id = ?'];

  if (options.status) {
    where.push('status = ?');
    params.push(normalizeStatus(options.status));
  }
  if (options.base_model) {
    where.push('base_model = ?');
    params.push(normalizeBoundedString(options.base_model, 'base_model', MAX_BASE_MODEL_LENGTH));
  }

  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  params.push(limit, offset);

  const rows = db.prepare(`
    SELECT adapter_id, renter_id, name, base_model, storage_key, checksum_sha256,
           rank, metadata_json, status, created_at, updated_at, deployed_at
      FROM adapter_registry
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?
  `).all(...params);

  return {
    adapters: rows.map(mapAdapterRow),
    limit,
    offset,
  };
}

function updateAdapterStatus(db, renterId, adapterId, status, options = {}) {
  assertDb(db);
  const ownerId = normalizePositiveInteger(renterId, 'renter_id');
  const id = normalizeAdapterId(adapterId);
  const nextStatus = normalizeStatus(status);
  const now = new Date().toISOString();
  const deployedAt = options.deployed_at || (nextStatus === 'deployed' ? now : null);

  const result = db.prepare(`
    UPDATE adapter_registry
       SET status = ?,
           updated_at = ?,
           deployed_at = COALESCE(?, deployed_at)
     WHERE renter_id = ? AND adapter_id = ?
  `).run(nextStatus, now, deployedAt, ownerId, id);
  if (!result || result.changes === 0) return null;
  return getAdapter(db, ownerId, id);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('adapter registry requires a db with prepare(sql)');
  }
}

module.exports = {
  ADAPTER_STATUSES,
  AdapterRegistryError,
  ensureAdapterRegistrySchema,
  createAdapter,
  getAdapter,
  listAdapters,
  updateAdapterStatus,
  __test: {
    normalizeStorageKey,
    normalizeChecksum,
    normalizeMetadata,
    normalizeStatus,
    normalizeLimit,
    normalizeOffset,
    generateAdapterId,
    mapAdapterRow,
  },
};
