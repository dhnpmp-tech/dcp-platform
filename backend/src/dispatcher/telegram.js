'use strict';

// Write-only Telegram bridge for the mission dispatcher. This module can
// ONLY send messages — it never polls for incoming updates, never reads chat
// content, and is not a command channel (AGENT_PROTOCOL.md rule 7).

const MAX_LEN = 4000;

const NOOP_NOTIFIER = {
  sendTeam:  async () => ({ ok: false, disabled: true }),
  sendAlert: async () => ({ ok: false, disabled: true }),
};

/**
 * Create a write-only Telegram notifier for the mission dispatcher.
 *
 * If token or chatId are absent, returns a safe no-op notifier and logs once.
 * Errors from the Telegram API (non-2xx or network failure) are swallowed and
 * returned as {ok:false} — the dispatcher must never crash due to a notification
 * failure.
 *
 * @param {object}   opts
 * @param {string}   opts.token           — Bot API token (DCP_TG_BOT_TOKEN)
 * @param {string}   opts.chatId          — Supergroup chat id (DCP_TG_CHAT_ID)
 * @param {number}   [opts.topicTeam=7]   — message_thread_id for team topic
 * @param {number}   [opts.topicAlerts=4] — message_thread_id for alerts topic
 * @param {Function} [opts.fetchImpl]     — injectable fetch (default: global fetch)
 * @param {Function} [opts.log]           — injectable logger (default: console.log)
 * @returns {{ sendTeam(text: string): Promise<{ok:boolean}>, sendAlert(text: string): Promise<{ok:boolean}> }}
 */
function createTelegramNotifier({
  token,
  chatId,
  topicTeam   = 7,
  topicAlerts = 4,
  fetchImpl   = fetch,
  log         = console.log,
} = {}) {
  if (!token || !chatId) {
    log('[telegram] DCP_TG_BOT_TOKEN or DCP_TG_CHAT_ID not configured — notifications disabled');
    return NOOP_NOTIFIER;
  }

  const baseUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  async function send(threadId, text) {
    const payload = typeof text === 'string' && text.length > MAX_LEN
      ? text.slice(0, MAX_LEN - 1) + '…'
      : String(text || '');

    try {
      const res = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: threadId,
          text: payload,
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        const snippet = (await res.text()).slice(0, 200);
        log(`[telegram] sendMessage failed (HTTP ${res.status}): ${snippet}`);
        return { ok: false };
      }

      return { ok: true };
    } catch (err) {
      log(`[telegram] sendMessage error: ${err && err.message}`);
      return { ok: false };
    }
  }

  return {
    sendTeam:  (text) => send(topicTeam, text),
    sendAlert: (text) => send(topicAlerts, text),
  };
}

module.exports = { createTelegramNotifier };
