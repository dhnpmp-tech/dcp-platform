/**
 * Tests for /v1/auth/* wizard bridge endpoints.
 *
 * Strategy: mock ../../src/services/auth-otp and @supabase/supabase-js so
 * no real email is sent and no real Supabase session is required. Exercise
 * the router through supertest on a bare Express app (no global server).
 */

jest.mock('../../src/services/auth-otp', () => ({
  sendOtp: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../../src/services/renter-identity-reconciliation', () => ({
  reconcileRenterByEmailFromSupabase: jest.fn().mockResolvedValue({ reconciled: false }),
}));

const express = require('express');
const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');
const { sendOtp } = require('../../src/services/auth-otp');
const db = require('../../src/db');
const v1WizardRouter = require('../../src/routes/v1-wizard');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1', v1WizardRouter);
  return app;
}

function withSupabaseUser(email) {
  createClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { email } },
        error: null,
      }),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sendOtp.mockResolvedValue({ success: true });
  // Clean slate each test
  try { db.run('DELETE FROM renters'); } catch (_) { /* table may not exist yet */ }
  try { db.run('DELETE FROM providers'); } catch (_) { /* table may not exist yet */ }
});

describe('POST /v1/auth/register', () => {
  test('rejects missing email', async () => {
    const res = await request(buildApp()).post('/v1/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_email');
    expect(sendOtp).not.toHaveBeenCalled();
  });

  test('rejects malformed email', async () => {
    const res = await request(buildApp())
      .post('/v1/auth/register')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('accepts valid email, sends magic link, returns 202', async () => {
    const res = await request(buildApp())
      .post('/v1/auth/register')
      .send({ email: 'Peter@Example.COM ', role: 'provider', display_name: 'Peter' });
    expect(res.status).toBe(202);
    expect(res.body.next).toBe('check_email');
    expect(res.body.email).toBe('peter@example.com');
    expect(res.body.role).toBe('provider');
    expect(sendOtp).toHaveBeenCalledWith('peter@example.com');
  });

  test('defaults role to provider when unspecified', async () => {
    const res = await request(buildApp())
      .post('/v1/auth/register')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(202);
    expect(res.body.role).toBe('provider');
  });

  test('returns 502 when magic-link send fails', async () => {
    sendOtp.mockResolvedValueOnce({ success: false, error: 'smtp down' });
    const res = await request(buildApp())
      .post('/v1/auth/register')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('email_send_failed');
  });

  test('ignores password field (magic-link only)', async () => {
    const res = await request(buildApp())
      .post('/v1/auth/register')
      .send({ email: 'a@b.com', password: 'hunter2' });
    expect(res.status).toBe(202);
    // Password is not stored or used anywhere — the spec documents it but
    // DCP auth is magic-link only. This test is the regression guard.
  });
});

describe('POST /v1/auth/login', () => {
  test('rejects missing email', async () => {
    const res = await request(buildApp()).post('/v1/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('accepts email and triggers magic-link send', async () => {
    const res = await request(buildApp())
      .post('/v1/auth/login')
      .send({ email: 'x@y.com' });
    expect(res.status).toBe(202);
    expect(res.body.next).toBe('check_email');
    expect(sendOtp).toHaveBeenCalledWith('x@y.com');
  });

  test('502 when send fails', async () => {
    sendOtp.mockResolvedValueOnce({ success: false });
    const res = await request(buildApp())
      .post('/v1/auth/login')
      .send({ email: 'x@y.com' });
    expect(res.status).toBe(502);
  });
});

describe('POST /v1/auth/session', () => {
  test('rejects missing access_token', async () => {
    const res = await request(buildApp()).post('/v1/auth/session').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('missing_access_token');
  });

  test('401 when Supabase rejects token', async () => {
    createClient.mockReturnValueOnce({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'invalid' },
        }),
      },
    });
    const res = await request(buildApp())
      .post('/v1/auth/session')
      .send({ access_token: 'abc' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_session');
  });

  test('404 when no account exists for the verified email', async () => {
    withSupabaseUser('orphan@nowhere.com');
    const res = await request(buildApp())
      .post('/v1/auth/session')
      .send({ access_token: 'abc' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('account_not_found');
  });

  test('returns provider api_key when provider row exists', async () => {
    db.run(
      `INSERT INTO providers (email, name, status, api_key, created_at)
       VALUES (?, ?, 'active', ?, datetime('now'))`,
      'prov@example.com', 'Prov Co', 'prov_test_key_123',
    );
    withSupabaseUser('prov@example.com');
    const res = await request(buildApp())
      .post('/v1/auth/session')
      .send({ access_token: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('provider');
    expect(res.body.token).toBe('prov_test_key_123');
    expect(res.body.user.email).toBe('prov@example.com');
  });

  test('returns renter api_key when active renter row exists', async () => {
    db.run(
      `INSERT INTO renters (email, name, status, api_key, balance_halala, total_spent_halala, total_jobs, created_at)
       VALUES (?, ?, 'active', ?, 0, 0, 0, datetime('now'))`,
      'rent@example.com', 'Rent User', 'rent_test_key_abc',
    );
    withSupabaseUser('rent@example.com');
    const res = await request(buildApp())
      .post('/v1/auth/session')
      .send({ access_token: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('renter');
    expect(res.body.token).toBe('rent_test_key_abc');
  });
});
