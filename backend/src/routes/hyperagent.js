'use strict';

/**
 * HyperAgent API Routes
 *
 * Provides admin dashboard data and manual controls for the HyperAgent system.
 *
 * Routes:
 *   GET  /hyperagent/dashboard      — performance dashboard data
 *   GET  /hyperagent/strategies     — list active strategies
 *   GET  /hyperagent/strategy/:gpu  — get strategy for a specific GPU
 *   POST /hyperagent/meta-cycle     — trigger manual meta-agent cycle (admin)
 *   POST /hyperagent/record-outcome — record a job outcome (internal)
 *   GET  /hyperagent/health         — health check
 */

const express = require('express');
const router = express.Router();
const hyperagent = require('../services/hyperagent');
const { secureTokenEqual, normalizeCredential } = require('../middleware/auth');

const TAG = '[ha-api]';

// ── Middleware: admin auth for write endpoints ────────────────────────────────
// Audit M4 — token compare goes through secureTokenEqual (timing-safe). The
// previous `token !== expected` was leaking a per-byte timing oracle.

function requireAdmin(req, res, next) {
  const expected = normalizeCredential(process.env.DC1_ADMIN_TOKEN);
  if (!expected) {
    return res.status(503).json({ error: 'Admin token not configured' });
  }

  const provided = normalizeCredential(req.headers['x-admin-token'] || req.query.admin_token);
  if (!secureTokenEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  next();
}

// ── GET /hyperagent/health ───────────────────────────────────────────────────

router.get('/health', (req, res) => {
  try {
    const strategies = hyperagent.getDashboard().strategies;
    res.json({
      status: 'ok',
      active_strategies: strategies.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// ── GET /hyperagent/dashboard ────────────────────────────────────────────────

router.get('/dashboard', requireAdmin, (req, res) => {
  try {
    const dashboard = hyperagent.getDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error(`${TAG} Dashboard error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /hyperagent/strategies ───────────────────────────────────────────────

router.get('/strategies', requireAdmin, (req, res) => {
  try {
    const dashboard = hyperagent.getDashboard();
    res.json({
      strategies: dashboard.strategies,
      stats: dashboard.stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /hyperagent/strategy/:gpu ────────────────────────────────────────────

router.get('/strategy/:gpu', (req, res) => {
  try {
    const gpuModel = decodeURIComponent(req.params.gpu);
    const strategy = hyperagent.getStrategy(gpuModel);
    res.json(strategy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /hyperagent/meta-cycle ──────────────────────────────────────────────

router.post('/meta-cycle', requireAdmin, async (req, res) => {
  try {
    console.log(`${TAG} Manual meta-cycle triggered`);
    const result = await hyperagent.runMetaCycle();
    res.json(result);
  } catch (error) {
    console.error(`${TAG} Meta-cycle error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /hyperagent/record-outcome ──────────────────────────────────────────

router.post('/record-outcome', (req, res) => {
  try {
    const {
      provider_id, job_id, gpu_model, job_type,
      accepted, strategy_version, earned_halala,
      power_cost_halala, duration_secs, success,
      queue_wait_secs, gpu_util_avg,
    } = req.body;

    if (!provider_id || !job_id) {
      return res.status(400).json({ error: 'provider_id and job_id required' });
    }

    hyperagent.recordOutcome({
      provider_id, job_id, gpu_model, job_type,
      accepted: accepted !== false,
      strategy_version,
      earned_halala: earned_halala || 0,
      power_cost_halala: power_cost_halala || 0,
      duration_secs: duration_secs || 0,
      success: success !== false,
      queue_wait_secs: queue_wait_secs || 0,
      gpu_util_avg: gpu_util_avg || 0,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(`${TAG} Record outcome error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
