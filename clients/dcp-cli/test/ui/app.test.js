import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import App from '../../src/ui/App.js';

const h = React.createElement;

const ARROW_UP = '\u001B[A';
const ARROW_DOWN = '\u001B[B';
const ARROW_RIGHT = '\u001B[C';
const ARROW_LEFT = '\u001B[D';
const ENTER = '\r';

const MODELS = [
  {
    id: 'qwen3-30b-a3b',
    label: 'Qwen3 30B A3B',
    vram_gb: 24,
    price_in_halala_per_1m: 150,
    price_out_halala_per_1m: 400,
    status: 'available',
  },
  {
    id: 'deepseek-coder-lite',
    label: 'DeepSeek Coder Lite',
    vram_gb: 16,
    price_in_halala_per_1m: 120,
    price_out_halala_per_1m: 300,
    status: 'busy',
  },
  {
    id: 'llama-8b',
    label: 'Llama 8B',
    vram_gb: 12,
    price_in_halala_per_1m: 90,
    price_out_halala_per_1m: 200,
    status: 'available',
  },
];

const makeApi = (overrides = {}) => ({
  getCodingModels: vi.fn().mockResolvedValue(MODELS),
  getBalance: vi
    .fn()
    .mockResolvedValue({ id: 'r_1', email: 'dev@dcp.sa', balance_halala: 17621 }),
  ...overrides,
});

/**
 * Let pending promises resolve AND React effects flush. Ink re-subscribes
 * useInput handlers in a passive effect (flushed on setImmediate), so a
 * plain setTimeout(0) can leave a keypress hitting a stale closure.
 */
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
};

async function renderApp({ config = { token: 'dcp_key' }, api = makeApi() } = {}) {
  const onLaunch = vi.fn();
  const instance = render(h(App, { api, config, onLaunch }));
  await tick();
  return { ...instance, onLaunch, api };
}

async function press(stdin, ...keys) {
  for (const key of keys) {
    stdin.write(key);
    await tick();
  }
}

describe('App — rendering', () => {
  it('shows a loading line while models fetch', () => {
    const api = makeApi({ getCodingModels: vi.fn(() => new Promise(() => {})) });
    const { lastFrame } = render(
      h(App, { api, config: { token: 'dcp_key' }, onLaunch: vi.fn() })
    );
    expect(lastFrame()).toContain('Loading');
  });

  it('renders every model with vram, SAR prices per 1M, and a status dot', async () => {
    const { lastFrame } = await renderApp();
    const frame = lastFrame();
    expect(frame).toContain('Qwen3 30B A3B');
    expect(frame).toContain('24GB');
    expect(frame).toContain('in 1.50/M out 4.00/M SAR');
    expect(frame).toContain('● available');
    expect(frame).toContain('DeepSeek Coder Lite');
    expect(frame).toContain('○ busy');
  });

  it('renders the balance in SAR', async () => {
    const { lastFrame } = await renderApp();
    expect(lastFrame()).toContain('Balance: 176.21 SAR');
  });

  it('renders the agent row with coming-soon agents greyed as "(soon)"', async () => {
    const { lastFrame } = await renderApp();
    const frame = lastFrame();
    expect(frame).toContain('Claude Code');
    expect(frame).toContain('Codex (soon)');
    expect(frame).toContain('Cursor (soon)');
  });

  it('shows a one-line friendly error when the API fails', async () => {
    const api = makeApi({
      getCodingModels: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });
    const { lastFrame } = await renderApp({ api });
    const frame = lastFrame();
    expect(frame).toContain('fetch failed');
    expect(frame).not.toContain('at '); // no stack trace
  });
});

describe('App — selection', () => {
  it('preselects the first available model by default', async () => {
    const { lastFrame } = await renderApp();
    expect(lastFrame()).toContain('▸ Qwen3 30B A3B');
  });

  it('preselects config.lastModel when present', async () => {
    const { lastFrame } = await renderApp({
      config: { token: 'dcp_key', lastModel: 'llama-8b' },
    });
    expect(lastFrame()).toContain('▸ Llama 8B');
  });

  it('falls back to the first available model when lastModel is gone', async () => {
    const { lastFrame } = await renderApp({
      config: { token: 'dcp_key', lastModel: 'retired-model' },
    });
    expect(lastFrame()).toContain('▸ Qwen3 30B A3B');
  });

  it('down/up arrows move the model selection', async () => {
    const { stdin, lastFrame } = await renderApp();

    await press(stdin, ARROW_DOWN);
    expect(lastFrame()).toContain('▸ DeepSeek Coder Lite');

    await press(stdin, ARROW_UP);
    expect(lastFrame()).toContain('▸ Qwen3 30B A3B');
  });

  it('clamps model selection at the ends of the list', async () => {
    const { stdin, lastFrame } = await renderApp();

    await press(stdin, ARROW_UP);
    expect(lastFrame()).toContain('▸ Qwen3 30B A3B');

    await press(stdin, ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ARROW_DOWN);
    expect(lastFrame()).toContain('▸ Llama 8B');
  });

  it('left/right skip coming-soon agents (claude stays selected)', async () => {
    const { stdin, lastFrame, onLaunch } = await renderApp();

    await press(stdin, ARROW_RIGHT);
    expect(lastFrame()).toContain('● Claude Code');

    await press(stdin, ARROW_LEFT, ENTER);
    expect(onLaunch).toHaveBeenCalledWith({ agent: 'claude', modelId: 'qwen3-30b-a3b' });
  });
});

describe('App — launch', () => {
  it('Enter on an available model calls onLaunch({agent, modelId})', async () => {
    const { stdin, onLaunch } = await renderApp();

    await press(stdin, ENTER);

    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch).toHaveBeenCalledWith({ agent: 'claude', modelId: 'qwen3-30b-a3b' });
  });

  it('Enter on a busy model is a no-op with a hint line', async () => {
    const { stdin, lastFrame, onLaunch } = await renderApp();

    await press(stdin, ARROW_DOWN, ENTER);

    expect(onLaunch).not.toHaveBeenCalled();
    expect(lastFrame()).toMatch(/busy/i);
    expect(lastFrame()).toContain('▸ DeepSeek Coder Lite');
  });

  it('q quits without launching (later keys are ignored)', async () => {
    const { stdin, onLaunch } = await renderApp();

    await press(stdin, 'q', ENTER);

    expect(onLaunch).not.toHaveBeenCalled();
  });
});
