/**
 * Earned-state routing gate (backlog #2 / keystone enforcement).
 *
 * Proves the renter-facing path consults the EARNED verification verdict
 * (provider_verification.verified_online), not just the CLAIMED signals, so a
 * node that heartbeats but fails its inference probe is neither advertised nor
 * routed to. Uses in-memory SQLite (better-sqlite3) — no mocks for the DB.
 */
'use strict';

const Database = require('better-sqlite3');
const {
  getEarnedRoutingState,
  USABLE_FRESH_MS,
} = require('../services/providerVerification');
const { __test } = require('../routes/v1');
const { applyEarnedRoutingPolicy, resolveEarnedRoutingMode } = __test;

// Build a db adapter matching src/db.js's wrapper (.prepare/.run/.get/.all with
// flattened params), backed by a fresh in-memory database.
function makeDb() {
  const raw = new Database(':memory:');
  const flat = (params) => params.flat(Infinity);
  // Create the table directly (the service's ensureSchema has a module-level
  // _schemaReady latch that would skip creation for a second db instance).
  raw.exec(`
    CREATE TABLE provider_verification (
      provider_id      INTEGER PRIMARY KEY,
      verified_online  INTEGER NOT NULL DEFAULT 0,
      verified_at      TEXT,
      verified_models  TEXT,
      probe_latency_ms INTEGER,
      probe_error      TEXT,
      chat_ok          INTEGER,
      probed_endpoint  TEXT,
      updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  return {
    _raw: raw,
    prepare: (sql) => raw.prepare(sql),
    run: (sql, ...params) => raw.prepare(sql).run(...flat(params)),
    get: (sql, ...params) => raw.prepare(sql).get(...flat(params)),
    all: (sql, ...params) => raw.prepare(sql).all(...flat(params)),
    exec: (sql) => raw.exec(sql),
  };
}

const ISO = (msAgo) => new Date(Date.now() - msAgo).toISOString();

function seedVerdict(db, { id, online, verifiedAtMsAgo }) {
  db.run(
    `INSERT INTO provider_verification (provider_id, verified_online, verified_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, online ? 1 : 0, ISO(verifiedAtMsAgo), ISO(verifiedAtMsAgo)]
  );
}

describe('getEarnedRoutingState', () => {
  it('partitions fresh verdicts into servingIds / deadIds and sets active', () => {
    const db = makeDb();
    seedVerdict(db, { id: 1, online: true, verifiedAtMsAgo: 1000 });          // fresh serving
    seedVerdict(db, { id: 2, online: false, verifiedAtMsAgo: 1000 });         // fresh dead
    seedVerdict(db, { id: 3, online: true, verifiedAtMsAgo: USABLE_FRESH_MS + 60_000 }); // stale

    const state = getEarnedRoutingState(db);

    expect(state.active).toBe(true);
    expect([...state.servingIds]).toEqual([1]);
    expect([...state.deadIds]).toEqual([2]);
    // The stale verdict (id 3) is in neither set — too old to trust either way.
    expect(state.servingIds.has(3)).toBe(false);
    expect(state.deadIds.has(3)).toBe(false);
  });

  it('reports inactive when every verdict is stale (loop down / never ran)', () => {
    const db = makeDb();
    seedVerdict(db, { id: 1, online: true, verifiedAtMsAgo: USABLE_FRESH_MS + 1000 });
    seedVerdict(db, { id: 2, online: false, verifiedAtMsAgo: USABLE_FRESH_MS + 1000 });

    const state = getEarnedRoutingState(db);

    expect(state.active).toBe(false);
    expect(state.servingIds.size).toBe(0);
    expect(state.deadIds.size).toBe(0);
  });

  it('reports inactive with no rows at all', () => {
    const state = getEarnedRoutingState(makeDb());
    expect(state.active).toBe(false);
    expect(state.servingIds.size).toBe(0);
    expect(state.deadIds.size).toBe(0);
  });
});

describe('applyEarnedRoutingPolicy', () => {
  const ORIG = process.env.DCP_ROUTING_EARNED_MODE;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.DCP_ROUTING_EARNED_MODE;
    else process.env.DCP_ROUTING_EARNED_MODE = ORIG;
  });

  // providers: 1=fresh-serving, 2=fresh-dead, 3=stale, 99=never-probed(unknown)
  function activeDb() {
    const db = makeDb();
    seedVerdict(db, { id: 1, online: true, verifiedAtMsAgo: 1000 });
    seedVerdict(db, { id: 2, online: false, verifiedAtMsAgo: 1000 });
    seedVerdict(db, { id: 3, online: true, verifiedAtMsAgo: USABLE_FRESH_MS + 60_000 });
    return db;
  }
  const PROVIDERS = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 99 }];
  const ids = (list) => list.map((p) => p.id).sort((a, b) => a - b);

  it('default mode is exclude-dead', () => {
    delete process.env.DCP_ROUTING_EARNED_MODE;
    expect(resolveEarnedRoutingMode()).toBe('exclude-dead');
  });

  it('exclude-dead drops only freshly-confirmed-dead providers', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'exclude-dead';
    const out = applyEarnedRoutingPolicy(PROVIDERS, activeDb());
    // drops id 2 (fresh dead); keeps serving (1), stale (3), unknown (99)
    expect(ids(out)).toEqual([1, 3, 99]);
  });

  it('strict keeps only verified-serving providers', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'strict';
    const out = applyEarnedRoutingPolicy(PROVIDERS, activeDb());
    expect(ids(out)).toEqual([1]);
  });

  it('off is a pass-through (legacy behavior)', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'off';
    const out = applyEarnedRoutingPolicy(PROVIDERS, activeDb());
    expect(ids(out)).toEqual([1, 2, 3, 99]);
  });

  it('earned-first drops dead at the candidate stage (preference applied later)', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'earned-first';
    const out = applyEarnedRoutingPolicy(PROVIDERS, activeDb());
    expect(ids(out)).toEqual([1, 3, 99]);
  });

  it('degrades to legacy pass-through when verification is inactive', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'strict'; // strictest mode...
    const staleDb = makeDb();
    seedVerdict(staleDb, { id: 2, online: false, verifiedAtMsAgo: USABLE_FRESH_MS + 1000 });
    // ...but no FRESH verdicts → must NOT blank the fleet; returns input as-is.
    const out = applyEarnedRoutingPolicy(PROVIDERS, staleDb);
    expect(ids(out)).toEqual([1, 2, 3, 99]);
  });

  it('returns input unchanged for empty candidate lists', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'strict';
    expect(applyEarnedRoutingPolicy([], activeDb())).toEqual([]);
  });

  it('never throws if the verification table is missing (catch → pass-through)', () => {
    process.env.DCP_ROUTING_EARNED_MODE = 'strict';
    const noTableDb = (() => {
      const raw = new Database(':memory:');
      const flat = (p) => p.flat(Infinity);
      return {
        all: (sql, ...params) => raw.prepare(sql).all(...flat(params)),
        prepare: (sql) => raw.prepare(sql),
      };
    })();
    let out;
    expect(() => { out = applyEarnedRoutingPolicy(PROVIDERS, noTableDb); }).not.toThrow();
    expect(ids(out)).toEqual([1, 2, 3, 99]);
  });
});
