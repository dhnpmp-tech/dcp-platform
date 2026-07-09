'use strict';

const MINIMUM_BALANCE_READINESS_VERSION = 'dcp.minimum_balance_readiness.v1';

function sarFromHalala(halala) {
  return Number((Number(halala || 0) / 100).toFixed(2));
}

function buildMinimumBalanceReadiness({
  now = new Date(),
  renter = {},
  paidCreditState = {},
  budgetStatus = null,
} = {}) {
  const balanceHalala = normalizeHalala(renter.balance_halala);
  const paidAvailableHalala = normalizeHalala(paidCreditState.paid_available_halala);
  const paidFundingHalala = normalizeHalala(paidCreditState.paid_funding_halala);
  const onDemandCommittedHalala = normalizeHalala(paidCreditState.on_demand_committed_halala);
  const v1CapHalala = normalizeHalala(budgetStatus?.v1_inference?.monthly_spend_cap_halala);
  const v1RemainingCapHalala = budgetStatus?.v1_inference?.remaining_cap_halala == null
    ? null
    : normalizeHalala(budgetStatus.v1_inference.remaining_cap_halala);

  return {
    object: 'minimum_balance_readiness',
    version: MINIMUM_BALANCE_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'read_only_policy_contract',
    endpoints: {
      readiness: 'GET /api/renters/me/minimum-balances',
      balance: 'GET /api/renters/balance',
      budget_status: 'GET /api/renters/me/budget-status',
      pod_launch: 'POST /api/pods',
      v1_inference: 'POST /v1/chat/completions',
      batch_readiness: 'GET /api/batches/readiness',
      lora_readiness: 'GET /api/lora/readiness',
      eval_readiness: 'GET /api/evals/readiness',
    },
    account: {
      balance_halala: balanceHalala,
      balance_sar: sarFromHalala(balanceHalala),
      paid_funding_halala: paidFundingHalala,
      paid_funding_sar: sarFromHalala(paidFundingHalala),
      on_demand_committed_halala: onDemandCommittedHalala,
      on_demand_committed_sar: sarFromHalala(onDemandCommittedHalala),
      paid_available_halala: paidAvailableHalala,
      paid_available_sar: sarFromHalala(paidAvailableHalala),
      v1_monthly_spend_cap_halala: v1CapHalala,
      v1_monthly_spend_cap_sar: sarFromHalala(v1CapHalala),
      v1_remaining_cap_halala: v1RemainingCapHalala,
      v1_remaining_cap_sar: v1RemainingCapHalala == null ? null : sarFromHalala(v1RemainingCapHalala),
    },
    rails: {
      v1_inference: {
        status: 'live_estimate_preflight',
        minimum_type: 'estimated_request_cost',
        minimum_balance_halala: null,
        available_balance_halala: balanceHalala,
        monthly_cap_remaining_halala: v1RemainingCapHalala,
        enforcement_live: true,
        notes: 'Each request is preflighted against the estimated token cost before provider dispatch.',
      },
      scoped_key_inference: {
        status: 'live_optional_key_cap',
        minimum_type: 'estimated_request_cost_and_optional_key_cap',
        minimum_balance_halala: null,
        enforcement_live: true,
        notes: 'Scoped key monthly caps are default-unlimited and enforced only when a positive cap is set.',
      },
      gpu_pods_provider_supply: {
        status: 'live_quote_preflight',
        minimum_type: 'quoted_pod_cost',
        minimum_balance_halala: null,
        available_balance_halala: balanceHalala,
        enforcement_live: true,
        notes: 'DCP/community/provider supply can use available account credit; idempotent money routes return 402 before launch if the quote cannot be covered.',
      },
      gpu_pods_on_demand_supply: {
        status: 'live_paid_credit_preflight',
        minimum_type: 'quoted_pod_cost_paid_credit',
        minimum_paid_credit_halala: null,
        paid_available_halala: paidAvailableHalala,
        enforcement_live: true,
        notes: 'On-demand GPUs require paid available credit equal to the launch quote; trial credit does not unlock this supply tier.',
      },
      volumes: {
        status: 'live_quote_preflight',
        minimum_type: 'quoted_monthly_volume_price',
        minimum_balance_halala: null,
        available_balance_halala: balanceHalala,
        enforcement_live: true,
        notes: 'Volume rent/renewal checks the quoted storage price before charging; renewal may suspend on insufficient balance.',
      },
      batch_inference: {
        status: 'contract_only',
        minimum_type: 'per_line_settlement_preflight',
        minimum_balance_halala: null,
        enforcement_live: false,
        notes: 'Batch execution and discounted settlement remain gated; the contract proof checks no partial billing on insufficient balance.',
      },
      prompt_cache_discount: {
        status: 'measurement_only',
        minimum_type: 'normal_v1_estimate_until_discount_policy',
        minimum_balance_halala: null,
        enforcement_live: false,
        notes: 'Prompt-cache discounts are not applied until provider hit evidence and settlement policy proof exist.',
      },
      lora_training: {
        status: 'metadata_and_artifact_proof_only',
        minimum_type: 'training_budget_policy_pending',
        minimum_balance_halala: null,
        enforcement_live: false,
        notes: 'Managed LoRA/Tinker-style training is not live; training-step billing/no-billing policy must be proven before any charge.',
      },
      adapter_deployments: {
        status: 'load_proof_required',
        minimum_type: 'endpoint_quote_and_adapter_billing_policy_pending',
        minimum_balance_halala: null,
        enforcement_live: false,
        notes: 'Adapter serving, endpoint smoke, route traffic, and adapter billing remain gated by vLLM load proof.',
      },
      evaluators: {
        status: 'readiness_contract_only',
        minimum_type: 'eval_job_billing_policy_pending',
        minimum_balance_halala: null,
        enforcement_live: false,
        notes: 'Customer eval jobs are not live and do not bill until schema, worker, artifact, baseline, and money-policy proof exists.',
      },
    },
    claim_guards: {
      mutates_balance: false,
      creates_payment: false,
      creates_pod: false,
      dispatches_inference: false,
      creates_batch: false,
      creates_lora_training_job: false,
      creates_adapter_deployment: false,
      creates_eval_job: false,
      enables_discount: false,
      changes_enforcement: false,
    },
    next_actions: [
      'Use this packet in renter UI and agent docs before changing any minimum-balance enforcement.',
      'Attach concrete quote examples per product rail before publishing comparison pricing.',
      'Keep LoRA, adapter, batch discount, prompt-cache discount, and eval billing blocked until their live proof commands pass.',
    ],
  };
}

function normalizeHalala(value) {
  const n = Math.trunc(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

module.exports = {
  MINIMUM_BALANCE_READINESS_VERSION,
  buildMinimumBalanceReadiness,
  sarFromHalala,
};
