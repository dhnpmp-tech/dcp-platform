'use strict';

/**
 * Hermes agent observability — regression tests for the gap surfaced
 * 2026-05-13 on Tareq Node 2. Covers the three units that have to be
 * correct for the feature to be useful:
 *
 *   1. Liveness upsert is idempotent (one row per provider, latest wins).
 *   2. Log snapshot insert + auto-prune keeps newest 50 per provider.
 *   3. _agentOfflineWarnings emits 'agent_offline' when stale > 5 min.
 *   4. _agentRedact strips bearer / api_key / jwt / dcp-provider-* / dcp-renter-*.
 *
 * Pattern mirrors providers-wg-diag.test.js (pure-fn coverage) +
 * admin-export-jobs.test.js (in-memory better-sqlite3 + jest.mock of ../db).
 */

const Database = require('better-sqlite3');

jest.mock('../db', () => {
  function fp(p) {
    if (p.length === 1 && Array.isArray(p[0])) return p[0];
    return p.reduce((a, x) => Array.isArray(x) ? a.concat(x) : a.concat([x]), []);
  }
  return {
    get get()     { return (sql, ...p) => global.__testDb.prepare(sql).get(...fp(p)); },
    get all()     { return (sql, ...p) => global.__testDb.prepare(sql).all(...fp(p)); },
    get run()     { return (sql, ...p) => global.__testDb.prepare(sql).run(...fp(p)); },
    get prepare() { return (sql) => global.__testDb.prepare(sql); },
    get _db()     { return global.__testDb; },
  };
});

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE providers (id INTEGER PRIMARY KEY, api_key TEXT, deleted_at TEXT);
    CREATE TABLE provider_agent_liveness (
      provider_id INTEGER PRIMARY KEY,
      agent TEXT NOT NULL,
      pid INTEGER, uptime_s INTEGER, dashboard_port INTEGER,
      gateway_state TEXT, active_agents INTEGER, platforms_json TEXT,
      last_error_excerpt TEXT, last_error_at TEXT,
      mem_rss_mb INTEGER, log_tail_sha256 TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      wants_logs_at TEXT
    );
    CREATE TABLE provider_agent_log_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      byte_count INTEGER, log_excerpt TEXT
    );
  `);
  db.prepare(`INSERT INTO providers (id, api_key) VALUES (?, ?)`).run(1, 'dcp-provider-test-key-aaaaaa');
  return db;
}

// Initialize the test DB BEFORE requiring providers.js — the router pulls in
// jobs.js which hits the db at import time.
global.__testDb = buildDb();

beforeEach(() => {
  if (global.__testDb) global.__testDb.close();
  global.__testDb = buildDb();
});
afterAll(() => { if (global.__testDb) global.__testDb.close(); });

// Load AFTER jest.mock + global.__testDb fixture is wired.
const providersRouter = require('../routes/providers');
const {
  _agentRedact,
  _agentOfflineWarnings,
  _agentSnapshotIdsToPrune,
  AGENT_LIVENESS_STALE_MS,
  AGENT_LOG_SNAPSHOTS_PER_PROVIDER,
} = providersRouter.__private;
const db = require('../db');

describe('Hermes agent — _agentRedact', () => {
  it('redacts bearer tokens', () => {
    const out = _agentRedact('ERROR: header was Bearer abc123XYZ_token-value');
    expect(out).not.toContain('abc123XYZ_token-value');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts api_key=... in any kv form', () => {
    expect(_agentRedact('boot: api_key=sk-livesecret123')).toContain('[REDACTED]');
    expect(_agentRedact('cfg "api-key": "sk-livesecret123"')).toContain('[REDACTED]');
    expect(_agentRedact('boot: api_key=sk-livesecret123')).not.toContain('sk-livesecret123');
  });

  it('redacts JWTs (three-segment eyJ...)', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOiI.signaturepart';
    const out = _agentRedact(`got token ${jwt} from provider`);
    expect(out).toContain('[REDACTED_JWT]');
    expect(out).not.toContain(jwt);
  });

  it('redacts dcp-provider-* and dcp-renter-* keys', () => {
    const out = _agentRedact('using dcp-provider-aaaabbbbcccc and dcp-renter-zzzz9999yyyy ok');
    expect(out).toContain('dcp-provider-[REDACTED]');
    expect(out).toContain('dcp-renter-[REDACTED]');
    expect(out).not.toContain('aaaabbbbcccc');
    expect(out).not.toContain('zzzz9999yyyy');
  });

  it('redacts password and generic secret kv pairs', () => {
    expect(_agentRedact('password="hunter2"')).not.toContain('hunter2');
    expect(_agentRedact('secret: supersecret')).not.toContain('supersecret');
  });

  it('is a no-op for empty / non-string inputs', () => {
    expect(_agentRedact('')).toBe('');
    expect(_agentRedact(null)).toBe(null);
    expect(_agentRedact(undefined)).toBe(undefined);
  });
});

describe('Hermes agent — _agentOfflineWarnings', () => {
  it('flags agent_never_reported when liveness row missing', () => {
    expect(_agentOfflineWarnings(null)).toEqual(['agent_never_reported']);
    expect(_agentOfflineWarnings(undefined)).toEqual(['agent_never_reported']);
  });

  it('emits agent_offline when updated_at older than 5 min', () => {
    const now = Date.parse('2026-05-13T12:00:00.000Z');
    const stale = new Date(now - (6 * 60 * 1000)).toISOString();
    expect(_agentOfflineWarnings({ updated_at: stale }, now)).toEqual(['agent_offline']);
  });

  it('does not emit agent_offline when fresh (< 5 min)', () => {
    const now = Date.parse('2026-05-13T12:00:00.000Z');
    const fresh = new Date(now - (2 * 60 * 1000)).toISOString();
    expect(_agentOfflineWarnings({ updated_at: fresh }, now)).toEqual([]);
  });

  it('uses the documented threshold (5 min)', () => {
    expect(AGENT_LIVENESS_STALE_MS).toBe(5 * 60 * 1000);
  });
});

describe('Hermes agent — _agentSnapshotIdsToPrune', () => {
  it('returns [] when under cap', () => {
    expect(_agentSnapshotIdsToPrune([1, 2, 3], 50)).toEqual([]);
  });

  it('returns the overflow tail when over cap', () => {
    const ids = Array.from({ length: 53 }, (_, i) => 53 - i); // newest first
    const drop = _agentSnapshotIdsToPrune(ids, 50);
    expect(drop).toHaveLength(3);
    expect(drop).toEqual([3, 2, 1]); // oldest three
  });

  it('uses the documented cap (50)', () => {
    expect(AGENT_LOG_SNAPSHOTS_PER_PROVIDER).toBe(50);
  });
});

describe('Hermes agent — POST /agent-liveness (upsert)', () => {
  it('inserts a row on first beacon and updates on subsequent beacons', () => {
    const handler = providersRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/agent-liveness' && l.route.methods.post
    );
    expect(handler).toBeTruthy();
    const fn = handler.route.stack[handler.route.stack.length - 1].handle;

    const mkReq = (body) => ({
      params: { id: '1' },
      headers: { authorization: 'Bearer dcp-provider-test-key-aaaaaa' },
      query: {},
      body,
    });
    const mkRes = () => {
      const res = {};
      res.status = (c) => { res._status = c; return res; };
      res.json = (b) => { res._body = b; return res; };
      return res;
    };

    const r1 = mkRes();
    fn(mkReq({ agent: 'hermes', pid: 111, uptime_s: 60, dashboard_port: 4500, gateway_state: 'running' }), r1);
    expect(r1._status).toBeUndefined(); // 200 (no explicit status)
    expect(r1._body).toEqual({ ok: true, wants_logs_at: null });

    const row1 = db.get('SELECT pid, uptime_s, gateway_state FROM provider_agent_liveness WHERE provider_id = ?', [1]);
    expect(row1.pid).toBe(111);
    expect(row1.gateway_state).toBe('running');

    // Second beacon overwrites.
    const r2 = mkRes();
    fn(mkReq({ agent: 'hermes', pid: 222, uptime_s: 120, dashboard_port: 4500, gateway_state: 'degraded' }), r2);
    const row2 = db.get('SELECT pid, uptime_s, gateway_state FROM provider_agent_liveness WHERE provider_id = ?', [1]);
    expect(row2.pid).toBe(222);
    expect(row2.gateway_state).toBe('degraded');
    expect(db.all('SELECT provider_id FROM provider_agent_liveness', []).length).toBe(1);
  });

  it('rejects when provider key is missing (Tareq Node 2 cannot impersonate Fadi)', () => {
    const handler = providersRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/agent-liveness' && l.route.methods.post
    );
    const fn = handler.route.stack[handler.route.stack.length - 1].handle;
    const req = { params: { id: '1' }, headers: {}, query: {}, body: { agent: 'hermes' } };
    const res = {};
    res.status = (c) => { res._status = c; return res; };
    res.json = (b) => { res._body = b; return res; };
    fn(req, res);
    expect(res._status).toBe(403);
  });

  it('redacts last_error_excerpt before persisting (defence-in-depth)', () => {
    const handler = providersRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/agent-liveness' && l.route.methods.post
    );
    const fn = handler.route.stack[handler.route.stack.length - 1].handle;
    const req = {
      params: { id: '1' },
      headers: { authorization: 'Bearer dcp-provider-test-key-aaaaaa' },
      query: {},
      body: {
        agent: 'hermes',
        last_error_excerpt: 'failed: Bearer sk-livesecret-must-not-leak api_key=hunter2',
      },
    };
    const res = {};
    res.status = (c) => { res._status = c; return res; };
    res.json = (b) => { res._body = b; return res; };
    fn(req, res);
    const row = db.get('SELECT last_error_excerpt FROM provider_agent_liveness WHERE provider_id = ?', [1]);
    expect(row.last_error_excerpt).not.toContain('sk-livesecret-must-not-leak');
    expect(row.last_error_excerpt).not.toContain('hunter2');
  });
});

describe('Hermes agent — POST /agent-logs (snapshot + prune)', () => {
  const findHandler = () => {
    const handler = providersRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/agent-logs' && l.route.methods.post
    );
    return handler.route.stack[handler.route.stack.length - 1].handle;
  };
  const mkReq = (body) => ({
    params: { id: '1' },
    headers: { authorization: 'Bearer dcp-provider-test-key-aaaaaa' },
    query: {},
    body,
  });
  const mkRes = () => {
    const res = {};
    res.status = (c) => { res._status = c; return res; };
    res.json = (b) => { res._body = b; return res; };
    return res;
  };

  it('inserts a snapshot row, redacting secrets', () => {
    const fn = findHandler();
    const res = mkRes();
    fn(mkReq({ log_excerpt: 'WARN: token Bearer abc1234567tokenvalue refreshed' }), res);
    expect(res._body.ok).toBe(true);
    const row = db.get('SELECT log_excerpt, byte_count FROM provider_agent_log_snapshots WHERE provider_id = ?', [1]);
    expect(row.log_excerpt).not.toContain('abc1234567tokenvalue');
    expect(row.log_excerpt).toContain('[REDACTED]');
    expect(row.byte_count).toBe(Buffer.byteLength(row.log_excerpt, 'utf8'));
  });

  it('auto-prunes to newest 50 per provider', () => {
    const fn = findHandler();
    // Seed 55 snapshots in increasing-time order; each insert may trigger
    // a prune. After all inserts, exactly 50 should remain.
    for (let i = 0; i < 55; i++) {
      const res = mkRes();
      fn(mkReq({ log_excerpt: `snapshot ${i}` }), res);
      expect(res._body.ok).toBe(true);
    }
    const count = db.get('SELECT COUNT(*) as c FROM provider_agent_log_snapshots WHERE provider_id = ?', [1]).c;
    expect(count).toBe(AGENT_LOG_SNAPSHOTS_PER_PROVIDER);
    // Newest preserved: last excerpt should still be present.
    const newest = db.get(
      'SELECT log_excerpt FROM provider_agent_log_snapshots WHERE provider_id = ? ORDER BY id DESC LIMIT 1',
      [1]
    );
    expect(newest.log_excerpt).toContain('snapshot 54');
  });

  it('rejects empty payload (400) without writing a row', () => {
    const fn = findHandler();
    const res = mkRes();
    fn(mkReq({ log_excerpt: '' }), res);
    expect(res._status).toBe(400);
    expect(db.get('SELECT COUNT(*) as c FROM provider_agent_log_snapshots WHERE provider_id = ?', [1]).c).toBe(0);
  });

  it('clears wants_logs_at on successful upload (so Hermes does not re-upload every tick)', () => {
    // Pre-seed liveness with wants_logs_at set.
    db.run(
      `INSERT INTO provider_agent_liveness (provider_id, agent, wants_logs_at) VALUES (?,?,?)`,
      [1, 'hermes', '2026-05-13T12:00:00.000Z']
    );
    const fn = findHandler();
    fn(mkReq({ log_excerpt: 'small log' }), mkRes());
    const row = db.get('SELECT wants_logs_at FROM provider_agent_liveness WHERE provider_id = ?', [1]);
    expect(row.wants_logs_at).toBeNull();
  });
});
