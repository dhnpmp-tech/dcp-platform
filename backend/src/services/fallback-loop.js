// DC1 Fallback Loop — Bottleneck detection + disconnect auto-recovery
const db = require('../db');
const { findActiveJobsOnProvider, findBackupProvider, migrateJob } = require('./recovery-engine');

let loopState = {
  running: false,
  lastRunAt: null,
  intervalId: null,
  consecutiveHighUtil: {}, // provider_id -> count
};

/**
 * Detect providers with last_heartbeat > 90s AND active jobs → trigger recovery
 */
function handleDisconnects() {
  const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
  const stale = db.all(
    `SELECT id, name FROM providers WHERE status = 'online' AND COALESCE(is_burst,0)=0 AND last_heartbeat < ?`,
    cutoff
  );

  for (const provider of stale) {
    db.run(`UPDATE providers SET status = 'disconnected' WHERE id = ?`, provider.id);
    const jobs = findActiveJobsOnProvider(provider.id);
    for (const job of jobs) {
      const backup = findBackupProvider(job.vram_required || 0, provider.id);
      const result = migrateJob(job.job_id, provider.id, backup ? backup.id : null);
      console.log(`[fallback-loop] Disconnect recovery job ${job.job_id}: ${result.status}`);
    }
  }

  return stale.length;
}

/**
 * Detect providers with gpu_utilization > 95% for 3+ consecutive checks
 * AND queued jobs → flag bottleneck, migrate pending jobs
 */
function handleBottlenecks() {
  const onlineProviders = db.all(`SELECT * FROM providers WHERE status = 'online'`);
  let bottlenecksFound = 0;

  for (const provider of onlineProviders) {
    let utilization = 0;
    try {
      const gpuStatus = provider.gpu_status ? JSON.parse(provider.gpu_status) : null;
      if (gpuStatus && gpuStatus.gpu_utilization != null) {
        utilization = gpuStatus.gpu_utilization;
      } else if (gpuStatus && gpuStatus.utilization != null) {
        utilization = gpuStatus.utilization;
      }
    } catch (e) { /* ignore parse errors */ }

    if (utilization > 95) {
      loopState.consecutiveHighUtil[provider.id] = (loopState.consecutiveHighUtil[provider.id] || 0) + 1;
    } else {
      loopState.consecutiveHighUtil[provider.id] = 0;
    }

    if (loopState.consecutiveHighUtil[provider.id] >= 3) {
      const queuedJobs = db.all(
        `SELECT * FROM jobs WHERE provider_id = ? AND status = 'pending'`,
        provider.id
      );

      if (queuedJobs.length > 0) {
        let jobsMigrated = 0;
        let actionTaken = 'none';

        for (const job of queuedJobs) {
          const backup = findBackupProvider(job.vram_required || 0, provider.id);
          if (backup) {
            migrateJob(job.job_id, provider.id, backup.id);
            jobsMigrated++;
            actionTaken = 'migrated_pending_jobs';
          }
        }

        db.run(
          `INSERT INTO bottleneck_events (provider_id, trigger, utilization_pct, jobs_affected, action_taken, created_at)
           VALUES (?, 'high_utilization', ?, ?, ?, ?)`,
          provider.id, utilization, jobsMigrated, actionTaken, new Date().toISOString()
        );

        console.log(`[fallback-loop] Bottleneck on provider ${provider.id}: ${utilization}% util, ${jobsMigrated} jobs migrated`);
        loopState.consecutiveHighUtil[provider.id] = 0;
        bottlenecksFound++;
      }
    }
  }

  return bottlenecksFound;
}

/**
 * Main loop tick
 */
function runFallbackCycle() {
  try {
    handleDisconnects();
    handleBottlenecks();
    loopState.lastRunAt = new Date().toISOString();
  } catch (err) {
    console.error('[fallback-loop] Cycle error:', err.message);
  }
}

function startLoop() {
  if (loopState.running) return;
  loopState.running = true;
  loopState.intervalId = setInterval(runFallbackCycle, 15 * 1000);
  runFallbackCycle(); // run immediately
  console.log('[fallback-loop] Fallback loop started (every 15s)');
}

function stopLoop() {
  if (loopState.intervalId) clearInterval(loopState.intervalId);
  loopState.running = false;
  loopState.intervalId = null;
}

function getStatus() {
  const today = new Date().toISOString().slice(0, 10);
  let eventsToday = 0;
  try {
    const row = db.get(
      `SELECT COUNT(*) as cnt FROM bottleneck_events WHERE created_at >= ?`,
      today + 'T00:00:00.000Z'
    );
    eventsToday = row ? row.cnt : 0;
  } catch (e) { /* table may not exist yet */ }

  return {
    running: loopState.running,
    lastRunAt: loopState.lastRunAt,
    eventsToday,
  };
}

module.exports = {
  startLoop,
  stopLoop,
  getStatus,
  runFallbackCycle,
  handleDisconnects,
  handleBottlenecks,
};
