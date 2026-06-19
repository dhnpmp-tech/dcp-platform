/**
 * SITE-15 regression: thinking models (qwen3:4b, qwen3:8b, QwQ, DeepSeek-R1)
 * can exhaust their output budget on internal reasoning and return content=""
 * with finish_reason="length". Two guards protect a normal agent chat call:
 *
 *   1. A higher DEFAULT max_tokens for thinking-capable models when the caller
 *      sends no explicit budget (verified indirectly via isThinkingCapableModel,
 *      the predicate the route uses to pick the default).
 *   2. stripReasoningFromObject salvages the separated reasoning text into
 *      `content` when stripping would otherwise ship an empty body.
 *
 * Scope: helper-level unit tests via the route module's __test export.
 */

'use strict';

process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test-admin-reasoning';
process.env.DC1_HMAC_SECRET = 'test-hmac-secret-reasoning-32-byte-key!!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOtp: jest.fn(), getUser: jest.fn() } })),
}));

const v1Router = require('../../src/routes/v1');
const { stripReasoningFromObject, isThinkingCapableModel } = v1Router.__test;

describe('isThinkingCapableModel (default-budget selector)', () => {
  test.each([
    'qwen3:4b',
    'qwen3:8b',
    'qwen/qwen3-4b-instruct',
    'qwq:32b',
    'deepseek-r1:7b',
  ])('treats %s as thinking-capable', (modelId) => {
    expect(isThinkingCapableModel(modelId)).toBe(true);
  });

  test.each([
    'qwen2.5:7b',
    'qwen2.5vl:3b',
    'llama3.1:8b',
    'mistral:7b',
  ])('treats %s as a plain chat model', (modelId) => {
    expect(isThinkingCapableModel(modelId)).toBe(false);
  });
});

describe('stripReasoningFromObject — empty-content salvage', () => {
  test('promotes separated reasoning into content when content is empty', () => {
    const msg = { role: 'assistant', content: '', reasoning: 'The answer is 42.' };
    stripReasoningFromObject(msg);
    expect(msg.content).toBe('The answer is 42.');
    expect(msg.reasoning).toBeUndefined();
    expect(msg.reasoning_content).toBeUndefined();
    expect(msg.thinking).toBeUndefined();
  });

  test('salvages from reasoning_content (vLLM) and thinking (Ollama native)', () => {
    const a = { content: '', reasoning_content: 'vllm answer' };
    stripReasoningFromObject(a);
    expect(a.content).toBe('vllm answer');

    const b = { content: '   ', thinking: 'native answer' };
    stripReasoningFromObject(b);
    expect(b.content).toBe('native answer');
  });

  test('keeps real content and still drops reasoning when both present', () => {
    const msg = { content: 'Paris is the capital of France.', reasoning: 'thinking out loud' };
    stripReasoningFromObject(msg);
    expect(msg.content).toBe('Paris is the capital of France.');
    expect(msg.reasoning).toBeUndefined();
  });

  test('strips inline <think> blocks and salvages from reasoning when left empty', () => {
    const msg = { content: '<think>only thoughts</think>', reasoning: 'fallback answer' };
    stripReasoningFromObject(msg);
    expect(msg.content).toBe('fallback answer');
  });

  test('cleans nested <think> tags out of salvaged reasoning', () => {
    const msg = { content: '', reasoning: '<think>noise</think>real answer' };
    stripReasoningFromObject(msg);
    expect(msg.content).toBe('real answer');
  });

  test('leaves empty content empty when there is no reasoning to salvage', () => {
    const msg = { content: '', reasoning: '' };
    stripReasoningFromObject(msg);
    expect(msg.content).toBe('');
  });

  test('is a no-op on non-objects', () => {
    expect(() => stripReasoningFromObject(null)).not.toThrow();
    expect(() => stripReasoningFromObject(undefined)).not.toThrow();
  });
});
