import claudeCode from './claudeCode.js';

export class UnknownAgentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnknownAgentError';
  }
}

/** Agent registry — claude is live; codex/cursor are visible-but-stubbed. */
export const adapters = {
  claude: claudeCode,
  codex: { comingSoon: true, label: 'Codex' },
  cursor: { comingSoon: true, label: 'Cursor' },
};

export function getAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new UnknownAgentError(
      `Unknown agent "${name}". Available agents: ${Object.keys(adapters).join(', ')}`
    );
  }
  return adapter;
}
