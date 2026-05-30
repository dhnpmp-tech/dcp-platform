-- 013_provider_engines.sql
-- Multi-engine provider support.
--
-- A provider may serve models via Ollama (port 11434), vLLM (port 8000),
-- and/or llama.cpp (port 8080). Each engine has its own URL + model list.
-- Routing picks the right engine for the requested model.
--
-- Backwards compat: providers.vllm_endpoint_url + .vllm_models stay
-- populated by daemon heartbeat for legacy code paths during migration.

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
CREATE INDEX IF NOT EXISTS idx_provider_engines_lookup ON provider_engines(reachable, engine_type);

-- Seed existing providers: vllm_endpoint_url → vllm engine row (if set)
INSERT INTO provider_engines (provider_id, engine_type, base_url, port, served_models, reachable, last_seen_at)
SELECT 
    id, 'vllm', vllm_endpoint_url, 8000,
    COALESCE(vllm_models, '[]'),
    COALESCE(endpoint_reachable, 1),
    COALESCE(last_heartbeat, datetime('now'))
FROM providers
WHERE vllm_endpoint_url IS NOT NULL
    AND vllm_endpoint_url != ''
    AND deleted_at IS NULL
ON CONFLICT(provider_id, engine_type) DO NOTHING;

-- Seed cached_models → ollama engine (Ollama is conventionally on :11434)
INSERT INTO provider_engines (provider_id, engine_type, base_url, port, served_models, reachable, last_seen_at)
SELECT 
    id, 'ollama',
    'http://' || COALESCE(wg_mesh_ip, provider_ip, '127.0.0.1') || ':11434/v1',
    11434,
    cached_models,
    1,
    COALESCE(last_heartbeat, datetime('now'))
FROM providers
WHERE cached_models IS NOT NULL
    AND cached_models != ''
    AND cached_models != '[]'
    AND deleted_at IS NULL
ON CONFLICT(provider_id, engine_type) DO NOTHING;
