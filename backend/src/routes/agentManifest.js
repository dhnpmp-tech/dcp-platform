'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent/manifest.json
//
// Self-update manifest endpoint for the dcp-agent fleet. dcp-agent PR #17
// shipped a self-update cron on every provider machine that polls this URL
// to discover which commit it should be running. A 404 here means the entire
// fleet stays pinned to whatever they last successfully fetched.
//
// Trust model (v1): TLS-only. The response is authenticated by virtue of
// arriving over a valid TLS session to api.dcp.sa. Providers MUST verify the
// certificate chain. This is sufficient for v1 because the only attacker who
// can forge a response also already controls the api.dcp.sa MITM path, in
// which case we have bigger problems than the manifest.
//
// v2 (pending): add a GPG signature header (X-DCP-Manifest-Signature) over a
// canonical JSON encoding, with the verifying key compiled into dcp-agent.
// That moves the trust anchor from "the TLS chain" to "a key we control",
// removing the CA system from the threat model. DO NOT bolt this on early —
// signature verification logic on the agent side is the actual blocker.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const db = require('../db');
const {
  getBearerToken,
  looksLikeProviderKey,
  looksLikeRenterKey,
} = require('../middleware/auth');
const { authenticatedEndpointLimiter } = require('../middleware/rateLimiter');

// Provider auth helper for this endpoint.
// Accepts a Bearer token only — matching the spec ("Authentication: Bearer
// token"). The dcp-agent self-updater sends exactly this header.
//
// We do an early-reject on keys that look like the wrong role (renter keys)
// before hitting the DB, consistent with the H1 prefix-scheme described in
// middleware/auth.js.
function authenticateProvider(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing bearer token' };

  // Cross-role key-confusion guard: an obvious renter key should never grant
  // provider access, even if the renter and provider tables collide on the
  // raw string (they won't, but defence in depth is cheap here).
  // Allow unknown-prefix keys through (legacy provider keys may not carry the
  // prefix — the DB lookup below is the source of truth). Hard-reject only
  // keys that actively look like a renter key.
  if (!looksLikeProviderKey(token) && looksLikeRenterKey(token)) {
    return { ok: false, status: 401, error: 'Provider authentication required' };
  }

  const provider = db.get(
    'SELECT id, approval_status FROM providers WHERE api_key = ? AND deleted_at IS NULL',
    token,
  );
  if (!provider) {
    return { ok: false, status: 401, error: 'Invalid provider key' };
  }

  // We do NOT gate on approval_status here. A provider whose approval is
  // pending or revoked still needs the ability to self-update — in fact, a
  // self-update is often the path back to a healthy state.

  return { ok: true, providerId: provider.id };
}

// GET /agent/manifest.json
router.get('/manifest.json', authenticatedEndpointLimiter, (req, res) => {
  const auth = authenticateProvider(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let row;
  try {
    row = db.get(
      `SELECT safe_commit, min_tag, rollout_pct, published_at
         FROM agent_manifest
         ORDER BY published_at DESC, id DESC
         LIMIT 1`,
    );
  } catch (err) {
    console.error('[agent-manifest] DB read failed:', err && err.message);
    return res.status(500).json({ error: 'Manifest read failed' });
  }

  if (!row) {
    // No row published yet — surface as 503 so providers retry, not 404 which
    // they'd interpret as "endpoint missing".
    console.warn('[agent-manifest] No manifest rows present in agent_manifest table');
    return res.status(503).json({ error: 'No manifest published yet' });
  }

  // Audit log: who fetched, from where. Keep it lightweight (single line) so
  // it doesn't drown pm2 logs at fleet scale — one line per provider per cron
  // tick is acceptable (~thousands/hour at full fleet).
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  console.log(
    `[agent-manifest] fetched provider_id=${auth.providerId} ip=${clientIp} `
    + `safe_commit=${String(row.safe_commit).slice(0, 12)} rollout_pct=${row.rollout_pct}`,
  );

  res.set('Cache-Control', 'no-store');
  return res.status(200).json({
    safe_commit: row.safe_commit,
    min_tag: row.min_tag,
    rollout_pct: row.rollout_pct,
    published_at: row.published_at,
  });
});

module.exports = router;
