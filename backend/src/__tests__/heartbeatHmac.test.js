'use strict';

// H7 (Nexus/Tito audit) — heartbeat / WireGuard-register HMAC contract.
//
// verifyHeartbeatHmac checks X-DC1-Signature: sha256=<hex> against
// HMAC-SHA256(req.rawBody, DC1_HMAC_SECRET) in constant time. The
// enforceHeartbeatHmac route middleware gates on DC1_REQUIRE_HEARTBEAT_HMAC:
//   unset/'0' → warn + pass through (daemons don't all sign yet)
//   '1'       → 401 unsigned / bad-signature requests
// Both POST /api/providers/heartbeat and POST /api/providers/wg/register
// mount this middleware.
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { verifyHeartbeatHmac, enforceHeartbeatHmac } = require('../middleware/heartbeatHmac');

const SECRET = 'unit-test-secret';

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeApp({ rawBody = true } = {}) {
  const app = express();
  // Replicate the server.js raw-body capture the real verifier depends on.
  app.use(express.json({ verify: (req, _buf, encoding) => { req.rawBody = Buffer.from(_buf, encoding); } }));
  app.post('/api/providers/heartbeat', enforceHeartbeatHmac, (_req, res) => res.json({ ok: true }));
  app.post('/api/providers/wg/register', enforceHeartbeatHmac, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('verifyHeartbeatHmac', () => {
  const orig = { secret: process.env.DC1_HMAC_SECRET, flag: process.env.DC1_REQUIRE_HEARTBEAT_HMAC };
  beforeEach(() => { process.env.DC1_HMAC_SECRET = SECRET; delete process.env.DC1_REQUIRE_HEARTBEAT_HMAC; });
  afterAll(() => { process.env.DC1_HMAC_SECRET = orig.secret; process.env.DC1_REQUIRE_HEARTBEAT_HMAC = orig.flag; });

  test('valid signature passes', () => {
    const body = Buffer.from(JSON.stringify({ a: 1 }));
    const r = verifyHeartbeatHmac({ headers: { 'x-dc1-signature': sign(body) }, rawBody: body });
    expect(r.valid).toBe(true);
  });

  test('missing header → invalid', () => {
    const r = verifyHeartbeatHmac({ headers: {}, rawBody: Buffer.from('{}') });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/missing/i);
  });

  test('wrong secret → HMAC mismatch', () => {
    const body = Buffer.from('{"a":1}');
    const r = verifyHeartbeatHmac({ headers: { 'x-dc1-signature': sign(body, 'other-secret') }, rawBody: body });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/mismatch|comparison/i);
  });

  test('malformed header → format invalid', () => {
    const r = verifyHeartbeatHmac({ headers: { 'x-dc1-signature': 'nope' }, rawBody: Buffer.from('{}') });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/format/i);
  });

  test('DC1_HMAC_SECRET unset → invalid', () => {
    delete process.env.DC1_HMAC_SECRET;
    const r = verifyHeartbeatHmac({ headers: { 'x-dc1-signature': 'sha256=' + '0'.repeat(64) }, rawBody: Buffer.from('{}') });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not configured/i);
  });
});

describe('enforceHeartbeatHmac (route middleware)', () => {
  const orig = { secret: process.env.DC1_HMAC_SECRET, flag: process.env.DC1_REQUIRE_HEARTBEAT_HMAC };
  beforeEach(() => { process.env.DC1_HMAC_SECRET = SECRET; delete process.env.DC1_REQUIRE_HEARTBEAT_HMAC; });
  afterAll(() => { process.env.DC1_HMAC_SECRET = orig.secret; process.env.DC1_REQUIRE_HEARTBEAT_HMAC = orig.flag; });

  test('enforcement OFF → unsigned request passes (warn-only)', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/providers/heartbeat').send({ gpu_status: 'ok' });
    expect(res.status).toBe(200);
  });

  test('enforcement OFF → bad signature still passes (backward-compat rollout)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/providers/heartbeat')
      .set('x-dc1-signature', 'sha256=' + '0'.repeat(64))
      .send({ gpu_status: 'ok' });
    expect(res.status).toBe(200);
  });

  test('enforcement ON → unsigned request rejected with 401', async () => {
    process.env.DC1_REQUIRE_HEARTBEAT_HMAC = '1';
    const app = makeApp();
    const res = await request(app).post('/api/providers/heartbeat').send({ gpu_status: 'ok' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  test('enforcement ON → valid signature passes', async () => {
    process.env.DC1_REQUIRE_HEARTBEAT_HMAC = '1';
    const app = makeApp();
    const body = JSON.stringify({ gpu_status: 'ok' });
    const res = await request(app)
      .post('/api/providers/heartbeat')
      .set('x-dc1-signature', sign(Buffer.from(body)))
      .type('json')
      .send(body);
    expect(res.status).toBe(200);
  });

  test('enforcement ON → /wg/register also rejects unsigned (same gate)', async () => {
    process.env.DC1_REQUIRE_HEARTBEAT_HMAC = '1';
    const app = makeApp();
    const res = await request(app).post('/api/providers/wg/register').send({ public_key: 'x' });
    expect(res.status).toBe(401);
  });
});