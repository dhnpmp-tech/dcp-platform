-- 013_renter_notifications.sql
-- In-dashboard renter notifications + daily digest tracking.
--
-- Replaces the per-job completion email burn (Resend quota was eating ~641
-- emails/day at production volume). The dailyDigest service rolls up
-- notifications into ONE email per renter per day; the dashboard surfaces
-- the same rows in real time via /api/renters/me/notifications.
--
-- Kinds:
--   'job_completed'   — terminal success, normal volume, digest-only
--   'job_failed'      — terminal failure, optional surface
--   'balance_low'     — special: ALSO sends a real-time email (rare)

CREATE TABLE IF NOT EXISTS renter_notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id    INTEGER NOT NULL REFERENCES renters(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,
  job_id       INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  payload      TEXT,                                  -- JSON blob
  read_at      TEXT,
  digested_at  TEXT,                                  -- set by dailyDigest when rolled into an email
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Hot path: unread lookup per renter ordered newest-first.
CREATE INDEX IF NOT EXISTS idx_renter_notif_unread
  ON renter_notifications(renter_id, read_at, created_at DESC);

-- Digest sweep: find un-digested job_completed rows in the last 24h.
CREATE INDEX IF NOT EXISTS idx_renter_notif_digest
  ON renter_notifications(kind, digested_at, created_at);
