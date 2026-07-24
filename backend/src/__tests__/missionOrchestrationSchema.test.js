const db = require('../db');

describe('mission orchestration schema', () => {
  it('has mission_agent_keys table with expected columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_agent_keys)`).map(c => c.name);
    for (const c of ['id','assignee_id','key_hash','label','scopes','active','created_at','last_used_at']) {
      expect(cols).toContain(c);
    }
  });
  it('mission_tasks has lease + tier columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_tasks)`).map(c => c.name);
    for (const c of ['claimed_by','claimed_at','lease_expires_at','tier']) {
      expect(cols).toContain(c);
    }
  });
  it('mission_assignees has heartbeat columns', () => {
    const cols = db.all(`PRAGMA table_info(mission_assignees)`).map(c => c.name);
    expect(cols).toContain('last_seen_at');
    expect(cols).toContain('heartbeat_state');
  });
});
