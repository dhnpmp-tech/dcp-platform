'use strict';

const express = require('express');
const request = require('supertest');

const NEW_KEY = `${'B'.repeat(43)}=`;
const OLD_KEY = `${'A'.repeat(43)}=`;
const PRIVATE_KEY = `${'C'.repeat(43)}=`;
const PSK = `${'D'.repeat(43)}=`;

const mockExecFileSync = jest.fn((cmd, args = []) => {
  if (cmd === 'wg' && args[0] === 'genkey') return Buffer.from(`${PRIVATE_KEY}\n`);
  if (cmd === 'wg' && args[0] === 'pubkey') return Buffer.from(`${NEW_KEY}\n`);
  if (cmd === 'wg' && args[0] === 'genpsk') return Buffer.from(`${PSK}\n`);
  if (cmd === 'wg-quick' && args[0] === 'save' && mockDbState.failWgQuickSave) {
    throw new Error('simulated wg-quick save failure');
  }
  return Buffer.from('');
});

jest.mock('child_process', () => ({ execFileSync: mockExecFileSync }));

function mockFp(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

const mockDbState = {
  provider: {
    id: 7,
    name: 'Atomic WG Provider',
    api_key: 'dcp-provider-atomicity',
    deleted_at: null,
    wg_mesh_ip: null,
    wg_public_key: null,
    wg_last_rotation_at: null,
    vllm_endpoint_url: null,
  },
  failProviderUpdate: false,
  failWgQuickSave: false,
};

jest.mock('../db', () => ({
  get: jest.fn((sql, ...params) => {
    const flat = mockFp(params);
    if (String(sql).includes('FROM providers WHERE api_key = ?')) {
      return flat[0] === mockDbState.provider.api_key ? { ...mockDbState.provider } : null;
    }
    return null;
  }),
  all: jest.fn((sql) => {
    if (String(sql).includes('SELECT wg_mesh_ip FROM providers')) {
      return mockDbState.provider.wg_mesh_ip ? [{ wg_mesh_ip: mockDbState.provider.wg_mesh_ip }] : [];
    }
    return [];
  }),
  prepare: jest.fn((sql) => ({
    run: (...params) => {
      const flat = mockFp(params);
      if (String(sql).includes('UPDATE providers SET wg_mesh_ip = ?, wg_public_key = ?')) {
        if (mockDbState.failProviderUpdate) throw new Error('simulated providers update failure');
        mockDbState.provider.wg_mesh_ip = flat[0];
        mockDbState.provider.wg_public_key = flat[1];
        return { changes: 1 };
      }
      if (String(sql).includes('SET wg_mesh_ip = ?, wg_public_key = ?, wg_last_rotation_at = ?')) {
        if (mockDbState.failProviderUpdate) throw new Error('simulated providers update failure');
        mockDbState.provider.wg_mesh_ip = flat[0];
        mockDbState.provider.wg_public_key = flat[1];
        mockDbState.provider.wg_last_rotation_at = flat[2];
        mockDbState.provider.vllm_endpoint_url = mockDbState.provider.vllm_endpoint_url || flat[3];
        return { changes: 1 };
      }
      if (String(sql).includes('UPDATE providers SET wg_public_key = ?, wg_last_rotation_at = ?')) {
        if (mockDbState.failProviderUpdate) throw new Error('simulated providers update failure');
        mockDbState.provider.wg_public_key = flat[0];
        mockDbState.provider.wg_last_rotation_at = flat[1];
        return { changes: 1 };
      }
      return { changes: 0 };
    },
    get: () => null,
    all: () => [],
  })),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/providers', require('../routes/providers'));
  return app;
}

function resetState(overrides = {}) {
  mockExecFileSync.mockClear();
  mockDbState.failProviderUpdate = false;
  mockDbState.failWgQuickSave = false;
  mockDbState.provider = {
    id: 7,
    name: 'Atomic WG Provider',
    api_key: 'dcp-provider-atomicity',
    deleted_at: null,
    wg_mesh_ip: null,
    wg_public_key: null,
    wg_last_rotation_at: null,
    vllm_endpoint_url: null,
    ...overrides,
  };
  process.env.WG_SERVER_ENDPOINT = 'wg.example.invalid:51820';
  delete process.env.DCP_WG_FALLBACK_ENDPOINT;
}

function wgSetCalls() {
  return mockExecFileSync.mock.calls.filter(([cmd, args]) => cmd === 'wg' && args[0] === 'set');
}

function hasWgSetCall(peerKey, token) {
  return wgSetCalls().some(([, args]) => args.includes(peerKey) && args.includes(token));
}

describe('providers WireGuard registration atomicity', () => {
  beforeEach(() => resetState());
  afterAll(() => { delete process.env.WG_SERVER_ENDPOINT; });

  it('removes a newly-added /wg/register peer when the providers row update fails', async () => {
    mockDbState.failProviderUpdate = true;

    const res = await request(buildApp())
      .post('/api/providers/wg/register')
      .set('x-provider-key', mockDbState.provider.api_key)
      .send({ public_key: NEW_KEY });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to persist WG peer');
    expect(mockDbState.provider.wg_mesh_ip).toBe(null);
    expect(mockDbState.provider.wg_public_key).toBe(null);

    expect(hasWgSetCall(NEW_KEY, '10.8.0.3/32')).toBe(true);
    expect(hasWgSetCall(NEW_KEY, 'remove')).toBe(true);
  });

  it('removes a newly-added /wg/register peer when wg-quick save fails after wg set', async () => {
    mockDbState.failWgQuickSave = true;

    const res = await request(buildApp())
      .post('/api/providers/wg/register')
      .set('x-provider-key', mockDbState.provider.api_key)
      .send({ public_key: NEW_KEY });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to add WG peer');
    expect(mockDbState.provider.wg_mesh_ip).toBe(null);
    expect(mockDbState.provider.wg_public_key).toBe(null);

    expect(hasWgSetCall(NEW_KEY, '10.8.0.3/32')).toBe(true);
    expect(hasWgSetCall(NEW_KEY, 'remove')).toBe(true);
  });

  it('keeps the old peer until /wg/install-config persists, then removes the new peer on DB failure', async () => {
    resetState({ wg_mesh_ip: '10.8.0.6', wg_public_key: OLD_KEY });
    mockDbState.failProviderUpdate = true;

    const res = await request(buildApp())
      .post('/api/providers/wg/install-config')
      .set('x-provider-key', mockDbState.provider.api_key)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to persist WG install config');
    expect(mockDbState.provider.wg_mesh_ip).toBe('10.8.0.6');
    expect(mockDbState.provider.wg_public_key).toBe(OLD_KEY);

    expect(hasWgSetCall(NEW_KEY, '10.8.0.6/32')).toBe(true);
    expect(hasWgSetCall(NEW_KEY, 'remove')).toBe(true);
    expect(hasWgSetCall(OLD_KEY, 'remove')).toBe(false);
  });
});
