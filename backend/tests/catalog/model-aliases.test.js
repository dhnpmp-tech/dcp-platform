/**
 * Coverage for the shared model-alias helpers.
 *
 * Guards against:
 *   - Dash-form + colon-form entries double-listing in /v1/models
 *   - Provider counts being split across alias siblings
 *   - Drift between the v1 proxy alias table and the dedupe alias table
 *     (there should only ever be ONE source of truth)
 */

const {
  DASH_TO_CANONICAL,
  CANONICAL_TO_ALIASES,
  getCanonicalModelId,
  deduplicateModelAliases,
} = require('../../src/lib/model-aliases');

describe('model-aliases: canonical mapping', () => {
  test('DASH_TO_CANONICAL is frozen', () => {
    expect(Object.isFrozen(DASH_TO_CANONICAL)).toBe(true);
  });

  test('every alias maps to a distinct canonical', () => {
    for (const [alias, canonical] of Object.entries(DASH_TO_CANONICAL)) {
      expect(typeof canonical).toBe('string');
      expect(canonical.length).toBeGreaterThan(0);
      expect(alias).not.toBe(canonical);
    }
  });

  test('CANONICAL_TO_ALIASES correctly reverses the map', () => {
    expect(CANONICAL_TO_ALIASES.get('qwen3:30b-a3b')).toEqual(
      expect.arrayContaining(['qwen3-30b-a3b', 'qwen/qwen3-30b-a3b-gptq-int4']),
    );
    expect(CANONICAL_TO_ALIASES.get('qwen3.5:35b-a3b')).toEqual(
      expect.arrayContaining(['qwen3.5-35b-a3b', 'qwen/qwen3.5-35b-a3b-gptq-int4']),
    );
    expect(CANONICAL_TO_ALIASES.get('qwen2.5vl:3b')).toEqual(
      expect.arrayContaining(['qwen2.5vl-3b', 'qwen2.5-vl-3b', 'qwen/qwen2.5-vl-3b-instruct']),
    );
    expect(CANONICAL_TO_ALIASES.get('bge-m3')).toEqual(
      expect.arrayContaining(['baai/bge-m3']),
    );
  });

  test('getCanonicalModelId returns canonical for known alias', () => {
    expect(getCanonicalModelId('qwen3-30b-a3b')).toBe('qwen3:30b-a3b');
    expect(getCanonicalModelId('QWEN3-30B-A3B')).toBe('qwen3:30b-a3b');
    expect(getCanonicalModelId('  qwen3-30b-a3b  ')).toBe('qwen3:30b-a3b');
    expect(getCanonicalModelId('Qwen/Qwen2.5-VL-3B-Instruct')).toBe('qwen2.5vl:3b');
    expect(getCanonicalModelId('BAAI/bge-m3')).toBe('bge-m3');
  });

  test('getCanonicalModelId returns input unchanged for unknown IDs', () => {
    expect(getCanonicalModelId('claude-3-opus')).toBe('claude-3-opus');
    expect(getCanonicalModelId('qwen3:30b-a3b')).toBe('qwen3:30b-a3b');
  });

  test('getCanonicalModelId handles non-strings gracefully', () => {
    expect(getCanonicalModelId(null)).toBe(null);
    expect(getCanonicalModelId(undefined)).toBe(undefined);
    expect(getCanonicalModelId(42)).toBe(42);
  });
});

describe('model-aliases: deduplicateModelAliases', () => {
  test('collapses dash-form into colon-form when both present', () => {
    const input = [
      { id: 'qwen3-30b-a3b', provider_count: 2, name: 'Qwen3 30B (dash)' },
      { id: 'qwen3:30b-a3b', provider_count: 3, name: 'Qwen3 30B' },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('qwen3:30b-a3b');
    expect(out[0].provider_count).toBe(5);
    expect(out[0].name).toBe('Qwen3 30B');
  });

  test('keeps dash-form unchanged when canonical not present', () => {
    const input = [
      { id: 'qwen3-30b-a3b', provider_count: 2 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('qwen3-30b-a3b');
    expect(out[0].provider_count).toBe(2);
  });

  test('keeps non-alias entries unchanged', () => {
    const input = [
      { id: 'claude-3-opus', provider_count: 0 },
      { id: 'gpt-4o', provider_count: 0 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(input[0]);
    expect(out[1]).toEqual(input[1]);
  });

  test('sums across multiple aliases of the same canonical', () => {
    const input = [
      { id: 'qwen3:30b-a3b', provider_count: 1 },
      { id: 'qwen3-30b-a3b', provider_count: 2 },
      { id: 'qwen/qwen3-30b-a3b-gptq-int4', provider_count: 3 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('qwen3:30b-a3b');
    expect(out[0].provider_count).toBe(6);
  });

  test('collapses Qwen2.5-VL aliases into the catalog canonical', () => {
    const input = [
      { id: 'qwen2.5vl:3b', provider_count: 1 },
      { id: 'Qwen/Qwen2.5-VL-3B-Instruct', provider_count: 2 },
      { id: 'qwen2.5-vl-3b', provider_count: 1 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('qwen2.5vl:3b');
    expect(out[0].provider_count).toBe(4);
  });

  test('collapses BGE HF ID into bge-m3 when both are present', () => {
    const input = [
      { id: 'bge-m3', provider_count: 1 },
      { id: 'BAAI/bge-m3', provider_count: 2 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('bge-m3');
    expect(out[0].provider_count).toBe(3);
  });

  test('treats non-numeric provider_count as zero', () => {
    const input = [
      { id: 'qwen3:8b', provider_count: undefined },
      { id: 'qwen3-8b', provider_count: 2 },
    ];
    const out = deduplicateModelAliases(input);
    expect(out).toHaveLength(1);
    expect(out[0].provider_count).toBe(2);
  });

  test('pure function: does not mutate input', () => {
    const input = [
      { id: 'qwen3-30b-a3b', provider_count: 2 },
      { id: 'qwen3:30b-a3b', provider_count: 3 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    deduplicateModelAliases(input);
    expect(input).toEqual(snapshot);
  });

  test('handles empty / null / non-array inputs', () => {
    expect(deduplicateModelAliases([])).toEqual([]);
    expect(deduplicateModelAliases(null)).toEqual([]);
    expect(deduplicateModelAliases(undefined)).toEqual([]);
  });
});
