-- 012_mission_control.sql
-- Native Mission Control: tasks, milestones, goals, assignees, comments.
-- Single SQLite store, no Plane/external dependency. Designed to be both
-- agent-readable (REST API + structured fields) and human-friendly
-- (kanban statuses, due dates, priorities).
--
-- Schema vocabulary:
--   assignees:  who/what owns work — humans AND agents are first-class.
--   tasks:      atomic units of work, optionally linked to a milestone/goal.
--   milestones: time-boxed delivery targets (e.g. "ship vision support").
--   goals:      strategic outcomes that contain multiple milestones.
--   comments:   activity log + agent reasoning trail per task.

CREATE TABLE IF NOT EXISTS mission_assignees (
  id           TEXT    PRIMARY KEY,
  display_name TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK(kind IN ('human','agent')),
  avatar_url   TEXT,
  external_id  TEXT,                     -- telegram chat_id, github login, etc.
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mission_goals (
  id            TEXT    PRIMARY KEY,
  title         TEXT    NOT NULL,
  description   TEXT,
  owner_id      TEXT REFERENCES mission_assignees(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','paused','done','dropped')),
  target_date   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mission_milestones (
  id            TEXT    PRIMARY KEY,
  goal_id       TEXT REFERENCES mission_goals(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  description   TEXT,
  status        TEXT    NOT NULL DEFAULT 'planned'
                CHECK(status IN ('planned','in_progress','done','dropped')),
  target_date   TEXT,
  completed_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mission_tasks (
  id            TEXT    PRIMARY KEY,
  title         TEXT    NOT NULL,
  description   TEXT,
  status        TEXT    NOT NULL DEFAULT 'todo'
                CHECK(status IN ('todo','in_progress','blocked','review','done','cancelled')),
  priority      TEXT    NOT NULL DEFAULT 'p2'
                CHECK(priority IN ('p0','p1','p2','p3')),
  assignee_id   TEXT REFERENCES mission_assignees(id) ON DELETE SET NULL,
  milestone_id  TEXT REFERENCES mission_milestones(id) ON DELETE SET NULL,
  goal_id       TEXT REFERENCES mission_goals(id) ON DELETE SET NULL,
  created_by    TEXT REFERENCES mission_assignees(id) ON DELETE SET NULL,
  due_date      TEXT,
  blocked_reason TEXT,
  source        TEXT,                    -- 'human','agent','github','telegram'
  source_url    TEXT,                    -- external link (PR, TG msg, etc.)
  external_id   TEXT,                    -- gh issue #, TG msg_id, etc.
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS mission_task_comments (
  id          TEXT    PRIMARY KEY,
  task_id     TEXT    NOT NULL REFERENCES mission_tasks(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES mission_assignees(id) ON DELETE SET NULL,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mission_tasks_status     ON mission_tasks(status, priority, due_date);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_assignee   ON mission_tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_milestone  ON mission_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_goal       ON mission_tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_updated    ON mission_tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_milestones_goal  ON mission_milestones(goal_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_comments_task    ON mission_task_comments(task_id, created_at DESC);

-- Seed the founders + agents so initial UI is non-empty.
INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, external_id) VALUES
  ('peter',  'Peter',           'human', '7652446182'),
  ('tareq',  'Tareq',           'human', '5297693905'),
  ('fadi',   'Fadi',            'human', null),
  ('claude', 'Claude (dev)',    'agent', 'dcp_dev_bot'),
  ('nexus',  'Nexus',           'agent', 'NexusDatacenter_bot'),
  ('tito',   'Tito (bench)',    'agent', 'Tito_the_bot');
