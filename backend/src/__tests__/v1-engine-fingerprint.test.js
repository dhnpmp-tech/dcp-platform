// Invisibility: engine fingerprint neutralization on the v1 renter proxy.
// The upstream engine stamps system_fingerprint (e.g. Ollama → "fp_ollama")
// which would disclose the inference engine to every caller. DCP sells a
// sovereign, engine-agnostic runtime, so every /v1 response must carry the
// neutral "fp_dcp" value instead — overwritten, never deleted, with served
// model names left untouched.
process.env.DC1_DB_PATH = process.env.DC1_DB_PATH || ':memory:';

const {
  neutralizeEngineFingerprint,
  DCP_SYSTEM_FINGERPRINT,
} = require('../routes/v1').__test;

describe('DCP_SYSTEM_FINGERPRINT', () => {
  test('is the neutral DCP value', () => {
    expect(DCP_SYSTEM_FINGERPRINT).toBe('fp_dcp');
  });
});

describe('neutralizeEngineFingerprint', () => {
  test('overwrites an engine fingerprint (fp_ollama) with fp_dcp', () => {
    const body = {
      id: 'chatcmpl-x',
      object: 'chat.completion',
      model: 'qwen2.5:7b',
      system_fingerprint: 'fp_ollama',
      choices: [{ index: 0, message: { role: 'assistant', content: 'OK' } }],
    };
    neutralizeEngineFingerprint(body);
    expect(body.system_fingerprint).toBe('fp_dcp');
  });

  test('adds fp_dcp when the field is absent (clients expect the field)', () => {
    const chunk = { object: 'chat.completion.chunk', choices: [] };
    neutralizeEngineFingerprint(chunk);
    expect(chunk.system_fingerprint).toBe('fp_dcp');
  });

  test('preserves the served model name (qwen…)', () => {
    const body = { model: 'qwen2.5:7b', system_fingerprint: 'fp_ollama' };
    neutralizeEngineFingerprint(body);
    expect(body.model).toBe('qwen2.5:7b');
    expect(body.system_fingerprint).toBe('fp_dcp');
  });

  test('scrubs extra engine tells but keeps standard OpenAI fields', () => {
    const body = {
      id: 'chatcmpl-y',
      object: 'chat.completion',
      created: 123,
      model: 'qwen2.5:7b',
      system_fingerprint: 'fp_ollama',
      engine: 'ollama',
      backend: 'llama.cpp',
      served_by: 'node-2',
      __verbose: { foo: 1 },
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      choices: [{ index: 0, message: { role: 'assistant', content: 'OK' } }],
    };
    neutralizeEngineFingerprint(body);
    expect(body.system_fingerprint).toBe('fp_dcp');
    expect(body.engine).toBeUndefined();
    expect(body.backend).toBeUndefined();
    expect(body.served_by).toBeUndefined();
    expect(body.__verbose).toBeUndefined();
    // Standard fields untouched.
    expect(body.id).toBe('chatcmpl-y');
    expect(body.object).toBe('chat.completion');
    expect(body.created).toBe(123);
    expect(body.usage).toEqual({ prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 });
    expect(body.choices[0].message.content).toBe('OK');
    // No engine tell anywhere in the serialized body.
    expect(JSON.stringify(body).toLowerCase()).not.toContain('ollama');
    expect(JSON.stringify(body).toLowerCase()).not.toContain('llama.cpp');
  });

  test('is idempotent', () => {
    const body = { system_fingerprint: 'fp_ollama' };
    neutralizeEngineFingerprint(body);
    neutralizeEngineFingerprint(body);
    expect(body.system_fingerprint).toBe('fp_dcp');
  });

  test('is a no-op on non-object input', () => {
    expect(() => neutralizeEngineFingerprint(null)).not.toThrow();
    expect(() => neutralizeEngineFingerprint(undefined)).not.toThrow();
    expect(() => neutralizeEngineFingerprint('x')).not.toThrow();
  });
});
