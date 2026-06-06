'use strict';

// Covers the PR fix: the v2 provider wizard issues a provider magic link BEFORE
// any provider row exists, so the magic-link handler must create the provider
// on first click (finalizePendingProvider) instead of dead-ending on a 404
// "No account found. Please register first." Mirrors finalizePendingRenter.

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
// Must be `mock`-prefixed — jest.mock factories may only reference out-of-scope
// variables whose names start with "mock".
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
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      organization TEXT,
      api_key TEXT,
      status TEXT DEFAULT 'pending',
      balance_halala INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
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

describe('magic-link provider onboarding (finalizePendingProvider)', () => {
  beforeEach(() => {
    jest.resetModules();
    global.__testDb = new Database(':memory:');
    seedSchema(global.__testDb);
    mockSendWelcomeEmail.mockClear();
  });

  afterEach(() => {
    if (global.__testDb) global.__testDb.close();
  });

  test('creates a provider on first magic-link click instead of 404', async () => {
    insertToken(global.__testDb, { token: 'tok-new-1', email: 'newprov@dcp.sa', role: 'provider' });
    const res = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-new-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.role).toBe('provider');
    expect(res.body.api_key).toMatch(/^dcp-provider-/);

    const row = global.__testDb.prepare('SELECT * FROM providers WHERE email = ?').get('newprov@dcp.sa');
    expect(row).toBeTruthy();
    expect(row.status).toBe('registered');
    expect(row.approval_status).toBe('pending');
    expect(row.gpu_profile_source).toBe('pending_detection');
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  test('is idempotent — a second click for the same email reuses the provider', async () => {
    insertToken(global.__testDb, { token: 'tok-a', email: 'dup@dcp.sa', role: 'provider' });
    const first = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-a' });
    const key1 = first.body.api_key;

    insertToken(global.__testDb, { token: 'tok-b', email: 'dup@dcp.sa', role: 'provider' });
    const second = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-b' });

    expect(second.status).toBe(200);
    expect(second.body.api_key).toBe(key1);
    const count = global.__testDb
      .prepare('SELECT COUNT(*) AS c FROM providers WHERE email = ?')
      .get('dup@dcp.sa').c;
    expect(count).toBe(1);
    // No second welcome email on the idempotent reuse.
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  test('returns the existing provider for a returning provider (no duplicate, no new key)', async () => {
    global.__testDb
      .prepare(`INSERT INTO providers (name, email, api_key, status, approval_status) VALUES (?, ?, ?, 'online', 'approved')`)
      .run('Existing', 'returning@dcp.sa', 'dcp-provider-existingkey');
    insertToken(global.__testDb, { token: 'tok-ret', email: 'returning@dcp.sa', role: 'provider' });

    const res = await request(makeApp()).post('/api/auth/magic-link').send({ token: 'tok-ret' });
    expect(res.status).toBe(200);
    expect(res.body.api_key).toBe('dcp-provider-existingkey');
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });

  test('still 404s for a renter-flow link with no account (no provider auto-create)', async () => {
    insertToken(global.__testDb, { token: 'tok-renter', email: 'norenter@dcp.sa', role: 'renter' });
    const res = await request(makeApp())
      .post('/api/auth/magic-link')
      .send({ token: 'tok-renter', prefer: 'renter' });

    expect(res.status).toBe(404);
    const count = global.__testDb
      .prepare('SELECT COUNT(*) AS c FROM providers WHERE email = ?')
      .get('norenter@dcp.sa').c;
    expect(count).toBe(0);
  });
});
