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
      request_id: 'batch_linesok:ok-1',
      provider_response_id: 'resp-ok-1',
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
