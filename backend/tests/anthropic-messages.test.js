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
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');
const db = require('../src/db');

// Settlement tables live in migrations (no auto-runner) — apply the two the
// money path needs. 021 contains ALTER TABLE ADD COLUMN statements that are
// not re-runnable against the db.js bootstrap schema, so apply statement-by-
// statement and tolerate duplicates.
for (const mig of ['010_usage_events.sql', '021_billing_rewrite_and_auto_topup.sql']) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', mig), 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, '')) // comments can contain ';' — strip first
    .join('\n');
  for (const stmt of sql.split(';')) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    try { (db._db || db).exec(trimmed); } catch (_) { /* already applied */ }
  }
}

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
  for (const t of [
    'provider_engines', 'providers', 'renters', 'renter_api_keys', 'jobs',
    'usage_events', 'billing_attempts', 'subscription_credits',
  ]) safe(t);
}

const BROKE_RENTER_KEY = 'dcp-renter-anthromsg-broke-key';

function seedBrokeRenter() {
  db.prepare(
    `INSERT INTO renters (id, name, email, api_key, status, balance_halala, created_at)
     VALUES (903, 'Broke Test', 'broke@test', ?, 'active', 0, ?)`
  ).run(BROKE_RENTER_KEY, new Date().toISOString());
}

function renterBalance(id) {
  return db.prepare('SELECT balance_halala FROM renters WHERE id = ?').get(id).balance_halala;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SSE_FRAMES = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_s1","role":"assistant","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_s1","name":"read_file","input":{}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"./x\\"}"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

beforeAll((done) => {
  upstream = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      lastUpstreamReq = { url: req.url, headers: req.headers, body };
      if (body && body.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        // Two write() calls so piping is exercised across chunk boundaries.
        res.write(SSE_FRAMES.slice(0, 2).join(''));
        setTimeout(() => { res.write(SSE_FRAMES.slice(2).join('')); res.end(); }, 20);
        return;
      }
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

  test('stream:true pipes upstream SSE through unchanged (Task 3)', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, stream: true, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    const text = r.text;
    // All four frames arrive, in order, byte-for-byte (tool_use + input_json_delta intact).
    expect(text).toBe(SSE_FRAMES.join(''));
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

  // ── Task 4: balance gate + settlement + count_tokens + tools round-trip ──

  test('402 when the renter has no balance and no credits (Task 4)', async () => {
    seedBrokeRenter();
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${BROKE_RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(402);
    expect(r.body.type).toBe('error');
    expect(lastUpstreamReq).toBeNull(); // never reached the provider
  });

  test('settles billing once after a non-streaming completion (Task 4)', async () => {
    const before = renterBalance(901);
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(200);
    const after = renterBalance(901);
    expect(after).toBeLessThan(before); // debited
    const events = db.prepare(
      `SELECT COUNT(*) AS c FROM usage_events WHERE renter_id = 901`
    ).get().c;
    expect(events).toBe(1);
  });

  test('settles billing after a streaming completion using the message_delta usage (Task 4)', async () => {
    const before = renterBalance(901);
    const r = await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, stream: true, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(200);
    await wait(80); // settlement runs at stream end
    const after = renterBalance(901);
    expect(after).toBeLessThan(before);
    const events = db.prepare(
      `SELECT COUNT(*) AS c FROM usage_events WHERE renter_id = 901`
    ).get().c;
    expect(events).toBe(1);
  });

  test('hoists role:"system" messages into the top-level system field (vLLM strict-role fix)', async () => {
    // Claude Code injects system-role entries INSIDE messages[]; vLLM's
    // Anthropic endpoint strictly allows user|assistant only. The proxy must
    // hoist them into the spec-correct top-level `system` field.
    await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({
        model: MODEL, max_tokens: 64,
        system: 'base system',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'system', content: 'injected reminder' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'go' },
        ],
      });
    const sent = lastUpstreamReq.body;
    expect(sent.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    expect(sent.messages).toHaveLength(3);
    expect(sent.system).toContain('base system');
    expect(sent.system).toContain('injected reminder');
  });

  test('tools + tool_result round-trip to the upstream unchanged (Task 4)', async () => {
    const tools = [{ name: 'read_file', description: 'r', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }];
    const messages = [
      { role: 'user', content: 'read x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_9', name: 'read_file', input: { path: './x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: 'file body' }] },
    ];
    await request(app())
      .post('/anthropic/v1/messages')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, max_tokens: 64, tools, messages });
    expect(lastUpstreamReq.body.tools).toEqual(tools);
    expect(lastUpstreamReq.body.messages).toEqual(messages);
  });
});

describe('POST /anthropic/v1/messages/count_tokens', () => {
  test('returns an input_tokens estimate (Task 4)', async () => {
    const r = await request(app())
      .post('/anthropic/v1/messages/count_tokens')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ model: MODEL, messages: [{ role: 'user', content: 'count these tokens please' }] });
    expect(r.status).toBe(200);
    expect(typeof r.body.input_tokens).toBe('number');
    expect(r.body.input_tokens).toBeGreaterThan(0);
  });
});
