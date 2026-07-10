'use strict';

const { verifyContracts } = require('../scripts/verify-pod-image-contracts');

const POD_IMAGE_READINESS_VERSION = 'dcp.pod_image_readiness.v1';
const LORA_IMAGE_ALIAS = 'lora';
const LORA_PROVIDER_HOST_GATE = 'lora_pod_image_provider_host';
const POD_IMAGE_CONTRACT_GATE = 'pod_image_contracts';

function publicImageView(image) {
  return {
    alias: image.alias,
    tag: image.tag,
    dockerfile: image.dockerfile,
    bootstrap: image.bootstrap,
    ships_jupyter: image.ships_jupyter === true,
    description: image.description,
  };
}

function findLoraImage(manifest) {
  return (manifest?.images || []).find((image) => image.alias === LORA_IMAGE_ALIAS) || null;
}

function buildPodImageReadiness(now = new Date()) {
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const result = verifyContracts();
  const manifest = result.manifest;
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const lora = findLoraImage(manifest);
  const contractReady = errors.length === 0;

  return {
    object: 'pod_image_readiness',
    version: POD_IMAGE_READINESS_VERSION,
    generated_at: generatedAt,
    current_mode: contractReady
      ? 'ci_contract_ready_provider_host_blocked'
      : 'contract_drift_detected',
    endpoints: {
      readiness: 'GET /api/pods/images/readiness',
      pod_trial_routing: 'GET /api/pods/trial-routing/readiness',
      launch: 'POST /api/pods',
    },
    contract_check: {
      status: contractReady ? 'ci_safe' : 'failed',
      command: 'npm run pod-images:verify-contracts',
      local_roadmap_gate: POD_IMAGE_CONTRACT_GATE,
      contract: manifest?.contract || null,
      contract_version: manifest?.version || null,
      image_count: Array.isArray(manifest?.images) ? manifest.images.length : 0,
      error_count: errors.length,
      errors,
    },
    images: Array.isArray(manifest?.images) ? manifest.images.map(publicImageView) : [],
    lora_image: lora ? {
      alias: lora.alias,
      tag: lora.tag,
      dockerfile: lora.dockerfile,
      requirements: lora.requirements,
      examples: Array.isArray(lora.examples) ? lora.examples : [],
      smoke_script: lora.smoke_script,
      required_packages: Array.isArray(lora.required_packages) ? lora.required_packages : [],
      required_smoke_modules: Array.isArray(lora.required_smoke_modules) ? lora.required_smoke_modules : [],
    } : null,
    provider_host_acceptance: {
      status: 'blocked_external',
      command: 'npm run proof:lora-pod-image',
      live_acceptance_gate: LORA_PROVIDER_HOST_GATE,
      blocked_on: [
        'provider GPU host',
        'Docker with NVIDIA runtime',
        'built dcp-compute:lora image',
      ],
      accepted_verdict: 'PASS',
      dry_run_verdict: 'DRY_RUN',
      requires_report_fields: [
        'contract=dcp.lora_pod_image_proof.v1',
        'verdict=PASS',
        'generated_at',
        'acceptance_gate=lora_pod_image_provider_host',
        'require_gpu=1',
      ],
      acceptance_requirements: {
        provider_gpu_host: true,
        docker_nvidia_runtime: true,
        built_image: 'dcp-compute:lora',
        require_gpu: '1',
        accepted_verdict: 'PASS',
        dry_run_verdict: 'DRY_RUN',
      },
      verifies: [
        'docker image inspect dcp-compute:lora',
        'fresh GPU container imports LoRA/QLoRA/vLLM stack',
        'offline SFT scaffold construction',
        'GPU-host runtime wiring',
      ],
      report_contract: 'dcp.lora_pod_image_proof.v1',
      artifact_pattern: 'docs/reports/reliability/lora-pod-image-proof-*.json',
    },
    build_plan: {
      provider_host_directory: '/root/dc1-platform/backend/docker-templates',
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
    evidence: {
      source_files: [
        'backend/docker-templates/pod-image-contracts.json',
        'backend/src/scripts/verify-pod-image-contracts.js',
        'backend/docker-templates/verify-lora-pod-image.sh',
        'backend/src/services/podImageReadiness.js',
        'backend/src/routes/pods.js',
      ],
      tests: [
        'backend/src/__tests__/podImageContracts.test.js',
        'backend/src/__tests__/podImageReadiness.test.js',
        'backend/src/__tests__/liveAcceptanceGateStatusScript.test.js',
      ],
      proof_command: 'npm run proof:pod-image-readiness',
      linked_commands: [
        'npm run pod-images:verify-contracts',
        'npm run proof:lora-pod-image',
      ],
    },
    next_actions: [
      'Run npm run pod-images:verify-contracts in CI to keep aliases, Dockerfiles, examples, and smoke scripts wired.',
      'Build dcp-compute:lora on a provider GPU host before running the provider-host proof.',
      'Run npm run proof:lora-pod-image on that host and archive a verdict=PASS, require_gpu=1 report before claiming LoRA/fine-tuning pod image readiness.',
      'Keep renter-facing pod launch copy free of provider, vendor, and supply-tier identity.',
    ],
  };
}

module.exports = {
  POD_IMAGE_READINESS_VERSION,
  LORA_PROVIDER_HOST_GATE,
  POD_IMAGE_CONTRACT_GATE,
  buildPodImageReadiness,
};
