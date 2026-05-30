'use strict';

/**
 * Backlog gap #1 — providerOfflineNotifier unit tests.
 *
 * Covers the edge-trigger + dedup contract directly, mocking the three
 * collaborators (db / emailService / notifications) so we assert on WHEN a
 * notification fires rather than on transport. Pattern mirrors
 * providers-agent-liveness.test.js (jest.mock of ../db).
 *
 * Verified behaviors:
 *   1. First offline (last_offline_alert_at NULL) → email + alert fire, stamp set.
 *   2. Still-offline within 24h (alert recent) → NO new notification (deduped).
 *   3. Still-offline > 24h → re-alert fires.
 *   4. clearOfflineAlertState() nulls the stamp (so next offline re-alerts).
 *   5. Email-send failure never throws out of notifyProviderOffline.
 */

const Database = require('better-sqlite3');

// ── In-memory DB mock (same shape as the dc1 wrapper) ──────────────────────
jest.mock('../src/db', () => {
  function fp(p) {
    if (p.length === 1 && Array.isArray(p[0])) return p[0];
    return p.reduce((a, x) => (Array.isArray(x) ? a.concat(x) : a.concat([x])), []);
  }
  return {
    get get()     { return (sql, ...p) => global.__notifDb.prepare(sql).get(...fp(p)); },
    get all()     { return (sql, ...p) => global.__notifDb.prepare(sql).all(...fp(p)); },
    get run()     { return (sql, ...p) => global.__notifDb.prepare(sql).run(...fp(p)); },
    get prepare() { return (sql) => global.__notifDb.prepare(sql); },
    get _db()     { return global.__notifDb; },
  };
});

// ── Collaborator mocks ─────────────────────────────────────────────────────
jest.mock('../src/services/emailService', () => ({
  sendProviderOfflineEmail: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../src/services/notifications', () => ({
  sendAlert: jest.fn(async () => ({ sent: true })),
}));

const emailService = require('../src/services/emailService');
const { sendAlert } = require('../src/services/notifications');

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      last_heartbeat TEXT,
      last_offline_alert_at TEXT
    );
  `);
  return db;
}

global.__notifDb = buildDb();

const {
  notifyProviderOffline,
  clearOfflineAlertState,
  shouldAlertOffline,
  RE_ALERT_INTERVAL_MS,
} = require('../src/services/providerOfflineNotifier');

const ISO = (d) => new Date(d).toISOString();

beforeEach(() => {
  global.__notifDb.prepare('DELETE FROM providers').run();
  global.__notifDb
    .prepare('INSERT INTO providers (id, name, email, last_heartbeat, last_offline_alert_at) VALUES (?,?,?,?,?)')
    .run(1, 'Node-2', 'prov@dc1.test', ISO(Date.now() - 200000), null);
  emailService.sendProviderOfflineEmail.mockClear();
  sendAlert.mockClear();
});

// Let the fire-and-forget delivery() microtasks settle.
const flush = () => new Promise((r) => setImmediate(r));

describe('shouldAlertOffline (pure gate)', () => {
  test('true when never alerted', () => {
    expect(shouldAlertOffline(null)).toBe(true);
  });
  test('false when alerted within the re-alert interval', () => {
    const recent = ISO(Date.now() - 60 * 1000);
    expect(shouldAlertOffline(recent)).toBe(false);
  });
  test('true when last alert is older than the re-alert interval', () => {
    const old = ISO(Date.now() - RE_ALERT_INTERVAL_MS - 60 * 1000);
    expect(shouldAlertOffline(old)).toBe(true);
  });
  test('true on a corrupt timestamp (fails safe)', () => {
    expect(shouldAlertOffline('not-a-date')).toBe(true);
  });
});

describe('notifyProviderOffline edge-trigger + dedup', () => {
  test('first offline fires email + alert and stamps dedup column', async () => {
    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();
    const queued = notifyProviderOffline(provider, {
      source: 'liveness_monitor',
      lastOfflineAlertAt: provider.last_offline_alert_at,
    });
    await flush();

    expect(queued).toBe(true);
    expect(emailService.sendProviderOfflineEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendProviderOfflineEmail).toHaveBeenCalledWith(
      'prov@dc1.test',
      expect.objectContaining({ provider_name: 'Node-2' })
    );
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith('provider_crash', expect.stringContaining('Provider #1'));

    const row = global.__notifDb.prepare('SELECT last_offline_alert_at FROM providers WHERE id = 1').get();
    expect(row.last_offline_alert_at).toBeTruthy();
  });

  test('still-offline within 24h does NOT re-notify (deduped, survives restart)', async () => {
    // Simulate a recent alert already persisted (as if from a prior process).
    const recent = ISO(Date.now() - 60 * 1000);
    global.__notifDb.prepare('UPDATE providers SET last_offline_alert_at = ? WHERE id = 1').run(recent);

    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();
    const queued = notifyProviderOffline(provider, {
      source: 'provider_health_worker',
      lastOfflineAlertAt: provider.last_offline_alert_at,
    });
    await flush();

    expect(queued).toBe(false);
    expect(emailService.sendProviderOfflineEmail).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  test('still-offline beyond 24h re-alerts', async () => {
    const old = ISO(Date.now() - RE_ALERT_INTERVAL_MS - 60 * 1000);
    global.__notifDb.prepare('UPDATE providers SET last_offline_alert_at = ? WHERE id = 1').run(old);

    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();
    const queued = notifyProviderOffline(provider, { source: 'liveness_monitor', lastOfflineAlertAt: old });
    await flush();

    expect(queued).toBe(true);
    expect(emailService.sendProviderOfflineEmail).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith('provider_crash', expect.stringContaining('re-alert'));
  });

  test('clearOfflineAlertState nulls the stamp so next offline re-alerts', async () => {
    global.__notifDb.prepare('UPDATE providers SET last_offline_alert_at = ? WHERE id = 1').run(ISO(Date.now()));
    clearOfflineAlertState(1);

    const row = global.__notifDb.prepare('SELECT last_offline_alert_at FROM providers WHERE id = 1').get();
    expect(row.last_offline_alert_at).toBeNull();

    // After clearing, a fresh offline transition notifies again.
    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();
    const queued = notifyProviderOffline(provider, { source: 'liveness_monitor', lastOfflineAlertAt: null });
    await flush();
    expect(queued).toBe(true);
    expect(emailService.sendProviderOfflineEmail).toHaveBeenCalledTimes(1);
  });

  test('email failure never throws out of notify (sweep-safe)', async () => {
    emailService.sendProviderOfflineEmail.mockRejectedValueOnce(new Error('resend down'));
    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();

    expect(() =>
      notifyProviderOffline(provider, { source: 'liveness_monitor', lastOfflineAlertAt: null })
    ).not.toThrow();
    await flush();

    // Dedup still stamped even though the email failed — we don't retry-spam.
    const row = global.__notifDb.prepare('SELECT last_offline_alert_at FROM providers WHERE id = 1').get();
    expect(row.last_offline_alert_at).toBeTruthy();
  });

  test('missing email skips the email but still raises the platform alert', async () => {
    global.__notifDb.prepare('UPDATE providers SET email = NULL WHERE id = 1').run();
    const provider = global.__notifDb.prepare('SELECT * FROM providers WHERE id = 1').get();

    const queued = notifyProviderOffline(provider, { source: 'liveness_monitor', lastOfflineAlertAt: null });
    await flush();

    expect(queued).toBe(true);
    expect(emailService.sendProviderOfflineEmail).not.toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });
});
