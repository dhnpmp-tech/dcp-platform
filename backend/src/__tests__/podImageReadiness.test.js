'use strict';

const express = require('express');
const request = require('supertest');
const {
  LORA_PROVIDER_HOST_GATE,
  POD_IMAGE_CONTRACT_GATE,
  POD_IMAGE_READINESS_VERSION,
  buildPodImageReadiness,
} = require('../services/podImageReadiness');
const podsRouter = require('../routes/pods');

describe('pod image readiness', () => {
  test('describes CI-safe pod image contracts and blocked provider-host LoRA proof', () => {
    const readiness = buildPodImageReadiness(new Date('2026-07-09T15:05:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'pod_image_readiness',
      version: POD_IMAGE_READINESS_VERSION,
      generated_at: '2026-07-09T15:05:00.000Z',
      current_mode: 'ci_contract_ready_provider_host_blocked',
      endpoints: {
        readiness: 'GET /api/pods/images/readiness',
        pod_trial_routing: 'GET /api/pods/trial-routing/readiness',
        launch: 'POST /api/pods',
      },
      contract_check: {
        status: 'ci_safe',
        command: 'npm run pod-images:verify-contracts',
        local_roadmap_gate: POD_IMAGE_CONTRACT_GATE,
        contract: 'dcp.pod_image_contracts.v1',
        contract_version: '2026-07-08',
        error_count: 0,
        errors: [],
      },
      provider_host_acceptance: {
        status: 'blocked_external',
        command: 'npm run proof:lora-pod-image',
        live_acceptance_gate: LORA_PROVIDER_HOST_GATE,
        report_contract: 'dcp.lora_pod_image_proof.v1',
        artifact_pattern: 'docs/reports/reliability/lora-pod-image-proof-*.json',
        accepted_verdict: 'PASS',
        dry_run_verdict: 'DRY_RUN',
        acceptance_requirements: {
          provider_gpu_host: true,
          docker_nvidia_runtime: true,
          built_image: 'dcp-compute:lora',
          require_gpu: '1',
          accepted_verdict: 'PASS',
          dry_run_verdict: 'DRY_RUN',
        },
      },
      build_plan: {
        build_command: 'DCP_POD_IMAGE_TARGETS=lora ./build-pod-images.sh',
        direct_verify_command: './verify-lora-pod-image.sh dcp-compute:lora',
        repo_verify_command: 'npm run proof:lora-pod-image',
      },
      claim_guards: {
        readiness_contract_live: true,
        builds_image: false,
        runs_docker: false,
        requires_gpu_host_for_acceptance: true,
        claims_lora_pod_image_gpu_ready: false,
        claims_fine_tuning_ready_pods: false,
        launches_pod: false,
        changes_provider_selection: false,
        changes_billing: false,
        mutates_balance: false,
        exposes_vendor_or_provider: false,
      },
    });

    expect(readiness.images.map((image) => image.alias).sort()).toEqual([
      'cuda',
      'lora',
      'pytorch',
      'ubuntu',
      'vllm',
    ]);
    expect(readiness.lora_image).toMatchObject({
      alias: 'lora',
      tag: 'dcp-compute:lora',
      dockerfile: 'dcp-lora.Dockerfile',
      requirements: 'requirements-lora.txt',
      smoke_script: 'verify-lora-pod-image.sh',
    });
    expect(readiness.lora_image.examples).toEqual(expect.arrayContaining([
      'examples/lora_stack_smoke.py',
      'examples/lora_sft_scaffold.py',
    ]));
    expect(readiness.lora_image.required_smoke_modules).toEqual(expect.arrayContaining([
      'torch',
      'transformers',
      'peft',
      'vllm',
    ]));
    expect(readiness.provider_host_acceptance.blocked_on).toEqual(expect.arrayContaining([
      'provider GPU host',
      'Docker with NVIDIA runtime',
      'built dcp-compute:lora image',
    ]));
    expect(readiness.provider_host_acceptance.requires_report_fields).toEqual(expect.arrayContaining([
      'contract=dcp.lora_pod_image_proof.v1',
      'verdict=PASS',
      'generated_at',
      'acceptance_gate=lora_pod_image_provider_host',
      'require_gpu=1',
    ]));
  });

  test('exposes the pod image readiness route without renter authentication', async () => {
    const app = express();
    app.use('/api/pods', podsRouter);

    const res = await request(app).get('/api/pods/images/readiness').expect(200);

    expect(res.body).toMatchObject({
      object: 'pod_image_readiness',
      version: POD_IMAGE_READINESS_VERSION,
      contract_check: {
        status: 'ci_safe',
        local_roadmap_gate: POD_IMAGE_CONTRACT_GATE,
      },
      lora_image: {
        alias: 'lora',
        tag: 'dcp-compute:lora',
      },
      provider_host_acceptance: {
        status: 'blocked_external',
        live_acceptance_gate: LORA_PROVIDER_HOST_GATE,
        accepted_verdict: 'PASS',
        dry_run_verdict: 'DRY_RUN',
      },
      claim_guards: {
        launches_pod: false,
        builds_image: false,
        runs_docker: false,
        claims_lora_pod_image_gpu_ready: false,
      },
    });
  });
});
