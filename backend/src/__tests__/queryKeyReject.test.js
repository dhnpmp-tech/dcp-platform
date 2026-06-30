'use strict';

// C1 phase-2 contract: query-param API keys are REFUSED on renter routes whose
// frontend call sites have migrated to the x-renter-key header. ?key= leaks
// credentials into browser history, server logs, and referrer headers — the
// rejection closes the leak on /api/renters/me/*. See middleware/queryKeyReject.js.
const express = require('express');
const request = require('supertest');
const {
  detectQueryParamKeys,
  rejectRenterQueryParamKey,
} = require('../middleware/queryKeyReject');

function makeApp() {
  const app = express();
  app.use(express.json());
  // Mount exactly as server.js does for the enforcement surface.
  app.use('/api/renters/me', rejectRenterQueryParamKey);
  // Stand-in route so supertest has something to hit when the middleware passes.
  app.get('/api/renters/me', (_req, res) => res.json({ ok: true }));
  app.get('/api/renters/me/analytics', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('detectQueryParamKeys', () => {
  test('detects the shared ?key= param', () => {
    expect(detectQueryParamKeys({ query: { key: 'dcp-renter-x' } })).toMatchObject({
      hasSharedKey: true, hasRenterKey: false, hasProviderKey: false, any: true,
    });
  });
  test('detects ?renter_key=', () => {
    expect(detectQueryParamKeys({ query: { renter_key: 'x' } }).hasRenterKey).toBe(true);
  });
  test('detects ?provider_key=', () => {
    expect(detectQueryParamKeys({ query: { provider_key: 'x' } }).hasProviderKey).toBe(true);
  });
  test('none present → all false', () => {
    expect(detectQueryParamKeys({ query: {} }).any).toBe(false);
  });
});

describe('rejectRenterQueryParamKey (C1 phase-2 enforcement)', () => {
  let app;
  beforeAll(() => { app = makeApp(); });

  test('rejects ?key= on /api/renters/me with 400', async () => {
    const res = await request(app).get('/api/renters/me?key=dcp-renter-leak');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/X-Renter-Key/i);
  });

  test('rejects ?renter_key= on /api/renters/me with 400', async () => {
    const res = await request(app).get('/api/renters/me?renter_key=dcp-renter-leak');
    expect(res.status).toBe(400);
  });

  test('rejects ?key= on /api/renters/me/analytics (prefix mount)', async () => {
    const res = await request(app).get('/api/renters/me/analytics?key=dcp-renter-leak');
    expect(res.status).toBe(400);
  });

  test('passes through when no query-param key is present (header auth path)', async () => {
    const res = await request(app)
      .get('/api/renters/me')
      .set('x-renter-key', 'dcp-renter-x');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('does NOT reject ?provider_key= (provider keys are out of scope for the renter guard)', async () => {
    const res = await request(app).get('/api/renters/me?provider_key=dc1-provider-x');
    expect(res.status).toBe(200);
  });
});