#!/usr/bin/env node
import fs from 'node:fs';

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

async function githubApi(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');

  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
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

  return text ? JSON.parse(text) : null;
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
  const nextBody = body.includes(marker) ? body : `${marker}\n${body}`;
  const comments = await githubApi(`/issues/${issueNumber}/comments?per_page=100`);
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
  parseArgs,
  readPullRequestNumber,
  upsertStickyComment,
};
