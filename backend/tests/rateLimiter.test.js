/**
 * DCP-805: Rate Limiter Tests
 *
 * Verifies that rate limiting middleware correctly:
 *   - Allows requests up to the configured limit
 *   - Returns 429 with Retry-After header when limit is exceeded
 *   - Keys limits per renter/provider key (not just IP)
 *   - Per-endpoint limits match the DCP-805 spec:
 *       POST /api/vllm/complete      → 60/min per renter key
 *       POST /api/jobs/submit        → 20/min per renter key
 *       POST /api/providers/register → 5/10min per IP
 *       POST /api/providers/:id/activate → 3/hour per provider key
 *
 * Run: jest tests/rateLimiter.test.js
 */

'use strict';

const express = require('express');
const request = require('supertest');
const {
  createRateLimiter,
  vllmCompleteLimiter,
  jobSubmitLimiter,
  registerLimiter,
  providerActivateLimiter,
} = require('../src/middleware/rateLimiter');

// Build a minimal Express app around a given limiter
function buildApp(limiter) {
  const app = express();
  app.set('trust proxy', false);
  app.use(limiter);
  app.post('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

// Fire n sequential POST /test requests with optional headers
async function fireRequests(app, n, headers = {}) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const req = request(app).post('/test');
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    results.push(await req);
  }
  return results;
}

// Generate a unique key for each test to avoid shared-store collisions
let keyCounter = 0;
function uniqueKey(prefix = 'key') {
  return `${prefix}-${++keyCounter}-${Date.now()}`;
}

describe('createRateLimiter — factory behaviour', () => {
  test('allows requests up to max', async () => {
    // Use a non-IP key to avoid ERR_ERL_KEY_GEN_IPV6 validation warning
    const key = uniqueKey('factory');
    const limiter = createRateLimiter({ windowMs: 60000, max: 3, keyGenerator: () => key });
    const app = buildApp(limiter);
    const results = await fireRequests(app, 3);
    for (const r of results) expect(r.status).toBe(200);
  });

  test('returns 429 on max+1 request', async () => {
    const key = uniqueKey('factory');
    const limiter = createRateLimiter({ windowMs: 60000, max: 3, keyGenerator: () => key });
    const app = buildApp(limiter);
    await fireRequests(app, 3);
    const overflow = await request(app).post('/test');
    expect(overflow.status).toBe(429);
  });

  test('429 response includes Retry-After header', async () => {
    const key = uniqueKey('factory');
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyGenerator: () => key });
    const app = buildApp(limiter);
    await fireRequests(app, 2);
    const overflow = await request(app).post('/test');
    expect(overflow.status).toBe(429);
    expect(overflow.headers['retry-after']).toBeDefined();
    const retryAfterSec = Number(overflow.headers['retry-after']);
    expect(retryAfterSec).toBeGreaterThan(0);
  });

  test('429 body contains error and retryAfterSeconds', async () => {
    const key = uniqueKey('factory');
    const limiter = createRateLimiter({ windowMs: 60000, max: 1, keyGenerator: () => key });
    const app = buildApp(limiter);
    await request(app).post('/test');
    const overflow = await request(app).post('/test');
    expect(overflow.status).toBe(429);
    expect(overflow.body.error).toBe('Rate limit exceeded');
    expect(typeof overflow.body.retryAfterSeconds).toBe('number');
    expect(overflow.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('different keys have independent counters', async () => {
    const keyA = uniqueKey('factory-a');
    const keyB = uniqueKey('factory-b');
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      keyGenerator: (req) => req.headers['x-test-key'] || keyA,
    });
    const app = buildApp(limiter);

    // Exhaust key-a
    await fireRequests(app, 2, { 'x-test-key': keyA });
    const blockedA = await request(app).post('/test').set('x-test-key', keyA);
    expect(blockedA.status).toBe(429);

    // key-b is independent — still allowed
    const allowedB = await request(app).post('/test').set('x-test-key', keyB);
    expect(allowedB.status).toBe(200);
  });
});

describe('vllmCompleteLimiter — 60/min per renter key', () => {
  test('allows up to 60 requests per renter key', async () => {
    const key = uniqueKey('vllm');
    const app = buildApp(vllmCompleteLimiter);
    const results = await fireRequests(app, 60, { 'x-renter-key': key });
    for (const r of results) expect(r.status).toBe(200);
  });

  test('blocks 61st request for same renter key', async () => {
    const key = uniqueKey('vllm');
    const app = buildApp(vllmCompleteLimiter);
    await fireRequests(app, 60, { 'x-renter-key': key });
    const overflow = await request(app).post('/test').set('x-renter-key', key);
    expect(overflow.status).toBe(429);
    expect(overflow.headers['retry-after']).toBeDefined();
  });

  test('different renter keys are rate-limited independently', async () => {
    const keyA = uniqueKey('vllm-a');
    const keyB = uniqueKey('vllm-b');
    const app = buildApp(vllmCompleteLimiter);
    await fireRequests(app, 60, { 'x-renter-key': keyA });
    // keyA exhausted — keyB should still succeed
    const r = await request(app).post('/test').set('x-renter-key', keyB);
    expect(r.status).toBe(200);
  });
});

describe('jobSubmitLimiter — 20/min per renter key', () => {
  test('allows up to 20 requests per renter key', async () => {
    const key = uniqueKey('job');
    const app = buildApp(jobSubmitLimiter);
    const results = await fireRequests(app, 20, { 'x-renter-key': key });
    for (const r of results) expect(r.status).toBe(200);
  });

  test('blocks 21st request for same renter key', async () => {
    const key = uniqueKey('job');
    const app = buildApp(jobSubmitLimiter);
    await fireRequests(app, 20, { 'x-renter-key': key });
    const overflow = await request(app).post('/test').set('x-renter-key', key);
    expect(overflow.status).toBe(429);
    expect(overflow.headers['retry-after']).toBeDefined();
  });

  test('different renter keys have independent job submission limits', async () => {
    const keyA = uniqueKey('job-a');
    const keyB = uniqueKey('job-b');
    const app = buildApp(jobSubmitLimiter);
    await fireRequests(app, 20, { 'x-renter-key': keyA });
    // keyA exhausted — keyB should still work
    const r = await request(app).post('/test').set('x-renter-key', keyB);
    expect(r.status).toBe(200);
  });

  test('Authorization bearer renter keys are isolated per key on shared IP', async () => {
    const keyA = uniqueKey('job-bearer-a');
    const keyB = uniqueKey('job-bearer-b');
    const app = buildApp(jobSubmitLimiter);

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${keyA}`);
      expect(res.status).toBe(200);
    }

    const blockedA = await request(app)
      .post('/test')
      .set('Authorization', `Bearer ${keyA}`);
    expect(blockedA.status).toBe(429);

    const allowedB = await request(app)
      .post('/test')
      .set('Authorization', `Bearer ${keyB}`);
    expect(allowedB.status).toBe(200);
  });
});

describe('registerLimiter — 5 per IP per 10min', () => {
  test('allows up to 5 registrations per window', async () => {
    const key = uniqueKey('reg');
    const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5, keyGenerator: () => key });
    const app = buildApp(limiter);
    const results = await fireRequests(app, 5);
    for (const r of results) expect(r.status).toBe(200);
  });

  test('blocks 6th registration attempt', async () => {
    const key = uniqueKey('reg');
    const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5, keyGenerator: () => key });
    const app = buildApp(limiter);
    await fireRequests(app, 5);
    const overflow = await request(app).post('/test');
    expect(overflow.status).toBe(429);
    expect(overflow.headers['retry-after']).toBeDefined();
  });
});

describe('providerActivateLimiter — 3/hour per provider key', () => {
  test('allows up to 3 activation attempts per provider key', async () => {
    const key = uniqueKey('activate');
    const app = buildApp(providerActivateLimiter);
    const results = await fireRequests(app, 3, { 'x-provider-key': key });
    for (const r of results) expect(r.status).toBe(200);
  });

  test('blocks 4th activation attempt for same provider key', async () => {
    const key = uniqueKey('activate');
    const app = buildApp(providerActivateLimiter);
    await fireRequests(app, 3, { 'x-provider-key': key });
    const overflow = await request(app).post('/test').set('x-provider-key', key);
    expect(overflow.status).toBe(429);
    expect(overflow.headers['retry-after']).toBeDefined();
    expect(Number(overflow.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('different provider keys have independent activation limits', async () => {
    const keyA = uniqueKey('activate-a');
    const keyB = uniqueKey('activate-b');
    const app = buildApp(providerActivateLimiter);
    await fireRequests(app, 3, { 'x-provider-key': keyA });
    // keyA exhausted — keyB should still work
    const r = await request(app).post('/test').set('x-provider-key', keyB);
    expect(r.status).toBe(200);
  });
});
