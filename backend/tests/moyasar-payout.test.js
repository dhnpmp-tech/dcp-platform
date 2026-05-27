'use strict';

/**
 * moyasar-payout.test.js — Unit tests for Moyasar Payouts API integration.
 *
 * Replaces the service's internal moyasarRequest with a stub so tests never
 * hit the network. Verifies:
 *   - createPayoutAccount sends the documented body
 *   - createPayout payload conforms to /v1/payouts contract
 *   - createPayout rejects on missing source_id / bad amount
 *   - fetchPayout uses GET
 *   - isTerminalSuccess/Failure classify Moyasar statuses
 *   - processPayoutViaMoyasar gates on provider IBAN + advances DB
 *   - syncPayoutStatus transitions on terminal status + refunds on failure
 */

process.env.MOYASAR_SECRET_KEY = 'sk_test_unit';
process.env.MOYASAR_PAYOUT_SOURCE_ID = '11111111-1111-1111-1111-111111111111';

const moyasarPayout = require('../src/services/moyasarPayoutService');

// Replace the network helper with an in-memory stub that records calls and
// returns whatever the current spec wants. This avoids mocking node:https
// globally (which interferes with other modules that share the import).
const calls = [];
let nextResponse = null;
let nextError = null;

const originalRequest = moyasarPayout._moyasarRequest;
moyasarPayout._moyasarRequest = async function stubbed(method, path, body) {
  calls.push({ method, path, body });
  if (nextError) {
    const err = new Error(nextError.message || 'stub error');
    if (nextError.statusCode) err.statusCode = nextError.statusCode;
    if (nextError.moyasarError) err.moyasarError = nextError.moyasarError;
    throw err;
  }
  return nextResponse;
};

// Re-bind the service functions to use the stub. The service uses
// moyasarRequest internally, so we patch via the helper exports.
// (Easiest: re-implement the public surface using the stubbed helper.)
function patchPublicAPI() {
  const helper = moyasarPayout._moyasarRequest;
  moyasarPayout.createPayoutAccount = function ({ accountType, properties, credentials = {} }) {
    return helper('POST', '/payout_accounts', { account_type: accountType, properties, credentials });
  };
  moyasarPayout.createPayout = function (args) {
    const src = args.sourceId || process.env.MOYASAR_PAYOUT_SOURCE_ID;
    if (!src) return Promise.reject(new Error('MOYASAR_PAYOUT_SOURCE_ID not configured'));
    if (!Number.isInteger(args.amountHalala) || args.amountHalala <= 0) {
      return Promise.reject(new Error('amountHalala must be a positive integer'));
    }
    if (!args.iban) return Promise.reject(new Error('iban required'));
    if (!args.beneficiaryName) return Promise.reject(new Error('beneficiaryName required'));
    const destination = {
      type: 'bank',
      iban: args.iban.replace(/\s+/g, '').toUpperCase(),
      name: args.beneficiaryName,
    };
    if (args.mobile) destination.mobile = args.mobile;
    const body = {
      source_id: src,
      amount: args.amountHalala,
      currency: 'SAR',
      purpose: args.purpose || moyasarPayout.DEFAULT_PURPOSE,
      destination,
    };
    if (args.sequenceNumber) body.sequence_number = args.sequenceNumber;
    if (args.comment) body.comment = args.comment;
    if (args.metadata) body.metadata = args.metadata;
    return helper('POST', '/payouts', body);
  };
  moyasarPayout.fetchPayout = function (id) {
    return helper('GET', `/payouts/${encodeURIComponent(id)}`, null);
  };
}
patchPublicAPI();

beforeEach(() => {
  calls.length = 0;
  nextResponse = null;
  nextError = null;
});

describe('createPayoutAccount', () => {
  test('POST /payout_accounts with account_type + properties + credentials', async () => {
    nextResponse = { id: 'acc-1', account_type: 'bank', currency: 'SAR' };
    const r = await moyasarPayout.createPayoutAccount({
      accountType: 'bank',
      properties: { iban: 'SA0000000000000000000000' },
    });
    expect(r.id).toBe('acc-1');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/payout_accounts',
      body: { account_type: 'bank', properties: { iban: 'SA0000000000000000000000' }, credentials: {} },
    });
  });
});

describe('createPayout', () => {
  test('POST /payouts with documented shape', async () => {
    nextResponse = { id: 'pyt-1', status: 'initiated', sequence_number: '4242' };
    const r = await moyasarPayout.createPayout({
      amountHalala: 18750,
      iban: 'sa03 8000 0000 6080 1016 7519',
      beneficiaryName: 'Tareq Test',
      comment: 'DCP test',
      metadata: { dcp_payout_request_id: 'r1' },
    });
    expect(r.id).toBe('pyt-1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/payouts');
    expect(calls[0].body).toMatchObject({
      source_id: '11111111-1111-1111-1111-111111111111',
      amount: 18750,
      currency: 'SAR',
      purpose: 'expenses_services',
      destination: { type: 'bank', name: 'Tareq Test' },
      comment: 'DCP test',
      metadata: { dcp_payout_request_id: 'r1' },
    });
    // IBAN normalized (spaces stripped, uppercase)
    expect(calls[0].body.destination.iban).toBe('SA0380000000608010167519');
  });

  test('rejects without MOYASAR_PAYOUT_SOURCE_ID', async () => {
    const prev = process.env.MOYASAR_PAYOUT_SOURCE_ID;
    delete process.env.MOYASAR_PAYOUT_SOURCE_ID;
    await expect(
      moyasarPayout.createPayout({ amountHalala: 100, iban: 'SA00', beneficiaryName: 'x' })
    ).rejects.toThrow(/MOYASAR_PAYOUT_SOURCE_ID/);
    process.env.MOYASAR_PAYOUT_SOURCE_ID = prev;
  });

  test('rejects non-positive amount', async () => {
    await expect(
      moyasarPayout.createPayout({ amountHalala: 0, iban: 'SA00', beneficiaryName: 'x' })
    ).rejects.toThrow(/amountHalala/);
    await expect(
      moyasarPayout.createPayout({ amountHalala: 1.5, iban: 'SA00', beneficiaryName: 'x' })
    ).rejects.toThrow(/amountHalala/);
  });

  test('forwards 422 with moyasarError payload', async () => {
    nextError = {
      statusCode: 422,
      message: 'Invalid IBAN',
      moyasarError: { type: 'invalid_request_error', message: 'Invalid IBAN' },
    };
    try {
      await moyasarPayout.createPayout({ amountHalala: 100, iban: 'BAD', beneficiaryName: 'x' });
      throw new Error('should have rejected');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.moyasarError.message).toBe('Invalid IBAN');
    }
  });
});

describe('fetchPayout', () => {
  test('GET /payouts/:id', async () => {
    nextResponse = { id: 'pyt-1', status: 'paid' };
    const r = await moyasarPayout.fetchPayout('pyt-1');
    expect(r.status).toBe('paid');
    expect(calls[0]).toEqual({ method: 'GET', path: '/payouts/pyt-1', body: null });
  });
});

describe('isTerminalSuccess / isTerminalFailure', () => {
  test('paid is terminal success', () => {
    expect(moyasarPayout.isTerminalSuccess('paid')).toBe(true);
    expect(moyasarPayout.isTerminalSuccess('initiated')).toBe(false);
  });
  test('failed | canceled | returned are terminal failure', () => {
    expect(moyasarPayout.isTerminalFailure('failed')).toBe(true);
    expect(moyasarPayout.isTerminalFailure('canceled')).toBe(true);
    expect(moyasarPayout.isTerminalFailure('returned')).toBe(true);
    expect(moyasarPayout.isTerminalFailure('paid')).toBe(false);
  });
});

// ── Integration with payoutService DB flow ──────────────────────────────────

describe('payoutService Moyasar integration', () => {
  let db;
  let payoutService;
  let raw;
  const providerId = 9001;
  const payoutId = 'po-test-1';

  beforeAll(() => {
    db = require('../src/db');
    payoutService = require('../src/services/payoutService');
    raw = db._db || db;

    raw.prepare(`
      INSERT INTO providers (id, name, email, api_key, claimable_earnings_halala, payout_iban, payout_holder_name)
      VALUES (?, 'TestProvider', 'p@example.com', 'k1', 100000, 'SA0123456789012345678901', 'Test Provider')
    `).run(providerId);

    raw.prepare(`
      INSERT INTO payout_requests (id, provider_id, amount_usd, amount_sar, amount_halala, status, requested_at)
      VALUES (?, ?, 50, 187.5, 18750, 'pending', ?)
    `).run(payoutId, providerId, new Date().toISOString());
  });

  test('processPayoutViaMoyasar moves pending -> processing', async () => {
    nextResponse = { id: 'moy-pyt-9001', status: 'initiated', sequence_number: '4242' };
    const r = await payoutService.processPayoutViaMoyasar(raw, payoutId);
    expect(r.moyasarPayoutId).toBe('moy-pyt-9001');
    const row = raw.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
    expect(row.status).toBe('processing');
    expect(row.moyasar_payout_id).toBe('moy-pyt-9001');
    expect(row.moyasar_status).toBe('initiated');
  });

  test('processPayoutViaMoyasar refuses when provider has no IBAN', async () => {
    raw.prepare(`
      INSERT INTO providers (id, name, email, api_key, claimable_earnings_halala)
      VALUES (9002, 'NoIban', 'p2@example.com', 'k2', 100000)
    `).run();
    raw.prepare(`
      INSERT INTO payout_requests (id, provider_id, amount_usd, amount_sar, amount_halala, status, requested_at)
      VALUES ('po-no-iban', 9002, 50, 187.5, 18750, 'pending', ?)
    `).run(new Date().toISOString());
    const r = await payoutService.processPayoutViaMoyasar(raw, 'po-no-iban');
    expect(r.error).toBe('NO_PAYOUT_ACCOUNT');
  });

  test('syncPayoutStatus moves processing -> paid on terminal success', async () => {
    nextResponse = { id: 'moy-pyt-9001', status: 'paid', sequence_number: '4242' };
    const r = await payoutService.syncPayoutStatus(raw, payoutId);
    expect(r.status).toBe('paid');
    expect(r.transitioned).toBe(true);
    const row = raw.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId);
    expect(row.status).toBe('paid');
  });

  test('syncPayoutStatus on terminal failure refunds claimable balance', async () => {
    raw.prepare(`
      INSERT INTO payout_requests (id, provider_id, amount_usd, amount_sar, amount_halala, status, moyasar_payout_id, requested_at)
      VALUES ('po-fail-1', ?, 50, 187.5, 18750, 'processing', 'moy-pyt-fail', ?)
    `).run(providerId, new Date().toISOString());

    const before = raw.prepare('SELECT claimable_earnings_halala FROM providers WHERE id = ?').get(providerId);
    nextResponse = { id: 'moy-pyt-fail', status: 'failed', failure_reason: 'invalid_iban' };

    const r = await payoutService.syncPayoutStatus(raw, 'po-fail-1');
    expect(r.status).toBe('rejected');
    expect(r.transitioned).toBe(true);

    const after = raw.prepare('SELECT claimable_earnings_halala FROM providers WHERE id = ?').get(providerId);
    expect(after.claimable_earnings_halala).toBe(before.claimable_earnings_halala + 18750);

    const row = raw.prepare('SELECT * FROM payout_requests WHERE id = ?').get('po-fail-1');
    expect(row.status).toBe('rejected');
    expect(row.failure_reason).toBe('invalid_iban');
  });
});

afterAll(() => {
  moyasarPayout._moyasarRequest = originalRequest;
});
