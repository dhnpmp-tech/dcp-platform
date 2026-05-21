'use strict';

/**
 * Admin incident timeline — the "what changed in the last N hours" feed.
 *
 *   GET /api/admin/incidents/feed?hours=24&limit=150
 *
 * Unions three on-disk sources into a single time-ordered list so a
 * 1-person on-call can answer "what's burning right now + what
 * changed?" without SSHing into the VPS:
 *
 *   - admin_audit_log: who did what via the admin surface
 *   - daemon_events:   per-provider daemon telemetry (crashes,
 *                      restarts, supervisor bootstraps, watchdog events,
 *                      job admission rejections, etc.) — bandwidth_*
 *                      events are filtered as noise per the audit.
 *   - provider_status_log: provider online/offline/draining transitions
 *
 * Direct response to the 2026-05-21 admin monitoring audit, which
 * identified this as the single highest-value page to ship.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminRbac } = require('../middleware/adminAuth');

router.use(requireAdminRbac);

// Noisy daemon events that swamp the feed — filtered out by default.
// bandwidth_* alone account for ~9,900 of the 11,461 rows in prod.
const NOISY_DAEMON_EVENTS = new Set([
  'bandwidth_report',
  'bandwidth_test',
  'concurrency_probe_summary',
]);

router.get('/incidents/feed', (req, res) => {
  try {
    const hoursRaw = parseInt(req.query.hours, 10);
    const hours = Number.isFinite(hoursRaw)
      ? Math.min(Math.max(hoursRaw, 1), 720) // clamp 1h … 30d
      : 24;
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 10), 500)
      : 150;
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const sinceLooseFmt = since.replace('T', ' ').replace(/\.\d{3}Z$/, '');

    // ── 1. admin_audit_log ──
    let auditRows = [];
    try {
      auditRows = db.all(
        `SELECT id, action, target_type, target_id, details, timestamp,
                admin_user_id
           FROM admin_audit_log
          WHERE timestamp > ?
          ORDER BY timestamp DESC
          LIMIT ?`,
        since, limit
      );
    } catch (_) { auditRows = []; }

    // ── 2. daemon_events (skip the bandwidth noise) ──
    let daemonRows = [];
    try {
      const placeholders = Array.from(NOISY_DAEMON_EVENTS).map(() => '?').join(',');
      // received_at is stored as 'YYYY-MM-DD HH:MM:SS' (no T, no ms, no Z)
      // by the daemon — match the loose format here.
      daemonRows = db.all(
        `SELECT id, provider_id, event_type, severity, daemon_version,
                hostname, details, COALESCE(event_timestamp, received_at) AS ts
           FROM daemon_events
          WHERE received_at > ?
            AND event_type NOT IN (${placeholders})
          ORDER BY received_at DESC
          LIMIT ?`,
        sinceLooseFmt, ...NOISY_DAEMON_EVENTS, limit
      );
    } catch (_) { daemonRows = []; }

    // ── 3. provider_status_log ──
    let statusRows = [];
    try {
      statusRows = db.all(
        `SELECT id, provider_id, old_status, new_status, changed_at AS ts
           FROM provider_status_log
          WHERE changed_at > ?
          ORDER BY changed_at DESC
          LIMIT ?`,
        sinceLooseFmt, limit
      );
    } catch (_) { statusRows = []; }

    // Normalise into one timeline shape.
    const items = [];
    for (const r of auditRows) {
      items.push({
        source: 'audit',
        severity: 'info',
        timestamp: r.timestamp,
        title: r.action,
        actor: r.admin_user_id || 'system',
        target: r.target_type
          ? (r.target_id ? `${r.target_type}#${r.target_id}` : r.target_type)
          : null,
        provider_id: r.target_type === 'provider' ? r.target_id : null,
        details: r.details || null,
        ref_id: `audit:${r.id}`,
      });
    }
    for (const r of daemonRows) {
      items.push({
        source: 'daemon',
        severity: r.severity || 'info',
        timestamp: r.ts,
        title: r.event_type,
        actor: r.hostname ? `daemon@${r.hostname}` : 'daemon',
        target: r.daemon_version ? `v${r.daemon_version}` : null,
        provider_id: r.provider_id,
        details: r.details || null,
        ref_id: `daemon:${r.id}`,
      });
    }
    for (const r of statusRows) {
      items.push({
        source: 'status',
        severity: r.new_status === 'offline' ? 'warning' : 'info',
        timestamp: r.ts,
        title: `${r.old_status || '?'} → ${r.new_status || '?'}`,
        actor: 'system',
        target: `provider#${r.provider_id}`,
        provider_id: r.provider_id,
        details: null,
        ref_id: `status:${r.id}`,
      });
    }

    // Sort merged feed newest-first. Timestamps come in two formats
    // (ISO and loose), but Date.parse handles both for ordering purposes.
    items.sort((a, b) => {
      const ta = Date.parse(a.timestamp) || 0;
      const tb = Date.parse(b.timestamp) || 0;
      return tb - ta;
    });
    const trimmed = items.slice(0, limit);

    return res.json({
      generated_at: new Date().toISOString(),
      period_hours: hours,
      counts: {
        audit: auditRows.length,
        daemon: daemonRows.length,
        status: statusRows.length,
        merged: trimmed.length,
      },
      items: trimmed,
    });
  } catch (error) {
    console.error('admin-incidents feed error:', error);
    res.status(500).json({ error: 'Failed to assemble incidents feed' });
  }
});

module.exports = router;
