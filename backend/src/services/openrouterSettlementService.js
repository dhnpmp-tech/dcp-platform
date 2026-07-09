'use strict';

const crypto = require('crypto');
const { toUsdStringFromHalala } = require('../lib/model-catalog-contract');

function nowIso() {
  return new Date().toISOString();
}

function toIsoOrDefault(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function toInt(value, { min = null, max = null } = {}) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toCanonicalUsdString(value, fallbackHalala = 0) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return toUsdStringFromHalala(fallbackHalala);
  return num.toFixed(6);
}

function recordOpenRouterUsage(db, {
  requestId = null,
  providerResponseId = null,
  jobId = null,
  requestPath = null,
  renterApiKeyId = null,
  renterKeyType = null,
  promptCostHalala = null,
  completionCostHalala = null,
  tokenRateHalala = null,
  usdPrompt = null,
  usdCompletion = null,
  usdTotal = null,
  renterId,
  providerId = null,
  model,
  source = 'v1',
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = null,
  costHalala,
  currency = 'SAR',
  settlementStatus = 'pending',
}) {
  const cleanRequestId = typeof requestId === 'string' ? requestId.trim().slice(0, 200) : '';
  const cleanProviderResponseId = typeof providerResponseId === 'string' ? providerResponseId.trim().slice(0, 200) : '';
  const cleanJobId = typeof jobId === 'string' ? jobId.trim().slice(0, 120) : '';
  const cleanRequestPath = typeof requestPath === 'string' ? requestPath.trim().slice(0, 160) : '';
  const cleanRenterApiKeyId = typeof renterApiKeyId === 'string' ? renterApiKeyId.trim().slice(0, 120) : '';
  const cleanRenterKeyType = renterKeyType === 'scoped_key' || renterKeyType === 'master_key'
    ? renterKeyType
    : null;
  const cleanTokenRateHalala = toInt(tokenRateHalala, { min: 0, max: 100_000_000_000 });
  const cleanRenterId = toInt(renterId, { min: 1 });
  const cleanProviderId = providerId == null ? null : toInt(providerId, { min: 1 });
  const cleanModel = typeof model === 'string' ? model.trim().slice(0, 200) : '';
  const cleanSource = typeof source === 'string' ? source.trim().slice(0, 80) : 'v1';
  const cleanPrompt = toInt(promptTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const cleanCompletion = toInt(completionTokens, { min: 0, max: 1_000_000_000 }) ?? 0;
  const cleanTotal = toInt(totalTokens, { min: 0, max: 1_000_000_000 }) ?? (cleanPrompt + cleanCompletion);
  const safeTokenRate = cleanTokenRateHalala ?? 0;
  const cleanPromptCost = toInt(promptCostHalala, { min: 0, max: 100_000_000_000 })
    ?? (cleanPrompt * safeTokenRate);
  const cleanCompletionCost = toInt(completionCostHalala, { min: 0, max: 100_000_000_000 })
    ?? (cleanCompletion * safeTokenRate);
  const cleanCost = toInt(costHalala, { min: 0, max: 100_000_000_000 })
    ?? (cleanPromptCost + cleanCompletionCost);
  const cleanUsdPrompt = toCanonicalUsdString(usdPrompt, cleanPromptCost);
  const cleanUsdCompletion = toCanonicalUsdString(usdCompletion, cleanCompletionCost);
  const cleanUsdTotal = toCanonicalUsdString(usdTotal, cleanCost);
  const cleanSettlementStatus = settlementStatus === 'failed'
    ? 'failed'
    : (settlementStatus === 'settled' ? 'settled' : 'pending');

  if (!cleanRenterId) throw new Error('renterId must be a positive integer');
  if (!cleanModel) throw new Error('model is required');
  if (cleanCost == null) throw new Error('costHalala must be an integer >= 0');

  const ledgerColumns = db.prepare(`PRAGMA table_info(openrouter_usage_ledger)`).all();
  const hasRequestId = ledgerColumns.some((col) => col?.name === 'request_id');
  const hasProviderResponseId = ledgerColumns.some((col) => col?.name === 'provider_response_id');
  const hasJobId = ledgerColumns.some((col) => col?.name === 'job_id');
  const hasRequestPath = ledgerColumns.some((col) => col?.name === 'request_path');
  const hasRenterApiKeyId = ledgerColumns.some((col) => col?.name === 'renter_api_key_id');
  const hasRenterKeyType = ledgerColumns.some((col) => col?.name === 'renter_key_type');
  const hasPromptCostHalala = ledgerColumns.some((col) => col?.name === 'prompt_cost_halala');
  const hasCompletionCostHalala = ledgerColumns.some((col) => col?.name === 'completion_cost_halala');
  const hasTokenRateHalala = ledgerColumns.some((col) => col?.name === 'token_rate_halala');
  const hasUsdPrompt = ledgerColumns.some((col) => col?.name === 'usd_prompt');
  const hasUsdCompletion = ledgerColumns.some((col) => col?.name === 'usd_completion');
  const hasUsdTotal = ledgerColumns.some((col) => col?.name === 'usd_total');

  if (cleanRequestId && hasRequestId) {
    const existing = db.prepare('SELECT * FROM openrouter_usage_ledger WHERE request_id = ? LIMIT 1').get(cleanRequestId);
    if (existing) return existing;
  }

  const id = `oru_${crypto.randomUUID()}`;
  const insertColumns = [
    'id', 'renter_id', 'provider_id', 'model', 'source',
    'prompt_tokens', 'completion_tokens', 'total_tokens',
    'cost_halala', 'currency', 'settlement_status', 'created_at',
  ];
  const insertValues = [
    id,
    cleanRenterId,
    cleanProviderId,
    cleanModel,
    cleanSource || 'v1',
    cleanPrompt,
    cleanCompletion,
    cleanTotal,
    cleanCost,
    currency || 'SAR',
    cleanSettlementStatus,
    nowIso(),
  ];
  if (hasRequestId) {
    insertColumns.push('request_id');
    insertValues.push(cleanRequestId || null);
  }
  if (hasProviderResponseId) {
    insertColumns.push('provider_response_id');
    insertValues.push(cleanProviderResponseId || null);
  }
  if (hasJobId) {
    insertColumns.push('job_id');
    insertValues.push(cleanJobId || null);
  }
  if (hasRequestPath) {
    insertColumns.push('request_path');
    insertValues.push(cleanRequestPath || null);
  }
  if (hasRenterApiKeyId) {
    insertColumns.push('renter_api_key_id');
    insertValues.push(cleanRenterApiKeyId || null);
  }
  if (hasRenterKeyType) {
    insertColumns.push('renter_key_type');
    insertValues.push(cleanRenterKeyType || null);
  }
  if (hasPromptCostHalala) {
    insertColumns.push('prompt_cost_halala');
    insertValues.push(cleanPromptCost);
  }
  if (hasCompletionCostHalala) {
    insertColumns.push('completion_cost_halala');
    insertValues.push(cleanCompletionCost);
  }
  if (hasTokenRateHalala) {
    insertColumns.push('token_rate_halala');
    insertValues.push(cleanTokenRateHalala);
  }
  if (hasUsdPrompt) {
    insertColumns.push('usd_prompt');
    insertValues.push(cleanUsdPrompt);
  }
  if (hasUsdCompletion) {
    insertColumns.push('usd_completion');
    insertValues.push(cleanUsdCompletion);
  }
  if (hasUsdTotal) {
    insertColumns.push('usd_total');
    insertValues.push(cleanUsdTotal);
  }
  const placeholders = insertColumns.map(() => '?').join(', ');

  try {
    db.prepare(
      `INSERT INTO openrouter_usage_ledger (${insertColumns.join(', ')})
       VALUES (${placeholders})`
    ).run(...insertValues);
  } catch (error) {
    if (
      cleanRequestId &&
      hasRequestId &&
      String(error?.message || '').includes('UNIQUE constraint failed: openrouter_usage_ledger.request_id')
    ) {
      const existing = db.prepare('SELECT * FROM openrouter_usage_ledger WHERE request_id = ? LIMIT 1').get(cleanRequestId);
      if (existing) return existing;
    }
    throw error;
  }

  return db.prepare('SELECT * FROM openrouter_usage_ledger WHERE id = ?').get(id);
}

function computeDryRunSummary(db, {
  periodStart,
  periodEnd,
  expectedTotalHalala = null,
}) {
  const since = toIsoOrDefault(periodStart, new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const until = toIsoOrDefault(periodEnd, nowIso());

  const usageRows = db.prepare(
    `SELECT id, renter_id, provider_id, cost_halala, model, prompt_tokens, completion_tokens, total_tokens, created_at
       FROM openrouter_usage_ledger
      WHERE settlement_status = 'pending'
        AND created_at >= ?
        AND created_at <= ?
      ORDER BY created_at ASC`
  ).all(since, until);

  const reconciledHalala = usageRows.reduce((sum, row) => sum + Number(row.cost_halala || 0), 0);
  const expectedHalala = toInt(expectedTotalHalala, { min: 0 }) ?? reconciledHalala;
  const discrepancyHalala = expectedHalala - reconciledHalala;

  const byRenter = db.prepare(
    `SELECT renter_id, SUM(cost_halala) AS total_halala, COUNT(*) AS usage_count
       FROM openrouter_usage_ledger
      WHERE settlement_status = 'pending'
        AND created_at >= ?
        AND created_at <= ?
      GROUP BY renter_id
      ORDER BY total_halala DESC`
  ).all(since, until);

  return {
    period_start: since,
    period_end: until,
    usage_count: usageRows.length,
    expected_total_halala: expectedHalala,
    reconciled_halala: reconciledHalala,
    discrepancy_halala: discrepancyHalala,
    expected_total_sar: Number((expectedHalala / 100).toFixed(2)),
    reconciled_sar: Number((reconciledHalala / 100).toFixed(2)),
    discrepancy_sar: Number((discrepancyHalala / 100).toFixed(2)),
    top_renters: byRenter.map((row) => ({
      renter_id: row.renter_id,
      usage_count: Number(row.usage_count || 0),
      total_halala: Number(row.total_halala || 0),
      total_sar: Number((Number(row.total_halala || 0) / 100).toFixed(2)),
    })),
    usage_ids: usageRows.map((row) => row.id),
  };
}

function createAlert(txDb, { settlementId = null, severity = 'warning', code, message }) {
  txDb.prepare(
    `INSERT INTO openrouter_settlement_alerts
      (id, settlement_id, severity, code, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    `oralert_${crypto.randomUUID()}`,
    settlementId,
    severity === 'critical' ? 'critical' : 'warning',
    code,
    message.slice(0, 500),
    nowIso()
  );
}

function executeOpenRouterSettlement(db, {
  periodStart,
  periodEnd,
  mode = 'invoice',
  cadence = 'daily',
  expectedTotalHalala = null,
}) {
  const cleanMode = mode === 'auto_topup' ? 'auto_topup' : 'invoice';
  const cleanCadence = typeof cadence === 'string' ? cadence.slice(0, 24) : 'daily';
  const summary = computeDryRunSummary(db, { periodStart, periodEnd, expectedTotalHalala });
  const usageIds = summary.usage_ids;
  const createdAt = nowIso();

  if (usageIds.length === 0) {
    return {
      settlement: null,
      summary,
      invoice: null,
      topup: null,
      alerts: [],
      message: 'No pending OpenRouter usage records for the selected period',
    };
  }

  const settlementId = `orset_${crypto.randomUUID()}`;
  let invoice = null;
  let topup = null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO openrouter_settlements
        (id, period_start, period_end, cadence, settlement_mode, expected_total_halala, reconciled_halala, discrepancy_halala, usage_count, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAR', 'processing', ?)`
    ).run(
      settlementId,
      summary.period_start,
      summary.period_end,
      cleanCadence,
      cleanMode,
      summary.expected_total_halala,
      summary.reconciled_halala,
      summary.discrepancy_halala,
      summary.usage_count,
      createdAt
    );

    const markUsageStmt = db.prepare(
      `UPDATE openrouter_usage_ledger
          SET settlement_status = 'settled',
              settlement_id = ?
        WHERE id = ?
          AND settlement_status = 'pending'`
    );
    const usageFetchStmt = db.prepare(
      'SELECT id, renter_id, provider_id, cost_halala FROM openrouter_usage_ledger WHERE id = ?'
    );
    const itemInsertStmt = db.prepare(
      `INSERT INTO openrouter_settlement_items
        (id, settlement_id, usage_id, renter_id, provider_id, cost_halala, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const usageId of usageIds) {
      const updated = markUsageStmt.run(settlementId, usageId);
      if (!updated.changes) {
        throw new Error(`usage row became unavailable during settlement: ${usageId}`);
      }
      const usage = usageFetchStmt.get(usageId);
      itemInsertStmt.run(
        `oritem_${crypto.randomUUID()}`,
        settlementId,
        usage.id,
        usage.renter_id,
        usage.provider_id || null,
        usage.cost_halala,
        createdAt
      );
    }

    if (cleanMode === 'invoice') {
      const invoiceId = `orinv_${crypto.randomUUID()}`;
      const dueAt = new Date(Date.now() + (7 * 24 * 3600 * 1000)).toISOString();
      db.prepare(
        `INSERT INTO openrouter_settlement_invoices
          (id, settlement_id, amount_halala, currency, due_at, status, created_at)
         VALUES (?, ?, ?, 'SAR', ?, 'issued', ?)`
      ).run(invoiceId, settlementId, summary.reconciled_halala, dueAt, createdAt);
      invoice = db.prepare('SELECT * FROM openrouter_settlement_invoices WHERE id = ?').get(invoiceId);
    } else {
      const topupId = `ortopup_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO openrouter_settlement_topups
          (id, settlement_id, amount_halala, currency, status, created_at)
         VALUES (?, ?, ?, 'SAR', 'queued', ?)`
      ).run(topupId, settlementId, summary.reconciled_halala, createdAt);
      topup = db.prepare('SELECT * FROM openrouter_settlement_topups WHERE id = ?').get(topupId);
    }

    const finalStatus = summary.discrepancy_halala === 0 ? 'completed' : 'partial';
    db.prepare(
      `UPDATE openrouter_settlements
          SET status = ?, completed_at = ?, failure_reason = ?
        WHERE id = ?`
    ).run(
      finalStatus,
      nowIso(),
      summary.discrepancy_halala === 0 ? null : 'Discrepancy between expected and reconciled totals',
      settlementId
    );

    if (summary.discrepancy_halala !== 0) {
      createAlert(db, {
        settlementId,
        severity: 'critical',
        code: 'SETTLEMENT_DISCREPANCY',
        message: `Expected ${summary.expected_total_halala} halala but reconciled ${summary.reconciled_halala} halala`,
      });
    }
  });

  try {
    tx();
  } catch (error) {
    try {
      db.prepare(
        `INSERT OR REPLACE INTO openrouter_settlements
          (id, period_start, period_end, cadence, settlement_mode, expected_total_halala, reconciled_halala, discrepancy_halala, usage_count, currency, status, failure_reason, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAR', 'failed', ?, ?, ?)`
      ).run(
        settlementId,
        summary.period_start,
        summary.period_end,
        cleanCadence,
        cleanMode,
        summary.expected_total_halala,
        summary.reconciled_halala,
        summary.discrepancy_halala,
        summary.usage_count,
        error.message.slice(0, 500),
        createdAt,
        nowIso()
      );
      createAlert(db, {
        settlementId,
        severity: 'critical',
        code: 'SETTLEMENT_EXECUTION_FAILED',
        message: error.message,
      });
    } catch (_) {}

    return {
      settlement: db.prepare('SELECT * FROM openrouter_settlements WHERE id = ?').get(settlementId),
      summary,
      invoice: null,
      topup: null,
      alerts: db.prepare('SELECT * FROM openrouter_settlement_alerts WHERE settlement_id = ? ORDER BY created_at ASC').all(settlementId),
      error: error.message,
    };
  }

  return {
    settlement: db.prepare('SELECT * FROM openrouter_settlements WHERE id = ?').get(settlementId),
    summary,
    invoice,
    topup,
    alerts: db.prepare('SELECT * FROM openrouter_settlement_alerts WHERE settlement_id = ? ORDER BY created_at ASC').all(settlementId),
  };
}

module.exports = {
  recordOpenRouterUsage,
  computeDryRunSummary,
  executeOpenRouterSettlement,
};
