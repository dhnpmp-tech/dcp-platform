import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { run } from '../src/cli.js';
import { writeConfig, readConfig } from '../src/config.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

let tmpBase;
let errSpy;
let logSpy;

const dcp = (...args) => run(['node', 'dcp', ...args]);

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-cmd-'));
  process.env.DCP_CONFIG_DIR = path.join(tmpBase, 'cfg');
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
  process.exitCode = 0;
});

const stderr = () => errSpy.mock.calls.flat().join('\n');

describe('dcp launch <agent> [--model <id>]', () => {
  it('errors clearly when not logged in', async () => {
    await dcp('launch', 'claude', '--model', 'qwen3-30b-a3b');

    expect(stderr()).toContain('Not logged in');
    expect(process.exitCode).toBe(1);
    expect(execa).not.toHaveBeenCalled();
  });

  it('errors clearly when no model is given and none was used before', async () => {
    writeConfig({ token: 'dcp_key' });

    await dcp('launch', 'claude');

    expect(stderr()).toContain('No model');
    expect(process.exitCode).toBe(1);
    expect(execa).not.toHaveBeenCalled();
  });

  it('errors with the install hint when claude is not installed', async () => {
    writeConfig({ token: 'dcp_key' });
    execa.mockRejectedValue(new Error('not found'));

    await dcp('launch', 'claude', '--model', 'qwen3-30b-a3b');

    expect(stderr()).toContain('npm install -g @anthropic-ai/claude-code');
    expect(process.exitCode).toBe(1);
  });

  it('errors listing available agents for an unknown agent', async () => {
    writeConfig({ token: 'dcp_key' });

    await dcp('launch', 'zed', '--model', 'm1');

    expect(stderr()).toContain('claude');
    expect(process.exitCode).toBe(1);
  });

  it('exits 2 for coming-soon agents', async () => {
    writeConfig({ token: 'dcp_key' });

    await dcp('launch', 'codex', '--model', 'm1');

    expect(stderr()).toMatch(/coming soon/i);
    expect(process.exitCode).toBe(2);
  });

  it('launches claude with the DCP env and propagates the exit code', async () => {
    writeConfig({ token: 'dcp_key' });
    execa.mockImplementation(async (cmd) =>
      cmd === 'which' ? { exitCode: 0 } : { exitCode: 0 }
    );

    await dcp('launch', 'claude', '--model', 'qwen3-30b-a3b');

    const launchCall = execa.mock.calls.find(([cmd]) => cmd === 'claude');
    expect(launchCall[2].env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.dcp.sa/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'dcp_key',
      ANTHROPIC_MODEL: 'qwen3-30b-a3b',
      ANTHROPIC_API_KEY: '',
    });
    expect(process.exitCode).toBe(0);
    expect(readConfig()).toMatchObject({ lastAgent: 'claude', lastModel: 'qwen3-30b-a3b' });
  });

  it('reuses lastModel when --model is omitted', async () => {
    writeConfig({ token: 'dcp_key', lastModel: 'qwen3-30b-a3b' });
    execa.mockImplementation(async () => ({ exitCode: 0 }));

    await dcp('launch', 'claude');

    const launchCall = execa.mock.calls.find(([cmd]) => cmd === 'claude');
    expect(launchCall[2].env.ANTHROPIC_MODEL).toBe('qwen3-30b-a3b');
    expect(process.exitCode).toBe(0);
  });
});
