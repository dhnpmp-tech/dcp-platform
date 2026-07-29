'use strict';
// Pure decision logic for the top-up reconciliation sweep — the safety net that
// catches dropped Moyasar payment_paid webhooks. Mirrors the exported helper
// (avoids loading better-sqlite3 in the test env, same pattern as
// webhook-hmac.test.js).

function topupReconcileDecision(moyasarStatus, moyasarAmountHalala, dbAmountHalala) {
  const status = String(moyasarStatus || '').toLowerCase();
  if (status === 'paid') {
    if (moyasarAmountHalala != null && moyasarAmountHalala !== dbAmountHalala) {
      return { action: 'skip', reason: 'amount_mismatch' };
    }
    return { action: 'credit' };
  }
  if (['failed', 'void', 'canceled', 'expired'].includes(status)) {
    return { action: 'fail' };
  }
  return { action: 'wait' };
}

describe('topupReconcileDecision', () => {
  test('paid + matching amount → credit', () => {
    expect(topupReconcileDecision('paid', 5000, 5000)).toEqual({ action: 'credit' });
  });

  test('paid + null Moyasar amount (payment endpoint) → credit (no amount to guard on)', () => {
    expect(topupReconcileDecision('paid', null, 5000)).toEqual({ action: 'credit' });
  });

  test('paid + amount MISMATCH → skip, never credit (guards against wrong-amount credit)', () => {
    expect(topupReconcileDecision('paid', 9900, 5000)).toEqual({ action: 'skip', reason: 'amount_mismatch' });
  });

  test.each(['failed', 'void', 'canceled', 'expired', 'FAILED'])('%s → fail (mark payment failed)', (s) => {
    expect(topupReconcileDecision(s, null, 5000)).toEqual({ action: 'fail' });
  });

  test.each(['initiated', 'unpaid', '', null, undefined, 'processing'])('non-terminal %s → wait (stay pending)', (s) => {
    expect(topupReconcileDecision(s, null, 5000)).toEqual({ action: 'wait' });
  });

  test('case-insensitive on paid', () => {
    expect(topupReconcileDecision('PAID', 100, 100).action).toBe('credit');
  });
});
