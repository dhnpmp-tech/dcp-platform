'use strict';

/**
 * Tests for GET /agent/manifest.json — self-update endpoint that the
 * dcp-agent fleet polls. See routes/agentManifest.js for the route and
 * migrations/014_agent_manifest.sql for the schema.
 *
 * Coverage:
 *   1. 401 when no Authorization header
 *   2. 401 when Bearer token doesn't match any provider
 *   3. 401 when token has the renter prefix (cross-role guard)
 *   4. 503 when the agent_manifest table is empty
 *   5. 200 + latest row when a valid provider key is presented
 *   6. Cache-Control: no-store header set
 *   7. Latest-row selection respects published_at DESC
 */

const express = require('express');
const Database = require('better-sqlite3');

jest.mock('../db', () => {
  function flat(p) {
    if (p.length === 1 && Array.isArray(p[0])) return p[0];
    return p.reduce((a, x) => (Array.isArray(x) ? a.concat(x) : a.concat([x])), []);
  }
  return {
    get get()     { return (sql, ...p) => global.__testDb.prepare(sql).get(...flat(p)); },
    get all()     { return (sql, ...p) => global.__testDb.prepare(sql).all(...flat(p)); },
    get run()     { return (sql, ...p) => global.__testDb.prepare(sql).run(...flat(p)); },
    get prepare() { return (sql) => global.__testDb.prepare(sql); },
  };
});

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT,
      approval_status TEXT DEFAULT 'approved',
      deleted_at TEXT
    );
    CREATE TABLE agent_manifest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      safe_commit TEXT NOT NULL,
      min_tag TEXT,
      rollout_pct INTEGER NOT NULL DEFAULT 0,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      published_by TEXT,
      notes TEXT
    );
  `);
  db.prepare('INSERT INTO providers (api_key, approval_status) VALUES (?, ?)').run(
    'dcp-provider-test-fleet-key',
    'approved',
  );
  return db;
}

global.__testDb = buildDb();

beforeEach(() => {
  if (global.__testDb) global.__testDb.close();
  global.__testDb = buildDb();
});
afterAll(() => { if (global.__testDb) global.__testDb.close(); });

const agentManifestRouter = require('../routes/agentManifest');

function buildApp() {
  const app = express();
  app.use('/agent', agentManifestRouter);
  return app;
}

// Tiny in-process HTTP client (supertest isn't a top-level dep here)
function call(app, headers = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/agent/manifest.json', method: 'GET', headers },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            server.close();
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: body ? JSON.parse(body) : null,
            });
          });
        },
      );
      req.on('error', (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

describe('GET /agent/manifest.json', () => {
  test('401 when no Authorization header is sent', async () => {
    global.__testDb.prepare(
      'INSERT INTO agent_manifest (safe_commit, min_tag, rollout_pct) VALUES (?, ?, ?)',
    ).run('a'.repeat(40), 'v0.6.0', 100);

    const res = await call(buildApp());
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/bearer/i);
  });

  test('401 when bearer token does not match any provider', async () => {
    global.__testDb.prepare(
      'INSERT INTO agent_manifest (safe_commit, rollout_pct) VALUES (?, ?)',
    ).run('a'.repeat(40), 100);

    const res = await call(buildApp(), { Authorization: 'Bearer dcp-provider-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid provider key/i);
  });

  test('401 when token has a renter prefix (cross-role guard)', async () => {
    const res = await call(buildApp(), { Authorization: 'Bearer dcp-renter-abcdef' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/provider authentication required/i);
  });

  test('503 when the agent_manifest table is empty', async () => {
    const res = await call(buildApp(), { Authorization: 'Bearer dcp-provider-test-fleet-key' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/no manifest/i);
  });

  test('200 + latest row when a valid provider key is presented', async () => {
    global.__testDb.prepare(
      `INSERT INTO agent_manifest (safe_commit, min_tag, rollout_pct, published_at)
         VALUES (?, ?, ?, ?)`,
    ).run('a'.repeat(40), 'v0.6.0', 10, '2026-05-19T00:00:00Z');
    global.__testDb.prepare(
      `INSERT INTO agent_manifest (safe_commit, min_tag, rollout_pct, published_at)
         VALUES (?, ?, ?, ?)`,
    ).run('b'.repeat(40), 'v0.6.0', 100, '2026-05-20T12:00:00Z');

    const res = await call(buildApp(), { Authorization: 'Bearer dcp-provider-test-fleet-key' });
    expect(res.status).toBe(200);
    expect(res.body.safe_commit).toBe('b'.repeat(40));
    expect(res.body.rollout_pct).toBe(100);
    expect(res.body.min_tag).toBe('v0.6.0');
    expect(res.body.published_at).toBe('2026-05-20T12:00:00Z');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
