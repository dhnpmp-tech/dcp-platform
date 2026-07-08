'use strict';

const Database = require('better-sqlite3');
const {
  createBatchInferenceJob,
  ensureBatchInferenceJobSchema,
  getBatchInferenceJob,
  getBatchInferenceJobLine,
} = require('../services/batchInferenceJobs');
const {
  buildBatchResultStorageKey,
  runBatchInferenceWorkerOnce,
} = require('../workers/batchInferenceWorker');

function makeDb() {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      balance_halala INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  raw.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, created_at)
    VALUES (1, 'Renter One', 'one@example.com', 'rk-one', 'active', ?),
           (2, 'Renter Two', 'two@example.com', 'rk-two', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureBatchInferenceJobSchema(raw);
  return raw;
}

function ensureSettlementSchema(db) {
  db.exec(`
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      claimable_earnings_halala INTEGER DEFAULT 0,
      total_earnings REAL DEFAULT 0,
      total_earnings_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0
    );
    INSERT INTO providers (id, claimable_earnings_halala, total_earnings, total_earnings_halala, total_jobs)
    VALUES (7, 0, 0, 0, 0);

    CREATE TABLE subscription_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER,
      renter_id INTEGER NOT NULL,
      granted_at TEXT,
      amount_halala INTEGER NOT NULL,
      consumed_halala INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      source TEXT,
      created_at TEXT
    );

    CREATE TABLE billing_attempts (
      request_id TEXT PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      provider_id INTEGER,
      cost_halala INTEGER NOT NULL,
      provider_earned_halala INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT,
      settled_at TEXT NOT NULL
    );

    CREATE TABLE usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      renter_id INTEGER NOT NULL,
      provider_id INTEGER,
      job_id TEXT,
      model_id TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      prompt_cost_halala INTEGER NOT NULL DEFAULT 0,
      completion_cost_halala INTEGER NOT NULL DEFAULT 0,
      cost_halala INTEGER NOT NULL DEFAULT 0,
      provider_payout_halala INTEGER NOT NULL DEFAULT 0,
      dcp_take_halala INTEGER NOT NULL DEFAULT 0,
      price_in_halala_per_1m_tok INTEGER,
      price_out_halala_per_1m_tok INTEGER,
      occurred_at TEXT NOT NULL,
      request_id TEXT,
      source TEXT,
      settlement_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE UNIQUE INDEX idx_usage_events_request_id
      ON usage_events (request_id)
      WHERE request_id IS NOT NULL;

    CREATE TABLE jobs (
      job_id TEXT PRIMARY KEY,
      provider_id INTEGER,
      renter_id INTEGER,
      job_type TEXT,
      model TEXT,
      status TEXT,
      submitted_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_minutes INTEGER,
      duration_seconds INTEGER,
      cost_halala INTEGER,
      actual_cost_halala INTEGER,
      provider_earned_halala INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      result TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      priority INTEGER
    );
  `);
}

function jsonl(customId = 'req-1') {
  return JSON.stringify({
    custom_id: customId,
    method: 'POST',
    url: '/v1/complete',
    body: {
      model: 'mistral',
      prompt: 'hello',
    },
  });
}

describe('batch inference worker scaffold', () => {
  test('stays disabled by default and does not mutate created jobs', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_disabled1',
      input_jsonl: jsonl(),
    });

    const result = await runBatchInferenceWorkerOnce(db);
    expect(result).toMatchObject({
      enabled: false,
      scanned: 0,
      processed: 0,
      completed: 0,
      failed: 0,
    });

    expect(getBatchInferenceJob(db, 1, 'batch_disabled1')).toMatchObject({
      status: 'created',
      result_storage_key: null,
    });
  });

  test('does not mutate jobs when enabled without an executor', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_noexec01',
      input_jsonl: jsonl(),
    });

    const result = await runBatchInferenceWorkerOnce(db, { enabled: true });
    expect(result.note).toMatch(/no executor/);
    expect(getBatchInferenceJob(db, 1, 'batch_noexec01').status).toBe('created');
  });

  test('completes created batches with an injected executor and result artifact path', async () => {
    const db = makeDb();
    const created = createBatchInferenceJob(db, 2, {
      batch_id: 'batch_execute1',
      input_jsonl: jsonl(),
    }).batch;

    expect(buildBatchResultStorageKey(created)).toBe('batch-results/renter-2/batch_execute1/output.jsonl');

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      limit: 10,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: 'c'.repeat(64),
        result_normalized_bytes: 512,
        completed_count: batch.request_count,
        failed_count: 0,
        total_cost_halala: 12,
      }),
    });

    expect(result).toMatchObject({
      enabled: true,
      scanned: 1,
      processed: 1,
      completed: 1,
      failed: 0,
    });
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_execute1',
      status: 'completed',
      result_storage_key: 'batch-results/renter-2/batch_execute1/output.jsonl',
      result_checksum_sha256: 'c'.repeat(64),
    });
    expect(getBatchInferenceJob(db, 2, 'batch_execute1')).toMatchObject({
      status: 'completed',
      result_checksum_sha256: 'c'.repeat(64),
      result_normalized_bytes: 512,
      completed_count: 1,
      failed_count: 0,
      total_cost_halala: 12,
      results_available: true,
    });
  });

  test('applies per-line execution proof and derives aggregate counts', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_linesok',
      input_jsonl: [jsonl('ok-1'), jsonl('fail-1')].join('\n'),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: 'd'.repeat(64),
        result_normalized_bytes: 2048,
        lines: [
          {
            custom_id: 'ok-1',
            status_code: 200,
            response_checksum_sha256: 'e'.repeat(64),
            response_normalized_bytes: 512,
            usage: {
              prompt_tokens: 12,
              completion_tokens: 5,
            },
            cost_halala: 4,
            provider_id: 7,
            request_id: 'batch_linesok:ok-1',
            provider_response_id: 'resp-ok-1',
          },
          {
            custom_id: 'fail-1',
            status_code: 503,
            error_code: 'provider_unavailable',
            error_message: 'No provider capacity',
            cost_halala: 0,
            request_id: 'batch_linesok:fail-1',
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_linesok',
      status: 'completed',
      line_proof_applied: true,
    });
    expect(getBatchInferenceJob(db, 1, 'batch_linesok')).toMatchObject({
      status: 'completed',
      completed_count: 1,
      failed_count: 1,
      total_cost_halala: 4,
      results_available: true,
    });
    expect(getBatchInferenceJobLine(db, 1, 'batch_linesok', 'ok-1')).toMatchObject({
      status: 'succeeded',
      status_code: 200,
      response_checksum_sha256: 'e'.repeat(64),
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
      },
      cost_halala: 4,
      provider_id: 7,
      request_id: 'batch_linesok:ok-1',
      provider_response_id: 'resp-ok-1',
      settlement_status: 'unsettled',
    });
    expect(getBatchInferenceJobLine(db, 1, 'batch_linesok', 'fail-1')).toMatchObject({
      status: 'failed',
      status_code: 503,
      error_code: 'provider_unavailable',
      error_message: 'No provider capacity',
      cost_halala: 0,
    });
  });

  test('fails the batch when per-line execution proof is incomplete', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_linesbad',
      input_jsonl: [jsonl('line-a'), jsonl('line-b')].join('\n'),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: 'f'.repeat(64),
        result_normalized_bytes: 1024,
        lines: [
          {
            custom_id: 'line-a',
            status_code: 200,
            response_checksum_sha256: 'a'.repeat(64),
          },
        ],
      }),
    });

    expect(result.failed).toBe(1);
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_linesbad',
      status: 'failed',
      error: 'execution.lines must include exactly 2 line result(s)',
    });
    expect(getBatchInferenceJob(db, 1, 'batch_linesbad')).toMatchObject({
      status: 'failed',
      completed_count: 0,
      failed_count: 2,
      results_available: false,
    });
    expect(getBatchInferenceJobLine(db, 1, 'batch_linesbad', 'line-a')).toMatchObject({
      status: 'pending',
    });
  });

  test('settles succeeded line proof through the billing service when settlement is enabled', async () => {
    const db = makeDb();
    ensureSettlementSchema(db);
    db.prepare('UPDATE renters SET balance_halala = 100 WHERE id = 1').run();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_settleok',
      input_jsonl: jsonl('bill-1'),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      settlementEnabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: '8'.repeat(64),
        result_normalized_bytes: 1024,
        lines: [
          {
            custom_id: 'bill-1',
            status_code: 200,
            response_checksum_sha256: '9'.repeat(64),
            response_normalized_bytes: 512,
            provider_id: 7,
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
            },
            cost_halala: 9,
            request_id: 'batch_settleok:bill-1',
            provider_response_id: 'resp-bill-1',
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_settleok',
      status: 'completed',
      line_proof_applied: true,
      settlement_applied: true,
      settlement_summary: {
        attempted: 1,
        settled: 1,
        total_cost_halala: 9,
      },
    });

    expect(getBatchInferenceJobLine(db, 1, 'batch_settleok', 'bill-1')).toMatchObject({
      status: 'succeeded',
      provider_id: 7,
      cost_halala: 9,
      settlement_status: 'settled',
      settlement_request_id: 'batch-line:batch_settleok:bill-1',
    });
    expect(db.prepare('SELECT balance_halala, total_spent_halala, total_jobs FROM renters WHERE id = 1').get()).toMatchObject({
      balance_halala: 91,
      total_spent_halala: 9,
      total_jobs: 1,
    });
    expect(db.prepare('SELECT cost_halala, provider_earned_halala, status FROM billing_attempts WHERE request_id = ?').get('batch-line:batch_settleok:bill-1')).toMatchObject({
      cost_halala: 9,
      provider_earned_halala: 6,
      status: 'settled',
    });
    expect(db.prepare('SELECT source, settlement_status, cost_halala FROM usage_events WHERE request_id = ?').get('batch-line:batch_settleok:bill-1')).toMatchObject({
      source: 'batch/inference',
      settlement_status: 'settled',
      cost_halala: 9,
    });
  });

  test('fails before debiting when settlement preflight cannot cover all succeeded lines', async () => {
    const db = makeDb();
    ensureSettlementSchema(db);
    db.prepare('UPDATE renters SET balance_halala = 5 WHERE id = 1').run();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_shortbal',
      input_jsonl: jsonl('bill-1'),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      settlementEnabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        result_checksum_sha256: '7'.repeat(64),
        result_normalized_bytes: 1024,
        lines: [
          {
            custom_id: 'bill-1',
            status_code: 200,
            response_checksum_sha256: '6'.repeat(64),
            provider_id: 7,
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
            },
            cost_halala: 9,
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      completed: 0,
      failed: 1,
    });
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_shortbal',
      status: 'failed',
      error: 'batch line settlement preflight failed: insufficient balance',
    });
    expect(getBatchInferenceJobLine(db, 1, 'batch_shortbal', 'bill-1')).toMatchObject({
      status: 'succeeded',
      settlement_status: 'failed',
      settlement_error_code: 'insufficient_balance',
    });
    expect(db.prepare('SELECT balance_halala, total_spent_halala, total_jobs FROM renters WHERE id = 1').get()).toMatchObject({
      balance_halala: 5,
      total_spent_halala: 0,
      total_jobs: 0,
    });
    expect(db.prepare('SELECT COUNT(*) AS c FROM billing_attempts').get().c).toBe(0);
  });

  test('marks a batch failed when completed result proof is missing', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_noproof1',
      input_jsonl: jsonl(),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
      }),
    });

    expect(result.failed).toBe(1);
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_noproof1',
      status: 'failed',
      error: 'result_checksum_sha256 must be a 64-character hex SHA-256 digest',
    });
    expect(getBatchInferenceJob(db, 1, 'batch_noproof1')).toMatchObject({
      status: 'failed',
      results_available: false,
      result_storage_key: null,
      result_checksum_sha256: null,
    });
  });

  test('does not mutate line proof when completed result checksum is missing', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_noprooflines',
      input_jsonl: jsonl('line-proof-1'),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async (batch) => ({
        result_storage_key: buildBatchResultStorageKey(batch),
        lines: [
          {
            custom_id: 'line-proof-1',
            status_code: 200,
            response_checksum_sha256: 'b'.repeat(64),
            cost_halala: 9,
          },
        ],
      }),
    });

    expect(result.failed).toBe(1);
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_noprooflines',
      status: 'failed',
      error: 'result_checksum_sha256 must be a 64-character hex SHA-256 digest',
    });
    expect(getBatchInferenceJobLine(db, 1, 'batch_noprooflines', 'line-proof-1')).toMatchObject({
      status: 'pending',
      cost_halala: 0,
    });
  });

  test('marks a batch failed when the injected executor throws', async () => {
    const db = makeDb();
    createBatchInferenceJob(db, 1, {
      batch_id: 'batch_fail001',
      input_jsonl: jsonl(),
    });

    const result = await runBatchInferenceWorkerOnce(db, {
      enabled: true,
      executor: async () => {
        throw new Error('executor unavailable');
      },
    });

    expect(result.failed).toBe(1);
    expect(result.batches[0]).toMatchObject({
      batch_id: 'batch_fail001',
      status: 'failed',
      error: 'executor unavailable',
    });
    expect(getBatchInferenceJob(db, 1, 'batch_fail001')).toMatchObject({
      status: 'failed',
      completed_count: 0,
      failed_count: 1,
      total_cost_halala: 0,
    });
  });
});
