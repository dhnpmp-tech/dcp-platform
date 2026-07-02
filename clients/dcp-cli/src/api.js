/** DCP API client — plain functions over the built-in fetch (Node 20+). */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class AuthError extends ApiError {
  constructor(message, status = 401) {
    super(message, status);
    this.name = 'AuthError';
  }
}

export class PaymentRequiredError extends ApiError {
  constructor(message, status = 402) {
    super(message, status);
    this.name = 'PaymentRequiredError';
  }
}

export class ExpiredError extends ApiError {
  constructor(message, status = 400) {
    super(message, status);
    this.name = 'ExpiredError';
  }
}

async function readBody(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function throwForStatus(status, body, fallback) {
  const message = body.error || body.message || fallback;
  if (status === 401) throw new AuthError(message || 'Invalid or missing API key');
  if (status === 402) throw new PaymentRequiredError(message || 'Balance is empty — top up at https://dcp.sa');
  throw new ApiError(message || `Request failed (HTTP ${status})`, status);
}

/** GET /v1/coding/models → the curated coding model list (public). */
export async function getCodingModels(baseUrl) {
  const res = await fetch(`${baseUrl}/v1/coding/models`);
  const body = await readBody(res);
  if (!res.ok) throwForStatus(res.status, body, 'Could not fetch coding models');
  return body.models;
}

/** GET /api/renters/me → {balance_halala, email, id} for the key's renter. */
export async function getBalance(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/renters/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readBody(res);
  if (!res.ok) throwForStatus(res.status, body, 'Could not fetch account');
  const { id, email, balance_halala } = body.renter || {};
  return { id, email, balance_halala };
}

/** POST /v1/cli/device/code → {device_code, user_code, verification_uri, interval, expires_in}. */
export async function requestDeviceCode(baseUrl) {
  const res = await fetch(`${baseUrl}/v1/cli/device/code`, { method: 'POST' });
  const body = await readBody(res);
  if (!res.ok) throwForStatus(res.status, body, 'Could not start device login');
  return body;
}

/**
 * POST /v1/cli/device/token with {device_code}.
 * 200 → {api_key, renter_id}; still pending → null;
 * expired → ExpiredError; rejected → AuthError.
 */
export async function pollDeviceToken(baseUrl, deviceCode) {
  const res = await fetch(`${baseUrl}/v1/cli/device/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  const body = await readBody(res);
  if (res.ok) return { api_key: body.api_key, renter_id: body.renter_id };
  if (res.status === 400) {
    if (body.error === 'authorization_pending') return null;
    if (body.error === 'expired_token') {
      throw new ExpiredError('Login code expired — run `dcp login` again');
    }
    if (body.error === 'invalid_grant') {
      throw new AuthError('Login was rejected — run `dcp login` again', 400);
    }
  }
  throwForStatus(res.status, body, 'Device login failed');
}
