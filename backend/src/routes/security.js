const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth } = require('../middleware/auth');

function flattenRunParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
  return db.prepare(sql).run(...flattenRunParams(params));
}

router.use(requireAdminAuth);

// Ensure schema has columns we need (idempotent)
try {
  // Add last_heartbeat if missing
  const cols = db.all("PRAGMA table_info(providers)").map(c => c.name);
  if (!cols.includes('last_heartbeat')) {
    db._db.exec("ALTER TABLE providers ADD COLUMN last_heartbeat DATETIME");
  }
  if (!cols.includes('provider_ip')) {
    db._db.exec("ALTER TABLE providers ADD COLUMN provider_ip TEXT");
  }
  if (!cols.includes('provider_hostname')) {
    db._db.exec("ALTER TABLE providers ADD COLUMN provider_hostname TEXT");
  }
  if (!cols.includes('gpu_status')) {
    db._db.exec("ALTER TABLE providers ADD COLUMN gpu_status TEXT");
  }
} catch (e) {
  // columns may already exist
}

// Create security_events log table for tracking status toggles
try {
  db._db.exec(`
    CREATE TABLE IF NOT EXISTS provider_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (e) {
  // already exists
}

// ============================================================================
// GET /api/security/events — all security events
// ============================================================================
router.get('/events', (req, res) => {
  try {
    const events = [];
    const now = new Date();

    // 1) Failed heartbeats: status='online' but last_heartbeat > 5 min ago
    const staleProviders = db.all(
      `SELECT id, name, email, last_heartbeat, status FROM providers
       WHERE status = 'online'
         AND last_heartbeat IS NOT NULL
         AND datetime(last_heartbeat) < datetime('now', '-5 minutes')`
    );
    for (const p of staleProviders) {
      events.push({
        type: 'failed_heartbeat',
        severity: 'critical',
        provider_id: p.id,
        provider_name: p.name || 'Anonymous',
        description: `Provider heartbeat stale since ${p.last_heartbeat}`,
        timestamp: p.last_heartbeat,
      });
    }

    // 2) New registrations in last 24h
    const newProviders = db.all(
      `SELECT id, name, email, created_at FROM providers
       WHERE datetime(created_at) > datetime('now', '-1 day')`
    );
    for (const p of newProviders) {
      events.push({
        type: 'new_registration',
        severity: 'info',
        provider_id: p.id,
        provider_name: p.name || 'Anonymous',
        description: `New provider registered`,
        timestamp: p.created_at,
      });
    }

    // 3) Suspicious patterns — toggled online/offline >3× in last hour
    const togglers = db.all(
      `SELECT provider_id, COUNT(*) as toggle_count FROM provider_status_log
       WHERE datetime(changed_at) > datetime('now', '-1 hour')
         AND ((old_status = 'online' AND new_status = 'offline')
           OR (old_status = 'offline' AND new_status = 'online'))
       GROUP BY provider_id
       HAVING toggle_count > 3`
    );
    for (const t of togglers) {
      const p = db.get('SELECT id, name, email FROM providers WHERE id = ?', t.provider_id);
      events.push({
        type: 'suspicious_toggle',
        severity: 'warning',
        provider_id: t.provider_id,
        provider_name: p ? (p.name || 'Anonymous') : `Provider #${t.provider_id}`,
        description: `Status toggled ${t.toggle_count}× in last hour`,
        timestamp: new Date().toISOString(),
      });
    }

    // 4) Active threats — suspended or flagged providers
    const threats = db.all(
      `SELECT id, name, email, status, updated_at FROM providers
       WHERE status IN ('suspended', 'flagged')`
    );
    for (const p of threats) {
      events.push({
        type: 'active_threat',
        severity: p.status === 'suspended' ? 'critical' : 'warning',
        provider_id: p.id,
        provider_name: p.name || 'Anonymous',
        description: `Provider is ${p.status}`,
        timestamp: p.updated_at || p.created_at,
      });
    }


    // 5) Host mining detections from daemon_events (last 7 days)
    try {
      const miners = db.all(
        `SELECT de.id, de.provider_id, de.details, de.event_timestamp, de.hostname, p.name
         FROM daemon_events de
         LEFT JOIN providers p ON p.id = de.provider_id
         WHERE de.event_type = 'mining_detected'
           AND datetime(de.event_timestamp) > datetime('now', '-7 days')
         ORDER BY de.event_timestamp DESC LIMIT 50`
      );
      for (const m of miners) {
        events.push({
          type: 'mining_detected',
          severity: 'critical',
          provider_id: m.provider_id,
          provider_name: m.name || 'Anonymous',
          description: (m.details || 'Host miner detected').toString().slice(0, 300),
          timestamp: m.event_timestamp,
          hostname: m.hostname || null,
        });
      }
    } catch (e) {
      // daemon_events may not exist
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ events, total: events.length });
  } catch (error) {
    console.error('Security events error:', error);
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

// ============================================================================
// GET /api/security/summary — counts by severity
// ============================================================================
router.get('/summary', (req, res) => {
  try {
    // Reuse events logic (small dataset, fine for Gate 0)
    const eventsRes = {};
    // Inline: count each category
    const staleCount = db.get(
      `SELECT COUNT(*) as c FROM providers
       WHERE status = 'online'
         AND last_heartbeat IS NOT NULL
         AND datetime(last_heartbeat) < datetime('now', '-5 minutes')`
    ).c;

    const newCount = db.get(
      `SELECT COUNT(*) as c FROM providers
       WHERE datetime(created_at) > datetime('now', '-1 day')`
    ).c;

    const threatCount = db.get(
      `SELECT COUNT(*) as c FROM providers WHERE status IN ('suspended', 'flagged')`
    ).c;

    const toggleCount = db.all(
      `SELECT provider_id FROM provider_status_log
       WHERE datetime(changed_at) > datetime('now', '-1 hour')
         AND ((old_status = 'online' AND new_status = 'offline')
           OR (old_status = 'offline' AND new_status = 'online'))
       GROUP BY provider_id
       HAVING COUNT(*) > 3`
    ).length;

    const critical = staleCount + (threatCount > 0 ? db.get(`SELECT COUNT(*) as c FROM providers WHERE status = 'suspended'`).c : 0);
    const warning = toggleCount + (threatCount > 0 ? db.get(`SELECT COUNT(*) as c FROM providers WHERE status = 'flagged'`).c : 0);
    const info = newCount;
    const total = critical + warning + info;

    res.json({ total, critical, warning, info });
  } catch (error) {
    console.error('Security summary error:', error);
    res.status(500).json({ error: 'Failed to fetch security summary' });
  }
});

// ============================================================================
// POST /api/security/flag/:providerId — flag a provider (auth required)
// ============================================================================
router.post('/flag/:providerId', (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = db.get('SELECT id, status FROM providers WHERE id = ?', parseInt(providerId));

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Log the status change
    runStatement(
      `INSERT INTO provider_status_log (provider_id, old_status, new_status) VALUES (?, ?, ?)`,
      [provider.id, provider.status, 'flagged']
    );

    // Update status
    runStatement(
      `UPDATE providers SET status = 'flagged', updated_at = datetime('now') WHERE id = ?`,
      [provider.id]
    );

    res.json({ success: true, provider_id: provider.id, new_status: 'flagged' });
  } catch (error) {
    console.error('Flag provider error:', error);
    res.status(500).json({ error: 'Failed to flag provider' });
  }
});

module.exports = router;
