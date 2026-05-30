-- 018_channel_health.sql — agent-health sprint, workstream C (Locked-in Syndrome).
-- One row per probed channel. Updated in place by heartbeat_mvp.py every 60s.
-- Read by /api/channels/health route and rendered on Mission Control.

CREATE TABLE IF NOT EXISTS channel_health (
  channel_id        TEXT PRIMARY KEY,
  alive             INTEGER NOT NULL DEFAULT 0,
  last_success_at   REAL,                       -- unix seconds; survives outages
  last_error        TEXT,
  reconnect_hint    TEXT,
  probed_at         REAL NOT NULL,
  latency_ms        INTEGER,
  consecutive_fail  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_channel_health_alive
  ON channel_health (alive, probed_at);
