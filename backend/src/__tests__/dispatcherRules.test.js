'use strict';

/**
 * TDD: dispatcherRules.test.js
 *
 * Tests for backend/src/dispatcher/rules.js — pure rules engine, no I/O.
 *
 * Run from backend/:
 *   NODE_ENV=test npx jest src/__tests__/dispatcherRules.test.js --runInBand --forceExit
 */

const { planActions, ts, dubaiDateString, shouldDigest } = require('../dispatcher/rules');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal task object */
function makeTask(overrides = {}) {
  return {
    id: 't1',
    status: 'todo',
    priority: 'p1',
    assignee_id: null,
    external_id: null,
    lease_expires_at: null,
    updated_at: '2026-07-23 10:00:00', // SQLite space-format, UTC
    ...overrides,
  };
}

// A "now" baseline: 2026-07-24T10:00:00Z
const NOW = new Date('2026-07-24T10:00:00Z');

// ---------------------------------------------------------------------------
// 1. ts() normalization
// ---------------------------------------------------------------------------

describe('ts() timestamp normalization', () => {
  it('returns null for null/undefined', () => {
    expect(ts(null)).toBeNull();
    expect(ts(undefined)).toBeNull();
    expect(ts('')).toBeNull();
  });

  it('parses ISO Z format correctly', () => {
    const d = ts('2026-07-23T10:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(new Date('2026-07-23T10:00:00Z').getTime());
  });

  it('parses SQLite space format as UTC (normalization proof)', () => {
    // This is the critical test: space format MUST be treated as UTC,
    // not local time. ts('2026-07-23 10:00:00') must equal ts('2026-07-23T10:00:00Z').
    const spaceFormat = ts('2026-07-23 10:00:00');
    const isoFormat = ts('2026-07-23T10:00:00Z');
    expect(spaceFormat.getTime()).toBe(isoFormat.getTime());
  });
});

// ---------------------------------------------------------------------------
// 2. dubaiDateString() and shouldDigest()
// ---------------------------------------------------------------------------

describe('dubaiDateString()', () => {
  it('shifts UTC time +4h for Dubai', () => {
    // 2026-07-24T20:00:00Z = 2026-07-25T00:00:00 in Dubai (+4)
    const result = dubaiDateString(new Date('2026-07-24T20:00:00Z'));
    expect(result).toBe('2026-07-25');
  });

  it('returns the same date when UTC time gives same Dubai date', () => {
    // 2026-07-24T10:00:00Z = 2026-07-24T14:00:00 in Dubai
    expect(dubaiDateString(NOW)).toBe('2026-07-24');
  });
});

describe('shouldDigest()', () => {
  it('fires when Dubai time >= 08:00 and lastDigestDate is yesterday', () => {
    // 2026-07-24T04:05:00Z = 2026-07-24T08:05:00 Dubai
    const now = new Date('2026-07-24T04:05:00Z');
    expect(shouldDigest(now, '2026-07-23')).toBe(true);
  });

  it('does not fire when lastDigestDate is already today (Dubai)', () => {
    const now = new Date('2026-07-24T04:05:00Z'); // 08:05 Dubai → today = '2026-07-24'
    expect(shouldDigest(now, '2026-07-24')).toBe(false);
  });

  it('does not fire when Dubai time < 08:00', () => {
    // 2026-07-24T03:55:00Z = 2026-07-24T07:55:00 Dubai
    const now = new Date('2026-07-24T03:55:00Z');
    expect(shouldDigest(now, '2026-07-23')).toBe(false);
  });

  it('does not fire when lastDigestDate is null and Dubai time < 08:00', () => {
    const now = new Date('2026-07-24T03:55:00Z');
    expect(shouldDigest(now, null)).toBe(false);
  });

  it('fires when lastDigestDate is null and Dubai time >= 08:00', () => {
    const now = new Date('2026-07-24T04:05:00Z');
    expect(shouldDigest(now, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. reset_lease
// ---------------------------------------------------------------------------

describe('planActions — reset_lease', () => {
  it('emits reset_lease for in_progress task with expired ISO lease', () => {
    const task = makeTask({
      status: 'in_progress',
      lease_expires_at: '2026-07-24T09:00:00Z', // before NOW (10:00Z)
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions).toContainEqual({ type: 'reset_lease', taskId: 't1' });
  });

  it('does not emit reset_lease for live lease', () => {
    const task = makeTask({
      status: 'in_progress',
      lease_expires_at: '2026-07-24T11:00:00Z', // after NOW
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'reset_lease')).toBe(false);
  });

  it('emits reset_lease for blocked task with expired lease', () => {
    const task = makeTask({
      status: 'blocked',
      lease_expires_at: '2026-07-24T08:59:00Z',
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions).toContainEqual({ type: 'reset_lease', taskId: 't1' });
  });

  it('does not emit reset_lease when lease_expires_at is null', () => {
    const task = makeTask({ status: 'in_progress', lease_expires_at: null });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'reset_lease')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. escalate
// ---------------------------------------------------------------------------

describe('planActions — escalate (blocked > 24h)', () => {
  it('escalates blocked task updated_at > 24h ago (SQLite space format)', () => {
    // NOW = 2026-07-24T10:00:00Z; 24h ago = 2026-07-23T10:00:00Z
    // '2026-07-22 09:00:00' is ~49h before NOW → should escalate
    const task = makeTask({
      id: 'tBlocked',
      status: 'blocked',
      updated_at: '2026-07-22 09:00:00',
    });
    const actions = planActions({ tasks: [task], now: NOW });
    const escalation = actions.find((a) => a.type === 'escalate' && a.taskId === 'tBlocked');
    expect(escalation).toBeDefined();
    expect(escalation.reason).toBeDefined();
  });

  it('does NOT escalate blocked task updated_at 23h ago (within threshold)', () => {
    // NOW = 2026-07-24T10:00:00Z; 23h ago = 2026-07-23T11:00:00Z
    const task = makeTask({
      id: 'tBlockedRecent',
      status: 'blocked',
      updated_at: '2026-07-23 11:00:00', // only 23h old
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tBlockedRecent')).toBe(false);
  });

  it('escalates p0 todo task updated_at > 4h ago', () => {
    // NOW = 2026-07-24T10:00:00Z; 5h ago = 2026-07-24T05:00:00Z
    const task = makeTask({
      id: 'tP0',
      status: 'todo',
      priority: 'p0',
      updated_at: '2026-07-24 05:00:00', // 5h ago
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tP0')).toBe(true);
  });

  it('does NOT escalate p0 todo task updated_at 3h ago (within 4h threshold)', () => {
    const task = makeTask({
      id: 'tP0Recent',
      status: 'todo',
      priority: 'p0',
      updated_at: '2026-07-24 07:00:00', // 3h ago
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tP0Recent')).toBe(false);
  });

  it('does NOT escalate p1 todo task even if > 4h ago', () => {
    const task = makeTask({
      id: 'tP1Old',
      status: 'todo',
      priority: 'p1',
      updated_at: '2026-07-24 04:00:00', // 6h ago
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tP1Old')).toBe(false);
  });

  it('does NOT escalate tasks in non-blocked/todo statuses', () => {
    for (const status of ['done', 'in_progress', 'cancelled']) {
      const task = makeTask({ id: `t-${status}`, status, updated_at: '2026-07-20 00:00:00' });
      const actions = planActions({ tasks: [task], now: NOW });
      expect(actions.some((a) => a.type === 'escalate')).toBe(false);
    }
  });
});

describe('planActions — escalate ledger dedup', () => {
  it('skips escalation when ledger has entry within last 24h', () => {
    const task = makeTask({
      id: 'tLedger',
      status: 'blocked',
      updated_at: '2026-07-22 09:00:00',
    });
    // Ledger entry is NOW itself — within dedup window
    const ledger = { tLedger: NOW.toISOString() };
    const actions = planActions({ tasks: [task], now: NOW, ledger });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tLedger')).toBe(false);
  });

  it('fires escalation again when ledger entry is 25h old', () => {
    const task = makeTask({
      id: 'tLedgerOld',
      status: 'blocked',
      updated_at: '2026-07-22 09:00:00',
    });
    // 25h before NOW
    const oldEntry = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const ledger = { tLedgerOld: oldEntry };
    const actions = planActions({ tasks: [task], now: NOW, ledger });
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tLedgerOld')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. notify_assignment
// ---------------------------------------------------------------------------

describe('planActions — notify_assignment', () => {
  it('does NOT emit notification when lastCursor is null (first run)', () => {
    const task = makeTask({
      id: 'tAssigned',
      assignee_id: 'agent-1',
      updated_at: '2026-07-24 09:00:00',
    });
    const actions = planActions({ tasks: [task], now: NOW, lastCursor: null });
    expect(actions.some((a) => a.type === 'notify_assignment')).toBe(false);
  });

  it('emits notification when updated_at > lastCursor', () => {
    const task = makeTask({
      id: 'tAssigned',
      assignee_id: 'agent-1',
      updated_at: '2026-07-24 09:00:00', // 09:00 UTC
    });
    // lastCursor is before the updated_at
    const lastCursor = '2026-07-24T08:00:00Z';
    const actions = planActions({ tasks: [task], now: NOW, lastCursor });
    const notif = actions.find((a) => a.type === 'notify_assignment' && a.taskId === 'tAssigned');
    expect(notif).toBeDefined();
    expect(notif.assigneeId).toBe('agent-1');
  });

  it('does NOT emit notification when updated_at <= lastCursor', () => {
    const task = makeTask({
      id: 'tAssignedOld',
      assignee_id: 'agent-1',
      updated_at: '2026-07-24 08:00:00', // exactly at cursor
    });
    const lastCursor = '2026-07-24T08:00:00Z';
    const actions = planActions({ tasks: [task], now: NOW, lastCursor });
    expect(actions.some((a) => a.type === 'notify_assignment')).toBe(false);
  });

  it('does NOT emit notification when assignee_id is null', () => {
    const task = makeTask({
      id: 'tNoAssignee',
      assignee_id: null,
      updated_at: '2026-07-24 09:00:00',
    });
    const actions = planActions({ tasks: [task], now: NOW, lastCursor: '2026-07-24T08:00:00Z' });
    expect(actions.some((a) => a.type === 'notify_assignment')).toBe(false);
  });

  it('deduplicates same assignee within 24h via ledger', () => {
    const task = makeTask({
      id: 'tDedupAssign',
      assignee_id: 'agent-2',
      updated_at: '2026-07-24 09:00:00',
    });
    const ledger = { 'assign:tDedupAssign:agent-2': NOW.toISOString() };
    const actions = planActions({
      tasks: [task],
      now: NOW,
      lastCursor: '2026-07-24T08:00:00Z',
      ledger,
    });
    expect(actions.some((a) => a.type === 'notify_assignment')).toBe(false);
  });

  it('fires new notification on reassignment to a different agent', () => {
    const task = makeTask({
      id: 'tReassign',
      assignee_id: 'agent-3', // new assignee
      updated_at: '2026-07-24 09:30:00',
    });
    // Ledger has old agent-2 entry but not agent-3
    const ledger = { 'assign:tReassign:agent-2': NOW.toISOString() };
    const actions = planActions({
      tasks: [task],
      now: NOW,
      lastCursor: '2026-07-24T08:00:00Z',
      ledger,
    });
    const notif = actions.find(
      (a) => a.type === 'notify_assignment' && a.taskId === 'tReassign' && a.assigneeId === 'agent-3'
    );
    expect(notif).toBeDefined();
  });

  it('lastCursor in space format is also normalized correctly', () => {
    const task = makeTask({
      id: 'tCursorSpace',
      assignee_id: 'agent-4',
      updated_at: '2026-07-24 09:00:00',
    });
    // lastCursor in SQLite space format — must be normalized
    const lastCursor = '2026-07-24 08:00:00';
    const actions = planActions({ tasks: [task], now: NOW, lastCursor });
    const notif = actions.find((a) => a.type === 'notify_assignment' && a.taskId === 'tCursorSpace');
    expect(notif).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. digest
// ---------------------------------------------------------------------------

describe('planActions — digest', () => {
  it('emits digest when Dubai time >= 08:00 and date differs from lastDigestDate', () => {
    // 04:05 UTC = 08:05 Dubai
    const now = new Date('2026-07-24T04:05:00Z');
    const actions = planActions({ tasks: [], now, lastDigestDate: '2026-07-23' });
    expect(actions).toContainEqual({ type: 'digest' });
  });

  it('does NOT emit digest when lastDigestDate is already today (Dubai)', () => {
    const now = new Date('2026-07-24T04:05:00Z');
    const actions = planActions({ tasks: [], now, lastDigestDate: '2026-07-24' });
    expect(actions.some((a) => a.type === 'digest')).toBe(false);
  });

  it('does NOT emit digest when Dubai time < 08:00', () => {
    // 03:55 UTC = 07:55 Dubai
    const now = new Date('2026-07-24T03:55:00Z');
    const actions = planActions({ tasks: [], now, lastDigestDate: '2026-07-23' });
    expect(actions.some((a) => a.type === 'digest')).toBe(false);
  });

  it('emits digest when lastDigestDate is null and Dubai time >= 08:00', () => {
    const now = new Date('2026-07-24T04:05:00Z');
    const actions = planActions({ tasks: [], now, lastDigestDate: null });
    expect(actions).toContainEqual({ type: 'digest' });
  });
});

// ---------------------------------------------------------------------------
// 7. create_repair_task
// ---------------------------------------------------------------------------

describe('planActions — create_repair_task', () => {
  it('emits create_repair_task for incident with no matching task', () => {
    const incident = { external_id: 'inc-001', title: 'GPU OOM', detail: 'Node A went down' };
    const actions = planActions({ tasks: [], providerIncidents: [incident], now: NOW });
    expect(actions).toContainEqual({
      type: 'create_repair_task',
      externalId: 'inc-001',
      title: 'GPU OOM',
      detail: 'Node A went down',
    });
  });

  it('does NOT emit create_repair_task when a task already has that external_id (any status)', () => {
    const incident = { external_id: 'inc-002', title: 'Disk full', detail: 'Volume A' };
    for (const status of ['todo', 'in_progress', 'blocked', 'done', 'cancelled']) {
      const task = makeTask({ id: `t-${status}`, external_id: 'inc-002', status });
      const actions = planActions({ tasks: [task], providerIncidents: [incident], now: NOW });
      expect(
        actions.some((a) => a.type === 'create_repair_task' && a.externalId === 'inc-002')
      ).toBe(false);
    }
  });

  it('handles multiple incidents — creates only those without matching tasks', () => {
    const incidents = [
      { external_id: 'inc-003', title: 'Net A', detail: 'detail A' },
      { external_id: 'inc-004', title: 'Net B', detail: 'detail B' },
    ];
    const existingTask = makeTask({ external_id: 'inc-003' });
    const actions = planActions({ tasks: [existingTask], providerIncidents: incidents, now: NOW });
    expect(actions.some((a) => a.externalId === 'inc-003')).toBe(false);
    expect(actions).toContainEqual({
      type: 'create_repair_task',
      externalId: 'inc-004',
      title: 'Net B',
      detail: 'detail B',
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Empty inputs
// ---------------------------------------------------------------------------

describe('planActions — empty inputs', () => {
  it('returns empty array with no tasks, no incidents, and digest already sent today', () => {
    // NOW = 2026-07-24T10:00:00Z = 14:00 Dubai → digest would fire unless already sent today
    const actions = planActions({ tasks: [], now: NOW, lastDigestDate: '2026-07-24' });
    expect(Array.isArray(actions)).toBe(true);
    expect(actions).toHaveLength(0);
  });

  it('returns empty array with default params (digest hour not reached)', () => {
    // Use a time before 08:00 Dubai to avoid digest firing
    const earlyNow = new Date('2026-07-24T03:00:00Z'); // 07:00 Dubai
    const actions = planActions({ tasks: [], now: earlyNow });
    expect(actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Combined: multiple actions from one task
// ---------------------------------------------------------------------------

describe('planActions — combined scenarios', () => {
  it('can emit both reset_lease and escalate for the same task', () => {
    const task = makeTask({
      id: 'tCombo',
      status: 'blocked',
      lease_expires_at: '2026-07-24T09:00:00Z', // expired
      updated_at: '2026-07-22 09:00:00', // >24h blocked
    });
    const actions = planActions({ tasks: [task], now: NOW });
    expect(actions.some((a) => a.type === 'reset_lease' && a.taskId === 'tCombo')).toBe(true);
    expect(actions.some((a) => a.type === 'escalate' && a.taskId === 'tCombo')).toBe(true);
  });

  it('produces actions in a deterministic order (no duplicates)', () => {
    const task = makeTask({
      id: 'tDup',
      status: 'blocked',
      updated_at: '2026-07-22 09:00:00',
    });
    const actions = planActions({ tasks: [task, task], now: NOW });
    const escalations = actions.filter((a) => a.type === 'escalate' && a.taskId === 'tDup');
    // Even with duplicate task input, should emit only once
    expect(escalations).toHaveLength(1);
  });
});
