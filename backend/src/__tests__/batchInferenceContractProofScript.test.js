'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runBatchInferenceContractProof,
} = require('../../tests/batch-inference-contract-proof');

describe('batch inference contract proof script', () => {
  test('writes a CI-safe proof report for batch gates and minimum-balance preflight', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-inference-proof-'));
    const report = await runBatchInferenceContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      runs_production_batch_execution: false,
      enables_batch_discounts: false,
      bills_without_balance_preflight: false,
      exposes_model_batch_capability: false,
      writes_result_objects: false,
    });
    expect(report.readiness).toMatchObject({
      current_mode: 'metadata_validation_only',
      public_execution_enabled: false,
      discounts_enabled: false,
      model_batch_capability_live: false,
      live_acceptance: {
        execution_discount_smoke: {
          status: 'blocked_external',
          command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
          live_acceptance_gate: 'batch_live_execution_discount_smoke',
        },
      },
    });
    expect(report.validation.replay).toMatchObject({
      idempotent_replay: true,
      batch_id: 'batch_contract1',
    });
    expect(report.primary_batch.disabled_worker.batch).toMatchObject({
      status: 'created',
      results_available: false,
    });
    expect(report.primary_batch.completed).toMatchObject({
      status: 'completed',
      completed_count: 1,
      failed_count: 1,
      total_cost_halala: 4,
      results_available: true,
    });
    expect(report.primary_batch.completed_lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        custom_id: 'chat-ok',
        status: 'succeeded',
        settlement_status: 'unsettled',
        cost_halala: 4,
      }),
      expect.objectContaining({
        custom_id: 'complete-fail',
        status: 'failed',
        cost_halala: 0,
      }),
    ]));
    expect(report.settlement_preflight).toMatchObject({
      settlement_calls: 0,
      batch: {
        status: 'failed',
      },
      line: {
        status: 'succeeded',
        settlement_status: 'failed',
        settlement_error_code: 'insufficient_balance',
      },
      renter_balance: {
        balance_halala: 5,
        total_spent_halala: 0,
        total_jobs: 0,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'readiness keeps public execution and discounts gated',
      'readiness names the blocked batch live execution and discount smoke gate',
      'invalid JSONL request is rejected before job creation',
      'idempotency key replays the existing batch',
      'line ledger preserves every input request without raw prompt output',
      'worker is disabled by default and does not mutate jobs',
      'injected executor must attach result checksum proof before completion',
      'line proof derives success, failure, usage, and cost totals',
      'minimum balance preflight blocks partial batch billing',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'batch-inference-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'batch-inference-contract-proof-latest.md'))).toBe(true);
  });
});
