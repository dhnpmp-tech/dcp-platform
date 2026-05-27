'use strict';

/**
 * auto-topup.test.js — autoTopupService unit tests.
 *
 * Covers:
 *   - updateSettings validation (no card → 412, cap below amount → 400)
 *   - saveCardToken persists token + display fields
 *   - maybeTrigger skip reasons (not_enabled, no_card, above_threshold,
 *     soft_lock, monthly_cap_reached, paused)
 *   - maybeTrigger paid path credits balance + bumps monthly_used
 *   - maybeTrigger failed path increments consecutive_failures + pauses after 3
 */

process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test';
process.env.DC1_HMAC_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_KEY = 'stub';
process.env.MOYASAR_SECRET_KEY = 'sk_test_autotopup';

const db = require('../src/db');
const autoTopup = require('../src/services/autoTopupService');

const raw = db._db || db;

// Replace the Moyasar HTTP call with a controllable in-memory stub.
let nextMoyasarResponse = null;
let nextMoyasarError = null;
const moyasarCalls = [];
autoTopup._moyasarPaymentRequest = async (body) => {
  moyasarCalls.push(body);
  if (nextMoyasarError) throw nextMoyasarError;
  return nextMoyasarResponse;
};

function seedRenter(id, balanceHalala = 5000) {
  const now = new Date().toISOString();
  raw.prepare(`
    INSERT INTO renters (id, name, email, api_key, balance_halala, created_at, updated_at, total_spent_halala, total_jobs)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(id, `r${id}`, `r${id}@test`, `k${id}`, balanceHalala, now, now);
}

beforeEach(() => {
  nextMoyasarResponse = null;
  nextMoyasarError = null;
  moyasarCalls.length = 0;
});

describe('updateSettings', () => {
  const RENTER = 8001;
  beforeAll(() => seedRenter(RENTER));

  test('rejects enable when no card on file (412)', () => {
    const r = autoTopup.updateSettings(raw, RENTER, {
      enabled: true,
      thresholdHalala: 10000,
      amountHalala: 50000,
      monthlyCapHalala: 100000,
    });
    expect(r.error).toBe('NO_CARD_ON_FILE');
  });

  test('rejects cap below amount', () => {
    autoTopup.saveCardToken(raw, RENTER, { token: 'token_unit_1', brand: 'visa', last4: '4242' });
    const r = autoTopup.updateSettings(raw, RENTER, {
      enabled: true,
      thresholdHalala: 10000,
      amountHalala: 50000,
      monthlyCapHalala: 30000, // < amount
    });
    expect(r.error).toBe('CAP_BELOW_AMOUNT');
  });

  test('rejects enable with zero amount or zero threshold', () => {
    expect(
      autoTopup.updateSettings(raw, RENTER, { enabled: true, thresholdHalala: 10000, amountHalala: 0, monthlyCapHalala: 100000 }).error
    ).toBe('INVALID_AMOUNT');
    expect(
      autoTopup.updateSettings(raw, RENTER, { enabled: true, thresholdHalala: 0, amountHalala: 50000, monthlyCapHalala: 100000 }).error
    ).toBe('INVALID_THRESHOLD');
  });

  test('persists valid configuration', () => {
    const r = autoTopup.updateSettings(raw, RENTER, {
      enabled: true,
      thresholdHalala: 10000, // 100 SAR
      amountHalala: 50000,    // 500 SAR
      monthlyCapHalala: 200000, // 2000 SAR
    });
    expect(r.error).toBeUndefined();
    expect(r.auto_topup_enabled).toBe(1);
    expect(r.auto_topup_threshold_halala).toBe(10000);
    expect(r.auto_topup_amount_halala).toBe(50000);
    expect(r.auto_topup_monthly_cap_halala).toBe(200000);
  });
});

describe('saveCardToken', () => {
  const RENTER = 8002;
  beforeAll(() => seedRenter(RENTER));

  test('persists token + brand + last4', () => {
    const r = autoTopup.saveCardToken(raw, RENTER, {
      token: 'token_card_xyz',
      brand: 'mada',
      last4: '1111',
    });
    expect(r.moyasar_card_token).toBe('token_card_xyz');
    expect(r.moyasar_card_brand).toBe('mada');
    expect(r.moyasar_card_last4).toBe('1111');
    expect(r.moyasar_card_saved_at).toBeTruthy();
  });

  test('throws when token missing', () => {
    expect(() => autoTopup.saveCardToken(raw, RENTER, { token: '' })).toThrow(/token required/);
  });
});

describe('maybeTrigger', () => {
  const RENTER = 8003;
  beforeAll(() => {
    seedRenter(RENTER, 5000); // 50 SAR balance
    autoTopup.saveCardToken(raw, RENTER, { token: 'token_t_1', brand: 'visa', last4: '0000' });
    autoTopup.updateSettings(raw, RENTER, {
      enabled: true,
      thresholdHalala: 10000,  // trigger below 100 SAR
      amountHalala: 50000,     // recharge 500 SAR
      monthlyCapHalala: 200000, // monthly cap 2000 SAR
    });
  });

  test('triggers Moyasar charge when balance < threshold', async () => {
    nextMoyasarResponse = { id: 'moy-paid-1', status: 'paid', source: {} };
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(true);
    expect(r.status).toBe('paid');
    expect(r.amountHalala).toBe(50000);
    expect(moyasarCalls).toHaveLength(1);
    expect(moyasarCalls[0].source).toEqual({ type: 'token', token: 'token_t_1' });
    expect(moyasarCalls[0].amount).toBe(50000);
    expect(moyasarCalls[0].currency).toBe('SAR');

    // Balance credited (5000 + 50000) = 55000.
    const renter = raw.prepare('SELECT balance_halala, auto_topup_monthly_used_halala FROM renters WHERE id = ?').get(RENTER);
    expect(renter.balance_halala).toBe(55000);
    expect(renter.auto_topup_monthly_used_halala).toBe(50000);
  });

  test('soft-locks within 60s of last attempt', async () => {
    // Balance is now 55000, above threshold 10000 — first need to bring it back.
    raw.prepare('UPDATE renters SET balance_halala = 1000 WHERE id = ?').run(RENTER);
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('soft_lock_in_window');
  });

  test('above_threshold skip', async () => {
    raw.prepare('UPDATE renters SET balance_halala = 1_000_000, auto_topup_last_attempt_at = NULL WHERE id = ?').run(RENTER);
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('above_threshold');
  });

  test('monthly cap blocks further triggers', async () => {
    // Already used 50000 of cap 200000. Make next recharge exceed cap.
    raw.prepare(
      'UPDATE renters SET balance_halala = 1000, auto_topup_monthly_used_halala = 160000, auto_topup_last_attempt_at = NULL WHERE id = ?'
    ).run(RENTER);
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('monthly_cap_reached');
    // Audit row written with status=capped
    const audit = raw.prepare(
      "SELECT * FROM auto_topup_attempts WHERE renter_id = ? AND status = 'capped'"
    ).get(RENTER);
    expect(audit).toBeTruthy();
  });

  test('failed Moyasar call increments consecutive_failures', async () => {
    // Reset monthly counter + clear soft lock.
    raw.prepare(
      'UPDATE renters SET balance_halala = 1000, auto_topup_monthly_used_halala = 0, auto_topup_last_attempt_at = NULL WHERE id = ?'
    ).run(RENTER);
    const e = new Error('Gateway declined');
    e.statusCode = 422;
    e.moyasarError = { type: 'invalid_token' };
    nextMoyasarError = e;
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(true);
    expect(r.status).toBe('failed');
    expect(r.errorCode).toBe('http_422');

    const renter = raw.prepare(
      'SELECT auto_topup_consecutive_failures, auto_topup_paused_until FROM renters WHERE id = ?'
    ).get(RENTER);
    expect(renter.auto_topup_consecutive_failures).toBe(1);
    expect(renter.auto_topup_paused_until).toBeNull();
  });

  test('pauses after 3 consecutive failures', async () => {
    for (let i = 0; i < 2; i++) {
      raw.prepare(
        'UPDATE renters SET balance_halala = 1000, auto_topup_last_attempt_at = NULL WHERE id = ?'
      ).run(RENTER);
      const e = new Error('decline');
      e.statusCode = 422;
      nextMoyasarError = e;
      await autoTopup.maybeTrigger(raw, RENTER);
    }
    const renter = raw.prepare(
      'SELECT auto_topup_consecutive_failures, auto_topup_paused_until FROM renters WHERE id = ?'
    ).get(RENTER);
    expect(renter.auto_topup_consecutive_failures).toBe(3);
    expect(renter.auto_topup_paused_until).toBeTruthy();

    // Subsequent trigger short-circuits via paused.
    raw.prepare(
      'UPDATE renters SET balance_halala = 1000, auto_topup_last_attempt_at = NULL WHERE id = ?'
    ).run(RENTER);
    const r = await autoTopup.maybeTrigger(raw, RENTER);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('paused');
  });

  test('3DS-required surfaces verification_url', async () => {
    const renterId = 8004;
    seedRenter(renterId, 1000);
    autoTopup.saveCardToken(raw, renterId, { token: 'token_3ds_1', brand: 'mada', last4: '9999' });
    autoTopup.updateSettings(raw, renterId, {
      enabled: true, thresholdHalala: 5000, amountHalala: 20000, monthlyCapHalala: 100000,
    });
    nextMoyasarResponse = {
      id: 'moy-3ds-1',
      status: 'initiated',
      source: { transaction_url: 'https://api.moyasar.com/v1/payments/moy-3ds-1/redirect' },
    };
    const r = await autoTopup.maybeTrigger(raw, renterId);
    expect(r.triggered).toBe(true);
    expect(r.status).toBe('3ds_required');
    expect(r.verificationUrl).toContain('moyasar.com');
  });

  test('disabled renter is skipped', async () => {
    const renterId = 8005;
    seedRenter(renterId, 100);
    const r = await autoTopup.maybeTrigger(raw, renterId);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('not_enabled');
  });
});

describe('3DS callback (Codex PR #428 P1)', () => {
  test('3DS-required path writes a payments row so the webhook can credit', async () => {
    const renterId = 8300;
    seedRenter(renterId, 500);
    autoTopup.saveCardToken(raw, renterId, { token: 'token_3ds_2', brand: 'mada', last4: '4242' });
    autoTopup.updateSettings(raw, renterId, {
      enabled: true, thresholdHalala: 5000, amountHalala: 30000, monthlyCapHalala: 100000,
    });
    nextMoyasarResponse = { id: 'moy-3ds-pay-1', status: 'initiated', source: { transaction_url: 'https://example/v' } };
    const r = await autoTopup.maybeTrigger(raw, renterId);
    expect(r.status).toBe('3ds_required');

    // payments row created with status='initiated' so the webhook can find it.
    const p = raw.prepare('SELECT * FROM payments WHERE moyasar_id = ?').get('moy-3ds-pay-1');
    expect(p).toBeTruthy();
    expect(p.status).toBe('initiated');
    expect(p.amount_halala).toBe(30000);
    expect(p.source_type).toBe('auto_topup');
  });

  test('finalizeFrom3dsCallback credits monthly_used + clears pause + is idempotent', async () => {
    const renterId = 8301;
    seedRenter(renterId, 1000);
    autoTopup.saveCardToken(raw, renterId, { token: 'token_3ds_3', brand: 'visa', last4: '0001' });
    autoTopup.updateSettings(raw, renterId, {
      enabled: true, thresholdHalala: 5000, amountHalala: 40000, monthlyCapHalala: 200000,
    });
    nextMoyasarResponse = { id: 'moy-3ds-pay-2', status: 'initiated', source: { transaction_url: 'https://example/v' } };
    await autoTopup.maybeTrigger(raw, renterId);

    // Simulate the webhook crediting balance (markPaymentPaidOnce equivalent).
    raw.prepare(
      'UPDATE renters SET balance_halala = balance_halala + 40000 WHERE id = ?'
    ).run(renterId);

    const first = autoTopup.finalizeFrom3dsCallback(raw, 'moy-3ds-pay-2');
    expect(first.finalized).toBe(true);

    const row = raw.prepare(
      'SELECT auto_topup_monthly_used_halala, auto_topup_consecutive_failures, auto_topup_paused_until FROM renters WHERE id = ?'
    ).get(renterId);
    expect(row.auto_topup_monthly_used_halala).toBe(40000);
    expect(row.auto_topup_consecutive_failures).toBe(0);
    expect(row.auto_topup_paused_until).toBeNull();

    const attempt = raw.prepare(
      'SELECT status FROM auto_topup_attempts WHERE moyasar_payment_id = ?'
    ).get('moy-3ds-pay-2');
    expect(attempt.status).toBe('paid');

    // Idempotency on webhook retry — no double-bump of monthly_used. After
    // the first call flips status to 'paid', the second call's status-IN
    // filter excludes it (no_open_attempt). Either short-circuit reason is
    // acceptable as long as finalized=false and no side-effects re-fire.
    const second = autoTopup.finalizeFrom3dsCallback(raw, 'moy-3ds-pay-2');
    expect(second.finalized).toBe(false);
    expect(['already_finalized', 'no_open_attempt']).toContain(second.reason);
    const row2 = raw.prepare(
      'SELECT auto_topup_monthly_used_halala FROM renters WHERE id = ?'
    ).get(renterId);
    expect(row2.auto_topup_monthly_used_halala).toBe(40000);
  });

  test('finalizeFrom3dsCallback no-op for unknown moyasar_payment_id', () => {
    const r = autoTopup.finalizeFrom3dsCallback(raw, 'moy-not-real');
    expect(r.finalized).toBe(false);
    expect(r.reason).toBe('no_open_attempt');
  });
});

describe('sweepPausedRenters', () => {
  test('clears expired pauses and retries — succeeds when next charge clears', async () => {
    const renterId = 8200;
    seedRenter(renterId, 1000);
    autoTopup.saveCardToken(raw, renterId, { token: 'token_sweep_ok', brand: 'visa', last4: '1234' });
    autoTopup.updateSettings(raw, renterId, {
      enabled: true,
      thresholdHalala: 10000,
      amountHalala: 50000,
      monthlyCapHalala: 100000,
    });

    // Force a pause: 3 consecutive failures, paused_until 1h ago (i.e. elapsed).
    const longAgo = new Date(Date.now() - 3_600_000).toISOString();
    raw.prepare(
      "UPDATE renters SET auto_topup_consecutive_failures = 3, auto_topup_paused_until = ?, auto_topup_last_attempt_at = NULL WHERE id = ?"
    ).run(longAgo, renterId);

    // Next Moyasar charge succeeds — sweep should fire it.
    nextMoyasarResponse = { id: 'moy-sweep-1', status: 'paid', source: {} };

    const result = await autoTopup.sweepPausedRenters(raw);
    expect(result.swept).toBeGreaterThanOrEqual(1);
    expect(result.retried).toBeGreaterThanOrEqual(1);

    const r = raw.prepare(
      'SELECT auto_topup_paused_until, auto_topup_consecutive_failures, balance_halala FROM renters WHERE id = ?'
    ).get(renterId);
    expect(r.auto_topup_paused_until).toBeNull();
    expect(r.auto_topup_consecutive_failures).toBe(0);
    expect(r.balance_halala).toBe(1000 + 50000);
  });

  test('does not touch renters whose pause window has not elapsed', async () => {
    const renterId = 8201;
    seedRenter(renterId, 1000);
    autoTopup.saveCardToken(raw, renterId, { token: 'token_sweep_skip', brand: 'visa', last4: '5678' });
    autoTopup.updateSettings(raw, renterId, {
      enabled: true,
      thresholdHalala: 10000,
      amountHalala: 50000,
      monthlyCapHalala: 100000,
    });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    raw.prepare(
      'UPDATE renters SET auto_topup_consecutive_failures = 3, auto_topup_paused_until = ? WHERE id = ?'
    ).run(future, renterId);

    const before = raw.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    const callsBefore = moyasarCalls.length;

    await autoTopup.sweepPausedRenters(raw);

    const after = raw.prepare(
      'SELECT auto_topup_paused_until, auto_topup_consecutive_failures, balance_halala FROM renters WHERE id = ?'
    ).get(renterId);
    // Pause still set, failures unchanged, no Moyasar call made.
    expect(after.auto_topup_paused_until).toBe(future);
    expect(after.auto_topup_consecutive_failures).toBe(3);
    expect(after.balance_halala).toBe(before.balance_halala);
    expect(moyasarCalls.length).toBe(callsBefore);
  });
});
