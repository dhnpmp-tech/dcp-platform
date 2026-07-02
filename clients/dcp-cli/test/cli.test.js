import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const bin = new URL('../bin/dcp.js', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const runBin = (args) => execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

describe('dcp binary', () => {
  it('--version prints the package version', () => {
    expect(runBin(['--version']).trim()).toBe(pkg.version);
  });

  it('--help lists login, logout, status, and launch', () => {
    const help = runBin(['--help']);
    for (const cmd of ['login', 'logout', 'status', 'launch']) {
      expect(help).toContain(cmd);
    }
  });

  it('launch --help documents the --model option', () => {
    expect(runBin(['launch', '--help'])).toContain('--model');
  });
});
