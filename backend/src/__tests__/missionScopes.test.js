const missionRouter = require('../routes/mission');
const { agentWritePolicy } = missionRouter.__private;

const agent = { assignee_id: 'codex', scopes: 'agent' };
const dispatcher = { assignee_id: 'dispatcher', scopes: 'dispatcher' };

describe('agentWritePolicy', () => {
  it('denies task creation for agent scope', () => {
    expect(agentWritePolicy(agent, { action: 'create_task', body: {} }).allowed).toBe(false);
  });
  it('allows dispatcher task creation only with external_id', () => {
    expect(agentWritePolicy(dispatcher, { action: 'create_task', body: { external_id: 'provider-down-7' } }).allowed).toBe(true);
    expect(agentWritePolicy(dispatcher, { action: 'create_task', body: {} }).allowed).toBe(false);
  });
  it('denies done/cancelled and foreign tasks for agent scope', () => {
    expect(agentWritePolicy(agent, { action: 'patch_task', task: { claimed_by: 'codex' }, body: { status: 'done' } }).allowed).toBe(false);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: { claimed_by: 'codex' }, body: { status: 'cancelled' } }).allowed).toBe(false);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: { claimed_by: 'tito' }, body: { status: 'review' } }).allowed).toBe(false);
  });
  it('allows holder in_progress<->blocked->review, source_url, blocked_reason; denies other fields', () => {
    const t = { claimed_by: 'codex' };
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'review' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'blocked', blocked_reason: 'x' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { status: 'in_progress' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { source_url: 'https://github.com/x/pull/1' } }).allowed).toBe(true);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { title: 'hijack' } }).allowed).toBe(false);
    expect(agentWritePolicy(agent, { action: 'patch_task', task: t, body: { assignee_id: 'codex' } }).allowed).toBe(false);
  });
  it('denies delete/reassign/goal/milestone writes for both scopes', () => {
    for (const who of [agent, dispatcher]) {
      for (const action of ['delete_task', 'reassign_task', 'write_goal', 'write_milestone']) {
        expect(agentWritePolicy(who, { action, body: {} }).allowed).toBe(false);
      }
    }
  });
  it('allows commenting for both scopes', () => {
    expect(agentWritePolicy(agent, { action: 'comment' }).allowed).toBe(true);
    expect(agentWritePolicy(dispatcher, { action: 'comment' }).allowed).toBe(true);
  });
  it('denies patch_task for dispatcher scope (dispatcher never holds claims)', () => {
    expect(agentWritePolicy(dispatcher, {
      action: 'patch_task', task: { claimed_by: 'codex' }, body: { status: 'review' },
    }).allowed).toBe(false);
  });
});
