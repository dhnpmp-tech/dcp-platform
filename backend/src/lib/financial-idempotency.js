'use strict';

/**
 * Audit C2 — DB-backed idempotency for financial endpoints.
 *
 * Why DB-backed (instead of reusing v1.js's in-memory `_idempotencyCache`
 * from H6): the inference cache is in-memory because (a) inference is
 * compute, not money, and (b) the cache TTL is 60s. For financial
 * operations (topup, withdrawal, etc.) a server restart that drops the
 * cache mid-flight could let a retry create a second billing row and
 * double-charge the renter. So this cache lives in SQLite with a 24h TTL
 * and is keyed by (subject_type|subject_id):endpoint:client_key so two
 * different renters can use the same `Idempotency-Key` string without
 * colliding.
 *
 * Usage:
 *   router.post('/topup', requireRenter, withFinancialIdempotency({
 *     subjectType: 'renter',
 *     subjectId: (req) => req.renter.id,
 *   }), (req, res) => { ... });
 *
 * Failures are NOT cached (so a retry of a failed request can still
 * succeed). Only 2xx responses are stored.
 *
 * Refs:
 *   - https://stripe.com/docs/api/idempotent_requests (request → response cache pattern)
 *   - draft-ietf-httpapi-idempotency-key-header
 */

const crypto = require('crypto');
const db = require('../db');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_RESPONSE_BYTES = 64 * 1024;       // refuse to cache absurdly large bodies

function _hash(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.join('\u0000'))
    .digest('hex');
}

function _resolve(opts, req) {
  const subjectType = String(opts.subjectType || 'renter');
  const subjectIdRaw = typeof opts.subjectId === 'function'
    ? opts.subjectId(req)
    : opts.subjectId;
  return {
    subjectType,
    subjectId: subjectIdRaw == null ? null : String(subjectIdRaw),
  };
}

function _evictExpired() {
  try {
    db.prepare('DELETE FROM idempotency_keys WHERE expires_at <= ?').run(new Date().toISOString());
  } catch (err) {
    console.warn(`[financial-idempotency] expired-eviction failed: ${err.message}`);
  }
}

/**
 * Express middleware factory. Caches successful (2xx) responses by
 * (subject, endpoint, Idempotency-Key) for `ttlMs` (default 24h).
 *
 * Behavior:
 *   - No `Idempotency-Key` header → pass-through (audit warns, doesn't reject)
 *   - Cached hit → replay status+body, set `Idempotent-Replayed: true`
 *   - Cache miss → wrap res.json/res.status to capture the response,
 *     persist on 2xx, then forward
 */
function withFinancialIdempotency(opts = {}) {
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : DEFAULT_TTL_MS;

  return function financialIdempotencyMiddleware(req, res, next) {
    const clientKeyRaw = req.headers['idempotency-key'];
    const clientKey = typeof clientKeyRaw === 'string' ? clientKeyRaw.trim() : '';

    // Audit C2 strongly recommends Idempotency-Key on financial calls but we
    // don't reject without one — that would break every existing client. Log
    // (rate-limited at a higher layer) and pass through.
    if (!clientKey) {
      console.warn(`[financial-idempotency] WARN: ${req.method} ${req.originalUrl} called without Idempotency-Key — recommend clients send one to prevent double-charges on retry`);
      return next();
    }
    if (clientKey.length > 256) {
      return res.status(400).json({ error: 'Idempotency-Key must be ≤ 256 characters' });
    }

    const { subjectType, subjectId } = _resolve(opts, req);
    if (!subjectId) {
      // Subject not yet resolved (auth middleware should have set it). Pass
      // through rather than crash — the route's own auth check will 401.
      return next();
    }

    const endpointTag = `${req.method} ${req.route?.path || req.path}`;
    const keyHash = _hash([subjectType, subjectId, endpointTag, clientKey]);
    const nowIso = new Date().toISOString();

    // ── Replay path ──────────────────────────────────────────────────────
    let hit = null;
    try {
      hit = db.prepare(
        'SELECT response_status, response_body, expires_at FROM idempotency_keys WHERE key_hash = ?'
      ).get(keyHash);
    } catch (err) {
      console.warn(`[financial-idempotency] read failed: ${err.message}`);
    }
    if (hit && hit.expires_at > nowIso) {
      res.setHeader('Idempotent-Replayed', 'true');
      try {
        const parsed = hit.response_body ? JSON.parse(hit.response_body) : null;
        return res.status(hit.response_status).json(parsed);
      } catch (_) {
        return res.status(hit.response_status).send(hit.response_body || '');
      }
    }

    // Opportunistic GC of expired rows. Cheap, sweep-on-write.
    if (Math.random() < 0.05) _evictExpired();

    // ── Capture path ─────────────────────────────────────────────────────
    // Wrap res.json so we persist the response only after the handler chooses
    // its status code. Also intercept .status().json() chains.
    const origJson = res.json.bind(res);
    res.json = function captureJson(body) {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const serialized = body == null ? null : JSON.stringify(body);
          if (serialized == null || serialized.length <= MAX_RESPONSE_BYTES) {
            const expiresAt = new Date(Date.now() + ttlMs).toISOString();
            db.prepare(
              `INSERT OR REPLACE INTO idempotency_keys
                 (key_hash, subject_type, subject_id, endpoint, request_method,
                  response_status, response_body, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              keyHash,
              subjectType,
              subjectId,
              endpointTag,
              req.method,
              res.statusCode,
              serialized,
              nowIso,
              expiresAt
            );
          } else {
            console.warn(`[financial-idempotency] response too large to cache (${serialized.length} > ${MAX_RESPONSE_BYTES} bytes) for ${endpointTag}`);
          }
        }
      } catch (err) {
        // Never block the response on cache-write failure.
        console.warn(`[financial-idempotency] write failed: ${err.message}`);
      }
      return origJson(body);
    };

    next();
  };
}

module.exports = {
  withFinancialIdempotency,
  // exported for tests
  _hash,
  _evictExpired,
  DEFAULT_TTL_MS,
};
