#!/usr/bin/env node
//
// mission-seed-agents.js
//
// Seed the Mission Control agent roster (idempotent). --issue-keys prints
// each key ONCE — store them immediately, only hashes are kept.
//
// USAGE:
//   node scripts/mission-seed-agents.js [--issue-keys]
//
// OPTIONS:
//   --issue-keys    Issue a new API key per agent and print it (shown once)
//

const db = require('../src/db');
const keys = require('../src/lib/missionAgentKeys');

const ROSTER = [
  { id: 'codex',      name: 'Codex',      scopes: 'agent' },
  { id: 'claude',     name: 'Claude',     scopes: 'agent' },
  { id: 'cursor',     name: 'Cursor',     scopes: 'agent' },
  { id: 'nexus',      name: 'Nexus',      scopes: 'agent' },
  { id: 'tito',       name: 'Tito',       scopes: 'agent' },
  { id: 'dispatcher', name: 'Dispatcher', scopes: 'dispatcher' },
];

const issueKeys = process.argv.includes('--issue-keys');

for (const a of ROSTER) {
  db.run(
    `INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active) VALUES (?, ?, 'agent', 1)`,
    a.id, a.name
  );
  console.log(`assignee ok: ${a.id}`);
  if (issueKeys) {
    const { rawKey } = keys.issueKey({
      assignee_id: a.id,
      label: `seed-${new Date().toISOString().slice(0, 10)}`,
      scopes: a.scopes,
    });
    console.log(`  KEY (${a.id}, shown once): ${rawKey}`);
  }
}

// db.js keeps a WAL-checkpoint interval alive; exit explicitly like the
// sibling one-shot scripts (contract-drift-probe, run-gate0-migration).
process.exit(0);
