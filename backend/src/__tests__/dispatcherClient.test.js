'use strict';

/**
 * TDD: dispatcherClient.test.js
 *
 * Tests for backend/src/dispatcher/client.js — thin fetch wrapper around
 * the Mission Control HTTP API. Uses a mock fetchImpl so no real server
 * is needed and the agent key is never sent to the network.
 *
 * Run from backend/:
 *   NODE_ENV=test npx jest src/__tests__/dispatcherClient.test.js --runInBand --forceExit
 */

const { MissionClient } = require('../dispatcher/client');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'http://127.0.0.1:8083';
const AGENT_KEY = 'test-agent-key-secret';

/**
 * Build a mock fetchImpl that returns the provided response shape.
 * The shape mirrors the parts of the WHATWG Response we need:
 *   { ok, status, json: async () => body, text: async () => string }
 */
function mockFetch(responseShape) {
  return jest.fn().mockResolvedValue(responseShape);
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new Error('not json'); },
    text: async () => text,
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'server_error' }),
    text: async () => 'server error',
  };
}

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------

describe('MissionClient.getTasks', () => {
  it('calls GET /api/mission/tasks with correct headers', async () => {
    const fetch = mockFetch(jsonResponse({ tasks: [] }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getTasks();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/tasks`);
    expect(opts.method).toBe('GET');
    expect(opts.headers['x-mission-agent-key']).toBe(AGENT_KEY);
  });

  it('returns body.tasks array', async () => {
    const tasks = [{ id: 't1' }, { id: 't2' }];
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ tasks })) });
    const result = await client.getTasks();
    expect(result).toEqual(tasks);
  });

  it('appends status query param when provided', async () => {
    const fetch = mockFetch(jsonResponse({ tasks: [] }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getTasks({ status: 'in_progress' });

    const [url] = fetch.mock.calls[0];
    expect(url).toContain('status=in_progress');
  });

  it('appends multiple query params', async () => {
    const fetch = mockFetch(jsonResponse({ tasks: [] }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getTasks({ status: 'blocked', assignee: 'codex' });

    const [url] = fetch.mock.calls[0];
    expect(url).toContain('status=blocked');
    expect(url).toContain('assignee=codex');
  });

  it('throws on non-2xx response with status in message', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(500)) });
    await expect(client.getTasks()).rejects.toThrow('500');
  });

  it('does not include agent key in thrown error message', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(500)) });
    await expect(client.getTasks()).rejects.toThrow(expect.not.stringContaining(AGENT_KEY));
  });
});

// ---------------------------------------------------------------------------
// getTaskByExternalId
// ---------------------------------------------------------------------------

describe('MissionClient.getTaskByExternalId', () => {
  it('calls GET /api/mission/tasks?external_id=<id>', async () => {
    const fetch = mockFetch(jsonResponse({ tasks: [] }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getTaskByExternalId('inc_abc123');

    const [url] = fetch.mock.calls[0];
    expect(url).toContain('external_id=inc_abc123');
    expect(url).toContain('/api/mission/tasks');
  });

  it('returns the first task when results exist', async () => {
    const tasks = [{ id: 't1', external_id: 'inc_abc123' }, { id: 't2' }];
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ tasks })) });

    const result = await client.getTaskByExternalId('inc_abc123');
    expect(result).toEqual(tasks[0]);
  });

  it('returns null when no tasks match', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ tasks: [] })) });
    const result = await client.getTaskByExternalId('inc_missing');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetLease
// ---------------------------------------------------------------------------

describe('MissionClient.resetLease', () => {
  it('calls POST /api/mission/tasks/:id/reset-lease', async () => {
    const fetch = mockFetch(jsonResponse({ ok: true }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.resetLease('task_deadbeef');

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/tasks/task_deadbeef/reset-lease`);
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-mission-agent-key']).toBe(AGENT_KEY);
  });

  it('returns { ok: true } on success', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ ok: true })) });
    const result = await client.resetLease('task_abc');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, skipped: true } on 409 (lease not expired)', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ error: 'lease_not_expired' }, 409)) });
    const result = await client.resetLease('task_abc');
    expect(result).toEqual({ ok: false, skipped: true });
  });

  it('throws on 500 with status in message', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(500)) });
    await expect(client.resetLease('task_abc')).rejects.toThrow('500');
  });

  it('does not leak agent key in thrown error', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(401)) });
    await expect(client.resetLease('task_abc')).rejects.toThrow(expect.not.stringContaining(AGENT_KEY));
  });
});

// ---------------------------------------------------------------------------
// createTask / createRepairTask
// ---------------------------------------------------------------------------

describe('MissionClient.createTask', () => {
  it('calls POST /api/mission/tasks with external source fields', async () => {
    const fetch = mockFetch(jsonResponse({ task: { id: 'task_github' } }, 201));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.createTask({
      externalId: 'github:dhnpmp-tech/dcp-platform#42',
      title: 'GitHub issue #42: importer',
      detail: 'Imported issue details',
      source: 'github',
      sourceUrl: 'https://github.com/dhnpmp-tech/dcp-platform/issues/42',
      priority: 'p3',
      assigneeId: 'codex',
      goalId: 'goal_launch',
      milestoneId: 'milestone_homepage',
    });

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/tasks`);
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toMatch(/application\/json/);

    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      external_id: 'github:dhnpmp-tech/dcp-platform#42',
      title: 'GitHub issue #42: importer',
      description: 'Imported issue details',
      source: 'github',
      source_url: 'https://github.com/dhnpmp-tech/dcp-platform/issues/42',
      priority: 'p3',
      assignee_id: 'codex',
      goal_id: 'goal_launch',
      milestone_id: 'milestone_homepage',
    });
  });

  it('omits unset optional fields', async () => {
    const fetch = mockFetch(jsonResponse({ task: { id: 'task_minimal' } }, 201));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.createTask({
      externalId: 'external-1',
      title: 'Minimal task',
      description: 'Created from a generic source',
      sourceUrl: '',
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({
      external_id: 'external-1',
      title: 'Minimal task',
      description: 'Created from a generic source',
      source: 'dispatcher',
      priority: 'p2',
    });
  });

  it('returns the created task object', async () => {
    const task = { id: 'task_generic', title: 'Generic task' };
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ task }, 201)) });
    const result = await client.createTask({ externalId: 'external-2', title: 'T', detail: 'D' });
    expect(result).toEqual(task);
  });

  it('throws on non-2xx without leaking the agent key', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(403)) });
    await expect(client.createTask({ externalId: 'external-3', title: 'T', detail: 'D' })).rejects.toThrow('403');
    await expect(client.createTask({ externalId: 'external-3', title: 'T', detail: 'D' })).rejects.toThrow(expect.not.stringContaining(AGENT_KEY));
  });
});

describe('MissionClient.createRepairTask', () => {
  it('calls POST /api/mission/tasks with correct body', async () => {
    const fetch = mockFetch(jsonResponse({ task: { id: 'task_new' } }, 201));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.createRepairTask({ externalId: 'inc_gpu_001', title: 'GPU down', detail: 'No heartbeat for 30m' });

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/tasks`);
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toMatch(/application\/json/);

    const body = JSON.parse(opts.body);
    expect(body.external_id).toBe('inc_gpu_001');
    expect(body.title).toBe('GPU down');
    expect(body.description).toBe('No heartbeat for 30m');
    expect(body.source).toBe('dispatcher');
    expect(body.priority).toBe('p1');
  });

  it('returns the created task object', async () => {
    const task = { id: 'task_new', title: 'GPU down' };
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse({ task }, 201)) });
    const result = await client.createRepairTask({ externalId: 'inc_x', title: 'T', detail: 'D' });
    expect(result).toEqual(task);
  });

  it('throws on non-2xx', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(400)) });
    await expect(client.createRepairTask({ externalId: 'x', title: 'T', detail: 'D' })).rejects.toThrow('400');
  });
});

// ---------------------------------------------------------------------------
// getDigest
// ---------------------------------------------------------------------------

describe('MissionClient.getDigest', () => {
  it('calls GET /api/mission/digest', async () => {
    const fetch = mockFetch(textResponse('# Digest\n'));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getDigest();

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/digest`);
    expect(opts.method).toBe('GET');
  });

  it('returns text content', async () => {
    const md = '# Mission Control\n\n## In Progress\n- Task A\n';
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(textResponse(md)) });
    const result = await client.getDigest();
    expect(result).toBe(md);
  });

  it('throws on non-2xx', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(500)) });
    await expect(client.getDigest()).rejects.toThrow('500');
  });
});

// ---------------------------------------------------------------------------
// getFleet
// ---------------------------------------------------------------------------

describe('MissionClient.getFleet', () => {
  it('calls GET /api/mission/fleet', async () => {
    const fetch = mockFetch(jsonResponse({ online: [], stale: [], offline_recent: [], counts: { online: 0, stale: 0 } }));
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: fetch });

    await client.getFleet();

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mission/fleet`);
    expect(opts.method).toBe('GET');
    expect(opts.headers['x-mission-agent-key']).toBe(AGENT_KEY);
  });

  it('returns the fleet body', async () => {
    const fleetBody = {
      online: [{ id: 'p1', name: 'Fadi GPU', state: 'online' }],
      stale: [],
      offline_recent: [],
      counts: { online: 1, stale: 0 },
    };
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(jsonResponse(fleetBody)) });
    const result = await client.getFleet();
    expect(result).toEqual(fleetBody);
  });

  it('throws on non-2xx', async () => {
    const client = new MissionClient({ baseUrl: BASE_URL, agentKey: AGENT_KEY, fetchImpl: mockFetch(errorResponse(500)) });
    await expect(client.getFleet()).rejects.toThrow('500');
  });
});
