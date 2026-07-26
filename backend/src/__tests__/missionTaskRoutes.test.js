// Route-level coverage for the claim protocol + task list filters.
// The legacy shared env key must be set BEFORE the router is required —
// mission.js captures MISSION_AGENT_KEY at module load.
process.env.MISSION_AGENT_KEY = 'legacy-shared-secret-for-tests';

const express = require('express');
const request = require('supertest');
const db = require('../db');
const keys = require('../lib/missionAgentKeys');
const missionRouter = require('../routes/mission');

const LEGACY = { 'x-mission-agent-key': 'legacy-shared-secret-for-tests' };

const app = express();
app.use(express.json());
app.use('/api/mission', missionRouter);

function seedTask(over = {}) {
  const id = `task_${Math.random().toString(16).slice(2, 10)}`;
  db.run(
    `INSERT INTO mission_tasks
     (id, title, status, priority, tier, assignee_id, claimed_by, claimed_at, lease_expires_at, external_id)
     VALUES (?, 'RT', ?, 'p2', ?, ?, ?, ?, ?, ?)`,
    id, over.status || 'todo', over.tier || 'standard', over.assignee_id ?? null,
    over.claimed_by ?? null, over.claimed_at ?? null, over.lease_expires_at ?? null, over.external_id ?? null
  );
  return id;
}

describe('mission task routes (claim protocol + filters)', () => {
  let agentKey;

  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
    agentKey = keys.issueKey({ assignee_id: 'codex', scopes: 'agent' }).rawKey;
  });

  beforeEach(() => {
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN (SELECT id FROM mission_tasks WHERE title = 'RT')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'RT'`);
  });

  it('GET /tasks?assignee=pool returns only unassigned tasks', async () => {
    const poolId = seedTask();
    seedTask({ assignee_id: 'codex' });
    const res = await request(app).get('/api/mission/tasks?assignee=pool').set(LEGACY);
    expect(res.status).toBe(200);
    const mine = res.body.tasks.filter((t) => t.title === 'RT');
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(poolId);
    expect(mine[0].assignee_id).toBeNull();
  });

  it('GET /tasks?external_id= returns only the matching task', async () => {
    const wanted = seedTask({ external_id: 'gh-issue-42' });
    seedTask({ external_id: 'gh-issue-43' });
    seedTask();
    const res = await request(app).get('/api/mission/tasks?external_id=gh-issue-42').set(LEGACY);
    expect(res.status).toBe(200);
    const matched = res.body.tasks.filter((t) => t.title === 'RT');
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(wanted);
  });

  it('POST /tasks persists a valid mission tier and defaults invalid tier to standard', async () => {
    const critical = await request(app)
      .post('/api/mission/tasks')
      .set(LEGACY)
      .send({ title: 'RT', tier: 'critical', priority: 'p1' });
    expect(critical.status).toBe(201);
    expect(critical.body.task.tier).toBe('critical');
    expect(db.get(`SELECT tier FROM mission_tasks WHERE id = ?`, critical.body.task.id).tier).toBe('critical');

    const invalid = await request(app)
      .post('/api/mission/tasks')
      .set(LEGACY)
      .send({ title: 'RT', tier: 'urgent' });
    expect(invalid.status).toBe(201);
    expect(invalid.body.task.tier).toBe('standard');
    expect(db.get(`SELECT tier FROM mission_tasks WHERE id = ?`, invalid.body.task.id).tier).toBe('standard');
  });

  it('POST /tasks/:id/claim with legacy shared key → 403 agent_identity_required', async () => {
    const id = seedTask();
    const res = await request(app).post(`/api/mission/tasks/${id}/claim`).set(LEGACY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_identity_required');
    // Task untouched
    expect(db.get(`SELECT status FROM mission_tasks WHERE id = ?`, id).status).toBe('todo');
  });

  it('POST /tasks/:id/claim with per-agent key → 200 + lease + auto-comment', async () => {
    const id = seedTask();
    const res = await request(app)
      .post(`/api/mission/tasks/${id}/claim`)
      .set({ 'x-mission-agent-key': agentKey });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('in_progress');
    expect(res.body.task.claimed_by).toBe('codex');
    expect(res.body.task.assignee_id).toBe('codex');
    expect(res.body.task.lease_expires_at).toBeTruthy();
    const cmt = db.get(
      `SELECT * FROM mission_task_comments WHERE task_id = ? AND kind = 'claim'`, id
    );
    expect(cmt).toBeTruthy();
    expect(cmt.author_id).toBe('codex');
    expect(cmt.source).toBe('agent');
    expect(cmt.body).toBe('claimed by codex');
  });

  it('POST /tasks/:id/claim on an already-claimed task → 409 claimed', async () => {
    const id = seedTask();
    await request(app).post(`/api/mission/tasks/${id}/claim`).set({ 'x-mission-agent-key': agentKey });
    const res = await request(app).post(`/api/mission/tasks/${id}/claim`).set({ 'x-mission-agent-key': agentKey });
    // Fresh lease held by codex, task is in_progress w/ unexpired lease → conflict
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('claimed');
  });

  it('POST /tasks/:id/release requires a reason and returns the task to the pool', async () => {
    const id = seedTask();
    await request(app).post(`/api/mission/tasks/${id}/claim`).set({ 'x-mission-agent-key': agentKey });
    const noReason = await request(app).post(`/api/mission/tasks/${id}/release`).set({ 'x-mission-agent-key': agentKey });
    expect(noReason.status).toBe(400);
    const res = await request(app)
      .post(`/api/mission/tasks/${id}/release`)
      .set({ 'x-mission-agent-key': agentKey })
      .send({ reason: 'context exhausted, needs a fresh session' });
    expect(res.status).toBe(200);
    const row = db.get(`SELECT status, claimed_by, assignee_id, lease_expires_at FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('todo');
    expect(row.claimed_by).toBeNull();
    expect(row.assignee_id).toBeNull();
    expect(row.lease_expires_at).toBeNull();
    const cmt = db.get(`SELECT * FROM mission_task_comments WHERE task_id = ? AND kind = 'release'`, id);
    expect(cmt).toBeTruthy();
    expect(cmt.body).toMatch(/^released: /);
  });

  it('PATCH /tasks/:id → review clears the lease', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: '2026-07-24T10:00:00.000Z',
      lease_expires_at: '2026-07-24T14:00:00.000Z',
      assignee_id: 'codex',
    });
    const res = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set(LEGACY)
      .send({ status: 'review' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('review');
    expect(res.body.task.claimed_by).toBeNull();
    expect(res.body.task.claimed_at).toBeNull();
    expect(res.body.task.lease_expires_at).toBeNull();
    // assignee_id is intentionally KEPT — review still belongs to the agent
    expect(res.body.task.assignee_id).toBe('codex');
  });

  it('PATCH /tasks/:id updates valid mission tier and ignores invalid tier', async () => {
    const id = seedTask({ tier: 'critical' });
    const low = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set(LEGACY)
      .send({ tier: 'low' });
    expect(low.status).toBe(200);
    expect(low.body.task.tier).toBe('low');

    const invalid = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set(LEGACY)
      .send({ tier: 'urgent', source_url: 'https://github.com/dhnpmp-tech/dcp-platform/pull/999' });
    expect(invalid.status).toBe(200);
    expect(invalid.body.task.tier).toBe('low');
    expect(invalid.body.task.source_url).toBe('https://github.com/dhnpmp-tech/dcp-platform/pull/999');

    const row = db.get(`SELECT tier, source_url FROM mission_tasks WHERE id = ?`, id);
    expect(row.tier).toBe('low');
    expect(row.source_url).toBe('https://github.com/dhnpmp-tech/dcp-platform/pull/999');
  });
});

// ── Assignees enrichment (heartbeat + current claim) ──────────────────────
describe('GET /assignees enrichment (heartbeat + current claim)', () => {
  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
  });

  beforeEach(() => {
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN (SELECT id FROM mission_tasks WHERE title = 'RT')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'RT'`);
    db.run(`UPDATE mission_assignees SET last_seen_at = NULL, heartbeat_state = NULL WHERE id = 'codex'`);
  });

  it('returns heartbeat fields + current claim for a claimed assignee', async () => {
    db.run(`UPDATE mission_assignees
            SET last_seen_at = '2026-07-24T10:00:00.000Z', heartbeat_state = 'working on RT'
            WHERE id = 'codex'`);
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: '2026-07-24T10:00:00.000Z',
      lease_expires_at: '2026-07-24T14:00:00.000Z',
      assignee_id: 'codex',
    });
    const res = await request(app).get('/api/mission/assignees').set(LEGACY);
    expect(res.status).toBe(200);
    const row = res.body.assignees.find((a) => a.id === 'codex');
    expect(row).toBeTruthy();
    expect(row.last_seen_at).toBe('2026-07-24T10:00:00.000Z');
    expect(row.heartbeat_state).toBe('working on RT');
    expect(row.claim_task_id).toBe(id);
    expect(row.claim_task_title).toBe('RT');
    expect(row.claim_task_status).toBe('in_progress');
    expect(row.claim_lease_expires_at).toBe('2026-07-24T14:00:00.000Z');
  });

  it('returns null claim fields for an assignee without a claim', async () => {
    const res = await request(app).get('/api/mission/assignees').set(LEGACY);
    expect(res.status).toBe(200);
    const row = res.body.assignees.find((a) => a.id === 'codex');
    expect(row).toBeTruthy();
    expect(row.last_seen_at).toBeNull();
    expect(row.heartbeat_state).toBeNull();
    expect(row.claim_task_id).toBeNull();
    expect(row.claim_task_title).toBeNull();
    expect(row.claim_task_status).toBeNull();
    expect(row.claim_lease_expires_at).toBeNull();
  });

  it('takes the newest claimed_at when multiple leases exist (defensive)', async () => {
    seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: '2026-07-24T08:00:00.000Z',
      lease_expires_at: '2026-07-24T12:00:00.000Z',
      assignee_id: 'codex',
    });
    const newest = seedTask({
      status: 'blocked',
      claimed_by: 'codex',
      claimed_at: '2026-07-24T11:00:00.000Z',
      lease_expires_at: '2026-07-24T15:00:00.000Z',
      assignee_id: 'codex',
    });
    const res = await request(app).get('/api/mission/assignees').set(LEGACY);
    expect(res.status).toBe(200);
    const row = res.body.assignees.find((a) => a.id === 'codex');
    expect(row.claim_task_id).toBe(newest);
    expect(row.claim_task_status).toBe('blocked');
  });

  it('ignores done tasks that still carry claimed_by', async () => {
    seedTask({
      status: 'done',
      claimed_by: 'codex',
      claimed_at: '2026-07-24T08:00:00.000Z',
      assignee_id: 'codex',
    });
    const res = await request(app).get('/api/mission/assignees').set(LEGACY);
    const row = res.body.assignees.find((a) => a.id === 'codex');
    expect(row.claim_task_id).toBeNull();
  });
});

// ── Dispatcher lease-reset tests ──────────────────────────────────────────
describe('dispatcher lease-reset endpoint', () => {
  let agentKey;
  let dispatcherKey;

  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('dispatcher','Dispatcher','agent',1)`);
    agentKey = keys.issueKey({ assignee_id: 'codex', scopes: 'agent' }).rawKey;
    dispatcherKey = keys.issueKey({ assignee_id: 'dispatcher', scopes: 'dispatcher' }).rawKey;
  });

  beforeEach(() => {
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN (SELECT id FROM mission_tasks WHERE title = 'RT')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'RT'`);
  });

  // (1) expired lease → 200, task back to todo, fields NULL, auto-comment
  it('dispatcher + expired lease → 200, task reset to todo + auto-comment', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: '2026-01-01T00:00:00.000Z',
      lease_expires_at: '2026-01-01T01:00:00.000Z', // expired
      assignee_id: 'codex',
    });
    const res = await request(app)
      .post(`/api/mission/tasks/${id}/reset-lease`)
      .set({ 'x-mission-agent-key': dispatcherKey });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('todo');
    expect(row.claimed_by).toBeNull();
    expect(row.claimed_at).toBeNull();
    expect(row.lease_expires_at).toBeNull();
    expect(row.assignee_id).toBeNull();
    const cmt = db.get(
      `SELECT * FROM mission_task_comments WHERE task_id = ? AND kind = 'lease_expired'`, id
    );
    expect(cmt).toBeTruthy();
    expect(cmt.body).toMatch(/lease expired \(was codex\)/);
  });

  // (2) live (unexpired) lease → 409 lease_not_expired
  it('dispatcher + live lease → 409 lease_not_expired', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min from now
      assignee_id: 'codex',
    });
    const res = await request(app)
      .post(`/api/mission/tasks/${id}/reset-lease`)
      .set({ 'x-mission-agent-key': dispatcherKey });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_not_expired');
    // Task must be untouched
    const row = db.get(`SELECT status FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('in_progress');
  });

  // (3) agent-scoped key → 403 dispatcher_only
  it('agent-scoped key → 403 dispatcher_only', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: '2026-01-01T00:00:00.000Z',
      lease_expires_at: '2026-01-01T01:00:00.000Z',
      assignee_id: 'codex',
    });
    const res = await request(app)
      .post(`/api/mission/tasks/${id}/reset-lease`)
      .set({ 'x-mission-agent-key': agentKey });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('dispatcher_only');
  });

  // (4) unknown task → 404
  it('unknown task → 404', async () => {
    const res = await request(app)
      .post('/api/mission/tasks/task_nonexistent/reset-lease')
      .set({ 'x-mission-agent-key': dispatcherKey });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

// ── Scope enforcement route-level tests ───────────────────────────────────
describe('mission scope enforcement (route-level)', () => {
  let agentKey;
  let otherKey;

  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
    agentKey = keys.issueKey({ assignee_id: 'codex', scopes: 'agent' }).rawKey;
    otherKey = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' }).rawKey;
  });

  beforeEach(() => {
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN (SELECT id FROM mission_tasks WHERE title = 'RT')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'RT'`);
  });

  // (1) agent key POST /tasks → 403 agent_scope_forbidden
  it('agent scope: POST /tasks → 403 agent_scope_forbidden', async () => {
    const res = await request(app)
      .post('/api/mission/tasks')
      .set({ 'x-mission-agent-key': agentKey })
      .send({ title: 'should not create' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_scope_forbidden');
  });

  // (2) holder PATCH {source_url} → 200 + persisted
  it('agent scope: claim holder PATCH {source_url} → 200 + persisted', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      assignee_id: 'codex',
    });
    const res = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set({ 'x-mission-agent-key': agentKey })
      .send({ source_url: 'https://github.com/dhnpmp-tech/dcp-platform/pull/99' });
    expect(res.status).toBe(200);
    expect(res.body.task.source_url).toBe('https://github.com/dhnpmp-tech/dcp-platform/pull/99');
    const row = db.get(`SELECT source_url FROM mission_tasks WHERE id = ?`, id);
    expect(row.source_url).toBe('https://github.com/dhnpmp-tech/dcp-platform/pull/99');
  });

  // (3) holder PATCH {status:'done'} → 403
  it('agent scope: claim holder PATCH {status:done} → 403 agent_scope_forbidden', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      assignee_id: 'codex',
    });
    const res = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set({ 'x-mission-agent-key': agentKey })
      .send({ status: 'done' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_scope_forbidden');
    // Task status must be unchanged
    expect(db.get(`SELECT status FROM mission_tasks WHERE id = ?`, id).status).toBe('in_progress');
  });

  // (4) non-holder agent PATCH → 403
  it('agent scope: non-holder PATCH → 403 agent_scope_forbidden', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      assignee_id: 'codex',
    });
    const res = await request(app)
      .patch(`/api/mission/tasks/${id}`)
      .set({ 'x-mission-agent-key': otherKey })  // tito, not the holder
      .send({ status: 'review' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_scope_forbidden');
  });

  // (5) agent DELETE → 403
  it('agent scope: DELETE /tasks/:id → 403 agent_scope_forbidden', async () => {
    const id = seedTask({
      status: 'in_progress',
      claimed_by: 'codex',
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      assignee_id: 'codex',
    });
    const res = await request(app)
      .delete(`/api/mission/tasks/${id}`)
      .set({ 'x-mission-agent-key': agentKey });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_scope_forbidden');
    // Task must still exist
    expect(db.get(`SELECT id FROM mission_tasks WHERE id = ?`, id)).toBeTruthy();
  });
});
