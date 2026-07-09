import { expect, test } from '@playwright/test';

test('public pods page renders contract-backed readiness gates', async ({ page }) => {
  await page.route('**/api/health/detailed', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: { online: 2, serving: 1 },
      gpu_types: [
        { type: 'NVIDIA GeForce RTX 4090', vram_gb: 24, available: true },
        { type: 'NVIDIA H100 80GB HBM3', vram_gb: 80, available: false },
      ],
    }),
  }));

  await page.route('**/api/pods/images/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'pod_image_readiness',
      version: 'dcp.pod_image_readiness.v1',
      current_mode: 'ci_contract_ready_provider_host_blocked',
      contract_check: {
        status: 'ci_safe',
        command: 'npm run pod-images:verify-contracts',
        local_roadmap_gate: 'pod_image_contracts',
        image_count: 5,
      },
      lora_image: {
        alias: 'lora',
        tag: 'dcp-compute:lora',
        required_packages: ['torch', 'transformers', 'peft', 'accelerate', 'datasets', 'bitsandbytes', 'vllm'],
      },
      provider_host_acceptance: {
        status: 'blocked_external',
        command: 'npm run proof:lora-pod-image',
        live_acceptance_gate: 'lora_pod_image_provider_host',
        blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
      },
      claim_guards: {
        claims_lora_pod_image_gpu_ready: false,
        claims_fine_tuning_ready_pods: false,
        launches_pod: false,
        mutates_balance: false,
        changes_billing: false,
      },
    }),
  }));

  await page.route('**/api/pods/trial-routing/readiness', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'pod_trial_routing_readiness',
      version: 'dcp.pod_trial_routing_readiness.v1',
      current_mode: 'pod_trial_credit_policy_live',
      account_classification: {
        explicit_trial_account_tag_live: false,
        trial_credit_source: 'renters.trial_grant_halala',
      },
      routing_policy: {
        trial_capacity_copy: 'Trial credit covers DCP/community capacity.',
        high_demand_capacity_copy: 'High-demand capacity requires paid credit.',
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
        },
        workspace_live_acceptance: {
          status: 'blocked_external',
          command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
          blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
        },
        lora_pod_image_provider_host: {
          status: 'blocked_external',
          command: 'npm run proof:lora-pod-image',
          blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
        },
      },
      claim_guards: {
        changes_provider_selection: false,
        changes_billing: false,
        changes_trial_accounting: false,
        launches_pod: false,
        mutates_balance: false,
        exposes_vendor_or_provider: false,
        claims_workspace_live_acceptance: false,
        claims_lora_pod_image_gpu_ready: false,
        claims_fine_tuning_ready_pods: false,
      },
    }),
  }));

  await page.goto('/pods');

  const readiness = page.getByLabel('Public pod readiness');
  await expect(readiness).toContainText('dcp.pod_image_readiness.v1');
  await expect(readiness).toContainText('dcp.pod_trial_routing_readiness.v1');
  await expect(readiness).toContainText('GET /api/pods/images/readiness');
  await expect(readiness).toContainText('GET /api/pods/trial-routing/readiness');
  await expect(readiness).toContainText('CI-safe pod image contract · 5 aliases');
  await expect(readiness).toContainText('npm run pod-images:verify-contracts');
  await expect(readiness).toContainText('dcp-compute:lora: blocked_external');
  await expect(readiness).toContainText('Coming next: run npm run proof:lora-pod-image on a provider GPU host');
  await expect(readiness).toContainText('Workspace contract: ci_safe');
  await expect(readiness).toContainText('DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod');
  await expect(readiness).toContainText('Trial accounts use grant-credit provenance');
  await expect(readiness).toContainText('Trial credit covers DCP/community capacity.');
  await expect(readiness).toContainText('High-demand capacity requires paid credit.');
  await expect(readiness).toContainText('False-claim guards synced');
  await expect(readiness).toContainText('no provider identity exposed');
  await expect(readiness).not.toContainText('dcp_owned');
  await expect(readiness).not.toContainText('provider_id');
});
