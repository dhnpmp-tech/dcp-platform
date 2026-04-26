'use strict';

const Database = require('better-sqlite3');
const { findActiveAccountByEmail, buildConflictResponse } = require('../services/cross-role-uniqueness');

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      status TEXT,
      deleted_at TEXT,
      created_at TEXT
    );
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      api_key TEXT,
      status TEXT,
      deleted_at TEXT,
      created_at TEXT
    );
  `);
  return db;
}

// Wrap better-sqlite3 with the same shape backend/src/db.js exposes
// (db.get(sql, ...params)) so the helper can be tested directly.
function wrap(db) {
  function flatten(params) {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  }
  return {
    get: (sql, ...params) => db.prepare(sql).get(...flatten(params)),
  };
}

describe('cross-role-uniqueness', () => {
  describe('findActiveAccountByEmail', () => {
    test('returns null when no account exists with that email', () => {
      const db = wrap(buildDb());
      expect(findActiveAccountByEmail(db, 'unknown@example.com')).toBeNull();
    });

    test('returns provider role when an active provider exists', () => {
      const raw = buildDb();
      raw.prepare(`INSERT INTO providers (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(1, 'Fadi', 'mcmazyad@live.com', 'offline', '2026-04-26');
      const result = findActiveAccountByEmail(wrap(raw), 'mcmazyad@live.com');
      expect(result).toEqual({ role: 'provider', id: 1, email: 'mcmazyad@live.com', status: 'offline' });
    });

    test('returns renter role when an active renter exists', () => {
      const raw = buildDb();
      raw.prepare(`INSERT INTO renters (id, name, email, api_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(2, 'Fadi', 'mcmazyad@gmail.com', 'k', 'active', '2026-04-26');
      const result = findActiveAccountByEmail(wrap(raw), 'mcmazyad@gmail.com');
      expect(result).toEqual({ role: 'renter', id: 2, email: 'mcmazyad@gmail.com', status: 'active' });
    });

    test('is case-insensitive on the lookup', () => {
      const raw = buildDb();
      raw.prepare(`INSERT INTO providers (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(1, 'Fadi', 'mcmazyad@live.com', 'offline', '2026-04-26');
      expect(findActiveAccountByEmail(wrap(raw), 'McMazyad@LIVE.com')).not.toBeNull();
    });

    test('ignores soft-deleted rows so the email can be re-used after closure', () => {
      const raw = buildDb();
      raw.prepare(`INSERT INTO renters (id, name, email, api_key, status, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(3, 'Old', 'reuse@example.com', 'k', 'deleted', '2026-04-20T10:00:00.000Z', '2026-04-01');
      expect(findActiveAccountByEmail(wrap(raw), 'reuse@example.com')).toBeNull();
    });

    test('returns null on null/empty/non-string input', () => {
      const db = wrap(buildDb());
      expect(findActiveAccountByEmail(db, '')).toBeNull();
      expect(findActiveAccountByEmail(db, '   ')).toBeNull();
      expect(findActiveAccountByEmail(db, null)).toBeNull();
      expect(findActiveAccountByEmail(db, undefined)).toBeNull();
      expect(findActiveAccountByEmail(db, 42)).toBeNull();
    });

    test('provider takes precedence when both rows exist (covers historical Fadi state pre-cleanup)', () => {
      // Reproduces the dirty state migration 006 cleans up.
      const raw = buildDb();
      raw.prepare(`INSERT INTO providers (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(1774351995309, 'Fadi', 'mcmazyad@live.com', 'offline', '2026-04-26');
      raw.prepare(`INSERT INTO renters (id, name, email, api_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(1774351995146, 'Fadi', 'mcmazyad@live.com', 'k2', 'active', '2026-04-26');
      const result = findActiveAccountByEmail(wrap(raw), 'mcmazyad@live.com');
      expect(result.role).toBe('provider');
    });
  });

  describe('buildConflictResponse', () => {
    test('shapes the error so the wizard can render existing_role-aware copy', () => {
      const err = buildConflictResponse('provider', 'renter');
      expect(err.code).toBe('cross_role_email_conflict');
      expect(err.existing_role).toBe('provider');
      expect(err.message).toMatch(/already registered as a provider/);
    });
  });
});
