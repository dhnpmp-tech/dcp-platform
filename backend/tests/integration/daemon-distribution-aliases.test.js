/**
 * Distribution channel aliases for the daemon download endpoint.
 *
 * Pre-fix state (surfaced by Tito's audit + prod probe 2026-04-21):
 *   GET https://api.dcp.sa/daemon?key=…            → 404
 *   GET https://api.dcp.sa/installers/daemon?key=… → 404
 *
 * Both URLs are referenced by live client code:
 *   - install.sh uses /daemon?key=… as a documented fallback
 *   - dcp_daemon.py uses /installers/daemon as CANONICAL_INSTALLER_DOWNLOAD_URL
 *
 * This test locks in the 302 redirect to the canonical handler at
 * /api/providers/download/daemon and verifies the query string survives.
 */

'use strict';

if (!process.env.DC1_DB_PATH) process.env.DC1_DB_PATH = ':memory:';
if (!process.env.DC1_ADMIN_TOKEN) process.env.DC1_ADMIN_TOKEN = 'test-admin-token-jest';
if (!process.env.PROVIDER_REACTIVATION_TOKEN_SECRET) process.env.PROVIDER_REACTIVATION_TOKEN_SECRET = 'test-reactivation-secret';
if (!process.env.DISABLE_RATE_LIMIT) process.env.DISABLE_RATE_LIMIT = '1';

const request = require('supertest');
const app = require('../../src/server');

describe('daemon distribution aliases', () => {
  test('GET /daemon redirects (302) to /api/providers/download/daemon with query string preserved', async () => {
    const res = await request(app).get('/daemon?key=test_key_123&check_only=true');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/providers/download/daemon?key=test_key_123&check_only=true');
  });

  test('GET /installers/daemon redirects (302) to /api/providers/download/daemon with query string preserved', async () => {
    const res = await request(app).get('/installers/daemon?key=abc');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/providers/download/daemon?key=abc');
  });

  test('GET /daemon without query string still redirects (canonical handler will return 400 API key required)', async () => {
    const res = await request(app).get('/daemon');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/providers/download/daemon');
  });
});
