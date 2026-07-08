'use strict';

const { paymentRequiredPayload } = require('../lib/error-response');

const SUPPLY_TIERS = Object.freeze({
  DCP_OWNED: 'dcp_owned',
  PROVIDER: 'provider',
  ON_DEMAND: 'on_demand',
});

const VALID_SUPPLY_TIERS = new Set(Object.values(SUPPLY_TIERS));

function toHalala(value) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeSupplyTier(value) {
  const tier = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_SUPPLY_TIERS.has(tier) ? tier : null;
}

function getDcpOwnedProviderIds() {
  return new Set(
    String(process.env.DCP_OWNED_PROVIDER_IDS || '')
      .split(',')
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isFinite(entry) && entry > 0)
  );
}

function getProviderSupplyTier(provider) {
  if (Number(provider?.is_burst) === 1) return SUPPLY_TIERS.ON_DEMAND;

  const explicit = normalizeSupplyTier(provider?.supply_tier);
  if (explicit) return explicit;

  const providerId = Number.parseInt(provider?.id, 10);
  if (Number.isFinite(providerId) && getDcpOwnedProviderIds().has(providerId)) {
    return SUPPLY_TIERS.DCP_OWNED;
  }

  return SUPPLY_TIERS.PROVIDER;
}

function computePaidAvailableCredit({ balanceHalala, paidFundingHalala, onDemandCommittedHalala }) {
  const balance = toHalala(balanceHalala);
  const paidFunding = toHalala(paidFundingHalala);
  const committed = toHalala(onDemandCommittedHalala);
  const uncommittedPaidFunding = Math.max(0, paidFunding - committed);
  return Math.min(balance, uncommittedPaidFunding);
}

function getPaidFundingHalala(db, renterId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(
              CASE
                WHEN status = 'paid' THEN amount_halala
                WHEN status = 'refunded' THEN
                  CASE
                    WHEN refund_amount_halala IS NULL THEN 0
                    WHEN amount_halala - refund_amount_halala > 0 THEN amount_halala - refund_amount_halala
                    ELSE 0
                  END
                ELSE 0
              END
            ), 0) AS paid_funding_halala
       FROM payments
      WHERE renter_id = ?`
  ).get(renterId);
  return toHalala(row?.paid_funding_halala);
}

function getOnDemandCommittedHalala(db, renterId) {
  const committedSql = (predicate) => `
    SELECT COALESCE(SUM(
              CASE
                WHEN j.status IN ('pending','queued','assigned','pulling','running')
                  THEN COALESCE(j.cost_halala, 0)
                WHEN j.status IN ('completed','stopped')
                  THEN COALESCE(j.actual_cost_halala, j.cost_halala, 0)
                ELSE 0
              END
            ), 0) AS on_demand_committed_halala
       FROM jobs j
       JOIN providers p ON p.id = j.provider_id
      WHERE j.renter_id = ?
        AND j.job_type = 'interactive_pod'
        AND (${predicate})`;
  let row;
  try {
    row = db.prepare(committedSql(
      "COALESCE(p.is_burst, 0) = 1 OR lower(COALESCE(NULLIF(trim(p.supply_tier), ''), '')) = 'on_demand'"
    )).get(renterId);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('supply_tier')) throw error;
    row = db.prepare(committedSql('COALESCE(p.is_burst, 0) = 1')).get(renterId);
  }
  return toHalala(row?.on_demand_committed_halala);
}

function getRenterPaidCreditState(db, renter) {
  const renterId = renter?.id;
  const balanceHalala = toHalala(renter?.balance_halala);
  const paidFundingHalala = getPaidFundingHalala(db, renterId);
  const onDemandCommittedHalala = getOnDemandCommittedHalala(db, renterId);
  const paidAvailableHalala = computePaidAvailableCredit({
    balanceHalala,
    paidFundingHalala,
    onDemandCommittedHalala,
  });

  return {
    balance_halala: balanceHalala,
    paid_funding_halala: paidFundingHalala,
    on_demand_committed_halala: onDemandCommittedHalala,
    paid_available_halala: paidAvailableHalala,
  };
}

function buildOnDemandRequiresPaidCreditPayload({ quoteHalala, creditState, durationMinutes, ratePerGpuSecond }) {
  const paidAvailable = toHalala(creditState?.paid_available_halala);
  const required = toHalala(quoteHalala);
  const sarPerHour = Number.isFinite(Number(ratePerGpuSecond))
    ? Number((Number(ratePerGpuSecond) * 3600 / 100).toFixed(2))
    : null;
  const duration = Math.max(0, Number.parseInt(durationMinutes, 10) || 0);
  const message = [
    'This GPU requires prepaid credit.',
    'Trial credit can launch DCP and community GPUs, but not on-demand GPUs.',
    `Paid credit available: ${(paidAvailable / 100).toFixed(2)} SAR; required: ${(required / 100).toFixed(2)} SAR for ${duration} minutes.`,
    'Add credit and retry; unused prepaid time is refunded when you stop the pod early.',
  ].join(' ');

  return {
    ...paymentRequiredPayload({
      requiredHalala: required,
      balanceHalala: paidAvailable,
      code: 'on_demand_requires_prepaid_credit',
      message,
    }),
    supply_tier: SUPPLY_TIERS.ON_DEMAND,
    paid_credit_required: true,
    paid_available_halala: paidAvailable,
    paid_available_sar: Number((paidAvailable / 100).toFixed(2)),
    ...(sarPerHour != null ? { rate_sar_per_hour: sarPerHour } : {}),
  };
}

function evaluatePodLaunchCreditPolicy({ db, renter, provider, quoteHalala, durationMinutes, ratePerGpuSecond }) {
  const supplyTier = getProviderSupplyTier(provider);
  if (supplyTier !== SUPPLY_TIERS.ON_DEMAND) {
    return { allowed: true, supply_tier: supplyTier };
  }

  const creditState = getRenterPaidCreditState(db, renter);
  if (creditState.paid_available_halala < toHalala(quoteHalala)) {
    return {
      allowed: false,
      status: 402,
      supply_tier: supplyTier,
      credit_state: creditState,
      payload: buildOnDemandRequiresPaidCreditPayload({
        quoteHalala,
        creditState,
        durationMinutes,
        ratePerGpuSecond,
      }),
    };
  }

  return { allowed: true, supply_tier: supplyTier, credit_state: creditState };
}

module.exports = {
  SUPPLY_TIERS,
  computePaidAvailableCredit,
  evaluatePodLaunchCreditPolicy,
  getOnDemandCommittedHalala,
  getPaidFundingHalala,
  getProviderSupplyTier,
  getRenterPaidCreditState,
  normalizeSupplyTier,
};
