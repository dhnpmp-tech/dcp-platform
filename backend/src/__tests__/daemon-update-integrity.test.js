/**
 * Daemon self-update integrity contract (#13).
 *
 * The daemon's self-update verifies the downloaded bytes against a sha256 the
 * backend publishes in the check_only response, then refuses to apply on a
 * mismatch (fail-closed). For that to work, the published digest MUST equal the
 * sha256 of the exact bytes the download route subsequently serves. This test
 * locks that contract: check_only.sha256 === sha256(download body).
 */
'use strict';

process.env.NODE_ENV = 'test';
process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';
process.env.DC1_HMAC_SECRET = process.env.DC1_HMAC_SECRET || 'test-hmac-secret-jest-fixed-32-byte-key-!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

const crypto = require('crypto');
const request = require('supertest');

const _origSetInterval = global.setInterval;
global.setInterval = () => 0;

const db = require('../db');
const app = require('../server');

let providerKey;

beforeAll(() => {
  providerKey = `dcp-provider-${crypto.randomBytes(8).toString('hex')}`;
  db.run(
    `INSERT INTO providers (name, email, api_key, gpu_model, status, approval_status, created_at, updated_at)
     VALUES (?, ?, ?, 'RTX 4090', 'online', 'approved', datetime('now'), datetime('now'))`,
    'Integrity Provider', 'integrity-provider@dcp.test', providerKey
  );
});

afterAll(() => {
  global.setInterval = _origSetInterval;
});

describe('daemon self-update integrity (#13)', () => {
  it('check_only publishes a sha256 that matches the served download bytes', async () => {
    const check = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: providerKey, check_only: 'true' });

    expect(check.status).toBe(200);
    expect(check.body).toHaveProperty('version');
    expect(check.body).toHaveProperty('download_url');
    // The integrity digest the daemon will verify against.
    expect(check.body.sha256).toMatch(/^[a-f0-9]{64}$/);

    const download = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: providerKey });

    expect(download.status).toBe(200);
    // supertest exposes the raw body on res.text for non-binary content types.
    const body = download.text != null ? download.text : download.body.toString('utf-8');
    const actual = crypto.createHash('sha256').update(Buffer.from(body, 'utf-8')).digest('hex');

    // The published digest MUST equal the hash of what is actually served —
    // otherwise the daemon's fail-closed verification would reject every update.
    expect(check.body.sha256).toBe(actual);
  });

  it('rejects the daemon download without a valid provider key', async () => {
    const noKey = await request(app).get('/api/providers/download/daemon').query({ check_only: 'true' });
    expect(noKey.status).toBe(400);

    const badKey = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: 'dcp-provider-not-a-real-key', check_only: 'true' });
    expect(badKey.status).toBe(401);
  });
});
