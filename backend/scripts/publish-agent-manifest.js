#!/usr/bin/env node
//
// publish-agent-manifest.js
//
// Admin CLI for publishing a new row to the `agent_manifest` table. The
// /agent/manifest.json endpoint returns whatever this script last inserted
// (latest by published_at DESC). dcp-agent providers then roll forward to
// `safe_commit` on their next self-update cron tick.
//
// USAGE:
//   node scripts/publish-agent-manifest.js <safe_commit> [options]
//
// OPTIONS:
//   --rollout=N         Canary percentage (0-100, default 100)
//   --min-tag=vX.Y.Z    Minimum agent tag floor (default: copy previous row's)
//   --notes="..."       Free-form release notes
//   --published-by=...  Who's publishing (default: $USER or 'admin-cli')
//   --no-verify         Skip the gh-api existence check (DANGEROUS, demo only)
//
// EXAMPLES:
//   # Canary 10% of fleet onto a new commit
//   node scripts/publish-agent-manifest.js abc123...def --rollout=10
//
//   # Promote to 100% after canary passes
//   node scripts/publish-agent-manifest.js abc123...def --rollout=100 \
//     --notes="canary green for 6h, promoting"
//
//   # Roll back by re-publishing an older commit
//   node scripts/publish-agent-manifest.js <older-sha> --rollout=100 \
//     --notes="rollback: bug in HEAD"
//

const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DC1_DB_PATH
  || path.join(__dirname, '..', 'data', 'providers.db');

const COMMIT_RE = /^[0-9a-f]{40}$/;

function parseArgs(argv) {
  const positional = [];
  const opts = {
    rollout: 100,
    minTag: undefined,
    notes: undefined,
    publishedBy: process.env.USER || 'admin-cli',
    noVerify: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--rollout=')) {
      const n = Number.parseInt(arg.slice('--rollout='.length), 10);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        die(`--rollout must be an integer 0..100, got: ${arg}`);
      }
      opts.rollout = n;
    } else if (arg.startsWith('--min-tag=')) {
      opts.minTag = arg.slice('--min-tag='.length);
    } else if (arg.startsWith('--notes=')) {
      opts.notes = arg.slice('--notes='.length);
    } else if (arg.startsWith('--published-by=')) {
      opts.publishedBy = arg.slice('--published-by='.length);
    } else if (arg === '--no-verify') {
      opts.noVerify = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      die(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    printHelp();
    die(`Expected exactly 1 positional argument (safe_commit), got ${positional.length}`);
  }

  return { safeCommit: positional[0].toLowerCase(), opts };
}

function printHelp() {
  console.log(
    `Usage: node scripts/publish-agent-manifest.js <safe_commit> [options]\n\n`
    + `  --rollout=N         Canary percentage 0..100 (default 100)\n`
    + `  --min-tag=vX.Y.Z    Minimum agent tag floor\n`
    + `  --notes="..."       Free-form release notes\n`
    + `  --published-by=...  Identity of publisher (default $USER)\n`
    + `  --no-verify         Skip gh-api commit existence check\n`,
  );
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function verifyCommitExists(sha) {
  try {
    const out = execFileSync(
      'gh',
      ['api', `repos/DCP-SA/dcp-agent/commits/${sha}`, '--jq', '.sha'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (out.toLowerCase() !== sha) {
      die(`gh api returned a different SHA (${out}) than requested (${sha}); refusing to publish`);
    }
  } catch (err) {
    die(
      `Could not verify commit ${sha} exists in DCP-SA/dcp-agent.\n`
      + `gh api error: ${err && err.message}\n`
      + `Pass --no-verify to override (NOT recommended).`,
    );
  }
}

function main() {
  const { safeCommit, opts } = parseArgs(process.argv.slice(2));

  if (!COMMIT_RE.test(safeCommit)) {
    die(`safe_commit must be a 40-char lowercase hex SHA, got: ${safeCommit}`);
  }

  if (!opts.noVerify) {
    console.log(`[publish-manifest] Verifying ${safeCommit} exists in DCP-SA/dcp-agent...`);
    verifyCommitExists(safeCommit);
    console.log(`[publish-manifest] OK, commit exists.`);
  } else {
    console.warn('[publish-manifest] --no-verify set, skipping existence check');
  }

  const db = new Database(DB_PATH);

  // If --min-tag not provided, inherit the previous row's tag so we don't
  // accidentally drop the floor.
  let minTag = opts.minTag;
  if (minTag === undefined) {
    const prev = db.prepare(
      'SELECT min_tag FROM agent_manifest ORDER BY published_at DESC, id DESC LIMIT 1',
    ).get();
    minTag = prev ? prev.min_tag : null;
  }

  const info = db.prepare(
    `INSERT INTO agent_manifest (safe_commit, min_tag, rollout_pct, published_by, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    safeCommit,
    minTag,
    opts.rollout,
    opts.publishedBy,
    opts.notes || null,
  );

  const inserted = db.prepare(
    `SELECT id, safe_commit, min_tag, rollout_pct, published_at, published_by, notes
       FROM agent_manifest WHERE id = ?`,
  ).get(info.lastInsertRowid);

  console.log('\n[publish-manifest] Published new manifest row:');
  console.log(JSON.stringify(inserted, null, 2));
  console.log('\nProviders will pick this up on their next self-update cron tick.');
}

if (require.main === module) {
  main();
}
