'use strict';

/**
 * TDD: dispatcherRun.test.js
 *
 * Tests for backend/src/dispatcher/run.js — the tick() function.
 * All I/O is injected via deps: client, notifier, state, saveState, log.
 *
 * Run from backend/:
 *   NODE_ENV=test npx jest src/__tests__/dispatcherRun.test.js --runInBand --forceExit
 */

const { tick, normalizeState } = require('../dispatcher/run');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-24T10:00:00Z'); // 14:00 Dubai — past 08:00 digest hour

/**
 * Build a minimal task for testing.
 */
function makeTask(overrides = {}) {
  return {
    id: 't1',
    status: 'todo',
    priority: 'p2',
    assignee_id: null,
    external_id: null,
    lease_expires_at: null,
    updated_at: '2026-07-24 09:00:00', // recent, under all thresholds
    ...overrides,
  };
}

/**
 * Build a full set of injected deps with sensible defaults.
 * Override individual properties to test specific scenarios.
 */
function makeDeps(overrides = {}) {
  const state = { ledger: {}, lastCursor: null, lastDigestDate: null };
  return {
    client: {
      getTasks: jest.fn().mockResolvedValue([]),
      getFleet: jest.fn().mockResolvedValue({ online: [], stale: [], offline_recent: [], unreachable: [], paused: [], counts: { online: 0, stale: 0 } }),
      resetLease: jest.fn().mockResolvedValue({ ok: true }),
      createRepairTask: jest.fn().mockResolvedValue({ id: 'task_new' }),
      getTaskByExternalId: jest.fn().mockResolvedValue(null),
      getDigest: jest.fn().mockResolvedValue('# Digest\n'),
    },
    notifier: {
      sendTeam: jest.fn().mockResolvedValue(undefined),
      sendAlert: jest.fn().mockResolvedValue(undefined),
    },
    state,
    saveState: jest.fn(),
    now: NOW,
    dryRun: false,
    log: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Expired lease → resetLease called
// ---------------------------------------------------------------------------

describe('tick: expired lease', () => {
  it('calls resetLease for in_progress task with expired lease', async () => {
    const expiredTask = makeTask({
      id: 'task_abc',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 09:00:00', // expired (before NOW)
    });
    const deps = makeDeps({ client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([expiredTask]) } });

    await tick(deps);

    expect(deps.client.resetLease).toHaveBeenCalledWith('task_abc');
  });

  it('calls resetLease for blocked task with expired lease', async () => {
    const task = makeTask({
      id: 'task_blocked',
      status: 'blocked',
      lease_expires_at: '2026-07-23 08:00:00',
    });
    const deps = makeDeps({ client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([task]) } });

    await tick(deps);

    expect(deps.client.resetLease).toHaveBeenCalledWith('task_blocked');
  });

  it('does NOT call resetLease for task with future lease', async () => {
    const futureTask = makeTask({
      id: 'task_future',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 11:00:00', // future
    });
    const deps = makeDeps({ client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([futureTask]) } });

    await tick(deps);

    expect(deps.client.resetLease).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Dry-run: resetLease NOT called but state still saved + cursor advanced
// ---------------------------------------------------------------------------

describe('tick: dry-run mode', () => {
  it('does not call resetLease in dry-run', async () => {
    const expiredTask = makeTask({
      id: 'task_dry',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 08:00:00',
    });
    const deps = makeDeps({
      client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([expiredTask]) },
      dryRun: true,
    });

    await tick(deps);

    expect(deps.client.resetLease).not.toHaveBeenCalled();
  });

  it('still updates lastCursor in dry-run (mirrors real bookkeeping)', async () => {
    const deps = makeDeps({ dryRun: true });
    const prevCursor = deps.state.lastCursor;

    await tick(deps);

    expect(deps.state.lastCursor).not.toBe(prevCursor);
    expect(deps.state.lastCursor).toBeTruthy();
  });

  it('still calls saveState in dry-run', async () => {
    const deps = makeDeps({ dryRun: true });

    await tick(deps);

    expect(deps.saveState).toHaveBeenCalledWith(deps.state);
  });

  it('logs dry-run notice instead of calling resetLease', async () => {
    const expiredTask = makeTask({
      id: 'task_dry2',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 08:00:00',
    });
    const deps = makeDeps({
      client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([expiredTask]) },
      dryRun: true,
    });

    await tick(deps);

    const logCalls = deps.log.mock.calls.flat().join(' ');
    expect(logCalls).toMatch(/dry.run/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Escalate → sendAlert + ledger written
// ---------------------------------------------------------------------------

describe('tick: escalate action', () => {
  it('calls sendAlert for blocked task older than 24h', async () => {
    // updated_at 25h ago
    const blockedTask = makeTask({
      id: 'task_esc',
      status: 'blocked',
      priority: 'p1',
      // 25 hours before NOW
      updated_at: new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString(),
      lease_expires_at: null,
    });
    const deps = makeDeps({ client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([blockedTask]) } });

    await tick(deps);

    expect(deps.notifier.sendAlert).toHaveBeenCalledTimes(1);
    const alertMsg = deps.notifier.sendAlert.mock.calls[0][0];
    expect(alertMsg).toContain('task_esc');
  });

  it('writes taskId to ledger after escalation', async () => {
    const blockedTask = makeTask({
      id: 'task_esc2',
      status: 'blocked',
      updated_at: new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString(),
    });
    const deps = makeDeps({ client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([blockedTask]) } });

    await tick(deps);

    expect(deps.state.ledger['task_esc2']).toBeTruthy();
  });

  it('does not re-escalate within 24h (ledger dedup)', async () => {
    const blockedTask = makeTask({
      id: 'task_dedup',
      status: 'blocked',
      updated_at: new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString(),
    });
    // Pre-populate ledger with a recent escalation (1 hour ago)
    const recentlyEscalated = new Date(NOW.getTime() - 1 * 3600 * 1000).toISOString();
    const deps = makeDeps({
      client: { ...makeDeps().client, getTasks: jest.fn().mockResolvedValue([blockedTask]) },
    });
    deps.state.ledger['task_dedup'] = recentlyEscalated;

    await tick(deps);

    expect(deps.notifier.sendAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Digest day → getDigest + sendTeam + lastDigestDate set
// ---------------------------------------------------------------------------

describe('tick: digest action', () => {
  it('calls getDigest and sendTeam when digest is due', async () => {
    // NOW is 2026-07-24T10:00:00Z = 14:00 Dubai, past 08:00 threshold
    // lastDigestDate is null → should fire
    const deps = makeDeps();
    expect(deps.state.lastDigestDate).toBeNull();

    await tick(deps);

    expect(deps.client.getDigest).toHaveBeenCalled();
    expect(deps.notifier.sendTeam).toHaveBeenCalled();
  });

  it('sets lastDigestDate to today after digest fires', async () => {
    const deps = makeDeps();

    await tick(deps);

    // Dubai date for NOW (2026-07-24T10:00:00Z + 4h = 2026-07-24 14:00 Dubai)
    expect(deps.state.lastDigestDate).toBe('2026-07-24');
  });

  it('does not fire digest when already sent today', async () => {
    const deps = makeDeps();
    deps.state.lastDigestDate = '2026-07-24'; // already sent today

    await tick(deps);

    expect(deps.client.getDigest).not.toHaveBeenCalled();
  });

  it('sends the digest text to sendTeam', async () => {
    const digestText = '# Mission Control\n## In Progress\n- Task A\n';
    const getDigest = jest.fn().mockResolvedValue(digestText);
    const deps = makeDeps({ client: { ...makeDeps().client, getDigest } });

    await tick(deps);

    expect(deps.notifier.sendTeam).toHaveBeenCalledWith(digestText);
  });
});

// ---------------------------------------------------------------------------
// 5. Repair task: existing task (getTaskByExternalId returns row) → createRepairTask NOT called
// ---------------------------------------------------------------------------

describe('tick: create_repair_task action', () => {
  it('does NOT create repair task when external_id already exists in task list', async () => {
    // Fleet has a stale/offline provider that would trigger incident
    const fleetWithOffline = {
      online: [],
      stale: [],
      unreachable: [],
      paused: [],
      offline_recent: [{ id: 'p1', name: 'GPU-1', state: 'offline', last_heartbeat_age_seconds: 1800 }],
      counts: { online: 0, stale: 0 },
    };
    // task list already has a task with that external_id
    const existingTask = makeTask({ external_id: 'provider:p1:offline', status: 'todo' });

    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([existingTask]),
        getFleet: jest.fn().mockResolvedValue(fleetWithOffline),
        getTaskByExternalId: jest.fn().mockResolvedValue(existingTask),
      },
    });

    await tick(deps);

    expect(deps.client.createRepairTask).not.toHaveBeenCalled();
  });

  it('creates repair task when external_id not in task list', async () => {
    const fleetWithOffline = {
      online: [],
      stale: [],
      unreachable: [{ id: 'p2', name: 'GPU-2', state: 'unreachable', last_heartbeat_age_seconds: 1800 }],
      offline_recent: [],
      paused: [],
      counts: { online: 0, stale: 0 },
    };

    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([]),
        getFleet: jest.fn().mockResolvedValue(fleetWithOffline),
        getTaskByExternalId: jest.fn().mockResolvedValue(null),
      },
    });

    await tick(deps);

    expect(deps.client.createRepairTask).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Action failure resilience: one failed action must not kill the tick
// ---------------------------------------------------------------------------

describe('tick: action failure resilience', () => {
  it('continues executing remaining actions when resetLease throws', async () => {
    const expiredTask = makeTask({
      id: 'task_fail',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 08:00:00',
    });
    // Also set up a digest-eligible state so we can verify it fires despite resetLease failure
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([expiredTask]),
        resetLease: jest.fn().mockRejectedValue(new Error('network error')),
      },
    });

    // Should not throw
    await expect(tick(deps)).resolves.not.toThrow();

    // Digest should still fire (state.lastDigestDate was null, NOW is past 08:00 Dubai)
    expect(deps.client.getDigest).toHaveBeenCalled();
  });

  it('still calls saveState even when some actions fail', async () => {
    const expiredTask = makeTask({
      id: 'task_fail2',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 08:00:00',
    });
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([expiredTask]),
        resetLease: jest.fn().mockRejectedValue(new Error('network error')),
      },
    });

    await tick(deps);

    expect(deps.saveState).toHaveBeenCalledWith(deps.state);
  });

  it('logs error when an action throws', async () => {
    const expiredTask = makeTask({
      id: 'task_fail3',
      status: 'in_progress',
      lease_expires_at: '2026-07-24 08:00:00',
    });
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([expiredTask]),
        resetLease: jest.fn().mockRejectedValue(new Error('timeout')),
      },
    });

    await tick(deps);

    const logCalls = deps.log.mock.calls.flat().join(' ');
    expect(logCalls).toMatch(/error|fail|timeout/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Cursor and ledger lifecycle
// ---------------------------------------------------------------------------

describe('tick: cursor and ledger lifecycle', () => {
  it('advances lastCursor to now ISO string after each tick', async () => {
    const deps = makeDeps();

    await tick(deps);

    expect(deps.state.lastCursor).toBe(NOW.toISOString());
  });

  it('prunes ledger entries older than 48h', async () => {
    const deps = makeDeps();
    // Insert an old entry (49h ago)
    const old = new Date(NOW.getTime() - 49 * 3600 * 1000).toISOString();
    deps.state.ledger['stale_key'] = old;
    // Insert a recent entry (1h ago)
    const recent = new Date(NOW.getTime() - 1 * 3600 * 1000).toISOString();
    deps.state.ledger['fresh_key'] = recent;

    await tick(deps);

    expect(deps.state.ledger['stale_key']).toBeUndefined();
    expect(deps.state.ledger['fresh_key']).toBeDefined();
  });

  it('calls saveState with the mutated state', async () => {
    const deps = makeDeps();

    await tick(deps);

    // saveState must be called with the same state object (mutated in place)
    expect(deps.saveState).toHaveBeenCalledWith(deps.state);
    expect(deps.saveState).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 8. normalizeState — state shape validation / coercion (Fix #2)
// ---------------------------------------------------------------------------

describe('normalizeState', () => {
  it('returns defaults when raw is null', () => {
    const result = normalizeState(null);
    expect(result).toEqual({ ledger: {}, lastCursor: null, lastDigestDate: null });
  });

  it('returns defaults when raw is a non-object primitive (number)', () => {
    const result = normalizeState(42);
    expect(result).toEqual({ ledger: {}, lastCursor: null, lastDigestDate: null });
  });

  it('returns defaults when raw is a string', () => {
    const result = normalizeState('bad');
    expect(result).toEqual({ ledger: {}, lastCursor: null, lastDigestDate: null });
  });

  it('coerces ledger to {} when it is not a plain object', () => {
    const result = normalizeState({ ledger: 7, lastCursor: null, lastDigestDate: null });
    expect(result.ledger).toEqual({});
  });

  it('coerces lastCursor to null when it is not a string', () => {
    const result = normalizeState({ ledger: {}, lastCursor: 123, lastDigestDate: null });
    expect(result.lastCursor).toBeNull();
  });

  it('coerces lastDigestDate to null when it is not a string', () => {
    const result = normalizeState({ ledger: {}, lastCursor: null, lastDigestDate: true });
    expect(result.lastDigestDate).toBeNull();
  });

  it('preserves valid string fields', () => {
    const result = normalizeState({ ledger: {}, lastCursor: '2026-07-24T10:00:00Z', lastDigestDate: '2026-07-24' });
    expect(result.lastCursor).toBe('2026-07-24T10:00:00Z');
    expect(result.lastDigestDate).toBe('2026-07-24');
  });

  it('preserves valid ledger object', () => {
    const ledger = { 'task_x': '2026-07-24T10:00:00Z' };
    const result = normalizeState({ ledger, lastCursor: null, lastDigestDate: null });
    expect(result.ledger).toEqual(ledger);
  });

  it('tick runs fine when state file contains null (via normalizeState coercion)', async () => {
    // Simulates loadState reading `null` JSON — normalizeState should coerce to defaults
    const coerced = normalizeState(null);
    const deps = makeDeps({ state: coerced });
    await expect(tick(deps)).resolves.not.toThrow();
    expect(deps.saveState).toHaveBeenCalled();
  });

  it('tick runs fine when state file contains {"ledger": 7}', async () => {
    const coerced = normalizeState({ ledger: 7 });
    const deps = makeDeps({ state: coerced });
    await expect(tick(deps)).resolves.not.toThrow();
    expect(deps.saveState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 9. fetch timeout — signal option passed to fetchImpl (Fix #3)
// ---------------------------------------------------------------------------

describe('MissionClient: fetch timeout', () => {
  it('passes a signal option to fetchImpl on getTasks', async () => {
    const { MissionClient } = require('../dispatcher/client');

    let capturedOpts;
    const mockFetch = jest.fn().mockImplementation((url, opts) => {
      capturedOpts = opts;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: [] }),
      });
    });

    const client = new MissionClient({ baseUrl: 'http://localhost', agentKey: 'test', fetchImpl: mockFetch });
    await client.getTasks();

    expect(capturedOpts).toBeDefined();
    expect(capturedOpts.signal).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 10. Dry-run purity — no network calls in dry-run for create_repair_task (Fix #5)
// ---------------------------------------------------------------------------

describe('tick: dry-run create_repair_task purity', () => {
  it('does NOT call getTaskByExternalId in dry-run mode', async () => {
    const fleetWithOffline = {
      online: [], stale: [], paused: [],
      unreachable: [{ id: 'p9', name: 'GPU-9', last_heartbeat_age_seconds: 1800 }],
      offline_recent: [],
      counts: { online: 0, stale: 0 },
    };
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([]),
        getFleet: jest.fn().mockResolvedValue(fleetWithOffline),
        getTaskByExternalId: jest.fn().mockResolvedValue(null),
      },
      dryRun: true,
    });

    await tick(deps);

    expect(deps.client.getTaskByExternalId).not.toHaveBeenCalled();
    expect(deps.client.createRepairTask).not.toHaveBeenCalled();
  });

  it('logs would-create message in dry-run', async () => {
    const fleetWithOffline = {
      online: [], stale: [], paused: [],
      unreachable: [{ id: 'p99', name: 'GPU-99', last_heartbeat_age_seconds: 1800 }],
      offline_recent: [],
      counts: { online: 0, stale: 0 },
    };
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockResolvedValue([]),
        getFleet: jest.fn().mockResolvedValue(fleetWithOffline),
      },
      dryRun: true,
    });

    await tick(deps);

    const logCalls = deps.log.mock.calls.flat().join(' ');
    expect(logCalls).toMatch(/dry.run/i);
    expect(logCalls).toMatch(/provider:p99:unreachable/);
  });
});

// ---------------------------------------------------------------------------
// 11. Error-path coverage: getTasks rejects → tick resolves, saveState called (Fix #6i)
// ---------------------------------------------------------------------------

describe('tick: getTasks rejects', () => {
  it('resolves even when client.getTasks rejects', async () => {
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockRejectedValue(new Error('connection refused')),
      },
    });

    await expect(tick(deps)).resolves.not.toThrow();
  });

  it('calls saveState even when getTasks rejects', async () => {
    const deps = makeDeps({
      client: {
        ...makeDeps().client,
        getTasks: jest.fn().mockRejectedValue(new Error('connection refused')),
      },
    });

    await tick(deps);

    expect(deps.saveState).toHaveBeenCalledWith(deps.state);
  });
});

// ---------------------------------------------------------------------------
// 12. Dry-run digest — notifier.sendTeam NOT called, client.getDigest NOT called (Fix #6ii)
// ---------------------------------------------------------------------------

describe('tick: dry-run digest', () => {
  it('does NOT call notifier.sendTeam on a digest day in dry-run', async () => {
    // NOW is 2026-07-24T10:00:00Z = 14:00 Dubai — digest should be due
    const deps = makeDeps({ dryRun: true });
    expect(deps.state.lastDigestDate).toBeNull();

    await tick(deps);

    expect(deps.notifier.sendTeam).not.toHaveBeenCalled();
  });

  it('does NOT call client.getDigest on a digest day in dry-run', async () => {
    const deps = makeDeps({ dryRun: true });

    await tick(deps);

    expect(deps.client.getDigest).not.toHaveBeenCalled();
  });
});
