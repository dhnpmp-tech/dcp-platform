import { execa } from 'execa';

/**
 * Claude Code adapter — points a stock `claude` install at DCP's
 * Anthropic-compatible surface via environment variables only.
 */
export const claudeCode = {
  id: 'claude',
  binName: 'claude',
  label: 'Claude Code',

  /**
   * The exact env map that makes Claude Code "just work" against DCP:
   * every model slot pins to the picked DCP model, auth goes through
   * ANTHROPIC_AUTH_TOKEN, and ANTHROPIC_API_KEY is forced to the empty
   * string so an inherited real Anthropic key can never leak upstream.
   */
  configureEnv({ modelId, token, baseUrl }) {
    return {
      ANTHROPIC_BASE_URL: `${baseUrl}/anthropic`,
      ANTHROPIC_AUTH_TOKEN: token,
      ANTHROPIC_MODEL: modelId,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
      ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION: modelId,
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: `DCP · ${modelId}`,
      ANTHROPIC_API_KEY: '',
    };
  },

  async detectInstalled() {
    try {
      await execa('which', ['claude']);
      return true;
    } catch {
      return false;
    }
  },

  installHint() {
    return 'npm install -g @anthropic-ai/claude-code';
  },

  /** Spawn claude interactively with the DCP env; resolve with its exit code. */
  async launch(env, extraArgs = []) {
    const result = await execa('claude', extraArgs, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      reject: false,
    });
    return result.exitCode;
  },
};

export default claudeCode;
