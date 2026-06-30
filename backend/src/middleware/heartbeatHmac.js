'use strict';

// H7 (Nexus/Tito audit) — heartbeat / WireGuard-register request signing.
//
// Daemons sign the raw request body with HMAC-SHA256 using DC1_HMAC_SECRET
// and send `X-DC1-Signature: sha256=<64 hex>`. This module verifies that
// signature in constant time (crypto.timingSafeEqual) and exposes a single
// Express route middleware, `enforceHeartbeatHmac`, that both
// POST /api/providers/heartbeat and POST /api/providers/wg/register mount.
//
// Enforcement is gated behind DC1_REQUIRE_HEARTBEAT_HMAC === '1' because the
// shell-based daemons (curl) and older SDK builds do not yet sign — flipping
// it on before they do would 401 every heartbeat and sever the provider mesh.
// Warn-only until the C3 per-provider task_spec signing rollout completes.
//
// Extracted from routes/providers.js so the gate contract is unit-testable
// without importing the whole router (which boots the DB on require).

const crypto = require('crypto');

function verifyHeartbeatHmac(req) {
    const hmacSecret = process.env.DC1_HMAC_SECRET;
    if (!hmacSecret) return { valid: false, reason: 'DC1_HMAC_SECRET not configured' };

    const signatureHeader = req.headers['x-dc1-signature'];
    if (!signatureHeader) return { valid: false, reason: 'X-DC1-Signature header missing' };

    const match = String(signatureHeader).trim().match(/^sha256=([a-f0-9]{64})$/i);
    if (!match) return { valid: false, reason: 'X-DC1-Signature format invalid (expected sha256=<64 hex chars>)' };

    const rawBody = req.rawBody;
    if (!rawBody) return { valid: false, reason: 'Raw body unavailable for HMAC check' };

    const expected = crypto.createHmac('sha256', hmacSecret).update(rawBody).digest('hex');
    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(match[1].toLowerCase(), 'hex')
        );
        return { valid: isValid, reason: isValid ? null : 'HMAC mismatch' };
    } catch {
        return { valid: false, reason: 'HMAC comparison failed' };
    }
}

// Shared route middleware for /heartbeat and /wg/register.
// - DC1_REQUIRE_HEARTBEAT_HMAC !== '1' → warn-only (pass through).
// - '1' → 401 unsigned/invalid-signature requests.
function enforceHeartbeatHmac(req, res, next) {
    const requireHmac = process.env.DC1_REQUIRE_HEARTBEAT_HMAC === '1';
    const hmacResult = verifyHeartbeatHmac(req);
    if (hmacResult.valid) return next();

    if (requireHmac) {
        console.warn(`[${req.path}] HMAC rejected: ${hmacResult.reason}`);
        return res.status(401).json({
            error: 'Invalid request signature',
            detail: hmacResult.reason,
            hint: 'Set the "X-DC1-Signature: sha256=<hex>" header to an HMAC-SHA256 of the raw request body keyed with DC1_HMAC_SECRET.',
        });
    }
    // Warn-only mode: log but allow through for backward-compatible rollout.
    // Mirror the heartbeat route's rawBody guard — a missing rawBody means
    // the json verify hook didn't run, so there's nothing meaningful to log.
    if (req.rawBody) {
        console.warn(`[${req.path}] HMAC warning (enforcement disabled): ${hmacResult.reason}`);
    }
    return next();
}

module.exports = {
    verifyHeartbeatHmac,
    enforceHeartbeatHmac,
};