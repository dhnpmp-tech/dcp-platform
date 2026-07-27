const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const auditPath = path.join(root, 'docs/security/audits/2026-07-26-dcp-agent-desktop-launch-audit.md');
const audit = fs.readFileSync(auditPath, 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

[
  'DCP Agent + Desktop Launch Audit - 2026-07-26',
  'DCP-SA/dcp-agent',
  'DCP-SA/dcp-desktop',
  'cfb8f29143fcd59493a23861e2c6bac4a1d0c187',
  '9f56ba469598edeffda1e67409990f618836c9cb',
  'No live provider, billing, payment, WireGuard, Node 2, release, or production',
  'AD-01',
  'process argument',
  'AD-02',
  '/bin/sh',
  'AD-03',
  'format-valid provider key',
  'AD-04',
  'manifest, sha256, or signature verification',
  'AD-07',
  'useBackoffPoll',
  'AD-08',
  'release not found',
  'AD-09',
  'hermes-agent',
  'Recommended PR order',
  'Do not bundle',
].forEach((required) => {
  assert(audit.includes(required), `agent/desktop audit should include: ${required}`);
});

[
  'dcp-desktop/src-tauri/src/lib.rs:1412-1488',
  'dcp-desktop/policy/sa.dcp.provider.policy:43-52',
  'dcp-agent/scripts/install-cross-platform.sh:176-235',
  'dcp-agent/install.sh:28-29',
  'dcp-desktop/src/components/Dashboard.tsx:280-543',
  'dcp-desktop/.github/workflows/build-desktop.yml:7-16',
].forEach((ref) => {
  assert(audit.includes(ref), `agent/desktop audit should keep evidence ref: ${ref}`);
});

assert(!audit.includes('mak_'), 'agent/desktop audit must not include mission agent keys');
assert(!/\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/.test(audit), 'agent/desktop audit must not include bot-token shaped secrets');

assert(
  changelog.includes('docs(security): add dcp-agent and desktop launch audit'),
  'canonical changelog should include the agent/desktop audit entry',
);

console.log('dcp-agent + desktop audit static checks passed');
