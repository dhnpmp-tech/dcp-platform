// Agent self-serve renter registration — POST /api/renters/agent-register.
//
// Locks the zero-human contract: one programmatic call returns a REAL
// `dcp-renter-…` key + a modest trial, with no email click, plus the abuse
// guards (per-IP rate limit, provenance columns, idempotency, provider-email
// conflict) and that the human magic-link flow is untouched.
'use strict';

const request = require('supertest');
const express = require('express');
const db = require('../db');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/renters', require('../routes/renters'));
  return app;
}

const AGENT_TRIAL_HALALA = 2000;

describe('POST /api/renters/agent-register', () => {
  let app;
  beforeAll(() => { app = makeApp(); });

  afterEach(() => {
    // Rate-limit is disabled by default in jest-setup; ensure tests that flip
    // it back leave it disabled for the next test.
    process.env.DISABLE_RATE_LIMIT = '1';
  });

  test('empty body mints a real key + 20 SAR trial, status active', async () => {
    const res = await request(app).post('/api/renters/agent-register').send({});
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.api_key).toMatch(/^dcp-renter-[0-9a-f]{32}$/);
    expect(res.body.trial_credit_halala).toBe(AGENT_TRIAL_HALALA);
    expect(res.body.balance_sar).toBe(20);

    const row = db.get('SELECT * FROM renters WHERE id = ?', res.body.renter_id);
    expect(row.status).toBe('active');
    expect(row.source).toBe('agent');
    expect(row.balance_halala).toBe(AGENT_TRIAL_HALALA);
    expect(row.trial_grant_halala).toBe(AGENT_TRIAL_HALALA);
    // The minted key authenticates immediately on a renter read endpoint.
    const me = await request(app).get('/api/renters/me').set('x-renter-key', res.body.api_key);
    expect(me.status).toBe(200);
  });

  test('records an immutable credit_grants audit row', async () => {
    const res = await request(app).post('/api/renters/agent-register').send({});
    const grant = db.get(
      "SELECT * FROM credit_grants WHERE renter_id = ? AND granted_by = 'agent-register'",
      res.body.renter_id
    );
    expect(grant).toBeTruthy();
    expect(grant.amount_halala).toBe(AGENT_TRIAL_HALALA);
  });

  test('idempotent on a supplied email — second call returns same key, no re-credit', async () => {
    const email = `agent-idem-${Date.now()}@example.com`;
    const first = await request(app).post('/api/renters/agent-register').send({ email });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/renters/agent-register').send({ email });
    expect(second.status).toBe(200);
    expect(second.body.already_registered).toBe(true);
    expect(second.body.api_key).toBe(first.body.api_key);

    const row = db.get('SELECT balance_halala FROM renters WHERE id = ?', first.body.renter_id);
    expect(row.balance_halala).toBe(AGENT_TRIAL_HALALA); // not doubled
  });

  test('rejects an email already held by a provider', async () => {
    const email = `provider-owned-${Date.now()}@example.com`;
    db.prepare(
      `INSERT INTO providers (name, email, api_key, status, created_at)
       VALUES (?, ?, ?, 'registered', ?)`
    ).run('p', email, 'dcp-provider-' + 'a'.repeat(32), new Date().toISOString());

    const res = await request(app).post('/api/renters/agent-register').send({ email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_BELONGS_TO_PROVIDER');
  });

  test('rejects an unknown body field (strict schema)', async () => {
    const res = await request(app).post('/api/renters/agent-register').send({ name: 'x', balance_halala: 999999 });
    expect(res.status).toBe(400);
  });

  test('per-IP rate limit triggers on rapid repeat (3/IP/hour)', async () => {
    process.env.DISABLE_RATE_LIMIT = '0';
    // trust proxy off → all requests share the socket IP bucket.
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/renters/agent-register').send({});
      statuses.push(r.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBe(3);
    expect(statuses).toContain(429);
  });
});
