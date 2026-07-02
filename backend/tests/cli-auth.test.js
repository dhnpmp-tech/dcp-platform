'use strict';

/**
 * cli-auth.test.js — device-code login for the dcp CLI (Task 7)
 *
 * OAuth-style device flow:
 *   1. POST /v1/cli/device/code           → device_code + user_code + verification_uri
 *   2. POST /v1/cli/device/token          → authorization_pending while unapproved
 *   3. POST /v1/cli/device/approve        → renter-authed, binds user_code to the renter
 *      then /token                        → returns a scoped dc1-sk- renter key
 *   4. expired codes                      → expired_token
 *   5. unknown device_code                → invalid_grant
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const db = require('../src/db');

const RENTER_KEY = 'dcp-renter-cliauth-test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/cli', require('../src/routes/cli-auth'));
  return app;
}

function cleanDb() {
  const safe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {} };
  for (const t of ['cli_device_codes', 'renter_api_keys', 'renters']) safe(t);
}

function seedRenter() {
  db.prepare(
    `INSERT INTO renters (id, name, email, api_key, status, balance_halala, created_at)
     VALUES (921, 'CLI Test', 'cli@test', ?, 'active', 1000, ?)`
  ).run(RENTER_KEY, new Date().toISOString());
}

beforeEach(() => { cleanDb(); seedRenter(); });

describe('dcp CLI device-code login', () => {
  test('issues a device code with the fields the CLI needs', async () => {
    const r = await request(createApp()).post('/v1/cli/device/code').send({});
    expect(r.status).toBe(200);
    expect(typeof r.body.device_code).toBe('string');
    expect(r.body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(r.body.verification_uri).toContain('dcp.sa');
    expect(r.body.interval).toBeGreaterThan(0);
    expect(r.body.expires_in).toBeGreaterThan(0);
  });

  test('token returns authorization_pending until approved', async () => {
    const app = createApp();
    const { body } = await request(app).post('/v1/cli/device/code').send({});
    const r = await request(app).post('/v1/cli/device/token').send({ device_code: body.device_code });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('authorization_pending');
  });

  test('approve (renter-authed) then token returns a working scoped key', async () => {
    const app = createApp();
    const { body } = await request(app).post('/v1/cli/device/code').send({});

    const ok = await request(app)
      .post('/v1/cli/device/approve')
      .set('Authorization', `Bearer ${RENTER_KEY}`)
      .send({ user_code: body.user_code });
    expect(ok.status).toBe(200);

    const tok = await request(app).post('/v1/cli/device/token').send({ device_code: body.device_code });
    expect(tok.status).toBe(200);
    expect(tok.body.api_key).toMatch(/^dc1-sk-/);
    expect(tok.body.renter_id).toBe(921);

    const row = db.prepare('SELECT renter_id, scopes, revoked_at FROM renter_api_keys WHERE key = ?')
      .get(tok.body.api_key);
    expect(row.renter_id).toBe(921);
    expect(JSON.parse(row.scopes)).toContain('inference');
    expect(row.revoked_at).toBeNull();
  });

  test('approve requires renter auth', async () => {
    const app = createApp();
    const { body } = await request(app).post('/v1/cli/device/code').send({});
    const r = await request(app).post('/v1/cli/device/approve').send({ user_code: body.user_code });
    expect(r.status).toBe(401);
  });

  test('expired device codes return expired_token', async () => {
    const app = createApp();
    const { body } = await request(app).post('/v1/cli/device/code').send({});
    db.prepare('UPDATE cli_device_codes SET expires_at = ? WHERE device_code = ?')
      .run(new Date(Date.now() - 1000).toISOString(), body.device_code);
    const r = await request(app).post('/v1/cli/device/token').send({ device_code: body.device_code });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('expired_token');
  });

  test('unknown device_code returns invalid_grant', async () => {
    const r = await request(createApp()).post('/v1/cli/device/token').send({ device_code: 'nope' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_grant');
  });
});
