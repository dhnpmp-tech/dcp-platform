'use strict';

// Covers the SITE-8 fix: the v2 /v2/auth signup tab issues a renter magic link
// via renters/send-otp, which does NOT pre-stage a renter row. The magic-link
// handler must therefore create the renter on first click
// (createActiveRenterFromMagicLink) instead of dead-ending on a 404
// "No account found. Please register first." Mirrors the provider test.

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');

// Proxy the db module to an in-memory better-sqlite3 on global.__testDb.
jest.mock('../db', () => {
  function flatten(params) {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  }
  return {
    get get() { return (sql, ...p) => global.__testDb.prepare(sql).get(...flatten(p)); },
    get all() { return (sql, ...p) => global.__testDb.prepare(sql).all(...flatten(p)); },
    get run() { return (sql, ...p) => global.__testDb.prepare(sql).run(...flatten(p)); },
    get prepare() { return (sql) => global.__testDb.prepare(sql); },
    get exec() { return (sql) => global.__testDb.exec(sql); },
  };
});

// Welcome email is fire-and-forget; stub it so no network is touched.
const mockSendWelcomeEmail = jest.fn(() => Promise.resolve({ success: true }));
jest.mock('../services/emailService', () => ({
  sendWelcomeEmail: (...args) => mockSendWelcomeEmail(...args),
}));

function makeApp() {
  const authRouter = require('../routes/auth');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

function seedSchema(db) {
  db.exec(`
    CREATE TABLE otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT,
      magic_token TEXT,
      expires_at TEXT,
      used INTEGER DEFAULT 0,
      used_at TEXT,
      requested_role TEXT
    );
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      gpu_model TEXT,
      os TEXT DEFAULT 'linux',
      supported_compute_types TEXT,
      gpu_profile_source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'pending',
      approval_status TEXT DEFAULT 'pending',
      api_key TEXT,
      created_at TEXT
    );
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      organization TEXT,
      use_case TEXT,
      phone TEXT,
      status TEXT DEFAULT 'active',
      balance_halala INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
}

function insertToken(db, { token, email, role }) {
  const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO otp_codes (email, code, magic_token, expires_at, used, requested_role)
     VALUES (?, '000000', ?, ?, 0, ?)`
  ).run(email.toLowerCase(), token, future, role);
}

describe('magic-link renter onboarding (createActiveRenterFromMagicLink)', () => {
  beforeEach(() => {
    jest.resetModules();
    global.__testDb = new Database(':memory:');
    seedSchema(global.__testDb);
    mockSendWelcomeEmail.mockClear();
  });

  afterEach(() => {
    if (global.__testDb) global.__testDb.close();
  });

  test('creates an active renter on first magic-link click instead of 404', async () => {
    insertToken(global.__testDb, { token: 'tok-r-1', email: 'newrenter@dcp.sa', role: 'renter' });
    const res = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-r-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.role).toBe('renter');
    expect(res.body.api_key).toMatch(/^dcp-renter-/);
    expect(res.body.dual_role).toBe(false);

    const row = global.__testDb.prepare('SELECT * FROM renters WHERE email = ?').get('newrenter@dcp.sa');
    expect(row).toBeTruthy();
    expect(row.status).toBe('active');
    expect(row.api_key).toMatch(/^dcp-renter-/);
    expect(row.balance_halala).toBe(10000);
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  test('is idempotent — a second click for the same email reuses the renter (no double-credit)', async () => {
    insertToken(global.__testDb, { token: 'tok-r-a', email: 'dupr@dcp.sa', role: 'renter' });
    const first = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-r-a' });
    const key1 = first.body.api_key;

    insertToken(global.__testDb, { token: 'tok-r-b', email: 'dupr@dcp.sa', role: 'renter' });
    const second = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-r-b' });

    expect(second.status).toBe(200);
    expect(second.body.api_key).toBe(key1);
    const renter = global.__testDb.prepare('SELECT * FROM renters WHERE email = ?').get('dupr@dcp.sa');
    expect(renter.balance_halala).toBe(10000); // not double-credited
    const count = global.__testDb
      .prepare('SELECT COUNT(*) AS c FROM renters WHERE email = ?')
      .get('dupr@dcp.sa').c;
    expect(count).toBe(1);
    // No second welcome email on the idempotent reuse.
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  test('returns the existing renter for a returning renter (no new key, unchanged login)', async () => {
    global.__testDb
      .prepare(`INSERT INTO renters (name, email, api_key, status, balance_halala, created_at) VALUES (?, ?, ?, 'active', 5000, ?)`)
      .run('Existing', 'returning@dcp.sa', 'dcp-renter-existingkey', new Date().toISOString());

    insertToken(global.__testDb, { token: 'tok-r-existing', email: 'returning@dcp.sa', role: 'renter' });
    const res = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-r-existing' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('renter');
    expect(res.body.api_key).toBe('dcp-renter-existingkey');
    expect(res.body.renter.balance_halala).toBe(5000);
    // No row created, no welcome email for a returning renter.
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
    const count = global.__testDb
      .prepare('SELECT COUNT(*) AS c FROM renters WHERE email = ?')
      .get('returning@dcp.sa').c;
    expect(count).toBe(1);
  });

  test('finalizes a pre-staged pending renter without double-crediting (register-then-click path)', async () => {
    // POST /api/renters/register pre-stages a pending row with a placeholder key.
    global.__testDb
      .prepare(`INSERT INTO renters (name, email, api_key, status, balance_halala, created_at) VALUES (?, ?, ?, 'pending', 0, ?)`)
      .run('Staged', 'staged@dcp.sa', 'pending-renter-abc123', new Date().toISOString());

    insertToken(global.__testDb, { token: 'tok-r-staged', email: 'staged@dcp.sa', role: 'renter' });
    const res = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-r-staged' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('renter');
    expect(res.body.api_key).toMatch(/^dcp-renter-/);
    expect(res.body.api_key).not.toBe('pending-renter-abc123');
    const renter = global.__testDb.prepare('SELECT * FROM renters WHERE email = ?').get('staged@dcp.sa');
    expect(renter.status).toBe('active');
    expect(renter.balance_halala).toBe(10000); // credited exactly once, by finalizePendingRenter
  });
});
