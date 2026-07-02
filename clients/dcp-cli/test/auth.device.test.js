import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import open from 'open';
import { loginWithBrowser } from '../src/auth.js';
import { ExpiredError } from '../src/api.js';
import { readConfig } from '../src/config.js';

vi.mock('open', () => ({ default: vi.fn() }));

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const DEVICE_CODE = {
  device_code: 'dc_123',
  user_code: 'ABCD-1234',
  verification_uri: 'https://dcp.sa/cli',
  interval: 5,
  expires_in: 900,
};

let tmpBase;

function stubFetch({ deviceCode = DEVICE_CODE, tokenResponses }) {
  const responses = [...tokenResponses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (url.endsWith('/v1/cli/device/code')) return jsonRes(200, deviceCode);
      if (url.endsWith('/v1/cli/device/token')) {
        return responses.length > 1 ? responses.shift() : responses[0];
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-device-'));
  process.env.DCP_CONFIG_DIR = path.join(tmpBase, 'cfg');
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('loginWithBrowser', () => {
  it('prints the user code, opens the browser, polls until a key, and persists it', async () => {
    stubFetch({
      tokenResponses: [
        jsonRes(400, { error: 'authorization_pending' }),
        jsonRes(400, { error: 'authorization_pending' }),
        jsonRes(200, { api_key: 'dcp_new', renter_id: 'r_1' }),
      ],
    });
    const sleep = vi.fn(async () => {});
    const log = vi.fn();

    await expect(loginWithBrowser({ sleep, log })).resolves.toEqual({ renter_id: 'r_1' });

    expect(open).toHaveBeenCalledWith('https://dcp.sa/cli');
    const printed = log.mock.calls.flat().join('\n');
    expect(printed).toContain('ABCD-1234');
    expect(printed).toContain('https://dcp.sa/cli');
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(readConfig().token).toBe('dcp_new');
  });

  it('swallows browser-open failure (headless box) and still logs in', async () => {
    open.mockRejectedValueOnce(new Error('no display'));
    stubFetch({ tokenResponses: [jsonRes(200, { api_key: 'dcp_new', renter_id: 'r_1' })] });

    await expect(loginWithBrowser({ sleep: async () => {}, log: () => {} })).resolves.toEqual({
      renter_id: 'r_1',
    });
    expect(readConfig().token).toBe('dcp_new');
  });

  it('throws ExpiredError when the code expires before approval', async () => {
    stubFetch({
      deviceCode: { ...DEVICE_CODE, interval: 1, expires_in: 2 },
      tokenResponses: [jsonRes(400, { error: 'authorization_pending' })],
    });
    const sleep = vi.fn(async () => {});

    await expect(loginWithBrowser({ sleep, log: () => {} })).rejects.toBeInstanceOf(ExpiredError);
    // interval 1s, expires 2s → exactly two polls, nothing written
    const tokenPolls = fetch.mock.calls.filter(([url]) => url.endsWith('/v1/cli/device/token'));
    expect(tokenPolls).toHaveLength(2);
    expect(readConfig()).toEqual({});
  });

  it('propagates a hard expired_token from the server', async () => {
    stubFetch({ tokenResponses: [jsonRes(400, { error: 'expired_token' })] });

    await expect(loginWithBrowser({ sleep: async () => {}, log: () => {} })).rejects.toBeInstanceOf(
      ExpiredError
    );
  });
});
