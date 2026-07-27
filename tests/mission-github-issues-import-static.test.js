const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/mission-github-issues-import.yml'), 'utf8');
const runbook = fs.readFileSync(path.join(root, 'docs/orchestration/GITHUB_ISSUES_IMPORT.md'), 'utf8');
const backendPackage = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
const script = fs.readFileSync(path.join(root, 'backend/src/scripts/import-github-issues-to-mission.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'backend/src/dispatcher/githubIssues.js'), 'utf8');

[
  'workflow_dispatch:',
  "cron: '17 * * * *'",
  "vars.MISSION_GITHUB_ISSUES_IMPORT_ENABLED == '1'",
  'GITHUB_ISSUES_IMPORT_DRY_RUN',
  'secrets.MISSION_DISPATCHER_KEY',
  'github.token',
  'node backend/src/scripts/import-github-issues-to-mission.js',
].forEach((required) => {
  assert(workflow.includes(required), `workflow missing required safety/config: ${required}`);
});

[
  'dry-run by default',
  'external_id=github:<owner>/<repo>#<issue-number>',
  'Pull requests are filtered out',
  'MISSION_DISPATCHER_KEY',
  'dhnpmp-tech/dcp-platform',
  'Older task text may still mention `dhnpmp-tech/dc1-platform`',
].forEach((required) => {
  assert(runbook.includes(required), `runbook missing required evidence: ${required}`);
});

[
  'GITHUB_ISSUES_IMPORT_DRY_RUN',
  'MISSION_DISPATCHER_KEY is required when GITHUB_ISSUES_IMPORT_DRY_RUN=0',
  'Dry-runs may use MISSION_AGENT_KEY',
].forEach((required) => {
  assert(script.includes(required), `script missing required guard: ${required}`);
});

assert.strictEqual(
  backendPackage.scripts['mission:import-github-issues'],
  'node src/scripts/import-github-issues-to-mission.js',
  'backend package should expose the Mission GitHub issue importer command',
);

[
  "source: 'github'",
  'pull_request',
  'client.getTaskByExternalId',
  'client.createTask(task)',
].forEach((required) => {
  assert(moduleSource.includes(required), `importer missing required behavior: ${required}`);
});

assert(!workflow.includes('mak_'), 'workflow must not contain Mission agent keys');
assert(!runbook.includes('mak_'), 'runbook must not contain Mission agent keys');
assert(!script.includes('mak_'), 'script must not contain Mission agent keys');
assert(!moduleSource.includes('mak_'), 'importer module must not contain Mission agent keys');

console.log('Mission GitHub issues importer static checks passed');
