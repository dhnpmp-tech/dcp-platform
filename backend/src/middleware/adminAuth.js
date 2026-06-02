'use strict';

/**
 * Admin Auth Middleware — DCP-768
 *
 * Provides two exports:
 *
 *   requireAdminRbac   — route-level middleware that verifies admin credentials
 *                        and logs every action to admin_audit_log.
 *
 *   logAdminAction(db, adminUserId, action, targetType, targetId, details)
 *                      — standalone helper for routes that need fine-grained
 *                        audit entries (e.g. after update, with before/after state).
 *
 * Auth strategy (dual-mode for forward compatibility):
 *   1. JWT Bearer token with role field: Authorization: Bearer <jwt>
 *      req.user.role must equal 'admin'.  Set by a future JWT auth layer.
 *   2. Static admin token fallback: DC1_ADMIN_TOKEN env var, checked via
 *      constant-time comparison (same as legacy requireAdminAuth in auth.js).
 *
 * On success: sets req.adminUser = { id, role: 'admin' } and calls next().
 * On failure: returns 401 or 403 with JSON error body.  Never calls next().
 *
 * Audit log: every admitted request is written to admin_audit_log
 * asynchronously (fire-and-forget).  Errors are swallowed so a DB hiccup
 * never rejects a legitimate admin request.
 */

const { requireAdminAuth } = require('./auth');
const db = require('../db');

// ── Audit log writer ──────────────────────────────────────────────────────────

/**
 * Insert one row into admin_audit_log.
 * Fire-and-forget — never throws.
 *
 * @param {object} rawDb  - The better-sqlite3 db instance (db._db or similar)
 * @param {string|null} adminUserId
 * @param {string} action          - e.g. "PATCH /api/admin/payouts/42"
 * @param {string|null} targetType - e.g. "payout", "provider"
 * @param {string|null} targetId
 * @param {object|null} details    - arbitrary JSON-serialisable context
 */
function logAdminAction(rawDb, adminUserId, action, targetType = null, targetId = null, details = null) {
  try {
    const dbInst = rawDb && rawDb.prepare ? rawDb : (rawDb?._db || db._db || db);
    const detailsJson = details ? JSON.stringify(details) : null;
    const now = new Date().toISOString();

    // Column names match the inline INSERTs already in routes/admin.js.
    // admin_user_id is new in DCP-768; existing rows without it default to 'system'.
    dbInst.prepare(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_type, target_id, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(adminUserId || 'system', action, targetType, targetId, detailsJson, now);
  } catch (err) {
    // Swallow — audit failures must never block admin operations
    if (process.env.NODE_ENV !== 'test') {
      console.error('[admin-audit] Failed to write audit log:', err?.message || err);
    }
  }
}

// ── Resolve admin identity ────────────────────────────────────────────────────

/**
 * Derive a stable identifier for the authenticated admin.
 *
 * If a JWT was decoded onto req.user (future auth layer) use req.user.sub.
 * Otherwise fall back to 'token:<first 8 chars of token hash>'.
 * This avoids storing the raw token in the audit log.
 */
function resolveAdminIdentity(req) {
  if (req.user && req.user.sub) return String(req.user.sub);
  if (req.user && req.user.id)  return String(req.user.id);

  // Derive a stable opaque id from the static token (never store the token itself)
  const crypto = require('crypto');
  const { getAdminTokenFromReq } = require('./auth');
  const token = getAdminTokenFromReq(req);
  if (token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return `token:${hash.slice(0, 8)}`;
  }
  return 'unknown';
}

// ── Route middleware ──────────────────────────────────────────────────────────

/**
 * Express middleware: authenticate + RBAC check + audit log.
 *
 * Accepts:
 *   - JWT Bearer token where req.user.role === 'admin'  (future)
 *   - DC1_ADMIN_TOKEN static token (current production auth)
 *
 * Sets req.adminUser = { id: string, role: 'admin' } on success.
 */
function requireAdminRbac(req, res, next) {
  // ── Step 1: JWT role check (future auth layer) ──────────────────────────
  // If a decoded JWT is already on req.user (set by upstream JWT middleware),
  // check the role field.  This path is unused today but ready for JWT rollout.
  if (req.user && req.user.role) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }
    req.adminUser = { id: req.user.sub || req.user.id || 'jwt-admin', role: 'admin' };
    _auditAndProceed(req, res, next);
    return;
  }

  // ── Step 2: Static token fallback (current production path) ────────────
  // Delegate the actual token verification to the existing requireAdminAuth
  // function so there is a single source of truth for token comparison logic.
  const wrappedNext = (err) => {
    if (err) return next(err);
    // requireAdminAuth called next() — token is valid
    const adminId = resolveAdminIdentity(req);
    req.adminUser = { id: adminId, role: 'admin' };
    _auditAndProceed(req, res, next);
  };

  requireAdminAuth(req, res, wrappedNext);
}

function _auditAndProceed(req, _res, next) {
  if (req.skipAdminAuditLog === true || shouldSkipAutomaticAdminAudit(req)) {
    next();
    return;
  }

  const action = `${req.method} ${req.path}`;
  const adminId = req.adminUser?.id || 'unknown';

  // Derive target info from path params when available
  const targetId = req.params?.id ? String(req.params.id) : null;
  let targetType = null;
  if (req.path.includes('/payouts')) targetType = 'payout';
  else if (req.path.includes('/providers')) targetType = 'provider';
  else if (req.path.includes('/metrics')) targetType = 'metrics';
  else if (req.path.includes('/keys')) targetType = 'api_key';

  // Fire-and-forget audit write
  setImmediate(() => {
    logAdminAction(
      null, // use the module-level db
      adminId,
      action,
      targetType,
      targetId,
      { ip: req.ip, method: req.method, query: req.query }
    );
  });

  next();
}

function shouldSkipAutomaticAdminAudit(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || req.path || '').split('?')[0];

  if (
    method === 'POST' &&
    /^\/api\/admin\/payments\/refund-requests\/[^/]+\/(?:approve|reject)$/.test(path)
  ) {
    return true;
  }

  if (
    method === 'POST' &&
    /^\/api\/admin\/payouts\/[^/]+\/(?:approve|reject|sync)$/.test(path)
  ) {
    return true;
  }

  if (
    method === 'PATCH' &&
    /^\/api\/admin\/payouts\/[^/]+$/.test(path)
  ) {
    return true;
  }

  return false;
}

module.exports = { requireAdminRbac, logAdminAction, shouldSkipAutomaticAdminAudit };
