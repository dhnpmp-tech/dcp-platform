#!/usr/bin/env node
'use strict';

const { MissionClient } = require('../dispatcher/client');
const {
  DEFAULT_PRIORITY,
  DEFAULT_REPO,
  importGithubIssues,
  parseRepo,
} = require('../dispatcher/githubIssues');

function envBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function envInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const repo = process.env.GITHUB_ISSUES_IMPORT_REPO || DEFAULT_REPO;
  const dryRun = envBool(process.env.GITHUB_ISSUES_IMPORT_DRY_RUN, true);
  const missionBaseUrl = process.env.MISSION_BASE_URL || 'https://api.dcp.sa';
  const dispatcherKey = process.env.MISSION_DISPATCHER_KEY || '';
  const missionKey = dispatcherKey || (dryRun ? process.env.MISSION_AGENT_KEY || '' : '');

  parseRepo(repo);

  if (!missionKey) {
    throw new Error('MISSION_DISPATCHER_KEY is required. Dry-runs may use MISSION_AGENT_KEY for duplicate checks.');
  }
  if (!dryRun && !dispatcherKey) {
    throw new Error('MISSION_DISPATCHER_KEY is required when GITHUB_ISSUES_IMPORT_DRY_RUN=0.');
  }

  const client = new MissionClient({
    baseUrl: missionBaseUrl,
    agentKey: missionKey,
  });
  const summary = await importGithubIssues({
    client,
    repo,
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
    dryRun,
    limit: envInt(process.env.GITHUB_ISSUES_IMPORT_LIMIT, 100),
    priority: process.env.GITHUB_ISSUES_IMPORT_PRIORITY || DEFAULT_PRIORITY,
    log: (line) => process.stderr.write(`${line}\n`),
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}

module.exports = { envBool, envInt, main };
