/**
 * Renter monthly spend-cap gate (#20) — billingService.checkBudgetCap.
 *
 * Pure logic, in-memory SQLite. Covers: unlimited (cap 0), under/over cap,
 * current-month windowing (prior-month spend ignored), robustness to both
 * ISO-8601 and SQLite-text created_at, and fail-open on a query error.
 */
'use strict';

const Database = require('better-sqlite3');
const { checkBudgetCap, checkScopedKeyBudgetCap } = require('../services/billingService');

let _seq = 0;
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'active',
      monthly_spend_cap_halala INTEGER DEFAULT 0
    );
    CREATE TABLE openrouter_usage_ledger (
      id TEXT PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      renter_api_key_id TEXT,
      cost_halala INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE renter_api_keys (
      id TEXT PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      revoked_at TEXT,
      monthly_spend_cap_halala INTEGER DEFAULT 0
    );
  `);
  return db;
}
function setRenter(db, id, capHalala) {
  db.prepare('INSERT INTO renters (id, monthly_spend_cap_halala) VALUES (?, ?)').run(id, capHalala);
}
function addSpend(db, renterId, costHalala, createdAt) {
  db.prepare(
    'INSERT INTO openrouter_usage_ledger (id, renter_id, cost_halala, created_at) VALUES (?,?,?,?)'
  ).run('l' + (++_seq), renterId, costHalala, createdAt);
}
function setScopedKey(db, id, renterId, capHalala) {
  db.prepare('INSERT INTO renter_api_keys (id, renter_id, monthly_spend_cap_halala) VALUES (?, ?, ?)').run(id, renterId, capHalala);
}
function addKeySpend(db, renterId, keyId, costHalala, createdAt) {
  db.prepare(
    'INSERT INTO openrouter_usage_ledger (id, renter_id, renter_api_key_id, cost_halala, created_at) VALUES (?,?,?,?,?)'
  ).run('l' + (++_seq), renterId, keyId, costHalala, createdAt);
}
const isoNow = () => new Date().toISOString();
const isoDaysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

describe('checkBudgetCap', () => {
  it('treats cap 0 as unlimited (not capped, always ok)', () => {
    const db = makeDb();
    setRenter(db, 1, 0);
    addSpend(db, 1, 999999, isoNow());
    const r = checkBudgetCap(db, 1, 5000);
    expect(r.capped).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.remainingHalala).toBeNull();
  });

  it('allows when current-month spend + estimate is within the cap', () => {
    const db = makeDb();
    setRenter(db, 1, 10000); // 100 SAR cap
    addSpend(db, 1, 4000, isoNow());
    const r = checkBudgetCap(db, 1, 5000); // 4000 + 5000 = 9000 <= 10000
    expect(r.capped).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.spentThisMonthHalala).toBe(4000);
    expect(r.remainingHalala).toBe(6000);
  });

  it('rejects when current-month spend + estimate would exceed the cap', () => {
    const db = makeDb();
    setRenter(db, 1, 10000);
    addSpend(db, 1, 8000, isoNow());
    const r = checkBudgetCap(db, 1, 5000); // 8000 + 5000 = 13000 > 10000
    expect(r.ok).toBe(false);
    expect(r.spentThisMonthHalala).toBe(8000);
  });

  it('ignores prior-month spend (current-calendar-month window)', () => {
    const db = makeDb();
    setRenter(db, 1, 10000);
    addSpend(db, 1, 50000, isoDaysAgo(70)); // ~2+ months ago — must NOT count
    addSpend(db, 1, 1000, isoNow());
    const r = checkBudgetCap(db, 1, 5000); // only 1000 counts → 6000 <= 10000
    expect(r.spentThisMonthHalala).toBe(1000);
    expect(r.ok).toBe(true);
  });

  it('sums both ISO-8601 and SQLite-text created_at in the same month', () => {
    const db = makeDb();
    setRenter(db, 1, 10000);
    const sqlNow = db.prepare("SELECT datetime('now') AS t").get().t; // "YYYY-MM-DD HH:MM:SS"
    addSpend(db, 1, 3000, isoNow()); // ISO
    addSpend(db, 1, 3000, sqlNow);   // SQLite text
    const r = checkBudgetCap(db, 1, 1000);
    expect(r.spentThisMonthHalala).toBe(6000); // both counted
    expect(r.ok).toBe(true); // 6000 + 1000 <= 10000
  });

  it('fail-open: a missing ledger table never blocks the renter', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE renters (id INTEGER PRIMARY KEY, monthly_spend_cap_halala INTEGER DEFAULT 0)');
    db.prepare('INSERT INTO renters (id, monthly_spend_cap_halala) VALUES (1, 10000)').run();
    // openrouter_usage_ledger does not exist → SUM query throws → fail-open
    const r = checkBudgetCap(db, 1, 999999);
    expect(r.capped).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('rounds a fractional estimate up before comparing', () => {
    const db = makeDb();
    setRenter(db, 1, 10000);
    addSpend(db, 1, 9999, isoNow());
    const r = checkBudgetCap(db, 1, 0.4); // ceil → 1 → 10000 <= 10000 ok
    expect(r.estimateHalala).toBe(1);
    expect(r.ok).toBe(true);
  });
});

describe('checkScopedKeyBudgetCap', () => {
  it('treats master/no scoped key as unlimited', () => {
    const db = makeDb();
    const r = checkScopedKeyBudgetCap(db, { renterId: 1, renterApiKeyId: null, estimateHalala: 999999 });
    expect(r.scoped).toBe(false);
    expect(r.capped).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('treats scoped key cap 0 as unlimited', () => {
    const db = makeDb();
    setScopedKey(db, 'key-1', 1, 0);
    addKeySpend(db, 1, 'key-1', 999999, isoNow());
    const r = checkScopedKeyBudgetCap(db, { renterId: 1, renterApiKeyId: 'key-1', estimateHalala: 5000 });
    expect(r.scoped).toBe(true);
    expect(r.capped).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('allows when scoped key current-month spend plus estimate stays under cap', () => {
    const db = makeDb();
    setScopedKey(db, 'key-1', 1, 10000);
    addKeySpend(db, 1, 'key-1', 3000, isoNow());
    addKeySpend(db, 1, 'other-key', 9000, isoNow());
    const r = checkScopedKeyBudgetCap(db, { renterId: 1, renterApiKeyId: 'key-1', estimateHalala: 4000 });
    expect(r.capped).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.spentThisMonthHalala).toBe(3000);
    expect(r.remainingHalala).toBe(7000);
  });

  it('rejects when scoped key current-month spend plus estimate exceeds cap', () => {
    const db = makeDb();
    setScopedKey(db, 'key-1', 1, 10000);
    addKeySpend(db, 1, 'key-1', 8000, isoNow());
    const r = checkScopedKeyBudgetCap(db, { renterId: 1, renterApiKeyId: 'key-1', estimateHalala: 3000 });
    expect(r.capped).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.spentThisMonthHalala).toBe(8000);
  });

  it('fail-open: a missing scoped-key budget column never blocks inference', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE renter_api_keys (id TEXT PRIMARY KEY, renter_id INTEGER NOT NULL, revoked_at TEXT);
      CREATE TABLE openrouter_usage_ledger (id TEXT PRIMARY KEY, renter_id INTEGER NOT NULL, renter_api_key_id TEXT, cost_halala INTEGER NOT NULL, created_at TEXT NOT NULL);
    `);
    db.prepare('INSERT INTO renter_api_keys (id, renter_id) VALUES (?, ?)').run('key-1', 1);
    const r = checkScopedKeyBudgetCap(db, { renterId: 1, renterApiKeyId: 'key-1', estimateHalala: 999999 });
    expect(r.ok).toBe(true);
    expect(r.failOpen).toBe(true);
  });
});
