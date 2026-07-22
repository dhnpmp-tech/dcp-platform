const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth } = require('../middleware/auth');

// SECURITY: recovery GETs expose provider health/ops state; POST resolve is
// state-changing. No daemon/frontend consumer - gate the whole router.
router.use(requireAdminAuth);

// ============================================================================
// Recovery Orchestrator State Machine
// Handles: WARNING → RECONNECT → FAILOVER → CRITICAL escalation
// Also: DEGRADED for sustained high-latency connections
// ============================================================================

// In-memory state tracking per provider
const providerStates = new Map();

// Constants
const WARNING_THRESHOLD_S = 30;
const RECONNECT_THRESHOLD_S = 90;
const BACKOFF_SCHEDULE = [5000, 15000, 30000, 60000]; // ms
const MAX_RECONNECT_ATTEMPTS = 4;
const LATENCY_THRESHOLD_MS = 500;
const LATENCY_SUSTAINED_S = 60;

/**
 * Get or initialize provider recovery state
 */
function getProviderState(providerId) {
  if (!providerStates.has(providerId)) {
    providerStates.set(providerId, {
      status: 'ONLINE',
      reconnectAttempts: 0,
      lastReconnectAt: null,
      highLatencySince: null,
    });
  }
  return providerStates.get(providerId);
}

/**
 * Log a recovery event to the database
 */
function logEvent(providerId, eventType, details) {
  const result = db.run(
    `INSERT INTO recovery_events (provider_id, event_type, timestamp, details)
     VALUES (?, ?, ?, ?)`,
    providerId, eventType, new Date().toISOString(), details || null
  );
  return result.lastInsertRowid;
}

/**
 * Send Telegram alert for CRITICAL events
 */
function sendCriticalAlert(providerId, details) {
  // Placeholder: in production, integrate with Telegram bot API
  console.error(`[CRITICAL ALERT] Provider ${providerId}: ${details}`);
}

/**
 * Find a backup provider that is online and not the given provider
 */
function findBackupProvider(excludeProviderId) {
  return db.get(
    `SELECT id FROM providers WHERE id != ? AND status = 'online' ORDER BY last_heartbeat DESC LIMIT 1`,
    excludeProviderId
  );
}

/**
 * Process heartbeat gap for a provider — core state machine
 * @param {number} providerId
 * @param {number} gapSeconds - seconds since last heartbeat
 * @returns {object} state transition result
 */
function processHeartbeatGap(providerId, gapSeconds) {
  const state = getProviderState(providerId);

  if (gapSeconds <= WARNING_THRESHOLD_S) {
    // All good — reset state
    if (state.status !== 'ONLINE') {
      state.status = 'ONLINE';
      state.reconnectAttempts = 0;
      state.lastReconnectAt = null;
    }
    return { status: 'ONLINE', action: 'none' };
  }

  if (gapSeconds > WARNING_THRESHOLD_S && gapSeconds <= RECONNECT_THRESHOLD_S) {
    if (state.status !== 'WARNING') {
      state.status = 'WARNING';
      const eventId = logEvent(providerId, 'WARNING', `Heartbeat gap: ${gapSeconds}s`);
      return { status: 'WARNING', action: 'logged', eventId };
    }
    return { status: 'WARNING', action: 'already_warned' };
  }

  // Gap > 90s — reconnect / failover / critical
  if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    state.status = 'RECONNECT';
    state.reconnectAttempts++;
    state.lastReconnectAt = Date.now();
    const backoffMs = BACKOFF_SCHEDULE[state.reconnectAttempts - 1];
    const eventId = logEvent(providerId, 'RECONNECT',
      `Attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, backoff ${backoffMs}ms`);
    return { status: 'RECONNECT', attempt: state.reconnectAttempts, backoffMs, eventId };
  }

  // All reconnect attempts exhausted — try failover
  const backup = findBackupProvider(providerId);
  if (backup) {
    state.status = 'FAILOVER';
    state.reconnectAttempts = 0;
    const eventId = logEvent(providerId, 'FAILOVER', `Failed over to provider ${backup.id}`);
    return { status: 'FAILOVER', backupProviderId: backup.id, eventId };
  }

  // No backup available — CRITICAL
  state.status = 'CRITICAL';
  const details = `No backup provider available after ${MAX_RECONNECT_ATTEMPTS} reconnect failures`;
  const eventId = logEvent(providerId, 'CRITICAL', details);
  sendCriticalAlert(providerId, details);
  return { status: 'CRITICAL', eventId };
}

/**
 * Process latency check — DEGRADED state
 */
function processLatency(providerId, latencyMs, timestamp) {
  const state = getProviderState(providerId);
  const now = timestamp || Date.now();

  if (latencyMs > LATENCY_THRESHOLD_MS) {
    if (!state.highLatencySince) {
      state.highLatencySince = now;
    }
    const sustained = (now - state.highLatencySince) / 1000;
    if (sustained >= LATENCY_SUSTAINED_S && state.status !== 'DEGRADED') {
      state.status = 'DEGRADED';
      const eventId = logEvent(providerId, 'DEGRADED',
        `Latency ${latencyMs}ms sustained for ${Math.round(sustained)}s`);
      return { status: 'DEGRADED', eventId };
    }
    return { status: state.status, action: 'monitoring_latency' };
  }

  // Latency recovered
  state.highLatencySince = null;
  if (state.status === 'DEGRADED') {
    state.status = 'ONLINE';
  }
  return { status: state.status, action: 'latency_ok' };
}

// ============================================================================
// REST Endpoints
// ============================================================================

// GET /api/recovery/events — list recent recovery events (last 100)
router.get('/events', (req, res) => {
  try {
    const events = db.all(
      `SELECT * FROM recovery_events ORDER BY timestamp DESC LIMIT 100`
    );
    res.json({ events });
  } catch (error) {
    console.error('Recovery events error:', error);
    res.status(500).json({ error: 'Failed to fetch recovery events' });
  }
});

// GET /api/recovery/status/:provider_id — current recovery state
router.get('/status/:provider_id', (req, res) => {
  try {
    const providerId = parseInt(req.params.provider_id, 10);
    if (isNaN(providerId)) {
      return res.status(400).json({ error: 'Invalid provider_id' });
    }
    const state = getProviderState(providerId);
    const lastEvent = db.get(
      `SELECT * FROM recovery_events WHERE provider_id = ? ORDER BY timestamp DESC LIMIT 1`,
      providerId
    );
    res.json({
      provider_id: providerId,
      status: state.status,
      reconnectAttempts: state.reconnectAttempts,
      lastEvent: lastEvent || null,
    });
  } catch (error) {
    console.error('Recovery status error:', error);
    res.status(500).json({ error: 'Failed to fetch recovery status' });
  }
});

// POST /api/recovery/resolve/:event_id — mark event resolved
router.post('/resolve/:event_id', (req, res) => {
  try {
    const eventId = parseInt(req.params.event_id, 10);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event_id' });
    }
    const event = db.get('SELECT * FROM recovery_events WHERE id = ?', eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    db.run(
      'UPDATE recovery_events SET resolved_at = ? WHERE id = ?',
      new Date().toISOString(), eventId
    );
    res.json({ success: true, event_id: eventId, resolved_at: new Date().toISOString() });
  } catch (error) {
    console.error('Recovery resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve event' });
  }
});

// GET /api/recovery/summary — counts by event_type, active vs resolved
router.get('/summary', (req, res) => {
  try {
    const byType = db.all(
      `SELECT event_type, COUNT(*) as count FROM recovery_events GROUP BY event_type`
    );
    const active = db.get(
      `SELECT COUNT(*) as count FROM recovery_events WHERE resolved_at IS NULL`
    );
    const resolved = db.get(
      `SELECT COUNT(*) as count FROM recovery_events WHERE resolved_at IS NOT NULL`
    );
    res.json({
      by_type: byType,
      active: active.count,
      resolved: resolved.count,
    });
  } catch (error) {
    console.error('Recovery summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Export state machine functions for testing and external use
module.exports = router;
module.exports.processHeartbeatGap = processHeartbeatGap;
module.exports.processLatency = processLatency;
module.exports.getProviderState = getProviderState;
module.exports._resetStates = () => providerStates.clear();
module.exports.BACKOFF_SCHEDULE = BACKOFF_SCHEDULE;
