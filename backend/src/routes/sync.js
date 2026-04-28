const express = require('express');
const router = express.Router();
const sync = require('../services/supabase-sync');
const { safeErrorPayload } = require('../lib/error-response');

const MC_TOKEN = process.env.MC_TOKEN;

function requireAuth(req, res, next) {
  const token = req.headers['x-mc-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!MC_TOKEN) return res.status(503).json({ error: 'MC_TOKEN not configured' });
  if (token !== MC_TOKEN) return res.status(401).json({ error: 'Invalid auth token' });
  next();
}

// Public  check sync health
router.get('/status', (req, res) => {
  res.json(sync.getStatus());
});

// Protected  trigger manual sync cycle
router.post('/run', requireAuth, async (req, res) => {
  try {
    const result = await sync.runSyncCycle();
    if (!result) return res.status(503).json({ error: 'Sync not initialized (SUPABASE_SERVICE_ROLE_KEY missing?)' });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[sync] run error:', e);
    res.status(500).json(safeErrorPayload(e, 'Sync run failed'));
  }
});

// Protected  mark stale providers offline
router.post('/stale', requireAuth, async (req, res) => {
  try {
    await sync.markStaleOffline();
    res.json({ success: true, message: 'Stale providers marked offline' });
  } catch (e) {
    console.error('[sync] stale error:', e);
    res.status(500).json(safeErrorPayload(e, 'Stale sweep failed'));
  }
});

module.exports = router;
