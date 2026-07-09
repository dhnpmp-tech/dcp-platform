'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  LIVE_ACCEPTANCE_GATES,
  buildLiveAcceptanceGateStatus,
  runLiveAcceptanceGateStatus,
  validateReport,
} = require('../../../scripts/run-live-acceptance-gate-status');

describe('live acceptance gate status script', () => {
  test('writes a CI-safe blocked-gate status packet', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-status-'));
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-empty-evidence-'));
    const report = runLiveAcceptanceGateStatus({ outputDir, evidenceDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.mode).toBe('ci_safe_status_packet');
    expect(report.summary).toMatchObject({
      total: LIVE_ACCEPTANCE_GATES.length,
      blocked: LIVE_ACCEPTANCE_GATES.length,
      command_available: 8,
      missing_acceptance_command: 0,
      capability_claim_allowed: 0,
      latest_evidence_found: 0,
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
    expect(report.gates.find((gate) => gate.id === 'batch_live_execution_discount_smoke')).toMatchObject({
      acceptance_state: 'blocked',
      acceptance_command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['object-store result path', 'discount policy approval']),
    });
    expect(report.gates.find((gate) => gate.id === 'lora_gpu_training_artifact_proof')).toMatchObject({
      acceptance_state: 'blocked',
      acceptance_command: 'DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['provider GPU host or pod', 'training budget window']),
    });
    expect(report.gates.find((gate) => gate.id === 'adapter_vllm_load_billing_smoke')).toMatchObject({
      acceptance_state: 'blocked',
      acceptance_command: 'DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['real adapter artifact checksum', 'dedicated endpoint capacity']),
    });
    expect(report.gates.find((gate) => gate.id === 'dcp_agent_reconciliation')).toMatchObject({
      acceptance_state: 'blocked_maintenance_window',
      acceptance_command: 'DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation',
      command_available: true,
      capability_claim_allowed: false,
      blocked_on: expect.arrayContaining(['controlled maintenance window']),
      latest_evidence: {
        found: false,
        artifact: expect.stringContaining('dcp-agent-reconciliation-latest.json'),
        verdict: null,
      },
    });
    expect(report.validation_failures).toEqual([]);
    expect(fs.existsSync(path.join(outputDir, 'live-acceptance-gate-status-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'live-acceptance-gate-status-latest.md'))).toBe(true);
  });

  test('attaches latest dcp-agent blockers without allowing capability claims', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-status-'));
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-evidence-'));
    fs.writeFileSync(path.join(evidenceDir, 'dcp-agent-reconciliation-latest.json'), JSON.stringify({
      contract: 'dcp.dcp_agent_reconciliation_status.v1',
      generated_at: '2026-07-09T18:26:58.000Z',
      verdict: 'BLOCKED',
      maintenance_required: true,
      failure: {
        code: 'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
        details: {
          blockers: [
            'local_agent_detached_head',
            'local_agent_not_on_remote_main',
            'active_local_gateway_process',
          ],
        },
      },
    }, null, 2));

    const report = runLiveAcceptanceGateStatus({ outputDir, evidenceDir });
    const dcpAgentGate = report.gates.find((gate) => gate.id === 'dcp_agent_reconciliation');

    expect(report.verdict).toBe('PASS');
    expect(report.summary.latest_evidence_found).toBe(1);
    expect(dcpAgentGate).toMatchObject({
      acceptance_state: 'blocked_maintenance_window',
      capability_claim_allowed: false,
      latest_evidence: {
        found: true,
        verdict: 'BLOCKED',
        generated_at: '2026-07-09T18:26:58.000Z',
        failure_code: 'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
        maintenance_required: true,
        blockers: expect.arrayContaining([
          'local_agent_detached_head',
          'local_agent_not_on_remote_main',
          'active_local_gateway_process',
        ]),
      },
    });
    expect(report.validation_failures).toEqual([]);

    const markdown = fs.readFileSync(path.join(outputDir, 'live-acceptance-gate-status-latest.md'), 'utf8');
    expect(markdown).toContain('latest_evidence_found: 1/8');
    expect(markdown).toContain('local_agent_detached_head');
    expect(markdown).toContain('active_local_gateway_process');
  });

  test('builds a read-only status packet without writing artifacts', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-readonly-output-'));
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-gate-readonly-evidence-'));
    fs.writeFileSync(path.join(evidenceDir, 'workspace-pod-live-proof-latest.json'), JSON.stringify({
      generated_at: '2026-07-09T18:54:00.000Z',
      verdict: 'BLOCKED',
      blocked_on: ['funded_renter_key', 'launchable_gpu_capacity'],
    }, null, 2));

    const report = buildLiveAcceptanceGateStatus({
      evidenceDir,
      outputDir,
      generatedAt: '2026-07-09T18:55:00.000Z',
    });
    const workspaceGate = report.gates.find((gate) => gate.id === 'workspace_pod_live_launch');

    expect(report.verdict).toBe('PASS');
    expect(report.generated_at).toBe('2026-07-09T18:55:00.000Z');
    expect(report.artifacts).toEqual({});
    expect(report.summary.latest_evidence_found).toBe(1);
    expect(workspaceGate.latest_evidence).toMatchObject({
      found: true,
      verdict: 'BLOCKED',
      generated_at: '2026-07-09T18:54:00.000Z',
      blockers: expect.arrayContaining(['funded_renter_key', 'launchable_gpu_capacity']),
    });
    expect(fs.readdirSync(outputDir)).toEqual([]);
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
