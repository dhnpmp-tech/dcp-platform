'use strict';

const db = require('../db');
const providerProbe = require('../lib/provider-probe');

const {
  runProbeOnce,
  UNREACHABLE_THRESHOLD,
} = providerProbe;

function resetDb() {
  try { db.run('DELETE FROM providers'); } catch (_) {}
}

function seedProvider({
  id = 1,
  endpointReachable = 0,
  endpointProbedAt = null,
  endpointProbeFailures = 0,
  endpointUrl = 'http://provider.test:11434',
} = {}) {
  db.run(
    `INSERT INTO providers (
       id, name, email, status, approval_status, api_key,
       supported_compute_types, vllm_endpoint_url, last_heartbeat,
       endpoint_reachable, endpoint_probed_at, endpoint_probe_failures,
       is_paused, created_at, updated_at
     )
     VALUES (?, ?, ?, 'online', 'approved', ?,
       'inference', ?, ?, ?, ?, ?,
       0, datetime('now'), datetime('now'))`,
    id,
    `Provider ${id}`,
    `provider-${id}@dcp.sa`,
    `provider-key-${id}`,
    endpointUrl,
    new Date().toISOString(),
    endpointReachable,
    endpointProbedAt,
    endpointProbeFailures,
  );
}

function providerRow(id = 1) {
  return db.get(
    `SELECT endpoint_reachable, endpoint_probed_at, endpoint_probe_error,
            endpoint_probe_failures
       FROM providers
      WHERE id = ?`,
    id,
  );
}

beforeEach(() => {
  resetDb();
  global.fetch = jest.fn();
});

afterEach(() => {
  providerProbe.stopProbeLoop();
  jest.restoreAllMocks();
});

describe('provider endpoint probe', () => {
  test('marks a heartbeat-only provider reachable only after backend probe success', async () => {
    seedProvider({ endpointReachable: 0, endpointProbedAt: null, endpointProbeFailures: 2 });
    global.fetch.mockResolvedValue({ status: 200 });

    const result = await runProbeOnce();
    const row = providerRow();

    expect(result).toMatchObject({ probed: 1, reachable: 1, unreachable: 0 });
    expect(row.endpoint_reachable).toBe(1);
    expect(row.endpoint_probed_at).toEqual(expect.any(String));
    expect(row.endpoint_probe_error).toBeNull();
    expect(row.endpoint_probe_failures).toBe(0);
  });

  test('keeps a never-probed heartbeat-only provider unroutable on transient failure', async () => {
    seedProvider({ endpointReachable: 0, endpointProbedAt: null, endpointProbeFailures: 0 });
    global.fetch.mockRejectedValue(new Error('connection refused'));

    const result = await runProbeOnce();
    const row = providerRow();

    expect(result).toMatchObject({ probed: 1, reachable: 0, unreachable: 0 });
    expect(row.endpoint_reachable).toBe(0);
    expect(row.endpoint_probed_at).toEqual(expect.any(String));
    expect(row.endpoint_probe_error).toBe(`probe_fail_1/${UNREACHABLE_THRESHOLD}`);
    expect(row.endpoint_probe_failures).toBe(1);
  });

  test('persists consecutive failures and marks a previously reachable provider down at threshold', async () => {
    seedProvider({
      endpointReachable: 1,
      endpointProbedAt: new Date().toISOString(),
      endpointProbeFailures: UNREACHABLE_THRESHOLD - 1,
    });
    global.fetch.mockRejectedValue(new Error('tcp timeout'));

    const result = await runProbeOnce();
    const row = providerRow();

    expect(result).toMatchObject({ probed: 1, reachable: 0, unreachable: 1 });
    expect(row.endpoint_reachable).toBe(0);
    expect(row.endpoint_probe_error).toBe('tcp timeout');
    expect(row.endpoint_probe_failures).toBe(UNREACHABLE_THRESHOLD);
  });
});
