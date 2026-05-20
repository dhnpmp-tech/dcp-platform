-- Migration 015 — provider_engines
--
-- Codifies the `provider_engines` table that was created surgically on the
-- production VPS during the 2026-05-19 phantom-daemon remediation. Production
-- already has the table and ~50 rows (incl. Node 2's llamacpp + ollama rows
-- for provider_id=1774351995321). Every statement here uses IF NOT EXISTS so
-- re-running on prod is a no-op and existing rows are preserved.
--
-- The table is the new source of truth for multi-engine routing: a single
-- provider can expose more than one inference backend (e.g. llama.cpp at 8080
-- + Ollama at 11434), each serving a disjoint set of models. The legacy
-- `providers.vllm_endpoint_url` + `providers.cached_models` columns remain
-- intact for backward compatibility and are still read on the legacy code
-- path (selected by the MULTI_ENGINE_ROUTING_ENABLED env flag).
--
-- Companion code:
--   - backend/src/db.js               CREATE TABLE IF NOT EXISTS mirror
--   - backend/src/routes/providers.js heartbeat UPSERT (when payload carries `engines`)
--   - backend/src/routes/v1.js        lookupProviderEnginesForModel + flagged dispatch

CREATE TABLE IF NOT EXISTS provider_engines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    engine_type TEXT NOT NULL CHECK (engine_type IN ('ollama','vllm','llamacpp')),
    base_url TEXT NOT NULL,
    port INTEGER NOT NULL,
    served_models TEXT NOT NULL DEFAULT '[]',
    reachable INTEGER DEFAULT 1,
    last_probed_at TEXT,
    last_probe_error TEXT,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider_id, engine_type),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_provider_engines_provider ON provider_engines(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_engines_lookup  ON provider_engines(reachable, engine_type);
