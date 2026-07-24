// mission-agent-lib.js — pure parser for mission-agent CLI.
// Exported as a module so Jest can require it without triggering main().
'use strict';

/**
 * Parse process.argv slice (everything after the node binary + script path).
 *
 * Returns one of:
 *   { cmd: 'poll' }
 *   { cmd: 'claim',   taskId, flags: { ttl? } }
 *   { cmd: 'comment', taskId, text }
 *   { cmd: 'renew',   taskId, flags: { ttl? } }
 *   { cmd: 'release', taskId, flags: { reason } }
 *   { cmd: 'review',  taskId, flags: { pr? } }
 *   { cmd: 'block',   taskId, flags: { reason } }
 *   { cmd: 'resume',  taskId }
 *   { cmd: 'heartbeat', flags: { state? } }
 *   { cmd: 'digest' }
 *   { cmd: 'protocol' }
 *   { cmd: 'help' }
 *   { cmd: 'help', error: '<message>' }   ← when required args are missing
 *
 * @param {string[]} argv
 * @returns {{ cmd: string, taskId?: string, text?: string, flags?: object, error?: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(); // don't mutate caller's array
  const cmd = args.shift();

  if (!cmd) return { cmd: 'help' };

  // Commands that need no task-id
  if (cmd === 'poll')     return { cmd: 'poll' };
  if (cmd === 'digest')   return { cmd: 'digest' };
  if (cmd === 'protocol') return { cmd: 'protocol' };
  if (cmd === 'help')     return { cmd: 'help' };

  if (cmd === 'heartbeat') {
    const flags = {};
    const stateIdx = args.indexOf('--state');
    if (stateIdx !== -1) {
      const words = args.slice(stateIdx + 1);
      flags.state = words.join(' ') || undefined;
    }
    return { cmd: 'heartbeat', flags };
  }

  // Validate known commands before consuming the task-id
  const TASK_CMDS = ['claim', 'comment', 'renew', 'release', 'review', 'block', 'resume'];
  if (!TASK_CMDS.includes(cmd)) {
    return { cmd: 'help', error: `unknown command: ${cmd}` };
  }

  // All remaining commands require a task-id as the first positional arg
  const taskId = args.shift();
  if (!taskId) {
    return { cmd: 'help', error: `${cmd}: task-id required` };
  }

  if (cmd === 'claim') {
    const flags = {};
    const ttlIdx = args.indexOf('--ttl');
    if (ttlIdx !== -1) flags.ttl = Number(args[ttlIdx + 1]) || undefined;
    return { cmd: 'claim', taskId, flags };
  }

  if (cmd === 'renew') {
    const flags = {};
    const ttlIdx = args.indexOf('--ttl');
    if (ttlIdx !== -1) flags.ttl = Number(args[ttlIdx + 1]) || undefined;
    return { cmd: 'renew', taskId, flags };
  }

  if (cmd === 'comment') {
    const text = args.join(' ');
    if (!text) return { cmd: 'help', error: `comment: text required` };
    return { cmd: 'comment', taskId, text };
  }

  if (cmd === 'release') {
    const reasonIdx = args.indexOf('--reason');
    if (reasonIdx === -1 || !args[reasonIdx + 1]) {
      return { cmd: 'help', error: `release: --reason <text> required` };
    }
    const reason = args.slice(reasonIdx + 1).join(' ');
    return { cmd: 'release', taskId, flags: { reason } };
  }

  if (cmd === 'review') {
    const flags = {};
    const prIdx = args.indexOf('--pr');
    if (prIdx !== -1) flags.pr = args[prIdx + 1] || undefined;
    return { cmd: 'review', taskId, flags };
  }

  if (cmd === 'block') {
    const reasonIdx = args.indexOf('--reason');
    if (reasonIdx === -1 || !args[reasonIdx + 1]) {
      return { cmd: 'help', error: `block: --reason <text> required` };
    }
    const reason = args.slice(reasonIdx + 1).join(' ');
    return { cmd: 'block', taskId, flags: { reason } };
  }

  if (cmd === 'resume') {
    return { cmd: 'resume', taskId };
  }

  // Should never reach here — TASK_CMDS guard above catches all unknowns
  /* c8 ignore next */
  return { cmd: 'help', error: `unknown command: ${cmd}` };
}

module.exports = { parseArgs };
