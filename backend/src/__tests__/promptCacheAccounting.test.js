'use strict';

const Database = require('better-sqlite3');
const {
  PROMPT_CACHE_ACCOUNTING_VERSION,
  computePromptCacheAccounting,
  attachPromptCacheUsage,
  buildPromptCacheReadiness,
  ensurePromptCacheAccountingSchema,
  hasPromptCacheMeasurement,
  recordPromptCacheMeasurement,
  __test,
} = require('../services/promptCacheAccounting');

describe('prompt-cache accounting foundation', () => {
  test('builds a measurement-only prompt-cache readiness contract', () => {
    const readiness = buildPromptCacheReadiness(new Date('2026-07-08T19:20:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'prompt_cache_readiness',
      version: PROMPT_CACHE_ACCOUNTING_VERSION,
      generated_at: '2026-07-08T19:20:00.000Z',
      current_mode: 'measurement_only_no_discount',
      status: 'available_measurement_only',
      endpoints: {
        readiness: 'GET /v1/prompt-cache/readiness',
        settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
        chat_completions: 'POST /v1/chat/completions',
      },
      request_hints: {
        static_prefix_fields: ['static_prefix', 'prompt_cache.static_prefix'],
        session_fields: ['prompt_cache.session_id', 'session_id', 'user'],
        supported_surfaces: ['/v1/chat/completions'],
      },
      measurement: {
        hash_only: true,
        stores_raw_prompt: false,
        stores_static_prefix: false,
        tracks_cache_key: true,
        tracks_cached_input_tokens: true,
        prior_hit_detection: true,
      },
      billing: {
        discounts_enabled: false,
        discount_bps: 0,
        billable_input_tokens_discounted: false,
        settlement_discount_enabled: false,
      },
      live_acceptance: {
        provider_discount_smoke: {
          status: 'blocked_external',
          command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
          live_acceptance_gate: 'prompt_cache_provider_discount_smoke',
          acceptance_contract: 'dcp.prompt_cache_live_acceptance_evidence.v1',
        },
      },
      claims: {
        prompt_cache_discount: false,
        provider_kv_cache_control: false,
        tinker_compatible: false,
      },
      next: 'enable_discount_only_after_provider_cache_hit_and_settlement_proof',
    });
    expect(readiness.response_fields).toEqual(expect.arrayContaining([
      'usage.prompt_cache',
      'usage.pricing.prompt_cache',
    ]));
    expect(readiness.live_acceptance.provider_discount_smoke.blocked_on).toEqual(expect.arrayContaining([
      'funded smoke principal',
      'provider cache-hit evidence',
      'settlement discount policy approval',
    ]));
    expect(readiness.live_acceptance.provider_discount_smoke.verifies).toEqual(expect.arrayContaining([
      'live hit metadata',
      'no discount while disabled',
      'redacted proof artifact',
      'future provider KV-cache control remains gated',
      'future discounted settlement proof remains gated',
      'settlement discount policy remains disabled',
    ]));
    expect(readiness.live_acceptance.provider_discount_smoke.required_evidence.map((item) => item.id)).toEqual(expect.arrayContaining([
      'readiness_measurement_mode_verified',
      'first_measurement_request_verified',
      'second_hit_measurement_verified',
      'redacted_artifact_verified',
    ]));
    expect(readiness.live_acceptance.provider_discount_smoke.future_discount_required_evidence.map((item) => item.id)).toEqual(expect.arrayContaining([
      'provider_kv_cache_control_verified',
      'discount_policy_approved',
      'discounted_settlement_proof_verified',
    ]));
  });

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
      pricing: {
        currency: 'USD',
        usd_total: '0.000025',
      },
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
      pricing: {
        currency: 'USD',
        usd_total: '0.000025',
        cached_input_tokens: 0,
        billable_input_tokens: 25,
        prompt_cache_discount_applied: false,
        prompt_cache_discount_bps: 0,
        prompt_cache: {
          eligible: true,
          cached_input_tokens: 0,
          billable_input_tokens: 25,
          discount_applied: false,
          discount_bps: 0,
        },
      },
    });
  });

  test('records hash-only measurements and detects future hits without discounting', () => {
    const db = new Database(':memory:');
    ensurePromptCacheAccountingSchema(db);

    const miss = computePromptCacheAccounting({
      model: 'qwen',
      staticPrefix: 'Shared prefix',
      sessionId: 'session-a',
      promptTokens: 100,
    });
    expect(hasPromptCacheMeasurement(db, 1, miss.cache_key)).toBe(false);

    const recorded = recordPromptCacheMeasurement(db, 1, miss, {
      model: 'qwen',
      requestId: 'req-1',
      providerResponseId: 'chatcmpl-1',
    });
    expect(recorded).toMatchObject({
      recorded: true,
      cache_key: miss.cache_key,
    });
    expect(hasPromptCacheMeasurement(db, 1, miss.cache_key)).toBe(true);

    const hit = computePromptCacheAccounting({
      model: 'qwen',
      staticPrefix: 'Shared prefix',
      sessionId: 'session-a',
      promptTokens: 100,
      priorCacheKeys: new Set([miss.cache_key]),
    });
    expect(hit).toMatchObject({
      status: 'hit_measured_no_discount',
      billable_input_tokens: 100,
      discount_applied: false,
    });

    const row = db.prepare('SELECT * FROM prompt_cache_measurements WHERE cache_key = ?').get(miss.cache_key);
    expect(row).toMatchObject({
      renter_id: 1,
      model_id: 'qwen',
      request_id: 'req-1',
      discount_applied: 0,
      discount_bps: 0,
    });
    expect(JSON.stringify(row)).not.toContain('Shared prefix');
  });
});
