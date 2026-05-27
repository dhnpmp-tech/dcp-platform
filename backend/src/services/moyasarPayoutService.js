'use strict';

/**
 * Moyasar Payouts API client.
 *
 * Endpoints used:
 *   POST /v1/payout_accounts   — register a payout source (one-time, DCP-owned)
 *   POST /v1/payouts           — disburse funds to a recipient IBAN
 *   GET  /v1/payouts/:id       — poll payout status (no webhook in Moyasar's
 *                                standard event list, so we poll)
 *
 * Auth: HTTP Basic, username=secret_key, empty password.
 *
 * Model:
 *   - MOYASAR_PAYOUT_SOURCE_ID is the UUID of OUR registered funding account
 *     (DCP's bank, set up once via the Moyasar dashboard or POST /v1/payout_accounts).
 *   - destination is the recipient's IBAN, passed inline per payout.
 *   - Status lifecycle: queued -> initiated -> paid | failed | canceled | returned.
 *
 * Docs:
 *   https://docs.moyasar.com/api/payouts/01-create-payout-account
 *   https://docs.moyasar.com/api/payouts/04-create-payout
 *   https://docs.moyasar.com/api/payouts/06-fetch-payout
 */

const https = require('https');

const MOYASAR_BASE = 'https://api.moyasar.com/v1';
const DEFAULT_PURPOSE = 'expenses_services';

function getMoyasarSecret() {
  return process.env.MOYASAR_SECRET_KEY || '';
}

function getPayoutSourceId() {
  return process.env.MOYASAR_PAYOUT_SOURCE_ID || '';
}

function moyasarRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const secret = getMoyasarSecret();
    if (!secret) {
      return reject(new Error('MOYASAR_SECRET_KEY not configured'));
    }
    const url = new URL(MOYASAR_BASE + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${secret}:`).toString('base64');
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || parsed.type || 'Moyasar API error');
            err.statusCode = res.statusCode;
            err.moyasarError = parsed;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid Moyasar response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a payout_account (one-time per source).
 * For DCP, this is called once to register our own funding bank account; the
 * returned id is stored in MOYASAR_PAYOUT_SOURCE_ID env var.
 *
 * @param {object} args
 * @param {'bank'|'wallet'} args.accountType
 * @param {object} args.properties   public (e.g., { iban })
 * @param {object} [args.credentials] secret (provider-specific, usually empty for IBAN bank)
 */
function createPayoutAccount({ accountType, properties, credentials = {} }) {
  if (!accountType || !properties) {
    return Promise.reject(new Error('createPayoutAccount: accountType + properties required'));
  }
  return moyasarRequest('POST', '/payout_accounts', {
    account_type: accountType,
    properties,
    credentials,
  });
}

/**
 * Disburse funds to a recipient IBAN.
 *
 * @param {object} args
 * @param {number} args.amountHalala       integer halala (positive)
 * @param {string} args.iban               recipient IBAN (e.g., SA03...)
 * @param {string} args.beneficiaryName    legal name as on the bank account
 * @param {string} [args.mobile]           recipient mobile (E.164, optional)
 * @param {string} [args.purpose]          default 'expenses_services'
 * @param {string} [args.sequenceNumber]   16-digit ref, auto-generated if omitted
 * @param {string} [args.comment]          free-form note
 * @param {object} [args.metadata]         arbitrary key/value tracking
 * @param {string} [args.sourceId]         override env MOYASAR_PAYOUT_SOURCE_ID
 */
function createPayout({
  amountHalala,
  iban,
  beneficiaryName,
  mobile,
  purpose = DEFAULT_PURPOSE,
  sequenceNumber,
  comment,
  metadata,
  sourceId,
}) {
  const src = sourceId || getPayoutSourceId();
  if (!src) {
    return Promise.reject(new Error('MOYASAR_PAYOUT_SOURCE_ID not configured'));
  }
  if (!Number.isInteger(amountHalala) || amountHalala <= 0) {
    return Promise.reject(new Error('amountHalala must be a positive integer'));
  }
  if (!iban || typeof iban !== 'string') {
    return Promise.reject(new Error('iban required'));
  }
  if (!beneficiaryName || typeof beneficiaryName !== 'string') {
    return Promise.reject(new Error('beneficiaryName required'));
  }

  const destination = {
    type: 'bank',
    iban: iban.replace(/\s+/g, '').toUpperCase(),
    name: beneficiaryName,
  };
  if (mobile) destination.mobile = mobile;

  const body = {
    source_id: src,
    amount: amountHalala,
    currency: 'SAR',
    purpose,
    destination,
  };
  if (sequenceNumber) body.sequence_number = sequenceNumber;
  if (comment) body.comment = comment;
  if (metadata) body.metadata = metadata;

  return moyasarRequest('POST', '/payouts', body);
}

/** Fetch a payout by id (used for status polling). */
function fetchPayout(payoutId) {
  if (!payoutId) return Promise.reject(new Error('payoutId required'));
  return moyasarRequest('GET', `/payouts/${encodeURIComponent(payoutId)}`, null);
}

/** List recent payouts (for ops/admin reconciliation). */
function listPayouts({ page = 1 } = {}) {
  return moyasarRequest('GET', `/payouts?page=${encodeURIComponent(page)}`, null);
}

/** True if Moyasar reports a terminal-success state. */
function isTerminalSuccess(status) {
  return status === 'paid';
}

/** True if Moyasar reports a terminal-failure state. */
function isTerminalFailure(status) {
  return status === 'failed' || status === 'canceled' || status === 'returned';
}

module.exports = {
  createPayoutAccount,
  createPayout,
  fetchPayout,
  listPayouts,
  isTerminalSuccess,
  isTerminalFailure,
  DEFAULT_PURPOSE,
  // Exposed for testing.
  _moyasarRequest: moyasarRequest,
};
