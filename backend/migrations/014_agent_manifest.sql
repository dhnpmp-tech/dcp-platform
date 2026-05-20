-- 014_agent_manifest.sql
-- Self-update manifest for dcp-agent providers.
--
-- Context: dcp-agent PR #17 ("security hardening") landed a self-update cron
-- on every provider machine. The cron polls https://api.dcp.sa/agent/manifest.json
-- to learn which commit it should be running. Without this table, the endpoint
-- has nothing to return, and the fleet stays pinned forever.
--
-- Trust model (v1): the response is trusted because it arrived over TLS to
-- api.dcp.sa. v2 will add a GPG-signed `signature` column + verifying key
-- bundled into the agent. Do NOT add signing logic before v2 is designed.
--
-- Append-only: each publish inserts a new row. The endpoint returns the latest
-- row by published_at DESC. Old rows stay around as an audit trail and as
-- rollback targets ("publish the previous safe_commit").

CREATE TABLE IF NOT EXISTS agent_manifest (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  safe_commit  TEXT    NOT NULL,                              -- 40-char lowercase hex SHA from DCP-SA/dcp-agent
  min_tag      TEXT,                                          -- optional semver floor (e.g. 'v0.6.0')
  rollout_pct  INTEGER NOT NULL DEFAULT 0
                       CHECK (rollout_pct BETWEEN 0 AND 100), -- canary percentage of fleet that should roll forward
  published_at TEXT    NOT NULL DEFAULT (datetime('now')),
  published_by TEXT,                                          -- 'admin@dcp.sa', 'initial-bootstrap-...', etc.
  notes        TEXT                                           -- free-form release notes / changelog ref
);

CREATE INDEX IF NOT EXISTS idx_manifest_published
  ON agent_manifest(published_at DESC);

-- Seed row: the current HEAD of DCP-SA/dcp-agent main as of 2026-05-20.
-- rollout_pct=10 is the safe canary default. Bump to 100 after the first
-- 10% wave reports healthy heartbeats.
INSERT INTO agent_manifest (safe_commit, min_tag, rollout_pct, published_by, notes)
VALUES (
  '1ce64273d606371156abb8ce54941609064757d1',
  'v0.6.0',
  10,
  'initial-bootstrap-2026-05-20',
  'Bootstrap row created with /agent/manifest.json endpoint. Sourced from gh api repos/DCP-SA/dcp-agent/commits/main on 2026-05-20.'
);
