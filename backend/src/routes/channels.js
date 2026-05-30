// /api/channels/health — Mission Control reads this to render channel status.
//
// Public-internal: same auth surface as /api/mission (admin token, renter
// key, or provider key). Returns array of channel_health rows ordered
// by alive ASC (dead first) then channel_id.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAdminRequest } = require('../middleware/auth');

function isAuthed(req) {
  if (isAdminRequest(req)) return true;
  const renterKey = req.headers['x-renter-key'] || req.query.key;
  if (renterKey) {
    try {
      const row = db.get(
        `SELECT 1 FROM renter_api_keys WHERE key = ? AND revoked_at IS NULL LIMIT 1`,
        renterKey
      );
      if (row) return true;
    } catch (_) { /* swallow no-such-table */ }
  }
  const providerKey = req.headers['x-provider-key'];
  if (providerKey) {
    try {
      const row = db.get(
        `SELECT 1 FROM providers WHERE api_key = ? AND deleted_at IS NULL LIMIT 1`,
        providerKey
      );
      if (row) return true;
    } catch (_) { /* swallow */ }
  }
  return false;
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

router.get('/health', requireAuth, async (req, res) => {
  try {
    const rows = db.all(`
      SELECT
        channel_id,
        alive,
        last_success_at,
        last_error,
        reconnect_hint,
        probed_at,
        latency_ms,
        consecutive_fail
      FROM channel_health
      ORDER BY alive ASC, channel_id ASC
    `);
    const now = Date.now() / 1000;
    res.json({
      generated_at: now,
      total: rows.length,
      dead: rows.filter(r => !r.alive).length,
      channels: rows.map(r => ({
        ...r,
        alive: Boolean(r.alive),
        seconds_since_success: r.last_success_at ? Math.round(now - r.last_success_at) : null,
        seconds_since_probe: r.probed_at ? Math.round(now - r.probed_at) : null,
      })),
    });
  } catch (err) {
    if (/no such table/i.test(err.message || '')) {
      return res.status(503).json({ error: 'channel_health table not yet created — run migration 018' });
    }
    console.error('[channels] failed:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
