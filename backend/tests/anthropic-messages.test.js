'use strict';

/**
 * anthropic-messages.test.js — renter-facing Anthropic surface (dcp launcher, Task 2)
 *
 * POST /anthropic/v1/messages must:
 *   1. 401 when no renter key is presented
 *   2. 401 when a PROVIDER key is presented (wrong key type on a renter path)
 *   3. Proxy an authed request to the provider's vLLM native /v1/messages
 *      (resolved via provider_engines) and return the upstream JSON unchanged
 *   4. Pass anthropic-version / anthropic-beta headers through to the upstream
 *   5. Return an Anthropic-shaped 503 error when no provider serves the model
 *
 * Uses in-memory SQLite (tests/jest-setup.js) + a real local HTTP server as
 * the fake vLLM upstream. The existing /api/agent/gateway/v1/messages (Nexus
 * brain) is intentionally untouched by this feature.
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const request = require('supertest');
const express = require('express');
const db = require('../src/db');

const RENTER_KEY = 'dcp-renter-anthromsg-test-key';
const PROVIDER_KEY = 'dcp-provider-anthromsg-test-key';
const MODEL = 'qwen3-30b-a3b';

const UPSTREAM_REPLY = {
  id: 'msg_test_1',
  type: 'message',
  role: 'assistant',
  content: [
    { type: 'text', text: 'hello from fake vllm' },
    { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: './x' } },
  ],
  model: MODEL,
  stop_reason: 'tool_use',
  usage: { input_tokens: 10, output_tokens: 5 },
};

let upstream;            // fake vLLM http server
let upstreamPort;
let lastUpstreamReq;     // { url, headers, body } captured per request

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/anthropic', require('../src/routes/anthropic'));
  return app;
}

function seed() {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO renters (id, name, email, api_key, status, balance_halala, created_at)
     VALUES (901, 'Anthro Test', 'anthro@test', ?, 'active', 5000, ?)`
  ).run(RENTER_KEY, now);
  db.prepare(
    `INSERT INTO providers (id, name, email, api_key, created_at)
     VALUES (902, 'p902', 'p902@test', ?, ?)`
  ).run(PROVIDER_KEY, now);
  db.prepare(
    `UPDATE providers SET status='online', is_paused=0, deleted_at=NULL,
       endpoint_reachable=1, endpoint_probed_at=? WHERE id=902`
  ).run(now);
  db.prepare(
    `INSERT INTO provider_engines
       (provider_id, engine_type, base_url, port, served_models, reachable, last_seen_at)
     VALUES (902, 'vllm', ?, ?, ?, 1, ?)`
  ).run(`http://127.0.0.1:${upstreamPort}/v1`, upstreamPort, JSON.stringify([MODEL]), now);
}

function cleanDb() {
  const safe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {} };
  for (const t of ['provider_engines', 'providers', 'renters', 'renter_api_keys', 'jobs']) safe(t);
}

beforeAll((done) => {
  upstream = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      lastUpstreamReq = { url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(UPSTREAM_REPLY));
    });
  });
  upstream.listen(0, '127.0.0.1', () => {
    upstreamPort = upstream.address().port;
    done();
  });
});

afterAll((done) => { upstream.close(done); });

beforeEach(() => { cleanDb(); seed(); lastUpstreamReq = null; });

const app = () => createApp();

describe('POST /anthropic/v1/messages', () => {
  test('401 without a key', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(401);
  });

  test('401 with a provider key (wrong key type)', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${PROVIDER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(401);
  });

  test('proxies to the provider vLLM /v1/messages and returns upstream JSON', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(200);
    expect(r.body.type).toBe('message');
    expect(r.body.content[0].text).toBe('hello from fake vllm');
    expect(r.body.content[1].type).toBe('tool_use');
    expect(lastUpstreamReq.url).toBe('/v1/messages');
    expect(lastUpstreamReq.body.model).toBe(MODEL);
  });

  test('passes anthropic-version and anthropic-beta headers through', async () => {
    await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .set('anthropic-version', '2023-06-01')
      .set('anthropic-beta', 'prompt-caching-2024-07-31')
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(lastUpstreamReq.headers['anthropic-version']).toBe('2023-06-01');
    expect(lastUpstreamReq.headers['anthropic-beta']).toBe('prompt-caching-2024-07-31');
  });

  test('503 Anthropic-shaped error when no provider serves the model', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: 'no-such-model', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(503);
    expect(r.body.type).toBe('error');
    expect(r.body.error.type).toBe('overloaded_error');
  });
});
