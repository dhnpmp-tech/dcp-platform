'use strict';

/**
 * billing-rewrite.test.js — billingService unit + integration tests.
 *
 * Covers:
 *   - estimateInferenceCost across the three rate-source fallback tiers
 *   - checkBalanceGate happy + insufficient paths
 *   - settleInferenceOnce: success, idempotent replay, insufficient balance
 *     (rolls back), provider credit applied, sub credits drained before PAYG
 */

process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test';
process.env.DC1_HMAC_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_KEY = 'stub';

const db = require('../src/db');
const billing = require('../src/services/billingService');

const raw = db._db || db;

function seedRenter(id, balanceHalala = 100000) {
  const now = new Date().toISOString();
  raw.prepare(
    `INSERT INTO renters (id, name, email, api_key, balance_halala, created_at, updated_at, total_spent_halala, total_jobs)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
  ).run(id, `r${id}`, `r${id}@test`, `k${id}`, balanceHalala, now, now);
}

function seedProvider(id) {
  const now = new Date().toISOString();
  raw.prepare(
    `INSERT INTO providers (id, name, email, api_key, claimable_earnings_halala, created_at, total_earnings, total_jobs)
     VALUES (?, ?, ?, ?, 0, ?, 0, 0)`
  ).run(id, `p${id}`, `p${id}@test`, `pk${id}`, now);
}

describe('estimateInferenceCost', () => {
  test('per-1m rate path: prompt + completion at separate rates', () => {
    const est = billing.estimateInferenceCost({
      promptTokens: 1000,
      maxCompletionTokens: 500,
      inRateHalalaPer1m: 200_000,   // 200 SAR per million in tokens
      outRateHalalaPer1m: 400_000,
    });
    // in:  ceil(1000 * 200_000 / 1_000_000) = 200
    // out: ceil(500  * 400_000 / 1_000_000) = 200
    expect(est).toBe(400);
  });

  test('flat per-token rate fallback', () => {
    const est = billing.estimateInferenceCost({
      promptTokens: 100,
      maxCompletionTokens: 100,
      tokenRateHalala: 5,
    });
    expect(est).toBe(1000);
  });

  test('per-minute fallback when no token rate', () => {
    const est = billing.estimateInferenceCost({
      promptTokens: 0,
      maxCompletionTokens: 0,
      fallbackRateHalalaPerMin: 200,
    });
    expect(est).toBe(200);
  });

  test('always returns at least 1', () => {
    expect(billing.estimateInferenceCost({})).toBe(1);
  });
});

describe('checkBalanceGate', () => {
  const RENTER = 7101;
  beforeAll(() => seedRenter(RENTER, 50000));

  test('ok when balance covers estimate', () => {
    const r = billing.checkBalanceGate(raw, RENTER, 10000);
    expect(r.ok).toBe(true);
    expect(r.balanceHalala).toBe(50000);
    expect(r.totalAvailableHalala).toBe(50000);
  });

  test('rejects when estimate exceeds balance', () => {
    const r = billing.checkBalanceGate(raw, RENTER, 100000);
    expect(r.ok).toBe(false);
    expect(r.deficitHalala).toBe(50000);
  });
});

describe('settleInferenceOnce', () => {
  const RENTER = 7201;
  const PROVIDER = 7301;
  beforeAll(() => {
    seedRenter(RENTER, 100000);
    seedProvider(PROVIDER);
  });

  test('settles atomically: debits renter, credits provider 75/25', () => {
    const r = billing.settleInferenceOnce(raw, {
      requestId: 'req-001',
      renterId: RENTER,
      providerId: PROVIDER,
      costHalala: 400,
      modelId: 'qwen3-4b',
    });
    expect(r.status).toBe('settled');
    expect(r.costHalala).toBe(400);
    expect(r.providerEarnedHalala).toBe(300); // floor(400 * 75 / 100)

    const renter = raw.prepare('SELECT balance_halala, total_spent_halala, total_jobs FROM renters WHERE id = ?').get(RENTER);
    expect(renter.balance_halala).toBe(100000 - 400);
    expect(renter.total_spent_halala).toBe(400);
    expect(renter.total_jobs).toBe(1);

    const prov = raw.prepare('SELECT claimable_earnings_halala, total_jobs FROM providers WHERE id = ?').get(PROVIDER);
    expect(prov.claimable_earnings_halala).toBe(300);
    expect(prov.total_jobs).toBe(1);

    const attempt = raw.prepare('SELECT * FROM billing_attempts WHERE request_id = ?').get('req-001');
    expect(attempt.status).toBe('settled');
  });

  test('idempotent replay returns already_settled, no double-debit', () => {
    const r = billing.settleInferenceOnce(raw, {
      requestId: 'req-001',  // same id
      renterId: RENTER,
      providerId: PROVIDER,
      costHalala: 400,
      modelId: 'qwen3-4b',
    });
    expect(r.status).toBe('already_settled');

    // Balances unchanged from the previous test.
    const renter = raw.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(RENTER);
    expect(renter.balance_halala).toBe(100000 - 400);
  });

  test('insufficient balance throws and rolls back', () => {
    const renterId = 7202;
    seedRenter(renterId, 100); // 1 SAR
    expect(() =>
      billing.settleInferenceOnce(raw, {
        requestId: 'req-poor-1',
        renterId,
        providerId: PROVIDER,
        costHalala: 10000, // 100 SAR — way over balance
        modelId: 'qwen3-4b',
      })
    ).toThrow(/Insufficient balance/);

    // billing_attempts row was rolled back.
    const att = raw.prepare('SELECT * FROM billing_attempts WHERE request_id = ?').get('req-poor-1');
    expect(att).toBeFalsy();

    // Renter balance unchanged.
    const r = raw.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    expect(r.balance_halala).toBe(100);

    // Provider not credited.
    const provBefore = raw.prepare('SELECT claimable_earnings_halala FROM providers WHERE id = ?').get(PROVIDER);
    expect(provBefore.claimable_earnings_halala).toBe(300); // from earlier test
  });

  test('drains subscription credits before PAYG balance', () => {
    const renterId = 7203;
    seedRenter(renterId, 1000);

    // Seed an active sub + 5000-halala credit.
    const subId1 = raw.prepare(`
      INSERT INTO renter_subscriptions (renter_id, tier, monthly_sar, discount_bps, period_start, period_end, status, created_at, updated_at)
      VALUES (?, 'starter', 375, 1500, '2026-05-01T00:00:00Z', '2099-01-01T00:00:00Z', 'active', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z')
    `).run(renterId).lastInsertRowid;
    raw.prepare(`
      INSERT INTO subscription_credits (renter_id, subscription_id, amount_halala, consumed_halala, granted_at, expires_at, source, created_at)
      VALUES (?, ?, 5000, 0, '2026-05-01T00:00:00Z', '2099-01-01T00:00:00Z', 'monthly_grant', '2026-05-01T00:00:00Z')
    `).run(renterId, subId1);

    const r = billing.settleInferenceOnce(raw, {
      requestId: 'req-sub-1',
      renterId,
      providerId: PROVIDER,
      costHalala: 3000,
      modelId: 'qwen3-4b',
    });
    expect(r.status).toBe('settled');
    expect(r.subCreditsDrainedHalala).toBe(3000);
    expect(r.paygShortfallHalala).toBe(0);

    // PAYG balance untouched.
    const rt = raw.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    expect(rt.balance_halala).toBe(1000);

    // Credit consumed (subscription_credits uses autoincrement INT pk; look up by renter+subscription).
    const cred = raw.prepare(
      'SELECT consumed_halala FROM subscription_credits WHERE renter_id = ? AND subscription_id = ?'
    ).get(renterId, subId1);
    expect(cred.consumed_halala).toBe(3000);
  });

  test('debits PAYG remainder after exhausting sub credits', () => {
    const renterId = 7204;
    seedRenter(renterId, 10000);

    const subId2 = raw.prepare(`
      INSERT INTO renter_subscriptions (renter_id, tier, monthly_sar, discount_bps, period_start, period_end, status, created_at, updated_at)
      VALUES (?, 'starter', 375, 1500, '2026-05-01T00:00:00Z', '2099-01-01T00:00:00Z', 'active', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z')
    `).run(renterId).lastInsertRowid;
    raw.prepare(`
      INSERT INTO subscription_credits (renter_id, subscription_id, amount_halala, consumed_halala, granted_at, expires_at, source, created_at)
      VALUES (?, ?, 1500, 0, '2026-05-01T00:00:00Z', '2099-01-01T00:00:00Z', 'monthly_grant', '2026-05-01T00:00:00Z')
    `).run(renterId, subId2);

    const r = billing.settleInferenceOnce(raw, {
      requestId: 'req-mix-1',
      renterId,
      providerId: PROVIDER,
      costHalala: 4000,
      modelId: 'qwen3-4b',
    });
    expect(r.status).toBe('settled');
    expect(r.subCreditsDrainedHalala).toBe(1500);
    expect(r.paygShortfallHalala).toBe(2500);

    const rt = raw.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(renterId);
    expect(rt.balance_halala).toBe(10000 - 2500);
  });
});
