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
const fs = require('fs');
const path = require('path');
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
  it('check_only publishes sha256 values that match the served daemon bundle bytes', async () => {
    const check = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: providerKey, check_only: 'true' });

    expect(check.status).toBe(200);
    expect(check.body).toHaveProperty('version');
    expect(check.body).toHaveProperty('download_url');
    // The integrity digest the daemon will verify against.
    expect(check.body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(check.body.mining_guard).toEqual(expect.objectContaining({
      filename: 'mining_guard.py',
      download_url: expect.stringContaining('/api/providers/download/mining-guard?key='),
      size: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));

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

    const guardDownload = await request(app)
      .get('/api/providers/download/mining-guard')
      .query({ key: providerKey });

    expect(guardDownload.status).toBe(200);
    const guardBody = guardDownload.text != null ? guardDownload.text : guardDownload.body.toString('utf-8');
    const guardActual = crypto.createHash('sha256').update(Buffer.from(guardBody, 'utf-8')).digest('hex');
    expect(check.body.mining_guard.sha256).toBe(guardActual);
    expect(guardBody).toContain('def run_host_miner_sweep');
    expect(guardBody).toContain('def findings_warrant_quarantine');

    const manifest = await request(app)
      .get('/api/providers/download/daemon/manifest')
      .query({ key: providerKey });

    expect(manifest.status).toBe(200);
    expect(manifest.body.sha256).toBe(actual);
    expect(manifest.body.mining_guard).toEqual(check.body.mining_guard);
  });

  it('serves a daemon bundle that imports and reports mining guard availability', async () => {
    const download = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: providerKey });

    expect(download.status).toBe(200);
    const body = download.text != null ? download.text : download.body.toString('utf-8');
    expect(body).toContain('from mining_guard import');
    expect(body).toContain('MINING_GUARD_IMPORT_ERROR');
    expect(body).toContain('mining_guard_unavailable');
    expect(body).toContain('def _download_mining_guard_update');
  });

  it('keeps provider installers fetching mining_guard.py beside dcp_daemon.py', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const unixInstaller = fs.readFileSync(path.join(backendRoot, 'public/install.sh'), 'utf-8');
    const windowsInstaller = fs.readFileSync(path.join(backendRoot, 'public/install.ps1'), 'utf-8');
    const legacyWindowsInstaller = fs.readFileSync(path.join(backendRoot, 'installers/daemon.ps1'), 'utf-8');

    for (const installer of [unixInstaller, windowsInstaller, legacyWindowsInstaller]) {
      expect(installer).toContain('/api/providers/download/mining-guard');
      expect(installer).toContain('mining_guard.py');
      expect(installer).toContain('check_only=true');
      expect(installer).toContain('Mining guard sha256 mismatch');
    }
    expect(unixInstaller).toContain('sha256_file');
    expect(unixInstaller).toContain('guard_manifest_url="${guard_url}&check_only=true"');
    expect(windowsInstaller).toContain('Get-FileHash -Algorithm SHA256');
    expect(windowsInstaller).toContain('$guardManifestUrl = "$GuardUrl&check_only=true"');
    expect(legacyWindowsInstaller).toContain('Get-FileHash -Algorithm SHA256');
    expect(legacyWindowsInstaller).toContain('$guardManifestUrl = "$GuardUrl&check_only=true"');
  });

  it('keeps mining guard serving and self-update failures observable', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const providersRoute = fs.readFileSync(path.join(backendRoot, 'src/routes/providers.js'), 'utf-8');
    const daemonSource = fs.readFileSync(path.join(backendRoot, 'installers/dcp_daemon.py'), 'utf-8');

    expect(providersRoute).toContain('miningGuardArtifactCache');
    expect(providersRoute).toContain('Mining guard artifact missing at');
    expect(providersRoute).toContain('mtimeMs === stat.mtimeMs');
    expect(providersRoute).toContain('sizeBytes === stat.size');
    expect(daemonSource).toContain('log.error(f"Failed to write mining_guard.py companion update');
  });

  it('rejects the daemon download without a valid provider key', async () => {
    const noKey = await request(app).get('/api/providers/download/daemon').query({ check_only: 'true' });
    expect(noKey.status).toBe(400);

    const badKey = await request(app)
      .get('/api/providers/download/daemon')
      .query({ key: 'dcp-provider-not-a-real-key', check_only: 'true' });
    expect(badKey.status).toBe(401);

    const noGuardKey = await request(app).get('/api/providers/download/mining-guard');
    expect(noGuardKey.status).toBe(400);

    const badGuardKey = await request(app)
      .get('/api/providers/download/mining-guard')
      .query({ key: 'dcp-provider-not-a-real-key' });
    expect(badGuardKey.status).toBe(401);
  });
});
