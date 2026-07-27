'use strict';

const {
  fetchOpenIssues,
  importGithubIssues,
  issueExternalId,
  issueLabels,
  mapIssueToTask,
  missionDetailForIssue,
  missionTitleForIssue,
  parseRepo,
} = require('../dispatcher/githubIssues');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeIssue(overrides = {}) {
  const number = overrides.number || 42;
  return {
    number,
    title: 'Wire GitHub issues into Mission Control',
    html_url: `https://github.com/dhnpmp-tech/dcp-platform/issues/${number}`,
    state: 'open',
    user: { login: 'peter' },
    labels: [{ name: 'mission' }, { name: 'automation' }],
    created_at: '2026-07-27T00:00:00Z',
    updated_at: '2026-07-27T01:00:00Z',
    body: 'Import this into Mission Control.',
    ...overrides,
  };
}

describe('GitHub issues importer helpers', () => {
  it('parses owner/name repositories', () => {
    expect(parseRepo('dhnpmp-tech/dcp-platform')).toEqual({
      owner: 'dhnpmp-tech',
      name: 'dcp-platform',
    });
  });

  it('rejects invalid repository strings', () => {
    expect(() => parseRepo('dhnpmp-tech')).toThrow(/owner\/name/);
  });

  it('builds stable GitHub external IDs', () => {
    expect(issueExternalId('dhnpmp-tech/dcp-platform', makeIssue({ number: 7 })))
      .toBe('github:dhnpmp-tech/dcp-platform#7');
  });

  it('normalizes label objects and strings', () => {
    const issue = makeIssue({ labels: ['p1', { name: 'backend' }, {}, null] });
    expect(issueLabels(issue)).toEqual(['p1', 'backend']);
  });

  it('clamps Mission task titles to API-safe length', () => {
    const title = missionTitleForIssue(makeIssue({ title: 'x'.repeat(400) }));
    expect(title.length).toBeLessThanOrEqual(300);
    expect(title).toMatch(/\.\.\.$/);
  });

  it('includes public issue metadata in task detail', () => {
    const detail = missionDetailForIssue('dhnpmp-tech/dcp-platform', makeIssue());
    expect(detail).toContain('Imported from GitHub issue dhnpmp-tech/dcp-platform#42');
    expect(detail).toContain('URL: https://github.com/dhnpmp-tech/dcp-platform/issues/42');
    expect(detail).toContain('Author: peter');
    expect(detail).toContain('Labels: mission, automation');
    expect(detail).toContain('Issue body excerpt:');
  });

  it('maps an issue to a Mission Control task payload', () => {
    const task = mapIssueToTask('dhnpmp-tech/dcp-platform', makeIssue(), { priority: 'p2' });
    expect(task).toMatchObject({
      externalId: 'github:dhnpmp-tech/dcp-platform#42',
      title: 'GitHub issue #42: Wire GitHub issues into Mission Control',
      source: 'github',
      sourceUrl: 'https://github.com/dhnpmp-tech/dcp-platform/issues/42',
      priority: 'p2',
    });
    expect(task.detail).toContain('Import this into Mission Control.');
  });
});

describe('fetchOpenIssues', () => {
  it('fetches open issues and filters out pull requests', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse([
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, pull_request: { url: 'https://api.github.com/pulls/2' } }),
    ]));

    const issues = await fetchOpenIssues({
      owner: 'dhnpmp-tech',
      repo: 'dcp-platform',
      githubToken: 'github-token-secret',
      fetchImpl: fetch,
      perPage: 50,
    });

    expect(issues.map((issue) => issue.number)).toEqual([1]);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/repos/dhnpmp-tech/dcp-platform/issues');
    expect(url).toContain('state=open');
    expect(url).toContain('per_page=50');
    expect(opts.headers.Authorization).toBe('Bearer github-token-secret');
  });

  it('omits the Authorization header when no GitHub token is provided', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse([]));

    await fetchOpenIssues({
      owner: 'dhnpmp-tech',
      repo: 'dcp-platform',
      fetchImpl: fetch,
    });

    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('throws sanitized errors on GitHub failures', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse({ message: 'bad credentials' }, 401));

    await expect(fetchOpenIssues({
      owner: 'dhnpmp-tech',
      repo: 'dcp-platform',
      githubToken: 'github-token-secret',
      fetchImpl: fetch,
    })).rejects.toThrow('HTTP 401');
    await expect(fetchOpenIssues({
      owner: 'dhnpmp-tech',
      repo: 'dcp-platform',
      githubToken: 'github-token-secret',
      fetchImpl: fetch,
    })).rejects.toThrow(expect.not.stringContaining('github-token-secret'));
  });
});

describe('importGithubIssues', () => {
  it('does not create tasks in dry-run mode', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse([makeIssue({ number: 9 })]));
    const client = {
      getTaskByExternalId: jest.fn().mockResolvedValue(null),
      createTask: jest.fn(),
    };
    const log = jest.fn();

    const summary = await importGithubIssues({
      client,
      repo: 'dhnpmp-tech/dcp-platform',
      fetchImpl: fetch,
      dryRun: true,
      log,
    });

    expect(client.getTaskByExternalId).toHaveBeenCalledWith('github:dhnpmp-tech/dcp-platform#9');
    expect(client.createTask).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      scanned: 1,
      candidates: 1,
      created: 0,
      skippedExisting: 0,
      dryRun: true,
    });
    expect(log.mock.calls.flat().join('\n')).toMatch(/dry-run would create/);
  });

  it('skips existing tasks by external ID', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse([makeIssue({ number: 10 })]));
    const client = {
      getTaskByExternalId: jest.fn().mockResolvedValue({ id: 'task_existing' }),
      createTask: jest.fn(),
    };

    const summary = await importGithubIssues({
      client,
      repo: 'dhnpmp-tech/dcp-platform',
      fetchImpl: fetch,
      dryRun: false,
    });

    expect(client.createTask).not.toHaveBeenCalled();
    expect(summary.skippedExisting).toBe(1);
  });

  it('creates missing tasks when dry-run is disabled', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse([makeIssue({ number: 11 })]));
    const client = {
      getTaskByExternalId: jest.fn().mockResolvedValue(null),
      createTask: jest.fn().mockResolvedValue({ id: 'task_new' }),
    };

    const summary = await importGithubIssues({
      client,
      repo: 'dhnpmp-tech/dcp-platform',
      fetchImpl: fetch,
      dryRun: false,
      priority: 'p2',
    });

    expect(client.createTask).toHaveBeenCalledTimes(1);
    expect(client.createTask.mock.calls[0][0]).toMatchObject({
      externalId: 'github:dhnpmp-tech/dcp-platform#11',
      source: 'github',
      sourceUrl: 'https://github.com/dhnpmp-tech/dcp-platform/issues/11',
      priority: 'p2',
    });
    expect(summary.created).toBe(1);
  });
});
