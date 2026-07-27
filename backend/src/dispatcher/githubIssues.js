'use strict';

const DEFAULT_REPO = 'dhnpmp-tech/dcp-platform';
const DEFAULT_PRIORITY = 'p3';
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_EXCERPT_LENGTH = 2000;

function parseRepo(repo = DEFAULT_REPO) {
  const value = String(repo || '').trim();
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value);
  if (!match) {
    throw new Error('GitHub issues import: repo must be formatted as owner/name');
  }
  return { owner: match[1], name: match[2] };
}

function repoSlug(repo) {
  const parsed = typeof repo === 'string' ? parseRepo(repo) : repo;
  return `${parsed.owner}/${parsed.name}`;
}

function clampText(value, maxLength) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function issueExternalId(repo, issue) {
  return `github:${repoSlug(repo)}#${issue.number}`;
}

function issueLabels(issue) {
  return (Array.isArray(issue.labels) ? issue.labels : [])
    .map((label) => (typeof label === 'string' ? label : label && label.name))
    .filter(Boolean);
}

function missionTitleForIssue(issue) {
  return clampText(`GitHub issue #${issue.number}: ${issue.title || 'Untitled issue'}`, MAX_TITLE_LENGTH);
}

function missionDetailForIssue(repo, issue) {
  const labels = issueLabels(issue);
  const author = issue.user && issue.user.login ? issue.user.login : 'unknown';
  const bodyExcerpt = clampText(issue.body || '', MAX_BODY_EXCERPT_LENGTH);
  const lines = [
    `Imported from GitHub issue ${repoSlug(repo)}#${issue.number}.`,
    `URL: ${issue.html_url || 'unknown'}`,
    `State: ${issue.state || 'open'}`,
    `Author: ${author}`,
    `Labels: ${labels.length ? labels.join(', ') : 'none'}`,
    `Created: ${issue.created_at || 'unknown'}`,
    `Updated: ${issue.updated_at || 'unknown'}`,
    '',
    bodyExcerpt ? `Issue body excerpt:\n${bodyExcerpt}` : 'Issue body excerpt: none',
  ];
  return lines.join('\n');
}

function mapIssueToTask(repo, issue, options = {}) {
  const parsed = typeof repo === 'string' ? parseRepo(repo) : repo;
  return {
    externalId: issueExternalId(parsed, issue),
    title: missionTitleForIssue(issue),
    detail: missionDetailForIssue(parsed, issue),
    source: 'github',
    sourceUrl: issue.html_url,
    priority: options.priority || DEFAULT_PRIORITY,
  };
}

async function fetchOpenIssues({
  owner,
  repo,
  githubToken,
  fetchImpl = fetch,
  perPage = 100,
}) {
  const safePerPage = Math.min(Math.max(Number(perPage) || 100, 1), 100);
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/issues`);
  url.searchParams.set('state', 'open');
  url.searchParams.set('per_page', String(safePerPage));

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dcp-mission-github-issues-import',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`GitHub issues import: GET /repos/${owner}/${repo}/issues returned HTTP ${res.status}`);
  }

  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error(`GitHub issues import: GET /repos/${owner}/${repo}/issues returned a non-array body`);
  }
  return body.filter((issue) => !issue.pull_request);
}

async function importGithubIssues({
  client,
  repo = DEFAULT_REPO,
  githubToken,
  fetchImpl = fetch,
  dryRun = true,
  log = () => {},
  limit = 100,
  priority = DEFAULT_PRIORITY,
}) {
  const parsed = typeof repo === 'string' ? parseRepo(repo) : repo;
  const issues = await fetchOpenIssues({
    owner: parsed.owner,
    repo: parsed.name,
    githubToken,
    fetchImpl,
    perPage: limit,
  });
  const summary = {
    repo: repoSlug(parsed),
    scanned: issues.length,
    candidates: 0,
    created: 0,
    skippedExisting: 0,
    dryRun: Boolean(dryRun),
  };

  for (const issue of issues) {
    const task = mapIssueToTask(parsed, issue, { priority });
    summary.candidates += 1;

    const existing = await client.getTaskByExternalId(task.externalId);
    if (existing) {
      summary.skippedExisting += 1;
      log(`[github-issues] exists ${task.externalId}`);
      continue;
    }

    if (dryRun) {
      log(`[github-issues] dry-run would create ${task.externalId}: ${task.title}`);
      continue;
    }

    await client.createTask(task);
    summary.created += 1;
    log(`[github-issues] created ${task.externalId}`);
  }

  return summary;
}

module.exports = {
  DEFAULT_REPO,
  DEFAULT_PRIORITY,
  parseRepo,
  issueExternalId,
  issueLabels,
  missionTitleForIssue,
  missionDetailForIssue,
  mapIssueToTask,
  fetchOpenIssues,
  importGithubIssues,
};
