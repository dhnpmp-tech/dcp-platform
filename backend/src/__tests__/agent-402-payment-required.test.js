'use strict';

/**
 * Agent-first hardening — structured HTTP 402 PaymentRequiredError body.
 *
 * The create/extend/rent money routes must return a machine-readable 402 that
 * (a) satisfies the OpenAPI `PaymentRequiredError` schema and (b) gives an
 * autonomous agent everything it needs to fund and retry: a stable error code,
 * the shortfall, and a topup URL — never a leaked provider/machine/IP.
 */

const { paymentRequiredPayload, TOPUP_URL } = require('../lib/error-response');

describe('paymentRequiredPayload — agent-readable 402 body', () => {
  test('carries the documented code + currency + topup_url', () => {
    const body = paymentRequiredPayload({ requiredHalala: 5000, balanceHalala: 1200 });
    expect(body.error).toBe('insufficient_balance');
    expect(body.code).toBe('insufficient_balance');
    expect(body.currency).toBe('SAR');
    expect(body.topup_url).toBe(TOPUP_URL);
    expect(body.retryable).toBe(true);
  });

  test('uses credit-first default copy', () => {
    const body = paymentRequiredPayload({ requiredHalala: 5000, balanceHalala: 1200 });
    expect(body.message).toContain('Available credit 12 SAR');
    expect(body.message).toContain('Add credit and retry');
    expect(body.message).not.toMatch(/wallet|top up/i);
  });

  test('exposes both halala (OpenAPI) and SAR (agent) amounts', () => {
    const body = paymentRequiredPayload({ requiredHalala: 5000, balanceHalala: 1234 });
    expect(body.required_halala).toBe(5000);
    expect(body.balance_halala).toBe(1234);
    expect(body.required_sar).toBe(50);
    expect(body.balance_sar).toBe(12.34);
  });

  test('rounds fractional halala and clamps negatives to zero', () => {
    const body = paymentRequiredPayload({ requiredHalala: 99.6, balanceHalala: -10 });
    expect(body.required_halala).toBe(100);
    expect(body.balance_halala).toBe(0);
    expect(body.balance_sar).toBe(0);
  });

  test('keeps the legacy nested object under error_detail for old callers', () => {
    const body = paymentRequiredPayload({ requiredHalala: 5000, balanceHalala: 0 });
    expect(body.error_detail).toMatchObject({
      type: 'insufficient_balance',
      code: 'insufficient_balance',
      status: 402,
    });
  });

  test('uses a custom human message when provided', () => {
    const msg = 'Insufficient credit for this pod. Add credit and retry.';
    const body = paymentRequiredPayload({ requiredHalala: 700, balanceHalala: 50, message: msg });
    expect(body.message).toBe(msg);
  });

  test('INVISIBILITY: never leaks provider/machine/peer/ip fields', () => {
    const body = paymentRequiredPayload({ requiredHalala: 5000, balanceHalala: 1200 });
    const serialized = JSON.stringify(body).toLowerCase();
    for (const banned of ['provider_id', 'peer_id', 'node', 'machine', 'vendor', 'ip_address', 'endpoint_url']) {
      expect(serialized).not.toContain(banned);
    }
  });
});
