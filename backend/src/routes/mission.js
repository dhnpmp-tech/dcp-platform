// Mission Control — tasks, milestones, goals.
//
// Public read endpoints (auth: any logged-in DCP user via x-renter-key
// or admin token) and write endpoints (auth: same + x-mission-agent-key
// for agents). Single SQLite store. Designed to be both UI-friendly and
// agent-friendly: every endpoint returns JSON, every list endpoint
// accepts a status/assignee filter, every write endpoint accepts source
// metadata so we can trace WHO created what.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { isAdminRequest } = require('../middleware/auth');

// ── Auth helpers ───────────────────────────────────────────────────────
// Reads: lightweight — any valid renter key OR admin token. We treat
// this surface as internal/private (will be served from /mission UI),
// not as a billable tenant boundary like /v1.
// Writes: same as reads PLUS a separate x-mission-agent-key for bots
// posting tasks programmatically (Claude, Nexus, Tito).

const MISSION_AGENT_KEY = process.env.MISSION_AGENT_KEY || null;

function isAuthed(req) {
  // Admin (env-backed DC1_ADMIN_TOKEN, timing-safe compare via shared helper)
  if (isAdminRequest(req)) return true;
  // Renter API key (matches v1 inference path auth surface)
  const renterKey = req.headers['x-renter-key'] || req.query.key;
  if (renterKey) {
    try {
      const row = db.get(
        `SELECT 1 FROM renter_api_keys WHERE key = ? AND revoked_at IS NULL LIMIT 1`,
        renterKey
      );
      if (row) return true;
    } catch (_) { /* renter_api_keys may not exist in some env */ }
  }
  // Dedicated agent key (off unless MISSION_AGENT_KEY env is set)
  if (MISSION_AGENT_KEY && req.headers['x-mission-agent-key'] === MISSION_AGENT_KEY) return true;
  return false;
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ── ID + validation helpers ────────────────────────────────────────────
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
function clean(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}
function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
const TASK_STATUSES    = ['todo','in_progress','blocked','review','done','cancelled'];
const TASK_PRIORITIES  = ['p0','p1','p2','p3'];
const GOAL_STATUSES    = ['active','paused','done','dropped'];
const MS_STATUSES      = ['planned','in_progress','done','dropped'];

// ── Assignees ──────────────────────────────────────────────────────────
router.get('/assignees', requireAuth, (req, res) => {
  const rows = db.all(
    `SELECT id, display_name, kind, avatar_url, external_id, active
     FROM mission_assignees WHERE active = 1
     ORDER BY kind, display_name`
  );
  res.json({ assignees: rows });
});

// ── Tasks ──────────────────────────────────────────────────────────────
router.get('/tasks', requireAuth, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    const statuses = String(req.query.status).split(',').filter(s => TASK_STATUSES.includes(s));
    if (statuses.length) {
      where.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (req.query.assignee) { where.push('assignee_id = ?'); params.push(String(req.query.assignee)); }
  if (req.query.goal)     { where.push('goal_id = ?');     params.push(String(req.query.goal)); }
  if (req.query.milestone){ where.push('milestone_id = ?');params.push(String(req.query.milestone)); }
  const sql = `
    SELECT t.*,
           a.display_name AS assignee_name,
           a.kind         AS assignee_kind,
           m.name         AS milestone_name,
           g.title        AS goal_title
    FROM mission_tasks t
    LEFT JOIN mission_assignees  a ON a.id = t.assignee_id
    LEFT JOIN mission_milestones m ON m.id = t.milestone_id
    LEFT JOIN mission_goals      g ON g.id = t.goal_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE t.status
        WHEN 'in_progress' THEN 0
        WHEN 'review'      THEN 1
        WHEN 'blocked'     THEN 2
        WHEN 'todo'        THEN 3
        WHEN 'done'        THEN 4
        WHEN 'cancelled'   THEN 5
      END,
      CASE t.priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 END,
      t.due_date IS NULL,
      t.due_date ASC,
      t.updated_at DESC`;
  const rows = db.all(sql, ...params);
  res.json({ tasks: rows });
});

router.post('/tasks', requireAuth, (req, res) => {
  const title = clean(req.body?.title, 300);
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = newId('task');
  const status   = oneOf(req.body?.status,   TASK_STATUSES,   'todo');
  const priority = oneOf(req.body?.priority, TASK_PRIORITIES, 'p2');
  const fields = {
    id,
    title,
    description:    clean(req.body?.description, 8000),
    status,
    priority,
    assignee_id:    clean(req.body?.assignee_id, 100),
    milestone_id:   clean(req.body?.milestone_id, 100),
    goal_id:        clean(req.body?.goal_id, 100),
    created_by:     clean(req.body?.created_by, 100),
    due_date:       isoOrNull(req.body?.due_date),
    blocked_reason: clean(req.body?.blocked_reason, 1000),
    source:         clean(req.body?.source, 50),
    source_url:     clean(req.body?.source_url, 500),
    external_id:    clean(req.body?.external_id, 200),
  };
  db.run(
    `INSERT INTO mission_tasks
     (id, title, description, status, priority, assignee_id, milestone_id, goal_id,
      created_by, due_date, blocked_reason, source, source_url, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fields.id, fields.title, fields.description, fields.status, fields.priority,
    fields.assignee_id, fields.milestone_id, fields.goal_id,
    fields.created_by, fields.due_date, fields.blocked_reason,
    fields.source, fields.source_url, fields.external_id
  );
  const task = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, id);
  res.status(201).json({ task });
});

router.patch('/tasks/:id', requireAuth, (req, res) => {
  const existing = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const sets = [];
  const params = [];
  const allow = {
    title:          { fn: v => clean(v, 300) },
    description:    { fn: v => clean(v, 8000) },
    status:         { fn: v => oneOf(v, TASK_STATUSES, null) },
    priority:       { fn: v => oneOf(v, TASK_PRIORITIES, null) },
    assignee_id:    { fn: v => clean(v, 100) },
    milestone_id:   { fn: v => clean(v, 100) },
    goal_id:        { fn: v => clean(v, 100) },
    due_date:       { fn: v => isoOrNull(v) },
    blocked_reason: { fn: v => clean(v, 1000) },
  };
  for (const [k, { fn }] of Object.entries(allow)) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
      const val = fn(req.body[k]);
      // Allow explicit null (clearing a field) but skip undefined/invalid enum
      if (val !== undefined) {
        sets.push(`${k} = ?`);
        params.push(val);
      }
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields provided' });
  // Auto-stamp completed_at when transitioning to done.
  if (req.body?.status === 'done' && existing.status !== 'done') {
    sets.push(`completed_at = datetime('now')`);
  }
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.run(`UPDATE mission_tasks SET ${sets.join(', ')} WHERE id = ?`, ...params);
  const task = db.get(`SELECT * FROM mission_tasks WHERE id = ?`, req.params.id);
  res.json({ task });
});

router.delete('/tasks/:id', requireAuth, (req, res) => {
  const r = db.run(`DELETE FROM mission_tasks WHERE id = ?`, req.params.id);
  res.json({ deleted: r.changes > 0 });
});

router.post('/tasks/:id/comments', requireAuth, (req, res) => {
  const task = db.get(`SELECT id FROM mission_tasks WHERE id = ?`, req.params.id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  const body = clean(req.body?.body, 8000);
  if (!body) return res.status(400).json({ error: 'body required' });
  const id = newId('cmt');
  db.run(
    `INSERT INTO mission_task_comments (id, task_id, author_id, body) VALUES (?, ?, ?, ?)`,
    id, req.params.id, clean(req.body?.author_id, 100), body
  );
  res.status(201).json({ comment: db.get(`SELECT * FROM mission_task_comments WHERE id = ?`, id) });
});

router.get('/tasks/:id/comments', requireAuth, (req, res) => {
  const rows = db.all(
    `SELECT c.*, a.display_name AS author_name, a.kind AS author_kind
     FROM mission_task_comments c
     LEFT JOIN mission_assignees a ON a.id = c.author_id
     WHERE c.task_id = ?
     ORDER BY c.created_at ASC`,
    req.params.id
  );
  res.json({ comments: rows });
});

// ── Milestones ─────────────────────────────────────────────────────────
router.get('/milestones', requireAuth, (req, res) => {
  const rows = db.all(
    `SELECT m.*, g.title AS goal_title,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.milestone_id = m.id) AS task_count,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.milestone_id = m.id AND t.status = 'done') AS done_count
     FROM mission_milestones m
     LEFT JOIN mission_goals g ON g.id = m.goal_id
     ORDER BY m.target_date IS NULL, m.target_date ASC, m.created_at DESC`
  );
  res.json({ milestones: rows });
});

router.post('/milestones', requireAuth, (req, res) => {
  const name = clean(req.body?.name, 200);
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = newId('ms');
  db.run(
    `INSERT INTO mission_milestones (id, goal_id, name, description, status, target_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    clean(req.body?.goal_id, 100),
    name,
    clean(req.body?.description, 4000),
    oneOf(req.body?.status, MS_STATUSES, 'planned'),
    isoOrNull(req.body?.target_date)
  );
  res.status(201).json({ milestone: db.get(`SELECT * FROM mission_milestones WHERE id = ?`, id) });
});

router.patch('/milestones/:id', requireAuth, (req, res) => {
  const existing = db.get(`SELECT * FROM mission_milestones WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const sets = [];
  const params = [];
  if (req.body?.name !== undefined) { sets.push('name = ?'); params.push(clean(req.body.name, 200)); }
  if (req.body?.description !== undefined) { sets.push('description = ?'); params.push(clean(req.body.description, 4000)); }
  if (req.body?.status !== undefined) { sets.push('status = ?'); params.push(oneOf(req.body.status, MS_STATUSES, existing.status)); }
  if (req.body?.target_date !== undefined) { sets.push('target_date = ?'); params.push(isoOrNull(req.body.target_date)); }
  if (req.body?.goal_id !== undefined) { sets.push('goal_id = ?'); params.push(clean(req.body.goal_id, 100)); }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields' });
  if (req.body?.status === 'done' && existing.status !== 'done') sets.push(`completed_at = datetime('now')`);
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.run(`UPDATE mission_milestones SET ${sets.join(', ')} WHERE id = ?`, ...params);
  res.json({ milestone: db.get(`SELECT * FROM mission_milestones WHERE id = ?`, req.params.id) });
});

// ── Goals ──────────────────────────────────────────────────────────────
router.get('/goals', requireAuth, (req, res) => {
  const rows = db.all(
    `SELECT g.*, a.display_name AS owner_name,
            (SELECT COUNT(*) FROM mission_milestones m WHERE m.goal_id = g.id) AS milestone_count,
            (SELECT COUNT(*) FROM mission_milestones m WHERE m.goal_id = g.id AND m.status = 'done') AS milestone_done,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id) AS task_count,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id AND t.status = 'done') AS task_done
     FROM mission_goals g
     LEFT JOIN mission_assignees a ON a.id = g.owner_id
     ORDER BY g.target_date IS NULL, g.target_date ASC, g.created_at DESC`
  );
  res.json({ goals: rows });
});

router.post('/goals', requireAuth, (req, res) => {
  const title = clean(req.body?.title, 300);
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = newId('goal');
  db.run(
    `INSERT INTO mission_goals (id, title, description, owner_id, status, target_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    title,
    clean(req.body?.description, 8000),
    clean(req.body?.owner_id, 100),
    oneOf(req.body?.status, GOAL_STATUSES, 'active'),
    isoOrNull(req.body?.target_date)
  );
  res.status(201).json({ goal: db.get(`SELECT * FROM mission_goals WHERE id = ?`, id) });
});

router.patch('/goals/:id', requireAuth, (req, res) => {
  const existing = db.get(`SELECT * FROM mission_goals WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const sets = [];
  const params = [];
  if (req.body?.title !== undefined) { sets.push('title = ?'); params.push(clean(req.body.title, 300)); }
  if (req.body?.description !== undefined) { sets.push('description = ?'); params.push(clean(req.body.description, 8000)); }
  if (req.body?.owner_id !== undefined) { sets.push('owner_id = ?'); params.push(clean(req.body.owner_id, 100)); }
  if (req.body?.status !== undefined) { sets.push('status = ?'); params.push(oneOf(req.body.status, GOAL_STATUSES, existing.status)); }
  if (req.body?.target_date !== undefined) { sets.push('target_date = ?'); params.push(isoOrNull(req.body.target_date)); }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields' });
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.run(`UPDATE mission_goals SET ${sets.join(', ')} WHERE id = ?`, ...params);
  res.json({ goal: db.get(`SELECT * FROM mission_goals WHERE id = ?`, req.params.id) });
});

// ── Overview snapshot (drives the Mission Control home view) ───────────
router.get('/overview', requireAuth, (req, res) => {
  const counts = {};
  for (const s of TASK_STATUSES) {
    counts[s] = (db.get(`SELECT COUNT(*) AS c FROM mission_tasks WHERE status = ?`, s)?.c) || 0;
  }
  const today  = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status IN ('in_progress','review') OR
           (t.due_date IS NOT NULL AND t.due_date <= datetime('now','+1 day') AND t.status NOT IN ('done','cancelled'))
     ORDER BY
       CASE t.status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,
       CASE t.priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 END,
       t.due_date IS NULL, t.due_date ASC
     LIMIT 20`
  );
  const blocked = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'blocked' ORDER BY t.updated_at DESC LIMIT 10`
  );
  const recent_done = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'done' ORDER BY t.completed_at DESC LIMIT 10`
  );
  const goals = db.all(
    `SELECT g.*,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id) AS task_count,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id AND t.status = 'done') AS task_done
     FROM mission_goals g WHERE g.status = 'active'
     ORDER BY g.target_date IS NULL, g.target_date ASC LIMIT 6`
  );
  res.json({
    counts,
    today,
    blocked,
    recent_done,
    active_goals: goals,
    generated_at: new Date().toISOString(),
  });
});

module.exports = router;
