'use strict';

const { SUPPLY_TIERS } = require('./podAccessPolicy');

const POD_TRIAL_ROUTING_READINESS_VERSION = 'dcp.pod_trial_routing_readiness.v1';

function buildPodTrialRoutingReadiness(now = new Date()) {
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  return {
    object: 'pod_trial_routing_readiness',
    version: POD_TRIAL_ROUTING_READINESS_VERSION,
    generated_at: generatedAt,
    current_mode: 'pod_trial_credit_policy_live',
    endpoints: {
      readiness: 'GET /api/pods/trial-routing/readiness',
      pod_images: 'GET /api/pods/images/readiness',
      launch: 'POST /api/pods',
      wallet: 'GET /api/renters/balance',
      add_credit: 'POST /api/payments/topup',
      minimum_balances: 'GET /api/renters/me/minimum-balances',
    },
    founder_answer: {
      summary: 'Trial accounts are derived from grant-credit provenance today; trial credit can use DCP/community GPU capacity, while high-demand on-demand GPUs require paid available credit.',
      questions_answered: [
        'Are trial accounts tagged?',
        'Do trial users run on DCP/community GPUs or high-demand on-demand GPUs?',
        'How are minimum balances handled before pod launch?',
      ],
      trial_account_tagging: {
        explicit_trial_account_tag_live: false,
        current_signal: 'renters.trial_grant_halala plus paid-funding state',
        customer_copy: 'No separate live trial-account tag; grant credit is the trial signal.',
        founder_next_decision: 'Add an analytics-only lifecycle tag only after confirming it does not change launch, billing, routing, or account classification.',
      },
      trial_gpu_routing: {
        trial_credit_route: 'dcp_native_and_community_gpu_pool',
        allowed_supply_tiers: [SUPPLY_TIERS.DCP_OWNED, SUPPLY_TIERS.PROVIDER],
        provider_capacity_copy: 'Trial credit covers DCP/community provider capacity when normal quote checks pass.',
        exposes_provider_identity_to_renter: false,
        exposes_supply_tier_to_renter: false,
      },
      high_demand_gpu_routing: {
        high_demand_route: 'paid_credit_only',
        paid_credit_required_supply_tiers: [SUPPLY_TIERS.ON_DEMAND],
        shortfall_status: 402,
        shortfall_code: 'on_demand_requires_prepaid_credit',
        customer_copy: 'High-demand GPUs require paid available credit before launch.',
      },
      minimum_balance_handling: {
        source_contract: 'GET /api/renters/me/minimum-balances',
        dcp_community_capacity_gate: 'quoted_pod_cost_available_balance',
        high_demand_capacity_gate: 'quoted_pod_cost_paid_available_credit',
        trial_credit_unlocks_high_demand: false,
        mutates_minimum_balance_policy: false,
      },
      claim_boundary: {
        changes_trial_accounting: false,
        changes_account_classification: false,
        changes_provider_selection: false,
        changes_billing: false,
        mutates_balance: false,
      },
    },
    account_classification: {
      explicit_trial_account_tag_live: false,
      current_mode: 'derived_from_credit_provenance',
      trial_credit_source: 'renters.trial_grant_halala',
      active_balance_source: 'renters.balance_halala',
      paid_credit_source: 'payments.status=paid/refunded minus active high-demand pod commitments',
      policy_helper: 'getRenterPaidCreditState',
      derived_states: {
        trial_grant_active: 'renters.trial_grant_halala > 0',
        no_trial_grant: 'renters.trial_grant_halala = 0',
      },
      analytics_lifecycle_tag_live: false,
      mutates_account_classification: false,
      note: 'Trial status is represented by credit provenance and paid-funding state, not by a separate account_type flag.',
    },
    routing_policy: {
      policy_helper: 'evaluatePodLaunchCreditPolicy',
      trial_credit_allowed_supply_tiers: [SUPPLY_TIERS.DCP_OWNED, SUPPLY_TIERS.PROVIDER],
      paid_credit_required_supply_tiers: [SUPPLY_TIERS.ON_DEMAND],
      trial_credit_capacity_class: 'dcp_native_and_community_gpu_pool',
      high_demand_capacity_class: 'paid_credit_only',
      high_demand_capacity_copy: 'High-demand capacity requires paid credit.',
      trial_capacity_copy: 'Trial credit covers DCP/community capacity.',
      on_paid_credit_shortfall_status: 402,
      on_paid_credit_shortfall_code: 'on_demand_requires_prepaid_credit',
      provider_visibility: {
        exposes_provider_id_to_renter: false,
        exposes_vendor_to_renter: false,
        exposes_supply_tier_to_renter: false,
        renter_selects_gpu_type_not_machine: true,
      },
    },
    enforcement_points: {
      pre_debit_gate: 'POST /api/pods resolves provider, evaluates podAccessPolicy, then debits prepaid quote only when allowed.',
      burst_flag_guard: 'is_burst=1 always resolves to on_demand and cannot be downgraded by supply_tier text.',
      paid_available_credit: 'min(balance_halala, paid_funding_halala - active_on_demand_commitments)',
      native_trial_launch: 'provider and dcp_owned supply can launch with trial/free balance when normal balance checks pass.',
    },
    infrastructure_proofs: {
      workspace_pod_contract: {
        status: 'ci_safe',
        command: 'npm run workspace-pods:verify-contracts',
        local_roadmap_gate: 'workspace_pod_contracts',
        verifies: [
          'task_spec_workspace_s3_wiring',
          'active_volume_gate',
          'daemon_restore_snapshot_calls',
        ],
      },
      workspace_live_acceptance: {
        status: 'blocked_external',
        command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
        live_acceptance_gate: 'workspace_pod_live_launch',
        blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
        verifies: [
          'presigned workspace upload',
          'pod launch',
          'Jupyter /workspace marker visibility',
          'default pod cleanup',
        ],
      },
      lora_pod_image_provider_host: {
        status: 'blocked_external',
        command: 'npm run proof:lora-pod-image',
        live_acceptance_gate: 'lora_pod_image_provider_host',
        blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
        verifies: [
          'LoRA/QLoRA/vLLM import budget',
          'offline SFT scaffold construction',
          'GPU-host runtime wiring',
        ],
      },
    },
    claim_guards: {
      readiness_contract_live: true,
      changes_provider_selection: false,
      changes_billing: false,
      changes_trial_accounting: false,
      changes_account_classification: false,
      creates_payment: false,
      mutates_balance: false,
      launches_pod: false,
      exposes_vendor_or_provider: false,
      claims_workspace_live_acceptance: false,
      claims_lora_pod_image_gpu_ready: false,
      claims_fine_tuning_ready_pods: false,
    },
    evidence: {
      source_files: [
        'backend/src/services/podAccessPolicy.js',
        'backend/src/routes/pods.js',
        'backend/src/services/podImageReadiness.js',
        'backend/docker-templates/pod-image-contracts.json',
        'backend/docker-templates/verify-lora-pod-image.sh',
        'backend/src/__tests__/podAccessPolicy.test.js',
        'backend/tests/workspace-pod-live-proof.js',
      ],
      tests: [
        'backend/src/__tests__/podAccessPolicy.test.js',
        'backend/src/__tests__/podTrialRoutingReadiness.test.js',
      ],
      proof_command: 'npm run proof:pod-trial-routing-readiness',
      linked_commands: [
        'npm run workspace-pods:verify-contracts',
        'npm run proof:pod-image-readiness',
        'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
        'npm run proof:lora-pod-image',
      ],
    },
    next_actions: [
      'Run the workspace live proof during a funded GPU-capacity window before claiming workspace-to-pod file visibility accepted.',
      'Inspect GET /api/pods/images/readiness for the LoRA pod image contract and provider-host acceptance gate.',
      'Build dcp-compute:lora on a provider GPU host and run npm run proof:lora-pod-image before claiming fine-tuning-ready pod images.',
      'Decide whether to add an explicit lifecycle trial-account flag for analytics only.',
      'Decide lifetime free-seconds accounting before enforcing trial exhaustion beyond credit provenance.',
      'Keep renter UI copy free of supply-tier, vendor, provider id, and machine identity.',
    ],
  };
}

module.exports = {
  POD_TRIAL_ROUTING_READINESS_VERSION,
  buildPodTrialRoutingReadiness,
};
