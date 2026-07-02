import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'https://api.dcp.sa';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function configDir() {
  return process.env.DCP_CONFIG_DIR || path.join(os.homedir(), '.dcp');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

/** Read the stored config. Missing or unreadable file → {}. */
export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the stored config and persist it (dir 0700, file 0600).
 * Keys patched to `undefined`/`null` are removed. Returns the merged config.
 */
export function writeConfig(patch = {}) {
  const merged = { ...readConfig(), ...patch };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined || merged[key] === null) delete merged[key];
  }
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  fs.chmodSync(dir, DIR_MODE);
  const file = configPath();
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, { mode: FILE_MODE });
  fs.chmodSync(file, FILE_MODE);
  return merged;
}

/** Delete the config file entirely. */
export function clearConfig() {
  fs.rmSync(configPath(), { force: true });
}

/** Base URL for API calls: configured value or the DCP production default. */
export function resolveBaseUrl(config = readConfig()) {
  return config.baseUrl || DEFAULT_BASE_URL;
}
