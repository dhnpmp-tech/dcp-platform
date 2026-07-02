import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readConfig,
  writeConfig,
  clearConfig,
  resolveBaseUrl,
  DEFAULT_BASE_URL,
} from '../src/config.js';

let tmpBase;
let configDir;
let configFile;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-cli-config-'));
  configDir = path.join(tmpBase, 'cfg'); // intentionally nonexistent — writeConfig must create it
  configFile = path.join(configDir, 'config.json');
  process.env.DCP_CONFIG_DIR = configDir;
});

afterEach(() => {
  delete process.env.DCP_CONFIG_DIR;
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('returns {} when the config file is missing', () => {
    expect(readConfig()).toEqual({});
  });

  it('returns {} when the config file is corrupt', () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, 'not json{{{');
    expect(readConfig()).toEqual({});
  });
});

describe('writeConfig', () => {
  it('round-trips {token, baseUrl, lastAgent, lastModel}', () => {
    const data = {
      token: 'dcp_k1',
      baseUrl: 'https://staging.dcp.sa',
      lastAgent: 'claude',
      lastModel: 'qwen3-30b-a3b',
    };
    writeConfig(data);
    expect(readConfig()).toEqual(data);
  });

  it('merges a patch into the existing config', () => {
    writeConfig({ token: 'dcp_k1', lastModel: 'm1' });
    writeConfig({ lastModel: 'm2' });
    expect(readConfig()).toEqual({ token: 'dcp_k1', lastModel: 'm2' });
  });

  it('removes keys patched to undefined (logout keeps lastModel)', () => {
    writeConfig({ token: 'dcp_k1', lastModel: 'm1' });
    writeConfig({ token: undefined });
    const config = readConfig();
    expect(config).toEqual({ lastModel: 'm1' });
    expect('token' in config).toBe(false);
  });

  it('creates the dir 0700 and the file 0600', () => {
    writeConfig({ token: 'dcp_k1' });
    expect(fs.statSync(configDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(configFile).mode & 0o777).toBe(0o600);
  });
});

describe('clearConfig', () => {
  it('removes the config file', () => {
    writeConfig({ token: 'dcp_k1' });
    clearConfig();
    expect(fs.existsSync(configFile)).toBe(false);
    expect(readConfig()).toEqual({});
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => clearConfig()).not.toThrow();
  });
});

describe('resolveBaseUrl', () => {
  it('defaults to https://api.dcp.sa', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.dcp.sa');
    expect(resolveBaseUrl({})).toBe('https://api.dcp.sa');
  });

  it('prefers a configured baseUrl', () => {
    expect(resolveBaseUrl({ baseUrl: 'http://localhost:4000' })).toBe('http://localhost:4000');
  });
});
