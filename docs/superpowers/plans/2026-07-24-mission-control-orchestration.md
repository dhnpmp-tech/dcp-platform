# Mission Control Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Mission Control into the canonical multi-agent orchestration system: per-agent API keys, atomic task claiming with leases, a mechanical dispatcher daemon with a write-only Telegram bridge, an agent protocol + CLI, and an Agents strip in the admin UI.

**Architecture:** Everything extends `dc1-platform` in place (spec: `docs/superpowers/specs/2026-07-24-mission-control-orchestration-design.md`). Backend routes + SQLite migrations follow the existing patterns in `backend/src/routes/mission.js` and `backend/src/db.js`. The dispatcher is a plain Node loop that talks to the backend **over HTTP only** (its own `dispatcher`-scoped key) and lives in `backend/src/dispatcher/` so the existing Jest setup covers it (spec §6 named `orchestration/dispatcher/` — we deviate so tests are free; the pm2 process name keeps the orchestration identity).

**Tech Stack:** Node/Express, better-sqlite3 (via `backend/src/db.js` wrapper), Jest (`--runInBand`), pm2 on the VPS, Telegram Bot API via global `fetch`, Next.js admin page.

**Branch:** create `feat/mission-orchestration` from `main` before Task 1. The working tree currently sits on a codex audit branch — do not build there. Also commit the spec file (untracked) as the first commit on the new branch.

**Test command (all backend tasks):** run from `backend/`:
`NODE_ENV=test npx jest src/__tests__/<file>.test.js --runInBand`

---

## Phase 1 — Schema, identity, claim API (spec §4, §5)

### Task 1: DB migration — agent keys, leases, heartbeat columns

**Files:**
- Modify: `backend/src/db.js` (mission section, anchor: `─── MISSION CONTROL TABLES ───` ~line 2723; ALTER pattern anchor: `mission_task_comments ADD COLUMN source` ~line 1276)
- Test: `backend/src/__tests__/missionOrchestrationSchema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/missionOrchestrationSchema.test.js
const db = require('../db');

describe('mission orchestration schema', () => {
  it('has mission_agent_keys table with expected columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_agent_keys)`).map(c => c.name);
    for (const c of ['id','assignee_id','key_hash','label','scopes','active','created_at','last_used_at']) {
      expect(cols).toContain(c);
    }
  });
  it('mission_tasks has lease + tier columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_tasks)`).map(c => c.name);
    for (const c of ['claimed_by','claimed_at','lease_expires_at','tier']) {
      expect(cols).toContain(c);
    }
  });
  it('mission_assignees has heartbeat columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_assignees)`).map(c => c.name);
    expect(cols).toContain('last_seen_at');
    expect(cols).toContain('heartbeat_state');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest src/__tests__/missionOrchestrationSchema.test.js --runInBand`
Expected: FAIL — columns/table missing.

- [ ] **Step 3: Implement migration**

**CRITICAL ordering gotcha:** the ALTER list at ~line 1276 executes BEFORE the mission CREATE block at ~line 2723. On a fresh DB (tests run with `DC1_DB_PATH=':memory:'`), the ALTERs are swallowed ("no such table") and the tables are then created WITHOUT the new columns. Follow the codebase's own dual pattern (see `mission_task_comments.source`/`kind`): **add the new columns inline to the CREATE TABLE statements** (`mission_tasks` gains `claimed_by TEXT`, `claimed_at TEXT`, `lease_expires_at TEXT`, `tier TEXT DEFAULT 'standard'`; `mission_assignees` gains `last_seen_at TEXT`, `heartbeat_state TEXT`) **AND** add the ALTERs for pre-existing prod DBs.

In `backend/src/db.js`, inside the mission tables block (after the existing `CREATE TABLE IF NOT EXISTS mission_task_comments` and its indexes), add:

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS mission_agent_keys (
    id           TEXT PRIMARY KEY,
    assignee_id  TEXT NOT NULL,
    key_hash     TEXT NOT NULL,
    label        TEXT,
    scopes       TEXT NOT NULL DEFAULT 'agent',
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mission_agent_keys_hash ON mission_agent_keys(key_hash, active);
`);
```

Then extend the existing best-effort ALTER list (same pattern as the `mission_task_comments ADD COLUMN source` entries — each statement swallowed if the column already exists; these cover prod DBs where the tables predate the new columns):

```js
  'ALTER TABLE mission_tasks ADD COLUMN claimed_by TEXT',
  'ALTER TABLE mission_tasks ADD COLUMN claimed_at TEXT',
  'ALTER TABLE mission_tasks ADD COLUMN lease_expires_at TEXT',
  "ALTER TABLE mission_tasks ADD COLUMN tier TEXT DEFAULT 'standard'",
  'ALTER TABLE mission_assignees ADD COLUMN last_seen_at TEXT',
  'ALTER TABLE mission_assignees ADD COLUMN heartbeat_state TEXT',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx jest src/__tests__/missionOrchestrationSchema.test.js --runInBand` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.js backend/src/__tests__/missionOrchestrationSchema.test.js
git commit -m "feat(mission): agent keys table + task lease/tier + assignee heartbeat columns"
```

### Task 2: Agent key module — hash, issue, resolve

**Files:**
- Create: `backend/src/lib/missionAgentKeys.js`
- Test: `backend/src/__tests__/missionAgentKeys.test.js`

One responsibility: everything about `mission_agent_keys` rows. No Express in this file.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/missionAgentKeys.test.js
const db = require('../db');
const keys = require('../lib/missionAgentKeys');

describe('missionAgentKeys', () => {
  beforeEach(() => {
    db.run(`DELETE FROM mission_agent_keys`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
  });

  it('issues a key and resolves it to the assignee with scope', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 'test', scopes: 'agent' });
    expect(rawKey).toMatch(/^mak_[A-Za-z0-9_-]{40,}$/);
    const resolved = keys.resolveKey(rawKey);
    expect(resolved).toMatchObject({ assignee_id: 'codex', scopes: 'agent', key_id: id });
  });

  it('does not store the raw key, only the hash', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    const row = db.get(`SELECT * FROM mission_agent_keys WHERE id = ?`, id);
    expect(row.key_hash).toBe(keys.hashKey(rawKey));
    expect(row.key_hash).not.toContain(rawKey.slice(4, 20));
  });

  it('returns null for unknown or revoked keys', () => {
    expect(keys.resolveKey('mak_nope')).toBeNull();
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    keys.revokeKey(id);
    expect(keys.resolveKey(rawKey)).toBeNull();
  });

  it('stamps last_used_at on resolve', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    keys.resolveKey(rawKey);
    const row = db.get(`SELECT last_used_at FROM mission_agent_keys WHERE id = ?`, id);
    expect(row.last_used_at).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (module not found)

- [ ] **Step 3: Implement**

```js
// backend/src/lib/missionAgentKeys.js
// Per-agent Mission Control API keys. Raw key shown once at issuance;
// only the sha256 hash is stored. Lookup is by hash (indexed), so no
// timing-sensitive string compare is needed against user input.
const crypto = require('crypto');
const db = require('../db');

const SCOPES = ['agent', 'dispatcher'];

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

function issueKey({ assignee_id, label = null, scopes = 'agent' }) {
  if (!SCOPES.includes(scopes)) throw new Error(`invalid scope: ${scopes}`);
  const assignee = db.get(`SELECT id FROM mission_assignees WHERE id = ? AND active = 1`, assignee_id);
  if (!assignee) throw new Error(`unknown assignee: ${assignee_id}`);
  const rawKey = `mak_${crypto.randomBytes(32).toString('base64url')}`;
  const id = `key_${crypto.randomBytes(6).toString('hex')}`;
  db.run(
    `INSERT INTO mission_agent_keys (id, assignee_id, key_hash, label, scopes) VALUES (?, ?, ?, ?, ?)`,
    id, assignee_id, hashKey(rawKey), label, scopes
  );
  return { id, rawKey };
}

function resolveKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const row = db.get(
    `SELECT k.id AS key_id, k.assignee_id, k.scopes
     FROM mission_agent_keys k WHERE k.key_hash = ? AND k.active = 1 LIMIT 1`,
    hashKey(rawKey)
  );
  if (!row) return null;
  db.run(`UPDATE mission_agent_keys SET last_used_at = datetime('now') WHERE id = ?`, row.key_id);
  return row;
}

function revokeKey(id) {
  db.run(`UPDATE mission_agent_keys SET active = 0 WHERE id = ?`, id);
}

function listKeys() {
  return db.all(
    `SELECT id, assignee_id, label, scopes, active, created_at, last_used_at
     FROM mission_agent_keys ORDER BY created_at DESC`
  );
}

module.exports = { hashKey, issueKey, resolveKey, revokeKey, listKeys, SCOPES };
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit** — `feat(mission): per-agent key module (issue/resolve/revoke, sha256-hashed)`

### Task 3: Wire agent identity into mission auth + /me

**Files:**
- Modify: `backend/src/routes/mission.js` (auth helpers ~lines 26–115, `/me` ~line 154)
- Test: `backend/src/__tests__/missionAgentAuth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/missionAgentAuth.test.js
const db = require('../db');
const keys = require('../lib/missionAgentKeys');
const missionRouter = require('../routes/mission');
const { resolveMissionAgent } = missionRouter.__private;

describe('mission agent auth', () => {
  beforeEach(() => {
    db.run(`DELETE FROM mission_agent_keys`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
  });

  it('resolves a per-agent key from x-mission-agent-key header', () => {
    const { rawKey } = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' });
    const agent = resolveMissionAgent({ headers: { 'x-mission-agent-key': rawKey } });
    expect(agent).toMatchObject({ assignee_id: 'tito', scopes: 'agent' });
  });

  it('falls back to legacy shared env key (no assignee identity)', () => {
    process.env.MISSION_AGENT_KEY_LEGACY_TEST = 'shared-secret';
    const agent = resolveMissionAgent(
      { headers: { 'x-mission-agent-key': 'shared-secret' } },
      { legacyKey: 'shared-secret' }
    );
    expect(agent).toMatchObject({ assignee_id: null, scopes: 'legacy' });
  });

  it('returns null for garbage', () => {
    expect(resolveMissionAgent({ headers: { 'x-mission-agent-key': 'mak_bogus' } })).toBeNull();
    expect(resolveMissionAgent({ headers: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (`__private.resolveMissionAgent` undefined)

- [ ] **Step 3: Implement in `mission.js`**

Replace the body of `isMissionAgentRequest` usage with a resolver (keep the old function as a thin wrapper so existing call sites don't churn):

```js
const missionAgentKeys = require('../lib/missionAgentKeys');

// Resolve the caller's agent identity. Per-agent DB key wins; the legacy
// shared env key still authenticates (scopes:'legacy', no identity) until
// rollout step 6 retires it. Returns { assignee_id, scopes, key_id? } | null.
function resolveMissionAgent(req, { legacyKey = MISSION_AGENT_KEY } = {}) {
  const raw = req.headers && req.headers['x-mission-agent-key'];
  if (!raw) return null;
  const resolved = missionAgentKeys.resolveKey(raw);
  if (resolved) return resolved;
  if (legacyKey && timingSafeEqualString(raw, legacyKey)) {
    return { assignee_id: null, scopes: 'legacy' };
  }
  return null;
}

function isMissionAgentRequest(req) {
  return Boolean(resolveMissionAgent(req));
}
```

In `requireAuth` and `requireWriteAuth`, after auth passes, attach identity:
`req.missionAgent = resolveMissionAgent(req) || null;`

In `GET /me`, add a branch BEFORE the provider-key branch: if `req.missionAgent?.assignee_id`, return that assignee row (`SELECT id AS assignee_id, display_name, kind FROM mission_assignees WHERE id = ? AND active = 1`).

At the bottom of `mission.js` add (following the codebase's `__private` test-export pattern):

```js
router.__private = { resolveMissionAgent };
```

- [ ] **Step 4: Run test + full mission-related tests** — PASS, no regressions:
`NODE_ENV=test npx jest src/__tests__/missionAgentAuth.test.js src/__tests__/missionAgentKeys.test.js --runInBand`
- [ ] **Step 5: Commit** — `feat(mission): resolve per-agent identity in auth + /me (legacy key still valid)`

### Task 4: Claim / renew / release endpoints (atomic CAS + leases)

**Files:**
- Create: `backend/src/lib/missionClaims.js` (pure claim logic, no Express)
- Modify: `backend/src/routes/mission.js` (mount endpoints after `PATCH /tasks/:id`)
- Test: `backend/src/__tests__/missionClaims.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/missionClaims.test.js
const db = require('../db');
const claims = require('../lib/missionClaims');

function seedTask(over = {}) {
  const id = `task_${Math.random().toString(16).slice(2, 10)}`;
  db.run(
    `INSERT INTO mission_tasks (id, title, status, priority, assignee_id, claimed_by, lease_expires_at)
     VALUES (?, 'T', ?, 'p2', ?, ?, ?)`,
    id, over.status || 'todo', over.assignee_id ?? null, over.claimed_by ?? null, over.lease_expires_at ?? null
  );
  return id;
}

describe('missionClaims', () => {
  beforeEach(() => db.run(`DELETE FROM mission_tasks WHERE title = 'T'`));

  it('claims an unassigned todo task', () => {
    const id = seedTask();
    const r = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 240, now: new Date('2026-07-24T10:00:00Z') });
    expect(r.ok).toBe(true);
    const row = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('in_progress');
    expect(row.claimed_by).toBe('codex');
    expect(row.assignee_id).toBe('codex');
    expect(row.lease_expires_at).toBe('2026-07-24T14:00:00.000Z');
  });

  it('exactly one of two racing claims wins', () => {
    const id = seedTask();
    const a = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 240, now: new Date() });
    const b = claims.claimTask({ taskId: id, agentId: 'tito', ttlMinutes: 240, now: new Date() });
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(b.ok ? a.error : b.error).toBe('claimed');
  });

  it('rejects claiming a todo task assigned to someone else', () => {
    const id = seedTask({ assignee_id: 'tito' });
    const r = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date() });
    expect(r.ok).toBe(false);
  });

  it('allows reclaiming an in_progress task with an expired lease', () => {
    const id = seedTask({ status: 'in_progress', claimed_by: 'tito', lease_expires_at: '2026-01-01T00:00:00.000Z' });
    const r = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date('2026-07-24T10:00:00Z') });
    expect(r.ok).toBe(true);
  });

  it('never claims tasks in review, even with a stale lease (spec §5)', () => {
    const id = seedTask({ status: 'review', claimed_by: 'tito', lease_expires_at: '2026-01-01T00:00:00.000Z' });
    const r = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date() });
    expect(r.ok).toBe(false);
  });

  it('renew extends only the holder lease; release returns task to todo', () => {
    const id = seedTask();
    claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date('2026-07-24T10:00:00Z') });
    expect(claims.renewLease({ taskId: id, agentId: 'tito', ttlMinutes: 60, now: new Date() }).ok).toBe(false);
    expect(claims.renewLease({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date('2026-07-24T10:30:00Z') }).ok).toBe(true);
    const rel = claims.releaseTask({ taskId: id, agentId: 'codex' });
    expect(rel.ok).toBe(true);
    const row = db.get(`SELECT status, claimed_by, lease_expires_at FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('todo');
    expect(row.claimed_by).toBeNull();
    expect(row.lease_expires_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

```js
// backend/src/lib/missionClaims.js
// Atomic claim/lease semantics for mission_tasks (spec §5). Every state
// change is a single guarded UPDATE — the WHERE clause IS the lock.
const db = require('../db');

const DEFAULT_TTL_MINUTES = 240;
const MAX_TTL_MINUTES = 1440;

function leaseEnd(now, ttlMinutes) {
  const ttl = Math.min(Math.max(1, ttlMinutes || DEFAULT_TTL_MINUTES), MAX_TTL_MINUTES);
  return new Date(now.getTime() + ttl * 60_000).toISOString();
}

function claimTask({ taskId, agentId, ttlMinutes, now = new Date() }) {
  const nowIso = now.toISOString();
  const info = db.run(
    `UPDATE mission_tasks
     SET status = 'in_progress', claimed_by = ?, claimed_at = ?, assignee_id = ?,
         lease_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
       AND (
         (status = 'todo' AND (assignee_id IS NULL OR assignee_id = ?))
         OR (status IN ('in_progress','blocked')
             AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
       )`,
    agentId, nowIso, agentId, leaseEnd(now, ttlMinutes), taskId, agentId, nowIso
  );
  if (!info || info.changes !== 1) {
    const exists = db.get(`SELECT 1 FROM mission_tasks WHERE id = ?`, taskId);
    return { ok: false, error: exists ? 'claimed' : 'not_found' };
  }
  return { ok: true };
}

function renewLease({ taskId, agentId, ttlMinutes, now = new Date() }) {
  const info = db.run(
    `UPDATE mission_tasks SET lease_expires_at = ?, updated_at = datetime('now')
     WHERE id = ? AND claimed_by = ? AND status IN ('in_progress','blocked')`,
    leaseEnd(now, ttlMinutes), taskId, agentId
  );
  return info && info.changes === 1 ? { ok: true } : { ok: false, error: 'not_holder' };
}

function releaseTask({ taskId, agentId }) {
  const info = db.run(
    `UPDATE mission_tasks
     SET status = 'todo', claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         assignee_id = NULL, updated_at = datetime('now')
     WHERE id = ? AND claimed_by = ? AND status IN ('in_progress','blocked')`,
    taskId, agentId
  );
  return info && info.changes === 1 ? { ok: true } : { ok: false, error: 'not_holder' };
}

module.exports = { claimTask, renewLease, releaseTask, DEFAULT_TTL_MINUTES, MAX_TTL_MINUTES };
```

Note: `db.run` already returns better-sqlite3's info object (`{ changes }`) — verified at `db.js:2857`. No wrapper change needed.

Behavior note (intentional spec elaboration): `releaseTask` and the dispatcher lease-reset also set `assignee_id = NULL`, so released work returns to the pool rather than staying pinned to the abandoning agent. This wipes any prior manual assignment — accepted trade-off for pool semantics; admins can reassign.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Mount routes in `mission.js`** (after `PATCH /tasks/:id`; agent identity required — legacy scope allowed until retirement):

```js
const missionClaims = require('../lib/missionClaims');

function requireAgentIdentity(req, res, next) {
  if (!req.missionAgent || !req.missionAgent.assignee_id) {
    return res.status(403).json({ error: 'agent_identity_required', detail: 'per-agent x-mission-agent-key required' });
  }
  next();
}

router.post('/tasks/:id/claim', requireWriteAuth, requireAgentIdentity, (req, res) => {
  const agentId = req.missionAgent.assignee_id;
  const ttl = Number(req.query.ttl_minutes) || undefined;
  const r = missionClaims.claimTask({ taskId: req.params.id, agentId, ttlMinutes: ttl });
  if (!r.ok) return res.status(r.error === 'not_found' ? 404 : 409).json({ error: r.error });
  addComment(req.params.id, agentId, `claimed by ${agentId}`, 'claim');
  res.json({ task: db.get(`SELECT * FROM mission_tasks WHERE id = ?`, req.params.id) });
});

router.post('/tasks/:id/renew', requireWriteAuth, requireAgentIdentity, (req, res) => {
  const r = missionClaims.renewLease({ taskId: req.params.id, agentId: req.missionAgent.assignee_id,
    ttlMinutes: Number(req.query.ttl_minutes) || undefined });
  if (!r.ok) return res.status(409).json({ error: r.error });
  res.json({ ok: true });
});

router.post('/tasks/:id/release', requireWriteAuth, requireAgentIdentity, (req, res) => {
  const reason = clean(req.body?.reason, 1000);
  if (!reason) return res.status(400).json({ error: 'reason required' });
  const agentId = req.missionAgent.assignee_id;
  const r = missionClaims.releaseTask({ taskId: req.params.id, agentId });
  if (!r.ok) return res.status(409).json({ error: r.error });
  addComment(req.params.id, agentId, `released: ${reason}`, 'release');
  res.json({ ok: true });
});
```

`addComment(taskId, authorId, body, kind)` — small helper wrapping the existing comment INSERT used by `POST /tasks/:id/comments` (extract from the inline sites; reuse, don't duplicate). `mission_task_comments` columns are `(id, task_id, author_id, body, source, kind, created_at)` — the helper generates `newId('cmt')` and sets `source = 'agent'` internally.

Also in the existing `PATCH /tasks/:id` handler: when `status` transitions to `'review'`, clear the lease (`claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL`) per spec §5.

**Pool alias (spec §5 — do not skip, protocol rule 1 depends on it):** in `GET /tasks` (mission.js ~line 227), change the assignee filter to:

```js
if (req.query.assignee === 'pool') { where.push('t.assignee_id IS NULL'); }
else if (req.query.assignee) { where.push('t.assignee_id = ?'); params.push(String(req.query.assignee)); }
```

Also add an `external_id` filter (needed by the dispatcher's dedup in Task 10): `if (req.query.external_id) { where.push('t.external_id = ?'); params.push(String(req.query.external_id)); }`. Add a route test asserting `?assignee=pool` returns only unassigned tasks and `?external_id=x` filters exactly.

Add a route-level test to `missionClaims.test.js` only if the route wiring diverges from the lib (the lib tests carry the CAS logic; keep route smoke coverage for auth in Task 5's scope tests).

- [ ] **Step 6: Run full backend mission tests** — PASS
- [ ] **Step 7: Commit** — `feat(mission): atomic claim/renew/release with leases (CAS, review-safe)`

### Task 5: Scope enforcement on write routes

**Files:**
- Modify: `backend/src/routes/mission.js` (`requireWriteAuth`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, reassign, goals/milestones writes)
- Test: `backend/src/__tests__/missionScopes.test.js`

Rules (spec §5): scope `agent` → may NOT create/delete tasks, reassign, touch goals/milestones, or set `done`/`cancelled`; may PATCH only tasks it holds (`claimed_by = self`) and only fields `status` (`in_progress ↔ blocked → review`), `blocked_reason`, `source_url`. Scope `dispatcher` → additionally may POST tasks **only with non-null `external_id`**, and reset expired leases via a dedicated endpoint (Task 8). Admin/legacy → unchanged behavior.

- [ ] **Step 1: Write the failing test** — express-free: export a pure policy function.

```js
// backend/src/__tests__/missionScopes.test.js
const missionRouter = require('../routes/mission');
const { agentWritePolicy } = missionRouter.__private;

const agent = { assignee_id: 'codex', scopes: 'agent' };
const dispatcher = { assignee_id: 'nexus-dispatcher', scopes: 'dispatcher' };

describe('agentWritePolicy', () => {
  it('denies task creation for agent scope', () => {
    expect(agentWritePolicy(agent, { action: 'create_task', body: {} }).allowed).toBe(false);
  });
  it('allows dispatcher task creation only with external_id', () => {
    expect(agentWritePolicy(dispatcher, { action: 'create_task', body: { external_id: 'provider-down-7' } }).allowed).toBe(true);
    expect(agentWritePolicy(dispatcher, { action: 'create_task', body: {} }).allowed).toBe(false);
  });
  it('denies done/cancelled and foreign tasks for agent scope', () => {
    expect(agentWritePolicy(agent, { action: 'patch_task', task: { claimed_by: 'codex' }, body: { status: 'done' } }).allowed).toBe(false);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: { claimed_by: 'tito' }, body: { status: 'review' } }).allowed).toBe(false);
  });
  it('allows holder to move own task to review/blocked and back, and set source_url', () => {
    const t = { claimed_by: 'codex' };
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'review' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'blocked', blocked_reason: 'x' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'in_progress' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { source_url: 'https://github.com/x/pr/1' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { title: 'hijack' } }).allowed).toBe(false);
  });
  it('denies delete/reassign/goals/milestones for both agent scopes', () => {
    for (const who of [agent, dispatcher]) {
      for (const action of ['delete_task', 'reassign_task', 'write_goal', 'write_milestone']) {
        expect(agentWritePolicy(who, { action, body: {} }).allowed).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `agentWritePolicy` in `mission.js`** and export via `__private`:

```js
const AGENT_PATCH_FIELDS = new Set(['status', 'blocked_reason', 'source_url']);
const AGENT_STATUS_TARGETS = new Set(['in_progress', 'blocked', 'review']);

// Pure policy: what may a scoped agent do? Admin/legacy callers never
// reach this (they keep today's behavior). Returns { allowed, reason }.
function agentWritePolicy(missionAgent, { action, task = null, body = {} }) {
  const scope = missionAgent && missionAgent.scopes;
  if (action === 'create_task') {
    if (scope === 'dispatcher') {
      return body && body.external_id
        ? { allowed: true }
        : { allowed: false, reason: 'dispatcher task creation requires external_id' };
    }
    return { allowed: false, reason: 'agents may not create tasks' };
  }
  if (action === 'patch_task') {
    if (!task || task.claimed_by !== missionAgent.assignee_id) {
      return { allowed: false, reason: 'not the claim holder' };
    }
    for (const field of Object.keys(body || {})) {
      if (!AGENT_PATCH_FIELDS.has(field)) return { allowed: false, reason: `field not allowed: ${field}` };
    }
    if (body.status !== undefined && !AGENT_STATUS_TARGETS.has(body.status)) {
      return { allowed: false, reason: `status not allowed: ${body.status}` };
    }
    return { allowed: true };
  }
  return { allowed: false, reason: `action not allowed for agents: ${action}` };
}
```

Wire it: in each write route, after `requireWriteAuth`, if `req.missionAgent && req.missionAgent.assignee_id` (i.e. a scoped agent, not admin/legacy), run the policy and `403` with the reason on deny. Admin and legacy-shared-key callers bypass the policy entirely (unchanged behavior, migration safety). Add `agentWritePolicy` to `router.__private`.

**Also required here:** add `source_url` to the `PATCH /tasks/:id` `allow` map (mission.js ~lines 309–319) — it is missing today, so a PATCH carrying only `source_url` currently returns `400 no updatable fields provided`. Without this, the policy's `source_url` grant, the CLI's `review --pr`, and protocol rule 5 are all dead paths: `source_url: { fn: v => clean(v, 500) },`. Add a test: agent holder PATCHes `{ source_url }` → 200 and persisted.

- [ ] **Step 4: Run tests** — new file + Tasks 2–4 files → PASS
- [ ] **Step 5: Commit** — `feat(mission): scope enforcement for agent/dispatcher keys`

### Task 6: Heartbeat + admin key management endpoints + /protocol

**Files:**
- Modify: `backend/src/routes/mission.js`
- Create: `docs/orchestration/AGENT_PROTOCOL.md`
- Test: extend `backend/src/__tests__/missionAgentAuth.test.js`

- [ ] **Step 1: Failing tests** — heartbeat stamps `last_seen_at`/`heartbeat_state` for the calling agent (test via a small exported `recordHeartbeat(assigneeId, state)` in `__private`); protocol endpoint returns the doc.

- [ ] **Step 2: Implement** — define the helper the test targets, route delegates to it:

```js
function recordHeartbeat(assigneeId, state) {
  db.run(`UPDATE mission_assignees SET last_seen_at = datetime('now'), heartbeat_state = ? WHERE id = ?`,
    clean(state, 200) || 'idle', assigneeId);
}
// add recordHeartbeat to router.__private

router.post('/heartbeat', requireWriteAuth, requireAgentIdentity, (req, res) => {
  recordHeartbeat(req.missionAgent.assignee_id, req.body?.state);
  res.json({ ok: true });
});

// Admin-only key management
router.get('/agent-keys', requireAuth, (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'admin_only' });
  res.json({ keys: missionAgentKeys.listKeys() });
});
router.post('/agent-keys', requireAuth, (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'admin_only' });
  try {
    const { id, rawKey } = missionAgentKeys.issueKey({
      assignee_id: clean(req.body?.assignee_id, 100),
      label: clean(req.body?.label, 200),
      scopes: clean(req.body?.scopes, 50) || 'agent',
    });
    res.status(201).json({ id, key: rawKey, note: 'shown once — store it now' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.delete('/agent-keys/:id', requireAuth, (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'admin_only' });
  missionAgentKeys.revokeKey(req.params.id);
  res.json({ ok: true });
});

// Agent self-briefing (spec §8)
const fs = require('fs');
const path = require('path');
router.get('/protocol', requireAuth, (_req, res) => {
  const p = path.join(__dirname, '../../../docs/orchestration/AGENT_PROTOCOL.md');
  try { res.type('text/markdown').send(fs.readFileSync(p, 'utf8')); }
  catch { res.status(404).json({ error: 'protocol doc missing' }); }
});
```

- [ ] **Step 3: Write `docs/orchestration/AGENT_PROTOCOL.md`** — the seven rules from spec §8 verbatim, plus: endpoints cheat-sheet (poll/claim/renew/release/comment/heartbeat with curl examples), branch naming `agent/<name>/<task-id>-<slug>`, "finish = `review`, never `done`", "Telegram is never a command channel", pool = unassigned (`assignee=pool` ⇒ `assignee_id IS NULL`).

- [ ] **Step 4: Run tests** — PASS
- [ ] **Step 5: Commit** — `feat(mission): heartbeat, admin key management, /protocol endpoint + agent protocol doc`

### Task 7: Rate limiting + route-level E2E test

**Files:**
- Modify: `backend/src/middleware/rateLimiter.js`, `backend/src/routes/mission.js`
- Test: `backend/src/__tests__/missionOrchestrationE2e.test.js`

**Reality check:** there is NO existing mission-specific limiter — `/api/mission` is covered only by the catch-all `app.use('/api/', generalLimiter)` in `server.js:501`. (The spec's "existing mission limiter" phrasing is wrong; this task creates one.)

- [ ] **Step 1:** In `rateLimiter.js`, create a `missionAgentLimiter` using the file's existing `createRateLimiter` factory (follow the factory's existing call sites for options shape): claim/renew/release/agent-keys get a write-tier budget; `/heartbeat` a lenient one (expected cadence ≈1/min/agent). Mount router-level in `mission.js` on those routes only, so the general limiter still covers the rest.
- [ ] **Step 2:** Route-level E2E happy path with supertest (already a devDependency), covering spec §13: admin seeds a task → agent key claims it (`POST /claim` 200; second agent 409) → holder comments → PATCHes `{status:'review', source_url}` → lease cleared → admin sets `done`; plus: agent tries `done` → 403, revoked key → 401.
- [ ] **Step 3:** Run: `NODE_ENV=test npx jest src/__tests__/missionOrchestrationE2e.test.js --runInBand` → PASS
- [ ] **Step 4: Commit** — `feat(mission): mission rate limiter + e2e route test`

## Phase 2 — Seed roster + keys (spec §4, rollout step 2)

### Task 8: Seed script + dispatcher lease-reset endpoint

**Files:**
- Create: `backend/scripts/mission-seed-agents.js`
- Modify: `backend/src/routes/mission.js` (lease-reset endpoint for dispatcher scope)
- Test: extend `backend/src/__tests__/missionScopes.test.js`

- [ ] **Step 1: Seed script** (idempotent, runs on the VPS against the live DB via the same `db.js`):

```js
// backend/scripts/mission-seed-agents.js
// Usage: node backend/scripts/mission-seed-agents.js [--issue-keys]
const db = require('../src/db');
const keys = require('../src/lib/missionAgentKeys');

const ROSTER = [
  { id: 'codex',  name: 'Codex',  scopes: 'agent' },
  { id: 'claude', name: 'Claude', scopes: 'agent' },
  { id: 'cursor', name: 'Cursor', scopes: 'agent' },
  { id: 'nexus',  name: 'Nexus',  scopes: 'agent' },
  { id: 'tito',   name: 'Tito',   scopes: 'agent' },
  { id: 'dispatcher', name: 'Dispatcher', scopes: 'dispatcher' },
];

for (const a of ROSTER) {
  db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active) VALUES (?, ?, 'agent', 1)`, a.id, a.name);
  console.log(`assignee ok: ${a.id}`);
  if (process.argv.includes('--issue-keys')) {
    const { rawKey } = keys.issueKey({ assignee_id: a.id, label: `seed-${new Date().toISOString().slice(0,10)}`, scopes: a.scopes });
    console.log(`  KEY (${a.id}, shown once): ${rawKey}`);
  }
}
```

- [ ] **Step 2: Dispatcher lease-reset endpoint** (spec §5 — the daemon's second right; auto-comments server-side):

```js
router.post('/tasks/:id/reset-lease', requireWriteAuth, requireAgentIdentity, (req, res) => {
  if (req.missionAgent.scopes !== 'dispatcher') return res.status(403).json({ error: 'dispatcher_only' });
  const t = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, req.params.id);
  if (!t) return res.status(404).json({ error: 'not_found' });
  const info = db.run(
    `UPDATE mission_tasks
     SET status = 'todo', claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         assignee_id = NULL, updated_at = datetime('now')
     WHERE id = ? AND status IN ('in_progress','blocked')
       AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
    req.params.id, new Date().toISOString()
  );
  if (!info || info.changes !== 1) return res.status(409).json({ error: 'lease_not_expired' });
  addComment(req.params.id, req.missionAgent.assignee_id, `lease expired (was ${t.claimed_by})`, 'lease_expired');
  res.json({ ok: true });
});
```

- [ ] **Step 3: Test** — dispatcher scope can reset an expired lease, cannot reset a live one, agent scope gets 403.
- [ ] **Step 4: Commit** — `feat(mission): agent roster seed script + dispatcher lease-reset endpoint`

## Phase 3 — Dispatcher daemon (spec §6, rollout step 3)

### Task 9: Dispatcher rules engine (pure, fake-clock tested)

**Files:**
- Create: `backend/src/dispatcher/rules.js`
- Test: `backend/src/__tests__/dispatcherRules.test.js`

Pure functions: given task/assignee snapshots + provider incidents + `now` + dedup ledger, return a list of actions `{ type: 'reset_lease'|'escalate'|'notify_assignment'|'digest'|'create_repair_task', ... }`. No I/O in this file — that is what makes the rules testable and the daemon dumb.

- [ ] **Step 1: Failing tests** (representative set):

```js
// backend/src/__tests__/dispatcherRules.test.js
const { planActions } = require('../dispatcher/rules');
const NOW = new Date('2026-07-24T10:00:00Z');

const base = { id: 't1', status: 'in_progress', priority: 'p2', claimed_by: 'codex',
  lease_expires_at: '2026-07-24T09:00:00.000Z', updated_at: '2026-07-23T10:00:00.000Z',
  assignee_id: 'codex', blocked_reason: null };

describe('dispatcher rules', () => {
  it('resets expired leases', () => {
    const actions = planActions({ tasks: [base], now: NOW, ledger: {}, lastCursor: null });
    expect(actions).toContainEqual(expect.objectContaining({ type: 'reset_lease', taskId: 't1' }));
  });
  it('does not reset live leases', () => {
    const live = { ...base, lease_expires_at: '2026-07-24T11:00:00.000Z' };
    const actions = planActions({ tasks: [live], now: NOW, ledger: {}, lastCursor: null });
    expect(actions.find(a => a.type === 'reset_lease')).toBeUndefined();
  });
  it('escalates blocked >24h and p0 todo >4h, deduped per 24h', () => {
    const blocked = { ...base, id: 't2', status: 'blocked', updated_at: '2026-07-22T09:00:00.000Z', lease_expires_at: null };
    const p0 = { id: 't3', status: 'todo', priority: 'p0', updated_at: '2026-07-24T01:00:00.000Z', claimed_by: null, lease_expires_at: null };
    const first = planActions({ tasks: [blocked, p0], now: NOW, ledger: {}, lastCursor: null });
    expect(first.filter(a => a.type === 'escalate')).toHaveLength(2);
    const ledger = { 't2': NOW.toISOString(), 't3': NOW.toISOString() };
    const second = planActions({ tasks: [blocked, p0], now: NOW, ledger, lastCursor: null });
    expect(second.filter(a => a.type === 'escalate')).toHaveLength(0);
  });
  it('emits digest exactly once per day at/after 08:00 Asia/Dubai', () => {
    // 08:00 Dubai == 04:00 UTC
    const at0405 = planActions({ tasks: [], now: new Date('2026-07-24T04:05:00Z'), ledger: {}, lastCursor: null, lastDigestDate: '2026-07-23' });
    expect(at0405.find(a => a.type === 'digest')).toBeTruthy();
    const already = planActions({ tasks: [], now: new Date('2026-07-24T09:00:00Z'), ledger: {}, lastCursor: null, lastDigestDate: '2026-07-24' });
    expect(already.find(a => a.type === 'digest')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `rules.js`** — thresholds as named constants (`BLOCKED_ESCALATE_HOURS = 24`, `P0_TODO_ESCALATE_HOURS = 4`, `ESCALATE_DEDUP_HOURS = 24`, `DIGEST_HOUR_DUBAI = 8`, Dubai = UTC+4 fixed, no DST). `notify_assignment` actions come from comparing `updated_at > lastCursor` with a non-null `assignee_id` change — keep it simple: emit for tasks whose `assignee_id` is set and `updated_at > lastCursor`, dedup via ledger key `assign:<taskId>:<assignee_id>`.

  **Timestamp normalization (required, subtle prod bug otherwise):** SQLite `datetime('now')` columns (`updated_at`) come back as `YYYY-MM-DD HH:MM:SS` (UTC, no zone marker) while `lease_expires_at` is ISO `…T…Z`. `new Date('2026-07-23 10:00:00')` parses as LOCAL time in Node, and `' '` sorts before `'T'` in string compares. Rules.js must normalize every DB timestamp on entry: `const ts = s => s && new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')`. All comparisons via epoch millis, never string compare. Add a test feeding a space-format `updated_at` and asserting correct escalation behavior.

  **Repair actions (spec §6 rule 5 — part of this task):** `planActions` also receives `providerIncidents` (array of `{ external_id, title, detail }` derived from provider liveness) and existing tasks; it emits `{ type: 'create_repair_task', external_id, title, detail }` only when no task with that `external_id` exists in the snapshot. Add tests: incident with no matching task → action emitted; matching task exists (any status) → no action.
- [ ] **Step 3: Run tests** — PASS
- [ ] **Step 4: Commit** — `feat(dispatcher): pure rules engine (lease/escalation/digest/assignment)`

### Task 10: Dispatcher runner + HTTP client + provider-repair tasks

**Files:**
- Create: `backend/src/dispatcher/client.js` (thin fetch wrapper for /api/mission with the dispatcher key)
- Create: `backend/src/dispatcher/run.js` (loop)
- Test: `backend/src/__tests__/dispatcherClient.test.js` (client against a mocked fetch)

- [ ] **Step 1:** `client.js` — `getTasks(params)`, `resetLease(taskId)`, `createRepairTask({title, external_id, ...})`, `getDigest()`, all `fetch(`${BASE}/api/mission/...`, { headers: { 'x-mission-agent-key': KEY } })`, env: `MISSION_BASE_URL` (default `http://127.0.0.1:<backend port>`), `MISSION_DISPATCHER_KEY`. Failing test with `global.fetch = jest.fn()`, then implement.
- [ ] **Step 2:** `run.js` — every 5 min (`DISPATCH_INTERVAL_MS`): load state JSON (`/var/lib/dc1/mission-dispatcher-state.json`, path via env `DISPATCHER_STATE_FILE`), fetch tasks + provider liveness (reuse the existing backend provider endpoints — check `routes/providers.js` for the liveness list route), call `planActions`, execute actions via `client.js` + `telegram.js`, save state. For `create_repair_task` actions, the runner double-checks `GET /tasks?external_id=<id>` immediately before POSTing (belt-and-braces against a stale snapshot; the POST itself requires `external_id` for dispatcher scope). **`DISPATCHER_DRY_RUN=1` (default!) logs every action without executing** — rollout step 3's log-only mode. Wrap the whole tick in try/catch: log and continue (spec §12).
- [ ] **Step 3:** Manual smoke: `DISPATCHER_DRY_RUN=1 node backend/src/dispatcher/run.js --once` against local backend prints planned actions, exits 0. (`--once` flag: single tick, for smoke tests and cron-style debugging.)
- [ ] **Step 4: Commit** — `feat(dispatcher): runner loop + HTTP client, dry-run default`

### Task 11: Telegram sender (write-only bridge)

**Files:**
- Create: `backend/src/dispatcher/telegram.js`
- Test: `backend/src/__tests__/dispatcherTelegram.test.js` (mocked fetch)

- [ ] **Step 1: Failing test** — `sendToTopic('team'|'alerts', text)` posts to `https://api.telegram.org/bot<token>/sendMessage` with `chat_id`, `message_thread_id` (team=7, alerts=4 — from env `DCP_TG_CHAT_ID`, `DCP_TG_TOPIC_TEAM`, `DCP_TG_TOPIC_ALERTS`, token `DCP_TG_BOT_TOKEN`), truncates >4000 chars, returns `{ok:false}` on HTTP failure without throwing.
- [ ] **Step 2: Implement** (~40 lines). Never reads updates — send-only by construction (no `getUpdates` call exists in this module; note this in the file header comment).
- [ ] **Step 3: Run tests** — PASS
- [ ] **Step 4: Commit** — `feat(dispatcher): write-only telegram sender`

### Task 12: pm2 deployment

**Files:**
- Create: `backend/ecosystem.dispatcher.config.js`
- Modify: `DEPLOYMENT.md` (dispatcher section)

- [ ] **Step 1:** pm2 config: name `dc1-mission-dispatcher`, script `src/dispatcher/run.js`, cwd backend, `autorestart: true`, `max_memory_restart: '200M'`, env placeholders documented (NOT real values).
- [ ] **Step 2:** DEPLOYMENT.md: env var table (`MISSION_BASE_URL`, `MISSION_DISPATCHER_KEY`, `DISPATCHER_DRY_RUN`, `DISPATCHER_STATE_FILE`, TG vars), start command `pm2 start backend/ecosystem.dispatcher.config.js`, and the rollout note: run with `DISPATCHER_DRY_RUN=1` for one day, review `pm2 logs dc1-mission-dispatcher`, then flip.
- [ ] **Step 3: Commit** — `chore(dispatcher): pm2 config + deployment docs`

## Phase 4 — Agent CLI (spec §8)

### Task 13: `mission-agent` CLI helper

**Files:**
- Create: `scripts/mission-agent` (executable, plain Node, no deps)
- Test: `backend/src/__tests__/missionAgentCli.test.js` (arg-parsing unit only; network paths covered by route tests)

- [ ] **Step 1:** Commands: `poll`, `claim <task-id> [--ttl 240]`, `comment <task-id> <text>`, `renew <task-id>`, `release <task-id> --reason "<why>"`, `review <task-id> --pr <url>` (PATCH status=review + source_url), `heartbeat [--state <s>]`, `protocol`. Env: `MISSION_BASE_URL`, `MISSION_AGENT_KEY`. Output: JSON to stdout, exit 1 on non-2xx. Keep <150 lines; parse args with a tiny hand-rolled switch (matching repo convention — check `scripts/` for precedent first).
- [ ] **Step 2:** Unit-test the arg parser (export it when `require.main !== module`).
- [ ] **Step 3:** Manual smoke against local backend: seed a task as admin, then `claim → comment → review` round-trip.
- [ ] **Step 4: Commit** — `feat(mission): mission-agent CLI helper`

## Phase 5 — Admin UI Agents strip (spec §10)

### Task 14: Agents strip in admin Mission Control

**Files:**
- Modify: `app/(site)/admin/page.tsx` (Mission Control section)
- Modify: `backend/src/routes/mission.js` — extend `GET /assignees` to include `last_seen_at`, `heartbeat_state`, and each agent's current claim (`LEFT JOIN mission_tasks ON claimed_by = assignees.id AND status IN ('in_progress','blocked')`)

- [ ] **Step 1:** Extend the assignees query (backend) + verify shape in an existing-style route test or by extending `missionOrchestrationSchema.test.js` minimally.
- [ ] **Step 2:** UI: above the task board, one horizontal strip — per `kind==='agent'` assignee: name, relative last-seen (`3m ago` / `never`, red if >30 min), current claim as a link that scrolls to the task, key state dot (from `GET /agent-keys`, admin-fetched). Follow the file's existing fetch + styling patterns exactly (it already fetches `/api/mission/*` — reuse the same helper). No new page, no new dependency.
- [ ] **Step 3:** Visual check at 768/1024/1440 via existing dev flow; keyboard-focusable task links.
- [ ] **Step 4: Commit** — `feat(admin): agents strip (heartbeat, claims, key status) in mission control`

## Phase 6 — Governance + rollout (spec §9, §14)

### Task 15: Runbook + GitHub configuration checklist (non-code)

**Files:**
- Create: `docs/orchestration/ROLLOUT_RUNBOOK.md`

- [ ] **Step 1:** Write the runbook: the spec §14 six steps expanded into exact commands (seed script, key issuance + where each key goes, pm2 start, dry-run review, TG enable, per-agent onboarding check: one full claim→PR→review cycle each, legacy `MISSION_AGENT_KEY` retirement).
- [ ] **Step 2:** GitHub checklist section (checklist, NOT code — spec §9): branch protection on `main` (require PR, required review, status checks), CODEOWNERS for critical paths (`backend/src/routes/`, `security/`, `backend/src/db.js`, deploy scripts), machine-user/commit-trailer identity per agent, tier labels documented.
- [ ] **Step 3: Commit** — `docs(orchestration): rollout runbook + github governance checklist`

---

## Execution notes

- **Order is strict within Phase 1** (each task builds on the previous); Phases 3–5 are independent of each other after Phase 2 and may run in parallel worktrees if desired.
- **Deploy discipline:** backend changes ship via the established `safe-reload.sh` flow; nothing in Phases 1–2 changes behavior for existing callers (legacy key stays valid, admin UI untouched until Phase 5).
- **Out of scope:** actually onboarding external agents (runbook covers it), retiring the legacy key (runbook step 6, human-gated), Paperclip status sync (future).
