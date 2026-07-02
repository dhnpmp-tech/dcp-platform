import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';
import { writeConfig, readConfig } from '../src/config.js';

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

let tmpBase;
let errSpy;
let logSpy;

const dcp = (...args) => run(['node', 'dcp', ...args]);
const stdout = () => logSpy.mock.calls.flat().join('\n');
const stderr = () => errSpy.mock.calls.flat().join('\n');

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-status-'));
  process.env.DCP_CONFIG_DIR = path.join(tmpBase, 'cfg');
  vi.stubGlobal('fetch', vi.fn());
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
  process.exitCode = 0;
});

describe('dcp status', () => {
  it('errors when not logged in', async () => {
    await dcp('status');
    expect(stderr()).toContain('Not logged in');
    expect(process.exitCode).toBe(1);
  });

  it('prints email, balance in SAR, baseUrl, and last model', async () => {
    writeConfig({ token: 'dcp_key', lastModel: 'qwen3-30b-a3b', lastAgent: 'claude' });
    fetch.mockResolvedValueOnce(
      jsonRes(200, { renter: { id: 'r_1', email: 'dev@dcp.sa', balance_halala: 14250 } })
    );

    await dcp('status');

    const out = stdout();
    expect(out).toContain('dev@dcp.sa');
    expect(out).toContain('142.50 SAR');
    expect(out).toContain('https://api.dcp.sa');
    expect(out).toContain('qwen3-30b-a3b');
  });

  it('prints a single clear error line when the key was revoked', async () => {
    writeConfig({ token: 'dcp_revoked' });
    fetch.mockResolvedValueOnce(jsonRes(401, { error: 'invalid key' }));

    await dcp('status');

    expect(process.exitCode).toBe(1);
    expect(stderr()).toMatch(/^Error: /m);
    expect(stderr()).not.toContain('at '); // no stack trace
  });
});

describe('dcp logout', () => {
  it('clears the token but keeps lastModel', async () => {
    writeConfig({ token: 'dcp_key', lastModel: 'qwen3-30b-a3b' });

    await dcp('logout');

    expect(readConfig()).toEqual({ lastModel: 'qwen3-30b-a3b' });
    expect(stdout()).toContain('Logged out');
  });
});

describe('bare dcp (pre-TUI placeholder)', () => {
  it('prints the model list, balance, and a launch hint', async () => {
    writeConfig({ token: 'dcp_key' });
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/v1/coding/models')) {
        return jsonRes(200, {
          models: [
            {
              id: 'qwen3-30b-a3b',
              label: 'Qwen3 30B A3B (GPTQ-Int4)',
              vram_gb: 24,
              price_in_halala_per_1m: 150,
              price_out_halala_per_1m: 400,
              status: 'available',
              providers_serving: 1,
            },
          ],
        });
      }
      if (url.endsWith('/api/renters/me')) {
        return jsonRes(200, { renter: { id: 'r_1', email: 'dev@dcp.sa', balance_halala: 14250 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await dcp();

    const out = stdout();
    expect(out).toContain('qwen3-30b-a3b');
    expect(out).toContain('Qwen3 30B A3B (GPTQ-Int4)');
    expect(out).toContain('142.50 SAR');
    expect(out).toContain('Run: dcp launch claude --model qwen3-30b-a3b');
  });
});
