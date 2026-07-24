const db = require('../db');
const keys = require('../lib/missionAgentKeys');
const missionRouter = require('../routes/mission');
const { resolveMissionAgent } = missionRouter.__private;

describe('mission agent auth', () => {
  beforeEach(() => {
    db.run(`DELETE FROM mission_agent_keys`);
    db.run(`INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, active)
            VALUES ('tito','Tito','agent',1)`);
  });

  it('resolves a per-agent key from x-mission-agent-key header', () => {
    const { rawKey } = keys.issueKey({ assignee_id: 'tito', scopes: 'agent' });
    const agent = resolveMissionAgent({ headers: { 'x-mission-agent-key': rawKey } });
    expect(agent).toMatchObject({ assignee_id: 'tito', scopes: 'agent' });
  });

  it('falls back to legacy shared env key (no assignee identity)', () => {
    const agent = resolveMissionAgent(
      { headers: { 'x-mission-agent-key': 'shared-secret' } },
      { legacyKey: 'shared-secret' }
    );
    expect(agent).toMatchObject({ assignee_id: null, scopes: 'legacy' });
  });

  it('returns null for garbage', () => {
    expect(resolveMissionAgent({ headers: { 'x-mission-agent-key': 'mak_bogus' } })).toBeNull();
    expect(resolveMissionAgent({ headers: {} })).toBeNull();
  });
});
