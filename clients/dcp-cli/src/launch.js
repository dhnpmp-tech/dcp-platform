import { getAdapter } from './adapters/index.js';
import { writeConfig, resolveBaseUrl } from './config.js';

const COMING_SOON_EXIT_CODE = 2;

export class AgentNotInstalledError extends Error {
  constructor(message, installHint) {
    super(message);
    this.name = 'AgentNotInstalledError';
    this.installHint = installHint;
  }
}

/**
 * Resolve the agent adapter, verify it is installed, wire the DCP env,
 * remember the pick, and hand the terminal over to the agent.
 * Returns the agent's exit code (2 for coming-soon stubs).
 */
export async function launchAgent({ agent, modelId, config }) {
  const adapter = getAdapter(agent);

  if (adapter.comingSoon) {
    console.error(`${adapter.label} support is coming soon — try: dcp launch claude`);
    return COMING_SOON_EXIT_CODE;
  }

  if (!(await adapter.detectInstalled())) {
    const hint = adapter.installHint();
    throw new AgentNotInstalledError(
      `${adapter.label} is not installed. Install it with: ${hint}`,
      hint
    );
  }

  const env = adapter.configureEnv({
    modelId,
    token: config.token,
    baseUrl: resolveBaseUrl(config),
  });

  writeConfig({ lastAgent: agent, lastModel: modelId });

  return adapter.launch(env);
}
