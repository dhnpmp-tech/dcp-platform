-- 007: WireGuard Tier 2 — persist derived tunnel-health flag on providers row.
--
-- Tier 1 (PR #344) added `wg_health` derivation in the heartbeat handler but
-- did not persist the rolled-up boolean. Tier 2's dashboard badge needs it
-- surfaced via /api/providers/me, which is easiest if we store it on the row
-- alongside the existing wg_mesh_ip column.
--
-- Semantics (matches the heuristic in routes/providers.js):
--   NULL  -> wg not installed / detection skipped
--   1     -> handshake fresh OR in-tunnel ping replied within window
--   0     -> tunnel zombied (handshake stale AND no ping reply)
--
-- We also stash the raw handshake age so the dashboard can render a tooltip
-- ("last handshake 24s ago") if we want to later. Both columns nullable.
--
-- Forward-only. No rollback script.

ALTER TABLE providers ADD COLUMN wg_tunnel_healthy INTEGER;
ALTER TABLE providers ADD COLUMN wg_handshake_age_s INTEGER;
