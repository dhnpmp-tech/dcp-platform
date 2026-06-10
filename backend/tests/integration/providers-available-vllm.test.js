'use strict';

const request = require('supertest');
const express = require('express');

jest.setTimeout(30000);

const mockDb = {
  all: jest.fn(),
  get: jest.fn(),
  run: jest.fn(),
};

jest.mock('../../src/db', () => mockDb);
jest.mock('../../src/routes/jobs', () => ({
  COST_RATES: {
    llm_inference: 15,
    image_generation: 20,
    vllm_serve: 20,
    default: 10,
  },
}));
jest.mock('../../src/services/notifications', () => ({
  sendAlert: jest.fn(),
}));
jest.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: jest.fn(),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  const providersPath = require.resolve('../../src/routes/providers');
  delete require.cache[providersPath];
  app.use('/api/providers', require('../../src/routes/providers'));
  return app;
}

describe('GET /api/providers/available — vLLM capability contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes providers with >=14GB VRAM and exposes vllm_serve cost rate', async () => {
    const nowIso = new Date().toISOString();
    mockDb.all.mockReturnValue([
      {
        id: 11,
        name: 'Low VRAM',
        gpu_model: 'RTX 2060',
        gpu_name_detected: 'RTX 2060',
        gpu_vram_mib: 8 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '7.5',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Riyadh',
        run_mode: 'always-on',
        reliability_score: 95,
        reputation_score: 95,
        cached_models: '[]',
        last_heartbeat: nowIso,
        uptime_percent: 99.1,
        total_jobs: 40,
        is_paused: 0,
        created_at: nowIso,
      },
      {
        id: 22,
        name: 'High VRAM',
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 16 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '8.9',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Jeddah',
        run_mode: 'always-on',
        reliability_score: 99,
        reputation_score: 99,
        cached_models: '[]',
        last_heartbeat: nowIso,
        uptime_percent: 99.9,
        total_jobs: 200,
        is_paused: 0,
        created_at: nowIso,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/providers/available');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.total).toBe(2);

    const vllmCapable = res.body.providers.filter(p => Number(p.vram_gb) >= 14);
    expect(vllmCapable.length).toBeGreaterThan(0);
    expect(vllmCapable.some(p => p.id === 22)).toBe(true);

    res.body.providers.forEach(p => {
      expect(p.cost_rates_halala_per_min.vllm_serve).toBe(20);
    });
  });

  test('qualifies providers.total_jobs in the availability query to avoid SQL ambiguity', async () => {
    const nowIso = new Date().toISOString();
    mockDb.all.mockReturnValue([
      {
        id: 1,
        name: 'Alias Check',
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '8.9',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Riyadh',
        run_mode: 'always-on',
        reliability_score: 99,
        reputation_score: 99,
        cached_models: '[]',
        last_heartbeat: nowIso,
        uptime_percent: 99.9,
        total_jobs: 1,
        is_paused: 0,
        created_at: nowIso,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/providers/available');

    expect(res.status).toBe(200);
    expect(mockDb.all).toHaveBeenCalled();
    const primarySql = String(mockDb.all.mock.calls[0][0] || '');
    expect(primarySql).toMatch(/\bp\.total_jobs\b/);
  });

  test('orders /available by best latency first with deterministic fallback for sparse metrics', async () => {
    const nowMs = Date.now();
    const tenSecondsAgo = new Date(nowMs - 10_000).toISOString();
    const twentySecondsAgo = new Date(nowMs - 20_000).toISOString();
    const fiftySecondsAgo = new Date(nowMs - 50_000).toISOString();

    mockDb.all.mockReturnValue([
      {
        id: 101,
        name: 'No Benchmark Fast Heartbeat',
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '8.9',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Riyadh',
        run_mode: 'always-on',
        reliability_score: 92,
        reputation_score: 88,
        cached_models: '[]',
        last_heartbeat: tenSecondsAgo,
        uptime_percent: 99.1,
        total_jobs: 10,
        is_paused: 0,
        created_at: tenSecondsAgo,
        best_latency_ms: null,
        latest_latency_completed_at: null,
        latency_sample_count: 0,
      },
      {
        id: 102,
        name: 'Benchmarked 40ms',
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '8.9',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Riyadh',
        run_mode: 'always-on',
        reliability_score: 90,
        reputation_score: 70,
        cached_models: '[]',
        last_heartbeat: twentySecondsAgo,
        uptime_percent: 98.5,
        total_jobs: 15,
        is_paused: 0,
        created_at: twentySecondsAgo,
        best_latency_ms: 40,
        latest_latency_completed_at: nowMs,
        latency_sample_count: 3,
      },
      {
        id: 103,
        name: 'Benchmarked 200ms',
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        gpu_driver: '550.54',
        gpu_compute_capability: '8.9',
        gpu_cuda_version: '12.2',
        gpu_count_reported: 1,
        gpu_spec_json: null,
        status: 'online',
        location: 'Riyadh',
        run_mode: 'always-on',
        reliability_score: 99,
        reputation_score: 99,
        cached_models: '[]',
        last_heartbeat: fiftySecondsAgo,
        uptime_percent: 99.8,
        total_jobs: 99,
        is_paused: 0,
        created_at: fiftySecondsAgo,
        best_latency_ms: 200,
        latest_latency_completed_at: nowMs,
        latency_sample_count: 5,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/providers/available');

    expect(res.status).toBe(200);
    expect(res.body.providers.map((p) => p.id)).toEqual([102, 103, 101]);
    expect(res.body.providers[0]).toEqual(expect.objectContaining({
      latency_ms: 40,
      latency_source: 'benchmark',
      latency_sample_count: 3,
    }));
    expect(res.body.providers[2]).toEqual(expect.objectContaining({
      latency_source: 'heartbeat_age',
    }));
  });

  test('orders /marketplace by latency with deterministic tie-breakers', async () => {
    const nowMs = Date.now();
    const tenSecondsAgo = new Date(nowMs - 10_000).toISOString();

    mockDb.all.mockReturnValue([
      {
        id: 201,
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        vram_gb: 24,
        uptime_percent: 99.9,
        total_jobs: 120,
        created_at: tenSecondsAgo,
        last_heartbeat: tenSecondsAgo,
        reputation_score: 70,
        marketplace_rate_halala: 500,
        heartbeats_7d: 1000,
        completed_jobs: 80,
        terminal_jobs: 100,
        total_jobs_all: 100,
        best_latency_ms: 90,
        latest_latency_completed_at: tenSecondsAgo,
        latency_sample_count: 2,
      },
      {
        id: 202,
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        vram_gb: 24,
        uptime_percent: 99.9,
        total_jobs: 120,
        created_at: tenSecondsAgo,
        last_heartbeat: tenSecondsAgo,
        reputation_score: 95,
        marketplace_rate_halala: 500,
        heartbeats_7d: 1000,
        completed_jobs: 80,
        terminal_jobs: 100,
        total_jobs_all: 100,
        best_latency_ms: 90,
        latest_latency_completed_at: tenSecondsAgo,
        latency_sample_count: 2,
      },
      {
        id: 203,
        gpu_model: 'RTX 4090',
        gpu_name_detected: 'RTX 4090',
        gpu_vram_mib: 24 * 1024,
        vram_gb: 24,
        uptime_percent: 99.9,
        total_jobs: 120,
        created_at: tenSecondsAgo,
        last_heartbeat: tenSecondsAgo,
        reputation_score: 10,
        marketplace_rate_halala: 500,
        heartbeats_7d: 1000,
        completed_jobs: 80,
        terminal_jobs: 100,
        total_jobs_all: 100,
        best_latency_ms: 20,
        latest_latency_completed_at: tenSecondsAgo,
        latency_sample_count: 2,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/providers/marketplace');

    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.id)).toEqual([203, 202, 201]);
    expect(res.body[0]).toEqual(expect.objectContaining({
      latency_ms: 20,
      latency_source: 'benchmark',
    }));
    expect(res.body[1]).toEqual(expect.objectContaining({
      latency_ms: 90,
      latency_source: 'benchmark',
    }));
  });
});
