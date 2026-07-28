/**
 * DC1 Notification Service
 * Sends alerts via webhooks (generic) and Telegram bot API.
 *
 * Config is stored in the `notification_config` table:
 *   - webhook_url: Generic webhook endpoint (POST JSON)
 *   - telegram_bot_token: Telegram bot token
 *   - telegram_chat_id: Telegram chat/group ID
 *   - enabled: 1 or 0
 *
 * Events: provider_crash, stuck_job, job_failed, withdrawal_pending, health_degraded
 */

const db = require('../db');

// ── Helpers ──────────────────────────────────────────────────────────────

function getConfig() {
  try {
    // Ensure table exists
    db.run(`CREATE TABLE IF NOT EXISTS notification_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      webhook_url TEXT,
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      enabled INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )`);
    let config = db.get('SELECT * FROM notification_config WHERE id = 1');
    if (!config) {
      db.run("INSERT INTO notification_config (id, enabled, created_at) VALUES (1, 0, ?)", new Date().toISOString());
      config = db.get('SELECT * FROM notification_config WHERE id = 1');
    }
    return config;
  } catch (e) {
    console.error('[notifications] Config error:', e.message);
    return null;
  }
}

// ── Send functions ───────────────────────────────────────────────────────

async function sendWebhook(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('[notifications] Webhook error:', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendTelegram(token, chatId, message) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return { ok: data.ok, result: data.result };
  } catch (e) {
    console.error('[notifications] Telegram error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Main alert function ──────────────────────────────────────────────────

async function sendAlert(event, details) {
  const config = getConfig();
  if (!config || !config.enabled) return { sent: false, reason: 'disabled' };

  const timestamp = new Date().toISOString();
  const results = { webhook: null, telegram: null };

  // Build message
  const emoji = {
    provider_crash: '💥', mining_detected: '🚨', stuck_job: '⏳', job_failed: '❌',
    withdrawal_pending: '💰', health_degraded: '⚠️', critical_error: '🚨',
  };
  const icon = emoji[event] || '🔔';
  const textMessage = `${icon} <b>DC1 Alert: ${event.replace(/_/g, ' ').toUpperCase()}</b>\n\n${details}\n\n<i>${timestamp}</i>`;

  // Webhook
  if (config.webhook_url) {
    results.webhook = await sendWebhook(config.webhook_url, {
      event, details, timestamp, source: 'dc1-platform',
    });
  }

  // Telegram
  if (config.telegram_bot_token && config.telegram_chat_id) {
    results.telegram = await sendTelegram(config.telegram_bot_token, config.telegram_chat_id, textMessage);
  }

  // Log to audit
  try {
    db.run('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)',
      'alert_sent', 'notification', 0, `Event: ${event} — Webhook: ${results.webhook?.ok ?? 'skip'}, Telegram: ${results.telegram?.ok ?? 'skip'}`, timestamp);
  } catch (e) { /* silent */ }

  return { sent: true, results };
}

// ── Export ────────────────────────────────────────────────────────────────

module.exports = { getConfig, sendAlert, sendWebhook, sendTelegram };
