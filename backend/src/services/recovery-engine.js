// DC1 Recovery Engine — Provider disconnect detection + job migration
const db = require('../db');

/**
 * Detect providers whose last_heartbeat is older than 90 seconds
 * and status is 'online' → mark as 'disconnected'
 */
function detectDisconnectedProviders() {
  const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
  const stale = db.all(
    `SELECT id, name FROM providers
     WHERE status = 'online' AND COALESCE(is_burst,0)=0 AND last_heartbeat < ?`,
    cutoff
  );

  for (const provider of stale) {
    db.run(`UPDATE providers SET status = 'disconnected' WHERE id = ?`, provider.id);
    console.log(`[recovery] Provider ${provider.id} (${provider.name}) marked disconnected`);
  }

  return stale;
}

/**
 * Find active jobs assigned to a given provider
 */
function findActiveJobsOnProvider(providerId) {
  return db.all(
    `SELECT * FROM jobs WHERE provider_id = ? AND status IN ('pending', 'running')`,
    providerId
  );
}

/**
 * Find the best available backup provider with enough VRAM, excluding a specific provider
 */
function findBackupProvider(requiredVram, excludeProviderId) {
  const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
  return db.get(
    `SELECT * FROM providers
     WHERE status = 'online'
       AND COALESCE(is_burst,0)=0
       AND last_heartbeat >= ?
       AND id != ?
       AND gpu_vram_mib >= ?
     ORDER BY gpu_vram_mib ASC
     LIMIT 1`,
    cutoff,
    excludeProviderId,
    requiredVram
  );
}

function resolveRequiredVramMib(job) {
  if (!job) return 0;
  const fromLegacy = Number(job.vram_required || 0);
  if (Number.isFinite(fromLegacy) && fromLegacy > 0) return fromLegacy;

  if (job.gpu_requirements) {
    try {
      const parsed = typeof job.gpu_requirements === 'string'
        ? JSON.parse(job.gpu_requirements)
        : job.gpu_requirements;
      const minVramGb = Number(parsed?.min_vram_gb || 0);
      if (Number.isFinite(minVramGb) && minVramGb > 0) {
        return Math.round(minVramGb * 1024);
      }
    } catch (_) {
      // ignore malformed serialized requirements and fall back to zero
    }
  }

  return 0;
}

/**
 * Migrate a job from one provider to another, recording a recovery event
 */
function migrateJob(jobId, fromProviderId, toProviderId) {
  const startedAt = new Date().toISOString();

  if (!toProviderId) {
    // No backup available
    db.run(
      `INSERT INTO recovery_events (job_id, from_provider_id, to_provider_id, reason, status, started_at, completed_at, notes)
       VALUES (?, ?, NULL, 'provider_disconnect', 'no_backup', ?, ?, 'No backup provider available')`,
      jobId, fromProviderId, startedAt, startedAt
    );
    return { status: 'no_backup' };
  }

  db.run(
    `INSERT INTO recovery_events (job_id, from_provider_id, to_provider_id, reason, status, started_at, notes)
     VALUES (?, ?, ?, 'provider_disconnect', 'pending', ?, 'Migration initiated')`,
    jobId, fromProviderId, toProviderId, startedAt
  );

  // Update job assignment
  db.run(
    `UPDATE jobs SET provider_id = ?, updated_at = ? WHERE job_id = ?`,
    toProviderId, startedAt, jobId
  );

  // Mark recovery as success
  const completedAt = new Date().toISOString();
  db.run(
    `UPDATE recovery_events SET status = 'success', completed_at = ?, notes = 'Migration completed'
     WHERE job_id = ? AND from_provider_id = ? AND status = 'pending'`,
    completedAt, jobId, fromProviderId
  );

  return { status: 'success', toProviderId };
}

/**
 * Run a full recovery cycle: detect disconnects, find affected jobs, migrate them
 */
function runRecoveryCycle() {
  try {
    const disconnected = detectDisconnectedProviders();

    for (const provider of disconnected) {
      const jobs = findActiveJobsOnProvider(provider.id);

      for (const job of jobs) {
        const requiredVramMib = resolveRequiredVramMib(job);
        const backup = findBackupProvider(requiredVramMib, provider.id);
        const result = migrateJob(job.job_id, provider.id, backup ? backup.id : null);
        console.log(`[recovery] Job ${job.job_id}: ${result.status}`);
      }
    }
  } catch (err) {
    console.error('[recovery] Cycle error:', err.message);
  }
}

module.exports = {
  detectDisconnectedProviders,
  findActiveJobsOnProvider,
  findBackupProvider,
  migrateJob,
  runRecoveryCycle,
};
