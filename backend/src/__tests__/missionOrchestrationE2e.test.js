// E2E lifecycle test for Mission Control orchestration (spec §13).
//
// Env vars MUST be set before the router is required — mission.js and
// missionAgentKeys capture them at module load. The pattern mirrors
// missionTaskRoutes.test.js lines 1-16.
process.env.MISSION_AGENT_KEY = 'legacy-e2e-shared-secret';
process.env.DC1_ADMIN_TOKEN   = 'admin-e2e-secret';

const express = require('express');
const request = require('supertest');
const db      = require('../db');
const keys    = require('../lib/missionAgentKeys');

// Require AFTER env vars are set.
const missionRouter = require('../routes/mission');

const ADMIN  = { 'x-admin-token': 'admin-e2e-secret' };
const LEGACY = { 'x-mission-agent-key': 'legacy-e2e-shared-secret' };

const app = express();
app.use(express.json());
app.use('/api/mission', missionRouter);

// ── Lifecycle E2E ──────────────────────────────────────────────────────────────
// One it() drives the full agent lifecycle:
//   admin creates → codex claims → tito conflicts → comment → PATCH review →
//   agent denied done → admin done → revoked key denied heartbeat.
describe('mission orchestration — full lifecycle (spec §13)', () => {
  let codexKey;
  let titoKey;
  let taskId;
  let codexKeyId;

  beforeAll(() => {
    // Ensure both assignees exist.
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);

    // Issue per-agent keys.
    const codexIssuance = keys.issueKey({ assignee_id: 'codex', scopes: 'agent' });
    codexKeyId = codexIssuance.id;
    codexKey   = codexIssuance.rawKey;
    titoKey    = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' }).rawKey;
  });

  afterAll(() => {
    // Clean up tasks created during this suite.
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN
            (SELECT id FROM mission_tasks WHERE title = 'E2E task')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'E2E task'`);
  });

  it('executes full agent lifecycle: create → claim → conflict → comment → review → done → revoked', async () => {
    // ── Step 1: Admin creates a task ─────────────────────────────────────
    const createRes = await request(app)
      .post('/api/mission/tasks')
      .set(ADMIN)
      .send({ title: 'E2E task', priority: 'p1' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.task).toBeTruthy();
    taskId = createRes.body.task.id;
    expect(taskId).toMatch(/^task_/);
    expect(createRes.body.task.status).toBe('todo');

    // ── Step 2: codex claims the task ────────────────────────────────────
    const claimRes = await request(app)
      .post(`/api/mission/tasks/${taskId}/claim`)
      .set({ 'x-mission-agent-key': codexKey });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.status).toBe('in_progress');
    expect(claimRes.body.task.claimed_by).toBe('codex');
    expect(claimRes.body.task.assignee_id).toBe('codex');
    expect(claimRes.body.task.lease_expires_at).toBeTruthy();

    // ── Step 3: tito tries to claim → 409 ───────────────────────────────
    const conflictRes = await request(app)
      .post(`/api/mission/tasks/${taskId}/claim`)
      .set({ 'x-mission-agent-key': titoKey });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toBeTruthy();

    // ── Step 4: codex posts a comment ────────────────────────────────────
    const commentRes = await request(app)
      .post(`/api/mission/tasks/${taskId}/comments`)
      .set({ 'x-mission-agent-key': codexKey })
      .send({ body: 'started' });

    expect(commentRes.status).toBe(201);
    expect(commentRes.body.comment).toBeTruthy();
    expect(commentRes.body.comment.body).toBe('started');

    // ── Step 5: codex PATCHes to review + source_url ─────────────────────
    const reviewRes = await request(app)
      .patch(`/api/mission/tasks/${taskId}`)
      .set({ 'x-mission-agent-key': codexKey })
      .send({
        status:     'review',
        source_url: 'https://github.com/dhnpmp-tech/dc1-platform/pull/999',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.task.status).toBe('review');
    // Lease is cleared when transitioning to review.
    expect(reviewRes.body.task.claimed_by).toBeNull();
    expect(reviewRes.body.task.lease_expires_at).toBeNull();
    // source_url persisted.
    expect(reviewRes.body.task.source_url).toBe(
      'https://github.com/dhnpmp-tech/dc1-platform/pull/999'
    );
    // Verify DB directly.
    const dbRow = db.get(`SELECT source_url FROM mission_tasks WHERE id = ?`, taskId);
    expect(dbRow.source_url).toBe('https://github.com/dhnpmp-tech/dc1-platform/pull/999');

    // ── Step 6: codex tries to PATCH status:'done' → 403 ─────────────────
    // codex no longer holds the lease (cleared at review) so agentWritePolicy
    // denies it ("not the claim holder").
    const agentDoneRes = await request(app)
      .patch(`/api/mission/tasks/${taskId}`)
      .set({ 'x-mission-agent-key': codexKey })
      .send({ status: 'done' });

    expect(agentDoneRes.status).toBe(403);
    expect(agentDoneRes.body.error).toBe('agent_scope_forbidden');

    // ── Step 7: admin PATCHes to done → 200 ─────────────────────────────
    const adminDoneRes = await request(app)
      .patch(`/api/mission/tasks/${taskId}`)
      .set(ADMIN)
      .send({ status: 'done' });

    expect(adminDoneRes.status).toBe(200);
    expect(adminDoneRes.body.task.status).toBe('done');

    // ── Step 8: revoke codex key → heartbeat → 401 ───────────────────────
    const revokeRes = await request(app)
      .delete(`/api/mission/agent-keys/${codexKeyId}`)
      .set(ADMIN);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.ok).toBe(true);

    // Revoked key is unknown → 401 (requireAuth path).
    const heartbeatRes = await request(app)
      .post('/api/mission/heartbeat')
      .set({ 'x-mission-agent-key': codexKey })
      .send({ state: 'idle' });
    expect(heartbeatRes.status).toBe(401);
  });
});

// ── Legacy shared key migration-safety guarantee ───────────────────────────────
// The shared env key must still authenticate write routes when strict mode is
// off — this is the migration-safety contract that lets existing callers keep
// working while per-agent keys roll out.
describe('mission orchestration — legacy key migration safety', () => {
  afterAll(() => {
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN
            (SELECT id FROM mission_tasks WHERE title = 'Legacy E2E task')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'Legacy E2E task'`);
  });

  it('legacy shared key can POST /tasks (admin-ish write) when strict mode is off', async () => {
    // Verify strict mode is off (default).
    const saved = process.env.DCP_MISSION_STRICT_WRITE_AUTH;
    delete process.env.DCP_MISSION_STRICT_WRITE_AUTH;

    const res = await request(app)
      .post('/api/mission/tasks')
      .set(LEGACY)
      .send({ title: 'Legacy E2E task', priority: 'p2' });

    // Restore.
    if (saved !== undefined) process.env.DCP_MISSION_STRICT_WRITE_AUTH = saved;

    expect(res.status).toBe(201);
    expect(res.body.task).toBeTruthy();
    expect(res.body.task.title).toBe('Legacy E2E task');
  });
});
