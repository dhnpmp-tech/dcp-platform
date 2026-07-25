const db = require('../db');
const keys = require('../lib/missionAgentKeys');

describe('missionAgentKeys', () => {
  beforeEach(() => {
    db.run(`DELETE FROM mission_agent_keys`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('codex','Codex','agent',1)`);
  });

  it('issues a key and resolves it to the assignee with scope', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 'test', scopes: 'agent' });
    expect(rawKey).toMatch(/^mak_[A-Za-z0-9_-]{40,}$/);
    const resolved = keys.resolveKey(rawKey);
    expect(resolved).toMatchObject({ assignee_id: 'codex', scopes: 'agent', key_id: id });
  });

  it('does not store the raw key, only the hash', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    const row = db.get(`SELECT * FROM mission_agent_keys WHERE id = ?`, id);
    expect(row.key_hash).toBe(keys.hashKey(rawKey));
    expect(row.key_hash).not.toContain(rawKey.slice(4, 20));
  });

  it('returns null for unknown or revoked keys', () => {
    expect(keys.resolveKey('mak_nope')).toBeNull();
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    keys.revokeKey(id);
    expect(keys.resolveKey(rawKey)).toBeNull();
  });

  it('stamps last_used_at on resolve', () => {
    const { rawKey, id } = keys.issueKey({ assignee_id: 'codex', label: 't', scopes: 'agent' });
    keys.resolveKey(rawKey);
    const row = db.get(`SELECT last_used_at FROM mission_agent_keys WHERE id = ?`, id);
    expect(row.last_used_at).toBeTruthy();
  });

  it('rejects unknown scopes and unknown assignees', () => {
    expect(() => keys.issueKey({ assignee_id: 'codex', scopes: 'root' })).toThrow(/invalid scope/);
    expect(() => keys.issueKey({ assignee_id: 'ghost', scopes: 'agent' })).toThrow(/unknown assignee/);
  });
});
