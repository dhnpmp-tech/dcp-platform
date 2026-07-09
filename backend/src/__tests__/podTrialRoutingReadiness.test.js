'use strict';

const express = require('express');
const request = require('supertest');
const {
  POD_TRIAL_ROUTING_READINESS_VERSION,
  buildPodTrialRoutingReadiness,
} = require('../services/podTrialRoutingReadiness');
const podsRouter = require('../routes/pods');

describe('pod trial routing readiness', () => {
  test('describes current trial and high-demand credit policy without enabling mutations', () => {
    const readiness = buildPodTrialRoutingReadiness(new Date('2026-07-09T09:45:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'pod_trial_routing_readiness',
      version: POD_TRIAL_ROUTING_READINESS_VERSION,
      current_mode: 'pod_trial_credit_policy_live',
      endpoints: {
        readiness: 'GET /api/pods/trial-routing/readiness',
        launch: 'POST /api/pods',
      },
      account_classification: {
        explicit_trial_account_tag_live: false,
        trial_credit_source: 'renters.trial_grant_halala',
        paid_credit_source: 'payments.status=paid/refunded minus active high-demand pod commitments',
      },
      routing_policy: {
        trial_credit_allowed_supply_tiers: ['dcp_owned', 'provider'],
        paid_credit_required_supply_tiers: ['on_demand'],
        on_paid_credit_shortfall_status: 402,
        on_paid_credit_shortfall_code: 'on_demand_requires_prepaid_credit',
        provider_visibility: {
          exposes_provider_id_to_renter: false,
          exposes_vendor_to_renter: false,
          exposes_supply_tier_to_renter: false,
          renter_selects_gpu_type_not_machine: true,
        },
      },
      infrastructure_proofs: {
        workspace_pod_contract: {
          status: 'ci_safe',
          command: 'npm run workspace-pods:verify-contracts',
          local_roadmap_gate: 'workspace_pod_contracts',
        },
        workspace_live_acceptance: {
          status: 'blocked_external',
          command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
          live_acceptance_gate: 'workspace_pod_live_launch',
        },
        lora_pod_image_provider_host: {
          status: 'blocked_external',
          command: 'npm run proof:lora-pod-image',
          live_acceptance_gate: 'lora_pod_image_provider_host',
        },
      },
      claim_guards: {
        readiness_contract_live: true,
        changes_provider_selection: false,
        changes_billing: false,
        changes_trial_accounting: false,
        launches_pod: false,
        exposes_vendor_or_provider: false,
        claims_workspace_live_acceptance: false,
        claims_lora_pod_image_gpu_ready: false,
        claims_fine_tuning_ready_pods: false,
      },
    });
  });

  test('exposes the readiness route without renter authentication', async () => {
    const app = express();
    app.use('/api/pods', podsRouter);

    const res = await request(app).get('/api/pods/trial-routing/readiness').expect(200);

    expect(res.body).toMatchObject({
      object: 'pod_trial_routing_readiness',
      version: POD_TRIAL_ROUTING_READINESS_VERSION,
      routing_policy: {
        on_paid_credit_shortfall_code: 'on_demand_requires_prepaid_credit',
      },
      claim_guards: {
        launches_pod: false,
        mutates_balance: false,
        claims_workspace_live_acceptance: false,
        claims_lora_pod_image_gpu_ready: false,
      },
    });
    expect(res.body.infrastructure_proofs.workspace_live_acceptance.blocked_on).toEqual(expect.arrayContaining([
      'funded renter key',
      'active portable volume',
      'launchable GPU capacity',
    ]));
  });
});
