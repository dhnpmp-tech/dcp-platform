'use strict';

const {
  computePromptCacheAccounting,
  attachPromptCacheUsage,
  __test,
} = require('../services/promptCacheAccounting');

describe('prompt-cache accounting foundation', () => {
  test('builds a stable cache key from leading system/developer prefix messages', () => {
    const input = {
      model: 'qwen/qwen3-coder',
      sessionId: 'session-123',
      promptTokens: 120,
      messages: [
        { role: 'system', content: 'You are a Saudi Arabic support assistant.' },
        { role: 'developer', content: 'Answer with concise citations.' },
        { role: 'user', content: 'What is my bill?' },
      ],
    };

    const first = computePromptCacheAccounting(input);
    const second = computePromptCacheAccounting({
      ...input,
      messages: [
        { content: 'You are a Saudi Arabic support assistant.', role: 'system' },
        { content: 'Answer with concise citations.', role: 'developer' },
        { content: 'What is my bill?', role: 'user' },
      ],
    });

    expect(first.eligible).toBe(true);
    expect(first.status).toBe('miss_measured');
    expect(first.static_prefix_source).toBe('leading_system_messages');
    expect(first.cache_key).toBe(second.cache_key);
    expect(first.session_id_hash).toHaveLength(24);
    expect(first.billable_input_tokens).toBe(120);
    expect(first.discount_applied).toBe(false);
  });

  test('measured cache hit never discounts billable input tokens in this slice', () => {
    const miss = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      promptTokens: 200,
      staticPrefix: 'Shared legal policy context.',
    });
    const hit = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      promptTokens: 200,
      staticPrefix: 'Shared legal policy context.',
      priorCacheKeys: new Set([miss.cache_key]),
    });

    expect(hit.status).toBe('hit_measured_no_discount');
    expect(hit.cached_input_tokens).toBeGreaterThan(0);
    expect(hit.billable_input_tokens).toBe(200);
    expect(hit.discount_bps).toBe(0);
    expect(hit.discount_applied).toBe(false);
  });

  test('different model or prefix produces a different cache key', () => {
    const base = computePromptCacheAccounting({
      model: 'model-a',
      promptTokens: 64,
      staticPrefix: 'Shared prefix',
    });
    const differentModel = computePromptCacheAccounting({
      model: 'model-b',
      promptTokens: 64,
      staticPrefix: 'Shared prefix',
    });
    const differentPrefix = computePromptCacheAccounting({
      model: 'model-a',
      promptTokens: 64,
      staticPrefix: 'Different prefix',
    });

    expect(base.cache_key).not.toBe(differentModel.cache_key);
    expect(base.cache_key).not.toBe(differentPrefix.cache_key);
  });

  test('legacy prompts without explicit static prefix are not eligible', () => {
    const accounting = computePromptCacheAccounting({
      model: 'legacy',
      prompt: 'Tell me something.',
      promptTokens: 20,
    });

    expect(accounting.eligible).toBe(false);
    expect(accounting.status).toBe('legacy_prompt_prefix_unset');
    expect(accounting.cache_key).toBeNull();
    expect(accounting.billable_input_tokens).toBe(20);
  });

  test('multimodal content is hash-normalized for cache keys', () => {
    const normalized = __test.normalizeContent([
      { type: 'text', text: 'Look at this image.' },
      { type: 'image_url', image_url: { url: 'https://example.com/private.png' } },
    ]);

    expect(normalized[1]).toEqual({
      type: 'image_url',
      image_url_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(normalized)).not.toContain('private.png');
  });

  test('attaches future-compatible usage fields without changing token totals', () => {
    const accounting = computePromptCacheAccounting({
      model: 'qwen',
      staticPrefix: 'Shared prefix',
      promptTokens: 25,
    });
    const usage = attachPromptCacheUsage({
      prompt_tokens: 25,
      completion_tokens: 5,
      total_tokens: 30,
    }, accounting);

    expect(usage).toMatchObject({
      prompt_tokens: 25,
      completion_tokens: 5,
      total_tokens: 30,
      prompt_cache: {
        eligible: true,
        cached_input_tokens: 0,
        billable_input_tokens: 25,
        discount_applied: false,
        discount_bps: 0,
      },
    });
  });
});
