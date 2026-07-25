// Per-agent Mission Control API keys. Raw key shown once at issuance;
// only the sha256 hash is stored. Lookup is by hash (indexed), so no
// timing-sensitive string compare is needed against user input.
const crypto = require('crypto');
const db = require('../db');

const SCOPES = ['agent', 'dispatcher'];

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

function issueKey({ assignee_id, label = null, scopes = 'agent' }) {
  if (!SCOPES.includes(scopes)) throw new Error(`invalid scope: ${scopes}`);
  const assignee = db.get(`SELECT id FROM mission_assignees WHERE id = ? AND active = 1`, assignee_id);
  if (!assignee) throw new Error(`unknown assignee: ${assignee_id}`);
  const rawKey = `mak_${crypto.randomBytes(32).toString('base64url')}`;
  const id = `key_${crypto.randomBytes(6).toString('hex')}`;
  db.run(
    `INSERT INTO mission_agent_keys (id, assignee_id, key_hash, label, scopes) VALUES (?, ?, ?, ?, ?)`,
    id, assignee_id, hashKey(rawKey), label, scopes
  );
  return { id, rawKey };
}

function resolveKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const row = db.get(
    `SELECT k.id AS key_id, k.assignee_id, k.scopes
     FROM mission_agent_keys k WHERE k.key_hash = ? AND k.active = 1 LIMIT 1`,
    hashKey(rawKey)
  );
  if (!row) return null;
  db.run(`UPDATE mission_agent_keys SET last_used_at = datetime('now') WHERE id = ?`, row.key_id);
  return row;
}

function revokeKey(id) {
  db.run(`UPDATE mission_agent_keys SET active = 0 WHERE id = ?`, id);
}

function listKeys() {
  return db.all(
    `SELECT id, assignee_id, label, scopes, active, created_at, last_used_at
     FROM mission_agent_keys ORDER BY created_at DESC`
  );
}

module.exports = { hashKey, issueKey, resolveKey, revokeKey, listKeys, SCOPES };
