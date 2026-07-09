const express = require('express');
const request = require('supertest');

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
  prepare: jest.fn(),
  _db: {
    transaction: jest.fn((fn) => fn),
  },
};
const mockRecordOpenRouterUsage = jest.fn(() => ({ id: 'oru_vllm_test' }));

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  vllmCompleteLimiter: (req, res, next) => next(),
  vllmStreamLimiter: (req, res, next) => next(),
}));
jest.mock('../services/openrouterSettlementService', () => ({
  recordOpenRouterUsage: (...args) => mockRecordOpenRouterUsage(...args),
}));

describe('vllm usage ledger persistence', () => {
  let app;
  let runMock;

  beforeEach(() => {
    jest.resetModules();
    runMock = jest.fn(() => ({ changes: 1, lastInsertRowid: 1 }));
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    mockDb.prepare.mockReset().mockReturnValue({ run: runMock });
    mockDb._db.transaction = jest.fn((fn) => fn);
    mockRecordOpenRouterUsage.mockReset();

    const router = require('../routes/vllm');
    app = express();
    app.use(express.json());
    app.use('/api/vllm', router);
  });

  function wireBaselineDbMocks() {
    mockDb.all.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('FROM providers')) {
        return [{
          id: 77,
          status: 'online',
          is_paused: 0,
          deleted_at: null,
          supported_compute_types: '["inference"]',
          vram_gb: 24,
          last_heartbeat: new Date().toISOString(),
          vllm_endpoint_url: 'http://provider.test',
          gpu_util_pct: 5,
        }];
      }
      return [];
    });

    mockDb.get.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('FROM renter_api_keys')) return null;
      if (query.includes('FROM renters WHERE api_key')) return { id: 31, api_key: 'renter-key', balance_halala: 50000, status: 'active' };
      if (query.includes('FROM model_registry')) {
        return { model_id: 'meta-llama/Meta-Llama-3-8B-Instruct', display_name: 'Llama', min_gpu_vram_gb: 8, default_price_halala_per_min: 20 };
      }
      if (query.includes('FROM cost_rates')) return { token_rate_halala: 2 };
      return null;
    });
  }

  test('persists canonical usage metadata on successful /api/vllm/chat/completions request', async () => {
    wireBaselineDbMocks();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from provider' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      }),
    });

    const res = await request(app)
      .post('/api/vllm/chat/completions')
      .set('x-renter-key', 'renter-key')
      .set('Idempotency-Key', 'vllm-req-1')
      .send({
        model: 'meta-llama/Meta-Llama-3-8B-Instruct',
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(res.status).toBe(200);
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);
    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('vllm-req-1');
    expect(payload.jobId).toMatch(/^job-/);
    expect(payload.requestPath).toBe('/chat/completions');
    expect(payload.source).toBe('api_vllm');
    expect(payload.renterId).toBe(31);
    expect(payload.providerId).toBe(77);
    expect(payload.model).toBe('meta-llama/Meta-Llama-3-8B-Instruct');
    expect(payload.promptTokens).toBe(12);
    expect(payload.completionTokens).toBe(5);
    expect(payload.totalTokens).toBe(17);
    expect(payload.tokenRateHalala).toBe(2);
    expect(payload.costHalala).toBe(34);
    expect(payload.renterApiKeyId).toBeNull();
    expect(payload.renterKeyType).toBe('master_key');

    fetchSpy.mockRestore();
  });

  test('persists scoped key attribution on /api/vllm/chat/completions request', async () => {
    wireBaselineDbMocks();
    mockDb.get.mockImplementation((sql) => {
      const query = String(sql);
      if (query.includes('FROM renter_api_keys')) {
        return {
          id: 'vllm-scoped-key-1',
          renter_id: 31,
          scopes: JSON.stringify(['inference']),
          expires_at: null,
          revoked_at: null,
          r_id: 31,
          api_key: 'renter-key',
          balance_halala: 50000,
          status: 'active',
        };
      }
      if (query.includes('FROM model_registry')) {
        return { model_id: 'meta-llama/Meta-Llama-3-8B-Instruct', display_name: 'Llama', min_gpu_vram_gb: 8, default_price_halala_per_min: 20 };
      }
      if (query.includes('FROM cost_rates')) return { token_rate_halala: 2 };
      return null;
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'scoped response' } }],
        usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
      }),
    });

    const res = await request(app)
      .post('/api/vllm/chat/completions')
      .set('x-renter-key', 'scoped-vllm-key')
      .set('Idempotency-Key', 'vllm-scoped-req-1')
      .send({
        model: 'meta-llama/Meta-Llama-3-8B-Instruct',
        messages: [{ role: 'user', content: 'hello scoped vllm' }],
      });

    expect(res.status).toBe(200);
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);
    const payload = mockRecordOpenRouterUsage.mock.calls[0][1];
    expect(payload.requestId).toBe('vllm-scoped-req-1');
    expect(payload.renterId).toBe(31);
    expect(payload.renterApiKeyId).toBe('vllm-scoped-key-1');
    expect(payload.renterKeyType).toBe('scoped_key');

    fetchSpy.mockRestore();
  });

  test('does not crash completion request when usage persistence throws', async () => {
    wireBaselineDbMocks();
    mockRecordOpenRouterUsage.mockImplementation(() => {
      throw new Error('simulated usage ledger write failure');
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'still succeeds' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }),
    });

    const res = await request(app)
      .post('/api/vllm/chat/completions')
      .set('x-renter-key', 'renter-key')
      .set('Idempotency-Key', 'vllm-req-2')
      .send({
        model: 'meta-llama/Meta-Llama-3-8B-Instruct',
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(res.status).toBe(200);
    expect(res.body?.choices?.[0]?.message?.content).toBe('still succeeds');
    expect(mockRecordOpenRouterUsage).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});
