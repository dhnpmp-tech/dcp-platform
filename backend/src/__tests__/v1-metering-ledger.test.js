const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
  prepare: jest.fn(() => ({ run: jest.fn() })),
};
const mockRecordOpenRouterUsage = jest.fn(() => ({ id: 'oru_stream_test' }));
const mockSelectProvidersWithLatencyGate = jest.fn();
const mockRecordStreamOutcome = jest.fn();

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  vllmCompleteLimiter: (req, res, next) => next(),
  vllmStreamLimiter: (req, res, next) => next(),
}));
jest.mock('../services/openrouterSettlementService', () => ({
  recordOpenRouterUsage: (...args) => mockRecordOpenRouterUsage(...args),
}));
jest.mock('../services/inferenceLatencyBudgetGate', () => ({
  selectProvidersWithLatencyGate: (...args) => mockSelectProvidersWithLatencyGate(...args),
  recordStreamOutcome: (...args) => mockRecordStreamOutcome(...args),
  resolveProviderTier: () => 'direct',
}));

function provider(id, endpointUrl = 'http://provider.test') {
  return {
    id,
    status: 'online',
    is_paused: 0,
    deleted_at: null,
    supported_compute_types: '["inference"]',
    vram_gb: 24,
    last_heartbeat: new Date().toISOString(),
    vllm_endpoint_url: endpointUrl,
    gpu_util_pct: 1,
  };
}

describe('v1 chat metering ledger persistence', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    mockDb.prepare.mockReset().mockReturnValue({ run: jest.fn() });
    mockRecordOpenRouterUsage.mockReset();
    mockSelectProvidersWithLatencyGate.mockReset();
    mockRecordStreamOutcome.mockReset();

    mockSelectProvidersWithLatencyGate.mockImplementation(({ providers = [] }) => ({
      pass: true,
      selectedProviderId: providers[0]?.id || null,
      fallbackProviderIds: providers.slice(1).map((p) => p.id),
      mode: 'strict',
      reasons: [],
      tiers: [],
      thresholds: {
        maxP50Ms: 10000,
        baselineP95Ms: 0,
        maxP95RegressionPct: 100,
        baselineStreamFailureRate: 0,
        maxStreamFailureRegressionPct: 100,
        minLatencySamples: 0,
        minStreamSamples: 0,
      },
    }));

    const router = require('../routes/v1');
    app = express();
    app.use(express.json());
    app.use('/v1', router);
  });

  function wireBaselineDbMocks({ providers = [provider(55)], tokenRate = 2 } = {}) {
    mockDb.all.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('PRAGMA table_info(model_registry)')) {
        return [{ name: 'model_id' }, { name: 'min_gpu_vram_gb' }, { name: 'context_window' }];
      }
      if (query.includes('FROM providers')) return providers;
      return [];
    });

    mockDb.get.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('FROM renter_api_keys')) return null;
      if (query.includes('FROM renters WHERE api_key')) return { id: 7, api_key: 'test-key', balance_halala: 50000, status: 'active' };
      if (query.includes('FROM model_registry WHERE model_id = ?')) return { model_id: 'stream-model', min_gpu_vram_gb: 8, context_window: 4096 };
      if (query.includes('FROM cost_rates')) return { token_rate_halala: tokenRate };
      if (query.includes('FROM jobs WHERE job_id')) return null;
      return null;
    });
  }

  test('persists non-stream completion usage on primary provider', async () => {
    wireBaselineDbMocks();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-primary-1',
        object: 'chat.completion',
        model: 'stream-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hello primary' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
      }),
    });

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-key')
      .set('Idempotency-Key', 'req-primary-123')
      .send({
        model: 'stream-model',
        stream: false,
        messages: [{ role: 'user', content: 'hello primary' }],
      });

    expect(res.status).toBe(200);
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);
    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('req-primary-123');
    expect(payload.providerId).toBe(55);
    expect(payload.providerResponseId).toBe('chatcmpl-primary-1');
    expect(payload.promptTokens).toBe(9);
    expect(payload.completionTokens).toBe(4);
    expect(payload.totalTokens).toBe(13);
    expect(payload.promptCostHalala).toBe(1);
    expect(payload.completionCostHalala).toBe(0);
    expect(payload.costHalala).toBe(1);
    expect(payload.usdPrompt).toBe('0.002667');
    expect(payload.usdCompletion).toBe('0.000000');
    expect(payload.usdTotal).toBe('0.002667');
    expect(payload.settlementStatus).toBe('pending');

    fetchSpy.mockRestore();
  });

  test('persists streamed completion usage exactly once with request id', async () => {
    wireBaselineDbMocks();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: Readable.from([
        'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n\n',
        'data: [DONE]\n\n',
      ]),
    });

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-key')
      .set('Idempotency-Key', 'req-stream-123')
      .send({
        model: 'stream-model',
        stream: true,
        messages: [{ role: 'user', content: 'hello stream' }],
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('data: [DONE]');
    expect(res.text).toContain('"pricing":{"currency":"USD","usd_prompt":"0.002667","usd_completion":"0.000000","usd_total":"0.002667"}');
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);
    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('req-stream-123');
    expect(payload.providerId).toBe(55);
    expect(payload.providerResponseId).toBe('chatcmpl-stream-1');
    expect(payload.requestPath).toBe('/chat/completions');
    expect(payload.tokenRateHalala).toBe(2);
    expect(payload.promptTokens).toBe(11);
    expect(payload.completionTokens).toBe(7);
    expect(payload.totalTokens).toBe(18);
    expect(payload.promptCostHalala).toBe(1);
    expect(payload.completionCostHalala).toBe(0);
    expect(payload.costHalala).toBe(1);
    expect(payload.usdPrompt).toBe('0.002667');
    expect(payload.usdCompletion).toBe('0.000000');
    expect(payload.usdTotal).toBe('0.002667');
    expect(payload.settlementStatus).toBe('pending');

    fetchSpy.mockRestore();
  });

  test('persists usage against fallback provider when primary provider fails', async () => {
    wireBaselineDbMocks({
      providers: [
        provider(55, 'http://provider-primary.test'),
        provider(56, 'http://provider-fallback.test'),
      ],
    });

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-fallback-1',
          object: 'chat.completion',
          model: 'stream-model',
          choices: [{ index: 0, message: { role: 'assistant', content: 'fallback response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        }),
      });

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-key')
      .set('Idempotency-Key', 'req-fallback-123')
      .send({
        model: 'stream-model',
        messages: [{ role: 'user', content: 'hello fallback' }],
      });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);

    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('req-fallback-123');
    expect(payload.providerId).toBe(56);
    expect(payload.providerResponseId).toBe('chatcmpl-fallback-1');
    expect(payload.promptTokens).toBe(10);
    expect(payload.completionTokens).toBe(3);
    expect(payload.totalTokens).toBe(13);
    expect(payload.promptCostHalala).toBe(1);
    expect(payload.completionCostHalala).toBe(0);
    expect(payload.costHalala).toBe(1);
    expect(payload.usdPrompt).toBe('0.002667');
    expect(payload.usdCompletion).toBe('0.000000');
    expect(payload.usdTotal).toBe('0.002667');
    expect(payload.settlementStatus).toBe('pending');

    fetchSpy.mockRestore();
  });

  test('persists failed metering row when failover is exhausted', async () => {
    wireBaselineDbMocks({
      providers: [
        provider(55, 'http://provider-primary.test'),
        provider(56, 'http://provider-fallback.test'),
      ],
    });

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
      });

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-key')
      .set('Idempotency-Key', 'req-failed-123')
      .send({
        model: 'stream-model',
        messages: [{ role: 'user', content: 'hello failure path' }],
      });

    expect(res.status).toBe(503);
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);
    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('req-failed-123');
    expect(payload.providerId).toBe(55);
    expect(payload.settlementStatus).toBe('failed');
    expect(payload.promptTokens).toBeGreaterThan(0);
    expect(payload.completionTokens).toBe(0);
    expect(payload.totalTokens).toBe(payload.promptTokens);
    expect(payload.promptCostHalala).toBeGreaterThan(0);
    expect(payload.completionCostHalala).toBe(0);
    expect(typeof payload.usdPrompt).toBe('string');
    expect(payload.usdCompletion).toBe('0.000000');
    expect(typeof payload.usdTotal).toBe('string');

    fetchSpy.mockRestore();
  });

  test('persists duration_seconds on non-stream proxy job row (P3 cosmetic fix)', async () => {
    wireBaselineDbMocks();

    // Capture INSERT INTO jobs calls so we can inspect the row that gets
    // written. The baseline mock returns a single shared `run` fn for every
    // prepare(); for this test we want per-statement isolation.
    const jobInsertRuns = [];
    mockDb.prepare.mockReset();
    mockDb.prepare.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('INSERT OR IGNORE INTO jobs') && query.includes('v1:proxy:chat/completions')) {
        return {
          run: (...args) => {
            jobInsertRuns.push({ sql: query, args });
          },
        };
      }
      return { run: jest.fn() };
    });

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      // Introduce a small delay so duration_seconds rounds to >= 0 and the
      // computation path is exercised. We don't assert a specific value
      // because wall-clock under test is jittery — we just assert the column
      // is in the SQL, the value is finite, and it's not null.
      await new Promise((r) => setTimeout(r, 5));
      return {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-duration-1',
          object: 'chat.completion',
          model: 'stream-model',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      };
    });

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-key')
      .set('Idempotency-Key', 'req-duration-1')
      .send({
        model: 'stream-model',
        stream: false,
        messages: [{ role: 'user', content: 'duration smoke' }],
      });

    expect(res.status).toBe(200);
    expect(jobInsertRuns.length).toBe(1);
    const insert = jobInsertRuns[0];
    // The column list must include duration_seconds.
    expect(insert.sql).toMatch(/duration_seconds/);
    // The proxy INSERT bind-order (post-fix):
    //   proxyJobId, provider_id, renter_id, model, proxyStartedAt,
    //   proxyStartedAt, proxyNow, proxyDurationSeconds, ...
    // duration_seconds is the 8th positional arg.
    const durationSecondsArg = insert.args[7];
    expect(typeof durationSecondsArg).toBe('number');
    expect(Number.isFinite(durationSecondsArg)).toBe(true);
    expect(durationSecondsArg).toBeGreaterThanOrEqual(0);

    fetchSpy.mockRestore();
  });
});
