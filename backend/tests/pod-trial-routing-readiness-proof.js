#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  POD_TRIAL_ROUTING_READINESS_VERSION,
  buildPodTrialRoutingReadiness,
} = require('../src/services/podTrialRoutingReadiness');

const PROOF_PREFIX = 'pod-trial-routing-readiness-proof';

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
  const readiness = buildPodTrialRoutingReadiness(new Date());
  const checks = [
    {
      id: 'public_readiness_route_declared',
      pass: readiness.endpoints.readiness === 'GET /api/pods/trial-routing/readiness',
    },
    {
      id: 'trial_credit_native_capacity_declared',
      pass: readiness.routing_policy.trial_credit_allowed_supply_tiers.includes('provider')
        && readiness.routing_policy.trial_credit_allowed_supply_tiers.includes('dcp_owned'),
    },
    {
      id: 'high_demand_paid_credit_required',
      pass: readiness.routing_policy.paid_credit_required_supply_tiers.includes('on_demand')
        && readiness.routing_policy.on_paid_credit_shortfall_code === 'on_demand_requires_prepaid_credit',
    },
    {
      id: 'no_trial_or_billing_mutation',
      pass: readiness.claim_guards.changes_trial_accounting === false
        && readiness.claim_guards.changes_billing === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.launches_pod === false,
    },
    {
      id: 'no_vendor_provider_exposure',
      pass: readiness.routing_policy.provider_visibility.exposes_vendor_to_renter === false
        && readiness.routing_policy.provider_visibility.exposes_provider_id_to_renter === false
        && readiness.routing_policy.provider_visibility.exposes_supply_tier_to_renter === false,
    },
    {
      id: 'workspace_contract_and_live_gate_declared',
      pass: readiness.infrastructure_proofs.workspace_pod_contract.command === 'npm run workspace-pods:verify-contracts'
        && readiness.infrastructure_proofs.workspace_pod_contract.status === 'ci_safe'
        && readiness.infrastructure_proofs.workspace_live_acceptance.command === 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod'
        && readiness.infrastructure_proofs.workspace_live_acceptance.status === 'blocked_external',
    },
    {
      id: 'lora_pod_image_provider_host_gate_declared',
      pass: readiness.infrastructure_proofs.lora_pod_image_provider_host.command === 'npm run proof:lora-pod-image'
        && readiness.infrastructure_proofs.lora_pod_image_provider_host.status === 'blocked_external'
        && readiness.infrastructure_proofs.lora_pod_image_provider_host.blocked_on.includes('provider GPU host'),
    },
    {
      id: 'no_pod_infrastructure_overclaim',
      pass: readiness.claim_guards.claims_workspace_live_acceptance === false
        && readiness.claim_guards.claims_lora_pod_image_gpu_ready === false
        && readiness.claim_guards.claims_fine_tuning_ready_pods === false,
    },
  ];

  return {
    proof: PROOF_PREFIX,
    version: POD_TRIAL_ROUTING_READINESS_VERSION,
    generated_at: new Date().toISOString(),
    command: 'npm run proof:pod-trial-routing-readiness',
    readiness,
    checks,
    pass: checks.every((check) => check.pass),
  };
}

function main() {
  const report = buildProof();
  const outputDir = process.env.DCP_POD_TRIAL_ROUTING_PROOF_OUTPUT_DIR
    || path.resolve(__dirname, '../../docs/reports/reliability/pod-trial-routing-readiness');
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
