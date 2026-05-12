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
  // Provider API key — Mission Control is an internal team surface.
  // Tareq + Fadi are providers; this lets them stay signed in normally
  // (no need to swap sessions to admin just to see the board).
  const providerKey = req.headers['x-provider-key'];
  if (providerKey) {
    try {
      const row = db.get(
        `SELECT 1 FROM providers WHERE api_key = ? AND deleted_at IS NULL LIMIT 1`,
        providerKey
      );
      if (row) return true;
    } catch (_) { /* providers table column may differ */ }
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

// ── On-me view (drives the "blocked on me" + "my queue" cards) ─────────
router.get('/on-me/:assignee_id', requireAuth, (req, res) => {
  const id = String(req.params.assignee_id);
  const queue = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind, g.title AS goal_title
     FROM mission_tasks t
     LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     LEFT JOIN mission_goals g ON g.id = t.goal_id
     WHERE (t.assignee_id = ? AND t.status IN ('todo','in_progress','review','blocked'))
        OR (t.blocked_reason IS NOT NULL AND lower(t.blocked_reason) LIKE '%' || lower(?) || '%' AND t.status NOT IN ('done','cancelled'))
     ORDER BY
       CASE t.status WHEN 'blocked' THEN 0 WHEN 'review' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
       CASE t.priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END,
       t.due_date IS NULL, t.due_date ASC, t.updated_at DESC
     LIMIT 30`,
    id, id
  );
  const decisions = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'blocked' AND t.priority IN ('p0','p1')
       AND (t.blocked_reason IS NOT NULL AND lower(t.blocked_reason) LIKE '%' || lower(?) || '%')
     ORDER BY t.priority, t.updated_at DESC LIMIT 10`,
    id
  );
  res.json({ assignee_id: id, queue, decisions });
});

// ── 24h pulse (what shipped + what moved + what came in) ───────────────
router.get('/pulse', requireAuth, (req, res) => {
  const sinceHours = Math.max(1, Math.min(168, Number(req.query.hours) || 24));
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const shipped = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'done' AND t.completed_at >= ? ORDER BY t.completed_at DESC LIMIT 25`,
    since
  );
  const created = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.created_at >= ? ORDER BY t.created_at DESC LIMIT 25`,
    since
  );
  const moved = db.all(
    `SELECT t.*, a.display_name AS assignee_name, a.kind AS assignee_kind
     FROM mission_tasks t LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.updated_at >= ? AND t.status NOT IN ('done','cancelled')
       AND t.created_at < ?
     ORDER BY t.updated_at DESC LIMIT 25`,
    since, since
  );
  res.json({ since, hours: sinceHours, shipped, created, moved });
});

// ── GitHub repo activity (read-only proxy w/ in-memory TTL cache) ──────
// Hardcoded short list of repos we care about. Unauthenticated GitHub API
// (60 req/hr per IP — plenty for 3-5 repos cached 60s). If GITHUB_TOKEN
// env is set, uses it for the 5k/hr authenticated quota.
const TRACKED_REPOS = [
  { slug: 'dhnpmp-tech/dc1-platform', label: 'dc1-platform', tagline: 'Backend + Next.js' },
  { slug: 'dhnpmp-tech/dcp-agent',    label: 'dcp-agent',    tagline: 'Agent runtime' },
  { slug: 'dhnpmp-tech/dcp-desktop',  label: 'dcp-desktop',  tagline: 'Provider Tauri app' },
];
const _repoCache = new Map(); // slug -> { fetchedAt, data }
const REPO_TTL_MS = 60 * 1000;

async function fetchRepoMeta(slug) {
  const cached = _repoCache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < REPO_TTL_MS) return cached.data;
  const headers = { 'User-Agent': 'dcp-mission-control', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let data = { slug, error: null };
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${slug}`, { headers, signal: AbortSignal.timeout(4000) });
    if (!repoRes.ok) {
      data.error = `HTTP ${repoRes.status}`;
    } else {
      const repo = await repoRes.json();
      data.default_branch = repo.default_branch;
      data.pushed_at = repo.pushed_at;
      data.open_issues = repo.open_issues_count;
      data.stargazers = repo.stargazers_count;
      const commitsRes = await fetch(`https://api.github.com/repos/${slug}/commits?per_page=1`, { headers, signal: AbortSignal.timeout(4000) });
      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        if (Array.isArray(commits) && commits[0]) {
          data.last_commit = {
            sha: commits[0].sha?.slice(0, 7),
            message: (commits[0].commit?.message || '').split('\n')[0].slice(0, 140),
            author: commits[0].commit?.author?.name || commits[0].author?.login || '',
            date: commits[0].commit?.author?.date || commits[0].commit?.committer?.date,
            url: commits[0].html_url,
          };
        }
      }
    }
  } catch (e) {
    data.error = e?.message || 'fetch failed';
  }
  _repoCache.set(slug, { fetchedAt: Date.now(), data });
  return data;
}

router.get('/repos', requireAuth, async (req, res) => {
  const result = await Promise.all(TRACKED_REPOS.map(async (r) => ({
    ...r, ...(await fetchRepoMeta(r.slug)),
  })));
  res.json({ repos: result, generated_at: new Date().toISOString() });
});

// ── PR state for a list of source_urls (one call, N parallel fetches) ──
// Frontend calls this with the GitHub URLs from tasks with source_url, gets
// back the current open/merged/draft/closed state + CI conclusion. Saves
// fetching them client-side and exposing GitHub rate limits to browsers.
const _prCache = new Map();
const PR_TTL_MS = 120 * 1000;

async function fetchPRState(url) {
  const cached = _prCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < PR_TTL_MS) return cached.data;
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) return { url, error: 'not a PR url' };
  const headers = { 'User-Agent': 'dcp-mission-control', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let data = { url, error: null };
  try {
    const r = await fetch(`https://api.github.com/repos/${m[1]}/pulls/${m[2]}`, { headers, signal: AbortSignal.timeout(4000) });
    if (!r.ok) {
      data.error = `HTTP ${r.status}`;
    } else {
      const pr = await r.json();
      data.number = pr.number;
      data.state = pr.merged ? 'merged' : pr.draft ? 'draft' : pr.state; // open | closed | merged | draft
      data.title = pr.title;
    }
  } catch (e) {
    data.error = e?.message || 'fetch failed';
  }
  _prCache.set(url, { fetchedAt: Date.now(), data });
  return data;
}

router.post('/pr-state', requireAuth, async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter((u) => typeof u === 'string').slice(0, 30) : [];
  const results = await Promise.all(urls.map(fetchPRState));
  res.json({ results });
});

// ── Files (Nextcloud quick-links) ──────────────────────────────────────
// No WebDAV credentials shipped — UI just renders curated deep-links into
// the Nextcloud instance. Cheaper than embedding the filebrowser, zero
// auth risk. Edit FILE_LINKS to add new shortcuts.
const FILE_LINKS = [
  { label: 'Engineering reports', path: '/apps/files/?dir=/DCP/Reports', kind: 'folder' },
  { label: 'Benchmarks',          path: '/apps/files/?dir=/DCP/Benchmarks', kind: 'folder' },
  { label: 'Specs & docs',        path: '/apps/files/?dir=/DCP/Specs', kind: 'folder' },
  { label: 'Decisions log',       path: '/apps/files/?dir=/DCP/Decisions', kind: 'folder' },
  { label: 'Partner updates',     path: '/apps/files/?dir=/DCP/Partner-Updates', kind: 'folder' },
];
const NEXTCLOUD_BASE = process.env.NEXTCLOUD_BASE_URL || 'https://files.dcp.sa';
router.get('/files', requireAuth, (_req, res) => {
  res.json({
    base: NEXTCLOUD_BASE,
    links: FILE_LINKS.map((l) => ({ ...l, url: `${NEXTCLOUD_BASE}${l.path}` })),
  });
});

// ── Digest (markdown, agent-friendly) ──────────────────────────────────
// One-shot endpoint agents call when asked "what's open?" — returns ready
// to paste markdown. No JSON wrapping, no client-side rendering needed.
router.get('/digest', requireAuth, (req, res) => {
  const inProgress = db.all(
    `SELECT t.*, a.display_name AS assignee_name FROM mission_tasks t
     LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'in_progress' ORDER BY t.priority, t.updated_at DESC LIMIT 10`
  );
  const blocked = db.all(
    `SELECT t.*, a.display_name AS assignee_name FROM mission_tasks t
     LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'blocked' ORDER BY t.priority, t.updated_at DESC LIMIT 10`
  );
  const todoP0P1 = db.all(
    `SELECT t.*, a.display_name AS assignee_name FROM mission_tasks t
     LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'todo' AND t.priority IN ('p0','p1') ORDER BY t.priority, t.due_date IS NULL, t.due_date LIMIT 10`
  );
  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const shippedRecent = db.all(
    `SELECT t.*, a.display_name AS assignee_name FROM mission_tasks t
     LEFT JOIN mission_assignees a ON a.id = t.assignee_id
     WHERE t.status = 'done' AND t.completed_at >= ? ORDER BY t.completed_at DESC LIMIT 10`,
    sinceISO
  );
  const activeGoals = db.all(
    `SELECT g.*,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id) AS task_count,
            (SELECT COUNT(*) FROM mission_tasks t WHERE t.goal_id = g.id AND t.status = 'done') AS task_done
     FROM mission_goals g WHERE g.status = 'active' ORDER BY g.target_date IS NULL, g.target_date LIMIT 6`
  );
  const fmt = (t) => `- **${t.title}** _(${t.priority}, ${t.assignee_name || 'unassigned'})_${t.blocked_reason ? ` — ${t.blocked_reason}` : ''}${t.source_url ? ` · ${t.source_url}` : ''}`;
  const lines = [];
  lines.push(`# Mission Control — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  if (inProgress.length) { lines.push('\n## In Progress'); for (const t of inProgress) lines.push(fmt(t)); }
  if (blocked.length)    { lines.push('\n## Blocked');     for (const t of blocked)    lines.push(fmt(t)); }
  if (todoP0P1.length)   { lines.push('\n## P0/P1 To-Do'); for (const t of todoP0P1)   lines.push(fmt(t)); }
  if (shippedRecent.length) { lines.push('\n## Shipped (last 24h)'); for (const t of shippedRecent) lines.push(`- ${t.title} _(${t.assignee_name})_`); }
  if (activeGoals.length) {
    lines.push('\n## Active Goals');
    for (const g of activeGoals) {
      const pct = g.task_count ? Math.round((g.task_done / g.task_count) * 100) : 0;
      lines.push(`- **${g.title}** — ${g.task_done}/${g.task_count} (${pct}%)${g.target_date ? ` · target ${g.target_date.slice(0, 10)}` : ''}`);
    }
  }
  const md = lines.join('\n') + '\n';
  const wantsJson = (req.headers['accept'] || '').includes('application/json') || req.query.format === 'json';
  if (wantsJson) res.json({ markdown: md, generated_at: new Date().toISOString() });
  else { res.set('Content-Type', 'text/markdown; charset=utf-8'); res.send(md); }
});

// ── Fleet (provider + renter glimpse for the Overview) ────────────────
// Cheap aggregation off the providers + renters + jobs tables. Surfaces
// the "who's online, what shipped, why is Fadi offline" view that lets
// you glance at fleet health without leaving Mission Control.
router.get('/fleet', requireAuth, (_req, res) => {
  const now = Date.now();
  const FRESH_MS  = 90  * 1000;
  const STALE_MS  = 10  * 60 * 1000;

  let providersRaw = [];
  try {
    providersRaw = db.all(
      `SELECT id, name, status, is_paused, gpu_model, vllm_endpoint_url, wg_mesh_ip,
              last_heartbeat, endpoint_reachable, vram_gb, gpu_vram_mib,
              substr(cached_models, 1, 400) AS cached_models
       FROM providers WHERE deleted_at IS NULL ORDER BY last_heartbeat DESC NULLS LAST`
    );
  } catch (_) {
    providersRaw = db.all(
      `SELECT id, name, status, is_paused, gpu_model, vllm_endpoint_url, wg_mesh_ip,
              last_heartbeat, endpoint_reachable, vram_gb, gpu_vram_mib,
              substr(cached_models, 1, 400) AS cached_models
       FROM providers ORDER BY last_heartbeat DESC`
    );
  }

  const classified = providersRaw.map((p) => {
    const hbMs = p.last_heartbeat ? Date.parse(p.last_heartbeat) : NaN;
    const age = Number.isFinite(hbMs) ? Math.max(0, now - hbMs) : null;
    let state = 'unknown';
    let reason = null;
    if (p.is_paused) { state = 'paused'; reason = 'Paused by provider'; }
    else if (age == null) { state = 'never_seen'; reason = 'No heartbeat recorded'; }
    else if (age <= FRESH_MS) { state = 'online'; }
    else if (age <= STALE_MS) { state = 'stale'; reason = `Last heartbeat ${Math.round(age / 1000)}s ago`; }
    else { state = 'offline'; reason = `Last heartbeat ${formatAge(age)} ago`; }
    if (p.endpoint_reachable === 0 && state === 'online') {
      state = 'unreachable';
      reason = 'WG tunnel/endpoint unreachable from VPS';
    }
    return {
      id: p.id,
      name: p.name,
      state,
      reason,
      gpu_model: p.gpu_model,
      vram_gb: p.vram_gb || (p.gpu_vram_mib ? Math.round(p.gpu_vram_mib / 1024) : null),
      wg_mesh_ip: p.wg_mesh_ip,
      last_heartbeat: p.last_heartbeat,
      last_heartbeat_age_seconds: age == null ? null : Math.round(age / 1000),
    };
  });

  const onlineList     = classified.filter((p) => p.state === 'online');
  const staleList      = classified.filter((p) => p.state === 'stale');
  const unreachable    = classified.filter((p) => p.state === 'unreachable');
  const offlineRecent  = classified
    .filter((p) => p.state === 'offline')
    .slice(0, 12);
  const pausedList     = classified.filter((p) => p.state === 'paused');

  // Jobs in last 24h
  let jobs24h = 0, jobsFailed24h = 0, jobsLifetime = 0;
  try {
    const since24 = new Date(now - 24 * 3600 * 1000).toISOString();
    jobs24h        = (db.get(`SELECT COUNT(*) AS c FROM jobs WHERE created_at >= ?`, since24)?.c) || 0;
    jobsFailed24h  = (db.get(`SELECT COUNT(*) AS c FROM jobs WHERE created_at >= ? AND status = 'failed'`, since24)?.c) || 0;
    jobsLifetime   = (db.get(`SELECT COUNT(*) AS c FROM jobs`)?.c) || 0;
  } catch (_) { /* jobs table may differ */ }

  // Renters
  let renterCount = 0, renterCount24h = 0;
  try {
    renterCount    = (db.get(`SELECT COUNT(*) AS c FROM renters`)?.c) || 0;
    const since24  = new Date(now - 24 * 3600 * 1000).toISOString();
    renterCount24h = (db.get(`SELECT COUNT(DISTINCT renter_id) AS c FROM jobs WHERE created_at >= ? AND renter_id IS NOT NULL`, since24)?.c) || 0;
  } catch (_) { /* renters table may differ */ }

  res.json({
    counts: {
      online: onlineList.length,
      stale: staleList.length,
      unreachable: unreachable.length,
      paused: pausedList.length,
      total: classified.length,
    },
    jobs: { last_24h: jobs24h, failed_24h: jobsFailed24h, lifetime: jobsLifetime },
    renters: { total: renterCount, active_24h: renterCount24h },
    online:        onlineList,
    stale:         staleList,
    unreachable:   unreachable,
    offline_recent: offlineRecent,
    paused:        pausedList,
    generated_at: new Date().toISOString(),
  });
});

function formatAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

module.exports = router;
