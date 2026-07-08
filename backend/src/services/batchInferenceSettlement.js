'use strict';

const {
  updateBatchInferenceJobLineSettlement,
} = require('./batchInferenceJobs');

class BatchInferenceSettlementError extends Error {
  constructor(message, { code = 'batch_inference_settlement_error', details = undefined } = {}) {
    super(message);
    this.name = 'BatchInferenceSettlementError';
    this.code = code;
    this.details = details;
  }
}

function buildBatchLineSettlementRequestId(batch, line) {
  return `batch-line:${batch.batch_id}:${line.custom_id}`;
}

function settleBatchInferenceLines(db, batch, lines, options = {}) {
  if (!batch || typeof batch !== 'object') {
    throw new BatchInferenceSettlementError('batch is required for settlement', {
      code: 'batch_required',
    });
  }
  if (!Array.isArray(lines)) {
    throw new BatchInferenceSettlementError('batch lines are required for settlement', {
      code: 'batch_lines_required',
    });
  }

  const billingService = options.settleInferenceOnce && options.checkBalanceGate
    ? null
    : require('./billingService');
  const settleInferenceOnce = options.settleInferenceOnce || billingService.settleInferenceOnce;
  const checkBalanceGate = options.checkBalanceGate || billingService.checkBalanceGate;
  if (typeof settleInferenceOnce !== 'function') {
    throw new BatchInferenceSettlementError('settleInferenceOnce dependency is required', {
      code: 'settlement_dependency_missing',
    });
  }
  if (typeof checkBalanceGate !== 'function') {
    throw new BatchInferenceSettlementError('checkBalanceGate dependency is required', {
      code: 'settlement_dependency_missing',
    });
  }

  const summary = {
    attempted: 0,
    settled: 0,
    already_settled: 0,
    not_required: 0,
    failed: 0,
    total_cost_halala: 0,
  };

  const succeeded = lines.filter((line) => line && line.status === 'succeeded');
  const billable = succeeded.filter((line) => normalizeCost(line.cost_halala) > 0);
  const notRequired = lines.filter((line) => !line || line.status !== 'succeeded' || normalizeCost(line.cost_halala) === 0);

  notRequired.forEach((line) => {
    if (!line || !line.custom_id) return;
    updateBatchInferenceJobLineSettlement(db, batch.renter_id, batch.batch_id, line.custom_id, 'not_required');
    summary.not_required += 1;
  });

  summary.total_cost_halala = billable.reduce((sum, line) => sum + normalizeCost(line.cost_halala), 0);
  if (billable.length === 0) return summary;

  const gate = checkBalanceGate(db, batch.renter_id, summary.total_cost_halala);
  if (!gate || gate.ok !== true) {
    const deficit = gate && Number.isFinite(Number(gate.deficitHalala))
      ? Number(gate.deficitHalala)
      : summary.total_cost_halala;
    billable.forEach((line) => {
      updateBatchInferenceJobLineSettlement(db, batch.renter_id, batch.batch_id, line.custom_id, 'failed', {
        settlement_request_id: buildBatchLineSettlementRequestId(batch, line),
        provider_id: line.provider_id || options.providerId || null,
        error_code: 'insufficient_balance',
        error_message: `Batch settlement preflight failed with ${deficit} halala deficit`,
      });
    });
    summary.failed += billable.length;
    throw new BatchInferenceSettlementError('batch line settlement preflight failed: insufficient balance', {
      code: 'insufficient_balance',
      details: {
        renter_id: batch.renter_id,
        batch_id: batch.batch_id,
        total_cost_halala: summary.total_cost_halala,
        deficit_halala: deficit,
      },
    });
  }

  for (const line of billable) {
    const requestId = buildBatchLineSettlementRequestId(batch, line);
    const providerId = line.provider_id || options.providerId || null;
    summary.attempted += 1;
    try {
      const result = settleInferenceOnce(db, {
        requestId,
        renterId: batch.renter_id,
        providerId,
        costHalala: normalizeCost(line.cost_halala),
        modelId: line.model_id,
        usageEventRow: {
          promptTokens: line.usage?.prompt_tokens || 0,
          completionTokens: line.usage?.completion_tokens || 0,
          promptCostHalala: 0,
          completionCostHalala: normalizeCost(line.cost_halala),
          inRateHalalaPer1m: 0,
          outRateHalalaPer1m: 0,
          source: 'batch/inference',
        },
        jobRow: {
          jobId: requestId,
          notes: 'batch:billingService.settleInferenceOnce',
        },
      });
      const settlementStatus = result?.status === 'already_settled' ? 'already_settled' : 'settled';
      updateBatchInferenceJobLineSettlement(db, batch.renter_id, batch.batch_id, line.custom_id, settlementStatus, {
        settlement_request_id: requestId,
        provider_id: providerId,
      });
      if (settlementStatus === 'already_settled') summary.already_settled += 1;
      else summary.settled += 1;
    } catch (error) {
      summary.failed += 1;
      updateBatchInferenceJobLineSettlement(db, batch.renter_id, batch.batch_id, line.custom_id, 'failed', {
        settlement_request_id: requestId,
        provider_id: providerId,
        error_code: normalizeErrorCode(error),
        error_message: String(error && error.message ? error.message : error).slice(0, 500),
      });
      throw new BatchInferenceSettlementError('batch line settlement failed', {
        code: normalizeErrorCode(error),
        details: {
          renter_id: batch.renter_id,
          batch_id: batch.batch_id,
          custom_id: line.custom_id,
          request_id: requestId,
        },
      });
    }
  }

  return summary;
}

function normalizeCost(value) {
  const cost = Number(value);
  if (!Number.isInteger(cost) || cost < 0) return 0;
  return cost;
}

function normalizeErrorCode(error) {
  const code = String(error && (error.code || error.name) ? (error.code || error.name) : 'settlement_failed')
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .slice(0, 120);
  return code || 'settlement_failed';
}

module.exports = {
  BatchInferenceSettlementError,
  buildBatchLineSettlementRequestId,
  settleBatchInferenceLines,
  __test: {
    normalizeCost,
    normalizeErrorCode,
  },
};
