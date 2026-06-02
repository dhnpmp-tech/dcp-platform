/**
 * Tests for multi-engine routing (migration 015).
 *
 * Scope:
 *   - lookupProviderEnginesForModel() matches the right engine row
 *   - getCapableProviders() flagged branch returns engine-tagged providers
 *   - Flag OFF → legacy path (no _selectedEngine attached)
 *   - No engine rows + flag ON → falls back to legacy
 *   - URL building from _selectedEngine.base_url
 *
 * Strategy: in-memory SQLite (via tests/jest-setup.js), seed providers +
 * provider_engines rows directly, exercise the helpers from v1.__test.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOtp: jest.fn(), getUser: jest.fn() } })),
}));

const db = require('../../src/db');
const v1Router = require('../../src/routes/v1');

const {
  lookupProviderEnginesForModel,
  getCapableProviders,
  isMultiEngineRoutingEnabled,
  buildProviderChatCompletionsUrl,
} = v1Router.__test;

function seedProvider({
  id,
  email = `p${id}@dcp.sa`,
  apiKey = `k_${id}`,
  status = 'online',
  vllmEndpointUrl = `http://10.8.0.${id}:8080`,
  cachedModels = [],
  vramMb = 24576,
  computeTypes = 'inference',
  lastHeartbeat = null,
  endpointReachable = 1,
  endpointProbedAt = new Date().toISOString(),
} = {}) {
  const heartbeat = lastHeartbeat || new Date().toISOString();
  db.run(
    `INSERT INTO providers (
        id, email, name, status, api_key, created_at,
        approval_status, vllm_endpoint_url, cached_models,
        gpu_vram_mb, supported_compute_types, last_heartbeat,
        endpoint_reachable, endpoint_probed_at,
        is_paused
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'),
             'approved', ?, ?,
             ?, ?, ?,
             ?, ?,
             0)`,
    id, email, `Provider ${id}`, status, apiKey,
    vllmEndpointUrl, JSON.stringify(cachedModels),
    vramMb, computeTypes, heartbeat,
    endpointReachable, endpointProbedAt,
  );
}

function seedEngine({
  providerId,
  engineType,
  baseUrl,
  port,
  servedModels = [],
  reachable = 1,
}) {
  db.run(
    `INSERT INTO provider_engines (
        provider_id, engine_type, base_url, port,
        served_models, reachable, last_seen_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    providerId, engineType, baseUrl, port,
    JSON.stringify(servedModels), reachable,
  );
}

beforeEach(() => {
  try { db.run('DELETE FROM provider_engines'); } catch (_) { /* */ }
  try { db.run('DELETE FROM providers'); } catch (_) { /* */ }
  delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
});

describe('isMultiEngineRoutingEnabled', () => {
  test('false when env unset', () => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
    expect(isMultiEngineRoutingEnabled()).toBe(false);
  });

  test('false when env is "false"', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'false';
    expect(isMultiEngineRoutingEnabled()).toBe(false);
  });

  test('true only when env is exactly "true"', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    expect(isMultiEngineRoutingEnabled()).toBe(true);
  });

  test('false when env is "1" (must be string "true")', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = '1';
    expect(isMultiEngineRoutingEnabled()).toBe(false);
  });
});

describe('lookupProviderEnginesForModel', () => {
  test('returns empty array when no engine rows exist', () => {
    seedProvider({ id: 1 });
    const result = lookupProviderEnginesForModel('qwen3:8b');
    expect(result).toEqual([]);
  });

  test('returns empty when model not in any served_models', () => {
    seedProvider({ id: 1 });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b'],
    });
    const result = lookupProviderEnginesForModel('llama4-maverick-405b');
    expect(result).toEqual([]);
  });

  test('matches exact model id', () => {
    seedProvider({ id: 1 });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b', 'bge-m3:latest'],
    });
    const result = lookupProviderEnginesForModel('qwen3:8b');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine.engine_type).toBe('ollama');
    expect(result[0]._selectedEngine.base_url).toBe('http://10.8.0.1:11434/v1');
    expect(result[0]._selectedEngine.served_models).toContain('qwen3:8b');
  });

  test('matches request aliases against canonical engine served_models', () => {
    seedProvider({ id: 1 });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen2.5vl:3b'],
    });

    const result = lookupProviderEnginesForModel('qwen/qwen2.5-vl-3b-instruct');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine.engine_type).toBe('ollama');
    expect(result[0]._selectedEngine.served_models).toContain('qwen2.5vl:3b');
  });

  test('returns the right engine when a provider has both Ollama and llamacpp', () => {
    seedProvider({ id: 1 });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://10.8.0.1:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b', 'bge-m3:latest'],
    });

    const llamaResult = lookupProviderEnginesForModel('qwen3.6-27b-mtp');
    expect(llamaResult).toHaveLength(1);
    expect(llamaResult[0]._selectedEngine.engine_type).toBe('llamacpp');
    expect(llamaResult[0]._selectedEngine.base_url).toBe('http://10.8.0.1:8080');

    const ollamaResult = lookupProviderEnginesForModel('qwen3:8b');
    expect(ollamaResult).toHaveLength(1);
    expect(ollamaResult[0]._selectedEngine.engine_type).toBe('ollama');
    expect(ollamaResult[0]._selectedEngine.base_url).toBe('http://10.8.0.1:11434/v1');
  });

  test('skips unreachable engines', () => {
    seedProvider({ id: 1 });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b'],
      reachable: 0,
    });
    const result = lookupProviderEnginesForModel('qwen3:8b');
    expect(result).toEqual([]);
  });

  test('skips paused providers', () => {
    seedProvider({ id: 1 });
    db.run('UPDATE providers SET is_paused = 1 WHERE id = 1');
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b'],
    });
    const result = lookupProviderEnginesForModel('qwen3:8b');
    expect(result).toEqual([]);
  });

  test('skips soft-deleted providers', () => {
    seedProvider({ id: 1 });
    db.run("UPDATE providers SET deleted_at = datetime('now') WHERE id = 1");
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.1:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b'],
    });
    const result = lookupProviderEnginesForModel('qwen3:8b');
    expect(result).toEqual([]);
  });

  test('returns empty for empty model alias', () => {
    expect(lookupProviderEnginesForModel('')).toEqual([]);
    expect(lookupProviderEnginesForModel(null)).toEqual([]);
    expect(lookupProviderEnginesForModel(undefined)).toEqual([]);
  });

  test('tolerates malformed served_models JSON without throwing', () => {
    seedProvider({ id: 1 });
    // Insert raw bad JSON via direct write
    db.run(
      `INSERT INTO provider_engines (provider_id, engine_type, base_url, port,
        served_models, reachable, last_seen_at)
       VALUES (?, 'ollama', 'http://10.8.0.1:11434/v1', 11434, ?, 1, datetime('now'))`,
      1, 'not-valid-json-{[',
    );
    expect(() => lookupProviderEnginesForModel('qwen3:8b')).not.toThrow();
    expect(lookupProviderEnginesForModel('qwen3:8b')).toEqual([]);
  });
});

describe('getCapableProviders with multi-engine routing', () => {
  test('flag OFF → uses legacy path even when engine rows exist', () => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
    seedProvider({
      id: 1,
      cachedModels: ['legacy-model'],
      vllmEndpointUrl: 'http://legacy.example.com:11434',
    });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://engine.example.com:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });
    // Request a model only in the engine row — legacy path doesn't have it,
    // so getCapableProviders should return empty (proves legacy ran).
    const result = getCapableProviders(0, 'qwen3.6-27b-mtp');
    // Legacy path filters by cached_models; 'qwen3.6-27b-mtp' isn't there.
    expect(result.find((p) => p._selectedEngine)).toBeUndefined();
  });

  test('flag ON + engine rows match → returns engine-tagged providers', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    seedProvider({
      id: 1,
      cachedModels: [],
      vllmEndpointUrl: 'http://10.8.0.6:11434',
    });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://10.8.0.6:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });

    const result = getCapableProviders(0, 'qwen3.6-27b-mtp');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine).toBeDefined();
    expect(result[0]._selectedEngine.base_url).toBe('http://10.8.0.6:8080');
    expect(result[0]._selectedEngine.engine_type).toBe('llamacpp');
  });

  test('flag ON + engine rows match request aliases through canonical model ids', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    seedProvider({
      id: 1,
      cachedModels: [],
      vllmEndpointUrl: 'http://10.8.0.6:11434',
    });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.6:11434/v1',
      port: 11434,
      servedModels: ['qwen2.5vl:3b'],
    });

    const result = getCapableProviders(0, 'qwen/qwen2.5-vl-3b-instruct');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine).toBeDefined();
    expect(result[0]._selectedEngine.base_url).toBe('http://10.8.0.6:11434/v1');
  });

  test('flag ON + no engine rows match → falls back to legacy', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    seedProvider({
      id: 1,
      cachedModels: ['legacy-model'],
      vllmEndpointUrl: 'http://legacy.example.com:11434',
    });
    // No provider_engines rows for this provider.

    const result = getCapableProviders(0, 'legacy-model');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine).toBeUndefined();
    expect(result[0].vllm_endpoint_url).toBe('http://legacy.example.com:11434');
  });

  test('legacy path matches cached models through canonical aliases', () => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
    seedProvider({
      id: 1,
      cachedModels: ['bge-m3'],
      vllmEndpointUrl: 'http://legacy.example.com:11434',
    });

    const result = getCapableProviders(0, 'BAAI/bge-m3');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine).toBeUndefined();
    expect(result[0].vllm_endpoint_url).toBe('http://legacy.example.com:11434');
  });

  test('legacy path matches semantic aliases that are not loose substrings', () => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
    seedProvider({
      id: 1,
      cachedModels: ['allam-q4'],
      vllmEndpointUrl: 'http://legacy.example.com:11434',
    });

    const result = getCapableProviders(0, 'ALLaM-AI/ALLaM-7B-Instruct-preview');
    expect(result).toHaveLength(1);
    expect(result[0]._selectedEngine).toBeUndefined();
    expect(result[0].vllm_endpoint_url).toBe('http://legacy.example.com:11434');
  });

  test('flag ON + same provider has both engines → routes per model', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    seedProvider({
      id: 1,
      cachedModels: [],
      vllmEndpointUrl: 'http://10.8.0.6:11434',
    });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://10.8.0.6:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });
    seedEngine({
      providerId: 1,
      engineType: 'ollama',
      baseUrl: 'http://10.8.0.6:11434/v1',
      port: 11434,
      servedModels: ['qwen3:8b'],
    });

    const llamaCandidate = getCapableProviders(0, 'qwen3.6-27b-mtp');
    expect(llamaCandidate).toHaveLength(1);
    expect(llamaCandidate[0]._selectedEngine.engine_type).toBe('llamacpp');
    expect(llamaCandidate[0]._selectedEngine.base_url).toBe('http://10.8.0.6:8080');

    const ollamaCandidate = getCapableProviders(0, 'qwen3:8b');
    expect(ollamaCandidate).toHaveLength(1);
    expect(ollamaCandidate[0]._selectedEngine.engine_type).toBe('ollama');
    expect(ollamaCandidate[0]._selectedEngine.base_url).toBe('http://10.8.0.6:11434/v1');
  });

  test('flag ON + stale heartbeat → provider filtered out', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    // Heartbeat 1 hour ago — well past the stale threshold.
    seedProvider({
      id: 1,
      cachedModels: [],
      lastHeartbeat: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://10.8.0.6:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });
    const result = getCapableProviders(0, 'qwen3.6-27b-mtp');
    expect(result).toHaveLength(0);
  });

  test('legacy path rejects heartbeat-only providers without a backend liveness verdict', () => {
    delete process.env.MULTI_ENGINE_ROUTING_ENABLED;
    seedProvider({
      id: 1,
      cachedModels: ['legacy-model'],
      endpointReachable: 1,
      endpointProbedAt: null,
    });

    const result = getCapableProviders(0, 'legacy-model');
    expect(result).toHaveLength(0);
  });

  test('engine path rejects heartbeat-only providers without a backend liveness verdict', () => {
    process.env.MULTI_ENGINE_ROUTING_ENABLED = 'true';
    seedProvider({
      id: 1,
      cachedModels: [],
      endpointReachable: 1,
      endpointProbedAt: null,
    });
    seedEngine({
      providerId: 1,
      engineType: 'llamacpp',
      baseUrl: 'http://10.8.0.6:8080',
      port: 8080,
      servedModels: ['qwen3.6-27b-mtp'],
    });

    const result = getCapableProviders(0, 'qwen3.6-27b-mtp');
    expect(result).toHaveLength(0);
  });
});

describe('buildProviderChatCompletionsUrl with engine base_url', () => {
  test('bare host:port → appends /v1/chat/completions (llamacpp style)', () => {
    const out = buildProviderChatCompletionsUrl('http://10.8.0.6:8080');
    expect(out).toBe('http://10.8.0.6:8080/v1/chat/completions');
  });

  test('host:port/v1 → appends /chat/completions (Ollama style)', () => {
    const out = buildProviderChatCompletionsUrl('http://10.8.0.6:11434/v1');
    expect(out).toBe('http://10.8.0.6:11434/v1/chat/completions');
  });

  test('already-full URL → returned unchanged', () => {
    const out = buildProviderChatCompletionsUrl('http://10.8.0.6:8080/v1/chat/completions');
    expect(out).toBe('http://10.8.0.6:8080/v1/chat/completions');
  });
});
