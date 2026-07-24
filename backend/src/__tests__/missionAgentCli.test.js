// Parser tests for the mission-agent CLI (Task 13).
//
// Parser module decision: we require `scripts/mission-agent-lib.js` (the
// pure-parser module) rather than the extensionless `scripts/mission-agent`
// entrypoint. Requiring an extensionless file is legal in Node/Jest but
// requires a manual path trick; keeping the parser in its own `.js` module is
// cleaner, more conventional, and avoids any Jest transformer edge-cases.
//
// The entrypoint (`scripts/mission-agent`) re-exports parseArgs for symmetry:
//   const { parseArgs } = require('../../../scripts/mission-agent-lib');
//
'use strict';

const path = require('path');
const { parseArgs } = require(path.resolve(__dirname, '../../../scripts/mission-agent-lib'));

describe('parseArgs — no-arg / help', () => {
  it('returns { cmd: "help" } with zero args', () => {
    expect(parseArgs([])).toEqual({ cmd: 'help' });
  });

  it('returns { cmd: "help" } for explicit "help"', () => {
    expect(parseArgs(['help'])).toEqual({ cmd: 'help' });
  });

  it('returns { cmd: "help", error: ... } for unknown command', () => {
    const r = parseArgs(['frobulate']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/unknown command/);
  });
});

describe('parseArgs — poll / digest / protocol', () => {
  it('poll', () => expect(parseArgs(['poll'])).toEqual({ cmd: 'poll' }));
  it('digest', () => expect(parseArgs(['digest'])).toEqual({ cmd: 'digest' }));
  it('protocol', () => expect(parseArgs(['protocol'])).toEqual({ cmd: 'protocol' }));
});

describe('parseArgs — claim', () => {
  it('claim task_abc', () => {
    expect(parseArgs(['claim', 'task_abc'])).toEqual({
      cmd: 'claim', taskId: 'task_abc', flags: {},
    });
  });

  it('claim with --ttl', () => {
    const r = parseArgs(['claim', 'task_abc', '--ttl', '45']);
    expect(r).toMatchObject({ cmd: 'claim', taskId: 'task_abc', flags: { ttl: 45 } });
  });

  it('claim missing task-id → error', () => {
    const r = parseArgs(['claim']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/task-id required/);
  });
});

describe('parseArgs — comment', () => {
  it('joins remaining args as text', () => {
    const r = parseArgs(['comment', 'task_abc', 'fixed', 'the', 'bug']);
    expect(r).toEqual({ cmd: 'comment', taskId: 'task_abc', text: 'fixed the bug' });
  });

  it('comment missing text → error', () => {
    const r = parseArgs(['comment', 'task_abc']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/text required/);
  });

  it('comment missing task-id → error', () => {
    const r = parseArgs(['comment']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/task-id required/);
  });
});

describe('parseArgs — renew', () => {
  it('renew without ttl', () => {
    expect(parseArgs(['renew', 'task_abc'])).toEqual({
      cmd: 'renew', taskId: 'task_abc', flags: {},
    });
  });

  it('renew with --ttl', () => {
    const r = parseArgs(['renew', 'task_abc', '--ttl', '30']);
    expect(r).toMatchObject({ cmd: 'renew', taskId: 'task_abc', flags: { ttl: 30 } });
  });
});

describe('parseArgs — release', () => {
  it('release with single-word reason', () => {
    const r = parseArgs(['release', 'task_abc', '--reason', 'blocked']);
    expect(r).toEqual({ cmd: 'release', taskId: 'task_abc', flags: { reason: 'blocked' } });
  });

  it('release with multi-word reason', () => {
    const r = parseArgs(['release', 'task_abc', '--reason', 'need', 'more', 'context']);
    expect(r.flags.reason).toBe('need more context');
  });

  it('release missing --reason → error', () => {
    const r = parseArgs(['release', 'task_abc']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/--reason/);
  });
});

describe('parseArgs — review', () => {
  it('review without --pr', () => {
    expect(parseArgs(['review', 'task_abc'])).toEqual({
      cmd: 'review', taskId: 'task_abc', flags: {},
    });
  });

  it('review with --pr url', () => {
    const r = parseArgs(['review', 'task_abc', '--pr', 'https://github.com/org/repo/pull/42']);
    expect(r.flags.pr).toBe('https://github.com/org/repo/pull/42');
  });
});

describe('parseArgs — block', () => {
  it('block with reason', () => {
    const r = parseArgs(['block', 'task_abc', '--reason', 'waiting on CI']);
    expect(r).toEqual({ cmd: 'block', taskId: 'task_abc', flags: { reason: 'waiting on CI' } });
  });

  it('block missing --reason → error', () => {
    const r = parseArgs(['block', 'task_abc']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/--reason/);
  });
});

describe('parseArgs — resume', () => {
  it('resume task_abc', () => {
    expect(parseArgs(['resume', 'task_abc'])).toEqual({ cmd: 'resume', taskId: 'task_abc' });
  });

  it('resume missing task-id → error', () => {
    const r = parseArgs(['resume']);
    expect(r.cmd).toBe('help');
    expect(r.error).toMatch(/task-id required/);
  });
});

describe('parseArgs — heartbeat', () => {
  it('heartbeat without state', () => {
    const r = parseArgs(['heartbeat']);
    expect(r).toMatchObject({ cmd: 'heartbeat', flags: {} });
    expect(r.flags.state).toBeUndefined();
  });

  it('heartbeat with --state', () => {
    const r = parseArgs(['heartbeat', '--state', 'working on task_abc']);
    expect(r.flags.state).toBe('working on task_abc');
  });
});

// ── Supertest smoke — CLI commands hit the real router ─────────────────────
// We drive the commands through the HTTP layer (supertest) rather than
// spawning child processes so that the test environment's in-memory SQLite
// stays in scope. This verifies the curl-equivalent behaviour without needing
// a live server or shell exec.

process.env.MISSION_AGENT_KEY = 'legacy-cli-test-secret';
process.env.DC1_ADMIN_TOKEN   = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';

const express = require('express');
const request = require('supertest');
const db      = require('../db');
const keys    = require('../lib/missionAgentKeys');
const missionRouter = require('../routes/mission');

const app = express();
app.use(express.json());
app.use('/api/mission', missionRouter);

describe('mission-agent HTTP smoke (supertest)', () => {
  let agentKey;
  let taskId;

  beforeAll(() => {
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('smoke-agent','Smoke Agent','agent',1)`);
    agentKey = keys.issueKey({ assignee_id: 'smoke-agent', scopes: 'agent' }).rawKey;
  });

  beforeEach(() => {
    // Clean up any tasks created by previous smoke runs
    db.run(`DELETE FROM mission_task_comments WHERE task_id IN
            (SELECT id FROM mission_tasks WHERE title = 'CLI smoke task')`);
    db.run(`DELETE FROM mission_tasks WHERE title = 'CLI smoke task'`);
  });

  it('poll — GET /me + GET /tasks returns shape { mine, pool }', async () => {
    // Seed a pool task
    db.run(`INSERT INTO mission_tasks (id, title, status, priority) VALUES ('pool_smoke_1','CLI smoke task','todo','p2')`);

    // /me with per-agent key
    const meRes = await request(app)
      .get('/api/mission/me')
      .set({ 'x-mission-agent-key': agentKey });
    expect(meRes.status).toBe(200);
    expect(meRes.body.assignee.assignee_id).toBe('smoke-agent');

    // pool tasks
    const poolRes = await request(app)
      .get('/api/mission/tasks?assignee=pool&status=todo')
      .set({ 'x-mission-agent-key': agentKey });
    expect(poolRes.status).toBe(200);
    const poolMatch = poolRes.body.tasks.filter(t => t.id === 'pool_smoke_1');
    expect(poolMatch).toHaveLength(1);
  });

  it('claim — POST /tasks/:id/claim assigns lease', async () => {
    db.run(`INSERT INTO mission_tasks (id, title, status, priority) VALUES ('cli_claim_1','CLI smoke task','todo','p2')`);
    taskId = 'cli_claim_1';

    const res = await request(app)
      .post(`/api/mission/tasks/${taskId}/claim`)
      .set({ 'x-mission-agent-key': agentKey });
    expect(res.status).toBe(200);
    expect(res.body.task.claimed_by).toBe('smoke-agent');
    expect(res.body.task.status).toBe('in_progress');
  });

  it('comment — POST /tasks/:id/comments persists body', async () => {
    db.run(`INSERT INTO mission_tasks (id, title, status, priority, claimed_by, lease_expires_at)
            VALUES ('cli_cmt_1','CLI smoke task','in_progress','p2','smoke-agent', datetime('now','+60 minutes'))`);

    const res = await request(app)
      .post('/api/mission/tasks/cli_cmt_1/comments')
      .set({ 'x-mission-agent-key': agentKey })
      .send({ body: 'smoke comment text' });
    expect(res.status).toBe(201);
    expect(res.body.comment.body).toBe('smoke comment text');
  });

  it('review — PATCH /tasks/:id with status:review clears lease', async () => {
    db.run(`INSERT INTO mission_tasks (id, title, status, priority, claimed_by, lease_expires_at)
            VALUES ('cli_rev_1','CLI smoke task','in_progress','p2','smoke-agent', datetime('now','+60 minutes'))`);

    const res = await request(app)
      .patch('/api/mission/tasks/cli_rev_1')
      .set({ 'x-mission-agent-key': agentKey })
      .send({ status: 'review', source_url: 'https://github.com/org/repo/pull/99' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('review');
    expect(res.body.task.source_url).toBe('https://github.com/org/repo/pull/99');
    expect(res.body.task.claimed_by).toBeNull();
  });

  it('heartbeat — POST /heartbeat stamps last_seen_at', async () => {
    const res = await request(app)
      .post('/api/mission/heartbeat')
      .set({ 'x-mission-agent-key': agentKey })
      .send({ state: 'idle' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = db.get(`SELECT last_seen_at, heartbeat_state FROM mission_assignees WHERE id = 'smoke-agent'`);
    expect(row.heartbeat_state).toBe('idle');
    expect(row.last_seen_at).toBeTruthy();
  });
});
