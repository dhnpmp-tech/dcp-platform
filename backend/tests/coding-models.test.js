'use strict';

/**
 * coding-models.test.js — GET /v1/coding/models (dcp launcher, Task 6)
 *
 * The curated coding-model catalog the `dcp` CLI shows in its picker:
 *   1. Lists curated models with id, label, vram_gb, and per-1M pricing
 *   2. status 'available' when a reachable vLLM engine serves the model
 *   3. status 'busy' when no reachable vLLM engine serves it
 *   4. Public (no auth) — the CLI shows models before login
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const db = require('../src/db');

const MODEL = 'qwen3-30b-a3b';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1', require('../src/routes/v1'));
  return app;
}

function cleanDb() {
  const safe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {} };
  for (const t of ['provider_engines', 'providers', 'jobs']) safe(t);
}

function seedProvider({ engineReachable = 1 } = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO providers (id, name, email, api_key, created_at)
     VALUES (911, 'p911', 'p911@test', 'pk911', ?)`
  ).run(now);
  db.prepare(
    `UPDATE providers SET status='online', is_paused=0, deleted_at=NULL,
       endpoint_reachable=1, endpoint_probed_at=? WHERE id=911`
  ).run(now);
  db.prepare(
    `INSERT INTO provider_engines
       (provider_id, engine_type, base_url, port, served_models, reachable, last_seen_at)
     VALUES (911, 'vllm', 'http://10.0.0.9:8000/v1', 8000, ?, ?, ?)`
  ).run(JSON.stringify([MODEL]), engineReachable, now);
}

beforeEach(cleanDb);

describe('GET /v1/coding/models', () => {
  test('lists the curated model as available when a vLLM engine serves it', async () => {
    seedProvider({ engineReachable: 1 });
    const r = await request(createApp()).get('/v1/coding/models');
    expect(r.status).toBe(200);
    const m = r.body.models.find((x) => x.id === MODEL);
    expect(m).toBeDefined();
    expect(m.status).toBe('available');
    expect(typeof m.label).toBe('string');
    expect(typeof m.vram_gb).toBe('number');
    expect(m.price_in_halala_per_1m).toBeGreaterThan(0);
    expect(m.price_out_halala_per_1m).toBeGreaterThan(0);
  });

  test('marks the model busy when no reachable vLLM engine serves it', async () => {
    seedProvider({ engineReachable: 0 });
    const r = await request(createApp()).get('/v1/coding/models');
    expect(r.status).toBe(200);
    const m = r.body.models.find((x) => x.id === MODEL);
    expect(m).toBeDefined();
    expect(m.status).toBe('busy');
  });

  test('is public — no API key required', async () => {
    const r = await request(createApp()).get('/v1/coding/models');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.models)).toBe(true);
  });
});
