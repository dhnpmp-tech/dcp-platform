'use strict';

/**
 * Audit M6 — per-renter webhook signing secret.
 *
 * The legacy code path signed outbound webhooks with
 *   `process.env.DCP_WEBHOOK_SECRET || renter.api_key`.
 * Falling back to the renter's API key leaks that key into the webhook
 * signature sent to a URL the renter (or whoever sees their webhook
 * traffic) controls. This module resolves a dedicated per-renter HMAC
 * secret that is generated lazily on first use and persisted to
 * `renters.webhook_secret`.
 *
 * Fail-closed contract:
 *   - returns a string secret on success
 *   - returns null when no secret can be derived (callers MUST then skip
 *     sending the webhook rather than signing with a placeholder)
 */

const crypto = require('crypto');
const db = require('../db');

const SECRET_BYTES = 32;

function generateSecret() {
  return crypto.randomBytes(SECRET_BYTES).toString('hex');
}

/**
 * Resolve (or lazily mint) the webhook signing secret for a renter.
 * Order of preference:
 *   1. renters.webhook_secret column (auto-minted if NULL)
 *   2. process.env.DCP_WEBHOOK_SECRET (explicit global override)
 *   3. null  → caller must skip signing / not send
 *
 * @param {number|string} renterId
 * @returns {string|null}
 */
function resolveRenterWebhookSecret(renterId) {
  if (renterId == null) {
    return process.env.DCP_WEBHOOK_SECRET || null;
  }
  try {
    const row = db.get('SELECT webhook_secret FROM renters WHERE id = ?', renterId);
    if (row && typeof row.webhook_secret === 'string' && row.webhook_secret.length >= 32) {
      return row.webhook_secret;
    }
    // Mint and persist on first use.
    const secret = generateSecret();
    db.prepare('UPDATE renters SET webhook_secret = ? WHERE id = ?').run(secret, renterId);
    return secret;
  } catch (err) {
    console.warn(`[webhook-secret] failed to resolve secret for renter ${renterId}: ${err.message}`);
    return process.env.DCP_WEBHOOK_SECRET || null;
  }
}

module.exports = {
  resolveRenterWebhookSecret,
  generateSecret,
};
