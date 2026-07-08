'use strict';

const Database = require('better-sqlite3');
const {
  SUPPLY_TIERS,
  computePaidAvailableCredit,
  evaluatePodLaunchCreditPolicy,
  getProviderSupplyTier,
  getRenterPaidCreditState,
  normalizeSupplyTier,
} = require('../services/podAccessPolicy');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY,
      balance_halala INTEGER DEFAULT 0,
      trial_grant_halala INTEGER DEFAULT 0
    );
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      amount_halala INTEGER NOT NULL,
      status TEXT NOT NULL,
      refund_amount_halala INTEGER
    );
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      is_burst INTEGER DEFAULT 0,
      supply_tier TEXT
    );
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      cost_halala INTEGER,
      actual_cost_halala INTEGER
    );
  `);
  return db;
}

describe('podAccessPolicy supply tiers', () => {
  test('normalizes explicit supply tiers', () => {
    expect(normalizeSupplyTier('DCP_OWNED')).toBe(SUPPLY_TIERS.DCP_OWNED);
    expect(normalizeSupplyTier('provider')).toBe(SUPPLY_TIERS.PROVIDER);
    expect(normalizeSupplyTier('on_demand')).toBe(SUPPLY_TIERS.ON_DEMAND);
    expect(normalizeSupplyTier('external')).toBeNull();
  });

  test('derives on-demand from burst providers and provider for native rows', () => {
    expect(getProviderSupplyTier({ is_burst: 1 })).toBe(SUPPLY_TIERS.ON_DEMAND);
    expect(getProviderSupplyTier({ is_burst: 0 })).toBe(SUPPLY_TIERS.PROVIDER);
  });

  test('explicit supply_tier wins over derived fallback', () => {
    expect(getProviderSupplyTier({ is_burst: 0, supply_tier: 'dcp_owned' })).toBe(SUPPLY_TIERS.DCP_OWNED);
  });

  test('burst flag cannot be downgraded by an explicit non-on-demand tier', () => {
    expect(getProviderSupplyTier({ is_burst: 1, supply_tier: 'provider' })).toBe(SUPPLY_TIERS.ON_DEMAND);
  });
});

describe('podAccessPolicy paid credit accounting', () => {
  test('paid available credit is capped by both current balance and uncommitted paid funding', () => {
    expect(computePaidAvailableCredit({
      balanceHalala: 3000,
      paidFundingHalala: 1000,
      onDemandCommittedHalala: 0,
    })).toBe(1000);

    expect(computePaidAvailableCredit({
      balanceHalala: 800,
      paidFundingHalala: 1000,
      onDemandCommittedHalala: 0,
    })).toBe(800);

    expect(computePaidAvailableCredit({
      balanceHalala: 3000,
      paidFundingHalala: 1000,
      onDemandCommittedHalala: 700,
    })).toBe(300);
  });

  test('paid credit state counts paid/refunded payments and subtracts on-demand commitments', () => {
    const db = makeDb();
    db.prepare('INSERT INTO renters (id, balance_halala, trial_grant_halala) VALUES (1, 3000, 2000)').run();
    db.prepare("INSERT INTO payments (renter_id, amount_halala, status) VALUES (1, 1000, 'paid')").run();
    db.prepare("INSERT INTO payments (renter_id, amount_halala, status, refund_amount_halala) VALUES (1, 700, 'refunded', 200)").run();
    db.prepare('INSERT INTO providers (id, is_burst) VALUES (10, 1), (11, 0)').run();
    db.prepare("INSERT INTO jobs (renter_id, provider_id, job_type, status, cost_halala) VALUES (1, 10, 'interactive_pod', 'running', 600)").run();
    db.prepare("INSERT INTO jobs (renter_id, provider_id, job_type, status, cost_halala) VALUES (1, 11, 'interactive_pod', 'running', 900)").run();

    const state = getRenterPaidCreditState(db, { id: 1, balance_halala: 3000 });
    expect(state.paid_funding_halala).toBe(1500);
    expect(state.on_demand_committed_halala).toBe(600);
    expect(state.paid_available_halala).toBe(900);
    db.close();
  });

  test('explicit on-demand supply tier counts as an on-demand commitment', () => {
    const db = makeDb();
    db.prepare('INSERT INTO renters (id, balance_halala, trial_grant_halala) VALUES (1, 4000, 2000)').run();
    db.prepare("INSERT INTO payments (renter_id, amount_halala, status) VALUES (1, 2000, 'paid')").run();
    db.prepare("INSERT INTO providers (id, is_burst, supply_tier) VALUES (20, 0, 'on_demand')").run();
    db.prepare("INSERT INTO jobs (renter_id, provider_id, job_type, status, cost_halala) VALUES (1, 20, 'interactive_pod', 'running', 750)").run();

    const state = getRenterPaidCreditState(db, { id: 1, balance_halala: 4000 });
    expect(state.paid_funding_halala).toBe(2000);
    expect(state.on_demand_committed_halala).toBe(750);
    expect(state.paid_available_halala).toBe(1250);
    db.close();
  });
});

describe('evaluatePodLaunchCreditPolicy', () => {
  test('allows native provider launch with trial-only balance', () => {
    const db = makeDb();
    const result = evaluatePodLaunchCreditPolicy({
      db,
      renter: { id: 1, balance_halala: 2000 },
      provider: { id: 11, is_burst: 0 },
      quoteHalala: 900,
      durationMinutes: 60,
      ratePerGpuSecond: 0.25,
    });
    expect(result.allowed).toBe(true);
    expect(result.supply_tier).toBe(SUPPLY_TIERS.PROVIDER);
    db.close();
  });

  test('blocks on-demand launch when the renter only has trial/free balance', () => {
    const db = makeDb();
    db.prepare('INSERT INTO renters (id, balance_halala, trial_grant_halala) VALUES (1, 2000, 2000)').run();

    const result = evaluatePodLaunchCreditPolicy({
      db,
      renter: { id: 1, balance_halala: 2000 },
      provider: { id: 10, is_burst: 1 },
      quoteHalala: 900,
      durationMinutes: 60,
      ratePerGpuSecond: 0.25,
    });

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(402);
    expect(result.payload.code).toBe('on_demand_requires_prepaid_credit');
    expect(result.payload.paid_available_halala).toBe(0);
    db.close();
  });

  test('a 10 SAR paid deposit unlocks on-demand quotes up to 10 SAR', () => {
    const db = makeDb();
    db.prepare('INSERT INTO renters (id, balance_halala, trial_grant_halala) VALUES (1, 3000, 2000)').run();
    db.prepare("INSERT INTO payments (renter_id, amount_halala, status) VALUES (1, 1000, 'paid')").run();

    const allowed = evaluatePodLaunchCreditPolicy({
      db,
      renter: { id: 1, balance_halala: 3000 },
      provider: { id: 10, is_burst: 1 },
      quoteHalala: 1000,
      durationMinutes: 60,
      ratePerGpuSecond: 1000 / 3600,
    });
    expect(allowed.allowed).toBe(true);

    const blocked = evaluatePodLaunchCreditPolicy({
      db,
      renter: { id: 1, balance_halala: 3000 },
      provider: { id: 10, is_burst: 1 },
      quoteHalala: 1001,
      durationMinutes: 60,
      ratePerGpuSecond: 1001 / 3600,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.payload.required_halala).toBe(1001);
    expect(blocked.payload.paid_available_halala).toBe(1000);
    db.close();
  });

  test('previous on-demand commitments reduce paid credit available for another on-demand launch', () => {
    const db = makeDb();
    db.prepare('INSERT INTO renters (id, balance_halala, trial_grant_halala) VALUES (1, 2400, 2000)').run();
    db.prepare("INSERT INTO payments (renter_id, amount_halala, status) VALUES (1, 1000, 'paid')").run();
    db.prepare('INSERT INTO providers (id, is_burst) VALUES (10, 1)').run();
    db.prepare("INSERT INTO jobs (renter_id, provider_id, job_type, status, cost_halala) VALUES (1, 10, 'interactive_pod', 'running', 600)").run();

    const result = evaluatePodLaunchCreditPolicy({
      db,
      renter: { id: 1, balance_halala: 2400 },
      provider: { id: 10, is_burst: 1 },
      quoteHalala: 500,
      durationMinutes: 30,
      ratePerGpuSecond: 500 / 1800,
    });

    expect(result.allowed).toBe(false);
    expect(result.payload.paid_available_halala).toBe(400);
    db.close();
  });
});
