import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { launchAgent, AgentNotInstalledError } from '../src/launch.js';
import { UnknownAgentError } from '../src/adapters/index.js';
import { readConfig } from '../src/config.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

let tmpBase;
const config = { token: 'dcp_key', baseUrl: 'https://api.dcp.sa' };

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-launch-'));
  process.env.DCP_CONFIG_DIR = path.join(tmpBase, 'cfg');
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('launchAgent', () => {
  it('launches the agent with configured env, persists last picks, returns the exit code', async () => {
    execa.mockImplementation(async (cmd) => {
      if (cmd === 'which') return { exitCode: 0 };
      return { exitCode: 3 };
    });

    const code = await launchAgent({ agent: 'claude', modelId: 'qwen3-30b-a3b', config });

    expect(code).toBe(3);
    const launchCall = execa.mock.calls.find(([cmd]) => cmd === 'claude');
    expect(launchCall).toBeTruthy();
    expect(launchCall[2].stdio).toBe('inherit');
    expect(launchCall[2].env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.dcp.sa/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'dcp_key',
      ANTHROPIC_MODEL: 'qwen3-30b-a3b',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-30b-a3b',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-30b-a3b',
      ANTHROPIC_API_KEY: '',
    });
    expect(readConfig()).toMatchObject({ lastAgent: 'claude', lastModel: 'qwen3-30b-a3b' });
  });

  it('falls back to the default baseUrl when config has none', async () => {
    execa.mockImplementation(async (cmd) =>
      cmd === 'which' ? { exitCode: 0 } : { exitCode: 0 }
    );

    await launchAgent({ agent: 'claude', modelId: 'm1', config: { token: 'dcp_key' } });

    const launchCall = execa.mock.calls.find(([cmd]) => cmd === 'claude');
    expect(launchCall[2].env.ANTHROPIC_BASE_URL).toBe('https://api.dcp.sa/anthropic');
  });

  it('throws AgentNotInstalledError with the install hint when claude is missing', async () => {
    execa.mockRejectedValue(new Error('which: not found'));

    const promise = launchAgent({ agent: 'claude', modelId: 'm1', config });
    await expect(promise).rejects.toBeInstanceOf(AgentNotInstalledError);
    await promise.catch((err) => {
      expect(err.installHint).toBe('npm install -g @anthropic-ai/claude-code');
      expect(err.message).toContain('npm install -g @anthropic-ai/claude-code');
    });
    expect(readConfig()).toEqual({}); // nothing persisted on failure
  });

  it('prints "coming soon" and returns exit code 2 for stub agents', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await launchAgent({ agent: 'codex', modelId: 'm1', config });

    expect(code).toBe(2);
    expect(errSpy.mock.calls.flat().join(' ')).toMatch(/coming soon/i);
    expect(execa).not.toHaveBeenCalled();
  });

  it('throws UnknownAgentError for an unregistered agent', async () => {
    await expect(launchAgent({ agent: 'zed', modelId: 'm1', config })).rejects.toBeInstanceOf(
      UnknownAgentError
    );
  });
});
