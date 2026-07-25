// backend/src/lib/missionClaims.js
// Atomic claim/lease semantics for mission_tasks (spec §5). Every state
// change is a single guarded UPDATE — the WHERE clause IS the lock.
// Intentional: release/reset also clear assignee_id so abandoned work
// returns to the pool instead of staying pinned to the abandoning agent.
const db = require('../db');

const DEFAULT_TTL_MINUTES = 240;
const MAX_TTL_MINUTES = 1440;

function leaseEnd(now, ttlMinutes) {
  const ttl = Math.min(Math.max(1, ttlMinutes || DEFAULT_TTL_MINUTES), MAX_TTL_MINUTES);
  return new Date(now.getTime() + ttl * 60_000).toISOString();
}

function claimTask({ taskId, agentId, ttlMinutes, now = new Date() }) {
  const nowIso = now.toISOString();
  const info = db.run(
    `UPDATE mission_tasks
     SET status = 'in_progress', claimed_by = ?, claimed_at = ?, assignee_id = ?,
         lease_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
       AND (
         (status = 'todo' AND (assignee_id IS NULL OR assignee_id = ?))
         OR (status IN ('in_progress','blocked')
             AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
       )`,
    agentId, nowIso, agentId, leaseEnd(now, ttlMinutes), taskId, agentId, nowIso
  );
  if (!info || info.changes !== 1) {
    const exists = db.get(`SELECT 1 FROM mission_tasks WHERE id = ?`, taskId);
    return { ok: false, error: exists ? 'claimed' : 'not_found' };
  }
  return { ok: true };
}

function renewLease({ taskId, agentId, ttlMinutes, now = new Date() }) {
  const info = db.run(
    `UPDATE mission_tasks SET lease_expires_at = ?, updated_at = datetime('now')
     WHERE id = ? AND claimed_by = ? AND status IN ('in_progress','blocked')`,
    leaseEnd(now, ttlMinutes), taskId, agentId
  );
  return info && info.changes === 1 ? { ok: true } : { ok: false, error: 'not_holder' };
}

function releaseTask({ taskId, agentId }) {
  const info = db.run(
    `UPDATE mission_tasks
     SET status = 'todo', claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         assignee_id = NULL, updated_at = datetime('now')
     WHERE id = ? AND claimed_by = ? AND status IN ('in_progress','blocked')`,
    taskId, agentId
  );
  return info && info.changes === 1 ? { ok: true } : { ok: false, error: 'not_holder' };
}

module.exports = { claimTask, renewLease, releaseTask, DEFAULT_TTL_MINUTES, MAX_TTL_MINUTES };
