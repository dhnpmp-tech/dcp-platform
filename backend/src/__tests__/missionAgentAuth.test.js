// MISSION_AGENT_KEY must be set before requiring the router (module-level capture).
process.env.MISSION_AGENT_KEY = 'legacy-shared-secret-auth-test';
process.env.DC1_ADMIN_TOKEN   = 'admin-secret-auth-test';

const express = require('express');
const request = require('supertest');
const db = require('../db');
const keys = require('../lib/missionAgentKeys');
const missionRouter = require('../routes/mission');
const { resolveMissionAgent, recordHeartbeat } = missionRouter.__private;

const LEGACY = { 'x-mission-agent-key': 'legacy-shared-secret-auth-test' };
const ADMIN  = { 'x-admin-token': 'admin-secret-auth-test' };

const app = express();
app.use(express.json());
app.use('/api/mission', missionRouter);

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

// ── Heartbeat (unit) ──────────────────────────────────────────────────────────
describe('recordHeartbeat (unit)', () => {
  beforeEach(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
    db.run(`UPDATE mission_assignees SET last_seen_at = NULL, heartbeat_state = NULL WHERE id = 'tito'`);
  });

  it('stamps last_seen_at and heartbeat_state on the assignee row', () => {
    recordHeartbeat('tito', 'working on task_x');
    const row = db.get(`SELECT last_seen_at, heartbeat_state FROM mission_assignees WHERE id = 'tito'`);
    expect(row.last_seen_at).toBeTruthy();
    expect(row.heartbeat_state).toBe('working on task_x');
  });

  it('defaults heartbeat_state to "idle" when no state provided', () => {
    recordHeartbeat('tito', null);
    const row = db.get(`SELECT heartbeat_state FROM mission_assignees WHERE id = 'tito'`);
    expect(row.heartbeat_state).toBe('idle');
  });
});

// ── Heartbeat route ───────────────────────────────────────────────────────────
describe('POST /api/mission/heartbeat', () => {
  let agentKey;

  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
    agentKey = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' }).rawKey;
  });

  beforeEach(() => {
    db.run(`UPDATE mission_assignees SET last_seen_at = NULL, heartbeat_state = NULL WHERE id = 'tito'`);
  });

  it('per-agent key → 200 {ok:true} + columns stamped', async () => {
    const res = await request(app)
      .post('/api/mission/heartbeat')
      .set({ 'x-mission-agent-key': agentKey })
      .send({ state: 'processing task_abc' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = db.get(`SELECT last_seen_at, heartbeat_state FROM mission_assignees WHERE id = 'tito'`);
    expect(row.last_seen_at).toBeTruthy();
    expect(row.heartbeat_state).toBe('processing task_abc');
  });

  it('legacy shared key → 403 agent_identity_required', async () => {
    const res = await request(app)
      .post('/api/mission/heartbeat')
      .set(LEGACY)
      .send({ state: 'idle' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_identity_required');
  });
});

// ── Admin key management endpoints ────────────────────────────────────────────
describe('admin key management endpoints', () => {
  beforeEach(() => {
    db.run(`DELETE FROM mission_agent_keys`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
  });

  it('GET /agent-keys with admin token → 200 list', async () => {
    keys.issueKey({ assignee_id: 'tito', scopes: 'agent', label: 'ci-key' });
    const res = await request(app).get('/api/mission/agent-keys').set(ADMIN);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /agent-keys with per-agent key → 403 admin_only', async () => {
    const { rawKey } = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' });
    const res = await request(app)
      .get('/api/mission/agent-keys')
      .set({ 'x-mission-agent-key': rawKey });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });

  it('POST /agent-keys (admin) → 201 {id, key} where key starts with mak_', async () => {
    const res = await request(app)
      .post('/api/mission/agent-keys')
      .set(ADMIN)
      .send({ assignee_id: 'tito', label: 'test-key', scopes: 'agent' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.key).toMatch(/^mak_/);
    expect(res.body.note).toBeTruthy();
  });

  it('POST /agent-keys with bad scope → 400', async () => {
    const res = await request(app)
      .post('/api/mission/agent-keys')
      .set(ADMIN)
      .send({ assignee_id: 'tito', label: 'bad', scopes: 'superadmin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('DELETE /agent-keys/:id (admin) → key stops resolving', async () => {
    const { id, rawKey } = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' });
    // Verify key works before revocation
    const before = await request(app)
      .post('/api/mission/heartbeat')
      .set({ 'x-mission-agent-key': rawKey })
      .send({ state: 'pre-revoke' });
    expect(before.status).toBe(200);

    // Revoke
    const del = await request(app).delete(`/api/mission/agent-keys/${id}`).set(ADMIN);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    // Key should no longer authenticate — revoked key is unrecognized → 401
    const after = await request(app)
      .post('/api/mission/heartbeat')
      .set({ 'x-mission-agent-key': rawKey })
      .send({ state: 'post-revoke' });
    expect(after.status).toBe(401);
  });
});

// ── /protocol endpoint ────────────────────────────────────────────────────────
describe('GET /api/mission/protocol', () => {
  it('returns 200 text/markdown containing "claim"', async () => {
    const res = await request(app).get('/api/mission/protocol').set(LEGACY);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/markdown/);
    expect(res.text).toMatch(/claim/i);
  });
});
