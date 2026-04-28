// DC1 Fallback Loop API Routes
const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStatus } = require('../services/fallback-loop');
const { safeErrorPayload } = require('../lib/error-response');

// GET /api/fallback/status
router.get('/status', (req, res) => {
  try {
    res.json(getStatus());
  } catch (err) {
    console.error('[fallback] status error:', err);
    res.status(500).json(safeErrorPayload(err, 'Fallback status failed'));
  }
});

// GET /api/fallback/bottlenecks
router.get('/bottlenecks', (req, res) => {
  try {
    const events = db.all(
      `SELECT * FROM bottleneck_events ORDER BY created_at DESC LIMIT 20`
    );
    res.json(events);
  } catch (err) {
    console.error('[fallback] bottlenecks error:', err);
    res.status(500).json(safeErrorPayload(err, 'Bottlenecks fetch failed'));
  }
});

// GET /api/fallback/disconnects
router.get('/disconnects', (req, res) => {
  try {
    const events = db.all(
      `SELECT * FROM recovery_events ORDER BY started_at DESC LIMIT 20`
    );
    res.json(events);
  } catch (err) {
    console.error('[fallback] disconnects error:', err);
    res.status(500).json(safeErrorPayload(err, 'Disconnects fetch failed'));
  }
});

// POST /api/fallback/simulate
router.post('/simulate', (req, res) => {
  try {
    const { provider_id, trigger } = req.body;
    if (!provider_id || !trigger) {
      return res.status(400).json({ error: 'provider_id and trigger required' });
    }
    const validTriggers = ['high_utilization', 'queue_overflow', 'timeout'];
    if (!validTriggers.includes(trigger)) {
      return res.status(400).json({ error: `trigger must be one of: ${validTriggers.join(', ')}` });
    }

    db.run(
      `INSERT INTO bottleneck_events (provider_id, trigger, utilization_pct, jobs_affected, action_taken, created_at)
       VALUES (?, ?, ?, 0, 'simulated', ?)`,
      provider_id, trigger, trigger === 'high_utilization' ? 99.0 : 0, new Date().toISOString()
    );

    res.json({ success: true, message: 'Bottleneck event simulated' });
  } catch (err) {
    console.error('[fallback] simulate error:', err);
    res.status(500).json(safeErrorPayload(err, 'Simulate failed'));
  }
});

module.exports = router;
