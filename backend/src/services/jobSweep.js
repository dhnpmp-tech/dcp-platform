const crypto = require('crypto');
const { sendJobCompleteEmail } = require('./emailService');
const { isPublicWebhookUrl, isResolvablePublicWebhookUrl } = require('../lib/webhook-security');
const { resolveRenterWebhookSecret } = require('../lib/webhook-secret');
const notificationsV2 = require('./notificationsV2');

// Threshold (halala) below which a job-completion event ALSO escalates to a
// real-time low-balance email. 10 SAR = 1000 halala. Keeps the on-call path
// alive for the cases that genuinely warrant a synchronous email.
const LOW_BALANCE_THRESHOLD_HALALA = 1000;

let sweepTimer = null;
let loggedRetryMigrationHint = false;
const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000, 4000];
const sweepMetrics = {
  totalRuns: 0,
  sweepErrors: 0,
  lastRunAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

function formatErrorMessage(error) {
  if (!error) return 'Unknown error';
  return error.message || String(error);
}

function recordSweepError(context, error) {
  sweepMetrics.sweepErrors += 1;
  sweepMetrics.lastErrorAt = new Date().toISOString();
  sweepMetrics.lastErrorMessage = `${context}: ${formatErrorMessage(error)}`;
  console.error(`[jobSweep] ${context}:`, formatErrorMessage(error));
}

function safePrepare(db, sql, context) {
  try {
    return db.prepare(sql);
  } catch (error) {
    recordSweepError(context, error);
    throw error;
  }
}

function safeAll(stmt, context) {
  try {
    return stmt.all();
  } catch (error) {
    recordSweepError(context, error);
    return [];
  }
}

function safeGet(stmt, context) {
  try {
    return stmt.get();
  } catch (error) {
    recordSweepError(context, error);
    return null;
  }
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('startJobSweep/getQueueDepth requires a better-sqlite3 database instance');
  }
}

function createWebhookSignature(secret, payloadJson) {
  const hmac = crypto.createHmac('sha256', secret || '');
  hmac.update(payloadJson || '');
  return `sha256=${hmac.digest('hex')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function buildResultPreview(resultRaw) {
  if (resultRaw == null) return null;
  const result = String(resultRaw).trim();
  if (!result) return null;
  return result.slice(0, 300);
}

function getJobColumns(db) {
  const rows = safeAll(
    safePrepare(db, "PRAGMA table_info('jobs')", 'prepare jobs table_info pragma'),
    'read jobs table_info pragma'
  );
  return new Set(rows.map((row) => row.name));
}

function pickQueueTimestampColumn(columns) {
  if (columns.has('queued_at')) return 'queued_at';
  if (columns.has('submitted_at')) return 'submitted_at';
  if (columns.has('created_at')) return 'created_at';
  return null;
}

function buildSweepStatements(db) {
  const columns = getJobColumns(db);
  const hasStartedAt = columns.has('started_at');
  const hasDuration = columns.has('duration_minutes');
  const queueTsCol = pickQueueTimestampColumn(columns);
  const hasRetryCount = columns.has('retry_count');
  const hasMaxRetries = columns.has('max_retries');
  const hasRetryReason = columns.has('retry_reason');
  const hasError = columns.has('error');
  const hasProviderId = columns.has('provider_id');
  const hasCompletedAt = columns.has('completed_at');
  const hasStartedAtCol = columns.has('started_at');
  const hasAssignedAt = columns.has('assigned_at');
  const hasPickedUpAt = columns.has('picked_up_at');
  const hasTimeoutAt = columns.has('timeout_at');
  const hasStatusUpdatedAt = columns.has('status_updated_at');
  const hasUpdatedAt = columns.has('updated_at');
  const hasRenterId = columns.has('renter_id');
  const hasWebhookNotifiedAt = columns.has('webhook_notified_at');
  const hasWebhookDeliveryStatus = columns.has('webhook_delivery_status');
  const hasWebhookDeliveryAttempts = columns.has('webhook_delivery_attempts');
  const hasCompletionEmailSentAt = columns.has('completion_email_sent_at');

  const runningCandidatesSql = hasStartedAt && hasDuration
    ? `
      SELECT * FROM jobs
      WHERE status = 'running'
        AND job_type != 'interactive_pod' -- pods settle via sweepExpiredPods, never retry
        AND started_at IS NOT NULL
        AND COALESCE(duration_minutes, 0) > 0
        AND datetime(started_at, '+' || duration_minutes || ' minutes') <= datetime('now')
    `
    : null;

  const queuedCandidatesSql = queueTsCol
    ? `
      SELECT * FROM jobs
      WHERE status = 'queued'
        AND job_type != 'interactive_pod' -- stale pods cancel+refund via sweepExpiredPods
        AND ${queueTsCol} IS NOT NULL
        AND datetime(${queueTsCol}) <= datetime('now', '-30 minutes')
    `
    : null;

  const webhookCandidatesSql = hasRenterId && hasWebhookNotifiedAt
    ? `
      SELECT id, job_id, status, renter_id, provider_id, completed_at, result, cost_halala, actual_cost_halala
      FROM jobs
      WHERE renter_id IS NOT NULL
        AND webhook_notified_at IS NULL
        AND status IN ('done', 'completed', 'failed', 'permanently_failed')
      ORDER BY COALESCE(completed_at, created_at) ASC, id ASC
      LIMIT 25
    `
    : null;

  const completionEmailCandidatesSql = hasRenterId && hasCompletionEmailSentAt
    ? `
      SELECT id, job_id, renter_id, status, model, job_type,
             actual_cost_halala, cost_halala, provider_earned_halala,
             actual_duration_minutes, duration_minutes
      FROM jobs
      WHERE renter_id IS NOT NULL
        AND completion_email_sent_at IS NULL
        AND status IN ('done', 'completed')
      ORDER BY COALESCE(completed_at, created_at) ASC, id ASC
      LIMIT 25
    `
    : null;

  const queueDepthSql = `
    SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
    FROM jobs
  `;

  return {
    columns,
    hasRetryColumns: hasRetryCount && hasMaxRetries,
    hasRetryReason,
    hasError,
    hasProviderId,
    hasCompletedAt,
    hasStartedAtCol,
    hasAssignedAt,
    hasPickedUpAt,
    hasTimeoutAt,
    hasWebhookNotifiedAt,
    hasWebhookDeliveryStatus,
    hasWebhookDeliveryAttempts,
    hasCompletionEmailSentAt,
    touchColumn: hasStatusUpdatedAt ? 'status_updated_at' : (hasUpdatedAt ? 'updated_at' : null),
    runningCandidatesStmt: runningCandidatesSql
      ? safePrepare(db, runningCandidatesSql, 'prepare running candidates statement')
      : null,
    queuedCandidatesStmt: queuedCandidatesSql
      ? safePrepare(db, queuedCandidatesSql, 'prepare queued candidates statement')
      : null,
    webhookCandidatesStmt: webhookCandidatesSql
      ? safePrepare(db, webhookCandidatesSql, 'prepare webhook candidates statement')
      : null,
    completionEmailCandidatesStmt: completionEmailCandidatesSql
      ? safePrepare(db, completionEmailCandidatesSql, 'prepare completion email candidates statement')
      : null,
    renterWebhookStmt: safePrepare(
      db,
      `SELECT id, api_key, webhook_url, email, name, status, balance_halala FROM renters WHERE id = ?`,
      'prepare renter webhook lookup statement'
    ),
    queueDepthStmt: safePrepare(db, queueDepthSql, 'prepare queue depth statement'),
  };
}

function normalizeRetryReason(reason) {
  if (reason === 'provider_timeout') return 'provider_timeout';
  if (reason === 'queue_timeout') return 'queue_timeout';
  return 'execution_failed';
}

function logRetryMigrationHintOnce() {
  if (loggedRetryMigrationHint) return;
  loggedRetryMigrationHint = true;
  console.warn('[jobSweep] jobs.retry_count/max_retries columns missing. Apply migration on VPS:');
  console.warn('ALTER TABLE jobs ADD COLUMN retry_count INTEGER DEFAULT 0;');
  console.warn('ALTER TABLE jobs ADD COLUMN max_retries INTEGER DEFAULT 2;');
}

function writeSweepLog(state, job, fromStatus, toStatus, reason) {
  try {
    safePrepare(
      state.db,
      `INSERT INTO job_sweep_log (job_id, old_status, new_status, reason, swept_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      'prepare job_sweep_log insert'
    ).run(job.job_id || String(job.id), fromStatus, toStatus, reason);
  } catch (error) {
    recordSweepError('write sweep audit log', error);
    // best-effort audit only
  }
}

function updateJobForRetry(state, job, reason) {
  const retryReason = normalizeRetryReason(reason);
  const retryCount = Number(job.retry_count || 0);
  const maxRetries = Number(job.max_retries || 2);
  const nextRetryCount = retryCount + 1;

  if (retryCount < maxRetries) {
    const clauses = ["status = 'queued'", 'retry_count = ?'];
    const params = [nextRetryCount];
    if (state.hasProviderId) clauses.push('provider_id = NULL');
    if (state.hasCompletedAt) clauses.push('completed_at = NULL');
    if (state.hasStartedAtCol) clauses.push('started_at = NULL');
    if (state.hasAssignedAt) clauses.push('assigned_at = NULL');
    if (state.hasPickedUpAt) clauses.push('picked_up_at = NULL');
    if (state.hasTimeoutAt) clauses.push('timeout_at = NULL');
    if (state.hasWebhookNotifiedAt) {
      clauses.push('webhook_notified_at = NULL');
    }
    if (state.hasWebhookDeliveryStatus) {
      clauses.push('webhook_delivery_status = NULL');
    }
    if (state.hasWebhookDeliveryAttempts) {
      clauses.push('webhook_delivery_attempts = 0');
    }
    if (state.hasRetryReason) {
      clauses.push('retry_reason = ?');
      params.push(retryReason);
    }
    if (state.hasError) {
      clauses.push('error = ?');
      params.push(`[retry ${nextRetryCount}/${maxRetries}] ${retryReason}`);
    }
    if (state.touchColumn) clauses.push(`${state.touchColumn} = datetime('now')`);

    params.push(job.id);
    try {
      safePrepare(
        state.db,
        `UPDATE jobs
         SET ${clauses.join(', ')}
         WHERE id = ?
           AND status NOT IN ('failed', 'permanently_failed', 'cancelled', 'completed', 'done')`,
        'prepare retry queue update'
      ).run(...params);
    } catch (error) {
      recordSweepError(`update job ${job.id} for retry`, error);
      return;
    }
    writeSweepLog(state, job, job.status, 'queued', retryReason);
    return;
  }

  const clauses = ["status = 'failed'"];
  const params = [];
  if (state.hasRetryReason) {
    clauses.push('retry_reason = ?');
    params.push(retryReason);
  }
  if (state.hasError) {
    clauses.push('error = ?');
    params.push(`[permanent] retries exhausted: ${retryReason}`);
  }
  if (state.hasCompletedAt) clauses.push("completed_at = datetime('now')");
  if (state.touchColumn) clauses.push(`${state.touchColumn} = datetime('now')`);
  params.push(job.id);

  try {
    safePrepare(
      state.db,
      `UPDATE jobs
       SET ${clauses.join(', ')}
       WHERE id = ?
         AND status NOT IN ('failed', 'permanently_failed', 'cancelled', 'completed', 'done')`,
      'prepare permanent failure update'
    ).run(...params);
  } catch (error) {
    recordSweepError(`mark job ${job.id} failed`, error);
    return;
  }
  writeSweepLog(state, job, job.status, 'failed', retryReason);
}

function appendWebhookLogLine(nowIso, detail) {
  return `\n[${nowIso}] webhook ${detail}`;
}

function markWebhookDelivery(state, jobId, attempts, status, detail) {
  if (!state.hasWebhookNotifiedAt) return;

  const now = new Date().toISOString();
  const clauses = ['webhook_notified_at = ?'];
  const params = [now];

  if (state.hasWebhookDeliveryStatus) {
    clauses.push('webhook_delivery_status = ?');
    params.push(status);
  }

  if (state.hasWebhookDeliveryAttempts) {
    clauses.push('webhook_delivery_attempts = ?');
    params.push(attempts);
  }

  clauses.push('notes = substr(COALESCE(notes, \'\') || ?, -4000)');
  params.push(appendWebhookLogLine(now, detail));
  params.push(jobId);

  try {
    safePrepare(
      state.db,
      `UPDATE jobs SET ${clauses.join(', ')} WHERE id = ?`,
      'prepare webhook delivery update'
    ).run(...params);
  } catch (error) {
    recordSweepError(`update webhook delivery for job ${jobId}`, error);
  }
}

function markCompletionEmailSent(state, jobId) {
  if (!state.hasCompletionEmailSentAt) return;
  try {
    safePrepare(
      state.db,
      'UPDATE jobs SET completion_email_sent_at = ? WHERE id = ?',
      'prepare completion email sent update'
    ).run(new Date().toISOString(), jobId);
  } catch (error) {
    recordSweepError(`update completion email sent for job ${jobId}`, error);
  }
}

async function deliverWebhookWithRetry(webhookUrl, secret, payload) {
  const payloadJson = JSON.stringify(payload);
  const signature = createWebhookSignature(secret, payloadJson);
  let lastDetail = 'delivery_failed';

  for (let attempt = 1; attempt <= WEBHOOK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DCP-Signature': signature,
        },
        body: payloadJson,
        signal: getTimeoutSignal(5000),
      });

      if (response.ok) {
        return {
          ok: true,
          attempts: attempt,
          detail: `delivered_http_${response.status}`,
        };
      }

      lastDetail = `http_${response.status}`;
    } catch (error) {
      lastDetail = formatErrorMessage(error);
    }

    if (attempt < WEBHOOK_RETRY_DELAYS_MS.length) {
      await sleep(WEBHOOK_RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  return {
    ok: false,
    attempts: WEBHOOK_RETRY_DELAYS_MS.length,
    detail: lastDetail,
  };
}

async function processWebhookCandidates(state) {
  if (!state.webhookCandidatesStmt || !state.hasWebhookNotifiedAt) return;

  const candidates = safeAll(state.webhookCandidatesStmt, 'query webhook candidates');
  for (const job of candidates) {
    if (!job || !job.id || !job.renter_id) continue;

    let renter;
    try {
      renter = state.renterWebhookStmt.get(job.renter_id);
    } catch (error) {
      recordSweepError(`lookup renter webhook for job ${job.id}`, error);
      continue;
    }

    if (!renter || renter.status !== 'active' || !renter.webhook_url) {
      markWebhookDelivery(state, job.id, 0, 'skipped', 'webhook_not_configured');
      continue;
    }
    if (!isPublicWebhookUrl(renter.webhook_url)) {
      markWebhookDelivery(state, job.id, 0, 'skipped', 'webhook_url_blocked');
      continue;
    }
    if (!(await isResolvablePublicWebhookUrl(renter.webhook_url))) {
      markWebhookDelivery(state, job.id, 0, 'skipped', 'webhook_dns_blocked');
      continue;
    }

    const normalizedStatus = job.status === 'completed'
      ? 'done'
      : (job.status === 'permanently_failed' ? 'failed' : job.status);

    const payload = {
      job_id: job.job_id || String(job.id),
      status: normalizedStatus,
      cost_halala: Number(job.actual_cost_halala ?? job.cost_halala ?? 0),
      provider_id: job.provider_id || null,
      completed_at: job.completed_at || new Date().toISOString(),
      result_preview: buildResultPreview(job.result),
    };

    const delivery = await deliverWebhookWithRetry(renter.webhook_url, renter.api_key, payload);
    markWebhookDelivery(
      state,
      job.id,
      delivery.attempts,
      delivery.ok ? 'delivered' : 'failed',
      delivery.detail
    );
  }
}

async function processCompletionEmailCandidates(state) {
  if (!state.completionEmailCandidatesStmt || !state.hasCompletionEmailSentAt) return;

  const candidates = safeAll(state.completionEmailCandidatesStmt, 'query completion email candidates');
  const v2Enabled = notificationsV2.isEnabled();

  for (const job of candidates) {
    if (!job || !job.id || !job.renter_id) continue;

    let renter;
    try {
      renter = state.renterWebhookStmt.get(job.renter_id);
    } catch (error) {
      recordSweepError(`lookup renter email for job ${job.id}`, error);
      continue;
    }

    if (!renter || renter.status !== 'active' || !renter.email) {
      markCompletionEmailSent(state, job.id);
      continue;
    }

    const totalHalala = Number(job.actual_cost_halala ?? job.cost_halala ?? 0);
    const providerEarningHalala = Number(job.provider_earned_halala);
    const durationMinutes = Number(job.actual_duration_minutes ?? job.duration_minutes);

    if (v2Enabled) {
      // V2: persist an in-dashboard notification instead of sending an email.
      const notifPayload = {
        job_id: job.job_id || String(job.id),
        model: job.model || job.job_type || 'General compute',
        cost_halala: totalHalala,
        cost_sar: totalHalala / 100,
        duration_minutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
        provider_earned_halala: Number.isFinite(providerEarningHalala) ? providerEarningHalala : null,
        status: job.status,
      };
      const insertResult = notificationsV2.recordNotification(state.db, {
        renterId: renter.id,
        kind: 'job_completed',
        jobId: job.id,
        payload: notifPayload,
      });

      // If the notification table isn't there yet (mid-deploy), fall through
      // to the legacy email path so we don't lose the event.
      if (insertResult.ok) {
        // Low-balance escalation: if completing this job pushed the renter
        // under the threshold, send ONE real-time email AND record a
        // 'balance_low' notification. Best-effort — failures don't block
        // the completion mark.
        const balanceHalala = Number(renter.balance_halala);
        if (Number.isFinite(balanceHalala) && balanceHalala < LOW_BALANCE_THRESHOLD_HALALA) {
          notificationsV2.recordNotification(state.db, {
            renterId: renter.id,
            kind: 'balance_low',
            jobId: job.id,
            payload: {
              balance_halala: balanceHalala,
              balance_sar: balanceHalala / 100,
              threshold_sar: LOW_BALANCE_THRESHOLD_HALALA / 100,
            },
          });
          // We reuse the existing job-complete email template here as the
          // carrier for the urgency signal; a dedicated low-balance template
          // is out of scope for this PR.
          try {
            await sendJobCompleteEmail(
              renter.email,
              job.job_id || String(job.id),
              totalHalala / 100,
              job.model || job.job_type || 'General compute',
              {
                durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
                providerEarningSar: Number.isFinite(providerEarningHalala) ? providerEarningHalala / 100 : undefined,
              }
            );
          } catch (err) {
            console.warn(`[jobSweep] low-balance escalation email failed for job ${job.id}: ${err.message}`);
          }
        }

        markCompletionEmailSent(state, job.id);
        continue;
      }
      // insert failed (e.g. table missing) — fall through to legacy email
    }

    const result = await sendJobCompleteEmail(
      renter.email,
      job.job_id || String(job.id),
      totalHalala / 100,
      job.model || job.job_type || 'General compute',
      {
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
        providerEarningSar: Number.isFinite(providerEarningHalala) ? providerEarningHalala / 100 : undefined,
      }
    );

    if (result?.ok || result?.reason === 'not_configured' || result?.reason === 'invalid_arguments') {
      markCompletionEmailSent(state, job.id);
      continue;
    }

    recordSweepError(`send job complete email for job ${job.id}`, new Error(result?.reason || 'unknown email failure'));
  }
}

async function runSweep(state) {
  if (state.sweepInFlight) return;
  state.sweepInFlight = true;

  sweepMetrics.totalRuns += 1;
  sweepMetrics.lastRunAt = new Date().toISOString();

  try {
    if (!state.hasRetryColumns) {
      logRetryMigrationHintOnce();
    } else {
      const candidates = [];
      if (state.runningCandidatesStmt) {
        candidates.push(...safeAll(state.runningCandidatesStmt, 'query running candidates')
          .map((j) => ({ job: j, reason: 'provider_timeout' })));
      }
      if (state.queuedCandidatesStmt) {
        candidates.push(...safeAll(state.queuedCandidatesStmt, 'query queued candidates')
          .map((j) => ({ job: j, reason: 'queue_timeout' })));
      }
      const seen = new Set();
      for (const item of candidates) {
        if (!item.job || seen.has(item.job.id)) continue;
        seen.add(item.job.id);
        try {
          updateJobForRetry(state, item.job, item.reason);
        } catch (error) {
          recordSweepError(`process candidate job ${item.job.id}`, error);
        }
      }
    }

    try { settleExpiredPods(state.db); } catch (error) { recordSweepError('pod settlement sweep', error); }
    try { billRenterVolumes(state.db); } catch (error) { recordSweepError('volume billing sweep', error); }
    await processCompletionEmailCandidates(state);
    await processWebhookCandidates(state);
  } catch (error) {
    recordSweepError('sweep tick failed', error);
  } finally {
    state.sweepInFlight = false;
  }
}

// ─── Rentable-volume monthly billing sweep ───────────────────────────────────
// Volumes are billed monthly in advance. First month is charged at rent time;
// this sweep handles every renewal at period end:
//   • Funded → charge the monthly fee, advance the 30-day period.
//   • Unfunded (active) → suspend (stops counting against the 100GB pool's
//     usable serving, pod stops getting the volume) but KEEP the data through a
//     grace window so a top-up can revive it.
//   • Suspended + now funded → reactivate (charge + new period).
//   • Suspended past the grace window → reclaim: deprovision the bucket, release.
// current_period_end doubles as the lapse marker for suspended volumes (it is
// only advanced on a successful charge), so no extra column is needed.
const VOLUME_SUSPEND_GRACE_DAYS = 7;

function billRenterVolumes(db) {
  const raw = db._db || db;
  const nowIso = new Date().toISOString();
  let store = null;
  try { store = require('../lib/volume-store'); } catch (_) { /* provisioning offline */ }

  // Due = active or suspended volumes whose paid period has ended.
  const due = safeAll(
    raw.prepare(`
      SELECT id, renter_id, size_gb, bucket, status, price_halala_per_month, current_period_end
        FROM renter_volumes
       WHERE status IN ('active','suspended')
         AND datetime(COALESCE(current_period_end, rented_at)) <= datetime('now')
       LIMIT 50`),
    'query due volumes'
  );

  for (const vol of due) {
    const price = Math.max(0, Math.round(Number(vol.price_halala_per_month) || 0));
    try {
      // Reclaim first: a suspended volume past the grace window is torn down.
      if (vol.status === 'suspended') {
        const lapsedDaysRow = raw.prepare(
          `SELECT (julianday('now') - julianday(?)) AS days`
        ).get(vol.current_period_end);
        if (lapsedDaysRow && Number(lapsedDaysRow.days) >= VOLUME_SUSPEND_GRACE_DAYS) {
          if (store) { try { store.deprovisionVolume(vol.renter_id); } catch (e) { recordSweepError(`volume deprovision ${vol.id}`, e); } }
          raw.prepare(`UPDATE renter_volumes SET status = 'released', released_at = ? WHERE id = ? AND status = 'suspended'`)
            .run(nowIso, vol.id);
          console.log(`[volumes/bill] reclaimed suspended volume ${vol.id} (renter ${vol.renter_id}, ${vol.size_gb}GB) after ${VOLUME_SUSPEND_GRACE_DAYS}d grace`);
          continue;
        }
      }

      // Attempt the renewal charge (atomic; only if balance covers it).
      const charged = raw.transaction(() => {
        if (price > 0) {
          const debit = raw.prepare(
            `UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ?
              WHERE id = ? AND balance_halala >= ?`
          ).run(price, nowIso, vol.renter_id, price);
          if (debit.changes !== 1) return false;
        }
        raw.prepare(
          `UPDATE renter_volumes
              SET status = 'active',
                  current_period_start = current_period_end,
                  current_period_end = datetime(current_period_end, '+30 days'),
                  last_billed_at = ?
            WHERE id = ?`
        ).run(nowIso, vol.id);
        return true;
      })();

      if (charged) {
        console.log(`[volumes/bill] renewed volume ${vol.id} (renter ${vol.renter_id}, -${price} halala)`);
      } else if (vol.status === 'active') {
        // Could not charge → suspend (keep data through the grace window).
        raw.prepare(`UPDATE renter_volumes SET status = 'suspended' WHERE id = ? AND status = 'active'`).run(vol.id);
        console.log(`[volumes/bill] suspended volume ${vol.id} (renter ${vol.renter_id}) — insufficient balance for ${price} halala`);
      }
    } catch (error) {
      recordSweepError(`bill volume ${vol.id}`, error);
    }
  }
}

// ─── Interactive-pod settlement sweep ────────────────────────────────────────
// Pods are PREPAID: cost_halala was debited at launch. Two terminal paths the
// renter-initiated DELETE does not cover:
//   1. Deadline reached: the daemon's reaper kills the container, but nothing
//      settles money — the renter consumed the full rental, so settle at the
//      full quote and credit the provider 75% (same split as job-result).
//   2. Never picked up: a queued pod whose provider never started it within
//      15 minutes — cancel and refund the full quote.
// Each settlement is one transaction; status flips guard against double-runs.
const POD_PROVIDER_EARN_SHARE = 0.75;
const POD_DEADLINE_GRACE_SECONDS = 300;
const POD_QUEUED_STALE_MINUTES = 25; // was 15 — gave slow provider pickup / image pulls too little room

function settleExpiredPods(db) {
  const raw = db._db || db;
  const nowIso = new Date().toISOString();

  const expired = safeAll(
    raw.prepare(`
      SELECT id, job_id, renter_id, provider_id, cost_halala, max_duration_seconds, started_at
        FROM jobs
       WHERE job_type = 'interactive_pod' AND status = 'running'
         AND started_at IS NOT NULL AND COALESCE(max_duration_seconds, 0) > 0
         AND datetime(started_at, '+' || (max_duration_seconds + ${POD_DEADLINE_GRACE_SECONDS}) || ' seconds') <= datetime('now')
       LIMIT 20`),
    'query expired pods'
  );
  for (const job of expired) {
    try {
      const prepaid = Math.max(0, Math.round(Number(job.cost_halala) || 0));
      const earned = Math.floor(prepaid * POD_PROVIDER_EARN_SHARE);
      const fee = prepaid - earned;
      raw.transaction(() => {
        const flip = raw.prepare(`
          UPDATE jobs SET status = 'completed', completed_at = ?, duration_seconds = max_duration_seconds,
                 actual_cost_halala = ?, provider_earned_halala = ?, dc1_fee_halala = ?
           WHERE id = ? AND status = 'running'`).run(nowIso, prepaid, earned, fee, job.id);
        if (flip.changes !== 1) return; // raced with DELETE or job-result — they settled
        if (earned > 0 && job.provider_id) {
          raw.prepare(`
            UPDATE providers SET total_earnings = total_earnings + ?,
                   claimable_earnings_halala = claimable_earnings_halala + ?,
                   total_jobs = total_jobs + 1, current_job_id = NULL
             WHERE id = ?`).run(earned / 100, earned, job.provider_id);
        }
        if (job.renter_id) {
          raw.prepare(`
            UPDATE renters SET total_spent_halala = total_spent_halala + ?, total_jobs = total_jobs + 1
             WHERE id = ?`).run(prepaid, job.renter_id);
        }
      })();
      try {
        const { invokePodRelay } = require('../lib/pod-relay');
        invokePodRelay(['stop', job.job_id]);
      } catch (_) { /* relay teardown is best-effort */ }
      console.log(`[pod-sweep] settled expired pod ${job.job_id}: charged ${prepaid} halala, provider ${job.provider_id} earned ${earned}`);
    } catch (error) {
      recordSweepError(`settle expired pod ${job.job_id}`, error);
    }
  }

  const stale = safeAll(
    raw.prepare(`
      SELECT id, job_id, renter_id, cost_halala, refunded_at
        FROM jobs
       WHERE job_type = 'interactive_pod' AND status IN ('pending','queued')
         -- NEVER cancel a pod the daemon has already started: if it set up the
         -- relay (jupyter_host_port / access_url), the container is live and the
         -- status just hasn't flipped to 'running' yet (slow relay, daemon
         -- restart). Cancelling those killed a renter's live 8h training pod.
         AND jupyter_host_port IS NULL AND access_url IS NULL
         AND datetime(COALESCE(submitted_at, created_at)) <= datetime('now', '-${POD_QUEUED_STALE_MINUTES} minutes')
       LIMIT 20`),
    'query stale queued pods'
  );
  for (const job of stale) {
    try {
      raw.transaction(() => {
        const flip = raw.prepare(`
          UPDATE jobs SET status = 'cancelled', completed_at = ?, refunded_at = ?
           WHERE id = ? AND status IN ('pending','queued')`).run(nowIso, nowIso, job.id);
        if (flip.changes !== 1) return;
        const prepaid = Math.max(0, Math.round(Number(job.cost_halala) || 0));
        if (prepaid > 0 && !job.refunded_at && job.renter_id) {
          raw.prepare(`UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`)
            .run(prepaid, job.renter_id);
        }
      })();
      console.log(`[pod-sweep] cancelled stale queued pod ${job.job_id}, refunded ${job.cost_halala || 0} halala`);
    } catch (error) {
      recordSweepError(`cancel stale pod ${job.job_id}`, error);
    }
  }
}

// ─── Provider Offline Sweep ──────────────────────────────────────────────────
// Runs every 60s. Finds providers with no heartbeat for > 5 minutes,
// marks them offline, releases active jobs back to the queue,
// and notifies affected renters via their configured webhooks.
// ─────────────────────────────────────────────────────────────────────────────

let providerSweepTimer = null;
const PROVIDER_OFFLINE_THRESHOLD_SECS = 5 * 60;

async function sweepOfflineProviders(db) {
  try {
    const staleProviders = db.all(
      `SELECT id, status, last_heartbeat
       FROM providers
       WHERE status != 'offline'
         AND (
           last_heartbeat IS NULL
           OR CAST((julianday('now') - julianday(last_heartbeat)) * 86400 AS INTEGER) > ?
         )`,
      PROVIDER_OFFLINE_THRESHOLD_SECS
    );
    if (staleProviders.length === 0) return;

    const now = new Date().toISOString();
    const providerColumns = new Set(db.all(`PRAGMA table_info(providers)`).map((r) => r.name));
    const jobColumns = new Set(db.all(`PRAGMA table_info(jobs)`).map((r) => r.name));

    const providerSets = [`status = 'offline'`];
    if (providerColumns.has('updated_at')) providerSets.push(`updated_at = '${now}'`);

    const jobSets = [`status = 'queued'`, 'provider_id = NULL'];
    if (jobColumns.has('last_error')) jobSets.push(`last_error = 'Provider went offline'`);
    if (jobColumns.has('retry_count')) jobSets.push('retry_count = COALESCE(retry_count, 0) + 1');
    if (jobColumns.has('picked_up_at')) jobSets.push('picked_up_at = NULL');
    if (jobColumns.has('assigned_at')) jobSets.push('assigned_at = NULL');
    if (jobColumns.has('started_at')) jobSets.push('started_at = NULL');
    if (jobColumns.has('updated_at')) jobSets.push(`updated_at = '${now}'`);

    const markOfflineStmt = db.prepare(`UPDATE providers SET ${providerSets.join(', ')} WHERE id = ?`);
    const fetchJobsStmt = db.prepare(
      `SELECT j.id, j.job_id, j.renter_id, j.provider_id, j.job_type, j.submitted_at, j.started_at,
              r.webhook_url, r.api_key AS renter_api_key
       FROM jobs j
       LEFT JOIN renters r ON r.id = j.renter_id
       WHERE j.provider_id = ? AND j.status IN ('running', 'pending', 'assigned', 'pulling')`
    );
    const requeueStmt = db.prepare(
      `UPDATE jobs SET ${jobSets.join(', ')} WHERE provider_id = ? AND status IN ('running', 'pending', 'assigned', 'pulling')`
    );

    const jobsToNotify = [];
    const tx = db.transaction(() => {
      for (const provider of staleProviders) {
        const activeJobs = fetchJobsStmt.all(provider.id);
        jobsToNotify.push(...activeJobs);
        markOfflineStmt.run(provider.id);
        requeueStmt.run(provider.id);
        console.log(
          `[providerSweep] provider ${provider.id} offline (last_heartbeat: ${provider.last_heartbeat || 'never'}), requeued ${activeJobs.length} jobs`
        );
      }
    });
    tx();

    // Notify affected renters (fire-and-forget)
    const { isPublicWebhookUrl } = require('../lib/webhook-security');
    const allowPrivate = process.env.NODE_ENV === 'test' || process.env.ALLOW_PRIVATE_WEBHOOK_URLS === '1';
    for (const job of jobsToNotify) {
      if (!job.webhook_url) continue;
      if (!allowPrivate && !isPublicWebhookUrl(job.webhook_url)) continue;
      try {
        const payload = JSON.stringify({
          event: 'provider.offline',
          timestamp: now,
          job: {
            id: job.id,
            job_id: job.job_id,
            renter_id: job.renter_id,
            provider_id: job.provider_id,
            status: 'queued',
            job_type: job.job_type || null,
            submitted_at: job.submitted_at || null,
            started_at: job.started_at || null,
          },
          message: 'Provider went offline. Job has been returned to the queue and will be reassigned.',
        });
        // Audit M6 — per-renter webhook secret, never the api_key.
        const secret = resolveRenterWebhookSecret(job.renter_id);
        if (!secret) {
          console.warn(`[providerSweep] no webhook secret for renter ${job.renter_id}, skipping job ${job.job_id || job.id}`);
          continue;
        }
        const signature = createWebhookSignature(secret, payload);
        fetch(job.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DCP-Event': 'provider.offline',
            'X-DCP-Signature': signature,
          },
          body: payload,
          signal: getTimeoutSignal(5000),
        }).catch((err) => {
          console.warn(`[providerSweep] webhook failed for job ${job.job_id || job.id}: ${err.message}`);
        });
      } catch (err) {
        console.warn(`[providerSweep] webhook prep failed for job ${job.job_id || job.id}: ${err.message}`);
      }
    }
  } catch (error) {
    recordSweepError('sweepOfflineProviders', error);
  }
}

function startProviderOfflineSweep(db, intervalMs = 60000) {
  assertDb(db);
  stopProviderOfflineSweep();
  const safeMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000;
  sweepOfflineProviders(db).catch((err) => recordSweepError('initial provider offline sweep', err));
  providerSweepTimer = setInterval(() => {
    sweepOfflineProviders(db).catch((err) => recordSweepError('scheduled provider offline sweep', err));
  }, safeMs);
  if (typeof providerSweepTimer.unref === 'function') providerSweepTimer.unref();
  return providerSweepTimer;
}

function stopProviderOfflineSweep() {
  if (providerSweepTimer) {
    clearInterval(providerSweepTimer);
    providerSweepTimer = null;
  }
}

function startJobSweep(db, intervalMs = 30000) {
  assertDb(db);
  stopJobSweep();

  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30000;
  const state = { ...buildSweepStatements(db), db: db._db || db, sweepInFlight: false };

  runSweep(state).catch((error) => recordSweepError('initial sweep run failed', error));
  sweepTimer = setInterval(() => {
    runSweep(state).catch((error) => recordSweepError('scheduled sweep run failed', error));
  }, safeIntervalMs);
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }

  return sweepTimer;
}

function stopJobSweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

function getQueueDepth(db) {
  try {
    assertDb(db);
    const { queueDepthStmt } = buildSweepStatements(db);
    const row = safeGet(queueDepthStmt, 'read queue depth') || {};
    return {
      queued: Number(row.queued || 0),
      running: Number(row.running || 0),
    };
  } catch (error) {
    recordSweepError('get queue depth', error);
    return { queued: 0, running: 0 };
  }
}

function getSweepMetrics() {
  return {
    totalRuns: sweepMetrics.totalRuns,
    sweepErrors: sweepMetrics.sweepErrors,
    lastRunAt: sweepMetrics.lastRunAt,
    lastErrorAt: sweepMetrics.lastErrorAt,
    lastErrorMessage: sweepMetrics.lastErrorMessage,
  };
}

module.exports = {
  startJobSweep,
  stopJobSweep,
  getQueueDepth,
  getSweepMetrics,
  createWebhookSignature,
  startProviderOfflineSweep,
  stopProviderOfflineSweep,
};
