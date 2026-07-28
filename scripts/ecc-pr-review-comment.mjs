#!/usr/bin/env node
import fs from 'node:fs';

const MAX_MARKDOWN_COMMENT_CHARS = 60000;

function parseArgs(argv) {
  const args = argv.slice();
  const parsed = {};

  while (args.length) {
    const key = args.shift();
    const value = args[0] && !args[0].startsWith('--') ? args.shift() : undefined;

    if (key === '--agent') parsed.agent = value;
    else if (key === '--body') parsed.body = value;
    else if (key === '--help' || key === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${key}`);
  }

  return parsed;
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/ecc-pr-review-comment.mjs --agent <name> --body <markdown-file>
\n`);
}

function githubApiUrl(path) {
  if (/^https:\/\/api\.github\.com\//.test(path)) return path;

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  return `https://api.github.com/repos/${repository}${path}`;
}

function parseNextLinkHeader(linkHeader) {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(',')) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="next"$/);
    if (match) return match[1];
  }

  return null;
}

async function githubApiWithHeaders(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');

  const response = await fetch(githubApiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  return {
    data: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

async function githubApi(path, options = {}) {
  const response = await githubApiWithHeaders(path, options);
  return response.data;
}

async function githubApiAllPages(path) {
  const items = [];
  let nextPath = path;

  while (nextPath) {
    const { data, headers } = await githubApiWithHeaders(nextPath);
    if (!Array.isArray(data)) throw new Error(`GitHub API pagination expected an array for ${nextPath}`);
    items.push(...data);
    nextPath = parseNextLinkHeader(headers.get('link'));
  }

  return items;
}

function truncateCommentBody(body, limit = MAX_MARKDOWN_COMMENT_CHARS) {
  if (body.length <= limit) return body;

  const note = '\n\n_Review output truncated to stay below the GitHub comment size limit._\n';
  const keep = Math.max(0, limit - note.length);
  return `${body.slice(0, keep).trimEnd()}${note}`;
}

function readPullRequestNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  return event.pull_request && event.pull_request.number ? Number(event.pull_request.number) : null;
}

async function upsertStickyComment(agent, body) {
  const issueNumber = readPullRequestNumber();
  if (!issueNumber) {
    process.stdout.write('No pull_request event found; skipping ECC sticky comment.\n');
    return;
  }

  const marker = `<!-- dcp-ecc-pr-review:${agent} -->`;
  const nextBody = truncateCommentBody(body.includes(marker) ? body : `${marker}\n${body}`);
  const comments = await githubApiAllPages(`/issues/${issueNumber}/comments?per_page=100`);
  const existing = comments.find((comment) => (
    comment.user &&
    comment.user.type === 'Bot' &&
    typeof comment.body === 'string' &&
    comment.body.includes(marker)
  ));

  if (existing) {
    await githubApi(`/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: nextBody }),
    });
    process.stdout.write(`Updated ECC ${agent} PR comment.\n`);
    return;
  }

  await githubApi(`/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: nextBody }),
  });
  process.stdout.write(`Created ECC ${agent} PR comment.\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!args.agent || !args.body) {
    usage();
    throw new Error('--agent and --body are required');
  }

  const body = fs.readFileSync(args.body, 'utf8');
  await upsertStickyComment(args.agent, body);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

export {
  MAX_MARKDOWN_COMMENT_CHARS,
  parseArgs,
  parseNextLinkHeader,
  readPullRequestNumber,
  truncateCommentBody,
  upsertStickyComment,
};
