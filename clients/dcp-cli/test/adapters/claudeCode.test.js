import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa } from 'execa';
import claudeCode from '../../src/adapters/claudeCode.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('claudeCode adapter', () => {
  it('has id "claude" and binName "claude"', () => {
    expect(claudeCode.id).toBe('claude');
    expect(claudeCode.binName).toBe('claude');
  });

  describe('configureEnv', () => {
    it('returns exactly the Anthropic env map, with ANTHROPIC_API_KEY blanked', () => {
      const env = claudeCode.configureEnv({
        modelId: 'qwen3-30b-a3b',
        token: 'dcp_key',
        baseUrl: 'https://api.dcp.sa',
      });
      expect(env).toEqual({
        ANTHROPIC_BASE_URL: 'https://api.dcp.sa/anthropic',
        ANTHROPIC_AUTH_TOKEN: 'dcp_key',
        ANTHROPIC_MODEL: 'qwen3-30b-a3b',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-30b-a3b',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-30b-a3b',
        ANTHROPIC_CUSTOM_MODEL_OPTION: 'qwen3-30b-a3b',
        ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: 'DCP · qwen3-30b-a3b',
        ANTHROPIC_API_KEY: '',
      });
    });
  });

  describe('detectInstalled', () => {
    it('returns true when `which claude` succeeds', async () => {
      execa.mockResolvedValueOnce({ exitCode: 0 });
      await expect(claudeCode.detectInstalled()).resolves.toBe(true);
      expect(execa).toHaveBeenCalledWith('which', ['claude']);
    });

    it('returns false when `which claude` fails', async () => {
      execa.mockRejectedValueOnce(new Error('not found'));
      await expect(claudeCode.detectInstalled()).resolves.toBe(false);
    });
  });

  describe('installHint', () => {
    it('points at the official npm package', () => {
      expect(claudeCode.installHint()).toBe('npm install -g @anthropic-ai/claude-code');
    });
  });

  describe('launch', () => {
    const env = { ANTHROPIC_AUTH_TOKEN: 'dcp_key', ANTHROPIC_API_KEY: '' };

    it('spawns claude with inherited stdio, merged env, reject:false and returns the exit code', async () => {
      execa.mockResolvedValueOnce({ exitCode: 3 });

      await expect(claudeCode.launch(env, ['--continue'])).resolves.toBe(3);
      expect(execa).toHaveBeenCalledWith('claude', ['--continue'], {
        stdio: 'inherit',
        env: { ...process.env, ...env },
        reject: false,
      });
    });

    it('overrides an inherited real ANTHROPIC_API_KEY with the empty string', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-leaky';
      try {
        execa.mockResolvedValueOnce({ exitCode: 0 });
        await claudeCode.launch(env);
        const passedEnv = execa.mock.calls[0][2].env;
        expect(passedEnv.ANTHROPIC_API_KEY).toBe('');
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('defaults extraArgs to []', async () => {
      execa.mockResolvedValueOnce({ exitCode: 0 });
      await claudeCode.launch(env);
      expect(execa.mock.calls[0][1]).toEqual([]);
    });
  });
});
