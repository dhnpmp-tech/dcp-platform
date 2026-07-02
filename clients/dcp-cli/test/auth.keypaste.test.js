import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loginWithKey } from '../src/auth.js';
import { AuthError } from '../src/api.js';
import { readConfig } from '../src/config.js';

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

let tmpBase;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-auth-'));
  process.env.DCP_CONFIG_DIR = path.join(tmpBase, 'cfg');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('loginWithKey', () => {
  it('validates the key via getBalance, persists it, and returns {email, balance_halala}', async () => {
    fetch.mockResolvedValueOnce(
      jsonRes(200, { renter: { id: 'r_1', email: 'dev@dcp.sa', balance_halala: 14250 } })
    );

    await expect(loginWithKey('dcp_key')).resolves.toEqual({
      email: 'dev@dcp.sa',
      balance_halala: 14250,
    });
    expect(fetch).toHaveBeenCalledWith('https://api.dcp.sa/api/renters/me', {
      headers: { Authorization: 'Bearer dcp_key' },
    });
    expect(readConfig().token).toBe('dcp_key');
  });

  it('throws AuthError on an invalid key and writes nothing', async () => {
    fetch.mockResolvedValueOnce(jsonRes(401, { error: 'invalid key' }));

    await expect(loginWithKey('bad_key')).rejects.toBeInstanceOf(AuthError);
    expect(readConfig()).toEqual({});
  });

  it('validates against a configured baseUrl when one is stored', async () => {
    const { writeConfig } = await import('../src/config.js');
    writeConfig({ baseUrl: 'http://localhost:4000' });
    fetch.mockResolvedValueOnce(
      jsonRes(200, { renter: { id: 'r_1', email: 'dev@dcp.sa', balance_halala: 1 } })
    );

    await loginWithKey('dcp_key');
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/renters/me', {
      headers: { Authorization: 'Bearer dcp_key' },
    });
  });
});
