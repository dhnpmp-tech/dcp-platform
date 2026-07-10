'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runMinimumBalanceReadinessContractProof,
} = require('../../tests/minimum-balance-readiness-contract-proof');

describe('minimum balance readiness contract proof script', () => {
  test('writes a CI-safe proof report for read-only balance gate policy', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimum-balance-proof-'));
    const report = await runMinimumBalanceReadinessContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.readiness).toMatchObject({
      object: 'minimum_balance_readiness',
      version: 'dcp.minimum_balance_readiness.v1',
      current_mode: 'read_only_policy_contract',
      account: {
        balance_halala: 25000,
        trial_grant_halala: 2000,
        paid_funding_halala: 5000,
        on_demand_committed_halala: 1200,
        paid_available_halala: 3800,
        v1_monthly_spend_cap_halala: 5000,
        v1_remaining_cap_halala: 4700,
      },
      credit_policy: {
        current_mode: 'grant_credit_provenance_plus_paid_credit_gate',
        source_contract: 'GET /api/pods/trial-routing/readiness',
        explicit_trial_account_tag_live: false,
        derived_trial_account_state: 'trial_grant_active',
        trial_credit_source: 'renters.trial_grant_halala',
        trial_grant_halala: 2000,
        paid_available_halala: 3800,
        trial_credit_unlocks_high_demand: false,
        high_demand_requires_paid_credit: true,
      },
      trial_classification: {
        current_mode: 'derived_from_credit_provenance',
        explicit_trial_account_tag_live: false,
        analytics_lifecycle_tag_live: false,
        derived_account_state: 'trial_grant_active',
        has_trial_grant: true,
        trial_grant_halala: 2000,
        paid_available_halala: 3800,
        trial_credit_capacity_class: 'dcp_native_and_community_gpu_pool',
        high_demand_capacity_class: 'paid_credit_only',
        mutates_account_classification: false,
      },
      rails: {
        v1_inference: {
          status: 'live_estimate_preflight',
          enforcement_live: true,
        },
        gpu_pods_on_demand_supply: {
          status: 'live_paid_credit_preflight',
          paid_available_halala: 3800,
          enforcement_live: true,
        },
        batch_inference: {
          status: 'contract_only',
          enforcement_live: false,
        },
        prompt_cache_discount: {
          status: 'measurement_only',
          enforcement_live: false,
        },
        lora_training: {
          status: 'metadata_and_artifact_proof_only',
          enforcement_live: false,
        },
        adapter_deployments: {
          status: 'load_and_billing_policy_required',
          enforcement_live: false,
        },
        evaluators: {
          status: 'readiness_contract_only',
          enforcement_live: false,
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
        changes_trial_accounting: false,
        changes_account_classification: false,
        changes_paid_credit_policy: false,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'minimum-balance contract is versioned and read-only',
      'account packet exposes balance, paid credit, commitments, and v1 cap',
      'credit policy separates trial grant provenance from paid-credit gates',
      'trial classification is derived and non-mutating',
      'live rails name existing estimate and paid-credit enforcement',
      'blocked rails stay blocked until their proof commands pass',
      'claim guards prove no money or workload mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'minimum-balance-readiness-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'minimum-balance-readiness-contract-proof-latest.md'))).toBe(true);
  });
});
