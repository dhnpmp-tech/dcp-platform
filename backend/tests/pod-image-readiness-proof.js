#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  LORA_PROVIDER_HOST_GATE,
  POD_IMAGE_CONTRACT_GATE,
  POD_IMAGE_READINESS_VERSION,
  buildPodImageReadiness,
} = require('../src/services/podImageReadiness');

const PROOF_PREFIX = 'pod-image-readiness-proof';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJson(outDir, name, payload) {
  ensureDir(outDir);
  const file = path.join(outDir, `${name}-${toStamp()}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

function buildProof() {
  const readiness = buildPodImageReadiness(new Date());
  const checks = [
    {
      id: 'public_pod_image_readiness_route_declared',
      pass: readiness.endpoints.readiness === 'GET /api/pods/images/readiness',
    },
    {
      id: 'ci_safe_contract_gate_declared',
      pass: readiness.contract_check.status === 'ci_safe'
        && readiness.contract_check.command === 'npm run pod-images:verify-contracts'
        && readiness.contract_check.local_roadmap_gate === POD_IMAGE_CONTRACT_GATE
        && readiness.contract_check.error_count === 0,
    },
    {
      id: 'lora_image_contract_declared',
      pass: readiness.lora_image?.alias === 'lora'
        && readiness.lora_image?.tag === 'dcp-compute:lora'
        && readiness.lora_image?.smoke_script === 'verify-lora-pod-image.sh'
        && readiness.lora_image?.examples?.includes('examples/lora_stack_smoke.py')
        && readiness.lora_image?.examples?.includes('examples/lora_sft_scaffold.py'),
    },
    {
      id: 'provider_host_gate_blocked',
      pass: readiness.provider_host_acceptance.status === 'blocked_external'
        && readiness.provider_host_acceptance.command === 'npm run proof:lora-pod-image'
        && readiness.provider_host_acceptance.live_acceptance_gate === LORA_PROVIDER_HOST_GATE
        && readiness.provider_host_acceptance.blocked_on.includes('provider GPU host')
        && readiness.provider_host_acceptance.blocked_on.includes('Docker with NVIDIA runtime')
        && readiness.provider_host_acceptance.blocked_on.includes('built dcp-compute:lora image'),
    },
    {
      id: 'provider_build_and_verify_commands_declared',
      pass: readiness.build_plan.build_command === 'DCP_POD_IMAGE_TARGETS=lora ./build-pod-images.sh'
        && readiness.build_plan.direct_verify_command === './verify-lora-pod-image.sh dcp-compute:lora'
        && readiness.build_plan.repo_verify_command === 'npm run proof:lora-pod-image',
    },
    {
      id: 'no_runtime_or_claim_mutation',
      pass: readiness.claim_guards.builds_image === false
        && readiness.claim_guards.runs_docker === false
        && readiness.claim_guards.launches_pod === false
        && readiness.claim_guards.changes_provider_selection === false
        && readiness.claim_guards.changes_billing === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.claims_lora_pod_image_gpu_ready === false
        && readiness.claim_guards.claims_fine_tuning_ready_pods === false,
    },
  ];

  return {
    proof: PROOF_PREFIX,
    version: POD_IMAGE_READINESS_VERSION,
    generated_at: new Date().toISOString(),
    command: 'npm run proof:pod-image-readiness',
    readiness,
    checks,
    pass: checks.every((check) => check.pass),
  };
}

function main() {
  const report = buildProof();
  const outputDir = process.env.DCP_POD_IMAGE_READINESS_PROOF_OUTPUT_DIR
    || path.resolve(__dirname, '../../docs/reports/reliability/pod-image-readiness');
  const file = writeJson(outputDir, PROOF_PREFIX, report);
  console.log(JSON.stringify({
    proof: report.proof,
    version: report.version,
    pass: report.pass,
    checks: report.checks.length,
    output: path.relative(path.resolve(__dirname, '../..'), file),
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProof,
};
