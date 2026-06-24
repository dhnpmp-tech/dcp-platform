// DC1 Daily Standup Aggregator — Express Router
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth } = require('../middleware/auth');

const GATE0_DATE = new Date('2026-03-08T00:00:00Z');
const CHAT_ID = process.env.DC1_TELEGRAM_CHAT_ID || '-5275672778';

// In-memory cache of latest standup
let latestStandup = null;

// ============================================================================
// Core: generate standup report data
// ============================================================================
function generateStandupData() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Total providers
  const totalRow = db.get('SELECT COUNT(*) as count FROM providers');
  const total = totalRow ? totalRow.count : 0;

  // Online vs offline (status = 'online' from heartbeat)
  const onlineRow = db.get("SELECT COUNT(*) as count FROM providers WHERE status = 'online'");
  const online = onlineRow ? onlineRow.count : 0;
  const offline = total - online;

  // New registrations in last 24h
  const newRow = db.get('SELECT COUNT(*) as count FROM providers WHERE created_at >= ?', yesterday);
  const newCount = newRow ? newRow.count : 0;

  // GPU model distribution
  let gpuMix = [];
  try {
    gpuMix = db.all(
      'SELECT gpu_model, COUNT(*) as count FROM providers WHERE gpu_model IS NOT NULL GROUP BY gpu_model ORDER BY count DESC'
    );
  } catch (e) { /* table may not have data */ }

  // GPU utilization average (gpu_status is JSON with possible util field)
  let avgUtil = null;
  try {
    const rows = db.all("SELECT gpu_status FROM providers WHERE gpu_status IS NOT NULL AND gpu_status != ''");
    if (rows.length > 0) {
      let sum = 0, cnt = 0;
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.gpu_status);
          const util = parsed.gpu_util_pct ?? parsed.utilization ?? parsed.gpu_utilization ?? null;
          if (typeof util === 'number') { sum += util; cnt++; }
        } catch (_) {}
      }
      if (cnt > 0) avgUtil = Math.round(sum / cnt);
    }
  } catch (e) { /* column may not exist */ }

  // At-risk: providers whose last_heartbeat is older than 15 min (proxy for 3+ missed heartbeats at 5-min interval)
  let atRiskCount = 0;
  try {
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const atRiskRow = db.get(
      "SELECT COUNT(*) as count FROM providers WHERE status = 'online' AND last_heartbeat < ?",
      cutoff
    );
    atRiskCount = atRiskRow ? atRiskRow.count : 0;
  } catch (e) {
    // last_heartbeat column may not exist in schema — note as assumption
  }

  // Days to Gate 0
  const daysToGo = Math.max(0, Math.ceil((GATE0_DATE - now) / (1000 * 60 * 60 * 24)));

  // GPU mix string
  const gpuMixStr = gpuMix.length > 0
    ? gpuMix.map(r => `${r.gpu_model} ×${r.count}`).join(', ')
    : 'No GPUs registered';

  const utilStr = avgUtil !== null ? `${avgUtil}%` : 'N/A';

  const dateStr = now.toISOString().slice(0, 10);

  const telegramText = [
    `📊 *DC1 Daily Standup — ${dateStr}*`,
    '',
    `*Fleet:* ${total} providers | ${online} online | ${offline} offline`,
    `*New (24h):* ${newCount} registrations`,
    `*GPU Mix:* ${gpuMixStr}`,
    `*Avg Utilization:* ${utilStr}`,
    `*At-Risk:* ${atRiskCount} providers missed heartbeat`,
    '',
    `*Gate 0:* ${daysToGo} days to Mar 8 Go/No-Go`
  ].join('\n');

  const data = {
    generated_at: now.toISOString(),
    date: dateStr,
    fleet: { total, online, offline },
    new_24h: newCount,
    gpu_mix: gpuMix,
    avg_utilization: avgUtil,
    at_risk_count: atRiskCount,
    days_to_gate0: daysToGo,
    telegram_text: telegramText
  };

  latestStandup = data;
  return data;
}

// ============================================================================
// Send standup to Telegram
// ============================================================================
async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[standup] TELEGRAM_BOT_TOKEN not set — skipping send');
    return { ok: false, error: 'No bot token' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
    const json = await res.json();
    if (!json.ok) console.error('[standup] Telegram error:', json.description);
    return json;
  } catch (err) {
    console.error('[standup] Telegram send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// ============================================================================
// GET /api/standup/latest — returns latest standup JSON
// ============================================================================
router.get('/latest', requireAdminAuth, (req, res) => {
  try {
    if (!latestStandup) {
      // Generate on first request
      generateStandupData();
    }
    res.json({ success: true, standup: latestStandup });
  } catch (error) {
    console.error('[standup] Latest fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch standup' });
  }
});

// ============================================================================
// POST /api/standup/run — trigger standup on-demand (Bearer auth)
// ============================================================================
router.post('/run', async (req, res) => {
  try {
    // Auth check
    const authHeader = req.headers.authorization;
    const mcToken = process.env.MC_TOKEN;
    if (!mcToken) {
      return res.status(503).json({ error: 'MC_TOKEN not configured' });
    }
    if (!authHeader || authHeader !== `Bearer ${mcToken}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = generateStandupData();
    const telegramResult = await sendToTelegram(data.telegram_text);

    res.json({
      success: true,
      standup: data,
      telegram: { sent: telegramResult.ok === true }
    });
  } catch (error) {
    console.error('[standup] Run error:', error.message);
    res.status(500).json({ error: 'Standup generation failed' });
  }
});

// Export for testing and cron script usage
module.exports = router;
module.exports.generateStandupData = generateStandupData;
module.exports.sendToTelegram = sendToTelegram;
module.exports._setLatestStandup = (v) => { latestStandup = v; };
module.exports._getLatestStandup = () => latestStandup;
