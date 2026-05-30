'use strict';

/**
 * providerOfflineNotifier.js — backlog gap #1
 *
 * Edge-triggered, deduped notification path for the provider online→offline
 * transition. Shared by both offline detectors:
 *   - services/providerLivenessMonitor.js (~90s heartbeat-staleness)
 *   - workers/providerHealthWorker.js     (~3 missed 5-min health checks)
 *
 * Root cause it closes: when a provider's node went dark ("Node-2 stayed dark
 * for days") the platform detected it, requeued the jobs, and then told NOBODY.
 * The provider silently stopped earning with no signal to act on.
 *
 * Design contract (all ADDITIVE — never touches offline-marking / requeue):
 *   1. Fire ONLY on the transition cycle (the call where a provider that was
 *      not already alerted goes offline). Callers pass the row they just
 *      flipped to 'offline'; the dedup gate below decides whether to notify.
 *   2. Dedup state lives in the DB (providers.last_offline_alert_at) so it
 *      survives process restarts — a worker restart must NOT re-spam providers.
 *   3. Conservative re-alert: if a provider is STILL offline after
 *      RE_ALERT_INTERVAL_MS (24h) we send one reminder, then re-stamp.
 *   4. clearOfflineAlertState() is called when a provider comes back online so
 *      the NEXT genuine offline transition re-alerts.
 *   5. Sending is best-effort: a failed email / alert must NEVER break the
 *      sweep. Everything here is wrapped so callers can fire-and-forget.
 */

const db = require('../db');
const emailService = require('./emailService');
const { sendAlert } = require('./notifications');

// Re-alert at most once per 24h while a provider stays continuously offline.
const RE_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Decide — synchronously, against persisted state — whether this offline event
 * should notify. Returns true on the first offline (last_offline_alert_at NULL)
 * or when the last alert is older than RE_ALERT_INTERVAL_MS. Does NOT mutate.
 */
function shouldAlertOffline(lastOfflineAlertAt, now = new Date()) {
  if (!lastOfflineAlertAt) return true;
  const last = new Date(lastOfflineAlertAt).getTime();
  if (!Number.isFinite(last)) return true; // corrupt value — treat as never-alerted
  return now.getTime() - last >= RE_ALERT_INTERVAL_MS;
}

/**
 * Stamp the dedup column so we don't re-notify on the next cycle. Best-effort:
 * if the column is missing on an old DB we swallow the error (the notification
 * still went out; we just lose persistence-backed dedup for this row).
 */
function stampOfflineAlert(providerId, nowIso) {
  try {
    db.prepare(`UPDATE providers SET last_offline_alert_at = ? WHERE id = ?`)
      .run(nowIso, providerId);
    return true;
  } catch (err) {
    console.error(`[offlineNotifier] could not stamp last_offline_alert_at for provider #${providerId}: ${err.message}`);
    return false;
  }
}

/**
 * Clear dedup state when a provider comes back online, so the next genuine
 * offline transition re-alerts. Best-effort + idempotent.
 */
function clearOfflineAlertState(providerId) {
  try {
    db.prepare(`UPDATE providers SET last_offline_alert_at = NULL WHERE id = ?`)
      .run(providerId);
  } catch (err) {
    console.error(`[offlineNotifier] could not clear last_offline_alert_at for provider #${providerId}: ${err.message}`);
  }
}

/**
 * Async best-effort delivery: provider email + platform-side alert. Never
 * throws — the caller fire-and-forgets this.
 */
async function deliver({ providerId, name, email, lastSeen, source, reAlert }) {
  // 1. Provider-facing email (only if we have an address).
  if (email) {
    try {
      const res = await emailService.sendProviderOfflineEmail(email, {
        provider_name: name,
        last_seen: lastSeen,
      });
      if (!res || res.ok === false) {
        console.warn(
          `[offlineNotifier] provider #${providerId} offline email not sent (${res && res.reason ? res.reason : 'unknown'})`
        );
      }
    } catch (err) {
      console.error(`[offlineNotifier] provider #${providerId} offline email threw: ${err.message}`);
    }
  } else {
    console.warn(`[offlineNotifier] provider #${providerId} has no email on file — skipping offline email`);
  }

  // 2. Platform-side alert (Telegram / webhook). Reuses 'provider_crash' event.
  try {
    const lastSeenLabel = lastSeen
      ? `last heartbeat ${lastSeen}`
      : 'no heartbeat ever recorded';
    const details =
      `Provider #${providerId} (${name || 'unnamed'}) went OFFLINE — ${lastSeenLabel}. ` +
      `Detected by ${source}. Their in-progress jobs were requeued and the provider was emailed.` +
      (reAlert ? ' (re-alert: still offline after 24h)' : '');
    await sendAlert('provider_crash', details);
  } catch (err) {
    console.error(`[offlineNotifier] sendAlert threw for provider #${providerId}: ${err.message}`);
  }
}

/**
 * notifyProviderOffline — the single entry point both detectors call right
 * after they mark a provider offline.
 *
 * Synchronously evaluates + stamps dedup state (so concurrent sweeps don't
 * double-fire and restarts don't re-spam), then kicks off async delivery
 * WITHOUT awaiting — returns a boolean for whether a notification was queued.
 *
 * @param {object} provider  { id, name, email?, last_heartbeat? }
 * @param {object} opts      { source: string, lastOfflineAlertAt?: string }
 * @returns {boolean} true if a notification was queued this call
 */
function notifyProviderOffline(provider, opts = {}) {
  if (!provider || provider.id == null) return false;

  const now = new Date();
  const nowIso = now.toISOString();
  const source = opts.source || 'offline_detector';

  // The dedup value can be passed in (callers that already SELECT it) or read
  // here. Reading lazily keeps both detectors simple.
  let lastOfflineAlertAt = opts.lastOfflineAlertAt;
  if (lastOfflineAlertAt === undefined) {
    try {
      const row = db.get('SELECT last_offline_alert_at FROM providers WHERE id = ?', provider.id);
      lastOfflineAlertAt = row ? row.last_offline_alert_at : null;
    } catch (_) {
      lastOfflineAlertAt = null; // column missing on old DB — alert once
    }
  }

  if (!shouldAlertOffline(lastOfflineAlertAt, now)) return false;

  const reAlert = Boolean(lastOfflineAlertAt);

  // Stamp FIRST so a crash mid-send doesn't cause a duplicate next cycle.
  stampOfflineAlert(provider.id, nowIso);

  // Resolve email lazily if the caller didn't provide it.
  let email = provider.email;
  if (email === undefined) {
    try {
      const row = db.get('SELECT email FROM providers WHERE id = ?', provider.id);
      email = row ? row.email : null;
    } catch (_) {
      email = null;
    }
  }

  // Fire-and-forget — sweeps stay synchronous; failures are logged, not thrown.
  deliver({
    providerId: provider.id,
    name: provider.name,
    email,
    lastSeen: provider.last_heartbeat || null,
    source,
    reAlert,
  }).catch((err) => {
    console.error(`[offlineNotifier] delivery rejected for provider #${provider.id}: ${err.message}`);
  });

  return true;
}

module.exports = {
  notifyProviderOffline,
  clearOfflineAlertState,
  shouldAlertOffline,
  stampOfflineAlert,
  RE_ALERT_INTERVAL_MS,
};
