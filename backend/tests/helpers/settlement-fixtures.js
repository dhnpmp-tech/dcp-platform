'use strict';

const crypto = require('crypto');
const db = require('../../src/db');

const RATE_PER_GPU_SECOND = 2 / 60; // 2 halala/min — matches pods-billing.test.js

function cleanSettlementTables() {
  try { db._db.pragma('foreign_keys = OFF'); } catch (_) {}
  for (const table of [
    'escrow_holds',
    'job_lifecycle_events',
    'jobs',
    'renters',
    'providers',
  ]) {
    try { db.run(`DELETE FROM ${table}`); } catch (_) {}
  }
  try { db._db.pragma('foreign_keys = ON'); } catch (_) {}
}

function insertProvider(overrides = {}) {
  const email = `provider-${crypto.randomBytes(4).toString('hex')}@dc1.test`;
  db.run(
    `INSERT INTO providers (
       name, email, gpu_count, cost_per_gpu_second_halala, api_key,
       claimable_earnings_halala, total_jobs, total_earnings
     ) VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
    overrides.name || 'DC1 Test Node',
    email,
    overrides.gpuCount ?? 1,
    overrides.ratePerGpuSecond ?? RATE_PER_GPU_SECOND,
    overrides.apiKey || `pk-${crypto.randomBytes(8).toString('hex')}`,
  );
  return db.get('SELECT last_insert_rowid() AS id').id;
}

function insertRenter(overrides = {}) {
  const email = `renter-${crypto.randomBytes(4).toString('hex')}@dc1.test`;
  const apiKey = overrides.apiKey || `rk-${crypto.randomBytes(8).toString('hex')}`;
  db.run(
    `INSERT INTO renters (
       name, email, api_key, balance_halala, total_spent_halala, total_jobs, created_at
     ) VALUES (?, ?, ?, ?, 0, 0, ?)`,
    overrides.name || 'Test Renter',
    email,
    apiKey,
    overrides.balanceHalala ?? 0,
    new Date().toISOString(),
  );
  const id = db.get('SELECT last_insert_rowid() AS id').id;
  return { id, apiKey };
}

function insertEscrowHold({
  jobId,
  providerId,
  renterApiKey,
  amountHalala,
  status = 'held',
}) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO escrow_holds (
       id, renter_api_key, provider_id, job_id, amount_halala, status, created_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    `esc-${jobId}`,
    renterApiKey,
    providerId,
    jobId,
    amountHalala,
    status,
    now,
    new Date(Date.now() + 3_600_000).toISOString(),
  );
}

function insertRunningPod({
  providerId,
  renterId,
  prepaid = 120,
  elapsedSeconds = 3600,
  jobId = `pod-${crypto.randomBytes(4).toString('hex')}`,
  timeoutOverdueSeconds = 60,
} = {}) {
  const nowMs = Date.now();
  const startedAt = new Date(nowMs - elapsedSeconds * 1000).toISOString();
  const timeoutAt = new Date(nowMs - timeoutOverdueSeconds * 1000).toISOString();

  db.run(
    `INSERT INTO jobs (
       job_id, provider_id, renter_id, job_type, status,
       cost_halala, max_duration_seconds, started_at, submitted_at, created_at,
       timeout_at, duration_minutes
     ) VALUES (?, ?, ?, 'interactive_pod', 'running', ?, ?, ?, ?, ?, ?, ?)`,
    jobId,
    providerId,
    renterId,
    prepaid,
    elapsedSeconds,
    startedAt,
    startedAt,
    startedAt,
    timeoutAt,
    Math.max(1, Math.ceil(elapsedSeconds / 60)),
  );

  return db.get('SELECT * FROM jobs WHERE job_id = ?', jobId);
}

function insertPendingPod({
  providerId,
  renterId,
  prepaid = 500,
  jobId = `pod-${crypto.randomBytes(4).toString('hex')}`,
  status = 'pending',
} = {}) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO jobs (
       job_id, provider_id, renter_id, job_type, status,
       cost_halala, max_duration_seconds, submitted_at, created_at, duration_minutes
     ) VALUES (?, ?, ?, 'interactive_pod', ?, ?, 3600, ?, ?, 60)`,
    jobId,
    providerId,
    renterId,
    status,
    prepaid,
    now,
    now,
  );
  return db.get('SELECT * FROM jobs WHERE job_id = ?', jobId);
}

function insertTimedOutInferenceJob({
  providerId,
  renterId,
  prepaid = 90,
  jobId = `job-${crypto.randomBytes(4).toString('hex')}`,
  status = 'assigned',
} = {}) {
  const now = new Date().toISOString();
  const timeoutAt = new Date(Date.now() - 120_000).toISOString();
  db.run(
    `INSERT INTO jobs (
       job_id, provider_id, renter_id, job_type, status,
       cost_halala, max_duration_seconds, submitted_at, created_at, timeout_at, duration_minutes
     ) VALUES (?, ?, ?, 'llm_inference', ?, ?, 300, ?, ?, ?, 5)`,
    jobId,
    providerId,
    renterId,
    status,
    prepaid,
    now,
    now,
    timeoutAt,
  );
  return db.get('SELECT * FROM jobs WHERE job_id = ?', jobId);
}

function expected7525(totalHalala) {
  const provider = Math.floor(totalHalala * 0.75);
  return { provider, dc1: totalHalala - provider };
}

function computeActualPodCost({ prepaid, elapsedSeconds, ratePerGpuSecond = RATE_PER_GPU_SECOND, gpuCount = 1 }) {
  const rawCost = Math.ceil(elapsedSeconds * ratePerGpuSecond * gpuCount);
  return Math.min(prepaid, Math.max(0, rawCost));
}

module.exports = {
  RATE_PER_GPU_SECOND,
  cleanSettlementTables,
  insertProvider,
  insertRenter,
  insertEscrowHold,
  insertRunningPod,
  insertPendingPod,
  insertTimedOutInferenceJob,
  expected7525,
  computeActualPodCost,
  db,
};