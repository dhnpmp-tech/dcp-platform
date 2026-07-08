'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  LIVE_ACCEPTANCE_GATES,
  runLiveAcceptanceGateStatus,
  validateReport,
} = require('../../../scripts/run-live-acceptance-gate-status');

describe('live acceptance gate status script', () => {
  test('writes a CI-safe blocked-gate status packet', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-status-'));
    const report = runLiveAcceptanceGateStatus({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.mode).toBe('ci_safe_status_packet');
    expect(report.summary).toMatchObject({
      total: LIVE_ACCEPTANCE_GATES.length,
      blocked: LIVE_ACCEPTANCE_GATES.length,
      command_available: 4,
      missing_acceptance_command: LIVE_ACCEPTANCE_GATES.length - 4,
      capability_claim_allowed: 0,
    });
    expect(report.gates.map((gate) => gate.id)).toEqual([
      'workspace_pod_live_launch',
      'lora_pod_image_provider_host',
      'anthropic_sse_live',
      'prompt_cache_provider_discount_smoke',
      'batch_live_execution_discount_smoke',
      'lora_gpu_training_artifact_proof',
      'adapter_vllm_load_billing_smoke',
      'dcp_agent_reconciliation',
    ]);
    expect(report.gates.find((gate) => gate.id === 'workspace_pod_live_launch')).toMatchObject({
      acceptance_state: 'blocked',
      acceptance_command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['funded renter key', 'launchable GPU capacity']),
    });
    expect(report.gates.find((gate) => gate.id === 'lora_pod_image_provider_host')).toMatchObject({
      acceptance_command: 'npm run proof:lora-pod-image',
      command_available: true,
      blocked_on: expect.arrayContaining(['provider GPU host']),
    });
    expect(report.gates.find((gate) => gate.id === 'anthropic_sse_live')).toMatchObject({
      acceptance_command: 'DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse',
      command_available: true,
      blocked_on: expect.arrayContaining(['funded inference smoke principal']),
    });
    expect(report.gates.find((gate) => gate.id === 'prompt_cache_provider_discount_smoke')).toMatchObject({
      acceptance_state: 'blocked',
      acceptance_command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['provider cache-hit evidence', 'settlement discount policy approval']),
    });
    for (const id of [
      'batch_live_execution_discount_smoke',
      'lora_gpu_training_artifact_proof',
      'adapter_vllm_load_billing_smoke',
    ]) {
      expect(report.gates.find((gate) => gate.id === id)).toMatchObject({
        acceptance_state: 'blocked_missing_acceptance_command',
        acceptance_command: null,
        command_available: false,
        capability_claim_allowed: false,
      });
    }
    expect(report.gates.find((gate) => gate.id === 'dcp_agent_reconciliation')).toMatchObject({
      acceptance_state: 'blocked_maintenance_window',
      acceptance_command: null,
      command_available: false,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['controlled maintenance window']),
    });
    expect(report.validation_failures).toEqual([]);
    expect(fs.existsSync(path.join(outputDir, 'live-acceptance-gate-status-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'live-acceptance-gate-status-latest.md'))).toBe(true);
  });

  test('fails validation if a blocked gate would allow product claims', () => {
    const report = {
      gates: [{
        id: 'unsafe_gate',
        lane: 'Inference',
        product_area: 'Unsafe',
        acceptance_state: 'passed',
        acceptance_command: null,
        command_available: false,
        blocked_on: [],
        capability_claim_allowed: true,
      }],
    };

    expect(validateReport(report)).toEqual(expect.arrayContaining([
      'unsafe_gate must remain blocked until live evidence exists',
      'unsafe_gate must not allow capability claims',
      'unsafe_gate must name blocked inputs',
    ]));
  });
});
