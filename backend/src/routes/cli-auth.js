'use strict';

// routes/cli-auth.js — device-code login for the dcp CLI (mounted at /v1/cli).
//
//   POST /device/code     → { device_code, user_code, verification_uri, interval, expires_in }
//   POST /device/approve  → renter-authed; binds user_code → renter + mints a scoped key
//   POST /device/token    → poll with device_code; authorization_pending | expired_token |
//                           invalid_grant | { api_key, renter_id } (one-time claim)
//
// Follows the OAuth 2.0 device-flow shape so the CLI code stays boring. The
// approval page (dcp.sa/cli-login) posts /device/approve with the renter's
// session; until that page ships, approval also works from the dashboard
// console or curl with a renter key.

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const v1 = require('./v1');
const { cliDeviceCodeLimiter, cliDevicePollLimiter } = require('../middleware/rateLimiter');

const { requireAuth } = v1.shared;

const router = express.Router();

const CODE_TTL_SECONDS = 900;   // 15 min to approve
const POLL_INTERVAL_SECONDS = 5;
const VERIFICATION_URI = process.env.DCP_CLI_VERIFICATION_URI || 'https://dcp.sa/cli-login';

// Unambiguous alphabet (no 0/O, 1/I/L) for the code a human reads and types.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeUserCode() {
  const pick = () => USER_CODE_ALPHABET[crypto.randomInt(USER_CODE_ALPHABET.length)];
  const quad = () => pick() + pick() + pick() + pick();
  return `${quad()}-${quad()}`;
}

// ── POST /device/code ───────────────────────────────────────────────────────
router.post('/device/code', cliDeviceCodeLimiter, (req, res) => {
  try {
    const now = new Date();
    const deviceCode = crypto.randomBytes(24).toString('hex');
    let userCode = makeUserCode();
    // user_code is UNIQUE — retry a couple of times on the astronomically
    // unlikely collision rather than 500ing.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        db.prepare(
          `INSERT INTO cli_device_codes (device_code, user_code, status, created_at, expires_at)
           VALUES (?, ?, 'pending', ?, ?)`
        ).run(deviceCode, userCode, now.toISOString(), new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString());
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        userCode = makeUserCode();
      }
    }
    return res.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${VERIFICATION_URI}?code=${userCode}`,
      interval: POLL_INTERVAL_SECONDS,
      expires_in: CODE_TTL_SECONDS,
    });
  } catch (error) {
    console.error('[cli-auth] device/code error:', error.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── POST /device/approve ────────────────────────────────────────────────────
router.post('/device/approve', cliDeviceCodeLimiter, requireAuth, (req, res) => {
  try {
    const userCode = String(req.body?.user_code || '').trim().toUpperCase();
    if (!userCode) return res.status(400).json({ error: 'user_code required' });

    const row = db.get(
      `SELECT id, status, expires_at FROM cli_device_codes WHERE user_code = ?`, userCode
    );
    if (!row || row.status !== 'pending') {
      return res.status(400).json({ error: 'invalid_or_used_code' });
    }
    if (row.expires_at < new Date().toISOString()) {
      return res.status(400).json({ error: 'expired_token' });
    }

    // Mint a scoped inference key (same shape renters.js sub-keys use).
    const keyId = crypto.randomUUID();
    const apiKey = `dc1-sk-${crypto.randomBytes(20).toString('hex')}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO renter_api_keys (id, renter_id, key, label, scopes, created_at)
       VALUES (?, ?, ?, 'dcp CLI', '["inference"]', ?)`
    ).run(keyId, req.renter.id, apiKey, now);
    db.prepare(
      `UPDATE cli_device_codes SET status='approved', renter_id=?, api_key=?, approved_at=? WHERE id=?`
    ).run(req.renter.id, apiKey, now, row.id);

    return res.json({ approved: true });
  } catch (error) {
    console.error('[cli-auth] device/approve error:', error.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── POST /device/token ──────────────────────────────────────────────────────
router.post('/device/token', cliDevicePollLimiter, (req, res) => {
  try {
    const deviceCode = String(req.body?.device_code || '').trim();
    const row = db.get(
      `SELECT id, status, renter_id, api_key, expires_at FROM cli_device_codes WHERE device_code = ?`,
      deviceCode
    );
    if (!row) return res.status(400).json({ error: 'invalid_grant' });
    if (row.status === 'claimed') return res.status(400).json({ error: 'invalid_grant' });
    if (row.expires_at < new Date().toISOString() && row.status === 'pending') {
      return res.status(400).json({ error: 'expired_token' });
    }
    if (row.status === 'pending') {
      return res.status(400).json({ error: 'authorization_pending' });
    }
    // approved → hand the key over ONCE. Atomic claim: the status guard in the
    // WHERE means only ONE caller can flip approved→claimed, so a race (or a
    // future multi-process/async refactor) can't hand the key out twice.
    const claim = db.prepare(
      `UPDATE cli_device_codes SET status='claimed', api_key=NULL WHERE id=? AND status='approved'`
    ).run(row.id);
    if (claim.changes !== 1) return res.status(400).json({ error: 'invalid_grant' });
    return res.json({ api_key: row.api_key, renter_id: row.renter_id });
  } catch (error) {
    console.error('[cli-auth] device/token error:', error.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
