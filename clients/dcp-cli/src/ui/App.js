import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { resolveBaseUrl } from '../config.js';
import { adapters } from '../adapters/index.js';
import { formatSAR } from '../format.js';
import AgentPicker from './AgentPicker.js';
import ModelPicker from './ModelPicker.js';

const h = React.createElement;

const BUSY_HINT = 'That model is busy — pick a green ● available one.';

/** The agent registry flattened for the picker row. */
export const defaultAgents = Object.entries(adapters).map(([id, adapter]) => ({
  id,
  label: adapter.label,
  comingSoon: Boolean(adapter.comingSoon),
}));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Preselect config.lastAgent when it is selectable, else the first live agent. */
function initialAgentIndex(agents, config) {
  const last = agents.findIndex((a) => a.id === config.lastAgent && !a.comingSoon);
  if (last !== -1) return last;
  const first = agents.findIndex((a) => !a.comingSoon);
  return first === -1 ? 0 : first;
}

/** Preselect config.lastModel when still listed, else the first available model. */
function initialModelIndex(models, config) {
  const last = models.findIndex((m) => m.id === config.lastModel);
  if (last !== -1) return last;
  const firstAvailable = models.findIndex((m) => m.status === 'available');
  return firstAvailable === -1 ? 0 : firstAvailable;
}

/** Cycle left/right through selectable agents only (coming-soon are skipped). */
function cycleAgent(agents, current, step) {
  const selectable = agents
    .map((agent, index) => (agent.comingSoon ? null : index))
    .filter((index) => index !== null);
  if (selectable.length === 0) return current;
  const position = Math.max(selectable.indexOf(current), 0);
  const next = (position + step + selectable.length) % selectable.length;
  return selectable[next];
}

/**
 * Interactive launcher: pick an agent (←/→) and a model (↑/↓), Enter to launch.
 * Dependencies are injected so tests run with no network and no exec:
 *   api      — {getCodingModels(baseUrl), getBalance(baseUrl, token)}
 *   config   — {token, baseUrl?, lastAgent?, lastModel?}
 *   onLaunch — called with {agent, modelId} right before the app exits
 *
 * The input handler reads/writes `viewRef` (updated synchronously, stable
 * across renders) so rapid keypresses stay correct even when they land
 * before ink re-subscribes the handler after a render; `view` state exists
 * only to drive rendering.
 */
export default function App({ api, config, onLaunch, agents = defaultAgents }) {
  const { exit } = useApp();
  const [view, setView] = useState(() => ({
    phase: 'loading',
    error: null,
    models: [],
    balance: 0,
    agentIndex: initialAgentIndex(agents, config),
    modelIndex: 0,
    hint: null,
  }));
  const viewRef = useRef(view);
  const launchedRef = useRef(false);

  const update = (patch) => {
    viewRef.current = { ...viewRef.current, ...patch };
    setView(viewRef.current);
  };

  useEffect(() => {
    let cancelled = false;
    const baseUrl = resolveBaseUrl(config);
    Promise.all([api.getCodingModels(baseUrl), api.getBalance(baseUrl, config.token)])
      .then(([models, me]) => {
        if (cancelled) return;
        update({
          phase: 'ready',
          models,
          balance: me.balance_halala,
          modelIndex: initialModelIndex(models, config),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        update({ phase: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    const current = viewRef.current;
    if (current.phase !== 'ready') return;
    if (key.leftArrow || key.rightArrow) {
      update({
        hint: null,
        agentIndex: cycleAgent(agents, current.agentIndex, key.rightArrow ? 1 : -1),
      });
      return;
    }
    if (key.upArrow || key.downArrow) {
      update({
        hint: null,
        modelIndex: clamp(
          current.modelIndex + (key.downArrow ? 1 : -1),
          0,
          current.models.length - 1
        ),
      });
      return;
    }
    if (key.return) {
      const model = current.models[current.modelIndex];
      if (!model || launchedRef.current) return;
      if (model.status !== 'available') {
        update({ hint: BUSY_HINT });
        return;
      }
      launchedRef.current = true;
      onLaunch({ agent: agents[current.agentIndex].id, modelId: model.id });
      exit();
    }
  });

  const { phase, error, models, balance, agentIndex, modelIndex, hint } = view;
  const selectedModel = models[modelIndex];
  const launchable = phase === 'ready' && selectedModel?.status === 'available';

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
      h(Text, { bold: true, color: 'cyan' }, 'DCP · Launch a coding agent'),
      phase === 'loading' && h(Text, { dimColor: true }, 'Loading models…'),
      phase === 'error' && h(Text, { color: 'red' }, `Could not reach DCP: ${error} (q to quit)`),
      phase === 'ready' && h(AgentPicker, { agents, selectedIndex: agentIndex }),
      phase === 'ready' && h(ModelPicker, { models, selectedIndex: modelIndex }),
      phase === 'ready' &&
        h(
          Box,
          { justifyContent: 'space-between' },
          h(Text, null, `Balance: ${formatSAR(balance)}`),
          h(
            Text,
            launchable ? { bold: true, color: 'green' } : { dimColor: true },
            '[ Launch ▶ ]'
          )
        ),
      hint && h(Text, { color: 'yellow' }, hint)
    ),
    h(Text, { dimColor: true }, '  ←/→ agent · ↑/↓ model · Enter launch · q quit')
  );
}
