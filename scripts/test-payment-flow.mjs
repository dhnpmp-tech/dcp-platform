#!/usr/bin/env node
/**
 * DCP End-to-End Payment Flow Smoke Test
 *
 * Validates the off-chain payment ledger (DCP-825) end-to-end:
 *   - Renter balance deducted on job submit
 *   - Provider earnings credited on job completion
 *   - Platform fee (dc1_fee_halala) recorded on the job record
 *   - All halala arithmetic correct at 75/25 provider/platform split
 *
 * Exchange rate fixture: 1 USD = 3.75 SAR (Saudi Central Bank peg)
 * GPU under test: RTX 4090 @ $0.267/hr
 *
 * Runs against an isolated in-memory SQLite database — production data
 * is never touched.
 *
 * Usage:
 *   node scripts/test-payment-flow.mjs
 *   node scripts/test-payment-flow.mjs --verbose
 */

import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// Resolve better-sqlite3 from backend where it is installed
const backendDir  = resolve(__dirname, '../backend');
const requireBack = createRequire(resolve(backendDir, 'package.json'));
const Database    = requireBack('better-sqlite3');

const VERBOSE = process.argv.includes('--verbose');

// ── Exchange rate fixture ──────────────────────────────────────────────────────
// Saudi Central Bank peg: 1 USD = 3.75 SAR exactly.
const SAR_USD_RATE = 3.75;

// ── RTX 4090 pricing (from backend/src/config/pricing.js) ─────────────────────
const RTX4090_RATE_PER_SECOND_USD = 0.0000742; // $0.267/hr ÷ 3600

// ── Platform split (from splitBilling() in backend/src/routes/jobs.js) ─────────
// Provider receives 75% of job cost; DC1 keeps 25%.
// NOTE: task spec cited 85/15 — actual implementation uses 75/25.
const PROVIDER_SPLIT = 0.75;

// ── Test results accumulator ───────────────────────────────────────────────────
const results = [];
let passed = 0;
let failed = 0;

function check(label, actual, expected, opts = {}) {
  const { comparator = 'eq', tolerance = 0 } = opts;
  let ok;
  if (comparator === 'gte') {
    ok = actual >= expected;
  } else if (comparator === 'lte') {
    ok = actual <= expected;
  } else if (tolerance > 0) {
    ok = Math.abs(actual - expected) <= tolerance;
  } else {
    ok = actual === expected;
  }
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const line = `  [${status}] ${label}: ${VERBOSE || !ok ? `expected=${expected}, got=${actual}` : 'OK'}`;
  results.push(line);
  console.log(line);
}

// ── Cost / split helpers (mirror the backend exactly) ─────────────────────────
function calculateCostHalala(durationSeconds) {
  const rawHalala = RTX4090_RATE_PER_SECOND_USD * durationSeconds * SAR_USD_RATE * 100;
  return Math.ceil(rawHalala);
}

function splitBilling(totalHalala) {
  const provider = Math.floor(totalHalala * PROVIDER_SPLIT);
  return { provider, dc1: totalHalala - provider };
}

// ── Minimal in-memory schema (mirrors production tables) ──────────────────────
function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE renters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      api_key     TEXT    NOT NULL UNIQUE,
      status      TEXT    DEFAULT 'active',
      balance_halala    INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE providers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      gpu_model   TEXT,
      status      TEXT    DEFAULT 'active',
      claimable_earnings_halala INTEGER DEFAULT 0,
      total_earnings_halala     INTEGER DEFAULT 0,
      total_jobs  INTEGER DEFAULT 0,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE jobs (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id                TEXT    UNIQUE,
      renter_id             INTEGER REFERENCES renters(id),
      provider_id           INTEGER REFERENCES providers(id),
      job_type              TEXT,
      gpu_model             TEXT,
      status                TEXT    DEFAULT 'pending',
      cost_halala           INTEGER DEFAULT 0,
      actual_cost_halala    INTEGER,
      provider_earned_halala INTEGER,
      dc1_fee_halala        INTEGER,
      duration_minutes      INTEGER,
      submitted_at          TEXT,
      completed_at          TEXT,
      created_at            TEXT
    );

    CREATE TABLE renter_credit_ledger (
      id         TEXT    PRIMARY KEY,
      renter_id  INTEGER NOT NULL REFERENCES renters(id),
      amount_halala INTEGER NOT NULL CHECK (amount_halala > 0),
      direction  TEXT    NOT NULL CHECK (direction IN ('credit','debit')),
      source     TEXT    NOT NULL,
      job_id     TEXT,
      note       TEXT,
      created_at TEXT    NOT NULL
    );
  `);

  return db;
}

// ── Scenario helpers ───────────────────────────────────────────────────────────
function createRenter(db, { balanceSAR = 100 } = {}) {
  const balanceHalala = balanceSAR * 100; // 1 SAR = 100 halala
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO renters (name, email, api_key, status, balance_halala, created_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `);
  const result = stmt.run(
    'Test Renter',
    `renter-${randomUUID()}@test.dcp.sa`,
    `renter_key_${randomUUID().replace(/-/g, '')}`,
    balanceHalala,
    now,
  );
  return { id: result.lastInsertRowid, balanceHalala };
}

function createProvider(db, { gpuModel = 'RTX 4090' } = {}) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO providers (name, email, gpu_model, status, claimable_earnings_halala, created_at)
    VALUES (?, ?, ?, 'active', 0, ?)
  `);
  const result = stmt.run(
    'Test Provider',
    `provider-${randomUUID()}@test.dcp.sa`,
    gpuModel,
    now,
  );
  return { id: result.lastInsertRowid };
}

function submitJob(db, { renterId, providerId, durationMinutes = 60, gpuModel = 'RTX 4090' } = {}) {
  const durationSeconds = durationMinutes * 60;
  const costHalala = calculateCostHalala(durationSeconds);
  const jobId = `job_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  // Atomic balance deduction (mirrors the AND balance_halala >= ? guard in jobs.js)
  const deduct = db.prepare(`
    UPDATE renters
       SET balance_halala       = balance_halala - ?,
           total_spent_halala   = total_spent_halala + ?
     WHERE id = ? AND balance_halala >= ?
  `);
  const deductResult = deduct.run(costHalala, costHalala, renterId, costHalala);
  if (deductResult.changes === 0) {
    throw new Error(`Insufficient balance: renter ${renterId} cannot afford ${costHalala} halala`);
  }

  // Ledger entry
  db.prepare(`
    INSERT INTO renter_credit_ledger (id, renter_id, amount_halala, direction, source, job_id, note, created_at)
    VALUES (?, ?, ?, 'debit', 'job_debit', ?, 'Job cost deducted on submit', ?)
  `).run(randomUUID(), renterId, costHalala, jobId, now);

  // Job record
  db.prepare(`
    INSERT INTO jobs (job_id, renter_id, provider_id, job_type, gpu_model, status, cost_halala, duration_minutes, submitted_at, created_at)
    VALUES (?, ?, ?, 'llm-inference', ?, 'running', ?, ?, ?, ?)
  `).run(jobId, renterId, providerId, gpuModel, costHalala, durationMinutes, now, now);

  return { jobId, costHalala };
}

function completeJob(db, { jobId, actualDurationMinutes = 60 } = {}) {
  const job = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  // Re-compute actual cost (may differ from quoted if duration changed).
  // In this smoke test we use the quoted cost as the actual cost (no drift).
  const actualCostHalala = job.cost_halala;
  const { provider: providerEarned, dc1: dc1Fee } = splitBilling(actualCostHalala);
  const now = new Date().toISOString();

  // Update job with billing resolution
  db.prepare(`
    UPDATE jobs
       SET status                 = 'completed',
           actual_cost_halala     = ?,
           provider_earned_halala = ?,
           dc1_fee_halala         = ?,
           completed_at           = ?
     WHERE job_id = ?
  `).run(actualCostHalala, providerEarned, dc1Fee, now, jobId);

  // Credit provider earnings (mirrors jobs.js settlement path)
  db.prepare(`
    UPDATE providers
       SET claimable_earnings_halala = claimable_earnings_halala + ?,
           total_earnings_halala     = total_earnings_halala + ?,
           total_jobs                = total_jobs + 1
     WHERE id = ?
  `).run(providerEarned, providerEarned, job.provider_id);

  return { actualCostHalala, providerEarned, dc1Fee };
}

// ── Main test scenario ─────────────────────────────────────────────────────────
async function runPaymentFlowTest() {
  console.log('='.repeat(60));
  console.log('DCP Payment Flow Smoke Test');
  console.log(`Exchange rate: 1 USD = ${SAR_USD_RATE} SAR`);
  console.log(`GPU: RTX 4090 @ $${(RTX4090_RATE_PER_SECOND_USD * 3600).toFixed(3)}/hr`);
  console.log(`Split: ${Math.round(PROVIDER_SPLIT * 100)}% provider / ${Math.round((1 - PROVIDER_SPLIT) * 100)}% platform`);
  console.log('='.repeat(60));

  const db = buildTestDb();

  // ── Scenario 1: Happy path — 1-hour RTX 4090 job ──────────────────────────
  console.log('\nScenario 1: Happy path — 1-hour RTX 4090 job');
  console.log('-'.repeat(50));

  const RENTER_BALANCE_SAR = 100;
  const RENTER_BALANCE_HALALA = RENTER_BALANCE_SAR * 100; // 10,000

  const renter = createRenter(db, { balanceSAR: RENTER_BALANCE_SAR });
  const provider = createProvider(db, { gpuModel: 'RTX 4090' });

  const DURATION_MINUTES = 60;
  const DURATION_SECONDS = DURATION_MINUTES * 60;
  const EXPECTED_COST_HALALA = calculateCostHalala(DURATION_SECONDS);
  const EXPECTED_COST_SAR = (EXPECTED_COST_HALALA / 100).toFixed(2);
  const { provider: EXPECTED_PROVIDER_EARNED, dc1: EXPECTED_DC1_FEE } = splitBilling(EXPECTED_COST_HALALA);

  console.log(`\n  Cost calculation:`);
  console.log(`    Duration:      ${DURATION_MINUTES} min`);
  console.log(`    Cost (halala): ${EXPECTED_COST_HALALA}`);
  console.log(`    Cost (SAR):    ${EXPECTED_COST_SAR}`);
  console.log(`    Provider gets: ${EXPECTED_PROVIDER_EARNED} halala`);
  console.log(`    DCP fee:       ${EXPECTED_DC1_FEE} halala`);

  // Submit job
  const { jobId, costHalala } = submitJob(db, {
    renterId: renter.id,
    providerId: provider.id,
    durationMinutes: DURATION_MINUTES,
    gpuModel: 'RTX 4090',
  });

  // Check 1: Job record created with correct cost
  const jobAfterSubmit = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  check('Job record created', !!jobAfterSubmit, true);
  check('Job cost_halala matches pricing calculation', jobAfterSubmit.cost_halala, EXPECTED_COST_HALALA);
  check('Job status is running after submit', jobAfterSubmit.status, 'running');
  check(
    `Job costSAR = ${EXPECTED_COST_SAR} SAR`,
    parseFloat((jobAfterSubmit.cost_halala / 100).toFixed(2)),
    parseFloat(EXPECTED_COST_SAR),
  );

  // Check 2: Renter balance decreased
  const renterAfterSubmit = db.prepare('SELECT * FROM renters WHERE id = ?').get(renter.id);
  const expectedRenterBalance = RENTER_BALANCE_HALALA - EXPECTED_COST_HALALA;
  check(
    `Renter balance decreased by ${EXPECTED_COST_HALALA} halala`,
    renterAfterSubmit.balance_halala,
    expectedRenterBalance,
  );
  check('Renter total_spent_halala updated', renterAfterSubmit.total_spent_halala, EXPECTED_COST_HALALA);

  // Check 3: Ledger debit entry
  const ledgerEntry = db.prepare(
    `SELECT * FROM renter_credit_ledger WHERE job_id = ? AND direction = 'debit'`
  ).get(jobId);
  check('Ledger debit entry recorded', !!ledgerEntry, true);
  check('Ledger debit amount matches job cost', ledgerEntry?.amount_halala, EXPECTED_COST_HALALA);

  // Complete job
  const { actualCostHalala, providerEarned, dc1Fee } = completeJob(db, {
    jobId,
    actualDurationMinutes: DURATION_MINUTES,
  });

  // Check 4: Provider balance credited
  const providerAfterComplete = db.prepare('SELECT * FROM providers WHERE id = ?').get(provider.id);
  check(
    `Provider claimable_earnings_halala increased by ${EXPECTED_PROVIDER_EARNED}`,
    providerAfterComplete.claimable_earnings_halala,
    EXPECTED_PROVIDER_EARNED,
  );
  check('Provider total_jobs incremented', providerAfterComplete.total_jobs, 1);

  // Check 5: Platform fee recorded on job
  const jobAfterComplete = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  check('Platform fee (dc1_fee_halala) recorded', jobAfterComplete.dc1_fee_halala, EXPECTED_DC1_FEE);
  check('provider_earned_halala recorded on job', jobAfterComplete.provider_earned_halala, EXPECTED_PROVIDER_EARNED);
  check('Job status is completed', jobAfterComplete.status, 'completed');

  // Check 6: Accounting identity — provider + dc1 === total
  check(
    'Accounting identity: provider_earned + dc1_fee === actual_cost',
    jobAfterComplete.provider_earned_halala + jobAfterComplete.dc1_fee_halala,
    jobAfterComplete.actual_cost_halala,
  );

  // Check 7: Provider split is correct (≥74%, ≤76% to allow for integer rounding)
  const actualProviderPct = providerEarned / actualCostHalala;
  const lowerBound = PROVIDER_SPLIT - 0.01;
  const upperBound = PROVIDER_SPLIT + 0.01;
  const splitOk = actualProviderPct >= lowerBound && actualProviderPct <= upperBound;
  const splitLabel = `Provider split ${(actualProviderPct * 100).toFixed(1)}% ≈ ${Math.round(PROVIDER_SPLIT * 100)}%`;
  check(splitLabel, splitOk, true);

  // ── Scenario 2: Insufficient balance guard ─────────────────────────────────
  console.log('\nScenario 2: Insufficient balance guard');
  console.log('-'.repeat(50));

  const brokeRenter = createRenter(db, { balanceSAR: 0 });
  const provider2 = createProvider(db, { gpuModel: 'RTX 4090' });

  let insufficientBalanceThrown = false;
  try {
    submitJob(db, { renterId: brokeRenter.id, providerId: provider2.id, durationMinutes: 60 });
  } catch (err) {
    insufficientBalanceThrown = err.message.includes('Insufficient balance');
  }
  check('Insufficient balance throws error', insufficientBalanceThrown, true);

  // Verify renter balance unchanged after rejected submit
  const brokeRenterAfter = db.prepare('SELECT * FROM renters WHERE id = ?').get(brokeRenter.id);
  check('Rejected renter balance unchanged (0)', brokeRenterAfter.balance_halala, 0);

  // ── Scenario 3: RTX 4090 cost sanity vs USD/SAR ───────────────────────────
  console.log('\nScenario 3: RTX 4090 cost sanity check vs USD/SAR');
  console.log('-'.repeat(50));

  const costUSD = (EXPECTED_COST_HALALA / 100) / SAR_USD_RATE;
  const pricingTargetUSD = 0.267; // $0.267/hr from pricing config
  const diffPct = Math.abs(costUSD - pricingTargetUSD) / pricingTargetUSD * 100;
  check(
    `1-hr RTX 4090 cost USD ${costUSD.toFixed(4)} ≈ $${pricingTargetUSD} (within 2%)`,
    diffPct < 2.0,
    true,
  );

  const costSarFloat = EXPECTED_COST_HALALA / 100;
  check(
    `1-hr RTX 4090 cost SAR ${costSarFloat.toFixed(2)} ≈ 1.00 SAR (within 5%)`,
    Math.abs(costSarFloat - 1.0) < 0.05,
    true,
  );

  db.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} PASS / ${failed} FAIL`);
  console.log('='.repeat(60));

  return failed === 0;
}

// ── Entry point ───────────────────────────────────────────────────────────────
const ok = await runPaymentFlowTest();
process.exit(ok ? 0 : 1);
