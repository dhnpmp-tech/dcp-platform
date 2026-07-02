import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getCodingModels,
  getBalance,
  requestDeviceCode,
  pollDeviceToken,
  ApiError,
  AuthError,
  PaymentRequiredError,
  ExpiredError,
} from '../src/api.js';

const BASE = 'https://api.dcp.sa';

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCodingModels', () => {
  it('GETs /v1/coding/models and returns the models array', async () => {
    const models = [
      {
        id: 'qwen3-30b-a3b',
        label: 'Qwen3 30B A3B (GPTQ-Int4)',
        vram_gb: 24,
        price_in_halala_per_1m: 150,
        price_out_halala_per_1m: 400,
        status: 'available',
        providers_serving: 1,
      },
    ];
    fetch.mockResolvedValueOnce(jsonRes(200, { models }));

    await expect(getCodingModels(BASE)).resolves.toEqual(models);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/v1/coding/models`);
  });

  it('maps a non-200 to ApiError', async () => {
    fetch.mockResolvedValueOnce(jsonRes(500, { error: 'boom' }));
    await expect(getCodingModels(BASE)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getBalance', () => {
  it('GETs /api/renters/me with a Bearer token and returns {balance_halala, email, id}', async () => {
    fetch.mockResolvedValueOnce(
      jsonRes(200, {
        renter: { id: 'r_1', email: 'dev@dcp.sa', balance_halala: 14250, created_at: 'x' },
      })
    );

    await expect(getBalance(BASE, 'dcp_key')).resolves.toEqual({
      id: 'r_1',
      email: 'dev@dcp.sa',
      balance_halala: 14250,
    });
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/renters/me`, {
      headers: { Authorization: 'Bearer dcp_key' },
    });
  });

  it('throws AuthError on 401', async () => {
    fetch.mockResolvedValueOnce(jsonRes(401, { error: 'invalid key' }));
    await expect(getBalance(BASE, 'bad')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws PaymentRequiredError on 402', async () => {
    fetch.mockResolvedValueOnce(jsonRes(402, { error: 'empty balance' }));
    await expect(getBalance(BASE, 'k')).rejects.toBeInstanceOf(PaymentRequiredError);
  });
});

describe('requestDeviceCode', () => {
  it('POSTs /v1/cli/device/code and returns the device-code payload', async () => {
    const payload = {
      device_code: 'dc_123',
      user_code: 'ABCD-1234',
      verification_uri: 'https://dcp.sa/cli',
      interval: 5,
      expires_in: 900,
    };
    fetch.mockResolvedValueOnce(jsonRes(200, payload));

    await expect(requestDeviceCode(BASE)).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/v1/cli/device/code`, { method: 'POST' });
  });
});

describe('pollDeviceToken', () => {
  it('POSTs the device_code and returns {api_key, renter_id} on 200', async () => {
    fetch.mockResolvedValueOnce(jsonRes(200, { api_key: 'dcp_new', renter_id: 'r_1' }));

    await expect(pollDeviceToken(BASE, 'dc_123')).resolves.toEqual({
      api_key: 'dcp_new',
      renter_id: 'r_1',
    });
    expect(fetch).toHaveBeenCalledWith(`${BASE}/v1/cli/device/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: 'dc_123' }),
    });
  });

  it('returns null while authorization is pending', async () => {
    fetch.mockResolvedValueOnce(jsonRes(400, { error: 'authorization_pending' }));
    await expect(pollDeviceToken(BASE, 'dc_123')).resolves.toBeNull();
  });

  it('throws ExpiredError on expired_token', async () => {
    fetch.mockResolvedValueOnce(jsonRes(400, { error: 'expired_token' }));
    await expect(pollDeviceToken(BASE, 'dc_123')).rejects.toBeInstanceOf(ExpiredError);
  });

  it('throws AuthError on invalid_grant', async () => {
    fetch.mockResolvedValueOnce(jsonRes(400, { error: 'invalid_grant' }));
    await expect(pollDeviceToken(BASE, 'dc_123')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws ApiError on other failures', async () => {
    fetch.mockResolvedValueOnce(jsonRes(500, {}));
    await expect(pollDeviceToken(BASE, 'dc_123')).rejects.toBeInstanceOf(ApiError);
  });
});
