-- 019_dangerous_action.sql — agent-health sprint, workstream C (Disinhibition).
--
-- Two tables:
--   dangerous_action_log — append-only audit; every gated invocation lands here
--   consumed_tokens      — single-use enforcement; once a token authorizes an
--                          action it can never authorize another

CREATE TABLE IF NOT EXISTS dangerous_action_log (
  req_id            TEXT PRIMARY KEY,            -- uuid4
  class             TEXT NOT NULL,               -- payment | deploy | broadcast | credential | deletion | mesh-peer-add
  fn                TEXT NOT NULL,               -- qualified function name
  payload_hash      TEXT NOT NULL,               -- sha256 of canonicalized args
  requester         TEXT NOT NULL,               -- agent id (e.g. 'nexus', 'hermes-tg', 'cli:peter')
  approver          TEXT,                        -- human id if approved; NULL if refused
  approval_source   TEXT,                        -- tg_button | web_ui | signed_cli | none
  outcome           TEXT NOT NULL,               -- allowed | refused | error
  error_reason      TEXT,                        -- short reason when outcome=refused|error
  ts                REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dal_class_ts
  ON dangerous_action_log (class, ts);

CREATE INDEX IF NOT EXISTS idx_dal_outcome_ts
  ON dangerous_action_log (outcome, ts);


CREATE TABLE IF NOT EXISTS consumed_tokens (
  token_hash        TEXT PRIMARY KEY,            -- sha256(token); we never store raw
  class             TEXT NOT NULL,
  payload_hash      TEXT NOT NULL,
  approver          TEXT NOT NULL,
  approval_source   TEXT NOT NULL,
  issued_at         REAL NOT NULL,
  expires_at        REAL NOT NULL,
  consumed_at       REAL NOT NULL                -- when verify_token() first accepted it
);

CREATE INDEX IF NOT EXISTS idx_consumed_expires
  ON consumed_tokens (expires_at);
