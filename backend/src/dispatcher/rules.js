'use strict';

/**
 * dispatcher/rules.js — Pure rules engine for Mission Control dispatcher.
 *
 * No I/O, no side effects, no dependencies outside plain JS.
 *
 * Exported:
 *   planActions(opts)    → action[]
 *   ts(s)               → Date | null   (timestamp normalizer)
 *   dubaiDateString(now) → 'YYYY-MM-DD'
 *   shouldDigest(now, lastDigestDate) → boolean
 */

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

const BLOCKED_ESCALATE_HOURS = 24;
const P0_TODO_ESCALATE_HOURS = 4;
const ESCALATE_DEDUP_HOURS = 24;
const DIGEST_HOUR_DUBAI = 8;
const DUBAI_UTC_OFFSET_HOURS = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a timestamp string to a Date, treating SQLite space-format as UTC.
 *
 * SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' with no zone marker.
 * new Date('YYYY-MM-DD HH:MM:SS') parses as LOCAL time in Node, which is
 * wrong for any non-UTC TZ. We detect the space and append 'T' + 'Z' so
 * the engine always treats it as UTC.
 *
 * @param {string|null|undefined} s
 * @returns {Date|null}
 */
function ts(s) {
  if (!s) return null;
  // Space format: 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM:SSZ'
  const normalized = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

/**
 * Return the Dubai local date string (YYYY-MM-DD) for a given UTC Date.
 * Dubai is UTC+4 with no DST.
 *
 * @param {Date} now
 * @returns {string}
 */
function dubaiDateString(now) {
  const dubaiMs = now.getTime() + DUBAI_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const d = new Date(dubaiMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * True when the daily digest should fire.
 *
 * @param {Date}        now
 * @param {string|null} lastDigestDate  'YYYY-MM-DD' of last fire, Dubai time
 * @returns {boolean}
 */
function shouldDigest(now, lastDigestDate) {
  const dubaiMs = now.getTime() + DUBAI_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const dubaiDate = new Date(dubaiMs);
  const dubaiHour = dubaiDate.getUTCHours();
  if (dubaiHour < DIGEST_HOUR_DUBAI) return false;
  const todayDubai = dubaiDateString(now);
  return lastDigestDate !== todayDubai;
}

/**
 * Return true when the ledger key is absent or older than maxHours.
 *
 * @param {Object} ledger
 * @param {string} key
 * @param {Date}   now
 * @param {number} maxHours
 * @returns {boolean}
 */
function ledgerAllows(ledger, key, now, maxHours) {
  const entry = ledger[key];
  if (!entry) return true;
  const entryTime = ts(entry);
  if (!entryTime) return true;
  const ageMs = now.getTime() - entryTime.getTime();
  return ageMs > maxHours * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Main rules engine
// ---------------------------------------------------------------------------

/**
 * Compute the next batch of dispatcher actions from a snapshot.
 *
 * @param {Object}   opts
 * @param {Array}    opts.tasks              — current task snapshot
 * @param {Array}    [opts.providerIncidents] — [{external_id, title, detail}]
 * @param {Date}     opts.now
 * @param {Object}   [opts.ledger]            — dedup log {key: isoString}
 * @param {string|null} [opts.lastCursor]     — last processed updated_at
 * @param {string|null} [opts.lastDigestDate] — 'YYYY-MM-DD', Dubai
 * @returns {Array}  action objects
 */
function planActions({
  tasks = [],
  providerIncidents = [],
  now,
  ledger = {},
  lastCursor = null,
  lastDigestDate = null,
}) {
  const actions = [];
  const seenTaskIds = new Set(); // dedup within a single call (duplicate task rows)

  const nowMs = now.getTime();
  const cursorDate = lastCursor ? ts(lastCursor) : null;

  for (const task of tasks) {
    const { id, status, priority, assignee_id, external_id, lease_expires_at, updated_at } = task;

    // Skip duplicate task rows within the same snapshot
    if (seenTaskIds.has(id)) continue;
    seenTaskIds.add(id);

    const leaseDate = ts(lease_expires_at);
    const updatedDate = ts(updated_at);

    // --- reset_lease ---
    // in_progress or blocked, non-null lease, expired
    if (
      (status === 'in_progress' || status === 'blocked') &&
      leaseDate !== null &&
      leaseDate.getTime() < nowMs
    ) {
      actions.push({ type: 'reset_lease', taskId: id });
    }

    // --- escalate ---
    const updatedMs = updatedDate ? updatedDate.getTime() : 0;

    let shouldEscalate = false;
    let escalateReason = '';

    if (status === 'blocked') {
      const ageMs = nowMs - updatedMs;
      if (ageMs > BLOCKED_ESCALATE_HOURS * 60 * 60 * 1000) {
        shouldEscalate = true;
        escalateReason = `blocked for more than ${BLOCKED_ESCALATE_HOURS}h`;
      }
    } else if (status === 'todo' && priority === 'p0') {
      const ageMs = nowMs - updatedMs;
      if (ageMs > P0_TODO_ESCALATE_HOURS * 60 * 60 * 1000) {
        shouldEscalate = true;
        escalateReason = `p0 task in todo for more than ${P0_TODO_ESCALATE_HOURS}h`;
      }
    }

    if (shouldEscalate && ledgerAllows(ledger, id, now, ESCALATE_DEDUP_HOURS)) {
      actions.push({ type: 'escalate', taskId: id, reason: escalateReason });
    }

    // --- notify_assignment ---
    // Only when lastCursor is non-null (skip first run to avoid spam)
    if (assignee_id !== null && cursorDate !== null && updatedDate !== null) {
      if (updatedDate.getTime() > cursorDate.getTime()) {
        const dedupKey = `assign:${id}:${assignee_id}`;
        if (ledgerAllows(ledger, dedupKey, now, ESCALATE_DEDUP_HOURS)) {
          actions.push({ type: 'notify_assignment', taskId: id, assigneeId: assignee_id });
        }
      }
    }
  }

  // --- digest ---
  if (shouldDigest(now, lastDigestDate)) {
    actions.push({ type: 'digest' });
  }

  // --- create_repair_task ---
  const knownExternalIds = new Set(tasks.map((t) => t.external_id).filter(Boolean));
  for (const incident of providerIncidents) {
    if (!knownExternalIds.has(incident.external_id)) {
      actions.push({
        type: 'create_repair_task',
        externalId: incident.external_id,
        title: incident.title,
        detail: incident.detail,
      });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { planActions, ts, dubaiDateString, shouldDigest };
