'use strict';

/**
 * dispatcher/run.js — Dispatcher runner loop.
 *
 * Exports:
 *   tick(deps)  — single orchestration pass over injected deps (pure, testable)
 *
 * When run as main module (node dispatcher/run.js):
 *   - Reads env: MISSION_BASE_URL, MISSION_DISPATCHER_KEY,
 *                DISPATCHER_DRY_RUN, DISPATCHER_STATE_FILE,
 *                DISPATCH_INTERVAL_MS
 *   - Loads/saves state JSON from DISPATCHER_STATE_FILE
 *   - Builds a MissionClient + no-op notifier (Task 11 wires the real one)
 *   - Runs tick on interval; --once flag = single tick then exit 0
 *
 * Incident derivation strategy (fleet endpoint):
 *   - Providers classified as 'offline' with last_heartbeat_age_seconds >= 900
 *     (15 minutes) are treated as down and generate create_repair_task incidents.
 *   - Providers classified as 'unreachable' (endpoint unreachable from VPS)
 *     are also surfaced as incidents regardless of heartbeat age.
 *   - 'stale' providers (heartbeat between 90s and 10m ago) are NOT surfaced —
 *     they may simply be briefly slow; escalating them would be too noisy.
 *   - 'paused' providers are intentionally off, never incidents.
 *   - 'never_seen' providers are not yet active; skipped.
 *   This is conservative by design: rather miss a brief outage than spam.
 */

const fs = require('fs');
const path = require('path');
const { MissionClient } = require('./client');
const { planActions, ts, dubaiDateString } = require('./rules');

// ---------------------------------------------------------------------------
// Incident derivation
// ---------------------------------------------------------------------------

const OFFLINE_INCIDENT_THRESHOLD_SECONDS = 15 * 60; // 15 minutes

/**
 * Derive provider incidents from a fleet response.
 *
 * Returns an array of { external_id, title, detail } objects that can be
 * passed directly to planActions as providerIncidents.
 *
 * @param {object} fleet  — response body from GET /api/mission/fleet
 * @returns {Array}
 */
function deriveIncidents(fleet) {
  if (!fleet || typeof fleet !== 'object') return [];
  const incidents = [];

  // Offline providers that have been down for >= OFFLINE_INCIDENT_THRESHOLD_SECONDS
  const offlineList = Array.isArray(fleet.offline_recent) ? fleet.offline_recent : [];
  for (const p of offlineList) {
    const ageSecs = typeof p.last_heartbeat_age_seconds === 'number' ? p.last_heartbeat_age_seconds : Infinity;
    if (ageSecs >= OFFLINE_INCIDENT_THRESHOLD_SECONDS) {
      incidents.push({
        external_id: `provider:${p.id}:offline`,
        title: `Provider offline: ${p.name || p.id}`,
        detail: `Provider ${p.name || p.id} (id=${p.id}) has been offline for ${Math.round(ageSecs / 60)}m. Last heartbeat: ${p.last_heartbeat || 'never'}.`,
      });
    }
  }

  // Unreachable providers (WG tunnel/endpoint unreachable from VPS)
  const unreachable = Array.isArray(fleet.unreachable) ? fleet.unreachable : [];
  for (const p of unreachable) {
    incidents.push({
      external_id: `provider:${p.id}:unreachable`,
      title: `Provider unreachable: ${p.name || p.id}`,
      detail: `Provider ${p.name || p.id} (id=${p.id}) is unreachable from the VPS. WG tunnel or endpoint may be down. Last heartbeat age: ${p.last_heartbeat_age_seconds != null ? `${Math.round(p.last_heartbeat_age_seconds / 60)}m` : 'unknown'}.`,
    });
  }

  return incidents;
}

// ---------------------------------------------------------------------------
// Ledger pruning
// ---------------------------------------------------------------------------

const LEDGER_MAX_AGE_HOURS = 48;

/**
 * Remove ledger entries older than 48 hours to bound memory growth.
 *
 * @param {object} ledger   — mutated in place
 * @param {Date}   now
 */
function pruneLedger(ledger, now) {
  const cutoffMs = now.getTime() - LEDGER_MAX_AGE_HOURS * 60 * 60 * 1000;
  for (const key of Object.keys(ledger)) {
    const entry = ledger[key];
    const entryDate = ts(entry);
    if (entryDate && entryDate.getTime() < cutoffMs) {
      delete ledger[key];
    }
  }
}

// ---------------------------------------------------------------------------
// tick — single orchestration pass
// ---------------------------------------------------------------------------

/**
 * Execute one dispatcher pass.
 *
 * @param {object}   deps
 * @param {object}   deps.client       — MissionClient instance
 * @param {object}   deps.notifier     — { sendTeam(text), sendAlert(text) }
 * @param {object}   deps.state        — { ledger, lastCursor, lastDigestDate }
 * @param {Function} deps.saveState    — called with state at end of tick
 * @param {Date}     [deps.now]        — injectable clock (default: new Date())
 * @param {boolean}  [deps.dryRun]     — if true, log actions but don't execute I/O
 * @param {Function} [deps.log]        — logging fn (default: console.log)
 */
async function tick(deps) {
  const {
    client,
    notifier,
    state,
    saveState,
    now = new Date(),
    dryRun = false,
    log = console.log,
  } = deps;

  // ── 1. Fetch tasks ───────────────────────────────────────────────────────
  let tasks = [];
  try {
    tasks = await client.getTasks();
  } catch (err) {
    log('[dispatcher] error fetching tasks:', err && err.message);
    // Don't bail — run with empty task list so state still advances
  }

  // ── 2. Fetch fleet + derive incidents ────────────────────────────────────
  let providerIncidents = [];
  try {
    const fleet = await client.getFleet();
    providerIncidents = deriveIncidents(fleet);
  } catch (err) {
    log('[dispatcher] error fetching fleet (no incidents emitted):', err && err.message);
  }

  // ── 3. Plan actions ──────────────────────────────────────────────────────
  const actions = planActions({
    tasks,
    providerIncidents,
    now,
    ledger: state.ledger,
    lastCursor: state.lastCursor,
    lastDigestDate: state.lastDigestDate,
  });

  // ── 4. Execute actions ───────────────────────────────────────────────────
  for (const action of actions) {
    try {
      await executeAction(action, { client, notifier, state, now, dryRun, log });
    } catch (err) {
      log(`[dispatcher] error executing action ${action.type}:`, err && err.message);
      // Continue — one failed action must not kill the tick
    }
  }

  // ── 5. Advance cursor ────────────────────────────────────────────────────
  state.lastCursor = now.toISOString();

  // ── 6. Prune ledger ──────────────────────────────────────────────────────
  pruneLedger(state.ledger, now);

  // ── 7. Persist state ─────────────────────────────────────────────────────
  saveState(state);
}

/**
 * Execute a single planned action (or log it in dry-run mode).
 * State mutations (ledger, lastDigestDate) happen in both real and dry-run
 * so bookkeeping is mirrored.
 */
async function executeAction(action, { client, notifier, state, now, dryRun, log }) {
  switch (action.type) {
    case 'reset_lease': {
      if (dryRun) {
        log(`[dry-run] would reset_lease task ${action.taskId}`);
        return;
      }
      const result = await client.resetLease(action.taskId);
      if (result.skipped) {
        log(`[dispatcher] reset_lease skipped (409) for task ${action.taskId}`);
      } else {
        log(`[dispatcher] reset_lease ok for task ${action.taskId}`);
      }
      break;
    }

    case 'escalate': {
      const msg = `⚠️ ${action.reason} — task ${action.taskId}`;
      if (dryRun) {
        log(`[dry-run] would escalate: ${msg}`);
      } else {
        await notifier.sendAlert(msg);
      }
      // Update ledger in both real and dry-run
      state.ledger[action.taskId] = now.toISOString();
      break;
    }

    case 'notify_assignment': {
      const msg = `📋 Task ${action.taskId} assigned to ${action.assigneeId}`;
      if (dryRun) {
        log(`[dry-run] would notify_assignment: ${msg}`);
      } else {
        await notifier.sendTeam(msg);
      }
      // Update ledger in both real and dry-run
      const assignKey = `assign:${action.taskId}:${action.assigneeId}`;
      state.ledger[assignKey] = now.toISOString();
      break;
    }

    case 'digest': {
      if (dryRun) {
        log('[dry-run] would fetch digest and send to team');
      } else {
        const text = await client.getDigest();
        await notifier.sendTeam(text);
      }
      // Update lastDigestDate in both real and dry-run
      state.lastDigestDate = dubaiDateString(now);
      break;
    }

    case 'create_repair_task': {
      // Double-check: do not create if a task with this external_id already exists.
      const existing = await client.getTaskByExternalId(action.externalId);
      if (existing) {
        log(`[dispatcher] repair task already exists for ${action.externalId} (${existing.id}), skipping`);
        return;
      }
      if (dryRun) {
        log(`[dry-run] would create_repair_task: ${action.title} (${action.externalId})`);
        return;
      }
      const created = await client.createRepairTask({
        externalId: action.externalId,
        title: action.title,
        detail: action.detail,
      });
      log(`[dispatcher] created repair task ${created && created.id} for ${action.externalId}`);
      break;
    }

    default:
      log(`[dispatcher] unknown action type: ${action.type}`);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { tick };

// ---------------------------------------------------------------------------
// Main-module block — only runs when executed directly (node dispatcher/run.js)
// ---------------------------------------------------------------------------

/* istanbul ignore next */
if (require.main === module) {
  const MISSION_BASE_URL      = process.env.MISSION_BASE_URL || 'http://127.0.0.1:8083';
  const MISSION_DISPATCHER_KEY = process.env.MISSION_DISPATCHER_KEY || '';
  const DRY_RUN               = (process.env.DISPATCHER_DRY_RUN ?? '1') !== '0';
  const STATE_FILE            = process.env.DISPATCHER_STATE_FILE || path.join(__dirname, 'mission-dispatcher-state.json');
  const INTERVAL_MS           = Number(process.env.DISPATCH_INTERVAL_MS) || 300_000; // 5 minutes

  const client = new MissionClient({
    baseUrl: MISSION_BASE_URL,
    agentKey: MISSION_DISPATCHER_KEY,
  });

  const notifier = {
    sendTeam:  async (text) => console.log('[notify-noop]', text.slice(0, 120)),
    sendAlert: async (text) => console.log('[notify-noop]', text.slice(0, 120)),
  };

  function loadState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      return { ledger: {}, lastCursor: null, lastDigestDate: null };
    }
  }

  function saveState(state) {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('[dispatcher] failed to save state:', err && err.message);
    }
  }

  async function runTick() {
    const state = loadState();
    await tick({
      client,
      notifier,
      state,
      saveState,
      dryRun: DRY_RUN,
      log: (...args) => console.log(...args),
    });
  }

  const once = process.argv.includes('--once');

  if (once) {
    runTick().then(() => process.exit(0)).catch((err) => {
      console.error('[dispatcher] fatal tick error:', err && err.message);
      process.exit(1);
    });
  } else {
    console.log(`[dispatcher] starting (interval=${INTERVAL_MS}ms, dryRun=${DRY_RUN}, base=${MISSION_BASE_URL})`);
    runTick(); // immediate first run
    setInterval(runTick, INTERVAL_MS);
  }
}
