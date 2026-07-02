import { describe, it, expect } from 'vitest';
import { adapters, getAdapter, UnknownAgentError } from '../../src/adapters/index.js';
import claudeCode from '../../src/adapters/claudeCode.js';

describe('adapter registry', () => {
  it('resolves claude to the ClaudeCode adapter', () => {
    expect(getAdapter('claude')).toBe(claudeCode);
  });

  it('lists codex and cursor as coming soon', () => {
    expect(adapters.codex).toMatchObject({ comingSoon: true });
    expect(adapters.codex.label).toBeTruthy();
    expect(adapters.cursor).toMatchObject({ comingSoon: true });
    expect(adapters.cursor.label).toBeTruthy();
  });

  it('throws UnknownAgentError listing available agents for an unknown name', () => {
    expect(() => getAdapter('zed')).toThrowError(UnknownAgentError);
    try {
      getAdapter('zed');
    } catch (err) {
      expect(err.message).toContain('zed');
      expect(err.message).toContain('claude');
      expect(err.message).toContain('codex');
      expect(err.message).toContain('cursor');
    }
  });
});
