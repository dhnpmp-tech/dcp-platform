-- 022_cron_heartbeats.sql — per-cron last-run timestamp + outcome.
-- Updated in place by Node crons (auto-topup-sweep, payout-reconcile) at the
-- end of each tick. Read by heartbeat_mvp.py to detect stuck crons and
-- alert on staleness > threshold.
--
-- One row per cron_id. Survives restarts.

CREATE TABLE IF NOT EXISTS cron_heartbeats (
  cron_id        TEXT PRIMARY KEY,        -- e.g. 'auto_topup_sweep'
  last_run_at    REAL NOT NULL,           -- unix seconds
  last_outcome   TEXT NOT NULL,           -- 'ok' | 'error'
  last_summary   TEXT,                    -- JSON: {swept,retried,errors} etc.
  last_error     TEXT,                    -- error message if last_outcome='error'
  interval_ms    INTEGER NOT NULL,        -- expected cadence; probe staleness = 2 × interval_ms
  consecutive_errors INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_last_run
  ON cron_heartbeats (last_run_at);
