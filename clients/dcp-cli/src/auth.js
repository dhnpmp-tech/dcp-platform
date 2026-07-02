import { getBalance, requestDeviceCode, pollDeviceToken, ExpiredError } from './api.js';
import { readConfig, writeConfig, resolveBaseUrl } from './config.js';

const MAX_POLL_MS = 15 * 60 * 1000; // hard cap on browser-login polling
const DEFAULT_INTERVAL_S = 5;
const DEFAULT_EXPIRES_S = 900;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Key-paste login: validate the key against the account endpoint,
 * persist it, and return {email, balance_halala}. Invalid key → AuthError
 * (from getBalance) and nothing is written.
 */
export async function loginWithKey(key) {
  const baseUrl = resolveBaseUrl(readConfig());
  const { email, balance_halala } = await getBalance(baseUrl, key);
  writeConfig({ token: key });
  return { email, balance_halala };
}

/**
 * Browser device-code login: request a code, show it, open the browser
 * (best-effort — headless boxes just get the printed URL), then poll until
 * the user approves or the code expires (capped at 15 minutes).
 * `sleep` and `log` are injectable for tests.
 */
export async function loginWithBrowser({ sleep = defaultSleep, log = console.log } = {}) {
  const baseUrl = resolveBaseUrl(readConfig());
  const device = await requestDeviceCode(baseUrl);

  log(`Open ${device.verification_uri} in your browser`);
  log(`and enter the code: ${device.user_code}`);
  log('Waiting for approval…');

  try {
    const { default: open } = await import('open');
    await open(device.verification_uri);
  } catch {
    // No browser available (SSH box, container) — the printed URL is enough.
  }

  const intervalMs = (device.interval || DEFAULT_INTERVAL_S) * 1000;
  const capMs = Math.min((device.expires_in || DEFAULT_EXPIRES_S) * 1000, MAX_POLL_MS);

  let waitedMs = 0;
  while (waitedMs < capMs) {
    const result = await pollDeviceToken(baseUrl, device.device_code);
    if (result) {
      writeConfig({ token: result.api_key });
      return { renter_id: result.renter_id };
    }
    await sleep(intervalMs);
    waitedMs += intervalMs;
  }
  throw new ExpiredError('Login timed out — run `dcp login` again');
}
