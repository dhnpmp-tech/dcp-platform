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

  it('never claims tasks in review, even with a stale lease', () => {
    const id = seedTask({ status: 'review', claimed_by: 'tito', lease_expires_at: '2026-01-01T00:00:00.000Z' });
    const r = claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date() });
    expect(r.ok).toBe(false);
  });

  it('unknown task id → not_found', () => {
    const r = claims.claimTask({ taskId: 'task_missing', agentId: 'codex', ttlMinutes: 60, now: new Date() });
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('renew extends only the holder lease; release returns task to todo', () => {
    const id = seedTask();
    claims.claimTask({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date('2026-07-24T10:00:00Z') });
    expect(claims.renewLease({ taskId: id, agentId: 'tito', ttlMinutes: 60, now: new Date() }).ok).toBe(false);
    expect(claims.renewLease({ taskId: id, agentId: 'codex', ttlMinutes: 60, now: new Date('2026-07-24T10:30:00Z') }).ok).toBe(true);
    const rel = claims.releaseTask({ taskId: id, agentId: 'codex' });
    expect(rel.ok).toBe(true);
    const row = db.get(`SELECT status, claimed_by, lease_expires_at, assignee_id FROM mission_tasks WHERE id = ?`, id);
    expect(row.status).toBe('todo');
    expect(row.claimed_by).toBeNull();
    expect(row.lease_expires_at).toBeNull();
    expect(row.assignee_id).toBeNull();
  });
});
